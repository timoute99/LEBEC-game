/* =====================================================================
   sim_vie.js — V5.2 : LA VIE AUTOUR DE L'ATELIER (hôte)
   - Johan Bois : vole les caisses PRÊTES (claque = il lâche) ; le vigile
     (abonnement au PC) le refoule à l'entrée ;
   - Bleuenn : branche un drôle d'appareil sur le tableau électrique…
     BOUM : plus de courant, machines en arrêt (E sur chacune) ;
   - les TOILETTES se salissent (les opérateurs ralentissent) : on nettoie ;
   - QUÊTES SECONDAIRES : un PNJ vient au comptoir demander un service
     (apporter un objet, livrer un carton, réparer…) ailleurs sur la carte ;
   - SAE : pièces à usiner et à présenter au jury (Garnier, Fanfrelat) :
     la note donne un BON DE RÉDUCTION sur la prochaine machine ;
   - POSTE DE PRÉPARATION : fait des kits brut + outil tout seul ;
   - RADARS découpés à la meuleuse ; CENTRE COMMERCIAL (manger, se taper) ;
   - SALLE DE SPORT : tapis de course (endurance du joueur, gardée dans son profil).
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, C = ML.CFG, IT = ML.Items, ECO = ML.ECO;
  let S, rng, npcs;
  const mod = {};
  const OUT = { x: 0, z: 24 }, ASK = { x: -2.6, z: 12.3 }, PANEL = { x: 18.4, z: -3 }, VIG = { x: 6.4, z: 15.6 };
  const JURY = [{ x: 11, z: 6.4 }, { x: 13, z: 6.4 }];
  const SAE_PARTS = [['Support de capteur', 'alu', 'fraiseuse', 'fraise'], ['Axe de vérin', 'acier', 'tour', 'plaquette'], ['Bride de bridage', 'acier', 'fraiseuse', 'foret'],
    ['Bague épaulée', 'inox', 'tour', 'plaquette'], ['Platine de fixation', 'alu', 'fraiseuse', 'foret'], ['Arbre de transmission', 'acier', 'tour', 'plaquette']];
  const name = pid => (S.pl[pid] ? S.pl[pid].name : 'Quelqu\'un');

  mod.init = () => {
    S = K.S; rng = K.rng; npcs = K.npcs;
    K.prepaT = 4; K.johanT = 160 + rng() * 120; K.vcd2 = {};
    S.prepaMsg = '';
    const play = S.mode !== 'course';
    K.questT = play && S.mode !== 'inspection' ? (70 + rng() * 80) * (S.dayType === 'calme' ? 0.7 : 1) : 9e9;
    if (play && S.up.meuleuse) spawnGrinder();
    if (play && S.up.vigile) vigileArrive(true);
    // SAE : un jour sur quatre (jours 2, 6, 10…), pas en inspection
    const day = S.co.day || S.day;
    K.saeAt = play && S.mode !== 'inspection' && day >= 2 && day % ECO.sae.every === 2 % ECO.sae.every ? 35 + rng() * 25 : 9e9;
    if (S.black && play) K.all(`🛍 C'est le BLACK FRIDAY ! Aujourd'hui : machines et équipements −${Math.round((1 - ECO.black.cat) * 100)} % au PC, matière −${Math.round((1 - ECO.black.supply) * 100)} %, véhicules −${Math.round((1 - ECO.black.dealer) * 100)} %, centre commercial −${Math.round((1 - ECO.black.mall) * 100)} %.`, 'good');
  };

  /* ---------- Outils ---------- */
  function visit(id, speed, x, z) {
    const n = npcs[id]; Object.assign(n, { active: true, x: (x !== undefined ? x : OUT.x) + (rng() - 0.5) * 2, z: z !== undefined ? z : OUT.z, state: 'arrive', path: [], carry: null, stun: 0, speed: speed || 2.4, run: false });
    Sim.dirty = true; return n;
  }
  function goAway(n, line, cb) {
    if (!n.active) return; if (line) K.say(n, line);
    if (n.carry) { K.spawnItem(n.carry, n.x, 0.8, n.z, [0, 2, 0]); n.carry = null; }
    n.state = 'leave'; n.run = false; K.walkTo(n, OUT.x, OUT.z + 5, () => { n.active = false; n.state = 'away'; Sim.dirty = true; if (cb) cb(); });
    Sim.dirty = true;
  }
  K.onBuy = (k, pid) => {
    if (k === 'meuleuse') spawnGrinder();
    if (k === 'vigile') vigileArrive(false);
  };
  function spawnGrinder() { const h = ML.LOC.grinder; if (h && !S.items.some(o => o.type === 'meuleuse')) K.spawnItem({ type: 'meuleuse', d: {} }, h.x, h.y, h.z); }
  function vigileArrive(instant) {
    const n = npcs.vigile; if (!n || n.active) return;
    Object.assign(n, { active: true, state: 'guard', path: [], stun: 0, speed: 2.2, home: Object.assign({ yaw: 0 }, VIG) });
    if (instant) Object.assign(n, { x: VIG.x, z: VIG.z, yaw: 0 }); else { n.x = OUT.x; n.z = OUT.z + 4; K.walkTo(n, VIG.x, VIG.z); K.all('🛡 Raymond, le vigile, prend son poste devant l\'atelier. Johan Bois n\'a qu\'à bien se tenir.', 'good'); }
    Sim.dirty = true;
  }

  /* ---------- Événements (lancés par sim_events.js) ---------- */
  K.evStart = k => { if (k === 'johan') johanStart(); else if (k === 'bleuenn') bleuennStart(); };

  // --- Johan Bois ---
  const readyCrate = () => {
    const ok = o => { if (!K.isPart(o) || !o.rest) return false; const ord = S.orders.find(x => x.id === o.d.oid); return ord && K.stage(ord) === 'livraison' && ord.client !== 'sae'; };
    const E = ML.LOC.expedition;
    return S.items.find(o => ok(o) && o.x > E.minX - 1 && o.x < E.maxX + 1 && o.z > E.minZ - 1 && o.z < E.maxZ + 1) || S.items.find(o => ok(o) && U.inWorkshop(o));
  };
  function johanStart() {
    const n = npcs.johan; if (!n || n.active) return;
    visit('johan', 2.7); S.evs.johan = { until: S.rt + 80 }; K.ev({ e: 'tip', k: 'johan' });
    if (S.up.vigile && npcs.vigile.active) {
      K.all('🦹 Johan Bois rôde devant l\'atelier…', 'info');
      K.walkTo(n, 2.5, 18.5, () => {
        K.say(npcs.vigile, ML.line('vigile', 'refoule', 'Toi, Johan, tu fais demi-tour.'), true);
        K.say(n, ML.line('johan', 'refoule', 'Bon, bon… je repasserai.'));
        K.all('🛡 Raymond le vigile a refoulé Johan Bois à l\'entrée de l\'atelier !', 'good'); delete S.evs.johan; goAway(n);
      });
      return;
    }
    const crate = readyCrate(); n.goal = crate ? crate.id : null;
    K.all('🦹 Johan Bois entre dans l\'atelier… il lorgne les caisses prêtes !', 'warn');
    const t = crate || { x: -14, z: -12.2 };
    K.walkTo(n, t.x + 0.6, t.z + 0.7, () => johanGrab(n), true); n.runSpeed = 4.2;
  }
  function johanGrab(n) {
    if (n.state !== 'arrive') return;
    const crate = n.goal && S.items.find(o => o.id === n.goal && o.rest);
    if (crate && Math.hypot(crate.x - n.x, crate.z - n.z) < 3) {
      n.carry = K.strip(crate); K.removeItem(crate);
      K.big('🦹 JOHAN BOIS VOLE UNE CAISSE !', '#ff7a1a'); K.all(`🦹 Johan Bois a piqué la caisse #${n.carry.d.oid} ! Rattrapez-le et mettez-lui une claque !`, 'warn');
    } else {
      const m = ['acier', 'alu', 'inox'].sort((a, b) => S.stock[b] - S.stock[a])[0], q = Math.min(2, S.stock[m]);
      if (q) { S.stock[m] -= q; K.all(`🦹 Johan Bois a piqué ${q} barre${q > 1 ? 's' : ''} ${ML.MATERIALS[m].label} dans le rack !`, 'warn'); }
    }
    K.say(n, ML.line('johan')); n.state = 'flee'; n.fleeT = 0; n.runSpeed = 5.6; K.walkTo(n, OUT.x + 8, OUT.z + 14, () => johanEscaped(n), true);
    Sim.dirty = true;
  }
  function johanEscaped(n) {
    if (n.carry) {
      const o = S.orders.find(x => x.id === n.carry.d.oid);
      if (o) { o.si = o.steps.indexOf(o.src || 'usinage'); o.m = null; o.q = false; o.by = null; K.all(`😡 Johan Bois est parti avec la caisse #${o.id} : il faut la refaire !`, 'warn'); K.sfx('fail'); }
      n.carry = null;
    }
    n.active = false; n.state = 'away'; delete S.evs.johan; Sim.dirty = true;
  }

  // --- Bleuenn ---
  function bleuennStart() {
    const n = npcs.bleuenn; if (!n || n.active) return;
    visit('bleuenn', 2.3); K.say(n, ML.line('bleuenn'));
    K.all('🧰 Bleuenn entre dans l\'atelier avec une rallonge et un drôle d\'appareil… (une claque l\'arrêterait peut-être ?)', 'warn');
    K.walkTo(n, PANEL.x - 1.1, PANEL.z, () => { n.state = 'bricole'; n.boomT = 4; n.faceYaw = Math.PI / 2; K.say(n, 'Juste un petit branchement…'); });
  }
  function boom(n) {
    S.power = false; S.evs.coupure = { until: S.rt + 999 }; S.evs.bleuenn = { until: S.rt + 60 };
    for (const id in S.machines) S.machines[id].stopped = true;
    const run = Object.keys(S.machines).filter(id => S.machines[id].job); if (run.length && K.startFire) K.startFire(rng.pick(run));
    K.ev({ e: 'boom', x: PANEL.x - 0.6, z: PANEL.z }); K.ev({ e: 'tip', k: 'bleuenn' }); K.sfx('boom', PANEL.x, PANEL.z);
    K.big('💥 BLEUENN A TOUT FAIT SAUTER !', '#ff3b30');
    K.all('💥 BOUM ! Plus de courant et toutes les machines en ARRÊT D\'URGENCE : réarme le tableau électrique, puis E sur chaque machine.', 'warn');
    for (const pid in S.pl) { const p = K.pose[pid]; if (!p || !K.foot(S.pl[pid])) continue; const dx = p.x - PANEL.x, dz = p.z - PANEL.z, d = Math.hypot(dx, dz); if (d < 9) { K.ev({ e: 'push', to: pid, vx: dx / (d || 1) * 8, vz: dz / (d || 1) * 8 }); if (K.damage) K.damage(pid, 8, 'souffle de l\'explosion'); } }
    for (const id in npcs) { const o = npcs[id]; if (o.active && o !== n && Math.hypot(o.x - PANEL.x, o.z - PANEL.z) < 9) o.stun = 1.5; }
    if (npcs.lebec && npcs.lebec.active) K.say(npcs.lebec, 'BLEUENN !!! MON ATELIER !!!', true);
    n.stun = 1.2; setTimeoutSim(() => goAway(n, ML.line('bleuenn', 'boum', 'C\'était pas prévu, ça.')), 2.5);
    Sim.dirty = true;
  }
  // minuterie simulée (pas de setTimeout réel : la simulation peut tourner en accéléré)
  const timers = [];
  function setTimeoutSim(fn, sec) { timers.push({ t: S.rt + sec, fn }); }

  /* ---------- Toilettes ---------- */
  function wcStep(dt) {
    if (S.mode === 'course') return;
    const before = S.wc; S.wc = Math.min(100, Math.round((S.wc + dt * ECO.wc.rate * (0.7 + 0.3 * Math.max(1, S.n))) * 100) / 100);
    if (before < ECO.wc.slow && S.wc >= ECO.wc.slow) {
      S.evs.wc = { until: 1e9 }; K.ev({ e: 'tip', k: 'wc' }); K.sfx('fail');
      K.all('🚽 Les toilettes sont DÉGOÛTANTES : les opérateurs traînent (cabine WC à gauche de l\'atelier, dehors).', 'warn');
      if (npcs.lebec && npcs.lebec.active) K.say(npcs.lebec, 'Qui a laissé les toilettes dans cet état ?! C\'est pas l\'armée ici !', true);
    }
    if (before < 100 && S.wc >= 100) K.all('🤢 Les toilettes débordent : les opérateurs ralentissent encore plus !', 'warn');
  }

  /* ---------- Poste de préparation ---------- */
  function prepaStep(dt) {
    if (!S.up.prepa) return; K.prepaT -= dt; if (K.prepaT > 0) return; K.prepaT = 3;
    const L = ML.LOC.prepa; if (!L) return;
    const free = L.spots.filter(sp => !S.items.some(it => Math.hypot(it.x - sp.x, it.z - sp.z) < 0.45));
    if (!free.length) { S.prepaMsg = 'plateau plein'; return; }
    const kitted = new Set(S.items.filter(o => o.type === 'kit').map(o => o.d.oid));
    for (const pid in S.pl) for (const x of S.pl[pid].inv) if (x && x.type === 'kit') kitted.add(x.d.oid);
    const cand = S.orders.filter(o => K.stage(o) === 'usinage' && !o.src && !o.m && !kitted.has(o.id)).sort((a, b) => a.dl - b.dl);
    if (!cand.length) { S.prepaMsg = ''; return; }
    const o = cand.find(x => S.stock[x.mat] > 0 && S.stock[x.tool] > 0);
    if (!o) { const c = cand[0]; S.prepaMsg = 'manque : ' + [S.stock[c.mat] ? '' : 'barre ' + ML.MATERIALS[c.mat].label, S.stock[c.tool] ? '' : ML.TOOLS[c.tool].label].filter(Boolean).join(' + '); return; }
    S.stock[o.mat]--; S.stock[o.tool]--; S.prepaMsg = '';
    const sp = free[0]; K.spawnItem({ type: 'kit', d: { oid: o.id, mat: o.mat, tool: o.tool } }, sp.x, sp.y, sp.z);
    K.sfx('drop', sp.x, sp.z); Sim.dirty = true;
  }

  /* ---------- Quêtes secondaires ---------- */
  function lieu(key) {
    if (key && ML.LOC.lieux && ML.LOC.lieux[key]) return ML.LOC.lieux[key];
    const H = (ML.LOC.houses || []).filter(h => Math.hypot(h.x, h.z) > 45); if (!H.length) return null;
    return rng.pick(H);
  }
  function questStep(dt) {
    const Q = S.quest;
    if (!Q) {
      K.questT -= dt;
      if (K.questT <= 0 && S.rt < C.SHIFT_SEC - 150) {
        K.questT = (ECO.quest.every[0] + rng() * (ECO.quest.every[1] - ECO.quest.every[0])) * (S.dayType === 'calme' ? 0.7 : S.dayType === 'rush' ? 1.6 : 1);
        newQuest();
      }
      return;
    }
    if (Q.st === 'ask' && S.rt > Q.exp) { const n = npcs[Q.giver]; if (n) goAway(n, 'Bon… tant pis, je vais demander ailleurs.'); S.quest = null; Sim.dirty = true; return; }
    if (Q.st === 'go' && S.rt > Q.until) {
      K.all(`⌛ Service raté pour ${Q.who} : trop tard (réputation −1).`, 'warn'); K.repAdd(-1);
      if (Q.carry) { S.items = S.items.filter(o => o.type !== Q.carry); for (const pid in S.pl) S.pl[pid].inv = S.pl[pid].inv.map(x => (x && x.type === Q.carry ? null : x)); }
      S.quest = null; Sim.dirty = true;
    }
  }
  function newQuest() {
    const list = ML.QUESTS.map((q, i) => i).filter(i => { const q = ML.QUESTS[i], n = npcs[q.giver]; return n && !(n.active && !n.comp) && !(ML.PARTICULIERS.includes(q.giver) && S.parts.some(p => p.id === q.giver)); });
    if (!list.length) return;
    const qi = rng.pick(list), q = ML.QUESTS[qi], at = lieu(q.at); if (!at) return;
    const P = ML.PEOPLE[q.giver], reward = Math.round((ECO.quest.reward[0] + rng() * (ECO.quest.reward[1] - ECO.quest.reward[0])) / 5) * 5;
    const Q = S.quest = { qi, giver: q.giver, who: P.name, need: q.need || null, carry: q.carry || null, mg: q.mg || null, at: { x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10, name: at.name || 'chez ' + P.name }, reward, st: 'ask', exp: S.rt + 75, ask: q.ask };
    const n = npcs[q.giver];
    if (n.comp || n.home && n.state === 'shop') {                       // un commerçant ne quitte pas sa boutique : il appelle
      Q.st = 'go'; Q.until = S.rt + ECO.quest.life; Q.phone = true;
      if (Q.carry) { const R = ML.LOC.counter; K.spawnItem({ type: Q.carry, d: { to: Q.at.name } }, R.x - 1.5, 1.05, R.z - 0.2); }
      K.big(`📞 ${P.name} appelle l'atelier`, '#9fd0ff'); K.all(`📞 ${P.name} : « ${q.ask} » → ${Q.carry ? 'l\'objet est au COMPTOIR ; ' : ''}repère sur la carte (${Q.at.name}) · ${reward} €`, 'info');
      K.ev({ e: 'tip', k: 'quest' }); K.ev({ e: 'quest', x: Q.at.x, z: Q.at.z }); K.sfx('order'); Sim.dirty = true; return;
    }
    visit(q.giver, 2.4); n.comp = null;
    K.walkTo(n, ASK.x + (rng() - 0.5), ASK.z, () => { n.state = 'quest'; n.faceYaw = Math.PI; K.say(n, 'Excusez-moi… vous auriez deux minutes ?'); });
    K.all(`🙋 ${P.name} arrive à l'atelier : il a besoin d'un coup de main (E sur lui, près de l'entrée).`, 'info'); K.ev({ e: 'tip', k: 'quest' }); K.sfx('order'); Sim.dirty = true;
  }
  function questDecide(pid, ok) {
    const Q = S.quest; if (!Q || Q.st !== 'ask') return;
    const n = npcs[Q.giver];
    if (!ok) { goAway(n, 'Ah… d\'accord. Tant pis.'); S.quest = null; Sim.dirty = true; return; }
    Q.st = 'go'; Q.until = S.rt + ECO.quest.life; Q.by = name(pid);
    if (Q.carry) { const it = { type: Q.carry, d: { to: Q.at.name } }; if (!K.give(pid, it)) { const p = K.pose[pid] || ASK; K.spawnItem(it, p.x, 0.9, p.z, [0, 2, 0]); } }
    goAway(n, `Merci ! Je t'attends ${Q.at.name.startsWith('chez') ? Q.at.name : 'à ' + Q.at.name}.`);
    K.all(`🙋 ${name(pid)} a accepté d'aider ${Q.who} : ${Q.need ? 'apporter « ' + IT.TYPES[Q.need].name + ' »' : Q.carry ? 'livrer ' + IT.TYPES[Q.carry].name.toString().toLowerCase() : 'y aller'} → ${Q.at.name} (repère sur la carte) · ${Q.reward} €`, 'good');
    K.ev({ e: 'quest', x: Q.at.x, z: Q.at.z, to: pid }); Sim.dirty = true;
  }
  function questDone(pid, P, sel, held, m) {
    const Q = S.quest, ps = K.pose[pid]; if (!Q || Q.st !== 'go' || !ps || Math.hypot(ps.x - Q.at.x, ps.z - Q.at.z) > 6) return;
    const want = Q.need || Q.carry;
    if (want && (!held || held.type !== want)) return K.note(pid, `Il faut avoir en main : ${IT.TYPES[want].icon} ${typeof IT.TYPES[want].name === 'function' ? IT.TYPES[want].name({ to: Q.at.name }) : IT.TYPES[want].name}.`, 'warn');
    if (Q.mg && m.mg !== 'ok') return;
    if (Q.carry || ['viennoiseries', 'jerrican'].includes(Q.need)) P.inv[sel] = null;       // les outils de l'atelier, eux, on les garde
    K.bonus(Q.reward, `Service rendu à ${Q.who}`, pid); K.repAdd(2); K.stat(pid, 'quest');
    K.big(`🙋 Service rendu à ${Q.who} : +${Q.reward} €`, '#3ecf6e'); K.sfx('cash');
    K.all(`🙋 ${name(pid)} a rendu service à ${Q.who} (${Q.at.name}) : « ${ML.QUESTS[Q.qi].done} » +${Q.reward} €, réputation +2.`, 'good');
    S.quest = null; Sim.dirty = true;
  }

  /* ---------- SAE ---------- */
  function saeStep(dt) {
    if (!S.sae && S.rt >= K.saeAt) { K.saeAt = 9e9; saeStart(); return; }
    const A = S.sae; if (!A) return;
    if (A.st === 'prod' && S.rt >= A.jury) {
      A.st = 'jury'; A.end = S.rt + 100;
      ['garnier', 'fanfrelat'].forEach((id, i) => { const n = visit(id, 2.3); K.walkTo(n, JURY[i].x, JURY[i].z, () => { n.state = 'jury'; n.faceYaw = Math.PI; }); });
      K.big('🎓 LE JURY DE SAE ARRIVE', '#c39bff'); K.all(`🎓 Le jury (Garnier et Fanfrelat) s'installe au MARBRE : apportez-leur vos pièces SAE (${A.oids.length}) dans les 100 s !`, 'warn'); Sim.dirty = true;
    }
    if (A.st === 'jury' && (S.rt >= A.end || A.got.length >= A.oids.length)) saeGrade();
  }
  function saeStart() {
    const types = new Set(Object.keys(S.machines).map(id => ML.MACHINES.find(m => m.id === id).type));
    const list = SAE_PARTS.filter(p => types.has(p[2])); if (!list.length) return;
    const code = `SAE ${1 + Math.floor(rng() * 5)}.0${1 + Math.floor(rng() * 6)}`, [part, mat, mtype, tool] = rng.pick(list);
    const jury = Math.min(C.SHIFT_SEC - 110, S.rt + 230 + rng() * 40), oids = [];
    for (let i = 0; i < ECO.sae.parts; i++) {
      const o = { id: S.nextOid++, client: 'sae', part: `${part} (${code})`, mat, mtype, tool, steps: ['usinage', 'livraison'], si: 0, size: 'm', src: null, dur: jury + 100 - S.rt, price: 0, t0: S.rt, dl: jury + 100, q: false, m: null, plan: null, sae: true };
      S.orders.push(o); oids.push(o.id);
    }
    S.sae = { code, part, oids, got: [], st: 'prod', jury };
    K.big(`🎓 ${code} : ${part}`, '#c39bff'); K.ev({ e: 'tip', k: 'sae' }); K.sfx('order');
    K.all(`🎓 ${code} du jour : usinez ${oids.length} × « ${part} » (${ML.MATERIALS[mat].label}, ${ML.MTYPE[mtype]}). Le jury passe vers ${K.clockAt(jury)}. Une bonne note = un BON DE RÉDUCTION sur une machine !`, 'info');
    Sim.dirty = true;
  }
  K.clockAt = t => { const m = Math.round(C.DAY_START + t * (C.DAY_END - C.DAY_START) / C.SHIFT_SEC); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
  function saeGive(pid, P, sel, held, n) {
    const A = S.sae, o = A && S.orders.find(x => x.id === held.d.oid && x.client === 'sae');
    if (!o) return K.say(n, 'Ce n\'est pas une pièce de SAE, ça.');
    if (K.stage(o) !== 'livraison') return K.say(n, 'Elle n\'est pas finie !');
    if (A.st !== 'jury') return K.say(n, 'Le jury n\'est pas encore installé.');
    P.inv[sel] = null; A.got.push({ ctl: !!held.d.ctl, nc: !!held.d.nc, by: name(pid) });
    S.orders.splice(S.orders.indexOf(o), 1); S.served++;
    K.say(n, held.d.nc ? 'Hmm… cette cote n\'est pas dans la tolérance.' : held.d.ctl ? 'Contrôlée au marbre, avec la fiche ? Très bien !' : ML.line(n.id));
    K.sfx('success'); Sim.dirty = true;
  }
  function saeGrade() {
    const A = S.sae; A.st = 'done';
    const N = A.oids.length, sc = A.got.reduce((a, g) => a + (g.nc ? 0.25 : g.ctl ? 1 : 0.75), 0);
    const grade = A.got.length ? Math.round(4 + 16 * sc / N) : 0, bon = grade >= 10 ? Math.min(ECO.sae.max, Math.round(grade * ECO.sae.bon)) : 0;
    A.grade = grade; A.bon = bon;
    for (const id of A.oids) { const o = S.orders.find(x => x.id === id); if (o) { S.orders.splice(S.orders.indexOf(o), 1); for (const mid in S.machines) if (S.machines[mid].job && S.machines[mid].job.oid === id) S.machines[mid].job = null; K.purgeOrder(id); } }
    if (bon) { S.saeBon = Math.max(S.saeBon || 0, bon); S.up.sae_bon = S.saeBon; }
    K.repAdd(Math.round((grade - 10) / 2));
    if (grade >= 16) for (const g of A.got) { const pid = Object.keys(S.pl).find(p => S.pl[p].name === g.by); if (pid) K.stat(pid, 'sae'); }
    const msg = grade ? `🎓 ${A.code} : ${grade}/20 ${grade >= 16 ? '— félicitations du jury !' : grade >= 10 ? '— validée.' : '— non validée…'}${bon ? ` BON DE RÉDUCTION : −${bon} % sur la prochaine machine (PC, onglet Atelier).` : ''}` : `🎓 ${A.code} : aucune pièce présentée… 0/20.`;
    K.big(msg.split(' — ')[0] + (bon ? ` · −${bon} %` : ''), grade >= 10 ? '#3ecf6e' : '#ff6b6b'); K.all(msg, grade >= 10 ? 'good' : 'warn'); K.sfx(grade >= 10 ? 'cash' : 'fail');
    ['garnier', 'fanfrelat'].forEach(id => goAway(npcs[id], id === 'garnier' ? (grade >= 10 ? 'Bon travail. On en reparle en entretien.' : 'Il faudra retravailler la démarche.') : (grade >= 10 ? 'Le dossier tient la route.' : 'Pensez à justifier vos choix.')));
    Sim.dirty = true;
  }

  /* ---------- Boucle ---------- */
  mod.step = dt => {
    for (const t of timers.slice()) if (S.rt >= t.t) { timers.splice(timers.indexOf(t), 1); t.fn(); }
    if (S.mode === 'course') return;
    wcStep(dt); prepaStep(dt); questStep(dt); saeStep(dt);
    // Johan revient parfois tout seul quand des caisses prêtes traînent
    K.johanT -= dt;
    if (K.johanT <= 0) { K.johanT = 170 + rng() * 150; if (!npcs.johan.active && S.rt < C.SHIFT_SEC - 60 && rng() < 0.45 && readyCrate()) johanStart(); }
    if (npcs.johan.active && !S.evs.johan && npcs.johan.state === 'arrive') goAway(npcs.johan, 'Bon, rien d\'intéressant ici.');
    if (npcs.vigile.active && !S.up.vigile && npcs.vigile.state === 'guard') goAway(npcs.vigile, 'Abonnement résilié ? Bon. Salut.');
  };
  mod.workMult = (n, k) => (S.wc >= 100 ? k * 0.75 : S.wc >= ECO.wc.slow ? k * 0.88 : k);
  mod.brain = (n, dt) => {
    switch (n.id) {
      case 'johan':
        if (n.state === 'flee') { n.fleeT += dt; if (n.fleeT > 24 || !n.path.length) johanEscaped(n); }
        return true;
      case 'bleuenn':
        if (n.state === 'bricole') { n.boomT -= dt; if (n.boomT <= 0) { n.state = 'done'; boom(n); } }
        return true;
      case 'vigile':
        if (n.state === 'guard') { if (!n.path.length && Math.hypot(n.x - VIG.x, n.z - VIG.z) > 0.6) K.walkTo(n, VIG.x, VIG.z); else if (!n.path.length) n.faceYaw = 0; }
        return n.state === 'guard' || n.state === 'leave';
      case 'garnier': case 'fanfrelat': return true;
    }
    if (S.quest && S.quest.giver === n.id && n.state === 'quest') { n.faceYaw = Math.PI; return true; }
    if (n.state === 'arrive' || (n.state === 'leave' && (n.id === 'cardin' || n.id === 'kawa'))) return ['cardin', 'kawa'].includes(n.id) || !!(S.quest && S.quest.giver === n.id);
    return false;
  };
  mod.bubble = n => {
    if (S.quest && S.quest.giver === n.id && S.quest.st === 'ask' && n.state === 'quest') return `🙋 Un service ? ${S.quest.reward} € (E)`;
    switch (n.id) {
      case 'johan': return n.carry ? '📦 hé hé hé' : n.state === 'arrive' ? '👀 …' : undefined;
      case 'bleuenn': return n.state === 'bricole' ? `🔌 Branchement… ${Math.max(0, Math.ceil(n.boomT))}` : undefined;
      case 'vigile': return n.state === 'guard' ? '🛡 Anti-Johan' : undefined;
      case 'garnier': case 'fanfrelat': return n.state === 'jury' && S.sae ? `🎓 Pièces SAE : ${S.sae.got.length}/${S.sae.oids.length}` : undefined;
      case 'coach': return '🏃 Tapis de course : endurance';
      case 'vendeuse': return S.black ? '🛍 BLACK FRIDAY −50 %' : undefined;
    }
    return undefined;
  };

  /* ---------- Intentions ---------- */
  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'quest': questDecide(pid, !!m.ok); return true;
      case 'eat': {
        const F = IT.food(held); if (!F) return true;
        P.inv[sel] = null; P.hp = Math.min(C.HP.max, (P.hp || 0) + (F.hp || 0)); if (F.coffee) P.coffee = Math.max(P.coffee || 0, S.rt + F.coffee);
        K.ev({ e: 'eat', to: pid, k: held.type, stam: F.stam ? 1 : 0 }); K.sfx('pickup', ps.x, ps.z); Sim.dirty = true; return true;
      }
    }
    return false;
  };
  mod.use = (pid, P, ps, sel, held, kind, a, b, m) => {
    switch (kind) {
      case 'wc':
        if (S.wc < 12) { K.note(pid, '🚽 C\'est propre. Profites-en.'); return true; }
        if (m.mg !== 'ok') return true;
        S.wc = 0; delete S.evs.wc; S.sat = Math.min(100, S.sat + 3); K.stat(pid, 'wc'); K.sfx('flush', ps.x, ps.z);
        K.all(`🚽 ${P.name} a nettoyé les toilettes. Respect éternel.`, 'good'); Sim.dirty = true; return true;
      case 'prepa': K.note(pid, S.up.prepa ? `🧰 Le poste prépare les kits tout seul${S.prepaMsg ? ' — ' + S.prepaMsg : ''}. Prends un kit sur le plateau et donne-le à la machine.` : '🔒 Poste de préparation : à acheter au PC de gestion (onglet Atelier).'); return true;
      case 'radar': {
        const ri = +a, R = ML.World.radars[ri]; if (!R) return true;
        if (S.radarsOff.includes(ri)) { K.note(pid, 'Ce radar est déjà en morceaux.'); return true; }
        if (!held || held.type !== 'meuleuse') { K.note(pid, '📸 Radar 60 : pour le découper, il faut la MEULEUSE (PC de gestion, onglet Atelier).', 'warn'); return true; }
        if (m.mg !== 'ok') return true;
        S.radarsOff.push(ri); K.ev({ e: 'radarOff', r: ri }); K.sfx('grind', R.x, R.z); K.stat(pid, 'radar_cut'); Sim.dirty = true;
        if (rng() < ECO.radarWitness) { K.fine(ECO.fines.vandal, 'Radar découpé (un témoin a tout vu)', pid); K.all(`🪚 ${P.name} a découpé un radar… mais un témoin a appelé la gendarmerie : −${ECO.fines.vandal} € !`, 'warn'); }
        else K.all(`🪚 ${P.name} a découpé un radar : il ne flashera plus de la journée.`, 'info');
        return true;
      }
      case 'mall': {
        const it = ML.MALL[a]; if (!it) return true;
        const price = K.price(it.price, 'mall'), x = { type: a, d: {} };
        if (!K.canTake(P, x)) { K.note(pid, 'Mains pleines (3 places) : pose quelque chose (G).', 'warn'); return true; }
        if (!K.spend(pid, price, 'achat', it.name + (S.black ? ' (Black Friday)' : ''))) return true;
        K.give(pid, x, sel); K.sfx('cash', ps.x, ps.z); K.note(pid, `${it.icon} ${it.name} acheté (${price} €). ${it.desc}`, 'good');
        if (npcs.vendeuse && npcs.vendeuse.active && rng() < 0.4) K.say(npcs.vendeuse, ML.line('vendeuse'));
        return true;
      }
      case 'gym': {
        if (m.mg !== 'ok') return true;
        const price = K.price(ECO.gym, 'mall');
        if (!K.spend(pid, price, 'achat', 'Séance de tapis de course')) return true;
        K.ev({ e: 'endu', to: pid }); if (npcs.coach && npcs.coach.active) K.say(npcs.coach, ML.line('coach'));
        return true;
      }
      case 'quest': questDone(pid, P, sel, held, m); return true;
    }
    return false;
  };
  mod.npcUse = (pid, P, ps, sel, held, n) => {
    if (S.quest && S.quest.giver === n.id && S.quest.st === 'ask') return true;          // le dialogue se passe chez le joueur (intention « quest »)
    switch (n.id) {
      case 'garnier': case 'fanfrelat':
        if (K.isPart(held)) saeGive(pid, P, sel, held, n); else K.say(n, S.sae && S.sae.st === 'jury' ? `Nous attendons vos pièces SAE (${S.sae.got.length}/${S.sae.oids.length}).` : ML.line(n.id));
        return true;
      case 'johan': K.say(n, n.carry ? 'Quelle caisse ? Je vois pas de caisse.' : ML.line('johan')); return true;
      case 'vigile': case 'bleuenn': case 'coach': case 'vendeuse': case 'cardin': case 'kawa': K.say(n, ML.line(n.id)); return true;
    }
    return false;
  };
  mod.npcHit = (n, by) => {
    if (n.id === 'johan') {
      if (n.carry) { K.spawnItem(n.carry, n.x, 0.8, n.z, [0, 2, 0]); n.carry = null; K.stat(by, 'johan_stop'); K.all(`👊 ${name(by)} a fait lâcher la caisse à Johan Bois !`, 'good'); }
      K.say(n, 'Aïe ! Ça va, ça va, je m\'en vais !'); n.state = 'flee'; n.fleeT = 16; delete S.evs.johan; return true;
    }
    if (n.id === 'bleuenn' && (n.state === 'arrive' || n.state === 'bricole')) {
      n.state = 'done'; K.all(`👋 ${name(by)} a empêché Bleuenn de brancher son engin : l'atelier est sauvé !`, 'good'); K.bonus(15, 'Explosion évitée', by);
      goAway(n, 'Bon, d\'accord, je range ma rallonge…'); return true;
    }
    return false;
  };
  mod.fast = f => { if (S.quest && S.quest.st === 'go') f.qt = Math.max(0, Math.ceil(S.quest.until - S.rt)); };
  Sim.mods.push(mod);
})();
