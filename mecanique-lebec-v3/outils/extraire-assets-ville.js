// =====================================================================
// extraire-assets-ville.js — extrait du gros assets-data.js de Backrooms
// uniquement les décors de ville KayKit (CC0) et leur texture, pour garder
// le jeu léger. Usage :
//   node outils/extraire-assets-ville.js chemin/vers/assets-data.js
// Produit : assets-ville.js à la racine du jeu.
// =====================================================================
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('Usage : node outils/extraire-assets-ville.js chemin/assets-data.js'); process.exit(1); }
global.window = {};
require(path.resolve(src));
const A = window.GAME_ASSETS;
const out = { models: {}, tex: { city: A.kits.city } };
for (const [k, v] of Object.entries(A.models)) if (k.startsWith('city_')) out.models[k] = v;
const dest = path.join(__dirname, '..', 'assets-ville.js');
fs.writeFileSync(dest, '// Décors de ville KayKit City Builder Bits (Kay Lousberg, licence CC0) — voir CREDITS.txt\n' +
  'window.ML_ASSETS=' + JSON.stringify(out) + ';\n');
console.log('OK :', Object.keys(out.models).length, 'modèles,', (fs.statSync(dest).size / 1024 / 1024).toFixed(2), 'Mo →', dest);
