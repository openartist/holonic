import { makeRng, range, chance, pick, shuffle, STREET_ADJ, seedPhrase } from './rng.js';
import * as G from './geom.js';
import { FACILITY_LABEL, facilityInput, readFacilities } from './facilities.js';
import { buildUtilityRuns, planUtilities, readUtilities } from './utilities.js';

// ---- constants (feet) ------------------------------------------------------
const RING_OFF = 14;        // loop-drive centreline offset from the buildable edge
const ENTRY_W = 26;
const STALL_W = 9;
const STALL_D = 18;
const AISLE = 24;
const REAR_GAP = 4;

// how hard a footpath is allowed to bend, in feet over a span
const PATH_AMP = { straight: 0, gentle: 7, winding: 30 };

export const PATTERNS = {
  bands: 'Parallel lanes',
  loops: 'Loop courtyards',
  grid: 'Street grid',
  perimeter: 'Perimeter lots',
  rings: 'Concentric rings',
  organic: 'Hamlet clusters',
  terrace: 'Terraced rows',
};

// Core buildings come from the facility catalog, so their footprints are the
// ones the panel exposes.
function coreBuildings(plan, compact) {
  const f = plan.facilities;
  const out = [{ kind: 'office', label: 'Office', w: 32, h: 22 }];
  const rows = [
    ['bathhouse', 'Bathhouse'],
    ['laundry', 'Laundry'],
    ['workshop', 'Workshop'],
    ['storage', 'Storage'],
    ['bike', 'Bike workshop'],
  ];
  for (const [id, label] of rows) {
    if (!f[id] || !f[id].on) continue;
    out.push({ kind: id, label, w: f[id].w, h: f[id].h });
  }
  return compact ? out.slice(0, 3) : out;
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.max(min, Math.min(max, n)));
}

function readRules(input) {
  const r = input.rules || {};
  return {
    pattern: Object.keys(PATTERNS).includes(input.pattern) ? input.pattern : 'auto',
    lane: clampNum(r.lane, 18, 28, 22),
    buffer: r.buffer === 'auto' || r.buffer == null ? null : clampNum(r.buffer, 10, 44, 20),
    gardenShare: clampNum(Number(r.gardenShare ?? 0.18) * 100, 0, 60, 18) / 100,
    parkingAuto: r.parkingAuto !== false,
    visitorStalls: clampNum(r.visitorStalls, 0, 120, 12),
    residentStalls: clampNum(r.residentStalls, 0, 120, 8),
    lotParking: r.lotParking !== false,
    treeDensity: clampNum(Number(r.treeDensity ?? 1) * 10, 0, 20, 10) / 10,
    coreScale: ['compact', 'standard', 'full'].includes(r.coreScale) ? r.coreScale : 'standard',
  };
}

export function generatePlan(input = {}) {
  const width = clampNum(input.width, 300, 2600, 900);
  const height = clampNum(input.height, 300, 2600, 640);
  const L = Math.max(width, height);
  const S = Math.min(width, height);
  const rng = makeRng(String(input.seed ?? 'seed'));
  const plan = build(L, S, input, rng);
  if (width < height) transposePlan(plan);
  plan.width = width;
  plan.height = height;
  plan.notes = plan.notes.slice(0, 5);
  resizeParking(plan);
  plan.stats = computeStats(plan);
  return plan;
}

export function randomSeed() {
  return seedPhrase(makeRng(Date.now() ^ Math.floor(Math.random() * 1e9)));
}

// ---------------------------------------------------------------------------
function build(L, S, input, rng) {
  const rules = readRules(input);
  const num = (v, min, max, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) && v !== '' && v != null ? Math.max(min, Math.min(max, n)) : dflt;
  };
  rules.peoplePerLot = num(input.rules && input.rules.peoplePerLot, 0, 8, 2);
  rules.guestsPerLot = num(input.rules && input.rules.guestsPerLot, 0, 8, 1);
  const opts = input.rules || {};
  rules.coreLayout = ['auto', 'compact', 'courtyard'].includes(opts.coreLayout) ? opts.coreLayout : 'auto';
  rules.parkingStyle = ['entry', 'distributed'].includes(opts.parkingStyle) ? opts.parkingStyle : 'entry';
  rules.parkingPosition = ['edge', 'core'].includes(opts.parkingPosition) ? opts.parkingPosition : 'edge';
  rules.pathStyle = ['straight', 'gentle', 'winding'].includes(opts.pathStyle) ? opts.pathStyle : 'gentle';
  rules.streetTies = opts.streetTies !== false;
  const fac = readFacilities(facilityInput(input));
  const plan = {
    seed: String(input.seed ?? 'seed'),
    parcel: G.R(0, 0, L, S),
    roads: [], sites: [], buildings: [], beds: [], trees: [], greens: [],
    parking: [], paths: [], fences: [], labels: [], notes: [],
    blockedRects: [], schedule: [], placedKinds: new Set(),
    siteW: clampNum(input.siteW, 20, 48, 34),
    siteD: clampNum(input.siteD, 26, 58, 40),
    mix: input.mix || 'mixed',
    facilities: fac,
    // legacy view over the facility toggles
    amenities: {
      get garden() { return fac.garden.on; },
      get pool() { return fac.pool.on; },
      get dog() { return fac.dog.on; },
      get orchard() { return fac.orchard.on; },
    },
    rules,
    pattern: 'bands',
    transposed: false,
    siteCount: 0,
    rowIndex: 0,
  };

  // the core arrangement varies per seed unless the rule pins it
  plan.coreStyle = rules.coreLayout === 'auto' ? (chance(rng, 0.45) ? 'courtyard' : 'compact') : rules.coreLayout;

  const bf = rules.buffer ?? Math.round(G.clamp(S * 0.05, 14, 24));
  plan.buffer = bf;
  const B = (plan.buildable = G.inset(plan.parcel, bf));
  const I = (plan.inner = G.inset(B, RING_OFF + rules.lane / 2 + 8));

  plan.entry = { x: Math.round(G.clamp(range(rng, 0.44, 0.56) * L, B.x + 90, G.right(B) - 90)) };
  plan.pattern = choosePattern(rules.pattern, rng, L, S);
  plan.patternLabel = PATTERNS[plan.pattern];

  addRing(plan, B, rules.lane);
  plan.utilities = planUtilities(plan, readUtilities(input.utilities), rng);
  if (rules.parkingPosition === 'edge') {
    // every stall lives at the perimeter or beside the entry — nothing internal
    // reserve as many perimeter bays as the demand will fill, estimated from the
    // buildable area — the exact lot count is not known until the layout runs
    const estLots = Math.max(20, Math.round((I.w * I.h) / 4200));
    const perimeter = (which) => {
      const stalls = rules.parkingAuto
        ? estLots * (which === 'visitor' ? 0.16 : 0.09)
        : which === 'visitor' ? rules.visitorStalls : rules.residentStalls;
      // two bays a side job: their width follows the demand they have to hold
      const perRow = Math.ceil(Math.ceil(stalls / 2) / 2);
      // never narrower than a deep bay: portrait plans rotate the reservation
      const w = G.clamp(perRow * STALL_W + 3, 60, 250);
      reserveParkingPads(plan, I, rng, 2, which, w);
    };
    perimeter('visitor');
    perimeter('resident');
  } else if (rules.parkingAuto && (rules.parkingStyle === 'distributed' || plan.coreStyle === 'courtyard')) {
    reserveParkingPads(plan, I, rng, 2, 'visitor');
  }

  if (I.w < 150 || I.h < 150) {
    plan.notes.push('Parcel is very small — only the loop drive and a few lots fit.');
  }

  if (plan.pattern === 'perimeter') layoutPerimeter(plan, B, I, rng);
  else if (plan.pattern === 'rings') layoutRings(plan, I, rng);
  else if (plan.pattern === 'organic') layoutOrganic(plan, I, rng);
  else if (plan.pattern === 'terrace') layoutTerrace(plan, I, rng);
  else if (plan.pattern === 'loops' || plan.pattern === 'grid') layoutBlocks(plan, I, rng, plan.pattern);
  else layoutBands(plan, I, rng);

  if (plan.rules.streetTies) tieStreets(plan);
  else plan.streetNetworks = roadGroups(plan.roads).length;
  buildWalkNetwork(plan, rng);
  markCirculation(plan);
  buildUtilityRuns(plan);
  addGroundFacilities(plan, rng);
  addServiceYard(plan, B, rng);
  addPerimeterTrees(plan, rng);
  addGreenTrees(plan, rng);
  noteSkipped(plan);

  plan.labels.push({
    x: plan.entry.x + ENTRY_W / 2 + 6, y: plan.parcel.h - 12,
    text: 'ENTRY', kind: 'annotation', size: 'lg', anchor: 'start',
  });
  plan.fences.push({ rect: G.inset(plan.parcel, 1.5), kind: 'perimeter' });
  return plan;
}

function choosePattern(selected, rng, L, S) {
  if (selected !== 'auto') return selected;
  const ratio = L / S;
  const pool =
    ratio > 1.7 ? ['bands', 'bands', 'grid', 'perimeter', 'terrace', 'rings']
      : ratio > 1.2 ? ['bands', 'loops', 'grid', 'perimeter', 'rings', 'organic', 'terrace']
        : ['loops', 'loops', 'grid', 'perimeter', 'rings', 'organic', 'bands', 'terrace'];
  return pool[Math.floor(rng() * pool.length)];
}

function addRing(plan, B, lane) {
  plan.roads.push({
    pts: [
      [B.x + RING_OFF, B.y + RING_OFF],
      [G.right(B) - RING_OFF, B.y + RING_OFF],
      [G.right(B) - RING_OFF, G.bottom(B) - RING_OFF],
      [B.x + RING_OFF, G.bottom(B) - RING_OFF],
    ],
    w: lane, kind: 'ring', closed: true, name: 'Loop Drive',
  });
}

