// 2D geometry utilities - ported from BaseLibrary.cpp / BaseLibrary.h

// --- Vector operations ---

export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(v, s) { return { x: v.x * s, y: v.y * s }; }
export function dot(a, b) { return a.x * b.x + a.y * b.y; }

export function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-10) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distSq(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export function mid(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

export function length(v) {
  return Math.hypot(v.x, v.y);
}

// Rotate v by angle (radians) in 2D
export function rot2(v, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

// Equivalent of FRotator(0, 90, 0).RotateVector - rotate 90° CCW
// (x, y) -> (-y, x)
export function rot90(v) { return { x: -v.y, y: v.x }; }

// Equivalent of FRotator(0, 270, 0).RotateVector - rotate 90° CW
// (x, y) -> (y, -x)
export function rot270(v) { return { x: v.y, y: -v.x }; }

// Perpendicular (same as rot90)
export function perp(v) { return { x: -v.y, y: v.x }; }

// Get normal of edge p1->p2
// right=true: FRotator(0, 90, 0), right=false: FRotator(0, 270, 0)
export function getNormal(p1, p2, right) {
  const d = sub(p2, p1);
  return right ? rot90(d) : rot270(d);
}

// --- Segment intersection ---
// Returns intersection point or null
// Ported from BaseLibrary.cpp intersection(FVector p1, FVector p2, FVector p3, FVector p4)
export function segIntersect(p1, p2, p3, p4) {
  const s1x = p2.x - p1.x, s1y = p2.y - p1.y;
  const s2x = p4.x - p3.x, s2y = p4.y - p3.y;
  const denom = -s2x * s1y + s1x * s2y;
  if (Math.abs(denom) < 1e-10) return null;
  const s = (-s1y * (p1.x - p3.x) + s1x * (p1.y - p3.y)) / denom;
  const t = ( s2x * (p1.y - p3.y) - s2y * (p1.x - p3.x)) / denom;
  if (s >= 0 && s <= 1 && t >= 0 && t <= 1)
    return { x: p1.x + t * s1x, y: p1.y + t * s1y };
  return null;
}

// Intersection of a line segment with a polygon
export function polyIntersect(p1, p2, poly) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const r = segIntersect(p1, p2, a, b);
    if (r) return r;
  }
  return null;
}

// "Proper" intersection check used in getSurroundingPolygons
// Extends segments slightly at perpendicular ends to catch near-misses
// Ported from BaseLibrary.cpp getProperIntersection
export function getProperIntersection(p1, p2, p3, p4) {
  const otherTangent = sub(p2, p1);
  const otherPerp = rot90(otherTangent);
  const pn = normalize(otherPerp);
  const backLen = 300;

  // Check if p3-p4 crosses the perpendicular at p2
  let res = segIntersect(
    add(p2, scale(pn, backLen)), add(p2, scale(pn, -backLen)),
    p3, p4
  );
  if (!res) {
    // Check perpendicular at p1
    res = segIntersect(
      add(p1, scale(pn, backLen)), add(p1, scale(pn, -backLen)),
      p3, p4
    );
    if (!res) {
      // Fall back to direct intersection
      res = segIntersect(p1, p2, p3, p4);
    }
  }
  return res;
}

// --- Polygon utilities ---

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) * 0.5;
}

export function polyIsClockwise(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
  }
  return s > 0;
}

export function polyCenter(pts) {
  if (pts.length === 0) return { x: 0, y: 0 };
  // Weighted center by edge lengths (matches FPolygon::getCenter)
  let cx = 0, cy = 0, totLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const len = dist(pts[i], pts[j]);
    const mx = (pts[i].x + pts[j].x) * 0.5;
    const my = (pts[i].y + pts[j].y) * 0.5;
    cx += mx * len;
    cy += my * len;
    totLen += len;
  }
  if (totLen < 1e-10) return { x: pts[0].x, y: pts[0].y };
  return { x: cx / totLen, y: cy / totLen };
}

