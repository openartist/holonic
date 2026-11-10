// parkScene.js — meshes for the RV park layout.
// World units are metres (one drawing unit = one centimetre, scaled by 0.01),
// so a 180 m park is 180 units across and the camera framing matches the city.

import * as THREE from 'three';
import { insetPolygon, polyArea } from './utils.js';
import { DECAL_Z as Z } from './decalZ.js';
import { pointInPolygon } from './plotGen.js';
import { seededRandom } from './noise.js';
import { pickables } from './pickInfo.js?v=park-30';
import { drawDwelling, defaultDwelling } from './dwellings.js?v=park-30';

const S = 0.01;

const M = {
  grass:    new THREE.MeshLambertMaterial({ color: 0x7f906a, side: THREE.DoubleSide }),
  road:     new THREE.MeshLambertMaterial({ color: 0x33332e, side: THREE.DoubleSide }),
  pad:      new THREE.MeshLambertMaterial({ color: 0xbcb5a4, side: THREE.DoubleSide }),
  soil:     new THREE.MeshLambertMaterial({ color: 0x5c4a37, side: THREE.DoubleSide }),
  veg:      new THREE.MeshLambertMaterial({ color: 0x5f7d3f, side: THREE.DoubleSide }),
  hedge:    new THREE.MeshLambertMaterial({ color: 0x3f6b34, side: THREE.DoubleSide }),
  wall:     new THREE.MeshLambertMaterial({ color: 0xdcd5c6, side: THREE.DoubleSide }),
  roof:     new THREE.MeshLambertMaterial({ color: 0x6f4a3a, side: THREE.DoubleSide }),
  glass:    new THREE.MeshLambertMaterial({ color: 0x33596a, side: THREE.DoubleSide }),
  deck:     new THREE.MeshLambertMaterial({ color: 0xd6cfbd, side: THREE.DoubleSide }),
  water:    new THREE.MeshLambertMaterial({ color: 0x4f93a8, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  sand:     new THREE.MeshLambertMaterial({ color: 0xc9b78d, side: THREE.DoubleSide }),
  rvTrim:   new THREE.MeshLambertMaterial({ color: 0x8d949a, side: THREE.DoubleSide }),
  rvGlass:  new THREE.MeshLambertMaterial({ color: 0x2c3c45, side: THREE.DoubleSide }),
  rvWheel:  new THREE.MeshLambertMaterial({ color: 0x1d1d1c, side: THREE.DoubleSide }),
  leaf:     new THREE.MeshLambertMaterial({ color: 0x3d6f32, side: THREE.DoubleSide }),
  bark:     new THREE.MeshLambertMaterial({ color: 0x5a4632, side: THREE.DoubleSide }),
  path:     new THREE.MeshLambertMaterial({ color: 0xcfc6b4, side: THREE.DoubleSide }),
  wet:      new THREE.MeshLambertMaterial({ color: 0x6f8a72, side: THREE.DoubleSide }),
  stripe:   new THREE.MeshLambertMaterial({ color: 0xf2efe4, side: THREE.DoubleSide }),
  solar:    new THREE.MeshLambertMaterial({ color: 0x1c3550, side: THREE.DoubleSide }),
  dome:     new THREE.MeshLambertMaterial({ color: 0xb9c6c4, side: THREE.DoubleSide }),
  lot:      new THREE.MeshLambertMaterial({ color: 0x3a3b36, side: THREE.DoubleSide }),
};

// Flat decals also get a polygon offset, ordered the same as the height ladder:
// the depth buffer then separates a path lying on a road even where the two are
// geometrically close, which is what stops the shimmer while the camera orbits.
for (const [key, off] of Object.entries({
  grass: 1, soil: 2, veg: 3, wet: 2, court: 3, road: 4, pad: 5, deck: 4,
  sand: 5, path: 6, stripe: 7, water: 1, solar: 8, lot: 7.5,
})) {
  const mat = M[key];
  if (!mat) continue;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -off;
  mat.polygonOffsetUnits = -off;
  mat.needsUpdate = true;
}

// Vehicle liveries and awning colours — four of each, so a filled park is not
// one white box repeated 60 times.
const BODY_MATS = [0xf1eee6, 0xe9e2d2, 0xdde5e7, 0xf2e8d5]
  .map(color => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
const AWNING_MATS = [0x3e7f6c, 0x8a5a3c, 0x4a6a8a, 0xa04a4a]
  .map(color => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));

// Cottage render and roof finishes for the village: four wall tints, three
// roofs, so a cluster does not read as one building repeated.
const HOUSE_MATS = [0xe8e2d4, 0xdcd2bf, 0xcfcabb, 0xe3dac4]
  .map(color => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
const ROOF_MATS = [0x7c5344, 0x5c6470, 0x8b6a49]
  .map(color => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));

// Renders nothing (no colour, no depth writes) but still raycasts, which is the
// cheapest way to give every polygon its own hover target without splitting the
// drawn meshes apart.
const PICK_MAT = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  colorWrite: false, side: THREE.DoubleSide,
});

