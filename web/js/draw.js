// Dessin dans l'air : on trace avec l'index devant la caméra (ou au doigt / à la souris sur l'écran),
// puis l'IA transforme le croquis en schéma propre. Réutilise la vue plein écran de la réalité augmentée.
import * as ui from './ui.js';
import { loadHands, BONES, detect, fingersUp } from './hands.js';

const { el } = ui;
const COLORS = [['cyan', '#4fe0ff'], ['or', '#ffc95c'], ['rose', '#ff6fb5'], ['vert', '#6dff9e'], ['blanc', '#f4fbff'], ['violet', '#b28cff'], ['rouge', '#ff5a5a'], ['bleu', '#5a8dff'], ['jaune', '#fff35c'], ['orange', '#ff9d4d']];
const WIDTH = 6;

let S = null;

export const isOpen = () => !!S;
export const hasStrokes = () => !!S?.strokes.some((s) => s.pts.length > 1);
export const describe = () => (S ? `Mode dessin dans l'air ouvert (${S.strokes.length} trait${S.strokes.length > 1 ? 's' : ''} tracé${S.strokes.length > 1 ? 's' : ''})` : '');

const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;

export async function open({ onMic, onTransform } = {}) {
  if (S) return;
  const video = el('video', { class: 'ar-video', autoplay: '', playsinline: '', muted: '' });
  video.muted = true;
  const ink = el('canvas', { class: 'ar-3d draw-ink' });
  const overlay = el('canvas', { class: 'ar-hands', 'aria-hidden': 'true' });
  const hint = el('span', { class: 'ar-hint' }, 'Chargement du suivi des mains…');
  const caption = el('div', { class: 'ar-caption', 'aria-live': 'polite' });
  const swatch = el('span', { class: 'draw-swatch' });
  const btn = (label, ico, fn, extra = {}) => el('button', { type: 'button', class: 'ar-btn', title: label, 'aria-label': label, onclick: fn, ...extra }, ico);
  const tools = el('div', { class: 'ar-tools' },
    btn('Parler à Jarvis', '🎙️', () => onMic?.()),
    btn('Changer de couleur', swatch, () => setColor()),
    btn('Annuler le dernier trait', '↶', () => undo()),
    btn('Tout effacer', '🗑️', () => clear()),
    btn('Changer de caméra', '🔄', () => switchCamera()),
    btn('Aide', '❔', () => showHelp(true)));
  const transform = el('button', { type: 'button', class: 'draw-go', onclick: () => onTransform?.() }, '✨ Transformer en schéma');
  const root = el('div', { class: 'ar draw', role: 'dialog', 'aria-label': 'Dessin dans l’air' },
    video, ink, overlay,
    el('div', { class: 'ar-top' },
      el('div', { class: 'ar-head' }, el('span', { class: 'ar-badge' }, 'DESSIN'), el('span', { class: 'ar-title' }, 'Dessin dans l’air')),
      hint,
      el('button', { type: 'button', class: 'ar-btn ar-close', title: 'Fermer (Échap)', 'aria-label': 'Fermer le dessin', onclick: () => close() }, '✕')),
    caption, tools, transform);
  document.body.append(root);
  document.body.classList.add('ar-open');

  S = {
    root, video, ink, overlay, hint, caption, tools, swatch, transform,
    facing: isPhone() ? 'environment' : 'user', stream: null, hands: null,
    strokes: [], current: null, color: 0, cursor: null, pointing: 0, idle: 0, lastVideoTime: -1, raf: 0, alive: true,
  };
  const st = S;
  setColor(0);
  st.onKey = (e) => {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.matches('input, textarea')) { e.preventDefault(); undo(); }
  };
  document.addEventListener('keydown', st.onKey, true);
  st.onResize = () => resize();
  addEventListener('resize', st.onResize);
  resize();
  bindPointer();
  updateButton();
  if (!localStorage.getItem('jarvis.draw.help')) showHelp(true);
  startCamera().catch(() => setHint('Caméra indisponible : dessinez au doigt ou à la souris sur l’écran.'));
  loadHands().then((h) => { if (st.alive) { st.hands = h; setHint(idleHint()); } })
    .catch(() => { if (st.alive) setHint('Suivi des mains indisponible : dessinez au doigt ou à la souris.'); });
  st.raf = requestAnimationFrame(loop);
}

export function close() {
  if (!S) return;
  const st = S;
  S = null;
  st.alive = false;
  cancelAnimationFrame(st.raf);
  document.removeEventListener('keydown', st.onKey, true);
  removeEventListener('resize', st.onResize);
  st.stream?.getTracks().forEach((t) => t.stop());
  document.body.classList.remove('ar-open');
  ui.animateOut(st.root, 'leaving', () => st.root.remove());
}

async function startCamera() {
  const st = S;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
  st.stream?.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: st.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  if (!st.alive) { stream.getTracks().forEach((t) => t.stop()); return; }
  st.stream = stream;
  st.video.srcObject = stream;
  st.video.classList.toggle('mirror', st.facing === 'user');
  st.root.classList.add('has-video');
  await st.video.play().catch(() => {});
}

