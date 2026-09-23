// Calques de la réalité augmentée pilotés par les mêmes gestes que les hologrammes :
// - carte 3D réelle (MapLibre + OpenFreeMap : immeubles en relief, rues, itinéraires) ;
// - vrai modèle 3D (visionneuse Sketchfab, des millions de modèles gratuits).
// Interface commune : el, rotate(yaw, pitch) en radians, move(dx, dy) en pixels, zoom(facteur), twist(rad), reset(), tick(dt), destroy().
import * as ui from './ui.js';

const { el } = ui;
const MAPLIBRE = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// Photos aériennes (Esri World Imagery) et relief (Terrain Tiles, AWS) : gratuits, sans clé.
const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const CESIUM = 'https://cdn.jsdelivr.net/npm/cesium@1.145.0/Build/Cesium';
const SKETCHFAB_API = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js';
const DEG = 180 / Math.PI;

const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = el('script', { src, async: '' });
      s.onload = resolve;
      s.onerror = () => { scripts.delete(src); s.remove(); reject(new Error(`Chargement impossible : ${src}`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}
function loadCSS(href) {
  if (!document.querySelector(`link[href="${href}"]`)) document.head.append(el('link', { rel: 'stylesheet', href }));
}

// ====================== Carte 3D ======================
export async function createMap({ center, zoom = 16, pitch = 60, bearing = -20, holo = false, phone = false, satellite = false } = {}) {
  loadCSS(`${MAPLIBRE}/maplibre-gl.css`);
  await loadScript(`${MAPLIBRE}/maplibre-gl.js`);
  const box = el('div', { class: 'ar-layer ar-map' });
  const map = new window.maplibregl.Map({
    container: box, style: MAP_STYLE, center: [center.lon, center.lat], zoom, pitch, bearing,
    interactive: false, attributionControl: { compact: true }, maxPitch: 85,
    pixelRatio: Math.min(devicePixelRatio || 1, phone ? 1.5 : 2), fadeDuration: 0,
  });
  const home = { center: [center.lon, center.lat], zoom, pitch, bearing };
  const layer = {
    kind: 'map', style: satellite ? 'satellite' : 'plan', el: box, map, holo, markers: [], route: null, flying: 0,
    ready: new Promise((resolve, reject) => {
      map.once('load', () => { if (satellite) applySatellite(map); else styleMap(map, layer.holo); resolve(); });
      map.once('error', (e) => { if (!map.loaded()) reject(e?.error || new Error('Carte indisponible')); });
    }),
    rotate(yaw, pitchD) {
      map.setBearing(map.getBearing() - yaw * DEG);
      map.setPitch(Math.max(0, Math.min(85, map.getPitch() - pitchD * DEG)));
    },
    move(dx, dy) { map.panBy([-dx, -dy], { duration: 0 }); },
    zoom(f) { map.setZoom(Math.max(2, Math.min(19.5, map.getZoom() + Math.log2(f)))); },
    twist(a) { map.setBearing(map.getBearing() + a * DEG); },
    reset() {
      this.stopFly();
      if (this.route) this.fitRoute(); else map.easeTo({ ...home, duration: 900 });
    },
    view(name) {
      const p = { top: 0, front: 60, side: 75, back: 60, below: 0 }[name];
      if (p != null) map.easeTo({ pitch: p, bearing: name === 'back' ? map.getBearing() + 180 : map.getBearing(), duration: 700 });
    },
    setHolo(on) { this.holo = on; if (this.style === 'plan' && map.isStyleLoaded()) styleMap(map, on); },
    tick(dt, { autoRotate }) { if (autoRotate && !this.flying) map.setBearing(map.getBearing() + dt * 6); },
    addMarker(p, label, cls = '') {
      const m = new window.maplibregl.Marker({ element: el('div', { class: `ar-pin ${cls}` }, el('span', {}, label)), anchor: 'bottom' })
        .setLngLat([p.lon, p.lat]).addTo(map);
      this.markers.push(m);
      return m;
    },
    async showRoute(geometry, from, to) {
      await this.ready;
      this.route = geometry;
      const data = { type: 'Feature', geometry, properties: {} };
      if (map.getSource('route')) map.getSource('route').setData(data);
      else {
        map.addSource('route', { type: 'geojson', data });
        map.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#35d6ff', 'line-width': 16, 'line-opacity': 0.3, 'line-blur': 6 } });
        map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7ff0ff', 'line-width': 5 } });
      }
      this.markers.forEach((m) => m.remove());
      this.markers = [];
      this.addMarker(from, 'Départ', 'start');
      this.addMarker(to, 'Arrivée', 'end');
      this.fitRoute();
    },
    fitRoute() {
      map.resize();
      const c = this.route.coordinates;
      const b = c.reduce((acc, [x, y]) => [Math.min(acc[0], x), Math.min(acc[1], y), Math.max(acc[2], x), Math.max(acc[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
      const c2 = map.getContainer();
      const pad = Math.round(Math.max(24, Math.min(90, Math.min(c2.clientWidth, c2.clientHeight) * 0.12)));
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, pitch: 55, bearing: map.getBearing(), duration: 1200, maxZoom: 17 });
    },
    // Survol animé de l'itinéraire, caméra derrière le trajet.
    fly() {
      if (!this.route) return;
      this.stopFly();
      const pts = this.route.coordinates;
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * 1.5));
      const total = lens[lens.length - 1] || 1;
      const ms = Math.min(45000, Math.max(12000, total * 2.5e6));
      const t0 = performance.now();
      const at = (d) => {
        let i = lens.findIndex((l) => l >= d);
        if (i <= 0) i = 1;
        const k = (d - lens[i - 1]) / Math.max(1e-9, lens[i] - lens[i - 1]);
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
      };
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms);
        const d = u * total;
        const p = at(d);
        const q = at(Math.min(total, d + total * 0.02));
        const bearing = Math.atan2(q[0] - p[0], (q[1] - p[1]) * 1.5) * DEG;
        map.jumpTo({ center: p, zoom: 17, pitch: 65, bearing });
        this.flying = u < 1 ? requestAnimationFrame(step) : 0;
        if (!this.flying) this.fitRoute();
      };
      this.flying = requestAnimationFrame(step);
    },
    stopFly() { if (this.flying) cancelAnimationFrame(this.flying); this.flying = 0; },
    destroy() { this.stopFly(); map.remove(); box.remove(); },
  };
  return layer;
}

