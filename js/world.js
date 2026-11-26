/* =====================================================================
   world.js — Construction 3D du monde à partir de la ville générée
   (citygen.js). Le monde est RECONSTRUIT à chaque partie (nouvelle
   graine) : World.build(seed, upgrades, machines, { day }). Tout est rangé
   dans World.root pour pouvoir le supprimer d'un coup. Une machine achetée
   en cours de journée est ajoutée à la volée (World.syncMachines).
   V5 : relief + rivière (ML.gy = hauteur du sol), ponts, bâtiments où l'on
   ENTRE (clients, garage, gendarmerie), atelier qui évolue avec les jours.
   ===================================================================== */
(function () {
  const W = ML.World = { targets: [], machines: {}, root: null };
  const U = ML.U, T = ML.Tex, A = ML.Assets;
  let root, rng;

  W.build = (seed, upgrades, mach, opts) => {
    if (W.root) { ML.scene.remove(W.root); }
    root = W.root = new THREE.Group(); ML.scene.add(root);
    ML.colliders.length = 0; W.targets = []; W.machines = {}; W.radars = []; W.lights = []; W.lampHeads = null;
    ML.mapRects = []; W.up = upgrades || {}; W.owned = mach || ML.MACHINES.filter(m => !m.ext).map(m => m.id); W.partCars = [];
    W.day = (opts && opts.day) || 1; W.ext = !!W.up.extension; W.staff = []; W.interiors = []; W.show = {}; W.reels = [];
    W.black = !(opts && opts.race) && W.day % ML.ECO.black.every === 0;                // V5.2 : Black Friday (prix affichés au centre commercial)
    ML.carBlocks = [{ minX: -5.4, maxX: 5.4, minZ: 13.1, maxZ: 15.2 }];                 // V5.2 : voitures interdites dans l'atelier (transpalette et fenwick : oui)
    W.reno = W.day >= ML.PROGRESS.reno3 ? 3 : W.day >= ML.PROGRESS.reno2 ? 2 : 1;      // l'atelier se refait une beauté avec les jours
    rng = U.rng(seed ^ 0x5bd1e995);
    ML.Decor.begin(seed, root);                                     // détails graphiques fusionnés (decor.js)
    const city = W.city = ML.CityGen.generate(seed);
    ML.LOC = { comp: city.companies, hides: city.hides.slice(), perches: city.perches, radars: city.radars };
    W.terrain(city); W.ground(city); W.atelier(); W.furniture(); ML.Decor.atelier(W); W.machinesBuild();
    for (const k in city.companies) W.company(k, ML.COMPANIES[k], city.companies[k]);
    W.decor(city); W.bounds(); W.vie52(city);
    ML.Decor.end();
    ML.LOC.hides = ML.LOC.hides.filter(h => !U.inCollider(h.x, h.z, 0.5) && !ML.riverAt(h.x, h.z, 1));
  };
  const add = o => { root.add(o); return o; };
  const plane = (w, d, mat, x, z, y) => U.plane(w, d, mat, x, z, y, root);

  /* ---------- Relief et rivière (V5) ----------
     Une grille de hauteurs (pas de 2 m) : collines dans les espaces verts,
     plat sur les routes, les bâtiments et l'atelier, lit creusé pour la
     rivière. ML.gy(x, z) = hauteur où l'on marche (0 sur les routes et les
     ponts). ML.riverAt / riverPush : on ne marche pas (ni ne roule) dans l'eau. */
  W.terrain = city => {
    const M = ML.CFG.MAP, S = 2, pad = 56, x0 = M.minX - pad, z0 = M.minZ - pad, RW = city.RW, RIV = city.RIV;
    const nx = Math.round((M.maxX - M.minX + 2 * pad) / S) + 1, nz = Math.round((M.maxZ - M.minZ + 2 * pad) / S) + 1, n = nx * nz;
    const dR = new Float32Array(n).fill(99), dB = new Float32Array(n).fill(99), dW = new Float32Array(n).fill(99), seg = ML.CityGen.segDist;
    const box = (ax, az, bx, bz, reach) => [Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / S)), Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + reach - x0) / S)),
      Math.max(0, Math.floor((Math.min(az, bz) - reach - z0) / S)), Math.min(nz - 1, Math.ceil((Math.max(az, bz) + reach - z0) / S))];
    const stampSeg = (arr, ax, az, bx, bz, reach, off) => {
      const [i0, i1, j0, j1] = box(ax, az, bx, bz, reach);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i, d = seg(x0 + i * S, z0 + j * S, ax, az, bx, bz) - (off || 0); if (d < arr[k]) arr[k] = d; }
    };
    const stampRect = (arr, cx, cz, hx, hz, reach) => {
      const [i0, i1, j0, j1] = box(cx - hx, cz - hz, cx + hx, cz + hz, reach);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i, d = Math.hypot(Math.max(0, Math.abs(x0 + i * S - cx) - hx), Math.max(0, Math.abs(z0 + j * S - cz) - hz)); if (d < arr[k]) arr[k] = d; }
    };
    const N = city.nodes;
    for (const e of city.edges) stampSeg(dR, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z, 32);
    for (const nd of N) stampSeg(dR, nd.x, nd.z, nd.x, nd.z, 32, nd.cul ? 3.5 : 0.4);
    for (const o of city.rects) stampRect(dB, o.x, o.z, o.hx, o.hz, 32);
    stampRect(dB, 0, 6, 36, 28, 32);                                   // atelier, parkings, quai, extension
    const RV = city.river || [];
    for (let i = 0; i < RV.length - 1; i++) stampSeg(dW, RV[i].x, RV[i].z, RV[i + 1].x, RV[i + 1].z, 40);
    // bruit lisse (même relief chez tous : il dépend de la graine de la ville)
    const sd = (city.nodes.length * 7919 + Math.round(city.nodes[1].x * 1000)) | 0;
    const hash = (i, j, s2) => { let t = (i * 374761393 + j * 668265263 + s2 * 1442695041) | 0; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
    const vn = (x, z, sc, s2) => {
      const gx = Math.floor(x / sc), gz = Math.floor(z / sc), fx = x / sc - gx, fz = z / sc - gz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      const a = hash(gx, gz, s2), b = hash(gx + 1, gz, s2), c = hash(gx, gz + 1, s2), d = hash(gx + 1, gz + 1, s2);
      return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
    };
    const sm = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const hv = new Float32Array(n), hw = new Float32Array(n), wet = new Uint8Array(n), col = new Float32Array(n * 3);
    const WATER = RIV.half + 2.7;                                       // bord de l'eau (au niveau de la surface, y = -0.9)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = x0 + i * S, z = z0 + j * S;
      let hill = 0.62 * vn(x, z, 74, sd) + 0.38 * vn(x, z, 31, sd + 17);
      hill = Math.pow(Math.max(0, (hill - 0.36) / 0.64), 1.35) * 11;
      const out = Math.max(0, M.minX + 10 - x, x - (M.maxX - 10), M.minZ + 6 - z, z - (M.maxZ - 10));
      hill += Math.min(18, out * 0.5);                                   // les bords de la carte remontent (on ne voit pas le bout du monde)
      const mask = Math.min(sm((dR[k] - (RW + 4)) / 16), sm((dB[k] - 3) / 14), sm((dW[k] - (RIV.half + 6)) / 14));
      let h = hill * mask;
      const w = dW[k];
      if (w < RIV.half + 4.6) h = Math.min(h, w < RIV.half ? -2.6 : -2.6 * (1 - sm((w - RIV.half) / 4.6)));
      const road = dR[k] < RW + 2.3;
      hv[k] = h; hw[k] = road ? 0 : h; wet[k] = !road && w < WATER ? 1 : 0;
      // couleur : herbe plus claire en haut des collines, berges sableuses, lit vaseux
      let r = 0.92 + Math.min(0.12, h * 0.012), g = 0.95 + Math.min(0.1, h * 0.01), b = 0.9;
      if (w < RIV.half + 5.5) { const t = 1 - sm((w - RIV.half + 1) / 6.5); r = r + (1.0 - r) * t; g = g + (0.86 - g) * t; b = b + (0.6 - b) * t; }
      if (h < -1.2) { r = 0.55; g = 0.55; b = 0.45; }
      col[k * 3] = Math.min(1, r); col[k * 3 + 1] = Math.min(1, g); col[k * 3 + 2] = Math.min(1, b);
    }
    const T2 = W.hgt = { x0, z0, S, nx, nz, hv, hw, wet };
    const samp = (arr, x, z) => {
      const fx = (x - x0) / S, fz = (z - z0) / S; if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return 0;
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * nx + i;
      return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - tz) + (arr[k + nx] * (1 - tx) + arr[k + nx + 1] * tx) * tz;
    };
    ML.gy = (x, z) => samp(hw, x, z);                                  // hauteur du sol où l'on marche / roule
    ML.gyv = (x, z) => samp(hv, x, z);                                 // hauteur « visuelle » (sous les ponts : le lit)
    ML.riverAt = (x, z, pad) => {
      const fx = Math.round((x - x0) / S), fz = Math.round((z - z0) / S); if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return false;
      const k = fz * nx + fx; if (wet[k]) return true;
      if (!pad || dW[k] > WATER + pad + 2 || dR[k] < RW + 2.3) return false;
      return city.riverDist(x, z) < WATER + pad;
    };
    ML.riverPush = (p, r) => {                                         // repousse hors de l'eau (sauf sur les ponts)
      const fx = Math.round((p.x - x0) / S), fz = Math.round((p.z - z0) / S); if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return false;
      const k = fz * nx + fx; if (dR[k] < RW + 2.3 || dW[k] > WATER + r + 2.5) return false;
      let best = null, bd = 1e9;
      for (let i = 0; i < RV.length - 1; i++) {
        const A = RV[i], B = RV[i + 1], dx = B.x - A.x, dz = B.z - A.z, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.z - A.z) * dz) / L));
        const qx = A.x + t * dx, qz = A.z + t * dz, d = Math.hypot(p.x - qx, p.z - qz); if (d < bd) { bd = d; best = { qx, qz }; }
      }
      const need = WATER + r; if (!best || bd >= need) return false;
      const ux = bd > 1e-3 ? (p.x - best.qx) / bd : 0, uz = bd > 1e-3 ? (p.z - best.qz) / bd : 1;
      p.x = best.qx + ux * need; p.z = best.qz + uz * need; return true;
    };
    // --- maillage du sol ---
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; pos[k * 3] = x0 + i * S; pos[k * 3 + 1] = hv[k]; pos[k * 3 + 2] = z0 + j * S; uv[k * 2] = (x0 + i * S) / 7; uv[k * 2 + 1] = (z0 + j * S) / 7; }
    let q = 0; for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    W.grassMat = W.grassMat || new THREE.MeshLambertMaterial({ map: T.tex('herbe', 1, 1), vertexColors: true });
    const ground = new THREE.Mesh(geo, W.grassMat); ground.receiveShadow = true; add(ground);
    // --- l'eau : un ruban qui suit la rivière (texture qui défile) ---
    if (RV.length > 1) {
      if (!W.waterTex) {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
        x.fillStyle = '#3d86c6'; x.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 46; i++) { x.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.18})`; x.fillRect(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 26, 2); }
        W.waterTex = new THREE.CanvasTexture(c); W.waterTex.wrapS = W.waterTex.wrapT = THREE.RepeatWrapping;
      }
      const v = [], u = [], ii = [], HW = WATER + 1.2; let acc = 0;
      RV.forEach((P, k) => {
        const A = RV[Math.max(0, k - 1)], B = RV[Math.min(RV.length - 1, k + 1)], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1, ox = -dz / L * HW, oz = dx / L * HW;
        if (k) acc += Math.hypot(P.x - RV[k - 1].x, P.z - RV[k - 1].z);
        v.push(P.x + ox, -0.9, P.z + oz, P.x - ox, -0.9, P.z - oz); u.push(acc / 18, 0, acc / 18, 1.4);
        if (k) { const a = (k - 1) * 2; ii.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); wg.setIndex(ii); wg.computeVertexNormals();
      const wm = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ map: W.waterTex, color: 0x8fb8d8, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      wm.receiveShadow = true; add(wm);
      ML.mapRects.push({ river: RV });
    }
    // --- ponts : tablier, parapets (collisions), piles ---
    for (const b of city.bridges || []) {
      const ry = Math.atan2(b.ux, b.uz), lx = b.uz, lz = -b.ux, half = RW + 2.05;
      const deck = U.box(half * 2 + 0.3, 1.1, b.len, T.mat('beton', 2, 4, 0xb9b4aa), b.x, -0.56, b.z, root); deck.rotation.y = ry;
      for (const s2 of [-1, 1]) {
        const px = b.x + lx * half * s2, pz = b.z + lz * half * s2;
        const pp = U.box(0.35, 1.0, b.len, 0xd8d2c4, px, 0.5, pz, root); pp.rotation.y = ry;
        const tp = U.box(0.5, 0.12, b.len + 0.2, 0x8d8a82, px, 1.04, pz, root); tp.rotation.y = ry;
        for (let t = -b.len / 2 + 0.6; t <= b.len / 2 - 0.6; t += 1.1) U.boxCollider(px + b.ux * t, pz + b.uz * t, 0.7, 0.7, 'parapet');
      }
      for (const t of [-b.len * 0.22, b.len * 0.22]) { const c = U.cyl(0.9, 1.1, 3.2, 0x9e9a90, b.x + b.ux * t, -2.2, b.z + b.uz * t, root, 10); c.castShadow = false; }
      const lab = U.label('🌉 Pont de la Rivière', { size: 0.45, color: '#dff3ff', bg: 'rgba(25,60,100,0.75)' }); lab.position.set(b.x + lx * (half + 0.4), 2.2, b.z + lz * (half + 0.4)); add(lab);
    }
  };

  /* ---------- Sol et routes ---------- */
  W.ground = city => {
    const M = ML.CFG.MAP;
    // le sol (herbe + relief + rivière) est construit par W.terrain
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
    for (const n of N) {
      if (Math.abs(n.x) < 16 && n.z > 12 && n.z < 29) continue;            // V5.2 : pas de rond d'asphalte gris dans la cour (devant la porte)
      const c = new THREE.Mesh(new THREE.CircleGeometry(n.cul ? RW + 3.5 : RW + 0.4, 20), asph); c.rotation.x = -Math.PI / 2; c.position.set(n.x, 0.03, n.z); c.receiveShadow = true; add(c); }
    const dm = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.2, 0.22).rotateX(-Math.PI / 2), U.mat(0xeeeeee), dashes.length), o = new THREE.Object3D();
    dashes.forEach(([x, z, a], i) => { o.position.set(x, 0.04, z); o.rotation.set(0, a, 0); o.updateMatrix(); dm.setMatrixAt(i, o.matrix); }); add(dm);
    plane(30, 14, T.mat('beton', 7, 3), 0, 21, 0.025);
  };

  /* ---------- Atelier ---------- */
  function wall(x1, z1, x2, z2, h, mat, t) {
    t = t || 0.4; const w = Math.abs(x2 - x1) || t, d = Math.abs(z2 - z1) || t;
    U.box(w, h, d, mat, (x1 + x2) / 2, h / 2, (z1 + z2) / 2, root); U.boxCollider((x1 + x2) / 2, (z1 + z2) / 2, w, d, 'wall');
  }
  /** Couleurs de l'atelier selon sa rénovation (jour 5 : rafraîchi, jour 10 : flambant neuf) */
  W.PAL = {
    1: { wall: 0xc9d1d8, floor: 0xffffff, band: 0x24457a, roof: 0x7f8c8d, dado: 0x2f6f8f, trim: 0xe67e22, outer: 0x2e8b57, lane: 0x7f9c8a },
    2: { wall: 0xdde7df, floor: 0xd9ead9, band: 0x1e8449, roof: 0x6f8f7f, dado: 0x1e8449, trim: 0xf1c40f, outer: 0x1e8449, lane: 0x5f8f6f },
    3: { wall: 0xeee8dc, floor: 0xd2dceb, band: 0x1a2340, roof: 0x55606e, dado: 0x1a2340, trim: 0xffd257, outer: 0x1a2340, lane: 0x4f6f9f }
  };
  /** Texte peint au sol (zones bloquées, emplacements) */
  W.floorText = (text, sub, w, h, x, z, opt) => {
    opt = opt || {};
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    const draw = (text2, sub2, o2) => { drawFloor(c, text2, sub2, Object.assign({}, opt, o2 || {})); t.needsUpdate = true; };
    draw(text, sub);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = opt.rot || 0; m.position.set(x, opt.y || 0.05, z); m.receiveShadow = true; add(m); m.userData.redraw = draw; return m;
  };
  function drawFloor(c, text, sub, opt) {
    const g2 = c.getContext('2d'); g2.clearRect(0, 0, c.width, c.height);
    g2.fillStyle = opt.bg || 'rgba(0,0,0,0)'; g2.fillRect(0, 0, c.width, c.height);
    if (opt.hatch) { g2.strokeStyle = opt.hatch; g2.lineWidth = 6; for (let i = -c.height; i < c.width; i += 34) { g2.beginPath(); g2.moveTo(i, c.height); g2.lineTo(i + c.height, 0); g2.stroke(); } }
    if (opt.border) { g2.strokeStyle = opt.border; g2.lineWidth = 14; g2.strokeRect(7, 7, c.width - 14, c.height - 14); }
    g2.fillStyle = opt.color || '#fff'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    const lines = String(text).split('\n'); let fs = Math.min(c.height / (lines.length + (sub ? 1.2 : 0.4)), 80);
    g2.font = `bold ${fs}px Arial`; while (lines.some(l => g2.measureText(l).width > c.width - 50) && fs > 12) { fs -= 2; g2.font = `bold ${fs}px Arial`; }
    lines.forEach((l, i) => g2.fillText(l, c.width / 2, c.height / 2 - (sub ? fs * 0.5 : 0) + (i - (lines.length - 1) / 2) * fs * 1.1));
    if (sub) { g2.font = `${Math.round(fs * 0.55)}px Arial`; g2.fillText(sub, c.width / 2, c.height / 2 + fs * (lines.length * 0.55 + 0.2)); }
  }
  const inDays = d => { const n = d - W.day; return n <= 0 ? null : n === 1 ? 'demain' : `dans ${n} jours`; };
  W.atelier = () => {
    const P = W.pal = W.PAL[W.reno];
    ML.mapRects.push({ x: 0, z: 0, w: 40, d: 28, c: '#a2a8ad', name: 'ATELIER' });
    plane(40, 28, T.mat('sol', 10, 7, P.floor), 0, 0, 0.03);
    const wm = T.mat('bardage', 6, 1.5, P.wall);
    wall(-20.2, -14, 20.2, -14, 7, wm); wall(-20, -14, -20, 14, 7, wm);
    if (W.ext) { wall(20, -14, 20, -2.3, 7, wm); wall(20, 4.6, 20, 14, 7, wm); U.box(0.4, 2.4, 6.9, wm, 20, 5.8, 1.15, root); }   // passage vers l'extension
    else wall(20, -14, 20, 14, 7, wm);
    wall(-20.2, 14, -5, 14, 7, wm); wall(5, 14, 20.2, 14, 7, wm);
    U.box(10, 2.5, 0.4, wm, 0, 5.75, 14, root);
    U.cyl(0.45, 0.45, 10, 0x7f8c8d, 0, 4.3, 14.15, root).rotation.z = Math.PI / 2;
    U.box(40.8, 0.3, 28.8, T.mat('tole', 8, 6, P.roof), 0, 7.15, 0, root);
    U.box(40.9, 0.8, 0.1, P.band, 0, 6.3, 14.25, root);
    W.neonMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdddddd });
    for (let x = -14; x <= 14; x += 7) for (const z of [-8, 0, 8]) U.box(2.6, 0.08, 0.3, W.neonMat, x, 6.9, z, root, false);
    if (W.reno >= 2) { const l = U.label(W.reno >= 3 ? '✨ ATELIER FLAMBANT NEUF (jour 10) ✨' : '🎨 ATELIER RÉNOVÉ (jour 5)', { size: 0.45, color: '#ffd257', bg: 'rgba(26,35,64,0.85)' }); l.position.set(-4, 6.1, -13.2); add(l); }
    // --- zones bloquées / emplacements libres (sol gris + texte) ---
    const agr = !!W.up.agrandissement, dA = inDays(ML.PROGRESS.agrandissement);
    W.lockTexts = [];
    if (!agr) W.lockTexts.push({ k: 'agrandissement', label: 'AGRANDISSEMENT', what: 'emplacements T3 et F3', m: W.floorText(dA ? `🔒 AGRANDISSEMENT\nse débloque ${dA}` : '🔓 AGRANDISSEMENT\ndisponible au PC', dA ? 'emplacements T3 et F3' : `${ML.CATALOG.agrandissement.price} € — onglet Atelier`, 7.2, 16, 4, -1, { bg: 'rgba(120,124,130,0.92)', hatch: 'rgba(80,84,90,0.9)', color: dA ? '#ffffff' : '#ffd257', border: '#f1c40f', y: 0.045 }) });
    else for (const id of ['T3', 'F3']) if (!W.owned.includes(id)) { const d = ML.MACHINES.find(m => m.id === id); W.floorText(`EMPLACEMENT ${id}`, `${ML.MTYPE[d.type]} — à acheter au PC`, 3.6, 1.6, d.x, d.z + (d.type === 'tour' ? 2.4 : -2.6), { bg: 'rgba(40,40,40,0.55)', color: '#ffd257' }); }
    // --- extension Est (après achat : construite pendant la nuit) ---
    if (W.ext) W.extension(P, wm);
    else {
      const dE = inDays(ML.PROGRESS.extension);
      plane(12.6, 20, T.mat('beton', 3, 5, 0x9da3a8), 26.7, -2, 0.028);
      W.lockTexts.push({ k: 'extension', label: 'EXTENSION EST', what: 'un hall de plus : T4 + F4', m: W.floorText(dE ? `🔒 EXTENSION EST\nse débloque ${dE}` : '🔓 EXTENSION EST\ndisponible au PC', dE ? 'un hall de plus : T4 + F4' : `${ML.CATALOG.extension.price} € — construite la nuit`, 11, 18, 26.7, -2, { bg: 'rgba(110,114,120,0.85)', hatch: 'rgba(70,74,80,0.85)', color: dE ? '#fff' : '#ffd257', border: '#f1c40f', y: 0.06, rot: Math.PI / 2 }) });
      for (const [x, z] of [[20.6, -12], [32.8, -12], [32.8, 7.9], [20.6, 7.9]]) { U.cyl(0.08, 0.08, 1.1, 0xe67e22, x, 0.55, z, root); U.box(0.25, 0.25, 0.25, 0xffffff, x, 1.15, z, root); }
    }
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
      carSpawn: [{ x: -5, z: 21, h: 0 }, { x: 5, z: 21, h: 0 }, { x: 12, z: 21, h: 0 }, { x: -9, z: 26, h: 0 }, { x: 0, z: 26, h: 0 }, { x: 9, z: 26, h: 0 }],
      tpSpawn: { x: 2, z: 10, h: Math.PI },
      spawn: [{ x: 8, z: 2 }, { x: 10, z: 2 }, { x: 8, z: 4 }, { x: 10, z: 4 }, { x: 12, z: 3 }, { x: 6, z: 3 }],
      counter: { x: 4.5, z: 12.5 },                                    // comptoir : les particuliers attendent ici
      parkSlots: [{ x: -21, z: 23, h: 0 }, { x: -25, z: 23, h: 0 }, { x: -29, z: 23, h: 0 }],
      aiSpots: { tony: { x: 16.5, z: 16, yaw: Math.PI }, jojo: { x: 15.5, z: 9.5, yaw: -Math.PI / 2 } },
      hooks: [{ type: 'extincteur', x: -19.2, y: 0, z: 2.6 }, { type: 'extincteur', x: 19.2, y: 0, z: -11.5 }, { type: 'cle', x: -19.2, y: 0.95, z: 4.6 },
              { type: 'cle', x: -19.2, y: 0.95, z: 5.4 }, { type: 'soufflette', x: -19.2, y: 0.95, z: 6.3, h: 0 }, { type: 'soufflette', x: -19.2, y: 0.95, z: 7.1, h: 1 }],
      reels: [{ x: -19.45, y: 2.15, z: 6.3 }, { x: -19.45, y: 2.15, z: 7.1 }],            // enrouleurs d'air comprimé (la soufflette y est attachée)
      hoseLen: W.ext ? 58 : 46,                                       // longueur du tuyau (on ne sort pas de l'atelier avec)
      doorIn: { x: 0, z: 12 },
      bigZone: { minX: 18, maxX: 30, minZ: 15.5, maxZ: 19 },         // quai gros colis (palettes)
      fenSpawn: { x: 22, z: 23, h: Math.PI }, camSpawn: { x: 28, z: 25, h: 0 },
      benne: { x: -13, z: 19.5 }
    });
    if (W.ext) ML.LOC.patrol.push({ x: 26, z: -1.2 }, { x: 30, z: -1.2 });
    // quai gros colis (à droite de la porte) + benne à copeaux (à gauche)
    plane(18, 13, T.mat('beton', 4, 3, 0xbfbfbf), 24, 21, 0.026); plane(12, 3.5, 0xe67e22, 24, 17.2, 0.04);
    const l3 = U.label('QUAI GROS COLIS : palettes (fenwick → camion)', { size: 0.45, color: '#ffd9a8' }); l3.position.set(24, 3, 17.2); add(l3);
    { const g = add(new THREE.Group()); g.position.set(-13, 0, 19.5);
      U.box(4, 1.6, 2.2, 0x1e7d4a, 0, 0.8, 0, g); U.box(4.2, 0.12, 2.4, 0x145c36, 0, 1.62, 0, g); U.box(3.6, 0.3, 1.8, 0xb0b7bf, 0, 1.5, 0, g);
      U.boxCollider(-13, 19.5, 4, 2.2, 'benne'); W.targets.push({ id: 'benne', x: -13, y: 1.4, z: 19.5, r: 3.4 });
      const l = U.label('BENNE À COPEAUX', { size: 0.4, color: '#b6ffcb' }); l.position.set(0, 2.5, 0); g.add(l); }
  };

  /** Extension Est : hall de 13 × 20 m, ouvert sur l'atelier (passage dans l'allée centrale) */
  W.extension = (P, wm) => {
    plane(13, 20, T.mat('sol', 3, 5, P.floor), 26.5, -2, 0.03);
    wall(20, -12, 33.2, -12, 7, wm); wall(20, 8, 33.2, 8, 7, wm); wall(33, -12, 33, 8, 7, wm);
    U.box(13.6, 0.3, 20.6, T.mat('tole', 3, 5, P.roof), 26.5, 7.15, -2, root);
    U.box(13.4, 0.8, 0.1, P.band, 26.5, 6.3, 8.25, root);
    for (const z of [-7, 0, 5]) U.box(2.6, 0.08, 0.3, W.neonMat, 26.5, 6.9, z, root, false);
    const l = U.label('EXTENSION EST', { size: 0.5, color: '#ffd257', bg: 'rgba(26,35,64,0.85)' }); l.position.set(26.5, 5.6, -11.6); add(l);
    W.inLights.push(new THREE.PointLight(0xfff4e0, 0.25, 24)); W.inLights[W.inLights.length - 1].position.set(26.5, 6, -2); add(W.inLights[W.inLights.length - 1]);
    for (const id of ['T4', 'F4']) if (!W.owned.includes(id)) { const d = ML.MACHINES.find(m => m.id === id); W.floorText(`EMPLACEMENT ${id}`, `${ML.MTYPE[d.type]} — à acheter au PC`, 3.6, 1.6, d.x, d.z + (d.type === 'tour' ? 2.4 : -2.6), { bg: 'rgba(40,40,40,0.55)', color: '#ffd257' }); }
    ML.mapRects.push({ x: 26.5, z: -2, w: 13, d: 20, c: '#a2a8ad' });
  };

  W.furniture = () => {
    const racks = { acier: -16, alu: -12, inox: -8 };
    W.rackBars = {}; W.rackLabels = {};
    for (const m in racks) {
      const x = racks[m], z = -13.1, g = add(new THREE.Group()); g.position.set(x, 0, z);
      for (const dx of [-1.2, 1.2]) U.box(0.1, 2.2, 0.8, 0x2c3e50, dx, 1.1, 0, g);
      for (const y of [0.5, 1.2, 1.9]) U.box(2.5, 0.06, 0.8, 0xe67e22, 0, y, 0, g);
      W.rackBars[m] = [];
      const paint = { acier: 0x2e6fd6, alu: 0x27ae60, inox: 0xe74c3c }[m];                // code couleur peint au bout des barres
      for (let i = 0; i < 9; i++) {
        const b = U.cyl(0.07, 0.07, 2.1, ML.MATERIALS[m].color, 0, 0.6 + Math.floor(i / 3) * 0.7, -0.25 + (i % 3) * 0.25, g); b.rotation.z = Math.PI / 2; W.rackBars[m].push(b);
        for (const y of [-1.06, 1.06]) U.cyl(0.072, 0.072, 0.03, paint, 0, y, 0, b, 8);
        U.box(0.012, 0.18, 0.06, 0xffffff, 0.072, 0.62, 0, b, false);                      // étiquette
      }
      const grade = U.label({ acier: 'S235 · acier', alu: '2017A · alu', inox: '304L · inox' }[m], { size: 0.22, color: '#111', bg: 'rgba(255,255,255,0.9)' }); grade.position.set(0, 0.25, 0.45); g.add(grade);
      for (const dx of [-1.2, 1.2]) for (let y = 0.2; y < 2.1; y += 0.18) U.box(0.105, 0.05, 0.05, 0xf1c40f, dx, y, 0.39, g, false);
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
    const lc = U.label(W.up.cafe_pro ? '☕ Café PRO : très rapide 2 min' : '☕ Café : très rapide 1 min', { size: 0.3 }); lc.position.set(-18.8, 2.3, 12.5); add(lc);
    W.targets.push({ id: 'coffee', x: -19.3, y: 1.2, z: 12.5, r: 2.4 }, { id: 'reception', x: -12.5, y: 0.8, z: 10.3, r: 4.2 });
    // bureau du chef, imprimante, PC, marbre, tableau électrique, boîte de casques
    U.box(2.4, 0.8, 1.2, 0x5d4037, 12, 0.4, -8, root); U.boxCollider(12, -8, 2.4, 1.2, 'desk');
    const lb = U.label('Bureau du chef', { size: 0.3 }); lb.position.set(12, 1.9, -8); add(lb);
    // comptoir clients (à droite de la porte) + parking clients (à gauche, dehors)
    U.box(2.2, 1.05, 0.7, 0x8d6e63, 4.5, 0.52, 11.2, root); U.box(2.4, 0.08, 0.9, 0xd7ccc8, 4.5, 1.08, 11.2, root); U.boxCollider(4.5, 11.2, 2.2, 0.7, 'counter');
    const lco = U.label('COMPTOIR', { size: 0.26, color: '#ffc6e0' }); lco.position.set(4.5, 1.45, 10.8); add(lco);
    plane(16, 11, T.mat('asphalte', 3, 2), -25, 23, 0.027);
    for (let x = -32; x <= -18; x += 4) plane(0.15, 5, 0xffffff, x, 23, 0.045);
    const lpk = U.label('P  PARKING CLIENTS', { size: 0.55, color: '#fff', bg: 'rgba(31,78,154,0.92)' }); lpk.position.set(-25, 3.2, 17.4); add(lpk);
    U.box(0.12, 2.6, 0.12, 0xdddddd, -25, 1.3, 17.6, root); U.boxCollider(-25, 17.6, 0.3, 0.3, 'pole');
    U.box(0.8, 0.8, 0.7, 0x95a5a6, 15, 0.4, -8, root); U.box(0.7, 0.35, 0.6, 0xecf0f1, 15, 0.98, -8, root); U.boxCollider(15, -8, 0.8, 0.7, 'printer');
    W.targets.push({ id: 'printer', x: 15, y: 1, z: -7.5, r: 2.4 });
    U.box(1.6, 0.8, 0.9, 0x6d4c41, 18.6, 0.4, 6.5, root); U.box(0.06, 0.5, 0.8, 0x111111, 18.9, 1.1, 6.5, root); U.box(0.02, 0.42, 0.7, U.mat(0x2e86de, 0x1b4f8a), 18.85, 1.1, 6.5, root);
    U.boxCollider(18.6, 6.5, 1.6, 0.9, 'pc'); const lp = U.label('💻 PC DE GESTION', { size: 0.34, color: '#9fd3ff' }); lp.position.set(18.6, 2.0, 6.5); add(lp);
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
  W.machinesBuild = () => { for (const def of ML.MACHINES) if (W.owned.includes(def.id)) W.buildMachine(def); };
  /** Machines achetées en cours de partie : construites dès qu'elles apparaissent dans l'état de l'hôte */
  W.syncMachines = S => { for (const id in S.machines) if (!W.machines[id]) { const def = ML.MACHINES.find(m => m.id === id); if (def) W.buildMachine(def, true); } };
  W.buildMachine = (def, fresh) => {
    {
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
      ML.Decor.machine(m, def, g);
      W.machines[def.id] = m;
      if (fresh) { const nl = U.label('★ NEUVE !', { size: 0.4, color: '#ffd257' }); nl.position.set(0, 4.4, 0); g.add(nl); setTimeout(() => g.remove(nl), 60000); }
    }
  };

  W.updateVisuals = (dt, S, rt) => {
    if (!S) return;
    W.syncMachines(S);
    // voitures des particuliers sur le parking clients
    ML.LOC.parkSlots.forEach((sp, i) => {
      const on = (S.parts || []).some(p => p.slot === i); let m = W.partCars[i];
      if (on && !m) {
        m = A.clone(['city_car_hatchback', 'city_car_sedan', 'city_car_stationwagon'][i % 3], 4.6);
        if (m) m.position.set(sp.x, 0.33, sp.z); else { m = new THREE.Group(); U.box(1.8, 0.8, 4.2, 0xe84393, 0, 0.7, 0, m); m.position.set(sp.x, 0, sp.z); }
        add(m); W.partCars[i] = m;
      }
      if (m) m.visible = on;
    });
    const t = performance.now() / 1000;
    for (const id in W.machines) {
      const m = W.machines[id], st = S.machines[id] || {}, j = st.job, opId = st.op, op = ML.PEOPLE[opId] || { name: '?' };
      const status = st.status || 'idle';
      const col = { idle: 0x777777, wait: 0xff9f1a, run: 0x2ecc71, stop: 0xf1c40f, panne: 0xe74c3c, usure: 0xe67e22, off: 0x222222, noop: 0x555555 }[status] || 0x777777;
      const blink = (status === 'panne' || status === 'usure') && Math.floor(t * 3) % 2;
      m.lightMat.color.setHex(col); m.lightMat.emissive.setHex(status === 'idle' || status === 'off' || blink ? 0x111111 : col).multiplyScalar(0.6);
      if (status === 'run') { if (m.def.type === 'fraiseuse') m.spinner.rotation.y += dt * 25; else m.spinner.rotation.x += dt * 25; }
      m.smoke.visible = status === 'panne'; if (m.smoke.visible) { m.smoke.position.y = 3 + (t % 1) * 1.5; m.smoke.scale.setScalar(0.6 + (t % 1)); }
      const nm = opId ? op.name.split(' ')[0] : 'sans opérateur';
      let txt = `${id} ${ML.MTYPE[m.def.type]} · ${nm}`;
      if (!opId) txt = `${id} · SANS OPÉRATEUR (embauche au PC)`;
      else if (st.plan && !j) txt += ` · prévu #${st.plan}`;
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
    for (let i = 0; i < W.radars.length; i++) {
      const r = W.radars[i], off = (S.radarsOff || []).includes(i);
      if (off !== !!r.off) { r.off = off; r.head.rotation.z = off ? 1.2 : 0; r.head.position.y = off ? 2.3 : 3.3; r.lamp.visible = !off; r.label.setText(off ? '🪚 RADAR HS' : 'RADAR 60'); }
      r.flash = Math.max(0, (r.flash || 0) - dt); r.lamp.material = r.flash > 0 ? W.flashOn : W.flashOff;
    }
    W.vieVisuals(dt, S);
    // showroom : « VENDU » sur les véhicules déjà achetés
    for (const k in W.show) { const t2 = (S.owned || []).includes(k) ? '✔ DÉJÀ À VOUS' : ''; if (W.show[k].label._t !== t2) { W.show[k].label._t = t2; W.show[k].label.setText(t2); } }
  };
  /** Chaque image : l'eau de la rivière coule */
  W.tick = dt => {
    if (W.waterTex) W.waterTex.offset.x -= dt * 0.045;
    // figurants et voitures du showroom : on ne les dessine que de près (sinon des centaines d'appels de dessin)
    W.cullT = (W.cullT || 0) - dt; if (W.cullT > 0) return; W.cullT = 0.4;
    const c = ML.camera.position; for (const v of W.staff) v.group.visible = Math.abs(v.group.position.x - c.x) < 55 && Math.abs(v.group.position.z - c.z) < 55;
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
    if (C.open) W.shell(key, C, P, g, tex);                         // V5 : on entre (accueil, showroom, gendarmerie)
    else {
      U.box(C.w, C.h, C.d, tex, 0, C.h / 2, 0, g); U.box(C.w + 0.8, 0.5, C.d + 0.8, C.roof, 0, C.h + 0.25, 0, g); U.box(C.w + 0.2, 0.6, C.d + 0.2, 0x555555, 0, 0.3, 0, g);
      U.addCollider(P.x - P.hx, P.x + P.hx, P.z - P.hz, P.z + P.hz, 'building');
    }
    ML.mapRects.push({ x: P.x, z: P.z, w: P.hx * 2, d: P.hz * 2, c: '#' + new THREE.Color(C.roof).getHexString(), name: C.short || (C.name.split(' ')[0] === 'Boulangerie' ? 'Boulangerie' : C.name.split(' ')[0]), comp: key });
    const fz = C.d / 2 + 0.06;
    U.box(6, 4.6, 0.12, T.mat('tole', 3, 1, 0x95a5a6), -C.w / 2 + 5, 2.3, fz, g); if (!C.open) U.box(1.2, 2.2, 0.12, 0x5d4037, C.w / 2 - 3, 1.1, fz, g);
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
      case 'concession': {                                              // voitures en vitrine + fanions
        const ca = Math.cos(g.rotation.y), sa = Math.sin(g.rotation.y);
        [0xf4c430, 0x95a5a6, 0x2c6fbb].forEach((col, i) => {
          const lx = C.w / 2 + 3, lz = -4.5 + i * 4.5;
          U.box(1.8, 1.1, 4.2, col, lx, 0.75, lz, g); U.box(1.6, 0.6, 2, 0x9fd3ff, lx, 1.55, lz - 0.2, g);
          U.boxCollider(P.x + lx * ca + lz * sa, P.z - lx * sa + lz * ca, P.rot % 2 ? 4.2 : 1.8, P.rot % 2 ? 1.8 : 4.2, 'vitrine');
        });
        for (let i = 0; i < 7; i++) U.box(0.5, 0.5, 0.05, [0xe74c3c, 0xf1c40f, 0x3498db][i % 3], -C.w / 2 + 2 + i * 3, C.h + 0.6, C.d / 2 + 0.3, g).rotation.z = Math.PI / 4;
        const l = U.label('🚗 SHOWROOM : entrez, E sur un véhicule', { size: 0.45, color: '#fff', bg: 'rgba(192,57,43,0.9)' }); l.position.set(C.w / 2 - 3, 3.6, C.d / 2 + 1); g.add(l);
        break;
      }
    }
    ML.Decor.company(key, C, P);
  };

  /* ---------- V5 : bâtiments où l'on ENTRE ----------
     Murs séparés (avec collisions), porte d'entrée à droite de la façade,
     plafond, sol, éclairage, mobilier, employés. Le PNJ de l'entreprise
     attend derrière l'accueil (sa position est déplacée à l'intérieur). */
  const DOOR = 2.8;
  function frameOf(P) {
    const a = P.rot * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const L = (lx, lz) => ({ x: P.x + lx * ca + lz * sa, z: P.z - lx * sa + lz * ca });
    const col = (lx, lz, w, d, tag) => { const p = L(lx, lz), sw = P.rot % 2 ? d : w, sd = P.rot % 2 ? w : d; U.boxCollider(p.x, p.z, sw, sd, tag || 'building'); };
    return { a, L, col };
  }
  W.shell = (key, C, P, g, tex) => {
    const t = 0.35, hw = C.w / 2, hd = C.d / 2, h = C.h, dx = hw - 3, d0 = dx - DOOR / 2, d1 = dx + DOOR / 2, Fr = frameOf(P), F = ML.Decor.frame(P.x, P.z, P.rot);
    const inner = { client: 0xf4f1ea, concession: 0xffffff, police: 0xe8eef5, mall: 0xfdf6ec, gym: 0xeef7f4 }[C.kind] || 0xf0f0f0;
    const wl = (lx, lz, w, d) => { U.box(w, h, d, tex, lx, h / 2, lz, g); Fr.col(lx, lz, w, d); };
    wl(0, -hd + t / 2, C.w, t); wl(-hw + t / 2, 0, t, C.d); wl(hw - t / 2, 0, t, C.d);
    wl((-hw + d0) / 2, hd - t / 2, d0 + hw, t); wl((d1 + hw) / 2, hd - t / 2, hw - d1, t);
    U.box(DOOR, h - 3, t, tex, dx, 3 + (h - 3) / 2, hd - t / 2, g);                                   // linteau
    const roof = U.box(C.w + 0.8, 0.5, C.d + 0.8, C.roof, 0, h + 0.25, 0, g); roof.castShadow = false;
    U.box(C.w - 2 * t, 0.06, C.d - 2 * t, C.kind === 'concession' ? 0xf2f2f2 : C.kind === 'police' ? 0x9aa7b4 : C.kind === 'mall' ? 0xe8dcc8 : C.kind === 'gym' ? 0x3d4a52 : 0xc8b9a6, 0, 0.03, 0, g).castShadow = false;
    W.ceilMat = W.ceilMat || new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x9a9a9a });
    U.box(C.w - 2 * t, 0.1, C.d - 2 * t, W.ceilMat, 0, h - 0.06, 0, g).castShadow = false;            // plafond (éclairé)
    // peinture intérieure (sinon on voit la tôle / la brique dedans)
    // (le petit décor va dans le « lot » fusionné de decor.js : très peu d'appels de dessin)
    for (const [lx, lz, w, d] of [[0, -hd + t + 0.02, C.w - 2 * t, 0.04], [-hw + t + 0.02, 0, 0.04, C.d - 2 * t], [hw - t - 0.02, 0, 0.04, C.d - 2 * t], [(-hw + t + d0) / 2, hd - t - 0.02, d0 + hw - t, 0.04], [(d1 + hw - t) / 2, hd - t - 0.02, hw - t - d1, 0.04]])
      F.box(w, h - 0.2, d, lx, (h - 0.2) / 2, lz, inner);
    // encadrement de porte + portes vitrées ouvertes
    for (const s2 of [-1, 1]) F.box(0.18, 3, 0.5, dx + s2 * (DOOR / 2 + 0.05), 1.5, hd - 0.1, 0x2c3e50);
    F.box(DOOR + 0.4, 0.2, 0.5, dx, 3.05, hd - 0.1, 0x2c3e50);
    for (const s2 of [-1, 1]) F.glass(DOOR / 2 - 0.1, 2.8, 0.06, dx + s2 * (DOOR / 2 + 0.55), 1.45, hd + 0.6, 0xcfe8ff, { ry: s2 * 1.25 });
    F.box(2.6, 0.02, 1.6, dx, 0.062, hd + 0.9, 0x444444);                                               // paillasson
    for (let x = -hw + 3; x <= hw - 3; x += 5) for (let z = -hd + 3; z <= hd - 3; z += 5) F.box(1.6, 0.06, 0.6, x, h - 0.13, z, 0xfffbe8);
    W.interiors.push({ minX: P.x - P.hx + 0.3, maxX: P.x + P.hx - 0.3, minZ: P.z - P.hz + 0.3, maxZ: P.z + P.hz - 0.3, key });
    if (C.kind === 'client') W.inClient(key, C, P, F, Fr);
    else if (C.kind === 'concession') W.inShowroom(key, C, P, F, Fr, g);
    else if (C.kind === 'police') W.inGendarmerie(key, C, P, F, Fr);
    else if (C.kind === 'mall') W.inMall(key, C, P, F, Fr);
    else if (C.kind === 'gym') W.inGym(key, C, P, F, Fr);
  };
  /** Employé de décor (assis à son bureau ou debout) */
  W.addStaff = (Fr, lx, lz, ry, look, seated) => {
    const v = ML.People.build(look, { name: '', bare: true }); root.add(v.group);
    const p = Fr.L(lx, lz); v.group.position.set(p.x, seated ? -0.4 : 0, p.z); v.group.rotation.y = Fr.a + ry;
    if (seated) { v.legL.rotation.x = v.legR.rotation.x = -1.45; v.armL.rotation.x = v.armR.rotation.x = -1.1; }
    v.label.visible = false; v.bubble.visible = false; W.staff.push(v); return v;
  };
  const randLook = r => ({ skin: r.pick(ML.SKINS), shirt: r.pick([0xffffff, 0x2c3e50, 0x95a5a6, 0x3498db, 0xe84393, 0x16a085, 0xf39c12, 0x8e44ad]), pants: r.pick([0x2c3e50, 0x34495e, 0x555555, 0x1f4e9a]), hair: r.pick(ML.HAIRS), height: r.range(1.6, 1.88), width: r.range(0.9, 1.15), longHair: r() < 0.45, glasses: r() < 0.3 });
  function desk(F, x, z, col, screen) {
    F.box(1.8, 0.07, 0.85, x, 0.75, z, col); for (const s2 of [-0.82, 0.82]) F.box(0.06, 0.75, 0.75, x + s2, 0.37, z, 0x555555);
    if (screen !== false) { F.box(0.62, 0.4, 0.05, x, 1.08, z - 0.25, 0x222222); F.glass(0.56, 0.33, 0.02, x, 1.08, z - 0.22, 0x7fc8ff); F.box(0.08, 0.2, 0.08, x, 0.86, z - 0.27, 0x333333); F.box(0.45, 0.02, 0.15, x, 0.79, z + 0.05, 0x2c3e50); }
    F.box(0.5, 0.08, 0.5, x, 0.46, z + 0.75, 0x2c3e50); F.box(0.5, 0.55, 0.07, x, 0.75, z + 1.0, 0x2c3e50); F.sh('cyl', 0.06, 0.42, 0.06, x, 0.21, z + 0.75, 0x777777);
    F.col(x, z, 1.8, 0.85);
  }
  W.inClient = (key, C, P, F, Fr) => {
    const hw = C.w / 2, hd = C.d / 2, dx = hw - 3, r = U.rng(key.length * 977 + Math.round(P.x)), roof = C.roof;
    // accueil, face à la porte
    F.box(3.6, 1.05, 0.8, dx, 0.53, hd - 4.4, 0xf5f5f5); F.box(3.8, 0.08, 1.0, dx, 1.08, hd - 4.4, roof); F.box(3.6, 0.25, 0.05, dx, 0.8, hd - 3.98, roof);
    F.col(dx, hd - 4.4, 3.6, 0.8);
    const sp = Fr.L(dx, hd - 3.97); ML.Decor.sign(C.name, 'accueil', '#' + new THREE.Color(roof).getHexString(), '#fff', 2.4, 0.5, sp.x, 0.62, sp.z, Fr.a, {});
    F.box(0.7, 0.45, 0.06, dx - 1.1, 1.35, hd - 4.6, 0x222222); F.glass(0.64, 0.38, 0.02, dx - 1.1, 1.35, hd - 4.56, 0x7fc8ff);
    P.npc = Object.assign(Fr.L(dx, hd - 5.3), { yaw: Fr.a });                   // le contact client attend ici
    // logo au mur du fond
    const lg = Fr.L(0, -hd + 0.45); ML.Decor.sign(C.name, { aerotech: 'aéronautique · qualité zéro défaut', agrimeca: 'machines agricoles', novatics: 'start-up disruptive (on ne sait pas de quoi)', ublo: 'la petite boîte qui monte', espacil: 'bailleur social · 22 000 logements' }[key] || '', '#' + new THREE.Color(roof).getHexString(), '#fff', 7, 1.8, lg.x, Math.min(C.h - 1.6, 3.6), lg.z, Fr.a, { glow: true, border: '#fff' });
    // salle d'attente (à gauche de la porte)
    const wx = dx - 6;
    for (let i = 0; i < 3; i++) { F.box(0.6, 0.45, 0.6, wx - 1.4 + i * 0.75, 0.23, hd - 1.2, 0x2c3e50); F.box(0.6, 0.5, 0.1, wx - 1.4 + i * 0.75, 0.7, hd - 0.92, 0x2c3e50); }
    F.box(1.1, 0.35, 0.6, wx + 1.3, 0.18, hd - 1.6, 0x8d6e63); F.box(0.3, 0.02, 0.22, wx + 1.2, 0.37, hd - 1.6, 0xffffff);
    F.sh('cyl', 0.3, 0.5, 0.3, wx + 2.6, 0.25, hd - 1.0, 0x8d6e63); F.sh('ball', 0.9, 1.2, 0.9, wx + 2.6, 1.05, hd - 1.0, 0x27ae60);
    F.col(wx - 0.65, hd - 1.1, 2.4, 0.7);
    // open space : bureaux + employés
    const rows = C.d >= 16 ? [-hd + 2.5, -hd + 6] : [-hd + 2.5];
    let n = 0;
    for (const z of rows) for (let x = -hw + 2.6; x <= hw - 7.5; x += 4.2) {
      desk(F, x, z, r.pick([0xecf0f1, 0xd7ccc8, 0xbdc3c7]));
      if (n < 4 && r() < 0.75) { W.addStaff(Fr, x, z + 0.78, Math.PI, randLook(r), true); n++; }
    }
    // la touche de chaque entreprise
    const midX = -hw + C.w * 0.35, cz = rows.length > 1 ? -hd + 9 : -hd + 5.5;
    if (key === 'aerotech') {                                                      // maquette d'avion suspendue
      const y = C.h - 2.2; F.sh('cyl', 0.5, 5, 0.5, midX, y, cz, 0xecf0f1, { rx: Math.PI / 2 }); F.sh('cone', 0.5, 1, 0.5, midX, y, cz + 3, 0xecf0f1, { rx: Math.PI / 2 });
      F.box(6, 0.1, 1.2, midX, y, cz + 0.3, 0xbdc3c7); F.box(2.2, 0.08, 0.7, midX, y + 0.1, cz - 2.2, 0xbdc3c7); F.box(0.08, 1.1, 0.7, midX, y + 0.5, cz - 2.2, 0x0984e3);
      for (const s2 of [-1, 1]) F.sh('cyl', 0.01, C.h - y, 0.01, midX + s2 * 2, y + (C.h - y) / 2, cz, 0x333333);
    } else if (key === 'agrimeca') {                                               // roue de tracteur + petit tracteur exposé
      F.sh('cyl', 2.4, 0.7, 2.4, midX, 1.2, cz, 0x222222, { rz: Math.PI / 2 }); F.sh('cyl', 1.2, 0.72, 1.2, midX, 1.2, cz, 0xf1c40f, { rz: Math.PI / 2 }); F.col(midX, cz, 0.8, 2.4);
      F.box(1.4, 0.8, 2.2, midX + 3, 0.9, cz, 0x27ae60); F.box(1.0, 0.9, 0.9, midX + 3, 1.7, cz - 0.4, 0x27ae60); for (const s2 of [-1, 1]) { F.sh('cyl', 1.3, 0.4, 1.3, midX + 3 + s2 * 0.85, 0.65, cz - 0.6, 0x222222, { rz: Math.PI / 2 }); F.sh('cyl', 0.8, 0.3, 0.8, midX + 3 + s2 * 0.8, 0.4, cz + 0.8, 0x222222, { rz: Math.PI / 2 }); } F.col(midX + 3, cz, 2.2, 2.6);
    } else if (key === 'novatics') {                                               // baby-foot, poufs, néon
      F.box(1.4, 0.85, 0.8, midX, 0.45, cz, 0x27ae60); for (let i = 0; i < 4; i++) F.sh('cyl', 0.03, 1.6, 0.03, midX - 0.5 + i * 0.33, 0.85, cz, 0xbdc3c7, { rx: Math.PI / 2 }); F.col(midX, cz, 1.4, 0.8);
      for (let i = 0; i < 3; i++) F.sh('ball', 1.0, 0.7, 1.0, midX + 2.5 + i * 1.3, 0.35, cz + (i % 2) * 0.8, [0xff6f61, 0xf1c40f, 0x00a8e8][i]);
      const ns = Fr.L(midX + 3, -hd + 0.45); ML.Decor.sign('INNOVATION', '#disruption #synergie', '#2d3e50', '#00e5ff', 4, 1, ns.x, C.h - 2.5, ns.z, Fr.a, { glow: true });
    } else if (key === 'ublo') {                                                   // bar à café + plantes
      F.box(3, 1.05, 0.7, midX, 0.53, cz, 0x8d6e63); F.box(3.2, 0.08, 0.9, midX, 1.08, cz, 0xff6f61); F.box(0.45, 0.6, 0.45, midX - 1, 1.42, cz, 0x2c3e50); F.col(midX, cz, 3, 0.7);
      for (let i = 0; i < 3; i++) { F.sh('cyl', 0.3, 0.5, 0.3, midX + 3 + i * 1.2, 0.25, cz, 0xffffff); F.sh('ball', 0.8, 1.3, 0.8, midX + 3 + i * 1.2, 1.1, cz, 0x2e8b57); }
    } else if (key === 'espacil') {                                                // tableau de clés + maquette de résidence
      F.box(2.6, 1.6, 0.08, midX, 1.6, -hd + 0.45, 0x8d6e63); for (let i = 0; i < 24; i++) F.box(0.06, 0.18, 0.02, midX - 1.1 + (i % 8) * 0.31, 1.15 + Math.floor(i / 8) * 0.45, -hd + 0.5, [0xf1c40f, 0x95a5a6, 0x13a89e][i % 3]);
      F.box(2.2, 0.8, 1.6, midX + 3.5, 0.4, cz, 0xffffff); F.col(midX + 3.5, cz, 2.2, 1.6);
      for (let i = 0; i < 4; i++) { const hh = 0.5 + (i % 3) * 0.25; F.box(0.45, hh, 0.45, midX + 2.9 + (i % 2) * 0.9, 0.8 + hh / 2, cz - 0.4 + Math.floor(i / 2) * 0.8, 0xf3efe6); F.box(0.47, 0.06, 0.47, midX + 2.9 + (i % 2) * 0.9, 0.82 + hh, cz - 0.4 + Math.floor(i / 2) * 0.8, 0x13a89e); }
      const ps = Fr.L(dx - 6, -hd + 0.45); ML.Decor.sign('LOGEMENTS\nDISPONIBLES', 'demandez à l\'accueil', '#13a89e', '#fff', 3, 1.6, ps.x, 2.2, ps.z, Fr.a, { border: '#fff' });
    }
  };
  W.inShowroom = (key, C, P, F, Fr, g) => {
    const hw = C.w / 2, hd = C.d / 2, dx = hw - 3;
    // bureau de Bernard
    F.box(2.4, 0.78, 1.0, dx - 4.5, 0.39, 2.4, 0x5d4037); F.box(2.5, 0.06, 1.1, dx - 4.5, 0.8, 2.4, 0x3e2723); F.box(0.6, 0.4, 0.05, dx - 4.5, 1.05, 2.1, 0x222222); F.col(dx - 4.5, 2.4, 2.4, 1.0);
    for (const s2 of [-0.6, 0.6]) { F.box(0.5, 0.45, 0.5, dx - 4.5 + s2, 0.23, 3.5, 0xc0392b); F.box(0.5, 0.45, 0.08, dx - 4.5 + s2, 0.65, 3.75, 0xc0392b); }
    P.npc = Object.assign(Fr.L(dx - 4.5, 1.4), { yaw: Fr.a });
    const ad = Fr.L(0, -hd + 0.45); ML.Decor.sign('GARAGE PASQUIER', 'occasions garanties*  (*garanties d\'avoir 4 roues)', '#c0392b', '#fff', 9, 1.8, ad.x, 4.6, ad.z, Fr.a, { glow: true, border: '#fff' });
    // véhicules exposés sur podium
    const spots = { megane: { x: -hw + 5, z: -1.5, ry: 0.55, r: 3.1 }, ducato: { x: -hw + 12.5, z: -2, ry: 0.35, r: 3.4 }, camion: { x: 4.5, z: -hd + 3.6, ry: Math.PI / 2, r: 0 }, scooter: { x: -hw + 5.5, z: hd - 4.3, ry: 0.9, r: 1.5 } };
    for (const k in spots) {
      const s2 = spots[k], D = ML.DEALER[k], V = ML.VEHICLES[k];
      if (s2.r) { F.sh('cyl', s2.r * 2, 0.16, s2.r * 2, s2.x, 0.08, s2.z, 0xdfe6e9); F.sh('cyl', s2.r * 2 - 0.2, 0.02, s2.r * 2 - 0.2, s2.x, 0.17, s2.z, 0xb2bec3); }
      else { F.box(9.4, 0.16, 3.4, s2.x, 0.08, s2.z, 0xdfe6e9); }
      const m = ML.Cars.model(k, V.color); const wp = Fr.L(s2.x, s2.z); m.position.set(wp.x, 0.17, wp.z); m.rotation.y = Fr.a + s2.ry; root.add(m); W.staff.push({ group: m });
      const bw = k === 'camion' ? 9 : k === 'scooter' ? 0.8 : 2.4, bd = k === 'camion' ? 2.8 : k === 'scooter' ? 1.9 : 4.8, ca = Math.abs(Math.cos(s2.ry)), sa = Math.abs(Math.sin(s2.ry));
      Fr.col(s2.x, s2.z, bw * ca + bd * sa, bw * sa + bd * ca, 'vitrine');
      // panneau de caractéristiques (face à l'entrée)
      const spec = (D.specs || []).map(([a2, b2]) => `${a2} : ${ML.CFG[b2] && ML.CFG[b2].max ? Math.round(ML.CFG[b2].max * 3.6) + ' km/h' : b2}`);
      const pz = s2.r ? s2.z + s2.r + 0.6 : s2.z + 2.3, px = s2.r ? s2.x : s2.x - 2.5;
      F.box(0.08, 1.1, 0.08, px, 0.55, pz, 0x7f8c8d); F.box(0.7, 0.04, 0.4, px, 0.02, pz, 0x7f8c8d);
      const sp = Fr.L(px, pz + 0.05); const pan = ML.Decor.sign(`${D.name}\n${Math.round(D.price * (W.black ? ML.ECO.black.dealer : 1)).toLocaleString('fr-FR')} €${W.black ? ' (Black Friday)' : ''}`, spec.join('  ·  '), '#1a2340', '#ffd257', 2.4, 1.3, sp.x, 1.55, sp.z, Fr.a, { border: '#ffd257', glow: true });
      W.show[k] = { pan, label: null };
      const tp = Fr.L(px, pz + 1.0); W.targets.push({ id: 'show:' + k, x: tp.x, y: 1.2, z: tp.z, r: 3.2 });
      const sold = U.label('', { size: 0.5, color: '#3ecf6e', bg: 'rgba(0,0,0,0.75)' }); sold.position.set(sp.x, 2.6, sp.z); add(sold); W.show[k].label = sold;
    }
    // plantes, déco
    for (const [x, z] of [[-hw + 1.2, hd - 1.2], [hw - 1.2, -hd + 1.2], [-hw + 1.2, -hd + 1.2]]) { F.sh('cyl', 0.35, 0.55, 0.35, x, 0.28, z, 0xffffff); F.sh('ball', 1, 1.5, 1, x, 1.2, z, 0x27ae60); }
    for (let i = 0; i < 9; i++) F.box(0.5, 0.5, 0.04, -hw + 2 + i * 3, C.h - 0.6, hd - 0.5, [0xe74c3c, 0xf1c40f, 0x3498db][i % 3], { rz: Math.PI / 4 });
  };
  W.inGendarmerie = (key, C, P, F, Fr) => {
    const hw = C.w / 2, hd = C.d / 2, dx = hw - 3;
    // accueil (comptoir + vitre)
    F.box(4, 1.1, 0.8, dx, 0.55, hd - 4.4, 0x1f3a93); F.box(4.2, 0.08, 1.0, dx, 1.12, hd - 4.4, 0xecf0f1); F.glass(4, 0.9, 0.05, dx, 1.6, hd - 4.7, 0xcfe8ff);
    F.col(dx, hd - 4.4, 4, 0.8);
    P.npc = Object.assign(Fr.L(dx, hd - 5.4), { yaw: Fr.a });
    const sg = Fr.L(dx, hd - 3.97); ML.Decor.sign('ACCUEIL', 'caution · plaintes · objets trouvés', '#1f3a93', '#fff', 2.6, 0.5, sg.x, 0.62, sg.z, Fr.a, {});
    // banc d'attente, bureau, affiches
    F.box(3, 0.45, 0.5, -1, 0.23, hd - 0.8, 0x7f8c8d); F.col(-1, hd - 0.8, 3, 0.5);
    desk(F, -hw + 3, 1.5, 0xbdc3c7); W.addStaff(Fr, -hw + 3, 2.28, Math.PI, { skin: 0xf0c8a0, shirt: 0x1f3a93, pants: 0x1c2a5a, hair: 0x3b2a1a, height: 1.76, cap: 0x1f3a93 }, true);
    const p1 = Fr.L(-hw + 0.45, 1.5); ML.Decor.sign('AVIS DE RECHERCHE', 'conducteur de Mégane jaune · très rapide', '#f5e6c8', '#2c3e50', 2.2, 1.5, p1.x, 2.2, p1.z, Fr.a + Math.PI / 2, { border: '#2c3e50' });
    const p2 = Fr.L(1.5, hd - 0.45); ML.Decor.sign('PIÉTONS = PRIORITÉ', '3 renversés = garde à vue', '#c0392b', '#fff', 2.6, 1.2, p2.x, 2.4, p2.z, Fr.a + Math.PI, {});
    // cellules (garde à vue) contre le mur du fond
    const cz0 = -hd + 0.35, cz1 = -hd + 4.4, cells = [-hw + 3, -hw + 7.6], cw = 4.4;
    ML.LOC.jail = []; ML.LOC.jailOut = Fr.L(dx, hd + 3);
    for (const cx of cells) {
      for (const s2 of [-1, 1]) { F.box(0.2, 3, cz1 - cz0, cx + s2 * cw / 2, 1.5, (cz0 + cz1) / 2, 0xbdc3c7); Fr.col(cx + s2 * cw / 2, (cz0 + cz1) / 2, 0.2, cz1 - cz0, 'cellule'); }
      for (let x = cx - cw / 2 + 0.15; x <= cx + cw / 2 - 0.1; x += 0.22) F.sh('cyl', 0.04, 3, 0.04, x, 1.5, cz1, 0x555555);
      F.box(cw, 0.12, 0.12, cx, 2.95, cz1, 0x555555); F.box(cw, 0.12, 0.12, cx, 1.2, cz1, 0x555555);
      Fr.col(cx, cz1, cw, 0.3, 'barreaux');
      F.box(1.9, 0.45, 0.8, cx - 1, 0.23, cz0 + 0.5, 0x7f8c8d); F.box(1.8, 0.12, 0.7, cx - 1, 0.5, cz0 + 0.5, 0xc0392b);       // banc-lit
      F.sh('cyl', 0.25, 0.45, 0.25, cx + 1.6, 0.23, cz0 + 0.5, 0xecf0f1);
      ML.LOC.jail.push(Object.assign(Fr.L(cx + 0.3, (cz0 + cz1) / 2 + 0.4), { yaw: Fr.a }));
    }
    const ct = Fr.L((cells[0] + cells[1]) / 2, cz1 + 0.3); ML.Decor.sign('GARDE À VUE', 'ne pas nourrir les détenus', '#2c3e50', '#fff', 3, 0.7, ct.x, 3.4, ct.z, Fr.a, {});
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
      if (!ML.Decor.building(f)) {                                  // maison / boutique / immeuble à balcons… ou modèle KayKit
        const b = place(f.model, 7.5, f.x, f.z, f.rot * Math.PI / 2, false);
        if (!b) U.box(14, 12, 14, T.mat('brique', 3, 3, 0xf6e58d), f.x, 6, f.z, root);
        else { b.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(b); f.box = [Math.max(bb.min.x, f.x - 7.5), Math.min(bb.max.x, f.x + 7.5), Math.max(bb.min.z, f.z - 7.5), Math.min(bb.max.z, f.z + 7.5)]; }
      }
      const LI = f.lieu && ML.LIEUX[f.lieu];
      if (f.fp) { const a = f.rot * Math.PI / 2, odd = f.rot % 2 !== 0; U.boxCollider(f.x + f.fp[2] * Math.sin(a), f.z + f.fp[2] * Math.cos(a), odd ? f.fp[1] : f.fp[0], odd ? f.fp[0] : f.fp[1], 'city'); }   // V5.3 : collision à la taille du bâtiment
      else if (f.box) U.addCollider(f.box[0], f.box[1], f.box[2], f.box[3], 'city');
      else U.boxCollider(f.x, f.z, 15, 15, 'city');
      ML.mapRects.push({ x: f.x, z: f.z, w: 15, d: 15, c: f.espacil ? '#13a89e' : LI ? LI.color : '#8e7f74', name: f.espacil ? 'Espacil' : LI ? LI.name.replace(/^(Maison|Appartement) de /, '🏠 ') : undefined });
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
      U.box(0.2, 3, 0.2, 0x7f8c8d, r.x, 1.5, r.z, root);
      const head = U.box(0.7, 0.9, 0.7, 0x95a5a6, r.x, 3.3, r.z, root);
      const lamp = U.box(0.3, 0.3, 0.75, W.flashOff, r.x, 3.3, r.z, root, false);
      const l = U.label('RADAR 60', { size: 0.3, color: '#fff', bg: 'rgba(192,57,43,0.9)' }); l.position.set(r.x, 4.3, r.z); add(l);
      U.boxCollider(r.x, r.z, 0.7, 0.7, 'radar'); W.targets.push({ id: 'radar:' + W.radars.length, x: r.x, y: 1.4, z: r.z, r: 2.2 });
      W.radars.push({ x: r.x, z: r.z, lamp, head, label: l, flash: 0 });
    }
    // feux tricolores
    W.lightRed = U.mat(0xff2222, 0xff0000); W.lightGreenMat = U.mat(0x22ff44, 0x00cc22); W.lightOff = U.mat(0x222222);
    const N2 = city.nodes, sd2 = ML.CityGen.segDist;
    for (const ni of city.lights) {
      const n = N2[ni];
      // V5 : le feu se pose sur le coin de trottoir le plus éloigné des chaussées (plus jamais au milieu de la route)
      let x = n.x + city.RW + 1.2, z = n.z + city.RW + 1.2, best = -1;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, px = n.x + Math.cos(a) * (city.RW + 2.2) * 1.15, pz = n.z + Math.sin(a) * (city.RW + 2.2) * 1.15;
        let m = 99; for (const e of city.edges) m = Math.min(m, sd2(px, pz, N2[e.a].x, N2[e.a].z, N2[e.b].x, N2[e.b].z));
        if (m > best) { best = m; x = px; z = pz; }
      }
      U.box(0.15, 3.6, 0.15, 0x333333, x, 1.8, z, root); U.box(0.4, 0.9, 0.35, 0x222222, x, 3.6, z, root);
      const red = U.box(0.22, 0.22, 0.4, W.lightRed, x, 3.85, z, root, false), green = U.box(0.22, 0.22, 0.4, W.lightGreenMat, x, 3.35, z, root, false);
      U.boxCollider(x, z, 0.4, 0.4, 'feu'); W.lights.push({ node: ni, red, green });
    }
    // arbres (instanciés : beaucoup d'arbres pour peu d'appels de dessin)
    const pines = city.trees.filter(t => t.c === 3), round = city.trees.filter(t => t.c !== 3);   // un arbre sur quatre devient un sapin
    for (const t of pines) U.boxCollider(t.x, t.z, 0.6, 0.6, 'tree');
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 2.2, 6), U.mat(0x6d4c41), round.length);
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), round.length * 3);
    const cols = [0x2d6a4f, 0x40916c, 0x52b788, 0x588157].map(c => new THREE.Color(c));
    trunks.castShadow = leaves.castShadow = true;
    round.forEach((t, i) => {
      const gy = ML.gy(t.x, t.z);
      o.position.set(t.x, gy + 1.1, t.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 3; k++) {
        const s = t.k - k * 0.22; o.position.set(t.x + (k - 1) * 0.3, gy + 2.4 + k * 1.05 * t.k, t.z + (1 - k) * 0.25); o.scale.set(s, s, s); o.rotation.set(0, k, 0); o.updateMatrix();
        leaves.setMatrixAt(i * 3 + k, o.matrix); leaves.setColorAt(i * 3 + k, cols[t.c]);
      }
      U.boxCollider(t.x, t.z, 0.6, 0.6, 'tree');
    });
    add(trunks); add(leaves);
    for (const b of city.bushes) place('city_bush', b.s, b.x, b.z, b.ry, false, ML.gy(b.x, b.z));
    ML.Decor.streets(city); ML.Decor.nature(city, pines);
  };

  /* ---------- V5.2 : poste de préparation, toilettes, meuleuse, maisons des copains ---------- */
  W.vie52 = city => {
    ML.LOC.houses = []; ML.LOC.lieux = {};
    for (const f of city.fillers) {
      const a = f.rot * Math.PI / 2, d = { x: f.x + 9.2 * Math.sin(a), z: f.z + 9.2 * Math.cos(a) };
      if (f.lieu && ML.LIEUX[f.lieu]) {
        ML.LOC.lieux[f.lieu] = Object.assign(d, { name: ML.LIEUX[f.lieu].name });
        const l = U.label('🏠 ' + ML.LIEUX[f.lieu].name, { size: 0.9, color: '#fff', bg: 'rgba(0,0,0,0.55)' }); l.position.set(f.x, 16, f.z); add(l);
      } else if (!f.espacil) ML.LOC.houses.push(d);
    }
    // poste de préparation d'usinage (allumé quand il est acheté au PC)
    const PX = -5.5, PZ = 9.6, g = add(new THREE.Group()); g.position.set(PX, 0, PZ);
    U.box(3.4, 0.85, 1.1, 0x5d6d7e, 0, 0.425, 0, g); U.box(3.5, 0.08, 1.2, 0x2e86de, 0, 0.89, 0, g);
    U.box(3.4, 1.5, 0.08, 0x34495e, 0, 1.65, 0.56, g); U.box(3.5, 0.3, 0.3, 0x2e86de, 0, 2.5, 0.45, g);
    for (let i = 0; i < 7; i++) U.box(0.08, 0.32, 0.04, [0xffd23f, 0x3fa7ff, 0xff7a3f][i % 3], -1.3 + i * 0.43, 1.75, 0.5, g, false);
    for (const x of [-1.2, 0, 1.2]) U.box(0.85, 0.02, 0.6, 0x1b4f8a, x, 0.935, 0.05, g, false);
    U.boxCollider(PX, PZ, 3.4, 1.1, 'prepa');
    W.prepaLabel = U.label('', { size: 0.34, color: '#9fd0ff' }); W.prepaLabel.position.set(PX, 3.1, PZ); add(W.prepaLabel);
    W.targets.push({ id: 'prepa', x: PX, y: 1, z: PZ - 1.1, r: 2.2 });
    ML.LOC.prepa = { x: PX, z: PZ, spots: [-1.2, 0, 1.2].map(dx => ({ x: PX + dx, y: 0.95, z: PZ + 0.05 })) };
    W.floorText('POSTE DE PRÉPARATION', 'kits brut + outil', 3.6, 1.0, PX, PZ - 1.3, { bg: 'rgba(46,134,222,0.55)', color: '#fff', y: 0.046 });
    // toilettes : cabine de chantier, dehors à gauche de l'atelier
    const TX = -24, TZ = 10, tg = add(new THREE.Group()); tg.position.set(TX, 0, TZ);
    U.box(2.2, 2.5, 2.2, 0x2e86de, 0, 1.25, 0, tg); U.box(2.4, 0.15, 2.4, 0x1b4f8a, 0, 2.58, 0, tg); U.box(2.3, 0.2, 2.3, 0x1b4f8a, 0, 0.1, 0, tg);
    U.box(0.06, 2.1, 1.0, 0x1b4f8a, 1.12, 1.15, 0, tg); U.box(0.04, 0.32, 0.5, 0xffffff, 1.16, 1.95, 0, tg); U.box(0.05, 0.08, 0.08, 0xbdc3c7, 1.17, 1.1, -0.35, tg);
    U.boxCollider(TX, TZ, 2.3, 2.3, 'wc');
    W.wcLabel = U.label('🚽 WC', { size: 0.4, color: '#fff', bg: 'rgba(46,134,222,0.85)' }); W.wcLabel.position.set(TX, 3.4, TZ); add(W.wcLabel);
    W.wcDirt = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8bc34a, transparent: true, opacity: 0, depthWrite: false })); W.wcDirt.position.set(TX + 0.4, 1.6, TZ); add(W.wcDirt);
    W.targets.push({ id: 'wc', x: TX + 1.7, y: 1.2, z: TZ, r: 2.2 }); ML.LOC.wc = { x: TX + 1.8, z: TZ };
    ML.mapRects.push({ x: TX, z: TZ, w: 2.3, d: 2.3, c: '#2e86de', name: 'WC' });
    W.floorText('🚽 TOILETTES →', '', 3, 0.8, -21.5, 13.2, { color: '#ffffff', bg: 'rgba(46,134,222,0.6)', y: 0.05, rot: Math.PI / 2 });
    // crochet de la meuleuse (mur gauche, à côté des clés)
    ML.LOC.grinder = { x: -19.2, y: 0.95, z: 3.6 };
  };
  /** V5.2 : étiquettes du poste de prépa et des WC, compte à rebours des zones bloquées */
  W.vieVisuals = (dt, S) => {
    // V5.3 : cible « quest » (E) sur le lieu du service en cours — elle manquait, on ne pouvait pas finir les quêtes
    const Q = S.quest, qi = W.targets.findIndex(t => t.id === 'quest');
    if (Q && Q.st === 'go') { const t = qi >= 0 ? W.targets[qi] : (W.targets.push({ id: 'quest', r: 3.2 }), W.targets[W.targets.length - 1]); t.x = Q.at.x; t.z = Q.at.z; t.y = ML.gy(Q.at.x, Q.at.z) + 1.1; }
    else if (qi >= 0) W.targets.splice(qi, 1);
    W.vieT = (W.vieT || 0) - dt; if (W.vieT > 0) return; W.vieT = 0.5;
    const up = S.up || {}, blk = S.black ? ML.ECO.black.cat : 1;
    if (W.prepaLabel) {
      const t = up.prepa ? `🧰 POSTE DE PRÉPA${S.prepaMsg ? ' — ' + S.prepaMsg : ' : prends un kit'}` : `🔒 POSTE DE PRÉPA — au PC (${Math.round(ML.CATALOG.prepa.price * blk)} €)`;
      if (W.prepaLabel._t !== t) { W.prepaLabel._t = t; W.prepaLabel.setText(t, up.prepa ? (S.prepaMsg ? '#ffb86b' : '#9fd0ff') : '#bbbbbb'); }
    }
    if (W.wcLabel) {
      const w = Math.round(S.wc || 0), t = w >= 100 ? '🤢 WC : ÇA DÉBORDE !' : w >= ML.ECO.wc.slow ? `🤢 WC : sales (${w} %)` : `🚽 WC (${w} %)`;
      if (W.wcLabel._t !== t) { W.wcLabel._t = t; W.wcLabel.setText(t, w >= ML.ECO.wc.slow ? '#c8ff8a' : '#fff'); }
      W.wcDirt.material.opacity = w >= 45 ? (w - 45) / 55 * 0.38 : 0; W.wcDirt.visible = w >= 45;
    }
    for (const L of W.lockTexts || []) {
      const it = ML.CATALOG[L.k], day = (S.co && S.co.day) || S.day || 1, rem = Math.max(0, it.day - day - (S.rt || 0) / ML.CFG.SHIFT_SEC);
      let t, sub, col;
      if (up[L.k]) { t = `✔ ${L.label}\nACHETÉ`; sub = L.k === 'extension' ? 'construite cette nuit' : 'achète T3 / F3 au PC'; col = '#3ecf6e'; }
      else if (rem > 0) {
        const d = Math.floor(rem), h = Math.floor((rem - d) * 12), fee = Math.round(Math.max(ML.EARLY.min, ML.EARLY.perDay * rem) / 10) * 10;
        t = `🔒 ${L.label}\nse débloque dans ${d ? d + ' j ' : ''}${h ? h + ' h' : d ? '' : 'moins d\'1 h'}`; sub = `ou tout de suite au PC : ${Math.round(it.price * blk) + fee} €`; col = '#ffffff';
      } else { t = `🔓 ${L.label}\ndisponible au PC`; sub = `${Math.round(it.price * blk)} € — onglet Atelier`; col = '#ffd257'; }
      if (L._k !== t + sub) { L._k = t + sub; L.m.userData.redraw(t, sub, { color: col }); }
    }
  };
  /* ---------- V5.2 : centre commercial et salle de sport ---------- */
  W.inMall = (key, C, P, F, Fr) => {
    const hw = C.w / 2, hd = C.d / 2, dx = hw - 3, r = U.rng(4242 + Math.round(P.x * 7));
    // caisse principale près de l'entrée (Sandra)
    F.box(2.6, 1.0, 0.9, dx - 3.6, 0.5, hd - 4, 0x8e44ad); F.box(2.7, 0.08, 1.0, dx - 3.6, 1.04, hd - 4, 0xf5f0e6); F.box(0.5, 0.35, 0.4, dx - 4.3, 1.25, hd - 4, 0x222222); F.col(dx - 3.6, hd - 4, 2.6, 0.9);
    P.npc = Object.assign(Fr.L(dx - 3.6, hd - 4.9), { yaw: Fr.a });
    // allée : fontaine, bancs, plantes
    F.sh('cyl', 2.6, 0.5, 2.6, -2, 0.25, 2, 0xbdc3c7); F.sh('cyl', 2.2, 0.06, 2.2, -2, 0.5, 2, 0x5dade2); F.sh('cyl', 0.25, 1.2, 0.25, -2, 0.9, 2, 0xbdc3c7); F.col(-2, 2, 2.4, 2.4);
    for (const x of [-9, 5]) { F.box(2.4, 0.45, 0.6, x, 0.23, 2.6, 0x8d6e63); F.col(x, 2.6, 2.4, 0.6); F.sh('cyl', 0.35, 0.55, 0.35, x + 1.8, 0.28, 2.6, 0xffffff); F.sh('ball', 0.9, 1.3, 0.9, x + 1.8, 1.1, 2.6, 0x27ae60); }
    if (W.black) { const bf = Fr.L(-2, hd - 0.5); ML.Decor.sign('BLACK FRIDAY', 'tout à −50 % aujourd\'hui !', '#111111', '#ffd257', 6, 1.4, bf.x, C.h - 2.2, bf.z, Fr.a + Math.PI, { glow: true, border: '#ffd257' }); }
    // stands contre le mur du fond
    const stands = { snack: -8.5, farces: 0, boxe: 7.6 }, z0 = -hd + 2.2;
    for (const st in stands) {
      const sx = stands[st], [title, col] = ML.MALL_STANDS[st], hex = parseInt(col.slice(1), 16), items = Object.keys(ML.MALL).filter(k => ML.MALL[k].stand === st);
      F.box(6.2, 1.0, 1.0, sx, 0.5, z0 + 1.2, hex); F.box(6.4, 0.08, 1.1, sx, 1.04, z0 + 1.2, 0xffffff); F.col(sx, z0 + 1.2, 6.2, 1.0);
      F.box(6.4, 2.8, 0.12, sx, 1.4, -hd + 0.5, hex); F.box(6.6, 0.12, 2.4, sx, 2.85, z0 + 0.2, hex);
      for (let i = 0; i < 4; i++) F.box(1.2, 0.06, 0.4, sx - 2.2 + i * 1.45, 1.9, -hd + 0.75, 0xffffff);
      W.addStaff(Fr, sx + 2.2, z0 + 0.25, 0, randLook(r), false);
      const sg = Fr.L(sx, -hd + 0.6); ML.Decor.sign(title, '', col, '#ffffff', 5.4, 1.0, sg.x, 3.5, sg.z, Fr.a, { glow: true, border: '#ffffff' });
      items.forEach((k, i) => {
        const M2 = ML.MALL[k], ix = sx - (items.length - 1) + i * 2, price = Math.round(M2.price * (W.black ? ML.ECO.black.mall : 1));
        const mesh = ML.Items.mesh({ type: k, d: {} }, { noLabel: true }), wp = Fr.L(ix, z0 + 1.2); mesh.position.set(wp.x, 1.09, wp.z); mesh.rotation.y = Fr.a; mesh.scale.setScalar(['batte', 'baguette'].includes(k) ? 1.1 : 1.6); add(mesh); W.staff.push({ group: mesh });
        const tp = Fr.L(ix, z0 + 2.25); W.targets.push({ id: 'mall:' + k, x: tp.x, y: 1.1, z: tp.z, r: 1.2 });
        const ps2 = Fr.L(ix, z0 + 1.73); ML.Decor.sign(`${M2.icon} ${price} €`, M2.name, '#ffffff', '#222222', 1.7, 0.62, ps2.x, 0.6, ps2.z, Fr.a, { border: col });
      });
    }
    const ad = Fr.L(-hw + 0.45, 0); ML.Decor.sign('LES COPEAUX', 'votre centre commercial', '#8e44ad', '#fff', 5, 1.4, ad.x, 3.2, ad.z, Fr.a + Math.PI / 2, { glow: true });
  };
  W.inGym = (key, C, P, F, Fr) => {
    const hw = C.w / 2, hd = C.d / 2, dx = hw - 3, r = U.rng(777 + Math.round(P.z * 5));
    F.box(2.4, 1.0, 0.8, dx, 0.5, hd - 4.2, 0x16a085); F.box(2.5, 0.08, 0.9, dx, 1.04, hd - 4.2, 0xffffff); F.col(dx, hd - 4.2, 2.4, 0.8);
    P.npc = Object.assign(Fr.L(dx, hd - 5.1), { yaw: Fr.a });
    F.glass(C.w - 3, 2.2, 0.04, 0, 1.7, -hd + 0.42, 0xdff1ff);                                   // miroir
    for (let i = 0; i < 3; i++) {                                                                  // tapis de course
      const x = -hw + 3 + i * 3, z = -hd + 3;
      F.box(1.0, 0.25, 2.2, x, 0.13, z, 0x222222); F.box(0.86, 0.03, 1.9, x, 0.27, z + 0.05, 0x111111);
      for (const s2 of [-0.45, 0.45]) F.box(0.07, 1.2, 0.07, x + s2, 0.85, z - 0.95, 0x95a5a6);
      F.box(1.0, 0.35, 0.25, x, 1.45, z - 0.95, 0x2c3e50); F.glass(0.5, 0.2, 0.02, x, 1.5, z - 0.82, 0x7fffb0); F.col(x, z - 0.95, 1.0, 0.3);
      const tp = Fr.L(x, z + 1.5); W.targets.push({ id: 'gym:' + i, x: tp.x, y: 1.1, z: tp.z, r: 1.4 });
    }
    // haltères, banc, sac de frappe
    F.box(3, 0.9, 0.5, 4, 0.45, -hd + 0.9, 0x555555); for (let i = 0; i < 6; i++) F.sh('cyl', 0.16, 0.5, 0.16, 2.8 + i * 0.48, 1.0, -hd + 0.9, 0x222222, { rz: Math.PI / 2 }); F.col(4, -hd + 0.9, 3, 0.5);
    F.box(0.5, 0.45, 1.6, 0, 0.45, 1, 0x2c3e50); F.box(1.6, 0.05, 0.05, 0, 1.3, 0.6, 0x95a5a6); F.col(0, 1, 0.5, 1.6);
    F.sh('cyl', 0.02, 1.2, 0.02, -6, C.h - 0.7, 2, 0x333333); F.sh('cyl', 0.35, 1.3, 0.35, -6, C.h - 2, 2, 0xc0392b); F.col(-6, 2, 0.7, 0.7);
    const p1 = Fr.L(-hw + 0.45, 1); ML.Decor.sign('NO PAIN NO GAIN', 'l\'endurance, ça se travaille', '#16a085', '#fff', 3.6, 1.2, p1.x, 2.6, p1.z, Fr.a + Math.PI / 2, { border: '#fff' });
    W.addStaff(Fr, 4, 1.6, Math.PI, randLook(r), false);
  };

  W.bounds = () => {
    const M = ML.CFG.MAP;
    U.addCollider(M.minX - 30, M.minX, M.minZ - 40, M.maxZ + 40, 'bound'); U.addCollider(M.maxX, M.maxX + 30, M.minZ - 40, M.maxZ + 40, 'bound');
    U.addCollider(M.minX - 30, M.maxX + 30, M.minZ - 40, M.minZ, 'bound'); U.addCollider(M.minX - 30, M.maxX + 30, M.maxZ, M.maxZ + 40, 'bound');
  };
  W.setDaylight = k => { if (W.lampMat) W.lampMat.emissive.setHex(k < 0.6 ? 0xffd27a : 0x000000); ML.Decor.setNight(k); };
  W.target = id => W.targets.find(t => t.id === id);
})();
