// js/pages/conv-exercise.js — Exercices d'une leçon (phrases à trous + répliques)

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { buildSpeakers } from '../components/dialogue-line.js';
import { escapeHtml, shuffle } from '../utils.js';
import { icon } from '../icons.js';
import { progressBar, showFeedback, haptic, confetti, animateCount } from '../ui.js';
import { recordActivity } from '../activity.js';
import { db } from '../db.js';
import { createSRSEntry, processAnswer } from '../srs.js';
import { playWord } from '../audio.js';

const $app = () => document.getElementById('app');
let _state = {};

export async function renderConvExercise(params) {
  const { lessonId } = params;

  let lesson = store.get('currentLesson');
  if (!lesson || lesson.id !== lessonId) {
    try {
      lesson = await fetch(`data/lessons/${lessonId}.json`).then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      });
      store.set('currentLesson', lesson);
    } catch {
      navigate(`/conversations/lecon/${lessonId}`);
      return;
    }
  }

  const exercises = _buildExercises(lesson);
  if (!exercises.length) {
    navigate(`/conversations/lecon/${lessonId}`);
    return;
  }

  _state = {
    lesson, lessonId, exercises,
    speakers: buildSpeakers(lesson),
    current: 0, correct: 0, wrong: 0,
    answered: false, recorded: false,
  };

  _renderQuestion();
}

function _buildExercises(lesson) {
  const fillBlanks = lesson.exercises?.fillBlanks || [];
  const dialogueBlanks = lesson.exercises?.dialogueBlanks || [];
  return shuffle([
    ...fillBlanks.map(e => ({ ...e, exerciseType: 'fillBlanks' })),
    ...dialogueBlanks.map(e => ({ ...e, exerciseType: 'dialogueBlanks' })),
  ]);
}

function _renderQuestion() {
  const { exercises, current } = _state;
  const total = exercises.length;
  if (current >= total) { _renderCompletion(); return; }

  const ex = exercises[current];

  $app().innerHTML = `
    ${renderHeader({ title: _state.lesson.titleFr, close: `/conversations/lecon/${_state.lessonId}` })}
    <main class="page-content conv-exercise">
      <div class="session-bar">
        ${progressBar((current / total) * 100)}
        <span class="session-bar__count">${current + 1}/${total}</span>
      </div>
      <div class="exercise-card">
        ${ex.exerciseType === 'fillBlanks' ? _renderFillBlank(ex) : _renderDialogueBlank(ex)}
      </div>
    </main>
  `;

  _state.answered = false;
  _bindAnswerEvents(ex);
}

function _blankify(sentence, filler = '') {
  const parts = escapeHtml(sentence).split(/_{3,}/);
  if (parts.length < 2) return escapeHtml(sentence);
  return parts.join(`<span class="exercise-blank ${filler ? 'is-filled' : ''}">${filler ? escapeHtml(filler) : '&nbsp;'}</span>`);
}

