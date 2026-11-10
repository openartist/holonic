// Development roadmap: six gated phases from screening the parcel to the
// second-season decision. Phase budgets are the calculator's own line items, and
// the readiness strip reads the drawn plan and the projection, so this tab
// cannot drift from the others.
import { DEFAULT_MODEL, amenitiesCost, infrastructureCost, projectModel } from './model.js';
import { money, savedModel } from './model-ui.js';

export const TOTAL_WEEKS = 104;

export const PHASES = [
  {
    id: 'screen',
    num: '00',
    name: 'Screen the parcel',
    start: 0,
    end: 8,
    owner: 'Founders',
    gate: 'Written county response, insurable legal access and a priced, feasible water and wastewater concept. Stop if any screen fails.',
    steps: [
      { id: 'screen-zoning', title: 'Listing and zoning screen', detail: 'Property B (APN 002-450-019-000), S-1-RE at $7,600: read the use table, not the listing label.', week: 1, owner: 'Founders', tab: 'brief' },
      { id: 'screen-title', title: 'Title, legal access and easements', detail: 'Title report, deed and an insurable route in and out of the parcel.', week: 2, owner: 'Counsel', tab: 'brief' },
      { id: 'screen-visit', title: 'Site visit and hazard screening', detail: 'Heat, dust, flood and fault exposure; survey needs and physical fit.', week: 3, owner: 'Founders', tab: 'plan' },
      { id: 'screen-water', title: 'Water and wastewater feasibility', detail: 'Health-approved concept and vendor pricing; hauled water is not a supply.', week: 5, owner: 'Civil engineer', tab: 'brief' },
      { id: 'screen-fire', title: 'Fire access and drainage review', detail: 'Turn radius, water supply for firefighting and a stormwater route before closing.', week: 6, owner: 'Civil engineer', tab: 'plan' },
      { id: 'screen-gate', title: 'Gate: proceed to acquisition', detail: 'Signed diligence memo and a closing budget with contingency.', week: 8, owner: 'Founders', tab: null },
    ],
  },
  {
    id: 'acquire',
    num: '01',
    name: 'Acquire and form the co-op',
    start: 4,
    end: 18,
    owner: 'Founders · Counsel',
    gate: 'Counsel-cleared offering path, contingency purchase closed and insurance bound before any booking is taken.',
    steps: [
      { id: 'acquire-entity', title: 'Choose and form the entity', detail: 'A co-op corporation owning and operating the park; a founder LLC only if timing demands it.', week: 6, owner: 'Counsel', tab: 'brief' },
      { id: 'acquire-rights', title: 'Define membership rights and capital treatment', detail: 'Refunds, transferability and dues before a price becomes an offer; capital is not income.', week: 8, owner: 'Counsel', tab: 'brief' },
      { id: 'acquire-offering', title: 'Offering and securities review', detail: 'DRE and consumer analysis of the rights actually sold, including use memberships.', week: 10, owner: 'Counsel', tab: 'brief' },
      { id: 'acquire-escrow', title: 'Purchase agreement, contingencies and closing', detail: 'Land and closing costs; never waive the water, access or zoning contingencies.', week: 14, owner: 'Founders', tab: 'model' },
      { id: 'acquire-insurance', title: 'Bind insurance for the approved use', detail: 'Quote only after the county confirms occupancy and event limits.', week: 16, owner: 'Broker', tab: 'brief' },
      { id: 'acquire-gate', title: 'Gate: close and capitalise', detail: 'Membership capital and any loan committed, reserves funded.', week: 18, owner: 'Board', tab: null },
    ],
  },
  {
    id: 'design',
    num: '02',
    name: 'Design and approvals',
    start: 10,
    end: 34,
    owner: 'Surveyor · Civil · County',
    gate: 'Approved drawings, conditions of approval in writing and permits issued for a scope the insurance market will cover.',
    steps: [
      { id: 'design-survey', title: 'Survey and civil fit to the parcel', detail: 'The generator is a concept study; a licensed surveyor and civil designer fit it to the real parcel.', week: 12, owner: 'Surveyor', tab: 'plan' },
      { id: 'design-class', title: 'Park classification and stay limits', detail: 'Written county interpretation of park type, occupancy duration and the community plan.', week: 16, owner: 'Counsel', tab: 'brief' },
      { id: 'design-health', title: 'Health approval for water and sanitation', detail: 'Approved source and disposal, including shower and sink wastewater.', week: 20, owner: 'Health dept', tab: 'brief' },
      { id: 'design-access', title: 'Fire, drainage and accessible route', detail: 'Access width, turnarounds and firm accessible paths to every shared facility.', week: 22, owner: 'Civil engineer', tab: 'plan' },
      { id: 'design-events', title: 'Event, assembly and food-service limits', detail: 'Capacity, hours, noise, alcohol and kitchen classification in writing.', week: 24, owner: 'County', tab: 'brief' },
      { id: 'design-permits', title: 'Permits and plan check', detail: 'Building, electrical, plumbing and park permits.', week: 30, owner: 'Architect', tab: 'model' },
      { id: 'design-gate', title: 'Gate: permits in hand', detail: 'Approved set, conditions and an insurable scope before mobilising.', week: 34, owner: 'Board', tab: null },
    ],
  },
  {
    id: 'build',
    num: '03',
    name: 'Build',
    start: 26,
    end: 54,
    owner: 'Contractor · Board',
    gate: 'Signed inspections, commissioned systems, punch list closed and the opening reserve intact after overruns.',
    steps: [
      { id: 'build-civil', title: 'Site, access and drainage works', detail: 'Grading, drive, parking pads and stormwater route.', week: 30, owner: 'Contractor', tab: 'model' },
      { id: 'build-water', title: 'Water system installation', detail: 'Source, storage, treatment and distribution to each space.', week: 34, owner: 'Contractor', tab: 'model' },
      { id: 'build-waste', title: 'Wastewater system installation', detail: 'Approved septic or collection, sized for the approved occupancy.', week: 36, owner: 'Contractor', tab: 'model' },
      { id: 'build-solar', title: 'Shared solar and equipment', detail: 'Load and permit review for common infrastructure and battery storage.', week: 38, owner: 'Contractor', tab: 'model' },
      { id: 'build-core', title: 'Community core', detail: 'Hall ~1,200 sf, kitchen/prep ~400, dining ~1,000, showers and a ~400 sf stage.', week: 44, owner: 'Contractor', tab: 'plan' },
      { id: 'build-spaces', title: 'Member spaces, resident and visitor stalls', detail: 'Mark spaces and accessible bays; size parking from the drawn lots and keep it at the edge, never internal.', week: 48, owner: 'Contractor', tab: 'plan' },
      { id: 'build-commission', title: 'Commissioning, inspections and contingency', detail: 'System tests, signed inspections and a funded opening reserve.', week: 52, owner: 'Board', tab: 'model' },
      { id: 'build-gate', title: 'Gate: ready to open', detail: 'Punch list closed, insurance current and bookings limited to released spaces.', week: 54, owner: 'Board', tab: null },
    ],
  },
  {
    id: 'launch',
    num: '04',
    name: 'Launch the first season',
    start: 52,
    end: 76,
    owner: 'General manager · Board',
    gate: '90 operating days plus one full season reviewed: occupancy of released nights, net contribution and reserve balance.',
    steps: [
      { id: 'launch-calendar', title: 'Booking calendar and release rules', detail: 'One calendar, owner priority with written release deadlines and cancellations.', week: 54, owner: 'GM', tab: 'brief' },
      { id: 'launch-dues', title: 'Dues billing and collection', detail: '$150 a month across paying members; reconcile arrears monthly.', week: 56, owner: 'GM', tab: 'model' },
      { id: 'launch-pilot', title: 'Limited bookings on released spaces', detail: 'Direct bookings first, then a small paid retreat pilot.', week: 60, owner: 'GM', tab: 'pl' },
      { id: 'launch-ninety', title: '90-day operating review', detail: 'Staffing, cleaning, parking demand and contribution per booking.', week: 66, owner: 'Board', tab: 'pl' },
      { id: 'launch-season', title: 'One full season review', detail: 'Occupancy of released nights, net co-op contribution and reserve balance.', week: 74, owner: 'Board', tab: 'pl' },
      { id: 'launch-gate', title: 'Gate: continue, adjust or pause', detail: 'Board decision on the second-season scope and budget.', week: 76, owner: 'Board', tab: null },
    ],
  },
  {
    id: 'grow',
    num: '05',
    name: 'Stabilise and decide',
    start: 70,
    end: 104,
    owner: 'Board',
    gate: 'Funded reserves, stable occupancy above break-even, and a written resolution before dues fall or land is added.',
    steps: [
      { id: 'grow-reserve', title: 'Hold the first-season contribution', detail: 'No dues reduction before a full season has been reviewed.', week: 78, owner: 'Treasurer', tab: 'pl' },
      { id: 'grow-review', title: 'Dues and budget review', detail: 'Reconcile baseline and incremental costs so no bill is counted twice.', week: 84, owner: 'Board', tab: 'model' },
      { id: 'grow-parcel', title: 'Second parcel decision (Property A)', detail: '$19,500 ask plus carrying cost; it adds no RV capacity on its own.', week: 92, owner: 'Board', tab: 'brief' },
      { id: 'grow-residency', title: 'Permanent residency and manufactured homes', detail: 'Separate feasibility and approvals; do not promise what is not permitted.', week: 96, owner: 'Counsel', tab: 'brief' },
      { id: 'grow-gate', title: 'Gate: expand or hold', detail: 'Written resolution with funding and approvals before growth.', week: 104, owner: 'Board', tab: null },
    ],
  },
];

