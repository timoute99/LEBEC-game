/* =====================================================================
   game.js — La session de jeu, chez CHAQUE joueur :
   - contrôle du joueur local (marche FPS, conduite, actions, chaos :
     glissades, ragdoll, soufflette, extincteur, émotes, ping) ;
   - réseau : envoi de sa position (15 Hz) et de ses intentions, réception
     des instantanés de l'hôte (fast 10 Hz / slow sur changement) et des
     événements ;
   - rendu lissé des autres joueurs, PNJ, objets, véhicules, effets.
   Chez l'hôte, la même boucle appelle aussi ML.Sim (qui fait autorité).
   ===================================================================== */
(function () {
  const G = ML.Game = { on: false, S: null, itemViews: {}, npcViews: {}, avatars: {}, remote: {}, looks: {} };
  const U = ML.U, C = ML.CFG, I = ML.Input;

  /* ======================= Démarrage / arrêt ======================= */
  G.start = cfg => {
    G.cleanup(); ML.ui.modal = null; if (ML.Main.preview) ML.Main.preview(false);
    const game = cfg.game || { mode: 'coop' };
    Object.assign(G, { on: true, me: cfg.me, host: cfg.host, isHost: cfg.me === cfg.host, solo: !!cfg.solo, players: {}, S: null, ended: false, game, traitor: false,
      lastSnap: performance.now(), poseT: 0, fastT: 0, slowT: 0, cur: null, camMode: 'cab', sprayT: 0, fxT: 0, dryOnce: false, spillT: 0, auraT: 0, power: true, endShown: false });
    cfg.players.forEach(p => { G.players[p.id] = p; });
    if (ML.Sync) ML.Sync.reset();                          // net.js : delta du grand livre, resynchro, sauvegarde de mi-journée
    ML.Career.apply(game.career || null);                  // carrière : machines, ouvriers, taille de l'atelier (career.js)
    ML.World.build(cfg.seed, game.upgrades || {});
    ML.World.setPower(true); ML.Fx.reset(); ML.Cars.clear(); ML.Cars.parkPolice();
    const meP = G.players[G.me], SPW = ML.LOC.spawn, sp0 = SPW[meP.idx % SPW.length], sp = meP.idx < SPW.length ? sp0 : { x: sp0.x + 1.6, z: sp0.z };   // 6e joueur : à côté d'un point de départ
    G.p = { pos: new THREE.Vector3(sp.x, 0, sp.z), vy: 0, yaw: Math.PI / 2, pitch: -0.05, sel: 0, stamina: C.PLAYER.stamina, stun: 0, punchT: 0, bob: 0, car: null, look: { y: 0, p: 0 }, slip: 0, slipV: null, push: null, rag: null, roll: 0 };
    G.looks[G.me] = ML.Account.look();
    for (const p of cfg.players) if (p.id !== G.me) G.addAvatar(p);
    for (const id in ML.PEOPLE) {
      const v = ML.People.build(ML.PEOPLE[id].look, { name: ML.PEOPLE[id].name }); v.id = id; v.st = 'w'; v.group.visible = false; G.npcViews[id] = v;
    }
    ML.Account.startDay();
    if (G.isHost) { ML.Sim.init({ seed: cfg.seed, players: cfg.players, game }); ML.Sim.setPose(G.me, G.myPose()); G.hostTick(0, true); }
    G.sendLook(); setTimeout(G.sendLook, 1500); setTimeout(G.sendLook, 5000);
    ML.HUD.startGame(); ML.Sfx.init(); I.lock();
    G.updateView(0);
  };
  G.cleanup = () => {
    for (const id in G.avatars) ML.People.dispose(G.avatars[id]);
    for (const id in G.npcViews) ML.People.dispose(G.npcViews[id]);
    for (const id in G.itemViews) ML.scene.remove(G.itemViews[id].mesh);
    G.avatars = {}; G.npcViews = {}; G.itemViews = {}; G.remote = {};
    if (ML.Dialogue.open) ML.Dialogue.forceClose();
    ML.Mini.forceClose(); ML.Cars.clear();
    if (G.rain) { ML.scene.remove(G.rain); G.rain = null; }
    ML.Sfx.setEngine(false, 0);
  };
  G.stop = msg => {
    if (!G.on) return;
    G.on = false; G.cleanup(); I.unlock(); ML.ui.modal = null;
    ML.HUD.stopGame(); if (msg) ML.HUD.toast(msg);
    ML.Main.menuScene();
  };
  G.addAvatar = p => {
    const c = ML.COLORS[p.idx % ML.COLORS.length], L = G.looks[p.id] || {};
    if (G.avatars[p.id]) ML.People.dispose(G.avatars[p.id]);
    const role = ML.ROLES[(G.game.roles || {})[p.id]] || ML.ROLES.poly, suit = L.suit !== undefined ? L.suit : 0x1f4e9a;
    const v = ML.People.build({ skin: L.skin !== undefined ? L.skin : ML.SKINS[p.idx % 5], shirt: L.shirt || suit, pants: suit, hair: L.hair !== undefined ? L.hair : ML.HAIRS[p.idx % 5], height: L.height || 1.78, width: L.width || 1, beard: L.beard, glasses: L.glasses },
      { name: role.icon + ' ' + p.name, nameColor: c.css, helmet: L.hat ? null : 0xf5f5f5, hat: L.hat, vest: role.color });
    const old = G.avatars[p.id]; if (old) { v.pos.copy(old.pos); v.target.copy(old.target); v.seen = old.seen; v.inCar = old.inCar; }
    v.group.visible = false; G.avatars[p.id] = v; return v;
  };
  G.sendLook = () => { if (!G.on) return; const look = ML.Account.look(); G.looks[G.me] = look; if (!G.solo) ML.Net.relay({ k: 'look', look }); };

  /* ======================= Accès à l'état ======================= */
  G.order = oid => G.S && G.S.orders.find(o => o.id === oid);
  G.held = () => (G.S && G.S.pl[G.me] ? G.S.pl[G.me].inv[G.p.sel] : null);
  G.npcDist = id => { const v = G.npcViews[id]; return v && v.seen && v.group.visible ? U.d2(v.pos, G.p.pos) : 99; };
  G.nearPump = () => { const c = G.p.car !== null && ML.Cars.list[G.p.car], P = ML.LOC.pump; return !!(c && P && c.kind !== 'tp' && Math.hypot(P.x - c.pos.x, P.z - c.pos.z) < 9); };
  G.myPose = () => {
    const p = G.p, c = p.car !== null ? ML.Cars.list[p.car] : null;
    const r = v => Math.round(v * 100) / 100;
    return { k: 'p', x: r(c ? c.pos.x : p.pos.x), y: r(p.pos.y), z: r(c ? c.pos.z : p.pos.z), yaw: r(p.yaw), sel: p.sel, st: p.stun > 0 ? 1 : 0, fx: G.fxNow || null,
      car: c ? { i: p.car, x: r(c.pos.x), z: r(c.pos.z), h: r(c.h), s: r(c.speed), f: Math.round(c.fuel) } : null, ride: p.ride ? { i: p.ride.car, seat: p.ride.seat } : null };
  };
  /** Envoie une intention à l'hôte (ou l'applique directement si on est l'hôte) */
  G.intent = m => {
    m.sel = G.p.sel;
    const ps = G.myPose(); m.p = [ps.x, ps.y, ps.z, ps.yaw];
    if (G.isHost) { ML.Sim.setPose(G.me, ps); ML.Sim.act(G.me, m); }
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
      if (av) { av.target.set(d.x, d.y || 0, d.z); av.tYaw = d.yaw + Math.PI; av.inCar = !!d.car || !!(d.ride && d.ride.seat === 'cab'); if (!av.seen) { av.pos.copy(av.target); av.seen = true; } }
      if (d.car && ML.Cars.list[d.car.i] && !ML.Cars.list[d.car.i].local) { const c = ML.Cars.list[d.car.i]; c.target.set(d.car.x, 0, d.car.z); c.th = d.car.h; c.speed = d.car.s || 0; }
      return;
    }
    if (d.k === 'look') { G.looks[from] = d.look; if (G.players[from]) G.addAvatar(G.players[from]); return; }
    if (d.k === 'a') { if (G.isHost) ML.Sim.act(from, d); return; }
    if (ML.Sync && ML.Sync.relay(from, d)) return;          // net.js : resynchro {k:'rs'}, copie de la carrière {k:'cs'}
    if (from === G.host) G.apply(d);
  };

  G.apply = d => {
    if (d.k === 'f') {
      G.lastSnap = performance.now(); G.rt = d.rt;
      const seen = {};
      for (const [id, x, z, yaw, mv, st, b] of d.n) {
        const v = G.npcViews[id]; if (!v) continue; seen[id] = 1;
        v.target.set(x, 0, z); v.tYaw = yaw; v.st = st; v.mv = mv;
        ML.People.setBubble(v, b, b && b[0] === '❓' ? '#7a3b00' : '#111');
        if (!v.seen) { v.pos.copy(v.target); v.seen = true; }
        v.group.visible = true;
      }
      for (const id in G.npcViews) if (!seen[id] && G.npcViews[id].seen) { G.npcViews[id].group.visible = false; G.npcViews[id].seen = false; }
      for (const [id, x, y, z, ry] of d.i) { const iv = G.itemViews[id]; if (iv) { iv.target.set(x, y, z); iv.ry = ry; } }
      d.c.forEach(([x, z, h, dr], i) => { const c = ML.Cars.list[i]; if (c && !c.local && dr !== G.me) { c.target.set(x, 0, z); c.th = h; } });
      ML.Cars.updateTraffic(d.tr, d.pol);
      ML.Fx.fast(d);
    } else if (d.k === 's') {
      G.lastSnap = performance.now();
      if (ML.Sync && !G.isHost) ML.Sync.in(d);              // grand livre reçu en delta (net.js)
      G.S = d.S; G.rt = d.S.rt;
      if (ML.Place) ML.Place.sync(d.S);                    // machines installées / désinstallées (sim_build.js)
      if (ML.Cars.sync(d.S.cars)) d.S.cars.forEach((sc, i) => { const c = ML.Cars.list[i]; c.pos.set(sc.x, 0, sc.z); c.target.copy(c.pos); c.h = c.th = sc.h; });
      const seen = {};
      for (const [id, type, dd, x, y, z, ry] of d.S.items) {
        seen[id] = 1;
        let iv = G.itemViews[id];
        const key = type + JSON.stringify(dd);
        if (iv && iv.key !== key) { ML.scene.remove(iv.mesh); iv = null; }
        if (!iv) {
          const mesh = ML.Items.mesh({ type, d: dd }); mesh.position.set(x, y + ML.Terrain.h(x, z), z); mesh.rotation.y = ry; ML.scene.add(mesh);
          iv = G.itemViews[id] = { id, type, d: dd, key, mesh, target: new THREE.Vector3(x, y, z), ry };
        }
        iv.target.set(x, y, z); iv.ry = ry;
      }
      for (const id in G.itemViews) if (!seen[id]) { ML.scene.remove(G.itemViews[id].mesh); delete G.itemViews[id]; }
      const myRide = d.S.cars.map((sc, i) => [i, (sc.pass || []).find(x => x.pid === G.me)]).find(x => x[1]);
      if (myRide && !G.p.ride && performance.now() - (G.exitAt || 0) > 1500) { G.p.ride = { car: myRide[0], seat: myRide[1].seat }; G.p.look = { y: 0, p: 0 }; G.enterAt = performance.now(); }
      else if (!myRide && G.p.ride && performance.now() - (G.enterAt || 0) > 1500) G.leaveRide();
      const meP = d.S.pl[G.me];
      if (meP && meP.ko && G.p.car !== null && !G.koExit) { G.koExit = true; const c = ML.Cars.list[G.p.car]; if (c) c.speed = 0; G.exitCar(true); }
      if (meP && !meP.ko) G.koExit = false;
      d.S.cars.forEach((sc, i) => {
        const c = ML.Cars.list[i]; if (!c) return;
        if (sc.dr === G.me && G.p.car === null && performance.now() - (G.exitAt || 0) > 1500) G.enterCar(i, sc);
        else if (sc.dr !== G.me && G.p.car === i && performance.now() - (G.enterAt || 0) > 1500) G.leaveCarLocal();
        if (!c.local && sc.dr !== G.me) { c.target.set(sc.x, 0, sc.z); c.th = sc.h; c.fuel = sc.fuel; }
      });
      for (const pid in G.avatars) { const P = d.S.pl[pid], r = G.remote[pid]; ML.People.setHeld(G.avatars[pid], P && r ? P.inv[r.sel || 0] : null); }
      if (d.S.power !== G.power) { G.power = d.S.power; ML.World.setPower(G.power); }
      ML.Fx.sync(d.S);
    } else if (d.k === 'e') {
      for (const e of d.l) G.event(e);
    }
  };

  const pname = id => (G.S && G.S.pl[id] ? G.S.pl[id].name : (G.players[id] || {}).name || '?');
  G.event = e => {
    if (ML.Law) ML.Law.event(e);                                   // sim_law.js : prison, soufflette arrachée
    const mine = !e.to || e.to === G.me;
    switch (e.e) {
      case 'n': if (mine) ML.HUD.notify(e.s, e.ty); break;
      case 'say': { const v = G.npcViews[e.n]; if (v && U.d2(v.pos, G.camPos()) < 18) { ML.HUD.subtitle(ML.PEOPLE[e.n].name, e.s); if (e.sp) ML.Sfx.speak(e.s.replace(/!+/g, '!'), { pitch: e.n === 'lebec' ? 0.6 : 1, force: e.n === 'lebec' }); } break; }
      case 'big': if (mine) ML.HUD.big(e.s, e.c); break;
      case 'sfx': if (e.x === undefined) ML.Sfx.play(e.s); else ML.Sfx.at(e.s, e.x, e.z); break;
      case 'stun': if (e.to === G.me) { G.p.stun = e.d; ML.HUD.flash('rgba(255,255,255,0.5)'); } break;
      case 'pelle':
        if (e.to === G.me) {
          G.p.stun = 3; G.p.rag = { t: 2.6, vx: e.vx, vz: e.vz, vy: 6, y: 0 };
          ML.HUD.flash('#fff'); ML.HUD.big('COUP DE PELLE !', '#ff3b30'); ML.Sfx.speak('Coup de pelle !', { force: true, pitch: 0.6 });
          if (ML.Dialogue.open) ML.Dialogue.forceClose(); ML.Mini.forceClose();
        } else { ML.HUD.notify(`🪓 ${pname(e.to)} s'est pris un coup de pelle !`, 'warn'); if (G.avatars[e.to]) ML.People.ragdoll(G.avatars[e.to], 7); }
        break;
      case 'hurt': if (e.to === G.me) { ML.HUD.flash('rgba(255,0,0,0.45)'); ML.HUD.notify(`💔 Aïe : ${e.why} — ${e.hp}/100 PV`, 'warn'); ML.Sfx.play('punch'); } break;
      case 'healed': if (e.to === G.me) { ML.HUD.flash('rgba(60,255,120,0.35)'); } break;
      case 'ped': break;
      case 'push': if (e.to === G.me && G.p.car === null) { G.p.push = { vx: e.vx, vz: e.vz, t: 0.6 }; G.p.vy = 3.5; } else if (G.avatars[e.to]) ML.People.ragdoll(G.avatars[e.to], 4); break;
      case 'stat': if (e.to === G.me) ML.Account.stat(e.k, e.n); break;
      case 'secret': if (e.to === G.me) { G.traitor = true; ML.HUD.secret(e.s); ML.HUD.big('🕵 TU ES LE TRAÎTRE', '#c39bff'); } break;
      case 'emote': { if (e.pid === G.me) ML.HUD.notify('Tu fais : ' + ML.EMOTES[e.n]); else if (G.avatars[e.pid]) { ML.People.emote(G.avatars[e.pid], ML.EMOTES[e.n]); ML.Sfx.play('emote', 0.6); } break; }
      case 'ping': {                                     // V4.2 : ping bien visible (colonne + message avec la distance)
        const P = G.players[e.pid], nm = e.pid === G.me ? 'Toi' : P ? P.name : '?';
        ML.Fx.ping(e.x, e.z, nm, P ? ML.COLORS[P.idx % ML.COLORS.length].hex : 0xffd257); ML.Sfx.play('bip');
        const me = G.p.car !== null && ML.Cars.list[G.p.car] ? ML.Cars.list[G.p.car].pos : G.p.pos, dist = Math.round(Math.hypot(e.x - me.x, e.z - me.z));
        ML.HUD.notify(e.pid === G.me ? `📍 Ping posé (${dist} m) : toute l'équipe le voit.` : `📍 ${nm} : « Viens ici ! » (à ${dist} m, suis la colonne de lumière)`, 'info');
        break;
      }
      case 'horn': ML.Sfx.horn(e.k, e.pid === G.me ? undefined : e.x, e.z); break;
      case 'flash': {
        const r = ML.World.radars[e.r]; if (r) r.flash = 0.4;
        if (e.to === G.me) { ML.HUD.flash('#fff'); ML.HUD.big(`📸 FLASHÉ À ${e.kmh} KM/H`, '#fff'); ML.Sfx.play('flash'); }
        break;
      }
      case 'arrest': if (e.to === G.me) ML.Sfx.play('siren'); break;
      case 'fuel': { const c = ML.Cars.list[e.car]; if (c) c.fuel = e.f; break; }
      case 'drive': break;
      case 'vote': ML.HUD.showVote(e.players, e.until); break;
      case 'voted': ML.HUD.notify(`🗳 ${e.n} vote(s) reçu(s)…`); break;
      case 'end': G.onEnd(e.res); break;
    }
  };
  G.onEnd = res => {
    if (G.endShown) return; G.endShown = true;
    G.ended = true; G.lastEnd = res; if (ML.Dialogue.open) ML.Dialogue.forceClose(); ML.Mini.forceClose();
    const coins = ML.Account.endDay(res);
    let extra = { coins };
    if (G.isHost && (G.game.mode === 'campagne' || G.game.campaign)) extra = Object.assign(extra, ML.Camp.applyEnd(res));
    if (res.career) extra = Object.assign(extra, ML.CareerUI ? ML.CareerUI.endPanel(res) : { nextLabel: 'Journée suivante' });
    if (G.isHost && res.career) ML.Career.save().then(w => ML.HUD.toast('💾 Carrière sauvegardée ' + w));
    ML.HUD.showEnd(res, extra);
  };

  /* ======================= Boucle ======================= */
  G.step = (dt, render, raw) => {
    if (!G.on) return;
    if (render !== false) { G.controls(dt); ML.Mini.update(dt); if (ML.ui.modal === 'vote') ML.HUD.voteKeys(); }
    G.poseT -= dt;
    if (G.poseT <= 0) {
      G.poseT = 1 / C.NET.poseHz;
      const ps = G.myPose();
      if (G.isHost) ML.Sim.setPose(G.me, ps);
      if (!G.solo) ML.Net.relay(ps);
    }
    if (G.isHost) { let left = raw || dt; while (left > 1e-6) { const s = Math.min(0.05, left); G.hostTick(s); left -= s; } }
    if (render === false) return;
    G.renderViews(dt);
    if (ML.Law) ML.Law.frame(dt);                                  // sim_law.js : tuyaux d'air, porte de la cellule, bandeaux
    ML.World.updateVisuals(dt, G.S, G.rt);
    if (ML.Place) ML.Place.frame(dt);                      // fantôme de placement + progression d'installation (sim_build.js)
    ML.Fx.update(dt, G.S);
    ML.Cars.renderTraffic(dt);
    ML.Dialogue.update(dt);
    if (!ML.ui.modal && G.p.car === null && !G.p.ride && G.p.stun <= 0 && G.S) G.scan(); else G.cur = null;
    G.updateView(dt);
    G.updateLight(dt);
    ML.HUD.update(dt);
    if (ML.Tuto) ML.Tuto.frame(dt);                        // tuto.js : tutoriel de carrière + astuces (local)
  };
  G.hostTick = (dt, force) => {
    ML.Sim.step(dt);
    G.fastT -= dt; G.slowT -= dt;
    if (force || G.fastT <= 0) { G.fastT = 1 / C.NET.fastHz; const f = ML.Sim.fast(); G.apply(f); if (!G.solo) ML.Net.relay(f); }
    if (force || G.slowT <= 0 || (ML.Sim.dirty && G.slowT <= C.NET.slowEvery - 0.1)) {
      G.slowT = C.NET.slowEvery; const s = ML.Sim.slow(); G.apply(s); if (!G.solo) ML.Net.relay(ML.Sync ? ML.Sync.out(s) : s);
    }
    if (ML.Sync) ML.Sync.hostTick(dt);                     // sauvegarde de mi-journée (carrière, multijoueur)
    const ev = ML.Sim.drain();
    if (ev.length) { const m = { k: 'e', l: ev }; G.apply(m); if (!G.solo) ML.Net.relay(m); }
  };

  /* ======================= Contrôles du joueur local ======================= */
  G.controls = dt => {
    const p = G.p, PC = C.PLAYER, S = G.S;
    I.pollPad(dt);
    if (p.stun > 0) p.stun -= dt;
    if (p.punchT > 0) p.punchT -= dt;
    G.fxNow = null;
    const can = !ML.ui.modal && p.stun <= 0 && I.active() && !G.ended, modal0 = ML.ui.modal;   // modal0 : fenêtre ouverte AVANT cette image (sinon M / Tab ouvrent et referment aussitôt)
    if (can) {
      if (I.pressed('KeyK')) ML.HUD.notify(ML.Sfx.toggleMute() ? '🔇 Son coupé' : '🔊 Son activé');
      if (I.pressed('KeyM')) ML.HUD.toggleMap();
      if (I.pressed('Tab')) ML.HUD.toggleHelp();
      for (let i = 1; i <= 3; i++) if (I.pressed('Digit' + i)) p.sel = i - 1;
      for (let i = 4; i <= 9; i++) if (I.pressed('Digit' + i)) G.intent({ a: 'emote', n: i - 4 });
      if (I.wheel) p.sel = (p.sel + (I.wheel > 0 ? 1 : -1) + 3) % 3;
      if (I.pressed('KeyT')) G.ping();
    }
    if (modal0 === 'dialogue' && ML.ui.modal === 'dialogue') { for (let i = 1; i <= 9; i++) if (I.pressed('Digit' + i) || I.pressed('Numpad' + i)) { ML.Dialogue.pick(i - 1); break; } if (I.pressed('Escape')) ML.Dialogue.close(); }
    else if (modal0 === 'help' && ML.ui.modal === 'help' && (I.pressed('Tab') || I.pressed('Escape'))) ML.HUD.toggleHelp();
    else if (modal0 === 'map' && ML.ui.modal === 'map' && (I.pressed('KeyM') || I.pressed('Escape'))) ML.HUD.toggleMap();

    // --- passager (cabine ou benne) ---
    if (p.ride) {
      const c = ML.Cars.list[p.ride.car];
      if (!c) { p.ride = null; return; }
      if (can) { p.yaw -= I.mdx * 0.0022; p.pitch = U.clamp(p.pitch - I.mdy * 0.0022, -1.2, 1.2); }
      const sp = ML.Cars.seatPos(c, p.ride.seat); p.pos.set(sp.x, sp.y - ML.Terrain.h(sp.x, sp.z), sp.z);   // y relatif au sol
      if (can && I.pressed('KeyE')) { G.intent({ a: 'exit' }); G.exitAt = performance.now(); G.leaveRide(); }
      if (can && I.right) G.throwHeld();
      return;
    }

    // --- en voiture ---
    if (p.car !== null) {
      const c = ML.Cars.list[p.car], sc = S && S.cars[p.car];
      if (!c) { p.car = null; return; }
      if (can) { p.look.y = U.clamp(p.look.y - I.mdx * 0.002, -2, 2); p.look.p = U.clamp(p.look.p - I.mdy * 0.002, -0.8, 0.6); }
      const onPud = S && (S.puddles || []).some(q => Math.hypot(q.x - c.pos.x, q.z - c.pos.z) < q.r + 0.8);
      const r = ML.Cars.drive(c, dt, can, { frozen: sc && sc.frozen > S.rt, rain: S && S.weather === 'pluie', puddle: onPud });
      ML.Sfx.setEngine(true, c.speed);
      G.spillT -= dt;
      if (sc && r.spill && G.spillT <= 0) { G.spillT = 0.7; G.intent({ a: 'spill', car: p.car, side: r.spill, bump: r.bump ? 1 : 0 }); }   // cars.js : jauge « ça penche » / bosse
      if (r.crash && !G.towT) {                                  // chute de la falaise / plongeon : CRASH → dépanneuse
        G.towT = 2.8; G.intent({ a: 'crash', car: p.car, v: Math.round(r.crash) }); ML.HUD.big('💥 CRASH !', '#e94f37'); ML.Sfx.play('clang'); c.speed = 0;
      }
      if (G.towT > 0) { G.towT -= dt; c.speed = 0; if (G.towT <= 0) { const sp = ML.LOC.carSpawn[p.car % ML.LOC.carSpawn.length]; c.pos.set(sp.x, 0, sp.z); c.h = sp.h || 0; c.alt = undefined; c.air = false; G.towT = 0; ML.HUD.notify('🚛 La dépanneuse de Jacquot te ramène au garage.', 'warn'); } }
      if (c.kind !== 'tp' && c.fuel <= 0 && !G.dryOnce) { G.dryOnce = true; G.intent({ a: 'dry' }); }
      if (c.fuel > 5) G.dryOnce = false;
      if (can && I.pressed('KeyE')) G.exitCar();
      if (can && I.pressed('KeyF') && G.nearPump() && Math.abs(c.speed) < 2) { c.fuel = 100; G.intent({ a: 'refuel' }); }
      if (can && I.pressed('KeyV')) G.camMode = G.camMode === 'cab' ? 'chase' : 'cab';
      if (can && I.pressed('KeyH')) G.intent({ a: 'horn', k: G.looks[G.me].klaxon });
      if (can && I.pressed('KeyR')) { if (c.kind === 'fenwick' || (c.kind === 'tp' && S && S.machDefs)) G.intent({ a: 'fork' }); else if (c.kind === 'camion') { if (Math.abs(c.speed) > 2) ML.HUD.notify("Arrête le camion d'abord !"); else G.intent({ a: 'unload' }); } }
      return;
    }
    // --- à pied ---
    if (can) { p.yaw -= I.mdx * 0.0022; p.pitch = U.clamp(p.pitch - I.mdy * 0.0022, -1.45, 1.45); }
    let mx = 0, mz = 0;
    if (can && !p.slip) {
      if (I.padActive && (I.padAxes.x || I.padAxes.y)) { mx = I.padAxes.x; mz = I.padAxes.y; }
      else {
        if (I.down('KeyW') || I.down('ArrowUp')) mz -= 1; if (I.down('KeyS') || I.down('ArrowDown')) mz += 1;
        if (I.down('KeyA') || I.down('ArrowLeft')) mx -= 1; if (I.down('KeyD') || I.down('ArrowRight')) mx += 1;
      }
    }
    const len = Math.min(1, Math.hypot(mx, mz));
    const unlimited = S && S.buffs.cafe > S.rt, coffee = S && S.pl[G.me] && S.pl[G.me].coffee > S.rt;
    const ko = !!(S && S.pl[G.me] && S.pl[G.me].ko);
    let speed = ko ? C.HP.koSpeed : PC.walk, sprint = false;
    if (!ko && (I.down('ShiftLeft') || I.down('ShiftRight')) && len > 0 && (p.stamina > 0 || unlimited)) { speed = PC.sprint; sprint = true; if (!unlimited) p.stamina -= dt * (coffee ? 0.45 : 1); }
    else p.stamina = Math.min(PC.stamina, p.stamina + dt * 0.8);
    if (coffee && !ko) speed *= (C.COFFEE ? C.COFFEE.mult : 1);                    // café rapide
    // auras : Fred (Arexis) et Mathieu (du coup…) ralentissent
    if (G.npcDist('fred') < 3.5 || (G.npcDist('mathieu') < 4 && (G.npcViews.mathieu || {}).group)) { speed *= 0.6; G.auraT -= dt; if (G.auraT <= 0) { G.auraT = 8; ML.HUD.notify(G.npcDist('fred') < 3.5 ? '💼 Fred te tient la jambe : « ARÉXIS ! » (tu ralentis)' : '🐌 Mathieu te parle… tu ralentis…'); } }
    const ox = p.pos.x, oz = p.pos.z;
    if (p.slip > 0) {                                  // glissade sur l'huile soluble
      p.slip -= dt; p.pos.x += p.slipV.x * dt; p.pos.z += p.slipV.z * dt; p.slipV.multiplyScalar(1 - dt * 0.8); p.roll = Math.sin(p.slip * 9) * 0.35;
      if (p.slip <= 0) { p.slip = 0; p.roll = 0; }
    } else if (len > 0) {
      const nx = mx / Math.max(len, 1e-6) * len, nz = mz / Math.max(len, 1e-6) * len;
      const s = Math.sin(p.yaw), co = Math.cos(p.yaw);
      p.pos.x += (nx * co + nz * s) * speed * dt; p.pos.z += (-nx * s + nz * co) * speed * dt;
      p.bob += dt * speed * 1.8;
    }
    if (p.push) { p.push.t -= dt; p.pos.x += p.push.vx * dt; p.pos.z += p.push.vz * dt; p.push.vx *= 1 - dt * 3; p.push.vz *= 1 - dt * 3; if (p.push.t <= 0) p.push = null; }
    if (p.rag) { const r = p.rag; r.t -= dt; p.pos.x += r.vx * dt; p.pos.z += r.vz * dt; r.vx *= 1 - dt * 2.5; r.vz *= 1 - dt * 2.5; if (r.t <= 0) p.rag = null; }
    U.resolveCircle(p.pos, PC.r);
    const push = (q, r) => { const dx = p.pos.x - q.x, dz = p.pos.z - q.z, d = Math.hypot(dx, dz); if (d < r && d > 0.001) { p.pos.x = q.x + dx / d * r; p.pos.z = q.z + dz / d * r; } };
    for (const id in G.npcViews) if (G.npcViews[id].seen) push(G.npcViews[id].pos, PC.r + 0.3);
    for (const id in G.avatars) if (G.avatars[id].group.visible) push(G.avatars[id].pos, PC.r + 0.35);
    ML.Cars.pushOut(p.pos, PC.r);
    if (ML.Law) ML.Law.clampLocal(p);                              // sim_law.js : tuyau de soufflette, cellule
    // relief : si le sol se dérobe d'un coup (bord de falaise), on TOMBE au lieu de coller au sol
    const g1 = ML.Terrain.h(p.pos.x, p.pos.z);
    if (G.gPrev !== undefined && Math.hypot(p.pos.x - ox, p.pos.z - oz) < 3) { const drop = G.gPrev - g1; if (drop > 0.6) p.pos.y += drop; }
    G.gPrev = g1;
    if (can && !ko && I.pressed('Space') && p.pos.y <= 0.001) p.vy = 5.2;
    p.vy -= 15 * dt; p.pos.y += p.vy * dt;
    if (p.pos.y < 0) {
      if (p.vy < -13) { p.rag = { t: 2.6, vx: 0, vz: 0 }; G.intent({ a: 'fall', v: Math.round(-p.vy) }); ML.Sfx.play('punch'); ML.HUD.notify('🤕 Aïe ! Belle chute…', 'warn'); }
      p.pos.y = 0; p.vy = 0;
    }
    p.moving = len > 0 || p.slip > 0;
    // flaque : on glisse (et on lâche ce qu'on tient)
    const moved = Math.hypot(p.pos.x - ox, p.pos.z - oz) / Math.max(dt, 1e-3);
    if (S && !p.slip && moved > 3 && p.pos.y < 0.1 && (S.puddles || []).some(q => Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < q.r * 0.85)) {
      p.slip = 1.3; p.slipV = new THREE.Vector3(p.pos.x - ox, 0, p.pos.z - oz).normalize().multiplyScalar(Math.max(6, moved * 1.4));
      ML.HUD.notify('💧 Huile soluble ! Tu glisses…', 'warn'); ML.Sfx.play('slip'); G.intent({ a: 'slip' });
    }
    if (!can) return;
    const h = G.held();
    if (I.pressed('KeyE') && G.cur) ML.Rules.use(G.cur.id);
    if (h && h.type === 'extincteur') {
      if (I.leftDown) {
        G.fxNow = 'spray'; const e = G.eye(), f = G.forward();
        ML.Fx.emit('spray', new THREE.Vector3(e.x + f.x * 0.6, e.y - 0.35, e.z + f.z * 0.6), f, 3);
        G.sprayT -= dt; if (G.sprayT <= 0) { G.sprayT = 0.2; G.intent({ a: 'spray' }); }
      }
    } else if (h && h.type === 'soufflette') {
      if (I.left) { const e = G.eye(), f = G.forward(); ML.Fx.emit('blow', new THREE.Vector3(e.x + f.x * 0.5, e.y - 0.3, e.z + f.z * 0.5), f, 14); G.intent({ a: 'blow' }); G.fxT = 0.3; ML.Sfx.play('blow'); }
      if (G.fxT > 0) { G.fxT -= dt; G.fxNow = 'blow'; }
    } else if (I.left) G.punch();
    if (I.right) G.throwHeld();
    if (I.pressed('KeyG') && h) { G.intent({ a: 'drop' }); ML.Sfx.play('drop'); }
  };

  G.forward = () => { const p = G.p, cp = Math.cos(p.pitch); return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp }; };
  G.eye = () => new THREE.Vector3(G.p.pos.x, G.p.pos.y + C.PLAYER.eye + ML.Terrain.h(G.p.pos.x, G.p.pos.z), G.p.pos.z);   // position ABSOLUE (relief compris)
  G.camPos = () => ML.camera.position;
  G.ping = () => {
    const e = G.eye(), f = G.forward(); let t = 12;
    if (f.y < -0.02) t = Math.min(60, (e.y - ML.Terrain.h(e.x, e.z)) / -f.y);
    G.intent({ a: 'ping', x: Math.round((e.x + f.x * t) * 10) / 10, z: Math.round((e.z + f.z * t) * 10) / 10 });
  };
  G.punch = () => {
    G.p.punchT = 0.25; ML.Sfx.play('whoosh');
    const e = G.eye(), f = G.forward(); let best = null, bd = 2.4;
    const test = (id, pos, h) => { const dx = pos.x - e.x, dy = h - e.y, dz = pos.z - e.z, d = Math.hypot(dx, dy, dz); if (d < bd && (dx * f.x + dy * f.y + dz * f.z) / d > 0.7) { bd = d; best = id; } };
    for (const id in G.npcViews) if (G.npcViews[id].seen) test('npc:' + id, G.npcViews[id].pos, G.npcViews[id].h * 0.72);
    for (const id in G.avatars) if (G.avatars[id].group.visible) test('pl:' + id, G.avatars[id].pos, 1.34);
    if (ML.Fx.dog) test('dog', ML.Fx.dog.position, 0.7);
    if (ML.Fx.pigeon) test('pigeon', ML.Fx.pigeon.position, ML.Fx.pigeon.position.y);
    if (best) G.intent({ a: 'hit', id: best });
  };
  G.throwHeld = () => {
    const h = G.held();
    if (!h) { ML.HUD.notify('Rien en main à lancer. Prends un brut au rack !'); return; }
    if (ML.Items.heavy(h)) { ML.HUD.notify('Une palette, ça ne se lance pas ! Le fenwick.'); return; }
    const f = G.forward(), k = ML.Items.bulky(h) ? 1.25 : 1; G.intent({ a: 'throw', v: [f.x * 15 * k, f.y * 15 + 2.5 * k + (k > 1 ? 1.5 : 0), f.z * 15 * k] }); ML.Sfx.play('whoosh');
  };

  /* ======================= Voiture ======================= */
  G.enterCar = (i, sc) => {
    const c = ML.Cars.list[i]; G.p.car = i; c.local = true; G.enterAt = performance.now(); c.speed = 0; c.steer = 0;
    c.pos.set(sc.x, 0, sc.z); c.h = sc.h; c.target.copy(c.pos); c.th = c.h; c.fuel = sc.fuel;
    G.p.look = { y: 0, p: 0 }; G.camMode = sc.kind === 'tp' ? 'chase' : 'cab';
    ML.Sfx.horn(G.looks[G.me].klaxon);
    if (!G.driveHint) { G.driveHint = true; ML.HUD.notify('Z/S accélérer-freiner · Q/D tourner · Espace frein · V vue · H klaxon · E descendre'); }
  };
  G.exitCar = force => {
    const c = ML.Cars.list[G.p.car];
    if (!force && Math.abs(c.speed) > 2) { ML.HUD.notify("Arrête-toi d'abord !"); return; }
    const f = ML.Cars.fwd(c.h), l = ML.Cars.left(c.h), k = c.kind === 'tp' ? 1.3 : 2, kf = c.kind === 'tp' ? 1.8 : 3.3;
    for (const [dx, dz] of [[l.x * k, l.z * k], [-l.x * k, -l.z * k], [-f.x * kf, -f.z * kf], [f.x * kf, f.z * kf]]) {
      const x = c.pos.x + dx, z = c.pos.z + dz;
      if (!U.inCollider(x, z, 0.45)) {
        G.intent({ a: 'exit', car: G.p.car, x: c.pos.x, z: c.pos.z, h: c.h });
        G.exitAt = performance.now(); G.leaveCarLocal(); G.p.pos.set(x, 0, z); G.p.yaw = c.h + Math.PI; G.p.pitch = 0;
        return;
      }
    }
    ML.HUD.notify('Impossible de sortir ici, recule un peu.');
  };
  G.leaveRide = () => {
    const r = G.p.ride; G.p.ride = null; if (!r) return;
    const c = ML.Cars.list[r.car]; if (!c) return;
    const l = ML.Cars.left(c.h), f = ML.Cars.fwd(c.h);
    for (const [dx, dz] of [[-l.x * 2, -l.z * 2], [l.x * 2, l.z * 2], [-f.x * 3.4, -f.z * 3.4]]) { const x = c.pos.x + dx, z = c.pos.z + dz; if (!U.inCollider(x, z, 0.45)) { G.p.pos.set(x, 0, z); break; } }
    G.p.pos.y = 0;
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
      else if (t.id !== 'pump') consider(t.id, t.x, t.y, t.z, t.r);
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
      const a = G.avatars[id], r = G.remote[id];
      a.group.visible = !!a.seen && !a.inCar && !!(G.S && G.S.pl[id]);
      if (!a.group.visible) continue;
      ML.People.animate(a, dt, r && r.st ? 'stun' : null);
      if (r && r.fx && Math.random() < dt * 20) {
        const f = { x: -Math.sin(r.yaw), y: 0.05, z: -Math.cos(r.yaw) };
        ML.Fx.emit(r.fx === 'spray' ? 'spray' : 'blow', new THREE.Vector3(a.pos.x + f.x * 0.6, 1.2 + ML.Terrain.h(a.pos.x, a.pos.z), a.pos.z + f.z * 0.6), f, r.fx === 'spray' ? 2 : 4);
      }
    }
    const t = performance.now() / 1000;
    for (const id in G.itemViews) {
      const iv = G.itemViews[id], m = iv.mesh;
      const tv = G._tv || (G._tv = new THREE.Vector3()); tv.set(iv.target.x, iv.target.y + ML.Terrain.h(iv.target.x, iv.target.z), iv.target.z);   // y relatif → absolu
      if (m.position.distanceToSquared(tv) > 25) m.position.copy(tv); else m.position.lerp(tv, Math.min(1, dt * 14));
      m.rotation.y = U.lerpAngle(m.rotation.y, iv.ry, Math.min(1, dt * 10));
      if (m.userData.spin) { m.userData.spin.rotation.y = t * 2; m.userData.spin.position.y = 0.45 + Math.sin(t * 3) * 0.12; }
    }
    ML.Cars.list.forEach((c, i) => {
      const sc = G.S && G.S.cars[i];
      if (sc && sc.dr && G.looks[sc.dr]) ML.Cars.tune(c, G.looks[sc.dr].tune, sc.color);
      if (c.label) c.label.visible = !(G.p.car === i || (G.p.ride && G.p.ride.car === i));
      ML.Cars.render(c, dt, sc ? sc.bed : [], sc ? sc.load : null);
    });
  };

  G.updateView = dt => {
    const cam = ML.camera, p = G.p;
    if (!G.view) {
      G.view = new THREE.Group(); cam.add(G.view);
      G.fist = U.box(0.12, 0.12, 0.22, 0xe2b48c, 0.28, -0.32, -0.5, G.view, false); G.fist.visible = false;
    }
    if (p.car !== null && ML.Cars.list[p.car]) { G.view.visible = false; ML.Cars.camera(ML.Cars.list[p.car], G.camMode, p.look); return; }
    if (p.ride && ML.Cars.list[p.ride.car]) { G.view.visible = true; cam.position.set(p.pos.x, p.pos.y + ML.Terrain.h(p.pos.x, p.pos.z) + (p.ride.seat === 'cab' ? 0.8 : 1.45), p.pos.z); cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); return; }
    G.view.visible = !p.rag;
    const bob = p.moving ? Math.sin(p.bob) * 0.04 : 0;
    let eyeY = p.pos.y + C.PLAYER.eye + bob - (p.stun > 0 ? 0.6 : 0), roll = p.stun > 0 ? Math.sin(p.stun * 8) * 0.3 : p.roll, pitch = p.pitch;
    if (p.rag) { const k = Math.min(1, (2.6 - p.rag.t) * 3); eyeY = U.lerp(eyeY, 0.35, k); roll = U.lerp(0, 1.35, k) + Math.sin(p.rag.t * 7) * 0.1; pitch = U.lerp(p.pitch, 0.6, k); }
    cam.position.set(p.pos.x, eyeY + ML.Terrain.h(p.pos.x, p.pos.z), p.pos.z);
    cam.rotation.set(pitch, p.yaw, roll, 'YXZ');
    const h = G.held(), key = h ? h.type + JSON.stringify(h.d) : null;
    if (key !== G.viewKey) {
      if (G.heldMesh) G.view.remove(G.heldMesh); G.heldMesh = null;
      if (h) { G.heldMesh = ML.Items.mesh(h, { noLabel: true }); G.heldMesh.traverse(o => { o.castShadow = false; }); if (ML.Items.bulky(h)) G.heldMesh.position.set(0, -0.85, -0.95); else G.heldMesh.position.set(0.3, -0.36, -0.55); G.view.add(G.heldMesh); }
      G.viewKey = key;
    }
    G.fist.visible = p.punchT > 0;
    if (p.punchT > 0) { const k = Math.sin((1 - p.punchT / 0.25) * Math.PI); G.fist.position.set(0.22 - k * 0.12, -0.3 + k * 0.12, -0.45 - k * 0.45); }
  };

  /** Lumière : soleil qui suit la caméra, soir après 17 h, météo (pluie, brouillard), coupure de courant */
  G.updateLight = dt => {
    const L = ML.light, cam = ML.camera.position, S = G.S;
    L.sun.position.set(cam.x + 30, 60, cam.z + 20); L.sun.target.position.set(cam.x, 0, cam.z); L.sun.target.updateMatrixWorld();
    const min = C.DAY_START + (G.rt || 0) * (C.DAY_END - C.DAY_START) / C.SHIFT_SEC;
    let k = min > 17 * 60 ? U.lerp(1, 0.3, Math.min(1, (min - 1020) / 120)) : 1;
    const wx = S ? S.weather : 'beau'; if (wx === 'pluie') k *= 0.72; if (wx === 'brouillard') k *= 0.85;
    L.sun.intensity = 0.72 * k; L.hemi.intensity = 0.3 + 0.38 * k;
    ML.scene.background.copy(L.day).lerp(L.night, 1 - k); if (wx !== 'beau') ML.scene.background.lerp(new THREE.Color(0x8a939b), 0.5);
    if (G._skyK !== k + wx) { G._skyK = k + wx; ML.Style.setSky(k, wx === 'beau' ? 0 : wx === 'brouillard' ? 1 : 0.7); }   // ciel en dégradé (style.js)
    ML.scene.fog.color.copy(ML.Style.horizon || ML.scene.background);
    ML.scene.fog.near = wx === 'brouillard' ? 12 : 180; ML.scene.fog.far = wx === 'brouillard' ? 75 : wx === 'pluie' ? 320 : 900;
    ML.World.setDaylight(k);
    if (G.rain && wx !== 'pluie') G.rain.visible = false;
    if (wx === 'pluie') {
      if (!G.rain) {
        const n = 1800, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * (i % 3 === 1 ? 30 : 60);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        G.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.12, transparent: true, opacity: 0.6 })); ML.scene.add(G.rain);
      }
      const a = G.rain.geometry.attributes.position; for (let i = 1; i < a.array.length; i += 3) { a.array[i] -= dt * 22; if (a.array[i] < -2) a.array[i] += 30; }
      a.needsUpdate = true; G.rain.position.set(cam.x, cam.y, cam.z); G.rain.visible = !U.inWorkshop(cam);
    }
  };
  G.clockMin = () => C.DAY_START + (G.rt || 0) * (C.DAY_END - C.DAY_START) / C.SHIFT_SEC;
})();
