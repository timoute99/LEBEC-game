/* =====================================================================
   sim_build.js — MACHINES : déplacement, installation, désinstallation.
   (mode carrière ; inactif sinon)

   Parcours d'une machine achetée au PC du BE :
   1. le camion la livre en CAISSE SUR PALETTE (objet lourd
      { type:'machine', d:{ uid, model } }) en zone LIVRAISONS ;
   2. on la déplace au FENWICK (cariste, R : fourches) ou au TRANSPALETTE
      (R : lever / poser la caisse, fourches à l'arrière) dans l'atelier ;
   3. à pied, E sur la caisse posée DANS l'atelier → intention
      { a:'install', id, rot } (rot = regard du joueur en quarts de tour).
      L'hôte vérifie la place (ML.Place.valid), puis ~4 s d'installation
      (2 s avec la clé à molette en main), le joueur doit rester à côté.
      Fin : la caisse disparaît, la machine rejoint S.machDefs / S.machines,
      l'ouvrier qui lui était affecté reprend son poste (K.rehome).
   4. E sur une machine avec la CLÉ À MOLETTE → { a:'uninstall', mid } :
      la machine redevient une caisse à son emplacement (si aucune pièce
      en cours). L'ouvrier garde son affectation (S.car.workers[].assign)
      mais attend au coin café jusqu'à la réinstallation.

   Partagé hôte / clients (ML.Place) :
   - Place.valid(def) → { ok, why } : même règle pour l'hôte et pour
     l'aperçu (fantôme vert / rouge). « Place » et non « Build » : ML.Build
     est le kit de construction de la ville.
   - Place.sync(S) : appelée à chaque état reçu (game.js) : si S.machDefs a
     changé → ML.MACHINES remplacé sur place + World.syncMachines.
   - Place.frame(dt) : chaque image (game.js) : fantôme de placement et
     étiquettes de progression des caisses.
   - Place.crateLabel / Place.use / Place.uninstallLabel : textes [E] et
     déclenchement (rules.js).

   API du monde utilisée (world_atelier.js) : W.atelierBounds,
   W.machineFootprint, W.syncMachines, W.machineGhost. Si elle manque
   (atelier en cours de refonte), des valeurs de secours sont calculées ici
   et la scène n'est simplement pas mise à jour (message en console).

   Ce module est placé EN TÊTE de Sim.mods : il intercepte « fork » pour le
   transpalette et l'E sur un transpalette qui porte une caisse machine.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, W = ML.World;
  const mod = {}; Sim.mods.unshift(mod);
  const Q = Math.PI / 2;
  const INSTALL_SEC = 4, REACH = 4;

  /* ======================= Partagé : géométrie et validation ======================= */
  const PL = ML.Place = {};
  /** Regard (yaw du joueur) → quarts de tour 0..3 */
  PL.rotOf = yaw => ((Math.round(yaw / Q) % 4) + 4) % 4;
  /** Définition complète d'une machine (catalogue + position) */
  PL.defFor = (uid, model, x, z, rot, wear) => ML.Career.machineDef({ uid, model, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, rot: rot | 0, wear: wear || 0 });
  PL.name = model => { const M = ML.CAREER.MACHINES[model]; return M ? M.name : model; };

  /** Zone d'installation (secours : la boîte du bâtiment moins 1,2 m de mur) */
  PL.bounds = () => {
    if (W.atelierBounds) return W.atelierBounds();
    const b = (ML.ATELIER && ML.ATELIER.box) || { minX: -20, maxX: 20, minZ: -14, maxZ: 14 }, m = 1.2;
    return { minX: b.minX + m, maxX: b.maxX - m, minZ: b.minZ + m, maxZ: b.maxZ - m };
  };
  /** Emprise au sol, place de l'opérateur comprise (secours : mêmes cotes que l'ancien atelier) */
  PL.footprint = def => {
    if (W.machineFootprint) return W.machineFootprint(def);
    // rectangle local (rot = 0) : fraiseuse 2,3 × 2,3 + opérateur devant (−z) ; tour len × 1,4 + opérateur derrière (+z)
    const r = def.type === 'fraiseuse' ? [-1.15, 1.15, -2.45, 1.15] : [-(def.len || 4) / 2, (def.len || 4) / 2, -0.7, 2.15];
    const a = (def.rot || 0) * Q, c = Math.cos(a), s = Math.sin(a), out = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 };
    for (const x of [r[0], r[1]]) for (const z of [r[2], r[3]]) {
      const wx = def.x + x * c + z * s, wz = def.z - x * s + z * c;
      out.minX = Math.min(out.minX, wx); out.maxX = Math.max(out.maxX, wx); out.minZ = Math.min(out.minZ, wz); out.maxZ = Math.max(out.maxZ, wz);
    }
    return out;
  };
  const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  const TAGS = { wall: 'le mur', rack: 'un rack', bench: 'un établi', cabinet: "l'armoire", desk: 'le bureau', pc: 'le PC', printer: "l'imprimante", marbre: 'le marbre', coffee: 'la machine à café', frigo: 'le frigo', babyfoot: 'le babyfoot', casiers: 'les casiers', casques: 'le râtelier à casques', compresseur: 'le compresseur', futs: 'les fûts', palettes: 'les palettes', potelet: 'un poteau', panneau: 'un panneau', benne: 'la benne' };
  /** Peut-on installer cette machine ici ? → { ok, why } */
  PL.valid = def => {
    const b = PL.bounds();
    if (def.x < b.minX || def.x > b.maxX || def.z < b.minZ || def.z > b.maxZ) return { ok: false, why: "Hors de l'atelier" };
    const f = PL.footprint(def);
    if (f.minX < b.minX || f.maxX > b.maxX || f.minZ < b.minZ || f.maxZ > b.maxZ) return { ok: false, why: 'Trop près du mur' };
    for (const o of ML.MACHINES) if (o.id !== def.id && overlap(f, PL.footprint(o))) return { ok: false, why: `Ça chevauche ${o.id}` };
    // meubles, murs intérieurs… : on échantillonne l'emprise (les machines sont déjà traitées ci-dessus, la caisse n'a pas de collider)
    const step = 0.35;
    for (let x = f.minX + 0.05; x <= f.maxX - 0.05 + 1e-6; x += step) for (let z = f.minZ + 0.05; z <= f.maxZ - 0.05 + 1e-6; z += step) {
      for (const c of U.nearColliders(x, z, 1)) {
        if (c.tag === 'machine' || c.tag === 'crate' || !(x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ)) continue;
        if (c.tag === 'wall' || c.tag === 'mur') return { ok: false, why: 'Trop près du mur' };
        return { ok: false, why: `Ça touche ${TAGS[c.tag] || 'un meuble'}` };
      }
    }
    return { ok: true, why: '' };
  };

  /* ======================= Partagé : synchro de la scène ======================= */
  let lastKey = null, lastRoot = null, warned = false;
  /** État reçu (ou modifié chez l'hôte) : si la liste des machines a changé, la scène suit */
  PL.sync = S => {
    if (!S || !S.machDefs) return;
    if (W.root !== lastRoot) { lastRoot = W.root; lastKey = null; }       // nouvelle partie
    const key = JSON.stringify(S.machDefs);
    if (key === lastKey) return;
    if (lastKey === null && key === JSON.stringify(ML.MACHINES)) { lastKey = key; return; }   // déjà construit par World.build
    lastKey = key;
    ML.MACHINES.length = 0; for (const d of S.machDefs) ML.MACHINES.push(Object.assign({}, d));
    if (W.syncMachines) W.syncMachines(S.machDefs);
    else if (!warned) { warned = true; console.warn('[sim_build] ML.World.syncMachines absent : la scène des machines n\'est pas mise à jour.'); }
  };

  /* ======================= HÔTE ======================= */
  let S, inst = null;
  const on = () => !!(K.careerOn && K.careerOn() && S && S.machDefs);
  const wid = w => w.legend || 'w_' + w.uid;
  const rebuildOpOf = () => { K.opOf = {}; for (const k in S.machines) if (S.machines[k].op) K.opOf[S.machines[k].op] = k; };

  mod.init = () => { S = K.S; inst = S.inst = {}; };

  mod.act = (pid, P, ps, sel, held, m) => {
    switch (m.a) {
      case 'install': if (!on()) return false; install(pid, P, ps, held, +m.id, m.rot); return true;
      case 'uninstall': if (!on()) return false; uninstall(pid, P, ps, held, String(m.mid || '')); return true;
      case 'fork': {                                        // transpalette : R lève / pose une caisse machine
        const c = S.cars[P.car]; if (!c || c.kind !== 'tp' || c.dr !== pid) return false;
        tpFork(pid, c); return true;
      }
    }
    return false;
  };
  /** E à l'arrière d'un transpalette qui porte une caisse machine : on ne charge rien de plus */
  mod.use = (pid, P, ps, sel, held, kind, a, b) => {
    if (kind !== 'car' || b === 'door') return false;
    const c = S.cars[+a]; if (!c || c.kind !== 'tp' || !c.bed.some(x => x && x.type === 'machine')) return false;
    K.note(pid, '🏭 Le transpalette porte une caisse MACHINE : conduis-le (E côté timon) et R pour la poser.', 'warn');
    return true;
  };

  function tpFork(pid, c) {
    const f = { x: Math.sin(c.h), z: Math.cos(c.h) }, px = c.x - f.x * 1.6, pz = c.z - f.z * 1.6;
    const j = c.bed.findIndex(x => x && x.type === 'machine');
    if (j >= 0) {                                            // poser
      const it = c.bed.splice(j, 1)[0]; K.spawnItem(it, px, 0, pz); K.sfx('drop', px, pz);
      K.note(pid, `🏭 ${PL.name(it.d.model)} posée. Dans l'atelier : E à pied pour l'installer.`, 'good');
    } else {
      const o = S.items.filter(x => x.type === 'machine' && x.rest && Math.hypot(x.x - px, x.z - pz) < 2.6).sort((p, q) => Math.hypot(p.x - px, p.z - pz) - Math.hypot(q.x - px, q.z - pz))[0];
      if (!o) { K.note(pid, 'Rien à lever : recule les fourches (arrière du transpalette) contre une caisse MACHINE, puis R.'); return; }
      if (c.bed.length) { K.note(pid, 'Décharge d\'abord les caisses du transpalette.', 'warn'); return; }
      if (inst[o.id]) delete inst[o.id];
      c.bed.push(K.strip(o)); K.removeItem(o); K.sfx('pickup', px, pz);
      K.note(pid, `🏭 ${PL.name(o.d.model)} levée ! Emmène-la dans l'atelier (R pour poser).`, 'good');
    }
    Sim.dirty = true;
  }

  function install(pid, P, ps, held, itemId, rot) {
    const o = S.items.find(x => x.id === itemId && x.type === 'machine'); if (!o) return;
    if (!K.near(ps, o.x, o.z, REACH)) return K.note(pid, 'Approche-toi de la caisse.', 'warn');
    if (inst[o.id]) return K.note(pid, 'Installation déjà en cours.', 'warn');
    if (!K.foot(P)) return;
    rot = U.clamp(rot | 0, 0, 3);
    const def = PL.defFor(o.d.uid, o.d.model, o.x, o.z, rot, o.d.wear);
    const v = PL.valid(def);
    if (!v.ok) return K.note(pid, `⛔ Impossible d'installer ici : ${v.why}.`, 'warn');
    const cle = !!(held && held.type === 'cle'), dur = INSTALL_SEC * (cle ? 0.5 : 1);
    inst[o.id] = { pid, t0: S.rt, dur, uid: o.d.uid, model: o.d.model, rot, x: o.x, z: o.z };
    K.all(`🔧 ${P.name} installe ${def.name}${cle ? ' (avec la clé à molette)' : ''}…`, 'info'); K.sfx('clang', o.x, o.z);
    Sim.dirty = true;
  }

  mod.step = dt => {
    if (!inst) return;
    for (const id in inst) {
      const j = inst[id], o = S.items.find(x => x.id === +id), P = S.pl[j.pid], ps = K.pose[j.pid];
      const fail = why => { delete inst[id]; Sim.dirty = true; if (P) K.note(j.pid, `⛔ Installation interrompue : ${why}.`, 'warn'); };
      if (!o || Math.hypot(o.x - j.x, o.z - j.z) > 0.3) { fail('la caisse a bougé'); continue; }
      if (!P || !ps || P.ko || !K.near(ps, o.x, o.z, REACH + 0.5)) { fail('reste à côté de la caisse'); continue; }
      if (S.rt < j.t0 + j.dur) continue;
      const def = PL.defFor(j.uid, j.model, o.x, o.z, j.rot, o.d.wear), v = PL.valid(def);
      if (!v.ok) { fail(v.why); continue; }
      delete inst[id]; K.removeItem(o);
      addMachine(def);
      K.all(`✅ ${def.name} installée (${def.id}) par ${P.name} ! Affecte un ouvrier depuis le PC du BE.`, 'good'); K.sfx('success', def.x, def.z);
    }
  };

  function addMachine(def) {
    S.machDefs.push(def);
    const M = S.machines[def.id] = { status: 'idle', job: null, op: null, wear: def.wear || 0, broken: false, chips: 0, bin: true };
    PL.sync(S);                                              // ML.MACHINES + scène (colliders, cibles, W.machines)
    // ouvrier affecté avant le déplacement : il reprend sa place
    const w = S.car && S.car.workers.find(x => x.assign === def.id);
    if (w && K.npcs[wid(w)] && !Object.values(S.machines).some(x => x.op === wid(w))) { M.op = wid(w); rebuildOpOf(); if (K.rehome) K.rehome(def.id); }
    Sim.dirty = true;
  }

  function uninstall(pid, P, ps, held, mid) {
    const M = S.machines[mid], def = S.machDefs.find(d => d.id === mid); if (!M || !def) return;
    if (!held || held.type !== 'cle') return K.note(pid, 'Il faut la CLÉ À MOLETTE en main pour désinstaller.', 'warn');
    if (!K.near(ps, def.x, def.z, 5)) return K.note(pid, 'Approche-toi de la machine.', 'warn');
    if (M.job) return K.note(pid, `${mid} usine la #${M.job.oid} : attends la fin de la pièce.`, 'warn');
    if (M.broken) return K.note(pid, `${mid} est en panne : répare-la d'abord.`, 'warn');
    if (K.fireAt && K.fireAt(mid)) return K.note(pid, `${mid} est en FEU !`, 'warn');
    // l'ouvrier garde son affectation (S.car.workers[].assign) mais attend au coin café
    const n = M.op && K.npcs[M.op];
    if (n) { n.mid = null; n.home = null; n.state = 'idle'; const sp = (ML.LOC.idle || ML.LOC.coffee)[0]; K.walkTo(n, sp.x + K.rng() * 2 - 1, sp.z + K.rng() * 2 - 1); K.say(n, 'Bon, je vais prendre un café en attendant.'); }
    delete S.machines[mid]; if (K.issueT) delete K.issueT[mid];
    S.machDefs.splice(S.machDefs.indexOf(def), 1);
    rebuildOpOf(); PL.sync(S);
    K.spawnItem({ type: 'machine', d: { uid: def.id, model: def.model, wear: Math.round(M.wear || 0) } }, def.x, 0, def.z);
    K.all(`🔧 ${P.name} a désinstallé ${mid} (${def.name}) : elle est en caisse, prête à déplacer.`, 'info'); K.sfx('clang', def.x, def.z);
    Sim.dirty = true;
  }

  /* ======================= CLIENT : textes [E] ======================= */
  const GS = () => ML.Game.S;
  const instOf = id => { const S2 = GS(); return S2 && S2.inst && S2.inst[id]; };
  const pct = j => Math.max(0, Math.min(99, Math.floor(100 * ((ML.Game.rt || 0) - j.t0) / j.dur)));
  const inBounds = (x, z) => { const b = PL.bounds(); return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ; };
  /** Texte [E] d'une caisse machine (iv = vue de l'objet : { id, d, mesh }) */
  PL.crateLabel = iv => {
    const S2 = GS(); if (!S2) return null;
    const nm = PL.name(iv.d.model), j = instOf(iv.id), p = iv.mesh.position;
    if (j) return `⏳ Installation de ${nm} : ${pct(j)} %`;
    if (!S2.machDefs) return `🏭 ${nm}`;
    if (!inBounds(p.x, p.z)) return `🏭 ${nm} : trop lourd ! Fenwick (cariste) ou transpalette → dans l'atelier`;
    const v = PL.valid(PL.defFor(iv.d.uid, iv.d.model, p.x, p.z, PL.rotOf(ML.Game.p.yaw), iv.d.wear));
    return v.ok ? `🔧 Installer : ${nm} (≈${INSTALL_SEC} s, plus vite avec la clé)` : `⛔ ${nm} : ${v.why}`;
  };
  /** E sur une caisse machine : envoie l'intention d'installation (true = géré) */
  PL.use = itemId => {
    const G = ML.Game, iv = G.itemViews[itemId]; if (!iv || iv.type !== 'machine' || !G.S || !G.S.machDefs) return false;
    if (!inBounds(iv.mesh.position.x, iv.mesh.position.z) || instOf(iv.id)) return false;
    G.intent({ a: 'install', id: +itemId, rot: PL.rotOf(G.p.yaw) });
    return true;
  };
  /** Texte [E] d'une machine quand on tient la clé à molette (null = texte habituel) */
  PL.uninstallLabel = (mid, M) => {
    const S2 = GS(); if (!S2 || !S2.machDefs || !S2.car) return null;
    if (M.job) return `${mid} usine : attends la fin de la pièce pour la désinstaller`;
    return `🔧 Désinstaller ${mid} (clé à molette)`;
  };

  /* ======================= CLIENT : fantôme et étiquettes ======================= */
  let ghostKey = null;
  const ghost = (def, ok) => {
    const key = def ? [def.id, def.model, def.x, def.z, def.rot, ok].join('|') : null;
    if (key === ghostKey) return; ghostKey = key;
    if (W.machineGhost) W.machineGhost(def, ok);
  };
  PL.frame = () => {
    const G = ML.Game, S2 = G.S;
    if (!G.on || !S2 || !S2.machDefs) return ghost(null);
    if (W.root !== lastRoot) ghostKey = null;
    // étiquettes des caisses (progression de l'installation, visible par tous)
    for (const id in G.itemViews) {
      const iv = G.itemViews[id], l = iv.type === 'machine' && iv.mesh.userData.label; if (!l) continue;
      const j = instOf(iv.id); l.setText(j ? `🔧 Installation ${PL.name(iv.d.model)} : ${pct(j)} %` : `🏭 ${PL.name(iv.d.model)}`, j ? '#9dffb8' : '#ffd257');
    }
    // où irait la machine ?
    let cand = null;
    const sc = G.p.car !== null ? S2.cars[G.p.car] : null, c = G.p.car !== null ? ML.Cars.list[G.p.car] : null;
    if (sc && c) {
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      if (sc.kind === 'fenwick' && sc.load && sc.load.type === 'machine') cand = { it: sc.load, x: c.pos.x + fx * 1.9, z: c.pos.z + fz * 1.9, rot: PL.rotOf(c.h + Math.PI) };
      else if (sc.kind === 'tp') { const it = (sc.bed || []).find(x => x && x.type === 'machine'); if (it) cand = { it, x: c.pos.x - fx * 1.6, z: c.pos.z - fz * 1.6, rot: PL.rotOf(c.h + Math.PI) }; }
    } else if (!G.p.ride) {
      let bd = 3.2;
      for (const id in G.itemViews) {
        const iv = G.itemViews[id]; if (iv.type !== 'machine' || instOf(iv.id)) continue;
        const p = iv.mesh.position, d = Math.hypot(p.x - G.p.pos.x, p.z - G.p.pos.z);
        if (d < bd) { bd = d; cand = { it: iv, x: p.x, z: p.z, rot: PL.rotOf(G.p.yaw) }; }
      }
    }
    if (!cand || !inBounds(cand.x, cand.z)) return ghost(null);
    const def = PL.defFor(cand.it.d.uid, cand.it.d.model, cand.x, cand.z, cand.rot, cand.it.d.wear);
    ghost(def, PL.valid(def).ok);
  };
})();
