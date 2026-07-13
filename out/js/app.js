// ============================================================
// app.js — Boucle principale + machine à états de JARVIS
//
// États (reflétés sur <body data-state> pour le CSS) :
//   idle      → en attente (orbe fixe)
//   listening → enregistrement en cours (pulsation)
//   thinking  → transcription + appel Claude (rotation)
//   speaking  → lecture de la réponse (ondes)
//
// Flux : appui long sur l'orbe → enregistrement → relâche →
// Groq Whisper → texte → Claude (avec outils) → affichage + voix.
// ============================================================

import { hasKeys, showConfig, initConfigUI } from "./config.js";
import { startRecording, stopRecording, audioExtension, unlockSpeech, speak, stopSpeaking } from "./audio.js";
import { startCamera } from "./vision.js";
import { transcribe, askClaude, ApiError } from "./api.js";

// --- Éléments du DOM ---
const talkBtn = document.getElementById("talk-btn");
const conversation = document.getElementById("conversation");
const statusText = document.getElementById("status-text");
const orbHint = document.getElementById("orb-hint");
const errorBanner = document.getElementById("error-banner");
const videoFrame = document.getElementById("video-frame");

// --- État global ---
let state = "idle";
let history = []; // historique de conversation envoyé à Claude
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
    const label = err.provider === "anthropic" ? "Clé Anthropic invalide" : "Clé Groq invalide";
    showConfig(label + ". Vérifiez-la puis réessayez.");
    return;
  }
  showError(err.message || "Erreur inconnue.");
}

// ------------------------------------------------------------
// Cœur du flux : un tour de conversation complet
// ------------------------------------------------------------

async function processTurn(audioBlob) {
  setState("thinking");

  try {
    // 1. Audio → texte (Groq Whisper)
    const userText = await transcribe(audioBlob, audioExtension());
    if (!userText) {
      showError("Je n'ai rien entendu. Parlez plus près du micro.");
      setState("idle");
      return;
    }
    addMessage("user", userText);

    // 2. Texte + historique → Claude (boucle d'outils générique dans api.js)
    const reply = await askClaude(history, userText, (toolName) => {
      statusText.textContent = "OUTIL : " + toolName.toUpperCase();
    });

    // 3. Mise à jour de l'historique (texte simple : les tours d'outils
    //    intermédiaires restent internes au tour courant)
    history.push({ role: "user", content: userText });
    history.push({ role: "assistant", content: reply || "..." });

    // Limite l'historique aux 20 derniers tours pour contenir les coûts
    if (history.length > 40) history = history.slice(-40);

    // 4. Affichage + lecture vocale
    const finalReply = reply || "Je n'ai pas de réponse, Monsieur.";
    addMessage("jarvis", finalReply);
    setState("speaking");
    await speak(finalReply);
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
    await startRecording();
    // L'utilisateur a peut-être déjà relâché pendant la demande de permission
    if (!pressing) {
      await stopRecording();
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

  const blob = await stopRecording();
  if (!blob || blob.size < 1000) {
    // Enregistrement trop court pour contenir de la parole
    showError("Enregistrement trop court. Maintenez le bouton en parlant.");
    setState("idle");
    return;
  }

  await processTurn(blob);
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
window.addEventListener("online", () => {
  errorBanner.classList.add("hidden");
});

// ------------------------------------------------------------
// Démarrage
// ------------------------------------------------------------

initConfigUI(() => {
  addMessage("system", "Clés enregistrées. Systèmes opérationnels.");
});

setState("idle");
addMessage("system", "J.A.R.V.I.S. initialisé. Maintenez l'orbe pour parler.");

// Premier lancement : demande les clés
if (!hasKeys()) {
  showConfig();
}
