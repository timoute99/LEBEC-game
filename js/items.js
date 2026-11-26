/* =====================================================================
   items.js — Définition des objets (communs à l'hôte et aux clients) :
   nom, icône, encombrement et modèle 3D. Un objet = { id?, type, d }.
   Modèles au style « jouet » : formes simples, un peu surdimensionnées
   pour rester lisibles, géométries et matériaux partagés.
   Contient aussi ML.Bake (utilisé par people.js, cars.js, fx.js) :
   « cuisson » des couleurs en COULEURS DE SOMMET pour fusionner un
   modèle entier en 1 seul mesh avec 1 matériau toon partagé.
   ===================================================================== */
(function () {
  /* ---------- ML.Bake : fusion avec couleurs de sommet (performances) ----------
     Les mesh opaques sans texture sont fusionnés en UN mesh (couleur du matériau
     + émissif → couleur de sommet) avec le matériau partagé ML.Bake.mat().
     Les mesh transparents / texturés / marqués material.userData.noBake sont
     fusionnés par matériau. Objets userData.keep, sprites, lumières, InstancedMesh :
     conservés tels quels (avec leurs enfants). */
  const B = ML.Bake = {};
  B.mat = () => ML.Style.toon(0xffffff, 0, { vertexColors: true, key: 'persos' });
  const bakeable = m => m && !Array.isArray(m) && !m.map && !m.transparent && !(m.userData && m.userData.noBake) && m.color;
  const special = o => o.userData.keep || o.isSprite || o.isLight || o.isInstancedMesh || o.isSkinnedMesh || (o.isMesh && Array.isArray(o.material));
  function collect(root, inv, baked, other, keep) {
    for (const c of root.children.slice()) {
      if (special(c)) { if (keep) keep.push(c); continue; }
      if (c.isMesh && c.visible !== false) {
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
        if (!g.attributes.normal) g.computeVertexNormals();
        (bakeable(c.material) ? baked : other).push({ g, m: c.material, cast: c.castShadow });
      }
      collect(c, inv, baked, other, keep);
    }
  }
  function concat(list, withColor) {
    let n = 0; list.forEach(l => (n += l.g.attributes.position.count));
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = withColor ? new Float32Array(n * 3) : null, uv = withColor ? null : new Float32Array(n * 2);
    let o3 = 0, o2 = 0;
    for (const { g, m } of list) {
      const k = g.attributes.position.count;
      pos.set(g.attributes.position.array, o3); nor.set(g.attributes.normal.array, o3);
      if (col) {
        const c = m.color.clone(); if (m.emissive) c.add(m.emissive.clone().multiplyScalar(0.7));
        const r = Math.min(1, c.r), gg = Math.min(1, c.g), b = Math.min(1, c.b);
        for (let i = 0; i < k; i++) { col[o3 + i * 3] = r; col[o3 + i * 3 + 1] = gg; col[o3 + i * 3 + 2] = b; }
      } else if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
      o3 += k * 3; o2 += k * 2; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); else geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere(); return geo;
  }
  const invOf = grp => { grp.updateMatrixWorld(true); return new THREE.Matrix4().copy(grp.matrixWorld).invert(); };
  /** Géométrie cuite (couleurs de sommet) de tout le contenu opaque d'un groupe, dans le repère du groupe */
  B.geo = grp => { const baked = []; collect(grp, invOf(grp), baked, [], null); return concat(baked, true); };
  /** Remplace grp (dans son parent) par un groupe fusionné ; renvoie le nouveau groupe. opts.mat : matériau du mesh cuit */
  B.bake = (grp, opts) => {
    opts = opts || {};
    const inv = invOf(grp), baked = [], other = [], keep = [];
    collect(grp, inv, baked, other, keep);
    const out = new THREE.Group();
    out.position.copy(grp.position); out.rotation.copy(grp.rotation); out.scale.copy(grp.scale);
    out.userData = grp.userData; out.visible = grp.visible; out.name = grp.name;
    if (baked.length) { const m = new THREE.Mesh(concat(baked, true), opts.mat || B.mat()); m.castShadow = opts.cast !== false && baked.some(l => l.cast); m.receiveShadow = true; out.add(m); }
    const byMat = new Map(); for (const l of other) { if (!byMat.has(l.m)) byMat.set(l.m, []); byMat.get(l.m).push(l); }
    byMat.forEach((list, mat) => { const m = new THREE.Mesh(concat(list, false), mat); m.castShadow = list.some(l => l.cast); m.receiveShadow = true; out.add(m); });
    for (const o of keep) { const wm = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); if (o.parent) o.parent.remove(o); wm.decompose(o.position, o.quaternion, o.scale); out.add(o); }
    if (grp.parent) { const p = grp.parent, i = p.children.indexOf(grp); p.remove(grp); p.add(out); }
    return out;
  };

  const I = ML.Items = {};
  const M = ML.MATERIALS, T = ML.TOOLS;

  I.TYPES = {
    brut_acier: { kind: 'brut', mat: 'acier', name: 'Brut ACIER', icon: '🔩' },
    brut_alu: { kind: 'brut', mat: 'alu', name: 'Brut ALU', icon: '🔩' },
    brut_inox: { kind: 'brut', mat: 'inox', name: 'Brut INOX', icon: '🔩' },
    brut_sp: { kind: 'brut', name: d => `Brut ${M[d.mat].label} #${d.oid}`, icon: '🧱' },     // fonderie / chaudronnerie
    plaquette: { kind: 'tool', tool: 'plaquette', name: 'Plaquette carbure', icon: '◆' },
    fraise: { kind: 'tool', tool: 'fraise', name: 'Fraise', icon: '🌀' },
    foret: { kind: 'tool', tool: 'foret', name: 'Foret', icon: '📍' },
    caisse: { bulky: true, name: d => `Caisse #${d.oid}` + (d.ctl ? ' ✔ contrôlée' : ''), icon: '📦' },
    piece: { name: d => `Petite pièce #${d.oid}` + (d.ctl ? ' ✔' : ''), icon: '⚙️', hint: 'Se lance (clic droit) : dans une benne, à un collègue…' },
    palette: { bulky: true, heavy: true, name: d => `GROSSE pièce #${d.oid} (palette)`, icon: '🏗️' },
    /* pièce entre deux opérations de la gamme : à porter à la machine suivante (sim.js) */
    encours: { bulky: d => d.size !== 's', name: d => `En-cours #${d.oid} → ${(ML.OPS[d.next] || { n: '?' }).n}` + (d.ctl ? ' ✔' : ''), icon: '⏩', hint: 'À porter à la machine de l’opération suivante (ou au marbre pour contrôle)' },
    rebut: { name: d => `REBUT #${d.oid} (${(M[d.mat] || { label: '?' }).label})`, icon: '♻️', hint: 'À jeter dans la BENNE (remboursement de la matière)' },
    machine: { bulky: true, heavy: true, name: d => `Caisse machine : ${(ML.CAREER && ML.CAREER.MACHINES[d.model] || { name: d.model }).name}`, icon: '🏭', hint: 'Fenwick ou transpalette → dans l\'atelier, puis E pour installer' },   // sim_build.js
    bac_plein: { bulky: true, name: 'Bac de copeaux PLEIN', icon: '🗑️', hint: 'À vider dans la benne à copeaux (dehors)' },
    bac_vide: { bulky: true, name: d => `Bac vide (pour ${d.mid || '?'})`, icon: '🪣', hint: 'À remettre sur sa machine' },
    matiere: { bulky: true, name: d => d.mat ? `Caisse ${M[d.mat].label} ×${d.q}` : "Caisse d'outils", icon: '🗃️' },
    viennoiseries: { name: 'Viennoiseries', icon: '🥐' },
    extincteur: { kind: 'equip', name: 'Extincteur', icon: '🧯', hint: 'Clic gauche maintenu : éteindre un feu' },
    cle: { kind: 'equip', name: 'Clé à molette', icon: '🔧', hint: 'E sur une machine en panne' },
    soufflette: { kind: 'equip', name: 'Soufflette', icon: '💨', hint: 'Clic gauche : souffler copeaux, flaques… et collègues' },
    jerrican: { kind: 'equip', name: "Jerrican d'essence", icon: '⛽', hint: 'E sur une voiture : +40 % d\'essence' },
    casque: { kind: 'equip', name: 'Casque de sécurité', icon: '⛑️' },
    convention: { kind: 'paper', name: d => d.signee ? 'Convention SIGNÉE' : 'Convention (à faire signer)', icon: '📝' },
    find: { name: d => ML.FINDS[d.k].name, icon: '⭐' }
  };
  I.def = it => I.TYPES[it.type];
  I.name = it => { const n = I.def(it).name; return typeof n === 'function' ? n(it.d || {}) : n; };
  I.icon = it => I.def(it).icon;
  const flag = (it, k) => { const v = it && I.def(it) && I.def(it)[k]; return !!(typeof v === 'function' ? v(it.d || {}) : v); };   // drapeau fixe ou selon d
  I.bulky = it => flag(it, 'bulky');
  I.heavy = it => flag(it, 'heavy');

  /* ---------- Briques partagées ---------- */
  const geo = {};
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
  const G = (k, f) => geo[k] || (geo[k] = f());
  const cylG = (rt, rb, h, seg) => G('c' + [rt, rb, h, seg].join('_'), () => new THREE.CylinderGeometry(rt, rb, h, seg || 12));
  const ballG = () => G('ball', () => new THREE.IcosahedronGeometry(1, 1));
  const tm = c => (typeof c === 'number' ? ML.Style.toon(c) : c);
  const add = (geom, col, parent, x, y, z) => { const m = new THREE.Mesh(geom, tm(col)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const cyl = (rt, rb, h, col, parent, x, y, z, seg) => add(cylG(rt, rb, h, seg), col, parent, x, y, z);
  const ball = (r, col, parent, x, y, z, sx, sy, sz) => { const m = add(ballG(), col, parent, x, y, z); m.scale.set(r * (sx || 1), r * (sy || 1), r * (sz || 1)); return m; };
  const box = (w, h, d, col, parent, x, y, z, r) => TB(w, h, d, tm(col), x, y, z, parent, r);

  /** Marquage au pochoir (texte noir sur fond transparent), matériau partagé par texte */
  const stencilMats = {};
  function stencilMat(text) {
    if (stencilMats[text]) return stencilMats[text];
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x = cv.getContext('2d');
    let fs = 84; const font = s => `900 ${s}px Impact, "Arial Black", Arial`;
    x.font = font(fs); while (x.measureText(text).width > 480 && fs > 20) { fs -= 3; x.font = font(fs); }
    x.fillStyle = ML.Style.hex(ML.PAL.black); x.textAlign = 'center'; x.textBaseline = 'middle'; x.globalAlpha = 0.85; x.fillText(text, 256, 68);
    x.globalCompositeOperation = 'destination-out'; x.globalAlpha = 1;                     // ponts du pochoir
    for (let i = 0; i < 512; i += 23) x.fillRect(i, 0, 3, 128);
    x.fillRect(0, 62, 512, 4);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 4;
    return (stencilMats[text] = ML.Style.toon(0xffffff, 0, { map: t, transparent: true, key: 'pochoir_' + text }));
  }
  /** Caisse de machine sur palette (taille selon le tier) : nom de la machine et « HAUT ↑ FRAGILE » au pochoir */
  function machineCrate(g, d) {
    const P = ML.PAL, Mc = (ML.CAREER && ML.CAREER.MACHINES[d.model]) || { tier: 1, type: 'tour', name: d.model || '?' };
    const t = Mc.tier || 0, w = 1.6 + t * 0.28 + (Mc.type === 'tour' ? 0.5 : 0), dp = 1.25 + t * 0.18, h = 1.3 + t * 0.2, y0 = 0.16;
    // palette
    for (let i = 0; i < 5; i++) box(w / 5 - 0.03, 0.04, dp + 0.1, P.wood, g, -w / 2 + w / 10 + i * w / 5, 0.14, 0, 0.01);
    for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) for (const z of [-dp / 2 + 0.05, 0, dp / 2 - 0.05]) box(0.16, 0.12, 0.16, P.woodDark, g, x, 0.06, z, 0.015);
    // caisse : panneaux + cadre en planches foncées
    box(w - 0.06, h - 0.06, dp - 0.06, P.wood, g, 0, y0 + h / 2, 0, 0.03);
    for (const y of [y0 + 0.05, y0 + h - 0.05]) { box(w, 0.1, 0.1, P.woodDark, g, 0, y, dp / 2 - 0.04, 0.02); box(w, 0.1, 0.1, P.woodDark, g, 0, y, -dp / 2 + 0.04, 0.02); box(0.1, 0.1, dp, P.woodDark, g, w / 2 - 0.04, y, 0, 0.02); box(0.1, 0.1, dp, P.woodDark, g, -w / 2 + 0.04, y, 0, 0.02); }
    for (const x of [-1, 1]) for (const z of [-1, 1]) box(0.1, h, 0.1, P.woodDark, g, x * (w / 2 - 0.04), y0 + h / 2, z * (dp / 2 - 0.04), 0.02);
    for (const s of [-1, 1]) { const k = box(0.06, 0.08, Math.hypot(dp, h) * 0.92, P.woodDark, g, s * (w / 2 + 0.005), y0 + h / 2, 0, 0.015); k.rotation.x = Math.atan2(h, dp); }   // écharpes latérales
    box(0.05, 0.05, dp + 0.03, P.lebecYellow, g, -w * 0.3, y0 + h - 0.02, 0, 0.01); box(0.05, 0.05, dp + 0.03, P.lebecYellow, g, w * 0.3, y0 + h - 0.02, 0, 0.01);   // feuillards
    // pochoirs (avant / arrière : nom ; côtés : HAUT ↑ FRAGILE)
    const plane = (text, pw, ph, x, y, z, ry) => { const m = new THREE.Mesh(G('pl' + pw.toFixed(2) + '_' + ph.toFixed(2), () => new THREE.PlaneGeometry(pw, ph)), stencilMat(text)); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
    const nm = Mc.name.toUpperCase();
    for (const s of [1, -1]) {
      plane(nm, w * 0.86, w * 0.86 / 4, 0, y0 + h * 0.62, s * (dp / 2 + 0.012), s > 0 ? 0 : Math.PI);
      plane('HAUT ↑ FRAGILE', w * 0.6, w * 0.6 / 4, 0, y0 + h * 0.3, s * (dp / 2 + 0.012), s > 0 ? 0 : Math.PI);
      plane('HAUT ↑ FRAGILE', dp * 0.9, dp * 0.9 / 4, s * (w / 2 + 0.012), y0 + h * 0.55, 0, s * Math.PI / 2);
    }
    // étiquette « tier » : pastille de couleur (rouillée → or)
    box(0.22, 0.22, 0.02, [P.brick, P.steel, P.lebecBlue, P.mint, P.lebecYellow][Math.min(4, t)], g, w / 2 - 0.25, y0 + h - 0.25, dp / 2 + 0.01, 0.01);
    return y0 + h;
  }

  /** Caisse en bois à lattes (bande de couleur facultative) */
  function crate(g, band, s) {
    const P = ML.PAL; s = s || 0.72;
    box(s - 0.04, s - 0.04, s - 0.04, P.wood, g, 0, s / 2, 0, 0.03);
    for (const y of [0.06, s - 0.06]) box(s + 0.01, 0.1, s + 0.01, P.woodDark, g, 0, y, 0, 0.02);           // cerclages haut / bas
    for (const x of [-1, 1]) for (const z of [-1, 1]) box(0.09, s, 0.09, P.woodDark, g, x * (s / 2 - 0.035), s / 2, z * (s / 2 - 0.035), 0.02);
    for (const sx of [-1, 1]) { const d = box(0.05, 0.07, s * 1.12, P.woodDark, g, sx * (s / 2 + 0.005), s / 2, 0, 0.015); d.rotation.x = Math.PI / 4; }   // croix latérales
    if (band) box(s + 0.02, 0.12, s + 0.02, band, g, 0, s * 0.5, 0, 0.02);
  }

  /** Modèle 3D d'un objet. opts.noLabel : pas d'étiquette (objet en main) */
  I.mesh = (it, opts) => {
    opts = opts || {};
    const g = new THREE.Group(), d = it.d || {}, U = ML.U, P = ML.PAL;
    switch (it.type) {
      /* --- bruts : formes ET couleurs différentes (rond acier, carré alu, hexagone inox) + bout peint --- */
      case 'brut_acier': { cyl(0.085, 0.085, 0.66, M.acier.color, g, 0, 0.085, 0, 12).rotation.z = Math.PI / 2; for (const x of [-0.31, 0.31]) cyl(0.088, 0.088, 0.07, P.red, g, x, 0.085, 0, 12).rotation.z = Math.PI / 2; break; }
      case 'brut_alu': { box(0.66, 0.15, 0.15, M.alu.color, g, 0, 0.075, 0, 0.02); for (const x of [-0.31, 0.31]) box(0.07, 0.156, 0.156, P.shutterBlue, g, x, 0.075, 0, 0.02); break; }
      case 'brut_inox': {                                                    // hexagonal, bleuté et brillant
        const b = cyl(0.09, 0.09, 0.66, P.glass, g, 0, 0.08, 0, 6); b.rotation.z = Math.PI / 2;
        for (const x of [-0.31, 0.31]) cyl(0.093, 0.093, 0.07, P.mint, g, x, 0.08, 0, 6).rotation.z = Math.PI / 2;
        ball(0.03, P.white, g, -0.1, 0.165, 0.02, 3, 0.4, 0.6); ball(0.02, P.white, g, 0.12, 0.165, 0.02, 2, 0.4, 0.6);
        break;
      }
      case 'brut_sp':
        if (d.mat === 'fonte') { cyl(0.24, 0.26, 0.26, M.fonte.color, g, 0, 0.13, 0, 8); cyl(0.1, 0.12, 0.14, M.fonte.color, g, 0, 0.32, 0, 8); cyl(0.05, 0.05, 0.06, P.rockDark, g, 0, 0.4, 0, 8); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; ball(0.04, P.rockDark, g, Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25); } }
        else { box(0.58, 0.07, 0.42, M.soude.color, g, 0, 0.035, 0, 0.015); for (const x of [-0.26, 0.26]) { box(0.07, 0.32, 0.42, M.soude.color, g, x, 0.19, 0, 0.015); for (let i = 0; i < 5; i++) ball(0.022, P.orange, g, x * 0.86, 0.075, -0.17 + i * 0.085, 1, 0.8, 1.3); } }
        break;
      /* --- outils coupants --- */
      case 'plaquette': {                                                   // étui noir + grosse plaquette triangulaire dorée
        box(0.28, 0.08, 0.22, P.black, g, 0, 0.04, 0, 0.02);
        const p = cyl(0.12, 0.12, 0.04, T.plaquette.color, g, 0, 0.1, 0, 3); p.rotation.y = Math.PI / 6;
        cyl(0.03, 0.03, 0.045, P.black, g, 0, 0.102, 0, 8);
        break;
      }
      case 'fraise': {                                                      // fraise 2 tailles : queue acier + goujures bleues torsadées
        cyl(0.05, 0.05, 0.16, P.steel, g, 0, 0.08, 0, 10);
        cyl(0.055, 0.055, 0.17, T.fraise.color, g, 0, 0.245, 0, 10);
        for (let i = 0; i < 3; i++) { const r = box(0.03, 0.17, 0.12, T.fraise.color, g, 0, 0.245, 0, 0.01); r.rotation.y = i * Math.PI / 3; r.rotation.z = 0.35; }
        break;
      }
      case 'foret': {                                                       // foret : queue + hélice orange + pointe
        cyl(0.028, 0.028, 0.14, P.steel, g, 0, 0.07, 0, 8);
        for (let i = 0; i < 4; i++) { const s = box(0.075, 0.05, 0.035, T.foret.color, g, 0, 0.17 + i * 0.045, 0, 0.01); s.rotation.y = i * 0.8; }
        cyl(0.025, 0.025, 0.18, T.foret.color, g, 0, 0.23, 0, 8);
        cyl(0, 0.032, 0.06, T.foret.color, g, 0, 0.35, 0, 8);
        break;
      }
      /* --- équipements --- */
      case 'extincteur': {
        cyl(0.12, 0.12, 0.5, P.red, g, 0, 0.27, 0, 12); ball(0.12, P.red, g, 0, 0.52, 0, 1, 0.6, 1);
        box(0.25, 0.14, 0.012, P.white, g, 0, 0.3, 0.12, 0.004); box(0.18, 0.03, 0.014, P.red, g, 0, 0.3, 0.123, 0.004);
        cyl(0.03, 0.03, 0.08, P.black, g, 0, 0.6, 0, 8); box(0.06, 0.04, 0.2, P.black, g, 0, 0.65, 0.04, 0.015);
        const hose = cyl(0.018, 0.018, 0.32, P.black, g, 0.1, 0.48, 0.06, 6); hose.rotation.z = 0.3;
        cyl(0.03, 0.02, 0.08, P.black, g, 0.14, 0.32, 0.08, 6);
        break;
      }
      case 'cle': {                                                         // clé à molette : manche + tête à mâchoire + molette
        box(0.08, 0.04, 0.36, P.steel, g, 0, 0.03, -0.04, 0.015);
        box(0.18, 0.045, 0.12, P.steel, g, 0, 0.03, 0.18, 0.02);
        box(0.06, 0.045, 0.1, P.steel, g, -0.06, 0.03, 0.27, 0.015); box(0.05, 0.04, 0.08, P.steelDark, g, 0.06, 0.03, 0.25, 0.015);
        cyl(0.03, 0.03, 0.05, P.steelDark, g, 0.03, 0.03, 0.13, 8).rotation.x = Math.PI / 2;
        box(0.07, 0.05, 0.16, P.red, g, 0, 0.035, -0.14, 0.02);                // poignée gainée
        break;
      }
      case 'soufflette': {                                                  // soufflette : poignée pistolet jaune + gâchette + buse + tuyau bleu
        box(0.07, 0.18, 0.09, P.lebecYellow, g, 0, 0.11, -0.02, 0.025);
        box(0.08, 0.07, 0.18, P.lebecYellow, g, 0, 0.22, 0.04, 0.025);
        box(0.025, 0.06, 0.03, P.black, g, 0, 0.15, 0.06, 0.008);
        cyl(0.018, 0.012, 0.3, P.steel, g, 0, 0.22, 0.28, 8).rotation.x = Math.PI / 2;
        cyl(0.025, 0.025, 0.06, P.steelDark, g, 0, 0.22, 0.14, 8).rotation.x = Math.PI / 2;
        const t = new THREE.Mesh(G('tuyau', () => new THREE.TorusGeometry(0.08, 0.02, 5, 12, Math.PI * 1.4)), tm(P.shutterBlue)); t.position.set(0, 0.04, -0.1); t.rotation.y = Math.PI / 2; g.add(t);
        break;
      }
      case 'jerrican': {
        box(0.32, 0.4, 0.17, P.red, g, 0, 0.2, 0, 0.05);
        for (const s of [-1, 1]) { const x = box(0.36, 0.035, 0.01, P.brick, g, 0, 0.19, 0.087, 0.005); x.rotation.z = s * 0.85; }
        box(0.14, 0.05, 0.05, P.black, g, -0.04, 0.43, 0, 0.015); box(0.06, 0.08, 0.06, P.lebecYellow, g, 0.11, 0.43, 0, 0.02);
        break;
      }
      case 'casque': { const m = new THREE.Mesh(G('dome', () => new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), tm(P.lebecYellow)); m.castShadow = true; g.add(m); cyl(0.24, 0.24, 0.02, P.lebecYellow, g, 0, 0.01, 0.02, 14); box(0.05, 0.05, 0.38, P.lebecYellow, g, 0, 0.17, 0, 0.02); break; }
      case 'convention': {
        box(0.36, 0.014, 0.26, P.white, g, 0, 0.008, 0, 0.004);
        for (let i = 0; i < 5; i++) box(0.24 - (i % 2) * 0.06, 0.004, 0.015, P.slate, g, -0.02, 0.016, -0.09 + i * 0.035, 0.001);
        cyl(0.045, 0.045, 0.012, d.signee ? P.mint : P.red, g, 0.11, 0.018, 0.08, 10);
        if (d.signee) box(0.12, 0.004, 0.012, P.lebecBlue, g, -0.03, 0.018, 0.09, 0.001).rotation.y = 0.3;
        break;
      }
      case 'viennoiseries': {                                               // sac en papier + croissant qui dépasse
        box(0.26, 0.3, 0.16, P.plasterWarm, g, 0, 0.15, 0, 0.03);
        box(0.265, 0.05, 0.165, P.wood, g, 0, 0.26, 0, 0.01);
        const c = new THREE.Mesh(G('croissant', () => new THREE.TorusGeometry(0.08, 0.045, 6, 10, Math.PI * 1.3)), tm(P.shutterYellow)); c.position.set(0, 0.33, 0); c.rotation.x = -0.4; c.castShadow = true; g.add(c);
        break;
      }
      case 'find': {
        const f = ML.FINDS[d.k];
        const m = new THREE.Mesh(G('oct', () => new THREE.OctahedronGeometry(0.24)), ML.Style.toon(f.color, f.color, { flat: true }));
        m.position.y = 0.45; m.userData.keep = true; g.add(m); g.userData.spin = m;
        break;
      }
      case 'piece': {                                                       // bride usinée : flasque, moyeu, alésage
        cyl(0.15, 0.15, 0.08, P.steel, g, 0, 0.04, 0, 14); cyl(0.09, 0.1, 0.1, P.steel, g, 0, 0.13, 0, 12);
        cyl(0.045, 0.045, 0.19, P.steelDark, g, 0, 0.1, 0, 8);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; cyl(0.018, 0.018, 0.085, P.slateDark, g, Math.cos(a) * 0.115, 0.045, Math.sin(a) * 0.115, 6); }
        if (d.ctl) ball(0.03, P.mint, g, 0.1, 0.1, 0.06);
        if (!opts.noLabel) { const l = U.label('#' + d.oid, { size: 0.2, fontSize: 40 }); l.position.y = 0.45; g.add(l); }
        break;
      }
      case 'palette': {                                                     // palette bois + grosse pièce usinée sanglée
        for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) box(0.2, 0.04, 1.0, P.wood, g, x, 0.13, 0, 0.01);
        for (const x of [-0.5, 0, 0.5]) for (const z of [-0.4, 0, 0.4]) box(0.14, 0.1, 0.14, P.woodDark, g, x, 0.055, z, 0.015);
        box(1.0, 0.68, 0.8, P.machine, g, 0, 0.5, 0, 0.08);
        cyl(0.33, 0.33, 0.92, P.steel, g, 0, 1.0, 0, 14).rotation.z = Math.PI / 2;
        cyl(0.12, 0.12, 0.94, P.steelDark, g, 0, 1.0, 0, 10).rotation.z = Math.PI / 2;
        for (const x of [-0.3, 0.3]) box(0.06, 0.72, 0.84, P.lebecYellow, g, x, 0.5, 0, 0.01);
        if (!opts.noLabel) { const o = ML.Game && ML.Game.order(d.oid); const l = U.label(`🏗 #${d.oid}` + (o ? ' → ' + ML.COMPANIES[o.client].name : ''), { size: 0.3, fontSize: 40, color: '#ffd257' }); l.position.y = 1.9; g.add(l); }
        break;
      }
      case 'machine': {                                                     // caisse de machine neuve (sim_build.js)
        const top = machineCrate(g, d);
        if (!opts.noLabel) { const l = U.label('🏭 ' + ((ML.CAREER && ML.CAREER.MACHINES[d.model]) || { name: d.model }).name, { size: 0.32, fontSize: 40, color: '#ffd257' }); l.position.y = top + 0.55; g.add(l); g.userData.label = l; }
        break;
      }
      case 'bac_plein': case 'bac_vide':
        box(0.8, 0.46, 0.6, P.slateDark, g, 0, 0.27, 0, 0.06);
        box(0.84, 0.05, 0.64, P.slate, g, 0, 0.5, 0, 0.02);
        for (const x of [-0.3, 0.3]) for (const z of [-0.22, 0.22]) cyl(0.04, 0.04, 0.04, P.black, g, x, 0.04, z, 8).rotation.z = Math.PI / 2;
        if (it.type === 'bac_plein') { const h = ball(0.36, P.steel, g, 0, 0.5, 0, 1, 0.38, 0.8); h.material = ML.Style.toon(P.steel, 0, { flat: true }); for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(G('copeau', () => new THREE.TorusGeometry(0.04, 0.012, 4, 8, Math.PI * 1.5)), tm(P.steelDark)); c.position.set(-0.22 + i * 0.11, 0.6 + (i % 2) * 0.03, (i % 3 - 1) * 0.1); c.rotation.set(i, i * 2, 0); g.add(c); } }
        break;
      case 'encours': {                                                     // caisse ouverte à bande orange : la pièce dépasse
        const sm = d.size === 's';
        crate(g, P.orange, sm ? 0.42 : 0.62);
        const y = sm ? 0.46 : 0.66;
        cyl(sm ? 0.08 : 0.12, sm ? 0.08 : 0.12, sm ? 0.2 : 0.3, (M[d.mat] || M.acier).color, g, 0, y, 0, 10);
        if (d.ctl) ball(0.04, P.mint, g, 0.15, y, 0.1);
        if (!opts.noLabel) { const op = ML.OPS[d.next]; const l = U.label(`⏩ #${d.oid} → ${op ? op.ic + ' ' + op.n : '?'}`, { size: 0.22, fontSize: 40, color: '#ffb35c' }); l.position.y = y + 0.35; g.add(l); g.userData.label = l; }
        break;
      }
      case 'rebut': {                                                       // pièce tordue, rayée de rouge
        const b = cyl(0.07, 0.09, 0.5, P.steelDark, g, 0, 0.09, 0, 8); b.rotation.z = Math.PI / 2 - 0.25;
        box(0.18, 0.05, 0.2, P.red, g, 0.12, 0.17, 0, 0.01).rotation.y = 0.6;
        if (!opts.noLabel) { const l = U.label(`♻ REBUT #${d.oid}`, { size: 0.2, fontSize: 40, color: '#ff8c7a' }); l.position.y = 0.5; g.add(l); }
        break;
      }
      case 'caisse': case 'matiere': {
        const band = it.type === 'caisse' ? (d.ctl ? P.mint : null) : (d.mat ? P.shutterBlue : P.orange);
        crate(g, band);
        if (it.type === 'matiere' && d.mat) for (const x of [-0.18, 0, 0.18]) cyl(0.06, 0.06, 0.3, M[d.mat].color, g, x, 0.75, 0, d.mat === 'inox' ? 6 : 10);   // barres qui dépassent
        if (it.type === 'matiere' && !d.mat) { box(0.2, 0.08, 0.12, P.red, g, -0.12, 0.76, 0, 0.02); cyl(0.04, 0.04, 0.2, T.fraise.color, g, 0.15, 0.8, 0, 8); }
        if (!opts.noLabel) {
          let t = '';
          if (it.type === 'caisse') { const o = ML.Game && ML.Game.order(d.oid); t = `#${d.oid}` + (o ? ' → ' + ML.COMPANIES[o.client].name : ''); }
          else t = d.mat ? `${M[d.mat].label} ×${d.q}` : 'OUTILS';
          const l = U.label(t, { size: 0.22, fontSize: 40 }); l.position.y = 0.95; g.add(l); g.userData.label = l;
        }
        break;
      }
    }
    // fusion des parties statiques (moins d'appels de dessin) ; étiquettes et objet qui tourne conservés
    if (g.children.length > 1) return ML.Bake.bake(g);
    return g;
  };
})();
