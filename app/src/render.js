import * as G from './geom.js';

const PALETTES = {
  blueprint: {
    bg: '#071c30',
    grid: 'rgba(110,190,240,0.06)',
    border: '#7fd4ff',
    buffer: 'rgba(70,150,210,0.10)',
    paper: '#082540',
    lawn: 'rgba(60,200,165,0.10)',
    lawnSoft: 'rgba(60,200,165,0.055)',
    garden: 'rgba(120,220,140,0.10)',
    dog: 'rgba(210,220,120,0.09)',
    plaza: 'rgba(150,200,240,0.14)',
    gardenEdge: 'rgba(130,230,170,0.35)',
    roadFill: '#0d3350',
    roadEdge: 'rgba(140,215,255,0.5)',
    roadDash: 'rgba(170,225,255,0.35)',
    siteRvf: 'rgba(120,200,255,0.06)',
    siteRvs: 'rgba(130,210,255,0.45)',
    siteTinyf: 'rgba(255,205,120,0.07)',
    siteTinys: 'rgba(255,205,120,0.45)',
    pad: 'rgba(160,215,255,0.10)',
    padEdge: 'rgba(160,220,255,0.22)',
    roofRvf: 'rgba(120,205,255,0.20)',
    roofRvs: 'rgba(150,225,255,0.8)',
    roofTinyf: 'rgba(255,205,120,0.24)',
    roofTinys: 'rgba(255,210,130,0.85)',
    bldg: 'rgba(255,205,120,0.20)',
    bldgEdge: '#ffd178',
    deck: 'rgba(150,210,245,0.10)',
    water: 'rgba(90,215,255,0.42)',
    waterEdge: 'rgba(160,235,255,0.9)',
    canopy: 'rgba(70,215,175,0.16)',
    canopyEdge: 'rgba(110,235,195,0.55)',
    fence: 'rgba(150,215,250,0.45)',
    text: '#cdeeff',
    dim: 'rgba(165,215,245,0.55)',
    num: 'rgba(215,242,255,0.9)',
    accent: '#ffd178',
    frame: 'rgba(140,215,255,0.55)',
    label: '#c4e9ff',
    labelDim: 'rgba(175,220,250,0.7)',
    amenity: 'rgba(150,190,255,0.10)',
    amenityEdge: 'rgba(165,205,255,0.45)',
    power: '#ffb066',
    waterLine: '#59d4ff',
    sewerLine: '#9ed86e',
    equip: 'rgba(255,176,102,0.10)',
    equipEdge: 'rgba(255,190,120,0.65)',
  },
  plan: {
    bg: '#f7f4ea',
    grid: 'rgba(120,110,90,0.07)',
    border: '#6b6353',
    buffer: 'rgba(150,190,140,0.20)',
    paper: '#f1eddf',
    lawn: 'rgba(150,196,130,0.38)',
    lawnSoft: 'rgba(160,200,140,0.22)',
    garden: 'rgba(198,205,120,0.38)',
    dog: 'rgba(205,195,135,0.38)',
    plaza: 'rgba(222,208,182,0.65)',
    gardenEdge: 'rgba(120,140,80,0.55)',
    roadFill: '#dcd8ce',
    roadEdge: 'rgba(110,105,95,0.4)',
    roadDash: 'rgba(120,115,105,0.45)',
    siteRvf: 'rgba(238,226,164,0.65)',
    siteRvs: 'rgba(150,135,80,0.5)',
    siteTinyf: 'rgba(226,234,192,0.75)',
    siteTinys: 'rgba(120,140,90,0.5)',
    pad: 'rgba(214,209,199,0.9)',
    padEdge: 'rgba(150,145,135,0.45)',
    roofRvf: 'rgba(206,182,158,0.95)',
    roofRvs: '#8a7860',
    roofTinyf: 'rgba(198,124,94,0.9)',
    roofTinys: '#8a5a44',
    bldg: 'rgba(216,192,152,0.95)',
    bldgEdge: '#6f6250',
    deck: 'rgba(218,209,194,0.95)',
    water: 'rgba(143,206,220,0.95)',
    waterEdge: '#5c8f99',
    canopy: 'rgba(122,172,107,0.6)',
    canopyEdge: 'rgba(88,128,78,0.85)',
    fence: 'rgba(110,100,85,0.5)',
    text: '#3d372d',
    dim: 'rgba(80,72,60,0.6)',
    num: 'rgba(60,54,44,0.92)',
    accent: '#a2603c',
    frame: 'rgba(90,82,68,0.6)',
    label: '#403a30',
    labelDim: 'rgba(70,62,50,0.8)',
    amenity: 'rgba(206,200,180,0.55)',
    amenityEdge: 'rgba(120,110,92,0.45)',
    power: '#b8621f',
    waterLine: '#2f7f96',
    sewerLine: '#6b8a3e',
    equip: 'rgba(184,98,31,0.10)',
    equipEdge: 'rgba(140,92,50,0.55)',
  },
};

const FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const n1 = (v) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderPlan(plan, opts = {}) {
  const P = PALETTES[opts.theme] || PALETTES.blueprint;
  const W = plan.width;
  const H = plan.height;
  const M = 72;
  const titleTop = H + 64;
  const titleH = 114;
  const sheetH = titleTop + titleH + 26;
  const vbW = W + 2 * M;
  const sPlan = Math.max(3.6, Math.min(13, Math.min(W, H) / 88));
  const sTitle = Math.max(6.2, Math.min(16, vbW / 96));
  const sSmall = sPlan * 0.82;
  const layers = Object.assign({ power: true, water: true, sewer: true }, opts.layers || {});
  const out = [];

  const planTitle = `Tiny-home village site plan — ${plan.stats.sites} spaces on ${plan.stats.acres} acres`;
  const planDesc = `Schematic ${(plan.patternLabel || 'village')} plan with ${plan.stats.parking} parking stalls, a community core, garden beds and utility runs. Not for construction.`;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${n1(vbW)} ${n1(M + sheetH)}" ` +
      `width="${n1(vbW)}" height="${n1(M + sheetH)}" font-family="${FONT}" shape-rendering="geometricPrecision" ` +
      `role="img" aria-labelledby="plan-svg-title plan-svg-desc">`,
    `<title id="plan-svg-title">${esc(planTitle)}</title>`,
    `<desc id="plan-svg-desc">${esc(planDesc)}</desc>`
  );

  // ---------------- defs ---------------------------------------------------
  const grid = Math.max(10, Math.round(Math.min(W, H) / 26));
  out.push(`<defs>
    <pattern id="grid" width="${grid}" height="${grid}" patternUnits="userSpaceOnUse">
      <path d="M${grid},0H0V${grid}" fill="none" stroke="${P.grid}" stroke-width="1"/>
    </pattern>
    <pattern id="beds" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="${P.gardenEdge}" stroke-width="1.1"/>
    </pattern>
    <pattern id="glass" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M0,8L8,0" stroke="${P.bldgEdge}" stroke-width="0.7" opacity="0.55"/>
    </pattern>
    <pattern id="waterHatch" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M0,6Q3,3 6,6T12,6" fill="none" stroke="${P.waterEdge}" stroke-width="0.8" opacity="0.6"/>
    </pattern>
  </defs>`);

  // ---------------- sheet --------------------------------------------------
  out.push(`<rect x="${-M}" y="${-M}" width="${n1(vbW)}" height="${n1(M + sheetH)}" fill="${P.bg}"/>`);
  out.push(`<rect x="${-M}" y="${-M}" width="${n1(vbW)}" height="${n1(M + sheetH)}" fill="url(#grid)"/>`);
  out.push(
    `<rect x="${n1(-M + 16)}" y="${n1(-M + 16)}" width="${n1(vbW - 32)}" height="${n1(M + sheetH - 32)}" ` +
      `fill="none" stroke="${P.frame}" stroke-width="0.8" opacity="0.5"/>`
  );

  // parcel ground + buffer band
  out.push(`<path d="M0,0H${W}V${H}H0Z M${plan.buffer},${plan.buffer}H${W - plan.buffer}V${H - plan.buffer}H${plan.buffer}Z"
    fill="${P.buffer}" fill-rule="evenodd"/>`);
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${P.paper}" opacity="0.55"/>`);
  out.push(`<rect x="${plan.buffer}" y="${plan.buffer}" width="${W - plan.buffer * 2}" height="${H - plan.buffer * 2}" fill="${P.paper}"/>`);

  // ---------------- greens -------------------------------------------------
  for (const g of plan.greens) {
    const fill =
      g.kind === 'garden' ? P.garden : g.kind === 'dog' ? P.dog : g.kind === 'plaza' ? P.plaza :
      g.kind === 'lawn' ? P.lawn : g.kind === 'amenity' ? P.amenity : P.lawnSoft;
    out.push(`<rect x="${n1(g.x)}" y="${n1(g.y)}" width="${n1(g.w)}" height="${n1(g.h)}" fill="${fill}"/>`);
  }
  for (const b of plan.beds) {
    out.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" fill="url(#beds)" stroke="${P.gardenEdge}" stroke-width="0.6"/>`);
  }
  for (const p of plan.parking) {
    out.push(`<rect x="${n1(p.x)}" y="${n1(p.y)}" width="${n1(p.w)}" height="${n1(p.h)}" fill="${P.pad}" stroke="${P.padEdge}" stroke-width="0.8"/>`);
    if (p.aisle) {
      out.push(`<rect x="${n1(p.aisle.x)}" y="${n1(p.aisle.y)}" width="${n1(p.aisle.w)}" height="${n1(p.aisle.h)}" fill="${P.roadFill}" stroke="none" opacity="0.85"/>`);
    }
    for (const st of p.stalls) {
      out.push(`<rect x="${n1(st.x)}" y="${n1(st.y)}" width="${n1(st.w)}" height="${n1(st.h)}" fill="none" stroke="${P.padEdge}" stroke-width="0.6"/>`);
    }
    if (p.aisle) {
      out.push(txt(p.aisle.x + p.aisle.w / 2, p.aisle.y + p.aisle.h / 2 + 2, `${p.label.toUpperCase()} · ${p.count}`, {
        size: Math.max(3, Math.min(5.4, p.aisle.h * 0.24)),
        fill: P.labelDim, anchor: 'middle', ls: 0.5, rot: p.aisle.w < 40 ? 90 : 0,
      }));
    }
  }

  // ---------------- roads: vehicles vs walking ------------------------------
  // car streets are paved, with a centreline; foot lanes and paths are a lighter
  // surface with a broken edge, and bike routes are marked with a dashed line
  const carRoads = plan.roads.filter((rd) => rd.mode !== 'walk');
  const walkRoads = plan.roads.filter((rd) => rd.mode === 'walk');
  for (const rd of carRoads) {
    const d = pathD(rd.pts, rd.closed);
    out.push(`<path d="${d}" fill="none" stroke="${P.roadEdge}" stroke-width="${rd.w + 3.5}" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>`);
  }
  for (const rd of carRoads) {
    const d = pathD(rd.pts, rd.closed);
    out.push(`<path d="${d}" fill="none" stroke="${P.roadFill}" stroke-width="${rd.w}" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  for (const rd of carRoads) {
    if (rd.kind === 'entry') continue;
    const d = pathD(rd.pts, rd.closed);
    out.push(`<path d="${d}" fill="none" stroke="${P.roadDash}" stroke-width="0.8" stroke-dasharray="9 9" stroke-linecap="round"/>`);
  }
  // bike route: a dashed line set inside the carriageway of the loop drive
  for (const rd of carRoads) {
    if (!rd.bike) continue;
    const lane = shiftPath(rd.pts, rd.w * 0.3);
    out.push(`<path d="${pathD(lane, rd.closed)}" fill="none" stroke="${P.labelDim}" stroke-width="1.2" stroke-dasharray="5 4" stroke-linecap="round" opacity="0.6"/>`);
  }
  // foot lanes: a lighter surface, broken edge, no centreline
  for (const rd of walkRoads) {
    const d = pathD(rd.pts, rd.closed);
    out.push(`<path d="${d}" fill="none" stroke="${P.padEdge}" stroke-width="${rd.w + 2}" stroke-linejoin="round" stroke-linecap="round" opacity="0.45" stroke-dasharray="5 4"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${P.pad}" stroke-width="${rd.w}" stroke-linejoin="round" stroke-linecap="round" opacity="0.95"/>`);
  }

  // ---------------- paths --------------------------------------------------
  for (const p of plan.paths) {
    const dash = p.kind === 'trail' ? '6 5' : p.kind === 'walk' ? '3 4' : null;
    out.push(`<path d="${pathD(p.pts, false)}" fill="none" stroke="${P.pad}" stroke-width="${p.w}" stroke-linecap="round" opacity="0.9"` +
      `${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
  }

  // ---------------- sites --------------------------------------------------
  for (const s of plan.sites) {
    const tiny = s.kind === 'tiny';
    out.push(`<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" fill="${tiny ? P.siteTinyf : P.siteRvf}" stroke="${tiny ? P.siteTinys : P.siteRvs}" stroke-width="0.8"/>`);
    out.push(`<rect x="${n1(s.pad.x)}" y="${n1(s.pad.y)}" width="${n1(s.pad.w)}" height="${n1(s.pad.h)}" fill="${P.pad}" stroke="${P.padEdge}" stroke-width="0.6"/>`);
    if (s.stall) {
      out.push(`<rect x="${n1(s.stall.x)}" y="${n1(s.stall.y)}" width="${n1(s.stall.w)}" height="${n1(s.stall.h)}" fill="none" stroke="${P.padEdge}" stroke-width="0.45" stroke-dasharray="2 1.6"/>`);
    }
    out.push(`<rect x="${n1(s.home.x)}" y="${n1(s.home.y)}" width="${n1(s.home.w)}" height="${n1(s.home.h)}" fill="${tiny ? P.roofTinyf : P.roofRvf}" stroke="${tiny ? P.roofTinys : P.roofRvs}" stroke-width="0.9"/>`);
    // ridge line
    if (tiny) {
      out.push(`<line x1="${n1(s.home.x)}" y1="${n1(s.home.y + s.home.h / 2)}" x2="${n1(s.home.x + s.home.w)}" y2="${n1(s.home.y + s.home.h / 2)}" stroke="${P.roofTinys}" stroke-width="0.5" opacity="0.7"/>`);
    }
    const horizontal = s.front === 'n' || s.front === 's';
    const frontage = horizontal ? s.w : s.h;
    const lx = s.front === 'e' ? s.x + s.w - 4 : s.front === 'w' ? s.x + 4 : s.x + s.w / 2;
    const ly = s.front === 's' ? s.y + s.h - 3.4 : s.front === 'n' ? s.y + 6.6 : s.y + s.h / 2;
    out.push(txt(lx, ly, String(s.num), {
      size: Math.max(3.2, Math.min(6.2, frontage * 0.2)),
      fill: P.num, anchor: 'middle', rot: horizontal ? 0 : 90, opacity: 0.9,
    }));
  }

  // ---------------- utilities ----------------------------------------------
  drawServices(out, plan, P, layers);

  // ---------------- trees --------------------------------------------------
  for (const t of plan.trees) {
    out.push(`<circle cx="${n1(t.x)}" cy="${n1(t.y)}" r="${n1(t.r)}" fill="${P.canopy}" stroke="${P.canopyEdge}" stroke-width="${t.kind === 'orchard' ? 0.7 : 0.9}"/>`);
    if (t.kind !== 'orchard') {
      out.push(`<circle cx="${n1(t.x)}" cy="${n1(t.y)}" r="${n1(t.r * 0.55)}" fill="none" stroke="${P.canopyEdge}" stroke-width="0.6" opacity="0.55"/>`);
    }
  }

  // ---------------- buildings ----------------------------------------------
  for (const b of plan.buildings) {
    if (b.deck) {
      out.push(`<rect x="${n1(b.deck.x)}" y="${n1(b.deck.y)}" width="${n1(b.deck.w)}" height="${n1(b.deck.h)}" fill="${P.deck}" stroke="${P.padEdge}" stroke-width="0.7"/>`);
    }
    if (b.water) {
      out.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" fill="${P.water}" stroke="${P.waterEdge}" stroke-width="1"/>`);
      out.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" fill="url(#waterHatch)" opacity="0.8"/>`);
    } else if (b.kind === 'greenhouse') {
      out.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" fill="url(#glass)" stroke="${P.bldgEdge}" stroke-width="1.1"/>`);
    } else if (b.open) {
      out.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" fill="${P.bldg}" opacity="0.35" stroke="${P.bldgEdge}" stroke-width="1.2"/>`);
      const corners = G.rectPoints(b);
      for (const [cx, cy] of corners) {
        out.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="1.5" fill="${P.bldgEdge}"/>`);
      }
    } else {
      out.push(`<rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" fill="${P.bldg}" stroke="${P.bldgEdge}" stroke-width="1.2"/>`);
      out.push(`<line x1="${n1(b.x + b.w * 0.18)}" y1="${n1(b.y + b.h / 2)}" x2="${n1(b.x + b.w * 0.82)}" y2="${n1(b.y + b.h / 2)}" stroke="${P.bldgEdge}" stroke-width="0.6" opacity="0.45"/>`);
    }
    if (b.label) {
      const teamRot = b.h > b.w * 1.7 ? 90 : 0;
      const size = Math.max(3.4, Math.min(7.4, Math.min(b.w, b.h) * 0.2));
      out.push(txt(b.x + b.w / 2, b.y + b.h / 2 + size * 0.34, b.label.toUpperCase(), {
        size, fill: P.label, anchor: 'middle', rot: teamRot, ls: 0.4,
      }));
    }
  }

  // ---------------- fences -------------------------------------------------
  for (const f of plan.fences) {
    if (f.kind === 'perimeter') continue;
    const r = f.rect;
    out.push(`<rect x="${n1(r.x)}" y="${n1(r.y)}" width="${n1(r.w)}" height="${n1(r.h)}" fill="none" stroke="${P.fence}" stroke-width="1.1" stroke-dasharray="6 4"/>`);
  }

  // ---------------- plan labels -------------------------------------------
  for (const g of plan.greens) {
    if (!g.label) continue;
    const size = Math.max(4, Math.min(9, Math.min(g.w, g.h) * 0.12));
    out.push(txt(g.x + g.w / 2, g.y + g.h - size * 0.9, g.label.toUpperCase(), {
      size, fill: P.labelDim, anchor: 'middle', ls: 0.6,
    }));
  }
  for (const rd of plan.roads) {
    if (rd.kind !== 'lane' || !rd.name) continue;
    const [a, b] = rd.pts;
    const t = 0.22;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const vertical = Math.abs(a[0] - b[0]) < 1;
    out.push(txt(vertical ? x - 2.4 : x, vertical ? y : y - 2.4, rd.name.toUpperCase(), {
      size: Math.max(3.2, Math.min(6, Math.min(W, H) / 150)),
      fill: P.labelDim, anchor: 'middle', ls: 0.8, rot: vertical ? 90 : 0,
    }));
  }
  for (const l of plan.labels) {
    out.push(txt(l.x, l.y, l.text, {
      size: l.size === 'lg' ? sPlan : sSmall, fill: P.accent, weight: 600,
      anchor: l.anchor || 'start', rot: l.rot || 0, ls: 1,
    }));
  }

  // ---------------- property line ------------------------------------------
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${P.border}" stroke-width="1.4" stroke-dasharray="16 7 3 7" opacity="0.85"/>`);

  // ---------------- dimensions --------------------------------------------
  const dimY = H + 34;
  const dimX = -34;
  out.push(dimLine([[0, dimY], [W, dimY]], ftLabel(W), P, sPlan, 0));
  out.push(dimLine([[dimX, 0], [dimX, H]], ftLabel(H), P, sPlan, -90));
  out.push(`<line x1="0" y1="${H + 6}" x2="0" y2="${dimY + 7}" stroke="${P.dim}" stroke-width="0.7"/>`);
  out.push(`<line x1="${W}" y1="${H + 6}" x2="${W}" y2="${dimY + 7}" stroke="${P.dim}" stroke-width="0.7"/>`);
  out.push(`<line x1="${-6}" y1="0" x2="${dimX - 7}" y2="0" stroke="${P.dim}" stroke-width="0.7"/>`);
  out.push(`<line x1="${-6}" y1="${H}" x2="${dimX - 7}" y2="${H}" stroke="${P.dim}" stroke-width="0.7"/>`);
  out.push(txt(W / 2, dimY - 7, ftLabel(W), { size: sPlan, fill: P.text, anchor: 'middle', ls: 0.5 }));
  out.push(txt(dimX - 7, H / 2, ftLabel(H), { size: sPlan, fill: P.text, anchor: 'middle', rot: -90, ls: 0.5 }));
  out.push(txt(0, H + 22, 'PROPERTY LINE', { size: sSmall * 0.9, fill: P.labelDim, anchor: 'start', ls: 1.2 }));

  // ---------------- north arrow --------------------------------------------
  const naX = W + M - 44;
  const naY = -M + 46;
  const nr = 16;
  out.push(`<g>
    <circle cx="${naX}" cy="${naY}" r="${nr}" fill="none" stroke="${P.frame}" stroke-width="1"/>
    <path d="M${naX},${naY - nr + 3} L${naX + 6},${naY + nr - 4} L${naX},${naY + nr - 8} L${naX - 6},${naY + nr - 4} Z" fill="${P.accent}" opacity="0.9"/>
    <path d="M${naX - 8},${naY + nr + 8} L${naX},${naY + nr + 2} L${naX + 8},${naY + nr + 8}" fill="none" stroke="${P.labelDim}" stroke-width="0.8" opacity="0.35"/>
  </g>`);
  out.push(txt(naX, naY + nr + 22, 'N', { size: sPlan * 1.1, fill: P.label, anchor: 'middle', weight: 600 }));

  // ---------------- scale bar ---------------------------------------------
  const barTarget = Math.max(20, W / 6);
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const barFt = nice.reduce((best, v) => (Math.abs(v - barTarget) < Math.abs(best - barTarget) ? v : best), nice[0]);
  const bx = 0;
  const by = -M + 46;
  const bh = 7;
  for (let i = 0; i < 4; i++) {
    const segW = barFt / 4;
    out.push(`<rect x="${n1(bx + i * segW)}" y="${by}" width="${n1(segW)}" height="${bh}" fill="${i % 2 ? 'none' : P.labelDim}" stroke="${P.labelDim}" stroke-width="0.7" opacity="${i % 2 ? 0.9 : 0.55}"/>`);
  }
  out.push(txt(bx, by - 5, '0', { size: sSmall * 0.9, fill: P.labelDim, anchor: 'middle' }));
  out.push(txt(bx + barFt, by - 5, `${barFt} FT`, { size: sSmall * 0.9, fill: P.labelDim, anchor: 'middle' }));
  out.push(txt(bx, by + bh + sSmall + 2, 'GRAPHIC SCALE', { size: sSmall * 0.85, fill: P.labelDim, ls: 0.8 }));

  // ---------------- title block -------------------------------------------
  out.push(titleBlock(plan, P, W, titleTop, titleH, sTitle));

  out.push('</svg>');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// offset a polyline to one side, used for bike lane markings
function shiftPath(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    out.push([pts[i][0] - (dy / len) * d, pts[i][1] + (dx / len) * d]);
  }
  return out;
}

function pathD(pts, closed) {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${n1(p[0])},${n1(p[1])}`).join(' ');
  return closed ? `${d} Z` : d;
}

function dimLine([[x1, y1], [x2, y2]], label, P, s, rot) {
  const tick = 4;
  const horiz = y1 === y2;
  const parts = [];
  parts.push(`<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" stroke="${P.dim}" stroke-width="0.7"/>`);
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    parts.push(
      horiz
        ? `<line x1="${n1(x)}" y1="${n1(y - tick)}" x2="${n1(x)}" y2="${n1(y + tick)}" stroke="${P.dim}" stroke-width="1.2"/>`
        : `<line x1="${n1(x - tick)}" y1="${n1(y)}" x2="${n1(x + tick)}" y2="${n1(y)}" stroke="${P.dim}" stroke-width="1.2"/>`
    );
  }
  if (label && rot === 0) {
    parts.push(txt((x1 + x2) / 2, y1 - 7, label, { size: s, fill: P.text, anchor: 'middle', ls: 0.5 }));
  }
  return `<g>${parts.join('')}</g>`;
}

function ftLabel(v) {
  return `${Math.round(v)}'-0"`;
}

function txt(x, y, str, o = {}) {
  const size = o.size ?? 6;
  const attrs = [
    `x="${n1(x)}"`, `y="${n1(y)}"`, `font-size="${n1(size)}"`,
    `fill="${o.fill || '#fff'}"`,
  ];
  if (o.anchor) attrs.push(`text-anchor="${o.anchor}"`);
  if (o.weight) attrs.push(`font-weight="${o.weight}"`);
  if (o.ls) attrs.push(`letter-spacing="${o.ls}"`);
  if (o.opacity != null) attrs.push(`opacity="${o.opacity}"`);
  if (o.rot) attrs.push(`transform="rotate(${o.rot} ${n1(x)} ${n1(y)})"`);
  return `<text ${attrs.join(' ')}>${esc(str)}</text>`;
}

function titleBlock(plan, P, W, y, h, s) {
  const pads = s * 1.2;
  const parts = [];
  parts.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${P.paper}" stroke="${P.frame}" stroke-width="1.2"/>`);
  const c1 = W * 0.44;
  const c2 = W * 0.73;
  parts.push(`<line x1="${n1(c1)}" y1="${y}" x2="${n1(c1)}" y2="${y + h}" stroke="${P.frame}" stroke-width="0.8" opacity="0.6"/>`);
  parts.push(`<line x1="${n1(c2)}" y1="${y}" x2="${n1(c2)}" y2="${y + h}" stroke="${P.frame}" stroke-width="0.8" opacity="0.6"/>`);

  parts.push(txt(pads, y + s * 2.1, 'TINY HOME VILLAGE', { size: s * 1.5, fill: P.text, weight: 700, ls: 2.2 }));
  if (!plan.patternLabel) plan.patternLabel = '';
  parts.push(txt(pads, y + s * 3.9, 'PROCEDURAL SITE PLAN  ·  SCHEMATIC', { size: s * 0.85, fill: P.labelDim, ls: 1.4 }));
  parts.push(txt(pads, y + s * 5.7, `${ftLabel(plan.width)} × ${ftLabel(plan.height)}  ·  ${plan.stats.acres} AC`, { size: s * 0.95, fill: P.text, ls: 0.5 }));
  parts.push(txt(pads, y + s * 7.3, `SEED  ${plan.seed.toUpperCase()}`, { size: s * 0.85, fill: P.accent, ls: 0.8 }));
  parts.push(txt(pads, y + s * 8.6, new Date().toISOString().slice(0, 10), { size: s * 0.75, fill: P.labelDim, ls: 0.6 }));

  const x2 = c1 + pads;
  parts.push(txt(x2, y + s * 2.1, 'PROGRAMME', { size: s * 0.8, fill: P.labelDim, ls: 1.2 }));
  const st = plan.stats;
  const util = st.utilities || { power: '—', water: '—', sewer: '—' };
  const pop = st.population || { residents: 0, guests: 0, peak: 0 };
  const lines = [
    `${st.sites} LOTS   (${st.rv} RV / ${st.tiny} TINY)`,
    `${(plan.patternLabel || '').toUpperCase()}  ·  ${st.density} LOTS/AC`,
    `${pop.residents} RESIDENTS  ·  ${pop.peak} PEAK WITH GUESTS`,
    `${st.visitorStalls} VISITOR + ${st.residentStalls} RESIDENT STALLS`,
    `${st.buildings} BUILDINGS  ·  ${st.beds} BEDS  ·  ${st.trees} TREES`,
    `PWR ${util.power.toUpperCase()} · WTR ${util.water.toUpperCase()} · SWR ${util.sewer.toUpperCase()}`,
  ];
  lines.forEach((line, i) => {
    parts.push(txt(x2, y + s * (3.3 + i * 1.12), line, {
      size: s * (i === 2 ? 0.74 : i === 5 ? 0.6 : 0.8),
      fill: i === 2 || i === 5 ? P.accent : P.text,
      ls: 0.3,
    }));
  });

  const x3 = c2 + pads;
  const legend = [
    ['RV PAD', P.roofRvf],
    ['TINY HOME', P.roofTinyf],
    ['COMMUNITY', P.bldg],
    ['GARDEN', P.garden],
    ['WATER', P.water],
    ['PLANTING', P.canopy],
    ['CAR ROAD', P.roadFill],
    ['WALK / BIKE', P.pad],
  ];
  legend.forEach(([label, colour], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = x3 + col * (W * 0.125);
    const ly = y + s * (2.6 + row * 1.9);
    parts.push(`<rect x="${n1(lx)}" y="${n1(ly - s * 0.7)}" width="${n1(s * 0.9)}" height="${n1(s * 0.9)}" fill="${colour}" stroke="${P.frame}" stroke-width="0.5"/>`);
    parts.push(txt(lx + s * 1.5, ly, label, { size: s * 0.7, fill: P.labelDim, ls: 0.4 }));
  });
  return `<g>${parts.join('')}</g>`;
}

// ---------------------------------------------------------------------------
// Services: trunk alignments beside the pavement, a service stub per lot, and
// the equipment the chosen configuration needs.
const LAYER_ORDER = [
  ['sewer', 'sewerLine', '2 3'],
  ['water', 'waterLine', '9 3'],
  ['power', 'power', '7 4'],
];

function drawServices(out, plan, P, layers) {
  if (!plan.utilities) return;
  for (const [layer, key, dash] of LAYER_ORDER) {
    const u = plan.utilities[layer];
    if (!u || !layers[layer]) continue;
    const colour = P[key];
    for (const run of u.runs || []) {
      out.push(`<path d="${pathD(run.pts, run.closed)}" fill="none" stroke="${colour}" stroke-width="1.1" stroke-dasharray="${dash}" stroke-linecap="round" opacity="0.8"/>`);
      if (layer === 'sewer') {
        for (const [vx, vy] of run.pts) {
          out.push(`<circle cx="${n1(vx)}" cy="${n1(vy)}" r="1.9" fill="${colour}" opacity="0.7"/>`);
        }
      }
    }
    for (const stub of u.stubs || []) {
      out.push(
        `<path d="M${n1(stub[0][0])},${n1(stub[0][1])}L${n1(stub[1][0])},${n1(stub[1][1])}" ` +
          `stroke="${colour}" stroke-width="0.75" opacity="0.45"/>`
      );
    }
    if (u.inlet) {
      out.push(`<circle cx="${n1(u.inlet.x)}" cy="${n1(u.inlet.y)}" r="3.4" fill="none" stroke="${colour}" stroke-width="1.1"/>`);
      out.push(txt(u.inlet.x, u.inlet.y - 6, layer.toUpperCase(), { size: 4.2, fill: colour, anchor: 'middle', ls: 0.8 }));
    }
  }
  for (const [layer, key] of LAYER_ORDER) {
    const u = plan.utilities[layer];
    if (!u || !layers[layer]) continue;
    for (const node of u.nodes || []) drawNode(out, node, P, P[key]);
  }
}

function drawNode(out, b, P, colour) {
  const { x, y, w, h } = b;
  out.push(`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${P.equip}" stroke="${colour}" stroke-width="0.9"/>`);
  if (b.kind === 'panel') {
    const rows = Math.max(2, Math.floor(h / 7));
    for (let i = 1; i < rows; i++) {
      const yy = y + (h / rows) * i;
      out.push(`<line x1="${n1(x + 2)}" y1="${n1(yy)}" x2="${n1(x + w - 2)}" y2="${n1(yy)}" stroke="${colour}" stroke-width="0.5" opacity="0.6"/>`);
    }
  } else if (b.kind === 'tank') {
    const n = Math.max(2, Math.min(4, Math.round(w / 14)));
    const r = Math.min(h * 0.5 - 2, (w / n) * 0.33);
    for (let i = 0; i < n; i++) {
      out.push(`<circle cx="${n1(x + (w / n) * (i + 0.5))}" cy="${n1(y + h / 2)}" r="${n1(r)}" fill="none" stroke="${colour}" stroke-width="0.8"/>`);
    }
  } else if (b.kind === 'field') {
    out.push(`<rect x="${n1(x + 1.5)}" y="${n1(y + 1.5)}" width="${n1(w - 3)}" height="${n1(h - 3)}" fill="none" stroke="${colour}" stroke-width="0.7" stroke-dasharray="5 3"/>`);
    const rows = Math.max(2, Math.floor(h / 6));
    for (let i = 1; i < rows; i++) {
      const yy = y + (h / rows) * i;
      out.push(`<line x1="${n1(x + 2)}" y1="${n1(yy)}" x2="${n1(x + w - 2)}" y2="${n1(yy)}" stroke="${colour}" stroke-width="0.4" opacity="0.5" stroke-dasharray="3 4"/>`);
    }
  } else {
    out.push(`<line x1="${n1(x + 2)}" y1="${n1(y + 2)}" x2="${n1(x + w - 2)}" y2="${n1(y + h - 2)}" stroke="${colour}" stroke-width="0.6" opacity="0.65"/>`);
    out.push(`<line x1="${n1(x + w - 2)}" y1="${n1(y + 2)}" x2="${n1(x + 2)}" y2="${n1(y + h - 2)}" stroke="${colour}" stroke-width="0.6" opacity="0.65"/>`);
  }
  if (b.label && w > 22 && h > 9) {
    const size = Math.max(3.2, Math.min(5.6, Math.min(w, h) * 0.18));
    out.push(txt(b.x + b.w / 2, b.y + b.h / 2 + size * 0.34, b.label.toUpperCase(), {
      size, fill: P.label, anchor: 'middle', rot: h > w * 1.6 ? 90 : 0, ls: 0.3,
    }));
  }
}
