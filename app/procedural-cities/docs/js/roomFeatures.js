// roomFeatures.js — window frames, balcony, sidewalk decorations
// Ported from RoomBuilder.cpp: getRectangularWindow, getCrossWindow, placeBalcony
// Ported from PlotBuilder.cpp: getSideWalkInfo decorations

function v3(x,y,z){return{x,y,z};}
function v3add(a,b){return{x:a.x+b.x,y:a.y+b.y,z:(a.z||0)+(b.z||0)};}
function v3sub(a,b){return{x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)};}
function v3scale(v,s){return{x:v.x*s,y:v.y*s,z:(v.z||0)*s};}
function v3len(v){return Math.hypot(v.x,v.y,v.z||0);}
function v3norm(v){const l=v3len(v);return l<1e-10?{x:0,y:0,z:0}:{x:v.x/l,y:v.y/l,z:(v.z||0)/l};}
function rot90_3(v){return{x:-v.y,y:v.x,z:v.z||0};}
function rot270_3(v){return{x:v.y,y:-v.x,z:v.z||0};}
function mid3(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2};}

// C++ getRectangularWindow: for each edge of window polygon p,
// builds a frame quad from edge outward toward center by frameWidth,
// offset inward along window normal by (frameDepth/2 - 20)
function getRectangularWindow(pts, center, frameWidth, frameDepth) {
  const result = [];
  const n = pts.length;
  for (let j = 1; j <= n; j++) {
    const p1 = pts[j-1], p2 = pts[j%n];
    const edgeLen = v3len(v3sub(p2, p1));
    if (edgeLen < 1) continue;
    const t1 = v3norm(v3sub(center, p1));
    const t2 = v3norm(v3sub(center, p2));
    const winNormal = v3norm(rot90_3(v3sub(p2, p1)));
    if (v3len(winNormal) < 0.1) continue;
    const quad = [p1, p2, v3add(p2, v3scale(t2, frameWidth)), v3add(p1, v3scale(t1, frameWidth))];
    const off = v3scale(winNormal, frameDepth/2 - 20);
    const qPts = quad.map(p => v3add(p, off));
    let ax=0,ay=0,az=0;
    for(let k=1;k<qPts.length-1;k++){
      const dx1=qPts[k].x-qPts[0].x,dy1=qPts[k].y-qPts[0].y,dz1=(qPts[k].z||0)-(qPts[0].z||0);
      const dx2=qPts[k+1].x-qPts[0].x,dy2=qPts[k+1].y-qPts[0].y,dz2=(qPts[k+1].z||0)-(qPts[0].z||0);
      ax+=dy1*dz2-dz1*dy2;ay+=dz1*dx2-dx1*dz2;az+=dx1*dy2-dy1*dx2;
    }
    if(Math.hypot(ax,ay,az)*0.5<0.01)continue;
    result.push({ points: qPts, type: 'windowFrame', width: frameDepth });
  }
  return result;
}

// C++ getCrossWindow: builds horizontal and vertical crossbar quads (edges 2 and 3 of window rect)
function getCrossWindow(pts, frameWidth, frameDepth) {
  const result = [];
  for (let j = 2; j <= 3; j++) {
    const p1 = pts[j-1], p2 = pts[j];
    const t1 = v3norm(v3sub(pts[j], pts[j-1]));
    const t2 = v3norm(v3sub(pts[j+1] || pts[0], pts[j]));
    const tan2Len = v3len(v3sub(pts[j+1] || pts[0], pts[j]));
    const winNormal = v3norm(rot90_3(v3sub(pts[j], pts[j-1])));
    const cross = [
      v3add(mid3(pts[j-1], pts[j]), v3scale(t2, frameWidth/2)),
      v3add(mid3(pts[j-1], pts[j]), v3scale(t2, frameWidth/2 - tan2Len)),
      v3add(mid3(pts[j-1], pts[j]), v3scale(t2, -frameWidth/2 - tan2Len)),
      v3add(mid3(pts[j-1], pts[j]), v3scale(t2, -frameWidth/2)),
    ];
    const off = v3scale(winNormal, frameDepth/2 - 20);
    result.push({
      points: cross.map(p => v3add(p, off)),
      type: 'windowFrame',
      width: frameDepth
    });
  }
  return result;
}

