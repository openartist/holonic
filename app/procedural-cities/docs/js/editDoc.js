// editDoc.js — the editing document: identity, transforms and the add/remove
// verbs, with no renderer and no DOM in sight.
//
// The generators hand back plain polygons — a site is
// `{ points, pad, center, facing }`, a road is `{ kind, points }`, and an
// allotment bed is a bare ring with no wrapper object at all. Each bucket
// therefore gets a small adapter here: moving an RV site has to shift the
// hardstanding and the vehicle centre, turning it has to turn `facing` as well,
// and a car park owns painted stripes that must travel with it. Everything
// downstream (handles, rail, controller) only ever calls these functions, so
// "an edit" means exactly one thing — and tools/edit-check.mjs can audit every
// transform headlessly.
//
// Coordinates are centimetres (100 units = 1 m), the same as the generators.

import { insetPolygon, polyArea, polyCenter } from './utils.js';

const M2 = 1e-4;

// Bucket name in the layout → how to reach its polygon.
const BUCKETS = {
  pitches:       {},
  facilities:    {},
  roads:         {},
  paths:         {},
  gardens:       {},
  allotmentBeds: { bare: true },
  squares:       { bare: true },
  lots:          {},
  solar:         {},
};

export const BUCKET_NAMES = Object.keys(BUCKETS);

const ROAD_LABEL = {
  drive: 'Perimeter drive', aisle: 'Drive aisle', entrance: 'Entrance drive',
  square: 'Square street', parking: 'Car-park access', spine: 'Spine lane',
  branch: 'Branch lane', culdesac: 'Cul-de-sac', plaza: 'Common green',
};
const GARDEN_LABEL = {
  bed: 'Planting bed', allotment: 'Allotment', perimeter: 'Green edge',
  court: 'Courtyard green', veg: 'Veg garden', orchard: 'Orchard', pond: 'Pond',
  plot: 'Private garden', solar: 'Solar field',
};

function labelFor(bucket, ref, i, layout) {
  if (bucket === 'pitches') {
    return layout && layout.kind === 'village' ? `Cottage ${i + 1}` : `Site ${i + 1}`;
  }
  if (bucket === 'facilities') return (ref && ref.label) || 'Building';
  if (bucket === 'roads') return ROAD_LABEL[ref && ref.kind] || 'Road';
  if (bucket === 'paths') return 'Footpath';
  if (bucket === 'gardens') return GARDEN_LABEL[ref && ref.kind] || 'Green space';
  if (bucket === 'allotmentBeds') return 'Allotment bed';
  if (bucket === 'squares') return 'Town square';
  if (bucket === 'lots') return 'Car park';
  if (bucket === 'solar') return ref && ref.roof ? 'Roof solar array' : 'Ground solar array';
  return 'Object';
}

// A cottage is drawn from centre / facing / frontage / depth, not from its
// polygon, so dragging its corners would be a lie. Everything else renders from
// the polygon it carries and can be reshaped.
function isShapeable(bucket, ref) {
  if (bucket === 'pitches' && ref && ref.kind === 'house') return false;
  return true;
}

export function pointsOf(bucket, ref) {
  if (!ref) return null;
  return BUCKETS[bucket] && BUCKETS[bucket].bare ? ref : ref.points;
}

// One entry per object on the plan, in a stable order: the pick layer, the
// handles and the inspector all index into this.
export function index(layout) {
  const out = [];
  if (!layout) return out;
  for (const bucket of BUCKET_NAMES) {
    const list = layout[bucket];
    if (!Array.isArray(list)) continue;
    list.forEach((ref, i) => {
      const points = pointsOf(bucket, ref);
      if (!points || points.length < 3) return;
      out.push({
        id: `${bucket}:${i}`,
        bucket, index: i, ref, points,
        bare: !!BUCKETS[bucket].bare,
        kind: ref && ref.kind,
        label: labelFor(bucket, ref, i, layout),
        shapeable: isShapeable(bucket, ref),
        // What stands on a site. `dwelling` is the choice, if one was made; the
        // fallback is what the generator drew, so the inspector can show it as
        // the current value rather than a blank.
        dwelling: bucket === 'pitches'
          ? (ref.dwelling || (layout.kind === 'village' ? 'cottage' : 'rv'))
          : null,
        occupied: bucket === 'pitches' ? ref.occupied !== false : undefined,
      });
    });
  }
  return out;
}

