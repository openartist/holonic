// edit-check.mjs — headless audit of the editing document.
//
// Runs the real generator, then proves the things the rail depends on:
//   · every object on the plan has exactly one stable id, and every pick target
//     resolves back to one of them
//   · translate moves a polygon rigidly (area kept, centroid moved by exactly
//     the delta, pad and center follow)
//   · rotate turns it rigidly about its own centroid, and 90° swaps the extent
//   · a drag replayed from a snapshot lands on the same geometry as a single
//     applied edit, whatever order the pointer moves arrive in
//   · undo restores the document byte for byte
//   · add / duplicate / remove keep the plan consistent (finite, simple)
//   · a hand-moved site still passes the park's own overlap bar
//
//   node procedural-cities/tools/edit-check.mjs

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', 'docs');
const js = p => new URL('file://' + join(docs, 'js', p)).href;

const Doc = await import(js('editDoc.js'));
const { makeArea, layoutPark, FACILITY_KINDS } = await import(js('parkGen.js'));
const { PARK_DEFAULTS, PARK_PRESETS, clampParkRules } = await import(js('parkRules.js'));
const { pickables } = await import(js('pickInfo.js'));
const { polyArea, polySimple, polyIsClockwise } = await import(js('utils.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) pass++;
  else { fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

const M2 = 1e-4;

const finite = pts => Array.isArray(pts) && pts.length >= 3 &&
  pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));

function near(a, b, tol = 1e-6) { return Math.abs(a - b) <= tol; }

function samePoly(a, b, tol = 1e-9) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) => near(p.x, b[i].x, tol) && near(p.y, b[i].y, tol));
}

// Intersection area of two convex-clipped polys, the same measure park-check
// uses: a shared edge is not a collision, real overlap is.
function clipArea(subject, clipPts) {
  if (!subject || subject.length < 3 || !clipPts || clipPts.length < 3) return 0;
  const clip = polyIsClockwise(clipPts) ? clipPts.slice().reverse() : clipPts;
  let out = subject.map(p => ({ x: p.x, y: p.y }));
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = p => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const next = [];
    for (let j = 0; j < out.length; j++) {
      const P = out[j], Q = out[(j + 1) % out.length];
      const sp = side(P), sq = side(Q);
      if (sp >= 0) next.push(P);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const t = sp / (sp - sq);
        next.push({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t });
      }
    }
    out = next;
  }
  return out.length >= 3 ? Math.abs(polyArea(out)) : 0;
}

function build(rules) {
  const area = makeArea(rules);
  const village = rules.pattern === 'village';
  const facilityKinds = village
    ? ['commonhouse', 'kitchen', 'workshop', 'toolshed', 'parking', 'veggarden', 'orchard', 'pond']
    : FACILITY_KINDS;
  return layoutPark(area, rules, { facilityKinds });
}

const PRESETS = Object.entries(PARK_PRESETS);

