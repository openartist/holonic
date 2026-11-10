// villageGen.js — the organic engine: clusters of cottages on curved streets,
// a common green with the shared buildings, allotments, an orchard, parking, a
// pond and footpaths.
//
// Nothing here is on a lattice. A curved spine leaves the entrance green and
// wanders across the site, branches end in cul-de-sacs, and cottages ring a
// jittered court at each cluster, each rotated to face it. Roads are swept as
// ribbons (a quad per segment plus a disc at every joint), which is what makes
// a curve read as a curve rather than a chain of corners.
//
// Every candidate — cottage, shared building, allotment bed — is measured
// against the road ribbon, the courts, the buildings and the other cottages,
// and dropped if it would touch.

import {
  cleanPolygon, polySimple, polyArea, polyCenter, polyIsClockwise,
  insetPolygon, segIntersect, polyIntersectionArea,
} from './utils.js';
import { pointInPolygon } from './plotGen.js';
import { seededRandom } from './noise.js';
import { dailyDemand, sizeArray, panelRows, roofDeckArea } from './energy.js';
import { lotPlan, lotSize } from './parking.js';

const M2 = 1e-4;

const VILLAGE_SPECS = {
  commonhouse: { w: 1700, d: 1100, h: 470, label: 'Common house' },
  kitchen:     { w: 1200, d: 900,  h: 400, label: 'Kitchen & dining' },
  workshop:    { w: 900,  d: 700,  h: 340, label: 'Workshop' },
  toolshed:    { w: 520,  d: 400,  h: 280, label: 'Tool shed' },
  parking:     { w: 1600, d: 900,  h: 0,   label: 'Parking' },
  veggarden:   { w: 2600, d: 1500, h: 0,   label: 'Veg garden' },
  orchard:     { w: 2800, d: 1700, h: 0,   label: 'Orchard' },
  pond:        { w: 1900, d: 1300, h: 0,   label: 'Pond' },
};

export const VILLAGE_FACILITY_KINDS = Object.keys(VILLAGE_SPECS);

function ccw(pts) { return polyIsClockwise(pts) ? pts.slice().reverse() : pts.slice(); }

function insideRing(poly, ring) {
  if (!poly || poly.length < 3) return false;
  for (const p of poly) if (!pointInPolygon(p, ring)) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    for (let j = 0; j < ring.length; j++) {
      if (segIntersect(a, b, ring[j], ring[(j + 1) % ring.length])) return false;
    }
  }
  return true;
}

function circlePoly(c, r, n = 16) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

// `depth` runs along `angle`, `width` across it.
function rotatedRect(c, width, depth, angle) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const P = (dz, dw) => ({ x: c.x + dz * ca - dw * sa, y: c.y + dz * sa + dw * ca });
  return [P(-depth / 2, -width / 2), P(depth / 2, -width / 2), P(depth / 2, width / 2), P(-depth / 2, width / 2)];
}

function chaikinOpen(pts, iterations) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

// Sweep a polyline into a road: one quad per segment, one disc per joint.
function ribbon(pts, width) {
  const half = width / 2;
  const polys = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    if (l < 1) continue;
    const nx = (-dy / l) * half, ny = (dx / l) * half;
    polys.push([
      { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
    ]);
  }
  for (const p of pts) polys.push(circlePoly(p, half * 0.98, 10));
  return polys;
}

// Quadratic curve between two points, bulged sideways.
function curvePoints(a, b, bulge, steps = 9) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / l) * bulge, cy = my + (dx / l) * bulge;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, s = 1 - t;
    out.push({ x: s * s * a.x + 2 * s * t * cx + t * t * b.x, y: s * s * a.y + 2 * s * t * cy + t * t * b.y });
  }
  return out;
}

