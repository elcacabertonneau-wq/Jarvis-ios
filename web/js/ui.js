// Affichage : journal de conversation, cartes de l'écran, visionneuse d'images.
import { renderMarkdown } from './markdown.js';
import { unregisterVideo } from './player.js';

const $ = (id) => document.getElementById(id);
const stage = () => $('stage');
const MAX_CARDS = 8;

export const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
};

// Joue l'animation de sortie (classe CSS) puis appelle done ; immédiat si l'utilisateur réduit les animations.
export function animateOut(node, cls, done) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !node.isConnected) return done();
  let finished = false;
  const end = () => { if (!finished) { finished = true; done(); } };
  // On ignore les animations des éléments enfants (images, barre de chargement…).
  const onEnd = (e) => { if (e.target === node) { node.removeEventListener('animationend', onEnd); end(); } };
  node.addEventListener('animationend', onEnd);
  setTimeout(end, 300);
  node.classList.add(cls);
}

export function setStatus(text) { $('status').textContent = text; }
const ORB_LABELS = { idle: 'En veille', wake: 'À l\'écoute de « Jarvis »', listening: 'Je vous écoute…', thinking: 'Réflexion…', speaking: 'Jarvis parle' };
export function setOrb(state) {
  $('orb').dataset.state = state;
  document.body.dataset.state = state;
  const label = $('orb-label');
  if (label) label.textContent = ORB_LABELS[state] || '';
  $('mic').classList.toggle('active', state === 'listening');
}
export function setLive(text, cls = '') { const l = $('live'); l.textContent = text; l.className = `live ${cls}`; }

export function log(role, text) {
  const box = $('log');
  const m = el('div', { class: `msg ${role}` }, text);
  box.append(m);
  while (box.children.length > 60) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

// ---------- Cartes ----------
const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>';
const ICON_EXPAND = '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z"/></svg>';
const ICON_MINIMIZE = '<svg viewBox="0 0 24 24"><path d="M5 17h14v2H5z"/></svg>';
const ICON_COLLAPSE = '<svg viewBox="0 0 24 24"><path d="M8 4h2v6H4V8h4V4zm6 0h2v4h4v2h-6V4zM4 14h6v6H8v-4H4v-2zm10 0h6v2h-4v4h-2v-6z"/></svg>';

// Crée une carte sur l'écran. `actions` : éléments ajoutés dans l'en-tête ; `keep` : ne disparaît pas toute seule.
export function card(title, body, { icon = '', actions = [], keep = false, place = '', kind = '' } = {}) {
  const minBtn = el('button', { class: 'icon-btn card-min', title: 'Réduire dans la barre', 'aria-label': 'Réduire dans la barre', html: ICON_MINIMIZE });
  const expandBtn = el('button', { class: 'icon-btn card-expand', title: 'Afficher en grand', 'aria-label': 'Afficher en grand', html: ICON_EXPAND });
  const closeBtn = el('button', { class: 'icon-btn card-close', title: 'Fermer', 'aria-label': 'Fermer', html: ICON_CLOSE });
  const c = el('article', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, `${icon ? `${icon} ` : ''}${title || ''}`), ...actions, minBtn, expandBtn, closeBtn),
    body);
  if (keep) c.dataset.keep = '1';
  if (kind) c.dataset.kind = kind;
  const pos = normalizePlace(place);
  if (pos) c.dataset.place = pos;
  c.dataset.icon = icon;
  c.append(el('span', { class: 'card-resize', title: 'Redimensionner', 'aria-hidden': 'true' }));
  bindFreeMove(c);
  minBtn.onclick = () => minimizeCard(c);
  expandBtn.onclick = () => (expanded === c ? collapseCard() : expandCard(c));
  closeBtn.onclick = () => removeCard(c, true);
  $('stage-empty').hidden = true;
  stage().prepend(c);
  const cards = stage().querySelectorAll('.card');
  for (let i = MAX_CARDS; i < cards.length; i++) removeCard(cards[i]);
  stage().scrollTop = 0;
  layoutStage();
  return c;
}

