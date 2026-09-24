// Routines : une phrase déclenche plusieurs actions d'affilée (« je rentre » → musique, météo de demain, rappels).
// Stockées sur l'appareil. Création à la voix (« crée une routine je rentre : mets du jazz, puis la météo de demain »),
// par l'IA, ou depuis la carte « Mes routines ».
const KEY = 'jarvis.routines.v1';

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
let items = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } })();
const listeners = new Set();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* stockage indisponible */ }
  listeners.forEach((fn) => fn(items));
}
export const list = () => items.slice();
export function onChange(fn) { listeners.add(fn); }

// Découpe « mets du jazz, puis donne la météo et lis mes rappels » en étapes.
export function splitSteps(text) {
  return String(text)
    .split(/\s*(?:,|;|\n|\bpuis\b|\bensuite\b|\bet ensuite\b|\bet apr[èe]s\b|\bet enfin\b|\benfin\b|\bet\b(?=\s+(?:tu\s+)?(?:mets?|lances?|affiches?|montres?|donnes?|dis|fais|ouvres?|joues?|lis|rappelles?|quel|quelle|baisses?|montes?|coupes?|allumes?|passes?|r[ée]duis|effaces?)\b))\s*/i)
    .map((x) => x.trim().replace(/^(?:et|puis)\s+/i, '').replace(/^(?:tu\s+)?(coupe|lance|donne|affiche|joue|allume|baisse|monte|passe|montre|rappelle|efface|ouvre|d[ée]marre|arr[êe]te|r[ée]duis|lis|dis|fai)s\b/i, '$1').replace(/^fai\b/i, 'fais'))
    .filter((x) => x.length > 2)
    .slice(0, 8);
}

export function create(name, steps, triggers = []) {
  const n = String(name || '').trim().replace(/^[«"“']|[»"”']$/g, '').trim().slice(0, 60);
  const st = (Array.isArray(steps) ? steps : splitSteps(steps)).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
  if (!n || !st.length) return null;
  // « Bonjour Jarvis » doit aussi marcher quand le mot d'activation est retiré de la phrase.
  const trig = [...new Set([n, ...triggers].map(fold).flatMap((x) => [x, x.replace(/\bjarvis\b/g, '').replace(/\s+/g, ' ').trim()]).filter(Boolean))];
  const existing = items.find((r) => fold(r.name) === fold(n));
  if (existing) Object.assign(existing, { steps: st, triggers: trig });
  else items.push({ id: `r${Date.now().toString(36)}`, name: n, steps: st, triggers: trig });
  save();
  return items.find((r) => fold(r.name) === fold(n));
}

export function remove(name) {
  const n = fold(name);
  const r = items.find((x) => fold(x.name) === n) || items.find((x) => fold(x.name).includes(n) || n.includes(fold(x.name)));
  if (!r) return null;
  items = items.filter((x) => x !== r);
  save();
  return r;
}

// La phrase dite déclenche-t-elle une routine ? (« je rentre », « Jarvis, je rentre ! », « lance la routine je rentre »)
export function match(text) {
  const t = fold(text).replace(/^(?:lance|demarre|execute|active|fais)(?: moi)? (?:la |ma )?routine /, '').replace(/^routine /, '');
  if (!t) return null;
  return items.find((r) => r.triggers.includes(t) || fold(r.name) === t) || null;
}

// Exemples proposés sur la carte (créés d'un geste).
export const EXAMPLES = [
  { name: 'Je rentre', steps: ['mets de la musique jazz', 'quel temps va-t-il faire demain', 'baisse le son'] },
  { name: 'Bonjour Jarvis', steps: ['quel temps fait-il', 'quel jour sommes-nous', 'mets de la musique douce'] },
  { name: 'Mode travail', steps: ['mets de la musique lofi', 'minuteur de 25 minutes'] },
  { name: 'Bonne nuit', steps: ['mets de la musique relaxante', 'minuteur de 30 minutes'] },
];
