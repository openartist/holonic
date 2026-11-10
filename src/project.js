// Project hub: one Holon's live data, membership structure and land rights.
import { getProgram } from './program.js';
import { money, savedModel } from './model-ui.js';
import { reserveSummary } from './reserve.js';
import { DATA_VIEWS, NETWORK, isLiveProject, projectById } from './projects.js';
import { projectPath, routeFor } from './routes.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function communityImageHtml(project) {
  const src = project.communityImage || project.image;
  const alt = project.communityImageAlt || project.imageAlt;
  if (!src) return '';
  return `<figure class="projectHeaderImage">
    <img src="${esc(src)}" alt="${esc(alt)}" decoding="async" fetchpriority="high" />
    <figcaption><span>Community concept</span> <span>${esc(project.name)}</span></figcaption>
  </figure>`;
}

const PROJECT_NAV = [
  { id: 'plan', label: 'Site plan' },
  { id: 'model', label: 'Calculator' },
  { id: 'pl', label: 'P&L' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'deck', label: 'Slides' },
  { id: 'documents', label: 'Documents' },
  { id: 'team', label: 'Team' },
  { id: 'brief', label: 'Brief' },
];

const SECTION_FORMATION_COPY = {
  plan: 'The site plan will show the parcel, shared core, parking and utilities once land, access and local approvals are confirmed.',
  model: 'The calculator will open with this project’s land, build and operating assumptions once the local cost study is ready.',
  pl: 'The ten-year P&L will follow this project’s own membership, dues and operating plan.',
  roadmap: 'The roadmap will run from site control through entitlement, co-op formation and a reviewed first season.',
  deck: 'The slide study will present the site, membership structure and financial case for this project.',
  documents: 'This project’s incorporation, membership and land-right documents will be published here before reservations open.',
  team: 'The local project team and advisers will be listed once the site and entity are confirmed.',
  brief: 'The full project brief will publish the site study, open questions and formation plan.',
};

export function projectRailHtml(project, activeTab = 'project') {
  if (!project) return '';
  const items = PROJECT_NAV.map((item, index) => {
    const current = item.id === activeTab;
    return `<a class="projectRailLink" href="${routeFor(item.id, project.id)}" data-project-section="${item.id}"${current ? ' aria-current="page"' : ''}>
      <span class="projectRailNum">${String(index + 1).padStart(2, '0')}</span>
      <span class="projectRailLabel">${esc(item.label)}</span>
      <span class="projectRailArrow" aria-hidden="true">→</span>
    </a>`;
  }).join('');
  const live = isLiveProject(project);
  return `<a class="projectRailHome" href="#/" aria-label="Holons home">
    <span class="projectRailHomeArrow" aria-hidden="true">←</span>
    <span>Home</span>
  </a>
  <div class="projectRailHead">
    <p class="projectRailKicker">Project ${esc(project.index)}</p>
    <h2 class="projectRailName">${esc(project.name)}</h2>
    <span class="projectRailStatus ${live ? 'open' : 'soon'}">${esc(project.statusLabel)}</span>
  </div>
  <nav class="projectRailNav" aria-label="${esc(project.name)} sections">${items}</nav>
  <div class="projectRailFoot">
    <a href="${projectPath(project.id)}"${activeTab === 'project' ? ' aria-current="page"' : ''}>Project overview</a>
    <a href="#/">All projects</a>
  </div>`;
}

