import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SCALE = 0.01;

const MATS = {
  exterior:    new THREE.MeshLambertMaterial({ color: 0xd0cfc8, side: THREE.DoubleSide }),
  exteriorSnd: new THREE.MeshLambertMaterial({ color: 0xb8b4a8, side: THREE.DoubleSide }),
  interior:    new THREE.MeshLambertMaterial({ color: 0xe8e4dc, side: THREE.DoubleSide }),
  floor:       new THREE.MeshLambertMaterial({ color: 0x9a9590, side: THREE.FrontSide }),
  roof:        new THREE.MeshLambertMaterial({ color: 0x787470, side: THREE.FrontSide }),
  road:        new THREE.MeshLambertMaterial({ color: 0x2a2a28, side: THREE.DoubleSide }),
  roadLine:    new THREE.MeshLambertMaterial({ color: 0xf0d060, side: THREE.DoubleSide }),
  plot:        new THREE.MeshLambertMaterial({ color: 0xb8b0a0, side: THREE.FrontSide }),
  window:      new THREE.MeshLambertMaterial({ color: 0x4a8ab0, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }),
  occlusionWindow: new THREE.MeshLambertMaterial({ color: 0x0a1520, side: THREE.DoubleSide }),
  concrete:    new THREE.MeshLambertMaterial({ color: 0xd8d4cc, side: THREE.FrontSide }),
  roadMiddle:  new THREE.MeshLambertMaterial({ color: 0xf0d060, side: THREE.DoubleSide }),
  windowFrame: new THREE.MeshLambertMaterial({ color: 0xf0ece0, side: THREE.DoubleSide }),
  balcony:     new THREE.MeshLambertMaterial({ color: 0xc8c0b0, side: THREE.DoubleSide }),
  tree:        new THREE.MeshLambertMaterial({ color: 0x3a6e2a, side: THREE.DoubleSide }),
  lampPost:    new THREE.MeshLambertMaterial({ color: 0x606060, side: THREE.DoubleSide }),
  crossing:    new THREE.MeshLambertMaterial({ color: 0xf8f8f0, side: THREE.DoubleSide }),
  awning:      new THREE.MeshLambertMaterial({ color: 0xc84040, side: THREE.DoubleSide }),
  bush:        new THREE.MeshLambertMaterial({ color: 0x4a8030, side: THREE.DoubleSide }),
  furniture:   new THREE.MeshLambertMaterial({ color: 0xa08060, side: THREE.DoubleSide }),
};

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8cce0);
  scene.fog = new THREE.FogExp2(0xb8cce0, 0.00015);

  // A second scene drawn over the first, sharing the camera and the depth
  // buffer. `scene.overrideMaterial` (clay, wireframe, blueprint) replaces every
  // material in the main scene, so anything that must keep its own colour — the
  // ground grid, the editing handles — lives here instead. Depth testing still
  // works because the depth buffer from the main pass is left in place.
  const overlay = new THREE.Scene();

  // Metre-scale world: a near plane of 0.1 against a far plane of 50 000 leaves
  // ~5 cm of depth precision at the far edge of a site, which makes every thin
  // decal flicker. 0.5 / 8000 gives centimetre precision where the layout lives
  // and still covers the fog distance.
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 8000);
  camera.position.set(0, 300, 300);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Keep the eye above the site. Orbiting past the horizon drops the camera
  // under the ground plane, which reads as the whole plan turned inside out and
  // leaves nothing between the camera and the sky.
  controls.maxPolarAngle = Math.PI * 0.5 - 0.02;
  controls.minDistance = 4;
  controls.maxDistance = 4000;

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xfff8e8, 2.5);
  sun.position.set(1000, 2000, 800);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Acne shimmer: the default bias is tuned for the city, where one shadow texel
  // is ~2 m wide. A small normal bias fixes self-shadowing on walls and roofs.
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.2;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 10000;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -2000;
  sun.shadow.camera.right = sun.shadow.camera.top = 2000;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x8090c0, 0.6);
  fill.position.set(-200, 100, -300);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshLambertMaterial({ color: 0x6a7860 })
  );
  ground.rotation.x = -Math.PI / 2;
  // Drop the base plane a little so site grass, which sits 4 cm up, cannot
  // fight the 2000-unit ground at grazing angles.
  ground.position.y = -0.25;
  ground.receiveShadow = true;
  scene.add(ground);

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  let frameId;
  (function animate() {
    frameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(overlay, camera);
    renderer.autoClear = true;
  })();

  return { scene, overlay, camera, controls, renderer, sun, dispose: () => cancelAnimationFrame(frameId) };
}

