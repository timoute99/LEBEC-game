/* =====================================================================
   hud.js — Interface en jeu : tickets façon Overcooked, horloge, score,
   équipe, mini-carte, inventaire, messages, bandeau d'événements,
   carte « humeur du jour », règle de l'inspecteur, course, vote du
   traître, succès, aide (Tab), bilan de fin de journée (+ campagne).
   ===================================================================== */
(function () {
  const H = ML.HUD = { tick: 0 };
  const U = ML.U, $ = id => document.getElementById(id);
  const STEP_ICON = { fonderie: '🔥', chaudro: '⚙️', usinage: '🛠️', tth: '♨️', livraison: '🚚' };

  H.init = () => {
    H.el = {};
    for (const id of ['hud', 'clock', 'score', 'sat', 'finds', 'tickets', 'team', 'prompt', 'notifs', 'subtitle', 'big', 'flash', 'inventory', 'stamina', 'drive', 'pause', 'help', 'end', 'endcard', 'hostlost', 'minimap', 'toasts', 'evbar', 'daycard', 'raceboard', 'vote', 'secret', 'hp', 'hpbox', 'rolebadge', 'ko', 'bigmap'])
      H.el[id] = $(id);
    H.el.inventory.innerHTML = [0, 1, 2].map(i => `<div class="slot"><span class="k">${i + 1}</span><span class="ic"></span><span class="nm"></span></div>`).join('');
    H.slots = [...H.el.inventory.querySelectorAll('.slot')];
    H.el.pause.onclick = () => ML.Input.lock();
  };

  H.startGame = () => {
    H.el.hud.classList.remove('hidden'); H.el.end.classList.add('hidden'); H.el.help.classList.add('hidden'); H.el.vote.classList.add('hidden');
    H.el.secret.classList.add('hidden'); ML.Lobby.hide(); H.el.notifs.innerHTML = ''; H._card = false; H._tk = H._tm = H._ev = H._rb = null;
    H.buildMap();
  };
  H.stopGame = () => { for (const k of ['hud', 'end', 'help', 'pause', 'hostlost', 'vote', 'daycard']) H.el[k].classList.add('hidden'); };
  H.showPause = b => { if (!H.el) return; H.el.pause.classList.toggle('hidden', !b); };

  /** Carte de début de journée : mode, humeur de Lebec, météo */
  H.dayCard = S => {
    const Hm = ML.HUMEURS[S.humeur], W = ML.WEATHER[S.weather];
    const mode = { coop: 'Journée libre', campagne: `Campagne — jour ${S.day}/${ML.CAMPAIGN.days}`, inspection: "INSPECTION de l'Éducation Nationale", course: 'Course de Mégane' }[S.mode] || S.mode;
    const Dd = ML.DIFFS[S.diff] || ML.DIFFS.normal;
    H.el.daycard.innerHTML = `<div class="dc-mode">${U.esc(mode)} · ${Dd.icon} ${U.esc(Dd.name)}</div><div class="dc-h">😤 ${U.esc(Hm.name)}</div><div class="dim">${U.esc(Hm.desc)}</div><div class="dc-w">${S.weather === 'pluie' ? '🌧' : S.weather === 'brouillard' ? '🌫' : '☀️'} ${U.esc(W.name)}</div>` +
      (S.mode === 'inspection' ? '<div class="dc-x">Respecte ses règles absurdes (elles changent !). 5 infractions = échec.</div>' : S.mode === 'course' ? '<div class="dc-x">5 manches : le premier arrivé EN VOITURE devant l\'entreprise indiquée gagne.</div>' : '') +
      (S.traitorMode ? '<div class="dc-x">🕵 Un traître se cache parmi vous…</div>' : '');
    H.el.daycard.classList.remove('hidden'); clearTimeout(H._dc); H._dc = setTimeout(() => H.el.daycard.classList.add('hidden'), 7500);
  };

  /* ---------- Mise à jour ---------- */
  H.update = dt => {
    const G = ML.Game, S = G.S, p = G.p;
    H.el.stamina.style.width = (100 * p.stamina / ML.CFG.PLAYER.stamina) + '%';
    const me = S && S.pl[G.me];
    if (me) {
      H.el.hp.style.width = me.hp + '%'; H.el.hp.style.background = me.hp < 30 ? '#e74c3c' : me.hp < 60 ? '#f39c12' : '#3ecf6e';
      H.el.hpbox.title = me.hp + ' PV';
      const rb = ML.ROLES[me.role]; const rh = `${rb.icon} ${rb.name}`; if (H._rb2 !== rh) { H.el.rolebadge.innerHTML = rh; H.el.rolebadge.style.borderColor = rb.css; H.el.rolebadge.title = rb.desc; H._rb2 = rh; }
      H.el.ko.classList.toggle('hidden', !me.ko);
    }
    if (ML.ui.modal === 'map') H.drawBigMap(S);
    if (S && !H._card) { H._card = true; H.dayCard(S); }
    let pr = '';
    if (p.ride) pr = '<b>[E]</b> Descendre · <b>clic droit</b> lancer';
    else if (p.car !== null) { const c = ML.Cars.list[p.car]; pr = c && Math.abs(c.speed) < 2 ? (G.nearPump() ? '<b>[E]</b> Descendre · <b>[F]</b> Faire le plein' : '<b>[E]</b> Descendre') + (c.kind === 'fenwick' ? ' · <b>[R]</b> Fourches' : c.kind === 'camion' ? ' · <b>[R]</b> Décharger' : '') : ''; }
    else if (G.cur) pr = `<b>[E]</b> ${U.esc(G.cur.label)}`;
    if (pr !== H._pr) { H.el.prompt.innerHTML = pr; H._pr = pr; }
    if (p.car !== null && S && S.cars[p.car]) {
      const c = ML.Cars.list[p.car], sc = S.cars[p.car], bed = sc.bed, tp = sc.kind === 'tp' || sc.kind === 'fenwick';
      const fz = sc.frozen > S.rt, fuel = Math.round(c.fuel);
      H.el.drive.classList.remove('hidden');
      H.el.drive.innerHTML = `<div class="spd">${Math.round(Math.abs(c.speed) * 3.6)} km/h</div>` +
        (tp ? '' : `<div class="fuel"><span>⛽</span><div class="bar"><i style="width:${fuel}%;background:${fuel < 15 ? '#e74c3c' : fuel < 35 ? '#f39c12' : '#3ecf6e'}"></i></div></div>`) +
        (fz ? '<div class="warn">🚨 Contrôle de gendarmerie…</div>' : '') + (!tp && fuel <= 0 ? '<div class="warn">PANNE SÈCHE ! Jerrican (station) + E sur la voiture</div>' : '') +
        (sc.kind === 'fenwick' ? `Fourches : ${sc.load ? '🏗 palette #' + sc.load.d.oid : 'vides'}<br><span class="dim">R : prendre / poser (près du camion = charger)</span><br>` : '') +
        (sc.kind === 'fenwick' ? '' : `${sc.kind === 'tp' ? 'Fourches' : sc.kind === 'camion' ? 'Plateau' : 'Benne'} : ${bed.length}/${sc.cap}<br>`) + (sc.pass && sc.pass.length ? `🪑 ${sc.pass.map(x => S.pl[x.pid] ? S.pl[x.pid].name : '?').join(', ')}<br>` : '') + `${bed.map(it => ML.Items.icon(it) + ' ' + U.esc(ML.Items.name(it))).join('<br>')}<br><span class="dim">V : vue · H : klaxon · E : descendre</span>`;
    } else H.el.drive.classList.add('hidden');
    const lost = !G.isHost && performance.now() - G.lastSnap > 6000;
    H.el.hostlost.classList.toggle('hidden', !lost);
    if (!G.isHost && performance.now() - G.lastSnap > 35000) { G.stop("L'hôte ne répond plus : partie terminée."); ML.Lobby.backToRoom(); return; }

    H.tick -= dt; if (H.tick > 0 || !S) return; H.tick = 0.2;
    const min = G.clockMin();
    H.el.clock.textContent = S.mode === 'course' ? `🏁 ${S.race ? S.race.round + '/' + S.race.total : '…'}` : U.fmt(Math.min(min, ML.CFG.DAY_END)) + (min >= 17 * 60 ? ' 🌙' : '');
    H.el.score.textContent = S.score;
    H.el.sat.style.width = S.sat + '%'; H.el.sat.style.background = S.sat < 30 ? '#e74c3c' : S.sat < 55 ? '#f39c12' : '#3ecf6e';
    H.el.finds.textContent = `★ ${S.finds.got}/${S.finds.total}`;
    const inv = S.pl[G.me] ? S.pl[G.me].inv : [];
    H.slots.forEach((s, i) => {
      const it = inv[i];
      s.classList.toggle('sel', i === p.sel); s.classList.toggle('bulky', ML.Items.bulky(it));
      s.querySelector('.ic').textContent = it ? ML.Items.icon(it) : '';
      s.querySelector('.nm').textContent = it ? ML.Items.name(it) + (it && ML.Items.def(it).hint && i === p.sel ? ' — ' + ML.Items.def(it).hint : '') : '—';
    });
    H.renderTickets(S); H.renderTeam(S); H.renderEvents(S); H.renderRace(S);
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
    const html = S.mode === 'course' ? '' : S.orders.slice().sort((a, b) => a.dl - b.dl).map(o => {
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
    }).join('') || (S.mode === 'course' ? '' : '<div class="ticket empty">Pas de ticket pour l\'instant…</div>');
    if (html !== H._tk) { H.el.tickets.innerHTML = html; H._tk = html; }
  };
  H.renderTeam = S => {
    const G = ML.Game;
    const html = Object.keys(S.pl).map(pid => {
      const P = S.pl[pid], c = ML.COLORS[P.idx % 5], sel = pid === G.me ? G.p.sel : (G.remote[pid] ? G.remote[pid].sel || 0 : 0), it = P.inv[sel];
      const off = !G.solo && ML.Net.room && !(ML.Net.room.players.find(x => x.id === pid) || {}).on;
      const rp = S.race && S.race.pts ? ` · ${S.race.pts[pid] || 0} pts` : '';
      const hp = P.ko ? ' <b style="color:#ff6b6b">KO</b>' : P.hp < 100 ? ` <span class="dim">${P.hp}♥</span>` : '';
      return `<div class="tm"><i style="background:${c.css}"></i>${ML.ROLES[P.role] ? ML.ROLES[P.role].icon : ''} ${U.esc(P.name)}${hp}${pid === G.me ? ' (toi)' : ''}${pid === G.host && !G.solo ? ' 👑' : ''}${rp} <span>${P.car !== null ? '🚗' : ''}${it ? ML.Items.icon(it) : ''}${off ? ' ⚠ déco' : ''}</span></div>`;
    }).join('');
    if (html !== H._tm) { H.el.team.innerHTML = html; H._tm = html; }
  };
  /** Bandeau : événements en cours, courant, règle de l'inspecteur */
  H.renderEvents = S => {
    const out = [], left = e => (e.until && e.until - S.rt < 900 ? ` <b>${Math.max(0, Math.ceil(e.until - S.rt))} s</b>` : '');
    const T = { audit: '🔍 Audit : une caisse au MARBRE', herve: '📝 Hervé bloque l\'armoire : convention signée !', fred: '💼 Fred : remplis Arexis (PC)', mathieu: '🐌 Mathieu bavarde avec un opérateur', sabotage: '🕶 Saboteur dans l\'atelier !', coupure: '⚡ Coupure : tableau électrique' };
    for (const k in S.evs || {}) out.push(`<span class="ev">${T[k] || k}${left(S.evs[k])}</span>`);
    if ((S.fires || []).length) out.push(`<span class="ev hot">🔥 Feu sur ${S.fires.map(f => f.mid).join(', ')}</span>`);
    for (const id in S.machines) if (S.machines[id].broken) out.push(`<span class="ev">🔧 ${id} en panne</span>`);
    if (S.rule) out.push(`<span class="ev rule">📏 ${U.esc(ML.RULES[S.rule])} · infractions ${S.viol}/5</span>`);
    const html = out.join('');
    if (html !== H._ev) { H.el.evbar.innerHTML = html; H._ev = html; }
  };
  H.renderRace = S => {
    const R = S.race; let html = '';
    if (S.mode === 'course' && R) {
      const C = ML.COMPANIES[R.target];
      html = `<div class="rb-t">🏁 Manche ${R.round}/${R.total} → <b>${U.esc(C.name)}</b>${R.done ? ' (terminée)' : ''}</div>` +
        Object.keys(S.pl).map(pid => [S.pl[pid].name, R.pts[pid] || 0, R.arrived.indexOf(pid)]).sort((a, b) => b[1] - a[1]).map(([n, p, a]) => `<div>${a >= 0 ? '✔ ' : ''}${U.esc(n)} : <b>${p}</b></div>`).join('');
    }
    if (html !== H._rb) { H.el.raceboard.innerHTML = html; H.el.raceboard.classList.toggle('hidden', !html); H._rb = html; }
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
  H.achievement = (name, desc, coins) => {
    const d = document.createElement('div'); d.className = 'toast ach'; d.innerHTML = `🏆 <b>Succès : ${U.esc(name)}</b><br><span>${U.esc(desc)} · +${coins} jetons</span>`;
    H.el.toasts.appendChild(d); setTimeout(() => d.remove(), 6500);
  };
  H.secret = text => { H.el.secret.innerHTML = '🕵 ' + U.esc(text); H.el.secret.classList.remove('hidden'); setTimeout(() => H.el.secret.classList.add('small'), 12000); };
  H.toggleHelp = () => {
    const open = H.el.help.classList.contains('hidden');
    H.el.help.classList.toggle('hidden', !open);
    if (open) { ML.ui.modal = 'help'; ML.Input.unlock(); H.showPause(false); } else { ML.ui.modal = null; ML.Input.lock(); }
  };

  /* ---------- Vote (mode traître) ---------- */
  H.showVote = (players, secs) => {
    const G = ML.Game; ML.Mini.forceClose(); if (ML.Dialogue.open) ML.Dialogue.forceClose();
    ML.ui.modal = 'vote'; ML.Input.unlock(); H.showPause(false);
    H.el.vote.innerHTML = `<div class="card"><h2>🕵 Qui est le traître ?</h2><p>Votez ! (${secs} s) — touches 1 à ${players.length} ou clic.</p><div class="vbtns">${players.map(([id, n], i) => `<button data-id="${id}"><kbd>${i + 1}</kbd> ${U.esc(n)}${id === G.me ? ' (toi)' : ''}</button>`).join('')}</div><p id="vote-st" class="dim"></p></div>`;
    H.el.vote.classList.remove('hidden'); H.votePlayers = players;
    for (const b of H.el.vote.querySelectorAll('button')) b.onclick = () => H.castVote(b.dataset.id);
  };
  H.castVote = id => { if (H.voted) return; H.voted = true; ML.Game.intent({ a: 'vote', id }); $('vote-st').textContent = 'Vote envoyé. En attente des autres…'; };
  H.voteKeys = () => { if (!H.votePlayers) return; for (let i = 0; i < H.votePlayers.length; i++) if (ML.Input.pressed('Digit' + (i + 1))) H.castVote(H.votePlayers[i][0]); };

  /* ---------- Fin de journée ---------- */
  H.showEnd = (r, extra) => {
    const G = ML.Game; extra = extra || {};
    ML.ui.modal = 'end'; ML.Input.unlock(); H.showPause(false); H.el.vote.classList.add('hidden'); H.votePlayers = null; H.voted = false;
    const stars = [1, 2, 3].map(i => `<span class="${i <= r.stars ? 'on' : ''}">★</span>`).join('');
    const verdict = r.stars >= 3 ? "« Pas mal. Pour des jeunes formés par l'Éducation Nationale. »" : r.stars >= 1 ? '« Ça passe. Demain on ne traîne pas ! »' : '« Si UsiFlash voit ça... COUP DE PELLE ! »';
    let more = '';
    if (r.race) more += `<h3>🏁 Classement</h3><table>${r.race.map(([id, n, p], i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1 + 'e'} ${U.esc(n)}</td><td><b>${p}</b> pts</td></tr>`).join('')}</table>`;
    if (r.inspection) more += `<h3>🎓 Inspection : ${r.inspection.pass ? '<span class="ok">AVIS FAVORABLE</span>' : '<span class="ko">AVIS DÉFAVORABLE</span>'}</h3><p class="dim">${r.inspection.viol} infraction(s) · il fallait ≤ 4 et au moins ${r.need[0]} points.</p>`;
    if (r.traitor) more += `<h3>🕵 Le traître était… <b>${U.esc(r.traitor.name)}</b> !</h3><p>${r.traitor.caught ? "Démasqué·e par l'équipe : +40 points !" : "Il/elle s'en sort sans être démasqué·e…"} <span class="dim">(bilan du traître : ${r.traitor.usi} caisse(s) livrée(s) chez UsiFlash, ${r.traitor.cuts} coupure(s) de courant, ${r.traitor.fails} ticket(s) raté(s) dans la journée)</span></p>`;
    if (extra.coins !== undefined) more += `<p class="coins">🪙 +${extra.coins} jetons (total ${ML.Account.prof.coins})</p>`;
    if (extra.camp) more += extra.camp;
    let btns;
    if (G.solo) btns = `<button id="end-again">${extra.nextLabel || 'Rejouer'}</button><button id="end-menu" class="sec">Menu</button>`;
    else if (G.isHost) btns = `<button id="end-again">${extra.nextLabel || 'Nouvelle journée (même équipe)'}</button><button id="end-menu" class="sec">Retour au salon</button>`;
    else btns = '<p class="dim">En attente de l\'hôte…</p><button id="end-menu" class="sec">Quitter le salon</button>';
    const score = r.mode === 'course' ? '' : `<tr><td>Score d'équipe</td><td><b>${r.score}</b></td></tr><tr><td>Tickets livrés / ratés</td><td>${r.served} / ${r.failed}</td></tr>
      <tr><td>Trouvailles</td><td>${r.finds}/${r.findsTotal}</td></tr><tr><td>Satisfaction client</td><td>${r.sat} %</td></tr>
      <tr><td>Étoiles</td><td class="dim">★ ${r.need[0]} · ★★ ${r.need[1]} · ★★★ ${r.need[2]}</td></tr>`;
    H.el.endcard.innerHTML = `<h1>${r.mode === 'course' ? 'Fin de la course' : 'Fin de journée'}</h1>${r.mode === 'course' ? '' : `<div class="stars">${stars}</div>`}
      <table>${score}</table>${more}
      ${r.mode === 'course' ? '' : `<p><i>François Lebec : ${verdict}</i></p>`}<div class="btns">${btns}</div>`;
    H.el.end.classList.remove('hidden');
    const again = $('end-again'), menu = $('end-menu');
    if (again) again.onclick = () => ML.Lobby.replay();
    menu.onclick = () => ML.Lobby.leaveAfterEnd();
    for (const b of H.el.endcard.querySelectorAll('[data-up]')) b.onclick = () => { const m = ML.Camp.buy(b.dataset.up); if (m) H.toast(m); else H.showEnd(r, Object.assign({}, extra, { camp: ML.Camp.panel() })); };
  };

  /* ---------- Grande carte (touche M) ---------- */
  H.toggleMap = () => {
    const open = H.el.bigmap.classList.contains('hidden');
    H.el.bigmap.classList.toggle('hidden', !open);
    if (open) {
      ML.ui.modal = 'map'; ML.Input.unlock(); H.showPause(false); H.bigBg = null;
      const cv = H.el.bigmap.querySelector('canvas');
      cv.onclick = e => {
        const r = cv.getBoundingClientRect(), k = H.bigK; if (!k) return;
        const x = (e.clientX - r.left) * cv.width / r.width / k.s + MAPC.minX, z = (e.clientY - r.top) * cv.height / r.height / k.s + MAPC.minZ;
        ML.Game.intent({ a: 'ping', x: Math.round(x), z: Math.round(z) }); H.toast('📍 Repère posé pour toute l\'équipe');
      };
    } else { ML.ui.modal = null; ML.Input.lock(); }
  };
  H.drawBigMap = S => {
    if (!S) return;
    const cv = H.el.bigmap.querySelector('canvas'), G = ML.Game, city = ML.World.city;
    const W = Math.min(innerWidth * 0.92, (innerHeight * 0.88) * (MAPC.maxX - MAPC.minX) / (MAPC.maxZ - MAPC.minZ)), s = W / (MAPC.maxX - MAPC.minX), Hh = s * (MAPC.maxZ - MAPC.minZ);
    if (cv.width !== Math.round(W)) { cv.width = Math.round(W); cv.height = Math.round(Hh); H.bigBg = null; }
    H.bigK = { s };
    const X = x => (x - MAPC.minX) * s, Z = z => (z - MAPC.minZ) * s;
    if (!H.bigBg) {
      const bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height; const x = bg.getContext('2d');
      x.fillStyle = '#3f5f35'; x.fillRect(0, 0, bg.width, bg.height);
      x.lineCap = 'round';
      for (const e of city.edges) { const A = city.nodes[e.a], B = city.nodes[e.b]; x.strokeStyle = e.ring ? '#c9ccd1' : '#2b2f36'; x.lineWidth = city.RW * 2 * s; x.beginPath(); x.moveTo(X(A.x), Z(A.z)); x.lineTo(X(B.x), Z(B.z)); x.stroke(); }
      for (const n of city.nodes) if (n.cul) { x.fillStyle = '#2b2f36'; x.beginPath(); x.arc(X(n.x), Z(n.z), (city.RW + 3.5) * s, 0, 7); x.fill(); }
      for (const r of ML.mapRects) if (!r.line && !r.comp) { x.fillStyle = r.c; x.fillRect(X(r.x - r.w / 2), Z(r.z - r.d / 2), r.w * s, r.d * s); }
      x.font = `${Math.max(9, 3.2 * s)}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (const l of city.labels || []) {
        x.save(); x.translate(X(l.x), Z(l.z)); let a = l.a; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; x.rotate(a);
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText(l.name, 0, 0); x.restore();
      }
      for (const k in ML.LOC.comp) {
        const L = ML.LOC.comp[k], C = ML.COMPANIES[k];
        x.fillStyle = '#' + new THREE.Color(C.roof).getHexString(); x.fillRect(X(L.x - L.hx), Z(L.z - L.hz), L.hx * 2 * s, L.hz * 2 * s);
        x.font = `bold ${Math.max(10, 3.6 * s)}px Arial`; x.lineWidth = 3; x.strokeStyle = '#000'; x.strokeText(C.name, X(L.x), Z(L.z)); x.fillStyle = '#fff'; x.fillText(C.name, X(L.x), Z(L.z));
      }
      x.fillStyle = '#a2a8ad'; x.fillRect(X(-20), Z(-14), 40 * s, 28 * s); x.fillStyle = '#ffd257'; x.font = `bold ${Math.max(11, 4 * s)}px Arial`; x.fillText('ATELIER LEBEC', X(0), Z(0));
      H.bigBg = bg;
    }
    const c = cv.getContext('2d'); c.drawImage(H.bigBg, 0, 0);
    const dot = (x, z, col, r, txt) => { c.fillStyle = col; c.beginPath(); c.arc(X(x), Z(z), r, 0, 7); c.fill(); if (txt) { c.font = 'bold 12px Arial'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(txt, X(x) + r + 2, Z(z)); c.fillStyle = '#fff'; c.fillText(txt, X(x) + r + 2, Z(z)); } };
    // objectifs des tickets
    const t = performance.now() / 300;
    for (const o of S.orders) {
      const st = o.steps[o.si], k = st === 'livraison' ? o.client : st === 'tth' || st === 'fonderie' || st === 'chaudro' ? st : null; if (!k || !ML.LOC.comp[k]) continue;
      const L = ML.LOC.comp[k]; c.strokeStyle = '#ffd257'; c.lineWidth = 3; c.beginPath(); c.arc(X(L.dock.x), Z(L.dock.z), 10 + Math.sin(t) * 3, 0, 7); c.stroke();
      c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.fillStyle = '#ffd257'; c.fillText(`#${o.id} ${st === 'livraison' ? 'livrer' : ML.STEP[st]}`, X(L.dock.x), Z(L.dock.z) - 16);
    }
    if (S.race && ML.LOC.comp[S.race.target]) { const L = ML.LOC.comp[S.race.target]; c.strokeStyle = '#ff3b30'; c.lineWidth = 4; c.beginPath(); c.arc(X(L.dock.x), Z(L.dock.z), 14 + Math.sin(t) * 3, 0, 7); c.stroke(); }
    ML.Cars.list.forEach((car, i) => { const sc = S.cars[i]; if (sc) dot(car.pos.x, car.pos.z, '#' + new THREE.Color(sc.color).getHexString(), 5, sc.kind === 'megane' ? 'Mégane' : sc.kind === 'camion' ? 'Camion' : sc.kind === 'fenwick' ? 'Fenwick' : ''); });
    if (ML.Cars.police && ML.Cars.police.visible) dot(ML.Cars.police.position.x, ML.Cars.police.position.z, '#2255ff', 6, '🚨');
    if (ML.Fx.dog) dot(ML.Fx.dog.position.x, ML.Fx.dog.position.z, '#8d6e63', 4, '🐕');
    for (const p of ML.Fx.pings) dot(p.g.position.x, p.g.position.z, '#ffd257', 7, '📍');
    for (const pid in S.pl) {
      const P = S.pl[pid], col = ML.COLORS[P.idx % 5].css, me = pid === G.me;
      const pos = me ? (G.p.car !== null ? ML.Cars.list[G.p.car].pos : G.p.pos) : G.avatars[pid] && G.avatars[pid].seen ? G.avatars[pid].pos : null;
      if (pos) dot(pos.x, pos.z, col, me ? 7 : 6, (me ? '▶ ' : '') + P.name + (P.ko ? ' (KO)' : ''));
    }
    const L = G.npcViews.lebec; if (L && L.seen) dot(L.pos.x, L.pos.z, '#2e8b57', 5, 'Lebec');
  };

  /* ---------- Mini-carte ---------- */
  const MAPC = ML.CFG.MAP, MAP = { W: 180, Hh: 196 };
  const mx = x => (x - MAPC.minX) / (MAPC.maxX - MAPC.minX) * MAP.W, mz = z => (z - MAPC.minZ) / (MAPC.maxZ - MAPC.minZ) * MAP.Hh;
  H.buildMap = () => {
    const c = document.createElement('canvas'); c.width = MAP.W; c.height = MAP.Hh; const x = c.getContext('2d');
    x.fillStyle = '#3f5f35'; x.fillRect(0, 0, MAP.W, MAP.Hh);
    x.strokeStyle = '#2b2f36'; x.lineWidth = 3.2; x.lineCap = 'round';
    for (const r of ML.mapRects) if (r.line) { x.beginPath(); x.moveTo(mx(r.line[0]), mz(r.line[1])); x.lineTo(mx(r.line[2]), mz(r.line[3])); x.stroke(); }
    const kx = MAP.W / (MAPC.maxX - MAPC.minX), kz = MAP.Hh / (MAPC.maxZ - MAPC.minZ);
    for (const r of ML.mapRects) if (!r.line) { x.fillStyle = r.c; x.fillRect(mx(r.x - r.w / 2), mz(r.z - r.d / 2), Math.max(1, r.w * kx), Math.max(1, r.d * kz)); }
    x.font = 'bold 8px Arial'; x.textAlign = 'center';
    for (const k in ML.LOC.comp) { const L = ML.LOC.comp[k], n = ML.COMPANIES[k].name.split(' ')[0] === 'Boulangerie' ? 'Boulang.' : ML.COMPANIES[k].name.split(' ')[0]; x.fillStyle = '#000'; x.fillText(n, mx(L.x) + 1, mz(L.z) + 3); x.fillStyle = '#fff'; x.fillText(n, mx(L.x), mz(L.z) + 2); }
    x.fillStyle = '#ffd257'; x.fillText('ATELIER', mx(0), mz(0) + 3);
    H.mapBg = c;
  };
  H.drawMap = S => {
    const G = ML.Game, ctx = H.el.minimap.getContext('2d');
    if (!H.mapBg) return;
    ctx.drawImage(H.mapBg, 0, 0);
    const dot = (x, z, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx(x), mz(z), r, 0, 7); ctx.fill(); };
    if (S.race && ML.LOC.comp[S.race.target]) { const L = ML.LOC.comp[S.race.target], t = performance.now() / 300; ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx(L.dock.x), mz(L.dock.z), 5 + Math.sin(t) * 2, 0, 7); ctx.stroke(); }
    for (const t of ML.Cars.traffic) if (t.visible) dot(t.position.x, t.position.z, '#95a5a6', 1.5);
    if (ML.Cars.police && ML.Cars.police.visible) dot(ML.Cars.police.position.x, ML.Cars.police.position.z, Math.floor(performance.now() / 200) % 2 ? '#2255ff' : '#ff2222', 3.2);
    ML.Cars.list.forEach((c, i) => { const sc = S.cars[i]; dot(c.pos.x, c.pos.z, sc ? '#' + new THREE.Color(sc.color).getHexString() : '#fff', sc && sc.kind === 'tp' ? 2 : 3); });
    for (const id in G.itemViews) { const iv = G.itemViews[id]; if (iv.type === 'find' || U.inWorkshop(iv.mesh.position)) continue; dot(iv.mesh.position.x, iv.mesh.position.z, '#7fd3ff', 1.8); }
    for (const p of ML.Fx.pings) dot(p.g.position.x, p.g.position.z, '#ffd257', 3.5);
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
