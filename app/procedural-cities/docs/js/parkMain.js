import * as THREE from 'three';
import { createScene } from './scene.js?v=park-30';
import { buildParkMesh } from './parkScene.js?v=park-30';
import { makeArea, layoutPark, FACILITY_KINDS } from './parkGen.js?v=park-30';
import { PARK_DEFAULTS, PARK_PRESETS, clampParkRules } from './parkRules.js?v=park-30';
import { VILLAGE_FACILITY_KINDS } from './villageGen.js?v=park-30';
import { cleanPolygon, polySimple, polyArea } from './utils.js?v=park-30';
import { createRail } from './editRail.js?v=park-30';
import { createViewMenu } from './viewMenu.js?v=park-30';
import { createEditor } from './editController.js?v=park-30';
import { index as indexLayout } from './editDoc.js?v=park-30';

const overlay = document.getElementById('overlay');
const statsEl = document.getElementById('stats');
const notesEl = document.getElementById('notes');
const notesGroup = document.getElementById('notes-group');
const drawHint = document.getElementById('drawHint');
const hovercard = document.getElementById('hovercard');

const LAYERS = ['area', 'roads', 'sites', 'rv', 'facilities', 'gardens', 'planting'];

const FMT = {
  seed: v => `#${v}`,
  areaWidth: v => `${(v / 100).toFixed(0)} m wide`,
  areaDepth: v => `${(v / 100).toFixed(0)} m deep`,
  areaRotation: v => `${v}°`,
  perimeter: v => `${(v / 100).toFixed(1)} m green edge`,
  driveWidth: v => (v === 0 ? 'no loop — aisles dead-end' : `${(v / 100).toFixed(1)} m loop`),
  pitchWidth: v => `${(v / 100).toFixed(1)} m`,
  pitchDepth: v => `${(v / 100).toFixed(1)} m`,
  pitchGap: v => `${(v / 100).toFixed(1)} m`,
  aisleWidth: v => `${(v / 100).toFixed(1)} m`,
  rowPairs: v => `${v} row${v > 1 ? 's' : ''} / aisle`,
  fillChance: v => `${Math.round(v * 100)}% occupied`,
  maxPitches: v => `${v} max`,
  padSetback: v => `${(v / 100).toFixed(1)} m`,
  facilityShare: v => `${Math.round(v * 100)}% frontage`,
  gardenDepth: v => `${(v / 100).toFixed(1)} m beds`,
  greenery: v => `${v.toFixed(1)}× planting`,
  jitter: v => (v === 0 ? 'aligned' : `±${(v / 100).toFixed(2)} m`),
  variety: v => (v === 0 ? 'one type' : `${Math.round(v * 100)}% mixed`),
  villageClusters: v => `${v} cluster${v > 1 ? 's' : ''}`,
  villageHouses: v => `${v} per court`,
  houseWidth: v => `${(v / 100).toFixed(2)} m`,
  houseDepth: v => `${(v / 100).toFixed(2)} m`,
  houseStoreys: v => (v > 1 ? 'two storeys' : 'single storey'),
  courtRadius: v => `${(v / 100).toFixed(1)} m radius`,
  plotDepth: v => (v === 0 ? 'no plot' : `${(v / 100).toFixed(1)} m`),
  wobble: v => (v === 0 ? 'dead straight' : `±${(v / 100).toFixed(1)} m`),
  roadWidth: v => `${(v / 100).toFixed(1)} m`,
  pathWidth: v => (v === 0 ? 'no footpaths' : `${(v / 100).toFixed(1)} m`),
  crossEvery: v => (v === 0 ? 'no cross paths' : `every ${v} cols`),
  squareWidth: v => (v === 0 ? 'no square' : `${(v / 100).toFixed(0)} × ${(v * 0.68 / 100).toFixed(0)} m`),
  parkRatio: v => (v === 0 ? 'no car park' : `${(v / 10).toFixed(1)} spaces / site`),
  unitKwh: v => (v === 0 ? 'no array' : `${v} kWh/day`),
  sunHours: v => `${(v / 10).toFixed(1)} h`,
};

