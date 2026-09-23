// Orchestrateur de Jarvis : relie la voix, l'IA, les commandes locales et l'affichage.
import { settings, saveSettings, defaults } from './settings.js';
import { Voice, chime } from './voice.js';
import { think, studyNotes, memory, activeProviderLabel } from './brain.js';
import { matchIntent } from './intents.js';
import * as svc from './services.js';
import * as player from './player.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);
const { el, chip } = ui;
let turn = 0;

// ---------------- Voix ----------------
const voice = new Voice({
  onCommand: (text) => handle(text, { spoken: true }),
  onInterim: (t) => ui.setLive(t),
  onState: (s) => {
    if (busy && s !== 'listening' && s !== 'speaking') ui.setOrb('thinking');
    else ui.setOrb(s);
    player.duck(s === 'speaking');
    refreshStatus();
  },
  onError: (msg) => { ui.log('system', msg); ui.setLive(msg, 'reply'); updateWakeButton(); },
});

let busy = false;
function setBusy(b) {
  busy = b;
  if (b) ui.setOrb('thinking');
  else voice._emitState ? voice._emitState() : ui.setOrb('idle');
}

function refreshStatus() {
  const parts = [`IA : ${activeProviderLabel()}`];
  if (!voice.supported) parts.push('micro non pris en charge');
  else if (voice.wakeEnabled) parts.push(`dites « ${settings.wakeName} »`);
  else parts.push('touchez pour parler');
  if (!navigator.onLine) parts.unshift('hors ligne');
  ui.setStatus(parts.join(' · '));
}

async function say(text, t = turn) {
  if (!text || t !== turn) return;
  ui.log('jarvis', text);
  ui.setLive(text, 'reply');
  await voice.speak(text);
}

// ---------------- Traitement d'une demande ----------------
async function handle(raw, { spoken = false } = {}) {
  const text = String(raw || '').trim();
  if (!text) return;
  const t = ++turn;
  voice.stopSpeaking();
  ui.log('user', text);
  ui.setLive('');

  const local = matchIntent(text);
  try {
    setBusy(true);
    if (local) {
      const speech = await runActions(local.actions, text);
      setBusy(false);
      await say(local.speech || speech, t);
    } else {
      const reply = await think(text, { playing: player.nowPlaying(), screen: ui.describeStage() });
      if (t !== turn) return;
      if (reply.display) ui.textCard(reply.title || 'Jarvis', reply.display);
      const speech = await runActions(reply.actions, text);
      setBusy(false);
      await say(reply.speech || speech || (reply.display ? 'Voici.' : ''), t);
    }
  } catch (e) {
    console.error(e);
    setBusy(false);
    if (t !== turn) return;
    // L'IA ne répond pas : on tente au moins une recherche encyclopédique.
    const fallback = await quickAnswer(text).catch(() => null);
    if (fallback) await say(fallback, t);
    else {
      if (!settings.groqKey && !settings.geminiKey && !settings.claudeKey) showOnboarding();
      else ui.errorCard("Je n'arrive pas à joindre mon IA pour le moment (quota atteint ou clé invalide ?). Vérifiez vos clés dans les réglages ⚙️.");
      await say("Désolé, je n'arrive pas à joindre mon intelligence artificielle pour le moment.", t);
    }
  } finally {
    if (busy) setBusy(false);
  }
  // Conversation fluide : après une réponse vocale, Jarvis écoute la suite quelques secondes.
  if (spoken && t === turn && voice.wakeEnabled && !player.nowPlaying()) voice.followUp(6000);
}

async function quickAnswer(text) {
  // Seulement pour des requêtes courtes ressemblant à un sujet (sinon Wikipédia répond à côté).
  if (text.split(/\s+/).length > 4 || /[?]/.test(text)) return null;
  const w = await svc.wikiLookup(text);
  if (!w?.summary) return null;
  showWikiCard(w);
  return w.summary.split(/(?<=[.!?])\s/).slice(0, 2).join(' ');
}

// ---------------- Actions ----------------
async function runActions(actions = [], originalText = '') {
  const speeches = [];
  for (const a of actions.slice(0, 4)) {
    try {
      const s = await ACTIONS[a.type]?.(a, originalText);
      if (s) speeches.push(s);
    } catch (e) {
      console.warn('Action échouée', a, e);
      speeches.push("Cette action n'a pas abouti.");
    }
  }
  return speeches.join(' ');
}

