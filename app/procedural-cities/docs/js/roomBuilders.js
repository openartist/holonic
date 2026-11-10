// roomBuilders.js — floor-level furniture polygons for each room type
// Ported from RoomBuilder.cpp: getLivingRoom, getBedRoom, getBathRoom, getKitchen,
// getMeetingRoom, getWorkingRoom, getRestaurantRoom, getStoreFront, getStoreBack,
// getHallWay, getCorridor, getCloset

function v3add(a,b){return{x:a.x+b.x,y:a.y+b.y,z:(a.z||0)+(b.z||0)};}
function v3sub(a,b){return{x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)};}
function v3scale(v,s){return{x:v.x*s,y:v.y*s,z:(v.z||0)*s};}
function v3len(v){return Math.hypot(v.x,v.y,v.z||0);}
function v3norm(v){const l=v3len(v);return l<1e-10?{x:0,y:0,z:0}:{x:v.x/l,y:v.y/l,z:(v.z||0)/l};}
function rot90_3(v){return{x:-v.y,y:v.x,z:v.z||0};}

function polyCenter3(pts){
  let x=0,y=0,z=0;
  for(const p of pts){x+=p.x;y+=p.y;z+=(p.z||0);}
  return{x:x/pts.length,y:y/pts.length,z:z/pts.length};
}

function roomDir(pts){
  if(!pts||pts.length<2)return{x:1,y:0,z:0};
  const t=v3norm(v3sub(pts[1],pts[0]));
  return rot90_3(t);
}

// Place a rectangular furniture item as a flat polygon at floor level
// center: {x,y,z}, dir: forward direction, w: width, d: depth
function rect(center, dir, w, d, type){
  const tan=v3norm(rot90_3(dir));
  const p1=v3add(center,v3add(v3scale(dir,-d/2),v3scale(tan,-w/2)));
  const p2=v3add(center,v3add(v3scale(dir,-d/2),v3scale(tan, w/2)));
  const p3=v3add(center,v3add(v3scale(dir, d/2),v3scale(tan, w/2)));
  const p4=v3add(center,v3add(v3scale(dir, d/2),v3scale(tan,-w/2)));
  return{points:[p1,p2,p3,p4],type};
}

// Place item along a wall edge (index i, 1-based)
function wallCenter(pts,i,offset,type,w,d){
  const n=pts.length;
  const p1=pts[i-1],p2=pts[i%n];
  const mid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2,z:(p1.z||0)};
  const tan=v3norm(v3sub(p2,p1));
  const normal=rot90_3(tan);
  const cen=v3add(mid,v3scale(normal,offset));
  return rect(cen,normal,w,d,type);
}

// Place row of items along first suitable wall
function rowAlongWall(pts, rng, itemW, itemD, spacing, type, offsetFromWall){
  const pols=[];
  const n=pts.length;
  const wallIdx=1+Math.floor(rng()*n);
  const p1=pts[wallIdx-1],p2=pts[wallIdx%n];
  const tan=v3norm(v3sub(p2,p1));
  const normal=rot90_3(tan);
  const edgeLen=v3len(v3sub(p2,p1));
  let pos=spacing;
  while(pos<edgeLen-spacing){
    const base=v3add(p1,v3add(v3scale(tan,pos),v3scale(normal,offsetFromWall)));
    pols.push(rect(base,normal,itemW,itemD,type));
    pos+=spacing;
  }
  return pols;
}

export function getLivingRoom(pts, rng){
  const pols=[];
  const cen=polyCenter3(pts);
  const dir=roomDir(pts);
  const tan=v3norm(rot90_3(dir));
  // sofa facing inward
  const sofaPos=v3add(cen,v3scale(dir,-150));
  pols.push(rect(sofaPos,dir,250,80,'furniture'));
  // coffee table in front of sofa
  pols.push(rect(v3add(cen,v3scale(dir,0)),dir,120,60,'furniture'));
  // TV stand on opposite wall (approximated near center + dir*200)
  pols.push(rect(v3add(cen,v3scale(dir,180)),dir,160,40,'furniture'));
  // armchair
  pols.push(rect(v3add(cen,v3add(v3scale(tan,170),v3scale(dir,-80))),dir,80,80,'furniture'));
  return pols;
}

export function getBedRoom(pts, rng){
  const pols=[];
  const cen=polyCenter3(pts);
  const dir=roomDir(pts);
  const tan=v3norm(rot90_3(dir));
  // bed against one wall
  const bedPos=v3add(cen,v3scale(dir,-100));
  pols.push(rect(bedPos,dir,200,220,'furniture'));
  // nightstand
  pols.push(rect(v3add(bedPos,v3scale(tan,120)),dir,50,50,'furniture'));
  pols.push(rect(v3add(bedPos,v3scale(tan,-120)),dir,50,50,'furniture'));
  // wardrobe along wall
  pols.push(wallAlongWall(pts,rng,dir,tan,cen));
  return pols;
}

function wallAlongWall(pts,rng,dir,tan,cen){
  // wardrobe placed near a wall
  const n=pts.length;
  const wallIdx=2+Math.floor(rng()*(n-1));
  const p1=pts[wallIdx-1],p2=pts[wallIdx%n];
  const mid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2,z:0};
  const edgeTan=v3norm(v3sub(p2,p1));
  const edgeNorm=rot90_3(edgeTan);
  return rect(v3add(mid,v3scale(edgeNorm,30)),edgeNorm,180,50,'furniture');
}

