// Small deterministic PRNG so a seed always reproduces the same village.

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(String(seed))) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng, a, b) => a + (b - a) * rng();
export const int = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());
export const chance = (rng, p) => rng() < p;
export const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ADJ = ['Alder', 'Amber', 'Birch', 'Cedar', 'Clover', 'Copper', 'Dogwood', 'Ember',
  'Fern', 'Flint', 'Hazel', 'Hollow', 'Iris', 'Juniper', 'Kestrel', 'Laurel', 'Linden',
  'Maple', 'Meadow', 'Moss', 'Olive', 'Pine', 'Quarry', 'Rowan', 'Sage', 'Sorrel',
  'Spruce', 'Tamarack', 'Thistle', 'Willow', 'Yarrow', 'Zephyr'];
const NOUN = ['Bend', 'Court', 'Crossing', 'Grove', 'Hollow', 'Landing', 'Loop', 'Meadow',
  'Nook', 'Orchard', 'Rise', 'Row', 'Terrace', 'Trail', 'Walk', 'Way'];

export function seedPhrase(rng) {
  const a = pick(rng, ADJ).toLowerCase();
  const b = pick(rng, NOUN).toLowerCase();
  return `${a}-${b}-${int(rng, 10, 99)}`;
}

export { ADJ as STREET_ADJ, NOUN as STREET_NOUN };
