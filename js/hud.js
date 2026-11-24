/* =====================================================================
   hud.js — Interface en jeu : tickets façon Overcooked, horloge, score,
   satisfaction, équipe, mini-carte, inventaire (3 places), messages,
   aide (Tab), bilan de fin de journée.
   ===================================================================== */
(function () {
  const H = ML.HUD = { tick: 0 };
  const U = ML.U, $ = id => document.getElementById(id);
  const STEP_ICON = { fonderie: '🔥', chaudro: '⚙️', usinage: '🛠️', tth: '♨️', livraison: '🚚' };

  H.init = () => {
    H.el = {};
    for (const id of ['hud', 'clock', 'score', 'sat', 'finds', 'tickets', 'team', 'prompt', 'notifs', 'subtitle', 'big', 'flash', 'inventory', 'stamina', 'drive', 'pause', 'help', 'end', 'endcard', 'hostlost', 'minimap', 'toasts'])
      H.el[id] = $(id);
    H.el.inventory.innerHTML = [0, 1, 2].map(i => `<div class="slot"><span class="k">${i + 1}</span><span class="ic"></span><span class="nm"></span></div>`).join('');
    H.slots = [...H.el.inventory.querySelectorAll('.slot')];
    H.el.pause.onclick = () => ML.Input.lock();
    H.buildMap();
  };

  H.startGame = () => { H.el.hud.classList.remove('hidden'); H.el.end.classList.add('hidden'); H.el.help.classList.add('hidden'); ML.Lobby.hide(); H.el.notifs.innerHTML = ''; };
  H.stopGame = () => { for (const k of ['hud', 'end', 'help', 'pause', 'hostlost']) H.el[k].classList.add('hidden'); };
  H.showPause = b => { if (!H.el) return; H.el.pause.classList.toggle('hidden', !b); };

  /* ---------- Mise à jour ---------- */
  H.update = dt => {
    const G = ML.Game, S = G.S, p = G.p;
    H.el.stamina.style.width = (100 * p.stamina / ML.CFG.PLAYER.stamina) + '%';
    let pr = '';
    if (p.car !== null) pr = Math.abs(ML.Cars.list[p.car].speed) < 2 ? '<b>[E]</b> Descendre' : '';
    else if (G.cur) pr = `<b>[E]</b> ${U.esc(G.cur.label)}`;
    if (pr !== H._pr) { H.el.prompt.innerHTML = pr; H._pr = pr; }
    if (p.car !== null) {
      const c = ML.Cars.list[p.car], bed = S ? S.cars[p.car].bed : [];
      H.el.drive.classList.remove('hidden');
      H.el.drive.innerHTML = `<div class="spd">${Math.round(Math.abs(c.speed) * 3.6)} km/h</div>Benne : ${bed.length}/${ML.CFG.CAR.cap}<br>${bed.map(it => ML.Items.icon(it) + ' ' + U.esc(ML.Items.name(it))).join('<br>')}<br><span class="dim">V : vue · H : klaxon · E : descendre</span>`;
    } else H.el.drive.classList.add('hidden');
    // bandeau « hôte injoignable »
    const lost = !G.isHost && performance.now() - G.lastSnap > 6000;
    H.el.hostlost.classList.toggle('hidden', !lost);
    if (!G.isHost && performance.now() - G.lastSnap > 35000) { G.stop("L'hôte ne répond plus : partie terminée."); ML.Lobby.backToRoom(); return; }

    H.tick -= dt; if (H.tick > 0 || !S) return; H.tick = 0.2;
    const min = G.clockMin();
    H.el.clock.textContent = U.fmt(Math.min(min, ML.CFG.DAY_END)) + (min >= 17 * 60 ? ' 🌙' : '');
    H.el.score.textContent = S.score;
    H.el.sat.style.width = S.sat + '%'; H.el.sat.style.background = S.sat < 30 ? '#e74c3c' : S.sat < 55 ? '#f39c12' : '#3ecf6e';
    H.el.finds.textContent = `★ ${S.finds.got}/${S.finds.total}`;
    // inventaire
    const inv = S.pl[G.me] ? S.pl[G.me].inv : [];
    H.slots.forEach((s, i) => {
      const it = inv[i];
      s.classList.toggle('sel', i === p.sel); s.classList.toggle('bulky', ML.Items.bulky(it));
      s.querySelector('.ic').textContent = it ? ML.Items.icon(it) : '';
      s.querySelector('.nm').textContent = it ? ML.Items.name(it) : '—';
    });
    H.renderTickets(S);
    H.renderTeam(S);
    H.drawMap(S);
  };

  /* ---------- Tickets ---------- */
  function stepState(o, st) {
    if (st === 'usinage') return o.m ? `sur ${o.m}` : o.src ? 'brut prêt → machine' : `brut ${ML.MATERIALS[o.mat].label} → ${ML.MTYPE[o.mtype]}`;
    if (st === 'fonderie' || st === 'chaudro') return o.q ? 'en cours...' : `commander chez ${ML.COMPANIES[st].name.split(' ')[0]}`;
    if (st === 'tth') return o.q ? 'au four...' : 'caisse → TTH Ouest';
    return `livrer à ${ML.COMPANIES[o.client].name}`;
  }
  H.renderTickets = S => {
    const html = S.orders.slice().sort((a, b) => a.dl - b.dl).map(o => {
      const left = Math.max(0, o.dl - S.rt), frac = left / o.dur, C = ML.COMPANIES[o.client], st = o.steps[o.si];
      const col = frac > 0.5 ? '#3ecf6e' : frac > 0.25 ? '#f39c12' : '#e74c3c';
      const steps = o.steps.map((s, i) => `<span class="${i < o.si ? 'done' : i === o.si ? 'cur' : ''}">${STEP_ICON[s]}</span>`).join('<i>›</i>');
      return `<div class="ticket ${frac < 0.25 ? 'urgent' : ''}" style="--c:#${new THREE.Color(C.roof).getHexString()}">
        <div class="tk-head"><b>#${o.id}</b> ${U.esc(C.name)}<span>${Math.ceil(left)} s</span></div>
        <div class="tk-part">${U.esc(o.part)}</div>
        <div class="tk-chips"><span style="background:${ML.MATERIALS[o.mat].css};color:#111">${ML.MATERIALS[o.mat].label}</span><span>${ML.MTYPE[o.mtype]}</span><span style="background:${ML.TOOLS[o.tool].css};color:#111">${ML.TOOLS[o.tool].label}</span></div>
        <div class="tk-steps">${steps}</div>
        <div class="tk-now">${U.esc(stepState(o, st))}</div>
        <div class="tk-bar"><i style="width:${(frac * 100).toFixed(1)}%;background:${col}"></i></div></div>`;
    }).join('') || '<div class="ticket empty">Pas de ticket pour l\'instant…</div>';
    if (html !== H._tk) { H.el.tickets.innerHTML = html; H._tk = html; }
  };

  H.renderTeam = S => {
    const G = ML.Game;
    const html = Object.keys(S.pl).map(pid => {
      const P = S.pl[pid], c = ML.COLORS[P.idx % 5], sel = pid === G.me ? G.p.sel : (G.remote[pid] ? G.remote[pid].sel || 0 : 0), it = P.inv[sel];
      const off = !G.solo && ML.Net.room && !(ML.Net.room.players.find(x => x.id === pid) || {}).on;
      return `<div class="tm"><i style="background:${c.css}"></i>${U.esc(P.name)}${pid === G.me ? ' (toi)' : ''}${pid === G.host && !G.solo ? ' 👑' : ''} <span>${P.car !== null ? '🚗' : ''}${it ? ML.Items.icon(it) : ''}${off ? ' ⚠ déco' : ''}</span></div>`;
    }).join('');
    if (html !== H._tm) { H.el.team.innerHTML = html; H._tm = html; }
  };

  /* ---------- Messages ---------- */
  H.notify = (text, type) => {
    const d = document.createElement('div'); d.className = 'notif ' + (type || ''); d.textContent = text;
    H.el.notifs.appendChild(d);
    while (H.el.notifs.children.length > 6) H.el.notifs.firstChild.remove();
    setTimeout(() => d.remove(), 7000);
  };
  H.subtitle = (name, text) => { H.el.subtitle.innerHTML = `<b>${U.esc(name)} :</b> ${U.esc(text)}`; clearTimeout(H._st); H._st = setTimeout(() => { H.el.subtitle.innerHTML = ''; }, 4500); };
  H.big = (text, color) => { const b = H.el.big; b.textContent = text; b.style.color = color || '#ff3b30'; b.style.opacity = 1; clearTimeout(H._bg); H._bg = setTimeout(() => { b.style.opacity = 0; }, 2200); };
  H.flash = color => { const f = H.el.flash; f.style.background = color || '#fff'; f.style.opacity = 0.9; setTimeout(() => { f.style.opacity = 0; }, 300); };
  H.toast = text => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = text; H.el.toasts.appendChild(d); setTimeout(() => d.remove(), 5000); };
  H.toggleHelp = () => {
    const open = H.el.help.classList.contains('hidden');
    H.el.help.classList.toggle('hidden', !open);
    if (open) { ML.ui.modal = 'help'; ML.Input.unlock(); H.showPause(false); } else { ML.ui.modal = null; ML.Input.lock(); }
  };

  /* ---------- Fin de journée ---------- */
  H.showEnd = r => {
    const G = ML.Game;
    ML.ui.modal = 'end'; ML.Input.unlock(); H.showPause(false);
    const stars = [1, 2, 3].map(i => `<span class="${i <= r.stars ? 'on' : ''}">★</span>`).join('');
    const verdict = r.stars >= 3 ? "« Pas mal. Pour des jeunes formés par l'Éducation Nationale. »" : r.stars >= 1 ? '« Ça passe. Demain on ne traîne pas ! »' : '« Si UsiFlash voit ça... COUP DE PELLE ! »';
    let btns;
    if (G.solo) btns = '<button id="end-again">Rejouer</button><button id="end-menu" class="sec">Menu</button>';
    else if (G.isHost) btns = '<button id="end-again">Nouvelle journée (même équipe)</button><button id="end-menu" class="sec">Retour au salon</button>';
    else btns = '<p class="dim">En attente de l\'hôte…</p><button id="end-menu" class="sec">Quitter le salon</button>';
    H.el.endcard.innerHTML = `<h1>Fin de journée</h1><div class="stars">${stars}</div>
      <table><tr><td>Score d'équipe</td><td><b>${r.score}</b></td></tr><tr><td>Tickets livrés / ratés</td><td>${r.served} / ${r.failed}</td></tr>
      <tr><td>Trouvailles</td><td>${r.finds}/${r.findsTotal}</td></tr><tr><td>Satisfaction client</td><td>${r.sat} %</td></tr>
      <tr><td>Étoiles</td><td class="dim">★ ${r.need[0]} · ★★ ${r.need[1]} · ★★★ ${r.need[2]}</td></tr></table>
      <p><i>François Lebec : ${verdict}</i></p><div class="btns">${btns}</div>`;
    H.el.end.classList.remove('hidden');
    const again = $('end-again'), menu = $('end-menu');
    if (again) again.onclick = () => ML.Lobby.replay();
    menu.onclick = () => ML.Lobby.leaveAfterEnd();
  };

  /* ---------- Mini-carte ---------- */
  const MAP = { minX: -170, maxX: 170, minZ: -40, maxZ: 330, W: 180, Hh: 196 };
  const mx = x => (x - MAP.minX) / (MAP.maxX - MAP.minX) * MAP.W, mz = z => (z - MAP.minZ) / (MAP.maxZ - MAP.minZ) * MAP.Hh;
  H.buildMap = () => {
    const c = document.createElement('canvas'); c.width = MAP.W; c.height = MAP.Hh; const x = c.getContext('2d');
    x.fillStyle = '#3f5f35'; x.fillRect(0, 0, MAP.W, MAP.Hh);
    for (const r of ML.mapRects) { x.fillStyle = r.c; x.fillRect(mx(r.x - r.w / 2), mz(r.z - r.d / 2), Math.max(1, r.w / 340 * MAP.W), Math.max(1, r.d / 370 * MAP.Hh)); }
    x.font = 'bold 8px Arial'; x.textAlign = 'center';
    for (const k in ML.COMPANIES) { const C = ML.COMPANIES[k]; x.fillStyle = '#000'; x.fillText(C.name.split(' ')[0], mx(C.x) + 1, mz(C.z) + 3); x.fillStyle = '#fff'; x.fillText(C.name.split(' ')[0], mx(C.x), mz(C.z) + 2); }
    x.fillStyle = '#ffd257'; x.fillText('ATELIER', mx(0), mz(0) + 3);
    H.mapBg = c;
  };
  H.drawMap = S => {
    const G = ML.Game, ctx = H.el.minimap.getContext('2d');
    ctx.drawImage(H.mapBg, 0, 0);
    const dot = (x, z, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx(x), mz(z), r, 0, 7); ctx.fill(); };
    ML.Cars.list.forEach((c, i) => dot(c.pos.x, c.pos.z, i ? '#ecf0f1' : '#f4c430', 3));
    // objets à récupérer hors de l'atelier (bruts de sous-traitants, caisses, matière)
    for (const id in G.itemViews) { const iv = G.itemViews[id]; if (iv.type === 'find' || U.inWorkshop(iv.mesh.position)) continue; dot(iv.mesh.position.x, iv.mesh.position.z, '#7fd3ff', 1.8); }
    const L = G.npcViews.lebec; if (L && L.seen) dot(L.pos.x, L.pos.z, L.st === 'c' ? '#ff0000' : '#2c5aa0', 2.5);
    for (const pid in S.pl) {
      const c = ML.COLORS[S.pl[pid].idx % 5].css;
      if (pid === G.me) {
        const pos = G.p.car !== null ? ML.Cars.list[G.p.car].pos : G.p.pos, a = G.p.car !== null ? ML.Cars.list[G.p.car].h : G.p.yaw + Math.PI;
        ctx.save(); ctx.translate(mx(pos.x), mz(pos.z)); ctx.rotate(-a); ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(4, -4); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      } else { const a = G.avatars[pid]; if (a && a.seen) dot(a.pos.x, a.pos.z, c, 3); }
    }
  };
})();
