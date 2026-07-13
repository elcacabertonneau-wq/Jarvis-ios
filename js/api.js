// ============================================================
// api.js — Appels directs à l'API Groq (transcription + chat)
//
// Tout se fait depuis le navigateur, sans backend, avec UNE SEULE
// clé API : Groq sert à la fois pour :
//  - Whisper (audio → texte)
//  - le LLM (chat + outils + vision), via l'endpoint compatible
//    OpenAI de Groq (/openai/v1/chat/completions)
//
// Architecture des outils :
//  - TOOLS est la liste déclarative (nom, description, input_schema),
//    convertie automatiquement au format OpenAI à l'envoi.
//  - toolHandlers est le registre d'exécution : nom d'outil → fonction.
//    La boucle de tool_calls est générique — pour ajouter un outil
//    (mails...), déclarer son schéma dans TOOLS et enregistrer son
//    handler via registerTool(). Rien d'autre à toucher.
// ============================================================

import { getGroqKey } from "./config.js";
import { captureFrame } from "./vision.js";
import { playSearch, controlPlayback, getNowPlaying } from "./music.js";

const CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
// Llama 4 Scout : supporte le tool use ET la vision (images) sur Groq.
const CHAT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const API_TIMEOUT_MS = 45000;

// Prompt système : JARVIS, réponses très courtes (c'est de la voix)
const SYSTEM_PROMPT = [
  "Tu es JARVIS, un assistant vocal personnel.",
  "Tu réponds toujours en français, avec un ton posé et légèrement formel,",
  "à la manière du JARVIS d'Iron Man (tu peux appeler l'utilisateur « Monsieur »).",
  "Tes réponses sont TRÈS courtes : 1 à 3 phrases maximum.",
  "Elles sont lues à voix haute — pas de listes, pas de markdown, pas de code.",
  "Si on te demande ce que tu vois, utilise l'outil regarder_camera.",
  "Pour la musique, utilise jouer_musique, controler_lecture et info_lecture.",
].join(" ");

// ------------------------------------------------------------
// Erreur typée pour remonter le statut HTTP à l'UI
// ------------------------------------------------------------

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status Code HTTP (0 = réseau/timeout)
   * @param {"groq"|"youtube"} provider
   */
  constructor(message, status, provider) {
    super(message);
    this.status = status;
    this.provider = provider;
  }
}

/** fetch avec délai maximal — lève ApiError(status=0) en cas de timeout/réseau. */
async function fetchWithTimeout(url, options, provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (!navigator.onLine) {
      throw new ApiError("Hors ligne : vérifiez votre connexion internet.", 0, provider);
    }
    if (err.name === "AbortError") {
      throw new ApiError("Délai d'attente dépassé (" + provider + ").", 0, provider);
    }
    throw new ApiError("Erreur réseau (" + provider + ") : " + err.message, 0, provider);
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// Groq Whisper : audio → texte
// ------------------------------------------------------------

/**
 * Transcrit un blob audio en texte via Whisper (Groq).
 * @param {Blob} audioBlob
 * @param {string} extension Extension du fichier ("mp4", "webm"...)
 * @returns {Promise<string>} texte transcrit (peut être vide)
 */
export async function transcribe(audioBlob, extension) {
  const form = new FormData();
  form.append("file", audioBlob, "audio." + extension);
  form.append("model", "whisper-large-v3");
  form.append("language", "fr");
  form.append("response_format", "json");

  const response = await fetchWithTimeout(
    GROQ_STT_URL,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + getGroqKey() },
      body: form, // ne PAS fixer Content-Type : le navigateur gère le boundary
    },
    "groq"
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError("Erreur Groq " + response.status + " : " + detail.slice(0, 200), response.status, "groq");
  }

  const data = await response.json();
  return (data.text || "").trim();
}

// ------------------------------------------------------------
// Déclaration des outils (constante exportée, facile à étendre)
// Format interne : {name, description, input_schema} — converti au
// format OpenAI ({type:"function", function:{...}}) à l'envoi.
// ------------------------------------------------------------

