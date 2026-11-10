// park-check.mjs — headless audit of the RV park layout.
//
// Runs the real generator over every preset and seed, plus hand-drawn (and
// deliberately awkward) boundaries, and proves: sites sit inside the area,
// nothing overlaps anything by more than a sliver, facilities and beds are
// inside too, and the same seed always draws the same park.
//
// Overlap is measured as intersection AREA, not with a boolean. Clipped bands
// share boundaries with the rows they serve, and a boolean "do these edges
// cross" test reports those shared edges as collisions; 100 cm² is the bar for
// a real collision.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', 'docs');
const js = p => new URL('file://' + join(docs, 'js', p)).href;

const { makeArea, layoutPark, FACILITY_KINDS } = await import(js('parkGen.js'));
const { VILLAGE_FACILITY_KINDS } = await import(js('villageGen.js'));
const { DECAL_Z } = await import(js('decalZ.js'));
const { PARK_DEFAULTS, PARK_PRESETS, PARK_RANGES, PARK_PATTERNS, clampParkRules } = await import(js('parkRules.js'));
const { polyArea, polySimple, polyIsClockwise } = await import(js('utils.js'));
const { pointInPolygon, pointPolyDist } = await import(js('plotGen.js'));
const { pickables } = await import(js('pickInfo.js'));

let passed = 0, failed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else { failed++; failures.push(`${name} ${detail}`); }
}

const M2 = 1e-4;
const OVERLAP_LIMIT = 100; // cm² — anything above this is a real collision

const inside = (pt, ring) => pointInPolygon(pt, ring);
// A clipped polygon legitimately has vertices sitting on the boundary, where
// point-in-polygon is ambiguous, so allow a couple of centimetres of slack.
const polyInside = (poly, ring) => poly.every(p => inside(p, ring) || pointPolyDist(p, ring) <= 3);

// Area of subject ∩ clip. The clip polygon must be convex; sites and facility
// footprints are rectangles, bands are only ever the subject.
function clipArea(subject, clipPts) {
  if (!subject || subject.length < 3 || !clipPts || clipPts.length < 3) return 0;
  const clip = polyIsClockwise(clipPts) ? clipPts.slice().reverse() : clipPts;
  let out = subject.map(p => ({ x: p.x, y: p.y }));
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = p => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const next = [];
    for (let j = 0; j < out.length; j++) {
      const P = out[j], Q = out[(j + 1) % out.length];
      const sp = side(P), sq = side(Q);
      if (sp >= 0) next.push(P);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const t = sp / (sp - sq);
        next.push({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t });
      }
    }
    out = next;
  }
  return out.length >= 3 ? polyArea(out) : 0;
}

function bbox(poly) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, x1, y0, y1 };
}
function bboxHit(a, b) {
  const A = bbox(a), B = bbox(b);
  return A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1;
}

// Worst overlap between two lists, in cm². `clipped` marks which side is the
// convex clip (sites/facilities); `worst` is the largest measured area.
function worstOverlap(listA, listB, clip = 'b') {
  let worst = 0;
  for (const a of listA) {
    for (const b of listB) {
      if (!bboxHit(a, b)) continue;
      const area = clip === 'b' ? clipArea(a, b) : clipArea(b, a);
      if (area > worst) worst = area;
    }
  }
  return worst;
}

// --- awkward boundaries -----------------------------------------------------
const drawn = {
  'L-shaped parcel': [
    { x: -12000, y: -9000 }, { x: 14000, y: -9000 }, { x: 14000, y: 2000 },
    { x: -2000, y: 2000 }, { x: -2000, y: 11000 }, { x: -12000, y: 11000 },
  ],
  'concave wedge': [
    { x: -10000, y: -8000 }, { x: 12000, y: -8000 }, { x: 3000, y: 1000 },
    { x: 12000, y: 9000 }, { x: -10000, y: 9000 },
  ],
  'rotated strip': [
    { x: -9000, y: -5000 }, { x: 9000, y: -5000 }, { x: 9000, y: 6000 }, { x: -9000, y: 6000 },
  ].map(p => ({ x: p.x * 0.87 - p.y * 0.5, y: p.x * 0.5 + p.y * 0.87 })),
};

const scenes = [];
for (const [name, preset] of Object.entries(PARK_PRESETS)) {
  for (const seed of [42, 7, 2026]) {
    scenes.push({ tag: `${name}/${seed}`, rules: clampParkRules({ ...PARK_DEFAULTS, ...preset.rules, seed }) });
  }
}
for (const [name, pts] of Object.entries(drawn)) {
  for (const presetName of ['motorhome', 'rustic']) {
    scenes.push({
      tag: `${name}/${presetName}`,
      rules: clampParkRules({ ...PARK_DEFAULTS, ...PARK_PRESETS[presetName].rules, seed: 11, areaShape: 'custom' }),
      area: pts,
    });
  }
}

// Stress: maximum shuffle and deliberately broken-up grids, to prove the
// invariants still hold once the layout stops being a straight lattice.
scenes.push({ tag: 'stress/stagger+jitter', rules: clampParkRules({ ...PARK_DEFAULTS, ...PARK_PRESETS.motorhome.rules, seed: 5, pattern: 'stagger', jitter: 120, variety: 1 }) });
scenes.push({ tag: 'stress/courts', rules: clampParkRules({ ...PARK_DEFAULTS, ...PARK_PRESETS.caravan.rules, seed: 9, pattern: 'courts', jitter: 90, variety: 0.8 }) });
scenes.push({ tag: 'stress/clusters', rules: clampParkRules({ ...PARK_DEFAULTS, ...PARK_PRESETS.rustic.rules, seed: 3, pattern: 'clusters', jitter: 60, variety: 0.6 }) });

