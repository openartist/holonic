// The incorporation packet. Every draft in docs/incorporation is listed in the
// left-hand register and rendered from its Markdown source, so the browser and
// the files on disk can never disagree about what the packet contains.
import { renderMarkdown } from './markdown.js';
import { parseRoute, projectPath } from './routes.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const DOC_GROUPS = [
  { id: 'filing', label: 'Filing' },
  { id: 'governance', label: 'Governance' },
  { id: 'membership', label: 'Membership' },
  { id: 'finance', label: 'Finance' },
];

// Order, numbering, group and action mirror the document register in 00-filing-index.md.
export const DOCS = [
  { id: 'filing-index', num: '00', file: '00-filing-index.md', title: 'Filing Index', group: 'filing', action: 'Keep with the packet', status: 'ready', signatures: '—' },
  { id: 'articles-of-incorporation', num: '01', file: '01-articles-of-incorporation.md', title: 'Articles of Incorporation', group: 'filing', action: 'File with the Secretary of State', status: 'ready', signatures: '3 incorporators' },
  { id: 'bylaws', num: '02', file: '02-bylaws.md', title: 'Bylaws', group: 'governance', action: 'Adopt at organizational meeting', status: 'adopt', signatures: 'Secretary certifies' },
  { id: 'organizational-resolutions', num: '03', file: '03-organizational-resolutions.md', title: 'Organizational Resolutions', group: 'governance', action: 'Adopt at first board meeting', status: 'adopt', signatures: 'All initial directors' },
  { id: 'conflict-of-interest-policy', num: '04', file: '04-conflict-of-interest-policy.md', title: 'Conflict of Interest Policy', group: 'governance', action: 'Adopt; collect annual statements', status: 'adopt', signatures: 'Directors' },
  { id: 'membership-subscription-agreement', num: '05', file: '05-membership-subscription-agreement.md', title: 'Membership Subscription Agreement', group: 'membership', action: 'Counsel and DRE review before use', status: 'counsel', signatures: 'Member + co-op' },
  { id: 'occupancy-and-use-agreement', num: '06', file: '06-occupancy-and-use-agreement.md', title: 'Occupancy and Use Agreement', group: 'membership', action: 'Counsel review before use', status: 'counsel', signatures: 'Member + co-op' },
  { id: 'rental-pool-addendum', num: '07', file: '07-rental-pool-addendum.md', title: 'Rental Pool Addendum', group: 'membership', action: 'Counsel review before launch', status: 'counsel', signatures: 'Member + co-op' },
  { id: 'guest-booking-terms', num: '08', file: '08-guest-booking-terms.md', title: 'Guest Booking Terms', group: 'membership', action: 'Counsel review before launch', status: 'counsel', signatures: 'Guest accepts online' },
  { id: 'disclosure-statement', num: '09', file: '09-disclosure-statement.md', title: 'Disclosure Statement', group: 'membership', action: 'Counsel and DRE review before use', status: 'counsel', signatures: 'Member acknowledges' },
  { id: 'records-and-meetings-policy', num: '10', file: '10-records-and-meetings-policy.md', title: 'Records and Meetings Policy', group: 'governance', action: 'Adopt at first board meeting', status: 'adopt', signatures: 'Board' },
  { id: 'financial-controls-and-dues-policy', num: '11', file: '11-financial-controls-and-dues-policy.md', title: 'Financial Controls and Dues Policy', group: 'finance', action: 'Adopt at first board meeting', status: 'adopt', signatures: 'Board' },
  { id: 'filing-checklist', num: '12', file: '12-filing-checklist.md', title: 'Filing Checklist', group: 'filing', action: 'Work through before filing', status: 'ready', signatures: '—' },
  { id: 'formation-timeline', num: '13', file: '13-formation-timeline.md', title: 'Formation Timeline', group: 'filing', action: 'Track against the roadmap', status: 'ready', signatures: '—' },
];

