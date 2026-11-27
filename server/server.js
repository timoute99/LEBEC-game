// =====================================================================
// server.js — Serveur de MÉCANIQUE LEBEC (V4)
// ---------------------------------------------------------------------
// 1) SALONS + RELAIS : le serveur ne fait pas tourner le jeu ; il gère des
//    salons (code de 4 lettres, 6 joueurs), relaie les messages et garde
//    la place d'un joueur 20 s après une coupure. L'HÔTE simule l'atelier.
//    On peut rejoindre une partie EN COURS (drop-in).
// 2) COMPTES : pseudo + mot de passe (scrypt), jeton signé, profil
//    (apparence, jetons, objets, succès). Stockage :
//      - fichier server/data/accounts.json (par défaut, local) ;
//      - OU un fichier dans un dépôt GitHub PRIVÉ si les variables
//        d'environnement GITHUB_TOKEN et GITHUB_REPO sont définies
//        (Render efface ses fichiers à chaque redémarrage).
//    AUTH_SECRET (variable d'environnement) signe les jetons.
// 3) SAUVEGARDES DE CAMPAGNE (entreprises) : un code de 6 caractères,
//    n'importe qui ayant le code peut charger / sauvegarder. Même stockage
//    que les comptes (fichier local ou dépôt GitHub privé, autre fichier).
// 4) Sert les fichiers du jeu (dossier parent) : http://localhost:8080/
//
// Protocole JSON (client → serveur) :
//   {t:'hello', name, sid}  {t:'list'}  {t:'create', priv}  {t:'join', code}
//   {t:'leave'}  {t:'name', name}  {t:'start', seed, cfg} (hôte)  {t:'end'} (hôte)
//   {t:'relay', d, to?}  {t:'ping'}
//   {t:'acc', q, op:'register'|'login'|'resume'|'save', user, pass, token, profile}
//     → {t:'accr', q, ok, m?, token?, user?, profile?}
//   {t:'camp', q, op:'create'|'load'|'put', code?, name?, data?}
//     → {t:'campr', q, ok, m?, code?, data?}
//   {t:'fb', q, kind:'idee'|'bug', text, name, ver, where}   (V5.1 : suggestions / bugs des joueurs)
//     → {t:'fbr', q, ok, m?}        {t:'fblist', q} → {t:'fbr', q, ok, list}
//   Lecture des retours : dans la page admin (onglet Retours) — /retours redirige vers /admin#retours.
// 5) STATISTIQUES + PAGE ADMIN (V5.4) : le jeu envoie un petit « battement » POST /api/hb
//    (visite, en jeu ou au menu, mode) toutes les 45 s. Page https://<serveur>/admin :
//    connexion avec un compte du jeu dont le pseudo est dans la variable ADMIN_USERS
//    (pseudos séparés par des virgules, à définir dans Render → Environment).
// =====================================================================
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const DATA = path.join(__dirname, 'data');
const VERSION = 4;
const MAX_PLAYERS = 6, GRACE_MS = 20000, RATE_PER_SEC = 150, MAX_MSG = 512 * 1024;

