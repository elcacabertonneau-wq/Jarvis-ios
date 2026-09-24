// Traducteur en direct (mode interprète) : chaque personne touche son bouton et parle dans sa langue,
// Jarvis traduit et prononce la traduction dans la langue de l'autre. Fonctionne aussi au clavier.
import * as ui from './ui.js';
import { translateText } from './brain.js';

const { el } = ui;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const LANGS = [
  ['français', 'fr-FR', '🇫🇷'], ['anglais', 'en-US', '🇬🇧'], ['espagnol', 'es-ES', '🇪🇸'], ['allemand', 'de-DE', '🇩🇪'],
  ['italien', 'it-IT', '🇮🇹'], ['portugais', 'pt-PT', '🇵🇹'], ['arabe', 'ar-SA', '🇸🇦'], ['chinois', 'zh-CN', '🇨🇳'],
  ['japonais', 'ja-JP', '🇯🇵'], ['coréen', 'ko-KR', '🇰🇷'], ['russe', 'ru-RU', '🇷🇺'], ['néerlandais', 'nl-NL', '🇳🇱'],
  ['turc', 'tr-TR', '🇹🇷'], ['polonais', 'pl-PL', '🇵🇱'], ['hindi', 'hi-IN', '🇮🇳'], ['grec', 'el-GR', '🇬🇷'],
  ['suédois', 'sv-SE', '🇸🇪'], ['ukrainien', 'uk-UA', '🇺🇦'], ['vietnamien', 'vi-VN', '🇻🇳'], ['hébreu', 'he-IL', '🇮🇱'],
];
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// « anglais », « English », « en », « américain »… → entrée de LANGS.
export function findLang(word = '') {
  const w = fold(word).replace(/^(?:l'|le |la |en )/, '').trim();
  const alias = { americain: 'anglais', english: 'anglais', britannique: 'anglais', mandarin: 'chinois', hollandais: 'néerlandais', espagnole: 'espagnol', allemande: 'allemand', portugais: 'portugais', bresilien: 'portugais' };
  const name = alias[w] || w;
  return LANGS.find(([n, code]) => fold(n) === fold(name) || fold(n).startsWith(fold(name).slice(0, 5)) || code.slice(0, 2) === name) || null;
}

let S = null; // { card, a, b, log, rec, busy }
let hooks = {}; // { pauseVoice(), resumeVoice(), onClose() }

export const isOpen = () => !!S?.card?.isConnected;
export const describe = () => (isOpen() ? `Traducteur ouvert (${S.a[0]} ⇄ ${S.b[0]})` : '');

export function open(targetWord = 'anglais', { place, ...h } = {}) {
  hooks = h;
  const b = findLang(targetWord) || LANGS[1];
  const a = LANGS[0];
  if (isOpen()) { setLangs(S.a, b); ui.restoreCard(S.card); return S.card; }
  const log = el('div', { class: 'tr-log', 'aria-live': 'polite' },
    el('p', { class: 'tr-empty' }, 'Touchez le bouton de la personne qui parle, puis parlez. Jarvis traduit et le dit à voix haute.'));
  const btnA = el('button', { type: 'button', class: 'tr-mic', onclick: () => listen('a') });
  const btnB = el('button', { type: 'button', class: 'tr-mic other', onclick: () => listen('b') });
  const input = el('input', { class: 'field', type: 'text', placeholder: 'Ou écrivez une phrase…', 'aria-label': 'Phrase à traduire' });
  const sideSel = el('select', { class: 'tr-side', 'aria-label': 'Langue de la phrase écrite' });
  const pickers = el('div', { class: 'tr-langs' },
    langSelect('a', a), el('button', { type: 'button', class: 'icon-btn tr-swap', title: 'Inverser les langues', 'aria-label': 'Inverser les langues', onclick: () => setLangs(S.b, S.a) }, '⇄'), langSelect('b', b));
  const body = el('div', { class: 'tr' }, pickers, el('div', { class: 'tr-mics' }, btnA, btnB), log,
    el('form', { class: 'tr-type', onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); input.value = ''; if (v) translate(v, sideSel.value); } }, sideSel, input,
      el('button', { type: 'submit', class: 'primary' }, 'Traduire')));
  const card = ui.card('Traducteur', body, { icon: '🌐', keep: true, place, kind: 'translate' });
  card._onRemove = () => close(true);
  S = { card, a, b, log, btnA, btnB, sideSel, rec: null, busy: false };
  setLangs(a, b);
  if (!place) ui.expandCard(card);
  return card;
}

function langSelect(side, current) {
  const s = el('select', { class: `tr-lang tr-lang-${side}`, 'aria-label': side === 'a' ? 'Ma langue' : 'Langue de l’autre personne', onchange: () => {
    const l = LANGS.find((x) => x[1] === s.value);
    if (side === 'a') setLangs(l, S.b); else setLangs(S.a, l);
  } }, LANGS.map(([n, code, flag]) => el('option', { value: code }, `${flag} ${n}`)));
  s.value = current[1];
  return s;
}

