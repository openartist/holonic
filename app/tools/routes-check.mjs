// Checks that every pane, project, reservation and document has a stable
// address, and that legacy links resolve into the new route table.
import { readFileSync } from 'node:fs';
import { parseRoute, projectPath, purchasePath, reservePath, routeFor } from '../src/routes.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (cond, m) => { if (!cond) fail(m); };

console.log('— route table —');
const routes = [
  ['home', null, {}, '#/'],
  ['about', null, {}, '#/about'],
  ['mission', null, {}, '#/mission'],
  ['technology', null, {}, '#/technology'],
  ['team', null, {}, '#/team'],
  ['project', 'lithium-city', {}, '#/projects/lithium-city'],
  ['project', 'holon-02', {}, '#/projects/holon-02'],
  ['reserve', null, {}, '#/reserve'],
  ['reserve', 'lithium-city', {}, '#/projects/lithium-city/reserve'],
  ['purchase', 'lithium-city', { docId: '04' }, '#/projects/lithium-city/purchase/04'],
  ['plan', 'lithium-city', {}, '#/projects/lithium-city/plan'],
  ['model', 'lithium-city', {}, '#/projects/lithium-city/calculator'],
  ['pl', 'lithium-city', {}, '#/projects/lithium-city/pnl'],
  ['roadmap', 'lithium-city', {}, '#/projects/lithium-city/roadmap'],
  ['deck', 'lithium-city', {}, '#/projects/lithium-city/slides'],
  ['documents', 'lithium-city', { docId: 'bylaws' }, '#/projects/lithium-city/documents/bylaws'],
  ['team', 'lithium-city', {}, '#/projects/lithium-city/team'],
  ['brief', 'lithium-city', {}, '#/projects/lithium-city/brief'],
  ['plan', 'holon-02', {}, '#/projects/holon-02/plan'],
  ['deck', 'holon-03', {}, '#/projects/holon-03/slides'],
  ['team', 'holon-04', {}, '#/projects/holon-04/team'],
];
for (const [tab, projectId, opts, expected] of routes) {
  const got = routeFor(tab, projectId, opts);
  ok(got === expected, `${tab} route is ${got}, expected ${expected}`);
}
ok(projectPath() === '#/projects/lithium-city', 'default project path is wrong');
ok(projectPath('holon-02') === '#/projects/holon-02', 'project path is wrong');
ok(projectPath('unknown') === '#/projects/lithium-city', 'unknown project should normalize');
ok(reservePath() === '#/reserve', 'network reserve path is wrong');
ok(reservePath('lithium-city') === '#/projects/lithium-city/reserve', 'project reserve path is wrong');
ok(purchasePath('lithium-city', '04') === '#/projects/lithium-city/purchase/04', 'parcel purchase path is wrong');

console.log('  every page, project, reserve state and document has a path');

console.log('\n— round trips —');
for (const [tab, projectId, opts] of routes) {
  const hash = routeFor(tab, projectId, opts);
  const parsed = parseRoute(hash);
  ok(parsed.tab === tab, `${hash} parsed as ${parsed.tab}, expected ${tab}`);
  if (tab !== 'home' && tab !== 'reserve') ok(parsed.projectId === projectId, `${hash} lost its project`);
  if (opts.docId) ok(parsed.docId === opts.docId, `${hash} lost its document`);
}
ok(parseRoute('#/projects/lithium-city/calculator').tab === 'model', 'calculator slug is not model');
ok(parseRoute('#/projects/lithium-city/slides').tab === 'deck', 'slides slug is not deck');
ok(parseRoute('#/projects/holon-02/plan').tab === 'plan', 'coming-soon section path should preserve its section');
ok(parseRoute('#/projects/holon-02/plan').projectId === 'holon-02', 'coming-soon section path lost its project');
ok(parseRoute('#/projects/holon-03/slides').tab === 'deck', 'coming-soon slides path is not deck');
ok(parseRoute('#/projects/holon-02/reserve').tab === 'reserve', 'coming-soon reserve path should stay a reserve route');
ok(parseRoute('#/projects/lithium-city/purchase/04').tab === 'purchase', 'parcel purchase path is not a purchase route');
ok(parseRoute('#/projects/lithium-city/purchase/04').docId === '04', 'parcel purchase path lost its parcel');
ok(parseRoute('').tab === 'home', 'empty address is not home');
ok(parseRoute('#/').tab === 'home', 'home address is not home');
ok(parseRoute('#/about').tab === 'about', 'about address is not about');
ok(parseRoute('#/mission').tab === 'mission', 'mission address is not mission');
ok(parseRoute('#/technology').tab === 'technology', 'technology address is not technology');
ok(parseRoute('#/team').tab === 'team', 'global team address is not team');
ok(parseRoute('#/team').projectId === null, 'global team address should not carry a project');

console.log('\n— legacy links —');
ok(parseRoute('#documents/bylaws').tab === 'documents', 'legacy document link is not documents');
ok(parseRoute('#documents/bylaws').docId === 'bylaws', 'legacy document link lost its id');
ok(parseRoute('#plan').tab === 'plan', 'legacy plan link is not plan');
ok(parseRoute('#project/lithium-city').tab === 'project', 'legacy project link is not project');

console.log('\n— router wiring —');
const main = readFileSync('src/main.js', 'utf8');
const home = readFileSync('src/home.js', 'utf8');
const docs = readFileSync('src/documents.js', 'utf8');
const purchase = readFileSync('src/purchase.js', 'utf8');
ok(main.includes('parseRoute'), 'main does not parse addresses');
ok(main.includes('routeFor'), 'main does not write addresses');
ok(main.includes('history.pushState'), 'tabs do not create history entries');
ok(main.includes("addEventListener('popstate'"), 'back/forward is not wired');
ok(main.includes("addEventListener('hashchange'"), 'manual hash changes are not wired');
ok(home.includes('projectPath'), 'home project links do not use the route table');
ok(docs.includes('parseRoute'), 'documents do not read their address');
ok(docs.includes('projectPath'), 'document links do not use the route table');
ok(main.includes('initPurchase'), 'main does not render purchase packets');
ok(purchase.includes('purchaseHtml'), 'purchase packet has no renderer');
ok(purchase.includes('DOCS'), 'purchase packet does not read the legal register');
ok(!home.includes('href="#project/'), 'an old project address remains in home');
ok(!docs.includes('href="#documents/'), 'an old document address remains in documents');
ok(!main.includes("startHash"), 'the old start-hash switch remains');

console.log(fails ? `\n${fails} failure(s)` : '\nRoute checks passed.');
process.exit(fails ? 1 : 0);
