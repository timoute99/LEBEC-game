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
  N.emit = (t, d) => (N.handlers[t] || []).slice().forEach(fn => { try { fn(d); } catch (e) { console.error(e); } });
  /** Écoute une seule fois (ne remplace pas les autres écouteurs, ex. celui du lobby) */
  N.once = (t, fn) => { const h = d => { N.handlers[t] = (N.handlers[t] || []).filter(x => x !== h); fn(d); }; N.on(t, h); };

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
        case 'host': if (N.room) N.room.host = m.id; N.emit('host', m); break;   // {id, name, old, mig}
        case 'relay': N.emit('relay', m); break;
        case 'err': N.emit('err', m.m); break;
        case 'accr': { const cb = N.accWait[m.q]; delete N.accWait[m.q]; if (cb) cb(m); break; }
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
        const welcome = new Promise(res => N.once('welcome', res));
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
        const w = await new Promise((res, rej) => {
          N.once('welcome', res); ws.send(JSON.stringify({ t: 'hello', name: N.name, sid: N.sid }));
          setTimeout(() => rej(new Error('pas de réponse')), 8000);
        });
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
  N.send = o => { if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(o)); };
  N.relay = (d, to) => N.send({ t: 'relay', d, to });
  N.disconnect = () => { N.wanted = false; if (N.ws) N.ws.close(); N.ws = null; N.online = false; N.room = null; };
  setInterval(() => N.send({ t: 'ping' }), 20000);
})();

/* =====================================================================
   ML.Sync — robustesse de la synchro en partie (appelé par game.js) :
   - grand livre du jour (S.car.ledger) envoyé en DELTA : l'instantané {k:'s'}
     part sans ledger, avec lg = [index de départ, nouvelles écritures] ;
   - {k:'rs'} (client → hôte) : « renvoie-moi tout » (après une reconnexion
     ou un trou dans le grand livre) → état complet + fin de journée éventuelle
     + copie de la carrière ;
   - {k:'cs', car} (hôte → clients) : copie de la carrière (début de journée,
     sauvegardes de mi-journée, fin de journée) → permet à n'importe quel
     joueur de reprendre la journée si l'hôte part (ML.Career.shared) ;
   - sauvegarde automatique de mi-journée (hôte, multijoueur, toutes les 2 min).
   ===================================================================== */
(function () {
  const Y = ML.Sync = { sent: 0, ref: null, led: [], rsAt: 0, autoT: 0, autoOff: false };
  const AUTOSAVE_SEC = 120;
  const N = () => ML.Net, G = () => ML.Game;

  /** Nouvelle partie (chez tout le monde) */
  Y.reset = () => { Y.sent = 0; Y.ref = null; Y.led = []; Y.autoT = AUTOSAVE_SEC; Y.autoOff = false; Y.rsAt = 0; Y.shared = false; };

  /** Hôte : instantané lent à diffuser → version allégée (ledger en delta) */
  Y.out = s => {
    const car = s && s.S && s.S.car;
    if (!car || !Array.isArray(car.ledger)) return s;
    const led = car.ledger;
    if (led !== Y.ref || led.length < Y.sent) { Y.ref = led; Y.sent = 0; }      // nouveau jour : on repart de zéro
    const from = Y.sent; Y.sent = led.length;
    const c2 = Object.assign({}, car); delete c2.ledger;
    return { k: 's', S: Object.assign({}, s.S, { car: c2 }), lg: [from, led.slice(from)] };
  };
  /** Client : reconstruit le grand livre avant d'appliquer l'instantané */
  Y.in = d => {
    const car = d.S && d.S.car; if (!car) return;
    if (!d.lg) { if (Array.isArray(car.ledger)) Y.led = car.ledger.slice(); car.ledger = Y.led; return; }   // état complet
    const [from, add] = d.lg;
    if (from <= Y.led.length) { Y.led.length = from; for (const l of add) Y.led.push(l); }
    else Y.ask();                                                                   // trou : on redemande tout
    car.ledger = Y.led;
  };
  /** Client : demande l'état complet à l'hôte (limité à une fois / 2 s) */
  Y.ask = () => {
    const g = G(); if (!g.on || g.isHost || g.solo) return;
    const now = performance.now(); if (now - Y.rsAt < 2000) return; Y.rsAt = now;
    N().relay({ k: 'rs' }, g.host);
  };
  /** Messages relayés propres à Sync ; renvoie true s'il est traité */
  Y.relay = (from, d) => {
    const g = G();
    if (d.k === 'rs') {
      if (!g.isHost || !g.S) return true;
      N().relay({ k: 's', S: g.S }, from);                                           // g.S = dernier état complet (ledger compris)
      if (g.ended && g.lastEnd) N().relay({ k: 'e', l: [{ e: 'end', res: g.lastEnd }] }, from);
      if (g.game && g.game.career && ML.Career.car) N().relay({ k: 'cs', car: ML.Career.car }, from);
      return true;
    }
    if (d.k === 'cs') { if (from === g.host && d.car && d.car.v) ML.Career.shared = d.car; return true; }
    return false;
  };
  /** Hôte : diffuse une copie de la carrière à tous */
  Y.share = car => { const g = G(); if (car && g.on && g.isHost && !g.solo) N().relay({ k: 'cs', car }); };
  /** Hôte : appelé à chaque pas de simulation (sauvegarde de mi-journée) */
  Y.hostTick = dt => {
    const g = G(), S = g.S;
    if (g.solo || !g.isHost || !g.game || !g.game.career || !S || !S.car || S.over || g.ended || Y.autoOff) return;
    if (!Y.shared) { Y.shared = true; Y.share(ML.Career.car); }                    // copie du matin pour tous
    Y.autoT -= dt; if (Y.autoT > 0) return;
    Y.autoT = AUTOSAVE_SEC;
    const snap = ML.Career.snapshotFromState(ML.Sim.S || S); if (!snap) return;
    ML.Career.save(snap, { mid: true }).then(() => {
      if (ML.Career.lastConflict) { Y.autoOff = true; ML.HUD.toast("⚠ Quelqu'un a joué avec cette entreprise entre-temps : sauvegarde auto coupée."); return; }
      Y.share(snap);
    });
  };
})();
