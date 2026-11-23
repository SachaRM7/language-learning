# HelloArabic

Application personnelle pour apprendre l'arabe : parcours guidé de conversation, vocabulaire illustré,
dialogues, alphabet, racines, révision espacée et **Karim**, un tuteur IA de conversation.

## Architecture

```
public/            Frontend (PWA) — vanilla ES modules, sans étape de build
  js/              router, store, IndexedDB (db.js), synchro (sync.js), pages/
  css/             design system « sable & encre » (voir docs/DESIGN-SYSTEM.md)
  data/            vocabulaire, leçons, parcours (parcours.json)
worker/            Cloudflare Worker — API /api/*
  index.js         routeur
  auth.js          vérification du JWT Cloudflare Access
  sync.js          synchro IndexedDB ⇄ D1 (dernière écriture gagne)
  tutor.js         tuteur IA (Claude, sortie JSON structurée)
  quran.js         sens mot à mot en français (Claude, une fois par sourate, cache D1)
migrations/        schéma D1
wrangler.jsonc     configuration Cloudflare
```

- **Hébergement** : Cloudflare Workers — https://helloarabic.sacha4dev.workers.dev. Le frontend (`public/`, ~1,3 Mo) est
  embarqué dans le Worker au build (`scripts/embed-assets.mjs`) et servi avec ETag : déploiement en une commande.
- **Données** : *local-first*. Tout est dans IndexedDB et l'app marche hors-ligne ; `sync.js` envoie les
  modifications à D1 en arrière-plan et récupère celles des autres appareils.
- **Comptes** (`worker/accounts.js`, page `#/compte`) : inscription **sur invitation**, e-mail + mot de passe
  (PBKDF2-SHA256), session par cookie `HttpOnly`. Sans compte, l'app reste utilisable (progression sur l'appareil) ;
  le compte apporte la synchro et Karim. Pendant la transition, une connexion Cloudflare Access est aussi acceptée.
  Voir « Comptes » plus bas.
- **IA** : `POST /api/tutor` appelle Claude (`claude-opus-5-5`, effort `low`, repli automatique en cas de refus).
  La clé API reste un secret du Worker.

## Développement

```bash
npm install
npm run db:migrate:local    # crée la base D1 locale
npm run dev                 # http://localhost:8787 (utilisateur de dev, sans Access)
```

Pour tester le tuteur en local : créer `.dev.vars` avec `ANTHROPIC_API_KEY=...` (fichier ignoré par git).

## Déploiement

La base D1 (`helloarabic`) existe déjà et est référencée dans `wrangler.jsonc`.

1. `npm run db:migrate` (si une nouvelle migration a été ajoutée), puis `npm run deploy`.
2. Pour un nouveau compte : `npx wrangler d1 create helloarabic` et reporter le `database_id`.
3. `npx wrangler secret put ANTHROPIC_API_KEY`
4. **Cloudflare Access** (Zero Trust → Access → Applications → *Self-hosted*) :
   - domaine `helloarabic.<sous-domaine>.workers.dev` ;
   - politique *Allow* limitée à ton adresse e-mail ;
   - reporter le domaine d'équipe (`<équipe>.cloudflareaccess.com`) et l'**Application Audience (AUD) Tag**
     dans `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` de `wrangler.jsonc`, puis redéployer.

## Comptes

- **Lecture publique** : `/api/quran/surah`, `/api/quran/lemmas`, `/api/kazimirski/roots`, `GET /api/quran/fr`.
- **Avec un compte** : `/api/sync`, `/api/tutor`, `POST /api/quran/fr` (génération IA), `/api/auth/password`.
- **Administrateur** (`/api/admin/*`, page `#/compte/admin`) : créer / révoquer des invitations (lien
  `#/compte/invitation/<CODE>`), voir les comptes, générer un mot de passe provisoire (aucun e-mail n'est envoyé ;
  la personne doit le changer à la connexion suivante).
