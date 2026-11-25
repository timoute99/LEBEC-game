/* =====================================================================
   dialogue.js — Boîte de dialogue (locale à chaque joueur) et mini-jeux :
   - choice / info : texte + choix (clic ou touches 1-9) ;
   - listen        : écouter quelqu'un X secondes (Coco et la boxe) ;
   - supplier      : Eliott Trit parle à toute vitesse, 3 questions chrono.
   La partie continue pendant un dialogue (multijoueur) : seul le joueur
   concerné est immobilisé.
   ===================================================================== */
(function () {
  const D = ML.Dialogue = { open: false, closable: true, opts: [], mode: null };
  const U = ML.U;

  D.init = () => {
    D.el = document.getElementById('dialogue');
    D.spEl = D.el.querySelector('.speaker'); D.textEl = D.el.querySelector('.text');
    D.timerEl = D.el.querySelector('.timer'); D.timerBar = D.timerEl.querySelector('i'); D.optEl = D.el.querySelector('.options');
  };
  function reset() { D.mode = null; D.closable = true; D.opts = []; D.textEl.classList.remove('fast'); D.timerEl.style.display = 'none'; }
  function show(speaker, text) { D.el.classList.remove('hidden'); D.spEl.textContent = speaker; D.textEl.textContent = text; D.open = true; ML.ui.modal = 'dialogue'; ML.Input.unlock(); ML.HUD.showPause(false); }
  function hide() { D.el.classList.add('hidden'); D.open = false; D.mode = null; }
  function finish() { if (!D.open && ML.ui.modal === 'dialogue') { ML.ui.modal = null; ML.Input.lock(); } }
  function end(cb, a, b) { hide(); if (cb) cb(a, b); finish(); }

  D.setOptions = options => {
    D.opts = options; D.optEl.innerHTML = '';
    options.forEach((o, i) => { const b = document.createElement('button'); b.innerHTML = `<kbd>${i + 1}</kbd>`; b.appendChild(document.createTextNode(o.label)); b.onclick = () => D.pick(i); D.optEl.appendChild(b); });
  };
  D.choice = (speaker, text, options) => { reset(); show(speaker, text); D.setOptions(options); };
  D.info = (speaker, text, cb) => D.choice(speaker, text, [{ label: 'OK', fn: cb || null }]);

  D.pick = i => {
    if (!D.open) return;
    if (D.mode === 'fast') { if (D.phase === 'ask' && i < D.opts.length) answerFast(i); return; }
    const o = D.opts[i]; if (!o) return;
    ML.Sfx.play('bip'); const fn = o.fn; hide(); if (fn) fn(); finish();
  };
  D.close = () => { if (!D.open || !D.closable) return; const cb = D.mode === 'listen' ? D.onCancel : null; hide(); if (cb) cb(); finish(); };
  /** Fermeture forcée (fin de partie, coup de pelle...) */
  D.forceClose = () => { if (!D.open) return; hide(); if (ML.ui.modal === 'dialogue') ML.ui.modal = null; };

  D.listen = (speaker, lines, seconds, onDone, onCancel, cond) => {
    reset(); show(speaker, lines[0]);
    Object.assign(D, { mode: 'listen', t: 0, dur: seconds, lines, li: 0, onDone, onCancel, cond });
    D.timerEl.style.display = 'block';
    D.setOptions([{ label: 'Partir (abandonner)', fn: () => { if (onCancel) onCancel(); } }]);
  };

  /** Commande chez Eliott : choix de la matière puis mini-jeu */
  D.supplier = (npc, cb) => {
    D.choice(ML.PEOPLE[npc].name + " — Aciers de l'Ouest", "Salut-ça-va-moi-ça-va-qu'est-ce-que-je-te-mets-vite-vite ! (Lis bien : il parle très vite et pose 3 questions. 1 bonne réponse = 1 caisse.)",
      ['acier', 'alu', 'inox'].map(m => ({ label: `Bruts ${ML.MATERIALS[m].label}`, fn: () => D.fastTalk(ML.PEOPLE[npc].name, succ => { cb(m, succ); D.info(ML.PEOPLE[npc].name, succ ? `${succ}/3 : ${succ} caisse${succ > 1 ? 's' : ''} de ${ML.MATERIALS[m].label} sur le quai. Charge-les et dépose-les en RÉCEPTION à l'atelier !` : "0/3 : Eliott a parlé trop vite. Aucune caisse. Réessaie !"); }) })).concat([{ label: 'Rien, merci', fn: null }]));
  };
  D.fastTalk = (speaker, onDone) => {
    reset(); show(speaker, '');
    Object.assign(D, { mode: 'fast', closable: false, rounds: D.makeRounds(3), ri: 0, succ: 0, onDoneFast: onDone });
    D.textEl.classList.add('fast'); startRound();
  };
  function startRound() {
    const r = D.rounds[D.ri];
    D.phase = 'talk'; D.t = 0; D.textEl.textContent = ''; D.setOptions([]); D.timerEl.style.display = 'none';
    D.talkDur = r.text.length / 60 + 0.9;
    ML.Sfx.speak(r.text.replace(/-/g, ' '), { rate: 2.2, force: true });
  }
  function answerFast(i) {
    const r = D.rounds[D.ri], ok = i >= 0 && D.opts[i].label === r.a;
    if (ok) { D.succ++; ML.Sfx.play('success'); } else ML.Sfx.play('error');
    D.textEl.textContent = ok ? "Ok-ok-ok-c'est-ça !" : `Nan-nan-nan-c'était-${r.a} !`;
    D.phase = 'feedback'; D.t = 0; D.setOptions([]); D.timerEl.style.display = 'none'; D.ri++;
  }

  D.makeRounds = n => {
    const four = (good, pool) => {
      const alt = U.shuffle([...new Set(pool)].filter(x => x !== good)).slice(0, 3);
      while (alt.length < 3) { const r = 'B' + U.randi(100, 999); if (r !== good && !alt.includes(r)) alt.push(r); }
      return U.shuffle([good, ...alt]);
    };
    const T = [
      () => { const a = U.randi(2, 9), b = (a + U.randi(2, 5)) % 9 + 1;
        return { text: `Alors-salut-ça-va-moi-ça-va-bon-ton-truc-il-est-au-quai-numéro-${a}-tu-te-mets-bien-en-face-hein-parce-que-l'autre-fois-y'a-un-gars-il-s'est-mis-au-${b}-et-c'était-le-bazar-total`,
                 q: 'Eliott : « Bon, t\'as compris, quel quai ? »', a: String(a), opts: four(String(a), ['1', '2', '3', '4', '5', '6', '7', '8', '9'].filter(x => x !== String(b)).concat([String(b)])) }; },
      () => { const d = [U.randi(1, 9), U.randi(0, 9), U.randi(0, 9)], a = 'B' + d.join(''), v = ['B' + [d[1], d[0], d[2]].join(''), 'B' + [d[0], d[2], d[1]].join(''), 'B' + [d[2], d[1], d[0]].join(''), 'B' + [d[1], d[2], d[0]].join('')];
        return { text: `Et-surtout-tu-me-signes-le-bon-de-livraison-numéro-${a}-pas-un-autre-hein-la-compta-elle-me-tue-sinon-et-moi-j'ai-pas-le-temps-de-me-faire-tuer`,
                 q: 'Eliott : « Tu signes quel bon, déjà ? »', a, opts: four(a, v.concat(['B' + U.randi(100, 999)])) }; },
      () => { const pool = ['316L', '304L', '303', '430'], a = U.pick(pool), b = U.pick(pool.filter(x => x !== a));
        return { text: `Attention-hein-l'inox-que-je-te-mets-c'est-du-${a}-pas-du-${b}-faut-pas-confondre-sinon-ça-rouille-ou-ça-usine-mal-et-après-c'est-moi-qu'on-appelle`,
                 q: 'Eliott : « C\'est quelle nuance, l\'inox ? »', a, opts: four(a, pool) }; },
      () => { const pool = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'], a = U.pick(pool);
        return { text: `Bon-la-prochaine-livraison-camion-c'est-${a}-sauf-si-le-chauffeur-il-est-malade-mais-normalement-il-est-jamais-malade-sauf-l'an-dernier`,
                 q: 'Eliott : « Le camion passe quel jour ? »', a, opts: four(a, pool) }; },
      () => { const pool = ['CNMG 120408', 'DNMG 150608', 'VNMG 160404', 'TNMG 160408', 'WNMG 080408'], a = U.pick(pool);
        return { text: `Les-plaquettes-c'est-des-${a.replace(' ', '-')}-revêtues-carbure-grade-acier-tu-les-ranges-bien-dans-l'armoire-et-pas-dans-ta-poche`,
                 q: 'Eliott : « C\'est quoi la ref des plaquettes ? »', a, opts: four(a, pool) }; },
      () => { const pool = ['3 m', '6 m', '2,5 m', '4 m'], a = U.pick(pool);
        return { text: `Les-barres-je-te-les-coupe-en-${a.replace(' ', '-')}-ça-rentre-dans-la-benne-de-la-Méga-Mégane-normalement-sauf-si-Amaury-a-encore-mis-son-vélo-dedans`,
                 q: 'Eliott : « Je te coupe les barres à combien ? »', a, opts: four(a, pool) }; }
    ];
    return U.shuffle(T).slice(0, n).map(f => f());
  };

  D.update = dt => {
    if (!D.open) return;
    if (D.mode === 'listen') {
      D.t += dt; D.timerBar.style.width = Math.min(100, 100 * D.t / D.dur) + '%';
      const li = Math.min(D.lines.length - 1, Math.floor(D.t / (D.dur / D.lines.length)));
      if (li !== D.li) { D.li = li; D.textEl.textContent = D.lines[li]; }
      if (D.cond && !D.cond()) { D.close(); return; }
      if (D.t >= D.dur) end(D.onDone);
    } else if (D.mode === 'fast') {
      D.t += dt; const r = D.rounds[D.ri];
      if (D.phase === 'talk') {
        D.textEl.textContent = r.text.slice(0, Math.floor(D.t * 60));
        if (D.t >= D.talkDur) { D.phase = 'ask'; D.t = 0; D.textEl.textContent = r.q; D.setOptions(r.opts.map(o => ({ label: o }))); D.timerEl.style.display = 'block'; }
      } else if (D.phase === 'ask') {
        D.timerBar.style.width = Math.max(0, 100 - 100 * D.t / 4.5) + '%';
        if (D.t >= 4.5) answerFast(-1);
      } else if (D.phase === 'feedback' && D.t > 1.1) {
        if (D.ri < D.rounds.length) startRound(); else { D.textEl.classList.remove('fast'); end(D.onDoneFast, D.succ); }
      }
    }
  };
})();
