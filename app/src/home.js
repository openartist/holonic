// Network home: the front door is Holons as a whole, not any one village.
// Lithium City's figures still come from the live plan and saved calculator.
import { getProgram } from './program.js';
import { money, savedModel } from './model-ui.js';
import { reserveSummary } from './reserve.js';
import { NETWORK, PROJECTS, isLiveProject } from './projects.js';
import { projectPath, reservePath } from './routes.js';

const esc = (s) =>
  String(s).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const HERO = {
  src: 'assets/network/network-hero.jpg',
  alt: 'Concept image: a tent and two chairs facing a valley at sunset.',
};

const GALLERY = [
  {
    src: 'assets/network/arrival.jpg',
    alt: 'Concept image: a camper looking out from a tent toward mountains.',
    caption: 'Arrival',
    tall: true,
  },
  {
    src: 'assets/network/shared-table.jpg',
    alt: 'Concept image: a family gathered outside a tent at dusk.',
    caption: 'The shared table',
  },
  {
    src: 'assets/network/quiet-land.jpg',
    alt: 'Concept image: two tents on a ridge above a lake.',
    caption: 'Quiet land',
  },
  {
    src: 'assets/network/gathering.jpg',
    alt: 'Concept image: a canvas tent, chairs and a firepit in a forest clearing.',
    caption: 'A place to gather',
  },
  {
    src: 'assets/network/room-to-breathe.jpg',
    alt: 'Concept image: an open tent in a green forest clearing.',
    caption: 'Room to breathe',
  },
];

function liveStats(plan) {
  const drawn = plan && plan.stats && Number.isFinite(plan.stats.sites) ? plan.stats.sites : getProgram().spaces;
  const capacity = Math.max(0, Math.round(drawn));
  const acres = plan && plan.stats && plan.stats.acres ? plan.stats.acres : getProgram().acres;
  const saved = savedModel();
  const inventory = reserveSummary(plan, saved, capacity);
  return { capacity, acres, saved, inventory, dues: inventory.dues };
}

function projectDirectoryItem(project) {
  const live = isLiveProject(project);
  return `<a class="networkDirectoryItem${live ? ' isLive' : ''}" href="${projectPath(project.id)}" data-project-id="${project.id}">
    <span class="networkDirectoryTop">
      <span class="networkDirectoryIndex">${esc(project.index)}</span>
      <span class="networkStatus ${live ? 'open' : 'soon'}">${esc(project.statusLabel)}</span>
    </span>
    <h3 class="networkDirectoryName">${esc(project.name)}</h3>
    <span class="networkDirectoryLocation">${esc(project.location)}</span>
    <span class="networkDirectoryDesc">${esc(project.description)}</span>
    <span class="networkDirectoryLink">Open project <span aria-hidden="true">→</span></span>
  </a>`;
}

function projectCard(project, stats) {
  const live = isLiveProject(project);
  const facts = live
    ? `<div class="networkFacts">
        <span><b>${stats.inventory.open}</b> of ${stats.inventory.total} parcels open</span>
        <span><b>${stats.capacity}</b> spaces</span>
        <span><b>${stats.acres}</b> acres</span>
      </div>
      <div class="networkPrice"><strong>${money(stats.inventory.prices.min)}</strong><span>membership from · ${money(stats.dues)}/mo dues</span></div>`
    : `<div class="networkFacts isComing">
        <span>Site to be announced</span>
        <span>Membership terms in formation</span>
      </div>
      <div class="networkPrice"><strong>${esc(project.statusLabel)}</strong><span>Reservations are not open yet</span></div>`;
  return `<a class="networkProject${live ? ' isOpen' : ' isComing'}" href="${projectPath(project.id)}" data-project-id="${project.id}">
    <span class="networkProjectMedia">
      <img src="${esc(project.image)}" alt="${esc(project.imageAlt)}" loading="lazy" decoding="async" />
      <span class="networkProjectMediaLabel">Concept image</span>
    </span>
    <div class="networkProjectBody">
      <span class="networkProjectTop">
        <span class="networkIndex">${esc(project.index)}</span>
        <span class="networkStatus ${live ? 'open' : 'soon'}">${esc(project.statusLabel)}</span>
      </span>
      <h2 class="networkName">${esc(project.name)}</h2>
      <span class="networkLocation">${esc(project.location)}</span>
      <span class="networkBlurb">${esc(project.description)}</span>
      ${facts}
      <span class="networkOpen">View project <span aria-hidden="true">→</span></span>
    </div>
  </a>`;
}

