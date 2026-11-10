// editRail.js — the floating left rail and the little inspector beside it.
//
// Pure DOM: it owns no scene state and never touches a mesh. It reports tool
// presses and action presses to the controller and renders whatever selection
// it is handed, so the rail can be dropped onto the city page unchanged later.
//
// Styles are injected rather than added to park.html so the same rail can be
// used from both pages without duplicating a stylesheet.

import { bounds, areaM2, centroid } from './editDoc.js?v=park-30';
import { DWELLINGS, DWELLING_KINDS } from './dwellings.js?v=park-30';

const TOOLS = [
  {
    group: 'Select',
    items: [
      { tool: 'select', glyph: '⬚', key: 'V', title: 'Select and move (V)' },
      { tool: 'vertex', glyph: '●', key: '1', title: 'Corners (1)' },
      { tool: 'edge', glyph: '╱', key: '2', title: 'Edges (2)' },
      { tool: 'rotate', glyph: '↻', key: 'R', title: 'Turn (R)' },
      { tool: 'boundary', glyph: '◇', key: 'B', title: 'Boundary (B)' },
    ],
  },
  {
    group: 'Build',
    items: [
      { tool: 'add-building', glyph: '▮', title: 'Add a building — click the ground' },
      { tool: 'add-site', glyph: '▤', title: 'Add a site / cottage' },
      { tool: 'add-road', glyph: '═', title: 'Draw a road — click start, then end' },
      { tool: 'add-path', glyph: '┄', title: 'Draw a footpath — click start, then end' },
      { tool: 'add-bed', glyph: '▩', title: 'Add a planting bed' },
    ],
  },
  {
    group: 'Edit',
    items: [
      { action: 'duplicate', glyph: '⧉', title: 'Duplicate (⌘D)' },
      { action: 'delete', glyph: '✕', title: 'Delete (⌫)' },
      { action: 'undo', glyph: '↶', title: 'Undo (⌘Z)' },
      { action: 'redo', glyph: '↷', title: 'Redo (⇧⌘Z)' },
    ],
  },
];

const HINTS = {
  select: 'Click an object to select · drag it to move · Shift for 10 cm, Alt for free',
  vertex: 'Click a corner of the selected object and drag it',
  edge: 'Click an edge of the selected object and drag it sideways',
  rotate: 'Drag around a selected object to turn it · 15° steps, Shift for 1°',
  boundary: 'Drag the boundary corners — the plan re-lays on release',
  'add-building': 'Click the ground to place a building',
  'add-site': 'Click the ground to place a site',
  'add-road': 'Click the start of the road, then its end',
  'add-path': 'Click the start of the footpath, then its end',
  'add-bed': 'Click the ground to place a planting bed',
};

const CSS = `
#editrail {
  position: fixed; left: 12px; top: 50%; transform: translateY(-50%);
  z-index: 18; display: flex; flex-direction: column; gap: 3px;
  padding: 6px 5px; background: rgba(14, 20, 22, 0.92);
  border: 1px solid #243035; border-radius: 7px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
}
#editrail .er-group { display: flex; flex-direction: column; gap: 3px; }
#editrail .er-sep { height: 1px; background: #243035; margin: 4px 2px; }
#editrail button {
  width: 30px; height: 27px; display: grid; place-items: center;
  background: #1a2326; color: #88959b; border: 1px solid #243035;
  border-radius: 4px; font: inherit; font-size: 13px; line-height: 1;
  cursor: pointer; padding: 0;
}
#editrail button:hover { color: #d5dde0; border-color: #33443f; }
#editrail button.on { color: #0d1214; background: #7fc7a8; border-color: #7fc7a8; }
#editrail button[disabled] { opacity: 0.32; cursor: default; }
#editrail button[disabled]:hover { color: #88959b; border-color: #243035; }

#editinspect {
  position: fixed; left: 58px; top: 50%; transform: translateY(-50%);
  z-index: 18; width: 206px; padding: 9px 10px;
  background: rgba(14, 20, 22, 0.94); border: 1px solid #3f6d5c;
  border-radius: 6px; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
  font-size: 10.5px; color: #d5dde0;
}
#editinspect[hidden] { display: none; }
#editinspect .ei-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px; }
#editinspect .ei-top b { font-size: 11.5px; font-weight: 600; }
#editinspect .ei-top span { font-size: 9px; color: #7fc7a8; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }
#editinspect dl { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin-bottom: 7px; }
#editinspect dt { color: #88959b; }
#editinspect dd { text-align: right; color: #c4ced2; }
#editinspect .ei-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
#editinspect .ei-actions button {
  padding: 4px 6px; background: #1a2326; color: #aab6bb; border: 1px solid #243035;
  border-radius: 3px; font: inherit; font-size: 10px; cursor: pointer;
}
#editinspect .ei-actions button:hover { color: #7fc7a8; border-color: #3f6d5c; }
#editinspect .ei-actions button.wide { grid-column: span 2; }
#editinspect .ei-lib { display: grid; grid-template-columns: auto 1fr; gap: 3px 7px; align-items: center; margin-bottom: 7px; }
#editinspect .ei-lib span { color: #88959b; }
#editinspect .ei-lib select {
  background: #1a2326; color: #d5dde0; border: 1px solid #243035;
  border-radius: 3px; font: inherit; font-size: 10px; padding: 3px 4px;
  cursor: pointer; min-width: 0;
}
#editinspect .ei-lib select:hover { border-color: #3f6d5c; }
`;

