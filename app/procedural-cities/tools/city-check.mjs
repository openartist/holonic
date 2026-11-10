// city-check.mjs — headless audit of the generator's geometry contract.
//
// Runs the real pipeline (roads → blocks → building footprints → interiors)
// across every preset and several seeds, and asserts the things that made the
// old output look mashed:
//   · blocks are simple, finite and disjoint from each other
//   · every building footprint sits inside its own block
//   · no two footprints overlap (setbacks and alleys are real)
//   · floor counts respect the rule range
//   · no NaN/Infinity reaches a mesh polygon
//
//   node procedural-cities/tools/city-check.mjs

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
const docsJs = join(here, '../docs/js');
const bust = '?v=' + Date.now();
const load = name => import(pathToFileURL(join(docsJs, name)).href + bust);

const rulesMod = await load('rules.js');
const { generateRoads } = await load('roadGen.js');
const { extractBlocks, normalizePlots, plotsOverlap, pointInPolygon, pointPolyDist } = await load('plotGen.js');
const { generateHousePolygons } = await load('buildingGen.js');
const { getHouseInfo } = await load('houseBuilder.js');
const { polyOverlapProper } = await load('utils.js');

const { DEFAULTS, PRESETS, clampRules, cityConfig, buildConfig } = rulesMod;

let pass = 0, fail = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) { pass++; return true; }
  fail++;
  failures.push(`${label}${detail ? ' — ' + detail : ''}`);
  return false;
}

function areaM2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) * 0.5 * 1e-4;
}

function run(rules) {
  const t0 = performance.now();
  const roads = generateRoads(cityConfig(rules));
  const { plots, stats } = normalizePlots(extractBlocks(roads, { sidewalk: rules.sidewalk }), {
    minPlot: rules.minPlot,
    maxPlot: rules.maxPlot,
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const road of roads) for (const p of [road.p1, road.p2]) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const radius = Math.max(maxX - minX, maxY - minY) / 2 || 12000;
  const cfg = buildConfig(rules, center, radius);

  const footprints = [];
  const owners = new Map();
  for (const plot of plots) {
    if (plot.green || footprints.length >= rules.maxBuildings) continue;
    const pieces = generateHousePolygons(plot, cfg);
    for (const piece of pieces) {
      if (footprints.length >= rules.maxBuildings) break;
      footprints.push(piece);
      owners.set(piece, plot);
    }
  }

  return { roads, plots, stats, footprints, owners, cfg, ms: performance.now() - t0 };
}

function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
function bboxHit(a, b) {
  const A = bbox(a), B = bbox(b);
  return A.minX <= B.maxX && B.minX <= A.maxX && A.minY <= B.maxY && B.minY <= A.maxY;
}

const scenes = [
  { name: 'default', rules: DEFAULTS },
  ...Object.entries(PRESETS).map(([key, preset]) => ({ name: key, rules: { ...DEFAULTS, ...preset.rules } })),
];
const seeds = [42, 7, 2026];

console.log('\nPROCEDURAL CITIES — geometry audit\n');
console.log('scene    seed   roads  blocks  bldgs  tallest  ms');
console.log('------------------------------------------------');

const sampleBuildings = [];

for (const scene of scenes) {
  for (const seed of seeds) {
    const rules = clampRules({ ...scene.rules, seed });
    const out = run(rules);
    const { roads, plots, footprints, owners } = out;
    const tallest = footprints.reduce((m, f) => Math.max(m, f.height || 0), 0);
    const tag = `${scene.name}/${seed}`;

    console.log(
      `${scene.name.padEnd(8)} ${String(seed).padEnd(6)} ${String(roads.length).padEnd(6)} ` +
      `${String(plots.length).padEnd(7)} ${String(footprints.length).padEnd(6)} ` +
      `${String(tallest).padEnd(8)} ${out.ms.toFixed(0)}`
    );

    check(`${tag}: roads exist`, roads.length > 0, `${roads.length}`);
    check(`${tag}: blocks survive filtering`, plots.length > 0, `${plots.length}`);
    check(`${tag}: buildings generated`, footprints.length > 0, `${footprints.length}`);

    // 1. Every block is finite, closed and non-degenerate.
    for (const plot of plots) {
      const finite = plot.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!check(`${tag}: block vertices finite`, finite)) break;
      const area = areaM2(plot);
      check(`${tag}: block above min plot`, area >= rules.minPlot - 1, `${area.toFixed(0)} m²`);
      check(`${tag}: block is clockwise`, plot.isClockwise === true);
    }

    // 2. No block overlaps another (this is what used to stack buildings).
    let blockOverlaps = 0;
    for (let i = 0; i < plots.length; i++) {
      for (let j = i + 1; j < plots.length; j++) {
        if (!bboxHit(plots[i], plots[j])) continue;
        if (plotsOverlap(plots[i], plots[j])) blockOverlaps++;
      }
    }
    check(`${tag}: no overlapping blocks`, blockOverlaps === 0, `${blockOverlaps} pairs`);

    // 3. Every footprint lies inside its own block (allow 1 cm tolerance).
    let outside = 0;
    for (const fp of footprints) {
      const plot = owners.get(fp);
      const ok = fp.points.every(p => pointInPolygon(p, plot) || pointPolyDist(p, plot) <= 1.01);
      if (!ok) outside++;
    }
    check(`${tag}: footprints inside their block`, outside === 0, `${outside} escaping`);

    // 4. No footprint overlaps another — the mashing symptom. Uses the proper
    // crossing test: vertex containment alone misses a plus-shaped crossing.
    let fpOverlaps = 0;
    for (let i = 0; i < footprints.length; i++) {
      for (let j = i + 1; j < footprints.length; j++) {
        if (!bboxHit(footprints[i].points, footprints[j].points)) continue;
        if (polyOverlapProper(footprints[i].points, footprints[j].points)) fpOverlaps++;
      }
    }
    check(`${tag}: no overlapping footprints`, fpOverlaps === 0, `${fpOverlaps} pairs`);

    // 5. Floors respect the rules, and every footprint is above the minimum.
    for (const fp of footprints) {
      check(`${tag}: floors within range`, fp.height >= rules.minFloors && fp.height <= rules.maxFloors,
        `${fp.height}`);
      check(`${tag}: footprint above minimum`, fp.footprintM2 >= rules.minFootprint - 1,
        `${fp.footprintM2.toFixed(0)} m²`);
    }

    if (scene.name === 'midrise' && seed === 42) sampleBuildings.push(...footprints.slice(0, 10));
  }
}

