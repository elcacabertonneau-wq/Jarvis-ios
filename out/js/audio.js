// ============================================================
// audio.js — Enregistrement micro (MediaRecorder) + synthèse vocale
//
// Contraintes iOS Safari :
//  - MediaRecorder ne supporte que audio/mp4 → test isTypeSupported()
//    avec fallback (webm pour les autres navigateurs).
//  - speechSynthesis doit être "débloqué" par un premier geste
//    utilisateur : on joue une utterance vide au premier tap.
// ============================================================

let mediaRecorder = null;
let micStream = null;
let chunks = [];
let recordingMimeType = "";

/**
 * Choisit le premier type MIME supporté par MediaRecorder.
 * audio/mp4 en premier : seul format supporté par Safari iOS.
 */
function pickMimeType() {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

/** Extension de fichier cohérente avec le type MIME (pour l'envoi à Groq). */
export function audioExtension() {
  if (recordingMimeType.includes("mp4")) return "mp4";
  if (recordingMimeType.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Démarre l'enregistrement micro.
 * @throws {Error} avec .code = "MIC_DENIED" | "MIC_UNAVAILABLE" | "NO_RECORDER"
 */
export async function startRecording() {
  if (typeof MediaRecorder === "undefined") {
    const e = new Error("MediaRecorder non supporté par ce navigateur.");
    e.code = "NO_RECORDER";
    throw e;
  }

  // Demande le micro (peut déclencher la pop-up de permission)
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const e = new Error(
      err.name === "NotAllowedError"
        ? "Accès au microphone refusé. Autorisez le micro dans Réglages > Safari."
        : "Microphone indisponible : " + err.message
    );
    e.code = err.name === "NotAllowedError" ? "MIC_DENIED" : "MIC_UNAVAILABLE";
    throw e;
  }

  recordingMimeType = pickMimeType();
  chunks = [];

  // Si aucun type n'est reconnu, on laisse le navigateur choisir (fallback)
  mediaRecorder = recordingMimeType
    ? new MediaRecorder(micStream, { mimeType: recordingMimeType })
    : new MediaRecorder(micStream);

  if (!recordingMimeType) recordingMimeType = mediaRecorder.mimeType || "audio/mp4";

  mediaRecorder.addEventListener("dataavailable", (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  });

  mediaRecorder.start();
}

/**
 * Arrête l'enregistrement et retourne le Blob audio.
 * @returns {Promise<Blob|null>} null si l'enregistrement était vide.
 */
export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      cleanupMic();
      resolve(null);
      return;
    }

    mediaRecorder.addEventListener(
      "stop",
      () => {
        const blob = chunks.length ? new Blob(chunks, { type: recordingMimeType }) : null;
        cleanupMic();
        resolve(blob);
      },
      { once: true }
    );

    mediaRecorder.stop();
  });
}

/** Libère le micro (l'indicateur orange d'iOS s'éteint). */
function cleanupMic() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  mediaRecorder = null;
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
