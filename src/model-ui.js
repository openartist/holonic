// Calculator, P&L sheet and summary. The heavy lifting is in model.js; this
// file builds the markup (pure functions, testable without a DOM) and wires the
// inputs when the page runs.
import { DEFAULT_MODEL, FIELD_GROUPS, SCENARIOS, SHEET_ROWS, projectModel, toCsv } from './model.js';
import { getProgram, onProgram } from './program.js';

const STORE = 'holons-model-v2';
const $ = (sel) => document.querySelector(sel);
const state = { values: { ...DEFAULT_MODEL }, overrides: {}, scenario: 'base', result: null, ready: false };

const isNum = (v) => v != null && Number.isFinite(v);
export const fmt = (v, d = 0) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const money = (v) => {
  if (!isNum(v)) return '—';
  const n = Math.round(Math.abs(v)).toLocaleString('en-US');
  return `${v < 0 ? '−' : ''}$${n}`;
};

// ---- markup ---------------------------------------------------------------
const capInner = (cap) => `<span>Site capacity</span><strong>${cap.spaces} spaces</strong><em>${cap.acres} acres · from the site plan</em>`;

export function fieldsHtml(values = state.values) {
  return `<div class="caprow" id="model-caprow">${capInner(getProgram())}</div>` +
    FIELD_GROUPS.map((g, gi) => `
    <fieldset class="fset">
      <legend>${g.group}</legend>
      <div class="fgrid">
        ${g.fields.map(([key, label, unit]) => `
          <label class="mrow" title="${label} · ${unit}">
            <span>${label}</span>
            <span class="mval">
              <input id="in-${key}" data-key="${key}" type="number" step="any" value="${values[key]}" />
              <i>${unit}</i>
            </span>
          </label>`).join('')}
      </div>
    </fieldset>`).join('');
}

export function kpiHtml(result) {
  const k = result.kpis;
  const cards = [
    ['Project cost', money(k.projectCost), 'land, build, reserve'],
    ['Infrastructure & amenities', money(k.infraAmenities), `${money(k.infrastructure)} works · ${money(k.amenities)} community core`],
    ['Membership capital', money(k.capital), `${k.members} members · ${money(k.capital / Math.max(1, k.members))} avg`],
    [k.gap > 0 ? 'Funding gap' : 'Capital surplus', money(Math.abs(k.gap)), k.gap > 0 ? 'above dues and loan' : 'memberships cover the build'],
    ['Year 1 revenue', money(k.rev1), `${money(k.dues1)} dues · ${money(k.gross1)} guest receipts`],
    ['Year 1 NOI', money(k.noi1), `co-op contribution ${money(k.netCoop1)}`],
    ['Stabilised NOI', money(k.stabilised), 'best year in the window'],
    ['Minimum DSCR', k.minDscr == null ? 'no debt' : k.minDscr.toFixed(2), k.minDscr == null ? 'unlevered model' : 'NOI ÷ debt service'],
    ['10-year IRR', k.irr == null ? 'n/a' : `${(k.irr * 100).toFixed(1)}%`, k.irr == null ? 'no member equity at risk' : `${k.equityMultiple.toFixed(2)}× equity multiple`],
    ['Exit value', money(k.terminalValue), `at ${fmt(result.model.capRate, 1)}% cap rate`],
    ['Break-even occupancy', k.breakEven == null ? '—' : `${k.breakEven.toFixed(1)}%`, 'year 1, dues included'],
    ['Ten-year cash', money(k.totalCash), 'after reserve and debt service'],
    ['Payback', k.payback == null ? 'n/a' : `${k.payback.toFixed(1)} yr`, k.payback == null ? 'no equity outlay' : 'on equity invested'],
  ];
  return cards.map(([label, value, hint]) => `
    <div class="kpi">
      <span class="klabel">${label}</span>
      <strong class="kvalue">${value}</strong>
      <span class="khint">${hint}</span>
    </div>`).join('');
}

const cellText = (row, v) => {
  if (!isNum(v)) return '—';
  if (row.unit === 'USD') return money(v);
  if (row.unit === '%') return v.toFixed(row.digits ?? 1);
  if (row.unit === '×') return v.toFixed(row.digits ?? 2);
  return fmt(v, row.digits ?? 0);
};