/* ======================= Stockage (comptes, sauvegardes) ======================= */
const GH = { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO };
const useGitHub = !!(GH.token && GH.repo);
// V5.4 : sinon, base « Key Value » de Render (Redis/Valkey) si KV_URL est défini — rien à configurer côté GitHub
const KV_URL = process.env.KV_URL || process.env.REDIS_URL || '';
const useKV = !useGitHub && !!KV_URL;
let kv = null;
if (useKV) {
  const Redis = require('ioredis');
  kv = new Redis(KV_URL, { maxRetriesPerRequest: 3, enableReadyCheck: false, connectTimeout: 10000, retryStrategy: n => Math.min(n * 500, 5000) });
  kv.on('error', e => console.warn('Base Key Value :', e.message));
}
const STORAGE = useGitHub ? 'github' : useKV ? 'base Render (Key Value)' : 'fichier';
let SECRET = process.env.AUTH_SECRET;
const SECRET_FROM_ENV = !!SECRET;
function ensureData() { try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) { /* rien */ } }
if (!SECRET) {
  ensureData();
  const f = path.join(DATA, 'secret.txt');
  try { SECRET = fs.readFileSync(f, 'utf8').trim(); } catch (e) { SECRET = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(f, SECRET); } catch (e2) { /* lecture seule */ } }
}
/** Un fichier JSON stocké soit dans server/data, soit dans le dépôt GitHub privé (Render efface ses fichiers) */
function makeStore(ghFile, localFile, label, delay = 2000) {
  // V5.3 : « ready » = fichier bien lu. Tant que ce n'est pas le cas, on n'écrit JAMAIS (sinon on écraserait tous les comptes
  // avec un fichier vide si GitHub ne répond pas au démarrage) et on réessaie toutes les 20 s. On fusionne ce qui a été lu
  // avec ce qui a pu être créé entre-temps.
  const st = { data: {}, sha: null, timer: null, ready: false, pending: false, label };
  const mergeIn = loaded => {
    if (!loaded || typeof loaded !== 'object') return;
    for (const k of Object.keys(loaded)) {
      if (Array.isArray(loaded[k]) && Array.isArray(st.data[k])) st.data[k] = loaded[k].concat(st.data[k]);
      else if (!(k in st.data)) st.data[k] = loaded[k];
    }
  };
  const api = (method, body) => fetch(`https://api.github.com/repos/${GH.repo}/contents/${encodeURIComponent(ghFile)}`, { method, headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'lebec-relay' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  st.load = async () => {
    if (useGitHub) {
      try {
        const r = await api('GET');
        if (r.status === 200) {
          const j = await r.json(); st.sha = j.sha;
          // les gros fichiers (> 1 Mo) n'ont pas de « content » : on passe par le blob
          let txt = j.content ? Buffer.from(j.content, 'base64').toString('utf8') : null;
          if (!txt && j.git_url) { const b = await fetch(j.git_url, { headers: { Authorization: `Bearer ${GH.token}`, 'User-Agent': 'lebec-relay' }, signal: AbortSignal.timeout(30000) }); if (b.ok) txt = Buffer.from((await b.json()).content, 'base64').toString('utf8'); }
          if (txt === null) throw new Error('contenu illisible');
          mergeIn(JSON.parse(txt) || {}); st.ready = true;
        } else if (r.status === 404) st.ready = true;                      // pas encore de fichier : on le créera
        else console.warn(`GitHub (${label}) : lecture impossible`, r.status);
      } catch (e) { console.warn(`GitHub (${label}) : erreur`, e.message); }
      if (!st.ready) { setTimeout(st.load, 20000); return; }
    } else if (useKV) {
      try { const raw = await kv.get('lebec:' + ghFile); if (raw) mergeIn(JSON.parse(raw)); st.ready = true; }
      catch (e) { console.warn(`Base Key Value (${label}) : lecture impossible`, e.message); setTimeout(st.load, 20000); return; }
    } else { try { mergeIn(JSON.parse(fs.readFileSync(path.join(DATA, localFile), 'utf8'))); } catch (e) { /* pas de fichier */ } st.ready = true; }
    console.log(`${label} chargés : ${Object.keys(st.data).length} (stockage ${STORAGE})`);
    if (st.pending) st.save();
  };
  const write = async () => {
    if (!st.ready) { st.pending = true; return; }
    st.pending = false;
    const txt = JSON.stringify(st.data);
    if (useGitHub) {
      for (let tries = 0; tries < 3; tries++) {
        try {
          const r = await api('PUT', { message: label + ' Lebec', content: Buffer.from(txt).toString('base64'), sha: st.sha || undefined });
          if (r.ok) { const j = await r.json(); st.sha = j.content.sha; return; }
          console.warn(`GitHub (${label}) : écriture refusée`, r.status);
          if (r.status === 409 || r.status === 422) { const g = await api('GET'); if (g.ok) st.sha = (await g.json()).sha; continue; }
        } catch (e) { console.warn(`GitHub (${label}) : erreur`, e.message); }
        await new Promise(r2 => setTimeout(r2, 1500));
      }
      st.pending = true; setTimeout(() => { if (st.pending) st.save(); }, 30000);           // on réessaiera plus tard, sans rien perdre
    } else if (useKV) {
      try { await kv.set('lebec:' + ghFile, txt); }
      catch (e) { console.warn(`Base Key Value (${label}) : écriture impossible`, e.message); st.pending = true; setTimeout(() => { if (st.pending) st.save(); }, 15000); }
    } else { ensureData(); try { fs.writeFileSync(path.join(DATA, localFile), txt); } catch (e) { console.warn('Écriture impossible', e.message); } }
  };
  st.save = () => { clearTimeout(st.timer); st.dirty = true; st.timer = setTimeout(() => { st.dirty = false; write(); }, delay); };
  st.flush = async () => { if (st.dirty || st.pending) { clearTimeout(st.timer); st.dirty = false; await write(); } };
  return st;
}
const ACC = makeStore(process.env.GITHUB_PATH || 'lebec-accounts.json', 'accounts.json', 'Comptes');
const SAVES = makeStore(process.env.GITHUB_SAVES || 'lebec-saves.json', 'saves.json', 'Sauvegardes');
const FEED = makeStore(process.env.GITHUB_FEEDBACK || 'lebec-retours.json', 'retours.json', 'Retours');   // V5.1 : suggestions et bugs
const STATS = makeStore(process.env.GITHUB_STATS || 'lebec-stats.json', 'stats.json', 'Statistiques', 60000);   // V5.4 : visites, temps de jeu (écrit au plus 1×/min)

/* ======================= V5.4 : statistiques (visites, joueurs en ligne, temps de jeu) ======================= */
const T0 = Date.now();
const online = new Map();                                    // sid → { n, user, g, m, np, v, t0, last, ip }
const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const hourOf = (t = Date.now()) => +new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }) % 24;
let uniqDay = '', uniqSet = new Set();
function statDay() {
  const D = STATS.data; D.days = D.days || {}; D.tot = D.tot || { v: 0, s: 0, g: 0 }; D.acc = D.acc || {};
  const k = dayKey(); if (!D.days[k]) { D.days[k] = { v: 0, u: 0, s: 0, g: 0, p: 0, a: 0, h: new Array(24).fill(0), m: {} };
    const ks = Object.keys(D.days).sort(); while (ks.length > 400) delete D.days[ks.shift()]; }
  return D.days[k];
}
const onlineNow = () => { const lim = Date.now() - 100000; let n = 0; for (const [sid, o] of online) { if (o.last < lim) online.delete(sid); else n++; } return n; };
function hb(req, m) {
  const now = Date.now(), sid = String(m.sid || '').slice(0, 40); if (!sid) return;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const d = statDay(), D = STATS.data; let o = online.get(sid);
  const k = m.tok ? verify(String(m.tok)) : null, user = k && accounts[k] ? accounts[k].name : null;
  if (!o) { o = { t0: now, last: now, g: 0 }; online.set(sid, o); }
  const dt = Math.min(90, (now - o.last) / 1000);
  if (o.g && m.e !== 'visit') { d.s += dt; D.tot.s += dt; if (k) { const A = D.acc[k] = D.acc[k] || { s: 0, g: 0, first: now }; A.s += dt; } }   // temps passé EN PARTIE
  Object.assign(o, { last: now, g: m.g ? 1 : 0, m: String(m.m || '').slice(0, 24), np: Math.min(9, +m.np || 1), v: String(m.v || '').slice(0, 10), n: String(m.n || '').replace(/[<>&"'`]/g, '').slice(0, 16), user });
  if (m.e === 'visit') {
    d.v++; D.tot.v++; d.h[hourOf(now)]++;
    if (uniqDay !== dayKey()) { uniqDay = dayKey(); uniqSet = new Set(); }
    const hid = crypto.createHash('sha256').update(ip + uniqDay + (SECRET || '')).digest('hex').slice(0, 16);   // on ne garde jamais l'adresse IP
    if (!uniqSet.has(hid)) { uniqSet.add(hid); d.u++; }
  }
  if (m.e === 'start') { d.g++; D.tot.g++; const md = o.m || '?'; d.m[md] = (d.m[md] || 0) + 1; if (k) { const A = D.acc[k] = D.acc[k] || { s: 0, g: 0, first: now }; A.g++; } }
  if (k) D.acc[k].last = now;
  d.p = Math.max(d.p, onlineNow());
  STATS.save();
}
const ADMINS = () => String(process.env.ADMIN_USERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const adminFails = new Map();
function adminData() {
  const D = STATS.data, now = Date.now(); onlineNow(); statDay();
  const days = Object.keys(D.days).sort().slice(-30).map(k => Object.assign({ d: k }, D.days[k]));
  const H = new Array(24).fill(0); days.forEach(x => (x.h || []).forEach((v, i) => { H[i] += v; }));
  const acc = Object.keys(accounts).map(k => { const a = accounts[k], st = D.acc[k] || {}, P = a.profile || {}; return { n: a.name, created: a.created || 0, last: st.last || 0, s: Math.round(st.s || 0), g: st.g || 0, days: (P.st || {}).days || 0, jetons: P.coins || 0, served: (P.st || {}).served || 0 }; });
  const cos = Object.keys(SAVES.data).map(c => { const e = SAVES.data[c], x = e.d || {}; return { code: c, name: x.name || '?', day: x.day || 1, money: x.money || 0, rep: x.rep || 0, mach: (x.mach || []).length, t: e.t || 0, won: !!x.won }; });
  return {
    now, up: Math.round((now - T0) / 1000), storage: useGitHub ? 'GitHub' : useKV ? 'base Render (Key Value)' : 'fichier local (effacé à chaque redémarrage !)', ready: { comptes: ACC.ready, sauvegardes: SAVES.ready, retours: FEED.ready, stats: STATS.ready },
    mem: Math.round(process.memoryUsage().rss / 1048576),
    online: [...online.entries()].map(([sid, o]) => ({ n: o.user || o.n || 'Anonyme', acc: !!o.user, g: o.g, m: o.m, np: o.np, v: o.v, since: o.t0, last: o.last })).sort((a, b) => b.g - a.g || a.since - b.since),
    ws: clients.size, rooms: [...rooms.values()].map(r => ({ code: r.code, host: (clients.get(r.host) || {}).name || '?', n: r.players.length, names: r.players.map(id => (clients.get(id) || {}).name || '?'), state: r.state, priv: r.priv })),
    today: D.days[dayKey()], days, hours: H, tot: Object.assign({ comptes: acc.length, entreprises: cos.length, retours: (FEED.data.list || []).length }, D.tot),
    players: acc.sort((a, b) => b.s - a.s || b.last - a.last).slice(0, 200),
    companies: cos.sort((a, b) => b.t - a.t).slice(0, 100),
    retours: fbIds().slice(-500).reverse().map(x => ({ id: x.id, d: x.d, k: x.k, n: x.n, t: x.t, v: x.v || '', w: x.w || '', done: !!x.done }))
  };
}
function adminApi(req, m) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), now = Date.now();
  const F = adminFails.get(ip) || { n: 0, t: now }; if (now - F.t > 600000) { F.n = 0; F.t = now; }
  if (F.n >= 8) return { ok: false, m: 'Trop d\'essais : réessaie dans 10 minutes.' };
  const L = ADMINS(); if (!L.length) return { ok: false, setup: 1, m: 'Aucun administrateur configuré. Dans Render → Environment, ajoute la variable ADMIN_USERS avec ton pseudo du jeu (plusieurs pseudos : séparés par des virgules), puis redémarre le service.' };
  if (!m.tok && !m.user) return { ok: false, m: '' };
  let k = null, token = null;
  if (m.tok) { k = verify(String(m.tok)); token = m.tok; }
  else { const u = String(m.user || '').trim().toLowerCase(), a = accounts[u]; if (a && hashPass(String(m.pass || ''), a.salt) === a.hash) { k = u; token = sign(u); } }
  if (!k || !L.includes(k)) { if (!m.tok) { F.n++; adminFails.set(ip, F); } return { ok: false, m: k ? 'Ce compte n\'est pas administrateur.' : (m.tok ? 'Session expirée.' : (ACC.ready ? 'Pseudo ou mot de passe incorrect.' : 'Le serveur des comptes démarre, réessaie dans 30 s.')) }; }
  // V5.4 : actions sur les retours (traité / à refaire / supprimer)
  if (m.op === 'fbdone' || m.op === 'fbdel') {
    const L = fbIds(), i = L.findIndex(x => x.id === +m.id);
    if (i >= 0) { if (m.op === 'fbdel') L.splice(i, 1); else L[i].done = !L[i].done; FEED.save(); }
  }
  return { ok: true, tok: token, me: accounts[k].name, data: adminData() };
}

/* ======================= Retours des joueurs (suggestions, bugs) ======================= */
const FB_MAX = 3000;
function fbOp(c, m) {
  if (!Array.isArray(FEED.data.list)) FEED.data.list = [];
  const L = FEED.data.list;
  if (m.op === 'list') return { ok: true, list: L.slice(-40).reverse().map(x => ({ d: x.d, k: x.k, n: x.n, t: x.t.slice(0, 300), v: x.v, done: !!x.done })) };
  const now = Date.now(); if (c.fbT && now - c.fbT < 15000) return { ok: false, m: 'Doucement : un message toutes les 15 secondes.' };
  const text = String(m.text || '').replace(/\r/g, '').trim().slice(0, 1500);
  if (text.length < 5) return { ok: false, m: 'Écris au moins quelques mots.' };
  c.fbT = now;
  L.push({ id: fbId(), d: new Date(now).toISOString().slice(0, 16).replace('T', ' '), k: m.kind === 'bug' ? 'bug' : 'idee', n: cleanName(m.name || c.name), t: text, v: String(m.ver || '').slice(0, 10), w: String(m.where || '').slice(0, 40) });
  if (L.length > FB_MAX) L.splice(0, L.length - FB_MAX);
  FEED.save(); return { ok: true };
}
const fbId = () => { const L = FEED.data.list || []; let mx = 0; for (const x of L) if (x.id > mx) mx = x.id; return mx + 1; };
// V5.4 : chaque retour a un numéro (les anciens en reçoivent un à la première lecture admin)
function fbIds() { const L = FEED.data.list || []; let mx = 0, ch = false; for (const x of L) if (x.id > mx) mx = x.id; for (const x of L) if (!x.id) { x.id = ++mx; ch = true; } if (ch) FEED.save(); return L; }
let accounts = {};               // clé = pseudo en minuscules (= ACC.data)
const scheduleSave = () => ACC.save();

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

/* ======================= Sauvegardes de campagne ======================= */
const MAX_SAVES = 3000, SAVE_MAX_LEN = 60000;          // V5 : la sauvegarde garde aussi les commandes en cours et le bazar
const CODE_L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newSaveCode() { for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += CODE_L[crypto.randomInt(CODE_L.length)]; if (!SAVES.data[c]) return c; } }
function campOp(m) {
  const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const okData = d => d && typeof d === 'object' && !Array.isArray(d) && JSON.stringify(d).length <= SAVE_MAX_LEN;
  switch (m.op) {
    case 'create': {
      if (!SAVES.ready) return { ok: false, m: 'Le serveur des sauvegardes démarre, réessaie dans 30 secondes.' };
      if (!okData(m.data)) return { ok: false, m: 'Sauvegarde invalide.' };
      const keys = Object.keys(SAVES.data);
      if (keys.length >= MAX_SAVES) { keys.sort((a, b) => SAVES.data[a].t - SAVES.data[b].t); for (const k of keys.slice(0, 100)) delete SAVES.data[k]; }
      const c = newSaveCode(); SAVES.data[c] = { t: Date.now(), d: Object.assign({}, m.data, { code: c }) }; SAVES.save();
      return { ok: true, code: c, data: SAVES.data[c].d };
    }
    case 'load': { const e = SAVES.data[code]; return e ? { ok: true, code, data: e.d } : { ok: false, m: SAVES.ready ? 'Aucune entreprise avec ce code.' : 'Le serveur des sauvegardes démarre, réessaie dans 30 secondes.' }; }
    case 'list': {                                                        // V5.3 : toutes les entreprises, pour que tout le monde y ait accès
      const L = Object.keys(SAVES.data).map(k => { const e = SAVES.data[k], d = e.d || {}; return { code: k, name: String(d.name || '?').slice(0, 30), day: +d.day || 1, money: Math.round(+d.money || 0), mach: Array.isArray(d.mach) ? d.mach.length : 0, t: e.t || 0 }; });
      L.sort((a, b) => b.t - a.t); return { ok: true, list: L.slice(0, 80) };
    }
    case 'put': {
      const e = SAVES.data[code]; if (!e) return { ok: false, m: 'Code inconnu.' };
      if (!okData(m.data)) return { ok: false, m: 'Sauvegarde trop grosse.' };
      e.t = Date.now(); e.d = Object.assign({}, m.data, { code }); SAVES.save(); return { ok: true, code };
    }
  }
  return { ok: false, m: 'Opération inconnue.' };
}
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
    ach: Array.isArray(p.ach) ? [...new Set(p.ach.filter(x => ID.test(String(x))).map(String))].slice(0, 100) : [],
    tuto: p.tuto ? 1 : 0,
    // V5.1 : entreprises (campagnes) enregistrées sur le compte
    camps: Array.isArray(p.camps) ? p.camps.filter(x => x && /^[A-Z0-9]{4,8}$/.test(String(x.code))).slice(0, 12).map(x => ({ code: String(x.code), name: String(x.name || '').replace(/[<>&"`]/g, '').slice(0, 30), day: int(x.day, 9999), t: int(x.t, 1e13) })) : []
  };
}
function accountOp(m) {
  if (!ACC.ready) return { ok: false, m: 'Le serveur des comptes démarre, réessaie dans 30 secondes.', wait: 1 };
  const user = String(m.user || '').trim().slice(0, 16), key = user.toLowerCase();
  switch (m.op) {
    case 'register': {
      if (!/^[\p{L}\p{N}_ .-]{3,16}$/u.test(user)) return { ok: false, m: 'Pseudo : 3 à 16 caractères (lettres, chiffres, espace, _ . -).' };
      if (String(m.pass || '').length < 4) return { ok: false, m: 'Mot de passe : 4 caractères minimum.' };
      if (accounts[key]) return { ok: false, m: 'Ce pseudo est déjà pris.' };
      const salt = crypto.randomBytes(16).toString('hex');
      accounts[key] = { name: user, salt, hash: hashPass(String(m.pass), salt), created: Date.now(), profile: cleanProfile(m.profile, user) };
      scheduleSave(); try { statDay().a++; STATS.save(); } catch (e) { /* stats facultatives */ }
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, v: VERSION, rooms: rooms.size, players: clients.size, accounts: Object.keys(accounts).length, saves: Object.keys(SAVES.data).length, storage: useGitHub ? 'github' : 'fichier', ready: { comptes: ACC.ready, sauvegardes: SAVES.ready, retours: FEED.ready } }));
    return;
  }
  if (url === '/api/hb' && req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }
  if ((url === '/api/hb' || url === '/admin/api') && req.method === 'POST') {           // V5.4 : statistiques + page admin
    let body = ''; req.on('data', ch => { body += ch; if (body.length > 4000) req.destroy(); });
    req.on('end', () => {
      let m = {}; try { m = JSON.parse(body || '{}'); } catch (e) { /* vide */ }
      let out = { ok: true };
      try { if (url === '/api/hb') hb(req, m); else out = adminApi(req, m); } catch (e) { out = { ok: false, m: 'Erreur serveur.' }; console.warn('stats', e.message); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(out));
    });
    return;
  }
  if (url === '/admin' || url === '/admin/') { fs.readFile(path.join(__dirname, 'admin.html'), (err, data) => { res.writeHead(err ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }); res.end(err ? 'admin.html manquant' : data); }); return; }
  if (url === '/retours' || url === '/retours/' || url === '/retours.txt') { res.writeHead(302, { Location: '/admin#retours' }); res.end(); return; }   // V5.4 : réunis dans la page admin
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
  c.idx = [0, 1, 2, 3, 4, 5].find(i => !used.has(i)) || 0;
  r.players.push(c.id); c.room = r.code; broadcastRoom(r);
  // partie en cours : le nouveau venu démarre directement (drop-in), l'hôte l'ajoute à sa simulation
  if (r.state === 'game') send(c, { t: 'start', seed: r.seed, cfg: r.cfg, room: roomInfo(r), late: true });
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
      case 'camp': {
        let res; try { res = campOp(m); } catch (e) { res = { ok: false, m: 'Erreur serveur.' }; }
        send(c, Object.assign({ t: 'campr', q: m.q }, res)); break;
      }
      case 'fb': case 'fblist': {
        let res; try { res = fbOp(c, m.t === 'fblist' ? { op: 'list' } : m); } catch (e) { res = { ok: false, m: 'Erreur serveur.' }; }
        send(c, Object.assign({ t: 'fbr', q: m.q }, res)); break;
      }
      case 'list': send(c, { t: 'rooms', list: [...rooms.values()].filter(x => !x.priv).map(x => { const h = clients.get(x.host); return { code: x.code, n: x.players.length, max: MAX_PLAYERS, host: h ? h.name : '?', game: x.state === 'game' }; }) }); break;
      case 'create': { const room = { code: newCode(), host: c.id, players: [], state: 'lobby', priv: !!m.priv, seed: 0, cfg: null }; rooms.set(room.code, room); joinRoom(c, room); break; }
      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) { send(c, { t: 'err', m: 'Salon introuvable. Vérifie le code.' }); break; }
        if (room.players.includes(c.id)) { broadcastRoom(room); break; }
        if (room.players.length >= MAX_PLAYERS) { send(c, { t: 'err', m: `Salon complet (${MAX_PLAYERS} joueurs).` }); break; }
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

// V5.3 : Render arrête le serveur avec SIGTERM (mise en veille, redéploiement) : on écrit tout avant de partir
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { try { await Promise.race([Promise.all([ACC.flush(), SAVES.flush(), FEED.flush(), STATS.flush()]), new Promise(r => setTimeout(r, 8000))]); } finally { process.exit(0); } });
accounts = ACC.data;                                                       // même objet pour toujours (les lectures fusionnent dedans)
// V5.4 : on écoute TOUT DE SUITE (Render attend le port) ; les données arrivent derrière, les « ready » protègent les écritures
server.listen(PORT, () => console.log(`Mécanique Lebec — serveur prêt : http://localhost:${PORT}/`));
// V5.4 : sans AUTH_SECRET, la clé qui signe les sessions est gardée dans la base (sinon tout le monde serait déconnecté à chaque réveil du serveur)
async function loadSecret() {
  if (SECRET_FROM_ENV || !useKV) return;
  for (;;) {
    try { const s0 = await kv.get('lebec:secret'); if (s0) SECRET = s0; else await kv.set('lebec:secret', SECRET); return; }
    catch (e) { console.warn('Base Key Value (clé) :', e.message); await new Promise(r => setTimeout(r, 5000)); }
  }
}
loadSecret().then(() => Promise.all([ACC.load(), SAVES.load(), FEED.load(), STATS.load()])).then(() => { accounts = ACC.data; });
