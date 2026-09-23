// Commandes reconnues localement, instantanément et sans appel à l'IA
// (plus rapide, fonctionne même sans connexion à une IA).
const clean = (s) => s.trim().replace(/[.!?]+$/, '').replace(/^(s'il te plait|s'il vous plait|stp|svp)\s+/i, '').trim();
const obj = (s) => clean(s).replace(/^(de |des |du |d'|d’|la |le |les |l'|l’|une |un |sur |à propos de |a propos de )+/i, '').trim();

const RULES = [
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

export function matchIntent(input) {
  const s = clean(input);
  if (!s) return null;
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

  if (/^(ferme|supprime|enleve|retire|efface|cache)( le| ce)? (tableau|recap|recapitulatif)$/.test(s)) return { close: true };
  if (/^(agrandis|agrandir|agrandi|zoome|plein ecran|en grand|affiche (le |la |ca |ce )?en grand|mets (le |la |ca |ce )?en grand|montre (le |la |ca |ce )?en grand|affiche le en grand)/.test(s) || /\b(plein ecran|en grand)\b/.test(s)) return { expand: true };
  if (/^(reduis|reduire|reduit|retrecis|rapetisse|en petit|remets (le |la |ca )?en petit|reviens$|range (le|la|ca))/.test(s) || /\ben petit\b/.test(s)) return { expand: false };
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
