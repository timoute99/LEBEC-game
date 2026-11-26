/* =====================================================================
   fx.js — Effets visuels côté client : feux de copeaux (flammes de
   dessin animé), bacs à copeaux, flaques d'huile, pigeon et chien de la
   casse (vrais petits modèles low-poly), passants variés, particules
   (extincteur, soufflette, fumée, copeaux, étincelles), marqueurs « viens
   ici » (ping). Rien de tout ça ne décide du jeu : c'est l'affichage de
   l'état envoyé par l'hôte. Les y reçus sont relatifs au sol : on ajoute
   ML.Terrain.h au rendu.
   ===================================================================== */
(function () {
  const F = ML.Fx = { fires: {}, puds: {}, piles: {}, pings: [], parts: [], root: null, peds: [] };
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

  /* ---------- Géométries / matériaux partagés ---------- */
  const BALL = new THREE.IcosahedronGeometry(1, 0), BALL1 = new THREE.IcosahedronGeometry(1, 1), CUBE = new THREE.BoxGeometry(1, 1, 1);
  const CURL = new THREE.TorusGeometry(0.5, 0.16, 4, 8, Math.PI * 1.5);
  // flamme : goutte d'eau pointue (profil tourné), partagée par tous les feux
  const FLAME = (() => { const p = []; for (let i = 0; i <= 8; i++) { const t = i / 8; p.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.85) * 0.5, t * 1.4 - 0.2)); } return new THREE.LatheGeometry(p, 7); })();
  const tm = (c, e) => S.toon(c, e);
  const mesh = (geo, col, parent, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, typeof col === 'number' ? tm(col) : col); m.position.set(x || 0, y || 0, z || 0); if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); m.castShadow = true; parent.add(m); return m; };
  const FIRE = [S.toon(PAL.red), S.toon(PAL.orange), S.toon(PAL.lebecYellow)];          // couleurs cuites ; la lueur vient de FIREMAT
  const PUD = S.toon(PAL.black, 0, { transparent: true, opacity: 0.82, key: 'flaque' }), SHEEN = [S.toon(PAL.purple, 0, { transparent: true, opacity: 0.2, key: 'reflet' }), S.toon(PAL.mint, 0, { transparent: true, opacity: 0.18, key: 'reflet' }), S.toon(PAL.white, 0, { transparent: true, opacity: 0.3, key: 'reflet' })];
  const CHIP = [S.toon(PAL.steel, 0, { flat: true }), S.toon(PAL.orange, 0, { flat: true }), S.toon(PAL.red, 0, { flat: true })];
  const PUD_GEO = new THREE.CircleGeometry(1, 14);
  const FIREMAT = S.toon(0xffffff, PAL.slateDark, { vertexColors: true, key: 'feu' });             // flammes cuites, éclaircies par l'émissif
  const BK = x => { x.userData.keep = true; return ML.Bake.bake(x); };                       // partie animée → 1 mesh, conservée par la fusion du parent

  F.reset = () => {
    if (F.root) ML.scene.remove(F.root);
    F.root = new THREE.Group(); ML.scene.add(F.root);
    F.fires = {}; F.puds = {}; F.piles = {}; F.pings = []; F.parts = []; F.pigeon = null; F.dog = null; F.pools = {};
    for (const v of F.peds || []) ML.People.dispose(v); F.peds = [];
  };

  /* ---------- Particules ---------- */
  const MATS = {};
  function pmat(color, op) { const k = color + '_' + op; if (MATS[k]) return MATS[k]; const m = S.toon(color, op >= 1 ? 0 : color, { transparent: op < 1, opacity: op, key: 'part' + op }).clone(); m.depthWrite = op >= 1; return (MATS[k] = m); }
  // Chaque type de particule = 1 InstancedMesh (1 appel de dessin pour toutes)
  const PCAP = 140;
  function pool(kind) {
    let P = F.pools[kind]; if (P) return P;
    const cfg = KIND[kind], im = new THREE.InstancedMesh(cfg[4], pmat(cfg[0], cfg[1]), PCAP);
    im.count = 0; im.frustumCulled = false; im.castShadow = false; F.root.add(im);
    return (F.pools[kind] = { im, list: [] });
  }
  // [couleur, opacité, vitesse, durée, géométrie, taille]
  const KIND = { spray: [PAL.white, 0.8, 9, 0.7, BALL, 0.09], blow: [PAL.foam, 0.5, 12, 0.45, BALL, 0.06], smoke: [PAL.rockDark, 0.5, 1.5, 1.6, BALL1, 0.17], chips: [PAL.steel, 1, 5, 0.9, CURL, 0.12], spark: [PAL.lebecYellow, 1, 6, 0.4, CUBE, 0.06] };
  F.emit = (kind, pos, dir, n) => {
    if (!F.root) return;
    const cfg = KIND[kind]; if (!cfg) return;
    const gy = H(pos.x, pos.z), P = pool(kind);
    for (let i = 0; i < (n || 6); i++) {
      if (P.list.length >= PCAP) P.list.shift();
      const m = new THREE.Object3D(); m.position.copy(pos);
      const s = cfg[2], v = new THREE.Vector3(dir.x * s + (Math.random() - 0.5) * s * 0.35, dir.y * s + (Math.random() - 0.3) * s * 0.3, dir.z * s + (Math.random() - 0.5) * s * 0.35);
      if (kind === 'smoke') v.set((Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6);
      const sz = cfg[5] * (1 + Math.random()); m.scale.setScalar(sz); m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      P.list.push({ m, v, sz, gy, smoke: kind === 'smoke', t0: cfg[3], t: cfg[3] * (0.7 + Math.random() * 0.6), g: kind === 'chips' ? 12 : kind === 'smoke' ? -0.5 : 2, spin: kind === 'chips' ? 8 : 0 });
    }
  };

  /* ---------- Ping « viens ici » ---------- */
  F.ping = (x, z, name, color) => {
    if (!F.root) return;
    const col = color || PAL.lebecYellow;
    const g = new THREE.Group(); g.position.set(x, H(x, z), z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 14, 8, 1, true), S.toon(col, col, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, key: 'ping' }));
    beam.material.depthWrite = false; beam.position.y = 7; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 20), S.toon(col, col, { side: THREE.DoubleSide, transparent: true, opacity: 0.85, key: 'ping2' }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    const pin = new THREE.Group(); pin.position.y = 2.2; g.add(pin);                       // grosse épingle qui rebondit
    mesh(BALL1, S.toon(col, col), pin, 0, 0.35, 0, 0.32); mesh(new THREE.ConeGeometry(0.22, 0.5, 8), S.toon(col, col), pin, 0, 0, 0).rotation.x = Math.PI;
    mesh(BALL1, PAL.white, pin, 0, 0.38, 0.24, 0.12);
    const l = U.label('📍 ' + name + ' : viens ici !', { size: 0.5, color: '#ffd257', depthTest: false }); l.position.y = 3.3; g.add(l);
    F.root.add(g); F.pings.push({ g, t: 6, ring, pin });
  };

  /* ---------- Chien de la casse (low-poly) ---------- */
  function buildDog() {
    const g = new THREE.Group(), fur = PAL.dirt, dark = PAL.woodDark;
    const b = new THREE.Group(); g.add(b);                                                    // corps (bascule quand il dort)
    TB(0.42, 0.38, 0.85, fur, 0, 0.58, 0, b, 0.14);
    TB(0.36, 0.2, 0.5, PAL.sand, 0, 0.44, 0.05, b, 0.08);                                  // ventre clair
    const head = new THREE.Group(); head.position.set(0, 0.82, 0.48); b.add(head);
    TB(0.36, 0.34, 0.34, fur, 0, 0, 0, head, 0.1);
    TB(0.22, 0.18, 0.24, PAL.sand, 0, -0.06, 0.24, head, 0.06);                            // museau
    mesh(BALL1, PAL.black, head, 0, -0.01, 0.37, 0.055, 0.045, 0.04);                          // truffe
    for (const sx of [-1, 1]) {
      mesh(BALL1, PAL.white, head, sx * 0.09, 0.07, 0.165, 0.05, 0.055, 0.025); mesh(BALL1, PAL.black, head, sx * 0.085, 0.065, 0.185, 0.026, 0.03, 0.015);
      const br = TB(0.1, 0.03, 0.03, dark, sx * 0.09, 0.13, 0.17, head, 0.01); br.rotation.z = -sx * 0.35;   // sourcils méchants
      const ear = TB(0.1, 0.18, 0.05, dark, sx * 0.17, 0.1, -0.04, head, 0.03); ear.rotation.z = sx * 0.5;
    }
    TB(0.08, 0.03, 0.03, PAL.white, 0.05, -0.13, 0.33, head, 0.01).rotation.z = 0.4;          // croc
    TB(0.4, 0.07, 0.38, PAL.red, 0, 0.66, 0.4, b, 0.03);                                      // collier
    for (let i = -1; i <= 1; i++) mesh(BALL, PAL.steel, b, i * 0.12, 0.66, 0.6, 0.03);
    const legs = []; for (const [x, z] of [[0.13, 0.28], [-0.13, 0.28], [0.13, -0.3], [-0.13, -0.3]]) {
      const p = new THREE.Group(); p.position.set(x, 0.45, z); b.add(p); legs.push(p);
      TB(0.12, 0.42, 0.12, fur, 0, -0.2, 0, p, 0.04); TB(0.14, 0.07, 0.17, dark, 0, -0.41, 0.03, p, 0.03);
    }
    const tail = new THREE.Group(); tail.position.set(0, 0.7, -0.42); b.add(tail);
    TB(0.07, 0.07, 0.34, fur, 0, 0.08, -0.13, tail, 0.03).rotation.x = -0.7;
    const headB = BK(head), legsB = legs.map(BK), tailB = BK(tail), bodyB = ML.Bake.bake(b);   // 7 appels de dessin au lieu de ~30
    const l = U.label('', { size: 0.5, bg: 'rgba(0,0,0,0)' }); l.position.y = 1.5; g.add(l);
    g.userData = { t: new THREE.Vector3(), h: 0, st: 1, legs: legsB, lab: l, seen: false, body: bodyB, tail: tailB, head: headB, lt: '' }; g.scale.setScalar(1.2);
    F.root.add(g); return g;
  }

  /* ---------- Pigeon (low-poly) ---------- */
  function buildPigeon() {
    const g = new THREE.Group(), grey = PAL.steel, dark = PAL.slate;
    const flat = c => S.toon(c, 0, { flat: true });
    mesh(BALL1, flat(grey), g, 0, 0, 0, 0.17, 0.15, 0.24);                                       // corps dodu
    mesh(BALL1, flat(PAL.purple), g, 0, 0.1, 0.13, 0.12, 0.1, 0.1);                               // gorge irisée
    mesh(BALL1, flat(PAL.mint), g, 0, 0.13, 0.15, 0.1, 0.07, 0.08);
    const head = new THREE.Group(); head.position.set(0, 0.2, 0.18); g.add(head);
    mesh(BALL1, flat(dark), head, 0, 0, 0, 0.09);
    mesh(new THREE.ConeGeometry(0.03, 0.09, 5), PAL.orange, head, 0, -0.01, 0.11).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) { mesh(BALL1, PAL.orange, head, sx * 0.065, 0.025, 0.04, 0.025); mesh(BALL1, PAL.black, head, sx * 0.08, 0.025, 0.045, 0.012); }
    const tail = TB(0.16, 0.03, 0.18, dark, 0, 0.02, -0.27, g, 0.01); tail.rotation.x = 0.25;
    const wl = new THREE.Group(), wr = new THREE.Group(); wl.position.set(0.13, 0.06, 0); wr.position.set(-0.13, 0.06, 0); g.add(wl, wr);
    for (const [w, sx] of [[wl, 1], [wr, -1]]) { TB(0.32, 0.035, 0.26, grey, sx * 0.15, 0, -0.02, w, 0.01); TB(0.07, 0.038, 0.24, dark, sx * 0.22, 0.003, -0.05, w, 0.01); TB(0.07, 0.038, 0.24, dark, sx * 0.3, 0.003, -0.05, w, 0.01); }
    for (const sx of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), PAL.pink, g, sx * 0.06, -0.17, 0.02); TB(0.05, 0.015, 0.07, PAL.pink, sx * 0.06, -0.23, 0.04, g, 0.005); }
    const loot = new THREE.Group(); loot.position.set(0, 0.17, 0.3); g.add(loot); loot.visible = false;        // plaquette volée dans le bec
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 3), S.toon(ML.TOOLS.plaquette.color, PAL.orange), loot, 0, 0, 0);
    const wlB = BK(wl), wrB = BK(wr), lootB = BK(loot), headB = BK(head);
    g.scale.setScalar(1.3); const out = ML.Bake.bake(g);
    out.userData = { wl: wlB, wr: wrB, loot: lootB, head: headB, t: new THREE.Vector3(), p: new THREE.Vector3(), seen: false };
    F.root.add(out); return out;
  }

  /* ---------- Passants : plusieurs « types » bien reconnaissables ---------- */
  const PED = [
    r => ({ look: { skin: r.pick(ML.SKINS), shirt: r.pick([PAL.plasterWarm, PAL.sand, PAL.shutterGreen]), pants: r.pick([PAL.slate, PAL.woodDark]), hair: PAL.white, height: r.range(1.58, 1.72), width: 1.1, mustache: r() < 0.6, baguette: true }, hat: 'beret' }),   // retraité à baguette
    r => ({ look: { skin: r.pick(ML.SKINS), shirt: r.pick([PAL.mint, PAL.pink, PAL.orange, PAL.shutterBlue]), pants: PAL.black, hair: r.pick(ML.HAIRS), height: r.range(1.7, 1.88), width: 0.9, shorts: true, longHair: r() < 0.4 }, hat: 'headband' }),   // joggeur
    r => ({ look: { skin: r.pick(ML.SKINS), shirt: r.pick([PAL.lebecYellow, PAL.red, PAL.shutterBlue, PAL.mint]), pants: r.pick([PAL.shutterBlue, PAL.slate]), hair: r.pick(ML.HAIRS), height: r.range(1.12, 1.3), width: 1.05, kid: true, backpack: r.pick([PAL.red, PAL.purple, PAL.orange]) }, hat: r() < 0.5 ? 'cap' : null }),   // enfant
    r => ({ look: { skin: r.pick(ML.SKINS), shirt: r.pick([PAL.pink, PAL.orange, PAL.water]), pants: PAL.sand, hair: r.pick(ML.HAIRS), height: r.range(1.65, 1.85), width: r.range(1.05, 1.3), shorts: true, camera: true, glasses: r() < 0.5 }, hat: 'straw' }),   // touriste
    r => ({ look: { skin: r.pick(ML.SKINS), shirt: r.pick([PAL.purple, PAL.pink, PAL.shutterRed]), pants: PAL.slateDark, hair: r.pick([PAL.white, PAL.granite]), height: r.range(1.5, 1.62), width: 1.15, longHair: true, glasses: true, bag: r.pick([PAL.brick, PAL.lebecBlue]) } }),   // mamie au sac à main
    r => ({ look: { skin: r.pick(ML.SKINS), shirt: PAL.white, pants: r.pick([PAL.slateDark, PAL.black]), hair: r.pick(ML.HAIRS), height: r.range(1.72, 1.9), width: 1, tie: r.pick([PAL.red, PAL.lebecBlue, PAL.purple]), glasses: r() < 0.4, beard: r() < 0.3 } }),   // employé de bureau
    r => ({ look: { skin: r.pick(ML.SKINS), shirt: r.pick([PAL.purple, PAL.black, PAL.shutterGreen]), pants: PAL.shutterBlue, hair: r.pick(ML.HAIRS), height: r.range(1.6, 1.78), width: 0.9, longHair: r() < 0.5 }, hat: r() < 0.6 ? 'beanie' : null })   // ado
  ];

  /** Tas de copeaux cuit (0 normal, 1 presque plein, 2 plein), géométrie partagée */
  const heapG = [];
  function heapGeo(lvl) {
    if (heapG[lvl]) return heapG[lvl];
    const t = new THREE.Group(), m = CHIP[lvl];
    mesh(BALL1, m, t, 0, 0, 0, 0.36, 0.2, 0.27);
    for (let i = 0; i < 6; i++) { const c = mesh(CURL, m, t, -0.22 + i * 0.09, 0.2 + (i % 2) * 0.05, ((i % 3) - 1) * 0.1, 0.09); c.rotation.set(i, i * 2, 0); }
    return (heapG[lvl] = ML.Bake.geo(t));
  }

  /* ---------- Mise à jour depuis l'état ---------- */
  F.sync = St => {
    if (!F.root || !St) return;
    // feux : flammes en couches (rouge > orange > jaune) sur un tas de braises
    const seenF = {};
    for (const f of St.fires || []) {
      seenF[f.id] = 1;
      let v = F.fires[f.id];
      if (!v) {
        v = new THREE.Group(); v.position.set(f.x, H(f.x, f.z), f.z); v.userData.c = [];
        mesh(BALL, S.toon(PAL.black, 0, { flat: true }), v, 0, 0.02, 0, 0.6, 0.18, 0.6);
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mesh(BALL, S.toon(PAL.red, PAL.orange), v, Math.cos(a) * 0.35, 0.06, Math.sin(a) * 0.35, 0.09); }
        for (let i = 0; i < 6; i++) {
          const a = i * 2.4, r = i ? 0.28 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r, s0 = i ? 0.55 + Math.random() * 0.25 : 0.95;
          const fl = new THREE.Group(); fl.position.set(x, 0.05, z); v.add(fl);
          for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(FLAME, FIRE[k]); const w = [1, 0.72, 0.45][k]; m.scale.set(w, [0.8, 1.02, 1.2][k], w); fl.add(m); }   // couches de plus en plus fines et hautes : pointes rouge / orange / jaune
          const flB = BK(fl); flB.children.forEach(m => { if (!m.isSprite) m.material = FIREMAT; m.castShadow = false; });
          flB.userData.s0 = s0; v.userData.c.push(flB);
        }
        v = ML.Bake.bake(v);
        F.root.add(v); F.fires[f.id] = v;
      }
      v.userData.hp = f.hp;
    }
    for (const id in F.fires) if (!seenF[id]) { F.root.remove(F.fires[id]); delete F.fires[id]; }
    // flaques d'huile (avec reflets irisés)
    const seenP = {};
    for (const p of St.puddles || []) {
      seenP[p.id] = 1;
      if (!F.puds[p.id]) {
        const g = new THREE.Group(); g.position.set(p.x, H(p.x, p.z) + 0.055, p.z); g.rotation.y = p.id * 1.7;
        const sq = 0.75 + (p.id % 3) * 0.12;
        const m = new THREE.Mesh(PUD_GEO, PUD); m.rotation.x = -Math.PI / 2; m.scale.set(p.r, p.r * sq, 1); m.receiveShadow = true; g.add(m);
        const blobs = [[0.55, 0.3, 0.35], [-0.5, -0.2, 0.3]];
        for (const [bx, bz, br] of blobs) { const b = new THREE.Mesh(PUD_GEO, PUD); b.rotation.x = -Math.PI / 2; b.position.set(bx * p.r, 0, bz * p.r); b.scale.setScalar(br * p.r); g.add(b); }
        SHEEN.forEach((sm, i) => { const s = new THREE.Mesh(PUD_GEO, sm); s.rotation.x = -Math.PI / 2; s.position.set((i - 1) * 0.2 * p.r, 0.004 + i * 0.002, (i % 2 ? -0.15 : 0.1) * p.r); s.scale.set(p.r * (0.22 - i * 0.05), p.r * 0.07, 1); g.add(s); });
        const gm = ML.Bake.bake(g); F.root.add(gm); F.puds[p.id] = gm;
      }
    }
    for (const id in F.puds) if (!seenP[id]) { F.root.remove(F.puds[id]); delete F.puds[id]; }
    // bacs à copeaux (niveau de remplissage = tas qui monte) + bac absent
    for (const id in F.piles) if (!St.machines[id] || !ML.World.machines[id]) { F.root.remove(F.piles[id]); delete F.piles[id]; }   // machine retirée
    for (const id in St.machines) {
      const W = ML.World.machines[id]; if (!W) continue;
      let b = F.piles[id];
      if (b && (Math.abs(b.position.x - W.chips.x) > 0.01 || Math.abs(b.position.z - W.chips.z) > 0.01)) b.position.set(W.chips.x, H(W.chips.x, W.chips.z), W.chips.z);   // machine déplacée
      if (!b) {
        b = new THREE.Group(); b.position.set(W.chips.x, H(W.chips.x, W.chips.z), W.chips.z);
        TB(0.8, 0.46, 0.6, PAL.slateDark, 0, 0.27, 0, b, 0.06); TB(0.84, 0.05, 0.64, PAL.slate, 0, 0.5, 0, b, 0.02);
        for (const x of [-0.3, 0.3]) for (const z of [-0.22, 0.22]) mesh(BALL, PAL.black, b, x, 0.04, z, 0.045);
        const fill = new THREE.Group(); fill.userData.keep = true; b.add(fill);
        const heap = new THREE.Mesh(heapGeo(0), ML.Bake.mat()); heap.castShadow = true; fill.add(heap);
        const lab = U.label('', { size: 0.28, color: '#ff6b6b' }); lab.position.y = 1.1; b.add(lab);
        b = ML.Bake.bake(b); b.userData = { fill, heap, lab };                            // bac = 1 mesh + tas = 1 mesh
        F.root.add(b); F.piles[id] = b;
      }
      const M = St.machines[id], k = (M.chips || 0) / 100;
      b.visible = M.bin !== false;
      const lv = Math.max(0.05, Math.min(1.2, k * 1.2)); b.userData.fill.position.y = 0.08 + 0.36 * lv; b.userData.fill.scale.set(1, Math.max(0.2, lv), 1); b.userData.fill.visible = k > 0.02;
      b.userData.heap.geometry = heapGeo(k >= 1 ? 2 : k > 0.7 ? 1 : 0);
      const t = k >= 1 ? 'BAC PLEIN !' : k > 0.75 ? 'bac ' + Math.round(k * 100) + ' %' : '';
      if (b.userData.lab.text !== t) { b.userData.lab.setText(t); b.userData.lab.text = t; }
    }
  };
  /** Données rapides (chien, passants, pigeon) */
  F.fast = f => {
    if (!F.root) return;
    if (f.dog) {
      if (!F.dog) F.dog = buildDog();
      const d = F.dog.userData; d.t.set(f.dog[0], 0, f.dog[1]); d.h = f.dog[2]; d.st = f.dog[3];
      if (!d.seen) { F.dog.position.copy(d.t); d.seen = true; }
    }
    if (f.ps) {
      while (F.peds.length < f.ps.length) {
        const i = F.peds.length, r = ML.U.rng(i * 7919 + 13), p = PED[i % PED.length](r);
        const v = ML.People.build(p.look, { name: '', hat: p.hat });
        F.peds.push(v);
      }
      f.ps.forEach(([x, z, h, down], i) => { const v = F.peds[i]; v.target.set(x, 0, z); v.tYaw = h; v.down = down; if (!v.seen) { v.pos.copy(v.target); v.seen = true; } });
    }
    if (!f.pg) return;
    if (!F.pigeon) F.pigeon = buildPigeon();
    const P = F.pigeon, d = P.userData;
    d.t.set(f.pg[0], f.pg[1], f.pg[2]); d.loot.visible = !!f.pg[3]; d.fly = !!f.pg[4];
    if (!d.seen) { d.p.copy(d.t); P.position.set(d.p.x, d.p.y + H(d.p.x, d.p.z), d.p.z); d.seen = true; }
  };

  F.update = (dt, St) => {
    if (!F.root) return;
    const t = performance.now() / 1000;
    for (const id in F.fires) {
      const v = F.fires[id], k = 0.5 + (v.userData.hp || 50) / 100;
      v.userData.c.forEach((c, i) => { const s = c.userData.s0 * k; c.scale.set(s * (1 + Math.sin(t * 9 + i) * 0.1), s * (0.85 + Math.sin(t * 13 + i * 2) * 0.25), s); c.rotation.z = Math.sin(t * 7 + i * 1.3) * 0.15; c.rotation.y = t * (1 + i * 0.3); });
      if (Math.random() < dt * 6) F.emit('smoke', new THREE.Vector3(v.position.x, v.position.y + 1.5, v.position.z), { x: 0, y: 1, z: 0 }, 1);
      if (Math.random() < dt * 4) F.emit('spark', new THREE.Vector3(v.position.x, v.position.y + 0.6, v.position.z), { x: 0, y: 0.6, z: 0 }, 1);
    }
    for (const kind in F.pools) {
      const P = F.pools[kind];
      P.list = P.list.filter(p => (p.t -= dt) > 0);
      P.list.forEach((p, i) => {
        p.v.y -= p.g * dt; p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.5);
        if (p.spin) { p.m.rotation.x += dt * p.spin; p.m.rotation.y += dt * p.spin * 0.7; }
        if (p.smoke) p.m.scale.setScalar(p.sz * (1 + (1 - p.t / p.t0) * 1.2));
        if (p.m.position.y < p.gy + 0.05) { p.m.position.y = p.gy + 0.05; p.v.set(0, 0, 0); p.spin = 0; }
        p.m.updateMatrix(); P.im.setMatrixAt(i, p.m.matrix);
      });
      P.im.count = P.list.length; P.im.instanceMatrix.needsUpdate = true;
    }
    for (const p of F.pings.slice()) {
      p.t -= dt; p.ring.scale.setScalar(1 + (6 - p.t) % 1);
      p.pin.position.y = 2.2 + Math.abs(Math.sin(t * 4)) * 0.4; p.pin.rotation.y = t * 2;
      if (p.t <= 0) { F.root.remove(p.g); F.pings.splice(F.pings.indexOf(p), 1); }
    }
    if (F.pigeon) {
      const P = F.pigeon, d = P.userData, k = Math.min(1, dt * 10), ox = d.p.x, oz = d.p.z;
      d.p.lerp(d.t, k);
      const dx = d.p.x - ox, dz = d.p.z - oz, mv = Math.abs(dx) + Math.abs(dz);
      if (mv > 0.001) P.rotation.y = Math.atan2(dx, dz);
      P.position.set(d.p.x, d.p.y + H(d.p.x, d.p.z) + 0.3, d.p.z);
      const flap = d.fly ? Math.sin(t * 25) * 0.9 : -1.15; d.wl.rotation.z = flap; d.wr.rotation.z = -flap;   // au repos : ailes repliées le long du corps
      // au sol : il picore en dodelinant de la tête (le fameux mouvement de pigeon)
      d.head.position.z = 0.18 + (d.fly ? 0 : Math.max(0, Math.sin(t * 8)) * 0.06); d.head.rotation.x = !d.fly && Math.sin(t * 1.3) > 0.6 ? 0.7 : 0;
      P.rotation.x = d.fly ? -0.25 : 0;
    }
    if (F.dog) {
      const D = F.dog, d = D.userData, k = Math.min(1, dt * 8), ox = D.position.x, oz = D.position.z;
      D.position.x = U.lerp(D.position.x, d.t.x, k); D.position.z = U.lerp(D.position.z, d.t.z, k); D.rotation.y = ML.U.lerpAngle(D.rotation.y, d.h, k);
      const mv = Math.hypot(D.position.x - ox, D.position.z - oz) / Math.max(dt, 1e-3), run = mv > 0.5;
      d.legs.forEach((l, i) => { l.rotation.x = run ? Math.sin(t * 18 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.2 : 0)) * 0.7 : 0; });
      const sleep = d.st === 0, angry = d.st === 2;
      d.tail.rotation.y = sleep ? 0 : Math.sin(t * (angry ? 25 : 10)) * 0.6;
      d.body.rotation.z = sleep ? 1.35 : 0; d.body.position.y = sleep ? -0.25 : run ? Math.abs(Math.sin(t * 18)) * 0.06 : 0;
      d.head.rotation.x = angry ? -0.2 + Math.sin(t * 30) * 0.05 : sleep ? 0.3 : Math.sin(t * 2) * 0.05;
      D.position.y = H(D.position.x, D.position.z);
      const lt = sleep ? '💤' : angry ? 'GRRR !' : ''; if (d.lt !== lt) { d.lab.setText(lt, angry ? '#ff6b6b' : '#ffffff'); d.lt = lt; }
    }
    for (const v of F.peds) {
      if (!v.seen) continue;
      ML.People.animate(v, dt, null);
      v.group.rotation.x = v.down ? -1.45 : 0; if (v.down) v.group.position.y = H(v.pos.x, v.pos.z) + 0.25;
    }
  };
})();
