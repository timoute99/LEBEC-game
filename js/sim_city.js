/* =====================================================================
   sim_city.js — VILLE (hôte) : véhicules de l'atelier (benne, essence,
   caisses qui tombent, transpalette), circulation (feux, bouchons),
   radars, gendarmerie (poursuite), station essence, mode COURSE.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, C = ML.CFG, IT = ML.Items;
  let S, rng, city, tr, pol, peds;
  const mod = {};

  mod.init = cfg => {
    S = K.S; rng = K.rng; city = ML.World.city;
    const up = S.up, sp = ML.LOC.carSpawn, capBig = up.grande_benne ? 6 : C.CAR.cap;
    const car = (kind, i, extra) => Object.assign({ x: sp[i].x, z: sp[i].z, h: sp[i].h, s: 0, dr: null, pass: [], bed: [], kind, name: ML.VEHICLES[kind].name, cap: kind === 'tp' ? C.TP.cap : kind === 'camion' ? C.CAMION.cap : kind === 'fenwick' ? 0 : capBig, fuel: 100, color: ML.VEHICLES[kind].color, frozen: 0, load: null }, extra || {});
    if (S.mode === 'course') {
      const n = Math.min(5, Math.max(2, S.n));
      for (let i = 0; i < n; i++) S.cars.push(car('megane', i, { name: 'Mégane n°' + (i + 1), color: ML.RACE_COLORS[i], fuel: 100 }));
    } else {
      S.cars.push(car('megane', 0, { fuel: Math.round(35 + rng() * 55) }), car('kangoo', 1, { fuel: Math.round(30 + rng() * 60) }));
      if (up.ducato) S.cars.push(car('ducato', 2, { fuel: Math.round(50 + rng() * 50) }));
      const t = ML.LOC.tpSpawn; S.cars.push(Object.assign(car('tp', 0), { x: t.x, z: t.z, h: t.h }));
      const f = ML.LOC.fenSpawn, cm = ML.LOC.camSpawn;
      S.cars.push(Object.assign(car('fenwick', 0), { x: f.x, z: f.z, h: f.h }), Object.assign(car('camion', 0), { x: cm.x, z: cm.z, h: cm.h, fuel: Math.round(50 + rng() * 50) }));
    }
    // passants sur les trottoirs
    peds = K.peds = [];
    const sideE = city.edges.map((e, i) => i).filter(i => i > 0 && !city.edges[i].ring && city.edges[i].len > 20);
    for (let i = 0; i < 18 && sideE.length; i++) { const e = rng.pick(sideE); peds.push({ e, d: rng() * city.edges[e].len, dir: rng() < 0.5 ? 1 : -1, side: rng() < 0.5 ? 1 : -1, sp: 1 + rng() * 0.7, down: 0, look: i }); }
    // circulation : ~25 véhicules répartis sur tout le réseau
    tr = K.tr = [];
    netInit();
    for (let i = 0; i < 12; i++) spawn('city', null, Math.floor(rng() * 4));
    for (let i = 0; i < 6; i++) spawn('hw', null, Math.floor(rng() * 4));
    for (let i = 0; i < 3; i++) spawn('dep', null, Math.floor(rng() * 4));
    for (let i = 0; i < 2; i++) spawn('mtn', null, Math.floor(rng() * 4));
    spawn('cor', 'tracteur', 4); spawn('cor', 'campingcar', 5);   // la corniche, bouchée par un tracteur et un camping-car
    pol = K.pol = null; K.radarCd = {}; K.revDone = {}; K.hitCd = {};
    if (S.mode === 'course') K.race = { round: 0, total: 5, next: 3, pts: {}, prev: null };
  };

  /* ---------- Circulation ----------
     Chaque voiture suit le graphe des routes sur SA voie (à droite) et traverse les carrefours le long
     d'une courbe de Bézier (plus de téléportation). État d'une voiture `t` :
       e, dir (±1), d (m depuis le début de l'arête dans le sens de marche), v (m/s), lo (décalage latéral courant),
       lane (0 = voie de droite, 1 = voie de gauche : autoroute seulement), q (2 prochaines arêtes {e,dir}),
       turn (courbe en cours : {n, from, fdir, to, tdir, P, tab, len, s, vt}), home (famille de routes préférée),
       spc ('tracteur' | 'campingcar' | null), x/z/h (pose calculée), wait (attente au cédez-le-passage).
     Règles : vitesse selon la route (centre 9-12 m/s, rocade 14-18, autoroute 19-25, montagne/corniche 6-9,
     giratoire 7), feux (ML.World.lightGreen, axe 0 = route plutôt nord-sud), cédez-le-passage (route principale
     d'abord, sinon priorité à droite ; on attend si quelqu'un traverse le carrefour), giratoires à sens unique
     (île centrale à GAUCHE = sens anti-horaire vu du ciel), files d'attente sans chevauchement, ralentissement
     dans les virages, coup de klaxon avant les épingles, dépassement sur l'autoroute (2 voies par sens). */
  const SPD = { core: [9, 12], ring: [14, 18], hw: [19, 25], mtn: [6.5, 9], cor: [6, 8], gir: [7, 7], dep: [12, 15] };
  const GRP = { core: 'city', ring: 'city', gir: 'city', hw: 'hw', dep: 'dep', mtn: 'mtn', cor: 'cor' };
  const EXT = { civ: [2.2, 2.2], tracteur: [1.9, 6.6], campingcar: [3.3, 3.3] };   // [avant, arrière] (m depuis le centre)
  let NB = [];                                                                       // NB[nœud] = arêtes praticables
  const clsOf = e => (e.hw ? 'hw' : e.corniche ? 'cor' : e.mtn ? 'mtn' : e.giratoire ? 'gir' : e.ring ? 'ring' : e.dep ? 'dep' : 'core');
  const rankOf = e => (e.giratoire ? 5 : e.hw ? 4 : e.ring ? 3 : (e.dep || e.mtn) ? 2 : 1);
  function netInit() {
    const N = city.nodes, E = city.edges, ctr = {};
    NB = N.map(() => []);
    E.forEach((e, i) => {
      e._cls = clsOf(e); e._rank = rankOf(e);
      // pas dans la cour de l'atelier (accès n°0, bas de la corniche avant le pont)
      e._ok = i > 0 && e.a !== 0 && e.b !== 0 && e.len > 0.5 && !(e.corniche && N[e.a].z > -45 && N[e.b].z > -45);
      if (e._ok) { NB[e.a].push(i); NB[e.b].push(i); }
      if (e.giratoire) { const c = ctr[e.st] || (ctr[e.st] = { x: 0, z: 0, n: 0 }); c.x += N[e.a].x + N[e.b].x; c.z += N[e.a].z + N[e.b].z; c.n += 2; }
    });
    // giratoire : le seul sens permis garde l'île à gauche (gauche de u = (uz, −ux))
    E.forEach(e => {
      if (!e.giratoire) return;
      const c = ctr[e.st], A = N[e.a], B = N[e.b], ux = B.x - A.x, uz = B.z - A.z;
      e._gdir = (c.x / c.n - (A.x + B.x) / 2) * uz - (c.z / c.n - (A.z + B.z) / 2) * ux > 0 ? 1 : -1;
    });
  }
  const ends = (e, dir) => { const E = city.edges[e], N = city.nodes; return dir > 0 ? [N[E.a], N[E.b]] : [N[E.b], N[E.a]]; };
  const endNode = (e, dir) => (dir > 0 ? city.edges[e].b : city.edges[e].a);
  const unit = (e, dir) => { const [A, B] = ends(e, dir), L = city.edges[e].len; return { x: (B.x - A.x) / L, z: (B.z - A.z) / L }; };
  /** Décalage latéral (vers la droite) d'une voie */
  const laneOff = (e, lane) => { const E = city.edges[e], rw = E.rw || city.RW; return E.hw ? (lane ? rw * 0.27 : rw * 0.73) : Math.min(2.4, rw / 2); };
  /** Point de la voie à la distance d sur l'arête (droite de u = (−uz, ux)) */
  function edgePt(e, dir, d, off) {
    const [A] = ends(e, dir), u = unit(e, dir);
    return { x: A.x + u.x * d - u.z * off, z: A.z + u.z * d + u.x * off, ux: u.x, uz: u.z };
  }
  /** Distance avant le nœud où commence la courbe (même valeur des deux côtés du virage) */
  function cutAt(n, ea, eb) {
    const E = city.edges, A = E[ea], B = E[eb], nd = city.nodes[n];
    let c = NB[n].length >= 3 || city.lights.includes(n) ? Math.max(5.5, (nd.rw || city.RW) + 1.2) : 3.2;
    if (A.giratoire || B.giratoire) c = Math.min(c, 4.2);
    return Math.min(c, A.len * 0.42, B.len * 0.42);
  }
  const angOf = (a, b) => { const u = unit(a.e, a.dir), w = unit(b.e, b.dir); return Math.acos(U.clamp(u.x * w.x + u.z * w.z, -1, 1)); };
  /** Vitesse de passage d'un virage d'angle th (rad) dont la courbe démarre à cut m du nœud */
  const turnV = (th, cut) => (th < 0.12 ? 99 : Math.max(2.6, Math.sqrt(3.2 * Math.max(1.6, cut / Math.tan(Math.min(th, 3.0) / 2)))));
  const brk = (vt, dist) => Math.sqrt(vt * vt + 2 * 2.4 * Math.max(0, dist));
  /** Choix de la prochaine arête au bout de (e, dir) */
  function pickNext(t, e, dir) {
    const E = city.edges, n = endNode(e, dir), u = unit(e, dir);
    const opts = NB[n].filter(k => k !== e).map(k => ({ e: k, dir: E[k].a === n ? 1 : -1 }))
      .filter(o => !E[o.e].giratoire || o.dir === E[o.e]._gdir)                     // giratoire : sens unique
      .filter(o => !t.spc || E[o.e]._cls === 'cor');                                // tracteur & camping-car : la corniche, rien que la corniche
    if (!opts.length) return { e, dir: -dir };                                       // impasse : demi-tour
    if (!t.spc && GRP[E[e]._cls] === t.home && !opts.some(o => GRP[E[o.e]._cls] === t.home) && rng() < 0.85) return { e, dir: -dir };   // on reste dans « son » coin : demi-tour
    const w = opts.map(o => {
      const v = unit(o.e, o.dir), cos = u.x * v.x + u.z * v.z, k = E[o.e];
      let x = 1 + Math.max(0, cos);
      if (GRP[k._cls] === t.home) x *= t.home === 'hw' ? 14 : 9;
      if (NB[endNode(o.e, o.dir)].length <= 1) x *= 0.25;
      if (cos < -0.7) x *= 0.1;
      return x;
    });
    let r = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
    return opts[opts.length - 1];
  }
  function fillQ(t) { while (t.q.length < 2) { const l = t.q.length ? t.q[t.q.length - 1] : { e: t.e, dir: t.dir }; t.q.push(pickNext(t, l.e, l.dir)); } }
  const cruise = t => { const r = SPD[city.edges[t.e]._cls] || SPD.core; const v = r[0] + (r[1] - r[0]) * t.sp; return t.spc === 'tracteur' ? 4.2 : t.spc === 'campingcar' ? Math.min(v, 6.3) : v; };
  /* Courbe de Bézier cubique, paramétrée à l'abscisse curviligne (table) */
  const bez = (P, s) => { const a = 1 - s; return { x: a * a * a * P[0].x + 3 * a * a * s * P[1].x + 3 * a * s * s * P[2].x + s * s * s * P[3].x, z: a * a * a * P[0].z + 3 * a * a * s * P[1].z + 3 * a * s * s * P[2].z + s * s * s * P[3].z }; };
  const bezD = (P, s) => { const a = 1 - s; return { x: 3 * a * a * (P[1].x - P[0].x) + 6 * a * s * (P[2].x - P[1].x) + 3 * s * s * (P[3].x - P[2].x), z: 3 * a * a * (P[1].z - P[0].z) + 6 * a * s * (P[2].z - P[1].z) + 3 * s * s * (P[3].z - P[2].z) }; };
  function startTurn(t, cut, over) {
    const nx = t.q.shift(), n = endNode(t.e, t.dir); fillQ(t);
    const p0 = edgePt(t.e, t.dir, city.edges[t.e].len - cut, t.lo), lo2 = laneOff(nx.e, city.edges[nx.e].hw ? t.lane : 0), p3 = edgePt(nx.e, nx.dir, cut, lo2);
    const cos = U.clamp(p0.ux * p3.ux + p0.uz * p3.uz, -1, 1), th = Math.max(0.01, Math.acos(cos)), chord = Math.hypot(p3.x - p0.x, p3.z - p0.z);
    const k = chord * (4 / 3) * Math.tan(th / 4) / (2 * Math.sin(th / 2));             // arc de cercle ≈ Bézier
    const P = [p0, { x: p0.x + p0.ux * k, z: p0.z + p0.uz * k }, { x: p3.x - p3.ux * k, z: p3.z - p3.uz * k }, p3];
    const tab = [0]; let prev = P[0];
    for (let i = 1; i <= 12; i++) { const q = bez(P, i / 12); tab.push(tab[i - 1] + Math.hypot(q.x - prev.x, q.z - prev.z)); prev = q; }
    t.turn = { n, from: t.e, fdir: t.dir, to: nx.e, tdir: nx.dir, P, tab, len: tab[12], s: over, vt: turnV(th, cut) };
    if (!city.edges[nx.e].hw) t.lane = 0;
    t.e = nx.e; t.dir = nx.dir; t.lo = lo2; t.dlo = 0; t.d = cut; t.wait = 0; t.commit = false;
  }
  /** Pose (x, z, h) d'une voiture */
  function place(t) {
    if (t.turn) {
      const T = t.turn, s = U.clamp(T.s, 0, T.len); let i = 1; while (i < 12 && T.tab[i] < s) i++;
      const f = ((i - 1) + (s - T.tab[i - 1]) / Math.max(1e-6, T.tab[i] - T.tab[i - 1])) / 12, p = bez(T.P, f), dv = bezD(T.P, f);
      t.x = p.x; t.z = p.z; t.h = Math.atan2(dv.x, dv.z);
    } else {
      const p = edgePt(t.e, t.dir, t.d, t.lo); t.x = p.x; t.z = p.z;
      t.h = Math.atan2(p.ux, p.uz) - Math.atan2(t.dlo || 0, Math.max(2, t.v));      // changement de voie : le nez suit
    }
  }
  function trPos(t) { return { x: t.x, z: t.z, h: t.h, ux: Math.sin(t.h), uz: Math.cos(t.h) }; }
  K.trPos = trPos;
  function spawn(cls, spc, m) {
    const E = city.edges, cand = E.map((e, i) => i).filter(i => E[i]._ok && (GRP[E[i]._cls] === cls || E[i]._cls === cls) && E[i].len > 8);
    if (!cand.length) { if (cls !== 'city') spawn('city', spc, spc ? 0 : m); return; }
    for (let k = 0; k < 40; k++) {
      const e = rng.pick(cand), dir = E[e].giratoire ? E[e]._gdir : rng() < 0.5 ? 1 : -1;
      const t = { e, dir, d: 0, v: 0, sp: rng(), m, spc, home: spc ? 'cor' : GRP[E[e]._cls] || 'city', lane: 0, lo: laneOff(e, 0), q: [], turn: null, honk: rng() * 3, wait: 0, hk: 0, stuck: 0, ghost: 0 };
      fillQ(t);
      const dout = E[e].len - cutAt(endNode(e, dir), e, t.q[0].e);
      t.d = Math.min(dout - 0.5, Math.max(4, E[e].len * (0.25 + rng() * 0.5)));
      place(t);
      if (tr.some(o => Math.hypot(o.x - t.x, o.z - t.z) < 16)) continue;
      t.v = cruise(t) * 0.6; tr.push(t); return;
    }
  }
  const lightGreen = (n, ax) => (ML.World.lightGreen ? ML.World.lightGreen(n, ax, S.rt) : ((Math.floor((S.rt + n * 3.7) / 9) % 2) === 0) === (ax === 0));
  /** Doit-on céder le passage au nœud n ? (t sur son arête, à dist m de la ligne d'arrêt) */
  /** Quelqu'un est-il en train de traverser le carrefour n (sur une trajectoire qui peut croiser la mienne) ? */
  function inNode(t, i, n) {
    for (let j = 0; j < tr.length; j++) {
      const o = tr[j]; if (j === i || !o.turn || o.turn.n !== n) continue;
      if (o.turn.from === t.e && o.turn.fdir === t.dir) continue;                     // il est devant moi, sur ma route
      if (o.turn.to === t.e && o.turn.tdir === -t.dir && !(t.q[0].e === o.turn.from)) continue;   // il entre dans ma rue, sur l'autre voie
      if (o.turn.s > o.turn.len * 0.85) continue;                                     // il a presque fini
      return true;
    }
    return false;
  }
  function mustYield(t, i, n) {
    const me = city.edges[t.e], nd = city.nodes[n], u = unit(t.e, t.dir);
    for (let j = 0; j < tr.length; j++) {
      if (j === i) continue; const o = tr[j];
      if (o.turn) continue;
      if (endNode(o.e, o.dir) !== n || (o.e === t.e && o.dir === t.dir)) continue;
      const od = city.edges[o.e].len - o.d;
      if (od > 16 || (od > 9 && o.v < 1)) continue;
      const ro = city.edges[o.e]._rank, rm = me._rank;
      if (ro > rm) return true;                                                       // route principale / giratoire
      if (ro < rm) continue;
      if ((o.x - nd.x) * -u.z + (o.z - nd.z) * u.x > 1) return true;                  // priorité à droite
    }
    for (const c of S.cars) if (c.dr && Math.abs(c.s || 0) > 1.5 && Math.hypot(c.x - nd.x, c.z - nd.z) < 13) return true;   // un joueur arrive : prudence
    return false;
  }
  function trafficStep(dt) {
    // obstacles (pose au début du pas) : circulation, véhicules des joueurs, piétons-joueurs, gendarmerie
    const obs = tr.map((t, j) => ({ x: t.x, z: t.z, h: t.h, v: t.v, fr: EXT[t.spc || 'civ'][0], rr: EXT[t.spc || 'civ'][1], w: 1.0, j }));
    for (const c of S.cars) { const L = c.kind === 'camion' ? 4.4 : c.kind === 'tp' ? 1.2 : c.kind === 'fenwick' ? 1.6 : 2.4; obs.push({ x: c.x, z: c.z, h: c.h, v: Math.abs(c.s || 0), fr: L, rr: L, w: c.kind === 'camion' ? 1.3 : 1.0, pl: !!c.dr, car: true }); }
    for (const pid in K.pose) if (S.pl[pid] && K.foot(S.pl[pid])) obs.push({ x: K.pose[pid].x, z: K.pose[pid].z, h: 0, v: 0, fr: 0.4, rr: 0.4, w: 0.4, pl: true, foot: true });
    if (pol) obs.push({ x: pol.x, z: pol.z, h: pol.h, v: 10, fr: 2.2, rr: 2.2, w: 1.0 });
    tr.forEach((t, i) => {
      const E = city.edges[t.e];
      let target = cruise(t), why = null, hard = false, byTraffic = false;
      // ---- virages à venir ----
      if (t.turn) {
        target = Math.min(target, t.turn.vt);
        const cut2 = cutAt(endNode(t.e, t.dir), t.e, t.q[0].e), dist = (t.turn.len - t.turn.s) + (E.len - cut2 - t.d);
        target = Math.min(target, brk(turnV(angOf(t, t.q[0]), cut2), dist));
      } else {
        const n = endNode(t.e, t.dir), cut = cutAt(n, t.e, t.q[0].e), dist = E.len - cut - t.d;
        target = Math.min(target, brk(turnV(angOf(t, t.q[0]), cut), dist));
        const E1 = city.edges[t.q[0].e], cut2 = cutAt(endNode(t.q[0].e, t.q[0].dir), t.q[0].e, t.q[1].e);
        target = Math.min(target, brk(turnV(angOf(t.q[0], t.q[1]), cut2), dist + cut * 1.6 + E1.len - cut - cut2));
        // klaxon avant les épingles (montagne, corniche)
        if ((E.mtn || E1.mtn) && dist < 25 && t.hk < S.rt) {
          const tot = angOf(t, t.q[0]) + angOf(t.q[0], t.q[1]);
          if (tot > 1.2 || (E1.len < 14 && tot > 0.9)) { t.hk = S.rt + 8; K.sfx('horn', t.x, t.z); }
        }
        // feux tricolores
        const stopV = x => (x <= 0.2 ? 0 : Math.sqrt(2 * 3.5 * x));
        // on ne s'engage jamais dans un carrefour occupé (même au vert, même prioritaire)
        if (NB[n].length >= 3 && dist < 15 && inNode(t, i, n)) { target = Math.min(target, stopV(dist - 0.3)); if (dist < 1.2) hard = true; if (t.v < 0.5) t.wait += dt; }
        if (city.lights.includes(n) && !t.commit) {
          const u = unit(t.e, t.dir), ax = Math.abs(u.z) >= Math.abs(u.x) ? 0 : 1;
          if (!lightGreen(n, ax)) { if (t.v * t.v / 12 > dist + 0.5 && dist < 6) t.commit = true; else target = Math.min(target, stopV(dist - 0.3)); }
          else if (dist < 3) t.commit = true;
        } else if (NB[n].length >= 3 && dist < 15 && !t.commit) {
          // cédez-le-passage
          if (t.wait < 5 && mustYield(t, i, n)) { target = Math.min(target, stopV(dist - 0.3)); if (t.v < 0.5) t.wait += dt; }
          else if (dist < 2.5) t.commit = true;
          if (t.wait >= 5 && t.honk <= 0) { t.honk = 4; K.sfx('horn', t.x, t.z); }           // ras-le-bol : il force le passage
        }
        // autoroute : dépassement par la voie de gauche, retour à droite dès que possible
        if (E.hw) {
          const leaving = !city.edges[t.q[0].e].hw || !city.edges[t.q[1].e].hw, u = { x: Math.sin(t.h), z: Math.cos(t.h) };
          const free = (side, a0, a1) => !obs.some(o => o.j !== i && Math.cos(o.h - t.h) > 0.5 && (() => { const dx = o.x - t.x, dz = o.z - t.z, al = dx * u.x + dz * u.z, ls = dx * u.z - dz * u.x; return al > a0 && al < a1 && ls * side > 2.2 && ls * side < 6.8; })());
          const ahead = obs.find(o => o.j !== undefined && o.j !== i && Math.cos(o.h - t.h) > 0.5 && (() => { const dx = o.x - t.x, dz = o.z - t.z, al = dx * u.x + dz * u.z, ls = Math.abs(dx * u.z - dz * u.x); return al > 0 && al < 32 && ls < 1.8; })());
          t.lt = (t.lt || 0) + dt;
          if (t.lane === 0 && !leaving && ahead && ahead.v < cruise(t) - 2 && t.lt > 2 && free(1, -14, 30)) { t.lane = 1; t.lt = 0; }
          else if (t.lane === 1 && t.lt > 3 && free(-1, -9, 28)) { t.lane = 0; t.lt = 0; }
        } else t.lane = 0;
      }
      // ---- files d'attente : personne devant ----
      const u = { x: Math.sin(t.h), z: Math.cos(t.h) }, fr = EXT[t.spc || 'civ'][0];
      for (const o of obs) {
        if (o.j === i) continue;
        const dx = o.x - t.x, dz = o.z - t.z, al = dx * u.x + dz * u.z;
        if (al <= 0 || al > 45) continue;
        const lat = Math.abs(dx * u.z - dz * u.x), ch = o.foot ? 1 : Math.cos(o.h - t.h);
        let rr = o.rr;
        if (o.j !== undefined && ch < -0.3) { if (al > 10 || lat > 1.5) continue; rr = o.fr; }   // en face : seulement s'il est VRAIMENT sur ma voie
        else if (lat > 0.9 + o.w + Math.min(1, al * 0.03)) continue;
        if (t.ghost > 0 && o.j !== undefined) continue;
        const gap = al - fr - rr;
        if (gap < 0.7) { hard = true; if (o.pl) why = 'p'; else if (o.j !== undefined) { byTraffic = true; t.blk = o.j; } continue; }
        const ov = Math.max(0, o.v * ch), vs = Math.sqrt(ov * ov + 2 * 3.5 * Math.max(0, gap - 1.6));
        if (vs < target) { target = vs; why = o.pl ? 'p' : null; byTraffic = o.j !== undefined; if (byTraffic) t.blk = o.j; }
      }
      // ---- intégration ----
      if (hard) t.v = 0; else t.v += U.clamp(target - t.v, -9 * dt, 3 * dt);
      t.v = Math.max(0, t.v);
      if (!byTraffic) t.blk = -1;
      // inter-blocage (deux voitures qui se bloquent mutuellement au milieu d'un carrefour, très rare) : on se faufile
      if (t.v < 0.3 && byTraffic && !why) { t.stuck += dt; const o = tr[t.blk]; if ((o && o.blk === i && t.stuck > 3) || t.stuck > 40) { t.ghost = 2.5; t.stuck = 0; } } else t.stuck = 0;
      if (t.ghost > 0) t.ghost -= dt;
      t.honk -= dt;
      if (why && t.v < 1 && t.honk <= 0) { t.honk = 3 + rng() * 4; K.sfx('horn', t.x, t.z); }
      const step = t.v * dt;
      if (t.turn) {
        t.turn.s += step;
        if (t.turn.s >= t.turn.len) { t.d += t.turn.s - t.turn.len; t.turn = null; }
      } else {
        const loT = laneOff(t.e, t.lane), ol = t.lo; t.lo += U.clamp(loT - t.lo, -1.7 * dt, 1.7 * dt); t.dlo = (t.lo - ol) / Math.max(dt, 1e-4);
        t.d += step;
        const n = endNode(t.e, t.dir), cut = cutAt(n, t.e, t.q[0].e);
        if (t.d >= E.len - cut) startTurn(t, cut, t.d - (E.len - cut));
      }
      place(t);
      // piétons-joueurs renversés
      if (t.v > 3) for (const pid in K.pose) {
        const pp = K.pose[pid], Pl = S.pl[pid]; if (!Pl || !K.foot(Pl) || (K.hitCd[pid] || 0) > S.rt) continue;
        const dx = pp.x - t.x, dz = pp.z - t.z, al = dx * u.x + dz * u.z;
        if (Math.abs(dx * u.z - dz * u.x) < 1.3 && al > -EXT[t.spc || 'civ'][1] && al < fr + 0.4) {
          K.hitCd[pid] = S.rt + 3; K.playerHit(pid, null, 1.2);
          K.ev({ e: 'push', to: pid, vx: u.x * 10, vz: u.z * 10 }); K.note(pid, t.spc === 'tracteur' ? '🚜 Renversé·e par un TRACTEUR. À 15 km/h. Respect.' : '🚗 Un automobiliste t\'a renversé ! Regarde avant de traverser.', 'warn'); K.sfx('horn', t.x, t.z);
        }
      }
    });
  }

  /* ---------- Passants ---------- */
  function pedPos(p) {
    const e = city.edges[p.e], A = city.nodes[p.dir > 0 ? e.a : e.b], B = city.nodes[p.dir > 0 ? e.b : e.a];
    const ux = (B.x - A.x) / e.len, uz = (B.z - A.z) / e.len, o = (city.RW + 0.9) * p.side;
    return { x: A.x + ux * p.d - uz * o, z: A.z + uz * p.d + ux * o, h: Math.atan2(ux, uz), end: p.dir > 0 ? e.b : e.a, len: e.len };
  }
  function pedStep(dt) {
    for (const p of peds) {
      if (p.down > 0) { p.down -= dt; continue; }
      p.d += p.sp * dt;
      const q = pedPos(p);
      if (p.d >= q.len - 2) {
        const opts = city.edges.map((e, k) => k).filter(k => k !== p.e && k > 0 && !city.edges[k].ring && (city.edges[k].a === q.end || city.edges[k].b === q.end));
        if (opts.length) { const k = rng.pick(opts); p.e = k; p.dir = city.edges[k].a === q.end ? 1 : -1; p.d = 2; } else { p.dir = -p.dir; p.d = 2; p.side = -p.side; }
      }
      for (const c of S.cars) if (c.dr && Math.abs(c.s || 0) > 4 && Math.hypot(c.x - q.x, c.z - q.z) < 1.9) {
        p.down = 4; S.score = Math.max(0, S.score - 3); if (K.fine) K.fine(c.dr, 135, 'Passant renversé (dommages et intérêts)'); K.ev({ e: 'ped', i: peds.indexOf(p) }); if (K.lawPed) K.lawPed(c.dr);
        K.all(`🚶 ${S.pl[c.dr] ? S.pl[c.dr].name : '?'} a renversé un passant ! (−3) Il se relève en râlant.`, 'warn'); K.sfx('punch', q.x, q.z);
      }
    }
  }

  /* ---------- Radars & gendarmerie ---------- */
  function lawStep(dt) {
    const limit = S.rule === 'speed30' ? 8.4 : C.SPEED_LIMIT;
    S.cars.forEach((c, ci) => {
      if (!c.dr || !S.pl[c.dr] || c.kind === 'tp') return;
      const sp = Math.abs(c.s || 0), kmh = Math.round(sp * 3.6), name = S.pl[c.dr].name;
      ML.World.radars.forEach((r, ri) => {
        const key = c.dr + ':' + ri;
        const lim = city.radars[ri] && city.radars[ri].ring && S.rule !== 'speed30' ? 25 : limit;
        if (sp > lim && Math.hypot(r.x - c.x, r.z - c.z) < 15 && (K.radarCd[key] || 0) < S.rt) {
          K.radarCd[key] = S.rt + 5; S.score = Math.max(0, S.score - 5); if (K.fine) K.fine(c.dr, kmh >= 90 ? 200 : 90, `Excès de vitesse (${kmh} km/h)`);
          K.ev({ e: 'flash', to: c.dr, r: ri, kmh }); K.all(`📸 ${name} flashé·e à ${kmh} km/h ! (−5)`, 'warn');
          if (kmh >= 90) K.stat(c.dr, 'flash90');
          if (K.lawSpeed) K.lawSpeed(c.dr);                         // sim_law.js : excès de vitesse + passant = gendarmerie
        }
      });
      const L = ML.LOC.comp.police;
      if (L && !pol && sp > C.POLICE_TRIGGER && Math.hypot(L.dock.x - c.x, L.dock.z - c.z) < 50) {
        pol = K.pol = { x: L.dock.x, z: L.dock.z, h: Math.atan2(c.x - L.dock.x, c.z - L.dock.z), pid: c.dr, ci, t: 0, stuck: 0 };
        K.big('🚨 GENDARMERIE !', '#3498db'); K.all(`🚨 La gendarmerie prend ${name} en chasse ! Sème-la (ou arrête-toi…)`, 'warn'); K.sfx('siren', c.x, c.z);
      }
      // créneau de légende : arriver en marche arrière au quai d'un client
      if ((c.s || 0) < -1.5 && !K.revDone[c.dr]) for (const k of ML.CLIENTS) { const L2 = ML.LOC.comp[k]; if (L2 && Math.hypot(L2.dock.x - c.x, L2.dock.z - c.z) < 7) { K.revDone[c.dr] = 1; K.stat(c.dr, 'reverse'); } }
    });
    if (!pol) return;
    pol.t += dt;
    const PP = S.pl[pol.pid];
    if (pol.wanted && PP) pol.ci = PP.car !== null ? PP.car : -1;   // recherché : on suit le joueur, quelle que soit sa voiture
    if (PP && S.law && S.law.jail && S.law.jail[pol.pid]) { pol = K.pol = null; return; }
    const c = S.cars[pol.ci], tgt = c && c.dr === pol.pid ? c : null, tp = K.pose[pol.pid];
    const rc = PP && PP.ride != null ? S.cars[PP.ride] : null;     // passager d'une voiture qui roule : pas d'arrestation
    const tx = tgt ? tgt.x : tp ? tp.x : pol.x, tz = tgt ? tgt.z : tp ? tp.z : pol.z;
    const dx = tx - pol.x, dz = tz - pol.z, d = Math.hypot(dx, dz);
    pol.h = U.lerpAngle(pol.h, Math.atan2(dx, dz), Math.min(1, dt * 3));
    const sp = Math.min(23, d * 2), ox = pol.x, oz = pol.z;
    pol.x += Math.sin(pol.h) * sp * dt; pol.z += Math.cos(pol.h) * sp * dt;
    const q = { x: pol.x, z: pol.z }; U.resolveCircle(q, 1.1); pol.x = q.x; pol.z = q.z;
    if (Math.hypot(pol.x - ox, pol.z - oz) < sp * dt * 0.3 && d > 6) pol.stuck += dt; else pol.stuck = 0;
    if (pol.stuck > 1.5) {          // bloquée : elle « coupe » par une autre rue
      pol.stuck = 0; const a = Math.atan2(dx, dz) + Math.PI + (rng() - 0.5);
      const nx = tx + Math.sin(a) * 22, nz = tz + Math.cos(a) * 22; if (!U.inCollider(nx, nz, 1.5)) { pol.x = nx; pol.z = nz; }
    }
    const name = S.pl[pol.pid] ? S.pl[pol.pid].name : '?';
    if (d < 4.5 && (!tgt || Math.abs(tgt.s || 0) < 4) && !(rc && Math.abs(rc.s || 0) > 4)) {
      S.score = Math.max(0, S.score - 15); if (K.fine) K.fine(pol.pid, 250, 'Arrestation par la gendarmerie');
      if (pol.wanted && K.lawArrest && K.lawArrest(pol.pid)) { pol = K.pol = null; Sim.dirty = true; return; }   // sim_law.js : direction la cellule
      if (tgt) tgt.frozen = S.rt + 6;
      K.ev({ e: 'arrest', to: pol.pid }); K.big('🚨 ARRÊTÉ·E !', '#3498db', pol.pid); K.all(`🚨 ${name} s'est fait arrêter : PV de 15 points et 6 s de contrôle.`, 'warn');
      pol = K.pol = null; Sim.dirty = true; return;
    }
    if (d > (pol.wanted ? 160 : 120) || pol.t > (pol.wanted ? 60 : 40) || !S.pl[pol.pid]) {
      if (S.pl[pol.pid]) { K.stat(pol.pid, 'police_out'); K.all(`😎 ${name} a semé la gendarmerie !`, 'good'); if (pol.wanted && K.lawEscape) K.lawEscape(pol.pid); }
      pol = K.pol = null;
    }
  }

  /** Poursuite d'un joueur RECHERCHÉ (sim_law.js) : la voiture de gendarmerie surgit d'un carrefour
      à ~50 m de lui (sinon elle part de la brigade). Renvoie false si elle est déjà occupée. */
  K.polChase = pid => {
    const P = S.pl[pid]; if (pol || !P) return false;
    const c = P.car !== null ? S.cars[P.car] : null, t = c || K.pose[pid]; if (!t) return false;
    let best = null, bd = 1e9;
    for (const n of city.nodes) {
      const d = Math.hypot(n.x - t.x, n.z - t.z);
      if (d > 30 && d < 90 && Math.abs(d - 50) < bd && !U.inCollider(n.x, n.z, 1.5)) { bd = Math.abs(d - 50); best = n; }
    }
    const L = ML.LOC.comp.police, o = best || (L && L.dock); if (!o) return false;
    pol = K.pol = { x: o.x, z: o.z, h: Math.atan2(t.x - o.x, t.z - o.z), pid, ci: P.car !== null ? P.car : -1, t: 0, stuck: 0, wanted: true };
    return true;
  };

  /* ---------- Mode COURSE ---------- */
  function raceStep(dt) {
    const R = K.race; if (!R) return;
    if (!S.race || S.race.done) {
      R.next -= dt;
      if (R.next <= 0) {
        if (R.round >= R.total) { const rank = Object.keys(S.pl).map(p => [p, S.pl[p].name, R.pts[p] || 0]).sort((a, b) => b[2] - a[2]); S.score = rank.length ? rank[0][2] : 0; K.end({ race: rank }); return; }
        R.round++;
        const keys = Object.keys(ML.LOC.comp).filter(k => k !== R.prev && k !== 'police'), target = rng.pick(keys);
        R.prev = target; S.race = { round: R.round, total: R.total, target, arrived: [], t0: S.rt, first: null, pts: R.pts, done: false };
        K.big(`🏁 Manche ${R.round}/${R.total} : ${ML.COMPANIES[target].name} !`, '#ffd257'); K.all(`🏁 Premier arrivé EN VOITURE devant ${ML.COMPANIES[target].name} !`, 'info'); K.sfx('order');
        Sim.dirty = true;
      }
      return;
    }
    const Rc = S.race, L = ML.LOC.comp[Rc.target];
    for (const pid in S.pl) {
      const P = S.pl[pid]; if (P.car === null || Rc.arrived.includes(pid)) continue;
      const c = S.cars[P.car]; if (Math.hypot(c.x - L.dock.x, c.z - L.dock.z) < 11) {
        const pts = [5, 3, 2, 1, 1][Rc.arrived.length]; Rc.arrived.push(pid); R.pts[pid] = (R.pts[pid] || 0) + pts;
        if (!Rc.first) Rc.first = S.rt;
        K.all(`🏁 ${P.name} arrive ${Rc.arrived.length === 1 ? 'PREMIER·E' : Rc.arrived.length + 'e'} (+${pts})`, 'good'); K.sfx('cash', c.x, c.z); Sim.dirty = true;
      }
    }
    if (Rc.arrived.length >= Object.keys(S.pl).length || (Rc.first && S.rt - Rc.first > 30) || S.rt - Rc.t0 > 120) { Rc.done = true; R.next = 5; Sim.dirty = true; }
  }

  mod.step = dt => {
    trafficStep(dt); lawStep(dt); pedStep(dt); if (S.mode === 'course') raceStep(dt);
    // voitures conduites : PNJ bousculés
    for (const c of S.cars) if (c.dr && Math.abs(c.s) > 3) for (const id in K.npcs) {
      const n = K.npcs[id]; if (!n.active || n.stun > 0 || Math.hypot(n.x - c.x, n.z - c.z) > 2) continue;
      n.stun = 0.6; const dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot(dx, dz) || 1; n.x += dx / d * 1.5; n.z += dz / d * 1.5; U.resolveCircle(n, 0.3);
      K.say(n, id === 'lebec' ? 'TU M\'AS RENVERSÉ ?! COUP DE PELLE !' : 'Eh oh ! Regarde où tu roules !');
      if (id === 'lebec' && !S.chase) { S.anger = 100; K.startChase(c.dr); }
    }
  };

  /* ---------- Intentions ---------- */
  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'exit': {
        const c = S.cars[m.car | 0];
        if (P.ride != null) { const r = S.cars[P.ride]; if (r) r.pass = r.pass.filter(x => x.pid !== pid); P.ride = null; Sim.dirty = true; return true; }
        if (c && c.dr === pid) { c.dr = null; c.s = 0; if (isFinite(m.x) && isFinite(m.z)) Object.assign(c, { x: +m.x, z: +m.z, h: +m.h || 0 }); P.car = null; if (pol && pol.pid === pid && !pol.wanted && Math.hypot(pol.x - c.x, pol.z - c.z) < 12) pol.t = 99; }
        return true;
      }
      case 'crash': {                                             // chute de falaise / plongeon dans la rivière
        const c = S.cars[m.car | 0]; if (!c || c.dr !== pid || (c.crashT || 0) > S.rt) return true;
        c.crashT = S.rt + 3;
        const l = { x: Math.cos(c.h), z: -Math.sin(c.h) };
        for (const it of c.bed.splice(0)) K.spawnItem(it, c.x + (rng() - 0.5) * 2, 1.5, c.z + (rng() - 0.5) * 2, [l.x * (rng() - 0.5) * 8, 4 + rng() * 3, l.z * (rng() - 0.5) * 8]);
        if (c.load) { K.spawnItem(c.load, c.x, 1, c.z); c.load = null; }
        for (const q in S.pl) if (S.pl[q].car === (m.car | 0) || (S.pl[q].ride && S.pl[q].ride.car === (m.car | 0))) K.playerHit(q, null, 2.5);
        if (K.fine) K.fine(pid, 350, `Dépanneuse (${c.name} au fond du ravin)`);
        K.all(`💥 ${P.name} a envoyé ${c.name} dans le décor ! La dépanneuse de Jacquot arrive…${K.careerOn && K.careerOn() ? ' (−350 €)' : ''}`, 'warn'); K.sfx('clang', c.x, c.z); K.stat(pid, 'crash');
        return true;
      }
      case 'fall': { const v = U.clamp(+m.v || 0, 0, 60); if (v > 13) { K.playerHit(pid, null, Math.min(4, v / 8)); if (v > 22) K.all(`🪂 ${P.name} a sauté de la falaise. Sans parachute.`, 'warn'); } return true; }
      case 'spill': {
        /* Chargement qui tombe. Le conducteur (cars.js) décide QUAND : jauge « ça penche » (accélération latérale
           comparée à la tenue du chargement) ou grosse bosse / saut (m.bump). L'hôte décide QUOI : la caisse la
           plus légère part en premier (les palettes sanglées du camion tiennent mieux) ; fenwick : la charge des fourches. */
        const c = S.cars[m.car | 0]; if (!c || c.dr !== pid || (c.spillT || 0) > S.rt) return true;
        const side = m.side > 0 ? 1 : -1, l = { x: Math.cos(c.h), z: -Math.sin(c.h) }, f = { x: Math.sin(c.h), z: Math.cos(c.h) }, sp = c.s || 0, bump = !!m.bump;
        if (c.kind === 'fenwick') {
          if (!c.load) return true;
          c.spillT = S.rt + 1; const it = c.load; c.load = null;
          K.spawnItem(it, c.x + f.x * 2 + l.x * side * 0.7, 1.0, c.z + f.z * 2 + l.z * side * 0.7, [l.x * side * 3 + f.x * sp * 0.6, 2, l.z * side * 3 + f.z * sp * 0.6]);
          K.all(`🏗️ ${P.name} a pris le virage trop vite : la charge du fenwick part en vrille !`, 'warn'); K.stat(pid, 'spill'); K.sfx('clang', c.x, c.z); Sim.dirty = true;
          return true;
        }
        if (!c.bed.length || c.kind === 'tp') return true;
        c.spillT = S.rt + 0.7;
        const mass = it => (ML.Cars && ML.Cars.itemMass ? ML.Cars.itemMass(it) : 30), w = c.bed.map(it => 1 / Math.sqrt(Math.max(5, mass(it))));
        let r = rng() * w.reduce((a, b) => a + b, 0), idx = 0; for (; idx < w.length - 1; idx++) { r -= w[idx]; if (r <= 0) break; }
        const it = c.bed.splice(idx, 1)[0], back = c.kind === 'camion' ? 3 : 1.6;
        const vel = bump ? [l.x * side * 2 + f.x * sp * 0.5, 6 + rng() * 2, l.z * side * 2 + f.z * sp * 0.5] : [l.x * side * 6 + f.x * sp * 0.4, 3, l.z * side * 6 + f.z * sp * 0.4];
        K.spawnItem(it, c.x - f.x * back + l.x * side * 1.2, 1.4, c.z - f.z * back + l.z * side * 1.2, vel);
        const msg = bump ? [`🦘 BOSSE ! Une caisse saute de ${c.name} ! (${P.name})`, `🦘 ${P.name} a décollé… la caisse aussi, mais pas dans la même direction.`]
          : [`📦 Ça penchait… une caisse est tombée de ${c.name} dans le virage ! (${P.name})`, `📦 Vol plané d'une caisse depuis ${c.name} ! ${P.name} conduit comme Lebec.`, `📦 ${P.name} a semé une caisse dans le virage. Le client appréciera.`];
        K.all(rng.pick(msg), 'warn'); K.stat(pid, 'spill'); K.sfx('clang', c.x, c.z); Sim.dirty = true;
        return true;
      }
      case 'horn': {
        const k = ML.SHOP[m.k] && ML.SHOP[m.k].cat === 'klaxon' ? m.k : 'base';
        K.ev({ e: 'horn', pid, k, x: Math.round(ps.x), z: Math.round(ps.z) });
        if (K.violation) K.violation(pid, 'no_horn');
        return true;
      }
      case 'refuel': {
        const c = S.cars[P.car]; if (!c || !ML.LOC.pump || Math.hypot(ML.LOC.pump.x - c.x, ML.LOC.pump.z - c.z) > 9) return true;
        c.fuel = 100; K.ev({ e: 'fuel', car: P.car, f: 100 }); K.note(pid, '⛽ Le plein est fait ! (Dédé met ça sur le compte de Lebec)', 'good');
        return true;
      }
      case 'dry': K.stat(pid, 'dry'); K.all(`⛽ ${P.name} est en PANNE SÈCHE ! Un jerrican (station Total-Lebec) et E sur la voiture.`, 'warn'); return true;
    }
    return false;
  };
  mod.use = (pid, P, ps, sel, held, kind, a, b) => {
    if (kind !== 'car') return false;
    const i = +a, c = S.cars[i]; if (!c || !K.near(ps, c.x, c.z, 6)) return true;
    if (b === 'door') {
      if (held && held.type === 'jerrican' && c.kind !== 'tp') {
        P.inv[sel] = null; c.fuel = Math.min(100, (c.fuel || 0) + 45); K.ev({ e: 'fuel', car: i, f: c.fuel });
        K.note(pid, `⛽ +45 % d'essence dans ${c.name}.`, 'good'); K.sfx('pickup', c.x, c.z); return true;
      }
      if (P.car !== null || P.ride != null) return true;
      const V = ML.VEHICLES[c.kind];
      if (c.dr) {                                                   // place passager
        if (c.pass.filter(x => x.seat === 'cab').length >= (c.kind === 'camion' ? 1 : V.seats ? 1 : 0)) { K.note(pid, `Pas de place passager dans ${c.name}.`, 'warn'); return true; }
        c.pass.push({ pid, seat: 'cab' }); P.ride = i; Sim.dirty = true; K.note(pid, '🪑 Tu es passager·e : clic droit pour lancer, E pour descendre.', 'good'); return true;
      }
      if (V.role && P.role !== V.role) { K.needRole(pid, V.role, `Conduire ${c.name}`); return true; }
      if (P.inv.some(x => x && IT.bulky(x))) { K.note(pid, c.kind === 'tp' ? 'Pose ta caisse sur les fourches du transpalette (E à l\'arrière) avant de le conduire.' : 'Pose ta caisse dans la benne avant de conduire.', 'warn'); return true; }
      c.dr = pid; P.car = i; K.ev({ e: 'drive', to: pid, car: i }); Sim.dirty = true; return true;
    }
    if (c.kind === 'fenwick') { K.note(pid, 'Le fenwick se conduit (E côté conducteur) ; R pour lever/poser les fourches.'); return true; }
    if (held && IT.heavy(held)) return true;
    if (held && (IT.bulky(held) || held.type === 'piece')) {
      if (c.kind === 'camion') { K.note(pid, 'Le camion ne prend que les PALETTES (chargées au fenwick).', 'warn'); return true; }
      if (c.bed.length >= c.cap) { K.note(pid, c.kind === 'tp' ? 'Le transpalette est plein (4 caisses).' : 'La benne est pleine.', 'warn'); return true; }
      P.inv[sel] = null; c.bed.push(held); K.sfx('drop', c.x, c.z); return true;
    }
    if (!c.bed.length) {
      if (!held && ML.VEHICLES[c.kind].seats > 1 && c.kind !== 'camion' && P.car === null && P.ride == null && c.pass.filter(x => x.seat === 'bed').length < 2) {
        c.pass.push({ pid, seat: 'bed' + c.pass.filter(x => x.seat.startsWith('bed')).length }); P.ride = i; Sim.dirty = true;
        K.note(pid, '🛻 Tu montes dans la benne ! Accroche-toi. (E pour descendre)', 'good');
      }
      return true;
    }
    if (c.kind === 'camion') { K.note(pid, 'Les palettes se déchargent au fenwick ou avec R (livreur) chez le client.'); return true; }
    let idx = c.bed.length - 1, here = null;
    for (const k in ML.LOC.comp) if (Math.hypot(ML.LOC.comp[k].dock.x - c.x, ML.LOC.comp[k].dock.z - c.z) < 25) here = k;
    const fits = it => { if (!K.isPart(it)) return here === null && U.inWorkshop({ x: c.x, z: c.z - 10 }); const o = S.orders.find(x => x.id === it.d.oid); return o && ((here === o.client && K.stage(o) === 'livraison') || (here === 'tth' && K.stage(o) === 'tth')); };
    const j = c.bed.findIndex(fits); if (j >= 0) idx = j;
    if (K.give(pid, c.bed[idx], sel)) { c.bed.splice(idx, 1); K.sfx('pickup', c.x, c.z); }
    return true;
  };
  const r2 = v => Math.round(v * 100) / 100;
  mod.fast = f => {
    f.tr = tr.map(t => [r2(t.x), r2(t.z), r2(t.h), t.m, Math.round(t.v * 10) / 10]);   // [x, z, cap, forme (0-3 civiles, 4 tracteur, 5 camping-car), vitesse]
    f.pol = pol ? [r2(pol.x), r2(pol.z), r2(pol.h)] : null;
    f.ps = peds.map(p => { const q = pedPos(p); return [r2(q.x), r2(q.z), r2(q.h), p.down > 0 ? 1 : 0]; });
  };
  Sim.mods.push(mod);
})();
