/* =====================================================================
   cars.js — Véhicules : utilitaires de l'atelier (Méga Mégane, Kangoo,
   Ducato, transpalette, fenwick, camion), conduite arcade (essence,
   pluie, flaques, caisses qui tombent), tuning, circulation et
   gendarmerie (rendu). Modèles 100 % procéduraux au style « jouet » :
   carrosseries arrondies et un peu tassées, grosses roues, phares ronds.
   La position d'un véhicule conduit vient de son conducteur ; sinon de
   l'hôte. Le contenu de la benne est géré par l'hôte.
   RELIEF : les positions réseau sont au niveau du sol (y = 0) ; au rendu
   on pose le véhicule sur ML.Terrain.h et on l'incline selon la pente.
   seatPos / doorPos / rearPos renvoient des y ABSOLUS (sol compris).
   ===================================================================== */
(function () {
  const Cars = ML.Cars = { list: [], key: '', traffic: [], police: null };
  const U = ML.U, CF = ML.CFG.CAR, S = ML.Style, PAL = ML.PAL;
  const H = (x, z) => (ML.Terrain && ML.Terrain.h ? ML.Terrain.h(x, z) : 0);
  /* Boîte « jouet » : S.rbox, retournée si ses faces sont à l'envers (normales vers l'intérieur) ; sinon telle quelle. */
  const TBfix = new WeakMap();
  const TBgeo = (w, h, d, r) => {
    const g0 = ML.Style.rbox(w, h, d, r); let g = TBfix.get(g0); if (g) return g;
    const p = g0.attributes.position, n = g0.attributes.normal; let s = 0;
    for (let i = 0; i < p.count; i++) s += p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i) + p.getZ(i) * n.getZ(i);
    if (s >= 0) g = g0; else { g = g0.clone(); const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; } g.computeVertexNormals(); }
    TBfix.set(g0, g); return g;
  };
  const TB = (w, h, d, mat, x, y, z, parent, r) => { const m = new THREE.Mesh(TBgeo(w, h, d, r), typeof mat === 'number' ? ML.Style.toon(mat) : mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = m.receiveShadow = true; if (parent) parent.add(m); return m; };

  /* ---------- Briques partagées ---------- */
  const BALL = new THREE.IcosahedronGeometry(1, 1);
  const DOME = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const cylC = {};
  const cylG = (rt, rb, h, seg) => { const k = [rt, rb, h, seg].join('_'); return cylC[k] || (cylC[k] = new THREE.CylinderGeometry(rt, rb, h, seg || 12)); };
  const mat = c => (typeof c === 'number' ? S.toon(c) : c);
  const mesh = (geo, col, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat(col)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const ball = (r, col, parent, x, y, z, sx, sy, sz) => { const m = mesh(BALL, col, parent, x, y, z); m.scale.set(r * (sx || 1), r * (sy || 1), r * (sz || 1)); return m; };
  const cyl = (rt, rb, h, col, parent, x, y, z, seg) => mesh(cylG(rt, rb, h, seg), col, parent, x, y, z);
  const GLASS = S.toon(PAL.glass, 0, { transparent: true, opacity: 0.28, key: 'vitre' });       // vitres des véhicules conduits (on voit au travers)
  const LIGHT = S.toon(PAL.white, PAL.plaster), TAIL = S.toon(PAL.red, PAL.red);
  const glass = (w, h, parent, x, y, z, ry, rx) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), GLASS); m.position.set(x, y, z); m.rotation.order = 'YXZ'; m.rotation.y = ry || 0; m.rotation.x = rx || 0; parent.add(m); GLASS.side = THREE.DoubleSide; GLASS.depthWrite = false; return m; };

  /** Roue (pneu, jante, enjoliveur, rayon pour voir qu'elle tourne). keep = non fusionnée. */
  /** Pièces d'une roue (pneu, flanc, jante, enjoliveurs et rayon des deux côtés : symétrique) */
  function wheelParts(p, r, wd, rim) {
    mesh(cylG(r, r, wd, 14), PAL.black, p).rotation.z = Math.PI / 2;
    mesh(cylG(r * 0.92, r * 0.92, wd + 0.04, 14), PAL.asphaltDark, p).rotation.z = Math.PI / 2;
    mesh(cylG(r * 0.55, r * 0.55, wd + 0.06, 10), rim, p).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) { ball(r * 0.16, PAL.steelDark, p, sx * (wd / 2 + 0.04), 0, 0, 0.6, 1, 1); TB(0.03, r * 0.95, r * 0.18, rim, sx * (wd / 2 + 0.035), 0, 0, p, 0.01); }
    return p;
  }
  const wheelGeoC = {};
  /** Géométrie cuite (couleurs de sommet) d'une roue, partagée */
  const wheelGeo = (r, wd, rim) => { const k = [r, wd, rim].join('_'); return wheelGeoC[k] || (wheelGeoC[k] = ML.Bake.geo(wheelParts(new THREE.Group(), r, wd, rim))); };
  /** Roue. Véhicule conduit (c) : pivot animé vide (dessiné par un InstancedMesh, voir wheelsIM) ; sinon pièces statiques à fusionner. */
  function wheel(c, parent, x, y, z, r, wd, rim, front) {
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.order = 'YXZ'; parent.add(p);
    if (c) { p.userData.keep = true; p.front = front; c.wheels.push(p); c.wheelSpec = [r, wd, rim]; }
    else wheelParts(p, r, wd, rim);
    return p;
  }
  /** Toutes les roues d'un véhicule = 1 InstancedMesh (1 appel de dessin) */
  function wheelsIM(c, g) {
    if (!c.wheels.length) return;
    const [r, wd, rim] = c.wheelSpec;
    c.wheelGeos = [wheelGeo(r, wd, rim), wheelGeo(r, wd, PAL.lebecYellow)];
    const im = c.wheelIM = new THREE.InstancedMesh(c.wheelGeos[0], ML.Bake.mat(), c.wheels.length);
    im.userData.keep = true; im.frustumCulled = false; im.castShadow = true; g.add(im);
    syncWheels(c);
  }
  function syncWheels(c) {
    if (!c.wheelIM) return;
    c.wheels.forEach((w, i) => { w.updateMatrix(); c.wheelIM.setMatrixAt(i, w.matrix); });
    c.wheelIM.instanceMatrix.needsUpdate = true;
  }

  /* ---------- Flammes peintes (tuning) : silhouette partagée ---------- */
  const FLAME = (() => {
    const s = new THREE.Shape(), pts = [[-0.16, 0], [-0.13, 0.22], [-0.24, 0.42], [-0.08, 0.36], [-0.04, 0.62], [0.04, 0.4], [0.12, 0.78], [0.14, 0.36], [0.24, 0.5], [0.16, 0.2], [0.16, 0]];
    s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.lineTo(pts[0][0], pts[0][1]);
    return new THREE.ShapeGeometry(s);
  })();
  function flames(parent, y, z0, count, spread) {
    const g = new THREE.Group(); g.userData.keep = true; parent.add(g);
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spread;
      for (const [col, sc, dy] of [[PAL.red, 1.15, 0], [PAL.orange, 0.95, 0.004], [PAL.lebecYellow, 0.6, 0.008]]) {
        const m = new THREE.Mesh(FLAME, S.toon(col, 0, { side: THREE.DoubleSide, key: 'flamme' })); m.rotation.x = -Math.PI / 2; m.position.set(x, y + dy, z0); m.scale.set(sc, sc * (1 + (i % 2) * 0.25), 1); g.add(m);
      }
    }
    return g;
  }

  /* ---------- Modèles des véhicules de l'atelier ---------- */
  function buildVan(c, spec) {
    const g = c.group, body = c.bodyMat = S.toon(spec.color).clone(); body.userData.noBake = true;
    const tall = spec.kind === 'ducato', meg = spec.kind === 'megane', kan = spec.kind === 'kangoo';
    // bas de caisse arrondi + capot bombé + élargisseurs d'ailes
    TB(1.85, 0.62, 4.5, body, 0, 0.66, 0, g, 0.24);
    TB(1.76, 0.2, 1.3, body, 0, 1.02, 1.55, g, 0.1);
    for (const x of [-0.97, 0.97]) for (const z of [-1.45, 1.45]) TB(0.24, 0.22, 1.1, body, x, 0.9, z, g, 0.09);
    TB(1.86, 0.08, 4.4, PAL.slateDark, 0, 0.4, 0, g, 0.03);                                     // bas de caisse foncé
    // cabine : montants, toit, paroi arrière, portières
    const roofY = meg ? 1.97 : 2.0;
    for (const x of [-0.84, 0.84]) {
      const a = TB(0.1, 0.95, 0.12, body, x, 1.47, 0.98, g, 0.03); a.rotation.x = -0.35;      // montant de pare-brise
      TB(0.1, roofY - 1.0, 0.14, body, x, (roofY + 1.0) / 2, -0.26, g, 0.03);
      TB(0.1, 0.22, 1.25, body, x, 1.08, 0.36, g, 0.04);                                        // haut de portière
      TB(0.02, 0.05, 0.18, PAL.slateDark, x * 1.06, 1.0, 0.1, g, 0.01);                          // poignée
    }
    TB(1.78, 0.1, 1.42, body, 0, roofY + 0.02, 0.32, g, 0.05);
    TB(1.7, 0.55, 0.1, body, 0, 1.25, -0.3, g, 0.03);
    glass(1.62, 0.92, g, 0, 1.5, 1.0, 0, -0.35);                                                   // pare-brise
    glass(1.6, roofY - 1.55, g, 0, (roofY + 1.55) / 2, -0.3, 0);                                    // lunette arrière
    for (const x of [-0.86, 0.86]) glass(1.15, roofY - 1.2, g, x, (roofY + 1.2) / 2 - 0.02, 0.36, Math.PI / 2);
    // intérieur : planche de bord, volant, sièges
    TB(1.7, 0.22, 0.4, PAL.slateDark, 0, 1.08, 0.95, g, 0.05);
    const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 16), S.toon(PAL.black)); wheelS.position.set(0.38, 1.22, 0.78); wheelS.rotation.x = -0.5; g.add(wheelS);
    for (const x of [-0.4, 0.4]) { TB(0.55, 0.14, 0.5, PAL.slate, x, 0.98, 0.15, g, 0.05); TB(0.55, 0.55, 0.12, PAL.slate, x, 1.25, -0.15, g, 0.05); }
    // benne
    TB(1.8, 0.08, 1.9, PAL.steelDark, 0, 0.98, -1.25, g, 0.02);
    const sideH = tall ? 1.3 : 0.5, wall = tall ? body : PAL.steel;
    for (const x of [-0.88, 0.88]) { TB(0.09, sideH, 1.9, wall, x, 1.0 + sideH / 2, -1.25, g, 0.03); TB(0.13, 0.06, 1.94, PAL.slateDark, x, 1.0 + sideH, -1.25, g, 0.02); }
    TB(1.8, sideH, 0.09, wall, 0, 1.0 + sideH / 2, -2.2, g, 0.03);
    if (tall) for (const x of [-0.88, 0.88]) TB(0.1, 0.18, 1.6, PAL.white, x * 1.005, 1.75, -1.25, g, 0.03);   // bande déco Ducato
    // pare-chocs, calandre, phares ronds, feux, plaques
    for (const z of [-2.26, 2.26]) TB(1.95, 0.22, 0.24, PAL.slateDark, 0, 0.45, z, g, 0.09);
    TB(1.1, 0.18, 0.06, PAL.black, 0, 0.8, 2.25, g, 0.03);
    for (const x of [-0.65, 0.65]) { ball(0.15, LIGHT, g, x, 0.82, 2.22, 1, 1, 0.5); TB(0.3, 0.14, 0.06, TAIL, x, 0.8, -2.25, g, 0.03); }
    for (const z of [-2.39, 2.39]) TB(0.44, 0.12, 0.03, PAL.white, 0, 0.47, z, g, 0.01);
    if (meg) { for (const x of [-0.2, 0.2]) { TB(0.14, 0.012, 1.3, PAL.black, x, 1.125, 1.55, g, 0.004); TB(0.14, 0.012, 1.42, PAL.black, x, roofY + 0.075, 0.32, g, 0.004); } TB(0.6, 0.08, 0.3, PAL.black, 0, 1.15, 1.3, g, 0.03); }   // bandes + écope de capot
    if (kan) { for (const z of [-0.1, 0.75]) TB(1.6, 0.05, 0.06, PAL.steelDark, 0, roofY + 0.12, z, g, 0.02); for (const x of [-0.7, 0.7]) TB(0.05, 0.08, 1.2, PAL.steelDark, x, roofY + 0.1, 0.32, g, 0.02); }
    // roues
    for (const [x, z] of [[0.95, 1.45], [-0.95, 1.45], [0.95, -1.45], [-0.95, -1.45]]) wheel(c, g, x, 0.38, z, 0.38, 0.3, PAL.steel, z > 0);
    // tuning (caché par défaut)
    c.wing = new THREE.Group(); c.wing.userData.keep = true; g.add(c.wing); c.wing.visible = false;
    for (const x of [-0.6, 0.6]) TB(0.08, 0.5, 0.1, PAL.black, x, 1.25, -2.15, c.wing, 0.02);
    TB(1.95, 0.07, 0.48, PAL.black, 0, 1.52, -2.2, c.wing, 0.03);
    for (const x of [-0.98, 0.98]) TB(0.05, 0.22, 0.55, PAL.red, x, 1.5, -2.2, c.wing, 0.02);
    c.flames = flames(g, 1.136, 2.15, 4, 0.36); c.flames.visible = false;
    c.slots = [[-0.42, 1.03, -0.75], [0.42, 1.03, -0.75], [-0.42, 1.03, -1.65], [0.42, 1.03, -1.65], [-0.42, 1.75, -1.2], [0.42, 1.75, -1.2]];
  }
  function buildTP(c) {
    const g = c.group; c.bodyMat = S.toon(PAL.orange);
    TB(0.72, 0.9, 0.52, c.bodyMat, 0, 0.55, 0.9, g, 0.12);                                      // bloc hydraulique
    TB(0.5, 0.2, 0.4, PAL.slateDark, 0, 1.05, 0.9, g, 0.06);
    const t = cyl(0.035, 0.035, 1.2, PAL.slateDark, g, 0, 1.3, 1.1, 6); t.rotation.x = -0.4;         // timon
    TB(0.62, 0.08, 0.1, PAL.black, 0, 1.85, 1.33, g, 0.03); ball(0.06, PAL.red, g, 0, 1.9, 1.33);
    for (const x of [-0.3, 0.3]) TB(0.2, 0.09, 1.9, PAL.steelDark, x, 0.12, -0.35, g, 0.03);        // fourches
    // palette en bois sur les fourches
    for (const x of [-0.5, -0.17, 0.17, 0.5]) TB(0.26, 0.04, 1.7, PAL.wood, x, 0.2, -0.4, g, 0.01);
    for (const z of [-1.1, -0.4, 0.3]) TB(1.2, 0.03, 0.14, PAL.woodDark, 0, 0.165, z, g, 0.01);
    for (const [x, z] of [[0.3, 0.9], [-0.3, 0.9], [0.3, -1.2], [-0.3, -1.2]]) wheel(c, g, x, 0.1, z, 0.1, 0.09, PAL.steel, z > 0);
    c.slots = [[-0.32, 0.21, 0.05], [0.32, 0.21, 0.05], [-0.32, 0.21, -0.75], [0.32, 0.21, -0.75], [0, 0.95, -0.35], [0, 1.65, -0.35]];
  }
  function buildFenwick(c) {
    const g = c.group; c.bodyMat = S.toon(PAL.lebecYellow);
    TB(1.3, 0.9, 2.1, c.bodyMat, 0, 0.75, -0.1, g, 0.22);                                       // caisse
    TB(1.28, 0.85, 0.65, PAL.slateDark, 0, 0.95, -1.05, g, 0.25);                                // contrepoids arrondi
    for (const x of [-0.45, 0.45]) TB(0.1, 0.06, 0.4, PAL.black, x, 1.1, -1.4, g, 0.02);         // grilles
    for (const x of [-0.6, 0.6]) for (const z of [-0.8, 0.5]) TB(0.08, 1.4, 0.08, PAL.black, x, 1.9, z, g, 0.02);   // arceaux
    TB(1.34, 0.08, 1.44, PAL.black, 0, 2.6, -0.15, g, 0.03);
    for (const x of [-0.4, 0, 0.4]) TB(0.06, 0.04, 1.36, PAL.slate, x, 2.66, -0.15, g, 0.01);
    TB(0.5, 0.12, 0.45, PAL.slate, 0, 1.25, -0.3, g, 0.05); TB(0.5, 0.5, 0.1, PAL.slate, 0, 1.5, -0.52, g, 0.05);   // siège
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 14), S.toon(PAL.black)); sw.position.set(0, 1.55, 0.25); sw.rotation.x = -1.0; g.add(sw);
    ball(0.1, PAL.orange, g, 0, 2.72, -0.6);                                                        // gyrophare
    for (const x of [-0.45, 0.45]) TB(0.12, 2.6, 0.14, PAL.steelDark, x, 1.4, 1.05, g, 0.03);    // mât
    TB(1.0, 0.08, 0.14, PAL.steelDark, 0, 2.66, 1.05, g, 0.03);
    c.forks = new THREE.Group(); c.forks.position.set(0, 0.15, 1.15); c.forks.userData.keep = true; g.add(c.forks);
    TB(1.0, 0.5, 0.07, PAL.slateDark, 0, 0.25, 0, c.forks, 0.03);
    for (const x of [-0.3, 0.3]) { TB(0.13, 0.07, 1.1, PAL.steel, x, 0.03, 0.55, c.forks, 0.02); TB(0.13, 0.4, 0.07, PAL.steel, x, 0.22, 0.03, c.forks, 0.02); }
    c.loadG = new THREE.Group(); c.loadG.userData.keep = true; c.loadG.position.set(0, 0.07, 0.65); c.forks.add(c.loadG);
    for (const [x, z] of [[0.6, 0.7], [-0.6, 0.7], [0.6, -0.8], [-0.6, -0.8]]) wheel(c, g, x, 0.3, z, 0.3, 0.25, PAL.lebecYellow, z < 0);
    for (const x of [-0.45, 0.45]) ball(0.08, LIGHT, g, x, 1.15, 0.95, 1, 1, 0.5);
    c.slots = [[0, 0.3, 1.6]];
  }
  let truckSign;
  function buildCamion(c, spec) {
    const g = c.group, body = c.bodyMat = S.toon(spec.color).clone();
    TB(2.3, 0.45, 8, PAL.slateDark, 0, 0.75, -0.4, g, 0.06);                                    // châssis
    // cabine arrondie (on voit l'intérieur depuis le siège)
    TB(2.4, 1.05, 2.0, body, 0, 1.42, 2.6, g, 0.22);
    TB(2.42, 0.28, 2.02, body, 0, 2.9, 2.6, g, 0.14);
    TB(2.4, 1.15, 0.14, body, 0, 2.35, 1.67, g, 0.04);
    for (const x of [-1.13, 1.13]) for (const z of [1.7, 3.5]) TB(0.14, 1.0, 0.16, body, x, 2.4, z, g, 0.04);
    glass(2.15, 0.95, g, 0, 2.4, 3.58, 0);
    for (const x of [-1.2, 1.2]) glass(1.6, 0.9, g, x, 2.4, 2.6, Math.PI / 2);
    TB(1.9, 0.5, 0.6, PAL.slateDark, 0, 3.25, 2.4, g, 0.2);                                       // déflecteur de toit
    TB(2.2, 0.28, 0.4, PAL.slateDark, 0, 1.98, 3.3, g, 0.06);                                     // planche de bord
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), S.toon(PAL.black)); sw.position.set(0.55, 2.2, 3.1); sw.rotation.x = -0.9; g.add(sw);
    TB(1.5, 0.4, 0.1, PAL.slate, 0, 0.9, 3.66, g, 0.04);                                         // calandre
    for (const x of [-0.85, 0.85]) ball(0.17, LIGHT, g, x, 1.2, 3.6, 1, 1, 0.5);
    TB(2.5, 0.3, 0.28, PAL.slateDark, 0, 0.62, 3.6, g, 0.1);
    // plateau, ridelles, tête de benne
    TB(2.4, 0.15, 5.4, PAL.wood, 0, 1.1, -1.4, g, 0.03);
    for (const x of [-1.15, 1.15]) TB(0.09, 0.5, 5.4, PAL.steel, x, 1.4, -1.4, g, 0.03);
    TB(2.4, 1.2, 0.09, PAL.steel, 0, 1.75, 1.3, g, 0.03);
    for (const x of [-0.9, 0.9]) TB(0.3, 0.16, 0.08, TAIL, x, 0.85, -4.42, g, 0.03);
    TB(2.4, 0.18, 0.12, PAL.markYellow, 0, 0.6, -4.42, g, 0.03);
    // enseigne peinte « LEBEC TRANSPORTS »
    if (!truckSign) truckSign = S.toon(PAL.white, 0, { map: S.signTex('LEBEC TRANSPORTS', 'usinage de précision', S.hex(PAL.lebecBlue), S.hex(PAL.lebecYellow)), key: 'enseigneCamion' });
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), truckSign); p.position.set(sx * 1.215, 1.45, 2.6); p.rotation.y = sx * Math.PI / 2; g.add(p); }
    const pb = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), truckSign); pb.position.set(0, 2.05, 1.25); pb.rotation.y = Math.PI; g.add(pb);
    for (const [x, z] of [[1.15, 2.6], [-1.15, 2.6], [1.15, -2.2], [-1.15, -2.2], [1.15, -3.3], [-1.15, -3.3]]) wheel(c, g, x, 0.5, z, 0.5, 0.35, PAL.steel, z > 0);
    c.wing = new THREE.Group(); c.flames = new THREE.Group();
    c.slots = [[0, 1.2, -0.3], [0, 1.2, -2.7]];
  }
  Cars.build = (i, spec) => {
    const g = new THREE.Group(); g.rotation.order = 'YXZ';
    const c = { i, kind: spec.kind, group: g, wheels: [], bed: new THREE.Group(), bedKey: '', pos: new THREE.Vector3(spec.x, 0, spec.z), target: new THREE.Vector3(spec.x, 0, spec.z), h: spec.h, th: spec.h, speed: 0, steer: 0, local: false, fuel: spec.fuel, tuneKey: '', tp: 0, tr: 0, sr: 0 };
    if (spec.kind === 'tp') buildTP(c); else if (spec.kind === 'fenwick') buildFenwick(c); else if (spec.kind === 'camion') buildCamion(c, spec); else buildVan(c, spec);
    c.bed.userData.keep = true; g.add(c.bed);
    const lab = U.label(spec.name, { size: spec.kind === 'tp' ? 0.3 : 0.4, color: '#ffd257' }); lab.position.set(0, spec.kind === 'tp' ? 2.2 : spec.kind === 'camion' ? 3.9 : 2.6, 0); g.add(lab); c.label = lab;
    // fusion « cuite » : carrosserie peinte (1) + reste (1) + vitres (1) + roues (1 InstancedMesh) + parties animées
    if (c.wing && c.wing.parent) c.wing = ML.Bake.bake(c.wing);
    if (c.flames && c.flames.parent) c.flames = ML.Bake.bake(c.flames);
    if (c.forks) c.forks = ML.Bake.bake(c.forks);
    wheelsIM(c, g);
    c.group = ML.Bake.bake(g);
    ML.scene.add(c.group); Cars.list[i] = c;
    return c;
  };
  /** (Re)crée les véhicules selon l'état de l'hôte (nombre / types) */
  Cars.sync = list => {
    const key = list.map(c => c.kind + c.color).join(',');
    if (key === Cars.key) return false;
    Cars.clear(); Cars.key = key;
    list.forEach((s, i) => Cars.build(i, s));
    return true;
  };
  Cars.clear = () => { for (const c of Cars.list) if (c) ML.scene.remove(c.group); Cars.list = []; Cars.key = ''; for (const t of Cars.traffic) ML.scene.remove(t); Cars.traffic = []; if (Cars.police) ML.scene.remove(Cars.police); Cars.police = null; if (Cars.parkedPolice) ML.scene.remove(Cars.parkedPolice); Cars.parkedPolice = null; };
  /** Tuning : peinture, aileron, flammes, jantes dorées */
  Cars.tune = (c, t, baseColor) => {
    const k = JSON.stringify(t || {}); if (!c || !['megane', 'kangoo', 'ducato'].includes(c.kind) || k === c.tuneKey) return; c.tuneKey = k; t = t || {};
    c.bodyMat.color.setHex(t.paint !== undefined ? t.paint : baseColor);
    c.wing.visible = !!t.aileron; c.flames.visible = !!t.flammes;
    if (c.wheelIM) c.wheelIM.geometry = c.wheelGeos[t.jantes ? 1 : 0];                      // jantes dorées
  };

  /* ---------- Pose sur le relief ---------- */
  const LEN = c => (c.kind === 'tp' ? 0.9 : c.kind === 'camion' ? 3 : c.kind === 'fenwick' ? 1 : 1.5);
  const WID = c => (c.kind === 'tp' ? 0.4 : c.kind === 'camion' ? 1.1 : c.kind === 'fenwick' ? 0.6 : 0.9);
  /** Altitude et inclinaison (lissée) d'un véhicule : st reçoit tp (tangage) et tr (roulis) */
  function ground(st, x, z, h, len, wid, k) {
    const f = Cars.fwd(h), l = Cars.left(h);
    const hc = H(x, z), hf = H(x + f.x * len, z + f.z * len), hb = H(x - f.x * len, z - f.z * len), hl = H(x + l.x * wid, z + l.z * wid), hr = H(x - l.x * wid, z - l.z * wid);
    const p = -Math.atan2(hf - hb, 2 * len), r = Math.atan2(hl - hr, 2 * wid);
    if (st.tp === undefined || k >= 1) { st.tp = p; st.tr = r; } else { st.tp = U.lerp(st.tp, p, k); st.tr = U.lerp(st.tr, r, k); }
    return Math.max(hc, (hf + hb) / 2, (hl + hr) / 2);
  }
  Cars.ground = ground;

  /** Écart d'angle a − b ramené dans [−π, π] */
  const angD = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  Cars.fwd = h => ({ x: Math.sin(h), z: Math.cos(h) });
  Cars.left = h => ({ x: Math.cos(h), z: -Math.sin(h) });
  /** Position de la portière (y absolu, sol compris) */
  Cars.doorPos = c => { const l = Cars.left(c.h), tp = c.kind === 'tp', f = Cars.fwd(c.h), v = (x, y, z) => new THREE.Vector3(x, y + H(x, z), z);
    if (c.kind === 'camion') return v(c.pos.x + l.x * 1.6 + f.x * 2.6, 1.3, c.pos.z + l.z * 1.6 + f.z * 2.6);
    if (c.kind === 'fenwick') return v(c.pos.x + l.x * 1.1, 1.2, c.pos.z + l.z * 1.1);
    return tp ? v(c.pos.x + f.x * 1.1, 1.0, c.pos.z + f.z * 1.1) : v(c.pos.x + l.x * 1.3, 1.1, c.pos.z + l.z * 1.3); };
  /** Position de la benne / de l'arrière (y absolu, sol compris) */
  Cars.rearPos = c => { const f = Cars.fwd(c.h), k = c.kind === 'tp' ? 1.2 : c.kind === 'camion' ? 4.6 : c.kind === 'fenwick' ? -2.2 : 2.6, x = c.pos.x - f.x * k, z = c.pos.z - f.z * k; return new THREE.Vector3(x, (c.kind === 'tp' ? 0.6 : 1.1) + H(x, z), z); };
  const R = c => (c.kind === 'tp' ? 0.55 : c.kind === 'camion' ? 1.3 : c.kind === 'fenwick' ? 0.8 : 1.0), OFF = c => (c.kind === 'tp' ? [0.6, -0.6] : c.kind === 'camion' ? [2.8, 1.2, -0.6, -2.4, -3.8] : c.kind === 'fenwick' ? [0.6, -0.6] : [1.2, 0, -1.2]);
  /** Place d'un passager (cabine ou benne) — y ABSOLU (sol compris) */
  Cars.seatPos = (c, seat) => {
    const f = Cars.fwd(c.h), l = Cars.left(c.h), v = (x, y, z) => ({ x, y: y + H(x, z), z });
    if (seat === 'cab') return c.kind === 'camion' ? v(c.pos.x - l.x * 0.55 + f.x * 2.7, 1.6, c.pos.z - l.z * 0.55 + f.z * 2.7) : v(c.pos.x + f.x * 0.15 - l.x * 0.38, 0.75, c.pos.z + f.z * 0.15 - l.z * 0.38);
    const s = seat === 'bed1' ? -1 : 1;
    return v(c.pos.x - f.x * 1.25 + l.x * 0.45 * s, 1.05, c.pos.z - f.z * 1.25 + l.z * 0.45 * s);
  };

  /** Repousse un point (joueur) hors des carrosseries */
  Cars.pushOut = (p, r) => {
    const push = (cx, cz, R2) => { const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz); if (d < R2 && d > 0.001) { p.x = cx + dx / d * R2; p.z = cz + dz / d * R2; } };
    for (const c of Cars.list) { const f = Cars.fwd(c.h); for (const k of OFF(c)) push(c.pos.x + f.x * k, c.pos.z + f.z * k, r + R(c)); }
    for (const o of Cars.trafficPts()) push(o.x, o.z, r + o.r);
  };

  /* ---------- Conduite locale ----------
     Arcade avec du caractère (réglages par véhicule : CFG.CAR.kinds). Le véhicule a une vitesse
     longitudinale (c.speed) ET latérale (c.vlat) : le virage fait tourner le nez, les pneus ramènent la
     vitesse dans l'axe avec une force limitée (adhérence) → glisse quand on force, dérive au frein à main
     (Espace). Masse = véhicule + chargement (benne c.bed, fourches c.load, passagers) : accélération plus
     molle, freinage plus long, plus de roulis, sous-virage du camion chargé. Pente : on ralentit en montée,
     on accélère en descente, les freins chauffent dans les longues descentes (fumée). Hors route : moins
     d'adhérence, ça secoue (bosses). Eau : gerbes, le moteur cale. Fenwick : roues arrière directrices
     (l'arrière balaie), la charge haute oscille et tombe si on tourne trop vite. */
  const KIN = k => (CF.kinds && CF.kinds[k]) || { mass: 1200, grip: 10, slip: 8, under: 0.1, roll: 0.08, pitch: 0.04, strap: 1, hb: 1 };
  /** Masse d'un objet chargé (kg) */
  Cars.itemMass = it => {
    if (!it) return 0;
    const M = CF.itemMass || {}; let v = M[it.type];
    if (v === undefined) v = ML.Items && ML.Items.heavy(it) ? 250 : ML.Items && ML.Items.bulky(it) ? 45 : 15;
    if (it.type === 'piece' && it.d && it.d.size === 'l') v *= 3;
    return v;
  };
  /** Masse du chargement d'un véhicule (état de l'hôte : bed, load, passagers) */
  Cars.loadMass = sc => (sc ? (sc.bed || []).reduce((a, it) => a + Cars.itemMass(it), 0) + Cars.itemMass(sc.load) + (sc.pass || []).length * 75 : 0);
  /** Sol « roulable » : route, cour de l'atelier, quais des clients */
  function paved(x, z) {
    const T = ML.Terrain; if (!T || !T.roadDist || !T.RD) return true;
    if (T.roadDist(x, z) < 1.2) return true;
    if (U.inWorkshop && U.inWorkshop({ x, z })) return true;
    const A = ML.ATELIER && ML.ATELIER.box; if (A && x > A.minX - 16 && x < A.maxX + 16 && z > A.minZ - 16 && z < 34) return true;
    const L = ML.LOC && ML.LOC.comp; if (L) for (const k in L) { const d = L[k].dock; if (d && Math.abs(d.x - x) < 16 && Math.abs(d.z - z) < 16) return true; }
    return false;
  }
  Cars.paved = paved;
  /** Bandeau « ÇA PENCHE ! » (créé à la demande, caché s'il n'est plus mis à jour) */
  let leanEl = null, leanT = 0;
  function leanHUD(level, fen) {
    if (!leanEl) {
      leanEl = document.createElement('div');
      leanEl.style.cssText = 'position:fixed;left:50%;top:22%;transform:translateX(-50%);font:900 28px system-ui,sans-serif;color:#ffd257;text-shadow:0 3px 0 #000,0 0 12px #e94f37;pointer-events:none;z-index:40;opacity:0;transition:opacity .12s;white-space:nowrap';
      document.body.appendChild(leanEl);
    }
    leanT = performance.now();
    leanEl.textContent = level > 0.85 ? (fen ? '⚠ LA CHARGE VA TOMBER !' : '⚠ ÇA PENCHE ! ÇA PENCHE !') : (fen ? '⚠ la charge oscille…' : '⚠ ça penche !');
    leanEl.style.opacity = U.clamp(0.55 + level * 0.6, 0.6, 1);
    leanEl.style.transform = `translateX(-50%) rotate(${Math.sin(performance.now() / 70) * level * 6}deg) scale(${1 + level * 0.25})`;
    leanEl.style.color = level > 0.85 ? '#ff5a3c' : '#ffd257';
  }
  Cars.leanHUDTick = () => { if (leanEl && performance.now() - leanT > 150) leanEl.style.opacity = 0; };

  /** Conduite locale (seulement par le conducteur). Renvoie { lat, side, hard, crash, air, spill, bump, lean, warn }. */
  Cars.drive = (c, dt, input, env) => {
    const I = ML.Input, tp = c.kind === 'tp' || c.kind === 'fenwick', P = c.kind === 'tp' ? ML.CFG.TP : c.kind === 'fenwick' ? ML.CFG.FENWICK : c.kind === 'camion' ? ML.CFG.CAMION : CF, S = ML.Game.S, Kd = KIN(c.kind);
    const sc = S && S.cars ? S.cars[c.i] : null;
    const turbo = !tp && S && S.buffs && S.buffs.turbo > S.rt ? 1.3 : 1, frozen = env.frozen, dry = !tp && c.fuel <= 0;
    const now = performance.now();
    if (!c._drv || now - c._drv > 700) { c.vlat = 0; c.yr = 0; c.lean = 0; c.spillM = 0; c.heat = 0; c.roll = 0; c.rollV = 0; c.pitch = 0; c.pitchV = 0; c.stall = 0; c.bumpT = 0.5; }
    c._drv = now;
    let thr = 0, st = 0, hb = false;
    if (input && !frozen) {
      if (I.down('KeyW') || I.down('ArrowUp')) thr += 1;
      if (I.down('KeyS') || I.down('ArrowDown')) thr -= 1;
      if (I.down('KeyA') || I.down('ArrowLeft')) st += 1;
      if (I.down('KeyD') || I.down('ArrowRight')) st -= 1;
      if (I.padActive) { if (I.padAxes.x) st = -I.padAxes.x; if (I.padAxes.thr > 0.15) thr = I.padAxes.thr; else if (I.padAxes.brk > 0.15) thr = -I.padAxes.brk; }
      hb = I.down('Space');
    }
    // ---- masse, surface, eau ----
    const loadM = Cars.loadMass(sc), mk = 1 + 1.6 * loadM / Kd.mass;              // 1 = à vide (effet du chargement exagéré : on doit le SENTIR)
    const x0 = c.pos.x, z0 = c.pos.z, gNow = H(x0, z0);
    const off = !c.air && !paved(x0, z0);
    const wl = ML.Terrain.water ? ML.Terrain.water(x0, z0) : null, depth = wl !== null ? wl - (c.alt !== undefined ? c.alt : gNow) : 0, wet = depth > 0.12;
    let grip = Kd.grip * (env.rain ? 0.78 : 1) * (off ? 0.62 : 1) / Math.pow(mk, 0.22), slipK = Kd.slip * (env.rain ? 0.8 : 1) * (off ? 0.7 : 1);
    const aqua = env.puddle && Math.abs(c.speed) > 6;
    if (aqua) { grip *= 0.3; slipK *= 0.2; }                                          // aquaplaning
    if (wet) { grip *= 0.7; if (Math.abs(c.speed) > 2 && !(c.stall > 0) && Math.random() < dt * Math.min(1.5, depth * 3)) { c.stall = 2.5; if (ML.HUD) ML.HUD.notify('💦 Glou glou… le moteur a calé dans l\'eau !', 'warn'); ML.Sfx.play('clang'); } }
    if (c.stall > 0) { c.stall -= dt; if (thr > 0) thr = 0; }
    if (dry && thr > 0) thr = 0;
    // ---- longitudinal : moteur, freins (qui chauffent), pente, frottements ----
    const f0 = Cars.fwd(c.h), l0 = Cars.left(c.h);
    const grade = c.air ? 0 : U.clamp((H(x0 + f0.x * 1.5, z0 + f0.z * 1.5) - H(x0 - f0.x * 1.5, z0 - f0.z * 1.5)) / 3, -0.6, 0.6);
    const fade = 1 - 0.55 * U.clamp((c.heat - 0.55) / 0.45, 0, 1);
    const accel = P.accel * turbo / Math.pow(mk, 0.85), brake = P.brake * fade / Math.pow(mk, 0.45);
    let v = c.speed;
    const braking = (thr < 0 && v > 0.5) || (thr > 0 && v < -0.5);
    const vmax = P.max * turbo * (off ? 0.7 : 1) * (wet ? 0.5 : 1) * U.clamp(1 - Math.max(0, grade) * 3.5 * Math.sqrt(mk), 0.3, 1);   // en montée le moteur peine (et encore plus chargé)
    if (thr > 0 && v >= vmax) thr = 0.001;                                            // plus de puissance au-delà de la vitesse max
    if (thr > 0) v += (v < -0.5 ? brake : accel) * thr * dt;
    else if (thr < 0) v -= (v > 0.5 ? brake : accel * 0.6) * -thr * dt;
    else v -= Math.sign(v) * Math.min(Math.abs(v), (off ? 4 : 0.9) * dt);
    if (thr > 0 && thr < 0.01) v -= Math.sign(v) * Math.min(Math.abs(v), 0.9 * dt);
    if (!c.air) v -= 9.8 * grade * dt;                                               // la pente
    if (hb) v -= Math.sign(v) * Math.min(Math.abs(v), (tp ? 20 : 6) * dt);            // frein à main (bloque l'arrière)
    if (frozen) v -= Math.sign(v) * Math.min(Math.abs(v), 30 * dt);
    if (off) v -= v * 0.35 * dt;
    if (wet) v -= v * Math.min(3, depth * 4) * dt;
    if (v > vmax && grade > -0.02) v -= Math.min(v - vmax, 4 * dt);                  // en descente, on peut dépasser (il faut freiner !)
    if (v > vmax * 1.35) v = vmax * 1.35;
    v = Math.max(v, -P.rev);
    // chauffe des freins : longues descentes, gros freinages, gros chargement
    if (braking && Math.abs(v) > 4) c.heat = Math.min(1.2, c.heat + dt * (0.03 + Math.abs(v) * 0.009) * Math.sqrt(mk) * (grade < -0.03 ? 2.2 : 1));
    else c.heat = Math.max(0, c.heat - dt * (grade < -0.03 ? 0.03 : 0.08));
    if (c.heat > 0.8 && !c._fadeMsg) { c._fadeMsg = true; if (ML.HUD) ML.HUD.notify('🔥 Les freins chauffent ! Ça sent le Ferodo… (ça freine moins)', 'warn'); }
    if (c.heat < 0.3) c._fadeMsg = false;
    // ---- direction : braquage, sous-virage, frein à main ----
    const spd = Math.abs(v);
    const target = st * P.steer * (1 - 0.5 * Math.min(1, spd / P.max));
    c.steer = U.lerp(c.steer, target, Math.min(1, (tp ? 10 : 7) * dt));
    let yaw = v * Math.tan(c.steer) / P.wb;
    const under = Math.min(0.85, Kd.under + 0.3 * (mk - 1));
    if (spd > 1 && !hb) { const lim = grip * (1.2 - under * 0.6) / spd; yaw = U.clamp(yaw, -lim, lim); }   // le nez « tire tout droit »
    if (hb && spd > 3 && Kd.hb) { yaw *= 1 + 0.7 * Kd.hb; slipK *= 1 - 0.85 * Kd.hb; grip *= 1 - 0.6 * Kd.hb; }   // dérive !
    if (aqua) yaw += (Math.random() - 0.5) * 3;
    if (c.air) yaw *= 0.1;
    c.yr = U.lerp(c.yr || 0, yaw, Math.min(1, dt * 12 / Math.sqrt(mk) / (c.kind === 'camion' ? 1.6 : 1)));
    const dh = c.yr * dt;
    c.h += dh;
    const f = Cars.fwd(c.h), l = Cars.left(c.h);
    if (Kd.rear) { const a = P.wb * 0.5; c.pos.x += (f0.x - f.x) * a; c.pos.z += (f0.z - f.z) * a; }   // fenwick : pivot sur l'essieu AVANT, l'arrière balaie
    // ---- vitesse dans le nouveau repère : les pneus ramènent la glisse latérale ----
    const wx = f0.x * v + l0.x * (c.vlat || 0), wz = f0.z * v + l0.z * (c.vlat || 0);
    let vf = wx * f.x + wz * f.z, vl = wx * l.x + wz * l.z;
    if (!c.air) { const want = vl * (1 - Math.exp(-slipK * dt)), maxD = grip * dt * 1.4; vl -= U.clamp(want, -maxD, maxD); }
    if (Math.abs(vl) < 0.02) vl = 0;
    const accLong = (vf - c.speed) / Math.max(dt, 1e-3);
    c.speed = vf; c.vlat = vl;
    const latS = U.clamp(vf * c.yr, -grip * 1.5, grip * 1.5);                         // accélération latérale (+ = virage à gauche)
    const moved = Math.hypot(vf, vl) * dt;
    c.pos.x += (f.x * vf + l.x * vl) * dt; c.pos.z += (f.z * vf + l.z * vl) * dt;
    if (!tp && moved > 0) c.fuel = Math.max(0, c.fuel - moved * (P.fuelUse || CF.fuelUse));
    // ---- collisions (décor, autres véhicules, circulation, gendarmerie) ----
    let hit = false, hard = 0;
    const others = Cars.list.filter(o => o && o !== c).map(o => o.pos).concat(Cars.trafficPts());
    for (const k of OFF(c)) {
      const p = { x: c.pos.x + f.x * k, z: c.pos.z + f.z * k }, ox = p.x, oz = p.z;
      if (U.resolveCircle(p, R(c) - 0.02)) { hit = true; c.pos.x += p.x - ox; c.pos.z += p.z - oz; }
      for (const o of others) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), rr = o.r ? o.r + R(c) : 2.3;
        if (d < rr && d > 0.01) { c.pos.x += dx / d * (rr - d); c.pos.z += dz / d * (rr - d); hit = true; }
      }
    }
    if (hit) { hard = Math.hypot(c.speed, c.vlat); if (hard > 6) ML.Sfx.play('clang'); c.speed *= -0.2; c.vlat *= 0.3; }
    // ---- altitude : si le sol se dérobe (falaise, corniche), le véhicule DÉCOLLE et tombe ----
    let crash = 0, bump = 0;
    const g = H(c.pos.x, c.pos.z);
    if (c.alt === undefined || (!c.air && Math.abs(c.alt - g) > 40)) { c.alt = g; c.vy = 0; }
    if (c.air || g < c.alt - 0.9) {
      if (!c.air) { c.air = true; c.vy = Math.min(0, c.vy || 0); c.airT = 0; }
      c.vy -= 22 * dt; c.alt += c.vy * dt; c.airT += dt;
      if (c.alt <= g) {
        const impact = -c.vy; c.alt = g; c.air = false; c.vy = 0;
        if (impact > 12 || c.airT > 1.1) { crash = impact; c.speed *= 0.1; } else { c.speed *= 0.8; if (c.airT > 0.15) bump = impact * 0.35; c.pitchV += impact * 0.08; }
      }
    } else { c.vy = (g - c.alt) / Math.max(dt, 1e-3); c.alt = g; }
    const w = ML.Terrain.water(c.pos.x, c.pos.z); if (w !== null && c.alt < w - 0.6 && !c.sunk) { c.sunk = true; crash = Math.max(crash, 20); } else if (w === null) c.sunk = false;
    // ---- hors route : ça secoue ----
    if (off && spd > 5) { c.bumpT -= dt; if (c.bumpT <= 0) { c.bumpT = 0.18 + Math.random() * 0.45; const b = spd * (0.04 + Math.random() * 0.07); c.pitchV += b * 0.5 * (Math.random() < 0.5 ? -1 : 1); c.rollV += b * 0.4 * (Math.random() - 0.5); if (b > bump) bump = b; } }
    // ---- carrosserie : roulis / tangage sur ressorts (le fenwick chargé oscille) ----
    const springK = c.kind === 'fenwick' && sc && sc.load ? 26 : 70, damp = c.kind === 'fenwick' && sc && sc.load ? 3 : 11;
    const rollT = latS / Math.max(4, Kd.grip) * Kd.roll * (1 + 0.6 * (mk - 1)), pitchT = U.clamp(-accLong / 12, -1.5, 1.5) * Kd.pitch * (1 + 0.4 * (mk - 1));
    c.rollV += ((rollT - c.roll) * springK - c.rollV * damp) * dt; c.roll += c.rollV * dt;
    c.pitchV += ((pitchT - c.pitch) * springK - c.pitchV * damp) * dt; c.pitch += c.pitchV * dt;
    c.roll = U.clamp(c.roll, -0.35, 0.35); c.pitch = U.clamp(c.pitch, -0.3, 0.3);
    // ---- chargement : jauge « ça penche » → une caisse tombe ----
    let spill = 0, warn = 0;
    const nb = sc ? (sc.bed || []).length : 0, fen = c.kind === 'fenwick' && sc && sc.load;
    if ((nb && c.kind !== 'tp') || fen) {
      const avg = nb ? (sc.bed.reduce((a, it) => a + Cars.itemMass(it), 0) / nb) : 0;
      // seuil (m/s²) : tenue du véhicule, pile haute = moins stable, caisses légères = glissent plus ; fenwick : charge lourde = haute et instable
      const thrL = fen ? 2.6 + 6 / (1 + Cars.itemMass(sc.load) / 250) : 7 * Kd.strap * (1 - 0.06 * Math.min(4, nb - 1)) * (0.85 + 0.3 * Math.min(1, avg / 100));
      const lean = Math.abs(latS) / thrL + (fen ? Math.abs(c.rollV) * 0.25 : 0);
      c.lean = U.lerp(c.lean || 0, lean, Math.min(1, dt * 6));
      if (c.lean > 1) c.spillM += (c.lean - 0.9) * dt * 1.6; else c.spillM = Math.max(0, c.spillM - dt * 0.8);
      if (c.spillM >= 1) { c.spillM = 0; spill = latS > 0 ? -1 : 1; }                 // côté EXTÉRIEUR du virage
      if (!spill && bump > 1.3 && Math.random() < Math.min(0.85, (bump - 1.1) * 0.5)) { spill = Math.random() < 0.5 ? 1 : -1; c._bump = true; } else c._bump = false;
      if (!spill && hard > 12) spill = Math.random() < 0.5 ? 1 : -1;
      warn = c.lean > 0.7 || c.spillM > 0.15 ? U.clamp(Math.max(c.lean - 0.55, c.spillM), 0.2, 1) : 0;
      if (warn) leanHUD(warn, fen);
    } else { c.lean = 0; c.spillM = 0; }
    // ---- fumée, gerbes d'eau ----
    c.fxT = (c.fxT || 0) - dt;
    if (ML.Fx && ML.Fx.emit && c.fxT <= 0) {
      const rear = new THREE.Vector3(c.pos.x - f.x * (c.kind === 'camion' ? 2.6 : 1.3), c.alt + 0.3, c.pos.z - f.z * (c.kind === 'camion' ? 2.6 : 1.3));
      if ((c.heat > 0.6 && braking) || (Math.abs(vl) > 3 && !c.air && !wet)) { c.fxT = 0.06; ML.Fx.emit('smoke', rear, { x: 0, y: 1, z: 0 }, c.heat > 0.9 ? 3 : 2); }
      else if (wet && spd > 1.5) { c.fxT = 0.05; ML.Fx.emit('spray', new THREE.Vector3(c.pos.x, c.alt + 0.3, c.pos.z), { x: l.x * 0.4, y: 1, z: l.z * 0.4 }, 4); }
    }
    c.target.copy(c.pos); c.th = c.h;
    return { lat: Math.abs(latS), side: latS > 0 ? -1 : 1, hard, crash, air: !!c.air, spill, bump: !!c._bump && !!spill, lean: c.lean || 0, warn };
  };

  /** Rendu : position lissée (si pas locale), pose sur le relief, roues, contenu de la benne */
  Cars.render = (c, dt, bedItems, load) => {
    if (c.loadG) { const lk = JSON.stringify(load || null); if (lk !== c.loadKey) { c.loadKey = lk; c.loadG.clear(); if (load) c.loadG.add(ML.Items.mesh(load, { noLabel: true })); } c.forks.position.y = U.lerp(c.forks.position.y, load ? 0.6 : 0.15, Math.min(1, dt * 4)); }
    let roll = c.speed * dt;
    if (!c.local) {
      const k = Math.min(1, dt * 10), ox = c.pos.x, oz = c.pos.z;
      if (c.pos.distanceToSquared(c.target) > 100) c.pos.copy(c.target); else c.pos.lerp(c.target, k);
      c.h = U.lerpAngle(c.h, c.th, k); c.steer = 0;
      roll = Math.hypot(c.pos.x - ox, c.pos.z - oz);
    }
    let gy = ground(c, c.pos.x, c.pos.z, c.h, LEN(c), WID(c), Math.min(1, dt * 8));
    if (c.local && c.air) { gy = c.alt; c.tp = U.lerp(c.tp, -0.9, Math.min(1, dt * 1.2)); }   // en vol : le nez pique (vers le bas)
    c.group.position.set(c.pos.x, gy, c.pos.z);
    if (c.local) { c.sr = c.roll || 0; c.sp = c.pitch || 0; }                       // roulis / tangage de Cars.drive (ressorts)
    else { const id = 1 / Math.max(dt, 1e-3), lat = angD(c.h, c._ph === undefined ? c.h : c._ph) * id * roll * id; c.sr = U.lerp(c.sr || 0, U.clamp(lat * 0.008, -0.1, 0.1), Math.min(1, dt * 5)); c.sp = 0; }
    c._ph = c.h;
    c.group.rotation.y = c.h; c.group.rotation.x = c.tp + (c.sp || 0);
    c.group.rotation.z = c.tr + c.sr;
    // le chargement tangue quand ça penche (signal visuel avant que ça tombe)
    const wob = c.local && c.lean > 0.55 ? Math.sin(performance.now() / 55) * 0.05 * Math.min(1.5, c.lean) : 0;
    c.bed.rotation.z = (c.local ? (c.roll || 0) * 1.2 : 0) + wob; c.bed.position.y = Math.abs(wob) * 0.6;
    if (c.loadG) c.loadG.rotation.z = (c.local ? (c.roll || 0) * 2.2 : 0) + wob * 1.5;
    for (const w of c.wheels) { w.rotation.x += roll / 0.38; if (w.front) w.rotation.y = c.steer; }
    syncWheels(c);
    const key = JSON.stringify(bedItems || []);
    if (key !== c.bedKey) {
      c.bedKey = key; c.bed.clear();
      (bedItems || []).forEach((it, j) => { const m = ML.Items.mesh(it); const s = c.slots[j] || c.slots[0]; m.position.set(s[0], s[1], s[2]); c.bed.add(m); });
    }
  };

  /* ---------- Voitures civiles (circulation, voitures garées) ---------- */
  const CIVIL_COLS = [PAL.red, PAL.shutterBlue, PAL.mint, PAL.lebecYellow, PAL.orange, PAL.purple, PAL.white, PAL.pink, PAL.shutterGreen, PAL.slate];
  const SHAPES = 4;                                                       // berline, citadine, break, « bulle » façon 2CV
  /** Carrosserie civile (non fusionnée). v = forme, col = couleur, deco = fonction(g, dims) facultative */
  function civilBody(v, col, deco) {
    const g = new THREE.Group(), body = S.toon(col);
    const L = [4.2, 3.7, 4.4, 3.9][v], cabL = [2.0, 1.85, 2.75, 2.2][v], cabZ = [-0.15, -0.3, -0.45, -0.15][v], roofH = [0.56, 0.62, 0.58, 0.7][v];
    const wz = L / 2 - 0.82, bubble = v === 3;
    TB(1.8, 0.56, L, body, 0, 0.64, 0, g, 0.26);
    TB(1.84, 0.08, L - 0.2, PAL.slateDark, 0, 0.4, 0, g, 0.03);
    for (const x of [-0.92, 0.92]) for (const z of [-wz, wz]) TB(0.2, 0.2, 0.95, body, x, 0.86, z, g, 0.08);
    if (bubble) {                                                         // cabine en bulle + capot arrondi
      const d = mesh(DOME, PAL.glassDark, g, 0, 0.9, cabZ); d.scale.set(0.84, roofH, cabL / 2);
      const r = mesh(DOME, body, g, 0, 0.95, cabZ); r.scale.set(0.74, roofH * 0.96, cabL / 2 - 0.2);
      TB(0.06, 0.4, 1.0, PAL.plaster, 0, 1.3, cabZ, g, 0.02);         // toit ouvrant en toile
      for (const x of [-0.62, 0.62]) ball(0.17, LIGHT, g, x, 1.0, L / 2 - 0.35, 1, 1, 0.8);
    } else {
      // habitacle couleur carrosserie + vitres peintes qui dépassent (look jouet)
      const wy = 0.9 + roofH * 0.52, wh = roofH * 0.58;
      TB(1.6, roofH, cabL, body, 0, 0.9 + roofH / 2, cabZ, g, 0.22);
      TB(1.63, wh, cabL - 0.55, PAL.glassDark, 0, wy, cabZ, g, 0.06);                            // vitres latérales
      TB(1.3, wh, cabL + 0.03, PAL.glassDark, 0, wy, cabZ, g, 0.06);                               // pare-brise + lunette
      TB(1.645, wh + 0.02, 0.14, body, 0, wy, cabZ + (v === 2 ? 0.25 : 0), g, 0.02);              // montant central
      for (const x of [-0.6, 0.6]) ball(0.13, LIGHT, g, x, 0.74, L / 2 - 0.03, 1, 0.9, 0.45);
    }
    for (const z of [-L / 2, L / 2]) TB(1.86, 0.2, 0.22, PAL.slateDark, 0, 0.42, z, g, 0.08);
    for (const x of [-0.62, 0.62]) TB(0.28, 0.12, 0.05, TAIL, x, 0.78, -L / 2, g, 0.02);
    for (const z of [-L / 2 - 0.11, L / 2 + 0.11]) TB(0.42, 0.11, 0.03, PAL.white, 0, 0.47, z, g, 0.01);
    TB(0.9, 0.12, 0.05, PAL.black, 0, 0.7, L / 2 + 0.005, g, 0.02);  // calandre
    for (const x of [-0.84, 0.84]) for (const z of [-wz, wz]) wheel(null, g, x, 0.36, z, 0.36, 0.26, PAL.steel, false);
    if (deco) deco(g, { L, cabL, cabZ, roofH });
    return g;
  }
  const civilTpl = {};
  /** Modèle de voiture civile (variante i entière, i % 40 : 4 formes × 10 couleurs). Origine au sol, avant vers +z,
      ~4,2 m. Statique (déjà fusionné) ; géométries et matériaux partagés entre les appels. */
  Cars.civilModel = i => {
    const n = SHAPES * CIVIL_COLS.length, k = ((Math.floor(i) % n) + n) % n;
    if (!civilTpl[k]) civilTpl[k] = ML.Bake.bake(civilBody(k % SHAPES, CIVIL_COLS[Math.floor(k / SHAPES)]));
    return civilTpl[k].clone();
  };

  /* ---------- Gendarmerie ---------- */
  let gendTex;
  const POL_ON = S.toon(PAL.water, PAL.shutterBlue), POL_OFF = S.toon(PAL.waterDeep);
  function policeModel() {
    if (!gendTex) gendTex = S.toon(PAL.white, 0, { map: S.signTex('GENDARMERIE', null, S.hex(PAL.white), S.hex(PAL.lebecBlue)), key: 'gendarmerie' });
    const lights = [];
    const g = civilBody(0, PAL.lebecBlue, (g, d) => {
      for (const sx of [-1, 1]) {
        TB(0.04, 0.24, d.L - 0.9, PAL.white, sx * 0.9, 0.7, 0, g, 0.01);                       // bande blanche
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), gendTex); p.position.set(sx * 0.93, 0.7, 0); p.rotation.y = sx * Math.PI / 2; g.add(p);
      }
      const pr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.33), gendTex); pr.position.set(0, 0.97, d.L / 2 - 0.62); pr.rotation.x = -Math.PI / 2 + 0.12; g.add(pr);   // sur le capot
      TB(1.5, 0.1, d.cabL - 0.4, PAL.white, 0, 0.93 + d.roofH, d.cabZ, g, 0.04);             // toit blanc
      const y = 1.1 + d.roofH;
      TB(1.2, 0.1, 0.34, PAL.black, 0, y, d.cabZ, g, 0.03);                                       // rampe de gyrophares
      for (const sx of [-1, 1]) { const l = TB(0.46, 0.18, 0.3, POL_OFF, sx * 0.3, y + 0.13, d.cabZ, g, 0.07); l.userData.keep = true; l.castShadow = false; lights.push(l); }
    });
    const out = new THREE.Group(); out.rotation.order = 'YXZ'; out.add(ML.Bake.bake(g)); out.userData.lights = lights;
    return out;
  }

  /* ---------- Véhicules spéciaux de la circulation : tracteur (4) et camping-car (5) ---------- */
  function tractorBody() {
    const g = new THREE.Group(), G = PAL.shutterGreen;
    TB(1.1, 0.85, 1.9, G, 0, 1.2, 0.85, g, 0.16);                                         // capot
    TB(0.92, 0.5, 0.06, PAL.black, 0, 1.15, 1.81, g, 0.02);                                // calandre
    for (const x of [-0.38, 0.38]) ball(0.11, LIGHT, g, x, 1.45, 1.8, 1, 1, 0.5);
    cyl(0.07, 0.07, 1.2, PAL.black, g, 0.38, 2.15, 1.25, 6);                                  // pot d'échappement
    TB(1.7, 0.45, 1.5, G, 0, 1.25, -0.55, g, 0.1);                                         // ailes / plancher de cabine
    for (const x of [-0.7, 0.7]) for (const z of [-1.2, 0.12]) TB(0.08, 1.4, 0.08, PAL.black, x, 2.15, z, g, 0.02);   // arceaux
    TB(1.65, 0.1, 1.55, PAL.white, 0, 2.9, -0.55, g, 0.04);                                // toit
    glass(1.3, 1.0, g, 0, 2.2, 0.13, 0);
    TB(0.5, 0.12, 0.45, PAL.black, 0, 1.6, -0.75, g, 0.04); TB(0.5, 0.5, 0.1, PAL.black, 0, 1.9, -0.98, g, 0.04);   // siège
    ball(0.12, PAL.orange, g, 0, 3.02, -0.55);                                              // gyrophare
    for (const s of [-1, 1]) { wheel(null, g, s * 0.98, 0.8, -0.55, 0.8, 0.5, PAL.orange, false); wheel(null, g, s * 0.68, 0.45, 1.3, 0.45, 0.3, PAL.orange, false); }
    // remorque de foin (rigide : c'est un jouet)
    TB(0.16, 0.14, 1.3, PAL.slateDark, 0, 0.6, -1.95, g, 0.03);
    TB(2.0, 0.16, 3.8, PAL.wood, 0, 0.92, -4.3, g, 0.03);
    for (const x of [-0.98, 0.98]) TB(0.08, 0.35, 3.8, PAL.woodDark, x, 1.15, -4.3, g, 0.02);
    for (const [x, y, z] of [[-0.48, 1.4, -3.3], [0.48, 1.4, -3.3], [-0.48, 1.4, -4.5], [0.48, 1.4, -4.5], [0, 2.0, -3.9], [-0.48, 1.4, -5.6], [0.48, 1.4, -5.6]]) TB(0.92, 0.6, 1.1, PAL.sand, x, y, z, g, 0.12);
    for (const s of [-1, 1]) wheel(null, g, s * 1.08, 0.45, -4.3, 0.45, 0.3, PAL.steel, false);
    for (const x of [-0.7, 0.7]) TB(0.25, 0.12, 0.05, TAIL, x, 0.85, -6.22, g, 0.02);
    TB(0.6, 0.6, 0.04, PAL.orange, 0, 1.5, -6.23, g, 0.03);                                // triangle « véhicule lent »
    return g;
  }
  function campingBody() {
    const g = new THREE.Group(), W = PAL.white;
    TB(2.0, 1.0, 1.4, W, 0, 0.95, 2.35, g, 0.3);                                            // nez du porteur
    TB(1.8, 0.62, 0.08, PAL.glassDark, 0, 1.75, 2.0, g, 0.03).rotation.x = -0.3;            // pare-brise
    TB(2.3, 2.3, 5.0, W, 0, 1.85, -0.65, g, 0.22);                                         // cellule
    TB(2.2, 0.75, 1.3, W, 0, 2.62, 1.95, g, 0.3);                                          // capucine
    TB(2.33, 0.2, 4.9, PAL.woodDark, 0, 1.55, -0.65, g, 0.02); TB(2.33, 0.08, 4.9, PAL.orange, 0, 1.35, -0.65, g, 0.02);   // bandes déco « années 90 »
    for (const z of [-0.1, -2.0]) TB(2.35, 0.55, 0.95, PAL.glassDark, 0, 2.2, z, g, 0.05);   // fenêtres
    TB(1.6, 0.5, 0.06, PAL.glassDark, 0, 2.3, -3.16, g, 0.04);
    TB(0.05, 1.6, 0.7, PAL.plaster, 1.16, 1.4, -1.05, g, 0.02);                              // porte
    ball(0.38, W, g, 0.4, 3.12, -1.6, 1, 0.3, 1);                                            // parabole (pour la météo marine)
    TB(1.1, 0.3, 0.8, PAL.slate, -0.4, 3.12, -2.3, g, 0.08);                                // coffre de toit
    for (const x of [-0.65, 0.65]) { ball(0.14, LIGHT, g, x, 0.95, 3.03, 1, 1, 0.5); TB(0.25, 0.4, 0.05, TAIL, x * 1.3, 1.0, -3.17, g, 0.02); }
    TB(2.05, 0.22, 0.24, PAL.slateDark, 0, 0.45, 3.05, g, 0.08); TB(2.3, 0.22, 0.24, PAL.slateDark, 0, 0.45, -3.2, g, 0.08);
    // vélos sur le porte-vélos arrière
    const ring = new THREE.TorusGeometry(0.32, 0.04, 6, 14);
    for (const [x, c] of [[-0.45, PAL.red], [0.45, PAL.shutterBlue]]) {
      for (const z of [-3.38, -3.5]) { const r = new THREE.Mesh(ring, S.toon(PAL.black)); r.position.set(x + (z < -3.4 ? 0.5 : -0.5) * 0.9, 1.3, z); g.add(r); }
      TB(0.9, 0.05, 0.05, c, x, 1.45, -3.44, g, 0.01);
    }
    for (const s of [-1, 1]) for (const z of [2.2, -2.2]) wheel(null, g, s * 0.98, 0.42, z, 0.42, 0.3, PAL.steel, false);
    return g;
  }
  const specTpl = {};
  /** Modèle spécial de la circulation : 4 = tracteur + remorque de foin, 5 = camping-car */
  Cars.specialModel = m => { if (!specTpl[m]) specTpl[m] = ML.Bake.bake(m === 4 ? tractorBody() : campingBody()); return specTpl[m].clone(); };
  const EXTS = { 4: [1.9, 6.6], 5: [3.3, 3.3] };

  /* ---------- Circulation & gendarmerie (rendu des données de l'hôte) ----------
     Format reçu (10 Hz) : tr = [[x, z, cap, forme, vitesse], …]. On garde les derniers échantillons
     et on dessine ~120 ms dans le passé, par interpolation d'Hermite (position + vitesse le long du cap) :
     les voitures suivent la courbe des carrefours sans à-coups. */
  function trafficCar(i, m) {
    const t = new THREE.Group(); t.rotation.order = 'YXZ'; t.userData.t = new THREE.Vector3(); t.userData.h = 0; t.userData.i = i; t.userData.buf = [];
    setShape(t, m); ML.scene.add(t); return t;
  }
  function setShape(t, m) {
    m = m | 0; if (m < 0 || m > 5) m = ((m % SHAPES) + SHAPES) % SHAPES;
    if (t.userData.m === m) return; t.userData.m = m;
    if (t.userData.body) t.remove(t.userData.body);
    t.userData.body = m >= SHAPES ? Cars.specialModel(m) : Cars.civilModel(m + SHAPES * (t.userData.i % CIVIL_COLS.length)); t.add(t.userData.body);
    t.userData.ext = EXTS[m] || [2.2, 2.2];
  }
  /** Cercles de collision de la circulation (véhicules longs = plusieurs cercles) + gendarmerie */
  Cars.trafficPts = () => {
    const out = [];
    for (const t of Cars.traffic) if (t.visible) {
      const e = t.userData.ext || [2.2, 2.2], f = Cars.fwd(t.rotation.y), L = e[0] + e[1], n = Math.max(2, Math.ceil(L / 2.4));
      for (let k = 0; k < n; k++) { const o = e[0] - 1.1 - k * (L - 2.2) / (n - 1); out.push({ x: t.position.x + f.x * o, z: t.position.z + f.z * o, r: 1.15 }); }
    }
    const P = Cars.police; if (P && P.visible) { const f = Cars.fwd(P.rotation.y); for (const o of [1.2, -1.2]) out.push({ x: P.position.x + f.x * o, z: P.position.z + f.z * o, r: 1.1 }); }
    return out;
  };
  const DELAY = 120;
  Cars.updateTraffic = (list, pol) => {
    list = list || [];
    const now = performance.now();
    while (Cars.traffic.length < list.length) { const i = Cars.traffic.length; Cars.traffic.push(trafficCar(i, list[i] && list[i][3] !== undefined ? list[i][3] : i)); }
    Cars.traffic.forEach((t, i) => {
      const d = list[i], u = t.userData; t.visible = !!d;
      if (!d) { u.buf.length = 0; u.seen = false; return; }
      if (d[3] !== undefined) setShape(t, d[3]);
      const b = u.buf, last = b[b.length - 1];
      if (last && Math.hypot(last.x - d[0], last.z - d[1]) > 30) b.length = 0;            // réapparition : pas d'interpolation
      if (last && now - last.t < 1) b.pop();                                              // plusieurs instantanés dans la même milliseconde (avance rapide)
      b.push({ t: now, x: d[0], z: d[1], h: d[2], v: d[4] || 0 }); if (b.length > 5) b.shift();
      u.t.set(d[0], 0, d[1]); u.h = d[2];
      if (!u.seen) { t.position.set(d[0], ground(u, d[0], d[1], d[2], 1.5, 0.85, 1), d[1]); t.rotation.y = d[2]; u.seen = true; }
    });
    if (!Cars.police) {
      const g = policeModel(); Cars.polBlue = g.userData.lights[0]; Cars.polRed = g.userData.lights[1];
      Cars.police = g; ML.scene.add(g); g.visible = false; g.userData.t = new THREE.Vector3();
    }
    const P = Cars.police;
    if (pol) { if (!P.visible) P.position.set(pol[0], H(pol[0], pol[1]), pol[1]); P.visible = true; P.userData.t.set(pol[0], 0, pol[1]); P.userData.h = pol[2]; }
    else P.visible = false;
  };
  /** Position interpolée d'une voiture de la circulation à l'instant rt (ms) */
  function sampleAt(b, rt) {
    const n = b.length; if (!n) return null;
    if (rt <= b[0].t) return { x: b[0].x, z: b[0].z, h: b[0].h };
    const L = b[n - 1];
    if (rt >= L.t) { const e = Math.min(0.25, (rt - L.t) / 1000); return { x: L.x + Math.sin(L.h) * L.v * e, z: L.z + Math.cos(L.h) * L.v * e, h: L.h }; }
    let i = 0; while (i < n - 2 && b[i + 1].t <= rt) i++;
    const a = b[i], c = b[i + 1], T = (c.t - a.t) / 1000, s = (rt - a.t) / Math.max(1, c.t - a.t);
    const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const ma = a.v * T, mc = c.v * T;
    return { x: h00 * a.x + h10 * Math.sin(a.h) * ma + h01 * c.x + h11 * Math.sin(c.h) * mc, z: h00 * a.z + h10 * Math.cos(a.h) * ma + h01 * c.z + h11 * Math.cos(c.h) * mc, h: U.lerpAngle(a.h, c.h, s) };
  }
  Cars.renderTraffic = dt => {
    Cars.leanHUDTick();
    const k = Math.min(1, dt * 8), now = performance.now(), rt = now - DELAY;
    const cam = ML.camera && ML.camera.position;
    for (const t of Cars.traffic) if (t.visible) {
      const u = t.userData, p = sampleAt(u.buf, rt);
      if (p) {
        const ox = t.position.x, oz = t.position.z, oh = t.rotation.y;
        t.position.x = p.x; t.position.z = p.z; t.rotation.y = p.h;
        // petit roulis dans les virages
        const id = 1 / Math.max(dt, 1e-3), lat = angD(p.h, oh) * id * Math.hypot(p.x - ox, p.z - oz) * id;
        u.roll = U.lerp(u.roll || 0, U.clamp(lat * 0.006, -0.07, 0.07), Math.min(1, dt * 6));
      }
      t.position.y = ground(u, t.position.x, t.position.z, t.rotation.y, u.m === 4 ? 1.2 : u.m === 5 ? 2.2 : 1.5, 0.85, k);
      t.rotation.x = u.tp; t.rotation.z = u.tr + (u.roll || 0);
      if (cam && u.body) u.body.visible = Math.hypot(t.position.x - cam.x, t.position.z - cam.z) < 180;   // trop loin : pas dessinée (t.visible reste la vérité du jeu)
    }
    const P = Cars.police;
    if (P && P.visible) {
      P.position.x = U.lerp(P.position.x, P.userData.t.x, k); P.position.z = U.lerp(P.position.z, P.userData.t.z, k);
      P.rotation.y = U.lerpAngle(P.rotation.y, P.userData.h, k);
      P.position.y = ground(P.userData, P.position.x, P.position.z, P.rotation.y, 1.5, 0.85, k);
      P.rotation.x = P.userData.tp; P.rotation.z = P.userData.tr;
      const ph = Math.floor(performance.now() / 160) % 4, on = ph === 0 || ph === 2;                 // double éclat bleu, alterné gauche / droite
      Cars.polBlue.material = on && ph === 0 ? POL_ON : POL_OFF; Cars.polRed.material = on && ph === 2 ? POL_ON : POL_OFF;
      if (Math.floor(performance.now() / 700) % 2 && !Cars._sir) { Cars._sir = true; ML.Sfx.at('siren', P.position.x, P.position.z); } else if (!(Math.floor(performance.now() / 700) % 2)) Cars._sir = false;
    }
  };
  /** Voiture de gendarmerie garée devant la brigade (décor) */
  Cars.parkPolice = () => {
    const L = ML.LOC.comp.police; if (!L) return;
    const g = policeModel(), x = L.dock.x + L.tan.x * 4, z = L.dock.z + L.tan.z * 4, h = Math.atan2(L.tan.x, L.tan.z);
    g.position.set(x, ground(g.userData, x, z, h, 1.5, 0.85, 1), z); g.rotation.y = h; g.rotation.x = g.userData.tp; g.rotation.z = g.userData.tr;
    ML.scene.add(g); Cars.parkedPolice = g;
  };

  /** Caméra du conducteur : vue conduite ou extérieure (V). Les hauteurs incluent le relief. */
  Cars.camera = (c, mode, look) => {
    const cam = ML.camera, f = Cars.fwd(c.h), l = Cars.left(c.h), tp = c.kind === 'tp', gy = H(c.pos.x, c.pos.z), pitch = -(c.tp || 0);
    if (mode === 'cab' && c.kind === 'camion') { cam.position.set(c.pos.x + f.x * 2.9 + l.x * 0.55, gy + 2.75, c.pos.z + f.z * 2.9 + l.z * 0.55); cam.rotation.set(look.p - 0.08 + pitch, c.h + Math.PI + look.y, 0, 'YXZ'); return; }
    if (mode === 'cab' && c.kind === 'fenwick') { cam.position.set(c.pos.x - f.x * 0.3, gy + 2.15, c.pos.z - f.z * 0.3); cam.rotation.set(look.p - 0.2 + pitch, c.h + Math.PI + look.y, 0, 'YXZ'); return; }
    if (mode === 'cab' && !tp) {
      cam.position.set(c.pos.x + f.x * 0.15 + l.x * 0.38, gy + 1.55, c.pos.z + f.z * 0.15 + l.z * 0.38);
      cam.rotation.set(look.p + pitch, c.h + Math.PI + look.y, -c.group.rotation.z, 'YXZ');
    } else if (tp && mode === 'cab') {
      cam.position.set(c.pos.x + f.x * 1.6, gy + 1.65, c.pos.z + f.z * 1.6);
      cam.rotation.set(look.p - 0.25 - pitch, c.h + look.y, 0, 'YXZ');
    } else {
      const a = c.h + look.y, dist = tp ? 5 : c.kind === 'camion' ? 13 : c.kind === 'fenwick' ? 6.5 : 8;
      const cx = c.pos.x - Math.sin(a) * dist, cz = c.pos.z - Math.cos(a) * dist;
      cam.position.set(cx, Math.max(gy, H(cx, cz)) + (tp ? 3 : 3.8) - look.p * 3, cz);
      cam.lookAt(c.pos.x, gy + 1.2, c.pos.z);
    }
  };
})();
