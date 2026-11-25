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
  const E = ML.ERP = { tab: 'cmd', cart: {} };
  const U = ML.U, $ = id => document.getElementById(id);
  const eur = n => `${Math.round(n).toLocaleString('fr-FR')} €`;
  const COMP = ML.COMPANIES, STEP_ICON = { fonderie: '🔥', chaudro: '⚙️', usinage: '🛠️', tth: '♨️', livraison: '🚚' };
  const TABS = [['cmd', '📋 Commandes'], ['shop', '🏭 Atelier'], ['sup', '🛒 Fournisseurs'], ['rh', '👷 Personnel'], ['bil', '📊 Bilan']];

  E.isOpen = () => ML.ui.modal === 'erp';
  E.open = tab => {
    if (ML.Dialogue.open) ML.Dialogue.forceClose();
    if (tab) E.tab = tab;
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
      if (a === 'tab') { E.tab = b.dataset.t; E._html = null; E.render(true); return; }
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
      if (sp.dataset.k === 't') txt = `${Math.max(0, Math.ceil(+v - S.rt))} s`;
      else { const M = S.machines[v]; txt = M && M.job && M.job.tool ? `${Math.floor(100 * M.job.prog / M.job.total)} %` : ''; }
      if (sp.textContent !== txt) sp.textContent = txt;
    }
  };

  /* ---------- Rendu ---------- */
  E.render = force => {
    const G = ML.Game, S = G.S; if (!S) return;
    const head = `<div class="erp-top"><div><b>💻 PC de gestion</b> — ${U.esc(S.co.name || 'Mécanique Lebec')}${S.co.code ? ` <span class="dim">(code ${S.co.code})</span>` : ''}</div>
      <div class="erp-kpi"><span class="money ${S.money < 0 ? 'neg' : ''}">💶 ${eur(S.money)}</span><span>⭐ ${S.rep}/100</span><span>📅 jour ${S.co.day}</span><button class="sec tiny" data-act="close">Fermer (Échap)</button></div></div>
      ${S.evs && S.evs.fred ? '<div class="erp-alert">💼 Fred Castells attend que quelqu\'un remplisse ARÉXIS… <button data-act="arexis">Remplir ARÉXIS</button></div>' : ''}
      <div class="erp-tabs">${TABS.map(([k, n]) => `<button class="${E.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${n}${k === 'cmd' && (S.props.length + S.parts.filter(p => p.st === 'wait').length) ? ` <i class="badge">${S.props.length + S.parts.filter(p => p.st === 'wait').length}</i>` : ''}</button>`).join('')}</div>`;
    const body = { cmd: tabCmd, shop: tabShop, sup: tabSup, rh: tabRh, bil: tabBil }[E.tab](S);
    const html = head + `<div class="erp-body">${body}</div>`;
    if (!force && html === E._html) return;
    const sc = $('erp-card').querySelector('.erp-body'), top = sc ? sc.scrollTop : 0;
    $('erp-card').innerHTML = html; E._html = html;
    const sc2 = $('erp-card').querySelector('.erp-body'); if (sc2) sc2.scrollTop = top;
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

  function tabShop(S) {
    const cats = { machine: '🏭 Machines', atelier: '🏗 Atelier', equip: '🚜 Équipement', deco: '☕ Confort & déco (installé le lendemain)', abo: '🐦 Abonnements (payés chaque soir)' };
    let h = '<p class="dim">Les véhicules (Mégane, Ducato, camion plateau) s\'achètent au <b>Garage Pasquier</b>, en ville.</p>';
    for (const cat in cats) {
      h += `<h3>${cats[cat]}</h3><div class="erp-grid">`;
      for (const k in ML.CATALOG) {
        const it = ML.CATALOG[k]; if (it.cat !== cat) continue;
        const own = it.mach ? !!S.machines[it.mach] : it.veh ? S.owned.includes(it.veh) : (S.up[k] || 0) >= (it.max || 1);
        const lock = it.need && !S.up[it.need], lvl = it.max > 1 ? ` (${S.up[k] || 0}/${it.max})` : '';
        h += `<div class="erp-item ${own ? 'own' : ''}"><b>${U.esc(it.name)}${lvl}</b><span class="small dim">${U.esc(it.desc || '')}</span>
          ${own && it.daily ? `<span class="ok">✔ abonné (${it.daily} €/jour)</span><button class="sec" data-act="unsub" data-k="${k}">Résilier</button>` : own ? '<span class="ok">✔ acheté</span>' : lock ? `<span class="dim">🔒 il faut : ${U.esc(ML.CATALOG[it.need].name)}</span>` : `<button data-act="buy" data-k="${k}" ${S.money < it.price ? 'disabled' : ''}>Acheter ${eur(it.price)}</button>`}</div>`;
      }
      h += '</div>';
    }
    return h;
  }

  function tabSup(S) {
    const C = E.cart, units = Object.values(C).reduce((x, y) => x + y, 0), sub = Object.keys(C).reduce((x, k) => x + C[k] * ML.SUPPLY[k].price, 0), total = units ? sub + ML.ECO.fee : 0;
    const label = k => (ML.MATERIALS[k] || ML.TOOLS[k]).label;
    let h = `<p class="dim small">Ajoute les produits au panier, puis commande tout d'un coup : un seul COLIS arrive en réception (${ML.ECO.supplierDelay[0] / 60} à ${ML.ECO.supplierDelay[1] / 60} min). Ouvre-le avec <b>R</b>, puis range les produits (E sur le rack ou l'armoire). Pressé ? Le MAGASINIER peut aller chercher directement chez Eliott et Coco, sans frais de port.</p><h3>🛒 Produits</h3><div class="erp-grid">`;
    for (const k in ML.SUPPLY) {
      const L = ML.SUPPLY[k], q = C[k] || 0;
      h += `<div class="erp-item prod"><b>${U.esc(L.name)}</b><span class="small dim">${COMP[L.from].name} · <b class="price">${L.price} €</b> l'unité · en stock : <b class="${S.stock[k] ? '' : 'red'}">${S.stock[k]}</b></span>
        <span class="qty"><button class="mini" data-act="cminus" data-k="${k}" ${q ? '' : 'disabled'}>−</button><b>${q}</b><button class="mini" data-act="cplus" data-k="${k}" ${units >= ML.CART_MAX ? 'disabled' : ''}>+</button><button class="mini del" data-act="cdel" data-k="${k}" ${q ? '' : 'disabled'} title="Supprimer">🗑</button></span></div>`;
    }
    h += `</div><h3>🧺 Panier (${units}/${ML.CART_MAX} articles)</h3>`;
    if (!units) h += '<p class="dim">Le panier est vide : clique sur « + » pour ajouter des produits.</p>';
    else {
      h += '<table class="erp-tab cart">' + Object.keys(C).map(k => `<tr><td>${U.esc(ML.SUPPLY[k].name)}</td><td><button class="mini" data-act="cminus" data-k="${k}">−</button> <b>${C[k]}</b> <button class="mini" data-act="cplus" data-k="${k}" ${units >= ML.CART_MAX ? 'disabled' : ''}>+</button> <button class="mini del" data-act="cdel" data-k="${k}">🗑</button></td><td>${eur(C[k] * ML.SUPPLY[k].price)}</td></tr>`).join('') +
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
