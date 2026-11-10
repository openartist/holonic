// Renders the imported Holons Coop business plan in the Brief tab.
import { renderMarkdown } from './markdown.js';

let loading = false;
let loaded = false;

export function initBrief() {
  const el = document.querySelector('#brief');
  if (!el || loading || loaded) return;
  loading = true;
  if (typeof fetch !== 'function') {
    loading = false;
    el.innerHTML = '<p class="muted">Open <a href="docs/holons-coop/business-plan.md">docs/holons-coop/business-plan.md</a> for the source text.</p>';
    return;
  }
  fetch('docs/holons-coop/business-plan.md')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then((md) => {
      el.innerHTML = renderMarkdown(md);
      loaded = true;
    })
    .catch((err) => {
      el.innerHTML = `<p class="muted">Could not load the brief (${err.message}). Read it directly at <a href="docs/holons-coop/business-plan.md">docs/holons-coop/business-plan.md</a>.</p>`;
    })
    .finally(() => {
      loading = false;
    });
}
