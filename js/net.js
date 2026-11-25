/* =====================================================================
   net.js — Client WebSocket (salons + relais), avec :
   - patience au réveil du serveur Render gratuit (jusqu'à ~70 s) ;
   - reprise de session après une coupure (même identifiant d'onglet) ;
   - événements : 'status', 'room', 'rooms', 'start', 'relay', 'host',
     'err', 'unstable', 'resumed', 'lost'.
   ===================================================================== */
(function () {
  const N = ML.Net = { ws: null, id: null, room: null, online: false, url: '', name: '', handlers: {}, wanted: false };

  N.sid = sessionStorage.getItem('ml_sid') || (Math.random().toString(36).slice(2) + Date.now().toString(36));
  sessionStorage.setItem('ml_sid', N.sid);

  N.on = (t, fn) => { (N.handlers[t] = N.handlers[t] || []).push(fn); };
  N.emit = (t, d) => (N.handlers[t] || []).forEach(fn => { try { fn(d); } catch (e) { console.error(e); } });

  /** Adresse par défaut : le serveur qui sert la page, sinon celle mémorisée, sinon le serveur local */
  N.defaultUrl = () => {
    if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return localStorage.getItem('ml_server') || 'ws://localhost:8080';
  };

  function open(url) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      const to = setTimeout(() => { try { ws.close(); } catch (e) { /* rien */ } reject(new Error('délai')); }, 8000);
      ws.onopen = () => { clearTimeout(to); resolve(ws); };
      ws.onerror = () => { clearTimeout(to); reject(new Error('connexion impossible')); };
    });
  }

  function attach(ws) {
    N.ws = ws;
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      switch (m.t) {
        case 'welcome': N.id = m.id; N.online = true; N.room = m.room; N.emit('welcome', m); if (m.room) N.emit('room', m.room); break;
        case 'room': N.room = m.room; N.emit('room', m.room); break;
        case 'rooms': N.emit('rooms', m.list); break;
        case 'start': N.room = m.room; N.emit('start', m); break;
        case 'host': if (N.room) N.room.host = m.id; N.emit('host', m.id); break;
        case 'relay': N.emit('relay', m); break;
        case 'err': N.emit('err', m.m); break;
        case 'accr': { const cb = N.accWait[m.q]; delete N.accWait[m.q]; if (cb) cb(m); break; }
        case 'campr': { const cb = N.accWait['c' + m.q]; delete N.accWait['c' + m.q]; if (cb) cb(m); break; }
      }
    };
    ws.onclose = () => {
      if (N.ws !== ws) return;
      N.ws = null; N.online = false;
      if (N.wanted && N.id) reconnect();
    };
  }

  /** Connexion initiale (patiente pendant le réveil du serveur) */
  N.connect = async (url, name) => {
    N.url = url; N.name = name; N.wanted = true;
    if (!/^https?:/.test(location.protocol)) localStorage.setItem('ml_server', url);
    const t0 = Date.now();
    for (let attempt = 0; ; attempt++) {
      N.emit('status', attempt === 0 ? 'Connexion au serveur...' : `Réveil du serveur... (${Math.round((Date.now() - t0) / 1000)} s, ça peut prendre jusqu'à 1 min)`);
      try {
        const ws = await open(url);
        attach(ws);
        const welcome = new Promise(res => N.on('welcome', res));
        ws.send(JSON.stringify({ t: 'hello', name, sid: N.sid }));
        await welcome;
        N.emit('status', '');
        return true;
      } catch (e) {
        if (Date.now() - t0 > 70000 || !N.wanted) { N.emit('status', 'Serveur injoignable. Vérifie l\'adresse (ou lance SERVEUR-LOCAL.bat).'); N.wanted = false; return false; }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  };

  /** Coupure inattendue : on retente pendant ~22 s avec le même identifiant */
  async function reconnect() {
    N.emit('unstable');
    const t0 = Date.now();
    while (N.wanted && Date.now() - t0 < 22000) {
      try {
        const ws = await open(N.url);
        attach(ws);
        const w = await new Promise(res => { const h = m => res(m); N.handlers.welcome = [h]; ws.send(JSON.stringify({ t: 'hello', name: N.name, sid: N.sid })); });
        if (w.resumed) { N.emit('resumed'); return; }
        N.emit('lost'); return;
      } catch (e) { await new Promise(r => setTimeout(r, 1500)); }
    }
    if (N.wanted) N.emit('lost');
  }

  /** Comptes joueurs : register / login / resume / save → promesse de la réponse du serveur */
  N.accWait = {}; let accQ = 1;
  N.acc = (op, data) => new Promise(res => {
    if (!N.ws || N.ws.readyState !== 1) return res({ ok: false, m: 'Pas connecté au serveur.' });
    const q = accQ++; N.accWait[q] = res; N.send(Object.assign({ t: 'acc', q, op }, data));
    setTimeout(() => { if (N.accWait[q]) { delete N.accWait[q]; res({ ok: false, m: 'Le serveur ne répond pas.' }); } }, 10000);
  });
  /** Sauvegardes de campagne : create / load / put → promesse de la réponse */
  N.camp = (op, data) => new Promise(res => {
    if (!N.ws || N.ws.readyState !== 1) return res({ ok: false, m: 'Pas connecté au serveur.' });
    const q = accQ++; N.accWait['c' + q] = res; N.send(Object.assign({ t: 'camp', q, op }, data));
    setTimeout(() => { if (N.accWait['c' + q]) { delete N.accWait['c' + q]; res({ ok: false, m: 'Le serveur ne répond pas.' }); } }, 10000);
  });
  N.send = o => { if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(o)); };
  N.relay = (d, to) => N.send({ t: 'relay', d, to });
  N.disconnect = () => { N.wanted = false; if (N.ws) N.ws.close(); N.ws = null; N.online = false; N.room = null; };
  setInterval(() => N.send({ t: 'ping' }), 20000);
})();
