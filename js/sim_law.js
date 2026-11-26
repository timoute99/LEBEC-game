/* =====================================================================
   sim_law.js — LA LOI (patch note) :
   1. SOUFFLETTE AU BOUT DU TUYAU : elle est reliée à l'air comprimé
      (enrouleurs muraux de l'atelier, ML.World.hoseReels, W.HOSE_LEN m).
      - Client : chaque image, ML.World.updateHoses(positions de TOUTES les
        soufflettes) dessine les tuyaux ; le joueur local qui en porte une
        est retenu dans le rayon du tuyau (élastique, Law.clampLocal).
      - Hôte : si un porteur se retrouve quand même trop loin (voiture,
        téléportation, latence…), la soufflette lui est ARRACHÉE des mains
        et revient en volant à son crochet (« BOING »). Idem pour une
        soufflette lancée / posée trop loin. Pas de voiture avec une
        soufflette (« Le tuyau est trop court ! »).
      - 0 enrouleur (petit atelier de carrière) : aucune contrainte.
   2. GENDARMERIE : passants renversés comptés par joueur et par journée
      (sim_city.js → K.lawPed ; radar → K.lawSpeed). 2 passants (ou 1 +
      un flash radar) = RECHERCHÉ·E : la gendarmerie le traque
      (K.polChase dans sim_city.js), et revient après chaque fuite (3 fois
      max). Attrapé·e (K.lawArrest) = PRISON : téléporté·e dans la cellule
      (ML.LOC.jail), objets lâchés sur place, voiture abandonnée, 45 s
      (+15 s par passant au-delà de 2). Un collègue peut payer la CAUTION
      (300 €, cible 'caution' devant la cellule) ; depuis la cellule, c'est
      500 € (tarif « appel en PCV »). Libération : porte ouverte 5 s,
      joueur posé devant (ML.LOC.jailDoor).

   État diffusé : S.law = { wanted: {pid: {esc, next}}, jail: {pid: {until, dur}}, door: rt }
   Événements : 'jail' {to, x, z, yaw, d}, 'unjail' {to, x, z, yaw}, 'yank' {to, x, z}.
   Intention : use id 'caution' (payer la caution).
   Côté client : ML.Law.frame(dt), ML.Law.clampLocal(p), ML.Law.event(e),
   ML.Law.label(), ML.Law.hasHose() — appelés par game.js / rules.js.
   ===================================================================== */