const TAB_LABEL = { plan: 'Site plan', model: 'Calculator', pl: 'P&L', brief: 'Brief' };

export function allSteps() {
  return PHASES.flatMap((p) => p.steps.map((s) => ({ ...s, phase: p.id })));
}

// Each budget line belongs to exactly one phase, and the phases add up to the
// calculator's project cost.
export function phaseBudgets(m = DEFAULT_MODEL) {
  return {
    screen: { cost: m.diligence, lines: ['Diligence & studies'] },
    acquire: { cost: m.landPrice + m.closingCosts + m.legal, lines: ['Land price', 'Closing costs', 'Legal & entity'] },
    design: { cost: m.permits, lines: ['Permits & review'] },
    build: {
      cost: infrastructureCost(m) + amenitiesCost(m) + m.contingency,
      lines: ['Site, access, drainage', 'Water system', 'Wastewater', 'Solar & equipment',
        'Community amenities', 'Contingency'],
    },
    launch: { cost: m.openingReserve, lines: ['Opening reserve'] },
    grow: { cost: 0, lines: [] },
  };
}

export function progress(done = {}) {
  const steps = allSteps();
  const complete = steps.filter((s) => done[s.id]).length;
  const byPhase = {};
  for (const p of PHASES) byPhase[p.id] = p.steps.filter((s) => done[s.id]).length;
  const open = PHASES.find((p) => byPhase[p.id] < p.steps.length) || null;
  return {
    total: steps.length,
    complete,
    pct: steps.length ? Math.round((complete / steps.length) * 100) : 0,
    byPhase,
    nextGate: open ? { id: open.id, num: open.num, name: open.name, gate: open.gate } : null,
  };
}

