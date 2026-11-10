// Simplex noise 2D - ported from SimplexNoise.cpp (Sebastien Rombauts / Stefan Gustavson)

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2 = [
  [1,1],[-1,1],[1,-1],[-1,-1],
  [1,0],[-1,0],[0,1],[0,-1]
];

export class SimplexNoise {
  constructor(seed = 0) {
    this._perm = buildPerm(seed);
  }

  noise(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = x - X0, y0 = y - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;

    const ii = i & 255, jj = j & 255;
    const p = this._perm;
    const gi0 = p[ii + p[jj]] & 7;
    const gi1 = p[ii + i1 + p[jj + j1]] & 7;
    const gi2 = p[ii + 1 + p[jj + 1]] & 7;

    const n0 = contrib(gi0, x0, y0);
    const n1 = contrib(gi1, x1, y1);
    const n2 = contrib(gi2, x2, y2);

    return 70 * (n0 + n1 + n2);
  }
}

function contrib(gi, x, y) {
  const t = 0.5 - x * x - y * y;
  if (t < 0) return 0;
  const t2 = t * t;
  const g = GRAD2[gi];
  return t2 * t2 * (g[0] * x + g[1] * y);
}

function buildPerm(seed) {
  const p = new Uint8Array(512);
  const r = mulberry32(seed >>> 0);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  return p;
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

export function seededRandom(seed) {
  return mulberry32(seed >>> 0);
}
