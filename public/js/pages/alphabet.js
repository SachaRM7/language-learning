// js/pages/alphabet.js — Alphabet arabe : lettres, voyelles brèves, règles

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { showModal, hideModal } from '../components/modal.js';
import { escapeHtml } from '../utils.js';
import { playWord } from '../audio.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';

const $app = () => document.getElementById('app');

const TABS = [
  { id: 'letters', label: 'Lettres' },
  { id: 'diacritics', label: 'Voyelles' },
  { id: 'rules', label: 'Règles' },
];

const TYPES = {
  sun:   { label: 'Solaire', short: '☀︎', cls: 'is-sun' },
  moon:  { label: 'Lunaire', short: '☾', cls: 'is-moon' },
  vowel: { label: 'Voyelle longue', short: 'ā', cls: 'is-vowel' },
};

const FORMS = [
  { id: 'isolated', label: 'Isolée' },
  { id: 'initial',  label: 'Initiale' },
  { id: 'medial',   label: 'Médiane' },
  { id: 'final',    label: 'Finale' },
];

let _state = { data: null, tab: 0, filter: 'all' };

export async function renderAlphabet() {
  let data = store.get('alphabetData');
  if (!data) {
    data = await fetch('data/alphabet/letters.json').then(r => r.json());
    store.set('alphabetData', data);
  }
  _state = { data, tab: _state.tab || 0, filter: 'all' };
  _render();
}

function _render() {
  const { data, tab } = _state;
  $app().innerHTML = `
    ${renderHeader({ title: 'Alphabet', titleAr: 'الأَبْجَدِيَّة', back: '/home' })}
    <div class="ex-tabs-wrap">
      <div class="ex-tabs" role="tablist" style="--tab:${tab}">
        <span class="ex-tabs__pill" aria-hidden="true"></span>
        ${TABS.map((t, i) => `
          <button class="ex-tabs__tab ${i === tab ? 'is-active' : ''}" role="tab" aria-selected="${i === tab}" data-tab="${i}">${t.label}</button>
        `).join('')}
      </div>
    </div>
    <div class="ex-swipe" id="alpha-swipe">
      <div class="ex-swipe__track" id="alpha-track" style="transform:translateX(${_offset(tab)})">
        <section class="ex-swipe__panel" aria-label="Lettres">${_renderLetters(data.letters)}</section>
        <section class="ex-swipe__panel" aria-label="Voyelles brèves">${_renderDiacritics(data.diacritics)}</section>
        <section class="ex-swipe__panel" aria-label="Règles">${_renderRules(data.rules)}</section>
      </div>
    </div>
    ${renderBottomNav('home')}
  `;
  _bindEvents();
}

// En RTL de document ou LTR, on translate toujours vers la gauche
function _offset(i) { return `${-i * 100}%`; }

/* ─────────── Lettres ─────────── */

function _renderLetters(letters) {
  const counts = { sun: 0, moon: 0, vowel: 0 };
  letters.forEach(l => { counts[l.type] = (counts[l.type] || 0) + 1; });
  return `
    <div class="alpha-intro">
      <p>28 lettres, écrites de <strong>droite à gauche</strong>. Touche une lettre pour voir ses formes et l'écouter.</p>
      <div class="alpha-filters" role="group" aria-label="Filtrer">
        <button class="chip is-active" data-filter="all">Toutes <span class="alpha-filters__n">${letters.length}</span></button>
        <button class="chip" data-filter="sun">☀︎ Solaires <span class="alpha-filters__n">${counts.sun}</span></button>
        <button class="chip" data-filter="moon">☾ Lunaires <span class="alpha-filters__n">${counts.moon}</span></button>
      </div>
    </div>
    <div class="alpha-grid" dir="rtl">
      ${letters.map((l, i) => {
        const t = TYPES[l.type] || TYPES.moon;
        return `
        <button class="alpha-tile ${t.cls}" data-idx="${i}" data-type="${escapeHtml(l.type)}" aria-label="${escapeHtml(l.name)}, ${t.label}">
          <span class="alpha-tile__mark" aria-hidden="true">${t.short}</span>
          <span class="alpha-tile__letter" lang="ar">${escapeHtml(l.unicode)}</span>
          <span class="alpha-tile__name" dir="ltr">${escapeHtml(l.name)}</span>
        </button>`;
      }).join('')}
    </div>
  `;
}

