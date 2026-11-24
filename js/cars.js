/* =====================================================================
   cars.js — Les utilitaires (Méga Mégane jaune, Kangoo de Lebec blanc) :
   modèle 3D, conduite arcade côté conducteur, caméra de conduite.
   La position d'une voiture conduite vient de son conducteur ; sinon de
   l'hôte. La benne (contenu) est gérée par l'hôte.
   ===================================================================== */
(function () {
  const Cars = ML.Cars = { list: [] };
  const U = ML.U, CF = ML.CFG.CAR;

  Cars.build = (i, color, name) => {
    const g = new THREE.Group(), Y = color;
    U.box(1.85, 0.6, 4.5, Y, 0, 0.65, 0, g); U.box(1.8, 0.25, 1.1, Y, 0, 1.05, 1.65, g);
    U.box(1.78, 0.1, 1.1, Y, 0, 1.98, 0.3, g);
    for (const x of [-0.85, 0.85]) { U.box(0.08, 0.95, 0.1, Y, x, 1.48, 1.0, g); U.box(0.08, 0.95, 0.12, Y, x, 1.48, -0.25, g); }
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.2 });
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.9, 0.04), glass); ws.position.set(0, 1.5, 1.0); ws.rotation.x = -0.35; g.add(ws);
    U.box(1.7, 0.22, 0.35, 0x2d2d2d, 0, 1.05, 1.0, g);
    const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), U.mat(0x111111)); wheelS.position.set(0.38, 1.22, 0.78); wheelS.rotation.x = -0.5; g.add(wheelS);
    U.box(1.7, 0.5, 0.1, 0x2d2d2d, 0, 1.3, -0.3, g);
    U.box(1.8, 0.08, 1.9, 0x555555, 0, 0.98, -1.25, g);
    for (const x of [-0.88, 0.88]) U.box(0.08, 0.5, 1.9, 0x7f8c8d, x, 1.25, -1.25, g);
    U.box(1.8, 0.5, 0.08, 0x7f8c8d, 0, 1.25, -2.2, g);
    U.box(1.9, 0.2, 0.15, 0x333333, 0, 0.45, 2.28, g); U.box(1.9, 0.2, 0.15, 0x333333, 0, 0.45, -2.28, g);
    for (const x of [-0.65, 0.65]) { U.box(0.35, 0.15, 0.05, U.mat(0xffffff, 0xffffaa), x, 0.8, 2.26, g); U.box(0.3, 0.15, 0.05, U.mat(0xff0000, 0x880000), x, 0.8, -2.26, g); }
    const wheels = [];
    for (const [x, z] of [[0.95, 1.45], [-0.95, 1.45], [0.95, -1.45], [-0.95, -1.45]]) {
      const p = new THREE.Group(); p.position.set(x, 0.38, z); p.rotation.order = 'YXZ'; g.add(p);
      U.cyl(0.38, 0.38, 0.3, 0x1a1a1a, 0, 0, 0, p, 12).rotation.z = Math.PI / 2; U.box(0.05, 0.25, 0.25, 0xbdc3c7, x > 0 ? 0.16 : -0.16, 0, 0, p);
      p.front = z > 0; wheels.push(p);
    }
    const bed = new THREE.Group(); g.add(bed);
    const lab = U.label(name, { size: 0.4, color: '#ffd257' }); lab.position.set(0, 2.5, 0); g.add(lab);
    ML.scene.add(g);
    const c = { i, group: g, wheels, bed, bedKey: '', pos: new THREE.Vector3(), target: new THREE.Vector3(), h: 0, th: 0, speed: 0, steer: 0, local: false };
    Cars.list[i] = c;
    return c;
  };

  Cars.fwd = h => ({ x: Math.sin(h), z: Math.cos(h) });
  Cars.left = h => ({ x: Math.cos(h), z: -Math.sin(h) });
  Cars.doorPos = c => { const l = Cars.left(c.h); return new THREE.Vector3(c.pos.x + l.x * 1.3, 1.1, c.pos.z + l.z * 1.3); };
  Cars.rearPos = c => { const f = Cars.fwd(c.h); return new THREE.Vector3(c.pos.x - f.x * 2.6, 1.1, c.pos.z - f.z * 2.6); };

  /** Repousse un point (joueur) hors des carrosseries */
  Cars.pushOut = (p, r) => {
    for (const c of Cars.list) {
      const f = Cars.fwd(c.h);
      for (const k of [1.2, 0, -1.2]) {
        const cx = c.pos.x + f.x * k, cz = c.pos.z + f.z * k, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), R = r + 1.0;
        if (d < R && d > 0.001) { p.x = cx + dx / d * R; p.z = cz + dz / d * R; }
      }
    }
  };

  /** Conduite locale (seulement par le conducteur) */
  Cars.drive = (c, dt, input) => {
    const turbo = ML.Game.S && ML.Game.S.buffs.turbo > ML.Game.S.rt ? 1.3 : 1;
    let thr = 0, st = 0;
    if (input) {
      const I = ML.Input;
      if (I.down('KeyW') || I.down('ArrowUp')) thr += 1;
      if (I.down('KeyS') || I.down('ArrowDown')) thr -= 1;
      if (I.down('KeyA') || I.down('ArrowLeft')) st += 1;
      if (I.down('KeyD') || I.down('ArrowRight')) st -= 1;
      if (I.down('Space')) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 26 * dt);
    }
    if (thr > 0) c.speed += (c.speed < -0.5 ? CF.brake : CF.accel * turbo) * dt;
    else if (thr < 0) c.speed -= (c.speed > 0.5 ? CF.brake : CF.accel * 0.6) * dt;
    else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 3 * dt);
    c.speed = U.clamp(c.speed, -CF.rev, CF.max * turbo);
    const target = st * CF.steer * (1 - 0.45 * Math.min(1, Math.abs(c.speed) / CF.max));
    c.steer = U.lerp(c.steer, target, Math.min(1, 8 * dt));
    c.h += (c.speed * Math.tan(c.steer) / CF.wb) * dt;
    const f = Cars.fwd(c.h);
    c.pos.x += f.x * c.speed * dt; c.pos.z += f.z * c.speed * dt;
    let hit = false;
    for (const k of [1.3, 0, -1.3]) {
      const p = { x: c.pos.x + f.x * k, z: c.pos.z + f.z * k }, ox = p.x, oz = p.z;
      if (U.resolveCircle(p, 0.98)) { hit = true; c.pos.x += p.x - ox; c.pos.z += p.z - oz; }
      for (const o of Cars.list) {       // autres voitures
        if (o === c) continue;
        const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d = Math.hypot(dx, dz);
        if (d < 2.3 && d > 0.01) { c.pos.x += dx / d * (2.3 - d); c.pos.z += dz / d * (2.3 - d); hit = true; }
      }
    }
    if (hit) { if (Math.abs(c.speed) > 6) ML.Sfx.play('clang'); c.speed *= -0.2; }
    c.target.copy(c.pos); c.th = c.h;
  };

  /** Rendu : position lissée (si pas locale), roues, contenu de la benne */
  Cars.render = (c, dt, bedItems) => {
    let roll = c.speed * dt;
    if (!c.local) {
      const k = Math.min(1, dt * 10), ox = c.pos.x, oz = c.pos.z;
      if (c.pos.distanceToSquared(c.target) > 100) c.pos.copy(c.target); else c.pos.lerp(c.target, k);
      c.h = U.lerpAngle(c.h, c.th, k); c.steer = 0;
      roll = Math.hypot(c.pos.x - ox, c.pos.z - oz);
    }
    c.group.position.copy(c.pos); c.group.rotation.y = c.h;
    for (const w of c.wheels) { w.rotation.x += roll / 0.38; if (w.front) w.rotation.y = c.steer; }
    const key = JSON.stringify(bedItems || []);
    if (key !== c.bedKey) {
      c.bedKey = key; c.bed.clear();
      const slots = [[-0.42, 1.03, -0.75], [0.42, 1.03, -0.75], [-0.42, 1.03, -1.65], [0.42, 1.03, -1.65]];
      (bedItems || []).forEach((it, j) => { const m = ML.Items.mesh(it); const s = slots[j] || slots[0]; m.position.set(s[0], s[1], s[2]); c.bed.add(m); });
    }
  };

  /** Caméra du conducteur : vue conduite (C) ou extérieure (V) */
  Cars.camera = (c, mode, look) => {
    const cam = ML.camera, f = Cars.fwd(c.h), l = Cars.left(c.h);
    if (mode === 'cab') {
      cam.position.set(c.pos.x + f.x * 0.15 + l.x * 0.38, 1.55, c.pos.z + f.z * 0.15 + l.z * 0.38);
      cam.rotation.set(look.p, c.h + Math.PI + look.y, 0, 'YXZ');
    } else {
      const a = c.h + look.y;
      cam.position.set(c.pos.x - Math.sin(a) * 8, 3.8 - look.p * 3, c.pos.z - Math.cos(a) * 8);
      cam.lookAt(c.pos.x, 1.2, c.pos.z);
    }
  };
})();
