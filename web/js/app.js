// Orchestrateur de Jarvis : relie la voix, l'IA, les commandes locales et l'affichage.
import { settings, saveSettings, defaults } from './settings.js';
import { Voice, chime } from './voice.js';
import { think, see, explainError, canSee, studyNotes, mindmapFor, arSceneFor, arSceneFromImage, arPlan, routeInfo, labelObjects, fileFor, memory, activeProviderLabel } from './brain.js';
import * as geo from './geo.js';
import * as ar from './ar.js';
import * as draw from './draw.js';
import * as facts from './facts.js';
import * as initiative from './initiative.js';
import * as tr from './translate.js';
import * as routines from './routines.js';
import * as files from './files.js';
import * as camera from './camera.js';
import { matchIntent, matchTableIntent, matchMindmapIntent, matchARIntent, matchMemoryIntent, matchDrawIntent, matchGeoIntent, styleFrom, matchToolsIntent, matchFileIntent } from './intents.js';
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
  ar.caption(text);
  draw.caption(text);
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
  initiative.clearSuggestions();

  // Réponse à une proposition de Jarvis (« oui », « non merci »).
  const answered = initiative.answer(text);
  if (answered) {
    if (answered === 'no') await say('Très bien.', t);
    return;
  }

  // Cartes mentales : création (via l'IA dédiée) et affichage (instantané).
  const mmCmd = matchMindmapIntent(text, { hasMindmap: mindmap.hasMindmap(), canRestore: mindmap.canRestore() });
  if (mmCmd) {
    if (mmCmd.create) {
      setBusy(true);
      const speech = await ACTIONS.mindmap_topic({ topic: mmCmd.create, place: mmCmd.place });
      setBusy(false);
      await say(speech, t);
    } else if (mmCmd.fit) mindmap.fit();
    else {
      if (mmCmd.userImage) mmCmd.userImage.src = camera.getLastImage()?.dataUrl || camera.getLastImage()?.url || '';
      if (mmCmd.images) setBusy(true);
      const speech = await mindmap.update(mmCmd);
      setBusy(false);
      await say(speech, t);
    }
    return;
  }

  // Routine déclenchée par sa phrase (« je rentre »).
  const routine = !routineRunning && routines.match(text);
  if (routine) { await runRoutine(routine); return; }

  // Traducteur, étiquettes AR, routines (instantané).
  const toolCmd = matchToolsIntent(text, { translatorOpen: tr.isOpen(), arOpen: ar.isOpen() });
  if (toolCmd) {
    setBusy(true);
    const speech = await runTool(toolCmd).catch((e) => { console.warn(e); return `Cette action n'a pas abouti (${explainError(e)}).`; });
    setBusy(false);
    await say(speech, t);
    return;
  }

  // Fichiers : créer, exporter, convertir, envoyer.
  const fileCmd = matchFileIntent(text, { formatFrom: files.formatFrom });
  if (fileCmd) {
    setBusy(true);
    const speech = await runFile(fileCmd).catch((e) => { console.warn(e); return `Je n'ai pas pu créer ce fichier (${explainError(e)}).`; });
    setBusy(false);
    await say(speech, t);
    return;
  }

  // Mémoire personnelle : retenir, afficher, oublier (instantané, sans IA).
  const memCmd = matchMemoryIntent(text);
  if (memCmd) {
    await say(memCmd.remember ? ACTIONS.remember({ fact: memCmd.remember })
      : memCmd.show ? ACTIONS.memory()
        : ACTIONS.forget({ fact: memCmd.forgetAll ? 'all' : memCmd.forget }), t);
    return;
  }

  // Dessin dans l'air : ouverture et commandes du mode dessin.
  const drawCmd = matchDrawIntent(text, { open: draw.isOpen() });
  if (drawCmd) {
    await say(await ACTIONS.draw(drawCmd), t);
    if (spoken && t === turn && voice.wakeEnabled) voice.followUp(6000);
    return;
  }

  // Itinéraires et cartes 3D de lieux réels.
  const geoCmd = matchGeoIntent(text);
  if (geoCmd) {
    setBusy(true);
    const speech = await (geoCmd.route ? ACTIONS.route(geoCmd.route) : ACTIONS.ar({ map: geoCmd.map, style: geoCmd.style })).catch((e) => { console.warn(e); return "Je n'ai pas pu afficher cette carte."; });
    setBusy(false);
    await say(speech, t);
    return;
  }

  // Réalité augmentée : hologrammes 3D manipulables avec les doigts.
  const arCmd = matchARIntent(text, { open: ar.isOpen(), canRestore: ar.canRestore() });
  if (arCmd) {
    if (arCmd.topic || arCmd.image || arCmd.imageQuery) setBusy(true);
    const speech = await ACTIONS.ar(arCmd).catch((e) => { console.warn(e); return "La réalité augmentée n'a pas pu démarrer."; });
    setBusy(false);
    await say(speech, t);
    if (spoken && t === turn && voice.wakeEnabled) voice.followUp(6000);
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
  // Pendant le dessin, une demande qui n'est pas une commande simple porte sur le croquis (« transforme-le en schéma »).
  if (draw.isOpen() && draw.hasStrokes() && (!local || local.actions.some((a) => a.type === 'look'))) {
    setBusy(true);
    const speech = await ACTIONS.draw_transform({ prompt: text });
    setBusy(false);
    await say(speech, t);
    return;
  }
  try {
    setBusy(true);
    if (local) {
      const speech = await runActions(local.actions, text);
      setBusy(false);
      initiative.suggest(nextSteps(local.actions));
      await say(local.speech || speech, t);
    } else {
      const reply = await think(text, { playing: player.nowPlaying(), screen: [ui.describeStage(), tr.describe()].filter(Boolean).join(' ; '), table: tables.describe(), mindmap: mindmap.describe(), ar: ar.describe(), draw: draw.describe(), ...visionContext() });
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
      const steps = [...(reply.suggestions || []), ...nextSteps(reply.actions)];
      initiative.suggest(steps);
      // Si Jarvis termine par une question et propose une suite, « oui » la déclenche.
      const finalSpeech = reply.speech || speech || (reply.display ? 'Voici.' : '');
      if (/\?\s*$/.test(finalSpeech) && reply.suggestions?.[0]?.say) initiative.propose({ id: `ask:${Date.now()}`, text: finalSpeech, run: reply.suggestions[0].say, speak: false });
      await say(finalSpeech, t);
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
      else ui.errorCard(`Je n'arrive pas à joindre mon IA — ${e.message}. Vérifiez vos clés dans les réglages ⚙️, ou ajoutez une clé Gemini gratuite en secours.`);
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
        chip('📚 Étudier', () => handle(`étudie ${query}`)),
        chip('🥽 Projeter en AR', () => ACTIONS.ar({ items, title: query }).then((sp) => say(sp)))));
    return `Voici des images de ${query}.`;
  },

  async generate_image({ prompt, place }) {
    const url = svc.generateImageURL(prompt);
    const status = el('div', {}, ui.loading(), el('p', { class: 'sources' }, 'Création en cours… (10 à 30 secondes)'));
    const img = el('img', { class: 'gen-img', alt: prompt });
    const body = el('div', {}, status, img,
      el('div', { class: 'actions-row' },
        chip('🔁 Autre version', () => ACTIONS.generate_image({ prompt })),
        chip('🥽 Projeter en AR', () => ACTIONS.ar({ src: url, title: prompt }).then((sp) => say(sp))),
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
        chip('🥽 Voir en 3D', () => handle(`projette ${topic} en 3D`)),
        ...(wiki?.related || []).slice(0, 2).map((r) => chip(`📚 ${r}`, () => handle(`étudie ${r}`)))),
      wiki ? el('p', { class: 'sources' }, 'Source : ', el('a', { href: wiki.url, target: '_blank', rel: 'noopener' }, `Wikipédia — ${wiki.title}`)) : null);
    return notes?.speech || wiki?.summary.split(/(?<=[.!?])\s/).slice(0, 2).join(' ') || `Voici ma fiche sur ${topic}.`;
  },

  async weather({ city, place }) {
    const w = await svc.getWeather(city);
    initiative.rememberCity(String(w.place || '').split(',')[0]);
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
        initiative.onTimerEnd(seconds, label);
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
    return mindmap.update({
      layout: a.layout, expandAll: a.expand_all, collapseAll: a.collapse_all, toggle: a.toggle, close: a.close, restore: a.restore, expand: a.expand,
      images: a.images, links: a.links, removeImages: a.remove_images, removeLinks: a.remove_links,
      customLink: a.link_url ? { target: a.target, url: a.link_url, label: a.link_label } : undefined,
    });
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

  // ---------- Fichiers (appelable par l'IA) ----------
  async file({ format = '', request = '', name = '' } = {}) {
    return runFile({ create: { format: files.FORMATS[format] ? format : files.formatFrom(`${format} ${request}`), request: request || name || `Crée un fichier ${format}` } });
  },

  // ---------- Traducteur, étiquettes, routines (aussi appelables par l'IA) ----------
  async translator({ lang = 'anglais', text = '' } = {}) { return runTool(text ? { translateOnce: { text, to: lang } } : { translator: lang }); },
  async labels() { return runTool({ labels: true }); },
  async routine({ name, steps = [], triggers = [] } = {}) { return runTool({ routineCreate: { name, steps, triggers } }); },

  // ---------- Mémoire personnelle ----------
  remember({ fact }) {
    const f = facts.add(fact);
    if (!f) return "Je n'ai pas compris ce que je dois retenir.";
    refreshMemoryCard();
    return `C'est noté, je m'en souviendrai : « ${f.text} ».`;
  },
  forget({ fact = '' }) {
    if (/^(all|tout)$/i.test(String(fact).trim())) {
      const old = facts.clear();
      if (!old.length) return "Je n'avais rien retenu sur vous.";
      showMemory(old);
      return `J'ai tout oublié : ${old.length} souvenir${old.length > 1 ? 's' : ''}. Vous pouvez encore annuler.`;
    }
    const gone = facts.forget(fact);
    refreshMemoryCard();
    return gone.length ? `C'est oublié : ${gone.map((f) => f.text).join(' ; ')}.` : "Je n'avais rien retenu à ce sujet.";
  },
  memory() {
    showMemory();
    const n = facts.count();
    return n ? `Voici ce que j'ai retenu sur vous : ${n} souvenir${n > 1 ? 's' : ''}.` : 'Je n’ai encore rien retenu sur vous. Dites par exemple « souviens-toi que je suis végétarien ».';
  },

  // ---------- Dessin dans l'air ----------
  async draw(a = {}) {
    if (a.close) { draw.close(); return ''; }
    if (!draw.isOpen()) {
      if (ar.isOpen()) ar.close();
      if (camera.isOpen()) camera.closeCamera(); // la caméra passe dans la vue de dessin
      await draw.open({ onMic: toggleListen, onTransform: () => handle('transforme mon dessin en schéma propre') });
      return "Levez l'index pour dessiner dans l'air, ouvrez la main pour lever le crayon. Dites-moi ensuite quoi en faire.";
    }
    if (a.clear) draw.clear();
    if (a.undo && !draw.undo()) return "Il n'y a rien à annuler.";
    if ('color' in a && !draw.setColor(a.color || undefined)) return `Je n'ai pas cette couleur. Essayez cyan, or, rose, vert, blanc, violet, rouge, bleu, jaune ou orange.`;
    if (a.switchCamera) await draw.switchCamera();
    return '';
  },
  async draw_transform({ prompt = '' } = {}) {
    if (!draw.hasStrokes()) return "Dessinez d'abord quelque chose : levez l'index devant la caméra.";
    if (!canSee()) { showOnboarding(); return "Pour comprendre votre dessin, j'ai besoin d'une IA capable de voir : une clé gratuite Groq ou Gemini."; }
    const shot = draw.snapshot();
    const neon = draw.preview();
    const request = prompt || 'Transforme mon dessin en schéma propre.';
    draw.setBusy(true);
    try {
      const reply = await see(`${request}

[Consignes pour le croquis] Dis d'abord en une phrase ce que tu reconnais. Puis :
- Par défaut (« transforme-le », « nettoie-le », « rends-le propre », « fais-en un schéma ») : redessine-le avec l'action "page" contenant un SVG net et fidèle (mêmes éléments, mêmes positions relatives, formes régulières : droites, cercles, rectangles, flèches, textes lisibles et bien orthographiés), fond sombre, traits cyan, or ou violet, avec un titre et des légendes utiles.
- Écriture : retranscris le texte dans "display". Formule ou calcul : écris-le proprement dans "display" et résous-le si c'est demandé ou évident.
- Schéma (organigramme, circuit, graphe, carte, plan) : identifie et nomme les éléments dans le SVG.
- Objet, animal, personnage : dis ce que c'est ; « en 3D » → action "ar" avec "topic" ; « en vrai », « illustre-le » → action "generate_image" avec une description détaillée en anglais.`,
      { dataUrl: shot, source: 'drawing', label: 'dessin dans l’air' },
      { playing: player.nowPlaying(), screen: ui.describeStage(), table: tables.describe() });
      draw.close();
      const body = el('div', { class: 'vision' },
        el('img', { class: 'vision-shot', src: neon, alt: 'Votre dessin', onclick: () => ui.lightbox([{ full: neon, thumb: neon, title: 'Votre dessin' }]) }),
        reply.display ? el('div', { class: 'md', html: renderMarkdown(reply.display) }) : el('p', { class: 'md' }, reply.speech),
        el('div', { class: 'actions-row' }, chip('✍️ Redessiner', () => ACTIONS.draw({ open: true }).then((sp) => say(sp)))));
      ui.card(reply.title || 'Votre dessin', body, { icon: '✍️', kind: 'text' });
      const speech = await runActions(reply.actions, request);
      return reply.speech || speech || 'Voici votre schéma.';
    } catch (e) {
      console.warn(e);
      draw.setBusy(false);
      draw.caption(`Échec : ${explainError(e)}`);
      ui.errorCard(`Analyse du dessin impossible — ${explainError(e)}`);
      return "Je n'ai pas réussi à analyser votre dessin. Le détail est affiché à l'écran.";
    }
  },

  // ---------- Réalité augmentée ----------
  // Accepte les commandes locales (topic, image, imageQuery, planFromImage, zoom…) et l'action de l'IA (même champs, en snake_case).
  async ar(a = {}) {
    const request = a.request || a.topic || a.subject || '';
    const image = a.image || '';
    const imageQuery = a.imageQuery || a.image_query || '';
    const planFromImage = a.planFromImage || a.plan_from_image;
    const wantsContent = request || a.map || image || imageQuery || a.src || a.items || a.parts || a.plan || a.restore || a.open;
    if (!wantsContent) return arControl(a);
    const err = await ensureAR();
    if (err) return err;
    if (a.open) return 'Réalité augmentée prête. Que voulez-vous projeter ?';
    if (a.restore) return (await ar.restoreLast().catch(() => false)) ? '' : 'Réalité augmentée prête. Que voulez-vous projeter ?';
    try {
      if (a.map) return await arMap(a.map, { style: a.style || '' });
      if (a.parts || a.plan) return (await ar.showScene(a, a.title)) ? '' : "Je n'ai pas pu construire cette maquette.";
      if (a.src) return (await ar.showImage(a.src, a.title || 'Image')) ? 'Image projetée.' : '';
      if (a.items) return (await ar.showImages(a.items, a.title)) ? 'Images projetées. Pincez et glissez pour les faire défiler.' : "Ces images ne peuvent pas être projetées.";
      if (image) {
        const img = image === 'screen' ? await camera.imageFromScreen() : (camera.getLastImage() || await camera.imageFromScreen());
        if (!img) { ar.setLoading(''); return "Envoyez-moi d'abord une image avec le trombone, un glisser-déposer ou Ctrl+V."; }
        if (planFromImage) {
          if (!canSee()) { ar.setLoading(''); showOnboarding(); return "Il me faut une IA capable de voir pour lire ce plan."; }
          ar.setLoading('Lecture du plan et construction de la maquette…');
          const scene = await arSceneFromImage(img, a.prompt || '');
          return (await ar.showScene(scene, scene.title || 'Plan 3D')) ? (scene.speech || 'Voici votre plan en 3D.') : "Je n'ai pas réussi à reconstruire ce plan.";
        }
        return (await ar.showImage(img.dataUrl || img.url, img.label || 'Image')) ? 'Image projetée. Pincez pour la faire pivoter.' : '';
      }
      if (imageQuery) {
        ar.setLoading(`Recherche d'images : ${imageQuery}…`);
        const items = await svc.searchImages(imageQuery).catch(() => []);
        const n = items.length ? await ar.showImages(items, imageQuery) : 0;
        if (!n) ar.setLoading('');
        return n ? `Voici ${imageQuery} en réalité augmentée. Pincez et glissez pour faire défiler.` : `Je n'ai pas trouvé d'images de ${imageQuery} à projeter.`;
      }
      const quick = ar.builtin(request);
      if (quick) { ar.setPanel(null); await ar.showScene(quick); return `Voici ${quick.speech || quick.title} en hologramme.`; }

      // Lieu ou trajet reconnu localement (y compris dans une demande reformulée par l'IA) : pas besoin d'aiguillage.
      const local = matchGeoIntent(request);
      if (local?.map) return await arMap(local.map, { style: local.style || a.style || '' });
      if (local?.route) return await ACTIONS.route(local.route);

      // Aiguillage : vraie carte 3D, itinéraire, vrai modèle ou maquette construite.
      ar.setLoading('Je cherche la meilleure source 3D…');
      const plan = (hasAI() && await arPlan(request).catch((e) => { console.warn(e); return null; })) || await guessPlan(request);
      if (!ar.isOpen()) return '';
      if (plan.kind === 'route' && plan.to) return await ACTIONS.route({ from: plan.from, to: plan.to, mode: plan.mode, style: plan.style || styleFrom(request) });
      if (plan.kind === 'map') return await arMap(plan.place || request, { title: plan.title, zoom: +plan.zoom || 0, speech: plan.speech, style: plan.style || styleFrom(request) || a.style || '' });
      if (plan.kind === 'model') {
        const sp = await arRealModel(plan.model_query || request, plan.title || request, plan.speech);
        if (sp) return sp;
      }
      if (!hasAI()) {
        ar.setLoading('');
        showOnboarding();
        return "Je n'ai pas trouvé de modèle 3D. Pour construire n'importe quelle maquette, activez d'abord mon intelligence.";
      }
      const topic = plan.topic || request;
      ar.setPanel(null);
      ar.setLoading(`Modélisation 3D : ${topic}…`);
      const scene = await arSceneFor(topic, a.details || '');
      if (!ar.isOpen()) return '';
      if (scene.polyhaven) {
        // Objet du quotidien : vrai modèle photoréaliste si la bibliothèque libre en a un.
        const hit = await ar.findPolyHaven(scene.polyhaven).catch(() => null);
        if (hit && await ar.showPolyHaven(hit).catch(() => false)) return scene.speech || `Voici ${topic} en réalité augmentée.`;
      }
      return (await ar.showScene(scene, scene.title || topic)) ? (scene.speech || `Voici ${topic} en hologramme.`) : `Je n'ai pas réussi à modéliser ${topic}.`;
    } catch (e) {
      console.warn(e);
      ar.setLoading('');
      return `Je n'ai pas pu afficher cet hologramme (${explainError(e)}).`;
    }
  },

  // Itinéraire complet : calcul, étapes, infos pratiques de l'IA, tracé sur carte 3D en réalité augmentée.
  async route({ from = '', to = '', mode = '', style = '' } = {}) {
    if (!to) return 'Où voulez-vous aller ?';
    const err = await ensureAR();
    if (err) return err;
    ar.setPanel(null);
    ar.setLoading('Calcul de l’itinéraire…');
    let a;
    let b;
    try {
      a = typeof from === 'object' && from ? from : from ? await geo.geocode(from) : await geo.currentPosition();
    } catch {
      ar.setLoading('');
      return from ? `Je ne trouve pas « ${from} ».` : "Je n'ai pas accès à votre position. Dites par exemple « itinéraire de la gare au musée ».";
    }
    try { b = typeof to === 'object' ? to : await geo.geocode(to, a); } catch { ar.setLoading(''); return `Je ne trouve pas « ${to} ».`; }
    const crow = haversine(a, b);
    const m = geo.MODES[mode] ? mode : crow < 3000 ? 'foot' : 'car';
    let r;
    try { r = await geo.route(a, b, m); } catch { ar.setLoading(''); return `Je n'ai pas trouvé d'itinéraire ${geo.MODES[m].label.toLowerCase()} entre ces deux lieux.`; }
    if (!ar.isOpen()) return '';
    const title = `${a.name} → ${b.name}`;
    const panel = routeBody(a, b, r, true);
    ar.setPanel(panel); // avant la carte : le cadrage du trajet tient compte du panneau
    await ar.showRoute(r, a, b, title, style);
    const cardBody = routeBody(a, b, r, false);
    ui.card(`Itinéraire · ${title}`, cardBody, { icon: geo.MODES[m].icon, kind: 'text' });
    const dist = geo.fmtDistance(r.distance);
    const dur = geo.fmtDuration(r.duration);
    if (hasAI()) {
      routeInfo({ from: a.label || a.name, to: b.label || b.name, mode: geo.MODES[m].label.toLowerCase(), distance: dist, duration: dur })
        .then((info) => {
          const html = renderMarkdown(info.display || info.speech || '');
          for (const box of [panel, cardBody]) { const n = box.querySelector('.route-info'); if (n) n.innerHTML = html; }
        })
        .catch(() => { for (const box of [panel, cardBody]) { const n = box.querySelector('.route-info'); if (n) n.textContent = ''; } });
    }
    initiative.suggest([
      { label: '▶️ Survoler le trajet', say: 'survole le trajet' },
      ...Object.entries(geo.MODES).filter(([k]) => k !== m).map(([k, mm]) => ({ label: `${mm.icon} ${mm.label}`, say: `itinéraire de ${a.name} à ${b.name} ${{ foot: 'à pied', car: 'en voiture', bike: 'à vélo' }[k]}` })),
    ]);
    return `${geo.MODES[m].label}, ${dist}, environ ${dur}. ${hasAI() ? 'Je vous affiche les étapes et les infos pratiques.' : 'Voici les étapes.'} Dites « survole le trajet » pour le parcourir en 3D.`;
  },

  async ar_update(a) { return arControl(a); },

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
      ui.errorCard(`Analyse d'image impossible — ${explainError(e)}`);
      return "Je n'ai pas réussi à analyser l'image. Le détail est affiché à l'écran.";
    }
  },
};

