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

### Caméra et images
| Dites… | Effet |
|---|---|
| « Affiche ma caméra » (ou « … à gauche »), bouton 📷 en haut | Affiche la webcam dans une carte (se place comme les autres éléments) |
| « Qu'est-ce que tu vois ? », « étudie ce qu'il y a sur ma caméra », « qu'est-ce que je tiens ? », « lis ce texte » | Jarvis prend une image de la caméra et l'analyse |
| « Fais des recherches à partir de ma caméra » | Identifie ce qu'il voit puis lance fiche, images, vidéo ou récap |
| « Change de caméra », « ferme la caméra » | Caméra avant/arrière, arrêt |

Pour une image : bouton 📎 dans la barre de saisie, **glisser-déposer** sur la fenêtre, ou **Ctrl+V**. Puis « analyse cette image », « fais des recherches à partir de cette image », « trouve des images similaires », « lis le texte de cette image ». Jarvis peut aussi analyser une photo déjà affichée.

L'analyse d'image utilise une IA capable de voir : **Gemini** (clé gratuite) ou **Groq** (même clé gratuite, modèle d'images), ou Claude si sa clé est renseignée. L'image n'est envoyée qu'au moment d'une analyse.

### Réduire les fenêtres
Chaque carte a un bouton **—** qui la réduit dans une barre en bas (elle continue de fonctionner : vidéo, caméra, minuteur). Le lecteur de musique se réduit aussi en une pastille 🎵. Un clic sur une pastille la rouvre.

À la voix : « minimise tout », « réduis la musique », « range la vidéo », « rouvre la caméra », « réaffiche tout ».

### Placer les éléments à l'écran
Dites où vous voulez chaque élément : « fais des recherches sur les trous noirs et place un récap à droite, une photo à gauche et une vidéo en bas ». L'écran devient un tableau de bord organisé (positions : gauche, droite, haut, bas, centre et les 4 coins). Une commande simple accepte aussi une position : « montre des photos de chats à gauche ».

Ensuite, instantanément et sans IA :

| Dites… | Effet |
|---|---|
| « Mets la vidéo à gauche », « déplace le récap en haut à droite » | Déplace un élément (s'il y a déjà quelque chose à cet endroit, les deux s'échangent) |
| « Échange la photo et la vidéo » | Inverse deux éléments |
| « Remets tout normalement » | Revient à l'affichage empilé habituel |

Sur téléphone, les éléments restent empilés (l'écran est trop petit pour une grille).

### Parler longtemps
Jarvis attend un vrai silence (environ 1,5 seconde) avant d'envoyer votre demande : vous pouvez faire de longues phrases avec des pauses. Pendant que vous parlez, le texte reconnu s'affiche sous le réacteur. Un appui sur le micro pendant l'écoute envoie tout de suite ce qui a été dit.

### Plein écran
Bouton ⛶ en haut à droite, touche **F**, ou « mets en plein écran » / « quitte le plein écran ». La touche Échap en sort aussi. En plein écran, le curseur de la souris disparaît après 3 secondes d'immobilité. Le navigateur n'autorise le plein écran qu'après un clic ou une touche : si la commande vocale est refusée, Jarvis vous demande d'appuyer sur F. Non disponible sur iPhone (limite de Safari).

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
├── js/brain.js           IA (Groq / Gemini / Claude / Pollinations), vision, mémoire de conversation
├── js/camera.js          Caméra, capture, images envoyées
├── js/services.js        Images, Wikipédia, YouTube, radio, météo
├── js/player.js          Lecteur radio et YouTube
├── js/ui.js              Cartes, disposition libre, affichage en grand, galerie, visionneuse
├── js/markdown.js        Rendu Markdown sécurisé
├── sw.js                 Service worker (hors ligne)
└── manifest.webmanifest  Installation comme application
```

## Limites connues
- **Firefox** ne propose pas la reconnaissance vocale : utilisez Chrome, Edge ou Safari. Le clavier reste disponible partout.
- **iPhone** : l'écoute permanente s'interrompt quand l'écran se verrouille ou que l'app passe en arrière-plan (c'est une règle d'iOS). Une vidéo YouTube peut demander un appui sur ▶️ pour démarrer avec le son.
- Les services gratuits sans clé (Pollinations, instances Piped/Invidious) sont parfois saturés. Jarvis passe alors à la source suivante ou propose un lien.
