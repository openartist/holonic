// houseBuilder.js — main entry: getHouseInfo, buildApartmentRoom
// Ported from HouseBuilder.cpp getHouseInfo
import { polyIsClockwise, polyCenter, shrinkPoly, polySelfIntersects, polySimple, polyArea } from './utils.js';
import { seededRandom } from './noise.js';
import { placeBalcony } from './roomFeatures.js';
import { v3add, v3sub, v3scale, v3norm, v3dist, rot90_3, xy, withZ, polyPolyIntersects2D, pointInPoly2D, placeSigns, fillOutPolygons, fillOutPolygon } from './houseGeom.js';
import { getShaftHolePolygon, makeInteresting, potentiallyShrink, getInteriorPlanAndPlaceEntrancePolygons, addStairInfo, addFacade } from './housePlan.js';
import { getSidesOfPolygon, getFloorPolygonsWithHole, addRoofDetail } from './houseDetail.js';
import { interiorPlanToPolygons } from './houseRooms.js';
import { buildRoomFurniture } from './roomBuilders.js';
import { placeAwnings } from './plotDecorations.js';

export { fillOutPolygon, fillOutPolygons, getShaftHolePolygon, addStairInfo, addFacade,
         getFloorPolygonsWithHole, addRoofDetail, potentiallyShrink, getInteriorPlanAndPlaceEntrancePolygons };

export const floorHeight = 400;
const makeInterestingAttempts = 4;
const maxChangeIntensity = 0.35;
const simplePlotGroundOffset = 30;

