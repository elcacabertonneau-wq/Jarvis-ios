// Géographie gratuite et sans clé : recherche de lieux (Photon / OpenStreetMap), itinéraires (OSRM),
// consignes de navigation en français et position de l'utilisateur.
import { fetchJSON } from './services.js';

export const MODES = {
  foot: { label: 'À pied', icon: '🚶', server: 'routed-foot', profile: 'foot' },
  bike: { label: 'À vélo', icon: '🚲', server: 'routed-bike', profile: 'bike' },
  car: { label: 'En voiture', icon: '🚗', server: 'routed-car', profile: 'driving' },
};

export function modeFrom(text = '') {
  const t = String(text).toLowerCase();
  if (/voiture|auto|conduire|car|driv|taxi|moto/.test(t)) return 'car';
  if (/v[ée]lo|bike|cycl|trottinette/.test(t)) return 'bike';
  if (/pied|marche|foot|walk|pi[ée]ton/.test(t)) return 'foot';
  return '';
}

const HERE = /^(?:ici|chez moi|ma position|o[uù] je suis|l[àa] o[uù] je suis|moi|my location|here)$/i;

// Position actuelle (demande l'autorisation une fois).
export function currentPosition(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Géolocalisation indisponible')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, name: 'Votre position', label: 'Votre position' }),
      () => reject(new Error('Position refusée')),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

// Recherche d'un lieu. `near` ({lat, lon}) favorise les résultats proches.
export async function geocode(query, near = null) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Lieu vide');
  if (HERE.test(q)) return currentPosition();
  const generic = near && genericTag(q);
  if (generic) {
    // « la gare », « une pharmacie » : le plus proche du point de départ.
    const g = new URL('https://photon.komoot.io/api/');
    Object.entries({ q: generic.word, limit: '15', lang: 'fr', lat: near.lat, lon: near.lon, osm_tag: generic.tag }).forEach(([k, v]) => g.searchParams.set(k, v));
    const d = await fetchJSON(g, { timeout: 10000 }).catch(() => null);
    const feats = (d?.features || []).map((f) => ({ f, km: kmBetween(near, { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }) })).sort((a, b) => a.km - b.km);
    if (feats.length && feats[0].km < 30) return toPlace(feats[0].f, q);
  }
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '5');
  u.searchParams.set('lang', 'fr');
  if (near) { u.searchParams.set('lat', near.lat); u.searchParams.set('lon', near.lon); }
  const data = await fetchJSON(u, { timeout: 10000 });
  const f = pickBest(data?.features || [], q, near);
  if (!f) throw new Error(`Lieu introuvable : ${q}`);
  return toPlace(f, q);
}

function toPlace(f, q) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  const place = [p.name, p.street && !p.name ? p.street : '', p.city && p.city !== p.name ? p.city : '', p.country].filter(Boolean);
  return {
    lat, lon, name: p.name || p.street || q, label: place.join(', '),
    kind: `${p.osm_key || ''}:${p.osm_value || ''}`, extent: p.extent || null,
  };
}

