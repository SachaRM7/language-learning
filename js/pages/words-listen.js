// js/pages/words-listen.js — Mode Écoute : reconnaître un mot à l'oreille

import { store } from '../store.js';
import { shuffle, escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { showConfirmModal } from '../components/modal.js';
import { resolveDeck, createQuiz, renderResult, resultCopy, speak, wordRecap } from './words-common.js';

let _state = {};

export async function renderWordsListen(params) {
  const ctx = await resolveDeck(params);
  if (!ctx) return;
  _state = { ...ctx, written: false };
  _start();
}

async function _start() {
  const lang = _state.course.config.frontLang;
  const prefs = store.get('preferences') || {};
  await createQuiz({
    title: 'Écoute',
    backPath: _state.backPath,
    course: _state.course,
    deck: _state.deck,
    cards: shuffle([..._state.deck.cards]),
    prompt: () => `
      <span class="quiz__label">Qu’entends-tu ?</span>
      <div class="listen-orb">
        <span class="listen-orb__wave"></span><span class="listen-orb__wave"></span>
        <button class="listen-orb__btn" data-play aria-label="Réécouter">${icon('volume-2')}</button>
      </div>
      <button class="btn btn--ghost btn--sm listen-slow" data-slow>${icon('clock')}Plus lentement</button>`,
    answerOf: c => c.back,
    feedbackHtml: (card, ok) => `${ok ? '' : `Bonne réponse : <strong>${escapeHtml(card.back)}</strong>`}${wordRecap(card, { showTranslit: prefs.showTranslit !== false })}`,
    onMount: (card, root) => {
      const orb = root.querySelector('.listen-orb');
      const play = (rate) => {
        orb.classList.add('is-playing');
        speak(null, card.front, lang, rate).finally(() => orb.classList.remove('is-playing'));
      };
      root.querySelector('[data-play]')?.addEventListener('click', () => play());
      root.querySelector('[data-slow]')?.addEventListener('click', () => play(0.5));
      setTimeout(() => play(), 250);
    },
    getMode: () => ({ written: _state.written, level: prefs.correctionLevel || 'flexible' }),
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
        activity: { correct: s.correct, wrong: s.wrong, words: _state.deck.cards.length },
      });
    },
  });
}
