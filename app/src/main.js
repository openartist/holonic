import { generatePlan, randomSeed } from './generate.js';
import { setProgram } from './program.js';
import { FACILITIES } from './facilities.js';
import { renderPlan } from './render.js';
import { initModel } from './model-ui.js';
import { initRoadmap } from './roadmap.js';
import { initDeck } from './deck-ui.js';
import { initDocuments } from './documents.js';
import { initBrief } from './brief.js';
import { initHome } from './home.js';
import { initProject } from './project.js';
import { initReserve } from './reserve.js';
import { parseRoute, routeFor } from './routes.js';

const $ = (sel) => document.querySelector(sel);

// The co-op has no inbox yet. Replace this single constant when it does; the
// contact sheet and its mail link read it.
const CONTACT_EMAIL = 'hello@holonscoop.com';
const PLAN_STORE = 'holons-plan-v1';

let current = null;
let timer = 0;

const PRESETS = {
  rv: {
    pattern: 'bands', mix: 'rv', width: 1100, height: 700, siteW: 38, siteD: 44,
    rules: { lane: 24, buffer: 24, garden: 9, tree: 0.7, visitor: 26, resident: 16, core: 'standard', coreLayout: 'compact', parking: 'entry', parkpos: 'core', path: 'straight', ties: true, autopark: false, lotpark: true, people: 2.2, guests: 1.5 },
    utilities: { power: 'grid', water: 'county', sewer: 'septic' },
  },
  tiny: {
    pattern: 'loops', mix: 'tiny', width: 900, height: 720, siteW: 28, siteD: 34,
    rules: { lane: 20, buffer: 22, garden: 22, tree: 1.2, visitor: 12, resident: 8, core: 'full', coreLayout: 'courtyard', parking: 'distributed', parkpos: 'edge', path: 'gentle', ties: true, autopark: true, lotpark: true, people: 2, guests: 0.8 },
    utilities: { power: 'solar', water: 'well', sewer: 'compost' },
  },
  garden: {
    pattern: 'grid', mix: 'mixed', width: 1000, height: 780, siteW: 32, siteD: 38,
    rules: { lane: 20, buffer: 26, garden: 34, tree: 1.6, visitor: 10, resident: 6, core: 'standard', coreLayout: 'courtyard', parking: 'distributed', parkpos: 'edge', path: 'winding', ties: true, autopark: true, lotpark: true, people: 2, guests: 1.2 },
    utilities: { power: 'offgrid', water: 'rain', sewer: 'septic' },
  },
};

// ---- facility list --------------------------------------------------------
function buildFacilityList() {
  const groups = [['grounds', 'Grounds'], ['buildings', 'Buildings']];
  const html = groups
    .map(([gid, glabel]) => {
      const rows = FACILITIES.filter((f) => f.group === gid)
        .map(
          (f) => `
        <div class="frow">
          <input id="fac-${f.id}" type="checkbox"${f.default ? ' checked' : ''} />
          <label for="fac-${f.id}">${f.label}</label>
          <input id="facw-${f.id}" class="fnum" type="number" min="${f.minW}" max="${f.maxW}" step="2" value="${f.w}" aria-label="${f.label} width ft" />
          <span class="fx">×</span>
          <input id="facd-${f.id}" class="fnum" type="number" min="${f.minH}" max="${f.maxH}" step="2" value="${f.h}" aria-label="${f.label} depth ft" />
        </div>`
        )
        .join('');
      return `<div class="fgroup">${glabel}</div>${rows}`;
    })
    .join('');
  $('#facilities').innerHTML = html;
}

function panelFacilities() {
  const out = {};
  for (const f of FACILITIES) {
    const box = $(`#fac-${f.id}`);
    const w = $(`#facw-${f.id}`);
    const d = $(`#facd-${f.id}`);
    out[f.id] = {
      on: box ? box.checked : f.default,
      w: w && w.value !== '' ? Number(w.value) : undefined,
      h: d && d.value !== '' ? Number(d.value) : undefined,
    };
  }
  return out;
}

