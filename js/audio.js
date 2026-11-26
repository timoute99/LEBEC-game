/* =====================================================================
   audio.js — Bruitages synthétisés (WebAudio) + voix (speechSynthesis).
   ML.Sfx.play(nom) ou ML.Sfx.at(nom, x, z) (volume selon la distance).
   ===================================================================== */
(function () {
  const S = ML.Sfx = { ctx: null, muted: false, engine: null, lastSpeak: 0 };

  S.init = () => {
    if (S.ctx) return;
    try { S.ctx = new (window.AudioContext || window.webkitAudioContext)(); S.master = S.ctx.createGain(); S.master.gain.value = 0.5; S.master.connect(S.ctx.destination); }
    catch (e) { S.ctx = null; }
  };
  function tone(f, dur, type, vol, slide) {
    if (!S.ctx || S.muted) return;
    const t = S.ctx.currentTime, o = S.ctx.createOscillator(), g = S.ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(S.master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (!S.ctx || S.muted) return;
    const n = Math.floor(S.ctx.sampleRate * dur), buf = S.ctx.createBuffer(1, n, S.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = S.ctx.createBufferSource(); src.buffer = buf;
    const f = S.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = S.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(S.master); src.start();
  }
  const SOUNDS = {
    punch: v => { noise(0.12, 0.6 * v, 600); tone(120, 0.12, 'sine', 0.4 * v, 60); },
    whoosh: v => noise(0.18, 0.15 * v, 2500),
    clang: v => { tone(880, 0.25, 'triangle', 0.18 * v, 620); tone(1320, 0.18, 'triangle', 0.1 * v); },
    bong: v => { tone(180, 0.6, 'triangle', 0.5 * v, 90); noise(0.2, 0.5 * v, 400); },
    pickup: v => { tone(660, 0.06, 'square', 0.08 * v); setTimeout(() => tone(990, 0.06, 'square', 0.08 * v), 60); },
    drop: v => tone(220, 0.08, 'square', 0.08 * v, 140),
    error: v => tone(160, 0.25, 'sawtooth', 0.12 * v),
    success: v => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.08 * v), i * 90)),
    order: v => [784, 988].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.12 * v), i * 110)),
    cash: v => [880, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.14 * v), i * 70)),
    fail: v => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sawtooth', 0.1 * v), i * 140)),
    find: v => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.14 * v), i * 80)),
    horn: v => { tone(410, 0.35, 'square', 0.15 * v); tone(520, 0.35, 'square', 0.12 * v); },
    bip: v => tone(1200, 0.05, 'square', 0.05 * v),
    fire: v => { noise(0.5, 0.25 * v, 900); setTimeout(() => noise(0.2, 0.2 * v, 1500), 200); },
    dog: v => { tone(260, 0.12, 'sawtooth', 0.18 * v, 180); setTimeout(() => tone(240, 0.14, 'sawtooth', 0.18 * v, 160), 170); },
    pigeon: v => { tone(420, 0.12, 'sine', 0.15 * v, 360); setTimeout(() => tone(400, 0.18, 'sine', 0.15 * v, 330), 160); },
    blow: v => noise(0.35, 0.3 * v, 5000),
    slip: v => tone(900, 0.45, 'sine', 0.15 * v, 180),
    siren: v => { tone(700, 0.3, 'square', 0.07 * v); setTimeout(() => tone(950, 0.3, 'square', 0.07 * v), 300); },
    flash: v => { noise(0.05, 0.4 * v, 8000); tone(2000, 0.08, 'sine', 0.1 * v); },
    emote: v => tone(880, 0.08, 'triangle', 0.08 * v, 1320),
    thunder: v => { noise(1.6, 0.55 * v, 180); setTimeout(() => noise(1.1, 0.35 * v, 120), 350); },
    jail: v => { tone(140, 0.4, 'square', 0.18 * v, 90); setTimeout(() => tone(110, 0.5, 'square', 0.16 * v, 70), 300); },
    // V5.2
    boom: v => { noise(1.4, 0.9 * v, 260); tone(70, 0.9, 'sine', 0.6 * v, 30); setTimeout(() => noise(0.8, 0.4 * v, 600), 250); },
    couic: v => tone(1500, 0.18, 'square', 0.12 * v, 2600),
    grind: v => { noise(0.9, 0.3 * v, 6000); tone(2400, 0.8, 'sawtooth', 0.05 * v, 1900); },
    flush: v => { noise(1.2, 0.25 * v, 1400); setTimeout(() => tone(300, 0.4, 'sine', 0.06 * v, 120), 500); },
    run: v => tone(200, 0.05, 'triangle', 0.05 * v),
    horn_base: v => { tone(410, 0.35, 'square', 0.15 * v); tone(520, 0.35, 'square', 0.12 * v); },
    horn_canard: v => { tone(620, 0.12, 'sawtooth', 0.15 * v, 330); setTimeout(() => tone(600, 0.16, 'sawtooth', 0.15 * v, 300), 150); },
    horn_cucaracha: v => [392, 392, 392, 523, 659, 0, 392, 392, 392, 523, 659].forEach((f, i) => f && setTimeout(() => tone(f, 0.11, 'square', 0.1 * v), i * 120)),
    horn_sirene: v => { tone(500, 0.5, 'sawtooth', 0.09 * v, 1100); setTimeout(() => tone(1100, 0.5, 'sawtooth', 0.09 * v, 500), 500); },
    horn_pelle: v => { tone(300, 0.2, 'square', 0.1 * v); S.speak('Coup de pelle !', { force: true, pitch: 0.6 }); }
  };
  S.horn = (k, x, z) => { const n = 'horn_' + String(k || 'base').replace('klaxon_', ''); if (x === undefined) S.play(SOUNDS[n] ? n : 'horn_base'); else S.at(SOUNDS[n] ? n : 'horn_base', x, z); };
  S.play = (name, vol) => { if (SOUNDS[name]) SOUNDS[name](vol === undefined ? 1 : vol); };
  /** Son localisé : plus faible quand c'est loin de la caméra */
  S.at = (name, x, z) => {
    const c = ML.camera; if (!c) return S.play(name);
    const d = Math.hypot(c.position.x - x, c.position.z - z);
    if (d < 60) S.play(name, Math.max(0.15, 1 - d / 60));
  };
  S.setEngine = (on, speed) => {
    if (!S.ctx) return;
    if (!S.engine) {
      const o = S.ctx.createOscillator(), g = S.ctx.createGain(), f = S.ctx.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(S.master); o.start(); S.engine = { o, g };
    }
    S.engine.g.gain.setTargetAtTime(on && !S.muted ? 0.07 : 0, S.ctx.currentTime, 0.1);
    S.engine.o.frequency.setTargetAtTime(45 + Math.abs(speed || 0) * 5, S.ctx.currentTime, 0.1);
  };
  S.speak = (text, opt) => {
    opt = opt || {};
    if (S.muted || !window.speechSynthesis) return;
    const now = performance.now();
    if (!opt.force && (speechSynthesis.speaking || now - S.lastSpeak < 2500)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = opt.rate || 1; u.pitch = opt.pitch || 1;
      const v = speechSynthesis.getVoices().find(v => /^fr/i.test(v.lang)); if (v) u.voice = v;
      speechSynthesis.speak(u); S.lastSpeak = now;
    } catch (e) { /* pas de voix */ }
  };
  S.toggleMute = () => { S.muted = !S.muted; if (S.muted && window.speechSynthesis) speechSynthesis.cancel(); S.setEngine(false, 0); return S.muted; };
})();
