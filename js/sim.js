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
    const humeurs = Object.keys(ML.HUMEURS);
    const wpick = tab => { let t = 0; for (const k in tab) t += tab[k]; let r = rng() * t; for (const k in tab) { r -= tab[k]; if (r <= 0) return k; } return 'beau'; };
    K.wpick = wpick;
    const weather = g.weather || wpick(Object.fromEntries(Object.keys(ML.WEATHER).map(k => [k, ML.WEATHER[k].p])));
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
      campaign: !!g.campaign, co: { name: E.name || '', code: E.code || null, day: E.day || 1, won: !!E.won, insp: E.insp || null, mach: E.mach.length, rep: E.rep },
      // --- V5 ---
      wxNext: 70 + rng() * 70, spent: {}, hist: (E.hist || []).slice(-7), pedHits: {}, ext: !!up.extension,
      // --- V5.2 ---
      black: g.mode !== 'course' && ((E.day || g.day || 1) % ML.ECO.black.every === 0), wc: U.clamp(E.wc !== undefined ? +E.wc : 15, 0, 100), quest: null, sae: null, radarsOff: [], saeBon: +(up.sae_bon || 0)
    };
    K.H = ML.HUMEURS[S.humeur]; S.diff = ML.DIFFS[g.diff] ? g.diff : 'normal';
    // stock : celui de l'entreprise
    for (const k in C.START_STOCK) S.stock[k] = Math.max(0, Math.round(E.stock[k] !== undefined ? E.stock[k] : C.START_STOCK[k]));
    // machines possédées (les opérateurs sont répartis par K.assignOps)
    for (const m of ML.MACHINES) if (E.mach.includes(m.id)) S.machines[m.id] = { status: 'idle', job: null, op: null, wear: Math.floor(rng() * 40), broken: false, plan: null, mo: ML.MMODELS[(E.mo || {})[m.id]] ? E.mo[m.id] : 'std' };   // V6 : gamme (occasion / standard / haut de gamme)
    for (const id of ML.APP_IDS) S.appNames[id] = ML.PEOPLE[id].name;
    // niveau de l'atelier (0 → 1) : la difficulté monte avec les machines, la réputation et les jours
    const nM = Object.keys(S.machines).length;
    K.lvl = S.lvl = g.campaign ? U.clamp((nM - 2) / 4 * 0.55 + U.clamp((S.rep - 40) / 50, 0, 1) * 0.25 + U.clamp((S.day - 1) / 9, 0, 1) * 0.2, 0, 1) : 0.35;
    const D0 = ML.DIFFS[S.diff], lv = K.lvl, pi = K.pi = Math.min(4, Math.max(1, cfg.players.length)) - 1;
    // V4.1 : moins de chaos et d'événements quand on est peu nombreux
    K.D = Object.assign({}, D0, { chaos: D0.chaos * (0.45 + 0.85 * lv) * ML.ECO.playerChaos[pi], events: [Math.max(0, Math.round(D0.events[0] * (0.4 + 0.8 * lv)) - (pi ? 0 : 1)), Math.max(1, Math.round(D0.events[1] * (0.5 + 0.7 * lv)) - (pi ? 0 : 1))] });
    // V5.1 : type de journée (calme, coup de feu, agitée…) : commandes ↔ imprévus
    const dk = g.dayType || (S.mode === 'course' || S.mode === 'inspection' || (E.day || g.day || 1) <= 1 ? 'normale' : wpick(Object.fromEntries(Object.keys(ML.DAYTYPES).map(k => [k, ML.DAYTYPES[k].p]))));
    const DT = ML.DAYTYPES[dk] || ML.DAYTYPES.normale; S.dayType = ML.DAYTYPES[dk] ? dk : 'normale';
    K.D.interval *= DT.orders; K.D.dur *= DT.dur;
    K.D.events = [Math.max(0, K.D.events[0] + DT.ev), Math.max(0, K.D.events[1] + DT.ev)];
    if (DT.ev > 0) K.D.events[0] = Math.max(K.D.events[0], DT.ev);                 // journée calme : il se passe forcément quelque chose
    // V5.3 : MODE DÉBUTANT : pas d'imprévus, tickets très longs, Lebec très patient, commandes espacées
    S.beginner = !!g.beginner;
    if (S.beginner) { K.D.events = [0, 0]; K.D.dur *= 1.8; K.D.interval *= 1.6; K.D.anger *= 0.25; K.D.chaos *= 0.15; K.D.dmg = (K.D.dmg || 1) * 0.4; }
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
    spots.forEach((h, i) => K.spawnItem({ type: 'find', d: { k: kinds[i] } }, h.x, ML.gy(h.x, h.z), h.z));
    S.finds.total = spots.length;
    // équipements sur leurs crochets
    for (const h of ML.LOC.hooks) K.spawnItem({ type: h.type, d: h.h !== undefined ? { h: h.h } : {} }, h.x, h.y, h.z);
    for (const m of Sim.mods) if (m.init) m.init(cfg);
    if (E.mess && S.mode !== 'course') K.restore(E.mess);                // V5 : tout est resté comme la veille (commandes, bazar…)
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
  /* V5 : HISTORIQUE — chaque mouvement d'argent est noté (qui, quoi, combien). Les clients le reçoivent
     par l'événement « led » ; les totaux par joueur (S.spent) sont dans l'état. */
  K.clock = () => { const m = Math.round(C.DAY_START + S.rt * (C.DAY_END - C.DAY_START) / C.SHIFT_SEC); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
  K.led = (d, cat, info) => {
    info = info || {}; const pid = info.pid && S.pl[info.pid] ? info.pid : null, who = pid ? S.pl[pid].name : (info.who || 'Atelier');
    ev.push({ e: 'led', l: [K.clock(), who, cat || '', String(info.what || '').slice(0, 70), d, pid ? S.pl[pid].idx : -1] });
    if (d < 0) { const k = pid || '_', sp = S.spent[k] = S.spent[k] || { name: who, amende: 0, achat: 0, invest: 0, autre: 0 }; const c2 = ['amende', 'achat', 'invest'].includes(cat) ? cat : 'autre'; sp[c2] += -d; sp.name = who; }
  };
  K.money = (d, cat, info) => { d = Math.round(d); S.money += d; if (cat) S.today[cat] = (S.today[cat] || 0) + Math.abs(d); if (d) K.led(d, cat, info); Sim.dirty = true; };
  K.spend = (pid, amt, cat, what) => {
    amt = Math.round(amt);
    if (S.money < amt) { if (pid) note(pid, `💸 Pas assez d'argent${what ? ' pour ' + what : ''} : il faut ${amt} €, la caisse en a ${S.money} €.`, 'warn'); return false; }
    K.money(-amt, cat || 'achat', { pid, what }); return true;
  };
  K.fine = (amt, why, pid) => { K.money(-amt, 'amende', { pid, what: why || 'Amende' }); return `−${amt} €`; };
  K.bonus = (amt, why, pid) => { K.money(amt, 'bonus', { pid, what: why || 'Prime' }); return `+${amt} €`; };
  K.repAdd = d => { S.rep = U.clamp(Math.round(S.rep + d), 0, 100); Sim.dirty = true; };
  K.eur = n => `${Math.round(n).toLocaleString('fr-FR')} €`;
  /** V5.2 : prix du jour (BLACK FRIDAY un jour sur 5) — kind : cat (PC), supply (matière/outils), dealer (garage), mall */
  K.price = (p, kind) => Math.round(p * (S && S.black ? (ML.ECO.black[kind] || 1) : 1));
  /** V5.2 : qui s'occupe de la commande (affiché sur les tickets) */
  K.by = (o, pid) => { if (o && pid && S.pl[pid]) { o.by = S.pl[pid].name; o.byI = S.pl[pid].idx; Sim.dirty = true; } };

  /* ======================= Événements vers les clients ======================= */
  K.note = (to, s, ty) => ev.push({ e: 'n', to, s, ty });
  K.all = (s, ty) => ev.push({ e: 'n', s, ty });
  K.sfx = (s, x, z) => ev.push({ e: 'sfx', s, x, z });
  K.big = (s, c, to) => ev.push({ e: 'big', s, c, to });
  K.ev = o => ev.push(o);
  K.stat = (to, k, n) => ev.push({ e: 'stat', to, k, n: n || 1 });
  K.say = (n, s, speak) => { n.tmp = s; n.tmpT = Math.max(4, String(s).length / 15); ev.push({ e: 'say', n: n.id, s, sp: speak ? 1 : 0 }); };
  Sim.drain = () => { const e = ev; ev = []; return e; };
  const { note, all, sfx, big, say } = K;

  /* ======================= Objets ======================= */
  K.spawnItem = (it, x, y, z, v) => {
    const o = { id: S.nextItem++, type: it.type, d: it.d || {}, x, y: y || 0, z, ry: rng() * 6, vx: 0, vy: 0, vz: 0, rest: !v, thr: null };
    if (v) { o.vx = v[0]; o.vy = v[1]; o.vz = v[2]; }
    S.items.push(o); Sim.dirty = true; return o;
  };
  K.strip = o => ({ type: o.type, d: o.d });
  /** Remet une soufflette sur son crochet (le tuyau la ramène) */
  K.hoseZone = p => U.inWorkshop(p) || (Math.abs(p.x) < 17 && p.z > 13 && p.z < 30);   // V5.3 : la soufflette va jusque dans la cour (taches devant la porte)
  K.hookBack = it => { const h = ML.LOC.hooks.find(x => x.type === 'soufflette' && x.h === ((it.d || {}).h || 0)) || ML.LOC.hooks.find(x => x.type === 'soufflette'); if (h) K.spawnItem({ type: 'soufflette', d: { h: h.h || 0 } }, h.x, h.y, h.z); };
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
  K.store = (P, type, key) => { let n = 0; P.inv.forEach((it, i) => { if (it && it.type === type) { P.inv[i] = null; n++; const k2 = it.d && it.d.oc ? key + '_oc' : key; S.stock[k2] = (S.stock[k2] || 0) + 1; } }); if (n) Sim.dirty = true; return n; };   // V6 : l'occasion se range à part
  /** Ouvre un colis : tout ce qu'il contient tombe par terre autour */
  K.openColis = (c, x, z) => {
    let n = 0;
    for (const k in c) for (let i = 0; i < c[k]; i++, n++) {
      const a = rng() * 6.283, r = 0.3 + rng() * 1.1;
      const oc = /_oc$/.test(k), b = k.replace(/_oc$/, '');
      K.spawnItem({ type: ML.MATERIALS[b] ? 'brut_' + b : b, d: oc ? { oc: 1 } : {} }, x + Math.cos(a) * 0.2, 0.9, z + Math.sin(a) * 0.2, [Math.cos(a) * r * 2.2, 2.5 + rng() * 2, Math.sin(a) * r * 2.2]);
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
  function genOrder(force, forceSize) {
    S.nOrders++;
    let types = new Set(Object.keys(S.machines).map(id => ML.MACHINES.find(m => m.id === id).type));
    if (!types.size) types = new Set(['tour', 'fraiseuse']);                    // V6 : pas encore de machine → les clients demandent de tout (achète !)
    const lv = K.lvl, kinds = ['plain', 'plain', 'plain'];
    if (lv >= 0.12 || S.day >= 2) kinds.push('tth');
    if (lv >= 0.28 || S.day >= 3) kinds.push('fonderie', 'chaudro');
    const kind = force || (S.nOrders <= 2 || (S.beginner && !S.tutoDone) ? 'plain' : rng.pick(kinds));
    const cls = K.clients(); if (!cls.length) return;
    const client = rng.pick(cls), cl = ML.LOC.comp[client], far = Math.hypot(cl.x, cl.z) > 200;
    // V5 : certains clients ont leurs propres pièces (Espacil : gonds, platines de boîtes aux lettres…)
    const own = kind === 'plain' && ML.PARTS[client] && (client === 'espacil' || rng() < 0.55) ? ML.PARTS[client].filter(x => types.has(x[2])) : [];   // V5.3 : chaque client a ses pièces
    const list = own.length ? own : ML.PARTS[kind].filter(x => types.has(x[2])); if (!list.length) return;
    const [part, mat, mtype, tool] = rng.pick(list);
    const steps = kind === 'plain' ? ['usinage', 'livraison'] : kind === 'tth' ? ['usinage', 'tth', 'livraison'] : [kind, 'usinage', 'livraison'];
    // V5.3 : les GROSSES pièces arrivent plus tôt (dès le jour 2, ou tout de suite à 3 joueurs et plus) : il faut alors le fenwick (PC) et le camion (garage)
    const veh = S.owned.includes('fenwick') && S.owned.includes('camion'), day = S.co.day || S.day || 1;
    const big = !S.beginner && S.mode !== 'inspection' && (veh || day >= 2 || S.n >= 3) && (veh || ![...S.orders, ...S.props].some(o => o.size === 'l'));
    const sr = rng(); let size = kind === 'plain' ? (sr < 0.28 ? 's' : sr < (veh ? 0.74 : 0.84) ? 'm' : 'l') : kind === 'chaudro' ? (sr < (veh ? 0.5 : 0.7) ? 'm' : 'l') : kind === 'tth' ? (sr < 0.5 ? 's' : 'm') : 'm';
    if (forceSize) size = forceSize; else if (size === 'l' && !big) size = 'm';
    const dur = (C.ORDER.base + C.ORDER.perStep * (steps.length - 2) + (far ? C.ORDER.far : 0)) * (K.H.dur || 1) * K.D.dur * (1.25 - 0.35 * lv) * (size === 'l' ? 1.3 : 1) * ML.ECO.playerTime[Math.min(4, Math.max(1, S.n)) - 1];
    const p = { id: S.nextOid++, client, part, mat, mtype, tool, steps, si: 0, size, src: kind === 'fonderie' || kind === 'chaudro' ? kind : null, dur, price: K.orderPrice(steps, size, far), exp: S.rt + ML.ECO.propLife };
    S.props.push(p); Sim.dirty = true;
    if (S.up.erp_auto && S.orders.length < K.maxActive()) { K.accept(p.id, null, true); return; }
    all(`📥 Nouvelle demande ${ML.on(p.id)} au PC : ${COMP[client].name}${size === 'l' ? ' (GROSSE pièce)' : size === 's' ? ' (petite)' : ''} · ${K.eur(p.price)}`, 'info'); sfx('order');
  }
  K.genOrder = genOrder;
  /** Accepter une demande : elle devient une commande (ticket) avec son délai */
  K.accept = (id, pid, auto) => {
    const i = S.props.findIndex(p => p.id === id); if (i < 0) return null;
    const p = S.props.splice(i, 1)[0];
    const o = Object.assign({}, p, { t0: S.rt, dl: S.rt + p.dur, q: false, m: null, plan: null }); delete o.exp;
    S.orders.push(o); Sim.dirty = true;
    const who = pid && S.pl[pid] ? ` (${S.pl[pid].name})` : auto ? ' (ERP+)' : '';
    all(`📋 Commande ${ML.on(o.id)} acceptée${who} — ${COMP[o.client].name}${o.size === 'l' ? ' (GROSSE pièce : fenwick + camion)' : o.size === 's' ? ' (petite)' : ''} · ${K.eur(o.price)}`, 'info'); sfx('order');
    if (o.size === 'l') { const miss = ['fenwick', 'camion'].filter(v => !S.owned.includes(v)); if (miss.length) all(`🏗 GROSSE pièce : il vous faut ${miss.map(v => v === 'fenwick' ? 'le FENWICK (PC → Atelier, ' + K.price(ML.CATALOG.fenwick.price, 'cat') + ' €)' : 'le CAMION plateau (Garage Pasquier, ' + K.price(ML.DEALER.camion.price, 'dealer') + ' €)').join(' et ')}.`, 'warn'); }
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
    all(`⏰ Commande ${ML.on(o.id)} (${COMP[o.client].name}) RATÉE : ${why || 'trop tard !'} (réputation −${o.client === 'part' ? ML.ECO.rep.partFail : ML.ECO.rep.fail})`, 'warn'); sfx('fail'); Sim.dirty = true;
    if (K.priv.traitor) K.priv.fails = (K.priv.fails || 0) + 1;
    for (const m of Sim.mods) if (m.onFail) m.onFail(o);
  };
  function updateOrders(dt) {
    if (S.mode === 'course') return;
    const n = Math.max(1, S.n);
    S.nextOrder -= dt;
    if (S.nextOrder <= 0 && S.rt < C.SHIFT_SEC - 60) {
      const busy = S.dayType === 'rush' ? 4 : S.dayType === 'pont' ? 3 : 2;
      if (S.props.length < (busy > 2 ? 4 : 3) && S.orders.length + S.props.length < K.maxActive() + busy) genOrder();
      const wave = 1 - 0.3 * Math.sin(S.rt / C.SHIFT_SEC * Math.PI * 4 - 0.6);          // deux « vagues » de commandes dans la journée
      S.nextOrder = C.ORDER.interval / (1 + 0.25 * (n - 1)) * (0.8 + rng() * 0.4) * (1.45 - 0.65 * K.lvl) * K.D.interval * wave;
    }
    for (const p of S.props.slice()) if (S.rt > p.exp) {
      S.props.splice(S.props.indexOf(p), 1); K.repAdd(-ML.ECO.rep.expire); Sim.dirty = true;
      all(`📭 Demande ${ML.on(p.id)} de ${COMP[p.client].name} expirée : personne ne l'a acceptée au PC (réputation −${ML.ECO.rep.expire}).`, 'warn');
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
      all(`❌ Caisse ${ML.on(o.id)} refusée : non conforme. Contrôlez au marbre avant de livrer !`, 'warn'); sfx('fail');
      return;
    }
    S.orders.splice(S.orders.indexOf(o), 1);
    const frac = Math.max(0, (o.dl - S.rt) / o.dur);
    let pay = Math.round(((o.price || 100) * (0.75 + 0.35 * frac) + (held.d.ctl ? ML.ECO.order.ctl : 0)) * (held.d.npc || 1));
    for (const m of Sim.mods) if (m.payMod) pay = m.payMod(pid, o, pay, n, comp);      // V6 : black, mauvais payeurs
    if (pay > 0) K.money(pay, 'ca', { pid, what: `${ML.on(o.id)} livrée à ${comp === 'part' ? ML.PEOPLE[o.who].name : COMP[comp].name}` }); S.served++; S.sat = Math.min(100, S.sat + (S.up.plantes ? 7 : 5));
    if (!o.blk) K.repAdd(comp === 'part' ? ML.ECO.rep.part : frac > 0.25 ? ML.ECO.rep.ok : ML.ECO.rep.late);
    if (n && pay > 0 && !o.blk) say(n, ML.line(n.id, 'merci', ML.LINES[n.id] || ['Merci !']));
    if (pay > 0) { big(`+${K.eur(pay)} · O ${o.id} livrée à ${comp === 'part' ? ML.PEOPLE[o.who].name : COMP[comp].name} !`, '#3ecf6e'); sfx('cash'); }
    for (const m of Sim.mods) if (m.onDeliver) m.onDeliver(pid, o);
  };

  /* ======================= Intentions ======================= */
  Sim.setPose = (pid, p) => {
    pose[pid] = Object.assign(pose[pid] || {}, p);
    const P = S && S.pl[pid];
    if (P && P.late !== undefined && !P.entered) { P.entered = true; P.late = S.rt; }   // il a cliqué sur « Jouer » au salon
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
      case 'hit': hit(pid, ps, String(m.id || ''), held); break;
      case 'tuto':                                                       // V5.3 : le tutoriel complet demande une commande précise (mécano-soudé, fonderie, TTH…)
        if (S.beginner && ['plain', 'chaudro', 'fonderie', 'tth'].includes(m.k) && S.props.length < 4) genOrder(m.k, 'm');
        if (S.beginner && m.k === 'done' && !S.tutoDone) { S.tutoDone = true; K.questT = 40; K.all('🎓 Tutoriel terminé ! Demain, ce sera une vraie journée (avec ses imprévus). En attente : un service à rendre arrive bientôt.', 'good'); }
        break;
      case 'rename': Sim.rename(pid, m.name); break;
      case 'eliott': {
        const n = npcs.eliott; if (!n.active || !near(ps, n.x, n.z, 7)) return;
        let succ = U.clamp(m.succ | 0, 0, 3); const mat = ['acier', 'alu', 'inox'].includes(m.mat) ? m.mat : 'acier', pr = K.price(ML.SUPPLY[mat].price, 'supply') * 3;
        succ = Math.min(succ, Math.max(0, Math.floor(S.money / pr)));
        if (succ) K.money(-pr * succ, 'achat', { pid, what: `${succ} caisse${succ > 1 ? 's' : ''} ${ML.MATERIALS[mat].label} chez Eliott` });
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
        say(n, comp === 'fonderie' ? `Je coule le brut de la ${ML.on(o.id)}. Repasse dans ${C.SUB_SEC} s !` : ML.line('nono'));
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
        // V6 : du NEUF d'abord ; s'il n'y en a plus, de l'OCCASION (moins sûr)
        if (S.stock[a] <= 0 && (S.stock[a + '_oc'] || 0) > 0) { if (K.give(pid, { type, d: { oc: 1 } }, sel)) { S.stock[a + '_oc']--; sfx('pickup', ps.x, ps.z); note(pid, `♻ Plus de neuf : tu prends ${kind === 'rack' ? 'une barre' : 'un outil'} d'OCCASION (risque de casse / de pièce non conforme).`, 'warn'); } return; }
        if (S.stock[a] <= 0) return note(pid, kind === 'rack' ? `Rupture de ${ML.MATERIALS[a].label} ! Commande au PC de gestion (ou chez Eliott).` : `Plus de ${ML.TOOLS[a].label.toLowerCase()} ! Commande au PC de gestion (ou chez Coco).`, 'warn');
        if (K.give(pid, { type, d: {} }, sel)) { S.stock[a]--; sfx('pickup', ps.x, ps.z); } return;
      }
      case 'coffee': { const sec = S.up.cafe_pro ? C.COFFEE.secPro : C.COFFEE.sec; P.coffee = S.rt + sec; if (K.v6Coffee) K.v6Coffee(P); note(pid, `☕ Un petit noir : tu vas BEAUCOUP plus vite pendant ${sec} s !`, 'good'); return; }
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
        if (K.give(pid, it, sel)) { K.removeItem(o); sfx('pickup', ps.x, ps.z); if (it.d && it.d.oid) K.by(S.orders.find(x => x.id === it.d.oid), pid); }
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
    if (M.stopped) {                                                  // V5.2 : arrêt d'urgence après l'explosion
      if (!S.power) return note(pid, `${mid} : d'abord remettre le courant (tableau électrique) !`, 'warn');
      M.stopped = false; Sim.dirty = true; sfx('success', def.x, def.z); return note(pid, `▶ ${mid} redémarrée.`, 'good');
    }
    if (!op) return note(pid, `${mid} n'a pas d'opérateur : embauche quelqu'un au PC de gestion (onglet RH).`, 'warn');
    if (!held) { if (op.state === 'pause' || op.state === 'forgot') K.wake(op, pid); return; }
    const t = IT.def(held);
    if (t.kind === 'kit') {                                             // V5.2 : kit du poste de préparation = brut + outil d'un coup
      if (M.job) return note(pid, `${mid} est occupée.`, 'warn');
      const o = S.orders.find(x => x.id === held.d.oid && stage(x) === 'usinage' && !x.m);
      if (!o) { P.inv[sel] = null; S.stock[held.d.mat] = (S.stock[held.d.mat] || 0) + 1; S.stock[held.d.tool] = (S.stock[held.d.tool] || 0) + 1; Sim.dirty = true; return note(pid, 'Plus de commande pour ce kit : brut et outil remis en stock.', 'warn'); }
      if (o.mtype !== def.type) return note(pid, `Le kit ${ML.on(o.id)} se fait sur une ${ML.MTYPE[o.mtype]}, pas sur ${mid} !`, 'warn');
      P.inv[sel] = null; o.m = mid; o.plan = null; o.kit = false; K.by(o, pid);
      const mg = m.mg === 'ok' ? 0.75 : 1, ocK = !!held.d.oc;
      M.job = { oid: o.id, tool: true, need: o.tool, prog: 0, total: C.PROD_SEC * mg * C.SIZE[o.size || 'm'].prod, wrong: (m.mg === 'fail' && rng() < 0.5) || (ocK && rng() < ML.ECO.occaz.wrong), ocB: ocK, ocT: ocK };
      if (m.mg === 'ok') K.stat(pid, 'origine');
      say(op, ML.line(M.op, 'lance', ['Un kit tout prêt ? Le grand luxe !', 'Brut ET outil, merci !', 'Ça tourne !']));
      sfx('drop', def.x, def.z); return;
    }
    if (t.kind === 'brut') {
      if (M.job) return note(pid, `${mid} est occupée.`, 'warn');
      let o;
      if (held.type === 'brut_sp') {
        o = S.orders.find(x => x.id === held.d.oid && stage(x) === 'usinage' && !x.m);
        if (!o) return note(pid, 'Ce brut ne correspond à aucune commande à usiner.', 'warn');
        if (o.mtype !== def.type) return note(pid, `La ${ML.on(o.id)} se fait sur une ${ML.MTYPE[o.mtype]}, pas sur ${mid} !`, 'warn');
      } else {
        const mat = t.mat, cand = S.orders.filter(x => stage(x) === 'usinage' && !x.src && !x.m && x.mat === mat);
        const fit = cand.filter(x => x.mtype === def.type);
        o = fit.filter(x => x.plan === mid).sort((p, q) => p.dl - q.dl)[0] || fit.filter(x => !x.plan).sort((p, q) => p.dl - q.dl)[0] || fit.sort((p, q) => p.dl - q.dl)[0];
        if (!o) return note(pid, cand.length ? `La commande ${ML.on(cand[0].id)} en ${ML.MATERIALS[mat].label} se fait sur une ${ML.MTYPE[cand[0].mtype]}, pas ici !` : `Aucune commande acceptée n'attend du ${ML.MATERIALS[mat].label} à usiner (regarde le PC).`, 'warn');
        if (o.plan && o.plan !== mid) note(pid, `(La ${ML.on(o.id)} était prévue sur ${o.plan} au PC, mais ${mid} s'en charge.)`);
      }
      P.inv[sel] = null; o.m = mid; o.plan = null; K.by(o, pid);
      const mg = m.mg === 'ok' ? 0.75 : 1;           // prise d'origine réussie : usinage plus rapide
      M.job = { oid: o.id, tool: false, need: o.tool, prog: 0, total: C.PROD_SEC * (o.src ? 1.25 : 1) * mg * C.SIZE[o.size || 'm'].prod, wrong: (m.mg === 'fail' && rng() < 0.5) || (!!held.d.oc && rng() < ML.ECO.occaz.wrong), ocB: !!held.d.oc };
      if (m.mg === 'ok') K.stat(pid, 'origine');
      say(op, `${ML.on(o.id)} : il me faut ${o.tool === 'fraise' ? 'une fraise' : o.tool === 'foret' ? 'un foret' : 'une plaquette'} !`);
      sfx('drop', def.x, def.z); return;
    }
    if (t.kind === 'tool') {
      if (!M.job) return note(pid, `Donne d'abord un brut à ${mid}.`, 'warn');
      if (M.job.tool) return note(pid, `${mid} a déjà son outil.`, 'warn');
      if (t.tool !== M.job.need) {
        if (M.op !== 'marius') return say(op, `C'est pas le bon outil ! Il me faut : ${ML.TOOLS[M.job.need].label}.`);
        M.job.wrong = true;
      }
      P.inv[sel] = null; M.job.tool = true; M.job.ocT = !!held.d.oc; K.by(S.orders.find(o => o.id === M.job.oid), pid);
      say(op, ML.line(M.op, 'lance', M.op === 'marius' ? 'Reçu. Exécution.' : ["C'est parti !", 'Nickel, je lance.', 'Ça tourne !']));
      return;
    }
    if (held.type === 'viennoiseries' && M.op === 'matis') return feedMatis(pid, P, sel, op);
    note(pid, 'Ça ne sert à rien sur une machine.', 'warn');
  }
  function feedMatis(pid, P, sel, op) {
    P.inv[sel] = null; op.hunger = 0; S.buffs.matis = S.rt + 90;
    if (op.state !== 'work') K.backToWork(op);
    say(op, ML.line('matis', 'miam', 'MIAM ! Je suis une machine maintenant !')); all(`🥐 ${P.name} a nourri Matis : +40 % pendant 90 s.`, 'good');
  }

  function npcUse(pid, P, ps, sel, held, id) {
    const n = npcs[id]; if (!n || !n.active || !near(ps, n.x, n.z, 4.5)) return;
    for (const mod of Sim.mods) if (mod.npcUse && mod.npcUse(pid, P, ps, sel, held, n)) return;
    if (ML.PEOPLE[id].op) {
      if (n.state === 'pause' || n.state === 'forgot') return K.wake(n, pid);
      if (held && held.type === 'viennoiseries' && id === 'matis') return feedMatis(pid, P, sel, n);
      if (held && n.mid) return machineUse(pid, P, sel, held, n.mid, {});
      return say(n, ML.line(id, null, 'Oui ?'));
    }
    if (id === 'lebec') return say(n, ML.line('lebec'));
    const comp = n.comp, C2 = comp && COMP[comp]; if (!C2) return;
    switch (C2.kind) {
      case 'boulangerie': if (K.give(pid, { type: 'viennoiseries', d: {} }, sel)) say(n, "Tiens mon grand, c'est la maison qui offre !"); return;
      case 'station': if (K.give(pid, { type: 'jerrican', d: {} }, sel)) say(n, 'Un jerrican, cadeau. Ramène-le pas, je m\'en fiche.'); return;
      case 'tth': {
        if (!K.isPart(held)) return say(n, ML.line('maurseau'));
        const o = S.orders.find(x => x.id === held.d.oid);
        if (!o || stage(o) !== 'tth') return say(n, "Celle-là, elle n'a pas besoin de traitement thermique !");
        if (!K.spend(pid, ML.ECO.sub.tth, 'achat', 'le traitement thermique')) return say(n, 'Pas payé, pas chauffé ! WOUHOU quand même.');
        P.inv[sel] = null; o.q = true; S.subs.tth.push({ oid: o.id, end: S.rt + C.SUB_SEC, nc: !!held.d.nc, mes: held.d.mes, type: held.type });
        return say(n, `Au four la ${ML.on(o.id)} ! ${ML.ECO.sub.tth} €. Reviens dans ${C.SUB_SEC} s, WOUHOU !`);
      }
      case 'client': case 'concurrent': if (K.isPart(held)) return deliver(pid, P, sel, held, comp, n); return say(n, ML.line(id, null, 'Bonjour !'));
      default: return say(n, ML.line(id, null, 'Oui ?'));
    }
  }

  /* ======================= Coups, Lebec, trouvailles ======================= */
  function hit(pid, ps, id, held) {
    const [kind, a] = id.split(':'), W = IT.weapon(held), reach = W ? W.reach + 0.8 : 3;     // V5.2 : armes du centre commercial
    K.hitWith = held ? held.type : null;                                // V6 : avec quoi on frappe (grande clé, batte…)
    if (kind === 'npc') { const n = npcs[a]; if (n && n.active && near(ps, n.x, n.z, reach)) { K.npcHit(n, pid); if (W) { n.stun = Math.max(n.stun, W.stun * 0.6); const dx = n.x - ps.x, dz = n.z - ps.z, d = Math.hypot(dx, dz) || 1; n.x += dx / d * W.push * 0.15; n.z += dz / d * W.push * 0.15; U.resolveCircle(n, 0.3); } } }
    else if (kind === 'pl') {
      const tp = pose[a]; if (S.pl[a] && K.foot(S.pl[a]) && tp && near(ps, tp.x, tp.z, reach)) {
        K.playerHit(a, pid, W ? W.stun : 1.2);
        if (W) { const dx = tp.x - ps.x, dz = tp.z - ps.z, d = Math.hypot(dx, dz) || 1; ev.push({ e: 'push', to: a, vx: dx / d * W.push, vz: dz / d * W.push, by: pid }); if (held.type === 'poisson') sfx('couic', tp.x, tp.z); }
      }
    }
    for (const mod of Sim.mods) if (mod.onHit) mod.onHit(pid, kind, a);
  }
  K.npcHit = (n, by) => {
    if (n.stun > 0.3) return;
    n.stun = 0.7; sfx('punch', n.x, n.z);
    const ps = pose[by]; if (ps) { const dx = n.x - ps.x, dz = n.z - ps.z, d = Math.hypot(dx, dz) || 1; n.x += dx / d * 0.6; n.z += dz / d * 0.6; U.resolveCircle(n, 0.3); }
    for (const mod of Sim.mods) if (mod.npcHit && mod.npcHit(n, by)) return;
    if (n.id === 'lebec') { say(n, ML.line('lebec', 'frappe', "TU M'AS FRAPPÉ ?! COUP DE PELLE !!!"), true); S.anger = 100; K.stat(by, 'slap_lebec'); K.startChase(by); return; }
    if (ML.PEOPLE[n.id].op && ['pause', 'toPause', 'forgot', 'rant'].includes(n.state)) { K.backToWork(n); say(n, ML.line(n.id, 'claque', "Aïe ! OK OK, j'y retourne !")); }
    else say(n, ML.line(n.id, 'claque', ['Aïe !', 'Hé ! Ça va pas ?!', 'Ouille !']));
    // V5.3 : Lebec ne punit que les claques aux gens de l'atelier (pas aux intrus : Johan, Lean Manufacturing, Hervé, Mathieu, visiteurs…)
    if (!ML.PEOPLE[n.id].visitor) K.witness(by, n.x, n.z);
    else if (npcs.lebec.active && Math.hypot(npcs.lebec.x - n.x, npcs.lebec.z - n.z) < 15 && rng() < 0.4) say(npcs.lebec, ['Bien fait !', 'Allez, dehors !', 'Ça, je l\'ai pas vu.'][Math.floor(rng() * 3)]);
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
    say(L, ML.line('lebec', 'colere', "JE T'AI VU ! ON NE FRAPPE PAS LES COLLÈGUES !"));
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
      case 'pied_coulisse': K.bonus(120, 'Pied à coulisse revendu', pid); break;
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
    if (forgot || rng() < chance) { K.backToWork(n); say(n, ML.line(n.id, 'reveil', forgot ? 'Ah ouiii ! Merci.' : ["Ouais ouais, j'y vais...", "Bon. D'accord."])); }
    else { say(n, ML.line(n.id, 'refus', ['Encore cinq minutes...', 'Nan.', "J'arrive... (il n'arrive pas)"])); note(pid, 'Il ne bouge pas. Une claque (clic gauche) marcherait mieux...'); }
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
        // il parle tout seul de temps en temps (répliques de persos.js)
        n.chatT = (n.chatT === undefined ? 15 + rng() * 40 : n.chatT) - dt;
        if (n.chatT <= 0) { n.chatT = 50 + rng() * 60; if (!(n.tmpT > 0)) say(n, ML.line(n.id)); }
        // un seul opérateur pour plusieurs machines : il va là où il y a du travail
        if (n.mids && n.mids.length > 1 && !busy(n.mid) && !n.path.length) {
          const other = n.mids.find(x => x !== n.mid && busy(x));
          if (other) { n.mid = other; n.home = ML.World.machines[other].station; if (rng() < 0.3) say(n, `J'file sur ${other} !`); }
        }
        if (!K.atHome(n)) { if (!n.path.length) K.walkTo(n, n.home.x, n.home.z, null, n.mids && n.mids.length > 1); break; }
        n.faceYaw = n.home.yaw;
        const lazy = op.lazy * 0.7 * (S.up.babyfoot ? 0.7 : 1);
        if (lazy > 0 && rng() < lazy * 0.012 * dt * (M.job ? 1 : 1.5)) {
          if (op.traits.includes('deadstop')) { n.state = 'pause'; n.pauseT = 35 + rng() * 30; say(n, ML.line(n.id, 'pause', 'Flemme.')); }
          else { const sp = U.pick(ML.LOC.coffee); n.state = 'toPause'; K.walkTo(n, sp.x, sp.z, () => { n.state = 'pause'; n.pauseT = (18 + rng() * 20) * (S.up.babyfoot ? 0.6 : 1); }); say(n, ML.line(n.id, 'pause', 'Petite pause café...')); }
        }
        if (op.traits.includes('forgetful') && M.job && M.job.tool && rng() < 0.006 * dt) { n.state = 'forgot'; say(n, "Euh... j'usinais quoi déjà ?"); }
        break;
      }
      case 'pause': n.pauseT -= dt; if (n.pauseT <= 0) { K.backToWork(n); say(n, ML.line(n.id, 'retour', "Bon, j'y retourne.")); } break;
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
      if (n.shoutT <= 0) { n.shoutT = 3.5; say(n, ML.line('lebec', 'poursuite', 'COUP DE PELLE !'), true); }
      if (K.foot(P) && Math.hypot(n.x - tp.x, n.z - tp.z) < C.LEBEC.reach) { coupDePelle(S.chase); n.state = 'patrol'; K.stop(n); say(n, ML.line('lebec', 'pelle', 'La pelle a parlé.')); return; }
      if (!K.foot(P) || n.chaseT > 22 || (!U.inWorkshop(tp) && Math.hypot(n.x - tp.x, n.z - tp.z) > 30)) {
        S.chase = null; n.state = 'patrol'; K.stop(n); say(n, ML.line('lebec', 'abandon', 'Tu perds rien pour attendre, toi !')); S.anger = Math.max(C.LEBEC.base, S.anger - 25);
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
        if (best) { best.state = 'rant'; best.pauseT = 10; say(n, ML.line('lebec', 'tirades'), true); return; }
      }
      say(n, ML.line('lebec'));
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
    if (q && q.length) return `🔥 ${ML.on(q[0].oid)} : ${Math.ceil(q[0].end - S.rt)} s`;
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
      const fl = ML.gy(o.x, o.z);
      if (o.y <= fl) { o.y = fl; if (Math.abs(o.vy) > 2.5) o.vy *= -0.3; else o.vy = 0; o.vx *= 0.55; o.vz *= 0.55; if (o.vx * o.vx + o.vz * o.vz + o.vy * o.vy < 0.05) { o.rest = true; o.thr = null; Sim.dirty = true; } }
    }
  }

  /* ======================= Boucle ======================= */
  Sim.step = dt => {
    if (S.over) return;
    if (S.voting) { S.rt += dt; for (const m of Sim.mods) if (m.voteStep) m.voteStep(dt); return; }
    S.rt += dt * (S.beginner && !S.tutoDone ? 0.5 : 1);                 // V5.3 : mode débutant : le temps passe 2× moins vite pendant le tutoriel
    updateOrders(dt);
    for (const def of ML.MACHINES) {
      const M = S.machines[def.id]; if (!M) continue;
      const op = M.op ? npcs[M.op] : null, prev = M.status;
      if (!S.power) M.status = 'off';
      else if (M.stopped) M.status = 'arret';                        // V5.2 : arrêt d'urgence (Bleuenn) → E pour redémarrer
      else if (!op) M.status = 'noop';
      else if (M.broken) M.status = 'panne';
      else if (M.bin === false || M.chips >= 100) M.status = 'bac';
      else if (!M.job) M.status = 'idle';
      else if (!M.job.tool) M.status = M.worn ? 'usure' : 'wait';
      else {
        const k = op.mid === def.id ? K.workMult(op) : 0;
        if (k > 0) { M.job.prog += dt * k * (ML.MMODELS[M.mo || 'std'] || ML.MMODELS.std).speed; M.status = 'run'; } else M.status = 'stop';   // V6 : vitesse selon la gamme
        if (M.job.prog >= M.job.total) {
          const o = S.orders.find(x => x.id === M.job.oid), [x, z] = K.expeditionSpot();
          if (o) {
            o.m = null; o.si++;
            const nc = M.job.wrong, cote = U.pick(ML.COTES), dev = nc ? cote[2] * (1.6 + rng()) * (rng() < 0.5 ? -1 : 1) : cote[2] * (rng() * 1.6 - 0.8);
            const d = { oid: o.id, nc: nc || undefined, mes: [cote[0], cote[1], cote[2], Math.round((cote[1] + dev) * 1000) / 1000] }; if (o.blk) d.blk = 1;   // V6 : caisse au black
            if (o.size === 'l') { const [bx, bz] = K.bigSpot(); K.spawnItem({ type: 'palette', d }, bx, 0, bz); all(`✔ ${def.id} a fini la GROSSE pièce ${ML.on(o.id)} → palette au QUAI GROS COLIS (fenwick !).`, 'good'); }
            else { K.spawnItem({ type: o.size === 's' ? 'piece' : 'caisse', d }, x, 1.2, z, [0, 0, 0]); all(`✔ ${def.id} a fini la ${ML.on(o.id)} → ${o.size === 's' ? 'petite pièce' : 'caisse'} en EXPÉDITION${stage(o) === 'tth' ? ' (à traiter chez TTH Ouest)' : ''}.`, 'good'); }
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
      all(k === 'tth' ? `🔥 Caisse ${ML.on(o.id)} traitée : à récupérer chez TTH Ouest.` : `🧱 Brut de la ${ML.on(o.id)} prêt sur le quai de ${COMP[k].name}.`, 'good');
      Sim.dirty = true;
    }
    for (const id in npcs) updateNpc(npcs[id], dt);
    updateItems(dt);
    for (const pid in S.pl) if (S.pl[pid].stun && S.pl[pid].stun < S.rt) S.pl[pid].stun = 0;
    // V5 : la météo change pendant la journée
    if (S.rt > S.wxNext && S.mode !== 'course') {
      const W0 = ML.WEATHER[S.weather] || ML.WEATHER.beau, nx = K.wpick(W0.next); S.wxNext = S.rt + 70 + rng() * 80;
      if (nx !== S.weather) { S.weather = nx; ev.push({ e: 'wx', w: nx }); Sim.dirty = true; if (ML.WEATHER[nx].wet && !S.up.isolation && K.addPuddle) K.addPuddle(-8 + rng() * 16, 16 + rng() * 6); }
    }
    // V5 : les soufflettes sont reliées à l'air comprimé : impossible de sortir de l'atelier avec
    for (const pid in S.pl) {
      const P = S.pl[pid], ps = pose[pid]; if (!ps) continue;
      P.inv.forEach((it, i) => {
        if (!it || it.type !== 'soufflette') return;
        const R = ML.LOC.reels[(it.d || {}).h || 0] || ML.LOC.reels[0], far = Math.hypot(ps.x - R.x, ps.z - R.z) > ML.LOC.hoseLen;
        if ((P.car === null && P.ride == null && K.hoseZone(ps) && !far)) return;
        P.inv[i] = null; K.hookBack(it); Sim.dirty = true;
        note(pid, '🌀 Le tuyau d\'air est au bout : la soufflette te glisse des mains et retourne à son enrouleur !', 'warn'); sfx('whoosh', ps.x, ps.z);
      });
    }
    for (const o of S.items) if (o.type === 'soufflette' && o.rest && !K.hoseZone(o)) { K.removeItem(o); K.hookBack(o); break; }
    for (const m of Sim.mods) if (m.step) m.step(dt);
    if (S.rt >= C.SHIFT_SEC && S.mode !== 'course' && !(S.beginner && !S.tutoDone && S.rt < C.SHIFT_SEC * 1.5)) K.end();     // V5.3 : pas de fin de journée en plein tutoriel
  };
  K.salaries = () => S.staff.reduce((a, id) => a + (ML.STAFF[id] ? ML.STAFF[id].pay : 0), 0) + Object.keys(ML.AI_STAFF).reduce((a, k) => a + (S.ai[k] ? ML.AI_STAFF[k].pay : 0), 0);
  K.end = extra => {
    if (S.over || S.voting) return;
    S.over = true; Sim.dirty = true;
    const race = S.mode === 'course';
    if (!race) {
      const sal = K.salaries(); S.money -= sal; S.today.salaires = sal; if (sal) K.led(-sal, 'salaires', { what: 'Salaires du personnel' });
      const abo = Object.keys(ML.CATALOG).reduce((a, k) => a + (ML.CATALOG[k].daily && S.up[k] ? ML.CATALOG[k].daily : 0), 0); S.money -= abo; S.today.abos = abo; if (abo) K.led(-abo, 'abos', { what: 'Abonnements' });
    }
    const T = S.today, profit = T.ca + T.bonus - T.achat - T.amende - T.salaires - (T.abos || 0);
    const k = (1 + 0.35 * (Math.max(1, S.n) - 1)) * K.D.stars * (0.6 + 0.2 * Object.keys(S.machines).length), need = ML.ECO.stars.map(v => Math.round(v * k / 10) * 10);
    const stars = race ? 0 : profit >= need[2] ? 3 : profit >= need[1] ? 2 : profit >= need[0] ? 1 : 0;
    if (S.money >= 10000) for (const p in S.pl) K.stat(p, 'rich');
    if (Object.keys(S.machines).length >= 6) for (const p in S.pl) K.stat(p, 'full');
    if (S.nParts >= 3) for (const p in S.pl) K.stat(p, 'part3');
    const res = Object.assign({ mode: S.mode, diff: S.diff, day: S.day, score: race ? S.score : Math.max(0, Math.round(profit / 4)), served: S.served, failed: S.failed, stars, finds: S.finds.got, findsTotal: S.finds.total, sat: Math.round(S.sat), need,
      money: S.money, profit, today: Object.assign({}, T), spent: JSON.parse(JSON.stringify(S.spent)), rep: S.rep, rep0: S.rep0, campaign: S.campaign, co: S.co, snap: Sim.companySnap(), bankrupt: !race && S.mode !== 'inspection' && S.money < ML.ECO.bankrupt }, extra || {});
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
  Sim.companySnap = () => S && ({ money: Math.round(S.money), rep: S.rep, mach: ML.MACHINE_ORDER.filter(id => S.machines[id]), mo: Object.fromEntries(Object.keys(S.machines).map(id => [id, S.machines[id].mo || 'std'])), staff: S.staff.slice(), ai: Object.assign({}, S.ai), veh: S.owned.slice(), up: Object.assign({}, S.up), stock: Object.assign({}, S.stock),
    mess: K.messSnap(), histDay: { d: S.co.day || S.day, p: Object.values(S.spent).map(v => [v.name, v.amende, v.achat, v.invest, v.autre]) }, wc: Math.round(S.wc || 0) });
  /* ======================= V5 : ce qui reste d'un jour à l'autre =======================
     Les commandes en cours (avec le temps qui leur restait), le travail sur les machines,
     les livraisons et la sous-traitance en route, et TOUT LE BAZAR : objets par terre,
     dans les mains (posés là où on était), dans les bennes, bacs à copeaux, flaques. */
  const r2s = v => Math.round(v * 100) / 100, NOKEEP = ['find', 'extincteur', 'cle', 'soufflette', 'casque', 'convention', 'meuleuse', 'carton', 'cles_trit'];
  K.messSnap = () => {
    const keepOrd = S.orders.filter(o => o.client !== 'part' && o.client !== 'sae'), ids = new Set(keepOrd.map(o => o.id));
    const keepIt = it => it && !NOKEEP.includes(it.type) && (!it.d || it.d.oid === undefined || ids.has(it.d.oid));
    const it = S.items.filter(keepIt).map(o => [o.type, o.d, r2s(o.x), r2s(o.rest ? o.y : ML.gy(o.x, o.z)), r2s(o.z)]);
    for (const pid in S.pl) { const P = S.pl[pid], ps = pose[pid] || { x: 8, z: 2 }; P.inv.forEach((x, i) => { if (keepIt(x)) it.push([x.type, x.d, r2s(ps.x + i * 0.4), r2s(ML.gy(ps.x, ps.z)), r2s(ps.z)]); }); }
    const beds = {}; for (const c of S.cars) if (c.bed.length) beds[c.kind] = c.bed.filter(keepIt).map(x => [x.type, x.d]);
    return {
      it: it.slice(0, 150), beds,
      ord: keepOrd.slice(0, 14).map(o => ({ id: o.id, client: o.client, part: o.part, mat: o.mat, mtype: o.mtype, tool: o.tool, steps: o.steps, si: o.si, size: o.size, src: o.src, dur: Math.round(o.dur), price: o.price, left: Math.max(0, Math.round(o.dl - S.rt)), plan: o.plan || null, q: !!o.q })),
      jobs: Object.keys(S.machines).filter(id => S.machines[id].job && ids.has(S.machines[id].job.oid)).map(id => { const j = S.machines[id].job; return [id, j.oid, j.need, j.tool ? 1 : 0, r2s(j.prog), r2s(j.total), j.wrong ? 1 : 0]; }),
      mach: Object.fromEntries(Object.keys(S.machines).map(id => { const M = S.machines[id]; return [id, [Math.round(M.chips || 0), M.bin === false ? 0 : 1, M.broken ? 1 : 0, Math.round(M.wear || 0)]]; })),
      deliv: S.deliv.filter(d => !d.oid || ids.has(d.oid)).slice(0, 20).map(d => Object.assign({}, d, { eta: Math.max(5, Math.round(d.eta - S.rt)) })),
      subs: Object.keys(S.subs).flatMap(k => S.subs[k].filter(j => ids.has(j.oid)).map(j => Object.assign({ k }, j, { end: Math.max(5, Math.round(j.end - S.rt)) }))),
      pud: (S.puddles || []).map(q => [q.x, q.z, r2s(q.r)])
    };
  };
  K.restore = M => {
    try {
      let maxId = 0;
      for (const o of M.ord || []) {
        if (!COMP[o.client] || !Array.isArray(o.steps)) continue;
        const ord = Object.assign({}, o, { t0: 0, dl: (o.left || 0) + 60, m: null, plan: o.plan && S.machines[o.plan] ? o.plan : null, q: !!o.q }); delete ord.left;
        S.orders.push(ord); maxId = Math.max(maxId, o.id);
      }
      S.nextOid = Math.max(S.nextOid, maxId + 1);
      for (const [mid, oid, need, tool, prog, total, wrong] of M.jobs || []) {
        const Mm = S.machines[mid], o = S.orders.find(x => x.id === oid); if (!Mm || !o) continue;
        Mm.job = { oid, need, tool: !!tool, prog, total, wrong: !!wrong }; o.m = mid;
      }
      for (const id in M.mach || {}) { const Mm = S.machines[id], v = M.mach[id]; if (!Mm) continue; Mm.chips = v[0]; Mm.bin = !!v[1]; Mm.broken = !!v[2]; Mm.wear = v[3]; }
      for (const [type, d, x, y, z] of M.it || []) if (IT.TYPES[type]) K.spawnItem({ type, d: d || {} }, x, y, z);
      for (const kind in M.beds || {}) { const c = S.cars.find(c2 => c2.kind === kind); if (c) for (const [type, d] of M.beds[kind]) if (IT.TYPES[type] && K.bedFree(c) > 0) c.bed.push({ type, d: d || {} }); }
      for (const d of M.deliv || []) S.deliv.push(Object.assign({}, d, { eta: S.rt + d.eta, id: S.nextId++ }));
      for (const j of M.subs || []) if (S.subs[j.k]) { const o = Object.assign({}, j, { end: S.rt + j.end }); delete o.k; S.subs[j.k].push(o); }
      if (M.pud && M.pud.length) S.puddles = M.pud.slice(0, 8).map(([x, z, r], i) => ({ id: 900 + i, x, z, r, t: 0 }));
      const n = (M.ord || []).length, m2 = (M.it || []).length;
      if (n || m2) all(`🌅 Comme hier soir : ${n} commande${n > 1 ? 's' : ''} en cours${m2 ? `, et ${m2} objet${m2 > 1 ? 's' : ''} qui traîne${m2 > 1 ? 'nt' : ''} encore (le bazar d'hier : rangez !)` : ''}.`, 'info');
    } catch (e) { console.warn('restore', e); }
    Sim.dirty = true;
  };
  /** Un joueur rejoint en cours de partie (drop-in) */
  Sim.addPlayer = (p, role) => {
    if (!S || S.pl[p.id]) return;
    S.pl[p.id] = { name: p.name, idx: p.idx, inv: [null, null, null], car: null, ride: null, stun: 0, coffee: 0, hp: C.HP.max, ko: false, role: ML.ROLES[role] ? role : 'poly', late: S.rt };
    S.n = Object.keys(S.pl).length; Sim.dirty = true;
    all(`👋 ${p.name} rejoint l'atelier en cours de journée !`, 'good');
  };
  Sim.setRole = (pid, role) => { const P = S && S.pl[pid]; if (P && P.late !== undefined && (!P.entered || S.rt - P.late < 20) && ML.ROLES[role]) { P.role = role; Sim.dirty = true; } };
  /** V5 : changer de pseudo en cours de partie */
  Sim.rename = (pid, name) => { const P = S && S.pl[pid]; name = String(name || '').replace(/[<>&"`]/g, '').trim().slice(0, 16); if (!P || !name || name === P.name) return; all(`✏ ${P.name} s'appelle maintenant ${name}.`, 'info'); P.name = name; Sim.dirty = true; };
  Sim.removePlayer = pid => {
    const P = S && S.pl[pid]; if (!P) return;
    K.dropAll(pid, 1);
    for (const c of S.cars) { if (c.dr === pid) c.dr = null; c.pass = (c.pass || []).filter(x => x.pid !== pid); }
    delete S.pl[pid]; delete pose[pid]; if (S.chase === pid) S.chase = null;
    S.n = Object.keys(S.pl).length; Sim.dirty = true;
  };
})();
