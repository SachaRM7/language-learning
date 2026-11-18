// js/pages/tajwid-home.js — Parcours Tajwid : niveaux (swipe) et leçons à débloquer progressivement

import { store } from '../store.js';
import { db } from '../db.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';

const $app = () => document.getElementById('app');

export const TAJWID_COURSE = 'tajwid';
export const LEVEL_COLORS = ['#2e7d32', '#1565c0', '#6a1b9a', '#e65100', '#c2185b', '#00695c'];

let _state = { data: null, progress: {}, activeIndex: 0 };

export async function loadTajwid() {
  let data = store.get('tajwidData');
  if (!data) {
    data = await fetch('data/tajwid/levels.json').then(r => r.json());
    store.set('tajwidData', data);
  }
  return data;
}

export async function loadTajwidProgress() {
  const rows = await db.getAllLessonProgress(TAJWID_COURSE);
  const map = {};
  rows.forEach(r => { map[r.lessonId] = r; });
  return map;
}

export function flatLessons(data) {
  const out = [];
  data.levels.forEach((level, li) => level.lessons.forEach((lesson, i) => out.push({ level, levelIndex: li, lesson, index: i })));
  return out;
}

function unlockAll() {
  return Boolean(store.get('preferences')?.tajwidUnlockAll);
}

/** Une leçon est ouverte si toutes les précédentes sont validées (ou si tout est débloqué). */
export function isUnlocked(data, progress, lessonId) {
  if (unlockAll()) return true;
  for (const item of flatLessons(data)) {
    if (item.lesson.id === lessonId) return true;
    if (!progress[item.lesson.id]?.completed) return false;
  }
  return false;
}

export async function getTajwidSummary() {
  const [data, progress] = await Promise.all([loadTajwid(), loadTajwidProgress()]);
  const all = flatLessons(data);
  const done = all.filter(x => progress[x.lesson.id]?.completed).length;
  const next = all.find(x => !progress[x.lesson.id]?.completed);
  return {
    done,
    total: all.length,
    levelName: next ? `${next.level.name} : ${next.level.title}` : 'Parcours terminé',
    next: next?.lesson || null,
  };
}

export async function renderTajwidHome(params = {}) {
  const [data, progress] = await Promise.all([loadTajwid(), loadTajwidProgress()]);
  _state.data = data;
  _state.progress = progress;

  // Niveau affiché : celui demandé, sinon celui de la prochaine leçon à faire
  const requested = data.levels.findIndex(l => l.id === params.levelId);
  const next = flatLessons(data).find(x => !progress[x.lesson.id]?.completed);
  _state.activeIndex = requested >= 0 ? requested : (next ? next.levelIndex : data.levels.length - 1);
  _render();
}

function _levelStats(level) {
  const done = level.lessons.filter(l => _state.progress[l.id]?.completed).length;
  return { done, total: level.lessons.length };
}

function _render() {
  const { data, activeIndex } = _state;
  const n = data.levels.length;
  const color = LEVEL_COLORS[activeIndex % LEVEL_COLORS.length];

  $app().innerHTML = `
    <div class="conv-level-page tajwid-page" id="tajwid-page" style="--level-bg:${color}">
      <div class="conv-level-header-area">
        ${renderHeader({ title: 'Tajwid', back: '/coran' })}
        <div class="level-tabs" id="level-tabs">
          ${data.levels.map((lvl, i) => {
            const st = _levelStats(lvl);
            return `<button class="level-tabs__tab ${i === activeIndex ? 'level-tabs__tab--active' : ''}" data-index="${i}" aria-label="${escapeHtml(lvl.name)}">
              N${i + 1}${st.done === st.total ? ' ✓' : ''}
            </button>`;
          }).join('')}
        </div>
      </div>
      <div class="conv-level-card-container">
        <div class="level-swipe-container" id="level-swipe-container">
          <div class="level-swipe-track" id="level-swipe-track"
               style="width:${n * 100}%;transform:translateX(-${(activeIndex * 100) / n}%);transition:none">
            ${data.levels.map((lvl, i) => _renderPanel(lvl, i, n)).join('')}
          </div>
        </div>
      </div>
    </div>
    ${renderBottomNav('home')}
  `;

  _bindEvents();
  feather.replace();
}

