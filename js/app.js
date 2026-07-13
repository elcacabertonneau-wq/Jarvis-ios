// ============================================================
// app.js — Boucle principale + machine à états de JARVIS
//
// États (reflétés sur <body data-state> pour le CSS) :
//   idle      → en attente (orbe fixe)
//   listening → enregistrement en cours (pulsation)
//   thinking  → transcription + appel du modèle (rotation)
//   speaking  → lecture de la réponse (ondes)
//
// Flux : appui long sur l'orbe → dictée native (Web Speech API) →
// relâche → texte → Grok/xAI (avec outils) → affichage + voix.
// ============================================================

import { hasKeys, showConfig, initConfigUI } from "./config.js";
import { startDictation, stopDictation, lastDictationError, unlockSpeech, speak, stopSpeaking } from "./audio.js";
import { startCamera } from "./vision.js";
import { askAssistant, ApiError } from "./api.js";
import { initMusic, unlockPlayer, duckVolume, restoreVolume } from "./music.js";

// --- Éléments du DOM ---
const talkBtn = document.getElementById("talk-btn");
const conversation = document.getElementById("conversation");
const statusText = document.getElementById("status-text");
const orbHint = document.getElementById("orb-hint");
const errorBanner = document.getElementById("error-banner");
const videoFrame = document.getElementById("video-frame");

// --- État global ---
let state = "idle";
let history = []; // historique de conversation envoyé au modèle
let firstTap = true; // pour le déblocage de speechSynthesis
let cameraStarted = false;

const STATUS_LABELS = {
  idle: "EN ATTENTE",
  listening: "ÉCOUTE...",
  thinking: "ANALYSE...",
  speaking: "RÉPONSE",
};

const HINT_LABELS = {
  idle: "MAINTENIR POUR PARLER",
  listening: "RELÂCHER POUR ENVOYER",
  thinking: "TRAITEMENT EN COURS",
  speaking: "JARVIS PARLE",
};

/** Change l'état de la machine et met à jour l'UI. */
function setState(next) {
  state = next;
  document.body.dataset.state = next;
  statusText.textContent = STATUS_LABELS[next];
  orbHint.textContent = HINT_LABELS[next];
}

// ------------------------------------------------------------
// Affichage : historique + erreurs
// ------------------------------------------------------------

/** Ajoute un message dans le fil de conversation et scrolle en bas. */
function addMessage(who, text) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  const label = document.createElement("span");
  label.className = "who";
  label.textContent = who === "user" ? "VOUS" : who === "jarvis" ? "JARVIS" : "SYSTÈME";
  div.appendChild(label);
  div.appendChild(document.createTextNode(text));
  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
}

/**
 * Ajoute une grille d'images dans le fil de conversation
 * (résultats de l'outil chercher_images).
 * @param {string} query Recherche d'origine (légende)
 * @param {Array<{url: string, thumbnail: string, title: string}>} images
 */
function addImagesMessage(query, images) {
  const div = document.createElement("div");
  div.className = "msg jarvis msg-images";

  const label = document.createElement("span");
  label.className = "who";
  label.textContent = "JARVIS — IMAGES : " + query.toUpperCase();
  div.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "img-grid";
  for (const img of images) {
    const el = document.createElement("img");
    // Miniature CSE (plus légère et plus fiable en hotlink que l'original)
    el.src = img.thumbnail;
    el.alt = img.title;
    el.loading = "lazy";
    el.draggable = false;
    // Une image qui ne charge pas (hotlink bloqué) est simplement retirée
    el.addEventListener("error", () => el.remove());
    grid.appendChild(el);
  }
  div.appendChild(grid);

  conversation.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;
}

let errorTimer = null;

/** Affiche une erreur à l'écran pendant quelques secondes. */
function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => errorBanner.classList.add("hidden"), 6000);
}

// ------------------------------------------------------------
// Gestion centralisée des erreurs API
// ------------------------------------------------------------

function handleApiError(err) {
  if (err instanceof ApiError && err.status === 401) {
    // Clé invalide → réaffiche l'écran de config avec un message clair
    showConfig("Clé xAI (Grok) invalide. Vérifiez-la puis réessayez.");
    return;
  }
  if (err instanceof ApiError && err.provider === "xai" && err.status === 403) {
    // Clé valide mais compte sans crédits (cas fréquent chez xAI)
    showError("Compte xAI sans crédits : ajoutez des crédits sur console.x.ai puis réessayez.");
    return;
  }
  showError(err.message || "Erreur inconnue.");
}

// ------------------------------------------------------------
// Cœur du flux : un tour de conversation complet
// ------------------------------------------------------------

