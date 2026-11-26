# Mécanique Lebec V5 — Carrière « simulator » : conception et contrats

Inspiration : Supermarket Simulator / Cybercafé Simulator. On reprend **un atelier pourri** et on finit avec **une usine de fou**.
Vue à la 1re personne, coop 1 à 5 joueurs (l'hôte possède l'atelier et la sauvegarde), carrière sans fin.

## Boucle de jeu
1. Le matin, au **PC du BE** : lire les appels d'offres (devis) → accepter ; commander matière/outils ; acheter des machines ; embaucher ; affecter les ouvriers ; commander des travaux (agrandir, construire une pièce).
2. Pendant la journée : les tickets viennent des devis signés → brut + outil → machine (ouvrier affecté) → caisse → livraison (voiture/camion), y compris par la **route en corniche** de la falaise (plus rapide mais dangereuse) vers les clients du plateau (mieux payés).
3. Les achats arrivent **par camion** en zone LIVRAISONS. Une machine arrive **en caisse sur palette** : il faut la déplacer au **fenwick** (ou transpalette) dans l'atelier puis l'**installer** (E). On peut **désinstaller** une machine (clé à molette) pour la déplacer.
4. Le soir : salaires, électricité, loyer, échéances des devis ; les travaux et les embauches prennent effet le lendemain matin ; sauvegarde (en ligne si connecté → GitHub `saves/<pseudo>.json`).

## Fichiers et responsabilités
| Fichier | Rôle | Propriétaire |
|---|---|---|
| `js/career.js` | catalogue (ML.CAREER), état, sauvegarde, `Career.layout/apply` | chef (lead) |
| `js/sim_career.js` | argent, BE (intentions `a:'be'`), livraisons, fin de journée | chef |
| `server/server.js` | `acc` op `cload`/`csave` | chef |
| `js/world_atelier.js` | **bâtiment évolutif** (5 niveaux), pièces annexes, mobilier, **modèles 3D des machines** + API runtime | agent Atelier |
| `js/sim_build.js` (nouveau) | **déplacement / installation / désinstallation** des machines (hôte) | agent Machines |
| `js/be.js` (nouveau) + CSS | **interface du PC du BE**, HUD carrière, bilan de fin de journée, historique des dépenses | agent BE |
| `js/sim_law.js` (nouveau) | patch note : **tuyau de soufflette**, **gendarmerie → arrestation → prison** | agent Loi |
| `js/terrain.js`, `citygen*.js`, `world.js` | falaise, corniche, plateau, ville | chef |

Fichiers partagés (`game.js`, `rules.js`, `items.js`, `index.html`, `css/style.css`, `hud.js`) : **petites insertions seulement**, toujours relire le fichier juste avant de le modifier, ne jamais réécrire un fichier entier.

## Données disponibles
- `ML.ATELIER` (tous les joueurs, avant `World.build`) : `{ career, lvl, rooms:{be,stock,pause,vestiaire,metrologie,quai}, box:{w,d,minX,maxX,minZ,maxZ}, crates, assign }`. Hors carrière : `career:false, lvl:3` (atelier classique 40×28).
  Le mur de façade est TOUJOURS en z = 14, porte au centre ; le bâtiment grandit vers −z et sur les côtés. Cour devant (z 14→30), zone **LIVRAISONS** dans la cour.
- `ML.MACHINES` : tableau des machines installées `{ id, type:'tour'|'fraiseuse', name, model, x, z, rot (quarts de tour), len, tier 0..4, speed, quality, panne, wear }`.
- `ML.CAREER.MACHINES[model]` : catalogue (prix, tier, description). `tier` 0 = vieille machine rouillée … 4 = centre 5 axes.
- Côté hôte : `S.machDefs` (copie de ML.MACHINES, source de vérité pendant la journée, diffusée dans l'état) ; `S.car` (argent, réputation, offres, candidats, contrats, livraisons, écritures du jour, travaux prévus…).

## Contrats d'API
### Atelier (world_atelier.js)
- `W.atelier()`, `W.furniture()`, `W.machinesBuild()` : construits d'après `ML.ATELIER` et `ML.MACHINES`.
- Positions à fournir dans `ML.LOC` (en fonction du niveau !) : `spawn[5]`, `patrol[]`, `coffee[]`, `idle[]` (ouvriers sans poste), `lebec`, `hooks[]`, `reception`, `expedition`, `bigZone`, `livraison` {x,z} (cour), `carSpawn`, `tpSpawn`, `fenSpawn`, `camSpawn`, `benne`, `doorIn`.
- Cibles `W.targets` : `rack:acier|alu|inox`, `tool:*`, `coffee`, `reception`, `printer`, `pc` (Arexis), **`be`** (PC de gestion), `marbre`, `panel`, `casques`, `benne`, `mach:<id>`, `bac:<id>`, `frigo`.
- `W.atelierBounds()` → `{minX,maxX,minZ,maxZ}` zone où l'on peut installer une machine.
- `W.addMachine(def)` / `W.removeMachine(id)` : ajoute/retire le modèle 3D, son collider, ses cibles et `W.machines[id]` (mêmes champs qu'avant : group, lightMat, spinner, smoke, label, station, chips, def).
- `W.syncMachines(defs)` : met la scène en accord avec la liste (ajouts, retraits, déplacements).
- `W.machineGhost(def | null, ok)` : fantôme translucide vert (ok) / rouge pour l'aperçu de placement.
- `W.machineFootprint(def)` → `{minX,maxX,minZ,maxZ}` (emprise + place de l'opérateur).

### Simulation
- `K.trait(id, 'robot'|'hungry'|'deadstop'|'forgetful'|'apprenti')`.
- `K.money(montant, libellé, type, qui)`, `K.fine(pid, montant, libellé)` (amende au nom du joueur).
- `K.careerAssign(pid, workerUid, machineId|null)`, `K.rehome(machineId)` (après déplacement).
- `K.careerOn()`.
- Intentions BE : `{ a:'be', op:'accept'|'decline'|'order'|'buy'|'hire'|'fire'|'assign'|'build'|'upgrade', … }` (voir l'en-tête de sim_career.js).
- Objet `machine` (caisse sur palette) : `{ type:'machine', d:{ uid, model } }`, lourd (fenwick / transpalette).
