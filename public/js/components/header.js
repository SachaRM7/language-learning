// js/components/header.js — En-tête réutilisable (compact ou « grand titre »)

import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string|null} [o.back]      route de retour (affiche un bouton ←)
 * @param {Array<{id:string, icon:string, label?:string}>} [o.actions]
 * @param {boolean} [o.large]         grand titre (onglets principaux)
 * @param {string} [o.eyebrow]        petit libellé au-dessus du titre (mode large)
 * @param {string} [o.titleAr]        titre arabe affiché à côté (mode large)
 * @param {string} [o.close]          route de fermeture (affiche ✕ au lieu de ←)
 * @param {string} [o.extra]          HTML libre inséré avant les actions
 */
export function renderHeader({ title, back = null, actions = [], large = false, eyebrow = '', titleAr = '', close = null, extra = '' }) {
  const nav = close
    ? `<button class="back-btn" data-navigate="${escapeHtml(close)}" aria-label="Fermer">${icon('x')}</button>`
    : back
      ? `<button class="back-btn" data-navigate="${escapeHtml(back)}" aria-label="Retour">${icon('arrow-left')}</button>`
      : '';

  return `
    <header class="page-header ${large ? 'page-header--large' : ''}">
      ${nav}
      <h1 class="page-header__title">
        ${eyebrow ? `<span class="page-header__eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
        ${escapeHtml(title)}${titleAr ? `<span class="page-header__ar" lang="ar">${escapeHtml(titleAr)}</span>` : ''}
      </h1>
      <div class="page-header__actions">
        ${extra}
        ${actions.map(a => `
          <button class="icon-btn" data-action="${escapeHtml(a.id)}" aria-label="${escapeHtml(a.label || '')}">
            ${icon(a.icon)}
          </button>
        `).join('')}
      </div>
    </header>
  `;
}