function kmBetween(a, b) {
  return Math.hypot((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 111;
}

const GENERIC = [
  [/^(?:gare|gare sncf|station de train)$/, 'gare', 'railway:station'],
  [/^(?:station de )?m[ée]tro$/, 'métro', 'railway:subway_entrance'],
  [/^pharmacie$/, 'pharmacie', 'amenity:pharmacy'], [/^h[ôo]pital$|^urgences$/, 'hôpital', 'amenity:hospital'],
  [/^supermarch[ée]$|^supérette$/, 'supermarché', 'shop:supermarket'], [/^boulangerie$/, 'boulangerie', 'shop:bakery'],
  [/^a[ée]roport$/, 'aéroport', 'aeroway:aerodrome'], [/^restaurant$/, 'restaurant', 'amenity:restaurant'],
  [/^caf[ée]$|^bar$/, 'café', 'amenity:cafe'], [/^banque$/, 'banque', 'amenity:bank'], [/^distributeur(?: de billets)?$/, 'distributeur', 'amenity:atm'],
  [/^parc$/, 'parc', 'leisure:park'], [/^(?:bureau de )?poste$/, 'poste', 'amenity:post_office'], [/^parking$/, 'parking', 'amenity:parking'],
  [/^station[- ](?:service|essence)$/, 'station-service', 'amenity:fuel'], [/^cin[ée]ma$/, 'cinéma', 'amenity:cinema'],
  [/^mus[ée]e$/, 'musée', 'tourism:museum'], [/^h[ôo]tel$/, 'hôtel', 'tourism:hotel'], [/^plage$/, 'plage', 'natural:beach'],
];
function genericTag(q) {
  const t = String(q).toLowerCase().trim().replace(/^(?:la |le |les |l'|l’|une |un |des |du )/, '').replace(/\s+(?:la |le )?plus proche$|\s+(?:le |la )?plus pr[èe]s$|\s+d'ici$/, '').trim();
  for (const [re, word, tag] of GENERIC) if (re.test(t)) return { word, tag };
  return null;
}

// Choisit le meilleur résultat : nom ressemblant, lieu « important » (ville, musée, monument) plutôt qu'un arrêt
// ou une boutique, et, s'il y a un point de référence, proche de lui (« Louvre » près de la tour Eiffel = le musée, pas Louvres).
const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function pickBest(features, q, near) {
  const fq = fold(q).replace(/^(la|le|les|l) /, '');
  let best = null;
  features.forEach((f, rank) => {
    const p = f.properties || {};
    const name = fold(p.name);
    let score = rank * 0.3;
    score += name === fq ? 0 : name.includes(fq) || fq.includes(name) ? 1 : 3;
    const key = p.osm_key || '';
    const val = p.osm_value || '';
    if (/^(tourism|historic|place|boundary)$/.test(key)) score -= 0.5;
    else if (/^(highway|shop|railway|public_transport)$/.test(key) || /ferry_terminal|taxi|bus_stop|parking|atm|vending/.test(val)) score += 1.5;
    if (near) score += Math.log10(1 + kmBetween(near, { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
    if (!best || score < best.score) best = { f, score };
  });
  return best?.f || null;
}

// Zoom conseillé selon le type de lieu.
export function zoomFor(g) {
  const k = g?.kind || '';
  if (/place:(country)/.test(k)) return 5;
  if (/place:(state|region|province)/.test(k)) return 7;
  if (/place:(city)/.test(k)) return 14.5;
  if (/place:(town|borough|suburb|quarter)/.test(k)) return 15;
  if (/place:(village|neighbourhood)/.test(k)) return 15.5;
  return 16.3; // monument, rue, adresse
}

// Itinéraire entre deux points ({lat, lon}).
export async function route(a, b, mode = 'foot') {
  const m = MODES[mode] || MODES.foot;
  const url = `https://routing.openstreetmap.de/${m.server}/route/v1/${m.profile}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=true`;
  const data = await fetchJSON(url, { timeout: 15000 });
  const r = data?.routes?.[0];
  if (!r) throw new Error('Aucun itinéraire trouvé');
  const steps = r.legs.flatMap((l) => l.steps).map((s) => ({
    text: instruction(s), distance: s.distance, duration: s.duration, location: s.maneuver.location,
  })).filter((s) => s.text);
  return { mode, distance: r.distance, duration: r.duration, geometry: r.geometry, steps };
}

// ---------- Consignes en français ----------
const DIRS = {
  uturn: 'Faites demi-tour', 'sharp right': 'Tournez franchement à droite', right: 'Tournez à droite', 'slight right': 'Serrez à droite',
  straight: 'Continuez tout droit', 'slight left': 'Serrez à gauche', left: 'Tournez à gauche', 'sharp left': 'Tournez franchement à gauche',
};
function instruction(s) {
  const { type, modifier, exit } = s.maneuver || {};
  const name = s.name || s.ref || '';
  const on = name ? ` sur ${name}` : '';
  switch (type) {
    case 'depart': return `Partez${on}`;
    case 'arrive': return 'Vous êtes arrivé à destination';
    case 'roundabout': case 'rotary': case 'roundabout turn':
      return `Au rond-point, prenez la ${exit ? `${exit}${exit === 1 ? 're' : 'e'} ` : ''}sortie${name ? ` vers ${name}` : ''}`;
    case 'exit roundabout': case 'exit rotary': return `Sortez du rond-point${on}`;
    case 'continue': case 'new name': return modifier && !/straight/.test(modifier) ? `${DIRS[modifier] || 'Continuez'}${on}` : `Continuez${on}`;
    case 'notification': return '';
    default: return `${DIRS[modifier] || 'Continuez'}${on}`;
  }
}

export const fmtDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',')} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
export function fmtDuration(s) {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`;
}