function _renderPanel(level, levelIndex, n) {
  const st = _levelStats(level);
  const pct = Math.round((st.done / st.total) * 100);
  const color = LEVEL_COLORS[levelIndex % LEVEL_COLORS.length];
  return `
    <div class="level-swipe-panel tajwid-panel" style="width:${100 / n}%">
      <div class="tajwid-level-head">
        <div class="tajwid-level-head__eyebrow" style="color:${color}">${escapeHtml(level.name)}</div>
        <div class="tajwid-level-head__title">${escapeHtml(level.title)}</div>
        <div class="tajwid-level-head__desc">${escapeHtml(level.desc)}</div>
        <div class="tajwid-progress">
          <div class="tajwid-progress__track"><div class="tajwid-progress__bar" style="width:${pct}%;background:${color}"></div></div>
          <span class="tajwid-progress__label">${st.done} / ${st.total}</span>
        </div>
      </div>
      <div class="tajwid-lessons">
        ${level.lessons.map((lesson, i) => {
          const prog = _state.progress[lesson.id];
          const unlocked = isUnlocked(_state.data, _state.progress, lesson.id);
          const status = prog?.completed ? 'done' : unlocked ? 'open' : 'locked';
          return `
            <button class="tajwid-lesson tajwid-lesson--${status}" data-lesson-id="${escapeHtml(lesson.id)}" ${status === 'locked' ? 'aria-disabled="true"' : ''}>
              <span class="tajwid-lesson__step" style="--step-color:${color}">
                ${status === 'done' ? '<i data-feather="check"></i>' : status === 'locked' ? '<i data-feather="lock"></i>' : i + 1}
              </span>
              <span class="tajwid-lesson__body">
                <span class="tajwid-lesson__title">${escapeHtml(lesson.title)}</span>
                <span class="tajwid-lesson__sub">${escapeHtml(lesson.subtitle)}${prog?.bestScore != null ? ` · meilleur score ${prog.bestScore}/${prog.total}` : ''}</span>
              </span>
              <span class="tajwid-lesson__ar" lang="ar" dir="rtl">${escapeHtml(lesson.ar)}</span>
            </button>`;
        }).join('')}
      </div>
      ${levelIndex === 0 && !unlockAll() ? `
        <button class="tajwid-unlock" data-action="unlock-all">Je connais déjà les bases — tout débloquer</button>
      ` : ''}
      <div class="tajwid-toast" id="tajwid-toast-${levelIndex}" hidden>Termine d'abord la leçon précédente 🙂</div>
    </div>
  `;
}

function _activateLevel(index) {
  const n = _state.data.levels.length;
  if (index < 0 || index >= n) return;
  _state.activeIndex = index;
  const color = LEVEL_COLORS[index % LEVEL_COLORS.length];
  document.getElementById('tajwid-page')?.style.setProperty('--level-bg', color);
  document.querySelectorAll('.level-tabs__tab').forEach((tab, i) => tab.classList.toggle('level-tabs__tab--active', i === index));
  const track = document.getElementById('level-swipe-track');
  if (track) {
    track.style.transition = 'transform 0.3s ease';
    track.style.transform = `translateX(-${(index * 100) / n}%)`;
  }
}

function _bindEvents() {
  document.querySelectorAll('.level-tabs__tab').forEach(btn => {
    btn.addEventListener('click', () => _activateLevel(parseInt(btn.dataset.index, 10)));
  });

  $app().querySelectorAll('.tajwid-lesson').forEach(el => {
    el.addEventListener('click', () => {
      if (el.classList.contains('tajwid-lesson--locked')) {
        const toast = document.getElementById(`tajwid-toast-${_state.activeIndex}`);
        if (toast) {
          toast.hidden = false;
          clearTimeout(toast._t);
          toast._t = setTimeout(() => { toast.hidden = true; }, 2200);
        }
        return;
      }
      navigate(`/tajwid/lecon/${el.dataset.lessonId}`);
    });
  });

  $app().querySelector('[data-action="unlock-all"]')?.addEventListener('click', async () => {
    const prefs = { ...(store.get('preferences') || {}), tajwidUnlockAll: true };
    store.set('preferences', prefs);
    await db.savePreferences(prefs);
    _render();
  });

  _bindSwipe();
}

function _bindSwipe() {
  const container = document.getElementById('level-swipe-container');
  const track = document.getElementById('level-swipe-track');
  if (!container || !track) return;
  const n = _state.data.levels.length;
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
    if (horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal) {
      const base = -(_state.activeIndex * 100) / n;
      track.style.transform = `translateX(calc(${base}% + ${dx}px))`;
    }
  }, { passive: true });

  container.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    if (horizontal && dx < -70) _activateLevel(_state.activeIndex + 1);
    else if (horizontal && dx > 70) _activateLevel(_state.activeIndex - 1);
    else _activateLevel(_state.activeIndex);
  }, { passive: true });
}
