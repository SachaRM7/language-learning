// js/pages/words-learn.js — Mode Apprendre (QCM ou réponse écrite, avec répétition des erreurs)

import { store } from '../store.js';
import { shuffle, escapeHtml } from '../utils.js';
import { db } from '../db.js';
import { icon } from '../icons.js';
import { renderOptionsModal, showModal, hideModal, bindModalEvents, showConfirmModal } from '../components/modal.js';
import { resolveDeck, createQuiz, renderResult, resultCopy, speak, wordRecap, hasArabic } from './words-common.js';

let _state = {};

export async function renderWordsLearn(params) {
  const ctx = await resolveDeck(params);
  if (!ctx) return;
  const storedPrefs = store.get('preferences') || {};
  _state = {
    ...ctx,
    options: { shuffle: true, frontSide: 'front', writtenMode: false, correctionLevel: storedPrefs.correctionLevel || 'flexible' },
    prefs: { showTranslit: storedPrefs.showTranslit !== false, showHarakats: storedPrefs.showHarakats !== false },
  };
  _start();
}

const _arFront = () => _state.options.frontSide === 'front';
const _question = c => _arFront() ? ((!_state.prefs.showHarakats && c.frontPlain) ? c.frontPlain : c.front) : c.back;
const _answer = c => _arFront() ? c.back : c.front;

async function _start() {
  const cards = _state.options.shuffle ? shuffle([..._state.deck.cards]) : [..._state.deck.cards];
  _state.session = await createQuiz({
    title: _state.deck.name,
    backPath: _state.backPath,
    course: _state.course,
    deck: _state.deck,
    cards,
    prompt: card => {
      const q = _question(card);
      const ar = hasArabic(q);
      return `
        <span class="quiz__label">${_arFront() ? 'Que signifie…' : 'Comment dit-on…'}</span>
        ${card.emoji ? `<span class="quiz__emoji">${card.emoji}</span>` : ''}
        <div class="quiz__text ${ar ? 'quiz__text--ar' : ''}" ${ar ? 'lang="ar"' : ''}>${escapeHtml(q)}</div>
        ${ar && card.translit && _state.prefs.showTranslit ? `<div class="quiz__translit">${escapeHtml(card.translit)}</div>` : ''}
        ${_arFront() ? `<button class="audio-btn quiz__audio" data-say aria-label="Écouter">${icon('volume-2')}</button>` : ''}`;
    },
    answerOf: _answer,
    feedbackHtml: (card, ok, answer) => ok
      ? wordRecap(card, { showTranslit: _state.prefs.showTranslit })
      : `Bonne réponse : <strong class="${hasArabic(answer) ? 'text-ar' : ''}">${escapeHtml(answer)}</strong>${_arFront() ? '' : wordRecap(card)}`,
    onMount: (card, root) => {
      const btn = root.querySelector('[data-say]');
      btn?.addEventListener('click', () => speak(btn, card.front, _state.course.config.frontLang));
    },
    getMode: () => ({ written: _state.options.writtenMode, level: _state.options.correctionLevel }),
    actions: [
      { id: 'reset', icon: 'rotate-ccw', label: 'Recommencer' },
      { id: 'options', icon: 'settings', label: 'Options' },
    ],
    onAction: (id, s) => {
      if (id === 'options') _openOptions();
      if (id === 'reset') showConfirmModal('Recommencer la session ?', 'Ta progression actuelle sera perdue.', () => s.reset());
    },
    onFinish: s => {
      const total = s.correct + s.wrong;
      const pct = total ? Math.round(s.correct / total * 100) : 0;
      const copy = resultCopy(pct);
      renderResult({
        backPath: _state.backPath, pct, ...copy,
        stats: [
          { value: s.correct, label: 'Bonnes réponses', color: 'var(--success)' },
          { value: s.wrong, label: 'Erreurs', color: 'var(--danger)' },
          { value: _state.deck.cards.length, label: 'Mots' },
        ],
        onRestart: _start,
        activity: { correct: s.correct, wrong: s.wrong, words: _state.deck.cards.length },
      });
    },
  });
}

function _openOptions() {
  showModal(renderOptionsModal({ currentOptions: { ..._state.options, _prefs: _state.prefs }, courseConfig: _state.course.config }));
  bindModalEvents(async ({ key, value, isPref }) => {
    if (isPref) {
      _state.prefs[key] = value;
      const updated = { ...(store.get('preferences') || {}), [key]: value };
      store.set('preferences', updated);
      await db.savePreferences(updated);
    } else {
      _state.options[key] = value;
    }
    hideModal();
    // Le choix du niveau de correction n'a d'effet visible qu'en mode écrit : on rouvre la feuille pour l'afficher
    if (key === 'writtenMode' && value) { setTimeout(_openOptions, 240); }
    _start();
  });
}
