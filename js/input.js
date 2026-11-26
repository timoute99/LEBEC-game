/* =====================================================================
   input.js — Clavier (codes physiques : ZQSD en AZERTY = WASD en QWERTY),
   souris, verrouillage du pointeur ET MANETTE (Xbox / PlayStation).
   La manette est traduite en « touches virtuelles » : le reste du jeu
   ne fait pas la différence.
     Stick G : bouger · Stick D : regarder · A/✕ : sauter · X/□ : interagir (E)
     B/○ : poser (G) · Y/△ : main suivante · RB/R1 : action (clic G)
     LB/L1 : lancer (clic D) · RT/LT : accélérer/freiner · L3 : courir
     R3 : klaxon · Start : aide · Select : vue voiture · Croix : ping/émotes
   ===================================================================== */
(function () {
  const I = ML.Input = { keys: {}, _p: {}, mdx: 0, mdy: 0, wheel: 0, left: false, right: false, leftDown: false, locked: false, canvas: null, pad: null, padActive: false, padAxes: { x: 0, y: 0, thr: 0, brk: 0 } };
  const PADMAP = { 0: 'Space', 2: 'KeyE', 1: 'KeyG', 9: 'Tab', 8: 'KeyV', 10: 'ShiftLeft', 11: 'KeyH', 12: 'KeyT', 15: 'Digit4', 13: 'Digit5', 14: 'Digit6' };
  let prevBtn = [];

  I.init = canvas => {
    I.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) I._p[e.code] = true;
      I.keys[e.code] = true; I.padActive = false;
    });
    window.addEventListener('keyup', e => { I.keys[e.code] = false; });
    window.addEventListener('blur', () => { I.keys = {}; I.leftDown = false; });
    document.addEventListener('mousemove', e => { if (I.locked) { I.mdx += e.movementX || 0; I.mdy += e.movementY || 0; } });
    document.addEventListener('mousedown', e => { if (!I.locked) return; if (e.button === 0) { I.left = true; I.leftDown = true; } if (e.button === 2) I.right = true; });
    document.addEventListener('mouseup', e => { if (e.button === 0) I.leftDown = false; });
    document.addEventListener('contextmenu', e => { if (ML.Game && ML.Game.on) e.preventDefault(); });
    document.addEventListener('wheel', e => { if (I.locked) I.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      I.locked = document.pointerLockElement === canvas || ML.debug;
      if (ML.Game && ML.Game.on) ML.HUD.showPause(!I.active() && !ML.ui.modal);
    });
    window.addEventListener('gamepadconnected', e => { if (ML.HUD && ML.HUD.toast) ML.HUD.toast('🎮 Manette détectée : ' + e.gamepad.id.slice(0, 40)); });
    if (ML.debug) I.locked = true;
  };
  /** Le joueur peut-il agir ? (souris capturée OU manette utilisée) */
  I.active = () => I.locked || I.padActive;
  I.lock = () => {
    if (ML.debug) { I.locked = true; ML.HUD.showPause(false); return; }
    if (I.padActive) { ML.HUD.showPause(false); return; }
    try { const p = I.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refusé */ }
    setTimeout(() => { if (!I.active() && !ML.ui.modal && ML.Game.on) ML.HUD.showPause(true); }, 400);
  };
  I.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); if (!ML.debug) I.locked = false; };
  I.pressed = c => !!I._p[c];
  I.down = c => !!I.keys[c] || !!(I.pad && I.pad[c]);

  /** Lecture de la manette (appelée à chaque image, avant le jeu) */
  I.pollPad = dt => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(p => p && p.connected);
    I.pad = null; I.padAxes = { x: 0, y: 0, thr: 0, brk: 0 };
    if (!gp) return;
    const dz = v => (Math.abs(v) < 0.18 ? 0 : v), b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
    const ax = dz(gp.axes[0] || 0), ay = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const any = ax || ay || rx || ry || gp.buttons.some(x => x.pressed);
    if (any && !I.padActive) { I.padActive = true; if (ML.Game && ML.Game.on && !ML.ui.modal) ML.HUD.showPause(false); }
    if (!I.padActive) return;
    const v = {};
    for (const k in PADMAP) if (b(+k)) { v[PADMAP[k]] = true; if (!prevBtn[k]) I._p[PADMAP[k]] = true; }
    if (b(5)) { I.leftDown = true; if (!prevBtn[5]) I.left = true; } else if (prevBtn[5]) I.leftDown = false;
    if (b(4) && !prevBtn[4]) I.right = true;
    if (b(3) && !prevBtn[3]) I.wheel += 1;
    if (ay < -0.3) v.KeyW = true; if (ay > 0.3) v.KeyS = true; if (ax < -0.3) v.KeyA = true; if (ax > 0.3) v.KeyD = true;
    I.padAxes = { x: ax, y: ay, thr: gp.buttons[7] ? gp.buttons[7].value : 0, brk: gp.buttons[6] ? gp.buttons[6].value : 0 };
    if (I.padAxes.thr > 0.15) v.KeyW = true; if (I.padAxes.brk > 0.15) v.KeyS = true;
    I.mdx += rx * 900 * dt; I.mdy += ry * 650 * dt;
    // dans les menus/dialogues : A = choix 1, B = fermer
    if (ML.ui.modal === 'dialogue' || ML.ui.modal === 'mini') { if (b(0) && !prevBtn[0]) I._p.Digit1 = true; if (b(2) && !prevBtn[2]) I._p.Digit2 = true; if (b(3) && !prevBtn[3]) I._p.Digit3 = true; if (b(1) && !prevBtn[1]) I._p.Escape = true; }
    I.pad = v;
    prevBtn = gp.buttons.map(x => x.pressed || x.value > 0.4);
  };
  I.endFrame = () => { I._p = {}; I.mdx = 0; I.mdy = 0; I.wheel = 0; I.left = false; I.right = false; };
  ML.ui = { modal: null };
})();
