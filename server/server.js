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
//   {t:'acc', q, op:'cload'|'csave', token, career}   (ANCIENNE sauvegarde perso → saves/<pseudo>.json)
//     → {t:'accr', q, ok, m?, token?, user?, profile?}
//   ENTREPRISES (carrières d'équipe, saves/careers/<id>.json) — même message 'acc' :
//     op:'clist'                          → {list:[{id,name,owner,members,rev,saved,day,money,mid}]}
//     op:'ccreate', name, career          → {info, rev, career}
//     op:'cload', cid                     → {info, career, rev}
//     op:'csave', cid, rev (base), career → {rev} | {ok:false, conflict:true, career, rev} si quelqu'un a sauvé entre-temps
//     op:'cinvite', cid, user  ·  op:'cleave', cid  ·  op:'crename', cid, name
//     (membres seulement ; l'hôte d'un salon lancé avec cfg.cid par un membre peut aussi cload/csave)
// Serveur → client : {t:'host', id, name, old, mig} (mig = migration d'hôte en pleine partie : le nouvel
//   hôte relance la journée) ; {t:'start', seed, cfg, room, gen} (renvoyé à un joueur qui revient si
//   une journée a été relancée pendant sa coupure).
// =====================================================================
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const DATA = path.join(__dirname, 'data');
const VERSION = 2;
const MAX_PLAYERS = 5, GRACE_MS = 20000, RATE_PER_SEC = 150, MAX_MSG = 512 * 1024;
const HOST_WAIT_MS = +process.env.HOST_WAIT_MS || 5000;   // hôte coupé en pleine partie : délai avant migration

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

/* ======================= Sauvegardes de CARRIÈRE =======================
   Stockage de fichiers JSON (cache mémoire + écriture différée de 5 s pour ne pas spammer l'API) :
   - GitHub : <GITHUB_SAVES_DIR ou 'saves'>/<chemin> dans le même dépôt ;
   - sinon : server/data/saves/<chemin>.
   Fichiers :
   - <pseudo>.json            : ANCIENNE sauvegarde perso (V5), migrée en entreprise au premier 'clist' ;
   - careers/<id>.json        : ENTREPRISE (carrière d'équipe) { v, id, name, owner, members:[pseudos], rev, saved, car }.
   L'index « mes entreprises » de chaque joueur est dans son compte : accounts[pseudo].careers = [id…]. */
const SAVES_DIR = process.env.GITHUB_SAVES_DIR || 'saves';
const files = new Map();          // chemin relatif → { txt, sha, timer, loaded }
async function ghFile(method, file, body) {
  const url = `https://api.github.com/repos/${GH.repo}/contents/${file.split('/').map(encodeURIComponent).join('/')}`;
  return fetch(url, { method, headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'lebec-relay' }, body: body ? JSON.stringify(body) : undefined });
}
/** Lit un fichier de sauvegarde → texte, null (absent) ou undefined (erreur réseau) */
async function fileLoad(rel) {
  const f = files.get(rel); if (f && f.loaded) return f.txt;
  let txt = null, sha = null;
  if (useGitHub) {
    try {
      const r = await ghFile('GET', `${SAVES_DIR}/${rel}`);
      if (r.status === 200) { const j = await r.json(); sha = j.sha; txt = Buffer.from(j.content, 'base64').toString('utf8'); }
      else if (r.status !== 404) { console.warn('GitHub (sauvegarde) : lecture', rel, r.status); return undefined; }
    } catch (e) { console.warn('GitHub (sauvegarde) : lecture', e.message); return undefined; }
  } else { try { txt = fs.readFileSync(path.join(DATA, 'saves', rel), 'utf8'); } catch (e) { txt = null; } }
  const e = files.get(rel) || {};
  if (e.loaded) { if (e.sha == null) e.sha = sha; } else Object.assign(e, { txt, sha, loaded: true });
  files.set(rel, e); return e.txt;
}
async function fileFlush(rel) {
  const c = files.get(rel); if (!c) return; clearTimeout(c.timer); c.timer = null;
  if (!c.dirty) return; c.dirty = false;
  if (useGitHub) {
    try {
      if (c.sha === undefined) { const g = await ghFile('GET', `${SAVES_DIR}/${rel}`); c.sha = g.ok ? (await g.json()).sha : null; }
      const r = await ghFile('PUT', `${SAVES_DIR}/${rel}`, { message: `sauvegarde ${rel}`, content: Buffer.from(c.txt).toString('base64'), sha: c.sha || undefined });
      if (r.ok) c.sha = (await r.json()).content.sha;
      else if (r.status === 409 || r.status === 422) { const g = await ghFile('GET', `${SAVES_DIR}/${rel}`); if (g.ok) c.sha = (await g.json()).sha; fileStore(rel, c.txt); }
      else console.warn('GitHub (sauvegarde) : écriture refusée', rel, r.status);
    } catch (e) { console.warn('GitHub (sauvegarde) : erreur', e.message); fileStore(rel, c.txt); }
  } else {
    try { const f = path.join(DATA, 'saves', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c.txt); }
    catch (e) { console.warn('Sauvegarde impossible', rel, e.message); }
  }
}
function fileStore(rel, txt) {
  const c = files.get(rel) || {}; c.txt = txt; c.loaded = true; c.dirty = true; files.set(rel, c);
  clearTimeout(c.timer); c.timer = setTimeout(() => fileFlush(rel), 5000);
}
/** Arrêt du serveur (Render redémarre / met en veille) : on écrit tout ce qui attend */
async function flushAll() { await Promise.all([...files.keys()].map(fileFlush)); }
let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  if (stopping) return; stopping = true;
  clearTimeout(saveTimer);
  const accTxt = JSON.stringify(accounts);
  const accP = useGitHub ? ghApi('PUT', { message: 'comptes Lebec', content: Buffer.from(accTxt).toString('base64'), sha: GH.sha || undefined }).catch(() => null)
    : Promise.resolve().then(() => { ensureData(); try { fs.writeFileSync(path.join(DATA, 'accounts.json'), accTxt); } catch (e) { /* rien */ } });
  Promise.race([Promise.all([flushAll(), accP]), new Promise(r => setTimeout(r, 8000))]).then(() => process.exit(0));
});

