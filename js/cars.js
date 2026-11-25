/* =====================================================================
   cars.js — Véhicules : utilitaires de l'atelier (Méga Mégane, Kangoo,
   Ducato, transpalette), conduite arcade (essence, pluie, flaques,
   caisses qui tombent), tuning, circulation et gendarmerie (rendu).
   La position d'un véhicule conduit vient de son conducteur ; sinon de
   l'hôte. Le contenu de la benne est géré par l'hôte.
   ===================================================================== */
(function () {
  const Cars = ML.Cars = { list: [], key: '', traffic: [], police: null };
  const U = ML.U, CF = ML.CFG.CAR;

  /* ---------- Modèles ---------- */
  function buildVan(c, spec) {
    const g = c.group, body = c.bodyMat = new THREE.MeshLambertMaterial({ color: spec.color });
    const tall = spec.kind === 'ducato';
    U.box(1.85, 0.6, 4.5, body, 0, 0.65, 0, g); U.box(1.8, 0.25, 1.1, body, 0, 1.05, 1.65, g);
    U.box(1.78, 0.1, 1.1, body, 0, 1.98, 0.3, g);
    for (const x of [-0.85, 0.85]) { U.box(0.08, 0.95, 0.1, body, x, 1.48, 1.0, g); U.box(0.08, 0.95, 0.12, body, x, 1.48, -0.25, g); }
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.2 });
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.9, 0.04), glass); ws.position.set(0, 1.5, 1.0); ws.rotation.x = -0.35; g.add(ws);
    U.box(1.7, 0.22, 0.35, 0x2d2d2d, 0, 1.05, 1.0, g);
    const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), U.mat(0x111111)); wheelS.position.set(0.38, 1.22, 0.78); wheelS.rotation.x = -0.5; g.add(wheelS);
    U.box(1.7, 0.5, 0.1, 0x2d2d2d, 0, 1.3, -0.3, g);
    U.box(1.8, 0.08, 1.9, 0x555555, 0, 0.98, -1.25, g);
    const sideH = tall ? 1.3 : 0.5;
    for (const x of [-0.88, 0.88]) U.box(0.08, sideH, 1.9, tall ? body : U.mat(0x7f8c8d), x, 1.0 + sideH / 2, -1.25, g);
    U.box(1.8, sideH, 0.08, tall ? body : U.mat(0x7f8c8d), 0, 1.0 + sideH / 2, -2.2, g);
    U.box(1.9, 0.2, 0.15, 0x333333, 0, 0.45, 2.28, g); U.box(1.9, 0.2, 0.15, 0x333333, 0, 0.45, -2.28, g);
    for (const x of [-0.65, 0.65]) { U.box(0.35, 0.15, 0.05, U.mat(0xffffff, 0xffffaa), x, 0.8, 2.26, g); U.box(0.3, 0.15, 0.05, U.mat(0xff0000, 0x880000), x, 0.8, -2.26, g); }
    c.rimMat = new THREE.MeshLambertMaterial({ color: 0xbdc3c7 });
    for (const [x, z] of [[0.95, 1.45], [-0.95, 1.45], [0.95, -1.45], [-0.95, -1.45]]) {
      const p = new THREE.Group(); p.position.set(x, 0.38, z); p.rotation.order = 'YXZ'; g.add(p);
      U.cyl(0.38, 0.38, 0.3, 0x1a1a1a, 0, 0, 0, p, 12).rotation.z = Math.PI / 2; U.box(0.05, 0.25, 0.25, c.rimMat, x > 0 ? 0.16 : -0.16, 0, 0, p);
      p.front = z > 0; c.wheels.push(p);
    }
    // tuning (caché par défaut)
    c.wing = new THREE.Group(); g.add(c.wing); c.wing.visible = false;
    U.box(0.08, 0.5, 0.08, 0x222222, -0.6, 1.25, -2.15, c.wing); U.box(0.08, 0.5, 0.08, 0x222222, 0.6, 1.25, -2.15, c.wing); U.box(1.9, 0.06, 0.45, 0x222222, 0, 1.52, -2.2, c.wing);
    c.flames = new THREE.Group(); g.add(c.flames); c.flames.visible = false;
    for (let i = 0; i < 4; i++) { const f = U.box(0.18, 0.02, 0.7 - i * 0.12, U.mat(i % 2 ? 0xff7a1a : 0xffd23f, 0x552200), -0.55 + i * 0.36, 0.96, 1.7 - i * 0.05, c.flames, false); f.rotation.y = (i - 1.5) * 0.15; }
    c.slots = [[-0.42, 1.03, -0.75], [0.42, 1.03, -0.75], [-0.42, 1.03, -1.65], [0.42, 1.03, -1.65], [-0.42, 1.75, -1.2], [0.42, 1.75, -1.2]];
  }
  function buildTP(c) {
    const g = c.group; c.bodyMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
    U.box(0.7, 0.9, 0.5, c.bodyMat, 0, 0.55, 0.9, g); U.cyl(0.03, 0.03, 1.2, 0x333333, 0, 1.3, 1.1, g, 6).rotation.x = -0.4;
    U.box(0.6, 0.06, 0.06, 0x333333, 0, 1.85, 1.33, g);
    for (const x of [-0.3, 0.3]) U.box(0.18, 0.08, 1.9, 0x7f8c8d, x, 0.12, -0.35, g);
    U.box(1.2, 0.05, 1.7, 0x8d6e63, 0, 0.18, -0.4, g);
    for (const [x, z] of [[0.3, 0.9], [-0.3, 0.9], [0.3, -1.2], [-0.3, -1.2]]) { const p = new THREE.Group(); p.position.set(x, 0.1, z); g.add(p); U.cyl(0.1, 0.1, 0.08, 0x111111, 0, 0, 0, p, 8).rotation.z = Math.PI / 2; p.front = z > 0; c.wheels.push(p); }
    c.slots = [[-0.32, 0.21, 0.05], [0.32, 0.21, 0.05], [-0.32, 0.21, -0.75], [0.32, 0.21, -0.75], [0, 0.95, -0.35], [0, 1.65, -0.35]];
  }
  function buildFenwick(c) {
    const g = c.group; c.bodyMat = new THREE.MeshLambertMaterial({ color: 0xf39c12 });
    U.box(1.3, 0.9, 2.1, c.bodyMat, 0, 0.75, -0.1, g); U.box(1.25, 0.8, 0.6, 0x2d2d2d, 0, 1.0, -1.05, g);           // caisse + contrepoids
    for (const x of [-0.6, 0.6]) for (const z of [-0.8, 0.5]) U.box(0.07, 1.4, 0.07, 0x222222, x, 1.9, z, g);       // arceaux
    U.box(1.3, 0.06, 1.4, 0x222222, 0, 2.6, -0.15, g); U.box(0.4, 0.4, 0.4, 0x333333, 0, 1.4, -0.3, g);
    for (const x of [-0.45, 0.45]) U.box(0.1, 2.6, 0.12, 0x555555, x, 1.4, 1.05, g);                                // mât
    c.forks = new THREE.Group(); c.forks.position.set(0, 0.15, 1.15); g.add(c.forks);
    U.box(1.0, 0.5, 0.06, 0x444444, 0, 0.25, 0, c.forks); for (const x of [-0.3, 0.3]) U.box(0.12, 0.06, 1.1, 0x666666, x, 0.03, 0.55, c.forks);
    c.loadG = new THREE.Group(); c.loadG.position.set(0, 0.07, 0.65); c.forks.add(c.loadG);
    for (const [x, z] of [[0.6, 0.7], [-0.6, 0.7], [0.6, -0.8], [-0.6, -0.8]]) { const p = new THREE.Group(); p.position.set(x, 0.3, z); g.add(p); U.cyl(0.3, 0.3, 0.25, 0x111111, 0, 0, 0, p, 10).rotation.z = Math.PI / 2; p.front = z < 0; c.wheels.push(p); }
    c.slots = [[0, 0.3, 1.6]];
  }
  function buildCamion(c, spec) {
    const g = c.group, body = c.bodyMat = new THREE.MeshLambertMaterial({ color: spec.color });
    U.box(2.4, 0.5, 8, 0x333333, 0, 0.75, -0.4, g);                                                                  // châssis
    U.box(2.4, 2.1, 2.0, body, 0, 1.95, 2.6, g); U.box(2.2, 0.8, 0.05, U.mat(0x9fd3ff), 0, 2.5, 3.62, g);              // cabine
    U.box(2.4, 0.15, 5.4, 0x6d4c41, 0, 1.1, -1.4, g);                                                                  // plateau
    for (const x of [-1.15, 1.15]) U.box(0.08, 0.5, 5.4, 0xbdc3c7, x, 1.4, -1.4, g);
    U.box(2.4, 1.2, 0.08, 0xbdc3c7, 0, 1.75, 1.3, g);
    const lab = U.label('LEBEC TRANSPORTS', { size: 0.35, color: '#fff', bg: 'rgba(0,0,0,0)' }); lab.position.set(0, 2.3, 1.2); g.add(lab);
    c.rimMat = new THREE.MeshLambertMaterial({ color: 0xbdc3c7 });
    for (const [x, z] of [[1.15, 2.6], [-1.15, 2.6], [1.15, -2.2], [-1.15, -2.2], [1.15, -3.3], [-1.15, -3.3]]) { const p = new THREE.Group(); p.position.set(x, 0.5, z); p.rotation.order = 'YXZ'; g.add(p); U.cyl(0.5, 0.5, 0.35, 0x111111, 0, 0, 0, p, 12).rotation.z = Math.PI / 2; p.front = z > 0; c.wheels.push(p); }
    c.wing = new THREE.Group(); c.flames = new THREE.Group();
    c.slots = [[0, 1.2, -0.3], [0, 1.2, -2.7]];
  }
  Cars.build = (i, spec) => {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const c = { i, kind: spec.kind, group: g, wheels: [], bed: new THREE.Group(), bedKey: '', pos: new THREE.Vector3(spec.x, 0, spec.z), target: new THREE.Vector3(spec.x, 0, spec.z), h: spec.h, th: spec.h, speed: 0, steer: 0, local: false, fuel: spec.fuel, tuneKey: '' };
    if (spec.kind === 'tp') buildTP(c); else if (spec.kind === 'fenwick') buildFenwick(c); else if (spec.kind === 'camion') buildCamion(c, spec); else buildVan(c, spec);
    g.add(c.bed);
    const lab = U.label(spec.name, { size: spec.kind === 'tp' ? 0.3 : 0.4, color: '#ffd257' }); lab.position.set(0, spec.kind === 'tp' ? 2.2 : 2.6, 0); g.add(lab); c.label = lab;
    ML.scene.add(g); Cars.list[i] = c;
    return c;
  };
  /** (Re)crée les véhicules selon l'état de l'hôte (nombre / types) */
  Cars.sync = list => {
    const key = list.map(c => c.kind + c.color).join(',');
    if (key === Cars.key) return false;
    const grow = Cars.key && key.startsWith(Cars.key + ',');           // véhicule acheté : on ajoute seulement le nouveau
    if (grow) { for (let i = Cars.list.length; i < list.length; i++) { const c = Cars.build(i, list[i]); c.isNew = true; } Cars.key = key; return 'grow'; }
    for (const c of Cars.list) if (c) ML.scene.remove(c.group); Cars.list = []; Cars.key = key;
    list.forEach((s, i) => Cars.build(i, s));
    return true;
  };
  Cars.clear = () => { for (const c of Cars.list) if (c) ML.scene.remove(c.group); Cars.list = []; Cars.key = ''; for (const t of Cars.traffic) ML.scene.remove(t); Cars.traffic = []; if (Cars.police) ML.scene.remove(Cars.police); Cars.police = null; if (Cars.parkedPolice) ML.scene.remove(Cars.parkedPolice); Cars.parkedPolice = null; };
  /** Tuning : peinture, aileron, flammes, jantes (Méga Mégane) */
  Cars.tune = (c, t, baseColor) => {
    const k = JSON.stringify(t || {}); if (!c || !['megane', 'kangoo', 'ducato'].includes(c.kind) || k === c.tuneKey) return; c.tuneKey = k; t = t || {};
    c.bodyMat.color.setHex(t.paint !== undefined ? t.paint : baseColor);
    c.wing.visible = !!t.aileron; c.flames.visible = !!t.flammes; c.rimMat.color.setHex(t.jantes ? 0xffd700 : 0xbdc3c7); c.rimMat.emissive.setHex(t.jantes ? 0x443300 : 0);
  };

  Cars.fwd = h => ({ x: Math.sin(h), z: Math.cos(h) });
  Cars.left = h => ({ x: Math.cos(h), z: -Math.sin(h) });
  Cars.doorPos = c => { const l = Cars.left(c.h), tp = c.kind === 'tp', f = Cars.fwd(c.h);
    if (c.kind === 'camion') return new THREE.Vector3(c.pos.x + l.x * 1.6 + f.x * 2.6, 1.3, c.pos.z + l.z * 1.6 + f.z * 2.6);
    if (c.kind === 'fenwick') return new THREE.Vector3(c.pos.x + l.x * 1.1, 1.2, c.pos.z + l.z * 1.1);
    return tp ? new THREE.Vector3(c.pos.x + Cars.fwd(c.h).x * 1.1, 1.0, c.pos.z + Cars.fwd(c.h).z * 1.1) : new THREE.Vector3(c.pos.x + l.x * 1.3, 1.1, c.pos.z + l.z * 1.3); };
  Cars.rearPos = c => { const f = Cars.fwd(c.h), k = c.kind === 'tp' ? 1.2 : c.kind === 'camion' ? 4.6 : c.kind === 'fenwick' ? -2.2 : 2.6; return new THREE.Vector3(c.pos.x - f.x * k, c.kind === 'tp' ? 0.6 : 1.1, c.pos.z - f.z * k); };
  const R = c => (c.kind === 'tp' ? 0.55 : c.kind === 'camion' ? 1.3 : c.kind === 'fenwick' ? 0.8 : 1.0), OFF = c => (c.kind === 'tp' ? [0.6, -0.6] : c.kind === 'camion' ? [2.8, 1.2, -0.6, -2.4, -3.8] : c.kind === 'fenwick' ? [0.6, -0.6] : [1.2, 0, -1.2]);
  /** Place d'un passager (cabine ou benne) */
  Cars.seatPos = (c, seat) => {
    const f = Cars.fwd(c.h), l = Cars.left(c.h);
    if (seat === 'cab') return c.kind === 'camion' ? { x: c.pos.x - l.x * 0.55 + f.x * 2.7, y: 1.6, z: c.pos.z - l.z * 0.55 + f.z * 2.7 } : { x: c.pos.x + f.x * 0.15 - l.x * 0.38, y: 0.75, z: c.pos.z + f.z * 0.15 - l.z * 0.38 };
    const s = seat === 'bed1' ? -1 : 1;
    return { x: c.pos.x - f.x * 1.25 + l.x * 0.45 * s, y: 1.05, z: c.pos.z - f.z * 1.25 + l.z * 0.45 * s };
  };

  /** Repousse un point (joueur) hors des carrosseries */
  Cars.pushOut = (p, r) => {
    const push = (cx, cz, R2) => { const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz); if (d < R2 && d > 0.001) { p.x = cx + dx / d * R2; p.z = cz + dz / d * R2; } };
    for (const c of Cars.list) { const f = Cars.fwd(c.h); for (const k of OFF(c)) push(c.pos.x + f.x * k, c.pos.z + f.z * k, r + R(c)); }
    for (const t of Cars.traffic) if (t.visible) { const f = Cars.fwd(t.rotation.y); for (const k of [1.2, -1.2]) push(t.position.x + f.x * k, t.position.z + f.z * k, r + 1); }
  };

  /** Conduite locale (seulement par le conducteur). Renvoie l'accélération latérale. */
  Cars.drive = (c, dt, input, env) => {
    const I = ML.Input, tp = c.kind === 'tp' || c.kind === 'fenwick', P = c.kind === 'tp' ? ML.CFG.TP : c.kind === 'fenwick' ? ML.CFG.FENWICK : c.kind === 'camion' ? ML.CFG.CAMION : c.kind === 'kangoo' ? ML.CFG.KANGOO : c.kind === 'ducato' ? ML.CFG.DUCATO : CF, S = ML.Game.S;
    const turbo = !tp && S && S.buffs.turbo > S.rt ? 1.3 : 1, frozen = env.frozen, dry = !tp && c.fuel <= 0;
    let thr = 0, st = 0;
    if (input && !frozen) {
      if (I.down('KeyW') || I.down('ArrowUp')) thr += 1;
      if (I.down('KeyS') || I.down('ArrowDown')) thr -= 1;
      if (I.down('KeyA') || I.down('ArrowLeft')) st += 1;
      if (I.down('KeyD') || I.down('ArrowRight')) st -= 1;
      if (I.padActive) { if (I.padAxes.x) st = -I.padAxes.x; if (I.padAxes.thr > 0.15) thr = I.padAxes.thr; else if (I.padAxes.brk > 0.15) thr = -I.padAxes.brk; }
      if (I.down('Space')) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 26 * dt);
    }
    if (frozen) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 30 * dt);
    if (dry && thr > 0) thr = 0;
    if (thr > 0) c.speed += (c.speed < -0.5 ? P.brake : P.accel * turbo) * thr * dt;
    else if (thr < 0) c.speed -= (c.speed > 0.5 ? P.brake : P.accel * 0.6) * -thr * dt;
    else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 3 * dt);
    c.speed = U.clamp(c.speed, -P.rev, P.max * turbo);
    const grip = env.rain ? 0.75 : 1;
    const target = st * P.steer * (1 - 0.55 * Math.min(1, Math.abs(c.speed) / P.max));     // V4 : direction plus douce à haute vitesse
    c.steer = U.lerp(c.steer, target, Math.min(1, 6 * grip * dt));
    const yawRate = c.speed * Math.tan(c.steer) / P.wb;
    c.h += yawRate * dt;
    if (env.puddle && Math.abs(c.speed) > 6) c.h += (Math.random() - 0.5) * 3 * dt;   // aquaplaning
    const f = Cars.fwd(c.h);
    const moved = c.speed * dt;
    c.pos.x += f.x * moved; c.pos.z += f.z * moved;
    if (!tp && Math.abs(moved) > 0) c.fuel = Math.max(0, c.fuel - Math.abs(moved) * (P.fuelUse || CF.fuelUse));
    let hit = false, hard = 0;
    for (const k of OFF(c)) {
      const p = { x: c.pos.x + f.x * k, z: c.pos.z + f.z * k }, ox = p.x, oz = p.z;
      if (U.resolveCircle(p, R(c) - 0.02)) { hit = true; c.pos.x += p.x - ox; c.pos.z += p.z - oz; }
      const others = Cars.list.filter(o => o !== c).map(o => o.pos).concat(Cars.traffic.filter(t => t.visible).map(t => t.position));
      if (Cars.police && Cars.police.visible) others.push(Cars.police.position);
      for (const o of others) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
        if (d < 2.3 && d > 0.01) { c.pos.x += dx / d * (2.3 - d); c.pos.z += dz / d * (2.3 - d); hit = true; }
      }
    }
    if (hit) { hard = Math.abs(c.speed); if (hard > 6) ML.Sfx.play('clang'); c.speed *= -0.2; }
    c.target.copy(c.pos); c.th = c.h;
    return { lat: Math.abs(c.speed * yawRate), side: Math.sign(yawRate) * -1, hard };
  };

  /** Rendu : position lissée (si pas locale), roues, contenu de la benne */
  Cars.render = (c, dt, bedItems, load) => {
    if (c.loadG) { const lk = JSON.stringify(load || null); if (lk !== c.loadKey) { c.loadKey = lk; c.loadG.clear(); if (load) c.loadG.add(ML.Items.mesh(load, { noLabel: true })); } c.forks.position.y = U.lerp(c.forks.position.y, load ? 0.6 : 0.15, Math.min(1, dt * 4)); }
    let roll = c.speed * dt;
    if (!c.local) {
      const k = Math.min(1, dt * 10), ox = c.pos.x, oz = c.pos.z;
      if (c.pos.distanceToSquared(c.target) > 100) c.pos.copy(c.target); else c.pos.lerp(c.target, k);
      c.h = U.lerpAngle(c.h, c.th, k); c.steer = 0;
      roll = Math.hypot(c.pos.x - ox, c.pos.z - oz);
    }
    c.group.position.copy(c.pos); c.group.rotation.y = c.h;
    c.group.rotation.z = c.local ? U.lerp(c.group.rotation.z, -c.steer * Math.min(1, Math.abs(c.speed) / 20) * 0.12, 0.2) : 0;   // roulis « physique exagérée »
    for (const w of c.wheels) { w.rotation.x += roll / 0.38; if (w.front) w.rotation.y = c.steer; }
    const key = JSON.stringify(bedItems || []);
    if (key !== c.bedKey) {
      c.bedKey = key; c.bed.clear();
      if (c.kind === 'camion') {                     // plateau : palettes devant, caisses derrière (2 colonnes)
        let z = 1.0, ci = 0; const items = (bedItems || []).slice().sort((a, b) => (b.type === 'palette') - (a.type === 'palette'));
        for (const it of items) {
          const m = ML.Items.mesh(it);
          if (it.type === 'palette') { m.position.set(0, 1.2, z - 1.1); z -= 2.4; }
          else { m.position.set(ci % 2 ? 0.6 : -0.6, 1.2, z - 0.5 - Math.floor(ci / 2) * 0.95); ci++; }
          c.bed.add(m);
        }
      } else (bedItems || []).forEach((it, j) => { const m = ML.Items.mesh(it); const s = c.slots[j] || c.slots[0]; m.position.set(s[0], s[1], s[2]); c.bed.add(m); });
    }
  };

  /* ---------- Circulation & gendarmerie (rendu des données de l'hôte) ---------- */
  const MODELS = ['city_car_sedan', 'city_car_hatchback', 'city_car_stationwagon', 'city_car_taxi'];
  function carModel(name, color) {
    const o = ML.Assets.clone(name, 4.6);
    if (o) { const g = new THREE.Group(); o.position.y = 0.33; g.add(o); return g; }
    const g = new THREE.Group(); U.box(1.8, 0.8, 4.2, color || 0x2980b9, 0, 0.7, 0, g); U.box(1.6, 0.6, 2, 0x9fd3ff, 0, 1.35, -0.2, g); return g;
  }
  Cars.updateTraffic = (list, pol, dt) => {
    list = list || [];
    while (Cars.traffic.length < list.length) { const t = carModel(MODELS[Cars.traffic.length % 4]); t.userData.t = new THREE.Vector3(); t.userData.h = 0; ML.scene.add(t); Cars.traffic.push(t); }
    Cars.traffic.forEach((t, i) => {
      const d = list[i]; t.visible = !!d; if (!d) return;
      const tgt = t.userData.t, first = !t.userData.seen; tgt.set(d[0], 0, d[1]); t.userData.h = d[2];
      if (first || t.position.distanceToSquared(tgt) > 60) { t.position.copy(tgt); t.rotation.y = d[2]; t.userData.seen = true; }
    });
    if (!Cars.police) {
      const g = carModel('city_car_sedan', 0xffffff); const bar = new THREE.Group(); bar.position.y = 2.05; g.add(bar);
      Cars.polBlue = U.box(0.5, 0.18, 0.3, U.mat(0x2255ff, 0x0022ff), -0.3, 0, 0, bar, false); Cars.polRed = U.box(0.5, 0.18, 0.3, U.mat(0xff2222, 0xff0000), 0.3, 0, 0, bar, false);
      const l = U.label('GENDARMERIE', { size: 0.35, color: '#fff', bg: 'rgba(31,58,147,0.9)' }); l.position.y = 2.8; g.add(l);
      Cars.police = g; ML.scene.add(g); g.visible = false; g.userData.t = new THREE.Vector3();
    }
    const P = Cars.police;
    if (pol) { if (!P.visible) P.position.set(pol[0], 0, pol[1]); P.visible = true; P.userData.t.set(pol[0], 0, pol[1]); P.userData.h = pol[2]; }
    else P.visible = false;
  };
  Cars.renderTraffic = dt => {
    const k = Math.min(1, dt * 8);
    for (const t of Cars.traffic) if (t.visible) { t.position.lerp(t.userData.t, k); t.rotation.y = U.lerpAngle(t.rotation.y, t.userData.h, k); }
    const P = Cars.police;
    if (P && P.visible) {
      P.position.lerp(P.userData.t, k); P.rotation.y = U.lerpAngle(P.rotation.y, P.userData.h, k);
      const on = Math.floor(performance.now() / 180) % 2; Cars.polBlue.visible = !!on; Cars.polRed.visible = !on;
      if (Math.floor(performance.now() / 700) % 2 && !Cars._sir) { Cars._sir = true; ML.Sfx.at('siren', P.position.x, P.position.z); } else if (!(Math.floor(performance.now() / 700) % 2)) Cars._sir = false;
    }
  };
  /** Voiture de gendarmerie garée devant la brigade (décor) */
  Cars.parkPolice = () => {
    const L = ML.LOC.comp.police; if (!L) return;
    const g = carModel('city_car_sedan', 0xffffff); U.box(1, 0.18, 0.3, U.mat(0x2255ff), 0, 2.05, 0, g, false);
    g.position.set(L.dock.x + L.tan.x * 4, 0, L.dock.z + L.tan.z * 4); g.rotation.y = Math.atan2(L.tan.x, L.tan.z); ML.scene.add(g); Cars.parkedPolice = g;
  };

  /** Caméra du conducteur : vue conduite ou extérieure (V) */
  Cars.camera = (c, mode, look) => {
    const cam = ML.camera, f = Cars.fwd(c.h), l = Cars.left(c.h), tp = c.kind === 'tp';
    if (mode === 'cab' && c.kind === 'camion') { cam.position.set(c.pos.x + f.x * 2.9 + l.x * 0.55, 2.75, c.pos.z + f.z * 2.9 + l.z * 0.55); cam.rotation.set(look.p - 0.08, c.h + Math.PI + look.y, 0, 'YXZ'); return; }
    if (mode === 'cab' && c.kind === 'fenwick') { cam.position.set(c.pos.x - f.x * 0.3, 2.15, c.pos.z - f.z * 0.3); cam.rotation.set(look.p - 0.2, c.h + Math.PI + look.y, 0, 'YXZ'); return; }
    if (mode === 'cab' && !tp) {
      cam.position.set(c.pos.x + f.x * 0.15 + l.x * 0.38, 1.55, c.pos.z + f.z * 0.15 + l.z * 0.38);
      cam.rotation.set(look.p, c.h + Math.PI + look.y, -c.group.rotation.z, 'YXZ');
    } else if (tp && mode === 'cab') {
      cam.position.set(c.pos.x + f.x * 1.6, 1.65, c.pos.z + f.z * 1.6);
      cam.rotation.set(look.p - 0.25, c.h + look.y, 0, 'YXZ');
    } else {
      const a = c.h + look.y, dist = tp ? 5 : c.kind === 'camion' ? 13 : c.kind === 'fenwick' ? 6.5 : 8;
      cam.position.set(c.pos.x - Math.sin(a) * dist, (tp ? 3 : 3.8) - look.p * 3, c.pos.z - Math.cos(a) * dist);
      cam.lookAt(c.pos.x, 1.2, c.pos.z);
    }
  };
})();
