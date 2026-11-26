/* =====================================================================
   gps.js — GPS (V4.1, portage V5) : côté joueur, personnel, rien sur le réseau.
   Objectif suivi :
   - REPÈRE posé à la main : clic sur la grande carte (M) ; clic droit = effacer ;
   - sinon AUTOMATIQUE : caisse à livrer en main (ou dans la benne du véhicule
     qu'on conduit) → quai du client ; étape TTH / fonderie / chaudronnerie →
     le sous-traitant ; brut qui attend chez le fondeur → le fondeur.
   Trajet : plus court chemin (Dijkstra) sur le graphe des rues de la ville
   (ML.World.city.nodes / edges), depuis le point de route le plus proche.
   Affichage : ruban violet au sol (hauteur du relief, ponts compris),
   trajet + repère sur la mini-carte et la grande carte (hud.js appelle
   GPS.paint), petite flèche + distance en haut de l'écran.
   API : GPS.set(x, z, label) · GPS.clear() · GPS.update(dt) (hud.js, chaque
   image) · GPS.paint(ctx, X, Z, big) · GPS.reset().
   ===================================================================== */
(function () {
  const GPS = ML.GPS = { target: null, manual: null, path: null, dist: 0, t: 0, autoT: 0, from: null, mesh: null, beacon: null, el: null, S: null };
  const H = (x, z) => (ML.Terrain && ML.Terrain.h ? ML.Terrain.h(x, z) || 0 : 0);
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
    return { d: Math.hypot(px - ax - t * dx, pz - az - t * dz), x: ax + t * dx, z: az + t * dz };
  };
  /** point de route le plus proche : { e (arête), x, z, d } */
  function snap(city, x, z) {
    let best = null; const N = city.nodes;
    city.edges.forEach((e, i) => { const A = N[e.a], B = N[e.b]; if (!A || !B) return; const r = segDist(x, z, A.x, A.z, B.x, B.z); if (!best || r.d < best.d) best = { e: i, x: r.x, z: r.z, d: r.d }; });
    return best;
  }
  function adjOf(city) {
    if (GPS._city === city) return GPS._adj;
    const adj = city.nodes.map(() => []);
    city.edges.forEach(e => { if (adj[e.a] && adj[e.b]) { const w = e.len || Math.hypot(city.nodes[e.a].x - city.nodes[e.b].x, city.nodes[e.a].z - city.nodes[e.b].z); adj[e.a].push([e.b, w]); adj[e.b].push([e.a, w]); } });
    GPS._city = city; GPS._adj = adj; return adj;
  }
  /** Plus court chemin par les rues entre deux positions → liste de points {x, z} */
  GPS.route = (x0, z0, x1, z1) => {
    const city = ML.World && ML.World.city; if (!city || !city.nodes) return null;
    if (Math.hypot(x1 - x0, z1 - z0) < 45) return [{ x: x0, z: z0 }, { x: x1, z: z1 }];          // tout près : tout droit
    const N = city.nodes, E = city.edges, a = snap(city, x0, z0), b = snap(city, x1, z1); if (!a || !b) return null;
    const pts = [{ x: x0, z: z0 }, { x: a.x, z: a.z }];
    if (a.e === b.e) { pts.push({ x: b.x, z: b.z }, { x: x1, z: z1 }); return pts; }
    const adj = adjOf(city), n = N.length, d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const ea = E[a.e], eb = E[b.e];
    for (const s of [ea.a, ea.b]) d[s] = Math.hypot(N[s].x - a.x, N[s].z - a.z);
    const goal = new Set([eb.a, eb.b]); let left = 2;
    for (;;) {                                                     // Dijkstra (≈ 800 nœuds : le balayage linéaire suffit)
      let u = -1, du = Infinity; for (let i = 0; i < n; i++) if (!done[i] && d[i] < du) { du = d[i]; u = i; }
      if (u < 0) break; done[u] = 1; if (goal.has(u) && --left <= 0) break;
      for (const [v, w] of adj[u]) if (du + w < d[v]) { d[v] = du + w; prev[v] = u; }
    }
    const end = [eb.a, eb.b].map(i => [i, d[i] + Math.hypot(N[i].x - b.x, N[i].z - b.z)]).sort((p, q) => p[1] - q[1])[0];
    if (!end || !isFinite(end[1])) return [{ x: x0, z: z0 }, { x: x1, z: z1 }];
    const chain = []; for (let i = end[0]; i >= 0; i = prev[i]) chain.unshift(i);
    for (const i of chain) pts.push({ x: N[i].x, z: N[i].z });
    pts.push({ x: b.x, z: b.z }, { x: x1, z: z1 });
    return pts;
  };

  /* ---------- objectif ---------- */
  GPS.set = (x, z, label) => { GPS.manual = { x, z, label: label || '📍 Repère' }; GPS.t = 0; GPS.from = null; if (ML.Sfx) ML.Sfx.play('bip'); };
  GPS.clear = () => { GPS.manual = null; GPS.target = null; GPS.path = null; GPS.draw(); };
  GPS.myPos = () => {
    const G = ML.Game, c = G.p.car !== null && G.p.car !== undefined ? ML.Cars.list[G.p.car] : null;
    return c ? { x: c.pos.x, z: c.pos.z, f: c.h, car: true } : { x: G.p.pos.x, z: G.p.pos.z, f: G.p.yaw + Math.PI, car: false };
  };
  const dock = k => { const L = ML.LOC && ML.LOC.comp && ML.LOC.comp[k]; return L ? (L.dock || L) : null; };
  /** objectif automatique d'après ce qu'on transporte */
  function autoTarget(S, me) {
    const G = ML.Game, P = S.pl[G.me]; if (!P) return null;
    const items = P.inv.filter(Boolean).concat(P.car !== null && P.car !== undefined && S.cars[P.car] ? S.cars[P.car].bed || [] : []);
    let best = null;
    const consider = (k, label) => { const D = dock(k); if (!D) return; const dd = Math.hypot(D.x - me.x, D.z - me.z); if (!best || dd < best.dd) best = { x: D.x, z: D.z, label, dd }; };
    for (const it of items) {
      if (!it.d || !it.d.oid) continue;
      const o = S.orders.find(x => x.id === it.d.oid); if (!o) continue;
      const st = o.steps[o.si], C = ML.COMPANIES;
      if (st === 'livraison' && C[o.client] && dock(o.client)) consider(o.client, `📦 #${o.id} → ${C[o.client].name}`);
      else if ((st === 'tth' || st === 'fonderie' || st === 'chaudro') && C[st]) consider(st, `🔥 #${o.id} → ${C[st].name}`);
    }
    return best;
  }

  /* ---------- rendu 3D : ruban au sol + colonne de lumière ---------- */
  GPS.draw = () => {
    if (GPS.mesh) { ML.scene.remove(GPS.mesh); GPS.mesh.geometry.dispose(); GPS.mesh = null; }
    if (!GPS.path || !GPS.target || !ML.scene) { if (GPS.beacon) GPS.beacon.visible = false; return; }
    const v = [], W = 0.7, P = GPS.path;
    for (let i = 0; i < P.length - 1; i++) {
      const A = P[i], B = P[i + 1], L = Math.hypot(B.x - A.x, B.z - A.z); if (L < 0.5) continue;
      const nx = -(B.z - A.z) / L * W, nz = (B.x - A.x) / L * W, k = Math.max(1, Math.ceil(L / 6));
      for (let j = 0; j < k; j++) {                                  // découpé tous les 6 m pour suivre le relief
        const t0 = j / k, t1 = (j + 1) / k, ax = A.x + (B.x - A.x) * t0, az = A.z + (B.z - A.z) * t0, bx = A.x + (B.x - A.x) * t1, bz = A.z + (B.z - A.z) * t1;
        const ya = H(ax, az) + 0.14, yb = H(bx, bz) + 0.14;
        v.push(ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz, ax - nx, ya, az - nz, bx - nx, yb, bz - nz, bx + nx, yb, bz + nz);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    GPS.mesh = new THREE.Mesh(g, GPS._mat || (GPS._mat = new THREE.MeshBasicMaterial({ color: 0xc061ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })));
    GPS.mesh.renderOrder = 2; GPS.mesh.frustumCulled = false; ML.scene.add(GPS.mesh);
    if (!GPS.beacon) GPS.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xc061ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    if (GPS.beacon.parent !== ML.scene) ML.scene.add(GPS.beacon);
    GPS.beacon.position.set(GPS.target.x, H(GPS.target.x, GPS.target.z) + 20, GPS.target.z); GPS.beacon.visible = true;
  };
  /** petit bandeau : flèche + distance */
  function hudEl() {
    if (GPS.el && GPS.el.isConnected) return GPS.el;
    const root = document.getElementById('hud'); if (!root) return null;
    const el = document.createElement('div'); el.id = 'gps-hud';
    el.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:4px 12px 4px 6px;border-radius:18px;background:rgba(34,38,45,.82);border:2px solid #c061ff;color:#fff;font:700 14px "Segoe UI",Arial,sans-serif;pointer-events:none;z-index:5;white-space:nowrap';
    el.innerHTML = '<span class="ar" style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;font-size:18px;color:#e9c7ff">▲</span><span class="tx"></span>';
    root.appendChild(el); GPS.el = el; return el;
  }
  const fmtD = m => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m');

  /** À chaque image (hud.js) : objectif, trajet (recalculé de temps en temps), flèche */
  GPS.update = dt => {
    const G = ML.Game, S = G && G.S;
    if (!S || !G.on || !ML.World || !ML.World.city) { if (GPS.S) GPS.reset(); return; }
    if (GPS.S !== ML.World.city) { GPS.reset(); GPS.S = ML.World.city; }   // nouvelle partie (G.S, lui, change à chaque instantané)
    const me = GPS.myPos();
    GPS.autoT -= dt;
    if (GPS.autoT <= 0) { GPS.autoT = 0.5; GPS.auto = GPS.manual ? null : autoTarget(S, me); }
    const T = GPS.manual || GPS.auto || null;
    if (!T) { if (GPS.target) { GPS.target = null; GPS.path = null; GPS.draw(); } const e = hudEl(); if (e) e.style.display = 'none'; return; }
    const left = Math.hypot(T.x - me.x, T.z - me.z);
    if (GPS.manual && left < 10) { if (ML.HUD) ML.HUD.notify('📍 Tu es arrivé au repère !', 'good'); GPS.clear(); return; }
    const changed = !GPS.target || GPS.target.x !== T.x || GPS.target.z !== T.z;
    GPS.target = T; GPS.t -= dt;
    if (changed || GPS.t <= 0 || !GPS.from || Math.hypot(GPS.from.x - me.x, GPS.from.z - me.z) > 8) {
      GPS.t = 1.2; GPS.from = { x: me.x, z: me.z };
      GPS.path = GPS.route(me.x, me.z, T.x, T.z);
      GPS.dist = 0; if (GPS.path) for (let i = 0; i < GPS.path.length - 1; i++) GPS.dist += Math.hypot(GPS.path[i + 1].x - GPS.path[i].x, GPS.path[i + 1].z - GPS.path[i].z);
      GPS.draw();
    }
    if (GPS.beacon) GPS.beacon.material.opacity = 0.2 + Math.sin(performance.now() / 300) * 0.07;
    // flèche : vers un point du trajet ~15 m devant
    const e = hudEl(); if (!e) return;
    let aim = T; if (GPS.path) { let acc = 0; for (let i = 1; i < GPS.path.length; i++) { acc += Math.hypot(GPS.path[i].x - GPS.path[i - 1].x, GPS.path[i].z - GPS.path[i - 1].z); aim = GPS.path[i]; if (acc > 15 && Math.hypot(aim.x - me.x, aim.z - me.z) > 6) break; } }
    const dx = aim.x - me.x, dz = aim.z - me.z, fx = Math.sin(me.f), fz = Math.cos(me.f), rx = -fz, rz = fx;
    const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz) * 180 / Math.PI;
    e.style.display = ML.ui && ML.ui.modal === 'map' ? 'none' : 'flex';
    e.querySelector('.ar').style.transform = `rotate(${ang.toFixed(0)}deg)`;
    const tx = `${T.label || '📍'} · ${fmtD(GPS.dist || left)}`; if (tx !== GPS._tx) { e.querySelector('.tx').textContent = tx; GPS._tx = tx; }
  };
  /** Trace le trajet et le repère sur un canvas 2D (X, Z : monde → pixels) */
  GPS.paint = (ctx, X, Z, big) => {
    if (!GPS.target) return;
    const w = big ? 4 : 2.6;
    if (GPS.path && GPS.path.length > 1) {
      ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
      for (const [col, lw] of [['#22262d', w + 2.5], ['#c061ff', w]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); GPS.path.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)))); ctx.stroke(); }
      ctx.restore();
    }
    ctx.fillStyle = '#c061ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(GPS.target.x), Z(GPS.target.z), w + 2.5, 0, 7); ctx.fill(); ctx.stroke();
    if (big) { ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; const t = `${GPS.target.label || '📍'} · ${fmtD(GPS.dist)}`; ctx.strokeText(t, X(GPS.target.x), Z(GPS.target.z) - 14); ctx.fillStyle = '#e9c7ff'; ctx.fillText(t, X(GPS.target.x), Z(GPS.target.z) - 14); }
  };
  GPS.reset = () => {
    GPS.target = GPS.manual = GPS.auto = GPS.path = null; GPS.S = null; GPS._tx = null;
    if (GPS.mesh && ML.scene) { ML.scene.remove(GPS.mesh); GPS.mesh.geometry.dispose(); GPS.mesh = null; }
    if (GPS.beacon && ML.scene) ML.scene.remove(GPS.beacon);
    if (GPS.el) GPS.el.style.display = 'none';
  };
})();
