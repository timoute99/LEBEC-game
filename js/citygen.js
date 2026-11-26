/* =====================================================================
   citygen.js — Génération du BOURG à partir d'une GRAINE (identique chez
   tous les joueurs d'une même partie, différente à chaque partie).
   V5 : un vrai bourg breton, dense :
   - la ROCADE rapide en U autour de la ville (inchangée) ;
   - la PLACE DU MARCHÉ au centre (église au nord, mairie sur un côté,
     commerces et terrasses tout autour, fontaine ou monument aux morts,
     étals, tilleuls, bancs) ;
   - 4 AXES qui partent de la place : la Grande Rue vers l'atelier, une route
     vers le nord et deux vers la rocade (est / ouest) ;
   - des QUARTIERS : centre ancien (rues étroites, maisons mitoyennes,
     commerces, venelles), lotissements (boucles et impasses de maisons à
     jardins, haies, clôtures), zone artisanale (fournisseurs et sous-
     traitants, hangars, garages), parc d'activités (clients) ;
   - les rues secondaires sont tracées par « comblement des vides » : on
     cherche le point le plus loin de toute rue et on y amène une rue
     (traversante, impasse ou boucle selon le quartier) ;
   - les bâtiments sont ALIGNÉS sur la rue, posés en rang le long de chaque
     trottoir (rectangles orientés : f.rot peut être non entier) ;
   - école + cour, supermarché + parking, stade, gendarmerie sur un axe,
     boulangerie et station près du centre ;
   - voitures garées, lampadaires, radars, feux, arbres, cachettes,
     perchoirs du pigeon, NOMS DE RUES, décor (city.deco).
   Données pures : la construction 3D est dans world.js.
   ===================================================================== */
