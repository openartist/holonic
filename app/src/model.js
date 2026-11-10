// Financial model for the Holons Coop operating plan.
// Pure functions, no DOM: the calculator, the P&L and the CSV export all read
// the same projection, and tools/model-check.mjs checks it against the plan's
// own arithmetic ($39,640 base receipts, $7,766 net co-op contribution).

import { getProgram } from './program.js';
import { AMENITY_SCHEDULE, AMENITY_KEYS as FACILITY_KEYS, amenityCost } from './facilities.js';

export const BASE_SPACES = 20;

export const FIELD_GROUPS = [
  {
    group: 'Acquisition & build',
    fields: [
      ['landPrice', 'Land price', 'USD', 7600],
      ['closingCosts', 'Closing costs', 'USD', 2400],
      ['diligence', 'Diligence & studies', 'USD', 12000],
      ['legal', 'Legal & entity', 'USD', 18000],
      ['permits', 'Permits & review', 'USD', 15000],
      ['siteWorks', 'Site, access, drainage', 'USD', 30000],
      ['waterSystem', 'Water system', 'USD', 78000],
      ['wastewater', 'Wastewater system', 'USD', 62000],
      ['solar', 'Shared solar & equipment', 'USD', 10000],
      ['contingency', 'Contingency', 'USD', 20000],
      ['openingReserve', 'Opening reserve', 'USD', 10000],
      ['loanAmount', 'Loan amount', 'USD', 0],
      ['loanRate', 'Loan rate', '%', 7.5],
      ['loanYears', 'Loan term', 'years', 10],
    ],
  },
  {
    // Every amenity in the staged schedule is a budget line, priced from its
    // area, construction system and storeys rather than typed as a round sum.
    group: 'Community amenities',
    fields: AMENITY_SCHEDULE.map((item) => [item.id, item.label, 'USD', amenityCost(item)]),
  },
  {
    group: 'Membership & dues',
    fields: [
      ['lotStandard', 'Standard lot', 'sq ft', 2400],
      ['lotPreferred', 'Preferred lot', 'sq ft', 3000],
      ['lotPremium', 'Premium lot', 'sq ft', 3600],
      ['capitalUplift', 'Capital reserve uplift', '%', 5],
      ['dues', 'Monthly dues', 'USD/mo', 400],
      ['duesGrowth', 'Dues escalation', '%/yr', 2.5],
      ['duesCollection', 'Dues collection', '%', 96],
    ],
  },
  {
    group: 'Demand & pricing',
    fields: [
      ['seasonNights', 'Season nights', 'nights', 180],
      ['memberHold', 'Member-held share', '%', 40],
      ['occupancy', 'Occupancy of released', '%', 40],
      ['occupancyGrowth', 'Demand growth', '%/yr', 3],
      ['occupancyCap', 'Occupancy cap', '%', 75],
      ['nightlyRate', 'Nightly rate', 'USD', 35],
      ['rateGrowth', 'Rate escalation', '%/yr', 3],
      ['retreats', 'Retreat bookings', 'n', 4],
      ['retreatFee', 'Retreat fee', 'USD', 1250],
      ['events', 'Event bookings', 'n', 6],
      ['eventFee', 'Event fee', 'USD', 600],
      ['parkingDays', 'Visitor car-days', 'n', 80],
      ['parkingFee', 'Parking fee', 'USD', 10],
      ['coopShare', 'Co-op share of lodging', '%', 40],
    ],
  },
  {
    group: 'Operating costs',
    fields: [
      ['waterWasteCost', 'Water & waste service', 'USD/yr', 12000],
      ['adminCost', 'Administration', 'USD/yr', 12000],
      ['upkeepCost', 'Upkeep & reserves', 'USD/yr', 12000],
      // the plan's $36k baseline already has to cover insurance and marketing;
      // these two lines are there to break them out if a quote says otherwise
      ['insurance', 'Insurance', 'USD/yr', 0],
      ['marketing', 'Sales & marketing', 'USD/yr', 0],
      ['staff', 'Paid staff', 'USD/yr', 54000],
      ['incrementalAdmin', 'Incremental administration', 'USD/yr', 3000],
      ['lodgingExpense', 'Lodging direct cost', '% of gross', 25],
      ['venueExpense', 'Venue direct cost', '% of venue', 35],
      ['parkingExpense', 'Parking direct cost', '% of parking', 20],
      ['costInflation', 'Cost inflation', '%/yr', 2.5],
      ['propertyTaxRate', 'Property tax rate', '% of cost', 1.1],
      ['totRate', 'Transient occupancy tax', '% pass-through', 8],
      ['capexReserve', 'CapEx reserve', '% of revenue', 4],
      ['capRate', 'Exit cap rate', '%', 7.5],
      ['exitGrowth', 'Exit NOI growth', '%/yr', 2],
    ],
  },
];

