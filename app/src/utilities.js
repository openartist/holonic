// Utility configurations and the service layer they imply.
// Three independent systems, each with a mode, equipment footprints on the
// ground, a trunk alignment that follows the road network, and per-lot stubs.

import * as G from './geom.js';
import { shuffle, range } from './rng.js';

export const POWER = [
  { id: 'grid', label: 'Grid power' },
  { id: 'solar', label: 'Solar + grid tie' },
  { id: 'offgrid', label: 'Off-grid solar + battery' },
  { id: 'generator', label: 'Generator + battery' },
];

export const WATER = [
  { id: 'county', label: 'County water' },
  { id: 'well', label: 'Well + treatment' },
  { id: 'hauled', label: 'Hauled water tanks' },
  { id: 'rain', label: 'Rainwater harvesting' },
];

export const SEWER = [
  { id: 'city', label: 'City sewer' },
  { id: 'septic', label: 'Septic + drain field' },
  { id: 'compost', label: 'Compost toilets + greywater' },
];

export const LABELS = {
  power: Object.fromEntries(POWER.map((o) => [o.id, o.label])),
  water: Object.fromEntries(WATER.map((o) => [o.id, o.label])),
  sewer: Object.fromEntries(SEWER.map((o) => [o.id, o.label])),
};

export const LAYERS = ['power', 'water', 'sewer'];

// Lateral offset of each trunk from the road centreline, in feet.
const OFFSET = { power: -3, water: 2, sewer: 6 };
const LAYER_INDEX = { power: 0, water: 1, sewer: 2 };

const pick = (list, v, dflt) => (list.some((o) => o.id === v) ? v : dflt);

export function readUtilities(input = {}) {
  return {
    power: pick(POWER, input.power, 'grid'),
    water: pick(WATER, input.water, 'county'),
    sewer: pick(SEWER, input.sewer, 'septic'),
  };
}

// ---------------------------------------------------------------------------
function estLots(plan) {
  const area = Math.max(0, plan.inner.w) * Math.max(0, plan.inner.h);
  return Math.max(6, Math.round(area / (plan.siteW * plan.siteD * 2.1)));
}

function acres(plan) {
  return (plan.parcel.w * plan.parcel.h) / 43560;
}

function powerSpecs(mode, lots) {
  if (mode === 'solar') {
    return [
      { kind: 'panel', label: 'Solar array', w: G.clamp(lots * 1.5, 40, 130), h: 30 },
      { kind: 'pad', label: 'Inverters', w: 14, h: 12 },
    ];
  }
  if (mode === 'offgrid') {
    return [
      { kind: 'panel', label: 'Solar array', w: G.clamp(lots * 1.8, 50, 150), h: 32 },
      { kind: 'pad', label: 'Battery bank', w: 20, h: 14 },
      { kind: 'pad', label: 'Generator', w: 16, h: 12 },
    ];
  }
  if (mode === 'generator') {
    return [{ kind: 'pad', label: 'Generator + battery', w: 24, h: 16 }];
  }
  return [{ kind: 'pad', label: 'Transformer', w: 10, h: 10 }];
}

function waterSpecs(mode, lots) {
  if (mode === 'well') return [{ kind: 'pad', label: 'Well & pumphouse', w: 16, h: 14 }];
  if (mode === 'hauled') return [{ kind: 'tank', label: 'Water tanks', w: Math.round(G.clamp(lots * 0.5, 28, 56)), h: 16 }];
  if (mode === 'rain') return [{ kind: 'tank', label: 'Cisterns', w: Math.round(G.clamp(lots * 0.4, 24, 48)), h: 14 }];
  return [{ kind: 'pad', label: 'Water meter', w: 10, h: 8 }];
}

function sewerSpecs(mode, lots, area) {
  if (mode === 'septic') {
    return [
      { kind: 'tank', label: 'Septic tanks', w: 32, h: 12 },
      { kind: 'field', label: 'Drain field', w: Math.round(G.clamp(lots * 1.05, 50, 120)), h: Math.round(G.clamp(lots * 0.55, 30, 60)) },
    ];
  }
  if (mode === 'compost') {
    return [
      { kind: 'pad', label: 'Compost toilets', w: 20, h: 14 },
      { kind: 'field', label: 'Greywater bed', w: Math.round(G.clamp(lots * 0.7, 34, 70)), h: 22 },
    ];
  }
  return area > 12 ? [{ kind: 'pad', label: 'Lift station', w: 14, h: 12 }] : [];
}

// ---- siting ---------------------------------------------------------------
function fits(plan, rect, pad = 5) {
  if (rect.w < 6 || rect.h < 6) return false;
  if (!G.contains(plan.buildable, rect)) return false;
  for (const b of plan.blockedRects) if (G.overlaps(rect, b, pad)) return false;
  for (const s of plan.sites) if (G.overlaps(rect, s, pad)) return false;
  const probes = [
    ...G.rectPoints(rect),
    [rect.x + rect.w / 2, rect.y],
    [rect.x + rect.w, rect.y + rect.h / 2],
    [rect.x + rect.w / 2, rect.y + rect.h],
    [rect.x, rect.y + rect.h / 2],
  ];
  for (const rd of plan.roads) {
    for (const [px, py] of probes) {
      if (G.pointToPolyline(px, py, rd.pts) < rd.w / 2 + 3) return false;
    }
  }
  return true;
}

