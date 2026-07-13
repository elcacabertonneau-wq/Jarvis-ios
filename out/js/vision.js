// ============================================================
// vision.js — Webcam (caméra frontale) + capture d'image
//
// La caméra est demandée avec facingMode: "user" (frontale).
// captureFrame() dessine la frame courante du <video> sur un
// <canvas> et retourne le JPEG encodé en base64 (sans préfixe
// data:), prêt pour un contenu image_url (format OpenAI/Groq).
// ============================================================

const video = document.getElementById("camera");
let cameraStream = null;

/** Vrai si la caméra est active et produit des images. */
export function isCameraReady() {
  return Boolean(cameraStream) && video.readyState >= 2 && video.videoWidth > 0;
}

/**
 * Démarre la caméra frontale.
 * @throws {Error} avec .code = "CAM_DENIED" | "CAM_BUSY" | "CAM_UNAVAILABLE"
 */
export async function startCamera() {
  if (cameraStream) return; // déjà démarrée

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
  } catch (err) {
    let message, code;
    switch (err.name) {
      case "NotAllowedError":
        message = "Accès à la caméra refusé. Autorisez la caméra dans Réglages > Safari.";
        code = "CAM_DENIED";
        break;
      case "NotReadableError":
      case "AbortError":
        message = "Caméra occupée par une autre application.";
        code = "CAM_BUSY";
        break;
      default:
        message = "Caméra indisponible : " + err.message;
        code = "CAM_UNAVAILABLE";
    }
    const e = new Error(message);
    e.code = code;
    throw e;
  }

  video.srcObject = cameraStream;
  await video.play().catch(() => {}); // autoplay muted : toléré par iOS

  // Masque le cadre vidéo si la caméra n'a pas pu démarrer
  document.getElementById("video-frame").classList.remove("hidden");
}

/** Arrête la caméra et libère le matériel. */
export function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
    video.srcObject = null;
  }
}

/**
 * Capture la frame courante de la vidéo.
 * @returns {string} JPEG encodé base64, SANS le préfixe "data:image/jpeg;base64,"
 * @throws {Error} si la caméra n'est pas prête
 */
export function captureFrame() {
  if (!isCameraReady()) {
    const e = new Error("La caméra n'est pas active.");
    e.code = "CAM_NOT_READY";
    throw e;
  }

  // Largeur plafonnée à 1024 px : suffisant pour le modèle, économise des tokens
  const maxWidth = 1024;
  const scale = Math.min(1, maxWidth / video.videoWidth);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // toDataURL retourne "data:image/jpeg;base64,XXXX" → on garde XXXX
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return dataUrl.split(",")[1];
}
