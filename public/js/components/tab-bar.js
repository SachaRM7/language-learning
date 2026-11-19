// js/components/tab-bar.js — Onglets segmentés (contrôle « pilule »)
// API stable : .tab-bar__tab + .tab-bar__tab--active (utilisée aussi par alphabet.js)

import { escapeHtml } from '../utils.js';

/**
 * @param {Array<{id: string, label: string, count?: number}>} tabs
 * @param {string} activeId
 * @returns {string} HTML
 */
export function renderTabBar(tabs, activeId) {
  return `
    <div class="tab-bar" role="tablist">
      ${tabs.map(tab => `
        <button class="tab-bar__tab ${tab.id === activeId ? 'tab-bar__tab--active' : ''}"
          role="tab" aria-selected="${tab.id === activeId}" data-tab-id="${escapeHtml(tab.id)}">
          ${escapeHtml(tab.label)}${tab.count ? `<span class="tab-bar__count">${tab.count}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `;
}