export const DEFAULT_MODEL = Object.fromEntries(
  FIELD_GROUPS.flatMap((g) => g.fields.map(([key, , , value]) => [key, value])),
);

export const FIELD_LABEL = Object.fromEntries(
  FIELD_GROUPS.flatMap((g) => g.fields.map(([key, label]) => [key, label])),
);

export const SCENARIOS = {
  downside: {
    label: 'Downside',
    values: { occupancy: 20, occupancyGrowth: 0, retreats: 2, retreatFee: 1000, events: 2, eventFee: 400, parkingDays: 40 },
  },
  base: {
    label: 'Base',
    values: { occupancy: 40, occupancyGrowth: 3, retreats: 4, retreatFee: 1250, events: 6, eventFee: 600, parkingDays: 80 },
  },
  upside: {
    label: 'Upside',
    values: { occupancy: 60, occupancyGrowth: 3, retreats: 6, retreatFee: 1250, events: 8, eventFee: 600, parkingDays: 80 },
  },
};

const num = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

// Accepts whatever the form holds (strings, blanks) and returns clean numbers.
export function readModel(input = {}) {
  const out = { ...DEFAULT_MODEL };
  for (const [key, , , dflt] of FIELD_GROUPS.flatMap((g) => g.fields)) {
    out[key] = num(input[key], dflt);
  }
  // Capacity is never a typed assumption: it is whatever the parcel can hold.
  out.spaces = Math.max(0, Math.round(num(input.spaces, getProgram().spaces)));
  return out;
}

// Membership tiers follow the plan's 40/40/20 split, with the remainder in the
// premium tier so every drawn space has a price.
export function tierCounts(spaces = BASE_SPACES) {
  const n = Math.max(0, Math.round(num(spaces, BASE_SPACES)));
  const standard = Math.round(n * 0.4);
  const preferred = Math.round(n * 0.4);
  return { standard, preferred, premium: Math.max(0, n - standard - preferred) };
}

// Site work, utilities and shared solar scale with the number of spaces; the
// 20-space base case is 1×, so the plan's filed arithmetic does not move.
export function costScale(m) {
  return Math.max(0.25, num(m.spaces, BASE_SPACES) / BASE_SPACES);
}

// Infrastructure is the civil and utility scope that scales with the number of
// spaces; amenities are the community-core buildings. Both are reported as one
// total so every budget shows the same infrastructure-and-amenities figure.
export const INFRASTRUCTURE_KEYS = ['siteWorks', 'waterSystem', 'wastewater', 'solar'];
export const AMENITY_KEYS = FACILITY_KEYS;

export function infrastructureCost(m) {
  return INFRASTRUCTURE_KEYS.reduce((a, k) => a + m[k], 0) * costScale(m);
}

export function amenitiesCost(m) {
  return AMENITY_KEYS.reduce((a, k) => a + m[k], 0) * costScale(m);
}

export function projectCost(m) {
  const fixed = ['landPrice', 'closingCosts', 'diligence', 'legal', 'permits',
    'contingency', 'openingReserve'].reduce((a, k) => a + m[k], 0);
  return fixed + infrastructureCost(m) + amenitiesCost(m);
}

