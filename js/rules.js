/* =====================================================================
   rules.js — Côté CLIENT : texte des actions [E] (calculé à partir de
   l'état reçu de l'hôte) et déclenchement : soit une intention envoyée
   à l'hôte, soit une petite interface locale (mini-jeux, choix).
   La vraie logique (ce qui se passe) est dans sim.js, chez l'hôte.
   ===================================================================== */
(function () {
  const R = ML.Rules = {};
  const IT = ML.Items, COMP = ML.COMPANIES;
  const stage = o => o.steps[o.si];
  const short = id => ML.PEOPLE[id].name.split(' ')[0] === 'M.' || ML.PEOPLE[id].name.startsWith('Mme') || ML.PEOPLE[id].name.startsWith('Accueil') ? ML.PEOPLE[id].name : ML.PEOPLE[id].name.split(' ')[0];
  R.short = short;
  const OPS = { amaury: 'T1', marius: 'T2', matis: 'F1', brieuc: 'F2' };
  const COMP_OF = {}; for (const k in COMP) COMP_OF[COMP[k].npc] = k;
  R.compOf = npc => COMP_OF[npc];

  function machineLabel(mid, held) {
    const S = ML.Game.S, M = S.machines[mid], def = ML.MACHINES.find(m => m.id === mid);
    if (held) {
      const t = IT.def(held);
      if (t.kind === 'brut') return M.job ? `${mid} est occupée` : `Lancer « ${IT.name(held)} » sur ${mid} (${ML.MTYPE[def.type]})`;
      if (t.kind === 'tool') return !M.job ? `${mid} : donne d'abord un brut` : M.job.tool ? `${mid} a déjà son outil` : `Donner « ${IT.name(held)} » à ${mid}`;
    }
    if (!M.job) return `${mid} ${ML.MTYPE[def.type]} libre — apporte un brut`;
    return `${mid} : #${M.job.oid} ` + (M.job.tool ? `${Math.floor(100 * M.job.prog / M.job.total)} %` : `attend : ${ML.TOOLS[M.job.need].label}`);
  }

  /** Texte affiché pour une cible, ou null si rien à faire */
  R.label = id => {
    const G = ML.Game, S = G.S; if (!S) return null;
    const held = G.held(), [kind, a, b] = id.split(':');
    switch (kind) {
      case 'rack': return `Prendre un brut ${ML.MATERIALS[a].label} (stock : ${S.stock[a]})`;
      case 'tool': return `Prendre : ${ML.TOOLS[a].label} (stock : ${S.stock[a]})`;
      case 'coffee': return 'Café : sprint plus long (40 s)';
      case 'reception': return held && held.type === 'matiere' ? 'Déposer la caisse en réception (+ stock)' : null;
      case 'mach': return machineLabel(a, held);
      case 'item': { const it = G.itemViews[a]; if (!it) return null; return it.type === 'find' ? `★ Ramasser la trouvaille : ${IT.name(it)}` : `Ramasser : ${IT.name(it)}`; }
      case 'car': {
        const c = S.cars[+a]; if (!c) return null;
        if (b === 'door') return c.dr ? `${c.name} (conduite par ${S.pl[c.dr] ? S.pl[c.dr].name : '?'})` : `Conduire ${c.name}`;
        if (held && IT.bulky(held)) return c.bed.length >= ML.CFG.CAR.cap ? 'Benne pleine' : `Charger dans la benne (${c.bed.length}/${ML.CFG.CAR.cap})`;
        return c.bed.length ? `Décharger une caisse (${c.bed.length} dans la benne)` : null;
      }
      case 'pl': { const p = S.pl[a]; if (!p || !held) return null; return `Passer « ${IT.name(held)} » à ${p.name}`; }
      case 'npc': return npcLabel(a, held);
    }
    return null;
  };

  function npcLabel(n, held) {
    const S = ML.Game.S, st = (ML.Game.npcViews[n] || {}).st;
    if (OPS[n]) {
      if (st === 'p' || st === 'f') return `Secouer ${short(n)} (« au boulot ! »)`;
      if (held && held.type === 'viennoiseries' && n === 'matis') return 'Donner les viennoiseries à Matis (+40 % vitesse)';
      if (held && ['brut', 'tool'].includes(IT.def(held).kind)) return machineLabel(OPS[n], held);
      return `Parler à ${short(n)}`;
    }
    const comp = COMP_OF[n], C = comp && COMP[comp];
    if (n === 'lebec') return 'Parler à François Lebec';
    if (!C) return null;
    switch (C.kind) {
      case 'boulangerie': return 'Prendre des viennoiseries (pour Matis)';
      case 'matiere': return "Commander de la matière à Eliott (il parle TRÈS vite)";
      case 'outils': return "Acheter des outils (écouter Coco parler boxe 6 s)";
      case 'fonderie': case 'chaudro': {
        const list = S.orders.filter(o => stage(o) === comp && !o.q);
        return list.length ? `Commander le brut de ${list.length > 1 ? 'la commande…' : 'la commande #' + list[0].id} (${C.name})` : `${C.name} : aucune commande ne demande ce brut`;
      }
      case 'tth': {
        if (held && held.type === 'caisse') { const o = ML.Game.order(held.d.oid); return o && stage(o) === 'tth' ? `Confier la caisse #${o.id} au traitement thermique` : 'Cette caisse n\'a pas besoin de traitement thermique'; }
        return 'TTH Ouest : apporte une caisse à traiter';
      }
      case 'client': return held && held.type === 'caisse' ? `Livrer la caisse #${held.d.oid} à ${C.name}` : `${C.name} : parler`;
    }
    return null;
  }

  /** Action [E] sur une cible */
  R.use = id => {
    const G = ML.Game, S = G.S, [kind, a] = id.split(':');
    if (kind === 'npc') {
      const comp = COMP_OF[a], C = comp && COMP[comp];
      if (C && C.kind === 'matiere') return ML.Dialogue.supplier(a, (mat, succ) => G.intent({ a: 'eliott', mat, succ }));
      if (C && C.kind === 'outils') return ML.Dialogue.listen(ML.PEOPLE.coco.name, ML.LINES.cocoBoxe, 6, () => { G.intent({ a: 'coco' }); ML.Dialogue.info(ML.PEOPLE.coco.name, "Merci de m'avoir écouté ! Ta caisse d'outils est sur le quai. Dépose-la en RÉCEPTION à l'atelier."); }, null, () => G.npcDist(a) < 6);
      if (C && (C.kind === 'fonderie' || C.kind === 'chaudro')) {
        const list = S.orders.filter(o => stage(o) === comp && !o.q);
        if (!list.length) return;
        if (list.length === 1) return G.intent({ a: 'sub', comp, oid: list[0].id });
        return ML.Dialogue.choice(C.name, 'Pour quelle commande ?', list.map(o => ({ label: `#${o.id} — ${o.part} (${COMP[o.client].name})`, fn: () => G.intent({ a: 'sub', comp, oid: o.id }) })).concat([{ label: 'Rien', fn: null }]));
      }
      if (C && C.kind === 'client' && !(G.held() && G.held().type === 'caisse')) {
        const mine = S.orders.filter(o => o.client === comp);
        return ML.Dialogue.info(C.name, U_pick(ML.LINES[a]) + ' ' + (mine.length ? 'On attend : ' + mine.map(o => `#${o.id} ${o.part}`).join(', ') + '.' : 'Rien en attente pour nous.'));
      }
    }
    G.intent({ a: 'use', id });
  };
  const U_pick = a => (a && a.length ? a[Math.floor(Math.random() * a.length)] : '');
})();
