// js/pages/conv-home.js — Accueil « Dialogues »

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { db } from '../db.js';

const $app = () => document.getElementById('app');

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const LEVEL_LABELS = {
  A1: 'Débutant',
  A2: 'Élémentaire',
  B1: 'Intermédiaire',
  B2: 'Avancé',
  C1: 'Autonome',
};

// Couvertures des séries : dégradés profonds + glyphe arabe décoratif
export const SERIES_COVERS = [
  { bg: 'linear-gradient(140deg, #0E8C6D 0%, #0A4F4A 100%)', glyph: 'ح' },
  { bg: 'linear-gradient(140deg, #E08A2E 0%, #B5482A 100%)', glyph: 'ك' },
  { bg: 'linear-gradient(140deg, #5B4BD6 0%, #2A2F7A 100%)', glyph: 'ق' },
  { bg: 'linear-gradient(140deg, #D2546A 0%, #7A2A55 100%)', glyph: 'س' },
  { bg: 'linear-gradient(140deg, #2F7FD8 0%, #1B3F78 100%)', glyph: 'ع' },
  { bg: 'linear-gradient(140deg, #3D8B4F 0%, #1F4D3A 100%)', glyph: 'ب' },
];

export async function loadLessonIndex() {
  let lessons = store.get('lessons');
  if (!lessons) {
    const data = await fetch('data/lessons/index.json').then(r => r.json());
    lessons = data.lessons;
    store.set('lessons', lessons);
  }
  return lessons;
}

/** Progression de chaque leçon : { lessonId: {exercisesCompleted, exercisesTotal, ...} } */
export async function loadLessonProgressMap(lessons) {
  const course = store.get('currentCourse');
  if (!course) return {};
  const entries = await Promise.all(
    lessons.map(l => db.getLessonProgress(course.id, l.id).then(p => [l.id, p]).catch(() => [l.id, null]))
  );
  return Object.fromEntries(entries.filter(([, p]) => p));
}

export function seriesCoverFor(lessons, seriesId) {
  const ids = [...new Set(lessons.map(l => l.seriesId))];
  const idx = Math.max(0, ids.indexOf(seriesId));
  return SERIES_COVERS[idx % SERIES_COVERS.length];
}

/** Ligne de leçon réutilisable (accueil + page niveau). */
export function lessonRow(l, lessons, progress) {
  const cover = seriesCoverFor(lessons, l.seriesId);
  const done = progress && progress.exercisesTotal && progress.exercisesCompleted >= progress.exercisesTotal;
  const started = progress && progress.exercisesCompleted > 0 && !done;
  return `
    <button class="conv-lesson-card pressable" data-lesson-id="${escapeHtml(l.id)}">
      <span class="conv-lesson-card__cover" style="background:${cover.bg}">
        <span class="conv-lesson-card__glyph" lang="ar">${cover.glyph}</span>
        <span class="conv-lesson-card__num">${l.number}</span>
      </span>
      <span class="conv-lesson-card__body">
        <span class="conv-lesson-card__meta">
          <span class="lvl-chip lvl-${escapeHtml(l.level)}">${escapeHtml(l.level)}</span>
          <span>${escapeHtml(l.seriesName)}</span>
          <span aria-hidden="true">·</span>
          <span>${icon('clock')} ${escapeHtml(l.duration || '')}</span>
        </span>
        <span class="conv-lesson-card__title">${escapeHtml(l.titleFr)}</span>
        <span class="conv-lesson-card__desc">${escapeHtml(l.descriptionFr || '')}</span>
      </span>
      <span class="conv-lesson-card__state ${done ? 'is-done' : started ? 'is-started' : ''}">
        ${done ? icon('check') : icon('chevron-right')}
      </span>
    </button>`;
}

let _state = { lessons: [], series: null, progress: {} };

export async function renderConvHome() {
  const lessons = await loadLessonIndex();
  const progress = await loadLessonProgressMap(lessons);
  _state = { lessons, series: null, progress };
  _render();
}

