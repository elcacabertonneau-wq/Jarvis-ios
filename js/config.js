// ============================================================
// config.js — Gestion des clés API (localStorage uniquement)
// Aucune clé n'est jamais écrite en dur dans le code.
// Deux clés : Groq (transcription + cerveau) et YouTube (musique).
// ============================================================

const STORAGE_GROQ = "jarvis_groq_key";
const STORAGE_YOUTUBE = "jarvis_youtube_key";
const STORAGE_CSE_ID = "jarvis_cse_id"; // ID moteur Google (images) — optionnel

/** Retourne la clé Groq stockée, ou null. */
export function getGroqKey() {
  return localStorage.getItem(STORAGE_GROQ);
}

/** Retourne la clé YouTube stockée, ou null. */
export function getYouTubeKey() {
  return localStorage.getItem(STORAGE_YOUTUBE);
}

/** Retourne l'ID du moteur de recherche Google (cx), ou null. Optionnel. */
export function getCseId() {
  return localStorage.getItem(STORAGE_CSE_ID);
}

/** Vrai si les deux clés obligatoires sont présentes (le cx est optionnel). */
export function hasKeys() {
  return Boolean(getGroqKey() && getYouTubeKey());
}

/** Enregistre les clés (après trim). Le cx peut être vide. */
export function saveKeys(groqKey, youtubeKey, cseId) {
  localStorage.setItem(STORAGE_GROQ, groqKey.trim());
  localStorage.setItem(STORAGE_YOUTUBE, youtubeKey.trim());
  if (cseId && cseId.trim()) {
    localStorage.setItem(STORAGE_CSE_ID, cseId.trim());
  } else {
    localStorage.removeItem(STORAGE_CSE_ID);
  }
}

// ------------------------------------------------------------
// Écran de configuration (overlay HUD)
// ------------------------------------------------------------

const overlay = document.getElementById("config-overlay");
const msgBox = document.getElementById("config-msg");
const inputGroq = document.getElementById("key-groq");
const inputYouTube = document.getElementById("key-youtube");
const inputCseId = document.getElementById("key-cse");
const saveBtn = document.getElementById("config-save");

/**
 * Affiche l'écran de configuration.
 * @param {string} [message] Message d'erreur optionnel (ex: "Clé Groq invalide")
 */
export function showConfig(message) {
  // Pré-remplit avec les clés existantes pour permettre la correction
  inputGroq.value = getGroqKey() || "";
  inputYouTube.value = getYouTubeKey() || "";
  inputCseId.value = getCseId() || "";

  if (message) {
    msgBox.textContent = message;
    msgBox.classList.remove("hidden");
  } else {
    msgBox.classList.add("hidden");
  }
  overlay.classList.remove("hidden");
}

export function hideConfig() {
  overlay.classList.add("hidden");
}

/**
 * Initialise les interactions de l'écran de config.
 * @param {() => void} onSaved Rappel exécuté quand les clés sont validées.
 */
export function initConfigUI(onSaved) {
  // Boutons "œil" : bascule password <-> texte clair
  document.querySelectorAll(".eye-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      btn.classList.toggle("revealed", reveal);
    });
  });

  saveBtn.addEventListener("click", () => {
    const g = inputGroq.value.trim();
    const y = inputYouTube.value.trim();
    const cx = inputCseId.value.trim();

    // Validation minimale : Groq et YouTube obligatoires, cx optionnel
    if (!g || !y) {
      msgBox.textContent = "Les clés Groq et YouTube sont requises.";
      msgBox.classList.remove("hidden");
      return;
    }

    saveKeys(g, y, cx);
    hideConfig();
    onSaved();
  });

  // Icône engrenage : rouvre la config à tout moment
  document.getElementById("gear-btn").addEventListener("click", () => showConfig());
}