// ---- geometry helpers -------------------------------------------------------

export function bounds(points) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, x1, y0, y1, w: x1 - x0, d: y1 - y0 };
}

export function centroid(points) {
  return polyCenter(points);
}

export function areaM2(points) {
  return Math.abs(polyArea(points)) * M2;
}

export function snapTo(p, grid = 100) {
  if (!grid) return { x: p.x, y: p.y };
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

// An axis-aligned rectangle in the plan's own frame: `w` runs across, `d` along
// the facing vector. Order is CCW so the renderer's gable test sees a clean quad.
export function rectPoly(cx, cy, w, d, angle = 0) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const P = (u, v) => ({ x: cx + u * cos - v * sin, y: cy + u * sin + v * cos });
  return [P(-d / 2, -w / 2), P(d / 2, -w / 2), P(d / 2, w / 2), P(-d / 2, w / 2)];
}

// ---- transforms -------------------------------------------------------------
// Every transform works on the source polygon the renderer reads from, never on
// a mesh, so it survives a rebuild.

function eachPoint(points, fn) {
  for (const p of points) fn(p);
}

export function translate(entry, dx, dy) {
  if (!entry || (!dx && !dy)) return entry;
  const move = p => { p.x += dx; p.y += dy; };
  eachPoint(entry.points, move);
  if (!entry.bare) {
    const ref = entry.ref;
    if (ref.pad && ref.pad !== entry.points) eachPoint(ref.pad, move);
    if (ref.center) ref.center = { x: ref.center.x + dx, y: ref.center.y + dy };
    if (Array.isArray(ref.stripes)) for (const s of ref.stripes) eachPoint(s, move);
  }
  return entry;
}

export function rotate(entry, angle) {
  if (!entry || !angle) return entry;
  const c = centroid(entry.points);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const turn = p => {
    const dx = p.x - c.x, dy = p.y - c.y;
    p.x = c.x + dx * cos - dy * sin;
    p.y = c.y + dx * sin + dy * cos;
  };
  eachPoint(entry.points, turn);
  if (!entry.bare) {
    const ref = entry.ref;
    if (ref.pad && ref.pad !== entry.points) eachPoint(ref.pad, turn);
    if (Array.isArray(ref.stripes)) for (const s of ref.stripes) eachPoint(s, turn);
    // The vehicle/cottage is drawn from `facing`, so it has to turn as well or
    // the pad spins under a building that keeps pointing the old way.
    if (ref.facing) {
      const f = ref.facing;
      ref.facing = { x: f.x * cos - f.y * sin, y: f.x * sin + f.y * cos };
    }
    if (ref.center) ref.center = { ...c };
  }
  return entry;
}

// Re-derive whatever the polygon implies after a corner or an edge moved.
export function reshape(entry, rules = {}) {
  if (!entry || entry.bare) return entry;
  const ref = entry.ref;
  if (entry.bucket === 'pitches') {
    ref.center = polyCenter(entry.points);
    if (ref.pad && ref.pad !== entry.points && ref.kind !== 'house') {
      ref.pad = insetPolygon(entry.points, rules.padSetback ?? 120) || entry.points;
    }
  } else if (ref.center) {
    ref.center = polyCenter(entry.points);
  }
  return entry;
}

export function moveVertex(entry, i, p, rules) {
  if (!entry || !entry.points[i]) return entry;
  entry.points[i] = { x: p.x, y: p.y };
  return reshape(entry, rules);
}

export function moveEdge(entry, i, dx, dy, rules) {
  if (!entry) return entry;
  const pts = entry.points;
  const j = (i + 1) % pts.length;
  pts[i] = { x: pts[i].x + dx, y: pts[i].y + dy };
  pts[j] = { x: pts[j].x + dx, y: pts[j].y + dy };
  return reshape(entry, rules);
}

// ---- add / remove -----------------------------------------------------------