function acc() { return { pos: [], idx: [] }; }

function quadPts(b, pts) {
  if (pts.length < 3) return;
  const base = b.pos.length / 3;
  for (const p of pts) b.pos.push(p.x, p.y, p.z);
  for (let i = 1; i + 1 < pts.length; i++) b.idx.push(base, base + i, base + i + 1);
}

function meshOf(b, mat, cast = false) {
  if (!b.idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// Concave-safe horizontal fill (beds and clipped strips are not convex).
function flatGeometry(polys, z) {
  const pos = [], idx = [];
  let vi = 0;
  for (const poly of polys) {
    if (!poly || poly.length < 3) continue;
    const pts = poly.map(p => new THREE.Vector2(p.x * S, p.y * S));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { continue; }
    if (!tris || !tris.length) continue;
    const base = vi;
    for (const p of pts) { pos.push(p.x, z * S, p.y); vi++; }
    for (const [a, b, c] of tris) idx.push(base + a, base + b, base + c);
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function flatMesh(polys, z, mat) {
  const g = flatGeometry(polys, z);
  if (!g) return null;
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

function wallQuad(b, a, c, z0, z1) {
  quadPts(b, [
    { x: a.x * S, y: z0 * S, z: a.y * S },
    { x: c.x * S, y: z0 * S, z: c.y * S },
    { x: c.x * S, y: z1 * S, z: c.y * S },
    { x: a.x * S, y: z1 * S, z: a.y * S },
  ]);
}

// Box in a rotated local frame: `len` runs along the facing vector.
function boxAt(b, cx, cy, across, len, h, angle, base) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const P = (dx, dy, dz) => ({
    x: (cx + dx * cos - dy * sin) * S,
    y: (base + dz) * S,
    z: (cy + dx * sin + dy * cos) * S,
  });
  const hx = len / 2, hy = across / 2;
  const p = [
    P(-hx, -hy, 0), P(hx, -hy, 0), P(hx, hy, 0), P(-hx, hy, 0),
    P(-hx, -hy, h), P(hx, -hy, h), P(hx, hy, h), P(-hx, hy, h),
  ];
  quadPts(b, [p[0], p[1], p[5], p[4]]);
  quadPts(b, [p[1], p[2], p[6], p[5]]);
  quadPts(b, [p[2], p[3], p[7], p[6]]);
  quadPts(b, [p[3], p[0], p[4], p[7]]);
  quadPts(b, [p[4], p[5], p[6], p[7]]);
  quadPts(b, [p[3], p[2], p[1], p[0]]);
}

// A pitched roof over a rectangle: the ridge runs along the longer side, with a
// gable at each short end.
function addGableRect(bk, pts, z0, roofH, wallTint, roofTint) {
  const [a, b, c, d] = pts;
  if (!d) return;
  const len = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  let r0, r1, e0, e1, g0, g1;
  if (len(a, b) >= len(b, c)) {
    r0 = mid(d, a); r1 = mid(b, c);
    e0 = [a, b]; e1 = [d, c]; g0 = [d, a]; g1 = [b, c];
  } else {
    r0 = mid(a, b); r1 = mid(c, d);
    e0 = [b, c]; e1 = [a, d]; g0 = [b, a]; g1 = [c, d];
  }
  const V = (p, z) => ({ x: p.x * S, y: z * S, z: p.y * S });
  const top0 = V(r0, z0 + roofH), top1 = V(r1, z0 + roofH);
  const mat = bk.roof[((roofTint | 0) % 3 + 3) % 3];
  quadPts(mat, [V(e0[0], z0), V(e0[1], z0), top1, top0]);
  quadPts(mat, [V(e1[0], z0), V(e1[1], z0), top0, top1]);
  const wall = bk.wall[((wallTint | 0) % 4 + 4) % 4];
  quadPts(wall, [V(g0[0], z0), V(g0[1], z0), top0]);
  quadPts(wall, [V(g1[0], z0), V(g1[1], z0), top1]);
}

// A cottage: walls, pitched roof, window bands and a door on the street side.
function addHouse(bk, h) {
  const c = h.center;
  if (!c || !h.points) return;
  const f = h.facing || { x: 1, y: 0 };
  const a = Math.atan2(f.y, f.x);
  const ca = Math.cos(a), sa = Math.sin(a);
  const w = h.w || 760, d = h.d || 980;
  const storeys = Math.max(1, Math.round(h.storeys || 1));
  const wallH = h.wallH || storeys * 285 + 40;
  const wallTint = ((h.tint | 0) % 4 + 4) % 4;
  const roofTint = ((h.tint | 0) + 1) % 3;
  const P = (dz, dw) => ({ x: c.x + dz * ca - dw * sa, y: c.y + dz * sa + dw * ca });
  const corners = [P(-d / 2, -w / 2), P(d / 2, -w / 2), P(d / 2, w / 2), P(-d / 2, w / 2)];
  const V = (p, z) => ({ x: p.x * S, y: z * S, z: p.y * S });
  const base = 18;
  for (let i = 0; i < 4; i++) {
    const A = corners[i], B = corners[(i + 1) % 4];
    quadPts(bk.wall[wallTint], [V(A, base), V(B, base), V(B, base + wallH), V(A, base + wallH)]);
  }
  addGableRect(bk, corners, base + wallH, Math.max(120, Math.min(300, w * 0.3)), wallTint, roofTint);

  const z0 = base + 95, z1 = base + Math.min(wallH - 45, 205);
  for (const s of [-1, 1]) {
    const p1 = P(-d * 0.34, s * (w / 2 + 14));
    const p2 = P(d * 0.06, s * (w / 2 + 14));
    quadPts(bk.glass, [V(p1, z0), V(p2, z0), V(p2, z1), V(p1, z1)]);
  }
  const dp0 = P(-d * 0.03, -(w / 2 + 14));
  const dp1 = P(d * 0.14, -(w / 2 + 14));
  quadPts(bk.glass, [V(dp0, base), V(dp1, base), V(dp1, base + 205), V(dp0, base + 205)]);
  if (storeys > 1) {
    const up = base + 340, top = up + Math.min(170, Math.max(80, wallH - 380));
    const q0 = P(-d * 0.34, -(w / 2 + 14));
    const q1 = P(d * 0.06, -(w / 2 + 14));
    quadPts(bk.glass, [V(q0, up), V(q1, up), V(q1, top), V(q0, top)]);
  }
}

function addFacility(bk, f) {
  const pts = f.points;

  if (f.kind === 'pool') {
    const deck = flatMesh([pts], Z.poolDeck, M.deck);
    const waterPoly = insetPolygon(pts, 120);
    const water = waterPoly ? flatMesh([waterPoly], Z.poolWater, M.water) : null;
    if (deck) bk.meshes.push(deck);
    if (water) bk.meshes.push(water);
    return;
  }
  if (f.kind === 'playground') {
    const sand = flatMesh([pts], Z.playgroundSand, M.sand);
    if (sand) bk.meshes.push(sand);
    const c = f.center;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      boxAt(bk.walls, c.x + Math.cos(a) * 220, c.y + Math.sin(a) * 220, 12, 12, 240, 0, 0);
    }
    return;
  }
  if (f.kind === 'dump') {
    const pad = flatMesh([pts], Z.pad, M.pad);
    if (pad) bk.meshes.push(pad);
    const c = f.center;
    boxAt(bk.walls, c.x, c.y, 40, 40, 120, 0, 0);
    return;
  }

  const h = f.height || 300;
  for (let i = 0; i < pts.length; i++) wallQuad(bk.walls, pts[i], pts[(i + 1) % pts.length], 0, h);
  if (f.gable && pts.length === 4) {
    addGableRect(bk, pts, h, Math.min(260, (f.w || 900) * 0.22), 0, 1);
  } else {
    const roof = flatMesh([pts], h, M.roof);
    if (roof) bk.meshes.push(roof);
    for (let i = 0; i < pts.length; i++) wallQuad(bk.walls, pts[i], pts[(i + 1) % pts.length], h, h + 22);
  }

  const c = f.center;
  const bandTop = Math.min(215, h * 0.85);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    let nx = b.y - a.y, ny = -(b.x - a.x);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((m.x - c.x) * nx + (m.y - c.y) * ny < 0) { nx = -nx; ny = -ny; }
    const off = 14;
    wallQuad(bk.glass,
      { x: a.x + nx * off, y: a.y + ny * off },
      { x: b.x + nx * off, y: b.y + ny * off },
      100, bandTop);
  }
}

function bboxOf(poly) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

function samplePoint(rng, poly) {
  const b = bboxOf(poly);
  for (let i = 0; i < 30; i++) {
    const p = { x: b.minX + rng() * (b.maxX - b.minX), y: b.minY + rng() * (b.maxY - b.minY) };
    if (pointInPolygon(p, poly)) return p;
  }
  return null;
}

function instanced(geo, mat, placements) {
  if (!placements.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => {
    dummy.position.set(p.x * S, 0, p.y * S);
    dummy.rotation.set(0, p.rot || 0, 0);
    dummy.scale.setScalar(p.scale || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildParkMesh(scene, layout, rules = {}) {
  const group = new THREE.Group();
  const layers = {};
  for (const name of ['area', 'roads', 'sites', 'rv', 'facilities', 'gardens', 'planting']) {
    const g = new THREE.Group();
    g.name = name;
    layers[name] = g;
    group.add(g);
  }

  const grass = flatMesh([layout.area], Z.grass, M.grass);
  if (grass) layers.area.add(grass);

  const ring = layout.area;
  if (ring.length >= 3) {
    const geo = new THREE.BufferGeometry().setFromPoints(
      ring.map(p => new THREE.Vector3(p.x * S, (Z.greenEdge + 6) * S, p.y * S)));
    const line = new THREE.LineLoop(geo,
      new THREE.LineBasicMaterial({ color: 0x9fe0c0, depthWrite: false }));
    layers.area.add(line);
  }

  const roads = flatMesh(layout.roads.map(r => r.points), Z.road, M.road);
  if (roads) layers.roads.add(roads);

  const pads = flatMesh(layout.pitches.map(p => p.pad), Z.pad, M.pad);
  if (pads) layers.sites.add(pads);

  // Car parks: asphalt, then the painted bay dividers on top of it. The access
  // lane is an ordinary road polygon, so it is already in the road mesh above.
  const lots = layout.lots || [];
  if (lots.length) {
    const asphalt = flatMesh(lots.map(l => l.points), Z.lot, M.lot);
    if (asphalt) layers.roads.add(asphalt);
    const paint = flatMesh(lots.flatMap(l => l.stripes || []), Z.stripe, M.stripe);
    if (paint) layers.roads.add(paint);
  }

  // Plaza paving for the civic square, a step above the site pads.
  const plazas = flatMesh(layout.squares || [], Z.pad + 4, M.plaza || M.pad);
  if (plazas) layers.sites.add(plazas);

  // Solar: ground arrays lie on the beds, roof arrays sit on the building roofs.
  const groundSolar = (layout.solar || []).filter(s => !s.roof).map(s => s.points);
  if (groundSolar.length) {
    const m = flatMesh(groundSolar, Z.allotment + 2, M.solar);
    if (m) layers.gardens.add(m);
  }
  for (const s of (layout.solar || []).filter(s => s.roof)) {
    const m = flatMesh([s.points], (s.height || 300) + 10, M.solar);
    if (m) layers.facilities.add(m);
  }

  // RVs and cottages: one merged bucket per livery/tint, shared trim, glass
  // and wheel buckets, and separate wall/roof buckets for the village.
  const bk = {
    body: [acc(), acc(), acc(), acc()],
    awning: [acc(), acc(), acc(), acc()],
    wall: [acc(), acc(), acc(), acc()],
    roof: [acc(), acc(), acc()],
    trim: acc(), glass: acc(), wheel: acc(), walls: acc(), stripe: acc(),
    metal: acc(), meshes: [],
  };

  // What stands on each site comes from the building library: an RV by default,
  // a cottage in the village engine, or whatever the rail placed there. The
  // toolkit is the whole contract between the catalogue and this renderer.
  const toolkit = {
    box: (bucket, cx, cy, across, len, h, angle, base) =>
      boxAt(bucket, cx, cy, across, len, h, angle, base),
    tri: (bucket, pts) =>
      quadPts(bucket, pts.map(p => ({ x: p.x * S, y: p.y * S, z: p.z * S }))),
    house: (b, site) => addHouse(b, site),
  };
  const fallback = defaultDwelling(layout);
  for (const pitch of layout.pitches) {
    if (!pitch.occupied) continue;
    drawDwelling(toolkit, bk, pitch, pitch.dwelling || fallback);
  }
  for (const f of layout.facilities) addFacility(bk, f);

  for (let i = 0; i < 4; i++) {
    const body = meshOf(bk.body[i], BODY_MATS[i], true);
    if (body) layers.rv.add(body);
  }
  for (let i = 0; i < 4; i++) {
    const awning = meshOf(bk.awning[i], AWNING_MATS[i], true);
    if (awning) layers.rv.add(awning);
  }
  for (const [bucket, mat] of [[bk.trim, M.rvTrim], [bk.glass, M.rvGlass], [bk.wheel, M.rvWheel]]) {
    const m = meshOf(bucket, mat, true);
    if (m) layers.rv.add(m);
  }

  for (let i = 0; i < 4; i++) {
    const m = meshOf(bk.wall[i], HOUSE_MATS[i], true);
    if (m) layers.rv.add(m);
  }
  for (let i = 0; i < 3; i++) {
    const m = meshOf(bk.roof[i], ROOF_MATS[i], true);
    if (m) layers.rv.add(m);
  }
  // Prefab roofs and tiny-home chassis.
  const metal = meshOf(bk.metal, M.dome, true);
  if (metal) layers.rv.add(metal);

  const walls = meshOf(bk.walls, M.wall, true);
  if (walls) layers.facilities.add(walls);
  const stripes = meshOf(bk.stripe, M.stripe, false);
  if (stripes) layers.facilities.add(stripes);
  for (const m of bk.meshes) layers.facilities.add(m);

  const pathMesh = flatMesh((layout.paths || []).map(p => p.points), Z.path, M.path);
  if (pathMesh) layers.roads.add(pathMesh);

  const special = new Set(['perimeter', 'pond', 'veg', 'orchard']);
  const beds = layout.gardens.filter(g => !special.has(g.kind));
  const bedMesh = flatMesh(beds.map(g => g.points), Z.bedSoil, M.soil);
  if (bedMesh) layers.gardens.add(bedMesh);

  const vegGardens = layout.gardens.filter(g => g.kind === 'veg');
  if (vegGardens.length) {
    const m = flatMesh(vegGardens.map(g => g.points), Z.vegSoil, M.soil);
    if (m) layers.gardens.add(m);
  }
  const orchards = layout.gardens.filter(g => g.kind === 'orchard');
  if (orchards.length) {
    const m = flatMesh(orchards.map(g => g.points), Z.orchard, M.veg);
    if (m) layers.gardens.add(m);
  }
  const ponds = layout.gardens.filter(g => g.kind === 'pond');
  if (ponds.length) {
    const shore = flatMesh(ponds.map(g => g.points), Z.pondShore, M.wet);
    if (shore) layers.gardens.add(shore);
    const water = flatMesh(ponds.map(g => insetPolygon(g.points, 130)).filter(Boolean), Z.pondWater, M.water);
    if (water) layers.gardens.add(water);
  }
  const edge = layout.gardens.filter(g => g.kind === 'perimeter');
  const edgeMesh = flatMesh(edge.map(g => g.points), Z.greenEdge, M.veg);
  if (edgeMesh) layers.gardens.add(edgeMesh);
  const courts = layout.gardens.filter(g => g.kind === 'court');
  const courtMesh = flatMesh(courts.map(g => g.points), Z.court, M.veg);
  if (courtMesh) layers.gardens.add(courtMesh);
  const allot = flatMesh(layout.allotmentBeds, Z.allotment, M.veg);
  if (allot) layers.gardens.add(allot);

  // Planting: instanced trees and bushes through the beds and the green edge.
  const greenery = Number(rules.greenery ?? 1);
  if (greenery > 0) {
    const rng = seededRandom(Math.abs(Math.floor(rules.seed || 1)) >>> 0 || 1);
    const trees = [], bushes = [];
    for (const g of layout.gardens) {
      const a = polyArea(g.points) * 1e-4;
      const density = g.kind === 'orchard' ? 5 : 1;
      const want = Math.min(70, Math.max(1, Math.round((a / 120) * greenery * density)));
      for (let i = 0; i < want; i++) {
        const p = samplePoint(rng, g.points);
        if (!p) continue;
        const scale = 0.7 + rng() * 0.7;
        (rng() < 0.62 ? trees : bushes).push({ x: p.x, y: p.y, scale, rot: rng() * Math.PI * 2 });
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 1.9, 5);
    trunkGeo.translate(0, 0.95, 0);
    const canopyGeo = new THREE.ConeGeometry(1.5, 3.4, 7);
    canopyGeo.translate(0, 3.3, 0);
    const bushGeo = new THREE.IcosahedronGeometry(0.75, 0);
    bushGeo.translate(0, 0.6, 0);

    const trunks = instanced(trunkGeo, M.bark, trees);
    const canopies = instanced(canopyGeo, M.leaf, trees);
    const shrub = instanced(bushGeo, M.hedge, bushes);
    for (const m of [trunks, canopies, shrub]) if (m) layers.planting.add(m);
  }

  // Hover pick layer: one invisible quad or deck per object on the plan, each
  // carrying the card it should show. Raycasting this layer rather than the
  // drawn meshes means the card can name a single site or bed, and it works the
  // same whether the object is flat paint or a building.
  const picks = new THREE.Group();
  picks.name = 'picks';
  for (const item of pickables(layout, rules)) {
    const geo = flatGeometry(item.polys, item.z);
    if (!geo) continue;
    const pick = new THREE.Mesh(geo, PICK_MAT);
    pick.userData.info = item.info;
    // The editor resolves a click back to the source object through this, so a
    // drag moves the polygon the renderer reads rather than the pick mesh.
    pick.userData.ref = item.ref;
    picks.add(pick);
  }
  // Never drawn: a render-style override (clay, blueprint) replaces materials
  // scene-wide, and a visible pick layer would paint over the plan. Raycasting
  // does not test visibility, so the layer still answers the pointer.
  picks.visible = false;
  group.add(picks);

  scene.add(group);
  return { group, layers, picks };
}