// ---------------- Carte « Mémoire » ----------------
let memoryCard = null;
function memoryBody(undoItems) {
  const items = facts.list();
  const input = el('input', { class: 'field', type: 'text', placeholder: 'Ajouter : « Je suis végétarien », « Ma sœur s’appelle Julie »…', maxlength: '300', 'aria-label': 'Nouveau souvenir' });
  const addIt = () => { if (input.value.trim()) { facts.add(input.value); input.value = ''; } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
  return el('div', { class: 'memory' },
    items.length
      ? el('ul', { class: 'mem-list' }, items.slice().reverse().map((f) => el('li', {},
        el('span', { class: 'mem-text' }, f.text),
        el('small', {}, new Date(f.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
        el('button', { type: 'button', class: 'icon-btn mem-del', title: 'Oublier', 'aria-label': `Oublier : ${f.text}`, onclick: () => facts.remove(f.id), html: '<svg viewBox="0 0 24 24"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>' }))))
      : el('p', { class: 'mem-empty' }, 'Rien pour l’instant. Dites « souviens-toi que… » ou ajoutez un souvenir ci-dessous.'),
    el('div', { class: 'mem-add' }, input, el('button', { type: 'button', class: 'primary', onclick: addIt }, 'Retenir')),
    el('div', { class: 'actions-row' },
      undoItems?.length ? chip('↩️ Annuler l’oubli', () => facts.restore(undoItems)) : null,
      items.length ? chip('🧹 Tout oublier', () => { const old = facts.clear(); showMemory(old); }) : null),
    el('p', { class: 'sources' }, 'Ces informations restent sur cet appareil et sont transmises à l’IA pour personnaliser mes réponses.'));
}
function showMemory(undoItems) {
  if (memoryCard?.isConnected) {
    memoryCard.querySelector('.memory')?.replaceWith(memoryBody(undoItems));
    ui.restoreCard(memoryCard);
    return memoryCard;
  }
  memoryCard = ui.card('Ce que je sais de vous', memoryBody(undoItems), { icon: '🧠', kind: 'memory', keep: true });
  return memoryCard;
}
function refreshMemoryCard() {
  const old = memoryCard?.isConnected && memoryCard.querySelector('.memory');
  if (old) old.replaceWith(memoryBody());
}
facts.onChange(() => refreshMemoryCard());

// Réglages de l'hologramme affiché (commandes locales et action « ar_update » de l'IA).
function arControl(a = {}) {
  if (!ar.isOpen()) return a.close ? '' : "Aucun hologramme n'est affiché. Dites par exemple « projette un atome en 3D ».";
  if (a.close) { ar.close(); return ''; }
  if (a.reset) ar.reset();
  if (a.zoom) ar.zoom(+a.zoom || 1);
  if (a.turn) Array.isArray(a.turn) ? ar.turn(...a.turn) : ar.turn(+a.turn || 0, 0);
  if (a.view) ar.view(a.view);
  if ('holo' in a) ar.setHolo(a.holo);
  if ('spin' in a) ar.setAutoRotate(a.spin);
  if ('hands' in a) ar.setHands(a.hands);
  if (a.switchCamera) ar.switchCamera();
  if (a.nextModel && !ar.nextModel()) return "Il n'y a pas d'autre modèle à montrer.";
  if (a.fly && !ar.flyRoute()) return "Il n'y a pas d'itinéraire à survoler.";
  if (a.mapStyle) return ar.setMapStyle(a.mapStyle);
  return '';
}

const hasAI = () => !!(settings.groqKey || settings.geminiKey || settings.claudeKey);

// Ouvre la vue AR si besoin ; renvoie un message d'erreur, ou '' si tout va bien.
async function ensureAR() {
  if (ar.isOpen()) return '';
  if (draw.isOpen()) draw.close();
  if (camera.isOpen()) camera.closeCamera(); // la caméra passe dans la vue AR
  try { await ar.open({ onMic: toggleListen }); return ''; } catch { return "Je n'arrive pas à charger le moteur 3D. Vérifiez votre connexion internet."; }
}

// Sans IA : un lieu connu → carte 3D, sinon recherche d'un vrai modèle.
async function guessPlan(request) {
  const g = await geo.geocode(request).catch(() => null);
  if (g && /^(place|boundary|tourism|historic|leisure):/.test(g.kind)) return { kind: 'map', place: request };
  return { kind: 'model', model_query: request, title: request };
}

async function arMap(place, { title = '', zoom = 0, speech = '', style = '' } = {}) {
  ar.setPanel(null);
  ar.setLoading(`Recherche de ${place}…`);
  let g;
  try { g = await geo.geocode(place); } catch { ar.setLoading(''); return `Je ne trouve pas « ${place} » sur la carte.`; }
  const layer = await ar.showMap(g, { title: title || g.label || g.name, zoom: zoom || geo.zoomFor(g), style, query: place });
  const got = layer?.style;
  // Rendu photoréaliste demandé sans jeton : on l'explique une fois, la vue satellite est affichée en attendant.
  const wantsPhoto = (style || ar.resolveStyle(style)) === 'photo' || (style === '' && settings.cesiumToken);
  const hint = !wantsPhoto || got === 'photo' ? ''
    : settings.cesiumToken ? ' Votre jeton Cesium ion a été refusé : vérifiez-le dans les réglages, rubrique Cartes 3D.'
      : ' Pour la 3D photoréaliste façon Google Earth, ajoutez un jeton Cesium ion gratuit dans les réglages, rubrique Cartes 3D.';
  initiative.suggest([
    got === 'photo' ? { label: '🛰️ Vue satellite', say: 'vue satellite' } : { label: '🌍 Photoréaliste', say: 'passe en photoréaliste' },
    { label: '🧭 Comment y aller ?', say: `comment aller à ${g.name}` },
    { label: '📚 Découvrir', say: `étudie ${g.name}` },
  ]);
  const what = got === 'photo' ? 'en 3D photoréaliste' : got === 'satellite' ? 'en vue satellite avec relief' : 'en 3D';
  return (speech && !hint ? speech : `Voici ${g.name} ${what}. Pincez pour tourner, faites un poing pour vous déplacer, deux mains pour zoomer.`) + hint;
}

// Vrai modèle 3D : recherche Sketchfab, affichage du plus pertinent et choix parmi les suivants.
async function arRealModel(query, title, speech) {
  ar.setLoading(`Recherche d'un vrai modèle 3D : ${title}…`);
  const phone = matchMedia('(pointer: coarse)').matches;
  const models = await ar.searchModels(query, { phone }).catch(() => []);
  if (!models.length || !ar.isOpen()) { ar.setLoading(''); return ''; }
  await ar.showRealModel(models, 0, title);
  const pick = el('div', { class: 'model-pick' });
  const choose = (i) => { ar.showRealModel(models, i, title); pick.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i))); };
  models.slice(0, 9).forEach((m, i) => pick.append(el('button', { type: 'button', title: `${m.name} — ${m.author}`, 'aria-pressed': String(i === 0), onclick: () => choose(i) },
    m.thumb ? el('img', { src: m.thumb, alt: m.name, loading: 'lazy' }) : m.name)));
  ar.setPanel(el('div', {}, el('h3', {}, title), el('p', { class: 'route-places' }, 'Vrais modèles 3D de la communauté Sketchfab. Touchez-en un autre, ou dites « autre modèle ».'), pick));
  initiative.suggest([{ label: '🔄 Autre modèle', say: 'autre modèle' }, { label: '📚 En savoir plus', say: `étudie ${title}` }]);
  return speech || `Voici un vrai modèle 3D : ${models[0].name}. Dites « autre modèle » pour en voir un autre.`;
}

