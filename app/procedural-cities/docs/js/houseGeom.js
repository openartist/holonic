// houseGeom.js — shared 3D math, fillOutPolygon, getSign, placeRows
// Ported from BaseLibrary.cpp, RoomBuilder.cpp (static helpers)
import { segIntersect } from './utils.js';

export function v3add(a,b){return{x:a.x+b.x,y:a.y+b.y,z:(a.z||0)+(b.z||0)};}
export function v3sub(a,b){return{x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)};}
export function v3scale(v,s){return{x:v.x*s,y:v.y*s,z:(v.z||0)*s};}
export function v3len(v){return Math.hypot(v.x,v.y,v.z||0);}
export function v3norm(v){const l=v3len(v);return l<1e-10?{x:0,y:0,z:0}:{x:v.x/l,y:v.y/l,z:(v.z||0)/l};}
export function v3dist(a,b){return Math.hypot(b.x-a.x,b.y-a.y,(b.z||0)-(a.z||0));}
export function rot270_3(v){return{x:v.y,y:-v.x,z:v.z||0};}
export function rot90_3(v){return{x:-v.y,y:v.x,z:v.z||0};}
export function xy(p){return{x:p.x,y:p.y};}
export function withZ(p,z){return{x:p.x,y:p.y,z};}

export function lineIntersect3(p1,p2,p3,p4){
  const s1x=p2.x-p1.x,s1y=p2.y-p1.y,s2x=p4.x-p3.x,s2y=p4.y-p3.y;
  const denom=-s2x*s1y+s1x*s2y;
  if(Math.abs(denom)<1e-10)return{x:0,y:0,z:0};
  const s=(-s1y*(p1.x-p3.x)+s1x*(p1.y-p3.y))/denom;
  const t=(s2x*(p1.y-p3.y)-s2y*(p1.x-p3.x))/denom;
  if(s>=0&&s<=1&&t>=0&&t<=1)return{x:p1.x+t*s1x,y:p1.y+t*s1y,z:p1.z||0};
  return{x:0,y:0,z:0};
}

export function polyPolyIntersects2D(polyA,polyB){
  for(let i=0;i<polyA.length;i++){
    const a1=polyA[i],a2=polyA[(i+1)%polyA.length];
    for(let j=0;j<polyB.length;j++)if(segIntersect(a1,a2,polyB[j],polyB[(j+1)%polyB.length]))return true;
  }
  return false;
}

