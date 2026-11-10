// dwellings.js — the building library.
//
// A pitch is a site; what stands on it is a choice. Every entry below describes
// one unit in plan terms (frontage across, depth along, height) and draws itself
// through a small toolkit the renderer hands in:
//
//   box(bucket, cx, cy, across, len, h, angle, base)   a slab in the site frame
//   tri(bucket, [p, p, p])                             plan centimetres + height
//   house(bucket, site)                                the village cottage
//
// Nothing here imports three.js or touches the DOM, so the catalogue can be
// measured headlessly by tools/edit-check.mjs — every unit is drawn into a
// recording toolkit and checked against the pitch it claims to fit — while the
// renderer turns the same calls into geometry. That matters because the declared
// frontage and depth are what the inspector reports and what the fit warning
// compares against, so they must not drift away from what is actually drawn.
//
// Coordinates are centimetres (100 units = 1 m), the same as the generators.

// frontage/depth are the drawn envelope including awnings and overhangs, not the
// body box, so the fit check means something.
export const DWELLINGS = [
  { id: 'rv',      label: 'Motorhome', w: 540, d: 1400, h: 360, kind: 'vehicle' },
  { id: 'caravan', label: 'Caravan',   w: 520, d: 1000, h: 380, kind: 'vehicle' },
  { id: 'tiny',    label: 'Tiny home', w: 300, d: 780,  h: 460, kind: 'building' },
  { id: 'cabin',   label: 'Cabin',     w: 480, d: 1000, h: 520, kind: 'building' },
  { id: 'prefab',  label: 'Prefab',    w: 660, d: 1060, h: 580, kind: 'building' },
  { id: 'cottage', label: 'Cottage',   w: 800, d: 1000, h: 500, kind: 'building' },
  { id: 'yurt',    label: 'Yurt',      w: 600, d: 600,  h: 450, kind: 'structure' },
  { id: 'dome',    label: 'Dome',      w: 720, d: 720,  h: 480, kind: 'structure' },

  // Amenities: the things a park puts in the middle of the site rather than on
  // a pitch. They are in the same catalogue because a site is a site — a glass
  // pyramid or a yoga hall stands on one just as a motorhome does.
  { id: 'pyramid', label: 'Glass pyramid', w: 700, d: 700,  h: 470, kind: 'amenity' },
  { id: 'gazebo',  label: 'Gazebo',        w: 440, d: 440,  h: 560, kind: 'amenity' },
  { id: 'yoga',    label: 'Yoga hall',     w: 700, d: 1360, h: 600, kind: 'amenity' },
  { id: 'stage',   label: 'Stage',         w: 860, d: 820,  h: 540, kind: 'amenity' },
  { id: 'temple',  label: 'Temple',        w: 760, d: 960,  h: 540, kind: 'amenity' },
];

// The picker groups by kind, so eight units did not become thirteen in one flat
// list.
export const DWELLING_KINDS = {
  vehicle: 'Vehicles', building: 'Homes', structure: 'Structures', amenity: 'Amenities',
};

const mod = (v, n) => ((v % n) + n) % n;

export function dwellingOf(id) {
  return DWELLINGS.find(d => d.id === id) || null;
}

export function dwellingLabel(id) {
  const type = dwellingOf(id);
  return type ? type.label : 'Unit';
}

// What a site gets when it has not been given anything: the village engine
// builds cottages, the RV engine parks motorhomes.
export function defaultDwelling(layout) {
  return layout && layout.kind === 'village' ? 'cottage' : 'rv';
}

// Four motorhome layouts, kept from the original renderer: motorhome, caravan +
// car, fifth wheel + pickup, campervan.
const RV_SPECS = [
  { len: 740, h: 260, W: 235, cab: 150, cabH: 155, base: 60 },
  { len: 620, h: 250, W: 230, cab: 380, cabH: 125, base: 40 },
  { len: 780, h: 300, W: 240, cab: 500, cabH: 180, base: 55 },
  { len: 560, h: 235, W: 220, cab: 0, cabH: 0, base: 45 },
];