const ACTIONS = {
  async images({ query }) {
    const body = el('div', {}, ui.loading());
    ui.card(`Images · ${query}`, body, { icon: '🖼️' });
    const items = await svc.searchImages(query).catch(() => []);
    body.innerHTML = '';
    if (!items.length) {
      body.append(el('p', {}, 'Aucune image trouvée.'), el('div', { class: 'actions-row' },
        chip('✨ Générer une image', () => handle(`génère une image de ${query}`))));
      return `Je n'ai trouvé aucune image de ${query}. Je peux en générer une si vous voulez.`;
    }
    body.append(ui.gallery(items, (i) => ui.lightbox(items, i)),
      el('div', { class: 'actions-row' },
        chip('✨ Générer une image', () => handle(`génère une image de ${query}`)),
        chip('🎬 Vidéo', () => handle(`lance une vidéo sur ${query}`)),
        chip('📚 Étudier', () => handle(`étudie ${query}`))));
    return `Voici des images de ${query}.`;
  },

  async generate_image({ prompt }) {
    const url = svc.generateImageURL(prompt);
    const status = el('div', {}, ui.loading(), el('p', { class: 'sources' }, 'Création en cours… (10 à 30 secondes)'));
    const img = el('img', { class: 'gen-img', alt: prompt });
    const body = el('div', {}, status, img,
      el('div', { class: 'actions-row' },
        chip('🔁 Autre version', () => ACTIONS.generate_image({ prompt })),
        chip('↗️ Ouvrir', null, url)));
    img.onload = () => status.remove();
    img.onerror = () => { status.innerHTML = ''; status.append(el('p', {}, "Le générateur d'images gratuit est saturé, réessayez dans un instant.")); img.remove(); };
    img.src = url;
    ui.card(`Création · ${prompt.slice(0, 60)}`, body, { icon: '✨' });
    return "C'est en cours de création.";
  },

  async video({ query }) {
    const body = el('div', {}, ui.loading());
    ui.card(`Vidéo · ${query}`, body, { icon: '🎬' });
    let vids = [];
    try { vids = await svc.searchVideos(query); } catch { /* aucune source */ }
    body.innerHTML = '';
    if (!vids.length) {
      body.append(el('p', {}, "Je n'ai pas pu interroger YouTube directement."),
        el('div', { class: 'actions-row' }, chip('▶️ Ouvrir sur YouTube', null, svc.youtubeSearchURL(query))));
      return 'Je vous propose de lancer la recherche sur YouTube.';
    }
    const wrap = el('div', { class: 'video-wrap' });
    const load = (v) => {
      wrap.querySelectorAll('iframe').forEach((f) => player.unregisterVideo(f));
      wrap.innerHTML = '';
      const f = player.makeYTFrame(v.id);
      wrap.append(f);
      player.registerVideo(f);
      title.textContent = v.title;
    };
    const title = el('p', { class: 'sources' });
    const list = el('div', { class: 'video-list' }, vids.slice(1).map((v) =>
      el('button', { type: 'button', onclick: () => load(v) }, el('img', { src: v.thumb, alt: '', loading: 'lazy' }), el('span', {}, v.title))));
    body.append(wrap, title, list);
    load(vids[0]);
    return `Je lance ${vids[0].title}.`;
  },

  async music({ query }) {
    const q = (query || '').trim() || 'chill';
    if (svc.isGenre(q)) {
      const radio = await playRadio(q);
      if (radio) return radio;
    }
    try {
      const vids = await svc.searchVideos(q);
      if (vids.length) {
        const v = player.playYouTube(vids);
        return `Je lance ${v.title}.`;
      }
    } catch { /* on tente la radio */ }
    const radio = await playRadio(q);
    if (radio) return radio;
    ui.card(`Musique · ${q}`, el('div', { class: 'actions-row' },
      chip('▶️ Écouter sur YouTube', null, svc.youtubeSearchURL(q))), { icon: '🎵' });
    return `Je n'ai pas trouvé ${q} directement, voici un lien.`;
  },

  async study({ topic, quick }) {
    const body = el('div', {}, ui.loading(), el('p', { class: 'sources' }, `Je consulte mes sources sur « ${topic} »…`));
    const c = ui.card(`Étude · ${topic}`, body, { icon: '📚' });
    const wiki = await svc.wikiLookup(topic).catch(() => null);

    if (quick && wiki?.summary) {
      c.remove();
      showWikiCard(wiki);
      return wiki.summary.split(/(?<=[.!?])\s/).slice(0, 2).join(' ');
    }

    let notes = null;
    try { notes = await studyNotes(topic, wiki); } catch (e) { console.warn(e); }
    body.innerHTML = '';
    const md = notes?.display || (wiki ? `## En bref\n${wiki.summary}\n\n${wiki.text.split('\n').filter(Boolean).slice(1, 6).join('\n\n')}` : '');
    if (!md) {
      body.append(el('p', {}, `Je n'ai rien trouvé sur « ${topic} ».`));
      return `Je n'ai rien trouvé sur ${topic}.`;
    }
    body.append(
      el('div', { class: 'study-hero' },
        wiki?.image ? el('img', { src: wiki.image, alt: wiki.title, loading: 'lazy', onclick: () => ui.lightbox([{ full: wiki.image, thumb: wiki.image, title: wiki.title, source: wiki.url }]) }) : null,
        el('div', { class: 'md', html: (await import('./markdown.js')).renderMarkdown(md) })),
      el('div', { class: 'actions-row' },
        chip('🖼️ Images', () => handle(`montre-moi des images de ${topic}`)),
        chip('🎬 Vidéo explicative', () => handle(`lance une vidéo sur ${topic}`)),
        ...(wiki?.related || []).slice(0, 2).map((r) => chip(`📚 ${r}`, () => handle(`étudie ${r}`)))),
      wiki ? el('p', { class: 'sources' }, 'Source : ', el('a', { href: wiki.url, target: '_blank', rel: 'noopener' }, `Wikipédia — ${wiki.title}`)) : null);
    return notes?.speech || wiki?.summary.split(/(?<=[.!?])\s/).slice(0, 2).join(' ') || `Voici ma fiche sur ${topic}.`;
  },

  async weather({ city }) {
    const w = await svc.getWeather(city);
    const [label, emoji] = svc.wmo(w.current.weather_code);
    const days = w.daily.time.map((d, i) => el('div', { class: 'day' },
      new Date(d).toLocaleDateString('fr-FR', { weekday: 'short' }),
      el('b', {}, svc.wmo(w.daily.weather_code[i])[1]),
      `${Math.round(w.daily.temperature_2m_min[i])}° / ${Math.round(w.daily.temperature_2m_max[i])}°`));
    ui.card(`Météo · ${w.place}`, el('div', { class: 'weather' },
      el('div', { class: 'big' }, `${emoji} ${Math.round(w.current.temperature_2m)}°`),
      el('div', {}, el('div', {}, label), el('small', {}, `Ressenti ${Math.round(w.current.apparent_temperature)}° · Humidité ${w.current.relative_humidity_2m}% · Vent ${Math.round(w.current.wind_speed_10m)} km/h`)),
      el('div', { class: 'days' }, days)), { icon: '🌍' });
    return `À ${w.place.split(',')[0]}, ${label.toLowerCase()}, ${Math.round(w.current.temperature_2m)} degrés. Maximum ${Math.round(w.daily.temperature_2m_max[0])} aujourd'hui.`;
  },

  async timer({ seconds, label }) {
    let left = Math.max(1, Math.round(+seconds || 60));
    const disp = el('div', { class: 'timer-display' });
    const fmt = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':').replace(/^00:/, '');
    disp.textContent = fmt(left);
    const end = Date.now() + left * 1000;
    const c = ui.card(`Minuteur · ${label || fmt(left)}`, disp, { icon: '⏱️' });
    const iv = setInterval(() => {
      if (!c.isConnected) return clearInterval(iv);
      left = Math.max(0, Math.round((end - Date.now()) / 1000));
      disp.textContent = fmt(left);
      if (!left) {
        clearInterval(iv);
        chime(false); setTimeout(() => chime(false), 300); setTimeout(() => chime(false), 600);
        say(`Le minuteur ${label || ''} est terminé.`, turn);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Jarvis', { body: 'Minuteur terminé' });
      }
    }, 500);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    return '';
  },

  async open({ url }) {
    if (!/^https?:\/\//.test(url || '')) return '';
    ui.card('Lien', el('div', { class: 'actions-row' }, chip(`↗️ ${new URL(url).hostname}`, null, url)), { icon: '🔗' });
    window.open(url, '_blank', 'noopener');
    return '';
  },

  async media({ command }) {
    switch (command) {
      case 'pause': player.pause(); return '';
      case 'resume': player.resume(); return '';
      case 'stop': player.stop(); voice.stopSpeaking(); return '';
      case 'next': { const n = player.next(); return n ? `Voici ${n.title || n.name}.` : ''; }
      case 'volume_up': player.setVolume(player.getVolume() + 0.15); return '';
      case 'volume_down': player.setVolume(player.getVolume() - 0.15); return '';
      default: return '';
    }
  },

  async clear() { ui.clearStage(); return ''; },
};

