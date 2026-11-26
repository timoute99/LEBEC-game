/* =====================================================================
   tuto.js — TUTORIEL DE CARRIÈRE (ML.Tuto) : « Le Poly de Lebec ».
   Lebec parle dans un petit panneau (portrait + bulle) en bas à gauche,
   une étape à la fois, avec une BALISE 3D (faisceau + flèche qui rebondit)
   et une boussole dans le panneau pour montrer où aller.

   - LOCAL à chaque joueur (chacun voit le sien, ça ne bloque personne).
   - Chaque étape se valide toute seule en REGARDANT l'état réel de la
     partie (ML.Game.S) : aucune fausse action, aucune intention envoyée.
   - Lancé automatiquement au jour 1 d'une NOUVELLE carrière ; rejouable
     (LebecOS → 📕 Le Poly.pdf → « Revoir le tutoriel », ou F1 quand il
     est terminé). Progression gardée dans localStorage par carrière
     (graine + nom) : un rechargement reprend où on en était.
   - ASTUCES CONTEXTUELLES : une seule fois par profil (localStorage) :
     amende, crash, gendarmerie, panne, bac à copeaux, mini-jeu manuel,
     découvert, livraison de matière, caisse de machine (fenwick).
   - Clavier : F1 masquer / afficher (ou rejouer s'il est fini),
     F2 étape suivante. Les boutons marchent quand la souris est libre
     (PC du BE, pause…). Ne bloque jamais le jeu.

   Branchements : game.js appelle ML.Tuto.frame(dt) à chaque image ;
   be.js propose « Revoir le tutoriel » dans le Poly (ML.Tuto.replay()).
   ===================================================================== */
