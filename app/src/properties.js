// The property record set is the site's single source of truth for land.
// research/holons-parcel-atlas.html renders the same records, and the
// "is this a real project" toggle is kept as an overlay in one storage key so
// the atlas, the property page and the plan tool all read the same answer.
const DATA_URL = new URL('../data/properties.json', import.meta.url);
const OVERLAY_KEY = 'holons-properties-v1';

let records = null;
let byId = new Map();
let loading = null;
const listeners = new Set();

function readOverlay() {
  try {
    return JSON.parse(localStorage.getItem(OVERLAY_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeOverlay(overlay) {
  try {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay));
  } catch { /* storage is optional */ }
}

function merge(list, overlay) {
  return list.map((p) => {
    const o = overlay[p.id] || {};
    return { ...p, active: !!o.active, projectId: o.projectId || null };
  });
}

function emit() {
  const snapshot = getProperties();
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch { /* a listener must not break the store */ }
  });
}

export function loadProperties() {
  if (loading) return loading;
  loading = fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`properties ${res.status}`);
      return res.json();
    })
    .then((data) => {
      records = merge(data.properties || [], readOverlay());
      byId = new Map(records.map((p) => [p.id, p]));
      return records;
    })
    .catch(() => {
      records = [];
      return records;
    });
  return loading;
}

export function getProperties() {
  return records || [];
}

export function getProperty(id) {
  return byId.get(Number(id)) || byId.get(id) || null;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply(id, patch) {
  const key = String(id);
  const overlay = readOverlay();
  overlay[key] = { ...(overlay[key] || {}), ...patch };
  writeOverlay(overlay);
  if (records) {
    records = records.map((p) => (String(p.id) === key ? { ...p, ...patch } : p));
    byId = new Map(records.map((p) => [p.id, p]));
  }
  emit();
}

export function setActive(id, active) {
  apply(id, { active: !!active, projectId: active ? `property-${id}` : null });
}

export function toggleActive(id) {
  const p = getProperty(id);
  setActive(id, !(p && p.active));
  return getProperty(id);
}

export function isActive(id) {
  const p = getProperty(id);
  return !!(p && p.active);
}

export function propertyPath(id) {
  return `#/property/${encodeURIComponent(id)}`;
}

// The plan tool reads these from the deep-link query.
export function planPathFor(id) {
  return `#/projects/lithium-city/plan?property=${encodeURIComponent(id)}`;
}

export function atlasPathFor(id) {
  return `research/holons-parcel-atlas.html?property=${encodeURIComponent(id)}`;
}

export function propertyProjectId(id) {
  const p = getProperty(id);
  return p && p.active ? p.projectId : null;
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e) => {
    if (e.key !== OVERLAY_KEY || !records) return;
    records = merge(records, readOverlay());
    byId = new Map(records.map((p) => [p.id, p]));
    emit();
  });
}