async function processTurn(userText) {
  setState("thinking");

  try {
    addMessage("user", userText);

    // Texte + historique → Grok/xAI (boucle d'outils générique dans api.js)
    const reply = await askAssistant(history, userText, (toolName) => {
      statusText.textContent = "OUTIL : " + toolName.toUpperCase();
    });

    // Mise à jour de l'historique (texte simple : les tours d'outils
    // intermédiaires restent internes au tour courant)
    history.push({ role: "user", content: userText });
    history.push({ role: "assistant", content: reply || "..." });

    // Limite l'historique aux 20 derniers tours pour contenir les coûts
    if (history.length > 40) history = history.slice(-40);

    // Affichage + lecture vocale.
    // La musique est baissée à 20 % pendant que JARVIS parle.
    const finalReply = reply || "Je n'ai pas de réponse, Monsieur.";
    addMessage("jarvis", finalReply);
    setState("speaking");
    duckVolume();
    try {
      await speak(finalReply);
    } finally {
      restoreVolume();
    }
  } catch (err) {
    handleApiError(err);
  } finally {
    // Ne pas écraser l'état si l'utilisateur a déjà relancé un
    // enregistrement (interruption de JARVIS pendant qu'il parlait)
    if (state !== "listening") setState("idle");
  }
}

// ------------------------------------------------------------
// Appui long sur l'orbe (Pointer Events : tactile + souris)
// Pas de wake word possible sur iOS → interaction "push-to-talk".
// ------------------------------------------------------------

let pressing = false;

async function onPressStart(ev) {
  ev.preventDefault();

  // Premier tap : débloque speechSynthesis (contrainte iOS) et la caméra
  if (firstTap) {
    firstTap = false;
    unlockSpeech();
    ensureCamera();
  }

  // Déblocage iOS du player YouTube : playVideo() + pauseVideo() dans le
  // geste utilisateur. Sans effet si déjà fait ; retenté à chaque tap tant
  // que le player n'était pas prêt au premier.
  unlockPlayer();

  if (!hasKeys()) {
    showConfig("Configurez vos clés API pour commencer.");
    return;
  }
  if (state !== "idle") {
    // On peut interrompre JARVIS pendant qu'il parle
    if (state === "speaking") stopSpeaking();
    else return;
  }

  pressing = true;
  try {
    // Démarre la dictée native (doit être appelé dans le geste utilisateur)
    await startDictation();
    // L'utilisateur a peut-être déjà relâché pendant le démarrage
    if (!pressing) {
      await stopDictation();
      return;
    }
    setState("listening");
  } catch (err) {
    pressing = false;
    showError(err.message);
    setState("idle");
  }
}

async function onPressEnd(ev) {
  ev.preventDefault();
  if (!pressing) return;
  pressing = false;

  if (state !== "listening") return;

  const userText = await stopDictation();

  // Une erreur de dictée (micro refusé, réseau...) prime sur le silence
  const dictErr = lastDictationError();
  if (dictErr) {
    showError(dictErr);
    setState("idle");
    return;
  }
  if (!userText) {
    showError("Je n'ai rien entendu. Maintenez le bouton en parlant.");
    setState("idle");
    return;
  }

  await processTurn(userText);
}

talkBtn.addEventListener("pointerdown", onPressStart);
talkBtn.addEventListener("pointerup", onPressEnd);
talkBtn.addEventListener("pointercancel", onPressEnd);
talkBtn.addEventListener("pointerleave", (ev) => {
  // Doigt qui glisse hors du bouton = fin d'enregistrement
  if (pressing) onPressEnd(ev);
});
// Bloque le menu contextuel (appui long iOS/desktop)
talkBtn.addEventListener("contextmenu", (ev) => ev.preventDefault());

// ------------------------------------------------------------
// Caméra : démarrée au premier geste (permission), non bloquante
// ------------------------------------------------------------

async function ensureCamera() {
  if (cameraStarted) return;
  try {
    await startCamera();
    cameraStarted = true;
  } catch (err) {
    // La vision est optionnelle : on masque le cadre et on informe
    videoFrame.classList.add("hidden");
    showError(err.message + " (la vision sera indisponible)");
  }
}

// ------------------------------------------------------------
// Connectivité
// ------------------------------------------------------------

window.addEventListener("offline", () => showError("Connexion internet perdue."));

// Erreurs asynchrones du module musique (vidéo non lisible, etc.)
window.addEventListener("music-error", (ev) => showError(ev.detail));

// Images trouvées par l'outil chercher_images → affichées dans le fil
window.addEventListener("show-images", (ev) => {
  addImagesMessage(ev.detail.query, ev.detail.images);
});
window.addEventListener("online", () => {
  errorBanner.classList.add("hidden");
});

// ------------------------------------------------------------
// Démarrage
// ------------------------------------------------------------

initConfigUI(() => {
  addMessage("system", "Clés enregistrées. Systèmes opérationnels.");
});

// Module musique : charge l'API IFrame YouTube et prépare le player caché
initMusic();

setState("idle");
addMessage("system", "J.A.R.V.I.S. initialisé. Maintenez l'orbe pour parler.");

// Premier lancement : demande les clés
if (!hasKeys()) {
  showConfig();
}