function readInputs() {
  return {
    width: Number($('#w').value),
    height: Number($('#h').value),
    siteW: Number($('#siteW').value),
    siteD: Number($('#siteD').value),
    mix: $('#mix').value,
    seed: $('#seed').value.trim() || 'seed',
    pattern: $('#pattern').value,
    facilities: panelFacilities(),
    utilities: {
      power: $('#util-power').value,
      water: $('#util-water').value,
      sewer: $('#util-sewer').value,
    },
    rules: {
      lane: Number($('#rule-lane').value),
      buffer: Number($('#rule-buffer').value),
      gardenShare: Number($('#rule-garden').value) / 100,
      treeDensity: Number($('#rule-tree').value),
      visitorStalls: Number($('#rule-visitor').value),
      residentStalls: Number($('#rule-resident').value),
      parkingAuto: $('#rule-autopark').checked,
      lotParking: $('#rule-lotpark').checked,
      coreScale: $('#rule-core').value,
      coreLayout: $('#rule-corelayout').value,
      parkingStyle: $('#rule-parking').value,
      parkingPosition: $('#rule-parkpos').value,
      pathStyle: $('#rule-path').value,
      streetTies: $('#rule-ties').checked,
      peoplePerLot: Number($('#rule-people').value),
      guestsPerLot: Number($('#rule-guests').value),
    },
  };
}

function layers() {
  return {
    power: $('#layer-power').checked,
    water: $('#layer-water').checked,
    sewer: $('#layer-sewer').checked,
  };
}

function render() {
  if (!current) return;
  $('#plan').innerHTML = renderPlan(current, {
    theme: $('#theme').checked ? 'plan' : 'blueprint',
    layers: layers(),
  });
  paintStats(current);
  savePlan();
}

function generate() {
  current = generatePlan(readInputs());
  setProgram(current.stats);
  render();
}

// The plan is the project: keep the parcel and rules across visits, alongside
// the calculator's own saved assumptions.
function savePlan() {
  try {
    localStorage.setItem(PLAN_STORE, JSON.stringify({
      input: readInputs(),
      theme: $('#theme').checked,
      layers: layers(),
    }));
  } catch { /* storage is optional */ }
}

function restorePlan() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PLAN_STORE) || 'null');
  } catch {
    return false;
  }
  if (!saved || !saved.input) return false;
  const d = saved.input;
  const val = (sel, v) => {
    if (v == null) return;
    const el = $(sel);
    if (el) el.value = v;
  };
  const box = (sel, v) => {
    if (v == null) return;
    const el = $(sel);
    if (el) el.checked = !!v;
  };
  val('#w', d.width);
  val('#h', d.height);
  val('#siteW', d.siteW);
  val('#siteD', d.siteD);
  val('#mix', d.mix);
  val('#seed', d.seed);
  val('#pattern', d.pattern);
  const r = d.rules || {};
  val('#rule-lane', r.lane);
  val('#rule-buffer', r.buffer);
  val('#rule-garden', r.gardenShare == null ? null : Math.round(r.gardenShare * 100));
  val('#rule-tree', r.treeDensity);
  val('#rule-visitor', r.visitorStalls);
  val('#rule-resident', r.residentStalls);
  val('#rule-core', r.coreScale);
  val('#rule-corelayout', r.coreLayout);
  val('#rule-parking', r.parkingStyle);
  val('#rule-parkpos', r.parkingPosition);
  val('#rule-path', r.pathStyle);
  val('#rule-people', r.peoplePerLot);
  val('#rule-guests', r.guestsPerLot);
  box('#rule-ties', r.streetTies);
  box('#rule-autopark', r.parkingAuto);
  box('#rule-lotpark', r.lotParking);
  for (const [id, cfg] of Object.entries(d.facilities || {})) {
    box(`#fac-${id}`, cfg.on);
    val(`#facw-${id}`, cfg.w);
    val(`#facd-${id}`, cfg.h);
  }
  if (d.utilities) {
    val('#util-power', d.utilities.power);
    val('#util-water', d.utilities.water);
    val('#util-sewer', d.utilities.sewer);
  }
  if (typeof saved.theme === 'boolean') $('#theme').checked = saved.theme;
  if (saved.layers) {
    box('#layer-power', saved.layers.power);
    box('#layer-water', saved.layers.water);
    box('#layer-sewer', saved.layers.sewer);
  }
  syncAutoPark();
  return true;
}

