/* =====================================================================
   world.js — Construction 3D du monde à partir de la ville générée
   (citygen.js). Le monde est RECONSTRUIT à chaque partie (nouvelle
   graine) : World.build(seed, upgrades). Tout est rangé dans World.root
   pour pouvoir le supprimer d'un coup.
   ===================================================================== */
(function () {
  const W = ML.World = { targets: [], machines: {}, root: null };
  const U = ML.U, T = ML.Tex, A = ML.Assets;
  let root, rng;

  W.build = (seed, upgrades) => {
    if (W.root) { ML.scene.remove(W.root); }
    root = W.root = new THREE.Group(); ML.scene.add(root);
    ML.colliders.length = 0; W.targets = []; W.machines = {}; W.radars = []; W.lights = []; W.lampHeads = null;
    ML.mapRects = []; W.up = upgrades || {};
    rng = U.rng(seed ^ 0x5bd1e995);
    const city = W.city = ML.CityGen.generate(seed);
    ML.LOC = { comp: city.companies, hides: city.hides.slice(), perches: city.perches, radars: city.radars };
    W.ground(city); W.atelier(); W.furniture(); W.machinesBuild();
    for (const k in city.companies) W.company(k, ML.COMPANIES[k], city.companies[k]);
    W.decor(city); W.bounds();
    ML.LOC.hides = ML.LOC.hides.filter(h => !U.inCollider(h.x, h.z, 0.5));
  };
  const add = o => { root.add(o); return o; };
  const plane = (w, d, mat, x, z, y) => U.plane(w, d, mat, x, z, y, root);

  /* ---------- Sol et routes ---------- */
  W.ground = city => {
    const M = ML.CFG.MAP;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(M.maxX - M.minX + 60, M.maxZ - M.minZ + 60), T.mat('herbe', 70, 76));
    g.rotation.x = -Math.PI / 2; g.position.set((M.minX + M.maxX) / 2, 0, (M.minZ + M.maxZ) / 2); g.receiveShadow = true; add(g);
    const N = city.nodes, RW = city.RW, asph = T.mat('asphalte', 1, 1), walk = T.mat('beton', 1, 1, 0xd0d0d0);
    const dashes = [];
    city.edges.forEach((e, i) => {
      const A1 = N[e.a], B = N[e.b], dx = (B.x - A1.x) / e.len, dz = (B.z - A1.z) / e.len, ang = Math.atan2(-dz, dx);
      const geo = new THREE.PlaneGeometry(e.len, RW * 2); geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * e.len / 12, uv.getY(k));
      const m = new THREE.Mesh(geo, asph); m.rotation.y = ang; m.position.set((A1.x + B.x) / 2, 0.02 + i * 0.0003, (A1.z + B.z) / 2); m.receiveShadow = true; add(m);
      if (e.len > 20) for (const s of [-1, 1]) {
        const sg = new THREE.PlaneGeometry(e.len - RW * 2 - 4, 1.8); sg.rotateX(-Math.PI / 2);
        const sm = new THREE.Mesh(sg, walk); sm.rotation.y = ang; sm.position.set((A1.x + B.x) / 2 - dz * s * (RW + 0.9), 0.035, (A1.z + B.z) / 2 + dx * s * (RW + 0.9)); sm.receiveShadow = true; add(sm);
      }
      for (let t = RW + 3; t < e.len - RW - 3; t += 8) dashes.push([A1.x + dx * t, A1.z + dz * t, ang]);
      ML.mapRects.push({ line: [A1.x, A1.z, B.x, B.z] });
    });
    for (const n of N) { const c = new THREE.Mesh(new THREE.CircleGeometry(n.cul ? RW + 3.5 : RW + 0.4, 20), asph); c.rotation.x = -Math.PI / 2; c.position.set(n.x, 0.03, n.z); c.receiveShadow = true; add(c); }
    const dm = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, 0.22).rotateX(-Math.PI / 2), U.mat(0xeeeeee), dashes.length), o = new THREE.Object3D();
    dashes.forEach(([x, z, a], i) => { o.position.set(x, 0.04, z); o.rotation.set(0, a, 0); o.updateMatrix(); dm.setMatrixAt(i, o.matrix); }); add(dm);
    plane(30, 14, T.mat('beton', 7, 3), 0, 21, 0.025);
  };

  /* ---------- Atelier ---------- */
  function wall(x1, z1, x2, z2, h, mat, t) {
    t = t || 0.4; const w = Math.abs(x2 - x1) || t, d = Math.abs(z2 - z1) || t;
    U.box(w, h, d, mat, (x1 + x2) / 2, h / 2, (z1 + z2) / 2, root); U.boxCollider((x1 + x2) / 2, (z1 + z2) / 2, w, d, 'wall');
  }
  W.atelier = () => {
    ML.mapRects.push({ x: 0, z: 0, w: 40, d: 28, c: '#a2a8ad', name: 'ATELIER' });
    plane(40, 28, T.mat('sol', 10, 7), 0, 0, 0.03);
    const wm = T.mat('bardage', 6, 1.5, 0xc9d1d8);
    wall(-20.2, -14, 20.2, -14, 7, wm); wall(-20, -14, -20, 14, 7, wm); wall(20, -14, 20, 14, 7, wm);
    wall(-20.2, 14, -5, 14, 7, wm); wall(5, 14, 20.2, 14, 7, wm);
    U.box(10, 2.5, 0.4, wm, 0, 5.75, 14, root);
    U.cyl(0.45, 0.45, 10, 0x7f8c8d, 0, 4.3, 14.15, root).rotation.z = Math.PI / 2;
    U.box(40.8, 0.3, 28.8, T.mat('tole', 8, 6, 0x7f8c8d), 0, 7.15, 0, root);
    U.box(40.9, 0.8, 0.1, 0x24457a, 0, 6.3, 14.25, root);
    const sign = U.label('MÉCANIQUE LEBEC — Usinage de précision', { size: 1.1, color: '#ffd257', bg: 'rgba(20,30,60,0.92)' }); sign.position.set(0, 8.3, 14.6); add(sign);
    W.neonMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdddddd });
    for (let x = -14; x <= 14; x += 7) for (const z of [-8, 0, 8]) U.box(2.6, 0.08, 0.3, W.neonMat, x, 6.9, z, root, false);
    W.inLights = [new THREE.PointLight(0xfff4e0, 0.35, 34), new THREE.PointLight(0xfff4e0, 0.25, 30)];
    W.inLights[0].position.set(-6, 6, 0); W.inLights[1].position.set(10, 6, 0); W.inLights.forEach(add);
    plane(36, 0.14, 0xf1c40f, -2, -3.5, 0.04); plane(36, 0.14, 0xf1c40f, -2, 1.4, 0.04);
    plane(7, 4.6, 0x2e86de, -12.5, 10.3, 0.045); plane(7, 4.6, 0x27ae60, 11.5, 10.3, 0.045);
    const l1 = U.label('RÉCEPTION : caisses matière / outils', { size: 0.42, color: '#bfe0ff' }); l1.position.set(-12.5, 2.6, 10.3); add(l1);
    const l2 = U.label('EXPÉDITION : caisses usinées', { size: 0.42, color: '#b6ffcb' }); l2.position.set(11.5, 2.6, 10.3); add(l2);
    Object.assign(ML.LOC, {
      reception: { x: -12.5, z: 10.3 }, expedition: { minX: 8.4, maxX: 14.6, minZ: 8.4, maxZ: 12.3 },
      coffee: [{ x: -18.3, z: 9.5 }, { x: -17, z: 11.8 }, { x: -16.5, z: 9.7 }],
      patrol: [{ x: 8, z: -1 }, { x: 0, z: -1.2 }, { x: -8, z: -1.2 }, { x: -16, z: -1 }, { x: 12, z: -6 }, { x: 14, z: 5 }, { x: 0, z: 6 }],
      carSpawn: [{ x: -5, z: 21, h: 0 }, { x: 5, z: 21, h: 0 }, { x: 12, z: 21, h: 0 }, { x: -12, z: 21, h: 0 }, { x: 0, z: 26, h: 0 }],
      tpSpawn: { x: 2, z: 10, h: Math.PI },
      spawn: [{ x: 8, z: 2 }, { x: 10, z: 2 }, { x: 8, z: 4 }, { x: 10, z: 4 }, { x: 12, z: 3 }],
      hooks: [{ type: 'extincteur', x: -19.2, y: 0, z: 2.6 }, { type: 'extincteur', x: 19.2, y: 0, z: -11.5 }, { type: 'cle', x: -19.2, y: 0.95, z: 4.6 },
              { type: 'cle', x: -19.2, y: 0.95, z: 5.4 }, { type: 'soufflette', x: -19.2, y: 0.95, z: 6.3 }, { type: 'soufflette', x: -19.2, y: 0.95, z: 7.1 }],
      doorIn: { x: 0, z: 12 },
      bigZone: { minX: 18, maxX: 30, minZ: 15.5, maxZ: 19 },         // quai gros colis (palettes)
      fenSpawn: { x: 22, z: 23, h: Math.PI }, camSpawn: { x: 28, z: 25, h: 0 },
      benne: { x: -13, z: 19.5 }
    });
    // quai gros colis (à droite de la porte) + benne à copeaux (à gauche)
    plane(18, 13, T.mat('beton', 4, 3, 0xbfbfbf), 24, 21, 0.026); plane(12, 3.5, 0xe67e22, 24, 17.2, 0.04);
    const l3 = U.label('QUAI GROS COLIS : palettes (fenwick → camion)', { size: 0.45, color: '#ffd9a8' }); l3.position.set(24, 3, 17.2); add(l3);
    { const g = add(new THREE.Group()); g.position.set(-13, 0, 19.5);
      U.box(4, 1.6, 2.2, 0x1e7d4a, 0, 0.8, 0, g); U.box(4.2, 0.12, 2.4, 0x145c36, 0, 1.62, 0, g); U.box(3.6, 0.3, 1.8, 0xb0b7bf, 0, 1.5, 0, g);
      U.boxCollider(-13, 19.5, 4, 2.2, 'benne'); W.targets.push({ id: 'benne', x: -13, y: 1.4, z: 19.5, r: 3.4 });
      const l = U.label('BENNE À COPEAUX', { size: 0.4, color: '#b6ffcb' }); l.position.set(0, 2.5, 0); g.add(l); }
  };

  W.furniture = () => {
    const racks = { acier: -16, alu: -12, inox: -8 };
    W.rackBars = {}; W.rackLabels = {};
    for (const m in racks) {
      const x = racks[m], z = -13.1, g = add(new THREE.Group()); g.position.set(x, 0, z);
      for (const dx of [-1.2, 1.2]) U.box(0.1, 2.2, 0.8, 0x2c3e50, dx, 1.1, 0, g);
      for (const y of [0.5, 1.2, 1.9]) U.box(2.5, 0.06, 0.8, 0xe67e22, 0, y, 0, g);
      W.rackBars[m] = [];
      for (let i = 0; i < 9; i++) { const b = U.cyl(0.07, 0.07, 2.1, ML.MATERIALS[m].color, 0, 0.6 + Math.floor(i / 3) * 0.7, -0.25 + (i % 3) * 0.25, g); b.rotation.z = Math.PI / 2; W.rackBars[m].push(b); }
      const l = U.label('', { size: 0.36 }); l.position.set(0, 2.7, 0.3); g.add(l); W.rackLabels[m] = l;
      U.boxCollider(x, z, 2.6, 0.9, 'rack'); W.targets.push({ id: 'rack:' + m, x, y: 1.2, z: z + 0.6, r: 2.8 });
    }
    U.box(4.4, 1.3, 0.8, 0xc0392b, 2, 0.65, -13.3, root); U.boxCollider(2, -13.3, 4.4, 0.8, 'cabinet');
    W.drawerLabels = {};
    [['plaquette', 0.7], ['fraise', 2], ['foret', 3.3]].forEach(([t, x]) => {
      U.box(1.1, 0.35, 0.05, ML.TOOLS[t].color, x, 0.95, -12.88, root);
      const l = U.label('', { size: 0.22 }); l.position.set(x, 1.7, -12.8); add(l); W.drawerLabels[t] = l;
      W.targets.push({ id: 'tool:' + t, x, y: 1.0, z: -12.7, r: 2.4 });
    });
    // panneau d'outillage (extincteurs, clés, soufflettes)
    U.box(0.1, 2.2, 6, 0x8d6e63, -19.75, 1.6, 4.8, root); U.box(0.5, 0.08, 3.2, 0x5d4037, -19.5, 0.9, 5.8, root);
    const lo = U.label('Extincteurs · clés · soufflettes', { size: 0.26 }); lo.position.set(-19.3, 3, 4.8); add(lo);
    // coin café (+ améliorations)
    U.box(0.8, 1.8, 0.7, W.up.cafe_pro ? 0x95a5a6 : 0x4e342e, -19.3, 0.9, 12.5, root); U.box(3, 0.45, 0.6, 0x8d6e63, -17, 0.23, 13.3, root);
    U.boxCollider(-19.3, 12.5, 0.8, 0.7, 'coffee'); U.boxCollider(-17, 13.3, 3, 0.6, 'bench');
    const lc = U.label(W.up.cafe_pro ? '☕ Café PRO (sprint 90 s)' : '☕ Café (sprint +)', { size: 0.3 }); lc.position.set(-18.8, 2.3, 12.5); add(lc);
    W.targets.push({ id: 'coffee', x: -19.3, y: 1.2, z: 12.5, r: 2.4 }, { id: 'reception', x: -12.5, y: 0.8, z: 10.3, r: 4.2 });
    // bureau du chef, imprimante, PC, marbre, tableau électrique, boîte de casques
    U.box(2.4, 0.8, 1.2, 0x5d4037, 12, 0.4, -8, root); U.boxCollider(12, -8, 2.4, 1.2, 'desk');
    const lb = U.label('Bureau du chef', { size: 0.3 }); lb.position.set(12, 1.9, -8); add(lb);
    U.box(0.8, 0.8, 0.7, 0x95a5a6, 15, 0.4, -8, root); U.box(0.7, 0.35, 0.6, 0xecf0f1, 15, 0.98, -8, root); U.boxCollider(15, -8, 0.8, 0.7, 'printer');
    W.targets.push({ id: 'printer', x: 15, y: 1, z: -7.5, r: 2.4 });
    U.box(1.6, 0.8, 0.9, 0x6d4c41, 18.6, 0.4, 6.5, root); U.box(0.06, 0.5, 0.8, 0x111111, 18.9, 1.1, 6.5, root); U.box(0.02, 0.42, 0.7, U.mat(0x2e86de, 0x1b4f8a), 18.85, 1.1, 6.5, root);
    U.boxCollider(18.6, 6.5, 1.6, 0.9, 'pc'); const lp = U.label('PC (Arexis)', { size: 0.26 }); lp.position.set(18.6, 1.8, 6.5); add(lp);
    W.targets.push({ id: 'pc', x: 18.4, y: 1.1, z: 6.5, r: 2.4 });
    U.box(2.2, 0.9, 1.4, 0x2d3436, 12, 0.45, 2.5, root); U.boxCollider(12, 2.5, 2.2, 1.4, 'marbre');
    const lm = U.label('MARBRE : contrôle des caisses', { size: 0.3 }); lm.position.set(12, 1.9, 2.5); add(lm);
    W.targets.push({ id: 'marbre', x: 12, y: 1, z: 3.4, r: 2.6 });
    U.box(0.15, 1.2, 0.9, 0x7f8c8d, 19.85, 1.6, -3, root); W.panelLight = U.box(0.05, 0.15, 0.15, U.mat(0x2ecc71, 0x2ecc71), 19.75, 2.0, -3, root, false);
    const le = U.label('⚡ Tableau électrique', { size: 0.26 }); le.position.set(19.4, 2.6, -3); add(le);
    W.targets.push({ id: 'panel', x: 19.6, y: 1.6, z: -3, r: 2.6 });
    U.box(1, 0.5, 0.6, 0xf1c40f, -7, 0.25, 13, root); U.boxCollider(-7, 13, 1, 0.6, 'casques');
    const lk = U.label('Casques', { size: 0.24 }); lk.position.set(-7, 1, 13); add(lk);
    W.targets.push({ id: 'casques', x: -7, y: 0.6, z: 12.4, r: 2.4 });
    // améliorations de décoration (campagne)
    if (W.up.babyfoot) { U.box(1.4, 0.9, 0.8, 0x27ae60, -18, 0.45, -9.5, root); U.boxCollider(-18, -9.5, 1.4, 0.8, 'babyfoot'); }
    if (W.up.frigo) { U.box(0.8, 1.9, 0.8, 0xecf0f1, -19.3, 0.95, 8.4, root); U.boxCollider(-19.3, 8.4, 0.8, 0.8, 'frigo'); W.targets.push({ id: 'frigo', x: -19, y: 1, z: 8.4, r: 2.4 }); }
    if (W.up.plantes) for (const [x, z] of [[19, 13], [-19, -13.3], [19, -13.3]]) { U.cyl(0.35, 0.25, 0.6, 0x8d6e63, x, 0.3, z, root); const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), U.mat(0x27ae60)); p.position.set(x, 1.1, z); add(p); }
    if (W.up.posters) for (const z of [-6, 6]) { const p = U.label('LEBEC VOUS REGARDE', { size: 0.5, color: '#ffd257', bg: 'rgba(36,69,122,0.95)' }); p.position.set(-19.7, 3.6, z); add(p); }
  };

  /* ---------- Machines ---------- */
  W.machinesBuild = () => {
    for (const def of ML.MACHINES) {
      if (def.upgrade && !W.up[def.upgrade]) continue;
      const g = add(new THREE.Group()); g.position.set(def.x, 0, def.z);
      const m = { def, group: g, lightMat: new THREE.MeshLambertMaterial({ color: 0x777777, emissive: 0x222222 }) };
      const paint = U.mat(0xdfe6ec), dark = U.mat(0x223344);
      if (def.type === 'fraiseuse') {
        U.box(2.25, 0.4, 2.25, 0x34495e, 0, 0.2, 0, g); U.box(2.2, 2.2, 2.2, paint, 0, 1.5, 0, g);
        U.box(1.2, 0.9, 0.04, dark, 0, 1.5, -1.12, g); U.box(0.25, 0.9, 0.55, 0x2c3e50, 1.25, 1.5, -0.6, g);
        U.box(2.2, 0.15, 0.05, 0xf1c40f, 0, 0.45, -1.13, g);
        m.spinner = U.cyl(0.25, 0.25, 0.5, 0x95a5a6, 0, 2.85, 0.2, g, 8);
        const L = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), m.lightMat); L.position.set(0.85, 2.75, -0.85); g.add(L);
        U.boxCollider(def.x, def.z, 2.3, 2.3, 'machine');
        m.station = { x: def.x, z: def.z - 1.85, yaw: 0 }; m.chips = { x: def.x + 1.6, z: def.z - 1.4 };
      } else {
        const len = def.len;
        U.box(len, 0.9, 1.3, 0x34495e, 0, 0.45, 0, g); U.box(len * 0.85, 1.2, 1.2, paint, -len * 0.05, 1.55, 0, g);
        U.box(len * 0.45, 0.6, 0.04, dark, -len * 0.12, 1.6, 0.62, g); U.box(len, 0.12, 0.05, 0xf1c40f, 0, 0.95, 0.66, g);
        m.spinner = U.cyl(0.28, 0.28, 0.35, 0x95a5a6, -len * 0.32, 1.5, 0.82, g, 8); m.spinner.rotation.z = Math.PI / 2;
        U.box(0.55, 0.9, 0.25, 0x2c3e50, len * 0.42, 1.55, 0.72, g);
        const L = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), m.lightMat); L.position.set(len * 0.42, 2.3, 0.3); g.add(L);
        U.boxCollider(def.x, def.z, len, 1.4, 'machine');
        m.station = { x: def.x, z: def.z + 1.55, yaw: Math.PI }; m.chips = { x: def.x + len / 2 + 0.3, z: def.z + 1.2 };
      }
      m.smoke = U.box(0.6, 0.6, 0.6, U.mat(0x555555), 0, 3.2, 0, g, false); m.smoke.visible = false;
      m.label = U.label(def.id, { size: 0.4 }); m.label.position.set(0, 3.7, 0); g.add(m.label);
      const front = def.type === 'fraiseuse' ? def.z - 1.3 : def.z + 0.9;
      W.targets.push({ id: 'mach:' + def.id, x: def.x + (def.type === 'fraiseuse' ? 0.6 : 0.9), y: 1.2, z: front, r: 2.6 });
      W.targets.push({ id: 'bac:' + def.id, x: m.chips.x, y: 0.5, z: m.chips.z, r: 1.9 });
      W.machines[def.id] = m;
    }
  };

  W.updateVisuals = (dt, S, rt) => {
    if (!S) return;
    const t = performance.now() / 1000;
    for (const id in W.machines) {
      const m = W.machines[id], st = S.machines[id] || {}, j = st.job, opId = st.op, op = ML.PEOPLE[opId] || { name: '?' };
      const status = st.status || 'idle';
      const col = { idle: 0x777777, wait: 0xff9f1a, run: 0x2ecc71, stop: 0xf1c40f, panne: 0xe74c3c, usure: 0xe67e22, off: 0x222222 }[status] || 0x777777;
      const blink = (status === 'panne' || status === 'usure') && Math.floor(t * 3) % 2;
      m.lightMat.color.setHex(col); m.lightMat.emissive.setHex(status === 'idle' || status === 'off' || blink ? 0x111111 : col).multiplyScalar(0.6);
      if (status === 'run') { if (m.def.type === 'fraiseuse') m.spinner.rotation.y += dt * 25; else m.spinner.rotation.x += dt * 25; }
      m.smoke.visible = status === 'panne'; if (m.smoke.visible) { m.smoke.position.y = 3 + (t % 1) * 1.5; m.smoke.scale.setScalar(0.6 + (t % 1)); }
      const nm = opId && opId.startsWith('app') && S.appNames ? S.appNames[opId] : op.name.split(' ')[0];
      let txt = `${id} ${ML.MTYPE[m.def.type]} · ${nm}`;
      if (status === 'panne') txt = `${id} EN PANNE : clé à molette !`;
      else if (status === 'off') txt = `${id} · plus de courant`;
      else if (status === 'usure') txt = `${id} · outil usé : ${ML.TOOLS[j ? j.need : 'plaquette'].label} neuve !`;
      else if (j) txt = `${id} · #${j.oid} ` + (!j.tool ? `→ ${ML.TOOLS[j.need].label} ?` : `${Math.floor(100 * j.prog / j.total)}%` + (status === 'stop' ? ' · opérateur absent !' : ''));
      m.label.setText(txt, status === 'run' ? '#9dffb8' : status === 'idle' ? '#dddddd' : status === 'stop' || status === 'panne' ? '#ff9f9f' : '#ffd27a');
    }
    for (const k in W.rackLabels) { const n = S.stock[k]; W.rackBars[k].forEach((b, i) => (b.visible = i < n)); W.rackLabels[k].setText(`${ML.MATERIALS[k].label} : ${n}`, n ? '#fff' : '#ff6b6b'); }
    for (const k in W.drawerLabels) { const n = S.stock[k]; W.drawerLabels[k].setText(`${ML.TOOLS[k].label} : ${n}`, n ? '#fff' : '#ff6b6b'); }
    // feux tricolores (cycle calculé à partir du temps de jeu : identique chez tous)
    for (const L of W.lights) { const g = W.lightGreen(L.node, 0, rt || 0); L.red.material = g ? W.lightOff : W.lightRed; L.green.material = g ? W.lightGreenMat : W.lightOff; }
    // radars : flash
    for (const r of W.radars) { r.flash = Math.max(0, (r.flash || 0) - dt); r.lamp.material = r.flash > 0 ? W.flashOn : W.flashOff; }
  };
  /** Le feu du carrefour n est-il vert pour la route d'indice pair (p=0) / impair (p=1) ? */
  W.lightGreen = (node, p, rt) => ((Math.floor((rt + node * 3.7) / 9) % 2) === 0) === (p === 0);
  W.setPower = on => {
    W.inLights.forEach(l => { l.intensity = on ? (l === W.inLights[0] ? 0.35 : 0.25) : 0; });
    W.neonMat.emissive.setHex(on ? 0xdddddd : 0x000000); W.neonMat.color.setHex(on ? 0xffffff : 0x333333);
    if (W.panelLight) W.panelLight.material = U.mat(on ? 0x2ecc71 : 0xe74c3c, on ? 0x2ecc71 : 0xe74c3c);
  };

  /* ---------- Entreprises ---------- */
  function signTexture(name, sub, bg) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 1024, 256); x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 8; x.strokeRect(8, 8, 1008, 240);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = 110; x.font = `bold ${fs}px Arial`; while (x.measureText(name).width > 960) { fs -= 4; x.font = `bold ${fs}px Arial`; }
    x.fillText(name, 512, sub ? 105 : 128); if (sub) { x.font = '44px Arial'; x.globalAlpha = 0.85; x.fillText(sub, 512, 200); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  W.company = (key, C, P) => {
    const g = add(new THREE.Group()); g.position.set(P.x, 0, P.z); g.rotation.y = P.rot * Math.PI / 2;
    const tex = { tole: T.mat('tole', C.w / 3, 2, C.color), brique: T.mat('brique', C.w / 5, C.h / 4, C.color), beton: T.mat('beton', C.w / 5, C.h / 4, C.color) }[C.wall];
    U.box(C.w, C.h, C.d, tex, 0, C.h / 2, 0, g); U.box(C.w + 0.8, 0.5, C.d + 0.8, C.roof, 0, C.h + 0.25, 0, g); U.box(C.w + 0.2, 0.6, C.d + 0.2, 0x555555, 0, 0.3, 0, g);
    U.addCollider(P.x - P.hx, P.x + P.hx, P.z - P.hz, P.z + P.hz, 'building');
    ML.mapRects.push({ x: P.x, z: P.z, w: P.hx * 2, d: P.hz * 2, c: '#' + new THREE.Color(C.roof).getHexString(), name: C.name.split(' ')[0] === 'Boulangerie' ? 'Boulangerie' : C.name.split(' ')[0], comp: key });
    const fz = C.d / 2 + 0.06;
    U.box(6, 4.6, 0.12, T.mat('tole', 3, 1, 0x95a5a6), -C.w / 2 + 5, 2.3, fz, g); U.box(1.2, 2.2, 0.12, 0x5d4037, C.w / 2 - 3, 1.1, fz, g);
    for (let x = -C.w / 2 + 10; x < C.w / 2 - 4.5; x += 2.6) U.box(1.6, 1.2, 0.08, U.mat(0x9fd3ff, 0x1d3b50), x, C.h * 0.55, fz, g, false);
    const st = signTexture(C.name, C.sub || '', '#' + new THREE.Color(C.roof).getHexString());
    const dark = U.mat(0x333333), sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(C.w * 0.8, 18), 2.6, 0.3), [dark, dark, dark, dark, new THREE.MeshLambertMaterial({ map: st }), new THREE.MeshLambertMaterial({ map: st })]);
    sign.position.set(0, C.h + 1.9, C.d / 2 - 0.5); g.add(sign);
    const dock = U.plane(12, 3.6, T.mat('quai', 3, 1), 0, 0, 0.05, g); dock.position.set(-1, 0.05, C.d / 2 + 1.9);
    switch (C.kind) {
      case 'matiere': for (let i = 0; i < 6; i++) { const b = U.cyl(0.15, 0.15, 6, [0x8c9199, 0xdfe5ea, 0x9fc1d8][i % 3], C.w / 2 + 1.5, 0.2 + Math.floor(i / 3) * 0.32, (i % 3) * 0.35, g); b.rotation.x = Math.PI / 2; } break;
      case 'outils': { const m = U.cyl(0.6, 0.6, 3.5, 0x3fa7ff, 0, C.h + 2.6, -2, g, 8); m.rotation.z = 0.3; break; }
      case 'fonderie': case 'tth': U.cyl(0.9, 1.1, 9, 0x5d4037, C.w / 2 - 3, C.h + 4.5, -(C.d / 2 - 3), g); U.cyl(0.95, 0.95, 0.6, U.mat(0xff7a1a, 0xff4400), C.w / 2 - 3, C.h + 9.2, -(C.d / 2 - 3), g); break;
      case 'chaudro': for (let i = 0; i < 3; i++) { U.box(0.15, 2.5, 0.15, 0x5d6d7e, C.w / 2 + 1 + i * 1.2, 1.25, 0, g); U.box(1.3, 0.15, 0.15, 0x5d6d7e, C.w / 2 + 1.6 + i * 1.2, 2.4, 0, g); } break;
      case 'client': { U.box(0.12, 7, 0.12, 0xdddddd, -C.w / 2 - 2, 3.5, C.d / 2 + 3, g); U.box(2, 1.2, 0.05, C.roof, -C.w / 2 - 1, 6.3, C.d / 2 + 3, g); break; }
      case 'boulangerie': for (let i = 0; i < 6; i++) U.box(C.w / 6, 0.12, 1.6, i % 2 ? 0xffffff : 0xc0392b, -C.w / 2 + C.w / 12 + i * C.w / 6, 3.2, C.d / 2 + 0.8, g).rotation.x = 0.35; break;
      case 'station': {
        U.box(C.w + 6, 0.5, 7, 0xe74c3c, 0, 5, C.d / 2 + 3.5, g); for (const x of [-C.w / 2 - 1, C.w / 2 + 1]) U.box(0.4, 5, 0.4, 0xdddddd, x, 2.5, C.d / 2 + 6, g);
        for (const x of [-3, 3]) { U.box(0.8, 1.6, 0.6, 0xc0392b, x, 0.8, C.d / 2 + 3.5, g); U.box(0.6, 0.3, 0.05, U.mat(0xfffbe0, 0x555500), x, 1.3, C.d / 2 + 3.82, g); }
        const pumpPos = new THREE.Vector3(0, 0, C.d / 2 + 3.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
        W.targets.push({ id: 'pump', x: pumpPos.x, y: 1.2, z: pumpPos.z, r: 4 }); ML.LOC.pump = { x: pumpPos.x, z: pumpPos.z };
        break;
      }
      case 'police': { const f = U.box(1.6, 1, 0.05, 0x1f3a93, -C.w / 2 - 1, 6.3, C.d / 2 + 3, g); U.box(0.12, 7, 0.12, 0xdddddd, -C.w / 2 - 2, 3.5, C.d / 2 + 3, g); f.material = U.mat(0x1f3a93); break; }
      case 'casse': {                                                   // épaves empilées + niche du chien
        const cols = [0x8e5b4b, 0x5d6d7e, 0x7f8c8d, 0x6c5ce7];
        for (let i = 0; i < 4; i++) { const w = U.box(4.2, 1.2, 1.9, cols[i], C.w / 2 + 3, 0.6 + (i % 2) * 1.2, -4 + Math.floor(i / 2) * 3, g); w.rotation.y = (i - 1.5) * 0.2; w.rotation.z = (i % 2) * 0.1; }
        U.box(1.4, 1.1, 1.2, 0x8d6e63, 2.5, 0.55, C.d / 2 + 4.5, g); U.box(1.6, 0.15, 1.4, 0x5d4037, 2.5, 1.2, C.d / 2 + 4.5, g);
        const l = U.label('⚠ CHIEN MÉCHANT', { size: 0.5, color: '#ff6b6b' }); l.position.set(-1, 3.2, C.d / 2 + 4); g.add(l);
        break;
      }
      case 'concurrent': { const z = U.box(1.5, 2.5, 0.3, U.mat(0xf1c40f, 0x806000), 0, C.h + 3.8, C.d / 2 - 0.5, g); z.rotation.z = 0.4; break; }
    }
  };

  /* ---------- Décor de ville ---------- */
  function place(name, scale, x, z, ry, collide, y) {
    const o = A.clone(name, scale); if (!o) return null;
    o.position.set(x, y || 0, z); o.rotation.y = ry || 0; add(o);
    if (collide === 'small') U.boxCollider(x, z, 2.2, 2.2, name);
    else if (collide) { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); U.addCollider(b.min.x, b.max.x, b.min.z, b.max.z, name); }
    return o;
  }
  W.decor = city => {
    for (const f of city.fillers) {
      const b = place(f.model, 7.5, f.x, f.z, f.rot * Math.PI / 2, false);
      if (!b) U.box(14, 12, 14, T.mat('brique', 3, 3, 0xf6e58d), f.x, 6, f.z, root);
      U.boxCollider(f.x, f.z, 15, 15, 'city'); ML.mapRects.push({ x: f.x, z: f.z, w: 15, d: 15, c: '#8e7f74' });
    }
    for (const c of city.parked) place(c.model, 4.6, c.x, c.z, c.ry, 'small', 0.33);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0x000000 }), city.lamps.length);
    W.lampMat = heads.material; const o = new THREE.Object3D();
    city.lamps.forEach((l, i) => {
      if (!place('city_streetlight', 6, l.x, l.z, l.ry, false)) U.box(0.15, 5.5, 0.15, 0x444444, l.x, 2.75, l.z, root);
      U.boxCollider(l.x, l.z, 0.3, 0.3, 'lamp');
      o.position.set(l.x + l.nx * 1.3, 5.6, l.z + l.nz * 1.3); o.rotation.set(0, l.ry, 0); o.updateMatrix(); heads.setMatrixAt(i, o.matrix);
    });
    add(heads);
    // radars
    W.flashOn = U.mat(0xffffff, 0xffffff); W.flashOff = U.mat(0x333333);
    for (const r of city.radars) {
      U.box(0.2, 3, 0.2, 0x7f8c8d, r.x, 1.5, r.z, root); U.box(0.7, 0.9, 0.7, 0x95a5a6, r.x, 3.3, r.z, root);
      const lamp = U.box(0.3, 0.3, 0.75, W.flashOff, r.x, 3.3, r.z, root, false);
      const l = U.label('RADAR 60', { size: 0.3, color: '#fff', bg: 'rgba(192,57,43,0.9)' }); l.position.set(r.x, 4.3, r.z); add(l);
      U.boxCollider(r.x, r.z, 0.7, 0.7, 'radar'); W.radars.push({ x: r.x, z: r.z, lamp, flash: 0 });
    }
    // feux tricolores
    W.lightRed = U.mat(0xff2222, 0xff0000); W.lightGreenMat = U.mat(0x22ff44, 0x00cc22); W.lightOff = U.mat(0x222222);
    for (const ni of city.lights) {
      const n = city.nodes[ni], x = n.x + city.RW + 1.2, z = n.z + city.RW + 1.2;
      U.box(0.15, 3.6, 0.15, 0x333333, x, 1.8, z, root); U.box(0.4, 0.9, 0.35, 0x222222, x, 3.6, z, root);
      const red = U.box(0.22, 0.22, 0.4, W.lightRed, x, 3.85, z, root, false), green = U.box(0.22, 0.22, 0.4, W.lightGreenMat, x, 3.35, z, root, false);
      U.boxCollider(x, z, 0.4, 0.4, 'feu'); W.lights.push({ node: ni, red, green });
    }
    // arbres (instanciés : beaucoup d'arbres pour peu d'appels de dessin)
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6), U.mat(0x6d4c41), city.trees.length);
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), city.trees.length * 3);
    const cols = [0x2d6a4f, 0x40916c, 0x52b788, 0x588157].map(c => new THREE.Color(c));
    trunks.castShadow = leaves.castShadow = true;
    city.trees.forEach((t, i) => {
      o.position.set(t.x, 1.1, t.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 3; k++) {
        const s = t.k - k * 0.22; o.position.set(t.x + (k - 1) * 0.3, 2.4 + k * 1.05 * t.k, t.z + (1 - k) * 0.25); o.scale.set(s, s, s); o.rotation.set(0, k, 0); o.updateMatrix();
        leaves.setMatrixAt(i * 3 + k, o.matrix); leaves.setColorAt(i * 3 + k, cols[t.c]);
      }
      U.boxCollider(t.x, t.z, 0.6, 0.6, 'tree');
    });
    add(trunks); add(leaves);
    for (const b of city.bushes) place('city_bush', b.s, b.x, b.z, b.ry, false);
  };

  W.bounds = () => {
    const M = ML.CFG.MAP;
    U.addCollider(M.minX - 30, M.minX, M.minZ - 40, M.maxZ + 40, 'bound'); U.addCollider(M.maxX, M.maxX + 30, M.minZ - 40, M.maxZ + 40, 'bound');
    U.addCollider(M.minX - 30, M.maxX + 30, M.minZ - 40, M.minZ, 'bound'); U.addCollider(M.minX - 30, M.maxX + 30, M.maxZ, M.maxZ + 40, 'bound');
  };
  W.setDaylight = k => { if (W.lampMat) W.lampMat.emissive.setHex(k < 0.6 ? 0xffd27a : 0x000000); };
  W.target = id => W.targets.find(t => t.id === id);
})();
