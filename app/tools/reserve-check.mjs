// Checks the reserve flow: live parcel inventory, network project picker,
// membership + land-right agreement, signature persistence and payment choice.
import { generatePlan } from '../src/generate.js';
import {
  agreementHtml,
  inventoryFor,
  loadAgreements,
  loadReservations,
  planKey,
  reserveHtml,
  reserveNetworkHtml,
  reserveSummary,
  saveReservation,
} from '../src/reserve.js';
import { money } from '../src/model-ui.js';
import { projectById } from '../src/projects.js';

let fails = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); fails++; };
const ok = (cond, m) => { if (!cond) fail(m); };

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => { memory.set(k, String(v)); },
  removeItem: (k) => { memory.delete(k); },
};

const plan = generatePlan({
  width: 500,
  height: 442,
  siteW: 28,
  siteD: 34,
  mix: 'mixed',
  seed: 'reserve-check',
});
const project = projectById('lithium-city');
const inventory = inventoryFor(plan);
const totalTierCount = Object.values(inventory.tiers).reduce((n, t) => n + t.total, 0);

console.log('— reserve inventory —');
console.log(`  ${inventory.parcels.length} parcels · ${inventory.open} open · ${Object.keys(inventory.tiers).length} tiers`);
ok(inventory.parcels.length === plan.stats.sites, 'parcel cards do not match the drawn lots');
ok(totalTierCount === plan.stats.sites, 'tier counts do not add up to the drawn lots');
ok(inventory.parcels.every((p) => p.price > 0), 'a parcel has no membership price');
ok(inventory.parcels.every((p) => p.deposit > 0), 'a parcel has no reservation deposit');
ok(inventory.parcels.every((p) => p.dues > 0), 'a parcel has no monthly dues');
ok(inventory.parcels.every((p) => p.area > 0), 'a parcel has no lot area');
ok(inventory.parcels.every((p) => p.map.includes('<svg')), 'a parcel has no map thumbnail');
ok(inventory.parcels.every((p) => p.map.includes('#0b0b0b')), 'a parcel map does not highlight the parcel');
ok(inventory.parcels.every((p) => p.map.includes(`>${p.num}</text>`)), 'a parcel map does not label the parcel');
ok(!/NaN|undefined|Infinity/.test(JSON.stringify(inventory.parcels.map((p) => ({ ...p, site: undefined, map: undefined })))), 'parcel data contains a bad number');

const heldId = inventory.parcels[0].id;
const held = inventoryFor(plan, undefined, new Set([heldId]));
console.log(`  hold test: ${held.open} open after holding ${heldId.split(':').pop()}`);
ok(held.open === inventory.open - 1, 'a hold did not reduce the open count');
ok(held.parcels[0].reserved, 'the held parcel is not marked reserved');

console.log('\n— reserve markup —');
const html = reserveHtml(held, 'all', project);
ok(html.includes('Choose your place at Lithium City'), 'project-scoped reserve headline is missing');
ok(html.includes('All projects'), 'back-to-network control is missing');
ok(html.includes('Open'), 'open tag is missing');
ok(html.includes('Reserved'), 'reserved tag is missing');
ok(html.includes('Reserve now'), 'reserve button is missing');
ok(html.includes('Reservation deposit'), 'deposit row is missing');
ok(html.includes('Monthly dues'), 'dues row is missing');
ok(html.includes('data-reserve-filter="open"'), 'open filter is missing');
ok(html.includes('data-reserve-filter="reserved"'), 'reserved filter is missing');
ok(html.includes('data-reserve-id='), 'parcel reserve controls are missing');
ok(!/NaN|undefined|Infinity/.test(html), 'reserve markup contains a bad value');
ok((html.match(/<article\b/g) || []).length === plan.stats.sites, 'reserve page does not render every parcel');
ok((html.match(/<svg\b/g) || []).length === plan.stats.sites, 'reserve page does not render every map');

const openOnly = reserveHtml(held, 'open', project);
ok(!openOnly.includes(`data-reserve-id="${heldId}"`), 'open filter still shows the reserved parcel');
const reservedOnly = reserveHtml(held, 'reserved', project);
ok(reservedOnly.includes(`data-reserve-id="${heldId}"`), 'reserved filter does not show the reserved parcel');

console.log('\n— network picker —');
const network = reserveNetworkHtml(plan);
ok((network.match(/reserveProjectCard/g) || []).length === 4, 'network picker does not show four projects');
ok(network.includes('Lithium City') && network.includes('Holon 04'), 'project names are missing');
ok(network.includes('Reservation open'), 'live status is missing');
ok(network.includes('Coming soon'), 'coming-soon status is missing');
ok(network.includes('data-reserve-project="lithium-city"'), 'Lithium City reserve control is missing');
ok(network.includes('data-reserve-open-project="holon-02"'), 'coming-soon project link is missing');
ok(network.includes('15'), 'live parcel count is missing');
const notice = reserveNetworkHtml(plan, projectById('holon-02'));
ok(notice.includes('not open for reservations yet'), 'coming-soon reserve notice is missing');

console.log('\n— agreement and signature —');
const parcel = inventory.parcels[0];
const leasehold = project.landRights[0];
const agreement = agreementHtml(project, parcel, leasehold, 'ach');
ok(agreement.includes('Draft reservation agreement'), 'agreement title is missing');
ok(agreement.includes('Lithium City'), 'project is missing from the agreement');
ok(agreement.includes(`${parcel.tierLabel} membership`), 'membership type is missing from the agreement');
ok(agreement.includes('Cooperative leasehold'), 'land right is missing from the agreement');
ok(agreement.includes(money(parcel.price)), 'membership price is missing from the agreement');
ok(agreement.includes(money(parcel.deposit)), 'deposit is missing from the agreement');
ok(agreement.includes('Plaid'), 'ACH provider is missing from the agreement');
ok(agreement.includes('Network access'), 'network access clause is missing');
ok(agreement.includes('Electronic signature'), 'electronic signature clause is missing');
ok(agreement.includes('not a membership'), 'non-membership disclaimer is missing');
const undivided = agreementHtml(project, parcel, project.landRights[1], 'card');
ok(undivided.includes('fractional title interest'), 'undivided-interest terms are missing');
ok(undivided.includes('Stripe'), 'card provider is missing from the agreement');

const record = {
  reservationId: 'test:99',
  reference: 'LC-99-TEST',
  project: 'Lithium City',
  signer: 'Test Signer',
  initials: 'TS',
  status: 'signed · payment pending',
};
saveReservation('test:99', record);
ok(loadReservations().has('test:99'), 'signed reservation was not added to the hold store');
ok(loadAgreements()['test:99']?.signer === 'Test Signer', 'agreement was not stored with the signature');

console.log('\n— live summary —');
const summary = reserveSummary(plan);
ok(summary.total === plan.stats.sites, 'summary total does not match the plan');
ok(summary.open === plan.stats.sites, 'summary open count is wrong without holds');
ok(summary.tiers.standard.total + summary.tiers.preferred.total + summary.tiers.premium.total === plan.stats.sites, 'summary tier counts do not add up');
ok(summary.prices.min > 0 && summary.prices.max >= summary.prices.min, 'summary price range is wrong');
ok(planKey(plan) === planKey(plan), 'plan key is not deterministic');
ok(planKey(plan) !== planKey(generatePlan({ ...plan, seed: 'reserve-check-other' })), 'different plans share a reservation key');

console.log(fails ? `\n${fails} failure(s)` : '\nReserve checks passed.');
process.exit(fails ? 1 : 0);