export function sheetHtml(result, overrides = {}) {
  const years = result.years;
  const cols = 2 + years.length;
  const head = `<thead><tr><th class="line">Line item</th><th class="unit">Unit</th>${years.map((y) => `<th class="num">Y${y.year}</th>`).join('')}</tr></thead>`;
  const ovCell = (key, y, value, hint) => {
    const digits = key === 'occupancy' ? 1 : 0;
    // inputs hold plain, ungrouped numbers so they round-trip through Number()
    const val = value == null ? '' : String(Math.round((key === 'occupancy' ? value * 100 : value) * 100) / 100);
    return `<td class="num ov"><input class="cell" type="text" inputmode="decimal" data-ov="${key}" data-year="${y.year}" value="${val}" placeholder="${fmt(hint, digits)}" aria-label="Year ${y.year} ${key} override" /></td>`;
  };
  const overridesRow = `
    <tr class="ovhead"><th colspan="${cols}">Per-year overrides — leave blank to follow the growth curve</th></tr>
    <tr class="ovrow"><th class="line">Occupancy override</th><td class="unit">%</td>${years.map((y) => ovCell('occupancy', y, overrides[y.year]?.occupancy, y.occupancyPct)).join('')}</tr>
    <tr class="ovrow"><th class="line">Nightly rate override</th><td class="unit">USD</td>${years.map((y) => ovCell('rate', y, overrides[y.year]?.rate, y.rate)).join('')}</tr>`;
  const body = SHEET_ROWS.map((row) => {
    if (row.section) return `<tr class="sec"><th colspan="${cols}">${row.section}</th></tr>`;
    const cls = [row.total ? 'tot' : '', row.memo ? 'memo' : '', row.emphasis ? 'emph' : ''].filter(Boolean).join(' ');
    return `<tr class="${cls}"><th class="line">${row.label}</th><td class="unit">${row.unit}</td>${years
      .map((y) => {
        const v = y[row.key];
        return `<td class="num${isNum(v) && v < 0 ? ' neg' : ''}">${cellText(row, v)}</td>`;
      })
      .join('')}</tr>`;
  }).join('');
  const terminal = `<tr class="tot"><th class="line">Terminal value at exit</th><td class="unit">USD</td>${years
    .map((_, i) => `<td class="num">${i === years.length - 1 ? money(result.kpis.terminalValue) : ''}</td>`)
    .join('')}</tr>`;
  return `${head}<tbody>${overridesRow}${body}${terminal}</tbody>`;
}

export function summaryHtml(result) {
  const y = result.years[0];
  const k = result.kpis;
  const line = (label, value, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="num">${money(value)}</td></tr>`;
  return `
    <section class="card">
      <h3>Funding</h3>
      <table class="mini">
        ${line('Project cost', k.projectCost)}
        ${line('Infrastructure', k.infrastructure)}
        ${line('Amenities', k.amenities)}
        ${line('Infrastructure & amenities', k.infraAmenities, 'sub')}
        ${line(`Membership capital (${k.members})`, k.capital)}
        ${line('Loan', result.funding.loan)}
        ${line(k.gap > 0 ? 'Gap to fund' : 'Unallocated capital', Math.abs(k.gap), 'tot')}
      </table>
    </section>
    <section class="card">
      <h3>Year 1 bridge</h3>
      <table class="mini">
        ${line('Lodging receipts (gross)', y.lodging)}
        ${line('Owner payout pool (60%)', y.ownerPool)}
        ${line('Co-op lodging share (40%)', y.coopLodging)}
        ${line('Retreats, events, parking', y.retreats + y.events + y.parking)}
        ${line('Incremental rental costs', -y.incremental)}
        ${line('Net co-op contribution', y.netCoopContribution, 'tot')}
        ${line('Member dues collected', y.dues)}
        ${line('Baseline services, admin, upkeep', -y.baseline)}
        ${line('Property tax', -y.propertyTax)}
        ${line('Net operating income', y.noi, 'tot')}
      </table>
    </section>
    <section class="card">
      <h3>What the numbers mean</h3>
      <ul class="mnotes">
        <li>The co-op view counts dues and its 40% lodging share; the owner payout is a memo line, not co-op revenue.</li>
        <li>Transient occupancy tax is collected and remitted, never revenue: ${money(y.tot)} in year 1 is a pass-through liability.</li>
        <li>Membership contributions fund the build, so they are not counted as operating income or as dues.</li>
        <li>Every value is an assumption from the plan document, editable above; nothing here is an appraisal or a booking forecast.</li>
      </ul>
    </section>`;
}

export function notesHtml(result) {
  const k = result.kpis;
  return [
    `Model runs ${k.members} spaces: ${money(k.gross1)} guest receipts and ${money(k.netCoop1)} net co-op contribution in year 1.`,
    `Cumulative cash after ten years is ${money(k.totalCash)}${k.payback == null ? '; memberships cover the build, so there is no equity payback to compute' : `, payback in ${k.payback.toFixed(1)} years`}.`,
    k.minDscr != null && k.minDscr < 1.25
      ? `Minimum DSCR is ${k.minDscr.toFixed(2)}: at this NOI the model cannot carry the loan, which is why the plan funds the build from memberships.`
      : `Minimum DSCR is ${k.minDscr == null ? 'not applicable (no loan)' : k.minDscr.toFixed(2)}.`,
    `Infrastructure and amenities total ${money(k.infraAmenities)}: ${money(k.infrastructure)} of site works, water, wastewater and solar, and ${money(k.amenities)} of community core. The plan budgets no hall, kitchen, dining or stage, so those lines start at zero until a quote is entered.`,
    'Dues are member income, not rent; the plan treats them as the baseline operating budget, so they appear in revenue and the baseline services line appears in costs.',
  ].map((t) => `<p>${t}</p>`).join('');
}

// ---- DOM wiring -----------------------------------------------------------
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && saved.values) state.values = { ...DEFAULT_MODEL, ...saved.values };
    if (saved && saved.overrides) state.overrides = saved.overrides;
    if (saved && saved.scenario) state.scenario = saved.scenario;
  } catch { /* storage is optional */ }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ values: state.values, overrides: state.overrides, scenario: state.scenario }));
  } catch { /* storage is optional */ }
}

function syncFields() {
  for (const g of FIELD_GROUPS) {
    for (const [key] of g.fields) {
      const input = $(`#in-${key}`);
      if (input) input.value = state.values[key];
    }
  }
}

