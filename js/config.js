/* =====================================================================
   config.js — Données & réglages de MÉCANIQUE LEBEC v2
   C'est LE fichier à modifier pour l'équilibrage et le contenu :
   persos, entreprises, pièces, événements, humeurs, succès, boutique.
   ===================================================================== */
window.ML = window.ML || {};
ML.debug = /[?&]debug/.test(location.search);

ML.CFG = {
  SHIFT_SEC: 480,                      // une journée (7h → 19h) = 8 minutes réelles
  DAY_START: 7 * 60, DAY_END: 19 * 60,
  PLAYER: { eye: 1.65, r: 0.35, walk: 5.6, sprint: 8.8, stamina: 4 },
  CAR: { accel: 13, brake: 24, max: 27, rev: 7, steer: 0.55, wb: 2.6, cap: 4, fuelUse: 0.04,
    /* Caractère de chaque véhicule (cars.js, Cars.drive) :
       mass = masse à vide (kg) ; grip = adhérence latérale max (m/s²) ; slip = vitesse de « recollage » latéral (1/s) ;
       under = sous-virage (0 = neutre) ; roll = roulis visuel ; pitch = plongée/cabrage ; strap = tenue du chargement
       (1 = caisses posées dans la benne, plus = ridelles hautes / sangles) ; hb = efficacité du frein à main (dérive). */
    kinds: {
      megane:  { mass: 1150, grip: 11.5, slip: 9,  under: 0.05, roll: 0.075, pitch: 0.035, strap: 1.0, hb: 1.0 },
      kangoo:  { mass: 1350, grip: 10,   slip: 8,  under: 0.15, roll: 0.1,   pitch: 0.04,  strap: 1.05, hb: 0.9 },
      ducato:  { mass: 2000, grip: 8.5,  slip: 7,  under: 0.3,  roll: 0.13,  pitch: 0.05,  strap: 1.5, hb: 0.75 },
      camion:  { mass: 4500, grip: 6.5,  slip: 6,  under: 0.55, roll: 0.1,   pitch: 0.03,  strap: 2.0, hb: 0.5 },
      fenwick: { mass: 3000, grip: 7,    slip: 10, under: 0.1,  roll: 0.16,  pitch: 0.07,  strap: 1.0, hb: 0.4, rear: true },
      tp:      { mass: 120,  grip: 6,    slip: 12, under: 0,    roll: 0.05,  pitch: 0.02,  strap: 1.2, hb: 0 }
    },
    /* masses du chargement (kg) par type d'objet ; défaut = 15 */
    itemMass: { machine: 900, palette: 320, matiere: 70, caisse: 45, bac_plein: 90, bac_vide: 12, piece: 12, jerrican: 20 } },
  TP: { accel: 10, brake: 20, max: 4.8, rev: 3, steer: 0.9, wb: 1.2, cap: 4 },      // transpalette
  REACH: 5,
  NET: { poseHz: 15, fastHz: 10, slowEvery: 1 },
  LEBEC: { base: 10, chaseAt: 50, hit: 45, run: 6.9, reach: 1.5, sight: 24 },
  HP: { max: 100, pelle: 20, slap: 5, slip: 10, fire: 7, dog: 15, koSpeed: 1.7 },
  SIZE: { s: { name: 'petite', pts: 0.8, prod: 0.8 }, m: { name: 'moyenne', pts: 1, prod: 1 }, l: { name: 'GROSSE', pts: 1.7, prod: 1.5 } },
  FENWICK: { accel: 7, brake: 18, max: 7, rev: 4, steer: 0.8, wb: 1.5, cap: 1 },
  CAMION: { accel: 8, brake: 18, max: 21, rev: 5, steer: 0.45, wb: 4.2, cap: 2, fuelUse: 0.05 },
  ORDER: { base: 215, perStep: 80, far: 30, interval: 44, firstAt: 2 },   // V4.1 (portage) : plus de temps pour faire les pièces (+30 % environ)
  PROD_SEC: 17, SUB_SEC: 18,
  COFFEE: { mult: 1.45, sec: 60, secPro: 120 },                           // V4.1 (portage) : café = BEAUCOUP plus vite pendant 1 min (2 min café pro / salle de pause)
  START_STOCK: { acier: 4, alu: 4, inox: 3, plaquette: 3, fraise: 3, foret: 3 },
  SPEED_LIMIT: 16.7,                   // 60 km/h : au-delà, les radars flashent
  POLICE_TRIGGER: 19.5,                // 70 km/h près de la police : poursuite
  MAP: { minX: -600, maxX: 600, minZ: -450, maxZ: 750 },          // monde entier (relief, montagnes, autoroute)
  CORE: { minX: -215, maxX: 235, minZ: -40, maxZ: 395 }            // le bourg (rues, entreprises) : tout le bassin plat
};

ML.COLORS = [
  { name: 'Rouge', hex: 0xe74c3c, css: '#e74c3c' }, { name: 'Bleu', hex: 0x3498db, css: '#3498db' },
  { name: 'Vert', hex: 0x2ecc71, css: '#2ecc71' }, { name: 'Jaune', hex: 0xf1c40f, css: '#f1c40f' },
  { name: 'Violet', hex: 0x9b59b6, css: '#9b59b6' }, { name: 'Orange', hex: 0xe67e22, css: '#e67e22' }   // 6e joueur (V4.0)
];
ML.MATERIALS = {
  acier: { label: 'ACIER', color: 0x8c9199, css: '#9aa0a8' }, alu: { label: 'ALU', color: 0xdfe5ea, css: '#e8edf1' },
  inox: { label: 'INOX', color: 0x9fc1d8, css: '#9fc1d8' }, fonte: { label: 'FONTE', color: 0x4a4038, css: '#7a6a5c' },
  soude: { label: 'MÉCANO-SOUDÉ', color: 0x5d6d7e, css: '#8193a5' }
};
ML.TOOLS = { plaquette: { label: 'Plaquette', color: 0xffd23f, css: '#ffd23f' }, fraise: { label: 'Fraise', color: 0x3fa7ff, css: '#3fa7ff' }, foret: { label: 'Foret', color: 0xff7a3f, css: '#ff7a3f' } };
ML.MTYPE = { tour: 'Tour', fraiseuse: 'Fraiseuse' };
ML.STEP = { fonderie: 'Fonderie', chaudro: 'Chaudronnerie', usinage: 'Usinage', tth: 'Traitement th.', livraison: 'Livraison' };

/* Usinabilité des matières : v = vitesse d'usinage, wear = usure d'outil en plus (/s), q = bonus de qualité.
   L'inox colle et chauffe (lent, use les plaquettes), l'alu file comme du beurre. */
ML.MAT_USIN = { acier: { v: 1, wear: 0, q: 0 }, alu: { v: 1.3, wear: -0.3, q: 3 }, inox: { v: 0.7, wear: 0.6, q: -4 }, fonte: { v: 0.9, wear: 0.2, q: -2 }, soude: { v: 0.85, wear: 0.15, q: -2 } };

