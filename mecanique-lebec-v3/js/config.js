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
  CAR: { accel: 13, brake: 24, max: 27, rev: 7, steer: 0.55, wb: 2.6, cap: 4, fuelUse: 0.04 },
  TP: { accel: 10, brake: 20, max: 4.8, rev: 3, steer: 0.9, wb: 1.2, cap: 4 },      // transpalette
  REACH: 5,
  NET: { poseHz: 15, fastHz: 10, slowEvery: 1 },
  LEBEC: { base: 10, chaseAt: 50, hit: 45, run: 6.9, reach: 1.5, sight: 24 },
  HP: { max: 100, pelle: 20, slap: 5, slip: 10, fire: 7, dog: 15, koSpeed: 1.7 },
  SIZE: { s: { name: 'petite', pts: 0.8, prod: 0.8 }, m: { name: 'moyenne', pts: 1, prod: 1 }, l: { name: 'GROSSE', pts: 1.7, prod: 1.5 } },
  FENWICK: { accel: 7, brake: 18, max: 7, rev: 4, steer: 0.8, wb: 1.5, cap: 1 },
  CAMION: { accel: 8, brake: 18, max: 21, rev: 5, steer: 0.45, wb: 4.2, cap: 2, fuelUse: 0.05 },
  ORDER: { base: 165, perStep: 60, far: 20, interval: 44, firstAt: 2 },
  PROD_SEC: 17, SUB_SEC: 18,
  START_STOCK: { acier: 4, alu: 4, inox: 3, plaquette: 3, fraise: 3, foret: 3 },
  SPEED_LIMIT: 16.7,                   // 60 km/h : au-delà, les radars flashent
  POLICE_TRIGGER: 19.5,                // 70 km/h près de la police : poursuite
  MAP: { minX: -170, maxX: 170, minZ: -40, maxZ: 330 }
};

ML.COLORS = [
  { name: 'Rouge', hex: 0xe74c3c, css: '#e74c3c' }, { name: 'Bleu', hex: 0x3498db, css: '#3498db' },
  { name: 'Vert', hex: 0x2ecc71, css: '#2ecc71' }, { name: 'Jaune', hex: 0xf1c40f, css: '#f1c40f' },
  { name: 'Violet', hex: 0x9b59b6, css: '#9b59b6' }
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
          ['Bride de serrage', 'acier', 'fraiseuse', 'fraise'], ['Platine percée', 'alu', 'fraiseuse', 'foret'], ['Équerre', 'inox', 'fraiseuse', 'foret']],
  fonderie: [['Corps de vanne', 'fonte', 'fraiseuse', 'fraise'], ['Moyeu fonte', 'fonte', 'tour', 'plaquette']],
  chaudro: [['Bâti mécano-soudé', 'soude', 'fraiseuse', 'foret'], ['Embase soudée', 'soude', 'fraiseuse', 'fraise']],
  tth: [['Arbre traité', 'acier', 'tour', 'plaquette'], ['Pignon traité', 'acier', 'fraiseuse', 'fraise']]
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
  police: { name: 'Gendarmerie', sub: 'Brigade routière', kind: 'police', npc: null, w: 16, d: 12, h: 7, wall: 'beton', color: 0xecf0f1, roof: 0x1f3a93 }
};
ML.CLIENTS = ['aerotech', 'agrimeca', 'novatics', 'ublo'];

/* Véhicules de l'atelier (kind) */
ML.VEHICLES = {
  megane: { name: 'la Méga Mégane', color: 0xf4c430, seats: 3 }, kangoo: { name: 'le Kangoo de Lebec', color: 0xecf0f1, seats: 3 },
  ducato: { name: 'le Ducato', color: 0x95a5a6, seats: 3 }, tp: { name: 'le transpalette', color: 0xe67e22, seats: 0 },
  fenwick: { name: 'le fenwick', color: 0xf39c12, seats: 0, role: 'cariste' }, camion: { name: 'le camion', color: 0x2c6fbb, seats: 1, role: 'livreur' }
};
ML.RACE_COLORS = [0xf4c430, 0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6];
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
  jacky: ['MIP/MAP irréprochable, appui plan sur la Réf A.', 'Apportez-moi une caisse au marbre. Tout de suite.'],
  herve: ['Alors, ce stage, trouvé ? Et la convention ?', "Pas de convention, pas d'outils ! C'est le règlement."],
  fred: ["Tu as pensé à l'alternance ? Penses-y... Naval Group recrute !", 'Tu as rempli Arexis ? ARÉXIS !'],
  mathieu: ['Alors... euh... du coup... tu... vois... ?', 'En fait... du coup... voilà... quoi.'],
  saboteur: ['Rien à voir, je passe.', 'Hé hé hé...'],
  inspecteur: ['Je note. Je note tout.', 'Votre référentiel de compétences, je vous prie.', 'Infraction !']
};

ML.QUIZ_JACKY = [
  ["Pour la mise en position, où placez-vous l'appui plan ?", 'Sur la surface Réf A', 'Sur la face la plus large', 'Sur la Réf C', 'On serre fort, ça ira'],
  ['Combien de degrés de liberté supprime un appui plan ?', '3', '1', '2', '6'],
  ['Où appliquer le maintien en position (MAP) ?', 'Au droit des appuis', 'Loin des appuis', 'Sur la surface finie', 'Au marteau'],
  ['Une linéaire rectiligne supprime combien de DDL ?', '2', '1', '3', '4'],
  ['Une ponctuelle (butée) supprime combien de DDL ?', '1', '0', '2', '3']
];
