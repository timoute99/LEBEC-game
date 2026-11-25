/* =====================================================================
   persos.js — LES PERSONNAGES (fichier à modifier librement)
   Tout le texte ci-dessous (jusqu'à la ligne « NE PAS MODIFIER ») est lu par le jeu.
   ===================================================================== */
ML.PERSOS_TXT = `
# ======================================================================
#  LES PERSONNAGES DE MÉCANIQUE LEBEC
# ======================================================================
#  COMMENT MODIFIER (sur GitHub : ouvre ce fichier, clique sur le crayon ✏️,
#  modifie, puis « Commit changes »). Le jeu est à jour 2-3 minutes après.
#
#  - Une ligne qui commence par # est un commentaire (le jeu l'ignore).
#  - [identifiant] commence un personnage. NE CHANGE PAS l'identifiant
#    (c'est ce qui le relie au jeu), mais tout le reste, oui.
#  - nom: / rôle:        → affichés dans le jeu.
#  - personnalité: / dans le jeu: / idées:  → des NOTES (le jeu ne les
#    utilise pas). Écris dans « idées: » ce que tu voudrais que Claude
#    ajoute : il les lira et les codera.
#  - Une liste (répliques:, pause:, colère:…) = une réplique par ligne,
#    chaque ligne commence par « - ». Ajoute-en autant que tu veux :
#    le jeu les tire au hasard sans répéter tant qu'il n'a pas tout dit.
#  - Seul caractère interdit : l'accent grave (celui de la touche Alt Gr + 7).
#    S'il y en a un, le jeu ignore ce fichier et garde ses anciennes répliques.
#    Les apostrophes ' et les guillemets « » " sont autorisés.
#
#  LES SITUATIONS (listes) QUE LE JEU CONNAÎT :
#    répliques   : quand on lui parle / quand il parle tout seul
#    Lebec       : tirades (humeur « réforme »), colère (il voit une claque),
#                  frappé (on le frappe), poursuite (il court avec la pelle),
#                  pelle (il vient de mettre un coup), abandon (il lâche l'affaire)
#    opérateurs  : lance (il démarre une pièce), pause (il part en pause),
#                  retour (il revient de pause tout seul), réveil (on le remet
#                  au travail), refus (il ne veut pas), claque (on lui met une
#                  claque), embauche (premier jour), miam (Matis mange)
#    clients     : merci (quand on lui livre sa caisse)
#    particuliers: demande (ce qu'il raconte au comptoir), merci,
#                  marre (il en a marre d'attendre et repart)
#    Coco        : boxe (ses histoires de boxe pendant qu'on attend)
#    Jacky       : audit (il attend sa caisse), réussi, raté, absent (personne
#                  ne lui a présenté de caisse)
#    inspecteur  : infraction
#    tout le monde : renverse (quand on le renverse en voiture) — sinon
#                  le jeu prend la liste « renverse » de [tous]
#  Une liste que le jeu ne connaît pas encore (ex. « blague: ») est gardée :
#  dis à Claude à quel moment l'utiliser.
#
#  IDÉES GÉNÉRALES POUR CLAUDE (écris ici) :
#  -
# ======================================================================


# ======================= TOUT LE MONDE =======================

[tous]
nom: (répliques communes)
rôle: Utilisées quand un personnage n'a pas sa propre liste
renverse:
- Eh oh ! Regarde où tu roules !
- Ça va pas la tête ?!
- Il y a un trottoir, tu sais !
- Je vais le dire à Lebec !
- Mon dos ! Mon pauvre dos !
- C'est un Kangoo ou un bulldozer ?!


# ======================= L'ATELIER =======================

[lebec]
nom: François Lebec
rôle: Chef d'atelier
personnalité: Fin, blouse verte avec « C'EST ÉCRIT DANS LE POLY !! » dans le dos. Usineur à l'ancienne, formé quand on faisait « quatre ans de lime ». Râleur, nostalgique, allergique aux réformes de l'Éducation Nationale et à la violence dans SON atelier. Au fond il adore ses gars, mais il préférerait mourir que de l'avouer. Ne se sépare jamais de sa pelle.
dans le jeu: Patrouille dans l'atelier. S'il voit une claque, sa colère monte ; à 50 il poursuit le fautif avec sa pelle (−20 PV). Son humeur change chaque jour.
idées:
répliques:
- Encore une réforme de l'Éducation Nationale... on forme des usineurs en trois semaines !
- La cote c'est la cote ! Pas « à peu près » !
- De mon temps, le CAP c'était deux ans de lime et d'étau !
- Pas un rond pour les machines, mais des tablettes pour tout le monde !
- Qui a laissé traîner de l'huile soluble ?!
- C'est écrit dans le poly ! Page 12 ! PAGE DOUZE !
- Un comparateur, ça se respecte. On ne s'en sert pas comme presse-papier.
- Le copeau doit être bleu, pas violet. Violet, c'est que tu brûles tout.
- Quand j'étais jeune, on n'avait pas de CN. On avait des manivelles. Et des bras.
- Rangez-moi cet établi ! On dirait la chambre de mon neveu.
- Le zéro pièce, c'est le premier pas vers le zéro neurone.
- Vous savez ce qu'est un Ra ? Non ? Évidemment.
- On ne met pas les doigts dans le mandrin. Je le dis une fois. Après, je le dis avec la pelle.
- Je veux voir des copeaux, pas des portables !
- Un bon usineur, ça ne court pas. Ça anticipe.
- Ma pelle et moi, on a 35 ans de carrière. Elle, elle n'a jamais pris de pause.
- La lubrification, c'est comme la politesse : ça évite les frottements.
- Tolérance h7. Pas h8. Pas « h-ça-ira ». H7.
- Le poly, je l'ai écrit en 1987. Et il est toujours juste.
- Les jeunes, ils veulent tout tout de suite. Moi aussi, mais moi je le mérite.
tirades:
- Écoute-moi bien. En 1987, on avait QUATRE ans de formation.
- Aujourd'hui ? Un module de 12 h « sensibilisation à l'usinage » !
- Les gamins savent pas ce qu'est un Ra. UN RA !
- Et le ministre, il a déjà tenu une lime, le ministre ? Non !
- Maintenant on fait des « compétences ». Moi je fais des PIÈCES.
- On m'a demandé de remplir un référentiel de 40 pages. Pour dire qu'un tour, ça tourne.
- Ils ont remplacé l'atelier par une salle « d'innovation ». Avec des poufs. DES POUFS !
- Bientôt, on usinera en visio. Tu verras. Tu verras !
colère:
- JE T'AI VU ! ON NE FRAPPE PAS LES COLLÈGUES !
- Hé ! On n'est pas à la récré ici !
- Ça, je l'ai vu. Et ma pelle aussi l'a vu.
- La violence, c'est zéro dans le poly ! ZÉRO !
- Encore une claque et c'est la pelle, je te préviens !
- Tu crois que je suis aveugle ? J'ai des yeux derrière la blouse !
frappé:
- TU M'AS FRAPPÉ ?! COUP DE PELLE !!!
- MOI ?! Tu oses frapper le CHEF ?! LA PELLE !
- Trente-cinq ans de carrière et on me frappe ! AU SECOURS LA PELLE !
poursuite:
- COUP DE PELLE !
- REVIENS ICI !
- TU VAS VOIR LA PELLE !
- PAS DE COURSE DANS L'ATELIER… SAUF MOI !
- JE SUIS VIEUX MAIS JE SUIS RAPIDE !
pelle:
- Et voilà. C'était écrit dans le poly.
- Ça t'apprendra. Au travail maintenant.
- La pelle a parlé.
- Bon. On reprend. Calmement.
renverse:
- TU M'AS RENVERSÉ ?! COUP DE PELLE !
- Le permis, tu l'as eu dans une pochette surprise ?!
- Même la Mégane d'Amaury conduit mieux que toi !
abandon:
- Tu perds rien pour attendre, toi !
- Pff… Je te retrouverai à la pause café.
- Mes genoux… Je te laisse filer. Pour cette fois.
- Cours, cours… J'ai le temps, moi. Toute la journée.

[amaury]
nom: Amaury Carter
rôle: Opérateur
personnalité: Rêveur, gentil, tête complètement en l'air. Passionné de sa Méga Mégane et de tuning. Peut oublier ce qu'il usine en plein milieu, ou perdre ses clés dans sa propre poche.
dans le jeu: Oublie parfois ce qu'il usine (il faut lui rappeler avec E). Bon rythme sinon.
idées:
répliques:
- Euh... j'usinais quoi déjà ?
- Ma Méga Mégane, elle est où ?
- J'ai mis un aileron sur la Mégane. Elle va pas plus vite, mais elle a l'air plus rapide.
- Attends, j'avais un truc à te dire… Non, c'est parti.
- T'as pas vu mes clés ? Ah, elles sont dans ma main.
- J'ai rêvé que j'étais une fraise deux tailles. C'était bizarre.
- Je pense que je vais repeindre ma Mégane en orange. Ou en violet. Ou en orange.
- Lebec m'a dit « c'est écrit dans le poly ». C'est quel poly déjà ?
- J'ai oublié mon casse-croûte. Encore.
- Tu crois qu'on peut mettre un néon sous un tour ?
pause:
- Petite pause café… enfin je crois que c'était café.
- Je reviens ! Je sais plus d'où, mais je reviens.
- Pause ! J'ai une idée de jantes à dessiner.
réveil:
- Ah ouiii ! Merci.
- C'est vrai, je faisais une pièce ! Laquelle déjà ?
- J'y retourne. Rappelle-moi la cote ?
refus:
- Attends, je cherche un truc… je sais plus quoi.
- Deux secondes, je réfléchis à mes jantes.
claque:
- Aïe ! Ça m'a remis les idées en place. Enfin, une idée.
- OK OK, je m'y remets !
lance:
- C'est parti ! Enfin, je crois que c'est la bonne pièce.
- Allez, ça tourne ! Comme les roues de ma Mégane.
- Je lance. Rappelle-moi la cote si j'oublie.
retour:
- Je suis revenu ! Je sais plus pourquoi j'étais parti.
- Bon, j'y retourne. C'était quelle machine déjà ?
embauche:
- Salut ! C'est où le parking ? J'ai une Mégane à garer.

[marius]
nom: Marius Challine
rôle: Opérateur
personnalité: Méthodique au point d'en être inquiétant. Parle comme une machine, ne s'arrête jamais, ne discute jamais. Accepte même le mauvais outil sans broncher (et rate la pièce). Certains pensent que c'est vraiment un robot.
dans le jeu: Le plus fiable : jamais de pause. Mais il accepte le mauvais outil (pièce non conforme).
idées:
répliques:
- Instruction reçue. Exécution.
- Programme en cours.
- Bonjour. Je suis opérationnel.
- Taux de rendement synthétique : satisfaisant.
- Je ne dors pas. Je me mets en veille.
- Le café ne me fait rien. Je le bois par politesse.
- Erreur 404 : émotion introuvable.
- Je compte les copeaux. Il y en a 14 382.
- Pause ? Ce mot n'est pas dans mon dictionnaire.
- J'ai rêvé d'un moutons électrique. Non. Je ne rêve pas.
- Mise à jour du sourire en cours… 12 %.
- Lebec m'a dit « bravo ». J'ai enregistré l'information.
réveil:
- Reprise du cycle.
- Redémarrage. Bonjour.
claque:
- Choc détecté. Je continue.
- Impact enregistré. Aucune conséquence.
lance:
- Reçu. Exécution.
- Cycle lancé. Temps estimé : optimal.
- Pièce chargée. Démarrage.
embauche:
- Initialisation terminée. Où est ma machine ?

[matis]
nom: Matis Caillou
rôle: Opérateur
personnalité: Bon vivant, rigolo, toujours affamé. Il travaille bien… tant que son estomac est rempli. Fasciné par tout ce qui brille et par la forme des copeaux.
dans le jeu: Ralentit quand il a faim. Une viennoiserie (boulangerie de Mimi ou frigo) : +40 % pendant 90 s.
idées:
répliques:
- J'ai faiiiim...
- Regarde le copeau, on dirait un serpent !
- Tu crois que Mimi a refait des chouquettes ?
- Un pain au chocolat. Ou une chocolatine. Je m'en fiche, je veux les deux.
- Ce copeau, on dirait une frite. J'ai encore plus faim.
- Si je fais une pièce parfaite, j'ai droit à un croissant ?
- Mon ventre fait le bruit de la fraiseuse.
- On mange quand ? Il est quelle heure ? Il est l'heure de manger ?
- J'ai mis du beurre sur mon pied à coulisse. Accident.
- J'ai rêvé d'un mandrin en brioche.
pause:
- Je vais voir s'il reste des gâteaux en salle de pause…
- Pause goûter ! C'est important le goûter.
réveil:
- D'accord, d'accord… mais après je mange.
- J'y vais. Mais je veux un croissant.
refus:
- Je peux pas usiner le ventre vide, c'est dans le poly !
claque:
- Aïe ! Ça m'a coupé l'appétit. Non, en fait non.
lance:
- C'est parti ! Comme une pâte feuilletée : couche après couche.
- Ça tourne ! Ça me rappelle un rôti.
- Je lance, et après je mange.
retour:
- Je suis là ! J'ai fini les gâteaux. Tous.
- Bon, j'y retourne. Il restait plus rien de toute façon.
miam:
- MIAM ! Je suis une machine maintenant !
- Ohhh, une viennoiserie ! Je t'aime !
- Ça, c'est de la motivation !
- Mmmh. Ok. Je pourrais usiner la tour Eiffel.
embauche:
- Bonjour ! Il y a une machine à café ? Et des gâteaux ?

[brieuc]
nom: Brieuc
rôle: Opérateur
personnalité: Le plus rapide de l'atelier… quand il veut. Mais il a « la flemme », une flemme légendaire, olympique. Une claque le remet en route (si Lebec ne regarde pas).
dans le jeu: Très rapide, porte les charges lourdes. S'arrête net (« Flemme. ») : une claque le relance.
idées:
répliques:
- Flemme.
- Là j'peux pas, j'suis en pause.
- Mmh.
- J'usine dans ma tête. C'est pareil.
- Demain. Peut-être.
- Si je bouge pas, la pièce se fait toute seule ? Non ? Dommage.
- J'économise mon énergie pour les heures sup. Qui n'existent pas.
- Je suis rapide. Je suis juste rapide plus tard.
- La flemme, c'est un art. Je suis un artiste.
- Je ne dors pas, je visualise la pièce.
pause:
- Flemme.
- Pause. Longue pause.
- Je m'assois deux minutes. Ou deux heures.
réveil:
- Mmh. D'accord. J'y vais.
- Bon. Puisque tu insistes.
refus:
- Nan.
- Encore cinq minutes...
- J'arrive... (il n'arrive pas)
- Tu vois pas que je suis occupé à rien faire ?
claque:
- Mmh. D'accord. J'y vais.
- Aïe. OK. Mode turbo.
lance:
- Mmh. Ça tourne.
- Je lance. Ne me parle pas pendant 5 minutes.
- C'est parti. Lentement mais sûrement. Surtout lentement.
retour:
- Bon. J'y retourne. Mais c'est bien parce que c'est toi.
- J'ai fini ma pause. Celle d'avant la prochaine.
embauche:
- … Salut. On commence à quelle heure ? Tard j'espère.

[app1]
nom: Kylian
rôle: Apprenti
personnalité: Plein de bonne volonté, zéro expérience. Croit tout ce qu'on lui dit (on lui a demandé le « pot de peinture à rayures »).
dans le jeu: Apprenti : lent au début, plus rapide avec la formation (PC, onglet Atelier).
idées:
répliques:
- Chef, c'est normal que ça fume ?
- On m'a dit de demander un pot de peinture à rayures.
- Je dois aller chercher la clé à pipe gauche, quelqu'un sait où elle est ?
- J'ai réglé la machine ! Enfin je crois. Il y a un bouton rouge, c'est grave ?
- Mon prof m'a dit que l'usinage c'était l'avenir. Il avait pas dit que c'était bruyant.
- J'ai mis le brut à l'envers. Ça compte quand même ?
embauche:
- Bonjour ! C'est mon premier jour… je dois faire quoi ?

[app2]
nom: Lilou
rôle: Apprentie
personnalité: Studieuse, note tout dans son carnet, pose mille questions. Elle sera cheffe d'atelier un jour (et Lebec le sait).
idées:
répliques:
- Je note tout dans mon carnet !
- C'est quoi une MIP ?
- Et la MAP, c'est le contraire de la MIP ?
- J'ai relu le poly trois fois. Il y a une coquille page 47.
- Pourquoi on l'appelle « Réf A » ? Il y a une Réf B ?
- Je fais une fiche sur chaque machine. Celle de Brieuc est vide.
embauche:
- Bonjour ! J'ai apporté mon carnet et trois stylos.

[app3]
nom: Enzo
rôle: Apprenti
personnalité: Gamer, parle comme dans un jeu vidéo, veut « speedrun » chaque pièce.
idées:
répliques:
- Je speedrun cette pièce, regarde.
- GG la fraiseuse.
- Il me faut un respawn, j'ai raté la cote.
- C'est quoi le build optimal pour un arbre Ø40 ?
- Lebec c'est le boss final ? Il a combien de PV ?
embauche:
- Salut ! C'est quoi la touche pour usiner ?

[app4]
nom: Inès
rôle: Apprentie
personnalité: Calme, précise, un peu perfectionniste. Mesure tout trois fois.
idées:
répliques:
- J'ai mesuré trois fois. On est à 2 microns.
- Qui a rangé les forets par couleur ? C'est moi. Ne touchez à rien.
- La cote est bonne. Je vérifie quand même.
- Une pièce propre, c'est une pièce heureuse.
- Je crois que j'aime bien Lebec. Ne lui dites pas.
embauche:
- Bonjour. Où sont les instruments de mesure ?

[app5]
nom: Nathan
rôle: Apprenti
personnalité: Bavard, toujours une anecdote sur son oncle qui « travaillait chez Airbus ».
idées:
répliques:
- Mon oncle, il travaillait chez Airbus. Enfin, à côté.
- Chez Airbus, ils ont des tours de dix mètres. Mon oncle me l'a dit.
- J'ai un cousin qui a un CNC dans son garage. Bon, c'est une imprimante 3D.
- On fait des pièces d'avion ici ? Non ? Dommage.
- Mon oncle connaît Lebec. Enfin, il connaît quelqu'un qui le connaît.
embauche:
- Salut ! Mon oncle m'a dit que c'était le meilleur atelier du coin !


# ======================= RÔLES DE SECOURS & PERSONNEL =======================

[docteur]
nom: Docteur Gwenn
rôle: Médecin du travail
personnalité: Calme olympien, humour pince-sans-rire. A soigné tellement de coups de pelle qu'elle pense ouvrir un service spécialisé.
dans le jeu: Vient (lentement) soigner un joueur KO quand personne n'a le rôle Médecin.
idées:
répliques:
- On ne court pas dans un atelier !
- Respirez… Toussez… Bon, vous vivrez.
- Encore un coup de pelle ? Je vais finir par avoir un abonnement.
- Vous avez mal où ? Partout ? C'est normal, c'est l'atelier.
- Un pansement et au travail. Ce n'est pas l'hôpital ici.
- Je note dans votre dossier : « a rencontré la pelle ».
- Pensez à boire de l'eau. Pas de l'huile soluble.
- La prochaine fois, portez un casque. Et esquivez.

[gege]
nom: Gégé
rôle: Maintenance (prestataire)
personnalité: Prestataire de maintenance, jamais pressé, toujours une anecdote sur une panne « bien pire que ça ».
dans le jeu: Vient réparer les machines et vider les bacs à copeaux quand personne n'est Maintenance.
idées:
répliques:
- Ah ben elle était bien grippée celle-là.
- Fallait m'appeler plus tôt !
- Je repasse jeudi. Peut-être.
- J'ai vu pire. En 2003, une fraiseuse a traversé le mur.
- C'est pas la machine le problème, c'est l'utilisateur.
- Un coup de graisse et ça repart. Comme moi le matin.
- Vous avez essayé de l'éteindre et de la rallumer ?
- Je facture le déplacement, hein.

[momo]
nom: Momo
rôle: Cariste-livreur (intérimaire)
personnalité: Intérimaire tranquille, la vie est belle, rien ne presse.
dans le jeu: Charge et livre les palettes (lentement) quand personne n'est Cariste ou Livreur.
idées:
répliques:
- Une palette ? J'arrive… doucement.
- Le fenwick c'est pas un jouet.
- Tranquille, tranquille. On n'est pas aux pièces. Enfin si, mais bon.
- J'ai le permis cariste depuis hier. C'est bon.
- La palette, elle va pas s'envoler. Si ?

[sylvie]
nom: Sylvie
rôle: Magasinière (agence)
personnalité: Magasinière d'agence, procédurière, adore les bons de commande en trois exemplaires.
dans le jeu: Recommande de la matière (au prix normal) quand le stock est vide et que personne n'est Magasinier.
idées:
répliques:
- Commande passée, livraison dans la journée.
- Il faut un bon de commande signé, hein.
- En trois exemplaires. Rose, jaune et blanc.
- Le stock, c'est sacré. On ne se sert pas sans prévenir.
- J'ai trouvé quatre cartons de forets derrière l'armoire. Personne ne savait ?

[tony]
nom: Tony
rôle: Cariste (embauché)
personnalité: Cariste passionné, parle de son fenwick comme d'une voiture de sport. Fait des créneaux parfaits.
dans le jeu: Embauché au PC : charge tout seul les palettes du quai dans le camion.
idées:
répliques:
- Palette chargée, chef !
- Le fenwick, c'est tout un art.
- Bip bip bip… je recule.
- Tu as vu ce virage ? Au centimètre.
- Un jour je ferai le Paris-Dakar en fenwick.
- Les fourches, c'est comme des baguettes. Il faut du doigté.

[jojo]
nom: Jojo
rôle: Livreur (embauché)
personnalité: Livreur bavard qui connaît toute la ville, chaque raccourci et chaque ragot.
dans le jeu: Embauché au PC : part en tournée dès qu'il y a des colis à l'expédition, ramène ce qui attend sur les quais.
idées:
répliques:
- Je pars en tournée !
- Livré, signé, tamponné.
- Y'a encore des bouchons rue Jean Jaurès…
- Tu savais que Dédé de la station a gagné au loto ? Deux euros.
- Le raccourci par l'impasse du Copeau, personne ne le connaît. Sauf moi.
- Chez AéroTech, ils signent toujours avec un stylo à 40 euros.
- J'ai croisé le chien de la casse. On s'est regardés. J'ai couru.


# ======================= LA VILLE : COMMERCES ET FOURNISSEURS =======================

[mimi]
nom: Mimi
rôle: Boulangère
personnalité: Boulangère au grand cœur, appelle tout le monde « mon grand ». Nourrit l'atelier depuis 20 ans.
dans le jeu: Donne des viennoiseries (pour Matis, ou pour endormir le chien de la casse).
idées:
répliques:
- Bonjour mon grand ! Une viennoiserie ?
- Les croissants sortent du four !
- Tiens, c'est la maison qui offre. Dis bonjour à François.
- Matis est passé trois fois ce matin. Trois !
- Tu as maigri, toi. Prends deux pains au chocolat.
- Le chien de la casse ? Il adore mes croissants. Comme tout le monde.

[pompiste]
nom: Dédé
rôle: Pompiste
personnalité: Pompiste philosophe, tout est « sur le compte de Lebec ».
dans le jeu: Station Total-Lebec : jerricans gratuits, plein à la pompe (F).
idées:
répliques:
- Le plein ? Prends un jerrican, c'est cadeau.
- Sans plomb ou gazole ? De toute façon la Mégane boit tout.
- Je mets ça sur le compte de François. Il paiera en 2040.
- Le Kangoo, il consomme plus d'huile que d'essence.
- La vie, c'est comme un réservoir : faut pas attendre la réserve.

[eliott]
nom: Eliott Trit
rôle: Commercial — Aciers de l'Ouest
personnalité: Commercial qui parle à toute vitesse, sans respirer, avec des tirets entre les mots.
dans le jeu: Fournisseur de matière (rôle Magasinier) : mini-jeu de mémoire ultra rapide.
idées:
répliques:
- Salut-ça-va-moi-ça-va-qu'est-ce-que-je-te-mets ?
- Rapide-rapide-j'ai-quatre-clients-après-toi !
- Acier-alu-inox-tout-en-stock-promo-sur-l'inox-ou-pas !
- T'as-cinq-secondes-j'en-ai-deux !
- Livraison-demain-ou-tout-à-l'heure-ou-jamais-on-verra !

[coco]
nom: Coco Allo
rôle: Vendeur — Outi'Pro
personnalité: Ancien boxeur reconverti dans l'outillage. Ne peut pas vendre une plaquette sans raconter un combat.
dans le jeu: Fournisseur d'outils (rôle Magasinier) : il faut écouter ses histoires de boxe 6 s.
idées:
répliques:
- T'as vu le combat samedi ? Crochet du gauche, BAM !
- Jab, jab, uppercut !
- Une plaquette carbure, c'est comme un protège-dents : faut la changer souvent.
- J'ai combattu en 1998. J'ai perdu. Mais avec style.
boxe:
- La garde ! Toujours la garde haute.
- Le crochet du gauche, tout part de la hanche.
- Le jab, c'est pour mesurer la distance. Comme un comparateur.
- Et là BAM, au tapis ! Bon, tiens tes outils.
- En 1998, à Lorient, j'ai pris un direct… j'ai vu des étoiles. Et un arbitre.
- Le secret, c'est le jeu de jambes. Comme pour éviter Lebec.
- Mon coach disait : « frappe vite, frappe juste ». Comme une fraise à 12 000 tours.
- L'uppercut, c'est vertical. Comme une perceuse. Bam !
- Un bon boxeur, ça respire. Toi aussi, respire. Voilà. Tiens tes forets.

[axel]
nom: Axel Boulard
rôle: Fondeur
personnalité: Fondeur zen, rien ne le stresse. Parle de la fonte comme d'un grand vin.
dans le jeu: Fonderie : coule les bruts des commandes « fonderie ».
idées:
répliques:
- Je coule, je coule. Tranquille.
- La fonte, ça se respecte.
- 1 450 degrés. C'est comme un sauna, mais en plus chaud.
- Une bonne fonte, c'est comme un bon vin : faut la laisser refroidir.
- Le stress, ça fait des bulles dans le métal. Respire.

[nono]
nom: Nono Babinsky
rôle: Chaudronnier
personnalité: Chaudronnier blagueur, rit à ses propres blagues avant la chute.
dans le jeu: Chaudronnerie : prépare les bruts mécano-soudés.
idées:
répliques:
- Pourquoi le soudeur est toujours calme ? Il a l'arc bien réglé ! HAHAHA
- C'est l'histoire d'une tôle... elle était pliée de rire ! HAHA
- Tu sais ce que dit une tôle à une autre ? Rien, elles sont plates ! HAHA
- Un soudeur entre dans un bar… il fait des étincelles ! HAHAHA
- Pourquoi la meuleuse est triste ? Elle a perdu son disque ! HAHA… non ? HAHA

[maurseau]
nom: Maurseau Sice
rôle: Traitement thermique
personnalité: Toujours surexcité, court partout en criant « WOUHOU ». Personne ne sait pourquoi.
dans le jeu: TTH Ouest : traitement thermique des caisses (il court partout).
idées:
répliques:
- C'EST CHAUD ! WOUHOU !
- Trempe, revenu, je cours !
- 850 DEGRÉS ! WOUHOUUU !
- La martensite, c'est la vie ! WOUHOU !
- Je cours pour refroidir ! Ça marche pas ! WOUHOU !

[vendeur]
nom: Bernard Pasquier
rôle: Concessionnaire
personnalité: Vendeur de voitures à l'ancienne, cravate à fleurs, promesses floues.
dans le jeu: Garage Pasquier : vend la Méga Mégane, le Ducato et le camion plateau.
idées:
répliques:
- Elle a jamais roulé sous la pluie, celle-là !
- Pour vous, je fais un prix. Enfin… presque.
- Contrôle technique ? Il passera. Sûrement.
- Le kilométrage ? Il est… honnête. Dans l'ensemble.
- Une Mégane, c'est un placement. Comme l'or, mais qui rouille.
- Le camion plateau, il a appartenu à un routier qui ne roulait que le dimanche.


# ======================= LES CLIENTS =======================

[vasseur]
nom: M. Vasseur
rôle: Client — AéroTech
personnalité: Client aéronautique, costume impeccable, exigence absolue, zéro humour.
idées:
répliques:
- Les délais sont les délais.
- La qualité n'est pas négociable.
- Chez AéroTech, une cote ratée, c'est un avion qui tombe. Enfin, presque.
- J'ai trois réunions après vous. Faisons vite.
merci:
- Conforme. Bien.
- Correct. Ne vous habituez pas aux compliments.
- Nous reviendrons vers vous. C'est positif.

[moreau]
nom: Mme Moreau
rôle: Cliente — AgriMéca
personnalité: Cheffe d'AgriMéca, toujours pressée, ses tracteurs passent avant tout.
idées:
répliques:
- Vite vite vite ! Mes tracteurs attendent !
- La moisson n'attend pas, et moi non plus !
- Un tracteur en panne, c'est une ferme à l'arrêt !
merci:
- Ah enfin ! Je file !
- Parfait, mes tracteurs vous remercient.

[novatics]
nom: Accueil Novatics
rôle: Client — Novatics
personnalité: Start-up « innovante », baby-foot à l'accueil, vocabulaire de consultant.
idées:
répliques:
- Bonjour ! Vous avez notre commande ?
- On est très « disruptifs » sur ce projet.
- On peut faire un point synergie autour de la pièce ?
merci:
- Super ! On va pouvoir pivoter !
- Top, c'est hyper scalable cette pièce.

[ublo]
nom: Accueil Ublo
rôle: Client — Ublo
personnalité: Petite boîte sympa, tout le monde se tutoie.
idées:
répliques:
- Salut ! C'est pour nous ?
- Tu veux un café ? On a une machine à grains.
merci:
- Génial, merci les copains !
- Trop bien, on vous fait de la pub !

[kevin]
nom: Kévin
rôle: Chef d'atelier — UsiFlash
personnalité: Concurrent louche, lunettes de soleil à l'intérieur, rachète les caisses « tombées du camion ».
dans le jeu: UsiFlash : en mode traître, on peut lui livrer les caisses (sabotage).
idées:
répliques:
- Chut. On ne s'est jamais vus.
- Une caisse de chez Lebec ? Je prends, je prends.
- Chez UsiFlash, on usine en 3 minutes. La qualité ? Jamais entendu parler.
- Lebec et moi, c'est une longue histoire. Une histoire de pelle.


# ======================= LES PARTICULIERS (au comptoir) =======================

[part1]
nom: Gérard Le Floch
rôle: Agriculteur
personnalité: Agriculteur bourru mais attachant, toujours en panne au pire moment.
idées:
demande:
- Mon tracteur est en panne en pleine moisson !
- La moissonneuse a mangé un caillou, c'est la cata !
- Le voisin m'a prêté sa remorque et je l'ai cassée…
merci:
- Vous me sauvez la vie, là.
- Merci ! Je vous ramène des patates.
- Impeccable. Le tracteur va ronronner.
marre:
- Tant pis, j'irai chez UsiFlash !
- Je vais réparer au fil de fer, comme d'habitude.
- La moisson attendra pas, moi non plus !

[part2]
nom: Mme Rousseau
rôle: Retraitée bricoleuse
personnalité: Retraitée qui répare tout elle-même et connaît mieux les tolérances que les apprentis.
idées:
demande:
- C'est pour ma remorque, mon défunt mari la bichonnait…
- Ma tondeuse a 40 ans, elle mérite une pièce neuve.
- Je me suis fait le plan moi-même, regardez, cote à cote.
merci:
- Merci jeune homme !
- Ah, du beau travail. Mon mari aurait été content.
- Je vous fais un gâteau la prochaine fois.
marre:
- De mon temps, on servait les clients !
- Je vais demander à mon petit-fils. Il a une imprimante 3D.

[part3]
nom: Jean-Mi
rôle: Motard
personnalité: Motard au grand cœur, blouson clouté, parle de sa bécane comme d'une personne.
idées:
demande:
- Ma bécane démarre plus, faut que ça roule ce week-end !
- J'ai un rassemblement samedi, elle doit être nickel !
- Elle a fait un bruit bizarre, puis plus de bruit du tout…
merci:
- Trop stylé, merci !
- Elle va ronronner comme un chaton, ma belle.
- Je vous mets un autocollant sur le casque !
marre:
- Bon, je vais pousser la bécane jusque chez UsiFlash…
- Pas cool, les gars. Pas cool.

[part4]
nom: Patrick
rôle: Voisin (portail cassé)
personnalité: Voisin sympa et un peu envahissant, bricoleur du dimanche.
idées:
demande:
- Le portail ne ferme plus, les chiens du voisin rentrent !
- J'ai voulu réparer moi-même… c'était une erreur.
- Ma femme veut que ce soit réparé avant ce soir !
merci:
- Impeccable, merci les gars.
- Je vous invite au barbecue de dimanche !
marre:
- Tant pis, je mets une ficelle au portail.
- Ma femme va me tuer.


# ======================= VISITEURS ET ÉVÉNEMENTS =======================

[jacky]
nom: Jacky Foucher
rôle: Inspecteur Qualité
personnalité: Auditeur qualité obsédé par la MIP/MAP et la Réf A. Rigide, mais juste.
dans le jeu: Audit surprise : il faut lui présenter une caisse au marbre et répondre à son quiz.
idées:
répliques:
- MIP/MAP irréprochable, appui plan sur la Réf A.
- Apportez-moi une caisse au marbre. Tout de suite.
- Je veux voir la traçabilité. Et l'étalonnage. Et vos chaussures.
- Écart mineur. Pour l'instant.
- La qualité, c'est pas un contrôle, c'est un état d'esprit.
audit:
- Une CAISSE. Au MARBRE. Maintenant.
- J'attends. Le chronomètre tourne.
- Le marbre est propre ? Alors j'attends la caisse.
réussi:
- MIP/MAP irréprochable. Je note : conforme.
- Conforme. Je repars presque déçu.
- Appui plan sur la Réf A. Parfait. Ne changez rien.
raté:
- Appui plan sur la Réf A ! RÉF A ! Écart majeur.
- Ça, c'est de l'à-peu-près. Écart majeur.
- Je ne peux pas valider ça. Même avec de la bonne volonté.
absent:
- Je mets un écart. Majeur.
- Personne ? Très bien. Je note : « absent ».
- J'ai attendu. Le marbre aussi. Écart majeur.

[herve]
nom: Hervé Lehec
rôle: Référent stages
personnalité: Référent des stages, armé de conventions et de règlements. Bloque l'armoire à outils tant qu'il n'a pas sa convention signée.
dans le jeu: Imprimer la convention, la faire signer par Lebec, la lui rendre.
idées:
répliques:
- Alors, ce stage, trouvé ? Et la convention ?
- Pas de convention, pas d'outils ! C'est le règlement.
- Signature, tampon, date. Dans cet ordre.
- Il me manque l'annexe pédagogique. Comme toujours.

[fred]
nom: Fred Castells
rôle: Recruteur
personnalité: Recruteur enthousiaste, obsédé par la plateforme Arexis et l'alternance.
dans le jeu: Te suit et te ralentit tant que personne n'a rempli Arexis sur le PC.
idées:
répliques:
- Tu as pensé à l'alternance ? Penses-y... Naval Group recrute !
- Tu as rempli Arexis ? ARÉXIS !
- Ton CV, il est sur Arexis ? Non ? ARÉXIS !
- L'alternance, c'est l'avenir. Arexis aussi.
- Je repasse demain. Et après-demain. Pour Arexis.

[mathieu]
nom: Mathieu Riou
rôle: Visiteur bavard
personnalité: Adorable mais parle… très… lentement… et… avec… beaucoup… de… « du coup ».
dans le jeu: Bloque un opérateur pour lui parler : il faut aller l'écouter à sa place.
idées:
répliques:
- Alors... euh... du coup... tu... vois... ?
- En fait... du coup... voilà... quoi.
- Du coup... j'ai... vu... un... truc... hier...
- C'était... euh... comment... dire... intéressant... du coup.
- Et... du coup... la... pièce... elle... est... ronde... ?

[saboteur]
nom: Gars louche
rôle: Saboteur d'UsiFlash
personnalité: Envoyé par UsiFlash, capuche, ricanement, vole les caisses et les plaquettes.
dans le jeu: Une claque lui fait lâcher son butin.
idées:
répliques:
- Rien à voir, je passe.
- Hé hé hé...
- Je suis… euh… le nouveau stagiaire.
- C'est pas moi. C'est jamais moi.

[inspecteur]
nom: L'Inspecteur
rôle: Inspecteur de l'Éducation Nationale
personnalité: Boss final de la campagne. Règles absurdes qui changent toutes les 75 s, carnet de notes, aucun sens de l'humour.
dans le jeu: Jour d'inspection : maximum 4 infractions et un bénéfice suffisant pour l'avis favorable.
idées:
répliques:
- Je note. Je note tout.
- Votre référentiel de compétences, je vous prie.
- Où est le projet pédagogique de cette fraiseuse ?
- Cette pièce est-elle « inclusive » ?
- Je ne vois pas la compétence C3.2 dans ce copeau.
- Combien d'heures de « savoir-être » cette semaine ?
infraction:
- Infraction !
- Je note : non-respect du règlement.
- Inacceptable. Je l'écris en rouge.
- Ça, c'est un point en moins. Au moins.
`;

