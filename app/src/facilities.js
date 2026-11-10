// Catalog of shared facilities. Every entry carries an editable footprint in
// feet; the generator treats that as the target rectangle and adapts to what
// the parcel can actually hold (dropping items and noting it when it cannot).
//
// The same file carries the budget schedule: an amenity's cost is its area, its
// construction system and its storeys, so a prefab quote, a cob build and a
// two-storey concrete shell all use one arithmetic. data/buildings.json and
// data/amenities.json hold the same records for the staging database.

const F = (id, label, group, w, h, o = {}) => ({
  id,
  label,
  group,
  w,
  h,
  minW: o.minW ?? 14,
  maxW: o.maxW ?? 220,
  minH: o.minH ?? 10,
  maxH: o.maxH ?? 180,
  default: o.default !== false,
});

export const FACILITIES = [
  // ---- grounds ------------------------------------------------------------
  F('garden', 'Community gardens', 'grounds', 120, 70, { minW: 60, minH: 40, maxW: 260, maxH: 160 }),
  F('orchard', 'Orchard rows', 'grounds', 80, 50, { minW: 40, minH: 30, maxW: 220, maxH: 140 }),
  F('dog', 'Dog park', 'grounds', 100, 60, { minW: 50, minH: 36, maxW: 180, maxH: 120 }),
  F('pool', 'Pool & deck', 'grounds', 40, 30, { minW: 24, minH: 18, maxW: 90, maxH: 70 }),
  F('playground', 'Playground', 'grounds', 50, 40, { default: false, minW: 26, minH: 22 }),
  F('court', 'Sport court', 'grounds', 60, 36, { default: false, minW: 36, minH: 24 }),
  F('picnic', 'Picnic grove', 'grounds', 60, 45, { default: false, minW: 30, minH: 24 }),
  F('firepit', 'Fire circle', 'grounds', 30, 30, { default: false, minW: 18, minH: 18 }),
  F('amphitheatre', 'Amphitheatre lawn', 'grounds', 70, 55, { default: false, minW: 40, minH: 32 }),
  F('market', 'Market pavilion', 'grounds', 45, 30, { default: false, minW: 26, minH: 20 }),
  F('ev', 'EV charging', 'grounds', 34, 22, { default: false, minW: 20, minH: 16 }),

  // ---- buildings ----------------------------------------------------------
  F('clubhouse', 'Clubhouse', 'buildings', 90, 50, { minW: 50, minH: 30, maxW: 160, maxH: 80 }),
  F('bathhouse', 'Bathhouse', 'buildings', 46, 30, { minW: 28, minH: 20 }),
  F('laundry', 'Laundry', 'buildings', 32, 24, { minW: 20, minH: 16 }),
  F('workshop', 'Workshop', 'buildings', 34, 26, { minW: 22, minH: 18 }),
  F('storage', 'Storage', 'buildings', 30, 14, { minW: 18, minH: 10 }),
  F('bike', 'Bike workshop', 'buildings', 30, 20, { default: false, minW: 18, minH: 14 }),
  F('kitchen', 'Outdoor kitchen', 'buildings', 26, 18, { default: false, minW: 16, minH: 12 }),
];

export const FACILITY_LABEL = FACILITIES.reduce((a, f) => {
  a[f.id] = f.label;
  return a;
}, {});

const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(Math.max(min, Math.min(max, n)));
};

// Accepts { id: { on, w, h } } and normalises it against the catalog.
export function readFacilities(raw = {}) {
  const out = {};
  for (const f of FACILITIES) {
    const v = raw[f.id] || {};
    out[f.id] = {
      on: v.on === undefined ? f.default !== false : !!v.on,
      w: clampNum(v.w, f.minW, f.maxW, f.w),
      h: clampNum(v.h, f.minH, f.maxH, f.h),
    };
  }
  return out;
}

// Legacy `amenities: { garden: false }` maps onto the facility toggles.
export function facilityInput(input = {}) {
  if (input.facilities) return input.facilities;
  const legacy = input.amenities || {};
  const map = {};
  for (const k of Object.keys(legacy)) map[k] = { on: !!legacy[k] };
  return map;
}

// ---- construction systems --------------------------------------------------
// Rates are staged allowances, not bids. A bid replaces the rate and keeps its
// own source and date on the amenity record.
export const BUILDING_SYSTEMS = [
  { id: 'cob', label: 'Cob', costPerSqft: 145, storyFactor: 0.08, source: 'Staged allowance', sourceUrl: '', confidence: 'placeholder', note: 'Hand-built earthen walls; labour-heavy, low material cost.' },
  { id: 'hempcrete', label: 'Hempcrete', costPerSqft: 185, storyFactor: 0.08, source: 'Staged allowance', sourceUrl: '', confidence: 'placeholder', note: 'Hemp-lime infill with a frame; needs a supplier quote for the mix and a plaster crew.' },
  { id: 'prefab-modular', label: 'Prefab modular', costPerSqft: 260, storyFactor: 0.05, source: 'Staged allowance', sourceUrl: '', confidence: 'placeholder', note: 'Factory units set on a prepared pad; rate should come with delivery and crane costs.' },
  { id: 'concrete-prefab', label: 'Concrete prefab', costPerSqft: 275, storyFactor: 0.06, source: 'Staged allowance', sourceUrl: '', confidence: 'placeholder', note: 'Precast panels or modules; confirm transport, foundation and erection separately.' },
  { id: 'stick-frame', label: 'Stick frame', costPerSqft: 195, storyFactor: 0.1, source: 'Staged allowance', sourceUrl: '', confidence: 'placeholder', note: 'Conventional wood frame; the rate assumes a simple rectangular plan.' },
  { id: 'steel', label: 'Steel frame', costPerSqft: 240, storyFactor: 0.07, source: 'Staged allowance', sourceUrl: '', confidence: 'placeholder', note: 'Workshop and storage shells; add insulation and services if the space is occupied.' },
];