- **Premier compte** : tant qu'aucun compte n'existe, l'adresse qui possède déjà des données synchronisées
  (l'ancienne connexion Access) — ou `ADMIN_EMAIL` si défini — s'inscrit sans invitation et devient administrateur.
  Son identifiant étant l'e-mail en minuscules, elle retrouve toute sa progression.
- **Sécurité** : jetons de session stockés hachés, 365 jours glissants ; limitation des tentatives (10 par
  e-mail et 30 par IP en 15 min pour la connexion, 10 inscriptions par IP et par heure) ; requêtes d'un autre
  site refusées (`Origin`) ; cookie `SameSite=Lax`. `PASSWORD_ITERATIONS` (10 000 à 100 000, défaut 100 000)
  règle le coût du hachage ; un compte est re-haché à sa connexion suivante.
- **Appareil partagé** : les données locales appartiennent au dernier compte connecté. Un autre compte qui se
  connecte repart des données de son compte (celles du précédent restent dans le sien). Une progression faite
  sans compte rejoint le compte à la première connexion ; en cas de doublon, la version du compte l'emporte.
- **Tests** : `npm test` (hachage) et `npm run test:accounts` (parcours complet, contre `wrangler dev` sur une
  base locale ; voir l'en-tête de `tests/accounts.api.mjs`).

### Bascule depuis Cloudflare Access

1. `npm run db:migrate` (migration `0008_accounts.sql`, nouvelles tables seulement), puis `npm run deploy`.
2. Encore derrière Access, ouvrir **Profil → Créer mon mot de passe** : le compte administrateur est créé
   sur l'adresse Access, avec toute la progression.
3. Vérifier la connexion par mot de passe (navigateur privé), puis seulement **retirer l'application
   Cloudflare Access** (Zero Trust → Access → Applications). Le site devient public ; l'API protège le reste.

## Module Coran

Mémorisation (écouter → masquer → reconstituer), murājaʿa et lecture mot à mot, **reliés au reste de l'app** :
chaque mot est rattaché à son lemme (une carte unique `q:<lemme>` dans la révision espacée, quelle que soit
la sourate) et à sa racine (page Racines, fiches de famille). Valider un verset ajoute ses mots aux révisions.

Données : `node scripts/build-quran.mjs [sourates…]` (par défaut Al-Fatiha + Juz 'Amma) → `public/data/quran/`.
Sources : texte et découpage mot à mot via l'API quran.com ; traduction Hamidullah ; racines et lemmes du
Quranic Arabic Corpus v0.4 (GNU GPL, corpus.quran.com) via mustafa0x/quran-morphology ; récitation Alafasy.

### Récitation et Tajwid

- **Lecteur de sourate** (`components/quran-player.js`, inspiré de Rihla) : 12 récitateurs Quran.com avec
  minutage mot à mot (surbrillance synchronisée du mot récité), vitesses 0,5× à 2×, écoute arabe / français /
  arabe puis français, répétition de chaque verset, boucle de mémorisation (plage, passages, pause), couleurs de
  tajwid, phonétique sous chaque mot, texte masqué qui se dévoile, écran verrouillé (Media Session). La fiche
  d'un mot propose « Écouter la récitation à partir de ce mot ». Récitateur et vitesse s'appliquent aussi à la
  mémorisation et à la murājaʿa. Préférences : `preferences.quranPlayer`. Données audio et tajwid demandées
  à l'API publique Quran.com (`js/quran/recitation.js`), repli sur Alafasy sans minutage si elle est injoignable.
- **Parcours Tajwid** (`#/tajwid`, `js/tajwid.js`) : 6 niveaux, 28 leçons présentées comme le Parcours guidé
  (chemin, verrous, étoiles). Chaque leçon : explications, exemples coraniques récités par Al-Husary (Mu'allim,
  seuls les mots concernés sont joués, la règle est colorée), quiz avec questions d'écoute ; 60 % pour valider.
  Contenu : `scripts/tajwid_curriculum.py` → `python3 scripts/build-tajwid.py` → `public/data/tajwid/levels.json`
  (le script vérifie sur Quran.com que chaque règle annoncée est bien présente dans son exemple).

## Scripts de données

`scripts/*.py` régénèrent les decks (`public/data/decks`) et le vocabulaire des leçons.
