// Cerveau de Jarvis : IA gratuite avec bascule automatique
// Groq (clé gratuite, ultra-rapide) → Claude (clé payante, optionnelle) → Gemini (clé gratuite) → Pollinations (sans clé, dernier recours).
import { settings } from './settings.js';
import { fetchJSON } from './services.js';
import * as facts from './facts.js';

const HISTORY_KEY = 'jarvis.history.v1';
const MAX_HISTORY = 16;

export const memory = {
  history: (() => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } })(),
  push(role, content) {
    this.history.push({ role, content: String(content).slice(0, 2000) });
    this.history = this.history.slice(-MAX_HISTORY);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history)); } catch { /* ignore */ }
  },
  clear() {
    this.history = [];
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  },
};

function systemPrompt(ctx = {}) {
  const now = new Date();
  return `Tu es J.A.R.V.I.S., l'assistant personnel vocal de ton utilisateur, inspiré de l'IA d'Iron Man : brillant, efficace, loyal, avec une pointe d'humour britannique. Tu vouvoies l'utilisateur et l'appelles parfois "Monsieur" ou "Madame" seulement si tu le sais — sinon reste neutre.
Langue de réponse : ${settings.lang.startsWith('en') ? 'anglais' : 'français'}.
Date et heure actuelles : ${now.toLocaleString(settings.lang, { dateStyle: 'full', timeStyle: 'short' })}.
${ctx.playing ? `En cours de lecture : ${ctx.playing}.` : ''}
${ctx.screen ? `Actuellement affiché à l'écran : ${ctx.screen}.` : ''}
${ctx.table ? `Tableau actuellement affiché (JSON) : ${ctx.table}` : ''}
${ctx.mindmap ? `Carte mentale actuellement affichée (JSON) : ${ctx.mindmap}` : ''}
${facts.forPrompt()}
${ctx.draw ? `${ctx.draw} : l'utilisateur dessine dans l'air avec son doigt devant la caméra.` : ''}
${ctx.ar ? `${ctx.ar} (vue en réalité augmentée ouverte en plein écran).` : ''}
${ctx.camera ? 'La caméra de l\'utilisateur est ouverte à l\'écran.' : ''}
${ctx.image ? `L'utilisateur a fourni une image récemment (${ctx.image}).` : ''}

Tu contrôles une interface avec un écran et des lecteurs multimédia. Tu réponds TOUJOURS avec un unique objet JSON valide, sans texte autour :
{
  "speech": "ce que tu dis à voix haute : 1 à 3 phrases courtes, naturelles, sans markdown ni émoji",
  "display": "contenu Markdown à afficher à l'écran (listes, tableaux, titres, code…) ou chaîne vide si inutile",
  "title": "titre court de la carte affichée (optionnel)",
  "display_place": "position de la carte de texte (optionnel, voir positions)",
  "actions": [ ... ]
}
Actions disponibles (0, 1 ou plusieurs) :
- {"type":"images","query":"...","count":1} : chercher et afficher de vraies photos (count 1 = une seule grande photo ; sans count = galerie). Requête en anglais si plus pertinent
- {"type":"generate_image","prompt":"description détaillée en anglais"} : créer une image par IA
- {"type":"video","query":"..."} : chercher et lancer une vidéo YouTube
- {"type":"music","query":"artiste, titre ou genre"} : jouer de la musique (un genre → radio, un titre/artiste → YouTube)
- {"type":"study","topic":"..."} : étude approfondie d'un sujet avec Wikipédia (fiche + images + quiz)
- {"type":"weather","city":"... ou vide pour la position actuelle"}
- {"type":"timer","seconds":N,"label":"..."}
- {"type":"open","url":"https://..."} : ouvrir un site
- {"type":"media","command":"pause|resume|stop|next|volume_up|volume_down"}
- {"type":"table","title":"...","columns":["Col 1","Col 2",...],"rows":[["...","..."],...],"layout":"table|cards|list|compare","note":"source ou remarque courte (optionnel)"} : tableau récapitulatif propre, affiché en grand
- {"type":"table_update","layout":"table|cards|list|compare","sort":{"column":"nom de colonne","order":"asc|desc"},"highlight":"colonne ou ligne","hide":["colonne"],"show_all":true,"transpose":true,"expand":true|false,"close":true} : modifier la disposition du tableau affiché (ne mets que les champs utiles)
- {"type":"clear"} : effacer l'écran et revenir à l'accueil
- {"type":"fullscreen","on":true|false} : passer l'application en plein écran ou en sortir
- {"type":"camera","on":true|false,"place":"..."} : afficher ou fermer la caméra de l'utilisateur
- {"type":"look","prompt":"la demande de l'utilisateur"} : regarder la caméra (ou l'image fournie) pour répondre. Utilise-le dès que la demande porte sur ce que voit la caméra, ce que l'utilisateur montre ou tient, ou sur l'image fournie. Tu ne vois PAS l'image sans cette action.
- {"type":"text","title":"...","content":"Markdown","place":"..."} : une carte de texte supplémentaire (explication, résumé rédigé…)
- {"type":"move","target":"photo|images|video|recap|fiche|meteo|minuteur|texte","place":"..."} : déplacer un élément déjà affiché
- {"type":"swap","a":"...","b":"..."} : échanger la position de deux éléments affichés
- {"type":"layout_reset"} : remettre l'affichage normal (sans positions)
- {"type":"mindmap","title":"...","root":{"label":"Sujet","image_query":"requête d'image en anglais","children":[{"label":"Branche","image_query":"...","wiki":true,"children":[{"label":"Idée","link":"https://…","link_label":"source"}]}]},"layout":"mindmap|tree|org","place":"..."} : carte mentale (3 à 7 branches principales, 2 à 5 idées par branche, libellés courts de 1 à 6 mots, jusqu'à 3 niveaux). Chaque idée peut avoir une image ("image_query" = recherche automatique d'une photo, ou "image" = URL https d'une image) et un lien ("link" = URL https fiable et officielle uniquement, sinon "wiki": true pour un lien Wikipédia). Mets des images au sujet central et aux branches principales quand c'est visuel (lieux, personnes, objets, œuvres, espèces…).
- {"type":"mindmap_update","layout":"mindmap|tree|org","expand_all":true,"collapse_all":true,"toggle":"libellé","close":true,"images":"branches|all|libellé","links":"all|libellé","target":"libellé","link_url":"https://…","link_label":"…","remove_images":true,"remove_links":true} : changer l'affichage de la carte mentale affichée, ou y ajouter des images (recherche automatique) et des liens. Pour changer son CONTENU (ajouter des branches…), renvoie une action "mindmap" complète.
- {"type":"page","title":"...","html":"<style>…</style><div>…</div>","height":600,"place":"..."} : LIBERTÉ TOTALE DE MISE EN FORME. Page HTML+CSS que tu conçois entièrement (infographie, frise chronologique, fiche illustrée, affiche, tableau de bord, schéma, présentation, comparatif visuel, quiz interactif…). Fond sombre élégant cohérent avec l'interface (texte clair, accents cyan/violet/or), mise en page soignée (grilles, colonnes, badges, icônes emoji, dégradés, ombres). Autonome : pas de ressources externes sauf des images https. Tu peux utiliser du JavaScript pour l'interactivité ou dessiner sur un <canvas>. Le contenu s'adapte à la largeur disponible.
- {"type":"arrange","items":[{"target":"video","x":0,"y":0,"w":60,"h":100},{"target":"recap","x":60,"y":0,"w":40,"h":50}]} : placer et dimensionner LIBREMENT les fenêtres affichées (x, y, w, h en % de la zone d'affichage). Cibles : photo, images, video, recap/tableau, fiche, meteo, minuteur, texte, camera, carte mentale, page.
- {"type":"style","target":"...","accent":"couleur ou #hex","background":"glass|solid|transparent|glow|light","size":"small|normal|large|huge","title":"nouveau titre"} : changer l'apparence d'une fenêtre
- {"type":"theme","accent":"couleur ou #hex (default pour revenir au cyan)","background":"aurora|dark|minimal|vivid"} : changer les couleurs et l'ambiance de toute l'interface
- {"type":"ar","topic":"ce qu'il faut modéliser en 3D","image":"last|screen","image_query":"…","plan_from_image":true} : RÉALITÉ AUGMENTÉE. Projette un hologramme 3D par-dessus la caméra, que l'utilisateur manipule avec ses doigts (pincer pour tourner, poing pour déplacer, deux mains pour zoomer). "topic" = objet, machine, molécule, bâtiment, monument, organe, plan de maison ou d'appartement, système… (Jarvis construit la maquette 3D). "image":"last" (image envoyée) ou "screen" (image affichée) projette cette image en panneau flottant ; ajoute "plan_from_image":true pour transformer un plan dessiné en maquette 3D. "image_query" projette des photos trouvées en carrousel. Utilise-le dès que l'utilisateur parle de 3D, d'hologramme, de réalité augmentée, d'AR ou de projeter quelque chose.
- {"type":"ar_update","zoom":1.5,"turn":45,"view":"top|front|side|back","holo":true,"spin":true,"reset":true,"close":true} : modifier l'hologramme affiché (ne mets que les champs utiles)
- {"type":"remember","fact":"phrase courte à la première personne, ex. « Je suis allergique aux noix »"} : retenir durablement une information sur l'utilisateur (prénom, allergies, goûts, ville, proches, dates importantes, objectifs…). Utilise-le quand il te demande de retenir quelque chose, ou quand il partage spontanément une information personnelle durable et utile ; confirme-le en quelques mots. Jamais pour des choses passagères ni pour des mots de passe ou codes secrets.
- {"type":"forget","fact":"ce qu'il faut oublier"} : oublier un souvenir (ou "all" pour tout oublier)
- {"type":"memory"} : afficher tout ce que tu as retenu sur l'utilisateur
- {"type":"draw"} : ouvrir le mode « dessin dans l'air » (l'utilisateur trace avec son index devant la caméra, puis tu transformes le croquis en schéma propre)
- {"type":"minimize","target":"all|musique|video|photo|recap|camera|meteo|minuteur|fiche|texte"} : réduire des fenêtres dans la barre du bas (elles continuent de fonctionner)
- {"type":"restore","target":"all|…"} : rouvrir des fenêtres réduites

Liberté de mise en forme : tu as carte blanche pour présenter les informations de la façon la plus claire et la plus belle selon la demande. Combine librement les actions : "page" pour une mise en forme sur mesure, "mindmap" pour une carte mentale, "table" pour un récap, "arrange" pour une disposition précise, "style"/"theme" pour les couleurs. Si l'utilisateur décrit une mise en page (« en grand à gauche », « sur deux colonnes », « la vidéo sur les deux tiers »…), traduis-la fidèlement avec "place" ou "arrange".

Disposition de l'écran : toute action qui affiche quelque chose (images, generate_image, video, study, weather, timer, table, text, mindmap, page, camera) accepte "place" parmi : left, right, top, bottom, center, top-left, top-right, bottom-left, bottom-right. Quand l'utilisateur précise où mettre les éléments (« récap à droite, photo à gauche, vidéo en bas »), crée UNE action par élément avec sa "place". Une « photo » = images avec count 1. Un « récap » = table (ou text si ce n'est pas tabulaire). Sans indication de position, n'ajoute pas "place".

Règles :
- Si la demande nécessite une action, déclenche-la plutôt que de décrire ce que tu ferais.
- Pour les explications, le "speech" résume en une ou deux phrases et le "display" contient le détail bien structuré.
- Pour une simple conversation, "display" peut être vide.
- Pour tout récapitulatif, comparaison, classement, planning, bilan ou liste d'éléments avec plusieurs attributs : utilise l'action "table" (pas de tableau Markdown). 3 à 7 colonnes, la première colonne nomme l'élément, cellules courtes (chiffres avec unité), jusqu'à 20 lignes. Laisse alors "display" vide et résume oralement en une phrase.
- Choisis la disposition : "table" par défaut, "compare" pour comparer 2 à 4 éléments, "cards" pour des fiches descriptives, "list" pour un classement ou des étapes.
- Si l'utilisateur veut changer la disposition du tableau affiché (trier, inverser, cartes, liste, mettre en évidence, masquer une colonne), utilise "table_update". S'il veut changer son contenu (ajouter une colonne, des lignes, corriger), renvoie une action "table" complète avec les nouvelles données.
- Ne mens jamais : si tu ne sais pas, dis-le.`;
}

function buildMessages(userText, ctx) {
  return [
    { role: 'system', content: systemPrompt(ctx) },
    ...memory.history,
    { role: 'user', content: ctx.extra ? `${userText}\n\n[Contexte]\n${ctx.extra}` : userText },
  ];
}

// ---------- Fournisseurs ----------
async function groq(messages, { json = true, maxTokens = 3000 } = {}) {
  const models = [...new Set([settings.groqModel, 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'].filter(Boolean))];
  let err;
  for (const model of models) {
    try {
      const data = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.groqKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
      });
      return data.choices[0].message.content;
    } catch (e) { err = e; if (!/HTTP (400|404)/.test(e.message)) break; }
  }
  throw err;
}

async function gemini(messages, { json = true, maxTokens = 3000 } = {}) {
  const system = messages.find((m) => m.role === 'system')?.content;
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const model = settings.geminiModel || 'gemini-2.5-flash';
  const data = await fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiKey}`, {
    method: 'POST',
    timeout: 40000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
  });
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

async function pollinations(messages, { json = true } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages, referrer: 'jarvis-pwa', private: true, jsonMode: json }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Claude (Anthropic) : nécessite une clé API payante (console.anthropic.com), distincte de l'abonnement claude.ai.
async function claude(messages, { maxTokens = 3000 } = {}) {
  const system = messages.find((m) => m.role === 'system')?.content;
  const data = await fetchJSON('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    timeout: 40000,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.claudeKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.claudeModel || 'claude-haiku-4-5',
      max_tokens: maxTokens,
      system,
      messages: messages.filter((m) => m.role !== 'system'),
    }),
  });
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const PROVIDERS = {
  claude: { fn: claude, ok: () => !!settings.claudeKey, label: 'Claude' },
  groq: { fn: groq, ok: () => !!settings.groqKey, label: 'Groq' },
  gemini: { fn: gemini, ok: () => !!settings.geminiKey, label: 'Gemini' },
  pollinations: { fn: pollinations, ok: () => true, label: 'Pollinations' },
};

function order() {
  const all = ['groq', 'claude', 'gemini', 'pollinations'];
  if (settings.provider !== 'auto' && PROVIDERS[settings.provider]) {
    return [settings.provider, ...all.filter((p) => p !== settings.provider)];
  }
  return all;
}

export function activeProviderLabel() {
  const p = order().find((k) => PROVIDERS[k].ok());
  return PROVIDERS[p]?.label || '—';
}

async function complete(messages, opts) {
  let lastErr;
  for (const name of order()) {
    const p = PROVIDERS[name];
    if (!p.ok()) continue;
    try {
      const out = await p.fn(messages, opts);
      if (out && out.trim()) return out;
    } catch (e) {
      lastErr = e;
      console.warn(`[Jarvis] ${name} a échoué :`, e.message);
    }
  }
  throw lastErr || new Error('Aucune IA disponible');
}

export function parseReply(raw) {
  let text = String(raw || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      return {
        speech: String(obj.speech || obj.say || ''),
        display: String(obj.display || ''),
        title: String(obj.title || ''),
        place: String(obj.display_place || ''),
        actions: Array.isArray(obj.actions) ? obj.actions : [],
      };
    } catch { /* texte libre */ }
  }
  const short = text.length > 280 ? `${text.split(/(?<=[.!?])\s/).slice(0, 2).join(' ')}` : text;
  return { speech: short, display: text.length > 280 ? text : '', title: '', place: '', actions: [] };
}

