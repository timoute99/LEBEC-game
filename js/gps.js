/* =====================================================================
   gps.js — REPÈRE et TRAJET façon GPS (côté joueur, personnel) :
   clic sur la grande carte (M) → le trajet le plus court par les rues
   s'affiche au sol (ruban lumineux), sur la mini-carte et sur la carte,
   avec la distance restante. Clic droit sur la carte : effacer.
   Calcul : plus court chemin (Dijkstra) sur le graphe des rues de la
   ville (citygen), depuis le point de route le plus proche du joueur.
   ===================================================================== */
(function () {
  const GPS = ML.GPS = { target: null, path: null, dist: 0, t: 0, from: null, mesh: null, beacon: null };
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
    return { d: Math.hypot(px - ax - t * dx, pz - az - t * dz), x: ax + t * dx, z: az + t * dz };
  };
  /** Point de route le plus proche : { e (indice de rue), x, z } */
  function snap(city, x, z) {
    let best = null;
    city.edges.forEach((e, i) => { const A = city.nodes[e.a], B = city.nodes[e.b], r = segDist(x, z, A.x, A.z, B.x, B.z); if (!best || r.d < best.d) best = { e: i, x: r.x, z: r.z, d: r.d }; });
    return best;
  }
  /** Plus court chemin entre deux positions (liste de points) */
  GPS.route = (x0, z0, x1, z1) => {
    const city = ML.World.city; if (!city) return null;
    const N = city.nodes, E = city.edges, a = snap(city, x0, z0), b = snap(city, x1, z1); if (!a || !b) return null;
    const pts = [{ x: x0, z: z0 }, { x: a.x, z: a.z }];
    if (a.e === b.e) { pts.push({ x: b.x, z: b.z }, { x: x1, z: z1 }); return pts; }
    const adj = GPS._adj && GPS._city === city ? GPS._adj : (GPS._city = city, GPS._adj = N.map((n, i) => E.map((e, k) => (e.a === i ? [e.b, k] : e.b === i ? [e.a, k] : null)).filter(Boolean)));
    const d = new Array(N.length).fill(Infinity), prev = new Array(N.length).fill(-1), done = new Array(N.length).fill(false);
    const ea = E[a.e], eb = E[b.e];
    for (const s of [ea.a, ea.b]) d[s] = Math.hypot(N[s].x - a.x, N[s].z - a.z);
    for (;;) {
      let u = -1; for (let i = 0; i < N.length; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
      if (u < 0) break; done[u] = true;
      for (const [v] of adj[u]) { const w = d[u] + Math.hypot(N[v].x - N[u].x, N[v].z - N[u].z); if (w < d[v]) { d[v] = w; prev[v] = u; } }
    }
    const end = [eb.a, eb.b].map(i => [i, d[i] + Math.hypot(N[i].x - b.x, N[i].z - b.z)]).sort((p, q) => p[1] - q[1])[0];
    if (!end || end[1] === Infinity) return null;
    const chain = []; for (let i = end[0]; i >= 0; i = prev[i]) chain.unshift(i);
    for (const i of chain) pts.push({ x: N[i].x, z: N[i].z });
    pts.push({ x: b.x, z: b.z }, { x: x1, z: z1 });
    return pts;
  };
  GPS.set = (x, z) => { GPS.target = { x, z }; GPS.t = 0; GPS.from = null; ML.Sfx.play('bip'); };
  GPS.clear = () => { GPS.target = null; GPS.path = null; GPS.draw(); };
  GPS.myPos = () => { const G = ML.Game, c = G.p.car !== null ? ML.Cars.list[G.p.car] : G.p.ride ? ML.Cars.list[G.p.ride.car] : null; return c ? c.pos : G.p.pos; };

  /** Ruban au sol + colonne de lumière sur le repère */
  GPS.draw = () => {
    if (GPS.mesh) { ML.scene.remove(GPS.mesh); GPS.mesh.geometry.dispose(); GPS.mesh = null; }
    if (!GPS.path || !GPS.target) { if (GPS.beacon) GPS.beacon.visible = false; return; }
    const v = [], W = 0.8, P = GPS.path;
    for (let i = 0; i < P.length - 1; i++) {
      const A = P[i], B = P[i + 1], L = Math.hypot(B.x - A.x, B.z - A.z); if (L < 0.5) continue;
      const nx = -(B.z - A.z) / L * W, nz = (B.x - A.x) / L * W, y = 0.09 + i * 0.0005;
      v.push(A.x + nx, y, A.z + nz, A.x - nx, y, A.z - nz, B.x + nx, y, B.z + nz, A.x - nx, y, A.z - nz, B.x - nx, y, B.z - nz, B.x + nx, y, B.z + nz);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    GPS.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc061ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    GPS.mesh.renderOrder = 2; ML.scene.add(GPS.mesh);
    if (!GPS.beacon) {
      GPS.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xc061ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    }
    if (GPS.beacon.parent !== ML.scene) ML.scene.add(GPS.beacon);
    GPS.beacon.position.set(GPS.target.x, 20, GPS.target.z); GPS.beacon.visible = true;
  };
  /** À chaque image : recalcule le trajet de temps en temps, détecte l'arrivée */
  GPS.update = dt => {
    if (!GPS.target || !ML.World.city) return;
    const p = GPS.myPos(), left = Math.hypot(GPS.target.x - p.x, GPS.target.z - p.z);
    if (left < 9) { ML.HUD.notify('📍 Tu es arrivé au repère !', 'good'); ML.Sfx.play('success'); GPS.clear(); return; }
    GPS.t -= dt;
    if (GPS.t <= 0 || !GPS.from || Math.hypot(GPS.from.x - p.x, GPS.from.z - p.z) > 6) {
      GPS.t = 1; GPS.from = { x: p.x, z: p.z };
      GPS.path = GPS.route(p.x, p.z, GPS.target.x, GPS.target.z);
      GPS.dist = 0; if (GPS.path) for (let i = 0; i < GPS.path.length - 1; i++) GPS.dist += Math.hypot(GPS.path[i + 1].x - GPS.path[i].x, GPS.path[i + 1].z - GPS.path[i].z);
      GPS.draw();
    }
    if (GPS.beacon) GPS.beacon.material.opacity = 0.2 + Math.sin(performance.now() / 300) * 0.08;
  };
  /** Trace le trajet sur un canvas 2D (carte / mini-carte). X, Z : conversions monde → pixels */
  GPS.paint = (ctx, X, Z, w) => {
    if (!GPS.target) return;
    if (GPS.path && GPS.path.length > 1) {
      ctx.save(); ctx.strokeStyle = '#c061ff'; ctx.lineWidth = w; ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath();
      GPS.path.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)))); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#c061ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(GPS.target.x), Z(GPS.target.z), w + 3, 0, 7); ctx.fill(); ctx.stroke();
  };
  GPS.reset = () => { GPS.target = null; GPS.path = null; if (GPS.mesh) { ML.scene.remove(GPS.mesh); GPS.mesh = null; } if (GPS.beacon) ML.scene.remove(GPS.beacon); };
})();