export function getBathRoom(pts, rng){
  const pols=[];
  const n=pts.length;
  // toilet near first wall
  pols.push(wallCenter(pts,1,35,'furniture',60,80));
  // bathtub/shower along second wall
  if(n>=2) pols.push(wallCenter(pts,2,40,'furniture',80,160));
  // sink
  pols.push(wallCenter(pts,n>=3?3:1,30,'furniture',55,45));
  return pols;
}

export function getKitchen(pts, rng){
  const pols=[];
  const n=pts.length;
  // counters along 2 walls
  pols.push(...rowAlongWall(pts,rng,60,50,80,'furniture',35));
  // stove
  pols.push(wallCenter(pts,2,35,'furniture',60,60));
  // fridge
  pols.push(wallCenter(pts,n>=3?3:1,35,'furniture',70,70));
  // table + chairs in center if space
  const cen=polyCenter3(pts);
  const dir=roomDir(pts);
  const tan=v3norm(rot90_3(dir));
  pols.push(rect(cen,dir,100,60,'furniture'));
  for(let a=0;a<4;a++){
    const ang=a*Math.PI/2;
    const off={x:Math.cos(ang)*80,y:Math.sin(ang)*80,z:0};
    pols.push(rect(v3add(cen,off),dir,40,40,'furniture'));
  }
  return pols;
}

export function getMeetingRoom(pts, rng){
  const pols=[];
  const cen=polyCenter3(pts);
  const dir=roomDir(pts);
  const tan=v3norm(rot90_3(dir));
  // conference table
  pols.push(rect(cen,dir,300,120,'furniture'));
  // chairs around table
  const chairOffsets=[
    v3scale(tan,-200),v3scale(tan,-100),v3scale(tan,0),v3scale(tan,100),v3scale(tan,200),
  ];
  const chairSides=[v3scale(dir,-90),v3scale(dir,90)];
  for(const cs of chairSides)
    for(const co of chairOffsets)
      pols.push(rect(v3add(cen,v3add(co,cs)),dir,45,45,'furniture'));
  return pols;
}

export function getWorkingRoom(pts, rng){
  const pols=[];
  // rows of desks
  pols.push(...rowAlongWall(pts,rng,120,60,150,'furniture',50));
  // chairs at each desk approximated by second row
  pols.push(...rowAlongWall(pts,rng,45,45,150,'furniture',120));
  return pols;
}

export function getRestaurantRoom(pts, rng){
  const pols=[];
  const cen=polyCenter3(pts);
  const dir=roomDir(pts);
  const tan=v3norm(rot90_3(dir));
  // tables spread across room
  const spacing=250;
  for(let dx=-2;dx<=2;dx++){
    for(let dy=-1;dy<=1;dy++){
      if(rng()<0.7){
        const tp=v3add(cen,v3add(v3scale(tan,dx*spacing),v3scale(dir,dy*spacing)));
        pols.push(rect(tp,dir,90,90,'furniture'));
        // chairs
        for(let a=0;a<4;a++){
          const ang=a*Math.PI/2;
          pols.push(rect(v3add(tp,{x:Math.cos(ang)*80,y:Math.sin(ang)*80,z:0}),dir,40,40,'furniture'));
        }
      }
    }
  }
  // bar counter along first wall
  pols.push(wallCenter(pts,1,40,'furniture',200,50));
  return pols;
}

export function getStoreFront(pts, rng){
  const pols=[];
  const n=pts.length;
  // display counters along walls
  for(let i=1;i<=Math.min(n,3);i++)
    pols.push(wallCenter(pts,i,40,'furniture',150,50));
  // shelving rows
  pols.push(...rowAlongWall(pts,rng,80,30,120,'furniture',40));
  return pols;
}

export function getStoreBack(pts, rng){
  const pols=[];
  // storage shelves along walls
  const n=pts.length;
  for(let i=1;i<=n;i++)
    pols.push(wallCenter(pts,i,30,'furniture',100,40));
  return pols;
}

export function getHallWay(pts, rng){
  const pols=[];
  // coat hanger near entrance wall
  pols.push(wallCenter(pts,1,30,'furniture',80,30));
  // shoe rack
  pols.push(wallCenter(pts,1,30,'furniture',60,25));
  return pols;
}

export function getCorridor(pts, rng){
  const pols=[];
  const n=pts.length;
  // locker along one wall
  pols.push(wallCenter(pts,1,35,'furniture',120,40));
  if(n>=2) pols.push(wallCenter(pts,2,35,'furniture',100,40));
  return pols;
}

export function getCloset(pts, rng){
  const pols=[];
  const n=pts.length;
  // wardrobes + shelves filling walls
  for(let i=1;i<=Math.min(n,3);i++)
    pols.push(wallCenter(pts,i,30,'furniture',100,45));
  return pols;
}

// Dispatch to the right room builder based on room type
export function buildRoomFurniture(pts, type, rng){
  switch(type){
    case 'living':      return getLivingRoom(pts,rng);
    case 'bed':         return getBedRoom(pts,rng);
    case 'bath':        return getBathRoom(pts,rng);
    case 'kitchen':     return getKitchen(pts,rng);
    case 'meeting':     return getMeetingRoom(pts,rng);
    case 'work':        return getWorkingRoom(pts,rng);
    case 'restaurant':  return getRestaurantRoom(pts,rng);
    case 'storeFront':  return getStoreFront(pts,rng);
    case 'storeBack':   return getStoreBack(pts,rng);
    case 'hallway':     return getHallWay(pts,rng);
    case 'corridor':    return getCorridor(pts,rng);
    case 'closet':      return getCloset(pts,rng);
    default:            return [];
  }
}