export async function think(userText, ctx = {}) {
  const raw = await complete(buildMessages(userText, ctx), { json: true });
  const reply = parseReply(raw);
  memory.push('user', userText);
  // En mémoire, on résume les tableaux (le contenu complet est renvoyé à part quand il est affiché).
  const brief = reply.actions.map((x) => (x?.type === 'table' ? { type: 'table', title: x.title, columns: x.columns, rows: (x.rows || []).length } : x));
  memory.push('assistant', JSON.stringify({ speech: reply.speech, actions: brief }));
  return reply;
}

// ---------- Vision : analyse d'une image (caméra ou fichier) ----------
const VISION_RULES = `

Une image est jointe à ce message (source : SOURCE). Tu la vois réellement : analyse-la attentivement pour répondre.
- Décris ce qui est utile à la demande, pas tout. Identifie précisément (objet, marque, modèle, espèce, lieu, œuvre, plat…) et dis ton niveau de certitude.
- S'il y a du texte (document, étiquette, écran, tableau blanc), lis-le et utilise-le ; si on te demande de le traduire ou de le résumer, fais-le dans "display".
- Si l'utilisateur veut des recherches ou en savoir plus, déclenche les actions adaptées avec des requêtes PRÉCISES issues de ce que tu identifies : "study" (fiche), "images" (photos similaires, requête en anglais), "video", "table" (récap, comparatif, caractéristiques, prix indicatifs…), en respectant les positions demandées.
- N'utilise jamais l'action "look" dans cette réponse (tu as déjà l'image).`;