let ctx = null;
let current = null;
let timer = null;
let running = false;
let pending = false;

// The editable document: the generated layout is the starting point, and every
// rail edit mutates these polygons and re-renders from them. `edited` records
// that a hand edit exists so a regenerate can say what it is about to lose.
let currentLayout = null;
let currentRules = null;
let edited = false;
let editor = null;

// Area state. `drawnPolygon` wins over the parametric shape once the user has
// traced a boundary; changing the width/depth/rotation sliders clears it.
let shape = PARK_DEFAULTS.areaShape;
let pattern = PARK_DEFAULTS.pattern;
let drawnPolygon = null;
let drawPts = null;
let hoverPt = null;
let drawLine = null;
let drawTicks = null;

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function ruleEls() {
  return Object.keys(PARK_DEFAULTS).map(k => document.getElementById(k)).filter(Boolean);
}

function readRules() {
  const raw = { areaShape: shape, pattern };
  for (const key of Object.keys(PARK_DEFAULTS)) {
    const el = document.getElementById(key);
    if (el) raw[key] = Number(el.value);
    else if (!(key in raw)) raw[key] = PARK_DEFAULTS[key];
  }
  return clampParkRules(raw);
}

function syncOutputs(rules) {
  for (const [key, fn] of Object.entries(FMT)) {
    const out = document.getElementById('v-' + key);
    if (out) out.textContent = fn(rules[key]);
  }
}

function writeRules(rules) {
  for (const key of Object.keys(PARK_DEFAULTS)) {
    const el = document.getElementById(key);
    if (el && key in rules) el.value = rules[key];
  }
  syncOutputs(rules);
}

function applyLayers() {
  if (!current) return;
  for (const name of LAYERS) {
    const box = document.getElementById('layer-' + name);
    const group = current.layers[name];
    if (group && box) group.visible = box.checked;
  }
}

function renderStats(stats, notes) {
  statsEl.innerHTML = Object.entries(stats)
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  notesEl.innerHTML = notes.map(n => `<li>${n}</li>`).join('');
  notesGroup.hidden = notes.length === 0;
}

// ---- render styles and camera presets --------------------------------------
// One material override draws the whole plan in a single style, so the same
// geometry can read as a rendered model, a clay study, a wireframe or a plan
// drawing without rebuilding a single mesh.
const CLAY = new THREE.MeshLambertMaterial({ color: 0xded9cd, side: THREE.DoubleSide });
const WIRE = new THREE.MeshBasicMaterial({ color: 0x9fe0c0, wireframe: true });
const BLUE = new THREE.MeshBasicMaterial({ color: 0x1f4f82, side: THREE.DoubleSide });
const INK = new THREE.MeshBasicMaterial({ color: 0x242422, side: THREE.DoubleSide });
const SKY = new THREE.Color(0xb8cce0);

let renderMode = 'solid';
let viewName = 'fit';
let skyFog = null;

// Directions are normalised from the plan centre; `d` is the distance as a
// multiple of the plan's longest side.
const VIEW_DIRS = {
  iso:    { dir: [1, 1, 1], d: 1.15 },
  top:    { dir: [0.0001, 1, 0.0001], d: 1.05 },
  aerial: { dir: [0.6, 1.3, 0.85], d: 1.2 },
  street: { dir: [1, 0.18, 0.6], d: 0.85 },
};

