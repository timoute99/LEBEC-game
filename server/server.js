// =====================================================================
// server.js — Serveur relais de MÉCANIQUE LEBEC (multijoueur)
// ---------------------------------------------------------------------
// Le serveur NE fait PAS tourner le jeu : il gère les salons (code de 4
// lettres, 5 joueurs max), relaie les messages entre joueurs d'un même
// salon et garde la place d'un joueur 20 s s'il perd la connexion.
// C'est le navigateur de l'HÔTE (créateur du salon) qui simule l'atelier.
//
// Il sert aussi les fichiers du jeu (dossier parent) : en local, ouvre
// http://localhost:8080/ après `node server.js`.
//
// Protocole (JSON) — client → serveur :
//   {t:'hello', name, sid}            → {t:'welcome', id, resumed, room}
//   {t:'list'}                        → {t:'rooms', list}
//   {t:'create', priv}                → {t:'room', room}
//   {t:'join', code}                  → {t:'room', room} | {t:'err', m}
//   {t:'leave'}
//   {t:'start', seed}   (hôte)        → à tous : {t:'start', seed, room}
//   {t:'end'}           (hôte)        → à tous : {t:'room', room} (retour au salon)
//   {t:'relay', d, to?}               → aux autres : {t:'relay', from, d}
//   {t:'ping'}                        → {t:'pong'}
// =====================================================================
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const VERSION = 1;
const MAX_PLAYERS = 5;
const GRACE_MS = 20000;          // place gardée après une coupure
const RATE_PER_SEC = 120;        // messages/s autorisés par joueur (au-delà : ignorés)
const MAX_MSG = 512 * 1024;      // taille max d'un message

const clients = new Map();       // id → client
const bySid = new Map();         // sid (identifiant d'onglet) → client
const rooms = new Map();         // code → salon

/* ---------------- Fichiers statiques (le jeu lui-même) ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, v: VERSION, rooms: rooms.size, players: clients.size }));
    return;
  }
  let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT) || file.includes(path.sep + 'server' + path.sep) || file.includes('node_modules')) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------------- Outils ---------------- */