export function progressHtml(prog) {
  return `<span class="plabel">${prog.complete} of ${prog.total} steps</span>
    <span class="pbar"><i style="width:${prog.pct}%"></i></span>
    <span class="ppct">${prog.pct}%</span>`;
}

export function nextGateHtml(prog) {
  if (!prog.nextGate) return '<b>All gates closed</b> — hold the position and review annually.';
  return `<b>Next gate</b> ${prog.nextGate.num} · ${prog.nextGate.name}`;
}

export function tiesHtml(plan, result) {
  const m = result.model;
  const stats = (plan && plan.stats) || plan || {};
  const lots = Number.isFinite(stats.sites) ? stats.sites : Number.isFinite(stats.lots) ? stats.lots : m.spaces;
  const visitor = Number.isFinite(stats.visitorStalls) ? stats.visitorStalls : null;
  const resident = Number.isFinite(stats.residentStalls) ? stats.residentStalls : null;
  const chips = [
    {
      tab: 'plan',
      ok: lots === m.spaces,
      text: `${lots} lots drawn · ${m.spaces} in the model`,
    },
  ];
  const stalls = Number.isFinite(stats.parking) ? stats.parking : visitor != null && resident != null ? visitor + resident : null;
  if (stalls != null) {
    const need = Math.round(m.spaces * 1.4);
    chips.push({ tab: 'plan', ok: stalls >= need, text: `${stalls} stalls for ${m.spaces} spaces (${need} needed)` });
  }
  chips.push({
    tab: 'model',
    ok: result.kpis.gap <= 0,
    text: result.kpis.gap <= 0 ? `Build funded, ${money(-result.kpis.gap)} unallocated` : `Funding gap ${money(result.kpis.gap)}`,
  });
  chips.push({
    tab: 'pl',
    ok: result.kpis.noi1 >= 0,
    text: `Year 1 NOI ${money(result.kpis.noi1)}`,
  });
  chips.push({
    tab: 'pl',
    ok: result.kpis.minDscr == null || result.kpis.minDscr >= 1.25,
    text: result.kpis.minDscr == null ? 'No debt in the model' : `Minimum DSCR ${result.kpis.minDscr.toFixed(2)}×`,
  });
  chips.push({ tab: 'brief', state: 'info', text: 'County, health and counsel gates are itemised in the brief' });
  return chips
    .map((c) => {
      const cls = c.state || (c.ok ? 'ok' : 'warn');
      const mark = c.state ? '›' : c.ok ? '✓' : '⚠';
      return `<button type="button" class="tie ${cls}" data-goto="${c.tab}" title="Open ${TAB_LABEL[c.tab]}">${mark} ${c.text}</button>`;
    })
    .join('');
}

