// editController.js — pointer, keys and drags: the part that turns a click into
// an edit.
//
// Three rules keep this honest:
//   · every edit is applied to the source polygon in the layout, then the plan
//     is re-rendered from it — nothing is dragged as a mesh;
//   · a drag is replayed from a snapshot taken on pointerdown rather than
//     accumulated, so mouse jitter cannot drift a site off the grid;
//   · the camera belongs to OrbitControls unless a handle is actually grabbed,
//     so orbiting still works everywhere it did before.
//
// That last point is why the listeners live on `window` in the capture phase:
// OrbitControls binds `pointerdown` to the canvas first, so a normal listener
// would lose the race and the camera would spin while you dragged a corner.

import * as THREE from 'three';
import * as Doc from './editDoc.js?v=park-30';
import { createHandles, nearestVertex, nearestEdge } from './editHandles.js';
import { polySimple, polyArea, cleanPolygon } from './utils.js';

const S = 0.01;
const MIN_AREA_M2 = 800;
const DRAG_PX = 3;

export function createEditor(opts) {
  const { scene, camera, controls, canvas, rail } = opts;
  const handles = createHandles(scene);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  let tool = 'select';
  let selection = null;
  let entries = [];
  let byRef = new Map();
  let drag = null;
  let pending = null;
  let preview = null;
  let undoStack = [];
  let redoStack = [];

  const layout = () => opts.getLayout() || {};
  const rules = () => opts.getRules?.() || {};
  const blocked = () => !!opts.isBlocked?.();

  // ---- coordinates ---------------------------------------------------------

  function groundAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x / S, y: hit.z / S };
  }

  function snapped(p, e) {
    if (!p) return p;
    if (e && e.altKey) return p;
    return Doc.snapTo(p, e && e.shiftKey ? 10 : 100);
  }

  function pickEntry(clientX, clientY) {
    const picks = opts.getPicks?.();
    if (!picks) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(picks.children, false)[0];
    const ref = h && h.object.userData ? h.object.userData.ref : null;
    return ref ? byRef.get(ref) || null : null;
  }

  // ---- selection and handles ----------------------------------------------

  function refresh() {
    entries = Doc.index(layout());
    byRef = new Map(entries.map(e => [e.ref, e]));
    // A full-document restore (undo) rebuilds every object, so the old ref is
    // gone. Fall back to the id — bucket plus position — which survives it, so
    // undoing a change does not also throw away what you had selected.
    if (selection) {
      selection = byRef.get(selection.ref) || entries.find(e => e.id === selection.id) || null;
    }
    if (!selection) rail?.setSelection(null);
    else rail?.setSelection(selection);
    drawHandles();
  }

  function drawHandles() {
    if (tool === 'boundary') {
      const ring = opts.area?.get?.().ring;
      if (ring) handles.show(ring, { vertices: true });
      return;
    }
    if (!selection) { handles.hide(); return; }
    handles.show(selection.points, {
      vertices: tool === 'vertex',
      edges: tool === 'edge',
    });
  }

  function select(entry) {
    selection = entry || null;
    rail?.setSelection(selection);
    drawHandles();
  }

  // ---- history -------------------------------------------------------------

  function captureState() {
    const area = opts.area?.get?.() || {};
    return {
      layout: Doc.snapshot(layout()),
      area: {
        ring: (area.ring || []).map(p => ({ x: p.x, y: p.y })),
        drawn: !!area.drawn,
      },
      regen: false,
    };
  }

  function applyState(state) {
    Doc.restore(layout(), state.layout);
    opts.area?.set?.(state.area.ring, state.area.drawn);
    if (state.regen) opts.regenerate?.();
    else opts.rebuild?.();
    refresh();
  }

  function pushHistory(state) {
    if (!state) return;
    undoStack.push(state);
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
    rail?.setHistory(undoStack.length > 0, false);
  }

  function undo() {
    if (!undoStack.length) return;
    const state = undoStack.pop();
    redoStack.push(captureState());
    applyState(state);
    rail?.setHistory(undoStack.length > 0, true);
    opts.onStatus?.('Undone.');
  }

  function redo() {
    if (!redoStack.length) return;
    const state = redoStack.pop();
    undoStack.push(captureState());
    applyState(state);
    rail?.setHistory(true, redoStack.length > 0);
    opts.onStatus?.('Redone.');
  }

  // ---- tools ---------------------------------------------------------------

  function setTool(next) {
    if (drag) return;
    tool = next;
    pending = null;
    hidePreview();
    rail?.setTool(tool);
    opts.onStatus?.(rail?.hint(tool) || '');
    canvas.style.cursor = tool.startsWith('add-') ? 'crosshair' : '';
    if (tool.startsWith('add-')) select(null);
    drawHandles();
  }

  // ---- add tools -----------------------------------------------------------

  function placeAt(p) {
    const rulesNow = rules();
    const angle = opts.suggestAngle?.() || 0;
    const before = captureState();
    let ref = null;
    if (tool === 'add-building') ref = Doc.addBuilding(layout(), { x: p.x, y: p.y, angle });
    else if (tool === 'add-site') ref = Doc.addSite(layout(), rulesNow, { x: p.x, y: p.y, angle });
    else if (tool === 'add-bed') ref = Doc.addBed(layout(), { x: p.x, y: p.y, angle });
    if (!ref) return;
    opts.rebuild?.();
    refresh();
    const entry = byRef.get(ref);
    if (entry) select(entry);
    pushHistory(before);
    opts.onStatus?.(`${entry ? entry.label : 'Object'} added.`);
  }

  function commitBand(b) {
    const before = captureState();
    const rulesNow = rules();
    const isPath = tool === 'add-path';
    const width = isPath ? (rulesNow.pathWidth || 150) : (rulesNow.aisleWidth || 700);
    const ref = Doc.addBand(layout(), isPath ? 'paths' : 'roads', isPath ? 'path' : 'aisle', pending, b, width);
    pending = null;
    hidePreview();
    if (!ref) { opts.onStatus?.('That run is too short.'); return; }
    opts.rebuild?.();
    refresh();
    pushHistory(before);
    opts.onStatus?.(isPath ? 'Footpath drawn.' : 'Road drawn.');
  }

  // ---- preview -------------------------------------------------------------

  function showPreview(a, b) {
    if (!preview) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(),
      ]);
      preview = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffd479, depthTest: false, transparent: true, opacity: 0.9,
      }));
      preview.renderOrder = 999;
      scene.add(preview);
    }
    const A = new THREE.Vector3(a.x * S, 0.6, a.y * S);
    const B = new THREE.Vector3(b.x * S, 0.6, b.y * S);
    preview.geometry.setFromPoints([A, B]);
    preview.geometry.attributes.position.needsUpdate = true;
  }

  function hidePreview() {
    if (!preview) return;
    scene.remove(preview);
    preview.geometry.dispose();
    preview.material.dispose();
    preview = null;
  }

  // ---- pointer -------------------------------------------------------------

  function onDown(e) {
    if (blocked() || e.button !== 0 || e.target !== canvas) return;

    const p = groundAt(e.clientX, e.clientY);
    if (!p) return;

    // Boundary corners are the area ring, not a layout bucket.
    if (tool === 'boundary') {
      const area = opts.area?.get?.();
      if (!area || !area.ring) return;
      const corner = nearestVertex(area.ring, e.clientX, e.clientY, camera, canvas, 14);
      if (!corner) return;
      claim(e);
      const live = area.ring.map(q => ({ x: q.x, y: q.y }));
      drag = {
        kind: 'boundary', index: corner.i, base: live, moved: false,
        startX: e.clientX, startY: e.clientY, before: captureState(),
      };
      opts.onStatus?.('Release to re-lay the plan on the new boundary.');
      return;
    }

    if (tool.startsWith('add-')) {
      claim(e);
      const at = snapped(p, e);
      if (tool === 'add-road' || tool === 'add-path') {
        if (!pending) {
          pending = at;
          opts.onStatus?.('Click the far end of the run.');
          showPreview(at, at);
        } else {
          commitBand(at);
        }
        return;
      }
      placeAt(at);
      return;
    }

    // Sub-object handles first: a corner beats the face it sits on.
    if (selection && (tool === 'vertex' || tool === 'edge')) {
      const pts = selection.points;
      const found = tool === 'vertex'
        ? nearestVertex(pts, e.clientX, e.clientY, camera, canvas, 14)
        : nearestEdge(pts, e.clientX, e.clientY, camera, canvas, 12);
      if (found) {
        if (tool === 'vertex' && !selection.shapeable) {
          opts.onStatus?.('This object is parametric — its corners cannot be moved.');
          return;
        }
        claim(e);
        drag = {
          kind: tool, index: found.i, base: Doc.snapshotRef(selection),
          start: snapped(p, e), moved: false,
          startX: e.clientX, startY: e.clientY, before: captureState(),
        };
        return;
      }
    }

    const entry = pickEntry(e.clientX, e.clientY);
    if (!entry) {
      if (tool === 'select') select(null);
      return;
    }

    select(entry);
    if (tool === 'rotate') {
      claim(e);
      drag = {
        kind: 'rotate', base: Doc.snapshotRef(entry),
        pivot: Doc.centroid(entry.points), startAngle: angleAt(entry.points, p),
        moved: false, startX: e.clientX, startY: e.clientY, before: captureState(),
      };
      return;
    }
    if (tool === 'select') {
      claim(e);
      drag = {
        kind: 'move', base: Doc.snapshotRef(entry),
        // Both ends of the delta are snapped, so a dragged object travels in
        // whole grid steps instead of inheriting the pointer's sub-grid offset.
        start: snapped(p, e), moved: false,
        startX: e.clientX, startY: e.clientY, before: captureState(),
      };
    }
  }

  function angleAt(points, p) {
    const c = Doc.centroid(points);
    return Math.atan2(p.y - c.y, p.x - c.x);
  }

  function claim(e) {
    e.stopPropagation();
    if (controls) controls.enabled = false;
    opts.onClaim?.();
    try { canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* not all pointers capture */ }
  }

  function onMove(e) {
    if (pending && preview) {
      const p = snapped(groundAt(e.clientX, e.clientY), e);
      if (p) showPreview(pending, p);
      return;
    }
    if (!drag) {
      if (selection && (tool === 'vertex' || tool === 'edge')) {
        canvas.style.cursor = 'pointer';
      }
      return;
    }

    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_PX) drag.moved = true;
    if (!drag.moved) return;
    e.stopPropagation();

    const p = groundAt(e.clientX, e.clientY);
    if (!p) return;

    if (drag.kind === 'boundary') {
      const q = snapped(p, e);
      drag.base[drag.index] = { x: q.x, y: q.y };
      handles.show(drag.base, { vertices: true });
      return;
    }

    if (drag.kind === 'move') {
      const q = snapped(p, e);
      Doc.restoreRef(selection, drag.base);
      Doc.translate(selection, q.x - drag.start.x, q.y - drag.start.y);
    } else if (drag.kind === 'vertex') {
      Doc.restoreRef(selection, drag.base);
      Doc.moveVertex(selection, drag.index, snapped(p, e), rules());
    } else if (drag.kind === 'edge') {
      const q = snapped(p, e);
      Doc.restoreRef(selection, drag.base);
      Doc.moveEdge(selection, drag.index, q.x - drag.start.x, q.y - drag.start.y, rules());
    } else if (drag.kind === 'rotate') {
      const angle = angleAt(selection.points, p);
      let delta = angle - drag.startAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const step = (e.shiftKey ? 1 : 15) * Math.PI / 180;
      if (!e.altKey) delta = Math.round(delta / step) * step;
      Doc.restoreRef(selection, drag.base);
      Doc.rotate(selection, delta);
    }

    scheduleRebuild();
  }

  let rebuildQueued = false;
  function scheduleRebuild() {
    if (rebuildQueued) return;
    rebuildQueued = true;
    requestAnimationFrame(() => {
      rebuildQueued = false;
      opts.rebuild?.();
      if (selection) rail?.setSelection(selection);
      drawHandles();
    });
  }

  function onUp(e) {
    if (!drag && !pending) return;
    if (!drag) return;
    const d = drag;
    drag = null;
    if (controls && !blocked()) controls.enabled = true;

    if (d.kind === 'boundary') {
      if (!d.moved) { drawHandles(); return; }
      const ring = cleanPolygon(d.base, 100);
      if (ring.length < 3 || !polySimple(ring)) {
        opts.onStatus?.('That boundary crosses itself — leaving the plan as it was.');
        drawHandles();
        return;
      }
      if (Math.abs(polyArea(ring)) * 1e-4 < MIN_AREA_M2) {
        opts.onStatus?.('A boundary under 800 m² is too small — leaving the plan as it was.');
        drawHandles();
        return;
      }
      const before = d.before;
      before.regen = true;
      opts.area?.set?.(ring, true);
      opts.regenerate?.();
      pushHistory(before);
      select(null);
      opts.onStatus?.('Boundary moved — the plan was re-laid inside it.');
      return;
    }

    if (!d.moved) { refresh(); return; }
    pushHistory(d.before);
    opts.rebuild?.();
    if (selection) rail?.setSelection(selection);
    drawHandles();
    opts.onStatus?.(`${selection ? selection.label : 'Object'} updated.`);
  }

  // ---- actions -------------------------------------------------------------

  function deleteSelection() {
    if (!selection) { opts.onStatus?.('Nothing selected.'); return; }
    const before = captureState();
    const label = selection.label;
    if (!Doc.remove(layout(), selection)) return;
    select(null);
    opts.rebuild?.();
    refresh();
    pushHistory(before);
    opts.onStatus?.(`${label} deleted.`);
  }

  function duplicateSelection() {
    if (!selection) { opts.onStatus?.('Nothing selected.'); return; }
    const before = captureState();
    const ref = Doc.duplicate(layout(), selection);
    if (!ref) return;
    opts.rebuild?.();
    refresh();
    const entry = byRef.get(ref);
    if (entry) select(entry);
    pushHistory(before);
    opts.onStatus?.('Duplicated.');
  }

  function rotateSelection(delta) {
    if (!selection || !delta) return;
    const before = captureState();
    Doc.rotate(selection, delta);
    opts.rebuild?.();
    refresh();
    pushHistory(before);
  }

  // Swap what stands on a site. Nothing about the site itself moves — the
  // dwelling is a property of the pitch, so the plan re-renders from the same
  // polygon and the choice survives undo like any other edit.
  function setDwelling(id) {
    if (!selection || selection.bucket !== 'pitches') return;
    const before = captureState();
    const ref = selection.ref;
    if (!id) {
      ref.occupied = false;
      delete ref.dwelling;
    } else {
      ref.dwelling = id;
      ref.occupied = true;
    }
    opts.rebuild?.();
    refresh();
    pushHistory(before);
    opts.onStatus?.(id ? `${selection.label} now holds a ${id}.` : `${selection.label} emptied.`);
  }

  function action(name, arg) {
    if (name === 'delete') deleteSelection();
    else if (name === 'duplicate') duplicateSelection();
    else if (name === 'undo') undo();
    else if (name === 'redo') redo();
    else if (name === 'rotate') rotateSelection(arg);
    else if (name === 'dwelling') setDwelling(arg);
  }

  function onKey(e) {
    const t = e.target;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (blocked()) return;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelection();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!selection) return;
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (e.key === 'Escape') {
      pending = null;
      hidePreview();
      select(null);
      return;
    }
    const map = { v: 'select', 1: 'vertex', 2: 'edge', r: 'rotate', b: 'boundary' };
    const next = map[e.key.toLowerCase()];
    if (next && !mod) setTool(next);
  }

  // ---- wiring --------------------------------------------------------------

  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('keydown', onKey);

  rail?.setTool(tool);
  rail?.setHistory(false, false);
  rail?.setSelection(null);
  refresh();

  return {
    get tool() { return tool; },
    get selection() { return selection; },
    setTool, refresh, undo, redo, action,
    isEditing: () => !!selection || tool !== 'select' || !!drag,
    dispose() {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey);
      handles.hide();
      hidePreview();
    },
  };
}
