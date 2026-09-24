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
  if (base === 'jarvis') ['jarvi', 'jarvise', 'jarvisse', 'jarviss', 'jarvice', 'jarviz', 'jar vis', 'j arvis', 'jervis', 'gervis', 'djarvis', 'garvis', 'charvis', 'harvis', 'jarvis s'].forEach((v) => set.add(v));
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

// Fin de phrase : silence après le dernier mot reconnu (plus long si le dernier segment n'est pas finalisé).
const SILENCE_MS = 1500;
const SILENCE_PENDING_MS = 2500;
const MAX_CAPTURE_MS = 60000;

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
    this.silenceTimer = null;
    this.maxTimer = null;
    this.capStart = null;
    this.carry = '';
    this.capText = '';
    this.stripWake = false;
    this.ignoreBefore = -1;
    this.lastLen = 0;
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
        this.denied = true;
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
      // Le navigateur a relancé sa session au milieu d'une phrase : on garde ce qui a déjà été dit.
      this.ignoreBefore = -1; // nouvelle session : la numérotation des segments repart de zéro
      this.lastLen = 0;
      if (this.capturing) { this.carry = this.capText || this.carry; this.capStart = 0; this.stripWake = false; }
      this._emitState();
      if (this.speaking) return;
      // En écoute permanente, on relance indéfiniment (avec un délai croissant en cas d'erreurs répétées).
      if (this.wakeEnabled || (this.capturing && this.failures < 6)) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this._start(), this.failures ? Math.min(10000, 600 * this.failures) : 120);
      }
    };
    this.rec = rec;
  }

  _start() {
    if (!this.rec || this.running || this.speaking || document.hidden) return;
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

  // La phrase est reconstituée à partir de TOUS les segments reçus depuis le début de l'écoute,
  // et n'est envoyée qu'après un vrai silence : une longue phrase avec des pauses n'est plus coupée.
  _onResult(e) {
    const results = e.results;
    this.lastLen = results.length;
    if (!this.capturing) {
      if (!this.wakeEnabled) return;
      // Les segments déjà utilisés pour une commande ne doivent pas la redéclencher.
      for (let i = Math.max(e.resultIndex, this.ignoreBefore + 1); i < results.length; i++) {
        if (!findWake(results[i][0].transcript)) continue;
        chime(true);
        this._beginCapture({ fromIndex: i, stripWake: true });
        break;
      }
      if (!this.capturing) return;
    }
    // Écoute démarrée sans mot d'activation : on part du premier segment NOUVEAU
    // (un ancien segment finalisé en retard ne doit pas être repris).
    if (this.capStart === null) this.capStart = Math.max(e.resultIndex, this.ignoreBefore + 1);
    if (results.length <= this.capStart) return;

    let text = '';
    let pending = false; // un segment n'est pas encore définitif
    for (let i = this.capStart; i < results.length; i++) {
      text += ` ${results[i][0].transcript}`;
      if (!results[i].isFinal) pending = true;
    }
    text = text.replace(/\s+/g, ' ').trim();
    // Retire « Jarvis » quand il ouvre la phrase (ou quand l'écoute a démarré grâce à lui).
    const w = findWake(text);
    if (w && (this.stripWake || w.index <= 1)) text = w.rest;
    const full = `${this.carry} ${text}`.replace(/\s+/g, ' ').trim();
    this.capText = full;
    this.onInterim(full);
    if (!full) return;

    // On a entendu quelque chose : on attend désormais la fin de la phrase (silence).
    clearTimeout(this.captureTimer);
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this._finishCapture(), pending ? SILENCE_PENDING_MS : SILENCE_MS);
  }

  _emitCommand(cmd) {
    this.onInterim('');
    this.onCommand(cmd.trim());
  }

  // Démarre la capture d'une commande. `wait` : délai max si l'utilisateur ne dit rien.
  _beginCapture({ fromIndex = null, stripWake = false, wait = 8000 } = {}) {
    this.capturing = true;
    this.capStart = fromIndex;
    this.stripWake = stripWake;
    this.carry = '';
    this.capText = '';
    this._emitState();
    clearTimeout(this.captureTimer);
    clearTimeout(this.silenceTimer);
    clearTimeout(this.maxTimer);
    this.captureTimer = setTimeout(() => this._finishCapture(), wait);
    this.maxTimer = setTimeout(() => this._finishCapture(), MAX_CAPTURE_MS);
    this._start();
  }

  _finishCapture() {
    if (!this.capturing) return;
    const cmd = (this.capText || '').trim();
    this._endCapture();
    if (cmd.length > 1) this._emitCommand(cmd);
    else if (!this.wakeEnabled) this._stop();
  }

  _endCapture() {
    this.capturing = false;
    this.ignoreBefore = (this.lastLen || 0) - 1;
    clearTimeout(this.captureTimer);
    clearTimeout(this.silenceTimer);
    clearTimeout(this.maxTimer);
    this.onInterim('');
    this._emitState();
  }

  // --- API publique ---
  get listening() { return this.running; }

  // Relance l'écoute si elle s'est arrêtée (retour sur l'app, geste de l'utilisateur…).
  ensureListening() {
    if (this.wakeEnabled && !this.running && !this.speaking) { this.failures = 0; this._start(); }
  }

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
    // Appui pendant l'écoute : on envoie ce qui a été dit, ou on relance l'écoute si rien n'a encore été dit.
    if (this.capturing && this.capText) { this._finishCapture(); return true; }
    if (this.capturing) { chime(true); clearTimeout(this.captureTimer); this.captureTimer = setTimeout(() => this._finishCapture(), 10000); return true; }
    chime(true);
    this._beginCapture({ wait: 10000 });
    return true;
  }

  // Met le micro à disposition d'une autre reconnaissance (traducteur) puis le reprend.
  pause() {
    if (this._paused) return;
    this._paused = true;
    this._wakeWas = this.wakeEnabled;
    this.wakeEnabled = false;
    this.capturing = false;
    clearTimeout(this.captureTimer);
    this._stop();
    try { this.rec?.abort(); } catch { /* déjà arrêtée */ }
    this._emitState();
  }
  resume() {
    if (!this._paused) return;
    this._paused = false;
    if (this._wakeWas) this.setWake(true);
  }

  // Après une réponse vocale, laisse quelques secondes pour enchaîner sans redire « Jarvis ».
  followUp(ms = 6000) {
    if (!this.supported || !this.wakeEnabled) return;
    this._beginCapture({ wait: ms });
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
        // Sécurité : certains navigateurs n'émettent jamais « onend » ; sans ça l'écoute ne reprendrait pas.
        let fired = false;
        const go = () => { if (fired) return; fired = true; clearTimeout(guard); next(); };
        const guard = setTimeout(go, 4000 + u.text.length * 90 / (+settings.rate || 1));
        u.onend = go;
        u.onerror = go;
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