export const SYSTEM_BY_ID = Object.fromEntries(BUILDING_SYSTEMS.map((s) => [s.id, s]));

// A second storey costs more than the first but not twice as much: the factor
// covers the extra structure, stair and roof work only.
export function systemRate(systemId, stories = 1) {
  const system = SYSTEM_BY_ID[systemId] || SYSTEM_BY_ID['prefab-modular'];
  const extra = Math.max(0, (Number(stories) || 1) - 1);
  return system.costPerSqft * (1 + system.storyFactor * extra);
}

export function amenityCost(item, systems = SYSTEM_BY_ID) {
  const system = systems[item.system] || systems['prefab-modular'];
  const extra = Math.max(0, (Number(item.stories) || 1) - 1);
  const rate = system.costPerSqft * (1 + system.storyFactor * extra);
  const qty = Math.max(0, Number(item.qty) || 0);
  return Math.round(item.sqft * rate * qty);
}

export function amenityArea(item) {
  return (Number(item.sqft) || 0) * Math.max(0, Number(item.qty) || 0);
}

// The complete amenity list for a co-op village. Quantity 0 means the amenity
// is catalogued but not staged in this phase, so the total only counts what is
// actually being built.
export const AMENITY_SCHEDULE = [
  { id: 'hall', label: 'Community hall', category: 'Community core', sqft: 800, system: 'cob', stories: 1, qty: 1, source: 'Staged allowance', note: 'Assembly, meetings and shared meals.' },
  { id: 'kitchen', label: 'Kitchen & prep', category: 'Community core', sqft: 200, system: 'prefab-modular', stories: 1, qty: 1, source: 'Staged allowance', note: 'Commercial-style prep and wash-up.' },
  { id: 'dining', label: 'Dining area', category: 'Community core', sqft: 300, system: 'hempcrete', stories: 1, qty: 1, source: 'Staged allowance', note: 'Covered dining beside the kitchen.' },
  { id: 'stage', label: 'Stage & lawn', category: 'Community core', sqft: 200, system: 'cob', stories: 1, qty: 1, source: 'Staged allowance', note: 'Small performance and event stage.' },
  { id: 'showers', label: 'Showers & restrooms', category: 'Utilities', sqft: 240, system: 'prefab-modular', stories: 1, qty: 1, source: 'Staged allowance', note: 'Shared sanitary block; confirm with the health department.' },
  { id: 'laundry', label: 'Laundry', category: 'Utilities', sqft: 150, system: 'prefab-modular', stories: 1, qty: 1, source: 'Staged allowance', note: 'Washer and dryer bank.' },
  { id: 'office', label: 'Office & mail', category: 'Community core', sqft: 120, system: 'stick-frame', stories: 1, qty: 1, source: 'Staged allowance', note: 'Manager desk, records and mail.' },
  { id: 'workshop', label: 'Workshop', category: 'Work', sqft: 240, system: 'steel', stories: 1, qty: 1, source: 'Staged allowance', note: 'Repair bench and tool storage.' },
  { id: 'lounge', label: 'Lounge & library', category: 'Community core', sqft: 200, system: 'hempcrete', stories: 1, qty: 1, source: 'Staged allowance', note: 'Quiet room and book exchange.' },
  { id: 'storage', label: 'Member storage', category: 'Work', sqft: 200, system: 'steel', stories: 1, qty: 1, source: 'Staged allowance', note: 'Shared bulky storage.' },
  { id: 'pavilion', label: 'Garden pavilion', category: 'Outdoor', sqft: 200, system: 'cob', stories: 1, qty: 1, source: 'Staged allowance', note: 'Shaded outdoor room.' },
  { id: 'gym', label: 'Fitness room', category: 'Wellness', sqft: 400, system: 'steel', stories: 1, qty: 0, source: 'Future phase', note: 'Catalogued; not staged in phase one.' },
  { id: 'sauna', label: 'Sauna & cold plunge', category: 'Wellness', sqft: 120, system: 'prefab-modular', stories: 1, qty: 0, source: 'Future phase', note: 'Catalogued; not staged in phase one.' },
  { id: 'pool', label: 'Pool & deck', category: 'Wellness', sqft: 600, system: 'concrete-prefab', stories: 1, qty: 0, source: 'Future phase', note: 'Water demand is a county question.' },
  { id: 'canopy', label: 'EV & shade canopy', category: 'Utilities', sqft: 400, system: 'steel', stories: 1, qty: 0, source: 'Future phase', note: 'Shade and charging over visitor parking.' },
];

export const AMENITY_KEYS = AMENITY_SCHEDULE.map((item) => item.id);
export const STAGED_AMENITIES = AMENITY_SCHEDULE.filter((item) => item.qty > 0);

export function scheduleTotal(schedule = AMENITY_SCHEDULE) {
  return schedule.reduce((total, item) => total + amenityCost(item), 0);
}

export function scheduleByCategory(schedule = AMENITY_SCHEDULE) {
  return schedule.reduce((list, item) => {
    const found = list.find((entry) => entry.category === item.category);
    const cost = amenityCost(item);
    if (found) {
      found.items.push({ ...item, cost });
      found.total += cost;
    } else {
      list.push({ category: item.category, items: [{ ...item, cost }], total: cost });
    }
    return list;
  }, []);
}

export const AMENITY_TOTAL = scheduleTotal();
export const AMENITY_AREA = STAGED_AMENITIES.reduce((total, item) => total + amenityArea(item), 0);