export async function switchCamera() {
  if (!S) return;
  S.facing = S.facing === 'user' ? 'environment' : 'user';
  try { await startCamera(); } catch { S.facing = S.facing === 'user' ? 'environment' : 'user'; await startCamera().catch(() => {}); }
}

function resize() {
  const st = S;
  const w = st.root.clientWidth || innerWidth;
  const h = st.root.clientHeight || innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  for (const c of [st.ink, st.overlay]) {
    const r = c === st.overlay ? 1 : dpr; // le squelette des mains n'a pas besoin de la pleine résolution
    c.width = Math.round(w * r);
    c.height = Math.round(h * r);
    c.getContext('2d').setTransform(r, 0, 0, r, 0, 0);
  }
  redraw();
}

// ---------- Traits ----------
function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) { ctx.lineTo(pts[0].x + 0.1, pts[0].y); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

// Halo lumineux sans ombre floue (shadowBlur est très lent sur iPhone) : un trait large et transparent sous le trait net.
function paint(ctx, strokes, { glow = true } = {}) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (!s.pts.length) continue;
    strokePath(ctx, s.pts);
    if (glow) {
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = s.width * 3.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.stroke();
  }
}

function redraw() {
  const st = S;
  if (!st) return;
  const ctx = st.ink.getContext('2d');
  ctx.clearRect(0, 0, st.root.clientWidth, st.root.clientHeight);
  paint(ctx, st.strokes);
}

function begin(p) {
  const st = S;
  st.current = { color: COLORS[st.color][1], width: WIDTH, pts: [p] };
  st.strokes.push(st.current);
  updateButton();
}

function extend(p) {
  const st = S;
  const pts = st.current.pts;
  const lastP = pts[pts.length - 1];
  if (Math.hypot(p.x - lastP.x, p.y - lastP.y) < 1.5) return;
  pts.push(p);
  // Seul le nouveau segment est dessiné ; le trait complet est redessiné proprement à la fin.
  paint(st.ink.getContext('2d'), [{ ...st.current, pts: [lastP, p] }]);
}

function end() {
  const st = S;
  if (st.current && st.current.pts.length < 2 && st.current.pts.length && st.current.fromHand) st.strokes.pop(); // point isolé = bruit du suivi
  st.current = null;
  redraw();
  updateButton();
}

export function undo() { if (!S) return false; S.current = null; const r = !!S.strokes.pop(); redraw(); updateButton(); return r; }
export function clear() { if (!S) return; S.current = null; S.strokes = []; redraw(); updateButton(); }

// Couleur par nom (« en rouge ») ou suivante.
export function setColor(name) {
  if (!S) return false;
  let i;
  if (typeof name === 'number') i = name;
  else if (name) i = COLORS.findIndex(([n]) => String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(n.normalize('NFD').replace(/[̀-ͯ]/g, '')));
  else i = (S.color + 1) % 5;
  if (i < 0) return false;
  S.color = i;
  S.swatch.style.background = COLORS[i][1];
  S.swatch.style.boxShadow = `0 0 10px ${COLORS[i][1]}`;
  return true;
}

function updateButton() { if (S) S.transform.disabled = !hasStrokes(); }