function _renderFillBlank(ex) {
  const shortChoices = ex.choices.every(c => c.length <= 12);
  return `
    <div class="exercise-prompt">${icon('pen')} Complète la phrase</div>
    <div class="exercise-sentence-card">
      <div class="exercise-sentence text-ar" dir="rtl" lang="ar" id="exercise-sentence">${_blankify(ex.sentenceAr)}</div>
      <div class="exercise-sentence-fr">${_blankify(ex.sentenceFr)}</div>
      ${ex.hint ? `
        <button class="exercise-hint" id="btn-hint" aria-expanded="false">
          ${icon('lightbulb')}<span class="exercise-hint__label">Indice</span>
          <span class="exercise-hint__text">${escapeHtml(ex.hint)}</span>
        </button>` : ''}
    </div>
    <div class="choice-grid ${shortChoices ? 'choice-grid--2' : ''}">
      ${ex.choices.map(c => `<button class="choice-btn choice-btn--ar" lang="ar" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
    </div>
  `;
}

function _renderDialogueBlank(ex) {
  const sp = _state.speakers[ex.contextSpeaker] || { name: ex.contextSpeaker, initial: '?', tint: { c: 'var(--primary)', s: 'var(--primary-soft)' } };
  return `
    <div class="exercise-prompt">${icon('message-circle')} Choisis la bonne réplique</div>
    <div class="exercise-chat">
      <div class="bubble-row bubble-row--start" style="--sp:${sp.tint.c};--sp-soft:${sp.tint.s}">
        <div class="bubble-row__avatar" aria-hidden="true">${escapeHtml(sp.initial)}</div>
        <div class="bubble">
          <div class="bubble__name">${escapeHtml(sp.name)}</div>
          <div class="bubble__ar text-ar" dir="rtl" lang="ar">${escapeHtml(ex.contextAr)}</div>
          <div class="bubble__fr" style="display:block">${escapeHtml(ex.contextFr)}</div>
        </div>
        <button class="bubble__play" id="btn-context-audio" aria-label="Écouter">${icon('volume-2')}</button>
      </div>
      <div class="bubble-row bubble-row--end exercise-chat__reply" id="reply-slot" style="--sp:var(--primary);--sp-soft:var(--primary-soft)">
        <div class="bubble bubble--ghost"><span class="typing"><i></i><i></i><i></i></span></div>
      </div>
    </div>
    <div class="choice-grid">
      ${ex.choices.map(c => `<button class="choice-btn choice-btn--ar" lang="ar" data-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
    </div>
  `;
}

function _correctAnswer(ex) {
  return ex.exerciseType === 'fillBlanks' ? ex.answer : ex.answerAr;
}

function _bindAnswerEvents(ex) {
  const correctAnswer = _correctAnswer(ex);

  document.getElementById('btn-hint')?.addEventListener('click', e => {
    const b = e.currentTarget;
    b.classList.add('is-open');
    b.setAttribute('aria-expanded', 'true');
  });
  document.getElementById('btn-context-audio')?.addEventListener('click', () => playWord(ex.contextAr, 'ar-SA'));

  $app().querySelectorAll('.choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_state.answered) return;
      const isCorrect = btn.dataset.value === correctAnswer;
      btn.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
      $app().querySelectorAll('.choice-btn').forEach(b => {
        if (b.dataset.value === correctAnswer) b.classList.add('is-correct');
        b.disabled = true;
      });
      _handleAnswer(ex, isCorrect, correctAnswer);
    });
  });
}

async function _handleAnswer(ex, isCorrect, correctAnswer) {
  _state.answered = true;
  if (isCorrect) _state.correct++; else _state.wrong++;
  haptic(isCorrect ? 10 : [20, 30, 20]);

  // Révéler la réponse dans la phrase ou dans la conversation
  if (ex.exerciseType === 'fillBlanks') {
    const s = document.getElementById('exercise-sentence');
    if (s) s.innerHTML = _blankify(ex.sentenceAr, correctAnswer);
  } else {
    const slot = document.getElementById('reply-slot');
    if (slot) {
      slot.innerHTML = `
        <div class="bubble bubble--me">
          <div class="bubble__ar text-ar" dir="rtl" lang="ar">${escapeHtml(correctAnswer)}</div>
          ${ex.answerFr ? `<div class="bubble__fr" style="display:block">${escapeHtml(ex.answerFr)}</div>` : ''}
        </div>`;
    }
  }

  // SRS : mettre à jour les cartes liées au vocabulaire de la leçon
  _updateLinkedSRS(isCorrect);

  const meaning = ex.answerTranslit || ex.answerFr || '';
  const answerHtml = `<span class="fb-answer"><span class="text-ar" lang="ar" dir="rtl">${escapeHtml(correctAnswer)}</span>${meaning ? `<span class="fb-answer__sub">${escapeHtml(meaning)}</span>` : ''}</span>`;
  const html = isCorrect ? answerHtml : `<span class="fb-answer__label">Bonne réponse</span>${answerHtml}`;

  const isLast = _state.current + 1 >= _state.exercises.length;
  await showFeedback({ correct: isCorrect, html, cta: isLast ? 'Voir mon score' : 'Continuer' });

  _state.current++;
  const course = store.get('currentCourse');
  if (course) {
    const prev = await db.getLessonProgress(course.id, _state.lessonId).catch(() => null);
    await db.saveLessonProgress(course.id, _state.lessonId, {
      ...(prev || {}),
      exercisesCompleted: Math.max(_state.current, prev?.exercisesCompleted && prev.exercisesTotal === _state.exercises.length ? prev.exercisesCompleted : 0),
      exercisesTotal: _state.exercises.length,
      lastAttempt: new Date().toISOString(),
    });
  }
  _renderQuestion();
}