/* ---------- Entreprises (carrières d'équipe) ---------- */
const teams = new Map();          // id → objet entreprise (déjà lu)
const CID = /^c[0-9a-f]{12}$/;
const newCid = () => 'c' + crypto.randomBytes(6).toString('hex');
const cleanCareerName = n => String(n || '').replace(/[<>&"'`]/g, '').trim().slice(0, 32) || 'Mécanique Lebec';
async function teamLoad(cid) {
  if (!CID.test(cid)) return null;
  if (teams.has(cid)) return teams.get(cid);
  const txt = await fileLoad(`careers/${cid}.json`);
  if (txt === undefined) return undefined;
  let t = null; try { t = txt ? JSON.parse(txt) : null; } catch (e) { t = null; }
  if (t && !teams.has(cid)) teams.set(cid, t);
  return teams.get(cid) || null;
}
function teamPut(t) { teams.set(t.id, t); fileStore(`careers/${t.id}.json`, JSON.stringify(t)); }
function teamInfo(t) {
  const nm = k => (accounts[k] ? accounts[k].name : k), car = t.car || {};
  return { id: t.id, name: t.name, owner: nm(t.owner), members: t.members.map(nm), rev: t.rev, saved: t.saved, day: car.day || 1, money: car.money, mid: !!car.mid };
}
function teamNew(owner, name, car) {
  const t = { v: 1, id: newCid(), name: cleanCareerName(name), owner, members: [owner], rev: 1, saved: Date.now(), car: car && typeof car === 'object' ? car : null };
  if (t.car) Object.assign(t.car, { cid: t.id, rev: 1, name: t.name });
  teamPut(t);
  const a = accounts[owner]; a.careers = (a.careers || []).concat(t.id); scheduleSave();
  return t;
}
/** Ancienne sauvegarde perso (saves/<pseudo>.json) → entreprise dont il est le patron (une seule fois) */
async function migrateLegacy(k, a) {
  if (a.legacyDone) return; a.legacyDone = true;
  const txt = await fileLoad(`${k}.json`);
  if (txt === undefined) { a.legacyDone = false; return; }          // GitHub indisponible : on réessaiera
  let car = null; try { car = txt ? JSON.parse(txt) : null; } catch (e) { car = null; }
  if (car && car.v) teamNew(k, car.name, car);
  scheduleSave();
}
const MAX_TEAMS = 8, MAX_MEMBERS = 10, MAX_SAVE = 400000;
async function careerOp(m, c) {
  const k = verify(m.token), a = k && accounts[k];
  const deny = { ok: false, m: 'Tu ne fais pas partie de cette entreprise.' };
  // --- ancien protocole (sauvegarde perso, sans id d'entreprise) ---
  if ((m.op === 'cload' || m.op === 'csave') && !m.cid) {
    if (!a) return { ok: false, m: 'Connecte-toi à ton compte pour sauvegarder la carrière en ligne.' };
    if (m.op === 'cload') { const txt = await fileLoad(`${k}.json`); return { ok: true, career: txt ? JSON.parse(txt) : null }; }
    const txt = JSON.stringify(m.career || null);
    if (txt.length > MAX_SAVE) return { ok: false, m: 'Sauvegarde trop grosse.' };
    fileStore(`${k}.json`, txt); return { ok: true };
  }
  if (m.op === 'clist') {
    if (!a) return { ok: false, m: 'Connecte-toi à ton compte.' };
    await migrateLegacy(k, a);
    const list = [], keep = [];
    for (const id of a.careers || []) { const t = await teamLoad(id); if (t === undefined) { keep.push(id); continue; } if (t && t.members.includes(k)) { keep.push(id); list.push(teamInfo(t)); } }
    if (keep.length !== (a.careers || []).length) { a.careers = keep; scheduleSave(); }
    return { ok: true, list };
  }
  if (m.op === 'ccreate') {
    if (!a) return { ok: false, m: 'Connecte-toi à ton compte pour créer une entreprise.' };
    if ((a.careers || []).length >= MAX_TEAMS) return { ok: false, m: `${MAX_TEAMS} entreprises maximum : quittes-en une.` };
    if (JSON.stringify(m.career || null).length > MAX_SAVE) return { ok: false, m: 'Sauvegarde trop grosse.' };
    const t = teamNew(k, m.name, m.career);
    return { ok: true, info: teamInfo(t), rev: t.rev, career: t.car };
  }
  const cid = String(m.cid || ''), t = await teamLoad(cid);
  if (t === undefined) return { ok: false, m: 'Stockage indisponible, réessaie.' };
  if (!t) return { ok: false, m: 'Entreprise introuvable.' };
  const member = !!(a && t.members.includes(k));
  const r = c && c.room && rooms.get(c.room), roomAuth = !!(r && r.cid === cid && r.host === c.id);   // hôte d'un salon lancé par un membre (reprise après migration)
  switch (m.op) {
    case 'cload': if (!member && !roomAuth) return deny; return { ok: true, info: teamInfo(t), career: t.car, rev: t.rev };
    case 'csave': {
      if (!member && !roomAuth) return deny;
      const base = Math.floor(+m.rev || 0);
      if (base < t.rev) return { ok: false, conflict: true, m: "Quelqu'un a joué entre-temps.", career: t.car, rev: t.rev, info: teamInfo(t) };
      const car = m.career && typeof m.career === 'object' ? m.career : null;
      if (!car || JSON.stringify(car).length > MAX_SAVE) return { ok: false, m: 'Sauvegarde invalide ou trop grosse.' };
      t.rev++; t.saved = Date.now(); t.car = Object.assign(car, { cid, rev: t.rev, name: t.name }); teamPut(t);
      return { ok: true, rev: t.rev, info: teamInfo(t) };
    }
    case 'cinvite': {
      if (!member) return deny;
      const uk = String(m.user || '').trim().toLowerCase(), b = accounts[uk];
      if (!b) return { ok: false, m: `Aucun compte « ${String(m.user || '').slice(0, 16)} ».` };
      if (t.members.includes(uk)) return { ok: false, m: `${b.name} fait déjà partie de l'entreprise.` };
      if (t.members.length >= MAX_MEMBERS) return { ok: false, m: `${MAX_MEMBERS} membres maximum.` };
      if ((b.careers || []).length >= MAX_TEAMS) return { ok: false, m: `${b.name} a déjà ${MAX_TEAMS} entreprises.` };
      t.members.push(uk); b.careers = (b.careers || []).concat(cid); teamPut(t); scheduleSave();
      return { ok: true, info: teamInfo(t) };
    }
    case 'cleave': {
      if (!member) return deny;
      t.members = t.members.filter(x => x !== k); a.careers = (a.careers || []).filter(x => x !== cid);
      if (t.owner === k) t.owner = t.members[0] || null;
      teamPut(t); scheduleSave(); return { ok: true };
    }
    case 'crename': {
      if (!member) return deny;
      t.name = cleanCareerName(m.name); if (t.car) t.car.name = t.name; teamPut(t);
      return { ok: true, info: teamInfo(t) };
    }
  }
  return { ok: false, m: 'Opération inconnue.' };
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
/** Change d'hôte. mig = true : la partie était en cours → le nouvel hôte relance la journée chez tous */
function setHost(r, id, mig) {
  const old = clients.get(r.host), h = clients.get(id);
  r.host = id;
  for (const pid of r.players) send(clients.get(pid), { t: 'host', id, name: h ? h.name : '?', old: old ? old.name : '?', mig: !!mig });
  broadcastRoom(r);
}
/** Joueur connecté de préférence (sinon le premier venu) */
const pickHost = (r, not) => r.players.find(id => id !== not && clients.get(id) && clients.get(id).ws) || r.players.find(id => id !== not);
function leaveRoom(c) {
  const r = c.room && rooms.get(c.room); c.room = null; clearTimeout(c.migT); if (!r) return;
  r.players = r.players.filter(id => id !== c.id);
  if (!r.players.length) { rooms.delete(r.code); return; }
  if (r.host === c.id) { setHost(r, pickHost(r), r.state === 'game'); return; }
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
        clearTimeout(old.graceT); clearTimeout(old.migT); c = old; c.ws = ws; c.name = cleanName(m.name || c.name);
        const r = c.room && rooms.get(c.room);
        send(c, { t: 'welcome', id: c.id, v: VERSION, resumed: true, room: r ? roomInfo(r) : null }); if (r) broadcastRoom(r);
        // une journée a été (re)lancée pendant la coupure (ex. migration d'hôte) : on la lui renvoie
        if (r && r.state === 'game' && r.gen && c.gen !== r.gen) { c.gen = r.gen; send(c, { t: 'start', seed: r.seed, cfg: r.cfg, room: roomInfo(r), gen: r.gen }); }
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
        if (/^c(load|save|list|create|invite|leave|rename)$/.test(m.op)) {            // carrière / entreprises : asynchrone (GitHub)
          careerOp(m, c).catch(e => { console.warn('carrière', e && e.message); return { ok: false, m: 'Erreur serveur.' }; }).then(res => send(c, Object.assign({ t: 'accr', q: m.q }, res)));
          break;
        }
        let res; try { res = accountOp(m); } catch (e) { res = { ok: false, m: 'Erreur serveur.' }; }
        if (res.ok && res.user) { c.name = cleanName(res.user); c.user = String(res.user).toLowerCase(); }
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
        r.cfg = m.cfg && JSON.stringify(m.cfg).length < 120000 ? m.cfg : null;
        { // entreprise (carrière d'équipe) : l'hôte de CE salon pourra la charger/sauvegarder même s'il n'en est pas membre (reprise après migration)
          const cid = r.cfg && typeof r.cfg.cid === 'string' ? r.cfg.cid : null, t = cid && teams.get(cid);
          r.cid = cid && (r.cid === cid || (t && c.user && t.members.includes(c.user))) ? cid : null;
        }
        r.gen = (r.gen || 0) + 1;
        for (const id of r.players) { const p = clients.get(id); if (p && p.ws) p.gen = r.gen; send(p, { t: 'start', seed: r.seed, cfg: r.cfg, room: roomInfo(r), gen: r.gen }); }
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
    // MIGRATION D'HÔTE : l'hôte d'une partie en cours ne revient pas vite → un autre joueur connecté reprend la journée.
    // L'ancien hôte garde sa place 20 s (GRACE_MS) : s'il revient, il rejoint la partie relancée comme simple joueur.
    if (r && r.host === c.id && r.state === 'game') {
      clearTimeout(c.migT);
      c.migT = setTimeout(() => {
        const rr = rooms.get(r.code); if (c.ws || !rr || rr.host !== c.id || rr.state !== 'game') return;
        const nh = rr.players.find(id => id !== c.id && clients.get(id) && clients.get(id).ws);
        if (nh) setHost(rr, nh, true);
      }, HOST_WAIT_MS);
    }
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignoré */ } } }, 15000);

loadAccounts().then(() => server.listen(PORT, () => console.log(`Mécanique Lebec v2 — serveur prêt : http://localhost:${PORT}/`)));