export const MEMBERSHIP_TIERS = ['standard', 'preferred', 'premium'];
export const LOT_FIELDS = { standard: 'lotStandard', preferred: 'lotPreferred', premium: 'lotPremium' };

// Land, soft costs, contingency, the opening reserve and the community core are
// shared equally; the civil works are shared by lot area. Scaling to the project
// budget means a member's capital always bears the same relationship to the
// total build, however many spaces the plan draws or whatever the quote is.
const FIXED_COST_KEYS = ['landPrice', 'closingCosts', 'diligence', 'legal', 'permits', 'contingency', 'openingReserve'];

export function membershipPlan(m) {
  const spaces = membershipCount(m);
  const counts = tierCounts(spaces);
  const cost = projectCost(m);
  const uplift = Math.max(0, num(m.capitalUplift, 5)) / 100;
  const target = Math.round(cost * (1 + uplift));
  const commonPool = FIXED_COST_KEYS.reduce((a, k) => a + m[k], 0) + amenitiesCost(m);
  const sitePool = infrastructureCost(m);
  const lots = Object.fromEntries(
    MEMBERSHIP_TIERS.map((t) => [t, Math.max(1, num(m[LOT_FIELDS[t]], 2400))]),
  );
  const totalLot = MEMBERSHIP_TIERS.reduce((a, t) => a + counts[t] * lots[t], 0);
  const commonShare = spaces > 0 ? commonPool / spaces : 0;
  const sitePerSqft = totalLot > 0 ? sitePool / totalLot : 0;
  const raw = Object.fromEntries(
    MEMBERSHIP_TIERS.map((t) => [t, commonShare + lots[t] * sitePerSqft]),
  );
  const rawTotal = MEMBERSHIP_TIERS.reduce((a, t) => a + counts[t] * raw[t], 0);
  // scale to the capital target, then round to $50 so signed figures are clean
  const factor = rawTotal > 0 ? target / rawTotal : 0;
  const tiers = Object.fromEntries(MEMBERSHIP_TIERS.map((t) => {
    const price = Math.round((raw[t] * factor) / 50) * 50;
    return [t, {
      key: t,
      lot: lots[t],
      count: counts[t],
      price,
      total: price * counts[t],
      common: commonShare * factor,
      site: lots[t] * sitePerSqft * factor,
    }];
  }));
  const capital = MEMBERSHIP_TIERS.reduce((a, t) => a + tiers[t].total, 0);
  return {
    spaces,
    counts,
    tiers,
    cost,
    target,
    uplift: uplift * 100,
    commonPool,
    sitePool,
    totalLot,
    commonShare,
    sitePerSqft,
    capital,
    average: spaces > 0 ? capital / spaces : 0,
    coverage: cost > 0 ? (capital / cost) * 100 : 0,
    gap: cost - capital,
  };
}

export function membershipCapital(m) {
  return membershipPlan(m).capital;
}

export function membershipCount(m) {
  return Math.max(0, Math.round(num(m.spaces, BASE_SPACES)));
}

// Level annual payment with a year-by-year interest split.
export function debtSchedule(principal, ratePct, years) {
  const n = Math.max(1, Math.round(years)) * 12;
  const r = ratePct / 100 / 12;
  const payment = principal <= 0 ? 0 : r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n;
  let balance = principal;
  const rows = [];
  for (let y = 1; y <= Math.max(1, Math.round(years)); y++) {
    let interest = 0;
    let paid = 0;
    for (let mo = 0; mo < 12 && balance > 0.005; mo++) {
      const i = balance * r;
      const p = Math.min(balance, payment - i);
      interest += i;
      paid += p;
      balance -= p;
    }
    rows.push({ payment: interest + paid, interest, principal: paid, balance });
  }
  return rows;
}