(function () {
  const T = ML.Tuto = { active: false };
  const U = ML.U, esc = s => U.esc(s == null ? '' : String(s));
  const ls = {
    get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plein ou interdit */ } }
  };
  const G = () => ML.Game;
  const St = () => (ML.Game && ML.Game.on ? ML.Game.S : null);
  const meP = () => { const S = St(); return S && S.pl ? S.pl[G().me] : null; };
  const stage = o => o.steps[o.si];
  const MAT = m => (ML.MATERIALS[m] || { label: m }).label;
  const TOOL = t => (ML.TOOLS[t] || { label: t }).label;
  const COMPN = c => (ML.COMPANIES[c] || { name: c }).name;
  const b = s => `<b>${s}</b>`;

  /* ======================= État ======================= */
  let el = null, rec = null, key = null, gameRef = null, logicT = 0, stepT = 0, lastStep = -1, lastSub = -1;
  let hidden = false, tip = null, tipT = 0, tipQ = [], seen = null, startPos = null, view = null, beacon = null, t0 = 0, prevTow = 0;
  const tipKey = () => 'ml_tuto_tips_' + ((ML.Account && ML.Account.name && ML.Account.name()) || 'local');
  const loadSeen = () => { seen = ls.get(tipKey()) || {}; };
  const save = () => { if (key && rec) ls.set(key, rec); };

  /* ======================= Contexte (calculé 5 fois / s) ======================= */
  function ctx() {
    const S = St(); if (!S || !S.car) return null;
    const g = G(), P = meP() || { inv: [] }, inv = (P.inv || []).filter(Boolean);
    const items = (S.items || []).map(a => ({ id: a[0], type: a[1], d: a[2] || {}, x: a[3], z: a[5] }));
    for (const it of items) { const iv = g.itemViews[it.id]; if (iv) { it.x = iv.target.x; it.z = iv.target.z; } }
    const isCrate = it => it && ['caisse', 'piece', 'palette'].includes(it.type) && it.d && it.d.oid;
    const crates = [];
    for (const it of items) if (isCrate(it)) crates.push({ where: 'sol', x: it.x, z: it.z, it });
    inv.forEach(it => { if (isCrate(it)) crates.push({ where: 'moi', it }); });
    for (const pid in S.pl) if (pid !== g.me) (S.pl[pid].inv || []).forEach(it => { if (isCrate(it)) crates.push({ where: 'pote', it }); });
    (S.cars || []).forEach((c, i) => (c.bed || []).concat(c.load ? [c.load] : []).forEach(it => { if (isCrate(it)) crates.push({ where: 'benne', car: i, it }); }));
    const jobs = []; for (const id in S.machines) { const M = S.machines[id]; if (M.job) jobs.push(Object.assign({ mid: id }, M.job)); }
    const todo = (S.orders || []).filter(o => stage(o) === 'usinage' && !o.m && !o.src);
    return { S, g, P, inv, items, crates, jobs, todo, car: S.car, pc: !!(ML.CareerUI && ML.CareerUI.isOpen) };
  }
  const tgt = (id, label) => { const t = ML.World.target(id); return t ? { x: t.x, z: t.z, label } : null; };
  const machTgt = mid => tgt('mach:' + mid, '⚙ ' + mid);
  const winOpen = id => !!document.querySelector(`#beos .be-win[data-id="${id}"]:not(.hidden)`);
  const pcTgt = () => tgt('be', '💻 PC du BE') || tgt('pc', '💻 PC du BE');
  /** machine qui convient pour la commande o (bon type, ouvrier présent, libre si possible) */
  function machFor(c, o) {
    const defs = (ML.MACHINES || []).filter(d => !o || d.type === o.mtype);
    const sc = d => { const M = c.S.machines[d.id] || {}; return (M.op ? 2 : 0) + (M.job ? 0 : 1) + (M.broken ? -3 : 0); };
    return defs.sort((a, b2) => sc(b2) - sc(a))[0] || null;
  }
  function carFor(c) {
    const me = c.g.p.pos; let best = null, bd = 1e9;
    (c.S.cars || []).forEach((sc, i) => {
      if (!sc.cap || ['tp', 'fenwick', 'camion'].includes(sc.kind)) return;
      const L = ML.Cars.list[i]; if (!L) return;
      const d = Math.hypot(L.pos.x - me.x, L.pos.z - me.z); if (d < bd) { bd = d; best = { i, x: L.pos.x, z: L.pos.z, name: sc.name }; }
    });
    return best;
  }
  const clientTgt = cl => { const L = ML.LOC.comp && ML.LOC.comp[cl]; return L ? { x: (L.npc || L).x, z: (L.npc || L).z, label: '🏭 ' + COMPN(cl) } : null; };
  const pcClosed = c => (c.pc ? '' : `<span class="tu-warn">Rallume le PC du BE (E) pour continuer.</span><br>`);

  /* ======================= Les étapes ======================= */
  const STEPS = [
    { id: 'hello', title: 'Bienvenue au Hangar Pourri !',
      text: () => `Moi c'est ${b('François Lebec')}. Ici c'est MON atelier… enfin, le tien maintenant. Un toit qui fuit, un tour de 1974 et un apprenti.<br>
        ${b('ZQSD')} marcher · ${b('souris')} regarder · ${b('Maj')} courir · ${b('E')} agir · ${b('G')} poser · ${b('molette')} changer de main.<br><span class="tu-dim">Fais quelques pas, qu'on voie si tu tiens debout.</span>`,
      done: c => { const p = c.g.p.pos; if (!startPos) startPos = { x: p.x, z: p.z }; return Math.hypot(p.x - startPos.x, p.z - startPos.z) > 4 || stepT > 40; } },
    { id: 'pc', title: 'Le PC du bureau d\'études',
      text: () => `Va au ${b('PC du BE')} (suis la balise jaune) et appuie sur ${b('E')}. C'est LebecOS 95 : devis, achats, personnel, travaux… tout se gère là. Comme en 1995. Mais en pire.`,
      where: () => pcTgt(), done: c => c.pc },
    { id: 'devis', title: 'Signer un devis', pc: true, glow: 'mail',
      text: c => `${pcClosed(c)}Ouvre ${b('📨 Lebec-Mail')} : ce sont les appels d'offres. ${b('ACCEPTE')} un devis faisable au ${b('TOUR')} (tu n'as que le vieux tour de 1974).<br><span class="tu-dim">Prix, quantité, délai en jours : un contrat pas fini à temps = pénalité. ⛰ Plateau = +70 %, mais faut y monter.</span>`,
      where: c => (c.pc ? null : pcTgt()),
      done: c => (c.car.contracts || []).length > 0 || (c.S.orders || []).some(o => o.contract) },
    { id: 'brut', title: 'Le ticket et le brut',
      text: c => {
        if (c.pc) return `Parfait. Maintenant ${b('ferme le PC')} (${b('Échap')}). Le travail, c'est dans l'atelier, pas sur Internet.`;
        const o = c.todo[0];
        if (!o) return `Un ${b('TICKET')} va arriver en haut de l'écran (pièce, matière, machine, outil, délai). Patience… c'est pas la Poste, mais presque.`;
        const st = c.S.stock[o.mat] || 0;
        return `Ticket ${b('#' + o.id)} : ${esc(o.part)} pour ${b(esc(COMPN(o.client)))}. Va aux ${b('racks')} prendre un ${b('brut ' + esc(MAT(o.mat)))} (E).` +
          (st <= 0 ? `<br><span class="tu-warn">Rupture de ${esc(MAT(o.mat))} ! Commande-en au PC (📦 Matière &amp; outils).</span>` : `<br><span class="tu-dim">Stock : ${st}. Trois mains maximum, Lebec n'en a que deux.</span>`);
      },
      where: c => { const o = c.todo[0]; return !c.pc && o ? tgt('rack:' + o.mat, '🧱 Brut ' + MAT(o.mat)) : null; },
      done: c => c.inv.some(it => /^brut_/.test(it.type)) || c.jobs.length > 0 || c.crates.length > 0 },
    { id: 'machine', title: 'Sur la machine !',
      text: c => {
        const br = c.inv.find(it => /^brut_/.test(it.type)), o = br ? c.todo.find(x => 'brut_' + x.mat === br.type) || c.todo[0] : c.todo[0], m = machFor(c, o);
        if (!br) return `Tu n'as plus de brut en main ! Retourne aux racks (ou change de main avec la ${b('molette')}).`;
        return `Apporte le brut à ${b(m ? esc(m.id + ' (' + m.name + ')') : 'la machine')} et appuie sur ${b('E')} : ${b('prise d\'origine')} (mini-jeu). Sois précis : C'EST ÉCRIT DANS LE POLY !!`;
      },
      where: c => { const br = c.inv.find(it => /^brut_/.test(it.type)); const o = br ? c.todo.find(x => 'brut_' + x.mat === br.type) || c.todo[0] : c.todo[0]; const m = machFor(c, o); return br && m ? machTgt(m.id) : (c.todo[0] ? tgt('rack:' + c.todo[0].mat, '🧱 Brut ' + MAT(c.todo[0].mat)) : null); },
      done: c => c.jobs.length > 0 || c.crates.length > 0 },
    { id: 'outil', title: 'Le bon outil',
      text: c => {
        const j = c.jobs.find(x => !x.tool); if (!j) return 'Ça tourne !';
        const has = c.inv.some(it => it.type === j.need);
        return has ? `Redonne ${b(esc(TOOL(j.need)))} à ${b(j.mid)} (E). L'apprenti lance la machine.` :
          `${b(j.mid)} attend son outil : ${b(esc(TOOL(j.need)))}. Va le prendre dans l'${b('armoire à outils')} (E), puis donne-le à la machine.<br><span class="tu-dim">Mauvais outil = l'ouvrier râle. Sauf le robot : lui, il usine n'importe quoi.</span>`;
      },
      where: c => { const j = c.jobs.find(x => !x.tool); if (!j) return null; return c.inv.some(it => it.type === j.need) ? machTgt(j.mid) : tgt('tool:' + j.need, '🧰 ' + TOOL(j.need)); },
      done: c => c.jobs.some(x => x.tool) || c.crates.length > 0 },
    { id: 'usinage', title: 'Ça usine…',
      text: c => {
        const j = c.jobs.find(x => x.tool), M = j && c.S.machines[j.mid], pct = j ? Math.floor(100 * j.prog / (j.total || 1)) : 0;
        let s = j ? `${b(j.mid)} usine la ${b('#' + j.oid)} : ${b(pct + ' %')}. ` : '';
        if (M && M.status === 'stop') s += `<span class="tu-warn">L'ouvrier ne bosse pas ! Une claque (clic gauche) ou E pour le secouer.</span> `;
        if (M && M.status === 'panne') s += '<span class="tu-warn">Panne ! Clé à molette.</span> ';
        return s + `Les ouvriers ont des défauts : flemme, faim, mémoire de poisson rouge… La pièce finie sortira en ${b('EXPÉDITION')}.`;
      },
      where: c => { const j = c.jobs.find(x => x.tool); return j ? machTgt(j.mid) : null; },
      done: c => c.crates.length > 0 },
    { id: 'livrer', title: 'Livraison !',
      text: c => {
        const cr = c.crates.find(x => x.where === 'moi') || c.crates.find(x => x.where === 'benne') || c.crates[0];
        const o = cr && (c.S.orders || []).find(x => x.id === cr.it.d.oid);
        if (!cr || !o) return 'Livre la caisse au client (E sur le client, caisse en main).';
        const cl = esc(COMPN(o.client)), plat = (ML.COMPANIES[o.client] || {}).plateau, big = cr.it.type === 'palette';
        let s = '';
        if (stage(o) === 'tth') s += `D'abord le ${b('traitement thermique')} chez TTH Ouest ! `;
        if (cr.where === 'sol') s += big ? `GROSSE pièce : ${b('fenwick')} (R : fourches) jusqu'au ${b('camion')}. ` : `Prends la caisse ${b('#' + o.id)} en EXPÉDITION (E). ${cr.it.d.ctl ? '' : `<span class="tu-dim">Bonus : passe-la au ${b('MARBRE')} (E) pour la contrôler au pied à coulisse : +5 et pas de refus « non conforme ».</span> `}`;
        else if (cr.where === 'moi') s += `Charge-la dans la ${b('benne')} d'un véhicule (E sur l'arrière), ou porte-la à pied si c'est tout près. `;
        else if (cr.where === 'benne') s += `Conduis jusqu'à ${b(cl)} (${b('Z/S Q/D')}, ${b('Espace')} frein), reprends la caisse dans la benne et donne-la au client (E). Doucement dans les virages : ça tombe ! `;
        s += `Client : ${b(cl)}.`;
        s += plat ? `<br>⛰ C'est sur le ${b('PLATEAU')} : la ${b('CORNICHE')} de la falaise est un raccourci… si tu tiens à ta Mégane, fais le grand tour.` :
          `<br><span class="tu-dim">Les clients du plateau paient +70 %. La corniche de la falaise y monte vite… si tu tiens à ta Mégane, fais le grand tour.</span>`;
        return s;
      },
      where: c => {
        const cr = c.crates.find(x => x.where === 'moi') || c.crates.find(x => x.where === 'benne') || c.crates.find(x => x.where === 'sol');
        if (!cr) return null;
        const o = (c.S.orders || []).find(x => x.id === cr.it.d.oid); if (!o) return null;
        if (stage(o) === 'tth') return clientTgt('tth') || clientTgt(Object.keys(ML.COMPANIES).find(k => ML.COMPANIES[k].kind === 'tth'));
        if (cr.where === 'sol') return { x: cr.x, z: cr.z, label: '📦 Caisse #' + o.id };
        const cl = clientTgt(o.client);
        if (cr.where === 'moi' && cl && c.g.p.car === null) { const p = c.g.p.pos, far = Math.hypot(cl.x - p.x, cl.z - p.z) > 50, car = far && carFor(c); if (car) return { x: car.x, z: car.z, label: '🚗 ' + car.name }; }
        return cl;
      },
      done: c => { rec.base = rec.base || {}; const s = c.S.served || 0; if (rec.base.served === undefined || s < rec.base.served) { rec.base.served = s; save(); } return s > rec.base.served; } },
    { id: 'gestion', title: 'La gestion (le vrai métier)', pc: true, subs: 5,
      glow: () => ['supply', 'staff', 'works', 'goals', null][rec.sub || 0],
      text: c => {
        const sub = rec.sub || 0, pre = sub > 0 && sub < 4 ? pcClosed(c) : '';
        return pre + [
          `Première pièce livrée, j'ai presque souri. Retourne au PC et ouvre ${b('📦 Matière & outils')} : la matière se commande ici, le camion la livre en zone ${b('LIVRAISONS')} → à porter en ${b('RÉCEPTION')} (E). Rupture de stock = ticket raté.`,
          `${b('👷 Personnel')} : affecte chaque ouvrier à une machine (menu « Poste »), embauche des candidats (ils arrivent demain matin). Un ouvrier sans poste boit du café à tes frais.`,
          `${b('🔨 Travaux')} : agrandir l'atelier, construire un magasin, une salle de pause… Un chantier par nuit : le BTP ne travaille pas quand les machines font du bruit.`,
          `${b('🏆 Objectifs')} : ma feuille de route. Chaque objectif atteint = une prime. Et un peu de respect.`,
          `Le soir à 19 h : ${b('salaires, électricité, loyer')}, pénalités des devis en retard, puis ${b('sauvegarde')} automatique. Sous ${b('−6 000 €')}, la banque reprend l'atelier (pas la pelle). Une ${b('machine achetée')} arrive en caisse : fenwick, puis E pour l'installer.<br>C'est tout. Le reste ? ${b('C\'EST ÉCRIT DANS LE POLY !!')} <span class="tu-dim">(F1 : revoir ce tuto)</span>`
        ][sub];
      },
      where: c => ((rec.sub || 0) < 4 && !c.pc ? pcTgt() : null),
      subDone: c => { const sub = rec.sub || 0; if (sub >= 4) return stepT > 40; return c.pc && winOpen(['supply', 'staff', 'works', 'goals'][sub]); },
      done: c => (rec.sub || 0) >= 5 }
  ];

  /* ======================= Astuces (une fois par profil) ======================= */
  const myName = c => (c.P && c.P.name) || '';
  const TIPS = [
    { id: 'amende', mad: true, test: c => (c.car.ledger || []).some(l => l.k === 'amende' && l.w === myName(c)),
      title: 'Ta première amende !', text: () => `Elle est à TON nom. Direction le ${b('MUR DE LA HONTE')} (PC → 📊 Compta). J'imprime le classement et je l'affiche à la machine à café.` },
    { id: 'crash', mad: true, test: c => (c.g.towT || 0) > 0,
      title: 'CRASH.', text: () => `Bravo. La ${b('dépanneuse')} te ramène à l'atelier… Et la caisse ? Par terre, quelque part. Conduis comme si tu transportais du verre. Ou ma pelle.` },
    { id: 'wanted', mad: true, test: c => !!(c.S.law && c.S.law.wanted && c.S.law.wanted[c.g.me]),
      title: 'La gendarmerie te recherche !', text: () => `Deux passants renversés (ou un passant + un radar) = ${b('RECHERCHÉ')}. Sème-les… ou c'est la ${b('cellule')} : 45 s minimum. Un collègue peut payer la caution (300 €).` },
    { id: 'panne', mad: true, test: c => Object.keys(c.S.machines).some(k => c.S.machines[k].broken),
      where: c => { const k = Object.keys(c.S.machines).find(m => c.S.machines[m].broken); return k ? machTgt(k) : null; },
      title: 'Machine EN PANNE !', text: () => `Prends la ${b('clé à molette')} et E sur la machine (rôle ${b('maintenance')}) : mini-jeu de serrage. Avec un tour de 1974, habitue-toi.` },
    { id: 'copeaux', test: c => Object.keys(c.S.machines).some(k => { const M = c.S.machines[k]; return M.bin === false || M.chips >= 100; }),
      where: c => { const k = Object.keys(c.S.machines).find(m => { const M = c.S.machines[m]; return M.bin === false || M.chips >= 100; }); return k ? tgt('bac:' + k, '🗑 Bac ' + k) : null; },
      title: 'Bac à copeaux PLEIN', text: () => `La machine s'arrête. Prends le ${b('bac')} (E, rôle maintenance), vide-le dans la ${b('BENNE')} dehors, remets-le. Les copeaux par terre, ça prend feu. Si si.` },
    { id: 'mini3d', test: () => ML.ui.modal === 'mini3d',
      title: 'Machine manuelle : c\'est TOI qui usines', text: () => `Suis les consignes à l'écran. ${b('Échap')} = abandon = pièce ratée. Une machine à ${b('commande numérique')}, elle, fait (presque) tout toute seule.` },
    { id: 'faillite', mad: true, test: c => c.car.money < 0,
      title: 'La caisse est dans le ROUGE', text: () => `Découvert autorisé jusqu'à ${b('−3 000 €')} pour acheter ; sous ${b('−6 000 €')} le soir, c'est la ${b('FAILLITE')}. Livre des pièces, refuse les devis impossibles, licencie… (pas moi).` },
    { id: 'matiere', test: c => c.items.some(it => it.type === 'matiere'),
      where: c => { const it = c.items.find(x => x.type === 'matiere'); return it ? { x: it.x, z: it.z, label: '📦 Livraison' } : null; },
      title: 'Le camion est passé', text: () => `De la matière attend en zone ${b('LIVRAISONS')} : porte les caisses en ${b('RÉCEPTION')} (E) pour remplir le stock. Pas de magasin = pas de rangement automatique.` },
    { id: 'machine', dur: 30, test: c => c.items.some(it => it.type === 'machine'),
      where: c => { const it = c.items.find(x => x.type === 'machine'); return it ? { x: it.x, z: it.z, label: '🏭 Caisse machine' } : null; },
      title: 'Ta machine est arrivée !', text: () => `Elle est en CAISSE en zone LIVRAISONS et pèse une tonne : ${b('FENWICK')} (cariste) ou ${b('TRANSPALETTE')}, ${b('R')} pour lever / poser. Pose-la DANS l'atelier, descends, ${b('E')} sur la caisse : fantôme ${b('VERT')} = OK, ${b('ROUGE')} = pas la place (tourne-toi pour la pivoter). Clé à molette en main = 2× plus vite.` }
  ];

  /* ======================= Panneau ======================= */
  const FACE = `<svg viewBox="0 0 120 120" aria-hidden="true">
    <g transform="rotate(-28 92 60)"><rect x="88" y="-4" width="8" height="96" rx="3" fill="#b07b46" stroke="#22262d" stroke-width="4"/><rect x="81" y="-8" width="22" height="10" rx="5" fill="#e94f37" stroke="#22262d" stroke-width="4"/>
      <path d="M78 88h32v20c0 11-7 19-16 23-9-4-16-12-16-23z" fill="#c9ced4" stroke="#22262d" stroke-width="4" stroke-linejoin="round"/></g>
    <path d="M14 122 q2 -34 46 -35 q44 1 46 35z" fill="#24457a" stroke="#22262d" stroke-width="4"/><path d="M50 88 l10 16 l10 -16" fill="#fbf5e6" stroke="#22262d" stroke-width="3"/>
    <circle cx="60" cy="54" r="31" fill="#f0c8a0" stroke="#22262d" stroke-width="4"/>
    <path d="M31 50 q-5 -8 4 -11 M89 50 q5 -8 -4 -11" stroke="#7a7068" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M52 24 q4 -9 10 -1" stroke="#7a7068" stroke-width="4" fill="none" stroke-linecap="round"/>
    <g class="tu-brows"><path d="M40 42 l13 4 M80 42 l-13 4" stroke="#22262d" stroke-width="4.5" stroke-linecap="round"/></g>
    <circle cx="48" cy="53" r="3.6" fill="#22262d"/><circle cx="72" cy="53" r="3.6" fill="#22262d"/>
    <ellipse cx="60" cy="62" rx="5.5" ry="4.5" fill="#e8a888" stroke="#22262d" stroke-width="2.5"/>
    <path d="M42 71 q18 -10 36 0 q-7 6 -18 3 q-11 3 -18 -3z" fill="#5b4a3f" stroke="#22262d" stroke-width="3" stroke-linejoin="round"/>
    <path class="tu-mouth" d="M51 79 q9 4 18 0" stroke="#22262d" stroke-width="3" fill="#7a2a22" stroke-linecap="round"/>
  </svg>`;
  function build() {
    el = document.createElement('div'); el.id = 'tuto'; el.className = 'hidden';
    el.innerHTML = `<div class="tu-face">${FACE}<span class="tu-name">M. LEBEC</span></div>
      <div class="tu-bub"><div class="tu-h"><b class="tu-t"></b><span class="tu-n"></span></div><div class="tu-x"></div>
        <div class="tu-f"><span class="tu-dir hidden"><i>➤</i><b></b></span><span class="tu-k">F1 masquer · F2 suivant</span>
          <button class="tu-b skip" data-tu="skip">Passer</button><button class="tu-b next" data-tu="next">Suivant ▸</button></div></div>
      <div class="tu-mini" data-tu="show">📕 Lebec <b>F1</b></div>`;
    document.body.appendChild(el);
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      e.stopPropagation();
      const a = e.target.closest('[data-tu]'); if (!a) return;
      const k = a.dataset.tu;
      if (k === 'show') { hidden = false; render(true); }
      else if (k === 'next') T.next();
      else if (k === 'skip') { if (tip) closeTip(); else if (rec && T.active && confirm('Passer le tutoriel ? (Tu pourras le revoir depuis LebecOS → 📕 Le Poly.pdf, ou F1.)')) T.skip(); }
    });
  }
  let lastHtml = '', talkT = 0;
  function render(force) {
    if (!el) build();
    const g = G(), live = g && g.on && !g.ended && St() && St().car;
    const show = live && (tip || T.active);
    el.classList.toggle('hidden', !show);
    document.body.classList.toggle('tuto-on', !!(show && !hidden));
    if (!show) return;
    el.classList.toggle('min', hidden);
    el.classList.toggle('pc', !!(ML.CareerUI && ML.CareerUI.isOpen));
    el.classList.toggle('tip', !!tip);
    el.classList.toggle('mad', !!(tip && tip.mad));
    const c = view; if (!c && !force) return;
    let title, txt, n;
    if (tip) { title = '💡 ' + tip.title; txt = tip.text(c); n = 'astuce'; }
    else {
      const s = STEPS[rec.step]; if (!s) return;
      title = s.title; n = `${rec.step + 1}/${STEPS.length}`;
      try { txt = c ? s.text(c) : ''; } catch (e) { txt = ''; }
      if (s.okT > 0) { title = '✔ ' + title; }
    }
    const h = title + '|' + txt + '|' + n;
    if (h !== lastHtml || force) {
      if (h.split('|')[0] !== lastHtml.split('|')[0]) { talkT = 1.6; el.classList.add('talk'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      lastHtml = h;
      el.querySelector('.tu-t').textContent = title; el.querySelector('.tu-n').textContent = n;
      el.querySelector('.tu-x').innerHTML = txt;
      el.querySelector('[data-tu="skip"]').textContent = tip ? 'OK' : 'Passer';
      el.querySelector('[data-tu="next"]').classList.toggle('hidden', !!tip);
      el.querySelector('.tu-k').textContent = tip ? 'F1 masquer · F2 OK' : 'F1 masquer · F2 suivant';
    }
    // icône LebecOS à montrer
    const s = !tip && T.active && STEPS[rec.step];
    const glow = s ? (typeof s.glow === 'function' ? s.glow() : s.glow) : null;
    for (const ic of document.querySelectorAll('#beos .be-icon')) ic.classList.toggle('tu-glow', !!glow && ic.dataset.app === glow);
  }

  /* ======================= Balise 3D ======================= */
  function makeBeacon() {
    const g = new THREE.Group(), col = 0xffc93c;
    const mat = (o, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: col, transparent: true, opacity: o, depthWrite: false }, extra || {}));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 18, 10, 1, true), mat(0.28, { side: THREE.DoubleSide })); beam.position.y = 9; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 28), mat(0.9, { side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    const arrow = new THREE.Group(); g.add(arrow);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 4), new THREE.MeshBasicMaterial({ color: col, depthTest: false })); cone.rotation.x = Math.PI; arrow.add(cone);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), new THREE.MeshBasicMaterial({ color: col, depthTest: false })); stem.position.y = 0.65; arrow.add(stem);
    cone.renderOrder = stem.renderOrder = 11;
    const edge = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.92, 4), new THREE.MeshBasicMaterial({ color: 0x22262d, side: THREE.BackSide, depthTest: false })); edge.rotation.x = Math.PI; arrow.add(edge); edge.renderOrder = 10;
    const label = U.label('', { size: 0.55, color: '#ffc93c', depthTest: false }); label.position.y = 3.9; g.add(label);
    g.userData = { ring, arrow, label };
    return g;
  }
  function placeBeacon(w, dt) {
    if (!w || hidden || (ML.CareerUI && ML.CareerUI.isOpen)) { if (beacon) beacon.visible = false; return; }
    if (!beacon) beacon = makeBeacon();
    if (beacon.parent !== ML.scene) ML.scene.add(beacon);
    t0 += dt;
    const p = G().p.pos, d = Math.hypot(w.x - p.x, w.z - p.z), k = U.clamp(d / 22, 1, 5);
    beacon.visible = d > 1.2;
    beacon.position.set(w.x, ML.Terrain.h(w.x, w.z), w.z);
    const D = beacon.userData;
    D.arrow.position.y = (2.5 + Math.abs(Math.sin(t0 * 3.2)) * 0.5) * (k > 1 ? 1 + (k - 1) * 0.6 : 1); D.arrow.rotation.y = t0 * 2; D.arrow.scale.setScalar(k);
    D.ring.scale.setScalar(1 + (t0 * 0.8) % 1);
    D.label.setText((w.label || 'Par ici') + (d > 8 ? ` · ${Math.round(d)} m` : ''));
    D.label.position.y = D.arrow.position.y + 1.3 * k; D.label.scale.set(0.55 * k * 512 / 96, 0.55 * k, 1);
  }
  /** boussole du panneau : flèche vers la cible par rapport au regard */
  function compass(w) {
    const box = el && el.querySelector('.tu-dir'); if (!box) return;
    if (!w || (ML.CareerUI && ML.CareerUI.isOpen)) { box.classList.add('hidden'); return; }
    const cam = ML.camera, f = cam.getWorldDirection(new THREE.Vector3()), p = G().p.pos;
    const a = (vx, vz) => Math.atan2(vx, -vz);
    let r = a(w.x - p.x, w.z - p.z) - a(f.x, f.z); while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI;
    const d = Math.hypot(w.x - p.x, w.z - p.z);
    box.classList.remove('hidden');
    box.querySelector('i').style.transform = `rotate(${(r * 180 / Math.PI - 90).toFixed(0)}deg)`;
    box.querySelector('b').textContent = d < 2 ? 'ici !' : Math.round(d) + ' m';
  }

  /* ======================= Logique ======================= */
  function setStep(i, sub) {
    rec.step = i; rec.sub = sub || 0; stepT = 0; startPos = null; save();
    try { ML.Sfx.play('bip', 0.4); } catch (e) { /* son facultatif */ }
  }
  function finish() {
    rec.done = true; rec.step = STEPS.length; save(); T.active = false;
    if (ML.HUD) { ML.HUD.big('📕 Tuto terminé : au boulot !', '#ffc93c'); ML.HUD.notify('📕 Tutoriel terminé. F1 (ou LebecOS → Le Poly.pdf) pour le revoir.', 'good'); }
    if (beacon) beacon.visible = false;
  }
  function closeTip() { tip = null; tipT = 0; render(true); }
  let okHold = 0;
  function logic(dt) {
    const c = view = ctx(); if (!c) return;
    // astuces
    if (seen) for (const tp of TIPS) {
      if (seen[tp.id] || (tip && tip.id === tp.id) || tipQ.includes(tp)) continue;
      let hit = false; try { hit = tp.test(c); } catch (e) { hit = false; }
      if (hit) { seen[tp.id] = Date.now(); ls.set(tipKey(), seen); tipQ.push(tp); }
    }
    if (!tip && tipQ.length) { tip = tipQ.shift(); tipT = tip.dur || 16; try { ML.Sfx.play('bip', 0.5); } catch (e) { /* rien */ } }
    if (tip) { tipT -= dt; if (tipT <= 0) tip = null; }
    // étape
    if (T.active) {
      const s = STEPS[rec.step];
      if (!s) { finish(); return; }
      stepT += dt;
      if (s.subs) {
        if (rec.sub !== lastSub) { lastSub = rec.sub; okHold = 0; }
        let sd = false; try { sd = s.subDone(c); } catch (e) { sd = false; }
        if (sd && stepT > 1.5) { rec.sub = (rec.sub || 0) + 1; stepT = 0; save(); try { ML.Sfx.play('bip', 0.4); } catch (e) { /* rien */ } }
      }
      let ok = false; try { ok = s.done(c); } catch (e) { ok = false; }
      if (ok) {
        s.okT = (s.okT || 0) + dt;                           // petit temps de lecture avant l'étape suivante
        if (s.okT > (stepT < 2.5 ? 2.5 - stepT + 0.6 : 0.6)) { s.okT = 0; setStep(rec.step + 1); if (!STEPS[rec.step]) finish(); }
      } else s.okT = 0;
    }
  }
  function where(c) {
    if (!c) return null;
    try {
      if (tip && tip.where) { const w = tip.where(c); if (w) return w; }
      if (T.active && STEPS[rec.step] && STEPS[rec.step].where) return STEPS[rec.step].where(c);
    } catch (e) { return null; }
    return null;
  }

  /** Nouvelle session de jeu : retrouve la progression de cette carrière */
  function begin() {
    const g = G(), S = St(), lay = (g.game && g.game.career) || {};
    key = 'ml_tuto_' + (lay.seed || 'x') + '_' + String(lay.name || S.car.name || '').slice(0, 40);
    loadSeen(); tip = null; tipQ = []; hidden = false; lastHtml = ''; lastSub = -1;
    rec = ls.get(key);
    if (!rec) { if (S.car.day === 1) { rec = { step: 0, sub: 0 }; save(); } else rec = { done: true, auto: true }; }
    T.active = !rec.done && !rec.skipped;
    stepT = 0; startPos = null;
  }

  /* ======================= API ======================= */
  T.frame = dt => {
    const g = G();
    if (!g || !g.on) return;
    const S = St();
    if (!S || !S.car) { if (gameRef !== g.game) { gameRef = g.game; T.active = false; } if (el) render(); return; }
    if (gameRef !== g.game) { gameRef = g.game; begin(); render(true); }
    if (g.ended) { if (beacon) beacon.visible = false; render(); return; }
    logicT -= dt;
    if (logicT <= 0) { logicT = 0.2; logic(0.2); render(); }
    if (talkT > 0) { talkT -= dt; if (talkT <= 0 && el) el.classList.remove('talk'); }
    const w = where(view);
    placeBeacon(w, dt); if (!hidden) compass(w);
  };
  /** Étape suivante (bouton « Suivant » ou F2) */
  T.next = () => {
    if (tip) return closeTip();
    if (!T.active || !rec) return;
    const s = STEPS[rec.step];
    if (s && s.subs && (rec.sub || 0) < s.subs - 1) { rec.sub = (rec.sub || 0) + 1; stepT = 0; save(); }
    else { setStep(rec.step + 1); if (!STEPS[rec.step]) finish(); }
    render(true);
  };
  T.skip = () => { if (!rec) return; rec.skipped = true; save(); T.active = false; if (beacon) beacon.visible = false; render(true); if (ML.HUD) ML.HUD.notify('📕 Tutoriel passé. LebecOS → Le Poly.pdf (ou F1) pour le revoir.'); };
  /** Recommencer le tutoriel (depuis LebecOS ou F1) */
  T.replay = () => {
    const g = G(); if (!g || !g.on || !St() || !St().car) { if (ML.HUD) ML.HUD.notify('Le tutoriel se joue en mode Carrière.', 'warn'); return; }
    if (gameRef !== g.game) { gameRef = g.game; begin(); }
    rec = { step: 0, sub: 0, base: {} }; STEPS.forEach(s => { s.okT = 0; }); save(); T.active = true; hidden = false; stepT = 0; startPos = null; render(true);
  };
  T.toggle = () => {
    if (!T.active && !tip) return T.replay();
    hidden = !hidden; if (beacon && hidden) beacon.visible = false; render(true);
  };
  /** Pour les tests : état courant */
  T.state = () => ({ active: T.active, rec: rec && JSON.parse(JSON.stringify(rec)), step: rec && STEPS[rec.step] ? STEPS[rec.step].id : null, tip: tip && tip.id, hidden });
  T.STEPS = STEPS; T.TIPS = TIPS;

  window.addEventListener('keydown', e => {
    if (e.code !== 'F1' && e.code !== 'F2') return;
    const g = G(); if (!g || !g.on || !St() || !St().car) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'F1') T.toggle(); else T.next();
  });
  // partie arrêtée (retour au menu) : on range le panneau et la balise
  setInterval(() => { const g = G(); if (!(g && g.on)) { if (el) el.classList.add('hidden'); document.body.classList.remove('tuto-on'); if (beacon) beacon.visible = false; gameRef = null; } }, 500);
})();