// ---- pattern 1: parallel lane bands ---------------------------------------
function layoutBands(plan, I, rng) {
  const rules = plan.rules;
  let d = plan.siteD;
  let M = rules.lane + 2 * d + REAR_GAP;
  let coreD = Math.round(G.clamp(I.h * 0.34, 110, 200));
  const gardenMin = plan.facilities.garden.h;
  let gardenD = plan.amenities.garden
    ? Math.round(G.clamp(I.h * rules.gardenShare, Math.max(54, gardenMin), Math.max(140, gardenMin)))
    : 0;

  const freeAfter = (cD, gD) => I.h - cD - gD - 12;
  if (freeAfter(coreD, gardenD) < M) gardenD = Math.max(0, Math.min(gardenD, I.h - coreD - M - 12));
  if (freeAfter(coreD, gardenD) < M) coreD = Math.max(104, Math.min(coreD, I.h - gardenD - M - 12));
  if (freeAfter(coreD, gardenD) < M) {
    const fitD = Math.floor((freeAfter(coreD, gardenD) - rules.lane - REAR_GAP) / 2);
    if (fitD >= 22) {
      d = fitD;
      M = rules.lane + 2 * d + REAR_GAP;
      plan.notes.push(`Lot depth reduced to ${d} ft to fit this parcel.`);
    }
  }
  plan.layoutDepth = d;

  let y = G.bottom(I);
  const coreBand = G.R(I.x, y - coreD, I.w, coreD);
  addCore(plan, coreBand, rng);
  y = coreBand.y;

  if (gardenD > 24) {
    y -= 6;
    const gardenBand = G.R(I.x, y - gardenD, I.w, gardenD);
    addGarden(plan, gardenBand, rng);
    addGreenway(plan, G.R(I.x, gardenBand.y + gardenBand.h, I.w, 6));
    y = gardenBand.y;
  }

  const laneSpace = y - I.y;
  const nLanes = Math.max(0, Math.floor((laneSpace + REAR_GAP) / M));
  const names = laneNames(plan, rng, Math.max(2, nLanes));

  let cursor = y;
  for (let i = 0; i < nLanes; i++) {
    const bh = rules.lane + 2 * d;
    const band = G.R(I.x, cursor - bh, I.w, bh);
    const cy = band.y + band.h / 2;
    const lane = {
      pts: [[I.x - (rules.lane / 2 + 8), cy], [G.right(I) + (rules.lane / 2 + 8), cy]],
      w: rules.lane, kind: 'lane', name: names[i % names.length],
    };
    plan.roads.push(lane);
    addLotRow(plan, { orient: 'h', from: I.x + 2, to: G.right(I) - 2, edge: cy - rules.lane / 2, front: 's', depth: d, rng, gaps: true });
    addLotRow(plan, { orient: 'h', from: I.x + 2, to: G.right(I) - 2, edge: cy + rules.lane / 2, front: 'n', depth: d, rng, gaps: true });
    cursor = band.y - REAR_GAP;
    if (i < nLanes - 1) addGreenway(plan, G.R(I.x, band.y - REAR_GAP, I.w, REAR_GAP));
  }

  const topFree = cursor - I.y;
  if (topFree > 12) {
    const g = G.R(I.x, I.y, I.w, Math.min(topFree, 140));
    plan.greens.push({ ...g, kind: 'lawn', label: topFree > 48 ? 'Green' : '' });
    if (plan.amenities.orchard && topFree > 54) orchardRows(plan, G.inset(g, 12), rng, 22, 20);
  }

  addGreenway(plan, G.R(I.x, G.bottom(I) + 8, I.w, Math.max(0, G.bottom(plan.buildable) - RING_OFF - rules.lane / 2 - (G.bottom(I) + 8))));
  addGreenway(plan, G.R(I.x - 8, I.y, 8, I.h));
  addGreenway(plan, G.R(G.right(I), I.y, 8, I.h));
  addGreenway(plan, G.R(I.x, I.y - 8, I.w, 8));
}

// ---- pattern 2: lots fronting the loop ------------------------------------
function layoutPerimeter(plan, B, I, rng) {
  const rules = plan.rules;
  const d = plan.siteD;
  plan.layoutDepth = d;
  const verge = 6;
  const frontInset = RING_OFF + rules.lane / 2 + verge;
  const J = G.inset(B, frontInset + d + 4);

  const ringX1 = B.x + RING_OFF;
  const ringY1 = B.y + RING_OFF;
  const ringX2 = G.right(B) - RING_OFF;
  const ringY2 = G.bottom(B) - RING_OFF;

  if (J.w < 90 || J.h < 110) {
    plan.notes.push('Parcel too shallow for a central village green.');
    return;
  }

  // core first: its entry drive is cut through the frontage row before lots go down
  let coreD = Math.round(G.clamp(J.h * 0.42, 118, 210));
  if (J.h - coreD < 100) coreD = Math.max(110, J.h - 100);
  const coreBand = G.R(J.x, G.bottom(J) - coreD, J.w, coreD);
  addCore(plan, coreBand, rng);

  // inside faces of the four loop segments
  addLotRow(plan, { orient: 'h', from: ringX1 + rules.lane / 2, to: ringX2 - rules.lane / 2, edge: ringY1 + rules.lane / 2 + verge, front: 'n', depth: d, rng });
  addLotRow(plan, { orient: 'h', from: ringX1 + rules.lane / 2, to: ringX2 - rules.lane / 2, edge: ringY2 - rules.lane / 2 - verge, front: 's', depth: d, rng });
  addLotRow(plan, { orient: 'v', from: ringY1 + rules.lane / 2, to: ringY2 - rules.lane / 2, edge: ringX1 + rules.lane / 2 + verge, front: 'w', depth: d, rng });
  addLotRow(plan, { orient: 'v', from: ringY1 + rules.lane / 2, to: ringY2 - rules.lane / 2, edge: ringX2 - rules.lane / 2 - verge, front: 'e', depth: d, rng });

  const available = coreBand.y - J.y;
  let lawnTop = coreBand.y - 6;
  if (plan.amenities.garden && available > 80) {
    const gh = Math.min(available - 26, Math.max(54, available * 0.45));
    const gBand = G.R(J.x, lawnTop - gh, J.w, gh);
    addGarden(plan, gBand, rng);
    lawnTop = gBand.y - 8;
  }
  const lawnH = lawnTop - J.y;
  if (lawnH > 24) {
    const lawn = G.R(J.x, J.y, J.w, lawnH);
    plan.greens.push({ ...lawn, kind: 'lawn', label: lawnH > 70 ? 'Village Green' : '' });
    if (plan.amenities.orchard && lawnH > 80) orchardRows(plan, G.inset(lawn, 14), rng, 24, 22);
    plan.paths.push({ pts: [[G.center(lawn).x, lawn.y + 8], [G.center(lawn).x, G.bottom(lawn) - 8]], w: 5 });
  } else if (lawnH > 0) {
    addGreenway(plan, G.R(J.x, J.y, J.w, lawnH));
  }
  addGreenway(plan, G.R(J.x, coreBand.y + coreBand.h, J.w, 6));
}

// ---- pattern 5: concentric rings ------------------------------------------
function layoutRings(plan, I, rng) {
  const rules = plan.rules;
  const d = plan.siteD;
  const lane = rules.lane;
  plan.layoutDepth = d;
  const step = d + 6 + lane;
  const rings = [];
  const corePad = lane / 2 + d + 10;
  let r = G.R(I.x, I.y, I.w, I.h);
  while (r.w > 260 && r.h > 240 && rings.length < 8) {
    rings.push(r);
    const next = G.inset(r, step);
    const nextCore = G.inset(next, corePad);
    // stop before the middle gets too tight to hold a core and a garden
    if (nextCore.w < 300 || nextCore.h < 210) break;
    r = next;
  }
  const last = rings[rings.length - 1];
  const core = last ? G.inset(last, corePad) : null;
  if (!core || core.w < 150 || core.h < 130) {
    plan.notes.push('Parcel too small for concentric rings — drew parallel lanes instead.');
    plan.pattern = 'bands';
    plan.patternLabel = PATTERNS.bands;
    layoutBands(plan, I, rng);
    return;
  }

  plan.entry.x = Math.round(G.center(core).x);
  // the middle holds the core, with the community garden on its north side
  const coreH = plan.amenities.garden ? Math.round(core.h * 0.66) : core.h;
  const coreBand = G.R(core.x, G.bottom(core) - coreH, core.w, coreH);
  addCore(plan, coreBand, rng);
  if (plan.amenities.garden) {
    const gBand = G.R(core.x, core.y, core.w, core.h - coreH - 8);
    if (gBand.h > 44) addGarden(plan, gBand, rng);
  }

  const ordinals = ['Outer', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
  rings.forEach((ring, i) => {
    const half = lane / 2;
    plan.roads.push({
      pts: G.rectPoints(ring), closed: true, w: lane, kind: 'lane',
      name: `${ordinals[i] || 'Ring'} Ring`,
    });
    // radial cross links through the lot row out to the next ring
    if (i < rings.length - 1) {
      const next = rings[i + 1];
      const mx = Math.round(G.center(ring).x);
      const my = Math.round(G.center(ring).y);
      const cw = Math.round(lane * 0.8);
      plan.roads.push({ pts: [[mx, ring.y], [mx, next.y]], w: cw, kind: 'lane', name: 'Cross Lane' });
      if (Math.abs(mx - plan.entry.x) > 60) {
        plan.roads.push({ pts: [[mx, G.bottom(ring)], [mx, G.bottom(next)]], w: cw, kind: 'lane', name: 'Cross Lane' });
      }
      plan.roads.push({ pts: [[ring.x, my], [next.x, my]], w: cw, kind: 'lane', name: 'Cross Lane' });
      plan.roads.push({ pts: [[G.right(ring), my], [G.right(next), my]], w: cw, kind: 'lane', name: 'Cross Lane' });
    }
    // one row of lots inside each ring, facing the pavement
    addLotRow(plan, { orient: 'h', from: ring.x + half, to: G.right(ring) - half, edge: ring.y + half, front: 'n', depth: d, rng });
    addLotRow(plan, { orient: 'h', from: ring.x + half, to: G.right(ring) - half, edge: G.bottom(ring) - half, front: 's', depth: d, rng });
    addLotRow(plan, { orient: 'v', from: ring.y + half + d + 2, to: G.bottom(ring) - half - d - 2, edge: ring.x + half, front: 'w', depth: d, rng });
    addLotRow(plan, { orient: 'v', from: ring.y + half + d + 2, to: G.bottom(ring) - half - d - 2, edge: G.right(ring) - half, front: 'e', depth: d, rng });
  });
}

// ---- pattern 6: hamlet clusters -------------------------------------------
function layoutOrganic(plan, I, rng) {
  const rules = plan.rules;
  const d = plan.siteD;
  const lane = rules.lane;
  plan.layoutDepth = d;
  const coreD = Math.round(G.clamp(I.h * 0.3, 118, 190));
  const gardenD = plan.amenities.garden ? Math.round(G.clamp(I.h * rules.gardenShare, 60, 130)) : 0;
  const coreBand = G.R(I.x, G.bottom(I) - coreD, I.w, coreD);
  addCore(plan, coreBand, rng);

  let top = coreBand.y - 8;
  if (gardenD > 40 && top - gardenD - 16 > I.y + 110) {
    const gBand = G.R(I.x + 10, top - gardenD - 10, I.w - 20, gardenD);
    addGarden(plan, gBand, rng);
    top = gBand.y - 8;
  }

  const area = G.R(I.x + 6, I.y + 6, I.w - 12, Math.max(0, top - I.y - 12));
  if (area.w < 150 || area.h < 140) {
    plan.notes.push('No room for hamlet clusters — drew a single lane instead.');
    if (area.h > 60) {
      const cy = Math.round(area.y + area.h / 2);
      plan.roads.push({ pts: [[area.x - 8, cy], [G.right(area) + 8, cy]], w: lane, kind: 'lane', name: 'Hamlet Lane' });
      addLotRow(plan, { orient: 'h', from: area.x, to: G.right(area), edge: cy - lane / 2, front: 's', depth: d, rng });
      addLotRow(plan, { orient: 'h', from: area.x, to: G.right(area), edge: cy + lane / 2, front: 'n', depth: d, rng });
    }
    return;
  }

  const cols = area.w >= 560 ? 2 : 1;
  const rows = Math.max(1, Math.min(3, Math.round(area.h / 250)));
  const cw = area.w / cols;
  const ch = area.h / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells.length && chance(rng, 0.14)) continue;
      const w = Math.round(cw * range(rng, 0.8, 0.95));
      const h = Math.round(ch * range(rng, 0.76, 0.93));
      const jitter = rules.pathStyle === 'winding' ? 18 : rules.pathStyle === 'gentle' ? 12 : 7;
      const jx = range(rng, -jitter, jitter);
      const jy = range(rng, -jitter, jitter);
      cells.push(G.R(Math.round(area.x + c * cw + jx + 5), Math.round(area.y + r * ch + jy + 5), w, h));
    }
  }

  // one stem per column, chaining each cluster to the one below it
  for (let c = 0; c < cols; c++) {
    const col = cells
      .filter((cell) => {
        const cx2 = cell.x + cell.w / 2;
        return cx2 >= area.x + c * cw && cx2 < area.x + (c + 1) * cw;
      })
      .sort((a, b) => a.y - b.y);
    let anchor = top;
    for (let i = col.length - 1; i >= 0; i--) {
      const cell = col[i];
      const sx = Math.round(cell.x + cell.w / 2);
      const y0 = G.bottom(cell) + 4;
      if (anchor - y0 > 12) {
        plan.roads.push({ pts: [[sx, y0], [sx, anchor]], w: Math.round(lane * 0.75), kind: 'lane', name: 'Foot Lane' });
      }
      anchor = cell.y + 44;
    }
  }

  const names = laneNames(plan, rng, 6);
  let ni = 0;
  for (const cell of cells) {
    addGreenway(plan, { ...cell, kind: 'lawn', label: '' });
    loopBlock(plan, cell, rng, names[ni++ % names.length]);
  }

  addGreenway(plan, G.R(I.x, G.bottom(I) + 8, I.w, Math.max(0, G.bottom(plan.buildable) - RING_OFF - lane / 2 - (G.bottom(I) + 8))));
}

