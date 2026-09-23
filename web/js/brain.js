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

Tu contrôles une interface avec un écran et des lecteurs multimédia. Tu réponds TOUJOURS avec un unique objet JSON valide, sans texte autour :
{
  "speech": "ce que tu dis à voix haute : 1 à 3 phrases courtes, naturelles, sans markdown ni émoji",
  "display": "contenu Markdown à afficher à l'écran (listes, tableaux, titres, code…) ou chaîne vide si inutile",
  "title": "titre court de la carte affichée (optionnel)",
  "actions": [ ... ]
}
Actions disponibles (0, 1 ou plusieurs) :
- {"type":"images","query":"..."} : chercher et afficher de vraies photos (mets la requête en anglais si c'est plus pertinent)
- {"type":"generate_image","prompt":"description détaillée en anglais"} : créer une image par IA
- {"type":"video","query":"..."} : chercher et lancer une vidéo YouTube
- {"type":"music","query":"artiste, titre ou genre"} : jouer de la musique (un genre → radio, un titre/artiste → YouTube)
- {"type":"study","topic":"..."} : étude approfondie d'un sujet avec Wikipédia (fiche + images + quiz)
- {"type":"weather","city":"... ou vide pour la position actuelle"}
- {"type":"timer","seconds":N,"label":"..."}
- {"type":"open","url":"https://..."} : ouvrir un site
- {"type":"media","command":"pause|resume|stop|next|volume_up|volume_down"}
- {"type":"clear"} : effacer l'écran

Règles :
- Si la demande nécessite une action, déclenche-la plutôt que de décrire ce que tu ferais.
- Pour les explications, le "speech" résume en une ou deux phrases et le "display" contient le détail bien structuré.
- Pour une simple conversation, "display" peut être vide.
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
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 2048, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
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
      generationConfig: { temperature: 0.6, maxOutputTokens: 2048, ...(json ? { responseMimeType: 'application/json' } : {}) },
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
      max_tokens: 2048,
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
        actions: Array.isArray(obj.actions) ? obj.actions : [],
      };
    } catch { /* texte libre */ }
  }
  const short = text.length > 280 ? `${text.split(/(?<=[.!?])\s/).slice(0, 2).join(' ')}` : text;
  return { speech: short, display: text.length > 280 ? text : '', title: '', actions: [] };
}

export async function think(userText, ctx = {}) {
  const raw = await complete(buildMessages(userText, ctx), { json: true });
  const reply = parseReply(raw);
  memory.push('user', userText);
  memory.push('assistant', JSON.stringify({ speech: reply.speech, actions: reply.actions }));
  return reply;
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
