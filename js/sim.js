/* =====================================================================
   sim.js — SIMULATION DE L'HÔTE (cœur). Seul l'hôte l'exécute.
   Il décide de tout ce qui est commun et diffuse l'état. Les modules
   sim_chaos.js, sim_city.js et sim_events.js se branchent sur ce cœur via
   Sim.mods (init / step / use / act / fast) et partagent l'outillage K.
   ===================================================================== */
(function () {
  const Sim = ML.Sim = { mods: [] };
  const K = Sim.K = {};                       // outillage partagé entre modules
  const U = ML.U, C = ML.CFG, IT = ML.Items, COMP = ML.COMPANIES;
  let S, npcs, ev, pose, rng;
  const stage = o => o.steps[o.si];
  K.stage = stage;

  /* ======================= Gammes d'usinage (routings) =======================
     o.ops = ids de ML.OPS dans l'ordre ; chaque op = une étape 'usinage' de o.steps.
     L'op en cours se DÉDUIT de o.si (nombre d'étapes 'usinage' déjà passées) : les
     remises à zéro externes (o.si = indexOf('usinage')) restent donc valables.
     o.mtype / o.tool = machine et outil de l'op en cours (resynchronisés à chaque pas). */
  const RT = ML.Routing, OPS = ML.OPS;
  K.opIdx = o => { let n = 0; for (let i = 0; i < o.si && i < o.steps.length; i++) if (o.steps[i] === 'usinage') n++; return n; };
  K.curOp = o => (o.ops && stage(o) === 'usinage' ? o.ops[Math.min(o.ops.length - 1, K.opIdx(o))] : null);
  /** Machine MANUELLE (carrière, tier ≤ 1) : l'ouvrier seul est lent, un joueur peut prendre les commandes */
  const isManual = def => !!def && def.tier !== undefined && def.tier !== null && def.tier <= 1;
  K.isManual = isManual;
  const defOf = mid => (S.machDefs && S.machDefs.find(x => x.id === mid)) || ML.MACHINES.find(x => x.id === mid);
  function syncOrder(o) { const id = K.curOp(o), op = id && OPS[id]; if (op) { o.mtype = op.mt; o.tool = op.tool; } o.oi = K.opIdx(o); }
  K.syncOrder = syncOrder;
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  /** Fiche de cote pour le marbre : l'écart dépend de la qualité (hors tolérance si rebut) */
  function mkMes(q, nc) {
    const c = U.pick(ML.COTES), f = nc ? 1.3 + rng() * 1.2 : U.clamp((100 - q) / 60, 0.05, 0.95) * (0.7 + rng() * 0.3);
    return [c[0], c[1], c[2], Math.round((c[1] + c[2] * f * (rng() < 0.5 ? -1 : 1)) * 1000) / 1000];
  }
  /** Place libre au sol à côté d'une machine (pour poser l'en-cours) */
  function machineSpot(mid) {
    const W = ML.World.machines[mid], st = W && W.station; if (!st) return K.expeditionSpot();
    for (const r of [1.1, 1.8, 2.5]) for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + (st.yaw || 0), x = st.x + Math.sin(a) * r, z = st.z + Math.cos(a) * r;
      if (!U.inCollider(x, z, 0.3) && !S.items.some(o => Math.hypot(o.x - x, o.z - z) < 0.6)) return [x, z];
    }
    return K.expeditionSpot();
  }
  /** Remet la gamme d'une commande au début (rebut) */
  function restartOrder(o) { if (!o) return; o.si = o.steps.indexOf(o.src || 'usinage'); o.m = null; o.q = false; o.qe = null; o.qc = null; syncOrder(o); }
  K.restartOrder = restartOrder;
  const xpOf = id => { const w = S.car && S.car.workers && S.car.workers.find(x => (x.legend || 'w_' + x.uid) === id); return w ? w.xp || 0 : 0; };
  /** QUALITÉ d'une opération (0–100) : machine, ouvrier ou pilote, réglage, usure, matière, un peu de hasard */
  function opQuality(def, M, j, op, o) {
    const mu = ML.MAT_USIN[o.mat] || {};
    let q = 72 * (def.quality || 1);
    if (j.pil.length) q += (avg(j.pil) - 60) * 0.45;                              // un joueur aux commandes : son score compte
    else {
      if (op) {
        const P0 = ML.PEOPLE[op.id], sp = P0 && P0.op ? P0.op.speed : 1;
        q += U.clamp((sp - 0.9) * 15, -6, 5);
        if (K.trait(op.id, 'robot')) q += 3;
        if (K.trait(op.id, 'apprenti')) q += -4 + Math.min(4, xpOf(op.id) * 0.5);
      }
      if (j.man) q -= 8;                                                           // manuelle sans pilote : ça tremble
    }
    if (j.setup !== null && j.setup !== undefined) q += (j.setup - 60) * 0.25;    // réglage / prise d'origine
    q -= Math.max(0, (M.wear || 0) - 60) * 0.25;                                   // outil fatigué
    q += mu.q || 0;
    q += (rng() - 0.5) * 14;
    if (j.wrong) q = Math.min(q, 25);
    return Math.round(U.clamp(q, 0, 100));
  }

  /* Module « production » enregistré EN PREMIER : contrôle au marbre (qualité, rebut) et benne à rebuts */
  const prod = {}; Sim.mods.push(prod);
  prod.use = (pid, P, ps, sel, held, kind, a, b, m) => {
    if (kind === 'marbre' && held && (K.isPart(held) || held.type === 'encours') && m && m.ctl !== undefined) {
      const d = held.d || {}, nc = !!d.nc, saidOk = !!m.ctl, o = S.orders.find(x => x.id === d.oid);
      const q = d.q !== undefined ? d.q : d.qs && d.qs.length ? Math.round(avg(d.qs)) : null, g = RT.grade(q);
      const scrap = () => { P.inv[sel] = { type: 'rebut', d: { oid: d.oid, mat: o ? o.mat : d.mat || 'acier' } }; restartOrder(o); };
      if (saidOk === !nc) {
        if (nc) { scrap(); all(`📏 ${P.name} a détecté une pièce NON CONFORME (#${d.oid}) : REBUT → à jeter dans la BENNE. La gamme repart à zéro (nouveau brut).`, 'good'); }
        else {
          d.ctl = true; if (o && q !== null) o.qc = q;
          note(pid, `📏 Contrôle OK : ${g.s} ${g.w}${q !== null ? ` (${q}/100)` : ''}` + (g.k === 'lim' ? ' — limite : le client paiera moins.' : g.k === 'top' ? " — du travail d'horloger !" : ''), 'good');
        }
      } else if (!nc) { scrap(); all(`📏 ${P.name} a mis au rebut une pièce… qui était BONNE ! (#${d.oid} à refaire)`, 'warn'); }
      else note(pid, "📏 Hmm… tu es sûr·e ? (elle a l'air un peu hors tolérance)", 'warn');
      Sim.dirty = true; return true;
    }
    if (kind === 'benne' && held && held.type === 'rebut') {
      P.inv[sel] = null; Sim.dirty = true; sfx('clang', ps.x, ps.z);
      if (S.car && K.money && ML.CAREER) {
        const sp = ML.CAREER.SUPPLY[held.d.mat], r = Math.round((sp ? sp.price : 60) * 0.4);
        K.money(r, `♻ Rebut #${held.d.oid} revendu au ferrailleur`, 'vente', P.name); note(pid, `♻ Rebut à la benne : +${r} € de ferraille (40 % de la matière).`, 'good');
      } else { S.score += 2; note(pid, '♻ Rebut à la benne : +2 (le ferrailleur dit merci).', 'good'); }
      return true;
    }
    return false;
  };

  /* ======================= Initialisation ======================= */
  Sim.init = cfg => {
    rng = K.rng = U.rng(cfg.seed);
    const g = cfg.game || {}, up = g.upgrades || {};
    const humeurs = Object.keys(ML.HUMEURS), wr = rng();
    const weather = wr < ML.WEATHER.beau.p ? 'beau' : wr < ML.WEATHER.beau.p + ML.WEATHER.pluie.p ? 'pluie' : 'brouillard';
    S = Sim.S = K.S = {
      rt: 0, mode: g.mode || 'coop', day: g.day || 1, score: 0, sat: 70, served: 0, failed: 0, over: false, n: cfg.players.length,
      stock: {}, orders: [], machines: {}, pl: {}, cars: [], items: [], subs: { fonderie: [], chaudro: [], tth: [] },
      finds: { got: 0, total: 0, log: [] }, buffs: {}, anger: C.LEBEC.base, chase: null,
      humeur: g.humeur || (g.mode === 'inspection' ? 'normal' : rng.pick(humeurs)), weather, power: true,
      chips: [], fires: [], puddles: [], evs: {}, rule: null, viol: 0, appNames: {}, up,
      nextOid: 1, nextItem: 1, nextOrder: C.ORDER.firstAt, nOrders: 0, nextId: 1
    };
    K.H = ML.HUMEURS[S.humeur];
    // difficulté (menu : Facile / Normal / Difficile / LEBEC EN FEU) — ML.DIFFS dans config.js
    K.D = ML.DIFFS[g.diff] || ML.DIFFS.normal; S.diff = ML.DIFFS[g.diff] ? g.diff : 'normal'; S.anger = C.LEBEC.base + K.D.base;
    // stock de départ un peu différent à chaque partie
    for (const k in C.START_STOCK) S.stock[k] = Math.max(1, C.START_STOCK[k] + Math.floor(rng() * 3) - 1);
    // opérateurs mélangés sur les postes
    const ops = shuffle(ML.OPERATORS), AT = ML.ATELIER || {};
    let oi = 0;
    for (const m of ML.MACHINES) {
      if (m.upgrade && !up[m.upgrade]) continue;
      const op = AT.career ? (AT.assign[m.id] || null) : m.id === 'T3' ? 'app1' : m.id === 'F3' ? 'app2' : ops[oi++];
      S.machines[m.id] = { status: 'idle', job: null, op, wear: Math.floor(rng() * 40), broken: false };
    }
    const names = shuffle(ML.APPRENTIS); S.appNames = { app1: names[0][0], app2: names[1][0] };
    const roles = (g.roles || {});
    for (const p of cfg.players) S.pl[p.id] = { name: p.name, idx: p.idx, inv: [null, null, null], car: null, ride: null, stun: 0, coffee: 0, hp: C.HP.max, ko: false, role: ML.ROLES[roles[p.id]] ? roles[p.id] : 'poly' };
    ev = []; pose = K.pose = {}; Sim.dirty = true; K.priv = {};
    // PNJ
    npcs = Sim.npcs = K.npcs = {};
    const opOf = {}; for (const id in S.machines) opOf[S.machines[id].op] = id;
    K.opOf = opOf;
    for (const id in ML.PEOPLE) {
      const P = ML.PEOPLE[id];
      const n = { id, x: 0, z: 0, yaw: 0, path: [], onArrive: null, state: 'idle', speed: 1.7, run: false, stun: 0, tmp: '', tmpT: 0, mem: {}, hunger: 15, active: true };
      if (P.op) {
        if (!opOf[id] && AT.career && ML.OPERATORS.includes(id)) { const sp = ML.LOC.idle ? ML.LOC.idle[Object.keys(npcs).length % ML.LOC.idle.length] : ML.LOC.coffee[0]; Object.assign(n, { x: sp.x, z: sp.z, state: 'idle', mid: null }); npcs[id] = n; continue; }   // ouvrier sans poste
        if (!opOf[id]) { n.active = false; npcs[id] = n; continue; }
        const st = ML.World.machines[opOf[id]].station; Object.assign(n, { x: st.x, z: st.z, yaw: st.yaw, state: 'work', home: st, mid: opOf[id] });
      } else if (id === 'lebec') { const L0 = ML.LOC.lebec || ML.LOC.patrol[0]; Object.assign(n, { x: L0.x, z: L0.z, state: 'patrol', speed: 1.6 }); }
      else if (P.visitor) Object.assign(n, { active: false, state: 'away' });
      else { const comp = K.compOf(id), L = comp && ML.LOC.comp[comp]; if (!L) { n.active = false; npcs[id] = n; continue; } Object.assign(n, { x: L.npc.x, z: L.npc.z, yaw: L.npc.yaw, state: 'shop', home: L.npc, comp }); }
      npcs[id] = n;
    }
    if (up.frigo) for (const id in npcs) if (K.trait(id, 'hungry')) npcs[id].hunger = -999;
    // trouvailles
    const kinds = shuffle(Object.keys(ML.FINDS)).slice(0, 6), spots = shuffle(ML.LOC.hides).slice(0, kinds.length);
    spots.forEach((h, i) => K.spawnItem({ type: 'find', d: { k: kinds[i] } }, h.x, 0, h.z));
    S.finds.total = spots.length;
    // équipements sur leurs crochets
    for (const h of ML.LOC.hooks) K.spawnItem({ type: h.type, d: {} }, h.x, h.y, h.z);
    for (const m of Sim.mods) if (m.init) m.init(cfg);
    if (S.humeur === 'bonne_humeur') for (const id in npcs) if (K.trait(id, 'hungry')) npcs[id].fed = 120;
  };
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  K.shuffle = shuffle;
  /** L'ouvrier `id` a-t-il ce trait ? (robot, hungry, deadstop, forgetful, apprenti) */
  K.trait = (id, t) => { const P = id && ML.PEOPLE[id]; return !!(P && P.op && P.op.traits.includes(t)); };
  K.compOf = npc => { for (const k in COMP) if (COMP[k].npc === npc) return k; return null; };

  /* ======================= Événements vers les clients ======================= */
  K.note = (to, s, ty) => ev.push({ e: 'n', to, s, ty });
  K.all = (s, ty) => ev.push({ e: 'n', s, ty });
  K.sfx = (s, x, z) => ev.push({ e: 'sfx', s, x, z });
  K.big = (s, c, to) => ev.push({ e: 'big', s, c, to });
  K.ev = o => ev.push(o);
  K.stat = (to, k, n) => ev.push({ e: 'stat', to, k, n: n || 1 });
  // ML.redraw (config.js) : une phrase connue de persos.js est retirée dans sa liste (pas de répétition)
  K.say = (n, s, speak) => { if (!n) return; if (ML.redraw) s = ML.redraw(s, n.id); n.tmp = s; n.tmpT = Math.max(4, String(s).length / 15); ev.push({ e: 'say', n: n.id, s, sp: speak ? 1 : 0 }); };
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
  /** V4.1 (portage) : range dans le stock TOUS les produits de ce type que le joueur a en main (rack / armoire) */
  K.putAway = (pid, P, ps, type, key) => {
    let n = 0; P.inv.forEach((it, i) => { if (it && it.type === type) { P.inv[i] = null; n++; } });
    if (!n) return false;
    S.stock[key] = (S.stock[key] || 0) + n; Sim.dirty = true; sfx('drop', ps.x, ps.z);
    note(pid, `📦 Rangé : ${n} × ${ML.MATERIALS[key] ? 'barre ' + ML.MATERIALS[key].label : ML.TOOLS[key].label} (stock : ${S.stock[key]}).`, 'good');
    return true;
  };
  /** Ouvre un colis { acier: 4, plaquette: 2… } : tout tombe par terre autour de (x, z) */
  K.openColis = (c, x, z) => {
    let n = 0;
    for (const k in c) for (let i = 0; i < c[k]; i++, n++) {
      const a = rng() * 6.283, r = 0.4 + rng() * 0.9;
      K.spawnItem({ type: ML.MATERIALS[k] ? 'brut_' + k : k, d: {} }, x + Math.cos(a) * 0.2, 0.9, z + Math.sin(a) * 0.2, [Math.cos(a) * r * 2, 2.5 + rng() * 2, Math.sin(a) * r * 2]);
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
  K.clients = () => ML.CLIENTS.filter(c => ML.LOC.comp[c] && (S.mode !== 'campagne' || !COMP[c].unlock || S.day >= COMP[c].unlock));
  function genOrder() {
    const cs = K.careerOrder ? K.careerOrder() : null;           // carrière : tickets tirés des devis signés (sim_career.js)
    if (!cs && K.careerOn && K.careerOn()) return;
    S.nOrders++;
    const kind = cs ? cs.kind : S.nOrders <= 2 ? 'plain' : rng.pick(['plain', 'plain', 'plain', 'fonderie', 'chaudro', 'tth']);
    const tpl = cs ? null : rng.pick(ML.PARTS[kind]);
    const [part, mat] = cs ? [cs.part, cs.mat] : tpl;
    if (!Object.values(S.machines).length) return;
    const client = cs ? cs.client : rng.pick(K.clients()), cl = ML.LOC.comp[client] || { x: 0, z: 0 }, far = Math.hypot(cl.x, cl.z) > 200 || !!COMP[client].plateau;   // « part » (particulier) : pas de bâtiment, livré au comptoir
    const sr = rng(), size = cs ? cs.size : kind === 'plain' ? (sr < 0.3 ? 's' : sr < 0.78 ? 'm' : 'l') : kind === 'chaudro' ? (sr < 0.5 ? 'm' : 'l') : kind === 'tth' ? (sr < 0.5 ? 's' : 'm') : 'm';
    // gamme : celle du devis signé, sinon celle du catalogue ; client de passage = version simplifiée (nos machines seulement)
    const con = cs && cs.contract && S.car ? (S.car.contracts || []).find(c => c.id === cs.contract) : null;
    const types = {}; for (const d of (S.machDefs || ML.MACHINES)) if (S.machines[d.id]) types[d.type] = 1;
    const ops = RT.fit(cs ? (cs.ops || (con && con.ops) || RT.of(cs.part, cs.mtype, cs.tool)) : RT.of(tpl), size, cs && !cs.contract ? types : null);
    const steps = (kind === 'fonderie' || kind === 'chaudro' ? [kind] : []).concat(ops.map(() => 'usinage'), kind === 'tth' ? ['tth'] : [], ['livraison']);
    const dur = (C.ORDER.base + C.ORDER.perStep * (steps.length - 2) + (far ? C.ORDER.far : 0)) * (K.H.dur || 1) * K.D.dur * (S.mode === 'campagne' ? Math.max(0.75, 1 - 0.03 * (S.day - 1)) : 1);
    const op0 = OPS[ops[0]];
    const o = { id: S.nextOid++, client, part, mat, mtype: op0.mt, tool: op0.tool, ops, oi: 0, qe: null, qc: null, steps, si: 0, size, src: kind === 'fonderie' || kind === 'chaudro' ? kind : null, t0: S.rt, dl: S.rt + dur * (size === 'l' ? 1.3 : 1), dur: dur * (size === 'l' ? 1.3 : 1), q: false, m: null, contract: cs ? cs.contract : null, price: cs ? cs.price : null };
    S.orders.push(o); Sim.dirty = true;
    all(`📋 Nouveau ticket #${o.id} — ${COMP[client].name} : ${part}${size === 'l' ? ' (GROSSE pièce : fenwick + camion)' : size === 's' ? ' (petite)' : ''} · gamme : ${RT.label(ops)}`, 'info'); sfx('order');
  }
  K.failOrder = (o, why) => {
    const i = S.orders.indexOf(o); if (i < 0) return;
    S.orders.splice(i, 1);
    for (const id in S.machines) if (S.machines[id].job && S.machines[id].job.oid === o.id) S.machines[id].job = null;
    for (const k in S.subs) S.subs[k] = S.subs[k].filter(j => j.oid !== o.id);
    K.purgeOrder(o.id);
    S.failed++; S.score = Math.max(0, S.score - 10); S.sat = Math.max(0, S.sat - 8);
    for (const m of Sim.mods) if (m.onFail) m.onFail(o);
    all(`⏰ Ticket #${o.id} (${COMP[o.client].name}) RATÉ : ${why || 'trop tard !'} (−10)`, 'warn'); sfx('fail'); Sim.dirty = true;
    if (K.priv.traitor) K.priv.fails = (K.priv.fails || 0) + 1;
  };
  function updateOrders(dt) {
    if (S.mode === 'course') return;
    const n = Math.max(1, S.n), maxActive = Math.min(6, 2 + n);
    S.nextOrder -= dt;
    if (S.nextOrder <= 0 && S.rt < C.SHIFT_SEC - 50) {
      if (S.orders.length < maxActive) genOrder();
      const camp = S.mode === 'campagne' ? Math.max(0.7, 1 - 0.05 * (S.day - 1)) : 1;
      S.nextOrder = C.ORDER.interval / (1 + 0.25 * (n - 1)) * (0.8 + rng() * 0.4) * camp * K.D.interval;
    }
    for (const o of S.orders.slice()) if (S.rt > o.dl) K.failOrder(o);
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
    if (!o) { P.inv[sel] = null; note(pid, 'Commande annulée (trop tard) : caisse jetée.', 'warn'); return; }
    if (o.client !== comp) return say(n, `Ce n'est pas pour nous ! C'est pour ${COMP[o.client].name}.`);
    if (stage(o) === 'tth') return say(n, "Elle doit d'abord passer au traitement thermique (TTH Ouest) !");
    if (stage(o) !== 'livraison') return say(n, "Elle n'est pas prête.");
    if (P) P.inv[sel] = null; Sim.dirty = true;
    if (held.d.nc) {
      restartOrder(o); S.sat = Math.max(0, S.sat - 6);
      if (S.car) S.car.rep = Math.max(0, S.car.rep - 2);
      say(n, 'NON CONFORME ! Je refuse. Refaites-la !', true);
      all(`❌ Caisse #${o.id} refusée : non conforme. Contrôlez au marbre avant de livrer !`, 'warn'); sfx('fail');
      return;
    }
    S.orders.splice(S.orders.indexOf(o), 1);
    // qualité : excellente = +15 %, limite = −30 % (carrière : prix et réputation ; sinon : points)
    const qd = held.d.q !== undefined ? held.d.q : null, g = RT.grade(qd), qm = g.k === 'top' ? 1.15 : g.k === 'lim' ? 0.7 : 1;
    if (S.car && ML.CAREER) {
      o.price = Math.round((o.price || ML.CAREER.PRICE[o.size || 'm']) * qm);
      if (g.k === 'top') S.car.rep = Math.min(100, S.car.rep + 1); else if (g.k === 'lim') S.car.rep = Math.max(0, S.car.rep - 1);
    }
    if (g.k === 'top') all(`⭐ #${o.id} : qualité EXCELLENTE ${g.s} — ${COMP[comp].name} est ravi (+15 %).`, 'good');
    else if (g.k === 'lim') all(`😬 #${o.id} : pièce LIMITE ${g.s} — ${COMP[comp].name} râle et paie −30 %.`, 'warn');
    const pts = K.points((20 + Math.round(20 * Math.max(0, (o.dl - S.rt) / o.dur)) + 10 * (o.steps.length - 2) + (held.d.ctl ? 5 : 0)) * C.SIZE[o.size || 'm'].pts * (held.d.npc ? 0.6 : 1) * qm);
    S.score += pts; S.served++; S.sat = Math.min(100, S.sat + (S.up.plantes ? 7 : 5));
    say(n, ML.line(n.id, 'merci', ML.LINES[n.id] || ['Merci !']));
    big(`+${pts} · #${o.id} livrée à ${COMP[comp].name} !`, '#3ecf6e'); sfx('cash');
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
        const succ = U.clamp(m.succ | 0, 0, 3), mat = ['acier', 'alu', 'inox'].includes(m.mat) ? m.mat : 'acier';
        for (let i = 0; i < succ; i++) { const [x, z] = K.dockSpot('aciers'); K.spawnItem({ type: 'matiere', d: { mat, q: 3 } }, x, 0, z); }
        say(n, succ ? `Ok-${succ}-caisse${succ > 1 ? 's' : ''}-sur-le-quai-salut !` : "Bon-t'as-rien-suivi-reviens-plus-tard !");
        break;
      }
      case 'coco': { const n = npcs.coco; if (!n.active || !near(ps, n.x, n.z, 7)) return; const [x, z] = K.dockSpot('outipro'); K.spawnItem({ type: 'matiere', d: { t: 1 } }, x, 0, z); say(n, "Merci de m'avoir écouté ! Tiens, ta caisse d'outils."); break; }
      case 'sub': {
        const comp = m.comp === 'fonderie' ? 'fonderie' : 'chaudro', n = npcs[COMP[comp].npc];
        if (!n.active || !near(ps, n.x, n.z, 7)) return;
        const o = S.orders.find(x => x.id === m.oid); if (!o || stage(o) !== comp || o.q) return;
        o.q = true; S.subs[comp].push({ oid: o.id, end: S.rt + C.SUB_SEC });
        say(n, comp === 'fonderie' ? `Je coule le brut de la #${o.id}. Repasse dans ${C.SUB_SEC} s !` : ML.line('nono'));
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
      case 'rack': if (S.stock[a] === undefined) return;
        if (K.putAway(pid, P, ps, 'brut_' + a, a)) return;              // V4.1 : produits en main → on les RANGE
        if (S.stock[a] <= 0) return note(pid, `Rupture de ${ML.MATERIALS[a].label} ! Commande chez Eliott (Aciers de l'Ouest).`, 'warn');
        if (K.give(pid, { type: 'brut_' + a, d: {} }, sel)) { S.stock[a]--; sfx('pickup', ps.x, ps.z); } return;
      case 'tool': if (!ML.TOOLS[a]) return;
        if (K.putAway(pid, P, ps, a, a)) return;
        if (S.stock[a] <= 0) return note(pid, `Plus de ${ML.TOOLS[a].label.toLowerCase()} ! Va chez Outi'Pro (Coco).`, 'warn');
        if (K.give(pid, { type: a, d: {} }, sel)) { S.stock[a]--; sfx('pickup', ps.x, ps.z); } return;
      case 'coffee': { const sec = S.up.cafe_pro || (S.car && S.car.rooms.pause) ? C.COFFEE.secPro : C.COFFEE.sec; P.coffee = S.rt + sec; note(pid, `☕ Un petit noir : tu vas BEAUCOUP plus vite pendant ${sec} s !`, 'good'); return; }   // V4.1 : café rapide
      case 'frigo': if (S.up.frigo && K.give(pid, { type: 'viennoiseries', d: {} }, sel)) sfx('pickup', ps.x, ps.z); return;
      case 'casques': if (K.give(pid, { type: 'casque', d: {} }, sel)) sfx('pickup', ps.x, ps.z); return;
      case 'reception':
        if (held && held.type === 'colis') { P.inv[sel] = null; const r = ML.LOC.reception || ps, n = K.openColis(held.d.c || {}, r.x, r.z); sfx('clang', r.x, r.z); all(`📦 ${P.name} a ouvert un colis en RÉCEPTION : ${n} article(s) par terre, à ranger (E sur le rack / l'armoire, produits en main).`, 'good'); return; }
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

  /* Machine : on charge un brut (1re op) ou un EN-COURS (op suivante), on donne l'outil,
     et sur une machine MANUELLE on peut prendre les commandes (m.pilot : 'start' puis résultat du mini-jeu). */
  function machineUse(pid, P, sel, held, mid, m) {
    const M = S.machines[mid], def = defOf(mid); if (!M || !def) return;
    const op = npcs[M.op], man = isManual(def);
    const viaMods = () => Sim.mods.some(md => md.machineUse && md.machineUse(pid, P, sel, held, mid, M, m));
    if (!op && !man) { if (!viaMods()) note(pid, `${mid} n'a pas d'ouvrier : affecte quelqu'un depuis le PC du BE.`, 'warn'); return; }
    if (viaMods()) return;
    const talk = s => (op ? say(op, s) : note(pid, s));
    if (m.pilot !== undefined) return pilotUse(pid, P, M, mid, m);
    if (!held) {
      if (op && (op.state === 'pause' || op.state === 'forgot')) return K.wake(op, pid);
      if (M.job && M.job.man && M.job.tool) note(pid, `🕹 ${mid} est manuelle : [E] les mains vides pour prendre les commandes.`);
      return;
    }
    const t = IT.def(held);
    if (t.kind === 'brut' || held.type === 'encours') {
      if (M.job) return note(pid, `${mid} est occupée (#${M.job.oid}).`, 'warn');
      let o;
      if (held.type === 'encours') {
        o = S.orders.find(x => x.id === held.d.oid);
        if (!o || stage(o) !== 'usinage' || o.m || (held.d.oi !== undefined && held.d.oi !== K.opIdx(o))) return note(pid, 'Cet en-cours ne correspond plus à aucune commande (rebut ou ticket raté) : à la benne !', 'warn');
        const nx = OPS[K.curOp(o)];
        if (nx.mt !== def.type) return note(pid, `#${o.id} : prochaine op = ${nx.n}, sur une ${ML.MTYPE[nx.mt]}, pas sur ${mid} !`, 'warn');
      } else if (held.type === 'brut_sp') {
        o = S.orders.find(x => x.id === held.d.oid && stage(x) === 'usinage' && !x.m && K.opIdx(x) === 0);
        if (!o) return note(pid, 'Ce brut ne correspond à aucune commande à usiner.', 'warn');
        if (o.mtype !== def.type) return note(pid, `La #${o.id} commence par ${OPS[K.curOp(o)].n} sur une ${ML.MTYPE[o.mtype]}, pas sur ${mid} !`, 'warn');
      } else {
        const mat = t.mat, cand = S.orders.filter(x => stage(x) === 'usinage' && !x.src && !x.m && x.mat === mat && K.opIdx(x) === 0);
        o = cand.filter(x => x.mtype === def.type).sort((p, q) => p.dl - q.dl)[0];
        if (!o) return note(pid, cand.length ? `La #${cand[0].id} en ${ML.MATERIALS[mat].label} commence sur une ${ML.MTYPE[cand[0].mtype]}, pas ici !` : `Aucun ticket n'attend du ${ML.MATERIALS[mat].label} à usiner.`, 'warn');
      }
      P.inv[sel] = null; o.m = mid;
      startJob(mid, M, def, o, op, { pid, mg: m.mg, sc: m.sc, prev: held.type === 'encours' ? held.d : null });
      sfx('drop', def.x, def.z); return;
    }
    if (t.kind === 'tool') {
      if (!M.job) return note(pid, `Donne d'abord un brut (ou un en-cours) à ${mid}.`, 'warn');
      if (M.job.tool) return note(pid, `${mid} a déjà son outil.`, 'warn');
      if (t.tool !== M.job.need) {
        if (!op || !K.trait(M.op, 'robot')) return talk(`C'est pas le bon outil ! ${OPS[M.job.op] ? OPS[M.job.op].n : 'Cette op'} demande : ${ML.TOOLS[M.job.need].label}.`);
        M.job.wrong = true;
      }
      P.inv[sel] = null; M.job.tool = true; M.mounted = t.tool;
      if (man && !op) note(pid, `🔧 Outil monté sur ${mid}. Machine MANUELLE sans ouvrier : [E] les mains vides pour usiner toi-même !`, 'good');
      else say(op, man && !K.trait(M.op, 'robot') ? ML.line(M.op, 'manivelle', ['Je mouline… (aide-moi si t\'es pressé : E)', 'À la manivelle, ça va prendre un moment…']) : ML.line(M.op, 'lance', K.trait(M.op, 'robot') ? 'Reçu. Exécution.' : ["C'est parti !", 'Nickel, je lance.', 'Ça tourne !']));
      return;
    }
    if (held.type === 'viennoiseries' && op && K.trait(M.op, 'hungry')) return feedMatis(pid, P, sel, op);
    note(pid, 'Ça ne sert à rien sur une machine.', 'warn');
  }
  /** Lance une opération de gamme sur une machine. ctx : { pid, mg, sc (réglage CN), prev (données de l'en-cours) } */
  function startJob(mid, M, def, o, op, ctx) {
    const id = K.curOp(o) || o.ops[0], OP = OPS[id], man = isManual(def), mu = ML.MAT_USIN[o.mat] || {}, prev = ctx.prev || {};
    let setup = null;
    if (ctx.mg) {                                                               // réglage fait (mini-jeu)
      setup = isFinite(ctx.sc) ? U.clamp(+ctx.sc, 0, 100) : ctx.mg === 'ok' ? 75 : ctx.mg === 'meh' ? 50 : 20;
      M.ref = o.part; M.refSc = setup; if (ctx.mg === 'ok' && ctx.pid) K.stat(ctx.pid, 'origine');
    } else if (!man) {                                                          // CN : même référence = programme déjà réglé
      if (M.ref !== o.part || M.refSc === undefined) { M.ref = o.part; M.refSc = 55; }
      setup = M.refSc;
    }
    const fast = !man && setup !== null && setup >= 60 ? 0.85 : 1;
    const total = C.PROD_SEC * OP.k * (o.src ? 1.25 : 1) * fast * C.SIZE[o.size || 'm'].prod / (mu.v || 1);
    M.job = { oid: o.id, op: id, oi: K.opIdx(o), tool: false, need: OP.tool, prog: 0, total, wrong: !!(ctx.mg === 'fail' && rng() < 0.3), setup, pil: [], qs: (prev.qs || []).slice(), nc0: !!prev.nc, man };
    const who = op ? null : ctx.pid;
    const tell = s => (op ? say(op, s) : who ? note(who, s) : all(s, 'info'));
    if (M.mounted === OP.tool && !M.worn) { M.job.tool = true; tell(`#${o.id} : ${OP.ic} ${OP.n} — ${ML.TOOLS[OP.tool].label} déjà montée, ${man ? (op ? "j'attaque à la main…" : 'à toi de piloter (E) !') : "c'est parti !"}`); }
    else {
      if (M.mounted) { S.stock[M.mounted] = (S.stock[M.mounted] || 0) + 1; M.mounted = null; }   // l'ancien outil retourne à l'armoire
      tell(`#${o.id} : ${OP.ic} ${OP.n} — il me faut ${OP.tool === 'fraise' ? 'une fraise' : OP.tool === 'foret' ? 'un foret' : 'une plaquette'} !`);
    }
    Sim.dirty = true;
  }
  /** Un joueur prend les commandes d'une machine manuelle (mini-jeu 3D côté client) */
  function pilotUse(pid, P, M, mid, m) {
    const j = M.job;
    if (m.pilot === 'start') {
      if (!j || !j.tool || !j.man) return note(pid, j && !j.tool ? `Il manque l'outil : ${ML.TOOLS[j.need].label}.` : `Rien à usiner sur ${mid}.`, 'warn');
      if (M.pilot && M.pilot.pid !== pid && M.pilot.until > S.rt) return note(pid, `${M.pilot.name} est déjà aux commandes de ${mid}.`, 'warn');
      M.pilot = { pid, name: P.name, until: S.rt + 45 }; Sim.dirty = true; return;
    }
    if (M.pilot && M.pilot.pid === pid) M.pilot = null;
    Sim.dirty = true;
    if (m.pilot === 'abandon' || !j || !j.tool || (m.oid !== undefined && +m.oid !== j.oid)) return;
    const sc = isFinite(m.sc) ? U.clamp(+m.sc, 0, 100) : m.pilot === 'ok' ? 70 : m.pilot === 'meh' ? 50 : 15;
    j.pil.push(sc);
    const gain = sc >= 60 ? 1 : sc >= 40 ? 0.55 : 0.2;
    j.prog = Math.min(j.total, j.prog + j.total * gain);
    const OP = OPS[j.op] || { n: 'Usinage' };
    note(pid, sc >= 90 ? `⭐ ${OP.n} PARFAIT sur ${mid} : l'opération est finie, qualité au top !` : sc >= 60 ? `✔ ${OP.n} terminé à la main sur ${mid}.` : sc >= 40 ? `〰 ${OP.n} à moitié fait… (qualité moyenne)` : `💥 ${OP.n} raté : ça a brouté, la pièce risque le REBUT. Contrôle-la au marbre !`, sc >= 40 ? 'good' : 'warn');
  }
  function feedMatis(pid, P, sel, op) {
    P.inv[sel] = null; op.hunger = 0; op.fed = S.rt + 90;
    if (op.state !== 'work') K.backToWork(op);
    say(op, ML.line(op.id, 'miam', 'MIAM ! Je suis une machine maintenant !')); all(`🥐 ${P.name} a nourri Matis : +40 % pendant 90 s.`, 'good');
  }

  function npcUse(pid, P, ps, sel, held, id) {
    const n = npcs[id]; if (!n || !n.active || !near(ps, n.x, n.z, 4.5)) return;
    for (const mod of Sim.mods) if (mod.npcUse && mod.npcUse(pid, P, ps, sel, held, n)) return;
    if (ML.PEOPLE[id].op) {
      if (n.state === 'pause' || n.state === 'forgot') return K.wake(n, pid);
      if (held && held.type === 'viennoiseries' && K.trait(id, 'hungry')) return feedMatis(pid, P, sel, n);
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
        P.inv[sel] = null; o.q = true; S.subs.tth.push({ oid: o.id, end: S.rt + C.SUB_SEC, nc: !!held.d.nc, mes: held.d.mes, type: held.type, q: held.d.q, ctl: held.d.ctl });
        return say(n, `Au four la #${o.id} ! Reviens dans ${C.SUB_SEC} s, WOUHOU !`);
      }
      case 'client': case 'concurrent':
        if (K.isPart(held)) return deliver(pid, P, sel, held, comp, n);
        if (held && held.type === 'encours') { const o = S.orders.find(x => x.id === held.d.oid); return say(n, `Elle n'est pas finie, votre pièce ! Il reste : ${o && o.ops ? RT.label(o.ops.slice(K.opIdx(o))) : '???'}.`); }
        if (held && held.type === 'rebut') return say(n, "C'est de la ferraille, ça. La benne est chez vous.");
        return say(n, ML.line(id, null, 'Bonjour !'));
      default: return say(n, ML.line(id, null, 'Oui ?'));
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
    if (n.id === 'lebec') { say(n, ML.line('lebec', 'frappe', "TU M'AS FRAPPÉ ?! COUP DE PELLE !!!"), true); S.anger = 100; K.stat(by, 'slap_lebec'); K.startChase(by); return; }
    if (ML.PEOPLE[n.id].op && ['pause', 'toPause', 'forgot', 'rant'].includes(n.state)) { K.backToWork(n); say(n, ML.line(n.id, 'claque', K.trait(n.id, 'deadstop') ? "Mmh. D'accord. J'y vais." : "Aïe ! OK OK, j'y retourne !")); }
    else say(n, ML.line(n.id, 'claque', K.trait(n.id, 'robot') ? 'Choc détecté. Je continue.' : ['Aïe !', 'Hé ! Ça va pas ?!', 'Ouille !']));
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
    S.anger = C.LEBEC.base + K.D.base + 10; S.chase = null; S.score = Math.max(0, S.score - 5); K.stat(pid, 'pelle'); K.damage(pid, C.HP.pelle, 'coup de pelle');
  }
  function applyFind(k, pid) {
    const F = ML.FINDS[k], who = S.pl[pid] ? S.pl[pid].name : '?';
    S.finds.got++; S.finds.log.push(k);
    switch (k) {
      case 'pelle_or': S.anger = 0; S.buffs.calm = S.rt + 120; if (S.chase) { S.chase = null; npcs.lebec.state = 'patrol'; } break;
      case 'pied_coulisse': S.score += 25; break;
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
  /* Marche : chemin calculé par ML.Nav (grille + A*, nav.js) ; ancienne route
     en lignes droites si Nav absent. Si le budget de calcul du pas est épuisé,
     le PNJ attend (navPend) et le chemin est calculé au pas suivant. */
  K.walkTo = (n, x, z, cb, run) => {
    n.onArrive = cb || null; n.run = !!run; n.stuck = 0; n.stuckAll = 0; n.navFail = 0;
    if (!ML.Nav) { n.path = route(n, x, z); return; }
    const p = ML.Nav.request(n, x, z, S.rt);
    n.path = n.navPath = p || [{ x, z }]; n.navPend = !p;
  };
  /** Avant de marcher : chemin en attente de calcul, ou chemin posé à la main
      (n.path = [cible], ex. poursuite) qui traverse un mur → passé à l'A*.
      Renvoie true si le PNJ doit attendre ce pas-ci. */
  function navPre(n) {
    const N = ML.Nav; if (!N) return false;
    if (n.path !== n.navPath) {
      n.navPath = n.path; n.navPend = false; n.navFail = 0;
      const t = n.path[0];
      if (n.path.length === 1 && N.blockedLine(n.x, n.z, t.x, t.z)) { const p = N.request(n, t.x, t.z, S.rt); if (p) n.path = n.navPath = p; }
    }
    if (n.navPend) { const g = n.path[n.path.length - 1], p = N.request(n, g.x, g.z, S.rt); if (!p) return true; n.path = n.navPath = p; n.navPend = false; }
    return false;
  }
  /** PNJ bloqué ~2 s : nouveau chemin ; au 3e échec, petit saut vers l'avant. */
  function navStuck(n, t) {
    const N = ML.Nav; n.navFail = (n.navFail || 0) + 1;
    if (n.navFail < 3) { const g = n.path[n.path.length - 1], p = N.request(n, g.x, g.z, S.rt); if (p) n.path = n.navPath = p; return; }
    n.navFail = 0;
    const d = Math.hypot(t.x - n.x, t.z - n.z), k = Math.min(1, 1.5 / (d || 1));
    const f = N.freeNear(n.x + (t.x - n.x) * k, n.z + (t.z - n.z) * k) || { x: t.x, z: t.z };
    n.x = f.x; n.z = f.z; say(n, 'Pardon, je passe !');
  }
  K.stop = n => { n.path = []; n.onArrive = null; n.run = false; };
  K.atHome = n => n.home && Math.hypot(n.x - n.home.x, n.z - n.home.z) < 0.5;
  K.backToWork = n => { n.state = 'work'; K.stop(n); };
  K.wake = (n, pid) => {
    const forgot = n.state === 'forgot', chance = K.trait(n.id, 'deadstop') ? 0.25 : 0.7;
    if (forgot || rng() < chance) { K.backToWork(n); say(n, ML.line(n.id, 'reveil', forgot ? 'Ah ouiii ! Merci.' : ["Ouais ouais, j'y vais...", "Bon. D'accord."])); }
    else { say(n, ML.line(n.id, 'refus', ['Encore cinq minutes...', 'Nan.', "J'arrive... (il n'arrive pas)"])); note(pid, 'Il ne bouge pas. Une claque (clic gauche) marcherait mieux...'); }
  };
  K.workMult = n => {
    if (n.state !== 'work' || !K.atHome(n) || n.stun > 0 || !S.power) return 0;
    let k = ML.PEOPLE[n.id].op.speed;
    if (n.id === 'app1' || n.id === 'app2') k = 0.6 + 0.15 * Math.min(3, S.up.formation || 0);
    if (S.buffs.croissant > S.rt) k *= 1.5;
    if (K.trait(n.id, 'hungry')) { if (n.fed > S.rt) k *= 1.4; else if (n.hunger > 60) k *= 0.5; }
    for (const mod of Sim.mods) if (mod.workMult) k = mod.workMult(n, k);
    return k;
  };
  function brainOperator(n, dt) {
    const op = ML.PEOPLE[n.id].op, M = S.machines[n.mid];
    switch (n.state) {
      case 'work': {
        if (!K.atHome(n)) { if (!n.path.length) K.walkTo(n, n.home.x, n.home.z); break; }
        // opérateurs bavards (V4.5) : une réplique de persos.js toutes les 50-110 s
        n.chatT = (n.chatT === undefined ? 15 + rng() * 40 : n.chatT) - dt;
        if (n.chatT <= 0) { n.chatT = 50 + rng() * 60; if (!(n.tmpT > 0)) say(n, ML.line(n.id)); }
        n.faceYaw = n.home.yaw;
        const lazy = op.lazy * (S.up.babyfoot ? 0.7 : 1);
        if (lazy > 0 && rng() < lazy * 0.012 * dt * (M.job ? 1 : 1.5)) {
          if (op.traits.includes('deadstop')) { n.state = 'pause'; n.pauseT = 35 + rng() * 30; say(n, ML.line(n.id, 'pause', 'Flemme.')); }
          else { const sp = U.pick(ML.LOC.coffee); n.state = 'toPause'; K.walkTo(n, sp.x, sp.z, () => { n.state = 'pause'; n.pauseT = (18 + rng() * 20) * (S.up.babyfoot ? 0.6 : 1); }); say(n, ML.line(n.id, 'pause', 'Petite pause café...')); }
        }
        if (op.traits.includes('forgetful') && M.job && M.job.tool && rng() < 0.006 * dt) { n.state = 'forgot'; say(n, ML.line(n.id, 'oubli', "Euh... j'usinais quoi déjà ?")); }
        break;
      }
      case 'pause': n.pauseT -= dt; if (n.pauseT <= 0) { K.backToWork(n); say(n, ML.line(n.id, 'retour', "Bon, j'y retourne.")); } break;
      case 'rant': n.pauseT -= dt; if (n.pauseT <= 0) K.backToWork(n); break;
    }
    if (K.trait(n.id, 'hungry') && n.hunger > -100) n.hunger = Math.min(100, n.hunger + dt * 0.45);
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
        S.chase = null; n.state = 'patrol'; K.stop(n); say(n, ML.line('lebec', 'abandon', 'Tu perds rien pour attendre, toi !')); S.anger = Math.max(C.LEBEC.base + K.D.base, S.anger - 25);
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
    if (n.path.length && n.stun <= 0 && !navPre(n)) {
      const t = n.path[0], dx = t.x - n.x, dz = t.z - n.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { n.path.shift(); n.stuck = 0; n.stuckAll = 0; n.navFail = 0; if (!n.path.length) { const cb = n.onArrive; n.onArrive = null; n.run = n.state === 'chase'; if (cb) cb(); } }
      else {
        const run = n.id === 'lebec' ? (K.H.run || C.LEBEC.run) * K.D.run : n.runSpeed || 5;
        const sp = n.run ? run : n.speed, step = Math.min(sp * dt, d), ox = n.x, oz = n.z;
        n.x += dx / d * step; n.z += dz / d * step; U.resolveCircle(n, 0.3);
        const moved = Math.hypot(n.x - ox, n.z - oz);
        if (moved < step * 0.35) { n.stuck += dt; n.stuckAll += dt; } else n.stuck = Math.max(0, n.stuck - dt);
        if (ML.Nav) { if (n.stuck > 2) { n.stuck = 0; navStuck(n, t); } }
        else {
          if (n.stuck > 0.6) { n.stuck = 0; const s = rng() < 0.5 ? 1 : -1; n.path.unshift({ x: n.x - dz / d * 1.6 * s, z: n.z + dx / d * 1.6 * s }); }
          if (n.stuckAll > 4) { n.x = t.x; n.z = t.z; n.stuckAll = 0; }
        }
        n.yaw = U.lerpAngle(n.yaw, Math.atan2(dx, dz), 10 * dt); moving = n.run ? 2 : 1;
      }
    } else if (n.faceYaw != null) n.yaw = U.lerpAngle(n.yaw, n.faceYaw, 5 * dt);
    n.mv = moving;
  }
  function bubble(n) {
    if (n.tmpT > 0) return n.tmp;
    for (const mod of Sim.mods) if (mod.bubble) { const b = mod.bubble(n); if (b !== undefined) return b; }
    if (n.mid) {
      if (n.state === 'pause' || n.state === 'toPause') return K.trait(n.id, 'deadstop') ? '💤 Flemme...' : '☕ En pause';
      if (n.state === 'forgot') return "❔ J'usinais quoi déjà ?";
      if (n.state === 'rant') return '😐 Écoute Lebec...';
      const M = S.machines[n.mid];
      if (M.job && !M.job.tool) return '❓ ' + ML.TOOLS[M.job.need].label + ' ?';
      if (M.pilot) return `👀 ${M.pilot.name} pilote…`;
      if (M.job && M.job.man && M.job.tool) return '🐢 À la manivelle… (E : aide-moi !)';
      if (K.trait(n.id, 'hungry') && n.hunger > 60 && !(n.fed > S.rt)) return "🥐 J'ai faim...";
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
    for (const o of S.orders) if (o.ops) syncOrder(o);
    for (const def of ML.MACHINES) {
      const M = S.machines[def.id]; if (!M) continue;
      const op = npcs[M.op], prev = M.status, man = isManual(def), j = M.job;
      if (M.pilot && (M.pilot.until < S.rt || !j || !S.pl[M.pilot.pid])) { M.pilot = null; Sim.dirty = true; }
      if (M.worn) M.mounted = null; else if (j && j.tool) M.mounted = j.need;
      if (M.moving) M.status = 'off';
      else if (!S.power) M.status = 'off';
      else if (!op && !man) M.status = j ? 'stop' : 'idle';
      else if (M.broken) M.status = 'panne';
      else if (M.bin === false || M.chips >= 100) M.status = 'bac';
      else if (!j) M.status = 'idle';
      else if (!j.tool) M.status = M.worn ? 'usure' : 'wait';
      else if (M.pilot || j.prog >= j.total) M.status = 'pilot';                 // un joueur est aux commandes
      else {
        // ouvrier seul : vitesse du catalogue ; machine MANUELLE = ×0.45 (et sans ouvrier : rien sans pilote)
        let k = op ? K.workMult(op) * (def.speed || 1) : 0;
        if (man) k *= 0.45;
        if (k > 0) {
          j.prog += dt * k; M.status = 'run';
          const mu = ML.MAT_USIN[(S.orders.find(x => x.id === j.oid) || {}).mat] || {};
          if (mu.wear) M.wear = Math.max(0, (M.wear || 0) + dt * mu.wear);       // inox : ça use ; alu : ça glisse
        } else M.status = man && !op ? 'pilot' : 'stop';
      }
      if (j && j.tool && j.prog >= j.total && M.job === j && !M.broken && S.power) finishOp(def, M, j, op);
      if (prev !== M.status) Sim.dirty = true;
    }
    for (const k in S.subs) for (const j of S.subs[k].slice()) {
      if (S.rt < j.end) continue;
      S.subs[k].splice(S.subs[k].indexOf(j), 1);
      const o = S.orders.find(x => x.id === j.oid); if (!o) continue;
      const [x, z] = K.dockSpot(k);
      if (k === 'tth') K.spawnItem({ type: j.type || 'caisse', d: { oid: o.id, nc: j.nc || undefined, mes: j.mes, q: j.q, ctl: j.ctl || undefined } }, x, 0, z);
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
  /** Fin d'une opération : qualité, puis op suivante sur la MÊME machine, en-cours à porter, ou pièce finie */
  function finishOp(def, M, j, op) {
    const o = S.orders.find(x => x.id === j.oid);
    M.job = null; M.status = 'idle'; Sim.dirty = true;
    if (!o) return;
    const q = opQuality(def, M, j, op, o), qs = j.qs.concat([q]), nc = !!(j.wrong || j.nc0 || q < 40), qa = Math.round(avg(qs));
    const OPd = OPS[j.op] || { n: 'Usinage', ic: '🛠' };
    o.si++; o.q = false; syncOrder(o);
    o.qe = nc ? 47 : qa;                                     // estimation affichée : un rebut ressemble à une pièce « limite »…
    const nextId = K.curOp(o), NX = nextId && OPS[nextId];
    sfx('success', def.x, def.z);
    if (NX && NX.mt === def.type) {                          // même type de machine : on enchaîne sans démonter
      startJob(def.id, M, def, o, op, { prev: { qs, nc } });
      all(`⏩ ${def.id} : ${OPd.n} fini sur la #${o.id}, enchaîne ${NX.ic} ${NX.n}.`, 'info');
      return;
    }
    o.m = null;
    if (NX) {                                                // en-cours à porter à la machine suivante
      const [x, z] = machineSpot(def.id);
      K.spawnItem({ type: 'encours', d: { oid: o.id, next: nextId, oi: K.opIdx(o), qs, nc: nc || undefined, mat: o.mat, size: o.size, mes: mkMes(qa, nc) } }, x, 1, z, [0, 0, 0]);
      all(`⏩ ${def.id} a fini « ${OPd.n} » de la #${o.id} → EN-COURS posé à côté : à porter sur une ${ML.MTYPE[NX.mt]} (${NX.ic} ${NX.n}).`, 'good');
      return;
    }
    const d = { oid: o.id, nc: nc || undefined, mes: mkMes(qa, nc), q: qa };
    if (o.size === 'l') { const [bx, bz] = K.bigSpot(); K.spawnItem({ type: 'palette', d }, bx, 0, bz); all(`✔ ${def.id} a fini la GROSSE pièce #${o.id} → palette au QUAI GROS COLIS (fenwick !).`, 'good'); }
    else { const [x, z] = K.expeditionSpot(); K.spawnItem({ type: o.size === 's' ? 'piece' : 'caisse', d }, x, 1.2, z, [0, 0, 0]); all(`✔ ${def.id} a fini la #${o.id} → ${o.size === 's' ? 'petite pièce' : 'caisse'} en EXPÉDITION${stage(o) === 'tth' ? ' (à traiter chez TTH Ouest)' : ''}. Un coup de pied à coulisse au marbre ?`, 'good'); }
  }
  K.end = extra => {
    if (S.over || S.voting) return;
    S.over = true; Sim.dirty = true;
    const k = (1 + 0.35 * (Math.max(1, S.n) - 1)) * K.D.stars, stars = S.score >= 260 * k ? 3 : S.score >= 160 * k ? 2 : S.score >= 80 * k ? 1 : 0;
    const res = Object.assign({ mode: S.mode, diff: S.diff, day: S.day, score: S.score, served: S.served, failed: S.failed, stars, finds: S.finds.got, findsTotal: S.finds.total, sat: Math.round(S.sat), need: [80, 160, 260].map(v => Math.round(v * k)) }, extra || {});
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
  /** Arrivée EN COURS DE JOURNÉE (V4.0 : rejoindre une partie en cours) */
  Sim.addPlayer = (p, role) => {
    if (!S || S.pl[p.id]) return;
    S.pl[p.id] = { name: p.name, idx: p.idx, inv: [null, null, null], car: null, ride: null, stun: 0, coffee: 0, hp: C.HP.max, ko: false, role: ML.ROLES[role] ? role : 'poly', late: S.rt };
    S.n = Object.keys(S.pl).length; Sim.dirty = true;
    K.all(`👋 ${p.name} rejoint l'atelier en cours de journée !`, 'good');
  };
  /** Rôle choisi juste après l'arrivée en cours de journée (20 s pour se décider) */
  Sim.setRole = (pid, role) => { const P = S && S.pl[pid]; if (P && P.late !== undefined && S.rt - P.late < 20 && ML.ROLES[role]) { P.role = role; Sim.dirty = true; } };
  Sim.removePlayer = pid => {
    const P = S && S.pl[pid]; if (!P) return;
    K.dropAll(pid, 1);
    for (const c of S.cars) { if (c.dr === pid) c.dr = null; c.pass = (c.pass || []).filter(x => x.pid !== pid); }
    delete S.pl[pid]; delete pose[pid]; if (S.chase === pid) S.chase = null;
    S.n = Object.keys(S.pl).length; Sim.dirty = true;
  };
})();