function haversine(a, b) {
  const R = 6371e3;
  const r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Contenu d'un itinéraire (panneau AR ou carte de l'écran).
function routeBody(a, b, r, inAR) {
  const flag = { foot: 'w', car: 'd', bike: 'w' }[r.mode];
  const apple = `https://maps.apple.com/?saddr=${a.lat},${a.lon}&daddr=${b.lat},${b.lon}&dirflg=${flag}`;
  const google = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lon}&destination=${b.lat},${b.lon}&travelmode=${{ foot: 'walking', car: 'driving', bike: 'bicycling' }[r.mode]}`;
  return el('div', { class: 'route' },
    inAR ? el('h3', {}, 'Itinéraire') : null,
    el('p', { class: 'route-places' }, `De ${a.label || a.name} à ${b.label || b.name}`),
    el('div', { class: 'route-modes' }, Object.entries(geo.MODES).map(([k, mm]) => el('button', {
      type: 'button', 'aria-pressed': String(k === r.mode), onclick: () => handleRoute({ from: a, to: b, mode: k }),
    }, `${mm.icon} ${mm.label}`))),
    el('div', { class: 'route-sum' }, el('b', {}, geo.fmtDuration(r.duration)), el('span', {}, geo.fmtDistance(r.distance))),
    el('div', { class: 'actions-row' },
      inAR ? chip('▶️ Survoler en 3D', () => ar.flyRoute()) : chip('🥽 Voir en 3D', () => handleRoute({ from: a, to: b, mode: r.mode })),
      chip('🍎 Plans', null, apple), chip('🗺️ Google Maps', null, google)),
    el('ol', { class: 'route-steps' }, r.steps.slice(0, 40).map((st) => el('li', {}, st.text, st.distance > 0 ? el('small', {}, geo.fmtDistance(st.distance)) : null))),
    el('div', { class: 'route-info md' }, hasAI() ? ui.loading() : null));
}
async function handleRoute(opts) {
  setBusy(true);
  const speech = await ACTIONS.route(opts).catch(() => "Je n'ai pas pu recalculer l'itinéraire.");
  setBusy(false);
  await say(speech);
}

// ---------------- Fichiers ----------------
// Affiche la carte du fichier (aperçu + « Envoyer ») et propose les suites.
function presentFile(f, speech) {
  ui.collapseCard(); // la carte du fichier (et son bouton « Envoyer ») ne doit pas être cachée par un affichage en grand
  files.card(f, { onSent: (r) => { if (r === 'shared') ui.setLive('Fichier envoyé.', 'reply'); } });
  const alt = { pdf: ['docx', '📘 En Word'], docx: ['pdf', '📕 En PDF'], xlsx: ['csv', '🧾 En CSV'], csv: ['xlsx', '📗 En Excel'], md: ['pdf', '📕 En PDF'], html: ['pdf', '📕 En PDF'], txt: ['pdf', '📕 En PDF'] }[f.format];
  initiative.suggest([alt ? { label: alt[1], say: `convertis-le en ${alt[0] === 'docx' ? 'word' : alt[0] === 'xlsx' ? 'excel' : alt[0]}` } : null, { label: '🗂️ Mes fichiers', say: 'mes fichiers' }].filter(Boolean));
  const fmt = files.FORMATS[f.format]?.label || 'fichier';
  return speech || `Votre ${fmt} « ${f.title} » est prêt. Touchez « Envoyer » pour choisir l'application et le destinataire.`;
}

