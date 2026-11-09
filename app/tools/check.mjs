// Headless geometry audit: node tools/check.mjs
import { generatePlan, PATTERNS } from '../src/generate.js';
import { renderPlan } from '../src/render.js';
import * as G from '../src/geom.js';

let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL', msg); };

function walk(o, path, out) {
  if (o == null) return;
  if (typeof o === 'number' && !Number.isFinite(o)) out.push(path);
  else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], `${path}.${k}`, out);
}

function audit(plan, label, { render = false, expectLots = false } = {}) {
  const s = plan.stats;
  console.log(`${label}: ${s.sites} lots (${s.rv}rv/${s.tiny}th), ${s.buildings} bldgs, ` +
    `${s.beds} beds, ${s.trees} trees, ${s.visitorStalls}v/${s.residentStalls}r/${s.lotStalls}lot stalls, ${s.acres}ac`);

  const bad = [];
  walk(plan, 'plan', bad);
  if (bad.length) fail(`${label}: non-finite numbers ${bad.slice(0, 5).join(', ')}`);
  if (expectLots && s.sites === 0) fail(`${label}: no lots placed`);
  if (!plan.patternLabel) fail(`${label}: missing pattern label`);
  if (expectLots && plan.buildings.length === 0) fail(`${label}: no buildings placed`);

  const parcel = plan.parcel;
  const inside = G.inset(parcel, 1);

  for (const site of plan.sites) {
    if (!G.contains(inside, site)) fail(`${label}: lot ${site.num} outside parcel`);
    if (site.w < 12 || site.h < 12) fail(`${label}: lot ${site.num} degenerate`);
    if (site.pad && !G.contains(site, site.pad)) fail(`${label}: lot ${site.num} pad outside lot`);
    if (site.home && !G.contains(site, site.home)) fail(`${label}: lot ${site.num} dwelling outside lot`);
    if (site.stall && !G.contains(site, site.stall)) fail(`${label}: lot ${site.num} stall outside lot`);
  }
  for (let i = 0; i < plan.sites.length; i++) {
    for (let j = i + 1; j < plan.sites.length; j++) {
      if (G.overlaps(plan.sites[i], plan.sites[j], -0.6)) {
        fail(`${label}: lots ${plan.sites[i].num}/${plan.sites[j].num} overlap`);
      }
    }
  }
  for (const b of plan.buildings) {
    if (!G.contains(inside, b)) fail(`${label}: ${b.label || b.kind} outside parcel`);
    for (const site of plan.sites) {
      if (G.overlaps(b, site, -1)) fail(`${label}: ${b.label || b.kind} overlaps lot ${site.num}`);
    }
    for (const other of plan.buildings) {
      if (other !== b && G.overlaps(b, other, -1)) fail(`${label}: ${b.label}/${other.label} overlap`);
    }
  }

  // parking
  let stalls = 0;
  for (const p of plan.parking) {
    stalls += p.count;
    if (p.count !== p.stalls.length) fail(`${label}: bay count mismatch`);
    if (p.count < 3) fail(`${label}: bay under 3 stalls`);
    if (!G.contains(inside, p)) fail(`${label}: ${p.label} outside parcel`);
    for (const st of p.stalls) {
      if (!G.contains(p, st)) fail(`${label}: stall outside ${p.label}`);
    }
    if (!p.aisle || p.aisle.h < 18) fail(`${label}: ${p.label} has no usable aisle`);
    for (const site of plan.sites) {
      if (G.overlaps(p, site, -1)) fail(`${label}: ${p.label} overlaps lot ${site.num}`);
    }
    for (const b of plan.buildings) {
      if (G.overlaps(p, b, -1)) fail(`${label}: ${p.label} overlaps ${b.label}`);
    }
    for (const q of plan.parking) {
      if (p !== q && G.overlaps(p, q, -1)) fail(`${label}: parking bays overlap`);
    }
  }
  if (s.parking !== s.visitorStalls + s.residentStalls + s.lotStalls) fail(`${label}: stall totals wrong`);

  // population capacity
  if (!s.population) fail(`${label}: no population stats`);
  else {
    const want = Math.round(s.sites * plan.rules.peoplePerLot);
    const wantGuests = Math.round(s.sites * plan.rules.guestsPerLot);
    if (s.population.residents !== want) fail(`${label}: residents ${s.population.residents} != ${want}`);
    if (s.population.guests !== wantGuests) fail(`${label}: guests ${s.population.guests} != ${wantGuests}`);
    if (s.population.peak !== want + wantGuests) fail(`${label}: peak population wrong`);
    if (s.population.peak < 0) fail(`${label}: negative population`);
  }
  if (s.visitorStalls !== plan.parking.filter((p) => p.which === 'visitor').reduce((a, p) => a + p.count, 0)) {
    fail(`${label}: visitor stall stat wrong`);
  }

  // utilities
  if (!plan.utilities) fail(`${label}: no utilities layer`);
  else {
    for (const layer of ['power', 'water', 'sewer']) {
      const u = plan.utilities[layer];
      if (!u) { fail(`${label}: missing ${layer} layer`); continue; }
      if (!u.runs.length) fail(`${label}: ${layer} has no trunk runs`);
      if (!u.label) fail(`${label}: ${layer} has no label`);
      for (const node of u.nodes) {
        if (!G.contains(inside, node)) fail(`${label}: ${layer} ${node.label} outside parcel`);
        if (node.w < 6 || node.h < 6) fail(`${label}: ${layer} ${node.label} degenerate`);
        for (const site of plan.sites) if (G.overlaps(node, site, -1)) fail(`${label}: ${layer} ${node.label} on lot ${site.num}`);
        for (const b of plan.buildings) if (G.overlaps(node, b, -1)) fail(`${label}: ${layer} ${node.label} overlaps ${b.label}`);
        for (const q of u.nodes) if (q !== node && G.overlaps(node, q, -1)) fail(`${label}: ${layer} equipment overlaps`);
      }
      for (const run of u.runs) {
        for (const [x, y] of run.pts) if (!Number.isFinite(x) || !Number.isFinite(y)) fail(`${label}: ${layer} run not finite`);
      }
    }
  }

  for (const t of plan.trees) {
    if (t.x < 0 || t.y < 0 || t.x > plan.width || t.y > plan.height) fail(`${label}: tree outside parcel`);
    for (const site of plan.sites) {
      if (t.x + t.r > site.x && t.x - t.r < site.x + site.w && t.y + t.r > site.y && t.y - t.r < site.y + site.h) {
        fail(`${label}: tree on lot ${site.num}`);
        break;
      }
    }
  }

  if (render) {
    for (const theme of ['blueprint', 'plan']) {
      const svg = renderPlan(plan, { theme });
      if (/NaN|undefined|Infinity/.test(svg)) fail(`${label}: bad svg value (${theme})`);
      if ((svg.match(/<rect/g) || []).length < 20) fail(`${label}: too few shapes (${theme})`);
      if (!/TINY HOME VILLAGE/.test(svg)) fail(`${label}: title block missing (${theme})`);
    }
  }
}

