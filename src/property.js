// One property as a Holon page: the research record, its parcels, and the
// routes into the plan generator and the atlas entry.
import {
  atlasPathFor, getProperty, isActive, loadProperties, planPathFor, subscribe, toggleActive,
} from './properties.js';
import { projectPath } from './routes.js';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const money = (n) =>
  typeof n === 'number' ? `$${n.toLocaleString('en-US')}` : 'Not published';

const acres = (n) => (typeof n === 'number' ? `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ac` : 'Unknown');

function facts(p) {
  const rows = [
    ['Future project', p.projectName || 'Unnamed'],
    ['Parcel number(s)', (p.apns || []).join(', ') || '—'],
    ['Acreage', `${acres(p.acres)}${p.listingAcres ? ` · listing says ${acres(p.listingAcres)}` : ''}`],
    ['Asking price (snapshot)', money(p.price)],
    ['Zoning (listing claim)', p.zoning || 'Unknown'],
    ['Geometry', p.geometryStatus || 'Unverified'],
    ['Dimensions', p.dimensions || 'Not measured'],
    ['Centroid', p.lat ? `${p.lat}, ${p.lon}` : 'Not matched'],
    ['Image readiness', p.imageReadiness || 'Concept only'],
  ];
  return rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
}

function render(id) {
  const host = document.querySelector('#property-page');
  if (!host) return;
  const p = getProperty(id);
  if (!p) {
    host.innerHTML = `<div class="globalwrap"><header class="globalhead">
      <p class="globalKicker">Holons · property</p>
      <h2>That property is not in the inventory.</h2>
      <p class="globalLead">It may have been removed from the atlas, or the link is wrong.</p></header>
      <p><a class="hbtn" href="research/holons-parcel-atlas.html">Open the research atlas</a></p></div>`;
    return;
  }
  const active = isActive(p.id);
  const plan = p.plan
    ? `<a class="hbtn primary" href="${planPathFor(p.id)}">Generate the layout ${p.plan.widthFt} × ${p.plan.heightFt} ft</a>`
    : `<span class="hbtn" aria-disabled="true">No parcel dimensions yet</span>`;
  const map = p.lat
    ? `<a class="hbtn" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}" target="_blank" rel="noopener">Locate parcel ↗</a>`
    : '';
  const listing = p.listingUrl
    ? `<a class="hbtn" href="${esc(p.listingUrl)}" target="_blank" rel="noopener">Open listing ↗</a>`
    : '';
  host.innerHTML = `
  <div class="globalwrap propertyPage">
    <header class="globalhead">
      <p class="globalKicker">Property ${esc(String(p.id).padStart(2, '0'))} · ${esc(p.projectName || 'Unnamed future project')} · ${active ? 'active Holon' : 'research candidate'}</p>
      <h2>${esc(p.name)}</h2>
      <p class="globalLead">${esc(p.notes || '')}</p>
    </header>
    <div class="propertyBar">
      <button class="hbtn ${active ? 'primary' : ''}" type="button" data-property-toggle>
        ${active ? 'Turn off as a project' : 'Turn on as a project'}
      </button>
      <a class="hbtn" href="${atlasPathFor(p.id)}">Open in the research atlas</a>
      ${plan}
      ${map}
      ${listing}
      ${active ? `<a class="hbtn" href="${projectPath('lithium-city')}">Open the project workspace</a>` : ''}
    </div>
    <div class="globalGrid">
      <article class="globalCard">
        <span class="globalCardNum">01</span>
        <h3>The land</h3>
        <dl class="propertyFacts">${facts(p)}</dl>
      </article>
      <article class="globalCard">
        <span class="globalCardNum">02</span>
        <h3>The plan</h3>
        <p>${p.plan
          ? `The parcel measures about ${p.plan.widthFt} × ${p.plan.heightFt} ft. The plan tool opens with those bounds and a seed tied to this property, so the same parcel always regenerates the same village.`
          : 'This record has no measured footprint yet, so the plan tool cannot size a village for it.'}</p>
        <p class="globalNote">Edits made in the plan tool are saved in this browser under one key, so the calculator, the P&amp;L and the roadmap all read the same drawing.</p>
      </article>
      <article class="globalCard">
        <span class="globalCardNum">03</span>
        <h3>The image brief</h3>
        <p>${esc(p.imagePrompt || 'No image brief recorded for this property.')}</p>
        <button class="hbtn" type="button" data-copy-brief>Copy image brief</button>
      </article>
    </div>
    <p class="globalNote">This page is built from <code>data/properties.json</code>, the same record the research atlas reads. Nothing here is an offer, and entitlement, access and servicing remain unverified until a site study says otherwise.</p>
  </div>`;

  host.querySelector('[data-property-toggle]')?.addEventListener('click', () => {
    toggleActive(p.id);
    render(p.id);
  });
  host.querySelector('[data-copy-brief]')?.addEventListener('click', async (e) => {
    const text = p.imagePrompt || p.name;
    try {
      await navigator.clipboard.writeText(text);
      e.currentTarget.textContent = 'Copied';
    } catch {
      e.currentTarget.textContent = 'Copy failed';
    }
  });
}

export function initProperty({ id }) {
  render(id);
  loadProperties().then(() => render(id));
  subscribe(() => render(id));
}
