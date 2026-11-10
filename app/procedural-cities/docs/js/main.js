import * as THREE from 'three';
import { generateRoads } from './roadGen.js?v=levers-1';
import { extractBlocks, normalizePlots } from './plotGen.js?v=levers-1';
import { generateHousePolygons } from './buildingGen.js?v=levers-1';
import { getHouseInfo } from './houseBuilder.js?v=levers-1';
import { getSidewalkWithDecorations } from './sidewalkGen.js?v=levers-1';
import { createScene, buildCityMesh } from './scene.js?v=levers-2';
import { getCrossingsForRoads, getBushesAtCorners, getGrassPatches } from './plotDecorations.js?v=levers-1';
import { DEFAULTS, PRESETS, clampRules, cityConfig, buildConfig } from './rules.js?v=levers-1';

const overlay = document.getElementById('overlay');
const statsEl = document.getElementById('stats');
const notesEl = document.getElementById('notes');
const notesGroup = document.getElementById('notes-group');

let ctx = null;
let current = null;
let timer = null;
let running = false;
let pending = false;

const LAYERS = ['roads', 'markings', 'plots', 'landscape', 'buildings'];

// Readouts for the panel. Geometries are in centimetres (100 units = 1 m).
const FMT = {
  seed: v => `#${v}`,
  roadLength: v => `${v} segments`,
  branchChance: v => `${Math.round(v * 100)}% branch`,
  blockSize: v => `${(v / 100).toFixed(0)} m spacing`,
  growthScale: v => `${(v * 100000).toFixed(1)} × 10⁻⁵`,
  streetWidth: v => `${(v / 25).toFixed(1)} m main`,
  minPlot: v => `${Math.round(v)} m²`,
  maxPlot: v => `${Math.round(v).toLocaleString()} m²`,
  lotSize: v => `${Math.round(v).toLocaleString()} m² / lot`,
  minFootprint: v => `${Math.round(v)} m²`,
  setback: v => `${(v / 100).toFixed(1)} m`,
  pieceGap: v => `${(v / 100).toFixed(1)} m alley`,
  sidewalk: v => `${(v / 100).toFixed(2)} m`,
  minFloors: v => `${v} floors`,
  maxFloors: v => `${v} floors`,
  buildChance: v => `${Math.round(v * 100)}% built`,
  heightNoise: v => (v === 0 ? 'uniform' : `${Math.round(v * 100)}% variance`),
  downtown: v => (v === 0 ? 'flat skyline' : `core +${Math.round(v * 90)}%`),
  greenery: v => `${v.toFixed(1)}× planting`,
  maxBuildings: v => `${v} max`,
};

function ruleInputs() {
  return Object.keys(DEFAULTS).map(key => document.getElementById(key)).filter(Boolean);
}

function readRules() {
  const raw = {};
  for (const key of Object.keys(DEFAULTS)) {
    const el = document.getElementById(key);
    raw[key] = el ? Number(el.value) : DEFAULTS[key];
  }
  return clampRules(raw);
}

function syncOutputs(rules) {
  for (const [key, fn] of Object.entries(FMT)) {
    const out = document.getElementById('v-' + key);
    if (out) out.textContent = fn(rules[key]);
  }
}

function writeRules(rules) {
  for (const key of Object.keys(DEFAULTS)) {
    const el = document.getElementById(key);
    if (el) el.value = rules[key];
  }
  syncOutputs(rules);
}

function applyLayers() {
  if (!current) return;
  for (const name of LAYERS) {
    const box = document.getElementById('layer-' + name);
    const group = current.layers[name];
    if (group && box) group.visible = box.checked;
  }
}

function renderStats(stats, notes) {
  statsEl.innerHTML = Object.entries(stats)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  notesEl.innerHTML = notes.map(n => `<li>${n}</li>`).join('');
  notesGroup.hidden = notes.length === 0;
}

function frameCamera(group) {
  const bbox = new THREE.Box3().setFromObject(group);
  if (bbox.isEmpty()) return;
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 300;
  ctx.camera.position.set(center.x, maxDim * 1.05, center.z + maxDim * 0.42);
  ctx.controls.target.set(center.x, 0, center.z);
  ctx.controls.update();
}