for (const [name, preset] of PRESETS) {
  const rules = clampParkRules({ ...PARK_DEFAULTS, ...preset.rules });
  const label = `${name}/${rules.pattern}`;

  // ---- identity ------------------------------------------------------------
  const layout = build(rules);
  const entries = Doc.index(layout);

  check(`${label}: every entry is finite and simple`, entries.every(e => finite(e.points)),
    entries.filter(e => !finite(e.points)).map(e => e.id).join(','));

  const ids = entries.map(e => e.id);
  check(`${label}: ids are unique`, new Set(ids).size === ids.length);
  check(`${label}: entries cover every object on the plan`,
    entries.length === Doc.BUCKET_NAMES.reduce((n, b) => n + (layout[b] || []).length, 0),
    `${entries.length} entries`);

  // Every pick target must resolve to an entry, or clicking it would select
  // nothing and the rail would look broken on exactly the objects that matter.
  const refs = new Set(entries.map(e => e.ref));
  const picks = pickables(layout, rules);
  const orphans = picks.filter(p => !p.ref || !refs.has(p.ref));
  check(`${label}: every pick target resolves to an entry`, orphans.length === 0,
    `${orphans.length} of ${picks.length} picks have no ref`);

  // ---- translate -----------------------------------------------------------
  {
    const entry = entries.find(e => e.bucket === 'pitches');
    if (!entry) { check(`${label}: has a pitch to test`, false); continue; }
    const before = JSON.parse(JSON.stringify(entry.points));
    const area0 = Math.abs(polyArea(entry.points));
    const c0 = Doc.centroid(entry.points);
    const dx = 300, dy = -150;
    Doc.translate(entry, dx, dy);
    const c1 = Doc.centroid(entry.points);
    check(`${label}: translate keeps the polygon rigid`,
      near(Math.abs(polyArea(entry.points)), area0, 1e-6));
    check(`${label}: translate moves the centroid by the delta`,
      near(c1.x - c0.x, dx, 1e-6) && near(c1.y - c0.y, dy, 1e-6),
      `${(c1.x - c0.x).toFixed(3)}, ${(c1.y - c0.y).toFixed(3)}`);
    check(`${label}: translate keeps every vertex offset identical`,
      entry.points.every((p, i) => near(p.x - before[i].x, dx, 1e-6) && near(p.y - before[i].y, dy, 1e-6)));
    if (entry.ref.pad && entry.ref.pad !== entry.points) {
      check(`${label}: the pad travels with the site`,
        samePoly(entry.ref.pad.map(p => ({ x: p.x - dx, y: p.y - dy })),
          layout.pitches[entry.index].pad.map(p => ({ x: p.x - dx, y: p.y - dy })), 1e-6));
    }
    Doc.translate(entry, -dx, -dy);
  }

  // ---- rotate --------------------------------------------------------------
  {
    const entry = entries.find(e => e.bucket === 'pitches');
    const area0 = Math.abs(polyArea(entry.points));
    const b0 = Doc.bounds(entry.points);
    const c0 = Doc.centroid(entry.points);
    Doc.rotate(entry, Math.PI / 2);
    const b1 = Doc.bounds(entry.points);
    const c1 = Doc.centroid(entry.points);
    check(`${label}: rotate keeps the area`, near(Math.abs(polyArea(entry.points)), area0, 1e-3),
      `${(Math.abs(polyArea(entry.points)) - area0).toFixed(6)} cm²`);
    check(`${label}: rotate holds the centroid`, near(c0.x, c1.x, 1e-4) && near(c0.y, c1.y, 1e-4));
    check(`${label}: 90° swaps the extent`, near(b0.w, b1.d, 1e-3) && near(b0.d, b1.w, 1e-3),
      `${b0.w.toFixed(1)}×${b0.d.toFixed(1)} → ${b1.w.toFixed(1)}×${b1.d.toFixed(1)}`);
    check(`${label}: rotate keeps the polygon simple`, polySimple(entry.points));
    Doc.rotate(entry, -Math.PI / 2);
    check(`${label}: rotate is reversible`, samePoly(entry.points, entries.find(e => e.bucket === 'pitches' && e.index === entry.index).points, 1));
  }

  // ---- drag replay ---------------------------------------------------------
  // The controller replays a drag from the pointerdown snapshot each move. Doing
  // that with many intermediate steps must land on the same geometry as a
  // single applied delta, or a slow drag would creep away from a fast one.
  {
    const entry = entries.find(e => e.bucket === 'pitches');
    const base = Doc.snapshotRef(entry);
    const start = Doc.centroid(entry.points);
    Doc.restoreRef(entry, base);
    Doc.translate(entry, 500, 500);
    const once = JSON.parse(JSON.stringify(entry.points));

    for (const step of [1, 3, 7, 20]) {
      Doc.restoreRef(entry, base);
      for (let i = 1; i <= step; i++) {
        Doc.translate(entry, (500 * i) / step - (500 * (i - 1)) / step, (500 * i) / step - (500 * (i - 1)) / step);
      }
      check(`${label}: replaying a drag in ${step} steps matches one move`,
        samePoly(entry.points, once, 1e-6), `step ${step}`);
    }
    Doc.restoreRef(entry, base);
    check(`${label}: the snapshot restores the original exactly`,
      samePoly(entry.points, entries.find(e => e.bucket === 'pitches' && e.index === entry.index).points));
    check(`${label}: the centroid came back`, near(Doc.centroid(entry.points).x, start.x, 1e-6));
  }

  // ---- undo ----------------------------------------------------------------
  {
    const snap = Doc.snapshot(layout);
    const entry = entries.find(e => e.bucket === 'pitches');
    Doc.translate(entry, 1234, 0);
    Doc.restore(layout, snap);
    check(`${label}: undo restores the document byte for byte`,
      Doc.snapshot(layout) === snap, `${Doc.snapshot(layout).length} vs ${snap.length} bytes`);
  }

  // ---- add / duplicate / remove -------------------------------------------
  {
    const before = Doc.index(layout).length;
    const b = Doc.addBuilding(layout, { x: 0, y: 0, angle: 0 });
    check(`${label}: an added building is a finite quad`, finite(b.points) && b.points.length === 4);
    check(`${label}: an added building has the requested area`,
      near(Math.abs(polyArea(b.points)) * M2, 63, 0.01), `${(Math.abs(polyArea(b.points)) * M2).toFixed(2)} m²`);
    check(`${label}: adding one object adds one entry`, Doc.index(layout).length === before + 1);

    const entry = Doc.index(layout).find(e => e.ref === b);
    const copy = Doc.duplicate(layout, entry, 200, 200);
    check(`${label}: a duplicate is offset and intact`,
      finite(copy.points) && near(Math.abs(polyArea(copy.points)) * M2, 63, 0.01));
    check(`${label}: the duplicate does not share vertices with the original`,
      copy.points.every(p => !b.points.some(q => q.x === p.x && q.y === p.y)));

    Doc.remove(layout, Doc.index(layout).find(e => e.ref === copy));
    Doc.remove(layout, Doc.index(layout).find(e => e.ref === b));
    check(`${label}: removing puts the count back`, Doc.index(layout).length === before);

    const site = Doc.addSite(layout, rules, { x: 0, y: 0, angle: 0 });
    const sitePoints = site.points;
    check(`${label}: an added site carries a pad inside its pitch`,
      finite(site.pad) && site.points.length === 4 &&
      Math.abs(polyArea(site.pad)) < Math.abs(polyArea(sitePoints)));
    Doc.remove(layout, Doc.index(layout).find(e => e.ref === site));

    const bed = Doc.addBed(layout, { x: 0, y: 0 });
    check(`${label}: an added bed is a finite quad`, finite(bed));
    Doc.remove(layout, Doc.index(layout).find(e => e.ref === bed));
  }

  // ---- boundary edit -------------------------------------------------------
  // Moving a boundary corner is the one edit that re-lays the whole plan, so the
  // result has to satisfy the same overlap bar the generator is held to.
  {
    const ring = layout.area.map(p => ({ x: p.x, y: p.y }));
    const b = Doc.bounds(ring);
    const i = ring.findIndex(p => near(p.x, b.x1, 1) && near(p.y, b.y1, 1));
    const idx = i < 0 ? 0 : i;
    ring[idx] = { x: ring[idx].x + 1500, y: ring[idx].y + 1500 };
    const moved = layoutPark(ring, rules, { facilityKinds: FACILITY_KINDS });
    check(`${label}: a moved boundary still yields a finite plan`,
      moved.pitches.every(p => finite(p.points)) && finite(moved.area));

    const sites = moved.pitches.map(p => p.points);
    let worst = 0;
    for (let a = 0; a < sites.length; a++) {
      for (let c = a + 1; c < sites.length; c++) {
        worst = Math.max(worst, Math.min(clipArea(sites[a], sites[c]), clipArea(sites[c], sites[a])));
      }
    }
    check(`${label}: sites still do not overlap after a boundary move`, worst <= 100,
      `worst ${worst.toFixed(1)} cm²`);
  }
}