function compute() {
  const result = projectModel(state.values, state.overrides);
  state.result = result;
  const kpis = $('#model-kpis');
  const summary = $('#model-summary');
  const sheet = $('#model-sheet');
  const notes = $('#model-notes');
  if (kpis) kpis.innerHTML = kpiHtml(result);
  if (summary) summary.innerHTML = summaryHtml(result);
  if (sheet) sheet.innerHTML = sheetHtml(result, state.overrides);
  if (notes) notes.innerHTML = notesHtml(result);
  const cap = getProgram();
  const capLine = $('#model-capacity');
  if (capLine) capLine.textContent = `${cap.spaces} spaces · ${cap.acres} acres from the site plan`;
  const capRow = $('#model-caprow');
  if (capRow) capRow.innerHTML = capInner(cap);
  document.querySelectorAll('[data-scenario]').forEach((b) => {
    const on = b.dataset.scenario === state.scenario;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  save();
}

function applyScenario(name) {
  const s = SCENARIOS[name];
  if (!s) return;
  Object.assign(state.values, s.values);
  state.overrides = {};
  state.scenario = name;
  syncFields();
  compute();
}

function onSheetChange(e) {
  const input = e.target && e.target.closest ? e.target.closest('input[data-ov]') : null;
  if (!input) return;
  const year = Number(input.dataset.year);
  const key = input.dataset.ov;
  const raw = String(input.value).trim();
  const ov = { ...(state.overrides[year] || {}) };
  if (raw === '') {
    delete ov[key];
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      input.value = '';
      return;
    }
    ov[key] = key === 'occupancy' ? Math.min(1, Math.max(0, n / 100)) : Math.max(0, n);
  }
  state.overrides[year] = ov;
  compute();
}

// The roadmap reads the same saved assumptions, so both tabs agree.
export function savedModel() {
  try {
    const raw = localStorage.getItem(STORE);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.values) return { ...DEFAULT_MODEL, ...saved.values };
  } catch { /* storage is optional */ }
  return { ...DEFAULT_MODEL };
}

export function initModel() {
  const fields = $('#model-fields');
  if (!fields) return;
  if (!state.ready) {
    load();
    fields.innerHTML = fieldsHtml();
    document.querySelectorAll('#model-fields input').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        const n = Number(input.value);
        if (input.value !== '' && Number.isFinite(n)) state.values[key] = n;
        compute();
      });
    });
    document.querySelectorAll('[data-scenario]').forEach((b) => {
      b.addEventListener('click', () => applyScenario(b.dataset.scenario));
    });
    const reset = $('#model-reset');
    if (reset) {
      reset.addEventListener('click', () => {
        state.values = { ...DEFAULT_MODEL };
        state.overrides = {};
        state.scenario = 'base';
        syncFields();
        compute();
      });
    }
    const csv = $('#model-csv');
    if (csv) {
      csv.addEventListener('click', () => {
        if (typeof Blob !== 'function' || typeof document.createElement !== 'function') return;
        const blob = new Blob([toCsv(state.result)], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'holons-coop-10-year-pl.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }
    const sheet = $('#model-sheet');
    if (sheet) sheet.addEventListener('change', onSheetChange);
    state.ready = true;
    onProgram(() => compute());
  }
  compute();
}