// ---- pattern 7: terraced rows ---------------------------------------------
function layoutTerrace(plan, I, rng) {
  const rules = plan.rules;
  const d = plan.siteD;
  const lane = rules.lane;
  plan.layoutDepth = d;
  const bandH = lane + d + 8;
  // leave room for at least one terrace on shallow parcels
  const coreD = Math.round(G.clamp(Math.min(I.h * 0.32, I.h - bandH - 34), 92, 190));
  const coreBand = G.R(I.x, G.bottom(I) - coreD, I.w, coreD);
  addCore(plan, coreBand, rng);

  const names = laneNames(plan, rng, 6);
  let yTop = coreBand.y - 8;
  let i = 0;
  while (yTop - bandH > I.y + 20) {
    const south = i % 2 === 0;
    const cy = south ? yTop + d + lane / 2 : yTop + lane / 2;
    plan.roads.push({ pts: [[I.x - 6, cy], [G.right(I) + 6, cy]], w: lane, kind: 'lane', name: names[i % names.length] });
    if (south) {
      addLotRow(plan, { orient: 'h', from: I.x + 4, to: G.right(I) - 4, edge: yTop + d, front: 's', depth: d, rng });
    } else {
      addLotRow(plan, { orient: 'h', from: I.x + 4, to: G.right(I) - 4, edge: yTop + lane, front: 'n', depth: d, rng });
    }
    addGreenway(plan, G.R(I.x, yTop + bandH - 8, I.w, 8));
    if (i % 2 === 1) {
      for (const f of [0.28, 0.66]) {
        const x = Math.round(I.x + I.w * f);
        plan.roads.push({ pts: [[x, cy], [x, yTop + bandH]], w: 12, kind: 'lane', name: 'Foot Lane' });
      }
    }
    yTop -= bandH;
    i++;
  }

  const top = yTop - I.y;
  if (top > 10) {
    plan.greens.push({ ...G.R(I.x, I.y, I.w, Math.min(top, 120)), kind: 'lawn', label: top > 60 ? 'Green' : '' });
  }
  if (plan.amenities.garden && top > 60) {
    addGarden(plan, G.R(I.x + 6, I.y + 4, I.w - 12, Math.min(top - 8, 90)), rng);
  }
  addGreenway(plan, G.R(I.x, G.bottom(I) + 8, I.w, Math.max(0, G.bottom(plan.buildable) - RING_OFF - lane / 2 - (G.bottom(I) + 8))));
}

// ---- patterns 3 & 4: block grids ------------------------------------------
function layoutBlocks(plan, I, rng, pattern) {
  const rules = plan.rules;
  const d = plan.siteD;
  plan.layoutDepth = d;
  const street = rules.lane;
  const target = 340;
  const nCols = G.clamp(Math.round(I.w / target), 1, 3);
  const nRows = G.clamp(Math.round(I.h / (target * 0.9)), 1, 4);
  const bw = (I.w - street * (nCols - 1)) / nCols;
  const bh = (I.h - street * (nRows - 1)) / nRows;
  const blocks = [];
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      blocks.push({
        x: I.x + c * (bw + street), y: I.y + r * (bh + street),
        w: bw, h: bh, col: c, row: r,
      });
    }
  }

  if (blocks.length < 3) {
    plan.notes.push('Parcel fits too few blocks — drew parallel lanes instead.');
    plan.pattern = 'bands';
    plan.patternLabel = PATTERNS.bands;
    layoutBands(plan, I, rng);
    return;
  }

  // streets between blocks
  for (let c = 1; c < nCols; c++) {
    const x = I.x + c * (bw + street) - street / 2;
    plan.roads.push({ pts: [[x, I.y], [x, G.bottom(I)]], w: street, kind: 'lane', name: laneNames(plan, rng, 1)[0] });
  }
  for (let r = 1; r < nRows; r++) {
    const y = I.y + r * (bh + street) - street / 2;
    plan.roads.push({ pts: [[I.x, y], [G.right(I), y]], w: street, kind: 'lane', name: laneNames(plan, rng, 1)[0] });
  }

  // core block: bottom row, nearest the entry axis; entry drive realigns to it
  const bottomRow = blocks.filter((b) => b.row === nRows - 1);
  let coreBlock = bottomRow.reduce((best, b) =>
    Math.abs(G.center(b).x - plan.entry.x) < Math.abs(G.center(best).x - plan.entry.x) ? b : best, bottomRow[0]);
  plan.entry.x = Math.round(G.center(coreBlock).x);
  addCore(plan, coreBlock, rng);

  // garden block: beside the core if possible, else above it
  let gardenBlock = null;
  if (plan.amenities.garden) {
    gardenBlock =
      blocks.find((b) => b.row === coreBlock.row && Math.abs(b.col - coreBlock.col) === 1) ||
      blocks.find((b) => b.col === coreBlock.col && b.row === coreBlock.row - 1) ||
      null;
    if (gardenBlock) addGarden(plan, G.inset(gardenBlock, 0), rng);
  }

  const names = laneNames(plan, rng, 6);
  let ni = 0;
  for (const block of blocks) {
    if (block === coreBlock || block === gardenBlock) continue;
    addGreenway(plan, { ...block, w: block.w, h: block.h, kind: 'lawn', label: '' });
    if (pattern === 'loops') loopBlock(plan, block, rng, names[ni++ % names.length]);
    else blockEdgeLots(plan, block, rng);
  }
}

function blockEdgeLots(plan, block, rng) {
  const d = plan.siteD;
  const v = 4;
  const hasBottom = block.h >= d + 10;
  const hasTop = block.h >= 2 * d + 16;
  if (hasBottom) {
    addLotRow(plan, { orient: 'h', from: block.x + v, to: G.right(block) - v, edge: G.bottom(block) - v, front: 's', depth: d, rng });
  }
  if (hasTop) {
    addLotRow(plan, { orient: 'h', from: block.x + v, to: G.right(block) - v, edge: block.y + v, front: 'n', depth: d, rng });
  }
  const topBound = hasTop ? block.y + d + 8 : block.y + v;
  const botBound = hasBottom ? G.bottom(block) - d - 8 : G.bottom(block) - v;
  if (botBound - topBound >= 26) {
    addLotRow(plan, { orient: 'v', from: topBound, to: botBound, edge: block.x + v, front: 'w', depth: d, rng });
    if (block.w >= 2 * d + 14) {
      addLotRow(plan, { orient: 'v', from: topBound, to: botBound, edge: G.right(block) - v, front: 'e', depth: d, rng });
    }
  }
  const inner = G.R(block.x + v + d + 2, topBound, Math.max(0, block.w - 2 * (d + v + 2)), botBound - topBound);
  if (inner.w > 26 && inner.h > 26) {
    plan.greens.push({ ...inner, kind: 'lawn', label: '' });
    if (plan.amenities.orchard && inner.w > 60 && inner.h > 50) orchardRows(plan, G.inset(inner, 8), rng, 22, 20);
  }
}

