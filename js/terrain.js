/* =====================================================================
   terrain.js — RELIEF de la carte (identique chez tous les joueurs : il
   ne dépend que de la graine de la partie).

   GÉOGRAPHIE (fixe dans les grandes lignes, détails tirés au hasard) :
   - au centre, le BASSIN de la ville (presque plat), l'atelier en (0,0)
     est toujours à l'altitude 0 ;
   - au nord, une CHAÎNE DE MONTAGNES avec un COL vers x≈120, et derrière
     un plateau d'altitude avec un LAC ;
   - à l'est, de hautes collines ; à l'ouest et au sud, un bocage vallonné ;
   - une RIVIÈRE descend de la montagne par l'ouest, passe derrière
     l'atelier et part vers le sud-est (sous l'autoroute).

   API :
   - ML.Terrain.h(x, z)   altitude du SOL (ponts compris) → à ajouter au
                          rendu de tout ce qui est posé par terre.
                          Convention : les y de la simulation et du réseau
                          restent RELATIFS au sol (debout = 0).
   - ML.Terrain.ground(x, z) altitude du terrain seul (sans les ponts)
   - ML.Terrain.water(x, z)  altitude de l'eau si (x,z) est dans la
                          rivière / le lac, sinon null
   - ML.Terrain.bounds, CELL, mapImage (canvas de la carte en relief)
   Construction (appelée par citygen.js / world.js) :
   init(seed) → carveRiver() → flattenRect()/flattenDisc() →
   imprintRoads(city) → mesh(root) / paintMap(city)
   ===================================================================== */
