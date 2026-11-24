# Mécanique Lebec (multijoueur) : document de passation

Pour reprendre le projet sans contexte. Utilisateur francophone, étudiant BUT GMP : texte du jeu et commentaires en français, rendu soigné, vérifier avant de livrer.

## 1. Le projet
Jeu coopératif 3D façon *Overcooked*, mais en atelier d'usinage, de 1 à 5 joueurs dans le navigateur.
Des tickets arrivent : brut + outil → machine → caisse → (sous-traitant) → livraison au client en voiture.
La V1 sert à valider le multijoueur. La V0 solo (avec quêtes, planning, Jacky, Hervé…) est dans un autre zip (« atelier-lebec »).

## 2. Contraintes (à respecter)
- **Marche en double-clic** (`file://`) : pas de modules ES, pas de `fetch`. Uniquement des `<script>` classiques, dans l'ordre de `index.html`.
- **Tout est sous `window.ML`.** Chaque fichier est une IIFE qui ajoute son module (`ML.Sim`, `ML.Game`…).
- **Three.js r128** (`lib/three.min.js` + `lib/GLTFLoader.js`), comme le projet Backrooms.
- **Décors KayKit** : ils sont dans `assets-ville.js` (base64, ~1,4 Mo), extraits de l'`assets-data.js` de Backrooms par `outils/extraire-assets-ville.js`.
  - Tous les modèles partagent un `MeshLambertMaterial` avec l'atlas, en encodage linéaire (pas de sRGB : les couleurs hex du code restent justes).
- **Textures dessinées par code** (`textures.js`), pas de photos.

## 3. Architecture réseau
- **Serveur** (`server/server.js`, Node ≥ 18 + `ws`) : il ne fait que relayer.
  - Salons à code de 4 lettres, 5 joueurs maximum.
  - Il garde la place d'un joueur 20 s après une coupure (reprise de session via l'identifiant d'onglet `sid`, stocké dans sessionStorage), et envoie un ping toutes les 15 s.
  - Limite de débit : 120 messages/s par joueur.
  - Il sert aussi les fichiers du jeu, donc l'URL Render est directement jouable.
  - Endpoint `/health`.
- **L'hôte fait autorité** (`sim.js`, exécuté seulement chez lui) : tickets, stock, machines, PNJ, objets, sous-traitants, trouvailles, score, et position des voitures non conduites.
- **Ce que chaque client envoie** (relais) :
  - `{k:'p'}` sa pose, 15 fois par seconde, à tout le monde ; elle contient la voiture qu'il conduit ;
  - `{k:'a', a:…}` ses intentions, à l'hôte seulement. Une intention porte la position `p` du joueur au moment de l'action.
- **Ce que l'hôte diffuse** :
  - `{k:'f'}` 10 fois par seconde : PNJ, objets en mouvement, voitures ;
  - `{k:'s'}` l'état complet, dès qu'il change (au plus toutes les 0,1 s) et au moins une fois par seconde ;
  - `{k:'e', l:[…]}` les événements : notification `n`, réplique `say`, gros texte `big`, son `sfx`, claque `stun`, coup de pelle `pelle`, fin de journée `end`.
- **Intentions** (`a`) :
  - `use` (id de cible), `drop`, `throw`, `hit`, `exit` (sortir de voiture) ;
  - `eliott` (résultat du mini-jeu), `coco`, `sub` (commande à la fonderie ou la chaudronnerie).
- **Identifiants de cibles** : `rack:alu`, `tool:fraise`, `mach:T1`, `npc:amaury`, `item:12`, `car:0:door`, `car:0:bed`, `pl:<id joueur>`, `reception`, `coffee`.
  - `rules.js` calcule le texte [E] côté client, à partir de l'état répliqué `ML.Game.S`.
  - `sim.js` applique les actions.
- **Hôte qui rame** : la simulation avance au temps réel, par sous-pas de 50 ms (`G.step(dt, render, raw)`). Si l'onglet de l'hôte est masqué, une minuterie de 100 ms continue la partie (`main.js`).
- **Départ de l'hôte** : la partie s'arrête chez les autres et ils retournent au salon (pas de migration de la simulation en V1).

## 4. Fichiers
| Fichier | Rôle |
|---|---|
| `js/config.js` | **Équilibrage et contenu** : durées, stock de départ, pièces, machines, entreprises (position, quai), trouvailles, persos, répliques |
| `js/util.js` | rng à graine, collisions cercle/boîte (`ML.colliders`), étiquettes sprite |
| `js/textures.js` | textures canvas (béton, asphalte, herbe, brique, tôle, bardage, bois, quai) |
| `js/assets.js` | chargement des modèles KayKit (`ML.Assets.clone(nom, échelle)`) |
| `js/net.js` | client WebSocket (réveil de Render, reprise, événements) |
| `js/items.js` | types d'objets + modèles 3D |
| `js/people.js` | personnages low-poly (PNJ et avatars), animation, objet tenu |
| `js/world.js` | carte déterministe (graine fixe) : atelier à 4 postes, routes, entreprises, décor KayKit, cachettes (`ML.LOC.hides`) |
| `js/cars.js` | Méga Mégane et Kangoo : modèle, conduite locale du conducteur, caméra |
| `js/rules.js` | textes [E] et interfaces locales (mini-jeux) |
| `js/sim.js` | **simulation de l'hôte** |
| `js/dialogue.js` | dialogues, écoute chronométrée, mini-jeu d'Eliott |
| `js/hud.js` | tickets, équipe, mini-carte, inventaire, fin de journée, aide |
| `js/game.js` | session : contrôles locaux, synchro, interpolation, rendu |
| `js/lobby.js` | menus : solo, créer/rejoindre, salon |
| `js/main.js` | démarrage et boucle |

## 5. Tests (méthode)
- **Solo en `file://`** : `index.html?debug` (pas de verrouillage de la souris).
  - Pilotage par `ML.Game`, `ML.Sim.act(pid, {a, id, sel})`, `ML.Rules.use(id)`.
- **Multijoueur réel** : `PORT=8099 node server/server.js`, puis 3 contextes Playwright sur `http://localhost:8099/?debug`.
  - Testé : création et adhésion au salon, lancement, brut et outil donnés par 2 joueurs différents, passage d'objet entre joueurs, claque entre joueurs, voiture conduite vue par les autres, état identique chez tous, coupure d'un joueur (place libérée après 20 s), fin de journée, « Nouvelle journée », départ de l'hôte.
  - Aucune erreur console.
- **Vérifier la syntaxe** : `for f in js/*.js server/server.js; do node --check $f; done`.
- **Livrer** : zipper sans `server/node_modules`.

## 6. Non vérifié / à faire
- Pas encore testé en ligne sur Render, ni avec de vrais joueurs ; l'équilibrage (durée des tickets, étoiles) est à régler en jeu.
- Pistes V2 (demandées) :
  - remettre les quêtes de la V0 (Jacky et l'audit de la Réf A, Hervé et la convention, Fred et Arexis, la tirade de Lebec), Mathieu, UsiFlash ;
  - avatars KayKit animés ;
  - plus de sous-traitants (peinture, rectification) ;
  - migration d'hôte ;
  - version téléphone.
- Novatics et Ublo sont des **clients** au look inventé : on ne connaît pas leur vrai métier, à demander à l'utilisateur.