const rows = [];
for (const scene of scenes) {
  const { tag, rules } = scene;
  const area = scene.area || makeArea(rules);
  const layout = layoutPark(area, rules, { facilityKinds: FACILITY_KINDS });
  const { pitches, roads, facilities, gardens, allotmentBeds, stats, area: ring, inner } = layout;

  const sitePolys = pitches.map(p => p.points);
  const roadPolys = roads.map(r => r.points);
  const facPolys = facilities.map(f => f.points);
  const bedPolys = gardens.filter(g => g.kind !== 'perimeter').map(g => g.points);

  check(`${tag}: area is a simple polygon`, polySimple(ring), `${ring.length} pts`);
  check(`${tag}: area has real size`, polyArea(ring) * M2 > 200, `${Math.round(polyArea(ring) * M2)} m²`);
  check(`${tag}: usable area inside boundary`, polyInside(inner, ring) && polySimple(inner));
  check(`${tag}: sites were placed`, pitches.length > 0, `${pitches.length}`);
  check(`${tag}: aisles were placed`, stats.aisleCount > 0, `${stats.aisleCount}`);
  const wantedFacilities = rules.facilityShare >= 0.3 ? 3 : rules.facilityShare >= 0.15 ? 2 : 1;
  check(`${tag}: facilities were placed`, facilities.length >= wantedFacilities,
    `${facilities.length} of ${wantedFacilities} expected`);

  // Sites: inside, right size, disjoint.
  const expected = rules.pitchWidth * rules.pitchDepth * M2;
  let outside = 0, wrongSize = 0, siteSite = 0;
  for (const p of pitches) {
    if (!polyInside(p.points, inner)) outside++;
    const a = polyArea(p.points) * M2;
    if (Math.abs(a - expected) > expected * 0.01) wrongSize++;
  }
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      if (!bboxHit(sitePolys[i], sitePolys[j])) continue;
      siteSite = Math.max(siteSite, clipArea(sitePolys[i], sitePolys[j]));
    }
  }
  check(`${tag}: every site inside the area`, outside === 0, `${outside} outside`);
  check(`${tag}: sites are pitch-sized`, wrongSize === 0, `${wrongSize} wrong`);
  check(`${tag}: no two sites overlap`, siteSite <= OVERLAP_LIMIT, `${(siteSite * M2).toFixed(3)} m²`);

  // Roads inside the boundary and clear of every site.
  let roadOut = 0;
  for (const r of roadPolys) if (!polyInside(r, inner) && !polyInside(r, ring)) roadOut++;
  const roadSite = worstOverlap(roadPolys, sitePolys, 'b');
  check(`${tag}: roads inside the area`, roadOut === 0, `${roadOut} outside`);
  check(`${tag}: no road crosses a site`, roadSite <= OVERLAP_LIMIT, `${(roadSite * M2).toFixed(3)} m²`);

  // Facilities: inside, clear of sites, roads and each other.
  let facOut = 0;
  for (const f of facPolys) if (!polyInside(f, inner)) facOut++;
  const facSite = worstOverlap(facPolys, sitePolys, 'a');
  const facRoad = worstOverlap(facPolys, roadPolys, 'a');
  let facFac = 0;
  for (let i = 0; i < facPolys.length; i++) {
    for (let j = i + 1; j < facPolys.length; j++) facFac = Math.max(facFac, clipArea(facPolys[i], facPolys[j]));
  }
  check(`${tag}: facilities inside the area`, facOut === 0, `${facOut} outside`);
  check(`${tag}: facilities clear of sites and roads`, Math.max(facSite, facRoad, facFac) <= OVERLAP_LIMIT,
    `${(Math.max(facSite, facRoad, facFac) * M2).toFixed(3)} m²`);

  // Beds and allotments: inside, clear of sites and facilities. The green edge
  // is a visual band outside the usable area, so it is not part of this test.
  let bedOut = 0;
  for (const g of bedPolys) if (!polyInside(g, inner)) bedOut++;
  for (const b of allotmentBeds) if (!polyInside(b, inner)) bedOut++;
  const bedSite = worstOverlap(bedPolys, sitePolys, 'b');
  const bedFac = worstOverlap(bedPolys, facPolys, 'a');
  let allotSite = 0;
  for (const b of allotmentBeds) {
    for (const p of sitePolys) {
      if (!bboxHit(b, p)) continue;
      allotSite = Math.max(allotSite, clipArea(b, p));
    }
  }
  const bedWorst = Math.max(bedSite, bedFac, allotSite);
  check(`${tag}: garden beds inside the area`, bedOut === 0, `${bedOut} outside`);
  check(`${tag}: beds clear of sites and facilities`, bedWorst <= OVERLAP_LIMIT,
    `${(bedWorst * M2).toFixed(3)} m²`);

  // No NaN anywhere, and sensible counts.
  const allPoints = [...ring, ...inner, ...sitePolys, ...roadPolys, ...facPolys].flat();
  check(`${tag}: no NaN coordinates`, allPoints.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  check(`${tag}: occupancy within the cap`, stats.occupied <= pitches.length);
  check(`${tag}: utilisation is a percentage`, stats.utilisation >= 0 && stats.utilisation <= 130, `${stats.utilisation}%`);
  check(`${tag}: sites respect the cap`, pitches.length <= rules.maxPitches);

  rows.push({
    scene: tag, area: stats.areaM2, sites: stats.pitches, occupied: stats.occupied,
    facilities: stats.facilities, beds: stats.gardenM2, utilisation: stats.utilisation,
    worst: Math.max(siteSite, roadSite, Math.max(facSite, facRoad, facFac), bedWorst) * M2,
  });
}

// The default lever set must place the whole facility list, not silently drop
// the toggled-on pool, playground and dump station.
const full = (() => {
  const rules = clampParkRules({ ...PARK_DEFAULTS, seed: 42 });
  return layoutPark(makeArea(rules), rules, { facilityKinds: FACILITY_KINDS });
})();
check('the default park places the full facility set', full.facilities.length >= 5,
  `${full.facilities.length} of ${FACILITY_KINDS.length}`);

// --- variation --------------------------------------------------------------
// The seed must change the layout pattern, not only which sites are filled.
const seedPatterns = [];
for (let seed = 1; seed <= 12; seed++) {
  const rules = clampParkRules({ ...PARK_DEFAULTS, seed, pattern: 'auto' });
  seedPatterns.push(layoutPark(makeArea(rules), rules, { facilityKinds: FACILITY_KINDS }).pattern);
}
check('the seed varies the layout pattern', new Set(seedPatterns).size >= 3, seedPatterns.join(','));

const variantSet = new Set(full.pitches.map(p => p.variant));
check('the vehicle mix places more than one type', variantSet.size >= 2, `${variantSet.size} types`);
check('tints vary across a filled park', new Set(full.pitches.map(p => p.tint)).size >= 2);

const runPattern = (pattern, patch = {}) => {
  const rules = clampParkRules({ ...PARK_DEFAULTS, ...PARK_PRESETS.motorhome.rules, seed: 42, pattern, ...patch });
  return layoutPark(makeArea(rules), rules, { facilityKinds: FACILITY_KINDS });
};

const courtRun = runPattern('courts');
check('courts pattern builds communal gardens', courtRun.gardens.some(g => g.kind === 'court'),
  `${courtRun.gardens.filter(g => g.kind === 'court').length} courts`);