function setLangs(a, b) {
  S.a = a; S.b = b;
  S.card.querySelector('.tr-lang-a').value = a[1];
  S.card.querySelector('.tr-lang-b').value = b[1];
  S.btnA.textContent = `🎙️ Moi · ${a[2]} ${a[0]}`;
  S.btnB.textContent = `🎙️ ${b[2]} ${b[0]}`;
  S.sideSel.replaceChildren(el('option', { value: 'a' }, `${a[2]} → ${b[2]}`), el('option', { value: 'b' }, `${b[2]} → ${a[2]}`));
  ui.setCardTitle(S.card, `🌐 Traducteur · ${a[0]} ⇄ ${b[0]}`);
}

export function close(fromCard = false) {
  if (!S) return;
  try { S.rec?.abort(); } catch { /* déjà arrêtée */ }
  const card = S.card;
  S = null;
  hooks.resumeVoice?.();
  if (!fromCard && card?.isConnected) ui.removeCard(card, true);
  hooks.onClose?.();
}

// Écoute une phrase dans la langue du côté choisi, puis la traduit.
export function listen(side = 'a') {
  if (!S) return false;
  if (!SR) { ui.setLive('La reconnaissance vocale n’est pas disponible sur ce navigateur : écrivez la phrase.', 'reply'); return false; }
  try { S.rec?.abort(); } catch { /* ignore */ }
  hooks.pauseVoice?.(); // l'écoute « Jarvis » en français se met en pause pendant l'interprétation
  speechSynthesis?.cancel();
  const lang = side === 'a' ? S.a : S.b;
  const rec = new SR();
  rec.lang = lang[1];
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  const btn = side === 'a' ? S.btnA : S.btnB;
  const live = el('div', { class: `tr-msg ${side} live` }, '…');
  S.log.querySelector('.tr-empty')?.remove();
  S.log.append(live);
  let final = '';
  rec.onresult = (e) => {
    let txt = '';
    for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) final = txt; }
    live.textContent = txt;
    S.log.scrollTop = S.log.scrollHeight;
  };
  rec.onerror = (e) => { if (e.error === 'not-allowed') live.textContent = 'Micro refusé : autorisez-le dans les réglages du navigateur.'; };
  rec.onend = () => {
    btn.classList.remove('on');
    live.remove();
    const text = (final || live.textContent).trim();
    if (text && text !== '…' && S) translate(text, side);
    else hooks.resumeVoice?.();
  };
  S.rec = rec;
  btn.classList.add('on');
  try { rec.start(); } catch { btn.classList.remove('on'); }
  return true;
}

// Traduit une phrase (côté 'a' = ma langue → langue de l'autre) et la prononce.
export async function translate(text, side = 'a') {
  if (!S) return '';
  const from = side === 'a' ? S.a : S.b;
  const to = side === 'a' ? S.b : S.a;
  S.log.querySelector('.tr-empty')?.remove();
  const msg = el('div', { class: `tr-msg ${side}` }, el('small', {}, `${from[2]} ${text}`), el('p', { class: 'tr-out' }, ui.loading()));
  S.log.append(msg);
  S.log.scrollTop = S.log.scrollHeight;
  try {
    const out = await translateText(text, from[0], to[0]);
    const p = msg.querySelector('.tr-out');
    p.replaceChildren(`${to[2]} ${out}`, el('button', { type: 'button', class: 'icon-btn tr-say', title: 'Réécouter', 'aria-label': 'Réécouter', onclick: () => speakIn(out, to[1]) }, '🔊'));
    S.log.scrollTop = S.log.scrollHeight;
    await speakIn(out, to[1]);
    return out;
  } catch {
    msg.querySelector('.tr-out').textContent = 'Traduction impossible pour le moment.';
    return '';
  } finally {
    hooks.resumeVoice?.();
  }
}

// Synthèse vocale dans une langue donnée (voix du système correspondante).
export function speakIn(text, lang) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.startsWith(lang.slice(0, 2))) || null;
    u.rate = 0.98;
    const t = setTimeout(resolve, 4000 + text.length * 110);
    u.onend = () => { clearTimeout(t); resolve(); };
    u.onerror = () => { clearTimeout(t); resolve(); };
    speechSynthesis.speak(u);
  });
}

// Traduction ponctuelle (« traduis "bonjour" en japonais ») : carte, texte et prononciation.
export async function once(text, targetWord) {
  const to = findLang(targetWord);
  if (!to) return null;
  const out = await translateText(text, 'français', to[0]);
  const body = el('div', { class: 'tr' },
    el('div', { class: 'tr-msg a' }, el('small', {}, `🇫🇷 ${text}`), el('p', { class: 'tr-out' }, `${to[2]} ${out}`,
      el('button', { type: 'button', class: 'icon-btn tr-say', title: 'Réécouter', 'aria-label': 'Réécouter', onclick: () => speakIn(out, to[1]) }, '🔊'))));
  ui.card(`Traduction · ${to[0]}`, body, { icon: '🌐', kind: 'text' });
  await speakIn(out, to[1]);
  return out;
}
