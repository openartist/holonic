// buildingGen.js — plot subdivision and massing.
//
// Ported from PlotBuilder::recursiveSplit / getHeight, but with the area scale
// corrected to metres squared. The original port used the Unreal "getArea()"
// units (raw units² × 0.0001) as if they were absolute, which made every real
// block look 100× too large: blocks over ~480 m² were thrown away and accepted
// pieces were 12 m² footprints extruded to thirty floors. Here:
//   1 unit = 1 cm, so 1 unit² = 1e-4 m², and every threshold is in m².
import { polyArea, polyIsClockwise, polyCenter, splitPolygonAlongMax, cleanPolygon, polySimple, insetPolygon } from './utils.js';
import { seededRandom, SimplexNoise } from './noise.js';

const UNIT2_TO_M2 = 1e-4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function areaM2(pts) { return polyArea(pts) * UNIT2_TO_M2; }

function longestEdge(pts) {
  let m = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    m = Math.max(m, Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y));
  }
  return m;
}

function shortestEdge(pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    m = Math.min(m, Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y));
  }
  return m;
}

function finite(pts) { return pts.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)); }

// A piece is worth a building only if it is simple, not a sliver, large enough
// to hold the 12 m × 16 m stair core the interior planner needs, and not
// folded on itself (folded footprints extrude into the neighbouring lot).
function pieceValid(pts, cfg) {
  if (!pts || pts.length < 3 || pts.length > 48) return false;
  if (!finite(pts)) return false;
  const a2 = polyArea(pts);
  if (a2 * UNIT2_TO_M2 < cfg.minFootprint) return false;
  if (shortestEdge(pts) < 120) return false;            // < 1.2 m stub
  if (longestEdge(pts) > 3.4 * Math.sqrt(a2)) return false; // sliver / tail
  if (!polySimple(pts)) return false;
  return true;
}

function splitPieces(pts, cfg, depth = 0) {
  if (!pieceValid(pts, cfg)) return [];
  if (areaM2(pts) <= cfg.lotSize || depth >= 3) return [pts];

  const [remaining, fresh] = splitPolygonAlongMax(pts);
  if (!remaining || !fresh) return [pts];
  const total = polyArea(pts);
  if (polyArea(remaining) >= total * 0.98 || polyArea(fresh) >= total * 0.98) return [pts];

  const out = [];
  for (const part of [remaining, fresh]) {
    if (!part || part.length < 3) continue;
    if (areaM2(part) > cfg.lotSize) out.push(...splitPieces(part, cfg, depth + 1));
    else out.push(part);
  }
  return out.filter(p => pieceValid(p, cfg));
}

// Floors: bigger footprints can carry more storeys, noise roughens the skyline,
// and `downtown` pulls height toward the middle of the road network.
function floorsFor(piece, cfg, noise) {
  const area = areaM2(piece);
  const side = Math.sqrt(area);
  const sizeFactor = clamp((side - 10) / 34, 0, 1);          // 10 m lot → 0, 44 m → 1
  const range = cfg.maxFloors - cfg.minFloors;
  const base = cfg.minFloors + range * (0.16 + 0.64 * sizeFactor);

  const cen = polyCenter(piece);
  const n = noise.noise(cen.x * cfg.noiseScale, cen.y * cfg.noiseScale); // -1..1
  const jitter = 1 - cfg.heightNoise + cfg.heightNoise * (n * 0.5 + 0.5);

  let core = 1;
  if (cfg.downtown > 0 && cfg.center) {
    const d = Math.hypot(cen.x - cfg.center.x, cen.y - cfg.center.y);
    const reach = cfg.centerRadius || 12000;
    core = 1 + cfg.downtown * (1 - clamp(d / reach, 0, 1)) * 0.9;
  }

  return clamp(Math.round(base * jitter * core), cfg.minFloors, cfg.maxFloors);
}

export function generateHousePolygons(plot, cfg = {}) {
  const r = {
    seed: 0, minFloors: 2, maxFloors: 10, setback: 180, pieceGap: 90,
    buildChance: 0.92, minFootprint: 320, lotSize: 1400, maxFootprint: 3200,
    heightNoise: 0.7, downtown: 0, noiseScale: 0.0002, center: null, centerRadius: 12000,
    ...cfg,
  };
  const pts = Array.isArray(plot) ? plot : plot?.points;
  const isOpen = Array.isArray(plot) ? plot.open : plot?.open;
  if (isOpen || !pts || pts.length < 3) return [];
  if (plot && plot.green) return [];        // oversized blocks stay as gardens

  const clean = cleanPolygon(
    pts.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({ x: p.x, y: p.y })),
    60,
  );
  if (clean.length < 3) return [];

  const center = polyCenter(clean);
  const seed = (Math.abs(Math.floor(center.x * 1000 + center.y)) ^ Math.imul(r.seed, 2654435761)) >>> 0;
  const rng = seededRandom(seed);
  if (rng() > r.buildChance) return [];

  // 1. Set the building back from the lot line so neighbouring lots never touch.
  const cw = polyIsClockwise(clean) ? clean : [...clean].reverse();
  // Concave blocks can fold when inset by the full setback, so ease the setback
  // back before giving up on the lot entirely.
  let inner = cw;
  if (r.setback > 0) {
    let found = false;
    for (const factor of [1, 0.6, 0.3]) {
      const shrunk = insetPolygon(cw, r.setback * factor);
      if (shrunk && pieceValid(shrunk, r)) { inner = shrunk; found = true; break; }
    }
    if (!found) return [];
  }

  // 2. Subdivide the reduced lot into building footprints.
  let pieces = splitPieces(inner, r);
  if (!pieces.length) return [];

  // 3. Leave an alley between pieces split out of the same block.
  if (r.pieceGap > 0) {
    pieces = pieces
      .map(p => insetPolygon(p, r.pieceGap))
      .filter(p => p && pieceValid(p, r));
  }
  if (!pieces.length) return [];

  const noise = new SimplexNoise(r.seed);
  const out = [];
  for (const piece of pieces) {
    const fpArea = areaM2(piece);
    if (fpArea > r.maxFootprint) continue;
    const n = piece.length;
    const edgeSet = new Set(Array.from({ length: n }, (_, i) => i + 1));
    out.push({
      points: piece,
      height: floorsFor(piece, r, noise),
      entrances: edgeSet,
      windows: new Set(edgeSet),
      isClockwise: true,
      open: false,
      footprintM2: fpArea,
    });
  }
  return out;
}