// Image du dessin pour l'IA : traits noirs sur fond blanc, recadrés autour du dessin (JPEG, côté max 1024 px).
export function snapshot(maxSide = 1024) {
  if (!hasStrokes()) return null;
  const pts = S.strokes.flatMap((s) => s.pts);
  const pad = 30;
  const x0 = Math.min(...pts.map((p) => p.x)) - pad;
  const y0 = Math.min(...pts.map((p) => p.y)) - pad;
  const w = Math.max(...pts.map((p) => p.x)) + pad - x0;
  const h = Math.max(...pts.map((p) => p.y)) + pad - y0;
  const k = Math.min(2, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(64, Math.round(w * k));
  c.height = Math.max(64, Math.round(h * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  const dark = { cyan: '#0a6f8f', or: '#9a6400', rose: '#b0206a', vert: '#1b7f3e', blanc: '#111', violet: '#5b2fb0', rouge: '#c01818', bleu: '#1f3fb0', jaune: '#8a7f00', orange: '#b85500' };
  const byHex = Object.fromEntries(COLORS.map(([n, hex]) => [hex, dark[n]]));
  paint(ctx, S.strokes.map((s) => ({ ...s, color: byHex[s.color] || '#111', width: s.width * 1.2 })), { glow: false });
  return c.toDataURL('image/jpeg', 0.9);
}

// Image « néon » du dessin tel qu'affiché (pour la carte de résultat).
export function preview() {
  if (!hasStrokes()) return null;
  const c = document.createElement('canvas');
  const w = S.root.clientWidth;
  const h = S.root.clientHeight;
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#060b16';
  ctx.fillRect(0, 0, w, h);
  paint(ctx, S.strokes);
  return c.toDataURL('image/png');
}

export function caption(text) {
  if (!S) return;
  S.caption.textContent = text || '';
  S.caption.classList.toggle('on', !!text);
  clearTimeout(S.captionT);
  if (text) S.captionT = setTimeout(() => S?.caption.classList.remove('on'), Math.min(12000, 2500 + text.length * 60));
}

export function setBusy(on) {
  if (!S) return;
  S.transform.disabled = !!on || !hasStrokes();
  S.transform.textContent = on ? '⏳ Analyse du dessin…' : '✨ Transformer en schéma';
}

function setHint(text) { if (S && S.hint.textContent !== text) S.hint.textContent = text; }
function idleHint() {
  if (!S.hands) return 'Chargement du suivi des mains…';
  if (!S.stream) return 'Caméra coupée : dessinez au doigt ou à la souris';
  return '☝️ Levez l’index pour dessiner · ✋ ouvrez la main pour lever le crayon';
}

function showHelp(on) {
  if (!S) return;
  S.root.querySelector('.ar-help')?.remove();
  if (!on) return;
  S.root.append(el('div', { class: 'ar-help', role: 'note' },
    el('h3', {}, 'Dessiner dans l’air'),
    el('ul', {},
      el('li', {}, el('b', {}, '☝️ Index levé seul'), ' : le bout du doigt trace'),
      el('li', {}, el('b', {}, '✋ Main ouverte'), ' (ou deux doigts ✌️) : le crayon se lève, déplacez-vous librement'),
      el('li', {}, el('b', {}, '👆 Sur l’écran'), ' : dessinez aussi au doigt ou à la souris')),
    el('p', {}, 'Puis « transforme-le en schéma », « qu’est-ce que j’ai dessiné ? », « résous cette équation », « projette-le en 3D »… À la voix aussi : « efface », « annule », « en rouge », « ferme le dessin ».'),
    el('button', { type: 'button', class: 'ar-btn ar-help-ok', onclick: () => { try { localStorage.setItem('jarvis.draw.help', '1'); } catch { /* ignore */ } showHelp(false); } }, 'Compris')));
}

// ---------- Toucher et souris ----------
function bindPointer() {
  const c = S.ink;
  let id = null;
  c.addEventListener('pointerdown', (e) => {
    if (id != null) return;
    id = e.pointerId;
    c.setPointerCapture(id);
    begin({ x: e.clientX, y: e.clientY });
  });
  c.addEventListener('pointermove', (e) => { if (e.pointerId === id && S.current) extend({ x: e.clientX, y: e.clientY }); });
  const up = (e) => { if (e.pointerId === id) { id = null; end(); } };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
}

// ---------- Suivi de l'index ----------
function drawCursor(hands, drawing) {
  const st = S;
  const ctx = st.overlay.getContext('2d');
  ctx.clearRect(0, 0, st.root.clientWidth, st.root.clientHeight);
  for (const h of hands) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(110, 225, 255, .45)';
    ctx.beginPath();
    for (const [a, b] of BONES) { ctx.moveTo(h.pts[a].x, h.pts[a].y); ctx.lineTo(h.pts[b].x, h.pts[b].y); }
    ctx.stroke();
  }
  if (st.cursor) {
    const color = COLORS[st.color][1];
    ctx.beginPath();
    ctx.arc(st.cursor.x, st.cursor.y, drawing ? 7 : 12, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if (drawing) { ctx.fillStyle = color; ctx.fill(); } else ctx.stroke();
  }
}

function trackHands(now) {
  const st = S;
  if (!st.hands || !st.stream || st.video.readyState < 2) return;
  const hands = detect(st.hands, st.video, now, { W: st.root.clientWidth, H: st.root.clientHeight, mirror: st.facing === 'user' });
  if (!hands) return;
  // Main qui dessine : celle qui pointe l'index, sinon la première.
  const withPose = hands.map((h) => { const [i, m, r, p] = fingersUp(h.pts); return { ...h, point: i && !m && !r && !p }; });
  const hand = withPose.find((h) => h.point) || withPose[0];
  if (!hand) {
    st.cursor = null;
    if (st.current?.fromHand) end();
    st.pointing = 0;
    drawCursor([], false);
    setHint(idleHint());
    return;
  }
  const tip = hand.pts[8];
  st.cursor = st.cursor ? { x: st.cursor.x + (tip.x - st.cursor.x) * 0.5, y: st.cursor.y + (tip.y - st.cursor.y) * 0.5 } : { ...tip };
  // Petite tolérance : 2 images pour commencer un trait, 4 pour l'arrêter (évite les traits hachés).
  if (hand.point) { st.pointing++; st.idle = 0; } else { st.idle++; st.pointing = 0; }
  const drawing = !!st.current?.fromHand;
  if (!drawing && st.pointing >= 2) { begin({ ...st.cursor }); st.current.fromHand = true; }
  else if (drawing && st.idle >= 4) end();
  else if (drawing) extend({ ...st.cursor });
  drawCursor(withPose, !!st.current?.fromHand);
  setHint(st.current?.fromHand ? '✍️ Dessin en cours · ouvrez la main pour lever le crayon' : '☝️ Levez l’index seul pour dessiner');
}

function loop(now) {
  const st = S;
  if (!st?.alive) return;
  st.raf = requestAnimationFrame(loop);
  trackHands(now);
}
