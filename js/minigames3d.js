/* =====================================================================
   minigames3d.js — MINI-JEUX D'USINAGE EN 3D (ML.Mini3D)
   Une fenêtre par-dessus le jeu avec SON PROPRE petit moteur 3D (un seul
   WebGLRenderer réutilisé, une scène jetable par partie), style toon.
   Le jeu continue derrière (coop !). Échap = abandon = 'fail'.

   API :
     ML.Mini3D.open(kind, opts, cb)  → lance un mini-jeu précis (tests)
         kind : chariot | tangent | contour | drill | tap | insert | measure | touret | chuck
         opts : { mtype:'tour'|'fraiseuse', tier 0..4, tool, size 's'|'m'|'l', mat, diff 0..1 }
         cb(res, score) : res = 'ok' (≥ 60) | 'meh' (40–59) | 'fail' (< 40 ou abandon)
     ML.Mini3D.machine(mid, held, phase, cb) → choisit le mini-jeu selon le contexte
         phase 'load' (brut / en-cours posé : réglage CN), 'worn' (outil usé à changer)
         ou 'pilot' (joueur aux commandes d'une machine MANUELLE : mini-jeu de l'op de gamme, ML.OPS[op].mg)
     ML.Mini3D.pick(ctx) / context(mid, held, phase) : règles de sélection
     ML.Mini3D.update() : appelé à chaque image par ML.Mini.update (minigames.js)
     ML.Mini3D.forceClose() : fermeture sans rappel (fin de partie…)

   Sélection : machines MANUELLES (tier 0–1) → le joueur usine vraiment
   (chariotage, contournage, perçage, taraudage) ; CN (tier ≥ 2) → réglages
   (tangentage, serrage) + contrôles aléatoires (pied à coulisse / micromètre).
   Outil usé : plaquette → changement de plaquette ; foret/fraise → touret.
   Jamais deux fois le même mini-jeu d'affilée (quand il y a le choix).
   ===================================================================== */
