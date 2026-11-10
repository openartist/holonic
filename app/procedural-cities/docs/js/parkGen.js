// parkGen.js — define an area, then fill it with an RV park.
//
// The area is whatever polygon the user hands in (a drawn boundary) or one of
// the parametric shapes. Everything inside it is laid out against the area's
// minimum-area rectangle, so rows follow the boundary rather than the page axes.
//
// The seed chooses the layout pattern (rows, staggered rows, courtyard pockets,
// clusters with planting breaks), shuffles each site sideways and picks the
// vehicle mix. Every candidate is validated in local coordinates before it is
// kept, so the pattern can break the grid without making anything overlap.
//
// Coordinates are centimetres: 100 units = 1 m, area in m² is unit² × 1e-4.

import {
  cleanPolygon, polySimple, polyArea, polyCenter, polyIsClockwise,
  insetPolygon, segIntersect,
} from './utils.js';
import { pointInPolygon } from './plotGen.js';
import { seededRandom } from './noise.js';
import { PARK_PATTERNS, VILLAGE_PATTERN } from './parkRules.js';
import { layoutVillage } from './villageGen.js';
import { dailyDemand, sizeArray, panelRows, roofDeckArea } from './energy.js';
import { lotPlan, lotSize, BAY_D, LOT_AISLE, LOT_END } from './parking.js';

const M2 = 1e-4;

const FACILITY_SPECS = {
  office:     { w: 900,  d: 700,  h: 320, label: 'Reception' },
  amenity:    { w: 1800, d: 1100, h: 430, label: 'Amenity block' },
  laundry:    { w: 800,  d: 650,  h: 300, label: 'Laundry & showers' },
  pool:       { w: 1200, d: 700,  h: 0,   label: 'Pool' },
  playground: { w: 900,  d: 800,  h: 0,   label: 'Playground' },
  dump:       { w: 500,  d: 400,  h: 0,   label: 'Dump station' },
};

export const FACILITY_KINDS = Object.keys(FACILITY_SPECS);

// Parametric area. `custom` never reaches here — the drawn polygon is used.
export function makeArea(rules) {
  const w = Math.max(2000, rules.areaWidth) / 2;
  const d = Math.max(2000, rules.areaDepth) / 2;
  let pts;

  if (rules.areaShape === 'oval') {
    pts = [];
    const N = 28;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      pts.push({ x: Math.cos(t) * w, y: Math.sin(t) * d });
    }
  } else if (rules.areaShape === 'lshape') {
    const nx = -w + rules.areaWidth * 0.55;
    const ny = -d + rules.areaDepth * 0.5;
    pts = [
      { x: -w, y: -d }, { x: w, y: -d }, { x: w, y: ny },
      { x: nx, y: ny }, { x: nx, y: d }, { x: -w, y: d },
    ];
  } else {
    pts = [{ x: -w, y: -d }, { x: w, y: -d }, { x: w, y: d }, { x: -w, y: d }];
  }

  const a = (rules.areaRotation || 0) * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

function ccw(pts) {
  return polyIsClockwise(pts) ? pts.slice().reverse() : pts.slice();
}

// Sutherland–Hodgman against a convex clip polygon. The subject may be any
// simple polygon (an L-shaped boundary, for instance).
function clipToConvex(subject, clipPts) {
  const clip = ccw(clipPts);
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
  // Clean only exact duplicates: a coarse tolerance here snaps the clipped edge
  // up to 40 cm and pushes the drive aisle into the row of sites.
  const cleaned = out.length >= 3 ? cleanPolygon(out, 2) : [];
  return cleaned.length >= 3 ? cleaned : [];
}

// Fully inside: every vertex inside and no edge touching the ring.
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

// Minimum-area enclosing rectangle, scanned in 2° steps. Returns the axes so
// the layout can work in local (u along, v across) coordinates.
function minAreaRect(pts) {
  let best = null;
  for (let deg = 0; deg < 180; deg += 2) {
    const a = deg * Math.PI / 180;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const v = { x: -Math.sin(a), y: Math.cos(a) };
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of pts) {
      const lu = p.x * u.x + p.y * u.y;
      const lv = p.x * v.x + p.y * v.y;
      if (lu < minU) minU = lu;
      if (lu > maxU) maxU = lu;
      if (lv < minV) minV = lv;
      if (lv > maxV) maxV = lv;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!Number.isFinite(area) || area <= 0) continue;
    if (!best || area < best.area) best = { area, u, v, minU, maxU, minV, maxV };
  }
  return best;
}

// `auto` picks a pattern from the seed, so two seeds no longer draw the same
// corridors with different occupancy.
export function resolvePattern(rules) {
  if (rules.pattern === VILLAGE_PATTERN) return VILLAGE_PATTERN;
  if (rules.pattern && rules.pattern !== 'auto' && PARK_PATTERNS.includes(rules.pattern)) {
    return rules.pattern;
  }
  const s = (Math.abs(Math.round(rules.seed || 1)) * 2654435761) >>> 0;
  const rng = seededRandom(s || 7);
  return PARK_PATTERNS[Math.floor(rng() * PARK_PATTERNS.length) % PARK_PATTERNS.length];
}

function zeroStats() {
  return {
    areaM2: 0, usableM2: 0, pitches: 0, occupied: 0, facilities: 0,
    gardenM2: 0, roadM2: 0, parkingSpaces: 0, parkingM2: 0,
    utilisation: 0, aisleCount: 0, paths: 0, pattern: 'rows',
  };
}

// A road band running inside a ring, edge by edge, with mitred corners. This is
// the park's equivalent of the city's road graph: without it every aisle is a
// separate island, which is exactly what "the roads don't connect" looks like.
function roadRing(ringPts, width) {
  const ring = ccw(ringPts);
  const n = ring.length;
  if (n < 3 || !(width > 0)) return { bands: [], inner: null };
  const normals = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    let nx = -(b.y - a.y), ny = b.x - a.x;  // left normal of a CCW edge points in
    const l = Math.hypot(nx, ny) || 1;
    normals.push({ x: nx / l, y: ny / l });
  }
  // Mitre-offset every vertex inward. The scale 1/(1 + n1·n2) is what makes the
  // offset *edge* width everywhere — one band per edge then closes with no gaps
  // and no overshoot, which a fixed n1+n2 offset cannot do on a curved ring.
  const q = ring.map((p, i) => {
    const n1 = normals[(i - 1 + n) % n], n2 = normals[i];
    const dot = n1.x * n2.x + n1.y * n2.y;
    const k = width / Math.max(0.35, 1 + dot);
    return { x: p.x + (n1.x + n2.x) * k, y: p.y + (n1.y + n2.y) * k };
  });
  const bands = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 150) continue;
    bands.push([a, b, q[(i + 1) % n], q[i]]);
  }
  // `inner` is the far side of the carriageway: layout everything inside it and
  // the sites can never end up on the road.
  return { bands, inner: q };
}

