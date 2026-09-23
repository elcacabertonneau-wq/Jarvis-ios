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
const ICON_COLLAPSE = '<svg viewBox="0 0 24 24"><path d="M8 4h2v6H4V8h4V4zm6 0h2v4h4v2h-6V4zM4 14h6v6H8v-4H4v-2zm10 0h6v2h-4v4h-2v-6z"/></svg>';

// Crée une carte sur l'écran. `actions` : éléments ajoutés dans l'en-tête ; `keep` : ne disparaît pas toute seule.
export function card(title, body, { icon = '', actions = [], keep = false } = {}) {
  const expandBtn = el('button', { class: 'icon-btn card-expand', title: 'Afficher en grand', 'aria-label': 'Afficher en grand', html: ICON_EXPAND });
  const closeBtn = el('button', { class: 'icon-btn card-close', title: 'Fermer', 'aria-label': 'Fermer', html: ICON_CLOSE });
  const c = el('article', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, `${icon ? `${icon} ` : ''}${title || ''}`), ...actions, expandBtn, closeBtn),
    body);
  if (keep) c.dataset.keep = '1';
  expandBtn.onclick = () => (expanded === c ? collapseCard() : expandCard(c));
  closeBtn.onclick = () => removeCard(c, true);
  $('stage-empty').hidden = true;
  stage().prepend(c);
  const cards = stage().querySelectorAll('.card');
  for (let i = MAX_CARDS; i < cards.length; i++) removeCard(cards[i]);
  stage().scrollTop = 0;
  return c;
}

export function setCardTitle(c, text) { const h = c.querySelector('.card-head h3'); if (h) h.textContent = text; }

// L'accueil réapparaît dès qu'il n'y a plus de carte.
function updateWelcome() {
  const empty = !stage().querySelector('.card:not(.leaving)');
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
  const done = () => { c.remove(); updateWelcome(); };
  if (animated) animateOut(c, 'leaving', done);
  else done();
}

// Vide l'écran ; avec `auto`, garde les cartes marquées (minuteur en cours, vidéo, configuration).
export function clearStage({ auto = false } = {}) {
  collapseCard();
  stage().querySelectorAll('.card').forEach((c) => { if (!auto || !c.dataset.keep) removeCard(c, true); });
}

export const hasCards = () => !!stage().querySelector('.card:not(.leaving)');
export const firstCard = () => stage().querySelector('.card:not(.leaving)');

// ---------- Affichage en grand ----------
let expanded = null;
let scrim = null;

function placeSpotlight() {
  const top = document.querySelector('.topbar').getBoundingClientRect().bottom + 16;
  const dock = $('dock');
  const bottomEdge = (!dock.hidden ? dock : $('composer')).getBoundingClientRect().top;
  const root = document.documentElement.style;
  root.setProperty('--spot-top', `${Math.round(top)}px`);
  root.setProperty('--spot-bottom', `${Math.max(12, Math.round(innerHeight - bottomEdge + 12))}px`);
}
addEventListener('resize', () => { if (expanded) placeSpotlight(); });
new MutationObserver(() => { if (expanded) placeSpotlight(); }).observe($('dock'), { attributes: true, attributeFilter: ['hidden'] });

export function expandCard(c) {
  if (!c?.isConnected) return false;
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
  const titles = [...stage().querySelectorAll('.card:not(.leaving) .card-head h3')].slice(0, 3).map((h) => h.textContent);
  return titles.join(' ; ');
}

export const loading = () => el('div', { class: 'loading-line' });

export function textCard(title, markdown, icon = '💬') {
  return card(title || 'Jarvis', el('div', { class: 'md', html: renderMarkdown(markdown) }), { icon });
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