/* GAMMES D'USINAGE : catalogue des opérations. mt = type de machine, tool = outil, k = durée (× PROD_SEC),
   mg = mini-jeu quand un joueur prend les commandes d'une machine MANUELLE. */
ML.OPS = {
  tournage: { n: 'Tournage', ic: '🌀', mt: 'tour', tool: 'plaquette', k: 1, mg: 'chariot' },
  gorge: { n: 'Gorge', ic: '〰️', mt: 'tour', tool: 'plaquette', k: 0.45, mg: 'chariot' },
  percage_tour: { n: 'Perçage axial', ic: '🎯', mt: 'tour', tool: 'foret', k: 0.5, mg: 'drill' },
  fraisage: { n: 'Fraisage', ic: '🌪️', mt: 'fraiseuse', tool: 'fraise', k: 0.9, mg: 'contour' },
  surfacage: { n: 'Surfaçage', ic: '▭', mt: 'fraiseuse', tool: 'fraise', k: 0.6, mg: 'contour' },
  meplat: { n: 'Méplat', ic: '◧', mt: 'fraiseuse', tool: 'fraise', k: 0.5, mg: 'contour' },
  percage: { n: 'Perçage', ic: '📍', mt: 'fraiseuse', tool: 'foret', k: 0.5, mg: 'drill' },
  taraudage: { n: 'Taraudage', ic: '🔩', mt: 'fraiseuse', tool: 'foret', k: 0.45, mg: 'tap' }
};
/* Pièces : [désignation, matière, type de la 1re machine, outil de la 1re op, gamme (ids de ML.OPS)] */
ML.PARTS = {
  plain: [['Arbre Ø40', 'acier', 'tour', 'plaquette', ['tournage']], ['Bague', 'alu', 'tour', 'plaquette', ['tournage', 'percage_tour']], ['Axe épaulé', 'inox', 'tour', 'plaquette', ['tournage', 'meplat', 'percage']],
          ['Bride de serrage', 'acier', 'fraiseuse', 'fraise', ['surfacage', 'percage']], ['Platine percée', 'alu', 'fraiseuse', 'foret', ['percage', 'taraudage']], ['Équerre', 'inox', 'fraiseuse', 'fraise', ['fraisage', 'percage']],
          ['Entretoise', 'acier', 'tour', 'plaquette', ['tournage', 'gorge']], ['Cale usinée', 'alu', 'fraiseuse', 'fraise', ['surfacage']]],
  fonderie: [['Corps de vanne', 'fonte', 'fraiseuse', 'fraise', ['surfacage', 'percage', 'taraudage']], ['Moyeu fonte', 'fonte', 'tour', 'plaquette', ['tournage', 'percage_tour']]],
  chaudro: [['Bâti mécano-soudé', 'soude', 'fraiseuse', 'fraise', ['surfacage', 'percage']], ['Embase soudée', 'soude', 'fraiseuse', 'fraise', ['fraisage']]],
  tth: [['Arbre traité', 'acier', 'tour', 'plaquette', ['tournage', 'gorge']], ['Pignon traité', 'acier', 'tour', 'plaquette', ['tournage', 'fraisage']]]
};
/* Outils de gamme partagés (hôte, HUD, BE, mini-jeux) */
ML.Routing = {
  /** Gamme d'une pièce : depuis le n-uplet, sinon par son nom, sinon une op par défaut (type + outil) */
  of(part, mtype, tool) {
    if (Array.isArray(part)) { if (Array.isArray(part[4])) return part[4].slice(); mtype = part[2]; tool = part[3]; part = part[0]; }
    for (const k in ML.PARTS) for (const p of ML.PARTS[k]) if (p[0] === part && Array.isArray(p[4])) return p[4].slice();
    for (const id in ML.OPS) if (ML.OPS[id].mt === mtype && ML.OPS[id].tool === tool) return [id];
    return [mtype === 'fraiseuse' ? 'fraisage' : 'tournage'];
  },
  /** Grosses pièces : on ne balade pas 300 kg dans l'atelier → seulement les ops du 1er type de machine.
      types (facultatif) : types de machines disponibles → les ops impossibles sautent (dépannage). */
  fit(ops, size, types) {
    let out = (ops || []).filter(id => ML.OPS[id]);
    if (!out.length) out = ['tournage'];
    if (size === 'l') out = out.filter(id => ML.OPS[id].mt === ML.OPS[out[0]].mt);
    if (types) { const t = out.filter(id => types[ML.OPS[id].mt]); if (t.length) out = t; }
    return out;
  },
  label: ops => (ops || []).map(id => (ML.OPS[id] ? ML.OPS[id].n : id)).join(' → '),
  /** Qualité 0–100 → étoiles et mot */
  grade: q => (q === null || q === undefined ? { s: '☆☆☆', w: 'pas encore usinée', k: 'na' } : q >= 82 ? { s: '★★★', w: 'excellente', k: 'top' } : q >= 55 ? { s: '★★☆', w: 'bonne', k: 'ok' } : q >= 40 ? { s: '★☆☆', w: 'limite', k: 'lim' } : { s: '✖', w: 'REBUT', k: 'nc' })
};
/* Cotes pour le contrôle au pied à coulisse : [désignation, nominal, tolérance] */
ML.COTES = [['Ø extérieur', 40, 0.05], ['Longueur', 120, 0.1], ['Alésage', 25, 0.02], ['Épaisseur', 12, 0.05], ['Entraxe', 64, 0.03]];

/* Postes de l'atelier. Les deux derniers s'achètent en campagne. */
ML.MACHINES = [
  { id: 'T1', type: 'tour', name: 'Tour CN', x: -12, z: -6, len: 4 },
  { id: 'T2', type: 'tour', name: 'Tour CN', x: -4, z: -6, len: 4 },
  { id: 'F1', type: 'fraiseuse', name: 'Fraiseuse CN', x: -12, z: 4 },
  { id: 'F2', type: 'fraiseuse', name: 'Fraiseuse CN', x: -4, z: 4 },
  { id: 'T3', type: 'tour', name: 'Tour CN', x: 4, z: -6, len: 4, upgrade: 'machine_T3' },
  { id: 'F3', type: 'fraiseuse', name: 'Fraiseuse CN', x: 4, z: 4, upgrade: 'machine_F3' }
];
ML.OPERATORS = ['amaury', 'marius', 'matis', 'brieuc'];

