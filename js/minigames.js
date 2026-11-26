/* =====================================================================
   minigames.js — Mini-jeux locaux (le joueur seul, la partie continue
   autour de lui !). Chacun renvoie un résultat au rappel cb :
   - origine   : prise d'origine au palpeur (stoppe l'aiguille dans le vert)
   - plaquette : changement de plaquette (enchaîne les bonnes touches)
   - serrer    : réparer / réarmer (tape Espace vite)
   - pied      : contrôle au pied à coulisse (conforme ou pas ?)
   - quiz      : question de Jacky (MIP/MAP)
   - arexis    : remplir Arexis (formulaire absurde)
   Touches : Espace/E/clic, ZQSD, 1-4, Échap. Manette : A, X, Y, croix, B.
   ===================================================================== */
(function () {
  const M = ML.Mini = { open: false };
  const U = ML.U, I = ML.Input, $ = id => document.getElementById(id);
  const KEYN = { KeyW: 'Z', KeyA: 'Q', KeyS: 'S', KeyD: 'D' };
  let st = null;

  function show(title, html, hint) {
    M.el = M.el || $('mini');
    M.el.innerHTML = `<div class="mg-title">${title}</div><div class="mg-body">${html}</div><div class="mg-hint">${hint || ''}</div>`;
    M.el.classList.remove('hidden'); M.open = true; ML.ui.modal = 'mini';
  }
  function close(res) {
    const cb = st && st.cb; st = null; M.open = false; M.el.classList.add('hidden');
    if (ML.ui.modal === 'mini') ML.ui.modal = null;
    if (cb) cb(res);
  }
  M.forceClose = () => { if (ML.Mini3D) ML.Mini3D.forceClose(); if (M.open) { st = null; M.open = false; M.el.classList.add('hidden'); if (ML.ui.modal === 'mini') ML.ui.modal = null; } };
  const body = () => M.el.querySelector('.mg-body');
  const go = () => I.pressed('Space') || I.pressed('KeyE') || I.left;

  M.run = (type, data, cb) => {
    if (M.open || (ML.Mini3D && ML.Mini3D.isOpen)) return;
    data = data || {};
    switch (type) {
      case 'origine':
        st = { type, cb, t: 0, v: 0, dir: 1, speed: 1.6 + Math.random() * 0.8, w: 0.12 + Math.random() * 0.04, c: 0.3 + Math.random() * 0.4, done: 0 };
        show('🎯 Prise d\'origine', '<div class="mg-gauge"><i class="zone"></i><i class="zone2"></i><b class="needle"></b></div><p>Touche la pièce avec le palpeur : arrête l\'aiguille dans le <b style="color:#3ecf6e">VERT</b>.</p>', 'Espace / E / clic · Échap : passer');
        break;
      case 'plaquette': {
        const seq = []; for (let i = 0; i < 4; i++) seq.push(U.pick(Object.keys(KEYN)));
        st = { type, cb, t: 0, seq, i: 0, lim: 5, prev: {} };
        show('🔩 Changement de plaquette', `<div class="mg-seq">${seq.map((k, i) => `<span data-i="${i}">${KEYN[k]}</span>`).join('')}</div><p>Dévisser · retirer · tourner l'arête · revisser : tape les touches dans l'ordre !</p><div class="mg-bar"><i></i></div>`, 'Z Q S D (ou stick) · Échap : abandonner');
        break;
      }
      case 'serrer':
        st = { type, cb, t: 0, n: 0, need: data.need || 12, lim: 6 };
        show(data.title || '🔧 Réparation', `<p>${data.text || 'Serre les boulons : tape <b>Espace</b> le plus vite possible !'}</p><div class="mg-bar big"><i></i></div><div class="mg-timer"><i></i></div>`, 'Espace / E / A · Échap : abandonner');
        break;
      case 'pied': {
        const m = data.mes, val = m[3].toFixed(m[2] < 0.05 ? 3 : 2).replace('.', ',');
        st = { type, cb, t: 0 };
        show('📏 Contrôle au pied à coulisse', `<canvas id="mg-cal" width="420" height="110"></canvas><p><b>${U.esc(m[0])}</b> : ${String(m[1]).replace('.', ',')} ± ${String(m[2]).replace('.', ',')} mm</p><p class="mg-read">Lecture : <b>${val} mm</b></p><div class="mg-opts"><span><kbd>1</kbd> Conforme</span><span><kbd>2</kbd> Non conforme</span></div>`, '1 / 2 · Échap : annuler');
        drawCaliper($('mg-cal'), m[3]);
        break;
      }
      case 'quiz': {
        const q = U.pick(ML.QUIZ_JACKY), opts = U.shuffle(q.slice(1));
        st = { type, cb, t: 0, opts, good: q[1] };
        show('🔍 Jacky Foucher — audit', `<p class="mg-q">${U.esc(q[0])}</p><div class="mg-opts col">${opts.map((o, i) => `<span><kbd>${i + 1}</kbd> ${U.esc(o)}</span>`).join('')}</div>`, '1 à 4');
        break;
      }
      case 'arexis': {
        const Q = [['Entreprise d\'accueil ?', ['Mécanique Lebec', 'Naval Group (Fred insiste)', 'Je sais pas']], ['Numéro SIRET ?', ['12345678900012', 'Le même que l\'an dernier', '42']], ['Avis du tuteur ?', ['« Ça va. »', '« COUP DE PELLE »', '« Il vient le matin »']]];
        st = { type, cb, t: 0, Q, i: 0 };
        showArexis();
        break;
      }
    }
  };
  function showArexis() {
    const q = st.Q[st.i];
    show('💻 Arexis — formulaire n° 47b', `<p class="mg-q">Étape ${st.i + 1}/3 : ${U.esc(q[0])}</p><div class="mg-opts col">${q[1].map((o, i) => `<span><kbd>${i + 1}</kbd> ${U.esc(o)}</span>`).join('')}</div><p class="dim">(Fred lit par-dessus ton épaule.)</p>`, '1 à 3 · Échap : abandonner');
  }
  function drawCaliper(cv, v) {
    if (!cv) return; const x = cv.getContext('2d');
    x.fillStyle = '#1b222c'; x.fillRect(0, 0, 420, 110);
    x.fillStyle = '#c9d1d8'; x.fillRect(10, 30, 400, 26); x.fillRect(10, 10, 18, 80);
    const jaw = 60 + (v % 100) * 3; x.fillStyle = '#e2e8ee'; x.fillRect(jaw, 22, 60, 42); x.fillRect(jaw, 10, 16, 80);
    x.fillStyle = '#111'; for (let i = 0; i <= 38; i++) { const px = 22 + i * 10; x.fillRect(px, 30, 1, i % 5 ? 7 : 13); }
    x.fillStyle = '#ffd257'; x.font = 'bold 15px Arial'; x.fillText('LCD : ' + v.toFixed(3).replace('.', ',') + ' mm', jaw - 10, 100);
  }

  M.update = dt => {
    if (ML.Mini3D && ML.Mini3D.isOpen) ML.Mini3D.update(dt);   // mini-jeux 3D (minigames3d.js)
    if (!st) return;
    const now = performance.now();
    if (!st.started) { st.started = true; st.last = now; return; }   // la touche qui a ouvert le mini-jeu ne compte pas
    dt = Math.min(0.25, (now - st.last) / 1000); st.last = now;      // temps réel (même si l'affichage rame)
    st.t += dt;
    if (I.pressed('Escape')) return close(null);
    const el = body();
    switch (st.type) {
      case 'origine': {
        if (st.done) { st.done -= dt; if (st.done <= 0) close(st.res); return; }
        st.v += st.dir * st.speed * dt; if (st.v > 1) { st.v = 1; st.dir = -1; } if (st.v < 0) { st.v = 0; st.dir = 1; }
        el.querySelector('.needle').style.left = (st.v * 100) + '%';
        el.querySelector('.zone').style.cssText = `left:${(st.c - st.w / 2) * 100}%;width:${st.w * 100}%`;
        el.querySelector('.zone2').style.cssText = `left:${(st.c - st.w * 1.6) * 100}%;width:${st.w * 3.2 * 100}%`;
        if (go() || st.t > 6) {
          const d = Math.abs(st.v - st.c); st.res = st.t > 6 ? 'meh' : d < st.w / 2 ? 'ok' : d < st.w * 1.6 ? 'meh' : 'fail';
          el.insertAdjacentHTML('beforeend', `<p class="mg-res ${st.res}">${{ ok: 'PARFAIT ! Usinage plus rapide.', meh: 'Bof… ça passe.', fail: 'Raté ! Risque de pièce non conforme…' }[st.res]}</p>`);
          ML.Sfx.play(st.res === 'fail' ? 'error' : 'success'); st.done = 0.7;
        }
        return;
      }
      case 'plaquette': {
        el.querySelector('.mg-bar i').style.width = Math.max(0, 100 - 100 * st.t / st.lim) + '%';
        if (st.t > st.lim) { ML.Sfx.play('error'); return close('fail'); }
        for (const k of Object.keys(KEYN)) {
          const down = I.down(k) || (k === 'KeyW' && I.down('ArrowUp')) || (k === 'KeyS' && I.down('ArrowDown')) || (k === 'KeyA' && I.down('ArrowLeft')) || (k === 'KeyD' && I.down('ArrowRight'));
          if (down && !st.prev[k]) {
            if (k === st.seq[st.i]) { el.querySelector(`[data-i="${st.i}"]`).classList.add('ok'); st.i++; ML.Sfx.play('bip'); if (st.i >= st.seq.length) { ML.Sfx.play('success'); return close('ok'); } }
            else { el.querySelector(`[data-i="${st.i}"]`).classList.add('ko'); ML.Sfx.play('error'); return close('fail'); }
          }
          st.prev[k] = down;
        }
        return;
      }
      case 'serrer':
        if (I.pressed('Space') || I.pressed('KeyE') || I.left || I.pressed('Digit1')) { st.n++; ML.Sfx.play('bip'); }
        el.querySelector('.mg-bar i').style.width = Math.min(100, 100 * st.n / st.need) + '%';
        el.querySelector('.mg-timer i').style.width = Math.max(0, 100 - 100 * st.t / st.lim) + '%';
        if (st.n >= st.need) { ML.Sfx.play('success'); return close('ok'); }
        if (st.t > st.lim) { ML.Sfx.play('error'); return close('fail'); }
        return;
      case 'pied':
        if (I.pressed('Digit1') || I.pressed('Numpad1')) return close(true);
        if (I.pressed('Digit2') || I.pressed('Numpad2')) return close(false);
        return;
      case 'quiz':
        for (let i = 0; i < st.opts.length; i++) if (I.pressed('Digit' + (i + 1)) || I.pressed('Numpad' + (i + 1))) { const ok = st.opts[i] === st.good; ML.Sfx.play(ok ? 'success' : 'error'); return close(ok); }
        return;
      case 'arexis':
        for (let i = 0; i < 3; i++) if (I.pressed('Digit' + (i + 1)) || I.pressed('Numpad' + (i + 1))) { ML.Sfx.play('bip'); st.i++; if (st.i >= st.Q.length) return close('ok'); showArexis(); return; }
        return;
    }
  };
})();