export const TOOLS = [
  {
    name: "regarder_camera",
    description:
      "Capture une image avec la caméra frontale de l'appareil et te la montre. " +
      "Utilise cet outil dès que l'utilisateur demande ce que tu vois, de décrire " +
      "la scène, de le regarder, ou toute question nécessitant la vision.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "jouer_musique",
    description:
      "Cherche un morceau ou un artiste sur YouTube et lance la lecture. " +
      "Utilise cet outil quand l'utilisateur demande de la musique, " +
      "par exemple « mets du Nekfeu » ou « joue Bohemian Rhapsody ».",
    input_schema: {
      type: "object",
      properties: {
        recherche: {
          type: "string",
          description: "Termes de recherche : artiste, titre, ambiance...",
        },
      },
      required: ["recherche"],
    },
  },
  {
    name: "controler_lecture",
    description:
      "Contrôle la musique en cours : mettre en pause, reprendre, " +
      "arrêter, ou passer au morceau suivant.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["pause", "reprendre", "stop", "suivant"],
          description: "L'action à effectuer sur la lecture.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "info_lecture",
    description:
      "Renvoie le titre du morceau en cours de lecture. Utilise cet outil " +
      "quand l'utilisateur demande « c'est quoi cette musique ? » ou similaire.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  // Prochains outils (exemples à venir) : lire_mails...
  // 1. Ajouter le schéma ici.
  // 2. Enregistrer le handler avec registerTool("nom", fn) ci-dessous.
];

/** Conversion vers le format d'outils OpenAI attendu par Groq. */
function toolsForGroq() {
  return TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

// ------------------------------------------------------------
// Registre des handlers d'outils
// Chaque handler retourne :
//  - une chaîne (résultat texte), OU
//  - un objet { text, imageJpegBase64 } quand le résultat inclut
//    une image (le format OpenAI n'accepte que du texte dans les
//    messages "tool" : l'image est alors renvoyée au modèle dans
//    un message "user" séparé — géré par la boucle générique).
// ------------------------------------------------------------

const toolHandlers = new Map();

/** Enregistre (ou remplace) le handler d'un outil. */
export function registerTool(name, handler) {
  toolHandlers.set(name, handler);
}

// --- Outil vision : capture une frame et la renvoie au modèle ---
registerTool("regarder_camera", async () => {
  const base64Jpeg = captureFrame(); // lève si la caméra n'est pas prête
  return {
    text: "Image capturée par la caméra frontale : elle est jointe dans le message suivant. Décris ce que tu vois de façon concise.",
    imageJpegBase64: base64Jpeg,
  };
});

// --- Outils musique : délèguent au module music.js ---
registerTool("jouer_musique", async (input) => {
  return playSearch(input.recherche || "");
});

registerTool("controler_lecture", async (input) => {
  return controlPlayback(input.action);
});

registerTool("info_lecture", async () => {
  const title = getNowPlaying();
  return title ? "En cours de lecture : « " + title + " »." : "Aucune lecture en cours.";
});

/**
 * Exécute un appel d'outil demandé par le modèle (dispatch générique).
 * Retourne { text, imageJpegBase64? } — toujours exploitable, même en
 * cas d'échec (le texte d'erreur permet au modèle de rebondir).
 */
async function runTool(name, args) {
  const handler = toolHandlers.get(name);
  if (!handler) {
    return { text: "Outil inconnu : " + name };
  }
  try {
    const result = await handler(args || {});
    return typeof result === "string" ? { text: result } : result;
  } catch (err) {
    return { text: "Échec de l'outil : " + err.message };
  }
}

// ------------------------------------------------------------
// Groq chat : boucle de conversation avec gestion générique
// des tool_calls (format OpenAI)
// ------------------------------------------------------------

/** Un appel brut à l'endpoint chat/completions de Groq. */
async function callGroqChat(messages) {
  const response = await fetchWithTimeout(
    CHAT_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getGroqKey(),
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 1024,
        temperature: 0.6,
        tools: toolsForGroq(),
        messages,
      }),
    },
    "groq"
  );

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch { /* corps non-JSON, tant pis */ }
    throw new ApiError("Erreur Groq " + response.status + (detail ? " : " + detail : ""), response.status, "groq");
  }

  return response.json();
}

/**
 * Envoie le message utilisateur + l'historique au modèle et gère la
 * boucle de tool_calls jusqu'à obtenir une réponse texte finale.
 *
 * @param {Array} history Historique [{role, content}] des tours précédents
 * @param {string} userText Message utilisateur transcrit
 * @param {(label: string) => void} [onToolUse] Rappel UI quand un outil tourne
 * @returns {Promise<string>} texte final de la réponse de JARVIS
 */
export async function askAssistant(history, userText, onToolUse) {
  // Messages locaux au tour courant (l'historique global reste géré par app.js)
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userText },
  ];

  const MAX_TOOL_ROUNDS = 5; // garde-fou contre les boucles infinies
  let rounds = 0;

  let data = await callGroqChat(messages);
  let message = data.choices?.[0]?.message || {};

  // Boucle générique : tant que le modèle demande des outils, on les exécute
  while (message.tool_calls && message.tool_calls.length && rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    if (onToolUse) {
      onToolUse(message.tool_calls.map((c) => c.function.name).join(", "));
    }

    // Le tour assistant (avec ses tool_calls) doit précéder les résultats
    messages.push(message);

    // Exécute chaque appel et collecte les éventuelles images à joindre
    const imagesToAttach = [];
    for (const call of message.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch { /* arguments illisibles : l'outil recevra {} */ }

      const result = await runTool(call.function.name, args);

      // Format OpenAI : un message "tool" (texte uniquement) par appel
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.text,
      });

      if (result.imageJpegBase64) imagesToAttach.push(result.imageJpegBase64);
    }

    // Les images (ex: capture caméra) sont jointes dans un message user
    // — le format OpenAI n'accepte pas d'image dans un message "tool".
    for (const img of imagesToAttach) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Voici l'image capturée par la caméra :" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + img } },
        ],
      });
    }

    data = await callGroqChat(messages);
    message = data.choices?.[0]?.message || {};
  }

  return (message.content || "").trim();
}