/* Entreprises : taille du bâtiment, métier. La POSITION est tirée au hasard à chaque partie (citygen.js). */
ML.COMPANIES = {
  boulangerie: { name: 'Boulangerie Chez Mimi', kind: 'boulangerie', npc: 'mimi', w: 12, d: 10, h: 5, wall: 'brique', color: 0xf3e0b5, roof: 0xb5523b, near: true },
  station: { name: 'Station Total-Lebec', sub: 'Essence & jerricans', kind: 'station', npc: 'pompiste', w: 14, d: 10, h: 5, wall: 'beton', color: 0xffffff, roof: 0xe74c3c, near: true },
  aciers: { name: "Aciers de l'Ouest", sub: 'Fournisseur matière', kind: 'matiere', npc: 'eliott', w: 26, d: 16, h: 8, wall: 'tole', color: 0x8d99a6, roof: 0x34495e },
  outipro: { name: "Outi'Pro", sub: "Fournisseur d'outils coupants", kind: 'outils', npc: 'coco', w: 20, d: 14, h: 7, wall: 'tole', color: 0xd35400, roof: 0x6e2c00 },
  fonderie: { name: 'Fonderie Boulard', sub: 'Sous-traitant — bruts de fonderie', kind: 'fonderie', npc: 'axel', w: 24, d: 18, h: 10, wall: 'brique', color: 0x8e5b4b, roof: 0x3b2a25 },
  chaudro: { name: 'Chaudronnerie Babinsky', sub: 'Sous-traitant — mécano-soudé', kind: 'chaudro', npc: 'nono', w: 22, d: 16, h: 9, wall: 'tole', color: 0x5d6d7e, roof: 0x2c3e50 },
  tth: { name: 'TTH Ouest', sub: 'Sous-traitant — traitement thermique', kind: 'tth', npc: 'maurseau', w: 20, d: 16, h: 8, wall: 'beton', color: 0xc0392b, roof: 0x641e16 },
  aerotech: { name: 'AéroTech', sub: 'Client', kind: 'client', npc: 'vasseur', w: 24, d: 16, h: 10, wall: 'beton', color: 0xdfe6e9, roof: 0x0984e3 },
  agrimeca: { name: 'AgriMéca', sub: 'Client', kind: 'client', npc: 'moreau', w: 24, d: 18, h: 9, wall: 'tole', color: 0x6ab04c, roof: 0x1e5631 },
  novatics: { name: 'Novatics', sub: 'Client', kind: 'client', npc: 'novatics', w: 22, d: 16, h: 11, wall: 'beton', color: 0x2d3e50, roof: 0x00a8e8, unlock: 2 },
  ublo: { name: 'Ublo', sub: 'Client', kind: 'client', npc: 'ublo', w: 20, d: 16, h: 9, wall: 'beton', color: 0xfdf2e9, roof: 0xff6f61, unlock: 3 },
  casse: { name: 'Casse Auto Jacquot', sub: 'Attention au chien !', kind: 'casse', npc: null, w: 22, d: 18, h: 4, wall: 'tole', color: 0x7f6a55, roof: 0x4b3b2a },
  usiflash: { name: 'UsiFlash', sub: 'Concurrent (louche)', kind: 'concurrent', npc: 'kevin', w: 20, d: 14, h: 7, wall: 'tole', color: 0xa29bfe, roof: 0x6c5ce7 },
  concession: { name: 'Garage Pasquier', sub: 'Concessionnaire — véhicules neufs et d\'occasion', kind: 'concession', npc: 'vendeur', w: 22, d: 14, h: 7, wall: 'beton', color: 0xf5f6fa, roof: 0xc0392b },   // V4.0 (portage)
  carriere: { name: 'Carrière du Bec', sub: 'Client — granit (sur le plateau)', kind: 'client', npc: 'roudaut', w: 26, d: 18, h: 9, wall: 'tole', color: 0xb9b4ab, roof: 0x8a5a3c, plateau: true },
  barrage: { name: 'Barrage de Kerlebec', sub: 'Client — hydroélectricité (sur le plateau)', kind: 'client', npc: 'yvonne', w: 22, d: 16, h: 10, wall: 'beton', color: 0xdfe6e9, roof: 0x2a7fa8, plateau: true },
  police: { name: 'Gendarmerie', sub: 'Brigade routière', kind: 'police', npc: null, w: 16, d: 12, h: 7, wall: 'beton', color: 0xecf0f1, roof: 0x1f3a93 }
};
ML.CLIENTS = ['aerotech', 'agrimeca', 'novatics', 'ublo', 'carriere', 'barrage'];
/* PARTICULIERS (V4.0, portage) : clients de passage qui viennent à pied au COMPTOIR de l'atelier (près de la porte)
   commander une petite pièce urgente, bien payée. Pseudo-entreprise « part » NON énumérable : COMP.part.name marche
   partout, mais le générateur de ville (Object.keys) ne lui construit pas de bâtiment. Logique : sim_roles.js (fin). */
Object.defineProperty(ML.COMPANIES, 'part', { enumerable: false, value: { name: 'Particulier', sub: 'Client au comptoir', kind: 'particulier', npc: null, virtual: true, w: 1, d: 1, h: 1, wall: 'beton', color: 0xffffff, roof: 0xe84393 } });
ML.PARTICULIERS = ['part1', 'part2', 'part3', 'part4'];
/* Pièces demandées : [désignation, matière, type de machine, outil, gamme] */
ML.PART_REQ = [['Axe de remorque', 'acier', 'tour', 'plaquette', ['tournage']], ['Bague de tracteur', 'alu', 'tour', 'plaquette', ['tournage', 'percage_tour']],
  ['Entretoise de moto', 'alu', 'tour', 'plaquette', ['tournage']], ['Platine de portail', 'acier', 'fraiseuse', 'foret', ['percage']],
  ['Patte de fixation', 'inox', 'fraiseuse', 'foret', ['percage', 'taraudage']], ['Came de tondeuse', 'acier', 'fraiseuse', 'fraise', ['fraisage']]];
/* every : délai entre deux particuliers (s) · wait : patience au comptoir · dur : délai de la pièce · mult : prix × (pièce urgente) */
ML.PARTI = { every: [150, 230], firstAt: [60, 110], wait: 90, dur: 260, mult: 2.2, price: 140, max: 2 };

/* Véhicules de l'atelier (kind) */
ML.VEHICLES = {
  megane: { name: 'la Méga Mégane', color: 0xf4c430, seats: 3 }, kangoo: { name: 'le Kangoo de Lebec', color: 0xecf0f1, seats: 3 },
  ducato: { name: 'le Ducato', color: 0x95a5a6, seats: 3 }, tp: { name: 'le transpalette', color: 0xe67e22, seats: 0 },
  fenwick: { name: 'le fenwick', color: 0xf39c12, seats: 0, role: 'cariste' }, camion: { name: 'le camion', color: 0x2c6fbb, seats: 1, role: 'livreur' }
};
ML.RACE_COLORS = [0xf4c430, 0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6, 0xe67e22];
ML.EMOTES = ['👋', '👍', '😂', '😡', '💤', '🙏'];
/* Campagne : 5 journées, la dernière = inspection (boss) */
ML.CAMPAIGN = { days: 5, bossDay: 5 };

