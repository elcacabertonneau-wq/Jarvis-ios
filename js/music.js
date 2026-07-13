// ============================================================
// music.js — Lecture de musique YouTube (100 % front-end)
//
// - Charge l'API IFrame YouTube et crée un player caché (1x1 px)
//   mais bien présent dans le DOM.
// - Critique iOS : le player doit être "débloqué" lors d'un geste
//   utilisateur (playVideo() puis pauseVideo() immédiatement).
//   Sans cela, iOS refuse ensuite toute lecture programmatique.
// - La recherche appelle directement l'API YouTube Data v3 avec
//   la clé stockée en localStorage.
// - Vidéo non intégrable (erreurs 101/150) → passage automatique
//   au résultat suivant parmi les 5 récupérés.
//
// Communication avec app.js : les erreurs asynchrones (survenues
// après le retour de l'outil) sont émises via un CustomEvent
// "music-error" sur window, pour rester découplé.
// ============================================================

import { getYouTubeKey, showConfig } from "./config.js";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const SEARCH_TIMEOUT_MS = 15000;

// --- État du lecteur ---
let player = null;        // instance YT.Player
let playerReady = false;  // onReady reçu
let unlocked = false;     // déblocage iOS effectué
let pendingItem = null;   // piste à lancer dès que le player est prêt

let queue = [];           // les 5 résultats de la dernière recherche
let queueIndex = 0;       // position dans la file
let currentTitle = "";    // titre en cours de lecture ("" = rien)

let progressTimer = null;

// --- Éléments de la barre de lecture ---
const bar = document.getElementById("player-bar");
const barThumb = document.getElementById("pb-thumb");
const barTitle = document.getElementById("pb-title");
const barProgress = document.getElementById("pb-progress");
const barToggle = document.getElementById("pb-toggle");
const barStop = document.getElementById("pb-stop");

// ------------------------------------------------------------
// Chargement de l'API IFrame + création du player caché
// ------------------------------------------------------------

/**
 * Initialise le module : injecte l'API IFrame YouTube, prépare le
 * conteneur caché du player et câble la barre de lecture.
 * À appeler une seule fois au démarrage de l'app.
 */
export function initMusic() {
  // Conteneur du player : 1x1 px, quasi invisible, mais dans le DOM
  // (exigence de l'API IFrame et des règles de lecture iOS)
  const holder = document.createElement("div");
  holder.id = "yt-holder";
  holder.innerHTML = '<div id="yt-player"></div>';
  document.body.appendChild(holder);

  // Rappel global exigé par l'API IFrame YouTube
  window.onYouTubeIframeAPIReady = createPlayer;

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.onerror = () => emitError("Impossible de charger le player YouTube (réseau ?).");
  document.head.appendChild(script);

  // Boutons de la barre de lecture
  barToggle.addEventListener("click", () => {
    if (!playerReady) return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  });
  barStop.addEventListener("click", () => stopMusic());
}