// A pitched roof over a rectangle, ridge along the site's facing axis, with a
// gable triangle closing each end.
function gableRoof(t, roofMat, wallMat, P3, len, across, z0, roofH) {
  const halfL = len / 2 + 20, halfW = across / 2 + 20;
  for (const s of [-1, 1]) {
    const e0 = P3(-halfL, s * halfW, z0);
    const e1 = P3(halfL, s * halfW, z0);
    const r1 = P3(halfL, 0, z0 + roofH);
    const r0 = P3(-halfL, 0, z0 + roofH);
    t.tri(roofMat, [e0, e1, r1]);
    t.tri(roofMat, [e0, r1, r0]);
  }
  for (const du of [-len / 2, len / 2]) {
    t.tri(wallMat, [P3(du, -across / 2, z0), P3(du, across / 2, z0), P3(du, 0, z0 + roofH)]);
  }
}

// A geodesic shell: an octahedron subdivided twice, every vertex pushed out to
// the radius, and anything below ground clamped flat so it sits on the pad.
function icosphere(subdiv) {
  let verts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let faces = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
  ];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map();
    const mid = (i, j) => {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (cache.has(key)) return cache.get(key);
      const a = verts[i], b = verts[j];
      const v = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      const idx = verts.length;
      verts.push([v[0] / l, v[1] / l, v[2] / l]);
      cache.set(key, idx);
      return idx;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = next;
  }
  return { verts, faces };
}

function drawRv(t, bk, site, a, tint, P, variant) {
  const spec = RV_SPECS[mod(variant, 4)];
  const body = P(-180, 0);
  t.box(bk.body[tint], body.x, body.y, spec.W, spec.len, spec.h, a, spec.base);
  if (spec.cab > 0) {
    const cab = P(-180 + spec.len / 2 + spec.cab / 2 - 30, 0);
    t.box(bk.trim, cab.x, cab.y, spec.W - 15, spec.cab, spec.cabH, a, spec.base);
  }
  t.box(bk.glass, body.x, body.y, spec.W + 28, spec.len - 90, 55, a, spec.base + spec.h * 0.5);
  for (const d of [-spec.len / 2 + 130, spec.len / 2 - 130]) {
    const w = P(-180 + d, 0);
    t.box(bk.wheel, w.x, w.y, 250, 70, 68, a, 4);
  }
  const awning = P(-180, spec.W / 2 + 45);
  t.box(bk.awning[tint], awning.x, awning.y, 200, spec.len - 140, 8, a, spec.base + 200);
  const door = P(-180, -(spec.W / 2 + 6));
  t.box(bk.glass, door.x, door.y, 8, 92, 180, a, spec.base);
}

function drawTiny(t, bk, P, P3, a, tint) {
  const c = { x: P(0, 0).x, y: P(0, 0).y };
  const wallMat = bk.wall[tint];
  const roofMat = bk.roof[tint % 3];
  t.box(bk.metal, c.x, c.y, 270, 760, 30, a, 40);
  t.box(wallMat, c.x, c.y, 250, 730, 260, a, 70);
  gableRoof(t, roofMat, wallMat, P3, 730, 250, 330, 120);
  t.box(bk.glass, c.x, c.y, 264, 480, 90, a, 170);
  const door = P(300, 0);
  t.box(bk.glass, door.x, door.y, 90, 10, 190, a, 70);
}

function drawCabin(t, bk, P, P3, a, tint) {
  const c = { x: P(0, 0).x, y: P(0, 0).y };
  const wallMat = bk.wall[tint];
  const roofMat = bk.roof[tint % 3];
  t.box(wallMat, c.x, c.y, 430, 760, 300, a, 20);
  gableRoof(t, roofMat, wallMat, P3, 760, 430, 320, 200);
  const deck = P(480, 0);
  t.box(bk.wall[tint], deck.x, deck.y, 430, 160, 20, a, 10);
  for (const dv of [-190, 0, 190]) {
    const post = P(560, dv);
    t.box(bk.trim, post.x, post.y, 14, 14, 210, a, 20);
  }
  t.box(bk.glass, c.x, c.y, 444, 420, 90, a, 150);
  const door = P(380, 0);
  t.box(bk.glass, door.x, door.y, 95, 10, 195, a, 20);
}

function drawPrefab(t, bk, P, a, tint) {
  const c = { x: P(0, 0).x, y: P(0, 0).y };
  t.box(bk.wall[tint], c.x, c.y, 620, 1020, 520, a, 30);
  // A flat roof with a small overhang and a band of glazing on both floors.
  t.box(bk.metal, c.x, c.y, 660, 1060, 22, a, 550);
  t.box(bk.glass, c.x, c.y, 640, 1040, 110, a, 90);
  t.box(bk.glass, c.x, c.y, 640, 1040, 90, a, 330);
  const door = P(520, 120);
  t.box(bk.glass, door.x, door.y, 100, 12, 200, a, 30);
}

