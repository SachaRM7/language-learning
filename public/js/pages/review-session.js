// js/pages/review-session.js — Session de révision SRS (mots dus)

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { shuffle, escapeHtml, checkWrittenAnswer } from '../utils.js';
import { db } from '../db.js';
import { ensureAllDecks } from '../decks.js';
import { createSRSEntry, processAnswer } from '../srs.js';
import { playWord } from '../audio.js';
import { icon } from '../icons.js';
import { progressBar, showFeedback, hideFeedback, confetti, haptic } from '../ui.js';
import { recordActivity } from '../activity.js';

const $app = () => document.getElementById('app');
let _state = {};

/** Charge les decks du cours (et les decks de leçons) si besoin, puis résout les cartes dues. */
export async function loadDueCards(course, dueEntries = null) {
  const decks = await ensureAllDecks().catch(() => store.get('decks') || []);
  const lessonDecks = await db.getLessonDecks(course.id).catch(() => []);
  const cardMap = {};
  [...decks, ...lessonDecks.map(e => e.deck)].forEach(deck => {
    (deck?.cards || []).forEach(card => { cardMap[card.id] = card; });
  });
  const entries = dueEntries || await db.getDueWords(course.id);
  return entries.map(e => cardMap[e.cardId]).filter(Boolean);
}

export async function renderReviewSession() {
  const course = store.get('currentCourse');
  if (!course) { navigate('/revision'); return; }

  let cards = store.get('reviewCards');
  if (!cards || !cards.length) {
    cards = shuffle(await loadDueCards(course));
    store.set('reviewCards', cards);
  }
  if (!cards.length) { navigate('/revision'); return; }

  const [srsAll, prefs] = await Promise.all([db.getSRS(course.id), db.getPreferences()]);
  _unbindKeys();
  _state = {
    course,
    prefs,
    total: cards.length,
    queue: [...cards],
    pool: (store.get('decks') || []).flatMap(d => d.cards),
    seen: new Set(),
    retrySet: new Set(),
    correct: 0,
    wrong: 0,
    answered: false,
    srsMap: Object.fromEntries(srsAll.map(e => [e.cardId, e])),
    writtenMode: false,
    recorded: false,
    keyHandler: null,
  };
  _renderQuestion();
}

function _unbindKeys() {
  if (_state.keyHandler) document.removeEventListener('keydown', _state.keyHandler);
}

function _getChoices(card) {
  const pool = [...new Set(_state.pool.filter(c => c.id !== card.id && c.back !== card.back).map(c => c.back))];
  return shuffle([card.back, ...shuffle(pool).slice(0, 3)]);
}

function _front(card) {
  return (_state.prefs.showHarakats === false && card.frontPlain) ? card.frontPlain : card.front;
}

function _renderQuestion() {
  hideFeedback();
  const card = _state.queue[0];
  if (!card) { _renderCompletion(); return; }

  const done = _state.total - _state.queue.filter(c => !_state.retrySet.has(c.id)).length;
  const progress = (done / _state.total) * 100;
  const isRetry = _state.retrySet.has(card.id);

  const answerHTML = _state.writtenMode ? `
    <form class="written-form" id="written-form" autocomplete="off">
      <input class="written-input" id="written-input" type="text" placeholder="Écris la traduction…" enterkeyhint="done" aria-label="Ta réponse">
      <button class="btn btn--primary btn--block btn--lg" type="submit">Valider</button>
    </form>
  ` : `
    <div class="choice-grid">
      ${_getChoices(card).map((c, i) => `
        <button class="choice-btn" data-value="${escapeHtml(c)}">
          <span class="rs-key">${i + 1}</span>${escapeHtml(c)}
        </button>`).join('')}
    </div>
  `;

  $app().innerHTML = `
    ${renderHeader({
      title: 'Révision',
      close: '/revision',
      actions: [{ id: 'mode', icon: _state.writtenMode ? 'grid' : 'pen', label: _state.writtenMode ? 'Passer en QCM' : 'Passer en mode écrit' }],
    })}
    <main class="page-content rs">
      <div class="session-bar">
        ${progressBar(progress)}
        <span class="session-bar__count">${Math.min(done + 1, _state.total)}/${_state.total}</span>
      </div>

      <section class="rs-card">
        ${isRetry ? `<span class="badge badge--gold rs-card__badge">${icon('rotate-ccw')} Encore une fois</span>` : `<span class="badge rs-card__badge">Que signifie…</span>`}
        <div class="rs-card__front text-ar" dir="rtl" lang="ar">${escapeHtml(_front(card))}</div>
        ${card.translit && _state.prefs.showTranslit !== false ? `<div class="rs-card__translit">${escapeHtml(card.translit)}</div>` : ''}
        <button class="audio-btn rs-card__audio" id="btn-audio" aria-label="Écouter">${icon('volume-2')}</button>
      </section>

      ${answerHTML}
    </main>
  `;

  _state.answered = false;
  const audioBtn = document.getElementById('btn-audio');
  audioBtn?.addEventListener('click', async () => {
    audioBtn.classList.add('is-playing');
    await playWord(card.front, _state.course.config?.frontLang || 'ar-SA');
    audioBtn.classList.remove('is-playing');
  });
  document.querySelector('[data-action="mode"]')?.addEventListener('click', () => {
    if (_state.answered) return;
    _state.writtenMode = !_state.writtenMode;
    _renderQuestion();
  });

  _bindAnswerEvents(card);
  if (_state.writtenMode) document.getElementById('written-input')?.focus();
}

