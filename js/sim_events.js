/* =====================================================================
   sim_events.js — ÉVÉNEMENTS (hôte) tirés au hasard à chaque journée :
   audit surprise de Jacky, coupure de courant, sabotage d'UsiFlash,
   Hervé et sa convention, Fred et Arexis, Mathieu qui parle lentement,
   grosse panne. + mode INSPECTION (boss : règles absurdes) et mode
   TRAÎTRE (un joueur secrètement payé par UsiFlash, vote à la fin).
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U;
  let S, rng, npcs;
  const mod = {};
  const MARBRE = { x: 12, z: 4.6 }, CAB = { x: 2, z: -11.4 }, PC = { x: 17.2, z: 6.5 }, OUT = { x: 0, z: 24 };
  const IN_SPOTS = [{ x: 6, z: -1 }, { x: -8, z: -1.2 }, { x: 10, z: 6 }, { x: -14, z: 7 }, { x: 0, z: 8 }, { x: 14, z: -5 }];

  mod.init = cfg => {
    S = K.S; rng = K.rng; npcs = K.npcs; const g = cfg.game || {};
    S.evs = {}; K.sched = []; K.vcd = {}; K.lastPos = {};
    if (S.mode !== 'course') {
      const pool = K.shuffle(['audit', 'coupure', 'sabotage', 'herve', 'fred', 'mathieu', 'panne']);
      const ev = K.D.events, n = S.mode === 'inspection' ? Math.max(1, ev[0]) : ev[0] + Math.floor(rng() * (ev[1] - ev[0] + 1));   // difficulté : nombre de visiteurs
      const times = []; for (let i = 0; i < n; i++) times.push(60 + rng() * 340);
      times.sort((a, b) => a - b).forEach((t, i) => K.sched.push({ k: pool[i], t: Math.max(t, (K.sched.length ? K.sched[K.sched.length - 1].t : 0) + 45) }));
    }
    if (S.mode === 'inspection') {
      visit('inspecteur').state = 'patrol'; S.rule = rng.pick(Object.keys(ML.RULES)); K.ruleT = 70; S.viol = 0;
      K.big("🎓 L'INSPECTEUR DE L'ÉDUCATION NATIONALE EST LÀ", '#c39bff');
    }
    S.traitorMode = false;
    if (g.traitor) {
      const ids = Object.keys(S.pl);
      if (ids.length >= 3) {
        S.traitorMode = true; K.priv.traitor = rng.pick(ids); K.priv.cuts = 0; K.priv.usi = 0; K.priv.fails = 0;
        K.ev({ e: 'secret', to: K.priv.traitor, s: "Tu es le TRAÎTRE payé par UsiFlash ! Fais rater des tickets sans te faire griller : livre des caisses à Kévin (UsiFlash), « oublie » des caisses, coupe le courant (E sur le tableau électrique)… À la fin, l'équipe vote." });
        K.all("🕵 Mode traître : l'un d'entre vous est payé par UsiFlash… Ouvrez l'œil !", 'warn');
      } else K.all('🕵 Mode traître : il faut au moins 3 joueurs, il est désactivé.', 'info');
    }
  };

  /* ---------- Outils ---------- */
  function visit(id) {
    const n = npcs[id]; Object.assign(n, { active: true, x: OUT.x + (rng() - 0.5) * 3, z: OUT.z, state: 'arrive', path: [], carry: null, stun: 0, speed: id === 'mathieu' ? 1.4 : 2.6 });
    Sim.dirty = true; return n;
  }
  function leave(id, line) {
    const n = npcs[id]; if (!n.active || n.state === 'leave') return;
    if (line) K.say(n, line);
    if (n.carry) { K.spawnItem(n.carry, n.x, 0.8, n.z, [0, 2, 0]); n.carry = null; }
    n.state = 'leave'; n.run = false; K.walkTo(n, OUT.x, OUT.z + 4, () => { n.active = false; n.state = 'away'; Sim.dirty = true; });
    delete S.evs[evOf(id)]; Sim.dirty = true;
  }
  const evOf = id => ({ jacky: 'audit', herve: 'herve', fred: 'fred', mathieu: 'mathieu', saboteur: 'sabotage' }[id] || id);
  K.violation = (pid, rule) => {
    if (S.mode !== 'inspection' || S.rule !== rule || !S.pl[pid]) return;
    const key = pid + rule; if ((K.vcd[key] || 0) > S.rt) return; K.vcd[key] = S.rt + 5;
    S.viol++; S.score = Math.max(0, S.score - 10);
    K.say(npcs.inspecteur, 'Infraction ! ' + ML.RULES[rule], true);
    K.all(`📏 Infraction de ${S.pl[pid].name} : ${ML.RULES[rule]} (−10)`, 'warn'); K.sfx('error'); Sim.dirty = true;
  };

  /* ---------- Démarrage des événements ---------- */
  function start(k) {
    switch (k) {
      case 'audit': {
        const n = visit('jacky'); S.evs.audit = { until: S.rt + 110 };
        K.walkTo(n, MARBRE.x, MARBRE.z, () => { n.state = 'audit'; n.faceYaw = Math.PI; });
        K.big('🔍 AUDIT SURPRISE !', '#ffd257'); K.all('🔍 Jacky Foucher (qualité) arrive : apportez-lui une CAISSE au MARBRE et répondez à sa question !', 'warn'); break;
      }
      case 'coupure':
        S.power = false; S.evs.coupure = { until: S.rt + 999 };
        K.big('⚡ COUPURE DE COURANT !', '#ffd257'); K.all('⚡ Plus de courant ! Réarme le disjoncteur : E sur le TABLEAU ÉLECTRIQUE (mur droit de l\'atelier).', 'warn'); K.sfx('bong'); break;
      case 'sabotage': {
        const n = visit('saboteur'); S.evs.sabotage = { until: S.rt + 80 };
        const crate = S.items.find(o => K.isPart(o) && o.rest && U.inWorkshop(o));
        n.goal = crate ? crate.id : null;
        const t = crate || CAB; K.walkTo(n, t.x, t.z + (crate ? 0.8 : 0.9), () => grab(n), true);
        K.all('🕶 Un gars louche entre dans l\'atelier… (UsiFlash ?)', 'warn'); break;
      }
      case 'herve': {
        const n = visit('herve'); S.evs.herve = { until: S.rt + 150, step: 0 };
        K.walkTo(n, CAB.x, CAB.z + 0.6, () => { n.state = 'block'; n.faceYaw = Math.PI; K.say(n, "Pas de convention, pas d'outils !", true); });
        K.all("📝 Hervé Lehec bloque l'ARMOIRE À OUTILS : imprime la convention (imprimante du bureau), fais-la signer par LEBEC et rapporte-la à Hervé !", 'warn'); break;
      }
      case 'fred': {
        const n = visit('fred'); S.evs.fred = { until: S.rt + 100 };
        K.walkTo(n, PC.x - 1.2, PC.z, () => { n.state = 'follow'; });
        K.all('💼 Fred Castells débarque : remplis ARÉXIS sur le PC (bureau, mur droit) sinon il te colle (et te ralentit) !', 'warn'); break;
      }
      case 'mathieu': {
        const n = visit('mathieu'); S.evs.mathieu = { until: S.rt + 95 };
        const ops = Object.values(npcs).filter(o => o.mid && o.active && o.state === 'work'); const op = rng.pick(ops);
        n.victim = op ? op.id : null;
        if (op) K.walkTo(n, op.x + 1, op.z + (op.z < 0 ? 1 : -1), () => { n.state = 'talk'; if (npcs[n.victim] && npcs[n.victim].state === 'work') { npcs[n.victim].state = 'listen'; K.stop(npcs[n.victim]); } });
        K.all('🐌 Mathieu Riou est là… il a arrêté un opérateur pour lui parler (TRÈS lentement). Va l\'écouter à sa place (E) !', 'warn'); break;
      }
      case 'panne': {
        const ids = Object.keys(S.machines).filter(id => S.machines[id].job) ; const mid = rng.pick(ids.length ? ids : Object.keys(S.machines));
        if (mid) { K.breakMachine(mid, 'grosse panne'); K.startFire(mid); K.big('💥 GROSSE PANNE !', '#ff7a1a'); }
        break;
      }
    }
  }
  function grab(n) {
    if (n.state !== 'arrive') return;
    const crate = n.goal && S.items.find(o => o.id === n.goal && o.rest);
    if (crate && Math.hypot(crate.x - n.x, crate.z - n.z) < 3) { n.carry = K.strip(crate); K.removeItem(crate); K.all('🕶 Le gars louche a PIQUÉ une caisse ! Rattrapez-le et mettez-lui une claque !', 'warn'); }
    else if (S.stock.plaquette > 0) { const q = Math.min(2, S.stock.plaquette); S.stock.plaquette -= q; K.all(`🕶 Le gars louche a piqué ${q} plaquette(s) dans l'armoire !`, 'warn'); }
    K.addPuddle(n.x + 0.5, n.z + 0.5); K.say(n, 'Hé hé hé...');
    n.state = 'flee'; n.fleeT = 0; const L = ML.LOC.comp.usiflash || OUT;
    K.walkTo(n, (L.dock || L).x, (L.dock || L).z, () => escaped(n), true); n.runSpeed = 5.2; n.puddle2 = false;
  }
  function escaped(n) {
    if (n.carry) {
      const o = S.orders.find(x => x.id === n.carry.d.oid);
      if (o) { o.si = o.steps.indexOf(o.src || 'usinage'); o.m = null; o.q = false; K.all(`😡 UsiFlash a volé la caisse #${o.id} : il faut la refaire !`, 'warn'); }
      n.carry = null;
    }
    n.active = false; n.state = 'away'; delete S.evs.sabotage; Sim.dirty = true;
  }

  /* ---------- Cerveaux des visiteurs ---------- */
  mod.brain = (n, dt) => {
    if (n.mid && n.state === 'listen') { n.faceYaw = npcs.mathieu.active ? Math.atan2(npcs.mathieu.x - n.x, npcs.mathieu.z - n.z) : n.faceYaw; return true; }
    if (!ML.PEOPLE[n.id].visitor) return false;
    if (n.state === 'leave' || n.state === 'arrive') return true;
    switch (n.id) {
      case 'saboteur':
        if (n.state === 'flee') {
          n.fleeT += dt;
          if (!n.puddle2 && n.z > 10) { n.puddle2 = true; K.addPuddle(n.x, n.z); }
          if (n.fleeT > 25 || (!n.path.length)) escaped(n);
        }
        return true;
      case 'fred': {
        let best = null, bd = 30;
        for (const pid in K.pose) { const p = K.pose[pid]; if (S.pl[pid] && K.foot(S.pl[pid]) && U.inWorkshop(p)) { const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < bd) { bd = d; best = p; } } }
        if (best && bd > 1.8) { n.path = [{ x: best.x, z: best.z }]; n.onArrive = null; } else if (best) { K.stop(n); n.faceYaw = Math.atan2(best.x - n.x, best.z - n.z); }
        return true;
      }
      case 'inspecteur':
        if (!n.path.length) { n.wait = (n.wait || 0) - dt; if (n.wait <= 0) { const p = rng.pick(IN_SPOTS); K.walkTo(n, p.x, p.z); n.wait = 4 + rng() * 6; } }
        n.barkT = (n.barkT || 8) - dt; if (n.barkT <= 0) { n.barkT = 14 + rng() * 10; K.say(n, U.pick(ML.LINES.inspecteur)); }
        return true;
    }
    return true;
  };
  mod.bubble = n => {
    if (n.mid && n.state === 'listen') return '😐 « …du coup… »';
    switch (n.id) {
      case 'jacky': return n.state === 'audit' ? '🔍 Une caisse au marbre !' : undefined;
      case 'herve': return n.state === 'block' ? '📝 Convention ?' : undefined;
      case 'fred': return n.state === 'follow' ? '💼 Arexis ! ARÉXIS !' : undefined;
      case 'mathieu': return n.state === 'talk' ? '🐌 Alors… euh… du coup…' : undefined;
      case 'saboteur': return n.carry ? '📦 hé hé' : undefined;
      case 'inspecteur': return S.rule ? '📏 ' + ML.RULES[S.rule] : undefined;
    }
    return undefined;
  };

  /* ---------- Boucle ---------- */
  mod.step = dt => {
    while (K.sched.length && S.rt >= K.sched[0].t) start(K.sched.shift().k);
    for (const k in S.evs) {
      const e = S.evs[k]; if (S.rt < e.until) continue;
      if (k === 'audit') { S.score = Math.max(0, S.score - 20); K.all('🔍 Audit raté : personne n\'a présenté de caisse à Jacky (−20).', 'warn'); leave('jacky', 'Je mets un écart. Majeur.'); }
      else if (k === 'herve') leave('herve', 'Bon. Je repasserai. Avec un formulaire.');
      else if (k === 'fred') leave('fred', 'Penses-y, à Naval Group !');
      else if (k === 'mathieu') { endMathieu(); leave('mathieu', 'Bon… du coup… je… vais… y aller.'); }
      else if (k === 'sabotage') escaped(npcs.saboteur);
      delete S.evs[k]; Sim.dirty = true;
    }
    if (S.mode === 'inspection') {
      K.ruleT -= dt;
      if (K.ruleT <= 0) { K.ruleT = 75; S.rule = rng.pick(Object.keys(ML.RULES).filter(r => r !== S.rule)); K.big('📢 NOUVELLE RÈGLE', '#c39bff'); K.all(`📢 L'inspecteur : « ${ML.RULES[S.rule]} »`, 'warn'); Sim.dirty = true; }
      for (const pid in S.pl) {
        const p = K.pose[pid], P = S.pl[pid]; if (!p) continue;
        const lp = K.lastPos[pid], win = !lp || S.rt - lp.t >= 0.6;      // vitesse mesurée sur 0,6 s
        if (win) K.lastPos[pid] = { x: p.x, z: p.z, t: S.rt };
        if (K.foot(P) && U.inWorkshop(p)) {
          if (S.rule === 'no_sprint' && lp && win && Math.hypot(p.x - lp.x, p.z - lp.z) / (S.rt - lp.t) > 7.3) K.violation(pid, 'no_sprint');
          if (S.rule === 'casque' && !P.inv.some(x => x && x.type === 'casque')) { K.casqueT = K.casqueT || {}; K.casqueT[pid] = (K.casqueT[pid] || 0) + dt; if (K.casqueT[pid] > 4) { K.casqueT[pid] = 0; K.violation(pid, 'casque'); } }
        }
        if (S.rule === 'speed30' && P.car !== null && S.cars[P.car] && Math.abs(S.cars[P.car].s || 0) > 8.4) K.violation(pid, 'speed30');
      }
    }
  };

  /* ---------- Intentions ---------- */
  function endMathieu() { const v = npcs[npcs.mathieu.victim]; if (v && v.state === 'listen') K.backToWork(v); }
  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'audit': {
        const n = npcs.jacky; if (!S.evs.audit || n.state !== 'audit' || !K.near(ps, n.x, n.z, 6) || !K.isPart(held)) return true;
        if (m.ok) { S.score += K.points(30); S.sat = Math.min(100, S.sat + 10); K.big('🔍 AUDIT RÉUSSI (+30)', '#3ecf6e'); leave('jacky', 'MIP/MAP irréprochable. Je note : conforme.'); }
        else { S.score = Math.max(0, S.score - 15); K.all(`🔍 Audit raté par ${P.name} (−15)`, 'warn'); leave('jacky', 'Appui plan sur la Réf A ! RÉF A ! Écart majeur.'); }
        return true;
      }
      case 'mathieu': {
        const n = npcs.mathieu; if (!S.evs.mathieu || !K.near(ps, n.x, n.z, 7)) return true;
        endMathieu(); leave('mathieu', 'Merci… du coup… c\'était… bien… voilà.'); S.score += 5; K.note(pid, '🐌 Tu as écouté Mathieu jusqu\'au bout. Héroïque. (+5)', 'good');
        return true;
      }
      case 'vote': {
        const V = S.voting; if (!V || !S.pl[m.id] || V.votes[pid]) return true;
        V.votes[pid] = m.id; K.ev({ e: 'voted', pid, n: Object.keys(V.votes).length }); return true;
      }
    }
    return false;
  };
  mod.use = (pid, P, ps, sel, held, kind, a, b, m) => {
    switch (kind) {
      case 'tool':
        if (S.evs.herve && npcs.herve.state === 'block') { K.say(npcs.herve, "Pas de convention, pas d'outils ! C'est le règlement."); return true; }
        return false;
      case 'printer':
        if (!S.evs.herve) { K.note(pid, "L'imprimante fait « krrrr ». Rien à imprimer."); return true; }
        if (K.give(pid, { type: 'convention', d: { signee: false } }, sel)) K.note(pid, '📝 Convention imprimée : fais-la signer par LEBEC (E sur lui), puis donne-la à Hervé.', 'good');
        return true;
      case 'pc':
        if (S.evs.fred && m.mg === 'ok') { leave('fred', 'Parfait ! Et tu as pensé à Naval Group ?'); S.score += 5; K.all(`💼 ${P.name} a rempli Arexis. Fred s'en va (+5).`, 'good'); }
        else if (!S.evs.fred) K.note(pid, 'Le PC rame. Il y a 47 mises à jour Windows en attente.');
        return true;
      case 'panel':
        if (!S.power && m.mg === 'ok') { S.power = true; delete S.evs.coupure; K.all(`⚡ ${P.name} a réarmé le disjoncteur : le courant est revenu !`, 'good'); K.sfx('success'); }
        else if (S.power && K.priv.traitor === pid) { S.power = false; S.evs.coupure = { until: S.rt + 999 }; K.all('⚡ COUPURE DE COURANT ! (bizarre…) Réarme le disjoncteur au tableau électrique.', 'warn'); K.sfx('bong'); K.priv.cuts++; }
        else if (S.power) K.note(pid, 'Tout est vert. Ne touche à rien.');
        return true;
      case 'marbre': {
        if (!K.isPart(held)) { K.note(pid, 'Pose une CAISSE sur le marbre pour la contrôler au pied à coulisse.'); return true; }
        if (m.ctl === undefined) return true;
        const nc = !!held.d.nc, saidOk = !!m.ctl;
        if (saidOk === !nc) {
          if (nc) {                          // pièce mauvaise bien détectée : rebut, on relance l'usinage
            P.inv[sel] = null; const o = S.orders.find(x => x.id === held.d.oid);
            if (o) { o.si = o.steps.indexOf('usinage'); o.m = null; o.q = false; }
            K.all(`📏 ${P.name} a détecté une pièce NON CONFORME (#${held.d.oid}) : rebut, on la relance en usinage.`, 'good');
          } else { held.d.ctl = true; K.note(pid, '📏 Contrôle OK : caisse marquée « contrôlée » (+5 à la livraison).', 'good'); }
        } else if (!nc) { P.inv[sel] = null; const o = S.orders.find(x => x.id === held.d.oid); if (o) { o.si = o.steps.indexOf('usinage'); o.m = null; o.q = false; } K.all(`📏 ${P.name} a jeté une pièce… qui était bonne ! (#${held.d.oid} à refaire)`, 'warn'); }
        else K.note(pid, '📏 Hmm… tu es sûr·e ? (elle a l\'air un peu hors tolérance)', 'warn');
        Sim.dirty = true; return true;
      }
    }
    return false;
  };
  mod.npcUse = (pid, P, ps, sel, held, n) => {
    if (n.id === 'lebec') {
      if (K.violation) K.violation(pid, 'no_lebec');
      if (held && held.type === 'convention' && !held.d.signee) { held.d.signee = true; Sim.dirty = true; K.say(n, 'Encore de la paperasse ! Bon… SIGNÉ. Et que ça saute !'); return true; }
      return false;
    }
    if (n.id === 'herve') {
      if (held && held.type === 'convention' && held.d.signee) { P.inv[sel] = null; S.score += 10; K.all(`📝 Convention signée remise à Hervé par ${P.name} : l'armoire est libre (+10) !`, 'good'); leave('herve', 'Parfait ! Bon stage !'); return true; }
      K.say(n, held && held.type === 'convention' ? "Elle n'est pas signée ! Par M. Lebec, s'il vous plaît." : U.pick(ML.LINES.herve)); return true;
    }
    if (n.id === 'jacky') { K.say(n, S.evs.audit ? 'Une CAISSE. Au MARBRE. Maintenant.' : U.pick(ML.LINES.jacky)); return true; }
    if (n.id === 'fred') { K.say(n, U.pick(ML.LINES.fred)); return true; }
    if (n.id === 'inspecteur') { K.say(n, U.pick(ML.LINES.inspecteur)); return true; }
    if (n.id === 'saboteur') { K.say(n, U.pick(ML.LINES.saboteur)); return true; }
    if (n.id === 'kevin' && K.priv.traitor === pid && !held) { K.say(n, 'Chut. Apporte-moi leurs caisses, je te paie en croissants.'); return true; }
    return false;
  };
  mod.npcHit = (n, by) => {
    if (n.id === 'saboteur') {
      if (n.carry) { K.spawnItem(n.carry, n.x, 0.8, n.z, [0, 2, 0]); n.carry = null; K.all(`👊 ${S.pl[by] ? S.pl[by].name : '?'} a fait lâcher la caisse au saboteur !`, 'good'); }
      K.say(n, 'Aïe ! Je me casse !'); n.state = 'flee'; n.fleeT = 18; return true;
    }
    if (n.id === 'mathieu') { endMathieu(); leave('mathieu', 'Ah… bon… du coup… je… m\'en vais.'); return false; }
    if (n.id === 'inspecteur') { S.score = Math.max(0, S.score - 20); S.viol++; K.say(n, 'OUTRAGE À FONCTIONNAIRE !', true); K.all('🎓 Claque à l\'inspecteur : −20 et une infraction.', 'warn'); return false; }
    return false;
  };
  mod.onHit = pid => { if (K.violation) K.violation(pid, 'no_hit'); };
  mod.workMult = (n, k) => (n.state === 'listen' ? 0 : k);

  /* ---------- Fin de journée : inspection, vote du traître ---------- */
  mod.onEnd = res => {
    if (S.mode === 'inspection') {
      res.inspection = { viol: S.viol, pass: S.viol <= 4 && res.score >= res.need[0] };
      if (res.inspection.pass) for (const p in S.pl) K.stat(p, 'inspection');
    }
    if (K.priv.traitor && S.pl[K.priv.traitor] && Object.keys(S.pl).length >= 3) res.vote = true;
  };
  mod.voteStep = () => {
    const V = S.voting, ids = Object.keys(S.pl);
    if (Object.keys(V.votes).length < ids.length && S.rt < V.until) return;
    const count = {}; for (const v in V.votes) count[V.votes[v]] = (count[V.votes[v]] || 0) + 1;
    const top = Object.keys(count).sort((a, b) => count[b] - count[a]), tid = K.priv.traitor;
    const caught = top.length > 0 && top[0] === tid && (top.length === 1 || count[top[0]] > count[top[1]]);
    const res = V.res; res.traitor = { id: tid, name: S.pl[tid] ? S.pl[tid].name : '?', caught, fails: K.priv.fails || 0, cuts: K.priv.cuts || 0, usi: K.priv.usi || 0, votes: count };
    if (caught) res.score += 40; else K.stat(tid, 'traitor_win');
    S.voting = null; S.over = true; Sim.dirty = true; K.ev({ e: 'end', res });
  };
  Sim.mods.push(mod);
})();
