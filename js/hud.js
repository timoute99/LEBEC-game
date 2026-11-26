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
    const Hm = ML.HUMEURS[S.humeur], W = ML.WEATHER[S.weather], Dd = ML.DIFFS && ML.DIFFS[S.diff];
    const mode = { coop: 'Journée libre', campagne: `Campagne — jour ${S.day}/${ML.CAMPAIGN.days}`, inspection: "INSPECTION de l'Éducation Nationale", course: 'Course de Mégane' }[S.mode] || S.mode;
    H.el.daycard.innerHTML = `<div class="dc-mode">${U.esc(mode)}</div>${Dd && S.diff !== 'normal' ? `<div class="dc-w">${Dd.icon} ${U.esc(Dd.name)}</div>` : ''}<div class="dc-h">😤 ${U.esc(Hm.name)}</div><div class="dim">${U.esc(Hm.desc)}</div><div class="dc-w">${S.weather === 'pluie' ? '🌧' : S.weather === 'brouillard' ? '🌫' : '☀️'} ${U.esc(W.name)}</div>` +
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

    if (ML.GPS) ML.GPS.update(dt);                                // V4.1 : GPS (objectif, trajet, flèche)
    if (S) H.drawMap(S); // mini-carte à chaque image (centrée sur le joueur → défilement fluide)
    H.tick -= dt; if (H.tick > 0 || !S) return; H.tick = 0.2;
    const min = G.clockMin();
    H.el.clock.textContent = S.mode === 'course' ? `🏁 ${S.race ? S.race.round + '/' + S.race.total : '…'}` : U.fmt(Math.min(min, ML.CFG.DAY_END)) + (min >= 17 * 60 ? ' 🌙' : '');
    H.el.score.textContent = S.score;
    if (ML.CareerUI) ML.CareerUI.hud(S); // V5 : argent, réputation, jour, livraisons (be.js)
    H.el.sat.style.width = S.sat + '%'; H.el.sat.style.background = S.sat < 30 ? '#e74c3c' : S.sat < 55 ? '#f28c28' : '#3ecf8e';
    if (!H._dial) H._dial = H.el.sat.closest('.gauge'); if (H._dial) H._dial.style.setProperty('--sat', Math.max(0, Math.min(100, S.sat)));
    H.el.finds.textContent = `★ ${S.finds.got}/${S.finds.total}`;
    const inv = S.pl[G.me] ? S.pl[G.me].inv : [];
    H.slots.forEach((s, i) => {
      const it = inv[i];
      s.classList.toggle('sel', i === p.sel); s.classList.toggle('bulky', ML.Items.bulky(it));
      s.querySelector('.ic').textContent = it ? ML.Items.icon(it) : '';
      s.querySelector('.nm').textContent = it ? ML.Items.name(it) + (it && ML.Items.def(it).hint && i === p.sel ? ' — ' + ML.Items.def(it).hint : '') : '—';
    });
    H.renderTickets(S); H.renderTeam(S); H.renderEvents(S); H.renderRace(S);
  };

  /* ---------- Tickets ---------- */
  /* Gamme : une puce par opération (faite / en cours / à venir) + étoiles de qualité */
  (function tkStyle() {
    if (document.getElementById('tk-gamme-css')) return;
    const st = document.createElement('style'); st.id = 'tk-gamme-css';
    st.textContent = `.tk-ops{display:flex;flex-wrap:wrap;gap:2px;margin:3px 0 1px 4px;align-items:center}
.tk-ops b{font:800 9.5px var(--f-mono,monospace);border:1.5px solid var(--dark,#222);border-radius:5px;padding:0 4px;background:#e9e1cc;color:#555;white-space:nowrap}
.tk-ops b.done{background:#cfe9d6;color:#2a6b3c;text-decoration:line-through}
.tk-ops b.cur{background:var(--yellow,#ffc93c);color:#111;box-shadow:0 2px 0 var(--dark,#222);font-size:10.5px}
.tk-ops i{font-style:normal;font-weight:900;opacity:.45;font-size:9px}
.tk-q{font-size:11px;font-weight:800;margin-left:4px;letter-spacing:1px}.tk-q.top{color:#c58a00}.tk-q.lim{color:#d35400}.tk-q.na{opacity:.5}
.tk-q small{letter-spacing:0;font-size:9.5px;color:var(--navy,#234)}`;
    document.head.appendChild(st);
  })();
  const opIdx = o => { let n = 0; for (let i = 0; i < o.si && i < o.steps.length; i++) if (o.steps[i] === 'usinage') n++; return n; };
  function opsHtml(o) {
    if (!o.ops || !o.ops.length) return '';
    const k = o.steps[o.si] === 'usinage' ? opIdx(o) : o.steps.indexOf('usinage') > o.si ? -1 : o.ops.length;
    return `<div class="tk-ops">` + o.ops.map((id, i) => { const op = ML.OPS[id] || { n: id, ic: '' }; return `<b class="${i < k ? 'done' : i === k ? 'cur' : ''}" title="${U.esc(ML.MTYPE[op.mt] || '')}">${op.ic} ${U.esc(op.n)}</b>`; }).join('<i>›</i>') + `</div>`;
  }
  function qualHtml(o) {
    const RT = ML.Routing; if (!RT) return '';
    if (o.qc !== null && o.qc !== undefined) { const g = RT.grade(o.qc); return `<span class="tk-q ${g.k}">${g.s} <small>✔ ${g.w}</small></span>`; }
    if (o.qe !== null && o.qe !== undefined) { const g = RT.grade(o.qe); return `<span class="tk-q ${g.k}">${g.s} <small>${g.k === 'lim' ? '⚠ à contrôler !' : 'estimée'}</small></span>`; }
    return '';
  }
  function stepState(o, st) {
    if (st === 'usinage') {
      const op = o.ops && ML.OPS[o.ops[Math.min(o.ops.length - 1, opIdx(o))]], pre = op ? `${op.ic} ${op.n} : ` : '';
      if (o.m) return pre + `sur ${o.m}`;
      if (o.ops && opIdx(o) > 0) return pre + `en-cours → ${ML.MTYPE[o.mtype]} (+ ${ML.TOOLS[o.tool] ? ML.TOOLS[o.tool].label.toLowerCase() : 'outil'})`;
      return pre + (o.src ? `brut prêt → ${ML.MTYPE[o.mtype]}` : `brut ${ML.MATERIALS[o.mat].label} → ${ML.MTYPE[o.mtype]}`);
    }
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
        <div class="tk-head"><b>N°${o.id}</b><em class="tk-cli">${U.esc(C.name)}</em><span>${Math.ceil(left)} s</span></div>
        <div class="tk-part">${U.esc(o.part)}</div>
        <div class="tk-chips"><span style="background:${ML.MATERIALS[o.mat].css};color:#111">${ML.MATERIALS[o.mat].label}</span><span>${ML.MTYPE[o.mtype]}</span><span style="background:${ML.TOOLS[o.tool].css};color:#111">${ML.TOOLS[o.tool].label}</span>${qualHtml(o)}</div>
        ${opsHtml(o)}
        <div class="tk-steps">${steps}</div>
        <div class="tk-now">${U.esc(stepState(o, st))}</div>
        <div class="tk-bar"><i style="width:${(frac * 100).toFixed(1)}%;background:${col}"></i></div></div>`;
    }).join('') || (S.mode === 'course' ? '' : '<div class="ticket empty">Pas de ticket pour l\'instant…</div>');
    if (html !== H._tk) { H.el.tickets.innerHTML = html; H._tk = html; }
  };
  H.renderTeam = S => {
    const G = ML.Game;
    const html = Object.keys(S.pl).map(pid => {
      const P = S.pl[pid], c = ML.COLORS[P.idx % ML.COLORS.length], sel = pid === G.me ? G.p.sel : (G.remote[pid] ? G.remote[pid].sel || 0 : 0), it = P.inv[sel];
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
    if (html !== H._ev) { H.el.evbar.innerHTML = html; H._ev = html; document.documentElement.style.setProperty('--evh', (html ? H.el.evbar.offsetHeight + 6 : 0) + 'px'); }   // bas à gauche : les messages remontent au-dessus
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
    if (open) { ML.ui.modal = 'help'; ML.Input.unlock(); H.showPause(false); H.fillTips(); } else { ML.ui.modal = null; ML.Input.lock(); }
  };
  /* ---------- Guide & astuces (V3.2, adapté V5) : 4 astuces au hasard dans l'aide (Tab) ---------- */
  ML.TIPS = ML.TIPS || [
    "Carrière : les devis se signent au PC du BE (LebecOS). Un devis en retard coûte des pénalités le soir.",
    "Une machine achetée arrive en CAISSE : fenwick ou transpalette (R), puis E pour l'installer où tu veux.",
    "Machine manuelle : c'est toi qui usines (mini-jeu). Une CN fait le travail seule une fois réglée.",
    "Contrôle tes pièces au MARBRE : la qualité ★★★ paie mieux, et les rebuts vont à la benne.",
    "Matis (et tous les gourmands) ralentit quand il a faim : une viennoiserie et il repart à +40 %.",
    "Un ouvrier en pause ne repart qu'avec E… ou une claque. Mais Lebec n'aime pas la violence dans SON atelier.",
    "Sors de l'atelier pour mettre une claque : Lebec ne voit que ce qui s'y passe.",
    "Un bac à copeaux plein bloque la machine : vide-le dans la benne dehors.",
    "Le chien de la casse adore les viennoiseries. Une lancée, et il dort.",
    "Le pigeon vole les plaquettes : lance-lui n'importe quoi pour qu'il la lâche.",
    "Deux passants renversés = RECHERCHÉ. La cellule de l'Adjudant Kerbrigand, c'est 45 s minimum.",
    "La soufflette est reliée au compresseur par 14 m de tuyau. Pas un de plus.",
    "Les clients du plateau (Carrière du Bec, barrage de Kerlebec) sont en haut du col : conduis doucement, les caisses tombent dans les virages.",
    "Touche M : la carte complète. F1 : Lebec et ses astuces (F2 pour passer).",
    "Embauche au PC (onglet Personnel) : chaque ouvrier a un trait. Les légendes de l'ancien atelier passent parfois.",
    "Les amendes sont à TON nom : PC → Compta → le mur de la honte.",
    "« C'est écrit dans le poly ! » — François Lebec, tous les jours depuis 1987."
  ];
  H.tipsHTML = n => U.shuffle(ML.TIPS).slice(0, n || ML.TIPS.length).map(t => `<li>${U.esc(t)}</li>`).join('');   // aussi pour un écran « Guide » du menu
  H.fillTips = () => {
    const card = H.el.help && H.el.help.querySelector('.card'); if (!card || !ML.TIPS.length) return;
    let box = card.querySelector('#help-tips');
    if (!box) { box = document.createElement('div'); box.id = 'help-tips'; const keys = card.querySelector('.keys'); card.insertBefore(box, keys || null); }
    box.innerHTML = '<p><b>💡 Astuces :</b></p><ul class="tips">' + H.tipsHTML(4) + '</ul>';
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

  /* =====================================================================
     CARTES : mini-carte (centrée sur le joueur) + grande carte (touche M,
     molette = zoom, glisser = déplacer, clic = repère).
     Données facultatives exploitées si présentes :
       city.edges[i].hw / ring / mtn / bridge / rw (demi-largeur, m)
       city.river = [{x, z, w}]  (w = demi-largeur)
       ML.Terrain.mapImage (canvas déjà peint) + ML.Terrain.bounds
     ===================================================================== */
  const MC = {
    out: '#5f9a3a', grass: '#8cc152', road: '#6a6f7a', roadCase: '#2b2f36', ring: '#f3e9d2', ringCase: '#4b5a6b',
    hw: '#f28c28', hwCase: '#6e3409', mtn: '#c9a77a', mtnCase: '#6b5236', bridgeCase: '#22262d',
    water: '#47b3d6', waterDk: '#2a7fa8', ink: '#22262d', yellow: '#ffc93c', red: '#e94f37', cream: '#f3e9d2', navy: '#24457a', mint: '#3ecf8e'
  };
  const FONT = '"Segoe UI", "Trebuchet MS", Arial, sans-serif';
  const hexc = c => '#' + new THREE.Color(c).getHexString();
  /** Emprise de la carte : CFG.MAP (+ relief s'il est plus grand) */
  const mapBounds = () => {
    const M = ML.CFG.MAP, T = ML.Terrain && ML.Terrain.bounds;
    if (!T || !isFinite(T.minX) || !isFinite(T.maxX)) return M;
    return { minX: Math.min(M.minX, T.minX), maxX: Math.max(M.maxX, T.maxX), minZ: Math.min(M.minZ, T.minZ), maxZ: Math.max(M.maxZ, T.maxZ) };
  };
  // vue : { cx, cz (centre, m), s (px/m), w, h (px) }
  const vX = (v, x) => (x - v.cx) * v.s + v.w / 2, vZ = (v, z) => (z - v.cz) * v.s + v.h / 2;
  const inv = (v, px, pz) => ({ x: (px - v.w / 2) / v.s + v.cx, z: (pz - v.h / 2) / v.s + v.cz });
  const shortName = n => { const f = n.split(' ')[0]; return f === 'Boulangerie' ? 'Boulang.' : f; };
  /** texte contouré (lisible sur tous les fonds) */
  function label(c, txt, x, y, col, size, bold, align) {
    c.font = `${bold === false ? '600' : '800'} ${size}px ${FONT}`; c.textAlign = align || 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = Math.max(2.5, size / 3.5); c.strokeStyle = MC.ink; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y);
  }

  /** Fond : relief, eau, bâtiments, routes (vectoriel, recalculé à chaque image) */
  function paintBase(c, v, big) {
    const s = v.s, X = x => vX(v, x), Z = z => vZ(v, z);
    const a = inv(v, 0, 0), b = inv(v, v.w, v.h);
    const vis = (x0, z0, x1, z1, m) => Math.max(x0, x1) + m > a.x && Math.min(x0, x1) - m < b.x && Math.max(z0, z1) + m > a.z && Math.min(z0, z1) - m < b.z;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.fillStyle = MC.out; c.fillRect(0, 0, v.w, v.h);
    const B = mapBounds(); c.fillStyle = MC.grass; c.fillRect(X(B.minX), Z(B.minZ), (B.maxX - B.minX) * s, (B.maxZ - B.minZ) * s);
    const T = ML.Terrain;
    if (T && T.mapImage && T.bounds) { try { c.drawImage(T.mapImage, X(T.bounds.minX), Z(T.bounds.minZ), (T.bounds.maxX - T.bounds.minX) * s, (T.bounds.maxZ - T.bounds.minZ) * s); } catch (e) { /* image pas prête */ } }
    const city = ML.World && ML.World.city;
    // rivière
    const riv = city && Array.isArray(city.river) && city.river.length > 1 ? city.river : T && Array.isArray(T.river) ? T.river : null;
    for (const L of (T && Array.isArray(T.lakes) ? T.lakes : [])) if (L.r && vis(L.x, L.z, L.x, L.z, L.r)) { // lacs
      c.fillStyle = MC.waterDk; c.beginPath(); c.arc(X(L.x), Z(L.z), L.r * s + 1.5, 0, 7); c.fill();
      c.fillStyle = MC.water; c.beginPath(); c.arc(X(L.x), Z(L.z), Math.max(1, L.r * s - 1), 0, 7); c.fill();
    }
    if (riv && riv.length > 1) for (const pass of [0, 1]) {
      c.strokeStyle = pass ? MC.water : MC.waterDk;
      for (let i = 1; i < riv.length; i++) {
        const p = riv[i - 1], q = riv[i], w = (p.w || 8) + (q.w || 8); if (!vis(p.x, p.z, q.x, q.z, w + 10)) continue;
        c.lineWidth = Math.max(pass ? 2.5 : 4.5, w * s + (pass ? 0 : 3)); c.beginPath(); c.moveTo(X(p.x), Z(p.z)); c.lineTo(X(q.x), Z(q.z)); c.stroke();
      }
    }
    // bâtiments (hors entreprises)
    const rects = ML.mapRects || [];
    for (const r of rects) if (!r.line && !r.comp && vis(r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2, 2)) {
      c.fillStyle = r.c || '#a99a8c'; c.fillRect(X(r.x - r.w / 2), Z(r.z - r.d / 2), Math.max(1, r.w * s), Math.max(1, r.d * s));
      if (s > 0.9) { c.strokeStyle = 'rgba(34,38,45,.55)'; c.lineWidth = 1; c.strokeRect(X(r.x - r.w / 2), Z(r.z - r.d / 2), r.w * s, r.d * s); }
    }
    // routes : par catégorie (normales < montagne < rocade < autoroute), contour puis remplissage
    if (city && city.edges && city.nodes) {
      const N = city.nodes, RW = city.RW || 5, minW = big ? 2 : 2.4;
      const cls = e => (e.hw ? 3 : e.ring ? 2 : e.mtn ? 1 : 0);
      const col = [[MC.roadCase, MC.road], [MC.mtnCase, MC.mtn], [MC.ringCase, MC.ring], [MC.hwCase, MC.hw]];
      const groups = [[], [], [], []];
      for (const e of city.edges) { const A = N[e.a], Bn = N[e.b]; if (A && Bn && vis(A.x, A.z, Bn.x, Bn.z, 30)) groups[cls(e)].push([e, A, Bn]); }
      const lw = e => Math.max(e.hw ? minW * 1.7 : e.ring ? minW * 1.3 : minW, (e.rw || (e.hw ? RW * 1.5 : RW)) * 2 * s);
      groups.forEach((g, k) => {
        for (const pass of [0, 1]) for (const [e, A, Bn] of g) {
          c.strokeStyle = pass ? col[k][1] : e.bridge ? MC.bridgeCase : col[k][0];
          c.lineWidth = lw(e) + (pass ? 0 : Math.max(2, 0.9 * s) + (e.bridge ? Math.max(2, 1.5 * s) : 0));
          c.beginPath(); c.moveTo(X(A.x), Z(A.z)); c.lineTo(X(Bn.x), Z(Bn.z)); c.stroke();
        }
        if (k === 0) for (const n of N) if (n.cul && vis(n.x, n.z, n.x, n.z, 20)) { // impasses
          const r = Math.max(minW * 0.8, (RW + 3.5) * s);
          c.fillStyle = MC.roadCase; c.beginPath(); c.arc(X(n.x), Z(n.z), r + 1, 0, 7); c.fill();
          c.fillStyle = MC.road; c.beginPath(); c.arc(X(n.x), Z(n.z), r - 0.5, 0, 7); c.fill();
        }
      });
      // noms de rues (grande carte zoomée)
      if (big && s >= 1.1) for (const l of city.labels || []) {
        if (!vis(l.x, l.z, l.x, l.z, 20)) continue;
        c.save(); c.translate(X(l.x), Z(l.z)); let ang = l.a || 0; if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI; c.rotate(ang);
        label(c, l.name, 0, 0, MC.cream, Math.min(14, Math.max(9, 3 * s)), false); c.restore();
      }
    } else {
      // ancien format : segments dans mapRects
      c.strokeStyle = MC.road; c.lineWidth = Math.max(2.4, 10 * s);
      for (const r of rects) if (r.line) { c.beginPath(); c.moveTo(X(r.line[0]), Z(r.line[1])); c.lineTo(X(r.line[2]), Z(r.line[3])); c.stroke(); }
    }
    // entreprises (couleur du toit) + atelier
    for (const k in (ML.LOC && ML.LOC.comp) || {}) {
      const L = ML.LOC.comp[k], C = ML.COMPANIES[k]; if (!C || !vis(L.x - L.hx, L.z - L.hz, L.x + L.hx, L.z + L.hz, 5)) continue;
      c.fillStyle = hexc(C.roof); c.strokeStyle = MC.ink; c.lineWidth = big ? 2 : 1.5;
      c.fillRect(X(L.x - L.hx), Z(L.z - L.hz), L.hx * 2 * s, L.hz * 2 * s); c.strokeRect(X(L.x - L.hx), Z(L.z - L.hz), L.hx * 2 * s, L.hz * 2 * s);
    }
    for (const r of rects) if (r.name && !r.comp && !r.line) { c.strokeStyle = MC.ink; c.lineWidth = 2; c.strokeRect(X(r.x - r.w / 2), Z(r.z - r.d / 2), r.w * s, r.d * s); }
  }

  /** Étiquettes et éléments mobiles (objectifs, véhicules, joueurs, repères) */
  function paintOverlay(c, v, S, big) {
    const G = ML.Game, X = x => vX(v, x), Z = z => vZ(v, z), t = performance.now() / 300;
    // repère : point (ou flèche collée au bord sur la mini-carte s'il est hors champ)
    const pin = (x, z, col, r, txt, clamp, ring) => {
      let px = X(x), pz = Z(z), off = false; const m = r + 4;
      if (clamp) {
        const dx = px - v.w / 2, dz = pz - v.h / 2, k = Math.min(dx ? (v.w / 2 - m) / Math.abs(dx) : 1e9, dz ? (v.h / 2 - m) / Math.abs(dz) : 1e9);
        if (k < 1) { px = v.w / 2 + dx * k; pz = v.h / 2 + dz * k; off = true; }
      } else if (px < -40 || pz < -40 || px > v.w + 40 || pz > v.h + 40) return;
      if (off) { // flèche vers l'extérieur
        const ang = Math.atan2(pz - v.h / 2, px - v.w / 2);
        c.save(); c.translate(px, pz); c.rotate(ang); c.fillStyle = col; c.strokeStyle = MC.ink; c.lineWidth = 2;
        c.beginPath(); c.moveTo(r + 3, 0); c.lineTo(-r + 1, -r); c.lineTo(-r + 1, r); c.closePath(); c.fill(); c.stroke(); c.restore();
      } else if (ring) {
        c.strokeStyle = MC.ink; c.lineWidth = 5; c.beginPath(); c.arc(px, pz, r + Math.sin(t) * 2, 0, 7); c.stroke();
        c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(px, pz, r + Math.sin(t) * 2, 0, 7); c.stroke();
      } else { c.fillStyle = col; c.strokeStyle = MC.ink; c.lineWidth = r > 3 ? 2 : 1.2; c.beginPath(); c.arc(px, pz, r, 0, 7); c.fill(); c.stroke(); }
      if (txt) {
        const sz = big ? 12 : 9;
        if (off) { const lx = Math.min(v.w - 4, Math.max(4, px)), lz = Math.min(v.h - 7, Math.max(7, pz + (pz < v.h / 2 ? r + 7 : -r - 7))); label(c, txt, lx, lz, col, sz, true, lx < 30 ? 'left' : lx > v.w - 30 ? 'right' : 'center'); }
        else if (ring) label(c, txt, px, pz - r - (big ? 10 : 7), col, sz);
        else if (big) label(c, txt, px + r + 3, pz, '#fff', sz, true, 'left');
      }
    };
    // noms des entreprises
    for (const k in (ML.LOC && ML.LOC.comp) || {}) {
      const L = ML.LOC.comp[k], C = ML.COMPANIES[k]; if (!C) continue;
      const px = X(L.x), pz = Z(L.z); if (px < -60 || pz < -20 || px > v.w + 60 || pz > v.h + 20) continue;
      label(c, big ? C.name : shortName(C.name), px, pz, '#fff', big ? Math.min(15, Math.max(10, 3.4 * v.s)) : 9);
    }
    for (const r of ML.mapRects || []) if (r.name && !r.comp && !r.line) label(c, r.name === 'ATELIER' && big ? 'ATELIER LEBEC' : r.name, X(r.x), Z(r.z), MC.yellow, big ? Math.min(16, Math.max(11, 4 * v.s)) : 9);
    // objectifs des tickets
    for (const o of S.orders || []) {
      const st = o.steps[o.si], k = st === 'livraison' ? o.client : st === 'tth' || st === 'fonderie' || st === 'chaudro' ? st : null; if (!k || !ML.LOC.comp[k]) continue;
      const L = ML.LOC.comp[k], d = L.dock || L;
      pin(d.x, d.z, MC.yellow, big ? 10 : 5, big ? `#${o.id} ${st === 'livraison' ? 'livrer' : ML.STEP[st]}` : `#${o.id}`, !big, true);
    }
    if (S.race && ML.LOC.comp[S.race.target]) { const L = ML.LOC.comp[S.race.target], d = L.dock || L; pin(d.x, d.z, MC.red, big ? 14 : 6, '🏁', !big, true); }
    // véhicules
    for (const tr of ML.Cars.traffic || []) if (tr.visible) pin(tr.position.x, tr.position.z, '#c9ced4', big ? 2.5 : 1.8);
    if (ML.Cars.police && ML.Cars.police.visible) pin(ML.Cars.police.position.x, ML.Cars.police.position.z, Math.floor(performance.now() / 200) % 2 ? '#2255ff' : '#ff2222', big ? 6 : 3.4, big ? '🚨' : '');
    ML.Cars.list.forEach((car, i) => {
      if (!car) return; const sc = S.cars[i];
      pin(car.pos.x, car.pos.z, sc ? hexc(sc.color) : '#fff', big ? 5 : sc && sc.kind === 'tp' ? 2.2 : 3,
        big && sc ? (sc.kind === 'megane' ? 'Mégane' : sc.kind === 'camion' ? 'Camion' : sc.kind === 'fenwick' ? 'Fenwick' : '') : '');
    });
    if (!big) for (const id in G.itemViews) { const iv = G.itemViews[id]; if (iv.type === 'find' || U.inWorkshop(iv.mesh.position)) continue; pin(iv.mesh.position.x, iv.mesh.position.z, '#7fd3ff', 2); }
    if (ML.Fx.dog) pin(ML.Fx.dog.position.x, ML.Fx.dog.position.z, '#8d6e63', big ? 4 : 2.5, big ? '🐕' : '');
    const Lb = G.npcViews.lebec; if (Lb && Lb.seen) pin(Lb.pos.x, Lb.pos.z, Lb.st === 'c' ? '#ff0000' : MC.navy, big ? 5 : 3, big ? 'Lebec' : '');
    for (const p of ML.Fx.pings || []) pin(p.g.position.x, p.g.position.z, MC.yellow, big ? 7 : 4, '📍', !big);
    if (ML.GPS) ML.GPS.paint(c, X, Z, big);                    // V4.1 : trajet GPS (gps.js)
    // joueurs (moi en dernier, en flèche)
    let mine = null;
    for (const pid in S.pl) {
      const P = S.pl[pid], col = ML.COLORS[P.idx % ML.COLORS.length].css;
      if (pid === G.me) { mine = [P, col]; continue; }
      const a = G.avatars[pid]; if (a && a.seen) pin(a.pos.x, a.pos.z, col, big ? 6 : 3.5, P.name + (P.ko ? ' (KO)' : ''), !big);
    }
    if (mine) {
      const car = G.p.car !== null ? ML.Cars.list[G.p.car] : null, pos = car ? car.pos : G.p.pos, a = car ? car.h : G.p.yaw + Math.PI, k = big ? 1.6 : 1.15;
      c.save(); c.translate(X(pos.x), Z(pos.z)); c.rotate(-a);
      c.fillStyle = mine[1]; c.strokeStyle = MC.ink; c.lineWidth = 2.5; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(0, 8 * k); c.lineTo(5.5 * k, -5 * k); c.lineTo(0, -2.5 * k); c.lineTo(-5.5 * k, -5 * k); c.closePath(); c.stroke(); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); c.restore();
      if (big) label(c, '▶ ' + mine[0].name + (mine[0].ko ? ' (KO)' : ''), X(pos.x) + 12, Z(pos.z), '#fff', 12, true, 'left');
    }
  }

  /** Emprise utile de la ville (carrefours + entreprises), marge 40 m */
  const cityBox = () => {
    const city = ML.World.city, b = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 }, add = (x, z) => { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); };
    for (const n of (city && city.nodes) || []) add(n.x, n.z);
    for (const k in (ML.LOC && ML.LOC.comp) || {}) add(ML.LOC.comp[k].x, ML.LOC.comp[k].z);
    if (b.minX > b.maxX) return ML.CFG.MAP;
    return { minX: b.minX - 40, maxX: b.maxX + 40, minZ: b.minZ - 40, maxZ: b.maxZ + 40 };
  };

  /* ---------- Grande carte (touche M) ---------- */
  H.toggleMap = () => {
    const open = H.el.bigmap.classList.contains('hidden');
    H.el.bigmap.classList.toggle('hidden', !open);
    if (open) {
      ML.ui.modal = 'map'; ML.Input.unlock(); H.showPause(false);
      const cv = H.el.bigmap.querySelector('canvas');
      if (!cv._ml) { cv._ml = true; bindBigMap(cv); }
    } else { ML.ui.modal = null; ML.Input.lock(); }
  };
  function bindBigMap(cv) {
    const toCv = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    let drag = null;
    cv.addEventListener('wheel', e => {
      e.preventDefault(); const k = H.bigK, bm = H.bm; if (!k || !bm) return;
      const [px, pz] = toCv(e), before = inv(k.v, px, pz);
      bm.z = Math.max(1, Math.min(10, bm.z * (e.deltaY < 0 ? 1.25 : 1 / 1.25)));
      const s = k.sFit * bm.z; bm.cx = before.x - (px - k.v.w / 2) / s; bm.cz = before.z - (pz - k.v.h / 2) / s;
    }, { passive: false });
    cv.addEventListener('mousedown', e => { if (e.button !== 0 || !H.bm) return; drag = { x: e.clientX, y: e.clientY, cx: H.bm.cx, cz: H.bm.cz, moved: false }; });
    addEventListener('mousemove', e => {
      if (!drag || !H.bigK) return; const r = cv.getBoundingClientRect(), f = cv.width / r.width / H.bigK.v.s;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; cv.classList.add('drag'); }
      if (drag.moved) { H.bm.cx = drag.cx - dx * f; H.bm.cz = drag.cz - dy * f; }
    });
    addEventListener('mouseup', e => {
      if (!drag) return; const d = drag; drag = null; cv.classList.remove('drag');
      if (d.moved || !H.bigK || e.target !== cv) return;
      const [px, pz] = toCv(e), w = inv(H.bigK.v, px, pz);
      ML.Game.intent({ a: 'ping', x: Math.round(w.x), z: Math.round(w.z) });
      if (ML.GPS) { ML.GPS.set(w.x, w.z); H.toast('📍 Repère posé pour l\'équipe : suis le trajet violet (GPS) ! Clic droit : effacer'); } else H.toast('📍 Repère posé pour toute l\'équipe');
    });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); if (ML.GPS && ML.GPS.manual) { ML.GPS.clear(); H.toast('Repère GPS effacé.'); } });   // V4.1 : GPS
    cv.addEventListener('dblclick', () => { H.bm = null; }); // double-clic : revenir à la vue de la ville
  }
  H.drawBigMap = S => {
    if (!S || !ML.World || !ML.World.city) return;
    const cv = H.el.bigmap.querySelector('canvas'), B = mapBounds(), bw = B.maxX - B.minX, bh = B.maxZ - B.minZ;
    const aw = Math.max(200, innerWidth - 60), ah = Math.max(160, innerHeight - 150), sFit = Math.min(aw / bw, ah / bh);
    const W = Math.round(bw * sFit), Hh = Math.round(bh * sFit);
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    if (!H.bm) { // vue de départ : cadrée sur la ville (routes + entreprises), dézoom possible jusqu'à toute la carte
      const C = cityBox(), z0 = Math.max(1, Math.min(10, 0.96 * Math.min(bw / (C.maxX - C.minX), bh / (C.maxZ - C.minZ))));
      H.bm = { z: z0, cx: (C.minX + C.maxX) / 2, cz: (C.minZ + C.maxZ) / 2 };
    }
    const bm = H.bm;
    const s = sFit * bm.z, hw = W / 2 / s, hh = Hh / 2 / s;
    bm.cx = hw * 2 >= bw ? (B.minX + B.maxX) / 2 : Math.max(B.minX + hw, Math.min(B.maxX - hw, bm.cx));
    bm.cz = hh * 2 >= bh ? (B.minZ + B.maxZ) / 2 : Math.max(B.minZ + hh, Math.min(B.maxZ - hh, bm.cz));
    const v = { cx: bm.cx, cz: bm.cz, s, w: W, h: Hh };
    H.bigK = { v, sFit, s };
    const c = cv.getContext('2d');
    paintBase(c, v, true); paintOverlay(c, v, S, true);
    // échelle
    const m = [50, 100, 200, 500].find(x => x * s > 70) || 500;
    c.fillStyle = MC.cream; c.strokeStyle = MC.ink; c.lineWidth = 2; c.fillRect(12, Hh - 20, m * s, 7); c.strokeRect(12, Hh - 20, m * s, 7);
    label(c, m + ' m', 12 + m * s + 6, Hh - 16, '#fff', 11, true, 'left');
  };

  /* ---------- Mini-carte (centrée sur le joueur, zoom selon la vitesse) ---------- */
  H.buildMap = () => { H.bm = null; H._mmSpan = null; H.mapBg = true; };
  H.drawMap = S => {
    const G = ML.Game, cv = H.el.minimap; if (!cv || !S || !ML.World || !ML.World.city) return;
    const ctx = cv.getContext('2d'), car = G.p.car !== null ? ML.Cars.list[G.p.car] : null, pos = car ? car.pos : G.p.pos;
    const want = car ? 240 + Math.min(Math.abs(car.speed || 0), 30) * 7 : 190; // mètres visibles en largeur
    H._mmSpan = H._mmSpan ? H._mmSpan + (want - H._mmSpan) * 0.05 : want;
    const v = { cx: pos.x, cz: pos.z, s: cv.width / H._mmSpan, w: cv.width, h: cv.height };
    // fond de carte mis en cache (une fois par ville) : on n'en copie que la zone visible → pas de pics de lenteur
    const city = ML.World.city;
    if (H._mmCity !== city) {
      const B = mapBounds(), K = 1.25, off = H._mmOff || (H._mmOff = document.createElement('canvas'));
      off.width = Math.round((B.maxX - B.minX) * K); off.height = Math.round((B.maxZ - B.minZ) * K);
      const v0 = { cx: (B.minX + B.maxX) / 2, cz: (B.minZ + B.maxZ) / 2, s: K, w: off.width, h: off.height };
      paintBase(off.getContext('2d'), v0, false); H._mmCity = city; H._mmB = B; H._mmK = K;
    }
    const B = H._mmB, K = H._mmK, sw = v.w / v.s * K, sh = v.h / v.s * K, sx = (v.cx - B.minX) * K - sw / 2, sy = (v.cz - B.minZ) * K - sh / 2;
    ctx.fillStyle = '#2b3a2a'; ctx.fillRect(0, 0, v.w, v.h);
    ctx.drawImage(H._mmOff, sx, sy, sw, sh, 0, 0, v.w, v.h);
    paintOverlay(ctx, v, S, false);
  };
})();
