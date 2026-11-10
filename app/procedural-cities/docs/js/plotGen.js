// plotGen.js — city blocks, derived as the bounded faces of the road network.
//
// The original port chained road side-lines into "surrounding polygons" with a
// parent/child pointer scheme. That chain links the wrong pairs in this
// geometry, so it produced small closed fragments around junctions (median
// ~25 m²) instead of blocks, and neighbouring fragments overlapped each other.
// Every downstream symptom — stacked plot slabs, buildings extruded through one
// another, buildings that never fit their lot — came from that.
//
// Blocks are just the faces of the planar graph formed by the road centrelines,
// so they are disjoint by construction. This module:
//   1. splits every centreline at every intersection and T-junction,
//   2. snaps the endpoints into a node graph,
//   3. walks the half-edge cycles to recover every bounded face,
//   4. insets each face to the lot line (carriageway edge + sidewalk width).
import {
  dist, sub, scale, normalize, rot90, add,
  polyArea, polyIsClockwise, polySelfIntersects, shrinkPoly, segIntersect,
  cleanPolygon, polySimple, insetPolygon,
} from './utils.js';

export { polySimple };

const GRID = 10;          // snap nodes to 10 cm
const MIN_EDGE = 150;     // ignore fragments shorter than 1.5 m
const UNIT2_TO_M2 = 1e-4;

function keyOf(p) { return `${Math.round(p.x / GRID)},${Math.round(p.y / GRID)}`; }

function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

function paramOn(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
}

function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function signedArea2(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return s * 0.5;
}

function longestEdgeOf(pts) {
  let m = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    m = Math.max(m, dist(pts[i], pts[j]));
  }
  return m;
}

function minEdgeOf(pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    m = Math.min(m, dist(pts[i], pts[j]));
  }
  return m;
}

// ---------------------------------------------------------------------------
// Road network → planar graph → faces
// ---------------------------------------------------------------------------

// Bridges the gap the road generator leaves at every branch: a side road starts
// at its parent's *edge*, `hw` away from the parent centreline, so as a
// centreline graph it is disconnected. Stitching the end back to the nearest
// centreline closes those junctions; the connector lies inside the parent's
// carriageway, so it never cuts a block in half.
function stitchEndpoints(segs, splits, radius) {
  const stitches = [];
  const connected = (p, self) => segs.some((s, i) => i !== self && pointSegDist(p, s.a, s.b) < 40);

  for (let i = 0; i < segs.length; i++) {
    for (const end of ['a', 'b']) {
      const p = segs[i][end];
      if (connected(p, i)) continue;
      let best = null;
      for (let j = 0; j < segs.length; j++) {
        if (j === i) continue;
        const t = paramOn(segs[j].a, segs[j].b, p);
        if (t < 1e-4 || t > 1 - 1e-4) continue;
        const d = pointSegDist(p, segs[j].a, segs[j].b);
        if (d < radius && (!best || d < best.d)) best = { d, j, t, hw: segs[j].hw };
      }
      if (best) {
        splits[best.j].push(best.t);
        stitches.push({ from: p, to: lerp(segs[best.j].a, segs[best.j].b, best.t), hw: best.hw });
      }
    }
  }
  return stitches;
}