// ---------- Disposition libre (tableau de bord) ----------
// Positions : left, right, top, bottom, center et les 4 coins. Les cartes sont placées sur une grille
// sans être déplacées dans le DOM (une vidéo en cours ne redémarre pas).
export const PLACES = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const PLACE_ALIASES = {
  gauche: 'left', droite: 'right', haut: 'top', bas: 'bottom', centre: 'center', milieu: 'center', middle: 'center',
  'haut-gauche': 'top-left', 'haut-droite': 'top-right', 'bas-gauche': 'bottom-left', 'bas-droite': 'bottom-right',
  'left-top': 'top-left', 'right-top': 'top-right', 'left-bottom': 'bottom-left', 'right-bottom': 'bottom-right', full: 'center',
};
export function normalizePlace(p) {
  const k = String(p || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (PLACES.includes(k)) return k;
  return PLACE_ALIASES[k] || '';
}
const ROW_OF = (p) => (p.startsWith('top') ? 0 : p.startsWith('bottom') ? 2 : 1);
const COL_OF = (p) => (p.endsWith('left') ? 0 : p.endsWith('right') ? 2 : 1);

export function layoutStage() {
  const st = stage();
  const cards = [...st.querySelectorAll('.card:not(.leaving):not(.minimized):not([data-free])')];
  st.classList.toggle('has-free', !!st.querySelector('.card[data-free]:not(.minimized)'));
  const placed = cards.filter((c) => c.dataset.place);
  const active = placed.length > 0;
  st.classList.toggle('board', active);
  document.body.classList.toggle('board-mode', active);
  cards.forEach((c) => { c.style.gridRow = ''; c.style.gridColumn = ''; });
  if (!active) return;

  // Les cartes sans position vont au centre (ou à la suite de la rangée du milieu).
  const rows = [[], [], []];
  cards.forEach((c) => {
    const p = c.dataset.place || 'center';
    rows[ROW_OF(p)].push({ c, col: COL_OF(p), order: cards.indexOf(c) });
  });
  const used = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.length);
  // Hauteurs : la rangée du milieu est plus haute ; 12 colonnes pour répartir 1 à 4 cartes par rangée.
  st.style.gridTemplateRows = used.map(({ i }) => (i === 1 ? '1.35fr' : '1fr')).join(' ');
  used.forEach(({ r }, rowIdx) => {
    r.sort((a, b) => a.col - b.col || b.order - a.order);
    const n = Math.min(r.length, 4);
    const span = 12 / n;
    r.forEach((item, k) => {
      item.c.style.gridRow = String(rowIdx + 1);
      item.c.style.gridColumn = k < 4 ? `${k * span + 1} / span ${span}` : '';
    });
  });
}

// Déplace la carte la plus récente d'un type donné (ou une carte précise).
export function placeCard(target, place) {
  const pos = normalizePlace(place);
  const c = typeof target === 'string' ? findCardByKind(target) : target;
  if (!c || !pos) return false;
  // Si la place est déjà prise, les deux cartes échangent leurs positions.
  const other = [...stage().querySelectorAll('.card:not(.leaving)')].find((x) => x !== c && x.dataset.place === pos);
  if (other) { if (c.dataset.place) other.dataset.place = c.dataset.place; else delete other.dataset.place; }
  clearFree(c);
  c.dataset.place = pos;
  // Les autres cartes sans position prennent le centre : on leur donne une vraie place libre.
  layoutStage();
  return true;
}

export function swapCards(kindA, kindB) {
  const a = findCardByKind(kindA);
  const b = findCardByKind(kindB);
  if (!a || !b || a === b) return false;
  const pa = a.dataset.place || 'center';
  a.dataset.place = b.dataset.place || 'center';
  b.dataset.place = pa;
  layoutStage();
  return true;
}

export function resetLayout() {
  stage().querySelectorAll('.card').forEach((c) => { delete c.dataset.place; clearFree(c); clearStyle(c); });
  layoutStage();
}

