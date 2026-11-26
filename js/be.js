/* =====================================================================
   be.js — CARRIÈRE côté CLIENT : le PC du BE (« LebecOS 95 »), le HUD
   carrière (argent, réputation, jour, livraisons) et le bilan de fin de
   journée. Tout est local à chaque joueur : on LIT l'état diffusé par
   l'hôte (ML.Game.S.car, S.stock, S.machDefs) et on envoie des
   intentions { a:'be', op, ... } que l'hôte valide (sim_career.js).

   API :
     ML.CareerUI.open() / close()     : allumer / éteindre le PC
     ML.CareerUI.hud(S)               : appelé par hud.js (4 fois / s)
     ML.CareerUI.endPanel(res)        : { camp: html, nextLabel } (game.js)
   Ouverture : [E] sur la cible 'be' (ou 'pc' en carrière s'il n'y a pas
   de 'be' et pas d'Arexis en cours) → rules.js. Échap ou ✕ : fermer.
   ===================================================================== */
(function () {
  const CU = ML.CareerUI = { isOpen: false };
  const U = ML.U, $ = id => document.getElementById(id);
  const esc = s => U.esc(s == null ? '' : s);
  const fmt = n => ML.Career.fmt(n);
  const sgn = n => (n > 0 ? '+' : '') + fmt(n);
  const CAT = () => ML.CAREER;
  const G = () => ML.Game;
  const S_ = () => (ML.Game ? ML.Game.S : null);
  const comp = id => (ML.COMPANIES[id] || { name: id }).name;
  const hex = n => (typeof n === 'string' ? n : '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0'));
  const clockOf = t => { const C = ML.CFG; return U.fmt(C.DAY_START + (t || 0) * (C.DAY_END - C.DAY_START) / C.SHIFT_SEC); };
  const now = () => (ML.Game && ML.Game.rt) || (S_() && S_().rt) || 0;
  const stars = (rep, n) => { n = n || 5; const k = Math.round((rep || 0) / (100 / n)); let s = ''; for (let i = 1; i <= n; i++) s += `<i class="${i <= k ? 'on' : ''}">★</i>`; return `<span class="be-stars" title="Réputation ${rep}/100">${s}</span>`; };
  const bar = (v, cls) => `<span class="be-pbar ${cls || ''}"><i style="width:${Math.round(U.clamp(v, 0, 1) * 100)}%"></i></span>`;
  const SIZE = { s: 'petite', m: 'moyenne', l: 'GROSSE (palette)' };
  const KIND = { plain: '', fonderie: '🔥 brut de fonderie', chaudro: '⚙️ chaudronnerie', tth: '♨️ traitement thermique' };
  const KICON = { vente: '💶', achat: '🛒', machine: '🏭', travaux: '🏗', amende: '🚨', penalite: '⏰', salaire: '👷', charges: '💡', objectif: '🏆' };
  const KNAME = { vente: 'Ventes', achat: 'Achats', machine: 'Machines', travaux: 'Travaux', amende: 'Amendes', penalite: 'Pénalités', salaire: 'Salaires', charges: 'Charges', objectif: 'Objectifs' };
  const INTERVIEW = {
    forgetful: ["« J'ai oublié pourquoi je suis venu… ah si, le boulot. »", '« Mon CV ? Je l\'ai laissé… quelque part. »'],
    robot: ['« Vous dites, je fais. Même si c\'est écrit à l\'envers dans le poly. »', '« Erreur ? Quelle erreur ? Le programme l\'a demandé. »'],
    hungry: ['« Y a des viennoiseries le matin ? C\'est pour savoir. »', '« Je bosse dur. Entre deux pains au chocolat. »'],
    deadstop: ['« Je suis le plus rapide de Bretagne. Quand je suis réveillé. »', '« 3 pièces en 2 minutes. Puis sieste. »'],
    apprenti: ['« J\'ai mon CAP dans 3 ans. Je sais déjà ce qu\'est un tour. Presque. »', '« C\'est quoi une prise d\'origine ? Je note. »']
  };
  const canPay = price => { const S = S_(); return !!(S && S.car) && S.car.money - price >= CAT().BANKRUPT * 0.5; };

  /* ======================= Dessins (SVG inline) ======================= */
  /** Une machine du catalogue, dessinée selon son type et sa gamme (tier) */
  function machSvg(model) {
    const M = CAT().MACHINES[model] || {}, t = M.tier || 0, tour = M.type === 'tour', K = '#22262d';
    let s = `<svg viewBox="0 0 120 72" class="be-msvg" aria-hidden="true"><ellipse cx="60" cy="67" rx="52" ry="4" fill="rgba(0,0,0,.25)"/>`;
    if (t < 2) {
      const c = t === 0 ? '#b5651d' : '#5d8a6a', c2 = t === 0 ? '#8a4a16' : '#43705a';
      if (tour) {
        s += `<rect x="14" y="48" width="8" height="16" fill="${c2}" stroke="${K}" stroke-width="2"/><rect x="96" y="48" width="8" height="16" fill="${c2}" stroke="${K}" stroke-width="2"/>`;
        s += `<rect x="8" y="38" width="104" height="11" rx="2" fill="${c}" stroke="${K}" stroke-width="2.5"/>`;
        s += `<rect x="8" y="14" width="28" height="25" rx="3" fill="${c}" stroke="${K}" stroke-width="2.5"/><circle cx="43" cy="27" r="8" fill="#c9ced4" stroke="${K}" stroke-width="2.5"/>`;
        s += `<line x1="51" y1="27" x2="88" y2="27" stroke="#9aa3ad" stroke-width="4"/><rect x="86" y="20" width="18" height="19" rx="2" fill="${c}" stroke="${K}" stroke-width="2.5"/><rect x="58" y="30" width="14" height="8" fill="${c2}" stroke="${K}" stroke-width="2"/>`;
      } else {
        s += `<rect x="30" y="54" width="62" height="10" rx="2" fill="${c2}" stroke="${K}" stroke-width="2.5"/><rect x="70" y="8" width="22" height="48" rx="2" fill="${c}" stroke="${K}" stroke-width="2.5"/>`;
        s += `<rect x="36" y="8" width="44" height="15" rx="3" fill="${c}" stroke="${K}" stroke-width="2.5"/><rect x="50" y="22" width="9" height="13" fill="#9aa3ad" stroke="${K}" stroke-width="2"/>`;
        s += `<rect x="20" y="38" width="62" height="8" rx="2" fill="#c9ced4" stroke="${K}" stroke-width="2.5"/><circle cx="22" cy="42" r="4" fill="${c2}" stroke="${K}" stroke-width="2"/>`;
      }
      if (t === 0) s += `<circle cx="20" cy="44" r="2.5" fill="#6b2f0c"/><circle cx="78" cy="30" r="3" fill="#6b2f0c"/><circle cx="30" cy="20" r="2" fill="#6b2f0c"/>` +
        `<g fill="#cfd3d8" stroke="${K}" stroke-width="1.5" opacity=".9"><circle cx="16" cy="9" r="5"/><circle cx="24" cy="5" r="4"/><circle cx="9" cy="4" r="3"/></g>`;
    } else {
      const body = ['', '', '#dfe6e9', '#f3e9d2', '#eef2f7'][t], trim = ['', '', '#24457a', '#e94f37', '#10223f'][t];
      s += `<rect x="6" y="10" width="108" height="52" rx="7" fill="${body}" stroke="${K}" stroke-width="3"/>`;
      s += `<rect x="6" y="52" width="108" height="10" rx="3" fill="${trim}" stroke="${K}" stroke-width="2.5"/>`;
      if (t >= 3) for (let i = 0; i < 9; i++) s += `<path d="M${12 + i * 11} 62 l6 -10 h5 l-6 10z" fill="#ffc93c" opacity=".85"/>`;
      s += `<rect x="16" y="17" width="60" height="31" rx="4" fill="${t === 4 ? '#7fd3ff' : '#a9dcf2'}" stroke="${K}" stroke-width="2.5"/>`;
      if (tour) { s += `<circle cx="30" cy="33" r="7" fill="#c9ced4" stroke="${K}" stroke-width="2"/><line x1="37" y1="33" x2="${t >= 3 ? 52 : 68}" y2="33" stroke="#7f8c8d" stroke-width="4"/>`; if (t >= 3) s += `<circle cx="62" cy="33" r="7" fill="#c9ced4" stroke="${K}" stroke-width="2"/>`; }
      else { s += `<rect x="40" y="18" width="12" height="14" fill="#7f8c8d" stroke="${K}" stroke-width="2"/><rect x="26" y="40" width="40" height="6" fill="#c9ced4" stroke="${K}" stroke-width="2"/>`; if (t === 4) s += `<path d="M46 32 l6 6 l-4 3" stroke="${K}" stroke-width="2.5" fill="none"/>`; }
      s += `<rect x="82" y="16" width="25" height="32" rx="3" fill="#22262d"/><rect x="85" y="19" width="19" height="12" rx="2" fill="#3ecf8e"/>`;
      s += `<circle cx="89" cy="38" r="2.5" fill="#e94f37"/><circle cx="96" cy="38" r="2.5" fill="#ffc93c"/><circle cx="103" cy="38" r="2.5" fill="#3ecf8e"/>`;
      s += `<rect x="100" y="2" width="4" height="9" fill="${K}"/><circle cx="102" cy="3" r="3" fill="${t === 4 ? '#3ecf8e' : '#f28c28'}" stroke="${K}" stroke-width="1.5"/>`;
      if (t === 4) s += `<text x="46" y="46" font-size="9" font-weight="900" fill="#10223f" font-family="Arial Black,Arial">5X</text>`;
    }
    return s + '</svg>';
  }
  /** Petite tête d'ouvrier d'après son apparence */
  function faceSvg(look) {
    look = look || {};
    const skin = hex(look.skin || 0xf0c8a0), shirt = hex(look.shirt || 0x2980b9), hair = hex(look.hair || 0x3b2a1a), K = '#22262d';
    let s = `<svg viewBox="0 0 48 48" class="be-face" aria-hidden="true"><rect x="0" y="0" width="48" height="48" rx="10" fill="#7fd3ff"/>`;
    s += `<path d="M6 48 q0 -14 18 -14 q18 0 18 14z" fill="${shirt}" stroke="${K}" stroke-width="2.5"/>`;
    if (look.longHair) s += `<path d="M11 22 q0 -14 13 -14 q13 0 13 14 v12 h-26z" fill="${hair}" stroke="${K}" stroke-width="2"/>`;
    s += `<circle cx="24" cy="21" r="11" fill="${skin}" stroke="${K}" stroke-width="2.5"/>`;
    s += `<path d="M13 19 q2 -11 11 -11 q9 0 11 11 q-6 -5 -11 -4 q-6 0 -11 4z" fill="${hair}" stroke="${K}" stroke-width="2"/>`;
    s += `<circle cx="20" cy="22" r="1.6" fill="${K}"/><circle cx="28" cy="22" r="1.6" fill="${K}"/>`;
    if (look.glasses) s += `<g fill="none" stroke="${K}" stroke-width="1.6"><circle cx="20" cy="22" r="3.4"/><circle cx="28" cy="22" r="3.4"/><line x1="23.4" y1="22" x2="24.6" y2="22"/></g>`;
    s += look.beard ? `<path d="M15 25 q9 12 18 0 q-2 8 -9 8 q-7 0 -9 -8z" fill="${hair}" stroke="${K}" stroke-width="1.5"/>` : `<path d="M20 27 q4 3 8 0" stroke="${K}" stroke-width="1.6" fill="none"/>`;
    return s + '</svg>';
  }
  /** Fond d'écran : Lebec et sa pelle */
  const WALL = `<svg class="be-wall-lebec" viewBox="0 0 260 300" aria-hidden="true">
    <ellipse cx="130" cy="290" rx="95" ry="9" fill="rgba(0,0,0,.25)"/>
    <g transform="rotate(-24 200 150)"><rect x="196" y="18" width="11" height="200" rx="4" fill="#b07b46" stroke="#22262d" stroke-width="5"/><rect x="186" y="10" width="31" height="13" rx="6" fill="#e94f37" stroke="#22262d" stroke-width="5"/>
      <path d="M180 214h44v30c0 16-10 28-22 34-12-6-22-18-22-34z" fill="#c9ced4" stroke="#22262d" stroke-width="5" stroke-linejoin="round"/><path d="M192 224v20" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/></g>
    <path d="M70 284 v-60 h34 v60z M110 284 v-60 h34 v60z" fill="#2c3e50" stroke="#22262d" stroke-width="5"/>
    <path d="M58 230 q-4 -88 72 -90 q76 2 72 90z" fill="#24457a" stroke="#22262d" stroke-width="5"/>
    <path d="M118 142 l12 26 l12 -26" fill="#fbf5e6" stroke="#22262d" stroke-width="4"/><rect x="88" y="178" width="26" height="20" rx="3" fill="#3a63a3" stroke="#22262d" stroke-width="3"/><path d="M93 184 h16" stroke="#ffc93c" stroke-width="3"/>
    <path d="M190 170 q24 6 22 38" stroke="#22262d" stroke-width="22" stroke-linecap="round" fill="none"/><path d="M190 170 q24 6 22 38" stroke="#24457a" stroke-width="14" stroke-linecap="round" fill="none"/><circle cx="212" cy="210" r="11" fill="#f0c8a0" stroke="#22262d" stroke-width="4"/>
    <circle cx="130" cy="92" r="46" fill="#f0c8a0" stroke="#22262d" stroke-width="5"/>
    <path d="M88 82 q-6 -10 6 -14 M172 82 q6 -10 -6 -14" stroke="#7a7068" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M118 48 q6 -12 14 -2" stroke="#7a7068" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M104 78 l16 4 M156 78 l-16 4" stroke="#22262d" stroke-width="5" stroke-linecap="round"/>
    <circle cx="113" cy="92" r="4.5" fill="#22262d"/><circle cx="147" cy="92" r="4.5" fill="#22262d"/>
    <ellipse cx="130" cy="104" rx="7" ry="6" fill="#e8a888" stroke="#22262d" stroke-width="3"/>
    <path d="M104 116 q26 -14 52 0 q-10 8 -26 4 q-16 4 -26 -4z" fill="#5b4a3f" stroke="#22262d" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M118 127 q12 6 24 0" stroke="#22262d" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  </svg>`;
  const LOGO = `<svg viewBox="0 0 40 40" class="be-logo" aria-hidden="true"><rect x="3" y="5" width="15" height="13" fill="#e94f37" stroke="#22262d" stroke-width="2.5"/><rect x="21" y="3" width="16" height="13" fill="#3ecf8e" stroke="#22262d" stroke-width="2.5"/><rect x="3" y="21" width="15" height="14" fill="#3a63a3" stroke="#22262d" stroke-width="2.5"/><rect x="21" y="19" width="16" height="16" fill="#ffc93c" stroke="#22262d" stroke-width="2.5"/><path d="M22 34 l13 -13" stroke="#b07b46" stroke-width="3"/><path d="M33 19 l5 -1 l-1 5z" fill="#c9ced4" stroke="#22262d" stroke-width="1.5"/></svg>`;

  /* ======================= Applications ======================= */
  const APPS = {
    mail: { ic: '📨', name: 'Lebec-Mail', title: "Lebec-Mail — Appels d'offres", w: 640, h: 520, render: rMail },
    shop: { ic: '🛒', name: 'Catalogue machines', title: 'MachinesDiscount.bzh — Catalogue', w: 700, h: 540, render: rShop },
    supply: { ic: '📦', name: 'Matière & outils', title: "Aciers de l'Ouest & Outi'Pro — Commande", w: 600, h: 480, render: rSupply },
    staff: { ic: '👷', name: 'Personnel', title: 'Personnel — Pôle Emploi de Kerlebec', w: 720, h: 560, render: rStaff },
    works: { ic: '🔨', name: 'Travaux', title: 'BTP Le Goff & Fils — Travaux', w: 640, h: 520, render: rWorks },
    goals: { ic: '🏆', name: 'Objectifs', title: 'Objectifs de carrière — la feuille de route de Lebec', w: 560, h: 500, render: rGoals },
    compta: { ic: '📊', name: 'Compta', title: 'Compta — Historique des dépenses', w: 700, h: 560, render: rCompta },
    settings: { ic: '⚙', name: 'Réglages', title: 'Panneau de configuration (ne pas toucher — Lebec)', w: 460, h: 320, render: rSettings },
    poly: { ic: '📕', name: 'Le Poly.pdf', title: 'Le Poly.pdf (lecture seule, comme Lebec)', w: 440, h: 360, render: rPoly },
    bin: { ic: '🚮', name: 'Corbeille', title: 'Corbeille', w: 380, h: 300, render: rBin }
  };
  const ORDER = ['mail', 'shop', 'supply', 'staff', 'works', 'compta', 'goals', 'settings', 'poly', 'bin'];

  function badge(id) {
    const S = S_(); if (!S || !S.car) return 0; const C = S.car;
    if (id === 'mail') return (C.offers || []).length;
    if (id === 'staff') return (C.workers || []).filter(w => !w.assign).length;
    if (id === 'shop') return (C.deliv || []).filter(d => d.kind === 'machine').length;
    if (id === 'supply') return (C.deliv || []).filter(d => d.kind === 'matiere').length;
    return 0;
  }
  const eta = d => `<b class="be-eta" data-eta="${d.eta}">${Math.max(0, Math.ceil(d.eta - now()))} s</b>`;
  const btn = (label, op, data, opt) => {
    opt = opt || {};
    const attrs = Object.keys(data || {}).map(k => ` data-${k}="${esc(data[k])}"`).join('');
    return `<button class="be-btn ${opt.cls || ''}" data-op="${op}"${attrs}${opt.dis ? ' disabled' : ''}${opt.title ? ` title="${esc(opt.title)}"` : ''}>${label}</button>`;
  };

  /* ---------- 📨 Appels d'offres ---------- */
  function rMail(S) {
    const C = S.car, offers = C.offers || [], cons = C.contracts || [];
    const types = {}; (S.machDefs || []).forEach(d => { types[d.type] = 1; });
    let h = `<div class="be-tabs"><span class="on">📥 Boîte de réception (${offers.length})</span><span>📝 Contrats signés (${cons.length})</span><span class="dim">📤 Envoyés (0, Lebec n'écrit pas)</span></div>`;
    if (!offers.length) h += `<p class="be-empty">Aucun appel d'offres. Les clients rappellent demain matin.<br><span class="dim">(Plus de réputation = plus de mails. Un bureau d'études aussi.)</span></p>`;
    for (const o of offers) {
      // gamme d'usinage (ML.OPS) : une puce par opération, machine manquante en rouge
      const ops = o.ops || (ML.Routing ? ML.Routing.of(o.part, o.mtype, o.tool) : []);
      const mts = [...new Set(ops.map(id => (ML.OPS[id] || {}).mt).filter(Boolean))], missT = mts.filter(t => !types[t]);
      const need = mts.map(t => ML.MTYPE[t] || t).join(' + ') || (o.mtype === 'tour' ? 'Tour' : 'Fraiseuse'), miss = missT.length > 0;
      const gamme = ops.map((id, i) => { const op = ML.OPS[id] || { n: id, ic: '', mt: '' }; return `<span style="display:inline-block;border:1px solid #888;border-radius:4px;padding:0 4px;margin:1px 0;background:${types[op.mt] ? '#eef6ea' : '#fde3df'}">${i + 1}. ${op.ic} ${esc(op.n)} <span class="dim">(${esc(ML.MTYPE[op.mt] || '?')})</span></span>`; }).join(' → ');
      const mat = ML.MATERIALS && ML.MATERIALS[o.mat] ? ML.MATERIALS[o.mat].label : o.mat;
      h += `<div class="be-mail${o.plateau ? ' plateau' : ''}">
        <div class="be-mh"><b>De :</b> ${esc(comp(o.client))} &lt;achats@${esc(String(o.client).toLowerCase())}.bzh&gt; <span class="dim">· réf. ${esc(o.id)}</span></div>
        <div class="be-ms">AO : ${o.qty} × ${esc(o.part)} <span class="dim">(${esc(mat)}, ${SIZE[o.size] || o.size})</span></div>
        <div class="be-mg">
          <span>💶 <b>${fmt(o.unit)}</b> / pièce</span><span>Total <b>${fmt(o.unit * o.qty)}</b></span>
          <span>⏳ sous <b>${o.days} jour${o.days > 1 ? 's' : ''}</b> (jour ${C.day + o.days})</span>
          <span>🛠 ${need}${miss ? ` <b class="be-warn">⚠ tu n'as pas de ${missT.map(t => (ML.MTYPE[t] || t).toLowerCase()).join(' ni de ')} !</b>` : ''}</span>
          ${KIND[o.kind] ? `<span>${KIND[o.kind]}</span>` : ''}
        </div>
        ${ops.length ? `<div class="be-gamme" style="margin:3px 0;font-size:12px">📐 <b>Gamme (${ops.length} op${ops.length > 1 ? 's' : ''})</b> : ${gamme}</div>` : ''}
        ${o.plateau ? '<div class="be-plat">⛰ Client du plateau : livraison par la falaise, +70 %. Ceinture conseillée.</div>' : ''}
        <div class="be-act">${btn('✔ Accepter', 'accept', { id: o.id }, { cls: 'go' })}${btn('✖ Refuser', 'decline', { id: o.id }, { cls: 'no' })}</div>
      </div>`;
    }
    h += `<h4 class="be-h">📝 Contrats signés</h4>`;
    if (!cons.length) h += `<p class="be-empty dim">Aucun contrat en cours. Lebec s'ennuie.</p>`;
    else {
      h += `<table class="be-t"><tr><th>Client</th><th>Pièce</th><th>Avancement</th><th>Pour le</th><th>Prix</th></tr>`;
      for (const c of cons) {
        const done = c.done || 0, tot = done + c.left, late = c.due <= C.day;
        h += `<tr><td>${esc(comp(c.client))}${c.plateau ? ' ⛰' : ''}</td><td>${esc(c.part)} <span class="dim">(${SIZE[c.size] || ''})</span>${c.ops && ML.Routing ? `<br><span class="dim small">${esc(ML.Routing.label(c.ops))}</span>` : ''}</td>
          <td>${bar(tot ? done / tot : 0, 'mint')} ${done}/${tot} <span class="dim">· reste ${c.left}</span></td>
          <td class="${late ? 'be-warn' : ''}">jour ${c.due}${late ? ' ⚠ ce soir !' : ''}</td><td>${fmt(c.unit)}</td></tr>`;
      }
      h += '</table><p class="dim small">Contrat pas fini à l\'échéance = pénalité de 40 % et la réputation qui prend un coup de pelle.</p>';
    }
    return h;
  }

  /* ---------- 🛒 Catalogue machines ---------- */
  function rShop(S) {
    const C = S.car, M = CAT().MACHINES, pend = (C.deliv || []).filter(d => d.kind === 'machine');
    let h = '';
    if (pend.length) h += `<div class="be-note">🚚 Livraisons en route : ${pend.map(d => `${esc(M[d.model] ? M[d.model].name : d.model)} dans ${eta(d)}`).join(' · ')}<br><span class="dim">Elle arrive en caisse en zone LIVRAISONS : fenwick → atelier → E pour installer.</span></div>`;
    h += `<p class="dim small">Toutes nos machines sont garanties 3 jours ou 30 cm, au premier des deux termes. Livraison par camion en ~${CAT().MACHINE_DELAY} s.</p><div class="be-grid">`;
    const keys = Object.keys(M).sort((a, b) => M[a].price - M[b].price);
    const owned = {}; (S.machDefs || []).forEach(d => { owned[d.model] = (owned[d.model] || 0) + 1; });
    for (const k of keys) {
      const m = M[k], rel = U.clamp((2.4 - m.panne) / 1.8, 0.05, 1);
      h += `<div class="be-card mach t${m.tier}">
        <div class="be-tier">${'★'.repeat(m.tier + 1)}<span class="dim">${'★'.repeat(4 - m.tier)}</span></div>
        ${machSvg(k)}
        <div class="be-cn">${esc(m.name)}</div>
        <div class="dim small">${m.type === 'tour' ? 'Tour' : 'Fraiseuse'}${owned[k] ? ` · tu en as ${owned[k]}` : ''}</div>
        <div class="be-stats"><span>Vitesse</span>${bar(m.speed / 1.8, 'mint')}<span>Qualité</span>${bar((m.quality - 0.8) / 0.3, 'sky')}<span>Fiabilité</span>${bar(rel, 'yellow')}</div>
        <p class="be-desc">« ${esc(m.desc)} »</p>
        <div class="be-price">${fmt(m.price)}</div>
        ${btn('🛒 Acheter', 'buy', { model: k }, { cls: 'go', dis: !canPay(m.price), title: canPay(m.price) ? `Livrée dans ~${CAT().MACHINE_DELAY} s` : 'La banque dit non.' })}
      </div>`;
    }
    return h + '</div>';
  }

  /* ---------- 📦 Matière & outils ---------- */
  function rSupply(S) {
    const C = S.car, SUP = CAT().SUPPLY, pend = (C.deliv || []).filter(d => d.kind === 'matiere');
    let h = `<p class="dim small">Stock max : <b>${C.stockMax}</b> par référence${C.rooms && C.rooms.stock ? ' (magasin construit 👍)' : ' — construis un magasin pour doubler.'} Livraison ${C.rooms && C.rooms.stock ? 'directement en rayon' : 'en zone LIVRAISONS, à ranger en RÉCEPTION'}.</p>`;
    h += `<table class="be-t sup"><tr><th>Référence</th><th>Prix</th><th>Stock</th><th>Commander (lots)</th></tr>`;
    for (const k in SUP) {
      const s = SUP[k], st = S.stock[k] || 0, pq = pend.filter(d => d.what === k).reduce((a, d) => a + d.qty, 0);
      const btns = [1, 2, 3, 4, 5].map(n => { const q = s.lot * n, p = q * s.price; return btn('×' + n, 'order', { what: k, lots: n }, { cls: 'lot', dis: st + pq + q > C.stockMax || !canPay(p), title: `${q} × ${s.label} = ${fmt(p)}` }); }).join('');
      h += `<tr><td><b>${esc(s.label)}</b><br><span class="dim small">lot de ${s.lot} · ~${s.delay} s</span></td><td>${fmt(s.price)}<span class="dim">/u</span><br><span class="dim small">${fmt(s.price * s.lot)} le lot</span></td>
        <td>${bar(st / C.stockMax, st < 2 ? 'red' : 'mint')} <b>${st}</b>/${C.stockMax}${pq ? ` <span class="be-pend">+${pq} en route</span>` : ''}</td><td class="be-lots">${btns}</td></tr>`;
    }
    h += '</table>';
    if (pend.length) h += `<h4 class="be-h">🚚 Commandes en route</h4><ul class="be-ul">${pend.map(d => `<li>${d.qty} × ${esc(SUP[d.what] ? SUP[d.what].label : d.what)} — arrive dans ${eta(d)} <span class="dim">(commandé par ${esc(d.by || '?')})</span></li>`).join('')}</ul>`;
    else h += '<p class="be-empty dim">Aucune commande en cours. Eliott attend ton appel (il parle très vite).</p>';
    return h;
  }

  /* ---------- 👷 Personnel ---------- */
  function rStaff(S) {
    const C = S.car, TR = CAT().TRAITS, defs = S.machDefs || [], fires = C.fires || [], hires = C.hires || [];
    const cap = 2 + ((C.lvl || 0) + 1) * 2, n = (C.workers || []).length + hires.length - fires.length;
    const takenBy = {}; (C.workers || []).forEach(w => { if (w.assign) takenBy[w.assign] = w.name.split(' ')[0]; });
    let h = `<div class="be-note">👥 Effectif prévu demain : <b>${n}</b> / ${cap} <span class="dim">(agrandir l'atelier = plus de place)</span> · Masse salariale : <b>${fmt((C.workers || []).reduce((a, w) => a + (w.salary || 0), 0))}</b>/jour</div>`;
    h += '<h4 class="be-h">Les ouvriers</h4><div class="be-staff">';
    for (const w of (C.workers || [])) {
      const t = TR[w.trait] || { label: w.trait, desc: '' }, fired = fires.includes(w.uid);
      const opts = `<option value="">— aucun poste (coin café) —</option>` + defs.map(d => `<option value="${esc(d.id)}"${w.assign === d.id ? ' selected' : ''}>${esc(d.id)} · ${esc(d.name)}${takenBy[d.id] && w.assign !== d.id ? ' (' + esc(takenBy[d.id]) + ')' : ''}</option>`).join('');
      h += `<div class="be-wk${fired ? ' fired' : ''}">${faceSvg(w.look)}
        <div class="be-wi"><div><b>${esc(w.name)}</b>${w.legend ? ' <span class="be-leg">légende</span>' : ''} <span class="be-trait" title="${esc(t.desc)}">${esc(t.label)}</span></div>
          <div class="dim small">${esc(t.desc)}</div>
          <div class="be-stats row"><span>Vitesse</span>${bar(w.speed / 1.5, 'mint')}<span>Flemme</span>${bar(w.lazy / 0.5, 'red')}</div>
          <div class="small">💶 ${fmt(w.salary)}/jour · 🎓 ${w.xp || 0} jour${(w.xp || 0) > 1 ? 's' : ''} d'expérience</div></div>
        <div class="be-wa">${fired ? '<b class="be-warn">📤 Dernier jour</b>' : `<label class="small">Poste<select data-assign="${esc(w.uid)}">${opts}</select></label>${btn('Licencier', 'fire', { uid: w.uid }, { cls: 'no tiny' })}`}</div></div>`;
    }
    if (!(C.workers || []).length) h += '<p class="be-empty">Personne. Lebec usine tout seul ? Non. Embauche.</p>';
    h += '</div>';
    if (hires.length) h += `<div class="be-note">🗓 Arrivent demain matin : ${hires.map(w => `<b>${esc(w.name)}</b> (${esc((TR[w.trait] || {}).label || w.trait)})`).join(', ')}</div>`;
    h += '<h4 class="be-h">📋 Candidatures du jour</h4><div class="be-grid cands">';
    for (const w of (C.cands || [])) {
      const t = TR[w.trait] || { label: w.trait, desc: '' }, lines = INTERVIEW[w.trait] || ['« Bonjour. »'];
      const line = lines[(String(w.uid).length + (w.name || '').length) % lines.length];
      h += `<div class="be-card cand">${faceSvg(w.look)}<div class="be-cn">${esc(w.name)}${w.legend ? ' <span class="be-leg">légende de l\'ancien atelier</span>' : ''}</div>
        <span class="be-trait">${esc(t.label)}</span><p class="be-quote">${esc(line)}</p>
        <div class="be-stats"><span>Vitesse</span>${bar(w.speed / 1.5, 'mint')}<span>Flemme</span>${bar(w.lazy / 0.5, 'red')}</div>
        <div class="be-price small">${fmt(w.salary)}/jour</div>${btn('🤝 Embaucher', 'hire', { uid: w.uid }, { cls: 'go', dis: n >= cap, title: n >= cap ? 'Atelier plein !' : 'Commence demain matin' })}</div>`;
    }
    if (!(C.cands || []).length) h += '<p class="be-empty dim">Plus de candidats aujourd\'hui. Reviens demain.</p>';
    return h + '</div>';
  }

  /* ---------- 🏗 Travaux ---------- */
  function rWorks(S) {
    const C = S.car, L = CAT().LEVELS, R = CAT().ROOMS, lvl = C.lvl || 0, cur = L[lvl], nx = L[lvl + 1], pend = C.pending;
    let h = '';
    if (pend) h += `<div class="be-note night">🌙 Cette nuit : ${pend.lvl !== undefined ? `agrandissement → <b>${esc(L[pend.lvl].name)}</b>` : `construction : <b>${esc(R[pend.room].icon + ' ' + R[pend.room].name)}</b>`}. Les ouvriers du BTP arrivent avec leurs radios.</div>`;
    h += `<div class="be-lv"><div class="be-card"><div class="dim small">Aujourd'hui (niveau ${lvl + 1})</div><div class="be-cn">${esc(cur.name)}</div><div class="small">${cur.w} × ${cur.d} m · loyer ${fmt(cur.rent)}/jour</div><p class="be-desc">${esc(cur.desc)}</p></div>
      <div class="be-arrow">➜</div>`;
    if (nx) h += `<div class="be-card next"><div class="dim small">Niveau ${lvl + 2}</div><div class="be-cn">${esc(nx.name)}</div><div class="small">${nx.w} × ${nx.d} m · loyer ${fmt(nx.rent)}/jour</div><p class="be-desc">${esc(nx.desc)}</p>
      <div class="be-price">${fmt(nx.price)}</div>${btn('🏗 Agrandir', 'upgrade', {}, { cls: 'go', dis: !!pend || !canPay(nx.price), title: pend ? 'Des travaux sont déjà prévus cette nuit' : 'Travaux cette nuit' })}</div>`;
    else h += '<div class="be-card next"><div class="be-cn">C\'est le maximum !</div><p class="be-desc">Plus grand que ça, c\'est Airbus.</p></div>';
    h += '</div><h4 class="be-h">Pièces annexes</h4><div class="be-grid rooms">';
    for (const k in R) {
      const r = R[k], built = C.rooms && C.rooms[k], lock = lvl < r.minLvl, isP = pend && pend.room === k;
      h += `<div class="be-card room${built ? ' built' : ''}"><div class="be-ric">${r.icon}</div><div class="be-cn">${esc(r.name)}</div><p class="be-desc">${esc(r.desc)}</p>
        ${built ? '<b class="be-ok">✅ Construit</b>' : isP ? '<b class="be-pend">🌙 Cette nuit</b>' : lock ? `<span class="be-warn small">🔒 Niveau ${r.minLvl + 1} requis (${esc(L[r.minLvl].name)})</span>` : `<div class="be-price">${fmt(r.price)}</div>${btn('Construire', 'build', { room: k }, { cls: 'go', dis: !!pend || !canPay(r.price) })}`}</div>`;
    }
    return h + '</div><p class="dim small">Un seul chantier par nuit. Le BTP ne travaille pas le jour : il y a des machines qui font du bruit.</p>';
  }

  /* ---------- 📊 Compta ---------- */
  function shameWall(entries, title) {
    const by = {};
    for (const l of entries) if (l.k === 'amende') { const w = l.w || 'Inconnu (le pigeon ?)'; by[w] = by[w] || { n: 0, a: 0 }; by[w].n++; by[w].a += -l.a; }
    const rows = Object.keys(by).sort((a, b) => by[b].a - by[a].a);
    let h = `<h4 class="be-h">🧱 ${title}</h4>`;
    if (!rows.length) return h + '<p class="be-empty dim">Mur vide. Personne n\'a flashé, roulé sur un passant ou fâché les gendarmes. Suspect.</p>';
    h += '<table class="be-t shame"><tr><th></th><th>Joueur</th><th>Amendes</th><th>Total</th></tr>';
    rows.forEach((w, i) => { h += `<tr><td>${['👑', '🥈', '🥉'][i] || '🚨'}</td><td><b>${esc(w)}</b>${i === 0 ? ' <span class="dim small">(champion·ne du radar)</span>' : ''}</td><td>${by[w].n}</td><td class="neg">${fmt(-by[w].a)}</td></tr>`; });
    return h + '</table>';
  }
  function totals(entries) {
    const t = {}; for (const l of entries) t[l.k] = (t[l.k] || 0) + l.a;
    return `<div class="be-chips">${Object.keys(t).map(k => `<span class="${t[k] >= 0 ? 'pos' : 'neg'}">${KICON[k] || '•'} ${esc(KNAME[k] || k)} <b>${sgn(t[k])}</b></span>`).join('') || '<span class="dim">rien</span>'}</div>`;
  }
  function rCompta(S) {
    const C = S.car, led = C.ledger || [];
    const inn = led.filter(l => l.a > 0).reduce((a, l) => a + l.a, 0), out = -led.filter(l => l.a < 0).reduce((a, l) => a + l.a, 0);
    let h = `<div class="be-kpi"><div><span>Caisse ce matin</span><b>${fmt(C.start)}</b></div><div><span>Encaissé</span><b class="pos">+${fmt(inn)}</b></div><div><span>Dépensé</span><b class="neg">${fmt(-out)}</b></div><div><span>Caisse</span><b class="${C.money < 0 ? 'neg' : 'pos'}">${fmt(C.money)}</b></div></div>`;
    h += `<h4 class="be-h">📒 Aujourd'hui — jour ${C.day}</h4>` + totals(led);
    if (!led.length) h += '<p class="be-empty dim">Aucune écriture. La journée commence, la pelle est propre.</p>';
    else {
      h += '<div class="be-scroll"><table class="be-t led"><tr><th>Heure</th><th></th><th>Libellé</th><th>Qui</th><th>Montant</th></tr>';
      for (const l of led.slice().reverse()) h += `<tr class="${l.k === 'amende' ? 'fine' : ''}"><td>${clockOf(l.t)}</td><td>${KICON[l.k] || '•'}</td><td>${esc(l.l)}</td><td>${esc(l.w || '')}</td><td class="${l.a >= 0 ? 'pos' : 'neg'}">${sgn(l.a)}</td></tr>`;
      h += '</table></div>';
    }
    h += shameWall(led, 'Le mur de la honte : amendes par joueur (aujourd\'hui)');
    const car = ML.Game && ML.Game.isHost && ML.Career.car;
    if (car && car.ledger && car.ledger.length) {
      const days = {}; for (const l of car.ledger) (days[l.d] = days[l.d] || []).push(l);
      h += '<h4 class="be-h">📚 Historique des jours précédents</h4>';
      for (const d of Object.keys(days).sort((a, b) => b - a)) {
        const E = days[d], bal = E.reduce((a, l) => a + l.a, 0);
        h += `<details class="be-day"><summary>Jour ${d} — <b class="${bal >= 0 ? 'pos' : 'neg'}">${sgn(bal)}</b> <span class="dim">(${E.length} écriture${E.length > 1 ? 's' : ''})</span></summary>${totals(E)}
          <table class="be-t led">${E.map(l => `<tr class="${l.k === 'amende' ? 'fine' : ''}"><td>${KICON[l.k] || '•'}</td><td>${esc(l.l)}</td><td>${esc(l.w || '')}</td><td class="${l.a >= 0 ? 'pos' : 'neg'}">${sgn(l.a)}</td></tr>`).join('')}</table></details>`;
      }
      h += shameWall(car.ledger.concat(led), 'Le mur de la honte depuis le début de la carrière');
    } else if (!(ML.Game && ML.Game.isHost)) h += '<p class="dim small">📚 L\'historique des jours précédents est sur le PC de l\'hôte (c\'est lui qui a la clé du tiroir-caisse).</p>';
    return h;
  }

  /* ---------- 🏆 Objectifs ---------- */
  /* ---------- ⚙ Réglages : durée des journées ---------- */
  function rSettings(S) {
    const C = S.car, cur = C.dayMin || 12, next = C.dayMinNext || cur;
    return `<p>Durée d'une journée (de 7 h à 19 h) en minutes réelles. <span class="be-dim">Le changement s'applique demain matin.</span></p>
      <div class="be-act">${[8, 12, 16, 20].map(n => btn(`${n} min${n === next ? ' ✔' : ''}`, 'daylen', { min: n }, { cls: n === next ? 'go' : '' })).join(' ')}</div>
      <p class="be-dim">Aujourd'hui : ${cur} min. Plus long = plus de temps pour livrer… et pour faire des bêtises.</p>`;
  }
  function rGoals(S) {
    const C = S.car, all = CAT().GOALS || [], done = C.goalsDone || 0, tot = C.goalsTotal || all.length;
    const reached = (ML.Game && ML.Game.isHost && ML.Career.car && ML.Career.car.goals) || null;
    const open = {}; (C.goals || []).forEach(g => { open[g.id] = 1; });
    let h = `<div class="be-note">🏆 <b>${done}</b> / ${tot} objectifs atteints ${bar(tot ? done / tot : 0, 'yellow')} <span class="dim small">(chaque objectif rapporte une prime)</span></div>`;
    h += '<h4 class="be-h">🎯 Prochains objectifs</h4>';
    if (!(C.goals || []).length) h += '<p class="be-empty">Tout est fait ! Lebec n’a plus rien à te demander. Il est perdu.</p>';
    else h += `<ul class="be-goals">${C.goals.map(g => `<li><span>🎯 ${esc(g.label)}</span><b class="pos">+${fmt(g.reward || 0)}</b></li>`).join('')}</ul>`;
    if (all.length) {
      h += '<h4 class="be-h">📜 La liste complète</h4><ul class="be-goals all">';
      for (const g of all) {
        const ok = reached ? !!reached[g.id] : null, cur = open[g.id];
        h += `<li class="${ok ? 'ok' : cur ? 'cur' : ''}"><span>${ok ? '✅' : cur ? '🎯' : '⬜'} ${esc(g.label)}${ok ? ` <span class="dim small">(jour ${reached[g.id]})</span>` : ''}</span><b>+${fmt(g.reward || 0)}</b></li>`;
      }
      h += '</ul>';
      if (!reached) h += '<p class="dim small">Les cases cochées sont sur le PC de l’hôte.</p>';
    }
    return h;
  }

  /* ---------- Gags ---------- */
  function rPoly() {
    return `<div class="be-poly"><h3>Chapitre 1 : Tout est écrit dans le poly</h3><p>1. Le poly a toujours raison.</p><p>2. Si le poly a tort, relire la règle 1.</p>
      <p>3. La prise d'origine se fait AVANT d'usiner. (Oui, Kévin.)</p><p>4. On ne court pas dans l'atelier. On ne roule pas dans l'atelier. On ne lance pas de caisse dans l'atelier.</p>
      <p>5. La pelle de M. Lebec n'est pas un outil pédagogique. Enfin, si.</p><p class="dim small">Page 2 sur 847. La suite est en option payante.</p>
      ${ML.Tuto ? '<p><button class="be-btn go" onclick="ML.Tuto.replay()">📕 Revoir le tutoriel (avec Lebec)</button></p>' : ''}</div>`;
  }
  function rBin() {
    return `<ul class="be-ul bin"><li>📄 CV_de_Fred_v12_FINAL(3).doc</li><li>📄 Convention_Herve_non_signee.pdf</li><li>📄 Arexis_formulaire_17b.xls</li><li>🖼 photo_radar_megane.jpg</li><li>📄 Devis_UsiFlash_espionnage.txt</li></ul><p class="dim small">Vider la corbeille ? Non. Lebec garde tout « au cas où ».</p>`;
  }

  /* ======================= Bureau, fenêtres, barre des tâches ======================= */
  let root, desk, taskApps, tray, startMenu, toastEl, wins = {}, zTop = 10, nOpen = 0, sig = '', timer = null, booted = false;

  function build() {
    root = $('beos');
    if (!root) { root = document.createElement('div'); root.id = 'beos'; root.className = 'hidden'; document.body.appendChild(root); }
    root.innerHTML = `<div class="be-desk"><div class="be-wall">${WALL}<div class="be-wall-t"><b>LebecOS</b><span>95</span><i>« C'est écrit dans le poly. »</i></div></div>
        <div class="be-icons">${ORDER.map(id => `<button class="be-icon" data-app="${id}"><span class="be-ii">${APPS[id].ic}<b class="be-badge" data-badge="${id}"></b></span><span class="be-in">${esc(APPS[id].name)}</span></button>`).join('')}</div>
        <div class="be-wins"></div><div class="be-toast"></div></div>
      <div class="be-start hidden"><div class="be-side">LebecOS<b>95</b></div><div class="be-sm">${ORDER.map(id => `<button data-app="${id}">${APPS[id].ic} ${esc(APPS[id].name)}</button>`).join('')}<hr><button data-act="shut">⏻ Éteindre le PC… (Échap)</button></div></div>
      <div class="be-bar"><button class="be-startb" data-act="start">${LOGO}Démarrer</button><div class="be-tapps"></div><div class="be-tray"></div><button class="be-x" data-act="shut" title="Éteindre (Échap)">✕</button></div>
      <div class="be-boot hidden"><div>${LOGO}<b>LebecOS 95</b><p>Vérification de la pelle… OK<br>Chargement des devis… OK<br>Recherche du poly… introuvable (normal)</p><span class="be-load"><i></i></span></div></div>`;
    desk = root.querySelector('.be-wins'); taskApps = root.querySelector('.be-tapps'); tray = root.querySelector('.be-tray');
    startMenu = root.querySelector('.be-start'); toastEl = root.querySelector('.be-toast');
    root.addEventListener('click', onClick);
    root.addEventListener('change', e => {
      const sel = e.target.closest('select[data-assign]'); if (!sel) return;
      send({ op: 'assign', uid: sel.dataset.assign, mid: sel.value || null }); sel.blur();
    });
    root.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', e => {
      if (!CU.isOpen || e.code !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      if (!startMenu.classList.contains('hidden')) startMenu.classList.add('hidden'); else CU.close();
    }, true);
  }

  function onClick(e) {
    const a = e.target.closest('[data-app]');
    if (a) { startMenu.classList.add('hidden'); openApp(a.dataset.app); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const k = act.dataset.act;
      if (k === 'shut') return CU.close();
      if (k === 'start') { startMenu.classList.toggle('hidden'); return; }
      const w = act.closest('.be-win');
      if (k === 'close' && w) return closeApp(w.dataset.id);
      if (k === 'min' && w) { w.classList.add('hidden'); renderTask(); return; }
      if (k === 'task') { const W = wins[act.dataset.id]; if (W) { const vis = !W.el.classList.contains('hidden') && W.z === zTop; W.el.classList.toggle('hidden', vis); if (!vis) focus(act.dataset.id); renderTask(); } return; }
    }
    if (!e.target.closest('.be-start') && !e.target.closest('[data-act="start"]')) startMenu.classList.add('hidden');
    const b = e.target.closest('button[data-op]');
    if (b && !b.disabled) {
      const d = b.dataset, m = { op: d.op };
      if (d.id) m.id = d.id; if (d.what) m.what = d.what; if (d.lots) m.lots = +d.lots; if (d.model) m.model = d.model; if (d.uid) m.uid = d.uid; if (d.room) m.room = d.room; if (d.min) m.min = +d.min;
      if (m.op === 'fire') { const S = S_(), w = S && S.car.workers.find(x => String(x.uid) === m.uid); if (!confirm(`Licencier ${w ? w.name : 'cet ouvrier'} ? Dernier jour aujourd'hui (et Lebec va devoir l'annoncer).`)) return; }
      send(m); b.disabled = true;
    }
  }
  function send(m) {
    if (!ML.Game || !ML.Game.on) return;
    const S = S_(); if (S && S.car && m.uid) { const all = (S.car.workers || []).concat(S.car.cands || []); const w = all.find(x => String(x.uid) === String(m.uid)); if (w) m.uid = w.uid; }
    if (S && S.car && m.id) { const o = (S.car.offers || []).find(x => String(x.id) === String(m.id)); if (o) m.id = o.id; }
    ML.Game.intent(Object.assign({ a: 'be' }, m));
    try { ML.Sfx.play(m.op === 'decline' || m.op === 'fire' ? 'drop' : 'bip', 0.6); } catch (err) { /* son facultatif */ }
    setTimeout(refresh, 60);
  }
  /** Montre une notification de l'hôte DANS le PC (le HUD est caché derrière) */
  function toast(text, type) {
    if (!toastEl) return;
    const d = document.createElement('div'); d.className = 'be-tst ' + (type || ''); d.textContent = String(text).replace(/<[^>]+>/g, '');
    toastEl.appendChild(d); setTimeout(() => d.remove(), 4200);
    while (toastEl.children.length > 4) toastEl.firstChild.remove();
  }

  function openApp(id) {
    const A = APPS[id]; if (!A) return;
    if (wins[id]) { wins[id].el.classList.remove('hidden'); focus(id); renderTask(); return; }
    const el = document.createElement('div'); el.className = 'be-win'; el.dataset.id = id;
    const dw = desk.clientWidth || window.innerWidth, dh = desk.clientHeight || window.innerHeight - 48;
    const w = Math.min(A.w, dw - 20), h = Math.min(A.h, dh - 20), k = nOpen++ % 6;
    const x = U.clamp(110 + k * 34, 4, Math.max(4, dw - w - 4)), y = U.clamp(16 + k * 28, 4, Math.max(4, dh - h - 4));
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    el.innerHTML = `<div class="be-wt"><span>${A.ic} ${esc(A.title)}</span><button class="be-wb" data-act="min" title="Réduire">_</button><button class="be-wb x" data-act="close" title="Fermer">✕</button></div><div class="be-wbody"></div><div class="be-ws"></div>`;
    desk.appendChild(el); wins[id] = { el, z: 0 }; focus(id); renderWin(id); renderTask();
  }
  function closeApp(id) { const W = wins[id]; if (!W) return; W.el.remove(); delete wins[id]; renderTask(); }
  function focus(id) { const W = wins[id]; if (!W) return; W.z = ++zTop; W.el.style.zIndex = W.z; for (const k in wins) wins[k].el.classList.toggle('act', k === id); }
  function renderWin(id) {
    const W = wins[id], S = S_(); if (!W || !S || !S.car) return;
    const body = W.el.querySelector('.be-wbody');
    if (body.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return; // ne pas fermer une liste ouverte
    const top = body.scrollTop, open = [...body.querySelectorAll('details[open]')].map(d => d.querySelector('summary').textContent);
    try { body.innerHTML = APPS[id].render(S); } catch (err) { body.innerHTML = `<p class="be-warn">💥 Erreur fatale 0E : ${esc(err.message)}<br>Lebec a tapé l'écran avec sa pelle.</p>`; console.error(err); }
    for (const d of body.querySelectorAll('details')) if (open.includes(d.querySelector('summary').textContent)) d.open = true;
    body.scrollTop = top;
    W.el.querySelector('.be-ws').textContent = statusLine(id, S);
  }
  function statusLine(id, S) {
    const C = S.car;
    return { mail: `${(C.offers || []).length} message(s) non lu(s) · ${(C.contracts || []).length} contrat(s) en cours`, shop: `Caisse : ${fmt(C.money)} · découvert autorisé jusqu'à ${fmt(CAT().BANKRUPT * 0.5)}`,
      supply: `${(C.deliv || []).filter(d => d.kind === 'matiere').length} commande(s) en route`, staff: `${(C.workers || []).length} ouvrier(s) · ${(C.cands || []).length} candidat(s)`,
      works: `Niveau ${(C.lvl || 0) + 1} / ${CAT().LEVELS.length}`, compta: `${(C.ledger || []).length} écriture(s) aujourd'hui`, goals: `${C.goalsDone || 0} / ${C.goalsTotal || 0} atteints`, poly: 'Lecture seule', bin: '5 objet(s)' }[id] || '';
  }
  function renderTask() {
    taskApps.innerHTML = Object.keys(wins).map(id => `<button class="be-tb${wins[id].el.classList.contains('hidden') ? '' : ' on'}" data-act="task" data-id="${id}">${APPS[id].ic} ${esc(APPS[id].name)}</button>`).join('');
  }
  function renderTray() {
    const S = S_(); if (!S || !S.car) return; const C = S.car;
    const min = ML.Game.clockMin ? ML.Game.clockMin() : 420;
    const nd = (C.deliv || []).length;
    tray.innerHTML = `<span class="be-tm ${C.money < 0 ? 'neg' : 'pos'}" title="Caisse">💶 ${fmt(C.money)}</span>${stars(C.rep)}<span title="Jour">📅 J${C.day}</span>${nd ? `<span title="Livraisons attendues">🚚 ${nd}</span>` : ''}<span class="be-clk">${U.fmt(Math.min(min, ML.CFG.DAY_END))}</span>`;
    for (const b of root.querySelectorAll('[data-badge]')) { const n = badge(b.dataset.badge); b.textContent = n || ''; b.classList.toggle('hidden', !n); }
  }
  function onDown(e) {
    const w = e.target.closest('.be-win'); if (!w) return;
    focus(w.dataset.id);
    const t = e.target.closest('.be-wt'); if (!t || e.target.closest('button')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = w.offsetLeft, oy = w.offsetTop;
    const mv = ev => { w.style.left = U.clamp(ox + ev.clientX - sx, -w.offsetWidth + 80, desk.clientWidth - 60) + 'px'; w.style.top = U.clamp(oy + ev.clientY - sy, 0, desk.clientHeight - 30) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  function stateSig(S) { try { return JSON.stringify([S.car, S.stock, (S.machDefs || []).map(d => d.id + d.model)]); } catch (e) { return String(Math.random()); } }
  function refresh() {
    if (!CU.isOpen) return;
    const G_ = ML.Game, S = S_();
    if (!G_ || !G_.on || G_.ended || !S || !S.car) { CU.close(true); return; }
    renderTray();
    for (const el of root.querySelectorAll('.be-eta')) el.textContent = Math.max(0, Math.ceil(+el.dataset.eta - now())) + ' s';
    const s = stateSig(S);
    if (s !== sig) { sig = s; for (const id in wins) renderWin(id); }
  }

  /* ======================= Ouverture / fermeture ======================= */
  CU.open = () => {
    const S = S_();
    if (CU.isOpen || !S || !S.car) return;
    if (ML.ui.modal && ML.ui.modal !== 'be') return;
    if (!root) build();
    if (ML.HUD && !ML.HUD._beWrap) { const orig = ML.HUD.notify; ML.HUD.notify = (t, ty) => { if (CU.isOpen) toast(t, ty); return orig(t, ty); }; ML.HUD._beWrap = true; }
    CU.isOpen = true; ML.ui.modal = 'be'; ML.Input.unlock(); if (ML.HUD) ML.HUD.showPause(false);
    root.classList.remove('hidden'); startMenu.classList.add('hidden'); sig = '';
    if (!booted) { booted = true; const bt = root.querySelector('.be-boot'); bt.classList.remove('hidden'); bt.onclick = () => bt.classList.add('hidden'); setTimeout(() => bt.classList.add('hidden'), 1300); }
    if (!Object.keys(wins).length) openApp('mail');
    refresh(); clearInterval(timer); timer = setInterval(refresh, 250);
    try { ML.Sfx.play('bip', 0.5); } catch (e) { /* rien */ }
  };
  /** silent = la partie s'arrête : ne pas recapturer la souris */
  CU.close = silent => {
    if (!CU.isOpen) return;
    CU.isOpen = false; clearInterval(timer); timer = null;
    if (root) { root.classList.add('hidden'); startMenu.classList.add('hidden'); }
    if (ML.ui.modal === 'be') ML.ui.modal = null;
    if (!silent && ML.Game && ML.Game.on && !ML.Game.ended) ML.Input.lock();
  };

  /* ======================= HUD carrière ======================= */
  let hudEl = null, floatEl = null, lastMoney = null, lastKey = '', lastLed = 0;
  CU.hud = S => {
    const tl = $('tl'); if (!tl) return;
    const C = S && S.car;
    if (!C) { if (hudEl) { hudEl.classList.add('hidden'); tl.classList.remove('career'); } lastMoney = null; return; }
    if (!hudEl || !hudEl.isConnected) {
      hudEl = document.createElement('div'); hudEl.id = 'car-hud';
      const sc = tl.querySelector('.row.sc'); if (sc) sc.after(hudEl); else tl.appendChild(hudEl);
      floatEl = document.createElement('div'); floatEl.id = 'car-float'; ($('hud') || document.body).appendChild(floatEl);
    }
    hudEl.classList.remove('hidden'); tl.classList.add('career');
    const nd = (C.deliv || []).slice().sort((a, b) => a.eta - b.eta);
    const next = nd[0], secs = next ? Math.max(0, Math.ceil(next.eta - now())) : 0;
    const html = `<div class="ch-name" title="${esc(C.name)}">🏭 ${esc(C.name)} <span>· Jour ${C.day}</span></div>
      <div class="ch-money ${C.money < 0 ? 'neg' : ''}">${fmt(C.money)}</div>${stars(C.rep)}
      ${C.goals && C.goals[0] ? `<div class="ch-goal" title="Prochain objectif">🎯 ${esc(C.goals[0].label)} <b>+${fmt(C.goals[0].reward || 0)}</b></div>` : ''}
      ${next ? `<div class="ch-chip">${next.kind === 'machine' ? '🏭' : '📦'} livraison dans ${secs} s${nd.length > 1 ? ` <b>+${nd.length - 1}</b>` : ''}</div>` : ''}`;
    if (html !== hudEl._h) { hudEl.innerHTML = html; hudEl._h = html; }
    const key = C.name + '|' + C.day + '|' + C.start;
    const led = C.ledger || [];
    if (key !== lastKey) { lastKey = key; lastMoney = C.money; lastLed = led.length; return; }
    if (lastMoney !== null && C.money !== lastMoney) {
      // une bulle par écriture nouvelle (vente, amende…), sinon la différence globale
      const fresh = led.length > lastLed ? led.slice(lastLed).slice(-4).map(l => l.a) : [C.money - lastMoney];
      fresh.forEach((d, i) => {
        const f = document.createElement('div');
        f.className = 'ch-float ' + (d >= 0 ? 'pos' : 'neg'); f.textContent = sgn(d);
        f.style.left = (Math.random() * 40) + 'px'; f.style.animationDelay = (i * 0.35) + 's';
        floatEl.appendChild(f); setTimeout(() => f.remove(), 1900 + i * 350);
      });
      const m = hudEl.querySelector('.ch-money'); if (m) { m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
    }
    lastMoney = C.money; lastLed = led.length;
  };

  /* ======================= Bilan de fin de journée ======================= */
  CU.endPanel = res => {
    if (CU.isOpen) CU.close(true);
    const r = res.career || {}, delta = (r.money || 0) - (r.start || 0);
    const fines = {}; for (const l of (r.fines || [])) { const w = l.w || 'Inconnu'; fines[w] = (fines[w] || 0) + -l.a; }
    const fk = Object.keys(fines).sort((a, b) => fines[b] - fines[a]);
    const quip = r.bankrupt ? 'La banque est venue chercher les machines. Lebec a gardé la pelle.'
      : delta > 1500 ? 'Lebec compte les billets avec sa pelle. Il sourit. C\'est terrifiant.'
        : delta > 0 ? 'Lebec compte les billets avec sa pelle. « Ça paie le café. »'
          : delta > -800 ? '« On a perdu des sous, mais on a appris des choses. Non ? Non. »'
            : '« Si ça continue, je vends le tour de 1974 sur Leboncoin. »';
    let h = '<div class="be-end">';
    if (r.bankrupt) h += `<div class="be-fail">FAILLITE</div><p class="be-failp">Caisse : <b>${fmt(r.money)}</b> (la limite était ${fmt(CAT().BANKRUPT)}). La carrière est terminée.<br>Recommence une carrière depuis le menu (bouton « recommencer » à côté du mode Carrière).</p>`;
    h += `<h3>🏭 Bilan comptable — jour ${r.day}</h3><table class="be-endt">
      <tr><td>Caisse ce matin</td><td>${fmt(r.start || 0)}</td></tr>
      <tr><td>Encaissé dans la journée</td><td class="pos">+${fmt(r.earned || 0)}</td></tr>
      <tr><td>Dépensé (achats, charges, amendes…)</td><td class="neg">${fmt(-(r.spent || 0))}</td></tr>`;
    for (const [l, a] of (r.lines || [])) h += `<tr class="sub"><td>↳ ${esc(l)}</td><td class="neg">${fmt(a)}</td></tr>`;
    h += `<tr class="tot"><td>Caisse ce soir</td><td class="${(r.money || 0) < 0 ? 'neg' : 'pos'}">${fmt(r.money || 0)} <span class="small">(${sgn(delta)})</span></td></tr>
      <tr><td>Réputation</td><td>${stars(r.rep)} <span class="small">${r.rep}/100</span></td></tr></table>`;
    if (fk.length) h += `<h3>🧱 Le mur de la honte</h3><table class="be-endt">${fk.map((w, i) => `<tr><td>${['👑', '🥈', '🥉'][i] || '🚨'} ${esc(w)}</td><td class="neg">${fmt(-fines[w])}</td></tr>`).join('')}</table>`;
    else h += '<p class="dim small">Aucune amende aujourd\'hui. Les gendarmes s\'inquiètent pour vous.</p>';
    h += `<p class="be-quip"><i>${esc(quip)}</i></p></div>`;
    return { camp: h, nextLabel: r.bankrupt ? 'Journée suivante (la banque rigole)' : 'Journée suivante' };
  };
})();
