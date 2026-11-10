// editHandles.js — the little green dots and dashes you grab.
//
// Everything sits on one invisible plane just above the decal ladder and is
// drawn with `depthTest: false`, so a handle is always visible and always
// grabbable, even on a bed under a road or a pad under an RV. Points use
// `sizeAttenuation: false` so a corner stays the same size on screen at every
// zoom, which is what makes them feel like pick targets rather than geometry.
//
// Picking is done in screen space rather than by raycasting the dots: a 9-pixel
// point has no useful raycast target, and projecting a handful of corners is
// cheaper and works at any angle. That is also how the edge handles avoid
// THREE.Raycaster.params.Line.threshold guesswork.

import * as THREE from 'three';
import { DECAL_Z } from './decalZ.js';

const S = 0.01;
// Above every decal in decalZ (the tallest is 46 cm), so nothing z-fights.
const H = (DECAL_Z.poolWater + 14) * S;

const ACCENT = 0x7fc7a8;
const HOT = 0xffd479;

export function worldPoint(p) {
  return new THREE.Vector3(p.x * S, H, p.y * S);
}

export function projectPoint(p, camera, canvas) {
  const v = worldPoint(p).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    z: v.z,
  };
}

function segmentDistance(a, b, x, y) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - a.x) * dx + (y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

export function nearestVertex(points, sx, sy, camera, canvas, radius = 12) {
  let best = null, bestD = radius;
  for (let i = 0; i < points.length; i++) {
    const s = projectPoint(points[i], camera, canvas);
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d <= bestD) { bestD = d; best = { i, point: points[i] }; }
  }
  return best;
}

export function nearestEdge(points, sx, sy, camera, canvas, radius = 10) {
  let best = null, bestD = radius;
  for (let i = 0; i < points.length; i++) {
    const a = projectPoint(points[i], camera, canvas);
    const b = projectPoint(points[(i + 1) % points.length], camera, canvas);
    const d = segmentDistance(a, b, sx, sy);
    if (d <= bestD) { bestD = d; best = { i }; }
  }
  return best;
}

export function midpoints(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return out;
}

export function createHandles(scene) {
  const group = new THREE.Group();
  group.name = 'edithandles';
  scene.add(group);

  const mats = {
    outline: new THREE.LineBasicMaterial({
      color: ACCENT, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85,
    }),
    edge: new THREE.LineBasicMaterial({
      color: HOT, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9,
    }),
    vertex: new THREE.PointsMaterial({
      color: ACCENT, size: 9, sizeAttenuation: false,
      depthTest: false, depthWrite: false, transparent: true,
    }),
    edgeDot: new THREE.PointsMaterial({
      color: HOT, size: 8, sizeAttenuation: false,
      depthTest: false, depthWrite: false, transparent: true,
    }),
  };

  let parts = [];

  function clear() {
    for (const part of parts) {
      group.remove(part);
      if (part.geometry) part.geometry.dispose();
    }
    parts = [];
  }

  function line(points, closed, mat) {
    if (points.length < 2) return null;
    const pts = points.map(worldPoint);
    if (closed) pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(geo, mat);
    l.renderOrder = 1000;
    l.frustumCulled = false;
    group.add(l);
    parts.push(l);
    return l;
  }

  function dots(points, mat) {
    if (!points.length) return null;
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(worldPoint));
    const p = new THREE.Points(geo, mat);
    p.renderOrder = 1001;
    p.frustumCulled = false;
    group.add(p);
    parts.push(p);
    return p;
  }

  // `vertices` and `edges` are the two sub-object selections; the outline is
  // always shown so it is obvious which object the handles belong to.
  function show(points, { vertices = false, edges = false } = {}) {
    clear();
    if (!points || points.length < 2) return;
    line(points, true, mats.outline);
    if (edges) {
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        line([a, b], false, mats.edge);
      }
      dots(midpoints(points), mats.edgeDot);
    }
    if (vertices) dots(points, mats.vertex);
  }

  function hide() { clear(); }

  return { group, show, hide, clear };
}