// ---------- Placement libre : position et taille exactes (en % de l'écran de Jarvis) ----------
const clampPct = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, +v || 0));
export function setFree(c, { x, y, w, h }) {
  if (!c) return false;
  const W = clampPct(w ?? 40, 10, 100); const H = clampPct(h ?? 40, 8, 100);
  c.dataset.free = '1';
  delete c.dataset.place;
  Object.assign(c.style, {
    left: `${clampPct(x ?? 0, 0, 100 - W)}%`, top: `${clampPct(y ?? 0, 0, 100 - H)}%`,
    width: `${W}%`, height: `${H}%`, gridRow: '', gridColumn: '',
  });
  restoreCard(c);
  layoutStage();
  return true;
}
function clearFree(c) {
  if (!c.dataset.free) return;
  delete c.dataset.free;
  ['left', 'top', 'width', 'height', 'zIndex'].forEach((k) => { c.style[k] = ''; });
}
let zTop = 5;
function bindFreeMove(c) {
  const head = () => c.querySelector('.card-head');
  let drag = null;
  const onDown = (e, mode) => {
    if (e.button !== 0 || c.classList.contains('expanded') || matchMedia('(max-width: 820px)').matches) return;
    if (mode === 'move' && e.target.closest('button, a, input, select, .seg')) return;
    const st = stage().getBoundingClientRect();
    const r = c.getBoundingClientRect();
    if (!c.dataset.free) setFree(c, { x: ((r.left - st.left) / st.width) * 100, y: ((r.top - st.top + stage().scrollTop) / st.height) * 100, w: (r.width / st.width) * 100, h: (r.height / st.height) * 100 });
    c.style.zIndex = String(++zTop);
    drag = { mode, x: e.clientX, y: e.clientY, st, left: parseFloat(c.style.left), top: parseFloat(c.style.top), w: parseFloat(c.style.width), h: parseFloat(c.style.height) };
    c.classList.add('dragging');
    e.target.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!drag) return;
    const dx = ((e.clientX - drag.x) / drag.st.width) * 100;
    const dy = ((e.clientY - drag.y) / drag.st.height) * 100;
    if (drag.mode === 'move') {
      c.style.left = `${clampPct(drag.left + dx, 0, 100 - drag.w)}%`;
      c.style.top = `${clampPct(drag.top + dy, 0, 100 - drag.h)}%`;
    } else {
      c.style.width = `${clampPct(drag.w + dx, 12, 100 - drag.left)}%`;
      c.style.height = `${clampPct(drag.h + dy, 10, 100 - drag.top)}%`;
    }
  };
  const onUp = () => { if (drag) { drag = null; c.classList.remove('dragging'); } };
  requestAnimationFrame(() => {
    const h = head();
    h?.addEventListener('pointerdown', (e) => onDown(e, 'move'));
    h?.addEventListener('pointermove', onMove);
    h?.addEventListener('pointerup', onUp);
    const rz = c.querySelector('.card-resize');
    rz?.addEventListener('pointerdown', (e) => onDown(e, 'resize'));
    rz?.addEventListener('pointermove', onMove);
    rz?.addEventListener('pointerup', onUp);
  });
}

// ---------- Style d'une carte ----------
const COLORS = {
  rouge: 0, red: 0, orange: 28, or: 42, dore: 42, doré: 42, gold: 42, jaune: 52, yellow: 52, vert: 145, green: 145,
  turquoise: 172, cyan: 193, bleu: 215, blue: 215, indigo: 238, violet: 265, purple: 265, mauve: 285, rose: 330, pink: 330, magenta: 310,
};
export function colorToHue(v) {
  if (v == null) return null;
  const k = String(v).toLowerCase().trim();
  if (k in COLORS) return COLORS[k];
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(k);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (!d) return 200;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}
export function styleCard(c, { accent, background, size, title } = {}) {
  if (!c) return false;
  const hue = colorToHue(accent);
  if (hue != null) { c.style.setProperty('--card-h', hue); c.dataset.accent = '1'; }
  if (background) c.dataset.bg = ['glass', 'solid', 'transparent', 'glow', 'light'].includes(background) ? background : 'glass';
  if (size) c.dataset.size = ['small', 'normal', 'large', 'huge'].includes(size) ? size : 'normal';
  if (title) setCardTitle(c, title);
  return true;
}
function clearStyle(c) {
  delete c.dataset.accent; delete c.dataset.bg; delete c.dataset.size;
  c.style.removeProperty('--card-h');
}

export function findCardByKind(kind) {
  const kinds = String(kind || '').split('|');
  return [...stage().querySelectorAll('.card:not(.leaving)')].find((c) => kinds.includes(c.dataset.kind));
}

export function setCardTitle(c, text) { const h = c.querySelector('.card-head h3'); if (h) h.textContent = text; }

// L'accueil réapparaît dès qu'il n'y a plus de carte.
function updateWelcome() {
  const empty = !stage().querySelector('.card:not(.leaving):not(.minimized)');
  const w = $('stage-empty');
  if (empty && w.hidden) {
    w.hidden = false;
    // Relance les animations d'entrée de l'accueil.
    w.querySelectorAll('.suggest button').forEach((b) => { b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; });
  }
}

