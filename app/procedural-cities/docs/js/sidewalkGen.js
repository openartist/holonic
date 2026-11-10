// sidewalkGen.js — 1:1 port of PlotBuilder.cpp getSideWalkPolygons + generateSidewalkPolygon
import { add, sub, scale, normalize, rot90, rot270 } from './utils.js';
import { getSidewalkDecorations } from './roomFeatures.js';
import { seededRandom } from './noise.js';

// getNormal matches C++ getNormal(p1,p2,right): right=true -> rot90 of tangent (FRotator 0,90,0)
function getNormal(p1, p2, right) {
  const t = normalize(sub(p2, p1));
  return right ? rot90(t) : rot270(t);
}

// getSidesOfPolygon: generate 4 side quads dropping from polygon at height z down by `height`
function getSidesOfPolygon(pts, type, z, height) {
  const sides = [];
  if (!pts || pts.length < 2) return sides;
  if (pts.some(p => !p || p.x == null)) return sides;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i+1)%n];
    sides.push({
      points: [
        { x: a.x, y: a.y, z },
        { x: b.x, y: b.y, z },
        { x: b.x, y: b.y, z: z - height },
        { x: a.x, y: a.y, z: z - height },
      ],
      type
    });
  }
  return sides;
}

// C++ getSideWalkPolygons(FPlotPolygon p, float width)
// endWidth=40, endHeight=40
// per edge i (1-based, wrapping):
//   normal = getNormal(p1, p2, !isClockwise)
//   flat strip current: p1,p2,p2+width*n,p1+width*n  at z=30
//   curb outer top: p2+width*n, p2+(width+endWidth)*n, p1+(width+endWidth)*n, p1+width*n  at z=endHeight(=40, absolute)
//   getSidesOfPolygon(curb outer, concrete, endHeight, endHeight)
//   if i!=1: corner triangle at z=30: prevP1, p1+width*n, prevP2
//   prevP1 = p2, prevP2 = p2+width*n
//   (then add current)
// After loop: closing corner + closing outer corner
export function getSideWalkPolygons(plot, width) {
  if (!plot) return [];
  if (width === undefined) width = 500;
  const pols = [];
  const pts = Array.isArray(plot) ? plot : (plot.points || plot);
  if (!pts || pts.length < 3) return pols;
  const n = pts.length;
  const isClockwise = (Array.isArray(plot) ? plot.isClockwise : plot.isClockwise) ?? true;

  const endWidth  = 40;
  const endHeight = 40;

  let prevP1 = null; // = previous p2 (2D)
  let prevP2 = null; // = previous p2 + width*normal (2D)

  for (let i = 1; i <= n; i++) {
    const p1 = pts[i-1];
    const p2 = pts[i % n];
    if (!p1 || !p2 || p1.x == null || p2.x == null) continue;

    const normal = getNormal(p1, p2, !isClockwise);

    // flat sidewalk strip at z=30
    const current = {
      points: [
        { x: p1.x, y: p1.y, z: 30 },
        { x: p2.x, y: p2.y, z: 30 },
        { x: p2.x + width*normal.x, y: p2.y + width*normal.y, z: 30 },
        { x: p1.x + width*normal.x, y: p1.y + width*normal.y, z: 30 },
      ],
      type: 'concrete'
    };

    // outer curb top at z=endHeight (C++: offset(0,0,endHeight))
    const curbPts2D = [
      { x: p2.x + width*normal.x,          y: p2.y + width*normal.y          },
      { x: p2.x + (width+endWidth)*normal.x, y: p2.y + (width+endWidth)*normal.y },
      { x: p1.x + (width+endWidth)*normal.x, y: p1.y + (width+endWidth)*normal.y },
      { x: p1.x + width*normal.x,            y: p1.y + width*normal.y            },
    ];
    const currentOuterLine = {
      points: curbPts2D.map(p => ({ x: p.x, y: p.y, z: endHeight })),
      type: 'concrete'
    };
    pols.push(...getSidesOfPolygon(curbPts2D, 'concrete', endHeight, endHeight));
    pols.push(currentOuterLine);

    if (i !== 1) {
      // corner triangle at z=30
      pols.push({
        points: [
          { x: prevP1.x, y: prevP1.y, z: 30 },
          { x: p1.x + width*normal.x, y: p1.y + width*normal.y, z: 30 },
          { x: prevP2.x, y: prevP2.y, z: 30 },
        ],
        type: 'concrete'
      });

      // outer corner at z=endHeight
      const otherTan = normalize(sub(prevP2, prevP1));
      const cornerOuter = {
        points: [
          { x: prevP2.x, y: prevP2.y, z: endHeight },
          { x: p1.x + width*normal.x, y: p1.y + width*normal.y, z: endHeight },
          { x: p1.x + (width+endWidth)*normal.x, y: p1.y + (width+endWidth)*normal.y, z: endHeight },
          { x: prevP2.x + endWidth*otherTan.x, y: prevP2.y + endWidth*otherTan.y, z: endHeight },
        ],
        type: 'concrete'
      };
      const cornerOuter2D = cornerOuter.points.map(p => ({ x: p.x, y: p.y }));
      pols.push(...getSidesOfPolygon(cornerOuter2D, 'concrete', endHeight, endHeight));
      pols.push(cornerOuter);
    }

    prevP1 = { x: p2.x, y: p2.y };
    prevP2 = { x: p2.x + width*normal.x, y: p2.y + width*normal.y };
    pols.push(current);
  }

  // closing corner (between last edge and first edge)
  const normal0 = getNormal(pts[n-1], pts[0], isClockwise); // C++: getNormal(pts[1], pts[0], isClockwise) but that's pts[n-1]->pts[0]
  // C++ line 351: FVector normal = getNormal(p.points[1], p.points[0], p.isClockwise)
  // That means p1=pts[1], p2=pts[0], right=isClockwise
  const normalClose = getNormal(pts[1], pts[0], isClockwise);
  const p0inner = { x: pts[0].x + width*normalClose.x, y: pts[0].y + width*normalClose.y };

  pols.push({
    points: [
      { x: p0inner.x, y: p0inner.y, z: 30 },
      { x: prevP2.x,  y: prevP2.y,  z: 30 },
      { x: prevP1.x,  y: prevP1.y,  z: 30 },
    ],
    type: 'concrete'
  });

  const otherTanClose = normalize(sub(prevP2, prevP1));
  const closingOuter = {
    points: [
      { x: prevP2.x, y: prevP2.y, z: endHeight },
      { x: p0inner.x, y: p0inner.y, z: endHeight },
      { x: pts[0].x + (width+endWidth)*normalClose.x, y: pts[0].y + (width+endWidth)*normalClose.y, z: endHeight },
      { x: prevP2.x + endWidth*otherTanClose.x, y: prevP2.y + endWidth*otherTanClose.y, z: endHeight },
    ],
    type: 'concrete'
  };
  const closingOuter2D = closingOuter.points.map(p => ({ x: p.x, y: p.y }));
  pols.push(...getSidesOfPolygon(closingOuter2D, 'concrete', endHeight, endHeight));
  pols.push(closingOuter);

  return pols;
}

