// Services externes 100 % gratuits (la plupart sans clé) :
// Wikipédia / Wikimedia Commons / Openverse (images, savoir), Pollinations (génération d'images),
// YouTube (vidéos), Radio Browser (musique), Open-Meteo (météo).
import { settings } from './settings.js';

const lang2 = () => (settings.lang || 'fr-FR').slice(0, 2);

export async function fetchJSON(url, { timeout = 8000, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) {
      // Garde la raison donnée par le service (clé refusée, modèle arrêté, quota…) pour l'afficher.
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      try { const b = await res.json(); err.detail = String(b?.error?.message || b?.message || b?.error || '').slice(0, 200); } catch { /* corps illisible */ }
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Petit cache mémoire pour éviter de refaire les mêmes requêtes.
const cache = new Map();
async function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const p = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, p);
  return p;
}

// Première réponse réussie parmi plusieurs sources.
async function firstOk(fns) {
  let lastErr;
  for (const fn of fns) {
    try {
      const r = await fn();
      if (r && (!Array.isArray(r) || r.length)) return r;
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  return [];
}

// ---------------- Images ----------------
async function commonsImages(q) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '16', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '480',
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const data = await fetchJSON(u);
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => a.index - b.index);
  return pages.map((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii) return null;
    return {
      thumb: ii.thumburl || ii.url,
      full: ii.url,
      title: (ii.extmetadata?.ObjectName?.value || p.title.replace(/^File:|\.\w+$/g, '')).replace(/<[^>]+>/g, ''),
      source: ii.descriptionurl,
    };
  }).filter(Boolean);
}

