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
  R.myRole = myRole;
  const isPart = it => !!it && (it.type === 'caisse' || it.type === 'piece');
  const inv = () => { const S = S_(); return S && S.pl[ML.Game.me] ? S.pl[ML.Game.me].inv : []; };

  function machineLabel(mid, held) {
    const S = S_(), M = S.machines[mid], def = ML.MACHINES.find(m => m.id === mid);
    if (!M) return null;
    if (!M.op) return `${mid} : SANS OPÉRATEUR — embauche au PC de gestion (onglet Personnel)`;
    if (fireAt(mid)) return held && held.type === 'extincteur' ? `🔥 Éteindre : maintiens le CLIC GAUCHE vers le feu` : `🔥 FEU sur ${mid} ! Prends un extincteur (mur gauche)`;
    if (M.broken) return held && held.type === 'cle' ? (myRole() === 'maintenance' ? `🔧 Réparer ${mid} (clé à molette)` : `${mid} en panne : réservé MAINTENANCE 🔧`) : `${mid} EN PANNE : clé à molette (maintenance)`;
    if (M.bin === false || M.chips >= 100) return `🗑 ${mid} bloquée : bac à copeaux ${M.bin === false ? 'ABSENT' : 'PLEIN'} (maintenance)`;
    if (M.worn && M.job) return held && IT.def(held).kind === 'tool' ? `Changer l'outil usé de ${mid}` : `${mid} : outil usé → ${ML.TOOLS[M.job.need].label} neuf(ve)`;
    if (held) {
      const t = IT.def(held);
      if (t.kind === 'brut') return M.job ? `${mid} est occupée` : `Lancer « ${IT.name(held)} » sur ${mid} (${ML.MTYPE[def.type]}) — prise d'origine${M.plan ? ` · prévu : #${M.plan}` : ''}`;
      if (t.kind === 'tool') return !M.job ? `${mid} : donne d'abord un brut` : M.job.tool ? `${mid} a déjà son outil` : `Donner « ${IT.name(held)} » à ${mid}`;
    }
    if (!S.power) return `${mid} : plus de courant !`;
    if (!M.job) return `${mid} ${ML.MTYPE[def.type]} libre — apporte un brut`;
    return `${mid} : #${M.job.oid} ` + (M.job.tool ? `${Math.floor(100 * M.job.prog / M.job.total)} %` : `attend : ${ML.TOOLS[M.job.need].label}`);
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
        return S.evs && S.evs.audit && G.npcDist('jacky') < 6 ? `🔍 Présenter la caisse #${held.d.oid} à Jacky (audit)` : `📏 Contrôler la caisse #${held.d.oid} au pied à coulisse`;
      case 'mach': return machineLabel(a, held);
      case 'bac': {
        const M = S.machines[a]; if (!M) return null;
        if (myRole() !== 'maintenance') return M.chips >= 75 || M.bin === false ? `Bac de ${a} ${M.bin === false ? 'absent' : Math.round(M.chips) + ' %'} — réservé MAINTENANCE 🔧` : null;
        if (M.bin === false) return held && held.type === 'bac_vide' ? `🪣 Remettre le bac sur ${a}` : `Bac de ${a} absent : vide-le à la benne et rapporte-le`;
        return M.chips >= 15 ? `🗑 Prendre le bac de copeaux de ${a} (${Math.round(M.chips)} %)` : null;
      }
      case 'benne': return held && held.type === 'bac_plein' ? '🗑 Vider le bac dans la benne à copeaux' : null;
      case 'item': { const it = G.itemViews[a]; if (!it) return null; if (it.type === 'colis') return `📦 Porter le colis (${it.d.n} articles) · [R] l'OUVRIR`; if (it.type === 'palette') return `🏗 Palette #${it.d.oid} : trop lourd ! Fenwick (cariste)`; return it.type === 'find' ? `★ Ramasser la trouvaille : ${IT.name(it)}` : `Ramasser : ${IT.name(it)}`; }
      case 'car': {
        const c = S.cars[+a]; if (!c) return null;
        if (b === 'door') {
          if (held && held.type === 'jerrican' && c.kind !== 'tp') return `⛽ Verser le jerrican dans ${c.name} (${c.fuel} %)`;
          const V = ML.VEHICLES[c.kind];
          if (c.dr) return V.seats && !(c.pass || []).some(x => x.seat === 'cab') ? `🪑 Monter côté passager (${S.pl[c.dr] ? S.pl[c.dr].name : '?'} conduit)` : `${c.name} (conduit par ${S.pl[c.dr] ? S.pl[c.dr].name : '?'})`;
          if (V.role && myRole() !== V.role) return `${c.name} : réservé au ${ML.ROLES[V.role].icon} ${ML.ROLES[V.role].name.toUpperCase()}`;
          return `Conduire ${c.name}` + (['tp', 'fenwick'].includes(c.kind) ? '' : ` (⛽ ${c.fuel} %)`) + (c.kind === 'fenwick' ? ' — R : fourches' : c.kind === 'camion' ? ' — R : décharger' : '');
        }
        if (c.kind === 'fenwick') return null;
        if (c.kind === 'camion') return c.bed.length ? `Camion : ${c.bed.length} palette(s)` : null;
        if (!held && !c.bed.length && ML.VEHICLES[c.kind].seats > 1 && (c.pass || []).filter(x => x.seat !== 'cab').length < 2) return '🛻 Monter dans la benne';
        if (held && (IT.bulky(held) || held.type === 'piece') && !IT.heavy(held)) return c.bed.length >= c.cap ? (c.kind === 'tp' ? 'Transpalette plein' : 'Benne pleine') : `Charger ${c.kind === 'tp' ? 'sur le transpalette' : 'dans la benne'} (${c.bed.length}/${c.cap})`;
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
        return S.owned.includes(a) ? `✔ ${D.name} : déjà à vous (il attend devant le garage ou à l'atelier)` : `🚗 ${D.name} — ${D.price.toLocaleString('fr-FR')} € : voir la fiche et acheter`;
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
      if (held && ['brut', 'tool'].includes(IT.def(held).kind)) return machineLabel(mid, held);
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
      case 'saboteur': return 'Gars louche… (une claque le ferait fuir)';
      case 'inspecteur': return 'Parler à l\'inspecteur';
    }
    if (ML.PARTICULIERS.includes(n)) {
      const p = (S.parts || []).find(x => x.id === n); if (!p) return null;
      if (p.st === 'wait') return `🙋 ${P_(n).name} : écouter sa demande (${p.price} €)`;
      if (p.st === 'order') return isPart(held) ? `Donner la pièce #${held.d.oid} à ${P_(n).name}` : `${P_(n).name} attend sa pièce (#${p.oid})`;
      return null;
    }
    const comp = COMP_OF[n], C = comp && COMP[comp];
    if (!C) return null;
    switch (C.kind) {
      case 'boulangerie': return 'Prendre des viennoiseries (pour Matis)';
      case 'station': return 'Prendre un jerrican d\'essence (gratuit)';
      case 'matiere': return myRole() === 'magasinier' ? 'Commander de la matière à Eliott (il parle TRÈS vite)' : 'Eliott ne parle qu\'au MAGASINIER 📦';
      case 'outils': return myRole() === 'magasinier' ? 'Acheter des outils (écouter Coco parler boxe 6 s)' : 'Coco ne vend qu\'au MAGASINIER 📦';
      case 'fonderie': case 'chaudro': {
        const list = S.orders.filter(o => stage(o) === comp && !o.q);
        return list.length ? `Commander le brut de ${list.length > 1 ? 'la commande…' : 'la commande #' + list[0].id} (${C.name})` : `${C.name} : aucune commande ne demande ce brut`;
      }
      case 'tth': {
        if (isPart(held)) { const o = G.order(held.d.oid); return o && stage(o) === 'tth' ? `Confier la caisse #${o.id} au traitement thermique` : 'Cette caisse n\'a pas besoin de traitement thermique'; }
        return 'TTH Ouest : apporte une caisse à traiter';
      }
      case 'client': return isPart(held) ? `Livrer la caisse #${held.d.oid} à ${C.name}` : `${C.name} : parler`;
      case 'concurrent': return isPart(held) ? `🕵 Donner la caisse #${held.d.oid} à UsiFlash (trahison !)` : 'Kévin (UsiFlash)';
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
        if (!M.broken && !fireAt(a) && !M.job && held && IT.def(held).kind === 'brut') return Mini.run('origine', {}, r => G.intent({ a: 'use', id, mg: r || 'meh' }));
        break;
      }
      case 'marbre': {
        if (!isPart(held)) break;
        if (S.evs && S.evs.audit && G.npcDist('jacky') < 6) return Mini.run('quiz', {}, ok => { if (ok !== null) G.intent({ a: 'audit', ok: !!ok }); });
        if (!held.d.mes) { ML.HUD.notify('Cette caisse n\'a pas de fiche de cote. Livre-la telle quelle.'); return; }
        return Mini.run('pied', { mes: held.d.mes }, r => { if (r !== null) G.intent({ a: 'use', id, ctl: r }); });
      }
      case 'pc': return ML.ERP.open();
      case 'show': {
        const D = ML.DEALER[a]; if (!D) return;
        if (S.owned.includes(a)) return ML.Dialogue.info(P_('vendeur').name, `${D.name} ? Vous l'avez déjà ! ${ML.line('vendeur')}`);
        const spec = (D.specs || []).map(([k, v]) => `${k} : ${v === 'CAR' || v === 'DUCATO' || v === 'CAMION' ? Math.round(ML.CFG[v].max * 3.6) + ' km/h' : v}`).join(' · ');
        return ML.Dialogue.choice(`${D.name} — ${D.price.toLocaleString('fr-FR')} €`, `${D.desc} ${spec}. Dans la caisse : ${S.money.toLocaleString('fr-FR')} €.`,
          [{ label: S.money >= D.price ? `✅ Acheter (${D.price.toLocaleString('fr-FR')} €)` : `💸 Pas assez d'argent (${D.price.toLocaleString('fr-FR')} €)`, fn: S.money >= D.price ? () => G.intent({ a: 'buycar', k: a }) : null }, { label: 'Juste regarder', fn: null }]);
      }
      case 'panel': if (!S.power) return Mini.run('serrer', { title: '⚡ Réarmer le disjoncteur', text: 'Remonte le levier : tape <b>Espace</b> !', need: 8 }, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); }); break;
      case 'pl': {
        const T = S.pl[a];
        if (!held && myRole() === 'medecin' && T && T.hp < 100) return Mini.run('serrer', { title: `⛑ Soins de ${T.name}`, text: 'Bandage, désinfectant… tape <b>Espace</b> !', need: 10 }, r => { if (r === 'ok') G.intent({ a: 'heal', id: a }); });
        break;
      }
      case 'npc': {
        if (P_(a).op && held && ['brut', 'tool'].includes(IT.def(held).kind) && midOf(a)) return R.use('mach:' + midOf(a));
        if (ML.PARTICULIERS.includes(a)) {
          const p = (S.parts || []).find(x => x.id === a);
          if (p && p.st === 'wait') return ML.Dialogue.choice(P_(a).name, `${ML.line(a, 'demande', 'Bonjour !')} Il me faudrait : « ${p.part} » en ${ML.MATERIALS[p.mat].label} (${ML.MTYPE[p.mtype]}, ${ML.TOOLS[p.tool].label.toLowerCase()}). C'est urgent : ${Math.round(p.dur / 60 * 10) / 10} min maximum. Je paie ${p.price} € !`,
            [{ label: `Accepter (${p.price} €)`, fn: () => G.intent({ a: 'part', id: a, ok: 1 }) }, { label: 'Refuser', fn: () => G.intent({ a: 'part', id: a, ok: 0 }) }, { label: 'Je réfléchis…', fn: null }]);
          break;
        }
        if (a === 'vendeur') {
          const opts = Object.keys(ML.DEALER).map(k => { const D = ML.DEALER[k], own = S.owned.includes(k); return { label: own ? `✔ ${D.name} (déjà à vous)` : `${D.name} — ${D.price.toLocaleString('fr-FR')} € : ${D.desc}`, fn: own ? null : () => G.intent({ a: 'buycar', k }) }; });
          return ML.Dialogue.choice(P_('vendeur').name, `${ML.line('vendeur')} Dans la caisse de l'atelier, vous avez ${S.money.toLocaleString('fr-FR')} €.`, opts.concat([{ label: 'Juste regarder', fn: null }]));
        }
        if (a === 'gendarme') {
          const jailed = Object.keys(S.pl).filter(p => S.pl[p].jail > (G.rt || 0) && p !== G.me), me = S.pl[G.me];
          const txt = (me && me.jail > (G.rt || 0) ? 'Vous, vous restez là. ' : '') + ML.line('gendarme', null, 'Bonjour.') + (S.pedHits && S.pedHits[G.me] ? ` (Passants renversés aujourd'hui : ${S.pedHits[G.me]}/${ML.ECO.jail.peds}. Au ${ML.ECO.jail.peds}e, c'est la garde à vue.)` : '');
          return ML.Dialogue.choice(P_('gendarme').name, txt, jailed.map(p => ({ label: `💶 Payer la caution de ${S.pl[p].name} (${ML.ECO.jail.bail} €)`, fn: () => G.intent({ a: 'bail', id: p }) })).concat([{ label: 'Au revoir, monsieur l\'agent', fn: null }]));
        }
        if (a === 'mathieu') return ML.Dialogue.listen(P_('mathieu').name, [0, 1, 2, 3].map(() => ML.line('mathieu')).concat(['Et… du coup… voilà… quoi.']), 7, () => G.intent({ a: 'mathieu' }), null, () => G.npcDist('mathieu') < 6);
        const comp = COMP_OF[a], C = comp && COMP[comp];
        if (C && (C.kind === 'matiere' || C.kind === 'outils') && myRole() !== 'magasinier') break;
        if (C && C.kind === 'matiere') return ML.Dialogue.supplier(a, (mat, succ) => G.intent({ a: 'eliott', mat, succ }));
        if (C && C.kind === 'outils') return ML.Dialogue.listen(P_('coco').name, [0, 1, 2, 3, 4].map(() => ML.line('coco', 'boxe', 'Jab, jab, uppercut !')), 6, () => { G.intent({ a: 'coco' }); ML.Dialogue.info(P_('coco').name, "Merci de m'avoir écouté ! Ta caisse d'outils est sur le quai. Dépose-la en RÉCEPTION à l'atelier."); }, null, () => G.npcDist(a) < 6);
        if (C && (C.kind === 'fonderie' || C.kind === 'chaudro')) {
          const list = S.orders.filter(o => stage(o) === comp && !o.q);
          if (!list.length) return;
          if (list.length === 1) return G.intent({ a: 'sub', comp, oid: list[0].id });
          return ML.Dialogue.choice(C.name, 'Pour quelle commande ?', list.map(o => ({ label: `#${o.id} — ${o.part} (${COMP[o.client].name})`, fn: () => G.intent({ a: 'sub', comp, oid: o.id }) })).concat([{ label: 'Rien', fn: null }]));
        }
        if (C && C.kind === 'client' && !(isPart(held))) {
          const mine = S.orders.filter(o => o.client === comp);
          return ML.Dialogue.info(C.name, ML.line(a, null, 'Bonjour !') + ' ' + (mine.length ? 'On attend : ' + mine.map(o => `#${o.id} ${o.part}`).join(', ') + '.' : 'Rien en attente pour nous.'));
        }
        break;
      }
    }
    G.intent({ a: 'use', id });
  };
})();
