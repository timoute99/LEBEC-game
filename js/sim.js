/* =====================================================================
   sim.js — SIMULATION DE L'HÔTE (fait autorité)
   Seul le navigateur de l'hôte exécute ce fichier en partie. Il décide
   de tout ce qui est commun : commandes (tickets), stock, machines, PNJ,
   objets au sol, voitures (sauf la position de celle qu'on conduit),
   sous-traitants, trouvailles, score. Les autres joueurs envoient des
   « intentions » (act) et reçoivent des instantanés (fast / slow).
   ===================================================================== */
(function () {
  const Sim = ML.Sim = {};
  const U = ML.U, C = ML.CFG, IT = ML.Items, COMP = ML.COMPANIES;
  let S, npcs, ev, pose, rng;
  const stage = o => o.steps[o.si];
  const OPS = { amaury: 'T1', marius: 'T2', matis: 'F1', brieuc: 'F2' };
  const MDEF = id => ML.MACHINES.find(m => m.id === id);

  /* ======================= Initialisation ======================= */
  Sim.init = cfg => {
    rng = U.rng(cfg.seed);
    S = Sim.S = {
      rt: 0, score: 0, sat: 70, served: 0, failed: 0, over: false, n: cfg.players.length,
      stock: Object.assign({}, C.START_STOCK), orders: [], machines: {}, pl: {}, cars: [], items: [],
      subs: { fonderie: [], chaudro: [], tth: [] }, finds: { got: 0, total: 0, log: [] }, buffs: {}, anger: C.LEBEC.base, chase: null,
      nextOid: 1, nextItem: 1, nextOrder: C.ORDER.firstAt, nOrders: 0
    };
    for (const m of ML.MACHINES) S.machines[m.id] = { status: 'idle', job: null };
    for (const p of cfg.players) S.pl[p.id] = { name: p.name, idx: p.idx, inv: [null, null, null], car: null, stun: 0, coffee: 0 };
    ML.LOC.carSpawn.forEach((c, i) => S.cars.push({ x: c.x, z: c.z, h: c.h, s: 0, dr: null, bed: [], name: i === 0 ? 'la Méga Mégane' : 'le Kangoo de Lebec' }));
    ev = []; pose = {}; Sim.dirty = true;
    // PNJ
    npcs = Sim.npcs = {};
    for (const id in ML.PEOPLE) {
      const n = { id, x: 0, z: 0, yaw: 0, path: [], onArrive: null, state: 'idle', speed: 1.7, run: false, stun: 0, tmp: '', tmpT: 0, mem: {}, hunger: 15 };
      if (OPS[id]) { const st = ML.World.machines[OPS[id]].station; Object.assign(n, { x: st.x, z: st.z, yaw: st.yaw, state: 'work', home: st }); }
      else if (id === 'lebec') Object.assign(n, { x: 12, z: -5.5, state: 'patrol', speed: 1.6 });
      else { const comp = ML.Rules.compOf(id), L = ML.LOC.comp[comp].npc; Object.assign(n, { x: L.x, z: L.z, yaw: L.yaw, state: 'shop', home: L, comp }); }
      npcs[id] = n;
    }
    // trouvailles cachées : 6 types tirés au sort dans 6 cachettes
    const kinds = shuffle(Object.keys(ML.FINDS)).slice(0, 6), spots = shuffle(ML.LOC.hides).slice(0, kinds.length);
    spots.forEach((h, i) => spawnItem({ type: 'find', d: { k: kinds[i] } }, h.x, 0, h.z));
    S.finds.total = spots.length;
  };
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ======================= Événements vers les clients ======================= */
  const note = (to, s, ty) => ev.push({ e: 'n', to, s, ty });
  const all = (s, ty) => ev.push({ e: 'n', s, ty });
  const sfx = (s, x, z) => ev.push({ e: 'sfx', s, x, z });
  const big = (s, c, to) => ev.push({ e: 'big', s, c, to });
  function say(n, s, speak) { n.tmp = s; n.tmpT = 4; ev.push({ e: 'say', n: n.id, s, sp: speak ? 1 : 0 }); }
  Sim.drain = () => { const e = ev; ev = []; return e; };

  /* ======================= Objets ======================= */
  function spawnItem(it, x, y, z, v) {
    const o = { id: S.nextItem++, type: it.type, d: it.d || {}, x, y: y || 0, z, ry: rng() * 6, vx: 0, vy: 0, vz: 0, rest: !v && !(y > 0.01), thr: null };
    if (v) { o.vx = v[0]; o.vy = v[1]; o.vz = v[2]; }
    S.items.push(o); Sim.dirty = true;
    return o;
  }
  const strip = o => ({ type: o.type, d: o.d });
  function removeItem(o) { const i = S.items.indexOf(o); if (i >= 0) S.items.splice(i, 1); Sim.dirty = true; }
  function canTake(P, it) { if (IT.bulky(it) && P.inv.some(x => x && IT.bulky(x))) return false; return P.inv.some(x => !x); }
  function give(pid, it, sel) {
    const P = S.pl[pid];
    if (IT.bulky(it) && P.inv.some(x => x && IT.bulky(x))) { note(pid, 'Une seule caisse à la fois (deux mains) !', 'warn'); return false; }
    let i = sel !== undefined && !P.inv[sel] ? sel : P.inv.findIndex(x => !x);
    if (i < 0) { note(pid, 'Inventaire plein (3 places). Pose quelque chose (G).', 'warn'); return false; }
    P.inv[i] = it; Sim.dirty = true; return true;
  }
  /** Supprime partout (sol, inventaires, bennes) les objets d'une commande */
  function purgeOrder(oid) {
    S.items = S.items.filter(o => !(o.d && o.d.oid === oid));
    for (const pid in S.pl) S.pl[pid].inv = S.pl[pid].inv.map(x => (x && x.d && x.d.oid === oid ? null : x));
    for (const c of S.cars) c.bed = c.bed.filter(x => !(x.d && x.d.oid === oid));
  }
  function expeditionSpot() {
    const E = ML.LOC.expedition;
    for (let z = E.minZ + 0.5; z < E.maxZ; z += 0.95) for (let x = E.minX + 0.5; x < E.maxX; x += 0.95)
      if (!S.items.some(o => Math.hypot(o.x - x, o.z - z) < 0.6)) return [x, z];
    return [(E.minX + E.maxX) / 2, (E.minZ + E.maxZ) / 2];
  }
  function dockSpot(comp) {
    const d = ML.LOC.comp[comp].dock;
    for (let i = 0; i < 12; i++) { const x = d.x - 4.5 + (i % 6) * 1.1, z = d.z + (i < 6 ? 0 : 1.1) * -ML.LOC.comp[comp].face; if (!S.items.some(o => Math.hypot(o.x - x, o.z - z) < 0.6)) return [x, z]; }
    return [d.x, d.z];
  }

  /* ======================= Commandes (tickets) ======================= */
  function genOrder() {
    S.nOrders++;
    const kind = S.nOrders <= 2 ? 'plain' : rng.pick(['plain', 'plain', 'plain', 'fonderie', 'chaudro', 'tth']);
    const [part, mat, mtype, tool] = rng.pick(ML.PARTS[kind]);
    const steps = kind === 'plain' ? ['usinage', 'livraison'] : kind === 'tth' ? ['usinage', 'tth', 'livraison'] : [kind, 'usinage', 'livraison'];
    const client = rng.pick(ML.CLIENTS), far = client === 'novatics' || client === 'ublo';
    const dur = C.ORDER.base + C.ORDER.perStep * (steps.length - 2) + (far ? C.ORDER.far : 0);
    const o = { id: S.nextOid++, client, part, mat, mtype, tool, steps, si: 0, src: kind === 'fonderie' || kind === 'chaudro' ? kind : null, t0: S.rt, dl: S.rt + dur, dur, q: false, m: null };
    S.orders.push(o); Sim.dirty = true;
    all(`📋 Nouveau ticket #${o.id} — ${COMP[client].name} : ${part}`, 'info'); sfx('order');
  }
  function updateOrders(dt) {
    const n = Math.max(1, S.n), maxActive = Math.min(6, 2 + n);
    S.nextOrder -= dt;
    if (S.nextOrder <= 0 && S.rt < C.SHIFT_SEC - 50) {
      if (S.orders.length < maxActive) genOrder();
      S.nextOrder = C.ORDER.interval / (1 + 0.25 * (n - 1)) * (0.8 + rng() * 0.4);
    }
    for (const o of S.orders.slice()) {
      if (S.rt <= o.dl) continue;
      S.orders.splice(S.orders.indexOf(o), 1);
      if (o.m && S.machines[o.m].job && S.machines[o.m].job.oid === o.id) S.machines[o.m].job = null;
      for (const k in S.subs) S.subs[k] = S.subs[k].filter(j => j.oid !== o.id);
      purgeOrder(o.id);
      S.failed++; S.score = Math.max(0, S.score - 10); S.sat = Math.max(0, S.sat - 8);
      all(`⏰ Ticket #${o.id} (${COMP[o.client].name}) RATÉ : trop tard ! (−10)`, 'warn'); sfx('fail'); Sim.dirty = true;
    }
  }
  function deliver(pid, P, sel, held, comp, n) {
    const o = S.orders.find(x => x.id === held.d.oid);
    if (!o) { P.inv[sel] = null; note(pid, 'Commande annulée (trop tard) : caisse jetée.', 'warn'); return; }
    if (o.client !== comp) return say(n, `Ce n'est pas pour nous ! C'est pour ${COMP[o.client].name}.`);
    if (stage(o) === 'tth') return say(n, "Elle doit d'abord passer au traitement thermique (TTH Ouest) !");
    if (stage(o) !== 'livraison') return say(n, 'Elle n\'est pas prête.');
    P.inv[sel] = null; Sim.dirty = true;
    if (held.d.nc) {
      o.si = o.steps.indexOf(o.src || 'usinage'); o.q = false; S.sat = Math.max(0, S.sat - 6);
      say(n, 'NON CONFORME ! Je refuse. Refaites-la !', true);
      all(`❌ Caisse #${o.id} refusée : non conforme (mauvais outil ?). Il faut la refaire.`, 'warn'); sfx('fail');
      return;
    }
    S.orders.splice(S.orders.indexOf(o), 1);
    const pts = 20 + Math.round(20 * Math.max(0, (o.dl - S.rt) / o.dur)) + 10 * (o.steps.length - 2);
    S.score += pts; S.served++; S.sat = Math.min(100, S.sat + 5);
    say(n, U.pick(ML.LINES[n.id] || ['Merci !']));
    big(`+${pts} · #${o.id} livrée à ${COMP[comp].name} !`, '#3ecf6e'); sfx('cash');
  }

  /* ======================= Intentions des joueurs ======================= */
  Sim.setPose = (pid, p) => {
    pose[pid] = p;
    const P = S && S.pl[pid];
    if (P && p.car && S.cars[p.car.i] && S.cars[p.car.i].dr === pid) Object.assign(S.cars[p.car.i], { x: p.car.x, z: p.car.z, h: p.car.h, s: p.car.s });
  };
  const near = (ps, x, z, r) => Math.hypot(ps.x - x, ps.z - z) < (r || C.REACH);

  Sim.act = (pid, m) => {
    if (Array.isArray(m.p) && m.p.every(v => isFinite(v)) && pose[pid]) Object.assign(pose[pid], { x: +m.p[0], y: +m.p[1], z: +m.p[2], yaw: +m.p[3] });
    const P = S.pl[pid], ps = pose[pid];
    if (!P || !ps || S.over) return;
    if (P.stun > S.rt && m.a !== 'exit') return;
    const sel = U.clamp(m.sel | 0, 0, 2), held = P.inv[sel];
    Sim.dirty = true;
    switch (m.a) {
      case 'use': use(pid, P, ps, sel, held, String(m.id || '')); break;
      case 'drop': if (held) { P.inv[sel] = null; spawnItem(held, ps.x - Math.sin(ps.yaw) * 0.8, 0.8, ps.z - Math.cos(ps.yaw) * 0.8, [0, 0, 0]); sfx('drop', ps.x, ps.z); } break;
      case 'throw': if (held && !IT.bulky(held) && Array.isArray(m.v)) {
        P.inv[sel] = null;
        const v = m.v.map(x => U.clamp(+x || 0, -20, 20));
        const o = spawnItem(held, ps.x, (ps.y || 0) + 1.5, ps.z, v); o.thr = pid; sfx('whoosh', ps.x, ps.z);
      } break;
      case 'hit': hit(pid, ps, String(m.id || '')); break;
      case 'exit': {
        const c = S.cars[m.car | 0];
        if (c && c.dr === pid) { c.dr = null; c.s = 0; if (isFinite(m.x) && isFinite(m.z)) Object.assign(c, { x: +m.x, z: +m.z, h: +m.h || 0 }); P.car = null; }
        break;
      }
      case 'eliott': {
        const n = npcs.eliott; if (!near(ps, n.x, n.z, 7)) return;
        const succ = U.clamp(m.succ | 0, 0, 3), mat = ['acier', 'alu', 'inox'].includes(m.mat) ? m.mat : 'acier';
        for (let i = 0; i < succ; i++) { const [x, z] = dockSpot('aciers'); spawnItem({ type: 'matiere', d: { mat, q: 3 } }, x, 0, z); }
        say(n, succ ? `Ok-${succ}-caisse${succ > 1 ? 's' : ''}-sur-le-quai-salut !` : "Bon-t'as-rien-suivi-reviens-plus-tard !");
        if (succ) note(pid, `📦 ${succ} caisse(s) de ${ML.MATERIALS[mat].label} sur le quai d'Aciers de l'Ouest.`, 'good');
        break;
      }
      case 'coco': {
        const n = npcs.coco; if (!near(ps, n.x, n.z, 7)) return;
        const [x, z] = dockSpot('outipro'); spawnItem({ type: 'matiere', d: { t: 1 } }, x, 0, z);
        say(n, 'Merci de m\'avoir écouté ! Tiens, ta caisse d\'outils.');
        note(pid, "🗃️ Caisse d'outils sur le quai d'Outi'Pro (2 plaquettes, 2 fraises, 2 forets).", 'good');
        break;
      }
      case 'sub': {
        const comp = m.comp === 'fonderie' ? 'fonderie' : 'chaudro', n = npcs[COMP[comp].npc];
        if (!near(ps, n.x, n.z, 7)) return;
        const o = S.orders.find(x => x.id === m.oid);
        if (!o || stage(o) !== comp || o.q) return;
        o.q = true; S.subs[comp].push({ oid: o.id, end: S.rt + C.SUB_SEC });
        say(n, comp === 'fonderie' ? `Je coule le brut de la #${o.id}. Repasse dans ${C.SUB_SEC} s !` : U.pick(ML.LINES.nono));
        break;
      }
    }
  };

  function use(pid, P, ps, sel, held, id) {
    const [kind, a, b] = id.split(':');
    if (kind === 'rack' || kind === 'tool' || kind === 'coffee' || kind === 'reception' || kind === 'mach') {
      const t = ML.World.target(id); if (!t || !near(ps, t.x, t.z, t.r + 2.5)) return;
    }
    switch (kind) {
      case 'rack': if (!ML.MATERIALS[a] || S.stock[a] === undefined) return;
        if (S.stock[a] <= 0) return note(pid, `Rupture de ${ML.MATERIALS[a].label} ! Commande chez Eliott (Aciers de l'Ouest).`, 'warn');
        if (give(pid, { type: 'brut_' + a, d: {} }, sel)) { S.stock[a]--; sfx('pickup', ps.x, ps.z); } return;
      case 'tool': if (!ML.TOOLS[a]) return;
        if (S.stock[a] <= 0) return note(pid, `Plus de ${ML.TOOLS[a].label.toLowerCase()} ! Va chez Outi'Pro (Coco).`, 'warn');
        if (give(pid, { type: a, d: {} }, sel)) { S.stock[a]--; sfx('pickup', ps.x, ps.z); } return;
      case 'coffee': P.coffee = S.rt + 40; note(pid, '☕ Un petit noir : sprint plus long pendant 40 s.', 'good'); return;
      case 'reception':
        if (!held || held.type !== 'matiere') return;
        P.inv[sel] = null;
        if (held.d.mat) { S.stock[held.d.mat] += held.d.q; all(`+${held.d.q} ${ML.MATERIALS[held.d.mat].label} en stock (merci ${P.name}).`, 'good'); }
        else { S.stock.plaquette += 2; S.stock.fraise += 2; S.stock.foret += 2; all(`+2 plaquettes, +2 fraises, +2 forets en stock (merci ${P.name}).`, 'good'); }
        sfx('success', ps.x, ps.z); return;
      case 'mach': return machineUse(pid, P, sel, held, a);
      case 'item': {
        const o = S.items.find(x => x.id === +a); if (!o || !near(ps, o.x, o.z, 3.5)) return;
        if (o.type === 'find') { removeItem(o); return applyFind(o.d.k, pid); }
        const it = strip(o); if (!canTake(P, it)) return give(pid, it, sel);
        if (give(pid, it, sel)) { removeItem(o); sfx('pickup', ps.x, ps.z); }
        return;
      }
      case 'car': return carUse(pid, P, ps, sel, held, +a, b);
      case 'pl': {
        const T = S.pl[a], tp = pose[a]; if (!T || !tp || !held || !near(ps, tp.x, tp.z, 3.5)) return;
        if (!canTake(T, held)) return note(pid, `${T.name} a les mains pleines.`, 'warn');
        P.inv[sel] = null; give(a, held);
        note(a, `${P.name} te passe : ${IT.name(held)}`, 'good'); sfx('pickup', tp.x, tp.z); return;
      }
      case 'npc': return npcUse(pid, P, ps, sel, held, a);
    }
  }

  function machineUse(pid, P, sel, held, mid) {
    const M = S.machines[mid], def = MDEF(mid); if (!M) return;
    const op = npcs[def.op];
    if (!held) { if (op.state === 'pause' || op.state === 'forgot') wake(op, pid); return; }
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
        o = cand.filter(x => x.mtype === def.type).sort((p, q) => p.dl - q.dl)[0];
        if (!o) return note(pid, cand.length ? `La commande #${cand[0].id} en ${ML.MATERIALS[mat].label} se fait sur une ${ML.MTYPE[cand[0].mtype]}, pas ici !` : `Aucun ticket n'attend du ${ML.MATERIALS[mat].label} à usiner.`, 'warn');
      }
      P.inv[sel] = null; o.m = mid;
      M.job = { oid: o.id, tool: false, need: o.tool, prog: 0, total: C.PROD_SEC * (o.src ? 1.25 : 1), wrong: false };
      say(op, `#${o.id} : il me faut ${ML.TOOLS[o.tool].label === 'Fraise' ? 'une fraise' : ML.TOOLS[o.tool].label === 'Foret' ? 'un foret' : 'une plaquette'} !`);
      sfx('drop', def.x, def.z); return;
    }
    if (t.kind === 'tool') {
      if (!M.job) return note(pid, `Donne d'abord un brut à ${mid}.`, 'warn');
      if (M.job.tool) return note(pid, `${mid} a déjà son outil.`, 'warn');
      if (t.tool !== M.job.need) {
        if (def.op !== 'marius') return say(op, `C'est pas le bon outil ! Il me faut : ${ML.TOOLS[M.job.need].label}.`);
        M.job.wrong = true;                       // Marius usine sans réfléchir : lot non conforme
      }
      P.inv[sel] = null; M.job.tool = true;
      say(op, def.op === 'marius' ? 'Reçu. Exécution.' : U.pick(['C\'est parti !', 'Nickel, je lance.', 'Ça tourne !']));
      return;
    }
    if (held.type === 'viennoiseries' && def.op === 'matis') return feedMatis(pid, P, sel, op);
    note(pid, 'Ça ne sert à rien sur une machine.', 'warn');
  }
  function feedMatis(pid, P, sel, op) {
    P.inv[sel] = null; op.hunger = 0; S.buffs.matis = S.rt + 90;
    if (op.state !== 'work') backToWork(op);
    say(op, 'MIAM ! Je suis une machine maintenant !'); all(`🥐 ${P.name} a nourri Matis : +40 % pendant 90 s.`, 'good');
  }

  function npcUse(pid, P, ps, sel, held, id) {
    const n = npcs[id]; if (!n || !near(ps, n.x, n.z, 4.5)) return;
    if (OPS[id]) {
      if (n.state === 'pause' || n.state === 'forgot') return wake(n, pid);
      if (held && held.type === 'viennoiseries' && id === 'matis') return feedMatis(pid, P, sel, n);
      if (held) return machineUse(pid, P, sel, held, OPS[id]);
      return say(n, U.pick(ML.LINES[id]));
    }
    if (id === 'lebec') return say(n, U.pick(ML.LINES.lebec));
    const comp = n.comp, C2 = COMP[comp];
    switch (C2.kind) {
      case 'boulangerie': if (give(pid, { type: 'viennoiseries', d: {} }, sel)) say(n, 'Tiens mon grand, c\'est la maison qui offre !'); return;
      case 'tth': {
        if (!held || held.type !== 'caisse') return say(n, U.pick(ML.LINES.maurseau));
        const o = S.orders.find(x => x.id === held.d.oid);
        if (!o || stage(o) !== 'tth') return say(n, 'Celle-là, elle n\'a pas besoin de traitement thermique !');
        P.inv[sel] = null; o.q = true; S.subs.tth.push({ oid: o.id, end: S.rt + C.SUB_SEC, nc: !!held.d.nc });
        return say(n, `Au four la #${o.id} ! Reviens dans ${C.SUB_SEC} s, WOUHOU !`);
      }
      case 'client': if (held && held.type === 'caisse') return deliver(pid, P, sel, held, comp, n); return say(n, U.pick(ML.LINES[id] || ['Bonjour !']));
      default: return say(n, U.pick(ML.LINES[id] || ['Oui ?']));
    }
  }

  function carUse(pid, P, ps, sel, held, i, part) {
    const c = S.cars[i]; if (!c || !near(ps, c.x, c.z, 6)) return;
    if (part === 'door') {
      if (c.dr || P.car !== null) return;
      if (P.inv.some(x => x && IT.bulky(x))) { note(pid, 'Pose ta caisse dans la benne avant de conduire.', 'warn'); return; }
      c.dr = pid; P.car = i; ev.push({ e: 'drive', to: pid, car: i }); return;
    }
    if (held && IT.bulky(held)) {
      if (c.bed.length >= C.CAR.cap) return note(pid, 'La benne est pleine.', 'warn');
      P.inv[sel] = null; c.bed.push(held); sfx('drop', c.x, c.z); return;
    }
    if (!c.bed.length) return;
    let idx = c.bed.length - 1;
    // on reprend en priorité ce qui sert ici
    let here = null; for (const k in ML.LOC.comp) if (Math.hypot(ML.LOC.comp[k].dock.x - c.x, ML.LOC.comp[k].dock.z - c.z) < 25) here = k;
    const fits = it => { if (it.type !== 'caisse') return here === null && U.inWorkshop({ x: c.x, z: c.z - 10 }); const o = S.orders.find(x => x.id === it.d.oid); return o && ((here === o.client && stage(o) === 'livraison') || (here === 'tth' && stage(o) === 'tth')); };
    const j = c.bed.findIndex(fits); if (j >= 0) idx = j;
    const it = c.bed[idx];
    if (give(pid, it, sel)) { c.bed.splice(idx, 1); sfx('pickup', c.x, c.z); }
  }

  /* ======================= Coups, Lebec, trouvailles ======================= */
  function hit(pid, ps, id) {
    const [kind, a] = id.split(':');
    if (kind === 'npc') { const n = npcs[a]; if (n && near(ps, n.x, n.z, 3)) npcHit(n, pid); }
    else if (kind === 'pl') { const tp = pose[a]; if (S.pl[a] && S.pl[a].car === null && tp && near(ps, tp.x, tp.z, 3)) playerHit(a, pid, 1.2); }
  }
  function npcHit(n, by) {
    if (n.stun > 0.3) return;
    n.stun = 0.7; sfx('punch', n.x, n.z);
    const ps = pose[by]; if (ps) { const dx = n.x - ps.x, dz = n.z - ps.z, d = Math.hypot(dx, dz) || 1; n.x += dx / d * 0.6; n.z += dz / d * 0.6; U.resolveCircle(n, 0.3); }
    if (n.id === 'lebec') { say(n, "TU M'AS FRAPPÉ ?! COUP DE PELLE !!!", true); S.anger = 100; startChase(by); return; }
    if (OPS[n.id] && ['pause', 'toPause', 'forgot'].includes(n.state)) { backToWork(n); say(n, n.id === 'brieuc' ? 'Mmh. D\'accord. J\'y vais.' : 'Aïe ! OK OK, j\'y retourne !'); }
    else say(n, n.id === 'marius' ? 'Choc détecté. Je continue.' : U.pick(['Aïe !', 'Hé ! Ça va pas ?!', 'Ouille !']));
    witness(by, n.x, n.z);
  }
  function playerHit(tid, by, dur) {
    const T = S.pl[tid]; if (!T || T.stun > S.rt) return;
    T.stun = S.rt + dur;
    const tp = pose[tid] || { x: 0, z: 0, yaw: 0 };
    const i = T.inv.findIndex(x => x);
    if (i >= 0 && T.car === null) { const it = T.inv[i]; T.inv[i] = null; spawnItem(it, tp.x + 0.6, 0.8, tp.z + 0.4, [rng() - 0.5, 2, rng() - 0.5]); }
    ev.push({ e: 'stun', to: tid, d: dur, by }); sfx('punch', tp.x, tp.z);
    if (by) { note(tid, `${S.pl[by] ? S.pl[by].name : '?'} t'a mis une claque !`, 'warn'); witness(by, tp.x, tp.z); }
  }
  function witness(pid, x, z) {
    const L = npcs.lebec;
    if (!U.inWorkshop({ x, z }) || Math.hypot(L.x - x, L.z - z) > 24 || S.chase) return;
    let add = C.LEBEC.hit; if (S.buffs.calm > S.rt) add *= 0.3;
    S.anger = Math.min(100, S.anger + add);
    say(L, "JE T'AI VU ! ON NE FRAPPE PAS LES COLLÈGUES !");
    note(pid, `😡 Lebec t'a vu (colère ${Math.round(S.anger)}/100). À 50 : coup de pelle !`, 'warn');
    if (S.anger >= C.LEBEC.chaseAt) startChase(pid);
  }
  function startChase(pid) {
    S.chase = pid; const L = npcs.lebec; L.state = 'chase'; L.chaseT = 0; L.repath = 0; L.shoutT = 0;
    big('« COUP DE PELLE ! »', '#ff3b30', pid); all(`🪓 Lebec poursuit ${S.pl[pid] ? S.pl[pid].name : '?'} avec sa pelle !`, 'warn');
  }
  function coupDePelle(pid) {
    const P = S.pl[pid], tp = pose[pid] || { x: 0, z: 0 };
    P.stun = S.rt + 3;
    P.inv.forEach((it, i) => { if (it) { spawnItem(it, tp.x + (rng() - 0.5) * 1.5, 0.8, tp.z + (rng() - 0.5) * 1.5, [rng() - 0.5, 2, rng() - 0.5]); P.inv[i] = null; } });
    ev.push({ e: 'pelle', to: pid }); sfx('bong', tp.x, tp.z);
    S.anger = C.LEBEC.base + 10; S.chase = null; S.score = Math.max(0, S.score - 5);
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
    }
    big(`★ ${who} a trouvé : ${F.name} !`, '#ffd257'); all(`★ Trouvaille (${S.finds.got}/${S.finds.total}) : ${F.name} — ${F.desc}`, 'good'); sfx('find');
  }

  /* ======================= PNJ ======================= */
  function route(n, x, z) {
    const pts = [], A = -1.2, inW = U.inWorkshop(n), tW = U.inWorkshop({ x, z });
    if (inW && tW) {
      if (Math.abs(n.z - A) > 2 && Math.abs(z - n.z) > 1.2) pts.push({ x: n.x, z: A });
      if (Math.abs(z - A) > 2 && (pts.length || Math.abs(x - n.x) > 1.2)) pts.push({ x, z: A });
    } else if (inW && !tW) { if (Math.abs(n.z - A) > 2) pts.push({ x: n.x, z: A }); pts.push({ x: 0, z: A }, { x: 0, z: 16 }); }
    else if (!inW && tW) { pts.push({ x: 0, z: 16 }, { x: 0, z: A }); if (Math.abs(z - A) > 2) pts.push({ x, z: A }); }
    pts.push({ x, z }); return pts;
  }
  function walkTo(n, x, z, cb, run) { n.path = route(n, x, z); n.onArrive = cb || null; n.run = !!run; n.stuck = 0; n.stuckAll = 0; }
  function stop(n) { n.path = []; n.onArrive = null; n.run = false; }
  const atHome = n => n.home && Math.hypot(n.x - n.home.x, n.z - n.home.z) < 0.5;
  function backToWork(n) { n.state = 'work'; stop(n); }
  function wake(n, pid) {
    const chance = n.id === 'brieuc' ? 0.25 : 0.7, forgot = n.state === 'forgot';
    if (forgot || Math.random() < chance) { backToWork(n); say(n, forgot ? 'Ah ouiii ! Merci.' : U.pick(['Ouais ouais, j\'y vais...', 'Bon. D\'accord.'])); }
    else { say(n, U.pick(['Encore cinq minutes...', 'Nan.', 'J\'arrive... (il n\'arrive pas)'])); note(pid, `${n.id === 'brieuc' ? 'Brieuc' : 'Il'} ne bouge pas. Une claque (clic gauche) marcherait mieux...`); }
  }
  function workMult(n) {
    if (n.state !== 'work' || !atHome(n) || n.stun > 0) return 0;
    let k = ML.PEOPLE[n.id].op.speed;
    if (S.buffs.croissant > S.rt) k *= 1.5;
    if (n.id === 'matis') { if (S.buffs.matis > S.rt) k *= 1.4; else if (n.hunger > 60) k *= 0.5; }
    return k;
  }

  function brainOperator(n, dt) {
    const op = ML.PEOPLE[n.id].op, M = S.machines[OPS[n.id]];
    switch (n.state) {
      case 'work':
        if (!atHome(n)) { if (!n.path.length) walkTo(n, n.home.x, n.home.z); break; }
        n.faceYaw = n.home.yaw;
        if (op.lazy > 0 && Math.random() < op.lazy * 0.012 * dt * (M.job ? 1 : 1.5)) {
          if (op.traits.includes('deadstop')) { n.state = 'pause'; n.pauseT = 35 + Math.random() * 30; say(n, 'Flemme.'); }
          else { const sp = U.pick(ML.LOC.coffee); n.state = 'toPause'; walkTo(n, sp.x, sp.z, () => { n.state = 'pause'; n.pauseT = 18 + Math.random() * 20; }); say(n, 'Petite pause café...'); }
        }
        if (op.traits.includes('forgetful') && M.job && M.job.tool && Math.random() < 0.006 * dt) { n.state = 'forgot'; say(n, "Euh... j'usinais quoi déjà ?"); }
        break;
      case 'pause': n.pauseT -= dt; if (n.pauseT <= 0) { backToWork(n); say(n, 'Bon, j\'y retourne.'); } break;
    }
    if (n.id === 'matis') n.hunger = Math.min(100, n.hunger + dt * 0.45);
  }
  function brainLebec(n, dt) {
    if (n.state === 'chase') {
      const tp = pose[S.chase], P = S.pl[S.chase];
      n.chaseT += dt; n.repath -= dt; n.shoutT -= dt; n.run = true;
      if (!tp || !P) { S.chase = null; n.state = 'patrol'; return; }
      if (n.repath <= 0) { n.repath = 0.3; n.path = [{ x: tp.x, z: tp.z }]; n.onArrive = null; }
      if (n.shoutT <= 0) { n.shoutT = 3.5; say(n, 'COUP DE PELLE !', true); }
      if (P.car === null && Math.hypot(n.x - tp.x, n.z - tp.z) < C.LEBEC.reach) { coupDePelle(S.chase); n.state = 'patrol'; stop(n); return; }
      if (P.car !== null || n.chaseT > 22 || (!U.inWorkshop(tp) && Math.hypot(n.x - tp.x, n.z - tp.z) > 30)) {
        S.chase = null; n.state = 'patrol'; stop(n); say(n, 'Tu perds rien pour attendre, toi !'); S.anger = Math.max(C.LEBEC.base, S.anger - 25);
      }
      return;
    }
    n.run = false;
    if (S.anger > C.LEBEC.base) S.anger = Math.max(C.LEBEC.base, S.anger - dt * 0.6);
    if (!n.path.length) { n.wait = (n.wait || 0) - dt; if (n.wait <= 0) { const p = U.pick(ML.LOC.patrol); walkTo(n, p.x, p.z); n.wait = 3 + Math.random() * 6; } }
    n.barkT = (n.barkT || 10) - dt;
    if (n.barkT <= 0) { n.barkT = 16 + Math.random() * 14; say(n, U.pick(ML.LINES.lebec)); }
  }
  function brainShop(n, dt) {
    if (n.id === 'maurseau') {                // il court partout autour du four
      if (!n.path.length) { n.wait = (n.wait || 0) - dt; if (n.wait <= 0) { n.wait = 1 + Math.random() * 2; walkTo(n, n.home.x + (Math.random() - 0.5) * 8, n.home.z + (Math.random() - 0.5) * 2, null, true); } }
      n.runSpeed = 5;
    } else if (!atHome(n) && !n.path.length) walkTo(n, n.home.x, n.home.z);
    let best = null, bd = 6;
    for (const pid in pose) { const p = pose[pid]; const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < bd) { bd = d; best = p; } }
    n.faceYaw = best ? Math.atan2(best.x - n.x, best.z - n.z) : n.home.yaw;
  }

  function updateNpc(n, dt) {
    if (n.stun > 0) n.stun -= dt;
    if (n.tmpT > 0) n.tmpT -= dt;
    if (n.stun <= 0) { if (OPS[n.id]) brainOperator(n, dt); else if (n.id === 'lebec') brainLebec(n, dt); else brainShop(n, dt); }
    let moving = 0;
    if (n.path.length && n.stun <= 0) {
      const t = n.path[0], dx = t.x - n.x, dz = t.z - n.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { n.path.shift(); n.stuck = 0; n.stuckAll = 0; if (!n.path.length) { const cb = n.onArrive; n.onArrive = null; n.run = n.state === 'chase'; if (cb) cb(); } }
      else {
        const sp = n.run ? (n.id === 'lebec' ? C.LEBEC.run : n.runSpeed || 5) : n.speed, step = Math.min(sp * dt, d), ox = n.x, oz = n.z;
        n.x += dx / d * step; n.z += dz / d * step; U.resolveCircle(n, 0.3);
        const moved = Math.hypot(n.x - ox, n.z - oz);
        if (moved < step * 0.35) { n.stuck += dt; n.stuckAll += dt; } else n.stuck = Math.max(0, n.stuck - dt);
        if (n.stuck > 0.6) { n.stuck = 0; const s = Math.random() < 0.5 ? 1 : -1; n.path.unshift({ x: n.x - dz / d * 1.6 * s, z: n.z + dx / d * 1.6 * s }); }
        if (n.stuckAll > 4) { n.x = t.x; n.z = t.z; n.stuckAll = 0; }
        n.yaw = U.lerpAngle(n.yaw, Math.atan2(dx, dz), 10 * dt); moving = n.run ? 2 : 1;
      }
    } else if (n.faceYaw != null) n.yaw = U.lerpAngle(n.yaw, n.faceYaw, 5 * dt);
    n.mv = moving;
  }
  function bubble(n) {
    if (n.tmpT > 0) return n.tmp;
    if (OPS[n.id]) {
      if (n.state === 'pause' || n.state === 'toPause') return n.id === 'brieuc' ? '💤 Flemme...' : '☕ En pause';
      if (n.state === 'forgot') return "❔ J'usinais quoi déjà ?";
      const M = S.machines[OPS[n.id]];
      if (M.job && !M.job.tool) return '❓ ' + ML.TOOLS[M.job.need].label + ' ?';
      if (n.id === 'matis' && n.hunger > 60 && !(S.buffs.matis > S.rt)) return "🥐 J'ai faim...";
      return '';
    }
    if (n.id === 'lebec') return n.state === 'chase' ? 'COUP DE PELLE !' : '';
    const q = n.comp && S.subs[n.comp === 'tth' ? 'tth' : n.comp];
    if (q && q.length) return `🔥 #${q[0].oid} : ${Math.ceil(q[0].end - S.rt)} s`;
    return '';
  }

  /* ======================= Physique des objets ======================= */
  function updateItems(dt) {
    for (const o of S.items) {
      if (o.rest) continue;
      o.vy -= 20 * dt;
      const ox = o.x, oz = o.z;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.y < 6.5 && U.inCollider(o.x, o.z, 0.05)) { o.x = ox; o.z = oz; o.vx *= -0.3; o.vz *= -0.3; if (o.thr) { sfx('clang', o.x, o.z); o.thr = null; } }
      if (o.thr) {
        for (const id in npcs) { const n = npcs[id]; if (Math.hypot(o.x - n.x, o.z - n.z) < 0.6 && o.y < 2) { npcHit(n, o.thr); o.thr = null; o.vx *= -0.2; o.vz *= -0.2; o.vy = 1.5; break; } }
        if (o.thr) for (const pid in pose) { if (pid === o.thr || !S.pl[pid] || S.pl[pid].car !== null) continue; const p = pose[pid]; if (Math.hypot(o.x - p.x, o.z - p.z) < 0.55 && o.y < 2) { playerHit(pid, o.thr, 1.2); o.thr = null; o.vx *= -0.2; o.vz *= -0.2; break; } }
      }
      if (o.y <= 0) { o.y = 0; if (Math.abs(o.vy) > 2.5) o.vy *= -0.3; else o.vy = 0; o.vx *= 0.55; o.vz *= 0.55; if (o.vx * o.vx + o.vz * o.vz + o.vy * o.vy < 0.05) { o.rest = true; o.thr = null; Sim.dirty = true; } }
    }
  }

  /* ======================= Boucle ======================= */
  Sim.step = dt => {
    if (S.over) return;
    S.rt += dt;
    updateOrders(dt);
    // machines
    for (const def of ML.MACHINES) {
      const M = S.machines[def.id], op = npcs[def.op], prev = M.status;
      if (!M.job) M.status = 'idle';
      else if (!M.job.tool) M.status = 'wait';
      else {
        const k = workMult(op);
        if (k > 0) { M.job.prog += dt * k; M.status = 'run'; } else M.status = 'stop';
        if (M.job.prog >= M.job.total) {
          const o = S.orders.find(x => x.id === M.job.oid), [x, z] = expeditionSpot();
          if (o) { o.m = null; o.si++; spawnItem({ type: 'caisse', d: { oid: o.id, nc: M.job.wrong || undefined } }, x, 1.2, z, [0, 0, 0]); all(`✔ ${def.id} a fini la #${o.id} → caisse en EXPÉDITION${stage(o) === 'tth' ? ' (à traiter chez TTH Ouest)' : ''}.`, 'good'); sfx('success', def.x, def.z); }
          M.job = null; M.status = 'idle';
        }
      }
      if (prev !== M.status) Sim.dirty = true;
    }
    // sous-traitants
    for (const k in S.subs) {
      for (const j of S.subs[k].slice()) {
        if (S.rt < j.end) continue;
        S.subs[k].splice(S.subs[k].indexOf(j), 1);
        const o = S.orders.find(x => x.id === j.oid); if (!o) continue;
        const comp = k === 'tth' ? 'tth' : k, [x, z] = dockSpot(comp);
        if (k === 'tth') spawnItem({ type: 'caisse', d: { oid: o.id, nc: j.nc || undefined } }, x, 0, z);
        else spawnItem({ type: 'brut_sp', d: { oid: o.id, mat: k === 'fonderie' ? 'fonte' : 'soude' } }, x, 0, z);
        o.si++; o.q = false;
        all(k === 'tth' ? `🔥 Caisse #${o.id} traitée : à récupérer chez TTH Ouest.` : `🧱 Brut de la #${o.id} prêt sur le quai de ${COMP[k].name}.`, 'good');
        Sim.dirty = true;
      }
    }
    for (const id in npcs) updateNpc(npcs[id], dt);
    // voitures conduites : petits PNJ bousculés
    for (const c of S.cars) if (c.dr && Math.abs(c.s) > 3) for (const id in npcs) { const n = npcs[id]; if (Math.hypot(n.x - c.x, n.z - c.z) < 2 && n.stun <= 0) { n.stun = 0.6; const dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot(dx, dz) || 1; n.x += dx / d * 1.5; n.z += dz / d * 1.5; U.resolveCircle(n, 0.3); say(n, 'Eh oh ! Regarde où tu roules !'); } }
    updateItems(dt);
    for (const pid in S.pl) if (S.pl[pid].stun && S.pl[pid].stun < S.rt) S.pl[pid].stun = 0;
    if (S.rt >= C.SHIFT_SEC) end();
  };
  function end() {
    S.over = true; Sim.dirty = true;
    const k = 1 + 0.35 * (Math.max(1, S.n) - 1), stars = S.score >= 260 * k ? 3 : S.score >= 160 * k ? 2 : S.score >= 80 * k ? 1 : 0;
    ev.push({ e: 'end', res: { score: S.score, served: S.served, failed: S.failed, stars, finds: S.finds.got, findsTotal: S.finds.total, sat: Math.round(S.sat), need: [80, 160, 260].map(v => Math.round(v * k)) } });
  }

  /* ======================= Instantanés ======================= */
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  Sim.fast = () => ({
    k: 'f', rt: r1(S.rt),
    n: Object.values(npcs).map(n => [n.id, r2(n.x), r2(n.z), r2(n.yaw), n.mv || 0, n.stun > 0 ? 's' : n.state === 'chase' ? 'c' : n.state === 'pause' || n.state === 'toPause' ? 'p' : n.state === 'forgot' ? 'f' : n.state === 'listen' ? 'b' : 'w', bubble(n)]),
    i: S.items.filter(o => !o.rest).map(o => [o.id, r2(o.x), r2(o.y), r2(o.z), r1(o.ry)]),
    c: S.cars.map(c => [r2(c.x), r2(c.z), r2(c.h), c.dr || 0])
  });
  Sim.slow = () => {
    Sim.dirty = false;
    return {
      k: 's', S: {
        rt: S.rt, score: S.score, sat: S.sat, served: S.served, failed: S.failed, over: S.over, stock: S.stock, orders: S.orders,
        machines: S.machines, pl: S.pl, cars: S.cars.map(c => ({ x: c.x, z: c.z, h: c.h, dr: c.dr, bed: c.bed, name: c.name })),
        items: S.items.map(o => [o.id, o.type, o.d, r2(o.x), r2(o.y), r2(o.z), r1(o.ry)]), subs: S.subs, finds: S.finds, buffs: S.buffs, anger: S.anger, chase: S.chase
      }
    };
  };
  /** Un joueur a quitté pour de bon : on libère sa voiture et on lâche ses objets */
  Sim.removePlayer = pid => {
    const P = S && S.pl[pid]; if (!P) return;
    const p = pose[pid] || { x: 0, z: 0 };
    P.inv.forEach(it => { if (it) spawnItem(it, p.x, 0.5, p.z, [0, 0, 0]); });
    for (const c of S.cars) if (c.dr === pid) c.dr = null;
    delete S.pl[pid]; delete pose[pid]; if (S.chase === pid) S.chase = null;
    S.n = Object.keys(S.pl).length; Sim.dirty = true;
  };
})();
