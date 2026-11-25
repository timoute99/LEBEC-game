// =====================================================================
// server.js — Serveur de MÉCANIQUE LEBEC (v2)
// ---------------------------------------------------------------------
// 1) SALONS + RELAIS : le serveur ne fait pas tourner le jeu ; il gère des
//    salons (code de 4 lettres, 5 joueurs), relaie les messages et garde
//    la place d'un joueur 20 s après une coupure. L'HÔTE simule l'atelier.
// 2) COMPTES : pseudo + mot de passe (scrypt), jeton signé, profil
//    (apparence, jetons, objets, succès). Stockage :
//      - fichier server/data/accounts.json (par défaut, local) ;
//      - OU un fichier dans un dépôt GitHub PRIVÉ si les variables
//        d'environnement GITHUB_TOKEN et GITHUB_REPO sont définies
//        (Render efface ses fichiers à chaque redémarrage).
//    AUTH_SECRET (variable d'environnement) signe les jetons.
// 3) Sert les fichiers du jeu (dossier parent) : http://localhost:8080/
//
// Protocole JSON (client → serveur) :
//   {t:'hello', name, sid}  {t:'list'}  {t:'create', priv}  {t:'join', code}
//   {t:'leave'}  {t:'name', name}  {t:'start', seed, cfg} (hôte)  {t:'end'} (hôte)
//   {t:'relay', d, to?}  {t:'ping'}
//   {t:'acc', q, op:'register'|'login'|'resume'|'save', user, pass, token, profile}
//     → {t:'accr', q, ok, m?, token?, user?, profile?}
// =====================================================================
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const DATA = path.join(__dirname, 'data');
const VERSION = 2;
const MAX_PLAYERS = 5, GRACE_MS = 20000, RATE_PER_SEC = 150, MAX_MSG = 512 * 1024;

/* ======================= Comptes : stockage ======================= */
const GH = { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO, file: process.env.GITHUB_PATH || 'lebec-accounts.json', sha: null };
const useGitHub = !!(GH.token && GH.repo);
let accounts = {};               // clé = pseudo en minuscules
let saveTimer = null;
let SECRET = process.env.AUTH_SECRET;

function ensureData() { try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) { /* rien */ } }
if (!SECRET) {
  ensureData();
  const f = path.join(DATA, 'secret.txt');
  try { SECRET = fs.readFileSync(f, 'utf8').trim(); } catch (e) { SECRET = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(f, SECRET); } catch (e2) { /* lecture seule */ } }
}
async function ghApi(method, body) {
  const url = `https://api.github.com/repos/${GH.repo}/contents/${encodeURIComponent(GH.file)}`;
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'lebec-relay' }, body: body ? JSON.stringify(body) : undefined });
  return r;
}
async function loadAccounts() {
  if (useGitHub) {
    try {
      const r = await ghApi('GET');
      if (r.status === 200) { const j = await r.json(); GH.sha = j.sha; accounts = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')) || {}; }
      else if (r.status !== 404) console.warn('GitHub : lecture impossible', r.status);
    } catch (e) { console.warn('GitHub : erreur', e.message); }
  } else {
    try { accounts = JSON.parse(fs.readFileSync(path.join(DATA, 'accounts.json'), 'utf8')); } catch (e) { accounts = {}; }
  }
  console.log(`Comptes chargés : ${Object.keys(accounts).length} (stockage ${useGitHub ? 'github' : 'fichier'})`);
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const txt = JSON.stringify(accounts);
    if (useGitHub) {
      try {
        const r = await ghApi('PUT', { message: 'comptes Lebec', content: Buffer.from(txt).toString('base64'), sha: GH.sha || undefined });
        if (r.ok) { const j = await r.json(); GH.sha = j.content.sha; }
        else { console.warn('GitHub : écriture refusée', r.status); if (r.status === 409) { const g = await ghApi('GET'); if (g.ok) GH.sha = (await g.json()).sha; scheduleSave(); } }
      } catch (e) { console.warn('GitHub : erreur', e.message); }
    } else { ensureData(); try { fs.writeFileSync(path.join(DATA, 'accounts.json'), txt); } catch (e) { console.warn('Écriture impossible', e.message); } }
  }, 1500);
}

