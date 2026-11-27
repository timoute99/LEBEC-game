/* =====================================================================
   people.js — Personnages low-poly (PNJ et avatars des joueurs) :
   construction du modèle, étiquette du nom, bulle, objet tenu en main,
   animation de marche, pose (pelle levée, boxe...).
   Le rendu est le même chez tous : la position vient du réseau.
   ===================================================================== */
(function () {
  const P = ML.People = {};
  const U = ML.U;

  /** look : { skin, shirt, pants, hair, height, width, ... } ; opts : { name, nameColor } */
  P.build = (look, opts) => {
    opts = opts || {};
    const s = (look.height || 1.78) / 1.8, w = look.width || 1, g = new THREE.Group(); g.rotation.order = 'YXZ';
    const o = { group: g, h: 1.86 * s, anim: Math.random() * 6, pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, tYaw: 0, speed: 0, heldKey: null };
    const limb = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); return p; };
    o.legL = limb(0.12 * w, 0.9 * s); o.legR = limb(-0.12 * w, 0.9 * s);
    for (const lg of [o.legL, o.legR]) {
      if (look.shorts) { U.box(0.18 * w, 0.42 * s, 0.21, look.pants, 0, -0.21 * s, 0, lg); U.box(0.14 * w, 0.48 * s, 0.16, look.skin, 0, -0.64 * s, 0, lg); }
      else U.box(0.17 * w, 0.9 * s, 0.2, look.pants, 0, -0.45 * s, 0, lg);
      const sh = look.shoes !== undefined ? look.shoes : 0x222222, sm = look.shoes === 0xffd700 ? U.mat(0xffd700, 0x553300) : sh;   // V6 : chaussures de la boutique
      if (look.bigShoes) U.box(0.23 * w, 0.14, 0.34, sm, 0, -0.86 * s, 0.05, lg); else U.box(0.19 * w, 0.09, 0.27, sm, 0, -0.87 * s, 0.03, lg);
      if (look.shoes === 0xf5f5f5) U.box(0.195 * w, 0.025, 0.275, 0xe74c3c, 0, -0.84 * s, 0.03, lg);
    }
    U.box(0.5 * w, 0.14 * s, 0.29 * w, look.pants, 0, 0.93 * s, 0, g);                         // ceinture
    o.torso = U.box(0.48 * w, 0.56 * s, 0.27 * w, look.shirt, 0, 1.22 * s, 0, g);
    U.box(0.2 * w, 0.06 * s, 0.28 * w, look.shirt, 0, 1.52 * s, 0, g);                         // col
    if (look.apron) U.box(0.42 * w, 0.75 * s, 0.02, look.apron, 0, 1.1 * s, 0.145 * w, g);
    if (look.tie) U.box(0.07, 0.42 * s, 0.02, look.tie, 0, 1.25 * s, 0.14 * w, g);
    if (look.blouse) {                                                 // blouse longue (Lebec, médecin)
      U.box(0.53 * w, 0.98 * s, 0.31 * w, look.blouse, 0, 1.07 * s, 0, g);
      if (look.backText) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
        const words = look.backText.split(' '), lines = [], per = Math.ceil(look.backText.length / 3);
        let cur = ''; for (const wd of words) { if (cur && (cur + ' ' + wd).length > per + 2) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; } lines.push(cur);
        x.font = 'bold 48px Arial'; const mw = Math.max(...lines.map(l => x.measureText(l).width)), fs = Math.min(64, 48 * 244 / mw);
        x.font = `bold ${fs}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
        lines.forEach((l, i) => x.fillText(l, 128, 128 + (i - (lines.length - 1) / 2) * fs * 1.12));
        const tex = new THREE.CanvasTexture(c), pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52 * w, 0.52 * w), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        pl.position.set(0, 1.22 * s, -0.158 * w); pl.rotation.y = Math.PI; g.add(pl);
      }
    }
    if (opts.vest) { U.box(0.5 * w, 0.3 * s, 0.29 * w, opts.vest, 0, 1.33 * s, 0, g); U.box(0.5 * w, 0.04 * s, 0.295 * w, 0xdddddd, 0, 1.26 * s, 0, g); }
    o.armL = limb(0.24 * w + 0.08, 1.46 * s); o.armR = limb(-(0.24 * w + 0.08), 1.46 * s);
    for (const a of [o.armL, o.armR]) {
      U.box(0.13, 0.3 * s, 0.14, look.blouse || look.shirt, 0, -0.15 * s, 0, a); U.box(0.12, 0.3 * s, 0.13, look.skin, 0, -0.44 * s, 0, a);
      const hs = look.gloves ? 0.17 : 0.12; U.box(hs, hs, hs, look.gloves || look.skin, 0, -0.62 * s, 0, a);
    }
    const head = new THREE.Group(); head.position.y = 1.69 * s; g.add(head); o.head = head;
    U.box(0.32 * s, 0.34 * s, 0.3 * s, look.skin, 0, 0, 0, head);
    U.box(0.06 * s, 0.08 * s, 0.05 * s, look.skin, 0, -0.02 * s, 0.16 * s, head);              // nez
    U.box(0.34 * s, 0.1 * s, 0.32 * s, look.hair, 0, 0.19 * s, -0.01, head);
    U.box(0.34 * s, 0.18 * s, 0.06 * s, look.hair, 0, 0.08 * s, -0.15 * s, head);
    if (look.longHair) U.box(0.34 * s, 0.42 * s, 0.08 * s, look.hair, 0, -0.04 * s, -0.17 * s, head);
    for (const ex of [-0.075, 0.075]) { U.box(0.06, 0.05, 0.02, 0xffffff, ex * s, 0.04 * s, 0.151 * s, head); U.box(0.03, 0.04, 0.025, 0x111111, ex * s, 0.04 * s, 0.155 * s, head); }
    U.box(0.1 * s, 0.025, 0.02, 0x7a3b2e, 0, -0.09 * s, 0.151 * s, head);
    if (look.beard) { U.box(0.3 * s, 0.13 * s, 0.05, look.hair, 0, -0.12 * s, 0.15 * s, head); U.box(0.05, 0.16 * s, 0.25 * s, look.hair, 0.155 * s, -0.04 * s, 0.02, head); U.box(0.05, 0.16 * s, 0.25 * s, look.hair, -0.155 * s, -0.04 * s, 0.02, head); }
    if (look.mustache) U.box(0.17 * s, 0.045 * s, 0.03, 0x555555, 0, -0.06 * s, 0.158 * s, head);
    if (look.gl === 'sun') { U.box(0.3 * s, 0.08 * s, 0.025, 0x111111, 0, 0.04 * s, 0.17 * s, head); U.box(0.02, 0.03, 0.2 * s, 0x111111, 0.15 * s, 0.05 * s, 0.07 * s, head); U.box(0.02, 0.03, 0.2 * s, 0x111111, -0.15 * s, 0.05 * s, 0.07 * s, head); }
    else if (look.gl === 'avi') { for (const sx of [-1, 1]) { U.box(0.12 * s, 0.09 * s, 0.02, 0x3d2b12, 0.07 * s * sx, 0.035 * s, 0.172 * s, head); U.box(0.13 * s, 0.015, 0.025, U.mat(0xffd700, 0x553300), 0.07 * s * sx, 0.08 * s, 0.172 * s, head); } }
    else if (look.gl === 'loupe') { for (const sx of [-1, 1]) { U.cyl(0.07 * s, 0.07 * s, 0.08, 0xeeeeee, 0.075 * s * sx, 0.04 * s, 0.2 * s, head, 10).rotation.x = Math.PI / 2; U.cyl(0.055 * s, 0.055 * s, 0.085, 0x9fd3ff, 0.075 * s * sx, 0.04 * s, 0.2 * s, head, 10).rotation.x = Math.PI / 2; } }
    else if (look.glasses) U.box(0.27 * s, 0.07 * s, 0.02, 0x1a1a1a, 0, 0.04 * s, 0.168 * s, head);
    if (look.cap) { U.box(0.35 * s, 0.09 * s, 0.34 * s, look.cap, 0, 0.21 * s, 0, head); U.box(0.3 * s, 0.03, 0.16 * s, look.cap, 0, 0.17 * s, 0.22 * s, head); }
    if (look.mask) U.box(0.36 * s, 0.4 * s, 0.05, 0x2c3e50, 0, 0.0, 0.2 * s, head).rotation.x = -0.9;   // masque de soudeur relevé
    if (opts.helmet) { U.box(0.36 * s, 0.12 * s, 0.36 * s, opts.helmet, 0, 0.22 * s, 0, head); U.box(0.38 * s, 0.03, 0.4 * s, opts.helmet, 0, 0.16 * s, 0.02, head); }
    switch (look.bag) {                                                    // V6 : sacs / cape (dans le dos)
      case 'dos': U.box(0.36 * w, 0.42 * s, 0.16, 0x2e86de, 0, 1.2 * s, -0.21 * w, g); U.box(0.3 * w, 0.16 * s, 0.06, 0x1b4f8a, 0, 1.08 * s, -0.31 * w, g); for (const sx of [-1, 1]) U.box(0.05, 0.5 * s, 0.03, 0x1b4f8a, 0.13 * w * sx, 1.22 * s, 0.14 * w, g); break;
      case 'banane': U.box(0.34 * w, 0.11 * s, 0.1, 0x39ff14, 0.03, 0.9 * s, 0.17 * w, g); U.box(0.52 * w, 0.03, 0.3 * w, 0x111111, 0, 0.94 * s, 0, g); break;
      case 'cape': { const c = U.box(0.52 * w, 1.0 * s, 0.03, 0xc0392b, 0, 1.02 * s, -0.17 * w, g); c.rotation.x = 0.12; U.box(0.12, 0.08, 0.05, U.mat(0xffd700, 0x553300), 0, 1.52 * s, 0.15 * w, g); break; }
    }
    switch (opts.hat) {                                                    // chapeaux de la boutique
      case 'cap': U.box(0.35 * s, 0.1 * s, 0.34 * s, 0xc0392b, 0, 0.22 * s, 0, head); U.box(0.3 * s, 0.03, 0.18 * s, 0xc0392b, 0, 0.18 * s, 0.23 * s, head); break;
      case 'beanie': U.box(0.36 * s, 0.16 * s, 0.34 * s, 0x1f4e9a, 0, 0.24 * s, 0, head); U.box(0.1, 0.08, 0.1, 0xffffff, 0, 0.36 * s, 0, head); break;
      case 'hard': U.box(0.38 * s, 0.14 * s, 0.38 * s, 0xf1c40f, 0, 0.24 * s, 0, head); U.box(0.42 * s, 0.03, 0.46 * s, 0xf1c40f, 0, 0.17 * s, 0.02, head); break;
      case 'straw': U.cyl(0.36 * s, 0.36 * s, 0.03, 0xe6c86e, 0, 0.19 * s, 0, head, 12); U.cyl(0.17 * s, 0.19 * s, 0.16 * s, 0xe6c86e, 0, 0.27 * s, 0, head, 10); break;
      case 'crown': for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; U.box(0.07, 0.16 * s, 0.03, U.mat(0xffd700, 0x553300), Math.sin(a) * 0.15 * s, 0.3 * s, Math.cos(a) * 0.15 * s, head).rotation.y = a; } U.cyl(0.17 * s, 0.17 * s, 0.05, U.mat(0xffd700, 0x553300), 0, 0.22 * s, 0, head, 10); break;
    }
    if (look.shovel) {
      const sh = new THREE.Group(); sh.position.set(0, -0.62 * s, 0.05); o.armR.add(sh);
      U.cyl(0.025, 0.025, 1.2, 0x8b5a2b, 0, -0.35, 0.12, sh, 6).rotation.x = 0.25;
      U.box(0.3, 0.36, 0.04, 0x7f8c8d, 0, -1.02, 0.28, sh).rotation.x = 0.25;
    }
    o.hand = new THREE.Group(); o.hand.position.set(0, 1.05 * s, 0.38); g.add(o.hand);        // objet porté devant soi
    if (opts.bare) {                                                   // V5 : figurants (passants, employés) : pas d'étiquettes (moins de mémoire)
      const dummy = () => { const d = new THREE.Object3D(); d.setText = () => {}; d.visible = false; return d; };
      o.label = dummy(); o.bubble = dummy(); o.emo = dummy(); o.emoT = 0;
    } else {
      o.label = U.label(opts.name || '', { size: 0.24, color: opts.nameColor || '#ffe9a8' }); o.label.position.y = o.h + 0.3; g.add(o.label);
      o.bubble = U.label('', { size: 0.3, color: '#111', bg: 'rgba(255,255,255,0.93)' }); o.bubble.position.y = o.h + 0.65; g.add(o.bubble);
      o.emo = U.label('', { size: 0.7, bg: 'rgba(0,0,0,0)', fontSize: 80 }); o.emo.position.y = o.h + 1.3; g.add(o.emo); o.emoT = 0;
    }
    ML.scene.add(g);
    return o;
  };

  /** Met à jour position (lissée vers la cible réseau) et animation */
  P.animate = (o, dt, pose) => {
    const k = Math.min(1, dt * 12);
    const ox = o.pos.x, oz = o.pos.z;
    if (o.pos.distanceToSquared(o.target) > 64) o.pos.copy(o.target); else o.pos.lerp(o.target, k);
    o.yaw = U.lerpAngle(o.yaw, o.tYaw, k);
    const sp = Math.hypot(o.pos.x - ox, o.pos.z - oz) / Math.max(dt, 1e-3);
    o.speed = U.lerp(o.speed, sp, Math.min(1, dt * 10));
    const moving = o.speed > 0.4;
    o.anim += dt * (moving ? Math.min(16, 3 + o.speed * 2) : 2);
    const sw = moving ? Math.sin(o.anim) * Math.min(0.9, 0.3 + o.speed * 0.1) : 0;
    o.legL.rotation.x = sw; o.legR.rotation.x = -sw; o.armL.rotation.x = -sw * 0.8; o.armR.rotation.x = sw * 0.8;
    o.armL.rotation.z = 0; o.armR.rotation.z = 0; o.legL.rotation.z = 0; o.legR.rotation.z = 0;
    if (o.heldKey) { o.armL.rotation.x = o.armR.rotation.x = -1.1; }
    if (pose === 'chase') o.armR.rotation.x = -2.6 + Math.sin(o.anim * 1.5) * 0.6;
    if (pose === 'box') { o.armL.rotation.x = -1.4 + Math.sin(o.anim * 3) * 0.5; o.armR.rotation.x = -1.4 - Math.sin(o.anim * 3) * 0.5; }
    if (pose === 'stun') o.group.rotation.z = Math.sin(o.anim * 6) * 0.25; else o.group.rotation.z = 0;
    let lift = 0; o.group.rotation.x = 0;
    if (o.rag) {                                                           // ragdoll (coup de pelle, renversé…)
      const r = o.rag; r.t -= dt; r.vy -= 18 * dt; r.y = Math.max(0, r.y + r.vy * dt); if (r.y === 0) r.vy = 0;
      r.rot = Math.min(1.45, r.rot + dt * 6); lift = r.y + 0.25;
      o.group.rotation.x = -r.rot; o.group.rotation.z = Math.sin(r.t * 9) * 0.2;
      o.legL.rotation.x = 0.6 + Math.sin(r.t * 20) * 0.5; o.legR.rotation.x = -0.4 - Math.sin(r.t * 17) * 0.5; o.armL.rotation.z = 1.2; o.armR.rotation.z = -1.2;
      if (r.t <= 0) o.rag = null;
    }
    if (o.emoT > 0) { o.emoT -= dt; o.emo.position.y = o.h + 1.2 + Math.sin(o.emoT * 6) * 0.08; if (o.emoT <= 0) o.emo.setText(''); }
    o.group.position.set(o.pos.x, (o.pos.y || 0) + lift, o.pos.z);
    o.group.rotation.y = o.yaw;
    const far = ML.camera && Math.hypot(o.pos.x - ML.camera.position.x, o.pos.z - ML.camera.position.z) > 40;
    o.label.visible = !far && !!o.label._k && o.label._k[0] !== '|';
    if (far) o.bubble.visible = false;
  };

  /** V5.2 : assis dans un véhicule (jambes devant, mains au volant / au guidon) */
  P.sit = (o, x, y, z, yaw, moto) => {
    o.pos.set(x, y, z); o.target.copy(o.pos); o.yaw = o.tYaw = yaw; o.speed = 0;
    o.group.position.set(x, y, z); o.group.rotation.set(moto ? -0.12 : 0, yaw, 0);
    o.legL.rotation.x = o.legR.rotation.x = moto ? -1.15 : -1.45; o.legL.rotation.z = moto ? 0.22 : 0; o.legR.rotation.z = moto ? -0.22 : 0;
    o.armL.rotation.x = o.armR.rotation.x = moto ? -1.3 : -1.1; o.armL.rotation.z = o.armR.rotation.z = 0;
    const far = ML.camera && Math.hypot(x - ML.camera.position.x, z - ML.camera.position.z) > 40;
    o.label.visible = !far && !!o.label._k && o.label._k[0] !== '|'; if (far) o.bubble.visible = false;
  };
  /** Affiche l'objet tenu (type) dans les mains */
  P.setHeld = (o, it) => {
    const key = it ? it.type + JSON.stringify(it.d || {}) : null;
    if (key === o.heldKey) return;
    o.heldKey = key;
    o.hand.clear();
    if (it) { const m = ML.Items.mesh(it, { noLabel: true }); m.position.y = -0.25; o.hand.add(m); }
  };
  P.setBubble = (o, text, fg) => { let t = text || ''; if (t.length > 46) t = t.slice(0, 44) + '…'; o.bubble.setText(t, fg); };
  P.dispose = o => { ML.scene.remove(o.group); };
  P.ragdoll = (o, power) => { o.rag = { t: 2.4, vy: power || 6, y: 0, rot: 0 }; };
  P.emote = (o, txt) => { o.emo.setText(txt); o.emoT = 2.5; };
})();