console.log('— parcel sweep (auto pattern) —');
for (const [w, h] of [[300, 300], [460, 900], [600, 460], [900, 640], [1400, 900], [2600, 300], [2400, 2400]]) {
  const plan = generatePlan({ width: w, height: h, seed: `sweep-${w}x${h}`, siteW: 34, siteD: 40, mix: 'mixed' });
  audit(plan, `${w}x${h} ${plan.pattern}`, { expectLots: w * h >= 600 * 460 });
}

console.log('\n— every pattern, 900x640 —');
for (const pattern of Object.keys(PATTERNS)) {
  const plan = generatePlan({
    width: 900, height: 640, seed: 'pattern-check', pattern,
    siteW: 34, siteD: 40, mix: 'mixed',
  });
  const fellBack = plan.notes.some((n) => /parallel lanes instead/i.test(n));
  if (plan.pattern !== pattern && !fellBack) fail(`${pattern}: pattern not honoured`);
  if (fellBack) console.log(`  (${pattern} fell back to lanes: parcel too small for blocks)`);
  audit(plan, pattern, { render: true, expectLots: true });
  if (plan.stats.visitorStalls < 5) fail(`${pattern}: no visitor parking`);
}

console.log('\n— rules —');
const noGarden = generatePlan({
  width: 900, height: 640, seed: 'rules-1', pattern: 'bands',
  amenities: { garden: false, pool: false, dog: false, orchard: false },
});
if (noGarden.greens.some((g) => g.kind === 'garden')) fail('garden toggle ignored');
if (noGarden.buildings.some((b) => b.kind === 'pool')) fail('pool toggle ignored');
audit(noGarden, 'toggles off');

