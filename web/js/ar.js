// Réalité augmentée : hologrammes 3D (maquettes, plans, modèles, images) projetés par-dessus la caméra,
// manipulables avec les doigts (suivi des mains MediaPipe), au toucher ou à la souris.
// Three.js et le modèle de suivi des mains ne sont chargés qu'à la première ouverture.
import * as ui from './ui.js';
import { loadHands, BONES, detect, toScreen } from './hands.js';
import { createMap, createPhoto, createModel, searchModels } from './arlayers.js';
import { settings } from './settings.js';

const { el } = ui;
const FIT = 1.8; // taille de l'hologramme (unités de la scène)
const CAM_Z = 4.2;
const HOLO = 0x35d6ff;

let T = null; // module three
let addons = null; // { GLTFLoader, RoomEnvironment }
let S = null; // état de la vue AR ouverte
let last = null; // dernier contenu affiché : { kind, data, title }

export const isOpen = () => !!S;
export const describe = () => (S ? `Réalité augmentée ouverte : ${S.layer?.kind === 'photo' ? 'ville 3D photoréaliste' : S.layer?.kind === 'map' ? `carte 3D (${S.layer.style})` : S.layer?.kind === 'model' ? 'modèle 3D' : 'hologramme'} « ${S.title || 'vide'} »` : '');
export const canRestore = () => !!last;