export function projectSectionHtml(project, tab = 'plan') {
  if (!project) return '';
  const view = DATA_VIEWS.find((item) => item.id === tab) || DATA_VIEWS[0];
  const position = DATA_VIEWS.findIndex((item) => item.id === view.id) + 1;
  const planned = (project.planned || [])
    .map((item) => `<li>${esc(item)}</li>`)
    .join('');
  return `<div class="projectSectionView">
    <header class="projectSectionHero">
      <div>
        <p class="projectKicker">${esc(project.index)} · ${esc(project.region)} · ${esc(project.statusLabel)}</p>
        <span class="projectSectionTag">In formation</span>
        <h2>${esc(view.title)}</h2>
        <p class="projectSectionLead">${esc(SECTION_FORMATION_COPY[view.id] || view.copy)}</p>
      </div>
      <aside class="projectSectionStatus" aria-label="${esc(project.name)} status">
        <p class="projectSectionStatusKicker">${esc(project.name)}</p>
        <strong>${esc(project.statusLabel)}</strong>
        <span>${esc(project.location)}</span>
        <span>Section ${String(position).padStart(2, '0')} of ${String(DATA_VIEWS.length).padStart(2, '0')}</span>
      </aside>
    </header>
    <div class="projectSectionBody">
      <article class="projectSectionPanel">
        <p class="projectKicker">What this section will hold</p>
        <h3>${esc(view.title)} for ${esc(project.name)} is still being shaped.</h3>
        <p>This section is scoped to ${esc(project.name)} and will publish its own local inputs, assumptions and terms. Nothing is copied from another Holon.</p>
      </article>
      <aside class="projectSectionPanel">
        <p class="projectKicker">Next for this project</p>
        <ul class="projectSectionList">${planned || '<li>Project terms are being prepared.</li>'}</ul>
      </aside>
    </div>
    <section class="projectSectionCta">
      <div>
        <p class="projectKicker">Not open yet</p>
        <h3>Follow ${esc(project.name)} as it forms.</h3>
        <p>Register interest and we will send this project’s membership and reservation terms when they are published.</p>
      </div>
      <div class="projectSectionActions">
        <button class="hbtn primary" type="button" data-project-section-contact>Register interest</button>
        <a class="hbtn" href="${projectPath(project.id)}">Project overview</a>
      </div>
    </section>
  </div>`;
}