const dataParts = (dataUrl) => {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  return m ? { mime: m[1], b64: m[2] } : null;
};

async function groqVision(messages, image) {
  const models = [...new Set([settings.groqVisionModel, 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'].filter(Boolean))];
  const last = messages[messages.length - 1];
  const withImage = [...messages.slice(0, -1), { role: 'user', content: [
    { type: 'text', text: last.content },
    { type: 'image_url', image_url: { url: image.dataUrl || image.url } },
  ] }];
  let err;
  for (const model of models) {
    for (const json of [true, false]) {
      try {
        const data = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          timeout: 45000,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.groqKey}` },
          body: JSON.stringify({ model, messages: withImage, temperature: 0.4, max_tokens: 3000, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
        });
        return data.choices[0].message.content;
      } catch (e) { err = e; if (!/HTTP (400|404)/.test(e.message)) throw e; }
    }
  }
  throw err;
}

async function geminiVision(messages, image) {
  const p = dataParts(image.dataUrl);
  if (!p) throw new Error('Gemini a besoin de l’image elle-même');
  const system = messages.find((m) => m.role === 'system')?.content;
  const turns = messages.filter((m) => m.role !== 'system');
  const contents = turns.map((m, i) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: i === turns.length - 1 ? [{ inline_data: { mime_type: p.mime, data: p.b64 } }, { text: m.content }] : [{ text: m.content }],
  }));
  const model = settings.geminiModel || 'gemini-2.5-flash';
  const data = await fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiKey}`, {
    method: 'POST',
    timeout: 45000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 3000, responseMimeType: 'application/json' },
    }),
  });
  return data.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '';
}

async function claudeVision(messages, image) {
  const p = dataParts(image.dataUrl);
  const system = messages.find((m) => m.role === 'system')?.content;
  const turns = messages.filter((m) => m.role !== 'system');
  const last = turns[turns.length - 1];
  const data = await fetchJSON('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    timeout: 45000,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.claudeKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.claudeModel || 'claude-haiku-4-5',
      max_tokens: 3000,
      system,
      messages: [...turns.slice(0, -1), { role: 'user', content: [
        p ? { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.b64 } } : { type: 'image', source: { type: 'url', url: image.url } },
        { type: 'text', text: last.content },
      ] }],
    }),
  });
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const VISION = {
  gemini: { fn: geminiVision, ok: (img) => !!settings.geminiKey && !!img.dataUrl },
  groq: { fn: groqVision, ok: () => !!settings.groqKey },
  claude: { fn: claudeVision, ok: () => !!settings.claudeKey },
};

