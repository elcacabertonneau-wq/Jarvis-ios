// Réglages persistés dans le navigateur (jamais envoyés ailleurs que chez le fournisseur choisi).
const KEY = 'jarvis.settings.v1';

export const defaults = {
  provider: 'auto',
  groqKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  claudeKey: '',
  claudeModel: 'claude-haiku-4-5',
  youtubeKey: '',
  lang: 'fr-FR',
  wakeName: 'jarvis',
  wakeMode: true, // écoute « Jarvis » en permanence par défaut
  voiceURI: '',
  rate: 1.05,
  pitch: 0.9,
  muted: false,
  idleReturn: 120, // secondes sans activité avant le retour à l'accueil (0 = jamais)
};

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

export const settings = load();

export function saveSettings(patch = {}) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
}
