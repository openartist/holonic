// decalZ.js — the height of each flat overlay, in centimetres above the site.
//
// Everything the park and village renderer draws flat (grass, beds, roads, pads,
// paths, painted stripes, water) is a decal stacked on the same ground. When two
// of those surfaces are a centimetre apart the depth buffer cannot separate them
// and they flicker as the camera moves, so the ladder below keeps a real gap
// between anything that can overlap — at least 4 cm, more where a decal sits on
// a decal. `tools/park-check.mjs` asserts the ordering, so a future edit cannot
// quietly reintroduce coplanar surfaces.
export const DECAL_Z = {
  grass: 4,
  bedSoil: 10,
  pondShore: 10,
  greenEdge: 12,
  court: 14,
  orchard: 14,
  vegSoil: 14,
  allotment: 22,
  road: 28,
  poolDeck: 32,
  pad: 34,
  playgroundSand: 34,
  lot: 37,          // car-park asphalt, over the paving but under the paint
  pondWater: 36,
  path: 40,
  stripe: 46,
  poolWater: 46,
};
