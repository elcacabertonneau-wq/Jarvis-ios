# J.A.R.V.I.S. — assistant vocal personnel (gratuit)

Jarvis est une application web installable (PWA). Elle fonctionne sur **iPhone, Android, Windows, Mac et Linux** : on l'ouvre dans le navigateur, puis on l'ajoute à l'écran d'accueil comme une vraie app. Il n'y a ni App Store, ni compte développeur, ni serveur à payer.

## Ce qu'il sait faire

| Demande (à la voix ou au clavier) | Résultat |
|---|---|
| « Jarvis, montre-moi des images de la Tour Eiffel » | Galerie de photos (Openverse / Wikimedia), visionneuse plein écran |
| « Génère une image d'un dragon cyberpunk » | Image créée par IA (Pollinations, gratuit) |
| « Lance une vidéo sur les trous noirs » | Lecteur YouTube intégré et autres résultats |
| « Mets de la musique jazz » / « Mets du Daft Punk » | Radio par genre (Radio Browser, 30 000 stations) ou morceau via YouTube |
| « Étudie la photosynthèse » / « Explique-moi la relativité » | Fiche d'étude : résumé, points clés, tableau, quiz et réponses, images, sources Wikipédia |
| « C'est quoi un trou noir ? » | Réponse rapide avec image |
| « Quel temps fait-il à Lyon ? » | Météo actuelle et prévisions sur 5 jours (Open-Meteo) |
| « Minuteur de 5 minutes » | Compte à rebours avec alerte sonore et vocale |
| « Pause », « suivant », « plus fort », « stop » | Contrôle de la musique et des vidéos |
| Toute autre question | Conversation avec l'IA, réponse vocale et affichage en Markdown (listes, tableaux, code) |

### Tableaux récapitulatifs
Demandez un récap, un comparatif, un classement ou un planning (« fais-moi un récap des planètes géantes ») : Jarvis crée un tableau propre et l'affiche **en grand**. Vous pouvez ensuite changer sa disposition à la voix (instantané, sans IA) :

| Dites… | Effet |
|---|---|
| « Mets-le en cartes » / « en liste » / « en tableau » / « fais une comparaison » | Change la disposition (4 vues) |
| « Inverse les lignes et les colonnes » | Vue côte à côte |
| « Trie par prix », « classe selon la population décroissante », « ordre inverse » | Tri (on peut aussi cliquer sur un en-tête de colonne) |
| « Mets en évidence Saturne », « surligne la colonne prix » | Surligne une ligne ou une colonne |
| « Cache la colonne notes », « affiche toutes les colonnes » | Masque / réaffiche des colonnes |
| « Réduis », « agrandis », Échap | Passe de la vue en grand à la carte, et inversement |
| « Ferme le tableau », « réaffiche le tableau » | Ferme, ou rappelle le dernier tableau |

Pour changer le contenu (« ajoute une colonne prix »), Jarvis passe par l'IA, qui reçoit le tableau affiché. Toute carte (images, vidéo, fiche…) peut aussi s'afficher en grand avec le bouton ⤢ ou en disant « agrandis ».

### Retour automatique à l'accueil
Après 2 minutes sans activité, les recherches s'effacent en douceur et l'écran d'accueil revient. Les minuteurs en cours et les vidéos restent affichés. Le délai se règle dans **⚙️ Réglages → Écran** (1, 2 ou 5 minutes, ou jamais). « Reviens à l'accueil » le fait tout de suite.

### La voix
- **Appui sur le micro** (ou sur le cercle, ou la barre Espace sur ordinateur) : Jarvis écoute une commande.
- **Détection de « Jarvis » activée par défaut** : Jarvis écoute en continu et réagit dès qu'il entend son nom, soit en une phrase (« Jarvis, mets du jazz »), soit en deux temps (« Jarvis » → bip → « quelle heure est-il ? »). Les autres conversations sont ignorées. Après une réponse, il écoute encore quelques secondes pour la suite, sans qu'il faille redire « Jarvis ». Sur iPhone, il faut toucher l'écran une fois à l'ouverture (règle de Safari pour le micro). L'icône casque coupe ou réactive cette écoute.
- La musique baisse automatiquement quand Jarvis parle (sauf sur iPhone, où le volume ne peut pas être changé par une page web).
- La reconnaissance et la synthèse vocales sont celles du navigateur, donc gratuites et sans clé.

