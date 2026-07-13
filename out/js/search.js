// ============================================================
// search.js — Recherche internet + recherche d'images (100 % front)
//
// - Recherche internet : via la "Live Search" de xAI — le paramètre
//   search_parameters de l'endpoint chat fait chercher Grok sur le
//   web CÔTÉ SERVEUR xAI. Même clé que le cerveau : AUCUNE clé
//   supplémentaire.
// - Recherche d'images : Google Custom Search API (searchType=image).
//   Réutilise la clé Google déjà créée pour YouTube (il suffit
//   d'activer "Custom Search API" dans le même projet) + un ID de
//   moteur (cx) créé sur programmablesearchengine.google.com.
//   Fonctionnalité OPTIONNELLE : sans cx, l'outil explique quoi faire.
// ============================================================

import { getXaiKey, getYouTubeKey, getCseId } from "./config.js";

const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
const CSE_URL = "https://www.googleapis.com/customsearch/v1";
// Modèle utilisé pour la recherche : rapide et économique suffit,
// c'est la recherche web qui fait le travail.
const SEARCH_MODEL = "grok-4-fast-non-reasoning";
const SEARCH_TIMEOUT_MS = 60000; // la recherche web peut prendre du temps

// ------------------------------------------------------------
// Recherche internet (outil recherche_internet)
// ------------------------------------------------------------

/**
 * Pose une question nécessitant le web à Grok avec la Live Search
 * activée : xAI cherche sur internet côté serveur et synthétise.
 * @param {string} question
 * @returns {Promise<string>} réponse factuelle courte, avec sources
 */
export async function webSearch(question) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(XAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getXaiKey(),
      },
      body: JSON.stringify({
        model: SEARCH_MODEL,
        // Live Search xAI : mode "on" force la recherche web serveur
        search_parameters: {
          mode: "on",
          return_citations: true,
        },
        messages: [
          {
            role: "system",
            content:
              "Tu es un assistant de recherche. Cherche sur le web et réponds " +
              "en français, en 2 à 4 phrases factuelles maximum. Cite la source " +
              "principale (nom du site) à la fin.",
          },
          { role: "user", content: question },
        ],
        max_tokens: 600,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (!navigator.onLine) throw new Error("Hors ligne : recherche internet impossible.");
    throw new Error(err.name === "AbortError" ? "Recherche trop longue, abandonnée." : "Erreur réseau pendant la recherche.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json())?.error?.message || ""; } catch { /* ignore */ }
    throw new Error("Erreur recherche " + response.status + (detail ? " : " + detail.slice(0, 150) : ""));
  }

  const data = await response.json();
  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) throw new Error("La recherche n'a rien donné.");
  return answer;
}

// ------------------------------------------------------------
// Recherche d'images (outil chercher_images)
// ------------------------------------------------------------

/**
 * Cherche des images via Google Custom Search (searchType=image).
 * @param {string} query
 * @param {number} [count=4] Nombre d'images souhaité (max 10)
 * @returns {Promise<Array<{url: string, thumbnail: string, title: string}>>}
 */
export async function imageSearch(query, count = 4) {
  const cx = getCseId();
  if (!cx) {
    throw new Error(
      "Recherche d'images non configurée : ajoutez l'ID du moteur Google (cx) " +
      "dans les réglages (icône engrenage)."
    );
  }

  const params = new URLSearchParams({
    key: getYouTubeKey(), // même clé Google que YouTube (Custom Search API activée)
    cx,
    q: query,
    searchType: "image",
    num: String(Math.min(10, Math.max(1, count))),
    safe: "active",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(CSE_URL + "?" + params, { signal: controller.signal });
  } catch (err) {
    if (!navigator.onLine) throw new Error("Hors ligne : recherche d'images impossible.");
    throw new Error(err.name === "AbortError" ? "Délai dépassé (images)." : "Erreur réseau (images).");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) {
      throw new Error(
        "Recherche d'images refusée (" + response.status + ") : vérifiez que " +
        "Custom Search API est activée sur votre clé Google et que l'ID de moteur est correct."
      );
    }
    throw new Error("Erreur Google Images " + response.status + ".");
  }

  const data = await response.json();
  return (data.items || []).map((item) => ({
    url: item.link,
    thumbnail: item.image?.thumbnailLink || item.link,
    title: item.title || "",
  }));
}