function applyRender(mode) {
  renderMode = mode;
  if (!ctx) return;
  const scene = ctx.scene;
  if (!skyFog) skyFog = scene.fog;
  scene.overrideMaterial = null;
  scene.fog = skyFog;
  scene.background = SKY;
  viewMenu?.setRender(mode);
  if (mode === 'clay') {
    scene.overrideMaterial = CLAY;
  } else if (mode === 'wire') {
    scene.overrideMaterial = WIRE;
    scene.background = new THREE.Color(0x0d1214);
    scene.fog = null;
  } else if (mode === 'blueprint') {
    scene.overrideMaterial = BLUE;
    scene.background = new THREE.Color(0xf5f7f9);
    scene.fog = null;
  } else if (mode === 'ink') {
    scene.overrideMaterial = INK;
    scene.background = new THREE.Color(0xffffff);
    scene.fog = null;
  }
}

function setView(name) {
  viewName = name;
  viewMenu?.setView(name);
  if (!ctx || !current) return;
  if (name === 'fit') { frameCamera(current.group); return; }
  const def = VIEW_DIRS[name];
  if (!def) return;

  const box = new THREE.Box3().setFromObject(current.group);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 120;
  const dir = new THREE.Vector3(...def.dir).normalize();
  const dist = maxDim * def.d * 1.25;

  ctx.controls.target.set(center.x, 0, center.z);
  ctx.camera.position.set(
    center.x + dir.x * dist,
    Math.max(2, dir.y * dist),
    center.z + dir.z * dist,
  );
  ctx.camera.lookAt(center.x, 0, center.z);
  ctx.controls.update();
}

function frameCamera(group) {
  const bbox = new THREE.Box3().setFromObject(group);
  if (bbox.isEmpty()) return;
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 120;
  ctx.camera.position.set(center.x, maxDim * 0.85, center.z + maxDim * 0.75);
  ctx.controls.target.set(center.x, 0, center.z);
  ctx.controls.update();

  // Re-fit the sun's shadow frustum: the default one is city-sized, which makes
  // a park this small cast no usable shadow.
  const sun = ctx.scene.children.find(o => o.isDirectionalLight && o.castShadow);
  if (sun) {
    const d = Math.max(maxDim * 0.75, 12);
    sun.position.set(center.x + maxDim * 0.6, maxDim * 1.4, center.z + maxDim * 0.5);
    sun.target.position.set(center.x, 0, center.z);
    sun.target.updateMatrixWorld();
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = maxDim * 4 + 200;
    sun.shadow.camera.updateProjectionMatrix();
  }
}

async function generate() {
  if (running) { pending = true; return; }
  running = true;
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  overlay.textContent = 'Laying out the park…';
  await tick();

  const rules = readRules();
  const started = performance.now();
  const notes = [];

  try {
    const area = drawnPolygon || makeArea(rules);
    const village = rules.pattern === 'village';
    const facilityKinds = (village ? VILLAGE_FACILITY_KINDS : FACILITY_KINDS).filter(k => {
      const el = document.getElementById((village ? 'vfac-' : 'fac-') + k);
      return !el || el.checked;
    });

    const layout = layoutPark(area, rules, { facilityKinds });
    notes.push(...layout.notes);
    if (edited) {
      // Regenerate re-lays from the rules, so anything dragged by hand is gone.
      // Saying so is better than letting it disappear silently.
      notes.push('Hand edits were discarded — the plan was re-laid from the rules.');
    }

    currentLayout = layout;
    currentRules = rules;
    edited = false;
    renderLayout(layout, rules);
    frameCamera(current.group);
    // Keep whatever the viewer chose across a regenerate.
    if (viewName !== 'fit') setView(viewName);

    const s = layout.stats;
    const isVillage = layout.kind === 'village';
    renderStats({
      Area: `${s.areaM2.toLocaleString()} m²`,
      Usable: `${s.usableM2.toLocaleString()} m²`,
      [isVillage ? 'Cottages' : 'Sites']: s.pitches,
      ...(isVillage ? { Clusters: s.clusters } : { Occupied: s.occupied }),
      Footpaths: s.paths,
      Facilities: s.facilities,
      [isVillage ? 'Street runs' : 'Aisles']: s.aisleCount,
      'Garden beds': `${s.gardenM2.toLocaleString()} m²`,
      Roads: `${s.roadM2.toLocaleString()} m²`,
      Parking: `${s.parkingSpaces.toLocaleString()} spaces · ${s.parkingM2} m²`,
      Power: `${s.solarKwh.toLocaleString()} kWh/day`,
      'Solar array': `${s.solarKwp} kWp · ${s.solarM2} m² · ${s.solarPanels} panels`,
      'Solar coverage': `${s.solarCoverage}% of demand`,
      Pattern: layout.pattern,
      Utilisation: `${s.utilisation}% of usable`,
      Generation: `${Math.round(performance.now() - started)} ms`,
    }, notes);

    window.__parkState = { rules, area, layout };
    if (editor) editor.refresh();
    drawHint.textContent = drawnPolygon ? 'Area: traced boundary · Clear to go back to the sliders' : 'Area: from the width / depth sliders';

    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
  } catch (err) {
    overlay.textContent = 'Error: ' + err.message;
    console.error(err);
  } finally {
    running = false;
    if (pending) { pending = false; schedule(0); }
  }
}

