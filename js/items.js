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
    caisse: { bulky: true, name: d => `Caisse #${d.oid}` + (d.nc ? ' (?)' : ''), icon: '📦' },
    matiere: { bulky: true, name: d => d.mat ? `Caisse ${M[d.mat].label} ×${d.q}` : "Caisse d'outils", icon: '🗃️' },
    viennoiseries: { name: 'Viennoiseries', icon: '🥐' },
    find: { name: d => ML.FINDS[d.k].name, icon: '⭐' }
  };
  I.def = it => I.TYPES[it.type];
  I.name = it => { const n = I.def(it).name; return typeof n === 'function' ? n(it.d || {}) : n; };
  I.icon = it => I.def(it).icon;
  I.bulky = it => !!(it && I.def(it).bulky);

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
      case 'viennoiseries': U.box(0.24, 0.3, 0.15, 0xc8a165, 0, 0.15, 0, g); U.box(0.12, 0.08, 0.1, 0xe1a95f, 0, 0.32, 0, g); break;
      case 'find': {
        const f = ML.FINDS[d.k];
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshLambertMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 0.5 }));
        m.position.y = 0.45; g.add(m); g.userData.spin = m;
        break;
      }
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
