// Checks that every pane, project, reservation and document has a stable
// address, and that legacy links resolve into the new route table.
import { readFileSync } from 'node:fs';
import { parseRoute, projectPath, reservePath, routeFor } from '../src/routes.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (cond, m) => { if (!cond) fail(m); };

console.log('— route table —');
const routes = [
  ['home', null, {}, '#/'],
  ['project', 'lithium-city', {}, '#/projects/lithium-city'],
  ['project', 'holon-02', {}, '#/projects/holon-02'],
  ['reserve', null, {}, '#/reserve'],
  ['reserve', 'lithium-city', {}, '#/projects/lithium-city/reserve'],
  ['plan', 'lithium-city', {}, '#/projects/lithium-city/plan'],
  ['model', 'lithium-city', {}, '#/projects/lithium-city/calculator'],
  ['pl', 'lithium-city', {}, '#/projects/lithium-city/pnl'],
  ['roadmap', 'lithium-city', {}, '#/projects/lithium-city/roadmap'],
  ['deck', 'lithium-city', {}, '#/projects/lithium-city/slides'],
  ['documents', 'lithium-city', { docId: 'bylaws' }, '#/projects/lithium-city/documents/bylaws'],
  ['team', 'lithium-city', {}, '#/projects/lithium-city/team'],
  ['brief', 'lithium-city', {}, '#/projects/lithium-city/brief'],
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
ok(parseRoute('#/projects/holon-02/plan').tab === 'project', 'coming-soon data path should fall back to project');
ok(parseRoute('#/projects/holon-02/reserve').tab === 'reserve', 'coming-soon reserve path should stay a reserve route');
ok(parseRoute('').tab === 'home', 'empty address is not home');
ok(parseRoute('#/').tab === 'home', 'home address is not home');

console.log('\n— legacy links —');
ok(parseRoute('#documents/bylaws').tab === 'documents', 'legacy document link is not documents');
ok(parseRoute('#documents/bylaws').docId === 'bylaws', 'legacy document link lost its id');
ok(parseRoute('#plan').tab === 'plan', 'legacy plan link is not plan');
ok(parseRoute('#project/lithium-city').tab === 'project', 'legacy project link is not project');

console.log('\n— router wiring —');
const main = readFileSync('src/main.js', 'utf8');
const home = readFileSync('src/home.js', 'utf8');
const docs = readFileSync('src/documents.js', 'utf8');
ok(main.includes('parseRoute'), 'main does not parse addresses');
ok(main.includes('routeFor'), 'main does not write addresses');
ok(main.includes('history.pushState'), 'tabs do not create history entries');
ok(main.includes("addEventListener('popstate'"), 'back/forward is not wired');
ok(main.includes("addEventListener('hashchange'"), 'manual hash changes are not wired');
ok(home.includes('projectPath'), 'home project links do not use the route table');
ok(docs.includes('parseRoute'), 'documents do not read their address');
ok(docs.includes('projectPath'), 'document links do not use the route table');
ok(!home.includes('href="#project/'), 'an old project address remains in home');
ok(!docs.includes('href="#documents/'), 'an old document address remains in documents');
ok(!main.includes("startHash"), 'the old start-hash switch remains');

console.log(fails ? `\n${fails} failure(s)` : '\nRoute checks passed.');
process.exit(fails ? 1 : 0);