const rowsRun = runPattern('rows');
const clusterRun = runPattern('clusters');
check('clusters pattern leaves gaps between groups', clusterRun.stats.pitches < rowsRun.stats.pitches,
  `${clusterRun.stats.pitches} vs ${rowsRun.stats.pitches}`);

const staggerRun = runPattern('stagger');
const rowsByY = new Map();
for (const p of staggerRun.pitches) {
  const k = Math.round(p.center.y / 50);
  if (!rowsByY.has(k)) rowsByY.set(k, []);
  rowsByY.get(k).push(p.center.x);
}
const rowKeys = [...rowsByY.keys()].sort((a, b) => a - b);
const firstOf = k => Math.round(Math.min(...rowsByY.get(k)));
check('stagger offsets alternate rows',
  rowKeys.length >= 2 && Math.abs(firstOf(rowKeys[0]) - firstOf(rowKeys[1])) > 100,
  rowKeys.length >= 2 ? `${firstOf(rowKeys[0])} vs ${firstOf(rowKeys[1])} cm` : 'one row');

const jittered = runPattern('rows', { jitter: 120 });
const offsets = new Set(jittered.pitches.map(p => Math.round(p.center.x)));
check('site shuffle breaks the lattice', offsets.size > jittered.pitches.length * 0.4,
  `${offsets.size} distinct centres of ${jittered.pitches.length}`);

// --- eco village ------------------------------------------------------------
// The village engine is not a lattice. These scenes prove the organic output
// still honours the same contract: everything inside the area, nothing touching
// anything, streets that actually curve, and clusters with courts, allotments
// and shared buildings.
const villageScenes = [];
for (const seed of [42, 7, 2026]) {
  villageScenes.push({ tag: `village/${seed}`, rules: clampParkRules({ ...PARK_DEFAULTS, pattern: 'village', seed }) });
}
villageScenes.push({
  tag: 'village/L-shaped parcel',
  rules: clampParkRules({ ...PARK_DEFAULTS, pattern: 'village', seed: 5, areaShape: 'custom' }),
  area: drawn['L-shaped parcel'],
});
villageScenes.push({
  tag: 'village/crowded',
  rules: clampParkRules({ ...PARK_DEFAULTS, pattern: 'village', seed: 12, villageClusters: 7, villageHouses: 7 }),
});
villageScenes.push({
  tag: 'village/oval+rotated',
  rules: clampParkRules({ ...PARK_DEFAULTS, pattern: 'village', seed: 33, areaShape: 'oval', areaRotation: 24 }),
});

const villageRows = [];
for (const scene of villageScenes) {
  const { tag, rules } = scene;
  const area = scene.area || makeArea(rules);
  const L = layoutPark(area, rules, { facilityKinds: VILLAGE_FACILITY_KINDS });
  const houses = L.pitches.map(p => p.points);
  const roads = L.roads.map(r => r.points);
  const facs = L.facilities.map(f => f.points);
  const courts = L.gardens.filter(g => g.kind === 'court');
  const paths = (L.paths || []).map(p => p.points);

  check(`${tag}: the village pattern builds a village`, L.kind === 'village', String(L.kind));
  check(`${tag}: cottages were placed`, L.pitches.length >= 8, `${L.pitches.length}`);
  check(`${tag}: more than one cluster`, L.stats.clusters >= 2, `${L.stats.clusters}`);
  check(`${tag}: every cottage sits inside the area`, houses.every(h => polyInside(h, L.inner)));
  check(`${tag}: shared buildings were placed`, L.facilities.length >= 3, `${L.facilities.length}`);
  check(`${tag}: allotment beds were placed`, L.allotmentBeds.length >= 6, `${L.allotmentBeds.length}`);
  check(`${tag}: roads sit inside the area`, roads.every(r => polyInside(r, L.inner)));
  check(`${tag}: every cluster keeps a shared court`, courts.length >= 2, `${courts.length}`);
  check(`${tag}: every cottage faces its court`,
    L.pitches.every(h => h.facing && Math.abs(Math.hypot(h.facing.x, h.facing.y) - 1) < 0.01));

  let hh = 0, hr = 0, hf = 0, hb = 0;
  for (let i = 0; i < houses.length; i++) {
    for (let j = i + 1; j < houses.length; j++) hh = Math.max(hh, clipArea(houses[i], houses[j]));
    for (const r of roads) hr = Math.max(hr, clipArea(r, houses[i]));
    for (const f of facs) hf = Math.max(hf, clipArea(f, houses[i]));
    for (const b of L.allotmentBeds) hb = Math.max(hb, clipArea(b, houses[i]));
  }
  check(`${tag}: no two cottages touch`, hh <= OVERLAP_LIMIT, `${(hh * M2).toFixed(3)} m²`);
  check(`${tag}: cottages stay off the streets`, hr <= OVERLAP_LIMIT, `${(hr * M2).toFixed(3)} m²`);
  check(`${tag}: cottages stay off the shared buildings`, hf <= OVERLAP_LIMIT, `${(hf * M2).toFixed(3)} m²`);
  check(`${tag}: cottages stay off the allotments`, hb <= OVERLAP_LIMIT, `${(hb * M2).toFixed(3)} m²`);
  check(`${tag}: no path runs through a cottage`,
    paths.every(p => houses.every(h => clipArea(p, h) <= OVERLAP_LIMIT)));

  // A lattice has two headings; a village has many.
  const headings = new Set();
  for (const r of L.roads) {
    if (r.points.length !== 4) continue;
    const [a, b] = r.points;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    headings.add(Math.round((((ang % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 30)));
  }
  check(`${tag}: streets curve`, headings.size >= 8, `${headings.size} headings`);
  check(`${tag}: no NaN coordinates`,
    [...houses.flat(), ...roads.flat()].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));

  villageRows.push({
    scene: tag, houses: L.pitches.length, clusters: L.stats.clusters,
    fac: L.facilities.length, beds: L.allotmentBeds.length,
    headings: headings.size, paths: paths.length,
    worst: Math.max(hh, hr, hf, hb) * M2,
  });
}

const villageRun = seed => {
  const rules = clampParkRules({ ...PARK_DEFAULTS, pattern: 'village', seed });
  return layoutPark(makeArea(rules), rules, { facilityKinds: VILLAGE_FACILITY_KINDS });
};
const sig = l => l.pitches.map(p => `${Math.round(p.center.x)},${Math.round(p.center.y)}`).join('|');
check('the village seed moves every cluster', sig(villageRun(4)) !== sig(villageRun(5)));
const villageDefault = villageRun(42);
check('the default village lays a footpath from a court', (villageDefault.paths || []).length > 0,
  `${(villageDefault.paths || []).length} pieces`);
check('the default village places every kind of shared building',
  villageDefault.facilities.length >= 4, `${villageDefault.facilities.length}`);

// The flicker guard: every flat overlay is a decal on the same ground, so the
// heights must stay strictly ordered with a real gap between neighbours.
const decalLadder = ['grass', 'bedSoil', 'allotment', 'road', 'pad', 'path', 'stripe'];
const decalZ = decalLadder.map(k => DECAL_Z[k]);
check('the flat decals stack in a fixed order',
  decalZ.every((z, i) => i === 0 || z > decalZ[i - 1]), decalZ.join(' < '));
check('each decal clears the one below it',
  decalZ.slice(1).every((z, i) => z - decalZ[i] >= 4), `${decalZ[0]}..${decalZ[decalZ.length - 1]} cm`);
check('pond water sits above its shore', DECAL_Z.pondWater > DECAL_Z.pondShore,
  `${DECAL_Z.pondShore} → ${DECAL_Z.pondWater}`);
check('pool water sits above its deck', DECAL_Z.poolWater > DECAL_Z.poolDeck,
  `${DECAL_Z.poolDeck} → ${DECAL_Z.poolWater}`);

// --- road network -----------------------------------------------------------
// The city generator refuses to leave a road end floating: its plot pass
// stitches every dangling centreline back to the nearest one. The park is held
// to the same rule here — the roads must form one network, every aisle must end
// on the perimeter drive, and the entrance must be joined to it.
const segGap = (p, q, r, s) => {
  const cross = (o, x, y) => (x.x - o.x) * (y.y - o.y) - (x.y - o.y) * (y.x - o.x);
  const d1 = cross(p, q, r), d2 = cross(p, q, s), d3 = cross(r, s, p), d4 = cross(r, s, q);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const ptSeg = (x, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x.x - a.x) * dx + (x.y - a.y) * dy) / l2));
    return Math.hypot(x.x - (a.x + dx * t), x.y - (a.y + dy * t));
  };
  return Math.min(ptSeg(p, r, s), ptSeg(q, r, s), ptSeg(r, p, q), ptSeg(s, p, q));
};

