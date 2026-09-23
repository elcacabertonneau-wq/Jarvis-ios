// Reconnaissance vocale (Web Speech API, gratuite et intégrée au navigateur)
// + synthèse vocale + détection du mot d'activation « Jarvis ».
import { settings } from './settings.js';
import { stripMarkdown } from './markdown.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Variantes fréquemment mal reconnues du mot « Jarvis ».
function wakeVariants() {
  const base = normalize(settings.wakeName || 'jarvis');
  const set = new Set([base]);
  if (base === 'jarvis') ['jarvi', 'jarvise', 'jarviss', 'jar vis', 'jervis', 'djarvis', 'garvis', 'charvis', 'jarvis s'].forEach((v) => set.add(v));
  return [...set].sort((a, b) => b.length - a.length);
}

// Minuscules sans accents, en conservant la longueur (pour retrouver la position dans le texte original).
const fold = (s) => s.split('').map((c) => {
  const f = c.normalize('NFD')[0].toLowerCase();
  return f.length === 1 ? f : c;
}).join('');

// Cherche le mot d'activation ; renvoie la commande qui suit (texte original, accents conservés).
export function findWake(text) {
  const f = fold(text);
  for (const v of wakeVariants()) {
    const re = new RegExp(`(^|[^a-z])((ok|hey|he|salut|dis|eh)[\\s,]+)?${v.replace(/ /g, '\\s?')}(?=[^a-z]|$)`);
    const m = f.match(re);
    if (m) {
      const start = m.index + m[1].length;
      return { index: start, rest: text.slice(m.index + m[0].length).replace(/^[\s,.!?:;-]+/, '').trim() };
    }
  }
  return null;
}

let audioCtx;
export function chime(up = true) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(up ? 660 : 880, t);
    o.frequency.exponentialRampToValueAtTime(up ? 1320 : 440, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.2);
  } catch { /* audio indisponible */ }
}

