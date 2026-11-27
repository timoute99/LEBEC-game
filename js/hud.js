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
    for (const id of ['wx', 'jail', 'hud', 'props', 'clock', 'score', 'sat', 'finds', 'tickets', 'team', 'prompt', 'notifs', 'subtitle', 'big', 'flash', 'inventory', 'stamina', 'drive', 'pause', 'help', 'end', 'endcard', 'hostlost', 'minimap', 'toasts', 'evbar', 'daycard', 'raceboard', 'vote', 'secret', 'hp', 'hpbox', 'rolebadge', 'ko', 'bigmap', 'gps'])
      H.el[id] = $(id);
    H.el.inventory.innerHTML = [0, 1, 2].map(i => `<div class="slot"><span class="k">${i + 1}</span><span class="ic"></span><span class="nm"></span></div>`).join('');
    H.slots = [...H.el.inventory.querySelectorAll('.slot')];
    // V5 : menu Pause (Échap) — reprendre, changer de pseudo / de perso, menu principal
    H.el.pause.onclick = e => {
      const b = e.target.closest('[data-pz]');
      if (!b) { if (!e.target.closest('.pausecard')) ML.Input.lock(); return; }
      const a = b.dataset.pz, G = ML.Game;
      if (a === 'resume') ML.Input.lock();
      if (a === 'rename') { const v = $('pz-name').value.trim(); if (v) { G.rename(v); H.toast('✏ Pseudo changé : ' + v); } }
      if (a === 'perso') ML.Lobby.inGameProfile();
      if (a === 'save') ML.Camp.saveNow();
      if (a === 'news') ML.Lobby.showNews(true);
      if (a === 'tuto') { if (ML.Tuto.on) { ML.Tuto.finish(true); H.showPause(true); } else { ML.Tuto.start(true); ML.Input.lock(); } }
      if (a === 'menu') { if (confirm(G.solo ? 'Quitter la partie et revenir au menu principal ? (en campagne, l\'atelier est sauvegardé toutes les minutes)' : G.isHost ? 'Quitter la partie ? Un autre joueur reprendra l\'atelier.' : 'Quitter la partie et revenir au menu principal ?')) ML.Lobby.leaveGame(); }
    };
    H.el.pause.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pz-name') { e.preventDefault(); $('pz-name').nextElementSibling.click(); } });
  };

  H.startGame = () => {
    H.el.hud.classList.remove('hidden'); H.el.end.classList.add('hidden'); H.el.help.classList.add('hidden'); H.el.vote.classList.add('hidden');
    H.el.secret.classList.add('hidden'); ML.Lobby.hide(); H.el.notifs.innerHTML = ''; H._card = false; H._tk = H._tm = H._ev = H._rb = null;
    H.buildMap();
  };
  H.stopGame = () => { for (const k of ['hud', 'end', 'help', 'pause', 'hostlost', 'vote', 'daycard']) H.el[k].classList.add('hidden'); };
  H.showPause = (b, soft) => {
    if (!H.el) return;
    if (b && !soft) {                                                           // V5 : vrai menu pause
      H._soft = false; H.el.pause.classList.remove('soft');
      const G = ML.Game, me = G.S && G.S.pl[G.me], nm = me ? me.name : (G.players[G.me] || {}).name || '';
      H.el.pause.innerHTML = `<div class="card pausecard"><h2>⏸ Pause</h2>
        <button class="go" data-pz="resume">▶ Reprendre</button>
        <div class="pz-row"><input id="pz-name" maxlength="16" value="${U.esc(nm)}" placeholder="Pseudo"><button class="sec" data-pz="rename">✏ Changer de pseudo</button></div>
        <button class="sec" data-pz="perso">👕 Changer mon perso (tenue, chapeau…)</button>
        ${G.isHost && G.game && ['coop', 'campagne', 'inspection'].includes(G.game.mode) ? `<button class="sec" data-pz="save">💾 Enregistrer la partie${ML.Account.logged() ? ' sur mon compte' : ''}</button>` : ''}
        <button class="sec" data-pz="news">📰 Nouveautés · idée · signaler un bug</button>
        <button class="sec" data-pz="tuto">${ML.Tuto && ML.Tuto.on ? '✕ Fermer le tutoriel' : '📘 Revoir le tutoriel'}</button>
        <button class="sec" data-pz="menu">🏠 Menu principal</button>
        <p class="dim small">${G.solo ? 'Le jeu continue de tourner en fond.' : 'En multijoueur, la partie continue pour les autres !'}</p></div>`;
      H.el.pause.classList.toggle('hidden', false); return;
    }
    if (b && soft !== H._soft) { H._soft = !!soft; H.el.pause.classList.toggle('soft', !!soft); H.el.pause.innerHTML = soft ? '<div class="resume">🖱 Clique pour reprendre la main</div>' : '<div class="card"><h2>Pause</h2><p>Clique pour reprendre.</p><p class="dim">En multijoueur, la partie continue pour les autres !</p></div>'; }
    H.el.pause.classList.toggle('hidden', !b);
  };

  /** V5.2 : CADRE D'ASTUCES quand un événement spécial commence (que faire ?) */
  H.evTip = k => {
    const T = ML.EVTIPS[k]; if (!T || !H.el) return;
    const now = performance.now(); H._tips = H._tips || {}; if (H._tips[k] && now - H._tips[k] < 25000) return; H._tips[k] = now;
    let el = document.getElementById('evtip'); if (!el) { el = document.createElement('div'); el.id = 'evtip'; document.getElementById('hud').appendChild(el); }
    el.innerHTML = `<div class="et-h">💡 ${U.esc(T[0])}</div><ol>${T[1].map(x => `<li>${U.esc(x)}</li>`).join('')}</ol><div class="et-bar"><i></i></div>`;
    el.classList.remove('hidden'); el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    clearTimeout(H._et); H._et = setTimeout(() => el.classList.add('hidden'), 16000);
  };
  /** Carte de début de journée : mode, humeur de Lebec, météo */
  H.dayCard = S => {
    const Hm = ML.HUMEURS[S.humeur], W = ML.WEATHER[S.weather];
    const mode = S.campaign ? (S.mode === 'inspection' ? `🎓 ${S.co.name} — INSPECTION de l'Éducation Nationale` : `${S.co.name} — jour ${S.co.day}`) : ({ coop: 'Journée libre', inspection: "INSPECTION de l'Éducation Nationale", course: 'Course de Mégane' }[S.mode] || S.mode);
    const Dd = ML.DIFFS[S.diff] || ML.DIFFS.normal;
    const DT = ML.DAYTYPES[S.dayType];
    H.el.daycard.innerHTML = `<div class="dc-mode">${U.esc(mode)} · ${Dd.icon} ${U.esc(Dd.name)}</div>${DT && S.mode !== 'course' ? `<div class="dc-t">${DT.icon} <b>${U.esc(DT.name)}</b> — ${U.esc(DT.desc)}</div>` : ''}<div class="dc-h">😤 ${U.esc(Hm.name)}</div><div class="dim">${U.esc(Hm.desc)}</div><div class="dc-w">${W.icon} ${U.esc(W.name)} <span class="dim">(la météo change pendant la journée)</span></div>` +
      (S.mode === 'inspection' ? '<div class="dc-x">Respecte ses règles absurdes (elles changent !). 5 infractions = échec.</div>' : S.mode === 'course' ? '<div class="dc-x">5 manches : le premier arrivé EN VOITURE devant l\'entreprise indiquée gagne.</div>' : '') +
      (S.traitorMode ? '<div class="dc-x">🕵 Un traître se cache parmi vous…</div>' : '') +
      (S.black && S.mode !== 'course' ? '<div class="dc-x">🛍 <b>BLACK FRIDAY</b> : tout est moins cher aujourd\'hui (PC, garage, centre commercial) !</div>' : '') +
      (S.mode !== 'course' ? `<div class="dc-x">💶 ${S.money.toLocaleString('fr-FR')} € en caisse · les demandes des clients arrivent au 💻 PC de gestion (bureau)</div>` : '');
    H.el.daycard.classList.remove('hidden'); clearTimeout(H._dc); H._dc = setTimeout(() => H.el.daycard.classList.add('hidden'), 7500);
  };

  /* ---------- Mise à jour ---------- */
  H.update = dt => {
    const G = ML.Game, S = G.S, p = G.p;
    H.el.stamina.style.width = Math.max(0, Math.min(100, 100 * p.stamina / G.staminaMax())) + '%';
    const me = S && S.pl[G.me];
    if (me) {
      H.el.hp.style.width = me.hp + '%'; H.el.hp.style.background = me.hp < 30 ? '#e74c3c' : me.hp < 60 ? '#f39c12' : '#3ecf6e';
      H.el.hpbox.title = me.hp + ' PV';
      const rb = ML.ROLES[me.role], soloAll = Object.keys(S.pl).length === 1; const rh = soloAll ? '🎩 Tous les rôles (solo)' : `${rb.icon} ${rb.name}`; if (H._rb2 !== rh) { H.el.rolebadge.innerHTML = rh; H.el.rolebadge.style.borderColor = rb.css; H.el.rolebadge.title = rb.desc; H._rb2 = rh; }
      H.el.ko.classList.toggle('hidden', !me.ko);
    }
    if (ML.ui.modal === 'map') H.drawBigMap(S);
    if (S && !H._card) { H._card = true; H.dayCard(S); }
    let pr = '';
    if (p.ride) pr = '<b>[E]</b> Descendre · <b>clic droit</b> lancer';
    else if (p.car !== null) { const c = ML.Cars.list[p.car]; pr = c && Math.abs(c.speed) < 2 ? (G.nearPump() ? '<b>[E]</b> Descendre · <b>[F]</b> Faire le plein' : '<b>[E]</b> Descendre') + (c.kind === 'fenwick' ? ' · <b>[R]</b> Fourches' : c.kind === 'camion' ? ' · <b>[R]</b> Décharger' : '') : ''; }
    else if (G.cur) {
      pr = `<b>[E]</b> ${U.esc(G.cur.label)}`;
      // V5.3 : petit conseil discret si on regarde la même chose plus d'une seconde et demie
      const now = performance.now(); if (H._hid !== G.cur.id) { H._hid = G.cur.id; H._ht = now; }
      if (now - H._ht > 1500 && (ML.Account.prof.hints !== false)) { const t = ML.Rules.hint(G.cur.id); if (t) pr += `<div class="hint">💡 ${U.esc(t)}</div>`; }
    } else H._hid = null;
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
    H.el.score.textContent = S.mode === 'course' ? S.score : `${S.money.toLocaleString('fr-FR')} €`; H.el.score.classList.toggle('neg', S.money < 0);
    const np = (S.props || []).length + (S.parts || []).filter(p => p.st === 'wait').length;
    H.el.props.textContent = np ? `📥 ${np} demande${np > 1 ? 's' : ''} au PC` : ''; H.el.props.classList.toggle('hidden', !np);
    H.el.finds.textContent = `★ ${S.finds.got}/${S.finds.total}`;
    const inv = S.pl[G.me] ? S.pl[G.me].inv : [];
    H.slots.forEach((s, i) => {
      const it = inv[i];
      s.classList.toggle('sel', i === p.sel); s.classList.toggle('bulky', ML.Items.bulky(it));
      s.querySelector('.ic').textContent = it ? ML.Items.icon(it) : '';
      s.querySelector('.nm').textContent = it ? ML.Items.name(it) + (it && ML.Items.def(it).hint && i === p.sel ? ' — ' + ML.Items.def(it).hint : '') : '—';
    });
    H.renderTickets(S); H.renderTeam(S); H.renderEvents(S); H.renderRace(S);
    const gt = ML.GPS.target ? `📍 Repère : ${Math.round(ML.GPS.dist)} m` : ''; if (gt !== H._gps) { H.el.gps.textContent = gt; H.el.gps.classList.toggle('hidden', !gt); H._gps = gt; }
    // V5 : météo + garde à vue
    
    const jl = G.jailUntil ? Math.ceil((G.jailUntil - performance.now()) / 1000) : 0, jt = jl > 0 ? `🚔 GARDE À VUE : ${jl} s` : '';
    if (jt !== H._jail) { H.el.jail.textContent = jt; H.el.jail.classList.toggle('hidden', !jt); H._jail = jt; }
    H.drawMap(S);
  };

  /* ---------- Tickets ---------- */
  function stepState(o, st) {
    if (st === 'usinage') return o.m ? `sur ${o.m}` : o.src ? 'brut prêt → machine' : `brut ${ML.MATERIALS[o.mat].label} → ${ML.MTYPE[o.mtype]}`;
    if (st === 'fonderie' || st === 'chaudro') return o.q ? 'brut en route...' : `brut : PC ou ${ML.COMPANIES[st].name.split(' ')[0]}`;
    if (st === 'tth') return o.q ? 'au four...' : 'caisse → TTH Ouest';
    return o.client === 'part' ? `rapporter au COMPTOIR (${ML.PEOPLE[o.who].name})` : `livrer à ${ML.COMPANIES[o.client].name}`;
  }
  /** V5.2 : où en est la commande (barre d'avancement) et qui s'en occupe */
  function progress(o, S) {
    const st = o.steps[o.si], M = o.m && S.machines[o.m], G = ML.Game;
    let holder = null, where = null;
    for (const pid in S.pl) if (S.pl[pid].inv.some(x => x && x.d && x.d.oid === o.id)) holder = S.pl[pid];
    for (const c of S.cars || []) if ((c.bed || []).some(x => x.d && x.d.oid === o.id)) where = c;
    const kit = (S.items || []).some(it => it[1] === 'kit' && it[2] && it[2].oid === o.id);
    let pct = 0, txt = '';
    if (st === 'usinage') {
      if (M && M.job && M.job.oid === o.id) {
        const p2 = M.job.tool ? Math.floor(100 * M.job.prog / M.job.total) : 0, op = M.op ? ML.PEOPLE[M.op].name.split(' ')[0] : '?';
        pct = 25 + p2 * 0.55; txt = M.status === 'run' ? `🛠 ${o.m} (${op}) : ${p2} %` : M.job.tool ? `⏸ ${o.m} à l'arrêt (${{ off: 'courant', panne: 'panne', bac: 'bac plein', arret: 'arrêt d\'urgence', stop: op + ' absent' }[M.status] || M.status})` : `🧰 ${o.m} attend : ${ML.TOOLS[M.job.need].label}`;
      } else { pct = holder || kit ? 12 : 4; txt = holder ? `🤲 ${holder.name} apporte le brut` : kit ? '🧰 kit prêt (poste de prépa)' : o.src ? '🧱 brut prêt → machine' : `🔩 brut ${ML.MATERIALS[o.mat].label} → ${ML.MTYPE[o.mtype]}`; }
    } else if (st === 'fonderie' || st === 'chaudro') { pct = o.q ? 12 : 3; txt = o.q ? '🧱 brut en route…' : `🧱 brut : PC ou ${ML.COMPANIES[st].name.split(' ')[0]}`; }
    else if (st === 'tth') { pct = o.q ? 85 : 80; txt = o.q ? '♨️ au four…' : holder ? `🤲 ${holder.name} → TTH Ouest` : '♨️ caisse → TTH Ouest'; }
    else { pct = holder || where ? 92 : 82; txt = holder ? `🤲 ${holder.name} la livre` : where ? `🚚 dans ${where.name}${where.dr && S.pl[where.dr] ? ' (' + S.pl[where.dr].name + ')' : ''}` : o.client === 'part' ? `📦 prête → COMPTOIR (${ML.PEOPLE[o.who].name})` : o.client === 'sae' ? '📦 prête → JURY au marbre' : `📦 prête → ${ML.COMPANIES[o.client].name}`; }
    const who = holder ? holder : o.by ? { name: o.by, idx: o.byI } : null;
    return { pct, txt, who };
  }
  H.renderTickets = S => {
    const html = S.mode === 'course' ? '' : S.orders.slice().sort((a, b) => a.dl - b.dl).map(o => {
      const left = Math.max(0, o.dl - S.rt), frac = left / o.dur, C = ML.COMPANIES[o.client], st = o.steps[o.si], pr = progress(o, S);
      const col = frac > 0.5 ? '#3ecf6e' : frac > 0.25 ? '#f39c12' : '#e74c3c';
      const steps = o.steps.map((s, i) => `<span class="${i < o.si ? 'done' : i === o.si ? 'cur' : ''}">${STEP_ICON[s]}</span>`).join('<i>›</i>');
      const tl = Math.ceil(left), tm = tl >= 60 ? `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}` : `${tl} s`;
      const cli = o.client === 'part' ? '🙋 ' + ML.PEOPLE[o.who].name.split(' ')[0] : o.client === 'noir' ? '🕶 Jean-Mi' : C.name;
      return `<div class="ticket ${frac < 0.25 ? 'urgent' : ''} ${o.blk ? 'blk' : ''}" style="--c:#${new THREE.Color(C.roof).getHexString()};--t:${col}">
        <div class="tk-head"><b class="tk-on">${ML.on(o.id)}</b><span class="tk-t">⏱ ${tm}</span></div>
        <div class="tk-cl">${U.esc(cli)}<span class="tk-price">${o.client === 'sae' ? '🎓 SAE' : o.price + ' €'}</span></div>
        <div class="tk-chips"><span style="background:${ML.MATERIALS[o.mat].css};color:#111">${ML.MATERIALS[o.mat].label}</span><span>${o.plan && !o.m ? o.plan : ML.MTYPE[o.mtype]}</span><span style="background:${ML.TOOLS[o.tool].css};color:#111">${ML.TOOLS[o.tool].label}</span>${o.size === 'l' ? '<span>🏗 XL</span>' : ''}</div>
        <div class="tk-steps">${steps}</div>
        <div class="tk-now">${U.esc(pr.txt)}</div>
        <div class="tk-prog" title="avancement"><i style="width:${pr.pct.toFixed(0)}%"></i></div>
        ${pr.who ? `<div class="tk-who"><i style="background:${ML.COLORS[(pr.who.idx || 0) % 6].css}"></i>${U.esc(pr.who.name)}</div>` : ''}
        <div class="tk-bar"><i style="width:${(frac * 100).toFixed(1)}%;background:${col}"></i></div></div>`;
    }).join('') || (S.mode === 'course' ? '' : `<div class="ticket empty">${(S.props || []).length ? '📥 Des demandes attendent au PC de gestion : accepte-les !' : 'Pas de commande pour l\'instant…'}</div>`);
    if (html !== H._tk) { H.el.tickets.innerHTML = html; H._tk = html; }
  };
  H.renderTeam = S => {
    const G = ML.Game;
    const html = Object.keys(S.pl).map(pid => {
      const P = S.pl[pid], c = ML.COLORS[P.idx % 6], sel = pid === G.me ? G.p.sel : (G.remote[pid] ? G.remote[pid].sel || 0 : 0), it = P.inv[sel];
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
    const T = { johan: '🦹 Johan Bois rôde : protège les caisses prêtes !', bleuenn: '💥 Après l\'explosion : E sur chaque machine', wc: `🚽 Toilettes sales (${Math.round(S.wc || 0)} %) : à nettoyer`, audit: '🔍 Audit : une caisse au MARBRE', herve: '📝 Hervé bloque l\'armoire : convention signée !', fred: '💼 Fred : remplis Arexis (PC)', mathieu: '🐌 Mathieu bavarde avec un opérateur', sabotage: '🕶 Saboteur dans l\'atelier !', coupure: '⚡ Coupure : tableau électrique' };
    for (const k in S.evs || {}) out.push(`<span class="ev">${T[k] || k}${left(S.evs[k])}</span>`);
    if ((S.fires || []).length) out.push(`<span class="ev hot">🔥 Feu sur ${S.fires.map(f => f.mid).join(', ')}</span>`);
    for (const id in S.machines) if (S.machines[id].broken) out.push(`<span class="ev">🔧 ${id} en panne</span>`);
    if (S.rule) out.push(`<span class="ev rule">📏 ${U.esc(ML.RULES[S.rule])} · infractions ${S.viol}/5</span>`);
    for (const d of (S.deliv || []).slice(0, 3)) out.push(`<span class="ev info">🚚 ${U.esc(d.name)} : ${Math.max(0, Math.ceil(d.eta - S.rt))} s</span>`);
    if (S.tour) out.push(`<span class="ev info">🚚 Jojo en tournée (${S.tour.n} colis) : ${Math.max(0, Math.ceil(S.tour.end - S.rt))} s</span>`);
    for (const p of (S.parts || [])) if (p.st === 'wait') out.push(`<span class="ev part">🙋 Client au COMPTOIR : ${Math.max(0, Math.ceil(p.exp - S.rt))} s</span>`);
    // V5.2 : service (quête), SAE, arrêts d'urgence, Black Friday
    const Q = S.quest, G0 = ML.Game;
    if (Q && Q.st === 'ask') out.push(`<span class="ev part">🙋 ${U.esc(Q.who)} demande un service à l'entrée (${Q.reward} €)</span>`);
    if (Q && Q.st === 'go') out.push(`<span class="ev quest">🙋 Service pour ${U.esc(Q.who)} : ${Q.need ? 'apporter ' + ML.Items.TYPES[Q.need].icon : Q.carry ? 'livrer ' + ML.Items.TYPES[Q.carry].icon : ''} → ${U.esc(Q.at.name)}${G0.p ? ` (${Math.round(Math.hypot(G0.p.pos.x - Q.at.x, G0.p.pos.z - Q.at.z))} m)` : ''} <b>${Math.max(0, Math.ceil(Q.until - S.rt))} s</b>${Q.carry ? ` <span class="dim">${Q.phone && !Object.values(S.pl).some(P => (P.inv || []).some(x => x && x.type === Q.carry)) ? '· à prendre au COMPTOIR' : ''}</span>` : ''}</span>`);
    const A = S.sae;
    if (A && A.st === 'prod') out.push(`<span class="ev sae">🎓 ${U.esc(A.code)} : ${A.oids.length} pièces · jury vers ${ML.Sim.K.clockAt ? ML.Sim.K.clockAt(A.jury) : ''}</span>`);
    if (A && A.st === 'jury') out.push(`<span class="ev sae">🎓 JURY au marbre : ${A.got.length}/${A.oids.length} pièces <b>${Math.max(0, Math.ceil(A.end - S.rt))} s</b></span>`);
    const stopped = Object.keys(S.machines).filter(id => S.machines[id].stopped); if (stopped.length) out.push(`<span class="ev hot">⏹ Arrêt d'urgence : ${stopped.join(', ')} (E pour redémarrer)</span>`);
    if (S.black && S.mode !== 'course') out.push('<span class="ev black">🛍 BLACK FRIDAY</span>');
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
    while (H.el.notifs.children.length > 4) H.el.notifs.firstChild.remove();
    setTimeout(() => d.classList.add("out"), 5600); setTimeout(() => d.remove(), 6200);
  };
  H.subtitle = (name, text) => { H.el.subtitle.innerHTML = `<b>${U.esc(name)} :</b> ${U.esc(text)}`; clearTimeout(H._st); H._st = setTimeout(() => { H.el.subtitle.innerHTML = ''; }, Math.max(4500, String(text).length * 75)); };
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
    const eur = n => `${Math.round(n).toLocaleString('fr-FR')} €`;
    const stars = [1, 2, 3].map(i => `<span class="${i <= r.stars ? 'on' : ''}">★</span>`).join('');
    const verdict = r.stars >= 3 ? "« Pas mal. Pour des jeunes formés par l'Éducation Nationale. »" : r.stars >= 1 ? '« Ça passe. Demain on ne traîne pas ! »' : r.profit < 0 ? '« On perd de l\'argent ! C\'est écrit dans le poly : on vend PLUS qu\'on ne dépense ! »' : '« Si UsiFlash voit ça... COUP DE PELLE ! »';
    let more = '';
    const broke = !r.bankrupt ? '' : `<div class="won broke"><h2>💸 FAILLITE</h2><p>La caisse est passée sous ${eur(ML.ECO.bankrupt)}. Le banquier a appelé Lebec… « C'était écrit dans le poly : on ne dépense pas l'argent qu'on n'a pas ! »</p></div>`;
    const won = !r.won ? '' : `<div class="won"><h2>🏆 JEU TERMINÉ !</h2><p>L'inspecteur de l'Éducation Nationale donne un <b>AVIS FAVORABLE</b> à ${U.esc(r.co ? r.co.name : 'l\'atelier')}.<br>François Lebec : « … C'était écrit dans le poly. » (il sourit, presque)</p><p class="dim">Vous pouvez continuer à faire tourner l'atelier : la sauvegarde reste ouverte.</p></div>`;
    if (r.race) more += `<h3>🏁 Classement</h3><table>${r.race.map(([id, n, p], i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1 + 'e'} ${U.esc(n)}</td><td><b>${p}</b> pts</td></tr>`).join('')}</table>`;
    if (r.inspection) more += `<h3>🎓 Inspection : ${r.inspection.pass ? '<span class="ok">AVIS FAVORABLE</span>' : '<span class="ko">AVIS DÉFAVORABLE</span>'}</h3><p class="dim">${r.inspection.viol} infraction(s) · il fallait ≤ 4 et au moins ${eur(r.need[0])} de bénéfice.</p>`;
    if (r.traitor) more += `<h3>🕵 Le traître était… <b>${U.esc(r.traitor.name)}</b> !</h3><p>${r.traitor.caught ? "Démasqué·e par l'équipe : bravo !" : "Il/elle s'en sort sans être démasqué·e…"} <span class="dim">(bilan du traître : ${r.traitor.usi} caisse(s) livrée(s) chez UsiFlash, ${r.traitor.cuts} coupure(s) de courant, ${r.traitor.fails} ticket(s) raté(s) dans la journée)</span></p>`;
    const sp = Object.values(r.spent || {}).filter(v => v.amende + v.achat + v.invest + v.autre > 0);
    if (sp.length && r.mode !== 'course') more += `<h3>🧾 Qui a dépensé quoi aujourd'hui</h3><table class="spent"><tr><th></th><th>Amendes</th><th>Achats</th><th>Invest.</th><th>Total</th></tr>${sp.sort((a, b) => (b.amende + b.achat + b.invest + b.autre) - (a.amende + a.achat + a.invest + a.autre)).map(v => `<tr><td>${U.esc(v.name)}</td><td class="${v.amende ? 'ko' : 'dim'}">${eur(v.amende)}</td><td>${eur(v.achat)}</td><td>${eur(v.invest)}</td><td><b>${eur(v.amende + v.achat + v.invest + v.autre)}</b></td></tr>`).join('')}</table><p class="dim small">Le détail heure par heure est au 💻 PC, onglet 🧾 Historique.</p>`;
    if (extra.coins !== undefined) more += `<p class="coins">🪙 +${extra.coins} jetons pour ton profil (total ${ML.Account.prof.coins})</p>`;
    if (extra.camp) more += extra.camp;
    let btns;
    if (G.solo) btns = `<button id="end-again">${extra.nextLabel || 'Rejouer'}</button><button id="end-menu" class="sec">Menu</button>`;
    else if (G.isHost) btns = `<button id="end-again">${extra.nextLabel || 'Nouvelle journée (même équipe)'}</button><button id="end-menu" class="sec">Retour au salon</button>`;
    else btns = '<p class="dim">En attente de l\'hôte…</p><button id="end-menu" class="sec">Quitter le salon</button>';
    const T = r.today || {}, row = (l, v, c) => `<tr><td>${l}</td><td class="${c || ''}">${v}</td></tr>`;
    const table = r.mode === 'course' ? '' : row('Chiffre d\'affaires', '+' + eur(T.ca || 0), 'ok') + (T.bonus ? row('Primes', '+' + eur(T.bonus), 'ok') : '') +
      row('Achats (matière, outils, sous-traitance)', '−' + eur(T.achat || 0), 'ko') + (T.amende ? row('Amendes et casse', '−' + eur(T.amende), 'ko') : '') + row('Salaires', '−' + eur(T.salaires || 0), 'ko') + (T.abos ? row('Abonnements', '−' + eur(T.abos), 'ko') : '') +
      row('<b>Bénéfice de la journée</b>', `<b>${eur(r.profit || 0)}</b>`, (r.profit || 0) >= 0 ? 'ok' : 'ko') + (T.invest ? row('Investissements', '−' + eur(T.invest), 'dim') : '') +
      row('<b>En caisse</b>', `<b>${eur(r.money || 0)}</b>`, (r.money || 0) < 0 ? 'ko' : '') + ((r.money || 0) < 0 && !r.bankrupt && r.mode !== 'course' ? row('⚠ Attention', `faillite sous ${eur(ML.ECO.bankrupt)}`, 'ko') : '') + row('Réputation', `${r.rep}/100 (${r.rep - r.rep0 >= 0 ? '+' : ''}${r.rep - r.rep0})`) +
      row('Commandes livrées / ratées', `${r.served} / ${r.failed}`) + row('Trouvailles', `${r.finds}/${r.findsTotal}`) + row('Étoiles (bénéfice)', `<span class="dim">★ ${eur(r.need[0])} · ★★ ${eur(r.need[1])} · ★★★ ${eur(r.need[2])}</span>`);
    H.el.endcard.innerHTML = `<h1>${r.mode === 'course' ? 'Fin de la course' : 'Bilan de la journée'}</h1>${r.mode === 'course' ? '' : `<div class="stars">${stars}</div>`}
      ${broke}${won}<table>${table}</table>${more}
      ${r.mode === 'course' ? '' : `<p><i>François Lebec : ${verdict}</i></p>`}<div class="btns">${btns}</div>`;
    H.el.end.classList.remove('hidden');
    const again = $('end-again'), menu = $('end-menu');
    if (again) again.onclick = () => ML.Lobby.replay();
    menu.onclick = () => ML.Lobby.leaveAfterEnd();
  };

  /* ---------- Grande carte (touche M) ---------- */
  H.toggleMap = () => {
    const open = H.el.bigmap.classList.contains('hidden');
    H.el.bigmap.classList.toggle('hidden', !open);
    if (open) {
      ML.ui.modal = 'map'; ML.Input.unlock(); H.showPause(false); H.bigBg = null;
      const cv = H.el.bigmap.querySelector('canvas');
      cv.onclick = e => {
        const r = cv.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * (MAPC.maxX - MAPC.minX) + MAPC.minX, z = (e.clientY - r.top) / r.height * (MAPC.maxZ - MAPC.minZ) + MAPC.minZ;
        ML.GPS.set(x, z); ML.Game.intent({ a: 'ping', x: Math.round(x), z: Math.round(z) }); H.toast('📍 Repère posé : suis le trajet violet !');
      };
      cv.oncontextmenu = e => { e.preventDefault(); ML.GPS.clear(); H.toast('Repère effacé.'); };
    } else { ML.ui.modal = null; ML.Input.lock(); }
  };
  H.drawBigMap = S => {
    if (!S) return;
    const cv = H.el.bigmap.querySelector('canvas'), G = ML.Game, city = ML.World.city;
    const W = Math.round(Math.min(innerWidth * 0.92, (innerHeight * 0.88) * (MAPC.maxX - MAPC.minX) / (MAPC.maxZ - MAPC.minZ))), s = W / (MAPC.maxX - MAPC.minX), Hh = Math.round(s * (MAPC.maxZ - MAPC.minZ));
    const R = Math.min(2.5, Math.max(1.5, devicePixelRatio || 1));          // V6 : carte nette (haute résolution)
    if (cv.width !== Math.round(W * R)) { cv.width = Math.round(W * R); cv.height = Math.round(Hh * R); cv.style.width = W + 'px'; cv.style.height = Hh + 'px'; H.bigBg = null; }
    H.bigK = { s };
    const X = x => (x - MAPC.minX) * s, Z = z => (z - MAPC.minZ) * s;
    if (!H.bigBg) { H.bigBg = cityCanvas(s * R, Math.max(10, 3.3 * s) * R); }
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(H.bigBg, 0, 0); c.setTransform(R, 0, 0, R, 0, 0);
    const dot = (x, z, col, r, txt) => { c.fillStyle = col; c.beginPath(); c.arc(X(x), Z(z), r, 0, 7); c.fill(); if (txt) { c.font = 'bold 12px Arial'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(txt, X(x) + r + 2, Z(z)); c.fillStyle = '#fff'; c.fillText(txt, X(x) + r + 2, Z(z)); } };
    // objectifs des tickets
    const t = performance.now() / 300;
    for (const o of S.orders) {
      const st = o.steps[o.si], k = st === 'livraison' ? o.client : st === 'tth' || ((st === 'fonderie' || st === 'chaudro') && !o.q) ? st : null; if (!k || !ML.LOC.comp[k]) continue;
      const L = ML.LOC.comp[k]; c.strokeStyle = '#ffd257'; c.lineWidth = 3; c.beginPath(); c.arc(X(L.dock.x), Z(L.dock.z), 10 + Math.sin(t) * 3, 0, 7); c.stroke();
      c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.fillStyle = '#ffd257'; c.fillText(`${ML.on(o.id)} ${st === 'livraison' ? 'livrer' : ML.STEP[st]}`, X(L.dock.x), Z(L.dock.z) - 16);
    }
    if (S.race && ML.LOC.comp[S.race.target]) { const L = ML.LOC.comp[S.race.target]; c.strokeStyle = '#ff3b30'; c.lineWidth = 4; c.beginPath(); c.arc(X(L.dock.x), Z(L.dock.z), 14 + Math.sin(t) * 3, 0, 7); c.stroke(); }
    ML.Cars.list.forEach((car, i) => { const sc = S.cars[i]; if (sc) dot(car.pos.x, car.pos.z, '#' + new THREE.Color(sc.color).getHexString(), 5, sc.kind === 'megane' ? 'Mégane' : sc.kind === 'camion' ? 'Camion' : sc.kind === 'fenwick' ? 'Fenwick' : ''); });
    if (ML.Cars.police && ML.Cars.police.visible) dot(ML.Cars.police.position.x, ML.Cars.police.position.z, '#2255ff', 6, '🚨');
    if (ML.Fx.dog) dot(ML.Fx.dog.position.x, ML.Fx.dog.position.z, '#8d6e63', 4, '🐕');
    const blink = Math.floor(performance.now() / 260) % 2;                // V5 : repères ROUGES clignotants, bien visibles
    for (const p of ML.Fx.pings) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.fillStyle = blink ? '#ff2d2d' : '#ffffff'; c.beginPath(); c.arc(X(p.g.position.x), Z(p.g.position.z), 9 + (blink ? 3 : 0), 0, 7); c.fill(); c.stroke(); dot(p.g.position.x, p.g.position.z, blink ? '#ffffff' : '#ff2d2d', 3, '📍 viens ici'); }
    for (const pid in S.pl) {
      const P = S.pl[pid], col = ML.COLORS[P.idx % 6].css, me = pid === G.me;
      const pos = me ? (G.p.car !== null ? ML.Cars.list[G.p.car].pos : G.p.pos) : G.avatars[pid] && G.avatars[pid].seen ? G.avatars[pid].pos : null;
      if (pos) dot(pos.x, pos.z, col, me ? 7 : 6, (me ? '▶ ' : '') + P.name + (P.ko ? ' (KO)' : ''));
    }
    const L = G.npcViews.lebec; if (L && L.seen) dot(L.pos.x, L.pos.z, '#2e8b57', 5, 'Lebec');
    ML.GPS.paint(c, X, Z, 4);
    if (ML.GPS.target) { c.font = 'bold 13px Arial'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#000'; const t = `📍 ${Math.round(ML.GPS.dist)} m`; c.strokeText(t, X(ML.GPS.target.x), Z(ML.GPS.target.z) - 14); c.fillStyle = '#e9c7ff'; c.fillText(t, X(ML.GPS.target.x), Z(ML.GPS.target.z) - 14); }
  };

  /* ---------- Mini-carte (V6 : centrée sur le joueur, haute résolution) ---------- */
  const MAPC = ML.CFG.MAP, MAP = { W: 190, Hh: 190, VS: 1.1, BS: 4, R: 2 };
  /** Dessine toute la ville dans un canvas, à s px par mètre ; fs = taille de police de base (px du canvas) */
  function cityCanvas(s, fs) {
    const city = ML.World.city, bg = document.createElement('canvas');
    bg.width = Math.round((MAPC.maxX - MAPC.minX) * s); bg.height = Math.round((MAPC.maxZ - MAPC.minZ) * s);
    const x = bg.getContext('2d'), X = v => (v - MAPC.minX) * s, Z = v => (v - MAPC.minZ) * s;
    x.fillStyle = '#3f5f35'; x.fillRect(0, 0, bg.width, bg.height);
    const T2 = ML.World.hgt;
    if (T2) for (let j = 0; j < T2.nz; j += 2) for (let i = 0; i < T2.nx; i += 2) { const h = T2.hv[j * T2.nx + i]; if (h > 1.5) { x.fillStyle = `rgba(255,255,220,${Math.min(0.28, h / 40)})`; x.fillRect(X(T2.x0 + i * T2.S), Z(T2.z0 + j * T2.S), 2 * T2.S * s + 1, 2 * T2.S * s + 1); } }
    for (const r of ML.mapRects) if (r.river) { x.strokeStyle = '#3d86c6'; x.lineWidth = 2 * 9.7 * s; x.lineJoin = x.lineCap = 'round'; x.beginPath(); r.river.forEach((q, i) => (i ? x.lineTo(X(q.x), Z(q.z)) : x.moveTo(X(q.x), Z(q.z)))); x.stroke(); }
    x.lineCap = 'round';
    // bord clair puis chaussée : routes lisibles
    for (const pass of [0, 1]) for (const e of city.edges) { const A = city.nodes[e.a], B = city.nodes[e.b]; x.strokeStyle = pass ? (e.ring ? '#c9ccd1' : '#30343b') : 'rgba(255,255,255,.28)'; x.lineWidth = (city.RW * 2 + (pass ? 0 : 1.6)) * s; x.beginPath(); x.moveTo(X(A.x), Z(A.z)); x.lineTo(X(B.x), Z(B.z)); x.stroke(); }
    for (const n of city.nodes) if (n.cul) { x.fillStyle = '#30343b'; x.beginPath(); x.arc(X(n.x), Z(n.z), (city.RW + 3.5) * s, 0, 7); x.fill(); }
    for (const b of city.bridges || []) { x.fillStyle = '#e8e2d0'; x.save(); x.translate(X(b.x), Z(b.z)); x.rotate(Math.atan2(b.uz, b.ux)); x.fillRect(-b.len * s / 2, -(city.RW + 2) * s, b.len * s, (city.RW + 2) * 2 * s); x.restore(); }
    for (const r of ML.mapRects) if (!r.line && !r.comp && !r.river) { x.fillStyle = r.c; x.fillRect(X(r.x - r.w / 2), Z(r.z - r.d / 2), r.w * s, r.d * s); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `italic ${Math.round(fs * 0.68)}px Arial`;
    for (const l of city.labels || []) {
      x.save(); x.translate(X(l.x), Z(l.z)); let a = l.a; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; x.rotate(a);
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillText(l.name, 0, 0); x.restore();
    }
    const lab = (t, px, pz, f, col) => { x.font = `bold ${Math.round(f)}px Arial`; x.lineJoin = 'round'; x.lineWidth = Math.max(3, f * 0.28); x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(t, px, pz); x.fillStyle = col; x.fillText(t, px, pz); };
    for (const k in ML.LOC.comp) {
      const L = ML.LOC.comp[k], C = ML.COMPANIES[k]; if (!C || C.virtual) continue;
      x.fillStyle = '#' + new THREE.Color(C.roof).getHexString(); x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = Math.max(1, s * 0.4);
      x.fillRect(X(L.x - L.hx), Z(L.z - L.hz), L.hx * 2 * s, L.hz * 2 * s); x.strokeRect(X(L.x - L.hx), Z(L.z - L.hz), L.hx * 2 * s, L.hz * 2 * s);
      lab((C.icon ? C.icon + ' ' : '') + C.name, X(L.x), Z(L.z), fs, '#fff');
    }
    x.fillStyle = '#a2a8ad'; x.fillRect(X(-20), Z(-14), 40 * s, 28 * s); x.strokeStyle = '#ffd257'; x.lineWidth = Math.max(2, s * 0.6); x.strokeRect(X(-20), Z(-14), 40 * s, 28 * s);
    lab('ATELIER LEBEC', X(0), Z(0), fs * 1.15, '#ffd257');
    return bg;
  }
  H.buildMap = () => {
    const cv = H.el.minimap; cv.width = MAP.W * MAP.R; cv.height = MAP.Hh * MAP.R; cv.style.width = MAP.W + 'px'; cv.style.height = MAP.Hh + 'px';
    H.mapBg = cityCanvas(MAP.BS, 10.5 * MAP.BS / MAP.VS);
  };
  H.drawMap = S => {
    const G = ML.Game, ctx = H.el.minimap.getContext('2d');
    if (!H.mapBg) return;
    const me = G.p.car !== null ? ML.Cars.list[G.p.car].pos : G.p.pos, cx = me.x, cz = me.z, VS = MAP.VS, BS = MAP.BS;
    const mx = x => (x - cx) * VS + MAP.W / 2, mz = z => (z - cz) * VS + MAP.Hh / 2;
    ctx.setTransform(MAP.R, 0, 0, MAP.R, 0, 0); ctx.fillStyle = '#34502c'; ctx.fillRect(0, 0, MAP.W, MAP.Hh);
    const vw = MAP.W / VS, vh = MAP.Hh / VS;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(H.mapBg, (cx - vw / 2 - MAPC.minX) * BS, (cz - vh / 2 - MAPC.minZ) * BS, vw * BS, vh * BS, 0, 0, MAP.W, MAP.Hh);
    const dot = (x, z, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx(x), mz(z), r, 0, 7); ctx.fill(); };
    // objectifs : anneau jaune, ou flèche au bord s'ils sont hors champ
    const t = performance.now() / 300, goals = [];
    for (const o of S.orders) { const st = o.steps[o.si], k = st === 'livraison' ? o.client : st === 'tth' || ((st === 'fonderie' || st === 'chaudro') && !o.q) ? st : null; if (k && ML.LOC.comp[k] && ML.LOC.comp[k].dock) goals.push(ML.LOC.comp[k].dock); }
    if (S.race && ML.LOC.comp[S.race.target]) goals.push(ML.LOC.comp[S.race.target].dock);
    for (const g of goals) {
      const gx = mx(g.x), gz = mz(g.z), m = 9;
      if (gx > m && gx < MAP.W - m && gz > m && gz < MAP.Hh - m) { ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(gx, gz, 6 + Math.sin(t) * 2, 0, 7); ctx.stroke(); }
      else { const a = Math.atan2(gz - MAP.Hh / 2, gx - MAP.W / 2), ex = Math.min(MAP.W - m, Math.max(m, gx)), ez = Math.min(MAP.Hh - m, Math.max(m, gz));
        ctx.save(); ctx.translate(ex, ez); ctx.rotate(a); ctx.fillStyle = '#ffd257'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 4.5); ctx.lineTo(-4, -4.5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
    ML.GPS.paint(ctx, mx, mz, 2.6);
    for (const tr of ML.Cars.traffic) if (tr.visible) dot(tr.position.x, tr.position.z, '#cfd6db', 1.8);
    if (ML.Cars.police && ML.Cars.police.visible) dot(ML.Cars.police.position.x, ML.Cars.police.position.z, Math.floor(performance.now() / 200) % 2 ? '#2255ff' : '#ff2222', 3.6);
    ML.Cars.list.forEach((c, i) => { const sc = S.cars[i]; dot(c.pos.x, c.pos.z, sc ? '#' + new THREE.Color(sc.color).getHexString() : '#fff', sc && sc.kind === 'tp' ? 2.2 : 3.4); });
    for (const id in G.itemViews) { const iv = G.itemViews[id]; if (iv.type === 'find' || U.inWorkshop(iv.mesh.position)) continue; dot(iv.mesh.position.x, iv.mesh.position.z, '#7fd3ff', 2); }
    const bl = Math.floor(performance.now() / 260) % 2;
    for (const p of ML.Fx.pings) { dot(p.g.position.x, p.g.position.z, '#ffffff', bl ? 6 : 4.5); dot(p.g.position.x, p.g.position.z, '#ff2d2d', bl ? 4.5 : 3.2); }
    const L = G.npcViews.lebec; if (L && L.seen) dot(L.pos.x, L.pos.z, L.st === 'c' ? '#ff0000' : '#2c5aa0', 2.8);
    for (const pid in S.pl) {
      const c = ML.COLORS[S.pl[pid].idx % 6].css;
      if (pid === G.me) {
        const a = G.p.car !== null ? ML.Cars.list[G.p.car].h : G.p.yaw + Math.PI;
        ctx.save(); ctx.translate(MAP.W / 2, MAP.Hh / 2); ctx.rotate(-a); ctx.fillStyle = c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(5, -5); ctx.lineTo(0, -2.5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      } else { const a = G.avatars[pid]; if (a && a.seen) dot(a.pos.x, a.pos.z, c, 3.4); }
    }
    ctx.font = 'bold 10px Arial'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('N ↑ · M : carte', MAP.W - 5, MAP.Hh - 5);
  };
})();