/* ======================= Comptes : logique ======================= */
const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
const sign = user => { const p = Buffer.from(user).toString('base64url'); return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url'); };
function verify(token) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return null;
  const good = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (good.length !== s.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(s))) return null;
  return Buffer.from(p, 'base64url').toString('utf8');
}
const ID = /^[a-z0-9_]{1,32}$/;
/** On ne garde qu'un profil de forme connue (le client n'est pas digne de confiance) */
function cleanProfile(p, name) {
  p = p && typeof p === 'object' ? p : {};
  const int = (v, max) => Math.max(0, Math.min(max, Math.floor(+v || 0)));
  const col = v => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : undefined);
  const look = p.look && typeof p.look === 'object' ? p.look : {};
  const eq = {}; if (p.eq && typeof p.eq === 'object') for (const k of Object.keys(p.eq).slice(0, 20)) if (ID.test(k) && ID.test(String(p.eq[k]))) eq[k] = String(p.eq[k]);
  const st = {}; if (p.st && typeof p.st === 'object') for (const k of Object.keys(p.st).slice(0, 40)) if (ID.test(k)) st[k] = int(p.st[k], 1e7);
  return {
    v: 2, name,
    look: { skin: col(look.skin), hair: col(look.hair), suit: col(look.suit), height: Math.max(1.5, Math.min(2.05, +look.height || 1.78)),
      width: Math.max(0.8, Math.min(1.35, +look.width || 1)), beard: !!look.beard, glasses: !!look.glasses },
    coins: int(p.coins, 1e7),
    owned: Array.isArray(p.owned) ? [...new Set(p.owned.filter(x => ID.test(String(x))).map(String))].slice(0, 300) : [],
    eq, st,
    ach: Array.isArray(p.ach) ? [...new Set(p.ach.filter(x => ID.test(String(x))).map(String))].slice(0, 100) : []
  };
}
function accountOp(m) {
  const user = String(m.user || '').trim().slice(0, 16), key = user.toLowerCase();
  switch (m.op) {
    case 'register': {
      if (!/^[\p{L}\p{N}_ .-]{3,16}$/u.test(user)) return { ok: false, m: 'Pseudo : 3 à 16 caractères (lettres, chiffres, espace, _ . -).' };
      if (String(m.pass || '').length < 4) return { ok: false, m: 'Mot de passe : 4 caractères minimum.' };
      if (accounts[key]) return { ok: false, m: 'Ce pseudo est déjà pris.' };
      const salt = crypto.randomBytes(16).toString('hex');
      accounts[key] = { name: user, salt, hash: hashPass(String(m.pass), salt), created: Date.now(), profile: cleanProfile(m.profile, user) };
      scheduleSave();
      return { ok: true, token: sign(key), user, profile: accounts[key].profile };
    }
    case 'login': {
      const a = accounts[key];
      if (!a || hashPass(String(m.pass || ''), a.salt) !== a.hash) return { ok: false, m: 'Pseudo ou mot de passe incorrect.' };
      return { ok: true, token: sign(key), user: a.name, profile: a.profile };
    }
    case 'resume': { const k = verify(m.token), a = k && accounts[k]; return a ? { ok: true, token: m.token, user: a.name, profile: a.profile } : { ok: false, m: 'Session expirée, reconnecte-toi.' }; }
    case 'save': {
      const k = verify(m.token), a = k && accounts[k];
      if (!a) return { ok: false, m: 'Session expirée.' };
      if (JSON.stringify(m.profile || {}).length > 30000) return { ok: false, m: 'Profil trop gros.' };
      a.profile = cleanProfile(m.profile, a.name); scheduleSave();
      return { ok: true, profile: a.profile };
    }
  }
  return { ok: false, m: 'Opération inconnue.' };
}

/* ======================= Fichiers statiques ======================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, v: VERSION, rooms: rooms.size, players: clients.size, accounts: Object.keys(accounts).length, storage: useGitHub ? 'github' : 'fichier' }));
    return;
  }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT) || file.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ======================= Salons ======================= */
