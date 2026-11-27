/* =====================================================================
   config.js — Données & réglages de MÉCANIQUE LEBEC (V4)
   C'est LE fichier à modifier pour l'équilibrage et le contenu :
   entreprises, pièces, événements, humeurs, succès, boutique.
   (Les personnages et leurs répliques sont dans js/persos.js.)
   ===================================================================== */
window.ML = window.ML || {};
ML.debug = /[?&]debug/.test(location.search);

ML.CFG = {
  SHIFT_SEC: 480,                      // une journée (7h → 19h) = 8 minutes réelles (V5.4 : on revient à 8 min)
  DAY_START: 7 * 60, DAY_END: 19 * 60,
  PLAYER: { eye: 1.65, r: 0.35, walk: 5.6, sprint: 8.8, stamina: 4 },
  CAR: { accel: 13, brake: 24, max: 27, rev: 7, steer: 0.55, wb: 2.6, cap: 4, fuelUse: 0.04 },
  TP: { accel: 10, brake: 20, max: 4.8, rev: 3, steer: 0.9, wb: 1.2, cap: 4 },      // transpalette
  REACH: 5,
  NET: { poseHz: 15, fastHz: 10, slowEvery: 1 },
  LEBEC: { base: 10, chaseAt: 50, hit: 45, run: 6.9, reach: 1.5, sight: 24 },
  HP: { max: 100, pelle: 20, slap: 5, slip: 10, fire: 7, dog: 15, koSpeed: 1.7 },
  SIZE: { s: { name: 'petite', pts: 0.8, prod: 0.8 }, m: { name: 'moyenne', pts: 1, prod: 1 }, l: { name: 'GROSSE', pts: 1.7, prod: 1.5 } },
  FENWICK: { accel: 7, brake: 18, max: 7, rev: 4, steer: 0.8, wb: 1.5, cap: 1 },
  CAMION: { accel: 9, brake: 20, max: 24, rev: 5, steer: 0.45, wb: 4.2, cap: 8, fuelUse: 0.05 },   // plateau : 8 places (palette = 4)
  KANGOO: { accel: 9, brake: 20, max: 19, rev: 5, steer: 0.55, wb: 2.5, fuelUse: 0.045 },             // le vieux Kangoo : poussif
  DUCATO: { accel: 11, brake: 22, max: 24, rev: 6, steer: 0.5, wb: 3, fuelUse: 0.05 },
  SCOOTER: { accel: 8, brake: 18, max: 13.5, rev: 2.5, steer: 0.8, wb: 1.3, cap: 2, fuelUse: 0.018 },     // V5.2 : pas cher, mais lent (≈ 49 km/h)
  ORDER: { base: 250, perStep: 90, far: 35, interval: 44, firstAt: 2 },   // V4.1 : beaucoup plus de temps pour faire les pièces
  PROD_SEC: 14, SUB_SEC: 16,
  COFFEE: { mult: 1.45, sec: 60, secPro: 120 },                           // café : on va beaucoup plus vite
  START_STOCK: { acier: 4, alu: 4, inox: 3, plaquette: 3, fraise: 3, foret: 3 },
  SPEED_LIMIT: 16.7,                   // 60 km/h : au-delà, les radars flashent
  POLICE_TRIGGER: 19.5,                // 70 km/h près de la police : poursuite
  MAP: { minX: -170, maxX: 170, minZ: -40, maxZ: 330 }
};

ML.COLORS = [
  { name: 'Rouge', hex: 0xe74c3c, css: '#e74c3c' }, { name: 'Bleu', hex: 0x3498db, css: '#3498db' },
  { name: 'Vert', hex: 0x2ecc71, css: '#2ecc71' }, { name: 'Jaune', hex: 0xf1c40f, css: '#f1c40f' },
  { name: 'Violet', hex: 0x9b59b6, css: '#9b59b6' }, { name: 'Orange', hex: 0xe67e22, css: '#e67e22' }
];
ML.MATERIALS = {
  acier: { label: 'ACIER', color: 0x8c9199, css: '#9aa0a8' }, alu: { label: 'ALU', color: 0xdfe5ea, css: '#e8edf1' },
  inox: { label: 'INOX', color: 0x9fc1d8, css: '#9fc1d8' }, fonte: { label: 'FONTE', color: 0x4a4038, css: '#7a6a5c' },
  soude: { label: 'MÉCANO-SOUDÉ', color: 0x5d6d7e, css: '#8193a5' }
};
ML.TOOLS = { plaquette: { label: 'Plaquette', color: 0xffd23f, css: '#ffd23f' }, fraise: { label: 'Fraise', color: 0x3fa7ff, css: '#3fa7ff' }, foret: { label: 'Foret', color: 0xff7a3f, css: '#ff7a3f' } };
ML.MTYPE = { tour: 'Tour', fraiseuse: 'Fraiseuse' };
ML.STEP = { fonderie: 'Fonderie', chaudro: 'Chaudronnerie', usinage: 'Usinage', tth: 'Traitement th.', livraison: 'Livraison' };

ML.PARTS = {
  plain: [['Arbre Ø40', 'acier', 'tour', 'plaquette'], ['Bague', 'alu', 'tour', 'plaquette'], ['Axe épaulé', 'inox', 'tour', 'plaquette'],
          ['Bride de serrage', 'acier', 'fraiseuse', 'fraise'], ['Platine percée', 'alu', 'fraiseuse', 'foret'], ['Équerre', 'inox', 'fraiseuse', 'foret'],
          // V5.3 : plus de pièces différentes
          ['Entretoise', 'alu', 'tour', 'plaquette'], ['Douille', 'acier', 'tour', 'plaquette'], ['Goupille épaulée', 'inox', 'tour', 'plaquette'], ['Flasque', 'alu', 'tour', 'plaquette'],
          ['Support de palier', 'acier', 'fraiseuse', 'fraise'], ['Plaque de base', 'alu', 'fraiseuse', 'fraise'], ['Came', 'acier', 'fraiseuse', 'fraise'],
          ['Raidisseur', 'acier', 'fraiseuse', 'foret'], ['Cale de réglage', 'inox', 'fraiseuse', 'fraise'], ['Rondelle épaisse', 'acier', 'tour', 'plaquette']],
  fonderie: [['Corps de vanne', 'fonte', 'fraiseuse', 'fraise'], ['Moyeu fonte', 'fonte', 'tour', 'plaquette'], ['Carter de réducteur', 'fonte', 'fraiseuse', 'fraise'], ['Poulie fonte', 'fonte', 'tour', 'plaquette'], ['Palier fonte', 'fonte', 'fraiseuse', 'foret']],
  chaudro: [['Bâti mécano-soudé', 'soude', 'fraiseuse', 'foret'], ['Embase soudée', 'soude', 'fraiseuse', 'fraise'], ['Châssis soudé', 'soude', 'fraiseuse', 'fraise'], ['Potence soudée', 'soude', 'fraiseuse', 'foret'], ['Cadre de protection', 'soude', 'fraiseuse', 'foret']],
  tth: [['Arbre traité', 'acier', 'tour', 'plaquette'], ['Pignon traité', 'acier', 'fraiseuse', 'fraise'], ['Axe cémenté', 'acier', 'tour', 'plaquette'], ['Came trempée', 'acier', 'fraiseuse', 'fraise'], ['Couteau de broyeur', 'acier', 'fraiseuse', 'fraise']],
  aerotech: [['Ferrure d\'aile', 'alu', 'fraiseuse', 'fraise'], ['Axe de train', 'inox', 'tour', 'plaquette'], ['Support de capteur', 'alu', 'fraiseuse', 'foret']],
  agrimeca: [['Dent de herse', 'acier', 'fraiseuse', 'foret'], ['Moyeu de roue', 'acier', 'tour', 'plaquette'], ['Axe de relevage', 'acier', 'tour', 'plaquette']],
  novatics: [['Boîtier électronique', 'alu', 'fraiseuse', 'fraise'], ['Radiateur', 'alu', 'fraiseuse', 'foret'], ['Entretoise filetée', 'inox', 'tour', 'plaquette']],
  ublo: [['Boîtier de montre', 'inox', 'tour', 'plaquette'], ['Couronne', 'inox', 'tour', 'plaquette'], ['Platine de mouvement', 'alu', 'fraiseuse', 'foret']],
  // pièces propres à un client (demandes « simples »)
  espacil: [['Gond de portail', 'acier', 'tour', 'plaquette'], ['Axe de porte de garage', 'inox', 'tour', 'plaquette'], ['Platine de boîte aux lettres', 'alu', 'fraiseuse', 'foret'],
            ['Patte de garde-corps', 'acier', 'fraiseuse', 'fraise'], ['Fouillot de serrure', 'inox', 'fraiseuse', 'foret'], ['Galet de porte coulissante', 'alu', 'tour', 'plaquette']]
};
/* Cotes pour le contrôle au pied à coulisse : [désignation, nominal, tolérance] */
ML.COTES = [['Ø extérieur', 40, 0.05], ['Longueur', 120, 0.1], ['Alésage', 25, 0.02], ['Épaisseur', 12, 0.05], ['Entraxe', 64, 0.03]];

