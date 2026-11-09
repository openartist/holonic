// Checks the financial model against the Holons Coop business plan's own
// arithmetic, then tests the projection identities, scenarios and export.
import {
  DEFAULT_MODEL, FIELD_GROUPS, SCENARIOS, projectModel, readModel, tierCounts,
  yearFigures, breakEvenOccupancy, irrOf, npvOf, toCsv,
} from '../src/model.js';

let fails = 0;
const fail = (msg) => { console.log(`  FAIL ${msg}`); fails++; };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const usd = (n) => Math.round(n).toLocaleString('en-US');

const m = readModel(DEFAULT_MODEL);
const base = projectModel(DEFAULT_MODEL);
const y1 = base.years[0];

console.log('— plan arithmetic (year 1, base case) —');
const checks = [
  ['max space-nights', m.spaces * m.seasonNights, 3600],
  ['released nights', m.spaces * m.seasonNights * (1 - m.memberHold / 100), 2160],
  ['paid nights', y1.nights, 864],
  ['lodging receipts', y1.lodging, 30240],
  ['retreat fees', y1.retreats, 5000],
  ['event fees', y1.events, 3600],
  ['visitor parking', y1.parking, 800],
  ['total guest receipts', y1.gross, 39640],
  ['owner payout pool', y1.ownerPool, 18144],
  ['co-op lodging share', y1.coopLodging, 12096],
  ['co-op before costs', y1.coopLodging + y1.retreats + y1.events + y1.parking, 21496],
  ['incremental costs', y1.incremental, 13730],
  ['net co-op contribution', y1.netCoopContribution, 7766],
  ['dues budget (gross)', y1.duesGross, 36000],
  ['project cost', base.kpis.projectCost, 180000],
  ['membership capital', base.kpis.capital, 190000],
  ['funding gap (surplus)', base.kpis.gap, -10000],
];
for (const [label, got, want] of checks) {
  if (!near(got, want)) fail(`${label}: ${usd(got)} vs plan ${usd(want)}`);
  else console.log(`  ${label.padEnd(24)} ${usd(got).padStart(9)}  ✓`);
}

console.log('\n— scenarios match the plan’s table —');
for (const [name, want] of [['downside', { gross: 18320, net: 1408, nights: 432 }],
  ['base', { gross: 39640, net: 7766, nights: 864 }],
  ['upside', { gross: 58460, net: 12439, nights: 1296 }]]) {
  const model = readModel({ ...DEFAULT_MODEL, ...SCENARIOS[name].values });
  const row = yearFigures(model, 1, model.occupancy / 100);
  const ok = near(row.gross, want.gross) && near(row.netCoopContribution, want.net) && near(row.nights, want.nights);
  console.log(`  ${name.padEnd(9)} nights ${Math.round(row.nights)} · receipts ${usd(row.gross)} · net ${usd(row.netCoopContribution)} ${ok ? '✓' : '✗'}`);
  if (!ok) fail(`${name} scenario does not reproduce the plan`);
}

console.log('\n— projection identities, 10 years —');
for (const r of base.years) {
  if (!near(r.revenue, r.coopLodging + r.retreats + r.events + r.parking + r.dues, 0.01)) fail(`year ${r.year}: revenue parts do not add`);
  if (!near(r.opex, r.baseline + r.propertyTax + r.lodgingDirect + r.venueDirect + r.parkingDirect + r.incrementalAdmin, 0.01)) fail(`year ${r.year}: opex parts do not add`);
  if (!near(r.noi, r.revenue - r.opex, 0.01)) fail(`year ${r.year}: NOI wrong`);
  if (!near(r.cashFlow, r.noi - r.reserve - r.debtService, 0.01)) fail(`year ${r.year}: cash flow wrong`);
  if (!near(r.gross, r.lodging + r.retreats + r.events + r.parking, 0.01)) fail(`year ${r.year}: gross receipts wrong`);
}
let running = 0;
for (const r of base.years) {
  running += r.cashFlow;
  if (!near(r.cumulative, running, 0.01)) fail(`year ${r.year}: cumulative cash wrong`);
}
const rev = base.years.map((r) => r.revenue);
const noi = base.years.map((r) => r.noi);
console.log(`  revenue  Y1 ${usd(rev[0])} → Y10 ${usd(rev[9])} (${rev.every((v, i) => i === 0 || v >= rev[i - 1]) ? 'non-decreasing' : 'varies'})`);
console.log(`  NOI      Y1 ${usd(noi[0])} → Y10 ${usd(noi[9])}`);
console.log(`  cumulative cash after 10 years ${usd(base.years[9].cumulative)}`);
console.log(`  years check ${base.years.length} ${base.years.length === 10 ? '✓' : '✗'}`);
if (base.years.length !== 10) fail('projection is not 10 years');
if (!(noi[9] > noi[0])) fail('NOI does not grow with the escalation defaults');