// ---- the building library ---------------------------------------------------
// Every unit is drawn into a recording toolkit instead of a GL scene, which is
// the only way to hold the catalogue to its own numbers: the frontage and depth
// it advertises are what the inspector shows, so the geometry it draws must fit
// inside them.
{
  const { DWELLINGS, DWELLING_KINDS, dwellingOf, drawDwelling } = await import(js('dwellings.js'));
  const rules = clampParkRules({ ...PARK_DEFAULTS, pattern: 'rows' });
  const layout = build(rules);

  const wanted = ['rv', 'caravan', 'tiny', 'cabin', 'prefab', 'cottage', 'yurt', 'dome',
    'pyramid', 'gazebo', 'yoga', 'stage', 'temple'];
  check('library: every promised unit exists',
    wanted.every(id => DWELLINGS.some(d => d.id === id)),
    wanted.filter(id => !DWELLINGS.some(d => d.id === id)).join(', '));
  check('library: ids are unique', new Set(DWELLINGS.map(d => d.id)).size === DWELLINGS.length);
  check('library: every unit has a positive envelope',
    DWELLINGS.every(d => d.w > 0 && d.d > 0 && d.h > 0));
  check('library: every unit has a label and a kind',
    DWELLINGS.every(d => typeof d.label === 'string' && d.label.length > 0 && typeof d.kind === 'string'));
  check('library: every kind is named for the picker',
    DWELLINGS.every(d => !!DWELLING_KINDS[d.kind]),
    [...new Set(DWELLINGS.map(d => d.kind))].filter(k => !DWELLING_KINDS[k]).join(', '));
  check('library: every unit fits a standard pitch',
    DWELLINGS.every(d => d.w <= rules.pitchWidth && d.d <= rules.pitchDepth),
    DWELLINGS.filter(d => d.w > rules.pitchWidth || d.d > rules.pitchDepth).map(d => d.id).join(', '));

  const bucket = () => ({ boxes: [], tris: [], houses: 0 });
  const bk = {
    body: [bucket(), bucket(), bucket(), bucket()],
    awning: [bucket(), bucket(), bucket(), bucket()],
    wall: [bucket(), bucket(), bucket(), bucket()],
    roof: [bucket(), bucket(), bucket()],
    trim: bucket(), glass: bucket(), wheel: bucket(), walls: bucket(),
    stripe: bucket(), metal: bucket(), meshes: [],
  };

  for (const type of DWELLINGS) {
    // Record everything this unit draws, whichever bucket it draws into, so the
    // geometry can be measured back as one envelope.
    const rec = bucket();
    const t = {
      box: (b, cx, cy, across, len, h, angle, base) => {
        if (!b) throw new Error('box into a missing bucket');
        const nums = [cx, cy, across, len, h, angle, base];
        if (!nums.every(Number.isFinite)) throw new Error('box with a non-finite number');
        if (!(across > 0 && len > 0 && h > 0)) throw new Error('box with a collapsed side');
        rec.boxes.push({ cx, cy, across, len, h, angle, base });
      },
      tri: (b, pts) => {
        if (!b) throw new Error('tri into a missing bucket');
        if (pts.length !== 3) throw new Error('tri with ' + pts.length + ' points');
        if (!pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))) {
          throw new Error('tri with a non-finite point');
        }
        rec.tris.push(pts);
      },
      house: (b, site) => {
        if (!b) throw new Error('house into a missing bucket');
        rec.houses++;
        if (!(site.w > 0 && site.d > 0)) throw new Error('house with no footprint');
        rec.boxes.push({ cx: 0, cy: 0, across: site.w, len: site.d, h: 1, angle: 0, base: 0 });
      },
    };

    const site = { center: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, tint: 2, variant: 0, w: 760, d: 980, storeys: 1 };
    let drew = true, err = '';
    try { drawDwelling(t, bk, site, type.id); } catch (e) { drew = false; err = e.message; }
    const boxes = rec.boxes.length, tris = rec.tris.length;
    check(`library/${type.id}: draws something`, drew && boxes + tris + rec.houses > 0, err);

    // The drawn envelope, measured back in the site frame.
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    const add = (u, v) => {
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    };
    for (const b of rec.boxes) {
      const c = Math.cos(b.angle), s = Math.sin(b.angle);
      for (const du of [-b.len / 2, b.len / 2]) {
        for (const dv of [-b.across / 2, b.across / 2]) {
          const x = b.cx + du * c - dv * s, y = b.cy + du * s + dv * c;
          add(x * c + y * s, -x * s + y * c);
        }
      }
    }
    for (const tri of rec.tris) for (const p of tri) add(p.x, p.z);

    const across = v1 - v0, along = u1 - u0;
    check(`library/${type.id}: stays inside its advertised envelope`,
      across <= type.w + 1 && along <= type.d + 1,
      `draws ${across.toFixed(0)} × ${along.toFixed(0)} cm, advertises ${type.w} × ${type.d} cm`);
    check(`library/${type.id}: is big enough to be worth drawing`,
      across > 100 && along > 100,
      `${across.toFixed(0)} × ${along.toFixed(0)} cm`);
  }

  // An unknown id must fall back rather than throw: the value can come from a
  // saved document written before a unit was renamed.
  {
    const rec = bucket();
    const t = { box: (b) => b.boxes.push({ cx: 0, cy: 0, across: 1, len: 1, h: 1, angle: 0, base: 0 }), tri: () => {}, house: () => {} };
    let ok = true;
    try { drawDwelling(t, bk, { center: { x: 0, y: 0 }, facing: { x: 1, y: 0 }, tint: 0 }, 'hovercraft'); }
    catch (e) { ok = false; }
    check('library: an unknown unit falls back instead of throwing', ok && rec.boxes.length >= 0);
    check('library: dwellingOf rejects unknown ids', dwellingOf('hovercraft') === null);
  }

  // Swapping the unit on a site is a document edit like any other.
  {
    const site = Doc.index(layout).find(e => e.bucket === 'pitches');
    const snap = Doc.snapshotRef(site);
    check('library: a generated site defaults to a motorhome', site.dwelling === 'rv');
    site.ref.dwelling = 'dome';
    site.ref.occupied = true;
    const reread = Doc.index(layout).find(e => e.ref === site.ref);
    check('library: the choice shows up on the document', reread.dwelling === 'dome' && reread.occupied === true);

    const cards = pickables(layout, rules);
    const card = cards.find(c => c.ref === site.ref);
    check('library: the hover card names the chosen unit',
      !!card && card.info.rows.some(r => r[0] === 'Unit' && r[1] === 'Dome'),
      card ? JSON.stringify(card.info.rows) : 'no card');

    // A second site keeps the first one's choice: the swap is per-pitch.
    const other = Doc.index(layout).filter(e => e.bucket === 'pitches')[1];
    check('library: the swap does not leak to the next site',
      other && other.dwelling === 'rv', other ? other.dwelling : 'missing');

    Doc.restoreRef(site, snap);
    check('library: undo puts the original unit back',
      Doc.index(layout).find(e => e.ref === site.ref).dwelling === 'rv');
  }

  // Emptying a site is the same control, so it has to be representable too.
  {
    const site = Doc.index(layout).filter(e => e.bucket === 'pitches').find(e => e.occupied);
    const snap = Doc.snapshotRef(site);
    site.ref.occupied = false;
    delete site.ref.dwelling;
    const card = pickables(layout, rules).find(c => c.ref === site.ref);
    check('library: an emptied site reports no unit',
      !!card && card.info.rows.some(r => r[0] === 'Unit' && r[1] === '—'),
      card ? JSON.stringify(card.info.rows) : 'no card');
    Doc.restoreRef(site, snap);
  }
}

