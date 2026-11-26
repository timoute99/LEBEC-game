# Mécanique Lebec V3 (multijoueur) : document de passation

V3 (nov. 2026) : rôles + vie/KO + PNJ de secours (`js/sim_roles.js`, enregistré AVANT chaos/city/events pour pouvoir refuser une action), pièces 3 tailles + fenwick/camion, bacs à copeaux, passagers (`car.pass`, `P.ride`), carte plein écran (`HUD.toggleMap`), personnalisation avec aperçu 3D (`ML.Main.preview`), ville refaite (`citygen.js` : rocade en U, avenues, rues greffées en T, impasses `node.cul`, lotissements, noms de rues `city.labels`), passants (`f.ps`) et chien de la casse (`f.dog`). Rôles transmis par relais `{k:'role'}` dans le salon, figés par l'hôte dans `cfg.roles`. Profil : `look` accepte aussi suit, height, width, beard, glasses (whitelist serveur).


Pour reprendre le projet sans contexte. Utilisateur francophone, étudiant BUT GMP : texte du jeu et commentaires en français, rendu soigné, vérifier avant de livrer. Style voulu : chaos 4/5, simple à comprendre.



## V5 — CARRIÈRE « SIMULATOR » (nov. 2026) : à lire en premier
Conception et contrats d'API : **docs/V5-CONCEPTION.md**. Résumé :
- **Carrière sans fin** (`career.js`, `sim_career.js`) : on part du Hangar Pourri (un tour de 1974, un apprenti) → 5 niveaux d'atelier + 6 pièces (BE, stock, pause, vestiaires, métrologie, quai). Argent, réputation, devis, contrats, salaires, loyer, électricité, faillite, objectifs (`ML.CAREER.GOALS`), durée des journées réglable (8–20 min).
- **PC du BE** (`be.js`, LebecOS 95) : devis, catalogue machines, matière, personnel (embaucher / affecter / licencier), travaux, compta + **historique des dépenses** (amendes par joueur), objectifs, réglages.
- **Machines déplaçables** (`sim_build.js`, API dans `world_atelier.js`) : livrées en caisse, fenwick/transpalette (R), installation E (fantôme vert/rouge), désinstallation à la clé.
- **Production** (`sim.js`, `ML.OPS`/`ML.Routing` dans config.js) : gammes 1–3 opérations, pièces « en cours », machines manuelles à piloter (mini-jeux 3D), CN avec réglage par référence, qualité ★–★★★, rebuts au marbre.
- **Mini-jeux 3D** (`minigames3d.js`, `ML.Mini3D`) : chariotage, tangentage, contour, perçage, taraudage, plaquette, mesure, touret, mandrin.
- **Navigation des PNJ** (`nav.js`), **conduite & circulation** (`cars.js`, `sim_city.js` ; réglages `CFG.CAR.kinds`), **nouveau bourg** (`citygen.js`), **falaise + corniche + plateau** (`terrain.js`, `citygen_outer.js`), chutes et crash (dépanneuse).
- **Patch note** : soufflette au tuyau (`sim_law.js`), gendarmerie → prison → caution, entreprises visitables.
- **Multijoueur** (`server.js`, `net.js`, `lobby.js`) : entreprises partagées (`saves/careers/<id>.json` sur GitHub), sauvegarde auto à mi-journée, reprise d'hôte.
- **Tutoriel** (`tuto.js`) : Lebec guide le jour 1 + astuces contextuelles (F1 / F2).
- **Reports de la branche V4.0→V4.5 (Timothée)** : `persos.js` (≈560 répliques, `ML.line` / `ML.redraw` dans config.js, tirage sans répétition), accueil SOLO / MULTIJOUEUR + guide (`ML.TIPS`), **difficultés** `ML.DIFFS` (facile, normal, difficile, LEBEC EN FEU → `cfg.game.diff`, `K.D`), **6 joueurs** et **rejoindre en cours de partie**, **PWA** (`manifest.webmanifest`, `sw.js` réseau d'abord : changer `CACHE` après une grosse mise à jour), touches M/Tab/AZERTY réparées, ping visible, événements en bas à gauche, **particuliers** au comptoir (`ML.PARTICULIERS`, offres au BE en carrière), **Garage Pasquier** (`concession`), **GPS** (`gps.js`), **colis** à ouvrir à la réception et ranger, caisses lancées dans le camion, café rapide (`CFG.COFFEE`), +30 % de temps sur les tickets. Non reportés (remplacés par la carrière V5) : sim_eco.js, erp.js, codes de sauvegarde, achat de véhicules au garage.
- Dev : `index.html#cam=x,y,z,cx,cy,cz&lvl=N&rooms=be,stock&demo` (vue fixe du menu), serveur local sans cache `.claude/devserver.py`.

## V4 — REFONTE VISUELLE (nov. 2026) : à lire en premier

### Direction artistique
Style « jouet low-poly » : aplats, ombrage toon à 3 tons, proportions un peu exagérées, détails absurdes. **Une seule source de vérité : `js/style.js`.**
- `ML.PAL` : la palette. Ne pas inventer de couleurs ailleurs (variantes : `ML.Style.vary`).
- `ML.Style.toon(couleur, émissif, opts)` : seul type de matériau. `U.mat` est redirigé dessus, `ML.Tex.mat` aussi.
- `ML.Style.box` (boîte chanfreinée), `ML.Style.signTex` (enseignes), `ML.Style.merge(groupe)` (fusion par matériau : à utiliser pour TOUT décor statique, sinon le jeu rame), `ML.Style.sky` / `setSky` (ciel dégradé).
- Outil de dev : `index.html#cam=x,y,z,cx,cy,cz` place la caméra du menu et cache le menu (captures d'écran) ; ou `ML.debugCam = {p:[…], t:[…]}` dans la console.

### Le monde (1200 × 1200 m au lieu de 340 × 370)
- `js/terrain.js` : relief déterministe (graine). Bassin de la ville presque plat, montagne au nord avec un col, plateau et lac, collines à l'est, bocage à l'ouest/sud, rivière qui passe derrière l'atelier. L'atelier et sa cour sont **toujours à l'altitude 0**.
- `js/citygen.js` : centre-ville (inchangé dans son principe, limité à `CFG.CORE`) + types de bâtiments (`fillers[].type`).
- `js/citygen_outer.js` : autoroute A84 (2×2 voies), rond-point de la Pelle (statue de Lebec) + bretelle + péage, route du col en lacets (A* sur le relief), chemin du lac, descente est, D12 vers le hameau de Kerlebec, fermes, forêts, rochers, ponts/viaducs détectés automatiquement.
- Drapeaux des arêtes : `core` (centre), `hw` (autoroute, aussi `ring` → vitesse rapide), `mtn`, `dep`, `giratoire`, `bridge`, `rw` (demi-largeur). La circulation, les passants et la carte utilisent le même graphe qu'avant : rien à changer dans `sim_city.js`.
- `CFG.MAP` = monde entier, `CFG.CORE` = centre-ville. `ML.LOC.sites` = { col, lac, hameau, rondpoint, auberge }.
- `world.js` : routes fusionnées (très peu d'appels de dessin), `W.cull(cam)` masque les bâtiments lointains.
- `U.resolveCircle` / `U.inCollider` passent par une grille spatiale (des milliers d'arbres ont des colliders).

### ⚠ CONVENTION DE HAUTEUR (important pour brancher la suite)
`ML.Terrain.h(x, z)` = altitude du sol (ponts compris). **Tous les y de la simulation et du réseau restent RELATIFS au sol** (debout = 0, un objet posé = 0). On ajoute `h` uniquement au RENDU :
- déjà fait : caméra et `G.eye()` (absolus), objets au sol (`game.js`), persos, voitures (inclinées selon la pente), circulation, gendarmerie, passants, chien, pigeon, flaques, feux (fichiers `people.js`, `cars.js`, `fx.js`), bâtiments et entreprises.
- Toute NOUVELLE chose posée par terre en ville doit faire pareil. Les cibles `W.targets` des entreprises ont déjà `y` absolu.
- `ML.Terrain.water(x,z)` (altitude de l'eau ou null) : à utiliser si on veut que les voitures « plongent » dans la rivière.

### Patch note : ce qui est prêt côté visuel et ce qu'il reste à brancher
| Demande | Visuel livré | À brancher (logique) |
|---|---|---|
| Relief, rivière, routes de montagne, autoroute | ✅ complet | rien (option : ralentir les voitures en montée, `ML.Terrain.slope`) |
| Passants | ✅ variés | — |
| Détails forêts / bruts / armoire / étagère d'outils | ✅ (world_atelier.js) | — |
| Soufflette reliée à l'air comprimé | ✅ enrouleurs + tuyau dynamique : `W.HOSE_LEN`, `W.hoseReels`, `W.updateHoses(positions)` | appeler `ML.World.updateHoses(positions)` à chaque image chez tous les clients (positions monde de TOUTES les soufflettes, tenues ou posées) ; elle renvoie l'indice d'enrouleur de chacune (-1 = aucun). Bloquer le porteur si `distance(position, hoseReels[i]) > HOSE_LEN` (14 m). Détails en tête de world_atelier.js |
| Entreprises ouvertes avec réception et persos | ✅ porte, accueil, bureaux/atelier, personnel ; colliders de murs ; `P.door` (position de la porte) | — |
| Gendarmerie + prison | ✅ cellule : `ML.LOC.jail {x,z,yaw}`, `ML.LOC.jailDoor`, `ML.World.jailDoor(ouvert)` | compteur de passants renversés (`ped` dans `sim_city.js`) → poursuite → téléporter le joueur à `ML.LOC.jail`, fermer la porte, le libérer après X s |
| Historique des dépenses (amendes par joueur) | ❌ non fait (c'est surtout de la logique + un écran HUD) | à faire |

## 1. Le projet
Jeu coopératif 3D façon *Overcooked* en atelier d'usinage, 1 à 6 joueurs dans le navigateur, clavier/souris ou manette.
V2 = V1 (multi validé) + les 4 vagues demandées : chaos, ville vivante, mini-jeux/événements/visiteurs/humeur, campagne/comptes/boutique/succès/traître/inspecteur.

## 2. Contraintes (à respecter)
- **Marche en double-clic** (`file://`) : pas de modules ES, pas de `fetch`. `<script>` classiques dans l'ordre de `index.html`.
- **Tout est sous `window.ML`**, une IIFE par fichier. **Three.js r128** local. Décors KayKit en base64 (`assets-ville.js`).
- **SECRETS** : `GITHUB_TOKEN`, `GITHUB_REPO`, `AUTH_SECRET` sont des variables d'environnement Render que l'utilisateur règle lui-même. Ne les demande pas, ne les affiche pas et ne les écris jamais dans le code. Ne jamais livrer `server/node_modules` ni `server/data`.

## 3. Réseau (inchangé sur le principe)
- Serveur `server/server.js` (Node ≥ 18 + `ws`) : salons (code 4 lettres, 5 max), relais, reprise 20 s, ping, limite de débit, fichiers statiques, `/health`.
  - V2 : `{t:'start', seed, cfg}` (cfg = mode de jeu, relayé à tous) et les **comptes** `{t:'acc', q, op:'register'|'login'|'resume'|'save'}` → `{t:'accr', q, ok, …}` (mots de passe scrypt, jetons HMAC, profil filtré par `cleanProfile`). Stockage : GitHub (contents API) si `GITHUB_TOKEN`+`GITHUB_REPO`, sinon `server/data/accounts.json`.
- L'hôte fait autorité (`sim*.js`). Clients → `{k:'p'}` pose 15 Hz (avec voiture, essence `f`, effet `fx`), `{k:'a'}` intentions (avec position `p`), `{k:'look'}` apparence. Hôte → `{k:'f'}` 10 Hz (PNJ, objets en vol, voitures, circulation `tr`, gendarmerie `pol`, pigeon `pg`), `{k:'s'}` état complet sur changement, `{k:'e'}` événements.
- Événements V2 : `stat` (succès, envoyé au joueur concerné), `secret` (traître), `emote`, `ping`, `horn`, `push`, `flash`, `arrest`, `fuel`, `vote`, `voted`, `end`.
- Intentions V2 : `spray`, `blow`, `slip`, `repair`, `spill`, `horn`, `refuel`, `dry`, `audit`, `mathieu`, `vote`, `emote`, `ping` ; `use` peut porter `mg` (résultat de mini-jeu) ou `ctl` (contrôle au marbre).
- Les secrets (identité du traître) restent dans `ML.Sim.K.priv`, jamais dans l'état diffusé.

## 4. Fichiers
| Fichier | Rôle |
|---|---|
| `js/config.js` | **contenu et équilibrage** : machines, entreprises (tailles, plus de position), humeurs, météo, événements, règles de l'inspecteur, succès, boutique, améliorations, persos, répliques, quiz |
| `js/citygen.js` | **ville générée par graine** : carrefours au hasard, arbre couvrant + raccourcis sans croisement, entreprises dispersées le long des routes, décor, radars, feux, cachettes, perchoirs |
| `js/world.js` | construit la 3D à partir de la ville (`World.build(seed, upgrades)` à chaque partie), atelier (postes T3/F3 achetables), cibles, `ML.LOC` |
| `js/sim.js` | **cœur de la simulation de l'hôte** + outillage partagé `Sim.K` ; les modules s'y branchent via `Sim.mods` (init/step/act/use/machineUse/npcUse/npcHit/brain/bubble/workMult/itemHit/fast/onEnd/voteStep) |
| `js/sim_chaos.js` | copeaux → feux, pannes, usure d'outil, flaques, pigeon, extincteur, soufflette |
| `js/sim_city.js` | véhicules (Mégane, Kangoo, Ducato, transpalette), essence, caisses qui tombent, circulation + feux, radars, gendarmerie, mode course |
| `js/sim_events.js` | événements tirés au hasard (audit, coupure, sabotage, Hervé, Fred, Mathieu, panne), inspection (règles), traître (vote) |
| `js/fx.js` | rendu des feux, tas de copeaux, flaques, pigeon, particules, pings |
| `js/minigames.js` | mini-jeux locaux : origine, plaquette, serrer, pied à coulisse, quiz, Arexis |
| `js/account.js` | profil, jetons, boutique, succès |
| `js/cars.js` | modèles, conduite (essence, pluie, flaques, roulis), tuning, rendu circulation/gendarmerie |
| `js/input.js` | clavier, souris, **manette** (touches virtuelles) |
| `js/people.js` | personnages (chapeaux, ragdoll, émotes) |
| `js/rules.js` | textes [E] et déclenchement (mini-jeux → intention) |
| `js/hud.js` | tickets, bandeau d'événements, carte du jour, course, vote, succès, fin de journée + améliorations |
| `js/game.js` | session : contrôles, synchro, rendu, météo |
| `js/lobby.js` | menus, compte, profil/boutique, modes, **campagne** (`ML.Camp`, localStorage de l'hôte) |

## 5. Tests réalisés (Playwright + serveur local, sans erreur console)
- Solo : les 4 modes, 150 s d'avance rapide chacun ; tous les événements forcés (Hervé → convention signée par Lebec, coupure → tableau, Fred → Arexis, Mathieu, audit de Jacky) ; feu éteint à l'extincteur, panne, flaque, pigeon ; contrôle au marbre ; conduite avec caisse tombée en virage ; fin de journée.
- Production complète : brut + prise d'origine + outil, usure → changement d'outil, caisse en expédition.
- Campagne : fin du jour 1, achat du T3 (apprenti), jour 2 avec 5 machines ; jour 5 = inspection (infractions klaxon/claque), avis favorable → nouvelle saison.
- Multi 3 navigateurs : création de compte + reconnexion depuis un autre navigateur (profil retrouvé), apparence transmise (couronne), même ville chez tous, émote, ping, soufflette qui pousse un joueur, circulation synchronisée, traître choisi et prévenu en secret, vote et révélation, mode course (arrivée et points).
- Manette simulée (stick, regard), mini-jeux au clavier réel.

## 6. Non vérifié / pistes
- Pas testé sur Render ni avec de vrais joueurs : équilibrage à régler (fréquence des feux/pannes `sim_chaos.js`, seuil des caisses qui tombent `game.js`, durée des tickets `config.js`).
- Circulation simple (téléportation au carrefour, la gendarmerie « coupe » quand elle est bloquée).
- Pas de migration d'hôte ; campagne liée au PC de l'hôte.
- Vraie manette non testée (seulement simulée).