export function pointInPoly2D(p,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;
    if(((yi>p.y)!==(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}

function getPolygonDirection(pts){
  if(!pts||pts.length<3)return{x:0,y:0,z:-1};
  const o=pts[0],ex=pts[1].x-o.x,ey=pts[1].y-o.y,ez=(pts[1].z||0)-(o.z||0);
  const el=Math.hypot(ex,ey,ez);if(el<1e-10)return{x:0,y:0,z:-1};
  const e1={x:ex/el,y:ey/el,z:ez/el};
  const ax=pts[pts.length-1].x-o.x,ay=pts[pts.length-1].y-o.y,az=(pts[pts.length-1].z||0)-(o.z||0);
  let nx=e1.y*az-e1.z*ay,ny=e1.z*ax-e1.x*az,nz=e1.x*ay-e1.y*ax;
  const nl=Math.hypot(nx,ny,nz);if(nl<1e-10)return{x:0,y:0,z:-1};
  return{x:nx/nl,y:ny/nl,z:nz/nl};
}

const NO_SIDES_TYPES = new Set(['windowFrame','window','roadMiddle','concrete','tree','lampPost','awning','balcony','bush','furniture','crossing']);

export function fillOutPolygon(p){
  const otherSides=[p];
  const width=p.width||0;
  if(width<=0)return otherSides;
  if(!p.points||p.points.length<3)return otherSides;
  if(p.points.some(pt=>!isFinite(pt.x)||!isFinite(pt.y)||!isFinite(pt.z||0)))return otherSides;
  const dir=getPolygonDirection(p.points);
  if(Math.hypot(dir.x,dir.y,dir.z)<0.01)return otherSides;
  const off=v3scale(dir,width);
  const innerPts=p.points.map(pt=>v3add(pt,off));
  const innerType=(p.type==='exterior'||p.type==='exteriorSnd')?'interior':p.type;
  let polygonSides=true;
  if(NO_SIDES_TYPES.has(p.type))polygonSides=false;
  if(p.type==='exterior'||p.type==='exteriorSnd'){
    if(!p.overridePolygonSides) polygonSides=false;
  }
  if(!p.overridePolygonSides&&(p.type==='floor'||p.type==='interior')||p.type==='roof'){
    polygonSides=false;
  }
  if(polygonSides){
    const n=p.points.length;
    const triArea=(a,b,c)=>{
      const ax=b.x-a.x,ay=b.y-a.y,az=(b.z||0)-(a.z||0);
      const bx=c.x-a.x,by=c.y-a.y,bz=(c.z||0)-(a.z||0);
      return Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)*0.5;
    };
    for(let i=1;i<=n;i++){
      const t1=[innerPts[i-1],p.points[i%n],p.points[i-1]];
      const t2=[innerPts[i-1],innerPts[i%n],p.points[i%n]];
      if(triArea(...t1)>0.01)otherSides.push({points:t1,type:innerType});
      if(triArea(...t2)>0.01)otherSides.push({points:t2,type:innerType});
    }
  }
  otherSides.push({points:[...innerPts].reverse(),type:innerType});
  return otherSides;
}

export function fillOutPolygons(pols){
  const out=[];for(const p of pols)out.push(...fillOutPolygon(p));return out;
}

export function getSign(startP,endP,rng,sideways){
  const signPols=[];
  const tangent=v3norm(v3sub(endP,startP));
  const len=v3dist(startP,endP);
  const actualLen=100+rng()*(sideways?200:400);
  const actualH=100;
  if(sideways){
    const first=rng()*len;
    const tangS=rot90_3(tangent);
    const s=v3add(startP,v3scale(tangent,first));
    const startH=v3add(s,v3scale(v3scale(tangent,-1),7));
    signPols.push({points:[
      v3add(startH,{x:0,y:0,z:actualH+20}),v3add(startH,{x:0,y:0,z:actualH+30}),
      v3add(v3add(startH,v3scale(tangS,actualLen+100)),{x:0,y:0,z:actualH+30}),
      v3add(v3add(startH,v3scale(tangS,actualLen+100)),{x:0,y:0,z:actualH+20}),
    ],type:'roadMiddle',width:7});
  }
  const first=rng()*Math.max(0,len-actualLen);
  const sL=v3add(startP,v3scale(tangent,first));
  const eL=v3add(startP,v3scale(tangent,first+actualLen));
  signPols.push({points:[sL,v3add(sL,{x:0,y:0,z:actualH}),v3add(eL,{x:0,y:0,z:actualH}),eL],type:'roadMiddle',width:15});
  return signPols;
}

export function placeSigns(room,rng){
  for(const i of(room.windows||[])){
    const p1=room.points[i-1],p2=room.points[i%room.points.length];
    if(p1&&p2)return getSign(v3add(p1,{x:0,y:0,z:300}),v3add(p2,{x:0,y:0,z:300}),rng,rng()<0.2);
  }
  return[];
}

// MeshPolygonReference::getStairPolygon — stair shaft footprint
export function getStairPolygon(origin, dirRot){
  // dirRot: {x,y,z} unit vector defining forward direction
  const forward=v3norm(dirRot);
  const right=rot90_3(forward);
  const sx=190, sy=213;
  return [
    v3add(origin,v3add(v3scale(forward,sx),v3scale(right,-sy))),
    v3add(origin,v3add(v3scale(forward,sx),v3scale(right, sy))),
    v3add(origin,v3add(v3scale(forward,-sx),v3scale(right, sy))),
    v3add(origin,v3add(v3scale(forward,-sx),v3scale(right,-sy))),
  ];
}

export function placeRows(roofPol,rng,type,count){
  const pols=[];
  const pts=roofPol.points;
  if(!pts||pts.length<3)return pols;
  if(pts.some(p=>!isFinite(p.x)||!isFinite(p.y)))return pols;
  const center={x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length,z:pts[0].z||0};
  const rawTan=v3sub(pts[1],pts[0]);
  if(Math.hypot(rawTan.x,rawTan.y,rawTan.z||0)<1e-6)return pols;
  const tangent=v3norm(rawTan);
  const normal=rot90_3(tangent);
  const iW=type==='fence'?30:150,iD=type==='fence'?10:80;
  const iH=type==='fence'?120:(type==='rooftop_solar'?30:80);
  for(let k=0;k<count;k++){
    const base=v3add(center,v3add(v3scale(tangent,(rng()-0.5)*1000),v3scale(normal,(rng()-0.5)*1000)));
    pols.push({points:[
      v3add(base,v3add(v3scale(tangent,-iW/2),v3scale(normal,-iD/2))),
      v3add(base,v3add(v3scale(tangent, iW/2),v3scale(normal,-iD/2))),
      v3add(base,v3add(v3scale(tangent, iW/2),v3scale(normal, iD/2))),
      v3add(base,v3add(v3scale(tangent,-iW/2),v3scale(normal, iD/2))),
    ].map(p=>v3add(p,{x:0,y:0,z:iH})),type:type==='fence'?'concrete':'exterior',normal:{x:0,y:0,z:-1}});
  }
  return pols;
}
