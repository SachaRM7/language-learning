// js/pages/parcours-lesson.js — Leçon du Parcours en mode « messagerie »
// Karim t'écrit une phrase en arabe, tu choisis ta réponse. Les erreurs reviennent en fin de leçon.

import { store } from '../store.js';
import { navigate } from '../router.js';
import { db } from '../db.js';
import { escapeHtml, shuffle } from '../utils.js';
import { icon } from '../icons.js';
import { playWord } from '../audio.js';
import { createSRSEntry, processAnswer } from '../srs.js';
import { recordActivity } from '../activity.js';
import { progressBar, showFeedback, confetti, haptic, toast, animateCount } from '../ui.js';
import { showConfirmModal } from '../components/modal.js';
import { getParcoursState, getDuePhrases, reviewPhrasesFor, starsFor, PARCOURS_ID } from '../parcours.js';

const $app = () => document.getElementById('app');
const FRIEND = { name: 'Karim', initial: 'ك' };
const wait = ms => new Promise(r => setTimeout(r, ms));
let S = null;

// ═════════ Entrées ═════════

export async function renderParcoursLesson({ lessonId }) {
  const state = await getParcoursState();
  const module = state.modules.find(m => m.lessons.some(l => l.id === lessonId));
  const lesson = module?.lessons.find(l => l.id === lessonId);
  if (!lesson) { navigate('/parcours'); return; }
  if (!lesson.unlocked) {
    toast('Cette leçon est encore verrouillée', { icon: 'lock' });
    navigate('/parcours');
    return;
  }
  const phrases = lesson.isReview ? reviewPhrasesFor(module) : (lesson.phrases || []);
  await initSession({ mode: 'lesson', lesson, module, phrases });
  renderIntro();
}

export async function renderParcoursReview() {
  const due = await getDuePhrases();
  if (!due.length) { renderNothingDue(); return; }
  await initSession({ mode: 'review', phrases: shuffle(due).slice(0, 12) });
  renderChatShell();
  nextTurn();
}

async function initSession({ mode, lesson = null, module = null, phrases }) {
  const srsAll = await db.getSRS(PARCOURS_ID);
  const prefs = store.get('preferences') || {};
  S = {
    mode, lesson, module,
    queue: [...phrases],
    phrases: [...phrases],
    total: phrases.length,
    solved: new Set(),
    firstTry: new Map(),          // phraseId → bool
    retried: new Set(),
    srsMap: Object.fromEntries(srsAll.map(e => [e.cardId, e])),
    showTranslit: prefs.showTranslit !== false,
    autoPlay: !!prefs.autoPlay,
    turn: 0,
    alive: true,
  };
}

// ═════════ Intro ═════════

function renderIntro() {
  const { lesson, module } = S;
  const { ar, fr } = lesson.titleParts;
  $app().innerHTML = `
    <div class="pl-intro" style="--m-tint:${module.tint.tint};--m-soft:${module.tint.soft};--m-grad:${module.tint.grad}">
      <div class="pl-intro__top">
        <button class="back-btn" data-navigate="/parcours" aria-label="Fermer">${icon('x')}</button>
      </div>
      <div class="pl-intro__hero stagger">
        <div class="pl-intro__badge">${lesson.isReview ? '🔄' : module.emoji}</div>
        <div class="pl-intro__eyebrow">Module ${module.index + 1} · ${lesson.isReview ? 'Révision' : `Leçon ${lesson.index + 1}`}</div>
        ${ar ? `<div class="pl-intro__ar" lang="ar">${escapeHtml(ar)}</div>` : ''}
        <h1 class="pl-intro__title">${escapeHtml(fr)}</h1>
        <div class="pl-intro__objective card">
          <span class="pl-intro__obj-icon">${icon('target')}</span>
          <div>
            <div class="pl-intro__obj-label">Objectif</div>
            <div class="pl-intro__obj-text">${escapeHtml(lesson.objective || '')}</div>
          </div>
        </div>
        ${(lesson.concepts || []).length ? `
          <div class="pl-intro__concepts">
            ${lesson.concepts.map(c => `<span class="pl-concept" lang="ar">${escapeHtml(c)}</span>`).join('')}
          </div>` : ''}
        <div class="pl-intro__how">
          <div class="pl-intro__avatar">${FRIEND.initial}</div>
          <p><strong>${FRIEND.name}</strong> va t'écrire ${S.total} message${S.total > 1 ? 's' : ''}. Choisis la bonne réponse pour tenir la conversation&nbsp;!</p>
        </div>
      </div>
      <div class="pl-intro__cta">
        <button class="btn btn--primary btn--block btn--lg" id="pl-begin">C'est parti ${icon('arrow-right')}</button>
      </div>
    </div>`;
  document.getElementById('pl-begin').addEventListener('click', () => { haptic(); renderChatShell(); nextTurn(); });
}

