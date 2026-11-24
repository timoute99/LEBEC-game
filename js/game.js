/* =====================================================================
   game.js — La session de jeu, chez CHAQUE joueur :
   - contrôle du joueur local (marche FPS, conduite, actions) ;
   - réseau : envoi de sa position (15 Hz) et de ses intentions, réception
     des instantanés de l'hôte (fast 10 Hz : PNJ/objets en vol/voitures ;
     slow : tout l'état, dès qu'il change) et des événements ;
   - rendu lissé (interpolation) des autres joueurs, PNJ, objets, voitures.
   Chez l'hôte, la même boucle appelle aussi ML.Sim (qui fait autorité).
   ===================================================================== */
(function () {
  const G = ML.Game = { on: false, S: null, itemViews: {}, npcViews: {}, avatars: {}, remote: {} };
  const U = ML.U, C = ML.CFG, I = ML.Input;
  const HAIR = [0x3b2a1a, 0xe0b050, 0x111111, 0x8b5a2b, 0xa0522d], SKIN = [0xf0c8a0, 0xe2b48c, 0x8d5524, 0xf5cfaa, 0xc68642];

  /* ======================= Démarrage / arrêt ======================= */
  G.start = cfg => {
    G.cleanup(); ML.ui.modal = null;
    Object.assign(G, { on: true, me: cfg.me, host: cfg.host, isHost: cfg.me === cfg.host, solo: !!cfg.solo, players: {}, S: null, ended: false,
      lastSnap: performance.now(), poseT: 0, fastT: 0, slowT: 0, cur: null, camMode: 'cab' });
    cfg.players.forEach(p => { G.players[p.id] = p; });
    const meP = G.players[G.me], sp = ML.LOC.spawn[meP.idx % 5];
    G.p = { pos: new THREE.Vector3(sp.x, 0, sp.z), vy: 0, yaw: Math.PI / 2, pitch: -0.05, sel: 0, stamina: C.PLAYER.stamina, stun: 0, punchT: 0, bob: 0, car: null, look: { y: 0, p: 0 } };
    for (const p of cfg.players) if (p.id !== G.me) G.addAvatar(p);
    for (const id in ML.PEOPLE) {
      const v = ML.People.build(ML.PEOPLE[id].look, { name: ML.PEOPLE[id].name }); v.id = id; v.st = 'w'; v.group.visible = false; G.npcViews[id] = v;
    }
    if (!ML.Cars.list.length) { ML.Cars.build(0, 0xf4c430, "MÉGA MÉGANE d'Amaury"); ML.Cars.build(1, 0xecf0f1, 'Kangoo de Lebec'); }
    ML.LOC.carSpawn.forEach((s, i) => { const c = ML.Cars.list[i]; c.pos.set(s.x, 0, s.z); c.target.copy(c.pos); c.h = c.th = s.h; c.local = false; c.speed = 0; c.steer = 0; });
    if (G.isHost) { ML.Sim.init({ seed: cfg.seed, players: cfg.players }); ML.Sim.setPose(G.me, G.myPose()); G.hostTick(0, true); }
    ML.HUD.startGame(); ML.Sfx.init(); I.lock();
    G.updateView(0, false);
  };
  G.cleanup = () => {
    for (const id in G.avatars) ML.People.dispose(G.avatars[id]);
    for (const id in G.npcViews) ML.People.dispose(G.npcViews[id]);
    for (const id in G.itemViews) ML.scene.remove(G.itemViews[id].mesh);
    G.avatars = {}; G.npcViews = {}; G.itemViews = {}; G.remote = {};
    if (ML.Dialogue.open) ML.Dialogue.forceClose();
    ML.Sfx.setEngine(false, 0);
  };
  G.stop = msg => {
    if (!G.on) return;
    G.on = false; G.cleanup(); I.unlock(); ML.ui.modal = null;
    ML.HUD.stopGame(); if (msg) ML.HUD.toast(msg);
  };
  G.addAvatar = p => {
    const c = ML.COLORS[p.idx % 5];
    const v = ML.People.build({ skin: SKIN[p.idx % 5], shirt: c.hex, pants: 0x2c3e50, hair: HAIR[p.idx % 5], height: 1.78 }, { name: p.name, nameColor: c.css, helmet: 0xf5f5f5, vest: c.hex });
    v.group.visible = false; G.avatars[p.id] = v; return v;
  };

  /* ======================= Accès à l'état ======================= */
  G.order = oid => G.S && G.S.orders.find(o => o.id === oid);
  G.held = () => (G.S && G.S.pl[G.me] ? G.S.pl[G.me].inv[G.p.sel] : null);
  G.npcDist = id => { const v = G.npcViews[id]; return v ? U.d2(v.pos, G.p.pos) : 99; };
  G.myPose = () => {
    const p = G.p, c = p.car !== null ? ML.Cars.list[p.car] : null;
    const r = v => Math.round(v * 100) / 100;
    return { k: 'p', x: r(c ? c.pos.x : p.pos.x), y: r(p.pos.y), z: r(c ? c.pos.z : p.pos.z), yaw: r(p.yaw), sel: p.sel, st: p.stun > 0 ? 1 : 0,
      car: c ? { i: p.car, x: r(c.pos.x), z: r(c.pos.z), h: r(c.h), s: r(c.speed) } : null };
  };
  /** Envoie une intention à l'hôte (ou l'applique directement si on est l'hôte) */
  G.intent = m => {
    m.sel = G.p.sel;
    const ps = G.myPose(); m.p = [ps.x, ps.y, ps.z, ps.yaw];      // position au moment de l'action (évite une pose périmée)
    if (G.isHost) { ML.Sim.setPose(G.me, G.myPose()); ML.Sim.act(G.me, m); }
    else ML.Net.relay(Object.assign({ k: 'a' }, m), G.host);
  };

  /* ======================= Réseau ======================= */
  G.onRelay = msg => {
    if (!G.on) return;
    const from = msg.from, d = msg.d; if (!d) return;
    if (d.k === 'p') {
      G.remote[from] = d;
      if (G.isHost) ML.Sim.setPose(from, d);
      const av = G.avatars[from];
      if (av) { av.target.set(d.x, d.y || 0, d.z); av.tYaw = d.yaw + Math.PI; av.inCar = !!d.car; if (!av.seen) { av.pos.copy(av.target); av.seen = true; } }
      if (d.car && ML.Cars.list[d.car.i] && !ML.Cars.list[d.car.i].local) { const c = ML.Cars.list[d.car.i]; c.target.set(d.car.x, 0, d.car.z); c.th = d.car.h; }
      return;
    }
    if (d.k === 'a') { if (G.isHost) ML.Sim.act(from, d); return; }
    if (from === G.host) G.apply(d);
  };

  G.apply = d => {
    if (d.k === 'f') {
      G.lastSnap = performance.now(); G.rt = d.rt;
      for (const [id, x, z, yaw, mv, st, b] of d.n) {
        const v = G.npcViews[id]; if (!v) continue;
        v.target.set(x, 0, z); v.tYaw = yaw; v.st = st; v.mv = mv;
        ML.People.setBubble(v, b, b && b[0] === '❓' ? '#7a3b00' : '#111');
        if (!v.seen) { v.pos.copy(v.target); v.seen = true; v.group.visible = true; }
      }
      for (const [id, x, y, z, ry] of d.i) { const iv = G.itemViews[id]; if (iv) { iv.target.set(x, y, z); iv.ry = ry; } }
      d.c.forEach(([x, z, h, dr], i) => { const c = ML.Cars.list[i]; if (c && !c.local && dr !== G.me) { c.target.set(x, 0, z); c.th = h; } });
    } else if (d.k === 's') {
      G.lastSnap = performance.now();
      G.S = d.S; G.rt = d.S.rt;
      // objets au sol : créer / supprimer / déplacer
      const seen = {};
      for (const [id, type, dd, x, y, z, ry] of d.S.items) {
        seen[id] = 1;
        let iv = G.itemViews[id];
        const key = type + JSON.stringify(dd);
        if (iv && iv.key !== key) { ML.scene.remove(iv.mesh); iv = null; }
        if (!iv) {
          const mesh = ML.Items.mesh({ type, d: dd }); mesh.position.set(x, y, z); mesh.rotation.y = ry; ML.scene.add(mesh);
          iv = G.itemViews[id] = { id, type, d: dd, key, mesh, target: new THREE.Vector3(x, y, z), ry };
        }
        iv.target.set(x, y, z); iv.ry = ry;
      }
      for (const id in G.itemViews) if (!seen[id]) { ML.scene.remove(G.itemViews[id].mesh); delete G.itemViews[id]; }
      // voitures : prise / perte du volant
      d.S.cars.forEach((sc, i) => {
        const c = ML.Cars.list[i]; if (!c) return;
        if (sc.dr === G.me && G.p.car === null && performance.now() - (G.exitAt || 0) > 1500) G.enterCar(i, sc);
        else if (sc.dr !== G.me && G.p.car === i && performance.now() - (G.enterAt || 0) > 1500) G.leaveCarLocal();
        if (!c.local && sc.dr !== G.me) { c.target.set(sc.x, 0, sc.z); c.th = sc.h; }
      });
      // objets tenus par les autres
      for (const pid in G.avatars) { const P = d.S.pl[pid], r = G.remote[pid]; ML.People.setHeld(G.avatars[pid], P && r ? P.inv[r.sel || 0] : null); }
    } else if (d.k === 'e') {
      for (const e of d.l) G.event(e);
    }
  };

  G.event = e => {
    const mine = !e.to || e.to === G.me;
    switch (e.e) {
      case 'n': if (mine) ML.HUD.notify(e.s, e.ty); break;
      case 'say': { const v = G.npcViews[e.n]; if (v && U.d2(v.pos, G.camPos()) < 18) { ML.HUD.subtitle(ML.PEOPLE[e.n].name, e.s); if (e.sp) ML.Sfx.speak(e.s.replace(/!+/g, '!'), { pitch: e.n === 'lebec' ? 0.6 : 1, force: e.n === 'lebec' }); } break; }
      case 'big': if (mine) ML.HUD.big(e.s, e.c); break;
      case 'sfx': if (e.x === undefined) ML.Sfx.play(e.s); else ML.Sfx.at(e.s, e.x, e.z); break;
      case 'stun': if (e.to === G.me) { G.p.stun = e.d; ML.HUD.flash('rgba(255,255,255,0.5)'); } break;
      case 'pelle':
        if (e.to === G.me) { G.p.stun = 3; ML.HUD.flash('#fff'); ML.HUD.big('COUP DE PELLE !', '#ff3b30'); ML.Sfx.speak('Coup de pelle !', { force: true, pitch: 0.6 }); if (ML.Dialogue.open) ML.Dialogue.forceClose(); }
        else ML.HUD.notify(`🪓 ${G.S && G.S.pl[e.to] ? G.S.pl[e.to].name : '?'} s'est pris un coup de pelle !`, 'warn');
        break;
      case 'drive': break;   // la prise du volant passe par l'état (slow)
      case 'end': G.ended = true; if (ML.Dialogue.open) ML.Dialogue.forceClose(); ML.HUD.showEnd(e.res); break;
    }
  };

  /* ======================= Boucle ======================= */
  G.step = (dt, render, raw) => {
    if (!G.on) return;
    G.controls(dt);
    G.poseT -= dt;
    if (G.poseT <= 0) {
      G.poseT = 1 / C.NET.poseHz;
      const ps = G.myPose();
      if (G.isHost) ML.Sim.setPose(G.me, ps);
      if (!G.solo) ML.Net.relay(ps);
    }
    if (G.isHost) {           // l'hôte suit le temps réel même si son affichage rame (sous-pas de 50 ms)
      let left = raw || dt;
      while (left > 1e-6) { const s = Math.min(0.05, left); G.hostTick(s); left -= s; }
    }
    if (render === false) return;
    G.renderViews(dt);
    ML.World.updateVisuals(dt, G.S);
    ML.Dialogue.update(dt);
    if (!ML.ui.modal && G.p.car === null && G.p.stun <= 0 && G.S) G.scan(); else G.cur = null;
    G.updateView(dt);
    G.updateLight();
    ML.HUD.update(dt);
  };

  G.hostTick = (dt, force) => {
    ML.Sim.step(dt);
    G.fastT -= dt; G.slowT -= dt;
    if (force || G.fastT <= 0) { G.fastT = 1 / C.NET.fastHz; const f = ML.Sim.fast(); G.apply(f); if (!G.solo) ML.Net.relay(f); }
    if (force || G.slowT <= 0 || (ML.Sim.dirty && G.slowT <= C.NET.slowEvery - 0.1)) {
      G.slowT = C.NET.slowEvery; const s = ML.Sim.slow(); G.apply(s); if (!G.solo) ML.Net.relay(s);
    }
    const ev = ML.Sim.drain();
    if (ev.length) { const m = { k: 'e', l: ev }; G.apply(m); if (!G.solo) ML.Net.relay(m); }
  };

  /* ======================= Contrôles du joueur local ======================= */
  G.controls = dt => {
    const p = G.p, PC = C.PLAYER;
    if (p.stun > 0) p.stun -= dt;
    if (p.punchT > 0) p.punchT -= dt;
    const can = !ML.ui.modal && p.stun <= 0 && I.locked && !G.ended;
    // touches communes
    if (can) {
      if (I.pressed('KeyM')) ML.HUD.notify(ML.Sfx.toggleMute() ? '🔇 Son coupé' : '🔊 Son activé');
      if (I.pressed('Tab')) ML.HUD.toggleHelp();
      for (let i = 1; i <= 3; i++) if (I.pressed('Digit' + i)) p.sel = i - 1;
      if (I.wheel) p.sel = (p.sel + (I.wheel > 0 ? 1 : -1) + 3) % 3;
    }
    if (ML.ui.modal === 'dialogue') { for (let i = 1; i <= 9; i++) if (I.pressed('Digit' + i) || I.pressed('Numpad' + i)) { ML.Dialogue.pick(i - 1); break; } if (I.pressed('Escape')) ML.Dialogue.close(); }
    else if (ML.ui.modal === 'help' && (I.pressed('Tab') || I.pressed('Escape'))) ML.HUD.toggleHelp();

    // --- en voiture ---
    if (p.car !== null) {
      const c = ML.Cars.list[p.car];
      if (can) { p.look.y = U.clamp(p.look.y - I.mdx * 0.002, -2, 2); p.look.p = U.clamp(p.look.p - I.mdy * 0.002, -0.8, 0.6); }
      ML.Cars.drive(c, dt, can);
      ML.Sfx.setEngine(true, c.speed);
      if (can && I.pressed('KeyE')) G.exitCar();
      if (can && I.pressed('KeyV')) G.camMode = G.camMode === 'cab' ? 'chase' : 'cab';
      if (can && I.pressed('KeyH')) ML.Sfx.play('horn');
      return;
    }
    // --- à pied ---
    if (can) { p.yaw -= I.mdx * 0.0022; p.pitch = U.clamp(p.pitch - I.mdy * 0.0022, -1.45, 1.45); }
    let mx = 0, mz = 0;
    if (can) {
      if (I.down('KeyW') || I.down('ArrowUp')) mz -= 1; if (I.down('KeyS') || I.down('ArrowDown')) mz += 1;
      if (I.down('KeyA') || I.down('ArrowLeft')) mx -= 1; if (I.down('KeyD') || I.down('ArrowRight')) mx += 1;
    }
    const len = Math.hypot(mx, mz), S = G.S;
    const unlimited = S && S.buffs.cafe > S.rt, coffee = S && S.pl[G.me] && S.pl[G.me].coffee > S.rt;
    let speed = PC.walk;
    if ((I.down('ShiftLeft') || I.down('ShiftRight')) && len > 0 && (p.stamina > 0 || unlimited)) { speed = PC.sprint; if (!unlimited) p.stamina -= dt * (coffee ? 0.45 : 1); }
    else p.stamina = Math.min(PC.stamina, p.stamina + dt * 0.8);
    if (len > 0) {
      mx /= len; mz /= len;
      const s = Math.sin(p.yaw), co = Math.cos(p.yaw);
      p.pos.x += (mx * co + mz * s) * speed * dt; p.pos.z += (-mx * s + mz * co) * speed * dt;
      p.bob += dt * speed * 1.8;
    }
    U.resolveCircle(p.pos, PC.r);
    const push = (q, r) => { const dx = p.pos.x - q.x, dz = p.pos.z - q.z, d = Math.hypot(dx, dz); if (d < r && d > 0.001) { p.pos.x = q.x + dx / d * r; p.pos.z = q.z + dz / d * r; } };
    for (const id in G.npcViews) if (G.npcViews[id].seen) push(G.npcViews[id].pos, PC.r + 0.3);
    for (const id in G.avatars) if (G.avatars[id].group.visible) push(G.avatars[id].pos, PC.r + 0.35);
    ML.Cars.pushOut(p.pos, PC.r);
    if (can && I.pressed('Space') && p.pos.y <= 0.001) p.vy = 5.2;
    p.vy -= 15 * dt; p.pos.y += p.vy * dt; if (p.pos.y < 0) { p.pos.y = 0; p.vy = 0; }
    p.moving = len > 0;
    if (!can) return;
    if (I.pressed('KeyE') && G.cur) ML.Rules.use(G.cur.id);
    if (I.left) G.punch();
    if (I.right) G.throwHeld();
    if (I.pressed('KeyG') && G.held()) { G.intent({ a: 'drop' }); ML.Sfx.play('drop'); }
  };

  G.forward = () => { const p = G.p, cp = Math.cos(p.pitch); return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp }; };
  G.eye = () => new THREE.Vector3(G.p.pos.x, G.p.pos.y + C.PLAYER.eye, G.p.pos.z);
  G.camPos = () => ML.camera.position;

  G.punch = () => {
    G.p.punchT = 0.25; ML.Sfx.play('whoosh');
    const e = G.eye(), f = G.forward(); let best = null, bd = 2.4;
    const test = (id, pos, h) => { const dx = pos.x - e.x, dy = h * 0.72 - e.y, dz = pos.z - e.z, d = Math.hypot(dx, dy, dz); if (d < bd && (dx * f.x + dy * f.y + dz * f.z) / d > 0.7) { bd = d; best = id; } };
    for (const id in G.npcViews) if (G.npcViews[id].seen) test('npc:' + id, G.npcViews[id].pos, G.npcViews[id].h);
    for (const id in G.avatars) if (G.avatars[id].group.visible) test('pl:' + id, G.avatars[id].pos, 1.86);
    if (best) G.intent({ a: 'hit', id: best });
  };
  G.throwHeld = () => {
    const h = G.held();
    if (!h) { ML.HUD.notify('Rien en main à lancer. Prends un brut au rack !'); return; }
    if (ML.Items.bulky(h)) { ML.HUD.notify('Trop lourd pour être lancé. Pose la caisse avec G.'); return; }
    const f = G.forward(); G.intent({ a: 'throw', v: [f.x * 15, f.y * 15 + 2.5, f.z * 15] }); ML.Sfx.play('whoosh');
  };

  /* ======================= Voiture ======================= */
  G.enterCar = (i, sc) => {
    const c = ML.Cars.list[i]; G.p.car = i; c.local = true; G.enterAt = performance.now(); c.speed = 0; c.steer = 0;
    c.pos.set(sc.x, 0, sc.z); c.h = sc.h; c.target.copy(c.pos); c.th = c.h;
    G.p.look = { y: 0, p: 0 }; ML.Sfx.play('horn');
    if (!G.driveHint) { G.driveHint = true; ML.HUD.notify('Z/S accélérer-freiner · Q/D tourner · Espace frein · V vue · E descendre'); }
  };
  G.exitCar = () => {
    const c = ML.Cars.list[G.p.car];
    if (Math.abs(c.speed) > 2) { ML.HUD.notify("Arrête-toi d'abord !"); return; }
    const f = ML.Cars.fwd(c.h), l = ML.Cars.left(c.h);
    for (const [dx, dz] of [[l.x * 2, l.z * 2], [-l.x * 2, -l.z * 2], [-f.x * 3.3, -f.z * 3.3], [f.x * 3.3, f.z * 3.3]]) {
      const x = c.pos.x + dx, z = c.pos.z + dz;
      if (!U.inCollider(x, z, 0.45)) {
        G.intent({ a: 'exit', car: G.p.car, x: c.pos.x, z: c.pos.z, h: c.h });
        G.exitAt = performance.now(); G.leaveCarLocal(); G.p.pos.set(x, 0, z); G.p.yaw = c.h + Math.PI; G.p.pitch = 0;
        return;
      }
    }
    ML.HUD.notify('Impossible de sortir ici, recule un peu.');
  };
  G.leaveCarLocal = () => {
    const c = ML.Cars.list[G.p.car]; if (c) { c.local = false; c.speed = 0; c.target.copy(c.pos); c.th = c.h; }
    if (c && G.p.car !== null) { G.p.pos.set(c.pos.x + ML.Cars.left(c.h).x * 2, 0, c.pos.z + ML.Cars.left(c.h).z * 2); }
    G.p.car = null; ML.Sfx.setEngine(false, 0);
  };

  /* ======================= Ciblage [E] ======================= */
  G.scan = () => {
    const eye = G.eye(), f = G.forward();
    let best = null, bestS = Infinity;
    const consider = (id, x, y, z, r) => {
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, dist = Math.hypot(dx, dy, dz);
      if (dist > r || dist < 0.01) return;
      const dot = (dx * f.x + dy * f.y + dz * f.z) / dist;
      if (dot < (dist < 1.3 ? 0.35 : 0.8)) return;
      const sc = (1 - dot) * 5 + dist * 0.25; if (sc >= bestS) return;
      const label = ML.Rules.label(id); if (!label) return;
      bestS = sc; best = { id, label };
    };
    for (const t of ML.World.targets) {
      if (t.id === 'reception') { const R = ML.LOC.reception; consider(t.id, U.clamp(G.p.pos.x, R.x - 3.5, R.x + 3.5), 0.8, U.clamp(G.p.pos.z, R.z - 2.3, R.z + 2.3), 2.8); }
      else consider(t.id, t.x, t.y, t.z, t.r);
    }
    for (const id in G.itemViews) { const m = G.itemViews[id].mesh.position; consider('item:' + id, m.x, m.y + 0.35, m.z, 2.5); }
    for (const id in G.npcViews) { const v = G.npcViews[id]; if (v.seen) consider('npc:' + id, v.pos.x, v.h * 0.72, v.pos.z, 3.2); }
    ML.Cars.list.forEach((c, i) => { const d = ML.Cars.doorPos(c), r = ML.Cars.rearPos(c); consider(`car:${i}:door`, d.x, d.y, d.z, 2.5); consider(`car:${i}:bed`, r.x, r.y, r.z, 2.7); });
    for (const id in G.avatars) { const a = G.avatars[id]; if (a.group.visible) consider('pl:' + id, a.pos.x, 1.3, a.pos.z, 2.8); }
    G.cur = best;
  };

  /* ======================= Rendu ======================= */
  G.renderViews = dt => {
    for (const id in G.npcViews) { const v = G.npcViews[id]; if (v.seen) ML.People.animate(v, dt, v.st === 'c' ? 'chase' : v.st === 's' ? 'stun' : v.st === 'b' ? 'box' : null); }
    for (const id in G.avatars) {
      const a = G.avatars[id];
      a.group.visible = !!a.seen && !a.inCar && !!(G.S && G.S.pl[id]);
      if (a.group.visible) ML.People.animate(a, dt, G.remote[id] && G.remote[id].st ? 'stun' : null);
    }
    const t = performance.now() / 1000;
    for (const id in G.itemViews) {
      const iv = G.itemViews[id], m = iv.mesh;
      if (m.position.distanceToSquared(iv.target) > 25) m.position.copy(iv.target); else m.position.lerp(iv.target, Math.min(1, dt * 14));
      m.rotation.y = U.lerpAngle(m.rotation.y, iv.ry, Math.min(1, dt * 10));
      if (m.userData.spin) { m.userData.spin.rotation.y = t * 2; m.userData.spin.position.y = 0.45 + Math.sin(t * 3) * 0.12; }
    }
    ML.Cars.list.forEach((c, i) => ML.Cars.render(c, dt, G.S && G.S.cars[i] ? G.S.cars[i].bed : []));
  };

  G.updateView = (dt) => {
    const cam = ML.camera, p = G.p;
    if (!G.view) {
      G.view = new THREE.Group(); cam.add(G.view);
      G.fist = U.box(0.12, 0.12, 0.22, 0xe2b48c, 0.28, -0.32, -0.5, G.view, false); G.fist.visible = false;
    }
    if (p.car !== null) { G.view.visible = false; ML.Cars.camera(ML.Cars.list[p.car], G.camMode, p.look); return; }
    G.view.visible = true;
    const bob = p.moving ? Math.sin(p.bob) * 0.04 : 0;
    cam.position.set(p.pos.x, p.pos.y + C.PLAYER.eye + bob - (p.stun > 0 ? 0.6 : 0), p.pos.z);
    cam.rotation.set(p.pitch, p.yaw, p.stun > 0 ? Math.sin(p.stun * 8) * 0.3 : 0, 'YXZ');
    const h = G.held(), key = h ? h.type + JSON.stringify(h.d) : null;
    if (key !== G.viewKey) {
      if (G.heldMesh) G.view.remove(G.heldMesh); G.heldMesh = null;
      if (h) { G.heldMesh = ML.Items.mesh(h, { noLabel: true }); G.heldMesh.traverse(o => { o.castShadow = false; }); if (ML.Items.bulky(h)) G.heldMesh.position.set(0, -0.85, -0.95); else G.heldMesh.position.set(0.3, -0.36, -0.55); G.view.add(G.heldMesh); }
      G.viewKey = key;
    }
    G.fist.visible = p.punchT > 0;
    if (p.punchT > 0) { const k = Math.sin((1 - p.punchT / 0.25) * Math.PI); G.fist.position.set(0.22 - k * 0.12, -0.3 + k * 0.12, -0.45 - k * 0.45); }
  };

  /** Lumière : le soleil suit la caméra (ombres nettes autour du joueur) et baisse après 17 h */
  G.updateLight = () => {
    const L = ML.light, cam = ML.camera.position;
    L.sun.position.set(cam.x + 30, 60, cam.z + 20); L.sun.target.position.set(cam.x, 0, cam.z); L.sun.target.updateMatrixWorld();
    const min = C.DAY_START + (G.rt || 0) * (C.DAY_END - C.DAY_START) / C.SHIFT_SEC;
    const k = min > 17 * 60 ? U.lerp(1, 0.3, Math.min(1, (min - 1020) / 120)) : 1;
    L.sun.intensity = 0.85 * k; L.hemi.intensity = 0.35 + 0.45 * k;
    ML.scene.background.copy(L.day).lerp(L.night, 1 - k); ML.scene.fog.color.copy(ML.scene.background);
    ML.World.setDaylight(k);
  };
  G.clockMin = () => C.DAY_START + (G.rt || 0) * (C.DAY_END - C.DAY_START) / C.SHIFT_SEC;
})();