(function () {
  'use strict';
  const X = ML.Mini3D = { isOpen: false, last: null, ok: true };
  const PAL = ML.PAL, Sty = ML.Style;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const fmt = (v, d) => v.toFixed(d).replace('.', ',');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const sfx = (n, v) => { try { ML.Sfx.play(n, v); } catch (e) { /* muet */ } };
  const matCol = m => (ML.MATERIALS && ML.MATERIALS[m] ? ML.MATERIALS[m].color : PAL.steel);
  const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  let R = null, dom = null, st = null, pool = null;
  const GAMES = X.GAMES = {};
  const inp = { mx: 0, my: 0, px: 0, py: 0, down: false, rdown: false, click: false, rclick: false, wheel: 0, keys: {}, kp: {}, moved: 0 };
  const key = (...c) => c.some(k => inp.keys[k]);
  const hit = (...c) => c.some(k => inp.kp[k]);
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

  /* ======================= DOM + entrées ======================= */
  function ensureDom() {
    if (dom) return dom;
    const root = el('div', 'hidden'); root.id = 'm3d';
    root.innerHTML = `<div class="m3-box"><div class="m3-head"><span class="m3-title"></span><span class="m3-score"></span></div>
      <div class="m3-stage"><div class="m3-layer"></div><div class="m3-pops"></div><div class="m3-big"></div><div class="m3-flash"></div></div>
      <div class="m3-timer"><i></i></div><div class="m3-info"></div><div class="m3-hint"></div></div>`;
    document.body.appendChild(root);
    const q = s => root.querySelector(s);
    dom = { root, stage: q('.m3-stage'), layer: q('.m3-layer'), pops: q('.m3-pops'), big: q('.m3-big'), flash: q('.m3-flash'), title: q('.m3-title'), score: q('.m3-score'), timer: q('.m3-timer i'), info: q('.m3-info'), hint: q('.m3-hint') };
    const pos = e => {
      const r = (R ? R.domElement : dom.stage).getBoundingClientRect();
      inp.px = e.clientX - r.left; inp.py = e.clientY - r.top;
      inp.mx = clamp(inp.px / r.width * 2 - 1, -1.3, 1.3); inp.my = clamp(-(inp.py / r.height * 2 - 1), -1.3, 1.3);
    };
    root.addEventListener('pointermove', e => { if (!X.isOpen) return; pos(e); inp.moved = performance.now(); });
    root.addEventListener('pointerdown', e => {
      if (!X.isOpen) return; pos(e);
      if (e.target.closest && e.target.closest('.m3-btn')) return;
      if (e.button === 0) { inp.down = true; inp.click = true; } if (e.button === 2) { inp.rdown = true; inp.rclick = true; }
      e.preventDefault();
    });
    window.addEventListener('pointerup', e => { if (e.button === 0) inp.down = false; if (e.button === 2) inp.rdown = false; });
    root.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('wheel', e => { if (!X.isOpen) return; inp.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // capture : le jeu ne voit pas les touches pendant le mini-jeu
    window.addEventListener('keydown', e => {
      if (!X.isOpen) return;
      if (!e.repeat) inp.kp[e.code] = true; inp.keys[e.code] = true;
      if (/^(Space|Tab|Arrow|Enter)/.test(e.code)) e.preventDefault();
      e.stopPropagation();
    }, true);
    window.addEventListener('keyup', e => { inp.keys[e.code] = false; }, true);
    window.addEventListener('blur', () => { inp.keys = {}; inp.down = inp.rdown = false; });
    return dom;
  }
  function ensureR() {
    if (R) return R;
    R = new THREE.WebGLRenderer({ antialias: true });
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    R.domElement.className = 'm3-cv';
    dom.stage.insertBefore(R.domElement, dom.stage.firstChild);
    return R;
  }

  /* ======================= Particules (réserve partagée) ======================= */
  function ensurePool() {
    if (pool) return pool;
    const g = new THREE.Group();
    const geo = {
      chip: new THREE.TorusGeometry(0.06, 0.016, 3, 7, Math.PI * 1.5), spark: new THREE.BoxGeometry(0.022, 0.022, 0.13),
      smoke: new THREE.IcosahedronGeometry(0.12, 0), drop: new THREE.IcosahedronGeometry(0.035, 0), bit: new THREE.BoxGeometry(0.06, 0.06, 0.06)
    };
    const mat = {
      spark: new THREE.MeshBasicMaterial({ color: 0xffd36a }), spark2: new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
      smoke: new THREE.MeshBasicMaterial({ color: 0xe9e9e9, transparent: true, opacity: 0.42, depthWrite: false }),
      steam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
      drop: new THREE.MeshBasicMaterial({ color: 0x7fd3ff }), oil: new THREE.MeshBasicMaterial({ color: 0xd9a21b })
    };
    const list = [];
    for (let i = 0; i < 280; i++) { const m = new THREE.Mesh(geo.chip, mat.spark); m.visible = false; m.frustumCulled = false; g.add(m); list.push({ m, v: new THREE.Vector3(), life: 0, max: 1, spin: new THREE.Vector3(), grav: 9, kind: '', s0: 1 }); }
    pool = { g, geo, mat, list, i: 0 };
    return pool;
  }
  /** kind : chip | bit | spark | spark2 | smoke | steam | drop | oil */
  function emit(kind, p, n, o) {
    o = o || {}; const P = ensurePool();
    for (let k = 0; k < n; k++) {
      const q = P.list[P.i]; P.i = (P.i + 1) % P.list.length;
      const m = q.m; q.kind = kind;
      m.geometry = P.geo[kind === 'spark2' ? 'spark' : kind === 'steam' ? 'smoke' : kind === 'oil' ? 'drop' : kind];
      m.material = kind === 'chip' || kind === 'bit' ? Sty.toon(o.color || PAL.steel) : P.mat[kind];
      const j = o.jit === undefined ? 0.05 : o.jit, sp = o.spread === undefined ? 1 : o.spread, v = o.vel || { x: 0, y: 1, z: 0 };
      m.position.set(p.x + (Math.random() - 0.5) * j, p.y + (Math.random() - 0.5) * j, p.z + (Math.random() - 0.5) * j);
      q.v.set(v.x + (Math.random() - 0.5) * 2 * sp, v.y + (Math.random() - 0.5) * 2 * sp, v.z + (Math.random() - 0.5) * 2 * sp);
      q.life = q.max = (o.life || 0.8) * rnd(0.6, 1.3);
      q.grav = o.grav !== undefined ? o.grav : (kind === 'smoke' || kind === 'steam' ? -0.8 : 9);
      q.spin.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14));
      q.s0 = (o.size || 1) * rnd(0.7, 1.3); m.scale.setScalar(q.s0); m.rotation.set(rnd(0, 6), rnd(0, 6), 0);
      m.visible = true;
    }
  }
  function stepPool(dt) {
    if (!pool) return;
    const fl = st ? st.floor : -50;
    for (const q of pool.list) {
      if (q.life <= 0) continue;
      q.life -= dt; const m = q.m;
      if (q.life <= 0) { m.visible = false; continue; }
      q.v.y -= q.grav * dt;
      const k = q.life / q.max;
      if (q.kind === 'smoke' || q.kind === 'steam') { q.v.multiplyScalar(1 - 1.6 * dt); m.position.addScaledVector(q.v, dt); m.scale.setScalar(q.s0 * (1 + (1 - k) * 2.6)); continue; }
      m.position.addScaledVector(q.v, dt);
      if (q.kind === 'spark' || q.kind === 'spark2') { tmpV2.copy(m.position).add(q.v); m.lookAt(tmpV2); m.scale.set(q.s0, q.s0, q.s0 * (0.4 + q.v.length() * 0.25) * Math.min(1, k * 2)); continue; }
      m.rotation.x += q.spin.x * dt; m.rotation.y += q.spin.y * dt; m.rotation.z += q.spin.z * dt;
      if (m.position.y < fl) { m.position.y = fl; q.v.y *= -0.3; q.v.x *= 0.5; q.v.z *= 0.5; q.spin.multiplyScalar(0.5); }
      m.scale.setScalar(q.s0 * Math.min(1, k * 3));
    }
  }

  /* ======================= Aides scène / HUD ======================= */
  const G_ = g => { st.geos.push(g); return g; };
  const M_ = m => { st.mats.push(m); return m; };
  function mesh(geo, mat, parent, x, y, z) { const m = new THREE.Mesh(geo, typeof mat === 'number' ? Sty.toon(mat) : mat); m.position.set(x || 0, y || 0, z || 0); (parent || st.scene).add(m); return m; }
  const box = (w, h, d, c, x, y, z, par, r) => Sty.box(w, h, d, typeof c === 'number' ? Sty.toon(c) : c, x, y, z, par || st.scene, r);
  const cyl = (rt, rb, h, c, seg, par, x, y, z) => mesh(G_(new THREE.CylinderGeometry(rt, rb, h, seg || 20)), c, par, x, y, z);
  const flat = c => Sty.toon(c, 0, { flat: true });
  function tex(canvas) { const t = new THREE.CanvasTexture(canvas); t.anisotropy = R.capabilities.getMaxAnisotropy ? R.capabilities.getMaxAnisotropy() : 4; st.texs.push(t); return t; }
  /** Ruban plat le long d'une polyligne. plane 'xy' (z fixe) ou 'xz' (y fixe). top : dessiné par-dessus tout */
  function ribbon(pts, th, color, plane, top, parent) {
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (plane === 'xz') {
        const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, nx = -dz / L * th / 2, nz = dx / L * th / 2, ex = dx / L * th / 2, ez = dz / L * th / 2;
        const A = [a[0] - ex, a[1], a[2] - ez], B = [b[0] + ex, b[1], b[2] + ez];
        pos.push(A[0] + nx, A[1], A[2] + nz, A[0] - nx, A[1], A[2] - nz, B[0] - nx, B[1], B[2] - nz, A[0] + nx, A[1], A[2] + nz, B[0] - nx, B[1], B[2] - nz, B[0] + nx, B[1], B[2] + nz);
      } else {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * th / 2, ny = dx / L * th / 2, ex = dx / L * th / 2, ey = dy / L * th / 2;
        const A = [a[0] - ex, a[1] - ey, a[2]], B = [b[0] + ex, b[1] + ey, b[2]];
        pos.push(A[0] + nx, A[1] + ny, A[2], A[0] - nx, A[1] - ny, A[2], B[0] - nx, B[1] - ny, B[2], A[0] + nx, A[1] + ny, A[2], B[0] - nx, B[1] - ny, B[2], B[0] + nx, B[1] + ny, B[2]);
      }
    }
    const g = G_(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, M_(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: !top, transparent: !!top, opacity: top ? 0.9 : 1 })));
    if (top) m.renderOrder = 20; (parent || st.scene).add(m); return m;
  }
  function toScreen(v) { tmpV.copy(v).project(st.cam); return { x: (tmpV.x + 1) / 2 * st.w, y: (1 - tmpV.y) / 2 * st.h }; }
  function pop(text, cls, at) {
    let x = st.w / 2, y = st.h * 0.3;
    if (at && at.isVector3) { const s = toScreen(at); x = s.x; y = s.y; } else if (at) { x = at.x; y = at.y; }
    const e = el('div', 'm3-pop ' + (cls || ''), text); e.style.left = x + 'px'; e.style.top = y + 'px'; dom.pops.appendChild(e);
    setTimeout(() => e.remove(), 1100);
  }
  function big(html, cls) { dom.big.className = 'm3-big'; void dom.big.offsetWidth; dom.big.className = 'm3-big show ' + (cls || ''); dom.big.innerHTML = html; }
  function flash(col) { dom.flash.style.background = col; dom.flash.classList.remove('go'); void dom.flash.offsetWidth; dom.flash.classList.add('go'); }
  const shake = a => { st.shake = Math.max(st.shake, a); };
  const cool = (k, sec) => { if ((st.cool[k] || -1) > st.t) return false; st.cool[k] = st.t + sec; return true; };
  const live = html => { dom.score.innerHTML = html; };
  /** Jauge horizontale du HUD : set(v 0..1, texte), zone(a,b), zone2(a,b) */
  function gauge(label, cls) {
    const e = el('div', 'm3-g ' + (cls || ''), `<span>${label}</span><div class="t"><i class="z2"></i><i class="z"></i><b></b></div><em></em>`);
    dom.layer.appendChild(e);
    const z = e.querySelector('.z'), z2 = e.querySelector('.z2'), b = e.querySelector('b'), em = e.querySelector('em');
    return {
      el: e,
      set(v, txt) { b.style.left = clamp(v, 0, 1) * 100 + '%'; if (txt !== undefined) em.innerHTML = txt; },
      zone(a, c) { z.style.left = clamp(a, 0, 1) * 100 + '%'; z.style.width = Math.max(0, clamp(c, 0, 1) - clamp(a, 0, 1)) * 100 + '%'; },
      zone2(a, c) { z2.style.left = clamp(a, 0, 1) * 100 + '%'; z2.style.width = Math.max(0, clamp(c, 0, 1) - clamp(a, 0, 1)) * 100 + '%'; }
    };
  }
  function tag(html, cls) { const e = el('div', 'm3-tag ' + (cls || ''), html); dom.layer.appendChild(e); return e; }
  /** Son continu (moteur, sifflement) branché sur le contexte audio du jeu */
  function hum(type, f, vol, filt) {
    const S = ML.Sfx, h = { set() {}, stop() {} };
    if (!S || !S.ctx || S.muted) return h;
    try {
      const c = S.ctx, o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = type || 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = filt || 1800; g.gain.value = 0;
      o.connect(fl); fl.connect(g); g.connect(S.master); o.start();
      h.set = (fr, v) => { const t = c.currentTime; if (fr) o.frequency.setTargetAtTime(fr, t, 0.04); if (v !== undefined && v !== null) g.gain.setTargetAtTime(v, t, 0.05); };
      h.stop = () => { try { g.gain.setTargetAtTime(0, c.currentTime, 0.03); o.stop(c.currentTime + 0.25); } catch (e) { /* déjà arrêté */ } };
      st.hums.push(h); h.set(null, vol || 0);
    } catch (e) { /* pas de son */ }
    return h;
  }

  /* ======================= Cycle de vie ======================= */
  X.open = (kind, opts, cb) => {
    if (X.isOpen || (ML.Mini && ML.Mini.open)) return false;
    const g = GAMES[kind]; if (!g) return false;
    try { ensureDom(); ensureR(); ensurePool(); } catch (e) { X.ok = false; console.warn('Mini3D : WebGL indisponible', e); return false; }
    opts = Object.assign({ mtype: 'tour', tier: 1, tool: 'plaquette', size: 'm', mat: 'acier' }, opts || {});
    if (opts.diff === undefined) opts.diff = X.difficulty(opts);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x22324a);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a5e, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(3, 6, 5); scene.add(sun);
    scene.add(pool.g);
    const cam = new THREE.PerspectiveCamera(38, 1.6, 0.05, 80);
    st = { kind, g, opts, cb, scene, cam, t: 0, phase: 'intro', pt: 0, cd: 9, shake: 0, geos: [], mats: [], texs: [], hums: [], cool: {}, camBase: V(0, 2, 6), camLook: V(0, 0, 0), floor: -50, combo: 0, rust: opts.tier === 0, w: 0, h: 0, last: performance.now() };
    dom.layer.innerHTML = ''; dom.pops.innerHTML = ''; dom.score.innerHTML = ''; dom.big.className = 'm3-big'; dom.timer.style.width = '100%'; dom.timer.className = '';
    inp.kp = {}; inp.keys = {}; inp.click = inp.rclick = false; inp.wheel = 0; inp.down = inp.rdown = false;
    dom.root.classList.remove('hidden');
    resize();
    g.setup(st, opts);
    dom.title.textContent = st.title;
    dom.info.innerHTML = st.info + (st.rust && !st.noRust ? ' <span class="m3-rust">⚠ Vieille machine : jeu dans les manivelles, vibrations !</span>' : '');
    dom.hint.innerHTML = st.hint + ' · <kbd>Échap</kbd> abandonner';
    X.isOpen = true; X.last = kind;
    ML.ui.modal = 'mini3d';
    if (ML.Input) ML.Input.unlock();
    if (ML.HUD && ML.HUD.showPause) ML.HUD.showPause(false);
    if (ML.Sfx && ML.Sfx.init) ML.Sfx.init();
    return true;
  };
  function resize() {
    const w = dom.stage.clientWidth || 800, h = dom.stage.clientHeight || 480;
    if (w !== st.w || h !== st.h) { st.w = w; st.h = h; R.setSize(w, h); st.cam.aspect = w / h; st.cam.updateProjectionMatrix(); }
  }
  X.update = () => {
    if (!X.isOpen || !st) return;
    const now = performance.now(), dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
    resize();
    if (hit('Escape') && st.phase !== 'end') finish(0, 'Abandon… la pièce attendra.', true);
    if (st.phase === 'intro') {
      st.pt += dt; const n = 3 - Math.floor(st.pt / 0.45);
      if (n !== st.cd) { st.cd = n; if (n > 0) { big(String(n), 'cd'); sfx('bip'); } else { big('GO !', 'go'); sfx('order'); st.phase = 'play'; } }
      if (st.g.idle) st.g.idle(st, dt);
    } else if (st.phase === 'play') {
      st.t += dt;
      st.g.tick(st, dt);
      if (st.phase === 'play' && st.dur && st.t >= st.dur) { if (st.g.timeout) st.g.timeout(st); else finish(st.g.score(st), 'Temps écoulé !'); }
      const f = st.timeFrac !== undefined ? st.timeFrac : 1 - st.t / (st.dur || 1);
      dom.timer.style.width = clamp(f, 0, 1) * 100 + '%'; dom.timer.className = f < 0.25 ? 'low' : '';
    } else if (st.phase === 'end') {
      st.pt += dt; if (st.g.idle) st.g.idle(st, dt);
      if (st.pt > 2.1 || (st.pt > 0.7 && (hit('Space', 'Enter', 'KeyE') || inp.click))) { close(true); return; }
    }
    if (!st) return;
    stepPool(dt);
    st.shake *= Math.exp(-7 * dt);
    const s = st.shake;
    st.cam.position.copy(st.camBase); st.cam.position.x += rnd(-s, s); st.cam.position.y += rnd(-s, s); st.cam.position.z += rnd(-s, s) * 0.4;
    st.cam.lookAt(st.camLook);
    R.render(st.scene, st.cam);
    inp.kp = {}; inp.click = inp.rclick = false; inp.wheel = 0;
  };
  function finish(score, msg, abandon) {
    if (!st || st.phase === 'end') return;
    score = Math.round(clamp(score || 0, 0, 100)); st.final = score;
    st.res = abandon ? 'fail' : score >= 60 ? 'ok' : score >= 40 ? 'meh' : 'fail';
    st.phase = 'end'; st.pt = 0; st.abandon = !!abandon;
    const lab = abandon ? 'ABANDON' : score >= 90 ? 'PARFAIT !' : score >= 60 ? 'BIEN JOUÉ !' : score >= 40 ? 'BOF… ÇA PASSE' : 'RATÉ !';
    const cls = abandon ? 'fail' : score >= 90 ? 'perfect' : st.res;
    const ph = st.opts && st.opts.phase;
    const effect = (ph === 'pilot' ? { ok: 'Opération terminée ✔ qualité ↑', meh: 'À moitié fait… qualité moyenne.', fail: 'Ça broute : risque de REBUT !' }
      : ph === 'worn' ? { ok: 'Outil neuf monté ✔', meh: 'Monté… à peu près.', fail: 'Raté : il faudra recommencer.' }
      : { ok: 'Réglage au poil : plus rapide, qualité ↑', meh: 'Réglage moyen : qualité moyenne.', fail: 'Réglage raté : qualité en baisse, risque de rebut…' })[st.res];
    big(`<b>${lab}</b><span>${score}<small>/100</small></span><i>${msg || ''}</i><u>${effect}</u>`, 'res ' + cls);
    sfx(score >= 90 ? 'find' : st.res === 'ok' ? 'success' : st.res === 'meh' ? 'order' : 'fail');
    if (st.res === 'fail') flash('rgba(233,79,55,.4)'); else if (score >= 90) flash('rgba(255,201,60,.45)');
    st.hums.forEach(h => h.set(null, 0));
  }
  X.finish = (score, msg) => finish(score, msg);
  function close(withCb) {
    const s = st; if (!s) return;
    st = null; X.isOpen = false;
    dom.root.classList.add('hidden'); dom.layer.innerHTML = ''; dom.pops.innerHTML = '';
    s.hums.forEach(h => h.stop());
    if (pool) { pool.list.forEach(q => { q.life = 0; q.m.visible = false; }); s.scene.remove(pool.g); }
    try { if (s.g.dispose) s.g.dispose(s); } catch (e) { /* rien */ }
    s.geos.forEach(g => g.dispose()); s.mats.forEach(m => m.dispose()); s.texs.forEach(t => t.dispose());
    if (R && R.renderLists) R.renderLists.dispose();
    if (ML.ui.modal === 'mini3d') ML.ui.modal = null;
    if (withCb && ML.Game && ML.Game.on && ML.Input) ML.Input.lock();
    if (withCb && s.cb) {
      if (s.final >= 90 && s.res === 'ok' && ML.HUD && ML.HUD.notify) ML.HUD.notify(`⭐ PARFAIT (${s.final}/100) : travail d'orfèvre !`, 'good');
      s.cb(s.res, s.final, s.abandon);
    }
  }
  X.forceClose = () => { if (X.isOpen && st) close(false); };

  /* ======================= Sélection selon le contexte ======================= */
  X.difficulty = o => clamp(0.35 + ({ s: -0.1, m: 0, l: 0.2 }[o.size] || 0) + (o.tier === 0 ? 0.15 : o.tier >= 3 ? -0.1 : 0) + (o.mat === 'inox' ? 0.1 : o.mat === 'alu' ? -0.05 : 0), 0, 1);
  X.context = (mid, held, phase) => {
    const G = ML.Game, S = G && G.S, def = (ML.MACHINES || []).find(m => m.id === mid) || {}, M = S && S.machines ? S.machines[mid] : null;
    let tool = null, size = 'm', mat = 'acier', mg = null;
    try {
      if (phase === 'worn' || phase === 'pilot') {                // outil usé / pilotage d'une machine manuelle : l'op en cours
        tool = M && M.job ? M.job.need : null;
        const o = M && M.job && S.orders ? S.orders.find(x => x.id === M.job.oid) : null; if (o) { size = o.size || 'm'; mat = o.mat || mat; }
        if (phase === 'pilot' && M && M.job && ML.OPS && ML.OPS[M.job.op]) mg = ML.OPS[M.job.op].mg;
      } else if (held) {
        const t = ML.Items.def(held); mat = (held.d && held.d.mat) || t.mat || mat;
        const o = ML.Rules && ML.Rules.orderFor ? ML.Rules.orderFor(mid, held) : held.type === 'brut_sp' ? S.orders.find(x => x.id === held.d.oid)
          : S.orders.filter(x => x.steps && x.steps[x.si] === 'usinage' && !x.src && !x.m && x.mat === mat && x.mtype === def.type).sort((p, q) => p.dl - q.dl)[0];
        if (o) { tool = o.tool; size = o.size || 'm'; mat = o.mat || mat; }
      }
    } catch (e) { /* contexte partiel */ }
    const tier = def.tier !== undefined ? def.tier : (/CN/.test(def.name || '') ? 2 : 1);
    const ctx = { mid, phase, mtype: def.type || 'tour', tier, tool: tool || (def.type === 'fraiseuse' ? 'fraise' : 'plaquette'), size, mat, mg, machName: def.name || mid };
    ctx.diff = X.difficulty(ctx);
    return ctx;
  };
  X.pick = ctx => {
    let prim, sec = null;
    if (ctx.phase === 'pilot') return ctx.mg && GAMES[ctx.mg] ? ctx.mg : ctx.tool === 'foret' ? 'drill' : ctx.mtype === 'fraiseuse' ? 'contour' : 'chariot';   // le mini-jeu DE l'opération
    if (ctx.phase === 'worn') prim = ctx.tool === 'plaquette' ? ['insert'] : ['touret'];
    else if (ctx.tier <= 1) {   // « les machines manuelles demandent un joueur aux commandes »
      prim = ctx.tool === 'foret' ? ['drill', 'tap'] : ctx.mtype === 'fraiseuse' ? ['contour'] : ['chariot'];
      sec = ['tangent', 'chuck'];
    } else {                    // CN : réglages + contrôles au hasard
      prim = Math.random() < 0.3 ? ['measure'] : ['tangent', 'chuck'];
      sec = ['measure', 'tangent', 'chuck'];
    }
    let c = prim.filter(k => k !== X.last);
    if (!c.length && sec) c = sec.filter(k => k !== X.last);
    if (!c.length) c = prim;
    return pick(c);
  };
  /** Point d'entrée de rules.js. Renvoie false si rien n'a été ouvert (repli 2D). */
  X.machine = (mid, held, phase, cb) => {
    const ctx = X.context(mid, held, phase), kind = X.pick(ctx);
    return X.open(kind, ctx, cb);
  };
  X.debug = () => st;
  /** Tests : avance d'un pas de temps forcé (onglet caché = pas de requestAnimationFrame) */
  X.step = dt => { if (st) { st.last = performance.now() - (dt || 1 / 60) * 1000; X.update(); } };
  X.input = inp;

  /* =====================================================================
     1. CHARIOTAGE AU TOUR (manuel)
     ===================================================================== */
  GAMES.chariot = {
    setup(s, o) {
      const col = matCol(o.mat);
      s.title = '🌀 Chariotage au tour' + (s.rust ? ' — Ernault 1974' : '');
      s.info = 'Le chariot avance tout seul : <b>souris ↕</b> = profondeur. Suis le <b class="g">profil vert</b> au plus près. <b>Clic / Espace</b> maintenu = avance rapide… mais ça <b>broute</b> !';
      s.hint = '<kbd>Souris ↕</kbd> ou <kbd>Z</kbd>/<kbd>S</kbd> profondeur · <kbd>Clic</kbd>/<kbd>Espace</kbd> avance rapide';
      s.dur = 17 + (o.size === 'l' ? 2 : 0);
      s.camBase.set(0.4, 2.0, 7.4); s.camLook.set(0.1, 0.15, 0); s.floor = -1.72;
      box(11, 0.5, 3, PAL.machineDark, 0, -2.0, 0);
      box(11, 0.2, 0.4, PAL.steelDark, 0, -1.65, -0.8); box(11, 0.2, 0.4, PAL.steelDark, 0, -1.65, 0.8);
      box(1.6, 3.6, 2.6, s.rust ? PAL.shutterGreen : PAL.lebecBlue, -5.0, 0, -0.2);
      const spin = s.spin = new THREE.Group(); s.scene.add(spin);
      const chk = cyl(1.55, 1.55, 0.9, flat(PAL.steelDark), 12, spin, -3.75, 0, 0); chk.rotation.z = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, j = box(0.55, 0.42, 0.42, PAL.steel, -3.05, Math.cos(a) * 1.2, Math.sin(a) * 1.2, spin); j.rotation.x = a; }
      const tp = cyl(0.04, 0.3, 0.6, PAL.steel, 12, s.scene, 3.3, 0, 0); tp.rotation.z = Math.PI / 2;
      box(1.4, 2.2, 2.0, s.rust ? PAL.shutterGreen : PAL.lebecBlue, 4.3, -0.5, -0.1);
      // profil cible : épaulements et chanfreins tirés au hasard
      const xs = 2.95, xe = -2.75; s.xEnd = xe;
      const k = Math.min(5, 3 + (o.diff > 0.45 ? 1 : 0) + (o.size === 'l' ? 1 : 0));
      let ws = []; for (let i = 0; i < k; i++) ws.push(rnd(0.7, 1.4)); const sw = ws.reduce((a, b) => a + b, 0); ws = ws.map(v => v / sw * (xs - xe));
      const secs = []; let x = xs, r = rnd(0.55, 0.78);
      for (let i = 0; i < k; i++) {
        if (i) { const pr = secs[i - 1].r; r = clamp(pr + (Math.random() < 0.7 ? 1 : -1) * rnd(0.12, 0.28), 0.5, 0.94); if (Math.abs(r - pr) < 0.1) r = pr + (pr < 0.8 ? 0.15 : -0.15); }
        secs.push({ a: x, b: x - ws[i], r, ch: i > 0 && Math.random() < 0.45 }); x -= ws[i];
      }
      const CH = 0.2, base = xx => { for (const q of secs) if (xx > q.b) return q.r; return secs[secs.length - 1].r; };
      s.tr = xx => {
        for (let i = 1; i < secs.length; i++) { const B = secs[i].a; if (secs[i].ch && Math.abs(xx - B) < CH) return lerp(secs[i - 1].r, secs[i].r, (B + CH - xx) / (2 * CH)); }
        let rr = base(xx); if (xx > xs - 0.15) rr -= (xx - (xs - 0.15)) * 0.9; return rr;
      };
      // pièce en tranches (facettes = on voit la rotation)
      const N = 90, x0 = -3.2, x1 = 3.0, w = (x1 - x0) / N; s.x0 = x0; s.sw = w;
      const g = G_(new THREE.CylinderGeometry(1, 1, w * 1.04, 14)); g.rotateZ(Math.PI / 2);
      const c = new THREE.Color(col);
      s.mRaw = flat(col); s.mGood = flat(c.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex());
      s.mShallow = flat(c.clone().lerp(new THREE.Color(PAL.orange), 0.5).getHex()); s.mBad = flat(c.clone().lerp(new THREE.Color(PAL.red), 0.75).getHex());
      s.slices = [];
      for (let i = 0; i < N; i++) { const xc = x0 + (i + 0.5) * w, m = new THREE.Mesh(g, s.mRaw); m.position.x = xc; spin.add(m); s.slices.push({ m, x: xc, r: 1, tgt: s.tr(xc), ev: xc <= xs + 0.03 && xc >= xe, sc: 0 }); }
      const pts = [], ptsB = []; for (let xx = xs + 0.04; xx >= xe - 0.001; xx -= 0.025) { pts.push([xx, s.tr(xx), 0]); ptsB.push([xx, -s.tr(xx), 0]); }
      ribbon(pts, 0.035, PAL.mint, 'xy', true); ribbon(ptsB, 0.035, PAL.mint, 'xy', true);
      // outil + chariot
      const tool = s.toolG = new THREE.Group(); s.scene.add(tool);
      const ins = box(0.3, 0.3, 0.12, PAL.lebecYellow, 0, 0.212, 0.05, tool, 0.02); ins.rotation.z = Math.PI / 4;
      box(0.34, 1.5, 0.34, PAL.steelDark, 0.16, 1.0, 0, tool);
      box(1.5, 0.45, 1.3, PAL.machine, 0.4, 1.9, 0, tool);
      const hw = s.hw = new THREE.Group(); hw.position.set(0.9, 1.9, 0.72); tool.add(hw);
      cyl(0.34, 0.34, 0.08, PAL.steel, 16, hw).rotation.x = Math.PI / 2;
      cyl(0.05, 0.05, 0.25, PAL.red, 8, hw, 0.24, 0, 0.14).rotation.x = Math.PI / 2;
      s.tx = xs + 0.3; s.tip = 1.12; s.cmd = 1.12; s.blp = 1.12; s.chat = 0; s.kbd = false; s.gouges = 0; s.tol = 0.052 - o.diff * 0.012;
      s.hMotor = hum('sawtooth', 62, 0.03, 420); s.hCut = hum('triangle', 760, 0, 2400);
      s.gD = gauge('PROFONDEUR <small>(outil ▼ / cote ▬)</small>'); s.tagF = tag('Avance : <b>LENTE</b>');
      tool.position.set(s.tx, s.tip, 0);
      live('Qualité —');
    },
    idle(s, dt) { s.spin.rotation.x += 16 * dt; },
    tick(s, dt) {
      const o = s.opts;
      s.spin.rotation.x += 16 * dt;
      if (key('KeyW', 'ArrowUp')) { s.cmd += 0.7 * dt; s.kbd = true; }
      if (key('KeyS', 'ArrowDown')) { s.cmd -= 0.7 * dt; s.kbd = true; }
      if (performance.now() - inp.moved < 80) s.kbd = false;
      if (!s.kbd) s.cmd = lerp(0.42, 1.22, (clamp(inp.my, -1, 1) + 1) / 2);
      s.cmd = clamp(s.cmd, 0.4, 1.25);
      let target = s.cmd;
      if (s.rust) { const bl = 0.035; if (target > s.blp + bl) s.blp = target - bl; else if (target < s.blp - bl) s.blp = target + bl; target = s.blp; }   // jeu de la vis-mère
      s.tip += clamp(target - s.tip, -2.4 * dt, 2.4 * dt);
      const fast = inp.down || key('Space');
      s.chat = lerp(s.chat, fast ? 1 : 0, Math.min(1, dt * 5));
      const vib = (s.rust ? 0.012 * Math.sin(s.t * 47) : 0) + s.chat * (s.rust ? 0.045 : 0.03) * Math.sin(s.t * 91 + Math.sin(s.t * 13) * 3);
      const tip = s.tip + vib, ox = s.tx;
      s.tx -= (fast ? 0.8 : 0.3) * dt;
      let cutting = false;
      for (const q of s.slices) {
        if (q.x > ox || q.x <= s.tx) continue;
        const before = q.r; q.r = Math.min(q.r, Math.max(0.3, tip));
        if (before - q.r > 0.004) cutting = true;
        q.m.scale.set(1, q.r, q.r);
        if (!q.ev) continue;
        const err = q.r - q.tgt;
        if (err < -s.tol && err > -s.tol * 1.7) { q.sc = 0.5; q.m.material = s.mShallow; s.combo = 0; if (cool('lim', 1.2)) pop('Limite…', 'warn', V(q.x, q.r + 0.5, 0)); }
        else if (err < -s.tol) {
          q.sc = 0; q.m.material = s.mBad; s.combo = 0; s.gouges++;
          if (cool('gouge', 0.8)) { pop('TROP PROFOND !', 'bad', V(q.x, q.r + 0.4, 0)); sfx('clang', 0.6); shake(0.12); flash('rgba(233,79,55,.22)'); }
        } else if (err <= s.tol) {
          q.sc = 1; q.m.material = s.mGood; s.combo++;
          if (s.combo % 15 === 0) { pop('COMBO ×' + s.combo, 'combo', V(q.x, q.r + 0.7, 0)); sfx('bip'); }
        } else {
          q.sc = clamp(1 - (err - s.tol) / 0.16, 0, 0.8); if (before - q.r > 0.002) q.m.material = s.mShallow; s.combo = 0;
          if (cool('shallow', 1.4)) pop('Pas assez ! Plonge', 'warn', V(q.x, q.r + 0.5, 0));
        }
      }
      if (cutting && Math.random() < (fast ? 0.95 : 0.65)) emit('chip', V(s.tx + 0.05, tip + 0.06, 0.25), fast ? 2 : 1, { color: matCol(o.mat), vel: { x: 1.6, y: 2.5, z: 1.8 }, spread: 1.0, life: 1.3, size: 1.25 });
      if (cutting && fast && o.mat !== 'alu' && Math.random() < 0.3) emit('spark', V(s.tx, tip, 0.2), 1, { vel: { x: 2, y: 2, z: 2 }, spread: 1.5, life: 0.3 });
      if (s.chat > 0.6 && cutting) { shake(0.035 + (s.rust ? 0.03 : 0)); if (cool('chat', 2.2)) pop('BRRRRT ! ÇA BROUTE', 'warn', V(s.tx, tip + 1.2, 0)); }
      s.hCut.set(700 + s.chat * 260 + Math.sin(s.t * 60) * s.chat * 80, cutting ? 0.035 + s.chat * 0.03 : 0);
      s.toolG.position.set(s.tx, tip, 0); s.hw.rotation.z = -s.tip * 9;
      const cur = s.tr(clamp(s.tx, s.xEnd, 2.95)), m = v => (v - 0.4) / 0.85;
      s.gD.zone(m(cur - s.tol), m(cur + s.tol)); s.gD.zone2(m(cur - s.tol * 3), m(cur + s.tol * 3));
      s.gD.set(m(tip), `Ø ${fmt(tip * 40, 1)} / ${fmt(cur * 40, 1)}`);
      s.tagF.innerHTML = fast ? 'Avance : <b class="r">RAPIDE ⚡</b>' : 'Avance : <b>LENTE</b>';
      let n = 0, t = 0; for (const q of s.slices) if (q.ev && q.x > s.tx) { n++; t += q.sc; }
      if (n) live(`Qualité <b>${Math.round(100 * t / n)} %</b>` + (s.combo >= 10 ? ` · combo ×${s.combo}` : ''));
      if (s.tx <= s.xEnd) finish(this.score(s), s.gouges > 4 ? 'Il y a des coups de plaquette en trop…' : 'Passe de finition terminée.');
    },
    score(s) { let t = 0, n = 0; for (const q of s.slices) if (q.ev) { n++; t += q.sc; } return n ? 100 * t / n : 0; }
  };

  /* =====================================================================
     2. PRISE D'ORIGINE / TANGENTAGE (papier à cigarette)
     ===================================================================== */
  GAMES.tangent = {
    setup(s, o) {
      const lathe = s.lathe = o.mtype !== 'fraiseuse', col = matCol(o.mat);
      s.title = '🎯 Prise d\'origine — tangentage';
      s.info = 'Approche l\'outil <b>tout doucement</b>. Quand le <b>papier à cigarette</b> s\'envole, tu touches : <b>Espace</b> = mise à zéro ! Trop loin = CRASH.';
      s.hint = '<kbd>Molette</kbd> ou <kbd>S</kbd>/<kbd>Z</kbd> avancer/reculer · <kbd>Maj</kbd>/<kbd>clic droit</kbd> maintenu ou <kbd>F</kbd> = mode FIN · <kbd>Espace</kbd>/<kbd>Clic</kbd> valider';
      s.dur = 15; s.gap = rnd(2.5, 6); s.K = 0.17; s.paperT = 0.03;
      s.surf = lathe ? 1.2 : 0;
      s.spin = new THREE.Group(); s.scene.add(s.spin);
      if (lathe) {
        const p = cyl(1.2, 1.2, 6, flat(col), 14, s.spin, 0, 0, 0); p.rotation.z = Math.PI / 2;
        const ch = cyl(1.9, 1.9, 1, flat(PAL.steelDark), 10, s.spin, -3.4, 0, 0); ch.rotation.z = Math.PI / 2;
        box(10, 0.5, 3, PAL.machineDark, 0, -2.2, 0);
      } else {
        box(4.4, 1.3, 3.0, flat(col), 0, -0.65, 0);
        box(6, 0.5, 4, PAL.machineDark, 0, -1.55, 0);
        box(0.6, 1.0, 3.4, PAL.lebecBlue, -2.5, -0.6, 0); box(0.6, 1.0, 3.4, PAL.lebecBlue, 2.5, -0.6, 0);
      }
      const tool = s.tool = new THREE.Group(); s.scene.add(tool);
      if (lathe) {
        const ins = box(0.26, 0.26, 0.09, PAL.lebecYellow, 0, 0.184, 0, tool, 0.02); ins.rotation.z = Math.PI / 4;
        box(0.42, 1.9, 0.42, PAL.steelDark, 0.15, 1.15, 0, tool); box(1.8, 0.6, 1.4, PAL.machine, 0.5, 2.3, 0, tool);
      } else {
        s.mill = new THREE.Group(); tool.add(s.mill);
        cyl(0.42, 0.42, 1.5, flat(0x3fa7ff), 10, s.mill, 0, 0.75, 0);
        for (let i = 0; i < 4; i++) { const f = box(0.1, 1.3, 0.1, PAL.lebecBlue, Math.cos(i * 1.571) * 0.4, 0.75, Math.sin(i * 1.571) * 0.4, s.mill, 0.02); f.rotation.y = -i * 1.571; f.rotation.x = 0.35; } cyl(0.5, 0.5, 0.8, PAL.steelDark, 16, tool, 0, 1.9, 0); box(1.6, 1.0, 1.6, PAL.machine, 0, 2.7, 0, tool);
      }
      s.paper = box(1.1, 0.012, 0.75, PAL.white, 0.1, s.surf + 0.012, 0.25, s.scene, 0.004);
      s.pv = V(0, 0, 0);
      s.wheel = new THREE.Group(); s.wheel.position.set(2.5, s.surf + 1.6, 0.6); s.scene.add(s.wheel);
      cyl(0.55, 0.55, 0.1, PAL.steel, 18, s.wheel).rotation.x = Math.PI / 2;
      cyl(0.07, 0.07, 0.3, PAL.red, 8, s.wheel, 0.4, 0, 0.18).rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) { const t = box(0.03, 0.1, 0.02, PAL.black, Math.cos(i / 12 * 6.283) * 0.45, Math.sin(i / 12 * 6.283) * 0.45, 0.07, s.wheel, 0.005); t.rotation.z = i / 12 * 6.283 + Math.PI / 2; }
      s.far = V(0.6, s.surf + 1.7, 6.2); s.near = V(0.9, s.surf + 0.85, 3.4);
      s.camBase.copy(s.far); s.camLook.set(0, s.surf + 0.3, 0); s.floor = lathe ? -2 : -0.02;
      s.hm = hum('sawtooth', lathe ? 58 : 95, 0.028, 400);
      s.tagM = tag('Mode : <b>GROS</b> (0,25 mm / cran)'); s.tagP = tag('Papier : <b class="g">en place</b>');
      s.fine = false; s.lastDir = 0; s.wrot = 0;
      this.place(s);
      live('Écart : ??? mm');
    },
    place(s) { s.tool.position.set(0, s.surf + s.paperT + Math.max(s.gap, -0.12) * s.K, 0); s.wheel.rotation.z = s.wrot; },
    idle(s, dt) { if (s.lathe) s.spin.rotation.x += 15 * dt; else if (s.mill) s.mill.rotation.y += 15 * dt; this.place(s); },
    tick(s, dt) {
      this.idle(s, dt);
      if (hit('KeyF')) s.fine = !s.fine;
      const fine = s.fine || key('ShiftLeft', 'ShiftRight') || inp.rdown;
      const n = inp.wheel + (hit('KeyS', 'ArrowDown') ? 1 : 0) - (hit('KeyW', 'ArrowUp') ? 1 : 0);
      if (n) {
        let d = n * (fine ? 0.02 : 0.25);
        if (s.rust) {
          d *= rnd(0.7, 1.3);
          if (s.lastDir && Math.sign(n) !== s.lastDir) { d -= Math.sign(n) * Math.min(Math.abs(d), 0.08); if (cool('jeu', 2)) pop('Jeu dans la manivelle…', 'warn'); }
          s.lastDir = Math.sign(n);
        }
        s.gap -= d; s.wrot -= d * 5; sfx('bip', fine ? 0.25 : 0.5);
      }
      s.tagM.innerHTML = fine ? 'Mode : <b class="g">FIN</b> (0,02 mm / cran)' : 'Mode : <b>GROS</b> (0,25 mm / cran)';
      const k = clamp(1 - s.gap / 3, 0, 1); s.camBase.lerpVectors(s.far, s.near, k * k);
      if (!s.flown) {
        const amp = s.gap < 0.8 ? (0.8 - s.gap) * 0.12 : 0.006;
        s.paper.rotation.z = Math.sin(s.t * 38) * amp; s.paper.rotation.x = Math.sin(s.t * 23) * amp * 0.6;
        if (s.gap <= 0.05) {
          s.flown = true; s.pv.set(rnd(1.5, 2.5), rnd(1.8, 2.6), rnd(1, 2)); sfx('whoosh'); pop('FRRRT ! Le papier s\'envole !', 'good');
          s.tagP.innerHTML = 'Papier : <b class="r">ENVOLÉ 💨</b>';
        }
      } else {
        s.pv.y -= 1.5 * dt; s.paper.position.addScaledVector(s.pv, dt); s.paper.rotation.x += 6 * dt; s.paper.rotation.z += 4 * dt;
      }
      if (s.gap < -0.03) {
        emit('spark', V(0, s.surf + 0.05, 0.3), 40, { vel: { x: 0, y: 2.5, z: 2 }, spread: 2.5, life: 0.5 });
        emit('spark2', V(0, s.surf + 0.05, 0.3), 20, { vel: { x: 1, y: 2, z: 1 }, spread: 2, life: 0.4 });
        sfx('clang'); sfx('punch'); shake(0.35); flash('rgba(255,140,40,.45)');
        return finish(18, 'CRASH ! L\'outil a mordu la pièce. Lebec arrive…');
      }
      if (hit('Space', 'Enter') || inp.click) this.timeout(s);
    },
    timeout(s) {
      const g = Math.max(0, s.gap);
      if (s.flown) finish(78 + 22 * clamp(1 - s.t / s.dur, 0, 1), `Écart final : ${fmt(g, 2)} mm. Origine prise !`);
      else finish(Math.max(0, 58 - (g - 0.05) * 28), `Il restait ${fmt(g, 2)} mm… le papier n'a pas bougé.`);
    },
    score(s) { return s.flown ? 80 : 30; }
  };

  /* =====================================================================
     3. FRAISAGE DE CONTOUR (manivelles X / Y)
     ===================================================================== */
  function closedPath(o) {
    const W = rnd(2.0, 2.5), H = rnd(1.25, 1.6), c = rnd(0.35, 0.6), t = pick(o.diff > 0.5 ? ['chamf', 'L', 'hex', 'round', 'cross'] : ['chamf', 'L', 'hex', 'round']);
    let p;
    if (t === 'chamf') p = [[-W + c, -H], [W - c, -H], [W, -H + c], [W, H - c], [W - c, H], [-W + c, H], [-W, H - c], [-W, -H + c]];
    else if (t === 'L') { const a = rnd(-0.3, 0.6), b = rnd(-0.2, 0.4); p = [[-W, -H], [W, -H], [W, b], [a, b], [a, H], [-W, H]]; }
    else if (t === 'hex') { p = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; p.push([Math.cos(a) * W * 0.9, Math.sin(a) * H * 1.15]); } }
    else if (t === 'cross') { const a = W * 0.38, b = H * 0.38; p = [[-a, -H], [a, -H], [a, -b], [W, -b], [W, b], [a, b], [a, H], [-a, H], [-a, b], [-W, b], [-W, -b], [-a, -b]]; }
    else { p = []; const rr = rnd(0.5, 0.8), cs = [[W - rr, H - rr, 0], [-W + rr, H - rr, 1], [-W + rr, -H + rr, 2], [W - rr, -H + rr, 3]]; for (const [cx, cz, q] of cs) for (let i = 0; i <= 6; i++) { const a = (q + i / 6) * Math.PI / 2; p.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); } }
    // rééchantillonnage régulier (fermé)
    const pts = p.concat([p[0]]), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1], M = 180, out = []; let j = 0;
    for (let i = 0; i < M; i++) { const d = i / M * L; while (cum[j + 1] < d) j++; const f = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1); out.push([lerp(pts[j][0], pts[j + 1][0], f), lerp(pts[j][1], pts[j + 1][1], f)]); }
    return { pts: out, len: L, type: t };
  }
  GAMES.contour = {
    setup(s, o) {
      const col = matCol(o.mat);
      s.title = '🧭 Fraisage de contour' + (s.rust ? ' — Huré 1968' : '');
      s.info = 'Guide la fraise sur le <b>trait de traçage</b> avec les deux manivelles (X et Y). Fais tout le tour, sans déborder !';
      s.hint = '<kbd>Q</kbd>/<kbd>D</kbd> manivelle X · <kbd>Z</kbd>/<kbd>S</kbd> manivelle Y (ou flèches) · <kbd>Clic</kbd> maintenu : suivre la souris';
      s.path = closedPath(o); s.dur = clamp(9 + s.path.len * 0.62, 16, 23);
      s.camBase.set(0, 9.4, 4.4); s.camLook.set(0, 0, 0.2); s.floor = 0.02;
      box(6.8, 0.8, 4.6, flat(PAL.shutterBlue), 0, -0.4, 0);    // bleu de traçage
      box(8.5, 0.5, 6, PAL.machineDark, 0, -1.05, 0);
      box(0.5, 0.9, 4.8, PAL.lebecBlue, -3.7, -0.3, 0); box(0.5, 0.9, 4.8, PAL.lebecBlue, 3.7, -0.3, 0);
      const pp = s.path.pts.map(p => [p[0], 0.006, p[1]]); pp.push(pp[0]);
      ribbon(pp, 0.07, 0xf6f3ec, 'xz');
      const p0 = s.path.pts[0];
      const flag = cyl(0, 0.12, 0.3, PAL.lebecYellow, 4, s.scene, p0[0], 0.15, p0[1]);
      flag.rotation.x = Math.PI;
      s.mill = new THREE.Group(); s.scene.add(s.mill);
      s.cut = cyl(0.2, 0.2, 1.1, flat(0x3fa7ff), 6, s.mill, 0, 0.55, 0);
      cyl(0.28, 0.28, 0.5, PAL.steelDark, 14, s.mill, 0, 1.35, 0); cyl(0.4, 0.4, 0.3, PAL.lebecYellow, 14, s.mill, 0, 1.7, 0);
      // traînée colorée (3 InstancedMesh : vert / jaune / rouge)
      const dg = G_(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 10));
      s.trail = [PAL.mint, PAL.lebecYellow, PAL.red].map(c => { const im = new THREE.InstancedMesh(dg, Sty.toon(c), 700); im.count = 0; im.frustumCulled = false; s.scene.add(im); return im; });
      s.hwX = new THREE.Group(); s.hwX.position.set(-2.4, 0.2, 2.75); s.hwY = new THREE.Group(); s.hwY.position.set(2.4, 0.2, 2.75);
      for (const h of [s.hwX, s.hwY]) { s.scene.add(h); cyl(0.42, 0.42, 0.08, PAL.steel, 16, h).rotation.x = Math.PI / 2 - 0.9; box(0.08, 0.08, 0.3, PAL.red, 0.3, 0, 0.1, h); }
      s.x = p0[0]; s.z = p0[1]; s.vx = 0; s.vz = 0; s.lastDrop = V(s.x, 0, s.z); s.vis = new Uint8Array(s.path.pts.length);
      s.accS = 0; s.accL = 0; s.blx = 0; s.blz = 0; s.sx = 0; s.sz = 0; s.vmax = 1.55 - o.diff * 0.2;
      s.ray = new THREE.Raycaster(); s.plane = new THREE.Plane(V(0, 1, 0), 0);
      s.hm = hum('sawtooth', 110, 0.025, 500); s.hc = hum('square', 900, 0, 2200);
      s.gC = gauge('CONTOUR'); s.gA = gauge('PRÉCISION');
      this.place(s);
    },
    place(s) { s.mill.position.set(s.x, 0, s.z); },
    idle(s, dt) { s.cut.rotation.y += 20 * dt; },
    tick(s, dt) {
      this.idle(s, dt);
      let ax = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0), az = (key('KeyS', 'ArrowDown') ? 1 : 0) - (key('KeyW', 'ArrowUp') ? 1 : 0);
      if (inp.down) {
        s.ray.setFromCamera({ x: inp.mx, y: inp.my }, s.cam);
        if (s.ray.ray.intersectPlane(s.plane, tmpV)) { const dx = tmpV.x - s.x, dz = tmpV.z - s.z, d = Math.hypot(dx, dz); if (d > 0.02) { const f = Math.min(1, d / 0.3) / d; ax = dx * f; az = dz * f; } }
      }
      // jeu dans les manivelles (vieille machine) : temps mort à l'inversion
      if (s.rust) {
        const sx = Math.sign(Math.round(ax * 10)), sz = Math.sign(Math.round(az * 10));
        if (sx && s.sx && sx !== s.sx) s.blx = 0.14; if (sx) s.sx = sx;
        if (sz && s.sz && sz !== s.sz) s.blz = 0.14; if (sz) s.sz = sz;
        if (s.blx > 0) { s.blx -= dt; ax = 0; } if (s.blz > 0) { s.blz -= dt; az = 0; }
      }
      const acc = 9 * dt;
      s.vx += clamp(ax * s.vmax - s.vx, -acc, acc); s.vz += clamp(az * s.vmax - s.vz, -acc, acc);
      const ox = s.x, oz = s.z;
      s.x = clamp(s.x + s.vx * dt, -3.3, 3.3); s.z = clamp(s.z + s.vz * dt, -2.2, 2.2);
      if (s.rust) { s.x += Math.sin(s.t * 41) * 0.004; s.z += Math.cos(s.t * 37) * 0.004; }
      s.hwX.rotation.z -= (s.x - ox) * 4; s.hwY.rotation.z -= (s.z - oz) * 4;
      this.place(s);
      // écart au trait
      let dev = 99; const P = s.path.pts;
      for (let i = 0; i < P.length; i++) { const d = Math.hypot(P[i][0] - s.x, P[i][1] - s.z); if (d < dev) dev = d; if (d < 0.17) s.vis[i] = 1; }
      const moved = Math.hypot(s.x - ox, s.z - oz), speed = moved / dt;
      if (moved > 0) { s.accS += clamp(1 - dev / 0.3, 0, 1) * moved; s.accL += moved; }
      if (Math.hypot(s.x - s.lastDrop.x, s.z - s.lastDrop.z) > 0.06) {
        s.lastDrop.set(s.x, 0, s.z);
        const im = s.trail[dev < 0.09 ? 0 : dev < 0.2 ? 1 : 2];
        if (im.count < 700) { tmpV.set(s.x, 0.012 + im.count * 0.00001, s.z); const mm = new THREE.Matrix4().setPosition(tmpV); im.setMatrixAt(im.count, mm); im.count++; im.instanceMatrix.needsUpdate = true; }
        if (dev < 0.09) { s.combo++; if (s.combo % 25 === 0) { pop('PILE SUR LE TRAIT ×' + s.combo, 'combo', V(s.x, 0.8, s.z)); sfx('bip'); } } else s.combo = 0;
        if (dev > 0.3 && cool('hors', 1.5)) { pop('HORS DU TRAIT !', 'bad', V(s.x, 0.8, s.z)); sfx('error', 0.5); shake(0.05); }
      }
      if (speed > 0.15) {
        if (Math.random() < 0.7) emit('chip', V(s.x + rnd(-0.2, 0.2), 0.1, s.z + rnd(-0.2, 0.2)), 1, { color: matCol(s.opts.mat), vel: { x: rnd(-1.5, 1.5), y: 2.2, z: rnd(-1.5, 1.5) }, spread: 0.6, life: 1.1, size: 1.1 });
        if (s.rust) shake(0.012);
      }
      s.hc.set(820 + speed * 120, speed > 0.15 ? 0.022 : 0);
      let nv = 0; for (const v of s.vis) nv += v;
      s.cov = nv / s.vis.length; s.acc = s.accL > 0 ? s.accS / s.accL : 1;
      s.gC.set(s.cov, Math.round(s.cov * 100) + ' %'); s.gA.set(s.acc, Math.round(s.acc * 100) + ' %');
      live(`Contour <b>${Math.round(s.cov * 100)} %</b> · précision <b>${Math.round(s.acc * 100)} %</b>`);
      if (s.cov >= 0.97) finish(this.score(s) + 6 * clamp(1 - s.t / s.dur, 0, 1), 'Contour bouclé !');
    },
    score(s) { return 100 * Math.pow(Math.min(1, (s.cov || 0) / 0.97), 1.5) * (0.25 + 0.75 * (s.acc === undefined ? 1 : s.acc)); }
  };

  /* =====================================================================
     4. PERÇAGE À LA PERCEUSE À COLONNE (débourrage !)
     ===================================================================== */
  GAMES.drill = {
    setup(s, o) {
      const col = matCol(o.mat);
      s.title = '🪛 Perçage — perceuse à colonne';
      s.info = '<b>Maintiens</b> pour descendre le foret, <b>relâche</b> pour remonter et <b>débourrer</b> (vider les copeaux). Arrête-toi à la <b class="y">profondeur cible</b>. Surchauffe = foret cassé !';
      s.hint = '<kbd>Clic</kbd>/<kbd>Espace</kbd> maintenu : descendre · relâcher : remonter / débourrer';
      s.dur = 16; s.T = rnd(0.8, 1.25); s.tol = 0.07 - o.diff * 0.02; s.Hb = 1.6; s.hard = { inox: 1.35, acier: 1, alu: 0.7, fonte: 0.9 }[o.mat] || 1;
      const hr = 0.17, H = s.Hb;
      s.camBase.set(1.4, 1.5, 6.8); s.camLook.set(0, 0.5, 0); s.floor = -1.62;
      box(1.2 - hr, H, 1.4, flat(col), (-1.2 - hr) / 2, -H / 2, 0, null, 0.02); box(1.2 - hr, H, 1.4, flat(col), (1.2 + hr) / 2, -H / 2, 0, null, 0.02);
      box(2 * hr, H, 0.7, PAL.machineDark, 0, -H / 2, -0.35, null, 0.01);
      s.fill = box(2 * hr, 1, 0.7, flat(col), 0, 0, 0.35, null, 0.01);
      box(0.4, 1.2, 1.6, PAL.lebecBlue, -1.45, -0.9, 0); box(0.4, 1.2, 1.6, PAL.lebecBlue, 1.45, -0.9, 0);
      box(4.5, 0.4, 2.6, PAL.machineDark, 0, -1.8, 0);
      box(1.1, 2 * s.tol, 0.04, M_(new THREE.MeshBasicMaterial({ color: PAL.lebecYellow, transparent: true, opacity: 0.75 })), 0, -s.T, 0.72, null, 0.005);
      box(1.1, 0.025, 0.05, PAL.black, 0, -s.T, 0.74, null, 0.005);
      box(1.2, 2.2, 1.6, PAL.shutterGreen, 0, 3.9, -0.3); box(0.7, 6, 0.7, PAL.shutterGreen, 0, 0.5, -1.6);
      s.lever = new THREE.Group(); s.lever.position.set(0.75, 3.4, 0.2); s.scene.add(s.lever);
      for (let i = 0; i < 3; i++) { const a = i * 2.094, b = box(0.08, 1.2, 0.08, PAL.steel, 0, 0, 0, s.lever); b.position.set(0, Math.cos(a) * 0.6, Math.sin(a) * 0.6); b.rotation.x = a; cyl(0.1, 0.1, 0.1, PAL.black, 8, s.lever, 0, Math.cos(a) * 1.2, Math.sin(a) * 1.2); }
      s.drill = new THREE.Group(); s.scene.add(s.drill);
      s.bit = new THREE.Group(); s.drill.add(s.bit);
      s.tipMat = M_(new THREE.MeshToonMaterial({ color: PAL.steel, gradientMap: Sty.gradient, emissive: 0x000000 })); s.tipMat.flatShading = true;
      cyl(0.15, 0.15, 2.5, s.tipMat, 5, s.bit, 0, 1.45, 0); cyl(0.15, 0.001, 0.2, s.tipMat, 5, s.bit, 0, 0.1, 0);
      for (let i = 0; i < 6; i++) { const r = box(0.32, 0.04, 0.05, PAL.steelDark, 0, 0.35 + i * 0.36, 0, s.bit, 0.01); r.rotation.y = i * 0.9; r.rotation.z = 0.35; }
      cyl(0.32, 0.25, 0.6, PAL.steelDark, 12, s.drill, 0, 3.0, 0);
      s.p = 0.45; s.hd = 0; s.heat = 0; s.pack = 0; s.peak = 0; s.debs = 0;
      s.hs = hum('square', 900, 0, 3000); s.hm = hum('sawtooth', 80, 0.025, 380);
      s.gP = gauge('PROFONDEUR'); s.gH = gauge('CHAUFFE', 'heat');
      s.gP.zone((s.T - s.tol) / H, (s.T + s.tol) / H);
      this.place(s);
    },
    place(s) {
      s.drill.position.y = s.p; s.lever.rotation.x = -s.p * 1.4;
      const fh = Math.max(0.001, s.Hb - s.hd); s.fill.scale.y = fh; s.fill.position.y = -s.Hb + fh / 2;
      const h = s.heat / 100; s.tipMat.color.setHex(PAL.steel).lerp(tmpCol.setHex(0x9a6a3a), clamp(h * 1.2, 0, 1)); s.tipMat.emissive.setRGB(h > 0.5 ? (h - 0.5) * 1.4 : 0, h > 0.7 ? (h - 0.7) * 0.6 : 0, 0);
    },
    idle(s, dt) { s.bit.rotation.y += 25 * dt; this.place(s); },
    tick(s, dt) {
      s.bit.rotation.y += 25 * dt;
      const hold = inp.down || key('Space'), wasIn = s.p < 0;
      let cutting = false;
      if (hold) {
        if (s.p > -s.hd + 0.001) s.p = Math.max(-s.hd, s.p - 1.1 * dt);
        else { s.p -= 0.34 / Math.sqrt(s.hard) * dt; s.hd = -s.p; cutting = true; }
      } else s.p = Math.min(0.45, s.p + 1.5 * dt);
      if (s.hd >= s.Hb) { s.hd = s.Hb; if (!s.through) { s.through = true; pop('DÉBOUCHÉ !', 'bad'); sfx('clang'); shake(0.15); } }
      if (cutting) {
        s.heat += (12 + 30 * s.pack) * s.hard * dt; s.pack += 0.55 * dt;
        if (Math.random() < 0.5) emit('chip', V(rnd(-0.1, 0.1), 0.05, 0.35), 1, { color: matCol(s.opts.mat), vel: { x: rnd(-1.2, 1.2), y: 1.6, z: 1 }, spread: 0.5, life: 0.9, size: 0.9 });
      } else if (s.p > 0) { s.heat -= 26 * dt; s.pack = Math.max(0, s.pack - 3 * dt); }
      else s.heat -= 6 * dt;
      s.heat = Math.max(0, s.heat); s.peak = Math.max(s.peak, s.heat);
      if (wasIn && s.p >= 0 && s.hd > 0.15) {
        emit('chip', V(0, 0.15, 0.2), 8 + Math.round(s.pack * 10), { color: matCol(s.opts.mat), vel: { x: 0, y: 3, z: 1.2 }, spread: 1.6, life: 1.2, size: 1.2 });
        s.debs++; if (s.pack > 0.2) { pop('DÉBOURRAGE ✔' + (s.debs > 1 ? ' ×' + s.debs : ''), 'good', V(0, 0.8, 0)); sfx('whoosh', 0.6); }
        s.pack = 0;
      }
      if (s.heat > 70 && Math.random() < 0.3) emit('smoke', V(0, 0.1, 0.2), 1, { vel: { x: 0, y: 0.8, z: 0 }, spread: 0.2, life: 1 });
      if (s.heat > 80) { shake(0.02); if (cool('hot', 1.6)) pop('ÇA CHAUFFE !!', 'bad', V(0, 1.2, 0)); }
      if (s.heat >= 100) {
        s.bit.visible = false; emit('spark', V(0, -s.hd + 0.2, 0.3), 30, { vel: { x: 0, y: 3, z: 1.5 }, spread: 2.5, life: 0.5 });
        emit('bit', V(0, 0.3, 0.3), 6, { color: PAL.steelDark, vel: { x: 0, y: 3, z: 2 }, spread: 2, life: 1.4 });
        sfx('clang'); sfx('punch'); shake(0.4); flash('rgba(233,79,55,.45)');
        return finish(6, 'FORET CASSÉ ! Il fallait débourrer, bourrin !');
      }
      s.hs.set(900 + s.heat * 14 + Math.sin(s.t * 40) * s.heat * 2, cutting ? 0.012 + s.heat / 100 * 0.04 : 0);
      this.place(s);
      s.gP.set(Math.max(s.hd, -Math.min(0, s.p)) / s.Hb, fmt(s.hd * 20, 1) + ' / ' + fmt(s.T * 20, 1) + ' mm');
      s.gH.set(s.heat / 100, Math.round(s.heat) + ' °');
      live(`Profondeur <b>${fmt(s.hd * 20, 1)} mm</b> · débourrages ${s.debs}`);
      if (s.hd >= s.T - s.tol && s.p > 0.05) finish(this.score(s), s.hd > s.T + s.tol ? 'Trop profond : la cote n\'y est pas.' : s.peak < 80 ? 'Perçage propre, foret froid.' : 'Ça a fumé, mais c\'est percé.');
    },
    score(s) {
      const dz = Math.abs(s.hd - s.T), d = dz <= s.tol ? 1 : clamp(1 - (dz - s.tol) / 0.3, 0, 1);
      return 62 * d + 22 * (s.peak < 80 ? 1 : s.peak < 92 ? 0.6 : 0.3) + 16 * clamp(1 - s.t / s.dur, 0, 1);
    }
  };
  const tmpCol = new THREE.Color();

  /* =====================================================================
     5. TARAUDAGE (jeu de rythme : ½ tour avant, ¼ tour arrière)
     ===================================================================== */
  GAMES.tap = {
    setup(s, o) {
      const col = matCol(o.mat);
      s.title = '🔩 Taraudage à la main';
      s.info = 'En rythme : <b>½ tour en avant</b> ▶, <b>¼ tour en arrière</b> ◀ pour casser le copeau, et un coup d\'<b>huile</b> 💧 de temps en temps. Force trop = taraud cassé !';
      s.hint = '<kbd>D</kbd>/<kbd>→</kbd>/<kbd>Clic</kbd> : ½ tour ▶ · <kbd>Q</kbd>/<kbd>←</kbd>/<kbd>Clic droit</kbd> : ¼ tour ◀ · <kbd>Espace</kbd> : huile 💧';
      s.noRust = true;
      const bpm = 96 + o.diff * 40 + rnd(-6, 6), beat = s.beat = 60 / bpm, cycles = 6 + Math.round(o.diff * 3);
      s.notes = []; let t = 1.0;
      for (let c = 0; c < cycles; c++) {
        s.notes.push({ t, k: 'F' }); t += Math.random() < 0.3 + o.diff * 0.3 ? beat * 0.5 : beat;
        s.notes.push({ t, k: 'B' }); t += beat;
        if (c % 3 === 2 && c < cycles - 1 && Math.random() < 0.75) { s.notes.push({ t, k: 'H' }); t += beat; }
      }
      s.dur = t + 0.6; s.nextBeat = 1.0;
      s.camBase.set(0.3, 3.9, 4.0); s.camLook.set(0, -0.3, 0); s.floor = 0.01;
      box(3.4, 1.0, 2.6, flat(col), 0, -0.5, 0); box(5, 0.4, 3.4, PAL.machineDark, 0, -1.2, 0);
      cyl(0.2, 0.2, 0.02, PAL.black, 16, s.scene, 0, 0.005, 0);
      s.tapG = new THREE.Group(); s.scene.add(s.tapG);
      cyl(0.14, 0.14, 1.5, flat(PAL.steel), 8, s.tapG, 0, 0.75, 0);
      for (let i = 0; i < 9; i++) cyl(0.155, 0.155, 0.035, PAL.steelDark, 8, s.tapG, 0, 0.1 + i * 0.09, 0);
      box(0.2, 0.25, 0.2, PAL.steelDark, 0, 1.6, 0, s.tapG, 0.02);
      s.wr = new THREE.Group(); s.wr.position.y = 1.6; s.tapG.add(s.wr);
      box(0.4, 0.3, 0.4, PAL.steelDark, 0, 0, 0, s.wr); box(2.6, 0.12, 0.12, PAL.steel, 0, 0, 0, s.wr, 0.03);
      cyl(0.11, 0.11, 0.7, PAL.red, 10, s.wr, -1.55, 0, 0).rotation.z = Math.PI / 2; cyl(0.11, 0.11, 0.7, PAL.red, 10, s.wr, 1.55, 0, 0).rotation.z = Math.PI / 2;
      s.oil = cyl(0.25, 0.15, 0.6, PAL.lebecYellow, 10, s.scene, -1.3, 0.3, 0.7); cyl(0.03, 0.03, 0.6, PAL.steel, 6, s.oil, 0.25, 0.4, 0).rotation.z = -1;
      s.rot = 0; s.rotT = 0; s.depth = 0; s.stress = 0; s.sc = 0; s.judged = 0;
      // couloir de notes (DOM)
      const lane = s.lane = el('div', 'm3-lane', '<div class="hl"></div>'); dom.layer.appendChild(lane);
      for (const n of s.notes) { n.el = el('div', 'nt ' + n.k, n.k === 'F' ? '▶' : n.k === 'B' ? '◀' : '💧'); lane.appendChild(n.el); }
      s.gS = gauge('CONTRAINTE', 'heat');
      this.lane(s);
    },
    lane(s) {
      const W = s.lane.clientWidth || 600, hx = 60, pxs = (W - hx) / 1.8;
      for (const n of s.notes) { if (n.gone) continue; const x = hx + (n.t - s.t) * pxs; n.el.style.transform = `translateX(${x}px)`; n.el.style.opacity = x > W ? 0 : 1; }
    },
    idle(s, dt) { this.anim(s, dt); this.lane(s); },
    anim(s, dt) {
      s.rot += (s.rotT - s.rot) * Math.min(1, dt * 16);
      s.wr.rotation.y = s.rot; s.tapG.position.y = -s.depth; s.tapG.children[0].rotation.y = s.rot;
    },
    press(s, k) {
      let best = null;
      for (const n of s.notes) if (!n.j && n.k === k && Math.abs(n.t - s.t) < 0.26) { best = n; break; }
      const at = { x: 80, y: s.h - 120 };
      if (k === 'F') { s.rotT -= Math.PI; s.depth += 0.045; } else if (k === 'B') s.rotT += Math.PI / 2;
      if (k === 'H') { emit('oil', V(-0.1, 0.9, 0.2), 10, { vel: { x: 0.8, y: 0.5, z: 0 }, spread: 0.4, life: 0.7 }); sfx('blow', 0.3); }
      if (!best) {
        if (k === 'F') { s.stress += 30; pop('TROP DE FORCE !', 'bad', at); sfx('error', 0.6); shake(0.06); }
        else if (k === 'B') { s.stress = Math.max(0, s.stress - 5); s.combo = 0; }
        return;
      }
      const d = Math.abs(best.t - s.t), sc = d < 0.07 ? 1 : d < 0.14 ? 0.75 : 0.4;
      best.j = true; best.sc = sc; s.sc += sc; s.judged++; best.el.classList.add(sc === 1 ? 'pf' : 'ok');
      setTimeout(() => { best.gone = true; best.el.remove(); }, 120);
      if (sc >= 0.75) s.combo++; else s.combo = 0;
      pop(sc === 1 ? 'PARFAIT' : sc >= 0.75 ? 'BIEN' : 'LIMITE', sc === 1 ? 'good' : sc >= 0.75 ? 'combo' : 'warn', at);
      if (s.combo && s.combo % 5 === 0) { pop('COMBO ×' + s.combo, 'combo', { x: s.w / 2, y: s.h * 0.25 }); flash('rgba(62,207,142,.18)'); }
      if (k === 'F') { sfx('clang', 0.25); emit('chip', V(0, 0.08, 0.2), 2, { color: matCol(s.opts.mat), vel: { x: 0, y: 1.6, z: 0.6 }, spread: 0.8, life: 0.8, size: 0.6 }); }
      else if (k === 'B') sfx('drop', 0.8);
    },
    tick(s, dt) {
      if (s.t >= s.nextBeat) { s.nextBeat += s.beat; sfx('bip', 0.12); }
      if (hit('KeyD', 'ArrowRight') || inp.click) this.press(s, 'F');
      if (hit('KeyA', 'ArrowLeft') || inp.rclick) this.press(s, 'B');
      if (hit('Space')) this.press(s, 'H');
      for (const n of s.notes) if (!n.j && s.t - n.t > 0.26) {
        n.j = true; n.sc = 0; s.judged++; s.combo = 0; n.el.classList.add('miss'); setTimeout(() => { n.gone = true; n.el.remove(); }, 200);
        if (n.k === 'B') { s.stress += 25; pop('Dévire ! Le copeau bourre…', 'bad', { x: 80, y: s.h - 120 }); sfx('error', 0.5); }
        else if (n.k === 'H') { s.stress += 10; pop('À SEC ?!', 'warn', { x: 80, y: s.h - 120 }); }
        else pop('RATÉ', 'bad', { x: 80, y: s.h - 120 });
      }
      s.stress = Math.max(0, s.stress - 12 * dt);
      if (s.stress > 60) shake(0.02);
      s.gS.set(s.stress / 100, Math.round(s.stress) + ' %');
      this.anim(s, dt); this.lane(s);
      live(`Rythme <b>${s.judged ? Math.round(100 * s.sc / s.judged) : 100} %</b>` + (s.combo >= 3 ? ` · combo ×${s.combo}` : ''));
      if (s.stress >= 100) {
        s.tapG.children.slice(1).forEach(c => { c.visible = false; }); s.wr.visible = false;
        emit('bit', V(0, 0.6, 0.2), 8, { color: PAL.steel, vel: { x: 0, y: 3, z: 1.5 }, spread: 2, life: 1.4 });
        sfx('clang'); sfx('punch'); shake(0.4); flash('rgba(233,79,55,.45)');
        try { ML.Sfx.speak('On ne taraude pas comme un bourrin !', { force: true, pitch: 0.7 }); } catch (e) { /* pas de voix */ }
        return finish(5, 'TARAUD CASSÉ ! « ON NE TARAUDE PAS COMME UN BOURRIN ! »');
      }
      if (s.notes.every(n => n.j) && s.t > s.notes[s.notes.length - 1].t + 0.35) finish(this.score(s), 'Filetage propre, ça visse tout seul.');
    },
    score(s) { return 100 * s.sc / s.notes.length; }
  };

  /* =====================================================================
     6. CHANGEMENT DE PLAQUETTE (Torx, indexage, couple de serrage)
     ===================================================================== */
  GAMES.insert = {
    setup(s, o) {
      s.title = '🔶 Changement de plaquette';
      s.hint = '<kbd>Clic</kbd> maintenu + tourner la souris ↺ (ou <kbd>Q</kbd>/<kbd>molette</kbd>) · <kbd>Q</kbd>/<kbd>D</kbd> tourner la plaquette · <kbd>F</kbd>/<kbd>clic droit</kbd> retourner · <kbd>Espace</kbd> valider';
      s.info = '';
      s.noRust = true; s.dur = 22;
      s.camBase.set(0.2, 3.7, 2.7); s.camLook.set(0, 0, 0.5); s.floor = -0.4;
      box(1.6, 0.5, 5, PAL.machineDark, 0.3, -0.25, -1.6); box(2.2, 0.5, 1.8, PAL.machineDark, 0, -0.25, 0.4);
      box(7, 0.3, 5, PAL.slate, 0, -0.65, -0.5);
      // plaquette : C (losange 80°), T (triangle) ou S (carré) — 2 faces
      const shape = s.shapeT = pick(['C', 'T', 'S']), sz = 0.62;
      let verts, cut;
      if (shape === 'C') { const sh = Math.tan(40 * Math.PI / 180) * sz; verts = [[sz, 0], [0, sh], [-sz, 0], [0, -sh]]; cut = [0, 2]; }
      else if (shape === 'T') { verts = []; for (let i = 0; i < 3; i++) { const a = i * 2.094; verts.push([Math.cos(a) * sz, Math.sin(a) * sz]); } cut = [0, 1, 2]; }
      else { verts = []; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; verts.push([Math.cos(a) * sz * 0.85, Math.sin(a) * sz * 0.85]); } cut = [0, 1, 2, 3]; }
      s.n = cut.length; s.cutA = cut.map(i => Math.atan2(verts[i][1], verts[i][0]));
      const shp = new THREE.Shape(); shp.moveTo(verts[0][0], verts[0][1]); for (let i = 1; i < verts.length; i++) shp.lineTo(verts[i][0], verts[i][1]); shp.closePath();
      const hole = new THREE.Path(); hole.absarc(0, 0, 0.13, 0, Math.PI * 2, true); shp.holes.push(hole);
      const eg = G_(new THREE.ExtrudeGeometry(shp, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 }));
      eg.translate(0, 0, -0.06); eg.rotateX(-Math.PI / 2);
      s.outer = new THREE.Group(); s.outer.position.set(0, 0.08, 0.5); s.scene.add(s.outer);
      s.inner = new THREE.Group(); s.outer.add(s.inner);
      mesh(eg, Sty.toon(0xffd23f), s.inner);
      // usure : f = face, k = coin de coupe
      s.wear = [[], []]; for (let f = 0; f < 2; f++) for (let k = 0; k < s.n; k++) s.wear[f][k] = Math.random() < 0.5;
      s.wear[0][0] = true;
      if (Math.random() < 0.35) for (let k = 0; k < s.n; k++) s.wear[0][k] = true;
      if (s.wear[0].every(w => w) && s.wear[1].every(w => w)) s.wear[1][Math.floor(Math.random() * s.n)] = false;
      for (let f = 0; f < 2; f++) for (let k = 0; k < s.n; k++) {
        const a = s.cutA[k], r = (shape === 'S' ? sz * 0.85 : sz) * 0.72, y = f === 0 ? 0.08 : -0.08;
        const x = Math.cos(a) * r, z = -Math.sin(a) * r;
        if (s.wear[f][k]) {
          const m = cyl(0.13, 0.13, 0.02, PAL.black, 9, s.inner, x, y, z); m.scale.set(1, 1, 0.7);
          cyl(0.06, 0.06, 0.025, 0x9a5a2a, 7, s.inner, x * 1.1, y, z * 1.1);
          if (Math.random() < 0.7) { const ch = box(0.12, 0.1, 0.12, PAL.slateDark, x * 1.28, 0, z * 1.28, s.inner, 0.01); ch.rotation.y = a; }
        } else cyl(0.06, 0.06, 0.022, 0xfff2a8, 8, s.inner, x, y, z);
      }
      s.thC = -3 * Math.PI / 4;    // coin de coupe : avant-gauche
      s.arrow = new THREE.Group(); s.scene.add(s.arrow);
      const ar = cyl(0, 0.16, 0.35, PAL.red, 4, s.arrow, 0, 0, 0); ar.rotation.z = Math.PI / 2;
      box(0.5, 0.06, 0.06, PAL.red, 0.42, 0, 0, s.arrow);
      const ad = V(Math.cos(s.thC), 0, -Math.sin(s.thC)); s.arrow.position.set(ad.x * 1.15, 0.2, 0.5 + ad.z * 1.15); s.arrow.rotation.y = s.thC;
      s.scene.add(s.screw = new THREE.Group()); s.screw.position.set(0, 0.16, 0.5);
      cyl(0.13, 0.13, 0.1, PAL.steelDark, 6, s.screw, 0, 0.05, 0); cyl(0.07, 0.07, 0.4, PAL.steel, 8, s.screw, 0, -0.15, 0);
      s.key = new THREE.Group(); s.screw.add(s.key);
      cyl(0.05, 0.05, 0.9, PAL.lebecYellow, 6, s.key, 0, 0.5, 0); box(0.9, 0.09, 0.09, PAL.lebecYellow, 0.42, 0.95, 0, s.key, 0.02);
      s.ph = 'A'; s.uns = 0; s.f = 0; s.k = 0; s.flipA = 0; s.psi = this.psiFor(s); s.tq = 0; s.hold = 0; s.pen = 0; s.lift = 0;
      s.gT = gauge('COUPLE DE SERRAGE'); s.gT.zone(0.7, 0.85); s.gT.zone2(0.85, 1); s.gT.el.style.display = 'none';
      s.tagP = tag(''); this.phase(s, 'A');
      this.place(s);
    },
    psiFor(s) { const a = s.cutA[s.k]; return s.f === 0 ? s.thC - a : -s.thC - a; },
    phase(s, p) {
      s.ph = p;
      const t = { A: '1/3 · <b>Dévisse</b> la vis Torx : tourne ↺ (sens inverse des aiguilles)', B: '2/3 · <b>Indexe</b> : amène un coin <b class="g">NEUF</b> sur la flèche rouge, puis <b>Espace</b>', C: '3/3 · <b>Serre au couple</b> : maintiens, relâche dans le <b class="g">vert</b>' }[p];
      s.tagP.innerHTML = t; dom.info.innerHTML = t;
      s.gT.el.style.display = p === 'C' ? '' : 'none';
    },
    place(s) {
      s.screw.rotation.y = s.uns; s.screw.position.y = 0.16 + Math.min(s.uns, 3 * Math.PI) / (3 * Math.PI) * 0.35 + (s.ph === 'B' ? 1.8 : 0);
      s.outer.position.y = 0.08 + s.lift;
    },
    idle(s, dt) { this.anim(s, dt); },
    anim(s, dt) {
      s.lift += ((s.ph === 'B' ? 0.55 : 0) - s.lift) * Math.min(1, dt * 8);
      const tf = s.f * Math.PI; s.flipA += (tf - s.flipA) * Math.min(1, dt * 10); s.outer.rotation.x = s.flipA;
      const tp = this.psiFor(s); s.psi += wrapA(tp - s.psi) * Math.min(1, dt * 12); s.inner.rotation.y = s.psi;
      s.arrow.position.y = 0.2 + s.lift + Math.sin(s.t * 6) * 0.04;
      this.place(s);
    },
    tick(s, dt) {
      if (s.ph === 'A') {
        let d = 0;
        if (inp.down) {
          const c = toScreen(tmpV2.set(0, 0.2, 0.5)), a = Math.atan2(-(inp.py - c.y), inp.px - c.x);
          if (s.pa !== undefined) d += wrapA(a - s.pa); s.pa = a;
        } else s.pa = undefined;
        if (hit('KeyA', 'ArrowLeft')) d += Math.PI / 4; if (hit('KeyD', 'ArrowRight')) d -= Math.PI / 4;
        d -= inp.wheel * Math.PI / 6;
        if (d) { s.uns += d; if (Math.abs(d) > 0.05 && cool('cric', 0.09)) sfx('bip', 0.2); }
        if (s.uns < -Math.PI / 2) { s.uns = -Math.PI / 2; if (cool('sens', 1.5)) { pop('DANS L\'AUTRE SENS ! ↺', 'bad'); sfx('error', 0.5); s.pen += 3; } }
        if (s.uns >= 3 * Math.PI) { sfx('pickup'); pop('Vis retirée !', 'good'); this.phase(s, 'B'); emit('smoke', V(0, 0.4, 0.5), 4, { vel: { x: 0, y: 0.6, z: 0 }, spread: 0.3, life: 0.8 }); }
      } else if (s.ph === 'B') {
        const r = (hit('KeyD', 'ArrowRight') ? 1 : 0) - (hit('KeyA', 'ArrowLeft') ? 1 : 0) + Math.sign(inp.wheel);
        if (r) { s.k = (s.k + r + s.n) % s.n; sfx('drop', 0.6); }
        if (hit('KeyF') || inp.rclick) { s.f = 1 - s.f; sfx('whoosh', 0.5); }
        if (hit('Space', 'Enter') || inp.click) {
          if (s.wear[s.f][s.k]) { s.pen += 25; pop('ARÊTE USÉE ! T\'as vu le cratère ?', 'bad'); sfx('error'); shake(0.1); flash('rgba(233,79,55,.25)'); }
          else { pop('Arête neuve ✔', 'good'); sfx('success', 0.5); this.phase(s, 'C'); s.uns = 3 * Math.PI; }
        }
      } else if (s.ph === 'C') {
        const hold = inp.down || key('Space');
        if (hold) {
          s.hold += dt; s.tq += (30 + 75 * s.hold) * dt; s.uns = Math.max(0, s.uns - 9 * dt);
          if (cool('tq', 0.12)) sfx('bip', 0.15 + s.tq / 300);
          if (s.tq > 100) { s.pen += 40; sfx('clang'); shake(0.25); flash('rgba(233,79,55,.4)'); s.gT.set(1, 'FOIRÉ'); return finish(this.score(s), 'TORX FOIRÉE ! Ça va être dur à démonter…'); }
        } else if (s.hold > 0) {
          s.hold = 0;
          if (s.tq >= 70) { if (s.tq > 85) { s.pen += 10; return finish(this.score(s), 'Un peu fort… mais ça tient.'); } return finish(this.score(s), 'Couple pile dans la tolérance. Bien joué.'); }
          pop('Encore un peu…', 'warn'); sfx('drop');
        }
        s.gT.set(s.tq / 100, Math.round(s.tq * 0.06 * 10) / 10 + ' N·m');
      }
      this.anim(s, dt);
      live(`Pénalités <b>${s.pen}</b>`);
    },
    timeout(s) { finish(Math.min(30, this.score(s)), 'Trop long : la machine attend !'); },
    score(s) { return 100 - s.pen - Math.max(0, s.t - 10) * 3; }
  };

  /* =====================================================================
     7. CONTRÔLE : PIED À COULISSE (1/20) ET MICROMÈTRE (0,01)
     ===================================================================== */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  GAMES.measure = {
    setup(s, o) {
      s.title = '📏 Contrôle express : 3 mesures';
      s.info = 'Lis la mesure et choisis la bonne valeur. Vite et juste, Jacky regarde !';
      s.hint = '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> ou clic sur la réponse';
      s.noRust = true;
      s.per = 9 - o.diff * 2; s.dur = s.per * 3 + 3; s.i = -1; s.pts = 0; s.wait = 0;
      s.camLook.set(1.6, 0.05, 0); s.camBase.set(1.6, 0.25, 6.0);
      s.inst = null; s.btns = el('div', 'm3-opts'); dom.layer.appendChild(s.btns);
      s.tagN = tag('');
      this.next(s);
    },
    next(s) {
      s.i++; if (s.i >= 3) return finish(s.pts, s.pts >= 90 ? 'Œil de lynx.' : 'Contrôle terminé.');
      if (s.inst) { s.scene.remove(s.inst); }
      s.inst = new THREE.Group(); s.scene.add(s.inst);
      const micro = s.micro = Math.random() < 0.5;
      let v, opts;
      if (micro) {
        v = Math.round(rnd(3, 24) * 100) / 100;
        opts = [v + 0.5, v - 0.5, v + 0.1, v - 0.1, v + 0.25, v + 1, v - 0.05 * 4].filter(x => x > 0.5);
        this.buildMicro(s, v);
      } else {
        v = Math.round(rnd(12, 88) * 20) / 20;
        opts = [v + 1, v - 1, v + 0.5, v - 0.5, v + 0.25, v - 0.3, v + 0.2].filter(x => x > 1);
        this.buildCal(s, v);
      }
      const d = micro ? 2 : 2;
      const ch = [v]; for (const x of opts.sort(() => Math.random() - 0.5)) { if (ch.length >= 4) break; if (!ch.some(y => Math.abs(y - x) < 0.04)) ch.push(x); }
      s.v = v; s.choices = ch.sort(() => Math.random() - 0.5); s.rt = 0; s.answered = false;
      s.btns.innerHTML = s.choices.map((x, i) => `<div class="m3-btn" data-i="${i}"><kbd>${i + 1}</kbd> ${fmt(x, d)} mm</div>`).join('');
      s.btns.querySelectorAll('.m3-btn').forEach(b => b.addEventListener('pointerdown', e => { e.stopPropagation(); if (st === s && s.phase === 'play') this.answer(s, +b.dataset.i); }));
      s.tagN.innerHTML = `Mesure <b>${s.i + 1}/3</b> · ${micro ? 'micromètre (0,01 mm)' : 'pied à coulisse au 1/20 (0,05 mm)'}`;
      if (micro) { s.camLook.set(-0.7, -0.55, 0); s.camBase.set(-0.7, -0.25, 5.4); } else { s.camLook.set(2.5, -0.55, 0); s.camBase.set(2.5, -0.4, 5.9); }
    },
    buildCal(s, v) {
      const k = 0.15, m0 = Math.floor(v) - 8, m1 = m0 + 60, ppm = 40, H = 200;
      const c = canvas((m1 - m0) * ppm, H), x = c.getContext('2d');
      x.fillStyle = '#d7dde2'; x.fillRect(0, 0, c.width, H); x.fillStyle = '#1b1f26'; x.textAlign = 'center'; x.font = 'bold 54px Arial';
      for (let m = m0; m <= m1; m++) { if (m < 0) continue; const px = (m - m0) * ppm, L = m % 10 === 0 ? 90 : m % 5 === 0 ? 62 : 40; x.fillRect(px - 2, H - L, 4, L); if (m % 10 === 0) x.fillText(String(m / 10), px, H - 100); }
      const bt = tex(c), bw = (m1 - m0) * k, bh = H / ppm * k;
      box(bw + 0.5, bh + 0.25, 0.12, PAL.steel, ((m0 + m1) / 2 - v) * k, bh / 2 + 0.05, -0.07, s.inst, 0.02);
      const bm = mesh(G_(new THREE.PlaneGeometry(bw, bh)), new THREE.MeshBasicMaterial({ map: bt }), s.inst, ((m0 + m1) / 2 - v) * k, bh / 2, 0.1); st.mats.push(bm.material);
      // vernier au 1/20 : 20 divisions sur 39 mm
      const vm = 42, c2 = canvas(vm * ppm, H), y = c2.getContext('2d'), off = 1.5;
      y.fillStyle = '#eef1f3'; y.fillRect(0, 0, c2.width, H); y.fillStyle = '#1b1f26'; y.textAlign = 'center'; y.font = 'bold 46px Arial';
      for (let i = 0; i <= 20; i++) { const px = (off + i * 1.95) * ppm, L = i % 2 === 0 ? 70 : 44; y.fillRect(px - 2, 0, 4, L); if (i % 2 === 0) y.fillText(String(i / 2), px, L + 48); }
      const vt = tex(c2), vw = vm * k, vh = H / ppm * k;
      box(vw + 0.3, vh + 0.6, 0.2, PAL.machine, (vm / 2 - off) * k, -vh / 2 - 0.2, -0.02, s.inst, 0.03);
      const pm = mesh(G_(new THREE.PlaneGeometry(vw, vh)), new THREE.MeshBasicMaterial({ map: vt }), s.inst, (vm / 2 - off) * k, -vh / 2, 0.1); st.mats.push(pm.material);
      box(0.5, 2.2, 0.2, PAL.machine, -0.3, -1.6, 0, s.inst, 0.04);
      box(3, 1.3, 0.8, flat(matCol(s.opts.mat)), -1.8, -2.0, -0.2, s.inst);
    },
    buildMicro(s, v) {
      const k = 0.25, ppm = 40, H = 220;
      const c = canvas(26 * ppm, H), x = c.getContext('2d');
      x.fillStyle = '#d7dde2'; x.fillRect(0, 0, c.width, H); x.fillStyle = '#1b1f26'; x.textAlign = 'center'; x.font = 'bold 46px Arial';
      x.fillRect(0, H / 2 - 2, c.width, 4);
      for (let i = 0; i <= 50; i++) { const m = i / 2; if (m > v + 0.001) break; const px = (m + 0.5) * ppm; if (i % 2 === 0) { const L = m % 5 === 0 ? 60 : 42; x.fillRect(px - 2, H / 2 - L, 4, L); if (m % 5 === 0) x.fillText(String(m), px, H / 2 - 70); } else x.fillRect(px - 2, H / 2, 4, 42); }
      const sw = 26 * k, sh = H / ppm * k;
      const sl = cyl(0.7, 0.7, 9, PAL.steel, 24, s.inst, -4.5, 0, -0.1); sl.rotation.z = Math.PI / 2;
      const pm = mesh(G_(new THREE.PlaneGeometry(sw, sh)), new THREE.MeshBasicMaterial({ map: tex(c) }), s.inst, (12.5 - v) * k, 0, 0.61); st.mats.push(pm.material);
      // tambour : 50 divisions (0,01 mm), la division lue face au trait de référence
      const read = Math.round(v * 100) % 50, W = 1600, c2 = canvas(W, 256), y = c2.getContext('2d');
      y.fillStyle = '#e3e8ec'; y.fillRect(0, 0, W, 256); y.fillStyle = '#1b1f26'; y.font = 'bold 44px Arial'; y.textAlign = 'left'; y.textBaseline = 'middle';
      for (let d = 0; d < 50; d++) {
        const u = ((d - read) / 50 + 1) % 1;
        for (const px of [u * W, u * W - W, u * W + W]) {
          if (px < -60 || px > W + 60) continue;
          const L = d % 5 === 0 ? 80 : 50; y.fillRect(px - 2, 256 - L, 4, L);
          if (d % 5 === 0) { y.save(); y.translate(px, 256 - L - 8); y.rotate(-Math.PI / 2); y.fillText(String(d), 0, 0); y.restore(); }
        }
      }
      const th = cyl(0.8, 0.8, 3.2, new THREE.MeshBasicMaterial({ map: tex(c2) }), 48, s.inst, 1.6, 0, 0); th.rotation.z = -Math.PI / 2; st.mats.push(th.material);
      const bev = cyl(0.8, 0.66, 0.12, PAL.steel, 48, s.inst, -0.06, 0, 0); bev.rotation.z = -Math.PI / 2;
      const rt = cyl(0.55, 0.55, 1.2, PAL.steelDark, 16, s.inst, 3.8, 0, 0); rt.rotation.z = -Math.PI / 2;
      box(1, 3, 0.5, PAL.lebecBlue, -6.6, -1.2, -0.2, s.inst);
    },
    answer(s, i) {
      if (s.answered) return; s.answered = true;
      const ok = Math.abs(s.choices[i] - s.v) < 0.001, b = s.btns.querySelectorAll('.m3-btn');
      b.forEach((e, j) => e.classList.add(Math.abs(s.choices[j] - s.v) < 0.001 ? 'good' : j === i ? 'bad' : 'off'));
      if (ok) { const g = 25 + 8.33 * clamp(1 - s.rt / s.per, 0, 1); s.pts += g; s.combo++; pop(`JUSTE ! +${Math.round(g)}`, 'good'); sfx('success', 0.6); }
      else { s.combo = 0; pop(`FAUX : c'était ${fmt(s.v, 2)} mm`, 'bad'); sfx('error'); shake(0.05); }
      s.wait = 1.1;
    },
    tick(s, dt) {
      if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) this.next(s); }
      else {
        s.rt += dt;
        for (let i = 0; i < 4; i++) if (hit('Digit' + (i + 1), 'Numpad' + (i + 1))) { this.answer(s, i); break; }
        if (!s.answered && s.rt > s.per) { s.answered = true; pop(`TROP LENT : ${fmt(s.v, 2)} mm`, 'bad'); sfx('error'); s.wait = 1.1; s.btns.querySelectorAll('.m3-btn').forEach((e, j) => e.classList.add(Math.abs(s.choices[j] - s.v) < 0.001 ? 'good' : 'off')); }
      }
      s.timeFrac = s.wait > 0 ? 0 : 1 - s.rt / s.per;
      s.camBase.x += Math.sin(s.t * 0.7) * 0.0015;
      live(`Score <b>${Math.round(s.pts)}</b>`);
    },
    timeout(s) { finish(s.pts, 'Contrôle terminé.'); },
    score(s) { return s.pts; }
  };

  /* =====================================================================
     8. ÉBAVURAGE / AFFÛTAGE AU TOURET
     ===================================================================== */
  GAMES.touret = {
    setup(s, o) {
      const sharpen = s.sharpen = o.phase === 'worn' || o.sharpen;
      s.title = sharpen ? '✨ Affûtage au touret' : '✨ Ébavurage au touret';
      s.info = (sharpen ? 'Ravive l\'<b>arête émoussée</b>' : 'Fais disparaître les <b>bavures</b>') + ' en frottant contre la meule (<b>souris</b>). Ça chauffe : <b>Espace</b> = tremper dans le seau. Bleu = brûlé !';
      s.hint = '<kbd>Souris</kbd> : déplacer la pièce · <kbd>Espace</kbd>/<kbd>Clic droit</kbd> : tremper dans l\'eau';
      s.noRust = true; s.dur = 16;
      s.camBase.set(-0.2, 0.9, 8.6); s.camLook.set(-0.2, 0.35, 0); s.floor = -2.3;
      s.wc = V(0.5, 1.55, 0); s.wr = 1.35;
      s.wheel = new THREE.Group(); s.wheel.position.copy(s.wc); s.scene.add(s.wheel);
      const wh = cyl(s.wr, s.wr, 0.5, flat(0xbfb6a8), 14, s.wheel); wh.rotation.x = Math.PI / 2;
      box(0.25, 0.1, 0.52, PAL.slate, 0, s.wr - 0.08, 0, s.wheel, 0.02);
      cyl(0.95, 0.95, 1.6, PAL.shutterGreen, 18, s.scene, 0.5, 1.55, -1.2).rotation.x = Math.PI / 2;
      box(3.2, 0.25, 0.75, PAL.slate, 0.5, 1.55 + s.wr + 0.15, 0, null, 0.04);
      box(1.2, 2.5, 1.2, PAL.shutterGreen, 0.5, -0.9, -1.2); box(6.5, 0.3, 2.6, PAL.wood, 0, -2.4, -0.4);
      s.buck = V(-2.7, -1.6, 0.4);
      cyl(0.75, 0.6, 1.1, PAL.steelDark, 16, s.scene, s.buck.x, s.buck.y - 0.3, s.buck.z);
      cyl(0.7, 0.7, 0.05, 0x47b3d6, 16, s.scene, s.buck.x, s.buck.y + 0.2, s.buck.z);
      s.part = new THREE.Group(); s.scene.add(s.part);
      s.pMat = M_(new THREE.MeshToonMaterial({ color: sharpen ? 0xff7a3f : matCol(o.mat), gradientMap: Sty.gradient }));
      s.baseCol = new THREE.Color(s.pMat.color.getHex());
      const pb = mesh(G_(new THREE.BoxGeometry(3.4, 0.5, 0.32)), s.pMat, s.part); pb.position.y = 0;
      box(1.2, 0.6, 0.5, PAL.black, -2.2, 0, 0, s.part, 0.05);
      const n = 12 + Math.round(o.diff * 6), cg = G_(new THREE.ConeGeometry(0.06, 1, 5)); s.burrs = [];
      for (let i = 0; i < n; i++) { const lx = -1.55 + (i + 0.5) * 3.1 / n + rnd(-0.04, 0.04), h = rnd(0.1, 0.24), m = mesh(cg, Sty.toon(sharpen ? PAL.steelDark : matCol(o.mat)), s.part, lx, 0.25 + h / 2, rnd(-0.08, 0.08)); m.scale.set(rnd(0.9, 1.6), h, 1); s.burrs.push({ m, lx, h, rem: 1 }); }
      s.px = -1; s.py = -1.2; s.heat = 0; s.burnt = false; s.gouge = 0; s.dunk = 0;
      s.hm = hum('sawtooth', 120, 0.03, 380); s.hg = hum('square', 1500, 0, 3500);
      s.gB = gauge(sharpen ? 'ARÊTE' : 'BAVURES'); s.gH = gauge('CHAUFFE', 'heat'); s.gH.zone2(0.55, 0.85);
      this.place(s);
    },
    place(s) { s.part.position.set(s.px, s.py, 0.15); },
    wy(s, x) { const dx = x - s.wc.x; return Math.abs(dx) < s.wr ? s.wc.y - Math.sqrt(s.wr * s.wr - dx * dx) : 99; },
    idle(s, dt) { s.wheel.rotation.z -= 22 * dt; this.place(s); },
    tick(s, dt) {
      s.wheel.rotation.z -= 22 * dt;
      if (s.dunk > 0) {
        s.dunk -= dt; s.px += (s.buck.x - s.px) * Math.min(1, dt * 14); s.py += (s.buck.y + 0.1 - s.py) * Math.min(1, dt * 14);
        if (s.dunk < 0.35) { s.heat = Math.max(0, s.heat - 260 * dt); if (Math.random() < 0.6) emit('steam', V(s.buck.x + rnd(-0.4, 0.4), s.buck.y + 0.4, s.buck.z), 1, { vel: { x: 0, y: 1.4, z: 0 }, spread: 0.3, life: 1 }); }
        this.place(s); this.color(s); this.hud(s); return;
      }
      if (hit('Space') || inp.rclick) { s.dunk = 0.7; sfx('blow', 0.7); pop('PSCHHHHH', 'combo', V(s.buck.x, s.buck.y + 1.2, 0)); return; }
      let tx = s.px, ty = s.py;
      if (performance.now() - inp.moved < 3000 || inp.down) { tx = 0.4 + clamp(inp.mx, -1.1, 1.1) * 2.7; ty = -1.3 + (clamp(inp.my, -1, 1) + 1) / 2 * 1.75; }
      s.px += (tx - s.px) * Math.min(1, dt * 14); s.py += (ty - s.py) * Math.min(1, dt * 14);
      // butée : la pièce ne rentre pas dans la meule de plus de 0,07
      let minW = 99; for (let x = s.px - 1.7; x <= s.px + 1.7; x += 0.1) minW = Math.min(minW, this.wy(s, x));
      const top = s.py + 0.25, pen = top - minW;
      if (pen > 0.07) { s.py = minW + 0.07 - 0.25; }
      let contact = false;
      for (const b of s.burrs) {
        if (b.rem <= 0) continue;
        const bx = s.px + b.lx, w = this.wy(s, bx), btop = s.py + 0.25 + b.h * b.rem, p = btop - w;
        if (p > 0) {
          contact = true; b.rem = Math.max(0, b.rem - (0.9 + p * 9) * dt);
          b.m.scale.y = Math.max(0.001, b.h * b.rem); b.m.position.y = 0.25 + b.h * b.rem / 2;
          if (Math.random() < 0.8) emit(Math.random() < 0.5 ? 'spark' : 'spark2', V(bx, w, 0.3), 2, { vel: { x: rnd(2, 4.5), y: rnd(-1.5, 0.5), z: rnd(0.5, 2) }, spread: 0.8, life: 0.45, grav: 6 });
          if (b.rem <= 0) { s.combo++; if (s.combo % 4 === 0) pop('NICKEL ×' + s.combo, 'combo', V(bx, w + 0.6, 0.3)); }
        }
      }
      const pc = top - minW;
      if (pc > 0) {
        contact = true; s.gouge += dt; s.heat += 40 * dt; shake(0.03);
        emit('spark', V(s.px + 0.4, minW, 0.3), 2, { vel: { x: 4, y: -0.5, z: 1 }, spread: 1, life: 0.4, grav: 6 });
        if (cool('trop', 1.5)) { pop('TROP APPUYÉ !', 'bad', V(s.px, s.py + 1, 0.3)); sfx('error', 0.4); }
      }
      if (contact) { s.heat += 15 * dt; shake(0.012); } else s.heat = Math.max(0, s.heat - 5 * dt);
      s.heat = Math.min(100, s.heat);
      if (s.heat >= 88 && !s.burnt) { s.burnt = true; pop(s.sharpen ? 'BLEUI ! Arête détrempée !' : 'BRÛLÉ ! Bleu = détrempé !', 'bad'); sfx('fail'); flash('rgba(64,96,208,.35)'); }
      s.hg.set(1400 + Math.random() * 300, contact ? 0.03 : 0);
      this.place(s); this.color(s); this.hud(s);
      if (s.burrs.every(b => b.rem <= 0)) finish(this.score(s) + 8 * clamp(1 - s.t / s.dur, 0, 1), s.burnt ? 'Propre… mais bleui.' : 'Plus une bavure. Ça brille !');
    },
    color(s) {
      const h = s.heat / 100, c = s.pMat.color.copy(s.baseCol);
      if (h > 0.3) c.lerp(tmpCol.setHex(0xe0b050), clamp((h - 0.3) / 0.3, 0, 1));
      if (h > 0.6) c.lerp(tmpCol.setHex(0x3f5fd0), clamp((h - 0.6) / 0.3, 0, 1));
      if (s.burnt) c.lerp(tmpCol.setHex(0x3f5fd0), 0.4);
    },
    hud(s) {
      const f = s.burrs.reduce((a, b) => a + (1 - b.rem), 0) / s.burrs.length;
      s.gB.set(f, Math.round(f * 100) + ' %'); s.gH.set(s.heat / 100, Math.round(s.heat * 3) + ' °C');
      live(`${s.sharpen ? 'Affûtage' : 'Ébavurage'} <b>${Math.round(f * 100)} %</b>` + (s.burnt ? ' · <b class="r">BRÛLÉ</b>' : ''));
    },
    score(s) { const f = s.burrs.reduce((a, b) => a + (1 - b.rem), 0) / s.burrs.length; return 100 * f - (s.burnt ? 30 : 0) - Math.min(25, s.gouge * 12); }
  };

  /* =====================================================================
     9. SERRAGE MANDRIN 4 MORS / BRIDAGE (en étoile, sans écraser l'alu)
     ===================================================================== */
  GAMES.chuck = {
    setup(s, o) {
      const lathe = s.lathe = o.mtype !== 'fraiseuse', N = s.N = lathe ? 4 : 6, col = matCol(o.mat === 'acier' && Math.random() < 0.5 ? 'alu' : o.mat);
      s.alu = col === matCol('alu');
      s.title = lathe ? '🗜 Serrage au mandrin 4 mors' : '🗜 Bridage de la pièce';
      s.info = 'Serre <b>en étoile</b> (toujours l\'<b>opposé</b> ensuite) : 1er tour = <b>pré-serrage</b>, 2e tour = <b>serrage final</b>. Maintiens sur une vis, relâche dans le <b class="g">vert</b>.' + (s.alu ? ' Pièce en <b>ALU</b> : doucement !' : '');
      s.hint = '<kbd>Clic</kbd> maintenu sur une vis (ou <kbd>1</kbd>…<kbd>' + N + '</kbd> puis <kbd>Espace</kbd> maintenu)';
      s.noRust = true; s.dur = 22;
      s.camBase.set(0.3, 0.5, 8.6); s.camLook.set(0.2, 0, 0);
      if (lathe) {
        const f = cyl(2.5, 2.5, 1, flat(PAL.steelDark), 16, s.scene, 0, 0, -0.5); f.rotation.x = Math.PI / 2;
        cyl(2.65, 2.65, 0.6, PAL.lebecBlue, 20, s.scene, 0, 0, -1.2).rotation.x = Math.PI / 2;
      } else {
        box(6.4, 5.0, 0.6, PAL.steelDark, 0, 0, -0.3);
        for (let i = -2; i <= 2; i++) box(6.2, 0.14, 0.1, PAL.black, 0, i * 0.95, 0.02, null, 0.01);
      }
      s.part = cyl(0.75, 0.75, 1.4, flat(col), 16, s.scene, 0, 0, 0.7); s.part.rotation.x = Math.PI / 2;
      s.holes = [];
      for (let i = 0; i < N; i++) {
        const a = Math.PI / 2 + i * Math.PI * 2 / N, ca = Math.cos(a), sa = Math.sin(a), g = new THREE.Group(); s.scene.add(g);
        if (lathe) { const j = box(0.55, 1.0, 0.5, PAL.steel, ca * 1.35, sa * 1.35, 0.25, g); j.rotation.z = a - Math.PI / 2; }
        else { const b = box(1.6, 0.28, 0.3, PAL.lebecBlue, ca * 1.35, sa * 1.35, 0.45, g); b.rotation.z = a; }
        const hp = V(ca * 2.0, sa * 2.0, lathe ? 0.02 : 0.62);
        const hm = cyl(0.2, 0.2, 0.1, lathe ? PAL.black : PAL.steel, lathe ? 4 : 6, g, hp.x, hp.y, hp.z); hm.rotation.x = Math.PI / 2;
        const lb = el('div', 'm3-num', String(i + 1)); dom.layer.appendChild(lb);
        s.holes.push({ a, p: hp, g, jaw: g.children[0], lb, tq: [0, 0], done: [false, false] });
      }
      s.key = new THREE.Group(); s.scene.add(s.key); s.key.visible = false;
      cyl(0.07, 0.07, 1.1, PAL.lebecYellow, 6, s.key, 0, 0, 0.55).rotation.x = Math.PI / 2; box(1.1, 0.12, 0.12, PAL.lebecYellow, 0, 0, 1.1, s.key, 0.03);
      // comparateur
      s.dial = new THREE.Group(); s.dial.position.set(3.1, 1.5, 0.9); s.dial.scale.setScalar(0.85); s.scene.add(s.dial);
      cyl(0.55, 0.55, 0.15, PAL.white, 20, s.dial).rotation.x = Math.PI / 2; cyl(0.6, 0.6, 0.12, PAL.red, 20, s.dial, 0, 0, -0.05).rotation.x = Math.PI / 2;
      s.needle = box(0.05, 0.45, 0.04, PAL.black, 0, 0.2, 0.1, s.dial, 0.01);
      box(0.06, 1.6, 0.06, PAL.steel, -1.2, -0.85, 0.2, s.dial).rotation.z = 0.9;
      s.round = 0; s.need = null; s.sel = 0; s.hold = 0; s.cur = -1; s.orderErr = 0; s.zoneErr = 0; s.runout = 0; s.crushed = false;
      s.zones = [[30, 55], [70, 88]];
      s.gT = gauge('COUPLE'); s.tagR = tag(''); this.zoneUI(s);
    },
    zoneUI(s) { const z = s.zones[s.round]; s.gT.zone(z[0] / 100, z[1] / 100); s.gT.zone2(z[1] / 100, 1); s.tagR.innerHTML = s.round === 0 ? 'Tour 1/2 : <b>PRÉ-SERRAGE</b>' : 'Tour 2/2 : <b class="r">SERRAGE FINAL</b>'; },
    idle(s, dt) { this.labels(s); },
    labels(s) {
      for (let i = 0; i < s.N; i++) {
        const h = s.holes[i], p = toScreen(h.p);
        h.lb.style.left = p.x + 'px'; h.lb.style.top = p.y + 'px';
        h.lb.className = 'm3-num' + (h.done[s.round] ? ' done' : '') + (s.need === i ? ' need' : '') + (s.cur === i ? ' sel' : '');
      }
    },
    commit(s, i) {
      const h = s.holes[i], r = s.round, z = s.zones[r], t = h.tq[r];
      if (s.need !== null && i !== s.need) { s.orderErr++; s.runout += 0.35; pop('PAS EN ÉTOILE ! L\'opposé d\'abord', 'bad', h.p); sfx('error'); shake(0.08); }
      h.done[r] = true;
      const opp = (i + s.N / 2) % s.N; s.need = !s.holes[opp].done[r] ? opp : null;
      if (t < z[0]) { s.zoneErr++; pop('Pas assez serré', 'warn', h.p); sfx('drop'); }
      else if (t > z[1]) { s.zoneErr++; pop('Trop fort…', 'warn', h.p); sfx('clang', 0.4); }
      else { s.combo++; pop(s.combo > 2 ? 'NICKEL ×' + s.combo : 'NICKEL', 'good', h.p); sfx('pickup', 0.6); }
      if (t <= z[0] || t > z[1]) s.combo = 0;
      if (s.holes.every(q => q.done[r])) {
        if (r === 0) { s.round = 1; s.need = null; this.zoneUI(s); pop('SERRAGE FINAL !', 'combo'); sfx('order'); }
        else return finish(this.score(s), s.orderErr ? 'Serré… mais pas en étoile : ça voile.' : 'Pièce bien centrée, bien serrée.');
      }
    },
    tick(s, dt) {
      // choix de la vis
      for (let i = 0; i < s.N; i++) if (hit('Digit' + (i + 1), 'Numpad' + (i + 1))) s.sel = i;
      const start = i => { const h = s.holes[i]; if (h.done[s.round]) { if (cool('deja', 1)) pop('Déjà serré : passe à une autre', 'warn', h.p); } else { s.cur = i; s.hold = 0; } };
      if (inp.click && s.cur < 0) {
        let best = -1, bd = 70; for (let i = 0; i < s.N; i++) { const p = toScreen(s.holes[i].p), d = Math.hypot(p.x - inp.px, p.y - inp.py); if (d < bd) { bd = d; best = i; } }
        if (best >= 0) { s.sel = best; start(best); }
      }
      if (hit('Space') && s.cur < 0) start(s.sel);
      const hold = inp.down || key('Space');
      if (s.cur >= 0) {
        const h = s.holes[s.cur];
        s.key.visible = true; s.key.position.copy(h.p);
        if (hold) {
          s.hold += dt; const r = s.round;
          h.tq[r] = Math.max(h.tq[r], r === 1 ? h.tq[0] : 0) + (34 + 55 * s.hold) * (s.alu ? 1.15 : 1) * dt;
          s.key.rotation.z -= 6 * dt;
          if (cool('cr', 0.13)) sfx('bip', 0.12 + h.tq[r] / 400);
          h.jaw.position.lerp(tmpV.set(Math.cos(h.a) * (1.35 - h.tq[r] / 900), Math.sin(h.a) * (1.35 - h.tq[r] / 900), h.jaw.position.z), 0.5);
          if (h.tq[r] > 100) {
            s.crushed = true; s.part.scale.set(1.25, 1, 0.7); emit('bit', V(0, 0, 1.2), 10, { color: matCol('alu'), vel: { x: 0, y: 2, z: 2 }, spread: 2, life: 1 });
            sfx('clang'); sfx('punch'); shake(0.35); flash('rgba(233,79,55,.4)');
            return finish(this.score(s), s.alu ? 'ALU ÉCRASÉ ! Le client va adorer…' : 'Pièce marquée : beaucoup trop serré !');
          }
          s.gT.set(h.tq[r] / 100, Math.round(h.tq[r]) + ' %');
        } else { this.commit(s, s.cur); s.cur = -1; s.key.visible = false; if (s.phase !== 'play') return; }
      }
      const wob = s.runout * (0.5 + 0.5 * Math.sin(s.t * 9));
      s.needle.parent.rotation.z = 0; s.needle.rotation.z = -wob * 1.2; s.needle.position.set(Math.sin(wob * 1.2) * 0.2, Math.cos(wob * 1.2) * 0.2, 0.1);
      s.part.position.x = s.runout * 0.05;
      this.labels(s);
      live(`Ordre <b>${s.orderErr ? s.orderErr + ' erreur(s)' : 'OK'}</b> · couple <b>${s.zoneErr ? s.zoneErr + ' raté(s)' : 'OK'}</b>`);
    },
    timeout(s) { finish(Math.min(35, this.score(s)), 'Trop long : la pièce est encore libre !'); },
    score(s) { return 100 - s.orderErr * 14 - s.zoneErr * 7 - (s.crushed ? 55 : 0) - Math.max(0, s.t - 15) * 3; }
  };
})();
