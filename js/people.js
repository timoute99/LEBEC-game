/* =====================================================================
   people.js — Personnages « jouet low-poly » (PNJ, avatars des joueurs,
   passants) : grosse tête (~1/4 de la hauteur), nez rond, grosses mains
   et gros godillots, yeux et sourcils expressifs. Étiquette du nom,
   bulle, émote, objet tenu en main, marche rebondie, poses, ragdoll.
   Le rendu est le même chez tous : la position vient du réseau.
   Les y du réseau sont RELATIFS AU SOL : on ajoute ML.Terrain.h au rendu.
   ===================================================================== */
(function () {
  const P = ML.People = {};
  const U = ML.U, S = ML.Style, PAL = ML.PAL;
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

  /* ---------- Géométries partagées ---------- */
  const BALL = new THREE.IcosahedronGeometry(1, 1);                 // boule low-poly (nez, mains, yeux)
  const DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);   // demi-sphère (casques, casquettes)
  const RING = new THREE.TorusGeometry(1, 0.16, 5, 14);               // monture de lunettes
  const cylC = {};
  const cylG = (rt, rb, h, seg) => { const k = [rt, rb, h, seg].join('_'); return cylC[k] || (cylC[k] = new THREE.CylinderGeometry(rt, rb, h, seg || 10)); };
  const mesh = (geo, col, parent, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, typeof col === 'number' ? S.toon(col) : col);
    m.position.set(x || 0, y || 0, z || 0); if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const ball = (r, col, parent, x, y, z, sx, sy, sz) => mesh(BALL, col, parent, x, y, z, r * (sx || 1), r * (sy || 1), r * (sz || 1));
  const cyl = (rt, rb, h, col, parent, x, y, z, seg) => mesh(cylG(rt, rb, h, seg), col, parent, x, y, z);
  const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();   // teinte dérivée (ombre du nez…)

  /* ---------- Texte dans le dos (blouse de Lebec) ---------- */
  const backTex = {};
  function backMat(text) {
    if (backTex[text]) return backTex[text];
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    const words = text.split(' '), lines = [], per = Math.ceil(text.length / 3);
    let cur = ''; for (const wd of words) { if (cur && (cur + ' ' + wd).length > per + 2) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; } lines.push(cur);
    const font = s => `900 ${s}px "Trebuchet MS", "Arial Rounded MT Bold", Arial`;
    x.font = font(48); const mw = Math.max(...lines.map(l => x.measureText(l).width)), fs = Math.min(84, 48 * 244 / mw, 236 / (lines.length * 1.1));
    x.font = font(fs); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    lines.forEach((l, i) => { const y = 128 + (i - (lines.length - 1) / 2) * fs * 1.1; x.strokeStyle = S.hex(PAL.black); x.lineWidth = fs * 0.18; x.strokeText(l, 128, y); x.fillStyle = S.hex(PAL.lebecYellow); x.fillText(l, 128, y); });
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    return (backTex[text] = S.toon(PAL.white, 0, { map: tex, transparent: true, key: 'dos_' + text }));
  }

  /** look : { skin, shirt, pants, hair, height, width, beard, glasses, mustache, longHair, cap, mask, apron, tie, blouse,
   *          backText, gloves, shovel, kid, baguette, bag, camera, backpack, angry, shorts }
   *  opts : { name, nameColor, helmet, hat, vest } */
  P.build = (look, opts) => {
    opts = opts || {};
    const s = (look.height || 1.78) / 1.8, w = look.width || 1, g = new THREE.Group(); g.rotation.order = 'YXZ';
    const o = { group: g, h: 1.86 * s, anim: Math.random() * 6, pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, tYaw: 0, speed: 0, heldKey: null };
    const skin = look.skin !== undefined ? look.skin : ML.SKINS[0], shirt = look.shirt !== undefined ? look.shirt : PAL.lebecBlue;
    const pants = look.pants !== undefined ? look.pants : PAL.slateDark, hair = look.hair !== undefined ? look.hair : PAL.woodDark;
    const coat = look.blouse, sleeve = coat || shirt, boots = PAL.black;
    const limb = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); return p; };

    /* --- jambes (pivot à la hanche) + gros godillots --- */
    const hipY = 0.78 * s;
    o.legL = limb(0.13 * w, hipY); o.legR = limb(-0.13 * w, hipY);
    for (const lg of [o.legL, o.legR]) {
      if (look.shorts) { TB(0.19 * w, 0.3 * s, 0.22, pants, 0, -0.14 * s, 0, lg, 0.05); TB(0.13, 0.38 * s, 0.14, skin, 0, -0.48 * s, 0, lg, 0.04); }
      else TB(0.19 * w, 0.64 * s, 0.22, pants, 0, -0.32 * s, 0, lg, 0.05);
      TB(0.22 * Math.sqrt(w), 0.16 * s, 0.34, boots, 0, -0.7 * s, 0.05, lg, 0.06);
      TB(0.23 * Math.sqrt(w), 0.04, 0.35, PAL.slate, 0, -0.77 * s, 0.05, lg, 0.015);           // semelle
    }

    /* --- tronc (statique, fusionné) --- */
    const body = new THREE.Group(); g.add(body);
    TB(0.5 * w, 0.18 * s, 0.3 * w, pants, 0, 0.83 * s, 0, body, 0.06);                          // bassin
    TB(0.52 * w, 0.05 * s, 0.31 * w, PAL.black, 0, 0.92 * s, 0, body, 0.02);                    // ceinture
    TB(0.09, 0.06 * s, 0.02, PAL.lebecYellow, 0, 0.92 * s, 0.16 * w, body, 0.01);                // boucle
    TB(0.56 * w, 0.42 * s, 0.32 * w, shirt, 0, 1.12 * s, 0, body, 0.09);                        // torse
    TB(0.24 * w, 0.06 * s, 0.3 * w, shirt, 0, 1.34 * s, 0, body, 0.03);                         // col
    cyl(0.075 * s, 0.085 * s, 0.1 * s, skin, body, 0, 1.36 * s, 0, 8);                               // cou
    if (look.apron) { TB(0.44 * w, 0.66 * s, 0.03, look.apron, 0, 0.98 * s, 0.17 * w, body, 0.01); TB(0.2 * w, 0.12 * s, 0.03, look.apron, 0, 1.22 * s, 0.168 * w, body, 0.01); }
    if (look.tie) { TB(0.08, 0.3 * s, 0.025, look.tie, 0, 1.15 * s, 0.17 * w, body, 0.01); TB(0.1, 0.06, 0.03, look.tie, 0, 1.31 * s, 0.17 * w, body, 0.015); }
    if (coat) {                                                        // blouse longue (Lebec, médecin)
      TB(0.6 * w, 0.88 * s, 0.36 * w, coat, 0, 0.9 * s + 0.02, 0, body, 0.08);
      for (const sx of [-1, 1]) { const lp = TB(0.12 * w, 0.26 * s, 0.03, shade(coat, 0.8), sx * 0.09 * w, 1.24 * s, 0.185 * w, body, 0.01); lp.rotation.z = sx * 0.35; }
      TB(0.12, 0.08, 0.02, PAL.white, 0.17 * w, 1.15 * s, 0.185 * w, body, 0.01);                  // poche + stylo
      TB(0.02, 0.1, 0.02, PAL.lebecBlue, 0.15 * w, 1.19 * s, 0.195 * w, body, 0.005);
      if (look.backText) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.6 * w, 0.6 * w), backMat(look.backText)); pl.position.set(0, 1.0 * s, -0.182 * w); pl.rotation.y = Math.PI; body.add(pl); }
    }
    if (opts.vest) {                                                   // gilet de rôle + bandes réfléchissantes
      TB(0.6 * w, 0.36 * s, 0.36 * w, opts.vest, 0, 1.13 * s, 0, body, 0.08);
      TB(0.61 * w, 0.045 * s, 0.365 * w, PAL.mark, 0, 1.06 * s, 0, body, 0.02);
      TB(0.61 * w, 0.045 * s, 0.365 * w, PAL.mark, 0, 1.2 * s, 0, body, 0.02);
    }
    if (look.camera) { TB(0.18, 0.12, 0.08, PAL.black, 0, 1.08 * s, 0.2 * w, body, 0.03); cyl(0.04, 0.045, 0.06, PAL.slate, body, 0, 1.08 * s, 0.26 * w, 8).rotation.x = Math.PI / 2; TB(0.03, 0.4 * s, 0.02, PAL.black, 0.07, 1.22 * s, 0.17 * w, body, 0.01).rotation.z = 0.5; }
    if (look.backpack) { TB(0.38 * w, 0.4 * s, 0.18, look.backpack, 0, 1.1 * s, -0.24 * w, body, 0.07); TB(0.3 * w, 0.14 * s, 0.06, shade(look.backpack, 0.8), 0, 1.0 * s, -0.34 * w, body, 0.03); }
    if (look.baguette) { const b = cyl(0.045, 0.045, 0.75, PAL.shutterYellow, body, 0.3 * w + 0.06, 1.12 * s, 0.02, 7); b.rotation.x = 1.25; b.rotation.z = -0.1; for (let i = -1; i <= 1; i++) { const n = TB(0.03, 0.012, 0.07, PAL.sand, 0.3 * w + 0.1, 1.12 * s + i * 0.07, 0.02 + i * 0.22, body, 0.005); n.rotation.y = 0.5; } }
    o.body = ML.Bake.bake(body);

    /* --- bras (pivot à l'épaule) : manche, avant-bras, grosse main ronde --- */
    const shY = 1.27 * s, shX = 0.28 * w + 0.08;
    o.armL = limb(shX, shY); o.armR = limb(-shX, shY);
    for (const a of [o.armL, o.armR]) {
      ball(0.1, sleeve, a, 0, -0.02, 0, 1, 0.9, 1);                                                   // épaule
      TB(0.15, 0.3 * s, 0.16, sleeve, 0, -0.15 * s, 0, a, 0.05);
      TB(0.12, 0.2 * s, 0.13, skin, 0, -0.37 * s, 0, a, 0.04);
      ball(look.gloves ? 0.11 : 0.09, look.gloves || skin, a, 0, -0.5 * s, 0.01, 1, 1.05, 1.1);
    }
    if (look.bag) { const bg = TB(0.26, 0.2, 0.1, look.bag, 0, -0.6 * s, 0.02, o.armL, 0.05); bg.rotation.z = 0.05; TB(0.02, 0.18, 0.02, PAL.black, 0, -0.47 * s, 0.02, o.armL, 0.005); }
    if (look.shovel) {
      const sh = new THREE.Group(); sh.position.set(0, -0.5 * s, 0.05); o.armR.add(sh);
      cyl(0.03, 0.03, 1.2, PAL.trunk, sh, 0, -0.35, 0.12, 6).rotation.x = 0.25;
      TB(0.34, 0.4, 0.05, PAL.steelDark, 0, -1.02, 0.28, sh, 0.04).rotation.x = 0.25;
      TB(0.18, 0.05, 0.05, PAL.black, 0, 0.26, -0.03, sh, 0.02).rotation.x = 0.25;
    }
    o.armL = ML.Bake.bake(o.armL); o.armR = ML.Bake.bake(o.armR);
    o.legL = ML.Bake.bake(o.legL); o.legR = ML.Bake.bake(o.legR);

    /* --- tête : gros bloc arrondi --- */
    const hs = (look.kid ? 1.22 : 1) * s;                              // les enfants ont une tête encore plus grosse
    const head = new THREE.Group(); head.position.y = 1.4 * s; g.add(head);
    const hw = 0.44 * hs, hh = 0.46 * hs, hd = 0.42 * hs, cy = hh / 2, fz = hd / 2, top = hh;
    TB(hw, hh, hd, skin, 0, cy, 0, head, 0.11 * hs);
    for (const sx of [-1, 1]) ball(0.06 * hs, skin, head, sx * hw / 2, cy, 0, 0.6, 1, 0.9);        // oreilles
    ball(0.075 * hs, shade(skin, 0.93), head, 0, cy - 0.03 * hs, fz + 0.035 * hs, 1, 0.9, 0.9);      // nez rond
    const angry = look.angry || look.shovel, eyeY = cy + 0.05 * hs;
    for (const sx of [-1, 1]) {
      ball(0.06 * hs, PAL.white, head, sx * 0.1 * hs, eyeY, fz - 0.005, 1, 1.25, 0.45);
      ball(0.032 * hs, PAL.black, head, sx * 0.09 * hs, eyeY - 0.005 * hs, fz + 0.018, 1, 1.3, 0.5);
      const br = TB(0.13 * hs, 0.035 * hs, 0.03, hair, sx * 0.1 * hs, eyeY + 0.1 * hs, fz + 0.01, head, 0.01);
      br.rotation.z = (angry ? -0.32 : 0.12) * sx;
    }
    TB(0.13 * hs, 0.03 * hs, 0.02, PAL.woodDark, 0, cy - 0.13 * hs, fz + 0.002, head, 0.008);  // bouche
    // cheveux
    const capped = look.cap || opts.helmet || opts.hat || look.mask;
    TB(hw + 0.03, 0.12 * hs, hd + 0.03, hair, 0, top - 0.03 * hs, -0.005, head, 0.05 * hs);
    TB(hw + 0.03, 0.26 * hs, 0.08 * hs, hair, 0, top - 0.15 * hs, -fz - 0.01, head, 0.03 * hs);
    for (const sx of [-1, 1]) TB(0.05 * hs, 0.18 * hs, 0.16 * hs, hair, sx * (hw / 2 + 0.01), top - 0.12 * hs, -0.08 * hs, head, 0.02);
    if (!capped) { const m = TB(0.22 * hs, 0.08 * hs, 0.12 * hs, hair, 0.06 * hs, top + 0.02 * hs, 0.1 * hs, head, 0.03 * hs); m.rotation.z = -0.25; }   // mèche
    if (look.longHair) TB(hw + 0.04, 0.5 * hs, 0.1 * hs, hair, 0, top - 0.3 * hs, -fz - 0.03, head, 0.04 * hs);
    if (look.beard) {
      TB(hw - 0.02, 0.16 * hs, 0.08 * hs, hair, 0, cy - 0.16 * hs, fz - 0.01, head, 0.04 * hs);
      for (const sx of [-1, 1]) TB(0.06 * hs, 0.22 * hs, 0.26 * hs, hair, sx * (hw / 2 + 0.005), cy - 0.07 * hs, 0.04 * hs, head, 0.02);
    }
    if (look.mustache) for (const sx of [-1, 1]) { const m = ball(0.075 * hs, hair, head, sx * 0.055 * hs, cy - 0.085 * hs, fz + 0.035 * hs, 1.1, 0.45, 0.6); m.rotation.z = sx * 0.3; }
    if (look.glasses) {
      for (const sx of [-1, 1]) { const r = mesh(RING, PAL.black, head, sx * 0.1 * hs, eyeY, fz + 0.03, 0.075 * hs); r.castShadow = false; }
      TB(0.06 * hs, 0.015, 0.015, PAL.black, 0, eyeY + 0.01, fz + 0.03, head, 0.005);
    }
    if (look.cap) { mesh(DOME, look.cap, head, 0, top - 0.06 * hs, 0, hw * 0.62, 0.22 * hs, hd * 0.62); TB(hw * 0.75, 0.03, 0.2 * hs, look.cap, 0, top - 0.05 * hs, fz + 0.06 * hs, head, 0.01); }
    if (look.mask) { const m = TB(0.42 * hs, 0.44 * hs, 0.06, PAL.slateDark, 0, top + 0.02, 0.06 * hs, head, 0.05); m.rotation.x = -1.2; TB(0.24 * hs, 0.08 * hs, 0.02, PAL.glassDark, 0, top + 0.02 + 0.03 * hs, 0.045 * hs, head, 0.01).rotation.x = -1.2; }
    if (opts.helmet) { mesh(DOME, opts.helmet, head, 0, top - 0.08 * hs, 0, hw * 0.66, 0.26 * hs, hd * 0.68); TB(hw + 0.06, 0.03, hd + 0.12, opts.helmet, 0, top - 0.07 * hs, 0.03, head, 0.015); TB(0.06, 0.22 * hs, hd * 1.3, opts.helmet, 0, top + 0.04 * hs, 0, head, 0.025); }
    switch (opts.hat) {                                                    // chapeaux de la boutique (+ passants)
      case 'cap': mesh(DOME, PAL.red, head, 0, top - 0.06 * hs, 0, hw * 0.62, 0.22 * hs, hd * 0.62); TB(hw * 0.75, 0.03, 0.22 * hs, PAL.red, 0, top - 0.05 * hs, fz + 0.07 * hs, head, 0.01); ball(0.03 * hs, PAL.white, head, 0, top + 0.15 * hs, 0); break;
      case 'beanie': mesh(DOME, PAL.lebecBlue, head, 0, top - 0.1 * hs, 0, hw * 0.64, 0.32 * hs, hd * 0.64); TB(hw + 0.05, 0.08 * hs, hd + 0.05, PAL.white, 0, top - 0.08 * hs, 0, head, 0.03); ball(0.07 * hs, PAL.white, head, 0, top + 0.22 * hs, 0); break;
      case 'hard': mesh(DOME, PAL.lebecYellow, head, 0, top - 0.08 * hs, 0, hw * 0.66, 0.28 * hs, hd * 0.68); TB(hw + 0.08, 0.03, hd + 0.14, PAL.lebecYellow, 0, top - 0.07 * hs, 0.03, head, 0.015); break;
      case 'straw': cyl(0.42 * hs, 0.42 * hs, 0.03, PAL.sand, head, 0, top - 0.02 * hs, 0, 14); cyl(0.19 * hs, 0.22 * hs, 0.17 * hs, PAL.sand, head, 0, top + 0.07 * hs, 0, 12); cyl(0.225 * hs, 0.225 * hs, 0.05 * hs, PAL.red, head, 0, top + 0.01 * hs, 0, 12); break;
      case 'beret': mesh(DOME, PAL.black, head, 0.03 * hs, top - 0.03 * hs, 0, hw * 0.66, 0.12 * hs, hd * 0.66).rotation.z = -0.2; cyl(0.01, 0.01, 0.06, PAL.black, head, 0.03 * hs, top + 0.1 * hs, 0, 5); break;
      case 'headband': TB(hw + 0.035, 0.07 * hs, hd + 0.035, PAL.red, 0, top - 0.1 * hs, 0, head, 0.03); break;
      case 'crown': {
        const gold = S.toon(PAL.lebecYellow, PAL.orange);
        cyl(0.2 * hs, 0.2 * hs, 0.08 * hs, gold, head, 0, top + 0.03 * hs, 0, 10);
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const c = cyl(0, 0.06 * hs, 0.14 * hs, gold, head, Math.sin(a) * 0.17 * hs, top + 0.14 * hs, Math.cos(a) * 0.17 * hs, 4); ball(0.025 * hs, i % 2 ? PAL.red : PAL.shutterBlue, head, Math.sin(a) * 0.205 * hs, top + 0.04 * hs, Math.cos(a) * 0.205 * hs); c.rotation.y = a; }
        break;
      }
    }
    o.head = ML.Bake.bake(head);

    o.hand = new THREE.Group(); o.hand.position.set(0, 1.05 * s, 0.38); g.add(o.hand);        // objet porté devant soi
    o.label = U.label(opts.name || '', { size: 0.24, color: opts.nameColor || '#ffe9a8' }); o.label.position.y = o.h + 0.3; g.add(o.label);
    o.bubble = U.label('', { size: 0.3, color: '#111', bg: 'rgba(255,255,255,0.93)' }); o.bubble.position.y = o.h + 0.65; g.add(o.bubble);
    o.emo = U.label('', { size: 0.7, bg: 'rgba(0,0,0,0)', fontSize: 80 }); o.emo.position.y = o.h + 1.3; g.add(o.emo); o.emoT = 0;
    o.s = s;
    ML.scene.add(g);
    return o;
  };

  /** Met à jour position (lissée vers la cible réseau) et animation (marche rebondie « dessin animé ») */
  P.animate = (o, dt, pose) => {
    const k = Math.min(1, dt * 12);
    const ox = o.pos.x, oz = o.pos.z;
    if (o.pos.distanceToSquared(o.target) > 64) o.pos.copy(o.target); else o.pos.lerp(o.target, k);
    o.yaw = U.lerpAngle(o.yaw, o.tYaw, k);
    const sp = Math.hypot(o.pos.x - ox, o.pos.z - oz) / Math.max(dt, 1e-3);
    o.speed = U.lerp(o.speed, sp, Math.min(1, dt * 10));
    const moving = o.speed > 0.4, run = Math.min(1, o.speed / 5);
    o.anim += dt * (moving ? Math.min(17, 4 + o.speed * 2.3) : 2);
    const amp = moving ? Math.min(0.95, 0.4 + o.speed * 0.1) : 0, sw = Math.sin(o.anim) * amp;
    o.legL.rotation.x = sw; o.legR.rotation.x = -sw; o.armL.rotation.x = -sw * 0.9; o.armR.rotation.x = sw * 0.9;
    o.armL.rotation.z = moving ? 0.08 + run * 0.12 : 0.05; o.armR.rotation.z = -o.armL.rotation.z;
    // rebond à chaque pas + tête qui dodeline ; au repos : respiration et coup d'œil
    let bounce = moving ? Math.abs(Math.sin(o.anim)) * (0.05 + run * 0.06) : 0;
    o.head.rotation.z = moving ? Math.sin(o.anim) * 0.07 : Math.sin(o.anim * 0.6) * 0.03;
    o.head.rotation.y = moving ? 0 : Math.sin(o.anim * 0.35) * 0.25;
    o.head.rotation.x = moving ? 0.06 * run : 0;
    o.body.rotation.x = moving ? 0.08 * run : 0;
    o.body.scale.y = moving ? 1 : 1 + Math.sin(o.anim * 1.4) * 0.012;
    if (o.heldKey) { o.armL.rotation.x = o.armR.rotation.x = -1.1; o.armL.rotation.z = 0.12; o.armR.rotation.z = -0.12; }
    if (pose === 'chase') o.armR.rotation.x = -2.6 + Math.sin(o.anim * 1.5) * 0.6;
    if (pose === 'box') { o.armL.rotation.x = -1.4 + Math.sin(o.anim * 3) * 0.5; o.armR.rotation.x = -1.4 - Math.sin(o.anim * 3) * 0.5; bounce = Math.abs(Math.sin(o.anim * 3)) * 0.06; }
    if (pose === 'stun') { o.group.rotation.z = Math.sin(o.anim * 6) * 0.25; o.head.rotation.y = Math.sin(o.anim * 4) * 0.5; } else o.group.rotation.z = 0;
    let lift = 0; o.group.rotation.x = 0;
    if (o.rag) {                                                           // ragdoll (coup de pelle, renversé…)
      const r = o.rag; r.t -= dt; r.vy -= 18 * dt; r.y = Math.max(0, r.y + r.vy * dt); if (r.y === 0) r.vy = 0;
      r.rot = Math.min(1.45, r.rot + dt * 6); lift = r.y + 0.25; bounce = 0;
      o.group.rotation.x = -r.rot; o.group.rotation.z = Math.sin(r.t * 9) * 0.2;
      o.legL.rotation.x = 0.6 + Math.sin(r.t * 20) * 0.5; o.legR.rotation.x = -0.4 - Math.sin(r.t * 17) * 0.5; o.armL.rotation.z = 1.2; o.armR.rotation.z = -1.2;
      if (r.t <= 0) o.rag = null;
    }
    if (o.emoT > 0) { o.emoT -= dt; o.emo.position.y = o.h + 1.2 + Math.sin(o.emoT * 6) * 0.08; if (o.emoT <= 0) o.emo.setText(''); }
    o.group.position.set(o.pos.x, H(o.pos.x, o.pos.z) + (o.pos.y || 0) + lift + bounce, o.pos.z);
    o.group.rotation.y = o.yaw;
    const dc = ML.camera ? Math.hypot(o.pos.x - ML.camera.position.x, o.pos.z - ML.camera.position.z) : 0, far = dc > 40;
    const has = sp => !!sp._k && sp._k[0] !== '|';                         // sprite non vide
    o.label.visible = !far && has(o.label);
    o.bubble.visible = !far && has(o.bubble);
    // très loin de la caméra : on ne dessine pas du tout (le jeu garde la main sur group.visible sinon)
    if (dc > 180) { if (o.group.visible) { o.group.visible = false; o._culled = true; } }
    else if (o._culled) { o.group.visible = true; o._culled = false; }
  };

  /** Affiche l'objet tenu (type) dans les mains */
  P.setHeld = (o, it) => {
    const key = it ? it.type + JSON.stringify(it.d || {}) : null;
    if (key === o.heldKey) return;
    o.heldKey = key;
    o.hand.clear();
    if (it) { const m = ML.Items.mesh(it, { noLabel: true }); m.position.y = -0.25; o.hand.add(m); }
  };
  P.setBubble = (o, text, fg) => { let t = text || ''; if (t.length > 46) t = t.slice(0, 44) + '…'; o.bubble.setText(t, fg); };
  P.dispose = o => { ML.scene.remove(o.group); };
  P.ragdoll = (o, power) => { o.rag = { t: 2.4, vy: power || 6, y: 0, rot: 0 }; };
  P.emote = (o, txt) => { o.emo.setText(txt); o.emoT = 2.5; };
})();
