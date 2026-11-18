# Coran & Tajwid

## Lecteur Coran (`#/coran`, `#/coran/:sourate[/:verset]`)

Inspiré du lecteur de Rihla, en JavaScript natif (sans serveur) :

- **12 récitateurs** avec minutage mot à mot (API Quran.com v4, `audio=<id>`), dont
  Al-Husary *Mu'allim* (récitation pédagogique).
- **Surbrillance synchronisée** : le mot récité est encadré, une barre suit sa progression ;
  toucher un mot relance la lecture à cet endroit.
- **Vitesses** 0,5× à 2× (bouton de la barre de lecture ou réglages).
- **Écoute** : arabe, français (lecture de Youssouf Leclerc, Al Quran Cloud) ou arabe puis français.
- **Répétition** de chaque verset (2×, 3×, 5×, 10×, ∞) et **boucle de mémorisation** sur une
  plage de versets (nombre de passages + pause entre les répétitions).
- **Affichage** : couleurs de tajwid (avec légende), translittération mot à mot, traduction
  Hamidullah, mode mémorisation (texte flouté qui se dévoile pendant la récitation),
  suivi automatique, 4 tailles de texte.
- Reprise de la dernière position, contrôles écran verrouillé (Media Session), raccourcis
  clavier (espace, flèches).

Les préférences sont stockées dans `preferences.quran` (IndexedDB). Le service worker garde
les réponses des API du Coran dans le cache `helloarabic-quran-api` (lecture hors ligne
des sourates déjà ouvertes ; l'audio reste en streaming).

Fichiers : `js/quran/` (API, préférences, balisage tajwid, lecteur d'extraits),
`js/pages/quran-home.js`, `js/pages/quran-reader.js`, `css/pages/quran.css`,
`data/quran/surahs.json`.

## Parcours Tajwid (`#/tajwid`, `#/tajwid/lecon/:id`)

6 niveaux, 28 leçons, du plus basique au plus complet :

1. **Les fondations** — tajwid, voyelles/soukoun/chadda, tanwin, madd naturel, hamzat al-waṣl
2. **Articulation et qualités** — makhārij, lettres de la gorge, emphase, rā’, lām d'Allah
3. **Nūn sākin et tanwin** — iẓhār, idghām, iqlāb, ikhfā’, ghunna
4. **Mīm sākin, qalqala et lām** — règles labiales, qalqala, lām solaire/lunaire
5. **Les prolongations** — muttaṣil, munfaṣil, ‘āriḍ, līn, lāzim, badal, ‘iwaḍ, ṣila
6. **Perfectionnement** — signes d'arrêt, waqf et ibtidā’, assimilations, cas particuliers de Ḥafṣ, examen final

Chaque leçon contient des explications, des **extraits coraniques audio** (Al-Husary Mu'allim,
seuls les mots concernés sont joués, avec surbrillance) où la règle étudiée est mise en couleur,
puis un **quiz** (dont des questions d'écoute). 70 % de bonnes réponses valident la leçon et
débloquent la suivante (`lessonProgress`, cours `tajwid`). Un lien permet de tout débloquer.

### Modifier le contenu

Le contenu se trouve dans `scripts/tajwid_curriculum.py`. Après modification :

```bash
python3 scripts/build-tajwid.py
```

Le script récupère le texte exact, la translittération et les minutages sur Quran.com, vérifie
que chaque règle annoncée est bien présente dans l'extrait, puis écrit `data/tajwid/levels.json`.