async function _updateLinkedSRS(isCorrect) {
  const course = store.get('currentCourse');
  const vocab = _state.lesson.vocabulary || [];
  if (!course || !vocab.length) return;
  const linkedCards = vocab.flatMap(v => v.linkedCards || []);
  if (!linkedCards.length) return;
  try {
    const srsAll = await db.getSRS(course.id);
    const srsMap = Object.fromEntries(srsAll.map(e => [e.cardId, e]));
    for (const cardId of linkedCards) {
      const entry = srsMap[cardId] || createSRSEntry(course.id, cardId);
      await db.updateSRS(course.id, cardId, processAnswer(entry, isCorrect));
    }
  } catch { /* non bloquant */ }
}

async function _renderCompletion() {
  const { correct, wrong, lessonId } = _state;
  const total = correct + wrong;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const tier = pct === 100 ? { e: '🏆', t: 'Sans faute !', s: 'Tu maîtrises ce dialogue.' }
    : pct >= 80 ? { e: '🌟', t: 'Excellent !', s: 'Encore un petit effort pour le sans-faute.' }
    : pct >= 50 ? { e: '💪', t: 'Bien joué !', s: 'Réécoute le dialogue puis retente ta chance.' }
    : { e: '🌱', t: 'Continue !', s: 'Chaque essai te rapproche de la maîtrise.' };

  const course = store.get('currentCourse');
  if (course && !_state.recorded) {
    _state.recorded = true;
    recordActivity(course.id, { correct, wrong, lessons: 1 }).catch(() => {});
    db.getLessonProgress(course.id, lessonId).then(prev => db.saveLessonProgress(course.id, lessonId, {
      ...(prev || {}),
      exercisesCompleted: _state.exercises.length,
      exercisesTotal: _state.exercises.length,
      lastScore: pct,
      bestScore: Math.max(pct, prev?.bestScore || 0),
      lastAttempt: new Date().toISOString(),
    })).catch(() => {});
  }

  $app().innerHTML = `
    <main class="result conv-result">
      <div class="result__emoji">${tier.e}</div>
      <h1 class="result__title">${tier.t}</h1>
      <p class="result__subtitle">${tier.s}</p>
      <div class="conv-result__score">
        <span class="conv-result__pct"><span id="score-count">0</span>%</span>
        <span class="conv-result__label">de bonnes réponses</span>
      </div>
      <div class="result__stats">
        <div class="stat-tile"><div class="stat-tile__value" style="color:var(--success)">${correct}</div><div class="stat-tile__label">Correctes</div></div>
        <div class="stat-tile"><div class="stat-tile__value" style="color:var(--danger)">${wrong}</div><div class="stat-tile__label">Erreurs</div></div>
        <div class="stat-tile"><div class="stat-tile__value" style="color:var(--gold)">+${correct + 5}</div><div class="stat-tile__label">XP</div></div>
      </div>
      <div class="result__actions">
        <button class="btn btn--primary btn--block btn--lg" data-navigate="/conversations/lecon/${escapeHtml(lessonId)}">${icon('check')}<span>Terminer</span></button>
        <button class="btn btn--secondary btn--block" id="btn-restart">${icon('rotate-ccw')}<span>Recommencer</span></button>
      </div>
    </main>
  `;

  animateCount(document.getElementById('score-count'), pct, 900);
  if (pct >= 80) setTimeout(() => confetti(), 250);

  document.getElementById('btn-restart')?.addEventListener('click', () => {
    _state = { ..._state, current: 0, correct: 0, wrong: 0, recorded: false, exercises: _buildExercises(_state.lesson) };
    _renderQuestion();
  });
}