function injectStyles() {
  if (document.getElementById('editrail-style')) return;
  const style = document.createElement('style');
  style.id = 'editrail-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

// One option group per kind, so thirteen units stay findable.
function dwellingOptions(entry) {
  const groups = new Map();
  for (const d of DWELLINGS) {
    if (!groups.has(d.kind)) groups.set(d.kind, []);
    groups.get(d.kind).push(d);
  }
  return [...groups].map(([kind, list]) =>
    `<optgroup label="${esc(DWELLING_KINDS[kind] || kind)}">` +
    list.map(d => `<option value="${d.id}"${entry.dwelling === d.id && entry.occupied ? ' selected' : ''}>${esc(d.label)}</option>`).join('') +
    `</optgroup>`).join('');
}

const m = v => (v / 100).toFixed(2);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createRail({ onTool, onAction } = {}) {
  injectStyles();

  const rail = document.createElement('div');
  rail.id = 'editrail';
  rail.setAttribute('role', 'toolbar');
  rail.setAttribute('aria-label', 'Edit and build');

  const buttons = new Map();
  TOOLS.forEach((group, gi) => {
    if (gi > 0) {
      const sep = document.createElement('div');
      sep.className = 'er-sep';
      rail.appendChild(sep);
    }
    const box = document.createElement('div');
    box.className = 'er-group';
    for (const item of group.items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.glyph;
      btn.title = item.title;
      btn.dataset.tool = item.tool || '';
      btn.dataset.action = item.action || '';
      btn.addEventListener('click', () => {
        if (item.tool) onTool?.(item.tool);
        else onAction?.(item.action);
      });
      box.appendChild(btn);
      buttons.set(item.tool || 'act:' + item.action, btn);
    }
    rail.appendChild(box);
  });

  const inspect = document.createElement('div');
  inspect.id = 'editinspect';
  inspect.hidden = true;

  document.body.appendChild(rail);
  document.body.appendChild(inspect);

  let current = null;

  function setTool(tool) {
    for (const [key, btn] of buttons) {
      if (key.startsWith('act:')) continue;
      btn.classList.toggle('on', key === tool);
    }
  }

  function setHistory(canUndo, canRedo) {
    buttons.get('act:undo').disabled = !canUndo;
    buttons.get('act:redo').disabled = !canRedo;
  }

  function setSelection(entry) {
    current = entry;
    if (!entry) { inspect.hidden = true; return; }
    const b = bounds(entry.points);
    const c = centroid(entry.points);
    inspect.innerHTML =
      `<div class="ei-top"><b>${esc(entry.label)}</b><span>${esc(entry.bucket === 'pitches' ? 'Site' : entry.kind || entry.bucket)}</span></div>` +
      `<dl>` +
      `<dt>Centre</dt><dd>${m(c.x)}, ${m(c.y)} m</dd>` +
      `<dt>Extent</dt><dd>${m(b.w)} × ${m(b.d)} m</dd>` +
      `<dt>Area</dt><dd>${Math.round(areaM2(entry.points))} m²</dd>` +
      (entry.shapeable ? '' : '<dt>Shape</dt><dd>parametric</dd>') +
      `</dl>` +
      (entry.bucket === 'pitches'
        ? `<div class="ei-lib"><span>Building</span><select id="ei-dwelling">` +
          `<option value=""${entry.occupied ? '' : ' selected'}>— empty —</option>` +
          dwellingOptions(entry) +
          `</select></div>`
        : '') +
      `<div class="ei-actions">` +
      `<button type="button" data-act="turn-15">−15°</button>` +
      `<button type="button" data-act="turn+15">+15°</button>` +
      `<button type="button" data-act="duplicate" class="wide">Duplicate</button>` +
      `<button type="button" data-act="delete" class="wide">Delete</button>` +
      `</div>`;
    inspect.hidden = false;
    for (const btn of inspect.querySelectorAll('[data-act]')) {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'turn-15') onAction?.('rotate', -Math.PI / 12);
        else if (act === 'turn+15') onAction?.('rotate', Math.PI / 12);
        else onAction?.(act);
      });
    }
    const lib = inspect.querySelector('#ei-dwelling');
    lib?.addEventListener('change', () => onAction?.('dwelling', lib.value));
  }

  function hint(tool) {
    return HINTS[tool] || HINTS.select;
  }

  return {
    element: rail,
    setTool, setSelection, setHistory, hint,
    get selection() { return current; },
  };
}