const fixedParking = generatePlan({
  width: 900, height: 640, seed: 'rules-2', pattern: 'loops',
  rules: { parkingAuto: false, visitorStalls: 24, residentStalls: 16, lotParking: false, coreScale: 'full' },
});
if (fixedParking.stats.visitorStalls !== 24) fail(`visitor rule ignored (${fixedParking.stats.visitorStalls})`);
if (fixedParking.stats.lotStalls !== 0) fail('lot parking toggle ignored');
audit(fixedParking, 'fixed parking', { render: true, expectLots: true });

console.log('\n— core arrangement —');
const styles = new Set();
for (let i = 0; i < 8; i++) {
  styles.add(generatePlan({ width: 1100, height: 700, seed: `core-${i}`, pattern: 'bands' }).stats.core);
}
console.log(`  auto seeds produced: ${[...styles].join(', ')}`);
if (styles.size < 2) fail('core arrangement never varies by seed');
for (const want of ['compact', 'courtyard']) {
  const p = generatePlan({ width: 1400, height: 900, seed: 'core-pin', pattern: 'bands', rules: { coreLayout: want } });
  if (p.stats.core !== want) fail(`core layout ${want} not honoured (${p.stats.core})`);
}
const pinned = generatePlan({ width: 1400, height: 900, seed: 'core-count', pattern: 'bands', rules: { coreLayout: 'compact' } });
const spread = generatePlan({ width: 1400, height: 900, seed: 'core-count', pattern: 'bands', rules: { coreLayout: 'courtyard' } });
console.log(`  compact: ${pinned.stats.buildings} bldgs / ${pinned.parking.filter((p) => p.which === 'visitor').length} visitor bay(s)`);
console.log(`  courtyard: ${spread.stats.buildings} bldgs / ${spread.parking.filter((p) => p.which === 'visitor').length} visitor bay(s)`);
if (spread.parking.filter((p) => p.which === 'visitor').length < 2) fail('courtyard core did not distribute visitor parking');

console.log('\n— distributed parking —');
const dist = generatePlan({ width: 1400, height: 900, seed: 'dist', pattern: 'bands', rules: { parkingStyle: 'distributed' } });
const distBays = dist.parking.filter((p) => p.which === 'visitor');
console.log(`  visitor bays: ${distBays.map((b) => b.count + '@' + Math.round(b.x) + ',' + Math.round(b.y)).join(' ')} (${dist.stats.visitorStalls} stalls)`);
if (distBays.length < 2) fail('distributed parking did not split the visitor bays');
if (dist.stats.visitorStalls < 8) fail('distributed parking lost the visitor supply');
for (const b of distBays) {
  if (b.count < 3) fail('distributed bay under 3 stalls');
  if (!G.contains(dist.parcel, b)) fail('distributed bay outside parcel');
}

