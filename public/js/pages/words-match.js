// js/pages/words-match.js — Mode Associer : relier mots arabes et traductions, contre la montre

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { shuffle, escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';
import { showConfirmModal } from '../components/modal.js';
import { $app, resolveDeck, sessionBar, setKeyHandler, renderResult } from './words-common.js';

const PAIRS = 6;
let _state = {};

export async function renderWordsMatch(params) {
  const ctx = await resolveDeck(params);
  if (!ctx) return;
  const storedPrefs = store.get('preferences') || {};
  if (_state.timerInterval) clearInterval(_state.timerInterval);
  _state = { ...ctx, prefs: { showHarakats: storedPrefs.showHarakats !== false } };
  _renderIntro();
}

const _fmt = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
const _bestKey = () => `ha-match-best:${_state.deck.id}`;
function _getBest() { try { return parseInt(localStorage.getItem(_bestKey()), 10) || null; } catch { return null; } }
function _setBest(v) { try { localStorage.setItem(_bestKey(), String(v)); } catch { /* stockage indisponible */ } }

function _renderIntro() {
  setKeyHandler(null);
  const best = _getBest();
  const n = Math.min(PAIRS, _state.deck.cards.length);
  $app().innerHTML = `
    ${renderHeader({ title: 'Associer', close: _state.backPath })}
    <main class="page-content match-intro">
      <div class="match-intro__art" aria-hidden="true">
        <span class="match-intro__tile match-intro__tile--ar" lang="ar">قِطّ</span>
        <span class="match-intro__link">${icon('link')}</span>
        <span class="match-intro__tile">chat</span>
      </div>
      <h2>Prêt à jouer ?</h2>
      <p>Relie ${n} mots arabes à leur traduction le plus vite possible.</p>
      ${best ? `<span class="badge badge--gold">${icon('trophy')}Record : ${_fmt(best)}</span>` : ''}
      <div class="result__actions">
        <button class="btn btn--primary btn--block btn--lg" id="btn-start">${icon('play')}Commencer</button>
        <button class="btn btn--ghost btn--block" data-navigate="${escapeHtml(_state.backPath)}">Retour au deck</button>
      </div>
    </main>
  `;
  document.getElementById('btn-start')?.addEventListener('click', _startGame);
}

function _startGame() {
  if (_state.timerInterval) clearInterval(_state.timerInterval);
  const cards = shuffle([..._state.deck.cards]).slice(0, PAIRS);
  const showHarakats = _state.prefs.showHarakats;
  _state.left = shuffle(cards.map(c => ({ id: c.id, text: (!showHarakats && c.frontPlain) ? c.frontPlain : c.front, side: 'ar' })));
  _state.right = shuffle(cards.map(c => ({ id: c.id, text: c.back, side: 'fr' })));
  _state.selected = null;
  _state.matched = new Set();
  _state.mistakes = 0;
  _state.startTime = Date.now();
  _state.timerInterval = setInterval(_updateTimer, 1000);
  _renderGrid();
}

function _cell(c) {
  return `<button class="match-cell ${c.side === 'ar' ? 'match-cell--ar' : ''}" data-id="${escapeHtml(c.id)}" data-side="${c.side}" ${c.side === 'ar' ? 'lang="ar"' : ''}>${escapeHtml(c.text)}</button>`;
}

function _renderGrid() {
  const total = _state.left.length;
  $app().innerHTML = `
    ${renderHeader({ title: 'Associer', close: _state.backPath,
      extra: `<span class="match-timer" id="match-timer">${icon('clock')}<span>0:00</span></span>`,
      actions: [{ id: 'reset', icon: 'rotate-ccw', label: 'Recommencer' }] })}
    <main class="page-content match" data-words-session>
      <div id="match-bar">${sessionBar(0, total)}</div>
      <div class="match-board">
        <div class="match-col">${_state.left.map(_cell).join('')}</div>
        <div class="match-col">${_state.right.map(_cell).join('')}</div>
      </div>
      <p class="match-hint">Touche un mot, puis sa traduction.</p>
    </main>
  `;
  setKeyHandler(() => {});

  document.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
    showConfirmModal('Recommencer la partie ?', 'Le chronomètre repartira de zéro.', _startGame);
  });
  $app().querySelectorAll('.match-cell').forEach(el => el.addEventListener('click', () => _onCellClick(el)));
}

function _updateTimer() {
  const el = document.querySelector('#match-timer span');
  if (!el) { clearInterval(_state.timerInterval); return; }
  el.textContent = _fmt(Math.floor((Date.now() - _state.startTime) / 1000));
}

function _onCellClick(el) {
  if (el.classList.contains('is-matched') || el.classList.contains('is-wrong')) return;
  const prev = _state.selected;

  if (!prev) {
    _state.selected = el;
    el.classList.add('is-selected');
    haptic(5);
    return;
  }
  if (prev === el) { el.classList.remove('is-selected'); _state.selected = null; return; }
  if (prev.dataset.side === el.dataset.side) {
    prev.classList.remove('is-selected');
    el.classList.add('is-selected');
    _state.selected = el;
    return;
  }

  _state.selected = null;
  prev.classList.remove('is-selected');

  if (prev.dataset.id === el.dataset.id) {
    _state.matched.add(el.dataset.id);
    [prev, el].forEach(c => { c.classList.add('is-matched'); c.disabled = true; });
    haptic(12);
    document.getElementById('match-bar').innerHTML = sessionBar(_state.matched.size, _state.left.length);
    if (_state.matched.size === _state.left.length) {
      clearInterval(_state.timerInterval);
      const secs = Math.max(1, Math.round((Date.now() - _state.startTime) / 1000));
      setTimeout(() => _renderCompletion(secs), 500);
    }
  } else {
    _state.mistakes++;
    haptic([20, 30, 20]);
    [prev, el].forEach(c => c.classList.add('is-wrong'));
    setTimeout(() => [prev, el].forEach(c => c.classList.remove('is-wrong')), 480);
  }
}

function _renderCompletion(secs) {
  const prevBest = _getBest();
  const isRecord = !prevBest || secs < prevBest;
  if (isRecord) _setBest(secs);
  const pairs = _state.left.length;
  const accuracy = Math.round(pairs / (pairs + _state.mistakes) * 100);

  renderResult({
    backPath: _state.backPath,
    pct: null,
    emoji: isRecord ? '🏆' : '⚡',
    title: isRecord ? (prevBest ? 'Nouveau record !' : 'Premier record !') : 'Bien joué !',
    subtitle: isRecord && prevBest ? `Ancien record : ${_fmt(prevBest)}` : (prevBest ? `Record à battre : ${_fmt(prevBest)}` : ''),
    stats: [
      { value: _fmt(secs), label: 'Temps', color: 'var(--primary)' },
      { value: _state.mistakes, label: 'Erreurs', color: _state.mistakes ? 'var(--danger)' : 'var(--success)' },
      { value: `${accuracy}%`, label: 'Précision' },
    ],
    restartLabel: 'Rejouer',
    onRestart: _startGame,
    activity: { correct: pairs, wrong: _state.mistakes, words: pairs },
  });
}
