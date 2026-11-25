/* =====================================================================
   sim.js — SIMULATION DE L'HÔTE (cœur). Seul l'hôte l'exécute.
   Il décide de tout ce qui est commun et diffuse l'état. Les modules
   sim_roles.js, sim_chaos.js, sim_city.js, sim_events.js et sim_eco.js se
   branchent sur ce cœur via Sim.mods (init / step / use / act / fast) et
   partagent l'outillage K.
   V4 : tout se compte en EUROS (S.money). L'entreprise (machines possédées,
   personnel, véhicules, stock, réputation) arrive dans cfg.game.E.
   ===================================================================== */
(function () {
  const Sim = ML.Sim = { mods: [] };
  const K = Sim.K = {};                       // outillage partagé entre modules
  const U = ML.U, C = ML.CFG, IT = ML.Items, COMP = ML.COMPANIES;
  let S, npcs, ev, pose, rng;
  const stage = o => o.steps[o.si];
  K.stage = stage;

  /* ======================= Initialisation ======================= */
  Sim.init = cfg => {
    rng = K.rng = U.rng(cfg.seed);
    const g = cfg.game || {}, E = g.E || ML.Company.fresh('', g.mode === 'course' ? 0 : ML.ECO.freeMoney), up = Object.assign({}, E.up);
    const humeurs = Object.keys(ML.HUMEURS), wr = rng();
    const weather = wr < ML.WEATHER.beau.p ? 'beau' : wr < ML.WEATHER.beau.p + ML.WEATHER.pluie.p ? 'pluie' : 'brouillard';
    S = Sim.S = K.S = {
      rt: 0, mode: g.mode || 'coop', day: g.day || 1, score: 0, sat: 70, served: 0, failed: 0, over: false, n: cfg.players.length,
      stock: {}, orders: [], machines: {}, pl: {}, cars: [], items: [], subs: { fonderie: [], chaudro: [], tth: [] },
      finds: { got: 0, total: 0, log: [] }, buffs: {}, anger: C.LEBEC.base, chase: null,
      humeur: g.humeur || (g.mode === 'inspection' ? 'normal' : rng.pick(humeurs)), weather, power: true,
      chips: [], fires: [], puddles: [], evs: {}, rule: null, viol: 0, appNames: {}, up,
      nextOid: 1, nextItem: 1, nextOrder: C.ORDER.firstAt, nOrders: 0, nextId: 1,
      // --- économie V4 ---
      money: Math.round(E.money), rep: E.rep, rep0: E.rep, staff: E.staff.slice(), ai: Object.assign({}, E.ai), owned: E.veh.slice(),
      props: [], deliv: [], parts: [], today: { ca: 0, achat: 0, invest: 0, amende: 0, bonus: 0, salaires: 0 }, nParts: 0,
      campaign: !!g.campaign, co: { name: E.name || '', code: E.code || null, day: E.day || 1, won: !!E.won, insp: E.insp || null, mach: E.mach.length, rep: E.rep }
    };
    K.H = ML.HUMEURS[S.humeur]; S.diff = ML.DIFFS[g.diff] ? g.diff : 'normal';
    // stock : celui de l'entreprise
    for (const k in C.START_STOCK) S.stock[k] = Math.max(0, Math.round(E.stock[k] !== undefined ? E.stock[k] : C.START_STOCK[k]));
    // machines possédées (les opérateurs sont répartis par K.assignOps)
    for (const m of ML.MACHINES) if (E.mach.includes(m.id)) S.machines[m.id] = { status: 'idle', job: null, op: null, wear: Math.floor(rng() * 40), broken: false, plan: null };
    for (const id of ML.APP_IDS) S.appNames[id] = ML.PEOPLE[id].name;
    // niveau de l'atelier (0 → 1) : la difficulté monte avec les machines, la réputation et les jours
    const nM = Object.keys(S.machines).length;
    K.lvl = S.lvl = g.campaign ? U.clamp((nM - 2) / 4 * 0.55 + U.clamp((S.rep - 40) / 50, 0, 1) * 0.25 + U.clamp((S.day - 1) / 9, 0, 1) * 0.2, 0, 1) : 0.35;
    const D0 = ML.DIFFS[S.diff], lv = K.lvl, pi = K.pi = Math.min(4, Math.max(1, cfg.players.length)) - 1;
    // V4.1 : moins de chaos et d'événements quand on est peu nombreux
    K.D = Object.assign({}, D0, { chaos: D0.chaos * (0.45 + 0.85 * lv) * ML.ECO.playerChaos[pi], events: [Math.max(0, Math.round(D0.events[0] * (0.4 + 0.8 * lv)) - (pi ? 0 : 1)), Math.max(1, Math.round(D0.events[1] * (0.5 + 0.7 * lv)) - (pi ? 0 : 1))] });
    S.anger = C.LEBEC.base + K.D.base;
    const roles = (g.roles || {});
    for (const p of cfg.players) S.pl[p.id] = { name: p.name, idx: p.idx, inv: [null, null, null], car: null, ride: null, stun: 0, coffee: 0, hp: C.HP.max, ko: false, role: ML.ROLES[roles[p.id]] ? roles[p.id] : 'poly' };
    ev = []; pose = K.pose = {}; Sim.dirty = true; K.priv = {};
    // PNJ
    npcs = Sim.npcs = K.npcs = {};
    for (const id in ML.PEOPLE) {
      const P = ML.PEOPLE[id];
      const n = { id, x: 0, z: 0, yaw: 0, path: [], onArrive: null, state: 'idle', speed: 1.7, run: false, stun: 0, tmp: '', tmpT: 0, mem: {}, hunger: 15, active: true };
      if (P.op) {
        n.active = S.staff.includes(id); n.state = 'work'; n.mids = [];
      } else if (id === 'lebec') Object.assign(n, { x: 12, z: -5.5, state: 'patrol', speed: 1.6 });
      else if (P.visitor) Object.assign(n, { active: false, state: 'away' });
      else { const comp = K.compOf(id), L = comp && ML.LOC.comp[comp]; if (!L) { n.active = false; npcs[id] = n; continue; } Object.assign(n, { x: L.npc.x, z: L.npc.z, yaw: L.npc.yaw, state: 'shop', home: L.npc, comp }); }
      npcs[id] = n;
    }
    K.assignOps(true);
    if (up.frigo) npcs.matis.hunger = -999;
    // trouvailles
    const kinds = shuffle(Object.keys(ML.FINDS)).slice(0, 6), spots = shuffle(ML.LOC.hides).slice(0, kinds.length);
    spots.forEach((h, i) => K.spawnItem({ type: 'find', d: { k: kinds[i] } }, h.x, 0, h.z));
    S.finds.total = spots.length;
    // équipements sur leurs crochets
    for (const h of ML.LOC.hooks) K.spawnItem({ type: h.type, d: {} }, h.x, h.y, h.z);
    for (const m of Sim.mods) if (m.init) m.init(cfg);
    if (S.humeur === 'bonne_humeur') S.buffs.matis = 120;
  };
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  K.shuffle = shuffle;
  K.compOf = npc => { for (const k in COMP) if (COMP[k].npc === npc) return k; return null; };

  /** Répartit les machines entre les opérateurs embauchés (un opérateur peut jongler entre plusieurs machines) */
  K.assignOps = place => {
    const mids = ML.MACHINE_ORDER.filter(id => S.machines[id]);
    const ops = S.staff.filter(id => ML.PEOPLE[id] && ML.PEOPLE[id].op && npcs[id]);
    for (const id of mids) S.machines[id].op = null;
    for (const id of ops) npcs[id].mids = [];
    if (ops.length) mids.forEach((mid, i) => { const op = ops[i % ops.length]; S.machines[mid].op = op; npcs[op].mids.push(mid); });
    for (const id of ops) {
      const n = npcs[id];
      if (!n.mids.length) { n.mid = null; const c = ML.LOC.coffee[ops.indexOf(id) % ML.LOC.coffee.length]; n.home = { x: c.x, z: c.z, yaw: 0 }; }
      else if (!n.mid || !n.mids.includes(n.mid)) { n.mid = n.mids[0]; n.home = ML.World.machines[n.mid].station; }
      if (place) { Object.assign(n, { x: n.home.x, z: n.home.z, yaw: n.home.yaw || 0 }); }
    }
    Sim.dirty = true;
  };

  /* ======================= Argent & réputation ======================= */
  K.money = (d, cat) => { d = Math.round(d); S.money += d; if (cat) S.today[cat] = (S.today[cat] || 0) + Math.abs(d); Sim.dirty = true; };
  K.spend = (pid, amt, cat, what) => {
    amt = Math.round(amt);
    if (S.money < amt) { if (pid) note(pid, `💸 Pas assez d'argent${what ? ' pour ' + what : ''} : il faut ${amt} €, la caisse en a ${S.money} €.`, 'warn'); return false; }
    K.money(-amt, cat || 'achat'); return true;
  };
  K.fine = (amt, why) => { K.money(-amt, 'amende'); return `−${amt} €`; };
  K.bonus = amt => { K.money(amt, 'bonus'); return `+${amt} €`; };
  K.repAdd = d => { S.rep = U.clamp(Math.round(S.rep + d), 0, 100); Sim.dirty = true; };
  K.eur = n => `${Math.round(n).toLocaleString('fr-FR')} €`;

  /* ======================= Événements vers les clients ======================= */
  K.note = (to, s, ty) => ev.push({ e: 'n', to, s, ty });
  K.all = (s, ty) => ev.push({ e: 'n', s, ty });
  K.sfx = (s, x, z) => ev.push({ e: 'sfx', s, x, z });
  K.big = (s, c, to) => ev.push({ e: 'big', s, c, to });
  K.ev = o => ev.push(o);
  K.stat = (to, k, n) => ev.push({ e: 'stat', to, k, n: n || 1 });
  K.say = (n, s, speak) => { n.tmp = s; n.tmpT = 4; ev.push({ e: 'say', n: n.id, s, sp: speak ? 1 : 0 }); };
  Sim.drain = () => { const e = ev; ev = []; return e; };
  const { note, all, sfx, big, say } = K;

  /* ======================= Objets ======================= */
  K.spawnItem = (it, x, y, z, v) => {
    const o = { id: S.nextItem++, type: it.type, d: it.d || {}, x, y: y || 0, z, ry: rng() * 6, vx: 0, vy: 0, vz: 0, rest: !v, thr: null };
    if (v) { o.vx = v[0]; o.vy = v[1]; o.vz = v[2]; }
    S.items.push(o); Sim.dirty = true; return o;
  };
  K.strip = o => ({ type: o.type, d: o.d });
  K.removeItem = o => { const i = S.items.indexOf(o); if (i >= 0) S.items.splice(i, 1); Sim.dirty = true; };
  K.foot = P => P.car === null && P.ride == null;
  K.isPart = it => !!it && (it.type === 'caisse' || it.type === 'piece');
  K.canTake = (P, it) => { if (P.ko || IT.heavy(it)) return false; if (IT.bulky(it) && P.inv.some(x => x && IT.bulky(x))) return false; return P.inv.some(x => !x); };
  K.give = (pid, it, sel) => {
    const P = S.pl[pid];
    if (P.ko) { note(pid, '🤕 Tu es KO : tu ne peux rien porter. Attends le médecin !', 'warn'); return false; }
    if (IT.heavy(it)) { note(pid, '🏋 Beaucoup trop lourd ! Le CARISTE doit venir avec le fenwick.', 'warn'); return false; }
    if (IT.bulky(it) && P.inv.some(x => x && IT.bulky(x))) { note(pid, 'Une seule caisse à la fois (deux mains) !', 'warn'); return false; }
    const i = sel !== undefined && !P.inv[sel] ? sel : P.inv.findIndex(x => !x);
    if (i < 0) { note(pid, 'Inventaire plein (3 places). Pose quelque chose (G).', 'warn'); return false; }
    P.inv[i] = it; Sim.dirty = true; return true;
  };
  /** Range dans le stock tous les produits de ce type que le joueur a en main */
  K.store = (P, type, key) => { let n = 0; P.inv.forEach((it, i) => { if (it && it.type === type) { P.inv[i] = null; n++; } }); if (n) { S.stock[key] += n; Sim.dirty = true; } return n; };
  /** Ouvre un colis : tout ce qu'il contient tombe par terre autour */
  K.openColis = (c, x, z) => {
    let n = 0;
    for (const k in c) for (let i = 0; i < c[k]; i++, n++) {
      const a = rng() * 6.283, r = 0.3 + rng() * 1.1;
      K.spawnItem({ type: ML.MATERIALS[k] ? 'brut_' + k : k, d: {} }, x + Math.cos(a) * 0.2, 0.9, z + Math.sin(a) * 0.2, [Math.cos(a) * r * 2.2, 2.5 + rng() * 2, Math.sin(a) * r * 2.2]);
    }
    return n;
  };
  K.dropAll = (pid, impulse) => {
    const P = S.pl[pid], p = pose[pid] || { x: 0, z: 0 };
    P.inv.forEach((it, i) => { if (it) { K.spawnItem(it, p.x + (rng() - 0.5), 0.9, p.z + (rng() - 0.5), [(rng() - 0.5) * impulse, 2 + rng() * 2, (rng() - 0.5) * impulse]); P.inv[i] = null; } });
  };
  K.dropHeld = (pid, sel, v) => {
    const P = S.pl[pid], p = pose[pid] || { x: 0, z: 0 }; const it = P.inv[sel]; if (!it) return;
    P.inv[sel] = null; K.spawnItem(it, p.x, 0.9, p.z, v || [rng() - 0.5, 2, rng() - 0.5]);
  };
  K.purgeOrder = oid => {
    S.items = S.items.filter(o => !(o.d && o.d.oid === oid));
    for (const pid in S.pl) S.pl[pid].inv = S.pl[pid].inv.map(x => (x && x.d && x.d.oid === oid ? null : x));
    for (const c of S.cars) c.bed = c.bed.filter(x => !(x.d && x.d.oid === oid));
  };
  K.expeditionSpot = () => {
    const E = ML.LOC.expedition;
    for (let z = E.minZ + 0.5; z < E.maxZ; z += 0.95) for (let x = E.minX + 0.5; x < E.maxX; x += 0.95)
      if (!S.items.some(o => Math.hypot(o.x - x, o.z - z) < 0.6)) return [x, z];
    return [(E.minX + E.maxX) / 2, (E.minZ + E.maxZ) / 2];
  };
  K.bigSpot = () => {
    const Z = ML.LOC.bigZone, z = (Z.minZ + Z.maxZ) / 2;
    for (let x = Z.minX + 1; x < Z.maxX; x += 2) if (!S.items.some(o => Math.hypot(o.x - x, o.z - z) < 1.6)) return [x, z];
    return [(Z.minX + Z.maxX) / 2, Z.maxZ + 2];
  };
  K.dockSpot = comp => {
    const L = ML.LOC.comp[comp];
    for (let i = 0; i < 12; i++) {
      const a = -4.5 + (i % 6) * 1.1, b = i < 6 ? 0 : -1.1;
      const x = L.dock.x + L.tan.x * a + L.dir.x * b, z = L.dock.z + L.tan.z * a + L.dir.z * b;
      if (!S.items.some(o => Math.hypot(o.x - x, o.z - z) < 0.6)) return [x, z];
    }
    return [L.dock.x, L.dock.z];
  };

  /* ======================= Tickets ======================= */
  K.clients = () => ML.CLIENTS.filter(c => ML.LOC.comp[c] && (!S.campaign || !COMP[c].unlockRep || S.rep >= COMP[c].unlockRep));
  K.maxActive = () => Math.min(8, Object.keys(S.machines).length + Math.max(1, S.n));
  /** Prix d'une commande (avant le bonus de délai) */
  K.orderPrice = (steps, size, far, mult) => {
    const E2 = ML.ECO.order, pi = Math.min(4, Math.max(1, S.n)) - 1;
    const base = (E2.base + E2.perStep * (steps.length - 2) + (far ? E2.far : 0)) * ML.ECO.size[size || 'm'] * (0.85 + 0.3 * S.rep / 100) * (mult || 1) * ML.ECO.playerPay[pi];
    return Math.round(K.points(base) / 5) * 5;
  };
  /** Nouvelle DEMANDE client : elle arrive au PC, il faut l'accepter (ou l'ERP+ le fait) */
  function genOrder() {
    S.nOrders++;
    const types = new Set(Object.keys(S.machines).map(id => ML.MACHINES.find(m => m.id === id).type));
    const lv = K.lvl, kinds = ['plain', 'plain', 'plain'];
    if (lv >= 0.12 || S.day >= 2) kinds.push('tth');
    if (lv >= 0.28 || S.day >= 3) kinds.push('fonderie', 'chaudro');
    const kind = S.nOrders <= 2 ? 'plain' : rng.pick(kinds);
    const list = ML.PARTS[kind].filter(x => types.has(x[2])); if (!list.length) return;
    const [part, mat, mtype, tool] = rng.pick(list);
    const steps = kind === 'plain' ? ['usinage', 'livraison'] : kind === 'tth' ? ['usinage', 'tth', 'livraison'] : [kind, 'usinage', 'livraison'];
    const cls = K.clients(); if (!cls.length) return;
    const client = rng.pick(cls), cl = ML.LOC.comp[client], far = Math.hypot(cl.x, cl.z) > 200;
    const big = S.owned.includes('fenwick') && S.owned.includes('camion');
    const sr = rng(); let size = kind === 'plain' ? (sr < 0.3 ? 's' : sr < 0.78 ? 'm' : 'l') : kind === 'chaudro' ? (sr < 0.5 ? 'm' : 'l') : kind === 'tth' ? (sr < 0.5 ? 's' : 'm') : 'm';
    if (size === 'l' && !big) size = 'm';
    const dur = (C.ORDER.base + C.ORDER.perStep * (steps.length - 2) + (far ? C.ORDER.far : 0)) * (K.H.dur || 1) * K.D.dur * (1.25 - 0.35 * lv) * (size === 'l' ? 1.3 : 1) * ML.ECO.playerTime[Math.min(4, Math.max(1, S.n)) - 1];
    const p = { id: S.nextOid++, client, part, mat, mtype, tool, steps, si: 0, size, src: kind === 'fonderie' || kind === 'chaudro' ? kind : null, dur, price: K.orderPrice(steps, size, far), exp: S.rt + ML.ECO.propLife };
    S.props.push(p); Sim.dirty = true;
    if (S.up.erp_auto && S.orders.length < K.maxActive()) { K.accept(p.id, null, true); return; }
    all(`📥 Nouvelle demande au PC : ${COMP[client].name} — ${part}${size === 'l' ? ' (GROSSE pièce)' : size === 's' ? ' (petite)' : ''} · ${K.eur(p.price)}`, 'info'); sfx('order');
  }
  K.genOrder = genOrder;
  /** Accepter une demande : elle devient une commande (ticket) avec son délai */
  K.accept = (id, pid, auto) => {
    const i = S.props.findIndex(p => p.id === id); if (i < 0) return null;
    const p = S.props.splice(i, 1)[0];
    const o = Object.assign({}, p, { t0: S.rt, dl: S.rt + p.dur, q: false, m: null, plan: null }); delete o.exp;
    S.orders.push(o); Sim.dirty = true;
    const who = pid && S.pl[pid] ? ` (${S.pl[pid].name})` : auto ? ' (ERP+)' : '';
    all(`📋 Commande #${o.id} acceptée${who} — ${COMP[o.client].name} : ${o.part}${o.size === 'l' ? ' (GROSSE pièce : fenwick + camion)' : o.size === 's' ? ' (petite)' : ''} · ${K.eur(o.price)}`, 'info'); sfx('order');
    return o;
  };
  K.failOrder = (o, why) => {
    const i = S.orders.indexOf(o); if (i < 0) return;
    S.orders.splice(i, 1);
    for (const id in S.machines) if (S.machines[id].job && S.machines[id].job.oid === o.id) S.machines[id].job = null;
    for (const k in S.subs) S.subs[k] = S.subs[k].filter(j => j.oid !== o.id);
    S.deliv = S.deliv.filter(d => d.oid !== o.id);
    K.purgeOrder(o.id);
    S.failed++; S.sat = Math.max(0, S.sat - 8); K.repAdd(-(o.client === 'part' ? ML.ECO.rep.partFail : ML.ECO.rep.fail));
    all(`⏰ Commande #${o.id} (${COMP[o.client].name}) RATÉE : ${why || 'trop tard !'} (réputation −${o.client === 'part' ? ML.ECO.rep.partFail : ML.ECO.rep.fail})`, 'warn'); sfx('fail'); Sim.dirty = true;
    if (K.priv.traitor) K.priv.fails = (K.priv.fails || 0) + 1;
    for (const m of Sim.mods) if (m.onFail) m.onFail(o);
  };
  function updateOrders(dt) {
    if (S.mode === 'course') return;
    const n = Math.max(1, S.n);
    S.nextOrder -= dt;
    if (S.nextOrder <= 0 && S.rt < C.SHIFT_SEC - 60) {
      if (S.props.length < 3 && S.orders.length + S.props.length < K.maxActive() + 2) genOrder();
      S.nextOrder = C.ORDER.interval / (1 + 0.25 * (n - 1)) * (0.8 + rng() * 0.4) * (1.45 - 0.65 * K.lvl) * K.D.interval;
    }
    for (const p of S.props.slice()) if (S.rt > p.exp) {
      S.props.splice(S.props.indexOf(p), 1); K.repAdd(-ML.ECO.rep.expire); Sim.dirty = true;
      all(`📭 Demande de ${COMP[p.client].name} (${p.part}) expirée : personne ne l'a acceptée au PC (réputation −${ML.ECO.rep.expire}).`, 'warn');
    }
    for (const o of S.orders.slice()) if (S.rt > o.dl) K.failOrder(o);
    // machine prévue au PC : affichée sur la machine
    for (const id in S.machines) { const M = S.machines[id], pl = S.orders.find(o => o.plan === id && !o.m && stage(o) === 'usinage'); const v = pl ? pl.id : null; if (M.plan !== v) { M.plan = v; Sim.dirty = true; } }
  }
  K.points = p => Math.round(p * (K.H.points || 1) * K.D.points);
  function deliver(pid, P, sel, held, comp, n) { return K.deliver(pid, P, sel, held, comp, n); }
  K.deliver = (pid, P, sel, held, comp, n) => {
    const o = S.orders.find(x => x.id === held.d.oid);
    if (comp === 'usiflash') {                     // livrer chez le concurrent = sabotage (mode traître)
      P.inv[sel] = null; say(n, 'Merci... on ne s\'est jamais vus.');
      if (o) K.failOrder(o, 'livrée chez UsiFlash !');
      if (K.priv.traitor === pid) K.priv.usi = (K.priv.usi || 0) + 1;
      return;
    }
    if (!o) { if (P) P.inv[sel] = null; if (pid) note(pid, 'Commande annulée (trop tard) : caisse jetée.', 'warn'); return; }
    if (o.client !== comp || (comp === 'part' && o.who !== n.id)) return say(n, comp === 'part' ? "Ce n'est pas ma pièce, ça !" : `Ce n'est pas pour nous ! C'est pour ${COMP[o.client].name}.`);
    if (stage(o) === 'tth') return say(n, "Elle doit d'abord passer au traitement thermique (TTH Ouest) !");
    if (stage(o) !== 'livraison') return say(n, "Elle n'est pas prête.");
    if (P) P.inv[sel] = null; Sim.dirty = true;
    if (held.d.nc) {
      o.si = o.steps.indexOf(o.src || 'usinage'); o.q = false; S.sat = Math.max(0, S.sat - 6);
      say(n, 'NON CONFORME ! Je refuse. Refaites-la !', true);
      all(`❌ Caisse #${o.id} refusée : non conforme. Contrôlez au marbre avant de livrer !`, 'warn'); sfx('fail');
      return;
    }
    S.orders.splice(S.orders.indexOf(o), 1);
    const frac = Math.max(0, (o.dl - S.rt) / o.dur);
    const pay = Math.round(((o.price || 100) * (0.75 + 0.35 * frac) + (held.d.ctl ? ML.ECO.order.ctl : 0)) * (held.d.npc || 1));
    K.money(pay, 'ca'); S.served++; S.sat = Math.min(100, S.sat + (S.up.plantes ? 7 : 5));
    K.repAdd(comp === 'part' ? ML.ECO.rep.part : frac > 0.25 ? ML.ECO.rep.ok : ML.ECO.rep.late);
    if (n) say(n, U.pick(ML.LINES[n.id] || ['Merci !']));
    big(`+${K.eur(pay)} · #${o.id} livrée à ${comp === 'part' ? ML.PEOPLE[o.who].name : COMP[comp].name} !`, '#3ecf6e'); sfx('cash');
    for (const m of Sim.mods) if (m.onDeliver) m.onDeliver(pid, o);
  };

  /* ======================= Intentions ======================= */
  Sim.setPose = (pid, p) => {
    pose[pid] = Object.assign(pose[pid] || {}, p);
    const P = S && S.pl[pid];
    if (P && p.car && S.cars[p.car.i] && S.cars[p.car.i].dr === pid) {
      const c = S.cars[p.car.i]; c.x = p.car.x; c.z = p.car.z; c.h = p.car.h; c.s = p.car.s;
      if (isFinite(p.car.f)) c.fuel = U.clamp(p.car.f, 0, 100);
    }
  };
  K.near = (ps, x, z, r) => Math.hypot(ps.x - x, ps.z - z) < (r || C.REACH);
  const near = K.near;

  Sim.act = (pid, m) => {
    if (Array.isArray(m.p) && m.p.every(v => isFinite(v)) && pose[pid]) Object.assign(pose[pid], { x: +m.p[0], y: +m.p[1], z: +m.p[2], yaw: +m.p[3] });
    const P = S.pl[pid], ps = pose[pid];
    if (!P || !ps) return;
    if (S.over || (S.voting && m.a !== 'vote')) return;
    if (P.stun > S.rt && !['exit', 'vote', 'emote'].includes(m.a)) return;
    if (P.ko && !['exit', 'vote', 'emote', 'ping'].includes(m.a)) return;
    const sel = U.clamp(m.sel | 0, 0, 2), held = P.inv[sel];
    Sim.dirty = true;
    for (const mod of Sim.mods) if (mod.act && mod.act(pid, P, ps, sel, held, m)) return;
    switch (m.a) {
      case 'use': use(pid, P, ps, sel, held, String(m.id || ''), m); break;
      case 'drop': if (held) { P.inv[sel] = null; K.spawnItem(held, ps.x - Math.sin(ps.yaw) * 0.8, 0.8, ps.z - Math.cos(ps.yaw) * 0.8, [0, 0, 0]); sfx('drop', ps.x, ps.z); } break;
      case 'throw': if (held && !IT.heavy(held) && Array.isArray(m.v)) {
        P.inv[sel] = null; const v = m.v.map(x => U.clamp(+x || 0, -20, 20) * (IT.bulky(held) ? 0.55 : 1));
        const o = K.spawnItem(held, ps.x, (ps.y || 0) + 1.5, ps.z, v); o.thr = pid; sfx('whoosh', ps.x, ps.z);
      } break;
      case 'hit': hit(pid, ps, String(m.id || '')); break;
      case 'eliott': {
        const n = npcs.eliott; if (!n.active || !near(ps, n.x, n.z, 7)) return;
        let succ = U.clamp(m.succ | 0, 0, 3); const mat = ['acier', 'alu', 'inox'].includes(m.mat) ? m.mat : 'acier', pr = ML.SUPPLY[mat].price * 3;
        succ = Math.min(succ, Math.max(0, Math.floor(S.money / pr)));
        if (succ) K.money(-pr * succ, 'achat');
        for (let i = 0; i < succ; i++) { const [x, z] = K.dockSpot('aciers'); K.spawnItem({ type: 'matiere', d: { mat, q: 3 } }, x, 0, z); }
        say(n, succ ? `Ok-${succ}-caisse${succ > 1 ? 's' : ''}-${pr * succ}-euros-sur-le-quai-salut !` : m.succ ? "Pas-d'sous-pas-d'barres-désolé !" : "Bon-t'as-rien-suivi-reviens-plus-tard !");
        break;
      }
      case 'coco': { const n = npcs.coco; if (!n.active || !near(ps, n.x, n.z, 7)) return; if (!K.spend(pid, ML.ECO.coco, 'achat', "la caisse d'outils")) return say(n, 'Pas de sous, pas d\'outils, champion.'); const [x, z] = K.dockSpot('outipro'); K.spawnItem({ type: 'matiere', d: { t: 1 } }, x, 0, z); say(n, `Merci de m'avoir écouté ! Ta caisse d'outils : ${ML.ECO.coco} €.`); break; }
      case 'sub': {
        const comp = m.comp === 'fonderie' ? 'fonderie' : 'chaudro', n = npcs[COMP[comp].npc];
        if (!n.active || !near(ps, n.x, n.z, 7)) return;
        const o = S.orders.find(x => x.id === m.oid); if (!o || stage(o) !== comp || o.q) return;
        if (!K.spend(pid, ML.ECO.sub[comp], 'achat', 'le brut')) return say(n, "On ne fait pas crédit, désolé.");
        o.q = true; S.subs[comp].push({ oid: o.id, end: S.rt + C.SUB_SEC });
        say(n, comp === 'fonderie' ? `Je coule le brut de la #${o.id}. Repasse dans ${C.SUB_SEC} s !` : U.pick(ML.LINES.nono));
        break;
      }
      case 'open': {                                         // ouvrir un colis (en main ou par terre)
        let c = null, x = ps.x - Math.sin(ps.yaw) * 1, z = ps.z - Math.cos(ps.yaw) * 1;
        if (m.id) { const o = S.items.find(i => i.id === +m.id && i.type === 'colis'); if (!o || !near(ps, o.x, o.z, 3.5)) return; c = o.d.c; x = o.x; z = o.z; K.removeItem(o); }
        else if (held && held.type === 'colis') { c = held.d.c; P.inv[sel] = null; }
        if (!c) return;
        const n = K.openColis(c, x, z); sfx('clang', x, z);
        note(pid, `📦 Colis ouvert : ${n} article(s) par terre. Prends-les et range-les (E sur le rack ou l'armoire, produits en main).`, 'good');
        break;
      }
      case 'emote': K.ev({ e: 'emote', pid, n: U.clamp(m.n | 0, 0, 5) }); break;
      case 'ping': if (isFinite(m.x) && isFinite(m.z)) K.ev({ e: 'ping', pid, x: +m.x, z: +m.z }); break;
    }
  };

  function use(pid, P, ps, sel, held, id, m) {
    const [kind, a, b] = id.split(':');
    const t = ML.World.target(id);
    if (t && !near(ps, t.x, t.z, t.r + 2.5)) return;
    for (const mod of Sim.mods) if (mod.use && mod.use(pid, P, ps, sel, held, kind, a, b, m)) return;
    switch (kind) {
      case 'rack': case 'tool': {
        const type = kind === 'rack' ? 'brut_' + a : a; if (S.stock[a] === undefined) return;
        const n = K.store(P, type, a);                       // produits en main : on les RANGE
        if (n) { note(pid, `📦 Rangé : ${n} × ${kind === 'rack' ? 'barre ' + ML.MATERIALS[a].label : ML.TOOLS[a].label} (stock ${S.stock[a]}).`, 'good'); sfx('drop', ps.x, ps.z); return; }
        if (S.stock[a] <= 0) return note(pid, kind === 'rack' ? `Rupture de ${ML.MATERIALS[a].label} ! Commande au PC de gestion (ou chez Eliott).` : `Plus de ${ML.TOOLS[a].label.toLowerCase()} ! Commande au PC de gestion (ou chez Coco).`, 'warn');
        if (K.give(pid, { type, d: {} }, sel)) { S.stock[a]--; sfx('pickup', ps.x, ps.z); } return;
      }
      case 'coffee': { const sec = S.up.cafe_pro ? C.COFFEE.secPro : C.COFFEE.sec; P.coffee = S.rt + sec; note(pid, `☕ Un petit noir : tu vas BEAUCOUP plus vite pendant ${sec} s !`, 'good'); return; }
      case 'frigo': if (S.up.frigo && K.give(pid, { type: 'viennoiseries', d: {} }, sel)) sfx('pickup', ps.x, ps.z); return;
      case 'casques': if (K.give(pid, { type: 'casque', d: {} }, sel)) sfx('pickup', ps.x, ps.z); return;
      case 'reception':
        if (!held || held.type !== 'matiere') return;
        P.inv[sel] = null;
        if (held.d.mat) { S.stock[held.d.mat] += held.d.q; all(`+${held.d.q} ${ML.MATERIALS[held.d.mat].label} en stock (merci ${P.name}).`, 'good'); }
        else { S.stock.plaquette += 2; S.stock.fraise += 2; S.stock.foret += 2; all(`+2 plaquettes, +2 fraises, +2 forets en stock (merci ${P.name}).`, 'good'); }
        sfx('success', ps.x, ps.z); return;
      case 'mach': return machineUse(pid, P, sel, held, a, m);
      case 'item': {
        const o = S.items.find(x => x.id === +a); if (!o || !near(ps, o.x, o.z, 3.5)) return;
        if (o.type === 'find') { K.removeItem(o); return applyFind(o.d.k, pid); }
        const it = K.strip(o); if (!K.canTake(P, it)) return K.give(pid, it, sel);
        if (K.give(pid, it, sel)) { K.removeItem(o); sfx('pickup', ps.x, ps.z); }
        return;
      }
      case 'pl': {
        const T = S.pl[a], tp = pose[a]; if (!T || !tp || !held || !near(ps, tp.x, tp.z, 3.5)) return;
        if (!K.canTake(T, held)) return note(pid, `${T.name} a les mains pleines.`, 'warn');
        P.inv[sel] = null; K.give(a, held); note(a, `${P.name} te passe : ${IT.name(held)}`, 'good'); sfx('pickup', tp.x, tp.z); return;
      }
      case 'npc': return npcUse(pid, P, ps, sel, held, a);
    }
  }

  function machineUse(pid, P, sel, held, mid, m) {
    const M = S.machines[mid], def = ML.MACHINES.find(x => x.id === mid); if (!M) return;
    const op = M.op ? npcs[M.op] : null;
    for (const mod of Sim.mods) if (mod.machineUse && mod.machineUse(pid, P, sel, held, mid, M, m)) return;
    if (!op) return note(pid, `${mid} n'a pas d'opérateur : embauche quelqu'un au PC de gestion (onglet RH).`, 'warn');
    if (!held) { if (op.state === 'pause' || op.state === 'forgot') K.wake(op, pid); return; }
    const t = IT.def(held);
    if (t.kind === 'brut') {
      if (M.job) return note(pid, `${mid} est occupée.`, 'warn');
      let o;
      if (held.type === 'brut_sp') {
        o = S.orders.find(x => x.id === held.d.oid && stage(x) === 'usinage' && !x.m);
        if (!o) return note(pid, 'Ce brut ne correspond à aucune commande à usiner.', 'warn');
        if (o.mtype !== def.type) return note(pid, `La #${o.id} se fait sur une ${ML.MTYPE[o.mtype]}, pas sur ${mid} !`, 'warn');
      } else {
        const mat = t.mat, cand = S.orders.filter(x => stage(x) === 'usinage' && !x.src && !x.m && x.mat === mat);
        const fit = cand.filter(x => x.mtype === def.type);
        o = fit.filter(x => x.plan === mid).sort((p, q) => p.dl - q.dl)[0] || fit.filter(x => !x.plan).sort((p, q) => p.dl - q.dl)[0] || fit.sort((p, q) => p.dl - q.dl)[0];
        if (!o) return note(pid, cand.length ? `La commande #${cand[0].id} en ${ML.MATERIALS[mat].label} se fait sur une ${ML.MTYPE[cand[0].mtype]}, pas ici !` : `Aucune commande acceptée n'attend du ${ML.MATERIALS[mat].label} à usiner (regarde le PC).`, 'warn');
        if (o.plan && o.plan !== mid) note(pid, `(La #${o.id} était prévue sur ${o.plan} au PC, mais ${mid} s'en charge.)`);
      }
      P.inv[sel] = null; o.m = mid; o.plan = null;
      const mg = m.mg === 'ok' ? 0.75 : 1;           // prise d'origine réussie : usinage plus rapide
      M.job = { oid: o.id, tool: false, need: o.tool, prog: 0, total: C.PROD_SEC * (o.src ? 1.25 : 1) * mg * C.SIZE[o.size || 'm'].prod, wrong: m.mg === 'fail' && rng() < 0.5 };
      if (m.mg === 'ok') K.stat(pid, 'origine');
      say(op, `#${o.id} : il me faut ${o.tool === 'fraise' ? 'une fraise' : o.tool === 'foret' ? 'un foret' : 'une plaquette'} !`);
      sfx('drop', def.x, def.z); return;
    }
    if (t.kind === 'tool') {
      if (!M.job) return note(pid, `Donne d'abord un brut à ${mid}.`, 'warn');
      if (M.job.tool) return note(pid, `${mid} a déjà son outil.`, 'warn');
      if (t.tool !== M.job.need) {
        if (M.op !== 'marius') return say(op, `C'est pas le bon outil ! Il me faut : ${ML.TOOLS[M.job.need].label}.`);
        M.job.wrong = true;
      }
      P.inv[sel] = null; M.job.tool = true;
      say(op, M.op === 'marius' ? 'Reçu. Exécution.' : U.pick(["C'est parti !", 'Nickel, je lance.', 'Ça tourne !']));
      return;
    }
    if (held.type === 'viennoiseries' && M.op === 'matis') return feedMatis(pid, P, sel, op);
    note(pid, 'Ça ne sert à rien sur une machine.', 'warn');
  }
  function feedMatis(pid, P, sel, op) {
    P.inv[sel] = null; op.hunger = 0; S.buffs.matis = S.rt + 90;
    if (op.state !== 'work') K.backToWork(op);
    say(op, 'MIAM ! Je suis une machine maintenant !'); all(`🥐 ${P.name} a nourri Matis : +40 % pendant 90 s.`, 'good');
  }

  function npcUse(pid, P, ps, sel, held, id) {
    const n = npcs[id]; if (!n || !n.active || !near(ps, n.x, n.z, 4.5)) return;
    for (const mod of Sim.mods) if (mod.npcUse && mod.npcUse(pid, P, ps, sel, held, n)) return;
    if (ML.PEOPLE[id].op) {
      if (n.state === 'pause' || n.state === 'forgot') return K.wake(n, pid);
      if (held && held.type === 'viennoiseries' && id === 'matis') return feedMatis(pid, P, sel, n);
      if (held && n.mid) return machineUse(pid, P, sel, held, n.mid, {});
      return say(n, U.pick(ML.LINES[id] || ['Oui ?']));
    }
    if (id === 'lebec') return say(n, U.pick(ML.LINES.lebec));
    const comp = n.comp, C2 = comp && COMP[comp]; if (!C2) return;
    switch (C2.kind) {
      case 'boulangerie': if (K.give(pid, { type: 'viennoiseries', d: {} }, sel)) say(n, "Tiens mon grand, c'est la maison qui offre !"); return;
      case 'station': if (K.give(pid, { type: 'jerrican', d: {} }, sel)) say(n, 'Un jerrican, cadeau. Ramène-le pas, je m\'en fiche.'); return;
      case 'tth': {
        if (!K.isPart(held)) return say(n, U.pick(ML.LINES.maurseau));
        const o = S.orders.find(x => x.id === held.d.oid);
        if (!o || stage(o) !== 'tth') return say(n, "Celle-là, elle n'a pas besoin de traitement thermique !");
        if (!K.spend(pid, ML.ECO.sub.tth, 'achat', 'le traitement thermique')) return say(n, 'Pas payé, pas chauffé ! WOUHOU quand même.');
        P.inv[sel] = null; o.q = true; S.subs.tth.push({ oid: o.id, end: S.rt + C.SUB_SEC, nc: !!held.d.nc, mes: held.d.mes, type: held.type });
        return say(n, `Au four la #${o.id} ! ${ML.ECO.sub.tth} €. Reviens dans ${C.SUB_SEC} s, WOUHOU !`);
      }
      case 'client': case 'concurrent': if (K.isPart(held)) return deliver(pid, P, sel, held, comp, n); return say(n, U.pick(ML.LINES[id] || ['Bonjour !']));
      default: return say(n, U.pick(ML.LINES[id] || ['Oui ?']));
    }
  }

  /* ======================= Coups, Lebec, trouvailles ======================= */
  function hit(pid, ps, id) {
    const [kind, a] = id.split(':');
    if (kind === 'npc') { const n = npcs[a]; if (n && n.active && near(ps, n.x, n.z, 3)) K.npcHit(n, pid); }
    else if (kind === 'pl') { const tp = pose[a]; if (S.pl[a] && K.foot(S.pl[a]) && tp && near(ps, tp.x, tp.z, 3)) K.playerHit(a, pid, 1.2); }
    for (const mod of Sim.mods) if (mod.onHit) mod.onHit(pid, kind, a);
  }
  K.npcHit = (n, by) => {
    if (n.stun > 0.3) return;
    n.stun = 0.7; sfx('punch', n.x, n.z);
    const ps = pose[by]; if (ps) { const dx = n.x - ps.x, dz = n.z - ps.z, d = Math.hypot(dx, dz) || 1; n.x += dx / d * 0.6; n.z += dz / d * 0.6; U.resolveCircle(n, 0.3); }
    for (const mod of Sim.mods) if (mod.npcHit && mod.npcHit(n, by)) return;
    if (n.id === 'lebec') { say(n, "TU M'AS FRAPPÉ ?! COUP DE PELLE !!!", true); S.anger = 100; K.stat(by, 'slap_lebec'); K.startChase(by); return; }
    if (ML.PEOPLE[n.id].op && ['pause', 'toPause', 'forgot', 'rant'].includes(n.state)) { K.backToWork(n); say(n, n.id === 'brieuc' ? "Mmh. D'accord. J'y vais." : "Aïe ! OK OK, j'y retourne !"); }
    else say(n, n.id === 'marius' ? 'Choc détecté. Je continue.' : U.pick(['Aïe !', 'Hé ! Ça va pas ?!', 'Ouille !']));
    K.witness(by, n.x, n.z);
  };
  K.playerHit = (tid, by, dur) => {
    const T = S.pl[tid]; if (!T || T.stun > S.rt) return;
    T.stun = S.rt + dur;
    const tp = pose[tid] || { x: 0, z: 0 };
    const i = T.inv.findIndex(x => x);
    if (i >= 0 && K.foot(T)) { const it = T.inv[i]; T.inv[i] = null; K.spawnItem(it, tp.x + 0.6, 0.8, tp.z + 0.4, [rng() - 0.5, 2, rng() - 0.5]); }
    ev.push({ e: 'stun', to: tid, d: dur, by }); sfx('punch', tp.x, tp.z);
    if (by) { note(tid, `${S.pl[by] ? S.pl[by].name : '?'} t'a mis une claque !`, 'warn'); K.witness(by, tp.x, tp.z); if (S.pl[by]) K.damage(tid, C.HP.slap, 'claque'); }
  };
  K.witness = (pid, x, z) => {
    const L = npcs.lebec, sight = (K.H.sight || C.LEBEC.sight) * (K.D.sight || 1);
    if (!U.inWorkshop({ x, z }) || Math.hypot(L.x - x, L.z - z) > sight || S.chase) return;
    let add = C.LEBEC.hit * (K.H.anger || 1); if (S.buffs.calm > S.rt) add *= 0.3;
    S.anger = Math.min(100, S.anger + add * K.D.anger);
    say(L, "JE T'AI VU ! ON NE FRAPPE PAS LES COLLÈGUES !");
    note(pid, `😡 Lebec t'a vu (colère ${Math.round(S.anger)}/100). À 50 : coup de pelle !`, 'warn');
    if (S.anger >= C.LEBEC.chaseAt) K.startChase(pid);
  };
  K.startChase = pid => {
    S.chase = pid; const L = npcs.lebec; L.state = 'chase'; L.chaseT = 0; L.repath = 0; L.shoutT = 0;
    big('« COUP DE PELLE ! »', '#ff3b30', pid); all(`🪓 Lebec poursuit ${S.pl[pid] ? S.pl[pid].name : '?'} avec sa pelle !`, 'warn');
  };
  function coupDePelle(pid) {
    const P = S.pl[pid], tp = pose[pid] || { x: 0, z: 0 }, L = npcs.lebec;
    P.stun = S.rt + 3; K.dropAll(pid, 4);
    const dx = tp.x - L.x, dz = tp.z - L.z, d = Math.hypot(dx, dz) || 1;
    ev.push({ e: 'pelle', to: pid, vx: dx / d * 9, vz: dz / d * 9 }); sfx('bong', tp.x, tp.z);
    S.anger = C.LEBEC.base + K.D.base + 10; S.chase = null; K.stat(pid, 'pelle'); K.damage(pid, C.HP.pelle, 'coup de pelle');
  }
  function applyFind(k, pid) {
    const F = ML.FINDS[k], who = S.pl[pid] ? S.pl[pid].name : '?';
    S.finds.got++; S.finds.log.push(k);
    switch (k) {
      case 'pelle_or': S.anger = 0; S.buffs.calm = S.rt + 120; if (S.chase) { S.chase = null; npcs.lebec.state = 'patrol'; } break;
      case 'pied_coulisse': K.bonus(120); break;
      case 'croissant': S.buffs.croissant = S.rt + 60; break;
      case 'plaquettes': S.stock.plaquette += 4; break;
      case 'barres': S.stock.alu += 2; S.stock.inox += 2; break;
      case 'cafe': S.buffs.cafe = S.rt + 60; break;
      case 'cle12': for (const o of S.orders) o.dl += 40; break;
      case 'turbo': S.buffs.turbo = S.rt + 120; break;
      case 'bidon': for (const c of S.cars) c.fuel = 100; break;
    }
    big(`★ ${who} a trouvé : ${F.name} !`, '#ffd257'); all(`★ Trouvaille (${S.finds.got}/${S.finds.total}) : ${F.name} — ${F.desc}`, 'good'); sfx('find');
    if (S.finds.got === S.finds.total) for (const p in S.pl) K.stat(p, 'finds_all');
  }

  /* ======================= PNJ ======================= */
  function route(n, x, z) {
    const pts = [], A = -1.2, inW = U.inWorkshop(n), tW = U.inWorkshop({ x, z });
    if (inW && tW) {
      if (Math.abs(n.z - A) > 2 && Math.abs(z - n.z) > 1.2) pts.push({ x: n.x, z: A });
      if (Math.abs(z - A) > 2 && (pts.length || Math.abs(x - n.x) > 1.2)) pts.push({ x, z: A });
    } else if (inW && !tW) { if (Math.abs(n.z - A) > 2) pts.push({ x: n.x, z: A }); pts.push({ x: 0, z: A }, { x: 0, z: 16 }); }
    else if (!inW && tW) { pts.push({ x: 0, z: 17 }, { x: 0, z: A }); if (Math.abs(z - A) > 2) pts.push({ x, z: A }); }
    pts.push({ x, z }); return pts;
  }
  K.walkTo = (n, x, z, cb, run) => { n.path = route(n, x, z); n.onArrive = cb || null; n.run = !!run; n.stuck = 0; n.stuckAll = 0; };
  K.stop = n => { n.path = []; n.onArrive = null; n.run = false; };
  K.atHome = n => n.home && Math.hypot(n.x - n.home.x, n.z - n.home.z) < 0.5;
  K.backToWork = n => { n.state = 'work'; K.stop(n); };
  K.wake = (n, pid) => {
    const forgot = n.state === 'forgot', chance = n.id === 'brieuc' ? 0.25 : 0.7;
    if (forgot || rng() < chance) { K.backToWork(n); say(n, forgot ? 'Ah ouiii ! Merci.' : U.pick(["Ouais ouais, j'y vais...", "Bon. D'accord."])); }
    else { say(n, U.pick(['Encore cinq minutes...', 'Nan.', "J'arrive... (il n'arrive pas)"])); note(pid, 'Il ne bouge pas. Une claque (clic gauche) marcherait mieux...'); }
  };
  K.workMult = n => {
    if (n.state !== 'work' || !K.atHome(n) || n.stun > 0 || !S.power) return 0;
    let k = ML.PEOPLE[n.id].op.speed;
    if (ML.APP_IDS.includes(n.id)) k = 0.6 + 0.15 * Math.min(3, S.up.formation || 0);
    if (S.up.eclairage) k *= 1.08; if (S.up.isolation) k *= 1.05;
    if (S.buffs.croissant > S.rt) k *= 1.5;
    if (n.id === 'matis') { if (S.buffs.matis > S.rt) k *= 1.4; else if (n.hunger > 60) k *= 0.5; }
    for (const mod of Sim.mods) if (mod.workMult) k = mod.workMult(n, k);
    return k;
  };
  const busy = mid => { const M = S.machines[mid]; return !!(M && M.job && M.job.tool && !M.broken); };
  function brainOperator(n, dt) {
    const op = ML.PEOPLE[n.id].op;
    if (!n.mid) {                                    // embauché mais sans machine : il attend au coin café
      if (!K.atHome(n) && !n.path.length && n.home) K.walkTo(n, n.home.x, n.home.z);
      return;
    }
    const M = S.machines[n.mid];
    switch (n.state) {
      case 'work': {
        // un seul opérateur pour plusieurs machines : il va là où il y a du travail
        if (n.mids && n.mids.length > 1 && !busy(n.mid) && !n.path.length) {
          const other = n.mids.find(x => x !== n.mid && busy(x));
          if (other) { n.mid = other; n.home = ML.World.machines[other].station; if (rng() < 0.3) say(n, `J'file sur ${other} !`); }
        }
        if (!K.atHome(n)) { if (!n.path.length) K.walkTo(n, n.home.x, n.home.z, null, n.mids && n.mids.length > 1); break; }
        n.faceYaw = n.home.yaw;
        const lazy = op.lazy * 0.7 * (S.up.babyfoot ? 0.7 : 1);
        if (lazy > 0 && rng() < lazy * 0.012 * dt * (M.job ? 1 : 1.5)) {
          if (op.traits.includes('deadstop')) { n.state = 'pause'; n.pauseT = 35 + rng() * 30; say(n, 'Flemme.'); }
          else { const sp = U.pick(ML.LOC.coffee); n.state = 'toPause'; K.walkTo(n, sp.x, sp.z, () => { n.state = 'pause'; n.pauseT = (18 + rng() * 20) * (S.up.babyfoot ? 0.6 : 1); }); say(n, 'Petite pause café...'); }
        }
        if (op.traits.includes('forgetful') && M.job && M.job.tool && rng() < 0.006 * dt) { n.state = 'forgot'; say(n, "Euh... j'usinais quoi déjà ?"); }
        break;
      }
      case 'pause': n.pauseT -= dt; if (n.pauseT <= 0) { K.backToWork(n); say(n, "Bon, j'y retourne."); } break;
      case 'rant': n.pauseT -= dt; if (n.pauseT <= 0) K.backToWork(n); break;
    }
    if (n.id === 'matis' && n.hunger > -100) n.hunger = Math.min(100, n.hunger + dt * 0.45);
  }
  function brainLebec(n, dt) {
    if (n.state === 'chase') {
      const tp = pose[S.chase], P = S.pl[S.chase];
      n.chaseT += dt; n.repath -= dt; n.shoutT -= dt; n.run = true;
      if (!tp || !P) { S.chase = null; n.state = 'patrol'; return; }
      if (n.repath <= 0) { n.repath = 0.3; n.path = [{ x: tp.x, z: tp.z }]; n.onArrive = null; }
      if (n.shoutT <= 0) { n.shoutT = 3.5; say(n, 'COUP DE PELLE !', true); }
      if (K.foot(P) && Math.hypot(n.x - tp.x, n.z - tp.z) < C.LEBEC.reach) { coupDePelle(S.chase); n.state = 'patrol'; K.stop(n); return; }
      if (!K.foot(P) || n.chaseT > 22 || (!U.inWorkshop(tp) && Math.hypot(n.x - tp.x, n.z - tp.z) > 30)) {
        S.chase = null; n.state = 'patrol'; K.stop(n); say(n, 'Tu perds rien pour attendre, toi !'); S.anger = Math.max(C.LEBEC.base, S.anger - 25);
      }
      return;
    }
    n.run = false;
    const decay = (S.up.posters ? 1 : 0.6) / (K.H.anger || 1);
    const floor = C.LEBEC.base + K.D.base; if (S.anger > floor) S.anger = Math.max(floor, S.anger - dt * decay);
    if (!n.path.length) { n.wait = (n.wait || 0) - dt; if (n.wait <= 0) { const p = U.pick(ML.LOC.patrol); K.walkTo(n, p.x, p.z); n.wait = 3 + rng() * 6; } }
    n.barkT = (n.barkT || 10) - dt;
    if (n.barkT <= 0) {
      n.barkT = 16 + rng() * 14;
      if (S.humeur === 'reforme' && rng() < 0.5) {   // tirade : l'opérateur le plus proche s'arrête pour écouter
        let best = null, bd = 9; for (const id in npcs) { const o = npcs[id]; if (o.mid && o.active && o.state === 'work') { const d = Math.hypot(o.x - n.x, o.z - n.z); if (d < bd) { bd = d; best = o; } } }
        if (best) { best.state = 'rant'; best.pauseT = 10; say(n, U.pick(ML.LINES.tirade), true); return; }
      }
      say(n, U.pick(ML.LINES.lebec));
    }
  }
  function brainShop(n, dt) {
    if (n.id === 'maurseau') {
      if (!n.path.length) { n.wait = (n.wait || 0) - dt; if (n.wait <= 0) { n.wait = 1 + rng() * 2; K.walkTo(n, n.home.x + (rng() - 0.5) * 8, n.home.z + (rng() - 0.5) * 2, null, true); } }
      n.runSpeed = 5;
    } else if (!K.atHome(n) && !n.path.length) K.walkTo(n, n.home.x, n.home.z);
    let best = null, bd = 6;
    for (const pid in pose) { const p = pose[pid]; const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < bd) { bd = d; best = p; } }
    n.faceYaw = best ? Math.atan2(best.x - n.x, best.z - n.z) : n.home.yaw;
  }
  function updateNpc(n, dt) {
    if (!n.active) return;
    if (n.stun > 0) n.stun -= dt;
    if (n.tmpT > 0) n.tmpT -= dt;
    if (n.stun <= 0) {
      let handled = false;
      for (const mod of Sim.mods) if (mod.brain && mod.brain(n, dt)) { handled = true; break; }
      if (!handled) { if (ML.PEOPLE[n.id].op) brainOperator(n, dt); else if (n.id === 'lebec') brainLebec(n, dt); else if (n.home) brainShop(n, dt); }
    }
    let moving = 0;
    if (n.path.length && n.stun <= 0) {
      const t = n.path[0], dx = t.x - n.x, dz = t.z - n.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { n.path.shift(); n.stuck = 0; n.stuckAll = 0; if (!n.path.length) { const cb = n.onArrive; n.onArrive = null; n.run = n.state === 'chase'; if (cb) cb(); } }
      else {
        const run = n.id === 'lebec' ? (K.H.run || C.LEBEC.run) * K.D.run : n.runSpeed || 5;
        const sp = n.run ? run : n.speed, step = Math.min(sp * dt, d), ox = n.x, oz = n.z;
        n.x += dx / d * step; n.z += dz / d * step; U.resolveCircle(n, 0.3);
        const moved = Math.hypot(n.x - ox, n.z - oz);
        if (moved < step * 0.35) { n.stuck += dt; n.stuckAll += dt; } else n.stuck = Math.max(0, n.stuck - dt);
        if (n.stuck > 0.6) { n.stuck = 0; const s = rng() < 0.5 ? 1 : -1; n.path.unshift({ x: n.x - dz / d * 1.6 * s, z: n.z + dx / d * 1.6 * s }); }
        if (n.stuckAll > 4) { n.x = t.x; n.z = t.z; n.stuckAll = 0; }
        n.yaw = U.lerpAngle(n.yaw, Math.atan2(dx, dz), 10 * dt); moving = n.run ? 2 : 1;
      }
    } else if (n.faceYaw != null) n.yaw = U.lerpAngle(n.yaw, n.faceYaw, 5 * dt);
    n.mv = moving;
  }
  function bubble(n) {
    if (n.tmpT > 0) return n.tmp;
    for (const mod of Sim.mods) if (mod.bubble) { const b = mod.bubble(n); if (b !== undefined) return b; }
    if (ML.PEOPLE[n.id].op && !n.mid) return '😴 Pas de machine';
    if (n.mid) {
      if (n.state === 'pause' || n.state === 'toPause') return n.id === 'brieuc' ? '💤 Flemme...' : '☕ En pause';
      if (n.mids && n.mids.length > 1 && !K.atHome(n) && n.path.length) return '🏃 ' + n.mids.join(' ↔ ');
      if (n.state === 'forgot') return "❔ J'usinais quoi déjà ?";
      if (n.state === 'rant') return '😐 Écoute Lebec...';
      const M = S.machines[n.mid];
      if (M.job && !M.job.tool) return '❓ ' + ML.TOOLS[M.job.need].label + ' ?';
      if (n.id === 'matis' && n.hunger > 60 && !(S.buffs.matis > S.rt)) return "🥐 J'ai faim...";
      return '';
    }
    if (n.id === 'lebec') return n.state === 'chase' ? 'COUP DE PELLE !' : '';
    const q = n.comp && S.subs[n.comp];
    if (q && q.length) return `🔥 #${q[0].oid} : ${Math.ceil(q[0].end - S.rt)} s`;
    return '';
  }

  /* ======================= Physique des objets ======================= */
  function updateItems(dt) {
    for (const o of S.items) {
      if (o.rest) continue;
      o.vy -= 20 * dt; const ox = o.x, oz = o.z;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.y < 6.5 && U.inCollider(o.x, o.z, 0.05)) { o.x = ox; o.z = oz; o.vx *= -0.3; o.vz *= -0.3; if (o.thr) { sfx('clang', o.x, o.z); o.thr = null; } }
      if (o.thr) {
        for (const mod of Sim.mods) if (mod.itemHit && mod.itemHit(o)) { o.thr = null; break; }
        if (o.thr) for (const id in npcs) { const n = npcs[id]; if (n.active && Math.hypot(o.x - n.x, o.z - n.z) < 0.6 && o.y < 2) { K.npcHit(n, o.thr); o.thr = null; o.vx *= -0.2; o.vz *= -0.2; o.vy = 1.5; break; } }
        if (o.thr) for (const pid in pose) { if (pid === o.thr || !S.pl[pid] || !K.foot(S.pl[pid])) continue; const p = pose[pid]; if (Math.hypot(o.x - p.x, o.z - p.z) < 0.55 && o.y < 2) { K.playerHit(pid, o.thr, 1.2); o.thr = null; o.vx *= -0.2; o.vz *= -0.2; break; } }
      }
      if (o.y <= 0) { o.y = 0; if (Math.abs(o.vy) > 2.5) o.vy *= -0.3; else o.vy = 0; o.vx *= 0.55; o.vz *= 0.55; if (o.vx * o.vx + o.vz * o.vz + o.vy * o.vy < 0.05) { o.rest = true; o.thr = null; Sim.dirty = true; } }
    }
  }

  /* ======================= Boucle ======================= */
  Sim.step = dt => {
    if (S.over) return;
    if (S.voting) { S.rt += dt; for (const m of Sim.mods) if (m.voteStep) m.voteStep(dt); return; }
    S.rt += dt;
    updateOrders(dt);
    for (const def of ML.MACHINES) {
      const M = S.machines[def.id]; if (!M) continue;
      const op = M.op ? npcs[M.op] : null, prev = M.status;
      if (!S.power) M.status = 'off';
      else if (!op) M.status = 'noop';
      else if (M.broken) M.status = 'panne';
      else if (M.bin === false || M.chips >= 100) M.status = 'bac';
      else if (!M.job) M.status = 'idle';
      else if (!M.job.tool) M.status = M.worn ? 'usure' : 'wait';
      else {
        const k = op.mid === def.id ? K.workMult(op) : 0;
        if (k > 0) { M.job.prog += dt * k; M.status = 'run'; } else M.status = 'stop';
        if (M.job.prog >= M.job.total) {
          const o = S.orders.find(x => x.id === M.job.oid), [x, z] = K.expeditionSpot();
          if (o) {
            o.m = null; o.si++;
            const nc = M.job.wrong, cote = U.pick(ML.COTES), dev = nc ? cote[2] * (1.6 + rng()) * (rng() < 0.5 ? -1 : 1) : cote[2] * (rng() * 1.6 - 0.8);
            const d = { oid: o.id, nc: nc || undefined, mes: [cote[0], cote[1], cote[2], Math.round((cote[1] + dev) * 1000) / 1000] };
            if (o.size === 'l') { const [bx, bz] = K.bigSpot(); K.spawnItem({ type: 'palette', d }, bx, 0, bz); all(`✔ ${def.id} a fini la GROSSE pièce #${o.id} → palette au QUAI GROS COLIS (fenwick !).`, 'good'); }
            else { K.spawnItem({ type: o.size === 's' ? 'piece' : 'caisse', d }, x, 1.2, z, [0, 0, 0]); all(`✔ ${def.id} a fini la #${o.id} → ${o.size === 's' ? 'petite pièce' : 'caisse'} en EXPÉDITION${stage(o) === 'tth' ? ' (à traiter chez TTH Ouest)' : ''}.`, 'good'); }
            sfx('success', def.x, def.z);
          }
          M.job = null; M.status = 'idle';
        }
      }
      if (prev !== M.status) Sim.dirty = true;
    }
    for (const k in S.subs) for (const j of S.subs[k].slice()) {
      if (S.rt < j.end) continue;
      S.subs[k].splice(S.subs[k].indexOf(j), 1);
      const o = S.orders.find(x => x.id === j.oid); if (!o) continue;
      const [x, z] = K.dockSpot(k);
      if (k === 'tth') K.spawnItem({ type: j.type || 'caisse', d: { oid: o.id, nc: j.nc || undefined, mes: j.mes } }, x, 0, z);
      else K.spawnItem({ type: 'brut_sp', d: { oid: o.id, mat: k === 'fonderie' ? 'fonte' : 'soude' } }, x, 0, z);
      o.si++; o.q = false;
      all(k === 'tth' ? `🔥 Caisse #${o.id} traitée : à récupérer chez TTH Ouest.` : `🧱 Brut de la #${o.id} prêt sur le quai de ${COMP[k].name}.`, 'good');
      Sim.dirty = true;
    }
    for (const id in npcs) updateNpc(npcs[id], dt);
    updateItems(dt);
    for (const pid in S.pl) if (S.pl[pid].stun && S.pl[pid].stun < S.rt) S.pl[pid].stun = 0;
    for (const m of Sim.mods) if (m.step) m.step(dt);
    if (S.rt >= C.SHIFT_SEC && S.mode !== 'course') K.end();
  };
  K.salaries = () => S.staff.reduce((a, id) => a + (ML.STAFF[id] ? ML.STAFF[id].pay : 0), 0) + Object.keys(ML.AI_STAFF).reduce((a, k) => a + (S.ai[k] ? ML.AI_STAFF[k].pay : 0), 0);
  K.end = extra => {
    if (S.over || S.voting) return;
    S.over = true; Sim.dirty = true;
    const race = S.mode === 'course';
    if (!race) {
      const sal = K.salaries(); S.money -= sal; S.today.salaires = sal;
      const abo = Object.keys(ML.CATALOG).reduce((a, k) => a + (ML.CATALOG[k].daily && S.up[k] ? ML.CATALOG[k].daily : 0), 0); S.money -= abo; S.today.abos = abo;
    }
    const T = S.today, profit = T.ca + T.bonus - T.achat - T.amende - T.salaires - (T.abos || 0);
    const k = (1 + 0.35 * (Math.max(1, S.n) - 1)) * K.D.stars * (0.6 + 0.2 * Object.keys(S.machines).length), need = ML.ECO.stars.map(v => Math.round(v * k / 10) * 10);
    const stars = race ? 0 : profit >= need[2] ? 3 : profit >= need[1] ? 2 : profit >= need[0] ? 1 : 0;
    if (S.money >= 10000) for (const p in S.pl) K.stat(p, 'rich');
    if (Object.keys(S.machines).length >= 6) for (const p in S.pl) K.stat(p, 'full');
    if (S.nParts >= 3) for (const p in S.pl) K.stat(p, 'part3');
    const res = Object.assign({ mode: S.mode, diff: S.diff, day: S.day, score: race ? S.score : Math.max(0, Math.round(profit / 4)), served: S.served, failed: S.failed, stars, finds: S.finds.got, findsTotal: S.finds.total, sat: Math.round(S.sat), need,
      money: S.money, profit, today: Object.assign({}, T), rep: S.rep, rep0: S.rep0, campaign: S.campaign, co: S.co, snap: Sim.companySnap(), bankrupt: !race && S.mode !== 'inspection' && S.money < ML.ECO.bankrupt }, extra || {});
    for (const m of Sim.mods) if (m.onEnd) m.onEnd(res);
    if (S.served >= 10) for (const p in S.pl) K.stat(p, 'served10');
    if (res.vote) { S.over = false; S.voting = { until: S.rt + 25, votes: {}, res }; K.ev({ e: 'vote', until: 25, players: Object.keys(S.pl).map(id => [id, S.pl[id].name]) }); return; }
    ev.push({ e: 'end', res });
  };

  /* ======================= Instantanés ======================= */
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  Sim.fast = () => {
    const f = {
      k: 'f', rt: r1(S.rt),
      n: Object.values(npcs).filter(n => n.active).map(n => [n.id, r2(n.x), r2(n.z), r2(n.yaw), n.mv || 0, n.stun > 0 ? 's' : n.state === 'chase' ? 'c' : n.state === 'pause' || n.state === 'toPause' ? 'p' : n.state === 'forgot' ? 'f' : n.state === 'flee' ? 'r' : n.state === 'listen' ? 'b' : 'w', bubble(n)]),
      i: S.items.filter(o => !o.rest).map(o => [o.id, r2(o.x), r2(o.y), r2(o.z), r1(o.ry)]),
      c: S.cars.map(c => [r2(c.x), r2(c.z), r2(c.h), c.dr || 0])
    };
    for (const m of Sim.mods) if (m.fast) m.fast(f);
    return f;
  };
  Sim.slow = () => {
    Sim.dirty = false;
    const out = {};
    for (const k in S) if (!['items', 'cars', 'nextItem', 'nextOid', 'nextOrder', 'nOrders', 'nextId', 'voting'].includes(k)) out[k] = S[k];
    out.items = S.items.map(o => [o.id, o.type, o.d, r2(o.x), r2(o.y), r2(o.z), r1(o.ry)]);
    out.cars = S.cars.map(c => ({ x: c.x, z: c.z, h: c.h, dr: c.dr, bed: c.bed, name: c.name, kind: c.kind, fuel: Math.round(c.fuel), cap: c.cap, frozen: c.frozen, color: c.color, pass: c.pass || [], load: c.load || null }));
    if (S.voting) out.voting = { until: S.voting.until };
    return { k: 's', S: out };
  };
  /** État de l'entreprise à sauvegarder (argent, machines, personnel, véhicules, stock, réputation) */
  Sim.companySnap = () => S && ({ money: Math.round(S.money), rep: S.rep, mach: ML.MACHINE_ORDER.filter(id => S.machines[id]), staff: S.staff.slice(), ai: Object.assign({}, S.ai), veh: S.owned.slice(), up: Object.assign({}, S.up), stock: Object.assign({}, S.stock) });
  /** Un joueur rejoint en cours de partie (drop-in) */
  Sim.addPlayer = (p, role) => {
    if (!S || S.pl[p.id]) return;
    S.pl[p.id] = { name: p.name, idx: p.idx, inv: [null, null, null], car: null, ride: null, stun: 0, coffee: 0, hp: C.HP.max, ko: false, role: ML.ROLES[role] ? role : 'poly', late: S.rt };
    S.n = Object.keys(S.pl).length; Sim.dirty = true;
    all(`👋 ${p.name} rejoint l'atelier en cours de journée !`, 'good');
  };
  Sim.setRole = (pid, role) => { const P = S && S.pl[pid]; if (P && P.late !== undefined && S.rt - P.late < 20 && ML.ROLES[role]) { P.role = role; Sim.dirty = true; } };
  Sim.removePlayer = pid => {
    const P = S && S.pl[pid]; if (!P) return;
    K.dropAll(pid, 1);
    for (const c of S.cars) { if (c.dr === pid) c.dr = null; c.pass = (c.pass || []).filter(x => x.pid !== pid); }
    delete S.pl[pid]; delete pose[pid]; if (S.chase === pid) S.chase = null;
    S.n = Object.keys(S.pl).length; Sim.dirty = true;
  };
})();
