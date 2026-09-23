// Cartes mentales : arbre de notions dessiné en SVG, 3 dispositions (carte, arbre, organigramme),
// branches colorées, zoom à la molette, déplacement à la souris, branches repliables d'un clic.
import * as ui from './ui.js';

const { el } = ui;
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  kids.flat().forEach((k) => k && n.append(k));
  return n;
};

export const LAYOUTS = { mindmap: 'Carte', tree: 'Arbre', org: 'Organigramme' };
const HUES = [193, 262, 36, 150, 330, 215, 12, 170];
const MAX_NODES = 150;

let current = null; // { data, card, svg, view, seg, layout }
let lastData = null;

// ---------- Données ----------
let uid = 0;
function normalizeNode(n, depth = 0, count = { v: 0 }) {
  if (count.v >= MAX_NODES) return null;
  count.v++;
  if (typeof n === 'string') n = { label: n };
  const label = String(n?.label ?? n?.name ?? n?.title ?? n?.text ?? '').trim().slice(0, 90) || '…';
  const kids = Array.isArray(n?.children) ? n.children : Array.isArray(n?.nodes) ? n.nodes : [];
  return {
    id: `n${++uid}`,
    label,
    note: String(n?.note || n?.detail || '').slice(0, 200),
    collapsed: depth >= 3 && kids.length > 0, // les niveaux profonds démarrent repliés
    children: depth < 6 ? kids.map((k) => normalizeNode(k, depth + 1, count)).filter(Boolean) : [],
  };
}

export function normalize(raw = {}) {
  const rootRaw = raw.root || { label: raw.title || raw.topic || 'Sujet', children: raw.children || raw.branches || [] };
  const root = normalizeNode(rootRaw);
  root.collapsed = false;
  return { title: String(raw.title || root.label).slice(0, 120), root, layout: LAYOUTS[raw.layout] ? raw.layout : 'mindmap' };
}