// Vue satellite : photos aériennes réelles posées sur le relief, immeubles translucides, noms lisibles.
function applySatellite(map) {
  map.addSource('sat', { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' });
  map.addSource('dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Relief : Terrain Tiles (AWS, Mapzen)' });
  const layers = map.getStyle().layers;
  const firstSymbol = layers.find((l) => l.type === 'symbol')?.id;
  for (const l of layers) {
    if (['fill', 'line', 'background', 'hillshade', 'raster'].includes(l.type)) map.setLayoutProperty(l.id, 'visibility', 'none');
    if (l.type === 'symbol') {
      try { map.setPaintProperty(l.id, 'text-color', '#ffffff'); map.setPaintProperty(l.id, 'text-halo-color', 'rgba(0,0,0,0.85)'); map.setPaintProperty(l.id, 'text-halo-width', 1.6); } catch { /* calque sans texte */ }
    }
  }
  map.addLayer({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 0 } }, firstSymbol);
  if (map.getLayer('building-3d')) {
    map.setPaintProperty('building-3d', 'fill-extrusion-color', '#f4efe6');
    map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.45);
  }
  map.setTerrain({ source: 'dem', exaggeration: 1.15 });
}

// Couleurs de la carte : réalistes (style d'origine), ou hologramme (fond sombre, immeubles cyan lumineux).
function styleMap(map, holo) {
  const orig = (map.__orig ||= {});
  const set = (id, prop, v) => {
    try {
      if (!map.getLayer(id)) return;
      const key = `${id}|${prop}`;
      if (!(key in orig)) orig[key] = map.getPaintProperty(id, prop);
      map.setPaintProperty(id, prop, v);
    } catch { /* propriété absente */ }
  };
  if (!holo) {
    // Retour aux valeurs d'origine enregistrées (les calques ajoutés, comme l'itinéraire, sont conservés).
    for (const [key, v] of Object.entries(orig)) {
      const [id, prop] = key.split('|');
      try { if (map.getLayer(id)) map.setPaintProperty(id, prop, v); } catch { /* ignore */ }
    }
    set('building-3d', 'fill-extrusion-opacity', 0.95);
    return;
  }
  set('building-3d', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], 0, '#0d4f6e', 60, '#2fb8e6', 200, '#9ef3ff']);
  set('building-3d', 'fill-extrusion-opacity', 0.85);
  for (const l of map.getStyle().layers) {
    if (/^route-/.test(l.id)) continue;
    if (l.type === 'background') set(l.id, 'background-color', '#050b16');
    else if (l.type === 'fill' && l.id !== 'building') set(l.id, 'fill-color', /water/.test(l.id) ? '#0a2640' : '#081324');
    else if (l.type === 'line' && /road|street|highway|bridge|tunnel|path/.test(l.id)) set(l.id, 'line-color', '#1b6f94');
  }
}

