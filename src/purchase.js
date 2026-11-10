// Per-parcel purchase packet: the current parcel, its money and land right,
// any signed reservation record, and every incorporation draft in one page.
import {
  DOCS,
  DOC_GROUPS,
  groupLabel,
  readMinutes,
  statusCounts,
  statusLabel,
  wordCount,
} from './documents.js';
import { renderMarkdown } from './markdown.js';
import { money } from './model-ui.js';
import { PAYMENT_METHODS, isLiveProject, projectById } from './projects.js';
import { agreementHtml, inventoryFor, loadAgreements } from './reserve.js';
import { projectPath, reservePath } from './routes.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
const paymentOf = (id) => PAYMENT_METHODS.find((method) => method.id === id) || PAYMENT_METHODS[0];
const documentCache = new Map();
const OCCUPANCY_LABELS = { 'full-time': 'Full-time residence', seasonal: 'Seasonal stays', 'part-time': 'Part-time residence' };
const EMPLOYMENT_LABELS = {
  'full-time': 'Employed full-time',
  'part-time': 'Employed part-time',
  'self-employed': 'Self-employed',
  retired: 'Retired',
  student: 'Student',
  'not-employed': 'Not currently employed',
  other: 'Other',
};
const ACCOUNT_LABELS = { checking: 'Checking', savings: 'Savings', both: 'Checking and savings', 'credit-union': 'Credit union share account', other: 'Other' };

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Date not recorded';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function landRightFor(project, agreement) {
  const rights = project?.landRights || [];
  return rights.find((right) => right.id === agreement?.landRightId)
    || rights.find((right) => !right.disabled)
    || null;
}