/* Trouvailles (6 par partie) */
ML.FINDS = {
  pelle_or: { name: "Pelle d'or", desc: 'Lebec calmé pendant 2 min', color: 0xffd700 },
  pied_coulisse: { name: 'Pied à coulisse de Lebec', desc: '+25 points', color: 0xbdc3c7 },
  croissant: { name: 'Croissant légendaire', desc: 'Opérateurs ×1,5 pendant 60 s', color: 0xe1a95f },
  plaquettes: { name: 'Boîte de plaquettes oubliée', desc: '+4 plaquettes', color: 0xffd23f },
  barres: { name: "Barres tombées d'un camion", desc: '+2 alu, +2 inox', color: 0xdfe5ea },
  cafe: { name: 'Thermos du chef', desc: 'Sprint illimité 60 s', color: 0x6d4c41 },
  cle12: { name: 'Clé de 12 en or', desc: '+40 s sur les tickets', color: 0xd4af37 },
  turbo: { name: 'Turbo de Mégane', desc: 'Voitures +30 % pendant 2 min', color: 0xe74c3c },
  bidon: { name: "Bidon d'essence caché", desc: 'Plein des voitures', color: 0x27ae60 }
};

/* Humeur du jour de Lebec (tirée au hasard) */
ML.HUMEURS = {
  normal: { name: 'Lebec est comme d\'habitude', desc: 'Râleur, mais prévisible.' },
  mal_dormi: { name: 'Lebec a mal dormi', desc: 'Sa colère monte deux fois plus vite.', anger: 2 },
  bonne_humeur: { name: 'Lebec est de bonne humeur', desc: 'Colère divisée par deux, et croissants pour Matis !', anger: 0.5 },
  reforme: { name: 'Lebec a lu la dernière réforme', desc: 'Il fait des tirades aux opérateurs (qui s\'arrêtent pour l\'écouter).' },
  rendement: { name: 'Lebec veut du rendement', desc: 'Points ×1,25 mais tickets plus courts.', points: 1.25, dur: 0.85 },
  lunettes: { name: 'Lebec a perdu ses lunettes', desc: 'Il ne voit les bêtises que de près.', sight: 9 },
  dos: { name: 'Lebec a mal au dos', desc: 'Il court beaucoup moins vite avec sa pelle.', run: 4.2 }
};
ML.WEATHER = { beau: { name: 'Grand soleil', p: 0.55 }, pluie: { name: 'Pluie (ça glisse !)', p: 0.3 }, brouillard: { name: 'Brouillard', p: 0.15 } };

/* Événements surprise (2 à 4 tirés par journée) */
ML.EVENTS = {
  audit: 'Audit surprise de Jacky Foucher', coupure: 'Coupure de courant', sabotage: "Sabotage d'UsiFlash",
  herve: 'Hervé Lehec et sa convention', fred: 'Fred Castells et Arexis', mathieu: 'Mathieu Riou (il parle lentement)', panne: 'Grosse panne machine'
};

/* Règles absurdes de l'inspecteur de l'Éducation Nationale */
ML.RULES = {
  no_sprint: "Il est INTERDIT de courir dans l'établissement !",
  no_horn: 'Silence ! Aucun klaxon !',
  speed30: 'Vitesse limitée à 30 km/h en ville !',
  no_hit: 'Toute violence sera sanctionnée !',
  casque: "Port du casque OBLIGATOIRE dans l'atelier (boîte à l'entrée) !",
  no_lebec: 'Interdiction de parler à M. Lebec, il est en réunion.'
};

/* Succès débiles : [nom, description, jetons] */
ML.ACH = {
  pelle3: ['Fan de jardinage', 'Prendre 3 coups de pelle en une journée', 40],
  flash90: ['Fou du volant', 'Être flashé à plus de 90 km/h', 30],
  police_out: ['Fast & Usinage', 'Semer la police', 50],
  fires3: ['Pompier de service', 'Éteindre 3 feux de copeaux', 40],
  pigeon: ['Chasseur de pigeon', 'Faire lâcher son butin au pigeon', 40],
  slip5: ['Patineur artistique', 'Glisser sur 5 flaques d\'huile', 25],
  spill4: ['Livraison express... au sol', 'Faire tomber 4 caisses de la benne', 25],
  reverse: ['Créneau de légende', 'Arriver au quai d\'un client en marche arrière', 30],
  slap_lebec: ['Suicidaire', 'Mettre une claque à Lebec', 20],
  origine5: ['Œil de lynx', '5 prises d\'origine parfaites', 40],
  finds_all: ['Explorateur', 'Toutes les trouvailles d\'une journée', 60],
  dry: ['Panne sèche', 'Tomber en panne d\'essence', 20],
  blow: ['Coup de vent', 'Souffler un collègue avec la soufflette', 15],
  served10: ['Stakhanoviste', 'Livrer 10 caisses en une journée (équipe)', 50],
  inspection: ['Avis favorable', 'Réussir une journée d\'inspection', 80],
  traitor_win: ['Taupe parfaite', 'Gagner en traître sans être démasqué', 60]
};

/* Boutique perso (jetons du compte) */
ML.SHOP = {
  tenue_rouge: { cat: 'tenue', name: 'Bleu de travail rouge', price: 40, shirt: 0xc0392b },
  tenue_bleu: { cat: 'tenue', name: 'Bleu de travail... bleu', price: 40, shirt: 0x1f4e9a },
  tenue_orange: { cat: 'tenue', name: 'Combinaison orange', price: 60, shirt: 0xe67e22 },
  tenue_noir: { cat: 'tenue', name: 'Tenue noire classe', price: 80, shirt: 0x222222 },
  tenue_rose: { cat: 'tenue', name: 'Blouse rose', price: 80, shirt: 0xff7eb6 },
  chapeau_casquette: { cat: 'chapeau', name: 'Casquette', price: 50, hat: 'cap' },
  chapeau_bonnet: { cat: 'chapeau', name: 'Bonnet breton', price: 60, hat: 'beanie' },
  chapeau_chantier: { cat: 'chapeau', name: 'Casque de chantier', price: 70, hat: 'hard' },
  chapeau_paille: { cat: 'chapeau', name: 'Chapeau de paille', price: 90, hat: 'straw' },
  chapeau_couronne: { cat: 'chapeau', name: 'Couronne du chef', price: 500, hat: 'crown' },
  klaxon_canard: { cat: 'klaxon', name: 'Klaxon canard', price: 80 },
  klaxon_cucaracha: { cat: 'klaxon', name: 'Klaxon cucaracha', price: 150 },
  klaxon_sirene: { cat: 'klaxon', name: 'Klaxon sirène', price: 120 },
  klaxon_pelle: { cat: 'klaxon', name: 'Klaxon « Coup de pelle ! »', price: 250 },
  peinture_rouge: { cat: 'peinture', name: 'Peinture rouge pompier', price: 100, color: 0xc0392b },
  peinture_noir: { cat: 'peinture', name: 'Noir mat', price: 120, color: 0x1e1e1e },
  peinture_rose: { cat: 'peinture', name: 'Rose bonbon', price: 120, color: 0xff7eb6 },
  peinture_bleu: { cat: 'peinture', name: 'Bleu Gordini', price: 140, color: 0x1f4e9a },
  aileron: { cat: 'aileron', name: 'Aileron de course', price: 200 },
  flammes: { cat: 'flammes', name: 'Flammes sur le capot', price: 250 },
  jantes: { cat: 'jantes', name: 'Jantes dorées', price: 180 }
};
ML.SKINS = [0xf0c8a0, 0xe2b48c, 0xc68642, 0x8d5524, 0x5b3a29];
ML.HAIRS = [0x3b2a1a, 0xe0b050, 0x111111, 0x8b5a2b, 0xa0522d, 0xbdc3c7];

