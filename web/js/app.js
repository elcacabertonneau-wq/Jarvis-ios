// Orchestrateur de Jarvis : relie la voix, l'IA, les commandes locales et l'affichage.
import { settings, saveSettings, defaults } from './settings.js';
import { Voice, chime } from './voice.js';
import { think, see, canSee, studyNotes, mindmapFor, memory, activeProviderLabel } from './brain.js';
import * as camera from './camera.js';
import { matchIntent, matchTableIntent, matchMindmapIntent } from './intents.js';
import * as mindmap from './mindmap.js';
import * as tables from './tables.js';
import { extractTable, renderMarkdown } from './markdown.js';
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
  bumpActivity();

  // Cartes mentales : création (via l'IA dédiée) et affichage (instantané).
  const mmCmd = matchMindmapIntent(text, { hasMindmap: mindmap.hasMindmap(), canRestore: mindmap.canRestore() });
  if (mmCmd) {
    if (mmCmd.create) {
      setBusy(true);
      const speech = await ACTIONS.mindmap_topic({ topic: mmCmd.create, place: mmCmd.place });
      setBusy(false);
      await say(speech, t);
    } else if (mmCmd.fit) mindmap.fit();
    else await say(mindmap.update(mmCmd), t);
    return;
  }

  // Disposition des tableaux et affichage en grand : instantané, sans IA.
  const tableCmd = matchTableIntent(text, { hasTable: tables.hasTable(), canRestore: tables.canRestore() });
  if (tableCmd) {
    await say(tables.update(tableCmd), t);
    return;
  }
  const sizeCmd = !tables.hasTable() && ui.hasCards() ? matchTableIntent(text, { hasTable: true }) : null;
  if (sizeCmd && Object.keys(sizeCmd).length === 1 && 'expand' in sizeCmd) {
    if (sizeCmd.expand) ui.expandCard(ui.expandedCard() || ui.firstCard());
    else ui.collapseCard();
    return;
  }

  const local = matchIntent(text);
  try {
    setBusy(true);
    if (local) {
      const speech = await runActions(local.actions, text);
      setBusy(false);
      await say(local.speech || speech, t);
    } else {
      const reply = await think(text, { playing: player.nowPlaying(), screen: ui.describeStage(), table: tables.describe(), mindmap: mindmap.describe(), ...visionContext() });
      if (t !== turn) return;
      // Un tableau Markdown dans la réponse devient un vrai tableau récapitulatif.
      if (reply.display && !reply.actions.some((a) => a?.type === 'table')) {
        const md = extractTable(reply.display);
        if (md && md.rows.length >= 2) {
          reply.actions.unshift({ type: 'table', title: reply.title || 'Récapitulatif', columns: md.columns, rows: md.rows });
          reply.display = md.rest.replace(/^#+\s.*$/gm, '').trim().length > 60 ? md.rest : '';
        }
      }
      if (reply.display) ui.textCard(reply.title || 'Jarvis', reply.display, '💬', reply.place);
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
  async images({ query, place, count }) {
    const single = +count === 1;
    const body = el('div', {}, ui.loading());
    ui.card(`${single ? 'Photo' : 'Images'} · ${query}`, body, { icon: '🖼️', place, kind: single ? 'photo' : 'images' });
    const items = await svc.searchImages(query).catch(() => []);
    body.innerHTML = '';
    if (!items.length) {
      body.append(el('p', {}, 'Aucune image trouvée.'), el('div', { class: 'actions-row' },
        chip('✨ Générer une image', () => handle(`génère une image de ${query}`))));
      return `Je n'ai trouvé aucune image de ${query}. Je peux en générer une si vous voulez.`;
    }
    if (single) {
      // Une seule photo, affichée en grand dans sa carte.
      const it = items[0];
      const img = el('img', { class: 'hero-img', src: it.full || it.thumb, alt: it.title || query, referrerpolicy: 'no-referrer', onclick: () => ui.lightbox(items, 0) });
      img.onerror = () => { img.onerror = null; img.src = it.thumb; };
      body.append(el('figure', { class: 'hero-fig' }, img, it.title ? el('figcaption', {}, it.title) : null));
      return '';
    }
    body.append(ui.gallery(items, (i) => ui.lightbox(items, i)),
      el('div', { class: 'actions-row' },
        chip('✨ Générer une image', () => handle(`génère une image de ${query}`)),
        chip('🎬 Vidéo', () => handle(`lance une vidéo sur ${query}`)),
        chip('📚 Étudier', () => handle(`étudie ${query}`))));
    return `Voici des images de ${query}.`;
  },

  async generate_image({ prompt, place }) {
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
    ui.card(`Création · ${prompt.slice(0, 60)}`, body, { icon: '✨', place, kind: 'photo' });
    return "C'est en cours de création.";
  },

  async video({ query, place }) {
    const body = el('div', {}, ui.loading());
    // Une vidéo en cours ne disparaît pas toute seule pendant 15 minutes.
    const vc = ui.card(`Vidéo · ${query}`, body, { icon: '🎬', keep: true, place, kind: 'video' });
    setTimeout(() => { delete vc.dataset.keep; }, 15 * 60 * 1000);
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

  async study({ topic, quick, place }) {
    const body = el('div', {}, ui.loading(), el('p', { class: 'sources' }, `Je consulte mes sources sur « ${topic} »…`));
    const c = ui.card(`Étude · ${topic}`, body, { icon: '📚', place, kind: 'study' });
    const wiki = await svc.wikiLookup(topic).catch(() => null);

    if (quick && wiki?.summary) {
      ui.removeCard(c);
      showWikiCard(wiki, place);
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

  async weather({ city, place }) {
    const w = await svc.getWeather(city);
    const [label, emoji] = svc.wmo(w.current.weather_code);
    const days = w.daily.time.map((d, i) => el('div', { class: 'day' },
      new Date(d).toLocaleDateString('fr-FR', { weekday: 'short' }),
      el('b', {}, svc.wmo(w.daily.weather_code[i])[1]),
      `${Math.round(w.daily.temperature_2m_min[i])}° / ${Math.round(w.daily.temperature_2m_max[i])}°`));
    ui.card(`Météo · ${w.place}`, el('div', { class: 'weather' },
      el('div', { class: 'big' }, `${emoji} ${Math.round(w.current.temperature_2m)}°`),
      el('div', {}, el('div', {}, label), el('small', {}, `Ressenti ${Math.round(w.current.apparent_temperature)}° · Humidité ${w.current.relative_humidity_2m}% · Vent ${Math.round(w.current.wind_speed_10m)} km/h`)),
      el('div', { class: 'days' }, days)), { icon: '🌍', place, kind: 'weather' });
    return `À ${w.place.split(',')[0]}, ${label.toLowerCase()}, ${Math.round(w.current.temperature_2m)} degrés. Maximum ${Math.round(w.daily.temperature_2m_max[0])} aujourd'hui.`;
  },

  async timer({ seconds, label, place }) {
    let left = Math.max(1, Math.round(+seconds || 60));
    const disp = el('div', { class: 'timer-display' });
    const fmt = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':').replace(/^00:/, '');
    disp.textContent = fmt(left);
    const end = Date.now() + left * 1000;
    const c = ui.card(`Minuteur · ${label || fmt(left)}`, disp, { icon: '⏱️', keep: true, place, kind: 'timer' });
    const iv = setInterval(() => {
      if (!c.isConnected) return clearInterval(iv);
      left = Math.max(0, Math.round((end - Date.now()) / 1000));
      disp.textContent = fmt(left);
      if (!left) {
        clearInterval(iv);
        delete c.dataset.keep; // une fois terminé, il peut disparaître avec le reste
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

  async fullscreen({ on = true }) {
    if (!fsSupported()) return "Le plein écran n'est pas disponible sur cet appareil.";
    if (on === isFullscreen()) return '';
    const ok = await setFullscreen(on);
    if (ok || !on) return '';
    // Le navigateur n'autorise le plein écran qu'après un clic ou une touche.
    return 'Appuyez sur la touche F ou sur le bouton plein écran : le navigateur exige un clic pour cela.';
  },

  async table(a) {
    // Un tableau placé à un endroit précis reste dans la disposition au lieu de s'ouvrir en grand.
    const data = tables.show(a, { expand: !ui.normalizePlace(a.place), place: a.place });
    return data ? '' : "Je n'ai pas pu construire ce tableau.";
  },

  async table_update(a) {
    return tables.update({
      layout: a.layout,
      sort: a.sort ? { column: a.sort.column, order: a.sort.order } : undefined,
      highlight: a.highlight,
      hide: a.hide,
      showAll: a.show_all,
      transpose: a.transpose,
      expand: a.expand,
      close: a.close,
      restore: a.restore,
    });
  },

  async text({ title, content, place }) {
    if (content) ui.textCard(title || 'Jarvis', content, '💬', place);
    return '';
  },

  async move({ target, place }) {
    return ui.placeCard(kindsFor(target), place) ? '' : `Je ne trouve pas d'élément « ${target} » à déplacer.`;
  },

  async swap({ a, b }) {
    return ui.swapCards(kindsFor(a), kindsFor(b)) ? '' : 'Je ne trouve pas ces deux éléments.';
  },

  async layout_reset() { ui.resetLayout(); return ''; },

  // ---------- Cartes mentales ----------
  async mindmap(a) {
    const data = mindmap.show(a, { expand: !ui.normalizePlace(a.place), place: a.place });
    return data ? '' : "Je n'ai pas pu construire cette carte mentale.";
  },
  async mindmap_topic({ topic, place, extra }) {
    try {
      const raw = await mindmapFor(topic, extra);
      mindmap.show({ ...raw, title: raw.title || topic }, { expand: !ui.normalizePlace(place), place });
      return raw.speech || `Voici la carte mentale sur ${topic}.`;
    } catch (e) {
      console.warn(e);
      if (!settings.groqKey && !settings.geminiKey && !settings.claudeKey) showOnboarding();
      return "Je n'ai pas réussi à construire la carte mentale.";
    }
  },
  async mindmap_update(a) {
    return mindmap.update({ layout: a.layout, expandAll: a.expand_all, collapseAll: a.collapse_all, toggle: a.toggle, close: a.close, restore: a.restore, expand: a.expand });
  },

  // ---------- Mise en forme libre ----------
  // Page conçue entièrement par l'IA (HTML + CSS + JS), isolée dans un cadre sécurisé.
  async page({ title, html, height, place }) {
    if (!html) return '';
    const id = `p${Date.now().toString(36)}`;
    const frame = el('iframe', {
      class: 'page-frame', title: title || 'Page', sandbox: 'allow-scripts',
      referrerpolicy: 'no-referrer', style: `height:${Math.min(Math.max(+height || 520, 160), 2400)}px`,
    });
    frame.srcdoc = pageDocument(html, id);
    frame.dataset.pid = id;
    const c = ui.card(title || 'Page', el('div', { class: 'page-body' }, frame), { icon: '🧩', place, kind: 'page' });
    if (!ui.normalizePlace(place) && (+height || 520) > 480) ui.expandCard(c);
    return '';
  },

  // Disposition exacte des fenêtres (x, y, largeur, hauteur en %).
  async arrange({ items = [] }) {
    let n = 0;
    for (const it of items.slice(0, 12)) {
      const c = ui.findCardByKind(kindsFor(it.target)) || (it.target === 'last' ? ui.firstCard() : null);
      if (c && ui.setFree(c, it)) n++;
    }
    return n ? '' : "Je ne trouve pas les éléments à disposer.";
  },

  async style(a) {
    const c = a.target ? ui.findCardByKind(kindsFor(a.target)) : ui.firstCard();
    return ui.styleCard(c, a) ? '' : `Je ne trouve pas d'élément « ${a.target} ».`;
  },

  async theme({ accent, background }) {
    ui.applyTheme({ accent, background });
    saveSettings({ themeAccent: accent === 'default' ? '' : (accent ?? settings.themeAccent), themeBackground: background ?? settings.themeBackground });
    return '';
  },

  // Réduire dans la barre / rouvrir (cartes et lecteur de musique).
  async minimize({ target = 'all' }) {
    const t = String(target).toLowerCase();
    if (t === 'all' || t === 'tout') { const n = ui.minimizeAll(); const m = player.minimizeDock(); return n || m ? '' : "Il n'y a rien à réduire."; }
    if (/musique|radio|lecteur|son/.test(t)) return player.minimizeDock() ? '' : "Aucune musique n'est en cours.";
    return ui.minimizeKind(t.includes('cam') ? 'camera' : kindsFor(t)) ? '' : `Je ne trouve pas d'élément « ${target} » à réduire.`;
  },
  async restore({ target = 'all' }) {
    const t = String(target).toLowerCase();
    if (t === 'all' || t === 'tout') { const n = ui.restoreAll(); const m = player.restoreDock(); return n || m ? '' : "Rien n'est réduit."; }
    if (/musique|radio|lecteur|son/.test(t)) return player.restoreDock() ? '' : "Le lecteur n'est pas réduit.";
    return ui.restoreKind(t.includes('cam') ? 'camera' : kindsFor(t)) ? '' : `Je ne trouve pas d'élément « ${target} » réduit.`;
  },

  async camera({ on = true, switch: sw, place }) {
    if (sw) { await camera.switchCamera(); return ''; }
    if (!on) { camera.closeCamera(); return ''; }
    try {
      await camera.openCamera({ place, onAnalyze: () => handle('analyse ce que tu vois sur la caméra'), onSearch: () => handle('fais des recherches sur ce que tu vois sur la caméra') });
      return '';
    } catch (e) {
      ui.errorCard(e.message);
      return e.message;
    }
  },

  // Regarder la caméra ou une image, puis répondre (et lancer des recherches si demandé).
  async look({ prompt = 'Décris ce que tu vois.' }) {
    if (!canSee()) {
      showOnboarding();
      return "Pour analyser une image, j'ai besoin d'une clé gratuite Groq ou Gemini dans les réglages.";
    }
    const p = prompt.toLowerCase();
    const wantsCam = /cam[ée]ra|webcam|\bcam\b|tu vois|tu me vois|regarde|je (?:te )?montre|je tiens|devant|dans (?:ma|la) main/.test(p);
    const wantsImg = /image|photo|fichier|document|capture|[ée]cran/.test(p) && !/cam[ée]ra|webcam/.test(p);
    const recent = camera.getLastImage();
    let image = null;
    if (wantsImg && !wantsCam) image = recent || await camera.imageFromScreen();
    if (!image && (wantsCam || camera.isOpen() || !recent)) {
      try {
        if (!camera.isOpen()) await ACTIONS.camera({ on: true });
        if (!camera.isOpen()) return '';
        camera.setScanning(true);
        image = { dataUrl: await camera.capture(), label: 'caméra', source: 'camera' };
      } catch (e) {
        camera.setScanning(false);
        return e.message;
      }
    }
    image = image || recent;
    if (!image) return "Je n'ai aucune image à analyser.";
    try {
      const reply = await see(prompt, image, { playing: player.nowPlaying(), screen: ui.describeStage(), table: tables.describe(), ...visionContext() });
      camera.setScanning(false);
      // Carte d'analyse : l'image regardée + la réponse détaillée.
      const shot = image.dataUrl || image.url;
      if (reply.display || shot) {
        const body = el('div', { class: 'vision' },
          el('img', { class: 'vision-shot', src: shot, alt: 'Image analysée', onclick: () => ui.lightbox([{ full: shot, thumb: shot, title: 'Image analysée' }]) }),
          reply.display ? el('div', { class: 'md', html: renderMarkdown(reply.display) }) : el('p', { class: 'md' }, reply.speech));
        ui.card(reply.title || 'Analyse visuelle', body, { icon: '👁️', place: reply.place, kind: 'text' });
      }
      const speech = await runActions(reply.actions, prompt);
      return reply.speech || speech || 'Voici mon analyse.';
    } catch (e) {
      camera.setScanning(false);
      console.warn(e);
      return "Je n'ai pas réussi à analyser l'image. Vérifiez qu'une clé Groq ou Gemini est bien configurée.";
    }
  },
};

// Mots utilisés pour désigner un élément → types de cartes correspondants.
function kindsFor(word = '') {
  const w = String(word).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/carte mentale|mind ?map|mindmap|carte des idees|heuristique/.test(w)) return 'mindmap';
  if (/camera|webcam/.test(w)) return 'camera';
  if (/page|infographie|affiche|frise|presentation|dashboard|tableau de bord/.test(w)) return 'page';
  if (/photo|image|illustration|dessin|creation/.test(w)) return 'photo|images';
  if (/images|galerie/.test(w)) return 'images|photo';
  if (/video|clip|film|documentaire/.test(w)) return 'video';
  if (/recap|tableau|resume|comparatif|synthese|table/.test(w)) return 'table|text';
  if (/fiche|etude|cours|explication|article|wiki/.test(w)) return 'study|wiki|text';
  if (/meteo|temps/.test(w)) return 'weather';
  if (/minuteur|timer|chrono/.test(w)) return 'timer';
  if (/texte|reponse|message|note/.test(w)) return 'text|study|wiki';
  return w;
}

async function playRadio(q) {
  const stations = await svc.searchRadio(q).catch(() => []);
  if (!stations.length) return null;
  const s = player.playRadio(stations);
  return `Je lance la radio ${s.name}.`;
}

function showWikiCard(w, place = '') {
  ui.card(w.title, el('div', { class: 'study-hero' },
    w.image ? el('img', { src: w.image, alt: w.title, loading: 'lazy' }) : null,
    el('div', {}, el('p', {}, w.summary),
      el('div', { class: 'actions-row' },
        chip('📚 Fiche complète', () => handle(`étudie ${w.title}`)),
        chip('🖼️ Images', () => handle(`montre-moi des images de ${w.title}`)),
        chip('↗️ Wikipédia', null, w.url)))), { icon: '🔎', place, kind: 'wiki' });
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
      ui.removeCard(c, true);
      refreshStatus();
      say('Merci. Mon cerveau est opérationnel.');
    } }, 'Activer')));
  const c = ui.card('Activer mon intelligence', body, { icon: '🧠', keep: true });
  c.id = 'onboard';
}

// ---------------- Plein écran ----------------
const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
async function setFullscreen(on) {
  try {
    if (on) await (document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) ?? document.documentElement.webkitRequestFullscreen?.());
    else await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
    return true;
  } catch {
    return false;
  }
}
function toggleFullscreen() { setFullscreen(!isFullscreen()); }

// En plein écran, le curseur disparaît après 3 s d'immobilité.
let cursorTimer = null;
function wakeCursor() {
  document.body.classList.remove('cursor-hidden');
  clearTimeout(cursorTimer);
  if (isFullscreen()) cursorTimer = setTimeout(() => document.body.classList.add('cursor-hidden'), 3000);
}
function onFullscreenChange() {
  const on = isFullscreen();
  document.body.classList.toggle('is-fullscreen', on);
  const b = $('btn-fullscreen');
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'Quitter le plein écran (F ou Échap)' : 'Plein écran (F)';
  b.innerHTML = on
    ? '<svg viewBox="0 0 24 24"><path d="M8 4h2v6H4V8h4V4zm6 0h2v4h4v2h-6V4zM4 14h6v6H8v-4H4v-2zm10 0h6v2h-4v4h-2v-6z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z"/></svg>';
  wakeCursor();
  // La vue « en grand » se recale sur la nouvelle taille d'écran.
  dispatchEvent(new Event('resize'));
}

// Document complet d'une page libre : styles de base sombres + envoi de sa hauteur à Jarvis.
function pageDocument(html, id) {
  // color-scheme sombre obligatoire : sinon le navigateur peint un fond blanc derrière la page.
  const scheme = '<meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}</style>';
  const base = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${scheme}
<style>html,body{margin:0;background:transparent;color:#e6f3ff;font:16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}img{max-width:100%}a{color:#7fe3ff}body{padding:4px}</style>`;
  const report = `<script>(()=>{const s=()=>parent.postMessage({jarvisPage:${JSON.stringify(id)},h:Math.ceil(document.documentElement.scrollHeight)},'*');
addEventListener('load',s);new ResizeObserver(s).observe(document.documentElement);setTimeout(s,300);})();<\/script>`;
  if (/<html[\s>]/i.test(html)) {
    const withHead = /<head[\s>]/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${scheme}`) : html.replace(/<html([^>]*)>/i, `<html$1><head>${scheme}</head>`);
    return /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>/i, `${report}</body>`) : `${withHead}${report}`;
  }
  return `<!doctype html><html><head>${base}</head><body>${html}${report}</body></html>`;
}
// Adapte la hauteur des pages libres à leur contenu (sauf en affichage en grand ou disposition libre).
addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d.jarvisPage !== 'string') return;
  const f = document.querySelector(`iframe[data-pid="${d.jarvisPage}"]`);
  if (f && e.source === f.contentWindow) f.style.height = `${Math.min(Math.max(d.h, 120), 3000)}px`;
});

// Ce que l'IA doit savoir sur la caméra et les images disponibles.
function visionContext() {
  const img = camera.getLastImage();
  return {
    camera: camera.isOpen(),
    image: img && Date.now() - img.at < 10 * 60 * 1000 ? `${img.source === 'upload' ? 'envoyée' : 'à l’écran'} : ${img.label}` : '',
  };
}

// ---------------- Images envoyées (bouton, glisser-déposer, coller) ----------------
async function receiveImage(file) {
  if (!file?.type?.startsWith('image/')) return;
  firstGesture();
  try {
    const dataUrl = await camera.toJpeg(file, 1280);
    camera.setLastImage({ dataUrl, label: file.name || 'image collée', source: 'upload' });
    const body = el('div', {},
      el('figure', { class: 'hero-fig' }, el('img', { class: 'hero-img', src: dataUrl, alt: file.name || 'Image envoyée', onclick: () => ui.lightbox([{ full: dataUrl, thumb: dataUrl, title: file.name }]) })),
      el('div', { class: 'actions-row' },
        chip('🔎 Analyser', () => handle('analyse cette image')),
        chip('📚 Rechercher des infos', () => handle('fais des recherches à partir de cette image')),
        chip('🖼️ Images similaires', () => handle('trouve des images similaires à cette image')),
        chip('📝 Lire le texte', () => handle('lis le texte de cette image'))));
    ui.card(`Image · ${file.name || 'collée'}`, body, { icon: '🖼️', kind: 'photo' });
    await say('Image reçue. Que voulez-vous savoir ?');
  } catch {
    ui.errorCard("Je n'arrive pas à lire cette image.");
  }
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

  // Images : bouton 📎, glisser-déposer sur la fenêtre, ou coller (Ctrl+V).
  $('attach').onclick = () => $('file').click();
  $('file').onchange = (e) => { receiveImage(e.target.files?.[0]); e.target.value = ''; };
  $('btn-camera').onclick = () => (camera.isOpen() ? camera.closeCamera() : handle('affiche ma caméra'));
  addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); document.body.classList.add('dropping'); } });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  addEventListener('drop', (e) => {
    document.body.classList.remove('dropping');
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); receiveImage(f); }
  });
  addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); receiveImage(f); }
  });

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
  if (fsSupported()) {
    $('btn-fullscreen').hidden = false;
    $('btn-fullscreen').onclick = toggleFullscreen;
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('pointermove', wakeCursor, { passive: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.collapseCard()) return; // réduit l'affichage en grand, même depuis la saisie
    if (e.target.matches('input, textarea, select') || e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); toggleListen(); }
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && fsSupported()) { e.preventDefault(); toggleFullscreen(); }
    if (e.key === 'Escape') voice.stopSpeaking();
  });
  document.addEventListener('pointerdown', firstGesture, { capture: true });
  ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach((ev) => document.addEventListener(ev, bumpActivity, { capture: true, passive: true }));
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

// Horloge de l'écran d'accueil (mise à jour seulement quand il est visible).
function startClock() {
  const tick = () => {
    const clock = $('welcome-clock');
    if ($('stage-empty').hidden) return;
    const now = new Date();
    clock.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    $('welcome-date').textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  setInterval(tick, 1000);
  tick();
}

// ---------------- Retour automatique à l'accueil ----------------
// Après un moment sans activité, les recherches s'effacent et l'accueil revient.
let lastActivity = Date.now();
function bumpActivity() { lastActivity = Date.now(); }
function startIdleWatch() {
  setInterval(() => {
    const delay = (+settings.idleReturn || 0) * 1000;
    if (!delay || busy || voice.speaking || voice.capturing) return;
    if (!ui.hasCards() || Date.now() - lastActivity < delay) return;
    if (![...document.querySelectorAll('#stage .card:not(.leaving)')].some((c) => !c.dataset.keep)) return;
    ui.clearStage({ auto: true });
    ui.setLive('');
  }, 5000);
}

// ---------------- Démarrage ----------------
function init() {
  startClock();
  if (settings.themeAccent || settings.themeBackground) ui.applyTheme({ accent: settings.themeAccent, background: settings.themeBackground });
  startIdleWatch();
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
