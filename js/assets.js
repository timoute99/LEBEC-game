/* =====================================================================
   assets.js — Chargement des décors KayKit (assets-ville.js, en base64)
   via GLTFLoader.parse : aucun fetch, donc ça marche en double-clic.
   Tous les modèles partagent la même texture-atlas (matériau Lambert).
   Si les assets manquent, le jeu se rabat sur des formes simples.
   ===================================================================== */
(function () {
  const A = ML.Assets = { models: {}, ready: false };

  function b64ToBuffer(dataUrl) {
    const s = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b.buffer;
  }

  A.load = () => new Promise(resolve => {
    const src = window.ML_ASSETS;
    if (!src || !THREE.GLTFLoader) { resolve(false); return; }
    const img = new Image();
    img.onerror = () => resolve(false);
    img.onload = () => {
      const tex = new THREE.Texture(img); tex.flipY = false; tex.needsUpdate = true;
      A.kitMat = new THREE.MeshLambertMaterial({ map: tex });
      const names = Object.keys(src.models), loader = new THREE.GLTFLoader();
      let left = names.length;
      const done = () => { if (--left === 0) { A.ready = true; resolve(true); } };
      names.forEach(name => {
        try {
          loader.parse(b64ToBuffer(src.models[name]), '', gltf => {
            const g = gltf.scene;
            g.traverse(o => { if (o.isMesh) { o.material = A.kitMat; o.castShadow = true; o.receiveShadow = true; } });
            A.models[name] = g; done();
          }, err => { console.warn('Asset illisible', name, err); done(); });
        } catch (e) { console.warn('Asset illisible', name, e); done(); }
      });
    };
    img.src = src.tex.city;
  });

  /** Copie d'un modèle (géométries partagées) à l'échelle voulue, ou null */
  A.clone = (name, scale) => {
    const m = A.models[name]; if (!m) return null;
    const c = m.clone(true); c.scale.setScalar(scale || 1);
    return c;
  };
  /** Taille du modèle (non mis à l'échelle) */
  A.size = name => {
    const m = A.models[name]; if (!m) return null;
    const b = new THREE.Box3().setFromObject(m); return b.getSize(new THREE.Vector3());
  };
})();