// Keeps the entry drive, plaza and the ground in front of the core clear.
function inEntryCorridor(plan, rect) {
  const I = plan.inner;
  const corridor = G.R(plan.entry.x - 95, I.y - 10, 190, I.h + 20);
  return G.overlaps(rect, corridor, 2);
}

function candidates(plan, w, h, rng) {
  const I = plan.inner;
  const m = 4;
  // keep the bottom band (community core, plaza and its parking courts) clear
  const limit = I.y + I.h * 0.62;
  const out = [];
  const push = (x, y) => {
    const rect = G.R(Math.round(x), Math.round(y), w, h);
    if (rect.y < I.y + m || rect.x < I.x + m) return;
    if (G.right(rect) > G.right(I) - m || G.bottom(rect) > limit) return;
    out.push(rect);
  };
  const xs = [I.x + m, I.x + (I.w - w) / 2, I.x + I.w - w - m];
  const ys = [I.y + m, I.y + (I.h - h) * 0.32, I.y + I.h - h - m];
  for (const y of ys) for (const x of xs) push(x, y);
  const stepX = Math.max(w * 0.6, 16);
  const stepY = Math.max(h * 0.6, 14);
  for (let y = I.y + m; y + h <= limit; y += stepY) {
    for (let x = I.x + m; x + w <= G.right(I) - m; x += stepX) push(x, y);
  }
  return shuffle(rng, out);
}

function placeSpecs(plan, specs, rng) {
  const placed = [];
  for (const spec of specs) {
    const w = Math.round(spec.w);
    const h = Math.round(spec.h);
    let found = null;
    for (const rect of candidates(plan, w, h, rng)) {
      if (inEntryCorridor(plan, rect)) continue;
      if (!fits(plan, rect, 5)) continue;
      found = { ...spec, ...rect };
      break;
    }
    if (!found) {
      plan.notes.push(`${spec.label} could not be sited.`);
      continue;
    }
    plan.blockedRects.push(G.R(found.x, found.y, found.w, found.h));
    plan.schedule.push({
      label: found.label,
      kind: found.kind,
      size: `${Math.round(found.w)}' × ${Math.round(found.h)}'`,
      area: Math.round(found.w * found.h),
      utility: true,
    });
    placed.push(found);
  }
  return placed;
}

// Reserve the equipment footprints. Called before lots are laid out so the
// village grows around the utility yard instead of over it.
export function planUtilities(plan, cfg, rng) {
  const lots = estLots(plan);
  const area = acres(plan);
  const out = {};
  const specs = {
    power: powerSpecs(cfg.power, lots),
    water: waterSpecs(cfg.water, lots),
    sewer: sewerSpecs(cfg.sewer, lots, area),
  };
  for (const layer of LAYERS) {
    out[layer] = { mode: cfg[layer], label: LABELS[layer][cfg[layer]], nodes: [], runs: [], stubs: [] };
  }
  // biggest equipment gets first pick of the corners
  const ordered = [];
  for (const layer of LAYERS) {
    for (const spec of specs[layer]) ordered.push({ layer, spec });
  }
  ordered.sort((a, b) => b.spec.w * b.spec.h - a.spec.w * a.spec.h);
  for (const { layer, spec } of ordered) {
    out[layer].nodes.push(...placeSpecs(plan, [spec], rng));
  }
  return out;
}

// ---- network --------------------------------------------------------------
// Mitred offset of a polyline, so each trunk runs beside the pavement.
export function offsetPath(pts, closed, d) {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const segN = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const next = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const a = segN(pts[prev], pts[i]);
    const b = segN(pts[i], pts[next]);
    let nx = a[0] + b[0];
    let ny = a[1] + b[1];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const dot = Math.max(0.4, nx * a[0] + ny * a[1]);
    const miter = Math.min(2.6, 1 / dot);
    out.push([pts[i][0] + nx * d * miter, pts[i][1] + ny * d * miter]);
  }
  return out;
}

const OUT = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

function frontMid(site) {
  const d = OUT[site.front] || OUT.s;
  if (d[0] === 0) return [site.x + site.w / 2, d[1] > 0 ? site.y + site.h : site.y];
  return [d[0] > 0 ? site.x + site.w : site.x, site.y + site.h / 2];
}

function stubFor(site, idx) {
  const d = OUT[site.front] || OUT.s;
  const t = [d[1], d[0]];
  const m = frontMid(site);
  const off = (idx - 1) * 2.6;
  const a = [m[0] + t[0] * off, m[1] + t[1] * off];
  return [a, [a[0] + d[0] * 8, a[1] + d[1] * 8]];
}

// Runs are drawn from the road network once every lane exists.
export function buildUtilityRuns(plan) {
  if (!plan.utilities) return;
  for (const layer of LAYERS) {
    const u = plan.utilities[layer];
    u.runs = plan.roads.map((rd) => ({
      pts: offsetPath(rd.pts, !!rd.closed, OFFSET[layer]),
      closed: !!rd.closed,
      kind: rd.kind,
    }));
    u.stubs = plan.sites.length <= 200 ? plan.sites.map((s) => stubFor(s, LAYER_INDEX[layer])) : [];
    u.inlet = {
      x: plan.entry.x + (LAYER_INDEX[layer] - 1) * 5,
      y: plan.parcel.h - 5,
    };
  }
}
