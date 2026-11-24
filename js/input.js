/* =====================================================================
   input.js — Clavier (codes physiques : ZQSD en AZERTY = WASD en QWERTY),
   souris et verrouillage du pointeur.
   ===================================================================== */
(function () {
  const I = ML.Input = { keys: {}, _p: {}, mdx: 0, mdy: 0, wheel: 0, left: false, right: false, locked: false, canvas: null };

  I.init = canvas => {
    I.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) I._p[e.code] = true;
      I.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { I.keys[e.code] = false; });
    window.addEventListener('blur', () => { I.keys = {}; });
    document.addEventListener('mousemove', e => { if (I.locked) { I.mdx += e.movementX || 0; I.mdy += e.movementY || 0; } });
    document.addEventListener('mousedown', e => { if (!I.locked) return; if (e.button === 0) I.left = true; if (e.button === 2) I.right = true; });
    document.addEventListener('contextmenu', e => { if (ML.Game && ML.Game.on) e.preventDefault(); });
    document.addEventListener('wheel', e => { if (I.locked) I.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      I.locked = document.pointerLockElement === canvas || ML.debug;
      if (ML.Game && ML.Game.on) ML.HUD.showPause(!I.locked && !ML.ui.modal);
    });
    if (ML.debug) I.locked = true;
  };
  I.lock = () => {
    if (ML.debug) { I.locked = true; ML.HUD.showPause(false); return; }
    try { const p = I.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refusé */ }
    setTimeout(() => { if (!I.locked && !ML.ui.modal && ML.Game.on) ML.HUD.showPause(true); }, 400);
  };
  I.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); if (!ML.debug) I.locked = false; };
  I.pressed = c => !!I._p[c];
  I.down = c => !!I.keys[c];
  I.endFrame = () => { I._p = {}; I.mdx = 0; I.mdy = 0; I.wheel = 0; I.left = false; I.right = false; };
  ML.ui = { modal: null };
})();