function loopBlock(plan, block, rng, name) {
  const rules = plan.rules;
  const d = plan.siteD;
  const verge = 6;
  // outer lots keep an 8 ft rear strip so they never back onto the street
  const inset = 8 + d + rules.lane / 2 + 4;
  const ring = G.inset(block, inset);
  if (ring.w < rules.lane + 24 || ring.h < rules.lane + 24) {
    blockEdgeLots(plan, block, rng);
    return;
  }
  plan.roads.push({ pts: G.rectPoints(ring), closed: true, w: rules.lane, kind: 'lane', name });
  const half = rules.lane / 2;

  // access stems before the lots go down: the loop leaves the block on both
  // flanks so it is never a closed island with no way in from the street
  const stem = 16;
  const cy = G.center(ring).y;
  const cx = G.center(ring).x;
  // two inlets on opposite flanks: enough to enter and leave, few enough to
  // keep the block from turning into a crossroads
  const stems = [
    { x: block.x, y: cy - stem / 2, w: ring.x - block.x, h: stem, a: [block.x, cy], b: [ring.x, cy] },
    { x: G.right(ring), y: cy - stem / 2, w: G.right(block) - G.right(ring), h: stem, a: [G.right(ring), cy], b: [G.right(block), cy] },
  ];
  // a hamlet cluster also needs to reach the foot lane on its centreline, which
  // is the only street a cluster has; other patterns get streets all round
  if (plan.pattern === 'organic') {
    stems.push({
      x: cx - stem / 2, y: G.bottom(ring), w: stem, h: G.bottom(block) - G.bottom(ring),
      a: [cx, G.bottom(ring)], b: [cx, G.bottom(block)],
    });
  }
  for (const s of stems) {
    if (s.w < 16 || s.h < 16) continue;
    plan.blockedRects.push(G.R(s.x, s.y, s.w, s.h));
    plan.roads.push({ pts: [s.a, s.b], w: stem, kind: 'lane', name: 'Access Lane' });
  }

  // outside the ring, facing in
  const outer = half + 4;
  addLotRow(plan, { orient: 'h', from: ring.x - d - 6, to: G.right(ring) + d + 6, edge: ring.y - outer, front: 's', depth: d, rng });
  addLotRow(plan, { orient: 'h', from: ring.x - d - 6, to: G.right(ring) + d + 6, edge: G.bottom(ring) + outer, front: 'n', depth: d, rng });
  addLotRow(plan, { orient: 'v', from: ring.y - d, to: G.bottom(ring) + d, edge: ring.x - outer, front: 'e', depth: d, rng });
  addLotRow(plan, { orient: 'v', from: ring.y - d, to: G.bottom(ring) + d, edge: G.right(ring) + outer, front: 'w', depth: d, rng });

  // inside the ring
  const inner = G.inset(ring, half + verge);
  if (inner.w > 50 && inner.h > 50) {
    addLotRow(plan, { orient: 'h', from: inner.x, to: G.right(inner), edge: inner.y, front: 'n', depth: Math.min(d, inner.h / 2 - 3), rng });
    addLotRow(plan, { orient: 'h', from: inner.x, to: G.right(inner), edge: G.bottom(inner), front: 's', depth: Math.min(d, inner.h / 2 - 3), rng });
    addLotRow(plan, { orient: 'v', from: inner.y + d * 0.5, to: G.bottom(inner) - d * 0.5, edge: inner.x, front: 'w', depth: Math.min(d, inner.w / 2 - 3), rng });
    addLotRow(plan, { orient: 'v', from: inner.y + d * 0.5, to: G.bottom(inner) - d * 0.5, edge: G.right(inner), front: 'e', depth: Math.min(d, inner.w / 2 - 3), rng });
    const core = G.inset(inner, Math.min(d, Math.min(inner.w, inner.h) / 2 - 3));
    if (core.w > 20 && core.h > 20) {
      plan.greens.push({ ...core, kind: 'lawn', label: '' });
      for (let i = 0; i < 3; i++) scatterTree(plan, G.inset(core, 6), rng);
    }
  }
}

// ---- community core -------------------------------------------------------
function addCore(plan, region, rng) {
  if (region.w < 70 || region.h < 70) return;
  const rules = plan.rules;
  const cx = plan.entry.x;
  const scale = rules.coreScale;

  const plazaW = Math.round(G.clamp(region.w * 0.24, 78, 170));
  const plazaH = Math.round(G.clamp(region.h * 0.26, 26, 48));
  const plaza = G.R(cx - plazaW / 2, G.bottom(region) - 12 - plazaH, plazaW, plazaH);
  if (!G.contains(plan.buildable, plaza)) return;

  plan.greens.push({ ...plaza, kind: 'plaza', label: '' });
  plan.blockedRects.push(plaza);
  plan.plaza = plaza;

  plan.roads.push({ pts: [[cx, plan.parcel.h], [cx, G.bottom(plaza)]], w: ENTRY_W, kind: 'entry', name: 'Entry Drive' });

  // clubhouse behind the plaza
  const chW = Math.min(plan.facilities.clubhouse.w, plaza.w - 4);
  const chAvail = plaza.y - region.y - 16;
  const chH = Math.round(G.clamp(chAvail, 0, plan.facilities.clubhouse.h));
  if (chH >= 26 && chW >= 44) {
    const ch = G.R(cx - chW / 2, plaza.y - 8 - chH, chW, chH);
    if (addStructure(plan, ch, { kind: 'clubhouse', label: 'Clubhouse' })) {
      plan.paths.push({ pts: [[cx, plaza.y], [cx, G.bottom(ch)]], w: 5 });
    }
  }

  const courtTop = region.y + 8;
  const courtH = region.h - 16;
  const leftCourt = G.R(region.x + 8, courtTop, Math.max(0, plaza.x - 10 - (region.x + 8)), courtH);
  const rightCourt = G.R(G.right(plaza) + 10, courtTop, Math.max(0, G.right(region) - 8 - (G.right(plaza) + 10)), courtH);

  const compact = scale === 'compact';
  const edgeOnly = plan.rules.parkingPosition === 'edge';
  const buildings = coreBuildings(plan, compact).map((b) => ({ type: 'building', ...b }));
  if (plan.amenities.pool && !compact) {
    buildings.push({
      type: 'building', kind: 'pool', label: 'Pool', water: true,
      w: plan.facilities.pool.w, h: plan.facilities.pool.h,
    });
  }
  if (plan.facilities.kitchen.on && !compact) {
    buildings.push({
      type: 'building', kind: 'kitchen', label: 'Outdoor kitchen', open: true,
      w: plan.facilities.kitchen.w, h: plan.facilities.kitchen.h,
    });
  }
  if (scale !== 'compact') {
    buildings.push({ type: 'building', kind: 'pavilion', label: 'Pavilion', w: 38, h: 26, open: true });
  }
  if (scale === 'full') {
    buildings.push({ type: 'building', kind: 'bathhouse', label: 'Bathhouse 2', w: 40, h: 26 });
  }

  // which flank holds the buildings is a seed decision, not a fixed side
  const courts = [leftCourt, rightCourt].filter((c) => c.w > 36 && c.h > 26);
  if (!courts.length) return;
  const seedCourt = chance(rng, 0.5) ? leftCourt : rightCourt;
  const parkCourt = courts.includes(seedCourt) ? seedCourt : courts[0];
  const otherCourt = courts.length > 1 ? courts.find((c) => c !== parkCourt) : null;
  const twoSided =
    plan.coreStyle === 'courtyard' && plan.rules.parkingAuto && !!otherCourt &&
    plan.parking.some((p) => p.which === 'visitor');
  const visitorShare = plan.rules.parkingStyle === 'distributed' ? 0.4 : 1;

  if (edgeOnly) {
    // no parking at the core, so both flanks are free for buildings
    const half = Math.ceil(buildings.length / 2);
    packCourt(plan, leftCourt, buildings.slice(0, half), rng, {
      cols: leftCourt.w > 160 ? 2 : 1, fromTop: chance(rng, 0.5),
    });
    packCourt(plan, rightCourt, buildings.slice(half), rng, {
      cols: rightCourt.w > 160 ? 2 : 1, fromTop: chance(rng, 0.5),
    });
  } else if (twoSided) {
    // buildings wrap both flanks of the plaza; only resident parking stays put
    packCourt(plan, parkCourt, [{ type: 'parking', which: 'resident' }], rng, { fromTop: chance(rng, 0.5) });
    const primary = parkCourt.w >= otherCourt.w ? parkCourt : otherCourt;
    const secondary = primary === parkCourt ? otherCourt : parkCourt;
    const half = Math.ceil(buildings.length / 2);
    packCourt(plan, primary, buildings.slice(0, half), rng, {
      cols: primary.w > 160 ? 2 : 1, fromTop: chance(rng, 0.5),
    });
    packCourt(plan, secondary, buildings.slice(half), rng, { fromTop: chance(rng, 0.5) });
  } else {
    packCourt(plan, parkCourt, [
      { type: 'parking', which: 'visitor', share: visitorShare },
      { type: 'parking', which: 'resident' },
    ], rng, { fromTop: chance(rng, 0.5) });
    const target = otherCourt && otherCourt.w > 50 ? otherCourt : null;
    if (target) {
      packCourt(plan, target, buildings, rng, {
        cols: target.w > 170 ? 2 : 1, fromTop: chance(rng, 0.5),
      });
    } else {
      plan.notes.push('Core buildings did not fit beside the plaza.');
    }
  }

  for (const b of plan.buildings) {
    const c = G.center(b);
    const dist = Math.hypot(c.x - cx, c.y - (plaza.y + plaza.h / 2));
    if (dist < 130) {
      const px = G.clamp(c.x, plaza.x + 4, G.right(plaza) - 4);
      const py = G.clamp(c.y, plaza.y + 4, G.bottom(plaza) - 4);
      plan.paths.push({ pts: [[px, py], [c.x, c.y]], w: 4 });
    }
  }
}

function packCourt(plan, court, items, rng, opts = {}) {
  if (!court || court.w < 40 || court.h < 28) return;
  const parking = items.filter((i) => i.type === 'parking');
  const buildings = items.filter((i) => i.type !== 'parking');
  let y = G.bottom(court) - 2;
  for (const p of parking) {
    const bay = planParkingBay(plan, court, p.which, y, p.share ?? 1);
    if (bay) y = bay.y - 10;
  }
  const strip = G.R(court.x, court.y, court.w, Math.max(0, y - court.y));
  if (buildings.length) packBuildings(plan, strip, buildings, rng, opts.cols ?? 1, !!opts.fromTop);
}