export const canSee = () => !!(settings.geminiKey || settings.groqKey || settings.claudeKey);

// Envoie l'image et la demande à une IA capable de voir ; renvoie { speech, display, title, place, actions }.
export async function see(userText, image, ctx = {}) {
  const order = ['gemini', 'groq', 'claude'];
  if (VISION[settings.provider]) order.unshift(...order.splice(order.indexOf(settings.provider), 1));
  const source = image.source === 'camera' ? 'caméra en direct de l’utilisateur'
    : image.source === 'upload' ? 'image envoyée par l’utilisateur'
    : image.source === 'drawing' ? 'croquis que l’utilisateur vient de tracer dans l’air avec son doigt (traits imprécis et tremblés à interpréter avec bienveillance ; les couleurs distinguent parfois des éléments)'
    : 'image affichée à l’écran';
  const messages = [
    { role: 'system', content: systemPrompt(ctx) + VISION_RULES.replace('SOURCE', source) },
    ...memory.history,
    { role: 'user', content: userText },
  ];
  let lastErr = new Error('Aucune IA capable de voir n’est configurée.');
  for (const name of order) {
    const p = VISION[name];
    if (!p.ok(image)) continue;
    try {
      const raw = await p.fn(messages, image);
      if (!raw?.trim()) continue;
      const reply = parseReply(raw);
      reply.actions = reply.actions.filter((a) => a?.type !== 'look');
      memory.push('user', `[image : ${source}] ${userText}`);
      memory.push('assistant', JSON.stringify({ speech: reply.speech, actions: reply.actions.map((a) => (a?.type === 'table' ? { type: 'table', title: a.title } : a)) }));
      return reply;
    } catch (e) {
      lastErr = e;
      console.warn(`[Jarvis] vision ${name} a échoué :`, e.message);
    }
  }
  throw lastErr;
}