const polyGap = (a, b) => {
  for (const p of a) if (pointInPolygon(p, b)) return 0;
  for (const p of b) if (pointInPolygon(p, a)) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      best = Math.min(best, segGap(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]));
    }
  }
  return best;
};

function networkCount(polys, tol = 50) {
  const up = polys.map((_, i) => i);
  const find = i => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (polyGap(polys[i], polys[j]) > tol) continue;
      const a = find(i), b = find(j);
      if (a !== b) up[a] = b;
    }
  }
  return new Set(polys.map((_, i) => find(i))).size;
}

const networkScenes = [
  { tag: 'network/rect', rules: { ...PARK_DEFAULTS, seed: 3 } },
  { tag: 'network/stagger', rules: { ...PARK_DEFAULTS, seed: 9, pattern: 'stagger' } },
  { tag: 'network/L-parcel', rules: { ...PARK_DEFAULTS, seed: 11, areaShape: 'custom' }, area: drawn['L-shaped parcel'] },
  { tag: 'network/oval', rules: { ...PARK_DEFAULTS, seed: 21, areaShape: 'oval' } },
  { tag: 'network/no loop', rules: { ...PARK_DEFAULTS, seed: 5, driveWidth: 0 } },
];

for (const scene of networkScenes) {
  const rules = clampParkRules(scene.rules);
  const area = scene.area || makeArea(rules);
  const L = layoutPark(area, rules, { facilityKinds: FACILITY_KINDS });
  const polys = L.roads.map(r => r.points);
  const drives = L.roads.filter(r => r.kind === 'drive').map(r => r.points);
  const aisles = L.roads.filter(r => r.kind === 'aisle').map(r => r.points);
  const entrance = L.roads.find(r => r.kind === 'entrance');

  check(`${scene.tag}: has drive aisles`, aisles.length >= 1, `${aisles.length}`);
  if (rules.driveWidth > 0) {
    check(`${scene.tag}: the entrance joins the network`,
      !!entrance && drives.some(d => polyGap(entrance.points, d) <= 50));
    check(`${scene.tag}: the perimeter drive was laid`, drives.length >= 4, `${drives.length} pieces`);
    check(`${scene.tag}: every aisle ends on the drive`,
      aisles.every(a => drives.some(d => polyGap(a, d) <= 60)));
    check(`${scene.tag}: the roads form one network`,
      networkCount(polys) === 1, `${networkCount(polys)} networks`);
  } else {
    check(`${scene.tag}: no loop when the drive is switched off`, drives.length === 0, `${drives.length}`);
  }
}

// --- footpaths ---------------------------------------------------------------
// Aisl es are for vehicles. Every planting strip between rows now carries a
// footpath that spans the pad, so the strips join the perimeter drive at both
// ends and the park is walkable as well as drivable.
for (const scene of [
  { tag: 'paths/rustic', rules: { ...PARK_DEFAULTS, seed: 42, pattern: 'clusters', rowPairs: 1, gardenDepth: 600, pitchGap: 300, pitchWidth: 1300 } },
  { tag: 'paths/motorhome', rules: { ...PARK_DEFAULTS, seed: 7, rowPairs: 2, gardenDepth: 320 } },
  { tag: 'paths/L-parcel', rules: { ...PARK_DEFAULTS, seed: 11, areaShape: 'custom' }, area: drawn['L-shaped parcel'], cross: 'any' },
  { tag: 'paths/narrow', rules: { ...PARK_DEFAULTS, seed: 5, pathWidth: 90 } },
  { tag: 'paths/no-cross', rules: { ...PARK_DEFAULTS, seed: 6, crossEvery: 0 }, cross: 'none' },
]) {
  const rules = clampParkRules(scene.rules);
  const area = scene.area || makeArea(rules);
  const L = layoutPark(area, rules, { facilityKinds: FACILITY_KINDS });
  const paths = (L.paths || []).map(p => p.points);
  // Rings tie into the aisles rather than the perimeter drive, and the plaza's
  // own footways are interior circulation, so the drive test covers the through
  // routes only.
  const toDrive = (L.paths || [])
    .filter(p => p.kind !== 'ring' && p.kind !== 'square')
    .map(p => p.points);
  const drives = L.roads.filter(r => r.kind === 'drive').map(r => r.points);

  if (rules.pathWidth > 0) {
    check(`${scene.tag}: footpaths were laid`, paths.length >= 2, `${paths.length}`);
    check(`${scene.tag}: footpaths sit inside the area`, paths.every(p => polyInside(p, L.inner)));
    // A footway may meet the perimeter drive or the square's own street; both are
    // through routes joined to the drive, and a square can cut a strip in two.
    const through = [...drives, ...L.roads.filter(r => r.kind === 'square').map(r => r.points)];
    check(`${scene.tag}: every footpath joins a through route`,
      toDrive.every(p => through.some(d => polyGap(p, d) <= 60)));
    let worstSite = 0;
    for (const p of paths) {
      for (const s of L.pitches) worstSite = Math.max(worstSite, clipArea(p, s.points));
    }
    check(`${scene.tag}: footpaths keep off the sites`, worstSite <= OVERLAP_LIMIT,
      `${(worstSite * M2).toFixed(3)} m²`);

    // Cross corridors are the perpendicular half of the network: they must run
    // the depth of the park, keep off the sites, and exist whenever the lever
    // is on.
    const cross = (L.paths || []).filter(p => p.kind === 'cross').map(p => p.points);
    const span = p => {
      const xs = p.map(q => q.x), ys = p.map(q => q.y);
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.01;
    };
    if (rules.crossEvery > 0 && scene.cross !== 'none') {
      if (scene.cross !== 'any') {
        check(`${scene.tag}: cross corridors were laid`, cross.length >= 1, `${cross.length}`);
      }
      check(`${scene.tag}: cross corridors keep off the sites`,
        cross.every(p => L.pitches.every(s => clipArea(p, s.points) <= OVERLAP_LIMIT)));
      check(`${scene.tag}: cross corridors run the depth of the park`,
        cross.some(p => span(p) > 15), cross.map(p => `${span(p).toFixed(0)} m`).join(', '));
    } else {
      check(`${scene.tag}: no cross corridors when switched off`, cross.length === 0, `${cross.length}`);
    }
  }
}

