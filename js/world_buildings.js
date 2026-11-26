/* =====================================================================
   world_buildings.js — BÂTIMENTS :
   1) W.company(key, C, P) : les entreprises, OUVERTES (on peut rentrer) :
      murs avec collisions séparées, porte en façade, accueil (banque,
      chaises, plante, machine à café, mur logo), bureaux / atelier,
      personnel décoratif (ML.People, fusionné), cellule à la gendarmerie.
   2) ML.Build.make(type, rng, opts) : kit de bâtiments de la ville
      (maison bretonne, longère, mitoyennes, immeuble, commerces rigolos,
      église, mairie, école, supermarché, ferme, chalet, refuge, hangar, garage).
   Tout est FUSIONNÉ (ML.Style.merge) : 1 mesh par matériau.
   Matériaux PARTAGÉS (peu de variantes par rôle) pour limiter les appels de dessin.
   ===================================================================== */
(function () {
  const W = ML.World, U = ML.U, T = ML.Tex, ST = ML.Style, PAL = ML.PAL;
  const PI = Math.PI;

  /* =================== Matériaux partagés =================== */
  const M = (c, e) => ST.toon(c, e);                                    // toon mis en cache
  const dim = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
  const IN = c => ST.toon(c, dim(c, 0.38));                               // intérieur : légèrement auto-éclairé (pas de lampe)
  const GLOW = (c, k) => ST.toon(c, dim(c, k === undefined ? 0.8 : k));   // lumineux (vitrine, écran, braise)
  const r0 = U.rng(9001);
  const variants = (hex, n, amt) => { const a = [hex]; for (let i = 1; i < n; i++) a.push(ST.vary(hex, amt, r0)); return a; };
  const K = {
    plaster: [...variants(PAL.plaster, 2, 0.5), ...variants(PAL.plasterWarm, 2, 0.6), PAL.white].map(c => M(c)),
    granite: [PAL.granite, PAL.granite2, ST.vary(PAL.granite, 0.7, r0)].map(c => M(c)),
    slate: [PAL.slate, PAL.slateDark, ST.vary(PAL.slate, 0.6, r0)].map(c => M(c)),
    shut: [PAL.shutterBlue, PAL.shutterGreen, PAL.shutterRed, PAL.shutterYellow].map(c => M(c)),
    glass: M(PAL.glassDark), shopGlass: GLOW(PAL.plasterWarm, 0.55), white: M(PAL.white), black: M(PAL.black),
    wood: M(PAL.wood), woodDark: M(PAL.woodDark), steel: M(PAL.steel), steelDark: M(PAL.steelDark),
    tile: M(PAL.tile), brick: M(PAL.brick), green: M(PAL.forestLight), snow: M(PAL.snow), sand: M(PAL.sand),
    red: M(PAL.red), cladding: M(PAL.cladding), yellow: M(PAL.lebecYellow), blue: M(PAL.lebecBlue)
  };
  // intérieurs des entreprises
  const KI = {
    wall: IN(PAL.plaster), white: GLOW(PAL.white, 0.6),
    wood: IN(PAL.wood), machine: IN(PAL.machine), plant: IN(PAL.forestLight), screen: GLOW(PAL.glass, 0.9),
    glow: GLOW(PAL.orange, 1), red: GLOW(PAL.red, 0.7), water: GLOW(PAL.water, 0.4), sand: IN(PAL.sand), shop: IN(PAL.granite)
  };
  // alias : une seule teinte par rôle (moins de matériaux = moins d'appels de dessin)
  KI.ceil = KI.wall; KI.floor = KI.shop; KI.light = KI.white; KI.pot = KI.red; KI.green = KI.screen; KI.dark = K.black; KI.steel = K.steelDark; KI.bars = K.steelDark;
  const tole = T.mat('tole', 4, 2, PAL.cladding), toleRoof = T.mat('tole', 4, 3, PAL.steelDark);

  /* =================== Primitives =================== */
  /** boîte simple (mesh à fusionner) */
  const b = (par, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = o.receiveShadow = true; par.add(o); return o; };
  /** boîte chanfreinée « jouet » (pour les objets en vue) */
  const rb = (par, w, h, d, m, x, y, z, r) => ST.box(w, h, d, m, x, y, z, par, r);
  const cy = (par, rt, rbt, h, m, x, y, z, seg) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rbt, h, seg || 8), m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; par.add(o); return o; };
  const grp = (par, x, y, z, ry) => { const o = new THREE.Group(); o.position.set(x || 0, y || 0, z || 0); o.rotation.y = ry || 0; par.add(o); return o; };
  const gcache = {};
  /** prisme triangulaire : faîtage le long de x (longueur w), base de largeur d à y=0, sommet à y=rh */
  function prismGeo(w, d, rh) {
    const k = [w, d, rh].map(v => v.toFixed(2)).join('_'); if (gcache[k]) return gcache[k];
    const x = w / 2, z = d / 2, p = [];
    p.push(x, 0, z, x, 0, -z, x, rh, 0, -x, 0, -z, -x, 0, z, -x, rh, 0);              // pignons
    p.push(-x, 0, z, x, 0, z, x, rh, 0, -x, 0, z, x, rh, 0, -x, rh, 0);                 // pan avant
    p.push(x, 0, -z, -x, 0, -z, -x, rh, 0, x, 0, -z, -x, rh, 0, x, rh, 0);              // pan arrière
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    return (gcache[k] = g);
  }
  /** toit à deux pans : faîtage le long de x local (rotY pour tourner), pignons remplis avec gableM */
  function gable(par, L, S, rh, y, roofM, gableM, oh, x, z, rotY) {
    const s = grp(par, x || 0, y, z || 0, rotY || 0);
    if (gableM) { const pm = new THREE.Mesh(prismGeo(L, S, rh), gableM); pm.castShadow = pm.receiveShadow = true; s.add(pm); }
    const a = Math.atan2(rh, S / 2), len = Math.hypot(S / 2, rh) + oh, th = 0.32;
    for (const sg of [1, -1]) {
      const m = b(s, L + oh * 2, th, len, roofM, 0, rh - (len / 2) * Math.sin(a) + Math.cos(a) * th / 2, sg * ((len / 2) * Math.cos(a) + Math.sin(a) * th / 2));
      m.rotation.x = sg * a;
    }
    b(s, L + oh * 2, 0.28, 0.45, roofM, 0, rh + 0.2, 0);                      // faîtière
    return s;
  }
  /** façade : groupe placé sur une face d'une boîte w×d centrée en (cx, cz), +z local = vers l'extérieur */
  function face(par, side, w, d, cx, cz) {
    cx = cx || 0; cz = cz || 0;
    if (side === 'f') return grp(par, cx, 0, cz + d / 2, 0);
    if (side === 'b') return grp(par, cx, 0, cz - d / 2, PI);
    if (side === 'r') return grp(par, cx + w / 2, 0, cz, PI / 2);
    return grp(par, cx - w / 2, 0, cz, -PI / 2);
  }
  /** fenêtre (cadre, vitre, croisillon, appui, volets optionnels) */
  function win(f, x, y, ww, wh, o) {
    o = o || {};
    b(f, ww + 0.28, wh + 0.28, 0.1, o.frame || K.white, x, y, 0.05);
    b(f, ww, wh, 0.06, o.glass || K.glass, x, y, 0.11);
    if (!o.noCross) { b(f, 0.08, wh, 0.05, o.frame || K.white, x, y, 0.15); b(f, ww, 0.08, 0.05, o.frame || K.white, x, y + wh * 0.1, 0.15); }
    if (o.sill) b(f, ww + 0.4, 0.14, 0.32, o.sill, x, y - wh / 2 - 0.2, 0.14);
    if (o.shut) for (const s of [-1, 1]) { const v = b(f, ww / 2 + 0.06, wh + 0.08, 0.08, o.shut, x + s * (ww * 0.75 + 0.2), y, 0.08); v.rotation.y = s * 0.12; }
    if (o.flowers) { b(f, ww + 0.1, 0.25, 0.3, o.flowers, x, y - wh / 2 - 0.05, 0.3); }
  }
  /** porte (encadrement granit + marche) */
  function door(f, x, dw, dh, m, o) {
    o = o || {};
    if (o.frame) b(f, dw + 0.5, dh + 0.3, 0.12, o.frame, x, (dh + 0.3) / 2, 0.04);
    b(f, dw, dh, 0.1, m, x, dh / 2, 0.1);
    b(f, 0.12, 0.12, 0.12, o.frame || K.white, x + dw * 0.32, dh * 0.48, 0.18);   // poignée
    if (o.step) b(f, dw + 0.8, 0.18, 0.7, o.step, x, 0.09, 0.4);
  }
  /** enseignes : plusieurs textes dans UNE texture (1 seul matériau), lignes de 256 px */
  const atlasCache = {};
  function atlas(key, rows) {
    if (atlasCache[key]) return atlasCache[key];
    const n = rows.length, c = document.createElement('canvas'); c.width = 1024; c.height = 256 * n; const x = c.getContext('2d');
    rows.forEach((r, i) => { x.fillStyle = r[4] || '#22262d'; x.fillRect(0, i * 256, 1024, 256); const t = ST.signTex(r[0], r[1], r[2], r[3]); x.drawImage(t.image, 0, i * 256); t.dispose(); });
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    return (atlasCache[key] = { n, mat: ST.toon(0xffffff, 0x1c1c1c, { map: tex, key: 'atlas_' + key }) });
  }
  function signPlane(par, A, i, w, h, x, y, z, ry) {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / A.n);
    const m = new THREE.Mesh(g, A.mat); m.position.set(x, y, z); m.rotation.y = ry || 0; par.add(m); return m;
  }
  /** panneau sur planche : enseigne simple (texte, sous-texte, fond css) — cache par texte */
  function board(par, text, sub, bg, w, h, x, y, z, ry, fg, boardM) {
    const A = atlas('k_' + text + '|' + sub + '|' + bg, [[text, sub, bg, fg || '#fff']]);
    const s = grp(par, x, y, z, ry);
    b(s, w + 0.2, h + 0.2, 0.16, boardM || K.black, 0, 0, -0.06);
    signPlane(s, A, 0, w, h, 0, 0, 0.03);
    return s;
  }
  const hex = ST.hex;

  /* ---------- Petits objets ---------- */
  function chair(par, x, z, ry, m) { const s = grp(par, x, 0, z, ry); b(s, 0.5, 0.08, 0.5, m, 0, 0.48, 0); b(s, 0.5, 0.55, 0.08, m, 0, 0.78, -0.22); b(s, 0.08, 0.45, 0.08, KI.steel, 0, 0.23, 0); b(s, 0.4, 0.04, 0.4, KI.steel, 0, 0.02, 0); return s; }
  function plant(par, x, z, s) { s = s || 1; cy(par, 0.28 * s, 0.22 * s, 0.5 * s, KI.pot, x, 0.25 * s, z, 8); const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 0), KI.plant); l.position.set(x, 0.5 * s + 0.5 * s, z); l.scale.y = 1.4; par.add(l); }
  function coffee(par, x, z, ry) { const s = grp(par, x, 0, z, ry); rb(s, 0.7, 1.7, 0.6, KI.dark, 0, 0.85, 0, 0.06); b(s, 0.5, 0.35, 0.04, KI.screen, 0, 1.3, 0.31); b(s, 0.12, 0.12, 0.04, KI.red, 0.2, 1.0, 0.31); b(s, 0.4, 0.3, 0.3, KI.steel, 0, 0.6, 0.3); cy(s, 0.06, 0.05, 0.12, KI.white, 0, 0.82, 0.32, 6); }
  function desk(par, x, z, ry, w, screen) {
    const s = grp(par, x, 0, z, ry); w = w || 1.6;
    b(s, w, 0.08, 0.8, KI.wood, 0, 0.76, 0); b(s, 0.06, 0.72, 0.7, KI.steel, -w / 2 + 0.06, 0.36, 0); b(s, 0.06, 0.72, 0.7, KI.steel, w / 2 - 0.06, 0.36, 0);
    if (screen !== false) { b(s, 0.7, 0.45, 0.05, KI.dark, 0, 1.15, -0.2); b(s, 0.62, 0.37, 0.02, KI.screen, 0, 1.15, -0.17); b(s, 0.08, 0.2, 0.08, KI.dark, 0, 0.88, -0.22); }
    return s;
  }
  function machine(par, x, z, ry, s, accent) {
    const o = grp(par, x, 0, z, ry); s = s || 1;
    b(o, 3 * s, 0.3, 2 * s, KI.dark, 0, 0.15, 0);
    rb(o, 2.8 * s, 2.1 * s, 1.9 * s, KI.machine, 0, 0.3 + 1.05 * s, 0, 0.12);
    b(o, 1.3 * s, 1.0 * s, 0.06, KI.screen, -0.4 * s, 1.5 * s, 0.97 * s);              // hublot
    b(o, 0.5, 0.7, 0.3, accent || KI.dark, 1.1 * s, 1.6 * s, 1.0 * s);                  // pupitre
    cy(o, 0.06, 0.06, 0.6, KI.steel, 1.2 * s, 2.7 * s, -0.6 * s, 6); b(o, 0.16, 0.16, 0.16, KI.green, 1.2 * s, 3.05 * s, -0.6 * s);
    return o;
  }
  function shelf(par, x, z, ry, len, h, boxM) {
    const s = grp(par, x, 0, z, ry);
    for (const xx of [-len / 2, len / 2]) b(s, 0.1, h, 0.8, KI.steel, xx, h / 2, 0);
    for (let y = 0.4; y < h; y += 1.1) { b(s, len, 0.06, 0.8, KI.steel, 0, y, 0); if (boxM) for (let k = -len / 2 + 0.5; k < len / 2 - 0.3; k += 0.9) b(s, 0.7, 0.5, 0.6, boxM, k, y + 0.28, 0); }
    return s;
  }
  function pallet(par, x, z, m) { b(par, 1.2, 0.15, 1.0, KI.wood, x, 0.08, z); if (m) rb(par, 1.0, 0.8, 0.8, m, x, 0.56, z, 0.06); }
  function cat(par, x, y, z, ry) { const s = grp(par, x, y, z, ry); b(s, 0.55, 0.28, 0.25, K.shut[3], 0, 0.14, 0); b(s, 0.26, 0.24, 0.24, K.shut[3], 0.32, 0.3, 0); for (const e of [-0.07, 0.07]) b(s, 0.06, 0.1, 0.06, K.shut[3], 0.36, 0.46, e); const q = b(s, 0.06, 0.45, 0.06, K.shut[3], -0.3, 0.32, 0); q.rotation.z = 0.5; }
  function gnome(par, x, z, ry) { const s = grp(par, x, 0, z, ry); cy(s, 0.16, 0.2, 0.35, K.shut[0], 0, 0.18, 0, 6); b(s, 0.22, 0.2, 0.2, K.plaster[2], 0, 0.45, 0); b(s, 0.2, 0.18, 0.06, K.white, 0, 0.38, 0.1); cy(s, 0, 0.15, 0.4, K.shut[2], 0, 0.75, 0, 6); }

  /* =========================================================================
     1) ENTREPRISES (ouvertes, avec accueil et personnel)
     ========================================================================= */
  const FUNNY = {
    boulangerie: ['Croissant du jour : le même qu\'hier', 'Baguette tradition — tolérance ±2 cm'],
    station: ['Gazole : prix sur demande (asseyez-vous)', 'Toilettes : clé chez Dédé (bon courage)'],
    aciers: ['Barres en stock : toutes sauf la bonne', 'Débit à la scie : 1 mm près, 2 mm loin'],
    outipro: ['Fraises · Forets · Excuses', 'Plaquette cassée = plaquette vendue'],
    fonderie: ['INTERDIT AUX PELLES', 'Ici, c\'est chaud. Vraiment.'],
    chaudro: ['On soude, on ne boude pas', 'Masque obligatoire (même pour sourire)'],
    tth: ['Trempe à l\'huile, pas à la sauce', 'Four à 860 °C — ne pas y mettre la pizza'],
    aerotech: ['Tolérance zéro (comme le café)', 'Objectif 0 défaut… sauf le lundi'],
    agrimeca: ['Pièces de tracteur & bottes en caoutchouc', 'Réunion qualité : jeudi, à la ferme'],
    novatics: ['Start-up en croissance (de stress)', 'Babyfoot réservé aux managers'],
    ublo: ['Ublo — on adore le Ra 0,4', 'Ici on mesure deux fois, on râle une fois'],
    usiflash: ['Usinage en 24 h (ou 48 h) (ou jamais)', 'Ceci n\'est PAS un plan volé'],
    police: ['Accueil : sonnez fort (sieste en cours)', 'Cellule de dégrisement — Wi-Fi : non'],
    casse: ['⚠ CHIEN MÉCHANT ⚠', 'Pièces d\'occasion — garanti 3 minutes']
  };
  const SKINS = [0xf0c8a0, 0xe2b48c, 0xc68642, 0x8d5524, 0xf3cba5];
  const HAIRS = [PAL.woodDark, PAL.black, PAL.sand, PAL.trunk];
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

  /** personnage décoratif posé (fusionné avec le bâtiment ; pas d'étiquette) */
  function staff(par, look, opts, x, z, yaw, pose, col) {
    if (!ML.People || !ML.People.build) return null;
    try {
      const o = ML.People.build(look, opts || {});
      for (const sp of [o.label, o.bubble, o.emo]) if (sp && sp.parent) { sp.parent.remove(sp); if (sp.material) { if (sp.material.map) sp.material.map.dispose(); sp.material.dispose(); } }
      if (o.group.parent) o.group.parent.remove(o.group);
      o.group.position.set(x, 0, z); o.group.rotation.set(0, yaw, 0);
      if (o.armL && o.armR) {
        if (pose === 'wave') { o.armR.rotation.z = -2.5; }
        else if (pose === 'desk') { o.armL.rotation.x = o.armR.rotation.x = -1.0; }
        else if (pose === 'phone') { o.armR.rotation.x = -2.3; o.armR.rotation.z = 0.5; }
        else if (pose === 'hips') { o.armL.rotation.z = 0.6; o.armR.rotation.z = -0.6; }
      }
      o.group.userData.staff = true; par.add(o.group);
      if (col) col(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 'staff');
      return o.group;
    } catch (e) { console.warn('staff', e); return null; }
  }
  /** le personnel reprend les couleurs déjà présentes dans le bâtiment (sauf la peau) → peu d'appels de dessin */
  function quantizeStaff(g) {
    const allowed = new Set(), staffMeshes = [];
    const walk = (o, inStaff) => { for (const c of o.children) { const s = inStaff || c.userData.staff; if (c.isMesh && !Array.isArray(c.material)) { if (s) staffMeshes.push(c); else if (!c.material.map && c.material.color) allowed.add(c.material); } walk(c, s); } };
    walk(g, false);
    const list = [...allowed], skins = {};
    for (const m of staffMeshes) {
      const mt = m.material; if (allowed.has(mt) || !mt.color || mt.map) continue;
      const hx = mt.color.getHex();
      if (SKINS.includes(hx)) { skins[hx] = skins[hx] || mt; m.material = skins[hx]; continue; }
      let best = null, bd = 1e9;
      for (const a of list) { const dc = (a.color.r - mt.color.r) ** 2 + (a.color.g - mt.color.g) ** 2 + (a.color.b - mt.color.b) ** 2 + (a.emissive && a.emissive.getHex() ? 0.02 : 0); if (dc < bd) { bd = dc; best = a; } }
      if (best) m.material = best;
    }
  }

  W.company = (key, C, P) => {
    const root = W.root;
    const y0 = (ML.Terrain && ML.Terrain.h) ? ML.Terrain.h(P.x, P.z) || 0 : 0;
    const rng = U.rng(hashStr(key) ^ 0x9e3779b9), pick = a => a[Math.floor(rng() * a.length)];
    const ang = P.rot * PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const toW = (lx, lz) => ({ x: P.x + lx * ca + lz * sa, z: P.z - lx * sa + lz * ca });
    /** collision locale (rectangle x1..x2, z1..z2 dans le repère du bâtiment) → monde */
    const col = (x1, z1, x2, z2, tag) => { const p = toW(x1, z1), q = toW(x2, z2); return U.addCollider(Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.z, q.z), Math.max(p.z, q.z), tag || 'building'); };
    let g = new THREE.Group(); g.position.set(P.x, y0, P.z); g.rotation.y = ang;
    const w = C.w, d = C.d, kind = C.kind, open = kind === 'casse';
    const hw = open ? 2.8 : C.h, t = 0.4;
    const ind = ['matiere', 'outils', 'fonderie', 'chaudro', 'tth', 'concurrent'].includes(kind);
    const wallM = { tole: T.mat('tole', C.w / 3, 2, C.color), brique: T.mat('brique', C.w / 5, C.h / 4, C.color), beton: T.mat('beton', C.w / 5, C.h / 4, C.color) }[C.wall] || M(C.color);
    const roofM = M(C.roof), accent = M(C.roof), trim = K.black;
    const fun = FUNNY[key] || FUNNY[kind] || ['Bienvenue', 'Merci de votre visite'];
    const bgCss = hex(C.roof);
    const A = atlas('comp_' + key, [[C.name, C.sub || '', bgCss, '#fff'], [fun[0], '', kind === 'casse' ? '#c0392b' : '#fbf8f1', kind === 'casse' ? '#fff' : '#22262d'], [fun[1], '', bgCss, '#fff'], [C.name.split(' ')[0].toUpperCase(), 'Bienvenue !', '#fbf8f1', bgCss]]);
    ML.mapRects.push({ x: P.x, z: P.z, w: P.hx * 2, d: P.hz * 2, c: '#' + new THREE.Color(C.roof).getHexString(), name: C.name.split(' ')[0] === 'Boulangerie' ? 'Boulangerie' : C.name.split(' ')[0], comp: key });

    /* ---- géométrie de la porte et de l'accueil ---- */
    const dw = 3, dh = Math.min(3.2, hw - 0.5), xd = -w / 2 + (w >= 18 ? 4 : 2.6);
    P.door = Object.assign(toW(xd, d / 2), { w: dw });                         // porte d'entrée (monde)
    const Lz = open ? d : U.clamp(d * 0.42, 5, 7), zp = d / 2 - Lz;              // cloison accueil / fond
    const px = w / 2 - 2.2, pw = 2.4;                                           // passage dans la cloison
    const zIn = -d / 2 + t, xIn = w / 2 - t;

    /* ---- murs (extérieur texturé + doublage intérieur clair) + collisions ---- */
    const lin = open ? null : KI.wall;
    function wallX(x1, x2, z, h, y, inward, collide) {                         // mur le long de x
      const L = x2 - x1; if (L <= 0.01) return;
      b(g, L, h, t, wallM, (x1 + x2) / 2, y + h / 2, z);
      if (lin) b(g, L, h, 0.05, lin, (x1 + x2) / 2, y + h / 2, z + inward * (t / 2 + 0.03));
      if (collide) col(x1, z - t / 2, x2, z + t / 2, 'wall');
    }
    function wallZ(z1, z2, x, h, inward) {
      b(g, t, h, z2 - z1, wallM, x, h / 2, (z1 + z2) / 2);
      if (lin) b(g, 0.05, h, z2 - z1, lin, x + inward * (t / 2 + 0.03), h / 2, (z1 + z2) / 2);
      col(x - t / 2, z1, x + t / 2, z2, 'wall');
    }
    const zf = d / 2 - t / 2;
    wallX(-w / 2, xd - dw / 2, zf, hw, 0, -1, true); wallX(xd + dw / 2, w / 2, zf, hw, 0, -1, true);
    wallX(xd - dw / 2, xd + dw / 2, zf, hw - dh, dh, -1, false);                  // linteau
    wallX(-w / 2, w / 2, -d / 2 + t / 2, hw, 0, 1, true);
    wallZ(-d / 2, d / 2, -w / 2 + t / 2, hw, 1); wallZ(-d / 2, d / 2, w / 2 - t / 2, hw, -1);
    // sol intérieur
    b(g, w - t * 2, 0.08, d - t * 2, open ? K.granite[1] : KI.floor, 0, 0.04, 0);
    // encadrement de la porte (couleur de la marque) + paillasson
    b(g, 0.3, dh + 0.3, t + 0.2, accent, xd - dw / 2 - 0.15, (dh + 0.3) / 2, zf); b(g, 0.3, dh + 0.3, t + 0.2, accent, xd + dw / 2 + 0.15, (dh + 0.3) / 2, zf);
    b(g, dw + 0.6, 0.3, t + 0.2, accent, xd, dh + 0.15, zf);
    b(g, dw - 0.4, 0.04, 1.2, accent, xd, 0.09, d / 2 - 1.2);
    // fenêtres traversantes (visibles dedans et dehors)
    const winBand = (x1, x2, y, wh, z, axis) => {
      for (let x = x1; x <= x2 + 0.01; x += 3) {
        if (axis === 'x') { b(g, 2.2, wh, t + 0.16, K.glass, x, y, z); b(g, 2.5, 0.16, t + 0.3, trim, x, y - wh / 2 - 0.08, z); }
        else { b(g, t + 0.16, wh, 2.2, K.glass, z, y, x); b(g, t + 0.3, 0.16, 2.5, trim, z, y - wh / 2 - 0.08, x); }
      }
    };
    if (!open) {
      const yW = Math.min(1.9, hw * 0.4), wH = 1.6;
      const fx1 = xd + dw / 2 + 2, fx2 = (ind && w >= 18 ? w / 2 - 7.5 : w / 2 - 1.8);
      if (fx2 > fx1) winBand(fx1, fx2, yW, wH, zf, 'x');
      winBand(-d / 2 + 2.5, d / 2 - 2.5, yW, wH, -w / 2 + t / 2, 'z'); winBand(-d / 2 + 2.5, d / 2 - 2.5, yW, wH, w / 2 - t / 2, 'z');
      if (hw >= 8.5) { winBand(-w / 2 + 2, w / 2 - 2, hw - 2.4, 1.4, zf, 'x'); winBand(-w / 2 + 2, w / 2 - 2, hw - 2.4, 1.4, -d / 2 + t / 2, 'x'); }
      // panneaux vitrés de part et d'autre de la porte
      for (const s of [-1, 1]) if (xd + s * (dw / 2 + 0.75) > -w / 2 + 0.6) b(g, 0.9, dh - 0.3, t + 0.14, K.glass, xd + s * (dw / 2 + 0.95), (dh - 0.3) / 2 + 0.15, zf);
      if (ind && w >= 18) {                                                     // porte sectionnelle (fermée)
        const rw = 5, rh = Math.min(4.6, hw - 1.2), rx = w / 2 - 4.2;
        b(g, rw, rh, 0.14, K.steelDark, rx, rh / 2, d / 2 + 0.04);
        for (let y = 0.6; y < rh; y += 0.6) b(g, rw, 0.06, 0.06, KI.machine, rx, y, d / 2 + 0.12);
        b(g, rw + 0.5, 0.5, 0.5, accent, rx, rh + 0.25, d / 2 + 0.15);
      }
    }

    /* ---- toit + plafond ---- */
    if (!open) {
      b(g, w - t * 2, 0.1, d - t * 2, KI.ceil, 0, hw - 0.05, 0);
      for (let x = -w / 2 + 2.5; x < w / 2 - 1; x += 4) for (let z = -d / 2 + 2.5; z < d / 2 - 1; z += 4) b(g, 1.4, 0.06, 0.5, KI.light, x, hw - 0.13, z);
      if (ind) { gable(g, w + 0.2, d + 0.2, Math.min(3, d * 0.18), hw, roofM, wallM, 0.5, 0, 0, 0); }
      else {
        b(g, w + 0.3, 0.3, d + 0.3, K.steelDark, 0, hw + 0.15, 0);
        for (const s of [-1, 1]) { b(g, w + 0.5, 0.7, 0.3, roofM, 0, hw + 0.35, s * (d / 2 + 0.05)); b(g, 0.3, 0.7, d + 0.5, roofM, s * (w / 2 + 0.05), hw + 0.35, 0); }
        rb(g, 2.4, 1.2, 1.6, KI.machine, -w / 4, hw + 0.9, -d / 5, 0.1); rb(g, 1.6, 1.0, 1.6, KI.machine, w / 5, hw + 0.8, -d / 4, 0.1);   // climatiseurs
      }
    }
    /* ---- grande enseigne sur le toit, côté rue ---- */
    const sw = Math.min(w * 0.8, 18), signY = open ? hw + 2.2 : hw + (ind ? 1.2 : 1.7) + 0.3;
    b(g, sw + 0.4, 2.9, 0.3, trim, 0, signY, d / 2 - 0.45);
    signPlane(g, A, 0, sw, sw / 4 > 2.6 ? 2.6 : sw / 4, 0, signY, d / 2 - 0.28);
    for (const s of [-1, 1]) b(g, 0.2, signY, 0.2, trim, s * sw * 0.35, signY / 2, d / 2 - 0.7);
    // plaque rigolote à côté de la porte
    { const pl = grp(g, -w / 2 + 1.1, 0, d / 2 + 0.9, 0.25);                     // panneau sur pieds, à gauche de la porte
      for (const sx of [-0.75, 0.75]) b(pl, 0.1, 1.9, 0.1, trim, sx, 0.95, -0.05);
      b(pl, 2.0, 0.55, 0.08, trim, 0, 1.6, -0.06); signPlane(pl, A, 1, 1.9, 0.48, 0, 1.6, 0); }
    // quai
    const dock = U.plane(12, 3.6, T.mat('quai', 3, 1), 0, 0, 0.05, g); dock.position.set(-1, 0.05, d / 2 + 1.9);

    /* ---- personnel ---- */
    const people = [];
    const skin = pick(SKINS), look = (shirt, extra) => Object.assign({ skin, shirt, pants: PAL.machineDark, hair: pick(HAIRS), height: 1.62 + rng() * 0.3, longHair: rng() < 0.4, glasses: rng() < 0.3 }, extra || {});

    /* ---- ACCUEIL ---- */
    if (!open) {
      // cloison avec passage
      const zc = zp, ph = hw - 0.1;
      b(g, (px - pw / 2) - (-w / 2 + t), ph, 0.25, KI.wall, ((px - pw / 2) + (-w / 2 + t)) / 2, ph / 2, zc);
      col(-w / 2 + t, zc - 0.13, px - pw / 2, zc + 0.13, 'wall');
      if (xIn > px + pw / 2) { b(g, xIn - (px + pw / 2), ph, 0.25, KI.wall, (xIn + px + pw / 2) / 2, ph / 2, zc); col(px + pw / 2, zc - 0.13, xIn, zc + 0.13, 'wall'); }
      b(g, pw, ph - 2.6, 0.25, KI.wall, px, 2.6 + (ph - 2.6) / 2, zc);
      // banque d'accueil
      const dx = U.clamp(xd + 4.2, -w / 2 + 3, px - 3), dz = zp + 1.7;
      const shop = kind === 'boulangerie' || kind === 'station';
      rb(g, 3.4, 1.1, 0.9, accent, dx, 0.55, dz, 0.1); b(g, 3.6, 0.08, 1.1, KI.wood, dx, 1.14, dz);
      rb(g, 0.9, 1.1, 1.6, accent, dx + 2.15, 0.55, dz - 0.35, 0.1);
      col(dx - 1.75, dz - 0.5, dx + 2.6, dz + 0.5, 'desk'); col(dx + 1.7, dz - 1.2, dx + 2.6, dz + 0.5, 'desk');
      const mon = grp(g, dx - 1.25, 1.33, dz - 0.1, 0.5); b(mon, 0.5, 0.35, 0.05, KI.dark, 0, 0, 0); b(mon, 0.44, 0.3, 0.02, KI.screen, 0, 0, 0.03);
      b(g, 0.25, 0.2, 0.25, KI.red, dx + 0.8, 1.28, dz);                              // sonnette « dring »
      if (shop) for (let k = 0; k < 5; k++) { const bg = cy(g, 0.07, 0.07, 0.9, KI.sand, dx - 1.2 + k * 0.5, 1.28, dz + 0.2, 6); bg.rotation.z = PI / 2 + (k - 2) * 0.1; }
      // mur logo derrière l'accueil
      b(g, 3.9, 1.3, 0.06, accent, dx, Math.min(2.6, hw - 1.2), zp + 0.16);
      signPlane(g, A, 3, 3.6, 0.9, dx, Math.min(2.6, hw - 1.2), zp + 0.2);
      // attente : chaises, table basse, plante, café, affiche
      for (let k = 0; k < 3; k++) { const z = zp + 1.1 + k * 0.75; if (z < d / 2 - 1.4) chair(g, -w / 2 + 0.8, z, PI / 2, KI.red); }
      b(g, 0.7, 0.4, 1.2, KI.wood, -w / 2 + 1.8, 0.2, zp + 1.9); col(-w / 2 + t, zp + 0.7, -w / 2 + 2.2, zp + 2.6, 'chairs');
      plant(g, -w / 2 + 0.9, zp + 0.55); plant(g, px - pw / 2 - 0.6, zp + 0.55, 0.8);
      coffee(g, xIn - 0.45, d / 2 - 1.3, -PI / 2); col(xIn - 0.8, d / 2 - 1.7, xIn, d / 2 - 0.9, 'coffee');
      signPlane(g, A, 2, 2.4, 0.6, xIn - 0.06, Math.min(2.4, hw - 0.8), d / 2 - 3, -PI / 2);
      people.push(staff(g, look(C.roof, kind === 'boulangerie' ? { apron: PAL.white } : null), {}, dx, zp + 0.8, 0, rng() < 0.5 ? 'phone' : 'desk', col));
    }

    /* ---- FOND : atelier / bureaux selon le métier ---- */
    const zb = (zp + zIn) / 2, Db = zp - zIn, xL = -w / 2 + t, xR = xIn;
    const worker = (x, z, yaw, pose, extra, opts) => people.push(staff(g, look(extra && extra.shirt || PAL.lebecBlue, extra), opts || { helmet: PAL.lebecYellow }, x, z, yaw, pose, col));
    if (ind) {
      // machines / postes le long du mur du fond, allée au centre
      const nM = Math.max(1, Math.floor((w - 6) / 5.5));
      for (let i = 0; i < nM; i++) {
        const x = xL + 3 + i * 5.5; if (x > xR - 2.5) break;
        if (kind === 'fonderie' && i === 0) {                                    // four de fusion + creuset rougeoyant
          rb(g, 3, 2.4, 2.6, KI.steel, x, 1.2, zIn + 1.8, 0.2); cy(g, 0.9, 0.9, 0.2, KI.glow, x, 2.45, zIn + 1.8, 10);
          cy(g, 0.45, 0.35, 0.7, KI.glow, x + 2.2, 0.35, zIn + 2.6, 8);
        } else if (kind === 'tth' && i === 0) {                                  // four + bac de trempe
          rb(g, 3.2, 3, 2.4, KI.dark, x, 1.5, zIn + 1.6, 0.15); b(g, 2, 0.25, 0.05, KI.glow, x, 1.6, zIn + 2.82);
          b(g, 2.4, 1, 1.6, KI.steel, x + 3, 0.5, zIn + 1.4); b(g, 2.2, 0.05, 1.4, KI.water, x + 3, 1.0, zIn + 1.4);
        } else if (kind === 'chaudro') {                                         // table de soudure + rideau rouge
          b(g, 2.4, 0.9, 1.4, KI.steel, x, 0.45, zIn + 2); b(g, 3, 2, 0.06, KI.red, x, 1.1, zIn + 3.2);
          b(g, 0.2, 0.2, 0.2, GLOW(PAL.foam, 1), x + 0.3, 1.05, zIn + 2);
        } else if (kind === 'matiere') {                                         // râteliers de barres
          shelf(g, x, zIn + 1.2, 0, 4, 2.6, null);
          for (let k = 0; k < 6; k++) { const bar = cy(g, 0.12, 0.12, 4, [KI.steel, KI.machine, KI.white][k % 3], x, 0.6 + Math.floor(k / 3) * 1.1, zIn + 1.0 + (k % 3) * 0.2, 6); bar.rotation.z = PI / 2; }
        } else if (kind === 'outils') shelf(g, x, zIn + 1.2, 0, 4, 2.6, M(PAL.shutterBlue));
        else machine(g, x, zIn + 1.8, 0, 1, accent);
        col(x - 2, zIn, x + 2, zIn + 3.2, 'machine');
      }
      // établi + palettes près de la cloison
      if (Db > 6) { const bx = px - 4.5; b(g, 3, 0.9, 1, KI.wood, bx, 0.45, zp - 1.0); b(g, 0.5, 0.3, 0.4, accent, bx - 0.8, 1.05, zp - 1.0); col(bx - 1.5, zp - 1.5, bx + 1.5, zp - 0.5, 'bench'); }
      pallet(g, xL + 1.3, zp - 1.4, accent); pallet(g, xL + 1.3, zp - 2.8, KI.machine);
      col(xL, zp - 3.4, xL + 2, zp - 0.8, 'pallet');
      // pont roulant jaune
      b(g, 0.4, 0.5, Db, K.yellow, -w / 6, hw - 0.6, zb); b(g, 0.4, 0.5, Db, K.yellow, w / 6, hw - 0.6, zb);
      b(g, w - t * 2, 0.02, Db, KI.shop, 0, 0.09, zb);                              // sol d'atelier gris
      for (const x of [-w / 6 - 1.6, w / 6 + 1.6]) b(g, 0.15, 0.02, Db - 0.6, K.yellow, x, 0.11, zb);   // allée peinte b(g, w / 3 + 0.4, 0.6, 0.6, K.yellow, 0, hw - 0.9, zb);
      if (kind === 'concurrent') {                                               // l'antre louche d'UsiFlash
        for (let k = 0; k < 3; k++) rb(g, 1.2, 0.9, 1, KI.wood, xR - 1.4, 0.45 + k * 0.9, zIn + 1.5 - k * 0.05, 0.05);
        signPlane(g, A, 2, 2.6, 0.65, xR - 1.4, 3.3, zIn + 2.05);
        worker(0, zb + 0.5, PI * 0.8, 'hips', { shirt: PAL.black, glasses: true }, {});
      } else worker(-w / 6 + 1.2, zb + 0.4, 0.4, 'hips', { shirt: kind === 'fonderie' ? PAL.woodDark : PAL.lebecBlue });
    } else if (kind === 'client') {
      // open space : îlots de bureaux, salle de réunion vitrée
      for (let x = xL + 2; x < xR - 5; x += 3.6) for (let z = zIn + 1.6; z < zp - 1.2; z += 2.8) {
        desk(g, x, z, 0); desk(g, x, z + 0.85, PI); chair(g, x, z - 0.75, 0, accent); chair(g, x, z + 1.6, PI, accent);
        col(x - 0.85, z - 0.45, x + 0.85, z + 1.3, 'desk');
      }
      const mx = xR - 2.4;                                                        // salle de réunion
      b(g, 0.1, 2.6, Math.min(4, Db - 1.5), K.glass, mx - 2.2, 1.3, zIn + Math.min(4, Db - 1.5) / 2);
      b(g, 2.4, 0.08, 1.2, KI.wood, mx, 0.76, zIn + 1.8); b(g, 0.1, 0.7, 0.1, KI.steel, mx, 0.38, zIn + 1.8);
      b(g, 0.06, 1.2, 2, KI.white, xR - 0.06, 1.8, zIn + 1.8);
      col(mx - 2.25, zIn, mx - 2.15, zIn + Math.min(4, Db - 1.5), 'glass'); col(mx - 1.2, zIn + 1.2, mx + 1.2, zIn + 2.4, 'table');
      if (key === 'novatics') { b(g, 1.4, 0.9, 0.8, KI.wood, xR - 2, 0.45, zp - 1.4); for (let k = 0; k < 4; k++) b(g, 0.04, 0.04, 1.2, KI.steel, xR - 2.5 + k * 0.33, 0.8, zp - 1.4); col(xR - 2.8, zp - 1.9, xR - 1.2, zp - 0.9, 'babyfoot'); }
      if (key === 'agrimeca') { const wh = cy(g, 1.3, 1.3, 0.6, KI.dark, xR - 1.2, 1.3, zp - 1.6, 12); wh.rotation.x = PI / 2; wh.rotation.z = PI / 2; }
      if (key === 'aerotech') { const pl = grp(g, 0, hw - 1.8, zb, 0.3); b(pl, 3, 0.4, 0.4, KI.white, 0, 0, 0); b(pl, 0.5, 0.06, 3, KI.white, 0, 0, 0); b(pl, 0.06, 0.6, 0.3, accent, -1.4, 0.3, 0); }
      worker(xL + 2, zIn + 0.85, 0, 'desk', { shirt: PAL.white, tie: C.roof }, {});
      worker(mx, zIn + 3.0, PI, 'wave', { shirt: C.roof }, {});
    } else if (kind === 'boulangerie') {
      rb(g, 3, 2.2, 2, KI.pot, xL + 2.2, 1.1, zIn + 1.3, 0.3); b(g, 1.4, 0.6, 0.05, KI.glow, xL + 2.2, 1.1, zIn + 2.32);   // four à pain
      col(xL, zIn, xL + 3.8, zIn + 2.4, 'four');
      for (let k = 0; k < 3; k++) rb(g, 0.8, 0.9, 0.6, KI.white, xR - 1 - k * 0.9, 0.45, zIn + 0.6, 0.12);           // sacs de farine
      col(xR - 3.2, zIn, xR, zIn + 1, 'farine');
      worker(0.5, zb, 0.3, 'hips', { shirt: PAL.white, apron: PAL.white }, {});
    } else if (kind === 'station') {
      shelf(g, xL + 2.2, zIn + 0.8, 0, 3.4, 2.2, KI.red); col(xL + 0.4, zIn, xL + 4, zIn + 1.3, 'shelf');
      for (let k = 0; k < 4; k++) rb(g, 0.4, 0.55, 0.25, KI.red, xR - 0.5 - k * 0.5, 0.28, zIn + 0.4, 0.05);                 // jerricans
      shelf(g, -w / 2 + 3, zp + 3.2, PI / 2, 2, 1.6, KI.green);
    } else if (kind === 'police') {
      /* ---- CELLULE : coin arrière gauche, barreaux, porte qui s'ouvre ---- */
      const cx1 = xL, cx2 = Math.min(xL + 4.2, px - pw / 2 - 1.5), cz1 = zIn, cz2 = Math.min(zIn + 4, zp - 1.2);
      const doorX1 = cx2 - 1.6, doorX2 = cx2 - 0.4;                               // ouverture de 1,2 m dans la grille avant
      const bars = (x1, z1, x2, z2) => { const L = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(L / 0.28); for (let k = 0; k <= n; k++) { const f = k / Math.max(n, 1); b(g, 0.07, 2.8, 0.07, KI.bars, x1 + (x2 - x1) * f, 1.4, z1 + (z2 - z1) * f); } b(g, Math.abs(x2 - x1) + 0.12, 0.12, Math.abs(z2 - z1) + 0.12, KI.bars, (x1 + x2) / 2, 2.8, (z1 + z2) / 2); b(g, Math.abs(x2 - x1) + 0.12, 0.1, Math.abs(z2 - z1) + 0.12, KI.bars, (x1 + x2) / 2, 0.1, (z1 + z2) / 2); };
      bars(cx1, cz2, doorX1, cz2); bars(doorX2, cz2, cx2, cz2); bars(cx2, cz1, cx2, cz2);
      col(cx1, cz2 - 0.08, doorX1, cz2 + 0.08, 'bars'); col(doorX2, cz2 - 0.08, cx2, cz2 + 0.08, 'bars'); col(cx2 - 0.08, cz1, cx2 + 0.08, cz2, 'bars');
      b(g, 1.9, 0.45, 0.8, KI.wood, cx1 + 1.05, 0.25, cz1 + 0.5); b(g, 1.8, 0.12, 0.7, KI.white, cx1 + 1.05, 0.53, cz1 + 0.5);   // couchette
      rb(g, 0.45, 0.5, 0.5, KI.white, cx2 - 0.5, 0.25, cz1 + 0.4, 0.1);                                                          // toilettes inox (enfin, blanches)
      signPlane(g, A, 2, 2.4, 0.6, (cx1 + cx2) / 2, 2.2, cz1 + 0.05);
      // porte (pivote sur la charnière à doorX2) : groupe à part, fusionné seul
      const dg = new THREE.Group(); dg.position.set(doorX2, 0, cz2);
      const dL = doorX2 - doorX1; for (let k = 0; k <= 4; k++) b(dg, 0.07, 2.7, 0.07, KI.bars, -dL * k / 4, 1.4, 0); b(dg, dL, 0.1, 0.1, KI.bars, -dL / 2, 2.7, 0); b(dg, dL, 0.1, 0.1, KI.bars, -dL / 2, 0.15, 0); b(dg, 0.12, 0.25, 0.15, accent, -dL + 0.15, 1.3, 0.05);
      const doorMesh = ST.merge(dg); doorMesh.userData.keep = true; g.add(doorMesh);
      const doorCol = col(doorX1, cz2 - 0.08, doorX2, cz2 + 0.08, 'jaildoor'), saved = Object.assign({}, doorCol);
      const jc = toW((cx1 + cx2) / 2, (cz1 + cz2) / 2 - 0.3), jd = toW((doorX1 + doorX2) / 2, cz2 + 1.0);
      ML.LOC.jail = { x: jc.x, z: jc.z, yaw: ang };
      ML.LOC.jailDoor = { x: jd.x, z: jd.z };
      /** ouvre / ferme la porte de la cellule (collision + animation simple) */
      W.jailDoor = open2 => { U.touchColliders(); if (open2) { doorCol.minX = doorCol.maxX = 1e9; doorMesh.rotation.y = -PI * 0.55; } else { Object.assign(doorCol, saved); doorMesh.rotation.y = 0; } };
      W.jailDoorMesh = doorMesh;
      // bureaux des gendarmes
      for (let x = cx2 + 2; x < xR - 1; x += 3) { desk(g, x, zIn + 1.4, 0); chair(g, x, zIn + 0.6, 0, KI.dark); col(x - 0.85, zIn + 0.9, x + 0.85, zIn + 1.9, 'desk'); }
      worker(cx2 + 1.0, cz2 + 1.0, -PI * 0.75, 'hips', { shirt: PAL.lebecBlue, cap: PAL.lebecBlue, mustache: true }, {});
      worker(xR - 2.2, zIn + 0.6, 0, 'desk', { shirt: PAL.lebecBlue, cap: PAL.lebecBlue }, {});
    } else if (open) {
      /* ---- CASSE : cour à ciel ouvert, piles d'épaves, cabane ---- */
      const cols = [KI.red, M(PAL.steelDark), M(PAL.shutterBlue), M(PAL.purple), M(PAL.shutterGreen)];
      for (let p = 0; p < 3; p++) {
        const x = xL + 3.5 + p * 5.5, z = zIn + 3;
        for (let k = 0; k < 3; k++) { const wr = rb(g, 4.2, 1.2, 1.9, cols[(p + k) % cols.length], x + (k - 1) * 0.2, 0.6 + k * 1.2, z, 0.25); wr.rotation.y = (k - 1) * 0.25 + p * 0.3; wr.rotation.z = (k % 2) * 0.08; b(g, 1.6, 0.06, 1.7, K.glass, x + (k - 1) * 0.2, 1.2 + k * 1.2, z).rotation.y = wr.rotation.y; }
        col(x - 2.4, z - 1.6, x + 2.4, z + 1.6, 'epave');
      }
      for (let k = 0; k < 5; k++) { const ti = cy(g, 0.45, 0.45, 0.3, K.black, xR - 1 - (k % 2) * 0.2, 0.15 + k * 0.3, zp + d - 6, 10); ti.rotation.y = k; }
      // cabane du ferrailleur (bloc) avec fenêtre
      const cbx = xR - 3.2, cbz = zIn + 2.2;
      rb(g, 5, 2.6, 3.4, K.cladding, cbx, 1.3, cbz, 0.1); b(g, 5.4, 0.2, 3.8, roofM, cbx, 2.7, cbz); b(g, 1.6, 0.9, 0.06, K.glass, cbx - 0.8, 1.6, cbz + 1.72); b(g, 0.9, 2, 0.06, K.woodDark, cbx + 1.4, 1.0, cbz + 1.72);
      col(cbx - 2.5, cbz - 1.7, cbx + 2.5, cbz + 1.7, 'cabane');
      people.push(staff(g, look(PAL.shutterBlue, { cap: PAL.shutterBlue, mustache: true, width: 1.25 }), {}, cbx - 0.5, cbz + 2.4, 0.2, 'hips', col));
    }
    // les entreprises du fond sans « accueil » particulier : un 3e perso au milieu de l'accueil pour les clients
    if (kind === 'client' && people.length < 3) { /* déjà 3 */ }

    /* ---- identité extérieure par métier ---- */
    switch (kind) {
      case 'matiere': for (let i = 0; i < 6; i++) { const bar = cy(g, 0.15, 0.15, 6, [KI.machine, KI.white, K.steelDark][i % 3], w / 2 + 1.5, 0.2 + Math.floor(i / 3) * 0.32, (i % 3) * 0.35, 6); bar.rotation.x = PI / 2; } break;
      case 'outils': { const m = cy(g, 0.6, 0.6, 3.5, M(PAL.shutterBlue), 0, hw + 3.2, -2, 8); m.rotation.z = 0.3; for (let k = 0; k < 4; k++) { const fl = b(g, 0.15, 3.0, 0.3, K.steelDark, 0, hw + 3.2, -2); fl.rotation.set(0, k * PI / 4, 0.3); } break; }
      case 'fonderie': case 'tth': {
        const chx = w / 2 - 3, chz = -(d / 2 - 3);
        cy(g, 0.9, 1.1, 9, wallM, chx, hw + 3, chz, 10); cy(g, 1.15, 1.15, 0.5, K.black, chx, hw + 7.6, chz, 10);
        cy(g, 0.85, 0.85, 0.3, GLOW(PAL.orange, 1), chx, hw + 7.9, chz, 10);
        break;
      }
      case 'chaudro': for (let i = 0; i < 3; i++) { b(g, 0.15, 2.5, 0.15, K.steelDark, w / 2 + 1 + i * 1.2, 1.25, 0); b(g, 1.3, 0.15, 0.15, K.steelDark, w / 2 + 1.6 + i * 1.2, 2.4, 0); } break;
      case 'client': { b(g, 0.12, 7, 0.12, KI.white, -w / 2 - 2, 3.5, d / 2 + 3); b(g, 2, 1.2, 0.05, accent, -w / 2 - 1, 6.3, d / 2 + 3); break; }
      case 'boulangerie': {
        for (let i = 0; i < 6; i++) b(g, w / 6, 0.12, 1.6, i % 2 ? KI.white : KI.red, -w / 2 + w / 12 + i * w / 6, 3.4, d / 2 + 0.8).rotation.x = 0.35;
        const bag = cy(g, 0.35, 0.35, 5, KI.sand, 0, hw + 1.0, d / 2 - 1.2, 8); bag.rotation.z = PI / 2 + 0.15;   // baguette géante sur le toit
        break;
      }
      case 'station': {
        b(g, w + 6, 0.5, 7, KI.red, 0, 5.2, d / 2 + 3.5); b(g, w + 6.2, 0.3, 7.2, KI.white, 0, 4.85, d / 2 + 3.5);
        for (const x of [-w / 2 - 1, w / 2 + 1]) b(g, 0.4, 5, 0.4, KI.white, x, 2.5, d / 2 + 6);
        for (const x of [-3, 3]) { rb(g, 0.8, 1.6, 0.6, KI.red, x, 0.8, d / 2 + 3.5, 0.08); b(g, 0.6, 0.3, 0.05, GLOW(PAL.plaster, 0.7), x, 1.3, d / 2 + 3.82); cy(g, 0.05, 0.05, 1, K.black, x + 0.45, 0.9, d / 2 + 3.5, 5); }
        const pumpPos = new THREE.Vector3(0, 0, d / 2 + 3.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(new THREE.Vector3(P.x, 0, P.z));
        W.targets.push({ id: 'pump', x: pumpPos.x, y: y0 + 1.2, z: pumpPos.z, r: 4 }); ML.LOC.pump = { x: pumpPos.x, z: pumpPos.z };
        break;
      }
      case 'police': {
        b(g, 0.12, 7, 0.12, KI.white, -w / 2 - 2, 3.5, d / 2 + 3);
        [M(PAL.shutterBlue), KI.white, KI.red].forEach((c, i) => b(g, 0.55, 1.1, 0.05, c, -w / 2 - 1.7 + i * 0.55, 6.3, d / 2 + 3));
        b(g, 1.2, 0.35, 0.6, KI.screen, 0, hw + 0.5, d / 2 - 2);   // gyrophare sur le toit
        break;
      }
      case 'casse': {
        rb(g, 1.4, 1.1, 1.2, K.wood, 2.5, 0.55, d / 2 + 4.5, 0.1); const rf = gable(g, 1.4, 1.2, 0.5, 1.1, K.woodDark, K.wood, 0.15, 2.5, d / 2 + 4.5, 0);
        b(g, 0.6, 0.6, 0.05, K.black, 2.5, 0.45, d / 2 + 5.12);
        const l = U.label('⚠ CHIEN MÉCHANT', { size: 0.5, color: '#ff6b6b' }); l.position.set(-1, 3.2, d / 2 + 4); g.add(l);
        void rf; break;
      }
      case 'concurrent': {
        const z = b(g, 1.5, 2.5, 0.3, GLOW(PAL.lebecYellow, 0.6), 0, hw + 4.6, d / 2 - 0.5); z.rotation.z = 0.4;
        for (let k = 0; k < 3; k++) b(g, 2.6, 0.25, 0.08, K.wood, xd + dw / 2 + 3 + k * 0.1, 1.5 + k * 0.4, d / 2 + 0.25).rotation.z = (k - 1) * 0.3;   // planches clouées
        break;
      }
    }
    quantizeStaff(g);
    g = ST.merge(g); root.add(g);
    return g;
  };

  /* =========================================================================
     2) KIT DE BÂTIMENTS DE VILLE : ML.Build.make(type, rng, opts)
        origine = centre de l'emprise au sol (y=0), porte vers +z, emprise opts.w × opts.d
     ========================================================================= */
  const DEF = {
    maison: [10, 9], longere: [16, 8], mitoyennes: [15, 10], immeuble: [15, 14], commerce: [14, 12],
    eglise: [18, 30], mairie: [24, 16], ecole: [26, 16], supermarche: [34, 24], ferme: [22, 16],
    chalet: [11, 10], refuge: [18, 12], hangar: [20, 14], garage: [16, 12]
  };
  const SHOPS = [
    { n: 'Boulangerie du Copeau', s: 'Pain de 4 h — croûte rectifiée', bg: PAL.wood, prop: 'baguette' },
    { n: 'Tabac-Presse du Poly', s: 'Loto · Journaux · Polys photocopiés', bg: PAL.shutterRed, prop: 'tabac' },
    { n: 'Pharmacie de la Bavure', s: 'Pansements pour doigts d\'usineur', bg: PAL.shutterGreen, prop: 'croix' },
    { n: 'Bar Le Copeau', s: 'Happy hour à 17 h 01 pile', bg: PAL.lebecBlue, prop: 'terrasse' },
    { n: 'Crêperie Ty Lebec', s: 'Galettes au beurre (très) salé', bg: PAL.shutterYellow, prop: 'terrasse' },
    { n: 'Hair Usinage', s: 'Coupe à la fraise 2 tailles', bg: PAL.pink, prop: 'barbier' },
    { n: 'Quincaillerie Boulon', s: 'Tout, sauf la vis que tu cherches', bg: PAL.orange, prop: 'cle' },
    { n: 'Kebab L\'Alésage', s: 'Sauce blanche Ra 0,8', bg: PAL.red, prop: 'terrasse' },
    { n: 'Agence Immo Kerbéton', s: 'Longère avec vue (sur la rocade)', bg: PAL.purple, prop: null }
  ];
  const pickR = (rng, a) => a[Math.floor(rng() * a.length) % a.length];
  const rr = (rng, a, bb) => a + rng() * (bb - a);

  /** maison bretonne : crépi ou granit, toit d'ardoise raide, lucarnes, cheminées sur pignons */
  function maison(g, rng, w, d, o) {
    const bw = w - 1.2, bd = Math.max(4, d - 2.6), stone = rng() < 0.3, hw = o.h ? Math.max(3.5, o.h * 0.55) : rr(rng, 4.2, 5.2), rh = Math.min(bd * 0.6, 4.2);
    const wallM = stone ? pickR(rng, K.granite) : pickR(rng, K.plaster), gr = stone ? K.granite[1] : pickR(rng, K.granite), roof = pickR(rng, K.slate), sh = pickR(rng, K.shut);
    const zc = -d / 2 + 0.7 + bd / 2;
    b(g, bw, hw, bd, wallM, 0, hw / 2, zc); b(g, bw + 0.2, 0.45, bd + 0.2, gr, 0, 0.22, zc);
    if (!stone) for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let y = 0.45, k = 0; y < hw - 0.3; y += 0.55, k++) b(g, k % 2 ? 0.45 : 0.7, 0.5, k % 2 ? 0.7 : 0.45, gr, sx * (bw / 2 - (k % 2 ? 0.2 : 0.32)), y + 0.25, zc + sz * (bd / 2 - (k % 2 ? 0.32 : 0.2)));
    gable(g, bw, bd, rh, hw, roof, wallM, 0.45, 0, zc, 0);
    for (const s of [-1, 1]) if (s < 0 || rng() < 0.7) { rb(g, 0.9, 2.2, 1.3, gr, s * (bw / 2 - 0.45), hw + rh - 0.2, zc, 0.06); b(g, 1.1, 0.18, 1.5, roof, s * (bw / 2 - 0.45), hw + rh + 0.95, zc); }
    const f = face(g, 'f', bw, bd, 0, zc), dx = pickR(rng, [-1, 0, 1]) * bw * 0.25;
    door(f, dx, 1.2, 2.3, sh, { frame: gr, step: gr });
    for (const x of [-bw * 0.33, 0, bw * 0.33]) if (Math.abs(x - dx) > 1.6 && Math.abs(x) < bw / 2 - 1) win(f, x, 1.6, 1.0, 1.2, { shut: sh, sill: gr });
    if (hw > 4.7) for (const x of [-bw * 0.25, bw * 0.25]) win(f, x, hw - 1.1, 0.9, 1.0, { shut: sh, sill: gr });
    else for (const x of [-bw * 0.25, bw * 0.25]) {                         // lucarnes
      const lz = zc + bd / 2 - 0.55; b(g, 1.5, 1.5, 1.4, wallM, x, hw + 0.55, lz); gable(g, 1.5, 1.6, 0.8, hw + 1.3, roof, wallM, 0.12, x, lz, PI / 2);
      win(grp(g, x, hw - 0.1, lz + 0.7), 0, 0.75, 0.8, 0.9, {});
    }
    const bk = face(g, 'b', bw, bd, 0, zc); win(bk, -bw * 0.25, 1.6, 0.9, 1.1, { shut: sh }); win(bk, bw * 0.25, 1.6, 0.9, 1.1, { shut: sh });
    win(face(g, 'r', bw, bd, 0, zc), 0, hw + 0.6, 0.6, 0.7, {});
    // jardinet : muret, nain de jardin, chat sur le toit
    if (rng() < 0.45) { for (const s of [-1, 1]) b(g, w / 2 - 1, 0.6, 0.35, gr, s * (w / 4 + 0.5), 0.3, d / 2 - 0.25); }
    if (rng() < 0.22) gnome(g, -bw / 2 + 0.6 + rng() * 1.5, d / 2 - 1, rng() * 2);
    if (rng() < 0.15) cat(g, bw * 0.2, hw + rh * 0.5 + 0.1, zc + bd * 0.22, 0.2);
    return { h: hw + rh + 1, door: { x: dx, z: d / 2 } };
  }
  /** longère : longue et basse, tout en granit, grande porte de grange */
  function longere(g, rng, w, d, o) {
    const bw = w - 0.8, bd = Math.max(4.5, d - 2.2), hw = o.h ? o.h * 0.5 : rr(rng, 3.0, 3.6), rh = bd * 0.6, zc = -d / 2 + 0.5 + bd / 2;
    const wallM = pickR(rng, K.granite), roof = pickR(rng, K.slate), sh = pickR(rng, K.shut), gr = wallM;
    b(g, bw, hw, bd, wallM, 0, hw / 2, zc); gable(g, bw, bd, rh, hw, roof, wallM, 0.4, 0, zc, 0);
    for (const s of [-1, 1]) { rb(g, 1.1, 2.6, 1.4, gr, s * (bw / 2 - 0.5), hw + rh - 0.1, zc, 0.06); b(g, 1.3, 0.2, 1.6, roof, s * (bw / 2 - 0.5), hw + rh + 1.25, zc); }
    const f = face(g, 'f', bw, bd, 0, zc), dx = -bw * 0.12;
    door(f, dx, 1.1, 2.1, sh, { frame: gr, step: gr });
    b(f, 2.8, 2.6, 0.12, K.wood, bw / 2 - 2.2, 1.3, 0.08); b(f, 3.2, 0.4, 0.2, gr, bw / 2 - 2.2, 2.75, 0.1);          // porte de grange
    for (let k = 0; k < 4; k++) b(f, 0.06, 2.5, 0.05, sh, bw / 2 - 3.4 + k * 0.8, 1.3, 0.16);
    for (const x of [-bw * 0.36, dx + 2.0]) win(f, x, 1.5, 0.9, 1.0, { shut: sh, sill: gr });
    for (const x of [-bw * 0.3, bw * 0.05]) { const lz = zc + bd / 2 - 0.4; b(g, 1.4, 1.4, 1.2, gr, x, hw + 0.5, lz); gable(g, 1.4, 1.4, 0.7, hw + 1.2, roof, gr, 0.1, x, lz, PI / 2); win(grp(g, x, hw - 0.1, lz + 0.6), 0, 0.7, 0.7, 0.8, {}); }
    const bk = face(g, 'b', bw, bd, 0, zc); win(bk, -bw * 0.2, 1.5, 0.8, 0.9, { shut: sh }); win(bk, bw * 0.2, 1.5, 0.8, 0.9, { shut: sh });
    if (rng() < 0.5) { b(g, 1.6, 0.45, 0.4, K.wood, -bw * 0.36, 0.45, d / 2 - 0.6); for (const s of [-1, 1]) b(g, 0.1, 0.45, 0.35, K.wood, -bw * 0.36 + s * 0.65, 0.22, d / 2 - 0.6); }   // banc
    if (rng() < 0.3) cat(g, -bw * 0.2, hw + rh * 0.45, zc + bd * 0.22, 0);
    if (rng() < 0.3) gnome(g, bw * 0.1, d / 2 - 0.7, rng() * 2);
    return { h: hw + rh + 1.3, door: { x: dx, z: d / 2 } };
  }
  /** maisons de ville mitoyennes : 2 ou 3 façades de couleurs différentes */
  function mitoyennes(g, rng, w, d, o) {
    const n = w >= 13 && rng() < 0.6 ? 3 : 2, uw = (w - 0.4) / n, bd = Math.max(5, d - 2.2), zc = -d / 2 + 0.4 + bd / 2;
    const roof = pickR(rng, K.slate), walls = [pickR(rng, K.plaster), pickR(rng, K.plaster)], shs = [pickR(rng, K.shut), pickR(rng, K.shut)], gr = pickR(rng, K.granite);
    let hmax = 0; const doors = [];
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + 0.2 + uw * (i + 0.5), hw = (o.h ? o.h * 0.6 : 5.4) + rr(rng, -0.5, 1.4), wm = walls[i % 2], sh = shs[i % 2], rh = bd * 0.5;
      b(g, uw, hw, bd, wm, x0, hw / 2, zc); b(g, uw + 0.05, 0.5, bd + 0.15, gr, x0, 0.25, zc);
      gable(g, uw, bd, rh, hw, roof, wm, i === 0 || i === n - 1 ? 0.1 : 0.02, x0, zc, 0);
      rb(g, 0.8, 1.6, 1.0, gr, x0 + uw / 2 - 0.1, hw + rh - 0.1, zc, 0.05);
      const f = face(g, 'f', uw, bd, x0, zc), dx = (i % 2 ? 1 : -1) * uw * 0.25;
      door(f, dx, 1.1, 2.3, sh, { frame: gr, step: gr }); win(f, -dx, 1.6, 1.0, 1.2, { shut: sh, sill: gr });
      for (const x of [-uw * 0.25, uw * 0.25]) win(f, x, hw - 1.4, 0.9, 1.1, { shut: sh, sill: gr, flowers: rng() < 0.4 ? K.red : null });
      const bk = face(g, 'b', uw, bd, x0, zc); win(bk, 0, 1.6, 0.9, 1.1, {}); win(bk, 0, hw - 1.4, 0.9, 1.0, {});
      hmax = Math.max(hmax, hw + rh); doors.push(x0 + dx);
    }
    if (rng() < 0.2) cat(g, 0, hmax - 0.6, zc + 0.6, 1.2);
    return { h: hmax + 1, door: { x: doors[0], z: d / 2 } };
  }
  /** petit immeuble : 3-4 étages, balcons, toit d'ardoise à lucarnes */
  function immeuble(g, rng, w, d, o) {
    const bw = w - 1, bd = Math.max(6, d - 3.4), nf = o.h ? Math.max(2, Math.round(o.h / 3.2)) : 3 + (rng() < 0.5 ? 1 : 0), fh = 2.9, hw = nf * fh + 0.6, rh = 3, zc = -d / 2 + 0.6 + bd / 2;
    const wm = pickR(rng, K.plaster), gr = pickR(rng, K.granite), roof = pickR(rng, K.slate), sh = pickR(rng, K.shut);
    b(g, bw, hw, bd, wm, 0, hw / 2, zc); b(g, bw + 0.15, fh, bd + 0.15, gr, 0, fh / 2, zc);
    b(g, bw + 0.3, 0.3, bd + 0.3, gr, 0, hw - 0.15, zc);
    gable(g, bw, bd, rh, hw, roof, wm, 0.4, 0, zc, 0);
    for (const s of [-1, 1]) rb(g, 1.0, 1.8, 1.4, gr, s * (bw / 2 - 0.6), hw + rh, zc, 0.06);
    const f = face(g, 'f', bw, bd, 0, zc), bk = face(g, 'b', bw, bd, 0, zc), cols = [-0.375, -0.125, 0.125, 0.375].map(k => k * bw);
    door(f, 0, 1.6, 2.5, K.woodDark, { frame: K.white, step: gr }); b(f, 2.6, 0.15, 1.2, K.steelDark, 0, 2.9, 0.6);
    for (const x of cols) if (Math.abs(x) > 1.5) win(f, x, 1.6, 1.1, 1.3, { sill: K.white });
    for (let fl = 1; fl < nf; fl++) {
      const y = fl * fh + 1.4;
      for (const x of cols) { win(f, x, y, 1.0, 1.5, { shut: sh }); win(bk, x, y, 1.0, 1.4, {}); }
      if (fl >= 1) for (const s of [-1, 1]) {                               // balcons
        const bx = s * bw * 0.25; b(f, bw * 0.42, 0.18, 1.1, gr, bx, fl * fh + 0.1, 0.55);
        b(f, bw * 0.42, 0.08, 0.08, K.black, bx, fl * fh + 1.1, 1.08);
        for (let k = -4; k <= 4; k++) b(f, 0.05, 1.0, 0.05, K.black, bx + k * bw * 0.05, fl * fh + 0.6, 1.08);
      }
    }
    for (let fl = 0; fl < nf; fl++) for (const sd of ['l', 'r']) win(face(g, sd, bw, bd, 0, zc), 0, fl * fh + 1.6, 0.8, 1.1, {});
    for (const x of [-bw * 0.25, bw * 0.25]) { const lz = zc + bd / 2 - 0.6; b(g, 1.4, 1.4, 1.3, wm, x, hw + 0.5, lz); gable(g, 1.4, 1.5, 0.7, hw + 1.2, roof, wm, 0.1, x, lz, PI / 2); win(grp(g, x, hw - 0.1, lz + 0.65), 0, 0.75, 0.75, 0.85, {}); }
    board(f, pickR(rng, ['Résidence Les Copeaux', 'Résidence Le Tour Numérique', 'Les Jardins du Mandrin']), '', '#fbf8f1', 2.2, 0.45, 0, 3.3, 0.12, 0, '#24457a');
    return { h: hw + rh + 1, door: { x: 0, z: d / 2 } };
  }
  /** commerce : rez-de-chaussée boutique éclairée + 1-2 étages ; enseigne rigolote */
  function commerce(g, rng, w, d, o) {
    const S = o.shop !== undefined ? SHOPS[o.shop % SHOPS.length] : pickR(rng, SHOPS), shopM = M(S.bg);
    const bw = w - 0.8, bd = Math.max(5, d - 3.6), nf = o.h ? Math.max(1, Math.round((o.h - 3.6) / 2.9)) : 1 + (rng() < 0.5 ? 1 : 0), gh = 3.6, fh = 2.8, hw = gh + nf * fh, rh = bd * 0.5, zc = -d / 2 + 0.4 + bd / 2;
    const wm = pickR(rng, K.plaster), gr = pickR(rng, K.granite), roof = pickR(rng, K.slate), sh = pickR(rng, K.shut);
    b(g, bw, hw, bd, wm, 0, hw / 2, zc); b(g, bw + 0.1, gh, bd + 0.1, gr, 0, gh / 2, zc);
    gable(g, bw, bd, rh, hw, roof, wm, 0.4, 0, zc, 0);
    rb(g, 0.9, 1.8, 1.2, gr, bw / 2 - 0.6, hw + rh - 0.2, zc, 0.06);
    const f = face(g, 'f', bw, bd, 0, zc);
    // devanture en bois peint + grande vitrine éclairée + porte vitrée
    b(f, bw - 0.4, gh - 0.2, 0.2, shopM, 0, (gh - 0.2) / 2, 0.1);
    b(f, bw * 0.62, 2.1, 0.12, K.shopGlass, -bw * 0.12, 1.45, 0.22); b(f, 1.3, 2.5, 0.12, K.shopGlass, bw * 0.34, 1.25, 0.22);
    for (const x of [-bw * 0.12 - bw * 0.31, -bw * 0.12 + bw * 0.31, bw * 0.34 - 0.7, bw * 0.34 + 0.7]) b(f, 0.12, 2.6, 0.16, K.white, x, 1.3, 0.25);
    board(f, S.n, S.s, hex(S.bg), Math.min(bw - 1, 8), Math.min(bw - 1, 8) / 4.5, 0, gh - 0.25, 0.3, 0);
    // store à rayures
    for (let i = 0; i < 8; i++) { const st = b(f, (bw - 0.6) / 8, 0.1, 1.6, i % 2 ? K.white : shopM, -(bw - 0.6) / 2 + (bw - 0.6) / 16 + i * (bw - 0.6) / 8, gh - 1.05, 0.95); st.rotation.x = 0.4; }
    for (let fl = 0; fl < nf; fl++) for (const x of [-bw * 0.3, 0, bw * 0.3]) win(f, x, gh + fl * fh + 1.4, 0.95, 1.3, { shut: sh, sill: gr, flowers: rng() < 0.3 ? K.red : null });
    const bk = face(g, 'b', bw, bd, 0, zc); for (let fl = 0; fl < nf; fl++) win(bk, 0, gh + fl * fh + 1.4, 0.9, 1.2, {});
    win(bk, -bw * 0.25, 1.6, 0.9, 1.1, {});
    const fz = zc + bd / 2;
    switch (S.prop) {
      case 'croix': { const c = grp(g, bw / 2 - 0.3, gh + 1.2, fz + 0.8); const gm = GLOW(PAL.mint, 0.9); b(c, 0.3, 1.0, 0.3, gm, 0, 0, 0); b(c, 1.0, 0.3, 0.3, gm, 0, 0, 0); b(c, 0.1, 0.1, 0.8, K.steelDark, 0, 0, -0.5); break; }
      case 'tabac': { const c = b(g, 0.8, 0.8, 0.2, GLOW(PAL.red, 0.5), bw / 2 - 0.3, gh + 1.2, fz + 0.8); c.rotation.z = PI / 4; b(g, 0.1, 0.1, 0.8, K.steelDark, bw / 2 - 0.3, gh + 1.2, fz + 0.4); break; }
      case 'barbier': { const p = cy(g, 0.15, 0.15, 1.6, K.white, bw / 2 - 0.4, 1.4, fz + 0.4, 8); for (let k = 0; k < 4; k++) { const r = b(g, 0.34, 0.1, 0.34, K.red, bw / 2 - 0.4, 0.8 + k * 0.4, fz + 0.4); r.rotation.y = k * 0.6; r.rotation.z = 0.3; } void p; break; }
      case 'cle': { const c = grp(g, bw / 2 - 0.3, gh + 1.1, fz + 0.9, 0); b(c, 0.25, 0.25, 1.6, K.steelDark, 0, 0, -0.4); cy(c, 0.55, 0.55, 0.15, K.yellow, 0, 0, 0.5, 6).rotation.x = PI / 2; b(c, 0.2, 1.4, 0.2, K.yellow, 0, -0.9, 0.5); b(c, 0.4, 0.2, 0.2, K.yellow, 0.25, -1.4, 0.5); break; }
      case 'baguette': { const bg = cy(g, 0.3, 0.3, 3.2, K.sand, 0, hw + rh * 0.3, fz - 0.3, 8); bg.rotation.z = PI / 2 + 0.2; break; }
      case 'terrasse': {
        for (const x of [-bw * 0.3, bw * 0.05]) { cy(g, 0.45, 0.45, 0.06, K.white, x, 0.75, d / 2 - 1.2, 10); cy(g, 0.05, 0.05, 0.75, K.black, x, 0.38, d / 2 - 1.2, 5); for (const s of [-1, 1]) chair(g, x + s * 0.8, d / 2 - 1.2, -s * PI / 2, shopM); }
        b(g, 0.6, 0.9, 0.08, K.black, bw / 2 - 0.8, 0.6, d / 2 - 0.9).rotation.x = -0.2;    // ardoise du menu
        break;
      }
    }
    return { h: hw + rh + 1, door: { x: bw * 0.34, z: d / 2 }, shop: S.n };
  }
  /** église : nef, chevet en demi-rond, clocher pointu, calvaire breton */
  function eglise(g, rng, w, d) {
    const gr = K.granite[0], gr2 = K.granite[1], roof = K.slate[1], nw = Math.min(11, w - 3), tw = Math.min(5.2, nw * 0.5);
    const tz2 = d / 2 - 1.5, tz1 = tz2 - tw, nz1 = -d / 2 + nw / 2 + 0.6, nh = 7.5, th = 13;
    // nef
    b(g, nw, nh, tz1 - nz1 + 0.5, gr, 0, nh / 2, (tz1 + nz1) / 2);
    gable(g, tz1 - nz1 + 0.5, nw, 5.5, nh, roof, gr, 0.5, 0, (tz1 + nz1) / 2, PI / 2);
    // chevet
    cy(g, nw / 2, nw / 2, nh, gr, 0, nh / 2, nz1, 12).geometry = new THREE.CylinderGeometry(nw / 2, nw / 2, nh, 12, 1, false, PI / 2, PI);
    const cone = cy(g, 0, nw / 2 + 0.4, 4.5, roof, 0, nh + 2.25, nz1, 12); cone.geometry = new THREE.CylinderGeometry(0, nw / 2 + 0.4, 4.5, 12, 1, false, PI / 2, PI);
    // contreforts + vitraux
    const vit = [GLOW(PAL.purple, 0.5), GLOW(PAL.shutterBlue, 0.5)];
    for (let z = tz1 - 2; z > nz1 + 0.5; z -= 3.4) for (const s of [-1, 1]) {
      b(g, 0.8, nh * 0.75, 0.8, gr2, s * (nw / 2 + 0.3), nh * 0.375, z - 1.7);
      b(g, 0.2, 3.2, 1.0, vit[(z | 0) & 1], s * (nw / 2 + 0.02), 4, z); const ar = b(g, 0.2, 0.72, 0.72, vit[(z | 0) & 1], s * (nw / 2 + 0.02), 5.6, z); ar.rotation.x = PI / 4;
    }
    // clocher
    b(g, tw, th, tw, gr, 0, th / 2, (tz1 + tz2) / 2); b(g, tw + 0.4, 0.4, tw + 0.4, gr2, 0, th, (tz1 + tz2) / 2); b(g, tw + 0.3, 0.3, tw + 0.3, gr2, 0, nh, (tz1 + tz2) / 2);
    for (const sd of ['f', 'b', 'l', 'r']) { const f = face(g, sd, tw, tw, 0, (tz1 + tz2) / 2); b(f, 1.2, 2.2, 0.1, K.black, 0, th - 2, 0.05); for (let k = 0; k < 4; k++) b(f, 1.3, 0.12, 0.15, roof, 0, th - 2.9 + k * 0.5, 0.12).rotation.x = 0.4; }
    const sp = cy(g, 0, tw * 0.72, 11, roof, 0, th + 5.5, (tz1 + tz2) / 2, 4); sp.rotation.y = PI / 4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = cy(g, 0, 0.45, 2, gr2, sx * (tw / 2 - 0.2), th + 1.2, (tz1 + tz2) / 2 + sz * (tw / 2 - 0.2), 4); p.rotation.y = PI / 4; }
    b(g, 0.14, 1.4, 0.14, K.black, 0, th + 11.6, (tz1 + tz2) / 2); b(g, 0.8, 0.14, 0.14, K.black, 0, th + 11.8, (tz1 + tz2) / 2);
    // horloge, portail
    const f = face(g, 'f', tw, tw, 0, (tz1 + tz2) / 2);
    cy(f, 0.9, 0.9, 0.1, K.white, 0, th - 4.4, 0.08, 16).rotation.x = PI / 2;
    b(f, 0.08, 0.7, 0.06, K.black, 0, th - 4.15, 0.16); const hd = b(f, 0.08, 0.5, 0.06, K.black, 0.15, th - 4.4, 0.16); hd.rotation.z = -1.1;
    b(f, 2.8, 3.8, 0.3, gr2, 0, 1.9, 0.1); b(f, 2.0, 3.2, 0.12, K.woodDark, 0, 1.6, 0.25); cy(f, 1.0, 1.0, 0.12, K.woodDark, 0, 3.2, 0.25, 12).rotation.x = PI / 2;
    b(f, 3.6, 0.25, 1.4, gr2, 0, 0.12, 0.7);
    // calvaire breton
    const cx = -w / 2 + 1.5, cz = d / 2 - 1.5;
    b(g, 1.6, 0.8, 1.6, gr2, cx, 0.4, cz); b(g, 0.4, 3.4, 0.4, gr, cx, 2.5, cz); b(g, 1.8, 0.35, 0.35, gr, cx, 3.6, cz);
    return { h: th + 12.5, door: { x: 0, z: d / 2 } };
  }
  /** mairie : symétrique, drapeau, « MAIRIE », horaires d'ouverture improbables */
  function mairie(g, rng, w, d) {
    const bw = w - 2, bd = Math.max(8, d - 5), hw = 7.4, rh = 4, zc = -d / 2 + 0.5 + bd / 2;
    const wm = K.plaster[4], gr = K.granite[0], roof = K.slate[0], sh = K.shut[0];
    b(g, bw, hw, bd, wm, 0, hw / 2, zc); b(g, bw + 0.2, 0.6, bd + 0.2, gr, 0, 0.3, zc); b(g, bw + 0.15, 0.3, bd + 0.15, gr, 0, 3.7, zc);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(g, 0.6, hw, 0.6, gr, sx * (bw / 2 - 0.25), hw / 2, zc + sz * (bd / 2 - 0.25));
    gable(g, bw, bd, rh, hw, roof, wm, 0.4, 0, zc, 0);
    // avant-corps central avec fronton et horloge
    const fz = zc + bd / 2, aw = 6;
    b(g, aw, hw + 0.6, 0.8, gr, 0, (hw + 0.6) / 2, fz + 0.3);
    const pd = new THREE.Mesh(prismGeo(0.9, aw + 0.4, 1.8), gr); pd.rotation.y = PI / 2; pd.position.set(0, hw + 0.6, fz + 0.3); g.add(pd);
    cy(g, 0.6, 0.6, 0.1, K.white, 0, hw + 1.25, fz + 0.76, 14).rotation.x = PI / 2; b(g, 0.06, 0.45, 0.04, K.black, 0, hw + 1.4, fz + 0.83);
    for (const sd of [-1, 1]) for (let x = 1; x <= 3; x++) { const f = face(g, 'f', bw, bd, 0, zc); win(f, sd * (aw / 2 + x * (bw / 2 - aw / 2) / 3.6), 1.9, 1.1, 1.8, { shut: sh, sill: gr }); win(f, sd * (aw / 2 + x * (bw / 2 - aw / 2) / 3.6), 5.4, 1.1, 1.6, { shut: sh, sill: gr }); }
    const fa = grp(g, 0, 0, fz + 0.7);
    door(fa, 0, 2.0, 3.0, K.blue, { frame: K.white }); win(fa, 0, 5.4, 1.4, 1.8, {});
    b(fa, 3, 0.15, 1.0, gr, 0, 4.3, 0.4); b(fa, 3, 0.7, 0.06, K.black, 0, 4.7, 0.88);                   // balcon
    for (let k = 0; k < 3; k++) b(g, 5 - k * 0.8, 0.2, 1.2 - k * 0.3, gr, 0, 0.1 + k * 0.2, fz + 1.6 - k * 0.3);   // marches
    const A = atlas('mairie', [['MAIRIE', 'Liberté · Égalité · Fraternité', '#fbf8f1', '#24457a'], ['Ouvert le mardi de 14 h à 14 h 15', '', '#24457a', '#fff']]);
    signPlane(fa, A, 0, 4.4, 1.1, 0, 3.6, 0.12); b(fa, 4.6, 1.3, 0.08, gr, 0, 3.6, 0.06);
    signPlane(g, A, 1, 2.4, 0.6, aw / 2 + 1.2, 1.5, fz + 0.12);
    // drapeau tricolore (penché, sur le balcon)
    const fl = grp(g, 0.9, 5.3, fz + 1.4); fl.rotation.x = 0.5;
    cy(fl, 0.05, 0.05, 2.6, K.white, 0, 1.3, 0, 5);
    [PAL.shutterBlue, PAL.white, PAL.red].forEach((c, i) => b(fl, 0.45, 0.9, 0.04, M(c), 0.27 + i * 0.45, 2.1, 0));
    for (const s of [-1, 1]) { b(g, 1.4, 0.6, 0.6, gr, s * (aw / 2 + 1.6), 0.3, d / 2 - 0.6); b(g, 1.2, 0.3, 0.4, K.red, s * (aw / 2 + 1.6), 0.7, d / 2 - 0.6); }
    return { h: hw + rh + 1, door: { x: 0, z: d / 2 } };
  }
  /** école : bâtiment à grandes fenêtres, préau, marelle, panier de basket */
  function ecole(g, rng, w, d) {
    const bw = Math.min(w - 8, 19), bd = Math.max(7, d - 6), hw = 6.6, rh = 3.2, bx = -w / 2 + 0.3 + bw / 2, zc = -d / 2 + 0.5 + bd / 2;
    const wm = K.plaster[2], gr = K.granite[1], roof = K.slate[0];
    b(g, bw, hw, bd, wm, bx, hw / 2, zc); b(g, bw + 0.2, 0.6, bd + 0.2, gr, bx, 0.3, zc);
    gable(g, bw, bd, rh, hw, roof, wm, 0.4, bx, zc, 0);
    const f = face(g, 'f', bw, bd, bx, zc), bk = face(g, 'b', bw, bd, bx, zc);
    for (let x = -bw / 2 + 2; x < bw / 2 - 1; x += 2.6) { if (Math.abs(x) > 1.6) win(f, x, 1.8, 1.8, 1.6, { frame: K.yellow }); win(f, x, 4.9, 1.8, 1.5, { frame: K.yellow }); win(bk, x, 1.8, 1.8, 1.6, {}); win(bk, x, 4.9, 1.8, 1.5, {}); }
    door(f, 0, 1.8, 2.6, K.shut[0], { frame: gr, step: gr });
    const A = atlas('ecole', [['École Jules Ferraille', 'Interdit de courir avec un foret', '#3d7ea6', '#fff'], ['Liberté · Égalité · Récré', '', '#fbf8f1', '#24457a']]);
    b(f, 6.2, 1.6, 0.1, K.white, 0, 3.4, 0.05); signPlane(f, A, 0, 6, 1.5, 0, 3.4, 0.12);
    cy(f, 0.55, 0.55, 0.1, K.white, 0, hw + 1.2, 0.1, 14).rotation.x = PI / 2;
    // préau
    const px = bx + bw / 2 + (w / 2 - (bx + bw / 2)) / 2, pwd = w / 2 - (bx + bw / 2) - 1.0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(g, 0.25, 3.2, 0.25, K.steelDark, px + sx * (pwd / 2 - 0.3), 1.6, zc + sz * (bd / 2 - 0.3));
    gable(g, pwd, bd, 1, 3.2, K.slate[1], null, 0.3, px, zc, 0);
    signPlane(g, A, 1, 3, 0.75, px, 2.7, zc + bd / 2 - 0.2);
    // cour : marelle et panier de basket
    for (let k = 0; k < 6; k++) b(g, 0.9, 0.03, 0.9, k % 2 ? K.white : K.yellow, -w / 4 + (k % 2 ? 0.5 : 0), 0.03, d / 2 - 0.6 - k * 0.5).scale.z = 0.5;
    b(g, 0.15, 3.2, 0.15, K.steelDark, w / 2 - 1, 1.6, d / 2 - 1); b(g, 1.2, 0.8, 0.06, K.white, w / 2 - 1, 3.2, d / 2 - 1.1); cy(g, 0.25, 0.25, 0.05, K.red, w / 2 - 1, 2.9, d / 2 - 1.4, 10);
    return { h: hw + rh + 1, door: { x: bx, z: d / 2 } };
  }
  /** supermarché « Super Lebec Marché » : grosse boîte, vitrine, abri caddies */
  function supermarche(g, rng, w, d) {
    const bw = w - 1, bd = Math.max(12, d - 6), hw = 6.5, zc = -d / 2 + 0.5 + bd / 2, fz = zc + bd / 2;
    b(g, bw, hw, bd, K.cladding, 0, hw / 2, zc); b(g, bw + 0.3, 1.0, bd + 0.3, K.red, 0, hw - 0.3, zc); b(g, bw, 0.3, bd, K.steelDark, 0, hw + 0.1, zc);
    const f = face(g, 'f', bw, bd, 0, zc);
    b(f, 12, 3.6, 0.15, K.shopGlass, 0, 1.8, 0.08); for (let x = -6; x <= 6; x += 2) b(f, 0.15, 3.6, 0.25, K.steelDark, x, 1.8, 0.12);
    b(f, 14, 0.8, 2.6, K.red, 0, 3.9, 1.3);                                                     // marquise
    const A = atlas('supermarche', [['Super Lebec Marché', 'Les prix les plus bas… de la rocade', '#e94f37', '#fff'], ['PROMO : boulons ×1000 — 2 €', '', '#ffc93c', '#22262d'], ['Caddies : jeton ou rondelle de 22', '', '#24457a', '#fff']]);
    b(f, 17, 4.2, 0.2, K.yellow, 0, hw + 2.2, -0.4); signPlane(f, A, 0, 16, 4, 0, hw + 2.2, -0.28);
    for (const s of [-1, 1]) b(f, 0.25, 2.5, 0.25, K.steelDark, s * 6, hw + 0.8, -0.4);
    signPlane(f, A, 1, 6, 1.5, -bw / 2 + 4.5, 3, 0.06); signPlane(f, A, 1, 6, 1.5, bw / 2 - 4.5, 3, 0.06);
    for (let k = 0; k < 3; k++) rb(g, 2.2, 1.2, 1.6, K.steel, -bw / 3 + k * bw / 3, hw + 0.8, zc - 2, 0.1);
    // abri à caddies
    const cx = bw / 2 - 5, cz = fz + 3;
    for (const s of [-1, 1]) b(g, 0.15, 2.4, 0.15, K.steelDark, cx + s * 2.6, 1.2, cz); b(g, 5.6, 0.15, 2, K.red, cx, 2.45, cz);
    for (let k = 0; k < 5; k++) { const c = grp(g, cx - 2 + k * 0.55, 0, cz); b(c, 0.5, 0.45, 0.8, K.steel, 0, 0.75, 0); b(c, 0.45, 0.05, 0.75, K.steelDark, 0, 0.3, 0); }
    signPlane(g, A, 2, 3.2, 0.8, cx, 3.0, cz + 1.05);
    for (let x = -bw / 2 + 2; x < bw / 2 - 8; x += 2.8) b(g, 0.12, 0.02, 3, K.white, x, 0.02, d / 2 - 1.6);   // places de parking
    return { h: hw + 4.5, door: { x: 0, z: fz } };
  }
  /** ferme : grange en granit, silo, bottes de foin, tracteur, vache */
  function ferme(g, rng, w, d) {
    const bw = Math.min(14, w - 7), bd = Math.min(10, d - 4), hw = 4.5, rh = 4.5, bx = -w / 2 + 0.6 + bw / 2, zc = -d / 2 + 0.6 + bd / 2;
    const gr = K.granite[0], roof = K.slate[1];
    b(g, bw, hw, bd, gr, bx, hw / 2, zc); gable(g, bw, bd, rh, hw, roof, gr, 0.5, bx, zc, 0);
    const f = face(g, 'f', bw, bd, bx, zc);
    b(f, 4, 3.8, 0.15, K.wood, 0, 1.9, 0.08); for (let k = -1; k <= 1; k += 2) { const x = b(f, 0.15, 5.2, 0.1, K.white, 0, 1.9, 0.18); x.rotation.z = k * 0.8; } b(f, 4.4, 0.3, 0.2, K.white, 0, 3.8, 0.15);
    b(f, 1.4, 1.2, 0.12, K.wood, 0, hw + 0.9, 0.08); win(f, -bw / 2 + 2, 1.7, 1, 1, { shut: K.shut[1] }); win(f, bw / 2 - 2, 1.7, 1, 1, { shut: K.shut[1] });
    const A = atlas('ferme', [['GAEC du Gros Rendement', 'Œufs · Lait · Pièces de tracteur', '#7a5236', '#fff']]);
    signPlane(f, A, 0, 3.6, 0.9, 0, 4.4 - 0.9, 0.2);
    // silo
    const sx = w / 2 - 2.8, sz = -d / 2 + 3;
    cy(g, 2.2, 2.2, 10, K.steel, sx, 5, sz, 12); cy(g, 0, 2.4, 1.8, K.steelDark, sx, 10.9, sz, 12); for (let y = 1.5; y < 10; y += 2) cy(g, 2.25, 2.25, 0.15, K.steelDark, sx, y, sz, 12);
    // bottes de foin
    for (let k = 0; k < 4; k++) { const hb = cy(g, 0.7, 0.7, 1.2, K.sand, sx - 1.5 + (k % 3) * 1.3 + (k > 2 ? 0.65 : 0), 0.7 + (k > 2 ? 1.3 : 0), d / 2 - 1.5, 10); hb.rotation.z = PI / 2; }
    // tracteur rouge
    const tr = grp(g, sx - 1, 0, d / 2 - 4.5, 0.4);
    rb(tr, 1.4, 1.0, 2.4, K.red, 0, 1.2, 0, 0.1); rb(tr, 1.2, 1.2, 1.1, K.red, 0, 2.2, -0.5, 0.1); b(tr, 1.0, 0.8, 0.9, K.glass, 0, 2.3, -0.5);
    for (const s of [-1, 1]) { cy(tr, 0.8, 0.8, 0.4, K.black, s * 0.85, 0.8, -0.7, 12).rotation.z = PI / 2; cy(tr, 0.45, 0.45, 0.3, K.black, s * 0.8, 0.45, 0.9, 10).rotation.z = PI / 2; }
    cy(tr, 0.08, 0.08, 1, K.black, 0.4, 2.2, 0.8, 5);
    // vache (en blanc et noir, évidemment)
    const cw = grp(g, bx + bw / 2 - 2, 0, d / 2 - 1.2, 1.2);
    b(cw, 1.6, 0.8, 0.7, K.white, 0, 1.1, 0); b(cw, 0.5, 0.5, 0.45, K.white, 0.95, 1.4, 0); b(cw, 0.5, 0.4, 0.72, K.black, -0.3, 1.2, 0); b(cw, 0.2, 0.2, 0.46, K.black, 1.2, 1.3, 0);
    for (const lx of [-0.6, 0.6]) for (const lz of [-0.25, 0.25]) b(cw, 0.15, 0.7, 0.15, K.white, lx, 0.35, lz);
    b(g, 2, 0.5, 0.6, K.granite[1], bx - bw / 2 + 2, 0.25, d / 2 - 0.8);                         // abreuvoir
    return { h: Math.max(hw + rh, 12), door: { x: bx, z: zc + bd / 2 } };
  }
  /** chalet de montagne : soubassement en pierre, bois, grand débord de toit, balcon */
  function chalet(g, rng, w, d, o) {
    const bw = w - 2, bd = Math.max(5, d - 3), hw = o.h ? o.h * 0.6 : 5.2, rh = 2.3, zc = -d / 2 + 1.2 + bd / 2, gr = pickR(rng, K.granite), sh = pickR(rng, [K.shut[1], K.shut[2]]);
    b(g, bw, 1.3, bd, gr, 0, 0.65, zc); b(g, bw, hw - 1.3, bd, K.wood, 0, 1.3 + (hw - 1.3) / 2, zc);
    gable(g, bw, bd, rh, hw, K.slate[1], K.wood, 0.9, 0, zc, 0);
    if (rng() < 0.5) gable(g, bw, bd, rh, hw + 0.12, K.snow, null, 0.85, 0, zc, 0).position.y += 0.08;
    const f = face(g, 'f', bw, bd, 0, zc);
    door(f, -bw * 0.25, 1.1, 2.2, K.woodDark, { step: gr }); win(f, bw * 0.2, 1.9, 1.0, 1.0, { shut: sh, flowers: K.red });
    // balcon
    b(f, bw + 0.6, 0.2, 1.3, K.woodDark, 0, 3.1, 0.65); b(f, bw + 0.6, 0.12, 0.12, K.woodDark, 0, 4.1, 1.25);
    for (let x = -bw / 2 - 0.2; x <= bw / 2 + 0.2; x += 0.35) b(f, 0.1, 0.9, 0.06, K.woodDark, x, 3.65, 1.25);
    win(f, -bw * 0.2, 4.2, 0.9, 1.0, { shut: sh }); win(f, bw * 0.2, 4.2, 0.9, 1.0, { shut: sh });
    for (const s of [-1, 1]) b(f, 0.3, 3.0, 0.3, K.woodDark, s * (bw / 2 + 0.1), 1.5, 1.2);
    const bk = face(g, 'b', bw, bd, 0, zc); win(bk, 0, 3.3, 0.9, 0.9, { shut: sh });
    // tas de bois
    for (let k = 0; k < 6; k++) { const l = cy(g, 0.18, 0.18, 1.2, K.woodDark, bw / 2 + 0.5, 0.2 + Math.floor(k / 3) * 0.34, zc - 1 + (k % 3) * 0.38, 6); l.rotation.x = PI / 2; }
    return { h: hw + rh + 0.5, door: { x: -bw * 0.25, z: d / 2 } };
  }
  /** refuge « Auberge du Col » : grand chalet, terrasse, tables et parasols */
  function refuge(g, rng, w, d) {
    const bw = w - 3, bd = Math.max(6, d - 4.5), hw = 6.2, rh = 2.6, zc = -d / 2 + 1.3 + bd / 2, gr = K.granite[1], fz = zc + bd / 2;
    b(g, bw, 1.6, bd, gr, 0, 0.8, zc); b(g, bw, hw - 1.6, bd, K.wood, 0, 1.6 + (hw - 1.6) / 2, zc);
    gable(g, bw, bd, rh, hw, K.slate[1], K.wood, 1.2, 0, zc, 0);
    gable(g, bw, bd, rh, hw + 0.12, K.snow, null, 1.15, 0, zc, 0).position.y += 0.08;
    rb(g, 1.2, 2.5, 1.2, gr, bw / 2 - 1.2, hw + rh, zc - 1, 0.08);
    const f = face(g, 'f', bw, bd, 0, zc);
    door(f, 0, 1.6, 2.4, K.woodDark, {});
    for (const x of [-bw * 0.32, -bw * 0.16, bw * 0.16, bw * 0.32]) { win(f, x, 1.9, 1.0, 1.1, { shut: K.shut[2], flowers: K.red }); win(f, x, 4.4, 1.0, 1.1, { shut: K.shut[2] }); }
    const A = atlas('refuge', [['Auberge du Col', 'Altitude 312 m — record de Bretagne', '#7a5236', '#fff'], ['Tartiflette au beurre salé', 'Plat du jour (tous les jours)', '#22262d', '#ffc93c']]);
    b(f, 7.2, 1.9, 0.15, K.woodDark, 0, hw - 0.7, 0.1); signPlane(f, A, 0, 7, 1.75, 0, hw - 0.7, 0.2);
    // terrasse en bois
    b(g, bw, 0.25, d / 2 - fz, K.woodDark, 0, 0.12, (d / 2 + fz) / 2);
    for (const x of [-bw * 0.3, bw * 0.3]) {
      b(g, 1.8, 0.1, 0.8, K.wood, x, 0.85, d / 2 - 1.6); for (const s of [-1, 1]) b(g, 1.8, 0.1, 0.35, K.wood, x, 0.5, d / 2 - 1.6 + s * 0.7);
      cy(g, 0.05, 0.05, 2.6, K.white, x, 1.4, d / 2 - 1.6, 5); cy(g, 0, 1.4, 0.6, K.red, x, 2.8, d / 2 - 1.6, 8);
    }
    const mb = grp(g, bw / 2 - 0.5, 0, d / 2 - 0.6, -0.3); b(mb, 0.1, 1.6, 0.1, K.woodDark, 0, 0.8, 0); signPlane(mb, A, 1, 1.8, 0.45, 0, 1.4, 0.07);
    return { h: hw + rh + 1.5, door: { x: 0, z: d / 2 } };
  }
  /** hangar agricole / industriel en tôle, à moitié ouvert */
  function hangar(g, rng, w, d, o) {
    const bw = w - 1, bd = d - 1, hw = o.h ? o.h * 0.7 : 5.5, rh = 1.8;
    const wallT = tole;
    b(g, bw, hw, 0.15, wallT, 0, hw / 2, -bd / 2); b(g, 0.15, hw, bd, wallT, -bw / 2, hw / 2, 0); b(g, 0.15, hw, bd, wallT, bw / 2, hw / 2, 0);
    b(g, bw / 2, hw, 0.15, wallT, -bw / 4, hw / 2, bd / 2);                       // moitié gauche fermée
    for (let x = -bw / 2; x <= bw / 2 + 0.01; x += bw / 4) for (const z of [-bd / 2, bd / 2]) b(g, 0.3, hw, 0.3, K.steelDark, x, hw / 2, z);
    gable(g, bw, bd, rh, hw, toleRoof, wallT, 0.3, 0, 0, 0);
    b(g, bw / 2 - 0.2, 0.05, bd - 0.4, K.granite[1], bw / 4, 0.03, 0);
    for (let k = 0; k < 5; k++) { const hb = cy(g, 0.75, 0.75, 1.3, K.sand, bw / 4 - 2 + (k % 3) * 1.5, 0.75 + (k > 2 ? 1.4 : 0), -bd / 2 + 2 + (k > 2 ? 0 : 0.2), 10); hb.rotation.z = PI / 2; }
    rb(g, 3.2, 0.9, 1.8, K.red, bw / 4 + 1, 0.85, 1.5, 0.1); for (const s of [-1, 1]) cy(g, 0.4, 0.4, 0.25, K.black, bw / 4 + 1 + s * 1.0, 0.4, 2.45, 10).rotation.x = PI / 2;   // remorque
    board(g, 'Défense d\'entrer', 'sauf si t\'as des croissants', '#e94f37', 2.6, 0.65, -bw / 4, 2, bd / 2 + 0.12, 0);
    return { h: hw + rh, door: { x: bw / 4, z: d / 2 } };
  }
  /** garage auto « du Piston Fou » : baie ouverte avec pont élévateur, pneus, bidons */
  function garage(g, rng, w, d) {
    const bw = w - 1, bd = Math.max(7, d - 3), hw = 5, zc = -d / 2 + 0.5 + bd / 2, fz = zc + bd / 2, bayW = 6, bayX = -bw / 2 + 0.6 + bayW / 2;
    const wm = K.white, band = K.blue;
    // murs : fond, côtés, façade autour de la baie
    b(g, bw, hw, 0.3, wm, 0, hw / 2, zc - bd / 2 + 0.15); b(g, 0.3, hw, bd, wm, -bw / 2 + 0.15, hw / 2, zc); b(g, 0.3, hw, bd, wm, bw / 2 - 0.15, hw / 2, zc);
    b(g, bw - (bayX + bayW / 2 + bw / 2), hw, 0.3, wm, (bayX + bayW / 2 + bw / 2) / 2, hw / 2, fz - 0.15);
    b(g, bayW + 0.6, hw - 4, 0.3, wm, bayX - 0.3, 4 + (hw - 4) / 2, fz - 0.15);
    b(g, 0.6, hw, 0.3, wm, -bw / 2 + 0.3, hw / 2, fz - 0.15);
    b(g, bw + 0.3, 0.3, bd + 0.3, K.steelDark, 0, hw + 0.15, zc); b(g, bw + 0.2, 0.8, 0.2, band, 0, hw - 0.6, fz + 0.05);
    // intérieur de la baie (sombre) + pont élévateur et voiture levée
    b(g, bw - 0.6, 0.06, bd - 0.6, K.granite[1], 0, 0.03, zc);
    for (const s of [-1, 1]) { b(g, 0.35, 3.6, 0.35, K.red, bayX + s * 1.6, 1.8, zc); b(g, 0.2, 0.15, 1.8, K.yellow, bayX + s * 1.1, 1.6, zc); }
    const car = grp(g, bayX, 1.75, zc, 0);
    rb(car, 1.8, 0.7, 3.8, K.shut[0], 0, 0.45, 0, 0.15); rb(car, 1.6, 0.6, 2, K.shut[0], 0, 1.05, -0.2, 0.12); b(car, 1.62, 0.45, 1.6, K.glass, 0, 1.05, -0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(car, 0.33, 0.33, 0.25, K.black, sx * 0.85, 0.1, sz * 1.2, 10).rotation.z = PI / 2;
    b(g, 2.4, 0.9, 0.7, K.red, bayX, 0.45, zc - bd / 2 + 0.7);                                // servante d'atelier
    // bureau vitré + enseigne
    const f = face(g, 'f', bw, bd, 0, zc);
    b(f, 3.2, 1.8, 0.12, K.glass, bw / 2 - 3, 1.7, 0.02); door(f, bw / 2 - 5.6, 1.1, 2.3, K.blue, {});
    const A = atlas('garage', [['Garage du Piston Fou', 'Réparations · Tuning · Prières', '#24457a', '#ffc93c'], ['Vidange 39 € (huile en option)', '', '#ffc93c', '#22262d']]);
    b(g, 8.4, 1.6, 0.2, K.black, 0, hw + 1, fz - 0.3); signPlane(g, A, 0, 8.2, 1.5, 0, hw + 1, fz - 0.18);
    signPlane(f, A, 1, 2.8, 0.7, bw / 2 - 3, 3.2, 0.06);
    // pneus et bidons
    for (let k = 0; k < 4; k++) cy(g, 0.45, 0.45, 0.3, K.black, bw / 2 - 0.8, 0.15 + k * 0.3, d / 2 - 0.8, 10);
    for (let k = 0; k < 2; k++) cy(g, 0.35, 0.35, 0.9, K.red, -bw / 2 + 0.6 + k * 0.75, 0.45, d / 2 - 0.6, 8);
    return { h: hw + 2, door: { x: bayX, z: fz } };
  }

  const GEN = { maison, longere, mitoyennes, immeuble, commerce, eglise, mairie, ecole, supermarche, ferme, chalet, refuge, hangar, garage };
  ML.Build = {
    types: Object.keys(GEN),
    sizes: DEF,
    shops: SHOPS.map(s => s.n),
    /** type : voir types ; rng : générateur déterministe (ML.U.rng) ; opts : { w, d, h, shop } */
    make(type, rng, opts) {
      opts = opts || {};
      const gen = GEN[type] || GEN.maison, D = DEF[type] || DEF.maison;
      const w = opts.w || D[0], d = opts.d || D[1];
      rng = rng || U.rng(1);
      const g = new THREE.Group();
      const info = gen(g, rng, w, d, opts) || {};
      const out = ST.merge(g);
      out.userData = { type: GEN[type] ? type : 'maison', w, d, h: info.h || 8, door: info.door || { x: 0, z: d / 2 }, shop: info.shop };
      return out;
    }
  };
})();