export function layoutVillage({ ring, inner, rect, rules, opts = {} }) {
  const notes = [];
  const out = {
    kind: 'village', pattern: 'village', area: ring, inner,
    roads: [], paths: [], pitches: [], facilities: [], gardens: [], solar: [], lots: [],
    allotmentBeds: [], stats: {}, notes,
  };

  const rng = seededRandom(Math.abs(Math.floor(rules.seed || 1)) >>> 0 || 1);
  const uAxis = rect.u, vAxis = rect.v;
  const toWorld = (lu, lv) => ({ x: uAxis.x * lu + vAxis.x * lv, y: uAxis.y * lu + vAxis.y * lv });
  const rectPolyW = (u0, v0, w, d) => [
    toWorld(u0, v0), toWorld(u0 + w, v0), toWorld(u0 + w, v0 + d), toWorld(u0, v0 + d),
  ];

  const roadPolys = [];
  const solids = [];        // courts, cottages, shared buildings, allotments, pond
  const housePolys = [];
  const clearance = 80;

  const free = poly => poly && poly.length >= 3 &&
    roadPolys.every(p => polyIntersectionArea(poly, p) <= clearance) &&
    solids.every(p => polyIntersectionArea(poly, p) <= clearance);

  const addRibbon = (pts, width, kind, container) => {
    for (const poly of ribbon(pts, width)) {
      if (!insideRing(poly, container)) continue;
      out.roads.push({ kind, points: poly });
      roadPolys.push(poly);
    }
  };

  // ---- the common green, just inside the entrance -------------------------
  const uMid = (rect.minU + rect.maxU) / 2;
  const plazaR = Math.min(1200, Math.max(500, (rect.maxU - rect.minU) * 0.06));
  const plazaU = uMid;
  const plazaV = rect.minV + plazaR + 1500;
  const plaza = toWorld(plazaU, plazaV);
  const plazaPoly = circlePoly(plaza, plazaR, 20);
  if (insideRing(plazaPoly, inner)) {
    out.roads.push({ kind: 'plaza', points: plazaPoly });
    roadPolys.push(plazaPoly);
  } else {
    notes.push('The common green does not fit inside the setback.');
  }

  const gateA = toWorld(plazaU, rect.minV - rules.perimeter - 150);
  const gateB = toWorld(plazaU, plazaV - plazaR * 0.9);
  addRibbon([gateA, gateB], rules.roadWidth, 'entrance', ring);

  // ---- the spine, wandering across the site -------------------------------
  const spineU0 = plazaU + plazaR * 0.7;
  const spineU1 = rect.maxU - 900;
  const ctrl = [{ x: plaza.x, y: plaza.y }];
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const u = spineU0 + ((spineU1 - spineU0) * i) / steps;
    const v = plazaV + Math.sin(i * 1.9 + rng() * 2.4) * (rect.maxV - rect.minV) * 0.16
      + (rng() * 2 - 1) * (rules.wobble || 0);
    ctrl.push(toWorld(u, Math.min(rect.maxV - 800, Math.max(rect.minV + 800, v))));
  }
  const spine = chaikinOpen(ctrl, 4);
  addRibbon(spine, rules.roadWidth, 'spine', inner);

  // ---- branches ending in cul-de-sacs -------------------------------------
  for (const t of [0.42, 0.74]) {
    const idx = Math.min(spine.length - 1, Math.floor(spine.length * t));
    const p = spine[idx];
    const side = rng() < 0.5 ? -1 : 1;
    const end = { x: p.x, y: p.y + side * (rect.maxV - rect.minV) * 0.26 };
    if (!pointInPolygon(end, inner)) continue;
    const curve = curvePoints(p, end, (rng() < 0.5 ? -1 : 1) * 900, 8);
    addRibbon(curve, rules.roadWidth * 0.9, 'branch', inner);
    const head = circlePoly(end, 850, 14);
    if (insideRing(head, inner)) {
      out.roads.push({ kind: 'culdesac', points: head });
      roadPolys.push(head);
    }
  }

  // ---- shared buildings, gathered round the green -------------------------
  // Placed before the cottages so the common house, kitchen and workshops get
  // the frontage near the entrance; the cottages take the rest of the site.
  const scan = (spec, minDist = 0) => {
    let best = null, bestD = Infinity;
    for (let v = rect.minV + 500; v + spec.d < rect.maxV - 300; v += 700) {
      for (let u = rect.minU + 500; u + spec.w < rect.maxU - 300; u += 700) {
        const poly = rectPolyW(u, v, spec.w, spec.d);
        if (!insideRing(poly, inner) || !free(poly)) continue;
        const c = polyCenter(poly);
        const d = Math.hypot(c.x - plaza.x, c.y - plaza.y);
        if (d < minDist) continue;
        if (d < bestD) { bestD = d; best = { poly, center: c, u0: u, v0: v }; }
      }
    }
    return best;
  };

  const wanted = opts.facilityKinds || [];
  for (const kind of ['commonhouse', 'kitchen', 'workshop', 'toolshed']) {
    if (!wanted.includes(kind)) continue;
    const spec = VILLAGE_SPECS[kind];
    const spot = scan(spec, plazaR + 500);
    if (!spot) { notes.push(`${spec.label} did not fit around the green.`); continue; }
    out.facilities.push({
      kind, label: spec.label, points: spot.poly, height: spec.h,
      center: spot.center, w: spec.w, d: spec.d, gable: true,
    });
    solids.push(spot.poly);
  }

  // ---- cottage clusters ----------------------------------------------------
  const wantClusters = Math.max(1, Math.round(rules.villageClusters));
  const spacing = Math.max(3800, 2 * (rules.courtRadius + rules.houseDepth) + 1600);
  const centres = [];
  // Walk a jittered lattice, but at a finer step than the cluster footprint so
  // the gaps between streets can still be filled; keep the one that is most
  // free of the green and of the clusters already placed.
  const stepU = spacing * 0.55;
  for (let pass = 0; pass < 2 && centres.length < wantClusters; pass++) {
    for (let v = rect.minV + rules.courtRadius + 700; v < rect.maxV - rules.courtRadius - 700 && centres.length < wantClusters; v += stepU) {
      for (let u = rect.minU + rules.courtRadius + 700; u < rect.maxU - rules.courtRadius - 700 && centres.length < wantClusters; u += stepU) {
        const c = toWorld(u + (rng() * 2 - 1) * stepU * 0.3, v + (rng() * 2 - 1) * stepU * 0.3);
        const court = circlePoly(c, rules.courtRadius, 16);
        if (!insideRing(court, inner) || !free(court)) continue;
        if (Math.hypot(c.x - plaza.x, c.y - plaza.y) < plazaR + rules.courtRadius + 1100) continue;
        if (centres.some(o => Math.hypot(o.x - c.x, o.y - c.y) < spacing * 0.76)) continue;
        centres.push(c);
      }
    }
  }

  let dropped = 0;
  for (const c of centres) {
    const court = circlePoly(c, rules.courtRadius, 16);
    out.gardens.push({ kind: 'court', points: court });
    solids.push(court);

    const n = Math.max(3, Math.round(rules.villageHouses));
    for (let h = 0; h < n; h++) {
      const ang = (h / n) * Math.PI * 2 + (rng() * 2 - 1) * 0.32;
      const r = rules.courtRadius + rules.houseDepth * 0.55 + 200 + rng() * 180;
      const hc = { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
      const facing = Math.atan2(c.y - hc.y, c.x - hc.x);
      const poly = rotatedRect(hc, rules.houseWidth, rules.houseDepth, facing);
      if (!insideRing(poly, inner) || !free(poly)) { dropped++; continue; }
      out.pitches.push({
        points: poly, pad: poly, center: hc,
        facing: { x: Math.cos(facing), y: Math.sin(facing) },
        w: rules.houseWidth, d: rules.houseDepth,
        kind: 'house', storeys: Math.round(rules.houseStoreys),
        tint: Math.floor(rng() * 4), variant: 0, occupied: true,
      });
      housePolys.push(poly);
      solids.push(poly);

      // Private plot behind the cottage, towards the outside of the ring.
      const pc = {
        x: c.x + Math.cos(ang) * (r + rules.houseDepth * 0.74),
        y: c.y + Math.sin(ang) * (r + rules.houseDepth * 0.74),
      };
      const plot = rotatedRect(pc, rules.houseWidth * 0.7, rules.plotDepth, facing);
      if (rules.plotDepth > 0 && insideRing(plot, inner) && free(plot)) {
        out.gardens.push({ kind: 'plot', points: plot });
        solids.push(plot);
      }
    }
  }
  if (!centres.length) notes.push('No room for a cottage cluster inside the green edge.');
  if (dropped) notes.push(`${dropped} cottages were dropped where the cluster met a street, the green or the boundary.`);

  // ---- allotments, orchard, parking, pond ---------------------------------
  // Dead space between the clusters is filled from the gate inwards.
  for (const kind of ['parking', 'veggarden', 'orchard', 'pond']) {
    if (!wanted.includes(kind)) continue;

    // The car park is laid out as bays, not as one grey pad, and it is joined to
    // the nearest lane by an access road so the cottages are driven to.
    if (kind === 'parking') {
      const want = Math.round(out.pitches.length * Math.max(0, rules.parkRatio || 0) / 10);
      if (want < 4) continue;
      const bays = Math.max(4, Math.min(14, Math.ceil(want / 2)));
      const size = lotSize(bays);
      const slot = scan({ w: size.w, d: size.d });
      if (!slot) { notes.push('No room for a car park inside the area.'); continue; }
      out.lots.push(lotPlan({ u0: slot.u0, v0: slot.v0, bays, rectPoly: rectPolyW }));
      solids.push(slot.poly);

      // Nearest point on the spine, then a lane from the lot edge out to it.
      const c = slot.center;
      let best = null, bd = Infinity;
      for (let i = 0; i < spine.length - 1; i++) {
        const a = spine[i], b = spine[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2));
        const q = { x: a.x + dx * t, y: a.y + dy * t };
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (d < bd) { bd = d; best = q; }
      }
      if (best) {
        const ex = best.x - c.x, ey = best.y - c.y;
        const tx = Math.abs(ex) > 1e-6 ? (size.w / 2) / Math.abs(ex) : Infinity;
        const ty = Math.abs(ey) > 1e-6 ? (size.d / 2) / Math.abs(ey) : Infinity;
        const t = Math.min(tx, ty);
        // Start just clear of the bays: the ribbon's disc then sits on the lot
        // edge instead of swallowing the first row of paint.
        const len = Math.hypot(ex, ey) || 1;
        const exit = { x: c.x + ex * (t + 40 / len), y: c.y + ey * (t + 40 / len) };
        for (const poly of ribbon([exit, best], Math.max(300, rules.roadWidth * 0.75))) {
          if (!insideRing(poly, inner)) continue;
          const mid = polyCenter(poly);
          if (mid && pointInPolygon(mid, slot.poly)) continue;
          out.roads.push({ kind: 'parking', points: poly });
          roadPolys.push(poly);
        }
      }
      continue;
    }

    const spec = VILLAGE_SPECS[kind];
    const spot = scan(spec);
    if (!spot) { notes.push(`${spec.label} did not fit inside the area.`); continue; }

    if (kind === 'veggarden') {
      out.gardens.push({ kind: 'veg', points: spot.poly });
      const rows = 3, cols = 5;
      const cw = spec.w / cols, cd = spec.d / rows;
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          const bw = cw * 0.6, bd = cd * 0.54;
          const bed = rectPolyW(spot.u0 + cw * (cc + 0.5) - bw / 2, spot.v0 + cd * (r + 0.5) - bd / 2, bw, bd);
          if (insideRing(bed, inner)) { out.allotmentBeds.push(bed); solids.push(bed); }
        }
      }
      solids.push(spot.poly);
    } else if (kind === 'orchard') {
      out.gardens.push({ kind: 'orchard', points: spot.poly });
      solids.push(spot.poly);
    } else if (kind === 'pond') {
      out.gardens.push({ kind: 'pond', points: spot.poly });
      solids.push(spot.poly);
    } else {
      out.facilities.push({ kind, label: spec.label, points: spot.poly, height: 0, center: spot.center, gable: false });
      solids.push(spot.poly);
    }
  }

  // ---- solar ---------------------------------------------------------------
  // Sized to the village: household demand plus the shared buildings. Roof decks
  // go on the shared buildings, and a ground array takes the rest in whatever
  // dead space the clusters leave.
  if (rules.unitKwh > 0) {
    const demand = dailyDemand({
      units: out.pitches.length, unitKwh: rules.unitKwh,
      facilities: out.facilities.map(f => f.kind),
    });
    const sun = (rules.sunHours || 42) / 10;
    const roofFacs = out.facilities.filter(f => f.height > 0);
    const roofM2 = roofFacs.reduce((s, f) => s + roofDeckArea(f.points, 0.8), 0);
    const size = sizeArray({ demandKwh: demand.totalKwh, sunHours: sun, roofM2, groundM2: 8000 });

    let roofLeft = size.roofM2;
    for (const f of [...roofFacs].sort((a, b) => polyArea(b.points) - polyArea(a.points))) {
      if (roofLeft <= 0) break;
      const usable = roofDeckArea(f.points, 0.8);
      if (usable <= 1) continue;
      out.solar.push({
        points: insetPolygon(f.points, 80) || f.points,
        roof: true, height: f.height, areaM2: Math.min(usable, roofLeft),
      });
      roofLeft -= usable;
    }

    if (size.groundM2 > 0) {
      const spec = size.groundM2 > 500 ? { w: 3200, d: 2200 } : { w: 2400, d: 1600 };
      const spot = scan(spec, 0);
      if (spot) {
        out.gardens.push({ kind: 'solar', points: spot.poly });
        solids.push(spot.poly);
        let left = size.groundM2;
        for (const row of panelRows({ u0: spot.u0, v0: spot.v0, w: spec.w, d: spec.d }, left)) {
          const poly = rectPolyW(row.u, row.v, row.w, row.d);
          if (!insideRing(poly, inner)) continue;
          out.solar.push({ points: poly, roof: false, areaM2: row.areaM2 });
          left -= row.areaM2;
          if (left <= 0) break;
        }
      } else {
        notes.push('No room for the ground solar array: the clusters fill the site.');
      }
    }

    const placed = out.solar.reduce((s, p) => s + (p.areaM2 || 0), 0);
    out.solarPlan = {
      demand, size,
      areaM2: Math.round(placed),
      kwp: Math.round(placed * 0.19 * 10) / 10,
      panels: Math.round(placed / 1.9),
      coverage: size.neededM2 > 0 ? Math.min(1, placed / size.neededM2) : 1,
    };
    if (out.solarPlan.coverage < 0.98) {
      notes.push(`Solar covers ${Math.round(out.solarPlan.coverage * 100)}% of demand — ${size.shortfallM2} m² more array is needed.`);
    }
  }

  // ---- footpaths from each court to the nearest point on the spine --------
  // The path leaves the court on the side that faces the street, and only the
  // pieces that clear the cottages are kept, so a tight cluster still gets a
  // link out instead of losing the whole path.
  for (const c of centres) {
    let best = spine[0], bd = Infinity;
    for (const p of spine) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bd) { bd = d; best = p; }
    }
    const a = Math.atan2(best.y - c.y, best.x - c.x);
    const start = { x: c.x + Math.cos(a) * rules.courtRadius * 0.9, y: c.y + Math.sin(a) * rules.courtRadius * 0.9 };
    const curve = curvePoints(start, best, bd * 0.18, 10);
    const polys = ribbon(curve, rules.pathWidth);
    const kept = polys.filter(p => insideRing(p, inner) &&
      housePolys.every(h => polyIntersectionArea(p, h) <= 60));
    if (kept.length < Math.ceil(polys.length * 0.5)) continue;
    for (const p of kept) out.paths.push({ kind: 'path', points: p });
  }

  // ---- green edge ---------------------------------------------------------
  if (rules.perimeter > 80) {
    const c = polyCenter(ring);
    const t = Math.max(60, rules.perimeter * 0.85);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 200) continue;
      let nx = dy / len, ny = -dx / len;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if ((c.x - m.x) * nx + (c.y - m.y) * ny < 0) { nx = -nx; ny = -ny; }
      out.gardens.push({
        kind: 'perimeter',
        points: [a, b, { x: b.x + nx * t, y: b.y + ny * t }, { x: a.x + nx * t, y: a.y + ny * t }],
      });
    }
  }

  const houseArea = out.pitches.reduce((s, p) => s + polyArea(p.points), 0);
  const gardenArea = out.gardens.filter(g => g.kind !== 'perimeter')
    .reduce((s, g) => s + polyArea(g.points), 0);
  const roadArea = out.roads.reduce((s, r) => s + polyArea(r.points), 0);

  out.stats = {
    areaM2: Math.round(polyArea(ring) * M2),
    usableM2: Math.round(polyArea(inner) * M2),
    pitches: out.pitches.length,
    occupied: out.pitches.length,
    facilities: out.facilities.length,
    gardenM2: Math.round(gardenArea * M2),
    roadM2: Math.round(roadArea * M2),
    parkingSpaces: out.lots.reduce((s, l) => s + l.spaces, 0),
    parkingM2: Math.round(out.lots.reduce((s, l) => s + polyArea(l.points), 0) * M2),
    utilisation: Math.round((houseArea * M2) / Math.max(1, polyArea(inner) * M2) * 100),
    aisleCount: 1,
    clusters: centres.length,
    paths: out.paths.length,
    solarKwh: out.solarPlan ? out.solarPlan.demand.totalKwh : 0,
    solarM2: out.solarPlan ? out.solarPlan.areaM2 : 0,
    solarKwp: out.solarPlan ? out.solarPlan.kwp : 0,
    solarPanels: out.solarPlan ? out.solarPlan.panels : 0,
    solarCoverage: out.solarPlan ? Math.round(out.solarPlan.coverage * 100) : 0,
    pattern: 'village',
  };

  return out;
}