const STATUS = {
  ready: { label: 'Ready to file or use', short: 'Ready' },
  adopt: { label: 'Board adoption required', short: 'Adopt' },
  counsel: { label: 'Counsel and DRE review', short: 'Counsel' },
};

export const statusLabel = (doc) => (STATUS[doc && doc.status] || STATUS.counsel).label;
export const statusShort = (doc) => (STATUS[doc && doc.status] || STATUS.counsel).short;

export function statusCounts() {
  return DOCS.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, { ready: 0, adopt: 0, counsel: 0 });
}

export const docById = (id) => DOCS.find((d) => d.id === id) || null;
export const groupLabel = (id) => (DOC_GROUPS.find((g) => g.id === id) || {}).label || 'Packet';

export function summaryText() {
  const c = statusCounts();
  return `${DOCS.length} documents · ${c.ready} ready · ${c.adopt} to adopt · ${c.counsel} for review`;
}

export function navHtml(activeId = '') {
  return DOCS.map(
    (d) => `<a class="docrow${d.id === activeId ? ' on' : ''}" href="${projectPath('lithium-city', 'documents', d.id)}" data-doc="${d.id}" title="${esc(d.title)} — ${esc(d.action)}">
      <span class="docnum">${d.num}</span>
      <span class="doctitle">${esc(d.title)}</span>
      <i class="docdot ${d.status}" aria-hidden="true"></i>
    </a>`,
  ).join('');
}

export function docHeadHtml(doc) {
  if (!doc) return '';
  const i = DOCS.indexOf(doc);
  return `<p class="doceyebrow">Holons · Lithium City incorporation packet · ${String(i).padStart(2, '0')} of ${DOCS.length}</p>
    <h2>${esc(doc.title)}</h2>
    <div class="docpills">
      <span class="docstatus ${doc.status}">${statusLabel(doc)}</span>
      <span class="docpill">${esc(groupLabel(doc.group))}</span>
      ${doc.signatures && doc.signatures !== '—' ? `<span class="docpill">Signatures: ${esc(doc.signatures)}</span>` : ''}
    </div>
    <p class="docaction"><b>Action</b> ${esc(doc.action)}</p>`;
}

export const wordCount = (md) => (String(md).trim().match(/\S+/g) || []).length;
export const readMinutes = (words) => Math.max(1, Math.round(words / 220));

// ---- browser pane -------------------------------------------------------
const cache = new Map();
const state = { id: null, bound: false };

const hashId = () => {
  const route = parseRoute(typeof location !== 'undefined' ? location.hash : '');
  return route.tab === 'documents' && docById(route.docId) ? route.docId : DOCS[0].id;
};