// Génère une carte mentale structurée sur un sujet.
export async function mindmapFor(topic, extra = '') {
  const lang = settings.lang.startsWith('en') ? 'English' : 'français';
  const messages = [
    { role: 'system', content: `Tu crées des cartes mentales claires et pédagogiques en ${lang}. Réponds uniquement en JSON : {"speech":"une phrase qui présente la carte","title":"titre","root":{"label":"sujet central (1 à 4 mots)","image_query":"photo search in English","wiki":true,"children":[{"label":"branche","image_query":"…","wiki":true,"children":[{"label":"idée","link":"https://…","link_label":"source","children":[{"label":"détail"}]}]}]}}` },
    { role: 'user', content: `Carte mentale sur : ${topic}${extra ? `\nPrécisions : ${extra}` : ''}\n\nRègles : 4 à 7 branches principales qui couvrent tout le sujet (causes, acteurs, étapes, notions clés, conséquences, exemples… selon le sujet), 2 à 5 idées par branche, parfois un 3e niveau de détails (dates, chiffres, exemples). Libellés courts (1 à 6 mots), précis et factuels.
Illustrations et sources : mets un "image_query" (en anglais, précis) sur le sujet central et sur les branches principales quand une photo aide à comprendre (personnes, lieux, objets, œuvres, espèces, événements) ; mets "wiki": true sur les notions importantes qui ont un article Wikipédia ; n'ajoute "link" que pour des sites officiels dont tu es certain de l'adresse.` },
  ];
  const raw = await complete(messages, { json: true });
  const text = String(raw).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const obj = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return obj;
}

