// energy.js — sizing a solar array to the people and buildings on the plan.
//
// The park and the village ask the same question: how much electricity does this
// layout need, and how much panel area covers it? The model is deliberately small
// and exact so the audit can hold it to arithmetic: daily demand in kWh, a
// specific yield per square metre of module, roofs first, ground array for the
// rest. Units are kWh and m²; the generators work in centimetres and convert.

// Module constants. 19 % silicon modules are about 0.19 kW per m² of array, and
// a 400 W panel is roughly 1.9 m², so panel counts stay honest.
export const PANEL = {
  kwPerM2: 0.19,
  performance: 0.8,   // inverter, wiring, temperature and soiling losses
  m2PerPanel: 1.9,
};

// Daily electricity by building type, in kWh. Small park buildings, not houses.
export const FACILITY_KWH = {
  office: 28,
  amenity: 55,
  laundry: 65,
  pool: 22,
  playground: 3,
  dump: 1,
  parking: 2,
  veggarden: 2,
  orchard: 1,
  pond: 4,
};

const round1 = v => Math.round(v * 10) / 10;
const round3 = v => Math.round(v * 1000) / 1000;

export function dailyDemand({ units = 0, unitKwh = 8, facilities = [] } = {}) {
  const unitTotal = Math.max(0, units) * Math.max(0, unitKwh);
  const facilityTotal = facilities.reduce((s, k) => s + (FACILITY_KWH[k] || 0), 0);
  return {
    units: Math.max(0, units),
    unitKwh: Math.max(0, unitKwh),
    unitKwhTotal: round1(unitTotal),
    facilityKwh: round1(facilityTotal),
    totalKwh: round1(unitTotal + facilityTotal),
  };
}

// kWh delivered per m² of module per day: kW/m² × peak sun hours × losses.
export function yieldPerM2(sunHours = 4.2) {
  return PANEL.kwPerM2 * Math.max(0, sunHours) * PANEL.performance;
}

// What the demand needs, and how much of it the plan can actually carry. Roof
// area is taken first because it is already paid for; the ground array covers
// what is left, up to the land the layout can spare.
export function sizeArray({ demandKwh = 0, sunHours = 4.2, roofM2 = 0, groundM2 = 0 } = {}) {
  const perM2 = Math.max(1e-6, yieldPerM2(sunHours));
  const needed = Math.max(0, demandKwh) / perM2;
  const roof = Math.min(Math.max(0, roofM2), needed);
  const ground = Math.min(Math.max(0, groundM2), Math.max(0, needed - roof));
  const area = roof + ground;
  const coverage = needed > 0 ? Math.min(1, area / needed) : 1;
  return {
    yieldM2: round3(perM2),
    neededM2: Math.round(needed),
    roofM2: Math.round(roof),
    groundM2: Math.round(ground),
    areaM2: Math.round(area),
    kwp: round1(area * PANEL.kwPerM2),
    panels: Math.round(area / PANEL.m2PerPanel),
    coverage,
    shortfallM2: Math.max(0, Math.round(needed - area)),
    shortfallKwh: round1(Math.max(0, demandKwh) * (1 - coverage)),
  };
}

// Rows of panel tables inside a rectangle given in local coordinates. Rows run
// across the short axis with an access gap between them, which is how a ground
// array is actually laid out: 2.5 m tables, 1.2 m walkways, 60 cm to the fence.
export function panelRows(rect, targetM2, { rowDepth = 240, rowGap = 100, inset = 40 } = {}) {
  const rows = [];
  if (!rect || targetM2 <= 0) return rows;
  const w = rect.w - inset * 2;
  const d = rect.d - inset * 2;
  if (w <= 100 || d < 120) return rows;
  // A planting bed is only 3.2 m deep, so one row is trimmed to fit rather than
  // the whole bed being rejected.
  const areaEach = w * Math.min(rowDepth, d) * 1e-4;
  const max = Math.max(0, Math.floor((d + rowGap) / (rowDepth + rowGap)));
  let area = 0;
  for (let i = 0; i < max && area < targetM2 - 1e-6; i++) {
    rows.push({
      u: rect.u0 + inset,
      v: rect.v0 + inset + i * (rowDepth + rowGap),
      w,
      d: Math.min(rowDepth, d),
      areaM2: areaEach,
    });
    area += areaEach;
  }
  return rows;
}

// Panels over a whole footprint (a flat roof), inset from the parapet.
export function roofDeckArea(points, share = 0.85) {
  if (!points || points.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2) * 1e-4 * share;
}