// ═════════ Conversation ═════════

function renderChatShell() {
  const title = S.mode === 'review' ? 'Révision des phrases' : S.lesson.titleParts.fr;
  $app().innerHTML = `
    <div class="pl-chat">
      <div class="pl-top">
        <button class="back-btn icon-btn--ghost" id="pl-quit" aria-label="Quitter">${icon('x')}</button>
        <div class="pl-top__mid">
          ${progressBar(0)}
        </div>
        <div class="session-bar__count" id="pl-count">0/${S.total}</div>
      </div>
      <div class="pl-contact">
        <div class="pl-contact__avatar">${FRIEND.initial}<span class="pl-contact__dot"></span></div>
        <div>
          <div class="pl-contact__name">${FRIEND.name}</div>
          <div class="pl-contact__status">${escapeHtml(title)}</div>
        </div>
        <label class="pl-contact__toggle chip ${S.showTranslit ? 'is-active' : ''}" id="pl-translit-chip">
          <input type="checkbox" class="sr-only" id="pl-translit" ${S.showTranslit ? 'checked' : ''}> Abc
        </label>
      </div>
      <main class="pl-thread" id="pl-thread" aria-live="polite">
        <div class="pl-day">Aujourd'hui</div>
      </main>
      <footer class="pl-dock" id="pl-dock"></footer>
    </div>`;

  document.getElementById('pl-quit').addEventListener('click', () => {
    if (S.solved.size === 0) { exit(); return; }
    showConfirmModal('Quitter la leçon ?', 'Ta progression dans cette leçon sera perdue.', exit, null, { confirmLabel: 'Quitter', danger: true });
  });
  document.getElementById('pl-translit').addEventListener('change', e => {
    S.showTranslit = e.target.checked;
    document.getElementById('pl-translit-chip').classList.toggle('is-active', S.showTranslit);
    $app().querySelector('.pl-chat').classList.toggle('hide-translit', !S.showTranslit);
  });
  $app().querySelector('.pl-chat').classList.toggle('hide-translit', !S.showTranslit);
}

function exit() {
  S.alive = false;
  navigate(S.mode === 'review' ? '/revision' : '/parcours');
}

async function nextTurn() {
  if (!S.alive) return;
  updateProgress();
  const phrase = S.queue.shift();
  if (!phrase) { finish(); return; }
  S.turn++;
  const dock = document.getElementById('pl-dock');
  dock.innerHTML = '';

  const typing = appendHTML(`<div class="msg msg--them msg--typing"><div class="msg__avatar">${FRIEND.initial}</div><div class="msg__bubble"><span></span><span></span><span></span></div></div>`);
  await wait(650);
  if (!S.alive) return;
  typing.remove();

  const isRetry = S.retried.has(phrase.id) && S.firstTry.has(phrase.id);
  const isNew = !S.srsMap[phrase.id];
  const tag = isRetry ? '<span class="badge badge--gold">Réessayons</span>' : isNew ? '<span class="badge badge--primary">Nouveau</span>' : '<span class="badge">Révision</span>';
  const msg = appendHTML(`
    <div class="msg msg--them">
      <div class="msg__avatar">${FRIEND.initial}</div>
      <div class="msg__col">
        <div class="msg__bubble">
          <div class="msg__head">${tag}
            <button class="msg__audio" data-say="${escapeHtml(phrase.arabic)}" aria-label="Écouter">${icon('volume-2')}</button>
          </div>
          <p class="msg__ar" lang="ar">${escapeHtml(phrase.arabic)}</p>
          <p class="msg__translit">${escapeHtml(phrase.transliteration || '')}</p>
          <button class="msg__reveal" aria-label="Afficher la traduction">
            <span class="msg__reveal-text">${escapeHtml(phrase.translation)}</span>
            <span class="msg__reveal-hint">${icon('eye')} Traduction</span>
          </button>
        </div>
        ${phrase.grammar ? `<div class="msg__tip">${icon('lightbulb')}<span>${escapeHtml(phrase.grammar)}</span></div>` : ''}
      </div>
    </div>`);
  bindAudio(msg);
  msg.querySelector('.msg__reveal').addEventListener('click', e => e.currentTarget.classList.add('is-revealed'));
  if (S.autoPlay) playWord(phrase.arabic, 'ar-SA');
  scrollThread();

  renderChoices(phrase, isNew || isRetry);
}