// ---------- Réalité augmentée : maquettes 3D ----------
const AR_SCHEMA = `{"title":"titre court","speech":"une phrase qui présente la maquette","polyhaven":"","parts":[{"shape":"box|sphere|cylinder|cone|pyramid|torus|capsule|plane|line|label","pos":[x,y,z],"size":[…],"rot":[degX,degY,degZ],"color":"#hex","opacity":1,"glow":false,"label":"nom","spin":0,"orbit":0}],"plan":{"wall_height":2.5,"rooms":[{"name":"Salon","x":0,"z":0,"w":5,"d":4,"color":"#hex"}]}}`;
const AR_RULES = `Règles de la maquette :
- "parts" : 1 à 90 formes simples. size : box [largeur,hauteur,profondeur] ; sphere [rayon] ; cylinder, cone, pyramid [rayon,hauteur] ; torus [rayon,épaisseur] (anneau horizontal si rot [90,0,0]) ; capsule [rayon,longueur] ; plane [largeur,profondeur] (horizontal). "line" relie deux points : "from":[x,y,z],"to":[x,y,z],"size":[rayon] (liaisons chimiques, tiges, câbles, axes, pieds, branches). "label" seul = texte flottant à "pos".
- Axe y vers le haut, unités libres (la maquette est redimensionnée automatiquement), centrée sur l'origine. "spin" = rotation propre (degrés/s) autour de l'axe vertical ; "orbit" = rotation (degrés/s) autour de l'axe vertical passant par l'origine (planètes, électrons, pales). "glow": true pour ce qui émet de la lumière.
- Mets un "label" (1 à 3 mots) sur les 3 à 12 pièces importantes, pas sur toutes.
- Qualité : proportions réalistes, couleurs cohérentes et contrastées, assez de pièces pour que l'objet soit immédiatement reconnaissable (un moteur, un avion, un château, une cellule, un cœur…). Molécules : sphères d'atomes aux couleurs CPK et "line" pour les liaisons.
- "plan" seulement pour un plan de logement, de bureau, de salle, de jardin… : pièces en mètres ("x","z" = coin, "w" = largeur sur x, "d" = profondeur sur z), jointives sans chevauchement ; ajoute le mobilier principal dans "parts" avec les mêmes coordonnées (y = 0 au sol). Sinon omets "plan".
- "polyhaven" : seulement pour un objet courant du quotidien (meuble, chaise, lampe, plante en pot, vase, outil, statue, rocher…), 1 à 3 mots-clés EN ANGLAIS pour chercher un vrai modèle photoréaliste dans la bibliothèque Poly Haven ; fournis quand même "parts" en secours. Sinon "".`;