export function addBuilding(layout, { x, y, w = 900, d = 700, h = 320, angle = 0, label = 'New building' }) {
  const points = rectPoly(x, y, w, d, angle);
  const ref = { kind: 'custom', label, points, center: { x, y }, height: h, w, d };
  layout.facilities.push(ref);
  return ref;
}

export function addSite(layout, rules = {}, { x, y, angle = 0 }) {
  const facing = { x: Math.cos(angle), y: Math.sin(angle) };
  if (layout.kind === 'village') {
    const w = rules.houseWidth || 760, d = rules.houseDepth || 980;
    const points = rectPoly(x, y, w, d, angle);
    const ref = {
      points, pad: points, center: { x, y }, facing, w, d,
      kind: 'house', storeys: Math.round(rules.houseStoreys || 1),
      tint: 0, variant: 0, occupied: true,
    };
    layout.pitches.push(ref);
    return ref;
  }
  const w = rules.pitchWidth || 950, d = rules.pitchDepth || 1600;
  const points = rectPoly(x, y, w, d, angle);
  const ref = {
    points,
    pad: insetPolygon(points, rules.padSetback ?? 120) || points,
    center: { x, y }, facing, variant: 0, tint: 0, occupied: true,
  };
  layout.pitches.push(ref);
  return ref;
}

// A straight run swept as a quad — the same thing villageGen's ribbon does for
// one segment, so a hand-drawn lane joins the generated network visually.
export function addBand(layout, bucket, kind, a, b, width) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 100) return null;
  const nx = (-dy / l) * (width / 2), ny = (dx / l) * (width / 2);
  const points = [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
  const ref = { kind, points };
  layout[bucket].push(ref);
  return ref;
}

export function addBed(layout, { x, y, w = 480, d = 320, angle = 0 }) {
  const points = rectPoly(x, y, w, d, angle);
  layout.gardens.push({ kind: 'bed', points });
  return points;
}

export function remove(layout, entry) {
  if (!entry) return false;
  const list = layout[entry.bucket];
  if (!Array.isArray(list)) return false;
  const at = list.indexOf(entry.ref);
  if (at < 0) return false;
  list.splice(at, 1);
  return true;
}

export function duplicate(layout, entry, dx = 200, dy = 200) {
  if (!entry) return null;
  const copy = JSON.parse(JSON.stringify(entry.ref));
  const points = pointsOf(entry.bucket, copy);
  if (!points) return null;
  for (const p of points) { p.x += dx; p.y += dy; }
  if (!entry.bare) {
    if (copy.pad && copy.pad !== points) for (const p of copy.pad) { p.x += dx; p.y += dy; }
    if (copy.center) copy.center = { x: copy.center.x + dx, y: copy.center.y + dy };
    if (Array.isArray(copy.stripes)) for (const s of copy.stripes) for (const p of s) { p.x += dx; p.y += dy; }
  }
  layout[entry.bucket].push(copy);
  return copy;
}

// ---- history ----------------------------------------------------------------
// Snapshots hold the source polygons only (a few KB), never derived geometry.

export function snapshot(layout) {
  const out = {};
  for (const bucket of BUCKET_NAMES) out[bucket] = layout[bucket] || [];
  return JSON.stringify(out);
}

export function restore(layout, snap) {
  const data = JSON.parse(snap);
  for (const bucket of BUCKET_NAMES) layout[bucket] = data[bucket] || [];
  return layout;
}

// Per-object snapshot for a drag: the whole point of keeping them is that a
// pointer move can be replayed from the start instead of accumulating error.
export function snapshotRef(entry) {
  return JSON.stringify(entry.ref);
}

export function restoreRef(entry, snap) {
  const data = JSON.parse(snap);
  if (entry.bare) {
    const pts = entry.points;
    pts.length = 0;
    for (const p of data) pts.push({ x: p.x, y: p.y });
    entry.ref = pts;
    return entry;
  }
  // Replace, do not merge: a key added after the snapshot (a dwelling chosen on
  // a site, say) is not in `data` and would survive the restore otherwise.
  for (const key of Object.keys(entry.ref)) if (!(key in data)) delete entry.ref[key];
  Object.assign(entry.ref, data);
  entry.points = entry.ref.points;
  return entry;
}
