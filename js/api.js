// ============================================================
// api.js — Appels directs Claude (Anthropic) + Groq Whisper
//
// Tout se fait depuis le navigateur, sans backend :
//  - Anthropic exige le header anthropic-dangerous-direct-browser-access: true
//    (sinon la requête est bloquée par le CORS).
//  - Groq Whisper reçoit l'audio en multipart/form-data.
//
// Architecture des outils :
//  - TOOLS est la liste déclarative envoyée à Claude (facile à étendre).
//  - toolHandlers est le registre d'exécution : nom d'outil → fonction.
//    La boucle de tool_use est générique — pour ajouter un outil
//    (mails, musique...), déclarer son schéma dans TOOLS et enregistrer
//    son handler via registerTool(). Rien d'autre à toucher.
// ============================================================

import { getAnthropicKey, getGroqKey } from "./config.js";
import { captureFrame } from "./vision.js";
import { playSearch, controlPlayback, getNowPlaying } from "./music.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const CLAUDE_MODEL = "claude-sonnet-4-6";
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
   * @param {"anthropic"|"groq"} provider
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
    GROQ_URL,
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

// ------------------------------------------------------------
// Registre des handlers d'outils
// Chaque handler reçoit l'input de l'outil et retourne le contenu
// du tool_result : une chaîne, OU un tableau de blocs (texte/image).
// ------------------------------------------------------------

const toolHandlers = new Map();

/** Enregistre (ou remplace) le handler d'un outil. */
export function registerTool(name, handler) {
  toolHandlers.set(name, handler);
}

// --- Outil vision : capture une frame et la renvoie à Claude en image ---
registerTool("regarder_camera", async () => {
  const base64Jpeg = captureFrame(); // lève si la caméra n'est pas prête
  return [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: base64Jpeg,
      },
    },
    {
      type: "text",
      text: "Image capturée par la caméra frontale à l'instant. Décris ce que tu vois de façon concise.",
    },
  ];
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
 * Exécute un appel d'outil demandé par Claude (dispatch générique).
 * Retourne toujours un bloc tool_result valide, même en cas d'échec
 * (is_error: true) pour que Claude puisse rebondir.
 */
async function runTool(toolUse) {
  const handler = toolHandlers.get(toolUse.name);

  if (!handler) {
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: "Outil inconnu : " + toolUse.name,
      is_error: true,
    };
  }

  try {
    const result = await handler(toolUse.input || {});
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: typeof result === "string" ? result : result,
    };
  } catch (err) {
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: "Échec de l'outil : " + err.message,
      is_error: true,
    };
  }
}

// ------------------------------------------------------------
// Claude : boucle de conversation avec gestion générique du tool_use
// ------------------------------------------------------------

/** Un appel brut à l'API Messages d'Anthropic. */
async function callClaude(messages) {
  const response = await fetchWithTimeout(
    ANTHROPIC_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getAnthropicKey(),
        "anthropic-version": "2023-06-01",
        // Obligatoire pour les appels directs depuis un navigateur (CORS)
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      }),
    },
    "anthropic"
  );

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch { /* corps non-JSON, tant pis */ }
    throw new ApiError("Erreur Anthropic " + response.status + (detail ? " : " + detail : ""), response.status, "anthropic");
  }

  return response.json();
}

/**
 * Envoie le message utilisateur + l'historique à Claude et gère la
 * boucle de tool_use jusqu'à obtenir une réponse texte finale.
 *
 * @param {Array} history Historique [{role, content}] des tours précédents
 * @param {string} userText Message utilisateur transcrit
 * @param {(label: string) => void} [onToolUse] Rappel UI quand un outil tourne
 * @returns {Promise<string>} texte final de la réponse de JARVIS
 */
export async function askClaude(history, userText, onToolUse) {
  // Messages locaux au tour courant (l'historique global reste géré par app.js)
  const messages = [...history, { role: "user", content: userText }];

  const MAX_TOOL_ROUNDS = 5; // garde-fou contre les boucles infinies
  let rounds = 0;

  let response = await callClaude(messages);

  // Boucle générique : tant que Claude demande des outils, on les exécute
  while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const toolUses = response.content.filter((block) => block.type === "tool_use");
    if (onToolUse && toolUses.length) onToolUse(toolUses.map((t) => t.name).join(", "));

    // Exécute tous les appels demandés (dispatch via le registre)
    const toolResults = [];
    for (const toolUse of toolUses) {
      toolResults.push(await runTool(toolUse));
    }

    // Le tour assistant (avec les blocs tool_use) puis TOUS les résultats
    // dans UN SEUL message user — exigé par l'API.
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await callClaude(messages);
  }

  // Concatène les blocs texte de la réponse finale
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();
}
