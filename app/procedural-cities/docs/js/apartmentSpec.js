// apartmentSpec.js — apartment specification blueprints
// Ported from ApartmentSpecification.cpp: LivingSpecification, OfficeSpecification,
// RestaurantSpecification, StoreSpecification, buildApartment, placeMoreEntrances

export const LIVING_BLUEPRINT = {
  needed: [
    { minArea: 50*60, maxArea: 100*120, type: 'bed' },
    { minArea: 100*100, maxArea: 150*150, type: 'living' },
    { minArea: 60*60, maxArea: 100*120, type: 'kitchen' },
    { minArea: 30*30, maxArea: 60*60, type: 'bath' },
  ],
  optional: [
    { minArea: 50*50, maxArea: 100*100, type: 'bed' },
    { minArea: 10*10, maxArea: 40*40, type: 'closet' },
    { minArea: 50*50, maxArea: 100*100, type: 'bed' },
    { minArea: 100*100, maxArea: 150*150, type: 'living' },
    { minArea: 30*30, maxArea: 60*60, type: 'bath' },
  ],
  canHaveBalcony: true,
};

export const OFFICE_BLUEPRINT = {
  needed: [
    { minArea: 100*100, maxArea: 300*300, type: 'meeting' },
    { minArea: 30*30, maxArea: 60*60, type: 'bath' },
  ],
  optional: [
    { minArea: 50*50, maxArea: 300*300, type: 'work' },
    { minArea: 50*50, maxArea: 300*300, type: 'work' },
    { minArea: 50*50, maxArea: 300*300, type: 'work' },
    { minArea: 50*50, maxArea: 300*300, type: 'work' },
  ],
  canHaveBalcony: false,
};

export const RESTAURANT_BLUEPRINT = {
  needed: [
    { minArea: 50*50, maxArea: 1000*1000, type: 'restaurant' },
  ],
  optional: [
    { minArea: 50*50, maxArea: 1000*1000, type: 'restaurant' },
  ],
  canHaveBalcony: false,
  placeMoreEntrances: true,
};

export const STORE_BLUEPRINT = {
  needed: [
    { minArea: 200*200, maxArea: 400*400, type: 'storeFront' },
  ],
  optional: [
    { minArea: 30*30, maxArea: 60*60, type: 'bath' },
    { minArea: 50*50, maxArea: 200*200, type: 'storeBack' },
  ],
  canHaveBalcony: false,
  placeMoreEntrances: true,
};

// Assign room types to apartment rooms based on blueprint
// rooms: array of room polygons (each has .points, .windows, .entrances)
// blueprint: one of the above blueprints
// rng: seeded random function
export function assignRoomTypes(rooms, blueprint, rng){
  const assignments=[];
  const needed=[...blueprint.needed];
  const optional=[...blueprint.optional];
  for(const room of rooms){
    let assigned=null;
    // try needed first
    for(let i=0;i<needed.length;i++){
      assigned=needed[i].type;
      needed.splice(i,1);
      break;
    }
    if(!assigned&&optional.length>0){
      const idx=Math.floor(rng()*optional.length);
      assigned=optional[idx].type;
      optional.splice(idx,1);
    }
    assignments.push(assigned||'living');
  }
  return assignments;
}

// placeMoreEntrances: for restaurant/store, mark window walls as entrances
export function placeMoreEntrances(rooms){
  for(const r of rooms){
    if(!r.windows)continue;
    for(const i of r.windows){
      const p1=r.points[i-1],p2=r.points[i%r.points.length];
      if(p1&&p2){
        const dx=p2.x-p1.x,dy=p2.y-p1.y;
        if(Math.hypot(dx,dy)>150) r.entrances.add(i);
      }
    }
  }
}

// Get the blueprint for a given building type
export function getBlueprintForType(buildingType, rng){
  if(buildingType==='apartment') return LIVING_BLUEPRINT;
  if(buildingType==='office') return OFFICE_BLUEPRINT;
  if(buildingType==='restaurant') return RESTAURANT_BLUEPRINT;
  if(buildingType==='store') return STORE_BLUEPRINT;
  // random for unknown
  const r=rng();
  if(r<0.4) return LIVING_BLUEPRINT;
  if(r<0.6) return OFFICE_BLUEPRINT;
  if(r<0.8) return RESTAURANT_BLUEPRINT;
  return STORE_BLUEPRINT;
}