// Simple centroid (average of points)
export function polyCentroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

// Reverse polygon winding
export function polyReverse(pts) {
  return pts.slice().reverse();
}

// Ensure polygon is clockwise, reversing if needed
export function polyEnsureClockwise(pts) {
  if (!polyIsClockwise(pts)) return polyReverse(pts);
  return pts.slice();
}

// Remove edges shorter than distDiffAllowed (FPolygon::decreaseEdges)
export function polyDecreaseEdges(pts, distDiffAllowed = 10) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      if (dist(pts[i], pts[j]) < distDiffAllowed) {
        pts.splice(j === 0 ? 0 : j, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

// Remove very sharp corners (FPolygon::clipEdges)
export function polyClipEdges(pts, maxDot = -0.96) {
  // First decrease edges
  polyDecreaseEdges(pts);
  // Then remove sharp corners
  for (let i = 0; i < pts.length; i++) {
    const prev = (i === 0) ? pts.length - 1 : i - 1;
    const next = (i + 1) % pts.length;
    const tan1 = normalize(sub(pts[i], pts[prev]));
    const tan2 = normalize(sub(pts[next], pts[i]));
    const d = dot(tan1, tan2);
    if (d < maxDot && pts.length > 3) {
      pts.splice(next, 1);
      i--;
    }
  }
  return pts;
}

// Shrink polygon inward by distance d (FPolygon::symmetricShrink)
// For CW polygons (our standard), inward normal = rot270(tangent) = (e.y, -e.x)
export function shrinkPoly(pts, d) {
  const n = pts.length;
  const isCW = polyIsClockwise(pts);
  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const e1 = normalize(sub(curr, prev));
    const e2 = normalize(sub(next, curr));
    // inward normal: rot270 for CW, rot90 for CCW
    const n1 = isCW ? rot270(e1) : perp(e1);
    const n2 = isCW ? rot270(e2) : perp(e2);
    const nx = (n1.x + n2.x) * 0.5, ny = (n1.y + n2.y) * 0.5;
    const len = Math.hypot(nx, ny);
    if (len < 1e-10) { result.push({ x: curr.x, y: curr.y }); continue; }
    result.push({ x: curr.x + (nx / len) * d, y: curr.y + (ny / len) * d });
  }
  return result;
}

// Get split proposal for polygon - find longest edge, split perpendicular at midpoint
// Ported from FPolygon::getSplitProposal
export function getSplitProposal(pts, isClockwise, approxRatio = 0.5) {
  if (pts.length < 3) return null;

  // Find longest edge
  let longestLen = 0, longest = -1;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const d = distSq(pts[i], pts[j]);
    if (d > longestLen) {
      longestLen = d;
      longest = i;
    }
  }
  if (longest === -1) return null;

  const j = (longest + 1) % pts.length;
  const curr = normalize(sub(pts[j], pts[longest]));

  // Midpoint along longest edge (using approxRatio)
  const middle = add(pts[longest], scale(sub(pts[j], pts[longest]), approxRatio));
  const p1 = middle;

  // Perpendicular direction to split
  const tangent = isClockwise ? rot270(curr) : rot90(curr);

  // Find where the perpendicular hits the polygon
  let closestDist = Infinity;
  let split = -1;
  let p2 = null;

  for (let i = 0; i < pts.length; i++) {
    // Skip the edge we're splitting from
    if (i === longest) continue;
    const iNext = (i + 1) % pts.length;
    const res = segIntersect(p1, add(p1, scale(tangent, 100000)), pts[i], pts[iNext]);
    if (res && dist(res, p1) < closestDist) {
      closestDist = dist(res, p1);
      split = i;
      p2 = res;
    }
  }

  if (!p2) return null;

  // Use 1-based indexing to match original (min/max are edge indices)
  let min = longest + 1;  // 1-based index of the longest edge
  let max = split + 1;    // 1-based index of the split edge

  let rp1 = p1, rp2 = p2;

  // Rearrange if split comes before longest
  if (min > max) {
    const temp = rp1;
    rp1 = rp2;
    rp2 = temp;
    const tMin = min;
    min = max;
    max = tMin;
  }

  return { min, max, p1: rp1, p2: rp2 };
}