export function ganttHtml(done = {}) {
  const weeks = [0, 13, 26, 39, 52, 65, 78, 91, 104];
  const scale = `<div class="gscale">${weeks.map((w) => `<span>W${w}</span>`).join('')}</div>`;
  const rows = PHASES.map((p) => {
    const left = (p.start / TOTAL_WEEKS) * 100;
    const width = ((p.end - p.start) / TOTAL_WEEKS) * 100;
    const ticks = p.steps
      .filter((s) => s.tab !== null)
      .map((s) => `<i class="tick${done[s.id] ? ' done' : ''}" style="left:${(s.week / TOTAL_WEEKS) * 100}%"></i>`)
      .join('');
    return `<div class="grow">
      <span class="glabel">${p.num} ${p.name}</span>
      <span class="gtrack"><i class="gbar" style="left:${left}%;width:${width}%"></i>${ticks}</span>
    </div>`;
  }).join('');
  return `${scale}${rows}`;
}

export function phasesHtml(done = {}, budgets = {}) {
  return PHASES.map((p) => {
    const cost = budgets[p.id] ? money(budgets[p.id].cost) : '';
    const steps = p.steps.map((s) => `
      <li class="step${done[s.id] ? ' done' : ''}">
        <label class="sline">
          <input type="checkbox" data-step="${s.id}"${done[s.id] ? ' checked' : ''} />
          <span class="stitle">${s.title}</span>
        </label>
        <p class="sdetail">${s.detail}</p>
        <div class="smeta">
          <span>W${s.week} · ${s.owner}</span>
          ${s.tab ? `<button type="button" class="jump" data-goto="${s.tab}">${TAB_LABEL[s.tab]}</button>` : '<span class="gate-tag">gate</span>'}
        </div>
      </li>`).join('');
    return `<article class="phase" data-phase="${p.id}">
      <header class="phead">
        <span class="pnum">${p.num}</span>
        <div class="ptitle"><h4>${p.name}</h4><p>Weeks ${p.start}–${p.end} · ${p.owner}${cost ? ` · ${cost}` : ''}</p></div>
        <span class="pcount" id="pc-${p.id}">0/${p.steps.length}</span>
      </header>
      <p class="pgate"><b>Gate</b> ${p.gate}</p>
      <ul class="steps">${steps}</ul>
    </article>`;
  }).join('');
}