async function openverseImages(q) {
  const data = await fetchJSON(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=16&mature=false`);
  return (data.results || []).map((r) => ({ thumb: r.thumbnail || r.url, full: r.url, title: r.title || q, source: r.foreign_landing_url }));
}

export function searchImages(q) {
  return cached(`img:${q}`, () => firstOk([() => openverseImages(q), () => commonsImages(q)]));
}

export function generateImageURL(prompt, { width = 1024, height = 1024 } = {}) {
  const seed = Math.floor(Math.random() * 1e6);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&referrer=jarvis-pwa`;
}

// ---------------- Wikipédia (étude de sujets) ----------------
export async function wikiLookup(topic, lang = lang2()) {
  return cached(`wiki:${lang}:${topic}`, async () => {
    const base = `https://${lang}.wikipedia.org`;
    const s = await fetchJSON(`${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=3&format=json&origin=*`);
    const hit = s?.query?.search?.[0];
    if (!hit) return null;
    const title = hit.title;
    const [summary, full] = await Promise.all([
      fetchJSON(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`).catch(() => null),
      fetchJSON(`${base}/w/api.php?action=query&prop=extracts|pageimages&explaintext=1&exsectionformat=plain&piprop=original&titles=${encodeURIComponent(title)}&format=json&origin=*&redirects=1`).catch(() => null),
    ]);
    const page = Object.values(full?.query?.pages || {})[0] || {};
    return {
      title,
      summary: summary?.extract || '',
      text: (page.extract || summary?.extract || '').slice(0, 9000),
      image: summary?.originalimage?.source || summary?.thumbnail?.source || page.original?.source || '',
      url: summary?.content_urls?.desktop?.page || `${base}/wiki/${encodeURIComponent(title)}`,
      related: (s.query.search || []).slice(1).map((r) => r.title),
    };
  });
}

// ---------------- YouTube ----------------
const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'];
const INVIDIOUS = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be'];

async function ytDataAPI(q) {
  const data = await fetchJSON(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&q=${encodeURIComponent(q)}&key=${settings.youtubeKey}`);
  return (data.items || []).map((it) => ({
    id: it.id.videoId,
    title: decodeEntities(it.snippet.title),
    channel: it.snippet.channelTitle,
    thumb: it.snippet.thumbnails?.medium?.url,
  }));
}
async function pipedSearch(base, q) {
  const data = await fetchJSON(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`, { timeout: 5000 });
  return (data.items || []).filter((i) => i.url?.includes('watch?v=')).slice(0, 8).map((i) => ({
    id: i.url.split('v=')[1].split('&')[0], title: i.title, channel: i.uploaderName, thumb: i.thumbnail,
  }));
}
async function invidiousSearch(base, q) {
  const data = await fetchJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { timeout: 5000 });
  return (data || []).slice(0, 8).map((i) => ({
    id: i.videoId, title: i.title, channel: i.author, thumb: `https://i.ytimg.com/vi/${i.videoId}/mqdefault.jpg`,
  }));
}
function decodeEntities(s = '') {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

// Course entre les sources gratuites : la plus rapide gagne.
function race(fns) {
  return new Promise((resolve, reject) => {
    let pending = fns.length;
    if (!pending) return reject(new Error('aucune source'));
    fns.forEach((fn) => fn().then((r) => {
      if (r?.length) resolve(r);
      else if (--pending === 0) reject(new Error('aucun résultat'));
    }).catch(() => { if (--pending === 0) reject(new Error('aucun résultat')); }));
  });
}

export function searchVideos(q) {
  return cached(`yt:${q}`, async () => {
    if (settings.youtubeKey) {
      try { return await ytDataAPI(q); } catch { /* repli sur les instances libres */ }
    }
    return race([...PIPED.map((b) => () => pipedSearch(b, q)), ...INVIDIOUS.map((b) => () => invidiousSearch(b, q))]);
  });
}

export const youtubeSearchURL = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// ---------------- Radio (musique en continu) ----------------
const RADIO = ['https://de1.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://de2.api.radio-browser.info'];

async function radioQuery(path) {
  return firstOk(RADIO.map((b) => () => fetchJSON(`${b}${path}`, { timeout: 6000 })));
}

export async function searchRadio(q) {
  return cached(`radio:${q}`, async () => {
    const common = 'hidebroken=true&order=clickcount&reverse=true&limit=30';
    const tag = normalizeTag(q);
    let list = [];
    if (tag) list = await radioQuery(`/json/stations/search?tag=${encodeURIComponent(tag)}&${common}`).catch(() => []);
    if (!list.length) list = await radioQuery(`/json/stations/search?name=${encodeURIComponent(q)}&${common}`).catch(() => []);
    if (!list.length && !tag) list = await radioQuery(`/json/stations/search?tag=${encodeURIComponent(q.toLowerCase())}&${common}`).catch(() => []);
    // Flux HTTPS uniquement (un site sécurisé bloque le HTTP) ; on tente la version HTTPS des autres en dernier.
    const key = (tag || q).toLowerCase();
    const score = (st) => (st.name.toLowerCase().includes(key) ? 2 : 0) + ((st.tags || '').split(',')[0] === key ? 1 : 0)
      + (st.url_resolved.startsWith('https://') ? 4 : 0);
    return list
      .filter((st) => /^https?:\/\//.test(st.url_resolved || ''))
      .map((st, i) => ({ st, i, sc: score(st) }))
      .sort((a, b) => b.sc - a.sc || a.i - b.i)
      .map(({ st }) => ({
        name: st.name.trim(), url: st.url_resolved.replace(/^http:/, 'https:'), tags: st.tags, country: st.country, favicon: st.favicon,
      }));
  });
}

const GENRES = {
  jazz: 'jazz', rock: 'rock', pop: 'pop', rap: 'hip-hop', 'hip hop': 'hip-hop', 'hip-hop': 'hip-hop', classique: 'classical',
  classical: 'classical', electro: 'electronic', électro: 'electronic', electronique: 'electronic', électronique: 'electronic',
  techno: 'techno', house: 'house', lofi: 'lofi', 'lo-fi': 'lofi', 'lo fi': 'lofi', chill: 'chillout', chillout: 'chillout',
  reggae: 'reggae', blues: 'blues', metal: 'metal', métal: 'metal', funk: 'funk', soul: 'soul', 'r&b': 'rnb', rnb: 'rnb',
  country: 'country', ambient: 'ambient', ambiance: 'ambient', relax: 'relax', relaxante: 'relax', détente: 'relax',
  zen: 'relax', latino: 'latin', salsa: 'salsa', disco: 'disco', variété: 'french', 'variété française': 'french',
  française: 'french', francais: 'french', français: 'french', 'annees 80': '80s', 'années 80': '80s', '80s': '80s', '90s': '90s',
  'années 90': '90s', 'années 70': '70s', kpop: 'kpop', 'k-pop': 'kpop', afro: 'afrobeat', afrobeat: 'afrobeat', dance: 'dance',
  piano: 'piano', gospel: 'gospel', trap: 'trap', drill: 'drill', dubstep: 'dubstep', 'drum and bass': 'drum and bass',
  news: 'news', info: 'news', infos: 'news', sport: 'sport', 'musique de film': 'soundtrack', 'bande originale': 'soundtrack',
  concentration: 'lofi', travail: 'lofi', étude: 'lofi', dormir: 'sleep', sommeil: 'sleep', noël: 'christmas', noel: 'christmas',
};
export function normalizeTag(q = '') {
  const k = q.toLowerCase().trim().replace(/^(de la |du |de l'|des |le |la |les )/, '').replace(/^(musique|radio|son)s?\s*/, '').trim();
  return GENRES[k] || null;
}
export const isGenre = (q) => !!normalizeTag(q) || /^(musique|radio|de la musique)$/i.test(q.trim());

// ---------------- Météo ----------------
const WMO = {
  0: ['Ciel dégagé', '☀️'], 1: ['Plutôt dégagé', '🌤️'], 2: ['Partiellement nuageux', '⛅'], 3: ['Couvert', '☁️'],
  45: ['Brouillard', '🌫️'], 48: ['Brouillard givrant', '🌫️'], 51: ['Bruine légère', '🌦️'], 53: ['Bruine', '🌦️'], 55: ['Bruine forte', '🌧️'],
  61: ['Pluie faible', '🌦️'], 63: ['Pluie', '🌧️'], 65: ['Forte pluie', '🌧️'], 66: ['Pluie verglaçante', '🌧️'], 67: ['Pluie verglaçante', '🌧️'],
  71: ['Neige faible', '🌨️'], 73: ['Neige', '🌨️'], 75: ['Forte neige', '❄️'], 77: ['Grains de neige', '🌨️'],
  80: ['Averses', '🌦️'], 81: ['Averses', '🌧️'], 82: ['Fortes averses', '⛈️'], 85: ['Averses de neige', '🌨️'], 86: ['Averses de neige', '❄️'],
  95: ['Orage', '⛈️'], 96: ['Orage et grêle', '⛈️'], 99: ['Orage et grêle', '⛈️'],
};
export const wmo = (c) => WMO[c] || ['—', '🌡️'];

function geolocate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, name: 'votre position' }),
      () => resolve(null), { timeout: 6000, maximumAge: 600000 },
    );
  });
}

export async function getWeather(city) {
  let place = null;
  if (city) {
    const g = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${lang2()}`);
    const r = g.results?.[0];
    if (r) place = { latitude: r.latitude, longitude: r.longitude, name: [r.name, r.admin1, r.country].filter(Boolean).join(', ') };
  }
  if (!place) place = await geolocate();
  if (!place) place = { latitude: 48.8566, longitude: 2.3522, name: 'Paris' };
  const w = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`);
  return { place: place.name, current: w.current, daily: w.daily };
}
