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
    { tx: () => 'Onglet <b>📋 Commandes</b> : clique <b>« Accepter »</b> sur une demande (s\'il n\'y en a pas encore, elle arrive dans quelques secondes). Puis <b>Échap</b> pour sortir du PC.',
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

  T.start = force => {
    const A = ML.Account;
    T.stop();
    if (!force && (A.prof.tuto || ((A.prof.st || {}).days || 0) >= 3 || (G().game && G().game.mode === 'course'))) return;   // invités et débutants
    T.on = true; T.i = 0; T.t = 0; T.gps = false; T.served0 = S() ? S().served : 0;
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
    if (skipped) ML.HUD.notify('📘 Tutoriel passé. Tu peux le revoir depuis le menu Pause (Échap).', 'info');
  };
  T.update = dt => {
    if (!T.on || !S()) return;
    if (ML.Input.pressed('KeyJ') && !ML.ui.modal) return T.finish(true);
    let st = STEPS[T.i];
    // une étape déjà faite (par toi ou un collègue) : on passe à la suivante
    for (let guard = 0; guard < 8 && st && !st.end && st.ok(); guard++) { T.i++; st = STEPS[T.i]; T.t = 0; ML.Sfx.play('success', 0.6); }
    if (!st) return T.finish();
    T.t += dt;
    if (st.end) { T.el.classList.add('done'); if (T.t > 9) return T.finish(); }
    const html = `<div class="tt">📘 TUTORIEL · étape ${T.i + 1}/${STEPS.length}</div><div class="tx">${st.tx()}</div><div class="tk">J : passer le tutoriel</div>`;
    if (html !== T.html) { T.el.innerHTML = html; T.html = html; }
    const p = st.at && st.at();
    T.mark.visible = !!p;
    if (p) { const t = performance.now() / 1000; T.mark.position.set(p.x, (p.y || 1) + 1.6 + Math.sin(t * 4) * 0.25, p.z); T.mark.rotation.y = t * 2; T.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.15); }
  };
})();