export function fundingHtml(result, budgets = phaseBudgets(result.model)) {
  let cumulative = 0;
  const rows = PHASES.map((p) => {
    const b = budgets[p.id] || { cost: 0, lines: [] };
    cumulative += b.cost;
    const share = result.kpis.projectCost > 0 ? (b.cost / result.kpis.projectCost) * 100 : 0;
    return `<tr>
      <td><b>${p.num}</b> ${p.name}<span class="blines">${b.lines.join(' · ') || 'operating — no capital'}</span></td>
      <td class="num">${money(b.cost)}</td>
      <td class="num">${share.toFixed(0)}%</td>
      <td class="num">${money(cumulative)}</td>
    </tr>`;
  }).join('');
  const mismatch = Math.abs(cumulative - result.kpis.projectCost) > 1;
  return `<table class="mini fundtable">
    <thead><tr><th>Phase</th><th class="num">Budget</th><th class="num">Share</th><th class="num">Cumulative</th></tr></thead>
    <tbody>${rows}
      <tr class="tot"><td>Project cost</td><td class="num">${money(cumulative)}</td><td class="num">100%</td><td class="num">${money(cumulative)}</td></tr>
    </tbody>
  </table>
  <div class="fundfacts">
    <span><b>${money(result.kpis.projectCost)}</b> project cost</span>
    <span><b>${money(result.kpis.infraAmenities)}</b> infrastructure & amenities (${money(result.kpis.infrastructure)} works · ${money(result.kpis.amenities)} core)</span>
    <span><b>${money(result.kpis.capital)}</b> membership capital</span>
    <span><b>${money(result.kpis.gap)}</b> ${result.kpis.gap <= 0 ? 'unallocated' : 'gap to fund'}</span>
    <span><b>${result.kpis.minDscr == null ? 'none' : `${result.kpis.minDscr.toFixed(2)}×`}</b> minimum DSCR</span>
  </div>
  ${mismatch ? `<p class="fundwarn">Phase budgets do not add up to the project cost — check the calculator’s build lines.</p>` : ''}`;
}

// ---- DOM wiring -----------------------------------------------------------
let opts = { getPlan: () => null, goTab: () => {} };
let done = {};
let ready = false;

function load() {
  try {
    const raw = localStorage.getItem('holons-roadmap-v1');
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem('holons-roadmap-v1', JSON.stringify(done));
  } catch { /* storage is optional */ }
}

const setHtml = (sel, html) => {
  const el = document.querySelector(sel);
  if (el) el.innerHTML = html;
};

function refresh() {
  const plan = opts.getPlan ? opts.getPlan() : null;
  const spaces = plan && plan.stats && Number.isFinite(plan.stats.sites) ? plan.stats.sites : null;
  let result;
  try {
    result = projectModel(spaces != null ? { ...savedModel(), spaces } : savedModel());
  } catch {
    result = projectModel(DEFAULT_MODEL);
  }
  const prog = progress(done);
  setHtml('#road-progress', progressHtml(prog));
  setHtml('#road-next', nextGateHtml(prog));
  setHtml('#road-ties', tiesHtml(plan, result));
  setHtml('#road-funding', fundingHtml(result));
  setHtml('#road-gantt', ganttHtml(done));
  for (const p of PHASES) setHtml(`#pc-${p.id}`, `${prog.byPhase[p.id]}/${p.steps.length}`);
  document.querySelectorAll('[data-step]').forEach((box) => {
    if (box.closest) {
      const li = box.closest('li');
      if (li && li.classList) li.classList.toggle('done', !!done[box.dataset.step]);
    }
  });
}

export function initRoadmap(o = {}) {
  opts = { ...opts, ...o };
  const phases = document.querySelector('#road-phases');
  if (!phases) return;
  if (!ready) {
    done = load();
    const plan = opts.getPlan ? opts.getPlan() : null;
    const spaces = plan && plan.stats && Number.isFinite(plan.stats.sites) ? plan.stats.sites : null;
    phases.innerHTML = phasesHtml(done, phaseBudgets(spaces != null ? { ...savedModel(), spaces } : savedModel()));
    const pane = document.querySelector('#tab-roadmap');
    if (pane) {
      pane.addEventListener('click', (e) => {
        const target = e.target;
        const btn = target && target.closest ? target.closest('[data-goto]') : null;
        if (btn) opts.goTab(btn.dataset.goto);
      });
    }
    phases.addEventListener('change', (e) => {
      const box = e.target;
      if (!box || !box.dataset || !box.dataset.step) return;
      done[box.dataset.step] = !!box.checked;
      save();
      refresh();
    });
    ready = true;
  }
  refresh();
}