console.log('\n— funded case (loan and equity) —');
const levered = projectModel({ ...DEFAULT_MODEL, loanAmount: 120000, loanRate: 7.5, loanYears: 10 });
const L = levered.years[0];
const total = levered.kpis;
console.log(`  loan 120,000 @ 7.5% / 10 yr: payment ${usd(L.debtService)} (interest ${usd(L.interest)}, principal ${usd(L.principal)})`);
console.log(`  DSCR Y1 ${total.minDscr == null ? 'n/a' : total.minDscr.toFixed(2)} · IRR ${total.irr == null ? 'n/a' : (total.irr * 100).toFixed(1) + '%'} · equity multiple ${total.equityMultiple == null ? 'n/a' : total.equityMultiple.toFixed(2)}`);
console.log(`  terminal value ${usd(total.terminalValue)} · payback ${total.payback == null ? 'beyond 10 yr' : total.payback.toFixed(2) + ' yr'}`);
if (!near(L.debtService, 12 * ((120000 * 0.00625) / (1 - Math.pow(1.00625, -120))), 1)) fail('loan payment is not the level annuity');
if (!(L.loanBalance < 120000)) fail('loan balance does not amortise');
if (total.minDscr != null && total.minDscr <= 0) fail('DSCR not positive on the funded case');
if (!(total.terminalValue > 0)) fail('terminal value is not positive');
if (!(base.kpis.noi1 > 0)) fail('base case does not cover its operating costs');
if (total.irr != null) {
  const flows = [-Math.max(1, total.gap), ...levered.years.map((r) => r.cashFlow)];
  flows[flows.length - 1] += total.terminalValue - levered.years[9].loanBalance;
  const npv = npvOf(total.irr, flows);
  if (Math.abs(npv) > Math.max(1, Math.abs(flows[0]) * 0.002)) fail('IRR does not zero the NPV');
}
const flat = irrOf([-100, 60, 60]);
if (!near(flat, 0.13066, 0.0005)) fail(`IRR solver wrong (${flat})`);

console.log('\n— break-even and export —');
const be = breakEvenOccupancy(m);
const atBe = yearFigures(m, 1, be / 100);
console.log(`  break-even occupancy ${be}% → NOI ${usd(atBe.noi)}`);
if (be == null) fail('no break-even found');
else if (Math.abs(atBe.noi) > 900) fail('break-even occupancy does not zero NOI');

const csv = toCsv(base);
const lines = csv.split('\n');
const header = lines[0].split(',');
console.log(`  CSV ${lines.length} lines, ${header.length} columns (${header[0]}, ${header[1]}, ${header[2]}…${header[header.length - 1]})`);
if (header.length !== 12) fail('CSV should have line item, unit and 10 years');
if (!/Net operating income/.test(csv)) fail('CSV missing NOI row');
if (!/IRR/.test(csv)) fail('CSV missing KPI block');

const empty = projectModel({});
if (empty.years.length !== 10) fail('empty input does not fall back to defaults');
const zero = projectModel({ ...DEFAULT_MODEL, occupancy: 0, retreats: 0, events: 0, parkingDays: 0 });
if (!(zero.years[0].noi < 0)) fail('zero demand should produce a loss');

console.log('\n— capacity drives cost, dues and tiers —');
const tiers20 = tierCounts(20);
if (tiers20.standard !== 8 || tiers20.preferred !== 8 || tiers20.premium !== 4) fail('20-space tiers are not 8/8/4');
const at30 = projectModel({ ...DEFAULT_MODEL, spaces: 30 });
if (at30.kpis.members !== 30) fail('30 spaces do not yield 30 members');
if (!near(at30.kpis.capital, 285000)) fail(`30-space capital is ${usd(at30.kpis.capital)}, expected 285,000`);
if (!near(at30.kpis.projectCost, 227500)) fail(`30-space cost is ${usd(at30.kpis.projectCost)}, expected 227,500`);
if (!near(at30.years[0].dues, 51840)) fail(`30-space dues are ${usd(at30.years[0].dues)}, expected 51,840`);
if (!(at30.kpis.gross1 > base.kpis.gross1)) fail('more spaces did not raise guest receipts');
if (readModel({ spaces: 23 }).spaces !== 23) fail('plan capacity is not read as an input');
if (readModel({ spaces: 0 }).spaces !== 0) fail('a zero-lot plan should not fall back to 20');
console.log(`  20 → ${usd(base.kpis.projectCost)} cost, ${usd(base.kpis.capital)} capital; 30 → ${usd(at30.kpis.projectCost)} cost, ${usd(at30.kpis.capital)} capital`);

console.log(`\n— fields —\n  ${FIELD_GROUPS.length} groups, ${FIELD_GROUPS.reduce((a, g) => a + g.fields.length, 0)} inputs, defaults for every one: ${Object.keys(DEFAULT_MODEL).length === FIELD_GROUPS.reduce((a, g) => a + g.fields.length, 0) ? '✓' : '✗'}`);

console.log(fails === 0 ? '\nFinancial model matches the plan.' : `\n${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
