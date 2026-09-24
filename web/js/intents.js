// Commandes reconnues localement, instantanément et sans appel à l'IA
// (plus rapide, fonctionne même sans connexion à une IA).
const clean = (s) => s.trim().replace(/[.!?]+$/, '').replace(/^(s'il te plait|s'il vous plait|stp|svp)\s+/i, '').trim();
const obj = (s) => clean(s).replace(/^(de |des |du |d'|d’|la |le |les |l'|l’|une |un |sur |à propos de |a propos de )+/i, '').trim();

const COLOR_WORDS = 'rouge|orange|or|dor[ée]|jaune|vert|turquoise|cyan|bleu|indigo|violet|mauve|rose|magenta|#[0-9a-f]{3,6}';
const RULES = [
  // Couleurs de l'interface
  [new RegExp(`^(?:mets|passe|change|colore|peins|repeins|fais)(?:[- ]moi)?\\s+(?:l'interface|l’interface|jarvis|l'[ée]cran|les couleurs|la couleur|le th[èe]me|tout|l'appli(?:cation)?)\\s+(?:en|au|à la couleur)\\s+(${COLOR_WORDS})$|^(?:th[èe]me|couleur|interface|ambiance)\\s+(${COLOR_WORDS})$`, 'i'),
    (m) => ({ actions: [{ type: 'theme', accent: (m[1] || m[2]).toLowerCase() }], speech: '' })],
  [/^(?:remets|reviens|retourne|repasse)(?:[- ]moi)?\s+(?:aux?|les|la|à la)\s+(?:couleurs?|th[èe]me)\s+(?:par d[ée]faut|normale?s?|d'origine|habituelle?s?|de base)$/i,
    () => ({ actions: [{ type: 'theme', accent: 'default' }], speech: '' })],
  // Plein écran de l'application
  [/^(?:(?:mets?|passe|affiche|lance|active)(?:[- ](?:toi|moi|jarvis|l'application|l'appli|l'écran|tout))*\s+)?(?:en )?plein[- ]écran$/i,
    () => ({ actions: [{ type: 'fullscreen', on: true }], speech: '' })],
  [/^(?:quitte|sors?|enl[èe]ve|d[ée]sactive|ferme|arr[êe]te|coupe)(?:[- ](?:du|le))?\s+(?:mode )?plein[- ]écran$|^(?:mode )?fen[êe]tre$/i,
    () => ({ actions: [{ type: 'fullscreen', on: false }], speech: '' })],
  // Contrôle des médias
  [/^(stop|arr[eê]te(z)?( tout| la musique| la vid[ée]o| la radio)?|coupe (la musique|le son|la radio)|silence|tais[- ]toi|chut)$/i,
    () => ({ actions: [{ type: 'media', command: 'stop' }], speech: '' })],
  [/^(pause|mets? (en )?pause|mets? sur pause)$/i, () => ({ actions: [{ type: 'media', command: 'pause' }], speech: '' })],
  [/^(reprends?|reprise|continue|play|relance( la musique)?)$/i, () => ({ actions: [{ type: 'media', command: 'resume' }], speech: '' })],
  [/^(suivant|la suivante|chanson suivante|station suivante|vid[ée]o suivante|next|change de (musique|station|chanson))$/i,
    () => ({ actions: [{ type: 'media', command: 'next' }], speech: '' })],
  [/^(monte|augmente|plus fort)( le (son|volume))?( un peu)?$/i, () => ({ actions: [{ type: 'media', command: 'volume_up' }], speech: '' })],
  [/^(baisse|diminue|moins fort)( le (son|volume))?( un peu)?$/i, () => ({ actions: [{ type: 'media', command: 'volume_down' }], speech: '' })],
  [/^(efface|nettoie|vide) (l'|l’)?(é|e)cran$|^(reviens|retourne|retour) (à|a) l'accueil$|^(accueil|écran d'accueil)$/i, () => ({ actions: [{ type: 'clear' }], speech: '' })],

  // Heure et date
  [/^(quelle heure (est[- ]il|il est)|il est quelle heure|l'heure|donne[- ]moi l'heure)$/i, () => {
    const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' heures ');
    return { speech: `Il est ${t}.`, actions: [] };
  }],
  [/^(quel jour (sommes[- ]nous|on est|est[- ]on)|on est quel jour|quelle (est la )?date( sommes[- ]nous| aujourd'hui)?|la date)$/i, () => ({
    speech: `Nous sommes le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`, actions: [],
  })],

  // Génération d'image (avant « images » pour éviter la confusion)
  [/^(?:g[ée]n[èe]re|dessine|cr[ée]e|imagine|fais)(?:[- ]moi)? (?:une |un )?(?:image|dessin|illustration|photo|tableau)? ?(?:de |d'|d’|avec |représentant |qui représente )?(.+)$/i,
    (m) => ({ actions: [{ type: 'generate_image', prompt: obj(m[1]) }], speech: 'Je vous prépare cela.' }),
    (s) => /^(g[ée]n[èe]re|dessine|imagine)|^(cr[ée]e|fais)(-moi)? (une |un )?(image|dessin|illustration)/i.test(s)],

  // Images réelles
  [/^(?:montre|affiche|cherche|trouve|fais[- ]moi voir)(?:[- ]moi)? (?:des |les |une |quelques )?(?:images?|photos?|illustrations?) (?:de |d'|d’|du |des |sur )?(.+)$/i,
    (m) => ({ actions: [{ type: 'images', query: obj(m[1]) }], speech: '' })],
  [/^(?:images?|photos?) (?:de |d'|d’|du |des )?(.+)$/i, (m) => ({ actions: [{ type: 'images', query: obj(m[1]) }], speech: '' })],

  // Vidéos
  [/^(?:lance|mets?|joue|montre|affiche|cherche|trouve)(?:[- ]moi)? (?:une |la |des |les )?(?:vid[ée]os?|clip|film|reportage|documentaire|tuto(?:riel)?) (?:de |d'|d’|du |des |sur |à propos de |a propos de |qui parle de )?(.+)$/i,
    (m) => ({ actions: [{ type: 'video', query: obj(m[1]) }], speech: '' })],
  [/^(?:youtube|vid[ée]o) (.+)$/i, (m) => ({ actions: [{ type: 'video', query: obj(m[1]) }], speech: '' })],

  // Musique
  [/^(?:mets?|lance|joue|passe|[ée]coute(?:r)?|je veux (?:[ée]couter|de la musique))(?:[- ]moi| nous)? (?:de la |du |des |la |le |les |une |un )?(?:musique|radio|chanson|son|morceau|playlist|titre)s?(?: de | d'| d’| du | des | )?(.*)$/i,
    (m) => ({ actions: [{ type: 'music', query: obj(m[1] || '') || 'chill' }], speech: '' })],
  [/^(?:je (?:veux|voudrais|souhaite|aimerais) (?:[ée]couter|entendre)|fais[- ]moi [ée]couter|on [ée]coute) (.+)$/i,
    (m) => ({ actions: [{ type: 'music', query: obj(m[1]) }], speech: '' })],
  [/^(?:mets?|joue|passe|lance)(?:[- ]moi)? (.+)$/i, (m) => ({ actions: [{ type: 'music', query: obj(m[1]) }], speech: '' }),
    (s) => !/(vid[ée]o|image|photo|minuteur|timer|alarme|rappel|tableau|cartes?|liste|colonnes?|lignes?|en grand|en petit)/i.test(s)],

  // Étude
  [/^(?:[ée]tudie|explique(?:[- ]moi)?|apprends[- ]moi|fais[- ]moi (?:un cours|une fiche|un r[ée]sum[ée]) (?:sur|de)|renseigne[- ]toi sur|r[ée]sume[- ]moi|parle[- ]moi de|je veux (?:apprendre|r[ée]viser|[ée]tudier)|cours sur|fiche sur|recherche sur)\s+(.+)$/i,
    (m) => ({ actions: [{ type: 'study', topic: obj(m[1]) }], speech: '' })],
  [/^(?:qui (?:est|était|etait)|c'est qui|qu'est[- ]ce que|c'est quoi) (.+)$/i, (m) => ({ actions: [{ type: 'study', topic: obj(m[1]), quick: true }], speech: '' }),
    (s) => !/\b(tu|vous|te|toi|ton|ta|tes|votre|vos|je|j'|me|moi|mon|ma|mes|on|il se passe|ça)\b/i.test(s.replace(/^(qu'est[- ]ce que|c'est quoi|c'est qui|qui (est|était|etait))/i, ''))],

  // Météo
  [/^(?:quel temps (?:fait[- ]il|il fait|va[- ]t[- ]il faire)|(?:donne[- ]moi )?la m[ée]t[ée]o|m[ée]t[ée]o)(?: (?:à|a|au|en|aux|pour|sur|de) (.+?))?(?: (?:aujourd'hui|demain|cette semaine))?$/i,
    (m) => ({ actions: [{ type: 'weather', city: m[1] ? clean(m[1]) : '' }], speech: '' })],

  // Minuteur
  [/^(?:mets?|lance|d[ée]marre|programme|r[èe]gle)?(?:[- ]moi)? ?(?:un |le )?(?:minuteur|timer|compte [àa] rebours|chrono) (?:de |pour |sur )?(\d+|une|un|deux|trois|cinq|dix|quinze|vingt|trente) ?(secondes?|sec|s|minutes?|min|m|heures?|h)$/i,
    (m) => {
      const words = { une: 1, un: 1, deux: 2, trois: 3, cinq: 5, dix: 10, quinze: 15, vingt: 20, trente: 30 };
      const n = words[m[1].toLowerCase()] || parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      const secs = unit.startsWith('h') ? n * 3600 : unit.startsWith('m') ? n * 60 : n;
      return { actions: [{ type: 'timer', seconds: secs, label: `${n} ${m[2]}` }], speech: `Minuteur de ${n} ${m[2]} lancé.` };
    }],
];

// ---------- Positions à l'écran ----------
const PLACE_WORDS = [
  [/en haut (?:à|a) gauche|en haut gauche|coin sup[ée]rieur gauche/, 'top-left'],
  [/en haut (?:à|a) droite|en haut droite|coin sup[ée]rieur droit/, 'top-right'],
  [/en bas (?:à|a) gauche|en bas gauche|coin inf[ée]rieur gauche/, 'bottom-left'],
  [/en bas (?:à|a) droite|en bas droite|coin inf[ée]rieur droit/, 'bottom-right'],
  [/(?:à|a) gauche|sur la gauche|c[ôo]t[ée] gauche/, 'left'],
  [/(?:à|a) droite|sur la droite|c[ôo]t[ée] droit/, 'right'],
  [/en haut|au-dessus|en dessus/, 'top'],
  [/en bas|en-dessous|en dessous/, 'bottom'],
  [/au centre|au milieu|centr[ée]/, 'center'],
];
export { splitPlace };
export function parsePlace(text = '') {
  const t = text.toLowerCase();
  for (const [re, p] of PLACE_WORDS) if (re.test(t)) return p;
  return '';
}
// Retire « … à gauche (de l'écran) » en fin de commande et renvoie la position.
const PLACE_SUFFIX = /[\s,]+(?:et\s+)?(?:(?:place|mets?|affiche)[- ](?:la|le|les)\s+)?(?:en haut (?:à|a) (?:gauche|droite)|en bas (?:à|a) (?:gauche|droite)|(?:à|a) gauche|(?:à|a) droite|sur la (?:gauche|droite)|en haut|en bas|au centre|au milieu)(?: de l'[ée]cran)?$/i;
function splitPlace(s) {
  const m = s.match(PLACE_SUFFIX);
  if (!m) return { s, place: '' };
  return { s: s.slice(0, m.index).trim(), place: parsePlace(m[0]) };
}

export function matchIntent(input) {
  const full = clean(input);
  if (!full) return null;

  // Déplacer / échanger / remettre la disposition normale (sans IA).
  let mv = full.match(/^(?:mets?|d[ée]place|place|bouge|passe|range|envoie|glisse)(?:[- ](?:moi|nous))?\s+(?:la |le |les |l'|l’|ma |mon |mes )?(photo|image|images|galerie|vid[ée]o|r[ée]cap(?:itulatif)?|tableau|r[ée]sum[ée]|fiche|[ée]tude|m[ée]t[ée]o|minuteur|texte|r[ée]ponse)s?\s+(.+)$/i);
  if (mv && parsePlace(mv[2])) return { actions: [{ type: 'move', target: mv[1], place: parsePlace(mv[2]) }], speech: '' };
  mv = full.match(/^(?:[ée]change|inverse|permute|intervertis)\s+(?:la |le |les |l'|l’)?(\S+)\s+et\s+(?:la |le |les |l'|l’)?(\S+)$/i);
  if (mv && !/lignes?|colonnes?/i.test(full)) return { actions: [{ type: 'swap', a: mv[1], b: mv[2] }], speech: '' };
  if (!/couleur|th[èe]me/i.test(full) && /^(?:remets?|reviens|retourne|repasse)\b.*\b(?:normale?s?|normalement|par d[ée]faut|habituelle?s?)$|^(?:annule|efface|enl[èe]ve|supprime) (?:la |les )?(?:disposition|positions?|placements?)$/i.test(full)) {
    return { actions: [{ type: 'layout_reset' }], speech: '' };
  }

  // Une commande simple peut préciser où afficher le résultat : « montre des photos de chats à gauche ».
  const { s, place } = splitPlace(full);
  const r = matchSimple(s);
  if (r && place) r.actions.forEach((a) => { if (['images', 'generate_image', 'video', 'study', 'weather', 'timer', 'camera'].includes(a.type)) a.place = place; });
  return r;
}

// ---------- Réduire / rouvrir les fenêtres ----------
const WIN = '(musique|radio|lecteur|son|vid[ée]o|photo|images?|galerie|r[ée]cap(?:itulatif)?|tableau|cam[ée]ra|webcam|m[ée]t[ée]o|minuteur|fiche|texte|analyse|r[ée]ponse)s?';
function matchWindows(s) {
  if (/^(?:minimise|minimiser|r[ée]duis|range|cache|masque|planque|baisse)(?:[- ]moi)?\s+(?:tout|toutes? les (?:fen[êe]tres|cartes)|tous les [ée]l[ée]ments|les fen[êe]tres)$|^minimise$|^(?:tout|les fen[êe]tres) en bas$/i.test(s)) {
    return { actions: [{ type: 'minimize', target: 'all' }], speech: '' };
  }
  if (/^(?:restaure|r[ée]affiche|rouvre|r[ée]ouvre|ressors|remets|affiche|montre)(?:[- ]moi)?\s+(?:tout|toutes? les (?:fen[êe]tres|cartes)|tous les [ée]l[ée]ments|les fen[êe]tres)$/i.test(s)) {
    return { actions: [{ type: 'restore', target: 'all' }], speech: '' };
  }
  let m = s.match(new RegExp(`^(?:minimise|minimiser|r[ée]duis|range|cache|masque|planque)(?:[- ]moi)?\\s+(?:la |le |les |l'|l’|ma |mon |mes )?${WIN}$`, 'i'));
  if (m) return { actions: [{ type: 'minimize', target: m[1] }], speech: '' };
  m = s.match(new RegExp(`^(?:restaure|r[ée]affiche|rouvre|r[ée]ouvre|ressors|remets)(?:[- ]moi)?\\s+(?:la |le |les |l'|l’|ma |mon |mes )?${WIN}$`, 'i'));
  if (m) return { actions: [{ type: 'restore', target: m[1] }], speech: '' };
  return null;
}

// ---------- Caméra et vision ----------
const CAM = /cam[ée]ra|webcam|cam\b/i;
function matchVision(s) {
  if (/^(?:affiche|montre|allume|ouvre|active|lance|d[ée]marre|mets)(?:[- ](?:moi|nous))?\s+(?:la |ma |une )?(?:cam[ée]ra|webcam|cam)$/i.test(s)) return { actions: [{ type: 'camera', on: true }], speech: '' };
  if (/^(?:ferme|coupe|[ée]teins|arr[êe]te|d[ée]sactive|enl[èe]ve|cache)(?:[- ]moi)?\s+(?:la |ma )?(?:cam[ée]ra|webcam|cam)$/i.test(s)) return { actions: [{ type: 'camera', on: false }], speech: 'Caméra coupée.' };
  if (/^(?:change|retourne|inverse|bascule|passe)(?:[- ]moi)?\s+(?:de |la |sur la )?(?:cam[ée]ra|webcam)(?:\s+(?:avant|arri[èe]re|de devant|de derri[èe]re))?$/i.test(s)) return { actions: [{ type: 'camera', switch: true }], speech: '' };

  // Recherche d'images classique (« montre des photos de chats ») : ce n'est pas de la vision.
  if (/^(?:montre|affiche|cherche|trouve|donne)[\w\s'’-]*\b(?:images?|photos?)\s+(?:de|d'|d’|du|des)\s/i.test(s) && !/cam[ée]ra|webcam|cette|ceci|(?:^|\s)[çc]a(?=\s|$)|similaire|ressembl/i.test(s)) return null;
  const verb = /(qu'?est[- ]ce que tu vois|que vois[- ]tu|tu vois quoi|tu vois (?:[çc]a|ce)|dis[- ]moi ce que tu vois|regarde|analyse|[ée]tudie|examine|d[ée]cris|identifie|reconna[iî]s|lis\b|lire|traduis|compte|recherche|cherche|fais des recherches|renseigne|c'est quoi|qu'?est[- ]ce que c'est|qu'?est[- ]ce que (?:je tiens|j'ai)|combien|quel(?:le)? est (?:cet|cette|ce)|similaires?|qui ressembl)/i;
  const target = /(cam[ée]ra|webcam|\bcam\b|\bimage\b|\bphoto\b|capture|ce que (?:tu vois|je (?:te )?montre|je tiens|j'ai (?:dans|en) (?:la |ma )?main)|devant (?:moi|toi|la cam)|dans ma main|(?:^|\s)[çc]a(?=\s|$)|ceci|cet objet|ce truc|ce document|ce texte|cette (?:image|photo|page|feuille|[ée]tiquette|plante|chose))/i;
  if (/^(qu'?est[- ]ce que tu vois|que vois[- ]tu|tu vois quoi|dis[- ]moi ce que tu vois|regarde|tu me vois)\s*\??$/i.test(s) || (verb.test(s) && target.test(s))) {
    return { actions: [{ type: 'look', prompt: s }], speech: '' };
  }
  return null;
}

function matchSimple(s) {
  if (!s) return null;
  const win = matchWindows(s);
  if (win) return win;
  const vision = matchVision(s);
  if (vision) return vision;
  for (const [re, build, guard] of RULES) {
    if (guard && !guard(s)) continue;
    const m = s.match(re);
    if (m) {
      const r = build(m);
      // Une requête vide n'a pas de sens : laisse l'IA gérer.
      if (r.actions.some((a) => ('query' in a && !a.query) || ('topic' in a && !a.topic) || ('prompt' in a && !a.prompt))) return null;
      return r;
    }
  }
  return null;
}

// ---------- Commandes de disposition des tableaux ----------
// Renvoie une modification à appliquer au tableau affiché, ou null.
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function matchTableIntent(input, { hasTable = false, canRestore = false } = {}) {
  const raw = clean(input);
  const s = fold(raw);
  if (!s) return null;

  if (/^(re)?(affiche|montre|remets|ouvre|rouvre)(-| )?(moi )?(a nouveau |de nouveau )?(le |mon )?(dernier )?(tableau|recap|recapitulatif)( precedent)?( en grand)?$/.test(s) || /^(re ?affiche|remets) le tableau/.test(s)) {
    if (!hasTable && canRestore) return { restore: true };
    if (hasTable) return { expand: true };
    return null;
  }
  if (!hasTable) return null;
  // « Mets le tableau à droite » est un déplacement, pas un changement de vue.
  if (/\b(a gauche|a droite|en haut|en bas|au centre|au milieu|sur la gauche|sur la droite)\b/.test(s)) return null;

  if (/^(ferme|supprime|enleve|retire|efface|cache)( le| ce)? (tableau|recap|recapitulatif)$/.test(s)) return { close: true };
  if (/^(agrandis|agrandir|agrandi|zoome|en grand|affiche (le |la |ca |ce )?en grand|mets (le |la |ca |ce )?en grand|montre (le |la |ca |ce )?en grand|affiche le en grand)/.test(s) || /\ben grand\b/.test(s)) return { expand: true };
  if (/^(reduis|reduire|reduit|retrecis|rapetisse)( le| la| ca| le tableau| la carte)?$|^(en petit|remets (le |la |ca )?en petit|reviens)$/.test(s)) return { expand: false };
  if (/(inverse|echange|permute|intervertis|transpose|tourne)r?( les)? (lignes? et (les )?colonnes?|colonnes? et (les )?lignes?)|^transpose/.test(s)) return { transpose: true };

  const layouts = [
    [/\b(cartes?|fiches?|vignettes?|tuiles?|blocs?)\b/, 'cards'],
    [/\b(liste|lignes simples|a puces)\b/, 'list'],
    [/\b(comparaison|comparatif|compare|comparer|cote a cote|face a face)\b/, 'compare'],
    [/\b(tableau|grille|table)\b/, 'table'],
  ];
  if (/\b(en|sous forme|forme de|format|disposition|affiche|affichage|mets|passe|montre|presente|vue|fais|transforme|change)\b/.test(s)) {
    for (const [re, layout] of layouts) if (re.test(s) && !/\b(trie|classe|range|ordonne)\b/.test(s)) return { layout, ...(/\ben grand\b/.test(s) ? { expand: true } : {}) };
  }

  let m = raw.match(/(?:tri(?:e|er|es)?|class(?:e|er)|rang(?:e|er)|ordonn(?:e|er))(?:[- ](?:le|la|les|moi|ça|ca))*\s+(?:par|selon|en fonction d[eu]|suivant|sur)\s+(?:l'|l’|la |le |les |ordre d[eu]s? |colonne )*(.+?)(?:,?\s+(?:par ordre |en ordre |dans l'ordre |de fa[çc]on )?(croissante?|d[ée]croissante?|du plus (?:petit|bas|faible) au plus (?:grand|haut|[ée]lev[ée])|du plus (?:grand|haut|[ée]lev[ée]) au plus (?:petit|bas|faible)))?$/i);
  if (m) {
    const ord = fold(m[2] || '');
    const order = /^decroissant|^du plus (grand|haut|eleve)/.test(ord) ? 'desc' : ord ? 'asc' : undefined;
    return { sort: { column: m[1].trim(), order } };
  }
  if (/^(inverse|renverse)( l'| le)? (ordre|tri)$|^(ordre|tri) (inverse|decroissant|croissant)$|^(dans l'autre sens|a l'envers)$/.test(s)) {
    if (/croissant$/.test(s) && !/decroissant$/.test(s)) return { sort: { order: 'asc' } };
    if (/decroissant$/.test(s)) return { sort: { order: 'desc' } };
    return { sort: { reverse: true } };
  }

  m = raw.match(/(?:mets?|met)(?:[- ](?:moi|en))*\s*(?:en (?:[ée]vidence|valeur|avant|surbrillance))\s+(?:la colonne |la ligne |le |la |les |l'|l’)?(.+)$|(?:surligne|souligne|surbrille|fais ressortir|mets en couleur)\s+(?:la colonne |la ligne |le |la |les |l'|l’)?(.+)$/i);
  if (m) return { highlight: (m[1] || m[2]).trim() };
  if (/^(enleve|retire|supprime|annule)( la)? (mise en evidence|surbrillance|surlignage)$/.test(s)) return { clearHighlight: true };

  m = raw.match(/(?:cache|masque|enl[èe]ve|retire|supprime)(?:[- ]moi)?\s+(?:la |les )?colonnes?\s+(.+)$/i);
  if (m) return { hide: m[1].split(/\s+et\s+|,\s*/).map((x) => x.trim()).filter(Boolean) };
  if (/(affiche|montre|remets|reaffiche)( moi)? (toutes )?les colonnes/.test(s)) return { showAll: true };
  return null;
}

// ---------- Cartes mentales ----------
const MM = "carte mentale|cartes mentales|carte heuristique|mind ?map|sch[ée]ma heuristique|carte des id[ée]es|carte conceptuelle";
export function matchMindmapIntent(input, { hasMindmap = false, canRestore = false } = {}) {
  const raw = clean(input);
  let m = raw.match(new RegExp(`^(?:(?:fais|fait|cr[ée]e|g[ée]n[èe]re|dessine|construis|montre|affiche|pr[ée]pare|r[ée]alise|je veux|j'aimerais)(?:[- ]moi)?\\s+)?(?:une |la |ma )?(?:${MM})\\s+(?:sur|de|du|des|d'|d’|à propos de|a propos de|pour|concernant)?\\s*(.+)$`, 'i'));
  if (m && !/^(en|sous forme)\b/i.test(m[1])) {
    const { s: topic, place } = splitPlace(m[1]);
    return { create: topic.replace(/^(la |le |les |l'|l’)/i, '').trim(), place };
  }
  const s = fold(raw);
  if (/^(re)?(affiche|montre|remets|ouvre|rouvre)(-| )?(moi )?(a nouveau |de nouveau )?(la |ma )?(derniere )?(carte mentale|carte|mind ?map)( precedente)?$/.test(s)) {
    if (!hasMindmap && canRestore) return { restore: true };
    if (hasMindmap) return { expand: true };
  }
  if (!hasMindmap) return null;
  if (/^(ferme|supprime|enleve|retire|efface)( la| cette)? (carte mentale|carte|mind ?map)$/.test(s)) return { close: true };

  // Images et liens sur la carte.
  const url = raw.match(/https?:\/\/\S+/i)?.[0];
  m = raw.match(/^(?:ajoute|mets|place|colle|pose)(?:[- ]moi)?\s+(?:cette|mon|ma|l'|l’)\s*(?:image|photo|capture)\s+(?:sur|à|a|dans|pour)\s+(?:la branche |l'idée |l’idée |le nœud |le noeud )?(?:la |le |les |l'|l’)?(.+)$/i);
  if (m) return { userImage: { target: m[1] } };
  if (/^(ajoute|mets|rajoute|illustre)( moi)? (des |les )?(images|photos|illustrations)( partout| a| sur| dans| aux| pour)?( la carte( mentale)?| toutes les branches| chaque branche| les branches| toutes les idees)?$/.test(s) || /^illustre (la carte|la carte mentale)$/.test(s)) {
    return { images: /toutes les idees|partout/.test(s) ? 'all' : 'branches' };
  }
  m = raw.match(/^(?:ajoute|mets|rajoute|trouve)(?:[- ]moi)?\s+(?:une |un )?(?:image|photo|illustration)\s+(?:à|a|sur|pour|dans)\s+(?:la branche |l'idée |l’idée |le nœud |le noeud )?(?:la |le |les |l'|l’)?(.+)$/i);
  if (m) return { images: m[1] };
  if (/^(ajoute|mets|rajoute)( moi)? (des |les )?(liens|sources)( wikipedia)?( partout| a| sur| dans| aux| pour)?( la carte( mentale)?| toutes les branches| chaque branche| les branches| toutes les idees)?$/.test(s)) return { links: 'all' };
  m = raw.match(/^(?:ajoute|mets|rajoute)(?:[- ]moi)?\s+(?:le |un |une )?(?:lien|source|url)(?:\s+wikip[ée]dia)?(?:\s+(?:vers\s+)?https?:\/\/\S+)?\s+(?:à|a|sur|pour|dans)\s+(?:la branche |l'idée |l’idée |le nœud |le noeud )?(?:la |le |les |l'|l’)?(.+?)(?:\s+https?:\/\/\S+)?$/i);
  if (m) return url ? { customLink: { target: m[1], url } } : { links: m[1] };
  if (/^(enleve|retire|supprime|efface)( moi)? (toutes )?les (images|photos|illustrations)( de la carte( mentale)?)?$/.test(s)) return { removeImages: true };
  if (/^(enleve|retire|supprime|efface)( moi)? (tous )?les (liens|sources)( de la carte( mentale)?)?$/.test(s)) return { removeLinks: true };
  if (/\b(arbre|arborescence)\b/.test(s) && /\b(en|mets|passe|affiche|forme|vue)\b/.test(s)) return { layout: 'tree' };
  if (/\b(organigramme|hierarchi\w*|de haut en bas|verticale?)\b/.test(s) && /\b(en|mets|passe|affiche|forme|vue)\b/.test(s)) return { layout: 'org' };
  if (/\b(en etoile|radiale?|en carte mentale|en carte|autour du centre)\b/.test(s) && /\b(en|mets|passe|affiche|remets|repasse)\b/.test(s)) return { layout: 'mindmap' };
  if (/^(deplie|developpe|ouvre|etends)( moi)? (tout|toutes les branches|la carte)$/.test(s)) return { expandAll: true };
  if (/^(replie|referme|resserre)( moi)? (tout|toutes les branches|la carte)$/.test(s)) return { collapseAll: true };
  m = raw.match(/^(d[ée]plie|d[ée]veloppe|[ée]tends)(?:[- ]moi)?\s+(?:la branche\s+)?(?:la |le |les |l'|l’)?(.+)$/i);
  if (m) return { toggle: m[2], open: true };
  m = raw.match(/^(replie|referme)(?:[- ]moi)?\s+(?:la branche\s+)?(?:la |le |les |l'|l’)?(.+)$/i);
  if (m) return { toggle: m[2], open: false };
  if (/^(recentre|centre)( la carte)?$/.test(s)) return { fit: true };
  return null;
}

// ---------- Réalité augmentée (hologrammes 3D) ----------
const AR_WORDS = "(?:en |dans la |avec la |sous forme d'|sous forme de |comme un |comme une |façon )?(?:3 ?d|trois dimensions|a\\.? ?r\\.?|r[ée]alit[ée] augment[ée]e|hologrammes?|holographique|relief)";
const IMG_REF = /^(?:cette|cet|ce|l'|l’|la|le|mon|ma)\s*(?:image|photo|dessin|capture|sch[ée]ma|plan|croquis)(?:\s+(?:que je t'ai envoy[ée]e?|envoy[ée]e?|affich[ée]e?|[àa] l'[ée]cran))?$/i;
export function matchARIntent(input, { open = false, canRestore = false } = {}) {
  const raw = clean(input);
  const s = fold(raw);
  if (!s) return null;

  // Ouvrir / rappeler la vue AR.
  if (/^(?:(?:ouvre|lance|active|d[ée]marre|affiche|passe en|mets?(?: moi)? en|mode)(?:[- ]moi)?\s+)?(?:la |le |en |mode )?(?:r[ée]alit[ée] augment[ée]e|a\.? ?r\.?|mode a\.? ?r\.?|hologrammes?|vue 3 ?d|mode hologramme)$/i.test(raw) && !open) {
    return canRestore ? { restore: true } : { open: true };
  }
  if (/^(re ?affiche|remets|rouvre|reouvre|montre a nouveau)( moi)? (le |l')?(dernier )?(hologramme|modele 3 ?d|objet 3 ?d)$/.test(s)) return { restore: true };

  // Créer un hologramme : « projette un moteur en 3D », « montre-moi l'ADN en hologramme », « projette ce plan ».
  let m = raw.match(new RegExp(`^(?:projette|projeter|projection d[eu']?|affiche|montre|mets|fais(?: appara[iî]tre)?|g[ée]n[èe]re|cr[ée]e|construis|mod[ée]lise|dessine|visualise|transforme|convertis|passe|je veux voir)(?:[- ](?:moi|nous))?\\s+(.+?)\\s+${AR_WORDS}(?:\\s+(?:devant moi|sur ma cam[ée]ra|dans la pi[èe]ce|ici))?$`, 'i'))
    || raw.match(/^(?:projette|projeter|projection d[eu']?)(?:[- ](?:moi|nous))?\s+(.+?)(?:\s+(?:devant moi|sur ma cam[ée]ra|dans la pi[èe]ce|ici))?$/i)
    || raw.match(new RegExp(`^(?:un |une )?(?:hologramme|mod[èe]le 3 ?d|maquette 3 ?d|objet 3 ?d|maquette)\\s+(?:de |d'|d’|du |des )(.+)$`, 'i'));
  if (m) {
    const what = m[1].trim();
    if (!what) return null;
    if (IMG_REF.test(what)) {
      // « projette ce plan en 3D » → le plan devient une maquette ; « projette cette image » → panneau flottant.
      const is3D = /plan|croquis|sch[ée]ma/i.test(what) && new RegExp(AR_WORDS, 'i').test(raw) && /3 ?d|relief|volume|maquette|trois/i.test(raw);
      return { image: /affich|[ée]cran/i.test(what) ? 'screen' : 'last', planFromImage: is3D };
    }
    const pics = what.match(/^(?:des |les |une |quelques )?(?:images?|photos?)\s+(?:de |d'|d’|du |des |sur )?(.+)$/i);
    if (pics) return { imageQuery: obj(pics[1]) };
    return { topic: what.replace(/^(?:un |une |le |la |les |l'|l’|des |du )/i, '').trim() };
  }

  if (!open) return null;
  // Commandes quand l'hologramme est affiché (instantanées).
  if (/^(ferme|quitte|sors?( de)?|arrete|coupe|stoppe|termine|desactive|enleve)( la| le| l'| les)?( (realite augmentee|ar|mode ar|hologrammes?|3 ?d|projection|vue 3 ?d))?$/.test(s)) return { close: true };
  if (/^(fais le |fais la |fait le |fait la )?(tourner|pivoter)( tout seul| en continu| sur lui meme)?$|^(active |lance )?(la )?rotation( auto(matique)?)?$/.test(s)) return { spin: true };
  if (/^(arrete|stoppe|coupe|stop)( de tourner| la rotation| de pivoter)?$|^(immobilise|fige|bloque)( le| la)?$/.test(s)) return { spin: false };
  if (/^(plus grand|plus gros|agrandis|grossis|zoome?|rapproche)( le| la| l'hologramme| le modele)?( encore)?( un peu)?$|^en plus grand$/.test(s)) return { zoom: 1.4 };
  if (/^(plus petit|reduis|rapetisse|retrecis|dezoome?|eloigne)( le| la| l'hologramme| le modele)?( encore)?( un peu)?$|^en plus petit$/.test(s)) return { zoom: 1 / 1.4 };
  if (/^(reinitialise|recentre|centre|remets? (le |la )?(au centre|en place|droit|comme avant)|position initiale)$/.test(s)) return { reset: true };
  if (/^((mode|en|passe en|mets en|effet) )?(hologramme|holographique|holo)$/.test(s)) return { holo: true };
  if (/^((mode|en|passe en|mets en|remets les?) )?(realiste|couleurs?( reelles?| normales?| d'origine)?|textures?|vraies couleurs)$/.test(s)) return { holo: false };
  if (/^(change|retourne|inverse|bascule)( de)?( la)? camera$/.test(s)) return { switchCamera: true };
  if (/^(coupe|desactive|arrete)( le suivi des)? mains$/.test(s)) return { hands: false };
  if (/^(active|reactive|allume)( le suivi des)? mains$/.test(s)) return { hands: true };
  m = s.match(/^(?:vue|montre le|montre la|montre moi|regarde|affiche)(?: moi)? (?:de |d'|du |par )?(?:la )?(dessus|haut|face|devant|cote|profil|derriere|dos|dessous)$/);
  if (m) return { view: { dessus: 'top', haut: 'top', face: 'front', devant: 'front', cote: 'side', profil: 'side', derriere: 'back', dos: 'back', dessous: 'below' }[m[1]] };
  m = s.match(/^(?:tourne|pivote|fais tourner)(?: le| la| l'hologramme)? (?:vers |a |sur )?(?:la )?(gauche|droite|haut|bas)$/);
  if (m) return { turn: { gauche: [-45, 0], droite: [45, 0], haut: [0, -45], bas: [0, 45] }[m[1]] };
  if (/^(retourne|renverse)( le| la)?$|^demi tour$/.test(s)) return { turn: [180, 0] };
  if (/^(un |montre moi un |montre m'en un |donne moi un )?(autre|suivant|prochain)( modele| objet| version)?$|^(change|autre) de modele$|^modele suivant$|^un autre$/.test(s)) return { nextModel: true };
  let st = s.match(/^(?:(?:passe|mets|affiche|montre|bascule|change)(?: moi)?(?: en| la| le)? ?)?(?:vue |mode |rendu |version )?(google earth|photo ?realiste|photorealiste|realiste 3d|satellite|aerienne|vue du ciel|plan|carte)(?: 3 ?d)?$/);
  if (st) return { mapStyle: /satellite|aerienne|ciel/.test(st[1]) ? 'satellite' : /plan|carte/.test(st[1]) ? 'plan' : 'photo' };
  if (/^(comme|facon|style) google earth$|^en vrai$/.test(s)) return { mapStyle: 'photo' };
  if (/^(survole|survol|parcours|fais|lance|montre)( moi)?( le| l')?( survol| trajet| itineraire| parcours| chemin)( en vol| en 3 ?d)?$|^vol au dessus( du trajet)?$/.test(s)) return { fly: true };
  return null;
}

// ---------- Mémoire personnelle ----------
export function matchMemoryIntent(input) {
  const raw = clean(input);
  const s = fold(raw);
  if (!s) return null;
  let m = raw.match(/^(?:souviens[- ]toi|rappelle[- ]toi|retiens(?: bien)?|m[ée]morise|n['’]oublie pas|garde (?:[çc]a )?en m[ée]moire|enregistre dans ta m[ée]moire|note dans ta m[ée]moire|prends note|ajoute (?:[àa]|dans) ta m[ée]moire)\s*(?:que |qu['’]|le fait que |de |d['’]|:|,)?\s*(.+)$/i);
  // « Retiens ça » : il faut le contexte de la conversation, l'IA s'en charge.
  if (m && !/^(?:[çc]a|ceci|cela|le|la|les|tout [çc]a|bien|[çc]a stp)$/i.test(m[1].trim())) return { remember: m[1] };
  if (/^(qu[' ]?est ce que tu sais (sur|de) moi|que sais tu (sur|de) moi|tu sais quoi (sur|de) moi|qu[' ]?as tu retenu( sur moi)?|qu[' ]?est ce que tu as retenu( sur moi)?|tes souvenirs|ma memoire|ta memoire|(montre|affiche|liste|lis|ouvre)( moi)? (ta|ma|la) memoire|(montre|affiche|liste|dis)( moi)? (tes souvenirs|ce que tu sais (sur|de) moi|ce que tu as retenu))$/.test(s)) return { show: true };
  if (/^(oublie (tout ce que tu sais (sur|de) moi|tout|toute ta memoire|tous tes souvenirs|tout ce que je t ai dit)|(efface|vide|reinitialise) (ta|ma|la) memoire)$/.test(s)) return { forgetAll: true };
  m = raw.match(/^oublie\s+(?:que |qu['’]|le fait que |ce que je t['’]ai dit (?:sur|à propos d[eu']?)\s*)?(.+)$/i);
  if (m && !/^(?:[çc]a|ceci|cela|le|la)$/i.test(m[1].trim())) return { forget: m[1] };
  return null;
}

// ---------- Dessin dans l'air ----------
const DRAW_COLORS = 'cyan|or|dore|rose|vert|blanc|violet|rouge|bleu|jaune|orange';
export function matchDrawIntent(input, { open = false } = {}) {
  const s = fold(clean(input));
  if (!s) return null;
  if (!open) {
    if (/^((ouvre|lance|active|affiche|demarre|passe en|mets moi en|mets en)( moi)? )?(le |la |l'|un |une )?(mode dessin|tableau blanc|ardoise( magique)?|dessin dans l'air|dessin en l'air)$/.test(s)
      || /^(je (veux|voudrais|vais|aimerais) dessiner( quelque chose)?|dessine|dessiner|on dessine|fais moi dessiner|laisse moi dessiner)( dans l'air| en l'air| avec (mon|le) doigt)?$/.test(s)
      || /^(dessine|dessiner|ecris|ecrire) (dans l'air|en l'air|avec (mon|le) doigt)$/.test(s)) return { open: true };
    return null;
  }
  if (/^(ferme|quitte|sors?|arrete|termine|stop|coupe)( le| du| de)?( mode)?( dessin| tableau blanc| ardoise)?$/.test(s)) return { close: true };
  if (/^(efface|vide)( tout| le dessin| l'ardoise| le tableau| tout le dessin| l'ecran)?$|^(on )?recommence$/.test(s)) return { clear: true };
  if (/^(annule|retour( en arriere)?|efface le dernier( trait)?|enleve le dernier( trait)?|supprime le dernier( trait)?)$/.test(s)) return { undo: true };
  let m = s.match(new RegExp(`^(?:(?:en|passe en|dessine en|ecris en|couleur|mets? (?:du|le)|change (?:de )?couleur(?: en| pour)?|prends? (?:le|du))\\s+)?(${DRAW_COLORS})$`));
  if (m) return { color: m[1] === 'dore' ? 'or' : m[1] };
  if (/^(change|autre) (de )?couleur$/.test(s)) return { color: '' };
  if (/^(change|retourne|inverse|bascule)( de)?( la)? camera$/.test(s)) return { switchCamera: true };
  return null;
}

// ---------- Cartes 3D et itinéraires ----------
const MODE_RE = /[\s,]+(?:(?:à|a|en)\s+(pied|voiture|v[ée]lo|trottinette|moto)|en marchant|en roulant|en conduisant)\b.*$/i;
const TAIL_3D = /[\s,]+(?:en |sur (?:une |la )?carte )?(?:3 ?d|relief|hologramme|a\.? ?r\.?|r[ée]alit[ée] augment[ée]e)$/i;
const HOME_RE = /^(?:ici|chez moi|ma position|l[àa] o[uù] je suis|o[uù] je suis)$/i;
// Rendu demandé : « comme Google Earth », « en photoréaliste » → photo ; « satellite », « vue aérienne » → satellite.
const STYLE_RE = /[\s,]*(?:(?:en|avec|dans|sur|fa[çc]on|style|comme(?: (?:dans|sur))?|version|mode|vue)\s+)?(?:(google earth|photo[- ]?r[ée]alistes?|satellites?|a[ée]riennes?|vue du ciel|plan simple))\b/i;
export function styleFrom(text = '') {
  const m = String(text).match(STYLE_RE);
  if (!m) return '';
  return /satellite|a[ée]rienne|ciel/i.test(m[1]) ? 'satellite' : /plan/i.test(m[1]) ? 'plan' : 'photo';
}
export function matchGeoIntent(input) {
  const style = styleFrom(input);
  let raw = clean(input).replace(TAIL_3D, '');
  if (style) raw = raw.replace(new RegExp(STYLE_RE.source, 'gi'), ' ').replace(/\s+/g, ' ').replace(TAIL_3D, '').trim();
  const modeWord = raw.match(MODE_RE);
  const mode = modeWord ? (/voiture|moto|roulant|conduisant/i.test(modeWord[0]) ? 'car' : /v[ée]lo|trottinette/i.test(modeWord[0]) ? 'bike' : 'foot') : '';
  raw = raw.replace(MODE_RE, '').trim();
  const tidy = (x = '') => x.replace(/^(?:la |le |les |l'|l’)/i, '').trim();
  const from = (x) => (HOME_RE.test(x || '') ? '' : tidy(x));
  let m = raw.match(/^(?:(?:donne|montre|calcule|trouve|fais|affiche|projette|trace|cherche)(?:[- ]moi)?\s+)?(?:l'|l’|un |le |mon |ton )?(?:itin[ée]raire|trajet|chemin|parcours|route)\s+(?:(?:pour aller|pour me rendre|pour rejoindre)\s+)?(?:de |du |des |d'|d’|depuis )(.+?)\s+(?:à |a |au |aux |jusqu'?à |jusqu’à |vers |pour )(.+)$/i)
    || raw.match(/^comment (?:aller|me rendre|je vais|on va|rejoindre|venir)\s+(?:de |du |des |d'|d’|depuis )(.+?)\s+(?:à |a |au |aux |jusqu'?à |vers )(.+)$/i);
  if (m) return { route: { from: from(m[1]), to: tidy(m[2]), mode, style } };
  m = raw.match(/^comment (?:aller|me rendre|je vais|on va|rejoindre|venir|y aller)\s+(?:à |a |au |aux |jusqu'?à |en |chez |vers )?(.+?)(?:\s+(?:depuis|en partant de|à partir de)\s+(.+))?$/i)
    || raw.match(/^(?:(?:donne|montre|calcule|trouve|fais|affiche|trace)(?:[- ]moi)?\s+)?(?:l'|l’|un |le )?(?:itin[ée]raire|trajet|chemin|route)\s+(?:pour (?:aller|me rendre)\s+)?(?:à |a |au |aux |vers |jusqu'?à |pour )(.+?)(?:\s+(?:depuis|en partant de|à partir de)\s+(.+))?$/i);
  if (m) return { route: { from: from(m[2]), to: tidy(m[1]), mode, style } };
  m = raw.match(/^(?:(?:montre|affiche|projette|donne|ouvre|fais[- ]moi voir|je veux voir|je voudrais voir|fais|fait|cr[ée]e|g[ée]n[èe]re|construis|dessine|mod[ée]lise|visualise|pr[ée]pare|sors)(?:[- ]moi)?\s+)?(?:le |la |un |une |ton |ta )?(?:plan|carte|map|vue|maquette|mod[èe]le)(?: 3 ?d| en 3 ?d| en relief| a[ée]rienne)?\s+(?:de |d'|d’|du |des )(.+)$/i);
  // « maquette de … » / « modèle de … » sans 3D : seulement pour une ville ou un lieu, décidé plus bas par l'aiguillage.
  if (m && /^(?:.*\s)?(?:maquette|mod[èe]le)\b/i.test(raw.slice(0, raw.indexOf(m[1]))) && !/3 ?d|relief/i.test(input)) m = null;
  // Formulations libres (dictée vocale : « faire un plan 3D de… », « je veux la carte en 3D de… ») : plan/carte + 3D + « de <lieu> ».
  if (!m && /\b(?:plan|carte|map|vue)\b/i.test(raw) && (/3 ?d|relief/i.test(input) || style)) {
    m = raw.match(/\b(?:plan|carte|map|vue a[ée]rienne)\b(?:\s+(?:3 ?d|en 3 ?d|en relief))?\s+(?:de |d'|d’|du |des )(.+)$/i);
  }
  // Sans « 3D », « fais un plan de… » est plutôt un plan de travail : seulement « montre / affiche le plan de <lieu> ».
  const NOT_PLACE = /^(?:(?:un|une|mon|ma|mes|la|le|l'|l’)\s*)?(?:r[ée]vision|travail|cours|action|entra[iî]nement|repas|table|dissertation|expos[ée]|marketing|communication|business|bataille|match|s[ée]ance|projet|carri[èe]re|vie|semaine|journ[ée]e|mois|ann[ée]e|lecture|[ée]tude|financement|attaque|jeu|site|la classe)/i;
  if (m && !/3 ?d|relief/i.test(input) && !style && (/^(?:fais|fait|faire|cr[ée]e|g[ée]n[èe]re|construis|pr[ée]pare|sors|dessine|mod[ée]lise)\b/i.test(raw) || NOT_PLACE.test(m[1]))) m = null;
  if (m) m[1] = m[1].replace(/^(?:la |le )?(?:ville|cit[ée]|quartier|r[ée]gion|pays) (?:de |d'|d’|du )/i, '');
  if (m && !/appartement|maison|logement|studio|bureau|pi[èe]ce|chambre|cuisine|\bt\d\b|f\d\b|villa|loft|salle|immeuble invent|jardin/i.test(m[1])) {
    return { map: tidy(m[1]), style };
  }
  // « New York comme dans Google Earth », « Paris en satellite » : un lieu + un rendu, sans « plan » ni « carte ».
  if (style) {
    const p = raw.replace(/^(?:(?:montre|affiche|projette|donne|ouvre|fais[- ]moi voir|je veux voir|je voudrais voir|fais|faire|visualise)(?:[- ]moi)?\s+)?/i, '').replace(/^(?:de |d'|d’|du |des )/i, '').replace(/^(?:la ville de |le quartier de )/i, '').trim();
    if (p && p.split(/\s+/).length <= 6 && !/\b(?:images?|photos?|vid[ée]os?|musique|dessins?|illustrations?)\b/i.test(p)) return { map: tidy(p), style };
  }
  return null;
}

// ---------- Traducteur, étiquettes AR, routines ----------
const LANG_WORDS = "fran[çc]ais|anglais|am[ée]ricain|english|espagnol|allemand|italien|portugais|br[ée]silien|arabe|chinois|mandarin|japonais|cor[ée]en|russe|n[ée]erlandais|hollandais|turc|polonais|hindi|grec|su[ée]dois|ukrainien|vietnamien|h[ée]breu";
export function matchToolsIntent(input, { translatorOpen = false, arOpen = false } = {}) {
  const raw = clean(input);
  const s = fold(raw);
  if (!s) return null;

  // Traducteur en direct.
  let m = raw.match(new RegExp(`^(?:(?:ouvre|lance|active|d[ée]marre|mets|passe en)(?:[- ]moi)?\\s+)?(?:le |un |en )?(?:mode )?(?:traducteur|interpr[èe]te|traduction (?:en )?(?:direct|simultan[ée]e))(?:\\s+(?:en |vers l'|vers le |vers |fran[çc]ais[- ]|avec l'|de l')?(${LANG_WORDS}))?$`, 'i'))
    || raw.match(new RegExp(`^(?:traduis|traduire|traduit)(?:[- ]moi)?\\s+(?:tout )?(?:ce que (?:je dis|je vais dire|il dit|elle dit|on dit)|notre conversation|la conversation|en direct|en temps r[ée]el)\\s+(?:en |vers l'|vers le |vers )?(${LANG_WORDS})$`, 'i'))
    || raw.match(new RegExp(`^(?:aide[- ]moi [àa] |je dois |je veux |j'aimerais )?(?:parler|discuter|communiquer)(?: avec (?:quelqu'un|une personne|lui|elle|un [\\w-]+|une [\\w-]+))? en (${LANG_WORDS})$`, 'i'));
  if (m) return { translator: m[1] || 'anglais' };
  // « traduis "bonjour, où est la gare ?" en japonais »
  m = raw.match(new RegExp(`^(?:traduis|traduire|traduit|comment (?:on )?dit[- ]on|comment dire)(?:[- ]moi)?\\s+[«"“]?(.+?)[»"”]?\\s+en\\s+(${LANG_WORDS})$`, 'i'));
  if (m && !/\b(?:cette|cet|ce|l'|la) (?:image|photo|texte|page|document|menu|panneau|étiquette)\b|cam[ée]ra/i.test(m[1])) return { translateOnce: { text: m[1], to: m[2] } };
  if (translatorOpen) {
    if (/^(ferme|quitte|arrete|coupe|stop|termine)( le)?( traducteur| mode interprete| la traduction| l'interprete)?$/.test(s)) return { translatorClose: true };
    m = s.match(new RegExp(`^(?:passe |change |mets )?(?:en |vers l'|vers le |vers |pour l'|pour le )?(${LANG_WORDS.normalize('NFD').replace(/[̀-ͯ]/g, '')})$`));
    if (m) return { translator: m[1] };
  }

  // Étiquettes AR.
  if (/^((mets|affiche|montre|ajoute|pose)( moi)? des etiquettes( sur (tout|ce que tu vois|ce que je vois|les objets))?|etiquette( moi)? (tout|ce que tu vois|ce que je vois|les objets|la piece|autour de moi)|mode etiquettes?|etiquettes? (ar|en realite augmentee)|identifie( moi)? tout( ce qu'il y a)?( autour de moi| dans la piece| devant moi)?|scanne( moi)? (la piece|autour de moi|ce qui m'entoure|tout)|qu'est ce qu'il y a autour de moi)$/.test(s)) return { labels: true };
  if (arOpen) {
    if (/^(rescanne|re ?scanne|actualise|rafraichis|mets a jour|refais)( les etiquettes| le scan)?$/.test(s)) return { labels: true };
    if (/^(enleve|retire|efface|cache|supprime|arrete)( les| le mode)? etiquettes?$/.test(s)) return { labelsOff: true };
  }

  // Routines.
  m = raw.match(/^(?:cr[ée]e|ajoute|enregistre|programme|fais|fait|configure|invente)(?:[- ]moi)?\s+(?:une |la |ma )?(?:nouvelle )?routine\s+(?:appel[ée]e\s+|nomm[ée]e\s+|qui s'appelle\s+)?[«"“]?(.+?)[»"”]?\s*(?::|—|-|qui|pour|avec|où tu|dans laquelle tu)\s*(.+)$/i)
    || raw.match(/^quand je (?:dis|te dis|dirai)\s+[«"“]?(.+?)[»"”]?\s*(?:,|:|\balors\b|\btu\b)\s*(?:alors\s+)?(?:tu\s+)?(?:fais|feras|lances?|lanceras|dois)?\s*:?\s*(.+)$/i);
  if (m) return { routineCreate: { name: m[1].trim(), steps: m[2].trim() } };
  if (/^((montre|affiche|liste|donne)( moi)? )?(mes|les|tes) routines$|^quelles sont (mes|les) routines$/.test(s)) return { routinesShow: true };
  m = raw.match(/^(?:supprime|efface|retire|enl[èe]ve|oublie)(?:[- ]moi)?\s+(?:la |ma )?routine\s+[«"“]?(.+?)[»"”]?$/i);
  if (m) return { routineDelete: m[1] };
  return null;
}
