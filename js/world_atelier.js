/* =====================================================================
   world_atelier.js — L'ATELIER LEBEC ÉVOLUTIF (V5 carrière) : bâtiment à
   5 niveaux, pièces annexes, mobilier, modèles 3D des machines par
   gamme (tier 0..4), voyants, tuyaux d'air comprimé, API d'installation.

   Appelé par World.build (world.js) dans l'ordre : W.atelier → W.furniture
   → W.machinesBuild. Tout est construit d'après ML.ATELIER :
     { career, lvl 0..4, rooms:{be,stock,pause,vestiaire,metrologie,quai}, box }
   Hors carrière (ou ML.ATELIER absent) : niveau 3 + pièces be/stock/pause.

   NIVEAUX (mur de façade toujours en z = 14, porte au centre) :
     0 « Le Hangar Pourri » 18×12 : tôle rouillée trouée, bâche percée (puits
       de lumière + seau sous la fuite), néon qui clignote, cartons, rallonges,
       panneau peint à la main de travers, vieux PC beige = PC du BE.
     1 « Rafistolé » 24×16 : parpaings + tôle neuve, rustines de contreplaqué.
     2 « Propre » 32×20 : bardage neuf, néons partout, allée peinte.
     3 « Pro » 40×28 : le look V4 + pont roulant.
     4 « L'Usine de Fou » 52×34 : façade vitrée, LED, sol époxy, pont roulant,
       robot de démonstration, bureau vitré de Lebec sur mezzanine, écrans géants.
   PIÈCES ANNEXES (porte intérieure) : pause (gauche, avant), vestiaire
   (gauche, fond), be (droite, avant), metrologie (droite, fond), stock (fond),
   quai (auvent dans la cour, au-dessus du quai gros colis).

   POSITIONS (recalculées par niveau / pièces) : ML.LOC.spawn[5], patrol,
   coffee, idle, lebec, hooks, reception, expedition, bigZone, livraison,
   carSpawn, tpSpawn, fenSpawn, camSpawn, benne, doorIn, + aisle {z,minX,maxX}
   (allée centrale) et atelier {box, rooms} (rectangles des pièces).
   Cibles W.targets : rack:*, tool:*, coffee, reception, printer, pc, be,
   marbre, panel, casques, benne, frigo (si salle de pause ou W.up.frigo),
   mach:<id>, bac:<id>.

   API MACHINES (runtime) :
   - W.atelierBounds() → {minX,maxX,minZ,maxZ} zone d'installation (sans les
     zones réception / expédition devant la porte).
   - W.machineFootprint(def) → {minX,maxX,minZ,maxZ} emprise monde (machine +
     place de l'opérateur + bac à copeaux), rot comprise.
   - W.addMachine(def) / W.removeMachine(id) : modèle 3D (selon def.tier /
     def.type / def.len), collider (référence gardée, retiré par
     U.removeCollider), cibles mach:/bac:, W.machines[id] = { def, group,
     lightMat, spinner (spinner2 pour le bi-broche), smoke, label, station
     {x,z,yaw}, chips {x,z}, collider }.
   - W.syncMachines(defs) : ajoute / retire / déplace (clé id+x+z+rot+model).
   - W.machineGhost(def|null, ok) : fantôme translucide vert/rouge + contour
     de l'emprise au sol ; null = caché.
   - rot = quarts de tour autour de Y (repère local : tour le long de x,
     opérateur côté +z ; fraiseuse opérateur côté −z, comme en V4).
   Divers : W.updateAtelier(dt) (néon qui clignote, gouttes, pont roulant,
   robot) est aussi appelée par W.updateVisuals. W.inAtelier(p) : point dans
   le bâtiment ou une pièce. W.route(from, x, z) : points de passage
   (allée + portes des pièces) proposés pour la marche des PNJ.

   PERFORMANCES : le décor statique est « cuit » (bake) : tous les matériaux
   toon unis deviennent UN maillage à couleurs par sommet ; les matériaux
   texturés / émissifs / transparents restent groupés par matériau. Chaque
   machine est cuite séparément (≈ 8 appels de dessin). Les barres des racks
   sont des InstancedMesh (1 appel par rack).

   ---------------------------------------------------------------------
   TUYAU D'AIR DE LA SOUFFLETTE (inchangé) :
   - W.HOSE_LEN (14 m), W.hoseReels (un enrouleur par crochet de soufflette,
     dans l'ordre des crochets ML.LOC.hooks de type 'soufflette'),
   - W.updateHoses(list) : à chaque image, positions monde des soufflettes ;
     renvoie l'indice d'enrouleur attribué à chacune (-1 = aucun).

   OUTIL DE TEST : index.html#lvl=2&rooms=be,stock (avec ou sans #cam=…)
   force le niveau / les pièces de l'atelier du MENU (rien en partie).
   ===================================================================== */
