// Reserve page: every parcel in the current site plan, with its location on
// the plan, the live membership price and fees, and the selection + signature
// path for a nonbinding reservation.
import { tierCounts } from './model.js';
import { money, savedModel } from './model-ui.js';
import { PAYMENT_METHODS, PROJECTS, isLiveProject, projectById } from './projects.js';

const STORE = 'holons-reservations-v1';
const AGREEMENT_STORE = 'holons-agreements-v1';
const DEPOSIT_PCT = 0.1;
const TIER_ORDER = ['standard', 'preferred', 'premium'];
const TIERS = {
  standard: { label: 'Standard', field: 'standardPrice' },
  preferred: { label: 'Preferred', field: 'preferredPrice' },
  premium: { label: 'Premium', field: 'premiumPrice' },
};
const FRONTS = { n: 'north', e: 'east', s: 'south', w: 'west' };

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
};

export function loadReservations() {
  try {
    const raw = localStorage.getItem(STORE);
    const saved = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(saved?.ids) ? saved.ids : []);
  } catch {
    return new Set();
  }
}

function persistReservations(ids) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ids: [...ids].slice(-250) }));
  } catch { /* storage is optional */ }
}

export function loadAgreements() {
  try {
    const raw = localStorage.getItem(AGREEMENT_STORE);
    const saved = raw ? JSON.parse(raw) : null;
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function persistAgreement(agreement) {
  try {
    const all = loadAgreements();
    all[agreement.reservationId] = agreement;
    const entries = Object.entries(all).slice(-100);
    localStorage.setItem(AGREEMENT_STORE, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* storage is optional */ }
}

export function saveReservation(id, agreement = null) {
  const ids = loadReservations();
  ids.add(id);
  persistReservations(ids);
  if (agreement) persistAgreement(agreement);
  return ids;
}

// Tie holds to the exact drawn lot geometry, not just the seed: regenerating a
// different village must not inherit the previous plan's reservations.
export function planKey(plan) {
  if (!plan || !Array.isArray(plan.sites)) return '';
  const shape = plan.sites
    .map((s) => `${s.num}:${Math.round(s.x)},${Math.round(s.y)},${Math.round(s.w)},${Math.round(s.h)}`)
    .join('|');
  return `v1-${hash(`${plan.seed}|${plan.width}|${plan.height}|${shape}`)}`;
}

function tierMap(plan) {
  const counts = tierCounts(plan.sites.length);
  const sorted = [...plan.sites].sort((a, b) => b.w * b.h - a.w * a.h || a.num - b.num);
  const out = new Map();
  let i = 0;
  for (const [tier, n] of [['premium', counts.premium], ['preferred', counts.preferred], ['standard', counts.standard]]) {
    for (let j = 0; j < n && i < sorted.length; j++, i++) out.set(sorted[i].num, tier);
  }
  for (const site of plan.sites) if (!out.has(site.num)) out.set(site.num, 'standard');
  return out;
}

function locationOf(plan, site) {
  const x = site.x + site.w / 2;
  const y = site.y + site.h / 2;
  const ns = y < plan.height / 2 ? 'North' : 'South';
  const ew = x < plan.width / 2 ? 'west' : 'east';
  const entryX = Number.isFinite(plan.entry?.x) ? plan.entry.x : plan.width / 2;
  const entryY = Number.isFinite(plan.entry?.y) ? plan.entry.y : plan.height;
  return {
    sector: `${ns}${ew}`,
    distance: Math.round(Math.hypot(x - entryX, y - entryY)),
    front: FRONTS[site.front] || 'the lane',
  };
}

function baseInventory(plan, model, reservations, capacity = 0) {
  const m = model || savedModel();
  const sites = Array.isArray(plan?.sites) ? plan.sites : [];
  const counts = tierCounts(sites.length || Math.max(0, Math.round(capacity || m.spaces || 0)));
  const tiers = Object.fromEntries(
    TIER_ORDER.map((key) => [key, {
      key,
      label: TIERS[key].label,
      price: Math.max(0, Number(m[TIERS[key].field]) || 0),
      total: counts[key],
      open: counts[key],
    }]),
  );
  const parcels = [];
  const key = sites.length ? planKey(plan) : '';

  if (sites.length) {
    const byTier = tierMap(plan);
    for (const site of sites) {
      const tier = byTier.get(site.num) || 'standard';
      const meta = tiers[tier];
      const id = `${key}:${site.num}`;
      const reserved = reservations.has(id);
      const price = meta.price;
      const loc = locationOf(plan, site);
      parcels.push({
        id,
        num: site.num,
        site,
        tier,
        tierLabel: meta.label,
        kind: site.kind === 'tiny' ? 'Tiny-home lot' : 'RV pad',
        width: Math.round(site.w),
        depth: Math.round(site.h),
        area: Math.round(site.w * site.h),
        sector: loc.sector,
        distance: loc.distance,
        front: loc.front,
        price,
        dues: Math.max(0, Number(m.dues) || 0),
        annualDues: Math.max(0, Number(m.dues) || 0) * 12,
        deposit: Math.round(price * DEPOSIT_PCT),
        coopShare: Math.max(0, Number(m.coopShare) || 0),
        reserved,
      });
      if (reserved) meta.open--;
    }
  }

  const positive = parcels.map((p) => p.price).filter((v) => v > 0);
  const tierPrices = Object.values(tiers).map((t) => t.price).filter((v) => v > 0);
  return {
    key,
    parcels,
    tiers,
    total: parcels.length,
    open: parcels.filter((p) => !p.reserved).length,
    dues: Math.max(0, Number(m.dues) || 0),
    depositPct: DEPOSIT_PCT * 100,
    prices: {
      min: positive.length ? Math.min(...positive) : tierPrices.length ? Math.min(...tierPrices) : 0,
      max: positive.length ? Math.max(...positive) : tierPrices.length ? Math.max(...tierPrices) : 0,
    },
  };
}

const pathD = (pts, closed) => {
  if (!Array.isArray(pts) || !pts.length) return '';
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p[0] * 10) / 10},${Math.round(p[1] * 10) / 10}`).join(' ');
  return closed ? `${d} Z` : d;
};

function parcelMap(plan, site) {
  const W = Math.max(1, Number(plan.width) || 1);
  const H = Math.max(1, Number(plan.height) || 1);
  const roads = (plan.roads || [])
    .map((rd) => {
      const d = pathD(rd.pts, rd.closed);
      if (!d) return '';
      return `<path d="${d}" fill="none" stroke="#ded7c8" stroke-width="${Math.max(1, Number(rd.w) || 1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  const greens = (plan.greens || [])
    .filter((g) => ['plaza', 'garden', 'lawn'].includes(g.kind))
    .map((g) => `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="${g.kind === 'plaza' ? '#e7dfcf' : '#e9ead9'}"/>`)
    .join('');
  const buildings = (plan.buildings || [])
    .map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#d8cbb6" stroke="#bfb29c" stroke-width="1"/>`)
    .join('');
  const sites = (plan.sites || [])
    .map((s) => {
      const selected = s.num === site.num;
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="1.4" fill="${selected ? '#0b0b0b' : '#f7f1e5'}" stroke="${selected ? '#0b0b0b' : '#c8beab'}" stroke-width="${selected ? 2.4 : 0.8}"/>`;
    })
    .join('');
  const cx = site.x + site.w / 2;
  const cy = site.y + site.h / 2;
  const fs = Math.max(5, Math.min(15, Math.min(site.w, site.h) * 0.28));
  return `<svg class="reserveMapSvg" viewBox="-16 -16 ${W + 32} ${H + 32}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Parcel ${site.num} highlighted on the site plan">
    <rect x="-16" y="-16" width="${W + 32}" height="${H + 32}" fill="#fbf7ef"/>
    <rect x="0" y="0" width="${W}" height="${H}" fill="#f4eee1" stroke="#bdb3a1" stroke-width="2"/>
    ${greens}${roads}${buildings}${sites}
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="${fs}" font-weight="700" fill="#f6f0e4">${site.num}</text>
  </svg>`;
}

export function inventoryFor(plan, model, reservations = loadReservations()) {
  const base = baseInventory(plan, model, reservations, plan?.stats?.sites);
  return {
    ...base,
    parcels: base.parcels.map((p) => ({ ...p, map: parcelMap(plan, p.site) })),
  };
}

export function reserveSummary(plan, model, capacity = 0) {
  const base = baseInventory(plan, model, loadReservations(), capacity);
  return {
    total: base.total || Object.values(base.tiers).reduce((n, t) => n + t.total, 0),
    open: base.total ? base.open : Object.values(base.tiers).reduce((n, t) => n + t.open, 0),
    tiers: base.tiers,
    prices: base.prices,
    dues: base.dues,
  };
}

function tag(p) {
  return `<span class="rtag ${p.reserved ? 'reserved' : 'open'}">${p.reserved ? 'Reserved' : 'Open'}</span>`;
}

function card(p) {
  return `<article class="reserveCard${p.reserved ? ' isReserved' : ''}">
    <div class="reserveMapWrap">${p.map}${tag(p)}</div>
    <div class="reserveCardBody">
      <p class="reserveCardKicker">${p.kind} · ${p.tierLabel}</p>
      <h4>Parcel ${pad(p.num)}</h4>
      <p class="reserveLoc">${p.sector} · ${p.distance} ft from the entry · fronts ${p.front}</p>
      <div class="reserveMeta"><span>${p.width} × ${p.depth} ft</span><span>${p.area.toLocaleString('en-US')} sq ft</span></div>
      <div class="reservePrice"><strong>${money(p.price)}</strong><span>membership</span></div>
      <div class="reserveFees">
        <div><span>Reservation deposit</span><b>${money(p.deposit)}</b></div>
        <div><span>Monthly dues</span><b>${money(p.dues)}</b></div>
      </div>
      <button class="reserveCardBtn" type="button" data-reserve-id="${esc(p.id)}"${p.reserved ? ' disabled' : ''}>${p.reserved ? 'Reserved' : 'Reserve now'}</button>
    </div>
  </article>`;
}

export function reserveHtml(inv, filter = 'all', project = null) {
  const all = inv.parcels || [];
  const projectName = project?.name || 'the village';
  const back = project
    ? `<button class="reserveBack" type="button" data-reserve-projects>← All projects</button>`
    : '';
  if (!all.length) {
    return `<div class="reservePage">
      <header class="reserveHead">
        ${back}
        <p class="reserveKicker">${project ? `${esc(project.name)} · ${esc(project.location)}` : 'Reserve now'}</p>
        <h2>No parcels are drawn yet.</h2>
        <p class="reserveLead">Open the site plan and draw a village first. The reserve page reads the same plan, so every parcel, location and open tag follows the drawing.</p>
        <button class="hbtn primary" type="button" data-reserve-goto="plan">Open the site plan</button>
      </header>
    </div>`;
  }
  const open = all.filter((p) => !p.reserved).length;
  const reserved = all.length - open;
  const visible = filter === 'all' ? all : all.filter((p) => (filter === 'open' ? !p.reserved : p.reserved));
  const priceMin = inv.prices?.min ?? 0;
  const priceMax = inv.prices?.max ?? 0;
  const filterButton = (key, label, n) => `<button class="rfilter${filter === key ? ' on' : ''}" type="button" data-reserve-filter="${key}" aria-pressed="${filter === key}">${label} <b>${n}</b></button>`;
  const sections = TIER_ORDER.map((tier) => {
    const tierParcels = all.filter((p) => p.tier === tier);
    if (!tierParcels.length) return '';
    const list = visible.filter((p) => p.tier === tier);
    const tierOpen = tierParcels.filter((p) => !p.reserved).length;
    const price = tierParcels[0].price;
    return `<section class="reserveTier">
      <header class="reserveTierHead">
        <div><h3>${TIERS[tier].label}</h3><p>${tierOpen} of ${tierParcels.length} open · ${money(price)} membership</p></div>
        <span class="reserveTierRange">${money(tierParcels[0].deposit)} holds a parcel</span>
      </header>
      ${list.length
        ? `<div class="reserveGrid">${list.map(card).join('')}</div>`
        : `<p class="reserveEmpty">No ${filter} parcels in this tier.</p>`}
    </section>`;
  }).join('');

  return `<div class="reservePage">
    <header class="reserveHead">
      ${back}
      <p class="reserveKicker">${project ? `${esc(project.name)} · ${esc(project.location)}` : 'Reserve now'} · live inventory</p>
      <h2>Choose your place at ${esc(projectName)}.</h2>
      <p class="reserveLead">${open} of ${all.length} parcels are still open. Every card draws its position in the village. The reservation records your membership type, land right and electronic signature before it becomes a hold.</p>
      <div class="reserveStats">
        <span class="rstat"><b>${open}</b> open</span>
        <span class="rstat"><b>${all.length}</b> parcels</span>
        <span class="rstat"><b>${money(priceMin)}–${money(priceMax)}</b> membership</span>
        <span class="rstat"><b>${money(inv.dues)}</b> monthly dues</span>
      </div>
    </header>
    <div class="reserveToolbar" role="group" aria-label="Filter parcels by status">
      ${filterButton('all', 'All parcels', all.length)}
      ${filterButton('open', 'Open', open)}
      ${filterButton('reserved', 'Reserved', reserved)}
    </div>
    ${sections || `<p class="reserveEmpty">No parcels match this filter.</p>`}
    <p class="reserveNote">A signed reservation is a nonbinding hold saved in this browser until the co-op accepts it and definitive documents are executed. It is not a membership or an offer. The current study is still in formation.</p>
  </div>`;
}

function projectSummary(plan) {
  const capacity = Math.max(0, Math.round(plan?.stats?.sites || 0));
  return reserveSummary(plan, savedModel(), capacity);
}

function networkProjectCard(project, stats) {
  if (isLiveProject(project)) {
    return `<article class="reserveProjectCard isOpen">
      <div class="reserveProjectTop"><span class="reserveProjectIndex">${esc(project.index)}</span><span class="reserveProjectStatus open">${esc(project.statusLabel)}</span></div>
      <h3>${esc(project.name)}</h3>
      <p class="reserveProjectLocation">${esc(project.location)}</p>
      <p class="reserveProjectCopy">${esc(project.blurb)}</p>
      <div class="reserveProjectFacts">
        <span><b>${stats.open}</b> parcels open</span>
        <span><b>${stats.total}</b> total</span>
        <span><b>${money(stats.prices.min)}</b> from</span>
      </div>
      <button class="hbtn primary" type="button" data-reserve-project="${project.id}">Reserve at ${esc(project.name)}</button>
    </article>`;
  }
  return `<article class="reserveProjectCard isComing">
    <div class="reserveProjectTop"><span class="reserveProjectIndex">${esc(project.index)}</span><span class="reserveProjectStatus soon">${esc(project.statusLabel)}</span></div>
    <h3>${esc(project.name)}</h3>
    <p class="reserveProjectLocation">${esc(project.location)}</p>
    <p class="reserveProjectCopy">${esc(project.blurb)}</p>
    <div class="reserveProjectFacts isComing"><span>Membership terms in formation</span><span>Land rights to be announced</span></div>
    <button class="hbtn" type="button" data-reserve-open-project="${project.id}">View project</button>
  </article>`;
}

export function reserveNetworkHtml(plan = null, requestedProject = null) {
  const live = PROJECTS.find(isLiveProject) || PROJECTS[0];
  const stats = projectSummary(plan);
  const notice = requestedProject && !isLiveProject(requestedProject)
    ? `<p class="reserveNotice">${esc(requestedProject.name)} is not open for reservations yet. Lithium City is the only live reservation today.</p>`
    : '';
  return `<div class="reservePage reserveNetwork">
    <header class="reserveHead">
      <p class="reserveKicker">Reserve · Holons network</p>
      <h2>Choose a holon to reserve.</h2>
      <p class="reserveLead">Lithium City is accepting reservations. The other three projects are in formation; you can view their status and register interest, but their membership terms and land rights are not published yet.</p>
      ${notice}
    </header>
    <div class="reserveProjectGrid">
      ${PROJECTS.map((project) => networkProjectCard(project, project.id === live.id ? stats : null)).join('')}
    </div>
    <p class="reserveNote">A reservation records a project, membership type, land right, draft agreement and signature. Payment by ACH via Plaid or card via Stripe is the eventual checkout path and is not live yet.</p>
  </div>`;
}

function selectedLandRight(project, state) {
  return (project?.landRights || []).find((r) => r.id === state.landRight) || (project?.landRights || []).find((r) => !r.disabled) || null;
}

function paymentMethod(id) {
  return PAYMENT_METHODS.find((p) => p.id === id) || PAYMENT_METHODS[0];
}

function landRightsHtml(project, selected) {
  return (project?.landRights || []).map(
    (right) => `<label class="reserveChoice${right.disabled ? ' isDisabled' : ''}">
      <input type="radio" name="reserve-land-right" value="${right.id}" ${right.id === selected ? 'checked' : ''} ${right.disabled ? 'disabled' : ''}>
      <span class="reserveChoiceBody">
        <b>${esc(right.label)}</b>
        <small>${esc(right.summary)}</small>
      </span>
      <em>${right.status === 'included' ? 'Included' : right.status === 'review' ? 'Review' : 'Future'}</em>
    </label>`,
  ).join('');
}

function paymentHtml(selected) {
  return PAYMENT_METHODS.map(
    (p) => `<label class="reservePayment">
      <input type="radio" name="reserve-payment" value="${p.id}" ${p.id === selected ? 'checked' : ''}>
      <span><b>${esc(p.label)}</b><small>${esc(p.provider)} · ${esc(p.detail)}</small></span>
      <em>Pending</em>
    </label>`,
  ).join('');
}

export function agreementHtml(project, parcel, landRight, paymentId = 'ach') {
  const payment = paymentMethod(paymentId);
  return `<article class="reserveContract">
    <p class="reserveContractKicker">Draft reservation agreement · ${esc(project.name)}</p>
    <h3>Reservation and membership selection</h3>
    <p>This draft records the project, parcel, membership type, land right and payment preference you selected. It is not a membership, a lease, a deed or an offer. The co-op must accept it and the definitive documents must be signed before any interest exists.</p>
    <dl class="reserveContractRows">
      <div><dt>Project</dt><dd>${esc(project.name)} · ${esc(project.location)}</dd></div>
      <div><dt>Parcel</dt><dd>Parcel ${pad(parcel.num)} · ${esc(parcel.kind)}</dd></div>
      <div><dt>Membership type</dt><dd>${esc(parcel.tierLabel)} membership</dd></div>
      <div><dt>Land right</dt><dd>${esc(landRight?.label || 'Not selected')}</dd></div>
      <div><dt>Membership price</dt><dd>${money(parcel.price)}</dd></div>
      <div><dt>Reservation deposit</dt><dd>${money(parcel.deposit)} (10%)</dd></div>
      <div><dt>Monthly dues</dt><dd>${money(parcel.dues)}</dd></div>
      <div><dt>Payment preference</dt><dd>${esc(payment.label)} via ${esc(payment.provider)} · pending</dd></div>
    </dl>
    <h4>1. Reservation</h4>
    <p>You reserve the selected parcel for the selected membership type while the co-op reviews the reservation. The reservation is nonbinding until accepted and documented. It does not create a tenancy, a security, a membership or an interest in land.</p>
    <h4>2. Membership type</h4>
    <p>Your membership type follows the selected parcel tier. It carries the rights, dues, fees and obligations in the definitive membership documents, including the shared community core and any rental-pool rules.</p>
    <h4>3. Land right</h4>
    <p>${esc(landRight?.terms || 'The selected land right is subject to review.')}</p>
    <h4>4. Fees and payment</h4>
    <p>The membership price is ${money(parcel.price)} and the reservation deposit is ${money(parcel.deposit)}. Monthly dues are ${money(parcel.dues)}. Payment is not collected in this draft. Your preference is ${esc(payment.label)} via ${esc(payment.provider)}, and secure checkout will be connected before any funds are requested.</p>
    <h4>5. Network access</h4>
    <p>${esc(project.networkAccess || 'Network access is subject to each project’s contract and availability.')} Access to another holon may carry its own dues, fees, stay limits, orientation and membership requirements.</p>
    <h4>6. Conditions</h4>
    <ul>
      <li>The project is in formation and the parcel inventory, prices and terms may change.</li>
      <li>The co-op may decline a reservation, and no deposit is collected until a payment flow is opened.</li>
      <li>This draft is not legal, tax or investment advice. Counsel and DRE review are required before a membership is offered.</li>
    </ul>
    <h4>7. Electronic signature</h4>
    <p>By signing, you confirm that you reviewed this draft and the selected membership type and land right. The app records your typed name, initials, timestamp and selection. A countersignature and definitive agreement are still required.</p>
  </article>`;
}

function setText(sel, text) {
  const el = $(sel);
  if (el) el.textContent = text;
}

function showStep(step) {
  document.querySelectorAll('[data-reserve-step]').forEach((node) => {
    node.hidden = node.dataset.reserveStep !== step;
  });
  const inner = document.querySelector('#reserve-sheet .sheetInner');
  if (inner) inner.scrollTop = 0;
}

function openDialog() {
  const sheet = $('#reserve-sheet');
  if (!sheet) return;
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute('open', '');
}

function closeDialog() {
  const sheet = $('#reserve-sheet');
  if (!sheet) return;
  if (typeof sheet.close === 'function') sheet.close();
  else sheet.removeAttribute('open');
}

function fillDetails(project, parcel, state) {
  setText('#reserve-sheet-kicker', `${project.name} · reserve now · nonbinding`);
  setText('#reserve-sheet-title', `Parcel ${pad(parcel.num)}`);
  setText('#reserve-sheet-meta', `${project.name} · ${parcel.tierLabel} membership · ${parcel.kind} · ${parcel.sector} · fronts ${parcel.front}`);
  setText('#reserve-membership', `${parcel.tierLabel} membership`);
  setText('#reserve-membership-note', 'Set by the selected parcel tier. Every type includes network access.');
  setText('#reserve-sheet-price', money(parcel.price));
  setText('#reserve-sheet-deposit', money(parcel.deposit));
  setText('#reserve-sheet-dues', `${money(parcel.dues)} / month`);
  setText('#reserve-sheet-status', parcel.reserved ? 'Reserved in this browser' : 'Open');
  setText('#reserve-network-note', project.networkAccess || '');
  const rights = $('#reserve-land-rights');
  if (rights) rights.innerHTML = landRightsHtml(project, state.landRight);
  const signer = $('#reserve-signer');
  const initials = $('#reserve-initials');
  const agree = $('#reserve-agree');
  if (signer) signer.value = '';
  if (initials) initials.value = '';
  if (agree) agree.checked = false;
  setText('#reserve-sign-error', '');
}

function renderAgreement(project, parcel, state) {
  const landRight = selectedLandRight(project, state);
  const body = $('#reserve-agreement-body');
  if (body) body.innerHTML = agreementHtml(project, parcel, landRight, state.payment);
  const payments = $('#reserve-payment-options');
  if (payments) payments.innerHTML = paymentHtml(state.payment);
  setText('#reserve-payment-summary', `${paymentMethod(state.payment).label} via ${paymentMethod(state.payment).provider} · checkout pending`);
}

function reservationReference(parcel) {
  return `LC-${pad(parcel.num)}-${hash(`${Date.now()}-${parcel.id}`).slice(0, 6).toUpperCase()}`;
}

export function initReserve({ projectId, getPlan, goTab, goProject, setProject } = {}) {
  const el = $('#reserve');
  if (!el) return;
  const state = el._reserveState || (el._reserveState = {
    projectId: null,
    filter: 'all',
    inventory: null,
    pending: null,
    landRight: null,
    payment: 'ach',
    lastAgreement: null,
  });
  state.projectId = projectId || null;
  const currentProject = () => projectById(state.projectId);

  const refresh = () => {
    const project = currentProject();
    if (project && isLiveProject(project)) {
      const next = typeof getPlan === 'function' ? getPlan() : null;
      state.inventory = inventoryFor(next);
      el.innerHTML = reserveHtml(state.inventory, state.filter, project);
    } else {
      const next = typeof getPlan === 'function' ? getPlan() : null;
      el.innerHTML = reserveNetworkHtml(next, project);
    }
  };
  el._reserveRefresh = refresh;
  if (el.dataset.bound === '1') {
    // Revisiting from the top bar starts clean, but remembers the project.
    state.filter = 'all';
    state.pending = null;
    state.lastAgreement = null;
    refresh();
    return;
  }
  el.dataset.bound = '1';
  refresh();

  el.addEventListener('click', (e) => {
    const filter = e.target.closest('[data-reserve-filter]');
    if (filter) {
      state.filter = filter.dataset.reserveFilter;
      if (state.inventory) el.innerHTML = reserveHtml(state.inventory, state.filter, currentProject());
      return;
    }
    const allProjects = e.target.closest('[data-reserve-projects]');
    if (allProjects) {
      state.projectId = null;
      state.filter = 'all';
      if (typeof setProject === 'function') setProject(null);
      refresh();
      return;
    }
    const chooseProject = e.target.closest('[data-reserve-project]');
    if (chooseProject) {
      state.projectId = chooseProject.dataset.reserveProject;
      state.filter = 'all';
      if (typeof setProject === 'function') setProject(state.projectId);
      refresh();
      return;
    }
    const openProject = e.target.closest('[data-reserve-open-project]');
    if (openProject) {
      if (typeof goProject === 'function') goProject(openProject.dataset.reserveOpenProject);
      return;
    }
    const go = e.target.closest('[data-reserve-goto]');
    if (go) {
      if (typeof goTab === 'function') goTab(go.dataset.reserveGoto);
      return;
    }
    const button = e.target.closest('[data-reserve-id]');
    if (!button || button.disabled) return;
    const project = currentProject();
    if (!project || !state.inventory) return;
    const parcel = state.inventory.parcels.find((p) => p.id === button.dataset.reserveId);
    if (!parcel) return;
    state.pending = parcel;
    state.landRight = (project.landRights || []).find((r) => !r.disabled)?.id || null;
    state.payment = 'ach';
    fillDetails(project, parcel, state);
    showStep('details');
    openDialog();
  });

  $('#reserve-cancel')?.addEventListener('click', closeDialog);
  $('#reserve-done')?.addEventListener('click', () => {
    closeDialog();
    state.pending = null;
    refresh();
  });
  $('#reserve-back-details')?.addEventListener('click', () => showStep('details'));
  $('#reserve-review')?.addEventListener('click', () => {
    const project = currentProject();
    if (!project || !state.pending) return;
    renderAgreement(project, state.pending, state);
    showStep('agreement');
  });
  $('#reserve-sheet')?.addEventListener('change', (e) => {
    if (e.target.matches('input[name="reserve-land-right"]')) {
      state.landRight = e.target.value;
    }
    if (e.target.matches('input[name="reserve-payment"]')) {
      state.payment = e.target.value;
      const project = currentProject();
      if (project && state.pending) renderAgreement(project, state.pending, state);
    }
  });
  $('#reserve-sign')?.addEventListener('click', () => {
    const project = currentProject();
    if (!project || !state.pending) return;
    const signer = $('#reserve-signer');
    const initials = $('#reserve-initials');
    const agree = $('#reserve-agree');
    const error = $('#reserve-sign-error');
    const name = signer ? signer.value.trim() : '';
    const ini = initials ? initials.value.trim() : '';
    if (!name || !ini || !agree?.checked) {
      if (error) error.textContent = 'Add your full name, initials and agreement to continue.';
      return;
    }
    if (error) error.textContent = '';
    const landRight = selectedLandRight(project, state);
    const reference = reservationReference(state.pending);
    const agreement = {
      reservationId: state.pending.id,
      reference,
      projectId: project.id,
      project: project.name,
      parcel: state.pending.num,
      membership: state.pending.tierLabel,
      landRight: landRight?.label || 'Not selected',
      landRightId: landRight?.id || null,
      price: state.pending.price,
      deposit: state.pending.deposit,
      dues: state.pending.dues,
      payment: state.payment,
      paymentProvider: paymentMethod(state.payment).provider,
      signer: name,
      initials: ini,
      signedAt: new Date().toISOString(),
      version: 'reservation-draft-v1',
      status: 'signed · payment pending',
    };
    saveReservation(state.pending.id, agreement);
    state.lastAgreement = agreement;
    setText('#reserve-done-title', `Parcel ${pad(state.pending.num)} reserved.`);
    setText('#reserve-done-meta', `${project.name} · ${state.pending.tierLabel} membership · ${agreement.landRight}`);
    setText('#reserve-done-reference', reference);
    setText('#reserve-done-payment', `${paymentMethod(state.payment).label} via ${paymentMethod(state.payment).provider} · payment pending`);
    showStep('done');
    state.pending = null;
    refresh();
  });
}