async function playRadio(q) {
  const stations = await svc.searchRadio(q).catch(() => []);
  if (!stations.length) return null;
  const s = player.playRadio(stations);
  return `Je lance la radio ${s.name}.`;
}

function showWikiCard(w) {
  ui.card(w.title, el('div', { class: 'study-hero' },
    w.image ? el('img', { src: w.image, alt: w.title, loading: 'lazy' }) : null,
    el('div', {}, el('p', {}, w.summary),
      el('div', { class: 'actions-row' },
        chip('📚 Fiche complète', () => handle(`étudie ${w.title}`)),
        chip('🖼️ Images', () => handle(`montre-moi des images de ${w.title}`)),
        chip('↗️ Wikipédia', null, w.url)))), { icon: '🔎' });
}

// Carte d'accueil : obtenir une clé Groq gratuite (sans carte bancaire) en 1 minute.
function showOnboarding() {
  if (document.getElementById('onboard')) return;
  const input = el('input', { type: 'password', class: 'field', placeholder: 'Collez votre clé gsk_…' });
  const body = el('div', { class: 'md' },
    el('p', {}, "Les commandes d'images, vidéos, musique, météo et minuteur marchent déjà sans rien configurer. Pour que je puisse converser et rédiger des fiches d'étude, donnez-moi un cerveau gratuit :"),
    el('ol', {},
      el('li', {}, 'Ouvrez ', el('a', { href: 'https://console.groq.com/keys', target: '_blank', rel: 'noopener' }, 'console.groq.com/keys'), ' et connectez-vous (Google, gratuit, sans carte bancaire).'),
      el('li', {}, 'Cliquez sur « Create API Key », copiez la clé.'),
      el('li', {}, 'Collez-la ici :')),
    el('div', { class: 'actions-row' }, input, el('button', { class: 'primary', type: 'button', onclick: () => {
      const k = input.value.trim();
      if (!k) return;
      saveSettings({ groqKey: k, provider: 'auto' });
      c.remove();
      refreshStatus();
      say('Merci. Mon cerveau est opérationnel.');
    } }, 'Activer')));
  const c = ui.card('Activer mon intelligence', body, { icon: '🧠' });
  c.id = 'onboard';
}

