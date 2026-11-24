/* =====================================================================
   world.js — Le monde (identique chez tous les joueurs : graine fixe) :
   l'atelier Mécanique Lebec (4 postes), la ville (routes, trottoirs,
   décors KayKit), les entreprises (fournisseurs, sous-traitants,
   clients), les cachettes des trouvailles et les collisions.
   Repère : X est/ouest, Z nord(-)/sud(+), 1 unité = 1 m.
   ===================================================================== */
(function () {
  const W = ML.World = { targets: [], machines: {}, lamps: [] };
  const U = ML.U, T = ML.Tex, A = ML.Assets;
  const ROADS_Z = [90, 190, 290];
  let rng, scene;

  W.build = sc => {
    scene = sc; rng = U.rng(20261124);
    ML.mapRects = [];
    ML.LOC = { comp: {}, hides: [] };
    W.ground(); W.atelier(); W.furniture(); W.machinesBuild();
    for (const k in ML.COMPANIES) W.company(k, ML.COMPANIES[k]);
    W.decor(); W.bounds();
  };

  /* ---------- Sol, routes, trottoirs ---------- */
  W.ground = () => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(380, 420), T.mat('herbe', 70, 76));
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, 145); g.receiveShadow = true; scene.add(g);
    const road = (w, d, x, z) => { U.plane(w, d, T.mat('asphalte', Math.max(1, w / 12), Math.max(1, d / 12)), x, z, 0.02); ML.mapRects.push({ x, z, w, d, c: '#4a4d52' }); };
    const walk = (w, d, x, z) => U.plane(w, d, T.mat('beton', Math.max(1, w / 4), Math.max(1, d / 4), 0xd0d0d0), x, z, 0.03);
    road(14, 316, 0, 172);
    walk(2.6, 316, -8.3, 172); walk(2.6, 316, 8.3, 172);
    for (const z of ROADS_Z) { road(340, 12, 0, z); walk(340, 2.4, 0, z - 7.2); walk(340, 2.4, 0, z + 7.2); }
    // parvis de l'atelier
    U.plane(30, 14, T.mat('beton', 7, 3), 0, 21, 0.025); ML.mapRects.push({ x: 0, z: 21, w: 30, d: 14, c: '#8a8e93' });
    // marquages
    const white = U.mat(0xeeeeee);
    for (let z = 30; z < 326; z += 9) if (!ROADS_Z.some(r => Math.abs(z - r) < 9)) U.plane(0.25, 4, white, 0, z, 0.035);
    for (const rz of ROADS_Z) {
      for (let x = -166; x < 168; x += 9) if (Math.abs(x) > 9) U.plane(4, 0.25, white, x, rz, 0.035);
      for (let i = -3; i < 4; i++) { U.plane(0.6, 3, white, i * 1.6, rz - 9.8, 0.036); U.plane(0.6, 3, white, i * 1.6, rz + 9.8, 0.036); } // passages piétons
    }
  };

  /* ---------- L'atelier ---------- */
  function wall(x1, z1, x2, z2, h, mat, t) {
    t = t || 0.4;
    const w = Math.abs(x2 - x1) || t, d = Math.abs(z2 - z1) || t;
    U.box(w, h, d, mat, (x1 + x2) / 2, h / 2, (z1 + z2) / 2, scene);
    U.boxCollider((x1 + x2) / 2, (z1 + z2) / 2, w, d, 'wall');
  }
  W.atelier = () => {
    ML.mapRects.push({ x: 0, z: 0, w: 40, d: 28, c: '#a2a8ad', name: 'Atelier' });
    U.plane(40, 28, T.mat('sol', 10, 7), 0, 0, 0.03);
    const wm = T.mat('bardage', 6, 1.5, 0xc9d1d8);
    wall(-20.2, -14, 20.2, -14, 7, wm); wall(-20, -14, -20, 14, 7, wm); wall(20, -14, 20, 14, 7, wm);
    wall(-20.2, 14, -5, 14, 7, wm); wall(5, 14, 20.2, 14, 7, wm);
    U.box(10, 2.5, 0.4, wm, 0, 5.75, 14, scene);
    U.cyl(0.45, 0.45, 10, 0x7f8c8d, 0, 4.3, 14.15, scene).rotation.z = Math.PI / 2;
    U.box(40.8, 0.3, 28.8, T.mat('tole', 8, 6, 0x7f8c8d), 0, 7.15, 0, scene);
    for (let x = -12; x <= 12; x += 12) U.box(6, 0.05, 3, U.mat(0xdff3ff, 0x9fb8c8), x, 7.0, 0, scene, false);     // lanterneaux
    U.box(40.9, 0.8, 0.1, 0x24457a, 0, 6.3, 14.25, scene);
    const sign = U.label('MÉCANIQUE LEBEC — Usinage de précision', { size: 1.1, color: '#ffd257', bg: 'rgba(20,30,60,0.92)' });
    sign.position.set(0, 8.3, 14.6); scene.add(sign);
    for (let x = -14; x <= 14; x += 7) for (const z of [-8, 0, 8]) U.box(2.6, 0.08, 0.3, U.mat(0xffffff, 0xdddddd), x, 6.9, z, scene, false);
    const p1 = new THREE.PointLight(0xfff4e0, 0.35, 34); p1.position.set(-6, 6, 0); scene.add(p1);
    const p2 = new THREE.PointLight(0xfff4e0, 0.25, 30); p2.position.set(10, 6, 0); scene.add(p2);
    // marquages au sol et zones
    U.plane(36, 0.14, 0xf1c40f, -2, -3.5, 0.04); U.plane(36, 0.14, 0xf1c40f, -2, 1.4, 0.04);
    U.plane(7, 4.6, 0x2e86de, -12.5, 10.3, 0.045); U.plane(7, 4.6, 0x27ae60, 11.5, 10.3, 0.045);
    const l1 = U.label('RÉCEPTION : déposer les caisses de matière/outils', { size: 0.42, color: '#bfe0ff' }); l1.position.set(-12.5, 2.6, 10.3); scene.add(l1);
    const l2 = U.label('EXPÉDITION : caisses usinées', { size: 0.42, color: '#b6ffcb' }); l2.position.set(11.5, 2.6, 10.3); scene.add(l2);
    ML.LOC.reception = { x: -12.5, z: 10.3 }; ML.LOC.expedition = { minX: 8.4, maxX: 14.6, minZ: 8.4, maxZ: 12.3 };
    ML.LOC.coffee = [{ x: -18.3, z: 9.5 }, { x: -17, z: 11.8 }, { x: -18.6, z: 12.4 }];
    ML.LOC.patrol = [{ x: 8, z: -1 }, { x: 0, z: -1.2 }, { x: -8, z: -1.2 }, { x: -16, z: -1 }, { x: 12, z: -6 }, { x: 14, z: 5 }, { x: 4, z: 6 }];
    ML.LOC.carSpawn = [{ x: -5, z: 21, h: 0 }, { x: 5, z: 21, h: 0 }];
    ML.LOC.spawn = [{ x: 8, z: 2 }, { x: 10, z: 2 }, { x: 8, z: 4 }, { x: 10, z: 4 }, { x: 12, z: 3 }];
  };

  W.furniture = () => {
    // racks de bruts
    const racks = { acier: -16, alu: -12, inox: -8 };
    W.rackBars = {}; W.rackLabels = {};
    for (const m in racks) {
      const x = racks[m], z = -13.1, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      for (const dx of [-1.2, 1.2]) U.box(0.1, 2.2, 0.8, 0x2c3e50, dx, 1.1, 0, g);
      for (const y of [0.5, 1.2, 1.9]) U.box(2.5, 0.06, 0.8, 0xe67e22, 0, y, 0, g);
      W.rackBars[m] = [];
      for (let i = 0; i < 9; i++) { const b = U.cyl(0.07, 0.07, 2.1, ML.MATERIALS[m].color, 0, 0.6 + Math.floor(i / 3) * 0.7, -0.25 + (i % 3) * 0.25, g); b.rotation.z = Math.PI / 2; W.rackBars[m].push(b); }
      const l = U.label('', { size: 0.36 }); l.position.set(0, 2.7, 0.3); g.add(l); W.rackLabels[m] = l;
      U.boxCollider(x, z, 2.6, 0.9, 'rack');
      W.targets.push({ id: 'rack:' + m, x, y: 1.2, z: z + 0.6, r: 2.8 });
    }
    // armoire à outils
    U.box(4.4, 1.3, 0.8, 0xc0392b, 2, 0.65, -13.3, scene); U.boxCollider(2, -13.3, 4.4, 0.8, 'cabinet');
    W.drawerLabels = {};
    [['plaquette', 0.7], ['fraise', 2], ['foret', 3.3]].forEach(([t, x]) => {
      U.box(1.1, 0.35, 0.05, ML.TOOLS[t].color, x, 0.95, -12.88, scene);
      const l = U.label('', { size: 0.22 }); l.position.set(x, 1.7, -12.8); scene.add(l); W.drawerLabels[t] = l;
      W.targets.push({ id: 'tool:' + t, x, y: 1.0, z: -12.7, r: 2.4 });
    });
    // coin café
    U.box(0.8, 1.8, 0.7, 0x4e342e, -19.3, 0.9, 12.5, scene); U.box(3, 0.45, 0.6, 0x8d6e63, -17, 0.23, 13.3, scene);
    U.boxCollider(-19.3, 12.5, 0.8, 0.7, 'coffee'); U.boxCollider(-17, 13.3, 3, 0.6, 'bench');
    const lc = U.label('☕ Café (sprint +)', { size: 0.3 }); lc.position.set(-18.8, 2.3, 12.5); scene.add(lc);
    W.targets.push({ id: 'coffee', x: -19.3, y: 1.2, z: 12.5, r: 2.4 });
    W.targets.push({ id: 'reception', x: -12.5, y: 0.8, z: 10.3, r: 4.2 });
    // bureau du chef + tableau des commandes
    U.box(2.4, 0.8, 1.2, 0x5d4037, 12, 0.4, -8, scene); U.boxCollider(12, -8, 2.4, 1.2, 'desk');
    U.box(0.5, 0.35, 0.4, 0x222222, 11.5, 0.98, -8, scene);
    U.box(0.12, 2, 5, 0xffffff, 19.75, 2.2, 0, scene); U.boxCollider(19.75, 0, 0.3, 5, 'board');
    const lb = U.label('Bureau du chef', { size: 0.3 }); lb.position.set(12, 1.9, -8); scene.add(lb);
    for (let i = 0; i < 9; i++) U.box(0.04, 0.35, 0.5, [0xe74c3c, 0x27ae60, 0xf1c40f][i % 3], 19.67, 1.5 + (i % 3) * 0.55, -1.8 + Math.floor(i / 3) * 1.6, scene);
    // palettes décoratives
    for (const [x, z] of [[17, -12], [17.5, 12.5], [-6, 12.8]]) U.box(1.2, 0.15, 1, T.mat('bois', 1, 1), x, 0.08, z, scene);
  };

  /* ---------- Machines (rendu ; la logique est dans sim.js) ---------- */
  W.machinesBuild = () => {
    for (const def of ML.MACHINES) {
      const g = new THREE.Group(); g.position.set(def.x, 0, def.z); scene.add(g);
      const m = { def, group: g, lightMat: new THREE.MeshLambertMaterial({ color: 0x777777, emissive: 0x222222 }) };
      const paint = U.mat(0xdfe6ec), dark = U.mat(0x223344);
      if (def.type === 'fraiseuse') {
        U.box(2.25, 0.4, 2.25, 0x34495e, 0, 0.2, 0, g); U.box(2.2, 2.2, 2.2, paint, 0, 1.5, 0, g);
        U.box(1.2, 0.9, 0.04, dark, 0, 1.5, -1.12, g); U.box(0.25, 0.9, 0.55, 0x2c3e50, 1.25, 1.5, -0.6, g);
        U.box(0.03, 0.3, 0.4, U.mat(0x2ecc71, 0x145a32), 1.39, 1.65, -0.6, g);
        U.box(2.2, 0.15, 0.05, 0xf1c40f, 0, 0.45, -1.13, g);
        m.spinner = U.cyl(0.25, 0.25, 0.5, 0x95a5a6, 0, 2.85, 0.2, g, 8);
        const L = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), m.lightMat); L.position.set(0.85, 2.75, -0.85); g.add(L);
        U.boxCollider(def.x, def.z, 2.3, 2.3, 'machine');
        m.station = { x: def.x, z: def.z - 1.85, yaw: 0 };
      } else {
        const len = def.len;
        U.box(len, 0.9, 1.3, 0x34495e, 0, 0.45, 0, g); U.box(len * 0.85, 1.2, 1.2, paint, -len * 0.05, 1.55, 0, g);
        U.box(len * 0.45, 0.6, 0.04, dark, -len * 0.12, 1.6, 0.62, g); U.box(len, 0.12, 0.05, 0xf1c40f, 0, 0.95, 0.66, g);
        m.spinner = U.cyl(0.28, 0.28, 0.35, 0x95a5a6, -len * 0.32, 1.5, 0.82, g, 8); m.spinner.rotation.z = Math.PI / 2;
        U.box(0.55, 0.9, 0.25, 0x2c3e50, len * 0.42, 1.55, 0.72, g); U.box(0.4, 0.3, 0.03, U.mat(0x2ecc71, 0x145a32), len * 0.42, 1.7, 0.86, g);
        const L = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), m.lightMat); L.position.set(len * 0.42, 2.3, 0.3); g.add(L);
        U.boxCollider(def.x, def.z, len, 1.4, 'machine');
        m.station = { x: def.x, z: def.z + 1.55, yaw: Math.PI };
      }
      m.label = U.label(def.id, { size: 0.4 }); m.label.position.set(0, 3.5, 0); g.add(m.label);
      const front = def.type === 'fraiseuse' ? def.z - 1.3 : def.z + 0.9;
      W.targets.push({ id: 'mach:' + def.id, x: def.x + (def.type === 'fraiseuse' ? 0.6 : 0.9), y: 1.2, z: front, r: 2.6 });
      W.machines[def.id] = m;
    }
  };

  /** Met à jour voyants, broches et étiquettes des machines selon l'état réplique */
  W.updateVisuals = (dt, S) => {
    if (!S) return;
    for (const id in W.machines) {
      const m = W.machines[id], st = S.machines[id] || {}, j = st.job, op = ML.PEOPLE[m.def.op];
      const status = st.status || 'idle';
      const col = { idle: 0x777777, wait: 0xff9f1a, run: 0x2ecc71, stop: 0xf1c40f }[status] || 0x777777;
      m.lightMat.color.setHex(col); m.lightMat.emissive.setHex(status === 'idle' ? 0x111111 : col).multiplyScalar(0.6);
      if (status === 'run') { if (m.def.type === 'fraiseuse') m.spinner.rotation.y += dt * 25; else m.spinner.rotation.x += dt * 25; }
      let t = `${id} ${ML.MTYPE[m.def.type]} · ${op.name.split(' ')[0]}`;
      if (j) t = `${id} · #${j.oid} ` + (!j.tool ? `→ ${ML.TOOLS[j.need].label} ?` : `${Math.floor(100 * j.prog / j.total)}%` + (status === 'stop' ? ' · opérateur absent !' : ''));
      m.label.setText(t, status === 'run' ? '#9dffb8' : status === 'wait' ? '#ffd27a' : status === 'stop' ? '#ff9f9f' : '#dddddd');
    }
    for (const k in W.rackLabels) { const n = S.stock[k]; W.rackBars[k].forEach((b, i) => (b.visible = i < n)); W.rackLabels[k].setText(`${ML.MATERIALS[k].label} : ${n}`, n ? '#fff' : '#ff6b6b'); }
    for (const k in W.drawerLabels) { const n = S.stock[k]; W.drawerLabels[k].setText(`${ML.TOOLS[k].label} : ${n}`, n ? '#fff' : '#ff6b6b'); }
  };

  /* ---------- Entreprises ---------- */
  function signTexture(name, sub, bg, fg) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 1024, 256); x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 8; x.strokeRect(8, 8, 1008, 240);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = 110; x.font = `bold ${fs}px Arial`; while (x.measureText(name).width > 960) { fs -= 4; x.font = `bold ${fs}px Arial`; }
    x.fillText(name, 512, sub ? 105 : 128);
    if (sub) { x.font = '44px Arial'; x.globalAlpha = 0.85; x.fillText(sub, 512, 200); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  W.company = (key, C) => {
    const g = new THREE.Group(); g.position.set(C.x, 0, C.z); scene.add(g);
    const tex = { tole: T.mat('tole', C.w / 3, 2, C.color), brique: T.mat('brique', C.w / 5, C.h / 4, C.color), beton: T.mat('beton', C.w / 5, C.h / 4, C.color) }[C.wall];
    U.box(C.w, C.h, C.d, tex, 0, C.h / 2, 0, g);
    U.box(C.w + 0.8, 0.5, C.d + 0.8, C.roof, 0, C.h + 0.25, 0, g);
    U.box(C.w + 0.2, 0.6, C.d + 0.2, 0x555555, 0, 0.3, 0, g);                       // soubassement
    U.boxCollider(C.x, C.z, C.w, C.d, 'building');
    ML.mapRects.push({ x: C.x, z: C.z, w: C.w, d: C.d, c: '#' + new THREE.Color(C.roof).getHexString(), name: C.name.split(' ')[0] });
    const f = C.face, fz = f * (C.d / 2 + 0.06);
    // façade côté quai : rideau métallique, porte, fenêtres
    const roll = U.box(6, 4.6, 0.12, T.mat('tole', 3, 1, 0x95a5a6), -C.w / 2 + 5, 2.3, fz, g); roll.rotation.y = Math.PI / 2 * 0;
    U.box(1.2, 2.2, 0.12, 0x5d4037, C.w / 2 - 3, 1.1, fz, g);
    for (let x = -C.w / 2 + 10; x < C.w / 2 - 4.5; x += 2.6) U.box(1.6, 1.2, 0.08, U.mat(0x9fd3ff, 0x1d3b50), x, C.h * 0.55, fz, g, false);
    // enseigne
    const st = signTexture(C.name, C.sub || '', '#' + new THREE.Color(C.roof).getHexString(), '#ffffff');
    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(C.w * 0.8, 18), 2.6, 0.3), [U.mat(0x333333), U.mat(0x333333), U.mat(0x333333), U.mat(0x333333),
      new THREE.MeshLambertMaterial({ map: st }), new THREE.MeshLambertMaterial({ map: st })]);
    sign.position.set(0, C.h + 1.9, f * (C.d / 2 - 0.5)); if (f < 0) sign.rotation.y = Math.PI; g.add(sign);
    // quai
    const dockZ = C.z + f * (C.d / 2 + 1.9);
    U.plane(12, 3.6, T.mat('quai', 3, 1), C.x - 1, dockZ, 0.05);
    ML.LOC.comp[key] = { dock: { x: C.x - 1, z: dockZ }, npc: { x: C.x + 6, z: dockZ, yaw: f > 0 ? 0 : Math.PI }, face: f };
    ML.LOC.hides.push({ x: C.x + rng.range(-C.w / 3, C.w / 3), z: C.z - f * (C.d / 2 + 1.6) });
    // détails selon le métier
    const side = -f * (C.d / 4);
    switch (C.kind) {
      case 'matiere': for (let i = 0; i < 6; i++) { const b = U.cyl(0.15, 0.15, 6, [0x8c9199, 0xdfe5ea, 0x9fc1d8][i % 3], C.w / 2 + 1.5, 0.2 + Math.floor(i / 3) * 0.32, side + (i % 3) * 0.35, g); b.rotation.x = Math.PI / 2; } U.boxCollider(C.x + C.w / 2 + 1.5, C.z + side, 0.8, 6, 'stock'); break;
      case 'outils': { const m = U.cyl(0.6, 0.6, 3.5, 0x3fa7ff, 0, C.h + 2.6, -f * 2, g, 8); m.rotation.z = 0.3; g.userData.spin = m; break; }
      case 'fonderie': case 'tth': { U.cyl(0.9, 1.1, 9, 0x5d4037, C.w / 2 - 3, C.h + 4.5, -f * (C.d / 2 - 3), g); U.cyl(0.95, 0.95, 0.6, U.mat(0xff7a1a, 0xff4400), C.w / 2 - 3, C.h + 9.2, -f * (C.d / 2 - 3), g); break; }
      case 'chaudro': for (let i = 0; i < 3; i++) { U.box(0.15, 2.5, 0.15, 0x5d6d7e, C.w / 2 + 1 + i * 1.2, 1.25, side, g); U.box(1.3, 0.15, 0.15, 0x5d6d7e, C.w / 2 + 1.6 + i * 1.2, 2.4, side, g); } break;
      case 'client': { U.box(0.12, 7, 0.12, 0xdddddd, -C.w / 2 - 2, 3.5, f * (C.d / 2 + 3), g); const fl = U.box(2, 1.2, 0.05, C.roof, -C.w / 2 - 1, 6.3, f * (C.d / 2 + 3), g); g.userData.flag = fl; break; }
      case 'boulangerie': for (let i = 0; i < 6; i++) U.box(C.w / 6, 0.12, 1.6, i % 2 ? 0xffffff : 0xc0392b, -C.w / 2 + C.w / 12 + i * C.w / 6, 3.2, f * (C.d / 2 + 0.8), g).rotation.x = f * 0.35; break;
    }
    // poubelles / bennes KayKit
    place('city_dumpster', 3.2, C.x + C.w / 2 + 1.8, C.z + f * (C.d / 2 - 2), Math.PI / 2, true);
  };

  /* ---------- Décor de ville (KayKit + arbres) ---------- */
  /** Pose un modèle KayKit et ajoute une collision ajustée à sa taille réelle */
  function place(name, scale, x, z, ry, collide, y) {
    const o = A.clone(name, scale); if (!o) return null;
    o.position.set(x, y || 0, z); o.rotation.y = ry || 0; scene.add(o);
    if (collide) { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); U.addCollider(b.min.x, b.max.x, b.min.z, b.max.z, name); }
    return o;
  }
  function reserved(x, z, half) {
    if (x > -34 - half && x < 34 + half && z > -26 - half && z < 30 + half) return true;              // atelier + parvis
    if (Math.abs(x) < 12 + half) return true;                                                            // route principale
    if (ROADS_Z.some(r => Math.abs(z - r) < 10 + half)) return true;                                     // transversales
    for (const k in ML.COMPANIES) { const C = ML.COMPANIES[k]; if (Math.abs(x - C.x) < C.w / 2 + 8 + half && Math.abs(z - C.z) < C.d / 2 + 10 + half) return true; }
    return x < -165 + half || x > 165 - half || z < -36 + half || z > 326 - half;
  }
  W.decor = () => {
    const blds = ['city_building_A', 'city_building_B', 'city_building_C', 'city_building_D', 'city_building_E', 'city_building_F', 'city_building_G', 'city_building_H'];
    // immeubles le long des routes
    const spots = [];
    for (let z = 36; z < 322; z += 21) for (const x of [-22, 22]) spots.push([x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2]);
    for (const rz of ROADS_Z) for (let x = -158; x <= 158; x += 21) for (const dz of [-21, 21]) spots.push([x, rz + dz, dz < 0 ? 0 : Math.PI]);
    for (const [x, z, ry] of spots) {
      if (reserved(x, z, 7) || rng() < 0.18) continue;
      const name = rng.pick(blds), b = A.clone(name, 7.5);
      if (b) { b.position.set(x, 0, z); b.rotation.y = ry; scene.add(b); }
      else U.box(14, 12, 14, T.mat('brique', 3, 3, rng.pick([0xf6e58d, 0xffbe76, 0xdff9fb, 0xc7ecee])), x, 6, z, scene);
      U.boxCollider(x, z, 15, 15, 'city'); ML.mapRects.push({ x, z, w: 15, d: 15, c: '#8e7f74' });
    }
    // lampadaires
    const lampHead = new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0x000000 }); W.lampMat = lampHead;
    const lamp = (x, z, ry) => {
      const l = A.clone('city_streetlight', 6);
      if (l) { l.position.set(x, 0, z); l.rotation.y = ry; scene.add(l); }
      else U.box(0.15, 5.5, 0.15, 0x444444, x, 2.75, z, scene);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), lampHead);
      h.position.set(x + Math.cos(ry) * -1.3, 5.6, z + Math.sin(ry) * 1.3); scene.add(h);
      U.boxCollider(x, z, 0.3, 0.3, 'lamp');
    };
    for (let z = 32; z < 326; z += 26) if (!ROADS_Z.some(r => Math.abs(z - r) < 10)) { lamp(-9.4, z, Math.PI); lamp(9.4, z, 0); }
    for (const rz of ROADS_Z) for (let x = -150; x < 160; x += 30) if (Math.abs(x) > 14) { lamp(x, rz - 8.4, Math.PI / 2); lamp(x + 15, rz + 8.4, -Math.PI / 2); }
    // feux tricolores aux carrefours
    for (const rz of ROADS_Z) for (const [dx, dz, ry] of [[-8.6, -8.6, 0], [8.6, 8.6, Math.PI]]) {
      place('city_trafficlight_A', 5, dx, rz + dz, ry, false);
    }
    // voitures garées
    const cars = ['city_car_hatchback', 'city_car_sedan', 'city_car_stationwagon', 'city_car_taxi', 'city_car_police'];
    for (let z = 34; z < 320; z += 17) for (const x of [-11.2, 11.2]) {
      if (rng() < 0.55 || ROADS_Z.some(r => Math.abs(z - r) < 13)) continue;
      place(rng.pick(cars), 4.6, x, z, x < 0 ? 0 : Math.PI, true, 0.33);
    }
    // petits objets : bouches à incendie, bancs, poubelles, buissons
    for (let i = 0; i < 70; i++) {
      const x = rng.range(-160, 160), z = rng.range(-30, 320);
      if (Math.abs(x) < 10 || ROADS_Z.some(r => Math.abs(z - r) < 9) || U.inCollider(x, z, 2) || (Math.abs(x) < 30 && z < 28 && z > -26)) continue;
      const m = A.clone('city_bush', rng.range(4, 7));
      if (m) { m.position.set(x, 0, z); m.rotation.y = rng() * 6; scene.add(m); }
    }
    for (let z = 40; z < 320; z += 34) { const h = A.clone('city_firehydrant', 2.4); if (h) { h.position.set(-7.6, 0, z + 5); scene.add(h); } }
    for (const [x, z] of [[-18, 55], [-30, 55]]) place('city_bench', 3, x, z, 0, true);
    // château d'eau (cachette classique)
    if (!place('city_watertower', 9, -110, 150, 0, true)) { U.cyl(4, 4, 6, 0x95a5a6, -110, 14, 150, scene); U.boxCollider(-110, 150, 4, 4, 'tower'); }
    ML.LOC.hides.push({ x: -107, z: 153 }, { x: 120, z: 40 }, { x: -140, z: 250 }, { x: 140, z: 300 }, { x: -25, z: 140 }, { x: 25, z: 235 });
    // arbres stylisés
    let n = 0;
    for (let tries = 0; tries < 900 && n < 120; tries++) {
      const x = rng.range(-165, 165), z = rng.range(-35, 325);
      if (reserved(x, z, -4)) continue;
      if (Math.abs(x) < 12 || ROADS_Z.some(r => Math.abs(z - r) < 10) || U.inCollider(x, z, 3)) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      U.cyl(0.22, 0.3, 2.2, 0x6d4c41, 0, 1.1, 0, g, 6);
      const k = rng.range(0.9, 1.5), col = rng.pick([0x2d6a4f, 0x40916c, 0x52b788, 0x588157]);
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * k - i * 0.25, 0), U.mat(col)); b.position.set(rng.range(-0.4, 0.4), 2.4 + i * 1.05 * k, rng.range(-0.4, 0.4)); b.castShadow = true; g.add(b); }
      scene.add(g); U.boxCollider(x, z, 0.6, 0.6, 'tree'); n++;
    }
    // filtre : cachettes hors collision
    ML.LOC.hides = ML.LOC.hides.filter(h => !U.inCollider(h.x, h.z, 0.5));
  };

  W.bounds = () => {
    U.addCollider(-200, -170, -80, 360, 'bound'); U.addCollider(170, 200, -80, 360, 'bound');
    U.addCollider(-200, 200, -80, -40, 'bound'); U.addCollider(-200, 200, 330, 360, 'bound');
  };

  /** Jour / soir : lampadaires allumés quand k < 0.6 */
  W.setDaylight = k => { if (W.lampMat) W.lampMat.emissive.setHex(k < 0.6 ? 0xffd27a : 0x000000); };

  /** Position d'une cible fixe (pour l'hôte : contrôle de distance) */
  W.target = id => W.targets.find(t => t.id === id);
})();