function drawDome(t, bk, P, a, tint) {
  const r = 340;
  const base = 25;
  const { verts, faces } = icosphere(2);
  const bucket = bk.wall[tint];
  const c = P(0, 0);
  for (const [ia, ib, ic] of faces) {
    const p = [verts[ia], verts[ib], verts[ic]].map(v => ({
      x: c.x + v[0] * r,
      y: Math.max(0, v[1] * r) + base,
      z: c.y + v[2] * r,
    }));
    // The buried half: a face entirely on the ground is the flat skirt, skip it.
    if (p.every(q => q.y <= base + 0.001)) continue;
    t.tri(bucket, p);
  }
  const door = P(r * 0.94, 0);
  t.box(bk.glass, door.x, door.y, 90, 14, 185, a, base);
}

function drawYurt(t, bk, P3, a, tint) {
  const r = 280, wallH = 190, roofH = 230, base = 20;
  const n = 12;
  const ring = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    ring.push({ du: Math.cos(th) * r, dv: Math.sin(th) * r });
  }
  const wallMat = bk.wall[tint];
  const roofMat = bk.roof[tint % 3];
  const apex = P3(0, 0, base + wallH + roofH);
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const A = P3(p.du, p.dv, base);
    const B = P3(q.du, q.dv, base);
    const C = P3(q.du, q.dv, base + wallH);
    const D = P3(p.du, p.dv, base + wallH);
    t.tri(wallMat, [A, B, C]);
    t.tri(wallMat, [A, C, D]);
    t.tri(roofMat, [D, C, apex]);
  }
  t.tri(bk.glass, [P3(r * 0.96, -45, base), P3(r * 0.96, 45, base), P3(r * 0.96, 45, base + 175)]);
  t.tri(bk.glass, [P3(r * 0.96, -45, base), P3(r * 0.96, 45, base + 175), P3(r * 0.96, -45, base + 175)]);
}

// A glass pyramid: four glazed faces over a shallow kerb, so it reads as a light
// structure rather than a solid one.
function drawPyramid(t, bk, P, P3, a) {
  const half = 330, base = 18, apexH = 420;
  const c = P(0, 0);
  t.box(bk.metal, c.x, c.y, 690, 690, 22, a, 0);
  const corners = [P3(-half, -half, base), P3(half, -half, base), P3(half, half, base), P3(-half, half, base)];
  const top = P3(0, 0, base + apexH);
  for (let i = 0; i < 4; i++) t.tri(bk.glass, [corners[i], corners[(i + 1) % 4], top]);
  const door = P(half + 2, 0);
  t.box(bk.glass, door.x, door.y, 120, 10, 210, a, base);
}

// A gazebo: six posts carrying a hexagon roof over a hexagonal deck.
function drawGazebo(t, bk, P, P3, a, tint) {
  const r = 175, base = 16, postH = 235, roofH = 300, n = 6;
  const c = P(0, 0);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + Math.PI / 6;
    ring.push({ du: Math.cos(th) * r, dv: Math.sin(th) * r });
  }
  const mid = P3(0, 0, base);
  for (let i = 0; i < n; i++) {
    const A = P3(ring[i].du, ring[i].dv, base);
    const B = P3(ring[(i + 1) % n].du, ring[(i + 1) % n].dv, base);
    t.tri(bk.wall[tint], [mid, A, B]);
    const post = P(ring[i].du, ring[i].dv);
    t.box(bk.trim, post.x, post.y, 22, 22, postH, a, base);
  }
  const apex = P3(0, 0, base + postH + roofH);
  const eave = 30;
  for (let i = 0; i < n; i++) {
    const A = P3(ring[i].du * (r + eave) / r, ring[i].dv * (r + eave) / r, base + postH);
    const B = P3(ring[(i + 1) % n].du * (r + eave) / r, ring[(i + 1) % n].dv * (r + eave) / r, base + postH);
    t.tri(bk.roof[tint % 3], [A, B, apex]);
  }
}