console.log('\n— parking location and fill —');
const capOf = (b) => Math.max(1, Math.floor((b.w - 3) / 9)) * (b.h >= 60 ? 2 : 1);
for (const [w, h] of [[1400, 900], [900, 640]]) {
  const p = generatePlan({ width: w, height: h, seed: 'edge-fill', pattern: 'bands' });
  const bays = p.parking;
  if (!bays.length) fail(`edge parking placed nothing at ${w}x${h}`);
  let tightest = Infinity;
  for (const b of bays) {
    const edgeDist = Math.min(b.x, b.y, p.parcel.w - (b.x + b.w), p.parcel.h - (b.y + b.h));
    tightest = Math.min(tightest, edgeDist);
    if (edgeDist > 170) fail(`edge parking ${b.label} is ${Math.round(edgeDist)}ft inside the parcel`);
    if (p.plaza && G.overlaps(b, p.plaza, -1)) fail('edge parking overlaps the plaza');
    for (const site of p.sites) if (G.overlaps(b, site, -1)) fail('edge parking overlaps a lot');
    if (b.count > capOf(b)) fail(`${b.label} holds ${b.count} in a ${b.w}x${b.h} bay`);
    if (b.count < capOf(b) - 1) fail(`${b.label} leaves its ${b.w}x${b.h} footprint half empty (${b.count}/${capOf(b)})`);
  }
  const fitted = bays.filter((b) => b.count >= capOf(b) - 1).length;
  console.log(`  ${w}x${h}: ${bays.length} bays (${bays.map((b) => b.which + ':' + b.count + '/' + capOf(b) + ' ' + b.w + 'x' + b.h).join(' ')}), ` +
    `nearest edge ${Math.round(tightest)}ft, ${fitted}/${bays.length} filled to footprint`);
}
const internal = generatePlan({ width: 1400, height: 900, seed: 'edge-fill', pattern: 'bands', rules: { parkingPosition: 'core' } });
if (internal.stats.parkingPosition !== 'core') fail('parking location rule ignored');
if (!internal.parking.length) fail('core parking mode placed nothing');
console.log(`  core mode allowed: ${internal.parking.length} bays`);
const exact = generatePlan({
  width: 900, height: 640, seed: 'edge-exact', pattern: 'loops',
  rules: { parkingAuto: false, visitorStalls: 24, residentStalls: 16, lotParking: false, coreScale: 'full' },
});
const sumOf = (k) => exact.parking.filter((b) => b.which === k).reduce((a, b) => a + b.count, 0);
console.log(`  explicit 24/16 at the edge: visitor ${sumOf('visitor')} in ${exact.parking.filter((b) => b.which === 'visitor').length} bays, ` +
  `resident ${sumOf('resident')} in ${exact.parking.filter((b) => b.which === 'resident').length} bays`);
if (sumOf('visitor') !== 24) fail(`edge mode lost visitor stalls (${sumOf('visitor')}/24)`);
if (sumOf('resident') !== 16) fail(`edge mode lost resident stalls (${sumOf('resident')}/16)`);

console.log('\n— car, walk and bike —');
const modePatterns = ['bands', 'loops', 'grid', 'perimeter', 'rings', 'organic', 'terrace'];
for (const pat of modePatterns) {
  const p = generatePlan({ width: 1400, height: 900, seed: 'modes', pattern: pat });
  if (p.roads.some((r) => !r.mode)) fail(`${pat}: a road has no circulation mode`);
  if (p.paths.some((q) => q.mode !== 'walk')) fail(`${pat}: a footpath is not marked for walking`);
  if (p.roads.some((r) => r.name === 'Foot Lane' && r.mode !== 'walk')) fail(`${pat}: a foot lane is marked for cars`);
  const drive = p.roads.filter((r) => r.mode === 'car');
  const walkRoads = p.roads.filter((r) => r.mode === 'walk');
  if (!drive.length) fail(`${pat}: no car street`);
  if (drive.some((r) => r.w < 14)) fail(`${pat}: a car street is narrower than 14 ft`);
  if (!p.roads.some((r) => r.kind === 'ring')) fail(`${pat}: no loop drive`);
  if (p.stats.carFt <= 0) fail(`${pat}: no car road length recorded`);
  if (p.stats.walkFt <= 0) fail(`${pat}: no walking length recorded`);
  if (p.stats.bikeFt <= 0) fail(`${pat}: no bike route recorded`);
  console.log(`  ${pat.padEnd(9)} car ${String(p.stats.carFt).padStart(5)} ft (${drive.length} streets) · ` +
    `walk ${String(p.stats.walkFt).padStart(5)} ft · bike ${String(p.stats.bikeFt).padStart(5)} ft` +
    `${walkRoads.length ? ` · ${walkRoads.length} walk-only ways` : ''}`);
}

