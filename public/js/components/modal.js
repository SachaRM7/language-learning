// js/components/modal.js — Modal d'options

import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';

export function renderOptionsModal({ currentOptions = {}, courseConfig = {}, showWrittenToggle = true }) {
  const { shuffle = false, favoritesOnly = false, frontSide = 'front', writtenMode = false, correctionLevel = 'flexible' } = currentOptions;
  const frontLabel = courseConfig.frontLabel || 'Recto';
  const backLabel = courseConfig.backLabel || 'Verso';
  const prefs = currentOptions._prefs || {};
  const showTranslit = prefs.showTranslit !== false;
  const showHarakats = prefs.showHarakats !== false;

  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <span class="modal__title">Options</span>
          <button class="modal__close" id="modal-close" aria-label="Fermer">${icon('x')}</button>
        </div>

        <div class="modal-section">
          <div class="modal-option">
            <span>Mélanger les cartes</span>
            <label class="toggle">
              <input type="checkbox" id="opt-shuffle" ${shuffle ? 'checked' : ''}>
              <span class="toggle__slider"></span>
            </label>
          </div>
          <div class="modal-option">
            <span>Favoris uniquement</span>
            <label class="toggle">
              <input type="checkbox" id="opt-favorites" ${favoritesOnly ? 'checked' : ''}>
              <span class="toggle__slider"></span>
            </label>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section__title">Recto de la carte</div>
          <div class="direction-btns">
            <button class="direction-btn ${frontSide === 'front' ? 'is-active' : ''}" data-side="front">
              ${escapeHtml(frontLabel)}
            </button>
            <button class="direction-btn ${frontSide === 'back' ? 'is-active' : ''}" data-side="back">
              ${escapeHtml(backLabel)}
            </button>
          </div>
        </div>

        ${showWrittenToggle ? `
        <div class="modal-section">
          <div class="modal-option">
            <span>Mode écrit</span>
            <label class="toggle">
              <input type="checkbox" id="opt-written" ${writtenMode ? 'checked' : ''}>
              <span class="toggle__slider"></span>
            </label>
          </div>
          ${writtenMode ? `
          <div class="correction-btns">
            ${['flexible','moderate','strict'].map(l => `
              <button class="correction-btn ${correctionLevel === l ? 'is-active' : ''}" data-level="${l}">
                ${l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            `).join('')}
          </div>` : ''}
        </div>` : ''}

        <div class="modal-section">
          <div class="modal-section__title">Affichage</div>
          <div class="modal-option">
            <span>Translittération</span>
            <label class="toggle">
              <input type="checkbox" id="opt-translit" ${showTranslit ? 'checked' : ''}>
              <span class="toggle__slider"></span>
            </label>
          </div>
          <div class="modal-option">
            <span>Harakats (voyelles)</span>
            <label class="toggle">
              <input type="checkbox" id="opt-harakats" ${showHarakats ? 'checked' : ''}>
              <span class="toggle__slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function showModal(html) {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  const overlay = document.getElementById('modal-overlay');
  const onKey = e => { if (e.key === 'Escape') { hideModal(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  overlay?.querySelector('button, input')?.focus({ preventScroll: true });
}

export function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.id = '';
  overlay.classList.add('is-closing');
  setTimeout(() => overlay.remove(), 220);
}

export function showConfirmModal(title, message, onConfirm, onCancel, { confirmLabel = 'Recommencer', danger = false } = {}) {
  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <span class="modal__title">${escapeHtml(title)}</span>
          <button class="modal__close" id="modal-close" aria-label="Fermer">${icon('x')}</button>
        </div>
        <p class="confirm-modal__message">${escapeHtml(message)}</p>
        <div class="confirm-modal__actions">
          <button class="btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}" id="confirm-ok">${escapeHtml(confirmLabel)}</button>
          <button class="btn btn--block btn--ghost" id="confirm-cancel">Annuler</button>
        </div>
      </div>
    </div>
  `);
  const cancel = () => { hideModal(); if (onCancel) onCancel(); };
  document.getElementById('confirm-ok')?.addEventListener('click', () => { hideModal(); onConfirm(); });
  document.getElementById('confirm-cancel')?.addEventListener('click', cancel);
  document.getElementById('modal-close')?.addEventListener('click', cancel);
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) cancel();
  });
}

export function bindModalEvents(onOptionChange) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.addEventListener('click', e => {
    if (e.target === overlay) hideModal();
  });

  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) closeBtn.addEventListener('click', hideModal);

  const shuffleEl = document.getElementById('opt-shuffle');
  if (shuffleEl) shuffleEl.addEventListener('change', e => onOptionChange({ key: 'shuffle', value: e.target.checked }));

  const favEl = document.getElementById('opt-favorites');
  if (favEl) favEl.addEventListener('change', e => onOptionChange({ key: 'favoritesOnly', value: e.target.checked }));

  const writtenEl = document.getElementById('opt-written');
  if (writtenEl) writtenEl.addEventListener('change', e => onOptionChange({ key: 'writtenMode', value: e.target.checked }));

  overlay.querySelectorAll('.direction-btn').forEach(btn => {
    btn.addEventListener('click', () => onOptionChange({ key: 'frontSide', value: btn.dataset.side }));
  });

  overlay.querySelectorAll('.correction-btn').forEach(btn => {
    btn.addEventListener('click', () => onOptionChange({ key: 'correctionLevel', value: btn.dataset.level }));
  });

  const translitEl = document.getElementById('opt-translit');
  if (translitEl) translitEl.addEventListener('change', e => onOptionChange({ key: 'showTranslit', value: e.target.checked, isPref: true }));

  const harakatsEl = document.getElementById('opt-harakats');
  if (harakatsEl) harakatsEl.addEventListener('change', e => onOptionChange({ key: 'showHarakats', value: e.target.checked, isPref: true }));
}
