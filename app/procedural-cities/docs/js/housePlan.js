// housePlan.js — shaft hole, makeInteresting, potentiallyShrink, interior plan, stair, facade
// Ported from HouseBuilder.cpp
import { v3add, v3sub, v3scale, v3norm, v3dist, rot270_3, rot90_3, xy, withZ, lineIntersect3, polyPolyIntersects2D, pointInPoly2D } from './houseGeom.js';
import { shrinkPoly, polySelfIntersects, polyCenter, segIntersect, mid, polyArea, splitPolygonAlongMax } from './utils.js';

const holeSizeX = 1200, holeSizeY = 1600, corrWidth = 300;

export function getShaftHolePolygon(f, rng, useCenter, sc=1) {
  const pts = f.points;
  const t1 = v3norm(v3sub(pts[1], pts[0])), t2 = rot90_3(t1);
  let center;
  if (useCenter) {
    const c = polyCenter(pts.map(xy));
    center = {x:c.x, y:c.y, z:0};
  } else {
    const c = polyCenter(pts.map(xy));
    const cx = c.x+(rng()-0.5)*2000, cy = c.y+(rng()-0.5)*2000;
    center = pointInPoly2D({x:cx,y:cy}, pts.map(xy)) ? {x:cx,y:cy,z:0} : {x:c.x,y:c.y,z:0};
  }
  const sx=holeSizeX*sc/2, sy=holeSizeY*sc/2;
  return [
    v3add(v3add(center,v3scale(t1, sx)),v3scale(t2, sy)),
    v3add(v3add(center,v3scale(t1,-sx)),v3scale(t2, sy)),
    v3add(v3add(center,v3scale(t1,-sx)),v3scale(t2,-sy)),
    v3add(v3add(center,v3scale(t1, sx)),v3scale(t2,-sy)),
  ];
}

function linePolyIntersects(line, poly) {
  for (let i=0; i<poly.length; i++) {
    const ix = lineIntersect3(line[0],line[1],poly[i],poly[(i+1)%poly.length]);
    if (ix.x!==0||ix.y!==0) return true;
  }
  return false;
}

function attemptMoveSideInwards(fpts,fwindows,fentrances,place,centerHole,len,offset) {
  const n=fpts.length, prev2=place>1?place-2:place-2+n;
  const dir1=v3norm(v3sub(fpts[prev2%n],fpts[place-1]));
  const dir2=v3norm(v3sub(fpts[(place+1)%n],fpts[place%n]));
  const t1=v3add(fpts[place-1],v3scale(dir1,len)), t2=v3add(fpts[place%n],v3scale(dir2,len));
  if (linePolyIntersects([t1,t2],centerHole)||linePolyIntersects([t1,t2],fpts)) return null;
  const pol={points:[v3add(fpts[place%n],offset),v3add(fpts[place-1],offset),v3add(t1,offset),v3add(t2,offset)]};
  fpts[place-1]=t1; fpts[place%n]=t2; fwindows.add(place);
  return pol;
}

function attemptRemoveCorner(fpts,fwindows,fentrances,place,centerHole,offset) {
  const n=fpts.length;
  const p1=mid(xy(fpts[place-1]),xy(fpts[place%n])), p2=mid(xy(fpts[(place+1)%n]),xy(fpts[place%n]));
  const tri=[withZ(p1,0),withZ(p2,0),fpts[place%n]];
  if (linePolyIntersects([tri[0],tri[1]],centerHole)) return null;
  const pol={points:[v3add(tri[0],offset),v3add(tri[1],offset),v3add(tri[2],offset)]};
  const hadW=fwindows.has(place), hadE=fentrances.has(place);
  fpts.splice(place%n,0,withZ(p1,fpts[place%n].z||0));
  fpts.splice((place+1)%fpts.length,0,withZ(p2,0));
  fpts.splice((place+2)%fpts.length,1);
  fwindows.add(place+1); fentrances.add(place+1);
  if(hadW)fwindows.add(place); if(hadE)fentrances.add(place);
  return pol;
}

export function makeInteresting(f, plots, centerHole, rng) {
  const n=f.points.length, place=1+Math.floor(rng()*n), len=300+rng()*1200;
  if (rng()<0.2) {
    const pol=attemptMoveSideInwards(f.points,f.windows,f.entrances,place,centerHole,len,{x:0,y:0,z:30});
    if(pol&&pol.points.length>0) plots.push({pol,type:f.simplePlotType||'undecided'});
  } else if (rng()<0.15&&v3dist(f.points[place%n],f.points[place-1])>500) {
    const pol=attemptRemoveCorner(f.points,f.windows,f.entrances,place,centerHole,{x:0,y:0,z:30});
    if(pol&&pol.points.length>0) plots.push({pol,type:f.simplePlotType||'undecided'});
  } else if (rng()<0.05) {
    const shrunk=shrinkPoly(f.points.map(p=>xy(p)),150+rng()*1350);
    if(!polyPolyIntersects2D(shrunk,centerHole.map(xy))&&!polySelfIntersects(shrunk)){
      f.points=shrunk.map(p=>withZ(p,0));
      for(let i=1;i<=f.points.length;i++) f.windows.add(i);
    }
  }
}

