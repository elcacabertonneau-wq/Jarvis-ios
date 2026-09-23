// Caméra et images : affichage de la webcam, capture d'une image, images envoyées par l'utilisateur.
// Les images ne quittent l'appareil que lorsqu'on demande une analyse (envoi à l'IA choisie).
import * as ui from './ui.js';

const { el } = ui;

let stream = null;
let facing = 'user';
let cardEl = null;
let video = null;
let lastImage = null; // { dataUrl?, url?, label, source: 'upload' | 'screen', at }

export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia;
export const isOpen = () => !!(stream && cardEl?.isConnected);

async function startStream() {
  stopStream();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.classList.toggle('mirror', facing === 'user');
  await video.play().catch(() => {});
}

function stopStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

// Ouvre la caméra dans une carte. `actions` : boutons Analyser / Changer / Fermer fournis par l'app.
export async function openCamera({ place = '', onAnalyze, onSearch } = {}) {
  if (!cameraSupported()) throw new Error('Caméra non disponible sur ce navigateur.');
  if (isOpen()) {
    ui.restoreCard(cardEl);
    if (place) ui.placeCard(cardEl, place);
    return cardEl;
  }
  video = el('video', { class: 'cam-video', autoplay: '', playsinline: '', muted: '' });
  video.muted = true;
  const frame = el('div', { class: 'cam-frame' }, video,
    el('span', { class: 'cam-corner tl' }), el('span', { class: 'cam-corner tr' }),
    el('span', { class: 'cam-corner bl' }), el('span', { class: 'cam-corner br' }),
    el('span', { class: 'cam-scan', 'aria-hidden': 'true' }),
    el('span', { class: 'cam-live' }, 'EN DIRECT'));
  const tools = el('div', { class: 'actions-row cam-tools' },
    ui.chip('🔎 Analyser', () => onAnalyze?.()),
    ui.chip('📚 Rechercher', () => onSearch?.()),
    ui.chip('🔄 Changer de caméra', () => switchCamera()));
  cardEl = ui.card('Caméra', el('div', { class: 'cam-body' }, frame, tools), { icon: '📷', keep: true, place, kind: 'camera' });
  cardEl._onRemove = () => { stopStream(); cardEl = null; video = null; };
  try {
    await startStream();
  } catch (e) {
    ui.removeCard(cardEl);
    throw new Error(e?.name === 'NotAllowedError'
      ? "Accès à la caméra refusé. Autorisez-la dans les réglages du navigateur (icône à gauche de l'adresse)."
      : "Impossible d'ouvrir la caméra (aucune caméra détectée ou déjà utilisée par une autre application).");
  }
  return cardEl;
}

export function closeCamera() {
  if (cardEl) ui.removeCard(cardEl, true);
  stopStream();
}

export async function switchCamera() {
  if (!isOpen()) return;
  facing = facing === 'user' ? 'environment' : 'user';
  try { await startStream(); } catch { facing = facing === 'user' ? 'environment' : 'user'; await startStream().catch(() => {}); }
}

// Effet de balayage pendant l'analyse.
export function setScanning(on) { cardEl?.classList.toggle('scanning', !!on); }

// Capture l'image actuelle de la caméra (JPEG, côté max 1024 px).
export async function capture(maxSide = 1024) {
  if (!isOpen()) throw new Error('La caméra est fermée.');
  if (video.readyState < 2 || !video.videoWidth) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 3000);
      video.addEventListener('loadeddata', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }
  // Laisse l'exposition automatique se stabiliser juste après l'ouverture.
  if (video.currentTime < 0.6) await new Promise((r) => setTimeout(r, 700));
  const { videoWidth: w, videoHeight: h } = video;
  if (!w) throw new Error("La caméra n'envoie pas d'image.");
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d');
  if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); } // même sens que l'aperçu
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Redimensionne n'importe quelle image (fichier, blob, URL de données) en JPEG.
export async function toJpeg(source, maxSide = 1024) {
  const blob = source instanceof Blob ? source : await (await fetch(source)).blob();
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ---------- Image fournie par l'utilisateur ----------
export function setLastImage(img) { lastImage = img ? { ...img, at: Date.now() } : null; }
export function getLastImage() { return lastImage; }

// Dernière photo affichée à l'écran (résultats de recherche, création…), convertie si possible.
export async function imageFromScreen() {
  const img = document.querySelector('#stage .card:not(.leaving) .hero-img, #stage .card:not(.leaving) .gen-img, #stage .card:not(.leaving) .gallery img');
  if (!img?.src) return null;
  try {
    return { dataUrl: await toJpeg(img.currentSrc || img.src), label: img.alt || 'image à l’écran', source: 'screen' };
  } catch {
    // Image d'un autre site non convertible : on transmet son adresse (compris par Groq et Claude).
    return { url: img.currentSrc || img.src, label: img.alt || 'image à l’écran', source: 'screen' };
  }
}