// ---------- Chargement paresseux ----------
async function loadThree() {
  if (T) return;
  const [three, gltf, room] = await Promise.all([
    import('three'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/environments/RoomEnvironment.js'),
  ]);
  T = three;
  addons = { GLTFLoader: gltf.GLTFLoader, RoomEnvironment: room.RoomEnvironment };
}


// ---------- Ouverture / fermeture ----------
const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;

export async function open({ onMic, onClose } = {}) {
  if (S) return;
  const video = el('video', { class: 'ar-video', autoplay: '', playsinline: '', muted: '' });
  video.muted = true;
  const canvas = el('canvas', { class: 'ar-3d' });
  const overlay = el('canvas', { class: 'ar-hands', 'aria-hidden': 'true' });
  const title = el('span', { class: 'ar-title' }, 'Réalité augmentée');
  const hint = el('span', { class: 'ar-hint' }, 'Préparation…');
  const caption = el('div', { class: 'ar-caption', 'aria-live': 'polite' });
  const loading = el('div', { class: 'ar-loading' }, el('span', { class: 'ar-spin' }), el('span', { class: 'ar-loading-text' }, 'Chargement du moteur 3D…'));
  const btn = (label, ico, fn, extra = {}) => el('button', { type: 'button', class: 'ar-btn', title: label, 'aria-label': label, onclick: fn, ...extra }, ico);
  const tools = el('div', { class: 'ar-tools' },
    btn('Parler à Jarvis', '🎙️', () => onMic?.()),
    btn('Changer de caméra', '🔄', () => switchCamera()),
    btn('Mode hologramme', '💠', () => setHolo(!S?.holoMode), { 'data-k': 'holo' }),
    btn('Rotation automatique', '🌀', () => setAutoRotate(!S?.autoRotate), { 'data-k': 'spin' }),
    btn('Suivi des mains', '✋', () => setHands(!S?.handsOn), { 'data-k': 'hands' }),
    btn('Recentrer', '🎯', () => reset()),
    btn('Aide', '❔', () => showHelp(true)));
  const root = el('div', { class: 'ar', role: 'dialog', 'aria-label': 'Réalité augmentée' },
    video, canvas, overlay,
    el('div', { class: 'ar-top' },
      el('div', { class: 'ar-head' }, el('span', { class: 'ar-badge' }, 'AR'), title),
      hint,
      el('button', { type: 'button', class: 'ar-btn ar-close', title: 'Fermer (Échap)', 'aria-label': 'Fermer la réalité augmentée', onclick: () => close() }, '✕')),
    loading, caption, tools, el('aside', { class: 'ar-panel', hidden: '' }));
  document.body.append(root);
  document.body.classList.add('ar-open');

  S = {
    root, video, canvas, overlay, title, hint, caption, loading, tools, onClose,
    stream: null, facing: isPhone() ? 'environment' : 'user',
    handsOn: true, holoMode: false, autoRotate: true, anims: [], title: '',
    pointers: new Map(), gesture: null, handState: {}, vel: { x: 0, y: 0 }, lastInteract: 0,
    reveal: 1, lastVideoTime: -1, raf: 0, alive: true,
  };
  const st = S;
  st.onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  document.addEventListener('keydown', st.onKey, true);

  startCamera().catch(() => setHint('Caméra indisponible : hologramme sur fond sombre (touchez / souris pour manipuler).'));
  try {
    await loadThree();
  } catch {
    close();
    throw new Error('Moteur 3D indisponible');
  }
  if (!st.alive) return;
  initScene();
  setLoading('');
  bindPointer();
  updateButtons();
  if (!localStorage.getItem('jarvis.ar.help')) showHelp(true);
  loadHands().then((h) => { if (st.alive) { st.hands = h; setHint(handHint()); } })
    .catch(() => { if (st.alive) { st.handsOn = false; updateButtons(); setHint('Suivi des mains indisponible : utilisez le toucher ou la souris.'); } });
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
  st.layer?.destroy();
  if (st.content) disposeTree(st.content);
  st.pmrem?.dispose();
  st.env?.dispose();
  st.renderer?.dispose();
  document.body.classList.remove('ar-open');
  ui.animateOut(st.root, 'leaving', () => st.root.remove());
  st.onClose?.();
}

// ---------- Caméra ----------
async function startCamera() {
  const st = S;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
  st.stream?.getTracks().forEach((t) => t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: st.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
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

// ---------- Scène 3D ----------
function initScene() {
  const st = S;
  // Téléphone : pas d'anticrénelage et résolution plafonnée (la caméra et le suivi des mains tournent en même temps).
  const renderer = new T.WebGLRenderer({ canvas: st.canvas, antialias: !isPhone(), alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  st.dpr = Math.min(devicePixelRatio || 1, isPhone() ? 1.5 : 2);
  renderer.setPixelRatio(st.dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  st.pmrem = new T.PMREMGenerator(renderer);
  st.env = st.pmrem.fromScene(new addons.RoomEnvironment(), 0.04).texture;
  scene.environment = st.env;
  scene.add(new T.HemisphereLight(0xdff6ff, 0x1a2236, 1.2));
  const sun = new T.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const camera = new T.PerspectiveCamera(45, 1, 0.05, 100);
  camera.position.set(0, 0, CAM_Z);
  const holo = new T.Group();
  scene.add(holo);
  st.clip = new T.Plane(new T.Vector3(0, -1, 0), 10);
  Object.assign(st, { renderer, scene, camera, holo, clock: new T.Clock() });
  st.onResize = () => resize();
  addEventListener('resize', st.onResize);
  resize();
}

function resize() {
  const st = S;
  if (!st?.renderer) return;
  const w = st.root.clientWidth || innerWidth;
  const h = st.root.clientHeight || innerHeight;
  st.renderer.setSize(w, h, false);
  st.camera.aspect = w / h;
  // Sur écran étroit (portrait), on recule pour que l'hologramme tienne en largeur.
  st.camera.position.z = CAM_Z * Math.max(1, 0.75 / Math.min(1, w / h));
  st.camera.updateProjectionMatrix();
  const dpr = 1; // squelette des mains : la pleine résolution n'apporte rien et coûte cher
  st.overlay.width = Math.round(w * dpr);
  st.overlay.height = Math.round(h * dpr);
  st.overlay.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = [o.material, o.userData.orig].flat().filter(Boolean);
    mats.forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose?.(); });
  });
}

// Remplace le contenu de l'hologramme par `obj` (mis à l'échelle et centré).
function setContent(obj, { title = '', tilt = [0.25, -0.5, 0], pedestal = true } = {}) {
  const st = S;
  if (!st?.holo) return;
  clearLabels();
  clearLayer();
  if (st.content) { st.holo.remove(st.content); disposeTree(st.content); }
  st.holo.clear();
  st.anims = obj.userData.anims || [];
  const box = new T.Box3().setFromObject(obj, true);
  const size = box.getSize(new T.Vector3());
  const center = box.getCenter(new T.Vector3());
  const k = FIT / Math.max(size.x, size.y, size.z, 1e-3);
  const content = new T.Group();
  obj.position.sub(center);
  content.add(obj);
  content.scale.setScalar(k);
  obj.userData.fit = k;
  st.content = content;
  st.holo.add(content);
  (obj.userData.labels || []).forEach((fn) => fn(k));
  if (pedestal) st.holo.add(makePedestal(-(size.y * k) / 2 - 0.06));
  st.title = title;
  st.root.querySelector('.ar-title').textContent = title || 'Réalité augmentée';
  st.tilt = tilt;
  reset();
  if (st.holoMode) applyHolo(true);
  st.reveal = 0; // animation d'apparition (balayage de bas en haut)
  st.revealStart = performance.now();
  st.revealH = (Math.max(size.x, size.y, size.z) * k) / 2 + 0.15;
  st.clip.constant = -10;
  st.renderer.clippingPlanes = [st.clip];
  setLoading('');
}

function makePedestal(y) {
  const g = new T.Group();
  g.position.y = y;
  g.userData.pedestal = true;
  const mat = (o) => new T.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: o, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
  const ring = new T.Mesh(new T.RingGeometry(0.95, 1.0, 96), mat(0.7));
  const ring2 = new T.Mesh(new T.RingGeometry(0.72, 0.74, 96, 1, 0, Math.PI * 1.5), mat(0.5));
  const disc = new T.Mesh(new T.CircleGeometry(0.95, 96), mat(0.08));
  [ring, ring2, disc].forEach((m) => { m.rotation.x = -Math.PI / 2; g.add(m); });
  g.userData.spinner = ring2;
  return g;
}

// ---------- Export du modèle affiché (.glb) ----------
export const canExport = () => !!(S?.content && !S.layer);
export async function exportGLB() {
  if (!canExport()) return null;
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const buf = await new GLTFExporter().parseAsync(S.content, { binary: true, onlyVisible: true });
  return new Blob([buf], { type: 'model/gltf-binary' });
}

// ---------- Étiquettes AR : noms et infos posés sur les objets filmés ----------
// Image actuelle de la caméra (non retournée), pour l'analyse.
export function captureFrame(maxSide = 768) {
  const v = S?.video;
  if (!S?.stream || !v?.videoWidth) return null;
  const k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * k);
  c.height = Math.round(v.videoHeight * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
export const hasCamera = () => !!S?.stream;

// Vide la scène (hologramme, carte, modèle) pour ne garder que la caméra.
export function clearScene(title = '') {
  if (!S) return;
  clearLayer();
  if (S.content) { S.holo?.remove(S.content); disposeTree(S.content); S.content = null; }
  S.holo?.clear();
  S.anims = [];
  S.renderer?.render(S.scene, S.camera);
  S.title = title;
  S.root.querySelector('.ar-title').textContent = title || 'Réalité augmentée';
}

// objects : [{ label, info, box: [ymin, xmin, ymax, xmax] (0 à 1000) }]
export function showLabels(objects, { onTag } = {}) {
  if (!S) return 0;
  clearLabels();
  const W = S.root.clientWidth;
  const H = S.root.clientHeight;
  const layer = el('div', { class: 'ar-tags' });
  objects.forEach((o, i) => {
    const [y0, x0, y1, x1] = o.box.map((n) => Math.max(0, Math.min(1000, +n || 0)) / 1000);
    const a = toScreen({ x: x0, y: y0 }, S.video, W, H, S.facing === 'user');
    const b = toScreen({ x: x1, y: y1 }, S.video, W, H, S.facing === 'user');
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (w < 6 || h < 6) return;
    const tag = el('button', { type: 'button', class: `ar-tag${top < 90 ? ' inside' : ''}`, style: `left:${left}px;top:${top}px;width:${w}px;height:${h}px;--d:${i * 70}ms;--in:${Math.max(6, 76 - top)}px`, onclick: () => onTag?.(o) },
      el('span', { class: 'ar-tag-label' }, el('b', {}, o.label), o.info ? el('small', {}, o.info) : null));
    layer.append(tag);
  });
  S.root.insertBefore(layer, S.root.querySelector('.ar-top'));
  S.tags = layer;
  return layer.children.length;
}
export function clearLabels() { S?.tags?.remove(); if (S) S.tags = null; }
export const hasLabels = () => !!S?.tags;

// ---------- Calques : carte 3D réelle et vrais modèles ----------
function clearLayer() {
  const st = S;
  if (!st?.layer) return;
  st.layer.destroy();
  st.layer = null;
  st.root.classList.remove('has-layer');
}

// Vide l'hologramme Three.js et installe un calque (carte ou modèle) sous les gestes.
function setLayer(layer, title) {
  const st = S;
  clearLabels();
  clearLayer();
  if (st.content) { st.holo.remove(st.content); disposeTree(st.content); st.content = null; }
  st.holo.clear();
  st.anims = [];
  st.renderer?.render(st.scene, st.camera);
  st.layer = layer;
  st.root.insertBefore(layer.el, st.canvas);
  st.root.classList.add('has-layer');
  st.title = title;
  st.root.querySelector('.ar-title').textContent = title;
  st.vel = { x: 0, y: 0 };
}

// Rendu demandé → rendu possible : le photoréaliste demande un jeton Cesium ion (gratuit).
export function resolveStyle(style = '') {
  const want = style || settings.mapStyle || 'auto';
  if (want === 'auto') return settings.cesiumToken ? 'photo' : 'satellite';
  if (want === 'photo' && !settings.cesiumToken) return 'satellite';
  return ['photo', 'satellite', 'plan'].includes(want) ? want : 'satellite';
}

// Carte 3D d'un lieu ({lat, lon}) : ville photoréaliste, satellite avec relief, ou plan avec immeubles.
export async function showMap(place, { title = place.name || 'Carte 3D', zoom = 16, pitch = 60, bearing = -20, style = '', query = '' } = {}) {
  if (!S) return null;
  const st = resolveStyle(style);
  S.mapCtx = { place, title, zoom, pitch, bearing, route: null };
  setLoading(`${st === 'photo' ? 'Chargement de la ville en 3D photoréaliste' : st === 'satellite' ? 'Chargement des photos satellite' : 'Chargement de la carte 3D'} : ${title}…`);
  let layer;
  if (st === 'photo') {
    try {
      layer = await createPhoto({ center: place, query, token: settings.cesiumToken, zoom, pitch, bearing, phone: isPhone() });
    } catch (e) {
      console.warn(e);
      caption('Villes 3D photoréalistes indisponibles (jeton Cesium refusé ?) : vue satellite à la place.');
    }
  }
  layer ||= await createMap({ center: place, zoom, pitch, bearing, holo: S.holoMode, phone: isPhone(), satellite: st !== 'plan' });
  if (!S) { layer.destroy(); return null; }
  setLayer(layer, title);
  layer.map?.resize(); // la carte a été créée hors de la page : on lui donne sa vraie taille
  S.autoRotate = true;
  updateButtons();
  try { await layer.ready; } finally { setLoading(''); }
  last = { kind: 'map', data: { place, opts: { title, zoom, pitch, bearing, style } }, title };
  return layer;
}

// Itinéraire sur carte 3D : tracé lumineux, départ et arrivée, survol animé.
export async function showRoute(r, from, to, title = 'Itinéraire', style = '') {
  const layer = await showMap(from, { title, zoom: 14, style });
  if (!layer) return null;
  S.mapCtx.route = { r, from, to };
  S.autoRotate = false;
  updateButtons();
  await layer.showRoute(r.geometry, from, to);
  last = { kind: 'route', data: { r, from, to }, title };
  return layer;
}

// Change le rendu de la carte affichée (« vue satellite », « comme Google Earth », « vue plan »).
export async function setMapStyle(style) {
  if (!S?.mapCtx || !['map', 'photo'].includes(S.layer?.kind)) return 'Aucune carte n’est affichée.';
  if (style === 'photo' && !settings.cesiumToken) return 'Pour les villes en 3D photoréaliste, ajoutez d’abord un jeton Cesium ion gratuit dans les réglages ⚙️ → Cartes 3D.';
  const { place, title, zoom, pitch, bearing, route } = S.mapCtx;
  if (route) await showRoute(route.r, route.from, route.to, title, style);
  else await showMap(place, { title, zoom, pitch, bearing, style });
  return '';
}

export function flyRoute() { if (S?.layer?.fly && S.mapCtx?.route) { S.autoRotate = false; updateButtons(); S.layer.fly(); return true; } return false; }

// Vrai modèle 3D (Sketchfab). `models` : résultats de recherche ; `index` : lequel afficher.
export async function showRealModel(models, index = 0, title = '') {
  if (!S || !models?.length) return false;
  const m = models[index % models.length];
  setLoading(`Chargement du modèle 3D : ${m.name}…`);
  const layer = await createModel(m, {
    onReady: () => { if (S?.layer === layer) setLoading(''); },
    onError: () => { if (S?.layer === layer) { setLoading(''); caption('Ce modèle ne peut pas être affiché, dites « autre modèle ».'); } },
  });
  if (!S) { layer.destroy(); return false; }
  setLayer(layer, title || m.name);
  S.models = { list: models, index: index % models.length, title };
  S.autoRotate = true;
  updateButtons();
  setTimeout(() => { if (S?.layer === layer) setLoading(''); }, 20000);
  last = { kind: 'real', data: { models, index }, title: title || m.name };
  return true;
}
export function nextModel() {
  if (!S?.models) return false;
  showRealModel(S.models.list, S.models.index + 1, S.models.title);
  return true;
}
export { searchModels };

// Panneau d'informations (itinéraire, crédits…) sur le côté de la vue.
export function setPanel(node) {
  if (!S) return;
  const panel = S.root.querySelector('.ar-panel');
  panel.replaceChildren(...(node ? [node] : []));
  panel.hidden = !node;
  S.root.classList.toggle('has-panel', !!node);
  S.layer?.map?.resize();
}

// ---------- Construction de maquettes à partir d'un JSON de formes ----------
const toColor = (c, d = '#8fd8ff') => { try { return new T.Color(/^#?[0-9a-f]{3,6}$/i.test(c || '') ? (c.startsWith('#') ? c : `#${c}`) : (c || d)); } catch { return new T.Color(d); } };
const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const vec = (a, d = [0, 0, 0]) => (Array.isArray(a) ? [num(a[0], d[0]), num(a[1], d[1]), num(a[2], d[2])] : d);
const DEG = Math.PI / 180;

function labelSprite(text, color = '#e8f8ff') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 44px Inter, system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  c.width = w; c.height = 76;
  ctx.font = font;
  ctx.fillStyle = 'rgba(4, 12, 24, 0.72)';
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(2, 2, w - 4, 72, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 24, 40);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  s.userData.aspect = w / 76;
  s.userData.label = true;
  return s;
}

function geometryFor(p) {
  const s = Array.isArray(p.size) ? p.size.map((v) => Math.max(0.001, Math.abs(num(v, 1)))) : [Math.max(0.001, Math.abs(num(p.size, 1)))];
  const [a = 1, b = a, c = a] = s;
  switch (String(p.shape || 'box').toLowerCase()) {
    case 'sphere': case 'ball': return [new T.SphereGeometry(a, 32, 20), 2 * a];
    case 'cylinder': case 'tube': return [new T.CylinderGeometry(a, a, b, 32), b];
    case 'cone': return [new T.ConeGeometry(a, b, 32), b];
    case 'torus': case 'ring': return [new T.TorusGeometry(a, Math.min(b, a) * (s.length > 1 ? 1 : 0.25), 16, 64), 2 * (s.length > 1 ? b : a * 0.25)];
    case 'capsule': return [new T.CapsuleGeometry(a, b, 8, 16), b + 2 * a];
    case 'plane': case 'floor': { const g = new T.PlaneGeometry(a, b); g.rotateX(-Math.PI / 2); return [g, 0.01]; }
    case 'pyramid': return [new T.ConeGeometry(a, b, 4), b];
    case 'box': case 'cube': default: return [new T.BoxGeometry(a, b, c), b];
  }
}

// data : { parts:[...], plan:{...} } → Group (userData.anims, userData.labels)
export function buildScene(data = {}) {
  const root = new T.Group();
  const anims = [];
  const labels = [];
  const addLabel = (parent, text, y) => {
    if (!text) return;
    labels.push((k) => {
      const sp = labelSprite(String(text).slice(0, 40));
      const h = 0.12 / k;
      sp.scale.set(h * sp.userData.aspect, h, 1);
      sp.position.y = y + h * 0.9;
      parent.add(sp);
    });
  };
  const parts = Array.isArray(data.parts) ? data.parts.slice(0, 160) : [];
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue;
    const holder = new T.Group();
    const shape = String(p.shape || 'box').toLowerCase();
    if (shape === 'label' || shape === 'text') {
      holder.position.set(...vec(p.pos));
      addLabel(holder, p.label || p.text, 0);
      root.add(holder);
      continue;
    }
    let mesh;
    let height;
    const color = toColor(p.color);
    const opacity = Math.min(1, Math.max(0.05, num(p.opacity, 1)));
    const material = new T.MeshStandardMaterial({
      color, roughness: num(p.roughness, 0.45), metalness: num(p.metalness, 0.1),
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: T.DoubleSide,
      emissive: p.glow ? color : new T.Color(0), emissiveIntensity: p.glow ? 0.9 : 0,
    });
    if (shape === 'line' || shape === 'bond' || shape === 'rod') {
      const from = new T.Vector3(...vec(p.from));
      const to = new T.Vector3(...vec(p.to, [0, 1, 0]));
      const dir = to.clone().sub(from);
      const len = Math.max(dir.length(), 1e-3);
      const r = Math.abs(num(Array.isArray(p.size) ? p.size[0] : p.size, len * 0.04)) || len * 0.04;
      mesh = new T.Mesh(new T.CylinderGeometry(r, r, len, 16), material);
      holder.position.copy(from.clone().add(to).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
      height = r * 2;
    } else {
      const [geo, h] = geometryFor(p);
      mesh = new T.Mesh(geo, material);
      height = h;
      holder.position.set(...vec(p.pos));
      const rot = vec(p.rot);
      mesh.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    }
    holder.add(mesh);
    addLabel(holder, p.label, height / 2);
    if (num(p.spin, 0)) anims.push({ obj: mesh, spin: num(p.spin, 0) * DEG });
    if (num(p.orbit, 0)) {
      const pivot = new T.Group();
      pivot.add(holder);
      root.add(pivot);
      anims.push({ obj: pivot, spin: num(p.orbit, 0) * DEG });
    } else root.add(holder);
  }
  if (data.plan && Array.isArray(data.plan.rooms)) buildPlan(root, data.plan, addLabel);
  root.userData.anims = anims;
  root.userData.labels = labels;
  return root;
}

function buildPlan(root, plan, addLabel) {
  const hWall = Math.min(6, Math.max(0.5, num(plan.wall_height, 2.5)));
  const th = 0.12;
  const wallMat = new T.MeshStandardMaterial({ color: 0xe6eef6, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false });
  const PALETTE = ['#7cc6ff', '#ffd27c', '#9be8a8', '#ff9fb3', '#c7a8ff', '#8fe3e0', '#ffb98a'];
  plan.rooms.slice(0, 40).forEach((r, i) => {
    const x = num(r.x, 0);
    const z = num(r.z ?? r.y, 0);
    const w = Math.max(0.3, num(r.w ?? r.width, 3));
    const d = Math.max(0.3, num(r.d ?? r.depth ?? r.h, 3));
    const floor = new T.Mesh(new T.BoxGeometry(w, 0.06, d), new T.MeshStandardMaterial({ color: toColor(r.color, PALETTE[i % PALETTE.length]), roughness: 0.9 }));
    floor.position.set(x + w / 2, 0.03, z + d / 2);
    root.add(floor);
    const walls = [
      [w, th, x + w / 2, z + th / 2], [w, th, x + w / 2, z + d - th / 2],
      [th, d, x + th / 2, z + d / 2], [th, d, x + w - th / 2, z + d / 2],
    ];
    for (const [ww, dd, cx, cz] of walls) {
      const m = new T.Mesh(new T.BoxGeometry(ww, hWall, dd), wallMat);
      m.position.set(cx, hWall / 2, cz);
      root.add(m);
    }
    const tag = new T.Group();
    tag.position.set(x + w / 2, hWall, z + d / 2);
    root.add(tag);
    const area = r.area || Math.round(w * d);
    addLabel(tag, r.name ? `${r.name}${area ? ` · ${area} m²` : ''}` : '', 0.1);
  });
}

// ---------- Contenus ----------
export async function showScene(data, title = '') {
  if (!S?.holo) return false;
  const obj = buildScene(data);
  if (!obj.children.length) return false;
  const isPlan = !!data.plan?.rooms?.length;
  setContent(obj, { title: title || data.title || '', tilt: isPlan ? [0.75, -0.55, 0] : [0.25, -0.5, 0] });
  last = { kind: 'scene', data, title: title || data.title || '' };
  return true;
}

function gltfLoader(urlMap) {
  const manager = new T.LoadingManager();
  if (urlMap) manager.setURLModifier((u) => { for (const [k, v] of Object.entries(urlMap)) if (u.endsWith(k)) return v; return u; });
  return new addons.GLTFLoader(manager);
}

export async function showModel(url, title = 'Modèle 3D', { urlMap } = {}) {
  if (!S?.holo) return false;
  setLoading('Chargement du modèle 3D…');
  try {
    const gltf = await gltfLoader(urlMap).loadAsync(url);
    if (!S?.holo) return false;
    const obj = gltf.scene;
    if (gltf.animations?.length) {
      const mixer = new T.AnimationMixer(obj);
      gltf.animations.forEach((a) => mixer.clipAction(a).play());
      obj.userData.anims = [{ mixer }];
    }
    setContent(obj, { title });
    last = { kind: 'model', data: { url, urlMap }, title };
    return true;
  } catch (e) {
    setLoading('');
    throw e;
  }
}

// Bibliothèque libre Poly Haven (CC0) : ~500 objets photoréalistes (meubles, déco, plantes, outils…).
let phIndex = null;
export async function findPolyHaven(query) {
  const words = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!words.length) return null;
  phIndex ||= fetch('https://api.polyhaven.com/assets?t=models').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).catch((e) => { phIndex = null; throw e; });
  const all = await phIndex;
  let best = null;
  for (const [id, a] of Object.entries(all)) {
    const name = String(a.name || '').toLowerCase();
    const tags = (a.tags || []).map((t) => String(t).toLowerCase());
    const cats = (a.categories || []).map((t) => String(t).toLowerCase());
    let score = 0;
    for (const w of words) {
      const stem = w.replace(/s$/, '');
      if (name.split(/\s+/).some((n) => n.replace(/s$/, '') === stem)) score += 3;
      if (tags.some((t) => t.replace(/s$/, '') === stem)) score += 2;
      if (cats.some((t) => t.includes(stem))) score += 1;
    }
    score += Math.min(1, (a.download_count || 0) / 1e5); // départage : les plus populaires
    if (score >= 2 && (!best || score > best.score)) best = { id, name: a.name, score };
  }
  return best;
}

export async function showPolyHaven(hit) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${hit.id}`)).json();
  const g = files?.gltf?.['1k']?.gltf || files?.gltf?.['2k']?.gltf;
  if (!g?.url) throw new Error('Modèle indisponible');
  const urlMap = Object.fromEntries(Object.entries(g.include || {}).map(([k, v]) => [k, v.url]));
  return showModel(g.url, hit.name, { urlMap });
}

function textureFrom(src) {
  return new Promise((resolve, reject) => {
    const loader = new T.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(src, (t) => { t.colorSpace = T.SRGBColorSpace; resolve(t); }, undefined, reject);
  });
}

function imagePanel(tex, w = 1.6) {
  const img = tex.image;
  const ratio = img?.width && img?.height ? img.height / img.width : 0.75;
  const h = w * ratio;
  const g = new T.Group();
  const panel = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide, toneMapped: false }));
  const frame = new T.Mesh(new T.PlaneGeometry(w + 0.06, h + 0.06), new T.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.35, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
  frame.position.z = -0.005;
  panel.userData.noHolo = true;
  frame.userData.noHolo = true;
  g.add(frame, panel);
  return g;
}

// Une image (plan, photo, schéma…) projetée comme un panneau flottant.
export async function showImage(src, title = 'Image') {
  if (!S?.holo) return false;
  setLoading('Projection de l’image…');
  try {
    const tex = await textureFrom(src);
    if (!S?.holo) return false;
    setContent(imagePanel(tex), { title, tilt: [0, 0, 0], pedestal: false });
    last = { kind: 'image', data: src, title };
    return true;
  } catch (e) { setLoading(''); throw e; }
}

// Plusieurs images disposées en arc de cercle (carrousel qu'on fait tourner du bout des doigts).
export async function showImages(items, title = 'Images') {
  if (!S?.holo) return 0;
  setLoading('Projection des images…');
  const texs = (await Promise.all(items.slice(0, 10).map((it) => textureFrom(it.full || it.thumb).catch(() => (it.full && it.thumb ? textureFrom(it.thumb).catch(() => null) : null))))).filter(Boolean).slice(0, 7);
  if (!S?.holo) return 0;
  if (!texs.length) { setLoading(''); return 0; }
  const g = new T.Group();
  const R = 2.4;
  const step = Math.min(0.62, (Math.PI * 1.1) / Math.max(1, texs.length - 1));
  texs.forEach((t, i) => {
    const a = (i - (texs.length - 1) / 2) * step;
    const p = imagePanel(t, 1.1);
    p.position.set(Math.sin(a) * R, 0, Math.cos(a) * R - R);
    p.rotation.y = a;
    g.add(p);
  });
  setContent(g, { title, tilt: [0, 0, 0], pedestal: false });
  last = { kind: 'images', data: items, title };
  return texs.length;
}

export async function restoreLast() {
  if (!last || !S) return false;
  const { kind, data, title } = last;
  if (kind === 'scene') return showScene(data, title);
  if (kind === 'model') return showModel(data.url, title, { urlMap: data.urlMap });
  if (kind === 'image') return showImage(data, title);
  if (kind === 'images') return !!(await showImages(data, title));
  if (kind === 'map') return !!(await showMap(data.place, data.opts));
  if (kind === 'route') return !!(await showRoute(data.r, data.from, data.to, title));
  if (kind === 'real') return showRealModel(data.models, data.index, title);
  return false;
}

// ---------- Réglages de la vue ----------
function applyHolo(on) {
  const st = S;
  st.content?.traverse((o) => {
    if (!o.isMesh || o.userData.edges || o.userData.noHolo) return;
    if (on && !o.userData.orig) {
      o.userData.orig = o.material;
      o.material = new T.MeshPhongMaterial({ color: HOLO, emissive: 0x0a4f6a, specular: 0xffffff, shininess: 80, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
      const count = o.geometry?.attributes?.position?.count || 0;
      if (count && count < 60000) {
        const edges = new T.LineSegments(new T.EdgesGeometry(o.geometry, 25), new T.LineBasicMaterial({ color: 0x9befff, transparent: true, opacity: 0.8, blending: T.AdditiveBlending }));
        edges.userData.edges = true;
        o.add(edges);
      }
    } else if (!on && o.userData.orig) {
      o.material.dispose();
      o.material = o.userData.orig;
      delete o.userData.orig;
      o.children.filter((c) => c.userData.edges).forEach((c) => { c.geometry.dispose(); c.material.dispose(); o.remove(c); });
    }
  });
}

export function setHolo(on) { if (!S) return; S.holoMode = !!on; applyHolo(S.holoMode); S.layer?.setHolo(S.holoMode); updateButtons(); }
export function setAutoRotate(on) { if (!S) return; S.autoRotate = !!on; S.vel = { x: 0, y: 0 }; updateButtons(); }
export function setHands(on) {
  if (!S) return;
  S.handsOn = !!on;
  if (on && !S.hands) loadHands().then((h) => { if (S) S.hands = h; }).catch(() => {});
  if (!on) S.overlay.getContext('2d').clearRect(0, 0, S.overlay.width, S.overlay.height);
  setHint(on ? handHint() : 'Suivi des mains coupé : touchez ou utilisez la souris.');
  updateButtons();
}

export function reset() {
  const st = S;
  if (st?.layer) { st.layer.reset(); st.vel = { x: 0, y: 0 }; return; }
  if (!st?.holo) return;
  st.holo.position.set(0, 0, 0);
  st.holo.scale.setScalar(1);
  st.holo.rotation.set(...(st.tilt || [0.25, -0.5, 0]));
  st.vel = { x: 0, y: 0 };
}

export function zoom(f) {
  if (S?.layer) S.layer.zoom(f);
  else if (S?.holo) S.holo.scale.setScalar(Math.min(6, Math.max(0.15, S.holo.scale.x * f)));
}

export function turn(yawDeg = 0, pitchDeg = 0) {
  if (S?.layer) { S.layer.rotate(yawDeg * DEG, pitchDeg * DEG); return; }
  if (!S?.holo) return;
  S.holo.rotateOnWorldAxis(new T.Vector3(0, 1, 0), yawDeg * DEG);
  S.holo.rotateOnWorldAxis(new T.Vector3(1, 0, 0), pitchDeg * DEG);
}

export function view(name) {
  if (S?.layer) { S.layer.view(name); S.autoRotate = false; updateButtons(); return; }
  if (!S?.holo) return;
  const v = { top: [Math.PI / 2, 0, 0], front: [0, 0, 0], side: [0, -Math.PI / 2, 0], back: [0, Math.PI, 0], below: [-Math.PI / 2, 0, 0] }[name];
  if (v) { S.holo.rotation.set(...v); S.vel = { x: 0, y: 0 }; S.autoRotate = false; updateButtons(); }
}

export function caption(text) {
  if (!S) return;
  S.caption.textContent = text || '';
  S.caption.classList.toggle('on', !!text);
  clearTimeout(S.captionT);
  if (text) S.captionT = setTimeout(() => S?.caption.classList.remove('on'), Math.min(12000, 2500 + text.length * 60));
}

export function setLoading(text) {
  if (!S) return;
  S.loading.hidden = !text;
  if (text) S.loading.querySelector('.ar-loading-text').textContent = text;
}

function setHint(text) { if (S && S.hint.textContent !== text) S.hint.textContent = text; }
function handHint() {
  if (!S?.handsOn) return 'Suivi des mains coupé';
  if (!S.hands) return 'Chargement du suivi des mains…';
  if (!S.stream) return 'Caméra coupée : touchez ou utilisez la souris';
  return 'Montrez vos mains : 🤏 pincez pour tourner · ✊ poing pour déplacer · 🤏🤏 deux mains pour zoomer';
}

function updateButtons() {
  if (!S) return;
  const set = (k, on) => S.tools.querySelector(`[data-k="${k}"]`)?.setAttribute('aria-pressed', String(!!on));
  set('holo', S.holoMode); set('spin', S.autoRotate); set('hands', S.handsOn);
}

function showHelp(on) {
  if (!S) return;
  S.root.querySelector('.ar-help')?.remove();
  if (!on) return;
  const help = el('div', { class: 'ar-help', role: 'note' },
    el('h3', {}, 'Contrôle avec les doigts'),
    el('ul', {},
      el('li', {}, el('b', {}, '🤏 Pincer et glisser'), ' (pouce + index) : faire tourner'),
      el('li', {}, el('b', {}, '✊ Poing fermé'), ' : saisir et déplacer, approcher la main pour rapprocher'),
      el('li', {}, el('b', {}, '🤏🤏 Pincer avec les deux mains'), ' : écarter pour agrandir, tourner pour pivoter'),
      el('li', {}, el('b', {}, '👆 Toucher'), ' : 1 doigt tourne, 2 doigts zooment et déplacent ; molette à la souris')),
    el('p', {}, 'À la voix : « plus grand », « vue de dessus », « mode hologramme », « arrête de tourner », « ferme la réalité augmentée ».'),
    el('button', { type: 'button', class: 'ar-btn ar-help-ok', onclick: () => { try { localStorage.setItem('jarvis.ar.help', '1'); } catch { /* ignore */ } showHelp(false); } }, 'Compris'));
  S.root.append(help);
}

// ---------- Toucher et souris ----------
function bindPointer() {
  const st = S;
  const c = st.canvas;
  const pts = st.pointers;
  let prev = null;
  const snapshot = () => {
    const a = [...pts.values()];
    if (a.length === 1) return { n: 1, x: a[0].x, y: a[0].y };
    const [p, q] = a;
    return { n: 2, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(p.x - q.x, p.y - q.y), ang: Math.atan2(q.y - p.y, q.x - p.x) };
  };
  c.addEventListener('pointerdown', (e) => {
    c.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, shift: e.shiftKey || e.button === 2 });
    prev = snapshot();
    interact();
  });
  c.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId);
    p.x = e.clientX; p.y = e.clientY;
    const cur = snapshot();
    if (prev && cur.n === prev.n) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const pan = ['map', 'photo'].includes(st.layer?.kind) ? !p.shift : p.shift; // sur une carte, un doigt fait glisser la carte
      if (cur.n === 1 && !pan) rotateBy(dx, dy);
      else if (cur.n === 1) moveBy(dx, dy);
      else {
        zoom(cur.d / Math.max(prev.d, 1));
        moveBy(dx, dy);
        twist(-(cur.ang - prev.ang));
      }
    }
    prev = cur;
  });
  const up = (e) => { pts.delete(e.pointerId); prev = pts.size ? snapshot() : null; };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
  c.addEventListener('contextmenu', (e) => e.preventDefault());
  c.addEventListener('wheel', (e) => { e.preventDefault(); interact(); zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  c.addEventListener('dblclick', () => reset());
}

function interact() { if (S) { S.lastInteract = performance.now(); if (S.autoRotate) { S.autoRotate = false; updateButtons(); } } }

function twist(a) {
  if (S.layer) S.layer.twist(a);
  else S.holo.rotateOnWorldAxis(new T.Vector3(0, 0, 1), a);
}

function spin(ay, ax) {
  if (S.layer) S.layer.rotate(ay, ax);
  else {
    S.holo.rotateOnWorldAxis(new T.Vector3(0, 1, 0), ay);
    S.holo.rotateOnWorldAxis(new T.Vector3(1, 0, 0), ax);
  }
}

function rotateBy(dx, dy) {
  const st = S;
  const k = (Math.PI * 1.6) / Math.min(st.root.clientWidth, st.root.clientHeight);
  const ay = dx * k;
  const ax = dy * k;
  spin(ay, ax);
  st.vel = { x: ax, y: ay };
}

// Déplacement en pixels → unités de la scène à la profondeur de l'hologramme.
function moveBy(dx, dy) {
  const st = S;
  if (st.layer) { st.layer.move(dx, dy); return; }
  const depth = st.camera.position.z - st.holo.position.z;
  const wpp = (2 * depth * Math.tan((st.camera.fov * DEG) / 2)) / st.root.clientHeight;
  st.holo.position.x += dx * wpp;
  st.holo.position.y -= dy * wpp;
}

// ---------- Suivi des mains ----------

function analyzeHand(pts, key) {
  const st = S;
  const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
  const size = Math.max(d(0, 9), 1);
  const curled = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([tip, pip]) => d(tip, 0) < d(pip, 0) * 1.05).length;
  const prevState = st.handState[key] || {};
  const ratio = d(4, 8) / size;
  const fist = curled >= 4 || (curled >= 3 && prevState.fist);
  const pinch = !fist && (prevState.pinch ? ratio < 0.45 : ratio < 0.3);
  // Point de contrôle lissé : milieu pouce-index (pincement) ou centre de la paume (poing).
  const raw = fist ? { x: (pts[0].x + pts[9].x) / 2, y: (pts[0].y + pts[9].y) / 2 } : { x: (pts[4].x + pts[8].x) / 2, y: (pts[4].y + pts[8].y) / 2 };
  const a = prevState.pt ? 0.5 : 1;
  const pt = prevState.pt ? { x: prevState.pt.x + (raw.x - prevState.pt.x) * a, y: prevState.pt.y + (raw.y - prevState.pt.y) * a } : raw;
  const sz = prevState.size ? prevState.size + (size - prevState.size) * 0.3 : size;
  const h = { key, pts, size: sz, pinch, fist, pt };
  st.handState[key] = { pinch, fist, pt, size: sz, seen: performance.now() };
  return h;
}

function drawHands(hands) {
  const st = S;
  const ctx = st.overlay.getContext('2d');
  ctx.clearRect(0, 0, st.root.clientWidth, st.root.clientHeight);
  for (const h of hands) {
    const active = h.pinch || h.fist;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = active ? 'rgba(255, 214, 120, .9)' : 'rgba(110, 225, 255, .75)';
    ctx.beginPath();
    for (const [a, b] of BONES) { ctx.moveTo(h.pts[a].x, h.pts[a].y); ctx.lineTo(h.pts[b].x, h.pts[b].y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(210, 248, 255, .95)';
    for (const i of [4, 8, 12, 16, 20]) { const p = h.pts[i]; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
    ctx.beginPath();
    ctx.arc(h.pt.x, h.pt.y, active ? 16 : 11, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.stroke();
    if (active) { ctx.globalAlpha = 0.25; ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.globalAlpha = 1; }
  }
}

// Machine à gestes : 2 pincements = zoom/rotation/déplacement, poing = saisir et déplacer, 1 pincement = tourner.
function applyGestures(hands) {
  const st = S;
  const pinching = hands.filter((h) => h.pinch);
  const fist = hands.find((h) => h.fist);
  const mode = pinching.length >= 2 ? 'two' : fist ? 'grab' : pinching.length === 1 ? 'rotate' : null;
  const g = st.gesture;
  if (!mode) {
    if (g) { st.gesture = null; setHint(hands.length ? `✋ ${hands.length} main${hands.length > 1 ? 's' : ''} détectée${hands.length > 1 ? 's' : ''} · pincez pour tourner, poing pour déplacer` : handHint()); }
    else if (!hands.length) setHint(handHint());
    else setHint(`✋ ${hands.length} main${hands.length > 1 ? 's' : ''} détectée${hands.length > 1 ? 's' : ''} · pincez pour tourner, poing pour déplacer`);
    return;
  }
  interact();
  if (mode === 'two') {
    const [p, q] = pinching;
    const d = Math.hypot(p.pt.x - q.pt.x, p.pt.y - q.pt.y);
    const mid = { x: (p.pt.x + q.pt.x) / 2, y: (p.pt.y + q.pt.y) / 2 };
    const ang = Math.atan2(q.pt.y - p.pt.y, q.pt.x - p.pt.x);
    if (g?.mode === 'two') {
      zoom(d / Math.max(g.d, 1));
      moveBy(mid.x - g.mid.x, mid.y - g.mid.y);
      let da = ang - g.ang;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      twist(-da);
    }
    st.gesture = { mode, d, mid, ang };
    st.vel = { x: 0, y: 0 };
    setHint('🤏🤏 Écartez pour agrandir · tournez pour pivoter');
  } else if (mode === 'grab') {
    if (g?.mode === 'grab' && g.key === fist.key) {
      moveBy(fist.pt.x - g.pt.x, fist.pt.y - g.pt.y);
      // Main plus grande à l'image = plus proche de la caméra : l'hologramme avance.
      if (!st.layer) st.holo.position.z = Math.min(2.2, Math.max(-5, st.holo.position.z + ((fist.size - g.size) / g.size) * 3));
      else if (Math.abs(fist.size - g.size) / g.size > 0.01) st.layer.zoom(fist.size / g.size);
    }
    st.gesture = { mode, key: fist.key, pt: fist.pt, size: fist.size };
    st.vel = { x: 0, y: 0 };
    setHint('✊ Déplacement · ouvrez la main pour lâcher');
  } else {
    const h = pinching[0];
    if (g?.mode === 'rotate' && g.key === h.key) rotateBy(h.pt.x - g.pt.x, h.pt.y - g.pt.y);
    st.gesture = { mode, key: h.key, pt: h.pt };
    setHint('🤏 Rotation · relâchez pour lancer');
  }
}

function detectHands(now) {
  const st = S;
  if (!st.handsOn || !st.hands || !st.stream || st.video.readyState < 2) return;
  const found = detect(st.hands, st.video, now, { W: st.root.clientWidth, H: st.root.clientHeight, mirror: st.facing === 'user' });
  if (!found) return;
  const hands = found.map((h) => analyzeHand(h.pts, h.key));
  for (const [k, v] of Object.entries(st.handState)) if (now - v.seen > 400) delete st.handState[k];
  drawHands(hands);
  applyGestures(hands);
}

// Qualité adaptative : si l'image saccade (> 28 ms par image en moyenne), on baisse la résolution 3D.
function adaptQuality(dt) {
  const st = S;
  st.qa ||= { sum: 0, n: 0 };
  st.qa.sum += dt; st.qa.n++;
  if (st.qa.n < 45) return;
  const avg = st.qa.sum / st.qa.n;
  st.qa = { sum: 0, n: 0 };
  if (avg > 0.028 && st.dpr > 0.75) { st.dpr = Math.max(0.75, st.dpr - 0.25); st.renderer.setPixelRatio(st.dpr); resize(); }
  else if (avg < 0.018 && st.dpr < Math.min(devicePixelRatio || 1, isPhone() ? 1.5 : 2)) { st.dpr = Math.min(st.dpr + 0.25, 2); st.renderer.setPixelRatio(st.dpr); resize(); }
}

// ---------- Boucle d'animation ----------
function loop(now) {
  const st = S;
  if (!st?.alive) return;
  st.raf = requestAnimationFrame(loop);
  if (!st.renderer) return;
  const dt = Math.min(0.05, st.clock.getDelta());
  detectHands(now);
  for (const a of st.anims) {
    if (a.mixer) a.mixer.update(dt);
    else a.obj.rotation.y += a.spin * dt;
  }
  const idle = !st.gesture && !st.pointers.size;
  if (idle && (Math.abs(st.vel.x) > 1e-4 || Math.abs(st.vel.y) > 1e-4)) {
    // Inertie : l'hologramme continue sur sa lancée puis ralentit.
    spin(st.vel.y, st.vel.x);
    const f = Math.pow(0.9, dt * 60);
    st.vel.x *= f; st.vel.y *= f;
  } else if (idle && st.autoRotate && !st.layer) st.holo.rotateOnWorldAxis(new T.Vector3(0, 1, 0), 0.35 * dt);
  if (st.layer) {
    st.layer.tick(dt, { autoRotate: idle && st.autoRotate });
    return; // rien à dessiner côté Three.js
  }
  adaptQuality(dt);
  st.holo.children.forEach((c) => { if (c.userData.spinner) c.userData.spinner.rotation.z += dt * 0.8; });
  if (st.reveal < 1) {
    st.reveal = Math.min(1, (now - st.revealStart) / 900);
    const e = 1 - Math.pow(1 - st.reveal, 3);
    st.clip.normal.set(0, -1, 0);
    st.clip.constant = st.holo.position.y - st.revealH * st.holo.scale.y + e * 2 * st.revealH * st.holo.scale.y;
    st.renderer.clippingPlanes = st.reveal < 1 ? [st.clip] : [];
  }
  st.renderer.render(st.scene, st.camera);
}

// ---------- Maquettes intégrées (instantanées, sans IA) ----------
const rnd = (n) => Math.round(n * 1000) / 1000;
const BUILTINS = [
  [/^(?:un |le |une |la )?cubes?$/, () => ({ title: 'Cube', speech: 'un cube', parts: [{ shape: 'box', size: [1, 1, 1], color: '#3fc7ff' }] })],
  [/^(?:une |la )?(?:sph[eè]re|boule)s?$/, () => ({ title: 'Sphère', speech: 'une sphère', parts: [{ shape: 'sphere', size: [1], color: '#3fc7ff' }] })],
  [/^(?:une |la )?pyramides?$/, () => ({ title: 'Pyramide', speech: 'une pyramide', parts: [{ shape: 'pyramid', size: [1, 1.4], color: '#f5c46a' }] })],
  [/^(?:un |le )?cylindres?$/, () => ({ title: 'Cylindre', speech: 'un cylindre', parts: [{ shape: 'cylinder', size: [0.6, 1.6], color: '#7ee0a8' }] })],
  [/^(?:un |le )?c[oô]nes?$/, () => ({ title: 'Cône', speech: 'un cône', parts: [{ shape: 'cone', size: [0.8, 1.6], color: '#ff9fb3' }] })],
  [/^(?:un |le |une )?(?:tore|donut|anneau)s?$/, () => ({ title: 'Tore', speech: 'un tore', parts: [{ shape: 'torus', size: [1, 0.35], color: '#c7a8ff', rot: [70, 0, 0] }] })],
  [/^(?:un |l'|l’)?atome(?: de carbone)?$/, () => {
    const parts = [{ shape: 'sphere', size: [0.45], color: '#ff5d6c', label: 'Noyau', glow: true }];
    [0, 60, -60].forEach((tilt, i) => {
      parts.push({ shape: 'torus', size: [1.6, 0.012], rot: [90 + tilt, 0, tilt / 2], color: '#7fdcff', opacity: 0.6 });
      parts.push({ shape: 'sphere', size: [0.1], pos: [1.6 * Math.cos(i * 2), 0, 1.6 * Math.sin(i * 2)], color: '#9ef3ff', glow: true, orbit: 90 + i * 25, label: i === 0 ? 'Électron' : '' });
    });
    return { title: 'Atome', speech: 'un atome', parts };
  }],
  [/^(?:l'|l’|une |la )?(?:adn|double h[ée]lice)$/, () => {
    const parts = [];
    for (let i = 0; i < 24; i++) {
      const a = i * 0.5;
      const y = i * 0.2 - 2.3;
      const p = [rnd(Math.cos(a)), y, rnd(Math.sin(a))];
      const q = [-p[0], y, -p[2]];
      parts.push({ shape: 'sphere', size: [0.13], pos: p, color: '#5ab8ff' }, { shape: 'sphere', size: [0.13], pos: q, color: '#ff8a5b' });
      parts.push({ shape: 'line', from: p, to: q, size: [0.035], color: ['#7ee0a8', '#ffd27c', '#ff9fb3', '#c7a8ff'][i % 4] });
    }
    parts.push({ shape: 'label', pos: [0, 2.6, 0], label: 'ADN' });
    return { title: 'Double hélice d’ADN', speech: 'la double hélice d’ADN', parts };
  }],
  [/^(?:le )?syst[eè]me solaire$/, () => {
    const pl = [['Mercure', 0.08, '#b5a89b', 1.2, 80], ['Vénus', 0.14, '#e8c07a', 1.7, 60], ['Terre', 0.15, '#4d8dff', 2.3, 48], ['Mars', 0.11, '#e0663e', 2.9, 38],
      ['Jupiter', 0.38, '#d9a066', 3.9, 22], ['Saturne', 0.32, '#e8cf8e', 4.9, 16], ['Uranus', 0.22, '#8fe3e0', 5.7, 11], ['Neptune', 0.21, '#4a6bff', 6.4, 8]];
    const parts = [{ shape: 'sphere', size: [0.7], color: '#ffc74a', glow: true, label: 'Soleil' }];
    pl.forEach(([name, r, color, d, speed], i) => {
      const a = i * 1.3;
      parts.push({ shape: 'torus', size: [d, 0.006], rot: [90, 0, 0], color: '#7fdcff', opacity: 0.35 });
      parts.push({ shape: 'sphere', size: [r], pos: [rnd(d * Math.cos(a)), 0, rnd(d * Math.sin(a))], color, orbit: speed, label: name });
      if (name === 'Saturne') parts.push({ shape: 'torus', size: [r * 1.7, 0.03], pos: [rnd(d * Math.cos(a)), 0, rnd(d * Math.sin(a))], rot: [75, 0, 0], color: '#e8d9a8', orbit: speed });
    });
    return { title: 'Système solaire', speech: 'le système solaire', parts };
  }],
  [/^(?:une |la )?mol[ée]cule d'?(?:eau|h2o)$|^h2o$/, () => ({
    title: 'Molécule d’eau (H₂O)', speech: 'une molécule d’eau',
    parts: [
      { shape: 'sphere', size: [0.6], color: '#ff4d4d', label: 'O' },
      { shape: 'sphere', size: [0.36], pos: [0.95, -0.72, 0], color: '#f2f2f2', label: 'H' },
      { shape: 'sphere', size: [0.36], pos: [-0.95, -0.72, 0], color: '#f2f2f2', label: 'H' },
      { shape: 'line', from: [0, 0, 0], to: [0.95, -0.72, 0], size: [0.09], color: '#cfd8e3' },
      { shape: 'line', from: [0, 0, 0], to: [-0.95, -0.72, 0], size: [0.09], color: '#cfd8e3' },
    ],
  })],
];

export function builtin(topic = '') {
  const t = String(topic).toLowerCase().trim().replace(/\s+/g, ' ');
  for (const [re, fn] of BUILTINS) if (re.test(t)) return fn();
  return null;
}