function renderChoices(phrase, helpOn) {
  const dock = document.getElementById('pl-dock');
  const responses = shuffle(phrase.responses || []);
  dock.innerHTML = `
    <div class="pl-dock__head">
      <span>Ta réponse</span>
      <button class="pl-help ${helpOn ? 'is-on' : ''}" id="pl-help">${icon(helpOn ? 'eye' : 'eye-off')} Aide</button>
    </div>
    <div class="pl-choices ${helpOn ? 'show-fr' : ''}" id="pl-choices">
      ${responses.map((r, i) => `
        <button class="choice-btn pl-choice" data-i="${i}">
          <span class="pl-choice__ar" lang="ar">${escapeHtml(r.arabic)}</span>
          <span class="pl-choice__fr">${escapeHtml(r.translation)}</span>
        </button>`).join('')}
    </div>`;
  dock.classList.remove('is-in'); void dock.offsetWidth; dock.classList.add('is-in');

  document.getElementById('pl-help').addEventListener('click', e => {
    const on = document.getElementById('pl-choices').classList.toggle('show-fr');
    e.currentTarget.classList.toggle('is-on', on);
    e.currentTarget.innerHTML = `${icon(on ? 'eye' : 'eye-off')} Aide`;
  });
  dock.querySelectorAll('.pl-choice').forEach(btn => {
    btn.addEventListener('click', () => onAnswer(phrase, responses, Number(btn.dataset.i), btn));
  });
}

async function onAnswer(phrase, responses, i, btn) {
  const dock = document.getElementById('pl-dock');
  if (dock.dataset.locked) return;
  dock.dataset.locked = '1';
  const chosen = responses[i];
  const good = responses.find(r => r.correct) || responses[0];
  const correct = !!chosen.correct;

  dock.querySelectorAll('.pl-choice').forEach((b, j) => {
    b.disabled = true;
    if (responses[j].correct) b.classList.add('is-correct');
  });
  if (!correct) btn.classList.add('is-wrong');

  // Ma bulle
  appendHTML(`
    <div class="msg msg--me ${correct ? '' : 'msg--wrong'}">
      <div class="msg__bubble">
        <p class="msg__ar" lang="ar">${escapeHtml(chosen.arabic)}</p>
        <p class="msg__fr">${escapeHtml(chosen.translation)}</p>
      </div>
      <div class="msg__state">${icon(correct ? 'check' : 'x')}</div>
    </div>`);
  scrollThread();

  // Statistiques & SRS
  if (!S.firstTry.has(phrase.id)) S.firstTry.set(phrase.id, correct);
  const entry = S.srsMap[phrase.id] || createSRSEntry(PARCOURS_ID, phrase.id);
  S.srsMap[phrase.id] = processAnswer(entry, correct);
  db.updateSRS(PARCOURS_ID, phrase.id, S.srsMap[phrase.id]);

  if (correct) S.solved.add(phrase.id);
  else if (!S.retried.has(phrase.id)) { S.retried.add(phrase.id); S.queue.push(phrase); }
  else S.solved.add(phrase.id); // deuxième échec : on n'insiste pas davantage
  updateProgress();

  const html = correct
    ? `<span class="text-ar">${escapeHtml(good.arabic)}</span>${escapeHtml(good.translation)} · <em>${escapeHtml(phrase.translation)}</em>`
    : `Bonne réponse :<span class="text-ar">${escapeHtml(good.arabic)}</span>${escapeHtml(good.translation)}${S.retried.has(phrase.id) && !S.solved.has(phrase.id) ? ' · <em>on la revoit tout à l’heure</em>' : ''}`;
  await showFeedback({ correct, html });

  // La bonne réponse de Karim reste visible : on corrige la bulle fausse
  if (!correct) {
    appendHTML(`<div class="msg msg--me msg--fix"><div class="msg__bubble"><p class="msg__ar" lang="ar">${escapeHtml(good.arabic)}</p><p class="msg__fr">${escapeHtml(good.translation)}</p></div><div class="msg__state">${icon('check')}</div></div>`);
  }
  delete dock.dataset.locked;
  nextTurn();
}