export function potentiallyShrink(f, centerHole, rng, offset) {
  const pols=[], n=f.points.length, place=1+Math.floor(rng()*n), len=100+rng()*1000;
  if (rng()<0.25) {
    const pol=attemptMoveSideInwards(f.points,f.windows,f.entrances,place,centerHole,len,offset);
    if(pol&&pol.points.length>2) pols.push({points:pol.points,type:'roof',normal:{x:0,y:0,z:-1}});
  } else if (rng()<0.2) {
    const shrunk=shrinkPoly(f.points.map(p=>xy(p)),150+rng()*1350);
    if(!polyPolyIntersects2D(shrunk,centerHole.map(xy))&&!polySelfIntersects(shrunk)){
      pols.push({points:f.points.map(p=>withZ(xy(p),offset.z||0)),type:'roof',normal:{x:0,y:0,z:-1},holePoints:shrunk.map(p=>withZ(p,offset.z||0))});
      f.points=shrunk.map(p=>withZ(p,0));
      for(let i=1;i<=f.points.length;i++) f.windows.add(i);
    }
  } else if (rng()<0.15) {
    const pol=attemptRemoveCorner(f.points,f.windows,f.entrances,place,centerHole,offset);
    if(pol&&pol.points.length>2) pols.push({points:pol.points,type:'roof',normal:{x:0,y:0,z:-1}});
  }
  return pols;
}

function getEntrancePolygons(begin, end, height, thickness) {
  const colW=30, tan=v3norm(v3sub(end,begin));
  const dir=v3norm(rot90_3(v3sub(begin,end)));
  const b=v3add(begin,v3scale(dir,10)), e=v3add(end,v3scale(dir,10));
  return [{points:[
    v3sub(b,v3scale(tan,colW/2)), v3add(v3sub(b,v3scale(tan,colW/2)),{x:0,y:0,z:height+colW/2}),
    v3add(v3add(e,v3scale(tan,colW/2)),{x:0,y:0,z:height+colW/2}), v3add(e,v3scale(tan,colW/2)),
    v3sub(e,v3scale(tan,colW/2)), v3add(v3sub(e,v3scale(tan,colW/2)),{x:0,y:0,z:height-colW/2}),
    v3add(v3add(b,v3scale(tan,colW/2)),{x:0,y:0,z:height-colW/2}), v3add(b,v3scale(tan,colW/2)),
  ],type:'exterior',width:thickness,overridePolygonSides:true}];
}

function splitRoomsKeepingEntrancesRecursively(original, maxApartmentSize, pEntrance, depth) {
  const extra = [];
  if (depth > 2) return extra;
  const area = polyArea(original.points.map(p => ({x:p.x,y:p.y})));
  if (area > maxApartmentSize) {
    const result = splitPolygonAlongMax(original.points.map(p => ({x:p.x,y:p.y})));
    if (!result || !result[1]) return extra;
    const [remPts2D, newPts2D] = result;
    const newRoom = {
      points: newPts2D.map(p => ({x:p.x,y:p.y,z:0})),
      entrances: new Set(), windows: new Set(),
      exteriorWalls: new Set(), toIgnore: new Set(), canRefine: true
    };
    const newEntrance = newRoom.points.length > 1 ? (original.exteriorWalls && original.exteriorWalls.has(1) ? newRoom.points.length - 1 : 1) : 1;
    newRoom.entrances.add(newEntrance);
    original.points = remPts2D.map(p => ({x:p.x,y:p.y,z:0}));
    extra.push(...splitRoomsKeepingEntrancesRecursively(newRoom, maxApartmentSize, newEntrance, depth + 1));
    extra.push(newRoom);
  }
  return extra;
}