// A yoga hall: a long gabled shed, almost entirely glazed down both long sides.
function drawYoga(t, bk, P, P3, a, tint) {
  const c = P(0, 0);
  t.box(bk.metal, c.x, c.y, 660, 1320, 24, a, 0);
  t.box(bk.wall[tint], c.x, c.y, 640, 1300, 330, a, 24);
  t.box(bk.glass, c.x, c.y, 650, 1240, 300, a, 40);
  gableRoof(t, bk.roof[tint % 3], bk.wall[tint], P3, 1300, 640, 354, 220);
  const door = P(650, 0);
  t.box(bk.glass, door.x, door.y, 150, 10, 250, a, 24);
}

// A stage: a deck under a flat canopy on four posts, with a solid back wall.
function drawStage(t, bk, P, P3, a, tint) {
  const c = P(0, 0);
  t.box(bk.wall[tint], c.x, c.y, 800, 700, 100, a, 0);
  // The back wall closes the rear of the deck: offset *along* the facing axis,
  // spanning the stage's width.
  const back = P(-330, 0);
  t.box(bk.wall[tint], back.x, back.y, 800, 40, 400, a, 100);
  for (const du of [-370, 370]) {
    for (const dv of [-310, 310]) {
      const post = P(du, dv);
      t.box(bk.trim, post.x, post.y, 20, 20, 400, a, 100);
    }
  }
  t.box(bk.metal, c.x, c.y, 840, 760, 24, a, 500);
}

// A temple: three steps, a colonnade, an entablature and a pediment.
function drawTemple(t, bk, P, P3, a, tint) {
  const c = P(0, 0);
  for (let i = 0; i < 3; i++) {
    t.box(bk.wall[tint], c.x, c.y, 560 + i * 60, 760 + i * 60, 20, a, i * 20);
  }
  const z0 = 60, colH = 300;
  for (const du of [-320, -107, 107, 320]) {
    for (const dv of [-330, 330]) {
      const col = P(du, dv);
      t.box(bk.trim, col.x, col.y, 26, 26, colH, a, z0);
    }
  }
  for (const dv of [-330, 330]) {
    const col = P(0, dv);
    t.box(bk.trim, col.x, col.y, 26, 26, colH, a, z0);
  }
  t.box(bk.wall[tint], c.x, c.y, 700, 900, 40, a, z0 + colH);
  gableRoof(t, bk.roof[tint % 3], bk.wall[tint], P3, 900, 700, z0 + colH + 40, 130);
}

// Draw `id` on `site`. Everything is placed from the site's own centre and
// facing, so a site that has been turned carries its building round with it.
export function drawDwelling(t, bk, site, id) {
  const type = dwellingOf(id) || dwellingOf('rv');
  const c = site.center;
  if (!c) return;
  const f = site.facing || { x: 1, y: 0 };
  const a = Math.atan2(f.y, f.x);
  const cos = Math.cos(a), sin = Math.sin(a);
  const tint = mod((site.tint | 0), 4);
  const P = (du, dv) => ({ x: c.x + du * cos - dv * sin, y: c.y + du * sin + dv * cos });
  // 3D point: x/z in plan centimetres, y in height centimetres.
  const P3 = (du, dv, h) => ({ x: P(du, dv).x, y: h, z: P(du, dv).y });

  switch (type.id) {
    case 'rv': return drawRv(t, bk, site, a, tint, P, site.variant || 0);
    case 'caravan': return drawRv(t, bk, site, a, tint, P, 1);
    case 'tiny': return drawTiny(t, bk, P, P3, a, tint);
    case 'cabin': return drawCabin(t, bk, P, P3, a, tint);
    case 'prefab': return drawPrefab(t, bk, P, a, tint);
    case 'dome': return drawDome(t, bk, P, a, tint);
    case 'yurt': return drawYurt(t, bk, P3, a, tint);
    case 'pyramid': return drawPyramid(t, bk, P, P3, a);
    case 'gazebo': return drawGazebo(t, bk, P, P3, a, tint);
    case 'yoga': return drawYoga(t, bk, P, P3, a, tint);
    case 'stage': return drawStage(t, bk, P, P3, a, tint);
    case 'temple': return drawTemple(t, bk, P, P3, a, tint);
    default:
      return t.house(bk, {
        ...site,
        w: site.w || 760,
        d: site.d || 980,
        storeys: site.storeys || 1,
        tint,
      });
  }
}