/* Postes de l'atelier. Au départ : T1 + F1. Les autres s'achètent au PC (T3/F3 : après l'agrandissement). */
ML.MACHINES = [
  { id: 'T1', type: 'tour', name: 'Tour CN', x: -12, z: -6, len: 4 },
  { id: 'T2', type: 'tour', name: 'Tour CN', x: -4, z: -6, len: 4 },
  { id: 'F1', type: 'fraiseuse', name: 'Fraiseuse CN', x: -12, z: 4 },
  { id: 'F2', type: 'fraiseuse', name: 'Fraiseuse CN', x: -4, z: 4 },
  { id: 'T3', type: 'tour', name: 'Tour CN', x: 4, z: -6, len: 4, upgrade: 'machine_T3' },
  { id: 'F3', type: 'fraiseuse', name: 'Fraiseuse CN', x: 4, z: 4, upgrade: 'machine_F3' },
  { id: 'T4', type: 'tour', name: 'Tour CN', x: 27, z: -6, len: 4, ext: true },              // V5 : dans l'EXTENSION (est)
  { id: 'F4', type: 'fraiseuse', name: 'Fraiseuse CN', x: 27, z: 3.5, ext: true }
];
ML.OPERATORS = ['amaury', 'marius', 'matis', 'brieuc'];
ML.MACHINE_ORDER = ['T1', 'F1', 'T2', 'F2', 'T3', 'F3', 'T4', 'F4'];
/* V5 : l'atelier grandit avec les jours (campagne ET journées libres qui s'enchaînent).
   Les emplacements bloqués sont gris au sol, avec « se débloque dans N jours » (compte à rebours qui
   descend vraiment pendant la journée). V5.2 : on peut aussi les débloquer TOUT DE SUITE au PC, plus cher (EARLY). */
ML.PROGRESS = { agrandissement: 3, extension: 8, reno2: 5, reno3: 10 };
ML.EARLY = { perDay: 450, min: 300 };                                   // supplément pour un achat anticipé : 450 € par jour d'avance (300 € mini)

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
  novatics: { name: 'Novatics', sub: 'Client', kind: 'client', npc: 'novatics', w: 22, d: 16, h: 11, wall: 'beton', color: 0x2d3e50, roof: 0x00a8e8, unlockRep: 55 },
  ublo: { name: 'Ublo', sub: 'Client', kind: 'client', npc: 'ublo', w: 20, d: 16, h: 9, wall: 'beton', color: 0xfdf2e9, roof: 0xff6f61, unlockRep: 70 },
  casse: { name: 'Casse Auto Jacquot', sub: 'Attention au chien !', kind: 'casse', npc: null, w: 22, d: 18, h: 4, wall: 'tole', color: 0x7f6a55, roof: 0x4b3b2a },
  usiflash: { name: 'UsiFlash', sub: 'Concurrent (louche)', kind: 'concurrent', npc: 'kevin', w: 20, d: 14, h: 7, wall: 'tole', color: 0xa29bfe, roof: 0x6c5ce7 },
  police: { name: 'Gendarmerie', sub: 'Brigade routière — on entre par la porte', kind: 'police', npc: 'gendarme', w: 22, d: 16, h: 7, wall: 'beton', color: 0xecf0f1, roof: 0x1f3a93, open: true },
  concession: { name: 'Garage Pasquier', sub: 'Concessionnaire — entrez voir le showroom !', kind: 'concession', npc: 'vendeur', w: 30, d: 18, h: 8, wall: 'beton', color: 0xf5f6fa, roof: 0xc0392b, open: true },
  espacil: { name: 'Espacil Habitat', sub: 'Bailleur social — Client', kind: 'client', npc: 'espacil', w: 22, d: 16, h: 13, wall: 'beton', color: 0xf3efe6, roof: 0x13a89e },
  // V5.2 : lieux où l'on entre
  mall: { name: 'Centre commercial Les Copeaux', sub: 'Snack · farces & attrapes · boxe', kind: 'mall', short: 'Centre co.', npc: 'vendeuse', w: 26, d: 17, h: 9, wall: 'beton', color: 0xf5f0e6, roof: 0x8e44ad, open: true, near: true },
  gym: { name: 'Salle de sport Le Biceps', sub: 'Tapis de course : + endurance', kind: 'gym', short: 'Salle de sport', npc: 'coach', w: 18, d: 13, h: 7, wall: 'beton', color: 0xeaf2f8, roof: 0x16a085, open: true },
  part: { name: 'Particulier', sub: 'Client au comptoir', kind: 'particulier', npc: null, virtual: true, w: 1, d: 1, h: 1, wall: 'beton', color: 0xffffff, roof: 0xe84393 },
  sae: { name: 'Jury de SAE', sub: 'IUT — Situation d\'Apprentissage et d\'Évaluation', kind: 'sae', npc: null, virtual: true, w: 1, d: 1, h: 1, wall: 'beton', color: 0xffffff, roof: 0x6c5ce7 }
};
ML.CLIENTS = ['aerotech', 'agrimeca', 'novatics', 'ublo', 'espacil'];
/* V5.2 : maisons des copains (posées parmi les maisons de la ville, avec leur nom). Elles servent aux quêtes. */
ML.LIEUX = {
  cardin: { name: 'Maison de Cardin', style: 'maison', who: 'cardin', color: '#c0392b' },
  trit: { name: 'Appartement de Trit', style: 'immeuble', who: 'eliott', color: '#d35400' },
  kawa: { name: 'Maison de Jimmy Kawa', style: 'maison', who: 'kawa', color: '#2980b9' }
};
for (const k in ML.COMPANIES) if (ML.COMPANIES[k].kind === 'client') ML.COMPANIES[k].open = true;   // V5 : on entre chez les clients (accueil)

/* Véhicules de l'atelier (kind) */
ML.VEHICLES = {
  megane: { name: 'la Méga Mégane', color: 0xf4c430, seats: 3 }, kangoo: { name: 'le vieux Kangoo', color: 0xecf0f1, seats: 3 },
  ducato: { name: 'le Ducato', color: 0x95a5a6, seats: 3 }, tp: { name: 'le transpalette', color: 0xe67e22, seats: 0 },
  fenwick: { name: 'le fenwick', color: 0xf39c12, seats: 0, role: 'cariste' }, camion: { name: 'le camion', color: 0x2c6fbb, seats: 1, role: 'livreur' },
  scooter: { name: 'le scooter', color: 0xe84393, seats: 0 }
};
ML.RACE_COLORS = [0xf4c430, 0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6, 0xe67e22];
ML.EMOTES = ['👋', '👍', '😂', '😡', '💤', '🙏'];
/* Campagne : pas de nombre de jours fixe. L'inspecteur vient quand l'atelier est prêt
   (5 machines et réputation 60), ou au plus tard au jour 14. Réussir l'inspection = jeu terminé. */
