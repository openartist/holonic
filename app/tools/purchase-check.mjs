// Checks the per-parcel purchase packet: current figures, land right, signed
// reservation record, every legal draft and the missing-parcel state.
import { generatePlan } from '../src/generate.js';
import { DOCS } from '../src/documents.js';
import { inventoryFor } from '../src/reserve.js';
import { purchaseHtml } from '../src/purchase.js';
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
  seed: 'purchase-check',
});
const project = projectById('lithium-city');
const inventory = inventoryFor(plan);
const parcel = inventory.parcels.find((p) => p.num === 4) || inventory.parcels[0];
const pad = (n) => String(n).padStart(2, '0');

console.log('— purchase packet —');
const html = purchaseHtml(project, parcel, null);
ok(html.includes(`Parcel ${pad(parcel.num)} purchase packet`), 'packet title is missing');
ok(html.includes(money(parcel.price)), 'membership capital is missing');
ok(html.includes(money(parcel.deposit)), 'reservation deposit is missing');
ok(html.includes(money(parcel.dues)), 'monthly dues is missing');
ok(html.includes(money(parcel.annualDues)), 'annual dues is missing');
ok(html.includes(`${parcel.width} × ${parcel.depth}`), 'parcel dimensions are missing');
ok(html.includes(parcel.area.toLocaleString('en-US')), 'parcel area is missing');
ok(html.includes(parcel.sector) && html.includes(`fronts ${parcel.front}`), 'parcel location is missing');
ok(html.includes('Cooperative leasehold'), 'default land right is missing');
ok(html.includes('No deed'), 'no-deed warning is missing');
ok(html.includes('licence, not a lease'), 'licence/lease distinction is missing');
ok(html.includes('capital contribution is at risk'), 'capital-at-risk warning is missing');
ok(html.includes('Reservation and membership selection'), 'draft reservation agreement is missing');
ok(html.includes('No application attached'), 'open packet does not explain the missing application');
ok(html.includes('Review the legal packet'), 'legal-packet jump is missing');
ok(html.includes('data-purchase-doc='), 'legal-document controls are missing');
ok(html.includes('data-purchase-jump="purchase-legal"'), 'legal-packet jump is not wired');
ok(!/NaN|undefined|Infinity/.test(html), 'purchase markup contains a bad value');

console.log('  all packet figures, land right and exclusions are present');

console.log('\n— all legal drafts —');
ok(html.includes(`${DOCS.length} legal drafts`), 'legal-draft count is missing');
ok((html.match(/data-purchase-doc="/g) || []).length === DOCS.length, 'not every legal document is listed');
for (const doc of DOCS) {
  ok(html.includes(`data-purchase-doc="${doc.id}"`), `missing legal document: ${doc.title}`);
  ok(html.includes(`data-purchase-file="${doc.file}"`), `missing source file: ${doc.file}`);
}
ok(html.includes('Counsel and DRE review'), 'counsel review status is missing');
ok(html.includes('Open in document reader'), 'document-reader links are missing');

console.log('  all 14 drafts are listed with their source files and review states');

console.log('\n— signed reservation record —');
const application = {
  fullName: 'Test Applicant',
  email: 'test@example.com',
  phone: '555-0100',
  address: '1 Test Lane',
  timeAtAddress: 4,
  householdSize: 2,
  adults: 2,
  children: 0,
  occupancy: 'full-time',
  employmentStatus: 'full-time',
  employer: 'Test Cooperative',
  occupation: 'Builder',
  monthlyIncome: 6200,
  otherMonthlyIncome: 0,
  housingBudget: 1800,
  bankName: 'Test Credit Union',
  accountType: 'checking',
  proofOfFunds: true,
  verificationConsent: true,
  creditScore: '700-759',
  monthlyDebt: 400,
  totalDebt: 12000,
  bankruptcy: 'no',
  debtTypes: ['Auto loan'],
  creditConsent: true,
  currentHousingCost: 1450,
  landlordReference: 'Previous landlord',
  evictionHistory: 'no',
  whyJoin: 'Shared ownership and a smaller footprint.',
  skills: 'Gardening and repairs',
  truthConfirmed: true,
  approvalAcknowledged: true,
  screeningAcknowledged: true,
  privacyAcknowledged: true,
  submittedAt: '2026-11-09T00:00:00.000Z',
  status: 'application recorded · approval pending',
  version: 'coop-application-draft-v1',
};
const agreement = {
  reservationId: parcel.id,
  reference: `LC-${pad(parcel.num)}-TEST`,
  projectId: project.id,
  project: project.name,
  parcel: parcel.num,
  membership: parcel.tierLabel,
  landRight: 'Cooperative leasehold',
  landRightId: 'leasehold',
  price: parcel.price,
  deposit: parcel.deposit,
  dues: parcel.dues,
  payment: 'ach',
  paymentProvider: 'Plaid',
  signer: 'Test Signer',
  initials: 'TS',
  signedAt: '2026-11-09T00:00:00.000Z',
  application,
  applicationStatus: application.status,
  version: 'reservation-draft-v2',
  status: 'signed · application pending review · payment pending',
};
const signed = purchaseHtml(project, parcel, agreement);
ok(signed.includes('Test Signer'), 'signed record has no signer');
ok(signed.includes(agreement.reference), 'signed record has no reference');
ok(signed.includes('A draft reservation is on file'), 'signed state is missing');
ok(signed.includes('Plaid'), 'payment provider is missing from the signed record');
ok(signed.includes('November 9, 2026'), 'signed date is missing');
ok(signed.includes('Agreement version'), 'agreement version is missing');
ok(signed.includes('Application on file'), 'application section is missing');
ok(signed.includes('Test Applicant'), 'applicant name is missing');
ok(signed.includes('2 people'), 'household size is missing');
ok(signed.includes('Full-time residence'), 'occupancy plan is missing');
ok(signed.includes(money(application.monthlyIncome)), 'application income is missing');
ok(signed.includes('Test Credit Union'), 'bank verification is missing');
ok(signed.includes('Verification, credit, screening and privacy consents recorded'), 'application consents are missing');
ok(signed.includes('Draft v2'), 'v2 agreement label is missing');

console.log('\n— missing parcel —');
const missing = purchaseHtml(project, null, null, '09');
ok(missing.includes('Parcel 09'), 'missing-parcel state lost the requested parcel');
ok(missing.includes('is not in the current site plan'), 'missing-parcel state is not explained');
ok(missing.includes('Open the current parcel inventory'), 'missing-parcel state has no inventory link');
const coming = purchaseHtml(projectById('holon-02'), null, null);
ok(coming.includes('does not have a published parcel inventory'), 'formation project has no purchase-packet state');

console.log(fails ? `\n${fails} failure(s)` : '\nPurchase checks passed.');
process.exit(fails ? 1 : 0);