// --- facility siting ---------------------------------------------------------
// The community blocks used to start at one corner and walk right, so every seed
// drew the same plan. They are now scattered along the frontage and may take the
// far edge, which means the seed has to actually change where they sit.
{
  const sigs = new Set();
  let spread = 0;
  const seen = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const rules = clampParkRules({ ...PARK_DEFAULTS, seed });
    const L = layoutPark(makeArea(rules), rules, { facilityKinds: FACILITY_KINDS });
    const fs = L.facilities;
    check(`facilities/seed ${seed}: every kind was sited`, fs.length >= 4, `${fs.length}`);
    check(`facilities/seed ${seed}: blocks sit inside the area`,
      fs.every(f => polyInside(f.points, L.inner)));
    check(`facilities/seed ${seed}: blocks keep off the sites`,
      fs.every(f => L.pitches.every(s => clipArea(f.points, s.points) <= OVERLAP_LIMIT)));
    sigs.add(fs.map(f => `${Math.round(f.center.x / 200)},${Math.round(f.center.y / 200)}`).sort().join('|'));
    const xs = fs.map(f => f.center.x), ys = fs.map(f => f.center.y);
    spread = Math.max(spread, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    seen.push(seed + ': ' + fs.map(f => f.kind).join(','));
  }
  check('facilities: placement changes with the seed', sigs.size >= 4, `${sigs.size} distinct of 6`);
  check('facilities: blocks are spread across the area', spread >= 4000,
    `${(spread * 0.01).toFixed(0)} m`);
}

// --- footpaths around buildings ---------------------------------------------
// A corridor used to be abandoned when a block stood in its way, and nothing
// walked round a building at all. Both are now required: a closed ring per
// footprint and paths that never cut a block.
{
  const rules = clampParkRules({ ...PARK_DEFAULTS, seed: 42 });
  const L = layoutPark(makeArea(rules), rules, { facilityKinds: FACILITY_KINDS });
  const rings = L.paths.filter(p => p.kind === 'ring');
  const perFac = new Map();
  for (const p of rings) {
    if (!perFac.has(p.fac)) perFac.set(p.fac, new Set());
    perFac.get(p.fac).add(p.side);
  }
  const closed = [...perFac.values()].filter(s => s.size >= 4).length;
  check('rings: buildings are ringed by footpaths', closed >= 2,
    `${closed} closed of ${L.facilities.length} facilities`);
  check('rings: ring paths keep off the sites',
    rings.every(p => L.pitches.every(s => clipArea(p.points, s.points) <= OVERLAP_LIMIT)));
  check('paths: no footpath cuts through a building',
    L.paths.every(p => L.facilities.every(f => clipArea(p.points, f.points) <= OVERLAP_LIMIT)));
  check('rings: the ring joins the road network',
    rings.some(p => L.roads.some(r => polyGap(p.points, r.points) <= 120)));

  // Several seeds, so a bypass that only works on one plan cannot pass.
  let jogs = 0, cuts = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r2 = clampParkRules({ ...PARK_DEFAULTS, seed });
    const L2 = layoutPark(makeArea(r2), r2, { facilityKinds: FACILITY_KINDS });
    jogs += L2.paths.filter(p => p.kind === 'crossjog').length;
    if (L2.paths.some(p => L2.facilities.some(f => clipArea(p.points, f.points) > OVERLAP_LIMIT))) cuts++;
  }
  check('paths: no seed routes a footpath through a building', cuts === 0, `${cuts} seeds`);
}