// Split polygon along a split struct
// Returns [polyA, polyB] where polyB is the new polygon
// Ported from FHousePolygon::splitAlongMax
export function splitPolygonAlongMax(pts, spaceBetween = 0) {
  const isClockwise = polyIsClockwise(pts);
  const sp = getSplitProposal(pts, isClockwise, 0.5);
  if (!sp) return [pts, null];

  const { min, max, p1, p2 } = sp;
  const n = pts.length;

  // Build new polygon from the split region
  const newPoly = [p1];
  // Add points from min to max (exclusive of the endpoints already added via p1/p2)
  for (let idx = min; idx < max; idx++) {
    newPoly.push({ ...pts[idx % n] });
  }
  newPoly.push(p2);

  // Remaining polygon
  const remaining = [p2];
  for (let idx = max; idx < min + n; idx++) {
    remaining.push({ ...pts[idx % n] });
  }
  remaining.push(p1);

  if (newPoly.length < 3 || remaining.length < 3) return [pts, null];
  return [remaining, newPoly];
}

// Drop duplicate and near-collinear vertices. City geometry arrives with many
// of both (grid snapping, split points along a straight run), and naive
// inward insets are only reliable on a cleaned ring.
export function cleanPolygon(pts, tol = 40) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p.x - q.x, p.y - q.y) < tol) continue;
    out.push({ x: p.x, y: p.y });
  }
  if (out.length > 1) {
    const first = out[0], last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < tol) out.pop();
  }
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y);
      const l2 = Math.hypot(c.x - b.x, c.y - b.y);
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) <= 0.002 * l1 * l2 + 1) { out.splice(i, 1); changed = true; i--; }
    }
  }
  return out;
}

// True when no two non-adjacent edges properly cross. Endpoint touches and
// collinear runs are allowed, which is what makes it usable on city blocks;
// polySelfIntersects below extends every edge and false-positives on them.
function orient2(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }

function edgesCross(a, b, c, d) {
  const o1 = orient2(a, b, c), o2 = orient2(a, b, d);
  const o3 = orient2(c, d, a), o4 = orient2(c, d, b);
  if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) return false;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

