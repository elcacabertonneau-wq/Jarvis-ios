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

L'analyse d'image utilise une IA capable de voir : **Gemini** (clé gratuite) ou **Groq** (même clé gratuite, modèle d'images), ou Claude si sa clé est renseignée. Jarvis choisit automatiquement un modèle encore en service parmi ceux que votre clé propose (les fournisseurs en arrêtent régulièrement) et, en cas d'échec, affiche la raison (clé refusée, quota atteint…). L'image n'est envoyée qu'au moment d'une analyse.

### Réalité augmentée : hologrammes 3D contrôlés avec les doigts
Jarvis projette des maquettes 3D, des plans et des images **par-dessus l'image de votre caméra**, et vous les manipulez **avec vos mains** devant la caméra (suivi des mains MediaPipe, directement dans le navigateur, rien n'est envoyé en ligne).

Jarvis choisit tout seul la meilleure source 3D pour chaque demande :

| Dites… | Effet |
|---|---|
| « Montre-moi le plan de New York en 3D », « projette Tokyo », « carte de Rome » | **Vraie carte 3D** de la ville (OpenStreetMap) : immeubles en relief, rues, noms |
| « Itinéraire de la tour Eiffel au Louvre à pied », « comment aller à la gare ? » | **Itinéraire complet** : durée, distance, étapes détaillées, infos pratiques de l'IA (transports en commun, prix, lieux à voir, conseils), tracé lumineux sur la carte 3D, **survol animé** du trajet, liens Plans / Google Maps |
| « Projette une Ferrari F40 », « un cœur humain », « un T-rex », « une maquette de la tour Eiffel » | **Vrai modèle 3D** parmi des millions de modèles gratuits (Sketchfab) ; « autre modèle » pour en voir un autre |
| « Projette une molécule de caféine », « le plan d'un appartement T3 » | Maquette construite par l'IA (formes, étiquettes, animations) |
| Envoyez la photo d'un plan (📎), puis « projette ce plan en 3D » | L'IA lit le plan (pièces, cotes) et le reconstruit en maquette |
| « Projette des photos de la tour Eiffel », « projette cette image » | Images en panneau flottant ou en carrousel (seulement si vous demandez des photos) |
| « Projette le système solaire / un atome / l'ADN » | Maquettes intégrées, instantanées et sans IA |
| Envoyez un fichier **.glb** (📎 ou glisser-déposer) | Votre propre modèle 3D, avec ses animations |

Les itinéraires fonctionnent à pied, à vélo et en voiture. « La gare », « une pharmacie », « l'hôpital » désignent le plus proche. Sans point de départ, Jarvis part de votre position.

**Gestes** (main devant la caméra) :
- 🤏 **pincer** (pouce + index) et glisser : faire tourner l'hologramme (il continue sur sa lancée quand on relâche) ;
- ✊ **poing fermé** : saisir et déplacer ; approcher la main de la caméra rapproche l'hologramme ;
- 🤏🤏 **pincer avec les deux mains** : écarter pour agrandir, rapprocher pour réduire, tourner les mains pour faire pivoter.

Au toucher : un doigt pour tourner, deux doigts pour zoomer et déplacer ; à la souris : glisser, molette, clic droit pour déplacer, double-clic pour recentrer.

À la voix, pendant la projection (instantané) : « plus grand », « plus petit », « vue de dessus / de face / de côté », « tourne-le vers la gauche », « fais-le tourner », « arrête de tourner », « mode hologramme » (effet holographique bleu, aussi sur les cartes), « couleurs réelles », « recentre », « autre modèle », « survole le trajet », « change de caméra », « ferme la réalité augmentée ». Sur une carte : un doigt fait glisser, deux doigts zooment et pivotent ; avec la main, pincer fait tourner et incliner, le poing déplace. Les fiches d'étude, images et créations ont aussi un bouton 🥽.

Sur téléphone, la caméra arrière est utilisée par défaut (posez le téléphone ou tenez-le d'une main et manipulez de l'autre) ; sur ordinateur, la webcam. Sans caméra, l'hologramme s'affiche sur fond sombre. Le moteur 3D (Three.js) et le suivi des mains ne sont téléchargés qu'à la première ouverture.

### Dessin dans l'air
« Mode dessin », « je veux dessiner » ou le bouton ✏️ en haut : la caméra s'ouvre et vous **tracez avec l'index** devant elle, en traits lumineux.
- ☝️ **Index levé seul** : le bout du doigt dessine.
- ✋ **Main ouverte** (ou ✌️ deux doigts) : le crayon se lève, pour passer à un autre trait.
- Vous pouvez aussi dessiner au doigt sur l'écran ou à la souris.

À la voix : « en rouge », « change de couleur », « annule », « efface », « ferme le dessin ». Puis demandez ce que vous voulez en faire, et Jarvis regarde votre croquis (IA capable de voir, clé Groq ou Gemini) :
| Dites… | Effet |
|---|---|
| « Transforme-le en schéma » (ou bouton ✨) | Redessiné proprement : formes régulières, textes lisibles, légendes |
| « Qu'est-ce que j'ai dessiné ? » | Jarvis reconnaît le dessin |
| « Résous cette équation », « lis ce que j'ai écrit » | Écriture et formules retranscrites (et résolues) |
| « Projette-le en 3D », « fais-en une vraie image » | Hologramme en réalité augmentée, ou illustration générée |