ML.CAMPAIGN = { inspMach: 5, inspRep: 60, inspLate: 14, retry: 2 };

/* Trouvailles (6 par partie) */
ML.FINDS = {
  pelle_or: { name: "Pelle d'or", desc: 'Lebec calmé pendant 2 min', color: 0xffd700 },
  pied_coulisse: { name: 'Pied à coulisse de Lebec', desc: 'Revendu 120 € à un collectionneur', color: 0xbdc3c7 },
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
  rendement: { name: 'Lebec veut du rendement', desc: 'Gains ×1,25 mais tickets plus courts.', points: 1.25, dur: 0.85 },
  lunettes: { name: 'Lebec a perdu ses lunettes', desc: 'Il ne voit les bêtises que de près.', sight: 9 },
  dos: { name: 'Lebec a mal au dos', desc: 'Il court beaucoup moins vite avec sa pelle.', run: 4.2 }
};
/* Météo (V5) : elle CHANGE pendant la journée. p = chance au réveil ; next = suites possibles (poids).
   wet : la route glisse et l'atelier prend l'eau ; light : luminosité ; fog : distance du brouillard. */
ML.WEATHER = {
  beau: { name: 'Grand soleil', icon: '☀️', p: 0.38, light: 1, fog: 260, next: { beau: 3, nuageux: 4, vent: 2 } },
  nuageux: { name: 'Nuageux', icon: '⛅', p: 0.22, light: 0.86, fog: 220, next: { nuageux: 2, beau: 3, pluie: 3, brouillard: 1, neige: 0.4 } },
  vent: { name: 'Grand vent', icon: '💨', p: 0.08, light: 0.95, fog: 240, next: { beau: 3, nuageux: 3, pluie: 1 } },
  pluie: { name: 'Pluie (ça glisse !)', icon: '🌧️', p: 0.17, light: 0.72, fog: 190, wet: 1, next: { pluie: 3, nuageux: 3, orage: 2 } },
  orage: { name: 'ORAGE (éclairs, ça glisse beaucoup)', icon: '⛈️', p: 0.04, light: 0.55, fog: 150, wet: 1.5, next: { pluie: 3, nuageux: 2 } },
  brouillard: { name: 'Brouillard', icon: '🌫️', p: 0.08, light: 0.85, fog: 75, next: { brouillard: 1, nuageux: 3, beau: 2 } },
  neige: { name: 'Neige (routes glissantes)', icon: '❄️', p: 0.03, light: 0.92, fog: 140, wet: 1.3, snow: true, next: { neige: 2, nuageux: 3 } }
};

/* V5.1 : TYPES DE JOURNÉE (tirés au hasard, sauf le 1er jour). Plus il y a de commandes,
   moins il y a d'imprévus (et l'inverse) : une journée calme en pièces est pleine de visites.
   orders : × intervalle entre deux demandes (< 1 = plus de commandes) · dur : × délais · ev : ± événements · part : × attente des particuliers */
ML.DAYTYPES = {
  normale: { name: 'Journée normale', icon: '📋', desc: 'Des commandes régulières et quelques imprévus.', p: 0.32, orders: 1, dur: 1, ev: 0, part: 1 },
  calme: { name: 'Journée calme… en apparence', icon: '😌', desc: 'Peu de commandes, mais BEAUCOUP de visites et d\'imprévus.', p: 0.2, orders: 1.75, dur: 1.15, ev: 2, part: 1.4 },
  rush: { name: 'COUP DE FEU', icon: '🔥', desc: 'Les commandes pleuvent ! Presque pas d\'imprévus : on usine.', p: 0.2, orders: 0.5, dur: 1.05, ev: -3, part: 0.8 },
  agitee: { name: 'Journée agitée', icon: '🌀', desc: 'Visiteurs, pannes, audits… et les commandes continuent.', p: 0.17, orders: 1.15, dur: 1, ev: 1, part: 1 },
  pont: { name: 'Veille de pont', icon: '🗓️', desc: 'Tout le monde veut sa pièce pour hier : délais courts, peu de visites.', p: 0.11, orders: 0.75, dur: 0.8, ev: -1, part: 1.2 }
};

