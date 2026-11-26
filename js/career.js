/* =====================================================================
   career.js — MODE CARRIÈRE (façon « simulator ») : données et sauvegarde.
   On reprend un atelier POURRI et on le transforme en usine de fou :
   argent, réputation, machines achetées et DÉPLACÉES au fenwick, ouvriers
   embauchés et affectés, matière commandée, devis, agrandissements.

   - ML.CAREER : le CATALOGUE (niveaux d'atelier, pièces, machines, matière,
     ouvriers, clients, prix). Tout l'équilibrage de la carrière est ici.
   - ML.Career : l'ÉTAT (car) + sauvegarde (localStorage + serveur → GitHub
     saves/careers/<id>.json : ENTREPRISES partagées entre comptes, voir plus bas).
   - Career.layout(car) → ce que TOUS les joueurs doivent connaître pour
     construire le même monde (envoyé dans cfg.game.career au lancement).
   - Career.apply(layout) → remplit ML.MACHINES, ML.ATELIER, ML.PEOPLE
     (ouvriers) avant World.build. Appelé chez tous les joueurs.
   La logique de jeu (argent pendant la journée, achats, livraisons,
   affectations, fin de journée) est dans sim_career.js (hôte).
   ===================================================================== */
(function () {
  const U = ML.U;

  /* ======================= CATALOGUE ======================= */
  const CAT = ML.CAREER = {
    START_MONEY: 3000,
    BANKRUPT: -6000,                         // en dessous : la banque reprend l'atelier (fin de carrière)
    /* Agrandissements du bâtiment (le mur de façade reste en z = 14, on agrandit vers le fond et les côtés) */
    LEVELS: [
      { name: 'Le Hangar Pourri', w: 18, d: 12, price: 0, rent: 40, desc: 'Toit qui fuit, néon qui clignote, une seule prise qui marche.' },
      { name: "L'Atelier Rafistolé", w: 24, d: 16, price: 7000, rent: 80, desc: 'Bâche neuve sur le toit, un vrai sol béton.' },
      { name: "L'Atelier Propre", w: 32, d: 20, price: 18000, rent: 140, desc: 'Bardage neuf, lumière partout, Lebec est presque fier.' },
      { name: "L'Atelier Pro", w: 40, d: 28, price: 40000, rent: 220, desc: 'Pont roulant, sol peint, ça sent l\'argent.' },
      { name: "L'Usine de Fou", w: 52, d: 34, price: 90000, rent: 380, desc: 'Façade vitrée, robots, et un bureau pour Lebec avec vue sur ses employés.' }
    ],
    /* Pièces annexes (construites la nuit après l'achat) */
    ROOMS: {
      be: { name: "Bureau d'études", icon: '💻', price: 2500, minLvl: 0, desc: 'Le PC de gestion sort du placard : devis plus gros, plus de candidats à l\'embauche.' },
      stock: { name: 'Magasin de stock', icon: '📦', price: 3500, minLvl: 1, desc: 'Racks en plus : stock max ×2, livraisons de matière directement en rayon.' },
      pause: { name: 'Salle de pause', icon: '☕', price: 3000, minLvl: 1, desc: 'Machine à café pro + babyfoot : les ouvriers râlent moins et reviennent plus vite.' },
      vestiaire: { name: 'Vestiaires', icon: '🧥', price: 2000, minLvl: 1, desc: 'Les ouvriers arrivent à l\'heure (enfin, plus souvent).' },
      metrologie: { name: 'Salle de métrologie', icon: '📐', price: 6000, minLvl: 2, desc: 'Contrôle au marbre plus rapide, pièces mieux payées.' },
      quai: { name: 'Quai couvert', icon: '🚚', price: 5000, minLvl: 2, desc: 'Les livraisons arrivent à l\'abri, le camion recule tout seul.' }
    },
    /* Machines : du vieux tour rouillé au centre 5 axes. type = tour | fraiseuse (compatible avec les tickets) */
    MACHINES: {
      tour_vieux: { type: 'tour', name: 'Tour Ernault 1974', price: 900, speed: 0.6, quality: 0.85, panne: 2.2, len: 4, tier: 0, desc: 'Il fume, il claque, il tourne. Plus ou moins rond.' },
      fraiseuse_vieille: { type: 'fraiseuse', name: 'Fraiseuse Huré 1968', price: 1100, speed: 0.6, quality: 0.85, panne: 2.2, tier: 0, desc: 'La manivelle a 3 mm de jeu. C\'est du caractère.' },
      tour_conv: { type: 'tour', name: 'Tour Cazeneuve HB 575', price: 4200, speed: 0.85, quality: 0.95, panne: 1.3, len: 4.2, tier: 1, desc: 'Le tour d\'école. Increvable.' },
      fraiseuse_conv: { type: 'fraiseuse', name: 'Fraiseuse Gambin 2M', price: 4800, speed: 0.85, quality: 0.95, panne: 1.3, tier: 1, desc: 'Celle du lycée, mais qui marche.' },
      tour_cn: { type: 'tour', name: 'Tour CN Lebec-Turn 200', price: 14000, speed: 1.1, quality: 1, panne: 0.9, len: 4.6, tier: 2, desc: 'Commande numérique, porte vitrée, bip-bip.' },
      fraiseuse_cn: { type: 'fraiseuse', name: 'Centre d\'usinage 3 axes VM-40', price: 16000, speed: 1.1, quality: 1, panne: 0.9, tier: 2, desc: 'Changeur d\'outils 20 places. Lebec ne sait pas s\'en servir.' },
      tour_bibroche: { type: 'tour', name: 'Tour bi-broche TwinTurn', price: 34000, speed: 1.5, quality: 1.05, panne: 0.7, len: 5.4, tier: 3, desc: 'Deux broches, zéro excuse.' },
      centre_5axes: { type: 'fraiseuse', name: 'Centre 5 axes DMG-Lebec', price: 62000, speed: 1.8, quality: 1.1, panne: 0.6, tier: 4, desc: 'Fait des pièces impossibles. Et des cafés ? Non.' }
    },
    /* Matière et outils : prix à l'unité, délai de livraison (secondes de jeu) */
    SUPPLY: {
      acier: { label: 'Barre acier', price: 45, lot: 4, delay: 70 },
      alu: { label: 'Barre alu', price: 60, lot: 4, delay: 70 },
      inox: { label: 'Barre inox', price: 95, lot: 3, delay: 80 },
      plaquette: { label: 'Plaquettes carbure', price: 30, lot: 4, delay: 60 },
      fraise: { label: 'Fraises', price: 40, lot: 3, delay: 60 },
      foret: { label: 'Forets', price: 22, lot: 4, delay: 60 }
    },
    STOCK_MAX: 18,                           // par référence (×2 avec le magasin)
    MACHINE_DELAY: 110,                      // secondes avant que le camion livre une machine
    POWER: 18,                               // électricité par machine et par jour
    /* Prix d'une pièce livrée (avant bonus de délai et réputation) */
    PRICE: { s: 140, m: 260, l: 620, step: 90, far: 1.25, plateau: 1.7, op: 0.45, mat: { inox: 1.2, alu: 0.95 } },   // op : +45 % par opération de gamme en plus ; mat : matière difficile mieux payée
    /* Ouvriers : traits existants de la simulation */
    TRAITS: {
      forgetful: { label: 'Tête en l\'air', desc: 'Oublie de relancer la machine.' },
      robot: { label: 'Robot', desc: 'Exécute TOUT, même les erreurs.' },
      hungry: { label: 'Gourmand', desc: 'S\'arrête pour manger. Les viennoiseries le relancent.' },
      deadstop: { label: 'Rapide mais…', desc: 'Très rapide… quand il veut bien.' },
      apprenti: { label: 'Apprenti', desc: 'Lent mais pas cher. Progresse avec le temps.' }
    },
    FIRST: ['Kévin', 'Jordan', 'Mathéo', 'Loïc', 'Yann', 'Erwan', 'Gwendal', 'Maël', 'Tanguy', 'Ronan', 'Sullivan', 'Dylan', 'Enzo', 'Inès', 'Léa', 'Nolwenn', 'Morgane', 'Chloé', 'Maëlys', 'Soizic', 'Gaëlle', 'Rachid', 'Samir', 'Thierry', 'Dédé', 'Jean-Mi', 'Pascal', 'Bernadette'],
    LAST: ['Le Gall', 'Le Goff', 'Kerjean', 'Tanguy', 'Morvan', 'Guivarc\'h', 'Le Bihan', 'Riou', 'Jaouen', 'Quéré', 'Cariou', 'Le Roux', 'Briand', 'Martin', 'Dupont', 'Moreau', 'Lucas', 'Perrot', 'Benali', 'Da Silva'],
    /* Clients : réputation minimale pour recevoir leurs appels d'offres */
    CLIENT_REP: { aerotech: 0, agrimeca: 0, novatics: 35, ublo: 55 },
    PLATEAU: ['carriere', 'barrage'],
    /* Objectifs (paliers) : donnent un cap à la carrière. test(car, S) côté hôte ; récompense en € */
    GOALS: [
      { id: 'premier', label: 'Premier client : livrer une pièce', reward: 200, test: c => c.stats.served >= 1 },
      { id: 'devis3', label: 'Signer 3 devis', reward: 300, test: c => (c.stats.signed || 0) >= 3 },
      { id: 'embauche', label: 'Embaucher un ouvrier', reward: 300, test: c => c.workers.length >= 2 },
      { id: 'machine2', label: 'Installer une 2e machine', reward: 500, test: c => c.machines.filter(m => !m.crated).length >= 2 },
      { id: 'be', label: "Construire le bureau d'études", reward: 600, test: c => !!c.atelier.rooms.be },
      { id: 'corniche', label: 'Livrer un client du plateau (par la corniche… ou pas)', reward: 800, test: c => (c.stats.plateau || 0) >= 1 },
      { id: 'pieces20', label: 'Livrer 20 pièces', reward: 1000, test: c => c.stats.served >= 20 },
      { id: 'argent10k', label: 'Avoir 10 000 € en banque', reward: 1000, test: c => c.money >= 10000 },
      { id: 'niveau2', label: "Agrandir : « L'Atelier Propre »", reward: 1500, test: c => c.atelier.lvl >= 2 },
      { id: 'cn', label: 'Acheter une machine à commande numérique', reward: 1500, test: c => c.machines.some(m => (CAT.MACHINES[m.model] || {}).tier >= 2) },
      { id: 'rep60', label: 'Réputation 60', reward: 2000, test: c => c.rep >= 60 },
      { id: 'equipe6', label: 'Une équipe de 6 ouvriers', reward: 2500, test: c => c.workers.length >= 6 },
      { id: 'cinqaxes', label: 'Le Graal : un centre 5 axes', reward: 5000, test: c => c.machines.some(m => m.model === 'centre_5axes') },
      { id: 'usine', label: "L'Usine de Fou (niveau 5)", reward: 10000, test: c => c.atelier.lvl >= 4 },
      { id: 'million', label: 'Lebec millionnaire (1 000 000 €)', reward: 0, test: c => c.money >= 1000000 }
    ]        // clients du plateau : par la corniche (dangereuse) ou le grand tour, +70 %
  };

  /* ======================= ÉTAT ======================= */
  const CR = ML.Career = {};
  let uid = 0;
  const nid = (car, p) => p + (++car.next);

  /** Nouvelle carrière : l'atelier pourri, un vieux tour, un apprenti, Lebec */
  CR.fresh = name => {
    const seed = (Math.random() * 1e9) >>> 0;
    const car = {
      v: 1, name: name || 'Mécanique Lebec', seed, day: 1, money: CAT.START_MONEY, rep: 20, next: 0, saved: 0,
      atelier: { lvl: 0, rooms: {}, pending: null },
      machines: [], workers: [], stock: { acier: 3, alu: 2, inox: 1, plaquette: 3, fraise: 2, foret: 3 },
      contracts: [], offers: [], deliveries: [], ledger: [], candidates: [],
      stats: { served: 0, failed: 0, earned: 0, spent: 0, fines: 0, best: 0, signed: 0, plateau: 0 }, goals: {}
    };
    car.machines.push({ uid: nid(car, 'M'), model: 'tour_vieux', x: -3, z: 3, rot: 0, wear: 60 });
    const w = CR.makeWorker(car, U.rng(seed), 'apprenti'); car.workers.push(w); w.assign = car.machines[0].uid;
    CR.rollCandidates(car, U.rng(seed + 1)); CR.rollOffers(car, U.rng(seed + 2));
    return car;
  };
  /** Ouvrier tiré au hasard (ou l'un des « légendaires » : amaury, marius, matis, brieuc) */
  CR.makeWorker = (car, r, forceTrait) => {
    const tr = forceTrait || r.pick(['forgetful', 'robot', 'hungry', 'deadstop', 'apprenti', 'forgetful', 'hungry']);
    const speed = tr === 'apprenti' ? 0.65 + r() * 0.15 : tr === 'deadstop' ? 1.25 + r() * 0.2 : 0.85 + r() * 0.35;
    const lazy = tr === 'robot' ? 0 : tr === 'deadstop' ? 0.35 + r() * 0.15 : 0.03 + r() * 0.1;
    const skins = ML.SKINS || [0xf0c8a0], hairs = ML.HAIRS || [0x3b2a1a];
    const w = {
      uid: nid(car, 'W'), name: r.pick(CAT.FIRST) + ' ' + r.pick(CAT.LAST), trait: tr, speed: +speed.toFixed(2), lazy: +lazy.toFixed(2),
      salary: Math.round((tr === 'apprenti' ? 55 : 90) + speed * 70 - lazy * 60), xp: 0, mood: 70, assign: null,
      look: { skin: r.pick(skins), shirt: ML.Style ? ML.Style.vary(r.pick([0x4e8a3e, 0x2980b9, 0xc0392b, 0xe67e22, 0x7f8c8d, 0x8e44ad, 0x16a085]), 0.5, r) : 0x2980b9, pants: 0x2c3e50, hair: r.pick(hairs), height: 1.6 + r() * 0.3, width: 0.85 + r() * 0.4, longHair: r() < 0.3, beard: r() < 0.25, glasses: r() < 0.2 }
    };
    return w;
  };
  CR.LEGENDS = ['amaury', 'marius', 'matis', 'brieuc'];
  /** Candidats à l'embauche (renouvelés chaque matin). Le BE en propose plus. */
  CR.rollCandidates = (car, r) => {
    const n = car.atelier.rooms.be ? 5 : 3, out = [];
    for (let i = 0; i < n; i++) out.push(CR.makeWorker(car, r));
    // de temps en temps, un « légendaire » de l'ancien atelier postule
    const free = CR.LEGENDS.filter(id => !car.workers.some(w => w.legend === id));
    if (free.length && r() < 0.45) {
      const id = r.pick(free), P = ML.PEOPLE[id];
      const w = CR.makeWorker(car, r, P.op.traits[0]); Object.assign(w, { name: P.name, legend: id, speed: P.op.speed, lazy: P.op.lazy, look: P.look, salary: Math.round(90 + P.op.speed * 80) });
      out[0] = w;
    }
    car.candidates = out;
  };
  /** Appels d'offres reçus au BE (devis à accepter ou refuser) */
  CR.rollOffers = (car, r) => {
    const n = (car.atelier.rooms.be ? 4 : 2) + Math.floor(car.rep / 30), out = [];
    const clients = Object.keys(CAT.CLIENT_REP).filter(c => car.rep >= CAT.CLIENT_REP[c]).concat(car.rep >= 15 ? CAT.PLATEAU : []);
    const hasType = t => car.machines.some(m => (CAT.MACHINES[m.model] || {}).type === t);
    const RT = ML.Routing, fits = p => RT.of(p).every(id => hasType(ML.OPS[id].mt));   // toute la gamme faisable avec nos machines ?
    for (let i = 0; i < n; i++) {
      const kind = r() < 0.6 ? 'plain' : r.pick(['fonderie', 'chaudro', 'tth']);
      const pool = (ML.PARTS[kind] || ML.PARTS.plain).filter(p => fits(p) || r() < 0.3);
      const tpl = r.pick(pool.length ? pool : ML.PARTS.plain), [part, mat] = tpl;
      const sr = r(), size = sr < 0.35 ? 's' : sr < 0.8 ? 'm' : 'l', qty = 1 + Math.floor(r() * (2 + car.rep / 25));
      const ops = RT.fit(RT.of(tpl), size), op0 = ML.OPS[ops[0]];                // gamme (grosse pièce : un seul type de machine)
      const client = r.pick(clients), steps = kind === 'plain' ? 0 : 1;
      const plateau = (ML.CAREER.PLATEAU || []).includes(client);
      const base = CAT.PRICE[size] * (1 + CAT.PRICE.op * (ops.length - 1)) * (CAT.PRICE.mat[mat] || 1) + steps * CAT.PRICE.step;
      const unit = Math.round(base * (plateau ? CAT.PRICE.plateau : 1) * (0.85 + r() * 0.4) * (0.9 + car.rep / 250));
      out.push({ id: nid(car, 'D'), client, part, mat, mtype: op0.mt, tool: op0.tool, ops, kind, size, qty, unit, days: 1 + Math.floor(r() * 3) + (ops.length > 2 ? 1 : 0), plateau });
    }
    // V4.0 (portage) : PARTICULIERS — une petite pièce urgente, bien payée, à remettre en main propre au COMPTOIR de l'atelier
    const PR = (ML.PART_REQ || []).filter(fits), PI = ML.PARTI || {};
    for (let k = 0, np = r() < 0.75 ? (r() < 0.3 ? 2 : 1) : 0; k < np && PR.length; k++) {
      const tpl = r.pick(PR), [part, mat] = tpl, ops = RT.of(tpl), op0 = ML.OPS[ops[0]], who = r.pick(ML.PARTICULIERS);
      if (out.some(o => o.who === who)) continue;
      const unit = Math.round(CAT.PRICE.s * (1 + CAT.PRICE.op * (ops.length - 1)) * (CAT.PRICE.mat[mat] || 1) * (PI.mult || 2) * (0.85 + r() * 0.3) / 5) * 5;
      out.push({ id: nid(car, 'D'), client: 'part', who, part, mat, mtype: op0.mt, tool: op0.tool, ops, kind: 'plain', size: 's', qty: 1, unit, days: 1, plateau: false, perso: true });
    }
    car.offers = out;
  };
  CR.machineDef = m => {
    const M = CAT.MACHINES[m.model] || CAT.MACHINES.tour_vieux;
    return { id: m.uid, type: M.type, name: M.name, model: m.model, x: m.x, z: m.z, rot: m.rot || 0, len: M.len || 4, tier: M.tier, speed: M.speed, quality: M.quality, panne: M.panne, wear: m.wear || 0 };
  };

  /* ======================= Agencement partagé ======================= */
  /** Ce que tous les joueurs doivent savoir pour construire le même monde */
  CR.layout = car => ({
    name: car.name, day: car.day, seed: car.seed, dayMin: car.dayMin || 12,
    lvl: car.atelier.lvl, rooms: Object.assign({}, car.atelier.rooms),
    machines: car.machines.filter(m => !m.crated).map(CR.machineDef),
    crates: car.machines.filter(m => m.crated).map(m => ({ uid: m.uid, model: m.model, x: m.x, z: m.z })),
    workers: car.workers.map(w => ({ uid: w.uid, name: w.name, trait: w.trait, speed: w.speed, lazy: w.lazy, look: w.look, legend: w.legend || null, assign: w.assign }))
  });
  /** Dimensions du bâtiment pour un niveau (façade en z = 14) */
  CR.box = lvl => { const L = CAT.LEVELS[Math.max(0, Math.min(CAT.LEVELS.length - 1, lvl))]; return { w: L.w, d: L.d, minX: -L.w / 2, maxX: L.w / 2, minZ: 14 - L.d, maxZ: 14 }; };
  CR.DEFAULT_MACHINES = ML.MACHINES.map(m => Object.assign({}, m));
  CR.BASE_SHIFT = ML.CFG.SHIFT_SEC;
  /** Applique un agencement (ou l'atelier classique si layout est vide) — AVANT World.build */
  CR.apply = layout => {
    ML.MACHINES.length = 0;
    ML.CFG.SHIFT_SEC = layout ? (layout.dayMin || 12) * 60 : (CR.BASE_SHIFT || (CR.BASE_SHIFT = ML.CFG.SHIFT_SEC));   // durée de la journée (carrière : réglable au BE)
    // nettoie les ouvriers d'une carrière précédente
    for (const id in ML.PEOPLE) if (ML.PEOPLE[id].hired) delete ML.PEOPLE[id];
    if (!layout) {
      CR.DEFAULT_MACHINES.forEach(m => ML.MACHINES.push(Object.assign({}, m)));
      ML.ATELIER = { career: false, lvl: 3, rooms: { be: 1, stock: 1, pause: 1 }, box: CR.box(3) };
      ML.OPERATORS = ['amaury', 'marius', 'matis', 'brieuc'];
      return;
    }
    layout.machines.forEach(m => ML.MACHINES.push(Object.assign({}, m)));
    ML.ATELIER = { career: true, lvl: layout.lvl, rooms: layout.rooms || {}, box: CR.box(layout.lvl), crates: layout.crates || [], name: layout.name };
    ML.OPERATORS = [];
    for (const w of layout.workers) {
      const id = w.legend || 'w_' + w.uid;
      const base = w.legend ? ML.PEOPLE[w.legend] : null;
      ML.PEOPLE[id] = Object.assign({}, base || {}, { name: w.name, role: 'Ouvrier', hired: !w.legend, uid: w.uid,
        op: { speed: w.speed, lazy: w.lazy, traits: [w.trait] }, look: w.look });
      ML.OPERATORS.push(id);
    }
    ML.ATELIER.assign = {}; for (const w of layout.workers) if (w.assign) ML.ATELIER.assign[w.assign] = w.legend || 'w_' + w.uid;
  };
  CR.workerId = w => w.legend || 'w_' + w.uid;

  /* ======================= Sauvegarde ======================= */
  /* ENTREPRISES (carrières d'équipe) : une carrière a un id (car.cid), un nom, un patron et des
     membres (pseudos de comptes) ; stockée sur le serveur (GitHub saves/careers/<id>.json).
     N'importe quel membre peut héberger un salon avec. car.rev = révision de base : le serveur
     refuse une sauvegarde plus ancienne que la sienne (« quelqu'un a joué entre-temps »).
     Hors ligne / invité : carrière LOCALE (localStorage ml_career), comme avant.
     CR.car = carrière choisie (chez l'hôte : celle qui tourne) ; CR.shared = copie reçue de
     l'hôte pendant une partie (sert à reprendre la journée si l'hôte part). */
  const KEY = 'ml_career', TKEY = 'ml_career_t_', SEL = 'ml_career_sel';
  const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plein */ } } };
  CR.teams = []; CR.shared = null; CR.lastConflict = false;
  try { CR.sel = localStorage.getItem(SEL) || null; } catch (e) { CR.sel = null; }
  const setSel = cid => { CR.sel = cid || null; try { if (cid) localStorage.setItem(SEL, cid); else localStorage.removeItem(SEL); } catch (e) { /* rien */ } };
  CR.local = () => ls.get(KEY);
  /** Connecté à un compte ET au serveur ? (sinon : carrière locale) */
  CR.online = () => { const A = ML.Account, N = ML.Net; return !!(A && A.logged() && N && N.online); };
  const acc = (op, data) => ML.Net.acc(op, Object.assign({ token: ML.Account && ML.Account.token }, data));
  /** Liste « mes entreprises » (serveur) */
  CR.list = async () => {
    if (!CR.online()) { CR.teams = []; return CR.teams; }
    const r = await acc('clist', {}); if (r.ok) CR.teams = r.list || []; return CR.teams;
  };
  /** Ancienne carrière de CE PC (sans id) → entreprise sur le compte, si le compte n'en a aucune */
  CR.migrateLocal = async () => {
    const loc = CR.local();
    if (!loc || !loc.v || loc.cid || loc.migrated || CR.teams.length || !CR.online()) return;
    const r = await acc('ccreate', { name: loc.name, career: loc });
    if (!r.ok) return;
    loc.migrated = r.info.id; ls.set(KEY, loc);
    CR.teams = [r.info]; if (r.career) ls.set(TKEY + r.info.id, r.career);
  };
  /** Charge la carrière : entreprise choisie (en ligne) ou carrière de ce PC */
  CR.load = async () => {
    if (!CR.online()) { CR.car = CR.local(); return CR.car; }
    await CR.list(); await CR.migrateLocal();
    const cid = CR.teams.some(t => t.id === CR.sel) ? CR.sel : (CR.teams[0] || {}).id;
    if (!cid) { setSel(null); CR.car = null; return null; }              // aucune : on en créera une au lancement
    return CR.open(cid);
  };
  /** Ouvre une entreprise (la version du serveur fait foi) */
  CR.open = async cid => {
    const r = await acc('cload', { cid });
    if (!r.ok) { if (ML.HUD) ML.HUD.toast(r.m || 'Entreprise indisponible.'); return CR.car; }
    const car = r.career && r.career.v ? r.career : CR.fresh(r.info.name);
    Object.assign(car, { cid, rev: r.rev || 0, name: r.info.name });
    CR.car = car; setSel(cid); ls.set(TKEY + cid, car);
    const i = CR.teams.findIndex(t => t.id === cid); if (i >= 0) CR.teams[i] = r.info; else CR.teams.push(r.info);
    return car;
  };
  /** Nouvelle entreprise (en ligne) ; hors ligne : nouvelle carrière locale */
  CR.create = async name => {
    const car = CR.fresh(name);
    if (!CR.online()) { CR.car = car; return { ok: true, car }; }
    const r = await acc('ccreate', { name, career: car });
    if (!r.ok) return r;
    Object.assign(car, { cid: r.info.id, rev: r.rev, name: r.info.name });
    CR.teams.push(r.info); CR.car = car; setSel(car.cid); ls.set(TKEY + car.cid, car);
    return { ok: true, car };
  };
  /** Invite un pote (pseudo de son compte) dans l'entreprise choisie */
  CR.invite = async user => {
    if (!CR.car || !CR.car.cid) return { ok: false, m: 'Choisis d\'abord une entreprise en ligne.' };
    const r = await acc('cinvite', { cid: CR.car.cid, user });
    if (r.ok) { const i = CR.teams.findIndex(t => t.id === r.info.id); if (i >= 0) CR.teams[i] = r.info; }
    return r;
  };
  /** Quitte l'entreprise choisie (le dernier membre la laisse en sommeil sur le serveur) */
  CR.leave = async () => {
    const cid = CR.car && CR.car.cid; if (!cid) return { ok: false, m: 'Pas d\'entreprise en ligne choisie.' };
    const r = await acc('cleave', { cid });
    if (r.ok) { CR.teams = CR.teams.filter(t => t.id !== cid); try { localStorage.removeItem(TKEY + cid); } catch (e) { /* rien */ } setSel(null); CR.car = null; await CR.load(); }
    return r;
  };
  CR.info = () => (CR.car && CR.car.cid ? CR.teams.find(t => t.id === CR.car.cid) || null : null);
  /** Sauvegarde. opts.mid = sauvegarde de mi-journée (instantané, ne remplace pas CR.car).
      Renvoie « en ligne » / « sur ce PC (…) » ; CR.lastConflict = true si quelqu'un a joué entre-temps
      (on garde alors la version la plus récente du serveur, la nôtre part dans ml_career_conflict). */
  CR.save = async (car, opts) => {
    opts = opts || {}; car = car || CR.car; if (!car) return 'nulle part';
    CR.lastConflict = false;
    car.saved = Date.now(); car.ledger = (car.ledger || []).slice(-400);
    if (!opts.mid) delete car.mid;                                        // fin de journée : plus une reprise en cours de journée
    ls.set(car.cid ? TKEY + car.cid : KEY, car);
    const N = ML.Net;
    if (!car.cid) return 'sur ce PC';                                     // carrière locale (invité / hors ligne)
    if (!(N && N.online)) return 'sur ce PC (hors ligne)';
    const r = await acc('csave', { cid: car.cid, rev: car.rev || 0, career: car });
    if (r.ok) {
      car.rev = r.rev; if (CR.car && CR.car !== car && CR.car.cid === car.cid) CR.car.rev = r.rev;
      ls.set(TKEY + car.cid, car);
      if (r.info) { const i = CR.teams.findIndex(t => t.id === r.info.id); if (i >= 0) CR.teams[i] = r.info; }
      if (!opts.mid && ML.Sync) ML.Sync.share(car);
      return 'en ligne';
    }
    if (r.conflict) {
      CR.lastConflict = true;
      ls.set('ml_career_conflict', car);
      const newer = r.career && r.career.v ? Object.assign(r.career, { cid: car.cid, rev: r.rev }) : null;
      if (newer && !opts.mid) { CR.car = newer; ls.set(TKEY + car.cid, newer); }
      return `sur ce PC seulement — ⚠ Quelqu'un a joué entre-temps (jour ${newer ? newer.day : '?'}) : c'est sa partie qui est gardée`;
    }
    return 'sur ce PC (' + (r.m || 'serveur indisponible') + ')';
  };
  /** INSTANTANÉ DE MI-JOURNÉE (hôte) : comme la fin de journée de sim_career.js (onEnd) mais SANS
      les charges du soir, ni tirages (devis, candidats), ni XP. Ne modifie PAS CR.car.
      → argent, réputation, stock, machines (positions + caisses), ouvriers et affectations,
        devis/contrats, livraisons en cours, travaux payés, écritures du jour déjà passées. */
  CR.snapshotFromState = (S, base) => {
    base = base || CR.car; if (!S || !S.car || !base) return null;
    const C2 = S.car, car = JSON.parse(JSON.stringify(base));
    car.money = C2.money; car.rep = C2.rep;
    car.contracts = C2.contracts || car.contracts; car.offers = C2.offers || car.offers;
    car.candidates = (C2.cands || car.candidates || []).concat(C2.hires || []);   // embauches pas encore effectives : on les remet en candidats
    for (const k in (S.stock || {})) if (car.stock[k] !== undefined || CAT.SUPPLY[k]) car.stock[k] = S.stock[k];
    car.deliveries = C2.deliv || [];
    const crates = (S.items || []).filter(o => o.type === 'machine').map(o => ({ uid: o.d.uid, model: o.d.model, x: o.x, z: o.z, crated: true }));
    if (S.machDefs) car.machines = S.machDefs.map(d => ({ uid: d.id, model: d.model, x: d.x, z: d.z, rot: d.rot || 0, wear: Math.round((S.machines && S.machines[d.id] && S.machines[d.id].wear) || 0) })).concat(crates);
    for (const p of S.pl ? Object.values(S.pl) : []) { const h = (p.inv || []).find(x => x && x.type === 'machine'); if (h) car.machines.push({ uid: h.d.uid, model: h.d.model, x: 0, z: 22, crated: true }); }
    for (const c of S.cars || []) for (const it of (c.bed || []).concat(c.load ? [c.load] : [])) if (it && it.type === 'machine') car.machines.push({ uid: it.d.uid, model: it.d.model, x: 4, z: 22, crated: true });
    if (C2.workers) car.workers = C2.workers.map(w => Object.assign(car.workers.find(x => x.uid === w.uid) || w, { assign: w.assign || null }));
    car.workers.forEach(w => { if (w.assign && !car.machines.some(m => m.uid === w.assign && !m.crated)) w.assign = null; });
    car.atelier.pending = C2.pending || null;
    const led = C2.ledger || [];
    for (const l of led) CR.book(car, C2.day, l.k, l.a, l.l, l.w);
    car.stats.earned = (car.stats.earned || 0) + led.filter(l => l.a > 0).reduce((a, l) => a + l.a, 0);
    car.stats.spent = (car.stats.spent || 0) - led.filter(l => l.a < 0).reduce((a, l) => a + l.a, 0);
    car.mid = { day: C2.day, t: Math.round(S.rt || 0) };
    return car;
  };
  /** Objectifs atteints (renvoie la liste des nouveaux) — appelé par l'hôte */
  CR.checkGoals = car => {
    car.goals = car.goals || {}; const out = [];
    for (const g of CAT.GOALS) if (!car.goals[g.id]) { let ok = false; try { ok = g.test(car); } catch (e) { ok = false; } if (ok) { car.goals[g.id] = car.day; out.push(g); } }
    return out;
  };
  CR.nextGoals = (car, n) => CAT.GOALS.filter(g => !(car.goals || {})[g.id]).slice(0, n || 3).map(g => ({ id: g.id, label: g.label, reward: g.reward }));
  /** Recommencer : carrière locale effacée ; entreprise en ligne → repart de zéro (même id, sauvée tout de suite) */
  CR.reset = () => {
    const old = CR.car;
    if (old && old.cid) { CR.car = Object.assign(CR.fresh(old.name), { cid: old.cid, rev: old.rev || 0 }); CR.save(CR.car); return; }
    try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } CR.car = null;
  };
  /** Écriture comptable (le grand livre = historique des dépenses, amendes par joueur comprises) */
  CR.book = (car, day, kind, amount, label, who) => { car.ledger.push({ d: day, k: kind, a: Math.round(amount), l: label, w: who || null }); };
  CR.fmt = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('fr-FR') + ' €';
})();