/* Améliorations de l'atelier en campagne (budget de l'équipe) */
ML.UPGRADES = {
  machine_T3: { name: 'Tour supplémentaire T3 + apprenti', price: 300 },
  machine_F3: { name: 'Fraiseuse supplémentaire F3 + apprentie', price: 300 },
  formation: { name: "Formation des apprentis (+1 niveau, max 3)", price: 150, max: 3 },
  grande_benne: { name: 'Rehausses de benne (6 caisses)', price: 200 },
  ducato: { name: 'Troisième véhicule (Ducato)', price: 350 },
  frigo: { name: 'Frigo de l\'atelier (Matis n\'a plus faim)', price: 150 },
  cafe_pro: { name: 'Machine à café pro (sprint 90 s)', price: 100 },
  babyfoot: { name: 'Babyfoot (pauses plus courtes)', price: 120 },
  plantes: { name: 'Plantes vertes (+ satisfaction)', price: 80 },
  posters: { name: 'Posters de Lebec (sa colère retombe plus vite)', price: 60 }
};
ML.APPRENTIS = [['Kylian', 0x2980b9], ['Lilou', 0xe84393], ['Enzo', 0x00b894], ['Inès', 0xfdcb6e], ['Nathan', 0x6c5ce7]];

/* ===================== DIFFICULTÉS (portées de la V3.2, choisies au menu, cfg.game.diff) =====================
   dur : durée des tickets · interval : temps entre deux tickets · chaos : feux / pannes / flaques / usure
   anger : colère de Lebec quand il voit une claque · base : colère minimale · run : vitesse de Lebec
   sight : portée de son regard · points : score (hors carrière) · stars : seuils d\'étoiles
   events : nombre de visiteurs surprise [min, max] · pay : prix de vente (carrière) · pen : pénalités (carrière) */
ML.DIFFS = {
  facile: { name: 'Facile', icon: '🙂', desc: 'Tickets longs, peu de chaos, Lebec patient, pénalités divisées par deux.', dur: 1.4, interval: 1.3, chaos: 0.5, anger: 0.6, base: 0, run: 0.9, points: 1, stars: 0.75, events: [1, 2], pay: 1, pen: 0.5, dmg: 0.6 },
  normal: { name: 'Normal', icon: '😐', desc: 'L\'atelier comme d\'habitude.', dur: 1, interval: 1, chaos: 1, anger: 1, base: 0, run: 1, points: 1, stars: 1, events: [2, 4], pay: 1, pen: 1 },
  difficile: { name: 'Difficile', icon: '😤', desc: 'Tickets serrés, pannes et feux fréquents, Lebec à cran. Pièces payées +10 %.', dur: 0.85, interval: 0.85, chaos: 1.5, anger: 1.3, base: 10, run: 1.08, points: 1.2, stars: 1.1, events: [3, 4], pay: 1.1, pen: 1.3, dmg: 1.25 },
  feu: { name: 'LEBEC EN FEU', icon: '🔥', desc: 'Tout brûle. Lebec voit tout, court vite et cogne fort. Points ×1,5, pièces payées +25 %, pénalités salées.', dur: 0.75, interval: 0.7, chaos: 2.2, anger: 1.8, base: 25, run: 1.18, points: 1.5, stars: 1.2, events: [4, 5], sight: 1.6, pay: 1.25, pen: 1.6, dmg: 1.6 }
};
/* Astuces affichées au menu (guide, partie solo, salon) */
ML.TIPS = [
  'Regarde la couleur du ticket : plus la barre est rouge, plus c\'est urgent.',
  'Un outil lancé (clic droit) à un usineur qui l\'attend, il l\'attrape au vol !',
  'Les caisses se lancent aussi dans la benne de la Mégane. Gain de temps garanti.',
  'Contrôle tes pièces au MARBRE : une pièce non conforme repérée à temps, c\'est un client content.',
  'Carrière : tout se gère au PC du BE (LebecOS 95) — devis, machines, matière, embauches, travaux.',
  'Une machine achetée arrive EN CAISSE : fenwick ou transpalette (R), puis E pour l\'installer.',
  'Machine manuelle (vieux tour) : prends les commandes toi-même, c\'est un mini-jeu et c\'est plus rapide.',
  'La route en corniche est plus courte… et plus dangereuse. Les clients du plateau paient mieux.',
  'Matis ralentit quand il a faim : une viennoiserie et il repart.',
  'Sors de l\'atelier pour mettre une claque : Lebec ne voit que ce qui s\'y passe.',
  'Un bac à copeaux plein bloque la machine : appelle la maintenance (T = ping).',
  'Le pigeon vole les plaquettes : lance-lui n\'importe quoi pour qu\'il la lâche.',
  'Radars en ville, gendarmerie, prison : les amendes sont à TON nom dans la compta.',
  'Touche M : la carte complète. Clic = repère pour toute l\'équipe.',
  'KO ? Pas de panique : le médecin (ou le Docteur Gwenn, un peu lent) va venir.',
  'En virage, les caisses tombent de la benne. Ralentis… ou rattrape-les.',
  'L\'huile soluble fait glisser : la soufflette sèche les flaques.',
  'Multijoueur : un pote peut rejoindre le salon même quand la journée a commencé (jusqu\'à 6).',
  'F1 : l\'aide de Lebec. Tab : les commandes. K : couper le son.',
  '« C\'est écrit dans le poly ! » — François Lebec, tous les jours depuis 1987.',
  'Un particulier au COMPTOIR (près de la porte) ? E pour prendre sa commande : petite pièce urgente, bien payée. Ne le fais pas attendre !',
  'Un colis livré : R pour l\'ouvrir (tout tombe par terre), puis E sur le rack ou l\'armoire avec les produits en main pour les ranger.',
  'Touche M : clique sur la carte pour poser un repère, le trajet s\'affiche comme un GPS. Une caisse à livrer en main ? Le GPS te guide tout seul.',
  'Un café et tu vas BEAUCOUP plus vite pendant une minute.',
  'Les caisses se lancent aussi sur le plateau du camion (clic droit).'
];

