/* =====================================================================
   sim_chaos.js — CHAOS (hôte) : copeaux qui s'accumulent et prennent
   feu, pannes (clé à molette), usure d'outil (plaquette neuve), flaques
   d'huile soluble (on glisse), pigeon voleur de plaquettes, extincteur
   et soufflette.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U;
  let S, rng, pg, nextFire = 1, nextPud = 1;
  const CAB = { x: 2, y: 1.4, z: -12.4 }, DOOR_OUT = { x: 0, y: 5, z: 18 }, DOOR_IN = { x: 0, y: 3, z: 9 };

  const mod = {};
  mod.init = () => {
    S = K.S; rng = K.rng;
    S.fires = []; S.puddles = [];
    for (const id in S.machines) S.machines[id].chips = Math.floor(rng() * 35);
    K.pudT = (40 + rng() * 40) / K.D.chaos; K.slipCd = {};
    if (rng() < 0.6) addPuddle(-8 + rng() * 16, -2 + rng() * 6);
    if (S.weather === 'pluie') for (let i = 0; i < 3; i++) addPuddle(-8 + rng() * 16, 16 + rng() * 6);
    const perch = rng.pick(ML.LOC.perches) || { x: 30, y: 6, z: 40 };
    pg = K.pg = { x: perch.x, y: perch.y, z: perch.z, perch, state: 'perch', T: 45 + rng() * 50, path: [], carry: null, hold: 0 };
  };

  /* ---------- Outils ---------- */
  function addPuddle(x, z, r) {
    if (S.puddles.length >= 8) S.puddles.shift();
    S.puddles.push({ id: nextPud++, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: r || 1.1 + rng() * 0.5, t: S.rt });
    Sim.dirty = true;
  }
  K.addPuddle = addPuddle;
  K.fireAt = mid => S.fires.find(f => f.mid === mid);
  K.startFire = mid => {
    const W = ML.World.machines[mid], M = S.machines[mid]; if (!W || !M || K.fireAt(mid)) return;
    S.fires.push({ id: nextFire++, x: W.chips.x, z: W.chips.z, hp: 55, mid, t0: S.rt });
    K.big(`🔥 FEU DE COPEAUX SUR ${mid} !`, '#ff7a1a'); K.all(`🔥 Feu de copeaux sur ${mid} ! Prends un EXTINCTEUR (mur gauche) et maintiens le clic gauche.`, 'warn'); K.sfx('fire');
    Sim.dirty = true;
  };
  K.breakMachine = (mid, why) => {
    const M = S.machines[mid]; if (!M || M.broken) return;
    M.broken = true; K.all(`🔧 ${mid} est EN PANNE${why ? ' (' + why + ')' : ''} ! Une clé à molette (mur gauche) et E sur la machine.`, 'warn'); K.sfx('clang'); Sim.dirty = true;
  };
  function front(ps, x, z, range, cos) {
    const dx = x - ps.x, dz = z - ps.z, d = Math.hypot(dx, dz);
    if (d > range) return false; if (d < 1.2) return true;
    return (dx * -Math.sin(ps.yaw) + dz * -Math.cos(ps.yaw)) / d > (cos || 0.55);
  }

  /* ---------- Pigeon ---------- */
  K.pigeonHit = by => {
    if (pg.state === 'perch' && pg.y > 7) return;
    if (pg.carry) {
      K.spawnItem({ type: pg.carry, d: {} }, pg.x, Math.max(1, pg.y), pg.z, [rng() - 0.5, 0, rng() - 0.5]);
      K.all(`🐦 ${S.pl[by] ? S.pl[by].name : 'Quelqu\'un'} a fait lâcher la plaquette au pigeon !`, 'good'); if (by) K.stat(by, 'pigeon');
      pg.carry = null;
    }
    K.sfx('pigeon', pg.x, pg.z); flyTo(rng.pick(ML.LOC.perches) || pg.perch, 'escape'); pg.T = 60 + rng() * 50;
  };
  function flyTo(target, state) {
    pg.state = state; pg.target = target;
    const inside = U.inWorkshop(pg), tIn = U.inWorkshop(target);
    pg.path = [];
    if (inside && !tIn) pg.path.push(DOOR_IN, DOOR_OUT);
    else if (!inside && tIn) pg.path.push(DOOR_OUT, DOOR_IN);
    pg.path.push(target);
  }
  function pigeonStep(dt) {
    if (pg.state === 'perch') {
      pg.T -= dt;
      if (pg.carry) { pg.hold -= dt; if (pg.hold <= 0) { pg.carry = null; K.all('🐦 Le pigeon a perdu la plaquette dans une gouttière. Adieu.', 'warn'); Sim.dirty = true; } }
      if (pg.T <= 0 && !pg.carry && S.stock.plaquette > 0) { flyTo(CAB, 'steal'); K.sfx('pigeon', pg.x, pg.z); }
      return;
    }
    const t = pg.path[0]; if (!t) { pg.state = 'perch'; return; }
    const dx = t.x - pg.x, dy = t.y - pg.y, dz = t.z - pg.z, d = Math.hypot(dx, dy, dz), sp = (pg.state === 'escape' ? 11 : 8) * dt;
    if (d <= sp) {
      pg.x = t.x; pg.y = t.y; pg.z = t.z; pg.path.shift();
      if (!pg.path.length) {
        if (pg.state === 'steal') {
          if (S.stock.plaquette > 0) { S.stock.plaquette--; pg.carry = 'plaquette'; pg.hold = 40; K.all('🐦 Le PIGEON a volé une plaquette ! Lance-lui quelque chose (clic droit) ou souffle-le !', 'warn'); Sim.dirty = true; }
          flyTo(rng.pick(ML.LOC.perches) || pg.perch, 'escape');
        } else { pg.state = 'perch'; pg.perch = pg.target; pg.T = 70 + rng() * 60; }
      }
    } else { pg.x += dx / d * sp; pg.y += dy / d * sp; pg.z += dz / d * sp; }
  }

  /* ---------- Boucle ---------- */
  mod.step = dt => {
    for (const id in S.machines) {
      const M = S.machines[id];
      if (M.status === 'run') {
        M.chips = Math.min(100, (M.chips || 0) + dt * 1.5);
        M.wear = (M.wear || 0) + dt * 0.75 * Math.sqrt(K.D.chaos);
        if (M.wear >= 100 && M.job && M.job.tool) {
          M.worn = true; M.job.tool = false; Sim.dirty = true;
          const op = K.npcs[M.op]; K.say(op, `Outil usé ! Il me faut ${M.job.need === 'plaquette' ? 'une plaquette neuve' : M.job.need === 'fraise' ? 'une fraise neuve' : 'un foret neuf'} !`);
          K.all(`⚠ ${id} : outil usé, apporte un(e) ${ML.TOOLS[M.job.need].label.toLowerCase()} neuf(ve).`, 'warn');
        }
        if (M.chips > 55 && !K.fireAt(id) && rng() < dt * (M.chips - 55) / 45 / 70 * K.D.chaos) K.startFire(id);
        if (!M.broken && rng() < dt / 280 * K.D.chaos) K.breakMachine(id);
      }
    }
    for (const f of S.fires.slice()) {
      f.hp = Math.min(100, f.hp + dt * 1.5);
      if (S.rt - f.t0 > 50) {
        S.fires.splice(S.fires.indexOf(f), 1); S.machines[f.mid].chips = 0;
        K.breakMachine(f.mid, 'brûlée'); S.score = Math.max(0, S.score - 10); K.all(`🔥 ${f.mid} a cramé ! (−10)`, 'warn');
      }
    }
    K.pudT -= dt;
    if (K.pudT <= 0) {
      K.pudT = ((S.weather === 'pluie' ? 35 : 55) + rng() * 40) / K.D.chaos;
      const ids = Object.keys(S.machines), W = ML.World.machines[rng.pick(ids)];
      if (W) { addPuddle(W.station.x + (rng() - 0.5) * 2, W.station.z + (rng() - 0.5) * 2); K.all('💧 Fuite d\'huile soluble près de ' + W.def.id + ' : attention, ça glisse !', 'info'); }
    }
    { const n0 = S.puddles.length; S.puddles = S.puddles.filter(p => S.rt - p.t < 150); if (n0 !== S.puddles.length) Sim.dirty = true; }
    pigeonStep(dt);
  };
  mod.workMult = (n, k) => (n.mid && K.fireAt(n.mid) ? 0 : k);

  /* ---------- Intentions ---------- */
  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'spray': {
        if (!held || held.type !== 'extincteur') return true;
        for (const f of S.fires.slice()) if (front(ps, f.x, f.z, 5.5, 0.4)) {
          f.hp -= 13;
          if (f.hp <= 0) { S.fires.splice(S.fires.indexOf(f), 1); S.machines[f.mid].chips = 0; K.all(`🧯 ${P.name} a éteint le feu sur ${f.mid} !`, 'good'); K.stat(pid, 'fire'); K.sfx('success', f.x, f.z); }
          Sim.dirty = true;
        }
        return true;
      }
      case 'blow': {
        if (!held || held.type !== 'soufflette') return true;
        const fx = -Math.sin(ps.yaw), fz = -Math.cos(ps.yaw);
        const before = S.puddles.length; S.puddles = S.puddles.filter(p => !front(ps, p.x, p.z, 4.5)); if (S.puddles.length !== before) { K.note(pid, '💨 Flaque séchée à la soufflette !', 'good'); Sim.dirty = true; }
        for (const tid in K.pose) {
          if (tid === pid || !S.pl[tid] || !K.foot(S.pl[tid])) continue;
          const tp = K.pose[tid]; if (!tp || !front(ps, tp.x, tp.z, 4.5, 0.6)) continue;
          K.ev({ e: 'push', to: tid, vx: fx * 9, vz: fz * 9, by: pid }); K.note(tid, `💨 ${P.name} t'a soufflé dessus !`); K.stat(pid, 'blow');
        }
        for (const id in K.npcs) {
          const n = K.npcs[id]; if (!n.active || !front(ps, n.x, n.z, 4.5, 0.6)) continue;
          n.x += fx * 1.8; n.z += fz * 1.8; U.resolveCircle(n, 0.3); n.stun = Math.max(n.stun, 0.4);
          if (id === 'lebec') { S.anger = Math.min(100, S.anger + 20 * (K.H.anger || 1)); K.say(n, 'ARRÊTE AVEC TA SOUFFLETTE !'); if (S.anger >= ML.CFG.LEBEC.chaseAt && !S.chase) K.startChase(pid); }
          else K.say(n, U.pick(['Pfffouah !', 'Hé ! Mes cheveux !', 'Ça décoiffe !']));
        }
        for (const o of S.items) if (o.rest && o.type !== 'find' && front(ps, o.x, o.z, 4)) { o.rest = false; o.vx = fx * 6; o.vz = fz * 6; o.vy = 2; }
        if (Math.hypot(pg.x - ps.x, pg.z - ps.z) < 8 && pg.y < 6) K.pigeonHit(pid);
        K.sfx('blow', ps.x, ps.z);
        return true;
      }
      case 'slip': {
        if ((K.slipCd[pid] || 0) > S.rt) return true;
        K.slipCd[pid] = S.rt + 2; K.stat(pid, 'slip'); K.damage(pid, ML.CFG.HP.slip, 'glissade');
        if (held) K.dropHeld(pid, sel, [-Math.sin(ps.yaw) * 4, 3, -Math.cos(ps.yaw) * 4]);
        K.sfx('slip', ps.x, ps.z);
        return true;
      }
      case 'repair': {
        const M = S.machines[m.mid]; if (!M || !M.broken || !held || held.type !== 'cle') return true;
        const W = ML.World.machines[m.mid]; if (!W || !K.near(ps, W.def.x, W.def.z, 6)) return true;
        M.broken = false; M.chips = Math.max(0, M.chips - 30); K.all(`🔧 ${P.name} a réparé ${m.mid} !`, 'good'); K.sfx('success', W.def.x, W.def.z);
        return true;
      }
    }
    return false;
  };
  mod.machineUse = (pid, P, sel, held, mid, M, m) => {
    if (K.fireAt(mid)) { K.note(pid, `Il y a le FEU sur ${mid} ! Extincteur + clic gauche maintenu.`, 'warn'); return true; }
    if (M.broken) { K.note(pid, held && held.type === 'cle' ? 'Maintiens la réparation jusqu\'au bout !' : `${mid} est en panne : prends une CLÉ À MOLETTE (mur gauche).`, 'warn'); return true; }
    if (M.worn && held && ML.Items.def(held).kind === 'tool') {
      if (ML.Items.def(held).tool !== M.job.need) { K.note(pid, `Il faut un(e) ${ML.TOOLS[M.job.need].label} neuf(ve).`, 'warn'); return true; }
      P.inv[sel] = null; Sim.dirty = true;
      if (m.mg === 'fail') { K.note(pid, '💥 La plaquette a cassé au montage ! Il en faut une autre.', 'warn'); K.sfx('clang'); return true; }
      M.worn = false; M.wear = 0; M.job.tool = true; K.say(K.npcs[M.op], 'Outil neuf, ça repart !');
      return true;
    }
    return false;
  };
  mod.onHit = (pid, kind) => { if (kind === 'pigeon' && K.near(K.pose[pid], pg.x, pg.z, 3.5) && pg.y < 3.5) K.pigeonHit(pid); };
  mod.itemHit = o => {
    if (Math.hypot(o.x - pg.x, o.y - pg.y, o.z - pg.z) < 1.1) { K.pigeonHit(o.thr); return true; }
    return false;
  };
  const r2 = v => Math.round(v * 100) / 100;
  mod.fast = f => { f.pg = [r2(pg.x), r2(pg.y), r2(pg.z), pg.carry ? 1 : 0, pg.state === 'perch' ? 0 : 1]; };
  Sim.mods.push(mod);
})();