// ====================== Villes 3D photoréalistes (Google, via Cesium ion) ======================
const DEGR = Math.PI / 180;
export async function createPhoto({ center, query = '', token, zoom = 16, pitch = 60, bearing = -20, phone = false } = {}) {
  loadCSS(`${CESIUM}/Widgets/widgets.css`);
  window.CESIUM_BASE_URL = `${CESIUM}/`;
  await loadScript(`${CESIUM}/Cesium.js`);
  const C = window.Cesium;
  C.Ion.defaultAccessToken = token;
  const box = el('div', { class: 'ar-layer ar-photo' });
  const viewer = new C.Viewer(box, {
    globe: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
    skyBox: false, skyAtmosphere: false, msaaSamples: phone ? 1 : 4, contextOptions: { webgl: { alpha: true } },
  });
  viewer.scene.backgroundColor = C.Color.TRANSPARENT; // la caméra reste visible autour de la ville
  viewer.scene.screenSpaceCameraController.enableInputs = false; // gestes gérés par Jarvis
  viewer.resolutionScale = phone ? 0.8 : 1;
  let tileset;
  try {
    tileset = await C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
  } catch (e) {
    viewer.destroy();
    throw Object.assign(new Error('Jeton Cesium refusé ou villes 3D indisponibles'), { cause: e });
  }
  tileset.maximumScreenSpaceError = phone ? 24 : 16; // un peu moins de détails sur téléphone, bien plus fluide
  viewer.scene.primitives.add(tileset);
  // Les villes de Google s'utilisent avec le géocodeur de Google (conditions d'utilisation) : on recentre avec lui.
  if (query) {
    try {
      const gc = new C.IonGeocoderService({ scene: viewer.scene, geocodeProviderType: C.IonGeocodeProviderType.GOOGLE });
      const dest = (await gc.geocode(query))?.[0]?.destination;
      const carto = dest instanceof C.Rectangle ? C.Rectangle.center(dest) : dest ? C.Cartographic.fromCartesian(dest) : null;
      if (carto) center = { lat: C.Math.toDegrees(carto.latitude), lon: C.Math.toDegrees(carto.longitude) };
    } catch (e) { console.warn('[Jarvis] géocodeur Google :', e); }
  }

  // Caméra en orbite autour d'un point au sol (même logique que les autres calques).
  const rangeFor = (z) => Math.max(120, 40000000 / 2 ** z);
  let orbit = { lon: center.lon, lat: center.lat, h: 0, heading: bearing * DEGR, pitch: -Math.max(12, Math.min(85, 90 - pitch)) * DEGR, range: rangeFor(zoom) };
  const home = { ...orbit };
  const apply = () => {
    viewer.camera.lookAt(C.Cartesian3.fromDegrees(orbit.lon, orbit.lat, orbit.h), new C.HeadingPitchRange(orbit.heading, orbit.pitch, orbit.range));
  };
  apply();
  // Hauteur réelle du sol au centre (villes en altitude), une fois les premières tuiles chargées.
  const settle = () => viewer.scene.sampleHeightMostDetailed([C.Cartographic.fromDegrees(orbit.lon, orbit.lat)]).then(([c]) => {
    if (Number.isFinite(c?.height)) { orbit.h = c.height; home.h = c.height; apply(); }
  }).catch(() => {});
  const onLoad = tileset.initialTilesLoaded.addEventListener(() => { onLoad(); settle(); });
  const entities = [];
  let flying = 0;
  let route = null;
  const layer = {
    kind: 'photo', style: 'photo', el: box, viewer,
    ready: new Promise((resolve) => { const off = tileset.initialTilesLoaded.addEventListener(() => { off(); resolve(); }); setTimeout(resolve, 15000); }),
    rotate(yaw, pitchD) {
      orbit.heading -= yaw;
      orbit.pitch = Math.max(-89 * DEGR, Math.min(-4 * DEGR, orbit.pitch - pitchD));
      apply();
    },
    move(dx, dy) {
      const k = orbit.range * 0.0014; // mètres par pixel, à peu près
      const e = (-dx * Math.cos(orbit.heading) + dy * Math.sin(orbit.heading)) * k;
      const n = (dx * Math.sin(orbit.heading) + dy * Math.cos(orbit.heading)) * k;
      orbit.lat += n / 111320;
      orbit.lon += e / (111320 * Math.cos(orbit.lat * DEGR));
      apply();
    },
    zoom(f) { orbit.range = Math.max(40, Math.min(3e6, orbit.range / f)); apply(); },
    twist(a) { orbit.heading += a; apply(); },
    reset() { this.stopFly(); if (route) this.fitRoute(); else { orbit = { ...home }; apply(); } },
    view(name) {
      const p = { top: -89, front: -30, side: -20, back: -30, below: -10 }[name];
      if (p == null) return;
      orbit.pitch = p * DEGR;
      if (name === 'back') orbit.heading += Math.PI;
      apply();
    },
    setHolo() {},
    tick(dt, { autoRotate }) { if (autoRotate && !flying) { orbit.heading += dt * 0.08; apply(); } },
    async showRoute(geometry, from, to) {
      route = geometry;
      entities.splice(0).forEach((x) => viewer.entities.remove(x));
      entities.push(viewer.entities.add({
        polyline: { positions: C.Cartesian3.fromDegreesArray(geometry.coordinates.flat()), width: 10, clampToGround: true,
          material: new C.PolylineGlowMaterialProperty({ glowPower: 0.3, color: C.Color.fromCssColorString('#5fe8ff') }) },
      }));
      const pin = (p, text, color) => viewer.entities.add({
        position: C.Cartesian3.fromDegrees(p.lon, p.lat, 0),
        point: { pixelSize: 12, color: C.Color.fromCssColorString(color), outlineColor: C.Color.WHITE, outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text, font: '600 15px Inter, system-ui, sans-serif', fillColor: C.Color.fromCssColorString('#05080f'), showBackground: true, backgroundColor: C.Color.fromCssColorString(color),
          pixelOffset: new C.Cartesian2(0, -24), heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      entities.push(pin(from, 'Départ', '#6fe3ff'), pin(to, 'Arrivée', '#ffc95c'));
      this.fitRoute();
    },
    fitRoute() {
      if (!route) return;
      const c = route.coordinates;
      const lons = c.map((x) => x[0]);
      const lats = c.map((x) => x[1]);
      const [w, e, s2, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
      const span = Math.max((e - w) * 111320 * Math.cos(((n + s2) / 2) * DEGR), (n - s2) * 111320);
      orbit = { ...orbit, lon: (w + e) / 2, lat: (s2 + n) / 2, pitch: -50 * DEGR, range: Math.max(400, span * 1.5) };
      apply();
    },
    fly() {
      if (!route) return;
      this.stopFly();
      const pts = route.coordinates;
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * Math.cos(pts[i][1] * DEGR), pts[i][1] - pts[i - 1][1]));
      const total = lens[lens.length - 1] || 1e-9;
      const ms = Math.min(45000, Math.max(12000, total * 111320 * 8));
      const at = (d) => {
        let i = lens.findIndex((l) => l >= d);
        if (i <= 0) i = 1;
        const k = (d - lens[i - 1]) / Math.max(1e-12, lens[i] - lens[i - 1]);
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
      };
      const t0 = performance.now();
      const step = (now) => {
        const u = Math.min(1, (now - t0) / ms);
        const p = at(u * total);
        const q = at(Math.min(total, u * total + total * 0.03));
        orbit = { ...orbit, lon: p[0], lat: p[1], range: 260, pitch: -28 * DEGR, heading: Math.atan2((q[0] - p[0]) * Math.cos(p[1] * DEGR), q[1] - p[1]) };
        apply();
        flying = u < 1 ? requestAnimationFrame(step) : 0;
        if (!flying) this.fitRoute();
      };
      flying = requestAnimationFrame(step);
    },
    stopFly() { if (flying) cancelAnimationFrame(flying); flying = 0; },
    destroy() { this.stopFly(); viewer.destroy(); box.remove(); },
  };
  return layer;
}

// ====================== Vrai modèle 3D (Sketchfab) ======================
// Recherche de modèles visibles gratuitement ; les plus légers passent en premier sur téléphone.
export async function searchModels(query, { phone = false } = {}) {
  const u = new URL('https://api.sketchfab.com/v3/search');
  u.searchParams.set('type', 'models');
  u.searchParams.set('q', query);
  u.searchParams.set('count', '24');
  u.searchParams.set('max_face_count', phone ? '300000' : '800000');
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Sketchfab HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || [])
    .filter((m) => m.uid && !m.isAgeRestricted)
    .map((m) => ({
      uid: m.uid, name: m.name, author: m.user?.displayName || m.user?.username || '', license: m.license?.label || '',
      url: m.viewerUrl, faces: m.faceCount || 0, likes: m.likeCount || 0,
      thumb: (m.thumbnails?.images || []).sort((a, b) => a.width - b.width).find((i) => i.width >= 200)?.url || '',
    }));
}

export async function createModel(model, { onReady, onError } = {}) {
  await loadScript(SKETCHFAB_API);
  const frame = el('iframe', { title: model.name, allow: 'autoplay; fullscreen; xr-spatial-tracking', tabindex: '-1' });
  const box = el('div', { class: 'ar-layer ar-model' }, frame, el('div', { class: 'ar-credit' }, `« ${model.name} » par ${model.author || 'un auteur'} · Sketchfab${model.license ? ` · ${model.license}` : ''}`));
  let api = null;
  let orbit = null; // { target, dist, yaw, pitch }
  let home = null;
  let dirty = false;
  let lastSend = 0;
  const apply = (duration = 0) => {
    if (!api || !orbit) return;
    const { target: t, dist, yaw, pitch } = orbit;
    const pos = [t[0] + dist * Math.cos(pitch) * Math.cos(yaw), t[1] + dist * Math.cos(pitch) * Math.sin(yaw), t[2] + dist * Math.sin(pitch)];
    api.setCameraLookAt(pos, t, duration);
    dirty = false;
    lastSend = performance.now();
  };
  const layer = {
    kind: 'model', el: box, model,
    rotate(yaw, pitch) { if (!orbit) return; orbit.yaw -= yaw; orbit.pitch = Math.max(-1.4, Math.min(1.4, orbit.pitch + pitch)); dirty = true; },
    move(dx, dy) {
      if (!orbit) return;
      const k = orbit.dist * 0.0022;
      const { yaw } = orbit;
      orbit.target = [orbit.target[0] + Math.sin(yaw) * dx * k, orbit.target[1] - Math.cos(yaw) * dx * k, orbit.target[2] + dy * k];
      dirty = true;
    },
    zoom(f) { if (!orbit) return; orbit.dist = Math.max(home.dist * 0.08, Math.min(home.dist * 8, orbit.dist / f)); dirty = true; },
    twist(a) { this.rotate(a, 0); },
    reset() { if (home) { orbit = { ...home, target: [...home.target] }; apply(0.8); } },
    view(name) {
      if (!orbit) return;
      const p = { top: 1.35, front: 0.15, side: 0.15, back: 0.15, below: -1.2 }[name];
      if (p == null) return;
      orbit.pitch = p;
      if (name === 'side') orbit.yaw = home.yaw + Math.PI / 2;
      if (name === 'back') orbit.yaw = home.yaw + Math.PI;
      if (name === 'front') orbit.yaw = home.yaw;
      apply(0.7);
    },
    setHolo() {},
    tick(dt, { autoRotate }) {
      if (autoRotate && orbit) { orbit.yaw += dt * 0.35; dirty = true; }
      if (dirty && performance.now() - lastSend > 33) apply(0);
    },
    destroy() { box.remove(); },
  };
  const client = new window.Sketchfab('1.12.1', frame);
  client.init(model.uid, {
    autostart: 1, preload: 1, transparent: 1, camera: 0, dnt: 1, scrollwheel: 0, double_click: 0,
    ui_controls: 0, ui_infos: 0, ui_inspector: 0, ui_settings: 0, ui_watermark: 0, ui_watermark_link: 0, ui_help: 0, ui_hint: 0,
    ui_stop: 0, ui_annotations: 0, ui_ar: 0, ui_vr: 0, ui_fullscreen: 0, ui_start: 0, ui_theme: 'dark',
    success(a) {
      api = a;
      api.start();
      api.addEventListener('viewerready', () => {
        api.getCameraLookAt((err, cam) => {
          if (!err && cam) {
            const [px, py, pz] = cam.position;
            const t = cam.target;
            const v = [px - t[0], py - t[1], pz - t[2]];
            const dist = Math.hypot(...v) || 1;
            home = { target: [...t], dist, yaw: Math.atan2(v[1], v[0]), pitch: Math.asin(Math.max(-1, Math.min(1, v[2] / dist))) };
            orbit = { ...home, target: [...t] };
          }
          onReady?.();
        });
      });
    },
    error() { onError?.(new Error('Visionneuse Sketchfab indisponible')); },
  });
  return layer;
}
