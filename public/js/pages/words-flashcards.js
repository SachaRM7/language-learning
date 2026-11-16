// js/pages/words-flashcards.js — Flashcards 3D : retourner, glisser (connu / à revoir)

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { shuffle, escapeHtml } from '../utils.js';
import { db } from '../db.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';
import { renderOptionsModal, showModal, hideModal, bindModalEvents, showConfirmModal } from '../components/modal.js';
import { $app, resolveDeck, sessionBar, setKeyHandler, speak, scoreSRS, flushSRS, renderResult, resultCopy } from './words-common.js';

let _state = {};

export async function renderWordsFlashcards(params) {
  const ctx = await resolveDeck(params);
  if (!ctx) return;
  const { deck, backPath, course } = ctx;

  const [favData, srsAll] = await Promise.all([db.getFavorites(course.id), db.getSRS(course.id)]);
  const storedPrefs = store.get('preferences') || {};

  _state = {
    backPath, deck, course,
    options: { shuffle: false, frontSide: 'front', favoritesOnly: false },
    prefs: { showTranslit: storedPrefs.showTranslit !== false, showHarakats: storedPrefs.showHarakats !== false },
    favorites: new Set(favData.words),
    srsMap: Object.fromEntries(srsAll.map(e => [e.cardId, e])),
    cards: [], index: 0, known: 0, unknown: 0,
    pendingSRS: [],
    busy: false,
  };

  _initCards();
  _render();
}

function _initCards() {
  let cards = [..._state.deck.cards];
  if (_state.options.favoritesOnly) cards = cards.filter(c => _state.favorites.has(c.id));
  if (_state.options.shuffle) cards = shuffle(cards);
  _state.cards = cards;
  _state.index = 0;
  _state.known = 0;
  _state.unknown = 0;
  _state.pendingSRS = [];
}

/** Côté « arabe » = champ front de la carte. */
function _arText(card) {
  return (!_state.prefs.showHarakats && card.frontPlain) ? card.frontPlain : card.front;
}
function _frontIsAr() { return _state.options.frontSide === 'front'; }

function _faceAr(card) {
  return `
    ${card.emoji ? `<div class="fc-face__emoji">${card.emoji}</div>` : ''}
    <div class="fc-face__ar" lang="ar">${escapeHtml(_arText(card))}</div>
    ${card.translit && _state.prefs.showTranslit ? `<div class="fc-face__translit">${escapeHtml(card.translit)}</div>` : ''}`;
}
function _faceFr(card, withEmoji) {
  return `
    ${withEmoji && card.emoji ? `<div class="fc-face__emoji">${card.emoji}</div>` : ''}
    <div class="fc-face__fr">${escapeHtml(card.back)}</div>
    ${card.en ? `<div class="fc-face__en">${escapeHtml(card.en)}</div>` : ''}`;
}