// Packs buildings into one or two columns, top-down or bottom-up, biggest first.
function packBuildings(plan, strip, items, rng, cols, fromTop) {
  if (!strip || strip.w < 34 || strip.h < 22) return;
  const n = Math.max(1, Math.min(cols, Math.floor(strip.w / 56)));
  const gap = 10;
  const colW = (strip.w - gap * (n - 1)) / n;
  const columns = Array.from({ length: n }, (_, i) =>
    G.R(strip.x + i * (colW + gap), strip.y, colW, strip.h)
  );
  const cursor = columns.map((c) => (fromTop ? c.y : G.bottom(c)));
  const order = items.slice().sort((a, b) => b.w * b.h - a.w * a.h);
  for (const item of order) {
    const w = Math.min(item.w, colW);
    if (w < item.w * 0.7) continue;
    let best = -1;
    let room = -1;
    columns.forEach((c, i) => {
      const free = fromTop ? G.bottom(c) - cursor[i] : cursor[i] - c.y;
      if (free >= item.h && free > room) {
        best = i;
        room = free;
      }
    });
    if (best < 0) continue;
    const col = columns[best];
    const x = col.x + (col.w - w) / 2;
    let guard = 0;
    let placed = false;
    while (!placed && guard++ < 4) {
      const rect = fromTop
        ? G.R(x, cursor[best], w, item.h)
        : G.R(x, cursor[best] - item.h, w, item.h);
      if (!fromTop && rect.y < col.y) break;
      if (fromTop && G.bottom(rect) > G.bottom(col)) break;
      const deck = item.kind === 'pool'
        ? G.R(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10)
        : null;
      const spec = deck ? { ...item, deckRect: deck } : item;
      if (addStructure(plan, rect, spec)) {
        const used = deck || rect;
        cursor[best] = fromTop ? G.bottom(used) + 10 : used.y - 10;
        placed = true;
      } else {
        // occupied ground: step past it rather than stalling the whole column
        cursor[best] += fromTop ? 12 : -12;
      }
    }
  }
}

function planParkingBay(plan, court, which, yBottom, share = 1) {
  const room = yBottom - court.y;
  // only take the deep double-loaded bay when a second bay still fits above it
  const depth = room >= (STALL_D + AISLE) * 2 + 24 ? STALL_D * 2 + AISLE : STALL_D + AISLE;
  if (court.w < STALL_W * 3 || court.h < depth + 4) return null;
  if (room < depth) return null;
  const rect = G.R(court.x, yBottom - depth, court.w, depth);
  if (!free(plan, rect, 4)) return null;
  const bay = makeBay(rect, 12, which === 'visitor' ? 'Visitor parking' : 'Resident parking', which, share);
  if (bay.count < 3) return null;
  plan.parking.push(bay);
  plan.blockedRects.push(rect);
  return bay;
}

// Parking sits at the perimeter: beside the entry approach first, then along
// the inside of the loop drive. Never in the middle of the village.
function reserveParkingPads(plan, I, rng, count, which, w = 56) {
  const h = STALL_D * 2 + AISLE;
  // every site is against the inside of the loop drive; the ones nearest the
  // entry end come first so the walk from the gate stays short
  const spots = [];
  for (const [f, p] of [[0.12, 3], [0.3, 2], [0.48, 1], [0.66, 1], [0.84, 1]]) {
    spots.push({ x: I.x + 4, y: I.y + I.h * f, p });
    spots.push({ x: G.right(I) - w - 4, y: I.y + I.h * f, p });
  }
  shuffle(rng, spots);
  spots.sort((a, b) => b.p - a.p);
  let made = 0;
  for (const spot of spots) {
    if (made >= count) break;
    const rect = G.R(Math.round(spot.x), Math.round(spot.y), w, h);
    if (!free(plan, rect, 6)) continue;
    const label = which === 'visitor' ? 'Visitor parking' : 'Resident parking';
    const bay = makeBay(rect, bayCapacity(rect), label, which);
    bay.priority = spot.p + (which === 'resident' ? 0.5 : 0);
    if (bay.count < 3) continue;
    plan.parking.push(bay);
    plan.blockedRects.push(rect);
    made++;
  }
}

// Shrink a reserved rectangle to the stalls actually needed, so a small lot is a
// small lot rather than a half-empty apron.
function fitBay(rect, n) {
  const perRowMax = Math.max(1, Math.floor((rect.w - 3) / STALL_W));
  const tall = rect.h >= STALL_D * 2 + AISLE;
  const rows = tall && n > perRowMax ? 2 : 1;
  const perRow = Math.max(1, Math.min(perRowMax, Math.ceil(n / rows)));
  return G.R(
    rect.x, rect.y,
    Math.min(rect.w, perRow * STALL_W + 3),
    Math.min(rect.h, rows === 2 ? STALL_D * 2 + AISLE : STALL_D + AISLE),
  );
}

// How many stalls a footprint can actually hold.
function bayCapacity(rect) {
  const perRow = Math.max(1, Math.floor((rect.w - 3) / STALL_W));
  const rows = rect.h >= STALL_D * 2 + AISLE ? 2 : 1;
  return perRow * rows;
}

function makeBay(rect, wanted, label, which, share = 1) {
  const doubleLoaded = rect.h >= STALL_D * 2 + AISLE;
  const rows = doubleLoaded ? 2 : 1;
  const perRowMax = Math.floor((rect.w - 3) / STALL_W);
  const empty = { kind: 'bay', which, label, share, x: rect.x, y: rect.y, w: rect.w, h: rect.h, stalls: [], aisle: rect, count: 0 };
  if (perRowMax < 1 || rect.h < STALL_D + 6) return empty;
  // spread the stalls evenly over the rows the footprint can hold, and keep
  // every stall inside it — a single row sits against the far edge
  const perRow = Math.max(1, Math.min(perRowMax, Math.ceil(wanted / rows)));
  const stalls = [];
  const x0 = rect.x + (rect.w - perRow * STALL_W) / 2;
  const topRowY = rect.y + (doubleLoaded ? 1 : Math.max(0, rect.h - STALL_D));
  for (let i = 0; i < perRow; i++) stalls.push(G.R(x0 + i * STALL_W, topRowY, STALL_W, STALL_D));
  let aisle;
  if (doubleLoaded) {
    aisle = G.R(rect.x, rect.y + STALL_D, rect.w, rect.h - STALL_D * 2);
    const bottomRowY = rect.y + rect.h - STALL_D;
    const room = Math.floor((rect.h - STALL_D * 2) / 1);
    const second = Math.max(0, Math.min(wanted - perRow, perRowMax, room > 0 ? perRowMax : 0));
    const x1 = rect.x + (rect.w - second * STALL_W) / 2;
    for (let i = 0; i < second; i++) stalls.push(G.R(x1 + i * STALL_W, bottomRowY, STALL_W, STALL_D));
  } else {
    aisle = G.R(rect.x, rect.y, rect.w, Math.max(0, rect.h - STALL_D - 6));
  }
  return {
    kind: 'bay', which, label, share, x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    stalls, aisle, count: stalls.length,
  };
}

// ---- gardens --------------------------------------------------------------
function addGarden(plan, band, rng) {
  const pad = 8;
  const zone = G.R(band.x + pad, band.y + pad, band.w - pad * 2, band.h - pad * 2);
  if (zone.w < 80 || zone.h < 32) {
    plan.notes.push('Garden omitted — no block large enough.');
    return;
  }

  let gardenZone = zone;
  if (plan.amenities.dog && zone.w > 190 && zone.h > 44) {
    const dw = Math.round(G.clamp(plan.facilities.dog.w, 60, Math.min(zone.w * 0.46, 170)));
    const dog = G.R(G.right(zone) - dw, zone.y, dw, zone.h);
    plan.greens.push({ ...dog, kind: 'dog', label: 'Dog Park' });
    plan.fences.push({ rect: dog, kind: 'dog' });
    for (let i = 0; i < 3; i++) scatterTree(plan, G.inset(dog, 12), rng);
    gardenZone = G.R(zone.x, zone.y, zone.w - dw - 14, zone.h);
  } else if (plan.amenities.dog) {
    plan.notes.push('Dog park omitted — garden block too narrow.');
  }

  plan.greens.push({ ...gardenZone, kind: 'garden', label: 'Community Gardens' });
  plan.fences.push({ rect: gardenZone, kind: 'garden' });

  const bedW = 4;
  const bedL = 12;
  const rows = Math.max(1, Math.floor((gardenZone.h - 10) / 8));
  const cols = Math.max(1, Math.min(9, Math.floor((gardenZone.w * 0.62) / 15)));
  let bedCount = 0;
  for (let r = 0; r < rows && bedCount < 54; r++) {
    for (let c = 0; c < cols && bedCount < 54; c++) {
      const x = gardenZone.x + 8 + c * 15;
      const yy = gardenZone.y + 6 + r * 8;
      if (x + bedL > G.right(gardenZone) - 8 || yy + bedW > G.bottom(gardenZone) - 4) continue;
      plan.beds.push(G.R(x, yy, bedL, bedW));
      bedCount++;
    }
  }

  const bx = gardenZone.x + cols * 15 + 12;
  if (bx + 28 < G.right(gardenZone) - 4) {
    const gh = G.R(bx, gardenZone.y + 4, Math.min(20, G.right(gardenZone) - bx - 4), Math.min(30, gardenZone.h - 8));
    if (gh.h >= 18) addStructure(plan, gh, { kind: 'greenhouse', label: 'Greenhouse' });
  }
  if (gardenZone.w > 150 && gardenZone.h > 30) {
    addStructure(plan, G.R(gardenZone.x + 4, G.bottom(gardenZone) - 16, 14, 12), { kind: 'shed', label: 'Tools' });
  }
  if (plan.amenities.orchard) {
    const ox = gardenZone.x + Math.min(gardenZone.w * 0.66, cols * 15 + 44);
    const orchard = G.R(ox, gardenZone.y + 4, Math.max(0, G.right(gardenZone) - ox - 6), gardenZone.h - 8);
    if (orchard.w > 40) orchardRows(plan, orchard, rng, 20, 20);
  } else if (bedCount === 0) {
    plan.notes.push('Community garden has no room for beds.');
  }
}

// ---- optional ground amenities --------------------------------------------
const GROUND_IDS = ['playground', 'court', 'picnic', 'firepit', 'amphitheatre', 'market', 'ev'];

function openGround(plan, rect, pad = 4) {
  if (!free(plan, rect, pad)) return false;
  for (const s of plan.sites) if (G.overlaps(rect, s, pad)) return false;
  for (const b of plan.beds) if (G.overlaps(rect, b, pad)) return false;
  return true;
}