export function layoutPark(areaPts, rules, opts = {}) {
  const notes = [];
  const ring = ccw(cleanPolygon(areaPts || [], 80));
  const out = {
    area: ring, inner: [], roads: [], pitches: [], facilities: [], gardens: [],
    paths: [], squares: [], solar: [], lots: [], allotmentBeds: [], stats: zeroStats(), notes, pattern: 'rows',
  };

  if (ring.length < 3 || !polySimple(ring) || polyArea(ring) * M2 < 200) {
    notes.push('The area needs at least three non-crossing corners and about 200 m².');
    return out;
  }

  let inner = insetPolygon(ring, rules.perimeter);
  if (!inner) {
    const c = polyCenter(ring);
    const k = 0.75;
    inner = cleanPolygon(ring.map(p => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })), 50);
    notes.push('The boundary is too tight for the setback; inset by 25% instead.');
  }
  inner = ccw(inner);
  if (inner.length < 3) {
    notes.push('Nothing usable is left after the setback.');
    return out;
  }
  out.inner = inner;

  let rect = minAreaRect(inner);
  if (!rect) {
    notes.push('Could not fit an axis to the area.');
    return out;
  }
  // The eco village is a different layout engine: clusters on curved loop
  // roads rather than rows on a lattice. It shares the area, the setback and
  // the renderer, and hands back the same shape of layout.
  const pattern = resolvePattern(rules);
  out.pattern = pattern;
  if (pattern === VILLAGE_PATTERN) return layoutVillage({ ring, inner, rect, rules, opts });

  // ---- perimeter drive ----------------------------------------------------
  // A road here only counts once it joins the network. Hold a drive width off
  // the boundary and run a ring inside it: every aisle then ends on the ring,
  // and the ring is the loop that joins the park up. Sites are laid out inside
  // what the drive leaves, so nothing sits on the road.
  const span = Math.min(rect.maxU - rect.minU, rect.maxV - rect.minV);
  const driveW = Math.min(Math.max(0, rules.driveWidth || 0), span * 0.22);
  const ringGap = p => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
    }
    return best;
  };
  const fitsRing = poly => poly.every(p => pointInPolygon(p, ring) || ringGap(p) <= 3);

  // A narrow arm cannot hold a full-width drive, so step the width down until
  // the ring closes cleanly inside the boundary instead of folding on itself.
  let driveBands = [];
  let driveInner = null;
  let ringW = 0;
  if (driveW > 60) {
    for (const w of [driveW, driveW * 0.7, driveW * 0.45, driveW * 0.3]) {
      const trial = roadRing(inner, w);
      const q = trial.inner;
      if (!q || !trial.bands.length) continue;
      if (!polySimple(q) || polyArea(q) < polyArea(inner) * 0.3) continue;
      if (!trial.bands.every(fitsRing)) continue;
      driveBands = trial.bands;
      driveInner = q;
      ringW = w;
      break;
    }
    if (!driveBands.length) notes.push('The boundary is too tight for a perimeter drive.');
  }

  // Sites live inside the far side of the drive, so they cannot sit on it.
  let pad = inner;
  if (driveInner) {
    pad = ccw(driveInner);
    rect = minAreaRect(pad) || rect;
  }

  const uAxis = rect.u, vAxis = rect.v;
  const toWorld = (lu, lv) => ({ x: uAxis.x * lu + vAxis.x * lv, y: uAxis.y * lu + vAxis.y * lv });
  const rectPoly = (u0, v0, w, d) => [
    toWorld(u0, v0), toWorld(u0 + w, v0), toWorld(u0 + w, v0 + d), toWorld(u0, v0 + d),
  ];

  const margin = Math.max(60, rules.pitchGap * 0.5);
  const cellW = rules.pitchWidth + rules.pitchGap;
  const cols = Math.max(1, Math.floor((rect.maxU - rect.minU - margin * 2) / cellW));
  const sqW = Math.max(0, Math.round(rules.squareWidth || 0));

  // ---- entrance drive and facilities band ---------------------------------
  // The gate crosses the planting edge and runs into the perimeter drive, so
  // there is a way in from the street that is joined to the network.

  // Which edge a community block lands on, and where along it, is seed-driven.
  // The pack used to start at the same corner and walk right, so every seed
  // produced the same top-left cluster; the seed now shuffles the order, picks a
  // starting point along the frontage and may send a block to the far edge.
  const frng = seededRandom((Math.abs(Math.floor(rules.seed)) >>> 0 || 1) ^ 0x85ebca6b);
  let bandDepth = 0;      // reserved along the minV edge
  let bandDepthFar = 0;   // reserved along the maxV edge
  const facilityRects = [];

  // ---- car park -----------------------------------------------------------
  // Parking is given its own land, sized from the plan rather than guessed: bays
  // are painted either side of an access aisle, and that aisle is a real lane
  // running off the perimeter drive, so the lot is joined to the network instead
  // of being a slab laid beside it.
  const lotRects = [];
  {
    const reach = rules.pathWidth > 0 ? rules.pathWidth + 120 : 0;
    const pairs = Math.max(1, Math.min(2, Math.round(rules.rowPairs)));
    const colEst = Math.max(1, Math.floor((rect.maxU - rect.minU - margin * 2) / cellW));
    const rowEst = Math.max(1, Math.floor((rect.maxV - rect.minV) / (rules.aisleWidth + rules.pitchDepth * pairs)));
    const estSites = Math.min(rules.maxPitches, colEst * rowEst * pairs);
    const want = Math.max(0, Math.round(estSites * Math.max(0, rules.parkRatio) / 10));

    if (want >= 4) {
      const perRow = Math.ceil(want / 2);
      const BAY_RUN = 14;                       // 35 m of bays, a car-park-sized run
      const nWant = Math.max(1, Math.ceil(perRow / BAY_RUN));
      const bays = Math.ceil(perRow / nWant);
      const { w: lotW, d: lotD } = lotSize(bays);
      const uLo = rect.minU + margin + reach;
      const uHi = rect.maxU - margin - reach;
      const gap = 400;
      const span = uHi - uLo;
      // Whole lots only, and only as many as the frontage takes.
      const nLots = Math.max(0, Math.min(nWant, Math.floor((span + gap) / (lotW + gap))));

      if (nLots < 1) {
        notes.push('No frontage for a car park: widen the area or drop the bays.');
      } else {
        const total = nLots * lotW + (nLots - 1) * gap;
        // A wedge or an oval has nothing usable at the very top, so the band is
        // tried a little deeper before the car park is given up.
        let spot = null;
        for (const dv of [0, 300, 600, 900, 1300]) {
          const v0 = Math.round(rect.minV + margin + reach + dv);
          const startU = Math.round(uLo + frng() * Math.max(0, span - total));
          const rows = [];
          for (let i = 0; i < nLots; i++) {
            const u0 = startU + i * (lotW + gap);
            if (!insideRing(rectPoly(u0, v0, lotW, lotD), pad)) { rows.length = 0; break; }
            rows.push(u0);
          }
          if (rows.length) { spot = { v0, rows }; break; }
        }

        if (!spot) {
          notes.push('No room for a car park inside the area.');
        } else {
          for (const u0 of spot.rows) {
            out.lots.push(lotPlan({ u0, v0: spot.v0, bays, rectPoly }));
            lotRects.push({ u0, v0: spot.v0, w: lotW, d: lotD });

            // Access lane: off the drive, down the side of the lot, into its aisle.
            // This is the "joined to the plot" part — a lot with no way in is a
            // painted rectangle, not parking.
            const link = 320;
            const lane = [
              { u: u0 - link, v: rect.minV - 40, w: link, d: spot.v0 + BAY_D + LOT_AISLE - rect.minV + 40 },
              { u: u0 - link, v: spot.v0 + BAY_D, w: link + LOT_END, d: LOT_AISLE },
            ];
            let joined = false;
            for (const s of lane) {
              const road = clipToConvex(pad, rectPoly(s.u, s.v, s.w, s.d));
              if (road.length < 3 || polyArea(road) < s.w * s.d * 0.4) continue;
              out.roads.push({ kind: 'parking', points: road });
              joined = true;
            }
            if (!joined) {
              // Tucked against the boundary on its access side: come straight in.
              const sw = Math.min(500, rules.aisleWidth);
              const road = clipToConvex(pad, rectPoly(u0 + lotW / 2 - sw / 2, rect.minV - 40, sw, spot.v0 - rect.minV + 60));
              if (road.length >= 3) out.roads.push({ kind: 'parking', points: road });
            }
          }
          bandDepth = Math.max(bandDepth, (spot.v0 - rect.minV) + lotD + margin * 0.5);
          if (nLots < nWant) {
            notes.push(`The frontage takes ${nLots} of ${nWant} car-park lots — ${(nWant - nLots) * bays * 2} bays are not drawn.`);
          }
        }
      }
    }
  }

  if (opts.facilityKinds && opts.facilityKinds.length) {
    const placed = [...lotRects];
    let budget = (rect.maxU - rect.minU) * Math.max(0.1, rules.facilityShare);
    // Leave room for the path ring around each footprint, so a block is never
    // wedged against the area edge with nowhere to walk round it.
    const ringReach = rules.pathWidth > 0 ? rules.pathWidth + 120 : 0;
    const uLo = rect.minU + margin + ringReach;
    const uHi = rect.maxU - margin - ringReach;
    const areaDepth = rect.maxV - rect.minV;

    // With a square, the reception moves onto it, so it is not also placed in
    // the frontage band.
    const kinds = [...opts.facilityKinds].filter(k => !(sqW >= 1200 && k === 'office'));
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(frng() * (i + 1));
      const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t;
    }

    // Candidate frontage positions. A seed picks one to start from and the search
    // wraps around the frontage from there, so blocks land all along it.
    const slots = [];
    for (let u = uLo; u <= uHi; u += 250) slots.push(u);
    const slotCount = Math.max(1, slots.length);

    // A limited number of blocks may take the far edge, and only while the rows
    // keep most of the depth.
    let farBudget = areaDepth * 0.22;
    let farCount = 0;

    for (const [i, kind] of kinds.entries()) {
      const spec = FACILITY_SPECS[kind];
      if (!spec) continue;
      if (spec.w > budget) { notes.push(`${spec.label} does not fit the facility frontage.`); continue; }

      const wantFar = i > 0 && farCount < 2 && farBudget - spec.d > 600 && frng() < 0.55;
      let spot = null, spotRect = null, depthNear = 0, depthFar = 0;

      for (const side of wantFar ? [1, 0] : [0]) {
        const start = Math.floor(frng() * slotCount);
        // A tapered boundary (a wedge, an oval) has no room in the first band, so
        // the facilities search along the frontage and a little further in before
        // they give up.
        const offsets = [0, 250, 500, 800, 1200, 1700, 2400, 3200];
        for (const dv of offsets) {
          for (let k = 0; k < slotCount; k++) {
            if (!slots.length) break;
            const u0 = slots[(start + k) % slotCount];
            if (u0 + spec.w > uHi) continue;
            const v0 = side === 0
              ? rect.minV + margin + ringReach + dv
              : rect.maxV - margin - ringReach - spec.d - dv;
            const poly = rectPoly(u0, v0, spec.w, spec.d);
            if (!insideRing(poly, pad)) continue;
            // Compare rectangles in local coordinates. A geometric crossing test
            // is degenerate here: two footprints of the same width share every
            // edge line, so collinear edges read as "no crossing" while the
            // rectangles overlap completely.
            const clash = placed.some(p =>
              u0 < p.u0 + p.w + 400 && p.u0 < u0 + spec.w + 400 &&
              v0 < p.v0 + p.d + 400 && p.v0 < v0 + spec.d + 400);
            if (clash) continue;
            spot = poly;
            spotRect = { u0, v0, w: spec.w, d: spec.d, side };
            break;
          }
          if (spot) break;
        }
        if (spot) break;
      }
      if (!spot) { notes.push(`${spec.label} does not fit inside the area.`); continue; }

      if (spotRect.side === 0) {
        depthNear = spotRect.v0 + spec.d + margin + 120 - rect.minV;
      } else {
        depthFar = rect.maxV - (spotRect.v0 - margin - 120);
        farCount++;
        farBudget -= spec.d;
      }

      out.facilities.push({
        kind, label: spec.label, points: spot, height: spec.h,
        center: polyCenter(spot),
      });
      placed.push(spotRect);
      facilityRects.push(spotRect);
      budget -= spec.w + 250;
      bandDepth = Math.max(bandDepth, depthNear);
      bandDepthFar = Math.max(bandDepthFar, depthFar);
    }
  }

  // ---- civic square -------------------------------------------------------
  // A town grows a square, not just rows. The sources agree on the shape of the
  // thing: a roughly 3:2 rectangle enclosed by streets, with the civic building
  // on it and traffic running round the edge rather than through the middle, the
  // centre left open. So the plaza is sized from a lever, sited by the seed,
  // ringed by its own street, and every row strip is cut around the block.
  let square = null;        // the paved plaza, in local coordinates
  let squareBlock = null;   // plaza plus its ring street: out of bounds for sites
  const sqRoad = Math.min(700, Math.max(300, rules.aisleWidth));
  if (sqW >= 1200) {
    const sqD = Math.round(sqW * 0.68);
    const topLimit = rect.minV + bandDepth + sqRoad + 200;
    const botLimit = rect.maxV - bandDepthFar - sqRoad - 200;
    if (botLimit - topLimit > sqD) {
      const sqRng = seededRandom((Math.abs(Math.floor(rules.seed)) >>> 0 || 1) ^ 0x27d4eb2f);
      const uSpan = (rect.maxU - rect.minU) - 2 * (margin + sqRoad) - sqW;
      const u0 = uSpan > 0
        ? rect.minU + margin + sqRoad + sqRng() * uSpan
        : rect.minU + margin + sqRoad;
      const vSpan = (botLimit - topLimit) - sqD;
      const v0 = topLimit + sqRng() * Math.max(0, vSpan);
      const trial = { u0: Math.round(u0), v0: Math.round(v0), w: sqW, d: sqD };
      if (insideRing(rectPoly(trial.u0, trial.v0, trial.w, trial.d), pad)) {
        square = trial;
        squareBlock = {
          u0: trial.u0 - sqRoad, v0: trial.v0 - sqRoad,
          w: trial.w + 2 * sqRoad, d: trial.d + 2 * sqRoad,
        };
      }
    }
    if (!square) notes.push('No room for a town square at this size: it needs a deeper area.');
  }

  if (square) {
    const plaza = rectPoly(square.u0, square.v0, square.w, square.d);
    out.squares.push(plaza);
    out.stats.squareM2 = square.w * square.d * M2;

    // The street goes round the square, so no traffic cuts the space and the
    // aisles meet it at its corners.
    const ringRoads = [
      { u: square.u0 - sqRoad, v: square.v0 - sqRoad, w: square.w + 2 * sqRoad, d: sqRoad },
      { u: square.u0 - sqRoad, v: square.v0 + square.d, w: square.w + 2 * sqRoad, d: sqRoad },
      { u: square.u0 - sqRoad, v: square.v0, w: sqRoad, d: square.d },
      { u: square.u0 + square.w, v: square.v0, w: sqRoad, d: square.d },
    ];
    for (const r of ringRoads) {
      const poly = clipToConvex(pad, rectPoly(r.u, r.v, r.w, r.d));
      if (poly.length >= 3) out.roads.push({ kind: 'square', points: poly });
    }

    // The reception fronts the square and faces its open centre.
    const officeSpec = FACILITY_SPECS.office;
    if (officeSpec) {
      const ou = Math.round(square.u0 + (square.w - officeSpec.w) / 2);
      const ov = square.v0 + 60;
      const opoly = rectPoly(ou, ov, officeSpec.w, officeSpec.d);
      out.facilities.push({
        kind: 'office', label: officeSpec.label, points: opoly,
        height: officeSpec.h, center: polyCenter(opoly),
      });
      facilityRects.push({ u0: ou, v0: ov, w: officeSpec.w, d: officeSpec.d });
    }

    // Footways round the open centre, reaching the street on both sides, plus a
    // strip in front of the reception so its door has a way out.
    if (rules.pathWidth > 0) {
      const pw = rules.pathWidth;
      const inset = 120;
      const loop = [
        { u: square.u0, v: square.v0 + inset, w: pw, d: square.d - inset * 2 },
        { u: square.u0 + square.w - pw, v: square.v0 + inset, w: pw, d: square.d - inset * 2 },
        { u: square.u0 + inset, v: square.v0 + square.d - pw, w: square.w - inset * 2, d: pw },
      ];
      if (officeSpec) {
        loop.push({
          u: square.u0 + inset, v: square.v0 + 60 + officeSpec.d + 60,
          w: square.w - inset * 2, d: pw,
        });
      }
      for (const s of loop) {
        if (!(s.w > 60 && s.d > 60)) continue;
        // The side strips lie on the plaza edge, so they are clipped rather than
        // rejected for touching the boundary.
        const poly = clipToConvex(plaza, rectPoly(s.u, s.v, s.w, s.d));
        if (poly.length >= 3 && polyArea(poly) > s.w * s.d * 0.5) {
          out.paths.push({ kind: 'square', points: poly });
        }
      }
    }
  }

  // The gate follows the boundary rather than the bounding box: on an oval or a
  // wedge the box corner is nowhere near the site, so an axis-aligned band there
  // would join nothing. Find the nearest boundary edge on the gate side, then
  // cut a band along its normal from outside the planting edge to the drive.
  {
    const c = polyCenter(pad);
    const target = { x: c.x - (rect.maxU - rect.minU) * 0.5, y: c.y };
    let best = null;
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / l2));
      const p = { x: a.x + dx * t, y: a.y + dy * t };
      const d = Math.hypot(p.x - target.x, p.y - target.y);
      if (!best || d < best.d) {
        const l = Math.hypot(dx, dy) || 1;
        best = { d, p, n: { x: -dy / l, y: dx / l } };  // inward normal of a CCW edge
      }
    }
    if (best) {
      const tan = { x: -best.n.y, y: best.n.x };
      const half = Math.max(300, Math.min(Math.max(ringW, 500), 900) * 0.5);
      const outBy = rules.perimeter + 300;
      // Stop short of the drive's far edge so the gate can never clip a site.
      const inBy = Math.max(0, ringW - 60);
      const P = (s, u) => ({
        x: best.p.x + best.n.x * s + tan.x * u,
        y: best.p.y + best.n.y * s + tan.y * u,
      });
      const gate = clipToConvex(ring, [P(-outBy, -half), P(-outBy, half), P(inBy, half), P(inBy, -half)]);
      if (gate.length >= 3) out.roads.push({ kind: 'entrance', points: gate });
    }
  }

  // The ring every aisle ends on.
  for (const band of driveBands) {
    const poly = cleanPolygon(band, 5);
    if (poly.length >= 3) out.roads.push({ kind: 'drive', points: poly });
  }

  // ---- rows of sites ------------------------------------------------------
  out.stats.pattern = pattern;

  const rows = Math.max(1, Math.min(2, Math.round(rules.rowPairs)));
  const rng = seededRandom(Math.abs(Math.floor(rules.seed)) >>> 0 || 1);

  // Occupancy ledger in local coordinates. Sites, courtyard pockets and their
  // neighbours are all validated against it, so the pattern can shuffle the
  // grid without producing an overlap.
  const placedRects = [];
  const clashes = r => placedRects.some(p =>
    r.u0 < p.u0 + p.w && p.u0 < r.u0 + r.w && r.v0 < p.v0 + p.d && p.v0 < r.v0 + r.d);
  const place = (u0, v0, w, d) => {
    const candidate = { u0, v0, w, d };
    // The facility bands at both ends of the area are out of bounds for sites.
    if (v0 < rect.minV + bandDepth || v0 + d > rect.maxV - bandDepthFar) return null;
    // So is the square block: nothing is built on a town square.
    if (squareBlock &&
      u0 < squareBlock.u0 + squareBlock.w && squareBlock.u0 < u0 + w &&
      v0 < squareBlock.v0 + squareBlock.d && squareBlock.v0 < v0 + d) return null;
    if (clashes(candidate)) return null;
    const poly = rectPoly(u0, v0, w, d);
    if (!insideRing(poly, pad)) return null;
    placedRects.push(candidate);
    return poly;
  };

  // Full-width strips — aisles, footways, planting beds — are cut around the
  // square block, so the grid meets the square instead of running through it.
  const splitAround = (u0, v0, w, d) => {
    if (!squareBlock) return [{ u: u0, v: v0, w, d }];
    const b = squareBlock;
    if (b.v0 + b.d <= v0 || v0 + d <= b.v0) return [{ u: u0, v: v0, w, d }];
    const parts = [];
    if (u0 < b.u0) parts.push({ u: u0, v: v0, w: Math.min(w, b.u0 - u0), d });
    const right = b.u0 + b.w;
    if (right < u0 + w) parts.push({ u: right, v: v0, w: u0 + w - right, d });
    return parts;
  };
  const overSquare = (u0, v0, w, d) => !!squareBlock &&
    u0 < squareBlock.u0 + squareBlock.w && squareBlock.u0 < u0 + w &&
    v0 < squareBlock.v0 + squareBlock.d && squareBlock.v0 < v0 + d;

  // Reserved corridor columns: every Nth column carries a pedestrian cross path,
  // so it is left free of sites while the rows are laid out.
  const crossEvery = Math.max(0, Math.round(rules.crossEvery || 0));

  let v = rect.minV + bandDepth;
  const aisleBands = [];
  const solarBeds = [];   // local rects of open beds, where a ground array can go
  let capped = false;
  let aisleCount = 0;
  let guard = 0;
  let bedIndex = 0;
  let unitIndex = 0;

  while (guard++ < 80) {
    if (v + rules.aisleWidth > rect.maxV - bandDepthFar - margin * 0.5) break;

    const aislePieces = splitAround(rect.minU, v, rect.maxU - rect.minU, rules.aisleWidth)
      .map(s => clipToConvex(pad, rectPoly(s.u, s.v, s.w, s.d)))
      .filter(piece => piece.length >= 3);
    if (aislePieces.length) {
      for (const piece of aislePieces) out.roads.push({ kind: 'aisle', points: piece });
      aisleCount++;
      aisleBands.push({ v0: v, v1: v + rules.aisleWidth });
      // Footway along the far edge of every carriageway: that puts a pedestrian
      // route in every block, whether or not the pattern puts a planting strip
      // there, and it spans the pad so it joins the perimeter drive at each end.
      if (rules.pathWidth > 0) {
        const pw = Math.min(rules.pathWidth, rules.aisleWidth * 0.45);
        if (pw > 60) {
          for (const s of splitAround(rect.minU, v + rules.aisleWidth - pw, rect.maxU - rect.minU, pw)) {
            const walk = clipToConvex(pad, rectPoly(s.u, s.v, s.w, s.d));
            if (walk.length >= 3) out.paths.push({ kind: 'path', points: walk });
          }
        }
      }
    }
    v += rules.aisleWidth;

    for (let row = 0; row < rows; row++) {
      if (v + rules.pitchDepth > rect.maxV - bandDepthFar - margin * 0.5) break;
      // row 0 fronts the aisle just placed; a second row fronts the next one.
      const facing = row === 0
        ? { x: -vAxis.x, y: -vAxis.y }
        : { x: vAxis.x, y: vAxis.y };

      // Staggered rows shift by half a pitch, so the rows read as broken rather
      // than as one continuous corridor.
      const shift = pattern === 'stagger' && (unitIndex + row) % 2 === 1 ? cellW * 0.5 : 0;

      for (let col = 0; col < cols; col++) {
        if (out.pitches.length >= rules.maxPitches) { capped = true; break; }

        // Keep the corridor column clear so the cross path has a way through.
        if (crossEvery > 0 && (col + 1) % crossEvery === 0) continue;

        const baseU = rect.minU + margin + col * cellW + shift;

        // Courtyards: two sites are replaced by a communal green pocket that
        // the surrounding sites face.
        if (pattern === 'courts' && col % 5 === 2 && col + 1 < cols) {
          const court = place(baseU, v, cellW * 2 - rules.pitchGap, rules.pitchDepth);
          if (court) {
            out.gardens.push({ kind: 'court', points: court });
            col += 1;
            continue;
          }
        }

        // Clusters: leave planting breaks, so groups of sites read as clusters.
        if (pattern === 'clusters' && rng() < 0.18) continue;
        if (pattern === 'stagger' && rng() < 0.06) continue;

        const jit = rules.jitter > 0 ? (rng() * 2 - 1) * rules.jitter : 0;
        const poly = place(baseU + jit, v, rules.pitchWidth, rules.pitchDepth)
          || place(baseU, v, rules.pitchWidth, rules.pitchDepth);
        if (!poly) continue;

        const variant = rng() < rules.variety ? Math.floor(rng() * 4) : 0;
        const tint = Math.floor(rng() * 4);
        const padInset = rules.padSetback + Math.round(rng() * rules.jitter * 0.5);

        out.pitches.push({
          points: poly,
          pad: insetPolygon(poly, padInset) || poly,
          center: polyCenter(poly),
          facing,
          variant,
          tint,
          occupied: rng() < rules.fillChance,
        });
      }
      if (capped) break;

      v += rules.pitchDepth;

      // Back-to-back rows get a planting bed between their back fences; a
      // single row gets one behind it. Never in front of a site.
      const bedAfter = rows === 1 || row < rows - 1;
      if (bedAfter && rules.gardenDepth > 0 && v + rules.gardenDepth < rect.maxV - bandDepthFar - margin * 0.5) {
        const bedSlots = splitAround(rect.minU, v, rect.maxU - rect.minU, rules.gardenDepth);
        const bedParts = bedSlots
          .map(s => clipToConvex(pad, rectPoly(s.u, s.v, s.w, s.d)))
          .filter(pm => pm.length >= 3);
        if (bedParts.length) {
          const allotment = bedIndex === 1 && rules.greenery > 0;
          for (const bed of bedParts) out.gardens.push({ kind: allotment ? 'allotment' : 'bed', points: bed });
          // An open planting bed doubles as the ground-mount solar field.
          if (!allotment) {
            for (const s of bedSlots) solarBeds.push({ u0: s.u, v0: s.v, w: s.w, d: s.d });
          }
          // A footpath down the middle of every planting strip. The park used to
          // have asphalt aisles and nothing else, so there was no pedestrian way
          // between the rows: this strip spans the pad, so it joins the perimeter
          // drive at both ends and the drive links the strips to each other.
          if (!allotment && rules.pathWidth > 0) {
            const w = Math.min(rules.pathWidth, rules.gardenDepth - 40);
            if (w > 60) {
              const midV = v + (rules.gardenDepth - w) / 2;
              for (const s of splitAround(rect.minU, midV, rect.maxU - rect.minU, w)) {
                const strip = clipToConvex(pad, rectPoly(s.u, s.v, s.w, s.d));
                if (strip.length >= 3) out.paths.push({ kind: 'path', points: strip });
              }
            }
          }
          if (allotment) {
            const cellW2 = 260, cellD = 200, gap = 90;
            for (let bu = rect.minU + margin; bu + cellW2 < rect.maxU - margin; bu += cellW2 + gap) {
              for (let br = 0; br < 2; br++) {
                const bv = v + 60 + br * (cellD + gap);
                if (bv + cellD > v + rules.gardenDepth - 40) continue;
                const plot = rectPoly(bu, bv, cellW2, cellD);
                if (insideRing(plot, pad) && !overSquare(bu, bv, cellW2, cellD)) out.allotmentBeds.push(plot);
              }
            }
          }
          bedIndex++;
        }
        v += rules.gardenDepth;
      }
    }
    unitIndex++;
    if (capped) break;
  }

  if (capped) notes.push(`Site cap reached at ${rules.maxPitches} — raise it under Sites for a bigger park.`);
  if (!out.pitches.length) notes.push('No site fitted: widen the area or shrink the pitch and aisle sizes.');
  if (!aisleCount) notes.push('No drive aisle fitted inside the setback.');

  // ---- pedestrian cross corridors ----------------------------------------
  // Footways that follow the aisles only run one way, so getting from one row to
  // the next meant walking the whole perimeter drive. Every few site columns is
  // now left free and carries a path that runs perpendicular to the aisles, the
  // full depth of the park, joining the drive at both ends.
  // ---- spurs from the square onto the grid --------------------------------
  // The rows are cut around the square block, so the block's own street can end
  // up floating between two rows. A short spur on each side ties it to the
  // nearest aisle, so the square is on the way through rather than a cul-de-sac.
  if (square) {
    const spur = (band) => {
      const belowRing = square.v0 - sqRoad;
      const aboveRing = square.v0 + square.d + sqRoad;
      const options = [];
      const gLow = belowRing - band.v1;
      if (gLow >= 0) options.push({ g: gLow, va: band.v1, vb: belowRing });
      const gHigh = band.v0 - aboveRing;
      if (gHigh >= 0) options.push({ g: gHigh, va: aboveRing, vb: band.v0 });
      options.sort((a, b) => a.g - b.g);
      const o = options[0];
      if (!o || o.g > 1400 || o.vb - o.va < 20) return;
      for (let t = 1; t <= 9; t++) {
        const cu = Math.round(square.u0 + (square.w * t) / 10 - sqRoad / 2);
        if (cu < rect.minU + 40 || cu + sqRoad > rect.maxU - 40) continue;
        const hit = placedRects.some(p =>
          cu < p.u0 + p.w && p.u0 < cu + sqRoad && o.va < p.v0 + p.d && p.v0 < o.vb);
        if (hit) continue;
        const poly = rectPoly(cu, o.va, sqRoad, o.vb - o.va);
        if (insideRing(poly, pad)) out.roads.push({ kind: 'square', points: poly });
        return;
      }
    };
    const below = aisleBands.filter(b => b.v1 <= square.v0 - sqRoad + 1).sort((a, b) => b.v1 - a.v1)[0];
    const above = aisleBands.filter(b => b.v0 >= square.v0 + square.d + sqRoad - 1).sort((a, b) => a.v0 - b.v0)[0];
    if (below) spur(below);
    if (above) spur(above);
  }

  // ---- footpaths around the buildings -------------------------------------
  // The lawn around a block was blank: nothing walked its face and nothing could
  // walk round it. Every footprint now gets a closed path ring, held off the
  // walls, with a spur joining it to the nearest aisle so the ring is walkable
  // to rather than an island.
  if (rules.pathWidth > 0 && facilityRects.length) {
    const pw = rules.pathWidth;
    const gap = 60;
    for (const [fi, f] of facilityRects.entries()) {
      const ring = [
        { side: 0, u: f.u0 - gap - pw, v: f.v0 - gap - pw, w: f.w + 2 * (gap + pw), d: pw },
        { side: 1, u: f.u0 - gap - pw, v: f.v0 + f.d + gap, w: f.w + 2 * (gap + pw), d: pw },
        { side: 2, u: f.u0 - gap - pw, v: f.v0 - gap, w: pw, d: f.d + 2 * gap },
        { side: 3, u: f.u0 + f.w + gap, v: f.v0 - gap, w: pw, d: f.d + 2 * gap },
      ];
      const fits = ring.every(s => {
        const poly = rectPoly(s.u, s.v, s.w, s.d);
        if (!insideRing(poly, pad)) return false;
        return !placedRects.some(p =>
          s.u < p.u0 + p.w && p.u0 < s.u + s.w && s.v < p.v0 + p.d && p.v0 < s.v + s.d);
      });
      if (!fits) continue;
      for (const s of ring) {
        out.paths.push({ kind: 'ring', fac: fi, side: s.side, points: rectPoly(s.u, s.v, s.w, s.d) });
      }

      // Spur from the ring to the closest aisle.
      const lo = f.v0 - gap - pw, hi = f.v0 + f.d + gap + pw;
      let spur = null;
      for (const b of aisleBands) {
        const below = lo - b.v1;
        if (below >= -pw && below < 1400 && (!spur || below < spur.g)) spur = { g: below, va: b.v1, vb: lo };
        const above = b.v0 - hi;
        if (above >= -pw && above < 1400 && (!spur || above < spur.g)) spur = { g: above, va: hi, vb: b.v0 };
      }
      if (spur && Math.abs(spur.vb - spur.va) > 1) {
        const s = {
          u: f.u0 + f.w / 2 - pw / 2, v: Math.min(spur.va, spur.vb),
          w: pw, d: Math.abs(spur.vb - spur.va),
        };
        const poly = rectPoly(s.u, s.v, s.w, s.d);
        const clear = insideRing(poly, pad) && !placedRects.some(p =>
          s.u < p.u0 + p.w && p.u0 < s.u + s.w && s.v < p.v0 + p.d && p.v0 < s.v + s.d);
        if (clear) out.paths.push({ kind: 'ring', fac: fi, side: 4, points: poly });
      }
    }
  }

  if (crossEvery > 0 && rules.pathWidth > 0 && placedRects.length) {
    const v0 = rect.minV + Math.max(0, bandDepth);
    const v1 = rect.maxV;
    const depth = v1 - v0;
    const CLR = 60;
    if (depth > 300) {
      // Corridors are meant every `crossEvery` columns, but a column that a site
      // blocks moves to its neighbour rather than leaving the park without a way
      // across: the spacing is a rhythm, not a reason to stop walking.
      const queue = [];
      for (let col = crossEvery - 1; col < cols; col += crossEvery) {
        for (const d of [0, 1, -1, 2, -2]) queue.push(col + d);
      }
      // Last resort: any column at all. A sparse layout can put a site in every
      // one of the preferred lanes, and the park still needs a way through.
      for (let col = 0; col < cols; col++) queue.push(col);
      const want = Math.max(1, Math.ceil(cols / crossEvery));
      const seen = new Set();
      let made = 0;

      for (const col of queue) {
        if (made >= want) break;
        if (col < 0 || col >= cols || seen.has(col)) continue;
        seen.add(col);
        const cellStart = rect.minU + margin + col * cellW;
        const pw = Math.min(rules.pathWidth, cellW * 0.6);
        if (!(pw > 60)) continue;
        // A site landing on the centre line moves the corridor instead of
        // cancelling it: the rows shift as levers change, and one blocked line
        // out of five positions is not a reason to leave the park with no way
        // across. A building in the lane is walked around, not abandoned.
        const clearOfSites = u => !placedRects.some(p =>
          u < p.u0 + p.w && p.u0 < u + pw && v0 < p.v0 + p.d && p.v0 < v0 + depth);
        // The centre of the cell is inside a pitch; the strips at its edges are
        // the hedge gaps between neighbours, which is where a path can run when
        // the rows are full. Try the middle first, then those gaps.
        const u0 = [0.5, 0.3, 0.7, 0.18, 0.82, 0.9, 0.1, 0.94, 0.06]
          .map(t => cellStart + cellW * t - pw / 2)
          .find(clearOfSites);
        if (u0 == null) continue;
        // The square is a destination, not a wall. Instead of dropping the
        // corridor that meets it, treat the block as one more thing to walk
        // round — otherwise a square sited across the only free column leaves
        // the park with no way from one row to the next.
        const blockers = facilityRects
          .filter(f => u0 < f.u0 + f.w + CLR && f.u0 < u0 + pw + CLR &&
            v0 < f.v0 + f.d + CLR && f.v0 < v0 + depth + CLR);
        if (squareBlock && u0 < squareBlock.u0 + squareBlock.w && squareBlock.u0 < u0 + pw &&
          v0 < squareBlock.v0 + squareBlock.d && squareBlock.v0 < v0 + depth) {
          blockers.push(squareBlock);
        }
        blockers.sort((a, b) => a.v0 - b.v0);

        if (!blockers.length) {
          const strip = clipToConvex(pad, rectPoly(u0, v0, pw, depth));
          if (strip.length >= 3) { out.paths.push({ kind: 'cross', points: strip }); made++; }
          continue;
        }

        // Orthogonal bypass: run up to the block, step across to a free lane at
        // its side, pass the block, then step back onto the original line.
        const segs = [];
        let cu = u0, cv = v0, ok = true;
        for (const f of blockers) {
          const top = f.v0 - CLR, bot = f.v0 + f.d + CLR;
          if (top < cv) { ok = false; break; }
          const cands = [
            f.u0 - CLR - pw,
            f.u0 + f.w + CLR,
          ].sort((a, b) => Math.abs(a - cu) - Math.abs(b - cu));
          let lane = null;
          for (const c of cands) {
            if (c < rect.minU + 40 || c + pw > rect.maxU - 40) continue;
            const hit = placedRects.some(p =>
              c < p.u0 + p.w && p.u0 < c + pw && top < p.v0 + p.d && p.v0 < bot);
            if (!hit) { lane = c; break; }
          }
          if (lane === null) { ok = false; break; }
          if (top - cv > 1) segs.push({ u: cu, v: cv, w: pw, d: top - cv });
          const jlo = Math.min(cu, lane), jhi = Math.max(cu, lane) + pw;
          segs.push({ u: jlo, v: top - pw, w: jhi - jlo, d: pw });
          segs.push({ u: lane, v: top, w: pw, d: bot - top });
          segs.push({ u: jlo, v: bot, w: jhi - jlo, d: pw });
          cv = bot + pw;
          if (cv >= v1) { ok = false; break; }
        }
        if (!ok) continue;
        if (v1 - cv > 1) segs.push({ u: cu, v: cv, w: pw, d: v1 - cv });

        const bad = segs.some(s => {
          const poly = rectPoly(s.u, s.v, s.w, s.d);
          if (!insideRing(poly, pad)) return true;
          return placedRects.some(p =>
            s.u < p.u0 + p.w && p.u0 < s.u + s.w && s.v < p.v0 + p.d && p.v0 < s.v + s.d);
        });
        if (bad) continue;
        for (const s of segs) {
          const vertical = s.d >= s.w;
          out.paths.push({
            kind: vertical ? 'cross' : 'crossjog',
            points: rectPoly(s.u, s.v, s.w, s.d),
          });
        }
        made++;
      }
    }
  }

  // ---- green edge around the boundary ------------------------------------
  if (rules.greenery > 0 && rules.perimeter > 80) {
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

  // Any strip left between the last row and the far facility band takes panel
  // tables too, which is where a park normally ends up putting its array.
  {
    const vEnd = rect.maxV - bandDepthFar - margin * 0.5;
    if (vEnd - v > 300) {
      for (const s of splitAround(rect.minU + margin, v, rect.maxU - rect.minU - margin * 2, vEnd - v)) {
        solarBeds.push({ u0: s.u, v0: s.v, w: s.w, d: s.d });
      }
    }
  }

  // ---- solar ---------------------------------------------------------------
  // Sized from the plan, not from a guessed number: demand comes from the units
  // that are actually occupied plus the buildings, roof area is used first
  // because it is already there, and panel rows in the open beds take the rest.
  // More units or a higher per-unit demand grow the array; more sun shrinks it.
  if (rules.unitKwh > 0) {
    const units = out.pitches.filter(p => p.occupied).length;
    const demand = dailyDemand({
      units, unitKwh: rules.unitKwh,
      facilities: out.facilities.map(f => f.kind),
    });
    const sun = (rules.sunHours || 42) / 10;
    const roofFacs = out.facilities.filter(f => f.height > 0);
    const roofM2 = roofFacs.reduce((s, f) => s + roofDeckArea(f.points, 0.85), 0);
    const groundM2 = solarBeds.reduce((s, b) =>
      s + Math.max(0, b.w - 120) * Math.max(0, b.d - 120) * M2, 0);
    const size = sizeArray({ demandKwh: demand.totalKwh, sunHours: sun, roofM2, groundM2 });

    // Roof arrays first, largest roof first, until the demand is covered.
    let roofLeft = size.roofM2;
    for (const f of [...roofFacs].sort((a, b) => polyArea(b.points) - polyArea(a.points))) {
      if (roofLeft <= 0) break;
      const usable = roofDeckArea(f.points, 0.85);
      if (usable <= 1) continue;
      out.solar.push({
        points: insetPolygon(f.points, 90) || f.points,
        roof: true, height: f.height, areaM2: Math.min(usable, roofLeft),
      });
      roofLeft -= usable;
    }

    // Ground array: panel tables in the open beds, nearest the buildings first.
    // A bed sits against the pad edge, so the row is clipped to the area and the
    // last row is trimmed to the area still needed — the array then tracks the
    // load instead of jumping a whole row at a time.
    let groundLeft = size.groundM2;
    for (const b of solarBeds) {
      if (groundLeft <= 0) break;
      for (const row of panelRows(b, groundLeft)) {
        const rowW = Math.min(row.w, Math.max(60, (groundLeft * 1e4) / row.d));
        const clipped = clipToConvex(pad, rectPoly(row.u, row.v, rowW, row.d));
        if (clipped.length < 3) continue;
        const areaM2 = rowW * row.d * M2;
        out.solar.push({ points: clipped, roof: false, areaM2 });
        groundLeft -= areaM2;
        if (groundLeft <= 0) break;
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

  const bedArea = out.gardens.filter(g => g.kind !== 'perimeter')
    .reduce((s, g) => s + polyArea(g.points), 0);
  const roadArea = out.roads.reduce((s, r) => s + polyArea(r.points), 0);
  const sites = out.pitches.length;

  out.stats = {
    areaM2: Math.round(polyArea(ring) * M2),
    usableM2: Math.round(polyArea(inner) * M2),
    pitches: sites,
    occupied: out.pitches.filter(p => p.occupied).length,
    facilities: out.facilities.length,
    gardenM2: Math.round(bedArea * M2),
    roadM2: Math.round(roadArea * M2),
    parkingSpaces: out.lots.reduce((s, l) => s + l.spaces, 0),
    parkingM2: Math.round(out.lots.reduce((s, l) => s + polyArea(l.points), 0) * M2),
    utilisation: polyArea(inner) > 0
      ? Math.round((sites * rules.pitchWidth * rules.pitchDepth * M2) / (polyArea(inner) * M2) * 100)
      : 0,
    aisleCount,
    paths: out.paths.length,
    squareM2: Math.round((out.squares[0] ? polyArea(out.squares[0]) : 0) * M2),
    solarKwh: out.solarPlan ? out.solarPlan.demand.totalKwh : 0,
    solarM2: out.solarPlan ? out.solarPlan.areaM2 : 0,
    solarKwp: out.solarPlan ? out.solarPlan.kwp : 0,
    solarPanels: out.solarPlan ? out.solarPlan.panels : 0,
    solarCoverage: out.solarPlan ? Math.round(out.solarPlan.coverage * 100) : 0,
    pattern,
  };

  return out;
}