console.log('\n— street connectivity —');
const streetPatterns = ['bands', 'loops', 'grid', 'perimeter', 'rings', 'organic', 'terrace'];
for (const pat of streetPatterns) {
  const row = [];
  for (const [w, h] of [[900, 640], [1400, 900], [460, 900], [2600, 300]]) {
    const p = generatePlan({ width: w, height: h, seed: 'ties', pattern: pat });
    if (p.stats.streetNetworks !== 1) fail(`${pat} ${w}x${h}: ${p.stats.streetNetworks} separate street networks`);
    row.push(`${w}x${h} ${p.stats.roads || p.roads.length}rd/${p.stats.streetsTied}tied`);
  }
  console.log(`  ${pat.padEnd(9)} ${row.join(' · ')}`);
}
// an access lane must never be driven through a lot or a building
let crossings = 0;
let accessLanes = 0;
for (const pat of streetPatterns) {
  for (const [w, h] of [[900, 640], [1400, 900]]) {
    const p = generatePlan({ width: w, height: h, seed: 'ties', pattern: pat });
    for (const rd of p.roads.filter((r) => r.kind === 'access')) {
      accessLanes++;
      const [a, b] = rd.pts;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(2, Math.ceil(len / 8));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const probe = { x: a[0] + (b[0] - a[0]) * t - 8, y: a[1] + (b[1] - a[1]) * t - 8, w: 16, h: 16 };
        if (p.sites.some((s) => G.overlaps(probe, s, 1)) || p.buildings.some((s) => G.overlaps(probe, s, 1))) {
          crossings++;
        }
      }
    }
  }
}
console.log(`  access lanes: ${accessLanes}, probes through a lot or building: ${crossings}`);
if (crossings > 0) fail('an access lane runs through a lot or building');
const untied = generatePlan({ width: 1400, height: 900, seed: 'ties', pattern: 'organic', rules: { streetTies: false } });
console.log(`  rule off: ${untied.stats.streetNetworks} networks`);
if (untied.stats.streetNetworks < 2) fail('turning the rule off changed nothing');

console.log('\n— footpaths —');
const drawn = {};
for (const style of ['straight', 'gentle', 'winding']) {
  const p = generatePlan({ width: 1400, height: 900, seed: 'paths', pattern: 'bands', rules: { pathStyle: style } });
  const pts = p.paths.reduce((a, q) => a + q.pts.length, 0);
  const curved = p.paths.filter((q) => q.pts.length > 2).length;
  const doors = p.paths.filter((q) => q.kind === 'door').length;
  const ft = Math.round(p.paths.reduce((a, q) => a + G.polyLength(q.pts), 0));
  drawn[style] = { pts, curved, ft };
  console.log(`  ${style}: ${p.paths.length} paths (${doors} door paths), ${curved} curved, ${pts} points, ${ft} ft`);
  if (doors < p.sites.length - 2) fail(`${style}: only ${doors} door paths for ${p.sites.length} lots`);
  for (const q of p.paths) {
    for (const [x, y] of q.pts) {
      if (x < -1 || y < -1 || x > p.width + 1 || y > p.height + 1) fail(`${style}: path leaves the parcel`);
    }
  }
  if (p.stats.pathFt <= 0) fail(`${style}: no footpath length recorded`);
  // a door path is a walk across its own lot, not across the neighbour's
  for (const q of p.paths.filter((x) => x.kind === 'door')) {
    const lot = p.sites.find((s) => s.num === q.site);
    if (!lot) { fail(`${style}: door path without a lot`); continue; }
    for (const [x, y] of q.pts) {
      if (x < lot.x - 0.6 || y < lot.y - 0.6 || x > lot.x + lot.w + 0.6 || y > lot.y + lot.h + 0.6) {
        fail(`${style}: door path leaves lot ${lot.num}`);
        break;
      }
    }
  }
  if (style === 'straight' && curved > 0) fail('straight style still curves paths');
  if (style !== 'straight' && curved < p.paths.length * 0.5) fail(`${style}: most paths are not curving`);
}
if (!(drawn.winding.ft > drawn.gentle.ft * 1.01 && drawn.gentle.ft > drawn.straight.ft * 1.01)) {
  fail(`path style barely changes the drawn geometry (${drawn.straight.ft} → ${drawn.gentle.ft} → ${drawn.winding.ft} ft)`);
}
const curvedEntry = generatePlan({ width: 1400, height: 900, seed: 'paths', pattern: 'bands', rules: { pathStyle: 'winding' } });
if (curvedEntry.roads.filter((r) => r.kind === 'entry').every((r) => r.pts.length < 3)) {
  fail('winding style did not bend the entry drive');
}

