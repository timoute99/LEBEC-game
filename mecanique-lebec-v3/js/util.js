/* =====================================================================
   util.js — Outils communs : aléatoire (avec graine), maths, primitives
   3D, collisions 2D (cercles contre boîtes), étiquettes flottantes.
   ===================================================================== */
(function () {
  const U = ML.U = {};
  ML.colliders = [];

  /* ---------- Aléatoire ---------- */
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = a => a[Math.floor(Math.random() * a.length)];
  U.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /** Générateur pseudo-aléatoire déterministe (mulberry32) : même graine = même suite */
  U.rng = seed => {
    let s = seed >>> 0;
    const f = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = (a, b) => a + f() * (b - a);
    f.pick = a => a[Math.floor(f() * a.length)];
    return f;
  };

  /* ---------- Maths ---------- */
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * U.clamp(t, 0, 1); };
  U.d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  U.fmt = min => { const m = ((min % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0'); };
  U.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Matériaux & primitives ---------- */
  const mats = {};
  U.mat = (color, emissive) => {
    const k = color + '_' + (emissive || 0);
    return mats[k] || (mats[k] = new THREE.MeshLambertMaterial({ color, emissive: emissive || 0 }));
  };
  U.box = (w, h, d, mat, x, y, z, parent, shadow) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? U.mat(mat) : mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    if (parent) parent.add(m);
    return m;
  };
  U.cyl = (rt, rb, h, mat, x, y, z, parent, seg) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), typeof mat === 'number' ? U.mat(mat) : mat);
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  };
  U.plane = (w, d, mat, x, z, y, parent) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof mat === 'number' ? U.mat(mat) : mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y || 0.01, z); m.receiveShadow = true;
    (parent || ML.scene).add(m);
    return m;
  };

  /* ---------- Collisions ---------- */
  U.addCollider = (minX, maxX, minZ, maxZ, tag) => { const c = { minX, maxX, minZ, maxZ, tag }; ML.colliders.push(c); return c; };
  U.boxCollider = (cx, cz, w, d, tag) => U.addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, tag);
  /** Repousse le cercle (p, r) hors des boîtes. Renvoie true s'il y a eu contact. */
  U.resolveCircle = (p, r) => {
    let hit = false;
    for (const c of ML.colliders) {
      if (p.x < c.minX - r || p.x > c.maxX + r || p.z < c.minZ - r || p.z > c.maxZ + r) continue;
      const nx = U.clamp(p.x, c.minX, c.maxX), nz = U.clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - nx, dz = p.z - nz, dd = dx * dx + dz * dz;
      if (dd >= r * r) continue;
      hit = true;
      if (dd > 1e-8) { const d = Math.sqrt(dd); p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r; }
      else {
        const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z, m = Math.min(l, rr, t, b);
        if (m === l) p.x = c.minX - r; else if (m === rr) p.x = c.maxX + r; else if (m === t) p.z = c.minZ - r; else p.z = c.maxZ + r;
      }
    }
    return hit;
  };
  U.inCollider = (x, z, pad) => { pad = pad || 0; for (const c of ML.colliders) if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true; return false; };
  U.inWorkshop = p => p.x > -20 && p.x < 20 && p.z > -14 && p.z < 14;

  /* ---------- Étiquettes flottantes (sprite, canvas de taille fixe) ---------- */
  U.label = (text, opt) => {
    opt = opt || {};
    const W = 512, H = 96, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opt.depthTest !== false }));
    const size = opt.size || 0.3; sp.scale.set(size * W / H, size, 1); sp.renderOrder = 10;
    sp.setText = function (t, fg, bg) {
      fg = fg || opt.color || '#fff'; bg = bg || opt.bg || 'rgba(10,12,18,0.72)';
      const k = t + '|' + fg + '|' + bg; if (k === this._k) return; this._k = k;
      ctx.clearRect(0, 0, W, H); this.visible = !!t;
      if (t) {
        let fs = opt.fontSize || 46; ctx.font = 'bold ' + fs + 'px Arial';
        let w = ctx.measureText(t).width;
        while (w > W - 36 && fs > 14) { fs -= 2; ctx.font = 'bold ' + fs + 'px Arial'; w = ctx.measureText(t).width; }
        const bw = w + 30, bh = fs + 26, bx = (W - bw) / 2, by = (H - bh) / 2, r = 14;
        ctx.fillStyle = bg; ctx.beginPath();
        ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by); ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
        ctx.lineTo(bx + bw, by + bh - r); ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
        ctx.lineTo(bx + r, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
        ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by); ctx.fill();
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, W / 2, H / 2 + 2);
      }
      tex.needsUpdate = true;
    };
    sp.setText(text || '');
    return sp;
  };
})();
