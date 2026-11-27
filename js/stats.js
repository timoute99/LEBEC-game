/* =====================================================================
   stats.js — V5.4 : petit « battement » envoyé au serveur pour la page admin
   (visite, en partie ou au menu, mode, nombre de joueurs). Rien de personnel :
   un identifiant de session au hasard, le pseudo affiché et le jeton de compte
   si on est connecté (pour compter le temps de jeu par compte).
   ===================================================================== */
(() => {
  const St = ML.Stats = {};
  const base = () => { const u = (ML.Net && ML.Net.url) || (ML.Net && ML.Net.defaultUrl ? ML.Net.defaultUrl() : ''); return u.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, ''); };
  const modeName = () => {
    const G = ML.Game, g = (G && G.game) || {};
    const m = g.beginner ? 'Débutant' : g.campaign || g.mode === 'campagne' ? 'Campagne' : ({ coop: 'Journée libre', inspection: 'Inspection', course: 'Course de Mégane' }[g.mode] || g.mode || '?');
    return m + (G && G.solo ? ' (solo)' : ' (multi)');
  };
  St.ping = e => {
    try {
      const G = ML.Game, on = !!(G && G.on && !G.ended), A = ML.Account || {};
      const body = JSON.stringify({ e: e || 'hb', sid: (ML.Net && ML.Net.sid) || '', g: on ? 1 : 0, m: on ? modeName() : '', np: on ? Object.keys(G.players || {}).length : 0,
        tok: A.token || '', n: (A.name && A.prof ? A.name() : '') || (ML.Net && ML.Net.name) || '', v: (document.getElementById('version') || {}).textContent || '' });
      const url = base(); if (!/^https?:\/\//.test(url)) return;
      fetch(url + '/api/hb', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
    } catch (err) { /* les stats ne doivent jamais gêner le jeu */ }
  };
  setTimeout(() => St.ping('visit'), 1500);
  setInterval(() => { if (!document.hidden) St.ping('hb'); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) St.ping('hb'); });
})();
