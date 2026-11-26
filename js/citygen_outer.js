/* =====================================================================
   citygen_outer.js — Tout ce qui est HORS du centre-ville :
   - l'AUTOROUTE A84 (2×2 voies, glissière centrale) qui traverse le sud ;
   - l'ÉCHANGEUR : rond-point « de la Pelle » (statue de Lebec) + bretelle
     + PÉAGE, jusqu'à l'autoroute ;
   - la ROUTE DU COL : lacets dans la montagne nord jusqu'au col (auberge),
     une antenne vers le LAC (chalets), puis la descente par l'est jusqu'à
     l'autoroute ;
   - la DÉPARTEMENTALE de l'ouest : pont sur la rivière, hameau de
     Kerlebec, puis l'autoroute ;
   - fermes et maisons le long des routes de campagne.
   Les routes de campagne sont tracées par un A* sur le relief (coût = pente),
   ce qui donne des lacets naturels. Chaque route = une chaîne de nœuds et
   d'arêtes ajoutés au même graphe que la ville (circulation, carte, passants).
   Drapeaux des arêtes : hw (autoroute), mtn (montagne), dep (campagne),
   bridge (pont/viaduc), rw (demi-largeur), ring (route rapide).
   ===================================================================== */
(function () {
  const CG = ML.CityGen;

  /** ctx = { city, r, addNode, link, newStreet, RW } — appelé par citygen.js après le centre-ville */
  CG.outer = ctx => {
    const { city, r, addNode, link, newStreet, RW } = ctx, N = city.nodes, E = city.edges, TR = ML.Terrain, B = TR.bounds;
    const segDist = CG.segDist, rects = city.rects;
    const NAT = (x, z) => TR.natural(x, z);

    /* ---------- Altitudes des nœuds du centre-ville ---------- */
    for (const n of N) {
      const atel = Math.abs(n.x) < 46 && n.z < 46 && n.z > -44; let s = 0;
      for (const [dx, dz] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]]) s += NAT(n.x + dx, n.z + dz);
      n.y = atel ? 0 : s / 5;
    }

    /* ---------- Grille A* (pas de 6 m) ---------- */
    const CM = ML.CFG.CORE, ST = 2, AC = TR.CELL * ST, AW = Math.floor((TR.NX - 1) / ST) + 1, AH = Math.floor((TR.NZ - 1) / ST) + 1;
    const ax = i => B.minX + i * AC, az = k => B.minZ + k * AC;
    const nat = new Float32Array(AW * AH), riv = new Float32Array(AW * AH), blocked = new Uint8Array(AW * AH);
    for (let k = 0; k < AH; k++) for (let i = 0; i < AW; i++) { nat[k * AW + i] = NAT(ax(i), az(k)); riv[k * AW + i] = TR.riverDist(ax(i), az(k)); }
    const blockSeg = (A, Bn, m) => {
      const i0 = Math.max(0, Math.floor((Math.min(A.x, Bn.x) - m - B.minX) / AC)), i1 = Math.min(AW - 1, Math.ceil((Math.max(A.x, Bn.x) + m - B.minX) / AC));
      const k0 = Math.max(0, Math.floor((Math.min(A.z, Bn.z) - m - B.minZ) / AC)), k1 = Math.min(AH - 1, Math.ceil((Math.max(A.z, Bn.z) + m - B.minZ) / AC));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) if (segDist(ax(i), az(k), A.x, A.z, Bn.x, Bn.z) < m) blocked[k * AW + i] = 1;
    };
    const blockRect = (x, z, hx, hz) => blockSeg({ x: x - hx, z }, { x: x + hx, z }, hz);
    E.forEach(e => blockSeg(N[e.a], N[e.b], RW + 9));
    rects.forEach(o => blockRect(o.x, o.z, o.hx + 6, o.hz + 6));
    blockRect(0, 0, 48, 46);

    function astar(s, g, opt) {
      opt = opt || {};
      const gmax = opt.g || 0.09, free = opt.free || 30, n = AW * AH;
      const cl = (v, m) => Math.max(1, Math.min(m - 2, v));
      const si = cl(Math.round((s.x - B.minX) / AC), AW), sk = cl(Math.round((s.z - B.minZ) / AC), AH), gi = cl(Math.round((g.x - B.minX) / AC), AW), gk = cl(Math.round((g.z - B.minZ) / AC), AH);
      const cost = new Float32Array(n).fill(Infinity), par = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
      const hk = [], hv = [];
      const push = (q, f) => { hk.push(f); hv.push(q); let c = hk.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= hk[c]) break; [hk[p], hk[c]] = [hk[c], hk[p]]; [hv[p], hv[c]] = [hv[c], hv[p]]; c = p; } };
      const pop = () => { const q = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let c = 0; for (;;) { const a = 2 * c + 1, b = a + 1; let m = c; if (a < hk.length && hk[a] < hk[m]) m = a; if (b < hk.length && hk[b] < hk[m]) m = b; if (m === c) break; [hk[m], hk[c]] = [hk[c], hk[m]]; [hv[m], hv[c]] = [hv[c], hv[m]]; c = m; } } return q; };
      const S0 = sk * AW + si, G0 = gk * AW + gi, gxw = ax(gi), gzw = az(gk);
      const hdist = q => { const x = ax(q % AW) - gxw, z = az(Math.floor(q / AW)) - gzw; return Math.sqrt(x * x + z * z); };
      cost[S0] = 0; push(S0, hdist(S0));
      const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41421356], [1, -1, 1.41421356], [-1, 1, 1.41421356], [-1, -1, 1.41421356]];
      let it = 0;
      while (hk.length && it++ < 400000) {
        const q = pop(); if (closed[q]) continue; closed[q] = 1; if (q === G0) break;
        const i = q % AW, k = (q - i) / AW;
        for (const [di, dk, l] of D) {
          const ii = i + di, kk = k + dk; if (ii < 1 || kk < 1 || ii >= AW - 1 || kk >= AH - 1) continue;
          const q2 = kk * AW + ii; if (closed[q2]) continue;
          const x = ax(ii), z = az(kk);
          if (blocked[q2]) { const ds = Math.sqrt((x - s.x) * (x - s.x) + (z - s.z) * (z - s.z)), dg = Math.sqrt((x - g.x) * (x - g.x) + (z - g.z) * (z - g.z)); if (ds > free && dg > free) continue; }
          const L = AC * l, gr = Math.abs(nat[q2] - nat[q]) / L;
          let c = L * (1 + 22 * gr * gr) + (gr > gmax ? L * (gr - gmax) * 260 : 0) + (riv[q2] < 3 ? 55 : 0);
          if (opt.extra) c += opt.extra(x, z) * L;
          if (x > CM.minX - 15 && x < CM.maxX + 15 && z > CM.minZ - 15 && z < CM.maxZ + 15) c += 60 * L;   // on sort vite du centre-ville
          const nc = cost[q] + c; if (nc < cost[q2]) { cost[q2] = nc; par[q2] = q; push(q2, nc + hdist(q2)); }
        }
      }
      if (par[G0] < 0) return null;
      const pts = []; for (let q = G0; q >= 0; q = par[q]) pts.push({ x: ax(q % AW), z: az(Math.floor(q / AW)) });
      pts.reverse(); pts[0] = { x: s.x, z: s.z }; pts[pts.length - 1] = { x: g.x, z: g.z };
      return pts;
    }

    /** Pose une entreprise au bout d'une route (même format que citygen.js) */
    function placeCompany(k, node, from) {
      const C = ML.COMPANIES[k], n = N[node], o = typeof from === 'number' ? N[from] : from, L = Math.hypot(n.x - o.x, n.z - o.z) || 1, ux = (n.x - o.x) / L, uz = (n.z - o.z) / L;
      let best = 0, bd = -2; for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, dot = Math.sin(a) * -ux + Math.cos(a) * -uz; if (dot > bd) { bd = dot; best = q; } }
      const hx = best % 2 ? C.d / 2 : C.w / 2, hz = best % 2 ? C.w / 2 : C.d / 2, off = RW + 3.5 + Math.abs(ux) * hx + Math.abs(uz) * hz;
      const x = n.x + ux * off, z = n.z + uz * off;
      if (!TR.inside(x, z, Math.max(hx, hz) + 8) || rects.some(q => Math.abs(q.x - x) < q.hx + hx + 4 && Math.abs(q.z - z) < q.hz + hz + 4)) return false;
      // aucune autre route ne doit traverser l'emprise (autoroute, corniche…)
      for (const e of E) { if (e.a === node || e.b === node) continue; const ed = segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z), rw = e.rw || RW; if (ed < rw + Math.max(hx, hz) + 2) return false; }
      const spot = { x, z, hx, hz, rot: best }; rects.push(spot); blockRect(x, z, hx + 4, hz + 4);
      const a = best * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), loc = (lx, lz) => ({ x: x + lx * ca + lz * sa, z: z - lx * sa + lz * ca });
      city.companies[k] = { cul: node, x, z, rot: best, hx, hz, dir: { x: sa, z: ca }, tan: { x: ca, z: -sa }, dock: loc(-1, C.d / 2 + 1.9), npc: Object.assign(loc(5.5, C.d / 2 + 1.9), { yaw: a }), back: loc(0, -C.d / 2 - 1.8), street: E.find(e => e.a === node || e.b === node).name, plateau: true };
      city.hides.push(city.companies[k].back);
      return true;
    }
    /** Ajoute une route (polyligne + altitudes) au graphe. a/b = nœuds existants aux extrémités (ou -1) */
    function chain(pts, ys, st, flags, a, b) {
      const ids = [];
      for (let i = 0; i < pts.length; i++) {
        if (i === 0 && a >= 0) { ids.push(a); continue; }
        if (i === pts.length - 1 && b >= 0) { ids.push(b); continue; }
        const k = addNode(pts[i].x, pts[i].z); N[k].y = ys[i]; N[k].rw = flags.rw; ids.push(k);
      }
      for (let i = 0; i < ids.length - 1; i++) if (ids[i] !== ids[i + 1]) link(ids[i], ids[i + 1], st, Object.assign({}, flags));
      for (let i = 0; i < ids.length - 1; i++) blockSeg(N[ids[i]], N[ids[i + 1]], flags.rw + 10);
      return ids;
    }
    const smooth = (pts, step) => TR.resample(TR.chaikin(pts, 2), step);
    const nearestOf = (ids, x, z) => ids.reduce((m, i) => (Math.hypot(N[i].x - x, N[i].z - z) < Math.hypot(N[m].x - x, N[m].z - z) ? i : m), ids[0]);
    const route = (from, to, st, flags, g, step, fixEnds) => {
      let raw = astar(N[from] || from, N[to] || to, { g });
      if (!raw) { raw = astar(N[from] || from, N[to] || to, { g: g * 1.5 }); if (raw) g *= 1.5; }
      if (!raw) return null;
      const pts = smooth(raw, step), ys = TR.profile(pts, 2, g * 1.05, typeof from === 'number' ? N[from].y : null, typeof to === 'number' ? N[to].y : null);
      return chain(pts, ys, st, flags, typeof from === 'number' ? from : -1, typeof to === 'number' ? to : -1);
    };
    city.statues = []; city.tolls = []; city.signs = []; city.rural = []; city.sites = {};

    /* ---------- 1. Autoroute A84 ---------- */
    const hwSt = newStreet('autoroute', 'A84 — Autoroute des Copeaux');
    const ctrl = []; for (let x = -680; x <= 680; x += 170) ctrl.push({ x, z: -155 + (r() - 0.5) * 80 });
    let hp = TR.resample(TR.chaikin(ctrl, 3), 32).filter(p => p.x > B.minX + 2 && p.x < B.maxX - 2);
    const hy = TR.profile(hp, 4, 0.04);
    const HW = { hw: true, ring: true, rw: 9 };
    const hwIds = chain(hp, hy, hwSt, HW, -1, -1);
    city.hw = hwIds;

    /* ---------- 1 bis. LA CORNICHE : route taillée dans la falaise derrière l'atelier ----------
       Départ de la cour, pont étroit sur la rivière, montée vers l'ouest à flanc de paroi,
       épingle en surplomb, remontée vers l'est jusqu'au plateau (clients mieux payés).
       Étroite (une voie et demie), presque sans glissière : c'est le raccourci DANGEREUX. */
    {
      /** z de la paroi où l'altitude naturelle vaut y (à x fixé) */
      const faceZ = (x, y) => { const zc = TR.cliffZ(x); let lo = zc - 60, hi = zc + 50; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (NAT(x, m) > y) lo = m; else hi = m; } return (lo + hi) / 2; };
      const cs = newStreet('corniche', 'Route de la Corniche du Bec'), CO = { mtn: true, corniche: true, rw: 3.6 };
      const pts = [], ys = [];
      const push = (x, z, y) => { pts.push({ x, z }); ys.push(y); };
      // depuis la cour : contourne l'atelier par l'est, pont sur la rivière
      const zc0 = TR.cliffZ(62);
      push(N[0].x, N[0].z, N[0].y); push(30, 20, 0); push(48, 6, 0); push(54, -30, 0); push(56, -50, 0.3);
      const zRiv = (() => { let b = null, bd = 1e9; for (const q of TR.river) { if (Math.abs(q.x - 58) < bd) { bd = Math.abs(q.x - 58); b = q; } } return b ? b.z : -75; })();
      push(58, zRiv + 9, 1.8); push(59, zRiv - 9, 2.4);
      // jambe 1 : vers l'ouest en montant (6 → 34 m)
      const X1 = 60, X2 = -250, Y1 = 6, Y2 = 34, leg1 = {};
      for (let x = X1; x >= X2; x -= 11) { const y = Y1 + (Y2 - Y1) * (X1 - x) / (X1 - X2), z = faceZ(x, y + 1.5); leg1[Math.round(x)] = z; push(x, z, y); }
      // épingle : vrai demi-tour de 10 m de rayon, la jambe 2 repart 20 m plus au sud (taillée dans la roche)
      const zA = pts[pts.length - 1].z, xA = pts[pts.length - 1].x, RH = 10;
      for (let k = 1; k < 8; k++) { const th = Math.PI * k / 8; push(xA - 4 - Math.sin(th) * RH, zA - RH + Math.cos(th) * RH, Y2 + 4 * k / 8); }
      // jambe 2 : vers l'est en montant jusqu'au plateau, toujours au moins 20 m au sud de la jambe 1
      const X3 = 150, topY = TR.plateauH(X3, TR.cliffZ(X3) - 40) * 0.97;
      const z1 = x => { let b = null, bd = 1e9; for (const k in leg1) { const d = Math.abs(k - x); if (d < bd) { bd = d; b = leg1[k]; } } return b; };
      for (let x = xA; x <= X3; x += 11) { const y = Y2 + 4 + (topY - Y2 - 4) * (x - xA) / (X3 - xA); push(x, Math.min(faceZ(x, Math.min(y + 1.5, topY - 3)), z1(x) - 2 * RH), y); }
      // sortie sur le plateau
      const zt = Math.min(TR.cliffZ(X3 + 14) - 42, pts[pts.length - 1].z - 14); push(X3 + 12, zt + 8, topY); push(X3 + 18, zt, topY);
      // chaikin perd y : on le ré-interpole
      const sm2 = TR.chaikin(pts.map((p, i) => ({ x: p.x, z: p.z })), 1), y2 = TR.chaikin(pts.map((p, i) => ({ x: ys[i], z: 0 })), 1).map(q => q.x);
      // si l'autoroute passe juste au sommet : la corniche s'y raccorde (vrai carrefour, pas de croisement à niveau)
      const last = sm2[sm2.length - 1], hn = nearestOf(hwIds, last.x, last.z), hwJoin = Math.hypot(N[hn].x - last.x, N[hn].z - last.z) < 45;
      if (hwJoin) { sm2[sm2.length - 1] = { x: N[hn].x, z: N[hn].z }; y2[y2.length - 1] = N[hn].y; }
      const ids = chain(sm2, y2, cs, CO, 0, hwJoin ? hn : -1);
      city.corniche = ids;
      const top = ids[ids.length - 1]; N[top].site = 'plateau';
      city.sites.plateau = { x: N[top].x, z: N[top].z, y: N[top].y };
      // le plateau rejoint l'autoroute (le « grand tour » sûr passe par là)
      if (!hwJoin) { const tgt = nearestOf(hwIds, N[top].x + 40, -170); route(top, tgt, newStreet('departementale', 'Route du Plateau'), { dep: true, rw: 5 }, 0.08, 13); }
      // clients du plateau : au bout de deux petites routes
      city.plateauSpots = [];
      for (const [k, dx, dz] of [['carriere', -95, -55], ['barrage', 70, -75]]) {
        if (!ML.COMPANIES[k]) continue;
        for (let t = 0; t < 6; t++) {
          const a = t * 1.1, c = Math.cos(a), sn = Math.sin(a), g = { x: N[top].x + dx * c - dz * sn, z: N[top].z + dx * sn + dz * c };
          if (!TR.inside(g.x, g.z, 40) || TR.slope(g.x, g.z) > 0.35 || TR.natural(g.x, g.z) < 40) continue;
          const sp = route(top, g, newStreet('impasse', k === 'carriere' ? 'Chemin de la Carrière' : 'Route du Barrage'), { dep: true, rw: 4.5 }, 0.09, 12);
          if (!sp || sp.length < 3) continue;
          const e = sp[sp.length - 1], pr = sp[sp.length - 2]; N[e].cul = true;
          if (placeCompany(k, e, pr)) { city.plateauSpots.push({ k, node: e }); break; }
        }
      }
      // secours : au bord de la route du plateau (ou du haut de la corniche)
      const plat = N.map((n, i) => i).filter(i => N[i].y > 45 && E.some(e => (e.a === i || e.b === i) && (e.dep || e.corniche)) && i !== top);
      for (const k of ['carriere', 'barrage']) {
        if (!ML.COMPANIES[k] || city.companies[k]) continue;
        for (const i of plat) {
          const e = E.find(x => x.a === i || x.b === i), j = e.a === i ? e.b : e.a, dx = N[j].x - N[i].x, dz = N[j].z - N[i].z, L = Math.hypot(dx, dz) || 1;
          let done = false;
          for (const sgn of [1, -1]) { const from = { x: N[i].x - (-dz / L) * sgn, z: N[i].z - (dx / L) * sgn }; if (TR.slope(N[i].x - dz / L * sgn * 20, N[i].z + dx / L * sgn * 20) < 0.4 && placeCompany(k, i, from)) { done = true; break; } }
          if (done) { city.plateauSpots.push({ k, node: i }); break; }
        }
      }
    }

    /* ---------- 2. Échangeur : rond-point de la Pelle + bretelle + péage ---------- */
    const kL = (city.ringEnds || []).find(k => N[k].x < 0);
    if (kL !== undefined) {
      let C = null;
      for (const dz of [34, 28, 40, 24, 46]) for (const dx of [-6, -14, 2, -22, -30]) {
        const c = { x: N[kL].x + dx, z: N[kL].z - dz };
        if (C || TR.riverDist(c.x, c.z) < 15) continue;
        if (E.some(e => e.core && (e.a !== kL && e.b !== kL) && segDist(c.x, c.z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < 26)) continue;
        if (rects.some(o => Math.abs(o.x - c.x) < o.hx + 22 && Math.abs(o.z - c.z) < o.hz + 22)) continue;
        C = c;
      }
      if (!C) {                                                    // pas de place pour le rond-point : bretelle directe
        const tgt = nearestOf(hwIds, -430, -150);
        route(kL, tgt, newStreet('bretelle', 'Bretelle de la Zone Industrielle'), { dep: true, rw: 5.5 }, 0.07, 14);
      } else {
        const y0 = N[kL].y, R0 = 13, rs = newStreet('giratoire', 'Rond-point de la Pelle'), ring = [];
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, k = addNode(C.x + Math.sin(a) * R0, C.z + Math.cos(a) * R0); N[k].y = y0; N[k].rw = RW; ring.push(k); }
        for (let i = 0; i < 8; i++) link(ring[i], ring[(i + 1) % 8], rs, { giratoire: true });
        link(kL, ring[0], E.find(e => e.a === kL || e.b === kL).st);
        ring.forEach((k, i) => blockSeg(N[k], N[ring[(i + 1) % 8]], RW + 8));
        city.statues.push({ x: C.x, z: C.z, y: y0, r: R0 - RW - 0.5 });
        city.sites.rondpoint = { x: C.x, z: C.z, y: y0 };
        // bretelle vers l'autoroute
        const tgt = nearestOf(hwIds, -430, -150), bs = newStreet('bretelle', 'Bretelle de la Zone Industrielle');   // par l'ouest : là où le plateau redescend
        const ids = route(ring[4], tgt, bs, { dep: true, rw: 5.5 }, 0.07, 14);
        if (ids) {
          // péage ~70 m avant l'autoroute
          let acc = 0, ti = ids.length - 2;
          for (let i = ids.length - 1; i > 0; i--) { acc += Math.hypot(N[ids[i]].x - N[ids[i - 1]].x, N[ids[i]].z - N[ids[i - 1]].z); if (acc > 65) { ti = i - 1; break; } }
          const P0 = N[ids[ti]], P1 = N[ids[ti + 1]];
          city.tolls.push({ x: (P0.x + P1.x) / 2, z: (P0.z + P1.z) / 2, y: (P0.y + P1.y) / 2, ang: Math.atan2(P1.x - P0.x, P1.z - P0.z) });
          const J = N[tgt]; city.signs.push({ x: J.x, z: J.z, y: J.y, text: 'Sortie 7', sub: 'Lebec-Centre · Zone industrielle', toward: ids[ids.length - 2] });
        }
      }
    }

    /* ---------- 3. Route du col (montagne nord) ---------- */
    const top = N.reduce((m, n, i) => (n.z > N[m].z && E.some(e => e.core && (e.a === i || e.b === i)) ? i : m), 0);
    // le col : le point le plus bas de la crête entre x = -60 et x = 320
    let col = null, colH = 1e9;
    for (let x = -60; x <= 320; x += 6) { let mx = -1e9, mz = 0; for (let z = 500; z <= 660; z += 6) { const h = NAT(x, z); if (h > mx) { mx = h; mz = z; } } if (mx < colH) { colH = mx; col = { x, z: mz }; } }
    const ms = newStreet('montagne', 'Route du Col de la Pelle'), MT = { mtn: true, rw: 4.6 };
    let colNode = -1;
    if (col) {
      const ids = route(top, col, ms, MT, 0.095, 11);
      if (ids) {
        colNode = ids[ids.length - 1]; N[colNode].site = 'col';
        city.sites.col = { x: N[colNode].x, z: N[colNode].z, y: N[colNode].y };
        // antenne vers le lac (cul-de-sac au bord de l'eau)
        const L = TR.lakes[0];
        if (L) {
          const dx = N[colNode].x - L.x, dz = N[colNode].z - L.z, d = Math.hypot(dx, dz) || 1;
          const shore = { x: L.x + dx / d * (L.r + 16), z: L.z + dz / d * (L.r + 16) };
          const ls = newStreet('montagne', 'Chemin du Lac'), li = route(colNode, shore, ls, MT, 0.09, 11);
          if (li) { const end = li[li.length - 1]; N[end].cul = true; city.sites.lac = { x: N[end].x, z: N[end].z, y: N[end].y, lx: L.x, lz: L.z, r: L.r }; }
        }
        // descente par l'est jusqu'à l'autoroute
        const tgt = nearestOf(hwIds, 440, -150), es = newStreet('montagne', 'Descente des Écureuils');
        route(colNode, tgt, es, MT, 0.095, 12);
      }
    }

    /* ---------- 4. Départementale de l'ouest : pont, hameau, autoroute ---------- */
    const west = N.reduce((m, n, i) => (n.x < N[m].x && E.some(e => e.core && (e.a === i || e.b === i)) ? i : m), 0);
    const ham = { x: -400 + (r() - 0.5) * 50, z: 215 + (r() - 0.5) * 70 };
    const ds = newStreet('departementale', 'D12 — Route de Kerlebec'), DEP = { dep: true, rw: 5 };
    const wi = route(west, ham, ds, DEP, 0.08, 13);
    if (wi) {
      const hn = wi[wi.length - 1]; city.sites.hameau = { x: N[hn].x, z: N[hn].z, y: N[hn].y, node: hn };
      const tgt = nearestOf(hwIds, -440, -150);
      route(hn, tgt, newStreet('departementale', 'D12 — Route de Kerlebec'), DEP, 0.08, 13);
      // petite route du hameau vers le nord (ferme isolée)
      const fz = { x: N[hn].x + (r() - 0.5) * 80, z: N[hn].z + 150 }, fi = route(hn, fz, newStreet('departementale', 'Chemin de la Ferme'), DEP, 0.09, 13);
      if (fi) N[fi[fi.length - 1]].cul = true;
    }

    /* ---------- 5. Ponts et viaducs ---------- */
    city.edges.forEach(e => {
      if (e.core || e.giratoire) return;
      const A = N[e.a], Bn = N[e.b]; let river = false, minGap = 1e9;
      for (let t = 0; t <= 1.0001; t += 0.125) {
        const x = A.x + (Bn.x - A.x) * t, z = A.z + (Bn.z - A.z) * t, y = A.y + (Bn.y - A.y) * t;
        if (TR.riverDist(x, z) < -0.5) river = true;                 // au-dessus de l'eau (pas simplement le long de la berge)
        minGap = Math.min(minGap, y - TR.ground(x, z));
      }
      const br = river || minGap > 4;                 // pont seulement si TOUT le tronçon est au-dessus du vide (sinon : remblai/déblai)
      if (br) {
        e.bridge = true; const rw = (e.rw || RW) + 0.4;
        TR.bridges.push({ ax: A.x, az: A.z, ay: A.y, bx: Bn.x, bz: Bn.z, by: Bn.y, rw, minX: Math.min(A.x, Bn.x) - rw, maxX: Math.max(A.x, Bn.x) + rw, minZ: Math.min(A.z, Bn.z) - rw, maxZ: Math.max(A.z, Bn.z) + rw });
      }
    });
    N.forEach((n, i) => { const es = E.filter(e => e.a === i || e.b === i); if (es.length && es.every(e => e.bridge)) n.bridge = true; });

    /* ---------- 6. Bâtiments de campagne ---------- */
    const KIT = { maison: [10, 9], longere: [16, 8], ferme: [22, 16], hangar: [20, 14], chalet: [11, 10], refuge: [18, 12], eglise: [18, 30], mairie: [24, 16], commerce: [14, 12] };
    const outerEdges = E.filter(e => !e.core);
    function fitRural(px, pz, nx, nz, type, gap, roadY) {
      const [w, d] = KIT[type]; let best = 0, bd = -2;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, dot = Math.sin(a) * -nx + Math.cos(a) * -nz; if (dot > bd) { bd = dot; best = k; } }
      const hx = best % 2 ? d / 2 : w / 2, hz = best % 2 ? w / 2 : d / 2, depth = Math.abs(nx) * hx + Math.abs(nz) * hz, off = 5.5 + gap + depth;
      const x = px + nx * off, z = pz + nz * off, rad = Math.hypot(hx, hz);
      if (!TR.inside(x, z, rad + 6) || TR.riverDist(x, z) < rad + 6 || TR.slope(x, z) > 0.32) return null;
      { let lo = 1e9, hi = -1e9; for (const [ax2, az2] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const g = TR.natural(x + ax2 * hx, z + az2 * hz); lo = Math.min(lo, g); hi = Math.max(hi, g); } if (hi - lo > 3) return null; }   // pas de maison encastrée dans une pente
      const Cm = ML.CFG.CORE; if (x > Cm.minX - 25 && x < Cm.maxX + 25 && z > Cm.minZ - 25 && z < Cm.maxZ + 25) return null;   // le centre-ville est réservé
      if (rects.some(o => Math.abs(o.x - x) < o.hx + hx + 4 && Math.abs(o.z - z) < o.hz + hz + 4)) return null;
      for (const e of E) { const rw = (e.rw || RW) + 2; if (segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < rw + Math.min(hx, hz) + 0.5) return null; }
      const R = { x, z, hx, hz, rot: best, type, w, d, k: Math.floor(r() * 1e9), y: roadY };
      rects.push(R); city.rural.push(R); return R;
    }
    /** Essaie de poser un bâtiment le long des arêtes partant du nœud n */
    function around(n, type, tries) {
      for (let t = 0; t < (tries || 12); t++) {
        const es = outerEdges.filter(e => e.a === n || e.b === n); if (!es.length) return null;
        const e = es[Math.floor(r() * es.length)], A = N[e.a === n ? e.a : e.b], Bn = N[e.a === n ? e.b : e.a], L = Math.hypot(Bn.x - A.x, Bn.z - A.z) || 1;
        const s = r() < 0.5 ? 1 : -1, ux = (Bn.x - A.x) / L, uz = (Bn.z - A.z) / L, tt = 6 + r() * Math.max(1, L - 6);
        const R = fitRural(A.x + ux * tt, A.z + uz * tt, -uz * s, ux * s, type, 3 + r() * 4, A.y);
        if (R) return R;
      }
      return null;
    }
    const nodeNear = (x, z, filter) => { let b = -1, bd = 1e9; N.forEach((n, i) => { if (filter && !filter(i)) return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = i; } }); return b; };
    const onOuter = i => outerEdges.some(e => e.a === i || e.b === i);
    if (city.sites.hameau) {
      const hn = city.sites.hameau.node, chain2 = [hn]; N.forEach((n, i) => { if (i !== hn && onOuter(i) && Math.hypot(n.x - N[hn].x, n.z - N[hn].z) < 70) chain2.push(i); });
      for (const type of ['eglise', 'commerce', 'maison', 'longere', 'maison', 'maison', 'longere', 'maison', 'commerce']) around(chain2[Math.floor(r() * chain2.length)], type, 20);
    }
    if (colNode >= 0) { const R = around(colNode, 'refuge', 30); if (R) city.sites.auberge = R; }
    if (city.sites.lac) { const ln = nodeNear(city.sites.lac.x, city.sites.lac.z, onOuter); const near = []; N.forEach((n, i) => { if (onOuter(i) && Math.hypot(n.x - N[ln].x, n.z - N[ln].z) < 90) near.push(i); }); for (let i = 0; i < 5; i++) around(near[Math.floor(r() * near.length)], 'chalet', 15); }
    // fermes, longères et maisons isolées le long des routes de campagne (pas l'autoroute)
    const rural = N.map((n, i) => i).filter(i => outerEdges.some(e => !e.hw && (e.a === i || e.b === i)) && N[i].y < 70);
    for (let t = 0; t < 60 && city.rural.length < 46; t++) { const i = rural[Math.floor(r() * rural.length)]; if (i === undefined) break; const q = r(); around(i, q < 0.35 ? 'ferme' : q < 0.6 ? 'longere' : q < 0.85 ? 'maison' : 'hangar', 3); }
  };

  /** Forêts, bosquets et rochers (après les terrassements) */
  CG.nature = (city, r) => {
    const TR = ML.Terrain, B = TR.bounds, rects = city.rects, out = city.forest = [], rocks = city.rocks = [];
    const dB = (x, z) => Math.sqrt((x / 280) * (x / 280) + ((z - 150) / 270) * ((z - 150) / 270));
    for (let z = B.minZ + 6; z < B.maxZ - 6; z += 7.5) for (let x = B.minX + 6; x < B.maxX - 6; x += 7.5) {
      const px = x + (r() - 0.5) * 6, pz = z + (r() - 0.5) * 6, db = dB(px, pz);
      if (db < 0.98) continue;
      const h = TR.ground(px, pz), s = TR.slope(px, pz), f = TR.fbm(px / 130, pz / 130, 991, 3);
      const dens = (f - 0.5) * 3.2 + (s > 0.22 && s < 1 ? 0.35 : 0) + (h > 30 ? 0.2 : 0) - (TR.fieldMask(px, pz) > 0.5 ? 0.7 : 0) - (h > 112 ? 2 : 0);
      if (r() > dens) continue;
      if (TR.roadDist(px, pz) < 4 || TR.riverDist(px, pz) < 2.5 || TR.water(px, pz) !== null) continue;
      if (rects.some(o => Math.abs(o.x - px) < o.hx + 3 && Math.abs(o.z - pz) < o.hz + 3)) continue;
      out.push({ x: px, z: pz, y: h, k: 0.8 + r() * 0.8, pine: h > 42 || pz > 420 || r() < 0.2, c: Math.floor(r() * 4), col: TR.roadDist(px, pz) < 40 });
      if (out.length > 4200) break;
    }
    for (let t = 0; t < 4000 && rocks.length < 380; t++) {
      const px = B.minX + r() * (B.maxX - B.minX), pz = B.minZ + r() * (B.maxZ - B.minZ), h = TR.ground(px, pz), s = TR.slope(px, pz);
      if (dB(px, pz) < 1.1 || (h < 60 && s < 0.55) || TR.roadDist(px, pz) < 5 || TR.water(px, pz) !== null) continue;
      rocks.push({ x: px, z: pz, y: h, s: 1.2 + r() * 4.5, ry: r() * 6, rx: r() * 0.5 });
    }
  };
})();