export function getInteriorPlanAndPlaceEntrancePolygons(f, hole, ground, corrWidthVal, rng, entrancePols, maxApartmentSize) {
  if (!hole) return [];
  const fpts=f.points, hpts=hole, n=hpts.length;
  const roomPols=[], connections=[];
  for (let i=0;i<n;i++) {
    roomPols.push({points:[],entrances:new Set(),windows:new Set(),exteriorWalls:new Set(),toIgnore:new Set(),canRefine:true});
    connections.push({a:0,b:0});
  }
  const corners={points:[],entrances:new Set(),windows:new Set(),exteriorWalls:new Set(),toIgnore:new Set(),canRefine:false};
  for (let i=1;i<=n;i++) {
    const tangent=v3norm(v3sub(hpts[i%n],hpts[i-1]));
    const edgeLen=v3dist(hpts[i%n],hpts[i-1]), midPos=edgeLen/2;
    const altTangent=rot270_3(tangent);
    const fa1=v3add(hpts[i-1],v3scale(tangent,midPos-corrWidthVal*0.5));
    let snd1={x:0,y:0,z:0}, conn=0;
    for (let j=1;j<=fpts.length;j++) {
      const res=lineIntersect3(fa1,v3add(fa1,v3scale(altTangent,100000)),fpts[j-1],fpts[j%fpts.length]);
      if(res.x!==0||res.y!==0){snd1=res;conn=j;break;}
    }
    if(snd1.x===0&&snd1.y===0) return [];
    const fEntrances=f.entrances||new Set(), fWindows=f.windows||new Set();
    let prevAttach=snd1;
    if(!ground||!fEntrances.has(conn)) corners.points.push(snd1);
    connections[i-1].b=conn;
    roomPols[i-1].points.push(fa1); roomPols[i-1].entrances.add(roomPols[i-1].points.length); roomPols[i-1].points.push(snd1);
    const fa2=v3add(hpts[i-1],v3scale(tangent,midPos+corrWidthVal*0.5));
    let snd2={x:0,y:0,z:0}, conn2=0;
    for (let j=1;j<=fpts.length;j++) {
      const res=lineIntersect3(fa2,v3add(fa2,v3scale(altTangent,100000)),fpts[j-1],fpts[j%fpts.length]);
      if(res.x!==0||res.y!==0){snd2=res;conn2=j;break;}
    }
    if(!ground||!fEntrances.has(conn2)) {
      if(fWindows.has(conn2)) corners.windows.add(corners.points.length);
      corners.points.push(snd2);
    } else if(snd2.x!==0&&v3dist(prevAttach,snd2)<1000) {
      if(entrancePols) entrancePols.push(...getEntrancePolygons(prevAttach,snd2,390,50));
    }
    if(i===n){
      const oe=Array.from(roomPols[0].entrances);
      roomPols[0].entrances=new Set(oe.map(e=>e+2));
      connections[0].a=conn2;
      roomPols[0].points.unshift(snd2,fa2); roomPols[0].entrances.add(1);
    } else {
      connections[i].a=conn2; roomPols[i].points.push(snd2); roomPols[i].entrances.add(roomPols[i].points.length); roomPols[i].points.push(fa2);
    }
  }
  for (let i=0;i<roomPols.length;i++) {
    const fp=roomPols[i], fWindows=f.windows||new Set();
    fp.exteriorWalls.add(fp.points.length);
    const bStart=connections[i].b-1===-1?fpts.length:connections[i].b-1;
    const bEnd=connections[i].a-1===-1?fpts.length:connections[i].a-1;
    for (let j=bStart;j!==bEnd;j=(j===0?fpts.length:j-1)) {
      if(fWindows.has(j+1)) fp.windows.add(fp.points.length);
      fp.exteriorWalls.add(fp.points.length); fp.points.push(fpts[j%fpts.length]);
    }
    if(fWindows.has(connections[i].a)) fp.windows.add(fp.points.length);
    fp.exteriorWalls.add(fp.points.length);
  }
  const extra = [];
  for (const p of roomPols) extra.push(...splitRoomsKeepingEntrancesRecursively(p, maxApartmentSize, -1, 0));
  for (const p of extra) roomPols.push(p);

  corners.points.reverse();
  if(corners.points.length>0) corners.points.push({...corners.points[0]});
  for(let i=0;i<corners.points.length;i+=2) corners.toIgnore.add(i);
  for(let i=1;i<corners.points.length+2;i+=2) corners.exteriorWalls.add(i);
  roomPols.push(corners);
  return roomPols;
}

export function addStairInfo(info, height, hole) {
  for (let i=1;i<=hole.length;i++) {
    const p1=withZ(xy(hole[i-1]),0), p2=withZ(xy(hole[i%hole.length]),0);
    info.pols.push({points:[p1,v3add(p1,{x:0,y:0,z:height}),v3add(p2,{x:0,y:0,z:height}),p2],type:'interior'});
  }
}

export function addFacade(f, toReturn, beginHeight, facadeHeight, width) {
  const pts=f.points, hp=f.housePosition||polyCenter(pts.map(xy));
  for (let i=1;i<=pts.length;i++) {
    const p1=pts[i-1],p2=pts[i%pts.length],t1=v3norm(v3sub(p1,hp)),t2=v3norm(v3sub(p2,hp));
    toReturn.pols.push({points:[
      v3add(v3add(p1,v3scale(t1,width)),{x:0,y:0,z:beginHeight}),
      v3add(v3add(p1,v3scale(t1,width)),{x:0,y:0,z:beginHeight+facadeHeight}),
      v3add(v3add(p2,v3scale(t2,width)),{x:0,y:0,z:beginHeight+facadeHeight}),
      v3add(v3add(p2,v3scale(t2,width)),{x:0,y:0,z:beginHeight}),
    ],type:'exteriorSnd'});
  }
}