function galleryItem(item, index) {
  return `<figure class="networkGalleryItem${item.tall ? ' isTall' : ''}">
    <img src="${esc(item.src)}" alt="${esc(item.alt)}" loading="lazy" decoding="async" />
    <figcaption>${esc(item.caption)}</figcaption>
  </figure>`;
}

function step(num, title, copy) {
  return `<article class="networkStep">
    <span class="networkStepNum">${num}</span>
    <h3>${title}</h3>
    <p>${copy}</p>
  </article>`;
}

export function homeHtml(plan = null) {
  const stats = liveStats(plan);
  const live = PROJECTS.filter(isLiveProject).length;
  const soon = PROJECTS.length - live;
  const cards = PROJECTS.map((project) => projectCard(project, stats)).join('');
  const directory = PROJECTS.map(projectDirectoryItem).join('');
  const gallery = GALLERY.map(galleryItem).join('');
  const projectLinks = PROJECTS.map(
    (project) => `<a href="${projectPath(project.id)}" data-project-id="${project.id}">${esc(project.name)}</a>`,
  ).join('');

  return `<div class="networkHome">
    <section class="networkHero" aria-labelledby="network-hero-title">
      <img class="networkHeroMedia" src="${HERO.src}" alt="${esc(HERO.alt)}" fetchpriority="high" />
      <div class="networkHeroScrim" aria-hidden="true"></div>
      <div class="networkHeroInner">
        <div class="networkHeroCopy">
          <p class="networkEyebrow">${esc(NETWORK.name)} · ${esc(NETWORK.descriptor)}</p>
          <h1 id="network-hero-title">Find your place in the network.</h1>
          <p class="networkLead">One network. Many ways to belong. Holons is a network of cohousing co-ops. Each project has its own land, membership types, dues, fees and land rights. Becoming an owner gives you a path into the rest of the network, under each holon’s contract and availability.</p>
          <div class="networkActions">
            <button class="hbtn primary" type="button" data-home-scroll="network-project-header">Explore the four projects</button>
            <button class="hbtn" type="button" data-home-scroll="network-how">How ownership works</button>
          </div>
          <p class="networkNote">Lithium City is the first live project. The other three Holons are coming soon. Nothing here is an offer of a security or membership.</p>
        </div>
      </div>
      <div class="networkHeroMeta">
        <span><b>${PROJECTS.length}</b> projects</span>
        <span><b>${live}</b> open now</span>
        <span><b>${stats.capacity}</b> live spaces</span>
        <span class="networkPhotoNote">Concept imagery</span>
      </div>
    </section>

    <section class="networkProjectHeader" id="network-project-header" aria-labelledby="network-project-header-title">
      <header class="networkSectionHead">
        <div>
          <p class="networkEyebrow">The projects</p>
          <h2 id="network-project-header-title">Four places. One membership path.</h2>
        </div>
        <p>Every Holon is a separate co-op with its own land, membership contract, dues and land rights. Lithium City is open for reservation; the others will publish their terms before they open.</p>
      </header>
      <div class="networkDirectory">${directory}</div>
    </section>

    <section class="networkStatRow" aria-label="Network figures">
      <div><span>Projects</span><strong>${PROJECTS.length}</strong><small>one shared owner record</small></div>
      <div><span>Open now</span><strong>${live}</strong><small>Lithium City reservations</small></div>
      <div><span>Live spaces</span><strong>${stats.capacity}</strong><small>${stats.acres} acres in the current plan</small></div>
      <div><span>Next</span><strong>${soon} holons</strong><small>sites and terms in formation</small></div>
    </section>

    <section class="networkProjects" id="network-projects" aria-label="Project modules">
      <div class="networkGrid">${cards}</div>
    </section>

    <section class="networkGallery" id="network-gallery" aria-labelledby="network-gallery-title">
      <header class="networkSectionHead">
        <div>
          <p class="networkEyebrow">Field notes</p>
          <h2 id="network-gallery-title">What belonging could look like.</h2>
        </div>
        <p>Shared tables, quiet edges, room to breathe. These are the visual notes behind the network: places that feel held, not merely built.</p>
      </header>
      <div class="networkGalleryGrid">${gallery}</div>
      <p class="networkGalleryNote">Concept imagery, not project photography.</p>
    </section>

    <section class="networkReserve" aria-labelledby="network-reserve-title">
      <div>
        <p class="networkEyebrow">Reserve now · Lithium City</p>
        <h2 id="network-reserve-title">${stats.inventory.open} of ${stats.inventory.total} parcels are still open.</h2>
        <p>Choose a parcel, see where it sits, pick a membership type and land right, then review and sign the reservation agreement in the app.</p>
      </div>
      <div class="networkReserveSide">
        <div class="networkReservePrices">
          <span><b>${money(stats.inventory.tiers.standard.price)}</b> Standard</span>
          <span><b>${money(stats.inventory.tiers.preferred.price)}</b> Preferred</span>
          <span><b>${money(stats.inventory.tiers.premium.price)}</b> Premium</span>
        </div>
        <a class="hbtn primary" href="${projectPath('lithium-city')}" data-project-id="lithium-city">View parcels and reserve</a>
        <small>${money(stats.dues)} monthly dues · 10% reservation deposit</small>
      </div>
    </section>

    <section class="networkHow" id="network-how">
      <header class="networkSectionHead">
        <div>
          <p class="networkEyebrow">How ownership works</p>
          <h2>A deliberate path from interest to a signed place.</h2>
        </div>
        <p>The app carries the full selection: project, membership type, land right, agreement and signature. Payment by ACH or card is the next step when checkout opens.</p>
      </header>
      <div class="networkSteps">
        ${step('01', 'Choose a holon', 'Start with the place and the local co-op. Lithium City is live; the other Holons show what is known and let you register interest.')}
        ${step('02', 'Select membership and land right', 'Parcel size sets the membership type. The land right is a separate choice: co-op leasehold, undivided interest or a future deeded option.')}
        ${step('03', 'Review, sign, then pay', 'The reservation records your selections and electronic signature. ACH via Plaid or card via Stripe is the eventual checkout path; until then the reservation is signed with payment pending.')}
      </div>
    </section>

    <section class="networkAccess">
      <div>
        <p class="networkEyebrow">Network access</p>
        <h2>${esc(NETWORK.promise)}</h2>
        <p>${esc(NETWORK.access)}</p>
      </div>
      <div class="networkAccessCard">
        <p class="networkAccessKicker">What stays local</p>
        <ul>
          <li>Membership type and land right</li>
          <li>Dues, fees and stay limits</li>
          <li>Governance and local rules</li>
          <li>Availability at each holon</li>
        </ul>
      </div>
    </section>

    <footer class="networkFooter">
      <div class="networkFooterBrand">
        <p class="networkFooterLogo">Holons</p>
        <p>A network of cohousing co-ops in formation. One owner record, many places to belong.</p>
      </div>
      <nav class="networkFooterCol" aria-label="Projects">
        <p class="networkFooterKicker">Projects</p>
        ${projectLinks}
      </nav>
      <div class="networkFooterCol">
        <p class="networkFooterKicker">Explore</p>
        <button type="button" data-home-scroll="network-how">How ownership works</button>
        <button type="button" data-home-scroll="network-gallery">Field notes</button>
        <a href="${reservePath()}">Reserve a place</a>
      </div>
    </footer>
    <p class="networkFoot">Holons is a network of cohousing co-ops in formation. Figures for Lithium City follow the current site plan and saved calculator; they are not an appraisal, a booking forecast, legal advice or an offer. Each project’s definitive membership documents control.</p>
  </div>`;
}

let bound = false;

export function initHome({ getPlan, goProject } = {}) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector('#home');
  if (!el) return;
  el.innerHTML = homeHtml(typeof getPlan === 'function' ? getPlan() : null);
  if (!bound) {
    el.addEventListener('click', (e) => {
      const scroll = e.target.closest('[data-home-scroll]');
      if (scroll) {
        document.getElementById(scroll.dataset.homeScroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const link = e.target.closest('[data-project-id]');
      if (!link || typeof goProject !== 'function') return;
      e.preventDefault();
      goProject(link.dataset.projectId);
    });
    bound = true;
  }
}
