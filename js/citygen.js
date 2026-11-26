/* =====================================================================
   citygen.js — Génération de la ville à partir d'une GRAINE (identique
   chez tous les joueurs d'une même partie, différente à chaque partie).
   Structure « réaliste » :
   - une ROCADE rapide en U autour de la ville ;
   - 3 avenues sinueuses qui partent de l'atelier vers la rocade ;
   - des rues secondaires greffées en T, qui finissent en IMPASSE,
     rejoignent une autre rue (boucle) ou forment un LOTISSEMENT en boucle ;
   - les ENTREPRISES au fond des impasses (on doit aller les chercher) ;
   - immeubles, voitures garées, lampadaires, radars, feux, arbres,
     cachettes, perchoirs du pigeon, NOMS DE RUES ;
   - V5 : une RIVIÈRE qui traverse la ville (les routes la franchissent
     par des ponts, rien n'est construit dedans), des immeubles ESPACIL.
   Données pures : la construction 3D est dans world.js.
   ===================================================================== */
(function () {
  const CG = ML.CityGen = {};
  const RW = 5;                                   // demi-largeur de route
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
    return Math.hypot(px - ax - t * dx, pz - az - t * dz);
  };
  CG.segDist = segDist;
  CG.RIVER = { half: 7, node: 24, angle: 0.8 };   // demi-largeur d'eau, distance mini d'un carrefour, angle mini de franchissement
  function cross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    if (a === c || a === d || b === c || b === d) return false;
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }
  const inAtelier = (x, z, m) => x > -32 - m && x < 32 + m && z > -30 - m && z < 30 + m;
  const NAMES = ['rue Jean Jaurès', 'rue Victor Hugo', 'rue des Tourneurs', 'impasse du Copeau', 'rue de la Fraiseuse', 'allée des Plaquettes', 'rue Pasteur', 'rue du Moulin', 'impasse des Forges',
    'rue de la Mortaise', 'rue Gustave Eiffel', 'allée des Tilleuls', 'rue de la Gare', 'impasse du Poly', 'rue des Ajusteurs', 'rue Marie Curie', 'chemin de la Lande', 'rue du Taraud',
    'impasse de la Réf A', 'rue des Soudeurs', 'allée du Pied à Coulisse', 'rue de Bretagne', 'rue de l\'Usine', 'chemin du Lavoir', 'rue des Chaudronniers', 'impasse du Marbre',
    'rue Lebec', 'allée des Rosiers', 'rue du Four', 'rue de la Fonderie', 'impasse Arexis', 'rue des Apprentis', 'chemin creux', 'rue de la Mairie', 'rue des Écoles', 'allée du Tour'];

  CG.generate = seed => {
    const r = ML.U.rng(seed), M = ML.CFG.MAP;
    const city = { nodes: [], edges: [], companies: {}, fillers: [], parked: [], lamps: [], radars: [], lights: [], hides: [], trees: [], bushes: [], perches: [], rects: [], streets: [] };
    const N = city.nodes, E = city.edges;
    const names = NAMES.slice(); for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    let nameI = 0; const newStreet = (kind, forced) => { const s = { name: forced || names[nameI++ % names.length], kind }; city.streets.push(s); return city.streets.length - 1; };
    const inMap = (x, z, m) => x > M.minX + m && x < M.maxX - m && z > M.minZ + m && z < M.maxZ - m;
    const addNode = (x, z) => { N.push({ x, z }); return N.length - 1; };
    const deg = i => E.filter(e => e.a === i || e.b === i).length;
    const len = e => Math.hypot(N[e.b].x - N[e.a].x, N[e.b].z - N[e.a].z);
    /* ---------- Rivière (polyligne) ---------- */
    let RV = null;                                  // points de la rivière (null tant qu'elle n'existe pas)
    const rDist = (x, z) => { if (!RV) return 999; let m = 999; for (let i = 0; i < RV.length - 1; i++) { const d = segDist(x, z, RV[i].x, RV[i].z, RV[i + 1].x, RV[i + 1].z); if (d < m) m = d; } return m; };
    const RIV = CG.RIVER;
    /** Une route peut-elle franchir la rivière ici ? (franchissement net, carrefours loin de l'eau) */
    function riverOk(pa, pb) {
      if (!RV) return true;
      if (rDist(pa.x, pa.z) < RIV.node || rDist(pb.x, pb.z) < RIV.node) return false;
      let n = 0;
      for (let i = 0; i < RV.length - 1; i++) {
        const A = RV[i], B = RV[i + 1];
        if (!cross(pa, pb, A, B)) continue;
        const ux = pb.x - pa.x, uz = pb.z - pa.z, vx = B.x - A.x, vz = B.z - A.z;
        const c = Math.abs(ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz));
        if (Math.acos(Math.min(1, c)) < RIV.angle) return false;
        n++;
      }
      if (n > 1) return false;
      if (!n) { const L = Math.hypot(pb.x - pa.x, pb.z - pa.z); for (let t = 0; t <= 1.0001; t += 3 / L) if (rDist(pa.x + (pb.x - pa.x) * t, pa.z + (pb.z - pa.z) * t) < RIV.half + 5) return false; }
      return true;
    }

    /** La route [a→b] est-elle possible ? (pas de croisement, pas trop près d'une autre route ou d'un carrefour) */
    function clear(pa, pb, ia, ib, gap, skip) {
      gap = gap === undefined ? 15 : gap;
      const L = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      if (L < 18) return false;
      if (!riverOk(pa, pb)) return false;
      for (let t = 0; t <= 1.0001; t += 3 / L) { const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t; if (inAtelier(x, z, 3) || !inMap(x, z, 8)) return false; if (city.rects.some(o => Math.abs(o.x - x) < o.hx + RW + 2 && Math.abs(o.z - z) < o.hz + RW + 2)) return false; }
      for (const e of E) {
        if (cross(pa, pb, N[e.a], N[e.b])) return false;
        const share = e.a === ia || e.b === ia || e.a === ib || e.b === ib || e === skip;
        for (let t = 0; t <= 1.0001; t += 3 / L) {
          const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t;
          const nearEnd = Math.min(Math.hypot(x - pa.x, z - pa.z), Math.hypot(x - pb.x, z - pb.z));
          if (share && nearEnd < 22) continue;
          if (!share && nearEnd < 8 && (ia >= 0 && (e.a === ia || e.b === ia))) continue;
          if (segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < gap) return false;
        }
      }
      for (let i = 0; i < N.length; i++) if (i !== ia && i !== ib && !(skip && (i === skip.a || i === skip.b)) && segDist(N[i].x, N[i].z, pa.x, pa.z, pb.x, pb.z) < gap) return false;
      // pas d'angle trop fermé avec une route qui part du même carrefour
      for (const [n, o] of [[ia, pb], [ib, pa]]) {
        if (n < 0) continue;
        const a1 = Math.atan2(o.z - N[n].z, o.x - N[n].x);
        for (const e of E) { const other = e.a === n ? e.b : e.b === n ? e.a : -1; if (other < 0) continue; let d = Math.abs(a1 - Math.atan2(N[other].z - N[n].z, N[other].x - N[n].x)); d = Math.min(d, Math.PI * 2 - d); if (d < 0.6) return false; }
      }
      return true;
    }
    const link = (a, b, st, extra) => { const e = Object.assign({ a, b, st }, extra || {}); e.len = len(e); e.name = city.streets[st].name; E.push(e); return e; };
    /** Coupe une route en deux (pour greffer une rue en T) */
    function split(ei, t) {
      const e = E[ei], A = N[e.a], B = N[e.b];
      const k = addNode(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t);
      const b = e.b; e.b = k; e.len = len(e);
      link(k, b, e.st, { ring: e.ring });
      return k;
    }

    /* ---------- 1. Accès de l'atelier ---------- */
    addNode(0, 15); addNode(r.range(-6, 6), 40);
    link(0, 1, newStreet('acces', "rue de l'Atelier Lebec"));

    /* ---------- 2. Rocade en U ---------- */
    const ringSt = newStreet('rocade', 'Rocade'), ring = [];
    const cx = 0, cz = 150, rx = 150, rz = 160;
    for (let k = 0; k <= 13; k++) {
      const th = -0.22 + (Math.PI + 0.44) * k / 13;            // de la droite (en bas) à la gauche (en bas), par le haut
      const jit = r.range(-9, 9);
      let x = cx + (rx + jit) * Math.cos(-th + Math.PI * 0), z = cz + (rz + jit) * Math.sin(th);
      x = cx + (rx + jit) * Math.cos(th); z = cz + (rz + jit) * Math.sin(th);
      x = Math.max(M.minX + 12, Math.min(M.maxX - 12, x)); z = Math.max(M.minZ + 12, Math.min(M.maxZ - 12, z));
      ring.push(addNode(x, z));
    }
    for (let k = 0; k < ring.length - 1; k++) link(ring[k], ring[k + 1], ringSt, { ring: true });
    // les deux bouts descendent vers l'atelier
    for (const end of [ring[0], ring[ring.length - 1]]) {
      const s = Math.sign(N[end].x), k = addNode(s * r.range(95, 120), r.range(12, 26));
      link(end, k, ringSt, { ring: true });
      if (clear(N[k], N[1], k, 1, 12)) link(k, 1, newStreet('avenue'));
    }

    /* ---------- 3. Avenues sinueuses : atelier → rocade ---------- */
    const avAng = [-1.0, 0, 1.0].map(a => a + r.range(-0.25, 0.25));
    for (const a0 of avAng) {
      const st = newStreet('avenue'); let cur = 1, ang = Math.PI / 2 + a0;   // vers le haut de la carte (+z)
      for (let step = 0; step < 9; step++) {
        const L = r.range(36, 50); ang += r.range(-0.35, 0.35);
        const p = { x: N[cur].x + Math.cos(ang) * L, z: N[cur].z + Math.sin(ang) * L };
        // proche de la rocade ? on s'y raccorde
        let best = -1, bd = 60;
        for (const ri of ring) { const d = Math.hypot(N[ri].x - p.x, N[ri].z - p.z); if (d < bd && clear(N[cur], N[ri], cur, ri, 12)) { bd = d; best = ri; } }
        if (best >= 0 && bd < 45) { link(cur, best, st); break; }
        if (!clear(N[cur], p, cur, -1)) { ang += r.range(-0.6, 0.6); continue; }
        const k = addNode(p.x, p.z); link(cur, k, st); cur = k;
      }
    }

    /* ---------- 3 bis. La rivière : traverse la carte d'ouest en est, loin des carrefours ---------- */
    {
      let best = null, bs = -1e9;
      for (let k = 0; k < 120; k++) {
        const z0 = r.range(150, 262), A = r.range(10, 26), Lw = r.range(140, 230), ph = r() * 6.283, A2 = r.range(3, 8), L2 = r.range(45, 75), pts = [];
        for (let x = M.minX - 70; x <= M.maxX + 70; x += 10) pts.push({ x, z: z0 + A * Math.sin(x / Lw * 6.283 + ph) + A2 * Math.sin(x / L2 * 6.283 + ph * 2) });
        RV = pts; let sc = 0;
        for (const n of N) sc += Math.min(0, rDist(n.x, n.z) - RIV.node - 4) * 10;
        for (const e of E) {
          const pa = N[e.a], pb = N[e.b];
          for (let i = 0; i < pts.length - 1; i++) {
            if (!cross(pa, pb, pts[i], pts[i + 1])) continue;
            const ux = pb.x - pa.x, uz = pb.z - pa.z, vx = pts[i + 1].x - pts[i].x, vz = pts[i + 1].z - pts[i].z;
            const ang = Math.acos(Math.min(1, Math.abs(ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz))));
            sc += Math.min(0, ang - RIV.angle - 0.1) * 60;
          }
        }
        if (sc > bs) { bs = sc; best = pts; }
        if (sc >= 0) break;
      }
      RV = city.river = best;
    }

    /* ---------- 4. Rues secondaires : impasses, boucles, lotissements ---------- */
    function grow(ei, forceImpasse) {
      const e = E[ei]; if (!e || ei === 0 || e.len < 40) return -1;
      const t = r.range(0.3, 0.7), A = N[e.a], B = N[e.b];
      const px = A.x + (B.x - A.x) * t, pz = A.z + (B.z - A.z) * t, s = r() < 0.5 ? 1 : -1;
      let ang = Math.atan2(B.z - A.z, B.x - A.x) + s * Math.PI / 2 + r.range(-0.35, 0.35);
      const segs = forceImpasse ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3), pts = [];
      let cur = { x: px, z: pz };
      for (let i = 0; i < segs; i++) {
        const L = r.range(30, 46), q = { x: cur.x + Math.cos(ang) * L, z: cur.z + Math.sin(ang) * L };
        pts.push(q); cur = q; ang += r.range(-0.55, 0.55);
      }
      // validation sur un réseau virtuel (le carrefour n'existe pas encore)
      let prev = { x: px, z: pz }, first = true;
      for (const q of pts) { if (!clear(prev, q, -1, -1, 16, first ? e : null)) return -1; prev = q; first = false; }
      const st = newStreet(forceImpasse ? 'impasse' : 'rue');
      let ci = split(ei, t);
      for (const q of pts) { const k = addNode(q.x, q.z); link(ci, k, st); ci = k; }
      const end = ci, roll = forceImpasse ? 1 : r();
      if (roll < 0.25) {                                         // rejoint une autre rue : boucle
        let best = -1, bd = 70;
        for (let i = 0; i < N.length; i++) { if (i === end || deg(i) === 0) continue; const d = Math.hypot(N[i].x - N[end].x, N[i].z - N[end].z); if (d < bd && d > 20 && clear(N[end], N[i], end, i, 14)) { bd = d; best = i; } }
        if (best >= 0) link(end, best, st);
      } else if (roll < 0.45) {                                  // lotissement en boucle
        const a = ang, cxl = N[end].x + Math.cos(a) * 26, czl = N[end].z + Math.sin(a) * 26, n = 5, loop = [];
        let okLoop = true; const lp = [];
        for (let i = 0; i < n; i++) { const th = a + Math.PI + i * Math.PI * 2 / n; lp.push({ x: cxl + Math.cos(th) * 24, z: czl + Math.sin(th) * 24 }); }
        // le premier point est le bout de la rue ; on vérifie les autres côtés
        const P = [N[end]].concat(lp.slice(1));
        for (let i = 0; i < P.length && okLoop; i++) if (!clear(P[i], P[(i + 1) % P.length], i === 0 ? end : -1, i === P.length - 1 ? end : -1, 12)) okLoop = false;
        if (okLoop) {
          const sl = newStreet('lotissement', 'allée ' + ['des Lilas', 'des Mésanges', 'du Verger', 'des Hortensias', 'des Bleuets', 'des Ajoncs'][Math.floor(r() * 6)]);
          loop.push(end); for (let i = 1; i < n; i++) loop.push(addNode(lp[i].x, lp[i].z));
          for (let i = 0; i < n; i++) link(loop[i], loop[(i + 1) % n], sl);
          city.lotis = (city.lotis || []).concat([{ x: cxl, z: czl }]);
        }
      }
      return end;
    }
    for (let tries = 0; tries < 300 && N.length < 60; tries++) grow(Math.floor(r() * E.length), r() < 0.5);
    const deadEnds = () => N.map((n, i) => i).filter(i => i > 1 && deg(i) === 1 && Math.hypot(N[i].x, N[i].z) > 45);
    const nComp = Object.keys(ML.COMPANIES).filter(k => !ML.COMPANIES[k].virtual).length;
    for (let tries = 0; tries < 700 && deadEnds().length < nComp + 6; tries++) grow(Math.floor(r() * E.length), true);
    E.forEach(e => { e.len = len(e); e.name = city.streets[e.st].name; });
    for (const i of deadEnds()) N[i].cul = true;
    const nearRoad = (x, z, m) => E.some(e => segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < RW + m);

    /* ---------- 5. Entreprises au fond des impasses ---------- */
    const rects = city.rects;
    function fitAt(x, z, hx, hz, rot, margin) {
      const R = { x, z, hx, hz, rot };
      if (x - hx < M.minX + 4 || x + hx > M.maxX - 4 || z - hz < M.minZ + 4 || z + hz > M.maxZ - 4) return null;
      if (inAtelier(x, z, Math.max(hx, hz))) return null;
      if (rDist(x, z) < RIV.half + 6 + Math.hypot(hx, hz)) return null;
      if (rects.some(o => Math.abs(o.x - x) < o.hx + hx + margin && Math.abs(o.z - z) < o.hz + hz + margin)) return null;
      for (const e of E) {
        const A = N[e.a], B = N[e.b], steps = Math.ceil(e.len / 3);
        for (let i = 0; i <= steps; i++) { const px = A.x + (B.x - A.x) * i / steps, pz = A.z + (B.z - A.z) * i / steps; if (Math.abs(px - x) < hx + RW + 1 && Math.abs(pz - z) < hz + RW + 1) return null; }
      }
      return R;
    }
    /** Place un bâtiment (w×d) face au point (px,pz) d'une route, du côté (nx,nz) */
    function fitFacing(px, pz, nx, nz, w, d, gap, margin) {
      let best = 0, bd = -2;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, dot = Math.sin(a) * -nx + Math.cos(a) * -nz; if (dot > bd) { bd = dot; best = k; } }
      const hx = best % 2 ? d / 2 : w / 2, hz = best % 2 ? w / 2 : d / 2, depth = Math.abs(nx) * hx + Math.abs(nz) * hz;
      const off = RW + gap + depth;
      return fitAt(px + nx * off, pz + nz * off, hx, hz, best, margin);
    }
    const keys = Object.keys(ML.COMPANIES).filter(k => !ML.COMPANIES[k].virtual).sort((a, b) => (ML.COMPANIES[b].w * ML.COMPANIES[b].d) - (ML.COMPANIES[a].w * ML.COMPANIES[a].d));
    const placed = [], used = {};
    const place = (k, spot, culNode) => {
      const C = ML.COMPANIES[k];
      rects.push(spot); placed.push(spot); if (culNode !== undefined) used[culNode] = 1;
      const a = spot.rot * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      const loc = (lx, lz) => ({ x: spot.x + lx * ca + lz * sa, z: spot.z - lx * sa + lz * ca });
      city.companies[k] = { x: spot.x, z: spot.z, rot: spot.rot, hx: spot.hx, hz: spot.hz, dir: { x: sa, z: ca }, tan: { x: ca, z: -sa },
        dock: loc(-1, C.d / 2 + 1.9), npc: Object.assign(loc(5.5, C.d / 2 + 1.9), { yaw: a }), back: loc(r.range(-C.w / 3, C.w / 3), -C.d / 2 - 1.8), street: culNode !== undefined ? E.find(e => e.a === culNode || e.b === culNode).name : null };
      city.hides.push(city.companies[k].back);
    };
    for (const k of keys) {
      const C = ML.COMPANIES[k];
      const ends = deadEnds().filter(i => !used[i]).map(i => {
        const dA = Math.hypot(N[i].x, N[i].z), sep = placed.reduce((m, p) => Math.min(m, Math.hypot(p.x - N[i].x, p.z - N[i].z)), 999);
        return { i, score: sep * (C.near ? (dA < 150 ? 1.5 : 0.5) : 1) + r() * 30 };
      }).sort((a, b) => b.score - a.score);
      let done = false;
      for (const { i } of ends) {
        const e = E.find(x => x.a === i || x.b === i), o = N[e.a === i ? e.b : e.a], n = N[i];
        const ux = (n.x - o.x) / e.len, uz = (n.z - o.z) / e.len;
        const spot = fitFacing(n.x, n.z, ux, uz, C.w, C.d, 3.5, 3);
        if (spot) { place(k, spot, i); done = true; break; }
      }
      for (let t = 0; t < 400 && !done; t++) {                     // pas de place : on crée une impasse exprès
        const end = grow(1 + Math.floor(r() * (E.length - 1)), true); if (end < 0) continue;
        const e = E.find(x => x.a === end || x.b === end), o = N[e.a === end ? e.b : e.a], n = N[end];
        e.len = len(e); e.name = city.streets[e.st].name; n.cul = true;
        const spot = fitFacing(n.x, n.z, (n.x - o.x) / e.len, (n.z - o.z) / e.len, C.w, C.d, 3.5, 2);
        if (spot) { place(k, spot, end); done = true; }
      }
      if (!done) {                                                  // secours : le long d'une rue secondaire
        for (let t = 0; t < 300 && !done; t++) {
          const e = E[1 + Math.floor(r() * (E.length - 1))]; if (e.ring || e.len < 30) continue;
          const A = N[e.a], B = N[e.b], tt = r.range(0.3, 0.7), dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, s = r() < 0.5 ? 1 : -1;
          const spot = fitFacing(A.x + dx * e.len * tt, A.z + dz * e.len * tt, -dz * s, dx * s, C.w, C.d, 5, 4);
          if (spot) { place(k, spot); done = true; }
        }
      }
    }

    // on densifie la ville APRÈS avoir posé les entreprises (les rues contournent leurs terrains)
    for (let tries = 0; tries < 500 && N.length < 120; tries++) { const end = grow(Math.floor(r() * E.length), r() < 0.35); if (end >= 0 && deg(end) === 1) N[end].cul = true; }
    E.forEach(e => { e.len = len(e); });

    /* ---------- 6. Immeubles et maisons le long des rues ---------- */
    const blds = ['city_building_A', 'city_building_B', 'city_building_C', 'city_building_D', 'city_building_E', 'city_building_F', 'city_building_G', 'city_building_H'];
    const cands = [];
    E.forEach((e, ei) => {
      if (ei === 0 || e.ring) return;
      const A = N[e.a], B = N[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len;
      for (let t = 12; t < e.len - 12; t += 8) for (const s of [-1, 1]) cands.push({ px: A.x + dx * t, pz: A.z + dz * t, nx: -dz * s, nz: dx * s, key: r() });
    });
    cands.sort((a, b) => a.key - b.key);
    for (const c of cands) {
      if (city.fillers.length >= 70) break;
      if (r() < 0.3) continue;
      const R = fitFacing(c.px, c.pz, c.nx, c.nz, 15, 15, 3, 3); if (!R) continue;
      rects.push(R); city.fillers.push({ x: R.x, z: R.z, rot: R.rot, model: r.pick(blds), espacil: Math.hypot(R.x, R.z) > 70 && city.fillers.filter(f => f.espacil).length < 6 && r() < 0.22 });
      if (r() < 0.2) city.perches.push({ x: R.x, y: 13, z: R.z });
    }
    /* ---------- 7. Mobilier urbain ---------- */
    E.forEach((e, ei) => {
      const A = N[e.a], B = N[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, yaw = Math.atan2(dx, dz);
      for (let t = 12, s = 1; t < e.len - 12; t += 26, s = -s) {
        const x = A.x + dx * t - dz * s * (RW + 1.3), z = A.z + dz * t + dx * s * (RW + 1.3);
        if (!rects.some(o => Math.abs(o.x - x) < o.hx + 1 && Math.abs(o.z - z) < o.hz + 1) && rDist(x, z) > RIV.half + 5) city.lamps.push({ x, z, ry: Math.atan2(-dx * s, -dz * s), nx: dz * s, nz: -dx * s });
      }
      if (ei === 0 || e.ring) return;
      for (let t = 16; t < e.len - 16; t += 11) for (const s of [-1, 1]) {
        if (r() > 0.18) continue;
        const x = A.x + dx * t - dz * s * (RW + 2), z = A.z + dz * t + dx * s * (RW + 2);
        if (rects.some(o => Math.abs(o.x - x) < o.hx + 3 && Math.abs(o.z - z) < o.hz + 3) || rDist(x, z) < RIV.half + 6) continue;
        city.parked.push({ x, z, ry: yaw + (s > 0 ? 0 : Math.PI), model: r.pick(['city_car_hatchback', 'city_car_sedan', 'city_car_stationwagon', 'city_car_taxi']) });
      }
    });
    // radars : 2 sur les plus longues rues de ville, 1 sur la rocade
    const byLen = E.map((e, i) => [e.len, i]).filter(x => x[1] > 0).sort((a, b) => b[0] - a[0]);
    byLen.filter(x => !E[x[1]].ring).slice(0, 2).concat(byLen.filter(x => E[x[1]].ring).slice(0, 1)).forEach(([L, i]) => {
      const e = E[i], A = N[e.a], B = N[e.b], dx = (B.x - A.x) / L, dz = (B.z - A.z) / L;
      for (const t of [0.5, 0.3, 0.7, 0.2, 0.8]) {
        const x = A.x + (B.x - A.x) * t - dz * (RW + 1.6), z = A.z + (B.z - A.z) * t + dx * (RW + 1.6);
        if (rDist(x, z) > RIV.half + 8) { city.radars.push({ x, z, edge: i, ring: !!e.ring }); break; }
      }
    });
    N.forEach((n, i) => { if (deg(i) >= 3 && city.lights.length < 8 && !n.cul) city.lights.push(i); });
    /* ---------- 8. Nature, cachettes ---------- */
    const free = (x, z, m) => !inAtelier(x, z, 4) && !nearRoad(x, z, m) && !rects.some(o => Math.abs(o.x - x) < o.hx + m && Math.abs(o.z - z) < o.hz + m) && rDist(x, z) > RIV.half + 3 + m;
    for (let t = 0; t < 2500 && city.trees.length < 170; t++) { const x = r.range(M.minX + 4, M.maxX - 4), z = r.range(M.minZ + 4, M.maxZ - 4); if (free(x, z, 3)) city.trees.push({ x, z, k: r.range(0.85, 1.5), c: Math.floor(r() * 4) }); }
    for (let t = 0; t < 1000 && city.bushes.length < 60; t++) { const x = r.range(M.minX + 4, M.maxX - 4), z = r.range(M.minZ + 4, M.maxZ - 4); if (free(x, z, 1.5)) city.bushes.push({ x, z, s: r.range(4, 7), ry: r() * 6 }); }
    for (let t = 0; t < 600 && city.hides.length < 22; t++) {
      const tr = r.pick(city.trees); const x = tr.x + r.range(-2.5, 2.5), z = tr.z + r.range(-2.5, 2.5);
      if (free(x, z, 1) && Math.hypot(x, z) > 60) city.hides.push({ x, z });
    }
    for (let i = 0; i < 4; i++) { const l = r.pick(city.lamps); if (l) city.perches.push({ x: l.x, y: 5.8, z: l.z }); }
    // étiquettes de rues pour la carte : au milieu du plus long tronçon de chaque rue
    city.labels = city.streets.map((s, si) => {
      const es = E.filter(e => e.st === si); if (!es.length) return null;
      const e = es.reduce((m, x) => (x.len > m.len ? x : m)), A = N[e.a], B = N[e.b];
      return { name: s.name, x: (A.x + B.x) / 2, z: (A.z + B.z) / 2, a: Math.atan2(B.z - A.z, B.x - A.x) };
    }).filter(Boolean);
    /* ---------- 9. Ponts : chaque route qui franchit la rivière ---------- */
    city.bridges = [];
    if (RV) E.forEach((e, ei) => {
      const A = N[e.a], B = N[e.b];
      for (let i = 0; i < RV.length - 1; i++) {
        const P = RV[i], Q = RV[i + 1]; if (!cross(A, B, P, Q)) continue;
        const ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, vx = Q.x - P.x, vz = Q.z - P.z, vl = Math.hypot(vx, vz);
        const den = ux * vz - uz * vx; if (Math.abs(den) < 1e-6) continue;
        const t = ((P.x - A.x) * vz - (P.z - A.z) * vx) / den;          // distance le long de la route jusqu'à l'eau
        const sin = Math.abs(den) / vl, L = Math.min(e.len - 4, (RIV.half + 6) * 2 / Math.max(0.35, sin));
        city.bridges.push({ e: ei, x: A.x + ux * t, z: A.z + uz * t, ux, uz, len: L, ring: !!e.ring, name: e.name });
      }
    });
    city.riverDist = rDist; city.RIV = RIV;
    city.RW = RW;
    return city;
  };
})();
