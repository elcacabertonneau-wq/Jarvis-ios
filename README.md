# J.A.R.V.I.S — Assistant vocal 100 % front-end

Assistant vocal style Iron Man, entièrement côté navigateur : **aucun backend, aucune fonction serverless**. Déployable en statique sur Netlify et pensé pour **Safari sur iPad** (portrait).

- 🎙️ **Voix → texte** : Groq Whisper (`whisper-large-v3`, français)
- 🧠 **Cerveau** : Groq (Llama 4 Scout, tool use + vision), appels directs depuis le navigateur — **une seule clé pour la voix et l'intelligence**
- 🗣️ **Texte → voix** : `speechSynthesis` (voix fr-FR native)
- 👁️ **Vision** : outil `regarder_camera` (tool use) — le modèle décrit ce que voit la caméra frontale
- 🎵 **Musique** : YouTube (API IFrame + Data API v3) — « mets du Nekfeu », pause, suivant...
- 📺 **Vidéo** : « montre la vidéo » affiche le clip en grand panneau HUD (réductible)
- 🌐 **Recherche internet** : via Groq Compound (recherche web côté serveur Groq, aucune clé en plus)
- 🖼️ **Images** : « montre-moi des photos de... » affiche une grille d'images dans le fil (Google Custom Search, optionnel)

---

## ⚠️ Sécurité des clés API — À LIRE

> **Ne commitez JAMAIS une clé API dans ce dépôt.** Ni dans le code, ni dans un fichier de config, ni dans un commit "temporaire". Une clé poussée sur GitHub doit être considérée comme compromise et révoquée immédiatement.

Les clés sont saisies **au premier lancement** dans l'écran de configuration de l'app et stockées **uniquement dans le `localStorage` de votre navigateur**. Elles ne transitent que vers les API Groq et YouTube.

Conséquence assumée du "zéro backend" : toute personne ayant accès physique à votre iPad (ou à sa session Safari) peut lire ces clés. Utilisez des clés dédiées avec des limites de dépense, et révoquez-les au moindre doute.

---

## Obtenir les clés

| Clé | Où la créer | Remarques |
|---|---|---|
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) | Format `gsk_...`. Sert à la fois pour Whisper (voix → texte) et le modèle (Llama 4 Scout). Palier gratuit disponible. |
| `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com/) → créer un projet → activer **YouTube Data API v3** → Identifiants → Clé API | Format `AIza...`. Quota gratuit : 10 000 unités/jour (une recherche = 100 unités). |
| ID moteur Google *(optionnel, pour les images)* | 1. Dans le même projet Google Cloud, activer aussi **Custom Search API**. 2. Sur [programmablesearchengine.google.com](https://programmablesearchengine.google.com/) : créer un moteur, choisir **Rechercher sur l'ensemble du Web** et activer **Recherche d'images**. 3. Copier l'**ID du moteur** (`cx`). | La même clé `AIza...` sert pour YouTube et les images. 100 requêtes/jour gratuites. Sans cet ID, tout fonctionne sauf `chercher_images`. |

> 💡 **Sécurisez votre clé Google** : dans la console, ouvrez la clé → *Restrictions liées aux applications* → **Sites web** → ajoutez `https://votre-site.netlify.app/*` ; puis *Restrictions relatives aux API* → cochez uniquement **YouTube Data API v3** et **Custom Search API**. Même volée, la clé sera inutilisable ailleurs.

---

## Déploiement sur Netlify

Le site est 100 % statique : aucun build, aucune variable d'environnement à configurer.

### Option A — Glisser-déposer (le plus simple)

