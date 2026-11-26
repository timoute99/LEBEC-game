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
  const opName = npc => (npc && npc.startsWith('app') && S_().appNames ? S_().appNames[npc] : short(npc));
  const fireAt = mid => (S_().fires || []).find(f => f.mid === mid);
  const myRole = () => { const S = S_(); return S && S.pl[ML.Game.me] ? S.pl[ML.Game.me].role : 'poly'; };
  R.myRole = myRole;
  const isPart = it => !!it && (it.type === 'caisse' || it.type === 'piece');
  /* ---------- Gammes (sim.js : ML.Sim.K.curOp / opIdx / isManual, fonctions pures) ---------- */
  const K_ = () => ML.Sim.K;
  const defOf = mid => { const S = S_(); return (S && S.machDefs && S.machDefs.find(m => m.id === mid)) || ML.MACHINES.find(m => m.id === mid) || {}; };
  const loadable = it => !!it && (IT.def(it).kind === 'brut' || it.type === 'encours');
  /** Commande que ce brut / cet en-cours lancerait sur cette machine (même règle que l'hôte), ou null */
  function orderFor(mid, held) {
    const S = S_(), def = defOf(mid), K = K_(); if (!held || !S) return null;
    if (held.type === 'encours') { const o = S.orders.find(x => x.id === held.d.oid); return o && stage(o) === 'usinage' && !o.m && o.mtype === def.type ? o : null; }
    if (held.type === 'brut_sp') { const o = S.orders.find(x => x.id === held.d.oid && stage(x) === 'usinage' && !x.m && K.opIdx(x) === 0); return o && o.mtype === def.type ? o : null; }
    const mat = IT.def(held).mat;
    return S.orders.filter(x => stage(x) === 'usinage' && !x.src && !x.m && x.mat === mat && K.opIdx(x) === 0 && x.mtype === def.type).sort((p, q) => p.dl - q.dl)[0] || null;
  }
  R.orderFor = orderFor;
  const opOf = id => (ML.OPS[id] || { n: 'Usinage', ic: '🛠' });

  function machineLabel(mid, held) {
    const S = S_(), M = S.machines[mid], def = ML.MACHINES.find(m => m.id === mid);
    if (!M) return null;
    if (fireAt(mid)) return held && held.type === 'extincteur' ? `🔥 Éteindre : maintiens le CLIC GAUCHE vers le feu` : `🔥 FEU sur ${mid} ! Prends un extincteur (mur gauche)`;
    if (M.broken) return held && held.type === 'cle' ? (myRole() === 'maintenance' ? `🔧 Réparer ${mid} (clé à molette)` : `${mid} en panne : réservé MAINTENANCE 🔧`) : `${mid} EN PANNE : clé à molette (maintenance)`;
    if (held && held.type === 'cle' && ML.Place) { const u = ML.Place.uninstallLabel(mid, M); if (u) return u; }   // carrière : désinstaller (sim_build.js)
    if (M.bin === false || M.chips >= 100) return `🗑 ${mid} bloquée : bac à copeaux ${M.bin === false ? 'ABSENT' : 'PLEIN'} (maintenance)`;
    if (M.worn && M.job) return held && IT.def(held).kind === 'tool' ? `Changer l'outil usé de ${mid}` : `${mid} : outil usé → ${ML.TOOLS[M.job.need].label} neuf(ve)`;
    const man = K_().isManual(def), j = M.job, OP = j && opOf(j.op);
    if (held) {
      const t = IT.def(held);
      if (loadable(held)) {
        if (j) return `${mid} est occupée (#${j.oid} : ${OP.n})`;
        const o = orderFor(mid, held);
        if (!o) { const oo = held.type === 'encours' && S.orders.find(x => x.id === held.d.oid); return oo && oo.mtype ? `#${oo.id} : prochaine op sur une ${ML.MTYPE[oo.mtype]}, pas ici !` : `Rien à lancer sur ${mid} avec ça (regarde les tickets)`; }
        const N = opOf(K_().curOp(o));
        return `Charger #${o.id} sur ${mid} : ${N.ic} ${N.n}` + (man ? ' (manuelle : à piloter)' : M.ref === o.part ? ' — programme déjà réglé ✔' : ' — RÉGLAGE CN (nouvelle référence)');
      }
      if (t.kind === 'tool') return !j ? `${mid} : donne d'abord un brut ou un en-cours` : j.tool ? `${mid} a déjà son outil` : t.tool === j.need ? `Monter « ${IT.name(held)} » sur ${mid} (${OP.n})` : `${OP.n} demande : ${ML.TOOLS[j.need].label}`;
    }
    if (!S.power) return `${mid} : plus de courant !`;
    if (!j) return `${mid} ${ML.MTYPE[def.type]}${man ? ' manuelle' : ''} libre — apporte un brut ou un en-cours`;
    const pct = Math.floor(100 * j.prog / j.total);
    if (!j.tool) return `${mid} : #${j.oid} ${OP.ic} ${OP.n} — attend : ${ML.TOOLS[j.need].label}`;
    if (man) return M.pilot ? `🕹 ${M.pilot.name} est aux commandes de ${mid}…` : `🕹 PRENDRE LES COMMANDES : ${OP.ic} ${OP.n} #${j.oid} (${pct} %)`;
    return `${mid} : #${j.oid} ${OP.ic} ${OP.n} ${pct} %`;
  }
  /* ---------- Étiquettes 3D des machines : op de gamme, avancement, ce qu'il manque ---------- */
  R.machTag = (id, S) => {
    const M = S.machines[id]; if (!M || !M.job) return null;
    const st = M.status, j = M.job; if (['panne', 'off', 'usure', 'bac'].includes(st)) return null;
    const man = K_().isManual(defOf(id)), OP = opOf(j.op), o = (S.orders || []).find(x => x.id === j.oid);
    const pct = Math.floor(100 * j.prog / (j.total || 1)), t = `${id} · #${j.oid} ${OP.ic} ${OP.n}${o && o.ops && o.ops.length > 1 ? ` (${(j.oi || 0) + 1}/${o.ops.length})` : ''} · `;
    if (!j.tool) return [t + `→ ${ML.TOOLS[j.need].label} ?`, '#ffd27a'];
    if (M.pilot) return [t + `${pct}% · 🕹 ${M.pilot.name} pilote`, '#9dffb8'];
    if (man && st !== 'run') return [t + `${pct}% · 👤 PILOTE REQUIS (E)`, '#ffd27a'];
    if (man) return [t + `${pct}% · 🐢 ouvrier seul (E : piloter)`, '#9dffb8'];
    return [t + `${pct}%` + (st === 'stop' ? ' · opérateur absent !' : ''), st === 'run' ? '#9dffb8' : '#ff9f9f'];
  };
  (function wrapTags() {
    const W = ML.World; if (!W || !W.updateVisuals || W._tagWrap) return;
    const base = W.updateVisuals; W._tagWrap = true;
    W.updateVisuals = (dt, S, rt) => {
      const tags = {};
      if (S && S.machines && W.machines) for (const id in W.machines) {
        const lab = W.machines[id].label; if (!lab || !lab.setText) continue;
        if (!lab._set) { lab._set = lab.setText; lab.setText = function (t, fg, bg) { if (!this._ovr) this._set(t, fg, bg); }; }
        const r = R.machTag(id, S); lab._ovr = !!r; if (r) tags[id] = r;
      }
      base(dt, S, rt);
      for (const id in tags) W.machines[id].label._set(tags[id][0], tags[id][1]);
    };
  })();

  /** Texte affiché pour une cible, ou null si rien à faire */
  R.label = id => {
    const G = ML.Game, S = G.S; if (!S) return null;
    const held = G.held(), [kind, a, b] = id.split(':');
    switch (kind) {
      case 'rack': return `Prendre un brut ${ML.MATERIALS[a].label} (stock : ${S.stock[a]})`;
      case 'tool': return S.evs && S.evs.herve ? '🔒 Armoire bloquée par Hervé : il veut sa convention !' : `Prendre : ${ML.TOOLS[a].label} (stock : ${S.stock[a]})`;
      case 'coffee': return `Café : sprint plus long (${S.up && S.up.cafe_pro ? 90 : 40} s)`;
      case 'frigo': return 'Frigo : prendre des viennoiseries';
      case 'casques': return 'Prendre un casque de sécurité';
      case 'reception': return held && held.type === 'matiere' ? 'Déposer la caisse en réception (+ stock)' : null;
      case 'printer': return S.evs && S.evs.herve ? '📝 Imprimer la convention de stage' : null;
      case 'pc': return S.evs && S.evs.fred ? '💻 Remplir ARÉXIS (Fred partira)' : (S.car && !ML.World.target('be') ? '💻 PC du BE : allumer LebecOS 95' : null);
      case 'be': return S.car ? '💻 PC du BE : allumer LebecOS 95' : null; // V5 (be.js)
      case 'panel': return !S.power ? '⚡ Réarmer le disjoncteur' : G.traitor ? '🕵 Couper le courant (discrètement…)' : null;
      case 'marbre':
        if (held && held.type === 'encours') return `📏 Contrôler l'en-cours #${held.d.oid} au pied à coulisse (rebut détecté = gamme relancée)`;
        if (!isPart(held)) return S.evs && S.evs.audit ? '🔍 Jacky attend une CAISSE ici' : null;
        return S.evs && S.evs.audit && G.npcDist('jacky') < 6 ? `🔍 Présenter la caisse #${held.d.oid} à Jacky (audit)` : `📏 Contrôler la caisse #${held.d.oid} au pied à coulisse`;
      case 'mach': return machineLabel(a, held);
      case 'bac': {
        const M = S.machines[a]; if (!M) return null;
        if (myRole() !== 'maintenance') return M.chips >= 75 || M.bin === false ? `Bac de ${a} ${M.bin === false ? 'absent' : Math.round(M.chips) + ' %'} — réservé MAINTENANCE 🔧` : null;
        if (M.bin === false) return held && held.type === 'bac_vide' ? `🪣 Remettre le bac sur ${a}` : `Bac de ${a} absent : vide-le à la benne et rapporte-le`;
        return M.chips >= 15 ? `🗑 Prendre le bac de copeaux de ${a} (${Math.round(M.chips)} %)` : null;
      }
      case 'benne': return held && held.type === 'rebut' ? `♻ Jeter le rebut #${held.d.oid} (la ferraille rembourse un peu)` : held && held.type === 'bac_plein' ? '🗑 Vider le bac dans la benne à copeaux' : null;
      case 'item': { const it = G.itemViews[a]; if (!it) return null; if (it.type === 'machine' && ML.Place) return ML.Place.crateLabel(it); if (it.type === 'palette') return `🏗 Palette #${it.d.oid} : trop lourd ! Fenwick (cariste)`; return it.type === 'find' ? `★ Ramasser la trouvaille : ${IT.name(it)}` : `Ramasser : ${IT.name(it)}`; }
      case 'car': {
        const c = S.cars[+a]; if (!c) return null;
        if (ML.Law && ML.Law.hasHose() && (b === 'door' ? !(held && held.type === 'jerrican') : !held && !c.bed.length)) return '🔴 Soufflette en main : le tuyau est trop court !';
        if (b === 'door') {
          if (held && held.type === 'jerrican' && c.kind !== 'tp') return `⛽ Verser le jerrican dans ${c.name} (${c.fuel} %)`;
          const V = ML.VEHICLES[c.kind];
          if (c.dr) return V.seats && !(c.pass || []).some(x => x.seat === 'cab') ? `🪑 Monter côté passager (${S.pl[c.dr] ? S.pl[c.dr].name : '?'} conduit)` : `${c.name} (conduit par ${S.pl[c.dr] ? S.pl[c.dr].name : '?'})`;
          if (V.role && myRole() !== V.role) return `${c.name} : réservé au ${ML.ROLES[V.role].icon} ${ML.ROLES[V.role].name.toUpperCase()}`;
          return `Conduire ${c.name}` + (['tp', 'fenwick'].includes(c.kind) ? '' : ` (⛽ ${c.fuel} %)`) + (c.kind === 'fenwick' ? ' — R : fourches' : c.kind === 'tp' && S.machDefs ? ' — R : lever une caisse machine' : c.kind === 'camion' ? ' — R : décharger' : '');
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
      case 'caution': return ML.Law ? ML.Law.label() : null;   // sim_law.js : caution à la gendarmerie
    }
    return null;
  };

  function npcLabel(n, held) {
    const S = S_(), G = ML.Game, st = (G.npcViews[n] || {}).st, mid = midOf(n);
    if (P_(n).op) {
      if (!mid) return null;
      if (st === 'p' || st === 'f') return `Secouer ${opName(n)} (« au boulot ! »)`;
      if (held && held.type === 'viennoiseries' && ML.PEOPLE[n] && ML.PEOPLE[n].op && ML.PEOPLE[n].op.traits.includes('hungry')) return 'Donner les viennoiseries à Matis (+40 % vitesse)';
      if (held && (['brut', 'tool'].includes(IT.def(held).kind) || held.type === 'encours')) return machineLabel(mid, held);
      return `Parler à ${opName(n)}`;
    }
    switch (n) {
      case 'lebec': return held && held.type === 'convention' && !held.d.signee ? '✍ Faire signer la convention à Lebec' : S.rule === 'no_lebec' ? 'Parler à Lebec (INTERDIT par l\'inspecteur !)' : 'Parler à François Lebec';
      case 'jacky': return 'Jacky : apporte une caisse au MARBRE';
      case 'herve': return held && held.type === 'convention' ? (held.d.signee ? '📝 Rendre la convention SIGNÉE à Hervé' : 'La convention n\'est pas signée (Lebec !)') : 'Hervé : « La convention ? »';
      case 'fred': return 'Fred : « Arexis ! » (remplis-le sur le PC)';
      case 'mathieu': return '🐌 Écouter Mathieu à la place de l\'opérateur';
      case 'saboteur': return 'Gars louche… (une claque le ferait fuir)';
      case 'inspecteur': return 'Parler à l\'inspecteur';
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
        if (S.machDefs && S.car && !M.broken && !fireAt(a) && held && held.type === 'cle') return G.intent({ a: 'uninstall', mid: a });   // sim_build.js
        if (M.broken && held && held.type === 'cle' && !fireAt(a)) return Mini.run('serrer', { title: `🔧 Réparation de ${a}` }, r => { if (r === 'ok') G.intent({ a: 'repair', mid: a }); else if (r) ML.HUD.notify('Trop lent ! Recommence (E).', 'warn'); });
        // mini-jeux 3D (minigames3d.js) : outil usé → changement de plaquette / touret ; brut → usinage manuel ou réglage CN. Repli 2D si WebGL absent.
        if (!M.broken && !fireAt(a) && M.worn && held && M.job && IT.def(held).kind === 'tool' && IT.def(held).tool === M.job.need) {
          if (ML.Mini3D && ML.Mini3D.machine(a, held, 'worn', (r, sc, ab) => { if (ab) ML.HUD.notify("Changement d'outil abandonné.", 'warn'); else G.intent({ a: 'use', id, mg: r }); })) return;
          if (M.job.need === 'plaquette') return Mini.run('plaquette', {}, r => { if (r) G.intent({ a: 'use', id, mg: r }); });
        }
        // brut ou en-cours : CN → réglage (mini-jeu) seulement pour une NOUVELLE référence ; manuelle → direct (on usinera aux commandes)
        if (!M.broken && !fireAt(a) && !M.job && loadable(held)) {
          const o = orderFor(a, held);
          if (!o || ML.Sim.K.isManual(defOf(a))) break;
          if (M.ref === o.part) { ML.HUD.notify(`✔ ${a} : même référence (${o.part}), programme déjà réglé.`, 'good'); break; }
          if (ML.Mini3D && ML.Mini3D.machine(a, held, 'load', (r, sc) => G.intent({ a: 'use', id, mg: r || 'fail', sc }))) return;
          return Mini.run('origine', {}, r => G.intent({ a: 'use', id, mg: r || 'meh' }));
        }
        // machine MANUELLE en cours : le joueur prend les commandes (mini-jeu de l'op : chariotage, contournage, perçage…)
        if (!M.broken && !fireAt(a) && M.job && M.job.man && M.job.tool && !(held && (loadable(held) || IT.def(held).kind === 'tool' || held.type === 'cle'))) {
          if (M.pilot && M.pilot.pid !== G.me) { ML.HUD.notify(`${M.pilot.name} est déjà aux commandes de ${a}.`, 'warn'); return; }
          const oid = M.job.oid; G.intent({ a: 'use', id, pilot: 'start' });
          if (ML.Mini3D && ML.Mini3D.machine(a, null, 'pilot', (r, sc, ab) => G.intent({ a: 'use', id, pilot: ab ? 'abandon' : r || 'fail', sc, oid }))) return;
          return Mini.run('origine', {}, r => G.intent({ a: 'use', id, pilot: r || 'meh', oid }));
        }
        break;
      }
      case 'marbre': {
        if (!isPart(held) && !(held && held.type === 'encours')) break;
        if (S.evs && S.evs.audit && G.npcDist('jacky') < 6) return Mini.run('quiz', {}, ok => { if (ok !== null) G.intent({ a: 'audit', ok: !!ok }); });
        if (!held.d.mes) { ML.HUD.notify('Cette caisse n\'a pas de fiche de cote. Livre-la telle quelle.'); return; }
        return Mini.run('pied', { mes: held.d.mes }, r => { if (r !== null) G.intent({ a: 'use', id, ctl: r }); });
      }
      case 'pc': if (S.evs && S.evs.fred) return Mini.run('arexis', {}, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); }); if (S.car && ML.CareerUI && !ML.World.target('be')) ML.CareerUI.open(); break;
      case 'be': if (S.car && ML.CareerUI) ML.CareerUI.open(); break; // V5 : PC du BE (be.js)
      case 'panel': if (!S.power) return Mini.run('serrer', { title: '⚡ Réarmer le disjoncteur', text: 'Remonte le levier : tape <b>Espace</b> !', need: 8 }, r => { if (r === 'ok') G.intent({ a: 'use', id, mg: 'ok' }); }); break;
      case 'pl': {
        const T = S.pl[a];
        if (!held && myRole() === 'medecin' && T && T.hp < 100) return Mini.run('serrer', { title: `⛑ Soins de ${T.name}`, text: 'Bandage, désinfectant… tape <b>Espace</b> !', need: 10 }, r => { if (r === 'ok') G.intent({ a: 'heal', id: a }); });
        break;
      }
      case 'npc': {
        if (P_(a).op && held && (['brut', 'tool'].includes(IT.def(held).kind) || held.type === 'encours') && midOf(a)) return R.use('mach:' + midOf(a));
        if (a === 'mathieu') return ML.Dialogue.listen(P_('mathieu').name, ML.LINES.mathieu.concat(['Et… du coup… voilà… quoi.']), 7, () => G.intent({ a: 'mathieu' }), null, () => G.npcDist('mathieu') < 6);
        const comp = COMP_OF[a], C = comp && COMP[comp];
        if (C && (C.kind === 'matiere' || C.kind === 'outils') && myRole() !== 'magasinier') break;
        if (C && C.kind === 'matiere') return ML.Dialogue.supplier(a, (mat, succ) => G.intent({ a: 'eliott', mat, succ }));
        if (C && C.kind === 'outils') return ML.Dialogue.listen(P_('coco').name, ML.LINES.cocoBoxe, 6, () => { G.intent({ a: 'coco' }); ML.Dialogue.info(P_('coco').name, "Merci de m'avoir écouté ! Ta caisse d'outils est sur le quai. Dépose-la en RÉCEPTION à l'atelier."); }, null, () => G.npcDist(a) < 6);
        if (C && (C.kind === 'fonderie' || C.kind === 'chaudro')) {
          const list = S.orders.filter(o => stage(o) === comp && !o.q);
          if (!list.length) return;
          if (list.length === 1) return G.intent({ a: 'sub', comp, oid: list[0].id });
          return ML.Dialogue.choice(C.name, 'Pour quelle commande ?', list.map(o => ({ label: `#${o.id} — ${o.part} (${COMP[o.client].name})`, fn: () => G.intent({ a: 'sub', comp, oid: o.id }) })).concat([{ label: 'Rien', fn: null }]));
        }
        if (C && C.kind === 'client' && !(isPart(held))) {
          const mine = S.orders.filter(o => o.client === comp);
          return ML.Dialogue.info(C.name, ML.U.pick(ML.LINES[a] || ['Bonjour !']) + ' ' + (mine.length ? 'On attend : ' + mine.map(o => `#${o.id} ${o.part}`).join(', ') + '.' : 'Rien en attente pour nous.'));
        }
        break;
      }
    }
    if (kind === 'item' && ML.Place && ML.Place.use(a)) return;   // caisse machine dans l'atelier → installer (sim_build.js)
    G.intent({ a: 'use', id });
  };
})();
