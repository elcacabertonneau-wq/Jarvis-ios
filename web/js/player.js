// Lecteur multimédia : radio (flux audio) et YouTube (vidéo/musique).
const $ = (id) => document.getElementById(id);

// Un seul élément audio réutilisé : une fois « débloqué » par un geste, iOS le laisse jouer ensuite.
const audio = new Audio();
audio.preload = 'none';
// Courte piste WAV silencieuse générée à la volée (sert à débloquer l'audio sur iOS).
const SILENCE = (() => {
  const n = 800;
  const buf = new DataView(new ArrayBuffer(44 + n));
  const str = (o, t) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); buf.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
  buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
  buf.setUint32(24, 8000, true); buf.setUint32(28, 8000, true); buf.setUint16(32, 1, true); buf.setUint16(34, 8, true);
  str(36, 'data'); buf.setUint32(40, n, true);
  for (let i = 0; i < n; i++) buf.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(buf.buffer).forEach((b) => { bin += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(bin)}`;
})();

let volume = 0.7;
let queue = [];
let index = 0;
let kind = null; // 'radio' | 'yt'
let ytFrame = null;
let paused = false;
let onChange = () => {};
const videoFrames = new Set(); // vidéos affichées sur l'écran principal

export function initPlayer({ onStateChange } = {}) {
  onChange = onStateChange || onChange;
  $('dock-toggle').onclick = () => (paused ? resume() : pause());
  $('dock-next').onclick = () => next();
  $('dock-prev').onclick = () => prev();
  $('dock-close').onclick = () => stop();
  $('dock-min').onclick = () => minimizeDock();
  $('tray-music').onclick = () => restoreDock();
  $('dock-volume').oninput = (e) => setVolume(e.target.value / 100);
  audio.addEventListener('error', () => { if (kind === 'radio' && audio.src && audio.src !== SILENCE) next(true); });
  audio.addEventListener('playing', () => { paused = false; render(); });
}

export function unlockAudio() {
  if (audio.dataset.unlocked) return;
  audio.dataset.unlocked = '1';
  audio.src = SILENCE;
  audio.play().then(() => audio.pause()).catch(() => {});
}

function ytCommand(frame, func, args = []) {
  try { frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch { /* ignore */ }
}

export function ytEmbedURL(id, { autoplay = true } = {}) {
  const origin = encodeURIComponent(location.origin);
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=${autoplay ? 1 : 0}&playsinline=1&enablejsapi=1&rel=0&modestbranding=1&origin=${origin}`;
}

export function makeYTFrame(id) {
  const f = document.createElement('iframe');
  f.src = ytEmbedURL(id);
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  f.title = 'Lecteur YouTube';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  return f;
}

// Les vidéos de l'écran principal s'enregistrent pour recevoir pause/stop.
export function registerVideo(frame) {
  pauseDock();
  videoFrames.add(frame);
}
export function unregisterVideo(frame) { videoFrames.delete(frame); }

// Lecteur réduit : il continue de jouer, une pastille 🎵 dans la barre permet de le rouvrir.
let mini = false;
export function minimizeDock() { if (!kind) return false; mini = true; render(); return true; }
export function restoreDock() { if (!mini) return false; mini = false; render(); return true; }
export const isDockMini = () => mini;

function render() {
  const dock = $('dock');
  const item = queue[index];
  if (!kind) mini = false;
  dock.hidden = !kind;
  dock.classList.toggle('mini', mini);
  $('tray-music').hidden = !mini;
  $('tray-music').classList.toggle('paused', paused);
  $('tray-music-title').textContent = item ? (item.title || item.name) : 'Musique';
  const tray = $('tray');
  tray.hidden = !mini && !tray.querySelector('.tray-chip:not(.tray-music)');
  dock.classList.toggle('paused', paused);
  $('dock-toggle').innerHTML = paused
    ? '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  $('dock-toggle').title = paused ? 'Lecture' : 'Pause';
  if (item) {
    $('dock-title').textContent = item.title || item.name;
    $('dock-sub').textContent = kind === 'radio'
      ? `Radio · ${[item.country, (item.tags || '').split(',').slice(0, 3).join(', ')].filter(Boolean).join(' · ')}`
      : `YouTube · ${item.channel || ''}`;
  }
  onChange(nowPlaying());
}

export function nowPlaying() {
  const item = queue[index];
  if (!kind || !item) return '';
  return `${kind === 'radio' ? 'radio' : 'YouTube'} « ${item.title || item.name} »${paused ? ' (en pause)' : ''}`;
}

function playCurrent() {
  const item = queue[index];
  if (!item) return stop();
  paused = false;
  videoFrames.forEach((f) => ytCommand(f, 'pauseVideo'));
  if (kind === 'radio') {
    clearYT();
    audio.src = item.url;
    audio.volume = volume;
    audio.play().catch(() => { paused = true; render(); });
  } else {
    audio.pause();
    clearYT();
    ytFrame = makeYTFrame(item.id);
    const wrap = document.createElement('div');
    wrap.className = 'video-wrap';
    wrap.appendChild(ytFrame);
    $('dock-video').appendChild(wrap);
    ytFrame.addEventListener('load', () => ytCommand(ytFrame, 'setVolume', [Math.round(volume * 100)]));
  }
  render();
}

function clearYT() {
  $('dock-video').innerHTML = '';
  ytFrame = null;
}

export function playRadio(stations, start = 0) {
  queue = stations;
  index = start;
  kind = 'radio';
  playCurrent();
  return queue[index];
}

export function playYouTube(videos, start = 0) {
  queue = videos;
  index = start;
  kind = 'yt';
  playCurrent();
  return queue[index];
}

export function pauseDock() {
  if (!kind) return;
  if (kind === 'radio') audio.pause();
  else ytCommand(ytFrame, 'pauseVideo');
  paused = true;
  render();
}

export function pause() {
  pauseDock();
  videoFrames.forEach((f) => ytCommand(f, 'pauseVideo'));
}

export function resume() {
  if (!kind) {
    videoFrames.forEach((f) => ytCommand(f, 'playVideo'));
    return;
  }
  if (kind === 'radio') audio.play().catch(() => {});
  else ytCommand(ytFrame, 'playVideo');
  paused = false;
  render();
}

export function next(auto = false) {
  if (!kind || queue.length < 2) return false;
  index = (index + 1) % queue.length;
  if (auto && index === 0) return stop();
  playCurrent();
  return queue[index];
}

export function prev() {
  if (!kind || queue.length < 2) return;
  index = (index - 1 + queue.length) % queue.length;
  playCurrent();
}

export function stop() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  clearYT();
  videoFrames.forEach((f) => ytCommand(f, 'stopVideo'));
  kind = null;
  queue = [];
  paused = false;
  render();
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  audio.volume = volume;
  ytCommand(ytFrame, 'setVolume', [Math.round(volume * 100)]);
  videoFrames.forEach((f) => ytCommand(f, 'setVolume', [Math.round(volume * 100)]));
  $('dock-volume').value = Math.round(volume * 100);
}
export const getVolume = () => volume;

// Baisse le son pendant que Jarvis parle.
let ducked = null;
export function duck(on) {
  if (on && ducked === null && kind && !paused) {
    ducked = volume;
    const v = volume * 0.25;
    audio.volume = v;
    ytCommand(ytFrame, 'setVolume', [Math.round(v * 100)]);
  } else if (!on && ducked !== null) {
    audio.volume = ducked;
    ytCommand(ytFrame, 'setVolume', [Math.round(ducked * 100)]);
    ducked = null;
  }
}
