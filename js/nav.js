/* =====================================================================
   nav.js — NAVIGATION DES PNJ (ML.Nav) : grille d'occupation + A*.
   Utilisé par l'hôte (sim.js, K.walkTo) pour que les PNJ contournent les
   murs, machines et cloisons au lieu de marcher en ligne droite.

   PRINCIPE
   - Grille de cases de 0,5 m construite PARESSEUSEMENT :
     · la « zone atelier » (bâtiment + pièces annexes + 6 m de marge, cour
       devant la porte comprise) — grille principale, gardée en cache ;
     · pour un petit trajet (< 80 m) qui sort de la zone : une grille
       temporaire sur le rectangle départ/arrivée (+ marge), en cache LRU.
     Case bloquée = centre dans un collider gonflé du rayon PNJ (0,35 m),
     sauf les colliders 'bound' (bords du monde).
   - Les grilles sont invalidées quand ML.colliders change (longueur, _v,
     premier/dernier objet : World.build vide et remplit la liste).
   - A* 8 voisins, sans couper les coins, heuristique octile ; puis lissage
     (string pulling par ligne de vue sur la grille).
   - Long trajet (> 80 m) vers / depuis l'extérieur : ligne droite dehors,
     A* seulement dans la zone en passant par la porte (ML.LOC.doorIn).
   - Cible dans un collider → case libre la plus proche. Départ dans une
     case bloquée (PNJ collé au mur) → idem.
   - Budget de calcul par pas de simulation (BUDGET ms) : au-delà, request()
     renvoie null et le PNJ attend le pas suivant. Cache des chemins.

   API
   - Nav.find(sx, sz, gx, gz) → { pts:[{x,z}…], ok, partial } (sans le départ).
   - Nav.request(n, x, z, frameKey) → tableau de points, ou null si le budget
     du pas est épuisé (réessayer au pas suivant). frameKey = S.rt.
   - Nav.blockedLine(ax, az, bx, bz) → true si un mur coupe le segment (zone).
   - Nav.freeNear(x, z) → {x,z} case libre la plus proche (zone ou null).
   - Nav.invalidate() : force la reconstruction des grilles.
   - Nav.debug(on) : calque à plat (cases bloquées en rouge, derniers chemins).
   - Nav.stats : compteurs (requêtes, cache, A*, ms, échecs).
   ===================================================================== */
