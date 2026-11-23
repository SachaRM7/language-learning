# Données du Coran

Les 114 sourates sont conservées en JSON dans le dépôt et importées dans D1.
Le Worker embarque uniquement `index.json` (dont `lemmaCounts`, occurrences par
lemme dans chaque sourate) et `lexicon.json`. L'accueil et les decks utilisent
ces deux fichiers, sans charger le texte des sourates. Le lecteur récupère la
sourate sélectionnée par `GET /api/quran/surah?n=2`, derrière l'authentification
habituelle de l'API.

## Générer, importer et déployer

Depuis la racine, avec les accès Cloudflare configurés :

```sh
npm ci
node scripts/build-quran.mjs $(seq 1 114)
npx wrangler d1 migrations apply helloarabic --remote
node scripts/import-quran.mjs --remote
npx wrangler d1 execute helloarabic --remote --command 'SELECT count(*) AS sourates, sum(json_valid(data)) AS valid FROM quran_surah'
npm run deploy
```

Dans un environnement qui injecte le token via son proxy, préfixer les commandes
Cloudflare et le script d'import avec `CLOUDFLARE_API_TOKEN=proxy-injected CI=1`.
Pour la génération avec Node 24 derrière un proxy HTTP, utiliser
`NODE_USE_ENV_PROXY=1 node scripts/build-quran.mjs $(seq 1 114)`.

L'import produit des fichiers SQL dans `.wrangler/quran-import/`, en lots
d'environ 2 Mo et instructions de moins de 64 Ko. Chaque sourate est remplacée
intégralement dans un seul fichier ; le script s'arrête au premier échec. Il est
réexécutable. Sans argument, il génère seulement les fichiers SQL. Terminer et
vérifier l'import avant de déployer le Worker.

## Vérification locale

```sh
npx wrangler d1 migrations apply helloarabic --local
node scripts/import-quran.mjs --local
npm test
npm run dev
# Dans un autre terminal :
npx playwright install chromium
npm run test:browser
```

Pour un Chromium déjà installé, définir
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.
Le test navigateur vérifie les routes `#/coran`, `#/coran/2` et
`#/coran/112/hifz`, les requêtes réseau et le passage à l'étape Masquer.

Les gloses françaises sont demandées à l'ouverture d'une sourate. Chaque appel
Claude couvre au plus 40 versets et environ 650 mots (les versets restent
entiers). Les tests utilisent des réponses Claude simulées : ils vérifient la
fusion et l'absence de cache partiel après échec. La traduction réelle nécessite
le secret `ANTHROPIC_API_KEY`. Le cache D1 n'est écrit qu'après réception complète
des mots et lemmes de toutes les tranches ; en cas d'échec, la requête suivante
recommence la génération.

## Essai de prononciation sur Al-Fātiḥa, verset 2

Depuis l’étape Écouter du verset 2, ouvrir « Essayer la prononciation du verset » puis cocher « Vérifier ma prononciation ». Réciter tout le verset avec un arrêt sur الْعَالَمِينَ et terminer la prise. Tilawa suit les mots en direct. L’option garde au plus 30 secondes de PCM en mémoire et lance Muaalem après l’arrêt du micro. Recommencer une prise ou quitter l’exercice interrompt l’analyse.

L’export INT8 retenu contient 876 466 434 octets. Les poids et le moteur WebAssembly sont téléchargés à la première analyse et mis en cache. Le navigateur traite l’audio localement. L’export et les poids v3.2 portent la mention MIT. La comparaison avec la référence Hafs de Tilawa est propre à l’application. Le service Python de correction de Muaalem a sa propre licence QML 1.0. [Export ONNX](https://huggingface.co/Abddar/muaalem-v3-2-int8-android-onnx/tree/5d5a3510728b3d02e4a84897c311a5d404505ee9) · [Poids originaux](https://huggingface.co/obadx/muaalem-model-v3_2) · [Licence du service](https://github.com/obadx/quran-muaalem/blob/main/LICENSE)

Le décodeur lit la tête CTC des phonèmes. Le pilote cherche ح ou ه dans الْحَمْدُ et compte les unités d’allongement prédites à la fin de الْعَالَمِينَ. Ce nombre est une estimation du modèle. À l’arrêt, le pilote accepte 2, 4 et 6 temps. Si la prise ne correspond pas au verset, il s’abstient. Le bilan de prononciation ne modifie pas la progression de mémorisation.

**Vérifications effectuées.** Chromium sur ordinateur a traité l’enregistrement du verset 1:2 par Al-Afasy et reconnu ح et quatre temps au dernier madd. Sur deux extraits annotés de qdat_bench (verset 2:32), le même décodeur a produit deux et quatre unités au madd final, comme les annotations des prises `95dae92b` et `4d639a63`. Sur la seconde, il a omis la consonne finale. Ces deux essais portent sur la sortie acoustique. [Récitation utilisée](https://everyayah.com/data/Alafasy_128kbps/001002.mp3) · [qdat_bench](https://github.com/obadx/qdat_bench)

**Évaluation sur téléphone à réaliser.** Faire annoter les prises de 1:2 par un enseignant avant de lui montrer le résultat de l’application. Inclure plusieurs récitants, des substitutions ح → ه, des madd réellement écourtés et des arrêts corrects à 2, 4 et 6 temps. Noter pour chaque prise le téléphone, le navigateur, l’annotation, l’observation du modèle et les abstentions. Rapporter par cas les erreurs détectées sur les erreurs annotées, les prises correctes signalées sur l’ensemble des prises correctes, ainsi que le nombre de prises incertaines. Mesurer séparément le téléchargement initial, le délai entre arrêt et résultat avec modèle en cache, et le pic de mémoire du processus du navigateur sur le téléphone.