/* Rôles (choisis au salon). Sans joueur pour un rôle, un PNJ le fait… lentement. */
ML.ROLES = {
  poly: { name: 'Polyvalent', icon: '🛠️', color: 0x7f8c8d, css: '#95a5a6', desc: 'Usine, transporte et livre les petites et moyennes pièces. Plusieurs joueurs peuvent l\'être.' },
  medecin: { name: 'Médecin', icon: '⛑️', color: 0xe74c3c, css: '#e74c3c', desc: 'Seul à pouvoir soigner les blessés (E sur un collègue).', npc: 'docteur' },
  cariste: { name: 'Cariste', icon: '🚜', color: 0xf39c12, css: '#f39c12', desc: 'Seul habilité au FENWICK : déplace les grosses pièces (R : fourches).', npc: 'momo' },
  livreur: { name: 'Livreur', icon: '🚚', color: 0x3498db, css: '#3498db', desc: 'Seul habilité au CAMION : livre les grosses pièces (R : décharger chez le client).', npc: 'momo' },
  maintenance: { name: 'Maintenance', icon: '🔧', color: 0x27ae60, css: '#27ae60', desc: 'Répare les pannes et vide les bacs à copeaux.', npc: 'gege' },
  magasinier: { name: 'Magasinier', icon: '📦', color: 0x9b59b6, css: '#9b59b6', desc: 'Seul à commander matière et outils chez Eliott et Coco.', npc: 'sylvie' }
};
ML.SUITS = [0x1f4e9a, 0x2c3e50, 0x7f8c8d, 0x27ae60, 0xc0392b, 0xe67e22, 0x8e44ad, 0x111111];

/* Personnages */
ML.PEOPLE = {
  lebec: { name: 'François Lebec', role: "Chef d'atelier", look: { skin: 0xe2b48c, shirt: 0xdfe6e9, pants: 0x2d2d2d, hair: 0x9a9a9a, height: 1.86, width: 0.72, mustache: true, shovel: true, blouse: 0x2e8b57, backText: "C'EST ÉCRIT DANS LE POLY !!" } },
  docteur: { name: 'Docteur Gwenn', role: 'Médecin du travail', visitor: true, look: { skin: 0xf0c8a0, shirt: 0xffffff, pants: 0xffffff, hair: 0x5a3d22, height: 1.7, longHair: true, blouse: 0xffffff, glasses: true } },
  gege: { name: 'Gégé', role: 'Maintenance (prestataire)', visitor: true, look: { skin: 0xe2b48c, shirt: 0x27ae60, pants: 0x27ae60, hair: 0x7f8c8d, height: 1.75, width: 1.2, mustache: true, cap: 0x27ae60 } },
  momo: { name: 'Momo', role: 'Cariste-livreur (intérimaire)', visitor: true, look: { skin: 0x8d5524, shirt: 0xf39c12, pants: 0x2c3e50, hair: 0x111111, height: 1.8, cap: 0xf39c12 } },
  sylvie: { name: 'Sylvie', role: 'Magasinière (agence)', visitor: true, look: { skin: 0xf3cba5, shirt: 0x9b59b6, pants: 0x34495e, hair: 0xe0b050, height: 1.65, longHair: true, glasses: true } },
  amaury: { name: 'Amaury Carter', role: 'Opérateur', op: { speed: 1.0, lazy: 0.04, traits: ['forgetful'] }, look: { skin: 0xf0c8a0, shirt: 0x4e8a3e, pants: 0x34495e, hair: 0x6b4a2b, height: 1.83 } },
  marius: { name: 'Marius Challine', role: 'Opérateur', op: { speed: 1.2, lazy: 0, traits: ['robot'] }, look: { skin: 0xeac39b, shirt: 0x7f8c8d, pants: 0x2c3e50, hair: 0x222222, height: 1.86 } },
  matis: { name: 'Matis Caillou', role: 'Opérateur', op: { speed: 1.0, lazy: 0.08, traits: ['hungry'] }, look: { skin: 0xf5cfaa, shirt: 0xe67e22, pants: 0x2c3e50, hair: 0xe0b050, height: 1.72, width: 1.2 } },
  brieuc: { name: 'Brieuc', role: 'Opérateur', op: { speed: 1.35, lazy: 0.45, traits: ['deadstop'] }, look: { skin: 0x5b3a29, shirt: 0xc0392b, pants: 0x222831, hair: 0x111111, height: 1.55, width: 1.3 } },
  app1: { name: 'Apprenti', role: 'Apprenti', op: { speed: 0.7, lazy: 0.1, traits: ['apprenti'] }, look: { skin: 0xf0c8a0, shirt: 0x2980b9, pants: 0x34495e, hair: 0x3b2a1a, height: 1.74 } },
  app2: { name: 'Apprentie', role: 'Apprentie', op: { speed: 0.7, lazy: 0.1, traits: ['apprenti'] }, look: { skin: 0xc68642, shirt: 0xe84393, pants: 0x34495e, hair: 0x111111, height: 1.66, longHair: true } },
  roudaut: { name: 'Roudaut', role: 'Chef de carrière', look: { skin: 0xe2b48c, shirt: 0xf28c28, pants: 0x4b5a6b, hair: 0x5a3d22, height: 1.9, width: 1.3, beard: true, helmet: 0xffc93c } },
  yvonne: { name: 'Yvonne', role: 'Ingénieure du barrage', look: { skin: 0xf3cba5, shirt: 0x2a7fa8, pants: 0x34495e, hair: 0xb0b0b0, height: 1.68, longHair: true, glasses: true } },
  mimi: { name: 'Mimi', role: 'Boulangère', look: { skin: 0xf3cba5, shirt: 0xffffff, pants: 0x555555, hair: 0x8b5a2b, height: 1.64, longHair: true, apron: 0xf5e6c8 } },
  pompiste: { name: 'Dédé', role: 'Pompiste', look: { skin: 0xe2b48c, shirt: 0xe74c3c, pants: 0x2c3e50, hair: 0x7f8c8d, height: 1.75, cap: 0xe74c3c, mustache: true } },
  eliott: { name: 'Eliott Trit', role: "Commercial — Aciers de l'Ouest", look: { skin: 0xf2c6a0, shirt: 0xd35400, pants: 0x2c3e50, hair: 0xb5651d, height: 2.05, width: 0.9 } },
  coco: { name: 'Coco Allo', role: "Vendeur — Outi'Pro", look: { skin: 0xd9a37a, shirt: 0x1e1e1e, pants: 0x444444, hair: 0x3b2a1a, height: 1.8, cap: 0xd63031, gloves: 0xd63031 } },
  axel: { name: 'Axel Boulard', role: 'Fondeur', look: { skin: 0xf0c8a0, shirt: 0x16a085, pants: 0x34495e, hair: 0x5a3d22, height: 1.78, apron: 0x6d4c41 } },
  nono: { name: 'Nono Babinsky', role: 'Chaudronnier', look: { skin: 0xf2c9a5, shirt: 0x8e44ad, pants: 0x34495e, hair: 0xc9a35b, height: 1.76, mask: true } },
  maurseau: { name: 'Maurseau Sice', role: 'Traitement thermique', look: { skin: 0xf3c7a0, shirt: 0xf1c40f, pants: 0x2d3436, hair: 0x2c1b0e, height: 1.52 } },
  vasseur: { name: 'M. Vasseur', role: 'Client — AéroTech', look: { skin: 0xe8b98f, shirt: 0x1c1c1c, pants: 0x1c1c1c, hair: 0x333333, height: 1.78, tie: 0x2980b9, glasses: true } },
  moreau: { name: 'Mme Moreau', role: 'Cliente — AgriMéca', look: { skin: 0xeec4a0, shirt: 0x27ae60, pants: 0x1e5631, hair: 0xa0522d, height: 1.68, longHair: true } },
  novatics: { name: 'Accueil Novatics', role: 'Client — Novatics', look: { skin: 0xe6b48d, shirt: 0x00a8e8, pants: 0x2d3e50, hair: 0x2a2a2a, height: 1.76 } },
  ublo: { name: 'Accueil Ublo', role: 'Client — Ublo', look: { skin: 0xf0c8a0, shirt: 0xff6f61, pants: 0x34495e, hair: 0x4a3426, height: 1.7, longHair: true } },
  kevin: { name: 'Kévin', role: "Chef d'atelier — UsiFlash", look: { skin: 0xd9a37a, shirt: 0x6c5ce7, pants: 0x222222, hair: 0x111111, height: 1.77, cap: 0x111111 } },
  vendeur: { name: 'Bernard Pasquier', role: 'Concessionnaire — Garage Pasquier', look: { skin: 0xe8b98f, shirt: 0xc0392b, pants: 0x1c1c1c, hair: 0xbdc3c7, height: 1.79, width: 1.15, glasses: true } },
  // particuliers (V4.0, portage) : viennent au comptoir de l'atelier
  part1: { name: 'Gérard Le Floch', role: 'Agriculteur', visitor: true, look: { skin: 0xe2b48c, shirt: 0x27ae60, pants: 0x34495e, hair: 0xbdc3c7, height: 1.76, width: 1.2 } },
  part2: { name: 'Mme Rousseau', role: 'Retraitée bricoleuse', visitor: true, look: { skin: 0xf3cba5, shirt: 0x8e44ad, pants: 0x555555, hair: 0xdddddd, height: 1.6, longHair: true, glasses: true } },
  part3: { name: 'Jean-Mi', role: 'Motard', visitor: true, look: { skin: 0xd9a37a, shirt: 0x111111, pants: 0x1f4e9a, hair: 0x3b2a1a, height: 1.84, beard: true } },
  part4: { name: 'Patrick', role: 'Voisin (portail cassé)', visitor: true, look: { skin: 0xf0c8a0, shirt: 0xe67e22, pants: 0x34495e, hair: 0x8b5a2b, height: 1.72, width: 1.25 } },
  // visiteurs et événements
  jacky: { name: 'Jacky Foucher', role: 'Inspecteur Qualité', visitor: true, look: { skin: 0xe8b98f, shirt: 0xf4f4f4, pants: 0x2c3e50, hair: 0x555555, height: 1.86, tie: 0x2c3e50, glasses: true } },
  herve: { name: 'Hervé Lehec', role: 'Référent stages', visitor: true, look: { skin: 0xeec4a0, shirt: 0xbfa77a, pants: 0x4d4d4d, hair: 0x777777, height: 1.74, glasses: true } },
  fred: { name: 'Fred Castells', role: 'Recruteur', visitor: true, look: { skin: 0xe6b48d, shirt: 0x34495e, pants: 0x34495e, hair: 0x2a2a2a, height: 1.82, tie: 0xc0392b } },
  mathieu: { name: 'Mathieu Riou', role: 'Visiteur bavard', visitor: true, look: { skin: 0xf0c8a0, shirt: 0x2980b9, pants: 0x2d2d2d, hair: 0x3d2b1f, height: 1.8 } },
  saboteur: { name: 'Gars louche', role: "Saboteur d'UsiFlash", visitor: true, look: { skin: 0xd9a37a, shirt: 0x222222, pants: 0x111111, hair: 0x111111, height: 1.8, cap: 0x6c5ce7 } },
  inspecteur: { name: "L'Inspecteur", role: "Inspecteur de l'Éducation Nationale", visitor: true, look: { skin: 0xe8c39e, shirt: 0x5d6d7e, pants: 0x5d6d7e, hair: 0xdddddd, height: 1.9, tie: 0x8e44ad, glasses: true, mustache: true } }
};