function schedule(delay = 240) {
  clearTimeout(timer);
  timer = setTimeout(generate, delay);
}

// ---- rendering from the document -------------------------------------------
// `generate()` lays a plan out from the rules; `renderLayout()` only draws.
// Splitting them is what lets a drag re-render without re-laying the whole
// park (4 ms of layout on every frame would be survivable but pointless), and
// it is also what stops an edit from re-framing the camera mid-drag.

function renderLayout(layout, rules) {
  if (current) {
    ctx.scene.remove(current.group);
    current.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  current = buildParkMesh(ctx.scene, layout, rules);
  applyLayers();
  applyRender(renderMode);
  updateGrid(layout);
}

// ---- ground grid -----------------------------------------------------------
// A drafting grid: 1 m minor lines, 10 m major, covering the site plus a metre
// of margin. It sits above the lawn decal (4 cm) and below the beds (10 cm), so
// it reads across open ground while every drawn surface — road, pad, path,
// building — still covers it. A grid that floated over the roads would make the
// plan harder to read, not easier.
//
// It lives in the overlay scene, which keeps its colour under clay and wireframe.
const GRID_Y = 0.075;
let grid = null;
let gridKey = '';
let gridOn = true;

function buildGrid(x0, x1, y0, y1) {
  const minor = [], major = [];
  const push = (list, ax, ay, bx, by) => list.push(ax * 0.01, GRID_Y, ay * 0.01, bx * 0.01, GRID_Y, by * 0.01);
  for (let x = x0; x <= x1; x += 100) {
    const list = x % 1000 === 0 ? major : minor;
    push(list, x, y0, x, y1);
  }
  for (let y = y0; y <= y1; y += 100) {
    const list = y % 1000 === 0 ? major : minor;
    push(list, x0, y, x1, y);
  }

  const lineMesh = (coords, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
    const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x9fe0c0, transparent: true, opacity, depthWrite: false,
    }));
    m.renderOrder = 2;
    m.frustumCulled = false;
    return m;
  };

  const group = new THREE.Group();
  group.name = 'grid';
  group.add(lineMesh(minor, 0.1), lineMesh(major, 0.24));
  return group;
}

function updateGrid(layout) {
  if (!ctx || !layout || !layout.area) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of layout.area) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  // Snap outwards to whole 10 m lines so the grid holds still while the
  // boundary is dragged, instead of shimmering on every frame.
  x0 = Math.floor((x0 - 1000) / 1000) * 1000;
  y0 = Math.floor((y0 - 1000) / 1000) * 1000;
  x1 = Math.ceil((x1 + 1000) / 1000) * 1000;
  y1 = Math.ceil((y1 + 1000) / 1000) * 1000;

  const key = `${x0}:${x1}:${y0}:${y1}`;
  if (key === gridKey && grid) { grid.visible = gridOn; return; }
  gridKey = key;

  if (grid) {
    ctx.overlay.remove(grid);
    grid.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  grid = buildGrid(x0, x1, y0, y1);
  grid.visible = gridOn;
  ctx.overlay.add(grid);
}