function _bindAnswerEvents(card) {
  const correct = card.back;

  if (_state.writtenMode) {
    document.getElementById('written-form')?.addEventListener('submit', e => {
      e.preventDefault();
      if (_state.answered) return;
      const input = document.getElementById('written-input');
      const val = (input?.value || '').trim();
      if (!val) { input?.focus(); return; }
      const ok = checkWrittenAnswer(val, correct, _state.prefs.correctionLevel || 'flexible');
      input.classList.add(ok ? 'is-correct' : 'is-wrong');
      input.disabled = true;
      _handleAnswer(ok, card);
    });
  } else {
    const buttons = [...$app().querySelectorAll('.choice-btn')];
    const pick = btn => {
      if (_state.answered) return;
      const ok = btn.dataset.value === correct;
      btn.classList.add(ok ? 'is-correct' : 'is-wrong');
      if (!ok) buttons.forEach(b => { if (b.dataset.value === correct) b.classList.add('is-correct'); });
      buttons.forEach(b => { b.disabled = true; });
      _handleAnswer(ok, card);
    };
    buttons.forEach(btn => btn.addEventListener('click', () => pick(btn)));

    _unbindKeys();
    _state.keyHandler = e => {
      if (_state.answered || e.target.tagName === 'INPUT') return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= buttons.length) { e.preventDefault(); pick(buttons[n - 1]); }
    };
    document.addEventListener('keydown', _state.keyHandler);
  }
}

async function _handleAnswer(isCorrect, card) {
  if (_state.answered) return;
  _state.answered = true;
  haptic(isCorrect ? 10 : [20, 30, 20]);

  // Score et SRS : seulement à la première rencontre de la carte dans la session
  if (!_state.seen.has(card.id)) {
    _state.seen.add(card.id);
    if (isCorrect) _state.correct++; else _state.wrong++;
    const entry = _state.srsMap[card.id] || createSRSEntry(_state.course.id, card.id);
    _state.srsMap[card.id] = processAnswer(entry, isCorrect);
    db.updateSRS(_state.course.id, card.id, _state.srsMap[card.id]);
  }
  if (isCorrect) _state.retrySet.delete(card.id); else _state.retrySet.add(card.id);

  const html = isCorrect
    ? `<span class="text-ar" lang="ar">${escapeHtml(card.front)}</span>${escapeHtml(card.back)}`
    : `Bonne réponse : <strong>${escapeHtml(card.back)}</strong><span class="text-ar" lang="ar">${escapeHtml(card.front)}</span>`;

  await showFeedback({ correct: isCorrect, html });

  const current = _state.queue.shift();
  if (current && _state.retrySet.has(current.id)) _state.queue.push(current);
  _renderQuestion();
}

async function _renderCompletion() {
  _unbindKeys();
  hideFeedback();
  const { correct, wrong } = _state;
  const total = correct + wrong;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  store.set('reviewCards', null);

  if (!_state.recorded) {
    _state.recorded = true;
    recordActivity(_state.course.id, { correct, wrong, reviewSession: true }).catch(() => {});
  }
  const remaining = await db.getDueWords(_state.course.id).catch(() => []);
  store.set('dueCount', remaining.length);

  const [emoji, title, subtitle] = pct >= 90
    ? ['🏆', 'Mémoire d\'acier !', 'Tes mots sont bien ancrés.']
    : pct >= 60
      ? ['🌟', 'Belle session !', 'Les mots ratés reviendront demain.']
      : ['💪', 'Session terminée', 'Chaque erreur renforce ta mémoire. On s\'y remet demain !'];

  $app().innerHTML = `
    ${renderHeader({ title: '', close: '/revision' })}
    <main class="result">
      <div class="result__emoji">${emoji}</div>
      <h2 class="result__title">${title}</h2>
      <p class="result__subtitle">${subtitle}</p>
      <div class="result__stats">
        <div class="stat-tile"><div class="stat-tile__value" style="color:var(--success)">${correct}</div><div class="stat-tile__label">Retenus</div></div>
        <div class="stat-tile"><div class="stat-tile__value" style="color:var(--danger)">${wrong}</div><div class="stat-tile__label">À revoir</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${pct}%</div><div class="stat-tile__label">Précision</div></div>
      </div>
      <div class="badge badge--primary rs-xp">${icon('zap')} +${correct} XP</div>
      <div class="result__actions">
        ${remaining.length ? `<button class="btn btn--tonal btn--block" id="btn-again">${icon('refresh-cw')} Continuer (${remaining.length} restant${remaining.length > 1 ? 's' : ''})</button>` : ''}
        <button class="btn btn--primary btn--block btn--lg" data-navigate="/revision">Terminer</button>
      </div>
    </main>
  `;
  if (pct >= 70) confetti();
  document.getElementById('btn-again')?.addEventListener('click', () => renderReviewSession());
}
