// js/components/bottom-nav.js — Navigation principale (pilule flottante)

import { icon } from '../icons.js';
import { store } from '../store.js';

const NAV_ITEMS = [
  { id: 'home',          path: '/home',          icon: 'home',       label: 'Accueil' },
  { id: 'parcours',      path: '/parcours',      icon: 'route',      label: 'Parcours' },
  { id: 'mots',          path: '/mots',          icon: 'layers',     label: 'Mots' },
  { id: 'coran',         path: '/coran',         icon: 'book-open',  label: 'Coran' },
  { id: 'revision',      path: '/revision',      icon: 'refresh-cw', label: 'Révision' },
];

/**
 * @param {string} activeId - 'home'|'parcours'|'mots'|'coran'|'revision' (autre valeur : aucun onglet actif)
 */
export function renderBottomNav(activeId) {
  const due = store.get('dueCount') || 0;
  return `
    <nav class="bottom-nav" aria-label="Navigation principale">
      ${NAV_ITEMS.map(item => {
        const active = item.id === activeId;
        return `
        <a class="bottom-nav__item ${active ? 'bottom-nav__item--active' : ''}"
           data-navigate="${item.path}" href="#${item.path}"
           ${active ? 'aria-current="page"' : ''}>
          <span class="bottom-nav__icon">${icon(item.icon)}</span>
          <span class="bottom-nav__label">${item.label}</span>
          ${item.id === 'revision' && due > 0 ? `<span class="bottom-nav__badge">${due > 99 ? '99+' : due}</span>` : ''}
        </a>`;
      }).join('')}
    </nav>
  `;
}
