// Checks the incorporation packet on disk and the register that drives the
// Documents tab: files, numbering, statuses, the index's own register table,
// required clauses, Markdown rendering and the nav/head helpers.
import { readFileSync, existsSync, statSync } from 'node:fs';
import {
  DOCS, DOC_GROUPS, statusCounts, statusLabel, docById, navHtml, docHeadHtml,
  summaryText, wordCount, readMinutes, initDocuments,
} from '../src/documents.js';
import { renderMarkdown } from '../src/markdown.js';

const dir = 'docs/incorporation';
let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (cond, m) => { if (!cond) fail(m); };

const STATUS_IDS = { Ready: 'ready', Adopt: 'adopt', Counsel: 'counsel' };
const GROUP_LABEL = (id) => (DOC_GROUPS.find((g) => g.id === id) || {}).label;

console.log('— packet files —');
ok(DOCS.length === 14, `expected 14 documents, found ${DOCS.length}`);
const expectedNums = Array.from({ length: 14 }, (_, i) => String(i).padStart(2, '0'));
ok(DOCS.map((d) => d.num).join(',') === expectedNums.join(','), 'documents are not numbered 00…13 in order');
ok(new Set(DOCS.map((d) => d.id)).size === DOCS.length, 'duplicate document ids');
ok(new Set(DOCS.map((d) => d.file)).size === DOCS.length, 'duplicate document files');

const text = new Map();
for (const doc of DOCS) {
  const path = `${dir}/${doc.file}`;
  if (!existsSync(path)) { fail(`${doc.num} ${doc.title}: missing ${path}`); continue; }
  const bytes = statSync(path).size;
  if (bytes < 3000) fail(`${doc.num} ${doc.title}: only ${bytes} bytes`);
  const md = readFileSync(path, 'utf8');
  text.set(doc.num, md);
  if (!doc.file.startsWith(`${doc.num}-`)) fail(`${doc.file} does not start with ${doc.num}-`);
  if (!doc.title.trim()) fail(`${doc.num} has no title`);
  if (!GROUP_LABEL(doc.group)) fail(`${doc.num} ${doc.title}: unknown group ${doc.group}`);
  if (!(doc.status in STATUS_IDS) && !['ready', 'adopt', 'counsel'].includes(doc.status)) fail(`${doc.num} has an unknown status`);
  const h1 = md.split('\n')[0].trim();
  if (h1 !== `# ${doc.title} — Holons Coop`) fail(`${doc.num} first line is “${h1}”`);
  console.log(`  ${doc.num} ${doc.title.padEnd(38)} ${String(bytes).padStart(6)} bytes · ${String(wordCount(md)).padStart(5)} words · ${statusLabel(doc)}`);
}

console.log('\n— register bookkeeping —');
const counts = statusCounts();
console.log(`  ${summaryText()}`);
ok(counts.ready === 4, `expected 4 ready, found ${counts.ready}`);
ok(counts.adopt === 5, `expected 5 for adoption, found ${counts.adopt}`);
ok(counts.counsel === 5, `expected 5 for counsel review, found ${counts.counsel}`);
const used = new Set(DOCS.map((d) => d.group));
for (const g of DOC_GROUPS) if (!used.has(g.id)) fail(`group ${g.id} has no documents`);
ok(docById('bylaws') !== null && docById('bylaws').num === '02', 'docById lookup is wrong');
ok(docById('nope') === null, 'docById should return null for unknown ids');
ok(statusLabel(docById('articles-of-incorporation')) === 'Ready to file or use', 'ready label is wrong');
ok(statusLabel(docById('bylaws')) === 'Board adoption required', 'adopt label is wrong');
ok(statusLabel(docById('membership-subscription-agreement')) === 'Counsel and DRE review', 'counsel label is wrong');