const LAYER_OF = {
  exterior: 'buildings', exteriorSnd: 'buildings', interior: 'buildings', floor: 'buildings',
  roof: 'buildings', window: 'buildings', windowFrame: 'buildings', occlusionWindow: 'buildings',
  balcony: 'buildings', awning: 'buildings', furniture: 'buildings',
  concrete: 'landscape', tree: 'landscape', lampPost: 'landscape', bush: 'landscape',
  crossing: 'markings', roadMiddle: 'markings', roadLine: 'markings',
  road: 'roads', plot: 'plots',
};

export function buildCityMesh(scene, roads, plots, materialPols) {
  const group = new THREE.Group();
  const layers = {};
  for (const name of ['roads', 'markings', 'plots', 'landscape', 'buildings']) {
    const g = new THREE.Group();
    g.name = name;
    layers[name] = g;
    group.add(g);
  }

  // Roads
  const validRoad = r => r.v1 && r.v2 && r.v3 && r.v4 &&
    isFinite(r.v1.x) && isFinite(r.v1.y) && isFinite(r.v2.x) && isFinite(r.v2.y) &&
    isFinite(r.v3.x) && isFinite(r.v3.y) && isFinite(r.v4.x) && isFinite(r.v4.y);
  const validRoads = roads.filter(validRoad);
  const roadQuads = validRoads.map(r => [r.v1, r.v2, r.v4, r.v3]);
  const roadGeo = mergeQuads(roadQuads, SCALE, 0.2);
  if (roadGeo) {
    const m = new THREE.Mesh(roadGeo, MATS.road);
    m.receiveShadow = true;
    layers.roads.add(m);
  }

  // Road center lines (main + secondary roads)
  const lineQuads = [];
  for (const r of roads) {
    const isMain = r.type === 'main';
    const dx = r.p2.x - r.p1.x, dy = r.p2.y - r.p1.y;
    const len = Math.hypot(dx, dy), tx = dx/len, ty = dy/len;
    const lw = isMain ? 10 : 5;
    const dashLen = isMain ? 200 : 150, dashGap = isMain ? 400 : 300;
    let pos = dashGap * 0.5;
    while (pos < len - dashLen) {
      const s = { x: r.p1.x + tx*pos, y: r.p1.y + ty*pos };
      const e = { x: r.p1.x + tx*(pos+dashLen), y: r.p1.y + ty*(pos+dashLen) };
      lineQuads.push([
        { x: s.x - ty*lw, y: s.y + tx*lw }, { x: s.x + ty*lw, y: s.y - tx*lw },
        { x: e.x + ty*lw, y: e.y - tx*lw }, { x: e.x - ty*lw, y: e.y + tx*lw }
      ]);
      pos += dashGap;
    }
  }
  const lineGeo = mergeQuads(lineQuads, SCALE, 0.4);
  if (lineGeo) layers.markings.add(new THREE.Mesh(lineGeo, MATS.roadLine));

  // Plot fills
  const plotGeo = mergePolygons(plots, SCALE, 0.05);
  if (plotGeo) {
    const m = new THREE.Mesh(plotGeo, MATS.plot);
    m.receiveShadow = true;
    layers.plots.add(m);
  }

  // Building material polygons grouped by type
  const byType = {};
  for (const pol of materialPols) {
    const t = pol.type || 'exterior';
    if (!byType[t]) byType[t] = [];
    byType[t].push(pol);
  }

  for (const [type, polList] of Object.entries(byType)) {
    const mat = MATS[type] || MATS.exterior;
    const geo = buildPolygonGeometry(polList, SCALE);
    if (geo) {
      const m = new THREE.Mesh(geo, mat);
      const layer = LAYER_OF[type] || 'buildings';
      m.castShadow = layer === 'buildings';
      m.receiveShadow = true;
      layers[layer].add(m);
    }
  }

  scene.add(group);
  return { group, layers };
}