function liveProjectHtml(project, plan) {
  const drawn = plan && plan.stats && Number.isFinite(plan.stats.sites) ? plan.stats.sites : getProgram().spaces;
  const capacity = Math.max(0, Math.round(drawn));
  const acres = plan && plan.stats && plan.stats.acres ? plan.stats.acres : getProgram().acres;
  const saved = savedModel();
  const inventory = reserveSummary(plan, saved, capacity);
  const dues = Number.isFinite(Number(saved.dues)) ? Number(saved.dues) : 150;
  const data = DATA_VIEWS.map(
    (view) => `<button class="projectDataCard" type="button" data-project-tab="${view.id}">
      <span class="projectDataArrow">↗</span>
      <span class="projectDataTitle">${esc(view.title)}</span>
      <span class="projectDataCopy">${esc(view.copy)}</span>
    </button>`,
  ).join('');
  const tiers = ['standard', 'preferred', 'premium'].map((key) => {
    const tier = inventory.tiers[key];
    return `<article class="memberCard">
      <p class="memberKicker">${esc(tier.label)} membership</p>
      <strong class="memberPrice">${money(tier.price)}</strong>
      <p class="memberCopy">${tier.open} of ${tier.total} parcels open in the current plan.</p>
      <p class="memberFoot">${money(dues)} monthly dues · network access included</p>
    </article>`;
  }).join('');
  const rights = (project.landRights || []).map(
    (right) => `<article class="landRight${right.disabled ? ' isFuture' : ''}">
      <div class="landRightTop">
        <h4>${esc(right.label)}</h4>
        <span class="landTag ${right.status}">${right.status === 'included' ? 'Included' : right.status === 'review' ? 'Review required' : 'Future option'}</span>
      </div>
      <p>${esc(right.summary)}</p>
    </article>`,
  ).join('');

  return `<div class="projectPage">
    <header class="projectHeader">
      <div class="projectHero">
        <div class="projectHeroCopy">
        <p class="projectKicker">${esc(project.index)} · ${esc(project.region)} · ${esc(project.statusLabel)}</p>
        <h2>${esc(project.name)}</h2>
        <p class="projectLead">${esc(project.description)}</p>
        <div class="projectActions">
          <button class="hbtn primary" type="button" data-project-reserve>Reserve at ${esc(project.name)}</button>
          <button class="hbtn" type="button" data-project-home>All projects</button>
        </div>
        <p class="projectNote">A signed reservation is a nonbinding hold until the co-op accepts it and definitive documents are executed. Payment connection is still pending.</p>
      </div>
        <aside class="projectAside" aria-label="${esc(project.name)} at a glance">
          <p class="projectAsideKicker">Live project snapshot</p>
          <dl class="projectAsideRows">
            <div><dt>Open parcels</dt><dd>${inventory.open} of ${inventory.total}</dd></div>
            <div><dt>Planned spaces</dt><dd>${capacity}</dd></div>
            <div><dt>Parcel</dt><dd>${acres} acres</dd></div>
            <div><dt>Monthly dues</dt><dd>${money(dues)}</dd></div>
            <div><dt>Member capital</dt><dd>${money(inventory.prices.min)}–${money(inventory.prices.max)}</dd></div>
          </dl>
          <p class="projectAsideFoot">Figures follow the current site plan and saved calculator.</p>
        </aside>
      </div>
      ${communityImageHtml(project)}
    </header>

    <section class="projectStats" aria-label="Project figures">
      <div><span>Open now</span><strong>${inventory.open}</strong><small>parcels available</small></div>
      <div><span>Membership from</span><strong>${money(inventory.prices.min)}</strong><small>plus ${money(inventory.dues)} monthly dues</small></div>
      <div><span>Reservation deposit</span><strong>${money(inventory.tiers.standard ? inventory.tiers.standard.price * 0.1 : 0)}</strong><small>10% of the Standard membership</small></div>
      <div><span>Network</span><strong>4 holons</strong><small>one owner record</small></div>
    </section>

    <section class="projectSection">
      <header class="projectSectionHead">
        <div>
          <p class="projectKicker">Membership</p>
          <h3>Choose how much space you need.</h3>
        </div>
        <p>Parcel size sets your membership type. Every type includes a parcel, shared community core and network access.</p>
      </header>
      <div class="memberGrid">${tiers}</div>
    </section>

    <section class="projectSection">
      <header class="projectSectionHead">
        <div>
          <p class="projectKicker">Land rights</p>
          <h3>The land right is part of the reservation.</h3>
        </div>
        <p>The leasehold is the current model. The other structures are shown so the choice is explicit, not buried in a contract.</p>
      </header>
      <div class="landRights">${rights}</div>
    </section>

    <section class="projectNetwork" aria-label="Network access">
      <p class="projectKicker">One network</p>
      <h3>${esc(NETWORK.promise)}</h3>
      <p>${esc(project.networkAccess)}</p>
      <p class="projectNetworkFoot">${esc(NETWORK.access)}</p>
    </section>

    <section class="projectSection">
      <header class="projectSectionHead">
        <div>
          <p class="projectKicker">Project data</p>
          <h3>Follow the whole study.</h3>
        </div>
        <p>Every view below is scoped to ${esc(project.name)} and reads the same live plan and calculator.</p>
      </header>
      <div class="projectDataGrid">${data}</div>
    </section>

    <section class="projectCta">
      <div>
        <p class="projectKicker">Ready to choose a parcel?</p>
        <h3>Reserve at ${esc(project.name)}.</h3>
        <p>Select a parcel, membership type and land right, review the agreement and sign in the app. Payment by ACH or card is the next step when checkout opens.</p>
      </div>
      <button class="hbtn primary" type="button" data-project-reserve>Open the parcel map</button>
    </section>
  </div>`;
}

