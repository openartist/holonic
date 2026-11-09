// Minimal DOM shim so the UI module can be executed headlessly.
// Catches selector typos, bad wiring and render-time crashes. Not a browser test.
const values = {
  w: '500', h: '442', siteW: '28', siteD: '34', mix: 'mixed', seed: 'alder-row-02',
  pattern: 'auto', 'rule-lane': '22', 'rule-buffer': '12', 'rule-garden': '18',
  'rule-tree': '1', 'rule-visitor': '12', 'rule-resident': '8', 'rule-core': 'compact',
  'rule-people': '2', 'rule-guests': '1', 'rule-parkpos': 'edge', 'rule-path': 'gentle',
  'util-power': 'solar', 'util-water': 'well', 'util-sewer': 'septic',
};
const nodes = new Map();

function makeNode(id) {
  const node = {
    id,
    value: values[id] ?? '',
    checked: id !== 'theme',
    disabled: false,
    innerHTML: '',
    textContent: '',
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {},
    dispatchEvent() {},
    closest() { return { classList: { toggle() {} } }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  nodes.set(id, node);
  return node;
}

globalThis.document = {
  querySelector(sel) {
    const id = sel.replace(/^#/, '');
    return nodes.get(id) || makeNode(id);
  },
  querySelectorAll(sel) {
    if (sel === '[data-preset]') return ['rv', 'tiny', 'garden'].map((p) => ({ dataset: { preset: p }, addEventListener() {} }));
    return [];
  },
  createElement() { return { href: '', download: '', click() {} }; },
  addEventListener() {},
};
globalThis.window = { addEventListener() {} };
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};

const { generatePlan } = await import('../src/generate.js');
const { renderPlan } = await import('../src/render.js');
await import('../src/main.js');

const svg = nodes.get('plan').innerHTML;
const stats = nodes.get('stats').innerHTML;
const programme = nodes.get('programme').innerHTML;
const count = (re) => (svg.match(re) || []).length;

console.log('main.js executed with the DOM shim');
console.log(`  svg bytes      ${svg.length}`);
console.log(`  rects          ${count(/<rect/g)}`);
console.log(`  circles        ${count(/<circle/g)}`);
console.log(`  text nodes     ${count(/<text/g)}`);
console.log(`  title block    ${/TINY HOME VILLAGE/.test(svg) ? 'present' : 'MISSING'}`);
console.log(`  parking label  ${/PARKING/.test(svg) ? 'present' : 'MISSING'}`);
console.log(`  pattern row    ${/Pattern/.test(stats) ? 'present' : 'MISSING'}`);
console.log(`  schedule rows  ${(programme.match(/<li>/g) || []).length}`);

let bad = 0;
const check = (ok, msg) => { if (!ok) { console.log('  FAIL', msg); bad++; } };
check(count(/<rect/g) > 50, 'too few shapes');
check(/TINY HOME VILLAGE/.test(svg), 'title block missing');
check(/PARKING/.test(svg), 'parking not drawn');
check(stats.length > 40, 'stats not painted');
check(programme.length > 20, 'programme not painted');
check(/POWER/.test(svg) && /WATER/.test(svg) && /SEWER/.test(svg), 'service layers not drawn');
check(/Power/.test(stats), 'utility stats missing');
check(/Peak population/.test(stats), 'population stats missing');

for (const pattern of ['bands', 'loops', 'grid', 'perimeter', 'rings', 'organic', 'terrace']) {
  for (const [w, h] of [[900, 640], [460, 900], [2600, 300]]) {
    const p = generatePlan({ width: w, height: h, siteW: 34, siteD: 40, mix: 'tiny', seed: `smoke-${pattern}-${w}`, pattern });
    const s = renderPlan(p, { theme: 'plan' });
    check(!/NaN|undefined/.test(s), `bad svg ${pattern} ${w}x${h}`);
    check(p.stats.sites > 0, `no lots ${pattern} ${w}x${h}`);
    check(p.utilities && p.utilities.power.runs.length > 0, `no utility runs ${pattern} ${w}x${h}`);
    console.log(`  ${pattern} ${w}x${h}: ${p.stats.sites} lots, ${p.stats.parking} stalls, ${p.stats.buildings} bldgs`);
  }
}

console.log(bad ? `\n${bad} failure(s)` : '\nUI smoke test passed');
process.exit(bad ? 1 : 0);
