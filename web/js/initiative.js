// Initiatives de Jarvis :
// - suggestions : 1 à 3 « prochaines étapes » en boutons après une réponse (jamais dites à voix haute) ;
// - propositions : au bon moment, Jarvis propose de lui-même une action (« Voulez-vous… ? ») à laquelle on répond oui ou non.
// Garde-fous : une seule proposition à la fois, pas pendant que Jarvis parle ou réfléchit, pas plus d'une proposition
// dite à voix haute par minute, chaque initiative « du jour » au plus une fois par jour, et un réglage pour tout couper.
import * as ui from './ui.js';
import { settings } from './settings.js';
import * as facts from './facts.js';
import { fetchJSON } from './services.js';

const { el } = ui;
const SEEN_KEY = 'jarvis.initiatives.v1';
const CITY_KEY = 'jarvis.lastCity';
const today = () => new Date().toLocaleDateString('sv'); // AAAA-MM-JJ, heure locale

let deps = null; // { run(cmd), say(text), isBusy(), listen(), lastActivity() }
let bar = null;
let pending = null; // { id, text, run, at }
let lastSpoken = 0;
let expireT = 0;
let lastCommandAt = Date.now();

const mode = () => settings.initiative || 'on'; // on | quiet | off
const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
const wasDoneToday = (id) => seen()[id] === today();
function markDone(id) {
  const s = seen();
  s[id] = today();
  for (const k of Object.keys(s)) if (s[k] !== today()) delete s[k]; // on ne garde que la journée en cours
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ }
}