function mergeQuads(quads, sc, yOff = 0) {
  if (!quads.length) return null;
  const pos = [], idx = [];
  let vi = 0;
  for (const [a, b, c, d] of quads) {
    for (const p of [a, b, c, d]) pos.push(p.x * sc, yOff, p.y * sc);
    idx.push(vi, vi+2, vi+1, vi, vi+3, vi+2);
    vi += 4;
  }
  return buildGeo(pos, idx);
}

function mergePolygons(polys, sc, yOff = 0) {
  const pos = [], idx = [];
  let vi = 0;
  for (const pts of polys) {
    if (pts.length < 3) continue;
    const verts2d = pts.map(p => new THREE.Vector2(p.x * sc, p.y * sc));
    const shape = new THREE.Shape(verts2d);
    const tris = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
    const base = vi;
    for (const p of shape.getPoints()) { pos.push(p.x, yOff, p.y); vi++; }
    for (const [a, b, c] of tris) idx.push(base+a, base+b, base+c);
  }
  if (!pos.length) return null;
  return buildGeo(pos, idx);
}

// Project a 3D polygon's points onto a 2D local coordinate system for triangulation
// Uses the plane defined by the polygon's first 3 points
function projectTo2D(pts3d) {
  if (pts3d.length < 3) return null;
  const o = pts3d[0];
  // e1 along first edge
  const ex = pts3d[1].x - o.x, ey = pts3d[1].y - o.y, ez = (pts3d[1].z||0) - (o.z||0);
  const el = Math.hypot(ex, ey, ez);
  if (el < 1e-10) return null;
  const e1 = { x: ex/el, y: ey/el, z: ez/el };
  // normal = cross(e1, pts[n-1]-pts[0])
  const ax = pts3d[pts3d.length-1].x - o.x;
  const ay = pts3d[pts3d.length-1].y - o.y;
  const az = (pts3d[pts3d.length-1].z||0) - (o.z||0);
  let nx = e1.y*az - e1.z*ay;
  let ny = e1.z*ax - e1.x*az;
  let nz = e1.x*ay - e1.y*ax;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-10) return null;
  nx /= nl; ny /= nl; nz /= nl;
  // e2 = cross(e1, n)
  const e2x = e1.y*nz - e1.z*ny;
  const e2y = e1.z*nx - e1.x*nz;
  const e2z = e1.x*ny - e1.y*nx;

  const projected = pts3d.map(p => {
    const dx = p.x - o.x, dy = p.y - o.y, dz = (p.z||0) - (o.z||0);
    return {
      u: dx*e1.x + dy*e1.y + dz*e1.z,
      v: dx*e2x  + dy*e2y  + dz*e2z,
    };
  });
  return projected;
}

