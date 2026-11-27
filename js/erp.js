/* =====================================================================
   erp.js — Le PC DE GESTION de l'atelier (côté joueur) : une fenêtre à
   onglets qui lit l'état de l'hôte (G.S) et envoie des intentions
   { a: 'erp', op, ... } :
   - Commandes : accepter / refuser les demandes, prévoir la machine,
     commander un brut de fonderie / chaudronnerie, suivre l'avancement ;
   - Atelier : catalogue (machines, agrandissement, fenwick, améliorations) ;
   - Fournisseurs : bruts et outils livrés par camion (délai) ;
   - Personnel : embaucher opérateurs, apprentis, cariste et livreur IA ;
   - Bilan : argent du jour, réputation, objectif de la campagne.
   ===================================================================== */
(function () {
  const E = ML.ERP = { tab: null, cart: {}, menu: false };
  const U = ML.U, $ = id => document.getElementById(id);
  const eur = n => `${Math.round(n).toLocaleString('fr-FR')} €`;
  const COMP = ML.COMPANIES, STEP_ICON = { fonderie: '🔥', chaudro: '⚙️', usinage: '🛠️', tth: '♨️', livraison: '🚚' };
  /* V5.3 : LebecOS — un vrai bureau d'ordinateur : icônes d'applications, fenêtre, barre des tâches, menu Démarrer */
  const APPS = [
    ['cmd', '📥', 'Commandes', 'Accepte les demandes des clients, suis tes commandes, commande les bruts de fonderie et de mécano-soudé.'],
    ['sup', '🛒', 'Fournisseurs', 'Barres de matière et outils coupants, livrés par camion à la réception.'],
    ['shop', '🏭', 'Boutique Atelier', 'Machines, agrandissement, fenwick, poste de préparation, confort, abonnements.'],
    ['rh', '👷', 'Personnel', 'Embauche des opérateurs pour les machines, des apprentis, un cariste, un livreur.'],
    ['bil', '📊', 'Bilan', 'L\'argent de la journée, la réputation, l\'objectif.'],
    ['his', '🧾', 'Historique', 'Qui a dépensé quoi : amendes, achats, investissements.'],
    ['help', '💡', 'Astuces', 'Le guide de l\'atelier : comment tout marche, et quoi faire quand ça part en vrille.']
  ];
  const TABS = APPS.map(a => [a[0], a[1] + ' ' + a[2]]);

  E.isOpen = () => ML.ui.modal === 'erp';
  E.open = tab => {
    if (ML.Dialogue.open) ML.Dialogue.forceClose();
    E.tab = tab || null; E.menu = false;
    ML.ui.modal = 'erp'; ML.Input.unlock(); ML.HUD.showPause(false);
    $('erp').classList.remove('hidden'); E._html = null; E.render(true);
    ML.Sfx.play('bip');
  };
  E.close = () => { $('erp').classList.add('hidden'); if (ML.ui.modal === 'erp') { ML.ui.modal = null; if (ML.Game.on && !ML.Game.ended) ML.Input.lock(); } };
  E.init = () => {
    const el = $('erp');
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
      const a = b.dataset.act, G = ML.Game;
      if (a === 'tab') { E.tab = b.dataset.t; E.menu = false; E._html = null; E.render(true); ML.Sfx.play('bip'); return; }
      if (a === 'desk') { E.tab = null; E.menu = false; E.render(true); ML.Sfx.play('bip'); return; }
      if (a === 'menu') { E.menu = !E.menu; E.render(true); return; }
      if (a === 'off') return E.close();
      if (a === 'trash') { ML.HUD.notify('🗑 Corbeille vide : Lebec recycle tout, même les vieux devis.', 'info'); return; }
      if (a === 'hfilter') { E.hf = b.dataset.k; E.render(true); return; }
      if (a === 'close') return E.close();
      if (a === 'arexis') { E.close(); ML.Mini.run('arexis', {}, r => { if (r === 'ok') G.intent({ a: 'use', id: 'pc', mg: 'ok' }); }); return; }
      if (a === 'part') { G.intent({ a: 'part', id: b.dataset.id, ok: +b.dataset.ok }); ML.Sfx.play('bip'); return; }
      // panier (côté joueur) : plus, moins, supprimer, vider, tout commander
      if (['cplus', 'cminus', 'cdel', 'cclear', 'corder'].includes(a)) {
        const k = b.dataset.k, C = E.cart, tot = () => Object.values(C).reduce((x, y) => x + y, 0);
        if (a === 'cplus' && tot() < ML.CART_MAX) C[k] = (C[k] || 0) + 1;
        if (a === 'cminus' && C[k]) { C[k]--; if (!C[k]) delete C[k]; }
        if (a === 'cdel') delete C[k];
        if (a === 'cclear') E.cart = {};
        if (a === 'corder' && tot()) { G.intent({ a: 'erp', op: 'order', cart: Object.assign({}, C) }); E.cart = {}; ML.Sfx.play('cash'); }
        ML.Sfx.play('bip'); E.render(true); return;
      }
      const m = { a: 'erp', op: a };
      for (const k of ['id', 'mid', 'k']) if (b.dataset[k] !== undefined) m[k] = b.dataset[k];
      if (b.dataset.early) m.early = 1;                                    // V5.2 : déblocage anticipé (plus cher)
      if (a === 'supply') { const q = el.querySelector(`select[data-q="${b.dataset.k}"]`); m.n = q ? +q.value : 1; }
      G.intent(m); ML.Sfx.play('bip');
      setTimeout(() => E.render(true), 150);
    });
    el.addEventListener('pointerdown', () => { E.down = true; }); window.addEventListener('pointerup', () => { E.down = false; });
    setInterval(() => { if (E.isOpen()) { if (!E.down) E.render(); E.tick(); } }, 400);
  };
  /** Chronos et pourcentages mis à jour sur place (sans reconstruire la fenêtre : les boutons restent cliquables) */
  const T = end => `<span class="dyn" data-k="t" data-v="${end}"></span>`, PC = mid => `<span class="dyn" data-k="p" data-v="${mid}"></span>`;
  E.tick = () => {
    const S = ML.Game.S; if (!S) return;
    for (const sp of document.querySelectorAll('#erp .dyn')) {
      const v = sp.dataset.v; let txt = '';
      if (sp.dataset.k === 'c') { const mins = Math.round(ML.CFG.DAY_START + Math.min(S.rt, ML.CFG.SHIFT_SEC) * (ML.CFG.DAY_END - ML.CFG.DAY_START) / ML.CFG.SHIFT_SEC); txt = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; }
      else if (sp.dataset.k === 't') txt = `${Math.max(0, Math.ceil(+v - S.rt))} s`;
      else { const M = S.machines[v]; txt = M && M.job && M.job.tool ? `${Math.floor(100 * M.job.prog / M.job.total)} %` : ''; }
      if (sp.textContent !== txt) sp.textContent = txt;
    }
  };

  /* ---------- Rendu ---------- */
  /** Ce qu'il y a à faire maintenant (pense-bête du bureau) */
  function todo(S) {
    const L = [], props = S.props.length + S.parts.filter(p => p.st === 'wait').length;
    if (props) L.push(['cmd', `📥 ${props} demande${props > 1 ? 's' : ''} de client à accepter`]);
    for (const o of S.orders) if ((o.src === 'fonderie' || o.src === 'chaudro') && o.steps[o.si] === o.src && !o.q) L.push(['cmd', `${o.src === 'fonderie' ? '🔥' : '⚙️'} #${o.id} : commander le brut ${o.src === 'fonderie' ? 'de fonderie' : 'mécano-soudé'}`]);
    for (const o of S.orders) if (o.size === 'l') { const miss = ['fenwick', 'camion'].filter(v => !S.owned.includes(v)); if (miss.length) { L.push([miss.includes('fenwick') ? 'shop' : 'cmd', `🏗 Grosse pièce #${o.id} : il manque ${miss.map(v => v === 'fenwick' ? 'le fenwick (Boutique)' : 'le camion (Garage Pasquier)').join(' et ')}`]); break; } }
    for (const id of ML.MACHINE_ORDER) if (S.machines[id] && !S.machines[id].op) { L.push(['rh', `👷 ${id} n'a pas d'opérateur`]); break; }
    const need = {}; for (const o of S.orders) if (o.steps[o.si] === 'usinage' && !o.src && !o.m) { need[o.mat] = (need[o.mat] || 0) + 1; need[o.tool] = (need[o.tool] || 0) + 1; }
    for (const k in need) if ((S.stock[k] || 0) < need[k]) { L.push(['sup', `🛒 Plus assez de ${(ML.MATERIALS[k] || ML.TOOLS[k]).label.toLowerCase()} en stock`]); break; }
    if (S.saeBon) L.push(['shop', `🎓 Bon de SAE : −${S.saeBon} % sur une machine`]);
    if (S.evs && S.evs.fred) L.push(['arexis', '💼 Fred attend : remplir ARÉXIS']);
    return L;
  }
  E.render = force => {
    const G = ML.Game, S = G.S; if (!S) return;
    const nProps = S.props.length + S.parts.filter(p => p.st === 'wait').length, app = APPS.find(a => a[0] === E.tab);
    const clock = '<span class="dyn" data-k="c" data-v="0"></span>';
    const icons = APPS.map(([k, ic, n]) => `<button class="os-ico ${E.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}"><i>${ic}</i><span>${n}</span>${k === 'cmd' && nProps ? `<b class="badge">${nProps}</b>` : ''}</button>`).join('') +
      (S.evs && S.evs.fred ? '<button class="os-ico hot" data-act="arexis"><i>💼</i><span>ARÉXIS</span><b class="badge">!</b></button>' : '') +
      '<button class="os-ico" data-act="trash"><i>🗑</i><span>Corbeille</span></button>';
    const T2 = todo(S);
    const widgets = `<div class="os-note"><div class="os-nh">📌 À faire maintenant</div>${T2.length ? T2.map(([k, t]) => `<button data-act="${k === 'arexis' ? 'arexis' : 'tab'}" data-t="${k}">${U.esc(t)}</button>`).join('') : '<div class="os-ok">✅ Rien d\'urgent. Bon boulot !</div>'}</div>
      <div class="os-info"><b>${U.esc(S.co.name || 'Mécanique Lebec')}</b><br>📅 Jour ${S.co.day || S.day} · ${clock}<br>⭐ Réputation ${S.rep}/100<br><span class="${S.money < 0 ? 'red' : 'ok'}">💶 ${eur(S.money)}</span>${S.co.code ? `<br><span class="dim small">code ${S.co.code}</span>` : ''}</div>
      ${S.black ? '<div class="os-black">🛍 BLACK FRIDAY<br><span>tout est moins cher aujourd\'hui</span></div>' : ''}
      <div class="os-hint">💡 Clique une icône pour ouvrir une application. <b>Échap</b> : éteindre le PC.</div>`;
    const win = app ? `<div class="os-win"><div class="os-title"><span class="os-tn">${app[1]} ${app[2]}</span><span class="os-td">${U.esc(app[3])}</span><button class="os-x" data-act="desk" title="Fermer la fenêtre">✕</button></div>
      ${S.evs && S.evs.fred ? '<div class="erp-alert">💼 Fred Castells attend que quelqu\'un remplisse ARÉXIS… <button data-act="arexis">Remplir ARÉXIS</button></div>' : ''}
      <div class="erp-body">${({ cmd: tabCmd, shop: tabShop, sup: tabSup, rh: tabRh, bil: tabBil, his: tabHis, help: tabHelp })[app[0]](S)}</div></div>` : '';
    const menu = E.menu ? `<div class="os-menu"><div class="os-mh">🔧 LebecOS 95</div>${APPS.map(([k, ic, n]) => `<button data-act="tab" data-t="${k}">${ic} ${n}</button>`).join('')}<hr><button data-act="off">⏻ Éteindre le PC</button></div>` : '';
    const html = `<div class="os"><div class="os-screen"><div class="os-desk"><div class="os-logo">LEBEC<small>usinage · depuis 1987</small></div><div class="os-icons">${icons}</div><div class="os-side">${widgets}</div>${win}${menu}</div>
      <div class="os-bar"><button class="os-start ${E.menu ? 'on' : ''}" data-act="menu">🔧 Démarrer</button>${app ? `<button class="os-task on" data-act="desk">${app[1]} ${app[2]}</button>` : ''}
        <span class="os-tray"><span class="${S.money < 0 ? 'red' : ''}">💶 ${eur(S.money)}</span><span>⭐ ${S.rep}</span><span>📅 J${S.co.day || S.day}</span><span class="os-clock">${clock}</span><button class="os-off" data-act="off" title="Éteindre (Échap)">⏻</button></span></div></div>
      <div class="os-bezel"><span>LEBEC</span><i class="led"></i></div></div>`;
    if (!force && html === E._html) return;
    const sc = $('erp-card').querySelector('.erp-body'), top = sc ? sc.scrollTop : 0;
    $('erp-card').innerHTML = html; E._html = html;
    const sc2 = $('erp-card').querySelector('.erp-body'); if (sc2 && E._scTab === E.tab) sc2.scrollTop = top; E._scTab = E.tab;
    E.tick();
  };
  const chips = o => `<span class="chip" style="background:${ML.MATERIALS[o.mat].css};color:#111">${ML.MATERIALS[o.mat].label}</span><span class="chip">${ML.MTYPE[o.mtype]}</span><span class="chip" style="background:${ML.TOOLS[o.tool].css};color:#111">${ML.TOOLS[o.tool].label}</span>${o.size === 'l' ? '<span class="chip big">GROSSE (fenwick + camion)</span>' : o.size === 's' ? '<span class="chip">petite</span>' : ''}`;
  const steps = (o, si) => o.steps.map((s, i) => `<span class="${si !== undefined && i < si ? 'done' : si === i ? 'cur' : ''}">${STEP_ICON[s]}</span>`).join('<i>›</i>');
  const who = o => (o.client === 'part' ? `🙋 ${ML.PEOPLE[o.who].name} (comptoir)` : COMP[o.client].name);

  function tabCmd(S) {
    let h = '<h3>📥 Demandes des clients</h3>';
    const waiting = S.parts.filter(p => p.st === 'wait');
    if (!S.props.length && !waiting.length) h += `<p class="dim">Aucune demande pour l'instant.${S.up.erp_auto ? ' (ERP+ : elles sont acceptées automatiquement.)' : ' Elles arrivent ici : accepte-les avant qu\'elles expirent !'}</p>`;
    for (const p of waiting) h += `<div class="erp-row part"><div><b>🙋 ${U.esc(ML.PEOPLE[p.id].name)}</b> attend au COMPTOIR : <b>${U.esc(p.part)}</b> ${chips(p)} — à faire en ${Math.round(p.dur)} s</div>
      <div class="erp-act"><b class="price">${eur(p.price)}</b><span class="dim">part dans ${T(p.exp)}</span><button data-act="part" data-id="${p.id}" data-ok="1">Accepter</button><button class="sec" data-act="part" data-id="${p.id}" data-ok="0">Refuser</button></div></div>`;
    for (const p of S.props) h += `<div class="erp-row"><div><b>${U.esc(COMP[p.client].name)}</b> : ${U.esc(p.part)} ${chips(p)} <span class="steps">${steps(p)}</span> — délai ${Math.round(p.dur)} s</div>
      <div class="erp-act"><b class="price">${eur(p.price)}</b><span class="dim">expire dans ${T(p.exp)}</span><button data-act="accept" data-id="${p.id}">Accepter</button><button class="sec" data-act="refuse" data-id="${p.id}">Refuser</button></div></div>`;
    h += `<h3>📋 Commandes acceptées (${S.orders.length})</h3>`;
    if (!S.orders.length) h += '<p class="dim">Aucune commande en cours.</p>';
    const mids = ML.MACHINE_ORDER.filter(id => S.machines[id]);
    for (const o of S.orders.slice().sort((a, b) => a.dl - b.dl)) {
      const st = o.steps[o.si], urgent = (o.dl - S.rt) / o.dur < 0.25;
      let now = '';
      if (st === 'usinage') {
        const M = o.m && S.machines[o.m];
        now = M && M.job ? `en cours sur <b>${o.m}</b> : ${M.job.tool ? PC(o.m) : 'attend ' + ML.TOOLS[M.job.need].label}` : o.src ? 'brut en réception → à mettre sur une machine' : `brut ${ML.MATERIALS[o.mat].label} → ${ML.MTYPE[o.mtype]}`;
        if (!o.m) now += ` · machine prévue : ${mids.filter(id => ML.MACHINES.find(m => m.id === id).type === o.mtype).map(id => `<button class="mini ${o.plan === id ? 'on' : ''}" data-act="plan" data-id="${o.id}" data-mid="${o.plan === id ? '' : id}">${id}</button>`).join('')}`;
      } else if (st === 'fonderie' || st === 'chaudro') {
        const d = S.deliv.find(x => x.oid === o.id);
        now = o.q ? (d ? `brut commandé : livraison dans ${T(d.eta)}` : `brut en cours chez ${COMP[st].name}…`) : `brut à commander : <button class="mini" data-act="subpc" data-id="${o.id}">Commander au PC (${ML.ECO.subPC[st]} €, livré ~2 min)</button> <span class="dim">ou en direct chez ${COMP[st].name} (${ML.ECO.sub[st]} €)</span>`;
      } else if (st === 'tth') now = o.q ? 'au four chez TTH Ouest…' : `caisse → TTH Ouest (${ML.ECO.sub.tth} €)`;
      else now = o.client === 'part' ? 'à rapporter au COMPTOIR' : `à livrer chez ${COMP[o.client].name}`;
      h += `<div class="erp-row ${urgent ? 'urgent' : ''}"><div><b>#${o.id}</b> ${U.esc(who(o))} : ${U.esc(o.part)} ${chips(o)} <span class="steps">${steps(o, o.si)}</span><br><span class="small">${now}</span></div>
        <div class="erp-act"><b class="price">${eur(o.price)}</b><span class="${urgent ? 'red' : 'dim'}">${T(o.dl)}</span></div></div>`;
    }
    h += '<h3>🏭 Machines</h3><div class="erp-grid">' + mids.map(id => {
      const M = S.machines[id], op = M.op ? ML.PEOPLE[M.op].name : null;
      const st = { idle: 'libre', wait: 'attend un outil', run: 'usine', stop: 'opérateur absent', panne: 'EN PANNE', usure: 'outil usé', off: 'plus de courant', bac: 'bac à copeaux !', noop: 'sans opérateur' }[M.status] || M.status;
      return `<div class="erp-mach ${M.status}"><b>${id}</b> ${ML.MTYPE[ML.MACHINES.find(m => m.id === id).type]}<br>${op ? '👷 ' + U.esc(op) : '<span class="red">pas d\'opérateur</span>'}<br>${st}${M.job ? ` · #${M.job.oid} ${PC(id)}` : M.plan ? ` · prévu #${M.plan}` : ''}</div>`;
    }).join('') + '</div>';
    return h;
  }

  /* V5.2 : prix du jour (Black Friday, bon de SAE) et déblocage anticipé — mêmes calculs que l'hôte (sim_eco.js) */
  const catPrice = (S, k) => { const it = ML.CATALOG[k]; let p = Math.round(it.price * (S.black ? ML.ECO.black.cat : 1)); if (it.mach && S.saeBon) p = Math.round(p * (1 - S.saeBon / 100)); return p; };
  const daysLeft = (S, it) => Math.max(0, (it.day || 0) - (S.co.day || S.day) - S.rt / ML.CFG.SHIFT_SEC);
  const earlyFee = (S, it) => Math.round(Math.max(ML.EARLY.min, ML.EARLY.perDay * daysLeft(S, it)) / 10) * 10;
  const leftTxt = rem => { const d = Math.floor(rem), h = Math.floor((rem - d) * 12); return `${d ? d + ' j ' : ''}${h ? h + ' h' : d ? '' : 'moins d\'1 h'}`; };
  const priceHtml = (S, k) => { const it = ML.CATALOG[k], p = catPrice(S, k); return p !== it.price ? `<span class="old">${eur(it.price)}</span>${eur(p)}` : eur(p); };
  function tabShop(S) {
    const cats = { machine: '🏭 Machines', atelier: '🏗 Atelier', equip: '🚜 Équipement', deco: '☕ Confort & déco (installé le lendemain)', abo: '🐦 Abonnements (payés chaque soir)' };
    let h = '<p class="dim">Les véhicules (scooter, Mégane, Ducato, camion plateau) s\'achètent au <b>Garage Pasquier</b>, en ville.</p>';
    if (S.black) h += `<div class="erp-black">🛍 BLACK FRIDAY : machines, atelier et équipements −${Math.round((1 - ML.ECO.black.cat) * 100)} % aujourd'hui seulement !</div>`;
    if (S.saeBon) h += `<div class="erp-sae">🎓 Bon de SAE : <b>−${S.saeBon} %</b> sur la prochaine machine achetée (déjà déduit des prix ci-dessous).</div>`;
    for (const cat in cats) {
      h += `<h3>${cats[cat]}</h3><div class="erp-grid">`;
      for (const k in ML.CATALOG) {
        const it = ML.CATALOG[k]; if (it.cat !== cat) continue;
        const own = it.mach ? !!S.machines[it.mach] : it.veh ? S.owned.includes(it.veh) : (S.up[k] || 0) >= (it.max || 1);
        const day = S.co.day || S.day, early = it.day && day < it.day, extWait = it.mach && ML.MACHINES.find(m => m.id === it.mach).ext && S.up.extension && !S.ext;
        const lock = (it.need && !S.up[it.need]) || early || extWait, lvl = it.max > 1 ? ` (${S.up[k] || 0}/${it.max})` : '';
        if (extWait) { h += `<div class="erp-item lockd"><b>${U.esc(it.name)}</b><span class="small dim">${U.esc(it.desc || '')}</span><span class="dim">🔒 l'extension se construit cette nuit</span></div>`; continue; }
        if (early) {                                                    // V5.2 : compte à rebours réel + déblocage anticipé
          const fee = earlyFee(S, it), tot = catPrice(S, k) + fee, needOk = !it.need || S.up[it.need];
          h += `<div class="erp-item lockd"><b>${U.esc(it.name)}</b><span class="small dim">${U.esc(it.desc || '')}</span><span class="dim">🔒 se débloque dans <b>${leftTxt(daysLeft(S, it))}</b> (jour ${it.day})</span>
            ${needOk ? `<button class="early" data-act="buy" data-k="${k}" data-early="1" ${S.money < tot ? 'disabled' : ''}>🔓 Débloquer maintenant : ${eur(tot)} <span class="small">(dont +${eur(fee)} d'avance)</span></button>` : `<span class="dim">il faut d'abord : ${U.esc(ML.CATALOG[it.need].name)}</span>`}</div>`;
          continue;
        }
        h += `<div class="erp-item ${own ? 'own' : ''}"><b>${U.esc(it.name)}${lvl}</b><span class="small dim">${U.esc(it.desc || '')}</span>
          ${own && it.daily ? `<span class="ok">✔ abonné (${it.daily} €/jour)</span><button class="sec" data-act="unsub" data-k="${k}">Résilier</button>` : own ? '<span class="ok">✔ acheté</span>' : lock ? `<span class="dim">🔒 il faut : ${U.esc(ML.CATALOG[it.need].name)}</span>` : `<button data-act="buy" data-k="${k}" ${S.money < catPrice(S, k) ? 'disabled' : ''}>Acheter ${priceHtml(S, k)}</button>`}</div>`;
      }
      h += '</div>';
    }
    return h;
  }

  function tabSup(S) {
    const sp = k => Math.round(ML.SUPPLY[k].price * (S.black ? ML.ECO.black.supply : 1));      // V5.2 : Black Friday
    const C = E.cart, units = Object.values(C).reduce((x, y) => x + y, 0), sub = Object.keys(C).reduce((x, k) => x + C[k] * sp(k), 0), total = units ? sub + ML.ECO.fee : 0;
    const label = k => (ML.MATERIALS[k] || ML.TOOLS[k]).label;
    let h = `<p class="dim small">Ajoute les produits au panier, puis commande tout d'un coup : un seul COLIS arrive en réception (${ML.ECO.supplierDelay[0] / 60} à ${ML.ECO.supplierDelay[1] / 60} min). Ouvre-le avec <b>R</b>, puis range les produits (E sur le rack ou l'armoire). Pressé ? Le MAGASINIER peut aller chercher directement chez Eliott et Coco, sans frais de port.</p><h3>🛒 Produits</h3><div class="erp-grid">`;
    for (const k in ML.SUPPLY) {
      const L = ML.SUPPLY[k], q = C[k] || 0;
      h += `<div class="erp-item prod"><b>${U.esc(L.name)}</b><span class="small dim">${COMP[L.from].name} · <b class="price">${S.black ? `<s>${L.price}</s> ` : ''}${sp(k)} €</b> l'unité · en stock : <b class="${S.stock[k] ? '' : 'red'}">${S.stock[k]}</b></span>
        <span class="qty"><button class="mini" data-act="cminus" data-k="${k}" ${q ? '' : 'disabled'}>−</button><b>${q}</b><button class="mini" data-act="cplus" data-k="${k}" ${units >= ML.CART_MAX ? 'disabled' : ''}>+</button><button class="mini del" data-act="cdel" data-k="${k}" ${q ? '' : 'disabled'} title="Supprimer">🗑</button></span></div>`;
    }
    h += `</div><h3>🧺 Panier (${units}/${ML.CART_MAX} articles)</h3>`;
    if (!units) h += '<p class="dim">Le panier est vide : clique sur « + » pour ajouter des produits.</p>';
    else {
      h += '<table class="erp-tab cart">' + Object.keys(C).map(k => `<tr><td>${U.esc(ML.SUPPLY[k].name)}</td><td><button class="mini" data-act="cminus" data-k="${k}">−</button> <b>${C[k]}</b> <button class="mini" data-act="cplus" data-k="${k}" ${units >= ML.CART_MAX ? 'disabled' : ''}>+</button> <button class="mini del" data-act="cdel" data-k="${k}">🗑</button></td><td>${eur(C[k] * sp(k))}</td></tr>`).join('') +
        `<tr><td class="dim">Frais de port</td><td></td><td class="dim">${eur(ML.ECO.fee)}</td></tr><tr><td><b>Total</b></td><td></td><td><b>${eur(total)}</b></td></tr></table>
        <div class="cart-btns"><button class="go" data-act="corder" ${S.money < total ? 'disabled' : ''}>📦 Commander tout (${eur(total)})</button><button class="sec" data-act="cclear">Vider le panier</button>${S.money < total ? ' <span class="red">Pas assez d\'argent en caisse.</span>' : ''}</div>`;
    }
    h += '<h3>🚚 Livraisons en route</h3>';
    h += S.deliv.length ? S.deliv.slice().sort((a, b) => a.eta - b.eta).map(d => `<div class="erp-row"><div>${U.esc(d.name)}${d.cart ? ` <span class="dim">: ${Object.keys(d.cart).map(k => d.cart[k] + ' × ' + label(k)).join(', ')}</span>` : ''}</div><div class="erp-act">arrive dans <b>${T(d.eta)}</b></div></div>`).join('') : '<p class="dim">Rien en route.</p>';
    return h;
  }

  function tabRh(S) {
    const ops = S.staff.filter(id => ML.PEOPLE[id].op), nM = Object.keys(S.machines).length;
    let h = `<p>👷 ${ops.length} opérateur${ops.length > 1 ? 's' : ''} pour ${nM} machine${nM > 1 ? 's' : ''}. ${ops.length < nM ? '<span class="red">Pas assez : un opérateur jongle entre plusieurs machines (et perd du temps à marcher).</span>' : ops.length > nM ? '<span class="red">Trop d\'opérateurs : certains n\'ont pas de machine (achète-en une !).</span>' : '<span class="ok">Un opérateur par machine.</span>'}</p>`;
    h += '<h3>Dans l\'équipe</h3>';
    const machOf = id => ML.MACHINE_ORDER.filter(m => S.machines[m] && S.machines[m].op === id);
    for (const id of S.staff) h += `<div class="erp-row"><div><b>${U.esc(ML.PEOPLE[id].name)}</b> <span class="dim">${U.esc(ML.PEOPLE[id].role)}</span> — ${U.esc(ML.STAFF[id].desc)}<br><span class="small">machine${machOf(id).length > 1 ? 's' : ''} : ${machOf(id).join(', ') || 'aucune'}</span></div><div class="erp-act">${ML.STAFF[id].pay} €/jour <button class="sec" data-act="fire" data-id="${id}">Licencier</button></div></div>`;
    for (const k in ML.AI_STAFF) if (S.ai[k]) { const A = ML.AI_STAFF[k]; h += `<div class="erp-row"><div><b>${U.esc(A.name)}</b> — ${U.esc(A.desc)}</div><div class="erp-act">${A.pay} €/jour <button class="sec" data-act="fire" data-id="ai:${k}">Licencier</button></div></div>`; }
    h += '<h3>Embaucher</h3><div class="erp-grid">';
    for (const id in ML.STAFF) if (!S.staff.includes(id)) {
      const St = ML.STAFF[id];
      h += `<div class="erp-item"><b>${U.esc(ML.PEOPLE[id].name)}</b><span class="small dim">${U.esc(ML.PEOPLE[id].role)} — ${U.esc(St.desc)}</span><span class="small">Salaire : ${St.pay} €/jour</span><button data-act="hire" data-id="${id}" ${S.money < St.hire ? 'disabled' : ''}>Embaucher (${St.hire} €)</button></div>`;
    }
    for (const k in ML.AI_STAFF) if (!S.ai[k]) {
      const A = ML.AI_STAFF[k];
      h += `<div class="erp-item"><b>${U.esc(A.name)}</b><span class="small dim">${U.esc(A.desc)}</span><span class="small">Salaire : ${A.pay} €/jour</span><button data-act="hire" data-id="ai:${k}" ${S.money < A.hire ? 'disabled' : ''}>Embaucher (${A.hire} €)</button></div>`;
    }
    return h + '</div><p class="dim small">Les salaires sont versés chaque soir, au bilan de la journée.</p>';
  }

  /** V5 : HISTORIQUE des dépenses — qui a dépensé quoi (amendes, achats…), et les jours précédents */
  /* V5.3 : l'application ASTUCES — le guide de l'atelier (tout ce qui n'est pas évident) */
  function tabHelp(S) {
    const sec = (ic, t, L, open) => `<details class="os-help" ${open ? 'open' : ''}><summary>${ic} ${t}</summary><ul>${L.map(x => `<li>${x}</li>`).join('')}</ul></details>`;
    const eco = ML.ECO, sp = eco.subPC || {}, sd = eco.sub || {};
    let h = '<p class="dim">Clique un titre pour le déplier. Les astuces marquées 🤫 sont des petits secrets d\'atelier.</p>';
    h += sec('📥', 'Une commande, du début à la fin', [
      'Ouvre <b>📥 Commandes</b> et <b>accepte</b> une demande (regarde le délai et la taille).',
      'Prends la <b>barre de matière</b> au rack (la couleur du ticket = la matière) et le bon <b>outil</b> au chariot.',
      'Pose la barre puis l\'outil dans une <b>machine libre</b> (E). L\'opérateur usine tout seul, ou toi si personne n\'est à son poste.',
      'Récupère la <b>caisse</b> usinée et pose-la en <b>EXPÉDITION</b> (zone verte à la porte).',
      'Charge la caisse dans un véhicule (E en visant la benne), suis le <b>GPS</b> jusqu\'au client et décharge chez lui.',
      '🤫 Les tickets s\'affichent au-dessus des caisses : l\'icône en couleur, c\'est l\'étape en cours.'
    ], true);
    h += sec('⚙️', 'Mécano-soudé et fonderie (les bruts spéciaux)', [
      'Certaines pièces ne partent pas d\'une barre mais d\'un <b>brut</b> : 🔥 fonderie (fonte) ou ⚙️ mécano-soudé (chaudronnerie).',
      `<b>Le plus simple :</b> dans 📥 Commandes, bouton <b>« Commander au PC »</b> (${eur(sp.fonderie || 90)} fonderie, ${eur(sp.chaudro || 100)} mécano-soudé). Le brut arrive tout seul à la <b>RÉCEPTION</b> de l'atelier en 2 minutes environ.`,
      `<b>Moins cher mais il faut y aller :</b> va voir le patron à la <b>Fonderie Boulard</b> ou à la <b>Chaudronnerie Babinsky</b> (carte M), paie-le (${eur(sd.fonderie || 60)} / ${eur(sd.chaudro || 70)}), attends un peu et prends le brut sur <b>son quai</b>.`,
      'Ensuite, le brut se met dans une machine comme une barre (pas besoin de matière du rack).',
      '🤫 Le livreur IA (Personnel) peut faire les allers-retours à ta place.'
    ]);
    h += sec('♨️', 'Traitement thermique (TTH)', [
      'Si le ticket montre ♨️ après l\'usinage : la caisse doit passer chez <b>TTH Ouest</b> (M. Maurseau) avant d\'être livrée.',
      `Apporte la caisse là-bas, E sur Maurseau (${eur(sd.tth || 45)}), attends ${ML.CFG.SUB_SEC || 16} s et reprends-la sur place.`,
      'Puis retour à l\'expédition ou directement chez le client.'
    ]);
    h += sec('🏗', 'Grosses pièces, fenwick et camion', [
      'Une commande marquée <b>GROSSE</b> sort en <b>palette</b> au <b>QUAI GROS COLIS</b> : elle ne tient pas dans les bras.',
      `Il faut le <b>fenwick</b> (🏭 Boutique, ${eur((ML.CATALOG.fenwick || {}).price || 650)}) : approche les fourches, <b>R</b> pour lever / poser.`,
      'Puis le <b>camion</b> (Garage Pasquier) : pose la palette dans la benne avec le fenwick, et <b>R</b> à l\'arrivée pour décharger.',
      'Les grosses pièces payent beaucoup plus : à plusieurs, c\'est le meilleur investissement.'
    ]);
    h += sec('📏', 'Contrôle au marbre et poste de préparation', [
      'Le <b>MARBRE</b> sert aux audits (Jacky) et à la SAE : pose une caisse dessus (E) et réponds à la question.',
      'Le <b>poste de préparation</b> (Boutique) prépare tout seul des <b>kits</b> (brut + bon outil) pour les commandes acceptées : prends le kit et donne-le à la machine, sans passer par le rack.'
    ]);
    h += sec('👷', 'Le personnel', [
      'Un <b>opérateur</b> par machine : sans lui, c\'est toi qui dois rester devant.',
      'Les <b>apprentis</b> coûtent peu mais sont lents (ils progressent). 🤫 Brieuc a la flemme : une claque le relance.',
      'Tony le <b>cariste</b> charge les palettes du quai dans le camion, Jojo le <b>livreur</b> fait les tournées (et le TTH).',
      'Les salaires tombent <b>le soir</b> : regarde le 📊 Bilan avant d\'embaucher.'
    ]);
    const ev = Object.keys(ML.EVTIPS).map(k => { const [t, L] = ML.EVTIPS[k]; return `<b>${t}</b> : ${L.join(' ')}`; });
    h += sec('🚨', 'Les événements (quoi faire quand ça part en vrille)', ev);
    h += sec('🙋', 'Quêtes, SAE et visiteurs', [
      'Quand quelqu\'un demande un service, parle-lui (E). Si tu acceptes, un <b>repère</b> apparaît sur la carte (M) et un bandeau en haut de l\'écran donne la distance.',
      'Va au repère et appuie sur <b>E</b> dessus (ou apporte l\'objet demandé), puis reviens voir la personne.',
      'Les visiteurs pénibles (Johan Bois, Lean Manufacturing) peuvent être chassés à la claque : <b>Lebec ne t\'en voudra pas</b>.',
      'La <b>soufflette</b> nettoie les taches dans l\'atelier <b>et devant la porte</b>.'
    ]);
    h += sec('🚗', 'Véhicules, essence, radars, gendarmes', [
      'E pour monter, <b>V</b> change de caméra, <b>H</b> klaxonne, <b>F</b> à la station pour faire le plein.',
      'Au-delà de 60 km/h en ville, les <b>radars</b> flashent (amende). Le Pass Radar ou la meuleuse 🤫 règlent le problème…',
      'Taper un piéton ou fuir les gendarmes coûte cher. Les véhicules n\'entrent pas dans l\'atelier.',
      'Le <b>scooter</b> est le moins cher pour livrer de petites caisses.'
    ]);
    h += sec('💶', 'L\'argent', [
      'Livrer <b>à l\'heure</b> fait monter la réputation, et avec elle les prix des commandes.',
      'Le <b>Black Friday</b> (certains jours) fait baisser tous les prix : c\'est le moment d\'acheter une machine.',
      'Une zone ou une machine pas encore débloquée peut s\'acheter <b>en avance</b>, plus cher.',
      'Sous ' + eur(eco.bankrupt) + ' le soir : faillite. Garde toujours de quoi payer les salaires.'
    ]);
    h += sec('⌨️', 'Les touches', [
      '<b>ZQSD / WASD</b> se déplacer · <b>Maj</b> courir · <b>Espace</b> sauter · <b>E</b> interagir · <b>G</b> lâcher · <b>R</b> ouvrir un colis / fourches / décharger',
      '<b>Clic gauche</b> utiliser l\'objet en main (claque, soufflette, extincteur) · <b>Clic droit</b> lancer',
      '<b>1 2 3</b> ou molette : emplacements · <b>4 à 9</b> émotes · <b>T</b> ping · <b>M</b> carte · <b>Tab</b> aide · <b>K</b> son'
    ]);
    return h;
  }

  function tabHis(S) {
    const G = ML.Game, L = (G.ledger || []).slice().reverse(), f = E.hf || 'all';
    const players = Object.keys(S.pl).map(pid => S.pl[pid]);
    const cats = { amende: '🚨 Amende', achat: '🛒 Achat', invest: '🏗 Invest.', ca: '💶 Livraison', bonus: '🎁 Prime', salaires: '👷 Salaires', abos: '🐦 Abonnement' };
    const sp = Object.values(S.spent || {});
    let h = '<h3>👤 Dépenses par joueur aujourd\'hui</h3>';
    h += sp.length ? `<table class="erp-tab"><tr><th></th><th>Amendes</th><th>Achats</th><th>Investissements</th><th>Total</th></tr>${sp.map(v => `<tr><td><b>${U.esc(v.name)}</b></td><td class="${v.amende ? 'red' : 'dim'}">${eur(v.amende)}</td><td>${eur(v.achat)}</td><td>${eur(v.invest)}</td><td><b>${eur(v.amende + v.achat + v.invest + v.autre)}</b></td></tr>`).join('')}</table>` : '<p class="dim">Personne n\'a encore dépensé un centime aujourd\'hui.</p>';
    h += `<h3>🧾 Le détail (le plus récent en haut)</h3><div class="erp-filter">${[['all', 'Tout'], ['neg', 'Dépenses'], ['amende', 'Amendes']].concat(players.map(P => ['p' + P.idx, P.name])).map(([k, n]) => `<button class="mini ${f === k ? 'on' : ''}" data-act="hfilter" data-k="${k}">${U.esc(n)}</button>`).join('')}</div>`;
    const rows = L.filter(r => f === 'all' || (f === 'neg' && r[4] < 0) || (f === 'amende' && r[2] === 'amende') || (f[0] === 'p' && r[5] === +f.slice(1))).slice(0, 120);
    h += rows.length ? `<table class="erp-led">${rows.map(([t, who, cat, what, amt, idx]) => `<tr><td class="dim">${t}</td><td class="who">${idx >= 0 ? `<i style="background:${ML.COLORS[idx % 6].css}"></i>` : ''}${U.esc(who)}</td><td>${cats[cat] || U.esc(cat)}</td><td>${U.esc(what)}</td><td class="amt ${amt < 0 ? 'neg' : 'pos'}">${amt > 0 ? '+' : ''}${eur(amt)}</td></tr>`).join('')}</table>` : '<p class="dim">Rien pour l\'instant (le détail commence quand tu arrives dans la partie).</p>';
    if (S.hist && S.hist.length) {
      h += '<h3>📅 Jours précédents</h3><table class="erp-tab"><tr><th>Jour</th><th>Joueur</th><th>Amendes</th><th>Achats</th><th>Invest.</th></tr>';
      for (const d of S.hist.slice().reverse()) for (const [n, am, ac, inv] of d.p) h += `<tr><td class="dim">jour ${d.d}</td><td>${U.esc(n)}</td><td class="${am ? 'red' : 'dim'}">${eur(am)}</td><td>${eur(ac)}</td><td>${eur(inv)}</td></tr>`;
      h += '</table>';
    }
    return h;
  }

  function tabBil(S) {
    const T = S.today, sal = S.staff.reduce((a, id) => a + ML.STAFF[id].pay, 0) + Object.keys(ML.AI_STAFF).reduce((a, k) => a + (S.ai[k] ? ML.AI_STAFF[k].pay : 0), 0);
    const abo = Object.keys(ML.CATALOG).reduce((a, k) => a + (ML.CATALOG[k].daily && S.up[k] ? ML.CATALOG[k].daily : 0), 0);
    const profit = T.ca + T.bonus - T.achat - T.amende - sal - abo;
    const row = (l, v, c) => `<tr><td>${l}</td><td class="${c || ''}">${v}</td></tr>`;
    let h = `<h3>📊 Aujourd'hui</h3><table class="erp-tab">${row('Chiffre d\'affaires (livraisons)', '+' + eur(T.ca), 'ok')}${row('Primes (audit, visiteurs…)', '+' + eur(T.bonus), 'ok')}
      ${row('Achats (matière, outils, sous-traitance)', '−' + eur(T.achat), 'red')}${row('Amendes et casse', '−' + eur(T.amende), 'red')}${row('Salaires à verser ce soir', '−' + eur(sal), 'red')}${abo ? row('Abonnements (ce soir)', '−' + eur(abo), 'red') : ''}
      ${row('<b>Bénéfice prévu</b>', `<b>${eur(profit)}</b>`, profit >= 0 ? 'ok' : 'red')}${S.money - sal - abo < ML.ECO.bankrupt + 500 ? row('<b>⚠ Faillite</b>', `sous ${eur(ML.ECO.bankrupt)} ce soir = FAILLITE`, 'red') : ''}${row('Investissements (machines, embauches, véhicules)', '−' + eur(T.invest), 'dim')}${row('<b>En caisse</b>', `<b>${eur(S.money)}</b>`)}</table>`;
    h += `<h3>⭐ Réputation : ${S.rep}/100</h3><div class="bar"><i style="width:${S.rep}%"></i></div><p class="dim small">Livrer à l'heure la fait monter (et les prix avec), rater ou laisser expirer une demande la fait baisser. Novatics ouvre à 55, Ublo à 70.</p>`;
    if (S.campaign) h += `<h3>🎯 Campagne</h3><p>${ML.Company.goal({ won: S.co.won, insp: S.co.insp, mach: Object.keys(S.machines), rep: S.rep, day: S.co.day })}</p>${S.co.code ? `<p class="dim">Code de sauvegarde : <b class="code">${S.co.code}</b> — n'importe qui avec ce code peut reprendre l'atelier (sauvegarde auto toutes les minutes).</p>` : ''}`;
    else h += '<p class="dim">Journée libre : rien n\'est sauvegardé. Lance une CAMPAGNE pour faire grandir ton atelier jour après jour.</p>';
    return h;
  }
})();
