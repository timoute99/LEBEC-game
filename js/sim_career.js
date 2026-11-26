/* =====================================================================
   sim_career.js — CARRIÈRE côté hôte : l'argent pendant la journée.
   Se branche sur Sim.mods (inactif hors mode carrière).

   État diffusé à tous (S.car) : argent, réputation, jour, niveau, pièces,
   capacité de stock, offres (devis), candidats, commandes en cours,
   livraisons attendues, écritures du jour (S.car.ledger), travaux prévus,
   embauches/licenciements prévus. Le PC du BE (be.js) lit S.car et envoie
   des intentions { a:'be', op, ... } traitées ici.

   Intentions BE (op) : accept(id) · decline(id) · order(what, lots) ·
   buy(model) · hire(uid) · fire(uid) · assign(uid, mid|null) ·
   build(room) · upgrade() — validées près du PC (cible 'be', sinon 'pc').

   Pendant la journée : ventes (onDeliver), pénalités (ticket raté),
   amendes PAR JOUEUR (K.fine : radars, gendarmerie, passants…),
   livraisons par camion (matière → quai/magasin, machines → caisse à
   déplacer au fenwick puis installer : voir sim_build.js).
   Fin de journée (onEnd) : salaires, électricité, loyer, échéances des
   devis, travaux et embauches appliqués pour le lendemain → res.career ;
   l'hôte sauvegarde (Career.save) depuis game.js.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, CAT = ML.CAREER, CR = ML.Career;
  const mod = {}; Sim.mods.push(mod);
  let S, car, on = false;

  const book = (k, a, l, who) => { S.car.ledger.push({ t: Math.round(S.rt), k, a: Math.round(a), l, w: who || null }); S.car.money += a; Sim.dirty = true; };
  K.money = (a, label, kind, who) => { if (!on) return; book(kind || (a >= 0 ? 'vente' : 'achat'), a, label, who); };
  /** Amende pour un joueur (radar, gendarmerie, passant renversé…) */
  K.fine = (pid, amount, label) => {
    if (!on) return; const P = K.S.pl[pid];
    book('amende', -Math.abs(amount), label, P ? P.name : null); car.stats.fines += Math.abs(amount);
  };
  K.careerOn = () => on;

  mod.init = cfg => {
    S = K.S; on = !!(cfg.game && cfg.game.career) && !!CR.car;
    if (!on) return;
    car = K.car = CR.car;
    const rooms = car.atelier.rooms;
    S.car = {
      name: car.name, day: car.day, money: car.money, rep: car.rep, lvl: car.atelier.lvl, rooms: Object.assign({}, rooms),
      stockMax: CAT.STOCK_MAX * (rooms.stock ? 2 : 1), offers: car.offers, cands: car.candidates.map(w => strip(w)),
      contracts: car.contracts, deliv: (car.deliveries || []).map(d => Object.assign({}, d, { eta: 25 + Math.random() * 20 })), ledger: [], pending: car.atelier.pending || null, dayMin: car.dayMin || 12, dayMinNext: car.dayMin || 12,
      workers: car.workers.map(w => strip(w)), hires: [], fires: [], start: car.money,
      goals: CR.nextGoals(car, 3), goalsDone: Object.keys(car.goals || {}).length, goalsTotal: CAT.GOALS.length
    };
    car.stats.signed = car.stats.signed || 0; car.stats.plateau = car.stats.plateau || 0; car.goals = car.goals || {};
    K.goalT = 0;
    for (const k in car.stock) S.stock[k] = car.stock[k];
    S.machDefs = ML.MACHINES.map(d => Object.assign({}, d));
    // caisses de machines pas encore installées (posées où on les a laissées hier)
    for (const c of (ML.ATELIER.crates || [])) K.spawnItem({ type: 'machine', d: { uid: c.uid, model: c.model } }, c.x, 0, c.z);
    K.inProd = {};
  };
  const strip = w => ({ uid: w.uid, name: w.name, trait: w.trait, speed: w.speed, lazy: w.lazy, salary: w.salary, assign: w.assign || null, legend: w.legend || null, look: w.look, xp: w.xp || 0 });

  /* ---------- Tickets : tirés des devis acceptés (sinon petits dépannages) ---------- */
  K.careerOrder = () => {
    if (!on) return null;
    const busy = id => S.orders.filter(o => o.contract === id).length;
    const c = S.car.contracts.find(x => x.left > busy(x.id));
    if (c) return { kind: c.kind, part: c.part, mat: c.mat, mtype: c.mtype, tool: c.tool, client: c.client, size: c.size, contract: c.id, price: c.unit };
    if (K.rng() < 0.35) {                                           // client de passage : petite pièce pas chère
      const [part, mat, mtype, tool] = K.rng.pick(ML.PARTS.plain.filter(p => S.machDefs.some(d => d.type === p[2])).concat([])) || ML.PARTS.plain[0];
      const client = K.rng.pick(Object.keys(CAT.CLIENT_REP).filter(k => ML.LOC.comp[k] && S.car.rep >= CAT.CLIENT_REP[k]));
      if (!client) return null;
      return { kind: 'plain', part, mat, mtype, tool, client, size: 's', contract: null, price: Math.round(CAT.PRICE.s * 0.7) };
    }
    return null;
  };
  mod.onDeliver = (pid, o) => {
    if (!on) return;
    const early = Math.max(0, (o.dl - S.rt) / o.dur), P = S.pl[pid];
    const price = Math.round((o.price || CAT.PRICE[o.size || 'm']) * (0.9 + 0.25 * early) * (S.car.rooms.metrologie ? 1.1 : 1));
    book('vente', price, `Pièce #${o.id} (${o.part}) livrée à ${ML.COMPANIES[o.client].name}`, P ? P.name : null);
    K.big(`+${CR.fmt(price)}`, '#3ecf8e');
    const c = o.contract && S.car.contracts.find(x => x.id === o.contract);
    if (c) { c.left--; c.done = (c.done || 0) + 1; if (c.left <= 0) { S.car.contracts = S.car.contracts.filter(x => x !== c); S.car.rep = Math.min(100, S.car.rep + 3); K.all(`🤝 Contrat ${ML.COMPANIES[c.client].name} terminé ! Réputation +3`, 'good'); } }
    car.stats.served++; if (ML.COMPANIES[o.client] && ML.COMPANIES[o.client].plateau) car.stats.plateau++;
    checkGoals();
  };
  mod.onFail = o => {
    if (!on) return;
    const pen = Math.round((o.price || 150) * 0.25);
    book('penalite', -pen, `Pénalité de retard #${o.id} (${ML.COMPANIES[o.client].name})`);
    S.car.rep = Math.max(0, S.car.rep - 2); car.stats.failed++;
  };

  /* ---------- Intentions du PC du BE ---------- */
  const nearPC = ps => { const t = ML.World.target('be') || ML.World.target('pc'); return !t || K.near(ps, t.x, t.z, t.r + 3); };
  mod.act = (pid, P, ps, sel, held, m) => {
    if (m.a !== 'be' || !on) return false;
    if (!nearPC(ps)) { K.note(pid, 'Il faut être devant le PC du BE.', 'warn'); return true; }
    const who = P.name, C2 = S.car, say = (s, ty) => K.note(pid, s, ty || 'info');
    const pay = (price, label, kind) => { if (C2.money - price < CAT.BANKRUPT * 0.5) { say(`Pas assez d'argent (${CR.fmt(C2.money)}). La banque refuse.`, 'warn'); return false; } book(kind || 'achat', -price, label, who); return true; };
    switch (m.op) {
      case 'accept': {
        const o = C2.offers.find(x => x.id === m.id); if (!o) return true;
        C2.offers = C2.offers.filter(x => x !== o);
        C2.contracts.push(Object.assign({}, o, { left: o.qty, due: C2.day + o.days }));
        car.stats.signed++; checkGoals();
        K.all(`📝 ${who} a signé le devis ${ML.COMPANIES[o.client].name} : ${o.qty} × ${o.part} (${CR.fmt(o.unit)} pièce, pour le jour ${C2.day + o.days}).`, 'good'); K.sfx('cash'); break;
      }
      case 'decline': C2.offers = C2.offers.filter(x => x.id !== m.id); break;
      case 'order': {
        const s = CAT.SUPPLY[m.what], lots = U.clamp(m.lots | 0, 1, 5); if (!s) return true;
        const qty = s.lot * lots, inStock = S.stock[m.what] || 0, pend = C2.deliv.filter(d => d.what === m.what).reduce((a, d) => a + d.qty, 0);
        if (inStock + pend + qty > C2.stockMax) { say(`Plus de place dans le stock (${C2.stockMax} max par référence${C2.rooms.stock ? '' : ' : construis un magasin !'}).`, 'warn'); return true; }
        if (!pay(qty * s.price, `Commande ${qty} × ${s.label}`)) return true;
        C2.deliv.push({ id: S.nextId++, kind: 'matiere', what: m.what, qty, eta: S.rt + s.delay, by: who });
        K.all(`📦 ${who} a commandé ${qty} × ${s.label} : livraison dans ~${s.delay} s.`, 'info'); break;
      }
      case 'buy': {
        const M = CAT.MACHINES[m.model]; if (!M) return true;
        if (!pay(M.price, `Achat machine : ${M.name}`, 'machine')) return true;
        const u = 'M' + (++car.next);
        C2.deliv.push({ id: S.nextId++, kind: 'machine', model: m.model, uid: u, eta: S.rt + CAT.MACHINE_DELAY, by: who });
        K.all(`🏭 ${who} a acheté : ${M.name} ! Le camion arrive dans ~${CAT.MACHINE_DELAY} s (zone LIVRAISONS). Il faudra la déplacer au fenwick puis l'installer.`, 'good'); K.sfx('cash'); break;
      }
      case 'hire': {
        const w = C2.cands.find(x => x.uid === m.uid); if (!w) return true;
        if (C2.workers.length + C2.hires.length - C2.fires.length >= 2 + (C2.lvl + 1) * 2) { say('Trop de monde pour la taille de l\'atelier. Agrandis d\'abord !', 'warn'); return true; }
        C2.cands = C2.cands.filter(x => x !== w); C2.hires.push(w);
        K.all(`🤝 ${who} a embauché ${w.name} (${CAT.TRAITS[w.trait].label}, ${CR.fmt(w.salary)}/jour). Il/elle commence demain matin.`, 'good'); break;
      }
      case 'fire': {
        const w = C2.workers.find(x => x.uid === m.uid); if (!w || C2.fires.includes(w.uid)) return true;
        C2.fires.push(w.uid); K.all(`📤 ${w.name} est licencié·e : dernier jour aujourd'hui.`, 'warn'); break;
      }
      case 'assign': return assign(pid, m.uid, m.mid || null), true;
      case 'build': {
        const R = CAT.ROOMS[m.room]; if (!R || C2.rooms[m.room]) return true;
        if (C2.lvl < R.minLvl) { say(`Il faut d'abord agrandir l'atelier (niveau ${R.minLvl + 1}).`, 'warn'); return true; }
        if (C2.pending) { say('Des travaux sont déjà prévus cette nuit.', 'warn'); return true; }
        if (!pay(R.price, `Travaux : ${R.name}`, 'travaux')) return true;
        C2.pending = { room: m.room }; K.all(`🏗 Travaux commandés : ${R.name}. Les ouvriers du bâtiment viennent cette nuit !`, 'good'); break;
      }
      case 'daylen': { const n = [8, 12, 16, 20].includes(m.min | 0) ? m.min | 0 : 12; C2.dayMinNext = n; car.dayMin = n; K.all(`⏱ ${who} a réglé les journées sur ${n} minutes (à partir de demain).`, 'info'); break; }
      case 'upgrade': {
        const L = CAT.LEVELS[C2.lvl + 1]; if (!L) return true;
        if (C2.pending) { say('Des travaux sont déjà prévus cette nuit.', 'warn'); return true; }
        if (!pay(L.price, `Agrandissement : ${L.name}`, 'travaux')) return true;
        C2.pending = { lvl: C2.lvl + 1 }; K.all(`🏗 Agrandissement commandé : « ${L.name} ». Demain matin, surprise !`, 'good'); break;
      }
      default: return true;
    }
    Sim.dirty = true; return true;
  };

  /** Affecte un ouvrier à une machine (ou le retire). Effet immédiat. */
  function assign(pid, wuid, mid) {
    const C2 = S.car, w = C2.workers.find(x => x.uid === wuid); if (!w) return;
    const id = w.legend || 'w_' + w.uid, n = K.npcs[id]; if (!n) return;
    if (mid && !S.machines[mid]) return;
    // libère l'ancien poste et l'ancien occupant de la machine visée
    for (const k in S.machines) if (S.machines[k].op === id) S.machines[k].op = null;
    if (mid) { const prev = S.machines[mid].op; if (prev && prev !== id) { const pw = C2.workers.find(x => (x.legend || 'w_' + x.uid) === prev); if (pw) pw.assign = null; unhome(K.npcs[prev]); } S.machines[mid].op = id; }
    w.assign = mid; K.opOf = {}; for (const k in S.machines) if (S.machines[k].op) K.opOf[S.machines[k].op] = k;
    if (mid) { const st = ML.World.machines[mid] && ML.World.machines[mid].station; n.mid = mid; n.home = st; n.state = 'work'; if (st) K.walkTo(n, st.x, st.z); K.say(n, `OK, je passe sur ${mid} !`); }
    else unhome(n);
    Sim.dirty = true;
  }
  function unhome(n) { if (!n) return; n.mid = null; n.home = null; n.state = 'idle'; const sp = (ML.LOC.idle || ML.LOC.coffee)[0]; K.walkTo(n, sp.x + K.rng() * 2 - 1, sp.z + K.rng() * 2 - 1); }
  K.careerAssign = assign;
  /** Une machine a bougé / été installée : recale l'ouvrier sur sa nouvelle station */
  K.rehome = mid => { const M = S.machines[mid]; if (!M || !M.op) return; const n = K.npcs[M.op], st = ML.World.machines[mid] && ML.World.machines[mid].station; if (n && st) { n.home = st; n.mid = mid; if (n.state === 'work' || n.state === 'idle') { n.state = 'work'; K.walkTo(n, st.x, st.z); } } };

  /* ---------- Cerveau des ouvriers sans poste : ils traînent au coin café ---------- */
  mod.brain = (n, dt) => {
    if (!on || !ML.PEOPLE[n.id] || !ML.PEOPLE[n.id].op || n.mid) return false;
    n.idleT = (n.idleT || 0) - dt;
    if (n.idleT <= 0 && !n.path.length) { n.idleT = 6 + K.rng() * 10; const sp = K.rng.pick(ML.LOC.idle || ML.LOC.coffee); K.walkTo(n, sp.x + K.rng() * 2 - 1, sp.z + K.rng() * 2 - 1); if (K.rng() < 0.3) K.say(n, K.rng.pick(['On m\'affecte où, chef ?', 'Je m\'ennuie...', 'Y a pas une machine pour moi ?', 'Je peux balayer, sinon.'])); }
    return true;
  };

  /* ---------- Livraisons par camion ---------- */
  mod.step = dt => {
    if (!on) return;
    K.goalT -= dt; if (K.goalT <= 0) { K.goalT = 5; checkGoals(); }
    for (const d of S.car.deliv.slice()) {
      if (S.rt < d.eta) continue;
      S.car.deliv = S.car.deliv.filter(x => x !== d);
      const Z = ML.LOC.livraison || { x: 0, z: 24 };
      if (d.kind === 'matiere') {
        if (S.car.rooms.stock) { S.stock[d.what] = (S.stock[d.what] || 0) + d.qty; K.all(`🚚 Livraison rangée au magasin : +${d.qty} ${CAT.SUPPLY[d.what].label}.`, 'good'); }
        else {
          const mat = ML.MATERIALS[d.what];
          for (let q = d.qty; q > 0; q -= 3) K.spawnItem({ type: 'matiere', d: mat ? { mat: d.what, q: Math.min(3, q) } : { t: 1, tool: d.what, q: Math.min(3, q) } }, Z.x + (K.rng() - 0.5) * 4, 0, Z.z + (K.rng() - 0.5) * 3);
          K.all(`🚚 Le camion a livré ${d.qty} × ${CAT.SUPPLY[d.what].label} en zone LIVRAISONS : à ranger en RÉCEPTION !`, 'good');
        }
      } else if (d.kind === 'machine') {
        K.spawnItem({ type: 'machine', d: { uid: d.uid, model: d.model } }, Z.x, 0, Z.z);
        K.all(`🚚 ${CAT.MACHINES[d.model].name} livrée en zone LIVRAISONS ! Fenwick → dans l'atelier → installer (E).`, 'good');
      }
      K.sfx('horn', Z.x, Z.z); Sim.dirty = true;
    }
  };

  /* ---------- Objectifs (paliers) ---------- */
  /** Vérifie les objectifs sur un instantané de la carrière (argent / machines / ouvriers du moment) */
  function checkGoals() {
    if (!on) return;
    const snap = Object.assign({}, car, { money: S.car.money, rep: S.car.rep, machines: S.machDefs.map(d => ({ uid: d.id, model: d.model })).concat(car.machines.filter(m => m.crated)), workers: S.car.workers });
    snap.goals = car.goals;
    for (const g of CR.checkGoals(snap)) {
      car.goals[g.id] = S.car.day;
      if (g.reward) book('objectif', g.reward, `🏆 Objectif : ${g.label}`);
      K.big(`🏆 ${g.label}${g.reward ? ' · +' + CR.fmt(g.reward) : ''}`, '#ffc93c'); K.sfx('success');
      K.all(`🏆 OBJECTIF ATTEINT : ${g.label}${g.reward ? ` (prime de ${CR.fmt(g.reward)})` : ''} !`, 'good');
    }
    S.car.goals = CR.nextGoals(car, 3); S.car.goalsDone = Object.keys(car.goals).length; Sim.dirty = true;
  }
  K.checkGoals = checkGoals;

  /* ---------- Fin de journée : charges, échéances, lendemain ---------- */
  mod.onEnd = res => {
    if (!on) return;
    const C2 = S.car, lines = [];
    const charge = (k, a, l) => { book(k, -a, l); lines.push([l, -a]); };
    const sal = C2.workers.filter(w => true).reduce((a, w) => a + w.salary, 0);
    if (sal) charge('salaire', sal, `Salaires (${C2.workers.length} ouvrier${C2.workers.length > 1 ? 's' : ''})`);
    charge('charges', CAT.POWER * S.machDefs.length, `Électricité (${S.machDefs.length} machine${S.machDefs.length > 1 ? 's' : ''})`);
    charge('charges', CAT.LEVELS[C2.lvl].rent, `Loyer : ${CAT.LEVELS[C2.lvl].name}`);
    // devis en retard
    for (const c of C2.contracts.slice()) if (C2.day + 1 > c.due) { const pen = Math.round(c.unit * c.left * 0.4); charge('penalite', pen, `Contrat ${ML.COMPANIES[c.client].name} non honoré (${c.left} pièce(s))`); C2.rep = Math.max(0, C2.rep - 6); C2.contracts = C2.contracts.filter(x => x !== c); }
    const earned = C2.ledger.filter(l => l.a > 0).reduce((a, l) => a + l.a, 0), spent = -C2.ledger.filter(l => l.a < 0).reduce((a, l) => a + l.a, 0);
    // réputation : satisfaction du jour
    C2.rep = U.clamp(C2.rep + Math.round((S.sat - 60) / 10), 0, 100);
    // → état persistant
    car.money = C2.money; car.rep = C2.rep; car.day = C2.day + 1; car.contracts = C2.contracts; car.stats.earned += earned; car.stats.spent += spent;
    car.stats.best = Math.max(car.stats.best, earned - spent);
    for (const k in S.stock) if (car.stock[k] !== undefined || CAT.SUPPLY[k]) car.stock[k] = S.stock[k];
    // commandes pas encore arrivées : livrées demain matin
    car.deliveries = C2.deliv;
    // machines : positions de la journée + caisses pas installées
    const crates = S.items.filter(o => o.type === 'machine').map(o => ({ uid: o.d.uid, model: o.d.model, x: o.x, z: o.z, crated: true }));
    car.machines = S.machDefs.map(d => ({ uid: d.id, model: d.model, x: d.x, z: d.z, rot: d.rot || 0, wear: Math.round((S.machines[d.id] && S.machines[d.id].wear) || 0) })).concat(crates);
    for (const p of S.pl ? Object.values(S.pl) : []) { const h = p.inv.find(x => x && x.type === 'machine'); if (h) car.machines.push({ uid: h.d.uid, model: h.d.model, x: 0, z: 22, crated: true }); }
    for (const c of S.cars) for (const it of (c.bed || []).concat(c.load ? [c.load] : [])) if (it && it.type === 'machine') car.machines.push({ uid: it.d.uid, model: it.d.model, x: 4, z: 22, crated: true });
    // ouvriers : licenciements, embauches, affectations
    car.workers = C2.workers.filter(w => !C2.fires.includes(w.uid)).map(w => Object.assign(car.workers.find(x => x.uid === w.uid) || w, { assign: w.assign, xp: (w.xp || 0) + 1 }));
    for (const w of car.workers) if (w.trait === 'apprenti' && w.xp % 5 === 0) w.speed = Math.min(1.1, +(w.speed + 0.05).toFixed(2));
    car.workers.forEach(w => { if (w.assign && !car.machines.some(m => m.uid === w.assign)) w.assign = null; });   // machine en caisse : l'ouvrier la retrouvera après réinstallation
    for (const h of C2.hires) car.workers.push(Object.assign({}, h, { assign: null }));
    // travaux de la nuit
    if (C2.pending) { if (C2.pending.lvl !== undefined) car.atelier.lvl = C2.pending.lvl; if (C2.pending.room) car.atelier.rooms[C2.pending.room] = 1; }
    car.atelier.pending = null;
    // un ledger persistant (historique des dépenses, amendes par joueur)
    for (const l of C2.ledger) CR.book(car, C2.day, l.k, l.a, l.l, l.w);
    const r = U.rng(car.seed + car.day * 7919); CR.rollCandidates(car, r); CR.rollOffers(car, r);
    const bankrupt = car.money < CAT.BANKRUPT;
    res.career = { day: C2.day, money: car.money, start: C2.start, earned, spent, lines, rep: C2.rep, bankrupt, ledger: C2.ledger, fines: C2.ledger.filter(l => l.k === 'amende') };
  };
})();