function comingSoonHtml(project) {
  const planned = (project.planned || [])
    .map((item) => `<li>${esc(item)}</li>`)
    .join('');
  return `<div class="projectPage">
    <header class="projectHeader">
      <div class="projectHero isComing">
        <div class="projectHeroCopy">
          <p class="projectKicker">${esc(project.index)} · ${esc(project.region)} · ${esc(project.statusLabel)}</p>
          <h2>${esc(project.name)}</h2>
          <p class="projectLead">${esc(project.description)}</p>
          <div class="projectActions">
            <button class="hbtn primary" type="button" data-project-contact>Register interest</button>
            <button class="hbtn" type="button" data-project-home>All projects</button>
          </div>
          <p class="projectNote">Reservations are not open. Membership types, land rights, dues and fees will be published before the first reservation.</p>
        </div>
        <aside class="projectAside isComing" aria-label="${esc(project.name)} status">
          <p class="projectAsideKicker">In formation</p>
          <p class="comingBig">${esc(project.statusLabel)}</p>
          <p class="projectAsideFoot">${esc(project.location)}. This project has no live parcel inventory yet.</p>
        </aside>
      </div>
      ${communityImageHtml(project)}
    </header>

    <section class="projectSection">
      <header class="projectSectionHead">
        <div>
          <p class="projectKicker">What we know</p>
          <h3>A local co-op, inside a shared network.</h3>
        </div>
        <p>Each Holon keeps its own land, membership contract, dues and land rights. Joining one gives you a path into the others.</p>
      </header>
      <ul class="comingList">${planned}</ul>
    </section>

    <section class="projectNetwork">
      <p class="projectKicker">Network access</p>
      <h3>${esc(NETWORK.promise)}</h3>
      <p>${esc(NETWORK.access)}</p>
      <p class="projectNetworkFoot">Register interest and we will send the membership and reservation terms when this Holon opens.</p>
    </section>

    <section class="projectCta">
      <div>
        <p class="projectKicker">Stay close</p>
        <h3>Be first to see the terms.</h3>
        <p>Tell us what kind of membership and land right you would want at ${esc(project.name)}.</p>
      </div>
      <button class="hbtn primary" type="button" data-project-contact>Register interest</button>
    </section>
  </div>`;
}

export function projectHtml(project, plan = null) {
  if (!project) {
    return `<div class="projectPage"><p class="projectMissing">That Holon could not be found. <button class="hbtn" type="button" data-project-home>All projects</button></p></div>`;
  }
  return isLiveProject(project) ? liveProjectHtml(project, plan) : comingSoonHtml(project);
}

let bound = false;
let sectionBound = false;

export function initProject({ projectId, getPlan, goTab, goReserve, openContact } = {}) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector('#project');
  if (!el) return;
  const project = projectId ? projectById(projectId) : null;
  el.innerHTML = projectHtml(project, typeof getPlan === 'function' ? getPlan() : null);
  if (bound) return;
  el.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-project-tab]');
    if (tab) {
      if (typeof goTab === 'function') goTab(tab.dataset.projectTab);
      return;
    }
    if (e.target.closest('[data-project-reserve]')) {
      if (typeof goReserve === 'function') goReserve();
      return;
    }
    if (e.target.closest('[data-project-home]')) {
      if (typeof goTab === 'function') goTab('home');
      return;
    }
    if (e.target.closest('[data-project-contact]')) {
      if (typeof openContact === 'function') openContact();
    }
  });
  bound = true;
}

export function initProjectSection({ projectId, tab = 'plan', openContact } = {}) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector('#project-section');
  if (!el) return;
  const project = projectId ? projectById(projectId) : null;
  el.innerHTML = project
    ? projectSectionHtml(project, tab)
    : `<div class="projectPage"><p class="projectMissing">That Holon could not be found.</p></div>`;
  if (sectionBound) return;
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-project-section-contact]')) {
      if (typeof openContact === 'function') openContact();
    }
  });
  sectionBound = true;
}