function purchaseRows(rows) {
  return rows
    .map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${value}</dd></div>`)
    .join('');
}

function legalDocHtml(doc, project) {
  return `<details class="purchaseLegalDoc" data-purchase-doc="${esc(doc.id)}" data-purchase-file="${esc(doc.file)}">
    <summary class="purchaseLegalSummary">
      <span class="purchaseLegalNum">${esc(doc.num)}</span>
      <span class="purchaseLegalName">
        <b>${esc(doc.title)}</b>
        <small>${esc(doc.action)}</small>
      </span>
      <span class="docstatus ${esc(doc.status)}">${esc(statusLabel(doc))}</span>
      <span class="purchaseLegalChevron" aria-hidden="true">+</span>
    </summary>
    <div class="purchaseLegalInner">
      <div class="purchaseLegalMeta">
        <span data-purchase-doc-meta>${esc(groupLabel(doc.group))} · Signatures: ${esc(doc.signatures)}</span>
        <a class="purchaseDocLink" href="${projectPath(project.id, 'documents', doc.id)}">Open in document reader ↗</a>
      </div>
      <div class="docbody purchaseLegalBody loading" data-purchase-doc-body>Open to load the full draft.</div>
    </div>
  </details>`;
}

function missingPurchaseHtml(project, parcelKey) {
  const live = project && isLiveProject(project);
  const title = !project
    ? 'That Holon could not be found.'
    : !live
      ? `${project.name} does not have a published parcel inventory yet.`
      : `Parcel ${esc(parcelKey || '—')} is not in the current site plan.`;
  const lead = !live
    ? 'Purchase packets open when reservations open. The project must publish its own parcels, membership terms and land rights first.'
    : 'The parcel address may refer to an earlier drawing. Open the current inventory to choose a parcel in the plan that is live now.';
  return `<div class="purchasePage purchaseMissingPage">
    <a class="purchaseBack" href="${reservePath(project?.id || 'lithium-city')}">← Parcel inventory</a>
    <p class="purchaseEyebrow">Purchase packet</p>
    <h1>${title}</h1>
    <p class="purchaseLead">${lead}</p>
    <div class="purchaseActions">
      <a class="hbtn primary" href="${reservePath(project?.id || 'lithium-city')}">Open the current parcel inventory</a>
      ${project ? `<a class="hbtn" href="${projectPath(project.id)}">Project overview</a>` : ''}
    </div>
  </div>`;
}

export function purchaseHtml(project, parcel, agreement = null, parcelKey = '') {
  if (!project || !parcel) return missingPurchaseHtml(project, parcel?.num || parcelKey);

  const signed = agreement && (agreement.reservationId === parcel.id || Number(agreement.parcel) === parcel.num)
    ? agreement
    : null;
  const application = signed?.application || null;
  const landRight = landRightFor(project, signed);
  const landRightLabel = signed?.landRight || landRight?.label || 'Not selected';
  const payment = paymentOf(signed?.payment || 'ach');
  const depositPct = parcel.price > 0 ? Math.round((parcel.deposit / parcel.price) * 100) : 10;
  const counts = statusCounts();
  const docsWithCounsel = counts.counsel || 0;
  const legalGroups = DOC_GROUPS.map((group) => {
    const docs = DOCS.filter((doc) => doc.group === group.id);
    if (!docs.length) return '';
    return `<section class="purchaseLegalGroup">
      <header class="purchaseLegalGroupHead">
        <h3>${esc(group.label)}</h3>
        <span>${docs.length} draft${docs.length === 1 ? '' : 's'}</span>
      </header>
      ${docs.map((doc) => legalDocHtml(doc, project)).join('')}
    </section>`;
  }).join('');

  const detailRows = [
    ['Project', `${esc(project.name)} · ${esc(project.location)}`],
    ['Project status', esc(project.statusLabel)],
    ['Co-operative', 'Holons Coop · proposed California nonprofit mutual benefit corporation'],
    ['Parcel', `Parcel ${pad(parcel.num)} · ${esc(parcel.kind)}`],
    ['Membership tier', `${esc(parcel.tierLabel)} membership`],
    ['Parcel size', `${parcel.width} × ${parcel.depth} ft · ${parcel.area.toLocaleString('en-US')} sq ft`],
    ['Location', `${esc(parcel.sector)} · ${parcel.distance} ft from the entry · fronts ${esc(parcel.front)}`],
    ['Land right', `${esc(landRightLabel)} · ${esc(landRight?.summary || 'subject to the definitive documents')}`],
    ['Occupancy draft', 'A licence to use the space, held with the membership share. The definitive documents control.'],
    ['Membership capital', `<b>${money(parcel.price)}</b> · one-time capital contribution`],
    ['Reservation deposit', `<b>${money(parcel.deposit)}</b> · ${depositPct}% of membership capital`],
    ['Monthly dues', `<b>${money(parcel.dues)}</b> · ${money(parcel.annualDues)} per year`],
    ['Payment preference', `${esc(payment.label)} via ${esc(payment.provider)} · checkout pending`],
    ['Reservation status', parcel.reserved ? 'Reserved in this browser' : 'Open'],
    ['Reservation reference', signed?.reference ? esc(signed.reference) : 'Not signed'],
    ['Signed by', signed?.signer ? esc(signed.signer) : 'Not signed'],
    ['Admission', 'Board approval, signed definitive documents and cleared funds'],
    ['Interest at reservation', 'A membership share in the co-op on admission. No deed to a parcel, no tenancy, no real-property interest.'],
  ];

  const signedRows = signed ? [
    ['Reference', esc(signed.reference)],
    ['Signer', `${esc(signed.signer)} · initials ${esc(signed.initials)}`],
    ['Signed', formatDate(signed.signedAt)],
    ['Membership', esc(signed.membership)],
    ['Land right', esc(signed.landRight)],
    ['Capital contribution', money(signed.price)],
    ['Reservation deposit', money(signed.deposit)],
    ['Monthly dues', money(signed.dues)],
    ['Payment preference', `${esc(payment.label)} via ${esc(payment.provider)} · payment pending`],
    ['Application', application ? esc(application.status || 'recorded · approval pending') : 'Not recorded'],
    ['Status', esc(signed.status)],
    ['Agreement version', esc(signed.version || 'reservation-draft-v1')],
  ] : [];

  const applicationRows = application ? [
    ['Applicant', esc(application.fullName || 'Not recorded')],
    ['Contact', [application.email, application.phone].filter(Boolean).map(esc).join(' · ') || 'Not provided'],
    ['Household', `${application.householdSize || 0} people · ${application.adults || 0} adults${application.children ? ` · ${application.children} children` : ''}`],
    ['Occupancy', esc(OCCUPANCY_LABELS[application.occupancy] || application.occupancy || 'Not recorded')],
    ['Employment', `${esc(EMPLOYMENT_LABELS[application.employmentStatus] || application.employmentStatus || 'Not recorded')}${application.employer ? ` · ${esc(application.employer)}` : ''}`],
    ['Income and budget', `${money(application.monthlyIncome)} monthly income · ${money(application.housingBudget)} housing budget`],
    ['Credit and debts', `${esc(application.creditScore || 'Not recorded')} · ${money(application.monthlyDebt)} monthly debt · ${money(application.totalDebt)} total${application.debtTypes?.length ? ` · ${esc(application.debtTypes.join(', '))}` : ''}`],
    ['Rental history', application.evictionHistory === 'yes'
      ? `Eviction reported${application.evictionExplanation ? ` — ${esc(application.evictionExplanation)}` : ' — explanation pending'}`
      : application.evictionHistory === 'no' ? 'No eviction reported' : 'Not recorded'],
    ['Bank verification', `${esc(application.bankName || 'Not recorded')} · ${esc(ACCOUNT_LABELS[application.accountType] || application.accountType || 'account type not recorded')}`],
    ['Consents', [application.verificationConsent, application.creditConsent, application.screeningAcknowledged, application.privacyAcknowledged].every(Boolean)
      ? 'Verification, credit, screening and privacy consents recorded'
      : 'Some consents not recorded'],
    ['Submitted', formatDate(application.submittedAt)],
    ['Status', esc(application.status || 'Application recorded · approval pending')],
    ['Version', esc(application.version || 'coop-application-draft-v1')],
  ] : [];

  const applicationSection = `<section class="purchaseApplication${application ? '' : ' isMissing'}" aria-label="Co-op application">
    <header class="purchaseApplicationHead">
      <div>
        <p class="purchaseKicker">Co-op application</p>
        <h2>${application ? 'Application on file.' : 'No application attached.'}</h2>
      </div>
      <span class="purchaseApplicationStatus ${application ? 'recorded' : 'missing'}">${application ? 'Recorded · approval pending' : 'Not recorded'}</span>
    </header>
    ${application
      ? `<p class="purchaseApplicationLead">${esc(application.fullName || 'The applicant')} submitted the co-op application with this reservation. It is stored in this browser with the signed draft and is reviewed before admission.</p>
         <div class="purchaseApplicationGrid">
           <dl class="purchaseRows">${purchaseRows(applicationRows.slice(0, 6))}</dl>
           <dl class="purchaseRows">${purchaseRows(applicationRows.slice(6))}</dl>
         </div>
         <p class="purchaseApplicationNote">The application includes self-reported income, debts, bank institution and rental history. No Social Security number, full bank account or routing number, or payment card details are collected. A production screening handoff must use a secure, permissioned provider.</p>`
      : `<p class="purchaseApplicationLead">The co-op application is collected in the reservation flow, before the draft agreement and signature. No application appears here until a signed reservation record is saved in this browser.</p>`}
  </section>`;

  return `<div class="purchasePage">
    <header class="purchaseHero">
      <div class="purchaseHeroMain">
        <a class="purchaseBack" href="${reservePath(project.id)}">← Parcel inventory</a>
        <p class="purchaseEyebrow">${esc(project.name)} · Parcel ${pad(parcel.num)} · purchase packet</p>
        <h1>Parcel ${pad(parcel.num)} purchase packet.</h1>
        <p class="purchaseLead">Review the parcel, the money, the land right and every draft in one place before you reserve. This page follows the current site plan and saved calculator.</p>
        <div class="purchaseTagRow">
          <span class="purchaseTag ${parcel.reserved ? 'reserved' : 'open'}">${parcel.reserved ? 'Reserved' : 'Open'}</span>
          <span class="purchaseTag">${esc(parcel.tierLabel)} membership</span>
          <span class="purchaseTag">${esc(landRightLabel)}</span>
          ${application ? '<span class="purchaseTag">Application pending</span>' : ''}
          <span class="purchaseTag">${DOCS.length} legal drafts</span>
        </div>
        <div class="purchaseActions">
          <a class="hbtn primary" href="${reservePath(project.id)}">${parcel.reserved ? 'Back to parcel inventory' : 'Reserve this parcel'}</a>
          <button class="hbtn" type="button" data-purchase-jump="purchase-legal">Review the legal packet</button>
        </div>
        <p class="purchaseNote">Draft purchase packet. No payment is collected here. Counsel and DRE review are required before any membership is offered.</p>
      </div>
      <aside class="purchaseHeroAside" aria-label="Parcel price and location">
        <div class="purchaseMapCard">
          ${parcel.map}
          <span class="purchaseMapTag">${parcel.reserved ? 'Reserved' : 'Open'} · Parcel ${pad(parcel.num)}</span>
        </div>
        <div class="purchasePriceCard">
          <p class="purchaseKicker">Membership capital</p>
          <strong>${money(parcel.price)}</strong>
          <div class="purchasePriceRows">
            <div><span>Reservation deposit</span><b>${money(parcel.deposit)}</b></div>
            <div><span>Monthly dues</span><b>${money(parcel.dues)}</b></div>
            <div><span>Annual dues</span><b>${money(parcel.annualDues)}</b></div>
          </div>
        </div>
      </aside>
    </header>

    <section class="purchaseStats" aria-label="Parcel facts">
      <div class="purchaseStat"><span>Parcel</span><strong>${parcel.width} × ${parcel.depth}</strong><small>${parcel.area.toLocaleString('en-US')} sq ft · ${esc(parcel.kind)}</small></div>
      <div class="purchaseStat"><span>Membership</span><strong>${money(parcel.price)}</strong><small>${esc(parcel.tierLabel)} · one-time capital</small></div>
      <div class="purchaseStat"><span>Holds the parcel</span><strong>${money(parcel.deposit)}</strong><small>${depositPct}% reservation deposit</small></div>
      <div class="purchaseStat"><span>Monthly dues</span><strong>${money(parcel.dues)}</strong><small>${money(parcel.annualDues)} per year</small></div>
    </section>

    <div class="purchaseGrid">
      <section class="purchasePanel">
        <p class="purchaseKicker">Purchase and contract</p>
        <h2>The terms behind Parcel ${pad(parcel.num)}.</h2>
        <p class="purchasePanelLead">These are the current figures and conditions for this parcel. The definitive membership and occupancy documents control after they are signed and accepted.</p>
        <dl class="purchaseRows">${purchaseRows(detailRows)}</dl>
      </section>

      <aside class="purchasePanel purchaseSidePanel">
        <p class="purchaseKicker">${signed ? 'Signed reservation record' : 'Reservation status'}</p>
        <h2>${signed ? 'A draft reservation is on file.' : parcel.reserved ? 'Reserved in this browser.' : 'No reservation signed yet.'}</h2>
        ${signed
          ? `<p class="purchasePanelLead">Signed by ${esc(signed.signer)} on ${formatDate(signed.signedAt)}. This records your selection and signature; it is still a nonbinding draft until the co-op accepts it and definitive documents are executed.</p>
             <dl class="purchaseRows">${purchaseRows(signedRows)}</dl>`
          : `<p class="purchasePanelLead">${parcel.reserved
            ? 'This parcel is marked reserved in this browser, but no signed agreement record was found. Reopen the reservation flow to record the selected land right and signature.'
            : 'A reservation records your parcel, membership type, land right and payment preference. It is nonbinding, collects no payment and is not a membership until the co-op accepts it.'}</p>
             <a class="hbtn primary purchasePanelCta" href="${reservePath(project.id)}">Reserve Parcel ${pad(parcel.num)}</a>`}
        <ol class="purchaseTimeline">
          <li><span>01</span><div><b>Review this packet</b><small>Parcel, pricing, dues, land right and all legal drafts.</small></div></li>
          <li><span>02</span><div><b>Sign the reservation</b><small>Nonbinding selection; no funds are collected.</small></div></li>
          <li><span>03</span><div><b>Co-op review</b><small>Board review, eligibility and acceptance.</small></div></li>
          <li><span>04</span><div><b>Definitive documents</b><small>Membership subscription and occupancy agreement.</small></div></li>
          <li><span>05</span><div><b>Admission</b><small>After approval, signatures, cleared funds and the membership ledger.</small></div></li>
        </ol>
      </aside>
    </div>

    ${applicationSection}

    <section class="purchaseScope" aria-label="What the purchase includes">
      <article class="purchaseScopeCard">
        <p class="purchaseKicker">Included in the membership</p>
        <h2>Use of one parcel, inside the co-op.</h2>
        <ul>
          <li>One ${esc(parcel.tierLabel)} membership, subject to board admission and the definitive membership documents.</li>
          <li>Exclusive use of Parcel ${pad(parcel.num)} under the selected land right, once the occupancy agreement is effective.</li>
          <li>Access to the shared community core and the Holons network, subject to each project’s rules and availability.</li>
          <li>The obligation to pay monthly dues, any approved capital calls and other charges stated in the definitive documents.</li>
        </ul>
      </article>
      <article class="purchaseScopeCard isExcluded">
        <p class="purchaseKicker">Not included or promised</p>
        <h2>A share, not a deed.</h2>
        <ul>
          <li>No deed to a parcel and no tenancy. The membership share is personal property in the co-op, which holds title to the land; the occupancy draft is a licence to use the space.</li>
          <li>No ownership of the land or improvements, and no right to sell or transfer the membership without board approval.</li>
          <li>No guaranteed occupancy, rental income, resale, transfer or refund. The capital contribution is at risk and is not refundable on demand.</li>
          <li>No assurance that the project will be permitted, financed, built or opened on the current schedule or plan.</li>
        </ul>
      </article>
    </section>

    <section class="purchaseSection" aria-label="Reservation agreement">
      <header class="purchaseSectionHead">
        <div>
          <p class="purchaseKicker">Reservation agreement</p>
          <h2>The draft behind the signature.</h2>
        </div>
        <a class="hbtn" href="${projectPath(project.id, 'documents', 'membership-subscription-agreement')}">Open the document register</a>
      </header>
      <p class="purchaseSectionLead">This is the same draft the reservation flow presents. The signed record above captures the selections, application and signature saved in this browser.</p>
      <details class="purchaseAgreement">
        <summary>
          <span><b>Reservation and membership selection</b><small>Project, parcel, membership, land right, application, fees, conditions and e-signature</small></span>
          <em>Draft ${signed?.version === 'reservation-draft-v2' ? 'v2' : 'v1'}</em>
        </summary>
        <div class="purchaseAgreementBody">${agreementHtml(project, parcel, landRight, signed?.payment || 'ach', application)}</div>
      </details>
    </section>

    <section class="purchaseSection purchaseLegal" id="purchase-legal" aria-label="Legal documentation">
      <header class="purchaseSectionHead">
        <div>
          <p class="purchaseKicker">Legal documentation</p>
          <h2>All ${DOCS.length} drafts, on this page.</h2>
        </div>
        <p class="purchaseLegalCount"><b>${counts.ready}</b> ready · <b>${counts.adopt}</b> to adopt · <b>${docsWithCounsel}</b> for counsel</p>
      </header>
      <p class="purchaseSectionLead">Every document below is part of the working packet. Open any one to read the full Markdown source without leaving this parcel. Blanks and bracketed dates are intentional drafts; ${docsWithCounsel} documents still require counsel and DRE review before use.</p>
      <div class="purchaseLegalGroups">${legalGroups}</div>
      <div class="purchaseLegalFoot">
        <p>These are working drafts, not executed agreements. No document here is legal, tax or investment advice. The co-op must adopt, counsel must review, and the definitive documents must be signed before a membership exists.</p>
        <a class="hbtn" href="${projectPath(project.id, 'documents', 'filing-index')}">Open the full document register</a>
      </div>
    </section>

    <footer class="purchaseFooter">
      <p>Parcel ${pad(parcel.num)} · ${esc(project.name)} · ${esc(project.location)}</p>
      <p>Current figures follow the live site plan and saved calculator. The project is in formation; this packet does not create an interest in land.</p>
    </footer>
  </div>`;
}

function loadPurchaseDoc(details) {
  const body = details.querySelector('[data-purchase-doc-body]');
  const file = details.dataset.purchaseFile;
  if (!body || !file || details.dataset.loadState === 'loading' || details.dataset.loadState === 'loaded') return;

  const paint = (md) => {
    body.classList.remove('loading');
    body.innerHTML = renderMarkdown(md);
    details.dataset.loadState = 'loaded';
    const meta = details.querySelector('[data-purchase-doc-meta]');
    const words = wordCount(md);
    if (meta) meta.textContent = `${words.toLocaleString('en-US')} words · ${readMinutes(words)} min read · ${file}`;
  };

  if (documentCache.has(file)) {
    paint(documentCache.get(file));
    return;
  }

  details.dataset.loadState = 'loading';
  body.classList.add('loading');
  body.textContent = 'Loading the full draft…';
  if (typeof fetch !== 'function') {
    details.dataset.loadState = 'error';
    body.classList.remove('loading');
    body.innerHTML = `<p class="muted">The document could not be loaded because fetch is unavailable. Read it directly at <a href="docs/incorporation/${esc(file)}">docs/incorporation/${esc(file)}</a>.</p>`;
    return;
  }
  fetch(`docs/incorporation/${file}`)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${file}`);
      return res.text();
    })
    .then((md) => {
      documentCache.set(file, md);
      paint(md);
    })
    .catch((err) => {
      details.dataset.loadState = 'error';
      body.classList.remove('loading');
      body.innerHTML = `<p class="muted">Could not load this draft (${esc(err.message)}). Read it directly at <a href="docs/incorporation/${esc(file)}">docs/incorporation/${esc(file)}</a>.</p>`;
    });
}

