/* =====================================================================
   lobby.js — Menus : accueil sobre (SOLO / MULTIJOUEUR, compte, perso,
   guide & astuces, bouton « Installer le jeu »), partie solo, multijoueur
   (créer / rejoindre, même en cours de partie), salon (6 joueurs, mode et
   DIFFICULTÉ choisis par l'hôte), profil (apparence + boutique) et la
   CAMPAGNE (sauvegardée sur le PC de l'hôte).
   ===================================================================== */
(function () {
  const L = ML.Lobby = {};
  const U = ML.U, N = ML.Net, A = ML.Account, $ = id => document.getElementById(id);

  /* ======================= Campagne (PC de l'hôte) ======================= */
  const Camp = ML.Camp = {};
  Camp.load = () => { let c; try { c = JSON.parse(localStorage.getItem('ml_campaign') || 'null'); } catch (e) { c = null; } return c && c.day ? c : { day: 1, budget: 0, rep: 50, up: {}, wins: 0 }; };
  Camp.save = c => localStorage.setItem('ml_campaign', JSON.stringify(c));
  Camp.reset = () => { localStorage.removeItem('ml_campaign'); };
  Camp.applyEnd = res => {
    const c = Camp.load(); let msg;
    if (res.mode === 'inspection') {
      if (res.inspection && res.inspection.pass) { c.wins = (c.wins || 0) + 1; c.day = 1; c.rep = Math.min(100, c.rep + 20); c.budget += res.score; msg = '🎓 <b>CAMPAGNE GAGNÉE !</b> L\'inspecteur donne un avis favorable. Une nouvelle saison commence (améliorations conservées).'; }
      else msg = '🎓 Avis défavorable… L\'inspecteur reviendra demain (rejouez le jour 5).';
    } else {
      c.budget += res.score; c.rep = U.clamp(c.rep + (res.stars - 1) * 8 - res.failed * 2, 0, 100);
      if (res.stars >= 1) { c.day++; msg = `Jour réussi ! Demain : jour ${c.day}${c.day === ML.CAMPAIGN.bossDay ? " — l'INSPECTEUR de l'Éducation Nationale !" : ''}.`; }
      else msg = 'Aucune étoile : il faut refaire cette journée.';
    }
    Camp.save(c);
    return { camp: `<div class="camp"><p>${msg}</p>${Camp.panel()}</div>`, nextLabel: 'Journée suivante' };
  };
  Camp.panel = () => {
    const c = Camp.load();
    const ups = Object.keys(ML.UPGRADES).map(k => {
      const u = ML.UPGRADES[k], lvl = c.up[k] || 0, max = u.max || 1, done = lvl >= max;
      return `<button class="up ${done ? 'own' : ''}" data-up="${k}" ${done ? 'disabled' : ''}>${U.esc(u.name)}${max > 1 ? ` (${lvl}/${max})` : ''}<span>${done ? '✔' : u.price + ' €'}</span></button>`;
    }).join('');
    return `<div class="camp-h">📅 Jour ${c.day}/${ML.CAMPAIGN.days} · 💶 Budget atelier : <b>${c.budget} €</b> · ⭐ Réputation ${c.rep}/100${c.wins ? ' · 🏆 ' + c.wins : ''}</div><div class="ups">${ups}</div>`;
  };
  Camp.buy = k => {
    const c = Camp.load(), u = ML.UPGRADES[k]; if (!u) return 'Inconnu.';
    const lvl = c.up[k] || 0; if (lvl >= (u.max || 1)) return 'Déjà au maximum.';
    if (c.budget < u.price) return `Budget insuffisant (il manque ${u.price - c.budget} €).`;
    c.budget -= u.price; c.up[k] = lvl + 1; Camp.save(c); ML.Sfx.play('cash'); return null;
  };

  /* ======================= Écrans ======================= */
  const SCREENS = ['scr-home', 'scr-account', 'scr-guide', 'scr-solo', 'scr-multi', 'scr-profile', 'scr-room'];
  L.screen = id => {
    if (id !== 'scr-profile') L.cur = id;
    L.show(); for (const k of SCREENS) $(k).classList.toggle('hidden', k !== id);
    const pv = id === 'scr-profile'; L.el.classList.toggle('preview', pv); if (ML.Main.preview) ML.Main.preview(pv);
    if (id !== 'scr-profile') L.tip();
  };
  /** Astuce au hasard (accueil, solo, salon) */
  L.tip = () => { const t = U.pick(ML.TIPS || ['']); for (const id of ['tip-home', 'tip-h', 'tip-r']) if ($(id)) $(id).innerHTML = '💡 ' + U.esc(t); };
  /** Appli installable (PWA, V4.1) : bouton « Installer le jeu » (Chrome / Edge), icône sur le bureau, sa propre fenêtre */
  L.initInstall = () => {
    const web = /^https?:/.test(location.protocol), btn = $('go-install');
    const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (web && 'serviceWorker' in navigator && !ML.debug) navigator.serviceWorker.register('sw.js').catch(() => { /* rien */ });
    if (!web || installed()) return;
    btn.classList.remove('hidden');
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); L.installEv = e; });
    window.addEventListener('appinstalled', () => { btn.classList.add('hidden'); ML.HUD.toast('📲 Jeu installé ! Lance-le depuis l\'icône « Mécanique Lebec » sur ton bureau.'); });
    btn.onclick = async () => {
      if (!L.installEv) return ML.HUD.toast(/iPhone|iPad/.test(navigator.userAgent) ? 'Sur iPhone : bouton Partager, puis « Sur l\'écran d\'accueil ».' : 'Ouvre le jeu dans Chrome ou Edge : menu ⋮ → « Installer Mécanique Lebec » (ou l\'icône ⊕ dans la barre d\'adresse).');
      L.installEv.prompt(); const r = await L.installEv.userChoice; L.installEv = null;
      if (r && r.outcome === 'accepted') btn.classList.add('hidden');
    };
  };
  /** Difficulté choisie (h = solo, r = salon) */
  L.diff = p => { const v = $(p + '-diff').value; return ML.DIFFS && ML.DIFFS[v] ? v : 'normal'; };

  /* ======================= Init ======================= */
  L.init = () => {
    L.el = $('lobby');
    A.load();
    $('in-name').value = A.name(); $('m-name').value = A.name(); $('r-name').value = A.name();
    $('in-server').value = N.defaultUrl();
    if (/^https?:/.test(location.protocol)) $('server-row').classList.add('hidden');
    L.renderAccount();
    // navigation (accueil sobre)
    $('go-solo').onclick = () => { L.screen('scr-solo'); L.renderRoles(); L.renderModes(); };
    $('go-multi').onclick = async () => { L.screen('scr-multi'); if (N.online || /^https?:/.test(location.protocol)) { if (await L.ensure()) N.send({ t: 'list' }); } };
    $('go-account').onclick = () => { L.screen('scr-account'); L.renderAccount(); };
    $('go-perso').onclick = () => { L.cur = 'scr-home'; L.showProfile(); };
    $('go-guide').onclick = () => { L.screen('scr-guide'); $('guide-tips').innerHTML = (ML.TIPS || []).map(t => `<li>${U.esc(t)}</li>`).join(''); };
    for (const b of L.el.querySelectorAll('.back')) b.onclick = () => L.showHome();
    $('btn-solo').onclick = () => { const n = L.name('h'); if (!n) return; ML.Sfx.init(); const cfg = L.gameCfg('h'); ML.Game.start({ solo: true, seed: cfg.seed || Date.now() >>> 0, me: 'solo', host: 'solo', players: [{ id: 'solo', name: n, idx: 0 }], game: cfg }); };
    $('btn-create').onclick = async () => { if (!L.name('m') || !(await L.ensure())) return; N.send({ t: 'create', priv: $('in-priv').checked }); };
    $('btn-join').onclick = async () => { const code = $('in-code').value.trim().toUpperCase(); if (!L.name('m')) return; if (code.length !== 4) return ML.HUD.toast('Le code fait 4 lettres.'); if (!(await L.ensure())) return; N.send({ t: 'join', code }); };
    $('btn-list').onclick = async () => { if (!L.name('m') || !(await L.ensure())) return; N.send({ t: 'list' }); };
    $('btn-start').onclick = async () => { if (!L.name('r')) return; if ($('r-mode').value === 'carriere') await L.ensureCareer(); const cfg = L.gameCfg('r'); N.send({ t: 'start', seed: cfg.seed || (Math.random() * 1e9) >>> 0, cfg }); };
    $('btn-leave').onclick = () => { N.send({ t: 'leave' }); L.showHome(); };
    $('btn-copy').onclick = () => { try { navigator.clipboard.writeText(N.room.code); ML.HUD.toast('Code copié !'); } catch (e) { /* rien */ } };
    $('r-name').onchange = () => L.name('r');
    $('btn-profile').onclick = () => L.showProfile(); $('btn-profile-r').onclick = () => L.showProfile();
    $('btn-prof-back').onclick = () => { if (L.cur === 'scr-room' && N.room) L.showRoom(); else if (L.cur && L.cur !== 'scr-home') { L.screen(L.cur); L.renderRoles(); L.renderModes(); } else L.showHome(); };
    // difficulté (mémorisée sur ce PC) ; le choix de l'hôte est montré aux autres joueurs du salon
    const lastDiff = localStorage.getItem('ml_diff'); if (ML.DIFFS && ML.DIFFS[lastDiff]) { $('h-diff').value = lastDiff; $('r-diff').value = lastDiff; }
    for (const p of ['h', 'r']) $(p + '-diff').onchange = () => { localStorage.setItem('ml_diff', $(p + '-diff').value); L.renderModes(); if (p === 'r') L.sendCfg(); };
    $('r-traitor').onchange = () => L.sendCfg();
    setInterval(() => { if (!L.el.classList.contains('hidden') && L.cur !== 'scr-guide') L.tip(); }, 9000);
    $('btn-login').onclick = () => L.auth('login');
    $('btn-register').onclick = () => L.auth('register');
    $('btn-logout').onclick = () => { A.logout(); ML.Career.teams = []; ML.Career.car = ML.Career.local(); L.renderAccount(); L.renderModes(); ML.HUD.toast('Déconnecté : tu joues en invité.'); };
    for (const p of ['h', 'r']) { $(p + '-mode').onchange = () => { L.renderModes(); if (p === 'r') L.sendCfg(); }; $(p + '-camp-reset').onclick = () => {
      if ($(p + '-mode').value === 'carriere') {
        const team = ML.Career.car && ML.Career.car.cid;
        if (confirm(team ? `Recommencer l'entreprise « ${ML.Career.car.name} » À ZÉRO ? C'est valable pour TOUS ses membres : atelier, argent et ouvriers seront perdus.` : 'Recommencer une NOUVELLE carrière ? Atelier, argent et ouvriers actuels seront perdus.')) { ML.Career.reset(); L.renderModes(); }
        return;
      }
      if (confirm('Recommencer la campagne au jour 1 (budget et améliorations perdus) ?')) { Camp.reset(); L.renderModes(); } }; }
    L.renderModes();
    ML.Career.load().then(() => L.renderModes());             // sauvegarde de carrière (compte en ligne ou ce PC)

    N.on('status', s => { $('status').textContent = s; });
    N.on('relay', m => {
      if (m.d && m.d.k === 'role') {
        L.roles[m.from] = ML.ROLES[m.d.role] ? m.d.role : 'poly';
        if (!ML.Game.on) L.renderRoles(); else if (ML.Game.isHost && ML.Sim.setRole) ML.Sim.setRole(m.from, L.roles[m.from]);   // arrivé en cours de journée
        return;
      }
      if (m.d && m.d.k === 'cfg') { if (N.room && m.from === N.room.host) { L.hostCfg = m.d; if (!ML.Game.on) L.renderHostCfg(); } return; }
      ML.Game.onRelay(m);
    });
    L.roles = {}; L.myRole = ML.ROLES[localStorage.getItem('ml_role')] ? localStorage.getItem('ml_role') : 'poly';
    L.renderRoles();
    N.on('err', m => ML.HUD.toast(m));
    N.on('welcome', m => {
      if (A.token) A.resume().then(ok => {
        if (!ok) return;
        L.renderAccount(); if (!m || !m.resumed) ML.HUD.toast('Compte ' + A.user + ' reconnecté.');
        if (!ML.Game.on) ML.Career.load().then(() => L.renderModes());   // entreprises du compte
      });
    });
    N.on('rooms', list => {
      $('room-list').innerHTML = list.length ? list.map(r => `<button class="rl" data-code="${r.code}" ${r.n >= r.max ? 'disabled' : ''}>${r.code} — ${U.esc(r.host)} (${r.n}/${r.max})${r.game ? ' · 🔨 partie en cours : rejoindre' : ''}</button>`).join('') : '<p class="dim small">Aucun salon public pour l\'instant. Crée le tien !</p>';
      for (const b of $('room-list').querySelectorAll('button')) b.onclick = () => N.send({ t: 'join', code: b.dataset.code });
    });
    N.on('room', room => {
      const G = ML.Game;
      if (!room) { if (G.on && !G.solo) G.stop(); L.showHome(); return; }
      if (G.on && !G.solo) {
        if (room.state === 'lobby') { G.stop('Retour au salon.'); L.showRoom(); return; }
        if (G.isHost && room.host !== N.id) {                   // coupé trop longtemps : un autre joueur a repris la partie
          G.stop('Coupure trop longue : un autre joueur a repris la partie.'); L.migMsg = 'Reprise de la journée par le nouvel hôte…'; L.showRoom(); return;
        }
        if (G.isHost) for (const pid in (G.S ? G.S.pl : {})) if (!room.players.find(p => p.id === pid)) ML.Sim.removePlayer(pid);
        for (const p of room.players) if (!G.players[p.id]) {                // arrivée EN COURS DE PARTIE (drop-in, V4.0)
          G.players[p.id] = { id: p.id, name: p.name, idx: p.idx }; if (p.id !== G.me) G.addAvatar(G.players[p.id]);
          if (G.isHost && ML.Sim.addPlayer) ML.Sim.addPlayer(G.players[p.id], L.roles[p.id]);
          if (p.id !== G.me) ML.HUD.notify(`👋 ${p.name} arrive dans l'atelier !`, 'good');
        }
        return;
      }
      if ($('scr-profile').classList.contains('hidden')) L.showRoom(); else L.cur = 'scr-room';
      L.sendRole(); if (room.host === N.id) L.sendCfg();
    });
    N.on('start', m => {
      const r = m.room; ML.Sfx.init(); L.migMsg = null;
      ML.Game.start({ seed: m.seed, me: N.id, host: r.host, players: r.players.map(p => ({ id: p.id, name: p.name, idx: p.idx })), game: m.cfg || { mode: 'coop' }, late: !!m.late });
      if (m.late) {                                            // partie en cours : on demande tout de suite l'état complet à l'hôte
        ML.HUD.toast('Tu rejoins la partie en cours !');
        setTimeout(() => { if (ML.Game.on && ML.Sync) { ML.Sync.rsAt = 0; ML.Sync.ask(); } }, 800);
      }
    });
    N.on('host', m => {
      const G = ML.Game;
      if (G.on && !G.solo && m.id !== G.host) L.migrate(m);
      else if (!G.on) { if (m.id === N.id && m.old) ML.HUD.toast(`${m.old} est parti : tu es maintenant l'hôte du salon.`); L.showRoom(); }
    });
    N.on('unstable', () => ML.HUD.toast('Connexion instable… reconnexion en cours.'));
    N.on('resumed', () => { ML.HUD.toast('Reconnecté !'); const G = ML.Game; if (G.on && !G.isHost && !G.solo && ML.Sync) { ML.Sync.rsAt = 0; ML.Sync.ask(); } });   // on redemande l'état complet
    N.on('lost', () => { ML.Game.stop('Connexion perdue.'); L.showHome(); ML.HUD.toast('Connexion au serveur perdue.'); });
    L.initInstall();
    L.showHome();
  };

  /* ======================= Compte ======================= */
  L.renderAccount = () => {
    const logged = A.logged();
    $('acc-state').innerHTML = logged ? `Connecté·e : <b>${U.esc(A.user)}</b> · 🪙 ${A.prof.coins} jetons` : `Invité·e (profil gardé sur ce PC) · 🪙 ${A.prof.coins} jetons`;
    $('acc-mini').textContent = logged ? `${A.user} · 🪙 ${A.prof.coins}` : 'Compte (invité)';
    $('acc-form').classList.toggle('hidden', logged); $('btn-logout').classList.toggle('hidden', !logged);
    for (const id of ['solo-name-row', 'multi-name-row', 'room-name-row']) $(id).classList.toggle('hidden', logged);   // connecté : le pseudo = le compte
    if (logged) for (const id of ['in-name', 'm-name', 'r-name']) $(id).value = A.user;
  };
  L.auth = async op => {
    const user = $('in-user').value.trim(), pass = $('in-pass').value;
    if (!user || !pass) return ML.HUD.toast('Pseudo et mot de passe !');
    if (!(await L.ensure(user))) return;
    const r = await A.auth(op, user, pass);
    if (!r.ok) return ML.HUD.toast(r.m || 'Erreur.');
    $('in-pass').value = ''; L.renderAccount();
    ML.Career.load().then(() => L.renderModes());                // entreprises du compte (+ migration de la carrière de ce PC)
    if (N.name !== A.user) { N.name = A.user; N.send({ t: 'name', name: A.user }); }
    ML.HUD.toast(op === 'register' ? `Compte créé : bienvenue ${A.user} !` : `Re-bonjour ${A.user} !`);
  };
  /** Pseudo saisi (where : 'h' solo, 'm' multijoueur, 'r' salon) */
  L.name = where => {
    const field = $(where === 'r' ? 'r-name' : where === 'm' ? 'm-name' : 'in-name');
    const n = (A.logged() ? A.user : field.value.trim()).slice(0, 16);
    if (!n) { ML.HUD.toast('Choisis un pseudo !'); field.focus(); return null; }
    for (const id of ['in-name', 'm-name', 'r-name']) $(id).value = n;
    localStorage.setItem('ml_name', n); if (!A.logged() && A.prof.name !== n) { A.prof.name = n; A.save(); }
    if (N.online && n !== N.name) { N.name = n; N.send({ t: 'name', name: n }); }
    return n;
  };
  L.ensure = async nm => {
    if (N.online) return true;
    $('status').textContent = 'Connexion...';
    return N.connect($('in-server').value.trim() || N.defaultUrl(), nm || L.name('m') || 'Joueur');
  };

  /* ======================= Profil & boutique ======================= */
  L.showProfile = () => { L.screen('scr-profile'); L.renderProfile(); };
  /* ---------- Rôles ---------- */
  L.sendRole = () => { if (N.room) { L.roles[N.id] = L.myRole; N.relay({ k: 'role', role: L.myRole }); } };
  /** Rôles finaux : premier arrivé, premier servi (sauf polyvalent) */
  L.resolveRoles = () => {
    const out = {}, taken = {};
    for (const p of (N.room ? N.room.players : [])) { let r = p.id === N.id ? L.myRole : L.roles[p.id] || 'poly'; if (r !== 'poly' && taken[r]) r = 'poly'; taken[r] = 1; out[p.id] = r; }
    return out;
  };
  L.renderRoles = noRoom => {
    const taken = {}; if (N.room) for (const p of N.room.players) if (p.id !== N.id && L.roles[p.id] && L.roles[p.id] !== 'poly') taken[L.roles[p.id]] = (N.room.players.find(x => x.id === p.id) || {}).name;
    for (const pre of ['h', 'r']) {
      const box = $(pre + '-roles'); if (!box) continue;
      box.innerHTML = Object.keys(ML.ROLES).map(k => { const R = ML.ROLES[k], t = pre === 'r' && taken[k]; return `<button class="${L.myRole === k ? 'on' : ''}" data-r="${k}" ${t ? 'disabled' : ''} title="${U.esc(R.desc)}">${R.icon} ${R.name}${t ? ' (' + U.esc(t) + ')' : ''}</button>`; }).join('');
      for (const b of box.querySelectorAll('button')) b.onclick = () => { L.myRole = b.dataset.r; localStorage.setItem('ml_role', L.myRole); L.sendRole(); L.renderRoles(); };
      $(pre + '-role-desc').textContent = ML.ROLES[L.myRole].desc + (pre === 'h' ? ' En solo, les autres rôles sont tenus par des PNJ (lents).' : '');
    }
    if (!noRoom && N.room && !ML.Game.on && !$('scr-room').classList.contains('hidden')) L.showRoom();
  };
  L.renderProfile = () => {
    const P = A.prof, sw = (arr, cur, k) => arr.map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-k="${k}" data-v="${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('');
    const cats = { tenue: '👕 Tenues', chapeau: '🎩 Chapeaux', klaxon: '📯 Klaxons', peinture: '🎨 Peinture Mégane', aileron: '🏎 Aileron', flammes: '🔥 Flammes', jantes: '✨ Jantes' };
    let shop = '';
    for (const cat in cats) {
      const items = Object.keys(ML.SHOP).filter(k => ML.SHOP[k].cat === cat);
      shop += `<div class="shop-cat"><h4>${cats[cat]}</h4>` + items.map(k => {
        const it = ML.SHOP[k], own = A.owns(k), eq = P.eq[cat] === k;
        return `<button class="shop-it ${own ? 'own' : ''} ${eq ? 'eq' : ''}" data-id="${k}">${U.esc(it.name)}<span>${eq ? '✔ porté' : own ? 'équiper' : '🪙 ' + it.price}</span></button>`;
      }).join('') + (P.eq[cat] ? `<button class="shop-it off" data-off="${cat}">Retirer</button>` : '') + '</div>';
    }
    const ach = Object.keys(ML.ACH).map(k => `<span class="ach ${P.ach.includes(k) ? 'on' : ''}" title="${U.esc(ML.ACH[k][1])}">🏆 ${U.esc(ML.ACH[k][0])}</span>`).join('');
    const lk = P.look;
    $('prof-body').innerHTML = `<div class="prof-top"><div class="coins">🪙 ${P.coins} jetons</div></div>
      <div class="lk"><div>Peau ${sw(ML.SKINS, lk.skin, 'skin')}</div><div>Cheveux / barbe ${sw(ML.HAIRS, lk.hair, 'hair')}</div><div>Bleu de travail ${sw(ML.SUITS, lk.suit !== undefined ? lk.suit : 0x1f4e9a, 'suit')}</div></div>
      <div class="lk"><label>Taille <input type="range" id="lk-h" min="1.55" max="2.0" step="0.01" value="${lk.height || 1.78}"> <span id="lk-hv">${Math.round((lk.height || 1.78) * 100)} cm</span></label>
        <label>Corpulence <input type="range" id="lk-w" min="0.85" max="1.3" step="0.01" value="${lk.width || 1}"></label>
        <label><input type="checkbox" id="lk-b" ${lk.beard ? 'checked' : ''}> Barbe</label><label><input type="checkbox" id="lk-g" ${lk.glasses ? 'checked' : ''}> Lunettes</label></div>
      <p class="dim">Gagne des jetons en jouant (score, étoiles) et avec les succès. ${A.logged() ? 'Profil enregistré sur ton compte.' : 'Invité : profil gardé sur ce PC seulement — crée un compte pour le retrouver partout.'}</p>
      <div class="shop">${shop}</div><h4>Succès (${P.ach.length}/${Object.keys(ML.ACH).length})</h4><div class="achs">${ach}</div>`;
    for (const b of $('prof-body').querySelectorAll('.sw')) b.onclick = () => { P.look[b.dataset.k] = +b.dataset.v; A.save(); L.renderProfile(); };
    const upd = () => { P.look.height = +$('lk-h').value; P.look.width = +$('lk-w').value; P.look.beard = $('lk-b').checked; P.look.glasses = $('lk-g').checked; $('lk-hv').textContent = Math.round(P.look.height * 100) + ' cm'; ML.Main.preview(true); };
    $('lk-h').oninput = upd; $('lk-w').oninput = upd; $('lk-b').onchange = () => { upd(); A.save(); }; $('lk-g').onchange = () => { upd(); A.save(); };
    $('lk-h').onchange = () => A.save(); $('lk-w').onchange = () => A.save();
    ML.Main.preview(true);
    for (const b of $('prof-body').querySelectorAll('.shop-it[data-id]')) b.onclick = () => {
      const id = b.dataset.id, it = ML.SHOP[id];
      if (A.owns(id)) A.equip(it.cat, id); else { const err = A.buy(id); if (err) return ML.HUD.toast(err); ML.HUD.toast(`Acheté : ${it.name} !`); }
      if (it.cat === 'klaxon') ML.Sfx.horn(id); L.renderProfile(); L.renderAccount();
    };
    for (const b of $('prof-body').querySelectorAll('[data-off]')) b.onclick = () => { A.equip(b.dataset.off, null); L.renderProfile(); };
  };

  /* ======================= Modes de jeu ======================= */
  L.renderModes = () => {
    const c = Camp.load();
    for (const p of ['h', 'r']) {
      const mode = $(p + '-mode').value, Dd = ML.DIFFS && ML.DIFFS[L.diff(p)];
      if ($(p + '-diff-desc')) $(p + '-diff-desc').textContent = Dd ? `${Dd.icon} ${Dd.desc}` : '';
      $(p + '-camp').classList.toggle('hidden', mode !== 'campagne' && mode !== 'carriere');
      if (mode === 'carriere') {
        const car = ML.Career.car, CAT = ML.CAREER;
        const where = car && car.cid ? 'entreprise partagée, sauvegarde en ligne' : ML.Account.logged() ? 'sauvegarde sur ce PC — connecte-toi au serveur pour tes entreprises' : 'sauvegarde sur ce PC — crée un compte pour jouer en équipe';
        $(p + '-camp-info').innerHTML = car ? `🏭 <b>${U.esc(car.name)}</b> · Jour <b>${car.day}</b>${car.mid ? ' <span class="dim">(reprise en cours de journée)</span>' : ''} · 💶 <b>${ML.Career.fmt(car.money)}</b> · ⭐ ${car.rep}/100 · ${CAT.LEVELS[car.atelier.lvl].name} · ${car.machines.length} machine(s), ${car.workers.length} ouvrier(s) <span class="dim">(${where})</span>`
          : `Nouvelle carrière : tu reprends <b>le Hangar Pourri</b> avec ${ML.Career.fmt(CAT.START_MONEY)}, un tour de 1974 et un apprenti.`;
        L.renderTeam(p);
        $(p + '-desc').textContent = 'Carrière sans fin : devis, machines à acheter et déplacer au fenwick, ouvriers, agrandissements… Gère tout depuis le PC du BE.';
        continue;
      }
      $(p + '-camp-info').innerHTML = `Jour <b>${c.day}/${ML.CAMPAIGN.days}</b>${c.day === ML.CAMPAIGN.bossDay ? " (l'INSPECTEUR !)" : ''} · 💶 ${c.budget} € · ⭐ ${c.rep}/100 · ${Object.keys(c.up).length} amélioration(s) <span class="dim">(sauvegarde sur ce PC)</span>`;
      const desc = { coop: 'Une journée normale, événements surprises au hasard.', campagne: '5 journées : réputation, budget, améliorations de l\'atelier, apprentis… et l\'inspecteur au jour 5.', inspection: "Boss : l'inspecteur de l'Éducation Nationale impose des règles absurdes qui changent.", course: 'Course de Mégane dans la ville : 5 manches, premier arrivé devant l\'entreprise indiquée !' }[mode];
      $(p + '-desc').textContent = desc;
    }
  };
  /** Configuration de la partie envoyée à tous */
  L.gameCfg = p => {
    const mode = $(p + '-mode').value, traitor = p === 'r' && $('r-traitor').checked, diff = L.diff(p);
    if (mode === 'carriere') {
      const CR = ML.Career; if (!CR.car) CR.car = CR.fresh();
      return Object.assign(L.careerCfg(CR.car), { traitor: false, roles: L.cfgRoles(p), diff });
    }
    if (mode === 'campagne') {
      const c = Camp.load();
      return { mode: c.day === ML.CAMPAIGN.bossDay ? 'inspection' : 'campagne', campaign: true, day: c.day, upgrades: c.up, traitor, roles: L.cfgRoles(p), diff };
    }
    return { mode, day: 1, upgrades: {}, traitor, roles: L.cfgRoles(p), diff };
  };
  /** Hôte du salon : montre son choix (mode, difficulté, entreprise) aux autres joueurs */
  L.sendCfg = () => {
    if (!N.room || N.room.host !== N.id || ML.Game.on) return;
    const mode = $('r-mode').value, car = ML.Career.car;
    N.relay({ k: 'cfg', mode, diff: L.diff('r'), traitor: $('r-traitor').checked, co: mode === 'carriere' && car ? { name: car.name, day: car.day } : null });
  };
  L.renderHostCfg = () => {
    const c = L.hostCfg, el = $('room-cfg'); if (!el) return;
    const show = !!(c && N.room && N.room.host !== N.id); el.classList.toggle('hidden', !show); if (!show) return;
    const D = (ML.DIFFS && ML.DIFFS[c.diff]) || { icon: '😐', name: 'Normal' }, M = { carriere: '🏭 Carrière', coop: 'Journée libre', inspection: 'Inspection (boss)', course: 'Course de Mégane' }[c.mode] || c.mode;
    el.innerHTML = `Choix de l'hôte : <b>${U.esc(M)}</b>${c.co ? ` « ${U.esc(c.co.name)} », jour ${c.co.day}` : ''} · ${D.icon} <b>${U.esc(D.name)}</b>${c.traitor ? ' · 🕵 traître' : ''}`;
  };
  L.cfgRoles = p => (p === 'h' ? { solo: L.myRole } : L.resolveRoles());
  /** Partie de la config propre à la carrière (cid = entreprise : le serveur autorise l'hôte du salon à la sauvegarder) */
  L.careerCfg = car => {
    const R = car.atelier.rooms;
    return { mode: 'carriere', career: ML.Career.layout(car), cid: car.cid || null, seed: car.seed, day: car.day, upgrades: { babyfoot: R.pause ? 1 : 0, cafe_pro: R.pause ? 1 : 0, frigo: R.pause ? 1 : 0, plantes: car.atelier.lvl >= 2 ? 1 : 0, posters: 1 } };
  };
  /** Avant de lancer une carrière en ligne sans entreprise : on en crée une (sinon carrière locale) */
  L.ensureCareer = async () => {
    const CR = ML.Career;
    if (CR.car || !CR.online()) return;
    const r = await CR.create(`Mécanique ${A.user}`);
    if (r.ok) ML.HUD.toast(`🏢 Entreprise « ${r.car.name} » créée : invite tes potes depuis le salon !`);
  };

  /* ======================= Entreprise (carrière d'équipe) ======================= */
  L.renderTeam = p => {
    const box = $(p + '-team'); if (!box) return;
    const CR = ML.Career;
    if (!A.logged()) { box.innerHTML = '<span class="dim small">Invité : carrière gardée sur ce PC. Avec un compte, crée une <b>entreprise</b> partagée avec tes potes.</span>'; return; }
    if (!N.online) {
      box.innerHTML = '<button class="sec tiny" data-t="connect">🏢 Mes entreprises</button> <span class="dim small">(connexion au serveur ; hors ligne : carrière de ce PC)</span>';
      box.querySelector('[data-t=connect]').onclick = async () => { if (!(await L.ensure())) return; await CR.load(); L.renderModes(); };
      return;
    }
    const cur = CR.car && CR.car.cid, inf = CR.info();
    const opts = CR.teams.map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${U.esc(t.name)} — jour ${t.day} · ${t.members.length} membre${t.members.length > 1 ? 's' : ''}</option>`).join('');
    box.innerHTML = `<div class="team-row">🏢 Entreprise : <select data-t="sel">${cur ? '' : '<option value="" selected>(aucune : créée au lancement)</option>'}${opts}</select>
      <button class="sec tiny" data-t="new">Nouvelle</button>
      <input data-t="who" maxlength="16" placeholder="pseudo d'un pote" style="width:9em"> <button class="sec tiny" data-t="inv">Inviter un pote</button>
      ${cur ? '<button class="sec tiny" data-t="leave">Quitter</button>' : ''}</div>`
      + (inf ? `<div class="dim small">Patron : ${U.esc(inf.owner)} · Membres : ${inf.members.map(U.esc).join(', ')} · chacun peut héberger une partie avec.</div>` : '');
    const q = s => box.querySelector(`[data-t=${s}]`);
    const busy = async fn => { if (L.teamBusy) return; L.teamBusy = true; try { await fn(); } finally { L.teamBusy = false; L.renderModes(); } };
    q('sel').onchange = () => busy(async () => { const id = q('sel').value; if (id) await CR.open(id); });
    q('new').onclick = () => busy(async () => {
      const name = prompt('Nom de la nouvelle entreprise ?', `Mécanique ${A.user}`); if (!name) return;
      const r = await CR.create(name.trim()); ML.HUD.toast(r.ok ? `🏢 Entreprise « ${r.car.name} » créée.` : r.m || 'Erreur.');
    });
    q('inv').onclick = () => busy(async () => {
      const who = q('who').value.trim(); if (!who) return ML.HUD.toast('Tape le pseudo du compte de ton pote.');
      if (!cur) { await L.ensureCareer(); if (!CR.car || !CR.car.cid) return; }
      const r = await CR.invite(who); ML.HUD.toast(r.ok ? `🤝 ${who} fait maintenant partie de « ${CR.car.name} » : il/elle peut l'héberger aussi.` : r.m || 'Erreur.');
    });
    if (q('leave')) q('leave').onclick = () => busy(async () => {
      if (!confirm(`Quitter l'entreprise « ${CR.car.name} » ? Tu ne pourras plus y jouer (sauf si on te réinvite).`)) return;
      const r = await CR.leave(); ML.HUD.toast(r.ok ? 'Tu as quitté l\'entreprise.' : r.m || 'Erreur.');
    });
  };

  /* ======================= Migration d'hôte ======================= */
  /** L'hôte est parti en pleine partie : le serveur a désigné m.id. Le nouvel hôte relance la journée :
      carrière → depuis la dernière sauvegarde (serveur ou copie reçue de l'ancien hôte) ; autres modes → même config. */
  L.migrate = async m => {
    const G = ML.Game, game = G.game || {}, ended = G.ended, mine = m.id === N.id;
    const msg = ended ? `L'hôte est parti : ${m.name} devient l'hôte du salon.` : `L'hôte est parti : reprise de la journée par ${mine ? 'toi' : m.name}…`;
    L.migMsg = msg; G.stop(msg); L.showRoom();
    if (!mine) return;
    if (ended) {                                       // journée finie (déjà sauvegardée par l'ancien hôte) : retour au salon
      if (game.career && game.cid) { const car = await L.takeCareer(game.cid); if (car) ML.Career.car = car; $('r-mode').value = 'carriere'; }
      N.send({ t: 'end' }); L.migMsg = null; L.renderModes(); return;
    }
    let cfg;
    if (game.career) {
      const car = await L.takeCareer(game.cid);
      if (!car) { ML.HUD.toast('Impossible de récupérer la carrière : retour au salon.'); N.send({ t: 'end' }); return; }
      ML.Career.car = car; $('r-mode').value = 'carriere';
      cfg = Object.assign({}, game, L.careerCfg(car));
    } else cfg = Object.assign({}, game);
    N.send({ t: 'start', seed: cfg.seed || (N.room && N.room.seed) || (Math.random() * 1e9) >>> 0, cfg });
  };
  /** Dernière version connue de la carrière : serveur (si autorisé) ou copie diffusée par l'ancien hôte */
  L.takeCareer = async cid => {
    const CR = ML.Career, sh = CR.shared;
    let srv = null;
    if (cid && N.online) { const r = await N.acc('cload', { token: A.token, cid }); if (r.ok && r.career && r.career.v) srv = Object.assign(r.career, { cid, rev: r.rev }); }
    const c = [srv, sh && sh.v && (sh.cid || null) === (cid || null) ? sh : null].filter(Boolean).sort((a, b) => (b.rev || 0) - (a.rev || 0) || (b.saved || 0) - (a.saved || 0))[0];
    return c ? JSON.parse(JSON.stringify(c)) : null;
  };
  L.noop = () => {
  };

  /* ======================= Écrans ======================= */
  L.show = () => { L.el.classList.remove('hidden'); };
  L.hide = () => { L.el.classList.add('hidden'); };
  L.showHome = () => { L.screen('scr-home'); L.renderRoles(); L.renderAccount(); L.renderModes(); };
  L.showRoom = () => {
    const r = N.room; if (!r) return L.showHome();
    if (L.el.classList.contains('hidden') || $('scr-room').classList.contains('hidden')) L.screen('scr-room');
    if (!A.logged() && !$('r-name').value) $('r-name').value = N.name || '';
    $('room-code').textContent = r.code;
    const slots = [];
    for (let i = 0; i < r.max; i++) {
      const p = r.players[i];
      const rr = p ? ML.ROLES[p.id === N.id ? L.myRole : L.roles[p.id] || 'poly'] : null;
      slots.push(p ? `<div class="pslot"><i style="background:${ML.COLORS[p.idx % ML.COLORS.length].css}"></i>${rr.icon} ${U.esc(p.name)} <span class="dim">${rr.name}</span>${p.id === r.host ? ' 👑' : ''}${p.id === N.id ? ' (toi)' : ''}${p.on ? '' : ' <span class="dim">(reconnexion…)</span>'}</div>` : '<div class="pslot empty">— place libre —</div>');
    }
    $('room-players').innerHTML = slots.join('');
    const host = r.host === N.id;
    $('btn-start').classList.toggle('hidden', !host); $('room-opts').classList.toggle('hidden', !host);
    $('room-wait').classList.toggle('hidden', host);
    $('room-wait').textContent = r.state === 'game' ? (L.migMsg || 'Partie en cours…') : "En attente que l'hôte choisisse le mode et lance la journée…";
    L.renderModes(); L.renderRoles(true); L.renderHostCfg();
  };
  L.backToRoom = () => { if (N.room) L.showRoom(); else L.showHome(); };

  /** Fin de journée : rejouer (hôte ou solo) */
  L.replay = () => {
    const G = ML.Game;
    if (G.game && G.game.career && ML.Career.car && ML.Career.car.money < ML.CAREER.BANKRUPT) {   // faillite : la banque reprend tout
      ML.HUD.toast('🏦 FAILLITE : la banque a repris le Hangar. Lebec repart de zéro (avec sa pelle).');
      const old = ML.Career.car;
      ML.Career.car = Object.assign(ML.Career.fresh(old.name), old.cid ? { cid: old.cid, rev: old.rev || 0 } : {}); ML.Career.save();
    }
    const cfg = G.game && (G.game.campaign || G.game.career) ? L.gameCfg(G.solo ? 'h' : 'r') : Object.assign({}, G.game);
    if (G.solo) { const me = G.players[G.me]; G.start({ solo: true, seed: cfg.seed || Date.now() >>> 0, me: G.me, host: G.me, players: [me], game: cfg }); }
    else if (G.isHost) N.send({ t: 'start', seed: cfg.seed || (Math.random() * 1e9) >>> 0, cfg });
  };
  L.leaveAfterEnd = () => {
    const G = ML.Game;
    if (G.solo) { G.stop(); L.showHome(); return; }
    if (G.isHost) { N.send({ t: 'end' }); return; }
    N.send({ t: 'leave' }); G.stop(); L.showHome();
  };
})();
