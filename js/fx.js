/* =====================================================================
   fx.js — Effets visuels côté client : feux de copeaux, tas de copeaux,
   flaques d'huile, pigeon, particules (extincteur, soufflette, fumée),
   marqueurs « viens ici » (ping). Rien de tout ça ne décide du jeu :
   c'est l'affichage de l'état envoyé par l'hôte.
   ===================================================================== */
(function () {
  const F = ML.Fx = { fires: {}, puds: {}, piles: {}, pings: [], parts: [], root: null, peds: [] };
  const U = ML.U;
  let partGeo, fireMat, fireMat2;

  F.reset = () => {
    if (F.root) ML.scene.remove(F.root);
    F.root = new THREE.Group(); ML.scene.add(F.root);
    F.fires = {}; F.puds = {}; F.piles = {}; F.pings = []; F.parts = []; F.pigeon = null; F.dog = null;
    for (const v of F.peds || []) ML.People.dispose(v); F.peds = [];
    partGeo = partGeo || new THREE.BoxGeometry(0.12, 0.12, 0.12);
    fireMat = fireMat || new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 });
    fireMat2 = fireMat2 || new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85 });
  };

  /* ---------- Particules ---------- */
  const MATS = {};
  function pmat(color, op) { const k = color + '_' + op; return MATS[k] || (MATS[k] = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); }
  F.emit = (kind, pos, dir, n) => {
    if (!F.root) return;
    const cfg = { spray: [0xffffff, 0.8, 9, 0.7], blow: [0xdfe6e9, 0.5, 12, 0.45], smoke: [0x555555, 0.55, 1.5, 1.6], chips: [0xb0b7bf, 1, 5, 0.9], spark: [0xffd23f, 1, 6, 0.4] }[kind];
    for (let i = 0; i < (n || 6); i++) {
      if (F.parts.length > 260) { const o = F.parts.shift(); F.root.remove(o.m); }
      const m = new THREE.Mesh(partGeo, pmat(cfg[0], cfg[1])); m.position.copy(pos);
      const s = cfg[2], v = new THREE.Vector3(dir.x * s + (Math.random() - 0.5) * s * 0.35, dir.y * s + (Math.random() - 0.3) * s * 0.3, dir.z * s + (Math.random() - 0.5) * s * 0.35);
      if (kind === 'smoke') v.set((Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6);
      m.scale.setScalar(kind === 'smoke' ? 3 : 1 + Math.random());
      F.root.add(m); F.parts.push({ m, v, t: cfg[3] * (0.7 + Math.random() * 0.6), g: kind === 'chips' ? 12 : kind === 'smoke' ? -0.5 : 2 });
    }
  };

  /* ---------- Ping « viens ici » ---------- */
  F.ping = (x, z, name, color) => {
    if (!F.root) return;
    const g = new THREE.Group(); g.position.set(x, ML.gy(x, z), z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 40, 10, 1, true), new THREE.MeshBasicMaterial({ color: color || 0xffd257, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 20; beam.renderOrder = 3; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.5, 24), new THREE.MeshBasicMaterial({ color: color || 0xffd257, side: THREE.DoubleSide, transparent: true, opacity: 0.9, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
    const l = U.label('📍 ' + name + ' : viens ici !', { size: 0.9, color: '#ffd257', bg: 'rgba(0,0,0,0.75)', depthTest: false }); l.position.y = 4; l.renderOrder = 4; g.add(l);
    F.root.add(g); F.pings.push({ g, t: 12, ring });
  };

  /* ---------- Chien de la casse ---------- */
  function buildDog() {
    const g = new THREE.Group();
    U.box(0.4, 0.4, 0.9, 0x5d4037, 0, 0.55, 0, g); U.box(0.32, 0.32, 0.36, 0x4e342e, 0, 0.8, 0.55, g); U.box(0.16, 0.14, 0.2, 0x3e2723, 0, 0.74, 0.8, g);
    for (const x of [-0.13, 0.13]) U.box(0.08, 0.16, 0.06, 0x3e2723, x, 1.02, 0.5, g);
    const legs = []; for (const [x, z] of [[0.14, 0.3], [-0.14, 0.3], [0.14, -0.3], [-0.14, -0.3]]) legs.push(U.box(0.1, 0.4, 0.1, 0x4e342e, x, 0.2, z, g));
    U.box(0.06, 0.06, 0.35, 0x5d4037, 0, 0.7, -0.6, g).rotation.x = -0.6;
    const l = U.label('🐕', { size: 0.5, bg: 'rgba(0,0,0,0)' }); l.position.y = 1.5; g.add(l);
    g.userData = { t: new THREE.Vector3(), h: 0, st: 1, legs, lab: l, seen: false }; g.scale.setScalar(1.2);
    F.root.add(g); return g;
  }

  /* ---------- Pigeon ---------- */
  function buildPigeon() {
    const g = new THREE.Group();
    U.box(0.28, 0.22, 0.42, 0x8e9aa6, 0, 0, 0, g); U.box(0.2, 0.2, 0.2, 0x6c7a89, 0, 0.16, 0.22, g); U.box(0.06, 0.05, 0.1, 0xe67e22, 0, 0.14, 0.36, g);
    const wl = new THREE.Group(), wr = new THREE.Group(); wl.position.set(0.14, 0.05, 0); wr.position.set(-0.14, 0.05, 0); g.add(wl, wr);
    U.box(0.4, 0.04, 0.26, 0x7f8c8d, 0.2, 0, 0, wl); U.box(0.4, 0.04, 0.26, 0x7f8c8d, -0.2, 0, 0, wr);
    const loot = U.box(0.18, 0.05, 0.14, 0xffd23f, 0, -0.16, 0.05, g); loot.visible = false;
    g.userData = { wl, wr, loot, t: new THREE.Vector3(), seen: false }; g.scale.setScalar(1.3);
    const l = U.label('🐦', { size: 0.5, bg: 'rgba(0,0,0,0)' }); l.position.y = 0.6; g.add(l); g.userData.lab = l;
    F.root.add(g); return g;
  }

  /* ---------- Mise à jour depuis l'état ---------- */
  F.sync = S => {
    if (!F.root || !S) return;
    // feux
    const seenF = {};
    for (const f of S.fires || []) {
      seenF[f.id] = 1;
      let v = F.fires[f.id];
      if (!v) {
        v = new THREE.Group(); v.position.set(f.x, 0, f.z);
        v.userData.c = [];
        for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.3 + Math.random() * 0.2, 1.1, 6), i % 2 ? fireMat2 : fireMat); c.position.set((Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8); v.add(c); v.userData.c.push(c); }
        F.root.add(v); F.fires[f.id] = v;
      }
      v.userData.hp = f.hp;
    }
    for (const id in F.fires) if (!seenF[id]) { F.root.remove(F.fires[id]); delete F.fires[id]; }
    // flaques
    const seenP = {};
    for (const p of S.puddles || []) {
      seenP[p.id] = 1;
      if (!F.puds[p.id]) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 18), new THREE.MeshPhongMaterial({ color: 0x3a3f2a, shininess: 120, specular: 0x99aa77, transparent: true, opacity: 0.85 }));
        m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.055, p.z); m.scale.set(1, 0.75 + (p.id % 3) * 0.12, 1); F.root.add(m); F.puds[p.id] = m;
      }
    }
    for (const id in F.puds) if (!seenP[id]) { F.root.remove(F.puds[id]); delete F.puds[id]; }
    // bacs à copeaux (niveau de remplissage) + bac absent
    for (const id in S.machines) {
      const W = ML.World.machines[id]; if (!W) continue;
      let b = F.piles[id];
      if (!b) {
        b = new THREE.Group(); b.position.set(W.chips.x, 0, W.chips.z);
        U.box(0.8, 0.5, 0.6, 0x2c3e50, 0, 0.25, 0, b); b.userData.fill = U.box(0.72, 0.4, 0.52, U.mat(0xb0b7bf), 0, 0.05, 0, b);
        b.userData.lab = U.label('', { size: 0.28, color: '#ff6b6b' }); b.userData.lab.position.y = 1.1; b.add(b.userData.lab);
        F.root.add(b); F.piles[id] = b;
      }
      const M = S.machines[id], k = (M.chips || 0) / 100;
      b.visible = M.bin !== false;
      b.userData.fill.scale.y = Math.max(0.05, k * 1.2); b.userData.fill.position.y = 0.05 + 0.2 * Math.max(0.05, k * 1.2);
      b.userData.fill.material = k >= 1 ? U.mat(0xc0392b) : k > 0.7 ? U.mat(0xe67e22) : U.mat(0xb0b7bf);
      const t = k >= 1 ? 'BAC PLEIN !' : k > 0.75 ? 'bac ' + Math.round(k * 100) + ' %' : '';
      if (b.userData.lab.text !== t) { b.userData.lab.setText(t); b.userData.lab.text = t; }
    }
  };
  /** Données rapides (pigeon) */
  F.fast = f => {
    if (!F.root) return;
    if (f.dog) {
      if (!F.dog) F.dog = buildDog();
      const d = F.dog.userData; d.t.set(f.dog[0], ML.gy(f.dog[0], f.dog[1]), f.dog[1]); d.h = f.dog[2]; d.st = f.dog[3];
      if (!d.seen) { F.dog.position.copy(d.t); d.seen = true; }
    }
    if (f.ps) {
      while (F.peds.length < f.ps.length) {
        const i = F.peds.length, r = ML.U.rng(i * 7919 + 13);
        const v = ML.People.build({ skin: r.pick(ML.SKINS), shirt: Math.floor(r() * 0xffffff), pants: r.pick([0x2c3e50, 0x34495e, 0x555555, 0x1f4e9a]), hair: r.pick(ML.HAIRS), height: r.range(1.55, 1.9), width: r.range(0.9, 1.2), longHair: r() < 0.4 }, { name: '', bare: true });
        F.peds.push(v);
      }
      f.ps.forEach(([x, z, h, down], i) => { const v = F.peds[i]; v.target.set(x, ML.gy(x, z), z); v.tYaw = h; v.down = down; if (!v.seen) { v.pos.copy(v.target); v.seen = true; } });
    }
    if (!f.pg) return;
    if (!F.pigeon) F.pigeon = buildPigeon();
    const P = F.pigeon, d = P.userData;
    d.t.set(f.pg[0], f.pg[1], f.pg[2]); d.loot.visible = !!f.pg[3]; d.fly = !!f.pg[4];
    if (!d.seen) { P.position.copy(d.t); d.seen = true; }
  };

  F.update = (dt, S) => {
    if (!F.root) return;
    const t = performance.now() / 1000;
    for (const id in F.fires) {
      const v = F.fires[id], k = 0.5 + (v.userData.hp || 50) / 100;
      v.userData.c.forEach((c, i) => { c.scale.set(k, k * (0.8 + Math.sin(t * 12 + i * 2) * 0.3), k); c.rotation.y = t * (i + 1); });
      if (Math.random() < dt * 6) F.emit('smoke', new THREE.Vector3(v.position.x, 1.5, v.position.z), { x: 0, y: 1, z: 0 }, 1);
    }
    for (const p of F.parts.slice()) {
      p.t -= dt; p.v.y -= p.g * dt; p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.5);
      if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.set(0, 0, 0); }
      if (p.t <= 0) { F.root.remove(p.m); F.parts.splice(F.parts.indexOf(p), 1); }
    }
    for (const p of F.pings.slice()) { p.t -= dt; p.ring.scale.setScalar(1 + (12 - p.t) % 1); if (p.t <= 0) { F.root.remove(p.g); F.pings.splice(F.pings.indexOf(p), 1); } }
    if (F.pigeon) {
      const P = F.pigeon, d = P.userData, k = Math.min(1, dt * 10), ox = P.position.x, oz = P.position.z;
      P.position.lerp(d.t, k);
      const dx = P.position.x - ox, dz = P.position.z - oz; if (Math.abs(dx) + Math.abs(dz) > 0.001) P.rotation.y = Math.atan2(dx, dz);
      const flap = d.fly ? Math.sin(t * 25) * 0.9 : 0.1; d.wl.rotation.z = flap; d.wr.rotation.z = -flap;
    }
    if (F.dog) {
      const D = F.dog, d = D.userData, k = Math.min(1, dt * 8), ox = D.position.x, oz = D.position.z;
      D.position.lerp(d.t, k); D.rotation.y = ML.U.lerpAngle(D.rotation.y, d.h, k);
      const mv = Math.hypot(D.position.x - ox, D.position.z - oz) / Math.max(dt, 1e-3);
      d.legs.forEach((l, i) => { l.rotation.x = mv > 0.5 ? Math.sin(t * 18 + i * 1.6) * 0.6 : 0; });
      D.rotation.z = d.st === 0 ? 1.4 : 0; D.position.y = d.t.y + (d.st === 0 ? -0.2 : 0);
      const lt = d.st === 0 ? '💤' : d.st === 2 ? '🐕 GRRR !' : '🐕'; if (d.lt !== lt) { d.lab.setText(lt); d.lt = lt; }
    }
    const cp = ML.camera.position;
    for (const v of F.peds) {
      if (!v.seen) continue;
      v.group.visible = Math.abs(v.pos.x - cp.x) < 80 && Math.abs(v.pos.z - cp.z) < 80;        // V5 : de loin, on ne dessine pas les passants
      if (!v.group.visible) { v.pos.lerp(v.target, Math.min(1, dt * 12)); continue; }
      ML.People.animate(v, dt, null);
      v.group.rotation.x = v.down ? -1.45 : 0; if (v.down) v.group.position.y = v.pos.y + 0.25;
    }
  };
})();
