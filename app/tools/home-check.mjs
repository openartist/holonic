// Checks the network home: four projects, live Lithium City figures, coming-soon
// states, network access copy and the project-card wiring.
import { existsSync, readFileSync } from 'node:fs';
import { homeHtml, initHome } from '../src/home.js';
import { PROJECTS } from '../src/projects.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (cond, m) => { if (!cond) fail(m); };

const plan = { stats: { sites: 15, acres: 5.07 } };
const html = homeHtml(plan);
const projectCards = (html.match(/<a class="networkProject/g) || []).length;
const directoryItems = (html.match(/<a class="networkDirectoryItem/g) || []).length;
const imageSrcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);

console.log('— network home —');
console.log(`  ${html.length} bytes · ${projectCards} project cards · ${directoryItems} header entries · ${imageSrcs.length} images`);
ok(projectCards === PROJECTS.length, `expected ${PROJECTS.length} project cards, found ${projectCards}`);
ok(directoryItems === PROJECTS.length, `expected ${PROJECTS.length} header entries, found ${directoryItems}`);
ok(PROJECTS.length === 4, 'the network should have four projects');
ok((html.match(/<h1/g) || []).length === 1, 'home should have exactly one h1');
ok(html.includes('Find your place in the network.'), 'network headline is missing');
ok(html.includes('One network. Many ways to belong.'), 'network promise is missing');
ok((html.match(/networkDirectoryDesc/g) || []).length === PROJECTS.length, 'project descriptions are missing from the header');
ok((html.match(/class="networkProjectMedia"/g) || []).length === PROJECTS.length, 'project modules are missing images');
ok((html.match(/networkGalleryItem/g) || []).length === 5, 'the concept gallery should have five images');
ok(html.includes('networkHeroMedia'), 'the hero image is missing');
ok(html.includes('networkFooter'), 'the closing footer is missing');
for (const project of PROJECTS) {
  ok(project.image && project.imageAlt, `${project.name} has no image metadata`);
  ok(html.includes(project.image), `${project.name} image is not rendered`);
  ok((html.split(project.description).length - 1) >= 2, `${project.name} description should appear in the header and its module`);
}
ok(imageSrcs.length === 10, `expected 10 images, found ${imageSrcs.length}`);
for (const src of imageSrcs) ok(existsSync(src), `image file is missing: ${src}`);
ok(html.includes('Lithium City'), 'Lithium City is missing');
ok(html.includes('Holon 02') && html.includes('Holon 04'), 'coming-soon projects are missing');
ok(html.includes('Reservation open'), 'the live project status is missing');
ok((html.match(/networkStatus soon/g) || []).length === 6, 'the header and modules should show three coming-soon projects');
ok(html.includes('15 of 15 parcels are still open'), 'live open count is wrong');
ok(html.includes('$7,500') && html.includes('$10,000') && html.includes('$12,500'), 'live membership prices are missing');
ok(html.includes('$150'), 'live monthly dues are missing');
ok(html.includes('Four places. One membership path.'), 'network project heading is missing');
ok(html.includes('One owner record'), 'one-owner-record promise is missing');
ok(html.includes('Nothing here is an offer'), 'the no-offer note is missing');
ok(html.includes('data-project-id="lithium-city"'), 'Lithium City card has no project link');
ok(html.includes('data-project-id="holon-04"'), 'Holon 04 card has no project link');
ok(html.includes('href="#/projects/lithium-city"'), 'Lithium City has no address');
ok(html.includes('href="#/projects/holon-04"'), 'Holon 04 has no address');
ok(html.includes('data-home-scroll="network-project-header"'), 'the project-header jump is missing');
ok(!/NaN|undefined|Infinity/.test(html), 'home markup contains a bad value');
ok((html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length, 'div tags do not balance');
ok((html.match(/<section\b/g) || []).length === (html.match(/<\/section>/g) || []).length, 'section tags do not balance');
ok((html.match(/<a\b/g) || []).length === (html.match(/<\/a>/g) || []).length, 'anchor tags do not balance');

// ---- DOM wiring ---------------------------------------------------------
console.log('\n— project-card wiring (DOM shim) —');
const nodes = new Map();
const mk = (sel) => {
  const n = { innerHTML: '', listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; } };
  nodes.set(sel, n);
  return n;
};
const home = mk('#home');
let scrolled = null;
globalThis.document = {
  querySelector: (sel) => nodes.get(sel) || mk(sel),
  getElementById: (id) => ({ scrollIntoView: () => { scrolled = id; } }),
};

let went = null;
initHome({ getPlan: () => ({ stats: { sites: 15, acres: 13.2 } }), goProject: (id) => { went = id; } });
ok(home.innerHTML.includes('networkHome'), 'initHome did not render the network home');
ok(home.innerHTML.includes('13.2 acres'), 'initHome did not read the plan');
home.listeners.click({ target: { closest: (sel) => (sel === '[data-home-scroll]' ? { dataset: { homeScroll: 'network-project-header' } } : null) } });
ok(scrolled === 'network-project-header', 'a home-section jump did not scroll');
home.listeners.click({ preventDefault() {}, target: { closest: (sel) => (sel === '[data-project-id]' ? { dataset: { projectId: 'holon-02' } } : null) } });
ok(went === 'holon-02', 'a project card did not open its project');
ok(home.innerHTML.includes('15 of 15 parcels'), 'the live inventory did not render');

// ---- page wiring --------------------------------------------------------
console.log('\n— network navigation —');
const page = readFileSync('index.html', 'utf8');
const main = readFileSync('src/main.js', 'utf8');
const reserve = readFileSync('src/reserve.js', 'utf8');
const topbarStart = page.indexOf('<header class="topbar">');
const topbar = page.slice(topbarStart, page.indexOf('</header>', topbarStart));
for (const tab of ['home', 'project', 'about', 'team', 'mission', 'technology']) {
  ok(topbar.includes(`data-tab="${tab}"`), `top bar is missing ${tab}`);
}
ok(topbar.includes('href="research/holons-parcel-atlas.html"'), 'top bar is missing the Research page link');
for (const tab of ['plan', 'model', 'pl', 'roadmap', 'deck', 'documents', 'brief']) {
  ok(!topbar.includes(`data-tab="${tab}"`), `project-specific ${tab} tab remains in the top bar`);
}
for (const pane of ['about', 'mission', 'technology']) {
  ok(page.includes(`id="tab-${pane}"`), `${pane} pane is missing`);
}
ok(existsSync('research/holons-parcel-atlas.html'), 'research atlas file is missing');
ok(!page.includes('id="research-frame"'), 'research atlas should not be embedded in an iframe');
ok(page.includes('data-tab="project"'), 'no Projects tab');
ok(page.includes('id="tab-project"'), 'no project pane');
ok(page.includes('id="project"'), 'no project host');
ok(page.includes('id="reserve-land-rights"'), 'land-right selection is missing');
ok(page.includes('id="reserve-payment-options"'), 'payment preference is missing');
ok(page.includes('id="reserve-sign"'), 'signature action is missing');
ok(page.includes('id="reserve-done"'), 'reservation success step is missing');
ok(main.includes('initProject'), 'project pane is not initialized');
ok(page.includes('id="project-rail"'), 'project left nav is missing');
ok(page.includes('id="tab-project-section"'), 'project section pane is missing');
ok(main.includes('projectRailHtml'), 'project left nav is not rendered');
ok(main.includes('initProjectSection'), 'project sections are not initialized');
ok(main.includes('PROJECT_SECTION_TABS'), 'project section routing is missing');
ok(main.includes('openProject'), 'project routing is missing');
ok(main.includes('projectId: activeProject'), 'reserve does not receive the active project');
ok(main.includes('setProject:'), 'reserve cannot update the active project');
ok(main.includes('goProject: openProject'), 'home cannot open a project');
ok(reserve.includes('agreementHtml'), 'agreement renderer is missing');
ok(reserve.includes('Draft reservation agreement'), 'agreement copy is missing');
ok(reserve.includes('PAYMENT_METHODS'), 'payment methods are missing');
ok(reserve.includes('saveReservation(state.pending.id, agreement)'), 'signing does not persist an agreement');
ok(!page.includes('data-home-tab='), 'old single-project home jumps are still in the page');
console.log('  Projects tab → project hub · card → project · reserve → agreement → signature');

console.log(fails === 0 ? '\nHome checks passed.' : `\n${fails} failure(s)`);
process.exit(fails === 0 ? 0 : 1);