export function buildPlanarGraph(roads, stitchRadius = 1500) {
  const segs = [];
  for (const r of roads) {
    if (!r || !r.p1 || !r.p2) continue;
    if (!Number.isFinite(r.p1.x) || !Number.isFinite(r.p2.x)) continue;
    if (dist(r.p1, r.p2) < MIN_EDGE) continue;
    const hw = Number.isFinite(r.hw) ? r.hw : (r.width ? 100 * r.width : 300);
    segs.push({ a: r.p1, b: r.p2, hw });
  }

  const splits = segs.map(() => [0, 1]);

  const addSplit = (i, t) => {
    if (t > 1e-4 && t < 1 - 1e-4) splits[i].push(t);
  };

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i], B = segs[j];
      const ip = segIntersect(A.a, A.b, B.a, B.b);
      if (ip) {
        addSplit(i, paramOn(A.a, A.b, ip));
        addSplit(j, paramOn(B.a, B.b, ip));
        continue;
      }
      // T-junctions: an endpoint resting on the other segment.
      if (pointSegDist(B.a, A.a, A.b) < 60) addSplit(i, paramOn(A.a, A.b, B.a));
      if (pointSegDist(B.b, A.a, A.b) < 60) addSplit(i, paramOn(A.a, A.b, B.b));
      if (pointSegDist(A.a, B.a, B.b) < 60) addSplit(j, paramOn(B.a, B.b, A.a));
      if (pointSegDist(A.b, B.a, B.b) < 60) addSplit(j, paramOn(B.a, B.b, A.b));
    }
  }

  const stitches = stitchRadius > 0 ? stitchEndpoints(segs, splits, stitchRadius) : [];

  const nodes = new Map();
  const nodeAt = (p) => {
    const k = keyOf(p);
    let n = nodes.get(k);
    if (!n) {
      n = { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID, out: [] };
      nodes.set(k, n);
    }
    return n;
  };

  let edgeId = 0;
  for (let i = 0; i < segs.length; i++) {
    const { a, b, hw } = segs[i];
    const ts = [...new Set(splits[i].map(t => Number(t.toFixed(6))))].sort((x, y) => x - y);
    for (let k = 0; k < ts.length - 1; k++) {
      const p0 = lerp(a, b, ts[k]);
      const p1 = lerp(a, b, ts[k + 1]);
      if (dist(p0, p1) < MIN_EDGE) continue;
      const n0 = nodeAt(p0);
      const n1 = nodeAt(p1);
      if (n0 === n1) continue;
      const id = edgeId++;
      const ab = { key: `${id}|a`, edge: id, from: n0, to: n1, hw };
      const ba = { key: `${id}|b`, edge: id, from: n1, to: n0, hw };
      n0.out.push(ab);
      n1.out.push(ba);
    }
  }

  for (const st of stitches) {
    const n0 = nodeAt(st.from);
    const n1 = nodeAt(st.to);
    if (n0 === n1 || n0.out.some(o => o.to === n1)) continue;
    const id = edgeId++;
    n0.out.push({ key: `${id}|a`, edge: id, from: n0, to: n1, hw: st.hw });
    n1.out.push({ key: `${id}|b`, edge: id, from: n1, to: n0, hw: st.hw });
  }

  return nodes;
}

export function walkFaces(nodes) {
  for (const n of nodes.values()) {
    n.out.sort((p, q) =>
      Math.atan2(p.to.y - n.y, p.to.x - n.x) - Math.atan2(q.to.y - n.y, q.to.x - n.x));
  }

  const seen = new Set();
  const faces = [];

  for (const node of nodes.values()) {
    for (const start of node.out) {
      if (seen.has(start.key)) continue;

      const ring = [];
      let hw = 0;
      let cur = start;
      let guard = 0;

      while (cur && !seen.has(cur.key) && guard++ < 20000) {
        seen.add(cur.key);
        ring.push(cur.from);
        hw = Math.max(hw, cur.hw || 0);

        const out = cur.to.out;
        const back = out.findIndex(o => o.edge === cur.edge && o.to === cur.from);
        if (back < 0) { ring.length = 0; break; }
        // Take the neighbour one step clockwise from the reverse half-edge: this
        // keeps the face on a consistent side and encloses bounded faces CCW.
        cur = out[(back - 1 + out.length) % out.length];
      }

      if (ring.length >= 3) faces.push({ ring, hw });
    }
  }

  return faces;
}

// Blocks inset to the lot line: carriageway edge plus the sidewalk apron, so a
// sidewalk ring drawn outward from the lot line lands exactly in the gap and
// nothing is drawn on the carriageway.
export function extractBlocks(roads, cfg = {}) {
  const { sidewalk = 0, extraInset = 0, minArea = 20, stitchRadius = 1500 } = cfg;
  if (!roads || !roads.length) return [];

  const nodes = buildPlanarGraph(roads, stitchRadius);
  const faces = walkFaces(nodes);
  const blocks = [];
  const drops = { faces: faces.length, outer: 0, inset: 0, area: 0, edge: 0, ratio: 0 };

  for (const { ring, hw } of faces) {
    if (signedArea2(ring.map(n => ({ x: n.x, y: n.y }))) <= 0) { drops.outer++; continue; }

    const ptsOut = insetFace(ring, hw + sidewalk + extraInset);
    if (!ptsOut) { drops.inset++; continue; }
    const pts = ptsOut;

    const area = polyArea(pts) * UNIT2_TO_M2;
    if (area < minArea) { drops.area++; continue; }
    if (maxEdgeRatio(pts) > 4) { drops.ratio++; continue; }

    if (!polyIsClockwise(pts)) pts.reverse();
    pts.open = false;
    pts.isClockwise = true;
    pts.areaM2 = area;
    pts.roadHalfWidth = hw;
    blocks.push(pts);
  }

  blocks.debug = drops;
  return blocks;
}

