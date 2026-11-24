/* =====================================================================
   config.js — Données & réglages de MÉCANIQUE LEBEC (multijoueur)
   Tout est rangé sous l'objet global ML. C'est le fichier à modifier en
   premier pour l'équilibrage, les persos, les entreprises et les pièces.
   ===================================================================== */
window.ML = window.ML || {};
ML.debug = /[?&]debug/.test(location.search);

ML.CFG = {
  SHIFT_SEC: 480,                    // une journée (7h → 19h) = 8 minutes réelles
  DAY_START: 7 * 60, DAY_END: 19 * 60,
  PLAYER: { eye: 1.65, r: 0.35, walk: 5.6, sprint: 8.8, stamina: 4 },
  CAR: { accel: 13, brake: 24, max: 27, rev: 7, steer: 0.55, wb: 2.6, cap: 4 },
  REACH: 5,                          // distance max d'interaction vérifiée par l'hôte
  NET: { poseHz: 15, fastHz: 10, slowEvery: 1 },
  LEBEC: { base: 10, chaseAt: 50, hit: 45, run: 6.9, reach: 1.5 },
  ORDER: { base: 165, perStep: 60, far: 20, interval: 44, firstAt: 2 },
  PROD_SEC: 17,                      // durée d'usinage d'une commande (opérateur vitesse 1)
  SUB_SEC: 18,                       // durée chez un sous-traitant
  START_STOCK: { acier: 4, alu: 4, inox: 3, plaquette: 3, fraise: 3, foret: 3 }
};

/* Couleurs des 5 joueurs */
ML.COLORS = [
  { name: 'Rouge', hex: 0xe74c3c, css: '#e74c3c' }, { name: 'Bleu', hex: 0x3498db, css: '#3498db' },
  { name: 'Vert', hex: 0x2ecc71, css: '#2ecc71' }, { name: 'Jaune', hex: 0xf1c40f, css: '#f1c40f' },
  { name: 'Violet', hex: 0x9b59b6, css: '#9b59b6' }
];

ML.MATERIALS = {
  acier: { label: 'ACIER', color: 0x8c9199, css: '#9aa0a8' },
  alu: { label: 'ALU', color: 0xdfe5ea, css: '#e8edf1' },
  inox: { label: 'INOX', color: 0x9fc1d8, css: '#9fc1d8' },
  fonte: { label: 'FONTE', color: 0x4a4038, css: '#7a6a5c' },
  soude: { label: 'MÉCANO-SOUDÉ', color: 0x5d6d7e, css: '#8193a5' }
};
ML.TOOLS = {
  plaquette: { label: 'Plaquette', color: 0xffd23f, css: '#ffd23f' },
  fraise: { label: 'Fraise', color: 0x3fa7ff, css: '#3fa7ff' },
  foret: { label: 'Foret', color: 0xff7a3f, css: '#ff7a3f' }
};
ML.MTYPE = { tour: 'Tour', fraiseuse: 'Fraiseuse' };
ML.STEP = { fonderie: 'Fonderie', chaudro: 'Chaudronnerie', usinage: 'Usinage', tth: 'Traitement th.', livraison: 'Livraison' };

/* Catalogue : [désignation, matière, machine, outil] */
ML.PARTS = {
  plain: [['Arbre Ø40', 'acier', 'tour', 'plaquette'], ['Bague', 'alu', 'tour', 'plaquette'], ['Axe épaulé', 'inox', 'tour', 'plaquette'],
          ['Bride de serrage', 'acier', 'fraiseuse', 'fraise'], ['Platine percée', 'alu', 'fraiseuse', 'foret'], ['Équerre', 'inox', 'fraiseuse', 'foret']],
  fonderie: [['Corps de vanne', 'fonte', 'fraiseuse', 'fraise'], ['Moyeu fonte', 'fonte', 'tour', 'plaquette']],
  chaudro: [['Bâti mécano-soudé', 'soude', 'fraiseuse', 'foret'], ['Embase soudée', 'soude', 'fraiseuse', 'fraise']],
  tth: [['Arbre traité', 'acier', 'tour', 'plaquette'], ['Pignon traité', 'acier', 'fraiseuse', 'fraise']]
};