export class Voice {
  constructor({ onCommand, onInterim, onState, onError }) {
    this.onCommand = onCommand;
    this.onInterim = onInterim || (() => {});
    this.onState = onState || (() => {});
    this.onError = onError || (() => {});
    this.supported = !!SR;
    this.canSpeak = 'speechSynthesis' in window;
    this.wakeEnabled = false;
    this.capturing = false;
    this.speaking = false;
    this.running = false;
    this.captureTimer = null;
    this.restartTimer = null;
    this.failures = 0;
    this.voices = [];
    if (this.canSpeak) {
      const load = () => { this.voices = speechSynthesis.getVoices(); };
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
    if (this.supported) this._build();
  }

  _build() {
    const rec = new SR();
    rec.lang = settings.lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = true;

    rec.onstart = () => { this.running = true; this.failures = 0; this._emitState(); };
    rec.onresult = (e) => this._onResult(e);
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wakeEnabled = false;
        this.capturing = false;
        this.onError("Accès au micro refusé. Autorisez le micro dans les réglages du navigateur.");
      } else if (e.error === 'network') {
        this.failures++;
        if (this.failures > 3) this.onError('Reconnaissance vocale indisponible (réseau).');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        this.failures++;
      }
    };
    rec.onend = () => {
      this.running = false;
      this._emitState();
      if (this.speaking) return;
      if ((this.wakeEnabled || this.capturing) && this.failures < 6) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this._start(), this.failures ? 600 * this.failures : 120);
      }
    };
    this.rec = rec;
  }

  _start() {
    if (!this.rec || this.running || this.speaking) return;
    this.rec.lang = settings.lang;
    try { this.rec.start(); } catch { /* déjà démarré */ }
  }

  _stop() {
    clearTimeout(this.restartTimer);
    if (this.rec && this.running) { try { this.rec.abort(); } catch { /* ignore */ } }
  }

  _emitState() {
    if (this.speaking) return this.onState('speaking');
    if (this.capturing) return this.onState('listening');
    if (this.wakeEnabled) return this.onState('wake');
    return this.onState('idle');
  }

  _onResult(e) {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (interim) {
      if (this.capturing) this.onInterim(interim);
      else if (this.wakeEnabled && findWake(interim)) {
        // Réagit dès que le mot d'activation est entendu, sans attendre la fin de phrase.
        if (!this._wakeHeard) { this._wakeHeard = true; chime(true); this.onState('listening'); }
        this.onInterim(interim);
      }
    }
    if (!final.trim()) return;
    this._wakeHeard = false;
    const text = final.trim();

    if (this.capturing) {
      const w = findWake(text);
      const cmd = w && w.index === 0 ? (w.rest || '') : text;
      this._endCapture();
      if (cmd) this._emitCommand(cmd);
      return;
    }

    if (this.wakeEnabled) {
      const w = findWake(text);
      if (!w) { this.onInterim(''); return; }
      if (w.rest.length > 2) {
        this._emitCommand(w.rest);
      } else {
        chime(true);
        this._beginCapture(8000);
      }
    }
  }

  _emitCommand(cmd) {
    this.onInterim('');
    this.onCommand(cmd.trim());
  }

  _beginCapture(ms = 8000) {
    this.capturing = true;
    this._emitState();
    clearTimeout(this.captureTimer);
    this.captureTimer = setTimeout(() => {
      if (!this.capturing) return;
      this._endCapture();
      if (!this.wakeEnabled) this._stop();
    }, ms);
    this._start();
  }

  _endCapture() {
    this.capturing = false;
    clearTimeout(this.captureTimer);
    this.onInterim('');
    this._emitState();
  }

  // --- API publique ---
  setWake(on) {
    if (!this.supported) return false;
    this.wakeEnabled = on;
    if (on) this._start();
    else if (!this.capturing) this._stop();
    this._emitState();
    return true;
  }

  // Appui sur le micro : écoute une commande.
  listenOnce() {
    if (!this.supported) return false;
    if (this.speaking) this.stopSpeaking();
    if (this.capturing) { this._endCapture(); if (!this.wakeEnabled) this._stop(); return true; }
    chime(true);
    this._beginCapture(10000);
    return true;
  }

  // Après une réponse vocale, laisse quelques secondes pour enchaîner sans redire « Jarvis ».
  followUp(ms = 6000) {
    if (!this.supported || !this.wakeEnabled) return;
    this._beginCapture(ms);
  }

  pickVoice() {
    const lang = settings.lang.slice(0, 2);
    const list = this.voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
    if (settings.voiceURI) {
      const v = this.voices.find((x) => x.voiceURI === settings.voiceURI);
      if (v) return v;
    }
    const prefs = ['Thomas', 'Google français', 'Microsoft Henri', 'Microsoft Paul', 'Daniel', 'Microsoft Denise', 'Amélie', 'Google US English'];
    for (const p of prefs) {
      const v = list.find((x) => x.name.includes(p));
      if (v) return v;
    }
    return list.find((v) => v.lang === settings.lang) || list[0] || null;
  }

  // Débloque l'audio sur iOS (doit être appelé pendant un geste utilisateur).
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume?.();
    } catch { /* ignore */ }
    if (this.canSpeak) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  }

  speak(text) {
    const clean = stripMarkdown(text);
    if (!this.canSpeak || settings.muted || !clean) return Promise.resolve();
    this.stopSpeaking();
    // Découpe en phrases : évite la coupure des longues lectures (bug Chrome) et démarre plus vite.
    const chunks = clean.match(/[^.!?…;:]+[.!?…;:]*|.+$/g)?.reduce((acc, s) => {
      const last = acc[acc.length - 1];
      if (last && (last + s).length < 180) acc[acc.length - 1] = last + s;
      else acc.push(s);
      return acc;
    }, []) || [clean];

    this.speaking = true;
    this._stop();
    this._emitState();
    const voice = this.pickVoice();
    return new Promise((resolve) => {
      let i = 0;
      const token = (this._speakToken = Symbol('speak'));
      const done = () => {
        if (this._speakToken !== token) return resolve();
        this.speaking = false;
        this._emitState();
        if (this.wakeEnabled) setTimeout(() => this._start(), 250);
        resolve();
      };
      const next = () => {
        if (this._speakToken !== token) return resolve();
        if (i >= chunks.length) return done();
        const u = new SpeechSynthesisUtterance(chunks[i++].trim());
        u.lang = voice?.lang || settings.lang;
        if (voice) u.voice = voice;
        u.rate = +settings.rate;
        u.pitch = +settings.pitch;
        u.onend = next;
        u.onerror = next;
        speechSynthesis.speak(u);
      };
      next();
    });
  }

  stopSpeaking() {
    if (!this.canSpeak) return;
    const was = this.speaking;
    this._speakToken = null;
    speechSynthesis.cancel();
    this.speaking = false;
    if (was) {
      this._emitState();
      if (this.wakeEnabled) setTimeout(() => this._start(), 250);
    }
  }
}
