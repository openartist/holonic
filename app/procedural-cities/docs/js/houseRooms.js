// houseRooms.js — interiorPlanToPolygons, ported from RoomBuilder.cpp
import { v3add, v3sub, v3scale, v3norm, v3dist, rot270_3 } from './houseGeom.js';
import { getWindowFramePolygons } from './roomFeatures.js';

export function interiorPlanToPolygons(roomPols, floorHeightVal, windowDensity, windowHeight, windowWidth, floor, shellOnly, windowFrames) {
  const result = [];
  for (const rp of roomPols) {
    const pts = rp.points;
    const n = pts.length;
    for (let i = 1; i <= n; i++) {
      if (rp.toIgnore && rp.toIgnore.has(i)) continue;
      if (shellOnly && !(rp.exteriorWalls && rp.exteriorWalls.has(i))) continue;
      const isExt = rp.exteriorWalls && rp.exteriorWalls.has(i);
      const type = isExt ? 'exterior' : 'interior';
      const p1 = pts[i-1], p2 = pts[i % n];
      if (v3dist(p1, p2) < 1) continue;
      const tan = v3norm(v3sub(p2, p1));
      let extraFront = {x:0,y:0,z:0}, extraBack = {x:0,y:0,z:0};
      if (!isExt) {
        const prev = i > 1 ? i-1 : n, next = i < n ? i+1 : 1;
        if (rp.exteriorWalls && rp.exteriorWalls.has(prev)) extraFront = v3scale(tan, 20);
        if (rp.exteriorWalls && rp.exteriorWalls.has(next))  extraBack  = v3scale(tan, -20);
      }
      const wallPts = [
        v3add(v3add(p1, {x:0,y:0,z:floorHeightVal}), extraFront),
        v3add(p1, extraFront),
        v3add(p2, extraBack),
        v3add(v3add(p2, {x:0,y:0,z:floorHeightVal}), extraBack),
      ];
      if (rp.entrances && rp.entrances.has(i) && v3dist(p1, p2) > 100) {
        const entrPos = (rp.specificEntrances && rp.specificEntrances[i])
          ? rp.specificEntrances[i]
          : {x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2, z:p1.z||0};
        const doorW = 137, doorH = 297;
        const entTan = v3norm(v3sub(p2, p1));
        const dStart = v3dist(p1, entrPos) - doorW/2;
        const dL = v3add(p1, v3scale(entTan, dStart));
        const dR = v3add(p1, v3scale(entTan, dStart+doorW));
        wallPts.splice(2, 0, dL, v3add(dL,{x:0,y:0,z:doorH}), v3add(dR,{x:0,y:0,z:doorH}), dR);
      }
      const windowHoles = [];
      if (rp.windows && rp.windows.has(i)) {
        const edgeLen = v3dist(p1, p2);
        const edgeTan = v3norm(v3sub(p2, p1));
        const spaces = Math.floor(Math.min(windowDensity * edgeLen, edgeLen / (windowWidth + 20)));
        let doorStart = 100000, doorEnd = -1000000;
        if (rp.entrances && rp.entrances.has(i) && edgeLen > 100) {
          const ep = (rp.specificEntrances && rp.specificEntrances[i]) || {x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2,z:p1.z||0};
          doorStart = v3dist(p1, ep) - 137/2;
          doorEnd = doorStart + 137;
        }
        if (spaces > 0) {
          const jumpLen = edgeLen / spaces;
          for (let j = 1; j < spaces; j++) {
            let cStart = j*jumpLen - windowWidth/2, cEnd = j*jumpLen + windowWidth/2;
            if (cStart < doorEnd) cEnd   = Math.min(cEnd,   doorStart - 30);
            if (cEnd   > doorStart) cStart = Math.max(cStart, doorEnd   + 30);
            if (cEnd - cStart > 100) {
              const pw1 = v3add(v3add(p1, v3scale(edgeTan, cStart)), {x:0,y:0,z:50+windowHeight});
              const pw2 = v3sub(pw1, {x:0,y:0,z:windowHeight});
              const pw3 = v3add(v3add(p1, v3scale(edgeTan, cEnd)), {x:0,y:0,z:50});
              const pw4 = v3add(pw3, {x:0,y:0,z:windowHeight});
              const winPts = [pw1, pw2, pw3, pw4];
              const wxs=winPts.map(p=>p.x),wys=winPts.map(p=>p.y);
              if(Math.max(...wxs)-Math.min(...wxs)<0.1&&Math.max(...wys)-Math.min(...wys)<0.1)continue;
              result.push({points: winPts, type: shellOnly ? 'occlusionWindow' : 'window', width: 8});
              windowHoles.push({points: winPts});
              if (windowFrames) {
                result.push(...getWindowFramePolygons(winPts, rp.windowType || 0));
              } else {
                const wallInward = v3norm(rot270_3(v3sub(p2, p1)));
                for (let k = 1; k <= 4; k++) {
                  const wp1 = winPts[k-1], wp2 = winPts[k%4];
                  result.push({points:[wp1,wp2,v3add(wp2,v3scale(wallInward,20)),v3add(wp1,v3scale(wallInward,20))],type:'exterior',width:0});
                }
              }
            }
          }
        }
      }
      result.push({points: wallPts, type, windows: windowHoles});
    }
  }
  return result;
}
