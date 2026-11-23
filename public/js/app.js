// js/app.js — Bootstrap : init DB, charger store, démarrer router

import './icons.js';
import { initMotion } from './motion.js';
import { db } from './db.js';
import { applyTheme, bindHeaderScroll } from './ui.js';
import { initSync, accountReady } from './sync.js';
import { refreshLemmaFr, refreshKazimirski } from './quran.js';
import { store } from './store.js';
import { route, startRouter, navigate, getCurrentRoute } from './router.js';

// Pages « de consultation » rafraîchies quand des données arrivent d'un autre appareil
const BROWSE_ROUTES = ['/home', '/parcours', '/mots', '/conversations', '/revision', '/profil', '/coran', '/comprendre', '/tajwid'];
import { renderHome } from './pages/home.js';
import { renderWordsHome, renderWordsTheme } from './pages/words-home.js';
import { renderWordsDeck, renderWordsDeckLesson } from './pages/words-deck.js';
import { renderWordsFlashcards } from './pages/words-flashcards.js';
import { renderWordsLearn } from './pages/words-learn.js';
import { renderWordsTest } from './pages/words-test.js';
import { renderWordsMatch } from './pages/words-match.js';
import { renderWordsListen } from './pages/words-listen.js';
import { renderWordsImage } from './pages/words-image.js';
import { renderConvHome } from './pages/conv-home.js';
import { renderConvLevel } from './pages/conv-level.js';
import { renderConvLesson } from './pages/conv-lesson.js';
import { renderConvExercise } from './pages/conv-exercise.js';
import { renderReviewDashboard } from './pages/review-dashboard.js';
import { renderReviewSession } from './pages/review-session.js';
import { renderAlphabet } from './pages/alphabet.js';
import { renderRoots } from './pages/roots.js';
import { renderProfil } from './pages/profil.js';
import { renderParcoursHome } from './pages/parcours-home.js';
import { renderParcoursLesson, renderParcoursReview } from './pages/parcours-lesson.js';
import { renderTutor } from './pages/tuteur.js';
import { renderCoranHome } from './pages/coran-home.js';
import { renderCoranSurah } from './pages/coran-surah.js';
import { renderCoranHifz } from './pages/coran-hifz.js';
import { renderCoranReview } from './pages/coran-review.js';
import { renderTajwidHome } from './pages/tajwid-home.js';
import { renderTajwidLesson } from './pages/tajwid-lesson.js';
import { renderCompte, renderPassword, renderAdmin } from './pages/compte.js';
import { renderComprendre, renderComprendreSession } from './pages/comprendre.js';
import { stopAudio, unlockRecitations } from './components/quran-audio.js';
import { unlockAudio } from './audio.js';

