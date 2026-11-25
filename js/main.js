/* =====================================================================
   main.js — Démarrage : moteur 3D, lumières, chargement des décors,
   construction du monde, menus, boucle principale.
   Si l'onglet de l'HÔTE est masqué, une minuterie continue de faire
   tourner l'atelier (sinon tout le monde serait figé).
   ===================================================================== */
(function () {
  ML.Main = {
    /** Aperçu 3D du perso du joueur (on = true : (re)construit) */
    preview: on => {
      if (ML.Main.pv) { ML.People.dispose(ML.Main.pv); ML.Main.pv = null; }
      if (!on || ML.Game.on) return;
      const L = ML.Account.look(), suit = L.suit;
      const v = ML.People.build({ skin: L.skin, shirt: L.shirt || suit, pants: suit, hair: L.hair, height: L.height, width: L.width, beard: L.beard, glasses: L.glasses },
        { name: ML.Account.name() || 'Moi', helmet: L.hat ? null : 0xf5f5f5, hat: L.hat, vest: (ML.ROLES[ML.Lobby.myRole] || ML.ROLES.poly).color });
      v.pos.set(0, 0, 22); v.target.copy(v.pos); v.yaw = 0.5; v.seen = true; ML.Main.pv = v;
    },
    menuScene: () => { ML.scene.background.copy(ML.light.day); ML.scene.fog.color.copy(ML.light.day); ML.scene.fog.near = 90; ML.scene.fog.far = 260; ML.light.sun.intensity = 0.85; ML.light.hemi.intensity = 0.8; } };
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
    ML.World.build(1234567, {});                 // ville du menu (chaque partie a la sienne)
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
      else if (ML.Main.pv) {                                      // aperçu du perso (menu « Mon perso »)
        const v = ML.Main.pv; v.yaw += dt * 0.6; v.tYaw = v.yaw; ML.People.animate(v, dt, null);
        camera.position.set(1.7, 1.3, 25.6); camera.lookAt(1.45, 1.0, 22);
        sun.position.set(10, 30, 40); sun.target.position.set(0, 0, 22); sun.target.updateMatrixWorld();
      } else {
        menuT += dt * 0.05; camera.position.set(Math.sin(menuT) * 70, 28, 60 + Math.cos(menuT) * 50); camera.lookAt(0, 0, 40);
        sun.position.set(30, 60, 20); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); ML.Input.pollPad(dt);
      }
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
