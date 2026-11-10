// houseDetail.js — addDetailOnPolygon, addRoofDetail, getSidesOfPolygon, getFloorPolygonsWithHole
// Ported from HouseBuilder.cpp addDetailOnPolygon / addRoofDetail
import { v3add, v3sub, v3scale, v3norm, v3dist, rot90_3, xy, withZ, polyPolyIntersects2D, pointInPoly2D, placeRows, fillOutPolygons } from './houseGeom.js';
import { polyCenter, polyIsClockwise, getSplitProposal } from './utils.js';

export function getSidesOfPolygon(pol, type, height) {
  const sides = [], pts = pol.points;
  for (let i = 1; i <= pts.length; i++) {
    sides.push({
      points: [pts[i-1], v3sub(pts[i-1],{x:0,y:0,z:height}), v3sub(pts[i%pts.length],{x:0,y:0,z:height}), pts[i%pts.length]],
      type, overridePolygonSides: true
    });
  }
  return sides;
}

export function getFloorPolygonsWithHole(f, floorBegin, hole) {
  return [{
    points: f.points.map(p => withZ(xy(p), (p.z||0)+floorBegin)),
    type: 'floor', normal: {x:0,y:0,z:-1},
    holePoints: hole.map(p => withZ(xy(p), (p.z||0)+floorBegin))
  }];
}

function getPointDirection(pts, i) {
  const n = pts.length;
  const e1 = v3norm(v3sub(pts[i], pts[(i+n-1)%n]));
  const e2 = v3norm(v3sub(pts[(i+1)%n], pts[i]));
  return v3norm({x:-(e1.y+e2.y), y:(e1.x+e2.x), z:0});
}

function getRandomPointInPolygon(pts, rng) {
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  for (let a=0; a<20; a++) {
    const p={x:minX+rng()*(maxX-minX), y:minY+rng()*(maxY-minY)};
    if (pointInPoly2D(p, pts.map(xy))) return withZ(p, pts[0].z||0);
  }
  return withZ(polyCenter(pts.map(xy)), pts[0].z||0);
}

function addDetailOnPolygon(depth, maxDepth, maxBoxes, pol, toReturn, rng, placed, canCoverCompletely) {
  if (depth === maxDepth) return;
  const nextShapes = [];
  if (rng() < 0.6) {
    const size = 50 + rng()*450;
    const shape = {points: [...pol.points].reverse().map(p => v3add(p,{x:0,y:0,z:size}))};
    const sides = getSidesOfPolygon(shape, 'exteriorSnd', size);
    const width = 20 + rng()*130;
    sides.forEach(s => { s.width = width; });
    toReturn.pols.push(...fillOutPolygons(sides));
    toReturn.pols.push(...sides);
  }
  const offset = 100 + rng()*900;
  if (rng() < 0.3) {
    const numBoxes = Math.floor(rng()*(maxBoxes+1));
    for (let j=0; j<numBoxes; j++) {
      const boxOffset = 100 + rng()*900;
      let box=null, found=false;
      for (let c=0; c<5; c++) {
        const randPt = getRandomPointInPolygon(pol.points, rng);
        const p1 = v3add(randPt,{x:0,y:0,z:boxOffset});
        const tangent = v3norm(v3sub(pol.points[1], pol.points[0]));
        const t2 = rot90_3(tangent);
        const p2=v3add(p1,v3scale(tangent,500+rng()*2500));
        const p3=v3add(p2,v3scale(t2,500+rng()*2500));
        const p4=v3add(p3,v3scale(rot90_3(t2),v3dist(p1,p2)));
        box={points:[p1,p2,p3,p4],type:'exteriorSnd',normal:{x:0,y:0,z:-1}};
        if(!polyPolyIntersects2D(box.points.map(xy), placed.flatMap(p=>p.points?p.points.map(xy):[xy(p)]))) { found=true; break; }
      }
      if (found && box) {
        for (let i=1; i<=box.points.length; i++)
          toReturn.pols.push({points:[box.points[i-1],box.points[i%box.points.length],v3sub(box.points[i%box.points.length],{x:0,y:0,z:boxOffset}),v3sub(box.points[i-1],{x:0,y:0,z:boxOffset})],type:'exteriorSnd'});
        placed.push(box); toReturn.pols.push(box); nextShapes.push(box);
      }
    }
  } else if (rng() < 0.4 && canCoverCompletely) {
    const shape = {points: pol.points.map(p => v3add(p,{x:0,y:0,z:offset}))};
    const shapeXY = shape.points.map(xy);
    const sp = getSplitProposal(shapeXY, polyIsClockwise(shapeXY), 0.5);
    if (sp && sp.min !== -1) {
      const maxD = v3dist(sp.p1, sp.p2)/2;
      if (maxD > 150) {
        const d = 150 + rng()*(maxD-150);
        const shrunkPts = shapeXY.map((_,i2) => {
          const dir2 = v3norm(getPointDirection(shape.points, i2));
          return {x:shapeXY[i2].x+dir2.x*d, y:shapeXY[i2].y+dir2.y*d};
        });
        const ss = {points:shrunkPts.map(p=>withZ(p,shape.points[0].z)), type:'exteriorSnd', normal:{x:0,y:0,z:-1}};
        for (let i=1; i<=ss.points.length; i++)
          toReturn.pols.push({points:[ss.points[i-1],ss.points[i%ss.points.length],v3sub(ss.points[i%ss.points.length],{x:0,y:0,z:offset}),v3sub(ss.points[i-1],{x:0,y:0,z:offset})],type:'roof'});
        placed.push(ss); toReturn.pols.push(ss); nextShapes.push(ss);
      }
    }
  } else if (rng() < 0.2 && canCoverCompletely) {
    const c2d = polyCenter(pol.points.map(xy));
    if (isFinite(c2d.x) && isFinite(c2d.y)) {
      const cP = v3add(c2d, {z:(pol.points[0].z||0)+200+rng()*800});
      for (let i=1; i<=pol.points.length; i++) {
        const tri = {points:[pol.points[i-1],cP,pol.points[i%pol.points.length]],type:'roof'};
        if (tri.points.every(p=>isFinite(p.x)&&isFinite(p.y))) toReturn.pols.push(tri);
      }
      placed.push(pol);
    }
  }
  for (const s of nextShapes) addDetailOnPolygon(depth+1, maxDepth, 1, s, toReturn, rng, [], true);
}

export function addRoofDetail(roof, toReturn, rng, placed, canCoverCompletely) {
  addDetailOnPolygon(0, 2, 3, roof, toReturn, rng, placed||[], canCoverCompletely!==false);
  if (rng()<0.45) toReturn.pols.push(...placeRows(roof, rng, 'rooftop_solar', 1+Math.floor(rng()*15)));
  if (rng()<0.45) toReturn.pols.push(...placeRows(roof, rng, 'rooftop_ac',    1+Math.floor(rng()*12)));
  if (rng()<0.33) toReturn.pols.push(...placeRows(roof, rng, 'fence',         1+Math.floor(rng()*12)));
}