/* Parc machines de l'atelier (réduit à 4 postes) */
ML.MACHINES = [
  { id: 'T1', type: 'tour', name: 'Tour CN', x: -12, z: -6, len: 4, op: 'amaury' },
  { id: 'T2', type: 'tour', name: 'Tour CN', x: -4, z: -6, len: 4, op: 'marius' },
  { id: 'F1', type: 'fraiseuse', name: 'Fraiseuse CN', x: -12, z: 4, op: 'matis' },
  { id: 'F2', type: 'fraiseuse', name: 'Fraiseuse CN', x: -4, z: 4, op: 'brieuc' }
];

/* Entreprises de la ville : bâtiment (centre, taille), face du quai (+1 = vers +Z, -1 = vers -Z) */
ML.COMPANIES = {
  boulangerie: { name: 'Boulangerie Chez Mimi', kind: 'boulangerie', npc: 'mimi', x: -26, z: 46, w: 12, d: 10, h: 5, wall: 'brique', color: 0xf3e0b5, roof: 0xb5523b, face: 1 },
  aciers: { name: "Aciers de l'Ouest", sub: 'Fournisseur matière', kind: 'matiere', npc: 'eliott', x: 40, z: 72, w: 28, d: 18, h: 8, wall: 'tole', color: 0x8d99a6, roof: 0x34495e, face: 1 },
  outipro: { name: "Outi'Pro", sub: 'Fournisseur d\'outils coupants', kind: 'outils', npc: 'coco', x: -40, z: 73, w: 22, d: 16, h: 7, wall: 'tole', color: 0xd35400, roof: 0x6e2c00, face: 1 },
  fonderie: { name: 'Fonderie Boulard', sub: 'Sous-traitant — bruts de fonderie', kind: 'fonderie', npc: 'axel', x: 42, z: 110, w: 26, d: 20, h: 10, wall: 'brique', color: 0x8e5b4b, roof: 0x3b2a25, face: -1 },
  chaudro: { name: 'Chaudronnerie Babinsky', sub: 'Sous-traitant — mécano-soudé', kind: 'chaudro', npc: 'nono', x: -42, z: 110, w: 24, d: 18, h: 9, wall: 'tole', color: 0x5d6d7e, roof: 0x2c3e50, face: -1 },
  tth: { name: 'TTH Ouest', sub: 'Sous-traitant — traitement thermique', kind: 'tth', npc: 'maurseau', x: 45, z: 172, w: 22, d: 18, h: 8, wall: 'beton', color: 0xc0392b, roof: 0x641e16, face: 1 },
  aerotech: { name: 'AéroTech', sub: 'Client', kind: 'client', npc: 'vasseur', x: -45, z: 210, w: 26, d: 18, h: 10, wall: 'beton', color: 0xdfe6e9, roof: 0x0984e3, face: -1 },
  agrimeca: { name: 'AgriMéca', sub: 'Client', kind: 'client', npc: 'moreau', x: 48, z: 212, w: 28, d: 20, h: 9, wall: 'tole', color: 0x6ab04c, roof: 0x1e5631, face: -1 },
  novatics: { name: 'Novatics', sub: 'Client', kind: 'client', npc: 'novatics', x: -45, z: 272, w: 24, d: 18, h: 11, wall: 'beton', color: 0x2d3e50, roof: 0x00a8e8, face: 1 },
  ublo: { name: 'Ublo', sub: 'Client', kind: 'client', npc: 'ublo', x: 45, z: 272, w: 22, d: 18, h: 9, wall: 'beton', color: 0xfdf2e9, roof: 0xff6f61, face: 1 }
};
ML.CLIENTS = ['aerotech', 'agrimeca', 'novatics', 'ublo'];