// Single year of operation at a given occupancy; used by the projection and by
// the break-even scan.
export function yearFigures(m, year, occupancy, override = {}) {
  const infl = Math.pow(1 + m.costInflation / 100, year - 1);
  const rateScale = Math.pow(1 + m.rateGrowth / 100, year - 1);
  const released = m.spaces * m.seasonNights * (1 - m.memberHold / 100);
  const occ = override.occupancy != null ? override.occupancy : occupancy;
  const nights = released * occ;
  const rate = override.rate != null ? override.rate : m.nightlyRate * rateScale;
  const lodging = nights * rate;
  const retreats = m.retreats * m.retreatFee * rateScale;
  const events = m.events * m.eventFee * rateScale;
  const parking = m.parkingDays * m.parkingFee * rateScale;
  const gross = lodging + retreats + events + parking;

  const ownerPool = lodging * (1 - m.coopShare / 100);
  const coopLodging = lodging * (m.coopShare / 100);
  const duesGross = membershipCount(m) * m.dues * 12 * Math.pow(1 + m.duesGrowth / 100, year - 1);
  const dues = duesGross * (m.duesCollection / 100);

  const baseline = (m.waterWasteCost + m.adminCost + m.upkeepCost + m.insurance + m.marketing + m.staff) * infl * costScale(m);
  const propertyTax = projectCost(m) * (m.propertyTaxRate / 100);
  const lodgingDirect = lodging * (m.lodgingExpense / 100);
  const venueDirect = (retreats + events) * (m.venueExpense / 100);
  const parkingDirect = parking * (m.parkingExpense / 100);
  const incrementalAdmin = m.incrementalAdmin * infl;
  const incremental = lodgingDirect + venueDirect + parkingDirect + incrementalAdmin;
  const opex = baseline + propertyTax + incremental;

  const revenue = coopLodging + retreats + events + parking + dues;
  const noi = revenue - opex;
  const reserve = revenue * (m.capexReserve / 100);
  const netCoopContribution = coopLodging + retreats + events + parking - incremental;
  const tot = (lodging + retreats + events) * (m.totRate / 100);

  return {
    year,
    occupancy: occ,
    occupancyPct: Math.round(occ * 1000) / 10,
    nights,
    rate,
    lodging,
    retreats,
    events,
    parking,
    gross,
    ownerPool,
    coopLodging,
    duesGross,
    dues,
    revenue,
    baseline,
    propertyTax,
    lodgingDirect,
    venueDirect,
    parkingDirect,
    incrementalAdmin,
    incremental,
    opex,
    noi,
    reserve,
    netCoopContribution,
    tot,
    grossPerSpace: m.spaces > 0 ? gross / m.spaces : 0,
  };
}

