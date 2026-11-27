/* =====================================================================
   rules.js — Côté CLIENT : texte des actions [E] (calculé à partir de
   l'état reçu de l'hôte) et déclenchement : intention envoyée à l'hôte,
   éventuellement après un mini-jeu ou un dialogue local.
   La vraie logique (ce qui se passe) est dans sim*.js, chez l'hôte.
   ===================================================================== */
(function () {
  const R = ML.Rules = {};
  const IT = ML.Items, COMP = ML.COMPANIES;
  const stage = o => o.steps[o.si];
  const P_ = id => ML.PEOPLE[id];
  const short = id => { const n = P_(id).name; return /^(M\.|Mme|Accueil|L')/.test(n) ? n : n.split(' ')[0]; };
  R.short = short;
  const COMP_OF = {}; for (const k in COMP) if (COMP[k].npc) COMP_OF[COMP[k].npc] = k;
  R.compOf = npc => COMP_OF[npc];
  const S_ = () => ML.Game.S;
  const midOf = npc => { const S = S_(); for (const id in S.machines) if (S.machines[id].op === npc) return id; return null; };
  const opName = npc => short(npc);
  const fireAt = mid => (S_().fires || []).find(f => f.mid === mid);
  const myRole = () => { const S = S_(); return S && S.pl[ML.Game.me] ? S.pl[ML.Game.me].role : 'poly'; };
  const soloR = () => { const S = S_(); return !!S && Object.keys(S.pl).length === 1; };   // V6 : seul = tous les rôles
  const isR = r => myRole() === r || soloR();
  R.myRole = myRole;
  const isPart = it => !!it && (it.type === 'caisse' || it.type === 'piece');
  const inv = () => { const S = S_(); return S && S.pl[ML.Game.me] ? S.pl[ML.Game.me].inv : []; };
  const dprice = D => Math.round(D.price * (S_() && S_().black ? ML.ECO.black.dealer : 1));     // V5.2 : Black Friday au garage

  function machineLabel(mid, held) {
    const S = S_(), M = S.machines[mid], def = ML.MACHINES.find(m => m.id === mid);
    if (!M) return null;
    if (M.stopped) return S.power ? `▶ Redémarrer ${mid} (arrêt d'urgence)` : `⏹ ${mid} : arrêt d'urgence — remets d'abord le courant (tableau électrique)`;
    if (!M.op) return `${mid} : SANS OPÉRATEUR — embauche au PC de gestion (onglet Personnel)`;
    if (fireAt(mid)) return held && held.type === 'extincteur' ? `🔥 Éteindre : maintiens le CLIC GAUCHE vers le feu` : `🔥 FEU sur ${mid} ! Prends un extincteur (mur gauche)`;
    if (M.broken) return held && held.type === 'cle' ? (isR('maintenance') ? `🔧 Réparer ${mid} (clé à molette)` : `${mid} en panne : réservé MAINTENANCE 🔧`) : `${mid} EN PANNE : clé à molette (maintenance)`;
    if (M.bin === false || M.chips >= 100) return `🗑 ${mid} bloquée : bac à copeaux ${M.bin === false ? 'ABSENT' : 'PLEIN'} (maintenance)`;
    if (M.worn && M.job) return held && IT.def(held).kind === 'tool' ? `Changer l'outil usé de ${mid}` : `${mid} : outil usé → ${ML.TOOLS[M.job.need].label} neuf(ve)`;
    if (held) {
      const t = IT.def(held);
      if (t.kind === 'kit') return M.job ? `${mid} est occupée` : `🧰 Lancer le KIT ${ML.on(held.d.oid)} sur ${mid} (brut + outil d'un coup) — prise d'origine`;
      if (t.kind === 'brut') return M.job ? `${mid} est occupée` : `Lancer « ${IT.name(held)} » sur ${mid} (${ML.MTYPE[def.type]}) — prise d'origine${M.plan ? ` · prévu : #${M.plan}` : ''}`;
      if (t.kind === 'tool') return !M.job ? `${mid} : donne d'abord un brut` : M.job.tool ? `${mid} a déjà son outil` : `Donner « ${IT.name(held)} » à ${mid}`;
    }
    if (!S.power) return `${mid} : plus de courant !`;
    if (!M.job) return `${mid} ${ML.MTYPE[def.type]} libre — apporte un brut`;
    return `${mid} : ${ML.on(M.job.oid)} ` + (M.job.tool ? `${Math.floor(100 * M.job.prog / M.job.total)} %` : `attend : ${ML.TOOLS[M.job.need].label}`);
  }

  /** Texte affiché pour une cible, ou null si rien à faire */
  R.label = id => {
    const G = ML.Game, S = G.S; if (!S) return null;
    const held = G.held(), [kind, a, b] = id.split(':');
    switch (kind) {
      case 'rack': { const n = inv().filter(x => x && x.type === 'brut_' + a).length; return n ? `📦 Ranger ${n} barre${n > 1 ? 's' : ''} ${ML.MATERIALS[a].label} dans le rack` : `Prendre un brut ${ML.MATERIALS[a].label} (stock : ${S.stock[a]})`; }
      case 'tool': { if (S.evs && S.evs.herve) return '🔒 Armoire bloquée par Hervé : il veut sa convention !'; const n = inv().filter(x => x && x.type === a).length; return n ? `📦 Ranger ${n} × ${ML.TOOLS[a].label} dans l'armoire` : `Prendre : ${ML.TOOLS[a].label} (stock : ${S.stock[a]})`; }
      case 'coffee': return `☕ Café : tu vas BEAUCOUP plus vite (${S.up && S.up.cafe_pro ? ML.CFG.COFFEE.secPro : ML.CFG.COFFEE.sec} s)`;
      case 'frigo': return 'Frigo : prendre des viennoiseries';
      case 'casques': return 'Prendre un casque de sécurité';
      case 'reception': return held && held.type === 'matiere' ? 'Déposer la caisse en réception (+ stock)' : null;
      case 'printer': return S.evs && S.evs.herve ? '📝 Imprimer la convention de stage' : null;
      case 'pc': { const n = S.props.length + S.parts.filter(p => p.st === 'wait').length; return `💻 PC de gestion : commandes, achats, embauches${n ? ` — 📥 ${n} demande${n > 1 ? 's' : ''} !` : ''}${S.evs && S.evs.fred ? ' · ARÉXIS' : ''}`; }
      case 'panel': return !S.power ? '⚡ Réarmer le disjoncteur' : G.traitor ? '🕵 Couper le courant (discrètement…)' : null;
      case 'marbre':
        if (!isPart(held)) return S.evs && S.evs.audit ? '🔍 Jacky attend une CAISSE ici' : null;
        return S.evs && S.evs.audit && G.npcDist('jacky') < 6 ? `🔍 Présenter la caisse ${ML.on(held.d.oid)} à Jacky (audit)` : `📏 Contrôler la caisse ${ML.on(held.d.oid)} au pied à coulisse`;
      case 'mach': return machineLabel(a, held);
      case 'bac': {
        const M = S.machines[a]; if (!M) return null;
        if (!isR('maintenance')) return M.chips >= 75 || M.bin === false ? `Bac de ${a} ${M.bin === false ? 'absent' : Math.round(M.chips) + ' %'} — réservé MAINTENANCE 🔧` : null;
        if (M.bin === false) return held && held.type === 'bac_vide' ? `🪣 Remettre le bac sur ${a}` : `Bac de ${a} absent : vide-le à la benne et rapporte-le`;
        return M.chips >= 15 ? `🗑 Prendre le bac de copeaux de ${a} (${Math.round(M.chips)} %)` : null;
      }
      case 'benne': return held && held.type === 'bac_plein' ? '🗑 Vider le bac dans la benne à copeaux' : null;
      case 'item': { const it = G.itemViews[a]; if (!it) return null; if (it.type === 'colis') return `📦 Porter le colis (${it.d.n} articles) · [R] l'OUVRIR`; if (it.type === 'palette') return `🏗 Palette ${ML.on(it.d.oid)} : trop lourd ! Fenwick (cariste)`; return it.type === 'find' ? `★ Ramasser la trouvaille : ${IT.name(it)}` : `Ramasser : ${IT.name(it)}`; }
      case 'car': {
        const c = S.cars[+a]; if (!c) return null;
        if (b === 'door') {
          if (held && held.type === 'jerrican' && c.kind !== 'tp') return `⛽ Verser le jerrican dans ${c.name} (${c.fuel} %)`;
          const V = ML.VEHICLES[c.kind];
          if (c.dr) return V.seats && !(c.pass || []).some(x => x.seat === 'cab') ? `🪑 Monter côté passager (${S.pl[c.dr] ? S.pl[c.dr].name : '?'} conduit)` : `${c.name} (conduit par ${S.pl[c.dr] ? S.pl[c.dr].name : '?'})`;
          if (V.role && myRole() !== V.role && !soloR()) return `${c.name} : réservé au ${ML.ROLES[V.role].icon} ${ML.ROLES[V.role].name.toUpperCase()}`;
          return `Conduire ${c.name}` + (['tp', 'fenwick'].includes(c.kind) ? '' : ` (⛽ ${c.fuel} %)`) + (c.kind === 'fenwick' ? ' — R : fourches' : c.kind === 'camion' ? ' — R : décharger' : '');
        }
        if (c.kind === 'fenwick') return null;
        if (c.kind === 'camion') return c.bed.length ? `Camion : ${c.bed.length} palette(s)` : null;
        if (!held && !c.bed.length && ML.VEHICLES[c.kind].seats > 1 && (c.pass || []).filter(x => x.seat !== 'cab').length < 2) return '🛻 Monter dans la benne';
        if (held && (IT.bulky(held) || held.type === 'piece') && !IT.heavy(held)) return c.bed.length >= c.cap ? (c.kind === 'tp' ? 'Transpalette plein' : 'Benne pleine') : `Charger ${c.kind === 'tp' ? 'sur le transpalette' : c.kind === 'scooter' ? 'dans le top-case' : 'dans la benne'} (${c.bed.length}/${c.cap})`;
        return c.bed.length ? `Décharger une caisse (${c.bed.length} chargée${c.bed.length > 1 ? 's' : ''})` : null;
      }
      case 'pl': {
        const p = S.pl[a]; if (!p) return null;
        if (!held && myRole() === 'medecin' && p.hp < 100) return `⛑ Soigner ${p.name} (${p.hp}/100 PV)`;
        if (p.ko) return `🤕 ${p.name} est KO : il faut le médecin !`;
        if (!held) return null; return `Passer « ${IT.name(held)} » à ${p.name}`;
      }
      case 'npc': return npcLabel(a, held);
      case 'show': {                                                // V5 : véhicule exposé au showroom du Garage Pasquier
        const D = ML.DEALER[a]; if (!D) return null;
        return S.owned.includes(a) ? `✔ ${D.name} : déjà à vous (il attend devant le garage ou à l'atelier)` : `🚗 ${D.name} — ${dprice(D).toLocaleString('fr-FR')} €${S.black ? ' (BLACK FRIDAY)' : ''} : voir la fiche et acheter`;
      }
      // --- V5.2 ---
      case 'prepa': return S.up && S.up.prepa ? `🧰 Poste de préparation : ${S.prepaMsg ? '⚠ ' + S.prepaMsg : 'il prépare les kits tout seul'}` : `🔒 Poste de préparation : à acheter au PC (${Math.round(ML.CATALOG.prepa.price * (S.black ? ML.ECO.black.cat : 1)).toLocaleString('fr-FR')} €)`;
      case 'wc': return (S.wc || 0) >= 12 ? `🚽 Nettoyer les toilettes (sales à ${Math.round(S.wc)} %)` : '🚽 Les toilettes sont propres';
      case 'radar': return (S.radarsOff || []).includes(+a) ? '🪚 Radar hors service' : held && held.type === 'meuleuse' ? '🪚 Découper le radar (attention : un témoin = −150 €)' : null;
      case 'mall': { const M2 = ML.MALL[a]; if (!M2) return null; const pr = Math.round(M2.price * (S.black ? ML.ECO.black.mall : 1)); return `${M2.icon} Acheter : ${M2.name} — ${pr} €${S.black ? ' (Black Friday)' : ''} · ${M2.desc}`; }
      case 'gym': { const lv = (ML.Account.prof.st || {}).endu || 0; return lv >= ML.ECO.enduMax ? `🏃 Tapis de course (endurance au max : ${lv}/${ML.ECO.enduMax})` : `🏃 Tapis de course : +1 endurance (${Math.round(ML.ECO.gym * (S.black ? ML.ECO.black.mall : 1))} €) — niveau ${lv}/${ML.ECO.enduMax}`; }
      case 'quest': {
        const Q = S.quest; if (!Q || Q.st !== 'go') return null; const want = Q.need || Q.carry, T = want && IT.TYPES[want];
        if (want && (!held || held.type !== want)) return `🙋 ${Q.at.name} : il faut ${T.icon} ${typeof T.name === 'function' ? T.name({ to: Q.at.name }) : T.name} en main`;
        return `🙋 ${Q.mg ? 'Donner un coup de main' : Q.carry ? 'Déposer' : 'Donner'} à ${Q.who} (+${Q.reward} €)`;
      }
    }
    return null;
  };

  function npcLabel(n, held) {
    const S = S_(), G = ML.Game, st = (G.npcViews[n] || {}).st, mid = midOf(n);
    if (P_(n).op) {
      if (!mid) return null;
      if (st === 'p' || st === 'f') return `Secouer ${opName(n)} (« au boulot ! »)`;
      if (held && held.type === 'viennoiseries' && n === 'matis') return 'Donner les viennoiseries à Matis (+40 % vitesse)';
      if (held && ['brut', 'tool', 'kit'].includes(IT.def(held).kind)) return machineLabel(mid, held);
      return `Parler à ${opName(n)}`;
    }
    switch (n) {
      case 'tony': return 'Tony (cariste) : il charge les palettes dans le camion';
      case 'jojo': return S.tour ? null : 'Jojo (livreur) : il part en tournée dès qu\'il y a des colis à l\'EXPÉDITION';
      case 'vendeur': return '🚗 Garage Pasquier : acheter un véhicule';
      case 'gendarme': { const jailed = Object.keys(S.pl).filter(p => S.pl[p].jail > (G.rt || 0)); return jailed.length ? `👮 Payer la caution (${ML.ECO.jail.bail} €) : ${jailed.map(p => S.pl[p].name).join(', ')} en garde à vue` : '👮 Parler au gendarme'; }
      case 'lebec': return held && held.type === 'convention' && !held.d.signee ? '✍ Faire signer la convention à Lebec' : S.rule === 'no_lebec' ? 'Parler à Lebec (INTERDIT par l\'inspecteur !)' : 'Parler à François Lebec';
      case 'jacky': return 'Jacky : apporte une caisse au MARBRE';
      case 'herve': return held && held.type === 'convention' ? (held.d.signee ? '📝 Rendre la convention SIGNÉE à Hervé' : 'La convention n\'est pas signée (Lebec !)') : 'Hervé : « La convention ? »';
      case 'fred': return 'Fred : « Arexis ! » (remplis-le sur le PC)';
      case 'mathieu': return '🐌 Écouter Mathieu à la place de l\'opérateur';
      case 'saboteur': return 'Gars louche… (la BATTE DE BASEBALL le ferait fuir)';
      case 'inspecteur': return 'Parler à l\'inspecteur';
      // --- V5.2 ---
      case 'johan': return (G.npcViews.johan || {}).st === 'r' ? '🦹 Johan Bois file avec une caisse : GRANDE CLÉ À MOLETTE (clic gauche) !' : '🦹 Johan Bois… (la GRANDE clé à molette le ferait fuir)';
      case 'vigile': return '🛡 Raymond, le vigile anti-Johan';
      case 'bleuenn': return '💣 Lean Manufacturing bricole… la GRANDE CLÉ À MOLETTE (clic gauche) l\'arrêterait !';
      case 'garnier': case 'fanfrelat': return isPart(held) ? `🎓 Présenter la pièce ${ML.on(held.d.oid)} au jury de SAE` : `🎓 ${P_(n).name} (jury de SAE)`;
      case 'vendeuse': return '🛍 Sandra : les stands sont au fond (E sur un article pour l\'acheter)';
      case 'coach': return '🏃 Coach Bruno : E sur un tapis de course pour s\'entraîner';
      case 'cardin': case 'kawa': { const Q = S.quest; return Q && Q.giver === n && Q.st === 'ask' ? `🙋 ${P_(n).name} : écouter sa demande (${Q.reward} €)` : `Parler à ${P_(n).name}`; }
    }
    { const Q = S.quest; if (Q && Q.giver === n && Q.st === 'ask') return `🙋 ${P_(n).name} : écouter sa demande (${Q.reward} €)`; }
    if (ML.PARTICULIERS.includes(n)) {
      const p = (S.parts || []).find(x => x.id === n); if (!p) return null;
      if (p.st === 'wait') return `🙋 ${P_(n).name} : écouter sa demande (${p.price} €)`;
      if (p.st === 'order') return isPart(held) ? `Donner la pièce ${ML.on(held.d.oid)} à ${P_(n).name}` : `${P_(n).name} attend sa pièce (${ML.on(p.oid)})`;
      return null;
    }
    const comp = COMP_OF[n], C = comp && COMP[comp];
    if (!C) return null;
    switch (C.kind) {
      case 'boulangerie': return 'Prendre des viennoiseries (pour Matis)';
      case 'station': return 'Prendre un jerrican d\'essence (gratuit)';
      case 'matiere': return isR('magasinier') ? 'Commander de la matière à Eliott (il parle TRÈS vite)' : 'Eliott ne parle qu\'au MAGASINIER 📦';
      case 'outils': return isR('magasinier') ? 'Acheter des outils (écouter Coco parler boxe 6 s)' : 'Coco ne vend qu\'au MAGASINIER 📦';
      case 'fonderie': case 'chaudro': {
        const list = S.orders.filter(o => stage(o) === comp && !o.q);
        return list.length ? `Commander le brut de ${list.length > 1 ? 'la commande…' : 'la commande #' + list[0].id} (${C.name})` : `${C.name} : aucune commande ne demande ce brut`;
      }
      case 'tth': {
        if (isPart(held)) { const o = G.order(held.d.oid); return o && stage(o) === 'tth' ? `Confier la caisse ${ML.on(o.id)} au traitement thermique` : 'Cette caisse n\'a pas besoin de traitement thermique'; }
        return 'TTH Ouest : apporte une caisse à traiter';
      }
      case 'client': return isPart(held) ? `Livrer la caisse ${ML.on(held.d.oid)} à ${C.name}` : `${C.name} : parler`;
      case 'concurrent': return isPart(held) ? `🕵 Donner la caisse ${ML.on(held.d.oid)} à UsiFlash (trahison !)` : 'Kévin (UsiFlash)';
    }
    return null;
  }

  /** Action [E] sur une cible */
  R.use = id => {
    const G = ML.Game, S = G.S, [kind, a, b] = id.split(':'), held = G.held(), Mini = ML.Mini;
    switch (kind) {
      case 'mach': {
        const M = S.machines[a]; if (!M) return;
        if (M.broken && held && held.type === 'cle' && !fireAt(a)) return Mini.run('serrer', { title: `🔧 Réparation de ${a}` }, r => { if (r === 'ok') G.intent({ a: 'repair', mid: a }); else if (r) ML.HUD.notify('Trop lent ! Recommence (E).', 'warn'); });
        if (!M.broken && !fireAt(a) && M.worn && held && held.type === 'plaquette' && M.job && M.job.need === 'plaquette') return Mini.run('plaquette', {}, r => { if (r) G.intent({ a: 'use', id, mg: r }); });
        if (!M.broken && !M.stopped && !fireAt(a) && !M.job && held && ['brut', 'kit'].includes(IT.def(held).kind)) return Mini.run('origine', {}, r => G.intent({ a: 'use', id, mg: r || 'meh' }));
        break;
      }
      case 'marbre': {
        if (!isPart(held)) break;
        if (S.evs && S.evs.audit && G.npcDist('jacky') < 6) return Mini.run('quiz', {}, ok => { if (ok !== null) G.intent({ a: 'audit', ok: !!ok }); });
        if (!held.d.mes) { ML.HUD.notify('Cette caisse n\'a pas de fiche de cote. Livre-la telle quelle.'); return; }
        return Mini.run('pied', { mes: held.d.mes }, r => { if (r !== null) G.intent({ a: 'use', id, ctl: r }); });
      }
      case 'pc': return ML.ERP.open();
      // --- V5.2 ---
      case 'wc': if ((S.wc || 0) >= 12) return Mini.run('serrer', { title: '🚽 Nettoyage des toilettes', text: 'Brosse, serpillière, désodorisant : tape <b>Espace</b> le plus vite possible !', need: 14 }, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); else if (r) ML.HUD.notify('Trop lent… ça sent encore. Recommence (E).', 'warn'); }); break;
      case 'radar': if (held && held.type === 'meuleuse' && !(S.radarsOff || []).includes(+a)) return Mini.run('serrer', { title: '🪚 Découpe du radar', text: 'Tiens bien la meuleuse : tape <b>Espace</b> !', need: 12 }, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); }); break;
      case 'gym': return Mini.run('tapis', {}, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); else if (r) ML.HUD.notify('🥵 Tu as craqué avant la fin. Réessaie (E) !', 'warn'); });
      case 'quest': { const Q = S.quest; if (Q && Q.st === 'go' && Q.mg && held && held.type === Q.need) return Mini.run('serrer', { title: `🔧 Coup de main à ${Q.who}`, text: 'Allez, on serre : tape <b>Espace</b> !', need: 12 }, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); }); break; }
      case 'show': {
        const D = ML.DEALER[a]; if (!D) return;
        if (S.owned.includes(a)) return ML.Dialogue.info(P_('vendeur').name, `${D.name} ? Vous l'avez déjà ! ${ML.line('vendeur')}`);
        const spec = (D.specs || []).map(([k, v]) => `${k} : ${ML.CFG[v] && ML.CFG[v].max ? Math.round(ML.CFG[v].max * 3.6) + ' km/h' : v}`).join(' · '), pr = dprice(D);
        return ML.Dialogue.choice(`${D.name} — ${pr.toLocaleString('fr-FR')} €${S.black ? ' (BLACK FRIDAY)' : ''}`, `${D.desc} ${spec}. Dans la caisse : ${S.money.toLocaleString('fr-FR')} €.`,
          [{ label: S.money >= pr ? `✅ Acheter (${pr.toLocaleString('fr-FR')} €)` : `💸 Pas assez d'argent (${pr.toLocaleString('fr-FR')} €)`, fn: S.money >= pr ? () => G.intent({ a: 'buycar', k: a }) : null }, { label: 'Juste regarder', fn: null }]);
      }
      case 'panel': if (!S.power) return Mini.run('serrer', { title: '⚡ Réarmer le disjoncteur', text: 'Remonte le levier : tape <b>Espace</b> !', need: 8 }, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); }); break;
      case 'pl': {
        const T = S.pl[a];
        if (!held && myRole() === 'medecin' && T && T.hp < 100) return Mini.run('serrer', { title: `⛑ Soins de ${T.name}`, text: 'Bandage, désinfectant… tape <b>Espace</b> !', need: 10 }, r => { if (r === 'ok') G.intent({ a: 'heal', id: a }); });
        break;
      }
      case 'npc': {
        if (P_(a).op && held && ['brut', 'tool', 'kit'].includes(IT.def(held).kind) && midOf(a)) return R.use('mach:' + midOf(a));
        { const Q = S.quest; if (Q && Q.giver === a && Q.st === 'ask') return ML.Dialogue.choice(P_(a).name, `${Q.ask} (${Q.at.name}) — je te donne ${Q.reward} € !`, [{ label: `✅ D'accord (${Q.reward} €)`, fn: () => G.intent({ a: 'quest', ok: 1 }) }, { label: 'Désolé, pas le temps', fn: () => G.intent({ a: 'quest', ok: 0 }) }, { label: 'Je réfléchis…', fn: null }]); }
        if (ML.PARTICULIERS.includes(a)) {
          const p = (S.parts || []).find(x => x.id === a);
          if (p && p.st === 'wait') return ML.Dialogue.choice(P_(a).name, `${ML.line(a, 'demande', 'Bonjour !')} Il me faudrait une pièce en ${ML.MATERIALS[p.mat].label} (${ML.MTYPE[p.mtype]}, ${ML.TOOLS[p.tool].label.toLowerCase()}). C'est urgent : ${Math.round(p.dur / 60 * 10) / 10} min maximum. Je paie ${p.price} € !`,
            [{ label: `Accepter (${p.price} €)`, fn: () => G.intent({ a: 'part', id: a, ok: 1 }) }, { label: 'Refuser', fn: () => G.intent({ a: 'part', id: a, ok: 0 }) }, { label: 'Je réfléchis…', fn: null }]);
          break;
        }
        if (a === 'vendeur') {
          const opts = Object.keys(ML.DEALER).map(k => { const D = ML.DEALER[k], own = S.owned.includes(k); return { label: own ? `✔ ${D.name} (déjà à vous)` : `${D.name} — ${dprice(D).toLocaleString('fr-FR')} € : ${D.desc}`, fn: own ? null : () => G.intent({ a: 'buycar', k }) }; });
          return ML.Dialogue.choice(P_('vendeur').name, `${ML.line('vendeur')} Dans la caisse de l'atelier, vous avez ${S.money.toLocaleString('fr-FR')} €.`, opts.concat([{ label: 'Juste regarder', fn: null }]));
        }
        if (a === 'gendarme') {
          const jailed = Object.keys(S.pl).filter(p => S.pl[p].jail > (G.rt || 0) && p !== G.me), me = S.pl[G.me];
          const txt = (me && me.jail > (G.rt || 0) ? 'Vous, vous restez là. ' : '') + ML.line('gendarme', null, 'Bonjour.') + (S.pedHits && S.pedHits[G.me] ? ` (Passants renversés aujourd'hui : ${S.pedHits[G.me]}/${ML.ECO.jail.peds}. Au ${ML.ECO.jail.peds}e, c'est la garde à vue.)` : '');
          return ML.Dialogue.choice(P_('gendarme').name, txt, jailed.map(p => ({ label: `💶 Payer la caution de ${S.pl[p].name} (${ML.ECO.jail.bail} €)`, fn: () => G.intent({ a: 'bail', id: p }) })).concat([{ label: 'Au revoir, monsieur l\'agent', fn: null }]));
        }
        if (a === 'mathieu') return ML.Dialogue.listen(P_('mathieu').name, [0, 1, 2, 3].map(() => ML.line('mathieu')).concat(['Et… du coup… voilà… quoi.']), 7, () => G.intent({ a: 'mathieu' }), null, () => G.npcDist('mathieu') < 6);
        const comp = COMP_OF[a], C = comp && COMP[comp];
        if (C && (C.kind === 'matiere' || C.kind === 'outils') && !isR('magasinier')) break;
        if (C && C.kind === 'matiere') return ML.Dialogue.supplier(a, (mat, succ) => G.intent({ a: 'eliott', mat, succ }));
        if (C && C.kind === 'outils') return ML.Dialogue.listen(P_('coco').name, [0, 1, 2, 3, 4].map(() => ML.line('coco', 'boxe', 'Jab, jab, uppercut !')), 6, () => { G.intent({ a: 'coco' }); ML.Dialogue.info(P_('coco').name, "Merci de m'avoir écouté ! Ta caisse d'outils est sur le quai. Dépose-la en RÉCEPTION à l'atelier."); }, null, () => G.npcDist(a) < 6);
        if (C && (C.kind === 'fonderie' || C.kind === 'chaudro')) {
          const list = S.orders.filter(o => stage(o) === comp && !o.q);
          if (!list.length) return;
          if (list.length === 1) return G.intent({ a: 'sub', comp, oid: list[0].id });
          return ML.Dialogue.choice(C.name, 'Pour quelle commande ?', list.map(o => ({ label: `${ML.on(o.id)} (${COMP[o.client].name})`, fn: () => G.intent({ a: 'sub', comp, oid: o.id }) })).concat([{ label: 'Rien', fn: null }]));
        }
        if (C && C.kind === 'client' && !(isPart(held))) {
          const mine = S.orders.filter(o => o.client === comp);
          return ML.Dialogue.info(C.name, ML.line(a, null, 'Bonjour !') + ' ' + (mine.length ? 'On attend : ' + mine.map(o => `${ML.on(o.id)}`).join(', ') + '.' : 'Rien en attente pour nous.'));
        }
        break;
      }
    }
    G.intent({ a: 'use', id });
  };

  /* V5.3 : PETITS CONSEILS — une 2e ligne discrète sous l'action, quand on regarde un truc spécial un moment */
  const HINT_ID = {
    rack: 'La couleur du rack = la matière du ticket. Plus de barres ? App 🛒 Fournisseurs du PC.',
    tool: 'La pastille de couleur du ticket dit quel outil prendre.',
    coffee: 'Le café fait courir plus vite… un moment.',
    reception: 'Les bruts commandés au PC et les colis arrivent ici. R pour ouvrir un colis.',
    printer: 'Sert surtout quand Hervé réclame sa convention.',
    pc: 'Le pense-bête du bureau dit quoi faire. L\'app 💡 Astuces explique tout.',
    marbre: 'Jacky (audit) et le jury de SAE notent les caisses posées ici.',
    panel: 'Coupure ? On réarme ici. Après une explosion, il faut aussi relancer chaque machine.',
    casques: 'Utile le jour où l\'inspecteur impose le casque.',
    bac: 'Bac plein = machine bloquée. On le vide dans la benne, dehors à gauche de la porte.',
    benne: 'Les bacs à copeaux pleins se vident ici.',
    prepa: 'Un kit = brut + bon outil : donne-le directement à une machine.',
    wc: 'Toilettes sales = opérateurs lents (et Lebec qui râle).',
    radar: 'Au-dessus de 60 km/h, ça flashe. 🤫 Il paraît qu\'une meuleuse traîne dans l\'atelier…',
    frigo: 'Matis travaille beaucoup mieux le ventre plein.',
    mall: 'Pendant le Black Friday, tout est moins cher.',
    gym: 'L\'endurance reste sur ton compte : tu cours plus longtemps dans toutes les parties.',
    planque: 'Les flics ne regardent jamais sous la bâche. Jamais.', distrib: 'Une barre = +25 de faim. Le hot-dog dehors cale mieux.', sieste: 'Quelques secondes de sieste = fatigue à zéro.', poubelles: 'Clic droit pour lancer. Dennis déteste ça.', ring: 'Frappe au bon moment (ESPACE dans la zone verte).'
  };
  const HINT_NPC = {
    lebec: 'Le patron voit tout dans l\'atelier… sauf quand tu chasses un intrus.',
    matis: 'Il ralentit quand il a faim : des viennoiseries le relancent.',
    brieuc: 'Très rapide, mais quand il a la flemme, une claque le relance.',
    amaury: 'Tête en l\'air : vérifie qu\'il usine bien la bonne pièce.',
    jacky: 'Il veut une caisse usinée au MARBRE, et une réponse MIP/MAP.',
    johan: 'Il vole les caisses prêtes. Seule la GRANDE clé à molette (mur gauche) le fait lâcher.',
    bleuenn: 'Elle bricole n\'importe quoi. La GRANDE clé à molette, avant le BOUM !',
    vigile: 'Tant qu\'il est là, Johan Bois n\'entre pas.',
    tony: 'Il charge tout seul les palettes du quai dans le camion.',
    jojo: 'Il livre l\'expédition et passe aussi au TTH.',
    vendeur: 'Le camion sert aux grosses pièces. Le scooter est le moins cher pour livrer.',
    gendarme: 'Un ami en prison ? Payer la caution le fait sortir tout de suite.',
    fred: 'Il te lâche quand ARÉXIS est rempli au PC.',
    herve: 'Imprimante du bureau → signature de Lebec → retour à Hervé.',
    mathieu: 'Écoute-le à la place de l\'opérateur, il le libérera.',
    jeanmi: 'Payé 2,3× plus, mais la police passe : planque + faux programme.', hotdog: 'Un hot-dog = presque plus faim. Le meilleur rapport qualité-prix.', racket: 'Sans la batte de baseball, mieux vaut payer…', squat1: 'Seule la GRANDE clé à molette les fait partir.', squat2: 'Seule la GRANDE clé à molette les fait partir.', dennis: 'Les coups ne servent à rien : lance-lui un sac-poubelle.', flic: 'Ne le frappe pas. Vraiment pas.', barman: 'Les videurs ne plaisantent pas avec la scène.', bookmaker: 'Sur le ring : ESPACE au bon moment.', croupier: 'Le croupier tire jusqu\'à 17.', turfiste: 'Le n°4 paie ×9… mais il ne gagne presque jamais.', preteur: 'Rien de ce qu\'il vend ne sert à quelque chose.'
  };
  const SRC = { viennoiseries: 'à la boulangerie de Mimi', jerrican: 'à la station-service', cle: 'sur le chariot à outils de l\'atelier', extincteur: 'sur le mur gauche de l\'atelier' };
  R.hint = id => {
    const S = S_(); if (!S || !id) return null;
    const [k, a] = id.split(':'), eco = ML.ECO;
    if (HINT_ID[k]) return HINT_ID[k];
    if (k === 'mach') { const M = S.machines[a]; if (!M) return null; return M.op ? 'La barre d\'abord, puis l\'outil. L\'opérateur fait le reste.' : 'Pas d\'opérateur : reste devant pour usiner, ou embauche au PC (👷 Personnel).'; }
    if (k === 'quest') { const Q = S.quest; if (!Q) return null; const w = Q.need || Q.carry; return Q.carry ? 'Arrive avec l\'objet en main : ça se valide tout seul.' : SRC[w] ? `Ça se trouve ${SRC[w]}.` : null; }
    if (k === 'car') return a !== undefined && id.endsWith('bed') ? 'Une caisse par place. Au-delà de 70 km/h, un choc fait tomber les caisses.' : 'F à la pompe pour le plein · V caméra · H klaxon.';
    if (k === 'item') { const it = ML.Game.itemViews[a]; if (!it) return null; if (it.type === 'colis') return 'R pour l\'ouvrir.'; if (it.type === 'palette') return 'Trop lourd pour les bras : fenwick (R pour les fourches).'; if (isPart(it)) return 'Le ticket montre l\'étape suivante (l\'icône en couleur).'; if (it.type === 'brut_sp') return 'Ce brut se met dans une machine comme une barre.'; return null; }
    if (k === 'npc') {
      if (HINT_NPC[a]) return HINT_NPC[a];
      const comp = COMP_OF[a], C = comp && COMP[comp]; if (!C) return null;
      if (C.kind === 'fonderie' || C.kind === 'chaudro') return `Ici : ${(eco.sub || {})[C.kind]} €, le brut sort sur le quai. Depuis le PC : ${(eco.subPC || {})[C.kind]} €, livré à l'atelier.`;
      if (C.kind === 'tth') return `Confie la caisse, attends ${ML.CFG.SUB_SEC} s, et reprends-la ici.`;
      if (C.kind === 'matiere' || C.kind === 'outils') return 'Ici, pas de frais de port ni d\'attente… mais seul le magasinier 📦 est servi.';
      if (C.kind === 'client') return 'Livre à l\'heure : la réputation monte, et les prix avec.';
      if (C.kind === 'concurrent') return 'UsiFlash rachète tes caisses… Lebec n\'aime pas les traîtres.';
    }
    return null;
  };
})();