export function initPurchase({ projectId, parcelKey, getPlan } = {}) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector('#purchase');
  if (!el) return;

  const project = projectId ? projectById(projectId) : null;
  let parcel = null;
  if (project && isLiveProject(project)) {
    const plan = typeof getPlan === 'function' ? getPlan() : null;
    const inventory = inventoryFor(plan);
    const key = String(parcelKey == null ? '' : parcelKey).trim();
    parcel = inventory.parcels.find((candidate) => (
      String(candidate.num) === key
      || String(candidate.num) === String(Number(key))
      || candidate.id === key
    )) || null;
  }

  const agreements = project ? loadAgreements() : {};
  const agreement = parcel
    ? Object.values(agreements).find((record) => record && (
      record.reservationId === parcel.id
      || (record.projectId === project.id && Number(record.parcel) === parcel.num)
    )) || null
    : null;

  el.innerHTML = purchaseHtml(project, parcel, agreement, parcelKey);

  if (!el.dataset.purchaseBound) {
    el.dataset.purchaseBound = '1';
    el.addEventListener('click', (e) => {
      const jump = e.target.closest('[data-purchase-jump]');
      if (!jump) return;
      const target = document.getElementById(jump.dataset.purchaseJump);
      if (!target) return;
      const pane = el.closest('#tab-purchase');
      if (pane) {
        const top = target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 16;
        pane.scrollTo({ top });
      } else {
        target.scrollIntoView({ block: 'start' });
      }
    });
  }

  el.querySelectorAll('details[data-purchase-doc]').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (details.open) loadPurchaseDoc(details);
    });
  });
}
