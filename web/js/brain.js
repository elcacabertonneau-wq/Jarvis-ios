// Cerveau de Jarvis : IA gratuite avec bascule automatique
// Groq (clé gratuite, ultra-rapide) → Claude (clé payante, optionnelle) → Gemini (clé gratuite) → Pollinations (sans clé, dernier recours).
import { settings } from './settings.js';
import { fetchJSON } from './services.js';

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
- {"type":"minimize","target":"all|musique|video|photo|recap|camera|meteo|minuteur|fiche|texte"} : réduire des fenêtres dans la barre du bas (elles continuent de fonctionner)
- {"type":"restore","target":"all|…"} : rouvrir des fenêtres réduites

Disposition de l'écran : toute action qui affiche quelque chose (images, generate_image, video, study, weather, timer, table, text) accepte "place" parmi : left, right, top, bottom, center, top-left, top-right, bottom-left, bottom-right. Quand l'utilisateur précise où mettre les éléments (« récap à droite, photo à gauche, vidéo en bas »), crée UNE action par élément avec sa "place". Une « photo » = images avec count 1. Un « récap » = table (ou text si ce n'est pas tabulaire). Sans indication de position, n'ajoute pas "place".

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
async function groq(messages, { json = true } = {}) {
  const models = [...new Set([settings.groqModel, 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'].filter(Boolean))];
  let err;
  for (const model of models) {
    try {
      const data = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.groqKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 3000, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
      });
      return data.choices[0].message.content;
    } catch (e) { err = e; if (!/HTTP (400|404)/.test(e.message)) break; }
  }
  throw err;
}

async function gemini(messages, { json = true } = {}) {
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
      generationConfig: { temperature: 0.6, maxOutputTokens: 3000, ...(json ? { responseMimeType: 'application/json' } : {}) },
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
async function claude(messages) {
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
      max_tokens: 3000,
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
  const source = image.source === 'camera' ? 'caméra en direct de l’utilisateur' : image.source === 'upload' ? 'image envoyée par l’utilisateur' : 'image affichée à l’écran';
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
