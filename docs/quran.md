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
