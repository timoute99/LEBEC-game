/* =====================================================================
   textures.js — Textures dessinées par code (aucun fichier image) :
   béton, asphalte, herbe, brique, tôle ondulée, bardage, bois, quai.
   ML.Tex.mat(clé, rx, ry, teinte) → matériau Lambert texturé et répété.
   ===================================================================== */
(function () {
  const T = ML.Tex = {}, cache = {}, mcache = {};
  const rnd = ML.U.rng(4242);

  function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
  function noise(ctx, n, amount, alpha) {
    const img = ctx.getImageData(0, 0, n, n), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (rnd() - 0.5) * amount; d[i] += v; d[i + 1] += v; d[i + 2] += v; if (alpha) d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }

  const DRAW = {
    beton(ctx, n) { ctx.fillStyle = '#9b9ea2'; ctx.fillRect(0, 0, n, n); noise(ctx, n, 26); ctx.strokeStyle = 'rgba(60,60,60,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, n - 2, n - 2);
      for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(70,70,70,${rnd() * 0.12})`; ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, 6 + rnd() * 26, 0, 7); ctx.fill(); } },
    sol(ctx, n) { ctx.fillStyle = '#8d9296'; ctx.fillRect(0, 0, n, n); noise(ctx, n, 18); ctx.strokeStyle = 'rgba(50,50,50,0.4)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, n, n);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(40,35,30,${0.05 + rnd() * 0.1})`; ctx.beginPath(); ctx.ellipse(rnd() * n, rnd() * n, 10 + rnd() * 40, 6 + rnd() * 20, rnd() * 3, 0, 7); ctx.fill(); } },
    asphalte(ctx, n) { ctx.fillStyle = '#3c3f44'; ctx.fillRect(0, 0, n, n); noise(ctx, n, 30);
      for (let i = 0; i < 8; i++) { ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); let x = rnd() * n, y = rnd() * n; ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); } },
    herbe(ctx, n) { ctx.fillStyle = '#5f8f43'; ctx.fillRect(0, 0, n, n); noise(ctx, n, 34);
      for (let i = 0; i < 600; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,170,80,0.5)' : 'rgba(60,100,40,0.5)'; ctx.fillRect(rnd() * n, rnd() * n, 2, 5); } },
    brique(ctx, n) { ctx.fillStyle = '#b8b0a6'; ctx.fillRect(0, 0, n, n); const bh = n / 16, bw = n / 4;
      for (let r = 0; r < 16; r++) for (let c = -1; c < 5; c++) { const x = c * bw + (r % 2 ? bw / 2 : 0); const v = 150 + rnd() * 40; ctx.fillStyle = `rgb(${v},${v * 0.55},${v * 0.42})`; ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4); }
      noise(ctx, n, 16); },
    tole(ctx, n) { const g = ctx.createLinearGradient(0, 0, n / 16, 0); g.addColorStop(0, '#e8e8e8'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#bdbdbd');
      ctx.fillStyle = g; for (let i = 0; i < 16; i++) { ctx.save(); ctx.translate(i * n / 16, 0); ctx.fillRect(0, 0, n / 16, n); ctx.restore(); } noise(ctx, n, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, n * 0.5 - 2, n, 3); },
    bardage(ctx, n) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, n, n); for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(0, i * n / 8, n, 3); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(0, i * n / 8 + 3, n, 2); } noise(ctx, n, 8); },
    bois(ctx, n) { ctx.fillStyle = '#b07b46'; ctx.fillRect(0, 0, n, n); for (let i = 0; i < 40; i++) { ctx.strokeStyle = `rgba(90,55,25,${0.15 + rnd() * 0.2})`; ctx.beginPath(); const y = rnd() * n; ctx.moveTo(0, y); ctx.bezierCurveTo(n / 3, y + (rnd() - 0.5) * 12, 2 * n / 3, y + (rnd() - 0.5) * 12, n, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(60,35,15,0.8)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, n - 6, n - 6); ctx.beginPath(); ctx.moveTo(0, n / 2); ctx.lineTo(n, n / 2); ctx.stroke(); },
    quai(ctx, n) { ctx.fillStyle = '#555'; ctx.fillRect(0, 0, n, n); noise(ctx, n, 20); ctx.fillStyle = '#f1c40f';
      for (let i = -n; i < 2 * n; i += 48) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, n, 20); ctx.clip(); ctx.translate(i, 0); ctx.rotate(-0.6); ctx.fillRect(0, -40, 22, 120); ctx.restore(); } }
  };

  T.tex = (key, rx, ry) => {
    const k = key + '_' + rx + '_' + ry;
    if (cache[k]) return cache[k];
    if (!cache[key]) { const [c, ctx] = canvas(256); DRAW[key](ctx, 256); cache[key] = c; }
    const t = new THREE.CanvasTexture(cache[key]);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || 1); t.anisotropy = 4;
    return (cache[k] = t);
  };
  T.mat = (key, rx, ry, tint) => {
    const k = key + '_' + rx + '_' + ry + '_' + (tint || 0xffffff);
    return mcache[k] || (mcache[k] = new THREE.MeshLambertMaterial({ map: T.tex(key, rx, ry), color: tint || 0xffffff }));
  };
})();
