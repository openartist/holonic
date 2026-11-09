// The imported 44-slide deck, rendered as native HTML slides. The deck's own
// palette (cream, navy, teal, orange) drives the whole site's design tokens.
import { DECK } from './deck.js';

const $ = (sel) => document.querySelector(sel);
export const pad = (n) => String(n).padStart(2, '0');
export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const state = { i: 0, overview: false, ready: false };

// Short lines in the deck are card headings; the lines after them are the body.
export function groups(lines = []) {
  const out = [];
  let cur = null;
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    const isHead = line.length <= 62 && !/[.!?]$/.test(line);
    if (isHead) {
      if (cur) out.push(cur);
      cur = { head: line, body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else {
      cur = { head: '', body: [line] };
    }
  }
  if (cur) out.push(cur);
  return out;
}

const isNumeric = (txt) => /^[\s$€£]?[\d,.–-]+%?$/.test(txt) || /^[\s]*\$/.test(txt);

export function tableHtml(rows) {
  if (!rows || !rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const cell = (c, i, head) => {
    const txt = String(c == null ? '' : c);
    const tag = head ? 'th' : 'td';
    return `<${tag} class="${isNumeric(txt) ? 'num' : ''}${i === 0 ? ' first' : ''}">${esc(txt)}</${tag}>`;
  };
  const head = `<thead><tr>${Array.from({ length: width }, (_, i) => cell(rows[0][i], i, true)).join('')}</tr></thead>`;
  const body = rows.slice(1)
    .map((r) => `<tr>${Array.from({ length: width }, (_, i) => cell(r[i], i, false)).join('')}</tr>`)
    .join('');
  return `<div class="dtablewrap"><table class="dtable">${head}<tbody>${body}</tbody></table></div>`;
}

const foot = (s) => `<footer class="dfoot">
  <span>${pad(s.n)}</span>
  <span>Lithium City · Purchase &amp; formation study</span>
  ${s.charts ? '<span class="dchart">Chart in original deck</span>' : ''}
</footer>`;

export function slideHtml(s) {
  if (s.kind === 'cover') {
    return `<article class="slide cover">
      <div class="coverBrand"><span class="cmark">LC</span><span class="eyebrow">Lithium City · Purchase &amp; formation study · 8 November 2026</span></div>
      <div class="coverMain">
        <h1>${esc(s.title)}</h1>
        <p class="coverStrap">${esc(s.strap)}</p>
        <p class="coverLead">${esc(s.lead)}</p>
      </div>
      <p class="coverMeta">${(s.bullets || []).map(esc).join('<br />')}</p>
      ${foot(s)}
    </article>`;
  }

  if (s.kind === 'statement') {
    return `<article class="slide statement">
      ${s.kicker ? `<p class="eyebrow">${esc(s.kicker)}</p>` : ''}
      <div class="statementMain">
        <h1>${esc(s.title)}</h1>
        ${s.lead ? `<p class="lead">${esc(s.lead)}</p>` : ''}
        ${s.strap ? `<p class="strap">${esc(s.strap)}</p>` : ''}
      </div>
      ${foot(s)}
    </article>`;
  }

  const cards = groups(s.bullets);
  const dense = s.kind === 'list' || cards.length > 9;
  const body = s.table
    ? tableHtml(s.table)
    : `<div class="dcards">${cards
        .map(
          (c) => `<div class="dcard${c.body.length ? '' : ' solo'}">
            ${c.head ? `<h3>${esc(c.head)}</h3>` : ''}
            ${c.body.map((t) => `<p>${esc(t)}</p>`).join('')}
          </div>`,
        )
        .join('')}</div>`;
  const notes = s.table && (s.bullets || []).length
    ? `<p class="dnote">${(s.bullets || []).slice(0, 2).map(esc).join(' · ')}</p>`
    : '';

  return `<article class="slide ${s.kind}${dense ? ' dense' : ''}">
    <header class="dhead">
      ${s.kicker ? `<p class="eyebrow">${esc(s.kicker)}</p>` : ''}
      <h2>${esc(s.title)}</h2>
      ${s.strap ? `<p class="strap">${esc(s.strap)}</p>` : ''}
    </header>
    ${s.lead ? `<p class="lead">${esc(s.lead)}</p>` : ''}
    ${body}
    ${notes}
    ${foot(s)}
  </article>`;
}

export function overviewHtml(current = 0) {
  return DECK.slides
    .map(
      (s, i) => `<button type="button" class="tile${i === current ? ' on' : ''}" data-slide="${i}">
        <span class="tile-n">${pad(s.n)}</span>
        <span class="tile-title">${esc(s.title)}</span>
        <span class="tile-kind">${s.table ? 'table' : esc(s.kind)}</span>
      </button>`,
    )
    .join('');
}

export function render() {
  const s = DECK.slides[state.i];
  if (!s) return;
  const stage = $('#deck-stage');
  const counter = $('#deck-counter');
  const progress = $('#deck-progress');
  const overview = $('#deck-overview');
  const wrap = $('#deck-stagewrap');
  if (stage) stage.innerHTML = slideHtml(s);
  if (counter) counter.innerHTML = `${pad(state.i + 1)} / ${pad(DECK.slides.length)}`;
  if (progress) progress.innerHTML = `<i style="width:${(((state.i + 1) / DECK.slides.length) * 100).toFixed(2)}%"></i>`;
  if (overview) {
    overview.innerHTML = overviewHtml(state.i);
    overview.hidden = !state.overview;
  }
  if (wrap) wrap.hidden = state.overview;
  try {
    localStorage.setItem('holons-deck', String(state.i));
  } catch { /* storage is optional */ }
}

function go(i) {
  state.i = (i + DECK.slides.length) % DECK.slides.length;
  state.overview = false;
  render();
}

function bind() {
  const on = (sel, ev, fn) => {
    const el = $(sel);
    if (el) el.addEventListener(ev, fn);
  };
  on('#deck-prev', 'click', () => go(state.i - 1));
  on('#deck-next', 'click', () => go(state.i + 1));
  on('#deck-grid', 'click', () => {
    state.overview = !state.overview;
    render();
  });
  on('#deck-full', 'click', () => present());
  const overview = $('#deck-overview');
  if (overview) {
    overview.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-slide]') : null;
      if (btn) go(Number(btn.dataset.slide));
    });
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', (e) => {
      const pane = $('#tab-deck');
      if (!pane || pane.hidden) return;
      const key = String(e.key || '');
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
        e.preventDefault();
        go(state.i + 1);
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        e.preventDefault();
        go(state.i - 1);
      } else if (key === 'Home') {
        e.preventDefault();
        go(0);
      } else if (key === 'End') {
        e.preventDefault();
        go(DECK.slides.length - 1);
      } else if (key.toLowerCase() === 'g') {
        state.overview = !state.overview;
        render();
      } else if (key.toLowerCase() === 'f') {
        present();
      } else if (key === 'Escape' && state.overview) {
        state.overview = false;
        render();
      }
    });
  }
}

function present() {
  const el = $('#tab-deck');
  if (!el || typeof el.requestFullscreen !== 'function') return;
  const req = el.requestFullscreen();
  if (req && typeof req.catch === 'function') req.catch(() => {});
}

export function initDeck() {
  const stage = $('#deck-stage');
  if (!stage) return;
  if (!state.ready) {
    try {
      const saved = Number(localStorage.getItem('holons-deck'));
      if (Number.isFinite(saved)) state.i = Math.min(DECK.slides.length - 1, Math.max(0, Math.trunc(saved)));
    } catch { /* storage is optional */ }
    bind();
    state.ready = true;
  }
  render();
}