console.log('\n— index register matches the files —');
const index = text.get('00') || '';
const regStart = index.indexOf('## Document register');
const regEnd = index.indexOf('## Open items before filing');
ok(regStart >= 0 && regEnd > regStart, 'index has no document register section');
const register = regStart >= 0 && regEnd > regStart ? index.slice(regStart, regEnd) : '';
const rows = register.split('\n')
  .filter((line) => /^\|\s*\d{2}\s*\|/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((c) => c.trim()));
console.log(`  ${rows.length} register rows`);
ok(rows.length === DOCS.length, `register lists ${rows.length} documents, expected ${DOCS.length}`);
for (const cells of rows) {
  const doc = DOCS.find((d) => d.num === cells[0]);
  if (!doc) { fail(`register row ${cells[0]} has no document`); continue; }
  if (!cells[1].startsWith(doc.title)) fail(`register title for ${doc.num} is “${cells[1]}”`);
  if (cells[2] !== GROUP_LABEL(doc.group)) fail(`register group for ${doc.num} is “${cells[2]}”`);
  if (cells[3] !== doc.action) fail(`register action for ${doc.num} is “${cells[3]}”`);
  if (STATUS_IDS[cells[4]] !== doc.status) fail(`register status for ${doc.num} is “${cells[4]}”`);
  if (cells[5] !== doc.signatures) fail(`register signatures for ${doc.num} is “${cells[5]}”`);
}
ok(index.includes('**Readiness at a glance:** 4 ready to file or use, 5 for board adoption, 5 requiring counsel or'), 'index readiness line is wrong');

console.log('\n— required clauses —');
const REQUIRED = {
  '00': ['secretary of state', 'si-100', 'ein', 'transient occupancy', 'document register', 'readiness at a glance'],
  '01': ['california', 'agent for service', 'incorporator', 'cooperative', 'one vote'],
  '02': ['quorum', 'dissolution', 'amend', 'fiscal year', 'one vote'],
  '03': ['organizational', 'board', 'ein', 'minutes'],
  '04': ['conflict of interest', 'annual'],
  '05': ['deed', 'capital', 'arbitration', 'transient occupancy'],
  '06': ['licen', '180', '24 resident', '4 visitor'],
  '07': ['60%', '40%', 'transient occupancy', 'does not promise'],
  '08': ['cancellation', 'occupancy', 'indemnif'],
  '09': ['not an offer', 'dre', 'at risk', 'deed'],
  '10': ['minutes', 'retention', 'inspection'],
  '11': ['dues', 'reserve', 'two approvals', 'reconcil'],
  '12': ['secretary of state', 'si-100', 'ein', 'transient occupancy'],
  '13': ['week', 'si-100', 'annual member meeting'],
};
for (const [num, phrases] of Object.entries(REQUIRED)) {
  const md = (text.get(num) || '').toLowerCase();
  const missing = phrases.filter((p) => !md.includes(p.toLowerCase()));
  if (missing.length) fail(`${num} ${docById(DOCS.find((d) => d.num === num).id).title}: missing ${missing.map((p) => `“${p}”`).join(', ')}`);
}
for (const [num, md] of text) {
  for (const bad of ['TODO', 'TBD', 'lorem ipsum', '<<<<<<<', 'NaN', 'undefined']) {
    if (md.includes(bad)) fail(`${num} contains “${bad}”`);
  }
}

console.log('\n— Markdown and the reading pane —');
for (const [num, md] of text) {
  const html = renderMarkdown(md);
  if (!html.includes('<h2')) fail(`${num} renders no second-level headings`);
  if (/NaN|undefined/.test(html)) fail(`${num} renders NaN/undefined`);
  if (/<script/i.test(html)) fail(`${num} renders a script tag`);
  if (!html.includes('<p>')) fail(`${num} renders no paragraphs`);
  const words = wordCount(md);
  if (words < 400) fail(`${num} is only ${words} words`);
  if (readMinutes(words) < 2) fail(`${num} reading time looks wrong`);
}
const indexHtml = renderMarkdown(index);
const tableRows = (indexHtml.match(/<tr>/g) || []).length;
console.log(`  index renders ${tableRows} table rows · ${wordCount(index)} words · ${readMinutes(wordCount(index))} min`);
if (tableRows < 20) fail('index tables did not render');
if (!indexHtml.includes('<blockquote>')) fail('index disclaimer did not render as a quote');
if (!indexHtml.includes('class="num"')) fail('numeric table cells were not marked');