/* Événements surprise (2 à 4 tirés par journée) */
ML.EVENTS = {
  audit: 'Audit surprise de Jacky Foucher', coupure: 'Coupure de courant', sabotage: "Sabotage d'UsiFlash",
  herve: 'Hervé Lehec et sa convention', fred: 'Fred Castells et Arexis', mathieu: 'Mathieu Riou (il parle lentement)', panne: 'Grosse panne machine',
  johan: 'Johan Bois, voleur de commandes', bleuenn: 'Lean Manufacturing fait tout sauter'
};
/* V5.2 : CADRE D'ASTUCES affiché quand un événement commence (titre + que faire) */
ML.EVTIPS = {
  audit: ['🔍 Audit surprise', ['Prends une CAISSE usinée.', 'Pose-la au MARBRE (E) devant Jacky.', 'Réponds à sa question MIP/MAP.']],
  coupure: ['⚡ Coupure de courant', ['Les machines sont à l\'arrêt.', 'Va au TABLEAU ÉLECTRIQUE (mur droit).', 'E puis tape Espace pour réarmer.']],
  sabotage: ['🕶 Saboteur d\'UsiFlash', ['Il vise une caisse de l\'atelier.', 'Mets-lui une claque (clic gauche) : il lâche tout.', 'Range tes caisses en EXPÉDITION.']],
  herve: ['📝 Hervé bloque l\'armoire', ['Imprime la convention (imprimante du bureau).', 'Fais-la signer par LEBEC (E sur lui).', 'Rends-la à Hervé.']],
  fred: ['💼 Fred et Arexis', ['Il te colle et te ralentit.', 'Va au PC de gestion (bureau).', 'Bouton « Remplir ARÉXIS ».']],
  mathieu: ['🐌 Mathieu Riou', ['Il bloque un opérateur avec ses « du coup ».', 'E sur Mathieu : écoute-le à sa place.', 'L\'opérateur repart travailler.']],
  panne: ['💥 Grosse panne', ['Éteins le feu : EXTINCTEUR (mur gauche), clic gauche maintenu.', 'Puis CLÉ À MOLETTE + rôle MAINTENANCE : E sur la machine.']],
  johan: ['🦹 Johan Bois', ['Il vole les caisses PRÊTES (expédition).', 'Claque-le pour qu\'il lâche la caisse !', 'Au PC : un VIGILE l\'empêche d\'entrer.']],
  bleuenn: ['💣 Lean Manufacturing a tout fait sauter', ['Plus de courant : TABLEAU ÉLECTRIQUE (mur droit).', 'Puis E sur CHAQUE machine pour la redémarrer.', 'Éteins les feux à l\'extincteur.']],
  wc: ['🚽 Toilettes dégoûtantes', ['Les opérateurs ralentissent (et Lebec râle).', 'Cabine WC à gauche de l\'atelier, dehors.', 'E puis tape Espace pour nettoyer.']],
  quest: ['🙋 Quelqu\'un demande un service', ['Il arrive à l\'entrée (E sur lui) ou il appelle.', 'Prends l\'objet demandé (ou celui posé au COMPTOIR).', 'Va au repère (M) avec l\'objet en main : c\'est validé tout seul !']],
  sae: ['🎓 SAE du jour', ['Usine les pièces SAE (tickets violets).', 'Contrôle-les au MARBRE (meilleure note).', 'Apporte-les au JURY au marbre avant la fin.']]
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
  rich: ['Patron du CAC 40', 'Avoir 10 000 € en caisse', 80],
  full: ['Usine à gaz', 'Posséder les 6 machines', 60],
  part3: ['Service client', 'Servir 3 particuliers en une journée', 40],
  game_won: ['Fin du poly', 'Terminer la campagne (avis favorable de l\'inspecteur)', 200],
  inspection: ['Avis favorable', 'Réussir une journée d\'inspection', 80],
  traitor_win: ['Taupe parfaite', 'Gagner en traître sans être démasqué', 60],
  // V5.2
  radar_cut: ['Casseur de radars', 'Découper un radar à la meuleuse', 40],
  wc: ['Agent d\'entretien', 'Nettoyer les toilettes', 20],
  quest: ['Bon samaritain', 'Rendre 3 services (quêtes secondaires)', 50],
  johan_stop: ['Anti-Johan', 'Faire lâcher une caisse à Johan Bois', 30],
  sportif: ['Marathonien', 'Monter son endurance au niveau 5 (tapis de course)', 50],
  sae: ['Félicitations du jury', 'Obtenir 16/20 ou plus à une SAE', 60]
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

/* ======================= ÉCONOMIE (V4) =======================
   Tout se compte en euros : livrer rapporte, acheter / embaucher / les
   salaires et les amendes coûtent. Les prix ci-dessous équilibrent une
   campagne d'environ 1 h 30 jusqu'à l'inspecteur. */
ML.ECO = {
  startMoney: 900, freeMoney: 1500, startRep: 40, bankrupt: -2000,     // sous −2 000 € le soir : faillite
  // moins on est de joueurs, plus les pièces rapportent et plus on a de temps (index = nb de joueurs − 1)
  playerPay: [1.6, 1.25, 1.1, 1], playerTime: [1.35, 1.15, 1.05, 1], playerChaos: [0.55, 0.75, 0.9, 1],
  order: { base: 125, perStep: 65, far: 30, ctl: 15 },        // prix d'une commande (avant taille, réputation, délai)
  size: { s: 0.8, m: 1, l: 1.8 },
  part: { mult: 2.6, dur: 240, wait: 90, every: [150, 230] },   // particuliers (pièces urgentes)
  propLife: 120,                                                // une demande non acceptée au PC expire
  supplierDelay: [120, 180], fee: 20,                           // livraison par camion fournisseur (s, frais de port)
  sub: { fonderie: 60, chaudro: 70, tth: 45 },                  // sous-traitance en direct
  subPC: { fonderie: 90, chaudro: 100 }, subDelay: [100, 140],  // brut commandé au PC (livré à l'atelier)
  coco: 70,                                                     // caisse d'outils en direct chez Outi'Pro
  fines: { radar: 5, police: 60, ped: 30, burn: 80, audit: 40, inspect: 10, slapInsp: 30, jail: 100, vandal: 150 },
  jail: { peds: 3, sec: 45, bail: 150 },                        // 3 passants renversés → la gendarmerie te poursuit ; prison 45 s (caution 150 €)
  bonus: { audit: 30, mathieu: 10, fred: 10, herve: 20 },
  rep: { ok: 2, late: 1, fail: 3, expire: 1, part: 3, partFail: 3, audit: 3 },
  stars: [100, 350, 700],                                       // bénéfice du jour pour 1, 2, 3 étoiles (× nb joueurs, machines…)
  // --- V5.2 ---
  black: { every: 5, cat: 0.6, supply: 0.7, dealer: 0.75, mall: 0.5 },    // BLACK FRIDAY un jour sur 5 : multiplicateurs de prix
  radarWitness: 0.35,                                           // casser un radar : risque d'être vu (amende « vandal »)
  wc: { rate: 0.12, slow: 70 },                                 // toilettes : salissure par seconde (× joueurs) ; au-delà de 70 % les opérateurs ralentissent
  gym: 10, enduMax: 10,                                         // séance de tapis (€) ; niveau d'endurance max
  quest: { every: [130, 220], life: 260, reward: [60, 140] },   // quêtes secondaires
  sae: { every: 4, parts: 2, bon: 2.5, max: 50 }                // SAE : tous les 4 jours ; 2 pièces ; bon de réduction = note × 2,5 % (50 % max) sur une machine
};
/* Produits commandés au PC (prix à l'unité). Tout arrive dans UN colis en réception : on l'ouvre (R) et on range.
   lot = quantité d'une commande « automatique » (Sylvie). En direct chez Eliott : une caisse = 3 barres. */
ML.SUPPLY = {
  acier: { name: 'Barre ACIER', price: 12, lot: 3, from: 'aciers' }, alu: { name: 'Barre ALU', price: 16, lot: 3, from: 'aciers' },
  inox: { name: 'Barre INOX', price: 20, lot: 3, from: 'aciers' },
  plaquette: { name: 'Plaquette carbure', price: 15, lot: 2, from: 'outipro' }, fraise: { name: 'Fraise', price: 20, lot: 2, from: 'outipro' },
  foret: { name: 'Foret', price: 12, lot: 2, from: 'outipro' }
};
ML.CART_MAX = 40;                                               // articles max dans un colis
/* Catalogue du PC (machines, équipements, améliorations). now: effet immédiat ; sinon installé le lendemain matin. */
ML.CATALOG = {
  T2: { cat: 'machine', name: 'Tour CN T2', price: 1100, mach: 'T2', desc: 'Un deuxième tour. Il lui faut un opérateur (RH).' },
  F2: { cat: 'machine', name: 'Fraiseuse CN F2', price: 1100, mach: 'F2', desc: 'Une deuxième fraiseuse.' },
  agrandissement: { cat: 'atelier', name: "Agrandissement de l'atelier", price: 1400, desc: 'Deux emplacements de plus : T3 et F3 (le sol gris dans l\'atelier).', now: true, day: ML.PROGRESS.agrandissement },
  extension: { cat: 'atelier', name: 'Extension Est (nouveau hall)', price: 2600, desc: 'Un hall de plus à droite de l\'atelier : emplacements T4 et F4. Construit pendant la nuit.', day: ML.PROGRESS.extension },
  T3: { cat: 'machine', name: 'Tour CN T3', price: 1600, mach: 'T3', need: 'agrandissement', desc: 'Grand tour CN (après agrandissement).' },
  F3: { cat: 'machine', name: 'Fraiseuse CN F3', price: 1600, mach: 'F3', need: 'agrandissement', desc: 'Centre d\'usinage (après agrandissement).' },
  T4: { cat: 'machine', name: 'Tour CN T4', price: 1900, mach: 'T4', need: 'extension', desc: 'Dans l\'extension Est.' },
  F4: { cat: 'machine', name: 'Fraiseuse CN F4', price: 1900, mach: 'F4', need: 'extension', desc: 'Dans l\'extension Est.' },
  tp: { cat: 'equip', name: 'Transpalette', price: 250, veh: 'tp', desc: 'Déplace 4 caisses dans l\'atelier.' },
  fenwick: { cat: 'equip', name: 'Fenwick', price: 650, veh: 'fenwick', desc: 'Indispensable pour les GROSSES pièces sur palette (quai gros colis). Avec le camion plateau du garage, elles rapportent gros.' },
  erp_auto: { cat: 'atelier', name: 'Logiciel ERP+ (acceptation auto)', price: 450, desc: 'Les demandes des clients sont acceptées toutes seules.', now: true },
  isolation: { cat: 'atelier', name: 'Isolation du bâtiment', price: 500, desc: 'Moins de flaques par temps de pluie, opérateurs +5 %.', now: true },
  eclairage: { cat: 'atelier', name: 'Éclairage LED', price: 400, desc: 'Opérateurs +8 % (et on y voit enfin le soir).', now: true },
  formation: { cat: 'atelier', name: 'Formation des apprentis (+1 niveau)', price: 150, max: 3, desc: 'Les apprentis vont plus vite (max 3).', now: true },
  grande_benne: { cat: 'atelier', name: 'Rehausses de benne', price: 200, desc: 'Mégane et Ducato : 6 caisses.', now: true },
  cafe_pro: { cat: 'deco', name: 'Machine à café pro', price: 100, desc: 'Sprint 90 s au lieu de 40.' },
  frigo: { cat: 'deco', name: "Frigo de l'atelier", price: 150, desc: 'Viennoiseries sur place, Matis n\'a plus faim.' },
  babyfoot: { cat: 'deco', name: 'Babyfoot', price: 120, desc: 'Pauses plus courtes.' },
  plantes: { cat: 'deco', name: 'Plantes vertes', price: 80, desc: 'Clients plus satisfaits.' },
  posters: { cat: 'deco', name: 'Posters de Lebec', price: 60, desc: 'Sa colère retombe plus vite.' },
  antipigeon: { cat: 'abo', name: 'Abonnement Pigeon-Stop', price: 60, daily: 25, desc: 'Filets + effaroucheur : plus aucun pigeon ne vole de plaquettes. 25 €/jour, résiliable.', now: true },
  // --- V5.2 ---
  prepa: { cat: 'atelier', name: 'Poste de préparation d\'usinage', price: 1800, desc: 'Prépare tout seul des KITS (brut + bon outil) pour les commandes acceptées : tu prends le kit, tu le donnes à la machine. Prend dans le stock.', now: true },
  meuleuse: { cat: 'equip', name: 'Meuleuse « casse-radar »', price: 180, desc: 'Sur son crochet (mur gauche). E sur un radar pour le découper… mais si un témoin te voit : 150 € d\'amende.', now: true },
  vigile: { cat: 'abo', name: 'Vigile anti-Johan Bois', price: 120, daily: 35, desc: 'Raymond garde la porte : Johan Bois ne vole plus rien. 35 €/jour, résiliable.', now: true },
  radarpass: { cat: 'abo', name: 'Abonnement « Pass Radar »', price: 90, daily: 30, desc: 'Les radars flashent… mais l\'amende est pour l\'abonnement. Plus d\'amende de radar. 30 €/jour.', now: true }
};
/* Personnel : embauche (une fois) + salaire (chaque soir) */
ML.STAFF = {
  amaury: { hire: 120, pay: 70, desc: 'Tête en l\'air : oublie ce qu\'il usine.' },
  marius: { hire: 160, pay: 90, desc: 'Robot infatigable… accepte même le mauvais outil.' },
  matis: { hire: 120, pay: 70, desc: 'Ralentit quand il a faim (viennoiseries : +40 %).' },
  brieuc: { hire: 140, pay: 80, desc: 'Très rapide, mais « Flemme. » (une claque le relance).' },
  app1: { hire: 40, pay: 30, desc: 'Apprenti : lent, progresse avec la formation.' }, app2: { hire: 40, pay: 30, desc: 'Apprentie : lente, progresse avec la formation.' },
  app3: { hire: 40, pay: 30, desc: 'Apprenti : lent, progresse avec la formation.' }, app4: { hire: 40, pay: 30, desc: 'Apprentie : lente, progresse avec la formation.' },
  app5: { hire: 40, pay: 30, desc: 'Apprenti : lent, progresse avec la formation.' }
};
ML.AI_STAFF = {
  cariste: { npc: 'tony', name: 'Tony, cariste (IA)', hire: 150, pay: 80, desc: 'Charge tout seul les palettes du quai dans le camion.' },
  livreur: { npc: 'jojo', name: 'Jojo, livreur (IA)', hire: 150, pay: 100, desc: 'Fait les tournées : livre l\'expédition, ramène ce qui attend sur les quais.' }
};
/* Concessionnaire (Garage Pasquier) */
ML.DEALER = {
  megane: { name: 'Méga Mégane (tunée)', price: 900, desc: 'Rapide, benne de 4 caisses, 3 places.', specs: [['Vitesse max', 'CAR'], ['Benne', '4 caisses (6 avec rehausses)'], ['Places', '3 (+2 dans la benne)'], ['Conso', 'raisonnable'], ['Bonus', 'aileron et flammes possibles']] },
  ducato: { name: 'Ducato', price: 1400, desc: 'Grosse benne (6 caisses), stable.', specs: [['Vitesse max', 'DUCATO'], ['Benne', '6 caisses'], ['Places', '3'], ['Conso', 'moyenne'], ['Bonus', 'très stable dans les virages']] },
  scooter: { name: 'Scooter de livraison', price: 380, desc: 'Pas cher et sobre, mais lent : un top-case de 2 caisses.', specs: [['Vitesse max', 'SCOOTER'], ['Top-case', '2 caisses'], ['Places', '1 (pilote)'], ['Conso', 'presque rien'], ['Bonus', 'se faufile partout']] },
  camion: { name: 'Camion plateau (poids lourd)', price: 1500, desc: 'Palettes ET caisses, rapide et stable (rôle livreur).', specs: [['Vitesse max', 'CAMION'], ['Plateau', '8 places (palette = 4)'], ['Places', '1 passager'], ['Conso', 'gourmand'], ['Permis', 'rôle 🚚 Livreur']] }
};
/* V5.2 : CENTRE COMMERCIAL (stands) : de quoi manger (R : manger) et de quoi se taper (clic gauche) */
ML.MALL = {
  kebab: { stand: 'snack', name: 'Kebab sauce blanche', price: 9, icon: '🌯', desc: 'R : manger → +40 PV et tu cours vite 30 s.', eat: { hp: 40, coffee: 30 } },
  barre: { stand: 'snack', name: 'Barre chocolatée', price: 3, icon: '🍫', desc: 'R : manger → endurance pleine et +15 PV.', eat: { hp: 15, stam: 1 } },
  baguette: { stand: 'snack', name: 'Baguette', price: 2, icon: '🥖', desc: 'R : manger (+20 PV)… ou s\'en servir d\'épée.', eat: { hp: 20 }, weapon: { reach: 2.9, stun: 1.4, push: 4 } },
  poisson: { stand: 'farces', name: 'Poisson en caoutchouc', price: 12, icon: '🐟', desc: 'Clic gauche : une baffe qui fait « COUIC » (étourdit 2 s).', weapon: { reach: 2.8, stun: 2, push: 3 } },
  batte: { stand: 'farces', name: 'Batte en mousse', price: 18, icon: '🏏', desc: 'Clic gauche : frappe de loin et envoie valser.', weapon: { reach: 3.6, stun: 1.6, push: 9 } },
  gants: { stand: 'boxe', name: 'Gants de boxe (comme Coco)', price: 25, icon: '🥊', desc: 'Clic gauche : crochet du gauche, BAM ! (étourdit 2,5 s).', weapon: { reach: 2.5, stun: 2.5, push: 6 } }
};
ML.MALL_STANDS = { snack: ['🌯 Snack Le Petit Creux', '#e67e22'], farces: ['🎭 Farces & Attrapes', '#8e44ad'], boxe: ['🥊 Boxe Shop', '#c0392b'] };
/* V5.2 : QUÊTES SECONDAIRES (un PNJ vient au comptoir demander un service).
   need : objet à apporter (consommé) · mg : mini-jeu sur place · carry : objet donné au départ (à déposer) · at : lieu (ML.LIEUX) ou maison au hasard */
ML.QUESTS = [
  { giver: 'cardin', at: 'cardin', need: 'cle', mg: 'serrer', ask: 'Mon portail est complètement coincé ! Tu passes chez moi avec une CLÉ À MOLETTE ?', done: 'Il ferme enfin ! Merci, t\'es un chef.' },
  { giver: 'kawa', at: 'kawa', need: 'viennoiseries', ask: 'J\'ai une de ces dalles… Tu me ramènes des VIENNOISERIES de chez Mimi ? Je suis à la maison.', done: 'Mmmh ! Tu me sauves la vie.' },
  { giver: 'kawa', at: 'kawa', need: 'jerrican', ask: 'Ma tondeuse est à sec. Un JERRICAN d\'essence de la station, chez moi, s\'il te plaît !', done: 'Ça tond ! Merci beaucoup.' },
  { giver: 'eliott', at: 'trit', carry: 'cles_trit', ask: 'J\'ai-oublié-mes-CLÉS-à-l\'atelier-tu-me-les-déposes-à-mon-appart-merci-salut !', done: 'Clés déposées dans la boîte aux lettres de Trit.' },
  { giver: 'part2', at: null, need: 'extincteur', ask: 'Mon barbecue a pris feu chez moi ! Vite, un EXTINCTEUR !', done: 'Ouf ! Il ne reste que les saucisses carbonisées.' },
  { giver: 'part4', at: null, carry: 'carton', ask: 'Vous pouvez me livrer ce gros CARTON à la maison ? Mon dos ne suit plus.', done: 'Parfait, posez-le là. Merci !' },
  { giver: 'cardin', at: 'cardin', carry: 'carton', ask: 'Tu peux m\'apporter le CARTON qu\'on m\'a livré par erreur à l\'atelier ?', done: 'Ah, mes figurines ! Merci !' },
  { giver: 'part1', at: null, need: 'cle', mg: 'serrer', ask: 'Ma remorque a perdu une roue devant chez moi. Une CLÉ À MOLETTE et un coup de main ?', done: 'Elle roule ! Vous êtes des bons, à l\'atelier.' }
];

/* Pièces urgentes demandées par les particuliers */
ML.PART_REQ = [['Axe de remorque', 'acier', 'tour', 'plaquette'], ['Bague de tracteur', 'alu', 'tour', 'plaquette'], ['Entretoise de moto', 'alu', 'tour', 'plaquette'],
  ['Platine de portail', 'acier', 'fraiseuse', 'foret'], ['Patte de fixation', 'inox', 'fraiseuse', 'foret'], ['Came de tondeuse', 'acier', 'fraiseuse', 'fraise']];
ML.PARTICULIERS = ['part1', 'part2', 'part3', 'part4'];
ML.APPRENTIS = [['Kylian', 0x2980b9], ['Lilou', 0xe84393], ['Enzo', 0x00b894], ['Inès', 0xfdcb6e], ['Nathan', 0x6c5ce7]];
ML.APP_IDS = ['app1', 'app2', 'app3', 'app4', 'app5'];

/* Rôles (choisis au salon). Sans joueur pour un rôle, un PNJ le fait… lentement. */
/* Difficultés : durée des tickets, cadence, chaos, colère de Lebec, dégâts, points, seuils d'étoiles */
ML.DIFFS = {
  facile: { name: 'Facile', icon: '🙂', desc: 'Tickets longs, peu de chaos, Lebec patient.', dur: 1.6, interval: 1.3, chaos: 0.45, anger: 0.5, base: 0, run: 0.9, dmg: 0.5, points: 1, stars: 0.7, events: [0, 2] },
  normal: { name: 'Normal', icon: '😐', desc: 'L\'atelier comme d\'habitude.', dur: 1.15, interval: 1.05, chaos: 0.85, anger: 0.8, base: 0, run: 1, dmg: 0.85, points: 1, stars: 1, events: [1, 3] },
  difficile: { name: 'Difficile', icon: '😤', desc: 'Tickets serrés, pannes et feux fréquents, Lebec à cran.', dur: 0.85, interval: 0.85, chaos: 1.5, anger: 1.3, base: 10, run: 1.08, dmg: 1.25, points: 1.2, stars: 1.1, events: [3, 4] },
  feu: { name: 'LEBEC EN FEU', icon: '🔥', desc: 'Tout brûle. Lebec voit tout, court vite et cogne fort. Points ×1,5.', dur: 0.75, interval: 0.7, chaos: 2.2, anger: 1.8, base: 25, run: 1.18, dmg: 1.5, points: 1.5, stars: 1.2, events: [4, 5], sight: 1.6 }
};
ML.TIPS = [
  'Regarde la couleur du ticket : plus la barre est rouge, plus c\'est urgent.',
  'Un outil lancé (clic droit) à un usineur qui l\'attend, il l\'attrape au vol !',
  'Les caisses se lancent aussi dans la benne de la Mégane. Gain de temps garanti.',
  'Contrôle tes caisses au MARBRE (pied à coulisse) : +5 points et pas de refus client.',
  'Matis ralentit quand il a faim : une viennoiserie de chez Mimi et il repart à +40 %.',
  'Brieuc ne repart qu\'avec une claque… mais Lebec n\'aime pas la violence dans SON atelier.',
  'Sors de l\'atelier pour mettre une claque : Lebec ne voit que ce qui s\'y passe.',
  'Un bac à copeaux plein bloque la machine : appelle la maintenance (T = ping).',
  'Les GROSSES commandes n\'arrivent qu\'une fois le fenwick et le camion plateau achetés.',
  'Le chien de la casse adore les viennoiseries. Une lancée, et il dort 60 s.',
  'Le pigeon vole les plaquettes : lance-lui n\'importe quoi pour qu\'il la lâche.',
  'Radars à 60 km/h en ville, 90 sur la rocade. La gendarmerie surveille sa brigade.',
  'Touche M : la carte complète, avec les objectifs. Clic = repère pour toute l\'équipe.',
  'Les GROSSES pièces : seul le cariste (fenwick) puis le livreur (camion) peuvent s\'en occuper.',
  'KO ? Pas de panique : le médecin (ou le Docteur Gwenn, un peu lent) va venir.',
  'L\'huile soluble fait glisser : la soufflette sèche les flaques.',
  'Les caisses ne tombent de la benne qu\'en cas de choc contre le décor au-delà de 70 km/h.',
  'Il reste des trouvailles cachées en ville : la Pelle d\'or calme Lebec pendant 2 minutes.',
  'Passager de la Mégane ? Tu peux lancer des objets depuis la voiture.',
  'Hervé bloque l\'armoire ? Imprimante → signature de Lebec → retour à Hervé.',
  '« C\'est écrit dans le poly ! » — François Lebec, tous les jours depuis 1987.',
  'Les demandes des clients arrivent au 💻 PC de gestion (bureau) : si personne ne les accepte, elles expirent.',
  'Au PC, prévois la machine de chaque commande : l\'opérateur sait quoi faire en premier.',
  'Un seul opérateur pour deux machines ? Il court de l\'une à l\'autre. Embauche dès que tu peux !',
  'Les particuliers au comptoir paient bien plus cher. Ne les fais pas attendre !',
  'Le magasinier paie la matière au même prix que le PC, sans frais de port et sans attendre le camion.',
  'Un colis arrivé en réception : R pour l\'ouvrir (tout tombe par terre), puis E sur le rack ou l\'armoire avec les produits en main pour les ranger.',
  'Touche M : clique sur la carte pour poser un repère, le trajet s\'affiche comme un GPS.',
  'Un café et tu cours BEAUCOUP plus vite pendant une minute.',
  'Seul, chaque pièce rapporte plus et les délais sont plus longs : prends ton temps !',
  'Les salaires tombent le soir : garde toujours un peu d\'argent en caisse.',
  'Le Garage Pasquier vend la Méga Mégane, le Ducato et le camion plateau. Le vieux Kangoo, lui, tient avec du scotch.',
  'Campagne : note bien le CODE de sauvegarde. Avec lui, n\'importe qui peut reprendre l\'atelier.',
  'Jojo le livreur (à embaucher au PC) part en tournée tout seul dès qu\'il y a des caisses à l\'expédition.',
  'Un jour sur cinq, c\'est le BLACK FRIDAY : tout est moins cher au PC et au garage.',
  'Le tapis de course de la salle Le Biceps augmente ton endurance pour de bon.',
  'Johan Bois vole les caisses prêtes : un vigile (au PC) l\'empêche d\'entrer.',
  'Le poste de préparation fait des KITS brut + outil : tu n\'as plus qu\'à les donner à la machine.',
  'Au centre commercial : un kebab (R pour manger) remet sur pied, une batte en mousse fait voler les collègues.',
  'Les toilettes (dehors, à gauche de l\'atelier) se salissent : sales, elles ralentissent les opérateurs.',
  'Tickets du haut : la ligne 👷 dit qui s\'occupe de la commande, la barre bleue l\'avancement.'
];

ML.ROLES = {
  poly: { name: 'Polyvalent', icon: '🛠️', color: 0x7f8c8d, css: '#95a5a6', desc: 'Usine, transporte et livre les petites et moyennes pièces. Plusieurs joueurs peuvent l\'être.' },
  medecin: { name: 'Médecin', icon: '⛑️', color: 0xe74c3c, css: '#e74c3c', desc: 'Seul à pouvoir soigner les blessés (E sur un collègue).', npc: 'docteur' },
  cariste: { name: 'Cariste', icon: '🚜', color: 0xf39c12, css: '#f39c12', desc: 'Seul habilité au FENWICK (à acheter au PC) : déplace les grosses pièces (R : fourches).', npc: 'momo' },
  livreur: { name: 'Livreur', icon: '🚚', color: 0x3498db, css: '#3498db', desc: 'Seul habilité au CAMION plateau (Garage Pasquier) : livre palettes et caisses (R : décharger chez le client).', npc: 'momo' },
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
  brieuc: { name: 'Brieuc', role: 'Opérateur', op: { speed: 1.35, lazy: 0.3, traits: ['deadstop'] }, look: { skin: 0x5b3a29, shirt: 0xc0392b, pants: 0x222831, hair: 0x111111, height: 1.55, width: 1.3 } },
  app1: { name: 'Kylian', role: 'Apprenti', op: { speed: 0.7, lazy: 0.1, traits: ['apprenti'] }, look: { skin: 0xf0c8a0, shirt: 0x2980b9, pants: 0x34495e, hair: 0x3b2a1a, height: 1.74 } },
  app2: { name: 'Lilou', role: 'Apprentie', op: { speed: 0.7, lazy: 0.1, traits: ['apprenti'] }, look: { skin: 0xc68642, shirt: 0xe84393, pants: 0x34495e, hair: 0x111111, height: 1.66, longHair: true } },
  app3: { name: 'Enzo', role: 'Apprenti', op: { speed: 0.7, lazy: 0.1, traits: ['apprenti'] }, look: { skin: 0xe2b48c, shirt: 0x00b894, pants: 0x34495e, hair: 0x8b5a2b, height: 1.78 } },
  app4: { name: 'Inès', role: 'Apprentie', op: { speed: 0.7, lazy: 0.1, traits: ['apprenti'] }, look: { skin: 0x8d5524, shirt: 0xfdcb6e, pants: 0x34495e, hair: 0x111111, height: 1.63, longHair: true } },
  app5: { name: 'Nathan', role: 'Apprenti', op: { speed: 0.7, lazy: 0.1, traits: ['apprenti'] }, look: { skin: 0xf3cba5, shirt: 0x6c5ce7, pants: 0x34495e, hair: 0xe0b050, height: 1.81 } },
  tony: { name: 'Tony', role: 'Cariste (embauché)', visitor: true, look: { skin: 0xd9a37a, shirt: 0xf39c12, pants: 0x2c3e50, hair: 0x222222, height: 1.8, width: 1.15 } },
  jojo: { name: 'Jojo', role: 'Livreur (embauché)', visitor: true, look: { skin: 0xf0c8a0, shirt: 0x3498db, pants: 0x2c3e50, hair: 0x8b5a2b, height: 1.76 } },
  vendeur: { name: 'Bernard Pasquier', role: 'Concessionnaire', look: { skin: 0xe8b98f, shirt: 0xc0392b, pants: 0x1c1c1c, hair: 0xbdc3c7, height: 1.79, width: 1.15, glasses: true } },
  part1: { name: 'Gérard Le Floch', role: 'Agriculteur', visitor: true, look: { skin: 0xe2b48c, shirt: 0x27ae60, pants: 0x34495e, hair: 0xbdc3c7, height: 1.76, width: 1.2 } },
  part2: { name: 'Mme Rousseau', role: 'Retraitée bricoleuse', visitor: true, look: { skin: 0xf3cba5, shirt: 0x8e44ad, pants: 0x555555, hair: 0xdddddd, height: 1.6, longHair: true, glasses: true } },
  part3: { name: 'Jean-Mi', role: 'Motard', visitor: true, look: { skin: 0xd9a37a, shirt: 0x111111, pants: 0x1f4e9a, hair: 0x3b2a1a, height: 1.84, beard: true } },
  part4: { name: 'Patrick', role: 'Voisin (portail cassé)', visitor: true, look: { skin: 0xf0c8a0, shirt: 0xe67e22, pants: 0x34495e, hair: 0x8b5a2b, height: 1.72, width: 1.25 } },
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
  espacil: { name: 'Accueil Espacil', role: 'Client — Espacil Habitat', look: { skin: 0xf0c8a0, shirt: 0x13a89e, pants: 0x34495e, hair: 0x6b4a2b, height: 1.72, longHair: true, glasses: true } },
  gendarme: { name: 'Adjudant Le Goff', role: 'Gendarme', look: { skin: 0xe8b98f, shirt: 0x1f3a93, pants: 0x1c2a5a, hair: 0x333333, height: 1.84, width: 1.1, cap: 0x1f3a93, mustache: true } },
  kevin: { name: 'Kévin', role: "Chef d'atelier — UsiFlash", look: { skin: 0xd9a37a, shirt: 0x6c5ce7, pants: 0x222222, hair: 0x111111, height: 1.77, cap: 0x111111 } },
  // visiteurs et événements
  jacky: { name: 'Jacky Foucher', role: 'Inspecteur Qualité', visitor: true, look: { skin: 0xe8b98f, shirt: 0xf4f4f4, pants: 0x2c3e50, hair: 0x555555, height: 1.86, tie: 0x2c3e50, glasses: true } },
  herve: { name: 'Hervé Lehec', role: 'Référent stages', visitor: true, look: { skin: 0xeec4a0, shirt: 0xbfa77a, pants: 0x4d4d4d, hair: 0x777777, height: 1.74, glasses: true } },
  fred: { name: 'Fred Castells', role: 'Recruteur', visitor: true, look: { skin: 0xe6b48d, shirt: 0x34495e, pants: 0x34495e, hair: 0x2a2a2a, height: 1.82, tie: 0xc0392b } },
  mathieu: { name: 'Mathieu Riou', role: 'Visiteur bavard', visitor: true, look: { skin: 0xf0c8a0, shirt: 0x2980b9, pants: 0x2d2d2d, hair: 0x3d2b1f, height: 1.8 } },
  saboteur: { name: 'Gars louche', role: "Saboteur d'UsiFlash", visitor: true, look: { skin: 0xd9a37a, shirt: 0x222222, pants: 0x111111, hair: 0x111111, height: 1.8, cap: 0x6c5ce7 } },
  inspecteur: { name: "L'Inspecteur", role: "Inspecteur de l'Éducation Nationale", visitor: true, look: { skin: 0xe8c39e, shirt: 0x5d6d7e, pants: 0x5d6d7e, hair: 0xdddddd, height: 1.9, tie: 0x8e44ad, glasses: true, mustache: true } },
  // --- V5.2 ---
  johan: { name: 'Johan Bois', role: 'Voleur de commandes', visitor: true, look: { skin: 0xeac39b, shirt: 0x2d3436, pants: 0x1e272e, hair: 0x6b4a2b, height: 1.8, cap: 0x2d3436 } },
  vigile: { name: 'Raymond', role: 'Vigile anti-Johan Bois', visitor: true, look: { skin: 0x8d5524, shirt: 0x111111, pants: 0x111111, hair: 0x111111, height: 1.95, width: 1.3 } },
  bleuenn: { name: 'Lean Manufacturing', role: 'Bricoleuse explosive', visitor: true, look: { skin: 0xf3cba5, shirt: 0xe67e22, pants: 0x34495e, hair: 0xa0522d, height: 1.66, longHair: true, glasses: true } },
  garnier: { name: 'Garnier', role: 'Jury de SAE (prof)', visitor: true, look: { skin: 0xe8b98f, shirt: 0x34495e, pants: 0x2c3e50, hair: 0x555555, height: 1.8, glasses: true } },
  fanfrelat: { name: 'Fanfrelat', role: 'Jury de SAE (prof)', visitor: true, look: { skin: 0xf0c8a0, shirt: 0x8e44ad, pants: 0x2d2d2d, hair: 0x3b2a1a, height: 1.75 } },
  cardin: { name: 'Cardin', role: 'Un pote de l\'atelier', visitor: true, look: { skin: 0xf0c8a0, shirt: 0xc0392b, pants: 0x2c3e50, hair: 0x3b2a1a, height: 1.8 } },
  kawa: { name: 'Jimmy Kawa', role: 'Un pote de l\'atelier', visitor: true, look: { skin: 0xd9a37a, shirt: 0x2980b9, pants: 0x34495e, hair: 0x111111, height: 1.76, cap: 0x2980b9 } },
  vendeuse: { name: 'Sandra', role: 'Caissière — Centre commercial', look: { skin: 0xf3cba5, shirt: 0x8e44ad, pants: 0x2c3e50, hair: 0xe0b050, height: 1.66, longHair: true } },
  coach: { name: 'Coach Bruno', role: 'Salle de sport Le Biceps', look: { skin: 0xc68642, shirt: 0x16a085, pants: 0x111111, hair: 0x111111, height: 1.85, width: 1.35 } }
};

ML.LINES = {
  docteur: ['On ne court pas dans un atelier !', 'Respirez… Toussez… Bon, vous vivrez.', 'Encore un coup de pelle ? Je vais finir par avoir un abonnement.'],
  gege: ['Ah ben elle était bien grippée celle-là.', 'Fallait m\'appeler plus tôt !', 'Je repasse jeudi. Peut-être.'],
  momo: ['Une palette ? J\'arrive… doucement.', 'Le fenwick c\'est pas un jouet.'],
  tony: ['Palette chargée, chef !', 'Le fenwick, c\'est tout un art.', 'Bip bip bip… je recule.'],
  jojo: ['Je pars en tournée !', 'Livré, signé, tamponné.', 'Y\'a encore des bouchons rue Jean Jaurès…'],
  vendeur: ['Elle a jamais roulé sous la pluie, celle-là !', 'Pour vous, je fais un prix. Enfin… presque.', 'Contrôle technique ? Il passera. Sûrement.'],
  part1: ['Mon tracteur est en panne en pleine moisson !', 'Vous me sauvez la vie, là.'],
  part2: ['C\'est pour ma remorque, mon défunt mari la bichonnait…', 'Merci jeune homme !'],
  part3: ['Ma bécane démarre plus, faut que ça roule ce week-end !', 'Trop stylé, merci !'],
  part4: ['Le portail ne ferme plus, les chiens du voisin rentrent !', 'Impeccable, merci les gars.'],
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
  espacil: ['Bonjour ! Espacil Habitat, j\'écoute.', 'On a 300 portails à réparer. Au moins.'],
  gendarme: ['Bonjour. Papiers du véhicule ?', 'On vous a à l\'œil, à l\'atelier Lebec.'],
  jacky: ['MIP/MAP irréprochable, appui plan sur la Réf A.', 'Apportez-moi une caisse au marbre. Tout de suite.'],
  herve: ['Alors, ce stage, trouvé ? Et la convention ?', "Pas de convention, pas d'outils ! C'est le règlement."],
  fred: ["Tu as pensé à l'alternance ? Penses-y... Naval Group recrute !", 'Tu as rempli Arexis ? ARÉXIS !'],
  mathieu: ['Alors... euh... du coup... tu... vois... ?', 'En fait... du coup... voilà... quoi.'],
  saboteur: ['Rien à voir, je passe.', 'Hé hé hé...'],
  inspecteur: ['Je note. Je note tout.', 'Votre référentiel de compétences, je vous prie.', 'Infraction !'],
  // --- V5.2 (à personnaliser dans persos.js) ---
  johan: ['Elle est à qui cette caisse ? À moi maintenant.', 'Je passais par là… par hasard.', 'Hop, emballé, c\'est pesé !'],
  vigile: ['Pas de Johan ici.', 'Badge ?', 'Je surveille. Je surveille toujours.'],
  bleuenn: ['T\'inquiète, je sais ce que je fais !', 'Juste un petit branchement…', 'C\'était pas prévu, ça.'],
  garnier: ['Montrez-moi vos pièces.', 'La démarche compte autant que le résultat.', 'Et la cotation fonctionnelle ?'],
  fanfrelat: ['Le dossier est où ?', 'Justifiez vos choix d\'outils.', 'C\'est intéressant… mais pourquoi ?'],
  cardin: ['Salut ! Tu passes à la maison ?', 'T\'as deux minutes ?'],
  kawa: ['Yo ! Ça usine ?', 'Je passe en coup de vent.'],
  vendeuse: ['Bonjour, vous avez la carte de fidélité ?', 'C\'est pour offrir ?'],
  coach: ['Allez, encore un kilomètre !', 'On lâche rien !', 'L\'endurance, ça se travaille.']
};

/* Tirage des répliques « paquet de cartes » : jamais deux fois la même tant que
   la liste n'a pas été dite en entier. ML.line(id) = répliques, ML.line(id,'pause') = liste « pause: ». */
(function () {
  const bags = {};
  ML.line = (id, key, fb) => {
    const k = key && key !== 'repliques' ? id + '_' + key : id, a = ML.LINES[k];
    if (!a || !a.length) return Array.isArray(fb) ? fb[Math.floor(Math.random() * fb.length)] : fb;
    let b = bags[k];
    if (!b || b.src !== a || !b.q.length) {
      const q = a.slice();
      for (let j = q.length - 1; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); [q[j], q[r]] = [q[r], q[j]]; }
      if (b && b.last && q.length > 1 && q[q.length - 1] === b.last) [q[0], q[q.length - 1]] = [q[q.length - 1], q[0]];
      b = bags[k] = { src: a, q, last: b && b.last };
    }
    return (b.last = b.q.pop());
  };
})();

ML.QUIZ_JACKY = [
  ["Pour la mise en position, où placez-vous l'appui plan ?", 'Sur la surface Réf A', 'Sur la face la plus large', 'Sur la Réf C', 'On serre fort, ça ira'],
  ['Combien de degrés de liberté supprime un appui plan ?', '3', '1', '2', '6'],
  ['Où appliquer le maintien en position (MAP) ?', 'Au droit des appuis', 'Loin des appuis', 'Sur la surface finie', 'Au marteau'],
  ['Une linéaire rectiligne supprime combien de DDL ?', '2', '1', '3', '4'],
  ['Une ponctuelle (butée) supprime combien de DDL ?', '1', '0', '2', '3']
];
