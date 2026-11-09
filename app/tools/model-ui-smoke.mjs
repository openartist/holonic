// Headless checks for the calculator markup: the sheet must have ten year
// columns and every line, KPIs must format money, and overrides must round-trip.
import { DEFAULT_MODEL, FIELD_GROUPS, SCENARIOS, projectModel, toCsv } from '../src/model.js';
import { fieldsHtml, kpiHtml, sheetHtml, summaryHtml, notesHtml } from '../src/model-ui.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const has = (html, s, label) => { if (!html.includes(s)) fail(`${label} missing “${s}”`); };

const base = projectModel(DEFAULT_MODEL);
const sheet = sheetHtml(base, {});
const kpis = kpiHtml(base);
const summary = summaryHtml(base);
const fields = fieldsHtml();
const notes = notesHtml(base);

console.log('— calculator fields —');
const inputCount = (fields.match(/<input /g) || []).length;
console.log(`  ${inputCount} inputs in ${(fields.match(/<fieldset/g) || []).length} groups`);
const expectedInputs = FIELD_GROUPS.reduce((n, g) => n + g.fields.length, 0);
if (inputCount !== expectedInputs) fail(`expected ${expectedInputs} inputs, got ${inputCount}`);
has(fields, 'Site capacity', 'capacity readout');
has(fields, 'id="in-nightlyRate"', 'fields');
has(fields, 'id="in-capRate"', 'fields');
has(fields, 'id="in-dues"', 'fields');

console.log('\n— KPI cards —');
const cards = (kpis.match(/class="kpi"/g) || []).length;
console.log(`  ${cards} cards · Year 1 NOI $${Math.round(base.kpis.noi1).toLocaleString('en-US')} · break-even ${base.kpis.breakEven}%`);
if (cards < 10) fail('too few KPI cards');
has(kpis, 'Project cost', 'kpis');
has(kpis, '$180,000', 'kpis');
has(kpis, 'Minimum DSCR', 'kpis');
has(kpis, 'Break-even occupancy', 'kpis');
if (/NaN|undefined/.test(kpis)) fail('KPI markup contains NaN/undefined');

console.log('\n— P&L sheet —');
const headers = (sheet.match(/<th class="num">Y\d+<\/th>/g) || []).length;
const rows = (sheet.match(/<tr/g) || []).length;
const overrides = (sheet.match(/data-ov="/g) || []).length;
const cells = (sheet.match(/<td class="num/g) || []).length;
console.log(`  10-year header count ${headers} · ${rows} rows · ${cells} numeric cells · ${overrides} override inputs`);
if (headers !== 10) fail('sheet does not have ten year columns');
if (overrides !== 20) fail('sheet should have two editable rows of ten');
if (!(rows > 30)) fail('sheet looks empty');
has(sheet, 'Net operating income', 'sheet');
has(sheet, 'Total revenue', 'sheet');
has(sheet, 'Owner payout pool', 'sheet');
has(sheet, 'DSCR', 'sheet');
has(sheet, 'Terminal value at exit', 'sheet');
if (/NaN|undefined/.test(sheet)) fail('sheet markup contains NaN/undefined');
if (/<td class="num[^"]*">\$0<\/td>/.test(sheet)) console.log('  note: a zero cell is present (expected for memo rows in some years)');

console.log('\n— overrides round-trip —');
const tilted = projectModel(DEFAULT_MODEL, { 1: { occupancy: 0.6 }, 2: { rate: 55 } });
const tiltedSheet = sheetHtml(tilted, { 1: { occupancy: 0.6 }, 2: { rate: 55 } });
has(tiltedSheet, 'value="60"', 'override sheet');
has(tiltedSheet, 'value="55"', 'override sheet');
if (!(tilted.years[0].nights > base.years[0].nights)) fail('occupancy override does not raise paid nights');
if (!(tilted.years[1].lodging > base.years[1].lodging)) fail('rate override does not raise lodging');
console.log(`  Y1 nights ${Math.round(base.years[0].nights)} → ${Math.round(tilted.years[0].nights)} with a 60% override`);

console.log('\n— summary and notes —');
has(summary, 'Year 1 bridge', 'summary');
has(summary, '$30,240', 'summary');
has(summary, '$7,766', 'summary');
has(summary, 'pass-through', 'summary');
if (/NaN|undefined/.test(summary + notes)) fail('summary/notes contain NaN/undefined');
console.log(`  notes mention ${(notes.match(/<p>/g) || []).length} points`);

console.log('\n— scenario buttons drive the same sheet —');
for (const name of Object.keys(SCENARIOS)) {
  const r = projectModel({ ...DEFAULT_MODEL, ...SCENARIOS[name].values });
  const html = sheetHtml(r, {});
  if (!html.includes('Paid guest-nights')) fail(`${name} sheet incomplete`);
  console.log(`  ${name.padEnd(9)} Y1 NOI $${Math.round(r.kpis.noi1).toLocaleString('en-US')}`);
}

console.log('\n— CSV and empty input —');
const csv = toCsv(base);
if (csv.split('\n').length < 35) fail('CSV too short');
if (!/Year 10/.test(csv)) fail('CSV missing year 10');
const fallback = projectModel({});
if (!fallback.years || fallback.years.length !== 10) fail('missing-input fallback broken');
if (!fieldsHtml({}).includes('in-nightlyRate')) fail('fieldsHtml does not fall back to defaults');

console.log(fails === 0 ? '\nCalculator markup checks passed.' : `\n${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