ML.LINES = {
  docteur: ['On ne court pas dans un atelier !', 'Respirez… Toussez… Bon, vous vivrez.', 'Encore un coup de pelle ? Je vais finir par avoir un abonnement.'],
  gege: ['Ah ben elle était bien grippée celle-là.', 'Fallait m\'appeler plus tôt !', 'Je repasse jeudi. Peut-être.'],
  momo: ['Une palette ? J\'arrive… doucement.', 'Le fenwick c\'est pas un jouet.'],
  sylvie: ['Commande passée, livraison dans la journée.', 'Il faut un bon de commande signé, hein.'],
  lebec: ["Encore une réforme de l'Éducation Nationale... on forme des usineurs en trois semaines !", "La cote c'est la cote ! Pas « à peu près » !",
          "De mon temps, le CAP c'était deux ans de lime et d'étau !", "Pas un rond pour les machines, mais des tablettes pour tout le monde !", "Qui a laissé traîner de l'huile soluble ?!"],
  tirade: ["Écoute-moi bien. En 1987, on avait QUATRE ans de formation.", "Aujourd'hui ? Un module de 12 h « sensibilisation à l'usinage » !", "Les gamins savent pas ce qu'est un Ra. UN RA !"],
  amaury: ["Euh... j'usinais quoi déjà ?", "Ma Méga Mégane, elle est où ?"],
  marius: ['Instruction reçue. Exécution.', 'Programme en cours.'],
  matis: ["J'ai faiiiim...", 'Regarde le copeau, on dirait un serpent !'],
  brieuc: ['Flemme.', "Là j'peux pas, j'suis en pause."],
  app1: ['Chef, c\'est normal que ça fume ?', 'On m\'a dit de demander un pot de peinture à rayures.'],
  app2: ['Je note tout dans mon carnet !', 'C\'est quoi une MIP ?'],
  mimi: ['Bonjour mon grand ! Une viennoiserie ?', 'Les croissants sortent du four !'],
  pompiste: ['Le plein ? Prends un jerrican, c\'est cadeau.', 'Sans plomb ou gazole ? De toute façon la Mégane boit tout.'],
  eliott: ["Salut-ça-va-moi-ça-va-qu'est-ce-que-je-te-mets ?", "Rapide-rapide-j'ai-quatre-clients-après-toi !"],
  coco: ["T'as vu le combat samedi ? Crochet du gauche, BAM !", 'Jab, jab, uppercut !'],
  cocoBoxe: ['La garde ! Toujours la garde haute.', 'Le crochet du gauche, tout part de la hanche.', "Le jab, c'est pour mesurer la distance. Comme un comparateur.", 'Et là BAM, au tapis ! Bon, tiens tes outils.'],
  axel: ['Je coule, je coule. Tranquille.', 'La fonte, ça se respecte.'],
  nono: ["Pourquoi le soudeur est toujours calme ? Il a l'arc bien réglé ! HAHAHA", "C'est l'histoire d'une tôle... elle était pliée de rire ! HAHA"],
  maurseau: ["C'EST CHAUD ! WOUHOU !", 'Trempe, revenu, je cours !'],
  vasseur: ['Les délais sont les délais.', "La qualité n'est pas négociable."],
  moreau: ['Vite vite vite ! Mes tracteurs attendent !'],
  novatics: ['Bonjour ! Vous avez notre commande ?'],
  ublo: ["Salut ! C'est pour nous ?"],
  kevin: ['Chut. On ne s\'est jamais vus.', 'Une caisse de chez Lebec ? Je prends, je prends.'],
  vendeur: ['Elle a jamais roulé sous la pluie, celle-là !', 'Pour vous, je fais un prix. Enfin… presque.', 'Contrôle technique ? Il passera. Sûrement.', 'Le Kangoo de Lebec ? Je le reprends pas, même gratuit.'],
  part1: ['Mon tracteur est en panne en pleine moisson !', 'Vous me sauvez la vie, là.'],
  part2: ['C\'est pour ma remorque, mon défunt mari la bichonnait…', 'Merci jeune homme !'],
  part3: ['Ma bécane démarre plus, faut que ça roule ce week-end !', 'Trop stylé, merci !'],
  part4: ['Le portail ne ferme plus, les chiens du voisin rentrent !', 'Impeccable, merci les gars.'],
  jacky: ['MIP/MAP irréprochable, appui plan sur la Réf A.', 'Apportez-moi une caisse au marbre. Tout de suite.'],
  herve: ['Alors, ce stage, trouvé ? Et la convention ?', "Pas de convention, pas d'outils ! C'est le règlement."],
  fred: ["Tu as pensé à l'alternance ? Penses-y... Naval Group recrute !", 'Tu as rempli Arexis ? ARÉXIS !'],
  mathieu: ['Alors... euh... du coup... tu... vois... ?', 'En fait... du coup... voilà... quoi.'],
  saboteur: ['Rien à voir, je passe.', 'Hé hé hé...'],
  inspecteur: ['Je note. Je note tout.', 'Votre référentiel de compétences, je vous prie.', 'Infraction !']
};
/* Les listes ci-dessus sont des SECOURS : js/persos.js (chargé juste après) les remplace et en ajoute
   des centaines (une par situation : ML.LINES[id + '_' + situation], ML.LINE_META[clé] = { o: id, sit }).
   - ML.line(id, situation, secours) : tirage « paquet de cartes » (jamais deux fois la même tant que
     la liste n'a pas été dite en entier). Cherche la liste du perso, puis celle de son trait (ouvriers
     embauchés : [robot], [gourmand]…), puis [ouvrier], puis [tous], sinon `secours` (texte ou tableau).
   - ML.redraw(texte, id) : si `texte` est une réplique connue (ou commence par une), la remplace par un
     tirage de la même situation pour ce perso. Branché dans K.say (sim.js) et les dialogues : les
     phrases écrites en dur ailleurs profitent ainsi des listes de persos.js. */
