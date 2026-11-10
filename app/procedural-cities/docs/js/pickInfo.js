// pickInfo.js — what every object on the plan is called, for the hover card.
//
// Kept separate from the renderer so the labels can be audited headlessly:
// `pickables(layout)` returns one entry per object on the plan — a site, a
// cottage, a building, a road polygon, a footpath, a bed, a plaza, a solar
// array, a car park — with the polygon to hit and the card it should show.
// The scene turns each entry into an invisible pick mesh.
//
// Each entry also carries `ref`, the object in the layout the polygon came
// from. The hover card does not need it, but the editor does: a click has to
// resolve back to the source object so a drag can move the polygon the
// renderer reads rather than a mesh it would rebuild away.

import { polyArea } from './utils.js';
import { DECAL_Z as Z } from './decalZ.js';
import { dwellingLabel } from './dwellings.js?v=park-30';

const M2 = 1e-4;
const m = v => (Number(v) / 100).toFixed(1);
const area = p => Math.round(polyArea(p) * M2);

const ROAD = {
  drive: 'Perimeter drive',
  aisle: 'Drive aisle',
  entrance: 'Entrance drive',
  square: 'Square street',
  parking: 'Car-park access',
  spine: 'Spine lane',
  branch: 'Branch lane',
  culdesac: 'Cul-de-sac',
  plaza: 'Common green',
};
const PATH = {
  path: 'Footpath',
  ring: 'Path around a building',
  cross: 'Cross path',
  crossjog: 'Cross path',
  square: 'Plaza footway',
};
const GARDEN = {
  bed: 'Planting bed',
  allotment: 'Allotment',
  perimeter: 'Green edge',
  court: 'Courtyard green',
  veg: 'Veg garden',
  orchard: 'Orchard',
  pond: 'Pond',
  plot: 'Private garden',
  solar: 'Solar field',
};

export function pickables(layout, rules = {}) {
  const out = [];
  const add = (polys, z, info, ref) => {
    const list = (Array.isArray(polys) ? polys : [polys]).filter(p => p && p.length >= 3);
    if (!list.length) return;
    out.push({ polys: list, z, info, ref });
  };

  const village = layout.kind === 'village';

  for (const [i, p] of (layout.pitches || []).entries()) {
    const unit = (p.dwelling || (village ? 'cottage' : 'rv'));
    add([p.points], Z.pad + 6, {
      title: village ? `Cottage ${i + 1}` : `Site ${i + 1}`,
      tag: village ? 'Cottage' : (p.occupied ? 'Occupied' : 'Vacant'),
      rows: village
        ? [['Unit', dwellingLabel(unit)],
           ['Footprint', `${m(p.w)} × ${m(p.d)} m`], ['Storeys', String(p.storeys || 1)]]
        : [['Pitch', `${m(p.w || rules.pitchWidth)} × ${m(p.d || rules.pitchDepth)} m`],
           ['Status', p.occupied ? 'Occupied' : 'Vacant'],
           ['Unit', p.occupied ? dwellingLabel(unit) : '—']],
    }, p);
  }

  for (const f of (layout.facilities || [])) {
    const rows = [['Footprint', `${area(f.points)} m²`]];
    if (f.height > 0) rows.push(['Height', `${m(f.height)} m`]);
    if (f.kind === 'pool') rows.push(['Type', 'Outdoor pool']);
    add([f.points], f.height > 0 ? f.height + 12 : Z.pad + 8, {
      title: f.label, tag: 'Shared building', rows,
    }, f);
  }

  for (const r of (layout.roads || [])) {
    add([r.points], Z.road + 2, {
      title: ROAD[r.kind] || 'Road',
      tag: r.kind === 'plaza' ? 'Green' : 'Road',
      rows: [['Surface', `${area(r.points)} m²`]],
    }, r);
  }

  for (const p of (layout.paths || [])) {
    add([p.points], Z.path + 2, {
      title: PATH[p.kind] || 'Footpath', tag: 'Path',
      rows: [['Width', `${m((rules.pathWidth || 150))} m`]],
    }, p);
  }

  for (const g of (layout.gardens || [])) {
    add([g.points], Z.bedSoil + 2, {
      title: GARDEN[g.kind] || 'Green space', tag: 'Landscape',
      rows: [['Area', `${area(g.points)} m²`]],
    }, g);
  }

  for (const b of (layout.allotmentBeds || [])) {
    add([b], Z.allotment, {
      title: 'Allotment bed', tag: 'Growing',
      rows: [['Area', `${area(b)} m²`]],
    }, b);
  }

  for (const s of (layout.squares || [])) {
    add([s], Z.pad + 10, {
      title: 'Town square', tag: 'Public space',
      rows: [['Area', `${area(s)} m²`]],
    }, s);
  }

  for (const s of (layout.solar || [])) {
    const a = Math.round(s.areaM2 || 0);
    add([s.points], s.roof ? (s.height || 300) + 14 : Z.allotment + 4, {
      title: s.roof ? 'Roof solar array' : 'Ground solar array',
      tag: 'Energy',
      rows: [['Area', `${a} m²`], ['Panels', `${Math.round(a / 1.9)}`]],
    }, s);
  }

  for (const l of (layout.lots || [])) {
    add([l.points], Z.lot + 2, {
      title: 'Car park', tag: 'Parking',
      rows: [['Bays', `${l.bays} × 2`], ['Spaces', String(l.spaces)], ['Area', `${area(l.points)} m²`]],
    }, l);
  }

  return out;
}