(function () {
  const Nav = ML.Nav = {};
  const CS = Nav.CELL = 0.5;          // taille de case (m)
  const R = Nav.R = 0.35;             // rayon PNJ (gonflement des colliders)
  const LONG = 80;                    // au-delà : ligne droite hors de la zone
  const BUDGET = 1.5;                 // ms de A* par pas de simulation
  const SQ2 = Math.SQRT2;
  const stats = Nav.stats = { req: 0, hit: 0, astar: 0, ms: 0, fail: 0, pend: 0, rebuild: 0 };

  /* ---------- Version des colliders ---------- */
  let verKey = '', verObjA = null, verObjB = null, verN = -1, verV = -1, verRef = null, ver = 0;
  function checkVersion() {
    const L = ML.colliders || [];
    const a = L[0] || null, b = L[L.length - 1] || null;
    if (L !== verRef || L.length !== verN || (L._v || 0) !== verV || a !== verObjA || b !== verObjB) {
      verRef = L; verN = L.length; verV = L._v || 0; verObjA = a; verObjB = b; ver++;
      zone = null; temps.length = 0; cache.clear();
    }
    return ver;
  }
  Nav.invalidate = () => { verRef = null; checkVersion(); };

  /* ---------- Grilles ---------- */
  let zone = null;                    // grille principale (atelier)
  const temps = [];                   // grilles temporaires (LRU, 3 max)
  function zoneRect() {
    const W = ML.World || {}, A = W._at;
    let r = null;
    const ext = (x0, x1, z0, z1) => { if (!r) r = { minX: x0, maxX: x1, minZ: z0, maxZ: z1 }; else { r.minX = Math.min(r.minX, x0); r.maxX = Math.max(r.maxX, x1); r.minZ = Math.min(r.minZ, z0); r.maxZ = Math.max(r.maxZ, z1); } };
    if (A && A.box) {
      ext(A.box.minX, A.box.maxX, A.box.minZ, A.box.maxZ);
      for (const k in A.R || {}) { const q = A.R[k]; ext(q.x0, q.x1, q.z0, q.z1); }
    } else if (W.atelierBounds) { const b = W.atelierBounds(); ext(b.minX, b.maxX, b.minZ, Math.max(b.maxZ, 14)); }
    else ext(-48, 48, -44, 40);
    const d = ML.LOC && ML.LOC.doorIn; if (d) ext(d.x, d.x, d.z, d.z);
    // marge autour + cour devant la façade (z = 14) jusqu'à la sortie (z ≈ 24)
    r.minX -= 6; r.maxX += 6; r.minZ -= 6; r.maxZ = Math.max(r.maxZ + 6, 27);
    return r;
  }
  function makeGrid(rect) {
    const t0 = performance.now();
    const x0 = Math.floor(rect.minX / CS) * CS, z0 = Math.floor(rect.minZ / CS) * CS;
    const w = Math.ceil((rect.maxX - x0) / CS), h = Math.ceil((rect.maxZ - z0) / CS), N = w * h;
    const blk = new Uint8Array(N);
    const X1 = x0 + w * CS, Z1 = z0 + h * CS;
    for (const c of ML.colliders || []) {
      if (c.tag === 'bound') continue;
      const a = c.minX - R, b = c.maxX + R, e = c.minZ - R, f = c.maxZ + R;
      if (b <= x0 || a >= X1 || f <= z0 || e >= Z1) continue;
      // cases dont le CENTRE est strictement dans la boîte gonflée
      const i0 = Math.max(0, Math.floor((a - x0) / CS - 0.5) + 1), i1 = Math.min(w - 1, Math.ceil((b - x0) / CS - 0.5) - 1);
      const k0 = Math.max(0, Math.floor((e - z0) / CS - 0.5) + 1), k1 = Math.min(h - 1, Math.ceil((f - z0) / CS - 0.5) - 1);
      for (let k = k0; k <= k1; k++) { const o = k * w; for (let i = i0; i <= i1; i++) blk[o + i] = 1; }
    }
    stats.rebuild++;
    return { x0, z0, w, h, N, blk, rect: { minX: x0, maxX: X1, minZ: z0, maxZ: Z1 }, g: new Float32Array(N), par: new Int32Array(N), seen: new Uint32Array(N), gm: new Uint32Array(N), sid: 0, buildMs: performance.now() - t0, id: Math.random().toString(36).slice(2, 7) };
  }
  function getZone() { checkVersion(); if (!zone) zone = makeGrid(zoneRect()); return zone; }
  function inRect(G, x, z, m) { m = m || 0; return x > G.rect.minX + m && x < G.rect.maxX - m && z > G.rect.minZ + m && z < G.rect.maxZ - m; }
  function getTemp(rect) {
    checkVersion();
    for (let i = 0; i < temps.length; i++) { const G = temps[i]; if (rect.minX >= G.rect.minX && rect.maxX <= G.rect.maxX && rect.minZ >= G.rect.minZ && rect.maxZ <= G.rect.maxZ) { temps.splice(i, 1); temps.unshift(G); return G; } }
    // arrondi à 8 m pour réutiliser la grille entre trajets voisins
    const q = v => Math.floor(v / 8) * 8, Q = v => Math.ceil(v / 8) * 8;
    const G = makeGrid({ minX: q(rect.minX), maxX: Q(rect.maxX), minZ: q(rect.minZ), maxZ: Q(rect.maxZ) });
    temps.unshift(G); if (temps.length > 3) temps.pop();
    return G;
  }

  /* ---------- Outils de grille ---------- */
  const cx = (G, i) => G.x0 + (i + 0.5) * CS, cz = (G, k) => G.z0 + (k + 0.5) * CS;
  const cellOf = (G, x, z) => { const i = Math.floor((x - G.x0) / CS), k = Math.floor((z - G.z0) / CS); return (i < 0 || k < 0 || i >= G.w || k >= G.h) ? -1 : k * G.w + i; };
  /** Case libre la plus proche (anneaux carrés jusqu'à maxR cases) */
  function nearestFree(G, x, z, maxR) {
    const i0 = Math.floor((x - G.x0) / CS), k0 = Math.floor((z - G.z0) / CS);
    let best = -1, bd = 1e9;
    for (let r = 0; r <= (maxR || 16); r++) {
      for (let k = k0 - r; k <= k0 + r; k++) {
        if (k < 0 || k >= G.h) continue;
        const edge = k === k0 - r || k === k0 + r;
        for (let i = i0 - r; i <= i0 + r; i += (edge ? 1 : 2 * r || 1)) {
          if (i < 0 || i >= G.w) continue;
          const c = k * G.w + i; if (G.blk[c]) continue;
          const d = (cx(G, i) - x) ** 2 + (cz(G, k) - z) ** 2; if (d < bd) { bd = d; best = c; }
        }
      }
      if (best >= 0 && r * CS > Math.sqrt(bd)) break;  // plus rien de plus proche possible
    }
    return best;
  }
  /** Ligne de vue sur la grille (échantillonnage tous les CS/3) */
  function los(G, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.ceil(L / (CS / 3));
    for (let s = 1; s < n; s++) {
      const t = s / n, c = cellOf(G, ax + dx * t, az + dz * t);
      if (c < 0 || G.blk[c]) return false;
    }
    return true;
  }

  /* ---------- A* (tas binaire) ---------- */
  let hI = new Int32Array(4096), hF = new Float32Array(4096), hN = 0;
  function hPush(i, f) {
    if (hN >= hI.length) { const a = new Int32Array(hI.length * 2); a.set(hI); hI = a; const b = new Float32Array(hF.length * 2); b.set(hF); hF = b; }
    let p = hN++;
    while (p > 0) { const q = (p - 1) >> 1; if (hF[q] <= f) break; hI[p] = hI[q]; hF[p] = hF[q]; p = q; }
    hI[p] = i; hF[p] = f;
  }
  function hPop() {
    const top = hI[0], li = hI[--hN], lf = hF[hN]; let p = 0;
    for (;;) {
      let c = 2 * p + 1; if (c >= hN) break;
      if (c + 1 < hN && hF[c + 1] < hF[c]) c++;
      if (hF[c] >= lf) break;
      hI[p] = hI[c]; hF[p] = hF[c]; p = c;
    }
    hI[p] = li; hF[p] = lf; return top;
  }
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DK = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, SQ2, SQ2, SQ2, SQ2];
  /** A* de la case s à la case t. Renvoie la liste de cases (s→t) ; si t
      inaccessible, chemin vers la case explorée la plus proche (partial).
      Multi-cible (mg = { tx, tz, k }) : cible dans un obstacle → les cases
      libres marquées G.gm === G.sid autour sont toutes des arrivées possibles,
      coût final = chemin + k × distance restante à la vraie cible (évite de
      choisir la case libre « de l'autre côté du mur »). */
  function astar(G, s, t, mg) {
    stats.astar++;
    // marquage : seen = sid*2 (ouvert) / sid*2+1 (fermé) → pas de remise à zéro
    G.sid++; if (G.sid > 0x7ffffff0) { G.sid = 1; G.seen.fill(0); }
    const O = G.sid * 2, CL = O + 1, w = G.w, h = G.h, blk = G.blk, g = G.g, par = G.par, seen = G.seen;
    const ti = t % w, tk = (t / w) | 0;
    const H = mg ? c => Math.hypot(c % w + 0.5 - mg.tx, ((c / w) | 0) + 0.5 - mg.tz)
      : c => { const dx = Math.abs(c % w - ti), dz = Math.abs(((c / w) | 0) - tk); return (dx + dz) + (SQ2 - 2) * Math.min(dx, dz); };
    const gm = G.gm, sid = G.sid;
    hN = 0; g[s] = 0; par[s] = -1; seen[s] = O; hPush(s, H(s));
    let best = s, bh = H(s), found = false, mBest = -1, mTot = Infinity;
    while (hN) {
      if (mg && hF[0] >= mTot) break;
      const c = hPop(); if (seen[c] === CL) continue; seen[c] = CL;
      if (mg) { if (gm[c] === sid) { const tot = g[c] + mg.k * H(c); if (tot < mTot) { mTot = tot; mBest = c; } } }
      else if (c === t) { found = true; break; }
      const hc = H(c); if (hc < bh) { bh = hc; best = c; }
      const ci = c % w, ck = (c / w) | 0, gc = g[c];
      for (let d = 0; d < 8; d++) {
        const ni = ci + DI[d], nk = ck + DK[d];
        if (ni < 0 || nk < 0 || ni >= w || nk >= h) continue;
        const nc = nk * w + ni; if (blk[nc] || seen[nc] === CL) continue;
        if (d >= 4 && (blk[ck * w + ni] || blk[nk * w + ci])) continue;   // pas de coin coupé
        const ng = gc + DC[d];
        if (seen[nc] === O && ng >= g[nc]) continue;
        g[nc] = ng; par[nc] = c; seen[nc] = O; hPush(nc, ng + H(nc) * 1.001);
      }
    }
    if (mBest >= 0) { found = true; t = mBest; }
    const end = found ? t : best, out = [];
    for (let c = end; c >= 0; c = par[c]) out.push(c);
    out.reverse();
    return { cells: out, ok: found };
  }
  /** Cases → points lissés (string pulling), départ exclu */
  function smooth(G, cells, sx, sz) {
    const P = cells.map(c => ({ x: cx(G, c % G.w), z: cz(G, (c / G.w) | 0) }));
    if (!P.length) return [];
    const out = []; let ax = sx, az = sz;
    for (let k = 0; k < P.length - 1; k++) {
      if (!los(G, ax, az, P[k + 1].x, P[k + 1].z)) { out.push(P[k]); ax = P[k].x; az = P[k].z; }
    }
    out.push(P[P.length - 1]);
    return out;
  }

  /* ---------- Calcul de chemin dans une grille ---------- */
  const cache = new Map();            // clé grille|départ|arrivée → points
  function solve(G, sx, sz, gx, gz) {
    let s = cellOf(G, sx, sz), t = cellOf(G, gx, gz);
    if (s < 0 || t < 0) return null;
    let pre = null;
    if (G.blk[s]) { const f = nearestFree(G, sx, sz, 12); if (f < 0) return null; s = f; pre = { x: cx(G, s % G.w), z: cz(G, (s / G.w) | 0) }; }
    const tBlocked = !!G.blk[t];
    const key = G.id + '|' + s + '|' + t;
    let res = cache.get(key);
    // cible bloquée sur la grille mais hors des boîtes réelles : atteignable si on l'approche bien
    const reach = tBlocked && !(ML.U && ML.U.inCollider(gx, gz, 0.1));
    if (res) stats.hit++;
    else {
      let mg = null;
      if (tBlocked) {   // cible dans un obstacle : toutes les cases libres proches sont candidates
        const f = nearestFree(G, gx, gz, 24); if (f < 0) return null;
        const d0 = Math.hypot(cx(G, f % G.w) - gx, cz(G, (f / G.w) | 0) - gz), rr = d0 + 1.25, rc = Math.ceil((rr + 1) / CS);
        if (G.sid > 0x7fffffe0) { G.sid = 0; G.seen.fill(0); G.gm.fill(0); }
        const i0 = Math.floor((gx - G.x0) / CS), k0 = Math.floor((gz - G.z0) / CS), all = [], ok = [];
        for (let k = Math.max(0, k0 - rc); k <= Math.min(G.h - 1, k0 + rc); k++) for (let i = Math.max(0, i0 - rc); i <= Math.min(G.w - 1, i0 + rc); i++) {
          const c = k * G.w + i; if (G.blk[c]) continue;
          const d = Math.hypot(cx(G, i) - gx, cz(G, k) - gz);
          if (d <= rr) all.push(c);
          // case d'où la vraie cible est atteignable en ligne droite (colliders réels, rayon 0,28)
          if (d <= rr + 1 && reach && clearSeg(cx(G, i), cz(G, k), gx, gz)) ok.push(c);
        }
        for (const c of (ok.length ? ok : all)) G.gm[c] = G.sid + 1;   // sid du prochain A*
        mg = { tx: (gx - G.x0) / CS, tz: (gz - G.z0) / CS, k: 3 };
      }
      const a = astar(G, s, t, mg);
      const sx0 = pre ? pre.x : sx, sz0 = pre ? pre.z : sz;
      const e = a.cells[a.cells.length - 1];
      res = { pts: smooth(G, a.cells, sx0, sz0), ok: a.ok, exact: !tBlocked || (reach && e !== undefined && clearSeg(cx(G, e % G.w), cz(G, (e / G.w) | 0), gx, gz)) };
      if (cache.size > 400) cache.delete(cache.keys().next().value);
      cache.set(key, res);
    }
    const pts = res.pts.map(p => ({ x: p.x, z: p.z }));
    if (pre) pts.unshift(pre);
    // point final exact si la cible est atteignable physiquement (pas DANS une boîte)
    if (res.ok) {
      // cible libre : on remplace le centre de la dernière case ; cible bloquée : on l'ajoute après la case d'approche
      if (res.exact) { if (pts.length && !tBlocked) pts[pts.length - 1] = { x: gx, z: gz }; else pts.push({ x: gx, z: gz }); }
    }
    return { pts, ok: res.ok, partial: !res.ok };
  }
  /** Segment praticable pour un PNJ (colliders réels, hors 'bound', rayon 0,28) */
  function clearSeg(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.15)), r = 0.28;
    const near = ML.U && ML.U.nearColliders ? ML.U.nearColliders((ax + bx) / 2, (az + bz) / 2, L / 2 + 1) : ML.colliders;
    for (const c of near) {
      if (c.tag === 'bound') continue;
      for (let s = 0; s <= n; s++) { const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n; if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false; }
    }
    return true;
  }
  const warned = Nav.warned = new Set();      // avertissements déjà affichés (un seul log par cas)
  function warnOnce(k, msg) { if (warned.has(k)) return; warned.add(k); console.warn('[Nav] ' + msg); }

  /** Chemin complet (départ exclu). Gère zone atelier, grille temporaire, long trajet. */
  Nav.find = (sx, sz, gx, gz) => {
    const Z = getZone(), sIn = inRect(Z, sx, sz, 0.6), gIn = inRect(Z, gx, gz, 0.6);
    const dist = Math.hypot(gx - sx, gz - sz);
    let r = null;
    if (sIn && gIn) r = solve(Z, sx, sz, gx, gz);
    else if (dist <= LONG) {
      const m = 10, G = getTemp({ minX: Math.min(sx, gx) - m, maxX: Math.max(sx, gx) + m, minZ: Math.min(sz, gz) - m, maxZ: Math.max(sz, gz) + m });
      r = solve(G, sx, sz, gx, gz);
      if (r && r.partial && (sIn || gIn)) r = null;   // détour hors du rectangle : on passe par la porte
    }
    if (!r && (sIn || gIn)) {          // long trajet : ligne droite dehors + porte
      const D = doorOut(Z);
      if (sIn) { const a = solve(Z, sx, sz, D.x, D.z); if (a) { a.pts.push({ x: gx, z: gz }); r = a; } }
      else { const a = solve(Z, D.x, D.z, gx, gz); if (a) { a.pts.unshift({ x: D.x, z: D.z }); r = a; } }
    }
    if (!r) r = { pts: [{ x: gx, z: gz }], ok: !(sIn || gIn), partial: false, straight: true };
    if (r.partial) {                  // cible inaccessible (porte fermée…) : au plus près puis tout droit
      stats.fail++; warnOnce('part' + Math.round(gx) + ',' + Math.round(gz), `cible inaccessible (${gx.toFixed(1)}, ${gz.toFixed(1)}) : on va au plus près puis tout droit.`);
      r.pts.push({ x: gx, z: gz });
    }
    if (dbg.on) { dbg.paths.push([{ x: sx, z: sz }].concat(r.pts)); if (dbg.paths.length > 40) dbg.paths.shift(); }
    return r;
  };
  /** Point dehors devant la porte de l'atelier */
  function doorOut(Z) {
    const A = ML.World && ML.World._at, d = ML.LOC && ML.LOC.doorIn;
    const fz = A && A.box ? A.box.maxZ : 14, x = d ? d.x : 0;
    return { x, z: Math.min(fz + 3, Z.rect.maxZ - 1) };
  }

  /* ---------- Requête par PNJ avec budget par pas ---------- */
  let frameKey = null, spent = 0;
  Nav.request = (n, x, z, key) => {
    stats.req++;
    if (key !== frameKey) { frameKey = key; spent = 0; }
    if (spent > BUDGET) { stats.pend++; return null; }
    const t0 = performance.now();
    let r;
    try { r = Nav.find(n.x, n.z, x, z); }
    catch (e) { warnOnce('err', 'erreur de calcul, ligne droite : ' + e.message); r = { pts: [{ x, z }] }; }
    const dt = performance.now() - t0; spent += dt; stats.ms += dt;
    return r.pts;
  };
  Nav.blockedLine = (ax, az, bx, bz) => {
    const Z = getZone(); if (!inRect(Z, ax, az) || !inRect(Z, bx, bz)) return false;
    const a = cellOf(Z, ax, az), b = cellOf(Z, bx, bz);
    if (Z.blk[a] || Z.blk[b]) return true;
    return !los(Z, ax, az, bx, bz);
  };
  Nav.freeNear = (x, z) => {
    const Z = getZone(); if (!inRect(Z, x, z)) return null;
    const c = nearestFree(Z, x, z, 12); return c < 0 ? null : { x: cx(Z, c % Z.w), z: cz(Z, (c / Z.w) | 0) };
  };
  Nav.blocked = (x, z) => { const Z = getZone(), c = cellOf(Z, x, z); return c >= 0 && !!Z.blk[c]; };
  Nav.zone = () => getZone();

  /* ---------- Calque de debug ---------- */
  const dbg = { on: false, mesh: null, lines: null, timer: 0, paths: [], gridRef: null };
  Nav.debug = on => {
    dbg.on = on !== false && on !== 0;
    if (!dbg.on) {
      clearInterval(dbg.timer); dbg.timer = 0;
      for (const m of [dbg.mesh, dbg.lines]) if (m) { m.parent && m.parent.remove(m); m.geometry.dispose(); m.material.map && m.material.map.dispose(); m.material.dispose(); }
      dbg.mesh = dbg.lines = null; dbg.gridRef = null; dbg.paths.length = 0; return false;
    }
    if (!dbg.timer) dbg.timer = setInterval(drawDebug, 500);
    drawDebug(); return true;
  };
  function drawDebug() {
    if (!ML.scene || !window.THREE) return;
    const Z = getZone();
    if (dbg.gridRef !== Z) {
      if (dbg.mesh) { ML.scene.remove(dbg.mesh); dbg.mesh.geometry.dispose(); dbg.mesh.material.map.dispose(); dbg.mesh.material.dispose(); }
      const cv = document.createElement('canvas'); cv.width = Z.w; cv.height = Z.h;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(Z.w, Z.h);
      for (let k = 0; k < Z.h; k++) for (let i = 0; i < Z.w; i++) {
        const c = k * Z.w + i, o = c * 4, b = Z.blk[c];
        img.data[o] = b ? 255 : 40; img.data[o + 1] = b ? 40 : 200; img.data[o + 2] = 40; img.data[o + 3] = b ? 150 : 28;
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.flipY = false;
      const W = Z.w * CS, H = Z.h * CS;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      // plan couché : u → +x, v → +z (flipY désactivé : ligne 0 = z0)
      m.rotation.x = Math.PI / 2; m.position.set(Z.x0 + W / 2, 0.06, Z.z0 + H / 2); m.renderOrder = 5;
      ML.scene.add(m); dbg.mesh = m; dbg.gridRef = Z;
    }
    const v = [];
    for (const p of dbg.paths) for (let i = 0; i < p.length - 1; i++) v.push(p[i].x, 0.12, p[i].z, p[i + 1].x, 0.12, p[i + 1].z);
    if (dbg.lines) { ML.scene.remove(dbg.lines); dbg.lines.geometry.dispose(); dbg.lines.material.dispose(); dbg.lines = null; }
    if (v.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      dbg.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x33aaff, depthTest: false }));
      dbg.lines.renderOrder = 6; ML.scene.add(dbg.lines);
    }
  }
})();
