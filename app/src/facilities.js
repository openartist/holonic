// Catalog of shared facilities. Every entry carries an editable footprint in
// feet; the generator treats that as the target rectangle and adapts to what
// the parcel can actually hold (dropping items and noting it when it cannot).

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