async function init() {
  initMotion();
  // iPhone : le son doit être « débloqué » par un premier geste de l'utilisateur
  const unlock = () => { unlockAudio(); unlockRecitations(); };
  ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, capture: true }));
  await db.init();

  const prefs = await db.getPreferences();
  store.set('preferences', prefs);

  applyTheme(prefs.theme || 'system');
  bindHeaderScroll();

  const [courses, themes] = await Promise.all([
    fetch('data/courses.json').then(r => r.json()),
    fetch('data/themes.json').then(r => r.json()),
  ]);

  store.set('courses', courses);
  store.set('themes', themes);

  // Langue de l'utilisateur (détectée automatiquement) pour le TTS de la langue de traduction
  const userLang = navigator.language || 'fr-FR';

  if (prefs.lastCourse) {
    const course = courses.find(c => c.id === prefs.lastCourse);
    if (course) {
      store.set('currentCourse', { ...course, config: { ...course.config, backLang: userLang } });
    }
  } else {
    // Premier lancement : auto-sélectionner le cours arabe
    const arabicCourse = courses.find(c => c.id === 'arabic');
    if (arabicCourse) {
      store.set('currentCourse', { ...arabicCourse, config: { ...arabicCourse.config, backLang: userLang } });
      await db.savePreferences({ ...prefs, lastCourse: 'arabic' });
    }
  }

  // Phase 1 — Fondations (sélection cours en suspend : on va directement sur /home)
  route('/', () => navigate('/home'));
  route('/home', renderHome);

  // Parcours guidé (ex-projet « Apprends l'arabe »)
  route('/parcours', renderParcoursHome);
  route('/parcours/revision', renderParcoursReview);
  route('/parcours/lecon/:lessonId', renderParcoursLesson);

  // Coran : mémorisation + vocabulaire relié aux racines et à la révision
  route('/coran', renderCoranHome);
  route('/coran/muraja', renderCoranReview);
  route('/coran/:n', renderCoranSurah);
  route('/coran/:n/verset/:v', renderCoranSurah);
  route('/coran/:n/hifz', renderCoranHifz);
  route('/coran/:n/hifz/:v', renderCoranHifz);

  // Compte : connexion, inscription sur invitation, administration
  route('/compte', renderCompte);
  route('/compte/invitation/:code', renderCompte);
  route('/compte/mot-de-passe', renderPassword);
  route('/compte/admin', renderAdmin);

  // Tajwid : règles de récitation, niveau par niveau
  route('/tajwid', renderTajwidHome);
  route('/tajwid/lecon/:lessonId', renderTajwidLesson);

  // Tuteur IA (Claude, via le Worker)
  route('/tuteur', renderTutor);

  // Comprendre : lecture guidée par le moteur pédagogique
  route('/comprendre', renderComprendre);
  route('/comprendre/:passageId', renderComprendreSession);

  // Phase 2 — Mode Mots
  route('/mots', renderWordsHome);
  route('/mots/:themeId', renderWordsTheme);
  // Routes lecons (avant les routes generiques pour eviter les conflits)
  route('/mots/lecons/:lessonId', renderWordsDeckLesson);
  route('/mots/lecons/:lessonId/flash',  renderWordsFlashcards);
  route('/mots/lecons/:lessonId/learn',  renderWordsLearn);
  route('/mots/lecons/:lessonId/test',   renderWordsTest);
  route('/mots/lecons/:lessonId/match',  renderWordsMatch);
  route('/mots/lecons/:lessonId/listen', renderWordsListen);
  route('/mots/lecons/:lessonId/image',  renderWordsImage);
  route('/mots/:themeId/:deckId', renderWordsDeck);
  route('/mots/:themeId/:deckId/flash',  renderWordsFlashcards);
  route('/mots/:themeId/:deckId/learn',  renderWordsLearn);
  route('/mots/:themeId/:deckId/test',   renderWordsTest);
  route('/mots/:themeId/:deckId/match',  renderWordsMatch);
  route('/mots/:themeId/:deckId/listen', renderWordsListen);
  route('/mots/:themeId/:deckId/image',  renderWordsImage);

  // Phase 3 — Conversations
  route('/conversations', renderConvHome);
  route('/conversations/niveau/:level', renderConvLevel);
  route('/conversations/lecon/:lessonId', renderConvLesson);
  route('/conversations/lecon/:lessonId/exercice', renderConvExercise);

  // Phase 4 — Révision SRS
  route('/revision', renderReviewDashboard);
  route('/revision/session', renderReviewSession);

  // Phase 5 — Alphabet, Racines, Profil
  route('/alphabet', renderAlphabet);
  route('/racines', renderRoots);
  route('/racines/:root', renderRoots);
  route('/profil', renderProfil);

  window.addEventListener('hashchange', () => stopAudio());
  startRouter();

  // Synchronisation en arrière-plan (Cloudflare D1). Sans Worker, l'app reste 100 % locale.
  initSync();
  // Sens français du lexique coranique (mis à jour en tâche de fond côté serveur)
  accountReady.then(async () => {
    const [a, b] = await Promise.all([refreshLemmaFr(), refreshKazimirski()]);
    if (a || b) window.dispatchEvent(new CustomEvent('ha:remote-changes'));
  });
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const [a, b] = await Promise.all([refreshLemmaFr(), refreshKazimirski()]);
    if (a || b) window.dispatchEvent(new CustomEvent('ha:remote-changes'));
  }, 5 * 60e3);
  window.addEventListener('ha:remote-changes', () => {
    applyTheme(store.get('preferences')?.theme || 'system');
    const path = getCurrentRoute().path;
    if (BROWSE_ROUTES.includes(path)) {
      if (!document.querySelector('.modal-overlay, .feedback-bar')) window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => init().catch(err => {
  // Jamais d'écran vide : on montre l'erreur pour pouvoir la signaler
  console.error(err);
  const el = document.createElement('div');
  el.className = 'boot-msg';
  el.innerHTML = `<div class="boot-msg__card"><div class="boot-msg__ar" lang="ar">أ</div><h1>Démarrage impossible</h1>
    <p>${String(err?.message || err).replace(/[<>&]/g, '')}</p>
    <button class="btn btn--primary" onclick="location.reload()">Réessayer</button></div>`;
  document.body.appendChild(el);
}));

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
