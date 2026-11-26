/* =====================================================================
   style.js — DIRECTION ARTISTIQUE unique du jeu (chargé juste après util.js).
   Style « jouet low-poly » : aplats de couleur, ombrage toon à 3 tons,
   palette chaude d'une petite ville de l'Ouest (ardoise, crépi, granit),
   accents Lebec (bleu nuit + jaune). TOUT le rendu passe par ici :
   - ML.PAL    : la palette (une seule source de vérité pour les couleurs)
   - ML.Style.toon(color, emissive) : matériau toon partagé (mis en cache)
   - U.mat est redirigé vers ML.Style.toon → tous les anciens appels
     U.mat / U.box / U.cyl deviennent automatiquement « dans le style ».
   - ML.Style.rbox(w,h,d,r) : boîte aux arêtes adoucies (look jouet)
   - ML.Style.sky(scene)    : ciel en dégradé + nuages
   ===================================================================== */
(function () {
  const S = ML.Style = {};
  const U = ML.U;

  /* ---------- Palette ---------- */
  const P = ML.PAL = {
    // nature
    grass: 0x72a646, grassLight: 0x8bbb52, grassDark: 0x548a36, meadow: 0x9dbf5c,
    forest: 0x3f7d3a, forestLight: 0x5c9e43, pine: 0x2f6a46, trunk: 0x7a5236,
    rock: 0x84858c, rockDark: 0x5e6068, snow: 0xf6f3ec, sand: 0xe9d6a1, dirt: 0xb48a5a,
    water: 0x47b3d6, waterDeep: 0x2a7fa8, foam: 0xe8f7fb,
    // ville
    asphalt: 0x4b4f58, asphaltDark: 0x3c4048, curb: 0xd9d4c7, sidewalk: 0xcfc8b8,
    mark: 0xf7f2e2, markYellow: 0xffc93c, guard: 0xc9ced4,
    plaster: 0xf3e9d2, plasterWarm: 0xf0d9b5, white: 0xfbf8f1, granite: 0xb9b4ab, granite2: 0x9f9a92,
    slate: 0x4b5a6b, slateDark: 0x39444f, tile: 0xc8553d, brick: 0xb5523b,
    wood: 0xb07b46, woodDark: 0x7a5236, glass: 0x9fd3ff, glassDark: 0x2f5878,
    shutterBlue: 0x3d7ea6, shutterGreen: 0x4f9a6e, shutterRed: 0xb84a3a, shutterYellow: 0xe8b23a,
    // industrie
    steel: 0xb8c2cc, steelDark: 0x6b7784, cladding: 0xd6dde3, machine: 0xe3e8ec, machineDark: 0x2b3a4a,
    // marque Lebec & accents
    lebecBlue: 0x24457a, lebecYellow: 0xffc93c, red: 0xe94f37, orange: 0xf28c28, mint: 0x3ecf8e,
    purple: 0x8e6cd9, pink: 0xf28bb0, black: 0x22262d,
    // ciel
    skyTop: 0x4f9de0, skyHorizon: 0xbfe0f7, skyNightTop: 0x0f1530, skyNightHorizon: 0x2b3560, cloud: 0xffffff
  };

  /* ---------- Matériau toon ---------- */
  // 3 tons : ombre franche, ton moyen, lumière (filtrage « nearest » = bandes nettes)
  const grad = (() => {
    const d = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 238, 238, 238, 255]);
    const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  })();
  S.gradient = grad;
  const cache = {};
  /** Matériau toon partagé. opts : { map, transparent, opacity, side, flat, vertexColors } */
  S.toon = (color, emissive, opts) => {
    const k = (color === undefined ? 'x' : color) + '_' + (emissive || 0) + (opts ? '_' + (opts.key || JSON.stringify(Object.keys(opts).filter(x => x !== 'map').map(x => [x, opts[x]]))) + (opts.map ? '_' + opts.map.uuid : '') : '');
    if (cache[k]) return cache[k];
    const m = new THREE.MeshToonMaterial(Object.assign({ color: color === undefined ? 0xffffff : color, emissive: emissive || 0, gradientMap: grad }, opts && { map: opts.map || null, transparent: !!opts.transparent, opacity: opts.opacity === undefined ? 1 : opts.opacity, side: opts.side || THREE.FrontSide, vertexColors: !!opts.vertexColors }));
    if (opts && opts.flat) m.flatShading = true;
    return (cache[k] = m);
  };
  // tous les U.mat existants deviennent toon
  U.mat = (color, emissive) => S.toon(color, emissive);

  /* ---------- Géométries « jouet » ---------- */
  const gcache = {};
  /** Boîte aux arêtes chanfreinées (r = taille du chanfrein). Partagée par dimensions. */
  S.rbox = (w, h, d, r) => {
    r = Math.min(r === undefined ? 0.08 : r, w / 3, h / 3, d / 3);
    const k = [w, h, d, r].map(v => v.toFixed(3)).join('_');
    if (gcache[k]) return gcache[k];
    const x = w / 2, y = h / 2, z = d / 2, pts = [];
    // octogone extrudé = boîte chanfreinée sur les arêtes verticales + chanfreins haut/bas
    const ring = (yy, ins) => [[x - r - ins, z - ins], [x - ins, z - r - ins], [x - ins, -z + r + ins], [x - r - ins, -z + ins], [-x + r + ins, -z + ins], [-x + ins, -z + r + ins], [-x + ins, z - r - ins], [-x + r + ins, z - ins]].map(([a, b]) => [a, yy, b]);
    const rings = [ring(-y, r), ring(-y + r, 0), ring(y - r, 0), ring(y, r)];
    const pos = [];
    const quad = (a, b, c, dd) => { pos.push(...a, ...b, ...c, ...a, ...c, ...dd); };
    for (let i = 0; i < 3; i++) for (let j = 0; j < 8; j++) { const a = rings[i][j], b = rings[i][(j + 1) % 8], c = rings[i + 1][(j + 1) % 8], e = rings[i + 1][j]; quad(a, b, c, e); }
    for (let j = 1; j < 7; j++) { const t = rings[3], bt = rings[0]; pos.push(...t[0], ...t[j], ...t[j + 1]); pos.push(...bt[0], ...bt[j + 1], ...bt[j]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    pts.length = 0; return (gcache[k] = g);
  };
  /** Mesh boîte chanfreinée prête à poser (mêmes paramètres que U.box) */
  S.box = (w, h, d, mat, x, y, z, parent, r) => {
    const m = new THREE.Mesh(S.rbox(w, h, d, r), typeof mat === 'number' ? S.toon(mat) : mat);
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = m.receiveShadow = true; if (parent) parent.add(m); return m;
  };
  /** Couleur légèrement variée (déterministe si rng fourni) : évite l'effet « copier-coller » */
  S.vary = (hex, amt, rng) => { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl); const f = rng || Math.random; c.setHSL(hsl.h + (f() - 0.5) * amt * 0.1, Math.min(1, Math.max(0, hsl.s + (f() - 0.5) * amt * 0.3)), Math.min(1, Math.max(0, hsl.l + (f() - 0.5) * amt * 0.25))); return c.getHex(); };

  /* ---------- Ciel ---------- */
  S.sky = scene => {
    if (S.skyMesh) return S.skyMesh;
    const geo = new THREE.SphereGeometry(900, 24, 12), cols = [], top = new THREE.Color(P.skyTop), hor = new THREE.Color(P.skyHorizon);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = Math.max(0, Math.min(1, p.getY(i) / 500)); const c = hor.clone().lerp(top, Math.pow(k, 0.6)); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = S.skyMesh = new THREE.Mesh(geo, mat); sky.renderOrder = -10; sky.frustumCulled = false;
    sky.userData.base = cols.slice();
    // nuages : grappes de sphères aplaties, très « dessin animé »
    const cg = new THREE.Group(), cm = new THREE.MeshBasicMaterial({ color: P.cloud, fog: false, transparent: true, opacity: 0.95 }), r = U.rng(77);
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group(), a = r() * Math.PI * 2, d = 420 + r() * 300;
      g.position.set(Math.cos(a) * d, 140 + r() * 120, Math.sin(a) * d);
      for (let k = 0; k < 4 + Math.floor(r() * 4); k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cm); s.position.set((k - 2) * 18 + r() * 8, r() * 8, r() * 14); s.scale.set(22 + r() * 16, 12 + r() * 8, 18 + r() * 10); g.add(s); }
      g.lookAt(0, g.position.y, 0); cg.add(g);
    }
    sky.add(cg); S.clouds = cg;
    scene.add(sky);
    return sky;
  };
  /** k = 1 plein jour, 0 nuit ; gris = météo couverte (0..1) */
  S.setSky = (k, gris) => {
    if (!S.skyMesh) return;
    const col = S.skyMesh.geometry.attributes.color, p = S.skyMesh.geometry.attributes.position;
    const top = new THREE.Color(P.skyNightTop).lerp(new THREE.Color(P.skyTop), k), hor = new THREE.Color(P.skyNightHorizon).lerp(new THREE.Color(P.skyHorizon), k);
    if (gris) { const g = new THREE.Color(0x8a939b); top.lerp(g, gris * 0.7); hor.lerp(g, gris * 0.6); }
    for (let i = 0; i < p.count; i++) { const t = Math.max(0, Math.min(1, p.getY(i) / 500)); const c = hor.clone().lerp(top, Math.pow(t, 0.6)); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
    S.clouds.children.forEach(g => g.children.forEach(m => { m.material.opacity = 0.35 + 0.6 * k; }));
    S.horizon = hor;
  };
  S.follow = cam => { if (S.skyMesh) { S.skyMesh.position.set(cam.position.x, 0, cam.position.z); S.clouds.rotation.y += 0.00004; } };

  /* ---------- Panneaux / enseignes peints ---------- */
  /** Texture d'enseigne au style du jeu (police ronde et grasse, bord clair) */
  S.signTex = (text, sub, bg, fg, w, h) => {
    w = w || 1024; h = h || 256;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const r = h * 0.18; x.fillStyle = bg || '#24457a';
    x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, h, r); x.arcTo(w, h, 0, h, r); x.arcTo(0, h, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = h * 0.04; x.stroke();
    x.fillStyle = fg || '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = h * 0.44; const font = s => `900 ${s}px "Trebuchet MS", "Arial Rounded MT Bold", Arial`;
    x.font = font(fs); while (x.measureText(text).width > w * 0.92) { fs -= 3; x.font = font(fs); }
    x.fillText(text, w / 2, sub ? h * 0.42 : h * 0.52);
    if (sub) { x.globalAlpha = 0.85; let f2 = h * 0.17; x.font = font(f2); while (x.measureText(sub).width > w * 0.9) { f2 -= 2; x.font = font(f2); } x.fillText(sub, w / 2, h * 0.79); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  };
  S.hex = n => '#' + new THREE.Color(n).getHexString();

  /* ---------- Fusion (performances) ---------- */
  /** Fusionne tous les Mesh STATIQUES d'un groupe en 1 mesh par matériau (moins d'appels de dessin).
      Les sprites, lumières, objets avec userData.keep (animés) sont conservés tels quels.
      Renvoie un nouveau groupe positionné comme l'ancien. */
  S.merge = (group, opts) => {
    opts = opts || {};
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert ? new THREE.Matrix4().copy(group.matrixWorld).invert() : new THREE.Matrix4().getInverse(group.matrixWorld);
    const byMat = new Map(), keep = [];
    const special = o => o.userData.keep || o.isSprite || o.isLight || o.isInstancedMesh || o.isSkinnedMesh || (o.isMesh && Array.isArray(o.material));
    const walk = o => {
      for (const c of o.children.slice()) {
        if (special(c)) { keep.push(c); continue; }              // conservé tel quel (avec ses enfants)
        if (c.isMesh) {
          const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          if (!byMat.has(c.material)) byMat.set(c.material, []);
          byMat.get(c.material).push({ g, cast: c.castShadow });
        }
        walk(c);
      }
    };
    walk(group);
    const out = new THREE.Group(); out.position.copy(group.position); out.rotation.copy(group.rotation); out.scale.copy(group.scale);
    byMat.forEach((list, mat) => {
      let n = 0; list.forEach(l => (n += l.g.attributes.position.count));
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o3 = 0, o2 = 0;
      for (const { g } of list) {
        pos.set(g.attributes.position.array, o3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
        o3 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2; g.dispose();
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = opts.cast !== false && list.some(l => l.cast); mesh.receiveShadow = true; out.add(mesh);
    });
    // objets conservés (sprites, lumières, parties animées) : déplacés dans le nouveau groupe
    for (const o of keep) { const wm = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); o.parent && o.parent.remove(o); wm.decompose(o.position, o.quaternion, o.scale); out.add(o); }
    if (group.parent) { const p = group.parent; p.remove(group); p.add(out); }
    return out;
  };
})();