1. Allez sur [app.netlify.com/drop](https://app.netlify.com/drop)
2. Glissez le dossier du projet (celui qui contient `index.html`)
3. C'est en ligne. Notez l'URL `https://xxx.netlify.app`

### Option B — Depuis Git (mises à jour automatiques)

1. Poussez ce dépôt sur GitHub
2. Sur Netlify : **Add new site → Import an existing project** → choisissez le dépôt
3. Paramètres de build :
   - **Build command** : *(laisser vide)*
   - **Publish directory** : `.` (la racine)
4. Deploy. Chaque `git push` redéploiera le site.

> **HTTPS obligatoire** : le micro et la caméra (`getUserMedia`) ne fonctionnent que sur une origine sécurisée. Netlify fournit HTTPS par défaut — n'utilisez pas l'app en `http://`.

---

## Utilisation sur iPad (Safari)

1. Ouvrez l'URL Netlify dans Safari
2. Au premier lancement, saisissez vos deux clés API (Groq et YouTube) (icône 👁️ pour vérifier la saisie), puis **INITIALISER**
3. **Maintenez l'orbe central** pour parler, **relâchez** pour envoyer
4. Autorisez le micro et la caméra quand Safari le demande
5. Astuce : **Partager → Sur l'écran d'accueil** pour une expérience plein écran

L'icône ⚙️ en haut à droite rouvre la configuration à tout moment. En cas de clé invalide (erreur 401), l'écran de configuration se rouvre automatiquement avec un message explicite.

### Contraintes iOS respectées

- **Pas de wake word** (impossible sur iOS Safari) → bouton "push-to-talk" (appui long)
- **`audio/mp4`** pour MediaRecorder (seul format Safari iOS), testé via `isTypeSupported()` avec fallback `webm` pour les autres navigateurs
- **`speechSynthesis` débloqué** par une utterance vide jouée au tout premier tap
- **Caméra frontale** (`facingMode: "user"`), refus de permission géré proprement (la vision est alors désactivée, le reste fonctionne)

---

## Structure du projet

```
index.html        # Structure de la page (HUD)
css/style.css     # Style Iron Man : fond #050508, cyan #00d4ff, Space Mono
js/app.js         # Boucle principale + machine à états (idle/listening/thinking/speaking)
js/config.js      # Gestion des clés API (localStorage) + écran de config
js/audio.js       # MediaRecorder (micro) + speechSynthesis (voix)
js/vision.js      # Webcam + capture de frame (canvas → JPEG base64)
js/music.js       # Player YouTube caché + recherche + barre de lecture
js/api.js         # Appels directs Groq (Whisper + chat/outils), registre d'outils
```

## Musique YouTube

Trois outils sont exposés au modèle (registre dans `js/api.js`, logique dans `js/music.js`) :

| Outil | Exemple de phrase | Effet |
|---|---|---|
| `jouer_musique(recherche)` | « Mets du Nekfeu » | Recherche YouTube (5 résultats intégrables) puis lance le premier |
| `controler_lecture(action)` | « Mets pause », « morceau suivant » | `pause` / `reprendre` / `stop` / `suivant` |
| `info_lecture()` | « C'est quoi cette musique ? » | Renvoie le titre en cours |
| `afficher_video(action)` | « Montre la vidéo », « cache le clip » | Affiche le player en grand panneau HUD / le re-masque (bouton ▣ de la barre aussi) |

## Recherche internet et images

| Outil | Exemple de phrase | Effet |
|---|---|---|
| `recherche_internet(question)` | « Quel temps fera-t-il demain à Paris ? » | Le modèle Compound de Groq cherche sur le web côté serveur et renvoie une réponse sourcée — aucune clé supplémentaire |
| `chercher_images(recherche)` | « Montre-moi des photos d'aurores boréales » | Google Custom Search (images) → grille de 4 miniatures dans le fil de conversation. Nécessite l'ID moteur Google (optionnel) |

Comportements :

- Une barre de lecture HUD apparaît en bas (miniature, titre défilant, progression cyan, boutons play/pause/stop) et disparaît quand rien ne joue
- Vidéo non intégrable (erreurs 101/150) → passage automatique au résultat suivant
- Quand JARVIS parle, le volume de la musique descend à 20 %, puis remonte à 100 %

> ⚠️ **Restriction iOS, non contournable** : la lecture s'arrête si l'iPad est verrouillé ou si Safari passe en arrière-plan. C'est une limitation d'Apple sur la lecture média dans les pages web — aucune astuce front-end ne la contourne.

## Ajouter un nouvel outil (mails...)

Le registre d'outils est prêt à être étendu — la boucle de `tool_calls` dans `js/api.js` est générique. Deux étapes, dans `js/api.js` :

```js
// 1. Déclarer le schéma dans la constante TOOLS
export const TOOLS = [
  // ...outils existants...
  {
    name: "lire_mails",
    description: "Résume les derniers mails non lus de l'utilisateur.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "number", description: "Nombre de mails à lire" },
      },
      required: [],
    },
  },
];

// 2. Enregistrer le handler correspondant
registerTool("lire_mails", async (input) => {
  // ... votre implémentation ...
  return "Vous avez 3 mails non lus, Monsieur.";
});
```

Le handler retourne une chaîne, ou un objet `{ text, imageJpegBase64 }` quand le résultat inclut une image — c'est ainsi que fonctionne `regarder_camera` (l'image est renvoyée au modèle dans un message séparé, le format OpenAI n'acceptant que du texte dans les résultats d'outils).

## Gestion d'erreurs

Tous ces cas affichent un message clair à l'écran :

- Micro refusé ou indisponible
- Webcam refusée ou occupée par une autre app (la vision se désactive, le reste continue)
- Clé API invalide (401) → réouverture de l'écran de configuration
- Timeout API (45 s) et erreurs réseau
- Appareil hors ligne
- Enregistrement vide ou trop court
