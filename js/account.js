/* =====================================================================
   account.js — Profil du joueur : pseudo, apparence (peau, cheveux,
   tenue, chapeau), jetons, objets achetés, succès, statistiques.
   - Invité : profil gardé dans CE navigateur (localStorage).
   - Compte : pseudo + mot de passe sur le serveur → on retrouve son
     profil sur n'importe quel PC.
   ===================================================================== */
(function () {
  const A = ML.Account = { prof: null, token: null, user: null, day: {} };
  const N = ML.Net, SHOP = ML.SHOP;
  /* succès : [statistique, nombre, compté sur la journée ?] */
  const RULE = { pelle3: ['pelle', 3, 1], fires3: ['fire', 3, 1], slip5: ['slip', 5, 1], spill4: ['spill', 4, 1], origine5: ['origine', 5, 1] };

  const fresh = name => ({ v: 2, name: name || '', look: { skin: ML.SKINS[0], hair: ML.HAIRS[0] }, coins: 60, owned: [], eq: {}, st: {}, ach: [] });
  A.load = () => {
    try { A.prof = JSON.parse(localStorage.getItem('ml_profile') || 'null'); } catch (e) { A.prof = null; }
    if (!A.prof || A.prof.v !== 2) A.prof = fresh(localStorage.getItem('ml_name') || '');
    A.token = localStorage.getItem('ml_token'); A.user = localStorage.getItem('ml_user');
  };
  A.logged = () => !!(A.token && A.user);
  A.name = () => (A.logged() ? A.user : (A.prof.name || ''));

  /** Enregistre (localement + sur le serveur si connecté à un compte) */
  A.save = async () => {
    localStorage.setItem('ml_profile', JSON.stringify(A.prof));
    if (A.logged() && N.online) { const r = await N.acc('save', { token: A.token, profile: A.prof }); if (!r.ok && /expir/i.test(r.m || '')) A.logout(); }
  };
  A.auth = async (op, user, pass) => {
    const r = await N.acc(op, { user, pass, profile: op === 'register' ? A.prof : undefined });
    if (!r.ok) return r;
    A.token = r.token; A.user = r.user; A.prof = Object.assign(fresh(r.user), r.profile || {});
    localStorage.setItem('ml_token', A.token); localStorage.setItem('ml_user', A.user); localStorage.setItem('ml_profile', JSON.stringify(A.prof));
    return r;
  };
  A.resume = async () => {
    if (!A.token || !N.online) return false;
    const r = await N.acc('resume', { token: A.token });
    if (!r.ok) { A.logout(); return false; }
    A.user = r.user; A.prof = Object.assign(fresh(r.user), r.profile || {}); localStorage.setItem('ml_profile', JSON.stringify(A.prof));
    return true;
  };
  A.logout = () => { A.token = null; A.user = null; localStorage.removeItem('ml_token'); localStorage.removeItem('ml_user'); };

  /* ---------- Boutique ---------- */
  A.owns = id => A.prof.owned.includes(id);
  A.buy = id => {
    const it = SHOP[id]; if (!it || A.owns(id)) return 'Déjà acheté.';
    if (A.prof.coins < it.price) return `Il te manque ${it.price - A.prof.coins} jetons.`;
    A.prof.coins -= it.price; A.prof.owned.push(id); A.prof.eq[it.cat] = id; A.save(); ML.Sfx.play('cash'); return null;
  };
  A.equip = (cat, id) => { if (id && !A.owns(id)) return; if (id) A.prof.eq[cat] = id; else delete A.prof.eq[cat]; A.save(); };
  /** Apparence envoyée aux autres joueurs */
  A.look = () => {
    const e = A.prof.eq, g = k => (e[k] && SHOP[e[k]]) || {};
    const L = A.prof.look;
    return { skin: L.skin, hair: L.hair, suit: L.suit !== undefined ? L.suit : 0x1f4e9a, height: L.height || 1.78, width: L.width || 1, beard: !!L.beard, glasses: !!L.glasses, shirt: g('tenue').shirt, hat: g('chapeau').hat, klaxon: e.klaxon || 'base',
      tune: { paint: g('peinture').color, aileron: !!e.aileron, flammes: !!e.flammes, jantes: !!e.jantes } };
  };

  /* ---------- Statistiques & succès ---------- */
  A.startDay = () => { A.day = {}; };
  A.stat = (k, n) => {
    n = n || 1; A.day[k] = (A.day[k] || 0) + n; A.prof.st[k] = (A.prof.st[k] || 0) + n;
    for (const id in ML.ACH) {
      if (A.prof.ach.includes(id)) continue;
      const r = RULE[id] || [id, 1, 1];
      if (r[0] !== k) continue;
      if ((r[2] ? A.day[k] : A.prof.st[k]) >= r[1]) A.unlock(id);
    }
  };
  A.unlock = id => {
    const a = ML.ACH[id]; A.prof.ach.push(id); A.prof.coins += a[2];
    ML.HUD.achievement(a[0], a[1], a[2]); ML.Sfx.play('find'); A.save();
  };
  /** Fin de journée : jetons gagnés */
  A.endDay = res => {
    const gain = Math.floor((res.score || 0) / 8) + 10 * (res.stars || 0) + 5;
    A.prof.coins += gain; A.prof.st.days = (A.prof.st.days || 0) + 1; A.save();
    return gain;
  };
})();
