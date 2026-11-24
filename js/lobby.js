/* =====================================================================
   lobby.js — Menus : accueil (pseudo, solo, créer / rejoindre un salon),
   salon (5 joueurs, code à partager, lancement par l'hôte).
   ===================================================================== */
(function () {
  const L = ML.Lobby = {};
  const U = ML.U, N = ML.Net, $ = id => document.getElementById(id);

  L.init = () => {
    L.el = $('lobby');
    $('in-name').value = localStorage.getItem('ml_name') || '';
    $('in-server').value = N.defaultUrl();
    if (/^https?:/.test(location.protocol)) $('server-row').classList.add('hidden');
    $('btn-solo').onclick = () => { if (!L.name()) return; ML.Sfx.init(); ML.Game.start({ solo: true, seed: Date.now() >>> 0, me: 'solo', host: 'solo', players: [{ id: 'solo', name: L.name(), idx: 0 }] }); };
    $('btn-create').onclick = async () => { if (!L.name() || !(await L.ensure())) return; N.send({ t: 'create', priv: $('in-priv').checked }); };
    $('btn-join').onclick = async () => { const code = $('in-code').value.trim().toUpperCase(); if (!L.name()) return; if (code.length !== 4) return ML.HUD.toast('Le code fait 4 lettres.'); if (!(await L.ensure())) return; N.send({ t: 'join', code }); };
    $('btn-list').onclick = async () => { if (!L.name() || !(await L.ensure())) return; N.send({ t: 'list' }); };
    $('btn-start').onclick = () => N.send({ t: 'start', seed: (Math.random() * 1e9) >>> 0 });
    $('btn-leave').onclick = () => { N.send({ t: 'leave' }); L.showHome(); };
    $('btn-copy').onclick = () => { try { navigator.clipboard.writeText(N.room.code); ML.HUD.toast('Code copié !'); } catch (e) { /* rien */ } };

    N.on('status', s => { $('status').textContent = s; });
    N.on('relay', m => ML.Game.onRelay(m));
    N.on('err', m => ML.HUD.toast(m));
    N.on('rooms', list => {
      $('room-list').innerHTML = list.length ? list.map(r => `<button class="rl" data-code="${r.code}">${r.code} — ${U.esc(r.host)} (${r.n}/${r.max})</button>`).join('') : '<p class="dim">Aucun salon public. Crée le tien !</p>';
      for (const b of $('room-list').querySelectorAll('button')) b.onclick = () => N.send({ t: 'join', code: b.dataset.code });
    });
    N.on('room', room => {
      const G = ML.Game;
      if (!room) { if (G.on && !G.solo) G.stop(); L.showHome(); return; }
      if (G.on && !G.solo) {
        if (room.state === 'lobby') { G.stop('Retour au salon.'); L.showRoom(); return; }
        // un joueur est parti pour de bon : l'hôte libère ses affaires
        if (G.isHost) for (const pid in (G.S ? G.S.pl : {})) if (!room.players.find(p => p.id === pid)) ML.Sim.removePlayer(pid);
        return;
      }
      L.showRoom();
    });
    N.on('start', m => {
      const r = m.room;
      ML.Sfx.init();
      ML.Game.start({ seed: m.seed, me: N.id, host: r.host, players: r.players.map(p => ({ id: p.id, name: p.name, idx: p.idx })) });
    });
    N.on('host', id => { const G = ML.Game; if (G.on && !G.solo && id !== G.host) { G.stop("L'hôte a quitté la partie."); L.showRoom(); } else if (!G.on) L.showRoom(); });
    N.on('unstable', () => ML.HUD.toast('Connexion instable… reconnexion en cours.'));
    N.on('resumed', () => ML.HUD.toast('Reconnecté !'));
    N.on('lost', () => { ML.Game.stop('Connexion perdue.'); L.showHome(); ML.HUD.toast('Connexion au serveur perdue.'); });
    L.showHome();
  };

  L.name = () => {
    const n = $('in-name').value.trim().slice(0, 16);
    if (!n) { ML.HUD.toast('Choisis un pseudo !'); $('in-name').focus(); return null; }
    localStorage.setItem('ml_name', n);
    if (N.online && n !== N.name) { N.name = n; N.send({ t: 'name', name: n }); }
    return n;
  };
  L.ensure = async () => {
    if (N.online) return true;
    $('status').textContent = 'Connexion...';
    return N.connect($('in-server').value.trim() || N.defaultUrl(), L.name());
  };

  L.show = () => { L.el.classList.remove('hidden'); };
  L.hide = () => { L.el.classList.add('hidden'); };
  L.showHome = () => { L.show(); $('scr-home').classList.remove('hidden'); $('scr-room').classList.add('hidden'); };
  L.showRoom = () => {
    const r = N.room; if (!r) return L.showHome();
    L.show(); $('scr-home').classList.add('hidden'); $('scr-room').classList.remove('hidden');
    $('room-code').textContent = r.code;
    const slots = [];
    for (let i = 0; i < r.max; i++) {
      const p = r.players[i];
      slots.push(p ? `<div class="pslot"><i style="background:${ML.COLORS[p.idx % 5].css}"></i>${U.esc(p.name)}${p.id === r.host ? ' 👑' : ''}${p.id === N.id ? ' (toi)' : ''}${p.on ? '' : ' <span class="dim">(reconnexion…)</span>'}</div>` : '<div class="pslot empty">— place libre —</div>');
    }
    $('room-players').innerHTML = slots.join('');
    const host = r.host === N.id;
    $('btn-start').classList.toggle('hidden', !host);
    $('room-wait').classList.toggle('hidden', host);
    $('room-wait').textContent = r.state === 'game' ? 'Partie en cours…' : "En attente que l'hôte lance la journée…";
  };
  L.backToRoom = () => { if (N.room) L.showRoom(); else L.showHome(); };

  /** Fin de journée : rejouer (hôte ou solo) */
  L.replay = () => {
    const G = ML.Game;
    if (G.solo) { const me = G.players[G.me]; G.start({ solo: true, seed: Date.now() >>> 0, me: G.me, host: G.me, players: [me] }); }
    else if (G.isHost) N.send({ t: 'start', seed: (Math.random() * 1e9) >>> 0 });
  };
  L.leaveAfterEnd = () => {
    const G = ML.Game;
    if (G.solo) { G.stop(); L.showHome(); return; }
    if (G.isHost) { N.send({ t: 'end' }); return; }
    N.send({ t: 'leave' }); G.stop(); L.showHome();
  };
})();
