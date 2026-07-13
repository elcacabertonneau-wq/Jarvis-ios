// ============================================================
// config.js — Gestion des clés API (localStorage uniquement)
// Aucune clé n'est jamais écrite en dur dans le code.
// ============================================================

const STORAGE_ANTHROPIC = "jarvis_anthropic_key";
const STORAGE_GROQ = "jarvis_groq_key";
const STORAGE_YOUTUBE = "jarvis_youtube_key";

/** Retourne la clé Anthropic stockée, ou null. */
export function getAnthropicKey() {
  return localStorage.getItem(STORAGE_ANTHROPIC);
}

/** Retourne la clé Groq stockée, ou null. */
export function getGroqKey() {
  return localStorage.getItem(STORAGE_GROQ);
}

/** Retourne la clé YouTube stockée, ou null. */
export function getYouTubeKey() {
  return localStorage.getItem(STORAGE_YOUTUBE);
}

/** Vrai si les trois clés sont présentes. */
export function hasKeys() {
  return Boolean(getAnthropicKey() && getGroqKey() && getYouTubeKey());
}

/** Enregistre les trois clés (après trim). */
export function saveKeys(anthropicKey, groqKey, youtubeKey) {
  localStorage.setItem(STORAGE_ANTHROPIC, anthropicKey.trim());
  localStorage.setItem(STORAGE_GROQ, groqKey.trim());
  localStorage.setItem(STORAGE_YOUTUBE, youtubeKey.trim());
}

// ------------------------------------------------------------
// Écran de configuration (overlay HUD)
// ------------------------------------------------------------

const overlay = document.getElementById("config-overlay");
const msgBox = document.getElementById("config-msg");
const inputAnthropic = document.getElementById("key-anthropic");
const inputGroq = document.getElementById("key-groq");
const inputYouTube = document.getElementById("key-youtube");
const saveBtn = document.getElementById("config-save");

/**
 * Affiche l'écran de configuration.
 * @param {string} [message] Message d'erreur optionnel (ex: "Clé Anthropic invalide")
 */
export function showConfig(message) {
  // Pré-remplit avec les clés existantes pour permettre la correction
  inputAnthropic.value = getAnthropicKey() || "";
  inputGroq.value = getGroqKey() || "";
  inputYouTube.value = getYouTubeKey() || "";

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
    const a = inputAnthropic.value.trim();
    const g = inputGroq.value.trim();
    const y = inputYouTube.value.trim();

    // Validation minimale : les trois champs doivent être remplis
    if (!a || !g || !y) {
      msgBox.textContent = "Les trois clés sont requises.";
      msgBox.classList.remove("hidden");
      return;
    }

    saveKeys(a, g, y);
    hideConfig();
    onSaved();
  });

  // Icône engrenage : rouvre la config à tout moment
  document.getElementById("gear-btn").addEventListener("click", () => showConfig());
}
