/* =====================================================================
   world.js — Construction 3D du monde à partir de la ville générée
   (citygen.js + citygen_outer.js + terrain.js). Le monde est RECONSTRUIT
   à chaque partie (nouvelle graine) : World.build(seed, upgrades).
   Tout est rangé dans World.root pour pouvoir le supprimer d'un coup.
   - relief, rivière, lac : terrain.js
   - routes : fusionnées en quelques maillages (asphalte, trottoirs,
     marquages, glissières, ponts) → très peu d'appels de dessin
   - bâtiments de ville : kit ML.Build (world_buildings.js)
   - atelier : world_atelier.js · entreprises : world_buildings.js
   - W.cull(camPos) : cache les décors lointains (appelé à chaque image)
   ===================================================================== */
(function () {
  const W = ML.World = { targets: [], machines: {}, root: null };
  const U = ML.U, T = ML.Tex, A = ML.Assets;
  let root, rng;

  W.build = (seed, upgrades) => {
    if (W.root) { ML.scene.remove(W.root); W.root.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); }
    root = W.root = new THREE.Group(); ML.scene.add(root);
    ML.colliders.length = 0; W.targets = []; W.machines = {}; W.radars = []; W.lights = []; W.lampHeads = null; W.cullList = [];
    ML.mapRects = []; W.up = upgrades || {};
    rng = U.rng(seed ^ 0x5bd1e995);
    const city = W.city = ML.CityGen.generate(seed);
    ML.LOC = { comp: city.companies, hides: city.hides.slice(), perches: city.perches, radars: city.radars, sites: city.sites };
    W.ground(city); W.atelier(); W.furniture(); W.machinesBuild();
    for (const k in city.companies) { const n0 = root.children.length, P = city.companies[k]; W.company(k, ML.COMPANIES[k], P); root.children.slice(n0).forEach(o => far(o, P.x, P.z, 25)); }
    W.decor(city); W.bounds();
    ML.LOC.hides = ML.LOC.hides.filter(h => !U.inCollider(h.x, h.z, 0.5));
  };
  const add = o => { root.add(o); return o; };
  const H = (x, z) => ML.Terrain.h(x, z);
  const G = (x, z) => ML.Terrain.ground(x, z);
  /** Ajoute un objet à la liste des décors masqués au loin */
  const far = (o, x, z, r) => { W.cullList.push({ o, x, z, r: r || 10 }); return o; };

  /* =====================================================================
     Fabrique de géométrie fusionnée (un tableau de sommets par matériau)
     ===================================================================== */
  function Batch() { this.p = []; this.n = []; }
  Batch.prototype.tri = function (a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) this.n.push(nx, ny, nz);
  };
  /** quadrilatère (sens anti-horaire vu de la normale) */
  Batch.prototype.quad = function (a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); };
  /** pavé entre deux points du sol A→B, décalé de `o` sur le côté, largeur w, de y0 à y1 (au-dessus de la route) */
  Batch.prototype.bar = function (A, B, o, w, y0, y1) {
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / L, nz = dx / L;
    const P = (Q, s) => [Q.x + nx * (o + s), Q.z + nz * (o + s)];
    const [a1x, a1z] = P(A, -w / 2), [a2x, a2z] = P(A, w / 2), [b1x, b1z] = P(B, -w / 2), [b2x, b2z] = P(B, w / 2);
    const ay = A.y, by = B.y;
    const v = { a1b: [a1x, ay + y0, a1z], a2b: [a2x, ay + y0, a2z], b1b: [b1x, by + y0, b1z], b2b: [b2x, by + y0, b2z], a1t: [a1x, ay + y1, a1z], a2t: [a2x, ay + y1, a2z], b1t: [b1x, by + y1, b1z], b2t: [b2x, by + y1, b2z] };
    this.quad(v.a1t, v.a2t, v.b2t, v.b1t);              // dessus
    this.quad(v.a2b, v.b2b, v.b2t, v.a2t); this.quad(v.b1b, v.a1b, v.a1t, v.b1t);
    this.quad(v.a1b, v.a2b, v.a2t, v.a1t); this.quad(v.b2b, v.b1b, v.b1t, v.b2t);
  };
  /** bande plate le long de A→B (de o1 à o2 sur le côté), à la hauteur de la route + lift */
  Batch.prototype.strip = function (A, B, o1, o2, lift, t0, t1) {
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / L, nz = dx / L;
    t0 = t0 || 0; t1 = t1 === undefined ? 1 : t1;
    const Px = (t, o) => [A.x + dx * t + nx * o, A.y + (B.y - A.y) * t + lift, A.z + dz * t + nz * o];
    this.quad(Px(t0, o2), Px(t1, o2), Px(t1, o1), Px(t0, o1));
  };
  /** pavé vertical (pile, poteau) */
  Batch.prototype.post = function (x, z, y0, y1, w, d) {
    const a = w / 2, b = (d || w) / 2, c = [[x - a, z - b], [x + a, z - b], [x + a, z + b], [x - a, z + b]];
    for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4]; this.quad([q[0], y0, q[1]], [p[0], y0, p[1]], [p[0], y1, p[1]], [q[0], y1, q[1]]); }
    this.quad([c[3][0], y1, c[3][1]], [c[2][0], y1, c[2][1]], [c[1][0], y1, c[1][1]], [c[0][0], y1, c[0][1]]);
  };
  Batch.prototype.disc = function (x, y, z, r, seg) {
    seg = seg || 18;
    for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2; this.tri([x, y, z], [x + Math.sin(a) * r, y, z + Math.cos(a) * r], [x + Math.sin(b) * r, y, z + Math.cos(b) * r]); }
  };
  Batch.prototype.mesh = function (mat, shadow) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = !!shadow; return add(m);
  };
  W.Batch = Batch;
  /** Matériau de sol « au-dessus du relief » (évite le scintillement) */
  const overlay = (color, k) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: ML.Style.gradient, polygonOffset: true, polygonOffsetFactor: -2 - (k || 0), polygonOffsetUnits: -4 - (k || 0) * 2 });
    return m;
  };

  /* =====================================================================
     Sol, eau et routes
     ===================================================================== */
  W.ground = city => {
    const P = ML.PAL, TR = ML.Terrain;
    TR.mesh(root); TR.waterMesh(root); TR.paintMap(city, 420);
    const N = city.nodes, E = city.edges, RW = city.RW;
    const asph = new Batch(), walk = new Batch(), curb = new Batch(), mark = new Batch(), yel = new Batch(), conc = new Batch(), rail = new Batch(), deck = new Batch(), pier = new Batch();
    const LIFT = 0.06;
    const rwOf = e => e.rw || RW;
    // rayon des carrefours = la route la plus large qui y arrive
    const nodeR = N.map(() => 0); E.forEach(e => { nodeR[e.a] = Math.max(nodeR[e.a], rwOf(e)); nodeR[e.b] = Math.max(nodeR[e.b], rwOf(e)); });
    const deg = N.map(() => 0); E.forEach(e => { deg[e.a]++; deg[e.b]++; });
    E.forEach((e, i) => {
      const A = N[e.a], B = N[e.b], rw = rwOf(e), L = e.len || Math.hypot(B.x - A.x, B.z - A.z);
      asph.strip(A, B, -rw, rw, LIFT);
      ML.mapRects.push({ line: [A.x, A.z, B.x, B.z] });
      const tA = Math.min(0.45, (nodeR[e.a] + 1.5) / L), tB = Math.max(0.55, 1 - (nodeR[e.b] + 1.5) / L);
      // marquages
      if (i === 0) {                                                                   // accès de l'atelier : pas de marquage dans la cour
      } else if (e.hw) {
        for (const s of [-1, 1]) {
          mark.strip(A, B, s * (rw - 0.7), s * (rw - 0.45), LIFT + 0.01);                       // lignes de rive
          mark.strip(A, B, s * 0.75, s * 1.0, LIFT + 0.01);
          for (let t = 0; t < L; t += 12) mark.strip(A, B, s * 4.6 - 0.12, s * 4.6 + 0.12, LIFT + 0.01, t / L, Math.min(1, (t + 5) / L));
          rail.bar(A, B, s * (rw + 0.4), 0.18, 0.45, 0.8);                                       // glissières
          for (let t = 0; t < L; t += 4) { const k = t / L, x = A.x + (B.x - A.x) * k, z = A.z + (B.z - A.z) * k, y = A.y + (B.y - A.y) * k, nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L; rail.post(x + nx * s * (rw + 0.5), z + nz * s * (rw + 0.5), y - 0.3, y + 0.7, 0.12); }
        }
        conc.bar(A, B, 0, 0.55, 0, 0.85);                                                       // séparateur béton (GBA)
      } else if (e.giratoire) {
        mark.strip(A, B, -rw + 0.3, -rw + 0.5, LIFT + 0.01);
      } else {
        if (!(e.core && !e.ring && L < 14) && !e.narrow) for (let t = rw + 3; t < L - rw - 3; t += 8) mark.strip(A, B, -0.11, 0.11, LIFT + 0.01, t / L, Math.min(1, (t + 3.2) / L));
        if (!e.core || e.ring) for (const s of [-1, 1]) mark.strip(A, B, s * (rw - 0.45), s * (rw - 0.25), LIFT + 0.01, tA, tB);
      }
      // trottoirs (rues du centre)
      if (e.core && !e.ring && L > 12) for (const s of [-1, 1]) {
        walk.strip(A, B, s * (rw + 0.1), s * (rw + 1.9), LIFT + 0.15, tA, tB);
        curb.bar({ x: A.x + (B.x - A.x) * tA, z: A.z + (B.z - A.z) * tA, y: A.y + (B.y - A.y) * tA }, { x: A.x + (B.x - A.x) * tB, z: A.z + (B.z - A.z) * tB, y: A.y + (B.y - A.y) * tB }, s * (rw + 0.1), 0.25, -0.2, LIFT + 0.17);
      }
      // routes de montagne : glissière côté ravin
      if ((e.mtn || e.dep) && !(e.corniche && (Math.floor(A.x * 7 + A.z * 3) & 3) !== 0)) for (const s of [-1, 1]) {   // corniche : glissière seulement par endroits (bonne chance)
        const nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L, mx = (A.x + B.x) / 2 + nx * s * (rw + 3), mz = (A.z + B.z) / 2 + nz * s * (rw + 3);
        if (!e.bridge && G(mx, mz) < (A.y + B.y) / 2 - 2.2) {
          rail.bar(A, B, s * (rw + 0.5), 0.15, 0.45, 0.75);
          for (let t = 0; t < L; t += 3.5) { const k = t / L; rail.post(A.x + (B.x - A.x) * k + nx * s * (rw + 0.55), A.z + (B.z - A.z) * k + nz * s * (rw + 0.55), A.y + (B.y - A.y) * k - 0.3, A.y + (B.y - A.y) * k + 0.65, 0.12); }
        }
      }
      // ponts et viaducs
      if (e.bridge) {
        deck.bar(A, B, 0, 2 * rw + 1.6, -1.5, LIFT - 0.01);
        for (const s of [-1, 1]) conc.bar(A, B, s * (rw + 0.5), 0.5, 0, 1.05);
        for (const k of [0, 0.5]) {
          const x = A.x + (B.x - A.x) * k, z = A.z + (B.z - A.z) * k, y = A.y + (B.y - A.y) * k, gy = G(x, z);
          if (y - gy > 2.2) { const nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L; for (const s of (rw > 7 ? [-1, 1] : [0])) pier.post(x + nx * s * rw * 0.5, z + nz * s * rw * 0.5, gy - 2, y - 1.4, 1.7, 1.7); }
        }
      }
    });
    // carrefours, ronds-points, impasses
    N.forEach((n, i) => {
      if (!deg[i]) return;
      const r = n.cul ? RW + 3.5 : nodeR[i];
      if (n.bridge) { deck.post(n.x, n.z, n.y - 1.5, n.y + LIFT - 0.01, r * 1.6, r * 1.6); }
      asph.disc(n.x, n.y + LIFT, n.z, r, n.cul ? 22 : 14);
    });
    asph.mesh(overlay(P.asphalt, 0)); mark.mesh(overlay(P.mark, 2)); yel.mesh(overlay(P.markYellow, 2));
    walk.mesh(overlay(P.sidewalk, 1)); curb.mesh(ML.Style.toon(P.curb)); conc.mesh(ML.Style.toon(P.granite), true); rail.mesh(ML.Style.toon(P.guard), true);
    deck.mesh(ML.Style.toon(P.granite2), true); pier.mesh(ML.Style.toon(P.granite), true);
    // ponts : colliders des parapets (seulement là où l'on peut marcher : on ne bloque pas la chaussée)
    // cour de l'atelier (bitume)
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(64, 18), overlay(P.asphaltDark, 1)); yard.rotation.x = -Math.PI / 2; yard.position.set(0, 0.03, 22); yard.receiveShadow = true; add(yard);
  };

  /* Atelier : voir world_atelier.js — Entreprises : voir world_buildings.js */

  /* =====================================================================
     Décor : bâtiments, mobilier urbain, nature
     ===================================================================== */
  function place(name, scale, x, z, ry, collide, y) {
    const o = A.clone(name, scale); if (!o) return null;
    o.position.set(x, y || 0, z); o.rotation.y = ry || 0; add(o);
    if (collide === 'small') U.boxCollider(x, z, 2.2, 2.2, name);
    else if (collide) { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); U.addCollider(b.min.x, b.max.x, b.min.z, b.max.z, name); }
    return o;
  }
  /** Bâtiment de secours si le kit n'est pas chargé : crépi + toit d'ardoise */
  function fallbackBuilding(f, r) {
    const P = ML.PAL, g = new THREE.Group(), w = f.w || 12, d = f.d || 10, h = 5 + r() * 6;
    ML.Style.box(w, h, d, ML.Style.vary(P.plaster, 0.6, r), 0, h / 2, 0, g, 0.15);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.62, d * 0.62, w + 0.6, 3, 1), ML.Style.toon(P.slate)); roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 2; roof.scale.set(1, 1, 0.55); roof.position.y = h + d * 0.15; g.add(roof);
    return ML.Style.merge(g);
  }
  W.decor = city => {
    const P = ML.PAL, TR = ML.Terrain, o = new THREE.Object3D();
    /* ---- bâtiments (ville + campagne) : regroupés par carrés de 90 m puis FUSIONNÉS par matériau
       (un bourg de 150 maisons ≈ quelques centaines d'appels de dessin au lieu de 1 500) ---- */
    const CH = 130, chunks = new Map();
    for (const f of city.fillers.concat(city.rural || [])) {
      const r = U.rng(f.k || 1), y = f.y !== undefined ? f.y : G(f.x, f.z);
      let b = null;
      if (ML.Build && ML.Build.make) { try { b = ML.Build.make(f.type, r, { w: f.w, d: f.d }); } catch (e) { console.warn('Bâtiment', f.type, e); } }
      if (!b) b = fallbackBuilding(f, r);
      b.position.set(f.x, y, f.z); b.rotation.y = f.rot * Math.PI / 2;
      const key = Math.floor(f.x / CH) * 1000 + Math.floor(f.z / CH);
      let c = chunks.get(key); if (!c) chunks.set(key, c = { g: new THREE.Group(), x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
      c.g.add(b); c.x0 = Math.min(c.x0, f.x - f.hx); c.x1 = Math.max(c.x1, f.x + f.hx); c.z0 = Math.min(c.z0, f.z - f.hz); c.z1 = Math.max(c.z1, f.z + f.hz);
      const col = f.type === 'eglise' || f.type === 'mairie' ? '#b9b4ab' : '#8e7f74';
      if (Math.abs(f.rot - Math.round(f.rot)) < 1e-6) {
        U.addCollider(f.x - f.hx + 0.3, f.x + f.hx - 0.3, f.z - f.hz + 0.3, f.z + f.hz - 0.3, 'city');
        ML.mapRects.push({ x: f.x, z: f.z, w: f.hx * 2, d: f.hz * 2, c: col });
      } else {
        // bâtiment aligné sur une rue en biais : contour en petits carrés (collisions) et carte en pavés de 2,5 m
        const a = f.rot * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), hw = f.w / 2 - 0.55, hd = f.d / 2 - 0.55;
        const P = (lx, lz) => [f.x + lx * ca + lz * sa, f.z - lx * sa + lz * ca];
        for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) {
          const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5));
          for (let i = 0; i < n; i++) { const [x, z] = P(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n); U.boxCollider(x, z, 1.5, 1.5, 'city'); }
        }
        const nx = Math.max(1, Math.round(f.w / 2.5)), nz = Math.max(1, Math.round(f.d / 2.5)), cw = f.w / nx, cd = f.d / nz;
        for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { const [x, z] = P(-f.w / 2 + (i + 0.5) * cw, -f.d / 2 + (k + 0.5) * cd); ML.mapRects.push({ x, z, w: Math.max(cw, cd) * 1.12, d: Math.max(cw, cd) * 1.12, c: col }); }
      }
    }
    chunks.forEach(c => { add(c.g); const m = ML.Style.merge(c.g); far(m, (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, Math.hypot(c.x1 - c.x0, c.z1 - c.z0) / 2 + 10); });
    W.townDecor(city);
    /* ---- voitures garées (fusionnées en un seul objet) ---- */
    if (city.parked.length) {
      const pg = new THREE.Group();
      city.parked.forEach((c, i) => {
        let m = ML.Cars && ML.Cars.civilModel ? ML.Cars.civilModel(i) : null;
        if (!m) { m = A.clone(c.model, 4.6); if (m) m.position.y = 0.33; const w = new THREE.Group(); if (m) w.add(m); m = w; }
        m.position.set(c.x, G(c.x, c.z) + (m.position.y || 0), c.z); m.rotation.y = c.ry; pg.add(m);
        U.boxCollider(c.x, c.z, 2.2, 2.2, 'parked');
      });
      add(pg); ML.Style.merge(pg);
    }
    /* ---- lampadaires (instanciés) ---- */
    const n = city.lamps.length;
    const poleG = new THREE.CylinderGeometry(0.09, 0.14, 5.8, 6); poleG.translate(0, 2.9, 0);
    const armG = new THREE.BoxGeometry(0.12, 0.12, 1.5); armG.translate(0, 5.7, 0.7);
    const poles = new THREE.InstancedMesh(poleG, ML.Style.toon(P.slateDark), n), arms = new THREE.InstancedMesh(armG, ML.Style.toon(P.slateDark), n);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshToonMaterial({ color: 0xfff3c4, emissive: 0x000000, gradientMap: ML.Style.gradient }), n);
    W.lampMat = heads.material;
    city.lamps.forEach((l, i) => {
      const y = H(l.x, l.z);
      o.position.set(l.x, y, l.z); o.rotation.set(0, Math.atan2(l.nx, l.nz), 0); o.scale.set(1, 1, 1); o.updateMatrix(); poles.setMatrixAt(i, o.matrix); arms.setMatrixAt(i, o.matrix);
      o.position.set(l.x + l.nx * 1.35, y + 5.6, l.z + l.nz * 1.35); o.updateMatrix(); heads.setMatrixAt(i, o.matrix);
      U.boxCollider(l.x, l.z, 0.3, 0.3, 'lamp');
    });
    [poles, arms, heads].forEach(m => { m.castShadow = true; add(m); });
    /* ---- radars ---- */
    W.flashOn = U.mat(0xffffff, 0xffffff); W.flashOff = U.mat(0x333333);
    for (const r of city.radars) {
      const y = H(r.x, r.z);
      U.box(0.22, 3, 0.22, P.slateDark, r.x, y + 1.5, r.z, root); ML.Style.box(0.8, 1, 0.8, P.markYellow, r.x, y + 3.3, r.z, root, 0.1);
      const lamp = U.box(0.32, 0.32, 0.82, W.flashOff, r.x, y + 3.3, r.z, root, false);
      const l = U.label('📸 RADAR 60', { size: 0.3, color: '#fff', bg: 'rgba(233,79,55,0.92)' }); l.position.set(r.x, y + 4.4, r.z); add(l);
      U.boxCollider(r.x, r.z, 0.7, 0.7, 'radar'); W.radars.push({ x: r.x, z: r.z, lamp, flash: 0 });
    }
    /* ---- feux tricolores ---- */
    W.lightRed = U.mat(0xff2222, 0xff0000); W.lightGreenMat = U.mat(0x22ff44, 0x00cc22); W.lightOff = U.mat(0x222222);
    for (const ni of city.lights) {
      const nd = city.nodes[ni], x = nd.x + city.RW + 1.2, z = nd.z + city.RW + 1.2, y = H(x, z);
      U.box(0.16, 3.6, 0.16, P.slateDark, x, y + 1.8, z, root); ML.Style.box(0.45, 1.0, 0.4, P.black, x, y + 3.6, z, root, 0.08);
      const red = U.box(0.24, 0.24, 0.42, W.lightRed, x, y + 3.85, z, root, false), green = U.box(0.24, 0.24, 0.42, W.lightGreenMat, x, y + 3.35, z, root, false);
      U.boxCollider(x, z, 0.4, 0.4, 'feu'); W.lights.push({ node: ni, red, green });
    }
    /* ---- arbres : feuillus et sapins (instanciés) ---- */
    const trees = city.trees.map(t => ({ x: t.x, z: t.z, y: G(t.x, t.z), k: t.k, c: t.c, pine: false, col: true })).concat(city.forest || []);
    const leafy = trees.filter(t => !t.pine), pines = trees.filter(t => t.pine);
    const trunkG = new THREE.CylinderGeometry(0.2, 0.32, 2.4, 5); trunkG.translate(0, 1.2, 0);
    const trunks = new THREE.InstancedMesh(trunkG, ML.Style.toon(P.trunk), trees.length);
    const crownG = new THREE.IcosahedronGeometry(1.5, 0); const crowns = new THREE.InstancedMesh(crownG, ML.Style.toon(0xffffff, 0, { flat: true, key: 'feuillage' }), leafy.length * 2);
    const pineG = (() => { const parts = [[2.1, 2.6, 2.4], [1.6, 2.3, 3.8], [1.05, 2, 5.1]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); return g.toNonIndexed(); }); const pos = [], nor = []; parts.forEach(g => { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g; })();
    const pineM = new THREE.InstancedMesh(pineG, ML.Style.toon(0xffffff, 0, { flat: true, key: 'sapins' }), pines.length);
    const leafCols = [P.forest, P.forestLight, P.grassDark, 0x7fae45].map(c => new THREE.Color(c)), pineCols = [P.pine, 0x3a7a52, 0x2c5e40].map(c => new THREE.Color(c)), autumn = new THREE.Color(0xd9913a);
    let li = 0;
    trees.forEach((t, i) => {
      o.rotation.set(0, (t.x * 13.7 + t.z) % 6.28, 0); o.position.set(t.x, t.y - 0.1, t.z); o.scale.setScalar(t.k); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      if (t.col) U.boxCollider(t.x, t.z, 0.7, 0.7, 'tree');
    });
    leafy.forEach(t => {
      for (let k = 0; k < 2; k++) {
        const s = t.k * (k ? 0.75 : 1.05); o.position.set(t.x + (k ? 0.5 : -0.2) * t.k, t.y + (2.9 + k * 1.5) * t.k, t.z + (k ? -0.3 : 0.2) * t.k); o.scale.set(s, s * 0.9, s); o.rotation.set(0, k + t.x, 0); o.updateMatrix();
        crowns.setMatrixAt(li, o.matrix); crowns.setColorAt(li, (Math.abs(Math.floor(t.x * 7 + t.z * 3)) % 23 === 0) ? autumn : leafCols[t.c % 4]); li++;
      }
    });
    pines.forEach((t, i) => { o.position.set(t.x, t.y - 0.1, t.z); o.scale.set(t.k, t.k * 1.15, t.k); o.rotation.set(0, t.z % 6.28, 0); o.updateMatrix(); pineM.setMatrixAt(i, o.matrix); pineM.setColorAt(i, pineCols[t.c % 3]); });
    [trunks, crowns, pineM].forEach(m => { m.castShadow = true; m.receiveShadow = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; add(m); });
    /* ---- buissons du centre + rochers ---- */
    const bushG = new THREE.IcosahedronGeometry(1, 0), bushes = new THREE.InstancedMesh(bushG, ML.Style.toon(P.forestLight, 0, { flat: true, key: 'buisson' }), city.bushes.length);
    city.bushes.forEach((b, i) => { o.position.set(b.x, G(b.x, b.z) + b.s * 0.12, b.z); o.rotation.set(0, b.ry, 0); o.scale.set(b.s * 0.28, b.s * 0.2, b.s * 0.24); o.updateMatrix(); bushes.setMatrixAt(i, o.matrix); });
    bushes.castShadow = true; add(bushes);
    const rocks = city.rocks || [], rockM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), ML.Style.toon(P.rock, 0, { flat: true, key: 'roc' }), Math.max(1, rocks.length));
    rocks.forEach((k, i) => { o.position.set(k.x, k.y - k.s * 0.3, k.z); o.rotation.set(k.rx, k.ry, 0); o.scale.set(k.s, k.s * 0.7, k.s * 0.9); o.updateMatrix(); rockM.setMatrixAt(i, o.matrix); });
    rockM.count = rocks.length; rockM.castShadow = rockM.receiveShadow = true; add(rockM);
    /* ---- lieux remarquables ---- */
    (city.statues || []).forEach(s => W.statue(s));
    (city.tolls || []).forEach(t => W.toll(t));
    (city.signs || []).forEach(s => W.hwSign(s, city));
    if (city.sites && city.sites.col) W.colSign(city.sites.col);
    if (city.corniche) W.cornicheSigns(city);
    if (city.sites && city.sites.lac) W.ponton(city.sites.lac);
  };

  /* =====================================================================
     Décor du bourg (city.deco, voir citygen.js) : place du marché, cour
     d'école, parking, stade, haies / clôtures / murets des jardins, fontaine
     ou monument aux morts, calvaire, étals du marché, bancs, poubelles,
     abribus, jeux d'enfants.
     Sols : bandes fusionnées au-dessus du relief (Batch) ; objets : un seul
     groupe FUSIONNÉ par matériau (une vingtaine d'appels de dessin en tout).
     ===================================================================== */
  W.townDecor = city => {
    const P = ML.PAL, S = ML.Style, D = city.deco || [], g = new THREE.Group();
    const pave = new Batch(), paveD = new Batch(), asph = new Batch(), lines = new Batch(), turf = new Batch(), sand = new Batch();
    const M = {
      hedge: S.toon(0x4a8a3c), white: S.toon(P.white), granite: S.toon(P.granite), granite2: S.toon(P.granite2), wood: S.toon(P.wood), woodDark: S.toon(P.woodDark),
      steel: S.toon(P.steelDark), water: S.toon(P.water, 0x0d3a4a), green: S.toon(P.shutterGreen), red: S.toon(P.red), yellow: S.toon(P.lebecYellow), blue: S.toon(P.lebecBlue),
      glass: S.toon(P.glass, 0, { transparent: true, opacity: 0.45 }), bronze: S.toon(0xb0874a), black: S.toon(P.black), orange: S.toon(P.orange)
    };
    const awn = [M.red, M.blue, M.green, M.orange];
    /** groupe local posé au sol en (x, z), tourné de ry */
    const at = (x, z, ry) => { const o = new THREE.Group(); o.position.set(x, G(x, z), z); o.rotation.y = ry || 0; g.add(o); return o; };
    const bx = (o, w, h, d, m, x, y, z, rx, rz) => { const b = U.box(w, h, d, m, x, y, z, o); if (rx) b.rotation.x = rx; if (rz) b.rotation.z = rz; return b; };
    /** rectangle orienté au sol (découpé en carreaux qui suivent le relief) ; ox/oz : décalage local */
    const flat = (b, d, lift, hw, hd, ox, oz) => {
      const ca = Math.cos(d.ry || 0), sa = Math.sin(d.ry || 0), nx = Math.max(1, Math.ceil(hw / 3)), nz = Math.max(1, Math.ceil(hd / 3));
      const V = (lx, lz) => { lx += ox || 0; lz += oz || 0; const x = d.x + lx * ca + lz * sa, z = d.z - lx * sa + lz * ca; return [x, G(x, z) + lift, z]; };
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const x0 = -hw + 2 * hw * i / nx, x1 = -hw + 2 * hw * (i + 1) / nx, z0 = -hd + 2 * hd * k / nz, z1 = -hd + 2 * hd * (k + 1) / nz;
        b.quad(V(x0, z1), V(x1, z1), V(x1, z0), V(x0, z0));
      }
    };
    /** trait au sol entre deux points locaux de d */
    const line = (d, x0, z0, x1, z1, w, lift) => {
      const L = Math.hypot(x1 - x0, z1 - z0) || 1, a = Math.atan2(-(z1 - z0), x1 - x0), ca = Math.cos(d.ry || 0), sa = Math.sin(d.ry || 0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      flat(lines, { x: d.x + mx * ca + mz * sa, z: d.z - mx * sa + mz * ca, ry: (d.ry || 0) + a }, lift || 0.1, L / 2, w / 2);
    };
    const coll = (x, z, w, d) => U.boxCollider(x, z, w, d, 'decor');
    function fence(x1, z1, x2, z2, t) {
      const L = Math.hypot(x2 - x1, z2 - z1); if (L < 0.5) return;
      const o = at((x1 + x2) / 2, (z1 + z2) / 2, Math.atan2(-(z2 - z1), x2 - x1));
      if (t === 'haie') { bx(o, L, 1.15, 0.75, M.hedge, 0, 0.58, 0); return; }
      if (t === 'muret') { bx(o, L, 0.6, 0.4, M.granite, 0, 0.3, 0); bx(o, L + 0.1, 0.08, 0.5, M.granite2, 0, 0.64, 0); return; }
      const n = Math.max(1, Math.round(L / 1.4)), m = t === 'grillage' ? M.steel : M.white, h = t === 'grillage' ? 1.6 : 0.9;
      for (let i = 0; i <= n; i++) bx(o, 0.09, h, 0.09, m, -L / 2 + L * i / n, h / 2, 0);
      for (const y of t === 'grillage' ? [0.2, 0.8, 1.5] : [0.35, 0.75]) bx(o, L, 0.05, 0.04, m, 0, y, 0);
    }
    for (const d of D) {
      switch (d.t) {
        case 'place': {
          flat(pave, d, 0.08, d.hw, d.hd);
          for (let k = -d.hd + 2.5; k < d.hd - 2; k += 4) line(d, -d.hw + 1.4, k, d.hw - 1.4, k, 0.18, 0.1);      // rangs de pavés
          flat(paveD, d, 0.09, d.hw, 0.6, 0, -d.hd + 0.6); flat(paveD, d, 0.09, d.hw, 0.6, 0, d.hd - 0.6);
          flat(paveD, d, 0.09, 0.6, d.hd, -d.hw + 0.6, 0); flat(paveD, d, 0.09, 0.6, d.hd, d.hw - 0.6, 0);
          break;
        }
        case 'cour': {
          flat(asph, d, 0.08, d.hw, d.hd);
          const ca = Math.cos(d.ry), sa = Math.sin(d.ry), L = (lx, lz) => [d.x + lx * ca + lz * sa, d.z - lx * sa + lz * ca];
          for (let i = 0; i < 4; i++) { const z = -2 + i * 1.3; line(d, -d.hw + 3, z, -d.hw + 4.2, z, 0.08); line(d, -d.hw + 3, z, -d.hw + 3, z + 1.3, 0.08); line(d, -d.hw + 4.2, z, -d.hw + 4.2, z + 1.3, 0.08); }   // marelle
          { const [x, z] = L(d.hw - 4, -d.hd + 1), o = at(x, z, d.ry); bx(o, 0.15, 3, 0.15, M.steel, 0, 1.5, 0); bx(o, 1.2, 0.8, 0.06, M.white, 0, 3, 0.3); U.cyl(0.25, 0.25, 0.04, M.orange, 0, 2.75, 0.6, o, 10); coll(x, z, 0.6, 0.6); }   // panier de basket
          { const [x, z] = L(-d.hw + 6, -d.hd + 4.5); W.playground(at(x, z, d.ry), M, bx); flat(sand, { x, z, ry: d.ry }, 0.1, 3.6, 2.8, 0.8, -0.6); }
          for (const [x0, z0, x1, z1] of [[-d.hw, -d.hd, d.hw, -d.hd], [d.hw, -d.hd, d.hw, d.hd], [-d.hw, -d.hd, -d.hw, d.hd]]) { const [ax, az] = L(x0, z0), [cx, cz] = L(x1, z1); fence(ax, az, cx, cz, 'grillage'); }   // grillage
          break;
        }
        case 'parking': {
          flat(asph, d, 0.08, d.hw, d.hd);
          const n = Math.floor((d.hw * 2 - 2) / 2.8);
          for (const row of [-1, 1]) for (let i = 0; i <= n; i++) { const x = -d.hw + 1 + i * 2.8; line(d, x, row * (d.hd - 0.3), x, row * (d.hd - 5.3), 0.12); }
          line(d, -d.hw + 1, 0, d.hw - 1, 0, 0.12);
          break;
        }
        case 'stade': {
          flat(turf, d, 0.07, d.hw, d.hd);
          const w = d.hw - 2, h = d.hd - 2;
          line(d, -w, -h, w, -h, 0.15); line(d, -w, h, w, h, 0.15); line(d, -w, -h, -w, h, 0.15); line(d, w, -h, w, h, 0.15); line(d, 0, -h, 0, h, 0.15);
          for (let i = 0; i < 16; i++) { const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2; line(d, Math.cos(a0) * 5, Math.sin(a0) * 5, Math.cos(a1) * 5, Math.sin(a1) * 5, 0.15); }
          const ca = Math.cos(d.ry), sa = Math.sin(d.ry);
          for (const s of [-1, 1]) {                                   // buts (aux deux bouts, dans la longueur)
            const lx = s * w, x = d.x + lx * ca, z = d.z - lx * sa, o = at(x, z, d.ry + Math.PI / 2);
            for (const px of [-3.6, 3.6]) bx(o, 0.14, 2.4, 0.14, M.white, px, 1.2, 0);
            bx(o, 7.4, 0.14, 0.14, M.white, 0, 2.4, 0); bx(o, 7.2, 0.05, 1.4, M.white, 0, 2.35, -s * 0.7);
          }
          break;
        }
        case 'fontaine': {
          const o = at(d.x, d.z, 0);
          U.cyl(2.7, 2.9, 0.7, M.granite, 0, 0.35, 0, o, 10); U.cyl(2.35, 2.35, 0.1, M.water, 0, 0.62, 0, o, 10);
          U.cyl(0.35, 0.5, 2.1, M.granite2, 0, 1.4, 0, o, 8); U.cyl(1.05, 0.45, 0.4, M.granite, 0, 2.45, 0, o, 10); U.cyl(0.9, 0.9, 0.06, M.water, 0, 2.63, 0, o, 10);
          U.cyl(0.12, 0.2, 0.7, M.granite2, 0, 2.95, 0, o, 6);
          for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, s = bx(o, 0.08, 0.08, 1.1, M.water, Math.sin(a) * 1.3, 1.9, Math.cos(a) * 1.3); s.rotation.y = a; s.rotation.x = 0.9; }   // jets
          coll(d.x, d.z, 5.4, 5.4); break;
        }
        case 'monument': {                                             // monument aux morts (avec un coq en haut, c'est la tradition)
          const o = at(d.x, d.z, d.ry);
          S.box(3.6, 0.3, 3.6, M.granite2, 0, 0.15, 0, o, 0.05); S.box(2.8, 0.35, 2.8, M.granite, 0, 0.47, 0, o, 0.05);
          S.box(1.3, 3.6, 1.3, M.granite, 0, 2.45, 0, o, 0.06); const tip = U.cyl(0, 0.95, 0.9, M.granite2, 0, 4.7, 0, o, 4); tip.rotation.y = Math.PI / 4;
          bx(o, 0.9, 0.7, 0.05, M.black, 0, 2.4, 0.66);
          const coq = new THREE.Group(); coq.position.set(0, 5.25, 0); o.add(coq);
          bx(coq, 0.25, 0.3, 0.55, M.bronze, 0, 0.1, 0); bx(coq, 0.16, 0.25, 0.18, M.bronze, 0, 0.38, 0.22); bx(coq, 0.08, 0.18, 0.2, M.red, 0, 0.55, 0.2); bx(coq, 0.06, 0.4, 0.3, M.bronze, 0, 0.3, -0.3, -0.5);
          for (let i = 0; i < 6; i++) { const a = -0.8 + i * 0.32, f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), i % 2 ? M.red : M.yellow); f.position.set(Math.sin(a) * 1.1, 0.75, Math.cos(a) * 1.25); o.add(f); }
          coll(d.x, d.z, 3.4, 3.4); break;
        }
        case 'calvaire': {
          const o = at(d.x, d.z, d.ry);
          S.box(1.5, 0.9, 1.5, M.granite2, 0, 0.45, 0, o, 0.08); bx(o, 0.32, 3.4, 0.32, M.granite, 0, 2.6, 0); bx(o, 1.5, 0.3, 0.3, M.granite, 0, 3.6, 0);
          coll(d.x, d.z, 1.5, 1.5); break;
        }
        case 'etal': {                                                 // étal du marché : tréteaux, cagettes, bâche rayée
          const o = at(d.x, d.z, d.ry), c = awn[(d.c || 0) % 4];
          for (const sx of [-1.4, 1.4]) for (const sz of [-0.8, 0.8]) bx(o, 0.08, 2.3, 0.08, M.steel, sx, 1.15, sz);
          bx(o, 3, 0.08, 1.5, M.wood, 0, 0.85, 0.1);
          for (let i = 0; i < 6; i++) bx(o, 3.2 / 6, 0.05, 2.1, i % 2 ? M.white : c, -1.6 + 3.2 / 12 + i * 3.2 / 6, 2.35, 0, 0.18);
          for (let i = 0; i < 3; i++) { bx(o, 0.7, 0.3, 0.5, M.woodDark, -1 + i, 1.04, 0.3); const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), [M.red, M.orange, M.green][(i + (d.c || 0)) % 3]); f.position.set(-1 + i, 1.28, 0.3); f.scale.set(1.2, 0.6, 0.9); o.add(f); }
          coll(d.x, d.z, 2.6, 2.6); break;
        }
        case 'banc': {
          const o = at(d.x, d.z, d.ry);
          bx(o, 1.7, 0.08, 0.45, M.wood, 0, 0.46, 0); bx(o, 1.7, 0.35, 0.06, M.wood, 0, 0.75, -0.22);
          for (const s of [-0.72, 0.72]) bx(o, 0.08, 0.46, 0.42, M.steel, s, 0.23, 0);
          break;
        }
        case 'poubelle': { const o = at(d.x, d.z, 0); U.cyl(0.28, 0.24, 0.9, M.green, 0, 0.45, 0, o, 8); U.cyl(0.31, 0.31, 0.08, M.steel, 0, 0.92, 0, o, 8); break; }
        case 'abribus': {
          const o = at(d.x, d.z, d.ry);
          for (const sx of [-1.6, 1.6]) bx(o, 0.1, 2.4, 0.1, M.steel, sx, 1.2, -0.55);
          bx(o, 3.6, 0.12, 1.5, M.steel, 0, 2.45, -0.1); bx(o, 3.3, 1.9, 0.05, M.glass, 0, 1.2, -0.6); bx(o, 2.4, 0.08, 0.4, M.wood, 0, 0.5, -0.35);
          bx(o, 0.08, 2.9, 0.08, M.steel, 2.1, 1.45, 0.2); bx(o, 0.65, 0.65, 0.06, M.yellow, 2.1, 2.9, 0.2);
          bx(o, 3.62, 0.3, 0.06, M.blue, 0, 2.3, 0.62);
          coll(d.x, d.z, 1.6, 1.6); break;
        }
        case 'jeux': { W.playground(at(d.x, d.z, d.ry), M, bx); flat(sand, d, 0.09, 3.6, 2.8, 0.8, -0.6); break; }
        case 'haie': case 'cloture': case 'muret': fence(d.x1, d.z1, d.x2, d.z2, d.t); break;
      }
    }
    pave.mesh(overlay(P.sidewalk, 1)); paveD.mesh(overlay(P.granite2, 2)); asph.mesh(overlay(P.asphaltDark, 1)); turf.mesh(overlay(P.grassLight, 1)); sand.mesh(overlay(P.sand, 2)); lines.mesh(overlay(P.mark, 3));
    add(g); const m = S.merge(g); m.traverse(c => { if (c.isMesh) c.castShadow = true; });
  };
  /** Jeux d'enfants : toboggan, balançoire, bac à sable (dans le groupe local o) */
  W.playground = (o, M, bx) => {
    for (const sx of [-0.45, 0.45]) bx(o, 0.08, 1.9, 0.08, M.yellow, -1.6 + sx, 0.95, -0.6);          // toboggan
    for (let k = 0; k < 4; k++) bx(o, 0.9, 0.06, 0.06, M.yellow, -1.6, 0.4 + k * 0.42, -0.6);
    bx(o, 1.0, 0.08, 0.9, M.red, -1.6, 1.9, -0.2); bx(o, 0.8, 0.06, 2.8, M.red, -1.6, 1.05, 1.15, -0.62);
    for (const sx of [0.6, 2.8]) for (const sz of [-0.5, 0.5]) bx(o, 0.08, 2.4, 0.08, M.blue, sx, 1.15, sz, sz * 0.35);   // balançoire
    bx(o, 2.4, 0.1, 0.1, M.blue, 1.7, 2.3, 0);
    for (const sx of [1.2, 2.2]) { bx(o, 0.03, 1.7, 0.03, M.steel, sx - 0.2, 1.45, 0); bx(o, 0.03, 1.7, 0.03, M.steel, sx + 0.2, 1.45, 0); bx(o, 0.5, 0.05, 0.25, M.red, sx, 0.6, 0); }
    for (const [w, d, x, z] of [[2.2, 0.15, 0.9, -2.2], [2.2, 0.15, 0.9, -0.2], [0.15, 2.0, -0.2, -1.2], [0.15, 2.0, 2.0, -1.2]]) bx(o, w, 0.25, d, M.wood, x, 0.12, z);   // bac à sable
  };

  /* ---------- Rond-point de la Pelle : statue de Lebec ---------- */
  W.statue = s => {
    const P = ML.PAL, g = new THREE.Group(), bronze = ML.Style.toon(0xb0874a), r = s.r;
    g.position.set(s.x, s.y, s.z);
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.2, 0.35, 28), ML.Style.toon(P.curb)); isl.position.y = 0.2; g.add(isl);
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.3, r - 0.3, 0.4, 28), ML.Style.toon(P.grassLight)); grass.position.y = 0.25; g.add(grass);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), ML.Style.toon([P.red, P.lebecYellow, P.pink][i % 3])); f.position.set(Math.sin(a) * (r - 1.2), 0.6, Math.cos(a) * (r - 1.2)); g.add(f); }
    ML.Style.box(2.4, 2.2, 2.4, P.granite, 0, 1.5, 0, g, 0.12); ML.Style.box(2.8, 0.3, 2.8, P.granite2, 0, 2.7, 0, g, 0.06);
    // Lebec en bronze, blouse au vent, pelle levée vers le ciel
    U.cyl(0.32, 0.45, 2.2, bronze, 0, 3.95, 0, g, 8); U.cyl(0.36, 0.36, 0.6, bronze, 0, 5.4, 0, g, 8);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), bronze); head.position.y = 5.95; g.add(head);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 5), bronze); nose.rotation.x = Math.PI / 2; nose.position.set(0, 5.9, 0.45); g.add(nose);
    const arm = U.box(0.22, 1.3, 0.22, bronze, 0.45, 5.6, 0, g); arm.rotation.z = -0.5;
    const shovel = new THREE.Group(); shovel.position.set(0.85, 6.2, 0); shovel.rotation.z = -0.35; g.add(shovel);
    U.cyl(0.06, 0.06, 2.6, bronze, 0, 0.6, 0, shovel, 6); ML.Style.box(0.7, 0.85, 0.08, bronze, 0, 2.2, 0, shovel, 0.03);
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.55), new THREE.MeshBasicMaterial({ map: ML.Style.signTex('À LEBEC', "« C'était écrit dans le poly »", '#3a2f22', '#ffd27a', 512, 140) }));
    for (const a of [0, Math.PI]) { const p = plq.clone(); p.rotation.y = a; p.position.set(Math.sin(a) * 1.22, 1.6, Math.cos(a) * 1.22); g.add(p); }
    add(ML.Style.merge(g)); U.addCollider(s.x - 1.4, s.x + 1.4, s.z - 1.4, s.z + 1.4, 'statue');
    ML.mapRects.push({ x: s.x, z: s.z, w: r * 2, d: r * 2, c: '#9fcf5f' });
  };
  /* ---------- Péage de Lebec ---------- */
  W.toll = t => {
    const P = ML.PAL, g = new THREE.Group(), W2 = 9;
    g.position.set(t.x, t.y, t.z); g.rotation.y = t.ang;
    ML.Style.box(2 * W2 + 4, 0.7, 6, P.white, 0, 6, 0, g, 0.12); ML.Style.box(2 * W2 + 4.2, 0.25, 6.2, P.red, 0, 5.6, 0, g, 0.05);
    for (const x of [-W2 - 1.2, 0, W2 + 1.2]) {
      U.box(0.4, 5.6, 0.4, P.granite, x, 2.8, 0, g);
      if (x !== 0) { ML.Style.box(1.4, 2.6, 2.4, P.lebecYellow, x, 1.3, 0, g, 0.12); U.box(1.45, 0.8, 1.6, U.mat(P.glass, P.glassDark), x, 1.9, 0, g); }
    }
    for (const s of [-1, 1]) { const bar = U.box(4, 0.12, 0.12, P.red, s * 4.5, 1.1, -1.4, g); bar.rotation.z = s * 0.9; }      // barrières levées (« c'est gratuit aujourd'hui »)
    const tex = ML.Style.signTex('PÉAGE DE LEBEC', 'Tarif : 1 copeau · Pas de monnaie sur les copeaux', '#24457a', '#ffc93c');
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshBasicMaterial({ map: tex })); p.position.set(0, 6.6, s * 3.02); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); }
    add(ML.Style.merge(g)); far(g, t.x, t.z, 15);
    for (const s of [-1, 1]) { const x = t.x + Math.cos(t.ang) * s * (W2 + 1.2), z = t.z - Math.sin(t.ang) * s * (W2 + 1.2); U.boxCollider(x, z, 1.6, 1.6, 'peage'); }
  };
  /* ---------- Panneau d'autoroute (sortie) ---------- */
  W.hwSign = (s, city) => {
    const P = ML.PAL, N = city.nodes, to = N[s.toward] || { x: s.x, z: s.z + 1 }, a = Math.atan2(to.x - s.x, to.z - s.z);
    const x = s.x + Math.sin(a) * 18 + Math.cos(a) * 9, z = s.z + Math.cos(a) * 18 - Math.sin(a) * 9, y = G(x, z), g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = a + Math.PI;
    for (const dx of [-2.6, 2.6]) U.box(0.25, 5.5, 0.25, P.steelDark, dx, 2.75, 0, g);
    const tex = ML.Style.signTex(s.text, s.sub, '#1f5fb8', '#ffffff');
    const pan = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 0.15), [U.mat(P.white), U.mat(P.white), U.mat(P.white), U.mat(P.white), new THREE.MeshBasicMaterial({ map: tex }), U.mat(P.steelDark)]);
    pan.position.y = 5.2; g.add(pan); add(g); far(g, x, z, 8); U.boxCollider(x, z, 0.6, 0.6, 'panneau');
  };
  /* ---------- Corniche : panneaux d'avertissement (drôles) ---------- */
  W.cornicheSigns = city => {
    const P = ML.PAL, N = city.nodes, ids = city.corniche, msgs = [
      ['ROUTE DE LA CORNICHE', 'Interdit aux poids lourds, aux Kangoo et aux gens pressés', '#e94f37'],
      ['⚠ CHUTE DE PIERRES', '… et de Mégane', '#f28c28'],
      ['VIRAGE EN ÉPINGLE', 'Lebec y a perdu un enjoliveur en 1998', '#f28c28'],
      ['PLATEAU DU BEC', 'Carrière · Barrage · Vue imprenable', '#24457a']];
    const at = [6, Math.floor(ids.length * 0.3), Math.floor(ids.length * 0.52), ids.length - 3];
    at.forEach((k, i) => {
      const a = N[ids[Math.max(1, Math.min(ids.length - 2, k))]], b = N[ids[Math.max(1, Math.min(ids.length - 2, k)) + 1]]; if (!a || !b) return;
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      // côté montagne = celui où le sol est le plus haut
      const s1 = G(a.x + nx * 6, a.z + nz * 6) > G(a.x - nx * 6, a.z - nz * 6) ? 1 : -1, x = a.x + nx * s1 * 5.2, z = a.z + nz * s1 * 5.2, y = H(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI;
      U.box(0.14, 2.2, 0.14, P.steelDark, 0, 1.1, 0, g);
      const tex = ML.Style.signTex(msgs[i][0], msgs[i][1], msgs[i][2], '#ffffff');
      const pan = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.08), [U.mat(P.white), U.mat(P.white), U.mat(P.white), U.mat(P.white), new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
      pan.position.y = 2.6; g.add(pan); add(g); far(g, x, z, 6);
    });
  };
  /* ---------- Col : panneau d'altitude ---------- */
  W.colSign = c => {
    const P = ML.PAL, g = new THREE.Group(), x = c.x + 7, z = c.z + 3, y = G(x, z);
    g.position.set(x, y, z); g.rotation.y = 0.4;
    for (const dx of [-1.2, 1.2]) U.box(0.15, 2.4, 0.15, P.woodDark, dx, 1.2, 0, g);
    const tex = ML.Style.signTex('COL DE LA PELLE', 'Alt. ' + Math.round(500 + c.y * 9) + ' m · Lebec y est monté en Kangoo', '#6b3f22', '#fff3c4');
    const p = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1, 0.12), [U.mat(P.woodDark), U.mat(P.woodDark), U.mat(P.woodDark), U.mat(P.woodDark), new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
    p.position.y = 2.1; g.add(p); add(g); far(g, x, z, 5); U.boxCollider(x, z, 2.6, 0.4, 'panneau');
  };
  /* ---------- Lac : ponton et barque ---------- */
  W.ponton = L => {
    const P = ML.PAL, wy = ML.Terrain.lakes[0] ? ML.Terrain.lakes[0].y : L.y, dx = L.lx - L.x, dz = L.lz - L.z, d = Math.hypot(dx, dz) || 1, a = Math.atan2(dx, dz);
    const g = new THREE.Group(), sx = L.lx - dx / d * (L.r - 2), sz = L.lz - dz / d * (L.r - 2);
    g.position.set(sx, wy, sz); g.rotation.y = a;
    ML.Style.box(2.4, 0.25, 12, P.wood, 0, 0.35, 4, g, 0.04); for (const z of [0, 4, 8]) for (const x of [-1, 1]) U.cyl(0.12, 0.12, 2.5, P.woodDark, x, -0.6, z, g, 5);
    const boat = new THREE.Group(); boat.position.set(2.6, 0.1, 7); boat.rotation.y = 0.3; g.add(boat);
    ML.Style.box(1.3, 0.45, 3.4, P.red, 0, 0, 0, boat, 0.15); ML.Style.box(1.0, 0.1, 2.9, P.wood, 0, 0.2, 0, boat, 0.02);
    add(ML.Style.merge(g)); far(g, sx, sz, 10);
  };

  W.bounds = () => {
    const M = ML.CFG.MAP;
    U.addCollider(M.minX - 30, M.minX, M.minZ - 40, M.maxZ + 40, 'bound'); U.addCollider(M.maxX, M.maxX + 30, M.minZ - 40, M.maxZ + 40, 'bound');
    U.addCollider(M.minX - 30, M.maxX + 30, M.minZ - 40, M.minZ, 'bound'); U.addCollider(M.minX - 30, M.maxX + 30, M.maxZ, M.maxZ + 40, 'bound');
  };
  /** Cache les décors lointains (bâtiments, panneaux) : appelé à chaque image */
  W.cull = cam => {
    if (!W.cullList) return;
    const D = Math.min(ML.scene.fog ? ML.scene.fog.far : 500, W.cullDist || 330);
    const D2 = U.inWorkshop(cam) ? 110 : D;                       // dans l'atelier : on ne voit dehors que par la porte
   // au-delà : la brume et les montagnes suffisent
    for (const c of W.cullList) { const dx = c.x - cam.x, dz = c.z - cam.z; c.o.visible = dx * dx + dz * dz < (D2 + c.r) * (D2 + c.r); }
  };
  W.setDaylight = k => { if (W.lampMat) W.lampMat.emissive.setHex(k < 0.6 ? 0xffd27a : 0x000000); };
  W.target = id => W.targets.find(t => t.id === id);
})();