export function rememberCity(city) { if (city) try { localStorage.setItem(CITY_KEY, city); } catch { /* ignore */ } }
// Ville de l'utilisateur : d'après sa mémoire (« j'habite à Lyon »), sinon la dernière météo demandée.
export function userCity() {
  for (const f of facts.list()) {
    const m = f.text.match(/\b(?:j'habite|j’habite|je vis|je réside|je suis basée?|ma ville est|j'habite actuellement)\s+(?:à|a|en|au|dans|:)?\s*([A-ZÀ-Ü][\wÀ-ÿ' -]{1,40}?)(?:[.,;]|$| depuis| avec| près)/i);
    if (m) return m[1].trim();
  }
  try { return localStorage.getItem(CITY_KEY) || ''; } catch { return ''; }
}

// ---------- Barre d'initiative (au-dessus de la saisie) ----------
function ensureBar() {
  if (bar) return bar;
  bar = el('div', { class: 'nudge', role: 'status', 'aria-live': 'polite', hidden: '' },
    el('div', { class: 'nudge-q', hidden: '' },
      el('span', { class: 'nudge-ico', 'aria-hidden': 'true' }, '✨'),
      el('span', { class: 'nudge-text' }),
      el('button', { type: 'button', class: 'nudge-yes', onclick: () => accept() }, 'Oui'),
      el('button', { type: 'button', class: 'nudge-no', title: 'Non merci', 'aria-label': 'Non merci', onclick: () => dismiss() }, '✕')),
    el('div', { class: 'nudge-chips' }));
  document.body.append(bar);
  return bar;
}
function refresh() {
  const b = ensureBar();
  const q = b.querySelector('.nudge-q');
  const chips = b.querySelector('.nudge-chips');
  q.hidden = !pending;
  b.hidden = q.hidden && !chips.children.length;
}

// Suggestions de prochaines étapes : [{ label, say }]. Remplace les précédentes.
export function suggest(list = []) {
  const b = ensureBar();
  const chips = b.querySelector('.nudge-chips');
  chips.replaceChildren();
  if (mode() === 'off') { refresh(); return; }
  const seenSay = new Set();
  for (const s of list) {
    const say = String(s?.say || s?.command || '').trim();
    const label = String(s?.label || say).trim().slice(0, 40);
    if (!say || seenSay.has(say.toLowerCase())) continue;
    seenSay.add(say.toLowerCase());
    chips.append(el('button', { type: 'button', class: 'chip nudge-chip', title: say, onclick: () => { clearSuggestions(); deps?.run(say); } }, label));
    if (chips.children.length >= 3) break;
  }
  refresh();
}
export function clearSuggestions() { if (bar) { bar.querySelector('.nudge-chips').replaceChildren(); refresh(); } }

// Propose une action. `run` : commande (texte) ou fonction. `daily` : au plus une fois par jour.
export function propose({ id, text, run, daily = false, speak = true }) {
  if (!deps || mode() === 'off' || pending || deps.isBusy()) return false;
  if (daily && wasDoneToday(id)) return false;
  if (daily) markDone(id);
  pending = { id, text, run, at: Date.now() };
  ensureBar().querySelector('.nudge-text').textContent = text;
  refresh();
  clearTimeout(expireT);
  expireT = setTimeout(() => { if (pending?.id === id) dismiss(); }, 60000);
  const canSpeak = mode() === 'on' && speak && Date.now() - lastSpoken > 60000;
  if (canSpeak) {
    lastSpoken = Date.now();
    Promise.resolve(deps.say(text)).then(() => { if (pending?.id === id) deps.listen?.(); });
  }
  return true;
}

export const hasPending = () => !!pending;
export function accept() {
  const p = pending;
  if (!p) return false;
  dismiss();
  if (typeof p.run === 'function') p.run();
  else if (p.run) deps?.run(p.run);
  return true;
}
export function dismiss() {
  pending = null;
  clearTimeout(expireT);
  refresh();
}

const YES = /^(?:oui|ouais|ouai|yes|ok|okay|d'accord|dac|vas[- ]y|allez|go|fais[- ]le|fais[- ]le moi|avec plaisir|volontiers|carr[ée]ment|bien s[uû]r|s'il te pla[iî]t|s'il vous pla[iî]t|stp|svp|c'est parti|parfait|super|pourquoi pas|je veux bien|oui merci|oui vas[- ]y|oui s'il te pla[iî]t)(?:\s+jarvis)?[\s!.]*$/i;
const NO = /^(?:non|nan|no|non merci|pas maintenant|plus tard|laisse tomber|pas besoin|c'est bon|ça ira|non ça va|annule|tais[- ]toi)(?:\s+jarvis)?[\s!.]*$/i;
// Réponse à la proposition en cours : 'yes' | 'no' | null (pas une réponse).
export function answer(text) {
  lastCommandAt = Date.now();
  if (!pending) return null;
  const t = String(text || '').trim();
  if (YES.test(t)) { accept(); return 'yes'; }
  if (NO.test(t)) { dismiss(); return 'no'; }
  return null;
}

// ---------- Moments opportuns ----------
export function init(d) {
  deps = d;
  ensureBar();
  // Premier passage : laisser l'interface se poser avant de parler.
  setTimeout(() => tick('open'), 4500);
  setInterval(() => tick('clock'), 60000);
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Dates retenues en mémoire (« l'anniversaire d'Emma est le 12 mai ») qui tombent aujourd'hui ou demain.
function upcomingDates() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const out = [];
  for (const f of facts.list()) {
    const t = f.text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const m = t.match(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/) || t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (!m) continue;
    const day = +m[1];
    const month = Number.isNaN(+m[2]) ? MONTHS.map((x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '')).indexOf(m[2]) : +m[2] - 1;
    if (month < 0) continue;
    const when = day === now.getDate() && month === now.getMonth() ? 'today' : day === tomorrow.getDate() && month === tomorrow.getMonth() ? 'tomorrow' : '';
    if (when) out.push({ fact: f, when, birthday: /anniv|f[eê]te/i.test(f.text) });
  }
  return out;
}

async function forecast(city) {
  const g = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`);
  const r = g.results?.[0];
  if (!r) return null;
  const w = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${r.latitude}&longitude=${r.longitude}&current=temperature_2m,weather_code&hourly=precipitation_probability&forecast_hours=12&timezone=auto`);
  const probs = w.hourly?.precipitation_probability || [];
  let rainAt = -1;
  probs.forEach((p, i) => { if (rainAt < 0 && p >= 60) rainAt = i; });
  return { city: r.name, temp: Math.round(w.current?.temperature_2m), rainHour: rainAt >= 0 ? new Date(w.hourly.time[rainAt]).getHours() : null, rainNow: rainAt === 0 };
}

let checking = false;
async function tick(reason) {
  if (!deps || mode() === 'off' || checking || pending || deps.isBusy()) return;
  checking = true;
  try {
    const h = new Date().getHours();
    const active = Date.now() - (deps.lastActivity?.() || 0) < 3 * 60000;

    // 1. Dates importantes retenues (anniversaires…), aujourd'hui ou demain.
    for (const d of upcomingDates()) {
      const id = `date:${d.fact.id}:${d.when}`;
      if (wasDoneToday(id)) continue;
      const quand = d.when === 'today' ? "c'est aujourd'hui" : "c'est demain";
      const ok = propose({
        id, daily: true,
        text: d.birthday ? `Rappel : « ${d.fact.text} », ${quand}. Voulez-vous des idées de cadeaux ?` : `Rappel : « ${d.fact.text} », ${quand}. Voulez-vous que je vous aide à le préparer ?`,
        run: d.birthday ? `Propose-moi 5 idées de cadeaux originales, présentées en cartes, pour : ${d.fact.text}` : `Aide-moi à préparer ceci, avec une liste d'étapes : ${d.fact.text}`,
      });
      if (ok) return;
    }

    const city = userCity();
    // 2. Point du jour : première ouverture de la matinée.
    if (reason === 'open' && h >= 5 && h < 12 && !wasDoneToday('brief')) {
      let meteo = '';
      if (city) {
        const f = await forecast(city).catch(() => null);
        if (f) meteo = ` Il fait ${f.temp} degrés à ${f.city}${f.rainHour != null ? `, avec de la pluie probable vers ${f.rainHour} heures` : ''}.`;
      }
      propose({ id: 'brief', daily: true, text: `Bonjour !${meteo} Voulez-vous le point du jour ?`, run: city ? `quel temps fait-il à ${city}` : 'quel temps fait-il' });
      return;
    }

    // 3. Pluie qui arrive, pendant qu'on utilise Jarvis (une fois par jour).
    if (city && active && !wasDoneToday('rain') && (reason === 'clock' || reason === 'open')) {
      const f = await forecast(city).catch(() => null);
      if (f?.rainHour != null && !f.rainNow) {
        propose({ id: 'rain', daily: true, text: `Il risque de pleuvoir vers ${f.rainHour} heures à ${f.city}. Voulez-vous la météo détaillée ?`, run: `quel temps fait-il à ${city}` });
        return;
      }
    }

    // 4. Tard le soir, pendant qu'on utilise Jarvis.
    if (active && (h >= 23 || h < 4) && !wasDoneToday('night')) {
      propose({ id: 'night', daily: true, text: 'Il se fait tard. Voulez-vous une musique douce pour vous détendre ?', run: 'mets de la musique relaxante' });
    }
  } finally {
    checking = false;
  }
}

// ---------- Événements signalés par l'application ----------
// Image envoyée sans consigne : proposer de l'analyser.
export function onImage() {
  const t = Date.now();
  setTimeout(() => { if (lastCommandAt < t) propose({ id: `img:${t}`, text: 'Voulez-vous que j’analyse cette image ?', run: 'analyse cette image' }); }, 9000);
}
// Minuteur terminé : proposer de le relancer.
export function onTimerEnd(seconds, label) {
  const n = Math.round(seconds);
  const txt = n % 60 === 0 ? `${n / 60} minute${n >= 120 ? 's' : ''}` : `${n} secondes`;
  setTimeout(() => propose({ id: `timer:${Date.now()}`, text: `Voulez-vous relancer un minuteur de ${txt}${label && !/\d/.test(label) ? ` (${label})` : ''} ?`, run: `minuteur de ${n} secondes`, speak: false }), 2500);
}
// Dessin laissé en pause : proposer de le transformer (une fois par dessin).
let drawAsked = 0;
export function onDrawIdle(strokeCount) {
  if (strokeCount < 2 || drawAsked === strokeCount) return;
  drawAsked = strokeCount;
  propose({ id: `draw:${Date.now()}`, text: 'Je transforme votre dessin en schéma propre ?', run: 'transforme mon dessin en schéma propre' });
}