console.log('\n— population rules —');
for (const [people, guests] of [[3, 2], [1.5, 0.5], [0, 0]]) {
  const p = generatePlan({
    width: 900, height: 640, seed: 'pop', pattern: 'bands',
    rules: { peoplePerLot: people, guestsPerLot: guests },
  });
  const pop = p.stats.population;
  console.log(`  ${people}/home + ${guests} guests → ${pop.residents} residents, ${pop.guests} guests, ${pop.peak} peak (${pop.perAcre}/ac)`);
  if (pop.residents !== Math.round(p.stats.sites * people)) fail(`population rule ignored at ${people}/home`);
  if (pop.peak !== pop.residents + pop.guests) fail('peak does not add up');
  if (pop.perAcre !== +((pop.peak / p.stats.acres).toFixed(1))) fail('peak per acre wrong');
}
const defaultPop = generatePlan({ width: 900, height: 640, seed: 'pop-default', pattern: 'bands' });
if (defaultPop.stats.population.residents !== defaultPop.stats.sites * 2) fail('default residents per home should be 2');

console.log('\n— utility configurations —');
for (const [name, utilities] of [
  ['offgrid-hauled-compost', { power: 'offgrid', water: 'hauled', sewer: 'compost' }],
  ['solar-well-septic', { power: 'solar', water: 'well', sewer: 'septic' }],
  ['grid-county-city', { power: 'grid', water: 'county', sewer: 'city' }],
]) {
  const p = generatePlan({
    width: 1400, height: 900, seed: `util-${name}`, pattern: 'bands', utilities,
  });
  audit(p, `util ${name}`, { render: true, expectLots: true });
  const byLayer = ['power', 'water', 'sewer']
    .map((l) => `${l}:${p.utilities[l].nodes.map((n) => n.kind).join('+') || 'none'}`)
    .join('  ');
  console.log(`  ${byLayer}`);
  if (!/Solar array/.test(p.utilities.power.nodes.map((n) => n.label).join())) {
    if (utilities.power !== 'grid') fail(`${name}: no solar array`);
  }
  if (utilities.sewer === 'septic' && p.utilities.sewer.nodes.length < 2) fail(`${name}: septic needs tanks + field`);
  if (utilities.sewer === 'compost' && p.utilities.sewer.nodes.length < 2) fail(`${name}: compost needs a block + bed`);
}

console.log('\n— layer toggles —');
const layerPlan = generatePlan({ width: 1400, height: 900, seed: 'layers', pattern: 'bands' });
const allOn = renderPlan(layerPlan, {});
const allOff = renderPlan(layerPlan, { layers: { power: false, water: false, sewer: false } });
const onlyWater = renderPlan(layerPlan, { layers: { power: false, water: true, sewer: false } });
if (!(allOn.length > allOff.length)) fail('layer toggles do not change the drawing');
const ink = { power: '#ffb066', water: '#59d4ff', sewer: '#9ed86e' };
const strokes = (svg, colour) => (svg.match(new RegExp(colour, 'g')) || []).length;
if (strokes(allOff, ink.power) || strokes(allOff, ink.water) || strokes(allOff, ink.sewer)) {
  fail('layers drawn while toggled off');
}
if (!strokes(onlyWater, ink.water)) fail('water layer missing when enabled');
if (strokes(onlyWater, ink.power) || strokes(onlyWater, ink.sewer)) fail('single layer toggle wrong');
console.log(`  all on ${allOn.length} bytes · all off ${allOff.length} · water only ${onlyWater.length}`);

console.log(failures ? `\n${failures} failure(s)` : '\nAll geometry checks passed');
process.exit(failures ? 1 : 0);
