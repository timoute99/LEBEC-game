/* =====================================================================
   sw.js — Service worker de l'appli installée (PWA, porté de la V4.1).
   Stratégie « RÉSEAU D'ABORD » (sans cache HTTP) : on prend TOUJOURS la
   dernière version sur le serveur, donc les mises à jour arrivent tout de
   suite ; la copie locale ne sert QUE si le réseau est coupé (le solo
   marche alors hors ligne). Le multijoueur (WebSocket) ne passe pas par ici.
   À l'installation, on pré-copie index.html, le CSS et TOUS les scripts
   listés dans index.html (lus directement dans la page : pas de liste à
   tenir à jour quand on ajoute un fichier js).
   ⚠ Changer CACHE (numéro de version) à chaque grosse mise à jour : les
   anciennes copies sont alors effacées.
   ===================================================================== */
const CACHE = 'lebec-v5.0';
const BASE = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    let list = BASE.slice();
    try {                                                            // scripts et feuilles de style de index.html
      const html = await (await fetch('index.html', { cache: 'no-store' })).text();
      for (const m of html.matchAll(/<(?:script[^>]+src|link[^>]+href)="([^"#:]+)"/g)) if (!list.includes(m[1])) list.push(m[1]);
    } catch (err) { /* hors ligne : on garde la liste de base */ }
    // un fichier manquant ne doit pas faire échouer toute l'installation
    await Promise.all(list.map(u => fetch(u, { cache: 'no-store' }).then(r => (r.ok ? c.put(u, r) : null)).catch(() => null)));
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/health')) return;
  // navigation : on refait la requête par son URL (une requête « navigate » ne se recopie pas avec des options)
  e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