// Called by the editor after every committed change: re-draw from the layout as
// it now stands, never re-lay it.
function rebuild() {
  if (!currentLayout) return;
  renderLayout(currentLayout, currentRules);
  edited = true;
  if (editor) editor.refresh();
}

// The angle of the boundary's longest edge, so a new building lands square to
// the site rather than to the page.
function areaAngle() {
  const ring = drawnPolygon || (currentLayout && currentLayout.area);
  if (!ring || ring.length < 2) return 0;
  let best = 0, bestLen = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > bestLen) { bestLen = l; best = Math.atan2(b.y - a.y, b.x - a.x); }
  }
  return best;
}

function syncShapeChips() {
  document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', b.dataset.shape === shape));
}

function tick() { return new Promise(r => setTimeout(r, 0)); }

// ---- area drawing ----------------------------------------------------------

function pointerToGround(e) {
  const rect = ctx.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, ctx.camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  return { x: hit.x / 0.01, y: hit.z / 0.01 };
}

function refreshDrawPreview() {
  if (!drawPts) return;
  if (!drawLine) {
    drawLine = new THREE.Line(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x9fe0c0 }));
    ctx.scene.add(drawLine);
  }
  if (!drawTicks) {
    drawTicks = new THREE.Points(new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0x9fe0c0, size: 7, sizeAttenuation: false }));
    ctx.scene.add(drawTicks);
  }
  const pts = drawPts.concat(hoverPt && drawPts.length ? [hoverPt] : []);
  const vecs = pts.map(p => new THREE.Vector3(p.x * 0.01, 0.4, p.y * 0.01));
  drawLine.geometry.dispose();
  drawLine.geometry = new THREE.BufferGeometry().setFromPoints(vecs);
  drawTicks.geometry.dispose();
  drawTicks.geometry = new THREE.BufferGeometry().setFromPoints(
    drawPts.map(p => new THREE.Vector3(p.x * 0.01, 0.4, p.y * 0.01)));
}

function startDraw() {
  cancelDraw();
  drawPts = [];
  shape = 'custom';
  document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', b.dataset.shape === 'custom'));
  ctx.controls.enabled = false;
  drawHint.textContent = 'Click corners on the ground · Enter or double-click closes · Esc cancels';
  refreshDrawPreview();
}

function cancelDraw() {
  drawPts = null;
  hoverPt = null;
  if (drawLine) { ctx.scene.remove(drawLine); drawLine.geometry.dispose(); drawLine = null; }
  if (drawTicks) { ctx.scene.remove(drawTicks); drawTicks.geometry.dispose(); drawTicks = null; }
  if (ctx) ctx.controls.enabled = true;
}

function closeDraw() {
  if (!drawPts) return;
  if (drawPts.length < 3) {
    drawHint.textContent = 'A boundary needs at least three corners.';
    return;
  }
  const ring = cleanPolygon(drawPts, 100);
  if (ring.length < 3 || !polySimple(ring)) {
    drawHint.textContent = 'That boundary crosses itself — undo a corner or press Esc and trace again.';
    return;
  }
  if (polyArea(ring) * 1e-4 < 800) {
    drawHint.textContent = 'That area is under 800 m² — trace a larger boundary.';
    return;
  }
  drawnPolygon = ring;
  cancelDraw();
  schedule(0);
}

// ---- panel wiring ----------------------------------------------------------

for (const el of ruleEls()) {
  el.addEventListener('input', () => {
    syncOutputs(readRules());
    schedule(300);
  });
  el.addEventListener('change', () => {
    syncOutputs(readRules());
    schedule(0);
  });
}