// ---------- Mesure du texte ----------
const measureCtx = document.createElement('canvas').getContext('2d');
function wrap(label, font, maxW) {
  measureCtx.font = font;
  const words = label.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (measureCtx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = `${shown[2].replace(/\s*\S*$/, '')}…`;
  const width = Math.max(...shown.map((l) => measureCtx.measureText(l).width));
  return { lines: shown, width };
}

function sizeNodes(node, depth = 0) {
  const fs = depth === 0 ? 20 : depth === 1 ? 16 : 14;
  const font = `${depth <= 1 ? 600 : 500} ${fs}px Inter, system-ui, sans-serif`;
  const { lines, width } = wrap(node.label, font, depth === 0 ? 240 : 200);
  const lh = Math.round(fs * 1.3);
  Object.assign(node, { depth, fs, font, lines, lh, w: Math.ceil(width) + (depth === 0 ? 40 : 28), h: lines.length * lh + (depth === 0 ? 28 : 18) });
  if (!node.collapsed) node.children.forEach((c) => sizeNodes(c, depth + 1));
}

const visibleKids = (n) => (n.collapsed ? [] : n.children);

// ---------- Placement ----------
// Arbre horizontal : x par niveau, y selon la place occupée par chaque sous-arbre.
function layoutHorizontal(root, kidsOf, dir = 1, xGap = 70, yGap = 14) {
  const levelW = [];
  const measure = (n) => { levelW[n.depth] = Math.max(levelW[n.depth] || 0, n.w); kidsOf(n).forEach(measure); };
  measure(root);
  const levelX = [0];
  for (let d = 1; d < levelW.length; d++) levelX[d] = levelX[d - 1] + (levelW[d - 1] + levelW[d]) / 2 + xGap;
  const span = (n) => { const k = kidsOf(n); n.span = k.length ? Math.max(n.h, k.reduce((s, c) => s + span(c), 0) + yGap * (k.length - 1)) : n.h; return n.span; };
  span(root);
  const place = (n, top) => {
    n.x = dir * levelX[n.depth];
    n.y = top + n.span / 2;
    let t = top + (n.span - (kidsOf(n).reduce((s, c) => s + c.span, 0) + yGap * Math.max(0, kidsOf(n).length - 1))) / 2;
    kidsOf(n).forEach((c) => { place(c, t); t += c.span + yGap; });
  };
  place(root, -root.span / 2);
}

// Organigramme : niveaux de haut en bas.
function layoutVertical(root, xGap = 22, yGap = 60) {
  const levelH = [];
  const measure = (n) => { levelH[n.depth] = Math.max(levelH[n.depth] || 0, n.h); visibleKids(n).forEach(measure); };
  measure(root);
  const levelY = [0];
  for (let d = 1; d < levelH.length; d++) levelY[d] = levelY[d - 1] + (levelH[d - 1] + levelH[d]) / 2 + yGap;
  const span = (n) => { const k = visibleKids(n); n.span = k.length ? Math.max(n.w, k.reduce((s, c) => s + span(c), 0) + xGap * (k.length - 1)) : n.w; return n.span; };
  span(root);
  const place = (n, left) => {
    n.y = levelY[n.depth];
    n.x = left + n.span / 2;
    const k = visibleKids(n);
    let l = left + (n.span - (k.reduce((s, c) => s + c.span, 0) + xGap * Math.max(0, k.length - 1))) / 2;
    k.forEach((c) => { place(c, l); l += c.span + xGap; });
  };
  place(root, -root.span / 2);
}

// Carte mentale : branches réparties à droite et à gauche du sujet central.
function layoutMindmap(root) {
  const kids = visibleKids(root);
  const weight = (n) => 1 + visibleKids(n).reduce((s, c) => s + weight(c), 0);
  const right = []; const left = [];
  let wr = 0; let wl = 0;
  kids.forEach((c) => { const w = weight(c); if (wr <= wl) { right.push(c); wr += w; } else { left.push(c); wl += w; } });
  const side = (list, dir) => {
    const fake = { ...root, children: list, collapsed: false };
    layoutHorizontal(fake, (n) => (n === fake ? list : visibleKids(n)), dir);
    return fake.y;
  };
  const yr = side(right, 1); const yl = side(left, -1);
  // Recentre chaque côté verticalement sur le sujet.
  const shift = (list, dy) => { const go = (n) => { n.y -= dy; visibleKids(n).forEach(go); }; list.forEach(go); };
  shift(right, yr); shift(left, yl);
  root.x = 0; root.y = 0;
}

// ---------- Dessin ----------
function draw() {
  if (!current) return;
  const { data, svg } = current;
  const root = data.root;
  sizeNodes(root);
  // Couleur de branche héritée du premier niveau.
  root.hue = 193;
  visibleKids(root).forEach((c, i) => { const paint = (n) => { n.hue = HUES[i % HUES.length]; n.children.forEach(paint); }; paint(c); });
  if (data.layout === 'org') layoutVertical(root);
  else if (data.layout === 'tree') layoutHorizontal(root, visibleKids, 1);
  else layoutMindmap(root);

  const links = svgEl('g', { class: 'mm-links' });
  const nodes = svgEl('g', { class: 'mm-nodes' });
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  let order = 0;
  const walk = (n, parent) => {
    minX = Math.min(minX, n.x - n.w / 2); maxX = Math.max(maxX, n.x + n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2); maxY = Math.max(maxY, n.y + n.h / 2);
    if (parent) {
      let d;
      if (data.layout === 'org') {
        const y1 = parent.y + parent.h / 2; const y2 = n.y - n.h / 2; const my = (y1 + y2) / 2;
        d = `M${parent.x},${y1} C${parent.x},${my} ${n.x},${my} ${n.x},${y2}`;
      } else {
        const dir = n.x >= parent.x ? 1 : -1;
        const x1 = parent.x + (dir * parent.w) / 2; const x2 = n.x - (dir * n.w) / 2; const mx = (x1 + x2) / 2;
        d = `M${x1},${parent.y} C${mx},${parent.y} ${mx},${n.y} ${x2},${n.y}`;
      }
      links.append(svgEl('path', { d, class: 'mm-link', style: `--h:${n.hue};--i:${order}`, 'stroke-width': Math.max(1.5, 4 - n.depth) }));
    }
    const hasKids = n.children.length > 0;
    const g = svgEl('g', {
      class: `mm-node depth-${Math.min(n.depth, 3)}${hasKids ? ' has-kids' : ''}${n.collapsed ? ' collapsed' : ''}`,
      transform: `translate(${n.x - n.w / 2},${n.y - n.h / 2})`, style: `--h:${n.hue};--i:${order++}`,
      tabindex: hasKids ? '0' : null, role: hasKids ? 'button' : null,
      'aria-label': hasKids ? `${n.label} (${n.collapsed ? 'déplier' : 'replier'})` : null,
    },
    svgEl('rect', { width: n.w, height: n.h, rx: n.depth === 0 ? n.h / 2 : 10, class: 'mm-box' }),
    svgEl('text', { x: n.w / 2, y: (n.h - n.lines.length * n.lh) / 2 + n.lh * 0.78, 'text-anchor': 'middle', style: `font:${n.font}` },
      n.lines.map((l, i) => svgEl('tspan', { x: n.w / 2, dy: i ? n.lh : 0 }, document.createTextNode(l)))));
    if (n.note) g.append(svgEl('title', {}, document.createTextNode(n.note)));
    if (hasKids && n.collapsed) {
      const bx = data.layout === 'org' ? n.w / 2 : (n.x >= 0 ? n.w + 4 : -24);
      const by = data.layout === 'org' ? n.h + 4 : n.h / 2 - 10;
      g.append(svgEl('g', { class: 'mm-badge', transform: `translate(${bx - (data.layout === 'org' ? 10 : 0)},${by})` },
        svgEl('rect', { width: 20, height: 20, rx: 10 }),
        svgEl('text', { x: 10, y: 14, 'text-anchor': 'middle' }, document.createTextNode(`+${n.children.length}`))));
    }
    if (hasKids) {
      const toggle = (e) => { e.stopPropagation(); if (current.dragged) return; n.collapsed = !n.collapsed; draw(); };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
    }
    nodes.append(g);
    visibleKids(n).forEach((c) => walk(c, n));
  };
  walk(root, null);
  svg.replaceChildren(svgEl('g', { class: 'mm-world' }, links, nodes));
  current.bounds = { x: minX - 40, y: minY - 40, w: maxX - minX + 80, h: maxY - minY + 80 };
  if (!current.view || current.refit) { fit(); current.refit = false; } else applyView();
  current.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === data.layout)));
}

