/* =====================================================================
   items.js — Définition des objets (communs à l'hôte et aux clients) :
   nom, icône, encombrement et modèle 3D. Un objet = { id?, type, d }.
   ===================================================================== */
(function () {
  const I = ML.Items = {};
  const M = ML.MATERIALS, T = ML.TOOLS;

  I.TYPES = {
    brut_acier: { kind: 'brut', mat: 'acier', name: 'Brut ACIER', icon: '🔩' },
    brut_alu: { kind: 'brut', mat: 'alu', name: 'Brut ALU', icon: '🔩' },
    brut_inox: { kind: 'brut', mat: 'inox', name: 'Brut INOX', icon: '🔩' },
    brut_sp: { kind: 'brut', name: d => `Brut ${M[d.mat].label} #${d.oid}`, icon: '🧱' },     // fonderie / chaudronnerie
    plaquette: { kind: 'tool', tool: 'plaquette', name: 'Plaquette carbure', icon: '◆' },
    fraise: { kind: 'tool', tool: 'fraise', name: 'Fraise', icon: '🌀' },
    foret: { kind: 'tool', tool: 'foret', name: 'Foret', icon: '📍' },
    caisse: { bulky: true, name: d => `Caisse #${d.oid}` + (d.ctl ? ' ✔ contrôlée' : ''), icon: '📦' },
    piece: { name: d => `Petite pièce #${d.oid}` + (d.ctl ? ' ✔' : ''), icon: '⚙️', hint: 'Se lance (clic droit) : dans une benne, à un collègue…' },
    palette: { bulky: true, heavy: true, name: d => `GROSSE pièce #${d.oid} (palette)`, icon: '🏗️' },
    bac_plein: { bulky: true, name: 'Bac de copeaux PLEIN', icon: '🗑️', hint: 'À vider dans la benne à copeaux (dehors)' },
    bac_vide: { bulky: true, name: d => `Bac vide (pour ${d.mid || '?'})`, icon: '🪣', hint: 'À remettre sur sa machine' },
    matiere: { bulky: true, name: d => d.mat ? `Caisse ${M[d.mat].label} ×${d.q}` : "Caisse d'outils", icon: '🗃️' },
    viennoiseries: { name: 'Viennoiseries', icon: '🥐' },
    extincteur: { kind: 'equip', name: 'Extincteur', icon: '🧯', hint: 'Clic gauche maintenu : éteindre un feu' },
    cle: { kind: 'equip', name: 'Clé à molette', icon: '🔧', hint: 'E sur une machine en panne' },
    soufflette: { kind: 'equip', name: 'Soufflette', icon: '💨', hint: 'Clic gauche : souffler copeaux, flaques… et collègues' },
    jerrican: { kind: 'equip', name: "Jerrican d'essence", icon: '⛽', hint: 'E sur une voiture : +40 % d\'essence' },
    casque: { kind: 'equip', name: 'Casque de sécurité', icon: '⛑️' },
    convention: { kind: 'paper', name: d => d.signee ? 'Convention SIGNÉE' : 'Convention (à faire signer)', icon: '📝' },
    find: { name: d => ML.FINDS[d.k].name, icon: '⭐' }
  };
  I.def = it => I.TYPES[it.type];
  I.name = it => { const n = I.def(it).name; return typeof n === 'function' ? n(it.d || {}) : n; };
  I.icon = it => I.def(it).icon;
  I.bulky = it => !!(it && I.def(it).bulky);
  I.heavy = it => !!(it && I.def(it).heavy);

  /** Modèle 3D d'un objet. opts.noLabel : pas d'étiquette (objet en main) */
  I.mesh = (it, opts) => {
    opts = opts || {};
    const g = new THREE.Group(), d = it.d || {}, U = ML.U;
    switch (it.type) {
      case 'brut_acier': case 'brut_alu': case 'brut_inox':
        U.cyl(0.075, 0.075, 0.6, M[I.TYPES[it.type].mat].color, 0, 0.075, 0, g).rotation.z = Math.PI / 2; break;
      case 'brut_sp':
        if (d.mat === 'fonte') { U.cyl(0.22, 0.22, 0.25, M.fonte.color, 0, 0.125, 0, g); U.cyl(0.08, 0.08, 0.3, 0x3a322c, 0, 0.15, 0, g); }
        else { U.box(0.55, 0.06, 0.4, M.soude.color, 0, 0.03, 0, g); U.box(0.06, 0.3, 0.4, M.soude.color, -0.25, 0.18, 0, g); U.box(0.06, 0.3, 0.4, M.soude.color, 0.25, 0.18, 0, g); }
        break;
      case 'plaquette': U.box(0.25, 0.1, 0.18, 0x333333, 0, 0.05, 0, g); U.box(0.12, 0.03, 0.12, T.plaquette.color, 0, 0.11, 0, g); break;
      case 'fraise': U.cyl(0.045, 0.045, 0.28, T.fraise.color, 0, 0.14, 0, g); break;
      case 'foret': U.cyl(0.02, 0.025, 0.34, T.foret.color, 0, 0.17, 0, g); break;
      case 'extincteur': U.cyl(0.11, 0.11, 0.55, 0xd62d20, 0, 0.28, 0, g); U.box(0.08, 0.1, 0.18, 0x222222, 0, 0.6, 0.05, g); break;
      case 'cle': U.box(0.06, 0.03, 0.34, 0x95a5a6, 0, 0.02, 0, g); U.box(0.12, 0.035, 0.08, 0x7f8c8d, 0, 0.02, 0.18, g); break;
      case 'soufflette': U.box(0.06, 0.16, 0.08, 0xf1c40f, 0, 0.08, 0, g); U.cyl(0.015, 0.015, 0.3, 0x95a5a6, 0, 0.16, 0.18, g).rotation.x = Math.PI / 2; break;
      case 'jerrican': U.box(0.3, 0.38, 0.16, 0x27ae60, 0, 0.19, 0, g); U.box(0.1, 0.06, 0.06, 0x222222, 0.08, 0.41, 0, g); break;
      case 'casque': { const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), U.mat(0xf1c40f)); g.add(m); break; }
      case 'convention': U.box(0.34, 0.012, 0.24, 0xffffff, 0, 0.01, 0, g); U.box(0.08, 0.016, 0.04, d.signee ? 0x27ae60 : 0xc0392b, 0.1, 0.012, 0.08, g); break;
      case 'viennoiseries': U.box(0.24, 0.3, 0.15, 0xc8a165, 0, 0.15, 0, g); U.box(0.12, 0.08, 0.1, 0xe1a95f, 0, 0.32, 0, g); break;
      case 'find': {
        const f = ML.FINDS[d.k];
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshLambertMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 0.5 }));
        m.position.y = 0.45; g.add(m); g.userData.spin = m;
        break;
      }
      case 'piece': {
        U.cyl(0.13, 0.13, 0.12, 0xb8c2cc, 0, 0.06, 0, g, 12); U.cyl(0.05, 0.05, 0.14, 0x555555, 0, 0.07, 0, g, 8);
        if (!opts.noLabel) { const l = U.label('#' + d.oid, { size: 0.2, fontSize: 40 }); l.position.y = 0.45; g.add(l); }
        break;
      }
      case 'palette': {
        U.box(1.2, 0.14, 1.0, 0x8d6e63, 0, 0.07, 0, g); for (const x of [-0.5, 0, 0.5]) U.box(0.12, 0.1, 1.0, 0x6d4c41, x, 0.02, 0, g);
        U.box(1.0, 0.7, 0.8, 0x95a5a6, 0, 0.5, 0, g); U.cyl(0.32, 0.32, 0.9, 0x7f8c8d, 0, 1.0, 0, g, 10).rotation.z = Math.PI / 2;
        if (!opts.noLabel) { const o = ML.Game && ML.Game.order(d.oid); const l = U.label(`🏗 #${d.oid}` + (o ? ' → ' + ML.COMPANIES[o.client].name : ''), { size: 0.3, fontSize: 40, color: '#ffd257' }); l.position.y = 1.9; g.add(l); }
        break;
      }
      case 'bac_plein': case 'bac_vide':
        U.box(0.8, 0.5, 0.6, 0x2c3e50, 0, 0.25, 0, g); if (it.type === 'bac_plein') U.box(0.72, 0.12, 0.52, 0xb0b7bf, 0, 0.5, 0, g);
        break;
      case 'caisse': case 'matiere': {
        const tint = it.type === 'caisse' ? 0xffffff : (d.mat ? 0x9ec5ff : 0xffd2a0);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), ML.Tex.mat('bois', 1, 1, tint));
        b.position.y = 0.35; b.castShadow = b.receiveShadow = true; g.add(b);
        if (!opts.noLabel) {
          let t = '';
          if (it.type === 'caisse') { const o = ML.Game && ML.Game.order(d.oid); t = `#${d.oid}` + (o ? ' → ' + ML.COMPANIES[o.client].name : ''); }
          else t = d.mat ? `${M[d.mat].label} ×${d.q}` : 'OUTILS';
          const l = U.label(t, { size: 0.22, fontSize: 40 }); l.position.y = 0.95; g.add(l); g.userData.label = l;
        }
        break;
      }
    }
    return g;
  };
})();