export function removeCard(c, animated = false) {
  if (!c?.isConnected) return;
  if (expanded === c) collapseCard();
  c.querySelectorAll('iframe').forEach((f) => unregisterVideo(f));
  c._onRemove?.(); // ex. : couper la caméra
  c._chip?.remove(); updateTray();
  const done = () => { c.remove(); updateWelcome(); layoutStage(); };
  if (animated) animateOut(c, 'leaving', done);
  else done();
}

// Vide l'écran ; avec `auto`, garde les cartes marquées (minuteur en cours, vidéo, configuration).
export function clearStage({ auto = false } = {}) {
  collapseCard();
  stage().querySelectorAll('.card').forEach((c) => { if (!auto || !c.dataset.keep) removeCard(c, true); });
}

export const hasCards = () => !!stage().querySelector('.card:not(.leaving)');
export const firstCard = () => stage().querySelector('.card:not(.leaving):not(.minimized)');

// ---------- Réduire dans la barre (minimiser) ----------
// La carte est masquée mais continue de vivre (vidéo, caméra, minuteur…) ; une pastille permet de la rouvrir.
function updateTray() {
  const tray = $('tray');
  tray.hidden = !tray.querySelector('.tray-chip:not(.tray-music)') && !$('dock').classList.contains('mini');
}

export function minimizeCard(c) {
  if (!c?.isConnected || c.classList.contains('minimized')) return false;
  if (expanded === c) collapseCard();
  c.classList.add('minimized');
  const title = c.querySelector('.card-head h3')?.textContent || 'Élément';
  c._chip = el('button', { class: 'tray-chip', type: 'button', title: `Rouvrir : ${title}`, onclick: () => restoreCard(c) },
    el('span', { class: 'tray-dot', 'aria-hidden': 'true' }), title.length > 34 ? `${title.slice(0, 33)}…` : title);
  $('tray').append(c._chip);
  updateTray();
  layoutStage();
  updateWelcome();
  return true;
}

export function restoreCard(c) {
  if (!c?.classList.contains('minimized')) return false;
  c.classList.remove('minimized');
  c._chip?.remove();
  c._chip = null;
  $('stage-empty').hidden = true;
  updateTray();
  layoutStage();
  return true;
}

const visibleCards = () => [...stage().querySelectorAll('.card:not(.leaving):not(.minimized)')];
const minimizedCards = () => [...stage().querySelectorAll('.card.minimized:not(.leaving)')];

export function minimizeAll() {
  const list = visibleCards();
  list.forEach(minimizeCard);
  return list.length;
}
export function restoreAll() {
  const list = minimizedCards();
  list.forEach(restoreCard);
  return list.length;
}
export function minimizeKind(kind) {
  const kinds = String(kind).split('|');
  const c = visibleCards().find((x) => kinds.includes(x.dataset.kind));
  return c ? minimizeCard(c) : false;
}
export function restoreKind(kind) {
  const kinds = String(kind).split('|');
  const c = minimizedCards().find((x) => kinds.includes(x.dataset.kind));
  return c ? restoreCard(c) : false;
}
export { updateTray };

// ---------- Affichage en grand ----------
let expanded = null;
let scrim = null;

function placeSpotlight() {
  const top = document.querySelector('.topbar').getBoundingClientRect().bottom + 16;
  const dock = $('dock');
  const tray = $('tray');
  const bottomEdge = (!tray.hidden ? tray : !dock.hidden && !dock.classList.contains('mini') ? dock : $('composer')).getBoundingClientRect().top;
  const root = document.documentElement.style;
  root.setProperty('--spot-top', `${Math.round(top)}px`);
  root.setProperty('--spot-bottom', `${Math.max(12, Math.round(innerHeight - bottomEdge + 12))}px`);
}
addEventListener('resize', () => { if (expanded) placeSpotlight(); });
new MutationObserver(() => { if (expanded) placeSpotlight(); }).observe($('dock'), { attributes: true, attributeFilter: ['hidden', 'class'] });
new MutationObserver(() => { if (expanded) placeSpotlight(); }).observe($('tray'), { attributes: true, attributeFilter: ['hidden'] });

export function expandCard(c) {
  if (!c?.isConnected) return false;
  restoreCard(c);
  if (expanded === c) return true;
  if (expanded) collapseCard();
  placeSpotlight();
  scrim = el('div', { class: 'scrim', onclick: () => collapseCard() });
  // Même contexte d'empilement que la carte (dans .layout), sinon le voile passerait par-dessus.
  document.querySelector('.layout').append(scrim);
  c.classList.add('expanded');
  const b = c.querySelector('.card-expand');
  if (b) { b.innerHTML = ICON_COLLAPSE; b.title = 'Réduire'; b.setAttribute('aria-label', 'Réduire'); }
  expanded = c;
  return true;
}