function _render() {
  const { cards, index, known, unknown, deck } = _state;
  if (!cards.length) { _renderEmpty(); return; }
  if (index >= cards.length) { _renderCompletion(); return; }
  const card = cards[index];
  const next = cards[index + 1];
  const isFav = _state.favorites.has(card.id);
  const arFront = _frontIsAr();

  $app().innerHTML = `
    ${renderHeader({ title: deck.name, close: _state.backPath,
      actions: [
        { id: 'reset', icon: 'rotate-ccw', label: 'Recommencer' },
        { id: 'options', icon: 'settings', label: 'Options' },
      ] })}
    <main class="page-content fc" data-words-session>
      ${sessionBar(index, cards.length)}
      <div class="fc-tally">
        <span class="fc-tally__item fc-tally__item--ko">${icon('rotate-ccw')}<b>${unknown}</b> à revoir</span>
        <span class="fc-tally__item fc-tally__item--ok"><b>${known}</b> connus${icon('check')}</span>
      </div>

      <div class="fc-stage">
        ${next ? '<div class="fc-ghost fc-ghost--2"></div><div class="fc-ghost"></div>' : ''}
        <div class="fc-card" id="swipe-card" role="button" tabindex="0" aria-label="Retourner la carte">
          <div class="fc-inner" id="card-inner">
            <div class="fc-face fc-face--front">
              <span class="fc-stamp fc-stamp--ok">Je sais</span>
              <span class="fc-stamp fc-stamp--ko">À revoir</span>
              ${arFront ? _faceAr(card) : _faceFr(card, true)}
              <div class="fc-face__hint">${icon('rotate-cw')}Touche pour retourner</div>
            </div>
            <div class="fc-face fc-face--back">
              ${arFront ? _faceFr(card, false) : _faceAr(card)}
            </div>
          </div>
        </div>
      </div>

      <div class="fc-tools">
        <button class="icon-btn ${isFav ? 'is-active' : ''}" id="btn-fav" aria-label="Favori" aria-pressed="${isFav}">${icon('star')}</button>
        <button class="audio-btn" id="btn-audio" aria-label="Écouter">${icon('volume-2')}</button>
        <span class="fc-tools__kbd" aria-hidden="true">← → espace</span>
      </div>

      <div class="fc-controls">
        <button class="fc-btn fc-btn--ko" id="btn-unknown" aria-label="À revoir">${icon('x')}</button>
        <button class="fc-btn fc-btn--flip" id="btn-flip" aria-label="Retourner">${icon('rotate-cw')}</button>
        <button class="fc-btn fc-btn--ok" id="btn-known" aria-label="Je connais">${icon('check')}</button>
      </div>
    </main>
  `;

  _state.busy = false;
  _bindButtons();
  _bindSwipe();
}

function _renderEmpty() {
  $app().innerHTML = `
    ${renderHeader({ title: _state.deck.name, close: _state.backPath, actions: [{ id: 'options', icon: 'settings', label: 'Options' }] })}
    <main class="page-content" data-words-session>
      <div class="empty">
        <div class="empty__emoji">⭐</div>
        <div class="empty__title">Aucun favori dans ce deck</div>
        <p>Ajoute des étoiles aux cartes, ou désactive le filtre « Favoris uniquement ».</p>
      </div>
    </main>`;
  document.querySelector('[data-action="options"]')?.addEventListener('click', _openOptions);
}

function _bindButtons() {
  document.getElementById('btn-flip')?.addEventListener('click', _flip);
  document.getElementById('btn-known')?.addEventListener('click', () => _swipeCard(true));
  document.getElementById('btn-unknown')?.addEventListener('click', () => _swipeCard(false));
  document.getElementById('btn-audio')?.addEventListener('click', e => _playAudio(e.currentTarget));
  document.getElementById('btn-fav')?.addEventListener('click', _toggleFav);
  document.querySelector('[data-action="options"]')?.addEventListener('click', _openOptions);
  document.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
    showConfirmModal('Recommencer la session ?', 'Ta progression actuelle sera perdue.',
      () => { _initCards(); _render(); });
  });

  setKeyHandler(e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); _flip(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); _swipeCard(true); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); _swipeCard(false); }
  });
}

function _flip() {
  const inner = document.getElementById('card-inner');
  if (!inner) return;
  inner.classList.toggle('is-flipped');
  haptic(6);
}

function _playAudio(btn) {
  const card = _state.cards[_state.index];
  if (card) speak(btn, card.front, _state.course.config.frontLang);
}

async function _toggleFav() {
  const card = _state.cards[_state.index];
  const courseId = _state.course.id;
  if (_state.favorites.has(card.id)) _state.favorites.delete(card.id);
  else _state.favorites.add(card.id);
  const favData = await db.getFavorites(courseId);
  favData.words = [..._state.favorites];
  await db.saveFavorites(courseId, favData);
  const on = _state.favorites.has(card.id);
  const btn = document.getElementById('btn-fav');
  btn?.classList.toggle('is-active', on);
  btn?.setAttribute('aria-pressed', String(on));
  haptic(8);
}