(function () {
  const bags = {};
  ML.LINE_META = ML.LINE_META || {};
  ML.PERSO_TRAITS = { forgetful: 'tete_en_lair', robot: 'robot', hungry: 'gourmand', deadstop: 'flemmard', apprenti: 'apprenti' };
  const has = k => Array.isArray(ML.LINES[k]) && ML.LINES[k].length > 0;
  const keyOf = (o, sit) => sit && sit !== 'repliques' ? o + '_' + sit : o;
  ML.drawLine = k => {
    const a = ML.LINES[k]; if (!a || !a.length) return undefined;
    let b = bags[k];
    if (!b || b.src !== a || !b.q.length) {
      const q = a.slice();
      for (let j = q.length - 1; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); [q[j], q[r]] = [q[r], q[j]]; }
      if (b && b.last && q.length > 1 && q[q.length - 1] === b.last) [q[0], q[q.length - 1]] = [q[q.length - 1], q[0]];
      b = bags[k] = { src: a, q, last: b && b.last };
    }
    return (ML.drawLine.last = b.last = b.q.pop());
  };
  ML.lineChain = id => {
    const P = id && ML.PEOPLE[id], out = [id];
    if (P && P.op) { for (const t of P.op.traits || []) if (ML.PERSO_TRAITS[t]) out.push(ML.PERSO_TRAITS[t]); out.push('ouvrier'); }
    out.push('tous'); return out;
  };
  ML.line = (id, sit, fb) => {
    const own = keyOf(id, sit); if (has(own)) return ML.drawLine(own);
    const rest = ML.lineChain(id).slice(1).map(o => keyOf(o, sit)).filter(has);
    if (rest.length) return ML.drawLine(sit && sit !== 'repliques' ? rest[0] : rest[Math.floor(Math.random() * rest.length)]);
    return Array.isArray(fb) ? fb[Math.floor(Math.random() * fb.length)] : fb;
  };
  let idx = null;
  const ALIAS = { tirade: { o: 'lebec', sit: 'tirades' }, cocoBoxe: { o: 'coco', sit: 'boxe' } };
  function build() {
    idx = new Map();
    for (const k in ML.LINES) {
      const a = ML.LINES[k], meta = ML.LINE_META[k] || ALIAS[k] || { o: k, sit: null }; if (!Array.isArray(a)) continue;
      for (const s of a) if (typeof s === 'string') { const l = idx.get(s) || []; if (!l.some(e => e.o === meta.o && e.sit === meta.sit)) l.push(meta); idx.set(s, l); }
    }
  }
  function find(s, id) {
    const c = idx.get(s); if (!c) return null;
    const ch = id && ML.PEOPLE[id] ? ML.lineChain(id) : null, ok = ch ? c.filter(e => ch.includes(e.o)) : c;
    return ok.find(e => e.sit) || ok[0] || null;
  }
  ML.lineMeta = s => { if (!idx) build(); return find(s); };      // { o, sit } d'une réplique connue, sinon null
  ML.redraw = (s, id) => {
    if (typeof s !== 'string' || !s || s === ML.drawLine.last) return s;
    if (!idx) build();
    let e = find(s, id); if (e) return ML.line(id && ML.PEOPLE[id] ? id : e.o, e.sit, s);
    const m = s.match(/^(.+?[.!?…»])\s+(\S[\s\S]*)$/);
    if (m && (e = find(m[1], id))) return ML.line(id && ML.PEOPLE[id] ? id : e.o, e.sit, m[1]) + ' ' + m[2];
    return s;
  };
})();

ML.QUIZ_JACKY = [
  ["Pour la mise en position, où placez-vous l'appui plan ?", 'Sur la surface Réf A', 'Sur la face la plus large', 'Sur la Réf C', 'On serre fort, ça ira'],
  ['Combien de degrés de liberté supprime un appui plan ?', '3', '1', '2', '6'],
  ['Où appliquer le maintien en position (MAP) ?', 'Au droit des appuis', 'Loin des appuis', 'Sur la surface finie', 'Au marteau'],
  ['Une linéaire rectiligne supprime combien de DDL ?', '2', '1', '3', '4'],
  ['Une ponctuelle (butée) supprime combien de DDL ?', '1', '0', '2', '3']
];