// ---------------- Interface ----------------
function firstGesture() {
  voice.unlock();
  player.unlockAudio();
  // Sur iPhone, le micro ne peut démarrer qu'après un premier toucher : on active l'écoute « Jarvis » à ce moment-là.
  if (settings.wakeMode && voice.supported && !voice.denied) {
    if (!voice.wakeEnabled) { voice.setWake(true); updateWakeButton(); refreshStatus(); }
    else voice.ensureListening();
  }
}

function updateWakeButton() {
  $('btn-wake').setAttribute('aria-pressed', String(voice.wakeEnabled));
  $('btn-wake').title = voice.wakeEnabled ? `Écoute permanente activée (« ${settings.wakeName} »)` : 'Activer l\'écoute permanente';
}
function updateMuteButton() {
  $('btn-mute').setAttribute('aria-pressed', String(settings.muted));
  $('btn-mute').title = settings.muted ? 'Voix de Jarvis coupée' : 'Voix de Jarvis activée';
  $('btn-mute').innerHTML = settings.muted
    ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4zm15.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>';
}

function toggleListen() {
  firstGesture();
  if (voice.speaking) { voice.stopSpeaking(); return; }
  if (!voice.supported) {
    ui.setLive("La reconnaissance vocale n'est pas disponible sur ce navigateur : utilisez Chrome, Edge ou Safari.", 'reply');
    $('input').focus();
    return;
  }
  voice.listenOnce();
}