for (const key of ['areaWidth', 'areaDepth', 'areaRotation']) {
  const el = document.getElementById(key);
  if (el) el.addEventListener('input', () => {
    if (drawnPolygon) {
      drawnPolygon = null;
      if (shape === 'custom') {
        shape = 'rect';
        document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', b.dataset.shape === 'rect'));
      }
    }
  });
}

document.getElementById('btnGen').addEventListener('click', () => schedule(0));

document.getElementById('shuffle').addEventListener('click', () => {
  const seed = 1 + Math.floor(Math.random() * 99999);
  document.getElementById('seed').value = seed;
  writeRules(readRules());
  schedule(0);
});

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = PARK_PRESETS[btn.dataset.preset];
    if (!preset) return;
    const next = clampParkRules({ ...readRules(), ...preset.rules });
    writeRules(next);
    pattern = next.pattern;
    syncPatternChips();
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('on', b === btn));
    schedule(0);
  });
});

document.querySelectorAll('[data-shape]').forEach(btn => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.shape;
    if (next === 'custom') { startDraw(); return; }
    shape = next;
    drawnPolygon = null;
    document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', b === btn));
    schedule(0);
  });
});

function syncPatternChips() {
  document.querySelectorAll('[data-pattern]').forEach(b => b.classList.toggle('on', b.dataset.pattern === pattern));
}

document.querySelectorAll('[data-pattern]').forEach(btn => {
  btn.addEventListener('click', () => {
    pattern = btn.dataset.pattern;
    syncPatternChips();
    schedule(0);
  });
});

document.getElementById('btnDraw').addEventListener('click', startDraw);
document.getElementById('btnClearArea').addEventListener('click', () => {
  cancelDraw();
  drawnPolygon = null;
  shape = 'rect';
  document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('on', b.dataset.shape === 'rect'));
  schedule(0);
});

for (const name of LAYERS) {
  const box = document.getElementById('layer-' + name);
  if (!box) continue;
  box.addEventListener('change', applyLayers);
}

// View and render live in one hover dropdown in the top-right instead of two
// selects, so the bar stays out of the map's way until it is wanted.
const viewMenu = createViewMenu({
  onRender: mode => applyRender(mode),
  onView: name => { if (name === 'fit') frameCamera(current.group); else setView(name); },
  onGrid: on => { gridOn = on; if (grid) grid.visible = on; },
});
viewMenu.setRender(renderMode);
viewMenu.setView(viewName);

document.getElementById('panelToggle').addEventListener('click', () => {
  document.body.classList.toggle('panel-collapsed');
});

ctx = createScene(document.body);
const canvas = ctx.renderer.domElement;

// ---- the editing rail ------------------------------------------------------
// The rail is a separate module that owns no scene state: it reports tool
// presses here and renders whatever selection it is handed. Every callback
// below is the whole coupling between the editor and this page.
const rail = createRail({
  onTool: name => editor?.setTool(name),
  onAction: (name, arg) => editor?.action(name, arg),
});

editor = createEditor({
  // The handles live in the overlay scene: the main scene's overrideMaterial
  // (clay, wireframe, blueprint) would otherwise repaint every dot and dash.
  scene: ctx.overlay,
  camera: ctx.camera,
  controls: ctx.controls,
  canvas,
  rail,
  getLayout: () => currentLayout,
  getRules: () => currentRules || readRules(),
  getPicks: () => current && current.picks,
  rebuild,
  regenerate: () => schedule(0),
  suggestAngle: areaAngle,
  // A traced boundary is a real polygon once the editor moves a corner, so the
  // rail has to be able to promote the parametric shape to a drawn one.
  area: {
    get: () => ({ ring: drawnPolygon || (currentLayout && currentLayout.area), drawn: !!drawnPolygon }),
    set: (ring, drawn) => {
      drawnPolygon = drawn ? ring : null;
      if (drawn) { shape = 'custom'; syncShapeChips(); }
    },
  },
  isBlocked: () => !!drawPts,
  onStatus: text => { if (text) drawHint.textContent = text; },
  onClaim: () => hideCard(),
});