function maxEdgeRatio(pts) {
  const a = polyArea(pts);
  if (a <= 0) return Infinity;
  return longestEdgeOf(pts) / Math.sqrt(a);
}

// Inset with graceful fallback: a tight block may not survive the full inset,
// so try progressively less before giving up rather than dropping the lot.
function insetFace(ring, inset) {
  const pts = cleanPolygon(ring.map(n => ({ x: n.x, y: n.y })));
  if (pts.length < 3) return null;
  if (inset <= 0) return pts;
  for (const factor of [1, 0.75, 0.5, 0.25]) {
    const trial = insetPolygon(pts, inset * factor);
    if (trial && trial.length >= 3 && polySimple(trial) && polyArea(trial) > 0) return trial;
  }
  return null;
}

// Kept for the older debug scripts that imported the original name.
export const extractPlots = extractBlocks;

// ---------------------------------------------------------------------------
// Validation and de-overlap
// ---------------------------------------------------------------------------

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function pointPolyDist(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    d = Math.min(d, pointSegDist(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return d;
}

function strictlyInside(p, poly, eps) {
  if (pointPolyDist(p, poly) <= eps) return false;
  return pointInPolygon(p, poly);
}

function bboxOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function bboxesTouch(a, b, pad = 0) {
  return a.minX - pad <= b.maxX && b.minX - pad <= a.maxX &&
         a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
}

// True when one block's interior reaches into the other; touching corners are
// not overlaps, hence the epsilon.
export function plotsOverlap(a, b, eps = 6) {
  if (!bboxesTouch(bboxOf(a), bboxOf(b))) return false;
  for (const p of a) if (strictlyInside(p, b, eps)) return true;
  for (const p of b) if (strictlyInside(p, a, eps)) return true;
  return false;
}

export function normalizePlots(raw, opts = {}) {
  const { minPlot = 80, maxPlot = 12000, maxEdgeRatioLimit = 4, maxPlots = 3000 } = opts;
  const stats = { input: raw.length, open: 0, tiny: 0, sliver: 0, folded: 0, overlapping: 0, garden: 0, kept: 0 };
  const candidates = [];

  for (const item of raw) {
    if (!item || item.open) { stats.open++; continue; }
    const src = Array.isArray(item) ? item : item.points;
    if (!src || src.length < 3) { stats.tiny++; continue; }

    let pts = src.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({ x: p.x, y: p.y }));
    if (pts.length < 3) { stats.tiny++; continue; }
    if (!polyIsClockwise(pts)) pts.reverse();

    const area2 = polyArea(pts);
    const area = area2 * UNIT2_TO_M2;
    if (area < minPlot) { stats.tiny++; continue; }
    if (minEdgeOf(pts) < 100) { stats.sliver++; continue; }
    if (maxEdgeRatioLimit && longestEdgeOf(pts) > maxEdgeRatioLimit * Math.sqrt(area2)) { stats.sliver++; continue; }
    if (polySelfIntersects(pts)) { stats.folded++; continue; }

    pts.open = false;
    pts.isClockwise = true;
    pts.areaM2 = area;
    pts.green = area > maxPlot;
    candidates.push(pts);
  }

  candidates.sort((a, b) => b.areaM2 - a.areaM2);
  const kept = [];
  for (const cand of candidates) {
    let clash = false;
    for (const k of kept) {
      if (plotsOverlap(cand, k)) { clash = true; break; }
    }
    if (clash) { stats.overlapping++; continue; }
    if (cand.green) stats.garden++;
    kept.push(cand);
    if (kept.length >= maxPlots) break;
  }

  stats.kept = kept.length;
  return { plots: kept, stats };
}