(function () {
  const W = ML.World, U = ML.U, T = ML.Tex, ST = ML.Style, P = ML.PAL;
  const Q = Math.PI / 2;
  let root, stat;                                   // stat = décor statique (cuit à la fin)
  const add = o => { root.add(o); return o; };
  const M = c => (typeof c === 'number' ? ST.toon(c) : c);
  const HX = c => ST.hex(c);
  /** boîte « jouet » */
  const bx = (w, h, d, c, x, y, z, parent, r) => ST.box(w, h, d, M(c), x, y, z, parent || stat, r);
  /** cylindre */
  const cy = (rt, rb, h, c, x, y, z, parent, seg) => U.cyl(rt, rb, h, M(c), x, y, z, parent || stat, seg || 10);
  const offMat = (m, f) => { if (!m.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -f; m.polygonOffsetUnits = -2 * f; } return m; };
  const markMat = c => offMat(ST.toon(c, 0, { key: 'marqueSol' }), 6);
  /** aplat au sol */
  const flat = (w, d, c, x, z, y, parent) => U.plane(w, d, markMat(c), x, z, y || 0.036, parent || stat);
  const ensureStat = () => { root = W.root; if (!stat || stat.parent !== root) stat = add(new THREE.Group()); return stat; };
  /** boîte texturée dont les UV suivent les dimensions (une seule texture répétée pour tout le décor) */
  function texBox(w, h, d, mat, x, y, z, parent, unit) {
    unit = unit || 2;
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit); }
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (parent || stat).add(m); return m;
  }
  const texM = (key, tint) => ST.toon(tint || P.white, 0, { map: T.tex(key, 1, 1), key: 'texAt_' + key + '_' + tint });
  /** générateur déterministe (même atelier chez tous les joueurs) */
  let rnd = U.rng(77);

  /* =====================================================================
     ATLAS d'autocollants : une seule texture 2048×2048 dessinée par code.
     ===================================================================== */
  const ATL = (() => {
    const NW = 2048, NH = 2048, CW = 128, CH = 64, cols = NW / CW, rows = NH / CH;
    const cv = document.createElement('canvas'); cv.width = NW; cv.height = NH;
    const ctx = cv.getContext('2d'), occ = new Uint8Array(cols * rows), cells = {};
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    function alloc(wc, hc) {
      for (let r = 0; r <= rows - hc; r++) for (let c = 0; c <= cols - wc; c++) {
        let ok = true;
        for (let i = 0; i < hc && ok; i++) for (let j = 0; j < wc; j++) if (occ[(r + i) * cols + c + j]) { ok = false; break; }
        if (!ok) continue;
        for (let i = 0; i < hc; i++) for (let j = 0; j < wc; j++) occ[(r + i) * cols + c + j] = 1;
        return [c * CW, r * CH, wc * CW, hc * CH];
      }
      console.warn('Atlas atelier plein'); return [0, 0, CW, CH];
    }
    return {
      tex,
      get(key, wc, hc, draw) {
        if (cells[key]) return cells[key];
        const [px, py, pw, ph] = alloc(wc, hc);
        ctx.save(); ctx.translate(px, py); ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip(); draw(ctx, pw, ph); ctx.restore();
        tex.needsUpdate = true;
        return (cells[key] = { u0: (px + 2) / NW, u1: (px + pw - 2) / NW, v0: 1 - (py + ph - 2) / NH, v1: 1 - (py + 2) / NH });
      }
    };
  })();
  const atlMat = () => { const m = ST.toon(P.white, 0, { map: ATL.tex, key: 'atelierAtlas' }); m.alphaTest = 0.5; return m; };
  const atlFloorMat = () => { const m = offMat(ST.toon(P.white, 0, { map: ATL.tex, key: 'atelierAtlasSol' }), 7); m.alphaTest = 0.5; return m; };
  const glowMat = () => { const m = ST.toon(P.black, P.white, { key: 'atelierEcran' }); if (m.emissiveMap !== ATL.tex) { m.emissiveMap = ATL.tex; m.needsUpdate = true; } return m; };
  /** Autocollant / panneau peint. ry : orientation (0 = face +z). floor : posé au sol. glow : écran lumineux. */
  function sticker(key, wc, hc, draw, w, h, x, y, z, ry, opt) {
    opt = opt || {};
    const c = ATL.get(key, wc, hc, draw), g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) > 0.5 ? c.u1 : c.u0, uv.getY(i) > 0.5 ? c.v1 : c.v0);
    const m = new THREE.Mesh(g, opt.glow ? glowMat() : opt.floor ? atlFloorMat() : atlMat());
    m.position.set(x, y, z);
    if (opt.floor) m.rotation.set(-Math.PI / 2, 0, ry || 0); else m.rotation.set(opt.tilt || 0, ry || 0, opt.roll || 0, 'YXZ');
    m.receiveShadow = true; (opt.parent || stat).add(m); return m;
  }

  /* ---------- petits outils de dessin 2D ---------- */
  const FONT = (s, w) => `${w || 900} ${s}px "Trebuchet MS", "Arial Rounded MT Bold", Arial`;
  const HAND = s => `bold ${s}px "Comic Sans MS", "Segoe Print", cursive`;
  function rrect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function fit(x, s, cx, cy, maxW, fs, col, font) {
    font = font || FONT; x.font = font(fs); while (x.measureText(s).width > maxW && fs > 7) { fs -= 1; x.font = font(fs); }
    x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, cx, cy);
  }
  const sign = (bg, fg, lines, border) => (x, w, h) => {
    rrect(x, 3, 3, w - 6, h - 6, Math.min(w, h) * 0.14); x.fillStyle = bg; x.fill();
    if (border !== false) { x.lineWidth = Math.min(w, h) * 0.05; x.strokeStyle = border || 'rgba(255,255,255,0.75)'; x.stroke(); }
    const n = lines.length, big = h * (n === 1 ? 0.5 : n === 2 ? 0.34 : 0.26);
    lines.forEach((s, i) => { const y = n === 1 ? h / 2 : h * (0.3 + i * (0.42 / (n - 1)) * (n === 3 ? 1.05 : 1)); fit(x, s, w / 2, y, w * 0.88, i === 0 ? big : big * 0.62, fg); });
  };
  const postit = (bg, lines) => (x, w, h) => {
    x.fillStyle = bg; x.fillRect(4, 4, w - 8, h - 8); x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(4, 4, w - 8, h * 0.12);
    lines.forEach((s, i) => fit(x, s, w / 2, h * (0.32 + i * 0.5 / Math.max(1, lines.length - 1 || 1)), w * 0.86, h * 0.2, '#2a2a6a', HAND));
  };
  const floorTxt = (s, col) => (x, w, h) => fit(x, s, w / 2, h / 2, w * 0.95, h * 0.75, col);
  const solid = c => (x, w, h) => { x.fillStyle = HX(c); x.fillRect(0, 0, w, h); };
  const hatch = (x, w, h) => { x.fillStyle = HX(P.black); x.fillRect(0, 0, w, h); x.fillStyle = HX(P.lebecYellow); for (let i = -h; i < w + h; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 20, 0); x.lineTo(i + 20 - h, h); x.lineTo(i - h, h); x.fill(); } };
  const outline = kind => (x, w, h) => {
    x.strokeStyle = HX(P.white); x.fillStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 7; x.lineCap = x.lineJoin = 'round';
    const cx = w / 2;
    if (kind === 'cle') { x.beginPath(); x.moveTo(cx, h * 0.22); x.lineTo(cx, h * 0.8); x.stroke(); x.beginPath(); x.arc(cx, h * 0.16, w * 0.22, 0.6, Math.PI * 2 - 0.6 + Math.PI); x.stroke(); x.beginPath(); x.arc(cx, h * 0.86, w * 0.16, 0, 7); x.stroke(); }
    else if (kind === 'souff') { rrect(x, w * 0.3, h * 0.35, w * 0.25, h * 0.45, 10); x.fill(); x.stroke(); x.beginPath(); x.moveTo(w * 0.42, h * 0.38); x.lineTo(w * 0.42, h * 0.12); x.lineTo(w * 0.9, h * 0.12); x.stroke(); }
    else if (kind === 'pelle') {
      x.beginPath(); x.moveTo(cx, h * 0.1); x.lineTo(cx, h * 0.58); x.stroke(); rrect(x, cx - w * 0.14, h * 0.04, w * 0.28, h * 0.07, 6); x.stroke();
      x.beginPath(); x.moveTo(cx - w * 0.2, h * 0.58); x.lineTo(cx + w * 0.2, h * 0.58); x.lineTo(cx + w * 0.17, h * 0.8); x.lineTo(cx, h * 0.88); x.lineTo(cx - w * 0.17, h * 0.8); x.closePath(); x.fill(); x.stroke();
    }
  };
  const photoLebec = (x, w, h) => {
    x.fillStyle = HX(P.woodDark); x.fillRect(0, 0, w, h); x.fillStyle = HX(P.lebecYellow); x.fillRect(10, 10, w - 20, h - 20);
    const a = 18, b = 18, iw = w - 36, ih = h - 60;
    x.fillStyle = HX(P.skyTop); x.fillRect(a, b, iw, ih); x.fillStyle = HX(P.grass); x.fillRect(a, b + ih * 0.72, iw, ih * 0.28);
    x.fillStyle = HX(P.white); x.beginPath(); x.arc(a + iw * 0.8, b + ih * 0.2, ih * 0.1, 0, 7); x.fill();
    const fx = a + iw * 0.42, fy = b + ih * 0.3;
    x.fillStyle = HX(P.lebecBlue); rrect(x, fx - ih * 0.12, fy + ih * 0.12, ih * 0.24, ih * 0.32, 8); x.fill();
    x.fillStyle = HX(P.machineDark); x.fillRect(fx - ih * 0.1, fy + ih * 0.42, ih * 0.08, ih * 0.16); x.fillRect(fx + ih * 0.02, fy + ih * 0.42, ih * 0.08, ih * 0.16);
    x.fillStyle = HX(P.plasterWarm); x.beginPath(); x.arc(fx, fy, ih * 0.13, 0, 7); x.fill();
    x.fillStyle = HX(P.black); x.fillRect(fx - ih * 0.08, fy + ih * 0.03, ih * 0.16, ih * 0.035);
    x.beginPath(); x.arc(fx - ih * 0.045, fy - ih * 0.03, 3, 0, 7); x.arc(fx + ih * 0.045, fy - ih * 0.03, 3, 0, 7); x.fill();
    x.strokeStyle = HX(P.black); x.lineWidth = 3; x.beginPath(); x.arc(fx, fy + ih * 0.03, ih * 0.06, 0.3, Math.PI - 0.3); x.stroke();
    x.strokeStyle = HX(P.wood); x.lineWidth = 8; x.beginPath(); x.moveTo(fx + ih * 0.2, fy - ih * 0.12); x.lineTo(fx + ih * 0.36, fy + ih * 0.5); x.stroke();
    x.fillStyle = HX(P.steel); x.beginPath(); x.moveTo(fx + ih * 0.28, fy + ih * 0.46); x.lineTo(fx + ih * 0.46, fy + ih * 0.42); x.lineTo(fx + ih * 0.47, fy + ih * 0.66); x.lineTo(fx + ih * 0.34, fy + ih * 0.7); x.fill();
    fit(x, 'Moi et ma pelle ♥', w / 2, h - 26, w * 0.9, 26, HX(P.woodDark), s => `bold ${s}px "Comic Sans MS", cursive`);
  };
  const eyes = (x, w, h) => {
    x.fillStyle = HX(P.lebecBlue); x.fillRect(0, 0, w, h); x.strokeStyle = HX(P.lebecYellow); x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
    for (const ex of [w * 0.33, w * 0.67]) { x.fillStyle = HX(P.white); x.beginPath(); x.ellipse(ex, h * 0.4, w * 0.13, h * 0.2, 0, 0, 7); x.fill(); x.fillStyle = HX(P.black); x.beginPath(); x.arc(ex + w * 0.04, h * 0.44, h * 0.08, 0, 7); x.fill(); }
    fit(x, 'LEBEC VOUS REGARDE', w / 2, h * 0.8, w * 0.86, h * 0.13, HX(P.lebecYellow));
  };
  const logo = (x, w, h) => {
    const r = Math.min(w, h) / 2 - 6; x.fillStyle = HX(P.lebecYellow); x.beginPath(); x.arc(w / 2, h / 2, r, 0, 7); x.fill();
    x.fillStyle = HX(P.lebecBlue); x.beginPath(); x.arc(w / 2, h / 2, r * 0.86, 0, 7); x.fill();
    x.save(); x.translate(w / 2, h / 2); x.rotate(-0.6); x.fillStyle = HX(P.lebecYellow);
    x.fillRect(-r * 0.06, -r * 0.7, r * 0.12, r * 0.85); rrect(x, -r * 0.18, -r * 0.8, r * 0.36, r * 0.12, 6); x.fill();
    x.beginPath(); x.moveTo(-r * 0.26, r * 0.12); x.lineTo(r * 0.26, r * 0.12); x.lineTo(r * 0.22, r * 0.55); x.lineTo(0, r * 0.7); x.lineTo(-r * 0.22, r * 0.55); x.fill(); x.restore();
    fit(x, 'M·L', w / 2, h * 0.78, r, r * 0.3, HX(P.white));
  };
  const danger = (x, w, h) => {
    x.fillStyle = HX(P.lebecYellow); x.strokeStyle = HX(P.black); x.lineWidth = 8; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(w / 2, 8); x.lineTo(w - 8, h - 8); x.lineTo(8, h - 8); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = HX(P.black); x.beginPath(); x.moveTo(w * 0.55, h * 0.3); x.lineTo(w * 0.4, h * 0.62); x.lineTo(w * 0.52, h * 0.6); x.lineTo(w * 0.45, h * 0.86); x.lineTo(w * 0.62, h * 0.52); x.lineTo(w * 0.5, h * 0.54); x.closePath(); x.fill();
  };
  const extSign = (x, w, h) => {
    x.fillStyle = HX(P.red); rrect(x, 3, 3, w - 6, h - 6, 12); x.fill();
    x.fillStyle = HX(P.white); rrect(x, w * 0.1, h * 0.25, w * 0.13, h * 0.6, 8); x.fill(); x.fillRect(w * 0.13, h * 0.14, w * 0.07, h * 0.12); x.fillRect(w * 0.18, h * 0.14, w * 0.1, h * 0.05);
    fit(x, 'EXTINCTEUR', w * 0.6, h * 0.4, w * 0.66, h * 0.3, HX(P.white)); fit(x, '(pas pour le barbecue)', w * 0.6, h * 0.72, w * 0.66, h * 0.16, HX(P.white));
  };
  const arexis = (x, w, h) => {
    x.fillStyle = HX(P.glassDark); x.fillRect(0, 0, w, h); x.fillStyle = HX(P.lebecBlue); x.fillRect(0, 0, w, h * 0.16);
    fit(x, 'AREXIS ERP v0.3', w * 0.4, h * 0.08, w * 0.7, h * 0.11, HX(P.white));
    x.fillStyle = HX(P.red); x.fillRect(w * 0.92, h * 0.03, w * 0.05, h * 0.1);
    fit(x, 'Chargement…', w / 2, h * 0.42, w * 0.8, h * 0.13, HX(P.white));
    x.fillStyle = HX(P.white); x.fillRect(w * 0.15, h * 0.58, w * 0.7, h * 0.1); x.fillStyle = HX(P.mint); x.fillRect(w * 0.16, h * 0.595, w * 0.08, h * 0.07);
    fit(x, '3 % — depuis 2009', w / 2, h * 0.82, w * 0.8, h * 0.09, HX(P.glass));
  };
  const cnc = (x, w, h) => {
    x.fillStyle = HX(P.machineDark); x.fillRect(0, 0, w, h); x.fillStyle = HX(P.mint); x.font = FONT(h * 0.13, 700); x.textAlign = 'left'; x.textBaseline = 'top';
    ['G00 X0 Z2', 'G01 Z-40 F0.2', 'M03 S1200', 'M08 (arrosage)', 'M30 ;-)'].forEach((s, i) => x.fillText(s, 8, 6 + i * h * 0.18));
  };
  const planning = (x, w, h) => {
    x.fillStyle = HX(P.white); x.fillRect(0, 0, w, h); x.strokeStyle = HX(P.lebecBlue); x.lineWidth = 2;
    fit(x, 'PLANNING DES PAUSES', w / 2, h * 0.1, w * 0.9, h * 0.1, HX(P.lebecBlue));
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) x.strokeRect(w * 0.06 + i * w * 0.176, h * 0.22 + j * h * 0.18, w * 0.176, h * 0.18);
    ['LUN', 'MAR', 'MER', 'JEU', 'VEN'].forEach((s, i) => fit(x, s, w * 0.148 + i * w * 0.176, h * 0.31, w * 0.15, h * 0.08, HX(P.machineDark)));
    fit(x, 'Lebec : TOUJOURS', w / 2, h * 0.6, w * 0.8, h * 0.11, HX(P.red), HAND);
  };
  const tableau = (x, w, h) => {
    x.fillStyle = HX(P.white); x.fillRect(0, 0, w, h);
    fit(x, 'OBJECTIFS DU JOUR', w / 2, h * 0.12, w * 0.8, h * 0.11, HX(P.lebecBlue), HAND);
    [['1. Usiner les pièces', P.machineDark], ['2. Pas de copeaux par terre', P.machineDark], ['3. Rendre la pelle à Lebec', P.red], ['4. Relire le poly', P.machineDark]]
      .forEach(([s, c], i) => { x.textAlign = 'left'; x.font = HAND(h * 0.085); x.fillStyle = HX(c); x.fillText(s, w * 0.07, h * (0.32 + i * 0.15)); });
    x.strokeStyle = HX(P.red); x.lineWidth = 5; x.beginPath(); x.ellipse(w * 0.8, h * 0.78, w * 0.14, h * 0.12, -0.2, 0, 7); x.stroke();
    fit(x, 'URGENT', w * 0.8, h * 0.78, w * 0.2, h * 0.09, HX(P.red), HAND);
  };
  /** planche peinte à la main (niveau 0 : de travers, lettres qui coulent) */
  const planche = neat => (x, w, h) => {
    for (let i = 0; i < 3; i++) { x.fillStyle = HX(i % 2 ? P.wood : P.woodDark); x.fillRect(0, i * h / 3, w, h / 3 - 3); }
    x.strokeStyle = 'rgba(60,35,15,0.5)'; x.lineWidth = 2; for (let i = 0; i < 12; i++) { x.beginPath(); const y = (i * 37) % h; x.moveTo(0, y); x.bezierCurveTo(w / 3, y + 6, w * 2 / 3, y - 6, w, y + 3); x.stroke(); }
    if (neat) { fit(x, 'MÉCANIQUE LEBEC', w / 2, h * 0.42, w * 0.9, h * 0.42, HX(P.lebecYellow)); fit(x, 'usinage (presque) de précision', w / 2, h * 0.8, w * 0.8, h * 0.16, HX(P.white)); return; }
    const s = 'MÉCANIQUE LEBEC'; x.font = HAND(h * 0.36); x.textAlign = 'left'; x.textBaseline = 'middle';
    let cx = w * 0.03;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], y = h * 0.42 + Math.sin(i * 1.7) * h * 0.06, sz = h * (0.4 + ((i * 7) % 5) * 0.025);
      x.font = HAND(sz); x.fillStyle = i === 3 ? HX(P.red) : HX(P.lebecYellow); x.save(); x.translate(cx, y); x.rotate(Math.sin(i * 2.3) * 0.15); x.fillText(ch, 0, 0); x.restore();
      if (i % 4 === 1) { x.fillStyle = HX(P.lebecYellow); x.fillRect(cx + sz * 0.2, y + sz * 0.3, 3, sz * 0.5); }        // peinture qui coule
      cx += x.measureText(ch).width * 0.98;
    }
    fit(x, '(ouvert)', w * 0.86, h * 0.84, w * 0.24, h * 0.14, HX(P.white), HAND);
  };
  /** écran du vieux PC beige */
  const beige = (x, w, h) => {
    x.fillStyle = '#0b2a12'; x.fillRect(0, 0, w, h); x.fillStyle = '#5dff8a'; x.font = `bold ${h * 0.12}px "Courier New", monospace`; x.textAlign = 'left'; x.textBaseline = 'top';
    ['C:\\> LEBEC.EXE', 'DEVIS.XLS (1997)', 'Mémoire : 4 Mo', 'Erreur 0x0000PELLE', 'C:\\> _'].forEach((s, i) => x.fillText(s, 8, 6 + i * h * 0.19));
  };
  /** écran CAO : une pièce en fil de fer */
  const cao = (x, w, h) => {
    x.fillStyle = HX(P.glassDark); x.fillRect(0, 0, w, h); x.fillStyle = HX(P.slate); x.fillRect(0, 0, w, h * 0.12); x.fillRect(0, 0, w * 0.12, h);
    x.strokeStyle = HX(P.glass); x.lineWidth = 3; const cx = w * 0.56, cyy = h * 0.56, r = h * 0.28;
    x.beginPath(); x.ellipse(cx, cyy - r * 0.5, r, r * 0.4, 0, 0, 7); x.stroke(); x.beginPath(); x.ellipse(cx, cyy + r * 0.5, r, r * 0.4, 0, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(cx - r, cyy - r * 0.5); x.lineTo(cx - r, cyy + r * 0.5); x.moveTo(cx + r, cyy - r * 0.5); x.lineTo(cx + r, cyy + r * 0.5); x.stroke();
    x.strokeStyle = HX(P.lebecYellow); x.beginPath(); x.ellipse(cx, cyy - r * 0.5, r * 0.4, r * 0.16, 0, 0, 7); x.stroke();
    fit(x, 'BRIDE_LEBEC_v47_FINAL2.stp', w * 0.56, h * 0.06, w * 0.8, h * 0.08, HX(P.white));
  };
  /** plan bleu (tirage) */
  const plan = (x, w, h) => {
    x.fillStyle = HX(P.shutterBlue); x.fillRect(0, 0, w, h); x.strokeStyle = HX(P.white); x.lineWidth = 3; x.strokeRect(8, 8, w - 16, h - 16);
    x.lineWidth = 2; x.strokeRect(w * 0.12, h * 0.2, w * 0.4, h * 0.45); x.beginPath(); x.arc(w * 0.32, h * 0.42, h * 0.12, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(w * 0.12, h * 0.75); x.lineTo(w * 0.52, h * 0.75); x.stroke(); fit(x, 'Ø 42 H7', w * 0.32, h * 0.82, w * 0.3, h * 0.07, HX(P.white));
    x.strokeRect(w * 0.62, h * 0.25, w * 0.25, h * 0.35); x.strokeRect(w * 0.6, h * 0.72, w * 0.33, h * 0.18);
    fit(x, 'LEBEC — ne pas plier', w * 0.765, h * 0.81, w * 0.3, h * 0.06, HX(P.white));
  };
  /** grand écran de production (usine) */
  const kpi = (x, w, h) => {
    x.fillStyle = HX(P.machineDark); x.fillRect(0, 0, w, h); fit(x, 'PRODUCTION DU JOUR', w * 0.3, h * 0.12, w * 0.55, h * 0.1, HX(P.white));
    fit(x, '147 %', w * 0.3, h * 0.42, w * 0.5, h * 0.34, HX(P.mint)); fit(x, 'Lebec est content (rare)', w * 0.3, h * 0.72, w * 0.55, h * 0.08, HX(P.lebecYellow));
    for (let i = 0; i < 7; i++) { const bh = h * (0.2 + ((i * 37) % 10) / 16); x.fillStyle = HX(i === 6 ? P.mint : P.shutterBlue); x.fillRect(w * 0.62 + i * w * 0.05, h * 0.88 - bh, w * 0.035, bh); }
    fit(x, 'JOURS SANS ACCIDENT : 0̶ 1', w * 0.3, h * 0.9, w * 0.55, h * 0.08, HX(P.red));
  };
  const tv = (x, w, h) => { x.fillStyle = HX(P.grassDark); x.fillRect(0, 0, w, h); x.strokeStyle = HX(P.white); x.lineWidth = 3; x.strokeRect(w * 0.1, h * 0.15, w * 0.8, h * 0.7); x.beginPath(); x.moveTo(w / 2, h * 0.15); x.lineTo(w / 2, h * 0.85); x.stroke(); x.fillStyle = HX(P.machineDark); x.fillRect(0, h * 0.82, w, h * 0.18); fit(x, 'BREST 3 - 0 PSG', w / 2, h * 0.91, w * 0.9, h * 0.13, HX(P.white)); };
  const dro = (x, w, h) => { x.fillStyle = HX(P.black); x.fillRect(0, 0, w, h); x.fillStyle = HX(P.red); x.font = `bold ${h * 0.34}px "Courier New", monospace`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('X 012.37', 6, h * 0.3); x.fillText('Z-040.02', 6, h * 0.74); };
  const temp = (x, w, h) => { x.fillStyle = HX(P.black); x.fillRect(0, 0, w, h); fit(x, '20,0 °C', w / 2, h * 0.42, w * 0.9, h * 0.5, HX(P.mint)); fit(x, 'ne pas souffler dessus', w / 2, h * 0.85, w * 0.9, h * 0.16, HX(P.white)); };

  /* ---------- tables d'autocollants (clé, cases L×H, dessin) ---------- */
  const STK = {
    poly: ['poly', 3, 2, sign(HX(P.lebecYellow), HX(P.red), ["C'EST ÉCRIT DANS", 'LE POLY !!'], HX(P.red))],
    toucher: ['toucher', 3, 2, sign(HX(P.white), HX(P.lebecBlue), ['NE PAS TOUCHER', '(sauf si tu sais)'], HX(P.lebecBlue))],
    lunettes: ['lunettes', 3, 2, sign(HX(P.lebecBlue), HX(P.white), ['LUNETTES', 'OBLIGATOIRES'])],
    bonjour: ['bonjour', 3, 2, sign(HX(P.pink), HX(P.white), ['Bonjour,', "je m'appelle Josiane"])],
    turn: ['turn', 3, 1, sign(HX(P.machineDark), HX(P.lebecYellow), ['LEBEC-TURN 3000'])],
    mill: ['mill', 3, 1, sign(HX(P.machineDark), HX(P.lebecYellow), ['LEBEC-MILL 2.0'])],
    ernault: ['ernault', 3, 1, sign(HX(P.steelDark), HX(P.white), ['ERNAULT · 1974'], false)],
    hure: ['hure', 3, 1, sign(HX(P.steelDark), HX(P.white), ['HURÉ · 1968'], false)],
    cazeneuve: ['cazeneuve', 3, 1, sign(HX(P.shutterGreen), HX(P.white), ['CAZENEUVE HB 575'])],
    gambin: ['gambin', 3, 1, sign(HX(P.shutterBlue), HX(P.white), ['GAMBIN 2M'])],
    twin: ['twin', 4, 1, sign(HX(P.lebecBlue), HX(P.white), ['TWINTURN · bi-broche'])],
    vm: ['vm', 4, 1, sign(HX(P.lebecBlue), HX(P.white), ['VM-40 · centre 3 axes'])],
    dmg: ['dmg', 4, 1, sign(HX(P.black), HX(P.mint), ['DMG-LEBEC 5X'], HX(P.mint))],
    scotch: ['scotch', 2, 1, postit(HX(P.lebecYellow), ['LEVIER : NE', 'PAS TOUCHER'])],
    cnc: ['cnc', 2, 2, cnc], arexis: ['arexis', 3, 3, arexis], beige: ['beige', 2, 2, beige], cao: ['cao', 3, 2, cao], plan: ['plan', 4, 3, plan],
    kpi: ['kpi', 8, 4, kpi], tv: ['tv', 3, 2, tv], dro: ['dro', 2, 1, dro], temp: ['temp', 2, 1, temp],
    planche: ['planche', 6, 2, planche(false)], planche2: ['planche2', 6, 2, planche(true)],
    ledM: ['ledM', 1, 1, solid(P.mint)], ledP: ['ledP', 1, 1, solid(P.purple)], ledY: ['ledY', 1, 1, solid(P.lebecYellow)], ledW: ['ledW', 1, 1, solid(P.mark)],
    photo: ['photo', 2, 3, photoLebec], eyes: ['eyes', 4, 4, eyes], logo: ['logo', 3, 6, logo], danger: ['danger', 2, 3, danger],
    ext: ['ext', 4, 4, extSign], hatch: ['hatch', 4, 2, hatch],
    cle: ['cle', 1, 3, outline('cle')], souff: ['souff', 1, 2, outline('souff')], pelle: ['pelle', 1, 5, outline('pelle')],
    employe: ['employe', 4, 4, (x, w, h) => { photoLebec(x, w, h); x.fillStyle = HX(P.lebecBlue); x.fillRect(0, 0, w, h * 0.17); fit(x, 'EMPLOYÉ DU MOIS', w / 2, h * 0.085, w * 0.9, h * 0.11, HX(P.lebecYellow)); }],
    reserve: ['reserve', 4, 4, sign(HX(P.lebecBlue), HX(P.white), ['PLACE RÉSERVÉE', 'M. LEBEC', '(et sa pelle)'])],
    lebecSol: ['lebecSol', 4, 4, floorTxt('M. LEBEC', HX(P.lebecYellow))],
    livrSol: ['livrSol', 4, 2, floorTxt('LIVRAISONS', HX(P.lebecYellow))],
    recSol: ['recSol', 4, 2, floorTxt('RÉCEPTION', HX(P.white))],
    expSol: ['expSol', 4, 2, floorTxt('EXPÉDITION', HX(P.white))],
    quaiSol: ['quaiSol', 5, 2, floorTxt('QUAI GROS COLIS', HX(P.white))],
    rack: ['rack', 3, 2, sign(HX(P.orange), HX(P.white), ['NE PAS GRIMPER', '(oui, toi)'])],
    rangez: ['rangez', 5, 1, sign(HX(P.lebecBlue), HX(P.lebecYellow), ['OUTILS : ON REMET À SA PLACE !!'])],
    compr: ['compr', 3, 2, sign(HX(P.red), HX(P.white), ['COMPRESSEUR', '10 bar', "on ne s'assoit pas dessus"])],
    souffle: ['souffle', 4, 2, sign(HX(P.lebecYellow), HX(P.machineDark), ['SOUFFLETTE', 'pas sur les collègues !', 'le tuyau reste à l\'atelier'], HX(P.machineDark))],
    cafe: ['cafe', 2, 2, sign(HX(P.machineDark), HX(P.lebecYellow), ['CAFÉ', '0,20 €', 'Lebec : gratuit'])],
    cafePro: ['cafePro', 2, 1, sign(HX(P.red), HX(P.white), ['PRO'])],
    planning: ['planning', 4, 4, planning],
    pYaourt: ['pYaourt', 1, 2, postit(HX(P.lebecYellow), ['Yaourt de', 'M. LEBEC', 'PAS TOUCHE'])],
    pPelle: ['pPelle', 1, 2, postit(HX(P.pink), ['Rendre la', 'pelle à', 'Lebec !!'])],
    pPanne: ['pPanne', 1, 2, postit(HX(P.lebecYellow), ['EN PANNE', '(encore)'])],
    pMdp: ['pMdp', 1, 2, postit(HX(P.mint), ['mot de passe :', 'lebec123'])],
    pPoly: ['pPoly', 1, 2, postit(HX(P.orange), ['RTFP :', 'relire le', 'poly'])],
    pFuite: ['pFuite', 2, 2, postit(HX(P.lebecYellow), ['FUITE : NE PAS', 'RÉPARER', '(c\'est gratuit)'])],
    pelleTxt: ['pelleTxt', 3, 1, sign(HX(P.woodDark), HX(P.white), ['LA PELLE', '(prêtée à M. Lebec)'])],
    tableau: ['tableau', 4, 4, tableau],
    chef: ['chef', 2, 1, sign(HX(P.lebecYellow), HX(P.machineDark), ['LE CHEF'], HX(P.machineDark))],
    marbre: ['marbre', 4, 2, sign(HX(P.white), HX(P.machineDark), ['MARBRE : RIEN DESSUS', '(sauf les pièces)'], HX(P.machineDark))],
    etabli: ['etabli', 4, 2, sign(HX(P.wood), HX(P.white), ['« MARBRE »', '(un établi bien plat)'], HX(P.woodDark))],
    casques: ['casques', 3, 2, sign(HX(P.lebecYellow), HX(P.machineDark), ['CASQUE OBLIGATOIRE', '(même pour Lebec)'], HX(P.machineDark))],
    pigeon: ['pigeon', 2, 2, sign(HX(P.white), HX(P.red), ['INTERDIT', 'AUX PIGEONS', '(on t\'a vu)'], HX(P.red))],
    fumeur: ['fumeur', 2, 2, sign(HX(P.slate), HX(P.white), ['COIN FUMEUR', 'Lebec arrête', 'lundi.'])],
    quai: ['quai', 4, 1, sign(HX(P.orange), HX(P.white), ['QUAI GROS COLIS →'])],
    benne: ['benne', 4, 2, sign(HX(P.white), HX(P.forest), ['COPEAUX UNIQUEMENT', '(pas la pelle)'], HX(P.forest))],
    huile: ['huile', 2, 2, sign(HX(P.white), HX(P.orange), ['HUILE', 'DE COUPE'], HX(P.orange))],
    plante: ['plante', 2, 2, sign(HX(P.white), HX(P.grassDark), ['Arrosée', 'en 2019'], HX(P.grassDark))],
    vest: ['vest', 1, 1, sign(HX(P.white), HX(P.machineDark), ['LEBEC'], false)],
    vest2: ['vest2', 1, 1, sign(HX(P.white), HX(P.machineDark), ['MARIUS'], false)],
    vest3: ['vest3', 1, 1, sign(HX(P.white), HX(P.machineDark), ['AMAURY'], false)],
    vest4: ['vest4', 1, 1, sign(HX(P.white), HX(P.machineDark), ['? ? ?'], false)],
    lebec40: ['lebec40', 1, 1, sign(HX(P.lebecBlue), HX(P.lebecYellow), ['L-40'], false)],
    mug: ['mug', 1, 1, sign(HX(P.white), HX(P.red), ['MEILLEUR', 'CHEF'], false)],
    bienvenue: ['bienvenue', 6, 1, sign(HX(P.machineDark), HX(P.mint), ['LEBEC INDUSTRIES · bienvenue dans le futur'], HX(P.mint))],
    clean: ['clean', 3, 2, sign(HX(P.white), HX(P.shutterBlue), ['SALLE PROPRE', 'chaussons obligatoires', '(Lebec aussi)'], HX(P.shutterBlue))],
    douche: ['douche', 2, 2, sign(HX(P.white), HX(P.lebecBlue), ['DOUCHE', 'hors service', 'depuis 2011'], HX(P.lebecBlue))],
    room_be: ['room_be', 4, 1, sign(HX(P.lebecBlue), HX(P.white), ["BUREAU D'ÉTUDES"])],
    room_stock: ['room_stock', 4, 1, sign(HX(P.orange), HX(P.white), ['MAGASIN'])],
    room_pause: ['room_pause', 4, 1, sign(HX(P.mint), HX(P.machineDark), ['SALLE DE PAUSE'], HX(P.machineDark))],
    room_vest: ['room_vest', 4, 1, sign(HX(P.slate), HX(P.white), ['VESTIAIRES'])],
    room_metro: ['room_metro', 4, 1, sign(HX(P.white), HX(P.shutterBlue), ['MÉTROLOGIE'], HX(P.shutterBlue))],
    room_quai: ['room_quai', 4, 1, sign(HX(P.orange), HX(P.white), ['QUAI COUVERT'])],
    mat: m => ['mat_' + m, 2, 2, sign(ST.hex(ML.MATERIALS[m].color), HX(P.machineDark), [ML.MATERIALS[m].label], HX(P.machineDark))],
    tool: t => ['tool_' + t, 2, 1, sign(ST.hex(ML.TOOLS[t].color), HX(P.machineDark), [ML.TOOLS[t].label.toUpperCase() + 'S'], HX(P.machineDark))]
  };
  /** stk('poly', w, h, x, y, z, ry, opt) */
  const stk = (k, w, h, x, y, z, ry, opt) => { const s = typeof k === 'string' ? STK[k] : k; return sticker(s[0], s[1], s[2], s[3], w, h, x, y, z, ry, opt); };

  /* =====================================================================
     CUISSON (bake) : fusionne un groupe en très peu de maillages.
     - matériaux toon unis (sans texture, opaques, non émissifs) → UN maillage
       à couleurs par sommet (un 2e pour ceux décalés en profondeur : marquages) ;
     - les autres matériaux → un maillage par matériau (comme ML.Style.merge) ;
     - sprites, lumières, InstancedMesh, userData.keep : conservés tels quels.
     Renvoie le nouveau groupe (remplace l'ancien dans son parent).
     ===================================================================== */
  const vcMat = off => { const m = ST.toon(P.white, 0, { vertexColors: true, key: off ? 'atelierVCsol' + off : 'atelierVC' }); return off ? offMat(m, off) : m; };
  function bake(group) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map(), keep = [];
    const special = o => o.userData.keep || o.isSprite || o.isLight || o.isInstancedMesh || o.isSkinnedMesh || (o.isMesh && Array.isArray(o.material));
    const walk = o => {
      for (const c of o.children.slice()) {
        if (special(c)) { keep.push(c); continue; }
        if (c.isMesh) {
          const m = c.material;
          let key = m, col = null;
          if (m.isMeshToonMaterial && !m.map && !m.emissiveMap && !m.transparent && !m.vertexColors && m.emissive.getHex() === 0 && m.alphaTest === 0) { key = m.polygonOffset ? 'vc' + (-m.polygonOffsetFactor) : 'vc'; col = m.color; }
          let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push({ g, col, cast: c.castShadow });
        }
        walk(c);
      }
    };
    walk(group);
    const out = new THREE.Group(); out.position.copy(group.position); out.rotation.copy(group.rotation); out.scale.copy(group.scale);
    buckets.forEach((list, key) => {
      let n = 0; list.forEach(l => (n += l.g.attributes.position.count));
      const isVC = typeof key === 'string', anyVC = isVC || (key.vertexColors);
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = anyVC ? new Float32Array(n * 3) : null; let o3 = 0, o2 = 0;
      for (const { g, col: c } of list) {
        const cnt = g.attributes.position.count;
        pos.set(g.attributes.position.array, o3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o2);
        if (col) { if (c) for (let i = 0; i < cnt; i++) { col[o3 + i * 3] = c.r; col[o3 + i * 3 + 1] = c.g; col[o3 + i * 3 + 2] = c.b; } else if (g.attributes.color) col.set(g.attributes.color.array, o3); else col.fill(1, o3, o3 + cnt * 3); }
        o3 += cnt * 3; o2 += cnt * 2; g.dispose();
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const mat = isVC ? vcMat(key === 'vc' ? 0 : +key.slice(2)) : key;
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = list.some(l => l.cast); mesh.receiveShadow = true; out.add(mesh);
    });
    for (const o of keep) { const wm = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); o.parent && o.parent.remove(o); wm.decompose(o.position, o.quaternion, o.scale); out.add(o); }
    if (group.parent) { const p = group.parent; p.remove(group); p.add(out); }
    return out;
  }
  /** Toute la géométrie d'un groupe en UNE géométrie (fantôme de placement) */
  function flatGeo(group) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), list = [];
    group.traverse(c => { if (c.isMesh && !c.isInstancedMesh) { const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)); list.push(g); } });
    let n = 0; list.forEach(g => (n += g.attributes.position.count));
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const g of list) { pos.set(g.attributes.position.array, o); if (g.attributes.normal) nor.set(g.attributes.normal.array, o); o += g.attributes.position.count * 3; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.computeBoundingSphere();
    return geo;
  }

  /* =====================================================================
     PIÈCE DE MOBILIER placée : repère local (face avant vers +z, lz = 0 contre
     le mur), posé en (x, z) et tourné de rot quarts de tour.
     ===================================================================== */
  const COS = [1, 0, -1, 0], SIN = [0, 1, 0, -1];
  /** local → monde pour une rotation en quarts de tour */
  const rotPt = (x, z, rot, lx, lz) => { const r = ((rot % 4) + 4) % 4; return { x: x + lx * COS[r] + lz * SIN[r], z: z - lx * SIN[r] + lz * COS[r] }; };
  function piece(x, z, rot, parent) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot * Q; (parent || stat).add(g);
    const p = { g, x, z, rot };
    p.w = (lx, lz) => rotPt(x, z, rot, lx, lz);
    p.col = (lx, lz, w, d, tag) => { const a = p.w(lx - w / 2, lz - d / 2), b = p.w(lx + w / 2, lz + d / 2); return U.addCollider(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z), tag); };
    p.tgt = (id, lx, y, lz, r) => { const q = p.w(lx, lz); const t = { id, x: q.x, y, z: q.z, r }; W.targets.push(t); return t; };
    p.label = (text, lx, y, lz, opt) => { const l = U.label(text, opt); const q = p.w(lx, lz); l.position.set(q.x, y, q.z); add(l); return l; };
    p.yaw = rot * Q;
    return p;
  }
  /** emplacement contre un mur : 'L' gauche (rot 1), 'R' droit (rot 3), 'B' fond (rot 0), 'F' façade (rot 2) */
  function onWall(wall, at, B) {
    if (wall === 'L') return [B.minX + 0.2, at, 1];
    if (wall === 'R') return [B.maxX - 0.2, at, 3];
    if (wall === 'B') return [at, B.minZ + 0.2, 0];
    return [at, B.maxZ - 0.2, 2];
  }

  /* ---------- petits objets réutilisables ---------- */
  function pallet(x, y, z, ry, parent) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; (parent || stat).add(g);
    for (let i = 0; i < 5; i++) bx(1.2, 0.03, 0.14, P.wood, 0, 0.135, -0.33 + i * 0.165, g, 0.01);
    for (const dz of [-0.33, 0, 0.33]) bx(1.2, 0.09, 0.12, P.woodDark, 0, 0.075, dz, g, 0.01);
    for (let i = 0; i < 3; i++) bx(1.2, 0.03, 0.12, P.wood, 0, 0.015, -0.33 + i * 0.33, g, 0.01);
    return g;
  }
  function drum(x, z, col, lying, parent) {
    const g = new THREE.Group(); g.position.set(x, lying ? 0.3 : 0, z); if (lying) g.rotation.set(Math.PI / 2, 0, 0.4); (parent || stat).add(g);
    cy(0.3, 0.3, 0.9, col, 0, lying ? 0 : 0.45, 0, g, 12);
    for (const y of [0.25, 0.65]) cy(0.31, 0.31, 0.04, P.steelDark, 0, (lying ? -0.45 : 0) + y, 0, g, 12);
    cy(0.27, 0.27, 0.02, P.steelDark, 0, lying ? 0.455 : 0.905, 0, g, 12);
    return g;
  }
  function plant(x, z, sad, parent) {
    const g = new THREE.Group(); g.position.set(x, 0, z); (parent || stat).add(g);
    cy(0.32, 0.22, 0.55, P.tile, 0, 0.275, 0, g, 8); cy(0.29, 0.29, 0.04, P.dirt, 0, 0.53, 0, g, 8);
    if (sad) {
      const s = cy(0.025, 0.03, 0.7, P.trunk, 0.05, 0.85, 0, g, 5); s.rotation.z = -0.35;
      const l1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), M(P.dirt)); l1.scale.set(1.4, 0.35, 0.7); l1.position.set(0.25, 0.95, 0.05); l1.rotation.z = -0.9; g.add(l1);
      const l2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), M(P.grassDark)); l2.scale.set(1.4, 0.35, 0.7); l2.position.set(0.3, 1.12, 0); l2.rotation.z = -0.6; g.add(l2);
    } else {
      [[0, 1.05, 0, 0.5], [0.25, 0.85, 0.1, 0.35], [-0.22, 0.9, -0.12, 0.38], [0.05, 1.45, 0.05, 0.32]].forEach(([a, b, c, r], i) => {
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M(i % 2 ? P.forestLight : P.forest)); l.position.set(a, b, c); l.rotation.set(i, i * 2, 0); g.add(l);
      });
    }
    return g;
  }
  function drill(x, y, z, len, r, parent, up) {
    const g = new THREE.Group(); g.position.set(x, y, z); if (!up) g.rotation.x = Math.PI; (parent || stat).add(g);
    const col = ML.TOOLS.foret.color;
    cy(r * 0.95, r * 0.95, len * 0.4, P.steel, 0, len * 0.2, 0, g, 8);
    cy(r, r, len * 0.5, col, 0, len * 0.65, 0, g, 6);
    for (let k = 0; k < 3; k++) { const f = bx(r * 2.15, len * 0.06, r * 0.5, P.steelDark, 0, len * (0.48 + k * 0.15), 0, g, 0.002); f.rotation.y = k * 1.1; }
    cy(0, r, len * 0.12, col, 0, len * 0.96, 0, g, 6);
    return g;
  }
  function endmill(x, y, z, len, r, parent) {
    const g = new THREE.Group(); g.position.set(x, y, z); (parent || stat).add(g);
    cy(r * 0.9, r * 0.9, len * 0.5, P.steel, 0, len * 0.25, 0, g, 8);
    cy(r, r, len * 0.5, ML.TOOLS.fraise.color, 0, len * 0.75, 0, g, 6);
    for (let k = 0; k < 2; k++) { const f = bx(r * 2.1, len * 0.08, r * 0.45, P.machineDark, 0, len * (0.62 + k * 0.2), 0, g, 0.002); f.rotation.y = k * 1.4; }
    return g;
  }
  function insert(x, y, z, s, parent) { const p = bx(s, s * 0.25, s, ML.TOOLS.plaquette.color, x, y, z, parent, 0.005); p.rotation.y = Math.PI / 4; p.scale.z = 0.6; return p; }
  function blower(x, y, z, parent, ry) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; (parent || stat).add(g);
    bx(0.07, 0.18, 0.09, P.lebecYellow, 0, 0.09, 0, g, 0.02); bx(0.07, 0.07, 0.16, P.lebecYellow, 0, 0.19, 0.05, g, 0.02);
    const n = cy(0.015, 0.015, 0.28, P.steel, 0, 0.19, 0.25, g, 6); n.rotation.x = Math.PI / 2;
    return g;
  }
  function shovel(x, y, z, scale, rx, rz, parent) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx || 0, 0, rz || 0); g.scale.setScalar(scale || 1); (parent || stat).add(g);
    cy(0.03, 0.03, 1.1, P.wood, 0, 0.75, 0, g, 6); bx(0.22, 0.05, 0.05, P.woodDark, 0, 1.33, 0, g, 0.01);
    bx(0.04, 0.14, 0.04, P.woodDark, -0.1, 1.27, 0, g, 0.01); bx(0.04, 0.14, 0.04, P.woodDark, 0.1, 1.27, 0, g, 0.01);
    bx(0.3, 0.36, 0.035, P.steel, 0, 0.12, 0, g, 0.03); cy(0.04, 0.03, 0.12, P.steelDark, 0, 0.32, 0, g, 6);
    return g;
  }
  /** carton (avec scotch) */
  function carton(x, y, z, w, h, d, ry, parent) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; (parent || stat).add(g);
    bx(w, h, d, P.dirt, 0, h / 2, 0, g, 0.02); bx(w + 0.01, 0.012, 0.08, P.plasterWarm, 0, h + 0.002, 0, g, 0.003);
    return g;
  }
  /** rallonge électrique orange qui traîne au sol (points x,z) */
  function cord(pts, parent) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const s = bx(L + 0.04, 0.03, 0.035, P.orange, (a[0] + b[0]) / 2, 0.05, (a[1] + b[1]) / 2, parent, 0.01); s.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const puff = (r, x, y, z, parent, c) => { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), M(c)); p.position.set(x, y, z); parent.add(p); return p; };
  const knob = (r, c, x, y, z, parent) => { const k = cy(r, r, 0.04, c, x, y, z, parent, 10); k.rotation.x = Math.PI / 2; return k; };

  /* =====================================================================
     DONNÉES DES NIVEAUX : hauteur des murs, porte, et place du mobilier.
     Mur : 'L' gauche, 'R' droit, 'B' fond, 'F' façade ; at = abscisse le long
     du mur (z pour L/R, x pour B/F). free = [x, z, rot] posé librement.
     rec / exp = rectangles [minX, maxX, minZ, maxZ] des zones au sol.
     ===================================================================== */
  const LV = [
    { // 0 — Le Hangar Pourri (18 × 12, x −9..9, z 2..14)
      H: 4.2, door: 4, doorH: 3.2, style: 'rouille',
      racks: { wall: 'L', at: [5.4, 7.4, 9.4], len: 1.8 }, board: { wall: 'B', at: 6.4, w: 3.4 }, cabinet: { wall: 'R', at: 6.0, w: 3.0 },
      panel: { wall: 'R', at: 8.4 }, marbre: { wall: 'R', at: 9.9 }, pc: { wall: 'F', at: 6.0 }, printer: { wall: 'F', at: 7.9 },
      casques: { wall: 'F', at: -2.9 }, ext2: { wall: 'F', at: -4.3 }, coffee: { wall: 'L', at: 12.4 }, lockers: null,
      rec: [-7.6, -3.6, 9.4, 12.6], exp: [2.2, 7.6, 9.4, 12.4], aisle: 8,
      spawn: [[-1, 10.4], [1, 10.4], [-1, 8.8], [1, 8.8], [0, 11.8], [2.2, 11.8]], lebec: [-0.5, 6.6],
      patrol: [[-4, 7.6], [4.6, 8.4], [0, 6], [-1.5, 10.6], [5.4, 5.4], [-5.6, 8.8]], idle: [[-5.6, 7.4], [4.6, 6.4], [0.6, 9.2]],
      coffeePts: [[-7.6, 12.0], [-7.0, 12.9], [-7.4, 11.2]], tp: [3.6, 8.2]
    },
    { // 1 — L'Atelier Rafistolé (24 × 16, x −12..12, z −2..14)
      H: 5, door: 6, doorH: 3.6, style: 'rafistole',
      racks: { wall: 'B', at: [-10.2, -7.4, -4.6], len: 2.6 }, board: { wall: 'L', at: 5.6, w: 5.0 }, cabinet: { wall: 'B', at: 5.0, w: 4.4 }, whiteboard: { wall: 'B', at: 9.6 },
      panel: { wall: 'R', at: 1.6 }, pc: { wall: 'R', at: 4.6 }, printer: { wall: 'R', at: 6.4 }, marbre: { wall: 'R', at: 8.7 },
      casques: { wall: 'F', at: -4.1 }, ext2: { wall: 'R', at: 10.4 }, coffee: { wall: 'L', at: 12.4 }, lockers: { wall: 'F', at: 9.4 },
      rec: [-10.4, -4.8, 9.2, 12.6], exp: [4.4, 9.8, 9.2, 12.4], aisle: 6.5,
      spawn: [[-1.2, 10], [1.2, 10], [-1.2, 8.4], [1.2, 8.4], [0, 11.6], [2.4, 11.6]], lebec: [0, 5],
      patrol: [[-7, 5], [6, 3.6], [0, 6.6], [-8, 8], [7, 8], [0, 1.5]], idle: [[-8.5, 4.5], [8, 7.6], [8, 1.5]],
      coffeePts: [[-10.6, 12.0], [-10.0, 12.9], [-10.4, 11.2]], tp: [3.6, 8.0]
    },
    { // 2 — L'Atelier Propre (32 × 20, x −16..16, z −6..14)
      H: 6, door: 10, doorH: 4.4, style: 'propre',
      racks: { wall: 'B', at: [-14, -10.8, -7.6], len: 2.6 }, board: { wall: 'L', at: 3.0, w: 6 }, cabinet: { wall: 'B', at: 4.8, w: 4.4 }, whiteboard: { wall: 'B', at: -4.2 },
      chef: { free: [11, -3.0, 0] }, printer: { free: [14, -3.0, 0] }, photo: { wall: 'B', at: 11 },
      panel: { wall: 'R', at: 1.4 }, pc: { wall: 'R', at: 5.2 }, marbre: { wall: 'R', at: 8.6 },
      casques: { wall: 'F', at: -6.2 }, ext2: { wall: 'R', at: -0.6 }, coffee: { wall: 'L', at: 12.4 }, lockers: { wall: 'F', at: 13.2 },
      rec: [-13.2, -7.2, 8.6, 12.6], exp: [7, 12.8, 8.6, 12.4], aisle: 1.6,
      spawn: [[-1.5, 9.6], [1.5, 9.6], [-1.5, 7.8], [1.5, 7.8], [0, 11.2], [3, 11.2]], lebec: [4, 0],
      patrol: [[-10, 1.6], [-4, 0.5], [4, 0.8], [10, 3], [0, 6.5], [-9, 7], [8, 6.5]], idle: [[-11, 4], [9, 4.5], [0, -2]],
      coffeePts: [[-14.6, 12.0], [-14.0, 12.9], [-14.4, 11.2]], tp: [3.5, 7.5]
    },
    { // 3 — L'Atelier Pro (40 × 28 : le look V4)
      H: 7, door: 10, doorH: 4.4, style: 'pro', crane: true,
      racks: { wall: 'B', at: [-16, -12, -8], len: 2.6 }, board: { wall: 'L', at: 4.8, w: 6 }, cabinet: { wall: 'B', at: 4.0, w: 4.4 }, whiteboard: { wall: 'B', at: -3.6 },
      chef: { free: [12, -8.6, 0] }, printer: { free: [15, -8.6, 0] }, photo: { wall: 'B', at: 12 },
      panel: { wall: 'R', at: -3 }, pc: { wall: 'R', at: 6.5 }, marbre: { free: [12, 1.8, 0] },
      casques: { wall: 'F', at: -7 }, ext2: { wall: 'R', at: -9.5 }, coffee: { wall: 'L', at: 12.4 }, lockers: { wall: 'F', at: 16.7 },
      rec: [-16, -9, 8, 12.6], exp: [8.4, 14.6, 8.4, 12.3], aisle: -1.2,
      spawn: [[-1.5, 9], [1.5, 9], [-1.5, 7], [1.5, 7], [0, 10.5], [3, 10.5]], lebec: [8, -1],
      patrol: [[8, -1], [0, -1.2], [-8, -1.2], [-16, -1], [12, -5], [14, 5], [0, 6]], idle: [[-16, -3], [16, 1], [0, -3]],
      coffeePts: [[-18.3, 11.6], [-17.4, 12.8], [-17.6, 10.6]], tp: [2, 10]
    },
    { // 4 — L'Usine de Fou (52 × 34, x −26..26, z −20..14)
      H: 9, door: 12, doorH: 5.2, style: 'usine', crane: true, robot: true, mezz: true,
      racks: { wall: 'B', at: [-22, -18.6, -15.2], len: 3.0 }, board: { wall: 'L', at: 2.0, w: 6 }, cabinet: { wall: 'B', at: 6.0, w: 4.4 }, whiteboard: { wall: 'B', at: -9.5 },
      printer: { free: [15, -17.6, 0] },
      panel: { wall: 'R', at: -4 }, pc: { wall: 'R', at: 2.0 }, marbre: { wall: 'R', at: 6.0 },
      casques: { wall: 'F', at: -7.6 }, ext2: { wall: 'R', at: -7.2 }, coffee: { wall: 'L', at: 12.4 }, lockers: { wall: 'F', at: 20 },
      rec: [-18, -10, 8.4, 12.8], exp: [10, 18, 8.4, 12.6], aisle: 0,
      spawn: [[-1.5, 9], [1.5, 9], [-1.5, 7], [1.5, 7], [0, 10.5], [3, 10.5]], lebec: [8, -6],
      patrol: [[-16, 0], [-6, -1], [6, -1], [16, -1], [0, 6], [-12, -8], [10, -9], [18, 4]], idle: [[-18, 4], [18, -2], [0, -10]],
      coffeePts: [[-24.6, 12.0], [-24.0, 12.9], [-24.4, 11.2]], tp: [3, 8.5]
    }
  ];
  W.LEVELS = LV;
  /** Niveau / pièces en vigueur (classique : niveau 3 + be/stock/pause) */
  function current() {
    let A = ML.ATELIER;
    if (!A || A.lvl === undefined) A = { career: false, lvl: 3, rooms: { be: 1, stock: 1, pause: 1 } };
    // outil de test : #lvl=2&rooms=be,stock (atelier du MENU seulement)
    const h = /[#&]lvl=(\d)(?:&rooms=([a-z,]*))?/.exec(location.hash || '');
    if (h && !(ML.Game && ML.Game.on)) { const r = {}; (h[2] || '').split(',').filter(Boolean).forEach(k => (r[k] = 1)); A = { career: true, lvl: +h[1], rooms: r }; }
    const lvl = Math.max(0, Math.min(4, A.lvl | 0));
    const box = A.box || (ML.Career && ML.Career.box ? ML.Career.box(lvl) : { minX: -20, maxX: 20, minZ: -14, maxZ: 14 });
    return { career: !!A.career, lvl, rooms: A.rooms || {}, box: { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: 14 } };
  }
  /** Rectangles des pièces annexes (porte : position le long du mur commun) */
  function roomRects(lvl, B, rooms) {
    const X0 = B.minX, X1 = B.maxX, Z0 = B.minZ, out = {};
    const fz1 = lvl >= 4 ? 12 : 14, fz0 = fz1 - 9;                       // pièces avant (reculées au niv. 4 : route de la corniche)
    if (rooms.be) out.be = { x0: X1, x1: X1 + (lvl >= 4 ? 7 : 8), z0: fz0, z1: fz1, side: 'R', door: fz1 - 1.8, dw: 1.8 };
    if (rooms.pause) out.pause = { x0: X0 - 8, x1: X0, z0: fz0, z1: fz1, side: 'L', door: fz1 - 1.8, dw: 1.8 };
    if (rooms.vestiaire) { const z0 = Z0 + 7 <= fz0 ? Z0 : fz0 - 7; out.vestiaire = { x0: X0 - 6, x1: X0, z0, z1: z0 + 7, side: 'L', door: Math.max(z0, Z0) + 1.2, dw: 1.8 }; }
    if (rooms.metrologie) { const z0 = Z0 + 8 <= fz0 ? Z0 : fz0 - 8; out.metrologie = { x0: X1, x1: X1 + 7, z0, z1: z0 + 8, side: 'R', door: Math.max(z0, Z0) + 1.2, dw: 1.8 }; }
    if (rooms.stock) out.stock = { x0: -8, x1: 8, z0: Z0 - 8, z1: Z0, side: 'B', door: lvl === 0 ? 1.5 : 0, dw: lvl >= 4 ? 4 : 3 };
    if (rooms.quai) out.quai = { x0: 16, x1: 30, z0: 14.6, z1: 24.6, side: 'Y' };
    return out;
  }
  W.inAtelier = p => {
    const A = W._at; if (!A) return U.inWorkshop(p);
    const B = A.box; if (p.x > B.minX && p.x < B.maxX && p.z > B.minZ && p.z < B.maxZ) return true;
    for (const k in A.R) { const r = A.R[k]; if (r.side !== 'Y' && p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) return true; }
    return false;
  };
  /** Points de passage proposés pour un PNJ (allée centrale + portes des pièces). Renvoie [{x,z}…]. */
  W.route = (n, x, z) => {
    const A = W._at; if (!A) return [{ x, z }];
    const B = A.box, aZ = A.aisle, pts = [];
    const roomOf = p => { for (const k in A.R) { const r = A.R[k]; if (r.side !== 'Y' && p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) return r; } return null; };
    const inHall = p => p.x > B.minX && p.x < B.maxX && p.z > B.minZ && p.z < B.maxZ;
    const doorPts = r => r.side === 'L' ? [{ x: r.x1 - 1, z: r.door }, { x: r.x1 + 1, z: r.door }] : r.side === 'R' ? [{ x: r.x0 + 1, z: r.door }, { x: r.x0 - 1, z: r.door }] : [{ x: r.door, z: r.z1 - 1 }, { x: r.door, z: r.z1 + 1 }];
    const from = { x: n.x, z: n.z }, to = { x, z }, rf = roomOf(from), rt = roomOf(to);
    if (rf && rf === rt) return [to];
    let cur = from;
    if (rf) { const d = doorPts(rf); pts.push(d[0], d[1]); cur = d[1]; }
    else if (!inHall(from)) { pts.push({ x: 0, z: 16 }, { x: 0, z: B.maxZ - 1.5 }); cur = pts[pts.length - 1]; }
    const target = rt ? doorPts(rt)[1] : inHall(to) ? to : { x: 0, z: B.maxZ - 1.5 };
    if (Math.abs(cur.z - aZ) > 2 && Math.abs(target.z - cur.z) > 1.2) pts.push({ x: cur.x, z: aZ });
    if (Math.abs(target.z - aZ) > 2 && (pts.length || Math.abs(target.x - cur.x) > 1.2)) pts.push({ x: target.x, z: aZ });
    pts.push(target);
    if (rt) pts.push(doorPts(rt)[0], to);
    else if (!inHall(to)) pts.push({ x: 0, z: 16 }, to);
    return pts;
  };
  W.atelierBounds = () => Object.assign({}, W._bounds || { minX: -19, maxX: 19, minZ: -13, maxZ: 8 });

  /* =====================================================================
     MURS par style (un tronçon = une boîte + décor ; collider si posé au sol)
     ===================================================================== */
  const glassMat = () => ST.toon(P.glass, P.glassDark, { transparent: true, opacity: 0.38, side: THREE.DoubleSide, key: 'vitrageUsine' });
  /** ax 'x' : mur le long de x en z = c, de a à b ; 'z' : le long de z en x = c */
  function seg(ax, c, a, b, y0, y1, style, t) {
    const L = b - a, mid = (a + b) / 2; if (L <= 0.01 || y1 - y0 <= 0.01) return;
    const X = ax === 'x' ? mid : c, Z = ax === 'x' ? c : mid;
    const box = (h, y, mat, ext, lenExt, unit) => ax === 'x' ? texBox(L + (lenExt || 0), h, t + (ext || 0), mat, X, y, Z, stat, unit) : texBox(t + (ext || 0), h, L + (lenExt || 0), mat, X, y, Z, stat, unit);
    const pbox = (w, h, along, y, col, ext) => ax === 'x' ? bx(w, h, t + ext, col, along, y, c, stat, 0.02) : bx(t + ext, h, w, col, c, y, along, stat, 0.02);
    if (y0 === 0) { if (ax === 'x') U.boxCollider(X, Z, L, t, 'wall'); else U.boxCollider(X, Z, t, L, 'wall'); }
    const H = y1 - y0;
    if (style === 'rouille') {
      // tôles de récup de teintes différentes (une par ~1,2 m), un peu de travers en hauteur
      const n = Math.max(1, Math.round(L / 1.2)), sw = L / n, tints = [P.dirt, P.orange, P.trunk, P.dirt, P.steelDark, P.orange];
      for (let i = 0; i < n; i++) {
        const al = a + sw * (i + 0.5), hh = H - (y0 === 0 ? rnd() * 0.35 : 0), mat = texM('tole', tints[Math.floor(rnd() * tints.length)]);
        if (ax === 'x') texBox(sw + 0.04, hh, t, mat, al, y0 + hh / 2, c, stat, 1.6); else texBox(t, hh, sw + 0.04, mat, c, y0 + hh / 2, al, stat, 1.6);
      }
      const jour = ST.toon(P.skyHorizon, P.skyHorizon);                                       // trous : on voit le jour à travers
      for (let i = 0; i < Math.floor(L / 2.2); i++) {                                       // rustines et trous
        const al = a + 0.6 + rnd() * (L - 1.2), y = y0 + 0.4 + rnd() * (H - 0.9), k = rnd();
        if (k < 0.4) pbox(0.7 + rnd() * 0.8, 0.5 + rnd() * 0.7, al, y, [P.orange, P.trunk, P.steel, P.shutterBlue][i % 4], 0.05);
        else if (k < 0.75) pbox(0.14 + rnd() * 0.3, 0.1 + rnd() * 0.25, al, y, jour, 0.06);
        else { pbox(0.9, 0.08, al, y, P.steelDark, 0.08); pbox(0.08, 0.9, al, y, P.steelDark, 0.08); }   // tôle clouée en croix
      }
      if (y0 === 0) for (const e of [a, b]) pbox(0.16, H + 0.15, e, H / 2, P.woodDark, 0.1);
    } else if (style === 'rafistole') {
      const hb = Math.min(H, 1.2);
      if (y0 < 1.2) box(hb - Math.max(0, y0), y0 + (hb - Math.max(0, y0)) / 2, texM('beton', P.granite), 0.02, 0, 0.8);
      const ys = Math.max(y0, 1.2); box(y1 - ys, (ys + y1) / 2, texM('tole', P.steel), 0, 0, 1.6);
      for (let i = 0; i < Math.floor(L / 2.5); i++) {
        const al = a + 0.8 + rnd() * (L - 1.6), y = ys + 0.5 + rnd() * Math.max(0.1, y1 - ys - 1.2);
        if (i % 3 === 2) pbox(1.4, 1.0, al, y, P.shutterBlue, 0.05);                        // bâche bleue
        else { const w = 1 + rnd(); if (ax === 'x') texBox(w, 0.9, t + 0.05, texM('bois', P.white), al, y, c, stat, 1.2); else texBox(t + 0.05, 0.9, w, texM('bois', P.white), c, y, al, stat, 1.2); }
      }
    } else if (style === 'verre') {                                                         // façade vitrée (usine)
      if (y0 === 0) { pbox(L, 0.6, mid, 0.3, P.machineDark, 0.04); }
      const g0 = Math.max(y0, 0.6), g1 = y1 - 1.0;
      if (g1 > g0) { if (ax === 'x') { const m = new THREE.Mesh(new THREE.BoxGeometry(L, g1 - g0, 0.08), glassMat()); m.position.set(X, (g0 + g1) / 2, Z); stat.add(m); } else { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, g1 - g0, L), glassMat()); m.position.set(X, (g0 + g1) / 2, Z); stat.add(m); }
        for (let k = 0; k <= Math.round(L / 2); k++) pbox(0.1, g1 - g0, a + k * L / Math.max(1, Math.round(L / 2)), (g0 + g1) / 2, P.white, 0.06);
        for (const y of [g0, (g0 + g1) / 2, g1]) pbox(L, 0.1, mid, y, P.white, 0.08); }
      pbox(L, Math.max(0.1, y1 - Math.max(g1, y0)), mid, (y1 + Math.max(g1, y0)) / 2, P.lebecBlue, 0.04);
    } else {                                                                                  // propre / pro / usine : bardage
      const usine = style === 'usine', base = usine ? 0.6 : 1.1;
      if (y0 < base) { pbox(L, base - y0, mid, (y0 + base) / 2, usine ? P.machineDark : P.lebecBlue, 0.06); if (!usine) pbox(L, 0.2, mid, base + 0.1, P.lebecYellow, 0.1); }
      const c0 = Math.max(y0, base + (usine ? 0 : 0.2)), c1 = y1 - (usine ? 1.4 : 0.6);
      if (c1 > c0) box(c1 - c0, (c0 + c1) / 2, texM('bardage', usine ? P.white : P.cladding), 0, 0, 1.4);
      pbox(L, y1 + 0.4 - Math.max(c1, y0), mid, (Math.max(c1, y0) + y1 + 0.4) / 2, P.lebecBlue, 0.12);
    }
  }
  /** rangée de murs avec ouvertures holes = [{a, b, h}] (h = hauteur de passage) */
  function wallRun(ax, c, a, b, h, holes, style, t) {
    t = t || 0.4; let s = a;
    for (const ho of (holes || []).slice().sort((p, q) => p.a - q.a)) {
      if (ho.a > s) seg(ax, c, s, ho.a, 0, h, style, t);
      seg(ax, c, ho.a, ho.b, ho.h, h, style, t); s = ho.b;
    }
    if (b > s) seg(ax, c, s, b, 0, h, style, t);
  }
  /** bandeau de fenêtres (verre « lumineux ») */
  function ribbon(ax, c, a, b, y) {
    const len = b - a, mid = (a + b) / 2, along = ax === 'x', cx = along ? mid : c, cz = along ? c : mid;
    const glass = ST.toon(P.glass, P.shutterBlue);
    bx(along ? len : 0.5, 1.1, along ? 0.5 : len, glass, cx, y, cz, stat, 0.02);
    for (const dy of [-0.6, 0.6]) bx(along ? len + 0.2 : 0.58, 0.1, along ? 0.58 : len + 0.2, P.white, cx, y + dy, cz, stat, 0.02);
    const n = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) { const k = -len / 2 + (len * i) / n; bx(along ? 0.1 : 0.56, 1.1, along ? 0.56 : 0.1, P.white, cx + (along ? k : 0), y, cz + (along ? 0 : k), stat, 0.01); }
  }
  /** plan au sol texturé (UV à l'échelle) */
  function texPlane(w, d, mat, x, z, y, unit) {
    const g = new THREE.PlaneGeometry(w, d), uv = g.attributes.uv; unit = unit || 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / unit, uv.getY(i) * d / unit);
    const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y || 0.03, z); m.receiveShadow = true; stat.add(m); return m;
  }
  /** néon suspendu (tube = W.neonMat, ou mat donné) */
  function neon(x, y, z, len, mat, ry) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; stat.add(g);
    bx(len + 0.2, 0.12, 0.42, P.steel, 0, 0.09, 0, g, 0.04); U.box(len, 0.08, 0.3, mat || W.neonMat, 0, 0, 0, g, false);
    for (const dx of [-len / 2.4, len / 2.4]) bx(0.02, 0.7, 0.02, P.steelDark, dx, 0.5, 0, g, 0.005);
    return g;
  }

  /* =====================================================================
     BÂTIMENT : sol, murs (avec portes des pièces), toit, charpente, lumières,
     façade. Puis la cour.
     ===================================================================== */
  function shell(A) {
    const L = A.L, B = A.box, R = A.R, lvl = A.lvl, X0 = B.minX, X1 = B.maxX, Z0 = B.minZ, ZF = 14, H = L.H, w = X1 - X0, d = ZF - Z0, cz = (Z0 + ZF) / 2;
    const st = L.style;
    ML.mapRects.push({ x: (X0 + X1) / 2, z: cz, w, d, c: '#a2a8ad', name: 'ATELIER' });
    // --- sol ---
    // sol (décalé en profondeur : passe devant le bitume de la cour qui déborde jusqu'en z = 13)
    const fk = [['beton', P.dirt], ['beton', P.granite], ['sol', P.white], ['sol', P.white], [null, P.cladding]][lvl];
    const floorMat = offMat(ST.toon(fk[1], 0, fk[0] ? { map: T.tex(fk[0], 1, 1), key: 'solAtelier_' + lvl } : { key: 'solAtelierEpoxy' }), 5);
    texPlane(w, d, floorMat, (X0 + X1) / 2, cz, 0.03, lvl === 3 ? 4 : 5);
    // --- murs (portes des pièces) ---
    const holes = { L: [], R: [], B: [] };
    for (const k in R) { const r = R[k]; if (r.side === 'Y') continue; holes[r.side].push({ a: r.door - r.dw / 2, b: r.door + r.dw / 2, h: 2.5 }); }
    wallRun('x', Z0, X0 - 0.2, X1 + 0.2, H, holes.B, st);
    wallRun('z', X0, Z0, ZF, H, holes.L, st); wallRun('z', X1, Z0, ZF, H, holes.R, st);
    wallRun('x', ZF, X0 - 0.2, X1 + 0.2, H, [{ a: -L.door / 2, b: L.door / 2, h: L.doorH }], lvl >= 4 ? 'verre' : st);
    // cadres des portes intérieures (rayés jaune / noir)
    for (const k in R) {
      const r = R[k]; if (r.side === 'Y') continue;
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
        const al = r.door + s * (r.dw / 2 + 0.08), y = 0.25 + i * 0.5, col = i % 2 ? P.black : P.lebecYellow;
        if (r.side === 'B') bx(0.16, 0.5, 0.5, col, al, y, Z0, stat, 0.02); else bx(0.5, 0.5, 0.16, col, r.side === 'L' ? X0 : X1, y, al, stat, 0.02);
      }
    }
    // fenêtres en bandeau (niveaux 2 et 3)
    if (lvl === 2 || lvl === 3) {
      const y = H - 2.15;
      ribbon('x', Z0, X0 + 2.5, X1 - 2.5, y); ribbon('z', X0, Z0 + 2.5, ZF - 2.5, y); ribbon('z', X1, Z0 + 2.5, ZF - 2.5, y);
      ribbon('x', ZF, X0 + 2, -L.door / 2 - 2.5, y); ribbon('x', ZF, L.door / 2 + 2.5, X1 - 2, y);
    }
    // poteaux extérieurs (bardage)
    if (lvl >= 2) {
      for (let x = X0; x <= X1 + 0.01; x += 5) for (const z of [Z0 - 0.28, ZF + 0.28]) if (Math.abs(x) > L.door / 2 + 1) bx(0.3, H + 0.4, 0.18, P.steelDark, x, H / 2, z, stat, 0.04);
      for (let z = Z0; z <= ZF + 0.01; z += 7) for (const x of [X0 - 0.28, X1 + 0.28]) if (!holeAt(holes, x < 0 ? 'L' : 'R', z)) bx(0.18, H + 0.4, 0.3, P.steelDark, x, H / 2, z, stat, 0.04);
    }
    // --- toit ---
    roof(A);
    // --- charpente ---
    if (lvl <= 1) {
      for (let x = X0 + 3; x < X1 - 1; x += 3) bx(0.18, 0.28, d, lvl ? P.steelDark : P.woodDark, x, H - 0.2, cz, stat, 0.03);
      if (lvl === 0) for (const z of [Z0 + 4, Z0 + 8]) { const b = bx(w, 0.2, 0.16, P.woodDark, 0, H - 0.45, z, stat, 0.03); b.rotation.z = 0.02; }
    } else {
      const step = lvl === 4 ? 6.8 : 6;
      for (let z = Z0 + 3.5; z < ZF - 2; z += step) {
        if (lvl < 4) for (const sx of [-1, 1]) { const x = sx > 0 ? X1 - 0.35 : X0 + 0.35; if (holeAt(holes, sx < 0 ? 'L' : 'R', z)) continue; bx(0.3, H - 0.1, 0.34, P.lebecBlue, x, (H - 0.1) / 2, z, stat, 0.04); for (let i = 0; i < 4; i++) bx(0.34, 0.25, 0.38, i % 2 ? P.black : P.lebecYellow, x, 0.125 + i * 0.25, z, stat, 0.02); }
        bx(w - 0.4, 0.4, 0.22, lvl === 4 ? P.white : P.lebecBlue, 0, H - 0.25, z, stat, 0.04);
        if (lvl === 4) { stk('ledM', w - 1, 0.06, 0, H - 0.46, z, 0, { glow: true, tilt: -Math.PI / 2 }); for (let x = X0 + 2; x < X1 - 1; x += 4) { const dgl = bx(0.08, 0.08, 1.6, P.white, x, H - 0.9, z, stat, 0.01); dgl.rotation.x = 0.6; } }
      }
      // chemin de câbles au-dessus de l'allée
      const yC = H - 1.4, zc = L.aisle + 0.3;
      bx(w - 1, 0.06, 0.5, P.steel, 0, yC, zc, stat, 0.01);
      bx(w - 1.2, 0.06, 0.1, P.lebecYellow, 0, yC + 0.06, zc - 0.1, stat, 0.02); bx(w - 1.2, 0.06, 0.1, P.black, 0, yC + 0.06, zc + 0.05, stat, 0.02);
      for (let x = X0 + 2; x <= X1 - 2; x += 6) bx(0.03, H - yC, 0.03, P.steelDark, x, (H + yC) / 2, zc, stat, 0.005);
    }
    // --- éclairage (néons : W.neonMat partagé, éteint par W.setPower) ---
    const neons = [];
    if (lvl === 0) { neon(0.4, H - 0.6, Z0 + 6, 1.4, W._flickMat, 0.15); const b = cy(0.12, 0.12, 0.2, ST.toon(P.lebecYellow, P.orange), -4, H - 0.9, Z0 + 3.2, stat, 8); cy(0.01, 0.01, 0.8, P.black, -4, H - 0.4, Z0 + 3.2, stat, 4); b.userData.keep = false; }
    else if (lvl === 1) { neons.push([-5, 2], [5, 2], [-5, 9]); neon(5, H - 0.5, 9, 2.6, W._flickMat); }
    else if (lvl === 2) { for (const x of [-10, -3.5, 3.5, 10]) for (const z of [-2, 4, 10]) neons.push([x, z]); }
    else if (lvl === 3) { for (let x = -14; x <= 14; x += 7) for (const z of [-8, 0, 8]) neons.push([x, z]); }
    else for (const x of [-18, -9, 0, 9, 18]) for (const z of [-14, -6, 2, 10]) neons.push([x, z, 4]);
    for (const [x, z, l] of neons) neon(x, H - (lvl === 4 ? 1.2 : 0.75), z, l || 2.6);
    W.inLights = [new THREE.PointLight(0xfff4e0, 0.35, Math.max(w, d) * 0.9), new THREE.PointLight(0xfff4e0, 0.25, Math.max(w, d) * 0.8)];
    W.inLights[0].position.set(X0 + w * 0.3, H - 1, cz); W.inLights[1].position.set(X0 + w * 0.72, H - 1, cz); W.inLights.forEach(add);
    // --- façade et porte ---
    facade(A);
  }
  const holeAt = (holes, side, z) => holes[side].some(h => z > h.a - 0.4 && z < h.b + 0.4);

  /** toit selon le niveau */
  function roof(A) {
    const L = A.L, B = A.box, lvl = A.lvl, X0 = B.minX, X1 = B.maxX, Z0 = B.minZ, ZF = 14, H = L.H, w = X1 - X0, d = ZF - Z0, cx = (X0 + X1) / 2;
    if (lvl === 0) {
      // bâche bleue tenue par des cordes, avec un TROU au-dessus du seau
      const [hx, hz] = A.hole, hw = 1.0, hd = 0.8, y = H + 0.12, tm = ST.toon(P.shutterBlue);
      const part = (x0, x1, z0, z1, dy) => { if (x1 - x0 > 0.01 && z1 - z0 > 0.01) bx(x1 - x0, 0.05, z1 - z0, tm, (x0 + x1) / 2, y - (dy || 0), (z0 + z1) / 2, stat, 0.01); };
      const ex = 0.5;
      part(X0 - ex, hx - hw / 2, Z0 - ex, ZF + ex); part(hx + hw / 2, X1 + ex, Z0 - ex, ZF + ex);
      part(hx - hw / 2, hx + hw / 2, Z0 - ex, hz - hd / 2, 0.06); part(hx - hw / 2, hx + hw / 2, hz + hd / 2, ZF + ex, 0.06);
      bx(2.4, 0.05, 1.6, P.shutterBlue, cx - 3, y - 0.18, Z0 + 5, stat, 0.01);                 // poche d'eau (la bâche qui pend)
      for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), M(P.rock)); s.position.set(X0 + 2 + i * w / 4, y + 0.12, Z0 + 1 + (i % 2) * (d - 2)); stat.add(s); }   // cailloux qui tiennent la bâche
      for (const x of [X0 + 1, X1 - 1]) for (const z of [Z0 - 0.2, ZF + 0.2]) { const r = cy(0.012, 0.012, H * 0.7, P.plasterWarm, x, H * 0.62, z + (z > 0 ? 0.25 : -0.25), stat, 4); r.rotation.x = z > 0 ? -0.3 : 0.3; }
      { const flap = bx(1.2, 0.04, 0.9, P.shutterBlue, hx + 0.7, y - 0.3, hz, stat, 0.01); flap.rotation.z = 0.7; }      // bout de bâche déchiré
      // puits de lumière + gouttes
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.75, H, 8, 1, true), ST.toon(P.lebecYellow, P.lebecYellow, { transparent: true, opacity: 0.14, side: THREE.DoubleSide, key: 'puitsLumiere' }));
      shaft.material.depthWrite = false; shaft.position.set(hx, H / 2, hz); stat.add(shaft);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), ST.toon(P.water, P.waterDeep)); drop.scale.y = 1.6; drop.userData.keep = true; drop.position.set(hx, H, hz); add(drop); W._drip = { mesh: drop, x: hx, z: hz, y0: H, y1: 0.42, t: 0 };
      return;
    }
    if (lvl === 1) {
      texBox(w + 0.8, 0.12, d + 0.8, texM('tole', P.steel), cx, H + 0.1, (Z0 + ZF) / 2, stat, 1.6);
      bx(4, 0.04, 3, P.shutterBlue, X0 + 6, H + 0.18, Z0 + 5, stat, 0.01); bx(2.2, 0.04, 2, P.orange, X1 - 5, H + 0.18, ZF - 4, stat, 0.01);
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), M(P.rock)); s.position.set(X0 + 4 + (i * 5.3) % (w - 6), H + 0.25, Z0 + 2 + (i * 3.7) % (d - 3)); stat.add(s); }
      return;
    }
    // bac acier + lanterneaux (2 : 1 rangée, 3 : 2 rangées, 4 : 3 rangées en dents de scie)
    const roofM = texM('tole', P.slate), nS = lvl - 1, sk = [];
    for (let i = 0; i < nS; i++) sk.push(Z0 + d * (i + 1) / (nS + 1));
    let z = Z0 - 0.4;
    for (const s of sk.concat([ZF + 0.4 + 0.8])) { const z1 = Math.min(ZF + 0.4, s - 0.8); if (z1 > z) texBox(w + 0.8, 0.3, z1 - z, roofM, cx, H + 0.15, (z + z1) / 2, stat, 3); z = s + 0.8; }
    for (const s of sk) {
      if (lvl === 4) { const g = bx(w - 2, 0.12, 2.2, ST.toon(P.glass, P.glassDark), cx, H + 0.9, s, stat, 0.03); g.rotation.x = -0.75; bx(w - 2, 1.5, 0.15, P.white, cx, H + 0.75, s + 0.8, stat, 0.03); for (const sx of [-1, 1]) texBox(1, 0.3, 1.6, roofM, sx * (w / 2 - 0.1), H + 0.15, s, stat, 3); }
      else { for (const sx of [-1, 1]) texBox(5.4, 0.3, 1.6, roofM, cx + sx * (w / 2 - 2.3), H + 0.15, s, stat, 3); bx(w - 10, 0.3, 1.5, ST.toon(P.glass, P.glassDark), cx, H + 0.22, s, stat, 0.05); for (const dz of [-0.82, 0.82]) bx(w - 9.8, 0.4, 0.14, P.white, cx, H + 0.4, s + dz, stat, 0.03); }
    }
    for (const [x, z2] of [[X0 + w * 0.25, Z0 + 3], [X0 + w * 0.7, ZF - 3], [X0 + w * 0.85, Z0 + d * 0.4]]) { cy(0.32, 0.32, 0.7, P.steel, x, H + 0.65, z2, stat, 10); cy(0.48, 0.12, 0.3, P.steelDark, x, H + 1.1, z2, stat, 10); }
    bx(2.2, 1, 1.3, P.cladding, X0 + w * 0.2, H + 0.8, ZF - d * 0.4, stat, 0.1);
    bx(w + 1.2, 0.2, 0.24, P.steelDark, cx, H + 0.4, ZF + 0.42, stat, 0.04); bx(w + 1.2, 0.2, 0.24, P.steelDark, cx, H + 0.4, Z0 - 0.42, stat, 0.04);
    for (const x of [X0 - 0.45, X1 + 0.45]) for (const z2 of [Z0 - 0.45, ZF + 0.45]) cy(0.09, 0.09, H + 0.4, P.steelDark, x, (H + 0.4) / 2, z2, stat, 8);
  }

  /** façade : porte principale, enseigne, lampes, panneaux */
  function facade(A) {
    const L = A.L, B = A.box, lvl = A.lvl, X0 = B.minX, X1 = B.maxX, H = L.H, dw = L.door, dh = L.doorH, ZF = 14;
    if (lvl === 0) {
      // porte de grange coulissante rouillée (poussée à droite) + rail
      texBox(2.3, dh - 0.1, 0.08, texM('tole', P.orange), dw / 2 + 1.1, (dh - 0.1) / 2 + 0.05, ZF + 0.32, stat, 1.6);
      bx(0.1, dh - 0.2, 0.1, P.woodDark, dw / 2 + 0.05, dh / 2, ZF + 0.38, stat, 0.02); bx(2.2, 0.1, 0.1, P.woodDark, dw / 2 + 1.1, dh * 0.5, ZF + 0.38, stat, 0.02);
      bx(dw + 3.4, 0.1, 0.12, P.steelDark, 0.9, dh + 0.05, ZF + 0.32, stat, 0.02);
      stk('planche', 4.2, 1.3, -0.2, dh + 0.55, ZF + 0.3, 0, { roll: 0.07 });
      for (const x of [-1.6, 1.3]) cy(0.025, 0.025, 0.12, P.steelDark, x, dh + 0.58 + x * 0.06, ZF + 0.3, stat, 5).rotation.x = Math.PI / 2;
      stk('pigeon', 1.0, 0.5, -dw / 2 - 2.2, 1.9, ZF + 0.26, 0, { roll: -0.1 });
      shovel(-dw / 2 - 0.9, 0, ZF + 0.5, 1, -0.25, 0.1);
      bx(0.3, 0.2, 0.3, P.black, dw / 2 + 0.6, dh + 0.5, ZF + 0.35, stat, 0.04); cy(0.08, 0.08, 0.1, ST.toon(P.lebecYellow, P.lebecYellow), dw / 2 + 0.6, dh + 0.36, ZF + 0.42, stat, 8);
      return;
    }
    if (lvl === 1) {
      for (const s of [-1, 1]) texBox(dw / 2, dh - 0.1, 0.1, texM('bois', P.white), s * (dw / 2 + dw / 4 + 0.05), (dh - 0.1) / 2 + 0.05, ZF + 0.32, stat, 1.2);
      stk('planche2', 4.4, 1.2, 0, dh + 0.7, ZF + 0.26, 0);
      stk('logo', 1.4, 1.4, -dw / 2 - 3.6, 2.6, ZF + 0.26, 0); stk('pigeon', 1.2, 0.6, dw / 2 + 4.2, 2.2, ZF + 0.26, 0);
      for (const x of [-dw / 2 - 0.8, dw / 2 + 0.8]) { bx(0.4, 0.22, 0.45, P.black, x, dh + 0.2, ZF + 0.42, stat, 0.04); bx(0.32, 0.04, 0.34, ST.toon(P.lebecYellow, P.lebecYellow), x, dh + 0.08, ZF + 0.45, stat, 0.01); }
      return;
    }
    // porte sectionnelle (relevée), rayures, tambour
    for (const sx of [-1, 1]) {
      for (let i = 0; i < Math.floor(dh / 0.5); i++) bx(0.32, 0.5, 0.52, i % 2 ? P.black : P.lebecYellow, sx * (dw / 2 + 0.15), 0.25 + i * 0.5, ZF, stat, 0.02);
      bx(0.12, dh, 0.16, P.steelDark, sx * (dw / 2 - 0.06), dh / 2, ZF - 0.3, stat, 0.02);
    }
    const drumC = cy(0.42, 0.42, dw + 0.3, P.steel, 0, dh + 0.35, ZF - 0.55, stat, 14); drumC.rotation.z = Math.PI / 2;
    for (let k = 0; k < 3; k++) bx(dw - 0.1, 0.13, 0.06, lvl === 4 ? P.glass : P.cladding, 0, dh - 0.02 - k * 0.14, ZF - 0.25, stat, 0.02);
    for (let i = 0; i < Math.round(dw / 0.5); i++) flat(0.5, 0.5, i % 2 ? P.black : P.lebecYellow, -dw / 2 + 0.25 + i * 0.5, ZF, 0.075);
    if (lvl === 4) { stk('ledM', dw + 0.6, 0.12, 0, dh + 0.05, ZF + 0.3, 0, { glow: true }); for (const s of [-1, 1]) stk('ledM', 0.12, dh, s * (dw / 2 + 0.36), dh / 2, ZF + 0.3, 0, { glow: true }); stk('bienvenue', 7, 1.1, 0, dh + 0.9, ZF + 0.3, 0, { glow: true }); }
    if (lvl === 2) {
      bx(8.4, 1.3, 0.12, P.lebecBlue, 0, dh + 0.85, ZF + 0.3, stat, 0.05);
      if (!W._signTex) W._signTex = ST.signTex('MÉCANIQUE LEBEC', 'Usinage de précision · depuis 1987', '#24457a', '#ffc93c', 1024, 256);
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.2), ST.toon(P.white, 0, { map: W._signTex, key: 'enseigneLebec' })); sp.position.set(0, dh + 0.85, ZF + 0.37); stat.add(sp);
    } else {
      // grande enseigne sur le toit (+ pelle géante et foret géant)
      const sw = lvl === 4 ? 17 : 13, sh = lvl === 4 ? 2.8 : 2.2, y = H + 0.4 + sh / 2 + 0.6;
      for (const x of [-sw * 0.42, 0, sw * 0.42]) bx(0.16, 1.4, 0.16, P.steelDark, x, H + 0.9, ZF, stat, 0.03);
      bx(sw, sh, 0.2, P.lebecBlue, 0, y, ZF + 0.05, stat, 0.08);
      if (!W._signTex) W._signTex = ST.signTex('MÉCANIQUE LEBEC', 'Usinage de précision · depuis 1987', '#24457a', '#ffc93c', 1024, 256);
      const sm = lvl === 4 ? ST.toon(P.black, P.white, { key: 'enseigneLebecLum' }) : ST.toon(P.white, 0, { map: W._signTex, key: 'enseigneLebec' });
      if (lvl === 4 && sm.emissiveMap !== W._signTex) { sm.emissiveMap = W._signTex; sm.needsUpdate = true; }
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.3, sh - 0.2), sm); sp.position.set(0, y, ZF + 0.16); stat.add(sp);
      shovel(sw * 0.64, H + 0.3, ZF, lvl === 4 ? 3.6 : 2.6, 0, -0.35);
      { const g = new THREE.Group(); g.position.set(-sw * 0.65, H + 0.3, ZF); g.rotation.z = 0.35; stat.add(g); drill(0, lvl === 4 ? 3.9 : 2.9, 0, lvl === 4 ? 3.4 : 2.6, 0.17, g, false); }
    }
    stk('logo', 2.4, 2.4, X0 + w4(X0, dw), 3.3, ZF + 0.22, 0);
    stk('pigeon', 1.4, 0.7, dw / 2 + 7, 2.4, ZF + 0.22, 0);
    stk('quai', 2.4, 0.35, X1 - 3.5, 3.1, ZF + 0.22, 0);
    stk('fumeur', 1.0, 0.5, dw / 2 + 3.4, 1.9, ZF + 0.22, 0);
    for (const x of [-dw / 2 - 1.5, dw / 2 + 1.5, X0 + 2.5, X1 - 6.4]) { bx(0.4, 0.22, 0.45, P.black, x, 4.0, ZF + 0.42, stat, 0.04); bx(0.32, 0.04, 0.34, ST.toon(P.lebecYellow, P.lebecYellow), x, 3.88, ZF + 0.45, stat, 0.01); }
  }
  const w4 = (X0, dw) => Math.min(7.5, (-dw / 2 - X0) / 2);

  /* ---------- COUR (fixe : zone LIVRAISONS, quai gros colis, benne, parking) ---------- */
  function yard(A) {
    const dw = A.L.door;
    U.plane(18, 13, offMat(ST.toon(P.granite, 0, { map: T.tex('beton', 4, 3), key: 'quaiBeton' }), 4), 24, 21, 0.066, stat); flat(12, 3.5, P.orange, 24, 17.2, 0.072);
    for (let i = 0; i < 24; i++) for (const z of [15.35, 19.05]) flat(0.5, 0.2, i % 2 ? P.black : P.lebecYellow, 18.25 + i * 0.5, z, 0.076);
    stk('quaiSol', 6, 1.2, 24, 0.08, 17.2, 0, { floor: true });
    const l3 = U.label('QUAI GROS COLIS : palettes (fenwick → camion)', { size: 0.45, color: '#ffd9a8' }); l3.position.set(24, 3, 17.2); add(l3);
    for (let x = -dw / 2 + 1; x <= dw / 2 - 1; x += 1) flat(0.5, 2.2, P.mark, x, 15.6, 0.075);
    for (const x of [-5, 5, 12]) { for (const dx of [-1.5, 1.5]) flat(0.12, 5.4, P.mark, x + dx, 21, 0.075); flat(3.12, 0.12, P.mark, x, 23.7, 0.075); }
    stk('lebecSol', 2.6, 1.3, 5, 0.08, 21.6, 0, { floor: true }); stk('logo', 1.4, 1.4, 5, 0.08, 23.0, 0, { floor: true });
    cy(0.05, 0.05, 2.2, P.steelDark, 8.5, 1.1, 19, stat, 6); stk('reserve', 1.2, 0.6, 8.5, 2.0, 19.04, 0); bx(1.24, 0.64, 0.04, P.steelDark, 8.5, 2.0, 18.99, stat, 0.01);
    U.boxCollider(8.5, 19, 0.25, 0.25, 'panneau');
    const LZ = A.R.quai ? null : { x: 0, z: 26 };
    if (LZ) { for (const dx of [-1.5, 1.5]) flat(0.12, 5.4, P.markYellow, dx, 26, 0.075); for (const dz of [-2.7, 2.7]) flat(3.12, 0.12, P.markYellow, 0, 26 + dz, 0.075); stk('livrSol', 2.8, 0.7, 0, 0.08, 26, 0, { floor: true }); }
    for (const x of [-dw / 2 - 0.7, dw / 2 + 0.7]) { cy(0.13, 0.13, 1.0, P.lebecYellow, x, 0.5, 14.7, stat, 10); cy(0.135, 0.135, 0.12, P.black, x, 0.75, 14.7, stat, 10); U.boxCollider(x, 14.7, 0.3, 0.3, 'potelet'); }
    plant(-dw / 2 - 1.6, 14.75, A.lvl < 3); stk('plante', 0.42, 0.21, -dw / 2 - 1.6, 0.3, 15.08, 0);
    cy(0.04, 0.04, 0.95, P.steelDark, dw / 2 + 3.4, 0.48, 14.7, stat, 6); cy(0.16, 0.1, 0.16, P.steel, dw / 2 + 3.4, 1.0, 14.7, stat, 10);
    drum(-18.6, 15.0, P.lebecBlue); drum(-17.8, 15.25, P.red); drum(-18.3, 15.85, P.orange); drum(-17.4, 16.05, P.lebecBlue, true);
    stk('huile', 0.5, 0.25, -18.3, 0.55, 16.16, 0); U.boxCollider(-18.0, 15.5, 1.9, 1.6, 'futs');
    for (let i = 0; i < 4; i++) pallet(-23, i * 0.15, 15.8, (i % 2) * 0.08);
    for (let i = 0; i < 2; i++) pallet(-25, i * 0.15, 16.0, 0.1 - i * 0.12);
    U.boxCollider(-24, 15.9, 3.4, 1.2, 'palettes');
    // benne à copeaux
    { const s = new THREE.Group(); s.position.set(-13, 0, 19.5); stat.add(s);
      bx(3.6, 1.45, 2.2, P.forest, 0, 0.82, 0, s, 0.08);
      for (const sx of [-1, 1]) { const e = bx(0.5, 1.45, 2.2, P.forest, sx * 1.85, 0.85, 0, s, 0.08); e.rotation.z = sx * -0.3; }
      bx(4.3, 0.14, 2.4, P.pine, 0, 1.6, 0, s, 0.04); for (const sx of [-1, 1]) bx(0.12, 0.12, 2.5, P.pine, sx * 1.2, 1.0, 0, s, 0.03);
      const heap = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), M(P.steel)); heap.scale.set(1.7, 0.35, 0.95); heap.position.set(0, 1.55, 0); s.add(heap);
      for (let i = 0; i < 10; i++) { const c = bx(0.2, 0.05, 0.05, P.steelDark, -1.3 + i * 0.29, 1.78 + (i % 3) * 0.05, -0.5 + ((i * 37) % 10) / 10, s, 0.01); c.rotation.set(i, i * 2, i * 0.5); }
      stk('benne', 2.0, 0.5, 0, 0.9, 1.11, 0, { parent: s });
      U.boxCollider(-13, 19.5, 4, 2.2, 'benne'); W.targets.push({ id: 'benne', x: -13, y: 1.4, z: 19.5, r: 3.4 });
      const l = U.label('BENNE À COPEAUX', { size: 0.4, color: '#b6ffcb' }); l.position.set(-13, 2.5, 19.5); add(l); }
    Object.assign(ML.LOC, {
      carSpawn: [{ x: -5, z: 21, h: 0 }, { x: 5, z: 21, h: 0 }, { x: 12, z: 21, h: 0 }, { x: -12, z: 21, h: 0 }, { x: 0, z: 26, h: 0 }],
      bigZone: { minX: 18, maxX: 30, minZ: 15.5, maxZ: 19 },
      fenSpawn: { x: 22, z: 23, h: Math.PI }, camSpawn: { x: 28, z: 25, h: 0 },
      benne: { x: -13, z: 19.5 },
      livraison: A.R.quai ? { x: 22.5, z: 21.8 } : { x: 0, z: 26 }
    });
  }

  /* =====================================================================
     BARRES DE BRUT (racks) : une géométrie par matière (couleurs par sommet),
     rendues en InstancedMesh (count = barres visibles).
     ===================================================================== */
  const barGeo = {};
  function barGeometry(m) {
    if (barGeo[m]) return barGeo[m];
    const body = new THREE.Color(ML.MATERIALS[m].color), end = new THREE.Color({ acier: P.red, alu: P.lebecBlue, inox: P.mint }[m] || P.lebecYellow);
    const mk = h => (m === 'alu' ? new THREE.BoxGeometry(0.13, h, 0.13) : new THREE.CylinderGeometry(m === 'inox' ? 0.08 : 0.072, m === 'inox' ? 0.08 : 0.072, h, m === 'inox' ? 6 : 10));
    const pos = [], nor = [], col = [];
    for (const [h, y, c] of [[1.86, 0, body], [0.12, 0.99, end], [0.12, -0.99, end]]) {
      let g = mk(h); if (g.index) g = g.toNonIndexed(); g.translate(0, y, 0);
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
      for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.userData.shared = true;
    return (barGeo[m] = g);
  }

  /* =====================================================================
     MOBILIER (repère local : lz = 0 contre le mur, face vers +z)
     ===================================================================== */
  /** rack cantilever d'une matière. main = rack « officiel » (cible + étiquette) ; off = 1re barre montrée ici */
  function rackP(p, m, len, q, main, off) {
    const g = p.g, hw = len / 2 - 0.1, c0 = q === 0 ? P.woodDark : q >= 4 ? P.white : P.lebecBlue, arm = q === 0 ? P.wood : q >= 4 ? P.steel : P.orange;
    for (const dx of [-hw, hw]) {
      bx(0.16, 2.4, 0.16, c0, dx, 1.2, 0.4, g, 0.03); bx(0.24, 0.1, 0.9, c0, dx, 0.05, 0.7, g, 0.02);
      for (const y of [0.5, 1.2, 1.9]) { bx(0.1, 0.08, 0.8, arm, dx, y, 0.74, g, 0.02); bx(0.1, 0.14, 0.05, arm, dx, y + 0.08, 1.13, g, 0.01); }
    }
    bx(len - 0.04, 0.1, 0.12, c0, 0, 2.35, 0.4, g, 0.02);
    if (q === 0) { const b = bx(0.7, 0.05, 0.05, P.steelDark, hw * 0.5, 1.6, 0.42, g, 0.01); b.rotation.z = 0.7; bx(0.3, 0.2, 0.05, P.orange, -hw * 0.4, 1.0, 0.42, g, 0.01); }     // rafistolé
    if (q >= 4) stk('ledM', len - 0.2, 0.05, 0, 2.29, 0.47, 0, { parent: g, glow: true });
    bx(1.0, 0.5, 0.05, P.machineDark, 0, 2.7, 0.4, g, 0.02); stk(STK.mat(m), 0.92, 0.42, 0, 2.7, 0.43, 0, { parent: g });
    const inst = new THREE.InstancedMesh(barGeometry(m), ST.toon(P.white, 0, { vertexColors: true, key: 'barresVC' }), 9), o = new THREE.Object3D();
    for (let i = 0; i < 9; i++) { o.position.set(((i * 7) % 5 - 2) * 0.03, 0.6 + Math.floor(i / 3) * 0.7, 0.45 + (i % 3) * 0.25); o.rotation.set(0, 0, Math.PI / 2); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }
    inst.castShadow = inst.receiveShadow = true; inst.count = 0; g.add(inst);
    (W.rackBars[m] = W.rackBars[m] || []).push({ mesh: inst, off: off || 0, cap: 9 });
    p.col(0, 0.7, len, 0.9, 'rack');
    if (main) { p.tgt('rack:' + m, 0, 1.2, 1.3, 2.8); W.rackLabels[m] = p.label('', 0, 3.25, 1.0, { size: 0.36 }); }
  }
  /** armoire à outils (tiroirs plaquettes / fraises / forets) + étagère */
  function cabinetP(p, w, q) {
    const g = p.g, red = q === 0 ? P.shutterRed : P.red;
    p.col(0, 0.5, w, 0.8, 'cabinet');
    bx(w, 1.15, 0.8, red, 0, 0.695, 0.5, g, 0.06); bx(w + 0.1, 0.08, 0.86, q >= 4 ? P.white : P.black, 0, 1.31, 0.5, g, 0.03);
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) for (const z of [0.2, 0.8]) { const wh = cy(0.06, 0.06, 0.06, P.black, x, 0.07, z, g, 8); wh.rotation.x = Math.PI / 2; }
    W.drawerLabels = W.drawerLabels || {};
    const dx = w * 0.295, dwid = w * 0.277;
    [['plaquette', -dx], ['fraise', 0], ['foret', dx]].forEach(([t, x]) => {
      for (let r = 0; r < 3; r++) { const y = 0.3 + r * 0.22; bx(dwid, 0.18, 0.03, P.shutterRed, x, y, 0.91, g, 0.02); bx(0.5, 0.03, 0.05, P.steel, x, y + 0.04, 0.94, g, 0.01); }
      bx(dwid, 0.3, 0.04, ML.TOOLS[t].color, x, 1.04, 0.915, g, 0.02); stk(STK.tool(t), Math.min(0.8, dwid * 0.9), 0.2, x, 1.07, 0.94, 0, { parent: g });
      W.drawerLabels[t] = p.label('', x, 1.75, 1.0, { size: 0.22 });
      p.tgt('tool:' + t, x, 1.0, 1.1, 2.4);
    });
    // échantillons sur le dessus
    bx(0.55, 0.06, 0.32, P.machineDark, -dx, 1.38, 0.5, g, 0.02);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) insert(-dx - 0.15 + i * 0.15, 1.43, 0.43 + j * 0.14, 0.09, g);
    bx(0.6, 0.12, 0.26, P.wood, 0, 1.41, 0.5, g, 0.03);
    [[0.025, 0.18], [0.032, 0.22], [0.04, 0.27], [0.05, 0.32]].forEach(([r, h], i) => endmill(-0.2 + i * 0.13, 1.47, 0.5, h, r, g));
    bx(0.85, 0.14, 0.3, P.lebecBlue, dx, 1.42, 0.5, g, 0.03);
    for (let i = 0; i < 8; i++) drill(dx - 0.35 + i * 0.1, 1.49, 0.5, 0.12 + i * 0.03, 0.01 + i * 0.0035, g, true);
    if (q === 0) { stk('pPanne', 0.2, 0.2, dx * 0.5, 0.75, 0.925, 0, { parent: g, roll: 0.2 }); bx(0.4, 0.3, 0.02, P.steelDark, -dx * 0.6, 0.62, 0.93, g, 0.01); return; }
    // étagère murale au-dessus
    for (const y of [2.05, 2.7]) { bx(w - 0.2, 0.05, 0.36, P.wood, 0, y, 0.18, g, 0.015); for (const x of [-w / 2 + 0.3, 0, w / 2 - 0.3]) bx(0.05, 0.25, 0.3, P.steelDark, x, y - 0.14, 0.14, g, 0.01); }
    for (let i = 0; i < 9; i++) { const d2 = drill(-w / 2 + 0.5, 2.14, 0.06 + i * 0.03, 0.3 + i * 0.06, 0.008 + i * 0.002, g, true); d2.rotation.z = -Math.PI / 2; }
    for (let i = 0; i < 3; i++) bx(0.24, 0.09, 0.16, ML.TOOLS.plaquette.color, -0.6, 2.12 + i * 0.095, 0.2, g, 0.015);
    blower(-0.15, 2.075, 0.2, g, Math.PI / 2);
    cy(0.065, 0.065, 0.24, P.lebecBlue, 0.4, 2.195, 0.2, g, 10); stk('lebec40', 0.11, 0.055, 0.4, 2.2, 0.267, 0, { parent: g });
    bx(0.36, 0.24, 0.26, P.dirt, w / 2 - 0.55, 2.195, 0.18, g, 0.02);
    for (let i = 0; i < 6; i++) endmill(-w / 2 + 0.6 + i * 0.13, 2.785, 0.16, 0.14 + i * 0.02, 0.02 + i * 0.004, g);
    cy(0.06, 0.055, 0.13, P.white, -0.4, 2.79, 0.2, g, 10); stk('mug', 0.1, 0.05, -0.4, 2.8, 0.261, 0, { parent: g });
    cy(0.1, 0.1, 0.2, P.steelDark, 0.6, 2.825, 0.18, g, 10);
    for (let i = 0; i < 2; i++) bx(0.3, 0.12, 0.2, ML.TOOLS.plaquette.color, w / 2 - 0.6, 2.79 + i * 0.125, 0.2, g, 0.015);
    stk('rangez', Math.min(3.6, w - 0.6), 0.42, 0, 3.4, 0.02, 0, { parent: g });
  }
  /** tableau d'outillage (crochets : extincteur, clés, soufflettes) + compresseur + enrouleurs */
  function boardP(p, w, q) {
    const g = p.g, big = w >= 5;
    const ext = -w / 2 + 0.5, cle = big ? [w / 2 - 3.2, w / 2 - 2.4] : [ext + 0.75, ext + 1.35], sou = big ? [w / 2 - 1.5, w / 2 - 0.7] : [cle[1] + 0.7, cle[1] + 1.35];
    if (q === 0) texBox(w, 1.8, 0.05, texM('bois', P.white), 0, 1.5, 0.05, g, 1.2);
    else {
      bx(w, 2.2, 0.08, P.wood, 0, 1.6, 0.06, g, 0.02);
      bx(w + 0.1, 0.08, 0.12, P.woodDark, 0, 2.72, 0.08, g, 0.02); bx(w + 0.1, 0.08, 0.12, P.woodDark, 0, 0.48, 0.08, g, 0.02);
      for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) bx(0.08, 2.3, 0.12, P.woodDark, x, 1.6, 0.08, g, 0.02);
      const hole = new THREE.PlaneGeometry(0.035, 0.035), hm = M(P.woodDark);
      for (let r = 0; r < 9; r++) for (let c = 0; c < Math.floor((w - 0.8) / 0.21); c++) { const xx = -w / 2 + 0.4 + c * 0.21, yy = 0.7 + r * 0.24; if (Math.abs(xx - ext) < 0.5) continue; const h = new THREE.Mesh(hole, hm); h.position.set(xx, yy, 0.103); g.add(h); }
    }
    bx(sou[1] - cle[0] + 0.7, 0.08, 0.5, P.woodDark, (cle[0] + sou[1]) / 2, 0.88, 0.3, g, 0.02);       // tablette (objets à y = 0.95)
    stk('ext', 0.8, 0.4, ext, 1.95, 0.115, 0, { parent: g });
    if (big) { stk('pelle', 0.48, 1.2, ext + 0.95, 1.85, 0.115, 0, { parent: g }); stk('pelleTxt', 0.75, 0.25, ext + 0.95, 1.05, 0.115, 0, { parent: g }); }
    for (const x of cle) { stk('cle', 0.4, 0.6, x, 1.45, 0.115, 0, { parent: g }); const pg = cy(0.02, 0.02, 0.18, P.steel, x, 1.2, 0.2, g, 6); pg.rotation.x = Math.PI / 2; }
    for (const x of sou) { stk('souff', 0.45, 0.45, x, 1.4, 0.115, 0, { parent: g }); const pg = cy(0.02, 0.02, 0.18, P.steel, x, 1.2, 0.2, g, 6); pg.rotation.x = Math.PI / 2; }
    stk('souffle', 1.2, 0.3, (sou[0] + sou[1]) / 2, 2.45, 0.115, 0, { parent: g });
    if (big) { const h = cy(0.025, 0.025, 0.45, P.wood, ext + 1.6, 2.35, 0.18, g, 6); h.rotation.z = Math.PI / 2; [P.red, P.lebecYellow, P.lebecBlue].forEach((c, i) => cy(0.03, 0.03, 0.14, c, ext + 2.1 + i * 0.14, 2.42, 0.18, g, 6)); }
    p.label('Extincteurs · clés · soufflettes', 0, 3.0, 0.7, { size: 0.26 });
    // compresseur (à gauche du tableau)
    const cxp = -w / 2 - 1.0;
    p.col(cxp, 0.5, 1.6, 0.9, 'compresseur');
    if (q === 0) { const t2 = cy(0.25, 0.25, 0.8, P.red, cxp, 0.35, 0.45, g, 12); t2.rotation.z = Math.PI / 2; for (const s of [-1, 1]) { const wh = cy(0.12, 0.12, 0.06, P.black, cxp + s * 0.3, 0.12, 0.75, g, 10); wh.rotation.x = Math.PI / 2; } bx(0.3, 0.3, 0.3, P.lebecYellow, cxp, 0.72, 0.45, g, 0.04); }
    else {
      const t2 = cy(0.36, 0.36, 1.4, P.red, cxp, 0.5, 0.5, g, 14); t2.rotation.z = Math.PI / 2;
      for (const x of [cxp - 0.55, cxp + 0.55]) { const r2 = cy(0.37, 0.37, 0.04, P.steelDark, x, 0.5, 0.5, g, 14); r2.rotation.z = Math.PI / 2; bx(0.1, 0.16, 0.6, P.black, x, 0.08, 0.5, g, 0.02); }
      bx(0.55, 0.36, 0.5, P.lebecBlue, cxp - 0.25, 1.02, 0.5, g, 0.06); bx(0.5, 0.4, 0.12, P.lebecYellow, cxp - 0.25, 1.0, 0.77, g, 0.04);
      const gauge = cy(0.09, 0.09, 0.04, P.white, cxp + 0.35, 1.08, 0.68, g, 12); gauge.rotation.x = Math.PI / 2;
      stk('compr', 0.6, 0.2, cxp, 0.5, 0.87, 0, { parent: g });
    }
    // réseau d'air : compresseur → haut du mur → enrouleurs
    cy(0.04, 0.04, 2.6, P.shutterBlue, cxp + 0.5, 2.35, 0.4, g, 6);
    { const len = sou[1] - cxp; const pz = cy(0.04, 0.04, len, P.shutterBlue, (cxp + sou[1]) / 2 + 0.25, 3.65, 0.4, g, 6); pz.rotation.z = Math.PI / 2; }
    const hooks = { ext: p.w(ext, 0.6), cle: cle.map(x => p.w(x, 0.6)), sou: sou.map(x => p.w(x, 0.6)) };
    for (const x of sou) {
      cy(0.035, 0.035, 0.2, P.shutterBlue, x, 3.55, 0.4, g, 6);
      bx(0.14, 0.8, 0.06, P.steelDark, x, 3.15, 0.07, g, 0.02);
      const ax = cy(0.04, 0.04, 0.42, P.steelDark, x, 3.15, 0.28, g, 8); ax.rotation.x = Math.PI / 2;
      for (const z of [0.16, 0.42]) { const d2 = cy(0.33, 0.33, 0.035, P.lebecYellow, x, 3.15, z, g, 14); d2.rotation.x = Math.PI / 2; }
      const coil = cy(0.25, 0.25, 0.22, P.red, x, 3.15, 0.29, g, 14); coil.rotation.x = Math.PI / 2;
      cy(0.05, 0.05, 0.06, P.black, x, 2.79, 0.38, g, 8);
      const r = p.w(x, 0.38); W.hoseReels.push({ x: r.x, y: 2.76, z: r.z });
      const h = hoseMesh(); add(h); W._hoses.push(h);
    }
    return hooks;
  }
  /** extincteur mural n° 2 */
  function extP(p) { stk('ext', 0.8, 0.4, 0, 1.95, 0.03, 0, { parent: p.g }); flat(0.9, 0.9, P.red, 0, 0.55, 0.042, p.g); return p.w(0, 0.6); }
  /** coin café (sans salle de pause) */
  function coffeeP(p, q) {
    const g = p.g, pro = !!W.up.cafe_pro;
    p.col(0, 0.45, 0.8, 0.7, 'coffee');
    if (q === 0) {
      carton(0, 0, 0.45, 0.8, 0.8, 0.6, 0, g); bx(0.32, 0.4, 0.3, P.black, -0.1, 1.0, 0.45, g, 0.04);
      cy(0.1, 0.1, 0.16, ST.toon(P.glass, P.glassDark), -0.1, 0.9, 0.62, g, 10); cy(0.05, 0.045, 0.1, P.white, 0.25, 0.85, 0.55, g, 8);
      stk('cafe', 0.4, 0.2, 0, 1.6, 0.03, 0, { parent: g, roll: 0.1 });
    } else {
      bx(0.8, 1.8, 0.7, pro ? P.steel : P.trunk, 0, 0.9, 0.45, g, 0.08);
      bx(0.38, 0.4, 0.05, P.black, 0, 0.75, 0.82, g, 0.02); cy(0.05, 0.04, 0.1, P.white, 0, 0.62, 0.72, g, 8);
      stk('cafe', 0.5, 0.25, 0, 1.35, 0.81, 0, { parent: g, glow: true });
      for (let i = 0; i < 3; i++) knob(0.035, [P.red, P.mint, P.lebecYellow][i], -0.15 + i * 0.15, 1.08, 0.81, g);
      if (pro) stk('cafePro', 0.4, 0.1, 0, 1.68, 0.81, 0, { parent: g });
    }
    bx(1.6, 1.0, 0.04, P.dirt, 1.5, 2.0, 0.03, g, 0.02); stk('planning', 0.9, 0.45, 1.3, 2.1, 0.06, 0, { parent: g }); stk('pPelle', 0.22, 0.22, 2.0, 2.25, 0.06, 0, { parent: g, roll: -0.15 });
    cy(0.2, 0.17, 0.5, P.mint, -0.9, 0.25, 0.35, g, 10);
    p.tgt('coffee', 0, 1.2, 0.5, 2.4);
    p.label(pro ? '☕ Café PRO (sprint 90 s)' : '☕ Café (sprint +)', 0, 2.3, 0.9, { size: 0.3 });
  }
  /** bureau avec PC : 'pc' (Arexis) et/ou 'be' (PC de gestion) */
  function pcP(p, q, ids, title) {
    const g = p.g, w = q === 0 ? 2.0 : 1.8;
    p.col(0, 0.45, w, 0.9, 'pc');
    if (q === 0) {
      bx(w, 0.05, 0.9, P.plasterWarm, 0, 0.74, 0.45, g, 0.02);                                     // table pliante
      for (const s of [-1, 1]) { const a = bx(0.04, 0.85, 0.04, P.steelDark, s * (w / 2 - 0.2), 0.37, 0.45, g, 0.01); a.rotation.x = 0.5; const b = bx(0.04, 0.85, 0.04, P.steelDark, s * (w / 2 - 0.2), 0.37, 0.45, g, 0.01); b.rotation.x = -0.5; }
      bx(0.62, 0.52, 0.55, P.plasterWarm, 0.1, 1.03, 0.35, g, 0.06); bx(0.5, 0.36, 0.3, P.plasterWarm, 0.1, 1.05, 0.08, g, 0.05);   // écran cathodique beige
      stk('beige', 0.46, 0.36, 0.1, 1.06, 0.63, 0, { parent: g, glow: true });
      bx(0.25, 0.5, 0.5, P.plasterWarm, -0.65, 1.02, 0.35, g, 0.03); cy(0.02, 0.02, 0.06, P.mint, -0.65, 1.1, 0.61, g, 6).rotation.x = Math.PI / 2;   // tour
      bx(0.5, 0.03, 0.18, P.plasterWarm, 0.1, 0.78, 0.75, g, 0.01);
      // chaise de camping
      const ch = new THREE.Group(); ch.position.set(0.3, 0, 1.25); ch.rotation.y = 0.3; g.add(ch);
      for (const s of [-1, 1]) { const l = bx(0.03, 0.75, 0.03, P.steelDark, s * 0.25, 0.37, 0, ch, 0.005); l.rotation.x = 0.4; const l2 = bx(0.03, 0.75, 0.03, P.steelDark, s * 0.25, 0.37, 0, ch, 0.005); l2.rotation.x = -0.4; }
      bx(0.55, 0.05, 0.42, P.forest, 0, 0.48, 0, ch, 0.01); const back = bx(0.55, 0.5, 0.04, P.forest, 0, 0.75, 0.25, ch, 0.01); back.rotation.x = -0.2;
      cy(0.04, 0.035, 0.12, P.red, 0.8, 0.83, 0.6, g, 8);                                            // canette
    } else {
      bx(w, 0.06, 0.9, P.wood, 0, 0.77, 0.45, g, 0.02);
      for (const dx of [-w / 2 + 0.08, w / 2 - 0.08]) for (const dz of [0.07, 0.83]) bx(0.06, 0.74, 0.06, P.steelDark, dx, 0.37, dz, g, 0.01);
      bx(0.86, 0.55, 0.08, P.black, 0, 1.15, 0.1, g, 0.03); bx(0.1, 0.3, 0.06, P.black, 0, 0.9, 0.05, g, 0.01);
      stk('arexis', 0.78, 0.44, 0, 1.16, 0.145, 0, { parent: g, glow: true });
      stk('pMdp', 0.16, 0.16, 0.3, 1.32, 0.15, 0, { parent: g, roll: 0.15 });
      bx(0.55, 0.025, 0.22, P.slateDark, 0, 0.815, 0.65, g, 0.008); bx(0.06, 0.03, 0.1, P.slateDark, 0.45, 0.815, 0.6, g, 0.01);
      bx(0.22, 0.5, 0.5, P.black, -0.5, 0.3, 0.3, g, 0.03);
    }
    for (const id of ids) p.tgt(id, 0, 1.1, 1.3, 2.4);
    p.label(title, 0, 1.9, 0.6, { size: 0.26 });
  }
  /** imprimante (PANNE évidemment) */
  function printerP(p, q) {
    const g = p.g;
    p.col(0, 0.45, 0.8, 0.7, 'printer');
    if (q === 0) { carton(0, 0, 0.45, 0.7, 0.6, 0.6, 0.1, g); bx(0.5, 0.2, 0.4, P.plasterWarm, 0, 0.72, 0.45, g, 0.04); bx(0.3, 0.008, 0.25, P.white, 0, 0.83, 0.5, g, 0.002); }
    else {
      bx(0.8, 0.8, 0.7, P.steelDark, 0, 0.4, 0.45, g, 0.04);
      bx(0.72, 0.36, 0.62, P.white, 0, 0.98, 0.45, g, 0.06); bx(0.5, 0.03, 0.25, P.granite, 0, 1.0, 0.85, g, 0.01);
      const sh = bx(0.3, 0.008, 0.38, P.white, 0, 1.03, 0.83, g, 0.002); sh.rotation.x = 0.15;
      bx(0.14, 0.06, 0.01, P.mint, -0.2, 1.1, 0.765, g, 0.003);
      for (const [x, z] of [[0.6, 1.25], [-0.5, 1.45]]) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), M(P.white)); c.position.set(x, 0.07, z); g.add(c); }
    }
    stk('pPanne', 0.18, 0.18, 0.24, q === 0 ? 0.6 : 1.1, q === 0 ? 0.76 : 0.765, 0, { parent: g, roll: 0.12 });
    p.tgt('printer', 0, 1, 0.95, 2.4);
  }
  /** marbre de contrôle (granite) — ou établi bien plat aux petits niveaux */
  function marbreP(p, q) {
    const g = p.g;
    if (q <= 1) {
      p.col(0, 0.5, 2.0, 0.9, 'marbre');
      bx(2.0, 0.1, 0.9, P.wood, 0, 0.86, 0.5, g, 0.02);
      for (const dx of [-0.88, 0.88]) for (const dz of [0.12, 0.88]) bx(0.1, 0.82, 0.1, P.woodDark, dx, 0.41, dz, g, 0.02);
      bx(1.8, 0.05, 0.7, P.woodDark, 0, 0.25, 0.5, g, 0.01);
      bx(0.3, 0.2, 0.25, P.lebecBlue, -0.7, 1.0, 0.65, g, 0.03); bx(0.4, 0.05, 0.1, P.steel, -0.7, 0.95, 0.8, g, 0.01);   // étau
      bx(0.25, 0.06, 0.2, P.steel, 0.4, 0.94, 0.45, g, 0.02); cy(0.025, 0.025, 0.5, P.steel, 0.4, 1.2, 0.45, g, 8);       // trusquin bricolé
      bx(1.0, 0.25, 0.02, P.wood, 0, 0.7, 0.96, g, 0.005); stk('etabli', 0.96, 0.24, 0, 0.7, 0.975, 0, { parent: g });
      if (q === 0) { bx(0.15, 0.04, 0.6, P.wood, 0.88, 0.02, 0.88, g, 0.005); }                    // cale sous le pied
      p.tgt('marbre', 0, 1, 1.3, 2.6);
      p.label('« MARBRE » : contrôle des caisses', 0, 1.9, 0.5, { size: 0.28 });
      return;
    }
    p.col(0, 0.7, 2.2, 1.4, 'marbre');
    for (const dx of [-0.95, 0.95]) for (const dz of [0.15, 1.25]) bx(0.12, 0.65, 0.12, P.steelDark, dx, 0.33, dz, g, 0.02);
    bx(2.0, 0.08, 0.08, P.steelDark, 0, 0.25, 1.25, g, 0.01); bx(2.0, 0.08, 0.08, P.steelDark, 0, 0.25, 0.15, g, 0.01);
    bx(2.2, 0.26, 1.4, P.slateDark, 0, 0.77, 0.7, g, 0.04);
    { const fl = new THREE.PlaneGeometry(0.03, 0.03), fm = M(P.granite); for (let i = 0; i < 40; i++) { const f = new THREE.Mesh(fl, fm); f.rotation.x = -Math.PI / 2; f.position.set(-1 + ((i * 53) % 100) / 50, 0.902, 0.1 + ((i * 29) % 60) / 50); g.add(f); } }
    bx(0.25, 0.06, 0.2, P.steel, -0.6, 0.93, 0.4, g, 0.02); cy(0.025, 0.025, 0.55, P.steel, -0.6, 1.22, 0.4, g, 8); bx(0.1, 0.06, 0.08, P.steelDark, -0.6, 1.2, 0.45, g, 0.01);
    bx(0.12, 0.1, 0.12, P.black, 0.5, 0.95, 0.3, g, 0.02); cy(0.015, 0.015, 0.3, P.steel, 0.5, 1.13, 0.3, g, 6); knob(0.07, P.white, 0.5, 1.28, 0.36, g);
    bx(0.4, 0.06, 0.25, P.wood, 0.6, 0.93, 1.1, g, 0.01); for (let i = 0; i < 5; i++) bx(0.04, 0.03 + i * 0.01, 0.06, P.steel, 0.45 + i * 0.07, 0.97 + i * 0.005, 1.1, g, 0.005);
    { const tg = new THREE.Group(); tg.position.set(-0.4, 1.0, 1.2); tg.rotation.x = -0.25; g.add(tg); bx(0.7, 0.18, 0.02, P.white, 0, 0, 0, tg, 0.005); stk('marbre', 0.66, 0.165, 0, 0, 0.012, 0, { parent: tg }); }
    p.tgt('marbre', 0, 1, 1.6, 2.6);
    p.label('MARBRE : contrôle des caisses', 0, 1.9, 0.7, { size: 0.3 });
  }
  /** tableau électrique (W.panelLight = voyant) */
  function panelP(p, q) {
    const g = p.g;
    bx(1.0, 1.6, 0.3, q === 0 ? P.steelDark : P.granite, 0, 1.5, 0.05, g, 0.05); bx(0.9, 1.48, 0.03, q === 0 ? P.dirt : P.steel, 0, 1.5, 0.215, g, 0.01);
    bx(0.05, 0.2, 0.04, P.black, -0.38, 1.5, 0.245, g, 0.01);
    stk('danger', 0.36, 0.27, 0.05, 1.85, 0.24, 0, { parent: g });
    { const lever = bx(0.06, 0.32, 0.06, P.red, -0.65, 1.2, 0.26, g, 0.02); lever.rotation.z = 0.4; bx(0.12, 0.12, 0.1, P.black, -0.62, 1.12, 0.22, g, 0.02); }
    if (q === 0) { for (let i = 0; i < 4; i++) { const wi = cy(0.015, 0.015, 1.2, [P.red, P.lebecBlue, P.black, P.lebecYellow][i], -0.3 + i * 0.18, 0.55, 0.28, g, 4); wi.rotation.z = (i - 1.5) * 0.15; } bx(0.5, 0.12, 0.01, P.steel, 0.1, 1.2, 0.235, g, 0.005); stk('scotch', 0.3, 0.15, 0.2, 1.0, 0.24, 0, { parent: g, roll: -0.1 }); }
    W.panelLight = U.box(0.15, 0.15, 0.05, U.mat(P.mint, P.mint), 0, 2.08, 0.24, g, false); W.panelLight.userData.keep = true;
    flat(1.7, 1.5, P.markYellow, 0, 0.85, 0.042, g); stk('hatch', 1.5, 1.3, 0, 0.044, 0.85, 0, { parent: g, floor: true });
    p.label('⚡ Tableau électrique', 0, 2.9, 0.4, { size: 0.26 });
    p.tgt('panel', 0, 1.6, 0.25, 2.6);
  }
  /** caisse à casques */
  function casquesP(p) {
    const g = p.g;
    p.col(0, 0.5, 1, 0.6, 'casques');
    bx(1, 0.5, 0.6, P.lebecYellow, 0, 0.25, 0.5, g, 0.06); bx(1.04, 0.06, 0.64, P.machineDark, 0, 0.5, 0.5, g, 0.02);
    [[P.lebecYellow, -0.3], [P.white, 0], [P.orange, 0.3]].forEach(([c, x], i) => {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(c)); h.position.set(x, 0.53 + (i % 2) * 0.02, 0.45 + (i - 1) * 0.06); g.add(h);
      cy(0.19, 0.19, 0.02, c, x, 0.535 + (i % 2) * 0.02, 0.45 + (i - 1) * 0.06, g, 12);
    });
    stk('casques', 0.84, 0.28, 0, 0.26, 0.805, 0, { parent: g });
    p.label('Casques', 0, 1.1, 0.5, { size: 0.24 });
    p.tgt('casques', 0, 0.6, 1.1, 2.4);
  }
  /** rangée de casiers (dont un cabossé) */
  function lockersP(p, n, q) {
    const g = p.g, keys = ['vest', 'vest2', 'vest3', 'vest4', 'vest4', 'vest2', 'vest3', 'vest'];
    p.col(0, 0.45, n * 0.75, 0.55, 'casiers');
    for (let i = 0; i < n; i++) {
      const x = -(n - 1) * 0.375 + i * 0.75, col = q >= 4 ? P.white : P.shutterBlue;
      bx(0.72, 1.9, 0.5, col, x, 0.95, 0.45, g, 0.03);
      const door = bx(0.66, 1.8, 0.03, i === 3 ? P.slate : col, x, 0.95, 0.71, g, 0.02);
      if (i === 3) { door.rotation.set(-0.04, 0.12, 0.03); bx(0.25, 0.2, 0.02, P.slateDark, x + 0.05, 1.05, 0.74, g, 0.01); }
      for (let s = 0; s < 3; s++) bx(0.4, 0.02, 0.01, P.slateDark, x, 1.65 + s * 0.06, 0.73, g, 0.003);
      stk(keys[i % keys.length], 0.3, 0.15, x, 1.4, 0.737, 0, { parent: g });
      bx(0.04, 0.12, 0.03, P.steel, x + 0.24, 0.95, 0.74, g, 0.01);
    }
  }
  function whiteboardP(p) { const g = p.g; bx(2.4, 1.3, 0.05, P.white, 0, 2.1, 0.05, g, 0.03); bx(2.5, 0.06, 0.12, P.steelDark, 0, 1.42, 0.1, g, 0.01); stk('tableau', 2.2, 1.1, 0, 2.1, 0.08, 0, { parent: g }); stk('pPoly', 0.22, 0.22, 1.4, 2.4, 0.03, 0, { parent: g, roll: 0.1 }); }
  function photoP(p) { stk('employe', 2.0, 1.0, 0, 3.6, 0.04, 0, { parent: p.g }); bx(2.12, 1.12, 0.04, P.woodDark, 0, 3.6, 0.02, p.g, 0.02); }
  /** bureau du chef (posé librement, chef assis côté −z) */
  function chefP(p) {
    const g = p.g;
    p.col(0, 0, 2.4, 1.2, 'desk');
    bx(2.4, 0.08, 1.2, P.wood, 0, 0.78, 0, g, 0.03); bx(0.6, 0.72, 1.1, P.woodDark, -0.85, 0.37, 0, g, 0.03);
    bx(0.06, 0.72, 1.1, P.woodDark, 1.15, 0.37, 0, g, 0.02); bx(1.7, 0.5, 0.04, P.woodDark, 0.3, 0.45, 0.55, g, 0.02);
    bx(0.7, 0.42, 0.05, P.black, -0.1, 1.15, -0.3, g, 0.02); bx(0.1, 0.3, 0.06, P.black, -0.1, 0.95, -0.3, g, 0.01);
    { const f = new THREE.Group(); f.position.set(0.75, 0.96, 0.3); f.rotation.set(-0.2, -0.3, 0, 'YXZ'); g.add(f); bx(0.36, 0.28, 0.03, P.woodDark, 0, 0, 0, f, 0.01); stk('photo', 0.3, 0.225, 0, 0, 0.018, 0, { parent: f }); }
    bx(0.5, 0.12, 0.08, P.lebecYellow, 0, 0.88, 0.55, g, 0.02); stk('chef', 0.46, 0.11, 0, 0.88, 0.595, 0, { parent: g });
    for (let i = 0; i < 4; i++) { const pp = bx(0.3, 0.012, 0.4, P.white, -0.8 + i * 0.03, 0.83 + i * 0.013, 0.1 + i * 0.02, g, 0.003); pp.rotation.y = i * 0.15; }
    cy(0.05, 0.045, 0.11, P.white, 1.0, 0.88, -0.25, g, 8);
    shovel(1.45, 0, 0.4, 1.1, 0.15, -0.18, g);
    const ch = new THREE.Group(); ch.position.set(0, 0, -1.15); g.add(ch);
    bx(0.6, 0.1, 0.55, P.black, 0, 0.5, 0, ch, 0.04); bx(0.6, 0.7, 0.1, P.black, 0, 0.9, -0.28, ch, 0.05); cy(0.04, 0.04, 0.4, P.steelDark, 0, 0.27, 0, ch, 6);
    p.label('Bureau du chef', 0, 1.9, 0, { size: 0.3 });
  }
  function babyfootP(g) {
    for (const dx of [-0.6, 0.6]) for (const dz of [-0.3, 0.3]) bx(0.1, 0.65, 0.1, P.woodDark, dx, 0.33, dz, g, 0.02);
    bx(1.4, 0.06, 0.8, P.woodDark, 0, 0.62, 0, g, 0.02); flat(1.28, 0.68, P.grass, 0, 0, 0.66, g);
    for (const [w, d, x, z] of [[1.4, 0.06, 0, -0.38], [1.4, 0.06, 0, 0.38], [0.06, 0.8, -0.68, 0], [0.06, 0.8, 0.68, 0]]) bx(w, 0.25, d, P.wood, x, 0.78, z, g, 0.02);
    [-0.45, -0.15, 0.15, 0.45].forEach((x, i) => {
      const rod = cy(0.015, 0.015, 1.3, P.steel, x, 0.85, 0, g, 6); rod.rotation.x = Math.PI / 2;
      for (let k = -1; k <= 1; k++) { bx(0.05, 0.16, 0.06, i % 2 ? P.red : P.lebecBlue, x, 0.8, k * 0.2, g, 0.015); cy(0.03, 0.03, 0.05, P.plasterWarm, x, 0.9, k * 0.2, g, 6); }
    });
  }
  function frigoP(p) {
    const g = p.g;
    p.col(0, 0.45, 0.8, 0.8, 'frigo');
    bx(0.8, 1.9, 0.8, P.white, 0, 0.95, 0.45, g, 0.12); bx(0.76, 0.02, 0.02, P.granite, 0, 1.3, 0.86, g, 0.005);
    bx(0.05, 0.35, 0.05, P.steel, 0.3, 1.55, 0.88, g, 0.01); bx(0.05, 0.25, 0.05, P.steel, 0.3, 1.0, 0.88, g, 0.01);
    [[P.red, 1.7, -0.2], [P.lebecYellow, 1.5, -0.1], [P.mint, 0.8, -0.25], [P.purple, 1.1, 0.1]].forEach(([c, y, x]) => bx(0.08, 0.08, 0.03, c, x, y, 0.86, g, 0.01));
    stk('pYaourt', 0.24, 0.24, -0.05, 1.35, 0.865, 0, { parent: g, roll: 0.08 });
    p.tgt('frigo', 0, 1, 1.0, 2.4);
  }

  /* =====================================================================
     PIÈCES ANNEXES
     ===================================================================== */
  const ROOM_INFO = {
    be: ['room_be', "BUREAU D'ÉTUDES", '#7fa7e0'], stock: ['room_stock', 'MAGASIN', '#e0b27f'], pause: ['room_pause', 'PAUSE', '#8fe0b6'],
    vestiaire: ['room_vest', 'VESTIAIRES', '#9aa7b5'], metrologie: ['room_metro', 'MÉTROLOGIE', '#d8e6f2'], quai: ['room_quai', 'QUAI COUVERT', '#e0b27f']
  };
  function roomShell(k, r, A) {
    const B = A.box, lvl = A.lvl, h = lvl <= 1 ? 3.0 : 3.6, st = A.L.style, t = 0.3, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
    const floors = { be: P.slate, pause: P.tile, vestiaire: P.granite, metrologie: P.white, stock: null };
    texPlane(w, d, floors[k] ? (lvl === 0 ? texM('beton', floors[k]) : ST.toon(floors[k])) : texM('sol', P.white), cx, cz, 0.031, 4);
    const e = 0.15;
    if (r.side === 'L' || r.side === 'R') {
      const outer = r.side === 'L' ? r.x0 : r.x1, inner = r.side === 'L' ? r.x1 : r.x0;
      wallRun('z', outer, r.z0 - e, r.z1 + e, h, [], st, t);
      wallRun('x', r.z0, r.x0 - e, r.x1 + e, h, [], st, t); wallRun('x', r.z1, r.x0 - e, r.x1 + e, h, [], st, t);
      if (r.z0 < B.minZ) wallRun('z', inner, r.z0, B.minZ, h, [], st, t);
    } else {
      wallRun('x', r.z0, r.x0 - e, r.x1 + e, h, [], st, t);
      wallRun('z', r.x0, r.z0, r.z1, h, [], st, t); wallRun('z', r.x1, r.z0, r.z1, h, [], st, t);
    }
    if (lvl <= 1) texBox(w + 0.5, 0.12, d + 0.5, texM('tole', lvl ? P.steel : P.dirt), cx, h + 0.1, cz, stat, 1.6);
    else texBox(w + 0.5, 0.25, d + 0.5, texM('tole', P.slate), cx, h + 0.12, cz, stat, 3);
    neon(cx, h - 0.4, cz, 2, W.neonMat);
    // panneau au-dessus de la porte (côté atelier)
    const info = ROOM_INFO[k];
    if (r.side === 'L') stk(info[0], 1.8, 0.45, B.minX + 0.23, 2.85, r.door, Math.PI / 2);
    else if (r.side === 'R') stk(info[0], 1.8, 0.45, B.maxX - 0.23, 2.85, r.door, -Math.PI / 2);
    else stk(info[0], 2.2, 0.55, r.door, 2.85, B.minZ + 0.23, 0);
    ML.mapRects.push({ x: cx, z: cz, w, d, c: info[2], name: info[1] });
    return { h, rx0: r.x0 + 0.15, rx1: r.x1 - 0.15, rz0: r.z0 + 0.15, rz1: r.z1 - 0.15, cx, cz };
  }
  /** étagère de stockage avec cartons */
  function shelfP(p, len) {
    const g = p.g; p.col(0, 0.35, len, 0.6, 'rack');
    for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) for (const z of [0.1, 0.6]) bx(0.06, 2.2, 0.06, P.lebecBlue, x, 1.1, z, g, 0.01);
    for (let i = 0; i < 4; i++) {
      const y = 0.15 + i * 0.6; bx(len, 0.05, 0.6, P.orange, 0, y, 0.35, g, 0.01);
      for (let k = 0; k < Math.floor(len / 0.55); k++) if ((k + i) % 3) carton(-len / 2 + 0.35 + k * 0.55, y + 0.025, 0.35, 0.45, 0.28 + ((k * i) % 3) * 0.06, 0.45, 0, g);
    }
  }
  function sofaP(p, col) {
    const g = p.g; p.col(0, 0.45, 2.2, 0.85, 'banc');
    bx(2.2, 0.45, 0.85, col, 0, 0.25, 0.45, g, 0.12); bx(2.2, 0.6, 0.25, col, 0, 0.7, 0.15, g, 0.1);
    for (const s of [-1, 1]) bx(0.22, 0.65, 0.85, col, s * 1.0, 0.4, 0.45, g, 0.08);
    for (const s of [-1, 1]) bx(0.8, 0.12, 0.6, ST.vary(col, 0.4, rnd), s * 0.45, 0.53, 0.5, g, 0.08);
  }
  function rooms(A) {
    const R = A.R, lvl = A.lvl, q = Math.max(1, lvl);
    A.roomIdle = []; A.roomCoffee = null;
    for (const k in R) {
      const r = R[k];
      if (k === 'quai') { quaiCanopy(r); continue; }
      const s = roomShell(k, r, A);
      if (k === 'pause') {
        coffeeP(piece(s.rx0, r.z1 - 1.6, 1), Math.max(2, lvl));
        frigoP(piece(s.rx0, r.z1 - 4.6, 1));
        sofaP(piece(s.cx - 1.4, s.rz0, 0), P.shutterRed);
        stk('tv', 1.4, 0.8, s.cx - 1.4, 1.95, s.rz0 + 0.04, 0, { glow: true }); bx(1.5, 0.9, 0.06, P.black, s.cx - 1.4, 1.95, s.rz0 + 0.01, stat, 0.02);
        { const g = new THREE.Group(); g.position.set(s.cx + 1.4, 0, s.cz + 0.4); stat.add(g); babyfootP(g); U.boxCollider(s.cx + 1.4, s.cz + 0.4, 1.4, 0.8, 'babyfoot'); }
        { const t = cy(0.45, 0.45, 0.05, P.white, s.cx - 1.6, 0.74, s.rz1 - 1.0, stat, 14); cy(0.05, 0.05, 0.72, P.steelDark, s.cx - 1.6, 0.36, s.rz1 - 1.0, stat, 6); U.boxCollider(s.cx - 1.6, s.rz1 - 1.0, 0.9, 0.9, 'banc'); t.userData.x = 0; }
        stk('planning', 1.0, 1.0, s.cx, 1.8, s.rz1 - 0.02, Math.PI); plant(s.rx1 - 0.5, s.rz0 + 0.5, false);
        A.roomCoffee = [{ x: r.x0 + 1.6, z: r.z1 - 1.3 }, { x: r.x0 + 2.4, z: r.z1 - 2.4 }, { x: r.x0 + 1.7, z: r.z1 - 3.2 }];
        A.roomIdle.push({ x: s.cx, z: s.cz - 1.4 });
      } else if (k === 'be') {
        const p = piece(s.rx1, s.cz + 0.6, 3); pcP(p, q, ['be'], '💻 PC du BE (gestion)');
        stk('cao', 0.9, 0.55, -0.95, 1.18, 0.12, 0, { parent: p.g, glow: true }); bx(0.96, 0.6, 0.05, P.black, -0.95, 1.18, 0.08, p.g, 0.02);
        pcP(piece(s.cx + 0.4, s.rz0, 0), q, ['pc'], 'PC (Arexis)');
        { const pl = piece(s.cx + 0.8, s.rz1, 2); pl.col(0, 0.35, 1.6, 0.6, 'desk'); bx(1.6, 0.4, 0.55, P.slateDark, 0, 0.95, 0.35, pl.g, 0.06); for (const sx of [-0.7, 0.7]) bx(0.06, 0.75, 0.4, P.steelDark, sx, 0.38, 0.35, pl.g, 0.01); bx(1.2, 0.01, 0.6, P.white, 0, 0.8, 0.8, pl.g, 0.003).rotation.x = 0.5; }
        stk('plan', 1.6, 1.2, s.cx - 1.2, 2.0, s.rz1 - 0.02, Math.PI); stk('plan', 1.6, 1.2, s.rx1 - 0.02, 2.0, s.cz - 2.4, -Math.PI / 2); stk('plan', 1.2, 0.9, s.cx - 1.8, 2.0, s.rz0 + 0.02, 0, { roll: 0.05 });
        plant(s.rx0 + 0.6, s.rz0 + 0.6, lvl < 2);
      } else if (k === 'stock') {
        const mats = ['acier', 'alu', 'inox'];
        mats.forEach((m, i) => rackP(piece(-5 + i * 3.2, s.rz0, 0), m, 2.6, q, false, 9));
        shelfP(piece(s.rx0, s.cz, 1), 3.2); shelfP(piece(s.rx1, s.cz, 3), 3.2);
        for (let i = 0; i < 2; i++) pallet(5.2, i * 0.15, r.z0 + 2.6, 0.1);
        carton(5.0, 0.3, r.z0 + 2.6, 0.6, 0.5, 0.6, 0.2); carton(5.5, 0.3, r.z0 + 2.4, 0.5, 0.4, 0.5, -0.3); U.boxCollider(5.2, r.z0 + 2.6, 1.3, 1.3, 'palettes');
        A.roomIdle.push({ x: -1, z: s.cz + 0.6 });
      } else if (k === 'vestiaire') {
        lockersP(piece(s.rx0, s.cz, 1), 6, lvl);
        bx(0.42, 0.06, 3.2, P.wood, s.cx + 0.6, 0.45, s.cz, stat, 0.02); for (const dz of [-1.4, 1.4]) bx(0.3, 0.42, 0.06, P.steelDark, s.cx + 0.6, 0.21, s.cz + dz, stat, 0.01);
        U.boxCollider(s.cx + 0.6, s.cz, 0.45, 3.2, 'banc');
        stk('douche', 0.6, 0.6, s.cx, 1.7, s.rz0 + 0.02, 0); bx(0.6, 0.9, 0.03, P.glass, s.cx + 1.2, 1.6, s.rz1 - 0.02, stat, 0.01);
        A.roomIdle.push({ x: s.cx + 1.6, z: s.cz + 0.8 });
      } else if (k === 'metrologie') {
        marbreP(piece(s.cx + 0.7, s.cz, 3), 3);
        { const g = new THREE.Group(); g.position.set(s.rx1 - 1.0, 0, s.rz0 + 1.2); stat.add(g);      // machine à mesurer tridimensionnelle (décor)
          bx(1.6, 0.8, 1.6, P.machineDark, 0, 0.4, 0, g, 0.05); bx(1.5, 0.15, 1.5, P.slateDark, 0, 0.88, 0, g, 0.03);
          for (const s2 of [-0.7, 0.7]) bx(0.12, 1.2, 0.15, P.white, s2, 1.55, 0, g, 0.03); bx(1.6, 0.18, 0.2, P.white, 0, 2.2, 0, g, 0.04);
          bx(0.18, 0.9, 0.18, P.lebecBlue, 0.1, 1.7, 0, g, 0.03); cy(0.03, 0.03, 0.2, P.red, 0.1, 1.15, 0, g, 6);
          U.boxCollider(s.rx1 - 1.0, s.rz0 + 1.2, 1.7, 1.7, 'marbre'); }
        { const p2 = piece(s.cx - 1.2, s.rz0, 0); p2.col(0, 0.35, 1.4, 0.6, 'desk'); bx(1.4, 0.9, 0.6, P.shutterBlue, 0, 0.45, 0.35, p2.g, 0.04); for (let i = 0; i < 4; i++) bx(1.3, 0.02, 0.02, P.steel, 0, 0.2 + i * 0.2, 0.66, p2.g, 0.005); bx(0.3, 0.05, 0.2, P.steel, 0.3, 0.93, 0.35, p2.g, 0.01); cy(0.02, 0.02, 0.45, P.steel, 0.3, 1.15, 0.35, p2.g, 6); }
        stk('temp', 0.8, 0.4, s.cx, 2.3, s.rz1 - 0.02, Math.PI, { glow: true }); stk('clean', 1.2, 0.8, s.rx1 - 0.02, 1.8, s.cz + 1.6, -Math.PI / 2);
      }
    }
  }
  /** auvent du quai couvert (porte-à-faux : poteaux derrière, la route passe dessous) */
  function quaiCanopy(r) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, h = 5.6;
    for (const x of [16.5, 21, 25.5]) { bx(0.35, h, 0.35, P.lebecBlue, x, h / 2, r.z1, stat, 0.04); U.boxCollider(x, r.z1, 0.4, 0.4, 'potelet'); bx(0.25, 0.4, r.z1 - r.z0, P.lebecBlue, x, h - 0.2, cz, stat, 0.04); const st2 = bx(0.18, 0.18, 4.6, P.steelDark, x, h - 1.6, r.z1 - 2.1, stat, 0.02); st2.rotation.x = -0.6; }
    texBox(r.x1 - r.x0, 0.2, r.z1 - r.z0 + 0.4, texM('tole', P.slate), cx, h + 0.1, cz, stat, 3);
    bx(r.x1 - r.x0, 0.35, 0.2, P.orange, cx, h - 0.1, r.z0 - 0.15, stat, 0.03);
    stk('room_quai', 3, 0.75, cx, h - 0.75, r.z0 - 0.08, 0); stk('room_quai', 3, 0.75, cx, h - 0.75, r.z0 - 0.3, Math.PI);
    for (const x of [19, 23, 27]) neon(x, h - 0.5, cz + 1, 2.2, W.neonMat);
    ML.mapRects.push({ x: cx, z: cz, w: r.x1 - r.x0, d: r.z1 - r.z0, c: '#e0b27f', name: 'QUAI' });
  }

  /* =====================================================================
     DÉCOR PROPRE À CHAQUE NIVEAU
     ===================================================================== */
  function levelDecor(A) {
    const L = A.L, B = A.box, R = A.R, lvl = A.lvl, X0 = B.minX, X1 = B.maxX, Z0 = B.minZ, H = L.H;
    if (lvl === 0) {
      const [hx, hz] = A.hole;
      // seau sous la fuite + flaque + post-it
      cy(0.24, 0.19, 0.4, P.shutterBlue, hx, 0.2, hz, stat, 12); cy(0.22, 0.22, 0.02, P.water, hx, 0.36, hz, stat, 12); { const an = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 4, 12, Math.PI), M(P.steel)); an.position.set(hx, 0.42, hz); stat.add(an); }
      U.boxCollider(hx, hz, 0.55, 0.55, 'seau'); flat(1.3, 0.9, P.water, hx + 0.3, hz + 0.2, 0.04);
      stk('pFuite', 0.4, 0.4, 2.0, 1.6, Z0 + 0.22, 0, { roll: -0.08 });
      // cartons empilés
      const cpos = !R.vestiaire ? [X0 + 1.4, Z0 + 1.0] : !R.metrologie ? [X1 - 1.4, Z0 + 2.4] : null;
      if (cpos) { carton(cpos[0], 0, cpos[1], 0.9, 0.6, 0.7, 0.1); carton(cpos[0] + 0.3, 0.6, cpos[1] - 0.1, 0.7, 0.5, 0.6, -0.2); carton(cpos[0] - 0.5, 0, cpos[1] + 0.4, 0.6, 0.45, 0.6, 0.4); carton(cpos[0] + 0.1, 1.1, cpos[1], 0.5, 0.35, 0.4, 0.5); U.boxCollider(cpos[0], cpos[1] + 0.1, 1.6, 1.3, 'cartons'); }
      // rallonges qui traînent, taches d'huile, balai
      cord([[X1 - 0.6, 8.6], [6, 8.9], [3.4, 8.5], [0.6, 8.9], [-1.8, 6.8], [-2.6, 5.0]]); cord([[X1 - 0.6, 8.4], [7.6, 7.6], [7.0, 4.4]]);
      bx(0.25, 0.08, 0.15, P.white, 0.6, 0.06, 8.9, stat, 0.02);                                        // multiprise
      for (const [x, z, s] of [[-3, 4.6, 1.2], [1.5, 4.0, 0.7], [-5.5, 10, 0.9]]) { const o = flat(s, s * 0.7, P.black, x, z, 0.038); o.rotation.z = x; }
      { const b = cy(0.02, 0.02, 1.4, P.wood, X1 - 0.5, 0.7, 11.0, stat, 5); b.rotation.z = 0.2; bx(0.35, 0.08, 0.1, P.lebecYellow, X1 - 0.38, 0.05, 11.0, stat, 0.02); }
      { const g = new THREE.Group(); g.position.set(X0 + 0.5, 0, 11.0); g.rotation.z = -0.2; stat.add(g); for (const s of [-0.22, 0.22]) bx(0.05, 2.8, 0.05, P.steel, 0, 1.4, s, g, 0.01); for (let i = 0; i < 7; i++) bx(0.04, 0.04, 0.44, P.steel, 0, 0.3 + i * 0.38, 0, g, 0.01); }   // échelle
      return;
    }
    if (lvl === 1) {
      { const g = new THREE.Group(); g.position.set(X1 - 1.6, 0, 11.6); stat.add(g); bx(0.6, 0.05, 0.6, P.white, 0, 0.45, 0, g, 0.03); for (const s of [-1, 1]) bx(0.05, 0.45, 0.55, P.white, s * 0.27, 0.22, 0, g, 0.01); bx(0.6, 0.55, 0.06, P.white, 0, 0.75, -0.28, g, 0.03); }   // chaise de jardin de Lebec
      cord([[X1 - 0.6, 1.0], [6, 1.2], [1, 0.8], [-2.6, 2.0]]);
      if (!R.vestiaire) { carton(X0 + 1.2, 0, Z0 + 0.9, 0.9, 0.6, 0.7, 0.1); carton(X0 + 1.4, 0.6, Z0 + 0.9, 0.6, 0.4, 0.5, -0.2); U.boxCollider(X0 + 1.2, Z0 + 0.9, 1.1, 1.0, 'cartons'); }
      return;
    }
    // allée peinte (2 lignes jaunes + pointillés)
    for (const dz of [-1.3, 1.3]) flat(B.maxX - B.minX - 4, 0.14, P.markYellow, (X0 + X1) / 2, L.aisle + dz, 0.04);
    for (let x = X0 + 2.5; x <= X1 - 2.5; x += 4) flat(0.9, 0.5, lvl === 4 ? P.mint : P.mark, x, L.aisle, 0.041);
    if (L.crane) crane(A);
    if (lvl === 4) {
      // grands écrans
      stk('kpi', 7, 3.5, 0, H - 2.8, Z0 + 0.3, 0, { glow: true }); bx(7.3, 3.8, 0.1, P.black, 0, H - 2.8, Z0 + 0.22, stat, 0.04);
      stk('kpi', 5, 2.5, X0 + 0.3, H - 2.6, -4, Math.PI / 2, { glow: true }); bx(0.1, 2.7, 5.2, P.black, X0 + 0.22, H - 2.6, -4, stat, 0.04);
      stk('cnc', 3, 3, X1 - 0.24, H - 2.6, 2, -Math.PI / 2, { glow: true });
      // bandeaux LED au sol le long des murs
      for (const [x, z, w2, d2] of [[0, Z0 + 0.5, X1 - X0 - 1, 0.08], [X0 + 0.5, (Z0 + 14) / 2, 0.08, 14 - Z0 - 1], [X1 - 0.5, (Z0 + 14) / 2, 0.08, 14 - Z0 - 1]]) stk('ledP', Math.max(w2, d2), 0.08, x, 0.05, z, w2 > d2 ? 0 : Math.PI / 2, { glow: true, floor: true });
      robot(A); mezzanine(A);
      for (const [x, z] of [[-5, 13], [5, 13], [X0 + 0.8, -10], [X1 - 0.8, 9.4]]) plant(x, z, false);
    }
  }
  /** pont roulant (le pont se déplace : W._crane) */
  function crane(A) {
    const B = A.box, H = A.L.H, X0 = B.minX, X1 = B.maxX, yR = H - 1.3, d = 14 - B.minZ, cz = (B.minZ + 14) / 2;
    for (const x of [X0 + 0.55, X1 - 0.55]) { bx(0.3, 0.45, d - 1, P.lebecYellow, x, yR, cz, stat, 0.03); for (let z = B.minZ + 2; z < 13; z += 6) bx(0.4, 0.25, 0.25, P.steelDark, x + (x < 0 ? -0.2 : 0.2), yR - 0.3, z, stat, 0.03); }
    const g = new THREE.Group();
    bx(X1 - X0 - 1.0, 0.7, 0.55, P.lebecYellow, 0, yR + 0.55, 0, g, 0.05); bx(X1 - X0 - 1.0, 0.12, 0.6, P.black, 0, yR + 0.95, 0, g, 0.02);
    for (const x of [X0 + 0.55, X1 - 0.55]) bx(0.5, 0.5, 1.6, P.machineDark, x, yR + 0.45, 0, g, 0.05);
    bx(1.0, 0.7, 0.9, P.machineDark, 3, yR + 0.1, 0, g, 0.06); cy(0.015, 0.015, 2.2, P.steelDark, 3, yR - 1.3, 0, g, 4);
    bx(0.3, 0.25, 0.2, P.lebecYellow, 3, yR - 2.45, 0, g, 0.04); { const hk = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10, Math.PI * 1.4), M(P.red)); hk.position.set(3, yR - 2.7, 0); g.add(hk); }
    stk('hatch', 2.4, 0.3, -3, yR + 0.55, 0.28, 0, { parent: g });
    g.position.set(0, 0, cz); const gb = bake(g); gb.userData.keep = true; gb.position.set(0, 0, cz); add(gb);
    W._crane = { mesh: gb, z0: B.minZ + 2.5, z1: 10, t: 0 };
  }
  /** robot de démonstration dans sa cage (anime W._robot) */
  function robot(A) {
    const B = A.box, x0 = B.minX + 0.3, x1 = B.minX + 5.4, z0 = -16.6, z1 = -10.8, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    U.addCollider(x0, x1, z0, z1, 'robot');
    for (const [a, b, ax] of [[x0, x1, 'z1'], [z0, z1, 'x1'], [x0, x1, 'z0']]) {
      const n = Math.ceil((b - a) / 1.4);
      for (let i = 0; i <= n; i++) { const t = a + (b - a) * i / n; if (ax === 'x1') bx(0.08, 2.0, 0.08, P.lebecYellow, x1, 1.0, t, stat, 0.01); else bx(0.08, 2.0, 0.08, P.lebecYellow, t, 1.0, ax === 'z1' ? z1 : z0, stat, 0.01); }
      for (const y of [0.4, 1.9]) if (ax === 'x1') bx(0.05, 0.05, b - a, P.lebecYellow, x1, y, (a + b) / 2, stat, 0.01); else bx(b - a, 0.05, 0.05, P.lebecYellow, (a + b) / 2, y, ax === 'z1' ? z1 : z0, stat, 0.01);
      const gl = new THREE.Mesh(ax === 'x1' ? new THREE.PlaneGeometry(b - a, 1.4) : new THREE.PlaneGeometry(b - a, 1.4), ST.toon(P.machineDark, 0, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, key: 'grilleRobot' }));
      if (ax === 'x1') { gl.rotation.y = Math.PI / 2; gl.position.set(x1, 1.15, (a + b) / 2); } else gl.position.set((a + b) / 2, 1.15, ax === 'z1' ? z1 : z0); stat.add(gl);
    }
    stk('danger', 0.5, 0.4, x1 + 0.06, 1.5, cz, Math.PI / 2);
    bx(1.2, 0.8, 0.8, P.steelDark, cx + 1.2, 0.4, cz + 1.5, stat, 0.04); bx(0.4, 0.3, 0.4, P.steel, cx + 1.2, 0.95, cz + 1.5, stat, 0.03);
    // le bras (parties mobiles : non cuites)
    const base = new THREE.Group(); base.position.set(cx - 0.4, 0, cz); base.userData.keep = true; add(base);
    cy(0.45, 0.5, 0.4, P.machineDark, 0, 0.2, 0, base, 14);
    const j1 = new THREE.Group(); j1.position.y = 0.4; base.add(j1); cy(0.35, 0.4, 0.5, P.orange, 0, 0.25, 0, j1, 12);
    const j2 = new THREE.Group(); j2.position.y = 0.6; j1.add(j2); bx(0.32, 1.5, 0.32, P.orange, 0, 0.75, 0, j2, 0.08); cy(0.2, 0.2, 0.45, P.machineDark, 0, 0, 0, j2, 12).rotation.x = Math.PI / 2;
    const j3 = new THREE.Group(); j3.position.y = 1.5; j2.add(j3); bx(0.26, 1.2, 0.26, P.orange, 0, 0.6, 0, j3, 0.07); cy(0.17, 0.17, 0.4, P.machineDark, 0, 0, 0, j3, 12).rotation.x = Math.PI / 2;
    const tool = new THREE.Group(); tool.position.y = 1.25; j3.add(tool); cy(0.1, 0.12, 0.2, P.steelDark, 0, 0, 0, tool, 10); for (const s of [-1, 1]) bx(0.05, 0.22, 0.12, P.steel, s * 0.08, -0.18, 0, tool, 0.01); cy(0.07, 0.07, 0.14, ML.MATERIALS.alu.color, 0, -0.3, 0, tool, 8);
    W._robot = { j1, j2, j3, t: 0 };
  }
  /** mezzanine + bureau vitré de Lebec (au-dessus du fond droit) */
  function mezzanine(A) {
    const B = A.box, x0 = 12, x1 = B.maxX - 0.2, z0 = B.minZ + 0.2, z1 = -12.4, y = 3.6, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    bx(x1 - x0, 0.25, z1 - z0, P.steelDark, cx, y - 0.12, cz, stat, 0.03); bx(x1 - x0, 0.04, z1 - z0, P.slate, cx, y + 0.02, cz, stat, 0.01);
    for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) { cy(0.14, 0.14, y, P.white, x, y / 2, z1 - 0.2, stat, 10); U.boxCollider(x, z1 - 0.2, 0.4, 0.4, 'potelet'); }
    // garde-corps vitré + main courante
    { const gl = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.0, 0.05), glassMat()); gl.position.set(cx, y + 0.55, z1); stat.add(gl); bx(x1 - x0, 0.06, 0.1, P.white, cx, y + 1.08, z1, stat, 0.02); stk('ledM', x1 - x0, 0.06, cx, y - 0.27, z1 + 0.03, 0, { glow: true }); }
    // escalier le long du mur du fond (x 8.6 → 12)
    const n = 12; for (let i = 0; i < n; i++) bx(0.3, 0.06, 1.1, P.steelDark, 8.6 + i * 0.28, (i + 1) * y / n, z0 + 0.6, stat, 0.01);
    { const s = bx(3.6, 0.1, 0.06, P.lebecYellow, 10.3, y / 2 + 0.9, z0 + 1.15, stat, 0.01); s.rotation.z = Math.atan2(y, 3.4); }
    U.addCollider(8.45, 12, z0, z0 + 1.2, 'escalier');
    // bureau vitré
    const ox0 = 16, ox1 = x1 - 0.1, oz0 = z0 + 0.1, oz1 = z1 - 1.2, ocx = (ox0 + ox1) / 2, ocz = (oz0 + oz1) / 2, oh = 2.6;
    for (const [w2, d2, x, z] of [[ox1 - ox0, 0.06, ocx, oz1], [0.06, oz1 - oz0, ox0, ocz]]) { const gl = new THREE.Mesh(new THREE.BoxGeometry(w2, oh, d2), glassMat()); gl.position.set(x, y + oh / 2, z); stat.add(gl); }
    for (let x = ox0; x <= ox1; x += 1.6) bx(0.08, oh, 0.08, P.white, x, y + oh / 2, oz1, stat, 0.01);
    bx(ox1 - ox0 + 0.2, 0.15, oz1 - oz0 + 0.2, P.white, ocx, y + oh, ocz, stat, 0.02);
    stk('eyes', 2.4, 1.2, ocx, y + 1.7, oz1 + 0.05, 0); stk('chef', 1.2, 0.4, ocx - 2.4, y + 2.25, oz1 + 0.05, 0);
    { const g = new THREE.Group(); g.position.set(ocx + 1, y, ocz - 0.5); stat.add(g);
      bx(2.6, 0.08, 1.2, P.machineDark, 0, 0.78, 0, g, 0.03); for (const s of [-1, 1]) bx(0.08, 0.76, 1.1, P.machineDark, s * 1.2, 0.38, 0, g, 0.01);
      for (const s of [-0.5, 0.5]) { bx(0.8, 0.48, 0.05, P.black, s, 1.15, -0.4, g, 0.02); stk('kpi', 0.74, 0.4, s, 1.15, -0.37, 0, { parent: g, glow: true }); }
      bx(0.7, 1.1, 0.7, P.black, 0, 0.6, -1.0, g, 0.06); shovel(1.5, 0, 0.3, 1.1, 0.1, -0.2, g); }
    const l = U.label('Bureau de M. Lebec (vue sur ses employés)', { size: 0.32 }); l.position.set(ocx, y + 3.1, oz1); add(l);
  }

  /* =====================================================================
     CONSTRUCTION (appelée par World.build)
     ===================================================================== */
  W.atelier = () => {
    root = W.root; stat = add(new THREE.Group()); rnd = U.rng(77);
    const C = current(), L = LV[C.lvl];
    const A = W._at = Object.assign(C, { L, R: roomRects(C.lvl, C.box, C.rooms), aisle: L.aisle, hole: [2.0, 7.0] });
    W.rackBars = {}; W.rackLabels = {}; W.drawerLabels = {}; W.hoseReels = []; W._hoses = []; W._drip = W._crane = W._robot = null; W.panelLight = null;
    W.neonMat = new THREE.MeshToonMaterial({ color: P.white, emissive: P.mark, gradientMap: ST.gradient });
    W._flickMat = new THREE.MeshToonMaterial({ color: P.white, emissive: P.mark, gradientMap: ST.gradient });
    W._power = true; W._ceil = L.H;
    shell(A); yard(A); rooms(A); levelDecor(A);
  };

  W.furniture = () => {
    ensureStat();
    const A = W._at, L = A.L, B = A.box, R = A.R, lvl = A.lvl;
    const mk = spec => { const [x, z, r] = spec.free || onWall(spec.wall, spec.at, B); return piece(x, z, r); };
    // racks (rack « officiel » de chaque matière)
    ['acier', 'alu', 'inox'].forEach((m, i) => rackP(mk({ wall: L.racks.wall, at: L.racks.at[i] }), m, L.racks.len, lvl, true, 0));
    if (lvl >= 1) { stk('rack', 1.2, 0.4, L.racks.at[0] + 1.6, 3.3, B.minZ + 0.22, 0); stk('poly', 1.2, 0.4, L.racks.at[1] + 1.6, 3.3, B.minZ + 0.22, 0); }
    cabinetP(mk(L.cabinet), L.cabinet.w, lvl);
    const hk = boardP(mk(L.board), L.board.w, lvl);
    const ext2 = extP(mk(L.ext2));
    panelP(mk(L.panel), lvl);
    printerP(mk(L.printer), lvl);
    casquesP(mk(L.casques));
    if (!R.be) pcP(mk(L.pc), lvl, ['pc', 'be'], lvl === 0 ? '💻 Le PC (devis, achats… et Arexis)' : '💻 PC (gestion + Arexis)');
    if (!R.metrologie) marbreP(mk(L.marbre), lvl);
    if (!R.pause) coffeeP(mk(L.coffee), lvl);
    if (!R.vestiaire && L.lockers) lockersP(mk(L.lockers), 4, lvl);
    if (L.whiteboard) whiteboardP(mk(L.whiteboard));
    if (L.photo) photoP(mk(L.photo));
    if (L.chef) chefP(mk(L.chef));
    // améliorations décoratives de la campagne
    if (W.up.babyfoot && !R.pause) { const p = mk({ wall: 'L', at: L.board.wall === 'L' ? L.board.at - L.board.w / 2 - 2.6 : 8 }); p.col(0, 0.6, 1.4, 0.8, 'babyfoot'); const g = new THREE.Group(); g.position.set(0, 0, 0.6); p.g.add(g); babyfootP(g); }
    if ((W.up.frigo || R.pause) && !R.pause) frigoP(mk({ wall: 'F', at: B.minX + 1.4 }));
    if (W.up.plantes) for (const [x, z] of [[B.maxX - 1, 13], [B.minX + 1, B.minZ + 1.2], [B.maxX - 1, B.minZ + 1.2]]) if (!U.inCollider(x, z, 0.4)) plant(x, z, false);
    if (W.up.posters) { stk('eyes', 2.0, 1.0, B.minX + 0.22, 3.4, (B.minZ + 14) / 2 - 3, Math.PI / 2); stk('eyes', 2.0, 1.0, -3 - (lvl >= 4 ? 6 : 0), 3.4, B.minZ + 0.22, 0); }
    // zones au sol réception / expédition
    const [r0, r1, r2, r3] = L.rec, [e0, e1, e2, e3] = L.exp;
    flat(r1 - r0, r3 - r2, P.shutterBlue, (r0 + r1) / 2, (r2 + r3) / 2, 0.045); flat(e1 - e0, e3 - e2, P.shutterGreen, (e0 + e1) / 2, (e2 + e3) / 2, 0.045);
    stk('recSol', Math.min(4.2, r1 - r0 - 0.4), 1.05, (r0 + r1) / 2, 0.05, r3 - 0.9, 0, { floor: true }); stk('expSol', Math.min(4.2, e1 - e0 - 0.4), 1.05, (e0 + e1) / 2, 0.05, e3 - 0.9, 0, { floor: true });
    const l1 = U.label('RÉCEPTION : caisses matière / outils', { size: 0.42, color: '#bfe0ff' }); l1.position.set((r0 + r1) / 2, 2.6, (r2 + r3) / 2); add(l1);
    const l2 = U.label('EXPÉDITION : caisses usinées', { size: 0.42, color: '#b6ffcb' }); l2.position.set((e0 + e1) / 2, 2.6, (e2 + e3) / 2); add(l2);
    W.targets.push({ id: 'reception', x: (r0 + r1) / 2, y: 0.8, z: (r2 + r3) / 2, r: 4.2 });
    // ---------- positions pour la simulation ----------
    const pt = ([x, z]) => ({ x, z });
    const idle = L.idle.map(pt).concat(A.roomIdle || []);
    Object.assign(ML.LOC, {
      spawn: L.spawn.map(pt), patrol: L.patrol.map(pt), idle, lebec: pt(L.lebec),
      coffee: A.roomCoffee || L.coffeePts.map(pt),
      hooks: [{ type: 'extincteur', x: hk.ext.x, y: 0, z: hk.ext.z }, { type: 'extincteur', x: ext2.x, y: 0, z: ext2.z },
              { type: 'cle', x: hk.cle[0].x, y: 0.95, z: hk.cle[0].z }, { type: 'cle', x: hk.cle[1].x, y: 0.95, z: hk.cle[1].z },
              { type: 'soufflette', x: hk.sou[0].x, y: 0.95, z: hk.sou[0].z }, { type: 'soufflette', x: hk.sou[1].x, y: 0.95, z: hk.sou[1].z }],
      reception: { x: (r0 + r1) / 2, z: (r2 + r3) / 2 }, expedition: { minX: e0, maxX: e1, minZ: e2, maxZ: e3 },
      doorIn: { x: 0, z: 12 }, tpSpawn: { x: L.tp[0], z: L.tp[1], h: Math.PI },
      aisle: { z: L.aisle, minX: B.minX + 1.5, maxX: B.maxX - 1.5 },
      atelier: { lvl, box: Object.assign({}, B), rooms: JSON.parse(JSON.stringify(R)) }
    });
    W._bounds = { minX: B.minX + 0.25, maxX: B.maxX - 0.25, minZ: B.minZ + 0.25, maxZ: Math.min(r2, e2) - 0.3 };
  };

  /* =====================================================================
     MACHINES : modèles par gamme (tier) dans un repère local.
     Tour : le long de x, opérateur côté +z. Fraiseuse : opérateur côté −z.
     sg = parties statiques (cuites ensemble), mg = groupe racine (pivot,
     mandrin m.spinner, voyant lightMat, fumée, étiquette).
     ===================================================================== */
  const MSTK = ['poly', 'toucher', 'lunettes', 'bonjour'];
  const glassMachine = () => ST.toon(P.glass, 0, { transparent: true, opacity: 0.32, side: THREE.DoubleSide, key: 'vitreMachine' });
  /** cotes locales d'une machine (emprise, collider, poste, bac, cible) */
  function mgeom(def) {
    const tier = def.tier === undefined ? 2 : Math.max(0, Math.min(4, def.tier | 0));
    if (def.type === 'fraiseuse') {
      const s = [2.0, 2.0, 2.3, 2.8, 3.2][tier];
      return { tier, fr: true, s, rect: [-s / 2, s / 2 + 0.9, -(s / 2 + 1.3), s / 2], col: [s, s], station: [0, -(s / 2 + 0.7), 0], chips: [s / 2 + 0.45, -(s / 2 + 0.25)], tgt: [0.6, -(s / 2 + 0.15)], lab: tier >= 3 ? 4.4 : tier === 0 ? 3.7 : 4.4 };
    }
    const len = def.len || 4, d = tier >= 3 ? 2.0 : 1.4, hx = len / 2;
    return { tier, fr: false, len, d, rect: [-hx, hx + 0.75, -d / 2, d / 2 + 1.45], col: [len, d], station: [0, d / 2 + 0.85, Math.PI], chips: [hx + 0.3, d / 2 + 0.5], tgt: [0.9, d / 2 + 0.2], lab: tier >= 3 ? 3.7 : 3.5 };
  }
  W.machineFootprint = def => {
    const G = mgeom(def), r = G.rect, out = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 };
    for (const x of [r[0], r[1]]) for (const z of [r[2], r[3]]) { const p = rotPt(def.x, def.z, def.rot | 0, x, z); out.minX = Math.min(out.minX, p.x); out.maxX = Math.max(out.maxX, p.x); out.minZ = Math.min(out.minZ, p.z); out.maxZ = Math.max(out.maxZ, p.z); }
    return out;
  };
  /** taches de rouille / peinture écaillée sur une face (+z) d'une boîte */
  function rust(sg, w, h, x, y, z, n, face) {
    for (let i = 0; i < n; i++) {
      const s = 0.08 + rnd() * 0.16, px = x + (rnd() - 0.5) * (w - s), py = y + (rnd() - 0.5) * (h - s);
      if (face === 'y') bx(s, 0.012, s * 0.8, i % 3 ? P.orange : P.trunk, px, y, z + (rnd() - 0.5) * 0.4, sg, 0.004);
      else bx(s, s * 0.7, 0.012, i % 3 ? P.orange : P.trunk, px, py, z, sg, 0.004);
    }
  }
  /** chatterton (scotch gris) en croix */
  function tape(sg, x, y, z, ry) { for (const a of [0.6, -0.6]) { const t = bx(0.5, 0.06, 0.012, P.granite, x, y, z, sg, 0.003); t.rotation.set(0, ry || 0, a); } }
  /** lampe d'atelier à col de cygne (voyant = ampoule) */
  function gooseLamp(m, sg, mg, x, y, z) {
    cy(0.06, 0.08, 0.06, P.black, x, y, z, sg, 8); const a = cy(0.015, 0.015, 0.6, P.steelDark, x, y + 0.28, z + 0.08, sg, 5); a.rotation.x = 0.3;
    const sh = cy(0.06, 0.14, 0.14, P.pine, x, y + 0.6, z + 0.22, sg, 10); sh.rotation.x = 0.5;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.lightMat); b.position.set(x, y + 0.53, z + 0.27); mg.add(b);
  }
  /** colonne lumineuse (voyant d'état) */
  function signalTower(m, sg, mg, x, y, z) {
    cy(0.025, 0.025, 0.25, P.steelDark, x, y, z, sg, 6); cy(0.115, 0.115, 0.05, P.black, x, y + 0.42, z, sg, 10);
    const Lm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10), m.lightMat); Lm.position.set(x, y + 0.25, z); mg.add(Lm);
  }
  /** mandrin de tour (groupe à cuire), sens : +1 = nez vers +x */
  function chuck(dir, big) {
    const sp = new THREE.Group(), k = big ? 1.15 : 1, rz = o => { o.rotation.z = Math.PI / 2; return o; };
    rz(cy(0.36 * k, 0.36 * k, 0.3, P.steel, 0, 0, 0, sp, 14)); rz(cy(0.3 * k, 0.3 * k, 0.06, P.steelDark, dir * 0.17, 0, 0, sp, 14));
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, j = bx(0.12, 0.16, 0.12, P.steelDark, dir * 0.22, Math.cos(a) * 0.2, Math.sin(a) * 0.2, sp, 0.02); j.rotation.x = a; }
    rz(cy(0.1, 0.1, 0.7, ML.MATERIALS.acier.color, dir * 0.55, 0, 0, sp, 10)); rz(cy(0.07, 0.07, 0.25, P.steelDark, dir * 1.0, 0, 0, sp, 10));
    return sp;
  }
  /** broche de fraiseuse (groupe à cuire) */
  function spindle(k) {
    const sp = new THREE.Group(); k = k || 1;
    cy(0.17 * k, 0.17 * k, 0.12, P.steelDark, 0, -0.06, 0, sp, 12); cy(0.14 * k, 0.08 * k, 0.18, P.steel, 0, -0.21, 0, sp, 12);
    cy(0.075, 0.075, 0.32, ML.TOOLS.fraise.color, 0, -0.46, 0, sp, 6);
    for (let i = 0; i < 3; i++) { const f = bx(0.17, 0.05, 0.04, P.steelDark, 0, -0.36 - i * 0.09, 0, sp, 0.005); f.rotation.y = i * 1.1; }
    return sp;
  }
  const addSpin = (mg, sp, x, y, z) => { sp.position.set(x, y, z); mg.add(sp); return bake(sp); };

  /* ---------- TOURS ---------- */
  function tour0(def, G, m, sg, mg, idx) {                       // Ernault 1974 : rouillé, scotché, il fume
    const L = G.len, hx = L / 2, base = P.pine;
    for (const sx of [-1, 1]) { bx(0.8, 0.8, 1.1, base, sx * (hx - 0.5), 0.4, 0, sg, 0.04); rust(sg, 0.8, 0.8, sx * (hx - 0.5), 0.4, 0.56, 3); }
    bx(0.5, 0.05, 1.0, P.wood, hx - 0.5, 0.02, 0, sg, 0.01);                                     // cale en bois sous le pied
    bx(L - 0.4, 0.1, 1.25, P.steelDark, 0, 0.85, 0, sg, 0.03); for (let i = 0; i < 6; i++) { const c = bx(0.18, 0.04, 0.04, P.steel, -hx + 0.8 + i * 0.5, 0.93, 0.3 - (i % 3) * 0.2, sg, 0.005); c.rotation.y = i; }
    bx(L - 0.5, 0.3, 0.55, base, 0.15, 1.05, -0.15, sg, 0.04); rust(sg, L - 0.6, 0.3, 0.15, 1.05, 0.13, 5);
    for (const dz of [-0.35, 0.05]) bx(L - 0.6, 0.04, 0.07, P.steel, 0.15, 1.22, dz, sg, 0.005);
    bx(1.0, 0.95, 1.0, base, -hx + 0.55, 1.55, -0.1, sg, 0.06); rust(sg, 0.9, 0.85, -hx + 0.55, 1.55, 0.41, 4);
    bx(0.3, 1.1, 0.9, P.shutterGreen, -hx + 0.02, 1.5, -0.1, sg, 0.04); tape(sg, -hx - 0.14, 1.6, -0.1, Math.PI / 2);
    for (let i = 0; i < 3; i++) { const lv = bx(0.04, 0.3, 0.04, P.steelDark, -hx + 0.3 + i * 0.25, 1.95, 0.42, sg, 0.01); lv.rotation.x = 0.3; cy(0.05, 0.05, 0.05, P.black, -hx + 0.3 + i * 0.25, 2.1, 0.47, sg, 8); }
    stk('scotch', 0.3, 0.15, -hx + 0.55, 1.75, 0.405, 0, { parent: sg, roll: 0.15 });
    stk('ernault', 0.6, 0.12, -hx + 0.55, 1.35, 0.405, 0, { parent: sg });
    m.spinner = addSpin(mg, chuck(1), -hx + 1.2, 1.6, -0.1);
    bx(0.5, 0.5, 0.45, base, hx - 0.7, 1.45, -0.15, sg, 0.04); { const w2 = cy(0.15, 0.15, 0.04, P.steel, hx - 0.4, 1.5, -0.15, sg, 10); w2.rotation.z = Math.PI / 2; }
    bx(0.7, 0.12, 0.65, P.steelDark, 0.3, 1.27, -0.1, sg, 0.03); bx(0.7, 0.45, 0.1, base, 0.3, 1.05, 0.2, sg, 0.03);
    for (const x of [0.1, 0.5]) { knob(0.13, P.steel, x, 1.05, 0.28, sg); bx(0.03, 0.03, 0.12, P.black, x + 0.1, 1.1, 0.33, sg, 0.005); }
    bx(0.18, 0.16, 0.18, P.steelDark, 0.3, 1.42, 0.0, sg, 0.02); bx(0.04, 0.04, 0.25, P.steel, 0.3, 1.42, -0.15, sg, 0.005);
    cy(0.02, 0.09, 0.18, P.red, hx - 1.1, 1.3, 0.2, sg, 8);                                       // burette d'huile
    gooseLamp(m, sg, mg, -hx + 0.9, 2.03, 0.1);
    for (let i = 0; i < 2; i++) { const o = flat(0.9 + i * 0.4, 0.6, P.black, -0.4 + i * 1.1, 0.5 - i * 0.6, 0.038, sg); o.rotation.z = i; }   // taches d'huile
  }
  function tour1(def, G, m, sg, mg, idx) {                       // Cazeneuve HB 575 : le tour d'école
    const L = G.len, hx = L / 2, body = P.white, acc = P.shutterGreen;
    bx(L - 0.1, 0.8, 1.0, acc, 0, 0.4, -0.05, sg, 0.06); bx(L, 0.1, 1.3, P.steelDark, 0, 0.85, 0, sg, 0.03);
    bx(L - 0.5, 0.32, 0.6, body, 0.15, 1.06, -0.15, sg, 0.05); for (const dz of [-0.38, 0.06]) bx(L - 0.6, 0.04, 0.07, P.steel, 0.15, 1.24, dz, sg, 0.005);
    bx(1.1, 1.0, 1.05, body, -hx + 0.6, 1.6, -0.1, sg, 0.1); bx(1.12, 0.1, 1.07, acc, -hx + 0.6, 2.1, -0.1, sg, 0.03);
    bx(0.8, 0.4, 0.1, acc, -hx + 0.6, 1.05, 0.48, sg, 0.03);                                       // boîte des avances
    for (let i = 0; i < 4; i++) { const lv = bx(0.04, 0.25, 0.04, P.steelDark, -hx + 0.3 + i * 0.2, 1.75, 0.45, sg, 0.01); lv.rotation.x = 0.4; cy(0.045, 0.045, 0.05, i % 2 ? P.red : P.black, -hx + 0.3 + i * 0.2, 1.88, 0.5, sg, 8); }
    stk('cazeneuve', 0.8, 0.15, -hx + 0.6, 1.45, 0.43, 0, { parent: sg });
    m.spinner = addSpin(mg, chuck(1), -hx + 1.25, 1.65, -0.1);
    bx(0.08, 0.5, 0.5, P.lebecYellow, -hx + 1.25, 2.0, 0.05, sg, 0.02);                            // carter de mandrin
    bx(0.55, 0.55, 0.5, body, hx - 0.75, 1.5, -0.15, sg, 0.05); { const w2 = cy(0.16, 0.16, 0.04, P.red, hx - 0.45, 1.55, -0.15, sg, 12); w2.rotation.z = Math.PI / 2; }
    bx(0.75, 0.13, 0.7, P.steelDark, 0.35, 1.29, -0.12, sg, 0.03); bx(0.75, 0.5, 0.1, acc, 0.35, 1.05, 0.22, sg, 0.03);
    knob(0.14, P.red, 0.15, 1.05, 0.3, sg); knob(0.1, P.steel, 0.55, 1.1, 0.3, sg);
    bx(0.2, 0.18, 0.2, P.steelDark, 0.35, 1.45, 0.0, sg, 0.02);
    bx(0.04, 0.6, 0.04, P.steelDark, 0.9, 1.6, 0.45, sg, 0.01); bx(0.42, 0.24, 0.08, P.black, 0.9, 1.95, 0.48, sg, 0.02); stk('dro', 0.38, 0.19, 0.9, 1.95, 0.525, 0, { parent: sg, glow: true });
    { const hz = cy(0.015, 0.015, 0.7, P.orange, -0.2, 1.75, -0.3, sg, 5); hz.rotation.z = 0.6; }
    stk(MSTK[idx % MSTK.length], 0.7, 0.23, 0.5, 1.55, -0.44, Math.PI, { parent: sg });
    signalTower(m, sg, mg, -hx + 0.25, 2.15, -0.45);
  }
  function tour2(def, G, m, sg, mg, idx) {                       // tour CN (look V4)
    const L = G.len, hx = L / 2, px = 0.42 * L;
    for (const sx of [-1, 1]) bx(0.95, 0.85, 1.25, P.machineDark, sx * (hx - 0.55), 0.425, 0, sg, 0.06);
    bx(L - 1.9, 0.6, 1.0, P.slateDark, 0, 0.35, -0.05, sg, 0.04); bx(L - 0.1, 0.14, 1.36, P.steelDark, 0, 0.92, 0, sg, 0.04);
    bx(L - 0.6, 0.02, 0.42, P.water, 0, 0.995, 0, sg, 0.005);
    bx(L - 0.6, 0.34, 0.62, P.machine, 0.2, 1.16, -0.2, sg, 0.06); for (const dz of [-0.42, 0.02]) bx(L - 0.7, 0.05, 0.08, P.steel, 0.2, 1.355, dz, sg, 0.01);
    bx(1.15, 1.05, 1.2, P.lebecBlue, -hx + 0.6, 1.62, -0.05, sg, 0.12); bx(1.19, 0.1, 1.24, P.lebecYellow, -hx + 0.6, 1.98, -0.05, sg, 0.03);
    stk('turn', 0.9, 0.15, -hx + 0.6, 1.4, 0.556, 0, { parent: sg });
    m.spinner = addSpin(mg, chuck(1), -hx + 1.34, 1.75, -0.05);
    bx(0.55, 0.56, 0.5, P.machine, hx - 0.75, 1.67, -0.1, sg, 0.06);
    { const q2 = cy(0.07, 0.07, 0.3, P.steel, hx - 1.15, 1.75, -0.05, sg, 10); q2.rotation.z = Math.PI / 2; const w2 = cy(0.17, 0.17, 0.04, P.red, hx - 0.45, 1.75, -0.05, sg, 14); w2.rotation.z = Math.PI / 2; }
    bx(0.8, 0.14, 0.72, P.machineDark, 0.35, 1.45, -0.15, sg, 0.03); bx(0.8, 0.5, 0.1, P.machine, 0.35, 1.2, 0.2, sg, 0.03); knob(0.14, P.red, 0.1, 1.2, 0.27, sg);
    cy(0.22, 0.22, 0.24, P.steelDark, 0.35, 1.68, 0.38, sg, 8); insert(0.35, 1.7, 0.08, 0.06, sg);
    bx(L - 0.3, 0.95, 0.06, P.machine, 0.15, 1.85, -0.6, sg, 0.02); stk(MSTK[idx % MSTK.length], 0.75, 0.25, 0.95, 2.1, -0.566, 0, { parent: sg });
    for (let k = 0; k < 5; k++) puff(0.035, -0.15 + k * 0.02, 2.12 - k * 0.07, -0.5 + k * 0.08, sg, P.orange);
    bx(L - 0.4, 0.05, 0.05, P.steelDark, 0.1, 2.36, 0.64, sg, 0.01);
    for (const y of [1.42, 2.3]) bx(1.1, 0.06, 0.05, P.lebecYellow, 0.75, y, 0.64, sg, 0.015);
    for (const x of [0.2, 1.3]) bx(0.06, 0.9, 0.05, P.lebecYellow, x, 1.86, 0.64, sg, 0.015);
    { const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.82), glassMachine()); gl.position.set(0.75, 1.86, 0.64); sg.add(gl); }
    bx(0.5, 0.85, 0.22, P.machineDark, px, 1.75, 0.56, sg, 0.05); stk('cnc', 0.38, 0.19, px, 1.95, 0.675, 0, { parent: sg, glow: true });
    knob(0.06, P.red, px - 0.13, 1.52, 0.69, sg); knob(0.035, P.mint, px + 0.02, 1.52, 0.685, sg); knob(0.035, P.lebecYellow, px + 0.14, 1.52, 0.685, sg);
    signalTower(m, sg, mg, px, 2.3, 0.5);
  }
  function tour3(def, G, m, sg, mg, idx, glow) {                 // TwinTurn bi-broche (et version « 4 » lumineuse)
    const L = G.len, hx = L / 2, d = G.d, fz = d / 2 - 0.15, shell = glow ? P.machineDark : P.white, acc = glow ? P.black : P.lebecBlue;
    bx(L, 0.9, d, P.machineDark, 0, 0.45, 0, sg, 0.06);
    bx(L, 1.6, 0.1, shell, 0, 1.7, -d / 2 + 0.05, sg, 0.03);                                      // dos
    for (const sx of [-1, 1]) bx(0.8, 1.6, d - 0.1, shell, sx * (hx - 0.4), 1.7, -0.05, sg, 0.05);   // poupées (gauche / droite)
    bx(L + 0.05, 0.3, d, acc, 0, 2.65, 0, sg, 0.06);                                              // toit
    bx(L - 1.6, 0.35, 0.1, shell, 0, 1.08, fz, sg, 0.02);                                         // bas de porte
    bx(L - 1.6, 0.04, d - 0.3, P.steelDark, 0, 0.92, -0.1, sg, 0.01);                             // fond (copeaux)
    for (const y of [1.28, 2.48]) bx(L - 1.6, 0.08, 0.08, acc, 0, y, fz + 0.05, sg, 0.01);
    for (const x of [-hx + 0.8, 0, hx - 0.8]) bx(0.08, 1.2, 0.08, acc, x, 1.88, fz + 0.05, sg, 0.01);
    { const gl = new THREE.Mesh(new THREE.PlaneGeometry(L - 1.7, 1.15), glassMachine()); gl.position.set(0, 1.88, fz + 0.04); sg.add(gl); }
    m.spinner = addSpin(mg, chuck(1, true), -hx + 0.95, 1.75, -0.15);
    m.spinner2 = addSpin(mg, chuck(-1, true), hx - 0.95, 1.75, -0.15);
    for (const x of [-0.4, 0.4]) { cy(0.24, 0.24, 0.26, P.steelDark, x, 2.2, -0.2, sg, 8); bx(0.3, 0.3, 0.6, P.machine, x, 2.4, -0.4, sg, 0.03); }   // tourelles
    bx(0.6, 1.0, 0.22, P.machineDark, hx - 0.35, 1.75, fz + 0.2, sg, 0.04); stk('cnc', 0.5, 0.36, hx - 0.35, 1.98, fz + 0.32, 0, { parent: sg, glow: true });
    knob(0.06, P.red, hx - 0.5, 1.45, fz + 0.32, sg); knob(0.04, P.mint, hx - 0.25, 1.45, fz + 0.32, sg);
    stk(glow ? 'dmg' : 'twin', 1.6, 0.3, 0, 2.65, d / 2 + 0.01, 0, { parent: sg, glow: !!glow });
    bx(0.7, 0.5, 1.2, P.orange, hx - 0.2, 0.6, -d / 2 - 0.4, sg, 0.04); { const cv = bx(0.5, 0.12, 1.5, P.black, hx - 0.2, 1.05, -d / 2 - 0.4, sg, 0.02); cv.rotation.x = 0.35; }   // convoyeur à copeaux
    if (glow) { for (const y of [0.92, 2.5]) stk('ledM', L - 0.1, 0.06, 0, y, d / 2 + 0.01, 0, { parent: sg, glow: true }); for (const sx of [-1, 1]) stk('ledP', 0.06, 1.5, sx * (hx - 0.82), 1.7, fz + 0.06, 0, { parent: sg, glow: true }); }
    else stk(MSTK[idx % MSTK.length], 0.75, 0.25, -hx + 0.4, 1.9, d / 2 - 0.08, 0, { parent: sg });
    signalTower(m, sg, mg, -hx + 0.3, 2.8, -0.5);
  }
  /* ---------- FRAISEUSES ---------- */
  function fr0(def, G, m, sg, mg, idx, school) {                 // Huré 1968 (rouillée) / Gambin 2M (école)
    const base = school ? P.shutterBlue : P.pine, acc = school ? P.white : P.shutterGreen;
    bx(1.5, 0.3, 1.7, base, 0, 0.15, 0.1, sg, 0.05);
    bx(0.9, 2.3, 0.8, base, 0, 1.45, 0.55, sg, 0.06);
    bx(1.0, 0.55, 0.8, base, 0, 0.95, -0.3, sg, 0.04); bx(0.9, 0.15, 0.6, P.steelDark, 0, 1.3, -0.35, sg, 0.03);
    bx(1.85, 0.12, 0.5, P.steel, 0, 1.43, -0.45, sg, 0.02); for (const z of [-0.58, -0.45, -0.32]) bx(1.8, 0.015, 0.04, P.steelDark, 0, 1.495, z, sg, 0.004);
    bx(0.35, 0.16, 0.25, P.machineDark, 0, 1.57, -0.45, sg, 0.02); bx(0.2, 0.1, 0.2, ML.MATERIALS.alu.color, 0, 1.68, -0.45, sg, 0.01);
    for (const sx of [-1, 1]) { const w2 = cy(0.12, 0.12, 0.04, P.steel, sx * 0.98, 1.43, -0.45, sg, 10); w2.rotation.z = Math.PI / 2; bx(0.03, 0.12, 0.03, P.black, sx * 1.01, 1.5, -0.35, sg, 0.005); }
    knob(0.12, P.steel, 0, 0.95, -0.72, sg);
    bx(0.5, 0.4, 1.5, base, 0, 2.75, 0.15, sg, 0.05);                                             // bélier
    bx(0.55, 0.75, 0.55, base, 0, 2.45, -0.45, sg, 0.05);                                          // tête
    bx(0.5, 0.25, 0.6, acc, 0, 2.95, -0.35, sg, 0.04);                                             // carter de courroie
    { const mo = cy(0.2, 0.2, 0.45, P.machineDark, 0, 2.6, 1.15, sg, 10); mo.rotation.x = Math.PI / 2; }
    m.spinner = addSpin(mg, spindle(0.9), 0, 2.08, -0.45);
    stk(school ? 'gambin' : 'hure', 0.6, 0.12, 0, 2.2, 0.95, 0, { parent: sg }); stk(school ? 'gambin' : 'hure', 0.5, 0.1, 0, 2.6, -0.73, Math.PI, { parent: sg });
    if (school) { bx(0.42, 0.24, 0.08, P.black, 0.62, 1.95, -0.5, sg, 0.02); stk('dro', 0.38, 0.19, 0.62, 1.95, -0.545, Math.PI, { parent: sg, glow: true }); bx(0.04, 0.5, 0.04, P.steelDark, 0.62, 1.7, -0.42, sg, 0.01); signalTower(m, sg, mg, -0.3, 3.05, 0.4); }
    else {
      rust(sg, 0.8, 2.0, 0, 1.45, 0.96, 6); rust(sg, 0.5, 0.6, 0, 2.45, -0.73, 3); tape(sg, 0.26, 2.95, -0.35, Math.PI / 2); tape(sg, 0, 1.0, -0.71, 0);
      stk('scotch', 0.3, 0.15, 0.3, 1.0, -0.715, Math.PI, { parent: sg, roll: -0.12 });
      gooseLamp(m, sg, mg, 0.45, 1.43, 0.15);
      for (let i = 0; i < 2; i++) { const o = flat(0.8, 0.6, P.black, 0.3 - i * 0.6, -0.9 + i * 0.4, 0.038, sg); o.rotation.z = i * 2; }
    }
  }
  function fr2(def, G, m, sg, mg, idx) {                         // fraiseuse CN (look V4)
    bx(2.25, 0.5, 2.25, P.machineDark, 0, 0.25, 0, sg, 0.1);
    bx(2.1, 0.14, 1.4, P.steelDark, 0, 0.57, -0.35, sg, 0.04); bx(1.8, 0.02, 1.1, P.water, 0, 0.645, -0.35, sg, 0.005);
    bx(1.1, 2.9, 0.95, P.machine, 0, 1.95, 0.62, sg, 0.12); bx(1.14, 0.12, 0.99, P.lebecYellow, 0, 3.1, 0.62, sg, 0.03);
    bx(0.95, 0.85, 1.35, P.lebecBlue, 0, 2.95, -0.05, sg, 0.12);
    cy(0.3, 0.3, 0.5, P.machine, 0, 3.62, 0.05, sg, 12); cy(0.32, 0.32, 0.06, P.lebecYellow, 0, 3.9, 0.05, sg, 12);
    stk('mill', 0.8, 0.14, 0, 3.15, -0.73, Math.PI, { parent: sg });
    stk(MSTK[(idx + 2) % MSTK.length], 0.75, 0.25, 0.556, 1.7, 0.62, Math.PI / 2, { parent: sg });
    m.spinner = addSpin(mg, spindle(1), 0, 2.52, -0.3);
    bx(1.0, 0.5, 0.95, P.machine, 0, 0.75, -0.35, sg, 0.06); bx(1.1, 0.16, 0.9, P.machineDark, 0, 1.08, -0.4, sg, 0.03); bx(1.95, 0.16, 0.8, P.steel, 0, 1.24, -0.4, sg, 0.03);
    for (const z of [-0.6, -0.4, -0.2]) bx(1.9, 0.02, 0.05, P.steelDark, 0, 1.325, z, sg, 0.005);
    for (const sx of [-1, 1]) { const w2 = cy(0.13, 0.13, 0.04, P.red, sx * 1.02, 1.24, -0.4, sg, 12); w2.rotation.z = Math.PI / 2; }
    bx(0.55, 0.14, 0.36, P.machineDark, 0, 1.39, -0.4, sg, 0.03); for (const sx of [-1, 1]) bx(0.07, 0.14, 0.36, P.steel, sx * 0.15, 1.53, -0.4, sg, 0.01); bx(0.22, 0.12, 0.3, P.cladding, 0, 1.52, -0.4, sg, 0.02);
    for (let k = 0; k < 5; k++) puff(0.035, 0.32 - k * 0.05, 2.45 - k * 0.1, -0.6 + k * 0.06, sg, P.orange);
    bx(2.1, 0.05, 0.05, P.steelDark, 0, 2.36, -1.08, sg, 0.01);
    for (const y of [0.72, 2.3]) bx(1.0, 0.06, 0.05, P.lebecYellow, -0.5, y, -1.08, sg, 0.015);
    for (const x of [-0.98, -0.02]) bx(0.06, 1.6, 0.05, P.lebecYellow, x, 1.51, -1.08, sg, 0.015);
    { const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.52), glassMachine()); gl.position.set(-0.5, 1.51, -1.08); sg.add(gl); }
    bx(0.08, 0.08, 0.6, P.steelDark, 0.78, 2.0, -0.62, sg, 0.01); bx(0.55, 0.8, 0.2, P.machineDark, 0.78, 1.75, -1.0, sg, 0.05);
    stk('cnc', 0.4, 0.2, 0.78, 1.93, -1.106, Math.PI, { parent: sg, glow: true });
    for (const [r, c, dx] of [[0.06, P.red, 0.14], [0.035, P.mint, -0.02], [0.035, P.lebecYellow, -0.15]]) knob(r, c, 0.78 + dx, 1.52, -1.115, sg);
    signalTower(m, sg, mg, 0.78, 2.27, -1.0);
  }
  function fr3(def, G, m, sg, mg, idx, glow) {                   // VM-40 (centre vertical) / DMG 5 axes (glow)
    const s = G.s, h = s / 2, shell = glow ? P.machineDark : P.white, acc = glow ? P.black : P.lebecBlue, fz = -h + 0.12, top = glow ? 3.0 : 2.8;
    bx(s, 0.7, s, P.machineDark, 0, 0.35, 0, sg, 0.08);
    bx(s, top - 0.7, 0.12, shell, 0, (top + 0.7) / 2, h - 0.06, sg, 0.03);                         // dos
    for (const sx of [-1, 1]) bx(0.12, top - 0.7, s - 0.1, shell, sx * (h - 0.06), (top + 0.7) / 2, 0, sg, 0.03);
    bx(s + 0.05, 0.3, s + 0.05, acc, 0, top + 0.1, 0, sg, 0.06);
    bx(s - 0.2, 0.3, 0.1, shell, 0, 0.85, fz, sg, 0.02);                                           // bas de porte
    for (const y of [1.0, top - 0.1]) bx(s - 0.2, 0.08, 0.08, acc, 0, y, fz - 0.04, sg, 0.01);
    for (const x of [-h + 0.12, 0, h - 0.12]) bx(0.08, top - 1.1, 0.08, acc, x, (top + 0.9) / 2, fz - 0.04, sg, 0.01);
    { const gl = new THREE.Mesh(new THREE.PlaneGeometry(s - 0.3, top - 1.15), glassMachine()); gl.position.set(0, (top + 0.95) / 2, fz - 0.03); gl.rotation.y = Math.PI; sg.add(gl); }
    bx(0.8, top - 0.9, 0.6, P.machine, 0, (top + 0.7) / 2 + 0.1, h - 0.45, sg, 0.06);               // colonne intérieure
    bx(0.6, 0.6, 0.9, glow ? P.steelDark : P.lebecBlue, 0, top - 0.6, 0.0, sg, 0.06);               // tête
    if (glow) {                                                                                     // berceau 5 axes (2e mobile : plateau tournant)
      for (const sx of [-1, 1]) bx(0.2, 0.6, 0.8, P.steelDark, sx * 0.8, 1.1, -0.2, sg, 0.03); bx(1.4, 0.15, 0.7, P.steelDark, 0, 0.95, -0.2, sg, 0.03);
      const tb = new THREE.Group(); cy(0.42, 0.42, 0.12, P.steel, 0, 0, 0, tb, 18); for (let i = 0; i < 4; i++) bx(0.7, 0.02, 0.04, P.steelDark, 0, 0.065, 0, tb, 0.005).rotation.y = i * Math.PI / 4; bx(0.25, 0.25, 0.25, ML.MATERIALS.inox.color, 0.1, 0.18, 0, tb, 0.03);
      m.spinner2 = addSpin(mg, tb, 0, 1.15, -0.2);
    } else { bx(1.6, 0.14, 0.8, P.steel, 0, 1.15, -0.2, sg, 0.02); bx(0.35, 0.16, 0.25, P.machineDark, 0, 1.3, -0.2, sg, 0.02); bx(0.2, 0.1, 0.2, ML.MATERIALS.alu.color, 0, 1.42, -0.2, sg, 0.01); }
    m.spinner = addSpin(mg, spindle(1.1), 0, top - 0.95, -0.15);
    // changeur d'outils (carrousel sur le côté gauche)
    { const cx2 = -h - 0.05; const dk = cy(0.6, 0.6, 0.16, glow ? P.black : P.machine, cx2, top - 0.9, 0.2, sg, 16); dk.rotation.z = Math.PI / 2; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; cy(0.05, 0.05, 0.2, ML.TOOLS.fraise.color, cx2 - 0.12, top - 0.9 + Math.cos(a) * 0.48, 0.2 + Math.sin(a) * 0.48, sg, 6).rotation.z = Math.PI / 2; } }
    // pupitre
    bx(0.7, 1.1, 0.24, P.machineDark, h - 0.2, 1.65, fz - 0.25, sg, 0.04); stk('cnc', glow ? 0.62 : 0.5, glow ? 0.5 : 0.36, h - 0.2, 1.9, fz - 0.375, Math.PI, { parent: sg, glow: true });
    knob(0.06, P.red, h - 0.35, 1.32, fz - 0.38, sg); knob(0.04, P.mint, h - 0.1, 1.32, fz - 0.38, sg);
    stk(glow ? 'dmg' : 'vm', 1.6, 0.3, 0, top + 0.1, fz - 0.07, Math.PI, { parent: sg, glow: !!glow });
    if (glow) { for (const y of [0.72, top - 0.08]) stk('ledM', s - 0.2, 0.06, 0, y, fz - 0.09, Math.PI, { parent: sg, glow: true }); for (const sx of [-1, 1]) stk('ledP', 0.06, top - 1.1, sx * (h - 0.13), (top + 0.9) / 2, fz - 0.09, Math.PI, { parent: sg, glow: true }); stk('ledP', s, 0.08, 0, 0.72, h + 0.01, 0, { parent: sg, glow: true }); bx(0.6, top + 0.3, 0.6, P.black, h - 0.4, (top + 0.3) / 2, h + 0.35, sg, 0.04); stk('ledM', 0.06, top, h - 0.09, (top + 0.3) / 2, h + 0.66, 0, { parent: sg, glow: true }); }
    else stk(MSTK[(idx + 1) % MSTK.length], 0.75, 0.25, h + 0.01, 1.6, 0.2, Math.PI / 2, { parent: sg });
    signalTower(m, sg, mg, h - 0.25, top + 0.25, h - 0.3);
  }

  /* =====================================================================
     API MACHINES
     ===================================================================== */
  const mkey = d => [d.id, d.x, d.z, d.rot | 0, d.model || d.type, d.type, d.tier, d.len].join('|');
  const hashId = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  /** construit le modèle (statique cuit + parties mobiles) dans mg, renvoie m */
  function buildModel(def, m, mg, idx, ghost) {
    const G = mgeom(def), sg = new THREE.Group(); mg.add(sg);
    const saveRnd = rnd; rnd = U.rng(hashId(def.id) + 3);
    if (G.fr) { if (G.tier <= 1) fr0(def, G, m, sg, mg, idx, G.tier === 1); else if (G.tier === 2) fr2(def, G, m, sg, mg, idx); else fr3(def, G, m, sg, mg, idx, G.tier >= 4); }
    else { if (G.tier === 0) tour0(def, G, m, sg, mg, idx); else if (G.tier === 1) tour1(def, G, m, sg, mg, idx); else if (G.tier === 2) tour2(def, G, m, sg, mg, idx); else tour3(def, G, m, sg, mg, idx, G.tier >= 4); }
    if (!ghost) {
      // zone peinte au sol + alimentation (câble du plafond ou rallonge qui traîne)
      const r = G.rect, zx = (r[0] + r[1]) / 2 - (G.fr ? 0.2 : 0.35), zz = (r[2] + r[3]) / 2 + (G.fr ? 0.2 : -0.3);
      if (G.tier >= 1) bx(r[1] - r[0] + 0.3, 0.02, r[3] - r[2] - 0.6, G.tier >= 4 ? P.slateDark : G.tier === 1 ? P.granite2 : P.shutterGreen, zx, 0.045, zz, sg, 0.01);
      const ceil = W._ceil || 7, cx = G.fr ? 0.2 : -G.len / 2 + 0.6, cz = G.fr ? (G.s / 2 - 0.2) : -G.d / 2 + 0.15, top = G.fr ? (G.tier >= 3 ? 3.2 : 3.4) : (G.tier >= 3 ? 2.9 : 2.2);
      if ((W._at && W._at.lvl >= 2) && ceil - top > 0.3) { cy(0.045, 0.045, ceil - top, P.black, cx, (ceil + top) / 2, cz, sg, 6); bx(0.3, 0.08, 0.3, P.steel, cx, ceil - 0.05, cz, sg, 0.01); }
      else cord([[cx, cz - 0.1], [cx - 0.4, cz - 0.9], [cx - 1.4, cz - 1.3], [cx - 2.4, cz - 1.0]], sg);
    }
    rnd = saveRnd;
    return { G, sg };
  }
  W.addMachine = def => {
    if (!W.root) return null;
    if (W.machines[def.id]) W.removeMachine(def.id);
    root = W.root;
    const rot = def.rot | 0, mg = new THREE.Group(); mg.position.set(def.x, 0, def.z); mg.rotation.y = rot * Q; root.add(mg);
    const m = { def, group: mg, lightMat: new THREE.MeshToonMaterial({ color: P.steelDark, emissive: 0x000000, gradientMap: ST.gradient }) };
    const idx = hashId(def.id) % 7;
    const { G, sg } = buildModel(def, m, mg, idx, false);
    m.static = bake(sg);
    // fumée (panne ; petit filet quand la vieille machine tourne)
    { const sm = new THREE.Group(); sm.position.set(0, 3.2, 0);
      puff(0.32, 0, 0, 0, sm, P.steelDark); puff(0.24, 0.28, 0.12, 0.05, sm, P.steelDark); puff(0.22, -0.25, 0.08, -0.08, sm, P.steelDark); puff(0.2, 0.05, 0.3, 0.1, sm, P.steelDark);
      mg.add(sm); m.smoke = bake(sm); m.smoke.visible = false; }
    m.label = U.label(def.id, { size: 0.4 }); m.label.position.set(0, G.lab, 0); mg.add(m.label);
    m.tier = G.tier;
    // collider, poste de l'opérateur, bac à copeaux, cibles
    const a = rotPt(def.x, def.z, rot, -G.col[0] / 2, -G.col[1] / 2), b = rotPt(def.x, def.z, rot, G.col[0] / 2, G.col[1] / 2);
    m.collider = U.addCollider(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z), 'machine');
    const st = rotPt(def.x, def.z, rot, G.station[0], G.station[1]);
    m.station = { x: st.x, z: st.z, yaw: G.station[2] + rot * Q };
    const ch = rotPt(def.x, def.z, rot, G.chips[0], G.chips[1]); m.chips = { x: ch.x, z: ch.z };
    const tg = rotPt(def.x, def.z, rot, G.tgt[0], G.tgt[1]);
    W.targets.push({ id: 'mach:' + def.id, x: tg.x, y: 1.2, z: tg.z, r: 2.6 });
    W.targets.push({ id: 'bac:' + def.id, x: m.chips.x, y: 0.5, z: m.chips.z, r: 1.9 });
    W.machines[def.id] = m;
    return m;
  };
  W.removeMachine = id => {
    const m = W.machines[id]; if (!m) return;
    if (m.group.parent) m.group.parent.remove(m.group);
    m.group.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.isSprite && o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    m.lightMat.dispose();
    if (m.collider) U.removeCollider(m.collider);
    for (let i = W.targets.length - 1; i >= 0; i--) { const t = W.targets[i].id; if (t === 'mach:' + id || t === 'bac:' + id) W.targets.splice(i, 1); }
    delete W.machines[id];
  };
  W.syncMachines = defs => {
    const want = {}; for (const d of defs || []) want[d.id] = d;
    for (const id of Object.keys(W.machines)) { const d = want[id], m = W.machines[id]; if (!d || mkey(d) !== mkey(m.def)) W.removeMachine(id); else m.def = d; }
    for (const d of defs || []) if (!W.machines[d.id]) W.addMachine(d);
  };
  /* ---------- fantôme de placement ---------- */
  const ghostGeo = {};
  W.machineGhost = (def, ok) => {
    let gh = W._ghost;
    if (gh && gh.root !== W.root) { gh = W._ghost = null; }
    if (!def) { if (gh) gh.group.visible = gh.outline.visible = false; return; }
    if (!gh) {
      const mOk = ST.toon(P.mint, P.mint, { transparent: true, opacity: 0.42, key: 'fantomeOk' }), mNo = ST.toon(P.red, P.red, { transparent: true, opacity: 0.42, key: 'fantomeNon' });
      mOk.depthWrite = mNo.depthWrite = false;
      const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BufferGeometry(), mOk); mesh.renderOrder = 5; group.add(mesh);
      const outline = new THREE.Group(), bars = [];
      for (let i = 0; i < 4; i++) { const b2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), mOk); b2.renderOrder = 5; outline.add(b2); bars.push(b2); }
      W.root.add(group); W.root.add(outline);
      gh = W._ghost = { root: W.root, group, mesh, outline, bars, mOk, mNo, key: null };
    }
    const k = [def.model || def.type, def.type, def.tier, def.len].join('|');
    if (gh.key !== k) {
      if (!ghostGeo[k]) { const tmp = new THREE.Group(), mm = { lightMat: ST.toon(P.white) }; buildModel(Object.assign({}, def, { id: 'fantome' }), mm, tmp, 0, true); ghostGeo[k] = flatGeo(tmp); ghostGeo[k].userData.shared = true; tmp.traverse(o => { if (o.geometry && o.geometry !== ghostGeo[k]) o.geometry.dispose(); }); }
      gh.mesh.geometry = ghostGeo[k]; gh.key = k;
    }
    const mat = ok ? gh.mOk : gh.mNo;
    gh.mesh.material = mat; gh.group.visible = gh.outline.visible = true;
    gh.group.position.set(def.x, 0.02, def.z); gh.group.rotation.y = (def.rot | 0) * Q;
    const f = W.machineFootprint(def), w = f.maxX - f.minX, d = f.maxZ - f.minZ, cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2;
    const set = (b2, x, z, sx, sz) => { b2.position.set(x, 0.07, z); b2.scale.set(sx, 1, sz); b2.material = mat; };
    set(gh.bars[0], cx, f.minZ, w, 0.08); set(gh.bars[1], cx, f.maxZ, w, 0.08); set(gh.bars[2], f.minX, cz, 0.08, d); set(gh.bars[3], f.maxX, cz, 0.08, d);
  };

  /** Construit les machines de ML.MACHINES (après la cuisson du décor) */
  W.machinesBuild = () => {
    ensureStat();
    stat = bake(stat); stat = null;
    let list = ML.MACHINES;
    // outil de test : #lvl=4&demo → toutes les gammes de machines dans l'atelier du menu
    if (/[#&]demo/.test(location.hash || '') && !(ML.Game && ML.Game.on) && ML.Career) list = Object.keys(ML.CAREER.MACHINES).map((k, i) => ML.Career.machineDef({ uid: 'D' + i, model: k, x: -15 + (i % 4) * 9, z: i < 4 ? -12 : -2, rot: 0 }));
    for (const def of list) { if (def.upgrade && !W.up[def.upgrade]) continue; W.addMachine(def); }
  };

  /* =====================================================================
     TUYAUX D'AIR (voir le bloc en tête de fichier)
     ===================================================================== */
  W.HOSE_LEN = 14;
  const HSEG = 32, HRAD = 6, HR = 0.035;
  function hoseMesh() {
    const n = (HSEG + 1) * HRAD, idx = [];
    for (let i = 0; i < HSEG; i++) for (let j = 0; j < HRAD; j++) {
      const a = i * HRAD + j, b = i * HRAD + (j + 1) % HRAD, c = (i + 1) * HRAD + (j + 1) % HRAD, d = (i + 1) * HRAD + j;
      idx.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, ST.toon(P.red, 0, { side: THREE.DoubleSide, key: 'tuyauAir' }));
    m.frustumCulled = false; m.visible = false; m.castShadow = true; m.userData.keep = true;
    return m;
  }
  const _pts = []; for (let i = 0; i <= HSEG; i++) _pts.push(new THREE.Vector3());
  const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function shapeHose(mesh, A, B) {
    const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, D = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const L = Math.min(W.HOSE_LEN, D * 1.08 + 0.8);
    const sag = L > D ? Math.sqrt(3 * D * (L - D) / 8) : 0;
    const hl = Math.hypot(dx, dz);
    let sx = 1, sz = 0; if (hl > 0.3) { sx = -dz / hl; sz = dx / hl; if (sx < 0) { sx = -sx; sz = -sz; } }
    const side = sag * 0.45 * Math.max(0, 1 - hl / 3);
    for (let i = 0; i <= HSEG; i++) {
      const s = i / HSEG, bulge = Math.sin(Math.PI * s);
      _pts[i].set(A.x + dx * s + sx * side * bulge, Math.max(HR + 0.012, A.y + dy * s - 4 * sag * s * (1 - s)), A.z + dz * s + sz * side * bulge);
    }
    const pa = mesh.geometry.attributes.position, na = mesh.geometry.attributes.normal, p = pa.array, nn = na.array;
    for (let i = 0; i <= HSEG; i++) {
      _t.subVectors(_pts[Math.min(HSEG, i + 1)], _pts[Math.max(0, i - 1)]).normalize();
      _n.crossVectors(_t, _up); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0); _n.normalize();
      _b.crossVectors(_n, _t).normalize();
      for (let j = 0; j < HRAD; j++) {
        const a = (j / HRAD) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = (i * HRAD + j) * 3;
        const nx = c * _n.x + s * _b.x, ny = c * _n.y + s * _b.y, nz = c * _n.z + s * _b.z;
        nn[k] = nx; nn[k + 1] = ny; nn[k + 2] = nz;
        p[k] = _pts[i].x + nx * HR; p[k + 1] = _pts[i].y + ny * HR; p[k + 2] = _pts[i].z + nz * HR;
      }
    }
    pa.needsUpdate = true; na.needsUpdate = true; mesh.visible = true;
  }
  W.updateHoses = list => {
    const reels = W.hoseReels || [], hoses = W._hoses || [], res = [];
    list = list || [];
    for (let i = 0; i < list.length; i++) res.push(-1);
    if (!hoses.length) return res;
    const pairs = [];
    for (let i = 0; i < list.length; i++) if (list[i]) for (let r = 0; r < reels.length; r++) { const q = list[i], e = reels[r]; pairs.push([(q.x - e.x) ** 2 + (q.z - e.z) ** 2 + ((q.y || 0) - e.y) ** 2, i, r]); }
    pairs.sort((a, b) => a[0] - b[0]);
    const usedR = [];
    for (const [, i, r] of pairs) { if (res[i] >= 0 || usedR[r]) continue; res[i] = r; usedR[r] = true; }
    for (let r = 0; r < hoses.length; r++) hoses[r].visible = false;
    for (let i = 0; i < list.length; i++) if (res[i] >= 0) { const q = list[i]; shapeHose(hoses[res[i]], reels[res[i]], { x: q.x, y: q.y || 0, z: q.z }); }
    return res;
  };

  /* =====================================================================
     ANIMATIONS ET VOYANTS
     ===================================================================== */
  /** néon qui clignote, gouttes de la fuite, pont roulant, robot */
  W.updateAtelier = dt => {
    dt = Math.min(0.1, dt || 0.016);
    const t = performance.now() / 1000;
    if (W._flickMat) {
      const on = W._power !== false && !(Math.sin(t * 13) > 0.6 && Math.sin(t * 3.1) > 0.2) && !(t % 7 > 6.4);
      W._flickMat.emissive.setHex(on ? P.mark : 0x000000); W._flickMat.color.setHex(on ? P.white : P.steelDark);
    }
    const D = W._drip; if (D) { D.t += dt; const k = (D.t % 1.3) / 1.3; D.mesh.position.y = D.y0 - (D.y0 - D.y1) * k * k; D.mesh.visible = k < 0.97; }
    const C = W._crane; if (C) { C.t += dt; C.mesh.position.z = (C.z0 + C.z1) / 2 + (C.z1 - C.z0) / 2 * Math.sin(C.t * 0.12); }
    const R = W._robot; if (R) { R.t += dt; R.j1.rotation.y = Math.sin(R.t * 0.7) * 1.4; R.j2.rotation.z = -0.5 + Math.sin(R.t * 1.1) * 0.35; R.j3.rotation.z = 1.2 + Math.sin(R.t * 1.3 + 1) * 0.5; }
  };
  const LIGHT_COL = { idle: P.steelDark, wait: P.orange, run: P.mint, stop: P.lebecYellow, panne: P.red, usure: P.orange, off: P.black };
  W.updateVisuals = (dt, S, rt) => {
    W.updateAtelier(dt);
    if (!S) return;
    const t = performance.now() / 1000;
    for (const id in W.machines) {
      const m = W.machines[id], st = S.machines[id] || {}, j = st.job, opId = st.op, op = ML.PEOPLE[opId] || { name: '?' };
      const status = st.status || 'idle';
      const col = LIGHT_COL[status] === undefined ? P.steelDark : LIGHT_COL[status];
      const blink = (status === 'panne' || status === 'usure') && Math.floor(t * 3) % 2;
      m.lightMat.color.setHex(col); m.lightMat.emissive.setHex(status === 'idle' || status === 'off' || blink ? 0x111111 : col).multiplyScalar(0.6);
      if (status === 'run') {
        if (m.def.type === 'fraiseuse') { m.spinner.rotation.y += dt * 25; if (m.spinner2) m.spinner2.rotation.y += dt * 1.2; }
        else { m.spinner.rotation.x += dt * 25; if (m.spinner2) m.spinner2.rotation.x -= dt * 25; }
      }
      const fume = m.tier === 0 && status === 'run';
      m.smoke.visible = status === 'panne' || fume;
      if (m.smoke.visible) { const k = (t * (fume ? 0.6 : 1)) % 1; m.smoke.position.y = (fume ? 2.3 : 3) + k * 1.5; m.smoke.scale.setScalar(fume ? 0.25 + k * 0.4 : 0.6 + k); }
      const nm = opId && opId.startsWith('app') && S.appNames ? S.appNames[opId] : op.name.split(' ')[0];
      let txt = `${id} ${ML.MTYPE[m.def.type]} · ${nm}`;
      if (status === 'panne') txt = `${id} EN PANNE : clé à molette !`;
      else if (status === 'off') txt = `${id} · plus de courant`;
      else if (status === 'usure') txt = `${id} · outil usé : ${ML.TOOLS[j ? j.need : 'plaquette'].label} neuve !`;
      else if (j) txt = `${id} · #${j.oid} ` + (!j.tool ? `→ ${ML.TOOLS[j.need].label} ?` : `${Math.floor(100 * j.prog / j.total)}%` + (status === 'stop' ? ' · opérateur absent !' : ''));
      m.label.setText(txt, status === 'run' ? '#9dffb8' : status === 'idle' ? '#dddddd' : status === 'stop' || status === 'panne' ? '#ff9f9f' : '#ffd27a');
    }
    for (const k in W.rackLabels) { const n = S.stock[k] || 0; (W.rackBars[k] || []).forEach(r => (r.mesh.count = Math.max(0, Math.min(r.cap, n - r.off)))); W.rackLabels[k].setText(`${ML.MATERIALS[k].label} : ${n}`, n ? '#fff' : '#ff6b6b'); }
    for (const k in W.drawerLabels) { const n = S.stock[k]; W.drawerLabels[k].setText(`${ML.TOOLS[k].label} : ${n}`, n ? '#fff' : '#ff6b6b'); }
    for (const L of W.lights) { const g = W.lightGreen(L.node, 0, rt || 0); L.red.material = g ? W.lightOff : W.lightRed; L.green.material = g ? W.lightGreenMat : W.lightOff; }
    for (const r of W.radars) { r.flash = Math.max(0, (r.flash || 0) - dt); r.lamp.material = r.flash > 0 ? W.flashOn : W.flashOff; }
  };
  W.lightGreen = (node, p, rt) => ((Math.floor((rt + node * 3.7) / 9) % 2) === 0) === (p === 0);
  W.setPower = on => {
    W._power = !!on;
    (W.inLights || []).forEach(l => { l.intensity = on ? (l === W.inLights[0] ? 0.35 : 0.25) : 0; });
    if (W.neonMat) { W.neonMat.emissive.setHex(on ? P.mark : 0x000000); W.neonMat.color.setHex(on ? P.white : P.steelDark); }
    if (W.panelLight) W.panelLight.material = U.mat(on ? P.mint : P.red, on ? P.mint : P.red);
  };
})();