const newId = () => crypto.randomBytes(4).toString('hex');
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)]; if (!rooms.has(c)) return c; }
}
const cleanName = n => (String(n || '').replace(/[<>&"'`]/g, '').trim().slice(0, 16)) || 'Usineur';
function send(c, o) { if (c && c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); }

function roomInfo(r) {
  return {
    code: r.code, host: r.host, state: r.state, priv: r.priv, max: MAX_PLAYERS, seed: r.seed,
    players: r.players.map(id => { const c = clients.get(id); return { id, name: c ? c.name : '?', idx: c ? c.idx : 0, on: !!(c && c.ws) }; })
  };
}
function broadcastRoom(r) { const info = roomInfo(r); for (const id of r.players) send(clients.get(id), { t: 'room', room: info }); }

function leaveRoom(c) {
  const r = c.room && rooms.get(c.room);
  c.room = null;
  if (!r) return;
  r.players = r.players.filter(id => id !== c.id);
  if (!r.players.length) { rooms.delete(r.code); return; }
  if (r.host === c.id) { r.host = r.players[0]; for (const id of r.players) send(clients.get(id), { t: 'host', id: r.host }); }
  broadcastRoom(r);
}
function joinRoom(c, r) {
  leaveRoom(c);
  // couleur : premier index libre parmi 0..4
  const used = new Set(r.players.map(id => clients.get(id) && clients.get(id).idx));
  c.idx = [0, 1, 2, 3, 4].find(i => !used.has(i)) || 0;
  r.players.push(c.id); c.room = r.code;
  broadcastRoom(r);
}

/* ---------------- WebSocket ---------------- */
const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });

wss.on('connection', ws => {
  let c = null;                          // client associé après 'hello'
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      const sid = String(m.sid || '').slice(0, 40);
      const old = sid && bySid.get(sid);
      if (old) {                          // reprise de session (même onglet)
        if (old.ws && old.ws !== ws) { try { old.ws.close(); } catch (e) { /* déjà fermé */ } }
        clearTimeout(old.graceT);
        c = old; c.ws = ws; c.name = cleanName(m.name || c.name);
        const r = c.room && rooms.get(c.room);
        send(c, { t: 'welcome', id: c.id, v: VERSION, resumed: true, room: r ? roomInfo(r) : null });
        if (r) broadcastRoom(r);
      } else {
        c = { id: newId(), sid, name: cleanName(m.name), ws, room: null, idx: 0, tokens: RATE_PER_SEC, last: Date.now() };
        clients.set(c.id, c); if (sid) bySid.set(sid, c);
        send(c, { t: 'welcome', id: c.id, v: VERSION, resumed: false, room: null });
      }
      return;
    }
    if (!c || c.ws !== ws) return;

    // limitation de débit (seau de jetons)
    const now = Date.now();
    c.tokens = Math.min(RATE_PER_SEC * 2, c.tokens + (now - c.last) / 1000 * RATE_PER_SEC); c.last = now;
    if (c.tokens < 1) return;
    c.tokens -= 1;

    const r = c.room && rooms.get(c.room);
    switch (m.t) {
      case 'ping': send(c, { t: 'pong' }); break;
      case 'name': c.name = cleanName(m.name); if (r) broadcastRoom(r); break;
      case 'list':
        send(c, { t: 'rooms', list: [...rooms.values()].filter(x => !x.priv && x.state === 'lobby').map(x => {
          const h = clients.get(x.host); return { code: x.code, n: x.players.length, max: MAX_PLAYERS, host: h ? h.name : '?' };
        }) });
        break;
      case 'create': {
        const room = { code: newCode(), host: c.id, players: [], state: 'lobby', priv: !!m.priv, seed: 0 };
        rooms.set(room.code, room);
        joinRoom(c, room);
        break;
      }
      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) { send(c, { t: 'err', m: 'Salon introuvable. Vérifie le code.' }); break; }
        if (room.players.includes(c.id)) { broadcastRoom(room); break; }
        if (room.players.length >= MAX_PLAYERS) { send(c, { t: 'err', m: 'Salon complet (5 joueurs).' }); break; }
        if (room.state !== 'lobby') { send(c, { t: 'err', m: 'La partie a déjà commencé dans ce salon.' }); break; }
        joinRoom(c, room);
        break;
      }
      case 'leave': leaveRoom(c); send(c, { t: 'room', room: null }); break;
      case 'start':
        if (!r || r.host !== c.id) break;
        r.state = 'game'; r.seed = (m.seed >>> 0) || 1;
        for (const id of r.players) send(clients.get(id), { t: 'start', seed: r.seed, room: roomInfo(r) });
        break;
      case 'end':
        if (!r || r.host !== c.id) break;
        r.state = 'lobby'; broadcastRoom(r);
        break;
      case 'relay': {
        if (!r) break;
        const out = JSON.stringify({ t: 'relay', from: c.id, d: m.d });
        if (m.to) { const t = clients.get(m.to); if (t && t.room === r.code && t.ws && t.ws.readyState === 1) t.ws.send(out); }
        else for (const id of r.players) { if (id === c.id) continue; const t = clients.get(id); if (t && t.ws && t.ws.readyState === 1) t.ws.send(out); }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!c || c.ws !== ws) return;
    c.ws = null;
    const r = c.room && rooms.get(c.room);
    if (r) broadcastRoom(r);                // le joueur apparaît « déconnecté »
    c.graceT = setTimeout(() => {           // pas revenu à temps : on libère sa place
      if (c.ws) return;
      leaveRoom(c);
      clients.delete(c.id); if (c.sid) bySid.delete(c.sid);
    }, GRACE_MS);
  });
});

// battement de cœur : détecte les connexions mortes sans fermeture propre
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignoré */ }
  }
}, 15000);

server.listen(PORT, () => console.log(`Mécanique Lebec — serveur prêt : http://localhost:${PORT}/  (WebSocket sur le même port)`));