(function () {
  const Sim = ML.Sim, K = Sim.K, U = ML.U, W = ML.World;
  const Law = ML.Law = {};
  const LINES = [
    'Adjudant Kerbrigand : « Alors, on joue au bowling avec les piétons ? »',
    'Adjudant Kerbrigand : « Ici, le Wi-Fi c\'est NON. Le café aussi. »',
    'Adjudant Kerbrigand : « Le dernier qui a tenté de scier les barreaux, il avait une lime de 8. Pas assez. »',
    'Adjudant Kerbrigand : « Tu veux un coup de fil ? Y a un Minitel au fond, il marche pas. »',
    'Adjudant Kerbrigand : « Un passant c\'est un accident. Deux, c\'est une passion. »',
    'Adjudant Kerbrigand : « Lebec a appelé. Il a dit : « gardez-le ». »',
    'Adjudant Kerbrigand : « Les toilettes sont en inox. Enfin, en blanc. On a eu un souci de budget. »',
    'Adjudant Kerbrigand : « Ton permis, je le garde pour caler mon bureau. »',
    'Adjudant Kerbrigand : « Calme-toi, c\'est pas Alcatraz. C\'est pire : c\'est la Bretagne en novembre. »'
  ];
  Law.LINES = LINES;

  /* =====================================================================
     HÔTE
     ===================================================================== */
  let S, runs, speed, yankCd;
  const mod = {};
  const L = () => S.law;
  const name = pid => (S.pl[pid] ? S.pl[pid].name : '?');
  const reels = () => (W.hoseReels || []).filter(r => r && isFinite(r.x) && isFinite(r.z));
  /** rayon horizontal du tuyau pour une main à la hauteur hy */
  const hoseR = (r, hy) => { const dy = (r.y || 0) - hy, Lh = W.HOSE_LEN || 14; return Math.sqrt(Math.max(1, Lh * Lh - dy * dy)); };
  const nearestReel = (x, z) => { let best = -1, bd = 1e9; reels().forEach((r, i) => { const d = Math.hypot(r.x - x, r.z - z); if (d < bd) { bd = d; best = i; } }); return best < 0 ? null : { i: best, r: reels()[best], d: bd }; };
  const hasSouf = P => P.inv.some(x => x && x.type === 'soufflette');

  mod.init = () => {
    S = K.S; runs = {}; speed = {}; yankCd = {};
    S.law = { wanted: {}, jail: {}, door: 0 };
  };
  const active = () => S && S.mode !== 'course';                 // pendant la course, la gendarmerie fait grève

  /* ---------- Compteur de chauffards ---------- */
  K.lawPed = pid => {
    if (!active() || !S.pl[pid]) return;
    runs[pid] = (runs[pid] || 0) + 1;
    if (L().jail[pid]) return;
    if (L().wanted[pid]) { K.note(pid, `🚨 Encore un passant (${runs[pid]}) ! Ça va te coûter des jours… enfin, des secondes de cellule.`, 'warn'); return; }
    check(pid);
  };
  K.lawSpeed = pid => { if (!active() || !S.pl[pid]) return; speed[pid] = true; if (!L().jail[pid] && !L().wanted[pid]) check(pid); };
  function check(pid) {
    const n = runs[pid] || 0;
    if (n >= 2 || (n >= 1 && speed[pid])) {
      L().wanted[pid] = { esc: 0, next: S.rt + 2.5 };
      K.big('🚨 La gendarmerie te recherche !', '#3498db', pid);
      K.all(`🚨 AVIS DE RECHERCHE : ${name(pid)} (${n} passant${n > 1 ? 's' : ''} renversé${n > 1 ? 's' : ''}${speed[pid] ? ' + excès de vitesse' : ''}). La gendarmerie est en route !`, 'warn');
      K.sfx('siren'); Sim.dirty = true;
    } else if (n === 1) K.note(pid, '⚠ Un passant renversé… Encore un (ou un flash radar) et la gendarmerie te met en CELLULE.', 'warn');
  }
  K.lawEscape = pid => {
    const w = L().wanted[pid]; if (!w) return;
    w.esc++; w.next = S.rt + 20;
    if (w.esc >= 3) { delete L().wanted[pid]; K.all(`👮 La gendarmerie abandonne la traque de ${name(pid)} : c'est l'heure du café.`, 'info'); }
    else K.note(pid, `😬 Semée… pour l'instant. Ils reviennent dans 20 s (fuite ${w.esc}/3).`, 'warn');
    Sim.dirty = true;
  };

  /* ---------- Arrestation → cellule ---------- */
  K.lawArrest = pid => {
    const J = ML.LOC.jail, P = S.pl[pid]; if (!J || !P || L().jail[pid]) return false;
    if (P.car !== null) { const c = S.cars[P.car]; if (c) { c.dr = null; c.s = 0; } P.car = null; }   // la voiture reste là
    if (P.ride != null) { const r = S.cars[P.ride]; if (r) r.pass = r.pass.filter(x => x.pid !== pid); P.ride = null; }
    K.dropAll(pid, 2);                                                                   // tout tombe sur le lieu de l'arrestation
    const n = runs[pid] || 1, dur = 45 + 15 * Math.max(0, n - 2);
    L().jail[pid] = { until: S.rt + dur, dur }; delete L().wanted[pid];
    if (S.chase === pid) S.chase = null;                                                 // Lebec ne vient pas chercher en cellule
    K.pose[pid] = Object.assign(K.pose[pid] || {}, { x: J.x, y: 0, z: J.z, yaw: J.yaw || 0 });
    K.ev({ e: 'jail', to: pid, x: J.x, z: J.z, yaw: J.yaw || 0, d: dur });
    K.big(`🔒 PRISON — ${dur} s`, '#3498db', pid);
    K.all(`🚔 ${name(pid)} est embarqué·e en CELLULE pour ${dur} s ! Caution : 300 € à l'accueil de la gendarmerie.`, 'warn');
    K.sfx('siren', J.x, J.z); Sim.dirty = true;
    return true;
  };
  function release(pid, why) {
    const D = ML.LOC.jailDoor || ML.LOC.jail; delete L().jail[pid];
    runs[pid] = 0; speed[pid] = false; L().door = S.rt + 5;
    if (D && S.pl[pid]) {
      const J = ML.LOC.jail || D, yaw = Math.atan2(J.x - D.x, J.z - D.z);   // dos à la cellule (yaw caméra : regarde vers −sin/−cos)
      K.pose[pid] = Object.assign(K.pose[pid] || {}, { x: D.x, y: 0, z: D.z });
      K.ev({ e: 'unjail', to: pid, x: D.x, z: D.z, yaw });
    }
    if (S.pl[pid]) { K.note(pid, why, 'good'); K.big('🔓 LIBÉRÉ·E !', '#3ecf6e', pid); }
    K.sfx('clang', D ? D.x : 0, D ? D.z : 0); Sim.dirty = true;
  }

  /* ---------- Pas besoin d'être en liberté pour… rien faire ---------- */
  mod.act = (pid, P, ps, sel, held, m) => {
    if (!L().jail[pid]) return false;
    if (m.a === 'use' && String(m.id || '') !== 'caution') { K.note(pid, '🔒 Tu es en cellule. Tu peux juste réfléchir à ta conduite.', 'warn'); return true; }
    if (['refuel', 'horn', 'spill', 'fork', 'unload'].includes(m.a)) return true;
    return false;
  };
  mod.use = (pid, P, ps, sel, held, kind, a, b) => {
    // pas de voiture avec la soufflette : le tuyau ne suit pas
    if (kind === 'car' && hasSouf(P) && reels().length) {
      const c = S.cars[+a];
      if (c && (b === 'door' ? !(held && held.type === 'jerrican') : !c.bed.length && !held)) { K.note(pid, '🔴 Le tuyau est trop court ! Raccroche la soufflette avant de monter.', 'warn'); K.sfx('bong', ps.x, ps.z); return true; }
    }
    if (kind !== 'caution') return false;
    const D = ML.LOC.jailDoor; if (D && !K.near(ps, D.x, D.z, 6)) return true;
    const ids = Object.keys(L().jail).filter(id => S.pl[id]);
    if (!ids.length) { K.note(pid, '👮 « Personne en cellule. Vous venez vous dénoncer ? Repassez quand vous aurez renversé quelqu\'un. »'); return true; }
    const self = !!L().jail[pid], who = self ? pid : ids.sort((x, y) => L().jail[y].until - L().jail[x].until)[0];
    const amt = self ? 500 : 300;
    if (K.fine) K.fine(who, amt, self ? 'Caution (payée depuis la cellule, tarif majoré)' : 'Caution');
    if (!K.careerOn || !K.careerOn()) S.score = Math.max(0, S.score - (self ? 8 : 5));
    release(who, self ? `🔓 Caution de ${amt} € payée depuis la cellule (tarif PCV). Allez, file !` : `🔓 ${P.name} a payé ta caution (${amt} €). Dis merci.`);
    K.all(self ? `💸 ${P.name} a payé sa propre caution (${amt} €) et sort de cellule.` : `💸 ${P.name} paie la caution de ${name(who)} (${amt} €) : libéré·e !`, 'info');
    K.sfx('cash');
    return true;
  };

  /* ---------- Boucle ---------- */
  mod.step = dt => {
    const Lw = L();
    // prisonniers : fin de peine, maintien dans la cellule (les répliques du gendarme sont affichées par le client)
    for (const pid in Lw.jail) {
      const j = Lw.jail[pid];
      if (!S.pl[pid]) { delete Lw.jail[pid]; continue; }
      if (S.rt >= j.until) { release(pid, '🔓 Peine purgée. Le gendarme : « Et que je ne te revoie plus ! (à demain) »'); K.all(`🔓 ${name(pid)} sort de cellule.`, 'info'); continue; }
      const J = ML.LOC.jail, ps = K.pose[pid];
      if (J && ps && Math.hypot(ps.x - J.x, ps.z - J.z) > 5 && (j.tp || 0) < S.rt) { j.tp = S.rt + 2; K.ev({ e: 'jail', to: pid, x: J.x, z: J.z, yaw: J.yaw || 0, d: Math.ceil(j.until - S.rt), again: 1 }); }
    }
    // recherchés : la gendarmerie part en chasse (une voiture pour tout le monde)
    for (const pid in Lw.wanted) {
      const w = Lw.wanted[pid];
      if (!S.pl[pid]) { delete Lw.wanted[pid]; continue; }
      if (K.pol || S.rt < w.next || !K.polChase) continue;
      if (K.polChase(pid)) {
        const p = K.pose[pid] || { x: 0, z: 0 };
        K.big('🚨 GENDARMERIE !', '#3498db', pid); K.all(`🚨 La gendarmerie traque ${name(pid)} ! Si elle t'attrape à l'arrêt : CELLULE.`, 'warn'); K.sfx('siren', p.x, p.z);
      } else w.next = S.rt + 3;
    }
    hoseStep(dt);
  };

  /* ---------- Tuyau : sécurité côté hôte ---------- */
  function hookFor(i) {
    const hooks = (ML.LOC.hooks || []).filter(h => h.type === 'soufflette'), h = hooks[i] || hooks[0], r = reels()[i];
    return h ? { x: h.x, y: h.y || 0, z: h.z } : r ? { x: r.x, y: 0, z: r.z + 0.6 } : null;
  }
  function yankItem(o, nr) {
    const H = hookFor(nr.i); if (!H) return;
    o.yank = { t: 0, dur: 0.9 + Math.min(1.2, nr.d / 25), x0: o.x, y0: o.y, z0: o.z, x1: H.x, y1: H.y, z1: H.z };
    o.rest = false; o.thr = null; Sim.dirty = true;
  }
  function hoseStep(dt) {
    if (!reels().length) return;
    // 1) porteurs trop loin (ou en voiture) : BOING
    for (const pid in S.pl) {
      const P = S.pl[pid], ps = K.pose[pid]; if (!ps || !hasSouf(P) || (yankCd[pid] || 0) > S.rt) continue;
      const c = P.car !== null ? S.cars[P.car] : P.ride != null ? S.cars[P.ride] : null, x = c ? c.x : ps.x, z = c ? c.z : ps.z;
      const nr = nearestReel(x, z); if (!nr) continue;
      if (!c && nr.d <= hoseR(nr.r, 1.1) + 1.6) continue;
      yankCd[pid] = S.rt + 0.5;
      P.inv.forEach((it, i) => {
        if (!it || it.type !== 'soufflette') return;
        P.inv[i] = null; const o = K.spawnItem(it, x, 1.1, z, [0, 0, 0]); yankItem(o, nr);
      });
      K.ev({ e: 'yank', to: pid, x, z }); K.sfx('bong', x, z);
      K.note(pid, U.pick(['💨 BOING ! Le tuyau a repris sa soufflette. Elle est reliée à l\'air comprimé, génie.', '💨 BOING ! 14 m de tuyau, pas un de plus. La soufflette rentre à la maison.', '💨 BOING ! Tu pensais partir avec la soufflette ? Le compresseur a dit non.']), 'warn');
      Sim.dirty = true;
    }
    // 2) soufflettes posées / lancées trop loin : retour à l'enrouleur ; animation des retours
    for (const o of S.items) {
      if (o.type !== 'soufflette') continue;
      if (o.yank) {
        const y = o.yank; y.t += dt; const k = Math.min(1, y.t / y.dur), e = k * k * (3 - 2 * k);
        o.x = y.x0 + (y.x1 - y.x0) * e; o.z = y.z0 + (y.z1 - y.z0) * e; o.y = y.y0 + (y.y1 - y.y0) * e + Math.sin(Math.PI * k) * 3;
        o.vx = o.vy = o.vz = 0; o.thr = null;
        if (k >= 1) { o.rest = true; delete o.yank; Sim.dirty = true; } else o.rest = false;
        continue;
      }
      if (!o.rest) continue;
      const nr = nearestReel(o.x, o.z);
      if (nr && nr.d > hoseR(nr.r, o.y) + 0.8) { yankItem(o, nr); K.sfx('bong', o.x, o.z); }
    }
  }

  Sim.mods.unshift(mod);   // EN PREMIER : refuser une voiture avec la soufflette, bloquer les prisonniers

  /* =====================================================================
     CLIENT (tous les joueurs) — appelé par game.js / rules.js
     ===================================================================== */
  const G = () => ML.Game;
  const V3 = () => new THREE.Vector3();
  let ov = null, ovT = 0, sirenT = 0, tenseT = 0;
  Law.myReel = -1;

  /** Le joueur local porte-t-il une soufflette (n'importe quel emplacement) ? */
  Law.hasHose = () => { const g = G(), P = g.S && g.S.pl[g.me]; return !!(P && P.inv.some(x => x && x.type === 'soufflette')) && reels().length > 0; };
  Law.jailed = pid => { const g = G(), S2 = g.S; return !!(S2 && S2.law && S2.law.jail[pid || g.me]); };

  /** Texte [E] de la cible 'caution' */
  Law.label = () => {
    const g = G(), S2 = g.S; if (!S2 || !S2.law) return null;
    const ids = Object.keys(S2.law.jail).filter(id => S2.pl[id]);
    if (S2.law.jail[g.me]) return '💸 Payer TA caution depuis la cellule (500 €, tarif PCV)';
    if (ids.length) return `👮 Payer la caution de ${ids.map(id => S2.pl[id].name).join(', ')} (300 €) — libération immédiate`;
    return '👮 Accueil de la gendarmerie (sonnez fort)';
  };

  /** Liste des positions monde des soufflettes (posées + tenues), et la mienne */
  function hosePositions() {
    const g = G(), S2 = g.S, list = [], owners = [];
    for (const id in g.itemViews) { const iv = g.itemViews[id]; if (iv.type === 'soufflette') { list.push(iv.mesh.position); owners.push(null); } }
    if (!S2) return { list, owners };
    for (const pid in S2.pl) {
      const P = S2.pl[pid], n = P.inv.filter(x => x && x.type === 'soufflette').length; if (!n) continue;
      let pos = null;
      if (pid === g.me) {
        if (g.p.car !== null && ML.Cars.list[g.p.car]) { const c = ML.Cars.list[g.p.car]; pos = V3().set(c.pos.x, ML.Terrain.h(c.pos.x, c.pos.z) + 1.2, c.pos.z); }
        else { const e = g.eye(), f = g.forward(); pos = V3().set(e.x + f.x * 0.5 + Math.cos(g.p.yaw) * 0.25, e.y - 0.35, e.z + f.z * 0.5 - Math.sin(g.p.yaw) * 0.25); }
      } else {
        const a = g.avatars[pid]; if (!a || !a.seen) continue;
        const yaw = a.yaw || 0; pos = V3().set(a.pos.x + Math.sin(yaw) * 0.4, a.pos.y + 1.1 + ML.Terrain.h(a.pos.x, a.pos.z), a.pos.z + Math.cos(yaw) * 0.4);
      }
      for (let k = 0; k < n; k++) { list.push(pos); owners.push(pid); }
    }
    return { list, owners };
  }

  /** Chaque image (game.js, après le rendu des objets) */
  Law.frame = dt => {
    const g = G(); if (!g.on) return;
    const S2 = g.S;
    // tuyaux
    if (W.updateHoses) {
      const { list, owners } = hosePositions();
      let res = [];
      try { res = W.updateHoses(list) || []; } catch (err) { res = []; }
      Law.myReel = -1; for (let i = 0; i < owners.length; i++) if (owners[i] === g.me && res[i] >= 0) { Law.myReel = res[i]; break; }
    }
    // porte de la cellule (état diffusé) + cible « caution » (ajoutée après chaque World.build)
    if (Law._jd !== W.jailDoor) { Law._jd = W.jailDoor; Law._door = undefined; }
    const open = !!(S2 && S2.law && S2.law.door > (g.rt || 0));
    if (W.jailDoor && open !== Law._door) { Law._door = open; try { W.jailDoor(open); } catch (err) { /* pas de gendarmerie */ } }
    if (Law._tg !== W.targets && W.targets) {
      Law._tg = W.targets; const D = ML.LOC.jailDoor;
      if (D && W.jailDoor) W.targets.push({ id: 'caution', x: D.x, y: ML.Terrain.h(D.x, D.z) + 1.2, z: D.z, r: 2.6 });
    }
    overlay(dt);
  };

  /** Contrainte locale (game.js, après les collisions, à pied) */
  Law.clampLocal = p => {
    const g = G(), S2 = g.S; if (!S2) return;
    // en cellule : on reste dedans
    if (S2.law && S2.law.jail[g.me] && ML.LOC.jail) {
      const J = ML.LOC.jail; if (Math.hypot(p.pos.x - J.x, p.pos.z - J.z) > 3.2) { p.pos.x = J.x; p.pos.z = J.z; }
      return;
    }
    // soufflette : élastique autour de l'enrouleur
    if (!Law.hasHose()) return;
    const R = reels(), r = R[Law.myReel] || (nearestReel(p.pos.x, p.pos.z) || {}).r; if (!r) return;
    const max = hoseR(r, 1.1) - 0.6, dx = p.pos.x - r.x, dz = p.pos.z - r.z, d = Math.hypot(dx, dz);
    if (d <= max || d > max + 3) return;                       // très loin (téléporté) : l'hôte reprend la soufflette
    p.pos.x = r.x + dx / d * max; p.pos.z = r.z + dz / d * max; U.resolveCircle(p.pos, C_r());
    tenseT -= 1 / 60;
    if (tenseT <= 0) { tenseT = 4; ML.HUD.notify('🔴 Le tuyau est tendu ! La soufflette est reliée à l\'air comprimé (14 m).', 'warn'); }
  };
  const C_r = () => (ML.CFG.PLAYER && ML.CFG.PLAYER.r) || 0.35;

  /** Événements de l'hôte (game.js, G.event) */
  Law.event = e => {
    const g = G();
    switch (e.e) {
      case 'jail': {
        if (e.to !== g.me) { if (!e.again && g.avatars[e.to]) { const a = g.avatars[e.to]; a.target.set(e.x, 0, e.z); a.pos.copy(a.target); } return; }
        if (g.p.car !== null) g.leaveCarLocal();
        if (g.p.ride) { g.p.ride = null; }
        g.exitAt = performance.now();
        g.p.pos.set(e.x, 0, e.z); g.p.vy = 0; g.p.push = null; g.p.rag = null; g.p.slip = 0; g.p.yaw = (e.yaw || 0) + Math.PI; g.p.pitch = 0;
        if (!e.again) {
          if (ML.Dialogue.open) ML.Dialogue.forceClose(); ML.Mini.forceClose();
          ML.HUD.flash('rgba(52,152,219,0.6)'); ML.Sfx.play('siren');
        }
        return;
      }
      case 'unjail':
        if (e.to !== g.me) return;
        g.p.pos.set(e.x, 0, e.z); g.p.vy = 0; if (isFinite(e.yaw)) g.p.yaw = e.yaw; g.p.pitch = 0;
        ML.HUD.flash('rgba(62,207,110,0.4)');
        return;
      case 'yank':
        if (e.to === g.me) { ML.HUD.flash('rgba(255,210,87,0.35)'); ML.HUD.big('💨 BOING !', '#ffd257'); }
        return;
    }
  };

  /* ---------- Bandeaux : « recherché » et compte à rebours de la cellule ---------- */
  function ensureOv() {
    if (ov && document.body.contains(ov.root)) return ov;
    const root = document.createElement('div');
    root.id = 'law-ov';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;font-family:inherit;';
    const wanted = document.createElement('div');
    wanted.style.cssText = 'position:absolute;top:84px;left:50%;transform:translateX(-50%);padding:8px 18px;border-radius:10px;font-weight:900;font-size:20px;color:#fff;text-shadow:0 2px 0 #0008;box-shadow:0 4px 14px #0006;display:none;white-space:nowrap;';
    wanted.textContent = '🚨 La gendarmerie te recherche !';
    const jail = document.createElement('div');
    jail.style.cssText = 'position:absolute;inset:0;display:none;background:repeating-linear-gradient(90deg,rgba(20,24,32,0.0) 0 70px,rgba(30,34,44,0.55) 70px 82px);';
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;top:18%;left:50%;transform:translateX(-50%);text-align:center;color:#fff;text-shadow:0 3px 0 #000a;max-width:min(92vw,720px);';
    const big = document.createElement('div'); big.style.cssText = 'font-size:clamp(28px,6vw,64px);font-weight:900;letter-spacing:2px;white-space:nowrap;';
    const line = document.createElement('div'); line.style.cssText = 'margin-top:10px;font-size:18px;font-style:italic;background:#0009;padding:8px 14px;border-radius:10px;';
    const hint = document.createElement('div'); hint.style.cssText = 'margin-top:10px;font-size:15px;opacity:0.9;';
    hint.textContent = 'Un collègue peut payer ta caution (300 €) devant la cellule. Toi, depuis la cellule : 500 € (E près de la porte).';
    box.append(big, line, hint); jail.append(box); root.append(wanted, jail); document.body.appendChild(root);
    ov = { root, wanted, jail, big, line, hint, li: -1 };
    return ov;
  }
  function overlay(dt) {
    const g = G(), S2 = g.S, o = ensureOv();
    const j = S2 && S2.law && S2.law.jail[g.me], w = S2 && S2.law && S2.law.wanted[g.me];
    o.wanted.style.display = w && !j ? 'block' : 'none';
    if (w && !j) {
      const blink = Math.floor(performance.now() / 350) % 2;
      o.wanted.style.background = blink ? '#1f5fd1' : '#d12f2f';
      // sirène qui se rapproche quand la gendarmerie est en chasse
      const P = ML.Cars.police;
      sirenT -= dt; if (P && P.visible && sirenT <= 0) { sirenT = 1.3; ML.Sfx.at('siren', P.position.x, P.position.z); }
    }
    o.jail.style.display = j ? 'block' : 'none';
    if (j) {
      const left = Math.max(0, Math.ceil(j.until - (g.rt || 0)));
      o.big.textContent = `🔒 PRISON — ${left} s`;
      ovT -= dt;
      if (ovT <= 0 || o.li < 0) { ovT = 7; o.li = (o.li + 1 + Math.floor(Math.random() * (LINES.length - 1))) % LINES.length; o.line.textContent = '👮 ' + LINES[o.li]; }
    }
  }
  // partie terminée : on range les bandeaux
  setInterval(() => { if (ov && !(ML.Game && ML.Game.on)) { ov.wanted.style.display = 'none'; ov.jail.style.display = 'none'; } }, 400);
})();
