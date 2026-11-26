/* =====================================================================
   sim_city.js — VILLE (hôte) : véhicules de l'atelier (benne, essence,
   caisses qui tombent, transpalette), circulation (feux, bouchons),
   radars, gendarmerie (poursuite), station essence, mode COURSE.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, C = ML.CFG, IT = ML.Items;
  let S, rng, city, tr, pol, peds;
  const mod = {};

  mod.init = cfg => {
    S = K.S; rng = K.rng; city = ML.World.city;
    const sp = ML.LOC.carSpawn;
    /** Capacité : nombre de caisses ; le camion compte en « places » (palette = 4, caisse = 1) */
    K.capOf = kind => kind === 'tp' ? C.TP.cap : kind === 'camion' ? C.CAMION.cap : kind === 'fenwick' ? 0 : kind === 'kangoo' ? 2 : kind === 'ducato' ? 6 : S.up.grande_benne ? 6 : C.CAR.cap;
    K.bedUse = c => c.bed.reduce((a, it) => a + (c.kind === 'camion' && it.type === 'palette' ? 4 : 1), 0);
    K.bedFree = c => c.cap - K.bedUse(c);
    const car = (kind, p, extra) => Object.assign({ x: p.x, z: p.z, h: p.h || 0, s: 0, dr: null, pass: [], bed: [], kind, name: ML.VEHICLES[kind].name, cap: K.capOf(kind), fuel: 100, color: ML.VEHICLES[kind].color, frozen: 0, load: null }, extra || {});
    K.addCar = (kind, p) => { const c = car(kind, p, { fuel: kind === 'tp' || kind === 'fenwick' ? 100 : 80 }); S.cars.push(c); Sim.dirty = true; return c; };
    if (S.mode === 'course') {
      const n = Math.min(6, Math.max(2, S.n));
      for (let i = 0; i < n; i++) S.cars.push(car('megane', sp[i], { name: 'Mégane n°' + (i + 1), color: ML.RACE_COLORS[i], fuel: 100 }));
    } else {
      const o = S.owned, fuel = () => Math.round(35 + rng() * 60);
      if (o.includes('megane')) S.cars.push(car('megane', sp[0], { fuel: fuel() }));
      S.cars.push(car('kangoo', sp[1], { fuel: fuel() }));
      if (o.includes('ducato')) S.cars.push(car('ducato', sp[2], { fuel: fuel() }));
      if (o.includes('tp')) S.cars.push(car('tp', ML.LOC.tpSpawn));
      if (o.includes('fenwick')) S.cars.push(car('fenwick', ML.LOC.fenSpawn));
      if (o.includes('camion')) S.cars.push(car('camion', ML.LOC.camSpawn, { fuel: fuel() }));
    }
    // passants sur les trottoirs
    peds = K.peds = [];
    const sideE = city.edges.map((e, i) => i).filter(i => i > 0 && !city.edges[i].ring && city.edges[i].len > 20);
    for (let i = 0; i < 28 && sideE.length; i++) { const e = rng.pick(sideE); peds.push({ e, d: rng() * city.edges[e].len, dir: rng() < 0.5 ? 1 : -1, side: rng() < 0.5 ? 1 : -1, sp: 1 + rng() * 0.7, down: 0, look: i }); }
    // circulation
    tr = K.tr = [];
    const E = city.edges, long = E.map((e, i) => i).filter(i => i > 0 && E[i].len > 30);
    for (let i = 0; i < 10 && long.length; i++) tr.push({ e: rng.pick(long), d: 0, dir: rng() < 0.5 ? 1 : -1, sp: 8 + rng() * 4, v: 0, m: Math.floor(rng() * 4), honk: 0 });
    tr.forEach(t => { t.d = rng() * (E[t.e].len - 16) + 8; });
    pol = K.pol = null; K.radarCd = {}; K.revDone = {}; K.hitCd = {};
    if (S.mode === 'course') K.race = { round: 0, total: 5, next: 3, pts: {}, prev: null };
  };

  /* ---------- Circulation ---------- */
  function trPos(t) {
    const e = city.edges[t.e], A = city.nodes[t.dir > 0 ? e.a : e.b], B = city.nodes[t.dir > 0 ? e.b : e.a];
    const ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len;
    return { x: A.x + ux * t.d - uz * 2.4, z: A.z + uz * t.d + ux * 2.4, ux, uz, h: Math.atan2(ux, uz), end: t.dir > 0 ? e.b : e.a, len: e.len };
  }
  K.trPos = trPos;
  function trafficStep(dt) {
    const P = tr.map(trPos);
    tr.forEach((t, i) => {
      const p = P[i]; let target = t.sp, why = null;
      const rem = p.len - t.d;
      if (rem < 9 && city.lights.includes(p.end) && !ML.World.lightGreen(p.end, t.e % 2, S.rt) && rem > 5) target = 0;
      const block = (x, z, isPlayer) => {
        const dx = x - p.x, dz = z - p.z, al = dx * p.ux + dz * p.uz, lat = Math.abs(-dx * p.uz + dz * p.ux);
        if (al > 0 && al < 8.5 && lat < 2.4) { target = 0; if (isPlayer) why = 'p'; }
      };
      P.forEach((q, j) => { if (j !== i) block(q.x, q.z); });
      for (const c of S.cars) if (c.dr || Math.hypot(c.x - p.x, c.z - p.z) < 12) block(c.x, c.z, !!c.dr);
      for (const pid in K.pose) if (S.pl[pid] && K.foot(S.pl[pid])) block(K.pose[pid].x, K.pose[pid].z, true);
      t.v += U.clamp(target - t.v, -14 * dt, 5 * dt);
      if (why && t.v < 1) { t.honk -= dt; if (t.honk <= 0) { t.honk = 3 + rng() * 4; K.sfx('horn', p.x, p.z); } }
      t.d += t.v * dt;
      if (t.d >= p.len - 1) {
        const node = p.end, opts = city.edges.map((e, k) => k).filter(k => k !== t.e && k > 0 && (city.edges[k].a === node || city.edges[k].b === node));
        if (opts.length) { const k = rng.pick(opts); t.e = k; t.dir = city.edges[k].a === node ? 1 : -1; t.sp = city.edges[k].ring ? 14 + rng() * 4 : 8 + rng() * 4; } else t.dir = -t.dir;
        t.d = 1;
      }
      // piétons renversés
      if (t.v > 3) for (const pid in K.pose) {
        const pp = K.pose[pid], Pl = S.pl[pid]; if (!Pl || !K.foot(Pl) || (K.hitCd[pid] || 0) > S.rt) continue;
        if (Math.hypot(pp.x - p.x, pp.z - p.z) < 1.8) {
          K.hitCd[pid] = S.rt + 3; K.playerHit(pid, null, 1.2);
          K.ev({ e: 'push', to: pid, vx: p.ux * 10, vz: p.uz * 10 }); K.note(pid, '🚗 Un automobiliste t\'a renversé ! Regarde avant de traverser.', 'warn'); K.sfx('horn', p.x, p.z);
        }
      }
    });
  }

  /* ---------- Passants ---------- */
  function pedPos(p) {
    const e = city.edges[p.e], A = city.nodes[p.dir > 0 ? e.a : e.b], B = city.nodes[p.dir > 0 ? e.b : e.a];
    const ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, o = (city.RW + 0.9) * p.side;
    return { x: A.x + ux * p.d - uz * o, z: A.z + uz * p.d + ux * o, h: Math.atan2(ux, uz), end: p.dir > 0 ? e.b : e.a, len: e.len };
  }
  function pedStep(dt) {
    for (const p of peds) {
      if (p.down > 0) { p.down -= dt; continue; }
      p.d += p.sp * dt;
      const q = pedPos(p);
      if (p.d >= q.len - 2) {
        const opts = city.edges.map((e, k) => k).filter(k => k !== p.e && k > 0 && !city.edges[k].ring && (city.edges[k].a === q.end || city.edges[k].b === q.end));
        if (opts.length) { const k = rng.pick(opts); p.e = k; p.dir = city.edges[k].a === q.end ? 1 : -1; p.d = 2; } else { p.dir = -p.dir; p.d = 2; p.side = -p.side; }
      }
      for (const c of S.cars) if (c.dr && Math.abs(c.s || 0) > 4 && Math.hypot(c.x - q.x, c.z - q.z) < 1.9) {
        const J = ML.ECO.jail, n = S.pedHits[c.dr] = (S.pedHits[c.dr] || 0) + 1;
        p.down = 4; K.fine(ML.ECO.fines.ped, 'Passant renversé', c.dr); K.ev({ e: 'ped', i: peds.indexOf(p) });
        K.all(`🚶 ${S.pl[c.dr] ? S.pl[c.dr].name : '?'} a renversé un passant ! Amende : −${ML.ECO.fines.ped} €${n < J.peds ? ` (${n}/${J.peds} : attention à la gendarmerie)` : ''}. Il se relève en râlant.`, 'warn'); K.sfx('punch', q.x, q.z);
        if (n >= J.peds) K.wanted(c.dr);
      }
    }
  }

  /* ---------- Radars & gendarmerie ---------- */
  /** V5 : trop de passants renversés → la gendarmerie part de la brigade et te poursuit, où que tu sois */
  K.wanted = pid => {
    const L = ML.LOC.comp.police, P = S.pl[pid]; if (!L || !P || P.jail > S.rt) return;
    if (pol && pol.pid === pid) { pol.jail = true; pol.t = 0; return; }
    if (pol) return;                                                   // une seule voiture : elle s'occupera de toi après
    const tp = K.pose[pid] || { x: L.dock.x, z: L.dock.z };
    pol = K.pol = { x: L.dock.x, z: L.dock.z, h: Math.atan2(tp.x - L.dock.x, tp.z - L.dock.z), pid, ci: P.car !== null ? P.car : -1, t: 0, stuck: 0, jail: true };
    K.big('🚨 GENDARMERIE : ON TE RECHERCHE !', '#3498db', pid); K.all(`🚨 ${P.name} a renversé trop de passants : la GENDARMERIE le·la recherche ! (garde à vue à la clé)`, 'warn'); K.sfx('siren', L.dock.x, L.dock.z);
  };
  /** Garde à vue : on enferme le joueur dans une cellule de la gendarmerie */
  K.jail = pid => {
    const P = S.pl[pid], J = ML.ECO.jail, cells = ML.LOC.jail || []; if (!P || !cells.length) return;
    if (P.car !== null) { const c = S.cars[P.car]; if (c) { c.dr = null; c.s = 0; } P.car = null; }
    if (P.ride != null) { const r = S.cars[P.ride]; if (r) r.pass = r.pass.filter(x => x.pid !== pid); P.ride = null; }
    const used = Object.values(S.pl).filter(q => q.jail > S.rt).length, cell = cells[used % cells.length];
    P.jail = S.rt + J.sec; S.pedHits[pid] = 0;
    K.fine(ML.ECO.fines.jail, 'Garde à vue (passants renversés)', pid);
    K.ev({ e: 'jail', to: pid, x: cell.x, z: cell.z, yaw: cell.yaw, t: J.sec }); K.sfx('jail');
    K.all(`🚔 ${P.name} part en GARDE À VUE à la gendarmerie pour ${J.sec} s (−${ML.ECO.fines.jail} €). Un collègue peut payer la caution (${J.bail} €) à l'accueil.`, 'warn');
    Sim.dirty = true;
  };
  K.free = (pid, by) => {
    const P = S.pl[pid], o = ML.LOC.jailOut; if (!P || !P.jail) return;
    P.jail = 0; K.ev({ e: 'free', to: pid, x: o.x, z: o.z, bail: by ? S.pl[by].name : null }); Sim.dirty = true;
  };
  function lawStep(dt) {
    for (const pid in S.pl) if (S.pl[pid].jail && S.pl[pid].jail < S.rt) K.free(pid);
    const limit = S.rule === 'speed30' ? 8.4 : C.SPEED_LIMIT;
    S.cars.forEach((c, ci) => {
      if (!c.dr || !S.pl[c.dr] || c.kind === 'tp') return;
      const sp = Math.abs(c.s || 0), kmh = Math.round(sp * 3.6), name = S.pl[c.dr].name;
      ML.World.radars.forEach((r, ri) => {
        const key = c.dr + ':' + ri;
        const lim = city.radars[ri] && city.radars[ri].ring && S.rule !== 'speed30' ? 25 : limit;
        if (sp > lim && Math.hypot(r.x - c.x, r.z - c.z) < 15 && (K.radarCd[key] || 0) < S.rt) {
          K.radarCd[key] = S.rt + 5; K.fine(ML.ECO.fines.radar, `Flashé·e à ${kmh} km/h`, c.dr);
          K.ev({ e: 'flash', to: c.dr, r: ri, kmh }); K.all(`📸 ${name} flashé·e à ${kmh} km/h ! (−${ML.ECO.fines.radar} €)`, 'warn');
          if (kmh >= 90) K.stat(c.dr, 'flash90');
        }
      });
      const L = ML.LOC.comp.police;
      if (L && !pol && sp > C.POLICE_TRIGGER && Math.hypot(L.dock.x - c.x, L.dock.z - c.z) < 50) {
        pol = K.pol = { x: L.dock.x, z: L.dock.z, h: Math.atan2(c.x - L.dock.x, c.z - L.dock.z), pid: c.dr, ci, t: 0, stuck: 0 };
        K.big('🚨 GENDARMERIE !', '#3498db'); K.all(`🚨 La gendarmerie prend ${name} en chasse ! Sème-la (ou arrête-toi…)`, 'warn'); K.sfx('siren', c.x, c.z);
      }
      // créneau de légende : arriver en marche arrière au quai d'un client
      if ((c.s || 0) < -1.5 && !K.revDone[c.dr]) for (const k of ML.CLIENTS) { const L2 = ML.LOC.comp[k]; if (L2 && Math.hypot(L2.dock.x - c.x, L2.dock.z - c.z) < 7) { K.revDone[c.dr] = 1; K.stat(c.dr, 'reverse'); } }
    });
    if (!pol) return;
    pol.t += dt;
    const Pw = S.pl[pol.pid]; if (pol.jail && Pw && Pw.car !== null) pol.ci = Pw.car;   // il change de voiture : on suit
    const c = S.cars[pol.ci], tgt = c && c.dr === pol.pid ? c : null, tp = K.pose[pol.pid];
    const tx = tgt ? tgt.x : tp ? tp.x : pol.x, tz = tgt ? tgt.z : tp ? tp.z : pol.z;
    const dx = tx - pol.x, dz = tz - pol.z, d = Math.hypot(dx, dz);
    pol.h = U.lerpAngle(pol.h, Math.atan2(dx, dz), Math.min(1, dt * 3));
    const sp = Math.min(pol.jail ? 27 : 23, d * 2), ox = pol.x, oz = pol.z;
    pol.x += Math.sin(pol.h) * sp * dt; pol.z += Math.cos(pol.h) * sp * dt;
    const q = { x: pol.x, z: pol.z }; U.resolveCircle(q, 1.1); pol.x = q.x; pol.z = q.z;
    if (Math.hypot(pol.x - ox, pol.z - oz) < sp * dt * 0.3 && d > 6) pol.stuck += dt; else pol.stuck = 0;
    if (pol.stuck > 1.5) {          // bloquée : elle « coupe » par une autre rue
      pol.stuck = 0; const a = Math.atan2(dx, dz) + Math.PI + (rng() - 0.5);
      const nx = tx + Math.sin(a) * 22, nz = tz + Math.cos(a) * 22; if (!U.inCollider(nx, nz, 1.5)) { pol.x = nx; pol.z = nz; }
    }
    const name = S.pl[pol.pid] ? S.pl[pol.pid].name : '?';
    if (d < 4.5 && (!tgt || Math.abs(tgt.s || 0) < 4)) {
      if (pol.jail) { const id = pol.pid; pol = K.pol = null; K.ev({ e: 'arrest', to: id }); K.big('🚨 ARRÊTÉ·E !', '#3498db', id); K.jail(id); return; }
      K.fine(ML.ECO.fines.police, 'Arrêté·e par la gendarmerie', pol.pid);
      if (tgt) tgt.frozen = S.rt + 6;
      K.ev({ e: 'arrest', to: pol.pid }); K.big('🚨 ARRÊTÉ·E !', '#3498db', pol.pid); K.all(`🚨 ${name} s'est fait arrêter : amende de ${ML.ECO.fines.police} € et 6 s de contrôle.`, 'warn');
      pol = K.pol = null; Sim.dirty = true; return;
    }
    if ((pol.jail ? pol.t > 100 : d > 120 || pol.t > 40) || !S.pl[pol.pid]) {
      if (S.pl[pol.pid]) { K.stat(pol.pid, 'police_out'); K.all(`😎 ${name} a semé la gendarmerie !`, 'good'); }
      pol = K.pol = null;
    }
  }

  /* ---------- Mode COURSE ---------- */
  function raceStep(dt) {
    const R = K.race; if (!R) return;
    if (!S.race || S.race.done) {
      R.next -= dt;
      if (R.next <= 0) {
        if (R.round >= R.total) { const rank = Object.keys(S.pl).map(p => [p, S.pl[p].name, R.pts[p] || 0]).sort((a, b) => b[2] - a[2]); S.score = rank.length ? rank[0][2] : 0; K.end({ race: rank }); return; }
        R.round++;
        const keys = Object.keys(ML.LOC.comp).filter(k => k !== R.prev && k !== 'police'), target = rng.pick(keys);
        R.prev = target; S.race = { round: R.round, total: R.total, target, arrived: [], t0: S.rt, first: null, pts: R.pts, done: false };
        K.big(`🏁 Manche ${R.round}/${R.total} : ${ML.COMPANIES[target].name} !`, '#ffd257'); K.all(`🏁 Premier arrivé EN VOITURE devant ${ML.COMPANIES[target].name} !`, 'info'); K.sfx('order');
        Sim.dirty = true;
      }
      return;
    }
    const Rc = S.race, L = ML.LOC.comp[Rc.target];
    for (const pid in S.pl) {
      const P = S.pl[pid]; if (P.car === null || Rc.arrived.includes(pid)) continue;
      const c = S.cars[P.car]; if (Math.hypot(c.x - L.dock.x, c.z - L.dock.z) < 11) {
        const pts = [5, 3, 2, 1, 1][Rc.arrived.length]; Rc.arrived.push(pid); R.pts[pid] = (R.pts[pid] || 0) + pts;
        if (!Rc.first) Rc.first = S.rt;
        K.all(`🏁 ${P.name} arrive ${Rc.arrived.length === 1 ? 'PREMIER·E' : Rc.arrived.length + 'e'} (+${pts})`, 'good'); K.sfx('cash', c.x, c.z); Sim.dirty = true;
      }
    }
    if (Rc.arrived.length >= Object.keys(S.pl).length || (Rc.first && S.rt - Rc.first > 30) || S.rt - Rc.t0 > 120) { Rc.done = true; R.next = 5; Sim.dirty = true; }
  }

  mod.step = dt => {
    trafficStep(dt); lawStep(dt); pedStep(dt); if (S.mode === 'course') raceStep(dt);
    // voitures conduites : PNJ bousculés
    for (const c of S.cars) if (c.dr && Math.abs(c.s) > 3) for (const id in K.npcs) {
      const n = K.npcs[id]; if (!n.active || n.stun > 0 || Math.hypot(n.x - c.x, n.z - c.z) > 2) continue;
      n.stun = 0.6; const dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot(dx, dz) || 1; n.x += dx / d * 1.5; n.z += dz / d * 1.5; U.resolveCircle(n, 0.3);
      K.say(n, ML.line(id, 'renverse', id === 'lebec' ? 'TU M\'AS RENVERSÉ ?! COUP DE PELLE !' : ML.line('tous', 'renverse', 'Eh oh ! Regarde où tu roules !')));
      if (id === 'lebec' && !S.chase) { S.anger = 100; K.startChase(c.dr); }
    }
  };

  /* ---------- Intentions ---------- */
  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'exit': {
        const c = S.cars[m.car | 0];
        if (P.ride != null) { const r = S.cars[P.ride]; if (r) r.pass = r.pass.filter(x => x.pid !== pid); P.ride = null; Sim.dirty = true; return true; }
        if (c && c.dr === pid) { c.dr = null; c.s = 0; if (isFinite(m.x) && isFinite(m.z)) Object.assign(c, { x: +m.x, z: +m.z, h: +m.h || 0 }); P.car = null; if (pol && pol.pid === pid && Math.hypot(pol.x - c.x, pol.z - c.z) < 12) pol.t = 99; }
        return true;
      }
      case 'spill': {
        const c = S.cars[m.car | 0]; if (!c || c.dr !== pid || !c.bed.length || (c.spillT || 0) > S.rt) return true;
        c.spillT = S.rt + 1.1;
        const it = c.bed.splice(Math.floor(rng() * c.bed.length), 1)[0], side = m.side > 0 ? 1 : -1, l = { x: Math.cos(c.h), z: -Math.sin(c.h) };
        K.spawnItem(it, c.x - Math.sin(c.h) * 1.6 + l.x * side * 1.2, 1.4, c.z - Math.cos(c.h) * 1.6 + l.z * side * 1.2, [l.x * side * 6 + Math.sin(c.h) * (c.s || 0) * 0.4, 3, l.z * side * 6 + Math.cos(c.h) * (c.s || 0) * 0.4]);
        K.all(`📦 Une caisse est tombée de ${c.name} dans le virage ! (${P.name})`, 'warn'); K.stat(pid, 'spill'); K.sfx('clang', c.x, c.z);
        return true;
      }
      case 'horn': {
        const k = ML.SHOP[m.k] && ML.SHOP[m.k].cat === 'klaxon' ? m.k : 'base';
        K.ev({ e: 'horn', pid, k, x: Math.round(ps.x), z: Math.round(ps.z) });
        if (K.violation) K.violation(pid, 'no_horn');
        return true;
      }
      case 'refuel': {
        const c = S.cars[P.car]; if (!c || !ML.LOC.pump || Math.hypot(ML.LOC.pump.x - c.x, ML.LOC.pump.z - c.z) > 9) return true;
        c.fuel = 100; K.ev({ e: 'fuel', car: P.car, f: 100 }); K.note(pid, '⛽ Le plein est fait ! (Dédé met ça sur le compte de Lebec)', 'good');
        return true;
      }
      case 'bail': {                                                  // V5 : payer la caution d'un collègue (accueil de la gendarmerie)
        const n = K.npcs.gendarme, T2 = S.pl[m.id]; if (!n || !n.active || !K.near(ps, n.x, n.z, 7) || !T2 || !(T2.jail > S.rt)) return true;
        if (!K.spend(pid, ML.ECO.jail.bail, 'amende', `Caution de ${T2.name}`)) { K.say(n, 'Pas d\'argent, pas de caution.'); return true; }
        K.say(n, ML.line('gendarme', 'caution', 'Caution payée. Qu\'on ne vous y reprenne pas.')); K.free(m.id, pid);
        K.all(`💶 ${P.name} a payé la caution de ${T2.name} (${ML.ECO.jail.bail} €).`, 'info'); return true;
      }
      case 'dry': K.stat(pid, 'dry'); K.all(`⛽ ${P.name} est en PANNE SÈCHE ! Un jerrican (station Total-Lebec) et E sur la voiture.`, 'warn'); return true;
    }
    return false;
  };
  mod.use = (pid, P, ps, sel, held, kind, a, b) => {
    if (kind !== 'car') return false;
    const i = +a, c = S.cars[i]; if (!c || !K.near(ps, c.x, c.z, 6)) return true;
    if (b === 'door') {
      if (held && held.type === 'jerrican' && c.kind !== 'tp') {
        P.inv[sel] = null; c.fuel = Math.min(100, (c.fuel || 0) + 45); K.ev({ e: 'fuel', car: i, f: c.fuel });
        K.note(pid, `⛽ +45 % d'essence dans ${c.name}.`, 'good'); K.sfx('pickup', c.x, c.z); return true;
      }
      if (P.car !== null || P.ride != null) return true;
      const V = ML.VEHICLES[c.kind];
      if (c.dr) {                                                   // place passager
        if (c.pass.filter(x => x.seat === 'cab').length >= (c.kind === 'camion' ? 1 : V.seats ? 1 : 0)) { K.note(pid, `Pas de place passager dans ${c.name}.`, 'warn'); return true; }
        c.pass.push({ pid, seat: 'cab' }); P.ride = i; Sim.dirty = true; K.note(pid, '🪑 Tu es passager·e : clic droit pour lancer, E pour descendre.', 'good'); return true;
      }
      if (V.role && P.role !== V.role) { K.needRole(pid, V.role, `Conduire ${c.name}`); return true; }
      if (P.inv.some(x => x && IT.bulky(x))) { K.note(pid, c.kind === 'tp' ? 'Pose ta caisse sur les fourches du transpalette (E à l\'arrière) avant de le conduire.' : 'Pose ta caisse dans la benne avant de conduire.', 'warn'); return true; }
      c.dr = pid; P.car = i; K.ev({ e: 'drive', to: pid, car: i }); Sim.dirty = true; return true;
    }
    if (c.kind === 'fenwick') { K.note(pid, 'Le fenwick se conduit (E côté conducteur) ; R pour lever/poser les fourches.'); return true; }
    if (held && IT.heavy(held)) return true;
    if (held && (IT.bulky(held) || held.type === 'piece')) {
      if (K.bedFree(c) < 1) { K.note(pid, c.kind === 'tp' ? 'Le transpalette est plein (4 caisses).' : c.kind === 'camion' ? 'Le plateau du camion est plein.' : 'La benne est pleine.', 'warn'); return true; }
      P.inv[sel] = null; c.bed.push(held); K.sfx('drop', c.x, c.z); return true;
    }
    if (!c.bed.length) {
      if (!held && ML.VEHICLES[c.kind].seats > 1 && c.kind !== 'camion' && P.car === null && P.ride == null && c.pass.filter(x => x.seat === 'bed').length < 2) {
        c.pass.push({ pid, seat: 'bed' + c.pass.filter(x => x.seat.startsWith('bed')).length }); P.ride = i; Sim.dirty = true;
        K.note(pid, '🛻 Tu montes dans la benne ! Accroche-toi. (E pour descendre)', 'good');
      }
      return true;
    }
    if (c.kind === 'camion' && !c.bed.some(it => it.type !== 'palette')) { K.note(pid, 'Les palettes se déchargent au fenwick ou avec R (livreur) chez le client.'); return true; }
    let idx = c.bed.length - 1, here = null;
    if (c.kind === 'camion') for (let i = c.bed.length - 1; i >= 0; i--) if (c.bed[i].type !== 'palette') { idx = i; break; }
    for (const k in ML.LOC.comp) if (Math.hypot(ML.LOC.comp[k].dock.x - c.x, ML.LOC.comp[k].dock.z - c.z) < 25) here = k;
    const fits = it => { if (it.type === 'palette') return false; if (!K.isPart(it)) return here === null && U.inWorkshop({ x: c.x, z: c.z - 10 }); const o = S.orders.find(x => x.id === it.d.oid); return o && ((here === o.client && K.stage(o) === 'livraison') || (here === 'tth' && K.stage(o) === 'tth')); };
    const j = c.bed.findIndex(fits); if (j >= 0) idx = j;
    if (K.give(pid, c.bed[idx], sel)) { c.bed.splice(idx, 1); K.sfx('pickup', c.x, c.z); }
    return true;
  };
  const r2 = v => Math.round(v * 100) / 100;
  mod.fast = f => {
    f.tr = tr.map(t => { const p = trPos(t); return [r2(p.x), r2(p.z), r2(p.h), t.m]; });
    f.pol = pol ? [r2(pol.x), r2(pol.z), r2(pol.h)] : null;
    f.ps = peds.map(p => { const q = pedPos(p); return [r2(q.x), r2(q.z), r2(q.h), p.down > 0 ? 1 : 0]; });
  };
  Sim.mods.push(mod);
})();
