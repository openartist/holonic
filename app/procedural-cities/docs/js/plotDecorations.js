// plotDecorations.js — crosswalks, awnings, plot decorations
// Ported from PlotBuilder.cpp: getCrossingAt, getRandomModel
// Ported from RoomBuilder.cpp: placeAwnings

// getCrossingAt: generate white pedestrian crossing stripes across a road polygon
// road: {v1,v2,v3,v4} — road quad where v1-v2 is one side and v3-v4 the other
// dist: 0..1 position along road length
// lineWidth: half-width of each stripe
export function getCrossingStripes(road, dist, lineWidth){
  if(!road||!road.v1||!road.v2||!road.v3||!road.v4) return [];
  if(lineWidth===undefined) lineWidth=150;

  // startP = lerp along v1->v2 side
  const tx=road.v2.x-road.v1.x, ty=road.v2.y-road.v1.y;
  const startP={x:road.v1.x+tx*dist, y:road.v1.y+ty*dist, z:11};

  // endP = nearest point on opposite side v3->v4 to startP
  // parameterize v3->v4 with same t=dist
  const ox=road.v4.x-road.v3.x, oy=road.v4.y-road.v3.y;
  const endP={x:road.v3.x+ox*dist, y:road.v3.y+oy*dist, z:11};

  const lineInterval=200, lineLen=100;
  const tangent={x:endP.x-startP.x, y:endP.y-startP.y, z:0};
  const tLen=Math.hypot(tangent.x,tangent.y);
  if(tLen<1)return[];
  const tn={x:tangent.x/tLen, y:tangent.y/tLen, z:0};
  const spaces=Math.floor(tLen/(lineInterval+1));
  const pols=[];
  for(let i=1;i<spaces;i++){
    const sPos=v3add(startP,v3scale(tn,lineInterval*i));
    const ePos=v3add(sPos,v3scale(tn,lineLen));
    // normal perpendicular to stripe direction (which runs across road)
    // the stripe is oriented along road direction, so normal is along crossing direction
    // perpendicular to tn in XY:
    const normal={x:-tn.y,y:tn.x,z:0};
    pols.push({points:[
      v3add(sPos,v3scale(normal,lineWidth)),
      v3add(ePos,v3scale(normal,lineWidth)),
      v3sub(ePos,v3scale(normal,lineWidth)),
      v3sub(sPos,v3scale(normal,lineWidth)),
    ],type:'crossing'});
  }
  return pols;
}

// Generate crossings for a list of road segments
export function getCrossingsForRoads(roads){
  const pols=[];
  for(const road of roads){
    pols.push(...getCrossingStripes(road,0.1,100));
    pols.push(...getCrossingStripes(road,0.9,100));
  }
  return pols;
}

// placeAwnings: flat overhangs above ground-floor windows
// pts: room polygon points array, windowIndices: Set of wall indices that have windows
// Returns array of flat quad polygons at z=380
export function placeAwnings(pts, windowIndices){
  const pols=[];
  const awningDepth=120;
  const awningHeight=380;
  for(const i of windowIndices){
    const n=pts.length;
    const p1=pts[i-1], p2=pts[i%n];
    if(!p1||!p2)continue;
    const tan={x:p2.x-p1.x,y:p2.y-p1.y,z:0};
    const edgeLen=Math.hypot(tan.x,tan.y);
    if(edgeLen<100)continue;
    const tn={x:tan.x/edgeLen,y:tan.y/edgeLen,z:0};
    // outward normal (away from building): rotate 90° CW for outward
    const normal={x:tn.y,y:-tn.x,z:0};
    const awningW=120;
    const step=awningW+10;
    let pos=awningW/2;
    while(pos<edgeLen-awningW/2){
      const base=v3add(p1,v3add(v3scale(tn,pos),{x:0,y:0,z:awningHeight}));
      pols.push({points:[
        v3add(base,v3add(v3scale(tn,-awningW/2),{x:0,y:0,z:0})),
        v3add(base,v3add(v3scale(tn, awningW/2),{x:0,y:0,z:0})),
        v3add(base,v3add(v3add(v3scale(tn, awningW/2),v3scale(normal,awningDepth)),{x:0,y:0,z:-30})),
        v3add(base,v3add(v3add(v3scale(tn,-awningW/2),v3scale(normal,awningDepth)),{x:0,y:0,z:-30})),
      ],type:'awning'});
      pos+=step;
    }
  }
  return pols;
}

// Bush decorations at plot corners
export function getBushesAtCorners(pts, rng){
  const pols=[];
  for(const p of pts){
    if(rng()<0.4){
      const r=25+rng()*20;
      const segs=6;
      const base={x:p.x,y:p.y,z:35};
      for(let i=0;i<segs;i++){
        const a1=(i/segs)*Math.PI*2, a2=((i+1)/segs)*Math.PI*2;
        pols.push({points:[
          base,
          {x:base.x+Math.cos(a1)*r,y:base.y+Math.sin(a1)*r,z:35},
          {x:base.x+Math.cos(a2)*r,y:base.y+Math.sin(a2)*r,z:35},
        ],type:'bush'});
      }
    }
  }
  return pols;
}

// Grass patches — flat quads scattered on plot
export function getGrassPatches(pts, rng, count){
  const pols=[];
  if(!pts||pts.length<3)return pols;
  const bbox=getBBox(pts);
  for(let k=0;k<(count||8);k++){
    const x=bbox.minX+(rng()*(bbox.maxX-bbox.minX));
    const y=bbox.minY+(rng()*(bbox.maxY-bbox.minY));
    if(!pointInPoly2D({x,y},pts))continue;
    const r=30+rng()*50;
    pols.push({points:[
      {x:x-r,y:y-r,z:31},{x:x+r,y:y-r,z:31},
      {x:x+r,y:y+r,z:31},{x:x-r,y:y+r,z:31},
    ],type:'bush'});
  }
  return pols;
}

function getBBox(pts){
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of pts){
    if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
    if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
  }
  return{minX,maxX,minY,maxY};
}

function pointInPoly2D(p,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;
    if(((yi>p.y)!==(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}

function v3add(a,b){return{x:a.x+b.x,y:a.y+b.y,z:(a.z||0)+(b.z||0)};}
function v3sub(a,b){return{x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)};}
function v3scale(v,s){return{x:v.x*s,y:v.y*s,z:(v.z||0)*s};}