## Pourquoi c'est gratuit et rapide
- **Commandes locales instantanées** : images, vidéos, musique, météo, heure, minuteurs et contrôles sont reconnus directement dans l'app, sans passer par une IA. La réponse est immédiate et ne consomme aucun quota.
- **Cerveau IA gratuit, avec relais automatique** : Groq (clé gratuite, parmi les IA les plus rapides) → Gemini (clé gratuite) → Pollinations (sans clé, peu fiable). Claude peut s'ajouter en option avec une clé API payante.
- **Aucun serveur** : l'app est un ensemble de fichiers statiques hébergés gratuitement sur GitHub Pages, et les clés restent dans votre navigateur.
- **Démarrage instantané et mode hors ligne** grâce au service worker.
- **Cache** des recherches, et interrogation de plusieurs sources vidéo en parallèle (la plus rapide répond).

## Mise en ligne (5 minutes, gratuit)

1. Fusionnez cette branche dans la branche par défaut du dépôt.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
3. Le workflow `Déployer Jarvis` publie l'app à l'adresse `https://<votre-pseudo>.github.io/<nom-du-repo>/`. Relancez-le depuis l'onglet **Actions** s'il a échoué avant l'étape 2.

### Installer sur iPhone
Ouvrez l'adresse dans **Safari** → bouton Partager → **« Sur l'écran d'accueil »**. Au premier appui sur le micro, autorisez le microphone et la reconnaissance vocale.

### Installer sur Android / Windows / Mac
Ouvrez l'adresse dans **Chrome ou Edge** → menu → **« Installer l'application »**.

## Activer le cerveau IA (gratuit)
1. Allez sur <https://console.groq.com/keys> et connectez-vous avec Google (gratuit, sans carte bancaire).
2. « Create API Key », puis copiez la clé.
3. Collez-la dans la carte « Activer mon intelligence » qui s'affiche au démarrage, ou dans **⚙️ Réglages**.

En option : une clé Gemini (<https://aistudio.google.com/apikey>, gratuite) sert de relais si Groq atteint son quota. Une clé YouTube Data API (gratuite) rend la recherche vidéo plus fiable.

> **Et Claude ?** L'abonnement claude.ai (Pro/Max) ne donne pas accès à l'API : il ne peut donc pas servir de cerveau à une app tierce. Pour utiliser Claude, il faut une clé API facturée à l'usage sur <https://console.anthropic.com>. Elle se colle dans les réglages ; le modèle Haiku est rapide et peu coûteux.

## Lancer en local
```bash
cd web
python3 -m http.server 8080
# puis ouvrir http://localhost:8080 (Chrome ou Edge conseillés pour le micro)
```
Le micro ne fonctionne qu'en `https://` ou sur `localhost`.

## Structure
```
web/
├── index.html            Interface
├── css/style.css         Style holographique, adapté au mobile
├── js/app.js             Orchestrateur : commandes → actions → affichage et voix
├── js/voice.js           Reconnaissance vocale, mot d'activation, synthèse vocale
├── js/intents.js         Commandes reconnues localement (sans IA)
├── js/tables.js          Tableaux récapitulatifs : 4 dispositions, tri, mise en évidence
├── js/brain.js           IA (Groq / Gemini / Claude / Pollinations), mémoire de conversation
├── js/services.js        Images, Wikipédia, YouTube, radio, météo
├── js/player.js          Lecteur radio et YouTube
├── js/ui.js              Cartes, galerie, visionneuse
├── js/markdown.js        Rendu Markdown sécurisé
├── sw.js                 Service worker (hors ligne)
└── manifest.webmanifest  Installation comme application
```

## Limites connues
- **Firefox** ne propose pas la reconnaissance vocale : utilisez Chrome, Edge ou Safari. Le clavier reste disponible partout.
- **iPhone** : l'écoute permanente s'interrompt quand l'écran se verrouille ou que l'app passe en arrière-plan (c'est une règle d'iOS). Une vidéo YouTube peut demander un appui sur ▶️ pour démarrer avec le son.
- Les services gratuits sans clé (Pollinations, instances Piped/Invidious) sont parfois saturés. Jarvis passe alors à la source suivante ou propose un lien.
