// Plain rectangle / polyline helpers. All units are feet.

export const R = (x, y, w, h) => ({ x, y, w, h });
export const right = (r) => r.x + r.w;
export const bottom = (r) => r.y + r.h;
export const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
export const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function inset(r, d) {
  return R(r.x + d, r.y + d, r.w - 2 * d, r.h - 2 * d);
}

export function rectFrom(x1, y1, x2, y2) {
  return R(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
}

export function overlaps(a, b, pad = 0) {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

export function contains(outer, inner) {
  return (
    inner.x >= outer.x - 0.01 &&
    inner.y >= outer.y - 0.01 &&
    inner.x + inner.w <= outer.x + outer.w + 0.01 &&
    inner.y + inner.h <= outer.y + outer.h + 0.01
  );
}

export function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function pointToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = pointToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

export function polyLength(pts) {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return total;
}

export function rectPoints(r) {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

export function roundRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return [
    `M${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h - rr}`,
    `Q${x + w},${y + h} ${x + w - rr},${y + h}`,
    `H${x + rr}`,
    `Q${x},${y + h} ${x},${y + h - rr}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    'Z',
  ].join(' ');
}