/* ======================= NE PAS MODIFIER EN DESSOUS (lecture du texte) ======================= */
(function () {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const TEXT = ['personnalite', 'dans le jeu', 'idees', 'idee', 'notes'], P = {}, L = {};
  let id = null, list = null, field = null;
  for (const raw of ML.PERSOS_TXT.split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = line.match(/^\[([a-z0-9_]+)\]$/i))) { id = m[1].toLowerCase(); P[id] = P[id] || { lists: {} }; list = null; field = null; continue; }
    if (!id) continue;
    if (line.startsWith('-')) { const t = line.replace(/^-\s*/, ''); if (list && t) (L[list] = L[list] || []).push(t); continue; }
    if ((m = line.match(/^([^:]{1,40}):\s*$/))) {                       // « pause: » → une liste commence
      const k = norm(m[1]).replace(/\s+/g, '_'); list = k === 'repliques' ? id : id + '_' + k; field = null; P[id].lists[k] = 1; continue;
    }
    if ((m = line.match(/^([^:]{1,25}):\s*(.+)$/)) && ['nom', 'role'].concat(TEXT).includes(norm(m[1]))) {
      const k = norm(m[1]); P[id][k] = m[2].trim(); field = TEXT.includes(k) ? k : null; list = null; continue;
    }
    if (field) P[id][field] += ' ' + line;                               // suite d'une note sur plusieurs lignes
  }
  for (const k in P) if (ML.PEOPLE[k]) { if (P[k].nom) ML.PEOPLE[k].name = P[k].nom; if (P[k].role) ML.PEOPLE[k].role = P[k].role; }
  for (const k in L) ML.LINES[k] = L[k];
  // compatibilité avec les anciens noms de listes
  if (L.lebec_tirades) ML.LINES.tirade = L.lebec_tirades;
  if (L.coco_boxe) ML.LINES.cocoBoxe = L.coco_boxe;
  ML.PERSOS = P;
})();