function commitAmenity(plan, rect, f) {
  plan.greens.push({ ...rect, kind: 'amenity', label: FACILITY_LABEL[f.id] });
  plan.blockedRects.push(rect);
  if (f.id === 'court' || f.id === 'playground') plan.fences.push({ rect, kind: f.id });
  return rect;
}

function trySpot(plan, f, w, h, rng) {
  const hosts = shuffle(
    rng,
    plan.greens.filter((g) => (g.kind === 'lawn' || g.kind === 'greenway') && g.w >= w + 8 && g.h >= h + 8)
  );
  const spots = [];
  for (const host of hosts) {
    spots.push([host.x + (host.w - w) / 2, host.y + (host.h - h) / 2]);
    for (const [fx, fy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.1], [0.5, 0.9]]) {
      spots.push([host.x + (host.w - w) * fx, host.y + (host.h - h) * fy]);
    }
  }
  // then any genuinely open ground left inside the layout
  const I = plan.inner;
  const cell = 22;
  const open = [];
  for (let y = I.y + 4; y + h <= G.bottom(I) - 4; y += cell) {
    for (let x = I.x + 4; x + w <= G.right(I) - 4; x += cell) open.push([x, y]);
  }
  shuffle(rng, open);
  spots.push(...open.slice(0, 1600));
  for (const [x, y] of spots) {
    const rect = G.R(Math.round(x), Math.round(y), w, h);
    if (!openGround(plan, rect, 6)) continue;
    return commitAmenity(plan, rect, f);
  }
  return null;
}

// Tries the requested footprint, then progressively smaller versions of it.
function placeGroundRect(plan, f, rng) {
  for (const scale of [1, 0.8, 0.62, 0.45]) {
    const w = Math.max(18, Math.round(f.w * scale));
    const h = Math.max(16, Math.round(f.h * scale));
    const rect = trySpot(plan, f, w, h, rng);
    if (rect) return rect;
  }
  return null;
}

function addGroundFacilities(plan, rng) {
  const specs = GROUND_IDS
    .filter((id) => plan.facilities[id].on)
    .map((id) => ({ id, ...plan.facilities[id] }))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  for (const f of specs) {
    const rect = placeGroundRect(plan, f, rng);
    if (!rect) {
      plan.notes.push(`${FACILITY_LABEL[f.id]} omitted — no open ground large enough.`);
      continue;
    }
    plan.placedKinds.add(f.id);
    plan.schedule.push({
      label: FACILITY_LABEL[f.id], kind: f.id,
      size: `${Math.round(rect.w)}' × ${Math.round(rect.h)}'`,
      area: Math.round(rect.w * rect.h),
    });
  }
}

// ---- lot rows -------------------------------------------------------------
function addLotRow(plan, o) {
  const depth = Math.max(18, Math.round(o.depth));
  const width = plan.siteW;
  const slots = slotPositions(o.from, o.to, width, o.rng, o.gaps);
  for (const s of slots) {
    const rect =
      o.orient === 'h'
        ? G.R(s.x, o.front === 's' ? o.edge - depth : o.edge, s.w, depth)
        : G.R(o.front === 'w' ? o.edge : o.edge - depth, s.x, depth, s.w);
    if (!siteFits(plan, rect)) continue;
    const site = { ...rect, front: o.front, kind: siteKind(o.rng, plan), num: ++plan.siteCount };
    dressSite(site, plan.rules.lotParking);
    plan.sites.push(site);
  }
}

function siteKind(rng, plan) {
  if (plan.mix === 'mixed') {
    const i = plan.rowIndex++;
    return i % 2 === 0 ? 'rv' : 'tiny';
  }
  const tinyChance = plan.mix === 'tiny' ? 0.88 : 0.12;
  return rng() < tinyChance ? 'tiny' : 'rv';
}

function slotPositions(x0, x1, siteW, rng, gapsOn = false) {
  const slots = [];
  const span = x1 - x0;
  if (span < 24) return slots;
  const gaps = gapsOn
    ? [0.34, 0.68].map((f) => [x0 + span * f - 10, x0 + span * f + 10])
    : [];
  let x = x0;
  let guard = 0;
  while (x < x1 - 20 && guard++ < 240) {
    const w = Math.round(G.clamp(siteW + range(rng, -2, 3), 18, 48));
    let end = x + w;
    for (const [g0, g1] of gaps) {
      if (end > g0 && x < g1) {
        x = g1 + 2;
        end = x + w;
      }
    }
    if (x + w > x1 - 2) break;
    slots.push({ x: Math.round(x), w });
    x = end + 2 + (chance(rng, 0.22) ? range(rng, 2, 6) : 0);
  }
  return slots;
}

function siteFits(plan, rect) {
  if (rect.w < 20 || rect.h < 20) return false;
  if (!G.contains(G.inset(plan.parcel, 2), rect)) return false;
  for (const b of plan.blockedRects) if (G.overlaps(rect, b, 2)) return false;
  for (const s of plan.sites) if (G.overlaps(rect, s, 1)) return false;
  // lots front directly onto the pavement, so only reject a road that actually
  // runs into the lot body (edge contact is expected)
  const probes = lotProbes(rect);
  for (const rd of plan.roads) {
    for (const [px, py] of probes) {
      if (G.pointToPolyline(px, py, rd.pts) < rd.w / 2 - 2) return false;
    }
  }
  return true;
}

function lotProbes(rect) {
  return [
    ...G.rectPoints(rect),
    [rect.x + rect.w / 2, rect.y],
    [G.right(rect), rect.y + rect.h / 2],
    [rect.x + rect.w / 2, G.bottom(rect)],
    [rect.x, rect.y + rect.h / 2],
    [rect.x + rect.w / 2, rect.y + rect.h / 2],
  ];
}

function localRect(site, f0, d0, fw, dd) {
  const { x, y, w, h } = site;
  switch (site.front) {
    case 's': return G.R(x + f0, y + h - d0 - dd, fw, dd);
    case 'n': return G.R(x + f0, y + d0, fw, dd);
    case 'e': return G.R(x + w - d0 - dd, y + f0, dd, fw);
    default: return G.R(x + d0, y + f0, dd, fw);
  }
}

function dressSite(site, lotParking) {
  const horizontal = site.front === 'n' || site.front === 's';
  const frontage = horizontal ? site.w : site.h;
  const depth = horizontal ? site.h : site.w;
  const rv = site.kind === 'rv';

  const padW = Math.round(frontage * (rv ? 0.66 : 0.6));
  const padD = Math.round(depth * 0.82);
  site.pad = localRect(site, (frontage - padW) / 2, 0, padW, padD);

  const homeW = Math.round(G.clamp(frontage * (rv ? 0.34 : 0.4), 8, 14));
  const homeD = Math.round(G.clamp(depth * (rv ? 0.62 : 0.5), 12, 33));
  site.home = localRect(site, (frontage - homeW) / 2, depth - homeD - 4, homeW, homeD);

  if (lotParking) {
    site.stall = localRect(site, 2, 0, 9, 18);
  }
}

// ---- trees ----------------------------------------------------------------
function treeFits(plan, x, y, r) {
  const p = plan.parcel;
  if (x - r < 4 || y - r < 4 || x + r > p.w - 4 || y + r > p.h - 4) return false;
  for (const b of plan.blockedRects) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return false;
  }
  for (const s of plan.sites) {
    if (x + r > s.x && x - r < s.x + s.w && y + r > s.y && y - r < s.y + s.h) return false;
  }
  for (const bed of plan.beds) {
    if (x + r > bed.x && x - r < bed.x + bed.w && y + r > bed.y && y - r < bed.y + bed.h) return false;
  }
  for (const rd of plan.roads) {
    if (G.pointToPolyline(x, y, rd.pts) < rd.w / 2 + r + 3) return false;
  }
  for (const t of plan.trees) {
    if (Math.hypot(t.x - x, t.y - y) < t.r + r + 4) return false;
  }
  return true;
}

function scatterTree(plan, host, rng) {
  if (!host) return;
  for (let i = 0; i < 26; i++) {
    const x = range(rng, host.x + 7, G.right(host) - 7);
    const y = range(rng, host.y + 7, G.bottom(host) - 7);
    const r = range(rng, 5, 9);
    if (treeFits(plan, x, y, r)) {
      plan.trees.push({ x, y, r, kind: 'canopy' });
      return;
    }
  }
}

function orchardRows(plan, rect, rng, pitchX = 20, pitchY = 20) {
  if (rect.w < pitchX || rect.h < pitchY) return;
  const cols = Math.floor(rect.w / pitchX);
  const rows = Math.floor(rect.h / pitchY);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = rect.x + pitchX / 2 + c * pitchX;
      const y = rect.y + pitchY / 2 + r * pitchY;
      if (!treeFits(plan, x, y, 6)) continue;
      plan.trees.push({ x, y, r: 6, kind: 'orchard' });
    }
  }
}

function addPerimeterTrees(plan, rng) {
  const p = plan.parcel;
  const inset = Math.max(7, plan.buffer * 0.55);
  const step = 26;
  const edges = [
    [inset, inset, p.w - inset, inset],
    [p.w - inset, inset, p.w - inset, p.h - inset],
    [p.w - inset, p.h - inset, inset, p.h - inset],
    [inset, p.h - inset, inset, inset],
  ];
  for (const [x0, y0, x1, y1] of edges) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t + range(rng, -3, 3);
      const y = y0 + (y1 - y0) * t + range(rng, -3, 3);
      const r = range(rng, 4.5, 6.5);
      if (treeFits(plan, x, y, r)) plan.trees.push({ x, y, r, kind: 'belt' });
    }
  }
}

function addGreenTrees(plan, rng) {
  const density = plan.rules.treeDensity;
  if (density <= 0) return;
  const hosts = plan.greens.filter((g) => g.kind === 'lawn' || g.kind === 'greenway');
  const area = hosts.reduce((a, g) => a + g.w * g.h, 0);
  const n = Math.round(G.clamp(area / 2400, 0, 90) * density);
  for (let i = 0; i < n; i++) scatterTree(plan, pick(rng, hosts), rng);
}

