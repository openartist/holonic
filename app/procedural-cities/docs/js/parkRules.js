// parkRules.js — the lever set for the RV / motorhome park layout.
// Same contract as rules.js: every plan is a pure function of these numbers
// plus the seed, and one drawing unit is one centimetre (100 units = 1 m).

export const PARK_PATTERNS = ['rows', 'stagger', 'courts', 'clusters'];
// The eco village runs on villageGen.js — same area, different engine.
export const VILLAGE_PATTERN = 'village';

export const PARK_DEFAULTS = {
  seed: 42,
  areaShape: 'rect',      // rect | lshape | oval | custom (a drawn boundary)
  pattern: 'auto',        // auto picks one of PARK_PATTERNS from the seed
  areaWidth: 18000,       // 180 m across
  areaDepth: 12000,       // 120 m deep
  areaRotation: 0,        // degrees
  perimeter: 500,         // planting/green edge held back from the boundary
  driveWidth: 700,        // perimeter drive: the ring every aisle ends on (0 = none)
  // Eco village geometry (pattern: 'village').
  villageClusters: 5,     // cottage clusters
  villageHouses: 6,       // cottages per cluster
  houseWidth: 760,        // cottage frontage
  houseDepth: 980,        // cottage depth
  houseStoreys: 1,        // 1 or 2
  courtRadius: 950,       // shared green at the centre of a cluster
  plotDepth: 360,         // private plot behind each cottage
  wobble: 220,            // how irregular the loop roads are
  roadWidth: 460,
  pathWidth: 150,
  crossEvery: 5,          // every Nth site column becomes a pedestrian cross corridor (0 = none)
  squareWidth: 2400,      // civic square width (0 = no square); depth is 0.68 of it
  parkRatio: 5,           // car-park spaces per site × 10 (0 = no car park)
  unitKwh: 8,             // daily electricity per unit; sizes the solar array (0 = no array)
  sunHours: 42,           // peak sun hours per day × 10, for the array calculator
  pitchWidth: 950,        // 9.5 m site frontage
  pitchDepth: 1600,       // 16 m site depth (motorhome + tow vehicle)
  pitchGap: 100,          // hedge strip between neighbouring sites
  aisleWidth: 700,        // drive aisle between rows
  rowPairs: 2,            // back-to-back rows either side of one aisle
  jitter: 40,             // sideways shuffle of each site, cm
  variety: 0.7,           // 0 = one motorhome repeated, 1 = full vehicle mix
  fillChance: 0.94,       // share of sites occupied
  maxPitches: 140,
  padSetback: 120,        // hardstanding inset inside the site
  facilityShare: 0.42,    // share of the entrance frontage given to facilities
  gardenDepth: 320,       // planting bed between back-to-back rows
  greenery: 1,
};

export const PARK_RANGES = {
  seed: [1, 99999, 1],
  areaWidth: [8000, 40000, 500],
  areaDepth: [6000, 30000, 500],
  areaRotation: [0, 90, 1],
  perimeter: [0, 1200, 50],
  driveWidth: [0, 1400, 50],
  villageClusters: [1, 10, 1],
  villageHouses: [3, 12, 1],
  houseWidth: [600, 1300, 20],
  houseDepth: [700, 1600, 20],
  houseStoreys: [1, 2, 1],
  courtRadius: [400, 1800, 50],
  plotDepth: [0, 700, 20],
  wobble: [0, 600, 20],
  roadWidth: [300, 700, 20],
  pathWidth: [90, 260, 10],
  crossEvery: [0, 12, 1],
  squareWidth: [0, 5000, 100],
  parkRatio: [0, 20, 1],
  unitKwh: [0, 24, 1],
  sunHours: [25, 65, 1],
  pitchWidth: [700, 1500, 50],
  pitchDepth: [1000, 2200, 50],
  pitchGap: [0, 400, 10],
  aisleWidth: [500, 1000, 25],
  rowPairs: [1, 2, 1],
  jitter: [0, 140, 10],
  variety: [0, 1, 0.05],
  fillChance: [0.3, 1, 0.02],
  maxPitches: [20, 320, 10],
  padSetback: [0, 400, 20],
  facilityShare: [0, 0.7, 0.02],
  gardenDepth: [0, 900, 20],
  greenery: [0, 2, 0.1],
};

export const PARK_PRESETS = {
  motorhome: {
    label: 'Motorhome',
    hint: 'Deep hardstanding, back-to-back rows, clubhouse and services at the gate.',
    rules: { pattern: 'auto', pitchWidth: 950, pitchDepth: 1700, pitchGap: 100, aisleWidth: 700,
             rowPairs: 2, perimeter: 500, facilityShare: 0.42, gardenDepth: 320, greenery: 1,
             jitter: 40, variety: 0.7, fillChance: 0.94, padSetback: 120 },
  },
  caravan: {
    label: 'Caravan',
    hint: 'Tighter pitches, narrower aisles, more of them in unbroken rows.',
    rules: { pattern: 'rows', pitchWidth: 800, pitchDepth: 1350, pitchGap: 60, aisleWidth: 600,
             rowPairs: 2, perimeter: 400, facilityShare: 0.16, gardenDepth: 240, greenery: 0.9,
             jitter: 10, variety: 0.55, fillChance: 0.96, padSetback: 100 },
  },
  resort: {
    label: 'Resort',
    hint: 'Big pitches, single staggered rows, pool and amenities taking a third of the front.',
    rules: { pattern: 'stagger', pitchWidth: 1150, pitchDepth: 1900, pitchGap: 180, aisleWidth: 780,
             rowPairs: 1, perimeter: 650, facilityShare: 0.36, gardenDepth: 450, greenery: 1.5,
             jitter: 70, variety: 0.9, fillChance: 0.9, padSetback: 160 },
  },
  rustic: {
    label: 'Rustic',
    hint: 'Loose clusters with wide planting breaks, low occupancy, gardens everywhere.',
    rules: { pattern: 'clusters', pitchWidth: 1300, pitchDepth: 2100, pitchGap: 300, aisleWidth: 560,
             rowPairs: 1, perimeter: 900, facilityShare: 0.1, gardenDepth: 600, greenery: 1.9,
             jitter: 110, variety: 0.85, fillChance: 0.6, padSetback: 180 },
  },
};

export function clampParkRules(input = {}) {
  const out = { ...PARK_DEFAULTS, ...input };
  for (const [key, [min, max]] of Object.entries(PARK_RANGES)) {
    let v = Number(out[key]);
    if (!Number.isFinite(v)) v = PARK_DEFAULTS[key];
    out[key] = Math.min(max, Math.max(min, v));
  }
  out.seed = Math.round(out.seed);
  for (const key of ['rowPairs', 'maxPitches', 'areaRotation', 'perimeter', 'driveWidth', 'jitter',
                     'villageClusters', 'villageHouses', 'houseStoreys', 'houseWidth',
                     'houseDepth', 'courtRadius', 'plotDepth', 'wobble', 'roadWidth', 'pathWidth',
                     'crossEvery', 'squareWidth', 'parkRatio', 'unitKwh', 'sunHours']) {
    out[key] = Math.round(out[key]);
  }
  if (!['rect', 'lshape', 'oval', 'custom'].includes(out.areaShape)) out.areaShape = 'rect';
  if (out.pattern !== 'auto' && out.pattern !== VILLAGE_PATTERN && !PARK_PATTERNS.includes(out.pattern)) {
    out.pattern = 'auto';
  }
  return out;
}