// Returns window frame polygons for a given window polygon and type (0=rect, 1=cross, 2=vertLines, 3=rectHBig)
export function getWindowFramePolygons(winPts, windowType) {
  if (!winPts || winPts.length < 3) return [];
  const xs = winPts.map(p=>p.x), ys = winPts.map(p=>p.y);
  if (Math.max(...xs)-Math.min(...xs) < 1 && Math.max(...ys)-Math.min(...ys) < 1) return [];
  const frameWidth = 15, frameDepth = 30;
  const pts = [...winPts, winPts[0]];
  const center = {
    x: winPts.reduce((s,p)=>s+p.x,0)/winPts.length,
    y: winPts.reduce((s,p)=>s+p.y,0)/winPts.length,
    z: winPts.reduce((s,p)=>s+(p.z||0),0)/winPts.length,
  };
  const frames = getRectangularWindow(winPts, center, frameWidth, frameDepth);
  if (windowType === 1) {
    frames.push(...getCrossWindow(pts, frameWidth, frameDepth));
  }
  const validPt = p => p && isFinite(p.x) && isFinite(p.y);
  const area3D = (pts) => {
    let ax=0,ay=0,az=0;
    for(let i=1;i<pts.length-1;i++){
      const dx1=pts[i].x-pts[0].x,dy1=pts[i].y-pts[0].y,dz1=(pts[i].z||0)-(pts[0].z||0);
      const dx2=pts[i+1].x-pts[0].x,dy2=pts[i+1].y-pts[0].y,dz2=(pts[i+1].z||0)-(pts[0].z||0);
      ax+=dy1*dz2-dz1*dy2;ay+=dz1*dx2-dx1*dz2;az+=dx1*dy2-dy1*dx2;
    }
    return Math.hypot(ax,ay,az)*0.5;
  };
  return frames.filter(f => f.points && f.points.length >= 3 && f.points.every(validPt) && area3D(f.points) >= 0.01);
}

// C++ placeBalcony: builds floor + 3 side walls from exterior window edge
export function placeBalcony(roomPts, place) {
  const n = roomPts.length;
  const width = 500, length = 200, height = 150;
  const p1 = roomPts[place-1], p2 = roomPts[place%n];
  const tangent = v3norm(v3sub(p2, p1));
  const len = v3len(v3sub(p2, p1));
  const actualWidth = Math.min(width, len);
  const normal = v3norm(rot270_3(v3sub(p2, p1)));

  const start    = v3add(p1, v3scale(tangent, (len - actualWidth) * 0.5));
  const end      = v3add(p1, v3scale(tangent, (len + actualWidth) * 0.5));
  const endOut   = v3add(end, v3scale(normal, length));
  const startOut = v3add(start, v3scale(normal, length));

  const pols = [];
  pols.push({ points: [start, end, endOut, startOut], type: 'exteriorSnd' });
  pols.push({ points: [start, startOut, v3add(startOut,{x:0,y:0,z:height}), v3add(start,{x:0,y:0,z:height})], type: 'exteriorSnd', overridePolygonSides: true });
  pols.push({ points: [startOut, endOut, v3add(endOut,{x:0,y:0,z:height}), v3add(startOut,{x:0,y:0,z:height})], type: 'exteriorSnd', overridePolygonSides: true });
  pols.push({ points: [endOut, end, v3add(end,{x:0,y:0,z:height}), v3add(endOut,{x:0,y:0,z:height})], type: 'exteriorSnd', overridePolygonSides: true });
  return pols;
}

// Sidewalk decoration polygons — trees (cones) and lamp posts (thin boxes)
// Returns array of material polygon objects
export function getSidewalkDecorations(pts, isClockwise, rng) {
  const pols = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p2 = pts[(i+1)%n];
    const tan = v3norm(v3sub(p2, p1));
    const edgeLen = v3len(v3sub(p2, p1));
    const normal = isClockwise ? rot270_3(tan) : rot90_3(tan);
    const sidewalkOff = 250;
    const spacing = 800 + rng() * 400;
    let pos = spacing * 0.5;
    while (pos < edgeLen - spacing * 0.5) {
      const base = v3add(p1, v3add(v3scale(tan, pos), v3scale(normal, sidewalkOff)));
      const r = rng();
      if (r < 0.5) {
        pols.push(...makeTree(base, rng));
      } else if (r < 0.8) {
        pols.push(...makeLampPost(base));
      }
      pos += spacing + rng() * 200;
    }
  }
  return pols;
}

function makeTree(base, rng) {
  const h = 300 + rng() * 200;
  const r = 80 + rng() * 60;
  const pols = [];
  const segments = 6;
  const tip = v3add(base, {x:0,y:0,z:h});
  for (let i = 0; i < segments; i++) {
    const a1 = (i/segments)*Math.PI*2, a2 = ((i+1)/segments)*Math.PI*2;
    const p1 = v3add(base, {x:Math.cos(a1)*r, y:Math.sin(a1)*r, z:0});
    const p2 = v3add(base, {x:Math.cos(a2)*r, y:Math.sin(a2)*r, z:0});
    pols.push({ points: [p1, p2, tip], type: 'tree' });
  }
  return pols;
}

function makeLampPost(base) {
  const h = 350, w = 10;
  const top = v3add(base, {x:0,y:0,z:h});
  const armEnd = v3add(top, {x:60,y:0,z:30});
  const pols = [];
  pols.push({ points: [
    v3add(base,{x:-w,y:-w,z:0}), v3add(base,{x:w,y:-w,z:0}),
    v3add(top,{x:w,y:-w,z:0}), v3add(top,{x:-w,y:-w,z:0})
  ], type: 'lampPost' });
  pols.push({ points: [
    v3add(base,{x:-w,y:w,z:0}), v3add(top,{x:-w,y:w,z:0}),
    v3add(top,{x:w,y:w,z:0}), v3add(base,{x:w,y:w,z:0})
  ], type: 'lampPost' });
  pols.push({ points: [top, armEnd, v3add(armEnd,{x:0,y:0,z:-20}), v3add(top,{x:0,y:0,z:-20})], type: 'lampPost' });
  return pols;
}