const nav = navHtml('bylaws');
const navCount = (nav.match(/data-doc="/g) || []).length;
console.log(`  nav rows ${navCount} · active ${(nav.match(/docrow on/g) || []).length}`);
if (navCount !== 14) fail(`nav lists ${navCount} documents`);
if ((nav.match(/docrow on/g) || []).length !== 1) fail('nav does not mark exactly one active row');
if (!nav.includes('href="#/projects/lithium-city/documents/bylaws"')) fail('nav link for bylaws is missing');
if (!nav.includes('class="docrow on"')) fail('nav has no active row');
if (/undefined|NaN/.test(nav)) fail('nav contains undefined/NaN');

const head = docHeadHtml(docById('bylaws'));
if (!head.includes('<h2>Bylaws</h2>')) fail('document head is missing the title');
if (!head.includes('Board adoption required')) fail('document head is missing the status');
if (!head.includes('Governance')) fail('document head is missing the group');
if (!head.includes('Adopt at organizational meeting')) fail('document head is missing the action');
if (/undefined|NaN/.test(head)) fail('document head contains undefined/NaN');

// ---- headless run of the pane ------------------------------------------
console.log('\n— pane wiring (DOM shim) —');
const nodes = new Map();
const node = (sel) => {
  const n = {
    innerHTML: '', textContent: '', attrs: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    setAttribute(k, v) { this.attrs[k] = v; },
    closest() { return null; },
  };
  nodes.set(sel, n);
  return n;
};
globalThis.document = { querySelector: (sel) => nodes.get(sel) || node(sel) };
globalThis.window = { addEventListener() {}, print() {} };
globalThis.location = { hash: '#/projects/lithium-city/documents/bylaws' };
globalThis.fetch = async () => ({
  ok: true,
  text: async () => '# Bylaws — Holons Coop\n\n> Draft for adoption.\n\n## Article 1 — Members\n\nOne vote per member.\n',
});

initDocuments();
await new Promise((r) => setTimeout(r, 20));
const navEl = nodes.get('#doc-nav');
const headEl = nodes.get('#doc-head');
const bodyEl = nodes.get('#doc-body');
const metaEl = nodes.get('#doc-meta');
const prevEl = nodes.get('#doc-prev');
const nextEl = nodes.get('#doc-next');
console.log(`  nav ${(navEl.innerHTML.match(/data-doc="/g) || []).length} rows · body ${bodyEl.innerHTML.length} bytes · ${metaEl.textContent}`);
ok((navEl.innerHTML.match(/data-doc="/g) || []).length === 14, 'pane nav did not paint all 14 rows');
ok(navEl.innerHTML.includes('class="docrow on"'), 'pane nav has no active row');
ok(headEl.innerHTML.includes('<h2>Bylaws</h2>'), 'pane head did not paint the deep-linked title');
ok(bodyEl.innerHTML.includes('<h2>Article 1 — Members</h2>'), 'pane body did not render the Markdown');
ok(bodyEl.innerHTML.includes('<blockquote>'), 'pane body lost the blockquote');
ok(!bodyEl.innerHTML.includes('Loading the document'), 'pane is still showing its loading text');
ok(/\d+ words · \d+ min read · docs\/incorporation\/02-bylaws\.md/.test(metaEl.textContent), 'pane meta line is wrong');
ok(prevEl.textContent === '‹ 01', 'previous button is wrong');
ok(nextEl.textContent === '03 ›', 'next button is wrong');
ok(prevEl.attrs['aria-label'] === 'Previous: Articles of Incorporation', 'previous label is wrong');

console.log(fails === 0 ? '\nDocument checks passed.' : `\n${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
