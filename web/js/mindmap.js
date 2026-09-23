// Cartes mentales : arbre de notions dessiné en SVG, 3 dispositions (carte, arbre, organigramme),
// branches colorées, zoom à la molette, déplacement à la souris, branches repliables d'un clic.
import * as ui from './ui.js';
import { searchImages, wikiLookup } from './services.js';
import { settings } from './settings.js';

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
const safeImage = (u) => (typeof u === 'string' && /^(https:\/\/|data:image\/)/i.test(u) ? u : '');
const safeLink = (u) => (typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u) ? u : '');
const wikiURL = (label) => `https://${(settings.lang || 'fr').slice(0, 2)}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(label)}`;
// Taille des vignettes selon le niveau.
const IMG = [{ w: 170, h: 104 }, { w: 132, h: 80 }, { w: 100, h: 62 }, { w: 90, h: 56 }];
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
    image: safeImage(n?.image || n?.img),
    imageFull: safeImage(n?.image || n?.img),
    imageQuery: String(n?.image_query || n?.imageQuery || '').slice(0, 120),
    link: safeLink(n?.link || n?.url),
    linkLabel: String(n?.link_label || n?.linkLabel || '').slice(0, 60),
    wiki: !!n?.wiki,
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
  const pad = depth === 0 ? 28 : 18;
  const im = node.image ? IMG[Math.min(depth, 3)] : null;
  Object.assign(node, {
    depth, fs, font, lines, lh, im,
    w: Math.max(Math.ceil(width) + (depth === 0 ? 40 : 28), im ? im.w + 16 : 0),
    h: lines.length * lh + pad + (im ? im.h + 8 : 0),
  });
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

  const defs = svgEl('defs');
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
    svgEl('rect', { width: n.w, height: n.h, rx: n.depth === 0 ? (n.im ? 22 : n.h / 2) : 10, class: 'mm-box' }),
    svgEl('text', { x: n.w / 2, y: (n.im ? n.im.h + 8 : 0) + (n.h - (n.im ? n.im.h + 8 : 0) - n.lines.length * n.lh) / 2 + n.lh * 0.78, 'text-anchor': 'middle', style: `font:${n.font}` },
      n.lines.map((l, i) => svgEl('tspan', { x: n.w / 2, dy: i ? n.lh : 0 }, document.createTextNode(l)))));
    if (n.note) g.append(svgEl('title', {}, document.createTextNode(n.note)));
    if (n.im) {
      // Vignette arrondie ; clic = image en grand.
      const cid = `mmclip-${n.id}`;
      defs.append(svgEl('clipPath', { id: cid }, svgEl('rect', { x: 8, y: 8, width: n.w - 16, height: n.im.h, rx: 8 })));
      const img = svgEl('image', { href: n.image, x: 8, y: 8, width: n.w - 16, height: n.im.h, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${cid})`, class: 'mm-img' });
      img.addEventListener('error', () => { n.image = ''; n.im = null; draw(); }, { once: true });
      img.addEventListener('click', (e) => { e.stopPropagation(); if (!current.dragged) ui.lightbox([{ full: n.imageFull || n.image, thumb: n.image, title: n.label }]); });
      g.append(img);
    }
    if (n.link) {
      // Pastille 🔗 dans le coin : ouvre la source dans un nouvel onglet.
      const a = svgEl('g', { class: 'mm-linkbadge', transform: `translate(${n.w - 2},${2})`, role: 'link', tabindex: '0', 'aria-label': `Ouvrir le lien : ${n.linkLabel || n.link}` },
        svgEl('circle', { r: 10, cx: 0, cy: 0 }),
        svgEl('text', { x: 0, y: 4, 'text-anchor': 'middle' }, document.createTextNode('🔗')),
        svgEl('title', {}, document.createTextNode(n.linkLabel ? `${n.linkLabel} — ${n.link}` : n.link)));
      const open = (e) => { e.stopPropagation(); if (!current.dragged) window.open(n.link, '_blank', 'noopener'); };
      a.addEventListener('click', open);
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
      g.append(a);
    }
    // Clic droit (ou Maj+clic) : menu pour ajouter une image ou un lien à cette idée.
    g.addEventListener('contextmenu', (e) => { e.preventDefault(); openNodeMenu(n, e); });
    if (hasKids && n.collapsed) {
      const bx = data.layout === 'org' ? n.w / 2 : (n.x >= 0 ? n.w + 4 : -24);
      const by = data.layout === 'org' ? n.h + 4 : n.h / 2 - 10;
      g.append(svgEl('g', { class: 'mm-badge', transform: `translate(${bx - (data.layout === 'org' ? 10 : 0)},${by})` },
        svgEl('rect', { width: 20, height: 20, rx: 10 }),
        svgEl('text', { x: 10, y: 14, 'text-anchor': 'middle' }, document.createTextNode(`+${n.children.length}`))));
    }
    if (!hasKids) g.addEventListener('click', (e) => { if (e.shiftKey) { e.stopPropagation(); openNodeMenu(n, e); } });
    if (hasKids) {
      const toggle = (e) => { e.stopPropagation(); if (current.dragged) return; if (e.shiftKey) { openNodeMenu(n, e); return; } n.collapsed = !n.collapsed; draw(); };
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
    }
    nodes.append(g);
    visibleKids(n).forEach((c) => walk(c, n));
  };
  walk(root, null);
  svg.replaceChildren(defs, svgEl('g', { class: 'mm-world' }, links, nodes));
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

// ---------- Images et liens ----------
const allNodes = (root) => { const out = []; const go = (n) => { out.push(n); n.children.forEach(go); }; go(root); return out; };
export function findNode(label) {
  if (!current) return null;
  const q = String(label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(la |le |les |l')?(branche |idee |noeud |nœud )?/, '').trim();
  if (!q) return null;
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nodes = allNodes(current.data.root);
  return nodes.find((n) => norm(n.label) === q) || nodes.find((n) => norm(n.label).includes(q) || q.includes(norm(n.label)));
}

// Cherche une image pour chaque idée demandée (Wikimedia / Openverse), puis redessine.
async function addImages(targets) {
  const root = current.data.root;
  let done = 0;
  const lang = (settings.lang || 'fr').slice(0, 2);
  // 1) image de l'article Wikipédia correspondant (très pertinente), 2) recherche d'images classique.
  const fromWiki = async (q, l) => { const w = await wikiLookup(q, l).catch(() => null); return w?.image ? { thumb: w.image, full: w.image } : null; };
  await Promise.all(targets.slice(0, 16).map(async (n) => {
    const context = n === root ? n.label : `${n.label} ${root.label}`;
    // Les deux recherches partent en même temps ; l'image Wikipédia est préférée si elle existe.
    const wikiP = (async () => (n.imageQuery && await fromWiki(n.imageQuery, 'en'))
      || await fromWiki(context, lang)
      || (n !== root ? await fromWiki(n.label, lang) : null))();
    const searchP = searchImages(n.imageQuery || context).then((x) => x[0] || null).catch(() => null)
      .then((x) => x || (n !== root ? searchImages(n.label).then((y) => y[0] || null).catch(() => null) : null));
    const quick = await Promise.race([wikiP.catch(() => null), new Promise((res) => setTimeout(() => res(null), 2500))]);
    const hit = quick || await searchP;
    // Si Wikipédia répond plus tard, son image (plus pertinente) remplace la première.
    if (!quick) wikiP.then((w) => { if (w && current && n.image === hit?.thumb) { n.image = w.thumb; n.imageFull = w.full; draw(); } }).catch(() => {});
    if (!hit || !current) return;
    n.image = hit.thumb;
    n.imageFull = hit.full || hit.thumb;
    done++;
    draw();
  }));
  return done;
}
function addLinks(targets) {
  targets.forEach((n) => { if (!n.link) { n.link = wikiURL(n.label); n.linkLabel = 'Wikipédia'; } });
  return targets.length;
}

// Complète automatiquement une carte fraîchement créée : images demandées par l'IA et liens « wiki ».
async function autoEnrich() {
  const nodes = allNodes(current.data.root);
  nodes.filter((n) => n.wiki && !n.link).forEach((n) => { n.link = wikiURL(n.label); n.linkLabel = 'Wikipédia'; });
  const wanted = nodes.filter((n) => n.imageQuery && !n.image);
  if (nodes.some((n) => n.wiki)) draw();
  if (wanted.length) await addImages(wanted);
}

// Petit menu (clic droit sur une idée).
function openNodeMenu(n, e) {
  closeNodeMenu();
  const stage = current.svg.parentElement;
  const r = stage.getBoundingClientRect();
  const urlInput = el('input', { type: 'url', class: 'field', placeholder: 'https://…', value: n.link && !n.link.includes('wikipedia.org/wiki/Special:Search') ? n.link : '' });
  const file = el('input', { type: 'file', accept: 'image/*', hidden: '' });
  const act = (fn) => async () => { closeNodeMenu(); await fn(); draw(); };
  const menu = el('div', { class: 'mm-menu', role: 'menu', style: `left:${Math.min(e.clientX - r.left, r.width - 250)}px;top:${Math.min(e.clientY - r.top, r.height - 260)}px` },
    el('strong', {}, n.label),
    el('button', { type: 'button', role: 'menuitem', onclick: act(() => addImages([n])) }, '🖼️ Image automatique'),
    el('button', { type: 'button', role: 'menuitem', onclick: () => file.click() }, '📁 Image depuis mon ordinateur'),
    el('button', { type: 'button', role: 'menuitem', onclick: act(() => { n.link = wikiURL(n.label); n.linkLabel = 'Wikipédia'; }) }, '🔗 Lien Wikipédia'),
    el('div', { class: 'mm-menu-row' }, urlInput, el('button', { type: 'button', class: 'primary', onclick: act(() => { const u = safeLink(urlInput.value.trim()); if (u) { n.link = u; n.linkLabel = ''; } }) }, 'OK')),
    n.image ? el('button', { type: 'button', role: 'menuitem', onclick: act(() => { n.image = ''; n.imageFull = ''; }) }, '✖ Retirer l’image') : null,
    n.link ? el('button', { type: 'button', role: 'menuitem', onclick: act(() => { n.link = ''; }) }, '✖ Retirer le lien') : null,
    file);
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
    n.image = data; n.imageFull = data;
    closeNodeMenu();
    draw();
  };
  menu.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  stage.append(menu);
  current.menu = menu;
  setTimeout(() => addEventListener('pointerdown', closeNodeMenu, { once: true }), 0);
}
function closeNodeMenu() { current?.menu?.remove(); if (current) current.menu = null; }

// ---------- API ----------
export const hasMindmap = () => !!current?.card?.isConnected;
export const canRestore = () => !hasMindmap() && !!lastData;

export function show(raw, { expand = true, place = '' } = {}) {
  const data = raw.root?.id ? raw : normalize(raw);
  if (hasMindmap()) {
    // Quand l'IA réécrit la carte, on garde les images et liens déjà posés sur les idées de même nom.
    const old = new Map(allNodes(current.data.root).map((n) => [n.label.toLowerCase(), n]));
    allNodes(data.root).forEach((n) => {
      const o = old.get(n.label.toLowerCase());
      if (!o) return;
      if (!n.image && o.image) { n.image = o.image; n.imageFull = o.imageFull; }
      if (!n.link && o.link) { n.link = o.link; n.linkLabel = o.linkLabel; }
    });
    ui.removeCard(current.card);
  }
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
  requestAnimationFrame(() => { draw(); autoEnrich(); });
  return data;
}

export async function update(u = {}) {
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
  // Images et liens : toute la carte, les branches principales, ou une idée précise.
  const pick = (target) => {
    if (!target || target === 'all') return allNodes(data.root).filter((n) => n.depth <= 2);
    if (target === 'branches') return [data.root, ...data.root.children];
    const n = findNode(target);
    return n ? [n] : [];
  };
  let said = '';
  if (u.images) {
    const nodes = pick(u.images === true ? 'branches' : u.images);
    if (!nodes.length) return `Je ne trouve pas « ${u.images} » dans la carte.`;
    const n = await addImages(nodes);
    said = n ? (nodes.length > 1 ? `J'ai ajouté ${n} images.` : 'Image ajoutée.') : "Je n'ai pas trouvé d'image adaptée.";
  }
  if (u.links) {
    const nodes = pick(u.links === true ? 'all' : u.links);
    if (!nodes.length) return `Je ne trouve pas « ${u.links} » dans la carte.`;
    addLinks(nodes);
    said = `${said} ${nodes.length > 1 ? 'Liens ajoutés.' : 'Lien ajouté.'}`.trim();
  }
  if (u.customLink) {
    const n = findNode(u.customLink.target) || (u.customLink.target ? null : data.root);
    const url = safeLink(u.customLink.url);
    if (!n || !url) return "Je n'ai pas pu ajouter ce lien.";
    n.link = url; n.linkLabel = u.customLink.label || '';
    said = 'Lien ajouté.';
  }
  if (u.userImage) {
    const n = findNode(u.userImage.target) || data.root;
    if (!u.userImage.src) return "Envoyez-moi d'abord une image (bouton trombone, glisser-déposer ou Ctrl+V).";
    n.image = u.userImage.src; n.imageFull = u.userImage.src;
    said = 'Image placée.';
  }
  if (u.removeImages) allNodes(data.root).forEach((n) => { n.image = ''; n.imageFull = ''; n.imageQuery = ''; });
  if (u.removeLinks) allNodes(data.root).forEach((n) => { n.link = ''; });
  draw();
  if (u.images || u.userImage) current.refit = true;
  if (u.expand === true) ui.expandCard(current.card);
  if (u.expand === false) ui.collapseCard();
  requestAnimationFrame(() => fit());
  return said;
}

// Version compacte pour l'IA (pour qu'elle puisse enrichir la carte affichée).
export function describe() {
  if (!hasMindmap()) return '';
  const strip = (n) => ({ label: n.label, ...(n.image ? { image: true } : {}), ...(n.link ? { link: n.link.slice(0, 80) } : {}), ...(n.children.length ? { children: n.children.map(strip) } : {}) });
  const json = JSON.stringify({ title: current.data.title, root: strip(current.data.root) });
  return json.length > 3500 ? `${json.slice(0, 3500)}…` : json;
}