export function projectModel(input = {}, overrides = {}) {
  const m = readModel(input);
  const cost = projectCost(m);
  const memberships = membershipPlan(m);
  const capital = memberships.capital;
  const members = membershipCount(m);
  const gap = cost - capital - m.loanAmount;
  const debt = debtSchedule(m.loanAmount, m.loanRate, m.loanYears);

  const years = [];
  let cumulative = 0;
  for (let y = 1; y <= 10; y++) {
    const grown = m.occupancy * Math.pow(1 + m.occupancyGrowth / 100, y - 1);
    const occ = Math.min(m.occupancyCap, grown) / 100;
    const row = yearFigures(m, y, Math.min(1, Math.max(0, occ)), overrides[y] || {});
    const ds = m.loanAmount > 0 && y <= m.loanYears ? debt[y - 1] : { payment: 0, interest: 0, principal: 0, balance: 0 };
    const debtService = ds.payment || 0;
    const cashFlow = row.noi - row.reserve - debtService;
    cumulative += cashFlow;
    years.push({
      ...row,
      debtService,
      interest: ds.interest || 0,
      principal: ds.principal || 0,
      loanBalance: m.loanAmount > 0 && y <= m.loanYears ? ds.balance : 0,
      cashFlow,
      cumulative,
      dscr: debtService > 0 ? row.noi / debtService : null,
    });
  }

  const last = years[years.length - 1];
  const terminalNoi = last.noi * (1 + m.exitGrowth / 100);
  const terminalValue = m.capRate > 0 ? terminalNoi / (m.capRate / 100) : 0;
  const terminalNet = terminalValue - last.loanBalance;

  const equity = years.map((r) => r.cashFlow);
  equity[equity.length - 1] += terminalNet;
  const initial = Math.max(0, gap);
  const flows = initial > 0 ? [-initial, ...equity] : [0, ...equity];
  const irr = initial > 0 ? irrOf(flows) : null;
  const npv = initial > 0 ? npvOf(m.capRate / 100 + 0.02, flows) : null;
  const paidBack = initial > 0 ? payback(flows) : 0;

  const stabilised = years.reduce((best, r) => Math.max(best, r.noi), -Infinity);
  const dscrs = years.map((r) => r.dscr).filter((v) => v != null);
  const totalCash = years.reduce((a, r) => a + r.cashFlow, 0);

  const kpis = {
    projectCost: cost,
    infrastructure: infrastructureCost(m),
    amenities: amenitiesCost(m),
    infraAmenities: infrastructureCost(m) + amenitiesCost(m),
    capital,
    capitalTarget: memberships.target,
    coverage: memberships.coverage,
    avgContribution: memberships.average,
    members,
    gap,
    rev1: years[0].revenue,
    noi1: years[0].noi,
    cash1: years[0].cashFlow,
    stabilised,
    totalCash,
    terminalValue,
    equityMultiple: initial > 0 ? (totalCash + terminalNet) / initial : null,
    irr,
    npv,
    payback: initial > 0 ? paidBack : null,
    minDscr: dscrs.length ? Math.min(...dscrs) : null,
    breakEven: breakEvenOccupancy(m),
    gross1: years[0].gross,
    netCoop1: years[0].netCoopContribution,
    dues1: years[0].dues,
  };

  return {
    model: m,
    years,
    kpis,
    membership: memberships,
    funding: {
      cost,
      capital,
      gap,
      loan: m.loanAmount,
      members,
      infrastructure: kpis.infrastructure,
      amenities: kpis.amenities,
      infraAmenities: kpis.infraAmenities,
    },
  };
}

// occupancy at which year-1 NOI is zero, found by scan so the cost structure can
// be anything the form produces
export function breakEvenOccupancy(m) {
  let prev = null;
  for (let i = 0; i <= 1000; i++) {
    const occ = i / 1000;
    const row = yearFigures(m, 1, occ);
    if (prev != null && prev.noi <= 0 && row.noi >= 0) {
      return Math.round(((prev.occupancy + occ) / 2) * 1000) / 10;
    }
    prev = row;
  }
  return null;
}

export function npvOf(rate, flows) {
  return flows.reduce((a, f, i) => a + f / Math.pow(1 + rate, i), 0);
}