// ---------- Vue : zoom et déplacement ----------
function applyView() {
  const { svg, view } = current;
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
}
export function fit() {
  if (!current) return;
  const { svg, bounds } = current;
  const r = svg.getBoundingClientRect();
  const ar = (r.width || 800) / (r.height || 500);
  let w = bounds.w; let h = bounds.h;
  if (w / h > ar) h = w / ar; else w = h * ar;
  current.view = { x: bounds.x - (w - bounds.w) / 2, y: bounds.y - (h - bounds.h) / 2, w, h };
  applyView();
}

function bindView(svg) {
  let start = null;
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { view } = current;
    const r = svg.getBoundingClientRect();
    const k = Math.exp(e.deltaY * 0.0015);
    const px = view.x + ((e.clientX - r.left) / r.width) * view.w;
    const py = view.y + ((e.clientY - r.top) / r.height) * view.h;
    const nw = Math.min(Math.max(view.w * k, current.bounds.w / 8), current.bounds.w * 6);
    const kk = nw / view.w;
    current.view = { x: px - (px - view.x) * kk, y: py - (py - view.y) * kk, w: view.w * kk, h: view.h * kk };
    applyView();
  }, { passive: false });
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, view: { ...current.view }, id: e.pointerId };
    current.dragged = false;
  });
  svg.addEventListener('pointermove', (e) => {
    if (!start) return;
    const r = svg.getBoundingClientRect();
    const dx = ((e.clientX - start.x) / r.width) * start.view.w;
    const dy = ((e.clientY - start.y) / r.height) * start.view.h;
    // On ne « capture » le pointeur qu'une fois le déplacement commencé : un simple clic reste un clic sur la branche.
    if (!current.dragged && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 4) {
      current.dragged = true;
      svg.classList.add('panning');
      try { svg.setPointerCapture(start.id); } catch { /* ignore */ }
    }
    if (!current.dragged) return;
    current.view = { ...start.view, x: start.view.x - dx, y: start.view.y - dy };
    applyView();
  });
  const end = () => { start = null; svg.classList.remove('panning'); setTimeout(() => { if (current) current.dragged = false; }, 0); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('dblclick', () => fit());
  new ResizeObserver(() => { if (current?.svg === svg) fit(); }).observe(svg);
}