export function polySimple(pts) {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (edgesCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

// Strong overlap test: two polygons overlap if any pair of edges properly cross
// OR a vertex of one lies strictly inside the other. Vertex containment alone
// misses a plus-shaped crossing, which is exactly the "building through a
// building" case.
export function polyOverlapProper(a, b, eps = 6) {
  if (!a || !b || a.length < 3 || b.length < 3) return false;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (edgesCross(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  for (const p of a) if (pointInRing(p, b) && distToRing(p, b) > eps) return true;
  for (const p of b) if (pointInRing(p, a) && distToRing(p, a) > eps) return true;
  return false;
}

// Clip a polygon to the half-plane dot(p - origin, normal) >= 0.
export function clipHalfPlane(pts, origin, normal) {
  const side = p => (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const sa = side(a), sb = side(b);
    if (sa >= -1e-6) out.push({ x: a.x, y: a.y });
    if ((sa > 1e-6 && sb < -1e-6) || (sa < -1e-6 && sb > 1e-6)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

// Cut a polygon in two along a line through `origin`. Both halves are the
// parent clipped by a half-plane, so they cannot overlap or leave the parent —
// unlike the index-based split used for house rooms.
export function splitPolygonByLine(pts, origin, normal) {
  const a = cleanPolygon(clipHalfPlane(pts, origin, normal), 40);
  const b = cleanPolygon(clipHalfPlane(pts, origin, { x: -normal.x, y: -normal.y }), 40);
  if (a.length < 3 || b.length < 3) return null;
  if (!polySimple(a) || !polySimple(b)) return null;
  return [a, b];
}

// Inset that cannot fold. Miter offsetting a concave ring (a city block with a
// notch) self-intersects at the reflex corners, so if the offset is not simple
// fall back to a uniform scale about the centroid — an affine map of a simple
// polygon is always simple.
function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function distToRing(p, ring) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.min(1, Math.max(0, t));
    d = Math.min(d, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return d;
}

// An inset is only usable if it stays inside the ring it came from: a miter
// offset pushes reflex vertices outward, and a scaled fallback can leave a
// non-star-shaped block, either of which would put a building in the street.
export function insetPolygon(pts, d) {
  if (!pts || pts.length < 3) return null;
  const ring = cleanPolygon(pts);
  if (ring.length < 3) return null;
  if (!(d > 0)) return ring;

  const contained = (cand) => cand && cand.length >= 3 && polySimple(cand) && polyArea(cand) > 0 &&
    cand.every(p => pointInRing(p, ring) || distToRing(p, ring) <= 1);

  // Clean at roughly the inset distance (capped): the miter leaves sub-metre
  // stubs at reflex corners that are not real geometry.
  const offset = cleanPolygon(shrinkPoly(ring, d), Math.min(200, Math.max(100, d * 0.4)));
  if (contained(offset)) return offset;

  // Fallback: uniform scale about the centroid, which cannot fold, accepted
  // only if it really sits inside the block.
  const c = polyCenter(ring);
  let r = 0;
  for (const p of ring) r = Math.max(r, Math.hypot(p.x - c.x, p.y - c.y));
  const k = Math.max(0.3, 1 - d / Math.max(1, r));
  const scaled = cleanPolygon(ring.map(p => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })));
  return contained(scaled) ? scaled : null;
}

// Clip a polygon to a convex clip polygon (Sutherland–Hodgman).
export function clipToConvex(subject, clipPts) {
  if (!subject || subject.length < 3 || !clipPts || clipPts.length < 3) return [];
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
  const cleaned = out.length >= 3 ? cleanPolygon(out, 2) : [];
  return cleaned.length >= 3 ? cleaned : [];
}

// How much two pieces of a layout overlap, in cm². A shared edge measures 0;
// a house standing in a road measures its footprint.
export function polyIntersectionArea(subject, convexClip) {
  if (!subject || subject.length < 3 || !convexClip || convexClip.length < 3) return 0;
  return polyArea(clipToConvex(subject, convexClip));
}

// Self-intersection check
export function polySelfIntersects(pts) {
  for (let i = 0; i < pts.length; i++) {
    const i2 = (i + 1) % pts.length;
    const t1 = normalize(sub(pts[i2], pts[i]));
    for (let j = i + 2; j < pts.length; j++) {
      if (j === pts.length - 1 && i === 0) continue; // skip adjacent
      const j2 = (j + 1) % pts.length;
      const t2 = normalize(sub(pts[j2], pts[j]));
      const a1 = add(pts[i], t1);
      const b1 = sub(pts[i2], t1);
      const a2 = add(pts[j], t2);
      const b2 = sub(pts[j2], t2);
      if (segIntersect(a1, b1, a2, b2)) return true;
    }
  }
  return false;
}

// Polygon intersection test (find first intersection point between two polygons)
export function polyPolyIntersection(poly1, poly2) {
  for (let i = 0; i < poly1.length; i++) {
    const i2 = (i + 1) % poly1.length;
    for (let j = 0; j < poly2.length; j++) {
      const j2 = (j + 1) % poly2.length;
      const res = segIntersect(poly1[i], poly1[i2], poly2[j], poly2[j2]);
      if (res) return res;
    }
  }
  return null;
}