function parseJSON(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

// Construit une maquette 3D (formes simples ou plan) d'un sujet, pour l'hologramme en réalité augmentée.
export async function arSceneFor(topic, extra = '') {
  const lang = settings.lang.startsWith('en') ? 'English' : 'français';
  const messages = [
    { role: 'system', content: `Tu es un modélisateur 3D. Tu construis des maquettes 3D lisibles à partir de formes simples, affichées en hologramme en réalité augmentée. Textes en ${lang}. Réponds uniquement en JSON : ${AR_SCHEMA}\n${AR_RULES}` },
    { role: 'user', content: `Maquette 3D de : ${topic}${extra ? `\nPrécisions : ${extra}` : ''}` },
  ];
  return parseJSON(await complete(messages, { json: true, maxTokens: 7000 }));
}

// Transforme une image de plan (croquis, plan d'architecte, photo de plan) en maquette 3D.
export async function arSceneFromImage(image, request = '') {
  const order = ['gemini', 'groq', 'claude'];
  if (VISION[settings.provider]) order.unshift(...order.splice(order.indexOf(settings.provider), 1));
  const messages = [
    { role: 'system', content: `Tu es un architecte et modélisateur 3D. Une image est jointe : un plan (logement, bâtiment, salle, jardin…) ou un schéma. Reconstruis-le en maquette 3D fidèle. Lis les noms des pièces et les cotes écrites ; sinon estime les dimensions en mètres d'après les proportions (une porte ≈ 0,9 m, un lit double ≈ 1,6 × 2 m). Si l'image n'est pas un plan, modélise en 3D l'objet ou le schéma représenté avec "parts". Réponds uniquement en JSON : ${AR_SCHEMA}\n${AR_RULES}` },
    { role: 'user', content: request || 'Transforme ce plan en maquette 3D.' },
  ];
  let lastErr = new Error('Aucune IA capable de voir n’est configurée.');
  for (const name of order) {
    const p = VISION[name];
    if (!p.ok(image)) continue;
    try {
      const raw = await p.fn(messages, image);
      if (raw?.trim()) return parseJSON(raw);
    } catch (e) {
      lastErr = e;
      console.warn(`[Jarvis] plan 3D ${name} a échoué :`, e.message);
    }
  }
  throw lastErr;
}

// Génère une fiche d'étude structurée à partir de sources Wikipédia.
export async function studyNotes(topic, wiki) {
  const lang = settings.lang.startsWith('en') ? 'English' : 'français';
  const messages = [
    { role: 'system', content: `Tu es un excellent professeur. Tu rédiges en ${lang} des fiches d'étude claires en Markdown. Réponds uniquement en JSON : {"speech":"résumé oral en 2-3 phrases","display":"fiche Markdown"}.` },
    {
      role: 'user',
      content: `Sujet : ${topic}\n\n${wiki ? `Source (Wikipédia « ${wiki.title} ») :\n${wiki.text.slice(0, 7000)}` : 'Aucune source trouvée : utilise tes connaissances en le signalant.'}\n\nRédige la fiche avec ces sections : "## En bref" (3 phrases), "## Points clés" (6 à 10 puces), "## Pour aller plus loin" (notions liées, dates ou chiffres importants, éventuellement un tableau), "## Quiz" (4 questions numérotées, réponses en fin de fiche dans une section "## Réponses").`,
    },
  ];
  return parseReply(await complete(messages, { json: true }));
}