// Triangulate a 3D polygon that may lie in any plane (wall, floor, roof)
// Supports optional holes (array of arrays of 3D points)
function triangulate3DPolygon(pts3dIn, holes3d) {
  if (!pts3dIn || pts3dIn.length < 3) return null;
  if (pts3dIn.some(p => !p || !isFinite(p.x) || !isFinite(p.y))) return null;

  // Build local 2D basis from first edge and polygon normal
  const o = pts3dIn[0];
  const ex = pts3dIn[1].x - o.x, ey = pts3dIn[1].y - o.y, ez = (pts3dIn[1].z||0) - (o.z||0);
  const el = Math.hypot(ex, ey, ez);
  if (el < 1e-10) return null;
  const e1 = { x: ex/el, y: ey/el, z: ez/el };
  const ax = pts3dIn[pts3dIn.length-1].x - o.x;
  const ay = pts3dIn[pts3dIn.length-1].y - o.y;
  const az = (pts3dIn[pts3dIn.length-1].z||0) - (o.z||0);
  let nx = e1.y*az - e1.z*ay, ny = e1.z*ax - e1.x*az, nz = e1.x*ay - e1.y*ax;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-10) return null;
  nx /= nl; ny /= nl; nz /= nl;
  const e2x = e1.y*nz - e1.z*ny, e2y = e1.z*nx - e1.x*nz, e2z = e1.x*ny - e1.y*nx;

  const project = p => {
    const dx = p.x - o.x, dy = p.y - o.y, dz = (p.z||0) - (o.z||0);
    return new THREE.Vector2(dx*e1.x + dy*e1.y + dz*e1.z, dx*e2x + dy*e2y + dz*e2z);
  };

  // Project outer polygon; ensure CCW for THREE.js
  let pts3d = pts3dIn;
  let outerVec2 = pts3d.map(project);
  if (THREE.ShapeUtils.area(outerVec2) < 0) {
    pts3d = [...pts3dIn].reverse();
    outerVec2 = pts3d.map(project);
  }

  const holeVec2Arrays = [];
  const holes3dOrdered = [];
  if (holes3d && holes3d.length > 0) {
    for (const hole of holes3d) {
      if (!hole || hole.length < 3) continue;
      let hv2 = hole.map(project);
      let hpts = hole;
      // Holes must be CW
      if (THREE.ShapeUtils.area(hv2) > 0) {
        hpts = [...hole].reverse();
        hv2 = hpts.map(project);
      }
      holeVec2Arrays.push(hv2);
      holes3dOrdered.push(hpts);
    }
  }

  let tris;
  try {
    tris = THREE.ShapeUtils.triangulateShape(outerVec2, holeVec2Arrays);
  } catch(e) { return null; }
  if (!tris || !tris.length) return null;

  // Combine all points: outer first, then holes in same order as holeVec2Arrays
  const allPts3d = [...pts3d];
  for (const h of holes3dOrdered) allPts3d.push(...h);

  return { pts: allPts3d, tris };
}

// Build merged geometry from an array of material polygon objects
// Each polygon has: { points: [...], type, holePoints? (for floors with holes), windows? (wall holes) }
function buildPolygonGeometry(polList, sc) {
  const pos = [], idx = [];
  let vi = 0;

  for (const pol of polList) {
    const pts = pol.points;
    if (!pts || pts.length < 3) continue;
    if (pts.some(p => !p || !isFinite(p.x) || !isFinite(p.y))) continue;

    // Gather holes
    const holes3d = [];
    if (pol.holePoints && pol.holePoints.length >= 3) holes3d.push(pol.holePoints);
    if (pol.windows && pol.windows.length > 0) {
      for (const win of pol.windows) {
        if (win.points && win.points.length >= 3) holes3d.push(win.points);
      }
    }

    if (holes3d.length === 0 && pts.length === 4) {
      // Fast path: simple quad, two triangles
      for (const p of pts) { pos.push(p.x*sc, (p.z||0)*sc, p.y*sc); }
      idx.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
      vi += 4;
      continue;
    }

    // General: project to 2D, triangulate with optional holes
    const result = triangulate3DPolygon(pts, holes3d.length > 0 ? holes3d : null);
    if (!result) continue;

    const base = vi;
    for (const p of result.pts) {
      pos.push(p.x * sc, (p.z||0) * sc, p.y * sc);
      vi++;
    }
    for (const [a, b, c] of result.tris) {
      idx.push(base+a, base+b, base+c);
    }
  }

  if (!pos.length) return null;
  return buildGeo(pos, idx);
}

function buildGeo(pos, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
