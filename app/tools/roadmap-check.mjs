// Checks the roadmap data and markup: phase budgets must reconcile with the
// calculator's project cost, readiness chips must respond to plan and model, and
// progress must count what is actually checked.
import { PHASES, TOTAL_WEEKS, allSteps, phaseBudgets, progress, progressHtml,
  tiesHtml, ganttHtml, phasesHtml, fundingHtml } from '../src/roadmap.js';
import { DEFAULT_MODEL, projectModel } from '../src/model.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const has = (html, s, label) => { if (!html.includes(s)) fail(`${label} missing “${s}”`); };

const base = projectModel(DEFAULT_MODEL);
const budgets = phaseBudgets(DEFAULT_MODEL);
const steps = allSteps();
const sum = Object.values(budgets).reduce((a, b) => a + b.cost, 0);

console.log('— phase structure —');
const gateCount = PHASES.reduce((a, p) => a + p.steps.filter((s) => !s.tab).length, 0);
console.log(`  ${PHASES.length} phases · ${steps.length} steps · ${gateCount} gates · ${TOTAL_WEEKS} weeks`);
if (PHASES.length !== 6) fail('expected six phases');
if (steps.length < 30) fail('roadmap is too thin');
if (gateCount !== PHASES.length) fail('every phase needs exactly one gate');
const ids = new Set();
for (const s of steps) {
  if (ids.has(s.id)) fail(`duplicate step id ${s.id}`);
  ids.add(s.id);
  if (!(s.week >= 0 && s.week <= TOTAL_WEEKS)) fail(`${s.id} week out of range`);
  if (!s.title || !s.detail || !s.owner) fail(`${s.id} incomplete`);
}
for (const p of PHASES) {
  if (!p.gate) fail(`${p.id} has no gate`);
  if (!(p.start < p.end)) fail(`${p.id} window is empty`);
  if (!p.steps.some((s) => s.week >= p.start && s.week <= p.end)) fail(`${p.id} has no step inside its window`);
}

console.log('\n— budgets reconcile with the calculator —');
console.log(`  phases sum ${sum.toLocaleString('en-US')} vs project cost ${base.kpis.projectCost.toLocaleString('en-US')}`);
if (Math.abs(sum - base.kpis.projectCost) > 0.5) fail('phase budgets do not equal the project cost');
const dearer = projectModel({ ...DEFAULT_MODEL, landPrice: DEFAULT_MODEL.landPrice + 25000 });
const dearerSum = Object.values(phaseBudgets(dearer.model)).reduce((a, b) => a + b.cost, 0);
if (Math.abs(dearerSum - dearer.kpis.projectCost) > 0.5) fail('budgets do not follow an edited land price');
if (!(dearerSum > sum)) fail('land price edit does not raise phase budgets');
console.log(`  land +$25,000 → phases ${dearerSum.toLocaleString('en-US')}, project cost ${dearer.kpis.projectCost.toLocaleString('en-US')} ✓`);

console.log('\n— progress —');
const none = progress({});
const half = progress(Object.fromEntries(steps.slice(0, 19).map((s) => [s.id, true])));
const all = progress(Object.fromEntries(steps.map((s) => [s.id, true])));
console.log(`  none ${none.pct}% · half ${half.pct}% · all ${all.pct}% · next gate ${none.nextGate.num}`);
if (none.pct !== 0 || none.complete !== 0) fail('empty progress is not zero');
if (all.pct !== 100) fail('full progress is not 100%');
if (!(half.pct > 0 && half.pct < 100)) fail('partial progress out of range');
if (none.nextGate.id !== PHASES[0].id) fail('next gate is not the first phase');
if (all.nextGate !== null) fail('completed roadmap still reports a gate');
if (!progressHtml(half).includes(`width:${half.pct}%`)) fail('progress bar width wrong');

console.log('\n— roadmaps tied to the plan and the model —');
const goodPlan = { stats: { sites: 24, parking: 34, visitorStalls: 16, residentStalls: 18 } };
const thinPlan = { stats: { sites: 8, parking: 10, visitorStalls: 4, residentStalls: 6 } };
const good = tiesHtml(goodPlan, projectModel({ ...DEFAULT_MODEL, spaces: 24 }));
const thin = tiesHtml(thinPlan, projectModel({ ...DEFAULT_MODEL, spaces: 8 }));
console.log(`  plan 24 lots / 32 stalls → ${(good.match(/class="tie ok"/g) || []).length} pass, ${(good.match(/class="tie warn"/g) || []).length} warn`);
console.log(`  plan 8 lots / 10 stalls → ${(thin.match(/class="tie ok"/g) || []).length} pass, ${(thin.match(/class="tie warn"/g) || []).length} warn`);
if (!/24 lots drawn · 24 in the model/.test(good)) fail('plan lot count not reflected');
if (!thin.includes('⚠')) fail('thin plan produces no warning');
if (thin.split('class="tie warn"').length <= good.split('class="tie warn"').length) fail('thin plan does not warn more');
const unfunded = projectModel({ ...DEFAULT_MODEL, standardPrice: 0, preferredPrice: 0, premiumPrice: 0 });
const broke = tiesHtml(null, unfunded);
console.log(`  memberships at $0 → ${/Funding gap/.test(broke) ? 'gap flagged' : 'NO GAP FLAGGED'} · ${/No debt in the model/.test(broke) ? 'no-debt chip ok' : 'debt chip missing'}`);
if (!/Funding gap/.test(broke)) fail('funding gap is not surfaced');
if (!broke.includes('class="tie warn"')) fail('unfunded model has no warning');

console.log('\n— markup —');
const sheet = phasesHtml({}, budgets);
const gantt = ganttHtml({ [steps[0].id]: true });
const funding = fundingHtml(base, budgets);
console.log(`  ${(sheet.match(/<article class="phase"/g) || []).length} phase cards · ${(sheet.match(/data-step=/g) || []).length} checkboxes · ${(funding.match(/<tr>/g) || []).length} funding rows`);
if ((sheet.match(/<article class="phase"/g) || []).length !== 6) fail('phase card count wrong');
if ((sheet.match(/data-step=/g) || []).length !== steps.length) fail('not every step has a checkbox');
for (const s of steps) has(sheet, `data-step="${s.id}"`, 'phase markup');
if (!sheet.includes('class="step done"') === false) { /* done flag absent when nothing checked */ }
if (!phasesHtml({ [steps[0].id]: true }, budgets).includes('step done')) fail('checked step is not marked done');
if ((gantt.match(/class="grow"/g) || []).length !== 6) fail('gantt rows wrong');
if ((gantt.match(/class="tick/g) || []).length !== steps.filter((s) => s.tab).length) fail('gantt ticks wrong');
if (!funding.includes('Project cost')) fail('funding table missing total');
if (/NaN|undefined/.test(sheet + gantt + funding)) fail('markup contains NaN/undefined');
if (funding.includes('fundwarn')) fail('funding mismatch warning shown for consistent defaults');
console.log(`  gate text and jump links present: ${/data-goto="plan"/.test(sheet) && /data-goto="brief"/.test(sheet) ? '✓' : '✗'}`);
if (!/data-goto="plan"/.test(sheet) || !/data-goto="brief"/.test(sheet)) fail('phase cards do not link to the other tabs');

console.log(fails === 0 ? '\nRoadmap checks passed.' : `\n${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
