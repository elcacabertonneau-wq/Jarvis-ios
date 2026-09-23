// Suivi des mains (MediaPipe Hand Landmarker), partagé par la réalité augmentée et le dessin dans l'air.
// Le modèle (~8 Mo) n'est téléchargé qu'à la première utilisation, puis réutilisé.
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let handsPromise = null;

export function loadHands() {
  handsPromise ||= (async () => {
    const { FilesetResolver, HandLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { return await HandLandmarker.createFromOptions(fileset, opts('GPU')); } catch { return HandLandmarker.createFromOptions(fileset, opts('CPU')); }
  })().catch((e) => { handsPromise = null; throw e; });
  return handsPromise;
}

// Os de la main (paires d'indices des 21 points), pour dessiner le squelette.
export const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

// Point normalisé de la vidéo → pixels écran (vidéo affichée en « cover », en miroir pour la caméra avant).
export function toScreen(p, video, W, H, mirror) {
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const k = Math.max(W / vw, H / vh);
  const x = p.x * vw * k + (W - vw * k) / 2;
  return { x: mirror ? W - x : x, y: p.y * vh * k + (H - vh * k) / 2 };
}

// Doigts tendus (index, majeur, annulaire, auriculaire) d'une main en pixels écran.
export function fingersUp(pts) {
  const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
  return [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => d(tip, 0) > d(pip, 0) * 1.1);
}

// Image réduite pour la détection : 4 à 16 fois moins de pixels à analyser, même précision pour des gestes.
const small = document.createElement('canvas');
const smallCtx = small.getContext('2d', { willReadFrequently: false });
const DETECT_WIDTH = 320;
const MIN_INTERVAL = 45; // ms entre deux détections (~22 par seconde), le reste du temps sert à l'affichage
let lastRun = 0;
let lastVideoTime = -1;

// Détection sur l'image courante de la vidéo : renvoie [{ key, pts }] (pts en pixels écran), ou null si rien de neuf.
export function detect(landmarker, video, now, { W, H, mirror }) {
  if (now - lastRun < MIN_INTERVAL || video.currentTime === lastVideoTime || !video.videoWidth) return null;
  lastRun = now;
  lastVideoTime = video.currentTime;
  const k = Math.min(1, DETECT_WIDTH / video.videoWidth);
  const w = Math.round(video.videoWidth * k);
  const h = Math.round(video.videoHeight * k);
  if (small.width !== w || small.height !== h) { small.width = w; small.height = h; }
  let res;
  try {
    smallCtx.drawImage(video, 0, 0, w, h);
    res = landmarker.detectForVideo(small, now);
  } catch { return null; }
  return (res?.landmarks || []).map((lm, i) => ({
    key: res.handednesses?.[i]?.[0]?.categoryName || res.handedness?.[i]?.[0]?.categoryName || String(i),
    pts: lm.map((p) => toScreen(p, video, W, H, mirror)),
  }));
}