// Le contenu est rédigé par l'IA selon le format, puis le fichier est fabriqué sur l'appareil.
async function createFile(format, request) {
  if (!hasAI()) { showOnboarding(); return "Pour rédiger un fichier, activez d'abord mon intelligence (clé gratuite Groq ou Gemini)."; }
  const fmt = files.FORMATS[format] ? format : 'pdf';
  const wait = ui.card(`Fichier ${files.FORMATS[fmt].label} en préparation`, el('div', {}, ui.loading(), el('p', { class: 'sources' }, 'Rédaction du contenu, puis fabrication du fichier…')), { icon: files.FORMATS[fmt].icon, kind: 'file' });
  try {
    const context = [tables.describe() && `Tableau affiché : ${tables.describe()}`, mindmap.describe() && `Carte mentale affichée : ${mindmap.describe()}`, `Écran : ${ui.describeStage()}`].filter(Boolean).join('\n');
    const spec = await fileFor(request, fmt, context);
    const f = await files.build(spec);
    return presentFile(f, spec.speech ? `${spec.speech} Touchez « Envoyer » pour le partager.` : '');
  } finally {
    ui.removeCard(wait);
  }
}

const tableSpec = (d, format) => ({
  format, name: d.title, title: d.title,
  sheets: [{ name: d.title, columns: d.columns, rows: d.rows }],
  markdown: `${d.note ? `${d.note}\n\n` : ''}| ${d.columns.join(' | ')} |\n| ${d.columns.map(() => '---').join(' | ')} |\n${d.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`,
});
const dataUrlBlob = async (u) => (await fetch(u)).blob();