const clients = new Map(), bySid = new Map(), rooms = new Map();
const newId = () => crypto.randomBytes(4).toString('hex');
function newCode() { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random() * L.length)]; if (!rooms.has(c)) return c; } }
const cleanName = n => (String(n || '').replace(/[<>&"'`]/g, '').trim().slice(0, 16)) || 'Usineur';
function send(c, o) { if (c && c.ws && c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); }
function roomInfo(r) {
  return { code: r.code, host: r.host, state: r.state, priv: r.priv, max: MAX_PLAYERS, seed: r.seed, cfg: r.cfg,
    players: r.players.map(id => { const c = clients.get(id); return { id, name: c ? c.name : '?', idx: c ? c.idx : 0, on: !!(c && c.ws) }; }) };
}
function broadcastRoom(r) { const info = roomInfo(r); for (const id of r.players) send(clients.get(id), { t: 'room', room: info }); }
function leaveRoom(c) {
  const r = c.room && rooms.get(c.room); c.room = null; if (!r) return;
  r.players = r.players.filter(id => id !== c.id);
  if (!r.players.length) { rooms.delete(r.code); return; }
  if (r.host === c.id) { r.host = r.players[0]; for (const id of r.players) send(clients.get(id), { t: 'host', id: r.host }); }
  broadcastRoom(r);
}
function joinRoom(c, r) {
  leaveRoom(c);
  const used = new Set(r.players.map(id => clients.get(id) && clients.get(id).idx));
  c.idx = [0, 1, 2, 3, 4].find(i => !used.has(i)) || 0;
  r.players.push(c.id); c.room = r.code; broadcastRoom(r);
}

/* ======================= WebSocket ======================= */
const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });
wss.on('connection', ws => {
  let c = null; ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') {
      const sid = String(m.sid || '').slice(0, 40), old = sid && bySid.get(sid);
      if (old) {
        if (old.ws && old.ws !== ws) { try { old.ws.close(); } catch (e) { /* rien */ } }
        clearTimeout(old.graceT); c = old; c.ws = ws; c.name = cleanName(m.name || c.name);
        const r = c.room && rooms.get(c.room);
        send(c, { t: 'welcome', id: c.id, v: VERSION, resumed: true, room: r ? roomInfo(r) : null }); if (r) broadcastRoom(r);
      } else {
        c = { id: newId(), sid, name: cleanName(m.name), ws, room: null, idx: 0, tokens: RATE_PER_SEC, last: Date.now() };
        clients.set(c.id, c); if (sid) bySid.set(sid, c);
        send(c, { t: 'welcome', id: c.id, v: VERSION, resumed: false, room: null });
      }
      return;
    }
    if (!c || c.ws !== ws) return;
    const now = Date.now();
    c.tokens = Math.min(RATE_PER_SEC * 2, c.tokens + (now - c.last) / 1000 * RATE_PER_SEC); c.last = now;
    if (c.tokens < 1) return; c.tokens -= 1;
    const r = c.room && rooms.get(c.room);
    switch (m.t) {
      case 'ping': send(c, { t: 'pong' }); break;
      case 'name': c.name = cleanName(m.name); if (r) broadcastRoom(r); break;
      case 'acc': {
        let res; try { res = accountOp(m); } catch (e) { res = { ok: false, m: 'Erreur serveur.' }; }
        if (res.ok && res.user) c.name = cleanName(res.user);
        send(c, Object.assign({ t: 'accr', q: m.q }, res)); break;
      }
      case 'list': send(c, { t: 'rooms', list: [...rooms.values()].filter(x => !x.priv && x.state === 'lobby').map(x => { const h = clients.get(x.host); return { code: x.code, n: x.players.length, max: MAX_PLAYERS, host: h ? h.name : '?' }; }) }); break;
      case 'create': { const room = { code: newCode(), host: c.id, players: [], state: 'lobby', priv: !!m.priv, seed: 0, cfg: null }; rooms.set(room.code, room); joinRoom(c, room); break; }
      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) { send(c, { t: 'err', m: 'Salon introuvable. Vérifie le code.' }); break; }
        if (room.players.includes(c.id)) { broadcastRoom(room); break; }
        if (room.players.length >= MAX_PLAYERS) { send(c, { t: 'err', m: 'Salon complet (5 joueurs).' }); break; }
        if (room.state !== 'lobby') { send(c, { t: 'err', m: 'La partie a déjà commencé dans ce salon.' }); break; }
        joinRoom(c, room); break;
      }
      case 'leave': leaveRoom(c); send(c, { t: 'room', room: null }); break;
      case 'start':
        if (!r || r.host !== c.id) break;
        r.state = 'game'; r.seed = (m.seed >>> 0) || 1;
        r.cfg = m.cfg && JSON.stringify(m.cfg).length < 20000 ? m.cfg : null;
        for (const id of r.players) send(clients.get(id), { t: 'start', seed: r.seed, cfg: r.cfg, room: roomInfo(r) });
        break;
      case 'end': if (!r || r.host !== c.id) break; r.state = 'lobby'; broadcastRoom(r); break;
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
    c.ws = null; const r = c.room && rooms.get(c.room); if (r) broadcastRoom(r);
    c.graceT = setTimeout(() => { if (c.ws) return; leaveRoom(c); clients.delete(c.id); if (c.sid) bySid.delete(c.sid); }, GRACE_MS);
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignoré */ } } }, 15000);

loadAccounts().then(() => server.listen(PORT, () => console.log(`Mécanique Lebec v2 — serveur prêt : http://localhost:${PORT}/`)));