(function () {
  const T = ML.Terrain = {};
  const B = T.bounds = { minX: -600, maxX: 600, minZ: -450, maxZ: 750 };
  const CELL = T.CELL = 3;
  const NX = T.NX = Math.round((B.maxX - B.minX) / CELL) + 1, NZ = T.NZ = Math.round((B.maxZ - B.minZ) / CELL) + 1;
  let H = null, H0 = null, RIV = null, seedS = 1;
  T.bridges = []; T.lakes = []; T.river = [];

  /* ---------- Bruit déterministe (entiers uniquement : même résultat sur tous les navigateurs) ---------- */
  function hash(ix, iz, s) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
  }
  function vnoise(x, z, s) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, z, s, o) => { let f = 0, a = 0.5, k = 1, n = 0; for (let i = 0; i < o; i++) { f += a * vnoise(x * k, z * k, s + i * 17); n += a; k *= 2; a *= 0.5; } return f / n; };
  const ridged = (x, z, s, o) => { let f = 0, a = 0.5, k = 1, n = 0; for (let i = 0; i < o; i++) { const r = 1 - Math.abs(2 * vnoise(x * k, z * k, s + i * 31) - 1); f += a * r * r; n += a; k *= 2.1; a *= 0.5; } return f / n; };
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  T.noise = vnoise; T.fbm = fbm; T.hash = hash; T.sm = sm;

  /** Ligne de la falaise (z du milieu de la paroi) et hauteur du plateau */
  T.cliffZ = (x, s) => -110 + (fbm(x / 150 + 7.7, 1.3, (s || seedS) + 51, 3) - 0.5) * 40;
  T.cliffSpan = x => sm(-345, -255, x) * (1 - sm(255, 345, x));
  T.plateauH = (x, z, s) => 66 + 18 * fbm(x / 170, z / 170, (s || seedS) + 53, 3);
  T.cliff = (x, z, s) => {
    const zc = T.cliffZ(x, s), sp = T.cliffSpan(x), P = T.plateauH(x, z, s);
    const face = sm(zc + 26, zc - 26, z), ramp = sm(zc + 70, zc - 280, z);
    return P * (sp * face + (1 - sp) * ramp);
  };
  /** Altitude « naturelle » avant rivière et routes */
  function base(x, z, s) {
    const dB = Math.sqrt((x / 280) * (x / 280) + ((z - 150) / 270) * ((z - 150) / 270));
    let h = (fbm(x / 170, z / 170, s, 3) - 0.5) * 3.2;                               // bassin : ondulations douces
    const outer = sm(0.92, 1.55, dB);
    h += outer * (5 + 38 * fbm(x / 240 + 9.1, z / 240 - 3.7, s + 3, 4));            // bocage vallonné
    // chaîne nord (crête vers z = 590) avec un col vers x = 120
    const rise = sm(400, 585, z), back = sm(620, 720, z);
    const colMask = Math.max(0, 1 - ((x - 120) / 120) * ((x - 120) / 120));
    let mt = rise * (75 + 115 * ridged(x / 210, z / 210, s + 7, 5));
    mt *= 1 - 0.55 * colMask * (1 - back * 0.4);
    mt *= 1 - back * 0.45;                                                           // plateau derrière la crête
    // collines hautes de l'est
    const east = sm(290, 540, x) * (20 + 55 * fbm(x / 200 - 2.3, z / 200 + 4.4, s + 11, 4)) * (1 - sm(520, 650, z) * 0.3);
    h += Math.max(mt, east * (1 - rise * 0.6) + mt * 0.6);
    // l'ouest : un peu plus haut (bocage)
    h += sm(-260, -520, x) * 14 * fbm(x / 120, z / 120, s + 21, 3);
    // couloir de l'autoroute (sud) un peu plus doux
    h *= 1 - 0.45 * Math.max(0, 1 - Math.abs(z + 150) / 90) * sm(0.9, 1.3, dB);
    // FALAISE DU BEC : juste derrière l'atelier (au sud), un plateau à ~75 m. Paroi raide entre x = −300 et 300,
    // rampes douces au-delà (la « longue route sûre »). La route en corniche est taillée dans la paroi.
    h += T.cliff(x, z, s);
    // bordure de la carte : des collines qui ferment l'horizon
    const ex = Math.min(x - B.minX, B.maxX - x), ez = Math.min(z - B.minZ, B.maxZ - z), eb = Math.min(ex, ez);
    h += sm(90, 0, eb) * (35 + 45 * fbm(x / 90, z / 90, s + 41, 3));
    // atelier et sa cour : toujours à 0
    const ax = Math.max(0, Math.abs(x) - 40), az = Math.max(0, z > 0 ? z - 36 : -z - 40), da = Math.sqrt(ax * ax + az * az);
    h *= sm(0, 30, da);
    return h;
  }

  /* ---------- Grille ---------- */
  const idx = (i, k) => k * NX + i;
  const gx = x => (x - B.minX) / CELL, gz = z => (z - B.minZ) / CELL;
  const wx = i => B.minX + i * CELL, wz = k => B.minZ + k * CELL;
  function bil(A, x, z) {
    let fx = gx(x), fz = gz(z);
    fx = Math.max(0, Math.min(NX - 1.001, fx)); fz = Math.max(0, Math.min(NZ - 1.001, fz));
    const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k;
    const a = A[idx(i, k)], b = A[idx(i + 1, k)], c = A[idx(i, k + 1)], d = A[idx(i + 1, k + 1)];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  T.init = seed => {
    seedS = (seed % 100000) + 7;
    H = T.H = new Float32Array(NX * NZ); RIV = T.RIV = new Float32Array(NX * NZ).fill(1e9);
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) H[idx(i, k)] = base(wx(i), wz(k), seedS);
    T.bridges = []; T.lakes = []; T.river = []; T.ready = false; T.mapImage = null;
    return T;
  };
  /** Altitude naturelle (sans routes) au point x,z — pour profiler les routes */
  T.natural = (x, z) => bil(H0 || H, x, z);
  T.ground = (x, z) => (H ? bil(H, x, z) : 0);
  T.h = (x, z) => {
    if (!H) return 0;
    let h = bil(H, x, z);
    for (const b of T.bridges) {                                    // tabliers des ponts
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      const dx = b.bx - b.ax, dz = b.bz - b.az, L = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - b.ax) * dx + (z - b.az) * dz) / L));
      const px = b.ax + dx * t - x, pz = b.az + dz * t - z;
      if (px * px + pz * pz < b.rw * b.rw) { const y = b.ay + (b.by - b.ay) * t; if (y > h) h = y; }
    }
    return h;
  };
  T.water = (x, z) => {
    for (const L of T.lakes) { const dx = x - L.x, dz = z - L.z; if (dx * dx + dz * dz < L.r * L.r) return L.y; }
    if (!RIV || bil(RIV, x, z) > 0) return null;
    // altitude de l'eau : point de rivière le plus proche
    let best = 1e9, y = null;
    for (const p of T.river) { const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < best) { best = d; y = p.y; } }
    return y;
  };
  T.slope = (x, z) => { const e = 2; return Math.sqrt(Math.pow((T.ground(x + e, z) - T.ground(x - e, z)) / (2 * e), 2) + Math.pow((T.ground(x, z + e) - T.ground(x, z - e)) / (2 * e), 2)); };
  T.inside = (x, z, m) => x > B.minX + m && x < B.maxX - m && z > B.minZ + m && z < B.maxZ - m;

  /* ---------- Courbes ---------- */
  /** Lissage de Chaikin (garde les extrémités) */
  T.chaikin = (pts, it) => {
    for (let n = 0; n < (it || 2); n++) {
      const o = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 }); }
      o.push(pts[pts.length - 1]); pts = o;
    }
    return pts;
  };
  /** Rééchantillonne une polyligne tous les `step` mètres */
  T.resample = (pts, step) => {
    const out = [{ x: pts[0].x, z: pts[0].z }]; let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; let L = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)), t0 = 0;
      while (acc + L - t0 >= step) { const t = t0 + step - acc; out.push({ x: a.x + (b.x - a.x) * t / L, z: a.z + (b.z - a.z) * t / L }); t0 = t; acc = 0; }
      acc += L - t0;
    }
    const last = pts[pts.length - 1], q = out[out.length - 1];
    if (Math.sqrt((q.x - last.x) * (q.x - last.x) + (q.z - last.z) * (q.z - last.z)) > step * 0.4) out.push({ x: last.x, z: last.z }); else out[out.length - 1] = { x: last.x, z: last.z };
    return out;
  };
  /** Profil en long d'une route : altitude naturelle lissée + pente max (g) */
  T.profile = (pts, win, g, fixA, fixB) => {
    const raw = pts.map(p => T.natural(p.x, p.z)), y = raw.map((_, i) => {
      let s = 0, n = 0; for (let j = Math.max(0, i - win); j <= Math.min(raw.length - 1, i + win); j++) { s += raw[j]; n++; } return s / n;
    });
    if (fixA !== undefined && fixA !== null) y[0] = fixA; if (fixB !== undefined && fixB !== null) y[y.length - 1] = fixB;
    const d = i => Math.sqrt((pts[i].x - pts[i - 1].x) * (pts[i].x - pts[i - 1].x) + (pts[i].z - pts[i - 1].z) * (pts[i].z - pts[i - 1].z));
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < y.length; i++) { const m = g * d(i); if (i === y.length - 1 && fixB !== undefined && fixB !== null) continue; y[i] = Math.max(y[i - 1] - m, Math.min(y[i - 1] + m, y[i])); }
      for (let i = y.length - 2; i >= 0; i--) { const m = g * d(i + 1); if (i === 0 && fixA !== undefined && fixA !== null) continue; y[i] = Math.max(y[i + 1] - m, Math.min(y[i + 1] + m, y[i])); }
    }
    return y;
  };

  /* ---------- Rivière & lac ---------- */
  T.carveRiver = r => {
    H0 = T.H0 = Float32Array.from(H);
    const j = a => (r() - 0.5) * a;
    const ctrl = [[-190, 760], [-215, 600], [-255, 470], [-238, 350], [-262, 230], [-236, 110], [-222, 10], [-160, -62], [-60, -82], [60, -70], [175, -92], [300, -128], [420, -210], [520, -290], [640, -330]]
      .map(([x, z], i) => ({ x: x + (i > 0 && i < 14 ? j(40) : 0), z: z + (i > 0 && i < 14 && i < 6 ? j(30) : i >= 6 && i < 14 ? j(14) : 0) }));
    // le tronçon derrière l'atelier reste à distance de la cour
    ctrl.forEach(p => { if (p.x > -175 && p.x < 210) p.z = Math.max(-66, Math.min(-56, p.z)); });   // entre l'atelier et le pied de la falaise
    const pts = T.resample(T.chaikin(ctrl, 3), 8);
    // fond de la rivière : toujours en descente
    let run = 1e9; const n = pts.length;
    pts.forEach((p, i) => {
      const t = i / (n - 1), w = 3.5 + 6.5 * sm(0, 0.55, t);
      run = Math.min(run, T.natural(p.x, p.z) - 2.4); p.bed = run; p.y = run + 1.7; p.w = w;
    });
    T.river = pts.map(p => ({ x: p.x, z: p.z, y: p.y, w: p.w, bed: p.bed }));
    // creusement : lit + berges en pente douce
    for (let s = 0; s < n - 1; s++) {
      const a = pts[s], b = pts[s + 1], bank = 13, R = Math.max(a.w, b.w) + bank;
      const i0 = Math.max(0, Math.floor(gx(Math.min(a.x, b.x) - R))), i1 = Math.min(NX - 1, Math.ceil(gx(Math.max(a.x, b.x) + R)));
      const k0 = Math.max(0, Math.floor(gz(Math.min(a.z, b.z) - R))), k1 = Math.min(NZ - 1, Math.ceil(gz(Math.max(a.z, b.z) + R)));
      const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
        const x = wx(i), z = wz(k), t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
        const px = a.x + dx * t - x, pz = a.z + dz * t - z, d = Math.sqrt(px * px + pz * pz), w = a.w + (b.w - a.w) * t;
        const q = idx(i, k), rd = d - w; if (rd < RIV[q]) RIV[q] = rd;
        if (d > w + bank) continue;
        const bed = a.bed + (b.bed - a.bed) * t, top = H[q];
        const k2 = d < w * 0.55 ? 0 : sm(w * 0.55, w + bank, d), target = bed + (Math.max(top, bed + 2.6) - bed) * k2;
        if (target < H[q]) H[q] = target;
      }
    }
    // lac d'altitude (plateau nord) : cuvette + plan d'eau
    const lx = 130 + j(40), lz = 690 + j(20), lr = 42 + r() * 10;
    let ly = 1e9; for (let a = 0; a < 12; a++) ly = Math.min(ly, T.natural(lx + Math.cos(a) * lr, lz + Math.sin(a) * lr));
    ly -= 1.2;
    T.flattenDisc(lx, lz, lr * 0.75, ly - 3.5, 20, true);
    T.lakes.push({ x: lx, z: lz, r: lr * 0.95, y: ly });
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const dx = wx(i) - lx, dz = wz(k) - lz, rd = Math.sqrt(dx * dx + dz * dz) - lr * 0.95; const q = idx(i, k); if (rd < RIV[q]) RIV[q] = rd; }
    return T.river;
  };
  /** Distance au bord de l'eau (négatif = dans l'eau) */
  T.riverDist = (x, z) => (RIV ? bil(RIV, x, z) : 1e9);
  /** Distance au bord de route le plus proche (après imprintRoads ; 1e9 = loin) */
  T.roadDist = (x, z) => (T.RD ? Math.min(1e9, bil(T.RD, x, z)) : 1e9);

  /* ---------- Terrassements ---------- */
  /** Aplanit un rectangle orienté (cx,cz, demi-tailles hx,hz) à l'altitude y, avec un talus de `m` mètres */
  T.flattenRect = (cx, cz, hx, hz, y, m) => {
    m = m || 8; const R = Math.max(hx, hz) * 1.5 + m;
    const i0 = Math.max(0, Math.floor(gx(cx - R))), i1 = Math.min(NX - 1, Math.ceil(gx(cx + R))), k0 = Math.max(0, Math.floor(gz(cz - R))), k1 = Math.min(NZ - 1, Math.ceil(gz(cz + R)));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const ddx = Math.max(0, Math.abs(wx(i) - cx) - hx), ddz = Math.max(0, Math.abs(wz(k) - cz) - hz), d = Math.sqrt(ddx * ddx + ddz * ddz);
      if (d > m) continue; const q = idx(i, k), w = 1 - sm(0, m, d); H[q] = H[q] + (y - H[q]) * w;
    }
  };
  T.flattenDisc = (cx, cz, r, y, m, onlyDown) => {
    const R = r + m, i0 = Math.max(0, Math.floor(gx(cx - R))), i1 = Math.min(NX - 1, Math.ceil(gx(cx + R))), k0 = Math.max(0, Math.floor(gz(cz - R))), k1 = Math.min(NZ - 1, Math.ceil(gz(cz + R)));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const dx = wx(i) - cx, dz = wz(k) - cz, d = Math.sqrt(dx * dx + dz * dz) - r; if (d > m) continue;
      const q = idx(i, k), w = 1 - sm(0, m, Math.max(0, d)), v = H[q] + (y - H[q]) * w; if (!onlyDown || v < H[q]) H[q] = v;
    }
  };

  /** Imprime les routes dans le relief (déblais / remblais). Chaque arête est linéaire entre
      les altitudes de ses deux nœuds (node.y). Les arêtes e.bridge ne touchent pas le terrain. */
  T.imprintRoads = city => {
    const N = city.nodes, best = new Float32Array(NX * NZ).fill(1e9), tgt = new Float32Array(NX * NZ), band = new Float32Array(NX * NZ);
    const seg = (ax, az, ay, bx, bz, by, rw, skipWater, shelf) => {
      const R = rw + 28, i0 = Math.max(0, Math.floor(gx(Math.min(ax, bx) - R))), i1 = Math.min(NX - 1, Math.ceil(gx(Math.max(ax, bx) + R)));
      const k0 = Math.max(0, Math.floor(gz(Math.min(az, bz) - R))), k1 = Math.min(NZ - 1, Math.ceil(gz(Math.max(az, bz) + R)));
      const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
        const x = wx(i), z = wz(k), t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
        const px = ax + dx * t - x, pz = az + dz * t - z, d = Math.sqrt(px * px + pz * pz) - rw;
        const q = idx(i, k); if (d >= best[q]) continue;
        const y = ay + (by - ay) * t, diff = Math.abs(H[q] - y), m = shelf ? (H[q] > y ? Math.min(14, 2 + diff * 0.5) : 0.8) : Math.min(26, 5 + diff * 1.6);   // corniche : on taille la roche, on ne remblaie pas le vide
        if (d > m) continue;
        if (skipWater && RIV[q] < 1) continue;
        best[q] = d; tgt[q] = y; band[q] = m;
      }
    };
    for (const e of city.edges) { if (e.bridge) continue; const A = N[e.a], Bn = N[e.b]; seg(A.x, A.z, A.y, Bn.x, Bn.z, Bn.y, (e.rw || city.RW) + (e.corniche ? 0.4 : 1.2), false, !!e.corniche); }
    for (const n of N) seg(n.x, n.z, n.y, n.x + 0.01, n.z, n.y, n.cul ? city.RW + 4.5 : (n.rw || city.RW) + 1.2, n.bridge);
    T.RD = best;
    for (let q = 0; q < NX * NZ; q++) { if (best[q] > 1e8) continue; const d = best[q], w = d <= 0 ? 1 : 1 - sm(0, band[q], d); H[q] = H[q] + (tgt[q] - 0.02 - H[q]) * w; }
  };

  /* ---------- Rendu du terrain ---------- */
  const PAL = () => ML.PAL;
  /** Couleur du sol (style peint) */
  function groundColor(x, z, h, s, c, fieldMask) {
    const P = PAL(), r = vnoise(x / 9, z / 9, seedS + 5), r2 = vnoise(x / 40, z / 40, seedS + 6);
    let col = c.setHex(P.grass);
    if (r2 > 0.62) col.lerp(tmp.setHex(P.grassLight), 0.6); else if (r2 < 0.32) col.lerp(tmp.setHex(P.grassDark), 0.35);
    // parcelles du bocage (champs) en campagne plate
    if (fieldMask > 0) {
      const cx = Math.floor((x + (vnoise(x / 50, z / 50, seedS + 8) - 0.5) * 40) / 64), cz = Math.floor((z + (vnoise(x / 50 + 3, z / 50, seedS + 8) - 0.5) * 40) / 52), f = hash(cx, cz, seedS + 9);
      const fc = f < 0.14 ? 0xd9c46f : f < 0.3 ? 0xa9c95f : f < 0.4 ? 0xb89a68 : f < 0.55 ? 0x86b84f : null;
      if (fc) col.lerp(tmp.setHex(fc), 0.6 * fieldMask);
    }
    const rd = T.riverDist(x, z);
    if (rd < 5) col.lerp(tmp.setHex(rd < 1.5 ? P.sand : 0xc9b57e), rd < 1.5 ? 1 : 0.6);
    if (s > 0.7) col.lerp(tmp.setHex(P.rock), sm(0.7, 1.25, s));
    if (h > 105) col.lerp(tmp.setHex(P.rock), sm(105, 135, h + r * 12) * 0.8);
    if (h > 128) col.lerp(tmp.setHex(P.snow), sm(128, 145, h + r * 14 - s * 10));
    col.offsetHSL(0, 0, (r - 0.5) * 0.035);
    return col;
  }
  const tmp = new THREE.Color();
  T.fieldMask = (x, z) => {
    const dB = Math.sqrt((x / 280) * (x / 280) + ((z - 150) / 270) * ((z - 150) / 270));
    return sm(1.05, 1.3, dB) * (1 - sm(40, 70, T.ground(x, z))) * (1 - sm(0.18, 0.3, T.slope(x, z)));
  };
  /** Construit les morceaux de terrain (64 blocs) dans `root` */
  T.mesh = root => {
    const P = PAL(), CH = 50, mat = ML.Style.toon(0xffffff, 0, { vertexColors: true, key: 'terrain' });
    const c = new THREE.Color(), g = new THREE.Group(); g.name = 'terrain';
    const nrm = (i, k) => {
      const hl = H[idx(Math.max(0, i - 1), k)], hr = H[idx(Math.min(NX - 1, i + 1), k)], hd = H[idx(i, Math.max(0, k - 1))], hu = H[idx(i, Math.min(NZ - 1, k + 1))];
      const nx = (hl - hr) / (2 * CELL), nz = (hd - hu) / (2 * CELL), l = Math.sqrt(nx * nx + 1 + nz * nz); return [nx / l, 1 / l, nz / l];
    };
    for (let ck = 0; ck < NZ - 1; ck += CH) for (let ci = 0; ci < NX - 1; ci += CH) {
      const ni = Math.min(CH, NX - 1 - ci), nk = Math.min(CH, NZ - 1 - ck), vn = (ni + 1) * (nk + 1);
      const pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3), col = new Float32Array(vn * 3), ind = [];
      let v = 0;
      for (let k = 0; k <= nk; k++) for (let i = 0; i <= ni; i++, v++) {
        const I = ci + i, K = ck + k, x = wx(I), z = wz(K), h = H[idx(I, K)], n = nrm(I, K), s = Math.sqrt(1 - n[1] * n[1]) / Math.max(0.2, n[1]);
        pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z; nor[v * 3] = n[0]; nor[v * 3 + 1] = n[1]; nor[v * 3 + 2] = n[2];
        groundColor(x, z, h, s, c, fmCache ? fmCache[idx(I, K)] : 0); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      for (let k = 0; k < nk; k++) for (let i = 0; i < ni; i++) { const a = k * (ni + 1) + i, b = a + 1, cc = a + ni + 1, d = cc + 1; ind.push(a, cc, b, b, cc, d); }
      const geo = new THREE.BufferGeometry(); geo.setIndex(ind);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
    }
    // jupe autour de la carte (évite de voir « le bord du monde »)
    const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    const skirt = new THREE.Mesh(new THREE.RingGeometry(700, 2600, 40, 1), ML.Style.toon(P.grassDark));
    skirt.rotation.x = -Math.PI / 2; skirt.position.set(cx, 20, cz); g.add(skirt);
    const far = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), ML.Style.toon(0x7d8fa3, 0, { flat: true, key: 'loin' }), 48), o = new THREE.Object3D();
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2 + hash(i, 3, seedS) * 0.1, d = 980 + hash(i, 5, seedS) * 260, hh = 120 + hash(i, 7, seedS) * 220; o.position.set(cx + Math.cos(a) * d, hh / 2 + 10, cz + Math.sin(a) * d); o.scale.set(160 + hash(i, 9, seedS) * 160, hh, 160 + hash(i, 11, seedS) * 120); o.rotation.set(0, a, 0); o.updateMatrix(); far.setMatrixAt(i, o.matrix); }
    g.add(far);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(B.maxX - B.minX + 400, B.maxZ - B.minZ + 400), ML.Style.toon(P.grassDark)); under.rotation.x = -Math.PI / 2; under.position.set((B.minX + B.maxX) / 2, -8, (B.minZ + B.maxZ) / 2); g.add(under);
    root.add(g);
    return g;
  };
  let fmCache = null;
  /** Prépare le masque « champs » (après tous les terrassements) */
  T.finalize = () => {
    fmCache = new Float32Array(NX * NZ);
    for (let k = 0; k < NZ; k += 1) for (let i = 0; i < NX; i += 1) fmCache[idx(i, k)] = T.fieldMask(wx(i), wz(k));
    T.ready = true;
  };

  /** Eau : rivière (ruban qui suit la pente) et lacs */
  T.waterMesh = root => {
    const P = PAL(), g = new THREE.Group(), pts = T.river;
    const mat = ML.Style.toon(P.water, 0x0b3d52, { transparent: true, opacity: 0.88, key: 'eau' });
    const pos = [], ind = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz) || 1, p = pts[i], w = p.w + 2.2;
      pos.push(p.x - dz / L * w, p.y, p.z + dx / L * w, p.x + dz / L * w, p.y, p.z - dx / L * w);
      if (i > 0) { const q = (i - 1) * 2; ind.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setIndex(ind); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    const river = new THREE.Mesh(geo, mat); river.receiveShadow = true; g.add(river);
    // reflets « dessin animé » : petits traits clairs
    const foam = ML.Style.toon(P.foam, 0x557788);
    const fl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.05, 0.25), foam, Math.floor(pts.length / 2)), o = new THREE.Object3D(), rr = ML.U.rng(seedS);
    for (let i = 0, n = 0; i < pts.length - 1; i += 2, n++) { const p = pts[i], q = pts[i + 1]; o.position.set(p.x + (rr() - 0.5) * p.w, p.y + 0.05, p.z + (rr() - 0.5) * p.w); o.rotation.set(0, Math.atan2(q.x - p.x, q.z - p.z) + Math.PI / 2, 0); o.updateMatrix(); fl.setMatrixAt(n, o.matrix); }
    g.add(fl);
    for (const L of T.lakes) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(L.r + 4, 40), mat); m.rotation.x = -Math.PI / 2; m.position.set(L.x, L.y, L.z); g.add(m);
    }
    root.add(g); return g;
  };

  /** Image de la carte en relief (pour la mini-carte / la grande carte) */
  T.paintMap = (city, size) => {
    size = size || 600; const cv = document.createElement('canvas'); cv.width = size; cv.height = Math.round(size * (B.maxZ - B.minZ) / (B.maxX - B.minX));
    const x = cv.getContext('2d'), img = x.createImageData(cv.width, cv.height), c = new THREE.Color();
    for (let py = 0; py < cv.height; py++) for (let px = 0; px < cv.width; px++) {
      const X = B.minX + (px + 0.5) / cv.width * (B.maxX - B.minX), Z = B.minZ + (py + 0.5) / cv.height * (B.maxZ - B.minZ);
      const h = T.ground(X, Z), hl = T.ground(X - 4, Z - 4), shade = Math.max(-0.25, Math.min(0.25, (h - hl) * 0.06));
      const w = T.water(X, Z);
      if (w !== null && w > h) c.setHex(ML.PAL.water); else groundColor(X, Z, h, T.slope(X, Z), c, fmCache ? bil(fmCache, X, Z) : 0);
      c.offsetHSL(0, -0.1, shade - 0.06);
      const o = (py * cv.width + px) * 4; img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    T.mapImage = cv; return cv;
  };
})();