/* Trouvailles cachées dans la ville (6 tirées par partie) */
ML.FINDS = {
  pelle_or: { name: "Pelle d'or", desc: 'Lebec est calmé (colère à 0) pendant 2 min', color: 0xffd700 },
  pied_coulisse: { name: 'Pied à coulisse de Lebec', desc: '+25 points pour l\'équipe', color: 0xbdc3c7 },
  croissant: { name: 'Croissant légendaire', desc: 'Tous les opérateurs ×1,5 pendant 60 s', color: 0xe1a95f },
  plaquettes: { name: 'Boîte de plaquettes oubliée', desc: '+4 plaquettes en stock', color: 0xffd23f },
  barres: { name: "Barres tombées d'un camion", desc: '+2 alu, +2 inox en stock', color: 0xdfe5ea },
  cafe: { name: 'Thermos du chef', desc: 'Sprint illimité pour toute l\'équipe pendant 60 s', color: 0x6d4c41 },
  cle12: { name: 'Clé de 12 en or', desc: '+40 s sur tous les tickets en cours', color: 0xd4af37 },
  turbo: { name: 'Turbo de Mégane', desc: 'Voitures +30 % pendant 2 min', color: 0xe74c3c }
};

/* Personnages : look low-poly, et pour les opérateurs : vitesse, paresse, traits */
ML.PEOPLE = {
  lebec: { name: 'François Lebec', role: "Chef d'atelier", look: { skin: 0xe2b48c, shirt: 0x24457a, pants: 0x2d2d2d, hair: 0x9a9a9a, height: 1.8, mustache: true, shovel: true } },
  amaury: { name: 'Amaury Carter', role: 'Opérateur — T1', op: { speed: 1.0, lazy: 0.04, traits: ['forgetful'] }, look: { skin: 0xf0c8a0, shirt: 0x4e8a3e, pants: 0x34495e, hair: 0x6b4a2b, height: 1.83 } },
  marius: { name: 'Marius Challine', role: 'Opérateur — T2', op: { speed: 1.2, lazy: 0, traits: ['robot'] }, look: { skin: 0xeac39b, shirt: 0x7f8c8d, pants: 0x2c3e50, hair: 0x222222, height: 1.86 } },
  matis: { name: 'Matis Caillou', role: 'Opérateur — F1', op: { speed: 1.0, lazy: 0.08, traits: ['hungry'] }, look: { skin: 0xf5cfaa, shirt: 0xe67e22, pants: 0x2c3e50, hair: 0xe0b050, height: 1.72, width: 1.2 } },
  brieuc: { name: 'Brieuc', role: 'Opérateur — F2', op: { speed: 1.35, lazy: 0.45, traits: ['deadstop'] }, look: { skin: 0x5b3a29, shirt: 0xc0392b, pants: 0x222831, hair: 0x111111, height: 1.55, width: 1.3 } },
  mimi: { name: 'Mimi', role: 'Boulangère', look: { skin: 0xf3cba5, shirt: 0xffffff, pants: 0x555555, hair: 0x8b5a2b, height: 1.64, longHair: true, apron: 0xf5e6c8 } },
  eliott: { name: 'Eliott Trit', role: "Commercial — Aciers de l'Ouest", look: { skin: 0xf2c6a0, shirt: 0xd35400, pants: 0x2c3e50, hair: 0xb5651d, height: 2.05, width: 0.9 } },
  coco: { name: 'Coco Allo', role: "Vendeur — Outi'Pro", look: { skin: 0xd9a37a, shirt: 0x1e1e1e, pants: 0x444444, hair: 0x3b2a1a, height: 1.8, cap: 0xd63031, gloves: 0xd63031 } },
  axel: { name: 'Axel Boulard', role: 'Fondeur — Fonderie Boulard', look: { skin: 0xf0c8a0, shirt: 0x16a085, pants: 0x34495e, hair: 0x5a3d22, height: 1.78, apron: 0x6d4c41 } },
  nono: { name: 'Nono Babinsky', role: 'Chaudronnier', look: { skin: 0xf2c9a5, shirt: 0x8e44ad, pants: 0x34495e, hair: 0xc9a35b, height: 1.76, mask: true } },
  maurseau: { name: 'Maurseau Sice', role: 'Traitement thermique (turbo)', look: { skin: 0xf3c7a0, shirt: 0xf1c40f, pants: 0x2d3436, hair: 0x2c1b0e, height: 1.52 } },
  vasseur: { name: 'M. Vasseur', role: 'Client — AéroTech', look: { skin: 0xe8b98f, shirt: 0x1c1c1c, pants: 0x1c1c1c, hair: 0x333333, height: 1.78, tie: 0x2980b9, glasses: true } },
  moreau: { name: 'Mme Moreau', role: 'Cliente — AgriMéca', look: { skin: 0xeec4a0, shirt: 0x27ae60, pants: 0x1e5631, hair: 0xa0522d, height: 1.68, longHair: true } },
  novatics: { name: 'Accueil Novatics', role: 'Client — Novatics', look: { skin: 0xe6b48d, shirt: 0x00a8e8, pants: 0x2d3e50, hair: 0x2a2a2a, height: 1.76 } },
  ublo: { name: 'Accueil Ublo', role: 'Client — Ublo', look: { skin: 0xf0c8a0, shirt: 0xff6f61, pants: 0x34495e, hair: 0x4a3426, height: 1.7, longHair: true } }
};