// 6. Interiors: run the full house builder on a sample and look for NaN.
let nanPolys = 0, interiorPolys = 0, noInterior = 0, escaped = 0;
const structural = new Set(['interior', 'exterior', 'exteriorSnd', 'floor', 'roof', 'furniture']);
for (const fp of sampleBuildings) {
  const info = getHouseInfo(fp);
  interiorPolys += info.pols.length;
  const hasWalls = info.pols.some(p => p.type === 'exterior' || p.type === 'interior');
  if (!hasWalls) noInterior++;
  for (const pol of info.pols) {
    for (const p of pol.points || []) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z || 0)) nanPolys++;
    }
    // Structural geometry must stay in its own building, or it reads as a slab
    // cutting through the neighbour.
    if (structural.has(pol.type || '')) {
      for (const p of pol.points || []) {
        if (!pointInPolygon(p, fp.points) && pointPolyDist(p, fp.points) > 50) { escaped++; break; }
      }
    }
  }
}
check('interiors: sample buildings build walls', noInterior === 0, `${noInterior} shell-only`);
check('interiors: no NaN vertices', nanPolys === 0, `${nanPolys} points`);
check('interiors: no structural polygon escapes its building', escaped === 0, `${escaped} escaped`);

// 7. Panel wiring: every rule has a control, every control the script reaches
// for exists, and every preset has a button. The headless run cannot execute
// main.js (it needs a DOM and WebGL), so this is the static half of that check.
const html = fs.readFileSync(join(docsJs, '../index.html'), 'utf8');
const mainSrc = fs.readFileSync(join(docsJs, 'main.js'), 'utf8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const referenced = new Set([...mainSrc.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));

const missingControls = Object.keys(DEFAULTS).filter(key => !htmlIds.has(key));
check('panel: every rule has a control', missingControls.length === 0, missingControls.join(', '));

const danglingRefs = [...referenced].filter(id => !htmlIds.has(id) && !id.startsWith('v-'));
check('panel: no dangling element lookups', danglingRefs.length === 0, danglingRefs.join(', '));

const missingReadouts = Object.keys(DEFAULTS).filter(key => !htmlIds.has('v-' + key));
check('panel: every rule has a readout', missingReadouts.length === 0, missingReadouts.join(', '));

const missingPresets = Object.keys(PRESETS).filter(key => !html.includes(`data-preset="${key}"`));
check('panel: every preset has a button', missingPresets.length === 0, missingPresets.join(', '));

console.log(`\nInterior sample: ${sampleBuildings.length} buildings → ${interiorPolys} polygons`);
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} checks passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  for (const f of failures.slice(0, 25)) console.log('  · ' + f);
  if (failures.length > 25) console.log(`  … ${failures.length - 25} more`);
  process.exit(1);
}