function _render(animate = true) {
  const { lessons, series: activeSeries, progress } = _state;

  const popular = [...lessons].sort((a, b) => (b.playCount || 0) - (a.playCount || 0))[0];

  const levelCounts = {};
  lessons.forEach(l => { levelCounts[l.level] = (levelCounts[l.level] || 0) + 1; });

  const seriesMap = {};
  lessons.forEach(l => {
    if (!seriesMap[l.seriesId]) seriesMap[l.seriesId] = { id: l.seriesId, name: l.seriesName, count: 0, levels: new Set() };
    seriesMap[l.seriesId].count++;
    seriesMap[l.seriesId].levels.add(l.level);
  });
  const series = Object.values(seriesMap);
  const filtered = activeSeries ? lessons.filter(l => l.seriesId === activeSeries) : lessons;
  const doneCount = Object.values(progress).filter(p => p.exercisesTotal && p.exercisesCompleted >= p.exercisesTotal).length;

  $app().innerHTML = `
    ${renderHeader({ title: 'Dialogues', titleAr: 'حوارات', large: true, eyebrow: `${lessons.length} leçons · ${doneCount} terminée${doneCount > 1 ? 's' : ''}` })}
    <main class="page-content page-content--nav conv-home ${animate ? 'stagger' : ''}">

      ${popular ? _renderHero(popular, lessons) : ''}

      <section class="section">
        <div class="section__head"><h2 class="section__title">Par niveau</h2></div>
        <div class="conv-level-grid">
          ${LEVELS.map(lvl => {
            const n = levelCounts[lvl] || 0;
            return `
            <button class="conv-level-tile lvl-${lvl} ${n ? '' : 'is-empty'}" data-level="${lvl}">
              <span class="conv-level-tile__code">${lvl}</span>
              <span class="conv-level-tile__label">${LEVEL_LABELS[lvl]}</span>
              <span class="conv-level-tile__count">${n} leçon${n > 1 ? 's' : ''}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Séries</h2>
          <span class="conv-section__hint">${series.length} séries</span>
        </div>
        <div class="conv-series-scroller" role="list">
          ${series.map(s => {
            const cover = seriesCoverFor(lessons, s.id);
            return `
            <button class="conv-series-card ${activeSeries === s.id ? 'is-active' : ''}" role="listitem" data-series="${escapeHtml(s.id)}">
              <span class="conv-series-card__cover" style="background:${cover.bg}">
                <span class="conv-series-card__glyph" lang="ar">${cover.glyph}</span>
                <span class="conv-series-card__levels">${[...s.levels].map(l => `<span>${escapeHtml(l)}</span>`).join('')}</span>
              </span>
              <span class="conv-series-card__name">${escapeHtml(s.name)}</span>
              <span class="conv-series-card__count">${s.count} leçon${s.count > 1 ? 's' : ''}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="section" id="conv-all-lessons">
        <div class="section__head">
          <h2 class="section__title">${activeSeries ? escapeHtml(seriesMap[activeSeries]?.name || '') : 'Toutes les leçons'}</h2>
          ${activeSeries ? `<button class="section__link" id="btn-clear-filter">Tout afficher</button>` : ''}
        </div>
        <div class="conv-lesson-list">
          ${filtered.map(l => lessonRow(l, lessons, progress[l.id])).join('')}
        </div>
      </section>

    </main>
    ${renderBottomNav('conversations')}
  `;

  _bindEvents();
}

function _renderHero(l, lessons) {
  const cover = seriesCoverFor(lessons, l.seriesId);
  return `
    <section class="conv-hero pressable" data-lesson-id="${escapeHtml(l.id)}" role="button" tabindex="0"
      aria-label="Leçon populaire : ${escapeHtml(l.titleFr)}">
      <span class="conv-hero__glyph" lang="ar" aria-hidden="true">${cover.glyph}</span>
      <div class="conv-hero__top">
        <span class="conv-hero__eyebrow">${icon('sparkles')} Populaire</span>
        <span class="lvl-chip lvl-chip--on-dark">${escapeHtml(l.level)}</span>
      </div>
      <div class="conv-hero__series">${escapeHtml(l.seriesName)} · Leçon ${l.number}</div>
      <h2 class="conv-hero__title">${escapeHtml(l.titleFr)}</h2>
      <p class="conv-hero__desc">${escapeHtml(l.descriptionFr || '')}</p>
      <div class="conv-hero__footer">
        <span class="conv-hero__play">${icon('play')}</span>
        <span class="conv-hero__meta">
          <strong>Écouter le dialogue</strong>
          <span>${icon('clock')} ${escapeHtml(l.duration || '')} · ${(l.playCount || 0).toLocaleString('fr-FR')} écoutes</span>
        </span>
      </div>
    </section>`;
}

function _bindEvents() {
  $app().querySelectorAll('[data-lesson-id]').forEach(el => {
    const go = () => navigate(`/conversations/lecon/${el.dataset.lessonId}`);
    el.addEventListener('click', go);
    if (el.tagName !== 'BUTTON') {
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
  });

  $app().querySelectorAll('[data-level]').forEach(btn => {
    btn.addEventListener('click', () => navigate(`/conversations/niveau/${btn.dataset.level}`));
  });

  $app().querySelectorAll('[data-series]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.series;
      _state.series = _state.series === id ? null : id;
      const scrollX = document.querySelector('.conv-series-scroller')?.scrollLeft || 0;
      _render(false);
      const scroller = document.querySelector('.conv-series-scroller');
      if (scroller) scroller.scrollLeft = scrollX;
      document.getElementById('conv-all-lessons')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
    _state.series = null;
    _render(false);
  });
}
