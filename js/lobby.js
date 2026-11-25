/* =====================================================================
   lobby.js — Menus : accueil (compte / invité, solo, créer / rejoindre),
   profil (apparence + boutique), salon (5 joueurs, mode de jeu choisi
   par l'hôte), et la CAMPAGNE (sauvegardée sur le PC de l'hôte).
   ===================================================================== */
(function () {
  const L = ML.Lobby = {};
  const U = ML.U, N = ML.Net, A = ML.Account, $ = id => document.getElementById(id);

  /* ======================= Campagne : l'entreprise (sauvegardée sur le serveur + ce PC) ======================= */
  const Camp = ML.Camp = { cur: null };
  const Co = () => ML.Company;
  Camp.loadLocal = () => { try { const d = JSON.parse(localStorage.getItem('ml_company') || 'null'); return d ? Co().clean(d) : null; } catch (e) { return null; } };
  Camp.get = () => Camp.cur || (Camp.cur = Camp.loadLocal());
  Camp.setCur = E => { Camp.cur = E; try { localStorage.setItem('ml_company', JSON.stringify(E)); } catch (e) { /* plein */ } };
  Camp.create = async name => {
    const E = Co().fresh(name || 'Mécanique Lebec');
    if (await L.ensure()) { const r = await N.camp('create', { name: E.name, data: E }); if (r.ok) E.code = r.code; else ML.HUD.toast('Sauvegarde serveur impossible : ' + (r.m || '?') + ' (gardée sur ce PC).'); }
    else ML.HUD.toast('Serveur injoignable : l\'entreprise est gardée sur ce PC seulement.');
    Camp.setCur(E); return E;
  };
  Camp.fetch = async code => {
    if (!(await L.ensure())) { ML.HUD.toast('Serveur injoignable.'); return null; }
    const r = await N.camp('load', { code }); if (!r.ok) { ML.HUD.toast(r.m || 'Code inconnu.'); return null; }
    const E = Co().clean(r.data); E.code = r.code; Camp.setCur(E); return E;
  };
  Camp.push = E => { Camp.setCur(E); if (E.code && N.online) N.camp('put', { code: E.code, data: E }).then(r => { if (!r.ok) console.warn('Sauvegarde :', r.m); }); };
  /** Sauvegarde automatique en cours de journée (hôte) */
  Camp.autosave = snap => { const E = Camp.get(); if (E && snap) Camp.push(Co().merge(E, snap)); };
  /** Fin de journée (hôte) : on enregistre l'entreprise, jour suivant, l'inspecteur viendra-t-il ? */
  Camp.applyEnd = res => {
    const E = Co().merge(Camp.get() || Co().fresh(), res.snap);
    if (res.bankrupt) {                                                // sous −2 000 € : faillite, l'entreprise est fermée
      E.bankrupt = true; Camp.push(E);
      return { camp: `<div class="camp"><p>💸 <b>${ML.U.esc(E.name)}</b> ferme ses portes après ${E.day} jour${E.day > 1 ? 's' : ''}. On peut recommencer une nouvelle entreprise.</p></div>`, nextLabel: 'Recommencer (nouvelle entreprise)' };
    }
    E.tot.ca += (res.today && res.today.ca) || 0; E.tot.served += res.served || 0; E.tot.days++; E.tot.best = Math.max(E.tot.best, res.profit || 0);
    let msg = '';
    if (res.mode === 'inspection') {
      E.insp = null;
      if (res.inspection && res.inspection.pass) { if (!E.won) msg = '🏆 <b>CAMPAGNE TERMINÉE !</b> '; E.won = true; }
      else { E.inspNext = E.day + 1 + ML.CAMPAIGN.retry; msg = "🎓 Avis défavorable… L'inspecteur reviendra dans quelques jours. Améliorez l'atelier ! "; }
    }
    E.day++;
    if (Co().inspReady(E)) { E.insp = 'due'; msg += "📨 Courrier recommandé : l'INSPECTEUR de l'Éducation Nationale vient DEMAIN ! "; }
    if (E.money < 0) msg += '💸 La caisse est dans le rouge : vendez, économisez, licenciez si besoin ! ';
    E.log = (E.log || []).concat([`Jour ${E.day - 1} : ${Math.round(res.profit || 0)} €`]).slice(-8);
    Camp.push(E);
    return { camp: `<div class="camp">${msg ? `<p>${msg}</p>` : ''}<p>${Co().summary(E)}</p><p class="dim">${Co().goal(E)}</p></div>`, nextLabel: `Jour ${E.day} →` };
  };
  /** Configuration d'une journée de campagne */
  Camp.cfg = (diff, traitor, roles) => {
    const E = Camp.get(); if (!E) return null;
    if (E.bankrupt) { ML.HUD.toast(`💸 « ${E.name} » a fait faillite : crée une nouvelle entreprise.`); return null; }
    return { mode: E.insp === 'due' ? 'inspection' : 'campagne', campaign: true, day: E.day, E, city: E.city, code: E.code, traitor, diff, roles };
  };

  /* ======================= Init ======================= */
  const SCREENS = ['scr-home', 'scr-account', 'scr-guide', 'scr-solo', 'scr-multi', 'scr-profile', 'scr-room'];
  L.screen = id => {
    if (id !== 'scr-profile') L.cur = id;
    L.show(); for (const k of SCREENS) $(k).classList.toggle('hidden', k !== id);
    const pv = id === 'scr-profile'; L.el.classList.toggle('preview', pv); if (ML.Main.preview) ML.Main.preview(pv);
    if (id === 'scr-solo' || id === 'scr-room') L.tip();
  };
  L.init = () => {
    L.el = $('lobby');
    A.load();
    $('in-name').value = A.name();
    $('in-server').value = N.defaultUrl();
    if (/^https?:/.test(location.protocol)) $('server-row').classList.add('hidden');
    L.roles = {}; L.hostCfg = null; L.myRole = ML.ROLES[localStorage.getItem('ml_role')] ? localStorage.getItem('ml_role') : 'poly';
    // navigation
    $('go-solo').onclick = () => { L.screen('scr-solo'); L.renderRoles(); L.renderModes(); };
    $('go-multi').onclick = async () => { L.screen('scr-multi'); if (await L.ensure()) N.send({ t: 'list' }); };
    $('go-account').onclick = () => { L.screen('scr-account'); L.renderAccount(); };
    $('go-guide').onclick = () => { L.screen('scr-guide'); $('guide-tips').innerHTML = ML.TIPS.map(t => `<li>${U.esc(t)}</li>`).join(''); };
    for (const b of L.el.querySelectorAll('.back')) b.onclick = () => L.showHome();
    $('btn-profile-h').onclick = () => L.showProfile(); $('btn-profile-r').onclick = () => L.showProfile();
    $('btn-prof-back').onclick = () => { if (L.cur === 'scr-room' && N.room) { L.showRoom(); } else L.screen(L.cur || 'scr-home'); };
    // solo
    $('btn-solo').onclick = () => { const n = L.name('h'); if (!n) return; const game = L.gameCfg('h'); if (!game) return; ML.Sfx.init(); ML.Game.start({ solo: true, seed: Date.now() >>> 0, me: 'solo', host: 'solo', players: [{ id: 'solo', name: n, idx: 0 }], game }); };
    // multi
    $('btn-create').onclick = async () => { if (!(await L.ensure())) return; N.send({ t: 'create', priv: $('in-priv').checked }); };
    $('btn-join').onclick = async () => { const code = $('in-code').value.trim().toUpperCase(); if (code.length !== 4) return ML.HUD.toast('Le code fait 4 lettres.'); if (!(await L.ensure())) return; N.send({ t: 'join', code }); };
    $('btn-list').onclick = async () => { if (!(await L.ensure())) return; N.send({ t: 'list' }); };
    // salon
    $('btn-start').onclick = () => { if (!L.name('r')) return; const cfg = L.gameCfg('r'); if (!cfg) return; N.send({ t: 'start', seed: (Math.random() * 1e9) >>> 0, cfg }); };
    $('btn-leave').onclick = () => { N.send({ t: 'leave' }); L.showHome(); };
    $('btn-copy').onclick = () => { try { navigator.clipboard.writeText(N.room.code); ML.HUD.toast('Code copié !'); } catch (e) { /* rien */ } };
    $('r-name').onchange = () => L.name('r');
    // compte
    $('btn-login').onclick = () => L.auth('login');
    $('btn-register').onclick = () => L.auth('register');
    $('btn-logout').onclick = () => { A.logout(); L.renderAccount(); ML.HUD.toast('Déconnecté : tu joues en invité.'); };
    // modes
    for (const p of ['h', 'r']) {
      $(p + '-mode').onchange = $(p + '-diff').onchange = () => { L.renderModes(); if (p === 'r') L.sendCfg(); };
      $(p + '-camp-new').onclick = async () => {
        const cur = Camp.get(), nm = $(p + '-camp-name').value.trim();
        if (cur && !confirm(`Créer une NOUVELLE entreprise ? « ${cur.name} »${cur.code ? ` reste récupérable avec son code ${cur.code}` : ' (sauvegardée sur ce PC seulement) sera remplacée'}.`)) return;
        const E = await Camp.create(nm || 'Mécanique Lebec'); L.renderModes(); if (p === 'r') L.sendCfg();
        ML.HUD.toast(E.code ? `Entreprise créée ! Code de sauvegarde : ${E.code}` : 'Entreprise créée (sur ce PC).');
      };
      $(p + '-camp-load').onclick = async () => {
        const code = $(p + '-camp-code').value.trim().toUpperCase(); if (code.length < 4) return ML.HUD.toast('Entre le code de sauvegarde (6 caractères).');
        const E = await Camp.fetch(code); if (E) { ML.HUD.toast(`Entreprise « ${E.name} » chargée (jour ${E.day}).`); $(p + '-camp-code').value = ''; L.renderModes(); if (p === 'r') L.sendCfg(); }
      };
    }
    $('r-traitor').onchange = () => L.sendCfg();
    const lastDiff = localStorage.getItem('ml_diff'); if (ML.DIFFS[lastDiff]) { $('h-diff').value = lastDiff; $('r-diff').value = lastDiff; }
    setInterval(() => { if (!L.el.classList.contains('hidden')) L.tip(); }, 8000);

    N.on('status', s => { $('status').textContent = s; });
    N.on('relay', m => {
      if (m.d && m.d.k === 'role') {
        L.roles[m.from] = ML.ROLES[m.d.role] ? m.d.role : 'poly';
        if (!ML.Game.on) L.renderRoles(); else if (ML.Game.isHost) ML.Sim.setRole(m.from, L.roles[m.from]);
        return;
      }
      if (m.d && m.d.k === 'cfg') { L.hostCfg = m.d; if (!ML.Game.on) L.renderHostCfg(); return; }
      ML.Game.onRelay(m);
    });
    N.on('err', m => ML.HUD.toast(m));
    N.on('welcome', () => { if (A.token) A.resume().then(ok => { if (ok) { L.renderAccount(); ML.HUD.toast('Compte ' + A.user + ' reconnecté.'); } }); });
    N.on('rooms', list => {
      $('room-list').innerHTML = list.length ? list.map(r => `<button class="rl" data-code="${r.code}" ${r.n >= r.max ? 'disabled' : ''}>${r.code} — ${U.esc(r.host)} (${r.n}/${r.max})${r.game ? ' · 🔨 partie en cours : rejoindre' : ''}</button>`).join('') : '<p class="dim small">Aucun salon public pour l\'instant. Crée le tien !</p>';
      for (const b of $('room-list').querySelectorAll('button')) b.onclick = () => N.send({ t: 'join', code: b.dataset.code });
    });
    N.on('room', room => {
      const G = ML.Game;
      if (!room) { if (G.on && !G.solo) G.stop(); L.showHome(); return; }
      if (G.on && !G.solo) {
        if (room.state === 'lobby') { G.stop('Retour au salon.'); L.showRoom(); return; }
        if (G.isHost) for (const pid in (G.S ? G.S.pl : {})) if (!room.players.find(p => p.id === pid)) ML.Sim.removePlayer(pid);
        for (const p of room.players) if (!G.players[p.id]) {                // arrivée en cours de partie (drop-in)
          G.players[p.id] = { id: p.id, name: p.name, idx: p.idx }; if (p.id !== G.me) G.addAvatar(G.players[p.id]);
          if (G.isHost) ML.Sim.addPlayer(G.players[p.id], L.roles[p.id]);
        }
        return;
      }
      if ($('scr-profile').classList.contains('hidden')) L.showRoom(); else L.cur = 'scr-room';
      L.sendRole(); if (room.host === N.id) L.sendCfg();
    });
    N.on('start', m => {
      const r = m.room; ML.Sfx.init();
      ML.Game.start({ seed: m.seed, me: N.id, host: r.host, players: r.players.map(p => ({ id: p.id, name: p.name, idx: p.idx })), game: m.cfg || { mode: 'coop' }, late: !!m.late });
      if (m.late) ML.HUD.toast('Tu rejoins la partie en cours !');
    });
    N.on('host', async id => {
      const G = ML.Game;
      if (G.on && !G.solo && id !== G.host) {
        const code = G.game && G.game.campaign && G.game.code, diff = G.game.diff;
        if (code) {                                                   // campagne : la partie continue avec un nouvel hôte
          G.stop(id === N.id ? "L'hôte est parti : tu reprends l'atelier (dernière sauvegarde)…" : "L'hôte est parti : reprise de l'atelier par un autre joueur…");
          L.showRoom();
          if (id === N.id) { const E = await Camp.fetch(code); if (E && N.room && N.room.host === N.id) N.send({ t: 'start', seed: (Math.random() * 1e9) >>> 0, cfg: Camp.cfg(diff, false, L.resolveRoles()) }); }
          return;
        }
        G.stop("L'hôte a quitté la partie."); L.showRoom();
      } else if (!G.on) L.showRoom();
    });
    N.on('unstable', () => ML.HUD.toast('Connexion instable… reconnexion en cours.'));
    N.on('resumed', () => ML.HUD.toast('Reconnecté !'));
    N.on('lost', () => { ML.Game.stop('Connexion perdue.'); L.showHome(); ML.HUD.toast('Connexion au serveur perdue.'); });
    L.initInstall();
    L.showHome();
  };
  /** Appli installable (PWA) : bouton « Installer le jeu » (Chrome / Edge), icône sur le bureau, sa propre fenêtre */
  L.initInstall = () => {
    const web = /^https?:/.test(location.protocol), btn = $('go-install');
    const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (web && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* rien */ });
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
  /** Astuce au hasard (salon, solo) */
  L.tip = () => { const t = U.pick(ML.TIPS); for (const id of ['tip-h', 'tip-r']) if ($(id)) $(id).innerHTML = '💡 ' + U.esc(t); };

  /* ======================= Compte ======================= */
  L.renderAccount = () => {
    const logged = A.logged();
    $('acc-state').innerHTML = logged ? `Connecté·e : <b>${U.esc(A.user)}</b> · 🪙 ${A.prof.coins} jetons` : `Invité·e (profil gardé sur ce PC) · 🪙 ${A.prof.coins} jetons`;
    $('acc-mini').textContent = logged ? A.user + ' · 🪙 ' + A.prof.coins : 'Compte (invité)';
    $('acc-form').classList.toggle('hidden', logged); $('btn-logout').classList.toggle('hidden', !logged);
    $('solo-name-row').classList.toggle('hidden', logged); $('room-name-row').classList.toggle('hidden', logged);
    if (logged) { $('in-name').value = A.user; $('r-name').value = A.user; }
  };
  L.auth = async op => {
    const user = $('in-user').value.trim(), pass = $('in-pass').value;
    if (!user || !pass) return ML.HUD.toast('Pseudo et mot de passe !');
    if (!(await L.ensure(user))) return;
    const r = await A.auth(op, user, pass);
    if (!r.ok) return ML.HUD.toast(r.m || 'Erreur.');
    $('in-pass').value = ''; L.renderAccount();
    if (N.name !== A.user) { N.name = A.user; N.send({ t: 'name', name: A.user }); }
    ML.HUD.toast(op === 'register' ? `Compte créé : bienvenue ${A.user} !` : `Re-bonjour ${A.user} !`);
  };
  /** Pseudo du joueur (compte, ou champ du solo / du salon) */
  L.name = where => {
    const field = where === 'r' ? $('r-name') : $('in-name');
    const n = (A.logged() ? A.user : field.value.trim()).slice(0, 16);
    if (!n) { ML.HUD.toast('Choisis un pseudo !'); field.focus(); return null; }
    localStorage.setItem('ml_name', n); if (!A.logged() && A.prof.name !== n) { A.prof.name = n; A.save(); }
    $('in-name').value = n; $('r-name').value = n;
    if (N.online && n !== N.name) { N.name = n; N.send({ t: 'name', name: n }); }
    return n;
  };
  L.ensure = async nm => {
    if (N.online) return true;
    $('status').textContent = 'Connexion au serveur…';
    const n = nm || (A.logged() ? A.user : localStorage.getItem('ml_name')) || 'Joueur' + Math.floor(Math.random() * 900 + 100);
    return N.connect($('in-server').value.trim() || N.defaultUrl(), n);
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
    const c = Camp.get();
    for (const p of ['h', 'r']) {
      const mode = $(p + '-mode').value;
      $(p + '-camp').classList.toggle('hidden', mode !== 'campagne');
      $(p + '-camp-info').innerHTML = c ? `${ML.Company.summary(c)}<br><span class="dim">${ML.Company.goal(c)}</span>` : '<b>Aucune entreprise.</b> Donne-lui un nom et crée-la, ou charge une entreprise avec son code.';
      const desc = { coop: 'Une journée seule : petit atelier (T1, F1, un opérateur, le vieux Kangoo) et 1 500 € pour investir au PC.', campagne: 'Fais grandir ton atelier jour après jour : argent, machines, embauches, véhicules. Sauvegardé sur le serveur avec un CODE (n\'importe qui peut reprendre). L\'inspecteur vient quand l\'atelier est prêt : le réussir termine le jeu.', inspection: "Boss : l'inspecteur de l'Éducation Nationale impose des règles absurdes qui changent.", course: 'Course de Mégane dans la ville : 5 manches, premier arrivé devant l\'entreprise indiquée !' }[mode];
      const D = ML.DIFFS[$(p + '-diff').value] || ML.DIFFS.normal;
      $(p + '-desc').textContent = desc + ' — ' + D.icon + ' ' + D.name + ' : ' + D.desc;
    }
  };
  /** Configuration de la partie envoyée à tous */
  L.sendCfg = () => { if (N.room && N.room.host === N.id) { const c = Camp.get(); N.relay({ k: 'cfg', mode: $('r-mode').value, diff: $('r-diff').value, traitor: $('r-traitor').checked, co: c && $('r-mode').value === 'campagne' ? { name: c.name, day: c.day, code: c.code } : null }); } };
  L.renderHostCfg = () => {
    const c = L.hostCfg, el = $('room-cfg'); if (!el) return;
    if (!c || (N.room && N.room.host === N.id)) { el.textContent = ''; return; }
    const D = ML.DIFFS[c.diff] || ML.DIFFS.normal, M = { coop: 'Journée libre', campagne: 'Campagne', inspection: 'Inspection (boss)', course: 'Course de Mégane' }[c.mode] || c.mode;
    el.innerHTML = `Choix de l'hôte : <b>${U.esc(M)}</b>${c.co ? ` « ${U.esc(c.co.name)} », jour ${c.co.day}${c.co.code ? ` (code ${U.esc(c.co.code)})` : ''}` : ''} · ${D.icon} <b>${D.name}</b>${c.traitor ? ' · 🕵 traître' : ''}`;
  };
  L.gameCfg = p => {
    const mode = $(p + '-mode').value, traitor = p === 'r' && $('r-traitor').checked, diff = $(p + '-diff').value;
    localStorage.setItem('ml_diff', diff);
    if (mode === 'campagne') {
      const cfg = Camp.cfg(diff, traitor, L.cfgRoles(p));
      if (!cfg) ML.HUD.toast('Campagne : crée ton entreprise (ou charge-la avec son code) d\'abord !');
      return cfg;
    }
    return L.freeCfg(mode, diff, traitor, L.cfgRoles(p));
  };
  L.cfgRoles = p => (p === 'h' ? { solo: L.myRole } : L.resolveRoles());
  /** Journée hors campagne : petit atelier de départ, 1 500 € pour investir, nouvelle ville */
  L.freeCfg = (mode, diff, traitor, roles) => ({ mode, day: 1, E: ML.Company.fresh(mode === 'coop' ? 'Journée libre' : 'Mécanique Lebec', mode === 'course' ? 0 : ML.ECO.freeMoney), city: (Math.random() * 1e9) >>> 0, traitor, diff, roles });
  L.noop = () => {
  };

  /* ======================= Écrans ======================= */
  L.show = () => { L.el.classList.remove('hidden'); };
  L.hide = () => { L.el.classList.add('hidden'); };
  L.showHome = () => { L.screen('scr-home'); L.renderRoles(); L.renderAccount(); L.renderModes(); };
  L.showRoom = () => {
    const r = N.room; if (!r) return L.showHome();
    L.screen('scr-room'); L.renderAccount();
    if (!A.logged() && !$('r-name').value) $('r-name').value = N.name || '';
    $('room-code').textContent = r.code;
    const slots = [];
    for (let i = 0; i < r.max; i++) {
      const p = r.players[i];
      const rr = p ? ML.ROLES[p.id === N.id ? L.myRole : L.roles[p.id] || 'poly'] : null;
      slots.push(p ? `<div class="pslot"><i style="background:${ML.COLORS[p.idx % 6].css}"></i>${rr.icon} ${U.esc(p.name)} <span class="dim">${rr.name}</span>${p.id === r.host ? ' 👑' : ''}${p.id === N.id ? ' (toi)' : ''}${p.on ? '' : ' <span class="dim">(reconnexion…)</span>'}</div>` : '<div class="pslot empty">— place libre —</div>');
    }
    $('room-players').innerHTML = slots.join('');
    const host = r.host === N.id;
    $('btn-start').classList.toggle('hidden', !host); $('room-opts').classList.toggle('hidden', !host);
    $('room-wait').classList.toggle('hidden', host);
    $('room-wait').textContent = r.state === 'game' ? 'Partie en cours… (tu vas la rejoindre)' : "En attente que l'hôte choisisse le mode et lance la journée…";
    L.renderModes(); L.renderRoles(true); L.renderHostCfg();
  };
  L.backToRoom = () => { if (N.room) L.showRoom(); else L.showHome(); };

  /** Fin de journée : rejouer (hôte ou solo) */
  L.replay = () => {
    const G = ML.Game;
    const g = G.game || {}, roles = G.solo ? g.roles : L.resolveRoles(), r = G.lastRes;
    let cfg;
    if (g.campaign) {
      const cur = Camp.get();
      if (cur && cur.bankrupt) { Camp.create(cur.name).then(() => L.replay()); return; }        // faillite : nouvelle entreprise, même nom
      cfg = Camp.cfg(g.diff, g.traitor, roles);
    } else {
      cfg = L.freeCfg(g.mode, g.diff, g.traitor, roles);
      // journée libre : on CONTINUE avec le même atelier tant qu'on n'est pas en faillite
      if (g.mode === 'coop' && r && r.snap && !r.bankrupt && g.E) { const E = ML.Company.merge(g.E, r.snap); E.day = (g.E.day || 1) + 1; E.name = g.E.name; cfg.E = E; cfg.day = E.day; cfg.city = g.city; }
    }
    if (!cfg) return;
    if (G.solo) { const me = G.players[G.me]; G.start({ solo: true, seed: Date.now() >>> 0, me: G.me, host: G.me, players: [me], game: cfg }); }
    else if (G.isHost) N.send({ t: 'start', seed: (Math.random() * 1e9) >>> 0, cfg });
  };
  L.leaveAfterEnd = () => {
    const G = ML.Game;
    if (G.solo) { G.stop(); L.showHome(); return; }
    if (G.isHost) { N.send({ t: 'end' }); return; }
    N.send({ t: 'leave' }); G.stop(); L.showHome();
  };
})();