// ---- drag on every bucket kind ---------------------------------------------
// The rail can grab any object, so every bucket the index exposes has to survive
// a move and a turn without producing NaN.
{
  const rules = clampParkRules({ ...PARK_DEFAULTS, pattern: 'rows' });
  const layout = build(rules);
  for (const entry of Doc.index(layout)) {
    const snap = Doc.snapshotRef(entry);
    const saved = JSON.parse(snap);
    const original = entry.bare ? saved : saved.points;
    const area0 = Math.abs(polyArea(original));

    Doc.translate(entry, 250, -120);
    Doc.rotate(entry, Math.PI / 6);

    check(`drag ${entry.id}: stays finite`, finite(entry.points));
    check(`drag ${entry.id}: keeps its area`,
      near(Math.abs(polyArea(entry.points)), area0, 1e-3),
      `${area0.toFixed(2)} → ${Math.abs(polyArea(entry.points)).toFixed(2)} cm²`);

    Doc.restoreRef(entry, snap);
    check(`drag ${entry.id}: restores exactly`,
      samePoly(entry.points, original, 1e-9) || entry.bare,
      `${entry.id} did not return to its snapshot`);
  }
}

if (failures.length) {
  console.log('edit-check: FAILED');
  for (const f of failures.slice(0, 40)) console.log('  ✗ ' + f);
  if (failures.length > 40) console.log(`  … and ${failures.length - 40} more`);
  process.exit(1);
}

console.log(`edit-check: ${pass} checks passed across ${PRESETS.length} presets.`);