ML.LINES = {
  lebec: ["Encore une réforme de l'Éducation Nationale... on forme des usineurs en trois semaines !", "La cote c'est la cote ! Pas « à peu près » !",
          "De mon temps, le CAP c'était deux ans de lime et d'étau !", "Pas un rond pour les machines, mais des tablettes pour tout le monde !"],
  amaury: ["Euh... j'usinais quoi déjà ?", "C'est quoi cette pièce, déjà ?", "Ma Méga Mégane, elle est où ?"],
  marius: ['Instruction reçue. Exécution.', 'Programme en cours.', 'Je ne pose pas de questions.'],
  matis: ['J\'ai faiiiim...', 'Y\'a pas un pain au chocolat qui traîne ?', 'Regarde le copeau, on dirait un serpent !'],
  brieuc: ['Flemme.', "Là j'peux pas, j'suis en pause.", 'Mmmh.'],
  mimi: ['Bonjour mon grand ! Une viennoiserie ?', 'Les croissants sortent du four !'],
  eliott: ["Salut-ça-va-moi-ça-va-qu'est-ce-que-je-te-mets ?", "Rapide-rapide-j'ai-quatre-clients-après-toi !"],
  coco: ['T\'as vu le combat samedi ? Crochet du gauche, BAM !', 'Une fraise, c\'est comme un jab : ça tourne vite.', 'Jab, jab, uppercut !'],
  cocoBoxe: ['La garde ! Toujours la garde haute.', 'Le crochet du gauche, tout part de la hanche.', 'Le jab, c\'est pour mesurer la distance. Comme un comparateur.', 'Et là BAM, au tapis ! Bon, tiens tes outils.'],
  axel: ['Je coule, je coule. Tranquille.', 'La fonte, ça se respecte.', 'Je suis un neuille, mais je coule bien.'],
  nono: ["Pourquoi le soudeur est toujours calme ? Il a l'arc bien réglé ! HAHAHA", "C'est l'histoire d'une tôle... elle était pliée de rire ! HAHA", 'Tu connais celle du TIG et du MIG ? Non ? Moi non plus. HAHAHA'],
  maurseau: ["C'EST CHAUD ! WOUHOU !", 'Trempe, revenu, je cours !', 'Attention, ça brûle ! Hihi.'],
  vasseur: ['Les délais sont les délais.', 'La qualité n\'est pas négociable.'],
  moreau: ['Vite vite vite ! Mes tracteurs attendent !', 'Livrez-moi vite et je ne regarde pas trop le reste.'],
  novatics: ['Bonjour ! Vous avez notre commande ?', 'Parfait, notre prototype attend cette pièce.'],
  ublo: ['Salut ! C\'est pour nous ?', 'Top, merci l\'équipe !']
};
