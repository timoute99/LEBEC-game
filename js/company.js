/* =====================================================================
   company.js — L'ENTREPRISE (V4) : tout ce qui dure d'une journée à
   l'autre (argent, réputation, machines, personnel, véhicules, stock,
   améliorations, jour, inspection). C'est ce qui est sauvegardé :
   - sur le serveur (Render), avec un CODE de sauvegarde : n'importe qui
     ayant le code peut reprendre l'atelier, avec n'importe quelle équipe ;
   - et toujours aussi sur ce PC (localStorage), au cas où.
   ===================================================================== */
(function () {
  const Co = ML.Company = {};
  const ID = /^[a-z0-9_]{1,24}$/;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /** Entreprise de départ : T1 + F1, un seul opérateur qui jongle, le vieux Kangoo */
  Co.fresh = (name, money) => ({
    v: 4, name: String(name || 'Mécanique Lebec').slice(0, 30), code: null, city: (Math.random() * 1e9) >>> 0,
    day: 1, money: money === undefined ? ML.ECO.startMoney : money, rep: ML.ECO.startRep,
    mach: ['T1', 'F1'], staff: [pick(['amaury', 'matis', 'marius'])], ai: {}, veh: ['kangoo'], up: {},
    stock: { acier: 4, alu: 3, inox: 2, plaquette: 3, fraise: 2, foret: 2 },
    insp: null, inspNext: 0, won: false, tot: { ca: 0, served: 0, days: 0, best: 0 }, log: []
  });

  /** Nettoie une sauvegarde (venue du serveur ou du PC) : on ne garde que des valeurs connues */
  Co.clean = d => {
    const F = Co.fresh(); if (!d || typeof d !== 'object') return F;
    const num = (v, def, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : def);
    const list = (a, ok) => (Array.isArray(a) ? [...new Set(a.map(String).filter(ok))] : null);
    const E = {
      v: 4, name: String(d.name || F.name).replace(/[<>&"`]/g, '').slice(0, 30), code: d.code ? String(d.code).toUpperCase().slice(0, 8) : null,
      city: num(d.city, F.city, 1, 4294967295), day: num(d.day, 1, 1, 9999), money: num(d.money, F.money, -999999, 99999999), rep: num(d.rep, F.rep, 0, 100),
      mach: list(d.mach, x => ML.MACHINES.some(m => m.id === x)) || F.mach,
      staff: list(d.staff, x => !!ML.STAFF[x]) || F.staff,
      ai: {}, veh: list(d.veh, x => !!ML.VEHICLES[x]) || F.veh, up: {}, stock: {},
      insp: d.insp === 'due' ? 'due' : null, inspNext: num(d.inspNext, 0, 0, 9999), won: !!d.won, bankrupt: !!d.bankrupt,
      tot: { ca: num(d.tot && d.tot.ca, 0, 0, 1e9), served: num(d.tot && d.tot.served, 0, 0, 1e7), days: num(d.tot && d.tot.days, 0, 0, 1e5), best: num(d.tot && d.tot.best, 0, -1e7, 1e9) },
      log: Array.isArray(d.log) ? d.log.slice(-8).map(x => String(x).slice(0, 120)) : []
    };
    if (!E.mach.length) E.mach = F.mach;
    if (!E.veh.includes('kangoo')) E.veh.unshift('kangoo');
    for (const k in ML.AI_STAFF) if (d.ai && d.ai[k]) E.ai[k] = true;
    for (const k in ML.CATALOG) if (d.up && d.up[k] && !ML.CATALOG[k].mach && !ML.CATALOG[k].veh) E.up[k] = num(d.up[k], 1, 1, ML.CATALOG[k].max || 1);
    if (d.up && d.up.sae_bon) E.up.sae_bon = num(d.up.sae_bon, 0, 0, 80);          // V5.2 : bon de réduction gagné à une SAE (sur la prochaine machine)
    E.wc = num(d.wc, 15, 0, 100);                                                       // V5.2 : saleté des toilettes
    for (const k in ML.CFG.START_STOCK) E.stock[k] = num(d.stock && d.stock[k], F.stock[k] || 0, 0, 999);
    E.mess = Co.cleanMess(d.mess);
    E.hist = Array.isArray(d.hist) ? d.hist.slice(-7).map(h => ({ d: num(h && h.d, 1, 1, 9999), p: (Array.isArray(h && h.p) ? h.p : []).slice(0, 8).map(r => [String(r[0] || '?').replace(/[<>&"`]/g, '').slice(0, 16)].concat([1, 2, 3, 4].map(i => num(r[i], 0, 0, 1e7)))) })) : [];
    return E;
  };
  /** V5 : ce qui reste d'un jour à l'autre (commandes, bazar…) — on ne garde que des valeurs sûres */
  Co.cleanMess = m => {
    if (!m || typeof m !== 'object') return null;
    const fin = v => Number.isFinite(+v) ? +v : 0, small = o => (o && typeof o === 'object' && !Array.isArray(o) && JSON.stringify(o).length < 400 ? o : {});
    const T = ML.Items.TYPES, STEPS = ['fonderie', 'chaudro', 'usinage', 'tth', 'livraison'], C = ML.COMPANIES;
    const out = {
      it: (Array.isArray(m.it) ? m.it : []).slice(0, 150).filter(r => Array.isArray(r) && T[r[0]]).map(r => [r[0], small(r[1]), fin(r[2]), fin(r[3]), fin(r[4])]),
      beds: {}, mach: {}, pud: (Array.isArray(m.pud) ? m.pud : []).slice(0, 8).map(r => [fin(r[0]), fin(r[1]), Math.min(3, Math.max(0.5, fin(r[2])))]),
      ord: (Array.isArray(m.ord) ? m.ord : []).slice(0, 14).filter(o => o && C[o.client] && Array.isArray(o.steps) && o.steps.every(x => STEPS.includes(x))).map(o => ({
        id: Math.max(1, Math.round(fin(o.id))), client: o.client, part: String(o.part || 'Pièce').slice(0, 40), mat: ML.MATERIALS[o.mat] ? o.mat : 'acier', mtype: ML.MTYPE[o.mtype] ? o.mtype : 'tour',
        tool: ML.TOOLS[o.tool] ? o.tool : 'plaquette', steps: o.steps.slice(0, 4), si: Math.max(0, Math.min(o.steps.length - 1, Math.round(fin(o.si)))), size: ['s', 'm', 'l'].includes(o.size) ? o.size : 'm',
        src: o.src === 'fonderie' || o.src === 'chaudro' ? o.src : null, dur: Math.max(60, Math.min(2000, fin(o.dur))), price: Math.max(0, Math.min(1e5, Math.round(fin(o.price)))), left: Math.max(0, Math.min(2000, fin(o.left))), plan: /^[TF][1-4]$/.test(o.plan) ? o.plan : null, q: !!o.q })),
      jobs: (Array.isArray(m.jobs) ? m.jobs : []).slice(0, 8).filter(j => Array.isArray(j) && /^[TF][1-4]$/.test(j[0]) && ML.TOOLS[j[2]]).map(j => [j[0], Math.round(fin(j[1])), j[2], j[3] ? 1 : 0, Math.max(0, fin(j[4])), Math.max(1, fin(j[5])), j[6] ? 1 : 0]),
      deliv: (Array.isArray(m.deliv) ? m.deliv : []).slice(0, 20).filter(d => d && typeof d === 'object').map(d => {
        const o = { eta: Math.max(5, Math.min(600, fin(d.eta))), from: C[d.from] ? d.from : 'aciers', name: String(d.name || 'Livraison').slice(0, 60) };
        if (ML.SUPPLY[d.k]) { o.k = d.k; o.q = Math.max(1, Math.min(40, Math.round(fin(d.q)))); }
        if (d.cart && typeof d.cart === 'object') { o.cart = {}; for (const k in d.cart) if (ML.SUPPLY[k]) o.cart[k] = Math.max(0, Math.min(40, Math.round(fin(d.cart[k])))); }
        if (d.oid) { o.oid = Math.round(fin(d.oid)); o.sub = d.sub === 'fonderie' ? 'fonderie' : 'chaudro'; }
        return o;
      }),
      subs: (Array.isArray(m.subs) ? m.subs : []).slice(0, 20).filter(j => j && ['fonderie', 'chaudro', 'tth'].includes(j.k)).map(j => {
        const o = { k: j.k, oid: Math.round(fin(j.oid)), end: Math.max(5, Math.min(600, fin(j.end))) };
        if (j.k === 'tth') { o.nc = !!j.nc; o.mes = Array.isArray(j.mes) ? j.mes.slice(0, 4) : undefined; o.type = j.type === 'piece' ? 'piece' : 'caisse'; }
        return o;
      })
    };
    if (m.beds && typeof m.beds === 'object') for (const k in m.beds) if (ML.VEHICLES[k] && Array.isArray(m.beds[k])) out.beds[k] = m.beds[k].slice(0, 8).filter(r => Array.isArray(r) && T[r[0]]).map(r => [r[0], small(r[1])]);
    if (m.mach && typeof m.mach === 'object') for (const k in m.mach) if (/^[TF][1-4]$/.test(k) && Array.isArray(m.mach[k])) out.mach[k] = [Math.max(0, Math.min(100, fin(m.mach[k][0]))), m.mach[k][1] ? 1 : 0, m.mach[k][2] ? 1 : 0, Math.max(0, Math.min(100, fin(m.mach[k][3])))];
    return out;
  };
  /** Fusionne l'état de fin de journée (ou d'autosauvegarde) dans l'entreprise */
  Co.merge = (E, snap) => {
    const m = Object.assign({}, E, snap || {});
    if (snap && snap.histDay) { m.hist = (E.hist || []).filter(h => h.d !== snap.histDay.d).concat([snap.histDay]).slice(-7); delete m.histDay; }
    return Co.clean(m);
  };
  /** L'inspecteur peut-il venir ? (atelier prêt, ou jour limite) */
  Co.inspReady = E => !E.won && !E.insp && E.day >= (E.inspNext || 0) &&
    ((E.mach.length >= ML.CAMPAIGN.inspMach && E.rep >= ML.CAMPAIGN.inspRep) || E.day >= ML.CAMPAIGN.inspLate);
  Co.summary = E => `🏭 <b>${ML.U.esc(E.name)}</b>${E.code ? ` · code <b class="code">${E.code}</b>` : ' · <span class="dim">sauvegarde sur ce PC</span>'} · 📅 jour ${E.day} · 💶 ${E.money.toLocaleString('fr-FR')} € · ⭐ ${E.rep}/100 · ${E.mach.length} machine${E.mach.length > 1 ? 's' : ''} · 👷 ${E.staff.length}${E.bankrupt ? ' · 💸 FAILLITE' : E.won ? ' · 🏆 terminé' : E.insp ? ' · 🎓 inspection demain !' : ''}`;
  Co.goal = E => E.bankrupt ? '💸 Faillite : crée une nouvelle entreprise (ou charge-en une autre avec son code).' : E.won ? '🏆 Campagne terminée : vous pouvez continuer à faire tourner l\'atelier.' :
    E.insp ? "🎓 L'inspecteur de l'Éducation Nationale vient à la prochaine journée !" :
    `🎯 Objectif : ${ML.CAMPAIGN.inspMach} machines (${E.mach.length}/${ML.CAMPAIGN.inspMach}) et réputation ${ML.CAMPAIGN.inspRep} (${E.rep}) → l'inspecteur viendra. (Au plus tard au jour ${ML.CAMPAIGN.inspLate}.)`;
  Co.ID = ID;
})();