function load(doc) {
  if (cache.has(doc.file)) return Promise.resolve(cache.get(doc.file));
  if (typeof fetch !== 'function') return Promise.reject(new Error('fetch is unavailable'));
  return fetch(`docs/incorporation/${doc.file}`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((md) => {
      cache.set(doc.file, md);
      return md;
    });
}

function go(id) {
  if (!docById(id)) return;
  state.id = id;
  paint();
  if (typeof location !== 'undefined') {
    const next = projectPath('lithium-city', 'documents', id);
    if (location.hash !== next) location.hash = next;
  }
}

function paint() {
  const doc = docById(state.id) || DOCS[0];
  state.id = doc.id;
  const i = DOCS.indexOf(doc);

  const nav = document.querySelector('#doc-nav');
  if (nav) nav.innerHTML = navHtml(doc.id);

  const head = document.querySelector('#doc-head');
  if (head) head.innerHTML = docHeadHtml(doc);

  const count = document.querySelector('#doc-count');
  if (count) count.textContent = summaryText();

  const meta = document.querySelector('#doc-meta');
  if (meta) meta.textContent = `docs/incorporation/${doc.file} · loading…`;

  const pos = document.querySelector('#doc-pos');
  if (pos) pos.textContent = `Document ${i + 1} of ${DOCS.length}`;

  const prev = DOCS[(i - 1 + DOCS.length) % DOCS.length];
  const next = DOCS[(i + 1) % DOCS.length];
  const prevBtn = document.querySelector('#doc-prev');
  const nextBtn = document.querySelector('#doc-next');
  if (prevBtn) {
    prevBtn.textContent = `‹ ${prev.num}`;
    prevBtn.setAttribute('aria-label', `Previous: ${prev.title}`);
  }
  if (nextBtn) {
    nextBtn.textContent = `${next.num} ›`;
    nextBtn.setAttribute('aria-label', `Next: ${next.title}`);
  }

  const body = document.querySelector('#doc-body');
  if (!body) return;
  body.classList.add('loading');
  body.textContent = 'Loading the document…';

  load(doc)
    .then((md) => {
      if (state.id !== doc.id) return;
      body.classList.remove('loading');
      body.innerHTML = renderMarkdown(md);
      const words = wordCount(md);
      if (meta) meta.textContent = `${words.toLocaleString('en-US')} words · ${readMinutes(words)} min read · docs/incorporation/${doc.file}`;
    })
    .catch((err) => {
      if (state.id !== doc.id) return;
      body.classList.remove('loading');
      body.innerHTML = `<p class="muted">Could not load this draft (${esc(err.message)}). Read it directly at <a href="docs/incorporation/${doc.file}">docs/incorporation/${doc.file}</a>.</p>`;
    });
}

function download() {
  const doc = docById(state.id);
  if (!doc) return;
  const save = (md) => {
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holons-coop-${doc.num}-${doc.id}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  if (cache.has(doc.file)) save(cache.get(doc.file));
  else load(doc).then(save).catch(() => {});
}

let packetPrinting = false;

// Print all fourteen drafts as one packet, not just the open document. The
// files are already on disk; cache whatever has been read and fetch the rest.
async function printPacket() {
  if (packetPrinting) return;
  const box = document.querySelector('#doc-packet');
  if (!box) return;
  packetPrinting = true;
  box.innerHTML = '<p>Preparing the packet…</p>';
  try {
    const parts = [];
    for (const doc of DOCS) {
      let md = cache.get(doc.file);
      if (!md) {
        const res = await fetch(`docs/incorporation/${doc.file}`);
        if (!res.ok) throw new Error(`${res.status} ${doc.file}`);
        md = await res.text();
        cache.set(doc.file, md);
      }
      parts.push(`<article class="docpacketdoc"><p class="docpacketnum">${doc.num} · ${doc.title}</p>${renderMarkdown(md)}</article>`);
    }
    box.innerHTML = parts.join('');
    document.body.classList.add('print-packet');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-packet'), { once: true });
    window.print();
    setTimeout(() => document.body.classList.remove('print-packet'), 60000);
  } catch {
    document.body.classList.remove('print-packet');
    box.innerHTML = '';
    alert('Could not assemble the whole packet. Print the open document instead.');
  } finally {
    packetPrinting = false;
  }
}

export function initDocuments() {
  if (typeof document === 'undefined') return;
  const nav = document.querySelector('#doc-nav');
  if (!nav) return;

  if (!state.bound) {
    nav.addEventListener('click', (e) => {
      const row = e.target && e.target.closest ? e.target.closest('[data-doc]') : null;
      if (!row) return;
      e.preventDefault();
      go(row.dataset.doc);
    });
    const on = (sel, ev, fn) => {
      const el = document.querySelector(sel);
      if (el) el.addEventListener(ev, fn);
    };
    on('#doc-prev', 'click', () => {
      const i = DOCS.findIndex((d) => d.id === state.id);
      go(DOCS[(i - 1 + DOCS.length) % DOCS.length].id);
    });
    on('#doc-next', 'click', () => {
      const i = DOCS.findIndex((d) => d.id === state.id);
      go(DOCS[(i + 1) % DOCS.length].id);
    });
    on('#doc-download', 'click', download);
    on('#doc-print', 'click', () => window.print());
    on('#doc-print-all', 'click', printPacket);
    state.bound = true;
  }

  state.id = hashId();
  paint();
}
