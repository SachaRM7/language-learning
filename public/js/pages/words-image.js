// js/pages/words-image.js — Mode Images : deviner le mot à partir d'une image ou d'un emoji

import { store } from '../store.js';
import { shuffle, escapeHtml } from '../utils.js';
import { renderHeader } from '../components/header.js';
import { showConfirmModal } from '../components/modal.js';
import { $app, resolveDeck, createQuiz, renderResult, resultCopy, wordRecap } from './words-common.js';

let _state = {};

export async function renderWordsImage(params) {
  const ctx = await resolveDeck(params);
  if (!ctx) return;
  const { deck, backPath } = ctx;

  // Garder uniquement les cartes illustrées
  const validCards = deck.cards.filter(c => c.emoji || c.image);
  if (validCards.length < 2) {
    $app().innerHTML = `
      ${renderHeader({ title: 'Images', close: backPath })}
      <main class="page-content">
        <div class="empty">
          <div class="empty__emoji">🖼️</div>
          <div class="empty__title">Pas assez d’images</div>
          <p>Ce deck ne contient pas assez de cartes illustrées. Essaie un autre mode !</p>
          <button class="btn btn--secondary" data-navigate="${escapeHtml(backPath)}" style="margin-top:16px">Retour au deck</button>
        </div>
      </main>`;
    return;
  }
  _state = { ...ctx, validCards };
  _start();
}

async function _start() {
  const prefs = store.get('preferences') || {};
  await createQuiz({
    title: 'Images',
    backPath: _state.backPath,
    course: _state.course,
    deck: _state.deck,
    cards: shuffle([..._state.validCards]),
    prompt: card => `
      <span class="quiz__label">Que représente cette image ?</span>
      <div class="image-stage">
        ${card.image
          ? `<img src="${escapeHtml(card.image)}" alt="" class="image-stage__img" loading="eager">`
          : `<span class="image-stage__emoji">${card.emoji}</span>`}
      </div>`,
    answerOf: c => c.back,
    feedbackHtml: (card, ok) => `${ok ? '' : `Bonne réponse : <strong>${escapeHtml(card.back)}</strong>`}${wordRecap(card, { showTranslit: prefs.showTranslit !== false })}`,
    getMode: () => ({ written: false, level: 'flexible' }),
    actions: [{ id: 'reset', icon: 'rotate-ccw', label: 'Recommencer' }],
    onAction: (id, s) => {
      if (id === 'reset') showConfirmModal('Recommencer la session ?', 'Ta progression actuelle sera perdue.', () => s.reset());
    },
    onFinish: s => {
      const total = s.correct + s.wrong;
      const pct = total ? Math.round(s.correct / total * 100) : 0;
      renderResult({
        backPath: _state.backPath, pct, ...resultCopy(pct),
        stats: [
          { value: s.correct, label: 'Bonnes réponses', color: 'var(--success)' },
          { value: s.wrong, label: 'Erreurs', color: 'var(--danger)' },
        ],
        onRestart: _start,
        activity: { correct: s.correct, wrong: s.wrong, words: _state.validCards.length },
      });
    },
  });
}
