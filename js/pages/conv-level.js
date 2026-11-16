// js/pages/conv-level.js — Leçons par niveau (onglets + panneaux balayables)

import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { haptic } from '../ui.js';
import { LEVELS, LEVEL_LABELS, loadLessonIndex, loadLessonProgressMap, lessonRow } from './conv-home.js';

const $app = () => document.getElementById('app');

const LEVEL_BLURB = {
  A1: 'Saluer, se présenter, les premiers échanges du quotidien.',
  A2: 'Faire ses courses, demander son chemin, parler de sa journée.',
  B1: 'Raconter, donner son avis, se débrouiller en voyage.',
  B2: 'Débattre, nuancer, comprendre des échanges plus rapides.',
  C1: 'Parler avec aisance de sujets complexes et abstraits.',
};

let _state = { lessons: [], activeIndex: 0, progress: {} };

export async function renderConvLevel(params) {
  const lessons = await loadLessonIndex();
  const progress = await loadLessonProgressMap(lessons);
  const idx = LEVELS.indexOf(params.level);
  _state = { lessons, progress, activeIndex: idx >= 0 ? idx : 0 };
  _render();
}

function _render() {
  const { activeIndex } = _state;
  const lvl = LEVELS[activeIndex];

  $app().innerHTML = `
    ${renderHeader({ title: 'Niveaux', back: '/conversations' })}
    <main class="page-content page-content--nav conv-level-page lvl-${lvl}" id="conv-level-page">
      <div class="level-tabs" id="level-tabs" role="tablist">
        ${LEVELS.map((l, i) => `
          <button class="level-tabs__tab lvl-${l} ${i === activeIndex ? 'level-tabs__tab--active' : ''}"
            role="tab" aria-selected="${i === activeIndex}" data-index="${i}">${l}</button>
        `).join('')}
      </div>
      <div class="level-swipe-container" id="level-swipe-container">
        <div class="level-swipe-track" id="level-swipe-track"
             style="transform:translateX(-${activeIndex * 20}%);transition:none">
          ${LEVELS.map((l, i) => _renderPanel(l, i === activeIndex)).join('')}
        </div>
      </div>
    </main>
    ${renderBottomNav('conversations')}
  `;

  _bindEvents();
  requestAnimationFrame(_syncHeight);
}

function _renderPanel(lvl, active) {
  const { lessons, progress } = _state;
  const list = lessons.filter(l => l.level === lvl);
  const done = list.filter(l => {
    const p = progress[l.id];
    return p && p.exercisesTotal && p.exercisesCompleted >= p.exercisesTotal;
  }).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return `
    <section class="level-swipe-panel lvl-${lvl}" aria-hidden="${!active}">
      <div class="level-hero">
        <div class="level-hero__code">${lvl}</div>
        <div class="level-hero__body">
          <div class="level-hero__label">${LEVEL_LABELS[lvl]}</div>
          <p class="level-hero__blurb">${LEVEL_BLURB[lvl]}</p>
          <div class="level-hero__progress">
            <div class="progress progress--thin"><div class="progress__fill" style="width:${pct}%"></div></div>
            <span>${done}/${list.length}</span>
          </div>
        </div>
      </div>
      ${list.length ? `
        <div class="conv-lesson-list">
          ${list.map(l => lessonRow(l, lessons, progress[l.id])).join('')}
        </div>
      ` : `
        <div class="empty">
          <div class="empty__emoji">🌙</div>
          <div class="empty__title">Bientôt disponible</div>
          <p>De nouvelles leçons ${escapeHtml(lvl)} arrivent prochainement.</p>
        </div>
      `}
    </section>
  `;
}

function _syncHeight() {
  const container = document.getElementById('level-swipe-container');
  const panel = container?.querySelectorAll('.level-swipe-panel')[_state.activeIndex];
  if (container && panel) container.style.height = `${panel.offsetHeight}px`;
}

function _activateLevel(index) {
  if (index < 0 || index >= LEVELS.length) {
    const track = document.getElementById('level-swipe-track');
    if (track) {
      track.style.transition = 'transform var(--dur-3) var(--ease-out)';
      track.style.transform = `translateX(-${_state.activeIndex * 20}%)`;
    }
    return;
  }
  if (index !== _state.activeIndex) haptic(6);
  _state.activeIndex = index;
  const lvl = LEVELS[index];

  const page = document.getElementById('conv-level-page');
  if (page) page.className = `page-content page-content--nav conv-level-page lvl-${lvl}`;

  document.querySelectorAll('.level-tabs__tab').forEach((tab, i) => {
    tab.classList.toggle('level-tabs__tab--active', i === index);
    tab.setAttribute('aria-selected', String(i === index));
  });
  document.querySelectorAll('.level-swipe-panel').forEach((p, i) => p.setAttribute('aria-hidden', String(i !== index)));

  const track = document.getElementById('level-swipe-track');
  if (track) {
    track.style.transition = 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)';
    track.style.transform = `translateX(-${index * 20}%)`;
  }
  _syncHeight();
  history.replaceState(null, '', `#/conversations/niveau/${lvl}`);
}

function _bindEvents() {
  document.querySelectorAll('.level-tabs__tab').forEach(btn => {
    btn.addEventListener('click', () => _activateLevel(parseInt(btn.dataset.index, 10)));
  });

  $app().querySelectorAll('.conv-lesson-card[data-lesson-id]').forEach(el => {
    el.addEventListener('click', () => navigate(`/conversations/lecon/${el.dataset.lessonId}`));
  });

  window.addEventListener('resize', _syncHeight, { passive: true });
  _bindSwipe();
}

function _bindSwipe() {
  const container = document.getElementById('level-swipe-container');
  const track = document.getElementById('level-swipe-track');
  if (!container || !track) return;

  let startX = 0, startY = 0, dragging = false, horizontal = null;

  container.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
    horizontal = null;
    track.style.transition = 'none';
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
    }
    if (horizontal) {
      const atEdge = (_state.activeIndex === 0 && dx > 0) || (_state.activeIndex === LEVELS.length - 1 && dx < 0);
      const eased = atEdge ? dx * 0.3 : dx;
      track.style.transform = `translateX(calc(${-_state.activeIndex * 20}% + ${eased}px))`;
    }
  }, { passive: true });

  container.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    if (!horizontal) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -70) _activateLevel(_state.activeIndex + 1);
    else if (dx > 70) _activateLevel(_state.activeIndex - 1);
    else _activateLevel(_state.activeIndex);
  }, { passive: true });
}
