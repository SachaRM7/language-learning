// js/pages/conv-lesson.js — Leçon : dialogue (bulles), vocabulaire, grammaire & exemples, exercices

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderTabBar } from '../components/tab-bar.js';
import { renderPlayer, bindPlayerEvents } from '../components/player.js';
import { renderDialogueLine, buildSpeakers } from '../components/dialogue-line.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { haptic, toast } from '../ui.js';
import { db } from '../db.js';
import { playWord } from '../audio.js';

const $app = () => document.getElementById('app');

const TABS = ['dialogue', 'vocabulary', 'grammar', 'exercises'];
const TAB_LABELS = {
  dialogue: 'Dialogue',
  vocabulary: 'Mots',
  grammar: 'Grammaire',
  exercises: 'Exercices',
};

let _state = {};
let _playToken = 0;
let _resizeObs = null;

export async function renderConvLesson(params) {
  const { lessonId } = params;

  let lesson = store.get('currentLesson');
  if (!lesson || lesson.id !== lessonId) {
    try {
      lesson = await fetch(`data/lessons/${lessonId}.json`).then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      });
    } catch {
      _renderNotFound();
      return;
    }
    store.set('currentLesson', lesson);
  }

  const course = store.get('currentCourse');
  const progress = course ? await db.getLessonProgress(course.id, lessonId).catch(() => null) : null;
  const prefs = store.get('preferences') || {};

  _state = {
    lesson,
    lessonId,
    progress,
    activeTab: TABS.includes(_state.lessonId === lessonId ? _state.activeTab : '') ? _state.activeTab : 'dialogue',
    showTranslation: true,
    showTranslit: prefs.showTranslit !== false,
    showHarakats: prefs.showHarakats !== false,
  };

  _render();
}

function _renderNotFound() {
  $app().innerHTML = `
    ${renderHeader({ title: 'Leçon introuvable', back: '/conversations' })}
    <main class="page-content page-content--nav">
      <div class="empty">
        <div class="empty__emoji">🧭</div>
        <div class="empty__title">Leçon introuvable</div>
        <p>Cette leçon n'existe pas ou n'est pas encore disponible.</p>
        <button class="btn btn--secondary" data-navigate="/conversations" style="margin-top:var(--sp-4)">Retour aux dialogues</button>
      </div>
    </main>
    ${renderBottomNav('conversations')}
  `;
}

function _filterClasses() {
  const { showTranslation, showTranslit, showHarakats } = _state;
  return [
    'lesson-filter-container',
    showTranslation ? 'show-translation' : '',
    showTranslit ? 'show-translit' : '',
    showHarakats ? 'show-harakats' : '',
  ].filter(Boolean).join(' ');
}

function _counts() {
  const { lesson } = _state;
  const ex = (lesson.exercises?.fillBlanks?.length || 0) + (lesson.exercises?.dialogueBlanks?.length || 0);
  return {
    lines: lesson.dialogue?.length || 0,
    words: lesson.vocabulary?.length || 0,
    grammar: (lesson.grammar?.length || 0) + (lesson.examples?.length || 0),
    exercises: ex,
  };
}

