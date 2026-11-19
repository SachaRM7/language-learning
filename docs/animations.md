# Animations d'apprentissage

Source gratuite utilisée : [Magic UI Blur Fade](https://magicui.design/docs/components/blur-fade),
code consulté sur https://magicui.design/r/blur-fade.json, sous licence MIT
(texte conservé dans `licenses/magic-ui.txt`). Son apparition avec déplacement,
opacité et flou est adaptée en CSS natif dans `public/css/motion.css` : pas de
React, de dépendance d'animation ou de service payant ajouté. Les autres effets
complètent les animations CSS et le canvas de confettis déjà présents dans l'app.

Couverture : Flashcards (retournement et tri existants, boutons tactiles), Apprendre
et Examen (QCM et écrit), Associer (sélection puis validation des paires), Écoute
(onde pendant is-playing), Images, Révision SRS, Coran/hifz et tuteur Karim
(messages, correction, attente et micro). Le nom du tuteur est inchangé.

`recordActivity` émet `learning:reward` après sauvegarde : XP réellement gagnée,
nouvelle journée de streak, niveau selon le seuil existant de 100 XP. Les paliers
7/30/100 jours et les niveaux déclenchent une célébration courte. Aucune XP n'est
attribuée par une animation. La notification est non bloquante, annoncée via
role=status, supprimée après 3,2 s ou à la navigation. Les six modes affichent
également leur gain XP dans le bilan permanent.

Le mode mouvement réduit garde le feedback et les scores, sans compteurs animés,
confettis ou boucles décoratives. Les flammes de streak se limitent à trois cycles.

Vérification : lancer `npm run dev`, puis dans un autre terminal
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:motion`
(ou omettre la variable avec le Chromium fourni par Playwright). Le test utilise
un contexte navigateur isolé et un deck de quatre cartes, simule la voix et
l'API du tuteur, termine les six modes et la révision, vérifie une erreur écrite,
le palier 7 jours/niveau 2 et répète le parcours en mouvement réduit.
