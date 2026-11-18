// js/components/bottom-nav.js — Navigation principale
// Mobile : pilule flottante en bas (5 onglets). Ordinateur (≥ 1024 px) : barre latérale avec
// marque, onglets, accès « Explorer » et profil (éléments .nav-desk, masqués sur mobile).

import { icon } from '../icons.js';
import { store } from '../store.js';

const NAV_ITEMS = [
  { id: 'home',     path: '/home',     icon: 'home',       label: 'Accueil' },
  { id: 'parcours', path: '/parcours', icon: 'route',      label: 'Parcours' },
  { id: 'mots',     path: '/mots',     icon: 'layers',     label: 'Mots' },
  { id: 'coran',    path: '/coran',    icon: 'book-open',  label: 'Coran' },
  { id: 'revision', path: '/revision', icon: 'refresh-cw', label: 'Révision' },
];

const EXPLORE = [
  { path: '/comprendre',    icon: 'lightbulb', label: 'Comprendre' },
  { path: '/tuteur',        icon: 'sparkles',  label: 'Karim IA' },
  { path: '/conversations', icon: 'messages',  label: 'Dialogues' },
  { path: '/alphabet',      icon: 'languages', label: 'Alphabet' },
  { path: '/racines',       icon: 'sprout',    label: 'Racines' },
];

/**
 * @param {string} activeId - 'home'|'parcours'|'mots'|'coran'|'revision' (autre valeur : aucun onglet actif)
 */
export function renderBottomNav(activeId) {
  const due = store.get('dueCount') || 0;
  const path = (location.hash || '').replace(/^#/, '');
  const exploreActive = EXPLORE.find(e => path === e.path || path.startsWith(e.path + '/'));
  const mainActive = exploreActive || path.startsWith('/profil') ? null : activeId;
  const account = store.get('account');

  return `
    <nav class="bottom-nav" aria-label="Navigation principale">
      <a class="nav-brand nav-desk" data-navigate="/home" href="#/home" aria-label="HelloArabic — accueil">
        <span class="nav-brand__logo" lang="ar">أ</span>
        <span class="nav-brand__name">HelloArabic<small lang="ar">أَهْلًا</small></span>
      </a>

      ${NAV_ITEMS.map(item => navLink(item, item.id === mainActive, item.id === 'revision' ? due : 0)).join('')}

      <div class="nav-section nav-desk">Explorer</div>
      ${EXPLORE.map(item => navLink(item, item === exploreActive, 0, true)).join('')}

      <div class="nav-spacer nav-desk"></div>
      <a class="nav-profile nav-desk ${path.startsWith('/profil') ? 'is-active' : ''}" data-navigate="/profil" href="#/profil">
        <span class="nav-profile__avatar">${icon('user')}</span>
        <span class="nav-profile__body">
          <span class="nav-profile__name">Profil & réglages</span>
          <span class="nav-profile__meta">${account?.email ? escapeAttr(account.email) : 'Mode local'}</span>
        </span>
      </a>
    </nav>
  `;
}

function navLink(item, active, badge = 0, deskOnly = false) {
  return `
    <a class="bottom-nav__item ${active ? 'bottom-nav__item--active' : ''} ${deskOnly ? 'nav-desk' : ''}"
       data-navigate="${item.path}" href="#${item.path}" ${active ? 'aria-current="page"' : ''}>
      <span class="bottom-nav__icon">${icon(item.icon)}</span>
      <span class="bottom-nav__label">${item.label}</span>
      ${badge > 0 ? `<span class="bottom-nav__badge">${badge > 99 ? '99+' : badge}</span>` : ''}
    </a>`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