function updateProgress() {
  const pct = S.total ? (S.solved.size / S.total) * 100 : 0;
  const fill = $app().querySelector('.pl-top .progress__fill');
  if (fill) fill.style.width = `${pct}%`;
  const count = document.getElementById('pl-count');
  if (count) count.textContent = `${S.solved.size}/${S.total}`;
}

function appendHTML(html) {
  const thread = document.getElementById('pl-thread');
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const el = tpl.content.firstElementChild;
  thread.appendChild(el);
  return el;
}

function scrollThread() {
  requestAnimationFrame(() => {
    const thread = document.getElementById('pl-thread');
    const last = thread?.lastElementChild;
    last?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
}

function bindAudio(root) {
  root.querySelectorAll('[data-say]').forEach(b => {
    b.addEventListener('click', async e => {
      e.stopPropagation();
      b.classList.add('is-playing');
      await playWord(b.dataset.say, 'ar-SA');
      b.classList.remove('is-playing');
    });
  });
}

// ═════════ Fin ═════════

async function finish() {
  const firstOk = [...S.firstTry.values()].filter(Boolean).length;
  const wrong = S.firstTry.size - firstOk;
  const score = S.total ? Math.round((firstOk / S.total) * 100) : 0;
  const course = store.get('currentCourse');

  if (S.mode === 'review') {
    await recordActivity(course?.id || 'arabic', { correct: firstOk, wrong, reviewSession: true });
    renderResult({ score, firstOk, wrong, stars: 0, xp: firstOk, next: null, unlockedModule: null });
    return;
  }

  const { lesson, module } = S;
  const prev = await db.getLessonProgress(PARCOURS_ID, lesson.id);
  const stars = Math.max(prev?.stars || 0, starsFor(score));
  await db.saveLessonProgress(PARCOURS_ID, lesson.id, {
    completed: true,
    stars,
    bestScore: Math.max(prev?.bestScore || 0, score),
    attempts: (prev?.attempts || 0) + 1,
    completedAt: Date.now(),
  });
  const firstTime = !prev?.completed;
  await recordActivity(course?.id || 'arabic', { correct: firstOk, wrong, lessons: 1, words: firstTime ? S.total : 0 });

  const after = await getParcoursState();
  const nextModule = after.modules[module.index + 1];
  const moduleJustDone = firstTime && module.lessons.filter(l => !l.done).length === 1;
  const unlockedModule = moduleJustDone && nextModule?.unlocked ? nextModule : null;
  renderResult({ score, firstOk, wrong, stars: starsFor(score), xp: firstOk + 5, next: after.current, unlockedModule });
}

function renderResult({ score, firstOk, wrong, stars, xp, next, unlockedModule }) {
  const isReview = S.mode === 'review';
  const title = score >= 90 ? 'Excellent !' : score >= 60 ? 'Leçon réussie !' : 'Bien tenté !';
  const sub = isReview ? 'Tes phrases sont révisées.' : score >= 60 ? 'Tu as tenu la conversation avec Karim.' : 'Refais-la pour gagner plus d’étoiles.';
  const emoji = score >= 90 ? '🌟' : score >= 60 ? '🎉' : '💪';
  const nextIsDifferent = next && (!S.lesson || next.id !== S.lesson.id);

  $app().innerHTML = `
    <div class="result pl-result">
      ${isReview ? `<div class="result__emoji">${emoji}</div>` : `
        <div class="pl-stars" aria-label="${stars} étoiles sur 3">
          ${[1, 2, 3].map(s => `<span class="pl-star ${s <= stars ? 'on' : ''}" style="--d:${s * 160}ms">${icon('star')}</span>`).join('')}
        </div>`}
      <h1 class="result__title">${title}</h1>
      <p class="result__subtitle">${sub}</p>
      <div class="result__stats">
        <div class="stat-tile"><div class="stat-tile__value"><span data-count="${score}">0</span>%</div><div class="stat-tile__label">Du premier coup</div></div>
        <div class="stat-tile"><div class="stat-tile__value pl-xp">+<span data-count="${xp}">0</span></div><div class="stat-tile__label">XP gagnés</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${firstOk}/${S.total}</div><div class="stat-tile__label">Phrases</div></div>
      </div>
      ${unlockedModule ? `
        <div class="pl-unlock">
          <span class="pl-unlock__emoji">${unlockedModule.emoji}</span>
          <div><strong>Module débloqué</strong><br><span>${escapeHtml(unlockedModule.title)}</span></div>
        </div>` : ''}
      <div class="pl-recap">
        <div class="pl-recap__title">Phrases ${isReview ? 'révisées' : 'de la leçon'}</div>
        ${uniquePhrases().map(p => `
          <div class="pl-recap__row">
            <button class="msg__audio" data-say="${escapeHtml(p.arabic)}" aria-label="Écouter">${icon('volume-2')}</button>
            <div class="pl-recap__text">
              <div class="pl-recap__ar" lang="ar">${escapeHtml(p.arabic)}</div>
              <div class="pl-recap__fr">${escapeHtml(p.translation)}</div>
            </div>
            <span class="pl-recap__mark ${S.firstTry.get(p.id) ? 'ok' : 'ko'}">${icon(S.firstTry.get(p.id) ? 'check' : 'rotate-ccw')}</span>
          </div>`).join('')}
      </div>
      <div class="result__actions">
        ${!isReview && nextIsDifferent ? `<button class="btn btn--primary btn--block btn--lg" data-navigate="/parcours/lecon/${escapeHtml(next.id)}">Leçon suivante ${icon('arrow-right')}</button>` : ''}
        ${!isReview && score < 90 ? `<button class="btn btn--secondary btn--block" id="pl-retry">${icon('rotate-ccw')} Refaire la leçon</button>` : ''}
        <button class="btn ${!isReview && nextIsDifferent ? 'btn--ghost' : 'btn--primary'} btn--block" data-navigate="${isReview ? '/revision' : '/parcours'}">
          ${isReview ? 'Terminer' : 'Retour au parcours'}
        </button>
      </div>
    </div>`;

  $app().querySelectorAll('[data-count]').forEach(el => animateCount(el, Number(el.dataset.count)));
  bindAudio($app());
  document.getElementById('pl-retry')?.addEventListener('click', () => renderParcoursLesson({ lessonId: S.lesson.id }));
  if (score >= 60) setTimeout(() => confetti(), 250);
  haptic([10, 60, 10]);
}

function uniquePhrases() {
  const seen = new Set();
  return S.phrases.filter(p => (seen.has(p.id) ? false : seen.add(p.id)));
}

function renderNothingDue() {
  $app().innerHTML = `
    <div class="pl-chat">
      <div class="pl-top"><button class="back-btn icon-btn--ghost" data-navigate="/parcours" aria-label="Fermer">${icon('x')}</button></div>
      <div class="empty" style="flex:1;justify-content:center">
        <div class="empty__emoji">🌿</div>
        <div class="empty__title">Rien à réviser</div>
        <p>Les phrases du parcours reviendront ici au bon moment pour bien les mémoriser.</p>
        <button class="btn btn--primary" style="margin-top:16px" data-navigate="/parcours">Continuer le parcours</button>
      </div>
    </div>`;
}

