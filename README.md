# J.A.R.V.I.S — Assistant vocal 100 % front-end

Assistant vocal style Iron Man, entièrement côté navigateur : **aucun backend, aucune fonction serverless**. Déployable en statique sur Netlify et pensé pour **Safari sur iPad** (portrait).

- 🎙️ **Voix → texte** : Groq Whisper (`whisper-large-v3`, français)
- 🧠 **Cerveau** : API Claude (`claude-sonnet-4-6`), appels directs depuis le navigateur
- 🗣️ **Texte → voix** : `speechSynthesis` (voix fr-FR native)
- 👁️ **Vision** : outil `regarder_camera` (tool use) — Claude décrit ce que voit la caméra frontale

---

## ⚠️ Sécurité des clés API — À LIRE

> **Ne commitez JAMAIS une clé API dans ce dépôt.** Ni dans le code, ni dans un fichier de config, ni dans un commit "temporaire". Une clé poussée sur GitHub doit être considérée comme compromise et révoquée immédiatement.

Les clés sont saisies **au premier lancement** dans l'écran de configuration de l'app et stockées **uniquement dans le `localStorage` de votre navigateur**. Elles ne transitent que vers les API Anthropic et Groq.

Conséquence assumée du "zéro backend" : toute personne ayant accès physique à votre iPad (ou à sa session Safari) peut lire ces clés. Utilisez des clés dédiées avec des limites de dépense, et révoquez-les au moindre doute.

---

## Obtenir les clés

| Clé | Où la créer | Remarques |
|---|---|---|
| `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com/) → Settings → API Keys | Format `sk-ant-...`. Prévoir quelques crédits. |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) | Format `gsk_...`. Whisper y est très bon marché. |

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
2. Au premier lancement, saisissez vos deux clés API (icône 👁️ pour vérifier la saisie), puis **INITIALISER**
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
js/api.js         # Appels directs Claude + Groq, registre d'outils
```

## Ajouter un nouvel outil (mails, musique...)

Le registre d'outils est prêt à être étendu — la boucle de `tool_use` dans `js/api.js` est générique. Deux étapes, dans `js/api.js` :

```js
// 1. Déclarer le schéma dans la constante TOOLS
export const TOOLS = [
  // ...outils existants...
  {
    name: "jouer_musique",
    description: "Lance la lecture d'un morceau demandé par l'utilisateur.",
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Titre du morceau" },
      },
      required: ["titre"],
    },
  },
];

// 2. Enregistrer le handler correspondant
registerTool("jouer_musique", async (input) => {
  // ... votre implémentation ...
  return "Lecture de « " + input.titre + " » lancée.";
});
```

Le handler peut retourner une chaîne, ou un tableau de blocs de contenu (texte et/ou image) — c'est ainsi que fonctionne `regarder_camera`.

## Gestion d'erreurs

Tous ces cas affichent un message clair à l'écran :

- Micro refusé ou indisponible
- Webcam refusée ou occupée par une autre app (la vision se désactive, le reste continue)
- Clé API invalide (401) → réouverture de l'écran de configuration
- Timeout API (45 s) et erreurs réseau
- Appareil hors ligne
- Enregistrement vide ou trop court
