/* =====================================================================
   sim_v6.js — V6 (hôte) :
   - FAIM et FATIGUE des joueurs (manger, café, sieste ; à 0 → évanouissement) ;
   - PIÈCES AU BLACK : Jean-Mi derrière l'atelier, réputation « black »,
     contrôles de police, PLANQUE (bâche) et faux programme sur les machines ;
   - PERTURBATEURS : squatteurs (GRANDE clé à molette), Dennis (on lui lance
     des sacs-poubelle), racketteurs en ville et mauvais payeurs (BATTE) ;
   - DISTRACTIONS : PMU, blackjack, prêteur sur gages, boîte de nuit,
     combats clandestins (tout se paie avec la caisse de l'atelier) ;
   - MODE ADMIN (tests) : argent illimité, déclencher commandes / événements.
   Toute la logique est ici, côté hôte ; l'affichage est dans js/v6.js.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, C = ML.CFG, ECO = ML.ECO, V = ML.V6, COMP = ML.COMPANIES;
  let S, rng, npcs, X;
  const mod = {};
  const OUT = { x: 0, z: 24 };
  const name = pid => (S.pl[pid] ? S.pl[pid].name : 'Quelqu\'un');
  const near = (p, x, z, r) => p && Math.hypot(p.x - x, p.z - z) < r;
  const lebecSay = (t, force) => { const n = npcs.lebec; if (n && n.active) K.say(n, t, !!force); };
  const tip = (k, to) => K.ev(to ? { e: 'tip', k, to } : { e: 'tip', k });
  const timers = [];
  const later = (sec, fn) => timers.push({ t: S.rt + sec, fn });

  mod.init = cfg => {
    S = K.S; rng = K.rng; npcs = K.npcs; const g = cfg.game || {}, E = g.E || {};
    X = K.v6 = { bpT: 25 + rng() * 20, raidT: 9e9, racketT: 70 + rng() * 60, bj: {}, adm: null, sq: 0, dn: 0, hungerOn: S.mode !== 'course' };
    S.brep = Math.max(0, Math.min(100, Math.round(E.brep || 0))); S.bprops = []; S.hidden = []; S.debts = []; S.raid = null;
    for (const pid in S.pl) { S.pl[pid].food = 100; S.pl[pid].sleep = 100; }
    timers.length = 0;
    const H = ML.LOC.hotdog, n = npcs.hotdog;
    if (H && n && S.mode !== 'course') Object.assign(n, { active: true, x: H.x, z: H.z, yaw: H.yaw, state: 'shop', home: H });
    planRaid();
  };
  function planRaid() { const e = V.black.every; X.raidT = S.rt + (e[0] + rng() * (e[1] - e[0])) * (1 - Math.min(0.55, S.brep / 180)); }
  const blackActive = () => S.brep > 0 || S.orders.some(o => o.blk) || S.items.some(o => o.d && o.d.blk) || S.hidden.length;

  /* ======================= Faim et fatigue ======================= */
  function needs(dt) {
    if (!X.hungerOn || (S.beginner && !S.tutoDone)) return;
    const slow = K.D.dmg < 0.7 ? 0.7 : 1;                                // en facile, on tient plus longtemps
    for (const pid in S.pl) {
      const P = S.pl[pid]; if (P.food === undefined) { P.food = 100; P.sleep = 100; }
      if (P.faint) { if (S.rt >= P.faint) { P.faint = 0; P.food = Math.max(P.food, V.faint.back); P.sleep = Math.max(P.sleep, V.faint.back); K.note(pid, '😵‍💫 Tu reprends tes esprits… Mange et repose-toi !', 'warn'); Sim.dirty = true; } continue; }
      if (P.nap) { if (S.rt >= P.nap) { P.nap = 0; P.sleep = 100; K.note(pid, '😴 Petite sieste : te voilà en pleine forme !', 'good'); Sim.dirty = true; } continue; }
      const f0 = P.food, s0 = P.sleep;
      P.food = Math.max(0, P.food - dt * 100 / V.food.sec * slow);
      P.sleep = Math.max(0, P.sleep - dt * 100 / V.sleep.sec * slow);
      if (f0 > 25 && P.food <= 25) { K.note(pid, '🍔 Tu as FAIM : mange quelque chose (hot-dog devant l\'atelier, distributeur…) sinon tu vas tomber !', 'warn'); tip('faim', pid); }
      if (s0 > 25 && P.sleep <= 25) { K.note(pid, '💤 Tu es ÉPUISÉ·E : un café, ou une sieste sur la banquette de la salle de pause (E) !', 'warn'); tip('faim', pid); }
      if (Math.floor(f0) !== Math.floor(P.food) || Math.floor(s0) !== Math.floor(P.sleep)) Sim.dirty = true;
      if ((P.food <= 0 || P.sleep <= 0) && !P.ko) faint(pid, P.food <= 0 ? 'de faim' : 'de fatigue');
    }
  }
  function faint(pid, why) {
    const P = S.pl[pid]; P.faint = S.rt + V.faint.sec; K.dropAll(pid, 1.5);
    K.ev({ e: 'faint', to: pid, d: V.faint.sec }); K.big(`😵 ${P.name} S'ÉVANOUIT ${why.toUpperCase()} !`, '#ff9f1a'); K.sfx('bong');
    K.all(`😵 ${P.name} s'est évanoui·e ${why} en pleine journée ! (${V.faint.sec} s par terre)`, 'warn');
    lebecSay(why === 'de faim' ? 'On MANGE dans cette boîte ! Un hot-dog, c\'est pas compliqué !' : 'Il dort debout celui-là ! Une sieste, un café, quelque chose !', true);
    Sim.dirty = true;
  }
  K.v6Eat = (P, type) => { P.food = Math.min(100, (P.food === undefined ? 100 : P.food) + (V.food.eat[type] || 20)); Sim.dirty = true; };
  K.v6Coffee = P => { P.sleep = Math.min(100, (P.sleep === undefined ? 100 : P.sleep) + V.sleep.coffee); Sim.dirty = true; };

  /* ======================= Pièces au black ======================= */
  function genBlack() {
    let types = new Set(Object.keys(S.machines).map(id => ML.MACHINES.find(m => m.id === id).type)); if (!types.size) types = new Set(['tour', 'fraiseuse']);
    const list = ML.PARTS.plain.filter(x => types.has(x[2])); if (!list.length) return;
    const [part, mat, mtype, tool] = rng.pick(list), size = rng() < 0.3 ? 's' : 'm';
    const dur = (C.ORDER.base + 60) * K.D.dur * 1.3, price = Math.round(K.orderPrice(['usinage', 'livraison'], size, false) * V.black.mult * (1 + S.brep / 120));
    S.bprops.push({ id: S.nextOid++, client: 'noir', part: part + ' (sans facture)', mat, mtype, tool, steps: ['usinage', 'livraison'], si: 0, size, src: null, dur, price, exp: S.rt + 240, blk: true });
    Sim.dirty = true;
  }
  function blackStep(dt) {
    if (S.mode === 'course' || S.mode === 'inspection' || (S.beginner && !S.tutoDone)) return;
    X.bpT -= dt;
    if (X.bpT <= 0) { X.bpT = (70 + rng() * 60) * (1 - Math.min(0.5, S.brep / 200)); if (S.bprops.length < V.black.props) genBlack(); }
    S.bprops = S.bprops.filter(p => p.exp > S.rt);
    for (const id in S.machines) { const M = S.machines[id]; if (M.job) { const o = S.orders.find(x => x.id === M.job.oid); M.job.blk = !!(o && o.blk); } }
    // contrôle de police
    if (!S.raid && S.rt >= X.raidT && S.rt < C.SHIFT_SEC - 40) { if (blackActive()) raidStart(); else planRaid(); }
    if (S.raid && S.raid.st === 'warn' && S.rt >= S.raid.t) raidArrive();
  }
  function raidStart() {
    S.raid = { st: 'warn', t: S.rt + V.black.warn }; tip('raid'); K.sfx('siren');
    K.big(`🚔 CONTRÔLE DE POLICE DANS ${V.black.warn} s !`, '#4ea3ff');
    K.all(`🚔 Les flics arrivent (brigade financière) ! PLANQUE les caisses au black (bâche, mur gauche, E) et mets un FAUX PROGRAMME sur les machines qui usinent du black (E dessus).`, 'warn');
    lebecSay('Les poulets ! Planquez-moi ce qu\'il faut planquer, et vite !', true);
    const n = npcs.flic; if (n && !n.active) { Object.assign(n, { active: true, x: OUT.x, z: OUT.z + 8, state: 'arrive', path: [], stun: 0, speed: 2.2 }); K.walkTo(n, 2, 4); }
    Sim.dirty = true;
  }
  function raidArrive() {
    const n = npcs.flic; let found = 0, fine = 0; const bits = [];
    for (const o of S.items.slice()) if (o.d && o.d.blk && (U.inWorkshop(o) || (Math.abs(o.x) < 30 && o.z > 12 && o.z < 34))) { found++; K.removeItem(o); bits.push(`caisse ${ML.on(o.d.oid)}`); dropOrder(o.d.oid); }
    for (const pid in S.pl) { const P = S.pl[pid], p = K.pose[pid]; if (!p || !(U.inWorkshop(p) || near(p, 0, 22, 18))) continue; P.inv.forEach((it, i) => { if (it && it.d && it.d.blk) { found++; P.inv[i] = null; bits.push(`caisse de ${P.name}`); dropOrder(it.d.oid); } }); }
    for (const id in S.machines) { const M = S.machines[id]; if (M.job && M.job.blk && !M.job.cam) { found++; bits.push(`programme au black sur ${id}`); dropOrder(M.job.oid); M.job = null; } }
    if (found) {
      fine = V.black.fine * found; K.fine(fine, `Travail au black (${found})`); S.brep = Math.max(0, S.brep - 12);
      K.big(`🚔 PRIS ! −${fine} €`, '#ff3b30'); K.sfx('fail');
      K.all(`🚔 La police a trouvé : ${bits.join(', ')}. Amende : −${fine} € et tout est confisqué !`, 'warn');
      if (n) K.say(n, 'Travail dissimulé, mon gaillard. Procès-verbal !', true);
      lebecSay('Mais quelle bande d\'amateurs !!!', true);
    } else {
      K.big('🚔 CONTRÔLE : R.A.S.', '#3ecf6e'); K.all('🚔 Les flics n\'ont rien trouvé. Bien joué… (la planque, ça marche).', 'good');
      if (n) K.say(n, 'Rien à signaler. Pour cette fois.'); S.brep = Math.min(100, S.brep + 2);
    }
    S.raid = null; planRaid();
    if (n) { n.state = 'leave'; K.walkTo(n, OUT.x, OUT.z + 6, () => { n.active = false; n.state = 'away'; Sim.dirty = true; }); }
    Sim.dirty = true;
  }
  function dropOrder(oid) { const i = S.orders.findIndex(x => x.id === oid); if (i >= 0) S.orders.splice(i, 1); }

  /* ======================= Perturbateurs ======================= */
  const VIG = () => S.up.vigile && npcs.vigile && npcs.vigile.active;
  function visit(id, speed, x, z) {
    const n = npcs[id]; Object.assign(n, { active: true, x: (x !== undefined ? x : OUT.x) + (rng() - 0.5) * 2, z: z !== undefined ? z : OUT.z + 4, state: 'arrive', path: [], carry: null, stun: 0, speed: speed || 2.4, run: false });
    Sim.dirty = true; return n;
  }
  function away(n, line) {
    if (!n || !n.active) return; if (line) K.say(n, line);
    n.state = 'leave'; n.run = true; n.runSpeed = 5; K.walkTo(n, OUT.x + (rng() - 0.5) * 6, OUT.z + 14, () => { n.active = false; n.state = 'away'; Sim.dirty = true; }, true);
    Sim.dirty = true;
  }
  function squatStart() {
    if (npcs.squat1.active) return;
    if (VIG()) { K.all('🛡 Raymond le videur a refoulé deux squatteurs à l\'entrée.', 'good'); return; }
    const A = visit('squat1', 2.0), B = visit('squat2', 2.0); tip('squat');
    K.big('🛋 DES SQUATTEURS DANS L\'ATELIER !', '#ff9f1a');
    K.all('🛋 Deux squatteurs s\'installent dans l\'atelier : ils salissent et font fuir les clients ! La GRANDE CLÉ À MOLETTE (mur gauche) les fera déguerpir.', 'warn');
    lebecSay('C\'est pas un hôtel ici ! Sortez-moi ces deux-là… avec la GRANDE clé, ils ne comprennent que ça.', true);
    K.walkTo(A, -15.5, 11.5, () => { A.state = 'squat'; }); K.walkTo(B, -14, 9.5, () => { B.state = 'squat'; });
    X.sq = S.rt + V.squat.every;
  }
  function squatStep() {
    const L = ['squat1', 'squat2'].map(k => npcs[k]).filter(n => n.active && n.state === 'squat'); if (!L.length || S.rt < X.sq) return;
    X.sq = S.rt + V.squat.every;
    S.sat = Math.max(0, S.sat - V.squat.sat); const n = rng.pick(L); K.addPuddle(n.x + (rng() - 0.5) * 2, n.z + (rng() - 0.5) * 2);
    const waiting = (S.parts || []).filter(p => p.st === 'wait'); if (waiting.length) { const p = waiting[0]; p.st = 'gone'; if (npcs[p.id]) away(npcs[p.id], 'Beurk… je reviendrai quand ce sera propre.'); K.all('😖 Un client au comptoir est parti à cause des squatteurs !', 'warn'); }
    K.say(n, rng.pick(['T\'as pas une clope ?', 'On est bien là, non ?', 'Elle est où la télé ?', 'Hé, la machine à café, elle est gratuite ?']));
    Sim.dirty = true;
  }
  function dennisStart() {
    const n = npcs.dennis; if (!n || n.active) return;
    visit('dennis', 3.2); tip('dennis'); X.dn = S.rt + 4;
    K.big('👦 DENNIS EST LÀ…', '#ff9f1a');
    K.all('👦 Dennis, le gamin du quartier, débarque avec ses bombes de peinture ! Les coups ne marchent pas : LANCE-LUI des sacs-poubelles (pile à côté de la benne, clic droit pour lancer).', 'warn');
    lebecSay('Encore ce gamin ! Balancez-lui un sac-poubelle, il n\'y a que ça qui marche !', true);
    n.state = 'roam'; n.until = S.rt + 75;
  }
  function dennisStep() {
    const n = npcs.dennis; if (!n || !n.active || n.state !== 'roam') return;
    if (S.rt > n.until) { away(n, 'Nananère ! À demain !'); return; }
    if (S.rt < X.dn || (n.path && n.path.length)) return;
    X.dn = S.rt + 5 + rng() * 3;
    const spots = [{ x: -8, z: 8 }, { x: 6, z: 2 }, { x: -12, z: -2 }, { x: 10, z: 18 }, { x: -6, z: 20 }, { x: 14, z: -4 }, { x: 0, z: 10 }];
    const t = rng.pick(spots); K.walkTo(n, t.x, t.z, () => {
      if (n.state !== 'roam') return;
      K.addPuddle(n.x, n.z); S.sat = Math.max(0, S.sat - 2);
      const it = S.items.find(o => o.rest && Math.hypot(o.x - n.x, o.z - n.z) < 4 && !K.isPart(o)); if (it) { it.rest = false; it.vx = (rng() - 0.5) * 6; it.vy = 4; it.vz = (rng() - 0.5) * 6; }
      K.say(n, rng.pick(['PSCHHHT ! Joli tag !', 'Hihihi !', 'Attrape-moi si tu peux !', 'Lebec est un gros naze !'])); Sim.dirty = true;
    }, true); n.runSpeed = 4.4;
  }
  // racketteur : en ville, loin de l'atelier, à pied
  function racketStep(dt) {
    if (S.mode === 'course' || S.mode === 'inspection' || (S.beginner && !S.tutoDone)) return;
    const n = npcs.racket; if (!n) return;
    if (!n.active) {
      X.racketT -= dt; if (X.racketT > 0) return;
      X.racketT = V.racket.every[0] + rng() * (V.racket.every[1] - V.racket.every[0]);
      const cand = Object.keys(S.pl).filter(pid => { const P = S.pl[pid], p = K.pose[pid]; return p && K.foot(P) && !P.jail && Math.hypot(p.x, p.z) > V.racket.dist && !(ML.World.interiors || []).some(I => p.x > I.minX && p.x < I.maxX && p.z > I.minZ && p.z < I.maxZ); });
      if (!cand.length) return;
      const pid = rng.pick(cand), p = K.pose[pid], a = rng() * 6.283;
      let x = p.x + Math.cos(a) * 12, z = p.z + Math.sin(a) * 12; for (let i = 0; i < 8 && U.inCollider(x, z, 0.5); i++) { const b = rng() * 6.283; x = p.x + Math.cos(b) * 10; z = p.z + Math.sin(b) * 10; }
      if (U.inCollider(x, z, 0.5)) return;
      Object.assign(n, { active: true, x, z, state: 'follow', path: [], stun: 0, speed: 3.0, victim: pid, askT: 0, reT: 0 });
      K.say(n, 'Eh toi ! Viens voir par ici…'); Sim.dirty = true; return;
    }
    const pid = n.victim, p = K.pose[pid], P = S.pl[pid];
    if (!p || !P || n.state === 'leave') return;
    if (n.state === 'follow') {
      if (S.rt > n.reT) { n.reT = S.rt + 0.8; K.walkTo(n, p.x, p.z, null, true); n.runSpeed = 4.2; }
      if (near(p, n.x, n.z, 2.6)) { n.state = 'ask'; K.stop(n); n.askT = S.rt + V.racket.wait; K.say(n, `T'as pas ${V.racket.ask} € ? Non parce que sinon… je m'énerve.`, true); tip('racket', pid); K.note(pid, `🕶 Un racketteur te réclame ${V.racket.ask} € ! E sur lui pour répondre (ou sors ta BATTE).`, 'warn'); Sim.dirty = true; }
      if (!K.foot(P) || Math.hypot(p.x, p.z) < 40) away(n);
    } else if (n.state === 'ask') {
      n.faceYaw = Math.atan2(p.x - n.x, p.z - n.z);
      if (S.rt > n.askT || !near(p, n.x, n.z, 9)) racketAttack(n, pid);
    }
  }
  function racketAttack(n, pid) {
    const P = S.pl[pid]; if (!P) return away(n);
    const steal = Math.min(250, Math.max(20, Math.round(Math.max(0, S.money) * V.racket.steal)));
    K.damage(pid, V.racket.dmg, 'racket'); K.fine(steal, 'Racketté en ville', pid); K.ev({ e: 'push', to: pid, vx: (K.pose[pid].x - n.x) * 3, vz: (K.pose[pid].z - n.z) * 3 });
    K.big(`🕶 ${P.name} S'EST FAIT RACKETTER (−${steal} €)`, '#ff3b30'); K.all(`🕶 ${P.name} a refusé de payer : le racketteur l'a frappé·e et a pris ${steal} € dans la caisse !`, 'warn'); K.sfx('punch');
    away(n, 'La prochaine fois, tu paies !');
  }
  K.v6Racket = (pid, pay) => {
    const n = npcs.racket; if (!n || !n.active || n.victim !== pid || n.state !== 'ask') return;
    if (pay) { if (!K.spend(pid, V.racket.ask, 'amende', 'Racket en ville')) return racketAttack(n, pid); away(n, 'Voilà, c\'est bien. À la prochaine !'); K.all(`🕶 ${name(pid)} a payé le racketteur (${V.racket.ask} €)…`, 'info'); }
    else racketAttack(n, pid);
  };

  /* ======================= Coups : clé, batte, jets ======================= */
  const WRENCH = ['squat1', 'squat2'];
  mod.npcHit = (n, by) => {
    const w = K.hitWith;
    if (WRENCH.includes(n.id)) {
      if (w !== 'grande_cle') { K.say(n, rng.pick(['Même pas mal.', 'Ha ! T\'as pas plus gros ?', 'Chatouilles !'])); K.note(by, '🔧 Ça ne les impressionne pas : il te faut la GRANDE CLÉ À MOLETTE (mur gauche de l\'atelier) !', 'warn'); return true; }
      K.ev({ e: 'nrag', id: n.id }); n.stun = 1.5; K.bonus(10, 'Squatteur chassé', by);
      later(1.2, () => away(n, rng.pick(['Aïe ! Ça va, on se casse !', 'OK OK, pas la clé !'])));
      if (!['squat1', 'squat2'].some(k => k !== n.id && npcs[k].active && npcs[k].state === 'squat')) K.all(`🔧 ${name(by)} a chassé les squatteurs à coups de grande clé !`, 'good');
      return true;
    }
    if (n.id === 'dennis') { K.say(n, rng.pick(['Raté ! Nananère !', 'Tu me touches même pas !', 'Hihihi !'])); K.note(by, '👦 Dennis est trop rapide pour les coups : LANCE-LUI un sac-poubelle (clic droit) !', 'warn'); return true; }
    if (n.id === 'racket') {
      if (w !== 'batte_bb') { K.say(n, 'Tu crois que tu me fais peur ?'); K.note(by, '🏏 Sans la BATTE DE BASEBALL (râtelier à l\'entrée de l\'atelier), aucune chance !', 'warn'); if (n.state === 'ask' && n.victim === by) racketAttack(n, by); return true; }
      K.ev({ e: 'nrag', id: n.id }); n.stun = 2; K.bonus(30, 'Butin du racketteur', by); K.sfx('punch');
      K.all(`🏏 ${name(by)} a mis une raclée au racketteur ! Il s'enfuit en lâchant 30 €.`, 'good'); later(1.5, () => away(n, 'Aïe aïe aïe ! Je me tire !')); return true;
    }
    if (n.id === 'flic') { K.fine(150, 'Outrage à agent', by); K.say(n, 'OUTRAGE À AGENT !', true); K.all(`🚔 ${name(by)} a frappé un policier : −150 € !`, 'warn'); return true; }
    // mauvais payeur : il paie au premier coup de batte
    const debt = S.debts.filter(d => d.npc === n.id);
    if (debt.length) {
      if (w !== 'batte_bb') { K.say(n, 'Revenez avec un argument plus… convaincant.'); K.note(by, '🏏 Pour récupérer l\'argent : la BATTE DE BASEBALL !', 'warn'); return true; }
      const amt = debt.reduce((a, d) => a + d.amt, 0); S.debts = S.debts.filter(d => d.npc !== n.id);
      K.ev({ e: 'nrag', id: n.id }); n.stun = 2; K.money(amt, 'ca', { pid: by, what: `Dette récupérée (${ML.PEOPLE[n.id].name})` });
      K.say(n, 'OK OK ! Voilà vos sous ! Pas la tête !', true); K.big(`🏏 +${amt} € récupérés !`, '#3ecf6e'); K.sfx('cash'); return true;
    }
    if (w === 'batte_bb' || w === 'grande_cle') { K.ev({ e: 'nrag', id: n.id }); n.stun = Math.max(n.stun, 1.6); }
    return false;
  };
  mod.itemHit = o => {
    K.hitWith = 'jet';
    const n = npcs.dennis;
    // distance au segment parcouru pendant ce pas (un objet rapide ne « saute » pas par-dessus Dennis)
    const seg = () => { const ax = o.x - o.vx * 0.06, az = o.z - o.vz * 0.06, dx = o.x - ax, dz = o.z - az, L2 = dx * dx + dz * dz || 1e-6, t = Math.max(0, Math.min(1, ((n.x - ax) * dx + (n.z - az) * dz) / L2)); return Math.hypot(ax + dx * t - n.x, az + dz * t - n.z); };
    if (n && n.active && n.state === 'roam' && o.y < 2.4 && seg() < 1.15) {
      K.ev({ e: 'nrag', id: 'dennis' }); n.stun = 1.4; n.state = 'flee';
      K.all(`🗑 ${name(o.thr)} a touché Dennis avec ${o.type === 'sac_poubelle' ? 'un sac-poubelle' : 'un objet'} : il s'enfuit en pleurnichant !`, 'good'); K.bonus(10, 'Dennis chassé', o.thr);
      later(1.2, () => away(n, 'OUIIIN ! Je vais le dire à ma mère !')); o.vx *= -0.2; o.vz *= -0.2; o.vy = 1.5; return true;
    }
    return false;
  };

  /* ======================= Livraisons : mauvais payeurs et black ======================= */
  mod.payMod = (pid, o, pay, n, comp) => {
    if (o.blk) { S.brep = Math.min(100, S.brep + V.black.rep); K.all(`🕶 Jean-Mi a pris la ${ML.on(o.id)} : ${pay} € en liquide, pas de facture. (réputation black ${S.brep})`, 'good'); return pay; }
    if (n && ML.CLIENTS.includes(comp) && !S.beginner && S.mode !== 'inspection' && rng() < V.payeur) {
      S.debts.push({ npc: n.id, comp, amt: pay, oid: o.id }); tip('payeur', pid);
      K.say(n, rng.pick(['Je vous paierai à la fin du mois… promis.', 'Le chèque est au courrier, je vous jure.', 'Ah zut, j\'ai pas ma carte. On voit ça plus tard ?']), true);
      K.big(`💸 ${COMP[comp].name} NE PAIE PAS !`, '#ff9f1a');
      K.all(`💸 ${COMP[comp].name} a gardé la ${ML.on(o.id)} sans payer (${pay} €) ! Retourne voir ${ML.PEOPLE[n.id].name} avec la BATTE DE BASEBALL pour récupérer l'argent.`, 'warn');
      return 0;
    }
    return pay;
  };

  /* ======================= Objets / lieux de l'atelier ======================= */
  mod.use = (pid, P, ps, sel, held, kind, a, b, m) => {
    switch (kind) {
      case 'planque': {
        if (held && held.d && held.d.blk) { S.hidden.push(K.strip ? K.strip(held) : { type: held.type, d: held.d }); P.inv[sel] = null; K.note(pid, `🫣 Caisse ${ML.on(held.d.oid)} planquée sous la bâche (${S.hidden.length}).`, 'good'); K.sfx('drop', ps.x, ps.z); Sim.dirty = true; return true; }
        if (!held && S.hidden.length) { const it = S.hidden.pop(); if (!K.give(pid, it, sel)) S.hidden.push(it); else K.note(pid, `📦 Tu ressors la caisse ${ML.on(it.d.oid)} de la planque.`, 'info'); Sim.dirty = true; return true; }
        K.note(pid, held ? 'La planque, c\'est pour les caisses AU BLACK (🕶).' : 'Rien sous la bâche.', 'info'); return true;
      }
      case 'distrib': if (K.spend(pid, V.snack, 'achat', 'Barre du distributeur') && K.give(pid, { type: 'barre', d: {} }, sel)) K.sfx('pickup', ps.x, ps.z); return true;
      case 'sieste': {
        if (P.nap) return true; if (S.raid) { K.note(pid, 'Pas de sieste pendant un contrôle de police !', 'warn'); return true; }
        P.nap = S.rt + V.sleep.napSec; K.ev({ e: 'nap', to: pid, d: V.sleep.napSec }); K.note(pid, '😴 Zzz… (ne bouge plus quelques secondes)', 'info');
        if (npcs.lebec.active && Math.hypot(npcs.lebec.x - ps.x, npcs.lebec.z - ps.z) < 14) K.say(npcs.lebec, rng.pick(['Une sieste ?! Bon… cinq minutes.', 'Ça dort pendant que les machines tournent…']));
        Sim.dirty = true; return true;
      }
      case 'poubelles': if (K.give(pid, { type: 'sac_poubelle', d: {} }, sel)) K.sfx('pickup', ps.x, ps.z); return true;
      case 'ring': return true;                                       // le combat se joue côté client (mini-jeu), résultat par l'intention « v6 »
    }
    return false;
  };
  mod.machineUse = (pid, P, sel, held, mid, M, m) => {
    if (!held && M.job && M.job.blk && !M.job.cam) { M.job.cam = true; K.note(pid, `🎭 ${mid} : faux programme affiché. La police n'y verra que du feu.`, 'good'); Sim.dirty = true; return true; }
    return false;
  };

  /* ======================= Intentions « v6 » ======================= */
  mod.act = (pid, P, ps, sel, held, m) => {
    if (m.a !== 'v6') return false;
    const op = String(m.op || ''), bet = Math.max(V.bet.min, Math.min(V.bet.max, Math.round(+m.bet || 0)));
    const at = k => { const L = ML.LOC.comp[k]; return L && near(ps, L.npc.x, L.npc.z, 8); };
    switch (op) {
      case 'hotdog': { const n = npcs.hotdog; if (!n || !n.active || !near(ps, n.x, n.z, 5)) return true; if (K.spend(pid, V.hotdog, 'achat', 'Hot-dog') && K.give(pid, { type: 'hotdog', d: {} }, sel)) { K.say(n, 'Un hot-dog moutarde, bon appétit chef !'); K.sfx('pickup', ps.x, ps.z); } return true; }
      case 'racket': K.v6Racket(pid, !!m.pay); return true;
      case 'baccept': {                                               // Jean-Mi : accepter une commande au black
        const n = npcs.jeanmi; if (!n || !near(ps, n.x, n.z, 7)) return true;
        const i = S.bprops.findIndex(p => p.id === +m.id); if (i < 0) return true;
        const p = S.bprops.splice(i, 1)[0], o = Object.assign({}, p, { t0: S.rt, dl: S.rt + p.dur, q: false, m: null, plan: null }); delete o.exp;
        S.orders.push(o); K.say(n, 'Pas de facture, pas de souci. Tu me la ramènes ICI, discrètement.'); K.note(pid, `🕶 Commande au black ${ML.on(o.id)} acceptée (${o.price} €). Livre-la à Jean-Mi, derrière l'atelier. Attention aux flics !`, 'good');
        Sim.dirty = true; return true;
      }
      case 'horse': {                                                 // PMU : 4 chevaux, cotes différentes
        if (!at('pmu')) return true; const h = Math.max(0, Math.min(3, m.h | 0)), odds = [2, 3, 5, 9];
        if (!K.spend(pid, bet, 'flambe', `Pari PMU (${bet} €)`)) return true;
        const w = rngWeighted([0.42, 0.3, 0.18, 0.1]), gain = w === h ? bet * odds[h] : 0;
        if (gain) K.money(gain, 'bonus', { pid, what: `Gain au PMU (cheval ${h + 1})` });
        K.ev({ e: 'horse', to: pid, h, w, gain, bet, seed: Math.floor(rng() * 1e6) }); return true;
      }
      case 'bj': return blackjack(pid, m, bet, at('casino'));
      case 'pawn': {
        if (!at('gages')) return true; const k = String(m.k || ''), pr = V.pawn[k]; if (!pr) return true;
        if (K.spend(pid, pr, 'flambe', `${ML.Items.TYPES[k].name} (prêteur sur gages)`) && K.give(pid, { type: k, d: {} }, sel)) { K.say(npcs.preteur, rng.pick(['Excellent choix. Totalement inutile.', 'Une affaire en or !', 'Pas de reprise, pas d\'échange.'])); K.sfx('cash'); }
        return true;
      }
      case 'club': {
        if (!at('boite')) return true; const act = String(m.act || '');
        if (act === 'drink') { if (K.spend(pid, V.club.drink, 'flambe', 'Verre au Copeau')) { P.drunk = S.rt + 45; K.ev({ e: 'drunk', to: pid, d: 45 }); K.say(npcs.barman, 'Et un « Lubrifiant de coupe », un !'); } }
        if (act === 'round') { if (K.spend(pid, V.club.round, 'flambe', 'Tournée générale au Copeau')) { K.all(`🍹 ${name(pid)} a payé une tournée générale au Copeau avec l'argent de la caisse !`, 'info'); lebecSay('Il paie des tournées avec MA caisse ?!'); } }
        Sim.dirty = true; return true;
      }
      case 'fight': {                                                 // combats : parier ou monter sur le ring (score du mini-jeu 0..1)
        if (!at('arene')) return true; const act = String(m.act || '');
        if (act === 'bet') { const f = m.f ? 1 : 0; if (!K.spend(pid, bet, 'flambe', `Pari au Hangar 13 (${bet} €)`)) return true; const w = rng() < 0.5 ? 0 : 1, gain = w === f ? bet * 2 : 0; if (gain) K.money(gain, 'bonus', { pid, what: 'Pari gagné au Hangar 13' }); K.ev({ e: 'fight', to: pid, w, f, gain, bet }); return true; }
        if (act === 'self') {
          const sc = Math.max(0, Math.min(1, +m.score || 0)), win = rng() < 0.15 + sc * 0.75, entry = 50;
          if (!K.spend(pid, entry, 'flambe', 'Inscription au combat')) return true;
          if (win) { const g = entry * V.fight.prize + 50; K.money(g, 'bonus', { pid, what: 'Combat clandestin gagné' }); K.big(`🥊 ${P.name} GAGNE LE COMBAT ! +${g} €`, '#3ecf6e'); K.all(`🥊 ${P.name} a gagné un combat clandestin au Hangar 13 (+${g} €) !`, 'good'); }
          else { K.damage(pid, V.fight.dmg, 'combat'); K.big(`🥊 ${P.name} EST K.O. !`, '#ff3b30'); K.ev({ e: 'push', to: pid, vx: 0, vz: 6 }); }
          K.ev({ e: 'fight', to: pid, self: 1, win: win ? 1 : 0 }); return true;
        }
        return true;
      }
      case 'adm': return admin(pid, m);
    }
    return true;
  };
  function rngWeighted(w) { let r = rng() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; } return w.length - 1; }

  /* ---------- Blackjack (l'hôte tient le sabot) ---------- */
  const card = () => Math.min(10, 1 + Math.floor(rng() * 13));
  const total = h => { let t = h.reduce((a, b) => a + b, 0); if (h.includes(1) && t + 10 <= 21) t += 10; return t; };
  function blackjack(pid, m, bet, here) {
    const act = String(m.act || ''); let g = X.bj[pid];
    if (act === 'start') {
      if (!here || (g && !g.done)) return true;
      if (!K.spend(pid, bet, 'flambe', `Mise au blackjack (${bet} €)`)) return true;
      g = X.bj[pid] = { bet, p: [card(), card()], d: [card(), card()], done: false };
      if (total(g.p) === 21) return bjEnd(pid, g, 'bj');
    } else if (g && !g.done && act === 'hit') { g.p.push(card()); if (total(g.p) > 21) return bjEnd(pid, g, 'bust'); }
    else if (g && !g.done && act === 'stand') { while (total(g.d) < 17) g.d.push(card()); const a = total(g.p), b = total(g.d); return bjEnd(pid, g, b > 21 || a > b ? 'win' : a === b ? 'push' : 'lose'); }
    if (g) K.ev({ e: 'bj', to: pid, p: g.p, d: [g.d[0]], st: 'play', bet: g.bet });
    return true;
  }
  function bjEnd(pid, g, res) {
    g.done = true; const gain = res === 'bj' ? Math.round(g.bet * 2.5) : res === 'win' ? g.bet * 2 : res === 'push' ? g.bet : 0;
    if (gain) K.money(gain, 'bonus', { pid, what: `Blackjack (${res === 'push' ? 'égalité' : 'gagné'})` });
    K.ev({ e: 'bj', to: pid, p: g.p, d: g.d, st: res, bet: g.bet, gain }); return true;
  }

  /* ---------- Boîte de nuit : la scène est interdite (videurs) ---------- */
  function clubStep() {
    const Z = ML.LOC.stage; if (!Z) return;
    for (const pid in S.pl) {
      const p = K.pose[pid], P = S.pl[pid]; if (!p || !K.foot(P) || (P.kick || 0) > S.rt) continue;
      if (p.x > Z.minX && p.x < Z.maxX && p.z > Z.minZ && p.z < Z.maxZ) {
        P.kick = S.rt + 6; const steal = Math.min(200, Math.round(Math.max(0, S.money) * V.club.steal));
        K.damage(pid, V.club.knock, 'videurs'); if (steal) K.fine(steal, 'Portefeuille « égaré » au Copeau', pid);
        K.ev({ e: 'faint', to: pid, d: 4 }); K.ev({ e: 'warp', to: pid, x: Z.door.x, z: Z.door.z });
        K.all(`🚪 ${P.name} est monté·e sur la scène du Copeau : les videurs l'ont assommé·e et jeté·e dehors${steal ? ` (portefeuille allégé de ${steal} €)` : ''} !`, 'warn'); K.sfx('punch');
      }
    }
  }

  /* ======================= Mode admin (tests) ======================= */
  K.v6Admin = pid => { X.adm = pid; S.admin = { pid, inf: false }; Sim.dirty = true; K.note(pid, '🛠 Mode admin activé (F9).', 'good'); };
  function admin(pid, m) {
    if (!X.adm || X.adm !== pid) return true;
    const k = String(m.k || '');
    switch (String(m.what || '')) {
      case 'inf': S.admin.inf = !S.admin.inf; if (S.admin.inf) S.money = Math.max(S.money, 999999); K.note(pid, S.admin.inf ? '💰 Argent illimité ON' : '💰 Argent illimité OFF', 'info'); break;
      case 'money': K.money(+m.n || 1000, 'bonus', { pid, what: 'Admin' }); break;
      case 'order': if (k === 'black') genBlack(); else if (k === 'big') K.genOrder('plain', 'l'); else K.genOrder(['plain', 'fonderie', 'chaudro', 'tth'].includes(k) ? k : 'plain'); break;
      case 'event':
        if (k === 'squat') squatStart(); else if (k === 'dennis') dennisStart(); else if (k === 'raid') raidStart();
        else if (k === 'racket') { X.racketT = 0; const L = Object.keys(S.pl).filter(p => K.pose[p] && Math.hypot(K.pose[p].x, K.pose[p].z) > V.racket.dist); if (!L.length) K.note(pid, 'Le racketteur n\'arrive qu\'en ville, loin de l\'atelier (à pied) : vas-y !', 'info'); }
        else if (k === 'quest') K.questT = 0; else if (k === 'faim') { const P = S.pl[pid]; P.food = 2; P.sleep = 30; }
        else if (k === 'payeur') X.forcePay = true;
        else if (K.sched) { K.sched.unshift({ k, t: S.rt }); }
        K.note(pid, `🛠 Événement lancé : ${k}`, 'info'); break;
      case 'time': S.rt = Math.min(C.SHIFT_SEC - 5, S.rt + (+m.n || 60)); break;
      case 'end': S.rt = C.SHIFT_SEC; break;
      case 'heal': { const P = S.pl[pid]; P.hp = C.HP.max; P.ko = false; P.food = 100; P.sleep = 100; break; }
      case 'brep': S.brep = Math.max(0, Math.min(100, S.brep + (+m.n || 20))); break;
      case 'give': if (ML.Items.TYPES[k]) K.give(pid, { type: k, d: {} }); break;
    }
    Sim.dirty = true; return true;
  }

  /* ======================= Boucle ======================= */
  mod.step = dt => {
    for (const t of timers.slice()) if (S.rt >= t.t) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    if (S.admin && S.admin.inf && S.money < 500000) S.money = 999999;
    needs(dt); blackStep(dt); squatStep(); dennisStep(); racketStep(dt); clubStep();
    for (const k of ['squat1', 'squat2', 'dennis']) { const n = npcs[k]; if (n && n.active && n.state === 'flee' && !(n.path && n.path.length)) away(n); }
  };
  // les événements « V6 » passent par le même planning que les autres (sim_events.js)
  const prevStart = K.evStart;
  K.evStart = k => { if (k === 'squat') squatStart(); else if (k === 'dennis') dennisStart(); else if (prevStart) prevStart(k); };
  mod.fast = f => { f.brep = S.brep; };
  Sim.mods.push(mod);
})();
