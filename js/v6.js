/* =====================================================================
   v6.js — V6 (client) : textes et actions [E] des nouveautés, fenêtres
   des distractions (PMU, blackjack, prêteur, boîte, combats), Jean-Mi
   (black), racketteur, jauges faim / fatigue, évanouissement, ivresse,
   et le panneau ADMIN (F9, pour tester : argent, commandes, événements).
   La logique (et le hasard) reste sur l'hôte : js/sim_v6.js.
   ===================================================================== */
(function () {
  const V6 = ML.V6UI = {}, U = ML.U, V = ML.V6;
  const G = () => ML.Game, S = () => ML.Game.S;
  const isPart = it => it && (it.type === 'caisse' || it.type === 'piece' || it.type === 'palette');
  const eur = n => Math.round(n).toLocaleString('fr-FR') + ' €';
  const me = () => { const s = S(); return s && s.pl[G().me]; };
  const I = (op, o) => G().intent(Object.assign({ a: 'v6', op }, o || {}));
  const D = () => ML.Dialogue;
  const VENUE_NPC = { turfiste: 'pmu', croupier: 'casino', preteur: 'gages', barman: 'boite', bookmaker: 'arene' };

  /* ---------- Textes [E] ---------- */
  function label(id) {
    const s = S(); if (!s) return undefined;
    const held = G().held(), [kind, a] = id.split(':');
    switch (kind) {
      case 'planque': return held && held.d && held.d.blk ? `🫣 Planquer la caisse O ${held.d.oid} (au black)` : !held && (s.hidden || []).length ? `Reprendre une caisse planquée (${s.hidden.length})` : `Planque (bâche) : ${(s.hidden || []).length} caisse(s) au black`;
      case 'distrib': return `🍫 Distributeur : barre chocolatée (${V.snack} €)`;
      case 'sieste': return '😴 Faire une sieste sur la banquette';
      case 'poubelles': return '🗑 Prendre un sac-poubelle (à lancer sur Dennis)';
      case 'ring': return '🥊 Monter sur le ring (inscription 50 €)';
      case 'mach': { const M = s.machines[a]; if (M && M.job && M.job.blk && !M.job.cam && !held) return `🎭 ${a} : afficher un FAUX PROGRAMME (black)`; return undefined; }
      case 'npc': {
        if (a === 'jeanmi' && !isPart(held)) return `🕶 Jean-Mi : commandes au black (${(s.bprops || []).length})`;
        if (a === 'hotdog') return `🌭 Acheter un hot-dog (${V.hotdog} €)`;
        if (a === 'racket') return '🕶 Répondre au racketteur';
        if (a === 'flic') return '🚔 Le brigadier Ropars (contrôle)';
        if (a === 'squat1' || a === 'squat2') return '🛋 Squatteur… (GRANDE clé à molette, clic gauche)';
        if (a === 'dennis') return '👦 Dennis… (lance-lui un sac-poubelle, clic droit)';
        if (VENUE_NPC[a]) return { pmu: '🐎 Parier sur les courses', casino: '♠ Jouer au blackjack', gages: '🧙 Voir les objets (inutiles) à vendre', boite: '🍹 Commander au bar', arene: '🥊 Parier sur un combat' }[VENUE_NPC[a]];
        return undefined;
      }
    }
    return undefined;
  }
  function use(id) {
    const s = S(); if (!s) return false;
    const held = G().held(), [kind, a] = id.split(':');
    if (kind === 'ring') { fightSelf(); return true; }
    if (kind !== 'npc') return false;
    if (a === 'jeanmi' && !isPart(held)) { jeanmi(); return true; }
    if (a === 'hotdog') { I('hotdog'); return true; }
    if (a === 'racket') { D().choice('Bébert la Gâchette', `T'as ${V.racket.ask} € pour moi, oui ou non ?`, [{ label: `💶 Payer ${V.racket.ask} €`, fn: () => I('racket', { pay: 1 }) }, { label: '✋ Refuser (il va cogner…)', fn: () => I('racket', { pay: 0 }) }]); return true; }
    if (VENUE_NPC[a]) { venue(VENUE_NPC[a]); return true; }
    return false;
  }
  function jeanmi() {
    const s = S(), L = s.bprops || [], mine = s.orders.filter(o => o.blk);
    const txt = `Psst… Des pièces sans facture, payées ${V.black.mult}× plus cher, en liquide. Tu les usines, tu me les ramènes ICI. Les flics passent de temps en temps : planque tes caisses sous la bâche (mur gauche) et mets un faux programme sur la machine (E). Réputation black : ${s.brep || 0}/100.` + (mine.length ? ` En cours : ${mine.map(o => ML.on(o.id)).join(', ')}.` : '');
    D().choice('Jean-Mi « Sous-le-Manteau »', txt, L.map(p => ({ label: `🕶 O ${p.id} · ${ML.MATERIALS[p.mat].label} · ${ML.MTYPE[p.mtype]} · ${eur(p.price)}`, fn: () => I('baccept', { id: p.id }) })).concat([{ label: L.length ? 'Pas aujourd\'hui' : 'Rien pour l\'instant, repasse plus tard', fn: null }]));
  }

  /* ---------- Fenêtre générique ---------- */
  let modal = null;
  function open(title, html) {
    if (!modal) { modal = document.createElement('div'); modal.id = 'v6m'; modal.className = 'v6m hidden'; document.body.appendChild(modal); modal.addEventListener('click', e => { const b = e.target.closest('[data-v6]'); if (b && !b.disabled && V6.on[b.dataset.v6]) V6.on[b.dataset.v6](b); }); }
    if (D().open) D().forceClose();
    modal.innerHTML = `<div class="v6c"><div class="v6t">${title}<button data-v6="close">✕</button></div><div class="v6b">${html}</div></div>`;
    modal.classList.remove('hidden'); ML.ui.modal = 'v6'; ML.Input.unlock();
  }
  const body = () => modal && modal.querySelector('.v6b');
  V6.close = () => { if (!modal) return; modal.classList.add('hidden'); if (ML.ui.modal === 'v6') { ML.ui.modal = null; if (G().on && !G().ended) ML.Input.lock(); } };
  V6.on = { close: V6.close };
  document.addEventListener('keydown', e => { if (e.code === 'Escape' && ML.ui.modal === 'v6') V6.close(); });
  const betRow = (k) => `<div class="v6bet">Mise : ${[10, 25, 50, 100, 250].map(v => `<button data-v6="bet" data-v="${v}" class="${V6.bet === v ? 'on' : ''}">${v} €</button>`).join('')} <span class="dim">· caisse : <b>${eur(S().money)}</b></span></div>`;
  V6.bet = 25;
  V6.on.bet = b => { V6.bet = +b.dataset.v; modal.querySelectorAll('[data-v6="bet"]').forEach(x => x.classList.toggle('on', x === b)); };

  /* ---------- Lieux ---------- */
  function venue(k) {
    if (k === 'pmu') return open('🐎 PMU Le Fer à Cheval', `<p>Course en direct de l'hippodrome de Kerplouz. Choisis ton cheval :</p>${betRow()}
      <div class="v6horses">${['Éclair de Fougères ×2', 'Copeau Volant ×3', 'Petite Fraiseuse ×5', 'Dernière Chance ×9'].map((n, i) => `<button data-v6="horse" data-h="${i}"><b>${i + 1}</b> ${n}</button>`).join('')}</div><canvas id="v6race" width="560" height="150"></canvas><p id="v6res" class="dim">La maison prend sa part. Toujours.</p>`);
    if (k === 'casino') { V6.bj = null; return open('♠ Casino Le Tour de Main — Blackjack', `<p>Approche-toi le plus possible de 21 sans dépasser. Le croupier tire jusqu'à 17. Blackjack payé 3 pour 2.</p>${betRow()}<div id="v6bj"><button class="big" data-v6="bjstart">🃏 Distribuer</button></div>`); }
    if (k === 'gages') return open('🧙 Prêteur sur gages — Chez Dédé', `<p>« Tout est à vendre, même ce qui ne sert à rien. » (payé avec la caisse de l'atelier)</p><div class="v6shop">${Object.keys(V.pawn).map(t => `<button data-v6="pawn" data-k="${t}">${ML.Items.TYPES[t].icon} <b>${ML.Items.TYPES[t].name}</b><span>${eur(V.pawn[t])}</span><i>${U.esc(ML.Items.TYPES[t].hint)}</i></button>`).join('')}</div>`);
    if (k === 'boite') return open('🍹 Le Copeau Club', `<p>La musique fait trembler les murs. Les videurs surveillent la scène : <b>n'y monte pas</b>.</p><div class="v6shop">
      <button data-v6="club" data-k="drink">🍸 <b>Un « Lubrifiant de coupe »</b><span>${eur(V.club.drink)}</span><i>Ça tourne un peu, ensuite.</i></button>
      <button data-v6="club" data-k="round">🍾 <b>Tournée générale</b><span>${eur(V.club.round)}</span><i>Payée avec la caisse de l'atelier, évidemment.</i></button></div>`);
    if (k === 'arene') return open('🥊 Hangar 13 — Combats clandestins', `<p>Ce soir : <b style="color:#ff7b7b">« Le Tourneur Fou »</b> contre <b style="color:#7bb8ff">« Kévin la Fraise »</b>. 50/50, gain ×2.</p>${betRow()}
      <div class="v6horses"><button data-v6="fbet" data-f="0">🔴 Le Tourneur Fou</button><button data-v6="fbet" data-f="1">🔵 Kévin la Fraise</button></div><p id="v6res" class="dim">Ou monte toi-même sur le ring (E sur le ring, 50 € l'inscription).</p>`);
  }
  V6.on.horse = b => { I('horse', { h: +b.dataset.h, bet: V6.bet }); modal.querySelectorAll('[data-v6="horse"]').forEach(x => (x.disabled = true)); $('v6res').textContent = 'Les chevaux sont dans les stalles…'; };
  V6.on.pawn = b => I('pawn', { k: b.dataset.k });
  V6.on.club = b => I('club', { act: b.dataset.k });
  V6.on.fbet = b => { I('fight', { act: 'bet', f: +b.dataset.f, bet: V6.bet }); modal.querySelectorAll('[data-v6="fbet"]').forEach(x => (x.disabled = true)); $('v6res').textContent = 'DING DING ! Le combat commence…'; };
  V6.on.bjstart = () => I('bj', { act: 'start', bet: V6.bet });
  V6.on.bjhit = () => I('bj', { act: 'hit' });
  V6.on.bjstand = () => I('bj', { act: 'stand' });
  const $ = id => document.getElementById(id);

  function raceAnim(e) {
    const cv = $('v6race'); if (!cv) return; const x = cv.getContext('2d'), t0 = performance.now(), cols = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6'];
    let r = e.seed; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const sp = [0, 1, 2, 3].map(i => 0.8 + rnd() * 0.3 + (i === e.w ? 0.35 : 0));
    const draw = () => {
      const k = Math.min(1, (performance.now() - t0) / 4500); x.fillStyle = '#2e7d32'; x.fillRect(0, 0, 560, 150);
      x.fillStyle = '#fff'; x.fillRect(530, 0, 4, 150);
      for (let i = 0; i < 4; i++) { const p = Math.min(1, k * sp[i] / sp[e.w]) * 500; x.fillStyle = cols[i]; x.font = '26px serif'; x.fillText('🐎', 10 + p, 32 + i * 35); x.fillStyle = '#fff'; x.font = 'bold 12px Arial'; x.fillText(String(i + 1), 2 + p, 30 + i * 35); }
      if (k < 1) requestAnimationFrame(draw); else { const res = $('v6res'); if (res) res.innerHTML = e.gain ? `🎉 Le n°${e.w + 1} gagne ! Tu touches <b>${eur(e.gain)}</b>.` : `😩 Le n°${e.w + 1} gagne. Ta mise de ${eur(e.bet)} est perdue.`; modal.querySelectorAll('[data-v6="horse"]').forEach(b => (b.disabled = false)); }
    };
    draw();
  }
  const cardTxt = c => (c === 1 ? 'A' : c === 10 ? ['10', 'V', 'D', 'R'][Math.floor(Math.random() * 4)] : String(c));
  function bjShow(e) {
    const el = $('v6bj'); if (!el) return; const tot = h => { let t = h.reduce((a, b) => a + b, 0); if (h.includes(1) && t + 10 <= 21) t += 10; return t; };
    V6.bjc = V6.bjc || {}; const show = (h, key) => h.map((c, i) => (V6.bjc[key + i] = V6.bjc[key + i] || cardTxt(c))).map(t => `<span class="card">${t}</span>`).join('');
    if (e.st === 'play' && e.p.length === 2) V6.bjc = {};
    const res = { bj: `🃏 BLACKJACK ! +${eur(e.gain)}`, win: `🎉 Gagné ! +${eur(e.gain)}`, push: '🤝 Égalité : mise rendue.', lose: '😩 Perdu.', bust: '💥 Plus de 21 : perdu.' }[e.st];
    el.innerHTML = `<div class="bjrow">Croupier : ${show(e.d, 'd')}${e.st === 'play' ? '<span class="card back">?</span>' : ` <b>(${tot(e.d)})</b>`}</div><div class="bjrow">Toi : ${show(e.p, 'p')} <b>(${tot(e.p)})</b></div>` +
      (e.st === 'play' ? '<button class="big" data-v6="bjhit">➕ Carte</button> <button class="big" data-v6="bjstand">✋ Je reste</button>' : `<p class="bjres">${res}</p><button class="big" data-v6="bjstart">🃏 Rejouer</button>`);
  }
  // combat sur le ring : appuie sur ESPACE quand la barre est dans la zone verte (5 coups)
  function fightSelf() {
    open('🥊 Sur le ring !', `<p>Inscription : 50 € (pris dans la caisse). Frappe avec <b>ESPACE</b> quand le curseur est dans la zone verte. 5 coups.</p><canvas id="v6fight" width="480" height="60"></canvas><p id="v6res" class="dim">Prêt ? Appuie sur ESPACE pour commencer.</p>`);
    let st = 0, hits = 0, n = 0, t = 0, run = false, last = performance.now();
    const cv = $('v6fight'), x = cv.getContext('2d');
    const key = e => { if (ML.ui.modal !== 'v6' || e.code !== 'Space') return; e.preventDefault(); if (!run) { run = true; return; } const p = (Math.sin(t * 3.2) + 1) / 2; n++; if (p > 0.42 && p < 0.58) { hits++; ML.Sfx.play('punch'); } else ML.Sfx.play('whoosh'); if (n >= 5) { run = false; document.removeEventListener('keydown', key); I('fight', { act: 'self', score: hits / 5 }); $('v6res').textContent = `${hits}/5 coups placés… verdict de l'arbitre !`; } };
    document.addEventListener('keydown', key);
    const draw = () => { if (!$('v6fight')) return document.removeEventListener('keydown', key); const now = performance.now(); if (run) t += (now - last) / 1000; last = now; const p = (Math.sin(t * 3.2) + 1) / 2; x.fillStyle = '#222'; x.fillRect(0, 0, 480, 60); x.fillStyle = '#2ecc71'; x.fillRect(480 * 0.42, 0, 480 * 0.16, 60); x.fillStyle = '#ffd257'; x.fillRect(p * 470, 5, 10, 50); x.fillStyle = '#fff'; x.font = 'bold 14px Arial'; x.fillText(`Coups : ${n}/5 · placés : ${hits}`, 8, 54); requestAnimationFrame(draw); };
    draw();
  }

  /* ---------- Événements venus de l'hôte ---------- */
  function event(e) {
    const mine = !e.to || e.to === G().me;
    switch (e.e) {
      case 'nrag': { const v = G().npcViews[e.id]; if (v) ML.People.ragdoll(v, 8); ML.Sfx.play('punch'); return true; }
      case 'warp': if (mine) { G().p.pos.set(e.x, ML.gy(e.x, e.z), e.z); } return true;
      case 'faint': if (mine) { G().p.stun = e.d; G().p.rag = { t: Math.min(2.6, e.d), vx: 0, vz: 0, vy: 2, y: 0 }; screen(e.d, '😵 …', 'rgba(0,0,0,0.92)'); } return true;
      case 'nap': if (mine) { G().p.stun = e.d; screen(e.d, '😴 Zzz…', 'rgba(10,20,40,0.9)'); } return true;
      case 'drunk': if (mine) { V6.drunk = performance.now() + e.d * 1000; ML.HUD.notify('🍸 Glouglou… le sol bouge un peu.', 'info'); } return true;
      case 'horse': if (mine) raceAnim(e); return true;
      case 'bj': if (mine) bjShow(e); return true;
      case 'fight': if (mine) { const r = $('v6res'); if (r) r.innerHTML = e.self ? (e.win ? '🏆 VICTOIRE ! Le public est en délire.' : '😵 K.O. … tu vois des étoiles.') : (e.gain ? `🎉 ${e.w ? 'Kévin la Fraise' : 'Le Tourneur Fou'} gagne ! +${eur(e.gain)}` : `😩 ${e.w ? 'Kévin la Fraise' : 'Le Tourneur Fou'} gagne. Mise perdue.`); modal && modal.querySelectorAll('[data-v6="fbet"]').forEach(b => (b.disabled = false)); } return true;
    }
    return false;
  }
  let scr = null;
  function screen(sec, txt, bg) {
    if (!scr) { scr = document.createElement('div'); scr.className = 'v6screen'; document.body.appendChild(scr); }
    scr.style.background = bg; scr.textContent = txt; scr.classList.add('on'); clearTimeout(scr._t); scr._t = setTimeout(() => scr.classList.remove('on'), sec * 1000);
  }

  /* ---------- Jauges faim / fatigue + ivresse ---------- */
  let needs = null;
  V6.frame = () => {
    const P = me(); if (!P) return;
    if (!needs) { needs = document.createElement('div'); needs.id = 'needs'; needs.innerHTML = '<span title="Faim">🍔<i><b id="nfood"></b></i></span><span title="Fatigue">💤<i><b id="nsleep"></b></i></span>'; const h = document.getElementById('hpbox'); if (h && h.parentNode) h.parentNode.insertBefore(needs, h.nextSibling); }
    const f = P.food === undefined ? 100 : P.food, sl = P.sleep === undefined ? 100 : P.sleep, fe = $('nfood'), se = $('nsleep');
    if (fe) { fe.style.width = f + '%'; fe.style.background = f < 25 ? '#e74c3c' : '#f39c12'; } if (se) { se.style.width = sl + '%'; se.style.background = sl < 25 ? '#e74c3c' : '#74b9ff'; }
    needs.classList.toggle('low', f < 25 || sl < 25);
    if (V6.drunk && performance.now() < V6.drunk && ML.camera) { const t = performance.now() / 1000; ML.camera.rotation.z += Math.sin(t * 1.3) * 0.05; ML.camera.position.y += Math.sin(t * 2.1) * 0.05; }
  };

  /* ---------- Panneau ADMIN (F9, compte admin, hôte) ---------- */
  document.addEventListener('keydown', e => {
    if (e.code !== 'F9' || !G().on) return; e.preventDefault();
    if (!ML.Account.admin) return ML.HUD.notify('🛠 Le mode admin est réservé aux comptes administrateurs (ADMIN_USERS sur le serveur).', 'warn');
    if (!G().isHost) return ML.HUD.notify('🛠 Le mode admin ne marche que dans TA partie (solo, ou si tu es l\'hôte).', 'warn');
    if (!(S().admin && S().admin.pid === G().me)) ML.Sim.K.v6Admin(G().me);
    adminPanel();
  });
  function adminPanel() {
    const b = (w, k, t, n) => `<button data-v6="adm" data-w="${w}" data-k="${k || ''}" data-n="${n || ''}">${t}</button>`;
    const evs = [['audit', '🔍 Audit'], ['coupure', '⚡ Coupure'], ['sabotage', '🕶 Saboteur'], ['panne', '💥 Grosse panne'], ['johan', '🦹 Johan Bois'], ['bleuenn', '💣 Lean Manufacturing'], ['herve', '📝 Hervé'], ['fred', '💼 Fred'], ['mathieu', '🗣 Mathieu'], ['squat', '🛋 Squatteurs'], ['dennis', '👦 Dennis'], ['raid', '🚔 Contrôle police'], ['racket', '🕶 Racketteur'], ['payeur', '💸 Mauvais payeur (prochaine livraison)'], ['quest', '🙋 Service (quête)'], ['faim', '🍔 Faim (test)']];
    open('🛠 Mode ADMIN — tests', `<div class="v6adm"><h4>💰 Argent</h4>${b('inf', '', '♾ Argent illimité ON/OFF')}${b('money', '', '+1 000 €', 1000)}${b('money', '', '+10 000 €', 10000)}
      <h4>📥 Commandes</h4>${b('order', 'plain', 'Simple')}${b('order', 'fonderie', '🔥 Fonderie')}${b('order', 'chaudro', '⚙️ Mécano-soudé')}${b('order', 'tth', '♨️ TTH')}${b('order', 'big', '🏗 Grosse pièce')}${b('order', 'black', '🕶 Au black')}
      <h4>🚨 Événements</h4>${evs.map(([k, t]) => b('event', k, t)).join('')}
      <h4>⏱ Temps & joueur</h4>${b('time', '', '+60 s', 60)}${b('time', '', '+3 min', 180)}${b('end', '', '🌙 Fin de journée')}${b('heal', '', '❤ Soins + repas')}${b('brep', '', '🕶 Réputation black +20', 20)}
      <h4>🎒 Objets</h4>${['grande_cle', 'batte_bb', 'sac_poubelle', 'hotdog', 'cle', 'extincteur', 'meuleuse'].map(k => b('give', k, ML.Items.TYPES[k].icon + ' ' + ML.Items.TYPES[k].name)).join('')}</div>`);
  }
  V6.on.adm = bt => { I('adm', { what: bt.dataset.w, k: bt.dataset.k, n: +bt.dataset.n || undefined }); ML.Sfx.play('bip'); };

  /* ---------- Branchement (après rules.js et game.js) ---------- */
  V6.init = () => {
    const R = ML.Rules, l0 = R.label, u0 = R.use; if (R._v6) return; R._v6 = true;
    R.label = id => { const r = label(id); return r !== undefined ? r : l0(id); };
    R.use = id => { if (use(id)) return; return u0(id); };
    const Gm = ML.Game, e0 = Gm.event; Gm.event = e => { if (event(e)) return; e0(e); };
    const h0 = ML.HUD.update; ML.HUD.update = dt => { h0(dt); if (Gm.on) V6.frame(); };
  };
  V6.init();
})();
