# Design system — HelloArabic v2

Direction : **« sable & encre »** — papier chaud, encre profonde, émeraude (marque) et safran (récompenses).
Mobile d'abord, clair/sombre/système, animations douces qui respectent `prefers-reduced-motion`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `css/variables.css` | Tokens : couleurs (clair + `[data-theme="dark"]`), typo, espacements, rayons, ombres, mouvement. Contient des **alias** des anciens noms (`--accent-blue`, `--bg-card`…) pour la compatibilité. |
| `css/base.css` | Reset, typo, keyframes (`fadeUp`, `popIn`, `shake`, `pulseRing`…), `.stagger`, View Transitions. |
| `css/components.css` | Boutons, cartes, lignes, badges, progression, anneaux, toggles, segmenté, QCM, bandeau de feedback, bottom sheet, toasts, écran de résultat, états vides. |
| `css/layout.css` | En-têtes (compact / grand titre), conteneurs, navigation basse flottante. |
| `js/icons.js` | Icônes SVG inline : `icon('home')`. Plus de CDN. |
| `js/ui.js` | `applyTheme`, `haptic`, `toast`, `confetti`, `ring`, `progressBar`, `animateCount`, `showFeedback`, `greeting`. |
| `js/activity.js` | Série, XP du jour, journal d'activité : `recordActivity(courseId, {correct, wrong, lessons, words, reviewSession})`. |

## Thème
`<html data-theme="light|dark">`. La préférence (`light` / `dark` / `system`) est stockée dans IndexedDB (`prefs.theme`)
et recopiée dans `localStorage['ha-theme']` pour appliquer le thème avant le premier rendu (pas de flash).

## Typographie
- UI : **Plus Jakarta Sans** (400→800)
- Arabe : **Noto Naskh Arabic** (excellente lisibilité des harakats) — `var(--font-arabic)`
- Tailles arabes dédiées : `--fs-ar-sm/md/lg/xl`

## Composants clés
- **Boutons** : `.btn` + `--primary | --gold | --tonal | --secondary | --ghost | --danger`, tailles `--sm | --lg`, `--block`.
- **Surfaces** : `.card`, `.row` (icône + texte + chevron), `.pressable` (retour tactile).
- **Exercices** : `renderHeader({ title, close })`, `.session-bar` + `progressBar()`, `.choice-btn`, puis `await showFeedback({ correct, html })`.
- **Fin de session** : `.result` + `.stat-tile`, `confetti()` si bon score, `recordActivity(...)` une seule fois.
- **En-têtes** : `renderHeader({ title, large: true, eyebrow, titleAr })` pour les onglets principaux.

## Parcours guidé
Données : `data/parcours.json` (converti depuis le projet *Apprentissage-langue-arabe*, ids de phrases stables `m1-l1:0`).
Logique : `js/parcours.js` (verrous, leçon courante, migration de l'ancienne progression `localStorage['arabicLearning']`).
Pages : `parcours-home.js` (chemin), `parcours-lesson.js` (leçon en mode messagerie + révision des phrases).
Progression : `lessonProgress` (courseId `parcours`) ; SRS des phrases : store `srs` (courseId `parcours`).
