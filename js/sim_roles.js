/* =====================================================================
   sim_roles.js — RÔLES et SANTÉ (hôte) :
   - vie des joueurs (coups de pelle, claques, feu, glissade, chien),
     KO = mode dégradé jusqu'à ce que le MÉDECIN soigne ;
   - habilitations : maintenance (pannes, bacs à copeaux), magasinier
     (fournisseurs), cariste (fenwick), livreur (camion) ;
   - grosses pièces : palette → fenwick → camion → client ;
   - PNJ de secours quand personne n'a le rôle (lents !) : Docteur Gwenn,
     Gégé (maintenance), Momo (cariste-livreur), Sylvie (magasin) ;
   - le chien de la casse ; les lancers (outil attrapé par l'usineur,
     caisse dans une benne, viennoiserie au chien).
   Ce module est enregistré AVANT les autres : il peut refuser une action.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, C = ML.CFG, IT = ML.Items, COMP = ML.COMPANIES;
  let S, rng, npcs;
  const mod = {};
  const OUT = { x: 0, z: 24 };

  mod.init = () => {
    S = K.S; rng = K.rng; npcs = K.npcs;
    for (const id in S.machines) S.machines[id].bin = true;
    K.koT = {}; K.fireT = {}; K.issueT = {}; K.stockT = {}; K.momoT = {}; K.biteCd = {};
    const L = ML.LOC.comp.casse;
    K.dog = L ? { x: L.dock.x, z: L.dock.z, h: 0, home: { x: L.dock.x, z: L.dock.z }, st: 'idle', sleep: 0, flee: 0, tgt: null } : null;
    const roles = Object.values(S.pl).map(P => ML.ROLES[P.role].name);
    K.all('👷 Rôles : ' + Object.values(S.pl).map(P => `${P.name} = ${ML.ROLES[P.role].icon} ${ML.ROLES[P.role].name}`).join(' · '), 'info');
    const missing = ['medecin', 'cariste', 'livreur', 'maintenance', 'magasinier'].filter(r => !K.hasRole(r)).map(r => ML.ROLES[r].name);
    if (missing.length && roles.length) K.all(`🐢 Personne n'est ${missing.join(', ')} : des PNJ s'en chargeront… lentement.`, 'info');
  };
  K.role = pid => (S.pl[pid] ? S.pl[pid].role : null);
  K.hasRole = r => Object.values(S.pl).some(P => P.role === r && !P.ko);
  const needRole = (pid, r, what) => {
    if (K.role(pid) === r) return true;
    K.note(pid, `⛔ ${what} : réservé au rôle ${ML.ROLES[r].icon} ${ML.ROLES[r].name}.` + (K.hasRole(r) ? ' Appelle-le (T : ping) !' : ' Un PNJ va s\'en occuper… lentement.'), 'warn');
    return false;
  };
  K.needRole = needRole;

  /* ---------- Vie ---------- */
  K.damage = (pid, amt, why) => {
    const P = S.pl[pid]; if (!P || P.ko || amt <= 0) return;
    P.hp = Math.max(0, P.hp - amt); Sim.dirty = true;
    K.ev({ e: 'hurt', to: pid, hp: P.hp, why });
    if (P.hp <= 0) {
      P.ko = true; K.koT[pid] = S.rt; K.dropAll(pid, 2);
      K.big(`🤕 ${P.name} est KO !`, '#ff6b6b'); K.all(`🤕 ${P.name} est KO (${why}) : il se traîne… Il faut le MÉDECIN !`, 'warn'); K.sfx('bong');
    }
  };
  K.heal = (pid, by) => {
    const P = S.pl[pid]; if (!P) return;
    const was = P.ko; P.hp = C.HP.max; P.ko = false; delete K.koT[pid]; Sim.dirty = true;
    K.ev({ e: 'healed', to: pid, by });
    if (was) K.all(`⛑ ${P.name} est soigné·e par ${by}. Au boulot !`, 'good'); else K.note(pid, `⛑ ${by} t'a soigné·e.`, 'good');
    K.sfx('success');
  };

  /* ---------- PNJ de secours ---------- */
  function visit(id, x, z) {
    const n = npcs[id];
    Object.assign(n, { active: true, x: x === undefined ? OUT.x + (rng() - 0.5) * 2 : x, z: z === undefined ? OUT.z : z, state: 'go', path: [], stun: 0, speed: 2.4, t: 0 });
    Sim.dirty = true; return n;
  }
  function leave(n, line) {
    if (line) K.say(n, line);
    n.state = 'leave'; K.walkTo(n, OUT.x, OUT.z + 4, () => { n.active = false; n.state = 'away'; Sim.dirty = true; });
  }
  function docteurStep(dt) {
    const n = npcs.docteur;
    if (!n.active) {
      if (K.hasRole('medecin')) return;
      const ko = Object.keys(K.koT).find(pid => S.pl[pid] && S.pl[pid].ko && S.rt - K.koT[pid] > 12);
      if (!ko) return;
      const tp = K.pose[ko] || OUT; visit('docteur'); n.patient = ko; K.all(`⛑ Le Docteur Gwenn arrive pour ${S.pl[ko].name}… à son rythme.`, 'info');
      if (Math.hypot(tp.x, tp.z) > 70) { n.x = tp.x + 15; n.z = tp.z + 15; U.resolveCircle(n, 0.3); }
      return;
    }
  }
  function gegeStep(dt) {
    if (K.hasRole('maintenance')) return;
    const n = npcs.gege;
    for (const id in S.machines) {
      const M = S.machines[id], bad = M.broken || M.chips >= 100 || M.bin === false;
      if (bad) K.issueT[id] = K.issueT[id] || S.rt; else delete K.issueT[id];
    }
    if (n.active) return;
    const id = Object.keys(K.issueT).find(k => S.rt - K.issueT[k] > 18);
    if (!id) return;
    visit('gege'); n.job = id; const W = ML.World.machines[id];
    K.walkTo(n, W.chips.x + 0.8, W.chips.z + 0.8, () => { n.state = 'fix'; n.t = 7; K.say(n, 'Bon… voyons voir ça.'); });
    K.all(`🔧 Gégé (maintenance) vient s'occuper de ${id}…`, 'info');
  }
  function sylvieStep(dt) {
    if (K.hasRole('magasinier')) return;
    for (const k of ['acier', 'alu', 'inox', 'plaquette', 'fraise', 'foret']) {
      if (S.stock[k] > 0) { delete K.stockT[k]; continue; }
      K.stockT[k] = K.stockT[k] || S.rt;
      if (S.rt - K.stockT[k] > 40) {
        delete K.stockT[k]; S.stock[k] += 3; Sim.dirty = true;
        K.all(`📦 Sylvie (agence) a fini par recommander : +3 ${ML.MATERIALS[k] ? ML.MATERIALS[k].label : ML.TOOLS[k].label}.`, 'good');
      }
    }
  }
  function momoStep(dt) {
    const cam = S.cars.find(c => c.kind === 'camion');
    // cariste absent : Momo charge les palettes du quai dans le camion
    if (!K.hasRole('cariste')) for (const o of S.items) {
      if (o.type !== 'palette' || !o.rest) continue;
      K.momoT[o.id] = K.momoT[o.id] || S.rt;
      if (S.rt - K.momoT[o.id] > 25 && cam && !cam.dr && cam.bed.length < cam.cap && Math.hypot(cam.x - o.x, cam.z - o.z) < 35) {
        delete K.momoT[o.id]; cam.bed.push(K.strip(o)); K.removeItem(o);
        K.all(`🚜 Momo a chargé la palette #${o.d.oid} dans le camion (enfin).`, 'good');
      }
    }
    // livreur absent : Momo livre ce qu'il y a dans le camion
    if (cam && !K.hasRole('livreur') && !cam.dr && cam.bed.length) {
      cam.momo = cam.momo || S.rt;
      if (S.rt - cam.momo > 35) {
        cam.momo = 0;
        for (const it of cam.bed.slice()) {
          const o = S.orders.find(x => x.id === it.d.oid);
          if (!o || o.steps[o.si] !== 'livraison') continue;
          cam.bed.splice(cam.bed.indexOf(it), 1);
          K.deliver(null, null, 0, Object.assign({}, it, { d: Object.assign({}, it.d, { npc: 1 }) }), o.client, npcs[COMP[o.client].npc]);
        }
        K.all('🚚 Momo est allé livrer avec le camion (−40 % : il prend son temps).', 'info'); Sim.dirty = true;
      }
    } else if (cam) cam.momo = 0;
  }

  /* ---------- Chien de la casse ---------- */
  function dogStep(dt) {
    const d = K.dog; if (!d) return;
    if (d.sleep > 0) { d.sleep -= dt; d.st = 'sleep'; return; }
    let tx = d.home.x, tz = d.home.z, sp = 3;
    if (d.flee > 0) { d.flee -= dt; d.st = 'flee'; sp = 7; }
    else {
      let best = null, bd = 16;
      for (const pid in K.pose) { const P = S.pl[pid], p = K.pose[pid]; if (!P || !K.foot(P)) continue; const dist = Math.hypot(p.x - d.x, p.z - d.z), fromHome = Math.hypot(p.x - d.home.x, p.z - d.home.z); if (dist < bd && fromHome < 30) { bd = dist; best = pid; } }
      d.tgt = best;
      if (best) {
        const p = K.pose[best]; tx = p.x; tz = p.z; sp = 6.3; d.st = 'chase';
        if (bd < 1.3 && (K.biteCd[best] || 0) < S.rt) {
          K.biteCd[best] = S.rt + 2.2; K.damage(best, C.HP.dog, 'mordu par le chien'); K.ev({ e: 'push', to: best, vx: (p.x - d.x) * 4, vz: (p.z - d.z) * 4 });
          K.note(best, '🐕 OUAF ! Le chien de la casse t\'a mordu ! (une viennoiserie le calmerait…)', 'warn'); K.sfx('dog', d.x, d.z);
        }
      } else d.st = Math.hypot(d.x - d.home.x, d.z - d.home.z) > 1 ? 'back' : 'idle';
    }
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    if (d.flee > 0) { if (dist > 0.5) { d.x += dx / dist * Math.min(sp * dt, dist); d.z += dz / dist * Math.min(sp * dt, dist); } }
    else if (dist > 1.1) { d.x += dx / dist * sp * dt; d.z += dz / dist * sp * dt; d.h = Math.atan2(dx, dz); }
    U.resolveCircle(d, 0.4);
  }

  /* ---------- Boucle ---------- */
  mod.step = dt => {
    // brûlure près d'un feu
    for (const pid in K.pose) {
      const P = S.pl[pid], p = K.pose[pid]; if (!P || !K.foot(P)) continue;
      if ((S.fires || []).some(f => Math.hypot(f.x - p.x, f.z - p.z) < 1.8)) { K.fireT[pid] = (K.fireT[pid] || 0) + dt; if (K.fireT[pid] > 1) { K.fireT[pid] = 0; K.damage(pid, C.HP.fire, 'brûlé'); } }
    }
    docteurStep(dt); gegeStep(dt); sylvieStep(dt); momoStep(dt); dogStep(dt);
    if (S.items.some(o => o.gone)) { S.items = S.items.filter(o => !o.gone); Sim.dirty = true; }
  };
  mod.brain = (n, dt) => {
    switch (n.id) {
      case 'docteur': {
        if (n.state === 'leave') return true;
        const P = S.pl[n.patient], tp = K.pose[n.patient];
        if (!P || !P.ko || !tp) { leave(n, 'Bon, plus personne à soigner ?'); return true; }
        n.t += dt; n.re = (n.re || 0) - dt;
        if (Math.hypot(tp.x - n.x, tp.z - n.z) < 1.8) { K.heal(n.patient, 'le Docteur Gwenn'); leave(n, U.pick(ML.LINES.docteur)); return true; }
        if (n.re <= 0) { n.re = 1.5; K.walkTo(n, tp.x, tp.z); }
        if (n.t > 45 && Math.hypot(tp.x - n.x, tp.z - n.z) > 25) { n.x = tp.x + 4; n.z = tp.z + 4; U.resolveCircle(n, 0.3); n.t = 0; }
        return true;
      }
      case 'gege': {
        if (n.state === 'fix') {
          n.t -= dt;
          if (n.t <= 0) { const M = S.machines[n.job]; if (M) { M.broken = false; M.chips = 0; M.bin = true; } delete K.issueT[n.job]; K.all(`🔧 Gégé a remis ${n.job} en état.`, 'good'); Sim.dirty = true; leave(n, U.pick(ML.LINES.gege)); }
        }
        return true;
      }
      case 'momo': case 'sylvie': return true;
    }
    return false;
  };
  mod.bubble = n => ({ docteur: '⛑ J\'arrive…', gege: n.state === 'fix' ? '🔧 Bricole…' : '🔧 Maintenance' }[n.id]);

  /* ---------- Intentions ---------- */
  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'heal': {
        if (!needRole(pid, 'medecin', 'Soigner')) return true;
        const T = S.pl[m.id], tp = K.pose[m.id]; if (!T || !tp || m.id === pid || !K.near(ps, tp.x, tp.z, 4)) return true;
        if (T.hp >= C.HP.max) { K.note(pid, `${T.name} va très bien.`); return true; }
        K.heal(m.id, P.name); K.stat(pid, 'heal'); return true;
      }
      case 'repair': return !needRole(pid, 'maintenance', 'Réparer une machine');
      case 'eliott': case 'coco': return !needRole(pid, 'magasinier', 'Commander chez un fournisseur');
      case 'fork': {
        const c = S.cars[P.car]; if (!c || c.kind !== 'fenwick' || c.dr !== pid) return true;
        const fx = c.x + Math.sin(c.h) * 1.9, fz = c.z + Math.cos(c.h) * 1.9;
        if (!c.load) {
          const o = S.items.find(x => (x.type === 'palette' || x.type === 'machine') && x.rest && Math.hypot(x.x - fx, x.z - fz) < 2.4);   // machine : caisse de machine neuve (sim_build.js)
          if (!o) { K.note(pid, 'Rien sur les fourches : approche une PALETTE (gros colis) ou une caisse MACHINE et appuie sur R.'); return true; }
          c.load = K.strip(o); K.removeItem(o); K.sfx('pickup', fx, fz);
        } else {
          const cam = S.cars.find(x => x.kind === 'camion' && Math.hypot(x.x - fx, x.z - fz) < 5.5);
          if (cam && cam.bed.length < cam.cap) { cam.bed.push(c.load); c.load = null; K.note(pid, '🚚 Palette chargée dans le camion !', 'good'); K.sfx('drop', fx, fz); }
          else if (cam) K.note(pid, 'Le camion est plein (2 palettes).', 'warn');
          else { K.spawnItem(c.load, fx, 0, fz); c.load = null; K.sfx('drop', fx, fz); }
        }
        Sim.dirty = true; return true;
      }
      case 'unload': {
        const c = S.cars[P.car]; if (!c || c.kind !== 'camion' || c.dr !== pid) return true;
        if (!c.bed.length) { K.note(pid, 'Le camion est vide. Le cariste charge les palettes au QUAI GROS COLIS.'); return true; }
        const Z = ML.LOC.bigZone;
        if (c.x > Z.minX - 8 && c.x < Z.maxX + 8 && c.z > Z.minZ - 4 && c.z < Z.maxZ + 12) {   // retour à l'atelier : on dépose
          for (const it of c.bed.splice(0)) { const [x, z] = K.bigSpot(); K.spawnItem(it, x, 0, z); }
          Sim.dirty = true; return true;
        }
        let here = null; for (const k in ML.LOC.comp) if (Math.hypot(ML.LOC.comp[k].dock.x - c.x, ML.LOC.comp[k].dock.z - c.z) < 18) here = k;
        if (!here) { K.note(pid, 'Gare le camion devant le quai du client, puis R pour décharger.'); return true; }
        let n = 0;
        for (const it of c.bed.slice()) {
          const o = S.orders.find(x => x.id === it.d.oid);
          if (o && o.client === here && o.steps[o.si] === 'livraison') { c.bed.splice(c.bed.indexOf(it), 1); K.deliver(pid, null, 0, it, here, npcs[COMP[here].npc]); n++; }
        }
        if (!n) K.note(pid, `Aucune palette pour ${COMP[here].name} dans le camion.`, 'warn');
        Sim.dirty = true; return true;
      }
    }
    return false;
  };
  mod.use = (pid, P, ps, sel, held, kind, a) => {
    switch (kind) {
      case 'bac': {
        const M = S.machines[a]; if (!M) return true;
        if (!needRole(pid, 'maintenance', 'Les bacs à copeaux')) return true;
        if (M.bin && held && held.type === 'bac_vide') { K.note(pid, `${a} a déjà son bac.`); return true; }
        if (!M.bin) {
          if (held && held.type === 'bac_vide') { P.inv[sel] = null; M.bin = true; M.chips = 0; K.all(`🪣 Bac remis sur ${a} : la machine repart.`, 'good'); Sim.dirty = true; }
          else K.note(pid, `Il manque le bac de ${a} : vide le bac plein dans la BENNE À COPEAUX (dehors, à gauche) puis rapporte-le.`, 'warn');
          return true;
        }
        if (M.chips < 15) { K.note(pid, `Le bac de ${a} est presque vide.`); return true; }
        if (K.give(pid, { type: 'bac_plein', d: { mid: a } }, sel)) { M.bin = false; M.chips = 0; K.sfx('pickup', ps.x, ps.z); }
        return true;
      }
      case 'benne':
        if (held && held.type === 'bac_plein') { P.inv[sel] = { type: 'bac_vide', d: { mid: held.d.mid } }; K.sfx('clang', ps.x, ps.z); K.note(pid, `🗑 Vidé ! Rapporte le bac sur ${held.d.mid}.`, 'good'); Sim.dirty = true; }
        else K.note(pid, 'La benne à copeaux. On y vide les bacs pleins.');
        return true;
      case 'pl':
        if (!held && P.role === 'medecin') return true;   // le soin passe par l'intention « heal » (mini-jeu)
        return false;
    }
    return false;
  };
  mod.machineUse = (pid, P, sel, held, mid, M) => {
    if (M.broken && K.role(pid) !== 'maintenance' && held && held.type === 'cle') { needRole(pid, 'maintenance', 'Réparer'); return true; }
    if (M.bin === false || M.chips >= 100) { K.note(pid, `🗑 ${mid} est bloquée : bac à copeaux ${M.bin === false ? 'absent' : 'PLEIN'} (rôle maintenance).`, 'warn'); return true; }
    return false;
  };
  mod.npcUse = (pid, P, ps, sel, held, n) => {
    const comp = K.compOf(n.id), C2 = comp && COMP[comp];
    if (C2 && (C2.kind === 'matiere' || C2.kind === 'outils') && P.role !== 'magasinier') { K.say(n, 'Je ne traite qu\'avec le MAGASINIER de chez Lebec !'); needRole(pid, 'magasinier', 'Commander'); return true; }
    if (['docteur', 'gege', 'momo', 'sylvie'].includes(n.id)) { K.say(n, U.pick(ML.LINES[n.id])); return true; }
    return false;
  };
  mod.onHit = (pid, kind) => {
    const d = K.dog; if (kind === 'dog' && d && K.near(K.pose[pid], d.x, d.z, 3)) { d.flee = 6; K.sfx('dog', d.x, d.z); }
  };
  mod.workMult = (n, k) => { const M = n.mid && S.machines[n.mid]; return M && (M.bin === false || M.chips >= 100) ? 0 : k; };

  /* ---------- Lancers ---------- */
  mod.itemHit = o => {
    const d = K.dog;
    if (d && Math.hypot(o.x - d.x, o.z - d.z) < 1.2 && o.y < 1.5) {
      if (o.type === 'viennoiseries') { o.gone = true; d.sleep = 60; K.all('🐕 Le chien de la casse mange la viennoiserie… et s\'endort (60 s).', 'good'); }
      else d.flee = 6;
      return true;
    }
    // un outil lancé à un usineur qui en a besoin : il l'attrape !
    if (IT.def(o).kind === 'tool') for (const id in npcs) {
      const n = npcs[id]; if (!n.active || !n.mid || Math.hypot(o.x - n.x, o.z - n.z) > 1.1 || o.y > 2.4) continue;
      const M = S.machines[n.mid];
      if (M && M.job && !M.job.tool && IT.def(o).tool === M.job.need) {
        o.gone = true; o.rest = true; M.job.tool = true; if (M.worn) { M.worn = false; M.wear = 0; }
        K.say(n, U.pick(['Bien reçu !', 'Belle passe !', 'Attrapé !'])); K.stat(o.thr, 'catch'); Sim.dirty = true; return true;
      }
    }
    // dans une benne / un camion
    for (let i = 0; i < S.cars.length; i++) {
      const c = S.cars[i]; if (c.kind === 'fenwick' || IT.heavy(o)) continue;
      if (S.pl[o.thr] && (S.pl[o.thr].car === i)) continue;
      const k = c.kind === 'tp' ? 0.4 : c.kind === 'camion' ? 2.2 : 1.25, bx = c.x - Math.sin(c.h) * k, bz = c.z - Math.cos(c.h) * k;
      if (Math.hypot(o.x - bx, o.z - bz) < (c.kind === 'tp' ? 0.9 : 1.3) && o.y < 2.4 && o.vy < 0 && c.bed.length < c.cap && c.kind !== 'camion') {
        o.gone = true; o.rest = true; c.bed.push(K.strip(o)); K.sfx('drop', c.x, c.z); K.note(o.thr, `🎯 Dans ${c.name} !`, 'good'); Sim.dirty = true; return true;
      }
    }
    return false;
  };
  const r2 = v => Math.round(v * 100) / 100;
  mod.fast = f => { const d = K.dog; f.dog = d ? [r2(d.x), r2(d.z), r2(d.h), d.st === 'sleep' ? 0 : d.st === 'chase' ? 2 : 1] : null; };
  Sim.mods.push(mod);
})();