// ---- misc -----------------------------------------------------------------
function laneNames(plan, rng, n) {
  if (!plan._names) {
    plan._names = shuffle(rng, STREET_ADJ).map((a) => `${a} Lane`);
    plan._nameIdx = 0;
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push(plan._names[plan._nameIdx++ % plan._names.length]);
  return out;
}

function addGreenway(plan, rect) {
  if (rect.w <= 0 || rect.h <= 0) return;
  plan.greens.push({ ...rect, kind: rect.kind === 'lawn' ? 'lawn' : 'greenway', label: rect.label || '' });
}

function addServiceYard(plan, B, rng) {
  const cx = plan.entry.x;
  const side = rng() < 0.5 ? -1 : 1;
  const x = side > 0 ? cx + ENTRY_W / 2 + 12 : cx - ENTRY_W / 2 - 12 - 34;
  const dump = G.R(x, G.bottom(B) - 34, 34, 22);
  if (dump.x > B.x && G.right(dump) < G.right(B)) {
    addStructure(plan, dump, { kind: 'dump', label: 'Dump' });
  }
}

function free(plan, rect, pad = 4) {
  if (rect.w < 8 || rect.h < 8) return false;
  if (!G.contains(plan.buildable, rect)) return false;
  for (const b of plan.blockedRects) if (G.overlaps(rect, b, pad)) return false;
  const probes = [
    ...G.rectPoints(rect),
    [rect.x + rect.w / 2, rect.y], [G.right(rect), rect.y + rect.h / 2],
    [rect.x + rect.w / 2, G.bottom(rect)], [rect.x, rect.y + rect.h / 2],
    [rect.x + rect.w / 2, rect.y + rect.h / 2],
  ];
  for (const rd of plan.roads) {
    for (const [px, py] of probes) {
      if (G.pointToPolyline(px, py, rd.pts) < rd.w / 2 + 2) return false;
    }
  }
  return true;
}

function addStructure(plan, rect, spec) {
  const test = spec.deckRect || rect;
  if (!free(plan, test, 4)) return false;
  const b = {
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    kind: spec.kind, label: spec.label || '',
    open: !!spec.open, water: !!spec.water,
  };
  if (spec.deckRect) b.deck = spec.deckRect;
  plan.buildings.push(b);
  plan.blockedRects.push(test);
  plan.placedKinds.add(spec.kind);
  if (spec.label) {
    plan.schedule.push({
      label: spec.label, kind: spec.kind,
      size: `${Math.round(rect.w)}' × ${Math.round(rect.h)}'`,
      area: Math.round(rect.w * rect.h),
    });
  }
  return true;
}

function noteSkipped(plan) {
  if (plan.amenities.pool && !plan.placedKinds.has('pool')) {
    plan.notes.push('Pool omitted — no room beside the plaza.');
  }
  if (plan.amenities.garden && !plan.greens.some((g) => g.kind === 'garden')) {
    plan.notes.push('Gardens omitted — no block large enough.');
  }
  if (!plan.parking.some((p) => p.which === 'visitor')) {
    plan.notes.push('Visitor parking did not fit beside the entry.');
  }
}

// ---- circulation modes ------------------------------------------------------
// Not every line on the drawing carries a car. The loop drive and the lanes that
// front lots are vehicle streets (the loop also carries bikes); foot lanes, door
// paths and trails are walking, and trails take bikes too.
function markCirculation(plan) {
  for (const rd of plan.roads) {
    const walkOnly = rd.name === 'Foot Lane' || rd.w <= 13;
    rd.mode = walkOnly ? 'walk' : 'car';
    rd.bike = walkOnly || rd.kind === 'ring';
  }
  for (const p of plan.paths) {
    p.mode = 'walk';
    p.bike = p.kind === 'trail';
  }
  plan.circulation = {
    car: plan.roads.filter((r) => r.mode === 'car').length,
    walk: plan.roads.filter((r) => r.mode === 'walk').length + plan.paths.length,
    bike: plan.roads.filter((r) => r.bike).length + plan.paths.filter((p) => p.bike).length,
  };
}

// ---- street connectivity ----------------------------------------------------
// A street that reaches nothing is a trap for a vehicle: the loop drive, the
// lanes and any block loop have to read as one network. Layouts try to leave a
// stem in the right place; this pass proves it and ties up anything left over.
function roadSpans(rd) {
  const n = rd.pts.length;
  const spans = rd.closed ? n : n - 1;
  const out = [];
  for (let i = 0; i < spans; i++) out.push([rd.pts[i], rd.pts[(i + 1) % n]]);
  return out;
}

function pointToSpan(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? G.clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2, 0, 1) : 0;
  return { d: Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t)), x: a[0] + vx * t, y: a[1] + vy * t };
}

function nearestOnRoad(rd, p) {
  let best = { d: Infinity, x: 0, y: 0 };
  for (const [a, b] of roadSpans(rd)) {
    const hit = pointToSpan(p, a, b);
    if (hit.d < best.d) best = hit;
  }
  return best;
}

function roadSamples(rd, step = 14) {
  const out = [];
  for (const [a, b] of roadSpans(rd)) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(len / step));
    for (let i = 0; i < k; i++) out.push([a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]);
  }
  return out;
}

function roadsTouch(a, b) {
  if (a === b) return true;
  const reach = (a.w + b.w) / 2 + 5;
  for (const p of roadSamples(a, 18)) {
    if (nearestOnRoad(b, p).d <= reach) return true;
  }
  for (const p of roadSamples(b, 18)) {
    if (nearestOnRoad(a, p).d <= reach) return true;
  }
  return false;
}

