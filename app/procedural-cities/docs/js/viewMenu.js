// viewMenu.js — the hover dropdown that replaces the two top-right selects.
//
// One button, one panel, three groups: render style, camera, and the ground
// grid. It opens on hover, on focus and on click, so a mouse gets it for free
// and a keyboard still can; Escape closes it. Like the rail it owns no scene
// state and no page state, so the city page can adopt it as-is.

const RENDER = [
  ['solid', 'Solid'],
  ['clay', 'Clay'],
  ['wire', 'Wire'],
  ['blueprint', 'Blueprint'],
  ['ink', 'Ink'],
];

const VIEWS = [
  ['fit', 'Fit'],
  ['iso', 'Iso'],
  ['top', 'Top'],
  ['aerial', 'Aerial'],
  ['street', 'Street'],
];

const CSS = `
#viewmenu { position: relative; }
#viewmenu > .vm-btn {
  padding: 5px 9px; background: #1b2427; color: #7fc7a8;
  border: 1px solid #3f6d5c; border-radius: 4px;
  font: inherit; font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; cursor: pointer;
}
#viewmenu > .vm-btn:hover, #viewmenu.open > .vm-btn { background: #22302f; }

#vm-panel {
  position: absolute; right: 0; top: 100%; width: 208px;
  padding: 8px 9px 9px; margin-top: 7px;
  background: rgba(14, 20, 22, 0.97); border: 1px solid #243035;
  border-radius: 6px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
  display: none; z-index: 40;
}
/* The gap between button and panel would break a plain :hover, so bridge it. */
#vm-panel::before { content: ''; position: absolute; left: 0; right: 0; top: -8px; height: 8px; }
#viewmenu:hover #vm-panel,
#viewmenu.open #vm-panel,
#viewmenu:focus-within #vm-panel { display: block; }

#vm-panel h3 {
  font-size: 9px; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase; color: #88959b; margin: 2px 0 5px;
}
#vm-panel .vm-group + .vm-group { margin-top: 9px; padding-top: 8px; border-top: 1px solid #1e2a2d; }
#vm-panel .vm-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
#vm-panel .vm-chips button {
  padding: 4px 6px; background: #1a2326; color: #88959b;
  border: 1px solid #243035; border-radius: 3px;
  font: inherit; font-size: 10px; cursor: pointer; text-align: left;
}
#vm-panel .vm-chips button:hover { color: #d5dde0; border-color: #33443f; }
#vm-panel .vm-chips button.on { color: #0d1214; background: #7fc7a8; border-color: #7fc7a8; }
#vm-panel .vm-check {
  display: flex; align-items: center; gap: 7px; margin-top: 9px;
  padding-top: 8px; border-top: 1px solid #1e2a2d;
  font-size: 10.5px; color: #aab6bb; cursor: pointer;
}
#vm-panel .vm-check input { accent-color: #7fc7a8; }
`;

function injectStyles() {
  if (document.getElementById('viewmenu-style')) return;
  const style = document.createElement('style');
  style.id = 'viewmenu-style';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function createViewMenu({ onRender, onView, onGrid } = {}) {
  injectStyles();

  const root = document.createElement('div');
  root.id = 'viewmenu';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vm-btn';
  btn.textContent = 'View ▾';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'View and render options');

  const panel = document.createElement('div');
  panel.id = 'vm-panel';

  const groups = [];
  const chips = new Map();

  function group(title, items, kind) {
    const box = document.createElement('div');
    box.className = 'vm-group';
    const h = document.createElement('h3');
    h.textContent = title;
    const list = document.createElement('div');
    list.className = 'vm-chips';
    for (const [value, label] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.value = value;
      b.addEventListener('click', () => {
        mark(kind, value);
        if (kind === 'render') onRender?.(value);
        else onView?.(value);
      });
      list.appendChild(b);
      chips.set(kind + ':' + value, b);
    }
    box.append(h, list);
    groups.push(box);
    return box;
  }

  panel.append(
    group('Render', RENDER, 'render'),
    group('Camera', VIEWS, 'view'),
  );

  const check = document.createElement('label');
  check.className = 'vm-check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = true;
  box.addEventListener('change', () => onGrid?.(box.checked));
  check.append(box, document.createTextNode('Ground grid'));
  panel.appendChild(check);

  root.append(btn, panel);

  function mark(kind, value) {
    for (const [key, el] of chips) {
      if (!key.startsWith(kind + ':')) continue;
      el.classList.toggle('on', key === kind + ':' + value);
    }
  }

  btn.addEventListener('click', () => {
    const open = root.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !root.classList.contains('open')) return;
    root.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });

  // Sit to the left of the Rules button, which is the last thing in the bar.
  const bar = document.getElementById('viewbar');
  (bar || document.body).prepend(root);

  return {
    element: root,
    gridInput: box,
    setRender: value => mark('render', value),
    setView: value => mark('view', value),
    setGrid: on => { box.checked = !!on; },
  };
}