async function runFile(c) {
  if (c.list) {
    if (!files.created.length) return "Vous n'avez pas encore créé de fichier. Dites par exemple : crée un PDF sur l'histoire de Rome.";
    const body = el('ul', { class: 'mem-list' }, files.created.map((f) => el('li', {},
      el('span', { class: 'mem-text' }, `${files.FORMATS[f.format]?.icon || '📄'} ${f.name}`),
      el('button', { type: 'button', class: 'icon-btn', title: 'Envoyer', 'aria-label': `Envoyer ${f.name}`, onclick: () => files.share(f) }, '📤'),
      el('button', { type: 'button', class: 'icon-btn', title: 'Télécharger', 'aria-label': `Télécharger ${f.name}`, onclick: () => files.download(f) }, '⬇️'))));
    ui.card('Mes fichiers', body, { icon: '🗂️', kind: 'files' });
    return `${files.created.length} fichier${files.created.length > 1 ? 's' : ''} créé${files.created.length > 1 ? 's' : ''} pendant cette session.`;
  }
  if (c.sendLast) {
    const f = files.last();
    if (!f) return "Il n'y a pas encore de fichier à envoyer. Demandez-moi d'abord d'en créer un.";
    // Le partage n'est autorisé qu'à la suite d'un toucher : on essaie, sinon on affiche le bouton.
    try {
      const file = new File([f.blob], f.name, { type: f.blob.type });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: f.title }); return ''; }
    } catch (e) { if (e?.name === 'AbortError') return ''; }
    files.card(f);
    return `Touchez « Envoyer » sur la carte de ${f.name} pour choisir l'application et le destinataire.`;
  }
  if (c.convertLast) {
    const f = files.last();
    if (!f) return "Il n'y a pas encore de fichier à convertir.";
    const textual = ['pdf', 'docx', 'md', 'html', 'txt'];
    const sheet = ['xlsx', 'csv'];
    const same = (textual.includes(f.format) && textual.includes(c.convertLast)) || (sheet.includes(f.format) && [...sheet, 'pdf', 'docx', 'html', 'md'].includes(c.convertLast) && f.spec.sheets);
    if (same) {
      const spec = { ...f.spec, format: c.convertLast };
      if (!spec.markdown && spec.sheets) spec.markdown = tableSpec({ title: f.title, note: '', ...spec.sheets[0] }, c.convertLast).markdown;
      return presentFile(await files.build(spec));
    }
    return createFile(c.convertLast, `Convertis ce contenu en fichier ${c.convertLast}, sans rien perdre : ${JSON.stringify({ ...f.spec, blob: undefined }).slice(0, 6000)}`);
  }
  if (c.editLast) {
    const f = files.last();
    if (!f) return "Il n'y a pas encore de fichier à modifier.";
    return createFile(f.format, `Voici le fichier actuel (JSON) : ${JSON.stringify({ ...f.spec, blob: undefined }).slice(0, 6000)}\nModifie-le ainsi, en gardant tout le reste : ${c.editLast}`);
  }
  if (c.exportTable) {
    const d = tables.data();
    if (!d) return "Il n'y a pas de tableau à exporter. Demandez d'abord un récapitulatif.";
    return presentFile(await files.build(tableSpec(d, c.exportTable)));
  }
  if (c.exportDrawing) {
    const png = draw.isOpen() && draw.preview();
    if (!png) return 'Ouvrez le mode dessin et dessinez quelque chose, puis dites « enregistre mon dessin ».';
    return presentFile(await files.build({ format: 'png', name: 'dessin', title: 'Mon dessin', blob: await dataUrlBlob(png) }));
  }
  if (c.export3D) {
    const blob = ar.isOpen() && await ar.exportGLB().catch(() => null);
    if (!blob) return "Projetez d'abord une maquette en 3D (les cartes et les modèles Sketchfab ne peuvent pas être exportés).";
    return presentFile(await files.build({ format: 'glb', name: ar.describe().match(/« (.+) »/)?.[1] || 'modele-3d', title: 'Modèle 3D', blob }));
  }
  if (c.exportImage) {
    const img = camera.getLastImage() || await camera.imageFromScreen();
    if (!img) return "Il n'y a pas d'image à enregistrer.";
    const blob = img.dataUrl ? await dataUrlBlob(img.dataUrl) : await fetch(img.url).then((r) => r.blob()).catch(() => null);
    if (!blob) return "Cette image ne peut pas être enregistrée (elle vient d'un autre site).";
    return presentFile(await files.build({ format: 'png', name: img.label || 'image', title: img.label || 'Image', blob }));
  }
  if (c.create) return createFile(c.create.format || 'pdf', c.create.request);
  return '';
}

