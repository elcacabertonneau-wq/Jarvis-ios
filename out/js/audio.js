// ============================================================
// audio.js — Dictée (Web Speech API) + synthèse vocale
//
// Voix → texte : SpeechRecognition (webkitSpeechRecognition sur
// Safari iOS = reconnaissance Siri, native et gratuite — aucune
// clé API nécessaire). Appui long = écoute, relâche = texte final.
//
// Contraintes iOS Safari :
//  - SpeechRecognition doit être démarré dans un geste utilisateur
//    (c'est le cas : pointerdown sur l'orbe).
//  - speechSynthesis doit être "débloqué" par un premier tap :
//    on joue une utterance vide au tout premier geste.
// ============================================================

// ------------------------------------------------------------
// Dictée (voix → texte)
// ------------------------------------------------------------

let recognition = null;
let finalText = "";     // segments définitifs accumulés
let interimText = "";   // dernier segment provisoire
let dictationError = ""; // code d'erreur SpeechRecognition éventuel
let endResolve = null;  // résolution de la promesse de stopDictation

/** Vrai si le navigateur propose la reconnaissance vocale. */
export function isDictationSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Démarre la dictée. À appeler dans un geste utilisateur (appui sur l'orbe).
 * @returns {Promise<void>} résolue quand l'écoute a effectivement démarré
 * @throws {Error} avec .code = "NO_SR" si non supporté
 */
export function startDictation() {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const e = new Error(
        "La reconnaissance vocale n'est pas supportée par ce navigateur. " +
        "Utilisez Safari (iOS 14.5+) ou Chrome."
      );
      e.code = "NO_SR";
      reject(e);
      return;
    }

    recognition = new SR();
    recognition.lang = "fr-FR";
    recognition.continuous = true;     // ne s'arrête pas à la première pause
    recognition.interimResults = true; // on garde aussi le provisoire

    finalText = "";
    interimText = "";
    dictationError = "";

    recognition.addEventListener("result", (ev) => {
      interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalText += res[0].transcript + " ";
        else interimText += res[0].transcript;
      }
    });

    recognition.addEventListener("error", (ev) => {
      // "no-speech" et "aborted" sont des cas normaux (silence, relâche rapide)
      if (ev.error !== "no-speech" && ev.error !== "aborted") {
        dictationError = ev.error;
      }
    });

    recognition.addEventListener("end", () => {
      // Fin de session (après stop() ou coupure) : on rend le texte cumulé
      if (endResolve) {
        const r = endResolve;
        endResolve = null;
        r((finalText + " " + interimText).trim());
      }
    });

    recognition.addEventListener("start", () => resolve(), { once: true });

    try {
      recognition.start();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Arrête la dictée et retourne le texte reconnu.
 * @returns {Promise<string>} texte final (peut être vide)
 */
export function stopDictation() {
  return new Promise((resolve) => {
    if (!recognition) {
      resolve("");
      return;
    }
    endResolve = resolve;
    try {
      recognition.stop();
    } catch {
      /* déjà arrêté */
    }
    // Garde-fou : si l'événement "end" n'arrive pas (bug navigateur),
    // on résout quand même avec ce qu'on a après 3 secondes.
    setTimeout(() => {
      if (endResolve) {
        const r = endResolve;
        endResolve = null;
        r((finalText + " " + interimText).trim());
      }
    }, 3000);
  });
}

/**
 * Retourne l'erreur de la dernière session de dictée, traduite
 * en message utilisateur, ou "" si tout s'est bien passé.
 */
export function lastDictationError() {
  switch (dictationError) {
    case "":
      return "";
    case "not-allowed":
    case "service-not-allowed":
      return "Accès au microphone refusé. Autorisez le micro dans Réglages > Safari.";
    case "network":
      return "La reconnaissance vocale a besoin d'internet.";
    case "audio-capture":
      return "Microphone indisponible.";
    default:
      return "Erreur de reconnaissance vocale : " + dictationError;
  }
}

// ------------------------------------------------------------
// Synthèse vocale (speechSynthesis)
// ------------------------------------------------------------

let synthUnlocked = false;
let frenchVoice = null;

/** Cherche une voix fr-FR (les voix chargent parfois en différé sur Safari). */
function findFrenchVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "fr-FR" && v.localService) ||
    voices.find((v) => v.lang === "fr-FR") ||
    voices.find((v) => v.lang.startsWith("fr")) ||
    null
  );
}

if ("speechSynthesis" in window) {
  frenchVoice = findFrenchVoice();
  speechSynthesis.addEventListener("voiceschanged", () => {
    frenchVoice = findFrenchVoice();
  });
}

/**
 * Débloque speechSynthesis sur iOS : à appeler dans le gestionnaire
 * du TOUT PREMIER geste utilisateur (tap). Joue une utterance vide.
 */
export function unlockSpeech() {
  if (synthUnlocked || !("speechSynthesis" in window)) return;
  const empty = new SpeechSynthesisUtterance("");
  empty.volume = 0;
  speechSynthesis.speak(empty);
  synthUnlocked = true;
}

/**
 * Lit un texte à voix haute en français.
 * @param {string} text
 * @returns {Promise<void>} résolue à la fin de la lecture (ou immédiatement si non supporté)
 */
export function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) {
      resolve();
      return;
    }

    // Coupe une éventuelle lecture en cours
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    if (frenchVoice) utterance.voice = frenchVoice;
    utterance.rate = 1.0;
    utterance.pitch = 0.95; // ton légèrement posé

    utterance.addEventListener("end", resolve);
    utterance.addEventListener("error", resolve); // ne bloque jamais l'UI

    speechSynthesis.speak(utterance);
  });
}

/** Interrompt la lecture en cours. */
export function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