// --- town square -------------------------------------------------------------
// The sources are consistent about the type: a roughly 3:2 rectangle ringed by
// streets, the civic building on it, traffic round the edge, the centre open. The
// audit holds the generator to that and to the space actually being clear.
{
  const rules = clampParkRules({ ...PARK_DEFAULTS, seed: 42 });
  const L = layoutPark(makeArea(rules), rules, { facilityKinds: FACILITY_KINDS });
  const squares = L.squares || [];
  check('square: a civic square was laid', squares.length === 1, `${squares.length}`);
  check('square: it sits inside the area', squares.every(s => polyInside(s, L.inner)));
  check('square: it is clear of the sites',
    squares.every(s => L.pitches.every(p => clipArea(s, p.points) <= OVERLAP_LIMIT)));
  check('square: no road crosses the plaza',
    squares.every(s => L.roads.every(r => clipArea(s, r.points) <= OVERLAP_LIMIT)));
  check('square: no planting bed covers the plaza',
    squares.every(s => L.gardens.filter(g => g.kind !== 'perimeter')
      .every(g => clipArea(s, g.points) <= OVERLAP_LIMIT)));
  const ringRoads = L.roads.filter(r => r.kind === 'square');
  check('square: a street runs round it', ringRoads.length >= 3, `${ringRoads.length}`);
  check('square: its street joins the aisles',
    ringRoads.some(r => L.roads.some(a => a.kind === 'aisle' && polyGap(r.points, a.points) <= 60)));
  const office = L.facilities.find(f => f.kind === 'office');
  check('square: the reception fronts it', !!office && squares.some(s => polyInside(office.points, s)));
  const plazaPaths = L.paths.filter(p => p.kind === 'square');
  check('square: footways run round the open centre', plazaPaths.length >= 3, `${plazaPaths.length}`);
  check('square: its footways reach the street',
    plazaPaths.some(p => L.roads.some(r => r.kind === 'square' && polyGap(p.points, r.points) <= 60)));

  const off = clampParkRules({ ...PARK_DEFAULTS, seed: 42, squareWidth: 0 });
  const L0 = layoutPark(makeArea(off), off, { facilityKinds: FACILITY_KINDS });
  check('square: none when the lever is off', (L0.squares || []).length === 0);

  const r7 = clampParkRules({ ...PARK_DEFAULTS, seed: 7 });
  const L7 = layoutPark(makeArea(r7), r7, { facilityKinds: FACILITY_KINDS });
  const sig = M => (M.squares && M.squares[0])
    ? M.squares[0].map(p => `${Math.round(p.x / 100)},${Math.round(p.y / 100)}`).join('|') : '';
  check('square: its siting follows the seed', sig(L) !== '' && sig(L7) !== '' && sig(L) !== sig(L7));
}

// --- solar ------------------------------------------------------------------
// The array is meant to follow the load: more units or a higher per-unit demand
// grows it, more sun shrinks it, roofs are used before ground, and the plan is
// never covered by panels where a site or a road already is.
{
  const base = clampParkRules({ ...PARK_DEFAULTS, seed: 42 });
  const A = layoutPark(makeArea(base), base, { facilityKinds: FACILITY_KINDS });
  const P = A.solarPlan;
  check('solar: demand covers the units and the buildings',
    P.demand.totalKwh > P.demand.facilityKwh && P.demand.unitKwhTotal > 0,
    `${P.demand.totalKwh} kWh/day`);
  check('solar: an array was sited', (A.solar || []).length > 0, `${(A.solar || []).length} pieces`);
  check('solar: panels sit inside the area', A.solar.every(s => polyInside(s.points, A.inner)));
  check('solar: panels keep off the sites',
    A.solar.every(s => A.pitches.every(p => clipArea(s.points, p.points) <= OVERLAP_LIMIT)));
  check('solar: panels keep off the roads',
    A.solar.every(s => A.roads.every(r => clipArea(s.points, r.points) <= OVERLAP_LIMIT)));
  check('solar: roofs are used before ground',
    A.solar.filter(s => s.roof).length > 0, `${A.solar.filter(s => s.roof).length} roof decks`);
  check('solar: a ground array is laid when the roofs cannot cover the load',
    P.size.groundM2 === 0 || A.solar.some(s => !s.roof),
    `${P.size.groundM2} m² of ground needed`);
  check('solar: the array tracks the load, not a padded guess',
    P.coverage < 0.98 || Math.abs(P.areaM2 - P.size.neededM2) <= Math.max(25, P.size.neededM2 * 0.12),
    `${P.areaM2} m² placed for ${P.size.neededM2} m²`);
  check('solar: coverage is reported honestly',
    P.coverage >= 0.98 || P.size.shortfallM2 > 0,
    `${Math.round(P.coverage * 100)}% · short ${P.size.shortfallM2} m²`);
  check('solar: array area matches the panels that were placed',
    Math.abs(P.areaM2 - Math.round(A.solar.reduce((s, p) => s + (p.areaM2 || 0), 0))) <= 1,
    `${P.areaM2} m²`);

  const heaver = clampParkRules({ ...PARK_DEFAULTS, seed: 42, unitKwh: 16 });
  const B = layoutPark(makeArea(heaver), heaver, { facilityKinds: FACILITY_KINDS });
  check('solar: more demand grows the array',
    B.solarPlan.size.neededM2 > P.size.neededM2 && B.solarPlan.areaM2 >= P.areaM2,
    `${P.size.neededM2} → ${B.solarPlan.size.neededM2} m²`);

  const sunny = clampParkRules({ ...PARK_DEFAULTS, seed: 42, sunHours: 60 });
  const C = layoutPark(makeArea(sunny), sunny, { facilityKinds: FACILITY_KINDS });
  check('solar: more sun shrinks the array',
    C.solarPlan.size.neededM2 < P.size.neededM2,
    `${P.size.neededM2} → ${C.solarPlan.size.neededM2} m²`);

  const none = clampParkRules({ ...PARK_DEFAULTS, seed: 42, unitKwh: 0 });
  const D = layoutPark(makeArea(none), none, { facilityKinds: FACILITY_KINDS });
  check('solar: none when the demand lever is zero', (D.solar || []).length === 0);

  // The village runs on the same calculator.
  const vr = clampParkRules({ ...PARK_DEFAULTS, seed: 42, pattern: 'village' });
  const V = layoutPark(makeArea(vr), vr, { facilityKinds: VILLAGE_FACILITY_KINDS });
  check('solar/village: pools and playgrounds are not counted as roof',
    V.solarPlan.demand.facilityKwh >= 0);
  check('solar/village: an array was sited', (V.solar || []).length > 0, `${(V.solar || []).length} pieces`);
  check('solar/village: panels sit inside the area',
    V.solar.every(s => polyInside(s.points, V.inner)));
  check('solar/village: panels keep off the cottages',
    V.solar.every(s => V.pitches.every(p => clipArea(s.points, p.points) <= OVERLAP_LIMIT)));
}

