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
- **Connexion** : Cloudflare Access (code envoyé par e-mail) protège tout le domaine. L'app est privée,
  et le Worker revérifie le JWT d'Access avant toute opération.
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

Sans Access configuré, l'API répond 401 et l'app fonctionne en mode local (sans synchro ni IA).

## Module Coran

Mémorisation (écouter → masquer → reconstituer), murājaʿa et lecture mot à mot, **reliés au reste de l'app** :
chaque mot est rattaché à son lemme (une carte unique `q:<lemme>` dans la révision espacée, quelle que soit
la sourate) et à sa racine (page Racines, fiches de famille). Valider un verset ajoute ses mots aux révisions.

Données : `node scripts/build-quran.mjs [sourates…]` (par défaut Al-Fatiha + Juz 'Amma) → `public/data/quran/`.
Sources : texte et découpage mot à mot via l'API quran.com ; traduction Hamidullah ; racines et lemmes du
Quranic Arabic Corpus v0.4 (GNU GPL, corpus.quran.com) via mustafa0x/quran-morphology ; récitation Alafasy.

## Scripts de données

`scripts/*.py` régénèrent les decks (`public/data/decks`) et le vocabulaire des leçons.