/** Crée le player YouTube caché (appelé quand l'API IFrame est prête). */
function createPlayer() {
  player = new YT.Player("yt-player", {
    width: "1",
    height: "1",
    playerVars: {
      playsinline: 1, // pas de plein écran forcé sur iOS
      controls: 0,
      disablekb: 1,
    },
    events: {
      onReady: () => {
        playerReady = true;
        // Une lecture était en attente pendant le chargement ? On la lance.
        if (pendingItem) {
          const item = pendingItem;
          pendingItem = null;
          startItem(item);
        }
      },
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
}

/**
 * Déblocage iOS : à appeler dans le gestionnaire d'un geste
 * utilisateur (le premier tap sur le bouton micro). playVideo()
 * puis pauseVideo() immédiatement "autorise" les lectures
 * programmatiques futures. Sans effet si déjà débloqué ou si le
 * player n'est pas encore prêt (on réessaie au tap suivant).
 */
export function unlockPlayer() {
  if (unlocked || !playerReady) return;
  try {
    player.playVideo();
    player.pauseVideo();
    unlocked = true;
  } catch {
    /* le prochain tap retentera */
  }
}

// ------------------------------------------------------------
// Recherche YouTube Data API v3 (appel direct depuis le front)
// ------------------------------------------------------------

/** Décode les entités HTML des titres renvoyés par l'API (&amp;#39; etc.). */
function decodeEntities(text) {
  const area = document.createElement("textarea");
  area.innerHTML = text;
  return area.value;
}

/**
 * Cherche jusqu'à 5 vidéos intégrables correspondant à la requête.
 * @param {string} query
 * @returns {Promise<Array<{videoId: string, title: string, thumbnail: string}>>}
 */
async function searchVideos(query) {
  const key = getYouTubeKey();
  if (!key) {
    showConfig("Clé YouTube manquante. Ajoutez-la pour utiliser la musique.");
    throw new Error("Clé YouTube manquante.");
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: "5",
    q: query,
    key,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(SEARCH_URL + "?" + params, { signal: controller.signal });
  } catch (err) {
    if (!navigator.onLine) throw new Error("Hors ligne : recherche YouTube impossible.");
    throw new Error(err.name === "AbortError" ? "Délai dépassé (YouTube)." : "Erreur réseau (YouTube).");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 400 = clé mal formée, 403 = clé invalide/quota dépassé
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      showConfig("Clé YouTube invalide ou quota dépassé. Vérifiez-la puis réessayez.");
      throw new Error("Clé YouTube invalide ou quota dépassé.");
    }
    throw new Error("Erreur YouTube " + response.status + ".");
  }

  const data = await response.json();
  return (data.items || [])
    .filter((item) => item.id && item.id.videoId)
    .map((item) => ({
      videoId: item.id.videoId,
      title: decodeEntities(item.snippet.title),
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
    }));
}

// ------------------------------------------------------------
// Lecture
// ------------------------------------------------------------

/**
 * Cherche puis lance la lecture du premier résultat.
 * (Utilisé par l'outil jouer_musique.)
 * @param {string} query Ex : "du Nekfeu"
 * @returns {Promise<string>} message de confirmation pour le modèle
 */
export async function playSearch(query) {
  const results = await searchVideos(query);
  if (!results.length) {
    throw new Error("Aucun résultat YouTube pour « " + query + " ».");
  }

  queue = results;
  queueIndex = 0;
  startItem(queue[0]);

  return "Lecture de « " + queue[0].title + " » lancée.";
}

/** Charge et joue un élément de la file (ou le met en attente du player). */
function startItem(item) {
  currentTitle = item.title;
  barThumb.src = item.thumbnail;
  barThumb.alt = item.title;
  barTitle.textContent = item.title + "   •   ";
  barProgress.style.width = "0%";

  if (!playerReady) {
    pendingItem = item; // sera lancé dans onReady
    return;
  }
  player.loadVideoById(item.videoId);
}

/** Passe au résultat suivant de la file. @returns {string} message */
function playNext() {
  queueIndex++;
  if (queueIndex >= queue.length) {
    stopMusic();
    return "Fin de la liste de lecture.";
  }
  startItem(queue[queueIndex]);
  return "Lecture de « " + queue[queueIndex].title + " ».";
}

/** Arrête tout et masque la barre. */
export function stopMusic() {
  if (playerReady) {
    try { player.stopVideo(); } catch { /* player peut-être détruit */ }
  }
  currentTitle = "";
  pendingItem = null;
  hideBar();
}

/**
 * Contrôle de la lecture (outil controler_lecture).
 * @param {"pause"|"reprendre"|"stop"|"suivant"} action
 * @returns {string} message de confirmation pour le modèle
 */
export function controlPlayback(action) {
  if (!currentTitle && action !== "stop") {
    throw new Error("Aucune lecture en cours.");
  }
  switch (action) {
    case "pause":
      player.pauseVideo();
      return "Lecture en pause.";
    case "reprendre":
      player.playVideo();
      return "Lecture reprise.";
    case "stop":
      stopMusic();
      return "Lecture arrêtée.";
    case "suivant":
      return playNext();
    default:
      throw new Error("Action inconnue : " + action);
  }
}

/**
 * Titre en cours (outil info_lecture).
 * @returns {string|null} null si rien ne joue
 */
export function getNowPlaying() {
  return currentTitle || null;
}

// ------------------------------------------------------------
// Volume : baissé quand JARVIS parle, remonté ensuite
// (NB : sur iOS, le volume logiciel peut être ignoré par le
// système — restriction Apple, sans effet ailleurs.)
// ------------------------------------------------------------

export function duckVolume() {
  if (playerReady) {
    try { player.setVolume(20); } catch { /* ignore */ }
  }
}

export function restoreVolume() {
  if (playerReady) {
    try { player.setVolume(100); } catch { /* ignore */ }
  }
}

// ------------------------------------------------------------
// Événements du player
// ------------------------------------------------------------

function onPlayerStateChange(event) {
  const S = YT.PlayerState;
  switch (event.data) {
    case S.PLAYING:
      showBar();
      barToggle.textContent = "❚❚";
      startProgress();
      break;
    case S.PAUSED:
      barToggle.textContent = "▶";
      stopProgress();
      break;
    case S.ENDED:
      // Fin naturelle du morceau : on masque la barre
      stopProgress();
      currentTitle = "";
      hideBar();
      break;
  }
}

/**
 * Erreurs du player. 101/150 = vidéo non intégrable (embed refusé
 * par l'ayant droit), 100 = vidéo introuvable → on tente
 * automatiquement le résultat suivant parmi les 5 récupérés.
 */
function onPlayerError(event) {
  if ([100, 101, 150].includes(event.data)) {
    const msg = playNext();
    if (msg.startsWith("Fin")) {
      emitError("Aucune vidéo lisible parmi les résultats. Essayez une autre recherche.");
    }
  } else {
    emitError("Erreur du player YouTube (code " + event.data + ").");
    stopMusic();
  }
}

/** Émet une erreur asynchrone vers app.js (bandeau d'erreur). */
function emitError(message) {
  window.dispatchEvent(new CustomEvent("music-error", { detail: message }));
}

// ------------------------------------------------------------
// Barre de lecture (UI)
// ------------------------------------------------------------

function showBar() {
  if (bar.classList.contains("hidden")) {
    bar.classList.remove("hidden");
    // Redéclenche l'animation slide-up
    bar.classList.remove("slide-in");
    void bar.offsetWidth; // force le reflow
    bar.classList.add("slide-in");
  }
}

function hideBar() {
  bar.classList.add("hidden");
  stopProgress();
  barProgress.style.width = "0%";
}

function startProgress() {
  stopProgress();
  progressTimer = setInterval(() => {
    if (!playerReady) return;
    const duration = player.getDuration();
    if (!duration) return;
    const pct = (player.getCurrentTime() / duration) * 100;
    barProgress.style.width = Math.min(100, pct).toFixed(1) + "%";
  }, 500);
}

function stopProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
}