async function generate() {
  if (running) { pending = true; return; }
  running = true;
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  overlay.textContent = 'Laying out the city…';
  await tick();

  const rules = readRules();
  const started = performance.now();
  const notes = [];

  try {
    const roads = generateRoads(cityConfig(rules));

    overlay.textContent = 'Extracting blocks…';
    await tick();
    const extracted = extractBlocks(roads, { sidewalk: rules.sidewalk });
    const { plots, stats: plotStats } = normalizePlots(extracted, {
      minPlot: rules.minPlot,
      maxPlot: rules.maxPlot,
    });

    // Skyline centre: the middle of the road network's extent.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const road of roads) {
      for (const p of [road.p1, road.p2]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const cityCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const cityRadius = Math.max(maxX - minX, maxY - minY) / 2 || 12000;

    const materialPols = [];
    if (rules.sidewalk > 0) {
      for (const plot of plots) materialPols.push(...getSidewalkWithDecorations(plot, rules.sidewalk));
    }
    if (rules.greenery > 0) {
      for (const plot of plots) {
        const seed = Math.abs(Math.floor((plot[0].x || 0) * 1000 + (plot[0].y || 0))) >>> 0;
        let s = seed;
        const srng = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
        const bushes = getBushesAtCorners(plot, srng);
        if (rules.greenery < 1) {
          const keep = Math.round(bushes.length * rules.greenery);
          materialPols.push(...bushes.slice(0, keep));
        } else {
          materialPols.push(...bushes);
        }
        materialPols.push(...getGrassPatches(plot, srng, Math.round(6 * rules.greenery)));
      }
    }
    materialPols.push(...getCrossingsForRoads(roads));

    const footprints = [];
    let smallLots = 0;
    let capped = false;

    if (document.getElementById('layer-buildings').checked) {
      overlay.textContent = 'Placing buildings…';
      await tick();
      const cfg = buildConfig(rules, cityCenter, cityRadius);
      for (const plot of plots) {
        if (plot.green) continue;
        if (footprints.length >= rules.maxBuildings) { capped = true; break; }
        const pieces = generateHousePolygons(plot, cfg);
        if (!pieces.length) { smallLots++; continue; }
        for (const piece of pieces) {
          if (footprints.length >= rules.maxBuildings) { capped = true; break; }
          const info = getHouseInfo(piece);
          materialPols.push(...info.pols);
          footprints.push(piece);
        }
      }
    }

    overlay.textContent = 'Building meshes…';
    await tick();

    if (current) {
      ctx.scene.remove(current.group);
      current.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    current = buildCityMesh(ctx.scene, roads, plots, materialPols);
    applyLayers();
    frameCamera(current.group);

    const builtArea = footprints.reduce((sum, f) => sum + (f.footprintM2 || 0), 0);
    const blockArea = plots.reduce((sum, p) => sum + (p.areaM2 || 0), 0);
    const tallest = footprints.reduce((m, f) => Math.max(m, f.height || 0), 0);

    if (plotStats.overlapping) notes.push(`${plotStats.overlapping} blocks overlapped a larger neighbour and were dropped — the mashing fix.`);
    const malformed = plotStats.tiny + plotStats.sliver + plotStats.folded;
    if (malformed) notes.push(`${malformed} malformed blocks dropped (slivers, folded outlines, under ${Math.round(rules.minPlot)} m²).`);
    if (plotStats.garden) notes.push(`${plotStats.garden} blocks over ${Math.round(rules.maxPlot).toLocaleString()} m² are kept as gardens, not mega-lots.`);
    if (smallLots) notes.push(`${smallLots} lots are too small to build on at a ${(rules.setback / 100).toFixed(1)} m setback.`);
    if (capped) notes.push(`Building cap reached at ${rules.maxBuildings} — raise it under Buildings for a denser city.`);

    renderStats({
      Streets: roads.length,
      Blocks: plots.length,
      'Garden blocks': plotStats.garden,
      Buildings: footprints.length,
      Footprint: `${Math.round(builtArea).toLocaleString()} m²`,
      'Site coverage': blockArea ? `${Math.round(builtArea / blockArea * 100)}%` : '—',
      Skyline: tallest ? `${tallest} floors · ${(tallest * 4).toFixed(0)} m` : '—',
      Generation: `${Math.round(performance.now() - started)} ms`,
    }, notes);

    window.__cityState = { rules, roads, plots, footprints, plotStats };

    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
  } catch (err) {
    overlay.textContent = 'Error: ' + err.message;
    console.error(err);
  } finally {
    running = false;
    if (pending) { pending = false; schedule(0); }
  }
}

function schedule(delay = 260) {
  clearTimeout(timer);
  timer = setTimeout(generate, delay);
}

function tick() { return new Promise(resolve => setTimeout(resolve, 0)); }

// ---- panel wiring ----------------------------------------------------------

for (const el of ruleInputs()) {
  el.addEventListener('input', () => {
    syncOutputs(readRules());
    schedule(320);
  });
  el.addEventListener('change', () => {
    syncOutputs(readRules());
    schedule(0);
  });
}

document.getElementById('btnGen').addEventListener('click', () => schedule(0));

document.getElementById('shuffle').addEventListener('click', () => {
  const seed = 1 + Math.floor(Math.random() * 99999);
  document.getElementById('seed').value = seed;
  writeRules(readRules());
  schedule(0);
});

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = PRESETS[btn.dataset.preset];
    if (!preset) return;
    writeRules(clampRules({ ...readRules(), ...preset.rules }));
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b === btn));
    schedule(0);
  });
});

for (const name of LAYERS) {
  const box = document.getElementById('layer-' + name);
  if (!box) continue;
  box.addEventListener('change', () => {
    applyLayers();
    if (name === 'buildings' && box.checked && current && current.layers.buildings.children.length === 0) schedule(0);
  });
}

document.getElementById('panelToggle').addEventListener('click', () => {
  document.body.classList.toggle('panel-collapsed');
});

window.regenerate = generate;
window.setLayer = (name, on) => {
  const box = document.getElementById('layer-' + name);
  if (box) box.checked = on;
  applyLayers();
};

ctx = createScene(document.body);
syncOutputs(readRules());
generate();
