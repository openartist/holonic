// Checks the project hub: live membership and land-right data, all project
// views, the coming-soon state, and the navigation wiring.
import { existsSync } from 'node:fs';
import { projectHtml, initProject, initProjectSection, projectRailHtml, projectSectionHtml } from '../src/project.js';
import { DATA_VIEWS, PROJECTS, projectById } from '../src/projects.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (cond, m) => { if (!cond) fail(m); };

const plan = { stats: { sites: 15, acres: 5.07 } };
const live = projectById('lithium-city');
const soon = projectById('holon-02');
const html = projectHtml(live, plan);

console.log('— live project hub —');
console.log(`  ${html.length} bytes · ${(html.match(/data-project-tab=/g) || []).length} data views`);
ok(html.includes('<h2>Lithium City</h2>'), 'project name is missing');
ok(html.includes('15 of 15'), 'live parcel count is missing');
ok(html.includes('5.07 acres'), 'parcel size is missing');
ok(html.includes('$7,500') && html.includes('$12,500'), 'live membership range is missing');
ok(html.includes('$150'), 'live dues are missing');
ok((html.match(/class="memberCard"/g) || []).length === 3, 'membership types are not all rendered');
ok((html.match(/<article class="landRight/g) || []).length === 3, 'land rights are not all rendered');
ok(html.includes('Cooperative leasehold'), 'leasehold land right is missing');
ok(html.includes('Undivided land interest'), 'undivided land right is missing');
ok(html.includes('Deeded parcel'), 'future land right is missing');
ok(html.includes('Review required'), 'land-right review tag is missing');
ok(html.includes('One owner record, many places to belong.'), 'network access promise is missing');
ok(html.includes('Lithium City owners can request time at other Holons'), 'project network access is missing');
ok((html.match(/data-project-tab=/g) || []).length === 8, 'expected eight project data views');
ok(html.includes('data-project-reserve'), 'reserve action is missing');
ok(html.includes('data-project-home'), 'back-to-network action is missing');
ok(html.includes('projectHeaderImage'), 'project community image is missing');
ok(html.includes('Community concept'), 'community image label is missing');
ok(existsSync(live.communityImage), `community image file is missing: ${live.communityImage}`);
ok(html.indexOf('data-project-reserve') < html.indexOf('projectHeaderImage'), 'community image should sit under the project actions');

console.log('\n— project left nav —');
const railLabels = ['Site plan', 'Calculator', 'P&amp;L', 'Roadmap', 'Slides', 'Documents', 'Team', 'Brief'];
const rail = projectRailHtml(live, 'plan');
ok((rail.match(/data-project-section=/g) || []).length === 8, 'project rail should list eight sections');
for (const label of railLabels) ok(rail.includes(`>${label}<`), `project rail is missing ${label}`);
ok(rail.includes('aria-current="page"'), 'project rail has no current section');
ok(rail.includes('href="#/projects/lithium-city/plan"'), 'project rail plan link is wrong');
ok(rail.includes('class="projectRailHome"'), 'project rail has no home link');
ok(rail.indexOf('projectRailHome') < rail.indexOf('projectRailHead'), 'project home link should sit above the project header');
ok(rail.includes('href="#/" aria-label="Holons home"'), 'project home link is wrong');
ok(rail.includes('Project overview'), 'project rail has no overview link');
for (const project of PROJECTS) {
  const projectRail = projectRailHtml(project, 'project');
  ok(projectRail.includes(project.name), `${project.name} rail is missing its name`);
  ok(projectRail.includes(project.statusLabel), `${project.name} rail is missing its status`);
  ok(projectRail.includes('class="projectRailHome"'), `${project.name} rail is missing its home link`);
  ok((projectRail.match(/data-project-section=/g) || []).length === 8, `${project.name} rail is missing sections`);
  ok(projectRail.includes(`#/projects/${project.id}/brief`), `${project.name} rail brief link is wrong`);
}

console.log('\n— in-formation project sections —');
const formation = projectSectionHtml(soon, 'plan');
ok(formation.includes('Holon 02'), 'in-formation section lost its project');
ok(formation.includes('Site plan'), 'in-formation section lost its title');
ok(formation.includes('In formation'), 'in-formation section lost its status');
ok(formation.includes(soon.planned[0]), 'in-formation section is missing its next steps');
ok(formation.includes('data-project-section-contact'), 'in-formation section has no contact action');
ok(!/NaN|undefined|Infinity/.test(formation), 'in-formation section contains a bad value');
for (const view of DATA_VIEWS) {
  const section = projectSectionHtml(soon, view.id);
  ok(section.includes(soon.name), `${soon.name} ${view.id} section lost its project`);
  ok(!section.includes('Lithium City'), `${soon.name} ${view.id} section carries Lithium City copy`);
}
ok(!/NaN|undefined|Infinity/.test(html), 'project markup contains a bad value');
ok((html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length, 'div tags do not balance');

console.log('\n— coming-soon project —');
const coming = projectHtml(soon, plan);
ok(coming.includes('Holon 02'), 'coming-soon project name is missing');
ok(coming.includes('Coming soon'), 'coming-soon status is missing');
ok(coming.includes('Reservations are not open'), 'coming-soon reservation note is missing');
ok(coming.includes('data-project-contact'), 'register-interest action is missing');
ok(coming.includes('projectHeaderImage'), 'coming-soon community image is missing');
ok(existsSync(soon.communityImage), `community image file is missing: ${soon.communityImage}`);
ok(coming.indexOf('data-project-contact') < coming.indexOf('projectHeaderImage'), 'coming-soon image should sit under the project actions');
ok(!coming.includes('data-project-tab='), 'coming-soon project should not expose live data views');
ok(!coming.includes('Reserve at Holon 02'), 'coming-soon project should not offer a reservation');
for (const project of PROJECTS) {
  const page = projectHtml(project, plan);
  ok(page.includes('projectHeaderImage'), `${project.name} has no community image header`);
  ok(page.includes(project.communityImage), `${project.name} header does not use its community image`);
  ok(page.includes(project.communityImageAlt), `${project.name} header alt text is missing`);
  ok(existsSync(project.communityImage), `${project.name} community image file is missing`);
}

// ---- DOM wiring ---------------------------------------------------------
console.log('\n— project navigation (DOM shim) —');
const nodes = new Map();
const mk = (sel) => {
  const n = { innerHTML: '', listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; } };
  nodes.set(sel, n);
  return n;
};
const host = mk('#project');
globalThis.document = { querySelector: (sel) => nodes.get(sel) || mk(sel) };

let tab = null;
let reserved = false;
let contacted = false;
initProject({
  projectId: 'lithium-city',
  getPlan: () => plan,
  goTab: (id) => { tab = id; },
  goReserve: () => { reserved = true; },
  openContact: () => { contacted = true; },
});
ok(host.innerHTML.includes('Lithium City'), 'initProject did not render the project');
host.listeners.click({ target: { closest: (sel) => (sel === '[data-project-tab]' ? { dataset: { projectTab: 'model' } } : null) } });
ok(tab === 'model', 'a data view did not open');
host.listeners.click({ target: { closest: (sel) => (sel === '[data-project-reserve]' ? {} : null) } });
ok(reserved, 'reserve did not open the reservation flow');
initProject({ projectId: 'holon-02', getPlan: () => plan, goTab: () => {}, goReserve: () => {}, openContact: () => { contacted = true; } });
ok(host.innerHTML.includes('Coming soon'), 'project pane did not switch to the coming-soon project');
host.listeners.click({ target: { closest: (sel) => (sel === '[data-project-contact]' ? {} : null) } });
ok(contacted, 'register interest did not open contact');

const sectionHost = mk('#project-section');
let sectionContacted = false;
initProjectSection({ projectId: 'holon-03', tab: 'plan', openContact: () => { sectionContacted = true; } });
ok(sectionHost.innerHTML.includes('Holon 03'), 'in-formation section did not render');
sectionHost.listeners.click({ target: { closest: (sel) => (sel === '[data-project-section-contact]' ? {} : null) } });
ok(sectionContacted, 'in-formation section contact action is not wired');

console.log(fails === 0 ? '\nProject checks passed.' : `\n${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