// ---------------- Traducteur, étiquettes AR, routines ----------------
const voiceHooks = { pauseVoice: () => voice.pause(), resumeVoice: () => voice.resume() };
async function runTool(c) {
  if (c.translator) {
    if (!tr.isOpen() && ar.isOpen()) ar.close();
    tr.open(c.translator, voiceHooks);
    const l = tr.findLang(c.translator) || tr.LANGS[1];
    return `Traducteur français ${l[0]} prêt. Touchez le bouton de la personne qui parle, puis parlez.`;
  }
  if (c.translatorClose) { tr.close(); return 'Traducteur fermé.'; }
  if (c.translateOnce) {
    const out = await tr.once(c.translateOnce.text, c.translateOnce.to);
    return out == null ? "Je ne connais pas cette langue." : '';
  }
  if (c.labels) return startLabels();
  if (c.labelsOff) { stopLabels(); ar.clearLabels(); return ''; }
  if (c.routineCreate) {
    const r = routines.create(c.routineCreate.name, c.routineCreate.steps, c.routineCreate.triggers || []);
    if (!r) return "Je n'ai pas compris cette routine. Dites par exemple : crée une routine je rentre : mets du jazz, puis donne la météo de demain.";
    showRoutines();
    initiative.suggest([{ label: `▶️ Tester « ${r.name} »`, say: r.name }]);
    return `Routine « ${r.name} » enregistrée, avec ${r.steps.length} action${r.steps.length > 1 ? 's' : ''}. Dites simplement « ${r.name} » pour la lancer.`;
  }
  if (c.routinesShow) { showRoutines(); const n = routines.list().length; return n ? `Vous avez ${n} routine${n > 1 ? 's' : ''}.` : 'Vous n’avez pas encore de routine. En voici quelques exemples.'; }
  if (c.routineDelete) { const r = routines.remove(c.routineDelete); return r ? `Routine « ${r.name} » supprimée.` : `Je ne trouve pas de routine « ${c.routineDelete} ».`; }
  return '';
}