// Distance from a point to a polygon outline (cm).
function distToPoly(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 1e-9 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.min(1, Math.max(0, t));
    d = Math.min(d, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return d;
}

export function getHouseInfo(f) {
  const ptsXY = f.points.map(xy);
  const center = polyCenter(ptsXY);
  const rng = seededRandom(Math.abs(Math.floor(center.x + center.y)) >>> 0);
  const toReturn = { pols: [], meshes: [], remainingPlots: [] };

  if (!f.windows)   f.windows   = new Set(Array.from({length:f.points.length},(_,i)=>i+1));
  if (!f.entrances) f.entrances = new Set(Array.from({length:f.points.length},(_,i)=>i+1));
  if (!f.isClockwise) f.isClockwise = polyIsClockwise(ptsXY);
  if (!f.housePosition) f.housePosition = center;

  const pre = { points: f.points.map(p=>({...p})), windows: new Set(f.windows), entrances: new Set(f.entrances) };

  // The mutation helpers below splice points and move sides; with the ported
  // index arithmetic they can mangle the footprint. A mangled footprint is what
  // put interior walls and roof planes through the neighbouring building, so
  // every mutation is checked and reverted if the shape stops making sense.
  const footprintOk = (pts) => {
    const flat = pts.map(xy);
    if (flat.length < 3 || !polySimple(flat)) return false;
    const a = polyArea(flat), a0 = polyArea(pre.points.map(xy));
    if (a0 > 0 && (a > a0 * 1.02 || a < a0 * 0.3)) return false;
    return hole.every(p => pointInPoly2D(xy(p), flat));
  };

  const holeValid = (h) => h && !polyPolyIntersects2D(h.map(xy), ptsXY) && h.every(p => pointInPoly2D(xy(p), ptsXY));
  let hole = getShaftHolePolygon(f, rng, false);
  if (!holeValid(hole)) hole = getShaftHolePolygon(f, rng, true);
  if (!holeValid(hole)) hole = getShaftHolePolygon(f, rng, true, 0.6);
  if (!holeValid(hole)) hole = getShaftHolePolygon(f, rng, true, 0.35);
  if (!holeValid(hole)) hole = getShaftHolePolygon(f, rng, true, 0.18);
  if (!holeValid(hole)) {
    toReturn.remainingPlots.push({ pol: { points: f.points.map(p => withZ(xy(p), simplePlotGroundOffset)) }, type: f.simplePlotType || 'undecided' });
    return toReturn;
  }

  if (f.canBeModified !== false) {
    for (let i = 0; i < makeInterestingAttempts; i++) {
      const before = f.points.map(p => ({ ...p }));
      makeInteresting(f, toReturn.remainingPlots, hole, rng);
      if (!footprintOk(f.points)) f.points = before;
    }
  }

  const floors = Math.max(1, f.height || 3);
  const myChangeIntensity = rng() * maxChangeIntensity;
  const windowChangeCutoff = 1 + Math.floor(rng() * 20);
  let currentWindowType = Math.floor(rng() * 4);
  const roofAccess = rng() < 0.35, horizontalFacade = rng() < 0.15;
  const unchangingCPSeed = Math.abs(Math.floor(rng() * 2147483647)) >>> 0;
  const makeUnchangingCP = () => seededRandom(unchangingCPSeed);
  const specMaxApartmentSize = 200 * 200;
  const isRestaurantOrStore = rng() < 0.5;

  const groundRooms = getInteriorPlanAndPlaceEntrancePolygons(f, hole, true, 300, rng, toReturn.pols, specMaxApartmentSize);
  const hasInterior = groundRooms.length > 0;
  for (const p of groundRooms) {
    p.windowType = 0;
    if (p.windows && p.windows.size > 0 && f.type === 'apartment') {
      for (const wi of p.windows) p.entrances.add(wi);
      if (isRestaurantOrStore)
        for (const i of p.windows) { const pp1=p.points[i-1],pp2=p.points[i%p.points.length]; if(pp1&&pp2&&v3dist(pp1,pp2)>150) p.entrances.add(i); }
    }
    toReturn.pols.push(...placeSigns(p, rng));
    const ri = buildApartmentRoom(p, 0, rng, false);
    toReturn.pols.push(...ri.pols);
  }

  addStairInfo(toReturn, floorHeight * floors, hole);
  if (!hasInterior)
    toReturn.pols.push(...getSidesOfPolygon({points:f.points.map(p=>withZ(xy(p),floorHeight*floors))},'exterior',floorHeight*floors));
  toReturn.pols.push({ points: f.points.map(p => withZ(xy(p), 0)), type: 'floor' });

  for (let i = 1; i < floors; i++) {
    if (i === windowChangeCutoff) currentWindowType = Math.floor(rng() * 4);
    if (rng() < myChangeIntensity && f.canBeModified !== false) {
      const beforePts = f.points.map(p => ({ ...p }));
      const beforePols = toReturn.pols.length;
      toReturn.pols.push(...potentiallyShrink(f, hole, rng, {x:0,y:0,z:floorHeight*i+1}));
      if (!footprintOk(f.points)) {
        f.points = beforePts;
        toReturn.pols.length = beforePols;
      }
    }
    toReturn.pols.push(...getFloorPolygonsWithHole(f, floorHeight*i+1, hole));
    if (horizontalFacade) addFacade(f, toReturn, floorHeight*i-50, 70, 20);
    const upperRooms = getInteriorPlanAndPlaceEntrancePolygons(f, hole, false, 300, rng, toReturn.pols, specMaxApartmentSize);
    const ucRng = makeUnchangingCP();
    for (const p of upperRooms) {
      p.windowType = currentWindowType;
      const ri = buildApartmentRoom(p, i, ucRng, rng() < 0.2);
      const off = {x:0,y:0,z:floorHeight*i};
      ri.pols = ri.pols.map(pol => ({
        ...pol, points: pol.points.map(pt => v3add(pt, off)),
        ...(pol.windows?{windows:pol.windows.map(w=>({...w,points:w.points.map(pt=>v3add(pt,off))}))}:{}),
        ...(pol.holePoints?{holePoints:pol.holePoints.map(pt=>v3add(pt,off))}:{}),
      }));
      toReturn.pols.push(...ri.pols);
    }
  }

  toReturn.pols.push(...fillOutPolygons(toReturn.pols));

  const validPt = p => p && isFinite(p.x) && isFinite(p.y);
  toReturn.pols = toReturn.pols.filter(p => p.points && p.points.length >= 3 && p.points.every(validPt));

  const roofPol = { points: f.points.map(p=>withZ(xy(p),floorHeight*floors+1)), type:'roof', normal:{x:0,y:0,z:-1} };
  const placed = [];
  if (roofAccess) {
    const newRoof = getFloorPolygonsWithHole(f, floorHeight*floors+1, hole);
    for (const a of newRoof) { a.type='roof'; a.overridePolygonSides=true; }
    toReturn.pols.push(...newRoof);
    const boxRoof = { points:[...hole].reverse().map(p=>withZ(xy(p),floorHeight*(floors+1)+1)), type:'exterior', normal:{x:0,y:0,z:-1} };
    toReturn.pols.push(...getSidesOfPolygon(boxRoof,'exterior',floorHeight));
    toReturn.pols.push(boxRoof); placed.push(boxRoof);
  } else {
    toReturn.pols.push(roofPol);
  }

  addRoofDetail(roofPol, toReturn, rng, placed, !roofAccess);

  const isValidPt = p => p && isFinite(p.x) && isFinite(p.y);
  toReturn.pols = toReturn.pols.filter(p => p.points && p.points.length >= 3 && p.points.every(isValidPt));
  f.points = pre.points; f.windows = pre.windows; f.entrances = pre.entrances;

  // Belt and braces: a structural polygon (wall, floor, roof, furniture) that
  // ends up outside the building it belongs to is visible as a slab passing
  // through the neighbour, so clamp those types to the footprint. Windows,
  // balconies and awnings are meant to overhang and are left alone.
  const structural = new Set(['interior', 'exterior', 'exteriorSnd', 'floor', 'roof', 'furniture']);
  const footXY = pre.points.map(xy);
  toReturn.pols = toReturn.pols.filter(pol => {
    if (!structural.has(pol.type || '')) return true;
    for (const p of pol.points) {
      const q = xy(p);
      if (!pointInPoly2D(q, footXY) && distToPoly(q, footXY) > 50) return false;
    }
    return true;
  });

  return toReturn;
}

function buildApartmentRoom(room, floorIdx, rng, potentialBalcony) {
  const pols = [], windowDensity=0.003, windowHeight=200, windowWidth=120;
  if (potentialBalcony && floorIdx > 0 && room.windows && room.windows.size > 0) {
    for (const place of room.windows) {
      const p1=room.points[place-1], p2=room.points[place%room.points.length];
      if (p1 && p2 && v3dist(p1,p2) > 200) { pols.push(...placeBalcony(room.points, place)); break; }
    }
  }
  pols.push(...interiorPlanToPolygons([room], floorHeight, windowDensity, windowHeight, windowWidth, floorIdx, false, true));
  if (floorIdx === 0 && room.type) {
    const furniture = buildRoomFurniture(room.points, room.type, rng);
    for (const f of furniture) pols.push(f);
  }
  if (floorIdx === 0 && room.windows && room.windows.size > 0 && rng() < 0.3) {
    pols.push(...placeAwnings(room.points, room.windows));
  }
  return { pols, meshes: [] };
}
