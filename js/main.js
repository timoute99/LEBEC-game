/* =====================================================================
   main.js — Démarrage : moteur 3D, lumières, chargement des décors,
   construction du monde, menus, boucle principale.
   Si l'onglet de l'HÔTE est masqué, une minuterie continue de faire
   tourner l'atelier (sinon tout le monde serait figé).
   ===================================================================== */
(function () {
  async function boot() {
    const canvas = document.getElementById('gl');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const day = new THREE.Color(0xa8d8ff), night = new THREE.Color(0x1b2240);
    scene.background = day.clone(); scene.fog = new THREE.Fog(day.clone(), 90, 260);
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 600);
    scene.add(camera);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x5a6b3a, 0.8); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 160 });
    sun.shadow.bias = -0.0006; scene.add(sun); scene.add(sun.target);
    Object.assign(ML, { scene, camera, renderer, light: { sun, hemi, day, night } });

    ML.Input.init(canvas);
    document.getElementById('loading').textContent = 'Chargement des décors…';
    await ML.Assets.load();
    ML.World.build(scene);
    ML.HUD.init(); ML.Dialogue.init(); ML.Lobby.init();
    document.getElementById('loading').classList.add('hidden');
    camera.position.set(30, 22, 60); camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    // boucle principale
    let last = performance.now(), menuT = 0;
    function loop() {
      requestAnimationFrame(loop);
      const now = performance.now(), raw = Math.min(0.5, (now - last) / 1000), dt = Math.min(0.05, raw); last = now;
      if (ML.Game.on) ML.Game.step(dt, true, raw);
      else { menuT += dt * 0.05; camera.position.set(Math.sin(menuT) * 70, 28, 60 + Math.cos(menuT) * 50); camera.lookAt(0, 0, 40); sun.position.set(30, 60, 20); }
      renderer.render(scene, camera);
      ML.Input.endFrame();
    }
    loop();
    // onglet de l'hôte masqué : on continue la simulation (sans rendu)
    let hiddenLast = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (document.hidden && ML.Game.on && ML.Game.isHost) {
        let dt = Math.min(1, (now - hiddenLast) / 1000);
        while (dt > 0) { const s = Math.min(0.05, dt); ML.Game.step(s, false); dt -= s; }
      }
      hiddenLast = now;
    }, 100);
    ML.boot = true;
  }
  window.addEventListener('load', () => boot().catch(e => { console.error(e); document.getElementById('loading').textContent = 'Erreur au démarrage : ' + e.message; }));
})();