function _swipeCard(isKnown) {
  if (_state.busy) return;
  const card = _state.cards[_state.index];
  const swipeEl = document.getElementById('swipe-card');
  if (!swipeEl || !card) return;
  _state.busy = true;

  swipeEl.style.transition = '';
  swipeEl.classList.add(isKnown ? 'fly-right' : 'fly-left');
  haptic(isKnown ? 10 : [12, 30, 12]);
  if (isKnown) _state.known++; else _state.unknown++;

  // Écriture SRS différée (fin de session)
  scoreSRS(_state, card, isKnown);

  setTimeout(() => { _state.index++; _render(); }, 280);
}

// ── Glisser (souris + tactile) ────────────────────────────────────
// Les écouteurs globaux ne sont posés qu'une fois ; ils agissent sur la carte courante.
let _drag = null;
let _globalBound = false;

function _bindSwipe() {
  const card = document.getElementById('swipe-card');
  if (!card) return;

  const start = (x, y) => { _drag = { x, y, dx: 0, moved: false }; card.style.transition = 'none'; };
  card.addEventListener('mousedown', e => start(e.clientX, e.clientY));
  card.addEventListener('touchstart', e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  card.addEventListener('click', () => { if (!_drag?.moved) _flip(); _drag = null; });

  if (_globalBound) return;
  _globalBound = true;

  const move = (x, y) => {
    if (!_drag) return;
    const el = document.getElementById('swipe-card');
    if (!el) { _drag = null; return; }
    _drag.dx = x - _drag.x;
    const dy = y - _drag.y;
    if (Math.abs(_drag.dx) > 6) _drag.moved = true;
    el.style.transform = `translate(${_drag.dx}px, ${dy * 0.15}px) rotate(${_drag.dx * 0.06}deg)`;
    const k = Math.min(1, Math.abs(_drag.dx) / 110);
    el.style.setProperty('--ok', _drag.dx > 0 ? k : 0);
    el.style.setProperty('--ko', _drag.dx < 0 ? k : 0);
  };
  const end = () => {
    if (!_drag) return;
    const el = document.getElementById('swipe-card');
    const dx = _drag.dx;
    if (el) {
      el.style.transition = '';
      el.style.removeProperty('--ok');
      el.style.removeProperty('--ko');
      if (Math.abs(dx) > 90) {
        el.style.transform = '';
        _swipeCard(dx > 0);
      } else {
        el.style.transform = '';
      }
    }
    if (!_drag.moved) return; // le click gère le retournement
    setTimeout(() => { _drag = null; }, 0);
  };

  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', end);
  window.addEventListener('touchmove', e => move(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  window.addEventListener('touchend', end, { passive: true });
}

function _openOptions() {
  showModal(renderOptionsModal({
    currentOptions: { ..._state.options, _prefs: _state.prefs },
    courseConfig: _state.course.config,
    showWrittenToggle: false,
  }));
  bindModalEvents(async ({ key, value, isPref }) => {
    if (isPref) {
      _state.prefs[key] = value;
      const updated = { ...(store.get('preferences') || {}), [key]: value };
      store.set('preferences', updated);
      await db.savePreferences(updated);
    } else {
      _state.options[key] = value;
    }
    hideModal(); _initCards(); _render();
  });
}

async function _renderCompletion() {
  await flushSRS(_state.course.id, _state.pendingSRS);
  const { known, unknown } = _state;
  const total = known + unknown;
  const pct = total ? Math.round(known / total * 100) : 0;
  const copy = resultCopy(pct);
  renderResult({
    backPath: _state.backPath,
    pct,
    emoji: copy.emoji,
    title: copy.title,
    subtitle: unknown ? `${unknown} carte${unknown > 1 ? 's' : ''} reviendr${unknown > 1 ? 'ont' : 'a'} en révision demain.` : 'Toutes les cartes sont connues !',
    stats: [
      { value: known, label: 'Connus', color: 'var(--success)' },
      { value: unknown, label: 'À revoir', color: 'var(--gold)' },
    ],
    onRestart: () => { _initCards(); _render(); },
    activity: { correct: known, wrong: unknown, words: total },
  });
}