export function irrOf(flows, lo = -0.95, hi = 4) {
  const f = (r) => npvOf(r, flows);
  let a = lo;
  let b = hi;
  if (f(a) * f(b) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2;
    if (f(a) * f(mid) <= 0) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}

export function payback(flows) {
  let acc = -flows[0];
  if (acc <= 0) return 0;
  for (let i = 1; i < flows.length; i++) {
    if (acc - flows[i] <= 0) return i - 1 + acc / flows[i];
    acc -= flows[i];
  }
  return null;
}

// ---- P&L sheet -------------------------------------------------------------
// One definition of the sheet, used by the table, the CSV and the checks.
export const SHEET_ROWS = [
  { section: 'Demand' },
  { key: 'occupancyPct', label: 'Occupancy of released', unit: '%', digits: 1 },
  { key: 'nights', label: 'Paid guest-nights', unit: 'nights' },
  { key: 'grossPerSpace', label: 'Gross receipts per space', unit: 'USD' },
  { section: 'Revenue' },
  { key: 'lodging', label: 'Lodging receipts (gross)', unit: 'USD' },
  { key: 'coopLodging', label: 'Co-op share of lodging', unit: 'USD', emphasis: true },
  { key: 'ownerPool', label: 'Owner payout pool (memo)', unit: 'USD', memo: true },
  { key: 'retreats', label: 'Retreat venue fees', unit: 'USD' },
  { key: 'events', label: 'Event venue fees', unit: 'USD' },
  { key: 'parking', label: 'Visitor parking', unit: 'USD' },
  { key: 'dues', label: 'Member dues (collected)', unit: 'USD' },
  { key: 'revenue', label: 'Total revenue', unit: 'USD', total: true },
  { section: 'Operating expenses' },
  { key: 'baseline', label: 'Baseline services, admin, upkeep', unit: 'USD' },
  { key: 'propertyTax', label: 'Property tax', unit: 'USD' },
  { key: 'lodgingDirect', label: 'Lodging direct cost', unit: 'USD' },
  { key: 'venueDirect', label: 'Venue direct cost', unit: 'USD' },
  { key: 'parkingDirect', label: 'Parking direct cost', unit: 'USD' },
  { key: 'incrementalAdmin', label: 'Incremental administration', unit: 'USD' },
  { key: 'opex', label: 'Total operating expenses', unit: 'USD', total: true },
  { section: 'Result' },
  { key: 'noi', label: 'Net operating income', unit: 'USD', total: true },
  { key: 'reserve', label: 'CapEx reserve', unit: 'USD' },
  { key: 'debtService', label: 'Debt service', unit: 'USD' },
  { key: 'cashFlow', label: 'Cash flow before tax', unit: 'USD', total: true },
  { key: 'cumulative', label: 'Cumulative cash', unit: 'USD' },
  { key: 'dscr', label: 'DSCR', unit: '×', digits: 2 },
  { key: 'tot', label: 'TOT collected (memo, pass-through)', unit: 'USD', memo: true },
];

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(result) {
  const head = ['Line item', 'Unit', ...result.years.map((r) => `Year ${r.year}`)];
  const rows = [head];
  for (const row of SHEET_ROWS) {
    if (row.section) {
      rows.push([row.section, '', ...result.years.map(() => '')]);
      continue;
    }
    rows.push([
      row.label,
      row.unit,
      ...result.years.map((r) => (r[row.key] == null ? '' : Math.round(r[row.key] * 100) / 100)),
    ]);
  }
  rows.push(['Terminal value', 'USD', ...result.years.map((_, i) => (i === 9 ? Math.round(result.kpis.terminalValue) : ''))]);
  rows.push(['KPIs', '', ...result.years.map(() => '')]);
  rows.push(['Project cost', 'USD', result.kpis.projectCost]);
  rows.push(['Infrastructure', 'USD', result.kpis.infrastructure]);
  rows.push(['Amenities', 'USD', result.kpis.amenities]);
  rows.push(['Infrastructure & amenities', 'USD', result.kpis.infraAmenities]);
  rows.push(['Membership capital', 'USD', result.kpis.capital]);
  rows.push(['Capital target', 'USD', result.kpis.capitalTarget]);
  rows.push(['Capital coverage', '%', Math.round(result.kpis.coverage * 10) / 10]);
  rows.push(['Average contribution', 'USD', Math.round(result.kpis.avgContribution)]);
  rows.push(['Funding gap', 'USD', result.kpis.gap]);
  rows.push(['IRR', '%', result.kpis.irr == null ? 'n/a' : Math.round(result.kpis.irr * 1000) / 10]);
  rows.push(['Min DSCR', '×', result.kpis.minDscr == null ? 'n/a' : Math.round(result.kpis.minDscr * 100) / 100]);
  rows.push(['Break-even occupancy', '%', result.kpis.breakEven == null ? 'n/a' : result.kpis.breakEven]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
