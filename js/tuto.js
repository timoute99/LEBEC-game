/* =====================================================================
   tuto.js — TUTORIEL pas à pas (V5.1) pour les invités et les débutants.
   Il s'affiche au début de la partie tant que le joueur ne l'a pas fini
   (profil : prof.tuto). Chaque étape se valide toute seule en regardant
   l'état du jeu ; une flèche dorée montre où aller. J : passer.
   Le menu Pause permet de le revoir.
   ===================================================================== */
(function () {
  const T = ML.Tuto = { on: false, i: 0 };
  const U = ML.U, G = () => ML.Game, S = () => ML.Game.S;
  const usinage = o => o.steps[o.si] === 'usinage';
  /** La commande « de travail » du tuto : la première qui attend l'usinage, sinon la première */
  const focus = () => { const s = S(); return s.orders.find(o => usinage(o) && !o.m) || s.orders.find(usinage) || s.orders[0] || null; };
  const held = () => G().held();
  const isPart = it => it && (it.type === 'caisse' || it.type === 'piece' || it.type === 'palette');
  const myJob = () => { const s = S(); for (const id in s.machines) { const M = s.machines[id]; if (M.job && s.orders.some(o => o.id === M.job.oid)) return { id, M }; } return null; };
  const tgt = id => { const t = ML.World.target(id); return t ? { x: t.x, y: t.y, z: t.z } : null; };
  const STEPS = [
    { tx: () => 'Bienvenue chez Lebec ! 👋 Les commandes des clients arrivent au <b>💻 PC DE GESTION</b> (le bureau, contre le mur de droite). Va devant et appuie sur <b>E</b>.',
      at: () => tgt('pc'), ok: () => ML.ui.modal === 'erp' || S().orders.length > 0 },
    { tx: () => 'C\'est un vrai ordinateur : clique l\'icône <b>📥 Commandes</b>, puis <b>« Accepter »</b> sur une demande (elle arrive en quelques secondes). Puis <b>Échap</b> pour éteindre le PC. Le 📌 pense-bête à droite dit toujours quoi faire.',
      at: () => tgt('pc'), ok: () => S().orders.length > 0 && ML.ui.modal !== 'erp' },
    { tx: () => { const o = focus(); return o ? `Ton <b>ticket</b> (en haut) dit quoi faire. Commande #${o.id} : il faut un <b>brut ${ML.MATERIALS[o.mat].label}</b>. Prends-le au <b>rack</b> du fond de l'atelier (E).` : 'Prends un <b>brut</b> au rack du fond de l\'atelier (E).'; },
      at: () => { const o = focus(); return tgt('rack:' + (o && ['acier', 'alu', 'inox'].includes(o.mat) ? o.mat : 'acier')); },
      ok: () => { const h = held(); return (h && ML.Items.def(h).kind === 'brut') || !!myJob(); } },
    { tx: () => { const o = focus(); return `Apporte le brut à une machine libre : un <b>${o ? ML.MTYPE[o.mtype].toUpperCase() : 'TOUR ou une FRAISEUSE'}</b> (écrit sur le ticket). <b>E</b> dessus, puis réussis la <b>prise d'origine</b> (mini-jeu).`; },
      at: () => { const o = focus(), s = S(); const id = Object.keys(s.machines).find(m => { const d = ML.MACHINES.find(x => x.id === m); return (!o || d.type === o.mtype) && !s.machines[m].job; }); const W = id && ML.World.machines[id]; return W ? { x: W.group.position.x, y: 3, z: W.group.position.z } : null; },
      ok: () => !!myJob() },
    { tx: () => { const j = myJob(); return `La machine attend son <b>OUTIL</b>${j && j.M.job ? ` (<b>${ML.TOOLS[j.M.job.need].label}</b>)` : ''} : prends-le dans l'<b>ARMOIRE ROUGE</b> (au fond), puis <b>E</b> sur la machine.`; },
      at: () => { const j = myJob(); return tgt('tool:' + (j && j.M.job ? j.M.job.need : 'plaquette')); },
      ok: () => { const j = myJob(); return (j && j.M.job.tool) || isPart(held()) || S().served > T.served0; } },
    { tx: () => 'La machine usine toute seule (le % est affiché au-dessus). Quand c\'est fini, la pièce sort en <b>📦 EXPÉDITION</b> (à droite de la grande porte). Va la prendre (E).',
      at: () => { const E = ML.LOC.expedition; return { x: (E.minX + E.maxX) / 2, y: 1, z: (E.minZ + E.maxZ) / 2 }; },
      ok: () => isPart(held()) || S().served > T.served0 || !!(G().p.car !== null && S().cars[G().p.car] && S().cars[G().p.car].bed.some(isPart)) },
    { tx: () => { const h = held(), o = h && h.d ? G().order(h.d.oid) : focus(); const c = o ? (o.client === 'part' ? 'au COMPTOIR de l\'atelier' : `chez <b>${ML.COMPANIES[o.client].name}</b>`) : 'chez le client'; return `Livre-la ${c} : mets-la dans la <b>voiture</b> (E à l'arrière), conduis en suivant le <b>repère rouge</b> (M = carte), puis <b>E</b> sur l'accueil du client.`; },
      at: () => { const h = held(), o = h && h.d ? G().order(h.d.oid) : focus(), L = o && ML.LOC.comp[o.client]; if (L && !T.gps) { T.gps = true; ML.GPS.set(L.dock.x, L.dock.z); } return L ? { x: L.npc.x, y: 2.5, z: L.npc.z } : null; },
      ok: () => S().served > T.served0 },
    { tx: () => 'BRAVO ! 🎉 Tu sais faire tourner l\'atelier. Au PC : achète des machines, embauche, commande de la matière. <b>Tab</b> = aide · <b>M</b> = carte · <b>Échap</b> = pause. Bonne journée !',
      at: () => null, ok: () => T.t > 9, end: true }
  ];

  /* ---------- V5.3 : MODE DÉBUTANT — le tutoriel complet (on tient la main du début à la fin) ---------- */
  const NXT = '<div class="nx">▶ <b>N</b> : suivant</div>';
  const spo = () => S().orders.find(o => o.src === 'chaudro') || null;
  const myCar = () => { const L = ML.Cars.list; let best = null, bd = 1e9; L.forEach((c, i) => { if (!c || ['fenwick', 'camion', 'tp'].includes(c.kind)) return; const d = Math.hypot(c.pos ? c.pos.x : c.x, c.pos ? c.pos.z : c.z); if (d < bd) { bd = d; best = i; } }); return best; };
  const bedPart = () => Object.values(S().cars || {}).some(c => c && c.bed && c.bed.some(isPart));
  const B = [
    { info: 1, tx: () => '🐣 <b>MODE DÉBUTANT</b> — je vais t\'apprendre tout le métier, pas à pas. Pendant le tutoriel, le temps passe <b>2× moins vite</b> et il n\'y a <b>aucun imprévu</b>. Une <b>flèche dorée</b> te montre où aller.' + NXT },
    { tx: () => 'Déplace-toi : <b>Z Q S D</b> (ou W A S D / flèches) et la <b>souris</b> pour regarder. <b>Maj</b> = courir, <b>Espace</b> = sauter. Fais quelques pas !',
      enter: () => { const p = G().p.pos; T.p0 = { x: p.x, z: p.z }; }, ok: () => { const p = G().p.pos; return T.p0 && Math.hypot(p.x - T.p0.x, p.z - T.p0.z) > 4; } },
    { tx: () => 'Tout commence au <b>💻 PC DE GESTION</b>, au bureau (contre le mur de droite). Va devant, vise l\'écran et appuie sur <b>E</b>.', at: () => tgt('pc'), ok: () => ML.ui.modal === 'erp' },
    { tx: () => 'C\'est un <b>vrai ordinateur</b> : chaque icône est une application. Clique l\'icône <b>📥 Commandes</b> (en haut à gauche de l\'écran).',
      enter: () => G().intent({ a: 'tuto', k: 'plain' }), at: () => tgt('pc'), ok: () => ML.ERP.tab === 'cmd' || S().orders.length > 0 },
    { tx: () => 'Une <b>demande</b> = un client qui veut une pièce. Tu y lis la <b>matière</b> (ALU, ACIER…), la <b>machine</b> (Tour / Fraiseuse), l\'<b>outil</b>, le <b>délai</b> et le <b>prix</b>. Clique <b>« Accepter »</b>.',
      at: () => tgt('pc'), ok: () => S().orders.length > 0 },
    { tx: () => 'Bravo ! La commande devient un <b>TICKET</b>. Éteins le PC : touche <b>Échap</b> (ou le bouton rouge ⏻ en bas à droite).', at: () => tgt('pc'), ok: () => ML.ui.modal !== 'erp' },
    { info: 1, tx: () => { const o = focus(); return (o ? `Ton ticket <b>#${o.id}</b> est en haut de l'écran : <b>${ML.MATERIALS[o.mat].label}</b> · <b>${ML.MTYPE[o.mtype]}</b> · outil <b>${ML.TOOLS[o.tool].label}</b>. ` : '') + 'Les petites icônes 🛠️ › 🚚 sont les <b>étapes</b> : usinage, puis livraison. Celle en couleur, c\'est maintenant.' + NXT; } },
    STEPS[2], STEPS[3], STEPS[4],
    { tx: () => 'La machine usine toute seule (le <b>%</b> est affiché au-dessus). Quand c\'est fini, la caisse sort en <b>📦 EXPÉDITION</b> (zone verte à droite de la grande porte). Prends-la (<b>E</b>).',
      at: STEPS[5].at, ok: () => isPart(held()) || S().served > T.served0 || bedPart() },
    { tx: () => 'Livraison ! La voiture est garée <b>dehors</b>. Vise l\'<b>ARRIÈRE</b> (la benne) et <b>E</b> pour y poser la caisse.',
      at: () => { const i = myCar(), c = i !== null && ML.Cars.list[i]; if (!c) return null; const r = ML.Cars.rearPos(c); return { x: r.x, y: 1.2, z: r.z }; }, ok: () => bedPart() || S().served > T.served0 },
    { tx: () => { const o = focus() || S().orders[0], c = o && o.client !== 'part' ? ML.COMPANIES[o.client].name : 'le client'; return `Monte : <b>E</b> sur la <b>PORTIÈRE</b>. <b>Z</b> avance, <b>S</b> freine / recule, <b>Q D</b> tournent. Suis le <b>trait au sol</b> jusqu'à <b>${c}</b> (<b>M</b> = carte). Là-bas : descends (E), reprends la caisse dans la benne (E) et donne-la à l'accueil (E).`; },
      at: () => { const o = S().orders.find(x => x.steps[x.si] === 'livraison') || S().orders[0], L = o && ML.LOC.comp[o.client]; if (L && !T.gps) { T.gps = true; ML.GPS.set(L.dock.x, L.dock.z); } return L ? { x: L.npc.x, y: 2.5, z: L.npc.z } : null; },
      ok: () => S().served > T.served0 },
    { info: 1, tx: () => '🎉 <b>Première livraison !</b> L\'argent tombe tout de suite. Livrer <b>à l\'heure</b> fait monter la ⭐ réputation… et les prix des commandes. Reviens à l\'atelier.' + NXT },
    { tx: () => 'Une pièce spéciale arrive : une demande <b>⚙️ MÉCANO-SOUDÉ</b>. Elle ne part pas d\'une barre du rack mais d\'un <b>BRUT soudé</b> qu\'il faut acheter. Va au <b>PC</b>, 📥 Commandes : sur cette demande, clique le bouton orange <b>« ✅ Accepter + commander le brut »</b>.',
      enter: () => G().intent({ a: 'tuto', k: 'chaudro' }), at: () => tgt('pc'), ok: () => !!spo() },
    { tx: () => { const o = spo(); return `Dans <b>📥 Commandes</b>, sur la <b>#${o ? o.id : '?'}</b>, dans l'encadré orange <b>🧱 BRUTS À ACHETER</b>, clique <b>« 🛒 Commander »</b> (${ML.ECO.subPC.chaudro} €). Le brut sera livré à la <b>RÉCEPTION</b> de l'atelier. <span class="dim">(Moins cher mais plus long : aller payer la Chaudronnerie Babinsky — voir l'app 💡 Astuces.)</span>`; },
      at: () => tgt('pc'), ok: () => { const o = spo(); return !o || o.q || o.steps[o.si] !== 'chaudro'; } },
    { tx: () => 'Le livreur arrive (compte à rebours 🚚 en haut à droite). En attendant, jette un œil à l\'app <b>💡 Astuces</b> du PC : tout y est. Quand le brut 🧱 est en <b>RÉCEPTION</b> (zone bleue, à gauche de la porte), prends-le (<b>E</b>).',
      at: () => { const R = ML.LOC.reception; return R ? { x: R.x, y: 1, z: R.z } : null; },
      ok: () => { const h = held(), o = spo(); return (h && h.type === 'brut_sp') || !o || (o.steps[o.si] === 'usinage' && !!o.m) || o.si > o.steps.indexOf('usinage'); } },
    { tx: () => 'Mets le brut dans une <b>machine libre</b> (E), puis donne-lui le bon <b>outil</b>, comme tout à l\'heure. Pas besoin de barre du rack !',
      at: () => { const o = spo(), s = S(); if (!o) return null; const id = Object.keys(s.machines).find(m => { const d = ML.MACHINES.find(x => x.id === m); return d.type === o.mtype && (!s.machines[m].job || s.machines[m].job.oid === o.id); }); const W = id && ML.World.machines[id]; return W ? { x: W.group.position.x, y: 3, z: W.group.position.z } : null; },
      ok: () => { const o = spo(), j = myJob(); return !o || o.si > o.steps.indexOf('usinage') || !!(j && j.M.job.oid === o.id && j.M.job.tool); } },
    { info: 1, tx: () => '♨️ Certaines caisses passent au <b>TRAITEMENT THERMIQUE</b> après l\'usinage : apporte-la chez <b>TTH Ouest</b>, attends quelques secondes et reprends-la. 🔥 La <b>FONDERIE</b> marche comme le mécano-soudé (brut commandé au PC).' + NXT },
    { info: 1, tx: () => '🏗 Plus tard viennent les <b>GROSSES pièces</b> : elles sortent en <b>palette</b> au <b>QUAI GROS COLIS</b>. Il faut le <b>FENWICK</b> (app 🏭 Boutique) puis le <b>CAMION</b> (Garage Pasquier). À plusieurs, ce sont elles qui rapportent le plus !' + NXT },
    { info: 1, tx: () => '🚨 En vraie journée, il y a des <b>imprévus</b> (coupure de courant, audit, Johan Bois qui vole des caisses…) : un <b>cadre d\'astuces</b> s\'affiche alors à droite. Et si tu regardes un objet un moment, un <b>💡 petit conseil</b> apparaît sous l\'action.' + NXT },
    { tx: () => 'Tu es prêt ! 🎉 Finis la commande mécano-soudée et livre-la. <b>Tab</b> = aide · <b>M</b> = carte · PC → <b>💡 Astuces</b>. Les journées suivantes seront de vraies journées. Bon courage !', at: () => null, ok: () => T.t > 12, end: true }
  ];
  const list = () => (T.full ? B : STEPS);

  T.start = force => {
    const A = ML.Account;
    if (T.on && !force) return;                                          // déjà en cours
    T.stop();
    T.full = !!(G().game && G().game.beginner);                         // V5.3 : mode débutant = tutoriel complet, même si on a déjà fait l'autre
    if (!force && !T.full && (A.prof.tuto || ((A.prof.st || {}).days || 0) >= 3 || (G().game && G().game.mode === 'course'))) return;   // invités et débutants
    T.on = true; T.i = 0; T.t = 0; T.gps = false; T.nxt = false; T.entered = -1; T.served0 = S() ? S().served : 0;
    T.el = document.getElementById('tuto'); T.el.classList.remove('hidden', 'done');
    if (!T.mark) {
      T.mark = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color: 0xffd257, depthTest: false, transparent: true });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 12), m); cone.rotation.x = Math.PI; cone.renderOrder = 20; T.mark.add(cone);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 20), m); ring.rotation.x = Math.PI / 2; ring.position.y = 0.7; ring.renderOrder = 20; T.mark.add(ring); T.ring = ring;
    }
    ML.scene.add(T.mark); T.mark.visible = false;
  };
  T.stop = () => { T.on = false; if (T.el) T.el.classList.add('hidden'); if (T.mark) ML.scene.remove(T.mark); };
  T.finish = skipped => {
    T.stop(); const A = ML.Account; A.prof.tuto = 1; A.save();
    if (T.full) G().intent({ a: 'tuto', k: 'done' });                   // fin du mode débutant : la vraie journée reprend
    if (skipped) ML.HUD.notify('📘 Tutoriel passé. Tu peux le revoir depuis le menu Pause (Échap).', 'info');
  };
  T.update = dt => {
    if (!T.on || !S()) return;
    if (ML.Input.pressed('KeyJ') && !ML.ui.modal) return T.finish(true);
    const L = list(); let st = L[T.i];
    if (st && st.info && ML.Input.pressed('KeyN') && !ML.ui.modal && T.t > 0.6) T.nxt = true;
    const ok = x => (x.info ? T.nxt : x.ok());
    // une étape déjà faite (par toi ou un collègue) : on passe à la suivante
    for (let guard = 0; guard < 8 && st && !st.end && ok(st); guard++) { T.i++; st = L[T.i]; T.t = 0; T.nxt = false; ML.Sfx.play('success', 0.6); }
    if (!st) return T.finish();
    if (T.entered !== T.i) { T.entered = T.i; if (st.enter) st.enter(); }
    T.t += dt;
    if (st.end) { T.el.classList.add('done'); if (T.t > (T.full ? 12 : 9)) return T.finish(); }
    const html = `<div class="tt">${T.full ? '🐣 MODE DÉBUTANT' : '📘 TUTORIEL'} · étape ${T.i + 1}/${L.length}</div><div class="tx">${st.tx()}</div><div class="tk">J : passer le tutoriel</div>`;
    if (html !== T.html) { T.el.innerHTML = html; T.html = html; }
    const p = st.at && st.at();
    T.mark.visible = !!p;
    if (p) { const t = performance.now() / 1000; T.mark.position.set(p.x, (p.y || 1) + 1.6 + Math.sin(t * 4) * 0.25, p.z); T.mark.rotation.y = t * 2; T.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.15); }
  };
})();
