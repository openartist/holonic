// parking.js — a car park drawn as a car park.
//
// Two rows of bays either side of an access aisle, with the dividers painted, so
// the spaces are legible on the plan instead of being implied by a grey slab.
// Both engines use these numbers, so a bay is the same size whether it is in the
// RV park or the eco village: 2.5 m wide, 5 m deep, off a 6.5 m two-way aisle.

export const BAY = 250;        // bay width, cm
export const BAY_D = 500;      // bay depth, cm
export const LOT_AISLE = 650;  // aisle between the two rows, cm
export const LOT_END = 120;    // painted end margin, cm

export function lotSize(bays) {
  const n = Math.max(1, Math.round(bays));
  return { w: n * BAY + LOT_END * 2, d: BAY_D * 2 + LOT_AISLE };
}

// `rectPoly(u0, v0, w, d)` comes from the caller, so the lot inherits the
// generator's own axes rather than being forced onto the page axes.
export function lotPlan({ u0, v0, bays, rectPoly, spaces = null }) {
  const n = Math.max(1, Math.round(bays));
  const { w, d } = lotSize(n);
  const stripes = [];
  for (const rv of [v0, v0 + BAY_D + LOT_AISLE]) {
    for (let i = 0; i <= n; i++) {
      // 14 cm of paint, stopped short of the row ends so it reads as lining.
      stripes.push(rectPoly(u0 + LOT_END + i * BAY - 7, rv + 25, 14, BAY_D - 50));
    }
  }
  return {
    points: rectPoly(u0, v0, w, d),
    stripes, w, d, bays: n,
    spaces: spaces == null ? n * 2 : Math.max(0, Math.round(spaces)),
  };
}