export function collapseCard() {
  if (!expanded) return false;
  const c = expanded;
  expanded = null;
  c.classList.remove('expanded');
  const b = c.querySelector('.card-expand');
  if (b) { b.innerHTML = ICON_EXPAND; b.title = 'Afficher en grand'; b.setAttribute('aria-label', 'Afficher en grand'); }
  const sc = scrim;
  scrim = null;
  if (sc) animateOut(sc, 'leaving', () => sc.remove());
  return true;
}
export const expandedCard = () => expanded;

export function describeStage() {
  return [...stage().querySelectorAll('.card:not(.leaving)')].slice(0, 6)
    .map((c) => `${c.querySelector('.card-head h3')?.textContent || ''}${c.dataset.kind ? ` [${c.dataset.kind}]` : ''}${c.dataset.place ? ` (position : ${c.dataset.place})` : ''}`)
    .join(' ; ');
}

export const loading = () => el('div', { class: 'loading-line' });

export function textCard(title, markdown, icon = '💬', place = '') {
  return card(title || 'Jarvis', el('div', { class: 'md', html: renderMarkdown(markdown) }), { icon, place, kind: 'text' });
}

export function errorCard(msg) {
  return card('Oups', el('p', {}, msg), { icon: '⚠️' });
}

export function gallery(items, onOpen) {
  return el('div', { class: 'gallery' }, items.map((it, i) =>
    el('figure', { onclick: () => onOpen(i), style: `--i:${Math.min(i, 7)}` },
      el('img', { src: it.thumb, alt: it.title || '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.closest('figure')?.remove() }),
      it.title ? el('figcaption', {}, it.title) : null)));
}

export function lightbox(items, start = 0) {
  let i = start;
  const img = el('img', { referrerpolicy: 'no-referrer' });
  const cap = el('p');
  const show = () => {
    const it = items[i];
    img.src = it.full || it.thumb;
    img.onerror = () => { img.onerror = null; img.src = it.thumb; };
    cap.innerHTML = '';
    cap.append(`${it.title || ''} `, it.source ? el('a', { href: it.source, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, '(source)') : '');
  };
  const box = el('div', { class: 'lightbox', role: 'dialog' }, img, cap);
  const close = (animated = true) => {
    document.removeEventListener('keydown', key);
    if (animated) animateOut(box, 'leaving', () => box.remove());
    else box.remove(); // action clavier : pas d'animation
  };
  const key = (e) => {
    if (e.key === 'Escape') close(false);
    if (e.key === 'ArrowRight') { i = (i + 1) % items.length; show(); }
    if (e.key === 'ArrowLeft') { i = (i - 1 + items.length) % items.length; show(); }
  };
  let x0 = null;
  box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) { i = (i + (dx < 0 ? 1 : -1) + items.length) % items.length; show(); e.preventDefault(); }
  });
  box.onclick = () => close();
  document.addEventListener('keydown', key);
  show();
  document.body.append(box);
}

export const chip = (label, onClick, href) => href
  ? el('a', { class: 'chip', href, target: '_blank', rel: 'noopener' }, label)
  : el('button', { class: 'chip', type: 'button', onclick: onClick }, label);

// ---------- Thème de l'interface (couleur d'accent, ambiance) ----------
export function applyTheme({ accent, background } = {}) {
  const root = document.documentElement.style;
  const hue = colorToHue(accent);
  if (hue != null) {
    const sat = hue >= 30 && hue <= 60 ? 95 : 100;
    root.setProperty('--c-700', `hsl(${hue}, 90%, 30%)`);
    root.setProperty('--c-600', `hsl(${hue}, 92%, 40%)`);
    root.setProperty('--c-500', `hsl(${hue}, ${sat}%, 58%)`);
    root.setProperty('--c-400', `hsl(${hue}, ${sat}%, 70%)`);
    root.setProperty('--c-300', `hsl(${hue}, ${sat}%, 82%)`);
    root.setProperty('--accent-h', hue);
  } else if (accent === 'default' || accent === 'reset') {
    ['--c-700', '--c-600', '--c-500', '--c-400', '--c-300', '--accent-h'].forEach((k) => root.removeProperty(k));
  }
  if (background) document.body.dataset.ambiance = ['aurora', 'dark', 'minimal', 'vivid'].includes(background) ? background : 'aurora';
  return hue;
}