// C++ generateSidewalkPolygon(FPlotPolygon p, float offsetSize)
// Shrinks plot polygon inward by offsetSize, returns points at z=30
export function generateSidewalkPolygon(plot, offsetSize) {
  if (offsetSize === undefined) offsetSize = 500;
  const pts = Array.isArray(plot) ? plot : plot.points;
  const isOpen = Array.isArray(plot) ? plot.open : plot.open;
  const isClockwise = (Array.isArray(plot) ? plot.isClockwise : plot.isClockwise) ?? true;

  if (isOpen) return null;
  if (!pts || pts.length < 3) return null;

  const result = [];
  for (let i = 1; i < pts.length; i++) {
    const tangent = normalize(sub(pts[i], pts[i-1]));
    const offset = isClockwise
      ? { x:  tangent.y * offsetSize, y: -tangent.x * offsetSize }  // rot270
      : { x: -tangent.y * offsetSize, y:  tangent.x * offsetSize }; // rot90
    result.push({ x: pts[i-1].x + offset.x, y: pts[i-1].y + offset.y, z: 30 });
    result.push({ x: pts[i].x   + offset.x, y: pts[i].y   + offset.y, z: 30 });
  }
  if (!isOpen && result.length > 1) {
    result.push({ ...result[1] });
  }
  return result;
}

// Returns sidewalk polygons + street decorations (trees, lamp posts)
export function getSidewalkWithDecorations(plot, width) {
  const pols = getSideWalkPolygons(plot, width);
  const pts = Array.isArray(plot) ? plot : (plot.points || plot);
  const isClockwise = (Array.isArray(plot) ? plot.isClockwise : plot.isClockwise) ?? true;
  if (!pts || pts.length < 3) return pols;
  const seed = Math.abs(Math.floor((pts[0].x || 0) * 1000 + (pts[0].y || 0))) >>> 0;
  const rng = seededRandom(seed);
  const decorations = getSidewalkDecorations(pts, isClockwise, rng);
  return [...pols, ...decorations];
}
