// Mémoire personnelle : ce que l'utilisateur demande à Jarvis de retenir (« souviens-toi que je suis allergique aux noix »).
// Stockée uniquement sur cet appareil ; transmise à l'IA à chaque demande pour personnaliser les réponses.
const KEY = 'jarvis.facts.v1';
const MAX = 80;

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set("je j' tu il elle on nous vous ils elles me m' te t' se s' moi toi mon ma mes ton ta tes son sa ses notre votre leur leurs le la les l' un une des du de d' au aux et ou a est suis es sont ai as ont que qu' qui quoi ce c' cet cette ces en dans sur pour par avec sans ne n' pas plus tres bien tout tous toutes y".split(' '));
const words = (s) => fold(s).replace(/'/g, "' ").split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/s$/, ''));

let items = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter((f) => f?.text); } catch { return []; } })();
const listeners = new Set();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* stockage plein ou bloqué */ }
  listeners.forEach((fn) => fn(items));
}

export const list = () => items.slice();
export const count = () => items.length;
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Nettoie la formulation : « que je suis allergique aux noix » → « Je suis allergique aux noix ».
export function tidy(text) {
  let t = String(text || '').trim().replace(/^(?:que |qu'|qu’|le fait que |de |d'|d’|:)\s*/i, '').replace(/[\s.!]+$/, '');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.slice(0, 300);
}

// Ajoute un souvenir ; remplace un souvenir presque identique (même sujet reformulé). Renvoie le souvenir.
export function add(text) {
  const t = tidy(text);
  if (!t) return null;
  const w = new Set(words(t));
  const dup = items.find((f) => {
    const fw = words(f.text);
    const common = fw.filter((x) => w.has(x)).length;
    return fold(f.text) === fold(t) || (common >= 2 && common / Math.max(fw.length, w.size) >= 0.75);
  });
  if (dup) { dup.text = t; dup.at = Date.now(); save(); return dup; }
  const f = { id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: t, at: Date.now() };
  items.push(f);
  if (items.length > MAX) items = items.slice(-MAX);
  save();
  return f;
}

export function remove(id) {
  const n = items.length;
  items = items.filter((f) => f.id !== id);
  if (items.length !== n) save();
  return items.length !== n;
}

// Oublie les souvenirs qui correspondent le mieux à la description (« oublie mon adresse »). Renvoie les souvenirs retirés.
export function forget(query) {
  const q = words(query);
  if (!q.length) return [];
  const scored = items.map((f) => {
    const fw = words(f.text);
    return { f, score: q.filter((x) => fw.some((y) => y === x || (x.length > 3 && (y.startsWith(x) || x.startsWith(y))))).length };
  }).filter((x) => x.score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((x) => x.score));
  const gone = scored.filter((x) => x.score === best).map((x) => x.f);
  items = items.filter((f) => !gone.includes(f));
  save();
  return gone;
}

export function clear() { const old = items; items = []; save(); return old; }
export function restore(old = []) { items = [...old, ...items.filter((f) => !old.some((o) => o.id === f.id))].slice(-MAX); save(); }

// Texte injecté dans les instructions de l'IA.
export function forPrompt() {
  if (!items.length) return '';
  return `Ce que l'utilisateur t'a demandé de retenir sur lui (formulé par lui : « je » = l'utilisateur ; tiens-en compte naturellement, sans le réciter) :\n${items.map((f) => `- ${f.text}`).join('\n')}`;
}
