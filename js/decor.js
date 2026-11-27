/* =====================================================================
   decor.js — DÉTAILS GRAPHIQUES (V4.3), style « cubique » d'indé :
   - un « lot » (Batch) qui fusionne des milliers de petits blocs colorés
     en quelques gros maillages (par zones de 64 m) : beaucoup de détails,
     très peu d'appels de dessin, donc ça reste fluide ;
   - l'atelier (dedans et dehors), les machines, les entreprises ;
   - 3 nouveaux types d'immeubles (maisons, boutiques aux noms rigolos,
     immeubles à balcons) mélangés aux modèles KayKit ;
   - passages piétons, bancs, abribus, sapins, fleurs, touffes d'herbe ;
   - fenêtres qui s'allument le soir.
   Rien ici ne touche au jeu (sauf quelques collisions de meubles).
   ===================================================================== */
(function () {
  const D = ML.Decor = {};
  const U = ML.U;
  let B = null, root = null, rng = null;

  /* ---------- Formes de base (géométries unitaires, non indexées) ---------- */
  const UNIT = {};
  function prep(name, geo) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position.array;
    // on s'assure que chaque triangle « regarde » vers l'extérieur (formes convexes centrées)
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5], cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * (ax + bx + cx) + ny * (ay + by + cy) + nz * (az + bz + cz) < 0) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    }
    g.computeVertexNormals();
    UNIT[name] = { p, n: g.attributes.normal.array };
  }
  function prismGeo() {                                                  // toit à 2 pentes : faîtage le long de x
    const L = x => [x, -0.5, -0.5], R = x => [x, -0.5, 0.5], T = x => [x, 0.5, 0];
    const tri = [], q = (a, b, c, d) => tri.push(a, b, c, a, c, d);
    tri.push(R(0.5), L(0.5), T(0.5), L(-0.5), R(-0.5), T(-0.5));
    q(L(-0.5), L(0.5), T(0.5), T(-0.5)); q(R(0.5), R(-0.5), T(-0.5), T(0.5)); q(L(-0.5), R(-0.5), R(0.5), L(0.5));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); return g;
  }
  function init() {
    if (UNIT.box) return;
    prep('box', new THREE.BoxGeometry(1, 1, 1));
    prep('cyl', new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    prep('cone', new THREE.CylinderGeometry(0, 0.5, 1, 7));
    const pyr = new THREE.CylinderGeometry(0, 0.5, 1, 4); pyr.rotateY(Math.PI / 4); pyr.scale(Math.SQRT2, 1, Math.SQRT2); prep('pyr', pyr);
    prep('prism', prismGeo());
    prep('ball', new THREE.IcosahedronGeometry(0.5, 0));
  }

  /* ---------- Le lot : des milliers de blocs → quelques maillages ---------- */
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function Batch() { this.chunks = {}; }
  Batch.prototype.add = function (shape, w, h, d, x, y, z, color, o) {
    o = o || {};
    const key = (o.glass ? 'g' : 's') + Math.floor(x / 64) + ',' + Math.floor(z / 64);
    const ch = this.chunks[key] || (this.chunks[key] = { glass: !!o.glass, p: [], n: [], c: [] });
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _s.set(w, h, d));
    const U2 = UNIT[shape], P = U2.p, N = U2.n, e = _m.elements;
    _c.setHex(color); if (o.jit) _c.offsetHSL(0, 0, (rng() - 0.5) * o.jit);
    for (let i = 0; i < P.length; i += 3) {
      const px = P[i], py = P[i + 1], pz = P[i + 2];
      ch.p.push(e[0] * px + e[4] * py + e[8] * pz + e[12], e[1] * px + e[5] * py + e[9] * pz + e[13], e[2] * px + e[6] * py + e[10] * pz + e[14]);
      // normale : rotation de (n / échelle), puis normalisation
      _v.set(N[i] / w, N[i + 1] / h, N[i + 2] / d).applyQuaternion(_q).normalize();
      ch.n.push(_v.x, _v.y, _v.z); ch.c.push(_c.r, _c.g, _c.b);
    }
  };
  Batch.prototype.build = function (parent) {
    D.solidMat = D.solidMat || new THREE.MeshLambertMaterial({ vertexColors: true });
    D.glassMat = D.glassMat || new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
    for (const k in this.chunks) {
      const ch = this.chunks[k], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ch.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(ch.c, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, ch.glass ? D.glassMat : D.solidMat);
      m.castShadow = !ch.glass; m.receiveShadow = true; parent.add(m);
    }
    this.chunks = {};
  };

  /* ---------- Raccourcis (coordonnées monde) ---------- */
  const box = (w, h, d, x, y, z, col, o) => B.add('box', w, h, d, x, y, z, col, o);
  const cyl = (r, h, x, y, z, col, o) => B.add('cyl', r * 2, h, r * 2, x, y, z, col, o);
  const glass = (w, h, d, x, y, z, col, o) => B.add('box', w, h, d, x, y, z, col || 0xbfe3ff, Object.assign({ glass: true }, o || {}));
  /** Repère local (bâtiment tourné de rot × 90°) : local (x, z) → monde */
  function frame(cx, cz, rot) {
    const a = rot * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const L = (x, z) => ({ x: cx + x * ca + z * sa, z: cz - x * sa + z * ca });
    return {
      a, L,
      box: (w, h, d, x, y, z, col, o) => { const p = L(x, z); B.add('box', w, h, d, p.x, y, p.z, col, Object.assign({}, o, { ry: a + ((o && o.ry) || 0) })); },
      sh: (shape, w, h, d, x, y, z, col, o) => { const p = L(x, z); B.add(shape, w, h, d, p.x, y, p.z, col, Object.assign({}, o, { ry: a + ((o && o.ry) || 0) })); },
      glass: (w, h, d, x, y, z, col, o) => { const p = L(x, z); B.add('box', w, h, d, p.x, y, p.z, col || 0xbfe3ff, Object.assign({ glass: true }, o, { ry: a + ((o && o.ry) || 0) })); },
      col: (x, z, w, d) => { const p = L(x, z), sw = rot % 2 ? d : w, sd = rot % 2 ? w : d; U.boxCollider(p.x, p.z, sw, sd, 'decor'); }
    };
  }
  /** Panneau / affiche dessiné (texte) : une plaque avec une texture */
  function sign(text, sub, bg, fg, w, h, x, y, z, ry, opt) {
    opt = opt || {};
    const c = document.createElement('canvas'), k = Math.min(4, w / h); c.width = 512; c.height = Math.round(512 / k); const x2 = c.getContext('2d');
    x2.fillStyle = bg; x2.fillRect(0, 0, c.width, c.height);
    if (opt.border) { x2.strokeStyle = opt.border; x2.lineWidth = 10; x2.strokeRect(5, 5, c.width - 10, c.height - 10); }
    if (opt.stripes) { x2.fillStyle = '#111'; for (let i = -c.height; i < c.width; i += 40) { x2.beginPath(); x2.moveTo(i, c.height); x2.lineTo(i + 20, c.height); x2.lineTo(i + 20 + c.height * 0.3, c.height * 0.85); x2.lineTo(i + c.height * 0.3, c.height * 0.85); x2.fill(); } }
    x2.fillStyle = fg; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    const lines = String(text).split('\n'); let fs = Math.min(c.height * (sub ? 0.42 : 0.6) / lines.length, 90);
    x2.font = `bold ${fs}px Arial`; while (lines.some(l => x2.measureText(l).width > c.width - 40) && fs > 12) { fs -= 2; x2.font = `bold ${fs}px Arial`; }
    lines.forEach((l, i) => x2.fillText(l, c.width / 2, (sub ? c.height * 0.4 : c.height / 2) + (i - (lines.length - 1) / 2) * fs * 1.1));
    if (sub) { x2.font = `${Math.round(fs * 0.5)}px Arial`; x2.globalAlpha = 0.85; x2.fillText(sub, c.width / 2, c.height * 0.78); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t, emissive: opt.glow ? 0x222222 : 0x000000, emissiveMap: opt.glow ? t : null }));
    m.position.set(x, y, z); m.rotation.y = ry || 0; root.add(m); return m;
  }
  D.sign = (...a) => sign(...a);
  D.frame = (cx, cz, rot) => frame(cx, cz, rot);                       // V5 : intérieurs (world.js)

  /** V6 : affiche dessinée à la main (canvas) */
  function poster(w, h, x, y, z, ry, draw, opt) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d');
    draw(g, c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t, emissive: opt && opt.glow ? 0x222222 : 0, emissiveMap: opt && opt.glow ? t : null }));
    m.position.set(x, y, z); m.rotation.y = ry || 0; root.add(m);
    // petit cadre / punaises
    return m;
  }
  const txt = (g, t, x, y, f, col, al) => { g.font = f; g.fillStyle = col; g.textAlign = al || 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  /** V6 : atelier plus « fini » : bureau vitré, îlots signalés, vestiaires, affiches, liseré d'allée */
  D.atelierV6 = (P, ext) => {
    // ---------- BUREAU VITRÉ (chef + méthodes) : coin arrière droit ----------
    const OZ = -5.4, X0 = 10.8, X1 = 19.8, ZB = -13.75, D0 = 10.8, D1 = 12.8;
    const part = (x0, z0, x1, z1) => {
      const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = ax ? Math.abs(x1 - x0) : Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const S = (a, b) => (ax ? [len, a, b] : [b, a, len]);
      box(...S(1.0, 0.1), cx, 0.5, cz, 0x50657a);                                   // allège pleine
      glass(...S(1.5, 0.03), cx, 1.78, cz, 0xd6ecff);                              // vitrage
      box(...S(0.07, 0.12), cx, 2.57, cz, 0xc8cdd2); box(...S(0.05, 0.13), cx, 1.03, cz, 0xc8cdd2);
      const n = Math.max(1, Math.round(len / 1.5)); for (let i = 0; i <= n; i++) box(0.08, 2.6, 0.08, x0 + (x1 - x0) * i / n, 1.3, z0 + (z1 - z0) * i / n, 0xc8cdd2);
      // bande adhésive anti-collision sur la vitre
      box(...S(0.06, 0.035), cx, 1.55, cz, 0x2c3e50);
      U.boxCollider(cx, cz, ax ? len : 0.22, ax ? 0.22 : len, 'cloison');
    };
    part(D1, OZ, X1, OZ); part(X0, ZB, X0, OZ - 0.05);
    box(D1 - D0, 0.42, 0.12, (D0 + D1) / 2, 2.39, OZ, 0xc8cdd2);                    // imposte au-dessus de la porte
    box(0.05, 2.15, 0.95, D1 - 0.08, 1.08, OZ - 0.5, 0xc8cdd2); glass(0.02, 1.4, 0.7, D1 - 0.08, 1.35, OZ - 0.5, 0xd6ecff);   // porte (ouverte)
    box(0.04, 0.04, 0.16, D1 - 0.12, 1.05, OZ - 0.9, 0x7f8c8d);
    sign('BUREAU', 'F. Lebec · méthodes · planning', '#1a2340', '#ffd257', 1.9, 0.38, (D0 + D1) / 2, 2.39, OZ + 0.07, 0, {});
    sign('FRAPPEZ\nAVANT D\'ENTRER', '(ou pas, c\'est ouvert)', '#ffffff', '#2c3e50', 0.62, 0.42, D1 + 0.55, 1.55, OZ + 0.03, 0, { border: '#2c3e50' });
    box(X1 - X0, 0.012, -ZB + OZ, (X0 + X1) / 2, 0.036, (OZ + ZB) / 2, 0x8193a6);   // lino du bureau
    // poste de travail du chef : écran, clavier, lampe, mug, dossiers, téléphone
    box(0.62, 0.4, 0.04, 12.25, 1.13, -7.72, 0x1e1e1e); box(0.56, 0.34, 0.01, 12.25, 1.13, -7.745, 0x2e86de);
    box(0.06, 0.18, 0.06, 12.25, 0.88, -7.7, 0x2c3e50); box(0.25, 0.02, 0.18, 12.25, 0.81, -7.7, 0x2c3e50);
    box(0.48, 0.02, 0.15, 12.15, 0.81, -8.25, 0x34495e); box(0.07, 0.02, 0.1, 12.6, 0.81, -8.25, 0x34495e);
    cyl(0.045, 0.1, 11.3, 0.86, -8.2, 0xffffff); cyl(0.05, 0.02, 11.3, 0.91, -8.2, 0x4e342e);
    for (let i = 0; i < 4; i++) box(0.3, 0.04, 0.22, 13.0, 0.82 + i * 0.045, -8.0, [0xe74c3c, 0x2980b9, 0xf1c40f, 0x27ae60][i], { ry: (i - 1.5) * 0.08 });
    box(0.2, 0.06, 0.16, 11.25, 0.83, -7.75, 0x111111); cyl(0.02, 0.4, 13.0, 1.0, -7.6, 0x7f8c8d, { rz: 0.4 }); box(0.16, 0.08, 0.16, 12.9, 1.2, -7.6, 0x111111);
    // fauteuil visiteur
    box(0.5, 0.08, 0.5, 14.2, 0.46, -6.6, 0x2c3e50); box(0.5, 0.55, 0.08, 14.2, 0.78, -6.36, 0x2c3e50); for (const dx of [-0.2, 0.2]) for (const dz of [-0.2, 0.2]) box(0.04, 0.44, 0.04, 14.2 + dx, 0.22, -6.6 + dz, 0x7f8c8d);
    // classeurs (étagère contre la cloison)
    box(0.42, 2.0, 2.6, 11.12, 1.0, -11.8, 0x95a5a6);
    for (let y = 0.25; y < 2; y += 0.48) { box(0.4, 0.03, 2.55, 11.13, y - 0.18, -11.8, 0x7f8c8d); for (let i = 0; i < 9; i++) box(0.3, 0.36, 0.08, 11.13, y + 0.02, -12.95 + i * 0.27 + (rng() - 0.5) * 0.03, [0xe74c3c, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1][Math.floor(rng() * 6)], { rz: (rng() - 0.5) * 0.1 }); }
    U.boxCollider(11.12, -11.8, 0.45, 2.6, 'classeurs');
    // table de réunion ronde + 3 chaises
    cyl(0.65, 0.05, 17.4, 0.76, -9.4, 0xecf0f1); cyl(0.06, 0.74, 17.4, 0.38, -9.4, 0x7f8c8d); cyl(0.3, 0.03, 17.4, 0.02, -9.4, 0x7f8c8d);
    for (const a of [0.4, 2.5, 4.4]) { const cx = 17.4 + Math.cos(a) * 0.95, cz = -9.4 + Math.sin(a) * 0.95; box(0.44, 0.06, 0.44, cx, 0.46, cz, 0x2e86de, { ry: -a }); box(0.44, 0.48, 0.05, cx + Math.cos(a) * 0.2, 0.72, cz + Math.sin(a) * 0.2, 0x2e86de, { ry: Math.PI / 2 - a }); cyl(0.03, 0.44, cx, 0.22, cz, 0x7f8c8d); }
    U.boxCollider(17.4, -9.4, 1.3, 1.3, 'table');
    box(0.5, 0.03, 0.35, 17.2, 0.8, -9.3, 0xffffff, { ry: 0.3 }); cyl(0.04, 0.09, 17.7, 0.83, -9.6, 0xc0392b);
    // porte-manteau + corbeille
    cyl(0.025, 1.8, 19.2, 0.9, -6.1, 0x4e342e); cyl(0.2, 0.03, 19.2, 0.02, -6.1, 0x4e342e); for (const a of [0, 2.1, 4.2]) box(0.25, 0.03, 0.03, 19.2 + Math.cos(a) * 0.1, 1.72, -6.1 + Math.sin(a) * 0.1, 0x4e342e, { ry: -a });
    box(0.5, 0.9, 0.25, 19.15, 1.25, -6.05, 0x1e5799);                              // bleu de travail accroché
    cyl(0.18, 0.35, 13.6, 0.18, -9.2, 0x7f8c8d);
    // tableau de bord (indicateurs) sur le mur de droite
    poster(2.0, 1.3, 19.72, 1.9, -9.2, -Math.PI / 2, (g, W, H) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#2c3e50'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
      txt(g, 'INDICATEURS ATELIER', W / 2, 34, 'bold 30px Arial', '#2c3e50');
      const bars = [['OTD', 0.98, '#27ae60'], ['TRS', 0.71, '#f39c12'], ['Rebut', 0.12, '#e74c3c'], ['Café', 1.0, '#6d4c41']];
      bars.forEach(([n, v, c], i) => { const x = 60 + i * 110, y0 = H - 50; g.fillStyle = '#ecf0f1'; g.fillRect(x, 70, 60, y0 - 70); g.fillStyle = c; g.fillRect(x, y0 - (y0 - 70) * v, 60, (y0 - 70) * v); txt(g, n, x + 30, y0 + 22, 'bold 20px Arial', '#2c3e50'); txt(g, Math.round(v * 100) + ' %', x + 30, y0 - (y0 - 70) * v - 14, 'bold 16px Arial', '#2c3e50'); });
      txt(g, '(OTD arrondi par F. Lebec)', W / 2, 62, 'italic 15px Arial', '#7f8c8d');
    });
    // ---------- ÎLOTS : panneaux suspendus double face ----------
    const hang = (t, sub, bg, x, z, w) => { for (const r of [0, Math.PI]) sign(t, sub, bg, '#fff', w || 3.6, 0.7, x, 4.85, z + (r ? -0.02 : 0.02), r, { border: '#fff' }); for (const dx of [-1.4, 1.4]) cyl(0.012, 1.6, x + dx * (w || 3.6) / 3.6, 6.0, z, 0x222222); };
    hang('ÎLOT TOURNAGE', 'T1 · T2 · T3', '#1f4e9a', -4, -6);
    hang('ÎLOT FRAISAGE', 'F1 · F2 · F3', '#1e7d4a', -4, 4);
    hang('STOCK BRUTS', 'acier · alu · inox', '#7f6000', -12, -11.6, 3.2);
    hang('EXPÉDITION', 'contrôle au marbre avant !', '#8e44ad', 11.5, 9.4, 3.2);
    // ---------- liseré jaune le long de l'allée centrale ----------
    for (const z of [-3.42, 1.32]) box(ext ? 49 : 36, 0.012, 0.1, ext ? 4.5 : -2, 0.039, z, 0xf1c40f);
    // passages piétons (zébras) vers le bureau et l'expédition
    for (let i = 0; i < 5; i++) { box(0.35, 0.012, 1.4, 11.2 + i * 0.6, 0.04, -4.25, 0xffffff); }
    // ---------- vestiaires (casiers) : mur avant, à gauche de la porte ----------
    for (let i = 0; i < 6; i++) {
      const x = -11.0 + i * 0.47, c = i % 2 ? 0x5d7f9c : 0x4f6f8a;
      box(0.45, 1.85, 0.5, x, 0.95, 13.42, c); box(0.42, 1.8, 0.02, x, 0.95, 13.16, c, { jit: 0.06 });
      for (let k = 0; k < 4; k++) box(0.22, 0.025, 0.01, x, 1.6 + k * 0.06, 13.145, 0x2c3e50);
      box(0.03, 0.12, 0.03, x + 0.15, 1.0, 13.14, 0xbdc3c7); box(0.2, 0.06, 0.005, x, 1.42, 13.143, 0xffffff);
    }
    box(2.9, 0.06, 0.55, -9.83, 1.9, 13.42, 0x3d566e); box(2.6, 0.08, 0.3, -9.83, 0.45, 12.9, 0x8d6e63); for (const dx of [-1.1, 1.1]) box(0.06, 0.4, 0.25, -9.83 + dx, 0.22, 12.9, 0x2c3e50);
    U.boxCollider(-9.83, 13.3, 2.9, 0.8, 'casiers');
    sign('VESTIAIRES', 'un casier = un cadenas', '#3d566e', '#fff', 1.6, 0.35, -9.83, 2.25, 13.7, Math.PI, {});
    // ---------- armoire à pharmacie ----------
    box(0.6, 0.7, 0.18, 9.4, 1.6, 13.62, 0xffffff); box(0.36, 0.1, 0.01, 9.4, 1.6, 13.52, 0x27ae60); box(0.1, 0.36, 0.01, 9.4, 1.6, 13.52, 0x27ae60);
    sign('PREMIERS SECOURS', '', '#27ae60', '#fff', 0.9, 0.22, 9.4, 2.1, 13.71, Math.PI, {});
    // ---------- affiches ----------
    poster(1.6, 1.15, -1.3, 3.3, -13.72, 0, (g, W, H) => {
      g.fillStyle = '#fdfefe'; g.fillRect(0, 0, W, H); g.fillStyle = '#c0392b'; g.fillRect(0, 0, W, 70); txt(g, 'LES 5S', W / 2, 36, 'bold 42px Arial', '#fff');
      ['Trier', 'Ranger', 'Nettoyer', 'Standardiser', 'Respecter (le poly)'].forEach((t, i) => { g.fillStyle = '#c0392b'; g.beginPath(); g.arc(46, 110 + i * 54, 20, 0, 7); g.fill(); txt(g, 'S', 46, 111 + i * 54, 'bold 22px Arial', '#fff'); txt(g, t, 84, 111 + i * 54, 'bold 28px Arial', '#2c3e50', 'left'); });
    });
    poster(1.5, 1.2, -19.72, 3.0, -1.0, Math.PI / 2, (g, W, H) => {
      g.fillStyle = '#f1c40f'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.fillRect(0, 0, W, 64); txt(g, '⚠ AU TOUR', W / 2, 34, 'bold 38px Arial', '#f1c40f');
      ['cheveux attachés', 'pas de gants', 'carter fermé', 'clé retirée du mandrin !'].forEach((t, i) => txt(g, '• ' + t, 30, 110 + i * 60, 'bold 30px Arial', '#111', 'left'));
    });
    poster(0.8, 1.1, 19.72, 2.5, 3.9, -Math.PI / 2, (g, W, H) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#c0392b'; g.fillRect(0, 0, W, 90); txt(g, 'NOVEMBRE', W / 2, 46, 'bold 52px Arial', '#fff');
      g.strokeStyle = '#bdc3c7'; g.lineWidth = 2; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { g.strokeRect(20 + c * 67, 120 + r * 100, 67, 100); txt(g, String(r * 7 + c + 1 <= 30 ? r * 7 + c + 1 : ''), 40 + c * 67, 140 + r * 100, '20px Arial', '#555'); }
      g.strokeStyle = '#e74c3c'; g.lineWidth = 5; g.beginPath(); g.arc(20 + 4 * 67 + 33, 120 + 3 * 100 + 50, 30, 0, 7); g.stroke();
      txt(g, 'Garage Pasquier', W / 2, H - 40, 'italic 30px Arial', '#7f8c8d');
    });
    // tableau en liège (coin café) : mots du chef
    box(0.04, 1.0, 1.5, -19.74, 2.75, 9.0, 0x8d6e63);
    poster(1.42, 0.92, -19.71, 2.75, 9.0, Math.PI / 2, (g, W, H) => {
      g.fillStyle = '#c8a26a'; g.fillRect(0, 0, W, H); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,60,30,${Math.random() * 0.25})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
      const notes = [['#fff59d', 'Qui a fini\nle café ??'], ['#b3e5fc', 'Pot de départ\nde personne\nvendredi'], ['#f8bbd0', 'NE PAS\ntoucher au T1\n(Amaury)'], ['#c8e6c9', 'Clé à molette\ngéante = pour\nles relous !']];
      notes.forEach(([c, t], i) => { const x = 20 + i * 122, y = 30 + (i % 2) * 40; g.save(); g.translate(x + 50, y + 60); g.rotate((i - 1.5) * 0.06); g.fillStyle = c; g.fillRect(-50, -55, 108, 120); t.split('\n').forEach((l, k) => txt(g, l, 4, -25 + k * 26, 'bold 18px Arial', '#333')); g.fillStyle = '#e74c3c'; g.beginPath(); g.arc(4, -48, 6, 0, 7); g.fill(); g.restore(); });
    });
    // servantes (chariots d'outils) au bout de chaque emplacement machine
    for (const def of ML.MACHINES) {
      if (def.ext && !ext) continue;
      const x = def.x + (def.type === 'tour' ? (def.len + 1.4) / 2 + 0.55 : 2.2), z = def.z + (def.type === 'tour' ? 0.35 : -0.35);
      box(0.55, 0.85, 0.45, x, 0.5, z, 0xc0392b); for (let k = 0; k < 3; k++) box(0.5, 0.02, 0.01, x, 0.35 + k * 0.22, z + 0.226, 0x7f8c8d);
      box(0.6, 0.04, 0.5, x, 0.95, z, 0x2c3e50); for (const dx of [-0.2, 0.2]) for (const dz of [-0.16, 0.16]) cyl(0.04, 0.06, x + dx, 0.04, z + dz, 0x111111);
      U.boxCollider(x, z, 0.6, 0.5, 'servante');
    }
  };
  const stripes = (L, vertical, x, y, z, ax, n, o) => {               // bande jaune / noire (sécurité)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5, col = i % 2 ? 0x111111 : 0xf1c40f;
      if (vertical) box(o.w || 0.25, L / n, o.d || 0.1, x, y + t * L, z, col);
      else if (ax === 'x') box(L / n, o.h || 0.02, o.d || 0.25, x + t * L, y, z, col); else box(o.d || 0.25, o.h || 0.02, L / n, x, y, z + t * L, col);
    }
  };

  D.begin = (seed, r) => { init(); B = new Batch(); root = r; rng = U.rng((seed ^ 0x9e3779b9) >>> 0); };
  D.end = () => { if (B) B.build(root); B = null; };
  D.setNight = k => { if (D.glassMat) D.glassMat.emissive.setHex(k < 0.6 ? 0x6b5426 : 0x000000); };

  /* =====================================================================
     L'ATELIER
     ===================================================================== */
  D.atelier = W => {
    W = W || {}; const P = W.pal || { lane: 0x7f9c8a, dado: 0x2f6f8f, outer: 0x2e8b57, trim: 0xe67e22 }, ext = !!W.ext, up = W.up || {};
    // --- sol : allée centrale, emplacements des machines (bandes de sécurité), flèches ---
    box(36, 0.01, 4.7, -2, 0.032, -1.05, P.lane);
    if (ext) box(13, 0.01, 4.7, 26.5, 0.032, -1.05, P.lane);
    for (let x = -16; x <= (ext ? 30 : 14); x += 6) { box(1.6, 0.012, 0.35, x, 0.037, -1.05, 0xffffff); B.add('pyr', 0.9, 0.012, 0.9, x + 1.1, 0.037, -1.05, 0xffffff, { ry: Math.PI / 4 }); }
    for (const def of ML.MACHINES) {
      if (def.ext && !ext) continue;                                       // extension pas encore construite
      if ((def.id === 'T3' || def.id === 'F3') && !up.agrandissement) continue;   // zone grise « se débloque… » (world.js)
      const w = def.type === 'tour' ? def.len + 1.4 : 3.3, d = def.type === 'tour' ? 2.6 : 3.3, zc = def.z + (def.type === 'tour' ? 0.35 : -0.35);
      stripes(w, false, def.x, 0.036, zc - d / 2, 'x', 10, { d: 0.18 }); stripes(w, false, def.x, 0.036, zc + d / 2, 'x', 10, { d: 0.18 });
      stripes(d, false, def.x - w / 2, 0.036, zc, 'z', 6, { d: 0.18 }); stripes(d, false, def.x + w / 2, 0.036, zc, 'z', 6, { d: 0.18 });
      box(w - 0.3, 0.008, d - 0.3, def.x, 0.033, zc, 0x9aa5ab);
    }
    // --- murs intérieurs : soubassement coloré + liseré jaune ---
    const dado = P.dado;
    box(40, 1.3, 0.06, 0, 0.65, -13.77, dado); box(0.06, 1.3, 28, -19.77, 0.65, 0, dado);
    if (ext) { box(0.06, 1.3, 11.7, 19.77, 0.65, -8.15, dado); box(0.06, 1.3, 9.4, 19.77, 0.65, 9.3, dado); box(0.07, 0.1, 11.7, 19.77, 1.35, -8.15, 0xf1c40f); box(0.07, 0.1, 9.4, 19.77, 1.35, 9.3, 0xf1c40f); }
    else { box(0.06, 1.3, 28, 19.77, 0.65, 0, dado); box(0.07, 0.1, 28, 19.77, 1.35, 0, 0xf1c40f); }
    box(15, 1.3, 0.06, -12.5, 0.65, 13.77, dado); box(15, 1.3, 0.06, 12.5, 0.65, 13.77, dado);
    box(40, 0.1, 0.07, 0, 1.35, -13.77, 0xf1c40f); box(0.07, 0.1, 28, -19.77, 1.35, 0, 0xf1c40f);
    if (W.reno >= 3) for (let x = -18; x <= 18; x += 4) box(0.12, 4.6, 0.04, x, 3.6, -13.74, 0xb08a5a);     // bardage bois au fond (jour 10)
    if (W.reno >= 2) { box(40, 0.06, 0.08, 0, 4.0, -13.75, 0x2ecc71); box(0.08, 0.06, 28, -19.75, 4.0, 0, 0x2ecc71); }   // liseré LED
    // --- fenêtres hautes (dedans + dehors) ---
    for (let x = -16; x <= 16; x += 6.4) { glass(4.4, 1.3, 0.5, x, 5.1, -14, 0xa9d6f5); box(4.6, 0.12, 0.6, x, 4.4, -14, 0xecf0f1); }
    for (let z = -10; z <= 10; z += 5) for (const s of [-1, 1]) { glass(0.5, 1.3, 3.2, 20 * s, 5.1, z, 0xa9d6f5); box(0.6, 0.12, 3.4, 20 * s, 4.4, z, 0xecf0f1); }
    // --- charpente : fermes, pannes, éclairages, tuyaux ---
    for (const z of [-10.5, -3.5, 3.5, 10.5]) {
      box(40, 0.32, 0.22, 0, 6.55, z, 0x41698c);
      for (let x = -17.5; x <= 17.5; x += 5) box(0.12, 0.6, 0.12, x, 6.75, z, 0x41698c, { rz: (x / 5) % 2 ? 0.6 : -0.6 });
    }
    for (const x of [-15, -5, 5, 15]) box(0.18, 0.18, 28, x, 6.86, 0, 0x5d7f9c);
    for (let x = -14; x <= 14; x += 7) for (const z of [-8, 0, 8]) box(2.9, 0.09, 0.5, x, 7.0, z, 0x7f8c8d, { glass: false });
    cyl(0.13, 38, 0, 5.95, -13.45, 0xc0392b, { rz: Math.PI / 2 }); cyl(0.1, 38, 0, 5.6, -13.5, 0x2980b9, { rz: Math.PI / 2 });
    cyl(0.12, 26, -19.45, 5.8, 0, 0x95a5a6, { rx: Math.PI / 2 });
    for (let x = -15; x <= 15; x += 10) box(0.4, 0.4, 0.3, x, 5.95, -13.45, 0x7f8c8d);
    // --- pont roulant jaune (en hauteur, à droite) ---
    for (const z of [-13.2, 13.2]) box(40, 0.25, 0.3, 0, 6.2, z, 0x34495e);
    box(0.6, 0.7, 26.6, 8, 5.9, 0, 0xf1c40f); box(1.2, 0.5, 0.8, 8, 5.9, -13, 0xf39c12); box(1.2, 0.5, 0.8, 8, 5.9, 13, 0xf39c12);
    stripes(26, false, 8.31, 5.9, 0, 'z', 26, { d: 0.02, h: 0.3 });
    box(1, 0.6, 0.9, 8, 5.35, 2, 0x2c3e50); cyl(0.03, 2.2, 8, 4.0, 2, 0x222222); B.add('cyl', 0.3, 0.35, 0.3, 8, 2.8, 2, 0xf1c40f); box(0.08, 0.35, 0.25, 8, 2.5, 2.05, 0xf1c40f);
    // --- établi avec étau + panneau d'outils (mur du fond) ---
    box(3.2, 0.12, 0.9, 7.5, 0.95, -13.1, 0xa0703f); for (const dx of [-1.5, 1.5]) for (const dz of [-0.35, 0.35]) box(0.1, 0.9, 0.1, 7.5 + dx, 0.45, -13.1 + dz, 0x2c3e50);
    box(0.9, 0.6, 0.8, 8.6, 0.55, -13.1, 0xc0392b); box(0.35, 0.28, 0.3, 6.4, 1.15, -13.0, 0x2c5f8f); box(0.12, 0.08, 0.6, 6.4, 1.2, -12.75, 0x95a5a6);
    box(3, 1.4, 0.05, 7.5, 2.1, -13.74, 0xc9a26b);
    [[6.4, 2.4, 0x95a5a6, 0.08, 0.6], [6.8, 2.2, 0xe74c3c, 0.1, 0.45], [7.2, 2.4, 0x7f8c8d, 0.06, 0.7], [7.7, 2.2, 0xf39c12, 0.12, 0.4], [8.1, 2.4, 0x2980b9, 0.07, 0.55], [8.5, 2.1, 0x27ae60, 0.1, 0.35]].forEach(([x, y, c, w, h]) => box(w, h, 0.05, x, y, -13.7, c));
    U.boxCollider(7.5, -13.1, 3.2, 0.9, 'etabli');
    // --- rayonnage (mur gauche) ---
    for (const z of [-7.4, -5.25, -3.1]) box(0.08, 3.2, 0.08, -19.0, 1.6, z, 0xe67e22), box(0.08, 3.2, 0.08, -19.7, 1.6, z, 0xe67e22);
    for (const y of [0.35, 1.15, 1.95, 2.75]) {
      box(0.8, 0.06, 4.4, -19.35, y, -5.25, 0x2980b9);
      for (let z = -7.1; z < -3.4; z += 0.75) if (rng() < 0.8) box(0.55, 0.3 + rng() * 0.25, 0.6, -19.35, y + 0.2, z, [0xc69c6d, 0xd4a86a, 0xb5835a, 0x95a5a6, 0x2980b9][Math.floor(rng() * 5)], { ry: (rng() - 0.5) * 0.3 });
    }
    U.boxCollider(-19.35, -5.25, 0.85, 4.5, 'rayonnage');
    // --- fûts d'huile + bac de rétention, palettes ---
    box(2.4, 0.15, 1.3, 17.2, 0.08, 12.6, 0xf1c40f);                       // V6 : déplacés près de la porte (le coin du fond devient le bureau)
    [[16.5, 0x2980b9], [17.2, 0xc0392b], [17.9, 0x2980b9]].forEach(([x, c]) => { cyl(0.33, 0.95, x, 0.62, 12.6, c); cyl(0.34, 0.06, x, 0.85, 12.6, 0x7f8c8d); cyl(0.34, 0.06, x, 0.4, 12.6, 0x7f8c8d); });
    U.boxCollider(17.2, 12.6, 2.4, 1.3, 'futs');
    for (let i = 0; i < 4; i++) { box(1.2, 0.12, 1.0, 18.6, 0.08 + i * 0.15, 10.2, 0xb5835a, { jit: 0.1 }); box(1.2, 0.03, 0.12, 18.6, 0.15 + i * 0.15, 9.8, 0x8d6e63); }
    U.boxCollider(18.6, 10.2, 1.2, 1.0, 'palettes');
    // --- distributeur (croissants & café) ---
    box(0.85, 1.95, 0.9, -19.3, 0.98, 10.4, 0xc0392b); glass(0.05, 1.1, 0.65, -18.86, 1.25, 10.4, 0xffe9a8); box(0.06, 0.25, 0.7, -18.86, 1.85, 10.4, 0xf1c40f);
    U.boxCollider(-19.3, 10.4, 0.85, 0.9, 'distrib');
    // --- coin du chef : tapis, armoire, chaise, plante verte ---
    box(5.5, 0.01, 3.6, 13.5, 0.04, -8.3, 0x8e2c2c); box(4.9, 0.012, 3.0, 13.5, 0.045, -8.3, 0xa93b3b);
    box(0.7, 1.4, 0.6, 10.3, 0.7, -13.3, 0x7f8c8d); for (const y of [0.35, 0.8, 1.2]) box(0.3, 0.05, 0.02, 10.3, y, -12.99, 0x2c3e50);
    box(0.6, 0.1, 0.6, 12, 0.5, -9.3, 0x2c3e50); box(0.6, 0.7, 0.1, 12, 0.9, -9.6, 0x2c3e50); cyl(0.05, 0.45, 12, 0.25, -9.3, 0x555555);
    cyl(0.25, 0.4, 16.8, 0.2, -13.2, 0x8d6e63); B.add('ball', 0.9, 1.1, 0.9, 16.8, 0.9, -13.2, 0x27ae60);
    // --- V5 : ARMOIRE À OUTILS détaillée (tiroirs, poignées, outils posés dessus) ---
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = 0.55 + c * 1.45, y = 0.18 + r * 0.24;
      box(1.3, 0.22, 0.03, x, y, -12.88, 0xd64541); box(0.5, 0.04, 0.05, x, y + 0.05, -12.86, 0xbdc3c7); box(0.3, 0.06, 0.01, x - 0.45, y + 0.04, -12.865, 0xffffff);
    }
    box(4.5, 0.06, 0.85, 2, 1.33, -13.3, 0x2c3e50);                                          // plateau
    // bloc de forets (du plus petit au plus gros) + coffret de plaquettes + fraises debout
    box(1.1, 0.12, 0.35, 0.6, 1.42, -13.25, 0x7f8c8d);
    for (let i = 0; i < 12; i++) cyl(0.01 + i * 0.0035, 0.18 + i * 0.012, 0.15 + i * 0.075, 1.5 + 0.06 + i * 0.006, -13.25, 0xff7a3f);
    box(0.7, 0.1, 0.45, 2, 1.41, -13.25, 0x1e1e1e); for (let i = 0; i < 8; i++) box(0.09, 0.02, 0.09, 1.76 + (i % 4) * 0.16, 1.47, -13.36 + Math.floor(i / 4) * 0.2, 0xffd23f, { ry: Math.PI / 4 });
    for (let i = 0; i < 6; i++) { cyl(0.035, 0.26, 2.75 + i * 0.17, 1.5, -13.2, 0x3fa7ff); cyl(0.05, 0.06, 2.75 + i * 0.17, 1.39, -13.2, 0x7f8c8d); }
    // panneau perforé au-dessus de l'armoire : silhouettes peintes + outils accrochés
    box(4.4, 1.5, 0.05, 2, 2.4, -13.72, 0x95a5a6);
    for (let x = -0.05; x < 4.1; x += 0.2) for (let y = 1.75; y < 3.1; y += 0.2) box(0.03, 0.03, 0.01, x, y, -13.69, 0x5d6d7e);
    [[0.3, 2.6, 0.06, 0.55, 0x7f8c8d], [0.6, 2.6, 0.07, 0.48, 0x7f8c8d], [0.9, 2.6, 0.08, 0.42, 0x7f8c8d], [1.4, 2.45, 0.35, 0.08, 0x111111], [1.4, 2.7, 0.06, 0.4, 0x8d6e63], [2.1, 2.55, 0.05, 0.7, 0xbdc3c7], [2.5, 2.4, 0.3, 0.3, 0xf39c12], [3.0, 2.6, 0.08, 0.5, 0xc0392b], [3.4, 2.6, 0.08, 0.5, 0x2980b9], [3.8, 2.5, 0.12, 0.35, 0x27ae60]].forEach(([x, y, w, h, c]) => { box(w + 0.06, h + 0.06, 0.01, x, y, -13.69, 0x2c3e50); box(w, h, 0.04, x, y, -13.67, c); });
    // --- V5 : SOUFFLETTES sur enrouleurs d'air comprimé (elles ne quittent pas l'atelier) ---
    box(0.06, 2.6, 2.6, -19.73, 1.9, 6.0, 0x2c3e50);                                          // tableau d'outillage
    for (const z of [2.6, 4.6, 5.4, 6.3, 7.1]) box(0.01, z < 3 ? 0.7 : 0.4, 0.3, -19.69, z < 3 ? 0.5 : 1.15, z, 0x95a5a6);   // silhouettes
    cyl(0.07, 5.2, -19.5, 4.0, 6.7, 0x2980b9);                                                // descente d'air
    box(0.1, 0.1, 1.2, -19.5, 2.15, 6.7, 0x2980b9);
    for (const z of [6.3, 7.1]) { cyl(0.32, 0.18, -19.4, 2.15, z, 0xf1c40f, { rx: Math.PI / 2 }); cyl(0.12, 0.2, -19.4, 2.15, z, 0x2c3e50, { rx: Math.PI / 2 }); }
    sign('AIR COMPRIMÉ 7 bar', 'soufflettes attachées au tuyau', '#2980b9', '#fff', 1.8, 0.5, -19.7, 2.9, 6.7, Math.PI / 2, {});
    // compresseur (dehors, contre le mur ouest) : cuve + moteur + tuyau qui traverse le mur
    cyl(0.5, 2.0, -21.4, 0.75, 6.7, 0x2471a3, { rx: Math.PI / 2 }); for (const dz of [-0.7, 0.7]) box(0.12, 0.25, 0.9, -21.4, 0.13, 6.7 + dz, 0x2c3e50);
    box(0.7, 0.55, 0.7, -21.4, 1.5, 6.3, 0x34495e); cyl(0.25, 0.4, -21.4, 1.5, 7.0, 0x7f8c8d, { rx: Math.PI / 2 }); cyl(0.05, 1.4, -20.8, 2.2, 6.7, 0x2980b9, { rz: Math.PI / 2 });
    U.boxCollider(-21.4, 6.7, 1.1, 2.2, 'compresseur');
    // --- horloge murale ---
    cyl(0.55, 0.1, -4, 4.7, -13.72, 0x2c3e50, { rx: Math.PI / 2 }); cyl(0.48, 0.12, -4, 4.7, -13.7, 0xffffff, { rx: Math.PI / 2 });
    box(0.05, 0.3, 0.02, -4, 4.82, -13.62, 0x111111); box(0.22, 0.04, 0.02, -3.9, 4.7, -13.62, 0x111111, { rz: 0.4 });
    // --- affiches ---
    sign('MÉCANIQUE LEBEC', 'usinage de précision · depuis 1987', '#1a2340', '#ffd257', 12, 2.4, -4, 10.9, 11.78, 0, { glow: true });
    sign("C'EST ÉCRIT DANS\nLE POLY !", '— F. Lebec, depuis 1987', '#2e8b57', '#fff', 7, 1.6, -12, 3.6, -13.72, 0, { border: '#ffd257' });
    sign('0 JOUR SANS\nACCIDENT', 'record : 0', '#ffffff', '#c0392b', 2.6, 1.6, -4, 3.3, -13.72, 0, { border: '#c0392b' });
    sign('PORT DES EPI\nOBLIGATOIRE', 'casque · lunettes · chaussures', '#1f4e9a', '#fff', 2.8, 1.6, -19.72, 3.2, -10.5, Math.PI / 2, { border: '#fff' });
    sign('MIP / MAP', 'appui plan sur la Réf A !', '#ffd257', '#222', 2.8, 1.4, 19.72, 3.2, ext ? -8 : 1.2, -Math.PI / 2, { border: '#222' });
    if (ext) sign('→ EXTENSION EST', 'T4 · F4', '#1a2340', '#ffd257', 3, 0.8, 19.7, 5.2, 1.15, -Math.PI / 2, {});
    sign('INTERDIT DE COURIR', '(sauf si Lebec arrive avec sa pelle)', '#c0392b', '#fff', 4.2, 1.2, -12.5, 3.3, 13.72, Math.PI, {});
    sign('QUALITÉ', 'un client content = Jacky content', '#27ae60', '#fff', 3, 1.2, 12.5, 3.3, 13.72, Math.PI, {});
    for (const [x, z, ry] of [[-19.72, 2.6, Math.PI / 2], [19.72, -11.5, -Math.PI / 2]]) sign('🧯', '', '#c0392b', '#fff', 0.6, 0.6, x, 2.2, z, ry, {});

    if (D.atelierV6) D.atelierV6(P, ext);
    // ===== EXTÉRIEUR =====
    const green = P.outer, tr = P.trim;
    box(0.06, 1.0, 28.4, -20.24, 0.5, 0, green); box(40.5, 1.0, 0.06, 0, 0.5, -14.24, green);
    if (!ext) box(0.06, 1.0, 28.4, 20.24, 0.5, 0, green); else { box(0.06, 1.0, 6.2, 20.24, 0.5, 11.1, green); box(0.06, 1.0, 1.8, 20.24, 0.5, -13.1, green); box(0.06, 1.0, 20.4, 33.24, 0.5, -2, green); box(13.2, 1.0, 0.06, 26.6, 0.5, -12.24, green); box(13.2, 1.0, 0.06, 26.6, 0.5, 8.24, green); box(13.6, 0.3, 0.2, 26.6, 7.4, 8.4, tr); box(13.6, 0.3, 0.2, 26.6, 7.4, -12.4, tr); box(0.2, 0.3, 20.8, 33.5, 7.4, -2, tr); }
    box(15.2, 1.0, 0.06, -12.6, 0.5, 14.24, green); box(15.2, 1.0, 0.06, 12.6, 0.5, 14.24, green);
    box(41.2, 0.3, 0.2, 0, 7.4, 14.4, tr); box(41.2, 0.3, 0.2, 0, 7.4, -14.4, tr); box(0.2, 0.3, 29, 20.5, 7.4, 0, tr); box(0.2, 0.3, 29, -20.5, 7.4, 0, tr);
    stripes(4.5, true, -5.15, 2.25, 14.3, null, 9, { w: 0.3, d: 0.15 }); stripes(4.5, true, 5.15, 2.25, 14.3, null, 9, { w: 0.3, d: 0.15 });
    for (const [x, z] of [[-20.4, 14.4], [20.4, 14.4], [-20.4, -14.4], [20.4, -14.4]]) { cyl(0.12, 7.2, x, 3.6, z, 0x95a5a6); }
    // toit : clims, aérations, lanterneaux, et une CLÉ À MOLETTE géante
    for (const [x, z] of [[-12, -6], [-6, 8], [13, -8]]) { box(2.2, 1.1, 1.6, x, 7.85, z, 0xbdc3c7); cyl(0.55, 0.06, x, 8.42, z, 0x2c3e50); box(2.3, 0.08, 1.7, x, 8.4, z, 0x95a5a6); }
    for (const x of [-16, -1, 16]) { cyl(0.3, 1.2, x, 7.9, 3, 0x7f8c8d); B.add('cone', 0.9, 0.4, 0.9, x, 8.65, 3, 0x7f8c8d); }
    for (let x = -14; x <= 14; x += 7) glass(3, 0.3, 2.2, x, 7.42, -2, 0xcfe8ff);
    // enseigne géante sur le toit + un ÉNORME engrenage jaune (pour le fun)
    for (const x of [-9, 1]) box(0.3, 3.2, 0.3, x, 8.8, 11.6, 0x7f8c8d);
    box(12.4, 2.6, 0.3, -4, 10.9, 11.6, 0x1a2340); box(12.8, 0.25, 0.4, -4, 12.25, 11.6, 0xf1c40f); box(12.8, 0.25, 0.4, -4, 9.55, 11.6, 0xf1c40f);
    cyl(2.1, 0.7, 9, 9.8, 11.2, 0xf1c40f, { rx: Math.PI / 2 }); cyl(0.8, 0.8, 9, 9.8, 11.2, 0x2c3e50, { rx: Math.PI / 2 });
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; box(0.8, 0.9, 0.6, 9 + Math.cos(a) * 2.3, 9.8 + Math.sin(a) * 2.3, 11.2, 0xf1c40f, { rz: a }); }
    box(0.4, 2.5, 0.4, 9, 8.4, 11.2, 0x7f8c8d);
    // façade : fenêtres de part et d'autre de la porte
    for (const x of [-16, -11.5, 11.5, 16]) { glass(3, 1.4, 0.5, x, 3.6, 14, 0xa9d6f5); box(3.2, 0.12, 0.6, x, 2.85, 14.05, 0xecf0f1); }
    // jardinières devant la porte
    for (const s of [-1, 1]) {
      box(1.6, 0.6, 0.6, 6.9 * s, 0.3, 14.75, 0xa0703f); B.add('ball', 1.4, 0.55, 0.45, 6.9 * s, 0.75, 14.75, 0x27ae60);
      for (let i = 0; i < 4; i++) box(0.14, 0.14, 0.14, 6.9 * s - 0.55 + i * 0.37, 1.0, 14.75 + (i % 2 ? 0.1 : -0.1), [0xe74c3c, 0xf1c40f, 0xff7eb6, 0xffffff][i]);
      U.boxCollider(6.9 * s, 14.75, 1.6, 0.6, 'jardiniere');
    }
    // parking clients : arceaux vélos + borne
    for (let i = 0; i < 4; i++) B.add('box', 0.06, 0.8, 0.6, -17.4, 0.4, 25 + i * 0.7, 0x95a5a6);
  };

  /* =====================================================================
     MACHINES (dans le groupe de la machine : coordonnées locales)
     ===================================================================== */
  const mm = {};
  const M = (c, e) => { const k = c + '_' + (e || 0); return mm[k] || (mm[k] = new THREE.MeshLambertMaterial({ color: c, emissive: e || 0 })); };
  D.machine = (m, def, g) => {
    init(); const saved = B, savedRng = rng; B = new Batch(); rng = rng || U.rng(1);       // petit lot local : tous les détails d'une machine = 1 maillage
    const add = (w, h, d, x, y, z, col, o) => B.add('box', w, h, d, x, y, z, col, o);
    const glassM = mm.glass || (mm.glass = new THREE.MeshLambertMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.35 }));
    const SCR = 0x3aa0ff, LIT = 0xbfe6ff;
    if (def.type === 'tour') {
      const L = def.len, acc = 0x16a085;
      add(L * 0.86, 0.12, 1.22, -L * 0.05, 2.21, 0, acc); add(L, 0.1, 0.06, 0, 0.88, 0.67, acc);
      U.box(L * 0.45, 0.6, 0.03, glassM, -L * 0.12, 1.6, 0.66, g, false);
      add(0.38, 0.28, 0.03, L * 0.42, 1.75, 0.86, SCR); add(0.3, 0.04, 0.03, L * 0.42, 1.75, 0.875, LIT);
      add(0.08, 0.08, 0.04, L * 0.38, 1.4, 0.86, 0x2ecc71); add(0.08, 0.08, 0.04, L * 0.46, 1.4, 0.86, 0xe74c3c);
      add(0.8, 0.5, 0.5, L * 0.28, 0.25, -0.85, 0x2980b9); add(0.5, 0.4, 0.5, L * 0.2, 2.47, 0, 0x2c3e50);
      for (const dx of [-0.45, 0.45]) for (const dz of [-0.5, 0.5]) add(0.25, 0.08, 0.25, dx * L, 0.04, dz, 0x222222);
      add(0.9, 0.18, 0.02, -L * 0.3, 2.0, 0.62, 0xffffff); add(0.5, 0.1, 0.025, -L * 0.3, 2.0, 0.63, acc);
    } else {
      const acc = 0xe67e22;
      add(2.22, 0.12, 2.22, 0, 2.62, 0, acc); add(2.26, 0.1, 0.06, 0, 0.55, -1.13, acc);
      U.box(1.2, 0.9, 0.03, glassM, 0, 1.5, -1.14, g, false);
      add(0.8, 0.6, 0.8, 0, 2.98, 0.2, 0x2c3e50); add(0.03, 0.3, 0.38, 1.39, 1.7, -0.6, SCR); add(0.03, 0.04, 0.3, 1.4, 1.7, -0.6, LIT);
      add(0.03, 0.08, 0.08, 1.39, 1.35, -0.7, 0x2ecc71); add(0.03, 0.08, 0.08, 1.39, 1.35, -0.5, 0xe74c3c);
      add(0.6, 0.5, 0.9, -1.45, 0.25, 0.4, 0x2980b9);
      for (const dx of [-0.95, 0.95]) for (const dz of [-0.95, 0.95]) add(0.3, 0.08, 0.3, dx, 0.04, dz, 0x222222);
      add(0.35, 0.3, 0.02, 0.75, 2.2, -1.12, 0xf1c40f, { rz: Math.PI / 4 });
    }
    B.build(g); B = saved; rng = savedRng;
  };

  /* =====================================================================
     ENTREPRISES : corniche, clims, auvent, porte de quai rayée, poubelles
     ===================================================================== */
  D.company = (key, C, P) => {
    const F = frame(P.x, P.z, P.rot), fz = C.d / 2, hw = C.w / 2, top = C.h + 0.5;
    const trim = C.kind === 'concession' ? 0xffffff : 0xecf0f1;
    F.box(C.w + 0.8, 0.45, 0.25, 0, top + 0.22, fz + 0.28, trim); F.box(C.w + 0.8, 0.45, 0.25, 0, top + 0.22, -fz - 0.28, trim);
    F.box(0.25, 0.45, C.d + 0.8, hw + 0.28, top + 0.22, 0, trim); F.box(0.25, 0.45, C.d + 0.8, -hw - 0.28, top + 0.22, 0, trim);
    for (let i = 0; i < 2; i++) { const x = -hw / 2 + i * hw * 0.9, z = -fz / 3 + i * 1.5; F.box(2, 1, 1.4, x, top + 0.5, z, 0xbdc3c7); F.box(2.1, 0.08, 1.5, x, top + 1.02, z, 0x95a5a6); }
    F.sh('cyl', 0.5, 1.4, 0.5, hw * 0.6, top + 0.7, fz * 0.4, 0x7f8c8d);
    // porte de quai : bandes de sécurité + rails
    for (let i = 0; i < 8; i++) { F.box(0.3, 4.6 / 8, 0.1, -hw + 1.85, (i + 0.5) * 4.6 / 8, fz + 0.12, i % 2 ? 0x111111 : 0xf1c40f); F.box(0.3, 4.6 / 8, 0.1, -hw + 8.15, (i + 0.5) * 4.6 / 8, fz + 0.12, i % 2 ? 0x111111 : 0xf1c40f); }
    F.box(6.6, 0.3, 0.3, -hw + 5, 4.75, fz + 0.15, 0x7f8c8d);
    // porte d'entrée : auvent + lampe
    F.box(2.2, 0.14, 1.2, hw - 3, 2.55, fz + 0.6, C.roof); F.glass(0.3, 0.2, 0.15, hw - 3, 2.35, fz + 0.14, 0xfff3c4);
    // appuis de fenêtres
    for (let x = -C.w / 2 + 10; x < C.w / 2 - 4.5; x += 2.6) F.box(1.8, 0.1, 0.25, x, C.h * 0.55 - 0.65, fz + 0.12, 0xffffff);
    // descentes de gouttières, poubelles et palettes sur le côté
    for (const s of [-1, 1]) F.sh('cyl', 0.2, C.h, 0.2, s * (hw + 0.15), C.h / 2, fz + 0.15, 0x95a5a6);
    F.sh('cyl', 0.7, 1.0, 0.7, hw + 0.7, 0.5, fz - 2, 0x27ae60); F.sh('cyl', 0.7, 1.0, 0.7, hw + 0.7, 0.5, fz - 3, 0xf1c40f);
    for (let i = 0; i < 3; i++) F.box(1.2, 0.12, 1, -hw - 0.8, 0.08 + i * 0.15, -fz + 2, 0xb5835a, { jit: 0.1 });
  };

  /* =====================================================================
     IMMEUBLES DE LA VILLE (maisons, boutiques, immeubles à balcons)
     ===================================================================== */
  const WALLS = [0xf6d6ad, 0xa8d8b9, 0xf7c5cc, 0xb5d3e7, 0xf9e79f, 0xd7bde2, 0xfad7a0, 0xaed6f1, 0xf5b7b1, 0xfdfefe, 0xe8daef, 0xd5f5e3];
  const ROOFS = [0xc0392b, 0x8e5b4b, 0x34495e, 0x5d6d7e, 0xa04000, 0x7b241c];
  const SHOPS = [['Kebab du Tour', 'grec · frites · sauce blanche'], ["Hair'Usinage", 'coiffure · coupe au 1/100e'], ['Tabac Le Copeau', 'presse · loto · PMU'], ['Pizzeria La Fraiseuse', 'au feu de bois de palette'],
    ['Auto-École Rodage', 'code · conduite · créneaux'], ['Bar Le Mandrin', 'happy hour 17 h – 19 h'], ['Pressing Le Lubrifiant', 'taches d\'huile acceptées'], ['Pharmacie de la Rectifieuse', 'ouvert 7j/7'],
    ['Pétale & Écrou', 'fleuriste'], ['Crêperie Clé de 12', 'galettes · cidre'], ['Écrou-Marché', 'supérette'], ['Optique Pied à Coulisse', 'au dixième près'], ['Boucherie du Taraud', 'charcuterie maison'],
    ['Laverie Bain d\'Huile', 'machines 8 kg'], ['Vidéo-Club Rétro', 'location DVD (encore)']];
  const pick = a => a[Math.floor(rng() * a.length)];
  function windows(F, w, floors, fh, y0, zf, side, opt) {                 // grille de fenêtres sur une façade (+z) ou un côté (±x)
    const n = Math.max(1, Math.floor(w / 2.6)), step = w / n;
    for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
      const u = -w / 2 + step * (i + 0.5), y = y0 + f * fh + fh * 0.55, lit = rng() < 0.45 ? 0xffe9a8 : 0xa9d6f5;
      if (side) { F.glass(0.1, 1.1, 1.0, side * zf, y, u, lit); F.box(0.14, 0.12, 1.2, side * (zf + 0.04), y - 0.62, u, 0xffffff); if (opt && opt.shutters) for (const s of [-1, 1]) F.box(0.12, 1.1, 0.35, side * (zf + 0.04), y, u + s * 0.7, opt.shutters); }
      else { F.glass(1.0, 1.1, 0.1, u, y, zf, lit); F.box(1.2, 0.12, 0.14, u, y - 0.62, zf + 0.04, 0xffffff); if (opt && opt.shutters) for (const s of [-1, 1]) F.box(0.35, 1.1, 0.12, u + s * 0.7, y, zf + 0.04, opt.shutters); }
    }
  }
  function house(F) {
    const w = 9 + rng() * 3, d = 7.5 + rng() * 2, floors = rng() < 0.55 ? 1 : 2, h = floors * 2.9, wall = pick(WALLS), roof = pick(ROOFS), z0 = -1; FP = [w, d, z0];
    F.box(w, h, d, 0, h / 2, z0, wall, { jit: 0.04 }); F.box(w + 0.1, 0.4, d + 0.1, 0, 0.2, z0, 0x7f8c8d);
    F.sh('prism', w + 0.8, 2.4, d + 1.0, 0, h + 1.2, z0, roof, { jit: 0.04 });
    F.box(0.8, 2.2, 0.8, w * 0.25, h + 2.1, z0 - d * 0.15, 0x8d6e63); F.box(0.95, 0.15, 0.95, w * 0.25, h + 3.25, z0 - d * 0.15, 0x5d4037);
    const shutters = pick([0x27ae60, 0x2980b9, 0xc0392b, 0x8e44ad, 0xf39c12, 0x16a085]);
    F.box(1.1, 2.1, 0.12, -w * 0.25, 1.05, z0 + d / 2 + 0.06, 0x6d4c41); F.box(1.6, 0.12, 1.0, -w * 0.25, 2.3, z0 + d / 2 + 0.5, roof); F.box(1.4, 0.2, 0.8, -w * 0.25, 0.1, z0 + d / 2 + 0.4, 0x95a5a6);
    for (let f = 0; f < floors; f++) for (const x of [w * 0.12, w * 0.33]) { F.glass(1.0, 1.0, 0.1, x, f * 2.9 + 1.6, z0 + d / 2 + 0.02, rng() < 0.4 ? 0xffe9a8 : 0xa9d6f5); for (const s of [-1, 1]) F.box(0.34, 1.0, 0.1, x + s * 0.68, f * 2.9 + 1.6, z0 + d / 2 + 0.06, shutters); }
    if (floors === 2) { F.glass(1.0, 1.0, 0.1, -w * 0.25, 4.5, z0 + d / 2 + 0.02, 0xa9d6f5); for (const s of [-1, 1]) F.box(0.34, 1.0, 0.1, -w * 0.25 + s * 0.68, 4.5, z0 + d / 2 + 0.06, shutters); }
    windows(F, d - 2, floors, 2.9, 0, w / 2 + 0.02, 1);
    // jardin : haie, allée, boîte aux lettres, fleurs, parfois un trampoline ou un nain de jardin
    const gz = z0 + d / 2 + 2.6;
    const px = -w * 0.25, l1 = w * 0.25 - 0.8, l2 = w * 0.75 - 0.8;                  // haie de part et d'autre de l'allée
    if (l1 > 0.3) F.box(l1, 0.9, 0.7, -w / 2 + l1 / 2, 0.45, 6.2, 0x2e7d32, { jit: 0.08 });
    F.box(l2, 0.9, 0.7, px + 0.8 + l2 / 2, 0.45, 6.2, 0x2e7d32, { jit: 0.08 });
    F.box(1.2, 0.03, 6.2 - (z0 + d / 2), -w * 0.25, 0.04, (6.2 + z0 + d / 2) / 2, 0xbdb5a6);
    F.box(0.12, 1.0, 0.12, -w * 0.25 + 1.1, 0.5, 6.4, 0x555555); F.box(0.4, 0.3, 0.3, -w * 0.25 + 1.1, 1.1, 6.4, shutters);
    for (let i = 0; i < 6; i++) F.box(0.16, 0.16, 0.16, w * 0.1 + rng() * w * 0.3, 0.3, gz + rng() * 1.5, pick([0xe74c3c, 0xf1c40f, 0xff7eb6, 0xffffff, 0x9b59b6]));
    if (rng() < 0.3) { F.sh('cyl', 0.35, 0.5, 0.35, w * 0.35, 0.25, gz + 0.8, 0x2980b9); F.sh('cone', 0.4, 0.5, 0.4, w * 0.35, 0.75, gz + 0.8, 0xc0392b); }   // nain de jardin
    else if (rng() < 0.3) { F.sh('cyl', 2.2, 0.1, 2.2, w * 0.3, 0.7, gz + 0.6, 0x2c3e50); for (const s of [-1, 1]) F.box(0.06, 0.7, 0.06, w * 0.3 + s * 0.9, 0.35, gz + 0.6, 0x7f8c8d); }  // trampoline
  }
  function shop(F) {
    const w = 12 + rng() * 1.5, d = 10, floors = 2 + Math.floor(rng() * 2), fh = 3.2, h = floors * fh + 0.6, wall = pick(WALLS), zf = d / 2 - 1; FP = [w, d, -1];
    F.box(w, h, d, 0, h / 2, -1, wall, { jit: 0.04 });
    F.box(w + 0.1, fh, 0.15, 0, fh / 2, zf + 0.02, 0x2c3e50); F.glass(w - 3.4, fh - 1.1, 0.12, -0.8, fh / 2 - 0.2, zf + 0.06, 0x9fd3f0);
    for (let i = 0; i < 3; i++) F.box(0.9, 0.6, 0.03, -w / 2 + 2.2 + i * 2.6, 1.2 + (i % 2) * 0.5, zf + 0.13, pick([0xff7eb6, 0xf1c40f, 0xffffff, 0x2ecc71]));   // affiches « PROMO » sur la vitrine
    F.box(w - 3.4, 0.6, 0.6, -0.8, 0.3, zf - 0.4, 0x8d6e63);
    F.box(1.3, 2.3, 0.14, w / 2 - 1.3, 1.15, zf + 0.08, 0x6d4c41);
    const c1 = pick([0xc0392b, 0x27ae60, 0x2980b9, 0x8e44ad, 0xd35400]);
    for (let i = 0; i < 8; i++) F.box(w / 8, 0.1, 1.6, -w / 2 + (i + 0.5) * w / 8, fh + 0.15, zf + 0.75, i % 2 ? 0xffffff : c1, { rx: 0.35 });
    windows(F, w - 1, floors - 1, fh, fh, zf + 0.02, 0);
    F.box(w + 0.4, 0.35, d + 0.4, 0, h + 0.18, -1, pick(ROOFS)); F.box(2, 0.9, 1.4, w * 0.2, h + 0.8, -2, 0xbdc3c7);
    const [n, s] = pick(SHOPS), p = F.L(0, zf + 0.12);
    sign(n, s, '#' + new THREE.Color(c1).getHexString(), '#ffffff', Math.min(w - 2, 8), 1.3, p.x, fh + 1.15, p.z, F.a, { border: '#ffffff', glow: true });
  }
  function flats(F) {
    const w = 12.5, d = 11, floors = 4 + Math.floor(rng() * 3), fh = 3, h = floors * fh + 0.4, wall = pick(WALLS), band = pick(WALLS), zf = d / 2 - 1.5; FP = [w, d, -1.5];
    F.box(w, h, d, 0, h / 2, -1.5, wall, { jit: 0.04 }); F.box(w + 0.1, 1.1, d + 0.1, 0, 0.55, -1.5, 0x7f8c8d);
    for (let f = 1; f < floors; f += 2) F.box(w + 0.06, 0.35, d + 0.06, 0, f * fh, -1.5, band);
    windows(F, w - 1, floors, fh, 0, zf + 0.02, 0); windows(F, d - 2, floors, fh, 0, w / 2 + 0.02, 1, {}); windows(F, d - 2, floors, fh, 0, w / 2 + 0.02, -1, {});
    F.box(1.6, 2.4, 0.15, 0, 1.2, zf + 0.06, 0x2c3e50); F.box(2.4, 0.15, 1.3, 0, 2.6, zf + 0.6, 0x7f8c8d);
    for (let f = 1; f < floors; f++) for (const x of [-w * 0.3, w * 0.3]) {
      if (rng() < 0.25) continue;
      const y = f * fh + 0.1; F.box(3, 0.15, 1.2, x, y, zf + 0.6, 0xbdc3c7); F.box(3, 0.8, 0.06, x, y + 0.45, zf + 1.2, 0xecf0f1); for (const s of [-1, 1]) F.box(0.06, 0.8, 1.2, x + s * 1.5, y + 0.45, zf + 0.6, 0xecf0f1);
      const r = rng();
      if (r < 0.3) F.sh('ball', 0.7, 0.7, 0.7, x - 1, y + 0.45, zf + 0.6, 0x27ae60);                                     // plante
      else if (r < 0.55) for (let i = 0; i < 4; i++) F.box(0.35, 0.45, 0.04, x - 0.9 + i * 0.6, y + 1.2, zf + 0.6, pick([0xe74c3c, 0x3498db, 0xf1c40f, 0xffffff, 0xff7eb6])); // linge
      else if (r < 0.7) F.sh('cyl', 0.7, 0.08, 0.7, x + 1, y + 1.3, zf + 1.1, 0xecf0f1, { rx: 1.1 });                 // parabole
      else if (r < 0.8) F.box(1.4, 0.6, 0.6, x, y + 0.4, zf + 0.6, 0xc0392b);                                      // barbecue / bac
    }
    F.box(w + 0.5, 0.5, d + 0.5, 0, h + 0.25, -1.5, 0x5d6d7e);
    F.sh('cyl', 2, 2.2, 2, -w * 0.25, h + 1.6, -3, 0x7f8c8d); F.sh('cone', 2.2, 0.8, 2.2, -w * 0.25, h + 3.1, -3, 0x5d6d7e);
    F.sh('cyl', 0.08, 3.5, 0.08, w * 0.3, h + 2, -1, 0x555555); F.box(1.2, 0.06, 0.06, w * 0.3, h + 3.2, -1, 0x555555);
    F.box(1.8, 1.8, 1.6, w * 0.2, h + 1.1, -4.5, 0xbdc3c7);
  }
  /** Immeuble de remplissage : true si on l'a dessiné (sinon world.js pose un modèle KayKit) */
  const RESID = ['Résidence Les Tilleuls', 'Résidence du Taraud', 'Les Hauts de la Fraiseuse', 'Résidence Le Copeau', 'Les Jardins du Mandrin', 'Résidence Pied à Coulisse'];
  function espacil(F, f) {                                                 // V5 : immeubles Espacil (bailleur social, client de l'atelier)
    const w = 13, d = 11, floors = 5 + Math.floor(rng() * 3), fh = 3, h = floors * fh + 0.4, zf = d / 2 - 1.5, teal = 0x13a89e; FP = [w, d, -1.5];
    F.box(w, h, d, 0, h / 2, -1.5, 0xf3efe6, { jit: 0.03 }); F.box(w + 0.1, 1.1, d + 0.1, 0, 0.55, -1.5, 0x8d969c);
    for (let fl = 1; fl < floors; fl++) F.box(w + 0.06, 0.25, d + 0.06, 0, fl * fh, -1.5, fl % 2 ? teal : 0xd5d8dc);
    F.box(0.8, h, 0.15, -w / 2 + 2, h / 2, zf + 0.06, teal); F.box(0.8, h, 0.15, w / 2 - 2, h / 2, zf + 0.06, 0xf39c12);
    windows(F, w - 1, floors, fh, 0, zf + 0.02, 0); windows(F, d - 2, floors, fh, 0, w / 2 + 0.02, 1, {}); windows(F, d - 2, floors, fh, 0, w / 2 + 0.02, -1, {});
    F.box(2, 2.4, 0.15, 0, 1.2, zf + 0.06, 0x2c3e50); F.box(3, 0.15, 1.5, 0, 2.6, zf + 0.7, teal);
    for (let fl = 1; fl < floors; fl++) for (const x of [-w * 0.28, w * 0.28]) { if (rng() < 0.35) continue; const y = fl * fh + 0.1; F.box(2.6, 0.12, 1.1, x, y, zf + 0.55, 0xbdc3c7); F.box(2.6, 0.75, 0.05, x, y + 0.42, zf + 1.1, teal); if (rng() < 0.4) F.sh('ball', 0.6, 0.6, 0.6, x - 0.8, y + 0.4, zf + 0.55, 0x27ae60); }
    F.box(w + 0.5, 0.5, d + 0.5, 0, h + 0.25, -1.5, 0x5d6d7e); F.box(2.4, 1.6, 2, w * 0.2, h + 1.1, -4, 0xbdc3c7);
    const p = F.L(0, zf + 0.12), name = RESID[Math.floor(rng() * RESID.length)];
    sign('ESPACIL', name, '#13a89e', '#ffffff', 4.2, 1.2, p.x, 3.4, p.z, F.a, { border: '#ffffff', glow: true });
    for (let i = 0; i < 4; i++) F.box(0.8, 1.1, 0.5, -w / 2 + 1 + i * 0.95, 0.55, zf + 2.4, [0x27ae60, 0xf1c40f, 0x2c3e50, 0x95a5a6][i]);   // poubelles de tri
  }
  let FP = null;                                                          // V5.3 : emprise réelle du dernier bâtiment (collision = ce qu'on voit)
  D.building = f => { FP = null; const ok = building(f); f.fp = ok && FP ? [FP[0] + 0.5, FP[1] + 0.5, FP[2]] : null; return ok; };
  function building(f) {
    const r = rng();
    if (f.espacil) { f.style = 'espacil'; espacil(frame(f.x, f.z, f.rot), f); return true; }
    if (f.lieu && ML.LIEUX[f.lieu]) {                                     // V5.2 : maison / appartement d'un copain, avec son nom
      const L = ML.LIEUX[f.lieu], F = frame(f.x, f.z, f.rot); f.style = L.style;
      if (L.style === 'immeuble') flats(F); else house(F);
      const p = F.L(2.6, 5.62); sign(L.name, L.style === 'immeuble' ? 'interphone : sonnez fort' : 'propriété privée', L.color, '#ffffff', 4.4, 1.1, p.x, 1.9, p.z, F.a, { border: '#ffffff', glow: true });
      F.box(0.12, 1.9, 0.12, 0.5, 0.95, 5.55, 0x555555); F.box(0.12, 1.9, 0.12, 4.7, 0.95, 5.55, 0x555555);
      return true;
    }
    if (r < 0.32) return false;
    const F = frame(f.x, f.z, f.rot);
    f.style = r < 0.55 ? 'maison' : r < 0.78 ? 'boutique' : 'immeuble';
    if (r < 0.55) house(F); else if (r < 0.78) shop(F); else flats(F);
    return true;
  }

  /* =====================================================================
     RUES et NATURE
     ===================================================================== */
  D.streets = city => {
    const N = city.nodes, E = city.edges, RW = city.RW;
    const deg = i => E.filter(e => e.a === i || e.b === i).length;
    const freeAt = (x, z, m) => !city.rects.some(o => Math.abs(o.x - x) < o.hx + m && Math.abs(o.z - z) < o.hz + m) && !(Math.abs(x) < 34 && z > -32 && z < 32);
    // passages piétons aux carrefours
    N.forEach((n, i) => {
      if (n.cul || deg(i) < 3) return;
      for (const e of E) {
        if (e.a !== i && e.b !== i) continue;
        const o = N[e.a === i ? e.b : e.a], L = Math.hypot(o.x - n.x, o.z - n.z); if (L < RW * 2 + 8) continue;
        const ux = (o.x - n.x) / L, uz = (o.z - n.z) / L, cx = n.x + ux * (RW + 2.6), cz = n.z + uz * (RW + 2.6), a = Math.atan2(ux, uz);
        for (let t = -RW + 0.8; t <= RW - 0.8; t += 0.9) box(0.45, 0.012, 2.4, cx - uz * t, 0.046, cz + ux * t, 0xf4f4f4, { ry: a });
      }
    });
    // mobilier : bancs, poubelles, abribus, bornes
    E.forEach((e, ei) => {
      if (ei === 0 || e.ring || e.len < 40) return;
      const A = N[e.a], Bn = N[e.b], dx = (Bn.x - A.x) / e.len, dz = (Bn.z - A.z) / e.len, a = Math.atan2(dx, dz);
      for (let t = 20; t < e.len - 20; t += 34) {
        const s = rng() < 0.5 ? 1 : -1, off = RW + 2.3, x = A.x + dx * t - dz * s * off, z = A.z + dz * t + dx * s * off; if (!freeAt(x, z, 2)) continue;
        // u : le long de la rue ; v : en s'éloignant de la rue. ra : l'axe x local suit la rue
        const k = rng(), at = (u, v) => ({ x: x - dz * s * v + dx * u, z: z + dx * s * v + dz * u }), ra = a - Math.PI / 2, ry = ra;
        if (k < 0.35) {                                                         // banc
          const p = at(0, 0); box(1.8, 0.08, 0.5, p.x, 0.5, p.z, 0x8d6e63, { ry: ra }); const q = at(0, 0.25); box(1.8, 0.4, 0.06, q.x, 0.75, q.z, 0x8d6e63, { ry: ra });
          for (const u of [-0.75, 0.75]) { const r2 = at(u, 0); box(0.08, 0.5, 0.45, r2.x, 0.25, r2.z, 0x2c3e50, { ry: ra }); }
        } else if (k < 0.55) { const p = at(0, 0); cyl(0.3, 0.9, p.x, 0.45, p.z, 0x27ae60); cyl(0.33, 0.08, p.x, 0.92, p.z, 0x1e8449); }
        else if (k < 0.7 && e.len > 60) {                                       // abribus
          const p = at(0, 0.3); box(3.2, 0.12, 1.4, p.x, 2.5, p.z, 0x2c3e50, { ry: ra });
          const back = at(0, 0.95); glass(3.2, 2.3, 0.06, back.x, 1.2, back.z, 0xcfe8ff, { ry: ra });
          for (const u of [-1.5, 1.5]) { const r2 = at(u, 0.95); box(0.1, 2.5, 0.1, r2.x, 1.25, r2.z, 0x7f8c8d); }
          const bn = at(-0.5, 0.7); box(1.6, 0.08, 0.4, bn.x, 0.5, bn.z, 0x7f8c8d, { ry: ra });
          const pole = at(1.9, 0); box(0.1, 2.6, 0.1, pole.x, 1.3, pole.z, 0x7f8c8d); box(0.7, 0.5, 0.06, pole.x, 2.5, pole.z, 0x1f4e9a, { ry: ry });
          U.boxCollider(back.x, back.z, 1.2, 1.2, 'abribus');
        } else for (let u = -1.5; u <= 1.5; u += 1.5) { const p = at(u, -0.4); cyl(0.1, 0.8, p.x, 0.4, p.z, 0x2c3e50); cyl(0.12, 0.08, p.x, 0.82, p.z, 0xc0392b); }
      }
    });
  };
  /** Sapins (à la place d'une partie des arbres ronds), fleurs, touffes d'herbe */
  D.nature = (city, pines) => {
    for (const t of pines) {
      const k = t.k, gy = ML.gy(t.x, t.z); cyl(0.25, 1.4, t.x, gy + 0.7, t.z, 0x6d4c41);
      for (let i = 0; i < 3; i++) B.add('cone', (2.8 - i * 0.7) * k, 1.9 * k, (2.8 - i * 0.7) * k, t.x, gy + (1.6 + i * 1.15) * k, t.z, [0x1e5631, 0x2d6a4f, 0x245c3a][i], { jit: 0.06 });
    }
    const N = city.nodes, E = city.edges, RW = city.RW, M2 = ML.CFG.MAP;
    const free = (x, z, m) => !(x > -34 && x < 34 && z > -32 && z < 32) && !city.rects.some(o => Math.abs(o.x - x) < o.hx + m && Math.abs(o.z - z) < o.hz + m) &&
      !E.some(e => ML.CityGen.segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < RW + 1.8 + m) && !ML.riverAt(x, z, m + 0.5);
    let n = 0;
    for (let t = 0; t < 1400 && n < 420; t++) {
      const x = M2.minX + 6 + rng() * (M2.maxX - M2.minX - 12), z = M2.minZ + 6 + rng() * (M2.maxZ - M2.minZ - 12); if (!free(x, z, 0.5)) continue; n++;
      const gy = ML.gy(x, z);
      if (rng() < 0.18) for (let i = 0; i < 6; i++) { const fx = x + (rng() - 0.5) * 1.6, fz = z + (rng() - 0.5) * 1.6; box(0.14, 0.25, 0.14, fx, ML.gy(fx, fz) + 0.12, fz, pick([0xe74c3c, 0xf1c40f, 0xffffff, 0xff7eb6, 0x9b59b6, 0x3498db])); }
      else { const c = pick([0x4a7f34, 0x5f9443, 0x3d6b2c, 0x6aa84f]); for (let i = 0; i < 3; i++) B.add('cone', 0.12, 0.35 + rng() * 0.3, 0.12, x + (i - 1) * 0.12, gy + 0.2, z + (rng() - 0.5) * 0.15, c, { rz: (i - 1) * 0.35 }); }
    }
    // V5 : roseaux et galets le long de la rivière
    const RV = city.river || [];
    for (let i = 0; i < RV.length - 1 && RV.length; i++) for (let k = 0; k < 3; k++) {
      const t = rng(), A = RV[i], Bq = RV[i + 1], dx = Bq.x - A.x, dz = Bq.z - A.z, L = Math.hypot(dx, dz) || 1, side = rng() < 0.5 ? 1 : -1, off = city.RIV.half + 2.6 + rng() * 1.4;
      const x = A.x + dx * t - dz / L * off * side, z = A.z + dz * t + dx / L * off * side;
      if (x < M2.minX || x > M2.maxX || E.some(e => ML.CityGen.segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < RW + 3)) continue;
      const gy = ML.gyv(x, z);
      if (rng() < 0.6) for (let j = 0; j < 5; j++) B.add('cone', 0.1, 1.1 + rng() * 0.6, 0.1, x + (rng() - 0.5) * 0.8, gy + 0.5, z + (rng() - 0.5) * 0.8, 0x6b8e23, { rz: (rng() - 0.5) * 0.3 });
      else B.add('ball', 0.7 + rng() * 0.6, 0.35, 0.6 + rng() * 0.5, x, gy + 0.1, z, 0xa39e93, { ry: rng() * 6 });
    }
    for (let t = 0; t < 400 && n < 470; t++) {                                     // quelques rochers
      const x = M2.minX + 6 + rng() * (M2.maxX - M2.minX - 12), z = M2.minZ + 6 + rng() * (M2.maxZ - M2.minZ - 12); if (!free(x, z, 1.5)) continue; n++;
      B.add('ball', 1 + rng() * 1.2, 0.6 + rng() * 0.6, 1 + rng() * 1.2, x, ML.gy(x, z) + 0.25, z, 0x8a8f94, { ry: rng() * 6, jit: 0.08 });
    }
  };
})();
