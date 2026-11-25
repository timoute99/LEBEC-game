# Mécanique Lebec V3 (multijoueur) : document de passation

V3 (nov. 2026) : rôles + vie/KO + PNJ de secours (`js/sim_roles.js`, enregistré AVANT chaos/city/events pour pouvoir refuser une action), pièces 3 tailles + fenwick/camion, bacs à copeaux, passagers (`car.pass`, `P.ride`), carte plein écran (`HUD.toggleMap`), personnalisation avec aperçu 3D (`ML.Main.preview`), ville refaite (`citygen.js` : rocade en U, avenues, rues greffées en T, impasses `node.cul`, lotissements, noms de rues `city.labels`), passants (`f.ps`) et chien de la casse (`f.dog`). Rôles transmis par relais `{k:'role'}` dans le salon, figés par l'hôte dans `cfg.roles`. Profil : `look` accepte aussi suit, height, width, beard, glasses (whitelist serveur).


Pour reprendre le projet sans contexte. Utilisateur francophone, étudiant BUT GMP : texte du jeu et commentaires en français, rendu soigné, vérifier avant de livrer. Style voulu : chaos 4/5, simple à comprendre.

## 1. Le projet
Jeu coopératif 3D façon *Overcooked* en atelier d'usinage, 1 à 5 joueurs dans le navigateur, clavier/souris ou manette.
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