function paintStats(plan) {
  const s = plan.stats;
  const rows = [
    ['Pattern', plan.patternLabel],
    ['Parcel', `${plan.width}' × ${plan.height}'`],
    ['Area', `${s.acres} ac`],
    ['Lots', `${s.sites}`],
    ['RV / Tiny', `${s.rv} / ${s.tiny}`],
    ['Lots per acre', `${s.density}`],
    ['Residents', `${s.population.residents}`],
    ['Guests at peak', `${s.population.guests}`],
    ['Peak population', `${s.population.peak}`],
    ['Peak per acre', `${s.population.perAcre}`],
    ['Visitor stalls', `${s.visitorStalls}`],
    ['Resident stalls', `${s.residentStalls}`],
    ['Stalls on lots', `${s.lotStalls}`],
    ['Buildings', `${s.buildings}`],
    ['Garden beds', `${s.beds}`],
    ['Drive length', `${s.roadFt} ft`],
    ['Trees', `${s.trees}`],
    ['Coverage', `${s.coverage}%`],
    ['Core', `${s.core} · ${s.parkingStyle} parking`],
    ['Parking location', s.parkingPosition],
    ['Pathways', `${s.pathStyle} · ${s.pathFt} ft`],
    ['Streets', `${s.streetNetworks} network${s.streetNetworks === 1 ? '' : 's'} · ${s.streetsTied} tied in`],
    ['Car roads', `${s.carFt} ft`],
    ['Walking', `${s.walkFt} ft`],
    ['Bike route', `${s.bikeFt} ft`],
    ['Power', s.utilities.power],
    ['Water', s.utilities.water],
    ['Sewer', s.utilities.sewer],
  ];
  $('#stats').innerHTML = rows
    .map(([k, v]) => `<div class="stat"><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');

  const seen = new Set();
  const items = [];
  for (const p of plan.parking) items.push([p.label, `${p.count} stalls`]);
  for (const b of plan.schedule) {
    if (seen.has(b.label)) continue;
    seen.add(b.label);
    items.push([b.label, b.size]);
  }
  if (plan.beds.length) items.push(['Raised beds', `${plan.beds.length} × 4' × 12'`]);
  const dog = plan.greens.find((g) => g.kind === 'dog');
  if (dog) items.push(['Dog park', `${Math.round(dog.w)}' × ${Math.round(dog.h)}'`]);
  $('#programme').innerHTML = items
    .map(([label, value]) => `<li><span>${label}</span><em>${value}</em></li>`)
    .join('') || '<li class="muted">Nothing placed — try a larger parcel.</li>';

  $('#notes').innerHTML = plan.notes.map((n) => `<li>${n}</li>`).join('');
  $('#notes').closest('.notes').classList.toggle('hidden', plan.notes.length === 0);

  $('#sumLine').textContent =
    `${s.sites} LOTS · ${(plan.patternLabel || '').toUpperCase()} · ${s.parking} STALLS · ${s.population.peak} PEOPLE`;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(generate, 120);
}

function syncAutoPark() {
  const auto = $('#rule-autopark').checked;
  for (const id of ['#rule-visitor', '#rule-resident']) $(id).disabled = auto;
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  $('#pattern').value = p.pattern;
  $('#mix').value = p.mix;
  $('#w').value = p.width;
  $('#h').value = p.height;
  $('#siteW').value = p.siteW;
  $('#siteD').value = p.siteD;
  $('#rule-lane').value = p.rules.lane;
  $('#rule-buffer').value = p.rules.buffer;
  $('#rule-garden').value = p.rules.garden;
  $('#rule-tree').value = p.rules.tree;
  $('#rule-visitor').value = p.rules.visitor;
  $('#rule-resident').value = p.rules.resident;
  $('#rule-core').value = p.rules.core;
  $('#rule-corelayout').value = p.rules.coreLayout;
  $('#rule-parking').value = p.rules.parking;
  $('#rule-parkpos').value = p.rules.parkpos;
  $('#rule-path').value = p.rules.path;
  $('#rule-ties').checked = p.rules.ties !== false;
  $('#rule-people').value = p.rules.people;
  $('#rule-guests').value = p.rules.guests;
  $('#rule-autopark').checked = p.rules.autopark;
  $('#rule-lotpark').checked = p.rules.lotpark;
  $('#util-power').value = p.utilities.power;
  $('#util-water').value = p.utilities.water;
  $('#util-sewer').value = p.utilities.sewer;
  syncAutoPark();
  generate();
}

function slug() {
  return (readInputs().seed || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportSVG() {
  if (!current) return;
  download(new Blob([$('#plan').innerHTML], { type: 'image/svg+xml' }), `${slug()}-site-plan.svg`);
}

function exportPNG() {
  if (!current) return;
  const svg = $('#plan').querySelector('svg');
  const rect = svg.viewBox.baseVal;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const blob = new Blob([$('#plan').innerHTML], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    ctx.fillStyle = $('#theme').checked ? '#f7f4ea' : '#071c30';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((out) => out && download(out, `${slug()}-site-plan.png`), 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Could not rasterise the plan. The SVG download still works.');
  };
  img.src = url;
}

function openContactSheet() {
  const sheet = $('#contact-sheet');
  if (!sheet) return;
  const mail = $('#contact-mail');
  if (mail) {
    mail.href = `mailto:${CONTACT_EMAIL}`;
    mail.textContent = CONTACT_EMAIL;
  }
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute('open', '');
}

function bindTopActions() {
  const contact = $('#contact-open');
  if (contact) contact.addEventListener('click', openContactSheet);
  const reserve = $('#reserve-open');
  if (reserve) reserve.addEventListener('click', () => showTab('reserve'));
}

function bind() {
  for (const sel of ['#w', '#h', '#siteW', '#siteD', '#mix', '#seed', '#pattern',
    '#rule-lane', '#rule-buffer', '#rule-garden', '#rule-tree',
    '#rule-visitor', '#rule-resident', '#rule-core', '#rule-corelayout', '#rule-parking', '#rule-parkpos',
    '#rule-path', '#rule-ties',
    '#rule-people', '#rule-guests',
    '#util-power', '#util-water', '#util-sewer']) {
    $(sel).addEventListener('input', schedule);
    $(sel).addEventListener('change', schedule);
  }
  for (const sel of ['#theme', '#layer-power', '#layer-water', '#layer-sewer']) {
    $(sel).addEventListener('change', render);
  }
  $('#rule-autopark').addEventListener('change', () => {
    syncAutoPark();
    schedule();
  });
  $('#rule-lotpark').addEventListener('change', schedule);
  document.querySelectorAll('#facilities input').forEach((input) => {
    input.addEventListener('input', schedule);
    input.addEventListener('change', schedule);
  });
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });
  $('#regen').addEventListener('click', generate);
  $('#shuffle').addEventListener('click', () => {
    $('#seed').value = randomSeed();
    generate();
  });
  $('#exportSvg').addEventListener('click', exportSVG);
  $('#exportPng').addEventListener('click', exportPNG);
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') {
      e.preventDefault();
      $('#seed').value = randomSeed();
      generate();
    }
  });
}

// ---- tabs ---------------------------------------------------------------
const PANES = ['home', 'project', 'reserve', 'plan', 'model', 'pl', 'roadmap', 'deck', 'documents', 'team', 'brief'];
const LITHIUM_TABS = new Set(['plan', 'model', 'pl', 'roadmap', 'deck', 'documents', 'team', 'brief']);
let activeProject = null;
let lastProject = 'lithium-city';
let appliedHash = null;

function syncHash(hash, replace = false) {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  if ((location.hash || '#/') === hash) return;
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
}

function openProject(id) {
  if (!id) return;
  activeProject = id;
  lastProject = id;
  showTab('project', { projectId: id });
}

function showTab(name, { projectId, docId = null, updateRoute = true, replace = false } = {}) {
  const tab = PANES.includes(name) ? name : 'plan';
  const explicitProject = projectId !== undefined;
  if (tab === 'home') activeProject = null;
  if (explicitProject) {
    activeProject = projectId || null;
    if (projectId) lastProject = projectId;
  }
  if (LITHIUM_TABS.has(tab)) activeProject = 'lithium-city';
  if (tab === 'project' && !activeProject) activeProject = lastProject;

  const routeProject = tab === 'home' ? null : tab === 'reserve' ? activeProject : (activeProject || 'lithium-city');
  if (updateRoute) syncHash(routeFor(tab, routeProject, { docId: tab === 'documents' ? docId : null }), replace);
  if (typeof location !== 'undefined') appliedHash = location.hash || '#/';

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
    btn.tabIndex = btn.dataset.tab === tab ? 0 : -1;
  });
  document.querySelectorAll('[data-pane]').forEach((pane) => {
    pane.hidden = pane.dataset.pane !== tab;
  });
  const reserveBtn = document.querySelector('#reserve-open');
  if (reserveBtn) {
    if (tab === 'reserve') reserveBtn.setAttribute?.('aria-current', 'page');
    else reserveBtn.removeAttribute?.('aria-current');
  }
  if (tab === 'brief') initBrief();
  if (tab === 'reserve') initReserve({
    projectId: activeProject,
    getPlan: () => current,
    goTab: showTab,
    goProject: openProject,
    setProject: (id) => {
      activeProject = id;
      if (id) lastProject = id;
      syncHash(routeFor('reserve', id));
      if (typeof location !== 'undefined') appliedHash = location.hash || '#/';
    },
  });
  if (tab === 'project') initProject({
    projectId: activeProject || lastProject,
    getPlan: () => current,
    goTab: showTab,
    goReserve: () => showTab('reserve'),
    openContact: openContactSheet,
  });
  if (tab === 'model' || tab === 'pl') initModel();
  if (tab === 'roadmap') initRoadmap({ getPlan: () => current, goTab: showTab });
  if (tab === 'deck') initDeck();
  if (tab === 'documents') initDocuments();
  if (tab === 'home') initHome({ getPlan: () => current, goProject: openProject });
}

function applyRoute(route, { replace = false } = {}) {
  showTab(route.tab, { projectId: route.projectId, docId: route.docId, replace });
}

function handleRouteChange() {
  if (typeof location === 'undefined') return;
  const hash = location.hash || '#/';
  if (hash === appliedHash) return;
  applyRoute(parseRoute(hash));
}

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// Arrow keys move between tabs, as expected of a tablist.
const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
tabButtons.forEach((btn) => {
  const name = btn.dataset.tab;
  btn.id = `tabbtn-${name}`;
  btn.setAttribute('aria-controls', `tab-${name}`);
  const pane = document.querySelector(`#tab-${name}`);
  if (pane) {
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', btn.id);
    pane.tabIndex = 0;
  }
  btn.addEventListener('keydown', (e) => {
    const i = tabButtons.indexOf(btn);
    let next = null;
    if (e.key === 'ArrowRight') next = tabButtons[(i + 1) % tabButtons.length];
    else if (e.key === 'ArrowLeft') next = tabButtons[(i - 1 + tabButtons.length) % tabButtons.length];
    else if (e.key === 'Home') next = tabButtons[0];
    else if (e.key === 'End') next = tabButtons[tabButtons.length - 1];
    if (!next) return;
    e.preventDefault();
    showTab(next.dataset.tab);
    next.focus();
  });
});

buildFacilityList();
restorePlan();
syncAutoPark();
bind();
generate();
initModel();
initRoadmap({ getPlan: () => current, goTab: showTab });
bindTopActions();
const initialRoute = typeof location !== 'undefined' ? parseRoute(location.hash) : { tab: 'home', projectId: null, docId: null };
applyRoute(initialRoute, { replace: true });
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('hashchange', handleRouteChange);
}