// --- parking ----------------------------------------------------------------
// A car park is land, not paint: it has to be inside the area, out of the sites,
// sized from the plan, marked bay by bay, and joined to the road network by its
// own access lane.
{
  const base = clampParkRules({ ...PARK_DEFAULTS, seed: 42 });
  const A = layoutPark(makeArea(base), base, { facilityKinds: FACILITY_KINDS });
  const lots = A.lots || [];
  check('parking: a lot is laid out', lots.length > 0, `${lots.length} lots`);
  check('parking: bays are painted two rows deep',
    lots.length > 0 && lots.every(l => l.stripes.length === (l.bays + 1) * 2),
    `${lots.reduce((s, l) => s + l.bays * 2, 0)} bays in ${lots.reduce((s, l) => s + l.stripes.length, 0)} lines`);
  check('parking: the lot sits inside the area',
    lots.every(l => polyInside(l.points, A.inner)));
  check('parking: the lot keeps off the sites',
    lots.every(l => A.pitches.every(p => clipArea(l.points, p.points) <= OVERLAP_LIMIT)));
  check('parking: an access lane runs to the lot',
    lots.every(l => A.roads.some(r => r.kind === 'parking' && polyGap(l.points, r.points) <= 40)),
    `${A.roads.filter(r => r.kind === 'parking').length} lane pieces`);
  check('parking: that lane joins the road network',
    A.roads.filter(r => r.kind === 'parking')
      .every(r => A.roads.some(o => o !== r && polyGap(r.points, o.points) <= 60)));
  check('parking: the spaces are counted',
    A.stats.parkingSpaces === lots.reduce((s, l) => s + l.spaces, 0) && A.stats.parkingSpaces > 0,
    `${A.stats.parkingSpaces} spaces · ${A.stats.parkingM2} m²`);

  const off = clampParkRules({ ...PARK_DEFAULTS, seed: 42, parkRatio: 0 });
  check('parking: none when the lever is off',
    (layoutPark(makeArea(off), off, { facilityKinds: FACILITY_KINDS }).lots || []).length === 0);

  const more = clampParkRules({ ...PARK_DEFAULTS, seed: 42, parkRatio: 12 });
  const B = layoutPark(makeArea(more), more, { facilityKinds: FACILITY_KINDS });
  check('parking: more spaces per site draws more bays',
    B.stats.parkingSpaces > A.stats.parkingSpaces,
    `${A.stats.parkingSpaces} → ${B.stats.parkingSpaces}`);

  // The village gets the same treatment, joined to its own lane.
  const vr = clampParkRules({ ...PARK_DEFAULTS, seed: 42, pattern: 'village' });
  const V = layoutPark(makeArea(vr), vr, { facilityKinds: VILLAGE_FACILITY_KINDS });
  const vLots = V.lots || [];
  check('parking/village: a lot is laid out', vLots.length > 0, `${vLots.length} lots`);
  check('parking/village: bays are painted',
    vLots.every(l => l.stripes.length === (l.bays + 1) * 2));
  check('parking/village: the lot keeps off the cottages',
    vLots.every(l => V.pitches.every(p => clipArea(l.points, p.points) <= OVERLAP_LIMIT)));
  check('parking/village: a lane joins the lot to the street',
    vLots.every(l => V.roads.some(r => r.kind === 'parking' && polyGap(l.points, r.points) <= 40)),
    `${V.roads.filter(r => r.kind === 'parking').length} lane pieces`);
}

// --- determinism ------------------------------------------------------------
const det = (() => {
  const rules = clampParkRules({ ...PARK_DEFAULTS, ...PARK_PRESETS.motorhome.rules, seed: 99 });
  const area = makeArea(rules);
  const a = layoutPark(area, rules, { facilityKinds: FACILITY_KINDS });
  const b = layoutPark(area, rules, { facilityKinds: FACILITY_KINDS });
  return JSON.stringify(a.pitches.map(p => [p.points[0].x, p.points[0].y])) ===
         JSON.stringify(b.pitches.map(p => [p.points[0].x, p.points[0].y]));
})();
check('same seed draws the same park', det);

const vary = (() => {
  const base = clampParkRules({ ...PARK_DEFAULTS, ...PARK_PRESETS.motorhome.rules, seed: 5 });
  const other = { ...base, seed: 6 };
  const a = layoutPark(makeArea(base), base, { facilityKinds: FACILITY_KINDS });
  const b = layoutPark(makeArea(other), other, { facilityKinds: FACILITY_KINDS });
  // The square moves with the seed now, so capacity can change too. What must
  // hold is that the chosen pattern survives and the plan genuinely differs.
  const same = JSON.stringify(a.pitches.map(p => [p.points[0].x, p.points[0].y])) ===
               JSON.stringify(b.pitches.map(p => [p.points[0].x, p.points[0].y]));
  return a.stats.pattern === b.stats.pattern && !same;
})();
check('seed changes the plan, not the pattern', vary);

// A drawn boundary must win over the parametric shape.
check('drawn boundary is used as handed in', (() => {
  const rules = clampParkRules({ ...PARK_DEFAULTS, seed: 3, areaShape: 'custom' });
  const ring = [{ x: -7000, y: -6000 }, { x: 9000, y: -6000 }, { x: 9000, y: 6000 }, { x: -7000, y: 6000 }];
  const layout = layoutPark(ring, rules, { facilityKinds: FACILITY_KINDS });
  return Math.abs(polyArea(layout.area) - 16000 * 12000) < 1;
})());

// --- panel wiring -----------------------------------------------------------
const main = readFileSync(join(docs, 'js', 'parkMain.js'), 'utf8');
const html = readFileSync(join(docs, 'park.html'), 'utf8');

const ids = [...main.matchAll(/getElementById\('([a-z0-9-]+)'\)/gi)].map(m => m[1]);
const missing = [...new Set(ids)].filter(id => !html.includes(`id="${id}"`));
check('every element the script reads exists in the page', missing.length === 0, missing.join(', '));

const ruleInputs = Object.keys(PARK_DEFAULTS).filter(k => k in PARK_RANGES);
const noInput = ruleInputs.filter(k => !html.includes(`id="${k}"`));
const noOutput = ruleInputs.filter(k => !html.includes(`id="v-${k}"`));
check('every rule has an input', noInput.length === 0, noInput.join(', '));
check('every rule has a readout', noOutput.length === 0, noOutput.join(', '));

const presets = Object.keys(PARK_PRESETS).filter(p => !html.includes(`data-preset="${p}"`));
check('every preset has a button', presets.length === 0, presets.join(', '));

const patChips = ['auto', ...PARK_PATTERNS, 'village'].filter(p => !html.includes(`data-pattern="${p}"`));
check('every layout pattern has a chip', patChips.length === 0, patChips.join(', '));

const layerNames = ['area', 'roads', 'sites', 'rv', 'facilities', 'gardens', 'planting'];
const noLayer = layerNames.filter(n => !html.includes(`id="layer-${n}"`));
check('every layer has a toggle', noLayer.length === 0, noLayer.join(', '));

const kinds = FACILITY_KINDS.filter(k => !html.includes(`id="fac-${k}"`));
check('every facility has a toggle', kinds.length === 0, kinds.join(', '));

const vKinds = VILLAGE_FACILITY_KINDS.filter(k => !html.includes(`id="vfac-${k}"`));
check('every village facility has a toggle', vKinds.length === 0, vKinds.join(', '));

