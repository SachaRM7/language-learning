// js/pages/words-test.js — Mode Examen : configuration, questions sans seconde chance, bilan détaillé

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { shuffle, escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { showConfirmModal } from '../components/modal.js';
import { $app, resolveDeck, createQuiz, renderResult, resultCopy, hasArabic, setKeyHandler } from './words-common.js';

let _state = {};

export async function renderWordsTest(params) {
  const ctx = await resolveDeck(params);
  if (!ctx) return;
  const storedPrefs = store.get('preferences') || {};
  _state = {
    ...ctx,
    options: { count: Math.min(10, ctx.deck.cards.length), frontSide: 'front', writtenMode: false, correctionLevel: storedPrefs.correctionLevel || 'flexible' },
    prefs: { showTranslit: storedPrefs.showTranslit !== false, showHarakats: storedPrefs.showHarakats !== false },
  };
  _renderConfig();
}

const _arFront = () => _state.options.frontSide === 'front';
const _question = c => _arFront() ? ((!_state.prefs.showHarakats && c.frontPlain) ? c.frontPlain : c.front) : c.back;
const _answer = c => _arFront() ? c.back : c.front;

function _renderConfig() {
  setKeyHandler(null);
  const total = _state.deck.cards.length;
  const counts = [5, 10, 15, 20, total].filter((v, i, a) => a.indexOf(v) === i && v <= total);
  if (!counts.includes(_state.options.count)) _state.options.count = counts[counts.length - 1];
  const o = _state.options;

  $app().innerHTML = `
    ${renderHeader({ title: 'Examen', close: _state.backPath })}
    <main class="page-content test-setup">
      <div class="test-setup__hero">
        <span class="test-setup__badge">${icon('award')}</span>
        <h2>Prêt pour l’examen ?</h2>
        <p>Une seule chance par question. Ton score met à jour ta révision espacée.</p>
      </div>

      <div class="card test-setup__card">
        <div class="test-setup__label">Nombre de questions</div>
        <div class="segmented" id="seg-count">
          ${counts.map(n => `<button class="${n === o.count ? 'is-active' : ''}" data-count="${n}">${n === total && n > 20 ? `Tout · ${n}` : n}</button>`).join('')}
        </div>

        <div class="test-setup__label">Sens des questions</div>
        <div class="segmented" id="seg-side">
          <button class="${_arFront() ? 'is-active' : ''}" data-side="front">Arabe → Français</button>
          <button class="${!_arFront() ? 'is-active' : ''}" data-side="back">Français → Arabe</button>
        </div>

        <label class="modal-option test-setup__toggle">
          <span>
            <span class="test-setup__opt">Mode écrit</span>
            <span class="test-setup__hint">Tape la réponse au lieu de choisir</span>
          </span>
          <span class="toggle"><input type="checkbox" id="opt-written" ${o.writtenMode ? 'checked' : ''}><span class="toggle__slider"></span></span>
        </label>
      </div>

      <button class="btn btn--primary btn--block btn--lg" id="btn-start">${icon('play')}Commencer</button>
    </main>
  `;

  const seg = (id, fn) => $app().querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
    $app().querySelectorAll(`#${id} button`).forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    fn(b);
  }));
  seg('seg-count', b => { o.count = parseInt(b.dataset.count, 10); });
  seg('seg-side', b => { o.frontSide = b.dataset.side; });
  document.getElementById('opt-written')?.addEventListener('change', e => { o.writtenMode = e.target.checked; });
  document.getElementById('btn-start')?.addEventListener('click', _startTest);
}

async function _startTest() {
  const cards = shuffle([..._state.deck.cards]).slice(0, _state.options.count);
  await createQuiz({
    title: 'Examen',
    backPath: _state.backPath,
    course: _state.course,
    deck: _state.deck,
    cards,
    retry: false,
    prompt: card => {
      const q = _question(card);
      const ar = hasArabic(q);
      return `
        <span class="quiz__label">${_arFront() ? 'Que signifie…' : 'Comment dit-on…'}</span>
        <div class="quiz__text ${ar ? 'quiz__text--ar' : ''}" ${ar ? 'lang="ar"' : ''}>${escapeHtml(q)}</div>
        ${ar && card.translit && _state.prefs.showTranslit ? `<div class="quiz__translit">${escapeHtml(card.translit)}</div>` : ''}`;
    },
    answerOf: _answer,
    getMode: () => ({ written: _state.options.writtenMode, level: _state.options.correctionLevel }),
    actions: [{ id: 'reset', icon: 'rotate-ccw', label: 'Recommencer' }],
    onAction: id => {
      if (id === 'reset') showConfirmModal('Recommencer l’examen ?', 'Ta progression actuelle sera perdue.', _renderConfig);
    },
    onFinish: s => _renderResults(s),
  });
}

function _renderResults(s) {
  const total = s.results.length;
  const correct = s.results.filter(r => r.isCorrect).length;
  const pct = total ? Math.round(correct / total * 100) : 0;
  const copy = resultCopy(pct);
  const list = `
    <details class="test-review" ${pct < 100 ? 'open' : ''}>
      <summary>${icon('chevron-down')}Détail des réponses</summary>
      <ul class="test-review__list">
        ${s.results.map(r => `
          <li class="test-review__item test-review__item--${r.isCorrect ? 'ok' : 'ko'}">
            <span class="test-review__icon">${icon(r.isCorrect ? 'check' : 'x')}</span>
            <span class="test-review__fr">${escapeHtml(r.card.back)}</span>
            <span class="test-review__ar" lang="ar">${escapeHtml(r.card.front)}</span>
          </li>`).join('')}
      </ul>
    </details>`;

  renderResult({
    backPath: _state.backPath,
    pct,
    emoji: copy.emoji,
    title: copy.title,
    subtitle: `${correct} bonne${correct > 1 ? 's' : ''} réponse${correct > 1 ? 's' : ''} sur ${total}`,
    stats: [
      { value: correct, label: 'Réussies', color: 'var(--success)' },
      { value: total - correct, label: 'Ratées', color: 'var(--danger)' },
    ],
    extraHtml: list,
    restartLabel: 'Nouvel examen',
    onRestart: _renderConfig,
    activity: { correct, wrong: total - correct, words: total },
  });
}