canvas.addEventListener('pointerdown', e => {
  if (!drawPts || e.button !== 0) return;
  const p = pointerToGround(e);
  if (!p) return;
  drawPts.push(p);
  refreshDrawPreview();
});

canvas.addEventListener('pointermove', e => {
  if (!drawPts) return;
  hoverPt = pointerToGround(e);
  refreshDrawPreview();
});

canvas.addEventListener('dblclick', () => {
  if (drawPts) closeDraw();
});

// ---- hover card ------------------------------------------------------------
// The scene carries an invisible pick layer that names every object on the plan,
// so hovering a site, a building, a bed, a road or a car park explains itself
// without leaving the map.
const hoverRay = new THREE.Raycaster();
const hoverNdc = new THREE.Vector2();
let hoverAt = null;
let hoverQueued = false;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function hideCard() {
  if (hovercard) hovercard.hidden = true;
  canvas.style.cursor = '';
}

function showCard(info, x, y) {
  if (!hovercard || !info) { hideCard(); return; }
  hovercard.innerHTML =
    `<div class="hc-top"><b>${esc(info.title)}</b>` +
    (info.tag ? `<span>${esc(info.tag)}</span>` : '') + '</div>' +
    (info.rows || []).map(([k, v]) => `<div class="hc-row"><span>${esc(k)}</span><em>${esc(v)}</em></div>`).join('');
  hovercard.hidden = false;
  const w = hovercard.offsetWidth, h = hovercard.offsetHeight;
  hovercard.style.left = Math.max(8, Math.min(window.innerWidth - w - 10, x + 16)) + 'px';
  hovercard.style.top = Math.max(8, Math.min(window.innerHeight - h - 10, y + 16)) + 'px';
}

function pickAt(x, y) {
  if (!current || !current.picks || !ctx) return null;
  const rect = canvas.getBoundingClientRect();
  hoverNdc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  hoverRay.setFromCamera(hoverNdc, ctx.camera);
  const hit = hoverRay.intersectObjects(current.picks.children, false)[0];
  return hit && hit.object.userData ? hit.object.userData.info || null : null;
}

canvas.addEventListener('pointermove', e => {
  if (drawPts) { hideCard(); return; }
  // The inspector now says everything the hover card said, and two popups
  // fighting over the pointer during a drag is noise.
  if (editor && editor.isEditing()) { hideCard(); return; }
  hoverAt = { x: e.clientX, y: e.clientY };
  if (hoverQueued) return;
  hoverQueued = true;
  requestAnimationFrame(() => {
    hoverQueued = false;
    if (!hoverAt || drawPts) return;
    const info = pickAt(hoverAt.x, hoverAt.y);
    if (!info) { hideCard(); return; }
    canvas.style.cursor = 'help';
    showCard(info, hoverAt.x, hoverAt.y);
  });
});

canvas.addEventListener('pointerleave', () => { hoverAt = null; hideCard(); });
canvas.addEventListener('pointerdown', hideCard);

window.addEventListener('keydown', e => {
  if (!drawPts) return;
  if (e.key === 'Enter') { e.preventDefault(); closeDraw(); }
  if (e.key === 'Escape') { cancelDraw(); drawHint.textContent = 'Drawing cancelled.'; }
});

window.regenerate = generate;
window.startDraw = startDraw;
window.__editor = () => editor;
window.__editItems = () => indexLayout(currentLayout);
window.__parkView = () => ctx;
window.setLayer = (name, on) => {
  const box = document.getElementById('layer-' + name);
  if (box) box.checked = on;
  applyLayers();
};

syncOutputs(readRules());
syncPatternChips();
drawHint.textContent = 'Area: from the width / depth sliders';
generate();