function _render() {
  const { lesson, activeTab, progress } = _state;
  const tabIndex = TABS.indexOf(activeTab);
  const hasPlayer = !!(lesson.hasAudio && lesson.audioUrl);
  const c = _counts();
  const tabs = TABS.map(id => ({ id, label: TAB_LABELS[id] }));
  const exDone = progress?.exercisesTotal ? Math.min(100, Math.round((progress.exercisesCompleted / progress.exercisesTotal) * 100)) : 0;

  $app().innerHTML = `
    ${renderHeader({ title: `${lesson.seriesName} · ${lesson.number}`, back: '/conversations' })}
    <main class="page-content page-content--nav conv-lesson ${hasPlayer ? 'has-player' : ''}">
      <section class="lesson-hero lvl-${escapeHtml(lesson.level)}">
        <div class="lesson-hero__chips">
          <span class="lvl-chip lvl-${escapeHtml(lesson.level)}">${escapeHtml(lesson.level)}</span>
          ${lesson.duration ? `<span class="lesson-hero__chip">${icon('clock')}${escapeHtml(lesson.duration)}</span>` : ''}
          ${(lesson.tags || []).slice(0, 2).map(t => `<span class="lesson-hero__chip">#${escapeHtml(t)}</span>`).join('')}
        </div>
        <h2 class="lesson-hero__title">${escapeHtml(lesson.titleFr)}</h2>
        <p class="lesson-hero__desc">${escapeHtml(lesson.descriptionFr || '')}</p>
        <div class="lesson-hero__stats">
          <span><strong>${c.lines}</strong> répliques</span>
          <span><strong>${c.words}</strong> mots</span>
          <span><strong>${c.exercises}</strong> exercices</span>
        </div>
        ${progress?.exercisesTotal ? `
          <div class="lesson-hero__progress">
            <div class="progress progress--thin"><div class="progress__fill" style="width:${exDone}%"></div></div>
            <span>${exDone === 100 ? `${icon('check-circle')} Terminée` : `${exDone} %`}</span>
          </div>` : ''}
      </section>

      <div class="lesson-sticky">
        ${renderTabBar(tabs, activeTab)}
        <div class="lesson-toggles" role="group" aria-label="Affichage">
          ${_toggle('toggle-translation', 'Traduction', 'FR', _state.showTranslation)}
          ${_toggle('toggle-translit', 'Phonétique', 'Abc', _state.showTranslit)}
          ${_toggle('toggle-harakats', 'Harakats', 'ـَـ', _state.showHarakats, true)}
        </div>
      </div>

      <div class="swipe-tabs-container ${_filterClasses()}" id="lesson-swipe-container">
        <div class="swipe-tabs-track" id="lesson-swipe-track"
             style="transform:translateX(-${tabIndex * 25}%);transition:none">
          <section class="swipe-tabs-panel" role="tabpanel">${_renderDialogue()}</section>
          <section class="swipe-tabs-panel" role="tabpanel">${_renderVocabulary()}</section>
          <section class="swipe-tabs-panel" role="tabpanel">${_renderGrammar()}</section>
          <section class="swipe-tabs-panel" role="tabpanel">${_renderExercisesTab()}</section>
        </div>
      </div>
    </main>
    ${hasPlayer ? renderPlayer(lesson) : ''}
    ${renderBottomNav('conversations')}
  `;

  _bindEvents();
  if (hasPlayer) bindPlayerEvents(lesson);
  _observeHeights();
}

function _toggle(id, label, glyph, on, ar = false) {
  return `
    <button class="lesson-toggle ${on ? 'is-active' : ''}" id="${id}" aria-pressed="${on}">
      <span class="lesson-toggle__icon ${ar ? 'text-ar' : ''}">${glyph}</span>
      <span class="lesson-toggle__label">${label}</span>
    </button>`;
}

// ── Panneaux ─────────────────────────────────────────────────────

function _empty(emoji, title, text) {
  return `<div class="empty"><div class="empty__emoji">${emoji}</div><div class="empty__title">${title}</div><p>${text}</p></div>`;
}

function _renderDialogue() {
  const { lesson } = _state;
  if (!lesson.dialogue?.length) return _empty('💬', 'Dialogue bientôt disponible', 'Le texte de cette leçon arrive prochainement.');
  const speakers = buildSpeakers(lesson);
  const hasAudio = !!(lesson.hasAudio && lesson.audioUrl);
  let prev = null;
  const cast = Object.values(speakers);

  return `
    <div class="dialogue-head">
      <div class="dialogue-cast">
        ${cast.map(sp => `<span class="dialogue-cast__item" style="--sp:${sp.tint.c};--sp-soft:${sp.tint.s}">
          <span class="dialogue-cast__avatar">${escapeHtml(sp.initial)}</span>${escapeHtml(sp.name)}</span>`).join('')}
      </div>
      ${hasAudio ? '' : `<button class="btn btn--tonal btn--sm" id="btn-play-all">${icon('play')}<span>Tout écouter</span></button>`}
    </div>
    <div class="dialogue-list">
      ${lesson.dialogue.map(line => {
        const sp = speakers[line.speaker];
        const html = renderDialogueLine(line, sp, prev !== line.speaker);
        prev = line.speaker;
        return html;
      }).join('')}
    </div>
    ${_counts().exercises ? `
      <button class="lesson-next-card pressable" data-goto-tab="3">
        <span class="row__icon" style="--tint:var(--gold-soft);--tint-ink:var(--gold)">${icon('target')}</span>
        <span class="row__body">
          <span class="row__title">Prêt à t'entraîner ?</span>
          <span class="row__meta">${_counts().exercises} exercices sur ce dialogue</span>
        </span>
        <span class="row__chev">${icon('arrow-right')}</span>
      </button>` : ''}
  `;
}

function _wordRow(w, linked = false) {
  return `
    <div class="vocab-item">
      <button class="vocab-item__play" data-ar="${escapeHtml(w.ar)}" aria-label="Écouter">${icon('volume-2')}</button>
      <div class="vocab-item__main">
        <div class="vocab-item__fr translation-text">${escapeHtml(w.fr)}${linked ? `<span class="vocab-item__linked" title="Présent dans tes flashcards">${icon('layers')}</span>` : ''}</div>
        <div class="vocab-item__fr vocab-item__fr--placeholder translation-placeholder">•••</div>
        <div class="vocab-item__translit translit-text">${escapeHtml(w.translit || '')}</div>
      </div>
      <div class="vocab-item__ar text-ar arabic-text" dir="rtl" lang="ar">${escapeHtml(w.ar)}</div>
      <div class="vocab-item__ar text-ar arabic-text--plain" dir="rtl" lang="ar">${escapeHtml(w.arPlain || w.ar)}</div>
    </div>`;
}

function _renderVocabulary() {
  const { lesson } = _state;
  if (!lesson.vocabulary?.length) return _empty('📚', 'Vocabulaire bientôt disponible', 'Les mots clés de cette leçon arrivent prochainement.');
  return `
    <div class="vocab-list">
      ${lesson.vocabulary.map(w => _wordRow(w, !!w.linkedCards?.length)).join('')}
    </div>
    <button class="btn btn--primary btn--block" id="btn-review-vocab" style="margin-top:var(--sp-5)">
      ${icon('layers')}<span>Réviser ces ${lesson.vocabulary.length} mots en flashcards</span>
    </button>
  `;
}

function _renderGrammar() {
  const { lesson } = _state;
  const hasGrammar = lesson.grammar?.length;
  const hasExamples = lesson.examples?.length;
  if (!hasGrammar && !hasExamples) return _empty('✍️', 'Grammaire bientôt disponible', 'Les points de grammaire arrivent prochainement.');

  return `
    ${hasGrammar ? `<div class="grammar-list">
      ${lesson.grammar.map((g, i) => {
        const [ar, ...fr] = (g.title || '').split(/\s+[—–-]\s+/);
        const [arPlain] = (g.titlePlain || g.title || '').split(/\s+[—–-]\s+/);
        return `
        <article class="grammar-item">
          <div class="grammar-item__head">
            <span class="grammar-item__num">${i + 1}</span>
            <div class="grammar-item__titles">
              <h3 class="grammar-item__title">${escapeHtml(g.titleFr)}</h3>
              ${fr.length ? `<div class="grammar-item__sub">${escapeHtml(fr.join(' — '))}</div>` : ''}
            </div>
            <div class="grammar-item__ar text-ar arabic-text" dir="rtl" lang="ar">${escapeHtml(ar)}</div>
            <div class="grammar-item__ar text-ar arabic-text--plain" dir="rtl" lang="ar">${escapeHtml(arPlain)}</div>
          </div>
          <p class="grammar-item__explanation">${icon('lightbulb')}<span>${escapeHtml(g.explanation)}</span></p>
          ${g.examples?.length ? `
            <div class="grammar-examples">
              ${g.examples.map(ex => `
                <div class="grammar-example">
                  <button class="vocab-item__play" data-ar="${escapeHtml(ex.ar)}" aria-label="Écouter">${icon('volume-2')}</button>
                  <div class="grammar-example__body">
                    <div class="grammar-example__ar text-ar arabic-text" dir="rtl" lang="ar">${escapeHtml(ex.ar)}</div>
                    <div class="grammar-example__ar text-ar arabic-text--plain" dir="rtl" lang="ar">${escapeHtml(ex.arPlain || ex.ar)}</div>
                    <div class="grammar-example__translit translit-text">${escapeHtml(ex.translit || '')}</div>
                    <div class="grammar-example__fr translation-text">${escapeHtml(ex.fr)}</div>
                  </div>
                </div>
              `).join('')}
            </div>` : ''}
        </article>`;
      }).join('')}
    </div>` : ''}
    ${hasExamples ? `
      <div class="section">
        <div class="section__head"><h3 class="section__title">Exemples</h3></div>
        <div class="vocab-list">${lesson.examples.map(ex => _wordRow(ex)).join('')}</div>
      </div>` : ''}
  `;
}

function _renderExercisesTab() {
  const { progress } = _state;
  const total = _counts().exercises;
  if (!total) return _empty('✏️', 'Exercices bientôt disponibles', 'Les exercices de cette leçon arrivent prochainement.');
  const done = progress?.exercisesTotal && progress.exercisesCompleted >= progress.exercisesTotal;
  const score = typeof progress?.lastScore === 'number' ? progress.lastScore : null;

  return `
    <div class="exercises-tab">
      <div class="exercises-tab__art" aria-hidden="true">
        <span class="exercises-tab__icon">${icon('target')}</span>
      </div>
      <div class="exercises-tab__count">${total} exercice${total > 1 ? 's' : ''}</div>
      <p class="exercises-tab__desc">Complète les phrases et choisis la bonne réplique pour ancrer ce que tu viens d'entendre.</p>
      <div class="exercises-tab__pills">
        <span class="badge">${icon('pen')} Phrases à trous</span>
        <span class="badge">${icon('message-circle')} Répliques</span>
      </div>
      ${score !== null ? `<div class="exercises-tab__last">Dernier score : <strong>${score} %</strong></div>` : ''}
      <button class="btn btn--primary btn--block btn--lg" id="btn-start-exercises">
        ${done ? icon('rotate-ccw') : icon('play')}<span>${done ? 'Refaire les exercices' : 'Commencer'}</span>
      </button>
    </div>
  `;
}

// ── Interactions ─────────────────────────────────────────────────

function _syncHeight() {
  const container = document.getElementById('lesson-swipe-container');
  const panel = container?.querySelectorAll('.swipe-tabs-panel')[TABS.indexOf(_state.activeTab)];
  if (container && panel) container.style.height = `${panel.offsetHeight}px`;
}

function _observeHeights() {
  _resizeObs?.disconnect();
  _syncHeight();
  if ('ResizeObserver' in window) {
    _resizeObs = new ResizeObserver(() => _syncHeight());
    document.querySelectorAll('.swipe-tabs-panel').forEach(p => _resizeObs.observe(p));
  }
}

function _switchTab(index, animate = true) {
  const track = document.getElementById('lesson-swipe-track');
  if (index < 0 || index >= TABS.length) index = TABS.indexOf(_state.activeTab);
  if (TABS[index] !== _state.activeTab) haptic(6);
  _state.activeTab = TABS[index];

  document.querySelectorAll('.tab-bar__tab').forEach((tab, i) => {
    tab.classList.toggle('tab-bar__tab--active', i === index);
    tab.setAttribute('aria-selected', String(i === index));
  });
  document.querySelector('.lesson-toggles')?.classList.toggle('is-hidden', TABS[index] === 'exercises');

  if (track) {
    track.style.transition = animate ? 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    track.style.transform = `translateX(-${index * 25}%)`;
  }
  _syncHeight();

  // Ramener le haut du contenu sous les onglets si on a défilé loin
  const sticky = document.querySelector('.lesson-sticky');
  if (sticky && sticky.getBoundingClientRect().top <= 80 && window.scrollY > sticky.offsetTop) {
    window.scrollTo({ top: sticky.offsetTop - 64, behavior: 'smooth' });
  }
}

function _applyFilterClasses() {
  const container = document.getElementById('lesson-swipe-container');
  if (!container) return;
  container.className = `swipe-tabs-container ${_filterClasses()}`;
  [['toggle-translation', 'showTranslation'], ['toggle-translit', 'showTranslit'], ['toggle-harakats', 'showHarakats']]
    .forEach(([id, key]) => {
      const el = document.getElementById(id);
      el?.classList.toggle('is-active', _state[key]);
      el?.setAttribute('aria-pressed', String(_state[key]));
    });
  _syncHeight();
}

function _bindEvents() {
  $app().querySelectorAll('.tab-bar__tab').forEach((btn, i) => {
    btn.addEventListener('click', () => _switchTab(i));
  });
  $app().querySelectorAll('[data-goto-tab]').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(parseInt(btn.dataset.gotoTab, 10)));
  });
  document.querySelector('.lesson-toggles')?.classList.toggle('is-hidden', _state.activeTab === 'exercises');

  [['toggle-translation', 'showTranslation'], ['toggle-translit', 'showTranslit'], ['toggle-harakats', 'showHarakats']]
    .forEach(([id, key]) => {
      document.getElementById(id)?.addEventListener('click', () => {
        _state[key] = !_state[key];
        haptic(6);
        _applyFilterClasses();
      });
    });

  $app().querySelectorAll('[data-ar]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      _stopPlayAll();
      btn.classList.add('is-playing');
      await _speak(btn.dataset.ar);
      btn.classList.remove('is-playing');
    });
  });

  $app().querySelectorAll('.translation-placeholder[data-line-id]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById(`line-${el.dataset.lineId}`)?.classList.add('is-revealed');
      _syncHeight();
    });
  });

  document.getElementById('btn-play-all')?.addEventListener('click', _togglePlayAll);

  document.getElementById('btn-start-exercises')?.addEventListener('click', () => {
    navigate(`/conversations/lecon/${_state.lessonId}/exercice`);
  });

  document.getElementById('btn-review-vocab')?.addEventListener('click', _openVocabDeck);

  const onLeave = () => { _stopPlayAll(); _resizeObs?.disconnect(); window.removeEventListener('hashchange', onLeave); };
  window.addEventListener('hashchange', onLeave);

  _bindSwipe();
}

/** TTS avec garde-fou : se résout même si aucune voix arabe n'est disponible. */
function _speak(text) {
  const maxMs = Math.max(1500, text.length * 140);
  return Promise.race([playWord(text, 'ar-SA'), new Promise(r => setTimeout(r, maxMs))]);
}

function _stopPlayAll() {
  _playToken++;
  try { speechSynthesis.cancel(); } catch { /* indisponible */ }
  document.querySelectorAll('.dialogue-line--active').forEach(el => el.classList.remove('dialogue-line--active'));
  const btn = document.getElementById('btn-play-all');
  if (btn) btn.innerHTML = `${icon('play')}<span>Tout écouter</span>`;
}

async function _togglePlayAll() {
  const btn = document.getElementById('btn-play-all');
  if (btn?.dataset.playing === '1') { btn.dataset.playing = '0'; _stopPlayAll(); return; }
  const token = ++_playToken;
  if (btn) { btn.dataset.playing = '1'; btn.innerHTML = `${icon('pause')}<span>Pause</span>`; }
  for (const line of _state.lesson.dialogue || []) {
    if (token !== _playToken) return;
    const el = document.getElementById(`line-${line.id}`);
    document.querySelectorAll('.dialogue-line--active').forEach(x => x.classList.remove('dialogue-line--active'));
    el?.classList.add('dialogue-line--active');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await _speak(line.ar);
    await new Promise(r => setTimeout(r, 280));
  }
  if (token === _playToken) {
    if (btn) btn.dataset.playing = '0';
    _stopPlayAll();
  }
}

async function _openVocabDeck() {
  const vocab = _state.lesson.vocabulary;
  if (!vocab?.length) return;
  const course = store.get('currentCourse');
  const deck = {
    id: `lesson-vocab-${_state.lessonId}`,
    name: `Vocab — ${_state.lesson.seriesName} ${_state.lesson.number}`,
    nameAr: '',
    category: 'Leçons',
    source: 'lesson',
    lessonId: _state.lessonId,
    tags: _state.lesson.tags || [],
    cards: vocab.map((word, index) => ({
      id: `lesson-vocab-${_state.lessonId}:${index}`,
      front: word.ar,
      frontPlain: word.arPlain,
      back: word.fr,
      en: word.en,
      translit: word.translit,
      emoji: '',
      image: null,
      audio: null,
      tags: word.tags || [],
    })),
  };

  await db.saveLessonDeck(course.id, _state.lessonId, deck);
  const decks = store.get('decks') || [];
  const idx = decks.findIndex(d => d.id === deck.id);
  if (idx >= 0) decks[idx] = deck; else decks.push(deck);
  store.set('decks', decks);
  toast('Paquet ajouté à tes mots', { icon: 'layers' });
  navigate(`/mots/lecons/${_state.lessonId}`);
}

function _bindSwipe() {
  const container = document.getElementById('lesson-swipe-container');
  const track = document.getElementById('lesson-swipe-track');
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
    if (horizontal === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
    }
    if (horizontal) {
      const idx = TABS.indexOf(_state.activeTab);
      const atEdge = (idx === 0 && dx > 0) || (idx === TABS.length - 1 && dx < 0);
      track.style.transform = `translateX(calc(${-idx * 25}% + ${atEdge ? dx * 0.3 : dx}px))`;
    }
  }, { passive: true });

  container.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    if (!horizontal) return;
    const dx = e.changedTouches[0].clientX - startX;
    const idx = TABS.indexOf(_state.activeTab);
    if (dx < -70) _switchTab(idx + 1);
    else if (dx > 70) _switchTab(idx - 1);
    else _switchTab(idx);
  }, { passive: true });
}