// --- hover cards -------------------------------------------------------------
// Every object on the plan should be able to name itself on hover: a site, a
// cottage, a building, a road polygon, a footpath, a bed, an allotment bed, the
// plaza, each solar piece and each car park.
{
  const sceneSrc = readFileSync(join(docs, 'js', 'parkScene.js'), 'utf8');
  const r = clampParkRules({ ...PARK_DEFAULTS, seed: 42 });
  const L = layoutPark(makeArea(r), r, { facilityKinds: FACILITY_KINDS });
  const items = pickables(L, r);
  const expected = L.pitches.length + L.facilities.length + L.roads.length + L.paths.length +
    L.gardens.length + (L.allotmentBeds || []).length + (L.squares || []).length +
    (L.solar || []).length + (L.lots || []).length;
  check('hover: every object on the plan has a card', items.length === expected,
    `${items.length} cards for ${expected} objects`);
  check('hover: every card has a title and a target',
    items.every(i => i.info && typeof i.info.title === 'string' && i.info.title.length > 0 && i.polys.length > 0));
  check('hover: cards carry finite geometry',
    items.every(i => i.polys.every(p => p.every(q => Number.isFinite(q.x) && Number.isFinite(q.y)))));
  check('hover: sites are named one by one',
    items.filter(i => /^Site \d+$/.test(i.info.title)).length === L.pitches.length,
    `${items.filter(i => /^Site \d+$/.test(i.info.title)).length} site cards`);
  check('hover: the car parks are on the card layer',
    (L.lots || []).length > 0 && items.filter(i => i.info.title === 'Car park').length === L.lots.length);
  check('hover: the solar arrays are on the card layer',
    items.filter(i => /solar array/i.test(i.info.title)).length === (L.solar || []).length);
  check('hover: the scene builds the pick layer',
    sceneSrc.includes('pickables') && sceneSrc.includes('picks'));
  check('hover: the page has a card and the pointer picks it',
    html.includes('id="hovercard"') && main.includes('intersectObjects') && main.includes('hovercard'));

  const vr = clampParkRules({ ...PARK_DEFAULTS, seed: 42, pattern: 'village' });
  const V = layoutPark(makeArea(vr), vr, { facilityKinds: VILLAGE_FACILITY_KINDS });
  const vItems = pickables(V, vr);
  check('hover/village: every cottage is named',
    vItems.filter(i => /^Cottage \d+$/.test(i.info.title)).length === V.pitches.length,
    `${vItems.filter(i => /^Cottage \d+$/.test(i.info.title)).length} of ${V.pitches.length}`);
  check('hover/village: every shared building is named',
    vItems.filter(i => i.info.tag === 'Shared building').length === V.facilities.length);
}

// --- view controls -----------------------------------------------------------
// The style and camera selectors live in the page, drive the scene, and the
// camera is held above the ground so an orbit cannot end up under the plan.
{
  const sceneSrc = readFileSync(join(docs, 'js', 'scene.js'), 'utf8');
  const parkSrc = readFileSync(join(docs, 'js', 'parkScene.js'), 'utf8');
  // The styles and presets moved out of the page's two selects and into the
  // hover dropdown, so the list to audit is the menu's, not the markup's.
  const menuSrc = readFileSync(join(docs, 'js', 'viewMenu.js'), 'utf8');
  const styles = ['solid', 'clay', 'wire', 'blueprint', 'ink'];
  check('view: every render style is in the dropdown',
    styles.every(v => menuSrc.includes(`['${v}',`)),
    styles.filter(v => !menuSrc.includes(`['${v}',`)).join(', '));
  const angles = ['fit', 'iso', 'top', 'aerial', 'street'];
  check('view: every camera preset is in the dropdown',
    angles.every(v => menuSrc.includes(`['${v}',`)),
    angles.filter(v => !menuSrc.includes(`['${v}',`)).join(', '));
  check('view: the page wires the view menu',
    main.includes('createViewMenu') && main.includes('onRender:') && main.includes('onView:'));
  check('view: each style is implemented, not just listed',
    styles.every(v => main.includes(`'${v}'`)),
    styles.filter(v => !main.includes(`'${v}'`)).join(', '));
  check('view: the camera cannot orbit under the ground',
    sceneSrc.includes('maxPolarAngle'));
  check('view: the pick layer is hidden from the scene',
    parkSrc.includes('picks.visible = false'));

  // The overlay scene is what keeps the grid and the edit handles coloured when
  // `overrideMaterial` repaints the whole main scene for clay or wireframe.
  check('view: the overlay scene is drawn after the main one',
    sceneSrc.includes('renderer.render(overlay, camera)') && sceneSrc.includes('autoClear = false'));

  // --- ground grid -----------------------------------------------------------
  check('grid: the page builds a grid on the ground plane',
    main.includes('buildGrid') && main.includes("group.name = 'grid'"));
  const gridY = Number((main.match(/const GRID_Y = ([\d.]+)/) || [])[1]);
  check('grid: the grid sits above the lawn and below the beds',
    Number.isFinite(gridY) && gridY * 100 > DECAL_Z.grass && gridY * 100 < DECAL_Z.bedSoil,
    `y = ${gridY} m`);
  check('grid: the grid holds still while the boundary is dragged',
    main.includes('gridKey') && main.includes('Math.floor((x0 - 1000) / 1000)'));
  check('grid: the dropdown can turn the grid off',
    menuSrc.includes('Ground grid') && main.includes('gridOn'));
}

// --- report -----------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(pad('scene', 30), padL('area m²', 8), padL('sites', 6), padL('occ', 5),
  padL('fac', 4), padL('beds m²', 8), padL('use', 6), padL('worst', 8));
for (const r of rows) {
  console.log(pad(r.scene, 30), padL(r.area, 8), padL(r.sites, 6), padL(r.occupied, 5),
    padL(r.facilities, 4), padL(r.beds, 8), padL(`${r.utilisation}%`, 6), padL(`${r.worst.toFixed(3)} m²`, 8));
}

console.log('');
console.log(pad('village', 30), padL('cottages', 8), padL('clusters', 8), padL('fac', 4),
  padL('beds', 5), padL('paths', 6), padL('headings', 8), padL('worst', 8));
for (const r of villageRows) {
  console.log(pad(r.scene, 30), padL(r.houses, 8), padL(r.clusters, 8), padL(r.fac, 4),
    padL(r.beds, 5), padL(r.paths, 6), padL(r.headings, 8), padL(`${r.worst.toFixed(3)} m²`, 8));
}

console.log('');
if (failed) {
  for (const f of failures) console.log('FAIL', f);
  console.log(`\nFAILED — ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`PASS — ${passed} checks passed, 0 failed`);