(function () {
  const CG = ML.CityGen = {};
  const RW = 5;                                   // demi-largeur de route standard
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
    return Math.hypot(px - ax - t * dx, pz - az - t * dz);
  };
  CG.segDist = segDist;
  function cross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    if (a === c || a === d || b === c || b === d) return false;
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }
  /** zone de l'atelier et de sa cour : réservée (bâtiments) */
  const inAtelier = (x, z, m) => x > -46 - m && x < 46 + m && z > -44 - m && z < 40 + m;
  /** les routes peuvent frôler la cour (le carrefour de l'atelier est à z = 40) */
  const roadInAtelier = (x, z) => x > -35 && x < 35 && z > -33 && z < 33;
  /** couloir de la route en corniche (tracée ensuite par citygen_outer.js depuis la cour, à l'est de l'atelier) */
  const CORN = [[0, 15], [30, 20], [48, 6], [54, -30], [56, -50]];
  const cornDist = (x, z) => { let m = 1e9; for (let i = 0; i < CORN.length - 1; i++) m = Math.min(m, segDist(x, z, CORN[i][0], CORN[i][1], CORN[i + 1][0], CORN[i + 1][1])); return m; };

  /* ---------- Noms de rues par quartier ---------- */
  const NOMS = {
    centre: ['rue de l\'Église', 'rue du Calvaire', 'rue de la Poste', 'venelle du Four', 'rue du Presbytère', 'rue des Halles', 'rue Saint-Yves', 'rue du Puits',
      'rue des Lavandières', 'venelle des Chats', 'rue Anne de Bretagne', 'rue des Tanneurs', 'rue de la Croix Verte', 'rue Pasteur', 'rue Victor Hugo', 'rue Jean Jaurès',
      'venelle du Copeau', 'rue des Remparts', 'rue du Moulin', 'rue de la Fontaine', 'venelle du Sabot', 'rue des Cordiers', 'rue du Four à Pain', 'rue Théodore Botrel',
      'rue du Pardon', 'venelle de la Bavure', 'rue des Lebec', 'rue de la Monnaie'],
    resid: ['allée des Lilas', 'allée des Mésanges', 'rue du Verger', 'allée des Hortensias', 'rue des Bleuets', 'allée des Ajoncs', 'rue des Camélias', 'allée des Bruyères',
      'rue des Goélands', 'allée des Korrigans', 'rue des Genêts', 'impasse des Rossignols', 'rue des Fauvettes', 'allée des Pommiers', 'rue Marie Curie', 'rue des Écoles',
      'allée des Tilleuls', 'rue des Glycines', 'allée des Mimosas', 'rue du Menhir', 'rue des Chardonnerets', 'impasse des Pinsons', 'allée du Pied à Coulisse', 'rue des Apprentis',
      'impasse des Hirondelles', 'allée des Rosiers', 'impasse des Mouettes', 'rue de la Lande', 'chemin creux', 'impasse du Lavoir', 'allée des Cerisiers', 'impasse des Courlis',
      'rue des Primevères', 'allée des Écureuils', 'impasse des Bouvreuils', 'rue des Peupliers', 'impasse des Pruniers', 'allée des Fuchsias', 'rue Surcouf', 'impasse du Dolmen'],
    za: ['rue de l\'Industrie', 'rue des Tourneurs', 'rue de la Fraiseuse', 'rue des Ajusteurs', 'rue Gustave Eiffel', 'rue Denis Papin', 'rue des Soudeurs', 'rue des Chaudronniers',
      'impasse du Copeau', 'impasse des Forges', 'rue de la Fonderie', 'impasse du Taraud', 'rue du Mandrin', 'impasse de la Réf A', 'rue de l\'Usine', 'impasse du Marbre',
      'rue de la Mortaise', 'rue de l\'Alésage', 'impasse de la Bavure', 'rue du Tour Parallèle', 'impasse de l\'Étau', 'rue de la Lime', 'impasse du Burin'],
    parc: ['avenue de l\'Innovation', 'rue Ada Lovelace', 'rue Nikola Tesla', 'rue Sophie Germain', 'allée des Start-up', 'impasse Arexis', 'impasse du Poly', 'rue de la Cotation',
      'allée de la Tolérance', 'rue du Jeu Fonctionnel', 'impasse de l\'Ajustement H7', 'rue Isaac Newton', 'rue Blaise Pascal', 'impasse du Cahier des Charges', 'rue de la GPAO'],
    axe: ['Grande Rue', 'rue de Brest', 'route de Rennes', 'rue du Général de Gaulle', 'avenue de la République', 'rue de Quimper', 'avenue de la Gare', 'rue de Lorient', 'rue de Vannes']
  };
  const LOTIS = ['des Lilas', 'des Mésanges', 'du Verger', 'des Hortensias', 'des Bleuets', 'des Ajoncs', 'des Tamaris', 'des Camélias', 'du Clos Fleuri', 'des Embruns'];

  /* ---------- Rectangles orientés (bâtiments alignés sur la rue) ----------
     ry = rotation.y (three.js) : l'axe local x (largeur) = (cos ry, -sin ry),
     l'axe local z (profondeur, façade vers +z) = (sin ry, cos ry). */
  const mkOBB = (x, z, ry, hw, hd) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    return { x, z, ry, hw, hd, ax: c, az: -s, bx: s, bz: c, hx: Math.abs(c) * hw + Math.abs(s) * hd, hz: Math.abs(s) * hw + Math.abs(c) * hd };
  };
  const obbOf = R => R.obb || (R.obb = mkOBB(R.x, R.z, 0, R.hx, R.hz));
  const obbDist = (o, px, pz) => {
    const dx = px - o.x, dz = pz - o.z, lx = Math.abs(dx * o.ax + dz * o.az) - o.hw, lz = Math.abs(dx * o.bx + dz * o.bz) - o.hd;
    return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
  };
  const obbHit = (A, B, m) => {
    if (Math.abs(A.x - B.x) >= A.hx + B.hx + m || Math.abs(A.z - B.z) >= A.hz + B.hz + m) return false;
    const dx = B.x - A.x, dz = B.z - A.z;
    for (const [ux, uz] of [[A.ax, A.az], [A.bx, A.bz], [B.ax, B.az], [B.bx, B.bz]]) {
      const ra = A.hw * Math.abs(A.ax * ux + A.az * uz) + A.hd * Math.abs(A.bx * ux + A.bz * uz);
      const rb = B.hw * Math.abs(B.ax * ux + B.az * uz) + B.hd * Math.abs(B.bx * ux + B.bz * uz);
      if (Math.abs(dx * ux + dz * uz) >= ra + rb + m) return false;
    }
    return true;
  };
  CG.obb = mkOBB; CG.obbDist = obbDist;
  /** Grille de hachage spatial (requêtes rapides par boîte englobante) */
  function Grid(cell) { this.c = cell; this.m = new Map(); this.st = 0; }
  Grid.prototype.add = function (o, x0, z0, x1, z1) {
    const c = this.c;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) {
      const key = i * 4096 + k; let l = this.m.get(key); if (!l) this.m.set(key, l = []); l.push(o);
    }
  };
  /** fn(o) renvoie true pour arrêter (résultat true) */
  Grid.prototype.any = function (x0, z0, x1, z1, fn) {
    const c = this.c, st = ++this.st;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) {
      const l = this.m.get(i * 4096 + k); if (!l) continue;
      for (const o of l) { if (o._q === st) continue; o._q = st; if (fn(o)) return true; }
    }
    return false;
  };

  CG.generate = seed => {
    const r = ML.U.rng(seed), M = ML.CFG.CORE || ML.CFG.MAP, TR = ML.Terrain;
    TR.init(seed); TR.carveRiver(ML.U.rng(seed ^ 0x2c1b3c6d));                       // relief + rivière (terrain.js)
    const city = { nodes: [], edges: [], companies: {}, fillers: [], parked: [], lamps: [], radars: [], lights: [], hides: [], trees: [], bushes: [], perches: [], rects: [], streets: [], ringEnds: [], rural: [], forest: [], rocks: [], deco: [], lotis: [] };
    const N = city.nodes, E = city.edges, dg = [], rects = city.rects, deco = city.deco;
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pools = {}; for (const k in NOMS) pools[k] = shuffle(NOMS[k].slice());
    const taken = new Set();
    /** un nom libre du quartier (les impasses prennent de préférence un nom d'impasse) */
    const nameFor = (pool, kind) => {
      const P = pools[pool] || pools.resid, imp = kind === 'impasse', alley = kind === 'venelle';
      const ok = n => !taken.has(n) && (imp ? /^impasse/.test(n) : alley ? /^venelle/.test(n) : !/^impasse|^venelle/.test(n));
      let n = P.find(ok) || P.find(x => !taken.has(x)) || Object.values(pools).flat().find(x => !taken.has(x));
      if (!n) n = (imp ? 'impasse ' : 'rue ') + ['du Copeau', 'de la Bavure', 'du Poly', 'de la Cote'][Math.floor(r() * 4)] + ' ' + (taken.size + 1);
      taken.add(n); return n;
    };
    const newStreet = (kind, forced, pool) => { const s = { name: forced || nameFor(pool || 'resid', kind), kind }; taken.add(s.name); city.streets.push(s); return city.streets.length - 1; };
    const inMap = (x, z, m) => x > M.minX + m && x < M.maxX - m && z > M.minZ + m && z < M.maxZ - m;
    const addNode = (x, z) => { N.push({ x, z }); dg.push(0); return N.length - 1; };
    const len = e => Math.hypot(N[e.b].x - N[e.a].x, N[e.b].z - N[e.a].z);
    const link = (a, b, st, extra) => { const e = Object.assign({ a, b, st }, extra || {}); e.len = len(e); e.name = city.streets[st].name; E.push(e); dg[a]++; dg[b]++; return e; };
    const deg = i => dg[i] || 0;
    /** Coupe une route en deux (pour greffer une rue en T) */
    function split(e, t) {
      const A = N[e.a], B = N[e.b];
      const k = addNode(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t);
      const b = e.b; e.b = k; e.len = len(e); dg[b]--; dg[k]++;
      const ex = {}; for (const key in e) if (!['a', 'b', 'st', 'len', 'name', '_q'].includes(key)) ex[key] = e[key];
      link(k, b, e.st, ex);
      return k;
    }
    // rectangles réservés (entreprises, bâtiments, cours, parkings) : index spatial
    const rgrid = new Grid(24);
    const addRect = R => { rects.push(R); const o = obbOf(R); rgrid.add(R, o.x - o.hx, o.z - o.hz, o.x + o.hx, o.z + o.hz); return R; };

    /** La route [pa→pb] est-elle possible ? (pas de croisement, pas trop près d'une autre route ou d'un carrefour, angles pas trop fermés)
        ia/ib : nœuds existants aux bouts (ou -1) ; skips : arêtes sur lesquelles on se greffe en T */
    function clear(pa, pb, ia, ib, gap, skips) {
      skips = skips || [];
      const L = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      if (L < 18) return false;
      if ((ia >= 0 && deg(ia) >= 4) || (ib >= 0 && deg(ib) >= 4)) return false;
      const st = Math.min(0.5, 3 / L);
      const bx0 = Math.min(pa.x, pb.x) - 40, bx1 = Math.max(pa.x, pb.x) + 40, bz0 = Math.min(pa.z, pb.z) - 40, bz1 = Math.max(pa.z, pb.z) + 40;
      const near = []; rgrid.any(bx0, bz0, bx1, bz1, o => { near.push(obbOf(o)); });
      for (let t = 0; t <= 1.0001; t += st) {
        const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t;
        if (roadInAtelier(x, z) || !inMap(x, z, 8) || TR.riverDist(x, z) < RW + 8 || (z < 34 && cornDist(x, z) < 12)) return false;
        for (const o of near) if (obbDist(o, x, z) < RW + 2) return false;
      }
      const ends = new Set(); if (ia >= 0) ends.add(ia); if (ib >= 0) ends.add(ib); for (const e of skips) { ends.add(e.a); ends.add(e.b); }
      const skipN = Math.max(22, gap + 4);
      for (const e of E) {
        const A = N[e.a], B = N[e.b];
        if (Math.max(A.x, B.x) < bx0 || Math.min(A.x, B.x) > bx1 || Math.max(A.z, B.z) < bz0 || Math.min(A.z, B.z) > bz1) continue;
        const sk = skips.includes(e);
        if (!sk && cross(pa, pb, A, B)) return false;
        const share = sk || ends.has(e.a) || ends.has(e.b), gp = Math.max(gap, (e.rw || RW) + RW + 3);
        for (let t = 0; t <= 1.0001; t += st) {
          const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t;
          if (share && Math.min(Math.hypot(x - pa.x, z - pa.z), Math.hypot(x - pb.x, z - pb.z)) < skipN) continue;
          if (segDist(x, z, A.x, A.z, B.x, B.z) < gp) return false;
        }
      }
      for (let i = 0; i < N.length; i++) if (deg(i) && !ends.has(i) && segDist(N[i].x, N[i].z, pa.x, pa.z, pb.x, pb.z) < gap) return false;
      // angles aux carrefours
      const ux = (pb.x - pa.x) / L, uz = (pb.z - pa.z) / L;
      for (const [n, sx, sz] of [[ia, ux, uz], [ib, -ux, -uz]]) {
        if (n < 0) continue;
        for (const e of E) {
          const o = e.a === n ? e.b : e.b === n ? e.a : -1; if (o < 0) continue;
          const l = Math.hypot(N[o].x - N[n].x, N[o].z - N[n].z) || 1;
          if (Math.acos(Math.max(-1, Math.min(1, sx * (N[o].x - N[n].x) / l + sz * (N[o].z - N[n].z) / l))) < 0.62) return false;
        }
      }
      for (const e of skips) {                                     // greffe en T : la rue arrive franchement
        const A = N[e.a], B = N[e.b], l = Math.hypot(B.x - A.x, B.z - A.z) || 1, c = Math.abs(ux * (B.x - A.x) / l + uz * (B.z - A.z) / l);
        if (c > 0.72) return false;
      }
      return true;
    }

    /* ---------- Plans de rues : validés d'abord, posés ensuite ----------
       bout = { node } | { edge, t } (greffe en T) | { x, z } (point libre) */
    const ptOf = b => b.node !== undefined ? N[b.node] : b.edge ? { x: N[b.edge.a].x + (N[b.edge.b].x - N[b.edge.a].x) * b.t, z: N[b.edge.a].z + (N[b.edge.b].z - N[b.edge.a].z) * b.t } : b;
    function planOK(start, pts, end, gap) {
      const P = [ptOf(start)].concat(pts, [ptOf(end)]);
      for (let i = 0; i < P.length - 1; i++) {
        const first = i === 0, last = i === P.length - 2;
        const ia = first && start.node !== undefined ? start.node : -1, ib = last && end.node !== undefined ? end.node : -1;
        const sk = []; if (first && start.edge) sk.push(start.edge); if (last && end.edge) sk.push(end.edge);
        if (!clear(P[i], P[i + 1], ia, ib, gap, sk)) return false;
      }
      // les tronçons du plan ne doivent pas se recouper entre eux
      for (let i = 0; i < P.length - 1; i++) for (let j = i + 2; j < P.length - 1; j++) if (cross(P[i], P[i + 1], P[j], P[j + 1])) return false;
      return true;
    }
    const resolve = b => b.node !== undefined ? b.node : b.edge ? split(b.edge, b.t) : addNode(b.x, b.z);
    function commit(start, pts, end, st, flags) {
      const ids = [resolve(start)];
      for (const p of pts) ids.push(addNode(p.x, p.z));
      ids.push(resolve(end));
      const out = [];
      for (let i = 0; i < ids.length - 1; i++) { out.push(link(ids[i], ids[i + 1], st, Object.assign({}, flags))); stampEdge(N[ids[i]], N[ids[i + 1]]); }
      return ids;
    }
    /** un point d'arête, à au moins 16 m des carrefours (sinon le carrefour lui-même) */
    function anchor(e, t) {
      const L = e.len, s = t * L;
      if (L >= 46) return { edge: e, t: Math.max(23, Math.min(L - 23, s)) / L };
      const n = s < L / 2 ? e.a : e.b; return { node: n };
    }

    /* ---------- 1. Accès de l'atelier ---------- */
    addNode(0, 15); addNode(r.range(-6, 6), 40);
    link(0, 1, newStreet('acces', "rue de l'Atelier Lebec"));

    /* ---------- 2. Rocade en U ---------- */
    const ringSt = newStreet('rocade', 'Rocade'), ring = [];
    const rcx = 10, rcz = 178, rx = 198, rz = 196;
    for (let k = 0; k <= 15; k++) {
      const th = -0.22 + (Math.PI + 0.44) * k / 15;            // de la droite (en bas) à la gauche (en bas), par le haut
      const jit = r.range(-9, 9);
      let x = rcx + (rx + jit) * Math.cos(th), z = rcz + (rz + jit) * Math.sin(th);
      x = Math.max(M.minX + 12, Math.min(M.maxX - 12, x)); z = Math.max(M.minZ + 12, Math.min(M.maxZ - 12, z));
      for (let i = 0; i < 40 && TR.riverDist(x, z) < 34; i++) { x += (rcx - x) * 0.04; z += (rcz - z) * 0.04; }   // loin de la rivière
      ring.push(addNode(x, z));
    }
    for (let k = 0; k < ring.length - 1; k++) link(ring[k], ring[k + 1], ringSt, { ring: true });
    // les deux bouts descendent vers l'atelier
    for (const end of [ring[0], ring[ring.length - 1]]) {
      const s = Math.sign(N[end].x), k = addNode(s * r.range(108, 128), r.range(12, 26));
      link(end, k, ringSt, { ring: true }); city.ringEnds.push(k);
      if (clear(N[k], N[1], k, 1, 12)) link(k, 1, newStreet('avenue', null, 'axe'), { axis: true });
    }
    // contour de la ville (pour savoir ce qui est « dedans »)
    const poly = [city.ringEnds[0]].concat(ring, [city.ringEnds[1], 1]).map(i => N[i]);
    const inside = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };

    /* ---------- Champ de distance aux routes (pour combler les vides) ---------- */
    const GC = 4, GW = Math.ceil((M.maxX - M.minX) / GC), GH = Math.ceil((M.maxZ - M.minZ) / GC);
    const gxc = i => M.minX + (i + 0.5) * GC, gzc = k => M.minZ + (k + 0.5) * GC;
    const dfield = new Float32Array(GW * GH).fill(1e9), cellOK = new Uint8Array(GW * GH), cellD = new Uint8Array(GW * GH);
    function stampEdge(A, B) {
      const R = 70, i0 = Math.max(0, Math.floor((Math.min(A.x, B.x) - R - M.minX) / GC)), i1 = Math.min(GW - 1, Math.ceil((Math.max(A.x, B.x) + R - M.minX) / GC));
      const k0 = Math.max(0, Math.floor((Math.min(A.z, B.z) - R - M.minZ) / GC)), k1 = Math.min(GH - 1, Math.ceil((Math.max(A.z, B.z) + R - M.minZ) / GC));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) { const q = k * GW + i, d = segDist(gxc(i), gzc(k), A.x, A.z, B.x, B.z); if (d < dfield[q]) dfield[q] = d; }
    }
    /** les cellules sous un rectangle réservé ne sont plus des « vides » */
    function blockCells(o, m) {
      const i0 = Math.max(0, Math.floor((o.x - o.hx - m - M.minX) / GC)), i1 = Math.min(GW - 1, Math.ceil((o.x + o.hx + m - M.minX) / GC));
      const k0 = Math.max(0, Math.floor((o.z - o.hz - m - M.minZ) / GC)), k1 = Math.min(GH - 1, Math.ceil((o.z + o.hz + m - M.minZ) / GC));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) if (obbDist(o, gxc(i), gzc(k)) < m) cellOK[k * GW + i] = 0;
    }
    const reserve = R => { addRect(R); blockCells(obbOf(R), 6); return R; };
    E.forEach(e => stampEdge(N[e.a], N[e.b]));

    /* ---------- 3. Place du Marché + 4 axes ---------- */
    const TC = city.center = { x: r.range(-6, 22), z: r.range(180, 198) };
    const PW = r.range(24, 28), PH = r.range(20, 23), PRW = 4;      // demi-dimensions de la place (axes des rues) ; rues de 8 m
    const stP = newStreet('place', 'place du Marché'), PF = { rw: PRW, place: true, narrow: true };
    const sw = addNode(TC.x - PW, TC.z - PH), smid = addNode(TC.x + r.range(-4, 4), TC.z - PH), se = addNode(TC.x + PW, TC.z - PH), ne = addNode(TC.x + PW, TC.z + PH), nw = addNode(TC.x - PW, TC.z + PH);
    const pE = [link(sw, smid, stP, PF), link(smid, se, stP, PF), link(se, ne, stP, PF), link(ne, nw, stP, PF), link(nw, sw, stP, PF)];
    pE.forEach(e => stampEdge(N[e.a], N[e.b]));
    city.place = { x: TC.x, z: TC.z, hw: PW, hd: PH, rw: PRW };
    const westMid = r() < 0.5;                                     // l'axe ouest part du milieu du côté ouest, sinon l'axe est (et la mairie va en face)
    const AX = { axis: true }, axes = {};
    /** relie le nœud `from` à la rocade (vers le point visé `aim`), en 2-3 tronçons légèrement sinueux */
    function toRing(from, aim, st, flags) {
      const cands = [];
      for (const k of ring) if (deg(k) < 4) cands.push({ node: k, p: N[k] });
      for (const e of E) if (e.ring) for (let s = 16; s < e.len - 16; s += 8) cands.push({ edge: e, t: s / e.len, p: ptOf({ edge: e, t: s / e.len }) });
      cands.sort((a, b) => Math.hypot(a.p.x - aim.x, a.p.z - aim.z) - Math.hypot(b.p.x - aim.x, b.p.z - aim.z));
      for (const c of cands.slice(0, 18)) {
        const A = N[from], B = c.p, L = Math.hypot(B.x - A.x, B.z - A.z), nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L, segs = L > 100 ? 3 : 2, pts = [];
        for (let i = 1; i < segs; i++) { const j = r.range(-6, 6); pts.push({ x: A.x + (B.x - A.x) * i / segs + nx * j, z: A.z + (B.z - A.z) * i / segs + nz * j }); }
        const end = c.node !== undefined ? { node: c.node } : { edge: c.edge, t: c.t };
        if (planOK({ node: from }, pts, end, 12)) return commit({ node: from }, pts, end, st, flags);
        if (planOK({ node: from }, [], end, 12)) return commit({ node: from }, [], end, st, flags);
      }
      return null;
    }
    // Grande Rue : de l'atelier à la place
    {
      const A = N[1], B = N[smid], pts = [];
      for (const k of [0.36, 0.7]) pts.push({ x: A.x + (B.x - A.x) * k + r.range(-6, 6), z: A.z + (B.z - A.z) * k });
      const st = newStreet('avenue', 'Grande Rue');
      if (planOK({ node: 1 }, pts, { node: smid }, 12)) axes.S = commit({ node: 1 }, pts, { node: smid }, st, AX).reverse();
      else if (planOK({ node: 1 }, [], { node: smid }, 12)) axes.S = commit({ node: 1 }, [], { node: smid }, st, AX).reverse();
    }
    // vers le nord (depuis un coin nord de la place)
    { const c = r() < 0.5 ? nw : ne; axes.N = toRing(c, { x: N[c].x + r.range(-25, 25), z: 420 }, newStreet('avenue', null, 'axe'), AX); }
    // vers l'ouest et vers l'est
    for (const s of [-1, 1]) {
      const mid = s < 0 ? westMid : !westMid;
      let from;
      if (mid) { const e = s < 0 ? pE[4] : pE[2]; from = split(e, r.range(0.4, 0.6)); stampEdge(N[e.a], N[e.b]); }
      else from = s < 0 ? sw : se;
      axes[s < 0 ? 'W' : 'E'] = toRing(from, { x: s * 280, z: N[from].z + r.range(-25, 15) }, newStreet('avenue', null, 'axe'), AX);
    }
    E.forEach(e => { if (e.axis) e.rw = 5; });
    /* « Tour de ville » : une rue étroite qui fait le tour du centre ancien à ~40 m de la place,
       en 4 morceaux (un par quartier) greffés sur les axes → îlots de maisons mitoyennes dos à dos */
    const edgeOf = (a, b) => E.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    /** point de l'axe (liste de nœuds depuis la place) à la distance d */
    const axisAt = (ids, d) => {
      for (let i = 0; ids && i < ids.length - 1; i++) {
        const e = edgeOf(ids[i], ids[i + 1]); if (!e) return null;
        if (d <= e.len) { const t = e.a === ids[i] ? d / e.len : 1 - d / e.len; return anchor(e, t); }
        d -= e.len;
      }
      return null;
    };
    for (const [v, h] of [['S', 'W'], ['S', 'E'], ['N', 'W'], ['N', 'E']]) {
      let done = false;
      for (const dv of (v === 'N' ? [50, 58, 44] : [40, 48, 34])) for (const dh of [40, 48, 34]) {
        if (done) break;
        const a = axisAt(axes[v], dv), b = axisAt(axes[h], dh); if (!a || !b) continue;
        const Pv = ptOf(a), Ph = ptOf(b), C = { x: Ph.x, z: Pv.z };
        if (Math.hypot(C.x - Pv.x, C.z - Pv.z) < 20 || Math.hypot(C.x - Ph.x, C.z - Ph.z) < 20) continue;
        if (planOK(a, [C], b, 13)) { commit(a, [C], b, newStreet('rue', null, 'centre'), { rw: 4, narrow: true }); done = true; }
      }
    }

    /* ---------- Quartiers ---------- */
    const zaSide = r() < 0.5 ? 'W' : 'E', other = zaSide === 'W' ? 'E' : 'W', parcNorth = r() < 0.35;
    const plan = {}; plan[zaSide + 'S'] = 'za';
    if (parcNorth) { plan[other + 'S'] = 'resid'; plan[other + 'N'] = 'parc'; plan[zaSide + 'N'] = 'resid'; } else { plan[other + 'S'] = 'parc'; plan[other + 'N'] = 'resid'; plan[zaSide + 'N'] = 'resid'; }
    const RC = r.range(80, 92);
    const district = (x, z) => {
      const dx = x - TC.x, dz = z - TC.z;
      if (Math.hypot(dx / RC, dz / (RC * 0.9)) < 1) return 'centre';
      const q = plan[(dx < 0 ? 'W' : 'E') + (dz < 0 ? 'S' : 'N')];
      if (q === 'parc' && parcNorth && Math.hypot(dx, dz) < 130) return 'resid';
      return q;
    };
    city.district = district; city.plan = plan;
    const DK = ['centre', 'resid', 'za', 'parc'];
    // paramètres de rue par quartier : D = distance max à une rue avant d'en tracer une nouvelle, gap = écart mini entre rues
    const PRM = {
      centre: { D: 17, gap: 15, rw: 4, kinds: [['through', 0.8], ['alley', 0.2]], narrow: true, pool: 'centre', maxL: 105 },
      resid: { D: 22, gap: 19, rw: 4.5, kinds: [['loop', 0.3], ['cul', 0.42], ['through', 0.28]], pool: 'resid', maxL: 140 },
      za: { D: 27, gap: 24, rw: 5.5, kinds: [['cul', 0.55], ['through', 0.45]], pool: 'za', maxL: 150 },
      parc: { D: 27, gap: 24, rw: 5, kinds: [['through', 0.55], ['cul', 0.45]], pool: 'parc', maxL: 150 }
    };
    for (let k = 0; k < GH; k++) for (let i = 0; i < GW; i++) {
      const x = gxc(i), z = gzc(k), q = k * GW + i;
      cellOK[q] = inside(x, z) && !inAtelier(x, z, 10) && TR.riverDist(x, z) > 16 && inMap(x, z, 10) ? 1 : 0;
      cellD[q] = DK.indexOf(district(x, z));
    }
    // la place elle-même n'est pas un vide
    blockCells(mkOBB(TC.x, TC.z, 0, PW, PH), 1);
    reserve({ x: TC.x, z: TC.z, hx: PW - PRW - 2.1, hz: PH - PRW - 2.1, place: true });

    /** Trace une rue vers le vide V. Renvoie true si une rue a été posée. */
    function fillVoid(V, dk) {
      const p = PRM[dk];
      // route la plus proche (pas l'accès de l'atelier)
      let be = null, bt = 0, bd = 1e9;
      for (let i = 1; i < E.length; i++) {
        const e = E[i], A = N[e.a], B = N[e.b], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((V.x - A.x) * dx + (V.z - A.z) * dz) / L2)), d = Math.hypot(V.x - A.x - dx * t, V.z - A.z - dz * t);
        if (d < bd) { bd = d; be = e; bt = t; }
      }
      if (!be || bd > 95) return false;
      const start = anchor(be, bt), S = ptOf(start);
      let ux, uz;
      if (start.edge) { const A = N[be.a], B = N[be.b], L = be.len; ux = -(B.z - A.z) / L; uz = (B.x - A.x) / L; if (ux * (V.x - S.x) + uz * (V.z - S.z) < 0) { ux = -ux; uz = -uz; } }
      else { const L = Math.hypot(V.x - S.x, V.z - S.z) || 1; ux = (V.x - S.x) / L; uz = (V.z - S.z) / L; }
      const dV = Math.hypot(V.x - S.x, V.z - S.z);
      // ordre des essais selon le quartier
      const order = p.kinds.map(([k, w]) => [k, r() * w]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      if (!order.includes('cul')) order.push('cul');
      const flags = { rw: p.rw }; if (p.narrow) flags.narrow = true;
      for (const kind of order) for (let v = 0; v < 3; v++) {
        const a = v === 0 ? 0 : r.range(-0.22, 0.22), ca = Math.cos(a), sa = Math.sin(a), dx = ux * ca - uz * sa, dz = ux * sa + uz * ca;
        if (kind === 'through') {
          // rayon : première route touchée
          let hit = null, hs = 1e9;
          for (const e of E) {
            if (e === be || (start.node !== undefined && (e.a === start.node || e.b === start.node))) continue;
            const A = N[e.a], B = N[e.b], ex = B.x - A.x, ez = B.z - A.z, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-6) continue;
            const s = ((A.x - S.x) * ez - (A.z - S.z) * ex) / den, t = ((A.x - S.x) * dz - (A.z - S.z) * dx) / den;
            if (s > 18 && s < p.maxL && t >= 0 && t <= 1 && s < hs) { hs = s; hit = { e, t }; }
          }
          if (!hit || hs < dV * 0.8) continue;
          const end = anchor(hit.e, hit.t); if (end.node !== undefined && start.node === end.node) continue;
          const Q = ptOf(end), L = Math.hypot(Q.x - S.x, Q.z - S.z), pts = [];
          if (L > 60) { const j = r.range(-3, 3); pts.push({ x: (S.x + Q.x) / 2 - dz * j, z: (S.z + Q.z) / 2 + dx * j }); }
          if (planOK(start, pts, end, p.gap)) { commit(start, pts, end, newStreet(dk === 'centre' && L < 45 ? 'venelle' : 'rue', null, p.pool), flags); return true; }
        } else if (kind === 'cul' || kind === 'alley') {
          const Lc = kind === 'alley' ? r.range(20, 30) : Math.max(26, Math.min(dk === 'za' || dk === 'parc' ? 80 : 64, dV + r.range(10, 18)));
          const pts = [], end = { x: S.x + dx * Lc, z: S.z + dz * Lc };
          if (Lc > 44 && r() < 0.5) {                                  // impasse coudée
            const m = { x: S.x + dx * Lc * 0.55, z: S.z + dz * Lc * 0.55 }, b = r.range(-0.4, 0.4), L2 = Lc * 0.45;
            pts.push(m); end.x = m.x + (dx * Math.cos(b) - dz * Math.sin(b)) * L2; end.z = m.z + (dx * Math.sin(b) + dz * Math.cos(b)) * L2;
          }
          // le rond de retournement doit rester loin des autres routes
          if (E.some(e => segDist(end.x, end.z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < p.gap + 4)) continue;
          if (planOK(start, pts, end, p.gap)) {
            const ids = commit(start, pts, end, newStreet(kind === 'alley' ? 'venelle' : 'impasse', null, p.pool), kind === 'alley' ? { rw: 3.6, narrow: true, alley: true } : flags);
            N[ids[ids.length - 1]].cul = true; return true;
          }
        } else if (kind === 'loop') {
          // lotissement : une tige puis une boucle de 6 côtés
          const Ls = Math.max(18, Math.min(36, dV - 6)), Q = { x: S.x + dx * Ls, z: S.z + dz * Ls }, R = r.range(20, 25), C = { x: Q.x + dx * R, z: Q.z + dz * R }, n = 6, lp = [];
          const th0 = Math.atan2(Q.z - C.z, Q.x - C.x);
          for (let i = 1; i < n; i++) { const th = th0 + i * Math.PI * 2 / n; lp.push({ x: C.x + Math.cos(th) * R * 1.12, z: C.z + Math.sin(th) * R }); }
          if (!planOK(start, [], Q, p.gap)) continue;
          // la boucle : on la valide comme un chemin Q → lp → Q (le dernier tronçon revient sur Q)
          const P = [Q].concat(lp, [Q]); let ok = true;
          for (let i = 0; i < P.length - 1 && ok; i++) ok = clear(P[i], P[i + 1], -1, -1, Math.min(p.gap, 16), []);
          if (!ok) continue;
          const ln = LOTIS.map(x => 'allée ' + x).filter(x => !taken.has(x)), sl = newStreet('lotissement', ln.length ? ln[Math.floor(r() * ln.length)] : null, 'resid');
          const ids = commit(start, [], Q, sl, flags), q = ids[ids.length - 1], loop = [q];
          for (const pt of lp) loop.push(addNode(pt.x, pt.z));
          for (let i = 0; i < n; i++) { link(loop[i], loop[(i + 1) % n], sl, Object.assign({}, flags)); stampEdge(N[loop[i]], N[loop[(i + 1) % n]]); }
          city.lotis.push({ x: C.x, z: C.z, r: R });
          blockCells(mkOBB(C.x, C.z, 0, R * 0.55, R * 0.5), 0.1);
          return true;
        }
      }
      return false;
    }
    /** Comble les vides des quartiers donnés (le point le plus loin d'une rue d'abord) */
    function fillAll(which, iters, scale) {
      const fail = new Uint8Array(GW * GH), want = which.map(k => DK.indexOf(k));
      for (let it = 0; it < iters; it++) {
        let best = -1, bv = 1;
        for (let q = 0; q < GW * GH; q++) {
          if (!cellOK[q] || fail[q] || !want.includes(cellD[q])) continue;
          const v = dfield[q] / (PRM[DK[cellD[q]]].D * (scale || 1)); if (v > bv) { bv = v; best = q; }
        }
        if (best < 0) return;
        const i = best % GW, k = (best - i) / GW, V = { x: gxc(i), z: gzc(k) };
        if (!fillVoid(V, DK[cellD[best]])) for (let dk = -3; dk <= 3; dk++) for (let di = -3; di <= 3; di++) { const ii = i + di, kk = k + dk; if (ii >= 0 && kk >= 0 && ii < GW && kk < GH && di * di + dk * dk <= 10) fail[kk * GW + ii] = 1; }
      }
    }

    /* ---------- 4. Bâtiments repères posés tôt (église, mairie, école, supermarché, stade) ---------- */
    const KIT = ML.Build && ML.Build.sizes ? ML.Build.sizes : { maison: [10, 9], longere: [16, 8], mitoyennes: [15, 10], immeuble: [15, 14], commerce: [14, 12], eglise: [18, 30], mairie: [24, 16], ecole: [26, 16], supermarche: [34, 24], garage: [16, 12], hangar: [20, 14] };
    let rgE = null;                                                 // index spatial des routes (reconstruit quand le réseau change)
    let nodeR = [];
    function indexRoads() {
      rgE = new Grid(24); nodeR = N.map(() => 0);
      E.forEach(e => { const A = N[e.a], B = N[e.b], m = (e.rw || RW); rgE.add(e, Math.min(A.x, B.x) - m, Math.min(A.z, B.z) - m, Math.max(A.x, B.x) + m, Math.max(A.z, B.z) + m); nodeR[e.a] = Math.max(nodeR[e.a], e.rw || RW); nodeR[e.b] = Math.max(nodeR[e.b], e.rw || RW); });
    }
    /** Le rectangle orienté o est-il libre ? margin = écart aux autres rectangles, road = écart au bord des chaussées */
    function fitOBB(o, margin, road) {
      if (o.x - o.hx < M.minX + 3 || o.x + o.hx > M.maxX - 3 || o.z - o.hz < M.minZ + 3 || o.z + o.hz > M.maxZ - 3) return false;
      if (o.x + o.hx > -48 && o.x - o.hx < 48 && o.z + o.hz > -46 && o.z - o.hz < 42) return false;      // atelier et sa cour
      if (TR.riverDist(o.x, o.z) < Math.max(o.hx, o.hz) + 6) return false;
      if (o.z - o.hz < 30 && o.x + o.hx > 10 && o.x - o.hx < 80 && CORN.some(([x, z]) => obbDist(o, x, z) < 9) || (o.z - o.hz < 30 && o.x + o.hx > 10 && o.x - o.hx < 80 && cornDist(o.x, o.z) < Math.max(o.hw, o.hd) + 7)) return false;
      if (rgrid.any(o.x - o.hx - margin - 1, o.z - o.hz - margin - 1, o.x + o.hx + margin + 1, o.z + o.hz + margin + 1, R => obbHit(o, obbOf(R), margin))) return false;
      const ext = 10 + road;
      if (rgE.any(o.x - o.hx - ext, o.z - o.hz - ext, o.x + o.hx + ext, o.z + o.hz + ext, e => {
        const A = N[e.a], B = N[e.b], rw = (e.rw || RW) + road, L = e.len || 1;
        if (segDist(o.x, o.z, A.x, A.z, B.x, B.z) > rw + o.hw + o.hd) return false;
        const n = Math.ceil(L / 1.2);
        for (let i = 0; i <= n; i++) { const t = i / n; if (obbDist(o, A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t) < rw) return true; }
        for (const k of [e.a, e.b]) { const rr = N[k].cul ? RW + 3.5 : nodeR[k]; if (obbDist(o, N[k].x, N[k].z) < rr + road) return true; }
        return false;
      })) return false;
      return true;
    }
    const addFiller = (o, type, w, d, extra) => {
      const rot = o.ry / (Math.PI / 2), rr = Math.abs(rot - Math.round(rot)) < 0.035 ? Math.round(rot) : rot;
      const f = Object.assign({ x: o.x, z: o.z, rot: rr, type, w, d, hx: o.hx, hz: o.hz, k: Math.floor(r() * 1e9), obb: o }, extra || {});
      addRect(f); city.fillers.push(f); blockCells(o, 4); return f;
    };
    /** rectangle w×d face à la rue (point P de l'arête, normale n côté bâtiment), recul `back` depuis le bord de chaussée */
    const facing = (px, pz, nx, nz, rw, back, w, d) => { const off = rw + back + d / 2; return mkOBB(px + nx * off, pz + nz * off, Math.atan2(-nx, -nz), w / 2, d / 2); };
    /** candidats le long des arêtes : {e, t, s, P, n} */
    function frontCands(filter, step) {
      const out = [];
      E.forEach((e, ei) => {
        if (ei === 0 || !filter(e)) return;
        const A = N[e.a], B = N[e.b], L = e.len, ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
        for (let t = 12; t < L - 12; t += step) for (const s of [-1, 1]) {
          const nx = -uz * s, nz = ux * s;
          if (e.ring && (nx * (TC.x - A.x) + nz * (TC.z - A.z)) < 0) continue;         // rocade : seulement le côté ville
          out.push({ e, t, s, x: A.x + ux * t, z: A.z + uz * t, nx, nz, ux, uz });
        }
      });
      return out;
    }
    indexRoads();
    // l'église au nord de la place, face au sud ; la mairie sur le côté sans axe au milieu
    {
      const [w, d] = KIT.eglise;
      for (const dx of [0, -3, 3, -6, 6]) { const o = mkOBB(TC.x + dx, TC.z + PH + PRW + 4 + d / 2, Math.PI, w / 2, d / 2); if (fitOBB(o, 2, 1.5)) { const f = addFiller(o, 'eglise', w, d); city.perches.push({ x: f.x, y: 22, z: f.z }); city.church = f; break; } }
      const s = westMid ? 1 : -1, [mw, md] = KIT.mairie;
      for (const dz of [0, -3, 3, 5, -5]) for (const ww of [mw, mw - 3]) {
        if (city.mairie) break;
        const o = mkOBB(TC.x + s * (PW + PRW + 3 + md / 2), TC.z + dz, s > 0 ? -Math.PI / 2 : Math.PI / 2, ww / 2, md / 2);
        if (fitOBB(o, 2, 1.5)) city.mairie = addFiller(o, 'mairie', ww, md);
      }
    }
    /** Pose un « lot » (bâtiment + annexe derrière ou devant) le long d'une rue. annex : {w, d, where:'front'|'back', t} */
    function placeLot(type, w, d, back, filter, score, annex) {
      const cs = frontCands(filter, 5).map(c => ({ c, s: score(c) + r() * 10 })).filter(x => x.s > -1e8).sort((a, b) => b.s - a.s);
      for (const { c } of cs.slice(0, 260)) {
        const front = annex && annex.where === 'front' ? annex.d + 1 : 0;
        const o = facing(c.x, c.z, c.nx, c.nz, c.e.rw || RW, back + front, w, d);
        if (!fitOBB(o, 3, 1.5)) continue;
        let a = null;
        if (annex) {
          const off = annex.where === 'front' ? (c.e.rw || RW) + back + annex.d / 2 : (c.e.rw || RW) + back + d + 0.5 + annex.d / 2;
          a = mkOBB(c.x + c.nx * off, c.z + c.nz * off, o.ry, annex.w / 2, annex.d / 2);
          if (!fitOBB(a, 2, 1)) continue;
        }
        const f = addFiller(o, type, w, d);
        if (a) { const R = reserve({ x: a.x, z: a.z, hx: a.hx, hz: a.hz, obb: a, annex: annex.t }); deco.push({ t: annex.t, x: a.x, z: a.z, ry: a.ry, hw: a.hw, hd: a.hd, flat: true }); f.annex = R; }
        return f;
      }
      return null;
    }
    const dTC = c => Math.hypot(c.x - TC.x, c.z - TC.z);
    // école (+ cour) dans un quartier résidentiel pas trop loin du centre
    city.school = placeLot('ecole', KIT.ecole[0], KIT.ecole[1], 3, e => e.axis || e.ring, c => (district(c.x + c.nx * 25, c.z + c.nz * 25) === 'resid' ? 0 : -60) - Math.abs(dTC(c) - 95), { w: KIT.ecole[0], d: 16, where: 'back', t: 'cour' });
    // supermarché + parking devant, sur un axe ou la rocade, loin de la place
    city.market = placeLot('supermarche', KIT.supermarche[0], KIT.supermarche[1], 2, e => e.axis || e.ring, c => { const dk = district(c.x + c.nx * 30, c.z + c.nz * 30); return (dk === 'resid' || dk === 'parc' ? 0 : -80) - Math.abs(dTC(c) - 125) * 0.6; }, { w: KIT.supermarche[0] + 2, d: 20, where: 'front', t: 'parking' });
    // stade municipal au bord de la rocade
    city.stade = placeLot('hangar', 16, 10, 3, e => e.ring || e.axis, c => (district(c.x + c.nx * 30, c.z + c.nz * 30) === 'resid' ? 0 : -100) + (c.e.ring ? 20 : 0), { w: 52, d: 34, where: 'back', t: 'stade' });
    if (city.stade) city.stade.vestiaire = true;
    rects.forEach(R => blockCells(obbOf(R), 6));

    /* ---------- 5. Rues des zones d'activité, puis les entreprises ---------- */
    fillAll(['za', 'parc'], 40);
    indexRoads();
    const keys = Object.keys(ML.COMPANIES).filter(k => !ML.COMPANIES[k].plateau).sort((a, b) => (ML.COMPANIES[b].w * ML.COMPANIES[b].d) - (ML.COMPANIES[a].w * ML.COMPANIES[a].d));
    const wantOf = k => { const C = ML.COMPANIES[k]; return k === 'police' ? 'axe' : C.near ? 'near' : C.kind === 'client' ? 'parc' : 'za'; };
    const placed = [];
    function placeCompany(k, spot, culNode, e) {
      const C = ML.COMPANIES[k];
      addRect(spot); placed.push(spot); blockCells(obbOf(spot), 8);
      const a = spot.rot * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      const loc = (lx, lz) => ({ x: spot.x + lx * ca + lz * sa, z: spot.z - lx * sa + lz * ca });
      const street = culNode !== undefined ? E.find(x => x.a === culNode || x.b === culNode).name : e ? e.name : null;
      city.companies[k] = { cul: culNode, x: spot.x, z: spot.z, rot: spot.rot, hx: spot.hx, hz: spot.hz, dir: { x: sa, z: ca }, tan: { x: ca, z: -sa },
        dock: loc(-1, C.d / 2 + 1.9), npc: Object.assign(loc(5.5, C.d / 2 + 1.9), { yaw: a }), back: loc(r.range(-C.w / 3, C.w / 3), -C.d / 2 - 1.8), street };
      city.hides.push(city.companies[k].back);
    }
    /** emprise d'entreprise (quart de tour) face à la rue au point (px,pz), côté (nx,nz) */
    function compSpot(px, pz, nx, nz, w, d, gap, rw) {
      let best = 0, bd = -2;
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, dot = Math.sin(a) * -nx + Math.cos(a) * -nz; if (dot > bd) { bd = dot; best = q; } }
      if (bd < 0.88) return null;                                     // rue trop en biais : la façade ne serait pas face à la rue
      const hx = best % 2 ? d / 2 : w / 2, hz = best % 2 ? w / 2 : d / 2, off = rw + gap + Math.abs(nx) * hx + Math.abs(nz) * hz;
      const R = { x: px + nx * off, z: pz + nz * off, hx, hz, rot: best };
      return fitOBB(obbOf(R), 3, 2) ? R : null;
    }
    for (const k of keys) {
      const C = ML.COMPANIES[k], want = wantOf(k);
      const sep = (x, z) => placed.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), 200);
      const score = (x, z, e) => {
        const dk = district(x, z), d = Math.hypot(x - TC.x, z - TC.z);
        if (want === 'za' || want === 'parc') return (dk === want ? 100 : dk === 'centre' ? -200 : -60) + Math.min(sep(x, z), 60) * 0.4;
        if (want === 'axe') return (e && e.axis ? 80 : 0) - Math.abs(d - 100) * 0.5 + Math.min(sep(x, z), 50) * 0.3;
        // boulangerie et station : près du centre, sur une rue passante
        return (e && (e.axis || e.place) ? 40 : 0) - Math.abs(d - (k === 'station' ? 85 : 45)) * 0.8;
      };
      const cands = [];
      // fonds d'impasse
      N.forEach((n, i) => { if (i > 1 && deg(i) === 1 && n.cul) { const e = E.find(x => x.a === i || x.b === i), o = N[e.a === i ? e.b : e.a], L = e.len; cands.push({ cul: i, e, x: n.x, z: n.z, nx: (n.x - o.x) / L, nz: (n.z - o.z) / L, s: score(n.x, n.z, e) + 12 + r() * 12, gap: 3.5 }); } });
      for (const c of frontCands(e => !e.place || want === 'near', 6)) cands.push({ e: c.e, x: c.x, z: c.z, nx: c.nx, nz: c.nz, s: score(c.x + c.nx * 15, c.z + c.nz * 15, c.e) + r() * 12, gap: 4 });
      cands.sort((a, b) => b.s - a.s);
      let done = false;
      for (const c of cands) {
        const spot = compSpot(c.x, c.z, c.nx, c.nz, C.w, C.d, c.gap, c.cul !== undefined ? RW + 3.5 : (c.e.rw || RW));
        if (spot) { placeCompany(k, spot, c.cul, c.e); done = true; break; }
      }
      if (!done) {                                                  // pas de place : on trace une impasse exprès, puis on réessaie
        for (let t = 0; t < 30 && !done; t++) {
          let best = -1, bv = 0;
          for (let q = 0; q < GW * GH; q++) if (cellOK[q] && DK[cellD[q]] !== 'centre' && dfield[q] > bv) { bv = dfield[q]; best = q; }
          if (best < 0) break;
          const i = best % GW, kk = (best - i) / GW; if (!fillVoid({ x: gxc(i), z: gzc(kk) }, cellD[best] === 0 ? 'resid' : DK[cellD[best]])) { cellOK[best] = 0; continue; }
          indexRoads();
          const last = E[E.length - 1], n = N[last.b], o = N[last.a], L = last.len;
          const spot = compSpot(n.x, n.z, (n.x - o.x) / L, (n.z - o.z) / L, C.w, C.d, 3.5, RW + 3.5);
          if (spot && n.cul) { placeCompany(k, spot, last.b, last); done = true; }
        }
      }
      if (!done) console.warn('citygen : pas de place pour', k);
    }

    /* ---------- 6. Le reste des rues : centre, lotissements, puis partout ---------- */
    fillAll(['centre'], 60);
    fillAll(['resid'], 90);
    fillAll(['centre', 'resid', 'za', 'parc'], 60, 1.1);
    E.forEach(e => { e.len = len(e); e.core = true; e.name = city.streets[e.st].name; });
    N.forEach((n, i) => { if (i > 1 && deg(i) === 1) n.cul = true; });

    /* ---------- 6 bis. Hors du centre : autoroute, échangeur, montagne, campagne (citygen_outer.js) ---------- */
    CG.outer({ city, r: ML.U.rng(seed ^ 0x51ed270b), addNode, link, newStreet, RW });
    E.forEach(e => { e.len = len(e); e.name = city.streets[e.st].name; });
    for (let i = dg.length; i < N.length; i++) dg[i] = 0;
    dg.fill(0); E.forEach(e => { dg[e.a]++; dg[e.b]++; });
    indexRoads();

    /* ---------- 7. Bâtiments alignés le long des rues ---------- */
    // types et emprises (largeur sur rue × profondeur) selon le quartier
    const sizeOf = {
      commerce: () => [r.range(10, 14), r.range(11, 12.5)], mitoyennes: () => [r.range(11, 15), r.range(9.5, 10.5)], immeuble: () => [r.range(13, 16), r.range(12, 14)],
      maison: () => [r.range(9.5, 11), r.range(8.5, 9.5)], longere: () => [r.range(14, 17), 8], hangar: () => [r.range(18, 22), r.range(13, 15)], garage: () => [16, 12]
    };
    const pickType = (dk, d, e) => {
      const q = r();
      if (dk === 'centre') {
        if (d < 50 || e.axis || e.place) return q < 0.46 ? 'commerce' : q < 0.78 ? 'mitoyennes' : 'immeuble';
        return q < 0.5 ? 'mitoyennes' : q < 0.65 ? 'immeuble' : q < 0.78 ? 'commerce' : 'maison';
      }
      if (dk === 'za') return q < 0.5 ? 'hangar' : q < 0.8 ? 'garage' : q < 0.9 ? 'longere' : 'maison';
      if (dk === 'parc') return q < 0.4 ? 'immeuble' : q < 0.8 ? 'hangar' : 'garage';
      if (e.axis && d < 120 && q < 0.35) return q < 0.12 ? 'commerce' : q < 0.24 ? 'mitoyennes' : 'immeuble';
      return q < 0.76 ? 'maison' : q < 0.86 ? 'longere' : q < 0.95 ? 'mitoyennes' : 'immeuble';
    };
    const terraced = t => t === 'commerce' || t === 'mitoyennes' || t === 'immeuble';
    const lots = [];                                                // pour les jardins (haies, clôtures)
    function packSide(e, s) {
      const A = N[e.a], B = N[e.b], L = e.len, ux = (B.x - A.x) / L, uz = (B.z - A.z) / L, nx = -uz * s, nz = ux * s, rw = e.rw || RW;
      if (e.ring && (nx * (TC.x - A.x) + nz * (TC.z - A.z)) < 0) return;
      // dégagement au carrefour : seulement si une autre rue part de NOTRE côté
      const clr = n => {
        if (N[n].cul && deg(n) === 1) return RW + 3.5;
        let c = 0;
        for (const o of E) { if (o === e || (o.a !== n && o.b !== n)) continue; const m = N[o.a === n ? o.b : o.a], l = Math.hypot(m.x - N[n].x, m.z - N[n].z) || 1; if (((m.x - N[n].x) * nx + (m.z - N[n].z) * nz) / l > 0.15) c = Math.max(c, nodeR[n] + 1.9); }
        return c;
      };
      let t = clr(e.a) + r.range(0, 1); const tEnd = L - clr(e.b);
      let prev = null;
      while (t < tEnd - 8) {
        const mx = A.x + ux * (t + 6), mz = A.z + uz * (t + 6), dk = district(mx + nx * 12, mz + nz * 12), dc = Math.hypot(mx - TC.x, mz - TC.z);
        let type = pickType(dk, dc, e); if (e.ring && terraced(type) && type !== 'immeuble') type = 'maison';
        let [w, d] = sizeOf[type]();
        const tight = dk === 'centre' && terraced(type);
        const back = e.ring ? r.range(5, 8) : tight ? 2.05 : dk === 'centre' ? r.range(2.5, 4) : dk === 'resid' ? (terraced(type) ? 3 : r.range(4, 6.5)) : r.range(4, 6);
        let ok = null;
        for (const k of [1, 0.85, 0.72]) for (const dd of [d, Math.max(8, d - 2.5)]) {
          const ww = Math.max(type === 'garage' ? 15 : 8.5, w * k); if (ok || t + ww > tEnd + 1 || (dd !== d && type === 'garage')) continue;
          const c = t + ww / 2, o = facing(A.x + ux * c, A.z + uz * c, nx, nz, rw, back, ww, dd);
          if (fitOBB(o, tight ? -0.05 : 1.6, tight ? 0.2 : 1)) { ok = { o, ww, d: dd }; }
        }
        if (!ok && type !== 'maison' && dk !== 'za' && dk !== 'parc') {            // petite maison à la place
          type = 'maison'; [w, d] = sizeOf.maison();
          const c = t + w / 2, o = facing(A.x + ux * c, A.z + uz * c, nx, nz, rw, dk === 'centre' ? 3 : 4.5, w, d);
          if (t + w <= tEnd + 1 && fitOBB(o, 1.6, 1)) ok = { o, ww: w, d };
        }
        if (!ok) { t += 1.5; prev = null; continue; }
        if (ok.d) d = ok.d;
        const f = addFiller(ok.o, type, ok.ww, d);
        const lot = { f, e, s, t0: t, t1: t + ok.ww, back, dk, prev };
        if (prev) prev.next = lot; lots.push(lot); prev = lot;
        if (r() < 0.12) city.perches.push({ x: f.x, y: type === 'immeuble' ? 14 : 9, z: f.z });
        t += ok.ww + (tight ? 0 : dk === 'centre' ? r.range(1, 3) : dk === 'resid' ? r.range(3.5, 7) : r.range(4, 9));
      }
    }
    // maisons au fond des impasses (face au rond de retournement)
    function packCul(i) {
      const e = E.find(x => x.a === i || x.b === i); if (!e || !e.core) return;
      const n = N[i], o = N[e.a === i ? e.b : e.a], L = e.len, ux = (n.x - o.x) / L, uz = (n.z - o.z) / L, dk = district(n.x + ux * 12, n.z + uz * 12);
      for (const a of [0, 1.05, -1.05]) {
        const nx = ux * Math.cos(a) - uz * Math.sin(a), nz = ux * Math.sin(a) + uz * Math.cos(a);
        const type = dk === 'za' ? 'hangar' : dk === 'parc' ? 'immeuble' : dk === 'centre' ? 'mitoyennes' : 'maison', [w, d] = sizeOf[type]();
        const ob = facing(n.x, n.z, nx, nz, RW + 3.5, dk === 'resid' ? 4 : 3, w, d);
        if (fitOBB(ob, 1.6, 1)) addFiller(ob, type, w, d);
      }
    }
    const coreE = E.filter((e, i) => i > 0 && e.core);
    const pri = e => (e.place ? 0 : district((N[e.a].x + N[e.b].x) / 2, (N[e.a].z + N[e.b].z) / 2) === 'centre' ? (e.axis ? 1 : 2) : e.ring ? 5 : e.axis ? 3 : 4);
    const order = shuffle(coreE.slice()).sort((a, b) => pri(a) - pri(b));
    N.forEach((n, i) => { if (n.cul && i > 1 && E.some(e => e.core && (e.a === i || e.b === i))) packCul(i); });
    for (const e of order) { const s0 = r() < 0.5 ? 1 : -1; packSide(e, s0); packSide(e, -s0); }
    // deuxième passe : on bouche les trous qui restent avec des maisons
    for (const e of order) for (const s of [1, -1]) {
      if (e.ring) continue;
      const A = N[e.a], B = N[e.b], L = e.len, ux = (B.x - A.x) / L, uz = (B.z - A.z) / L, nx = -uz * s, nz = ux * s, rw = e.rw || RW;
      for (let t = nodeR[e.a] + 2; t < L - nodeR[e.b] - 10; t += 3) {
        const [w, d] = sizeOf.maison(), dk = district(A.x + ux * t + nx * 12, A.z + uz * t + nz * 12);
        if (dk === 'za' || dk === 'parc') continue;
        const o = facing(A.x + ux * (t + w / 2), A.z + uz * (t + w / 2), nx, nz, rw, dk === 'centre' ? 2.6 : 4.5, w, d);
        if (fitOBB(o, 1.6, 1)) { const f = addFiller(o, 'maison', w, d); lots.push({ f, e, s, t0: t, t1: t + w, back: dk === 'centre' ? 2.6 : 4.5, dk }); t += w + 2; }
      }
    }

    /* ---------- 8. Décor : place, jardins, parkings, voitures ---------- */
    const freeAt = (x, z, m) => !rgrid.any(x - m - 1, z - m - 1, x + m + 1, z + m + 1, R => obbDist(obbOf(R), x, z) < m) && !rgE.any(x - 12, z - 12, x + 12, z + 12, e => segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < (e.rw || RW) + m + 0.5);
    // la place du marché : pavés, fontaine ou monument aux morts, étals, tilleuls, bancs, quelques places de parking
    {
      const iw = PW - PRW - 2.1, ih = PH - PRW - 2.1;
      const pl = { t: 'place', x: TC.x, z: TC.z, ry: 0, hw: iw, hd: ih, flat: true, m: r() < 0.55 ? 'fontaine' : 'monument' };
      deco.push(pl);
      deco.push({ t: pl.m, x: TC.x, z: TC.z, ry: Math.PI });
      city.perches.push({ x: TC.x, y: pl.m === 'fontaine' ? 3.2 : 5.6, z: TC.z });
      const side = r() < 0.5 ? 1 : -1;                               // étals d'un côté, parking de l'autre
      for (let i = 0; i < 4; i++) deco.push({ t: 'etal', x: TC.x - iw + 5 + i * (2 * iw - 10) / 3, z: TC.z + side * (ih - 3.2), ry: side > 0 ? Math.PI : 0, c: Math.floor(r() * 4) });
      for (let i = 0; i < 5; i++) {
        const x = TC.x - iw + 4 + i * (2 * iw - 8) / 4, z = TC.z - side * (ih - 2.6);
        if (i % 2 === 0) city.trees.push({ x, z, k: 0.95, c: 1, place: true }); else deco.push({ t: 'banc', x, z, ry: side > 0 ? 0 : Math.PI });
      }
      for (const sx of [-1, 1]) { city.trees.push({ x: TC.x + sx * (iw - 2.5), z: TC.z, k: 1.05, c: 0, place: true }); deco.push({ t: 'banc', x: TC.x + sx * (iw - 5), z: TC.z, ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 }); }
      deco.push({ t: 'poubelle', x: TC.x + 6, z: TC.z - side * (ih - 1) }, { t: 'poubelle', x: TC.x - 7, z: TC.z + side * (ih - 1.2) });
      // parvis de l'église
      if (city.church) { const c = city.church; deco.push({ t: 'calvaire', x: c.x + 6.5, z: c.z - c.d / 2 - 1.3, ry: Math.PI }); }
    }
    // aires de jeux au milieu des boucles de lotissement (si la place est libre)
    for (const L of city.lotis) if (freeAt(L.x, L.z, 5.5)) {
      const ry = r() * Math.PI * 2; deco.push({ t: 'jeux', x: L.x, z: L.z, ry, hw: 4, hd: 3.5 });
      deco.push({ t: 'banc', x: L.x + Math.sin(ry) * 5, z: L.z + Math.cos(ry) * 5, ry: ry + Math.PI });
    }
    // parking du supermarché : places peintes et voitures
    for (const d of deco.filter(x => x.t === 'parking')) {
      const ca = Math.cos(d.ry), sa = Math.sin(d.ry), n = Math.floor((d.hw * 2 - 2) / 2.8);
      for (const row of [-1, 1]) for (let i = 0; i < n; i++) {
        if (r() < 0.45) continue;
        const lx = -d.hw + 1 + 1.4 + i * 2.8, lz = row * (d.hd - 2.8);
        city.parked.push({ x: d.x + lx * ca + lz * sa, z: d.z - lx * sa + lz * ca, ry: d.ry + (row > 0 ? 0 : Math.PI), model: 'city_car_hatchback' });
      }
    }
    // jardins : haies, clôtures blanches ou murets de granit devant et entre les maisons ; voiture dans l'allée
    for (const L of lots) {
      const f = L.f; if (f.type !== 'maison' && f.type !== 'longere') continue;
      if (L.dk === 'za' || L.dk === 'parc') continue;
      const e = L.e, A = N[e.a], B = N[e.b], len0 = e.len, ux = (B.x - A.x) / len0, uz = (B.z - A.z) / len0, nx = -uz * L.s, nz = ux * L.s, rw = e.rw || RW;
      const kind = L.dk === 'centre' ? 'muret' : ['haie', 'haie', 'haie', 'cloture', 'muret'][Math.floor(r() * 5)];
      const a = L.prev && L.prev.t1 > L.t0 - 9 ? (L.prev.t1 + L.t0) / 2 : L.t0 - 1.2, b = L.next && L.next.t0 < L.t1 + 9 ? (L.t1 + L.next.t0) / 2 : L.t1 + 1.2;
      const fo = rw + 2.3, bo = rw + L.back + f.d + 3.5, P = (t, o) => ({ x: A.x + ux * t + nx * o, z: A.z + uz * t + nz * o });
      const okSeg = (p, q) => { for (let k = 0; k <= 4; k++) { const x = p.x + (q.x - p.x) * k / 4, z = p.z + (q.z - p.z) * k / 4; if (rgrid.any(x - 1, z - 1, x + 1, z + 1, R => R !== f && obbDist(obbOf(R), x, z) < 0.4) || rgE.any(x - 10, z - 10, x + 10, z + 10, ee => segDist(x, z, N[ee.a].x, N[ee.a].z, N[ee.b].x, N[ee.b].z) < (ee.rw || RW) + 1.9)) return false; } return true; };
      const gate = (L.t0 + L.t1) / 2 + (r() - 0.5) * 2;
      const segs = [[P(a, fo), P(gate - 1.6, fo)], [P(gate + 1.6, fo), P(b, fo)], [P(a, fo), P(a, bo)]];
      if (!L.next || L.next.t0 >= L.t1 + 9) segs.push([P(b, fo), P(b, bo)]);
      if (kind === 'haie') segs.push([P(a, bo), P(b, bo)]);
      for (const [p, q] of segs) if (Math.hypot(q.x - p.x, q.z - p.z) > 1 && okSeg(p, q)) deco.push({ t: kind, x1: p.x, z1: p.z, x2: q.x, z2: q.z });
      // voiture dans l'allée (entre deux maisons)
      if (L.next && L.next.t0 - L.t1 > 4.2 && r() < 0.55) {
        const t = (L.t1 + L.next.t0) / 2, p = P(t, rw + 2.6 + 2.4);
        if (freeAt(p.x, p.z, 1.6)) city.parked.push({ x: p.x, z: p.z, ry: Math.atan2(-nx, -nz) + (r() < 0.5 ? Math.PI : 0), model: 'city_car_sedan' });
      }
    }
    // zones d'activité : voitures sur le parking devant les entreprises
    for (const k in city.companies) {
      const c = city.companies[k], C = ML.COMPANIES[k]; if (k === 'police' || k === 'station') continue;
      for (let i = 0; i < 3; i++) {
        const lx = C.w / 2 - 2 - i * 2.7, lz = C.d / 2 + 2.8, a = c.rot * Math.PI / 2, x = c.x + lx * Math.cos(a) + lz * Math.sin(a), z = c.z - lx * Math.sin(a) + lz * Math.cos(a);
        if (r() < 0.6 && freeAt(x, z, 1.3)) city.parked.push({ x, z, ry: a + Math.PI, model: 'city_car_stationwagon' });
      }
    }

    /* ---------- 9. Mobilier urbain ---------- */
    E.forEach((e, ei) => {
      if (!e.core) return;
      const A = N[e.a], B = N[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, rw = e.rw || RW, step = e.alley ? 1e9 : e.place ? 16 : 24;
      for (let t = 10, s = 1; t < e.len - 10; t += step, s = -s) {
        const x = A.x + dx * t - dz * s * (rw + 1.3), z = A.z + dz * t + dx * s * (rw + 1.3);
        if (freeAt(x, z, 0.6)) city.lamps.push({ x, z, ry: Math.atan2(-dx * s, -dz * s), nx: dz * s, nz: -dx * s });
      }
    });
    // arrêts de bus : Grande Rue, près de l'école, près du supermarché
    {
      const spots = [];
      const gr = E.filter(e => e.name === 'Grande Rue').sort((a, b) => b.len - a.len)[0]; if (gr) spots.push([gr, 0.5]);
      for (const f of [city.school, city.market]) if (f) { let be = null, bd = 1e9; for (const e of E) { if (!e.core) continue; const d = segDist(f.x, f.z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z); if (d < bd) { bd = d; be = e; } } if (be) spots.push([be, 0.5]); }
      for (const [e, t0] of spots) {
        const A = N[e.a], B = N[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, rw = e.rw || RW;
        for (const tt of [t0, 0.3, 0.7]) for (const s of [1, -1]) {
          const x = A.x + dx * e.len * tt - dz * s * (rw + 1.0), z = A.z + dz * e.len * tt + dx * s * (rw + 1.0);
          if (!rgrid.any(x - 3, z - 3, x + 3, z + 3, R => obbDist(obbOf(R), x, z) < 1.2) && !city.lamps.some(l => Math.hypot(l.x - x, l.z - z) < 3)) { deco.push({ t: 'abribus', x, z, ry: Math.atan2(dz * s, -dx * s) + Math.PI }); e.bus = true; break; }
          if (e.bus) break;
        }
      }
    }
    // poubelles et bancs devant quelques commerces
    for (const f of city.fillers) if (f.type === 'commerce' && r() < 0.5) {
      const o = f.obb, lx = (r() < 0.5 ? -1 : 1) * (f.w / 2 - 0.8), lz = f.d / 2 + 1.0, x = o.x + lx * o.ax + lz * o.bx, z = o.z + lx * o.az + lz * o.bz;
      if (freeAt(x, z, 0.5)) deco.push({ t: r() < 0.6 ? 'poubelle' : 'banc', x, z, ry: o.ry });
    }
    // voitures garées le long des rues du centre (côté trottoir, sur un renfoncement)
    // radars : 2 sur les plus longues rues de ville, 1 sur la rocade
    const byLen = E.map((e, i) => [e.len, i]).filter(x => x[1] > 0 && E[x[1]].core && !E[x[1]].place).sort((a, b) => b[0] - a[0]);
    byLen.filter(x => !E[x[1]].ring).slice(0, 2).concat(byLen.filter(x => E[x[1]].ring).slice(0, 1)).forEach(([L, i]) => {
      const e = E[i], A = N[e.a], B = N[e.b], dx = (B.x - A.x) / L, dz = (B.z - A.z) / L, rw = e.rw || RW;
      for (const k of [0.5, 0.35, 0.65]) {
        const x = A.x + (B.x - A.x) * k - dz * (rw + 1.6), z = A.z + (B.z - A.z) * k + dx * (rw + 1.6);
        if (rgrid.any(x - 2, z - 2, x + 2, z + 2, R => obbDist(obbOf(R), x, z) < 0.8)) continue;
        city.radars.push({ x, z, edge: i, ring: !!e.ring }); break;
      }
    });
    // feux : d'abord aux carrefours des axes
    const lightCand = N.map((n, i) => i).filter(i => deg(i) >= 3 && !N[i].cul && E.some(e => e.core && (e.a === i || e.b === i)));
    lightCand.sort((a, b) => (E.filter(e => e.axis && (e.a === b || e.b === b)).length - E.filter(e => e.axis && (e.a === a || e.b === a)).length));
    for (const i of lightCand) { if (city.lights.length >= 8) break; const x = N[i].x + RW + 1.2, z = N[i].z + RW + 1.2; if (!rgrid.any(x - 1, z - 1, x + 1, z + 1, R => obbDist(obbOf(R), x, z) < 0.6)) city.lights.push(i); }

    /* ---------- 10. Nature, cachettes ---------- */
    const nearRoad = (x, z, m) => rgE.any(x - m - 8, z - m - 8, x + m + 8, z + m + 8, e => segDist(x, z, N[e.a].x, N[e.a].z, N[e.b].x, N[e.b].z) < (e.rw || RW) + m);
    const nearDeco = (x, z, m) => deco.some(d => d.x1 !== undefined ? segDist(x, z, d.x1, d.z1, d.x2, d.z2) < m : d.hw ? obbDist(mkOBB(d.x, d.z, d.ry || 0, d.hw, d.hd), x, z) < m : Math.hypot(d.x - x, d.z - z) < m + 1.5);
    const free = (x, z, m) => !inAtelier(x, z, 4) && !nearRoad(x, z, m) && !rgrid.any(x - m - 1, z - m - 1, x + m + 1, z + m + 1, R => obbDist(obbOf(R), x, z) < m) && !nearDeco(x, z, m * 0.7);
    // alignements d'arbres le long des axes (le « mail »)
    E.forEach(e => {
      if (!e.axis || !e.core) return;
      const A = N[e.a], B = N[e.b], dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, rw = e.rw || RW;
      for (let t = 9; t < e.len - 9; t += 11) for (const s of [-1, 1]) {
        const x = A.x + dx * t - dz * s * (rw + 3.4), z = A.z + dz * t + dx * s * (rw + 3.4);
        if (!rgrid.any(x - 4, z - 4, x + 4, z + 4, R => obbDist(obbOf(R), x, z) < 2) && !nearRoad(x, z, 2.6) && !city.lamps.some(l => Math.hypot(l.x - x, l.z - z) < 3) && !nearDeco(x, z, 1.5)) city.trees.push({ x, z, k: 0.9, c: 1 });
      }
    });
    for (let t = 0; t < 6000 && city.trees.length < 300; t++) { const x = r.range(M.minX + 4, M.maxX - 4), z = r.range(M.minZ + 4, M.maxZ - 4); if (free(x, z, 3)) city.trees.push({ x, z, k: r.range(0.8, 1.4), c: Math.floor(r() * 4) }); }
    for (let t = 0; t < 4000 && city.bushes.length < 220; t++) { const x = r.range(M.minX + 4, M.maxX - 4), z = r.range(M.minZ + 4, M.maxZ - 4); if (free(x, z, 1.5)) city.bushes.push({ x, z, s: r.range(3.5, 6.5), ry: r() * 6 }); }
    for (let t = 0; t < 800 && city.hides.length < 22; t++) {
      const tr = r.pick(city.trees); if (!tr) break; const x = tr.x + r.range(-2.5, 2.5), z = tr.z + r.range(-2.5, 2.5);
      if (free(x, z, 1) && Math.hypot(x, z) > 60) city.hides.push({ x, z });
    }
    for (let i = 0; i < 4; i++) { const l = r.pick(city.lamps); if (l) city.perches.push({ x: l.x, y: 5.8, z: l.z }); }
    // étiquettes de rues pour la carte : au milieu du plus long tronçon de chaque rue
    city.labels = city.streets.map((s, si) => {
      const es = E.filter(e => e.st === si); if (!es.length) return null;
      const e = es.reduce((m, x) => (x.len > m.len ? x : m)), A = N[e.a], B = N[e.b];
      return { name: s.name, x: (A.x + B.x) / 2, z: (A.z + B.z) / 2, a: Math.atan2(B.z - A.z, B.x - A.x) };
    }).filter(Boolean);
    city.RW = RW;
    E.forEach(e => delete e._q); rects.forEach(R => delete R._q);

    /* ---------- 11. Terrassements : plateformes des bâtiments, routes, puis nature ---------- */
    const padY = (x, z) => { let s = 0; for (const [dx, dz] of [[0, 0], [5, 5], [-5, 5], [5, -5], [-5, -5]]) s += TR.natural(x + dx, z + dz); return s / 5; };
    for (const k in city.companies) { const c = city.companies[k]; c.y = c.cul !== undefined && N[c.cul] ? N[c.cul].y : padY(c.x, c.z); TR.flattenRect(c.x, c.z, c.hx + 3, c.hz + 3, c.y, 10); }
    for (const f of city.fillers) { f.y = padY(f.x, f.z); TR.flattenRect(f.x, f.z, f.hx + 1.5, f.hz + 1.5, f.y, 8); }
    for (const d of deco) if (d.flat) { const o = mkOBB(d.x, d.z, d.ry || 0, d.hw, d.hd); d.y = padY(d.x, d.z); TR.flattenRect(d.x, d.z, o.hx + 1, o.hz + 1, d.y, 8); }
    for (const f of city.rural) { f.y = f.y !== undefined ? (f.y + padY(f.x, f.z)) / 2 : padY(f.x, f.z); TR.flattenRect(f.x, f.z, f.hx + 2, f.hz + 2, f.y, 10); }
    if (city.sites && city.sites.rondpoint) TR.flattenDisc(city.sites.rondpoint.x, city.sites.rondpoint.z, 16, city.sites.rondpoint.y, 10);
    TR.flattenRect(0, -2, 44, 38, 0, 18);                                // atelier et sa cour : altitude 0
    TR.imprintRoads(city);
    TR.flattenRect(0, -2, 40, 36, 0, 4);
    CG.nature(city, ML.U.rng(seed ^ 0x7f4a7c15));
    TR.finalize();
    city.river = TR.river;
    return city;
  };
})();
