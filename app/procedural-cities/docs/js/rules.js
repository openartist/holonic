// rules.js — the lever set for the city generator.
// Every drawn plan is a pure function of these numbers plus the seed, so a rule
// set can be saved, diffed and shared. Coordinates are in centimetres: 100 units
// = 1 m, so areas in m² are unit² × 1e-4.

export const DEFAULTS = {
  seed: 42,
  roadLength: 420,        // accepted road segments (city extent)
  branchChance: 0.3,      // chance a main road branches into another main
  blockSize: 9000,        // road spacing in cm: 9000 = 90 m blocks
  growthScale: 0.00005,   // simplex noise scale: low = compact, high = sprawling
  streetWidth: 200,       // road width scale: 200 → 8 m main, 5 m secondary
  sidewalk: 250,          // sidewalk apron width (2.5 m)
  minPlot: 120,           // blocks smaller than this (m²) are dropped
  maxPlot: 25000,         // blocks larger than this become gardens, not lots
  lotSize: 900,           // target building footprint per piece (m²)
  minFootprint: 320,      // smallest piece worth extruding (m²)
  setback: 180,           // building setback from the lot line (1.8 m)
  pieceGap: 90,           // alley left between buildings split from one block
  minFloors: 2,
  maxFloors: 10,
  buildChance: 0.92,      // share of buildable lots that get a building
  heightNoise: 0.7,       // 0 = every lot in a size band is the same height
  downtown: 0.5,          // 0 = no height falloff, 1 = strong core-to-edge falloff
  greenery: 1,            // planting density multiplier
  maxBuildings: 260,      // hard cap so a lever sweep cannot lock the tab
};

// UI ranges: [min, max, step]
export const RANGES = {
  seed: [1, 99999, 1],
  roadLength: [80, 900, 20],
  branchChance: [0, 1, 0.05],
  blockSize: [4000, 16000, 500],
  growthScale: [0.00001, 0.00012, 0.000005],
  streetWidth: [120, 320, 10],
  sidewalk: [0, 400, 25],
  minPlot: [40, 600, 20],
  maxPlot: [2000, 30000, 500],
  lotSize: [200, 3000, 50],
  minFootprint: [80, 900, 20],
  setback: [0, 600, 20],
  pieceGap: [0, 300, 10],
  minFloors: [1, 8, 1],
  maxFloors: [2, 40, 1],
  buildChance: [0.2, 1, 0.02],
  heightNoise: [0, 1, 0.05],
  downtown: [0, 1, 0.05],
  greenery: [0, 2, 0.1],
  maxBuildings: [40, 600, 20],
};

// Presets set the whole rule set at once, the way the village generator's
// RV resort / Tiny village / Garden park buttons do.
export const PRESETS = {
  village: {
    label: 'Village',
    hint: 'Low, generous lots, gardens between the rows.',
    rules: { roadLength: 340, blockSize: 11000, growthScale: 0.00005, streetWidth: 190,
             sidewalk: 280, minPlot: 140, maxPlot: 12000, lotSize: 600, minFootprint: 320,
             setback: 260, pieceGap: 120, minFloors: 1, maxFloors: 3, buildChance: 0.85,
             downtown: 0, greenery: 1.4, heightNoise: 0.5 },
  },
  suburb: {
    label: 'Suburb',
    hint: 'Fine grain, deep setbacks, one or two storeys.',
    rules: { roadLength: 380, blockSize: 12000, growthScale: 0.00004, streetWidth: 210,
             sidewalk: 340, minPlot: 160, maxPlot: 9000, lotSize: 520, minFootprint: 320,
             setback: 340, pieceGap: 140, minFloors: 1, maxFloors: 2, buildChance: 0.8,
             downtown: 0, greenery: 1.6, heightNoise: 0.35 },
  },
  midrise: {
    label: 'Mid-rise',
    hint: 'Regular blocks with 3–10 storey perimeter buildings.',
    rules: { roadLength: 460, blockSize: 9000, growthScale: 0.00005, streetWidth: 200,
             sidewalk: 260, minPlot: 120, maxPlot: 18000, lotSize: 1000, minFootprint: 320,
             setback: 170, pieceGap: 80, minFloors: 3, maxFloors: 10, buildChance: 0.95,
             downtown: 0.45, greenery: 0.9, heightNoise: 0.7 },
  },
  downtown: {
    label: 'Downtown',
    hint: 'Dense blocks, tight setbacks, a tall core falling to the edges.',
    rules: { roadLength: 620, blockSize: 6000, growthScale: 0.00006, streetWidth: 190,
             sidewalk: 240, minPlot: 100, maxPlot: 40000, lotSize: 1500, minFootprint: 400,
             setback: 80, pieceGap: 60, minFloors: 4, maxFloors: 30, buildChance: 1,
             downtown: 0.9, greenery: 0.6, heightNoise: 0.8 },
  },
  organic: {
    label: 'Organic',
    hint: 'Wandering roads, irregular blocks, lots scattered through planting.',
    rules: { roadLength: 420, blockSize: 8000, growthScale: 0.00011, streetWidth: 160,
             sidewalk: 220, minPlot: 120, maxPlot: 15000, lotSize: 800, minFootprint: 320,
             setback: 230, pieceGap: 110, minFloors: 1, maxFloors: 6, buildChance: 0.7,
             downtown: 0.2, greenery: 1.7, heightNoise: 0.9 },
  },
};

export function clampRules(input = {}) {
  const out = { ...DEFAULTS, ...input };
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    let v = Number(out[key]);
    if (!Number.isFinite(v)) v = DEFAULTS[key];
    out[key] = Math.min(max, Math.max(min, v));
  }
  out.seed = Math.round(out.seed);
  for (const key of ['minFloors', 'maxFloors', 'roadLength', 'maxBuildings']) out[key] = Math.round(out[key]);
  return out;
}

// Road generator configuration (fields the ported Spawner.cpp algorithm reads).
// Block size drives step length and how close two road midpoints may come, so
// one lever moves street spacing, block count and lot depth together.
export function cityConfig(r) {
  return {
    seed: r.seed,
    length: r.roadLength,
    noiseScale: r.growthScale,
    primaryStep: r.blockSize,
    secondaryStep: Math.round(r.blockSize * 0.68),
    changeIntensity: 5,
    secondaryChangeIntensity: 8,
    maxMainLen: 15,
    maxSecondaryLen: 8,
    mainBranchChance: r.branchChance,
    mainAdvantage: 0.1,
    standardWidth: r.streetWidth,
    maxAttach: 2000,
    mainRoadDetrimentRange: 1000000,
    mainRoadDetrimentImpact: 0.01,
    closeMiddle: Math.round(r.blockSize * 0.3),
  };
}

export function buildConfig(r, center, centerRadius) {
  return {
    seed: r.seed,
    minFloors: Math.min(r.minFloors, r.maxFloors),
    maxFloors: Math.max(r.minFloors, r.maxFloors),
    setback: r.setback,
    pieceGap: r.pieceGap,
    buildChance: r.buildChance,
    minFootprint: r.minFootprint,
    lotSize: r.lotSize,
    maxFootprint: Math.max(r.lotSize * 2.2, r.minFootprint),
    heightNoise: r.heightNoise,
    downtown: r.downtown,
    noiseScale: 0.0002,
    center,
    centerRadius,
  };
}
