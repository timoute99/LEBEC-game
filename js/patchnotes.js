/* =====================================================================
   patchnotes.js — NOUVEAUTÉS (page « Patch notes » de l'accueil et du
   menu Pause). La plus récente en haut. Une version = un titre + une
   liste de lignes courtes, écrites pour les joueurs.
   Les suggestions et bugs envoyés depuis cette page arrivent sur le
   serveur : page admin https://lebec-game.onrender.com/admin, onglet Retours.
   ===================================================================== */
ML.PATCH = [
  { v: 'V6.0', d: 'novembre 2026', t: 'La grosse mise à jour : marché noir, relous, faim, casino… et un atelier vide au départ', l: [
    '🏭 Une partie commence avec un ATELIER VIDE et plus d\'argent : achète tes machines au PC, en 3 gammes (♻ occasion pas chère mais fragile, standard, ⭐ haut de gamme rapide et fiable).',
    '♻ Bruts et outils d\'OCCASION : moitié prix, rouillés, mais usure, pannes et pièces ratées plus fréquentes.',
    '📠 AKINOX INGENIEURING : bruts de fonderie / mécano-soudé pas chers, délai très variable… et parfois rien n\'arrive (tu le sais tout de suite).',
    '🕶 MARCHÉ NOIR : Jean-Mi, derrière l\'atelier, paie cash des pièces sans facture. Attention aux CONTRÔLES DE POLICE : planque sous la bâche, faux programme sur la machine, sinon grosse amende.',
    '🔧 La GRANDE clé à molette chasse Johan Bois, Lean Manufacturing et les SQUATTEURS. 🏏 La BATTE règle les conflits : saboteur, racketteur, mauvais payeurs (et les gens volent en ragdoll).',
    '👦 Dennis tague l\'atelier : lance-lui des sacs-poubelle. 💸 Un racketteur traîne dans la rue.',
    '🍔 Faim et 💤 fatigue : mange (stand de hot-dogs, distributeur) et fais la sieste, sinon tu t\'évanouis.',
    '🎰 En ville : PMU (courses de chevaux), casino (blackjack), prêteur sur gages, boîte de nuit, combats clandestins au Hangar 13.',
    '🎩 En solo, tu as TOUS les rôles (les PNJ aident quand même).',
    '🎫 Tickets redessinés : plus de nom de pièce, seulement le n° d\'O (O-0012), le client, les puces et l\'avancement. HUD allégé (plus de météo ni de satisfaction).',
    '🗺 Mini-carte centrée sur toi, nette et lisible, avec des flèches vers les objectifs ; grande carte (M) en haute résolution.',
    '🏢 Atelier mieux fini : bureau vitré du chef avec un PLANNING magnétique qui suit les vraies commandes, îlots signalés, vestiaires, affiches, servantes, pharmacie.',
    '👟 Nouveaux articles : chaussures, pantalons (même le short), lunettes, sac à dos, banane, cape. Tout s\'ESSAIE avant d\'acheter (aperçu 3D du perso et de la voiture).',
    '📘 Le tutoriel se ferme ou se réduit (boutons ✕ / ▁, touche J, ou Échap → « Fermer le tutoriel »).',
    '🛠 Corrections : le poste de préparation n\'est plus au milieu de l\'atelier, la ligne GPS violette se voit enfin à travers le pare-brise, le PC ne « clignote » plus en ajoutant une commande, tomber dans la rivière remorque la voiture (et le colis est perdu), le tuning s\'applique bien aux véhicules.',
    '🛠 Mode ADMIN (F9) pour tester : argent illimité, commandes et événements à la demande.'
  ] },
  { v: 'V5.5', d: 'novembre 2026', t: 'Bruts de fonderie et mécano-soudé enfin évidents', l: [
    '🧱 Sur le PC, un grand encadré orange « BRUTS À ACHETER » (dans 📥 Commandes et 🛒 Fournisseurs) : un bouton « 🛒 Commander » par pièce, le prix, où il arrive, et le compte à rebours de la livraison.',
    '✅ Les demandes de fonderie / mécano-soudé ont un bouton « Accepter + commander le brut » : un seul clic.',
    '📍 Un bouton GPS pour aller acheter le brut moins cher directement chez Fonderie Boulard ou Babinsky.',
    '🧱 L\'icône Fournisseurs du bureau montre combien de bruts sont à commander.',
    '💬 Les retours des joueurs sont dans la page admin (onglet Retours : filtres, recherche, « traité », téléchargement). Dans le jeu, un retour traité affiche « ✅ pris en compte ».'
  ] },
  { v: 'V5.4', d: 'novembre 2026', t: 'Page admin, Lean Manufacturing, journées de 8 min', l: [
    '📊 Nouvelle page ADMIN (/admin) : joueurs connectés en direct, visites et visiteurs uniques, temps de jeu par jour et par joueur, parties par mode, heures de pointe, entreprises, retours.',
    '💣 Bleuenn s\'appelle maintenant LEAN MANUFACTURING (et bricole toujours n\'importe quoi sur le tableau électrique).',
    '⏱ Les journées reviennent à 8 minutes (le reste de l\'équilibrage V5.3 est gardé).',
    '🛠 Le serveur démarre plus vite après une mise en veille.',
    '💾 Les comptes, entreprises et statistiques sont maintenant gardés dans une base de données Render : ils ne disparaissent plus quand le serveur s\'endort.'
  ] },
  { v: 'V5.3', d: 'novembre 2026', t: 'Un vrai ordinateur, un mode débutant, et l\'atelier plus facile à prendre en main', l: [
    '💻 Le PC de gestion devient un VRAI ORDINATEUR (« LebecOS ») : un bureau avec des icônes d\'applications, des fenêtres, une barre des tâches, un menu Démarrer… et un 📌 pense-bête qui dit quoi faire maintenant.',
    '💡 Nouvelle appli ASTUCES sur le PC : le guide complet (mécano-soudé, fonderie, TTH, grosses pièces, événements, véhicules, argent, touches).',
    '💡 Regarde un objet ou une personne un moment : un petit conseil discret s\'affiche sous l\'action.',
    '🐣 MODE DÉBUTANT (gros bouton vert sur l\'accueil) : un tutoriel complet qui explique TOUT, pas à pas, du premier pas à la commande mécano-soudée. Le temps passe 2× moins vite et il n\'y a aucun imprévu pendant le tuto. L\'ancien tutoriel est toujours là.',
    '👤 Comptes plus solides : rien n\'est perdu si le serveur redémarre, on n\'est plus déconnecté pour rien, et 🌍 TOUTES les entreprises du serveur sont visibles et jouables par tout le monde.',
    '🔩 Beaucoup plus de pièces différentes, et chaque client a les siennes (AéroTech, AgriMéca, Novatics, Ublo…).',
    '⏱ Journées plus courtes (7 min) et un peu plus faciles : délais plus longs, moins d\'imprévus, Lebec plus patient.',
    '🏗 Les GROSSES pièces arrivent dès le jour 2 (tout de suite à 3 joueurs et plus). Fenwick à 650 € et camion à 1 500 € : enfin utiles !',
    '🙋 Les services (clés de Trit, carton de Patrick…) marchent : il suffit d\'arriver sur place avec l\'objet. Distance affichée, plus de temps, plus de sous.',
    '💨 La soufflette va jusque dans la cour : on peut nettoyer les taches devant la porte.',
    '🦹 Taper Johan Bois ou Lean Manufacturing ne vaut plus de coups de pelle : Lebec ferme les yeux.',
    '🚗 Fini les murs invisibles en ville : les collisions des maisons suivent enfin leur vraie taille.'
  ] },
  { v: 'V5.2', d: 'novembre 2026', t: 'Vos idées : Johan Bois, Bleuenn, SAE, centre commercial, quêtes…', l: [
    '📋 Tickets du haut : une barre d\'AVANCEMENT et une ligne 👷 qui dit QUI s\'occupe de la commande (et où elle en est : machine, en main, dans la Mégane…).',
    '🔒 Zones bloquées : le compte à rebours descend VRAIMENT pendant la journée, et on peut les débloquer TOUT DE SUITE au PC (plus cher).',
    '🦹 Johan Bois vole parfois les commandes prêtes (une claque et il lâche tout). Au PC : un VIGILE anti-Johan.',
    '💣 Bleuenn branche son engin sur le tableau électrique… BOUM : coupure et machines en arrêt d\'urgence (E sur chacune). Une claque avant, et l\'atelier est sauvé.',
    '🚽 Les toilettes se salissent (cabine à gauche de l\'atelier) : sales, elles ralentissent les opérateurs. À nettoyer !',
    '🙋 Quêtes secondaires : des gens viennent demander un service ailleurs sur la carte (Cardin, Jimmy Kawa, Trit, les voisins…). Repère sur la carte, récompense en euros.',
    '🏠 Nouveaux lieux : maison de Cardin, appartement de Trit, maison de Jimmy Kawa, CENTRE COMMERCIAL (manger, de quoi se taper) et SALLE DE SPORT (tapis de course = endurance pour de bon).',
    '🎓 SAE comme en BUT : des pièces à présenter au jury (Garnier et Fanfrelat). Bonne note = bon de réduction sur une machine.',
    '🛍 BLACK FRIDAY un jour sur cinq : tout est moins cher. 🛵 Scooter de livraison au garage (pas cher, mais lent).',
    '🧰 Poste de préparation d\'usinage (PC) : il prépare tout seul des kits brut + outil. 🪚 Meuleuse pour découper les radars… ou « Pass Radar » pour ne plus payer.',
    '🚗 On VOIT les persos dans les véhicules, et les voitures ne rentrent plus dans l\'atelier. Le rond gris devant la porte a disparu.',
    '💡 Un cadre d\'astuces s\'affiche quand un événement spécial arrive (que faire ?).'
  ] },
  { v: 'V5.1', d: 'novembre 2026', t: 'Sauvegardes sur le compte, journées variées, tutoriel', l: [
    '💾 Le créateur du salon peut ENREGISTRER la partie sur son compte (menu Pause). Ses entreprises apparaissent dans « Mes entreprises », sur n\'importe quel PC.',
    '🎲 Chaque jour est différent : journée calme (mais pleine d\'imprévus), COUP DE FEU (les commandes pleuvent), journée agitée, veille de pont… Plus il y a de commandes, moins il y a de visites, et l\'inverse.',
    '🌊 Les commandes arrivent par vagues dans la journée.',
    '📘 Tutoriel pas à pas pour les nouveaux : accepter une commande, prendre un brut, la machine, l\'outil, livrer. Touche J pour le passer, à revoir depuis le menu Pause.',
    '📰 Cette page ! Avec un formulaire pour proposer des idées et signaler des bugs.'
  ] },
  { v: 'V5.0', d: 'novembre 2026', t: 'La grosse mise à jour', l: [
    '⛰ Du relief et une rivière avec des ponts. Plus de passants. Les immeubles Espacil, et Espacil Habitat devient client.',
    '🚪 On entre chez les clients (accueil, employés), au showroom du Garage Pasquier et à la gendarmerie.',
    '🚔 3 passants renversés = poursuite puis garde à vue (45 s). Caution possible à l\'accueil.',
    '📦 Les commandes et le bazar restent d\'un jour à l\'autre : rangez !',
    '🧾 Historique des dépenses au PC (qui a dépensé quoi, amendes comprises).',
    '⏸ Vrai menu Pause, salon avant de rejoindre une partie en cours.',
    '🏗 L\'atelier grandit : agrandissement (jour 3), rénovation (jours 5 et 10), Extension Est (jour 8).',
    '💨 Soufflettes sur air comprimé, météo qui change dans la journée, repères rouges qui clignotent.'
  ] },
  { v: 'V4.4 – V4.5', d: 'novembre 2026', t: 'Les personnages', l: [
    '🗣 Environ 400 répliques rangées par situation, sans répétition. Les opérateurs parlent en travaillant.'
  ] },
  { v: 'V4.3', d: 'novembre 2026', t: 'Graphismes', l: [
    '🎨 Atelier refait, machines détaillées, maisons, boutiques et immeubles variés, fenêtres allumées le soir.'
  ] },
  { v: 'V4.1 – V4.2', d: 'novembre 2026', t: 'Confort', l: [
    '⏱ Plus de temps pour les pièces, café plus efficace, caisses qui ne tombent qu\'en cas de gros choc.',
    '🗺 Carte (M) avec repère et trajet GPS, panier fournisseurs, colis à ouvrir (R), bouton « Installer le jeu ».'
  ] },
  { v: 'V4.0', d: 'novembre 2026', t: 'Économie et campagne', l: [
    '💶 Tout en euros, PC de gestion (commandes, achats, embauches), particuliers au comptoir, Garage Pasquier, campagne sauvegardée par code, jusqu\'à 6 joueurs.'
  ] }
];