function bindUI() {
  $('orb').onclick = toggleListen;
  $('mic').onclick = toggleListen;
  $('composer').onsubmit = (e) => {
    e.preventDefault();
    firstGesture();
    const v = $('input').value;
    $('input').value = '';
    handle(v);
  };
  document.querySelectorAll('.suggest [data-cmd]').forEach((b) => { b.onclick = () => { firstGesture(); handle(b.dataset.cmd); }; });

  $('btn-wake').onclick = () => {
    firstGesture();
    if (!voice.supported) return toggleListen();
    const on = !settings.wakeMode;
    voice.denied = false;
    voice.setWake(on);
    saveSettings({ wakeMode: on });
    updateWakeButton();
    refreshStatus();
    if (on) ui.log('system', `Écoute permanente activée : dites « ${settings.wakeName} » suivi de votre demande.`);
  };
  $('btn-mute').onclick = () => {
    saveSettings({ muted: !settings.muted });
    if (settings.muted) voice.stopSpeaking();
    updateMuteButton();
  };
  $('btn-clear').onclick = () => ui.clearStage();
  $('btn-settings').onclick = openSettings;

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); toggleListen(); }
    if (e.key === 'Escape') { voice.stopSpeaking(); }
  });
  document.addEventListener('pointerdown', firstGesture, { capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) voice.ensureListening(); });
  window.addEventListener('online', refreshStatus);
  window.addEventListener('offline', refreshStatus);
}

// ---------------- Réglages ----------------
function fillVoices(select) {
  const lang = settings.lang.slice(0, 2);
  const voices = speechSynthesis?.getVoices?.() || [];
  select.innerHTML = '';
  select.append(el('option', { value: '' }, 'Automatique'));
  voices.filter((v) => v.lang.toLowerCase().startsWith(lang)).forEach((v) => select.append(el('option', { value: v.voiceURI }, `${v.name} (${v.lang})`)));
  select.value = settings.voiceURI;
}

function openSettings() {
  const dlg = $('settings');
  const f = dlg.querySelector('form');
  for (const [k, v] of Object.entries(settings)) {
    const input = f.elements[k];
    if (input && input.type !== 'checkbox') input.value = v;
  }
  fillVoices(f.elements.voiceURI);
  f.elements.lang.onchange = () => { settings.lang = f.elements.lang.value; fillVoices(f.elements.voiceURI); };
  const saved = { ...settings };
  $('test-voice').onclick = () => {
    Object.assign(settings, { voiceURI: f.elements.voiceURI.value, rate: +f.elements.rate.value, pitch: +f.elements.pitch.value, muted: false });
    voice.speak('Bonjour, je suis Jarvis. Tous les systèmes sont opérationnels.');
    settings.muted = saved.muted;
  };
  $('forget').onclick = () => { memory.clear(); ui.log('system', 'Historique effacé.'); };
  // Fermeture animée pour les boutons ; la touche Échap ferme instantanément (pas d'animation au clavier).
  const closeAnimated = (value) => ui.animateOut(dlg, 'closing', () => { dlg.classList.remove('closing'); dlg.close(value); });
  f.onsubmit = (e) => { e.preventDefault(); closeAnimated(e.submitter?.value || 'cancel'); };
  dlg.onclose = () => {
    if (dlg.returnValue === 'save') {
      const patch = {};
      for (const k of Object.keys(defaults)) {
        const input = f.elements[k];
        if (!input || input.type === 'checkbox') continue;
        patch[k] = typeof defaults[k] === 'number' ? +input.value : input.value.trim();
      }
      if (!patch.wakeName) patch.wakeName = defaults.wakeName;
      saveSettings(patch);
      ui.log('system', 'Réglages enregistrés.');
    } else {
      Object.assign(settings, saved);
    }
    refreshStatus();
  };
  dlg.showModal();
}

// Horloge de l'écran d'accueil (s'arrête dès que l'accueil disparaît).
function startClock() {
  const tick = () => {
    const clock = $('welcome-clock');
    if (!clock) return clearInterval(iv);
    const now = new Date();
    clock.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    $('welcome-date').textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const iv = setInterval(tick, 1000);
  tick();
}

// ---------------- Démarrage ----------------
function init() {
  startClock();
  player.initPlayer();
  bindUI();
  updateMuteButton();
  if (settings.wakeMode && voice.supported) voice.setWake(true);
  updateWakeButton();
  refreshStatus();
  ui.setOrb(voice.wakeEnabled ? 'wake' : 'idle');

  const h = new Date().getHours();
  const hello = h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
  ui.setLive(`${hello}. Je suis à votre service.`, 'reply');
  // Si le navigateur exige un geste avant d'ouvrir le micro (iPhone), on le demande clairement.
  setTimeout(() => {
    if (settings.wakeMode && voice.supported && !voice.listening && !voice.speaking) {
      ui.setLive(`Touchez l'écran une fois : ensuite dites simplement « ${settings.wakeName} » pour me parler.`, 'reply');
    }
  }, 1500);
  if (!settings.groqKey && !settings.geminiKey && !settings.claudeKey) showOnboarding();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