// Lance les actions d'une routine l'une après l'autre.
let routineRunning = false;
async function runRoutine(r) {
  routineRunning = true;
  try {
    await say(`Routine « ${r.name} ».`);
    for (const step of r.steps) {
      await handle(step);
      await new Promise((ok) => setTimeout(ok, 400));
    }
  } finally {
    routineRunning = false;
  }
}

let routinesCard = null;
function routinesBody() {
  const list = routines.list();
  const name = el('input', { class: 'field', type: 'text', placeholder: 'Phrase qui la lance : « je rentre »', 'aria-label': 'Nom de la routine' });
  const steps = el('textarea', { class: 'field', rows: '3', placeholder: 'Une action par ligne :\nmets du jazz\nquel temps va-t-il faire demain', 'aria-label': 'Actions de la routine' });
  return el('div', { class: 'routines' },
    list.length ? el('ul', { class: 'mem-list' }, list.map((r) => el('li', {},
      el('span', { class: 'mem-text' }, el('b', {}, `« ${r.name} »`), el('br'), el('small', {}, r.steps.join(' → '))),
      el('button', { type: 'button', class: 'icon-btn', title: 'Lancer', 'aria-label': `Lancer ${r.name}`, onclick: () => runRoutine(r) }, '▶️'),
      el('button', { type: 'button', class: 'icon-btn mem-del', title: 'Supprimer', 'aria-label': `Supprimer ${r.name}`, onclick: () => routines.remove(r.name) }, '✕'))))
      : el('p', { class: 'mem-empty' }, 'Aucune routine pour l’instant. Ajoutez un exemple ou créez la vôtre :'),
    el('div', { class: 'actions-row' }, routines.EXAMPLES.filter((x) => !list.some((r) => r.name === x.name)).map((x) => chip(`＋ ${x.name}`, () => routines.create(x.name, x.steps)))),
    el('form', { class: 'routine-new', onsubmit: (e) => { e.preventDefault(); if (routines.create(name.value, steps.value.split('\n'))) { name.value = ''; steps.value = ''; } } },
      name, steps, el('button', { type: 'submit', class: 'primary' }, 'Créer la routine')),
    el('p', { class: 'sources' }, 'Astuce : « crée une routine bonne nuit : mets de la musique relaxante, puis un minuteur de 30 minutes ».'));
}
function showRoutines() {
  if (routinesCard?.isConnected) { routinesCard.querySelector('.routines')?.replaceWith(routinesBody()); ui.restoreCard(routinesCard); return; }
  routinesCard = ui.card('Mes routines', routinesBody(), { icon: '⚡', kind: 'routines', keep: true });
}
routines.onChange(() => { const old = routinesCard?.isConnected && routinesCard.querySelector('.routines'); if (old) old.replaceWith(routinesBody()); });

// Étiquettes AR : Jarvis nomme ce que filme la caméra, et actualise régulièrement.
let labelTimer = 0;
let labelScans = 0;
function stopLabels() { clearInterval(labelTimer); labelTimer = 0; }
async function startLabels() {
  if (!canSee()) { showOnboarding(); return "Pour étiqueter ce que je vois, il me faut une IA capable de voir : une clé gratuite Groq ou Gemini."; }
  if (tr.isOpen()) tr.close();
  const err = await ensureAR();
  if (err) return err;
  ar.clearScene('Étiquettes');
  ar.setPanel(null);
  for (let i = 0; i < 25 && !ar.captureFrame(); i++) await new Promise((ok) => setTimeout(ok, 200)); // caméra qui démarre
  if (!ar.captureFrame()) return "La caméra n'est pas disponible : autorisez-la pour que je puisse étiqueter ce qu'elle voit.";
  labelScans = 0;
  const n = await scanLabels();
  stopLabels();
  // Actualisation automatique pendant un moment (la caméra bouge), puis sur demande.
  labelTimer = setInterval(() => {
    if (!ar.isOpen() || !ar.hasLabels() || labelScans >= 12) { stopLabels(); return; }
    if (!busy && !voice.speaking && !document.hidden) scanLabels();
  }, 12000);
  initiative.suggest([{ label: '🔄 Actualiser', say: 'actualise les étiquettes' }, { label: '🧹 Enlever', say: 'enlève les étiquettes' }]);
  return n ? `J'ai identifié ${n} élément${n > 1 ? 's' : ''}. Touchez une étiquette pour en savoir plus.` : "Je ne reconnais rien de précis. Rapprochez-vous ou visez un objet, puis dites « actualise ».";
}
let scanning = false;
async function scanLabels() {
  if (scanning) return 0;
  const frame = ar.captureFrame();
  if (!frame) return 0;
  scanning = true;
  labelScans++;
  ar.caption('🔎 J’analyse ce que je vois…');
  try {
    const objs = await labelObjects({ dataUrl: frame, source: 'camera', label: 'caméra' });
    if (!ar.isOpen()) return 0;
    ar.caption('');
    return ar.showLabels(objs, { onTag: (o) => ar.setPanel(el('div', {},
      el('h3', {}, o.label), o.info ? el('p', { class: 'route-places' }, o.info) : null,
      el('div', { class: 'actions-row' },
        chip('💬 Dis-m’en plus', () => handle(`dis-m'en plus sur ${o.label} en trois phrases`)),
        chip('🥽 Voir en 3D', () => handle(`projette ${o.label} en 3D`)),
        chip('✕ Fermer', () => ar.setPanel(null))))) });
  } catch (e) {
    ar.caption(`Analyse impossible : ${explainError(e)}`);
    return 0;
  } finally {
    scanning = false;
  }
}