// ---------- API ----------
export const hasMindmap = () => !!current?.card?.isConnected;
export const canRestore = () => !hasMindmap() && !!lastData;

export function show(raw, { expand = true, place = '' } = {}) {
  const data = raw.root?.id ? raw : normalize(raw);
  if (hasMindmap()) ui.removeCard(current.card);
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Disposition de la carte' },
    Object.entries(LAYOUTS).map(([k, label]) => el('button', { type: 'button', 'data-layout': k, 'aria-pressed': 'false', onclick: () => update({ layout: k }) }, label)));
  const svg = svgEl('svg', { class: 'mm-svg', role: 'img', 'aria-label': `Carte mentale : ${data.title}` });
  const bar = el('div', { class: 'tbar' },
    el('p', { class: 'tsub' }, 'Molette : zoom · glisser : déplacer · clic sur une branche : replier/déplier · double-clic : recentrer'),
    el('div', { class: 'mm-tools' }, seg,
      el('button', { type: 'button', class: 'chip', onclick: () => update({ expandAll: true }) }, 'Tout déplier'),
      el('button', { type: 'button', class: 'chip', onclick: () => fit() }, 'Recentrer')));
  const card = ui.card(data.title, el('div', { class: 'mm-content' }, bar, el('div', { class: 'mm-stage' }, svg)), { icon: '🧠', place, kind: 'mindmap' });
  card.classList.add('mindmap-card');
  current = { data, card, svg, seg, view: null, refit: true };
  lastData = data;
  bindView(svg);
  if (expand) ui.expandCard(card);
  requestAnimationFrame(() => draw());
  return data;
}

export function update(u = {}) {
  if (!hasMindmap()) {
    if (u.restore && lastData) { show(lastData); return 'Voici la dernière carte mentale.'; }
    return '';
  }
  const { data } = current;
  if (u.close) { ui.removeCard(current.card, true); return 'Carte mentale fermée.'; }
  const all = (fn) => { const go = (n) => { fn(n); n.children.forEach(go); }; go(data.root); };
  if (u.layout && LAYOUTS[u.layout]) { data.layout = u.layout; current.refit = true; }
  if (u.expandAll) { all((n) => { n.collapsed = false; }); current.refit = true; }
  if (u.collapseAll) { all((n) => { n.collapsed = n !== data.root && n.children.length > 0; }); current.refit = true; }
  if (u.toggle) {
    const q = u.toggle.toLowerCase();
    let hit = null;
    all((n) => { if (!hit && n.label.toLowerCase().includes(q)) hit = n; });
    if (!hit) return `Je ne trouve pas « ${u.toggle} » dans la carte.`;
    hit.collapsed = u.open === true ? false : u.open === false ? true : !hit.collapsed;
  }
  draw();
  if (u.expand === true) ui.expandCard(current.card);
  if (u.expand === false) ui.collapseCard();
  requestAnimationFrame(() => fit());
  return '';
}

// Version compacte pour l'IA (pour qu'elle puisse enrichir la carte affichée).
export function describe() {
  if (!hasMindmap()) return '';
  const strip = (n) => ({ label: n.label, ...(n.children.length ? { children: n.children.map(strip) } : {}) });
  const json = JSON.stringify({ title: current.data.title, root: strip(current.data.root) });
  return json.length > 3500 ? `${json.slice(0, 3500)}…` : json;
}
