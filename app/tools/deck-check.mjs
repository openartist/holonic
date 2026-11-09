// Checks the imported deck data and the native slide templates.
import { DECK } from '../src/deck.js';
import { groups, tableHtml, slideHtml, overviewHtml, pad, esc } from '../src/deck-ui.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const has = (html, s, label) => { if (!html.includes(s)) fail(`${label} missing “${s}”`); };

console.log('— deck data —');
console.log(`  ${DECK.slides.length} slides · cover “${DECK.slides[0].title}” · ${DECK.meta.date}`);
if (DECK.slides.length !== 44) fail('expected 44 slides');
const nums = DECK.slides.map((s) => s.n);
if (nums.join(',') !== Array.from({ length: 44 }, (_, i) => i + 1).join(',')) fail('slide numbers are not 1..44 in order');
const emptyTitles = DECK.slides.filter((s) => !s.title || !s.title.trim());
if (emptyTitles.length) fail(`${emptyTitles.length} slides without a title`);
const kinds = DECK.slides.reduce((a, s) => ({ ...a, [s.kind]: (a[s.kind] || 0) + 1 }), {});
console.log(`  kinds ${JSON.stringify(kinds)} · tables ${DECK.slides.filter((s) => s.table).length}`);
if (!(kinds.cover === 1)) fail('no cover slide');
if (!(kinds.table >= 20)) fail('too few table slides');
if (!(kinds.statement >= 2)) fail('no statement slides');
if (!(kinds.list >= 2)) fail('no dense list slides');
for (const s of DECK.slides) {
  if (s.n > 1 && !s.strap && !s.lead && !s.bullets.length && !s.table) fail(`slide ${s.n} has no body at all`);
  if (s.table) {
    const widths = new Set(s.table.map((r) => r.length));
    if (widths.size > 1) fail(`slide ${s.n} table has ragged rows`);
  }
}

console.log('\n— slide templates —');
const cover = slideHtml(DECK.slides[0]);
const tableSlide = slideHtml(DECK.slides.find((s) => s.kind === 'table'));
const contentSlide = slideHtml(DECK.slides.find((s) => s.kind === 'content'));
const listSlide = slideHtml(DECK.slides.find((s) => s.kind === 'list'));
const statementSlide = slideHtml(DECK.slides.find((s) => s.kind === 'statement'));
has(cover, 'class="slide cover"', 'cover');
has(cover, 'Formerly Holoseum', 'cover');
has(tableSlide, '<table class="dtable">', 'table slide');
has(tableSlide, '<thead>', 'table slide');
has(contentSlide, 'class="dcards"', 'content slide');
has(listSlide, 'dense', 'list slide');
has(statementSlide, 'class="slide statement"', 'statement slide');
for (const [label, html] of [['cover', cover], ['table', tableSlide], ['content', contentSlide], ['list', listSlide], ['statement', statementSlide]]) {
  if (/NaN|undefined/.test(html)) fail(`${label} contains NaN/undefined`);
  if (!html.includes('class="dfoot"')) fail(`${label} has no footer`);
}

console.log('\n— grouping and tables —');
const grouped = groups(['Electricity', 'Individual RV solar limits common electrical infrastructure.', 'Water', 'Tanks do not establish an approved source.']);
console.log(`  groups → ${grouped.map((g) => `${g.head || '—'}:${g.body.length}`).join(', ')}`);
if (grouped.length !== 2) fail('heading/body grouping is wrong');
if (grouped[0].body.length !== 1 || grouped[1].body.length !== 1) fail('group bodies are wrong');
const tbl = tableHtml([['Path', 'Land ask'], ['B only', '$7,600'], ['A only', '$19,500']]);
if ((tbl.match(/<tr>/g) || []).length !== 3) fail('table row count wrong');
has(tbl, 'class="num"', 'table numbers');
const injected = slideHtml({ n: 9, kind: 'content', title: '<script>x</script>', bullets: ['<img src=x onerror=1>'], table: null, strap: '', lead: '', kicker: '', charts: false });
if (injected.includes('<script>')) fail('slide markup is not escaped');
if (injected.includes('<img')) fail('bullet markup is not escaped');

console.log('\n— overview and chrome —');
const over = overviewHtml(3);
const tiles = (over.match(/data-slide="/g) || []).length;
console.log(`  ${tiles} overview tiles · counter format ${pad(7)}`);
if (tiles !== 44) fail('overview does not list every slide');
has(over, 'data-slide="0"', 'overview');
has(over, 'data-slide="43"', 'overview');
if (!over.includes('tile on')) fail('overview does not mark the current slide');
if (esc('<&>') !== '&lt;&amp;&gt;') fail('escaping is wrong');

console.log('\n— every slide renders —');
let min = Infinity;
let max = 0;
for (const s of DECK.slides) {
  const html = slideHtml(s);
  if (html.length < 250) fail(`slide ${s.n} rendered suspiciously short`);
  if (/NaN|undefined/.test(html)) fail(`slide ${s.n} contains NaN/undefined`);
  min = Math.min(min, html.length);
  max = Math.max(max, html.length);
}
console.log(`  html per slide ${min}–${max} bytes`);
if (DECK.slides.some((s) => !slideHtml(s).includes(`>${pad(s.n)}<`))) fail('some slides are missing their number');

console.log(fails === 0 ? '\nDeck checks passed.' : `\n${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