// Prochaines étapes proposées après une action (boutons, jamais dites à voix haute).
function nextSteps(actions = []) {
  const out = [];
  for (const a of actions) {
    const q = a?.query || a?.topic || '';
    switch (a?.type) {
      case 'images': out.push({ label: '🎬 Vidéo', say: `lance une vidéo sur ${q}` }, { label: '📚 Étudier', say: `étudie ${q}` }, { label: '🥽 En 3D', say: `projette ${q} en 3D` }); break;
      case 'video': out.push({ label: '📚 Fiche', say: `étudie ${q}` }, { label: '🧠 Carte mentale', say: `fais une carte mentale sur ${q}` }); break;
      case 'study': out.push({ label: '🧠 Carte mentale', say: `fais une carte mentale sur ${q}` }, { label: '❓ Quiz', say: `fais-moi un quiz interactif sur ${q}` }, { label: '🥽 Voir en 3D', say: `projette ${q} en 3D` }); break;
      case 'weather': out.push({ label: '👕 Que porter ?', say: `que dois-je porter aujourd'hui${a.city ? ` à ${a.city}` : ''} ?` }); break;
      case 'mindmap': out.push({ label: '🖼️ Illustrer', say: 'ajoute des images à la carte mentale' }, { label: '🌳 En arbre', say: 'mets-la en arbre' }); break;
      case 'table': out.push({ label: '🃏 En cartes', say: 'mets-le en cartes' }, { label: '📊 Infographie', say: 'fais une infographie à partir de ce tableau' }); break;
      case 'music': out.push({ label: '⏭️ Suivant', say: 'suivant' }, { label: '🔉 Moins fort', say: 'baisse le son' }); break;
      case 'generate_image': out.push({ label: '🔁 Autre version', say: `génère une image de ${a.prompt}` }, { label: '🥽 Projeter', say: 'projette cette image' }); break;
      default: break;
    }
  }
  return out;
}

// Mots utilisés pour désigner un élément → types de cartes correspondants.
function kindsFor(word = '') {
  const w = String(word).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/carte mentale|mind ?map|mindmap|carte des idees|heuristique/.test(w)) return 'mindmap';
  if (/camera|webcam/.test(w)) return 'camera';
  if (/memoire|souvenir/.test(w)) return 'memory';
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
  if (/\.(glb|gltf)$/i.test(file?.name || '')) { receiveModel(file); return; }
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
        chip('📝 Lire le texte', () => handle('lis le texte de cette image')),
        chip('🥽 Projeter en AR', () => handle('projette cette image')),
        chip('🏗️ Plan → 3D', () => handle('projette ce plan en 3D'))));
    ui.card(`Image · ${file.name || 'collée'}`, body, { icon: '🖼️', kind: 'photo' });
    await say('Image reçue. Que voulez-vous savoir ?');
    initiative.onImage();
  } catch {
    ui.errorCard("Je n'arrive pas à lire cette image.");
  }
}

// Modèle 3D envoyé (.glb) : projeté directement en réalité augmentée.
async function receiveModel(file) {
  firstGesture();
  try {
    if (!ar.isOpen()) { if (camera.isOpen()) camera.closeCamera(); await ar.open({ onMic: toggleListen }); }
    if (!ar.isOpen()) throw new Error('AR fermée');
    await ar.showModel(URL.createObjectURL(file), file.name.replace(/\.\w+$/, ''));
    await say('Modèle 3D projeté. Pincez pour le faire tourner.');
  } catch {
    ui.errorCard("Je n'arrive pas à lire ce modèle 3D (format .glb conseillé : un .gltf avec des fichiers séparés ne peut pas être envoyé seul).");
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
  $('btn-draw').onclick = () => (draw.isOpen() ? draw.close() : handle('mode dessin'));
  $('show-memory').onclick = () => { $('settings').close(); showMemory(); };
  $('show-routines').onclick = () => { $('settings').close(); showRoutines(); };
  const base = `${location.origin}${location.pathname}`;
  $('shortcut-url').value = `${base}?cmd=`;
  $('copy-shortcut').onclick = async () => {
    try { await navigator.clipboard.writeText($('shortcut-url').value); $('copy-shortcut').textContent = 'Copié ✓'; } catch { $('shortcut-url').select(); }
  };
  $('btn-camera').onclick = () => (camera.isOpen() ? camera.closeCamera() : handle('affiche ma caméra'));
  addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); document.body.classList.add('dropping'); } });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  addEventListener('drop', (e) => {
    document.body.classList.remove('dropping');
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/') || /\.(glb|gltf)$/i.test(x.name));
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

  // Initiatives : propositions au bon moment et suggestions de prochaines étapes.
  initiative.init({
    run: (cmd) => handle(cmd),
    say: (text) => say(text),
    isBusy: () => busy || voice.speaking || voice.capturing,
    listen: () => { if (voice.wakeEnabled) voice.followUp(8000); },
    lastActivity: () => lastActivity,
  });
  // Dessin laissé en pause quelques secondes : proposer de le transformer.
  setInterval(() => { if (draw.isOpen() && Date.now() - draw.lastStrokeAt() > 6000) initiative.onDrawIdle(draw.strokeCount()); }, 2000);

  // Raccourcis (Siri, écran d'accueil) : ?cmd=… exécute une demande, ?listen=1 écoute, ?mode=dessin|ar|traducteur|etiquettes.
  const q = new URLSearchParams(location.search);
  const cmd = q.get('cmd') || q.get('q');
  const modeCmd = { dessin: 'mode dessin', draw: 'mode dessin', ar: 'ouvre la réalité augmentée', traducteur: 'mode interprète anglais', translate: 'mode interprète anglais', etiquettes: 'étiquette ce que tu vois', labels: 'étiquette ce que tu vois', routines: 'mes routines' }[q.get('mode') || ''];
  if (cmd || modeCmd || q.has('listen')) {
    history.replaceState(null, '', location.pathname); // la demande n'est pas rejouée au prochain chargement
    setTimeout(() => {
      if (cmd) handle(cmd);
      else if (modeCmd) handle(modeCmd);
      else if (voice.supported) { firstGesture(); if (!voice.listenOnce()) ui.setLive('Touchez le micro pour parler.', 'reply'); }
    }, 900);
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