### Mémoire personnelle
Jarvis retient ce que vous lui confiez et s'en sert ensuite dans toutes ses réponses (recettes sans noix si vous êtes allergique, votre ville pour la météo, le prénom de vos proches…).

| Dites… | Effet |
|---|---|
| « Souviens-toi que je suis allergique aux noix », « retiens que ma fille s'appelle Emma », « n'oublie pas mon anniversaire le 12 mai » | Retenu (instantané) |
| « Qu'est-ce que tu sais sur moi ? » | Carte 🧠 : vos souvenirs, avec ✕ pour en oublier un et un champ pour en ajouter |
| « Oublie mon allergie » | Oublie le souvenir correspondant |
| « Oublie tout ce que tu sais sur moi » | Efface tout (avec un bouton pour annuler) |

Jarvis retient aussi de lui-même une information personnelle durable que vous mentionnez (« je m'appelle Léa », « je suis végétarien »), et vous le dit. Les souvenirs restent **uniquement sur cet appareil** (**⚙️ Réglages → Mémoire → Ce que Jarvis sait de vous**) ; ne lui confiez pas de mots de passe.

### Réduire les fenêtres
Chaque carte a un bouton **—** qui la réduit dans une barre en bas (elle continue de fonctionner : vidéo, caméra, minuteur). Le lecteur de musique se réduit aussi en une pastille 🎵. Un clic sur une pastille la rouvre.

À la voix : « minimise tout », « réduis la musique », « range la vidéo », « rouvre la caméra », « réaffiche tout ».

### Cartes mentales
« Fais une carte mentale sur la Révolution française » : sujet au centre, branches colorées, idées et détails. **Molette** pour zoomer, **glisser** pour se déplacer, **clic** sur une branche pour la replier/déplier, double-clic pour recentrer.

| Dites… | Effet |
|---|---|
| « Mets-la en arbre », « passe en organigramme », « remets en carte mentale » | 3 dispositions |
| « Déplie tout », « replie tout », « déplie la branche causes », « replie conséquences » | Ouvrir / fermer des branches |
| « Ajoute une branche sur les femmes pendant la Révolution » | Jarvis enrichit la carte (via l'IA) |
| « Ferme la carte mentale », « réaffiche la carte mentale » | Fermer / rappeler |
| « Ajoute des images à la carte mentale », « ajoute une image à la branche Acteurs » | Illustre les idées (image de l'article Wikipédia, sinon recherche d'images) |
| « Mets cette image sur la branche Symboles » | Place l'image que vous venez d'envoyer (📎, glisser-déposer, Ctrl+V) |
| « Ajoute des liens », « ajoute un lien à Robespierre », « ajoute le lien https://… à Marianne » | Ajoute des liens (Wikipédia ou adresse précise) |
| « Enlève les images », « enlève les liens » | Retire images ou liens |

Dès la création, Jarvis illustre le sujet central et les branches principales, et ajoute des liens Wikipédia sur les notions importantes. **Clic droit** (ou Maj+clic) sur une idée : image automatique, image depuis votre ordinateur, lien Wikipédia, lien personnalisé, ou retrait. La pastille 🔗 ouvre le lien dans un nouvel onglet ; un clic sur une image l'affiche en grand.

### Mise en forme libre
Jarvis a carte blanche pour présenter les informations comme vous le demandez :
- **Pages sur mesure** : infographie, frise chronologique, fiche illustrée, affiche, tableau de bord, quiz interactif… Jarvis conçoit la page entière (HTML/CSS/JS), affichée dans un cadre isolé et sécurisé.
- **Disposition exacte** : « mets la carte mentale sur les deux tiers gauche et la frise en haut à droite », position et taille au pourcentage près. Vous pouvez aussi **déplacer une fenêtre en la tirant par son titre** et **la redimensionner par son coin** en bas à droite.
- **Style** : couleur, fond (verre, uni, transparent, lumineux, clair) et taille du texte de chaque fenêtre (« mets le récap en grand avec un style doré »).
- **Thème** : « mets l'interface en rouge », « thème violet », « remets les couleurs par défaut » (retenu d'une visite à l'autre), ambiances sombre, minimale ou vive.

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
├── js/mindmap.js         Cartes mentales : 3 dispositions, zoom, branches repliables
├── js/brain.js           IA (Groq / Gemini / Claude / Pollinations), vision, mémoire de conversation
├── js/camera.js          Caméra, capture, images envoyées
├── js/ar.js              Réalité augmentée : hologrammes 3D, suivi des mains, gestes
├── js/draw.js            Dessin dans l'air avec l'index, export du croquis pour l'IA
├── js/arlayers.js        Calques AR : carte 3D réelle (MapLibre) et vrais modèles (Sketchfab)
├── js/geo.js             Recherche de lieux, itinéraires et consignes en français
├── js/hands.js           Suivi des mains (MediaPipe), partagé par l'AR et le dessin
├── js/facts.js           Mémoire personnelle (souvenirs sur l'utilisateur)
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
