/* =====================================================================
   sim_eco.js — ÉCONOMIE & GESTION (hôte), V4 :
   - le PC de gestion (ERP) : accepter les demandes, planifier une machine,
     acheter (machines, équipements, améliorations), commander chez les
     fournisseurs (livraison avec délai), embaucher / licencier ;
   - les livraisons des fournisseurs (camion qui arrive à l'atelier) ;
   - les PARTICULIERS : ils se garent sur le parking clients et viennent
     au comptoir demander une pièce urgente très bien payée ;
   - le CONCESSIONNAIRE (Garage Pasquier) : acheter des véhicules ;
   - le personnel IA : Tony (cariste) et Jojo (livreur, tournées).
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, C = ML.CFG, IT = ML.Items, COMP = ML.COMPANIES, ECO = ML.ECO;
  let S, rng, npcs;
  const mod = {};
  const OUT = { x: 0, z: 24 };

  mod.init = () => {
    S = K.S; rng = K.rng; npcs = K.npcs;
    K.partT = S.campaign && S.day < 2 ? 9e9 : 70 + rng() * 60;
    K.tour = null; S.tour = null; K.tonyT = 0; K.jojoT = 0;
    for (const k in ML.AI_STAFF) if (S.ai[k]) aiArrive(k, true);
  };

  /* ---------- Outils ---------- */
  const name = pid => (S.pl[pid] ? S.pl[pid].name : 'Quelqu\'un');
  K.receptionSpot = () => {
    const R = ML.LOC.reception;
    for (let i = 0; i < 12; i++) { const x = R.x - 2.6 + (i % 6) * 1.05, z = R.z - 1.2 + Math.floor(i / 6) * 1.2; if (!S.items.some(o => Math.hypot(o.x - x, o.z - z) < 0.6)) return [x, z]; }
    return [R.x, R.z];
  };
  /** Commande chez un fournisseur (livrée par camion après un délai) */
  /** Commande « automatique » d'un lot (Sylvie) : rangée directement en stock à l'arrivée */
  K.supplyOrder = (pid, k, n, who) => {
    const L = ML.SUPPLY[k]; if (!L) return false;
    const q = L.lot * U.clamp(n | 0, 1, 5), price = L.price * q + ECO.fee;
    if (!K.spend(pid, price, 'achat', L.name)) return false;
    const d = ECO.supplierDelay, eta = S.rt + d[0] + rng() * (d[1] - d[0]);
    S.deliv.push({ id: S.nextId++, k, q, eta, from: L.from, name: `${L.name} ×${q}` });
    K.all(`🛒 ${who || name(pid)} a commandé ${L.name} ×${q} (${price} € port compris) : livraison dans ~${Math.round((eta - S.rt) / 60 * 10) / 10} min.`, 'info');
    Sim.dirty = true; return true;
  };
  /** Commande du panier du PC : tout arrive dans UN colis en réception */
  K.cartOrder = (pid, cart) => {
    const c = {}; let units = 0, price = 0;
    for (const k in ML.SUPPLY) { const q = U.clamp((cart && cart[k]) | 0, 0, ML.CART_MAX); if (q) { c[k] = q; units += q; price += q * ML.SUPPLY[k].price; } }
    if (!units) return false;
    if (units > ML.CART_MAX) { K.note(pid, `Un colis contient au plus ${ML.CART_MAX} articles.`, 'warn'); return false; }
    price += ECO.fee;
    if (!K.spend(pid, price, 'achat', 'la commande')) return false;
    const d = ECO.supplierDelay, eta = S.rt + d[0] + rng() * (d[1] - d[0]);
    S.deliv.push({ id: S.nextId++, cart: c, eta, from: 'aciers', name: `Colis fournisseurs (${units} article${units > 1 ? 's' : ''})` });
    K.all(`🛒 ${name(pid)} a passé commande : ${Object.keys(c).map(k => c[k] + ' × ' + ML.SUPPLY[k].name).join(', ')} — ${price} € port compris. Colis livré en RÉCEPTION dans ~${Math.round((eta - S.rt) / 60 * 10) / 10} min.`, 'info');
    Sim.dirty = true; return true;
  };
  const isCatOwned = k => {
    const it = ML.CATALOG[k];
    if (it.mach) return !!S.machines[it.mach];
    if (it.veh) return S.owned.includes(it.veh);
    return (S.up[k] || 0) >= (it.max || 1);
  };
  K.isCatOwned = isCatOwned;

  /* ---------- Personnel ---------- */
  function opArrive(id) {
    const n = npcs[id]; Object.assign(n, { active: true, x: OUT.x + (rng() - 0.5) * 2, z: OUT.z, state: 'work', path: [], stun: 0 });
    K.assignOps(); if (n.home) K.walkTo(n, n.home.x, n.home.z);
    K.say(n, ML.line(id, 'embauche', ML.PEOPLE[id].op.traits.includes('apprenti') ? 'Bonjour ! C\'est mon premier jour…' : ML.line(id, null, 'Bonjour !')));
  }
  function aiArrive(k, instant) {
    const A = ML.AI_STAFF[k], n = npcs[A.npc], sp = ML.LOC.aiSpots[A.npc];
    Object.assign(n, { active: true, state: 'ai', path: [], stun: 0, home: sp, speed: 2.4 });
    if (instant) Object.assign(n, { x: sp.x, z: sp.z, yaw: sp.yaw }); else { n.x = OUT.x; n.z = OUT.z; K.walkTo(n, sp.x, sp.z); }
    Sim.dirty = true;
  }
  function goAway(n, line) {
    if (line) K.say(n, line);
    n.state = 'leave'; K.walkTo(n, OUT.x, OUT.z + 4, () => { n.active = false; n.state = 'away'; Sim.dirty = true; });
  }

  /* ---------- PC de gestion ---------- */
  function erp(pid, P, m) {
    switch (m.op) {
      case 'accept': if (!K.accept(+m.id, pid)) K.note(pid, 'Cette demande n\'est plus disponible.', 'warn'); return;
      case 'refuse': { const i = S.props.findIndex(p => p.id === +m.id); if (i >= 0) { const p = S.props.splice(i, 1)[0]; K.all(`🗑 ${name(pid)} a refusé la demande de ${COMP[p.client].name} (${p.part}).`, 'info'); Sim.dirty = true; } return; }
      case 'plan': {
        const o = S.orders.find(x => x.id === +m.id); if (!o || o.m || K.stage(o) !== 'usinage' && !o.src) return;
        const mid = String(m.mid || ''), def = ML.MACHINES.find(x => x.id === mid);
        if (!mid) { o.plan = null; Sim.dirty = true; return; }
        if (!S.machines[mid] || !def || def.type !== o.mtype) return K.note(pid, `La #${o.id} se fait sur une ${ML.MTYPE[o.mtype]}.`, 'warn');
        o.plan = mid; Sim.dirty = true; K.note(pid, `📌 #${o.id} prévue sur ${mid}.`, 'good'); return;
      }
      case 'buy': {
        const k = String(m.k), it = ML.CATALOG[k]; if (!it) return;
        if (isCatOwned(k)) return K.note(pid, `${it.name} : déjà acheté.`, 'warn');
        if (it.need && !S.up[it.need]) return K.note(pid, `Il faut d'abord : ${ML.CATALOG[it.need].name}.`, 'warn');
        if (!K.spend(pid, it.price, 'invest', it.name)) return;
        if (it.mach) {
          S.machines[it.mach] = { status: 'idle', job: null, op: null, wear: 0, broken: false, plan: null, bin: true, chips: 0 };
          ML.World.syncMachines(S); K.assignOps();
          const def = ML.MACHINES.find(x => x.id === it.mach);
          K.big(`🏭 ${it.mach} installée !`, '#ffd257'); K.sfx('success', def.x, def.z);
          K.all(`🏭 ${name(pid)} a acheté ${it.name} (${it.price} €). ${S.staff.filter(id => ML.PEOPLE[id].op).length < Object.keys(S.machines).length ? 'Pas assez d\'opérateurs : ils vont jongler (ou embauche au PC, onglet RH).' : ''}`, 'good');
        } else if (it.veh) {
          S.owned.push(it.veh);
          const p = it.veh === 'tp' ? ML.LOC.tpSpawn : ML.LOC.fenSpawn;
          K.addCar(it.veh, { x: p.x, z: p.z, h: p.h });
          K.all(`🚜 ${name(pid)} a acheté : ${it.name} (${it.price} €). Il attend ${it.veh === 'tp' ? 'dans l\'atelier' : 'devant le quai gros colis'}.`, 'good');
        } else {
          S.up[k] = (S.up[k] || 0) + 1;
          if (k === 'frigo') npcs.matis.hunger = -999;
          K.all(`🛠 ${name(pid)} a acheté : ${it.name} (${it.price} €)${it.now ? '' : ' — installé demain matin'}.`, 'good');
        }
        K.sfx('cash'); Sim.dirty = true; return;
      }
      case 'supply': K.supplyOrder(pid, String(m.k), m.n); return;
      case 'order': K.cartOrder(pid, m.cart); return;
      case 'unsub': { const k = String(m.k), it = ML.CATALOG[k]; if (!it || !it.daily || !S.up[k]) return; delete S.up[k]; K.all(`✂ ${name(pid)} a résilié : ${it.name}.`, 'info'); Sim.dirty = true; return; }
      case 'subpc': {
        const o = S.orders.find(x => x.id === +m.id); if (!o || o.q) return;
        const st = K.stage(o); if (st !== 'fonderie' && st !== 'chaudro') return;
        if (!K.spend(pid, ECO.subPC[st], 'achat', 'le brut')) return;
        o.q = true; const d = ECO.subDelay, eta = S.rt + d[0] + rng() * (d[1] - d[0]);
        S.deliv.push({ id: S.nextId++, oid: o.id, sub: st, eta, from: st, name: `Brut ${st === 'fonderie' ? 'de fonderie' : 'mécano-soudé'} #${o.id}` });
        K.all(`🛒 ${name(pid)} a commandé le brut de la #${o.id} chez ${COMP[st].name} (${ECO.subPC[st]} €) : livré à l'atelier dans ~${Math.round((eta - S.rt) / 6) / 10} min.`, 'info');
        Sim.dirty = true; return;
      }
      case 'hire': {
        const id = String(m.id);
        if (id.startsWith('ai:')) {
          const k = id.slice(3), A = ML.AI_STAFF[k]; if (!A || S.ai[k]) return;
          if (!K.spend(pid, A.hire, 'invest', 'l\'embauche')) return;
          S.ai[k] = true; aiArrive(k); K.all(`🤝 ${A.name} est embauché (${A.hire} €, ${A.pay} €/jour).`, 'good'); K.sfx('cash'); Sim.dirty = true; return;
        }
        const St = ML.STAFF[id]; if (!St || S.staff.includes(id)) return;
        if (!K.spend(pid, St.hire, 'invest', 'l\'embauche')) return;
        S.staff.push(id); opArrive(id);
        K.all(`🤝 ${ML.PEOPLE[id].name} est embauché·e (${St.hire} €, ${St.pay} €/jour) !`, 'good'); K.sfx('cash'); Sim.dirty = true; return;
      }
      case 'fire': {
        const id = String(m.id);
        if (id.startsWith('ai:')) { const k = id.slice(3); if (!S.ai[k]) return; S.ai[k] = false; goAway(npcs[ML.AI_STAFF[k].npc], 'Bon. Ben salut.'); K.all(`👋 ${ML.AI_STAFF[k].name} a quitté l'entreprise.`, 'info'); Sim.dirty = true; return; }
        const i = S.staff.indexOf(id); if (i < 0) return;
        if (S.staff.filter(x => ML.PEOPLE[x].op).length <= 1) return K.note(pid, 'Il faut garder au moins un opérateur !', 'warn');
        S.staff.splice(i, 1); const n = npcs[id]; n.mids = []; n.mid = null; goAway(n, 'Ah. D\'accord. Bonne continuation…'); K.assignOps();
        K.all(`👋 ${ML.PEOPLE[id].name} quitte l'atelier (plus de salaire à verser).`, 'info'); Sim.dirty = true; return;
      }
    }
  }

  /* ---------- Particuliers ---------- */
  function partStep(dt) {
    if (S.mode === 'course') return;
    K.partT -= dt;
    if (K.partT <= 0) {
      const ev = ECO.part.every; K.partT = (ev[0] + rng() * (ev[1] - ev[0])) * (1.25 - 0.45 * K.lvl);
      const free = ML.PARTICULIERS.filter(id => !npcs[id].active), slots = ML.LOC.parkSlots.map((s, i) => i).filter(i => !S.parts.some(p => p.slot === i));
      if (S.rt < C.SHIFT_SEC - 160 && S.parts.length < 2 && free.length && slots.length) spawnPart(rng.pick(free), slots[0]);
    }
    for (const p of S.parts.slice()) {
      const n = npcs[p.id];
      if (p.st === 'wait' && S.rt > p.exp) { p.st = 'leave'; K.repAdd(-ECO.rep.expire); K.all(`🚗 ${ML.PEOPLE[p.id].name} en a eu marre d'attendre au comptoir et repart (réputation −${ECO.rep.expire}).`, 'warn'); partLeave(p, ML.line(p.id, 'marre', "Tant pis, j'irai chez UsiFlash !")); }
      if (n && n.active && (p.st === 'wait' || p.st === 'order') && !n.path.length) n.faceYaw = Math.PI;
    }
  }
  function spawnPart(id, slot) {
    const sp = ML.LOC.parkSlots[slot], n = npcs[id], [part, mat, mtype, tool] = rng.pick(ML.PART_REQ.filter(r => Object.keys(S.machines).some(m => ML.MACHINES.find(x => x.id === m).type === r[2])));
    const price = K.orderPrice(['usinage', 'livraison'], 's', false, ECO.part.mult);
    const p = { id, slot, st: 'arrive', part, mat, mtype, tool, price, dur: ECO.part.dur * K.D.dur, exp: 0, oid: null };
    S.parts.push(p); Sim.dirty = true;
    const k = S.parts.indexOf(p), cx = ML.LOC.counter.x - 0.9 + 1.8 * (k % 2), cz = ML.LOC.counter.z;
    Object.assign(n, { active: true, x: sp.x + 1.6, z: sp.z, state: 'part', path: [{ x: sp.x + 2, z: 18.5 }, { x: -1.5, z: 17.5 }, { x: -1.5, z: 13 }, { x: cx, z: cz }], onArrive: () => { p.st = 'wait'; p.exp = S.rt + ECO.part.wait; n.faceYaw = Math.PI; K.say(n, ML.line(id, 'demande', ML.LINES[id] || ['Bonjour !'])); Sim.dirty = true; }, run: false, stun: 0, speed: 2.2, comp: 'part' });
    K.all(`🚗 Un client particulier (${ML.PEOPLE[id].name}) se gare et vient au COMPTOIR : il veut une pièce urgente (${price} €) !`, 'info'); K.sfx('order');
  }
  function partLeave(p, line) {
    const n = npcs[p.id], sp = ML.LOC.parkSlots[p.slot];
    if (line) K.say(n, line);
    p.st = 'leave'; n.state = 'part';
    n.path = [{ x: -1.5, z: 13 }, { x: -1.5, z: 17.5 }, { x: sp.x + 2, z: 18.5 }, { x: sp.x + 1.6, z: sp.z }];
    n.onArrive = () => { n.active = false; n.state = 'away'; S.parts.splice(S.parts.indexOf(p), 1); Sim.dirty = true; };
    Sim.dirty = true;
  }
  function partDecide(pid, m) {
    const p = S.parts.find(x => x.id === m.id); if (!p || p.st !== 'wait') return;
    const n = npcs[p.id];
    if (!m.ok) { partLeave(p, 'Bon… je vais voir ailleurs.'); return; }
    const o = { id: S.nextOid++, client: 'part', who: p.id, part: p.part, mat: p.mat, mtype: p.mtype, tool: p.tool, steps: ['usinage', 'livraison'], si: 0, size: 's', src: null, dur: p.dur, price: p.price, t0: S.rt, dl: S.rt + p.dur, q: false, m: null, plan: null };
    S.orders.push(o); p.st = 'order'; p.oid = o.id; Sim.dirty = true;
    K.say(n, `Merci ! Je l'attends ici, ${Math.round(p.dur / 60 * 10) / 10} minutes max !`);
    K.all(`📋 Commande #${o.id} (particulier ${ML.PEOPLE[p.id].name}) : ${o.part} en ${ML.MATERIALS[o.mat].label} · ${o.price} € · à rapporter au COMPTOIR.`, 'info'); K.sfx('order');
  }

  /* ---------- Personnel IA ---------- */
  const deliverable = it => { if (!K.isPart(it) && it.type !== 'palette') return null; const o = S.orders.find(x => x.id === it.d.oid); return o && o.client !== 'part' && (K.stage(o) === 'livraison' || K.stage(o) === 'tth') ? o : null; };
  const atHomeZone = o => (Math.abs(o.x) < 34 && o.z > -15 && o.z < 32);
  function tonyStep(dt) {
    if (!S.ai.cariste) return;
    const n = npcs.tony; if (!n.active || n.state !== 'ai') return;
    const cam = S.cars.find(c => c.kind === 'camion');
    if (n.job) {
      if (n.path.length) return;
      n.jobT -= dt; if (n.jobT > 0) return;
      const o = S.items.find(x => x.id === n.job);
      if (o && cam && !cam.dr && K.bedFree(cam) >= 4) { cam.bed.push(K.strip(o)); K.removeItem(o); K.say(n, ML.line('tony')); K.sfx('drop', cam.x, cam.z); Sim.dirty = true; }
      n.job = null; K.walkTo(n, n.home.x, n.home.z); return;
    }
    K.tonyT -= dt; if (K.tonyT > 0) return; K.tonyT = 2;
    if (!cam || cam.dr || K.bedFree(cam) < 4) return;
    const o = S.items.find(x => x.type === 'palette' && x.rest && Math.hypot(cam.x - x.x, cam.z - x.z) < 40);
    if (o) { n.job = o.id; n.jobT = 3; K.walkTo(n, o.x + 1, o.z + 1); }
  }
  function jojoStep(dt) {
    if (!S.ai.livreur) return;
    const n = npcs.jojo;
    if (K.tour) {
      if (S.rt < K.tour.end) return;
      finishTour(); return;
    }
    if (!n.active || n.state !== 'ai' || n.path.length) return;
    K.jojoT -= dt; if (K.jojoT > 0) return; K.jojoT = 5;
    if (S.rt > C.SHIFT_SEC - 40) return;
    const big = S.owned.includes('camion');
    const out = S.items.filter(o => o.rest && atHomeZone(o) && deliverable(o) && (o.type !== 'palette' || big)).slice(0, 8);
    const docks = S.items.filter(o => o.rest && !atHomeZone(o) && (o.type === 'matiere' || o.type === 'brut_sp' || (K.isPart(o) && deliverable(o))) && Object.values(ML.LOC.comp).some(L => Math.hypot(L.dock.x - o.x, L.dock.z - o.z) < 9)).slice(0, 6);
    if (!out.length && !docks.length) return;
    const take = out.concat(docks);
    K.tour = { items: take.map(o => K.strip(o)), end: S.rt + 35 + 6 * take.length };
    for (const o of take) K.removeItem(o);
    S.tour = { end: K.tour.end, n: take.length };
    K.say(n, ML.line('jojo')); n.state = 'tour';
    K.walkTo(n, OUT.x, OUT.z + 6, () => { n.active = false; Sim.dirty = true; });
    K.all(`🚚 Jojo part en tournée avec ${take.length} colis (retour dans ~${Math.round(K.tour.end - S.rt)} s).`, 'info'); Sim.dirty = true;
  }
  function finishTour() {
    const T = K.tour; K.tour = null; S.tour = null;
    let del = 0, back = 0, tth = 0;
    for (const it of T.items) {
      const o = K.isPart(it) || it.type === 'palette' ? S.orders.find(x => x.id === it.d.oid) : null;
      if (o && K.stage(o) === 'livraison') { K.deliver(null, null, 0, Object.assign({}, it, { d: Object.assign({}, it.d, { npc: 0.9 }) }), o.client, npcs[COMP[o.client].npc]); del++; continue; }
      if (o && K.stage(o) === 'tth' && !o.q && S.money >= ECO.sub.tth) { K.money(-ECO.sub.tth, 'achat'); o.q = true; S.subs.tth.push({ oid: o.id, end: S.rt + C.SUB_SEC, nc: !!it.d.nc, mes: it.d.mes, type: it.type }); tth++; continue; }
      if (it.type === 'matiere') { if (it.d.mat) S.stock[it.d.mat] += it.d.q; else { S.stock.plaquette += 2; S.stock.fraise += 2; S.stock.foret += 2; } back++; continue; }
      const [x, z] = K.receptionSpot(); K.spawnItem(it, x, 0, z); back++;
    }
    const n = npcs.jojo, sp = ML.LOC.aiSpots.jojo;
    Object.assign(n, { active: true, x: OUT.x, z: OUT.z + 4, state: 'ai', path: [], stun: 0 }); K.walkTo(n, sp.x, sp.z);
    K.all(`🚚 Jojo est rentré : ${del} livraison(s)${tth ? `, ${tth} caisse(s) déposée(s) chez TTH Ouest` : ''}${back ? `, ${back} colis ramené(s) des quais` : ''}.`, 'good'); Sim.dirty = true;
  }

  /* ---------- Boucle ---------- */
  mod.step = dt => {
    for (const d of S.deliv.slice()) {
      if (S.rt < d.eta) continue;
      S.deliv.splice(S.deliv.indexOf(d), 1); Sim.dirty = true;
      if (d.k) { S.stock[d.k] += d.q; K.all(`🚚 Le camion de ${COMP[d.from].name} a livré : ${d.name} (Sylvie l'a rangé en stock).`, 'good'); K.sfx('success'); continue; }
      if (d.cart) {
        const n = Object.values(d.cart).reduce((a, b) => a + b, 0), [x, z] = K.receptionSpot();
        K.spawnItem({ type: 'colis', d: { c: d.cart, n, sz: n <= 6 ? 's' : n <= 16 ? 'm' : 'l' } }, x, 0, z);
        K.big('📦 Colis livré !', '#ffd257'); K.all(`📦 Le livreur a déposé un colis de ${n} article(s) en RÉCEPTION (zone bleue) : R pour l'ouvrir, puis range les produits (E sur le rack / l'armoire).`, 'good'); K.sfx('success'); continue;
      }
      const o = S.orders.find(x => x.id === d.oid);
      if (!o || K.stage(o) !== d.sub) continue;
      const [x, z] = K.receptionSpot(); K.spawnItem({ type: 'brut_sp', d: { oid: o.id, mat: d.sub === 'fonderie' ? 'fonte' : 'soude' } }, x, 0, z);
      o.si++; o.q = false; K.all(`🚚 Brut de la #${o.id} livré par ${COMP[d.sub].name} : il est en RÉCEPTION, à l'atelier.`, 'good'); K.sfx('success');
    }
    partStep(dt); tonyStep(dt); jojoStep(dt);
  };
  mod.brain = (n, dt) => {
    if (ML.PARTICULIERS.includes(n.id)) return true;
    if (n.id === 'tony' || n.id === 'jojo') {
      if (n.state === 'ai' && !n.path.length && n.home && !K.atHome(n) && !n.job) K.walkTo(n, n.home.x, n.home.z);
      if (n.state === 'ai' && K.atHome(n)) n.faceYaw = n.home.yaw;
      return true;
    }
    return false;
  };
  mod.bubble = n => {
    if (ML.PARTICULIERS.includes(n.id)) {
      const p = S.parts.find(x => x.id === n.id); if (!p) return '';
      if (p.st === 'wait') return `❗ Pièce urgente : ${p.price} € (E)`;
      if (p.st === 'order') { const o = S.orders.find(x => x.id === p.oid); return o ? `⏳ #${o.id} ${o.part} · ${Math.max(0, Math.ceil(o.dl - S.rt))} s` : ''; }
      return '';
    }
    if (n.id === 'tony') { const cam = S.cars.find(c => c.kind === 'camion'); return n.job ? '🚜 Je charge…' : cam ? '' : '🚜 Pas de camion…'; }
    if (n.id === 'jojo') return S.tour ? '' : '🚚 Prêt pour la tournée';
    return undefined;
  };
  mod.fast = f => { if (K.tour) f.tour = Math.max(0, Math.ceil(K.tour.end - S.rt)); };

  /* ---------- Intentions ---------- */
  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'erp': erp(pid, P, m); return true;
      case 'part': partDecide(pid, m); return true;
      case 'buycar': {
        const k = String(m.k), D = ML.DEALER[k], n = npcs.vendeur; if (!D || !n || !n.active) return true;
        if (!K.near(ps, n.x, n.z, 9)) return true;
        if (S.owned.includes(k)) { K.say(n, 'Vous l\'avez déjà, celle-là !'); return true; }
        if (!K.spend(pid, D.price, 'invest', D.name)) { K.say(n, 'Revenez avec des sous, jeune homme.'); return true; }
        S.owned.push(k); const L = ML.LOC.comp.concession, h = Math.atan2(L.tan.x, L.tan.z);
        let spot = null;                                // une place libre devant le garage (pas deux voitures au même endroit)
        for (const off of [5, 10, 0, -5, 15, -10]) { const x = L.dock.x + L.tan.x * off + L.dir.x * 3, z = L.dock.z + L.tan.z * off + L.dir.z * 3; if (!S.cars.some(c => Math.hypot(c.x - x, c.z - z) < 4.5) && !U.inCollider(x, z, 1.2)) { spot = { x, z, h }; break; } }
        K.addCar(k, spot || { x: L.dock.x + L.dir.x * 3, z: L.dock.z + L.dir.z * 3, h });
        K.say(n, `Félicitations ! ${D.name}, les clés sont dessus !`, true); K.big(`🚗 ${D.name} achetée !`, '#ffd257'); K.sfx('cash');
        K.all(`🚗 ${name(pid)} a acheté : ${D.name} (${D.price} €) au Garage Pasquier. Le véhicule attend devant le garage : allez le chercher !`, 'good');
        return true;
      }
    }
    return false;
  };
  mod.npcUse = (pid, P, ps, sel, held, n) => {
    if (ML.PARTICULIERS.includes(n.id)) {
      const p = S.parts.find(x => x.id === n.id); if (!p) return true;
      if (p.st === 'order' && K.isPart(held)) { K.deliver(pid, P, sel, held, 'part', n); return true; }
      if (p.st === 'order') { K.say(n, 'Alors, ma pièce ? Ça avance ?'); return true; }
      return true;                                   // demande : dialogue côté joueur (intention « part »)
    }
    if (n.id === 'tony' || n.id === 'jojo') { K.say(n, ML.line(n.id)); return true; }
    return false;
  };
  mod.onDeliver = (pid, o) => {
    if (o.client !== 'part') return;
    const p = S.parts.find(x => x.oid === o.id); if (!p) return;
    S.nParts++; partLeave(p, ML.line(p.id, 'merci', 'Merci !'));
  };
  mod.onFail = o => {
    if (o.client !== 'part') return;
    const p = S.parts.find(x => x.oid === o.id); if (p && p.st !== 'leave') partLeave(p, "C'est une honte ! Je le dirai à tout le village !");
  };
  Sim.mods.push(mod);
})();