function roadGroups(roads) {
  const parent = roads.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      if (roadsTouch(roads[i], roads[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  roads.forEach((rd, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  return [...groups.values()];
}

function corridorClear(plan, a, b, w) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(2, Math.ceil(len / 10));
  const half = w / 2 + 2;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const probe = G.R(a[0] + (b[0] - a[0]) * t - half, a[1] + (b[1] - a[1]) * t - half, half * 2, half * 2);
    for (const s of plan.sites) if (G.overlaps(probe, s, 2)) return false;
    for (const bl of plan.buildings) if (G.overlaps(probe, bl, 2)) return false;
    for (const pk of plan.parking) if (G.overlaps(probe, pk, 2)) return false;
  }
  return true;
}

function tieStreets(plan) {
  const roads = plan.roads;
  let groups = roadGroups(roads);
  if (!groups.length) return;
  groups.sort((a, b) => b.length - a.length);
  const trunk = [...groups[0]];
  let tied = 0;
  for (const group of groups.slice(1)) {
    let best = null;
    let fallback = null;
    let tried = 0;
    for (const i of group) {
      for (const p of roadSamples(roads[i], 16)) {
        let nearest = { d: Infinity, x: 0, y: 0, rd: null };
        for (const j of trunk) {
          const hit = nearestOnRoad(roads[j], p);
          if (hit.d < nearest.d) nearest = { ...hit, rd: roads[j] };
        }
        if (!nearest.rd || nearest.d < 4) continue;
        const w = Math.min(20, Math.max(14, Math.min(roads[i].w, nearest.rd.w)));
        const cand = { a: p, b: [nearest.x, nearest.y], w, len: nearest.d };
        if (!fallback || cand.len < fallback.len) fallback = cand;
        if (corridorClear(plan, cand.a, cand.b, w)) {
          if (!best || cand.len < best.len) best = cand;
        }
        if (++tried > 240) break;
      }
      if (tried > 240) break;
    }
    const pick = best || fallback;
    if (!pick) continue;
    plan.roads.push({
      pts: [pick.a, pick.b], w: pick.w, kind: 'access', name: 'Access Lane',
    });
    trunk.push(plan.roads.length - 1);
    tied++;
    if (!best) plan.notes.push('An inner loop could only be tied in across a lot line.');
  }
  plan.streetsTied = tied;
  plan.streetNetworks = roadGroups(plan.roads).length;
  if (plan.streetNetworks > 1) {
    plan.notes.push(`${plan.streetNetworks} separate street networks — an inner street reaches no other.`);
  }
}

// ---- footpaths -------------------------------------------------------------
// Paths are polylines, so a curve is simply a denser polyline: the junctions stay
// where they are and the span between them bulges, which reads as a path worn in
// rather than a ruled line.
function bendPath(pts, closed, amp, rng) {
  if (amp <= 0.5 || pts.length < 2) return pts;
  const out = [];
  const n = pts.length;
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 10) { out.push([x0, y0]); continue; }
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    // amplitude is the caller's call: a long lane and a garden gate both bend by
    // the distance they are given, not by how far they run
    const bend = range(rng, -1, 1) * Math.min(amp, len * 0.45);
    const steps = Math.max(2, Math.min(8, Math.round(len / 34)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // smoothstep: the offset leaves each joint with a zero gradient, no kink
      const off = bend * t * t * (3 - 2 * t);
      out.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
    }
  }
  out.push(closed ? out[0] : pts[n - 1]);
  return out;
}

function buildWalkNetwork(plan, rng) {
  const amp = PATH_AMP[plan.rules.pathStyle] ?? 0;
  if (amp > 0) {
    // the plaza > clubhouse > building links and the foot lanes bend; the ring
    // drive keeps its line because the lots front it
    for (const p of plan.paths) p.pts = bendPath(p.pts, false, amp * 0.7, rng);
    for (const rd of plan.roads) {
      if (rd.kind === 'entry') rd.pts = bendPath(rd.pts, false, amp * 0.8, rng);
      else if (rd.name === 'Foot Lane') rd.pts = bendPath(rd.pts, !!rd.closed, amp, rng);
    }
  }
  addDoorPaths(plan, amp, rng);
  addLawnTrails(plan, amp, rng);
}

// every home gets a path from its street-facing wall to the frontage
function addDoorPaths(plan, amp, rng) {
  for (const s of plan.sites) {
    const h = s.home;
    const f = s.front;
    const sx = f === 'e' ? G.right(h) : f === 'w' ? h.x : h.x + h.w / 2;
    const sy = f === 's' ? G.bottom(h) : f === 'n' ? h.y : h.y + h.h / 2;
    const ex = f === 'e' ? G.right(s) : f === 'w' ? s.x : sx;
    const ey = f === 's' ? G.bottom(s) : f === 'n' ? s.y : sy;
    const len = Math.hypot(ex - sx, ey - sy);
    if (len < 8) continue;
    // the sway has to stay on the lot: cap it by the room either side of the door
    const room = (f === 'n' || f === 's')
      ? Math.min(sx - s.x, G.right(s) - sx)
      : Math.min(sy - s.y, G.bottom(s) - sy);
    const cap = Math.max(0, Math.min(amp * 0.7, len * 0.45, room - 3));
    const bend = amp > 0 ? range(rng, -1, 1) * cap : 0;
    const px = -(ey - sy) / len;
    const py = (ex - sx) / len;
    let pts;
    if (Math.abs(bend) < 0.5) {
      pts = [[sx, sy], [ex, ey]];
    } else if (amp >= 20) {
      // winding: an S rather than a single arc, so the walk sways to the door
      pts = bendPath([
        [sx, sy],
        [sx + (ex - sx) / 3 + px * bend, sy + (ey - sy) / 3 + py * bend],
        [sx + ((ex - sx) * 2) / 3 - px * bend, sy + ((ey - sy) * 2) / 3 - py * bend],
        [ex, ey],
      ], false, Math.abs(bend) * 0.3, rng);
    } else {
      pts = bendPath([[sx, sy], [(sx + ex) / 2 + px * bend, (sy + ey) / 2 + py * bend], [ex, ey]], false, Math.abs(bend), rng);
    }
    plan.paths.push({ pts, w: 3.4, kind: 'door', site: s.num });
  }
}

// a worn line across the open ground of the larger lawns
function addLawnTrails(plan, amp, rng) {
  if (amp <= 0) return;
  for (const g of plan.greens) {
    if (g.kind !== 'lawn' || g.w < 150 || g.h < 44) continue;
    const inset = 14;
    const x0 = g.x + inset, x1 = G.right(g) - inset;
    const y0 = g.y + inset, y1 = G.bottom(g) - inset;
    if (x1 - x0 < 60 || y1 - y0 < 18) continue;
    const horizontal = g.w >= g.h;
    const jitter = () => 0.3 + 0.4 * rng();
    const pts = horizontal
      ? [[x0, (y0 + y1) / 2], [x0 + (x1 - x0) * 0.34, y0 + (y1 - y0) * jitter()],
        [x0 + (x1 - x0) * 0.68, y0 + (y1 - y0) * jitter()], [x1, (y0 + y1) / 2]]
      : [[(x0 + x1) / 2, y0], [x0 + (x1 - x0) * jitter(), y0 + (y1 - y0) * 0.34],
        [x0 + (x1 - x0) * jitter(), y0 + (y1 - y0) * 0.68], [(x0 + x1) / 2, y1]];
    plan.paths.push({ pts: bendPath(pts, false, Math.max(amp * 0.8, 5), rng), w: 4, kind: 'trail' });
  }
}

function roundGreen(plan, rect) {
  plan.greens.push({
    ...G.R(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h)),
    kind: 'lawn', label: '',
  });
}

// ---- parking sizing -------------------------------------------------------
// Bays reserve ground before lots are laid out; their stall count is decided
// afterwards from the final lot count (or from the explicit rule).
function resizeParking(plan) {
  const auto = plan.rules.parkingAuto;
  const lots = plan.sites.length;
  const wanted = (which) => {
    if (!auto) return which === 'visitor' ? plan.rules.visitorStalls : plan.rules.residentStalls;
    return which === 'visitor' ? Math.max(5, Math.round(lots * 0.16)) : Math.max(3, Math.round(lots * 0.09));
  };
  // Fill each bay to what its footprint holds, best-placed bays first; the last
  // bay takes the remainder and any bay that cannot reach 3 stalls is released.
  const kept = [];
  const dropped = [];
  for (const which of ['resident', 'visitor']) {
    let left = wanted(which);
    const bays = plan.parking
      .filter((p) => p.which === which)
      .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
    for (const bay of bays) {
      if (left <= 0) { dropped.push(bay); continue; }
      const n = Math.min(bayCapacity(bay), left);
      if (n < 3) { dropped.push(bay); continue; }
      const fit = fitBay(bay, n);
      const built = makeBay(fit, n, bay.label, which);
      if (built.count < 3) { dropped.push(bay); continue; }
      built.priority = bay.priority;
      kept.push(built);
      // the part of the reservation the fitted bay does not need becomes lawn
      const spare = [
        { x: G.right(fit), y: bay.y, w: bay.x + bay.w - G.right(fit), h: bay.h },
        { x: fit.x, y: fit.y + fit.h, w: fit.w, h: bay.y + bay.h - (fit.y + fit.h) },
      ];
      for (const s of spare) {
        if (s.w >= 6 && s.h >= 6) roundGreen(plan, s);
      }
      left -= built.count;
      if (left > 0 && left < 3) left = 0; // one spare row is not worth a bay
    }
    if (left > 0) {
      plan.notes.push(`${which === 'visitor' ? 'Visitor' : 'Resident'} parking is ${left} stalls short of demand.`);
    }
  }
  plan.parking = kept;
  // a reserved bay that went unused becomes a pocket of green, not a hole
  for (const bay of dropped) {
    roundGreen(plan, bay);
  }

  // does the visitor bay actually cover the peak guest population?
  const visitors = plan.parking.filter((p) => p.which === 'visitor').reduce((a, p) => a + p.count, 0);
  const guestCars = Math.ceil((lots * plan.rules.guestsPerLot) / 2.5);
  if (guestCars > 0 && visitors < guestCars) {
    plan.notes.push(`Visitor stalls cover ${visitors} of ~${guestCars} guest cars at peak.`);
  }
}

// ---- stats ----------------------------------------------------------------
function computeStats(plan) {
  const acres = (plan.width * plan.height) / 43560;
  const rv = plan.sites.filter((s) => s.kind === 'rv').length;
  const tiny = plan.sites.length - rv;
  const siteArea = plan.sites.reduce((a, s) => a + s.w * s.h, 0);
  const footprint = plan.buildings.reduce((a, b) => a + b.w * b.h, 0);
  const roadFt = plan.roads.reduce((a, r) => a + G.polyLength(r.pts), 0);
  const pathFt = plan.paths.reduce((a, p) => a + G.polyLength(p.pts), 0);
  const carFt = plan.roads.filter((r) => r.mode === 'car').reduce((a, r) => a + G.polyLength(r.pts), 0);
  const walkRoadFt = plan.roads.filter((r) => r.mode === 'walk').reduce((a, r) => a + G.polyLength(r.pts), 0);
  const bikeFt = plan.roads.filter((r) => r.bike).reduce((a, r) => a + G.polyLength(r.pts), 0) +
    plan.paths.filter((p) => p.bike).reduce((a, p) => a + G.polyLength(p.pts), 0);
  const greenArea = plan.greens.reduce((a, g) => a + g.w * g.h, 0);
  const visitor = plan.parking.filter((p) => p.which === 'visitor').reduce((a, p) => a + p.count, 0);
  const resident = plan.parking.filter((p) => p.which === 'resident').reduce((a, p) => a + p.count, 0);
  const lotStalls = plan.sites.filter((s) => s.stall).length;
  const residents = Math.round(plan.sites.length * plan.rules.peoplePerLot);
  const guests = Math.round(plan.sites.length * plan.rules.guestsPerLot);
  const peak = residents + guests;

  return {
    utilities: {
      power: plan.utilities.power.label,
      water: plan.utilities.water.label,
      sewer: plan.utilities.sewer.label,
    },
    core: plan.coreStyle,
    parkingStyle: plan.rules.parkingStyle,
    parkingPosition: plan.rules.parkingPosition,
    acres: +acres.toFixed(2),
    sites: plan.sites.length,
    rv, tiny,
    density: acres > 0 ? +(plan.sites.length / acres).toFixed(1) : 0,
    population: {
      residents,
      guests,
      peak,
      perAcre: acres > 0 ? +(peak / acres).toFixed(1) : 0,
    },
    siteArea: Math.round(siteArea),
    footprint: Math.round(footprint),
    roadFt: Math.round(roadFt),
    pathFt: Math.round(pathFt),
    pathStyle: plan.rules.pathStyle,
    carFt: Math.round(carFt),
    walkFt: Math.round(walkRoadFt + pathFt),
    bikeFt: Math.round(bikeFt),
    circulation: plan.circulation,
    greenArea: Math.round(greenArea),
    beds: plan.beds.length,
    trees: plan.trees.length,
    buildings: plan.buildings.length,
    visitorStalls: visitor,
    residentStalls: resident,
    lotStalls,
    streetNetworks: plan.streetNetworks ?? 1,
    streetsTied: plan.streetsTied ?? 0,
    parking: visitor + resident + lotStalls,
    coverage: acres > 0 ? +(((footprint + siteArea) / (acres * 43560)) * 100).toFixed(1) : 0,
  };
}

// ---- portrait handling ----------------------------------------------------
function transposePlan(plan) {
  const s = (r) => (r ? { ...r, x: r.y, y: r.x, w: r.h, h: r.w } : r);
  const FACE = { n: 'w', w: 'n', s: 'e', e: 's' };

  plan.roads.forEach((rd) => { rd.pts = rd.pts.map(([x, y]) => [y, x]); });
  plan.paths.forEach((p) => { p.pts = p.pts.map(([x, y]) => [y, x]); });
  plan.buildings.forEach((b) => {
    const t = s(b);
    Object.assign(b, { x: t.x, y: t.y, w: t.w, h: t.h });
    if (b.deck) b.deck = s(b.deck);
  });
  plan.sites.forEach((st) => {
    const rect = s(st);
    Object.assign(st, {
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      pad: s(st.pad), home: s(st.home), stall: st.stall ? s(st.stall) : undefined,
      front: FACE[st.front],
    });
  });
  plan.parking.forEach((p) => {
    const rect = s(p);
    Object.assign(p, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    p.stalls = p.stalls.map(s);
    p.aisle = s(p.aisle);
  });
  plan.greens = plan.greens.map(s);
  plan.beds = plan.beds.map(s);
  plan.blockedRects = plan.blockedRects.map(s);
  plan.fences.forEach((f) => { f.rect = s(f.rect); });
  plan.trees.forEach((t) => { const x = t.x; t.x = t.y; t.y = x; });
  plan.parcel = s(plan.parcel);
  plan.buildable = s(plan.buildable);
  plan.inner = s(plan.inner);
  plan.plaza = plan.plaza ? s(plan.plaza) : null;
  if (plan.utilities) {
    for (const key of Object.keys(plan.utilities)) {
      const u = plan.utilities[key];
      u.nodes.forEach((node) => {
        const t = s(node);
        Object.assign(node, { x: t.x, y: t.y, w: t.w, h: t.h });
      });
      u.runs.forEach((run) => { run.pts = run.pts.map(([x, y]) => [y, x]); });
      u.stubs.forEach((stub) => {
        stub[0] = [stub[0][1], stub[0][0]];
        stub[1] = [stub[1][1], stub[1][0]];
      });
      if (u.inlet) {
        const tx = u.inlet.x;
        u.inlet.x = u.inlet.y;
        u.inlet.y = tx;
      }
    }
  }
  plan.transposed = true;
}