function _renderLetterSheet(idx) {
  const letters = _state.data.letters;
  const l = letters[idx];
  const t = TYPES[l.type] || TYPES.moon;
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal alpha-sheet ${t.cls}" role="dialog" aria-modal="true" aria-label="${escapeHtml(l.name)}">
        <div class="modal__header">
          <div>
            <div class="modal__title">${escapeHtml(l.name)} <span class="alpha-sheet__name-ar" lang="ar">${escapeHtml(l.nameAr)}</span></div>
            <div class="alpha-sheet__pos">Lettre ${l.order || idx + 1} sur ${letters.length}</div>
          </div>
          <button class="modal__close" id="modal-close" aria-label="Fermer">${icon('x')}</button>
        </div>

        <div class="alpha-sheet__hero">
          <button class="icon-btn" data-step="-1" aria-label="Lettre précédente" ${idx === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button>
          <div class="alpha-sheet__glyph" lang="ar">${escapeHtml(l.unicode)}</div>
          <button class="icon-btn" data-step="1" aria-label="Lettre suivante" ${idx === letters.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button>
        </div>

        <div class="alpha-sheet__chips">
          <span class="badge badge--primary">/${escapeHtml(l.transliteration)}/</span>
          <span class="badge alpha-type-badge">${t.short} ${t.label}</span>
          <button class="btn btn--tonal btn--sm" data-play-ar="${escapeHtml(l.nameAr)}">${icon('volume-2')} Écouter</button>
        </div>
        <p class="alpha-sheet__pron">${escapeHtml(l.pronunciation)}</p>

        <div class="alpha-sheet__label">Formes selon la position</div>
        <div class="alpha-forms" dir="rtl">
          ${FORMS.map(f => `
            <div class="alpha-form">
              <span class="alpha-form__letter" lang="ar">${escapeHtml(l.forms[f.id])}</span>
              <span class="alpha-form__label" dir="ltr">${f.label}</span>
            </div>`).join('')}
        </div>

        ${l.examples?.length ? `
          <div class="alpha-sheet__label">Exemple${l.examples.length > 1 ? 's' : ''}</div>
          ${l.examples.map(ex => _exampleRow(ex.word, ex.translit, ex.meaning)).join('')}
        ` : ''}

        ${l.rules?.length ? `
          <div class="alpha-sheet__label">À retenir</div>
          <ul class="alpha-sheet__rules">${l.rules.map(r => `<li>${icon('lightbulb')}<span>${escapeHtml(r)}</span></li>`).join('')}</ul>
        ` : ''}
      </div>
    </div>
  `;
}

function _openLetter(idx) {
  haptic();
  showModal(_renderLetterSheet(idx));
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
  document.getElementById('modal-close')?.addEventListener('click', hideModal);
  _bindPlay(overlay);
  overlay.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = idx + parseInt(btn.dataset.step, 10);
      if (next < 0 || next >= _state.data.letters.length) return;
      overlay.remove();
      _openLetter(next);
      document.querySelector('.modal')?.style.setProperty('animation', 'none');
    });
  });
}

/* ─────────── Voyelles brèves ─────────── */

function _renderDiacritics(diacritics) {
  return `
    <p class="alpha-intro"><span>Les voyelles courtes (<em>harakat</em>) s'écrivent au-dessus ou au-dessous des lettres.</span></p>
    <div class="ex-list">
      ${diacritics.map(d => `
        <article class="card diac-card">
          <div class="diac-card__head">
            <span class="diac-card__glyph" lang="ar">${escapeHtml(d.example.letter)}</span>
            <div class="diac-card__title">
              <div class="diac-card__name">${escapeHtml(d.name)} <span lang="ar">${escapeHtml(d.nameAr)}</span></div>
              <span class="badge badge--primary">${escapeHtml(d.sound)}</span>
            </div>
            <button class="audio-btn audio-btn--sm" data-play-ar="${escapeHtml(d.example.letter)}" aria-label="Écouter ${escapeHtml(d.example.letter)}">${icon('volume-2')}</button>
          </div>
          <p class="diac-card__desc">${escapeHtml(d.description)}</p>
          ${_exampleRow(d.example.word, d.example.wordTranslit, d.example.wordMeaning)}
        </article>
      `).join('')}
    </div>
  `;
}

/* ─────────── Règles ─────────── */

function _renderRules(rules) {
  return `
    <div class="ex-list">
      ${rules.map((r, i) => `
        <article class="card rule-card">
          <div class="rule-card__head">
            <span class="rule-card__num">${i + 1}</span>
            <div>
              <h3 class="rule-card__title">${escapeHtml(r.title)}</h3>
              <div class="rule-card__ar" lang="ar" dir="rtl">${escapeHtml(r.titleAr)}</div>
            </div>
          </div>
          <p class="rule-card__text">${escapeHtml(r.explanation)}</p>
          ${r.sunLetters ? `
            <div class="rule-card__groups">
              <div class="rule-group is-sun">
                <div class="rule-group__label">☀︎ Lettres solaires</div>
                <div class="rule-group__letters" lang="ar" dir="rtl">${r.sunLetters.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>
              </div>
              <div class="rule-group is-moon">
                <div class="rule-group__label">☾ Lettres lunaires</div>
                <div class="rule-group__letters" lang="ar" dir="rtl">${r.moonLetters.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>
              </div>
            </div>` : ''}
          ${r.examples?.length ? `<div class="rule-card__examples">${r.examples.map(ex => _exampleRow(ex.ar, ex.translit, ex.fr)).join('')}</div>` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function _exampleRow(ar, translit, meaning) {
  return `
    <div class="ex-example">
      <button class="audio-btn audio-btn--sm" data-play-ar="${escapeHtml(ar)}" aria-label="Écouter">${icon('volume-2')}</button>
      <div class="ex-example__body">
        <div class="ex-example__fr">${escapeHtml(meaning || '')}</div>
        <div class="ex-example__tr">${escapeHtml(translit || '')}</div>
      </div>
      <div class="ex-example__ar" lang="ar" dir="rtl">${escapeHtml(ar)}</div>
    </div>`;
}

/* ─────────── Événements ─────────── */

function _bindPlay(root) {
  root.querySelectorAll('[data-play-ar]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.classList.add('is-playing');
      await playWord(btn.dataset.playAr, 'ar-SA');
      btn.classList.remove('is-playing');
    });
  });
}

function _switchTab(index, animate = true) {
  if (index < 0 || index >= TABS.length) return;
  _state.tab = index;
  const tabs = $app().querySelector('.ex-tabs');
  tabs?.style.setProperty('--tab', index);
  $app().querySelectorAll('.ex-tabs__tab').forEach((t, i) => {
    t.classList.toggle('is-active', i === index);
    t.setAttribute('aria-selected', i === index);
  });
  const track = document.getElementById('alpha-track');
  if (track) {
    track.style.transition = animate ? 'transform var(--dur-3) var(--ease-out)' : 'none';
    track.style.transform = `translateX(${_offset(index)})`;
  }
  _syncHeight();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// La piste a la hauteur du panneau actif (évite un grand vide sous les panneaux courts)
function _syncHeight() {
  const panels = $app().querySelectorAll('.ex-swipe__panel');
  panels.forEach((p, i) => { p.style.height = i === _state.tab ? 'auto' : '0px'; p.style.overflow = i === _state.tab ? '' : 'hidden'; });
}

function _bindEvents() {
  $app().querySelectorAll('.ex-tabs__tab').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(parseInt(btn.dataset.tab, 10)));
  });
  $app().querySelectorAll('.alpha-tile').forEach(el => {
    el.addEventListener('click', () => _openLetter(parseInt(el.dataset.idx, 10)));
  });
  $app().querySelectorAll('[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      _state.filter = chip.dataset.filter;
      $app().querySelectorAll('[data-filter]').forEach(c => c.classList.toggle('is-active', c === chip));
      $app().querySelectorAll('.alpha-tile').forEach(tile => {
        const show = _state.filter === 'all' || tile.dataset.type === _state.filter;
        tile.classList.toggle('is-dimmed', !show);
      });
    });
  });
  _bindPlay($app());
  _syncHeight();
  _bindSwipe();
}

function _bindSwipe() {
  const container = document.getElementById('alpha-swipe');
  const track = document.getElementById('alpha-track');
  if (!container || !track) return;
  let startX = 0, startY = 0, dragging = false, horizontal = null;

  container.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    dragging = true; horizontal = null;
    // Pendant le glissement, les panneaux voisins prennent la hauteur du panneau actif
    const panels = $app().querySelectorAll('.ex-swipe__panel');
    const h = panels[_state.tab]?.offsetHeight || 0;
    panels.forEach((p, i) => { if (i !== _state.tab) p.style.height = `${h}px`; });
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (horizontal) {
      e.preventDefault();
      // Résistance aux extrémités
      const atEdge = (_state.tab === 0 && dx > 0) || (_state.tab === TABS.length - 1 && dx < 0);
      track.style.transition = 'none';
      track.style.transform = `translateX(calc(${_offset(_state.tab)} + ${atEdge ? dx * 0.3 : dx}px))`;
    }
  }, { passive: false });

  container.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    if (!horizontal) { _syncHeight(); return; }
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -70 && _state.tab < TABS.length - 1) _switchTab(_state.tab + 1);
    else if (dx > 70 && _state.tab > 0) _switchTab(_state.tab - 1);
    else _switchTab(_state.tab);
  }, { passive: true });
}
