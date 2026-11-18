// js/pages/quran-home.js — Coran : liste des sourates, reprise de lecture, accès Tajwid

import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml, removeHarakats, removeFrenchAccents } from '../utils.js';
import { getSurahList, reciterLabel } from '../quran/api.js';
import { getQuranPrefs } from '../quran/prefs.js';
import { getTajwidSummary } from './tajwid-home.js';

const $app = () => document.getElementById('app');

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'amma', label: 'Juz ‘Amma' },
  { id: 'mecque', label: 'Mecquoises' },
  { id: 'medine', label: 'Médinoises' },
];

let _state = { surahs: [], query: '', filter: 'all' };

export async function renderQuranHome() {
  _state.surahs = await getSurahList();
  _state.query = '';
  _render();
  // Résumé tajwid chargé après coup (n'empêche pas l'affichage)
  getTajwidSummary().then(summary => {
    const el = document.getElementById('quran-tajwid-progress');
    if (el && summary) {
      el.textContent = `${summary.done} / ${summary.total} leçons · ${summary.levelName}`;
      const bar = document.getElementById('quran-tajwid-bar');
      if (bar) bar.style.width = `${Math.round((summary.done / summary.total) * 100)}%`;
    }
  }).catch(() => {});
}

function _normalize(s) {
  return removeFrenchAccents(removeHarakats(String(s))).toLowerCase().replace(/[‘’'`\-\s]/g, '');
}

function _filtered() {
  const q = _normalize(_state.query.trim());
  return _state.surahs.filter(s => {
    if (_state.filter === 'amma' && s.n < 78) return false;
    if (_state.filter === 'mecque' && s.place !== 'Mecquoise') return false;
    if (_state.filter === 'medine' && s.place !== 'Médinoise') return false;
    if (!q) return true;
    return String(s.n) === q || [s.tr, s.fr, s.ar].some(v => _normalize(v).includes(q));
  });
}

function _listHtml() {
  const list = _filtered();
  if (!list.length) return '<div class="quran-empty">Aucune sourate ne correspond à ta recherche.</div>';
  return list.map(s => `
    <a class="surah-row" href="#/coran/${s.n}" data-navigate="/coran/${s.n}">
      <span class="surah-row__num">${s.n}</span>
      <span class="surah-row__body">
        <span class="surah-row__name">${escapeHtml(s.tr)}</span>
        <span class="surah-row__meta">${escapeHtml(s.fr)} · ${s.ayahs} versets · ${escapeHtml(s.place)}</span>
      </span>
      <span class="surah-row__ar" lang="ar" dir="rtl">${escapeHtml(s.ar)}</span>
    </a>
  `).join('');
}

function _render() {
  const prefs = getQuranPrefs();
  const last = prefs.last && _state.surahs.find(s => s.n === prefs.last.surah);

  $app().innerHTML = `
    ${renderHeader({ title: 'Le Coran', back: '/home' })}
    <main class="page-content page-content--nav quran-home">

      <div class="quran-tajwid-card" data-navigate="/tajwid" role="link" tabindex="0">
        <div class="quran-tajwid-card__icon" lang="ar">تَجْوِيد</div>
        <div class="quran-tajwid-card__body">
          <div class="quran-tajwid-card__title">Apprendre le tajwid</div>
          <div class="quran-tajwid-card__desc" id="quran-tajwid-progress">6 niveaux, des bases aux règles avancées</div>
          <div class="quran-tajwid-card__track"><div class="quran-tajwid-card__bar" id="quran-tajwid-bar"></div></div>
        </div>
        <i data-feather="chevron-right"></i>
      </div>

      ${last ? `
      <div class="quran-resume" data-navigate="/coran/${last.n}/${prefs.last.ayah}" role="link" tabindex="0">
        <div class="quran-resume__icon"><i data-feather="play"></i></div>
        <div class="quran-resume__body">
          <div class="quran-resume__eyebrow">Reprendre la lecture</div>
          <div class="quran-resume__title">${escapeHtml(last.tr)} · verset ${prefs.last.ayah}</div>
          <div class="quran-resume__meta">${escapeHtml(reciterLabel(prefs.reciter))}</div>
        </div>
        <span class="quran-resume__ar" lang="ar" dir="rtl">${escapeHtml(last.ar)}</span>
      </div>
      ` : ''}

      <div class="quran-search">
        <i data-feather="search"></i>
        <input id="quran-search" type="search" placeholder="Rechercher une sourate (nom, numéro…)" value="${escapeHtml(_state.query)}" autocomplete="off">
      </div>

      <div class="quran-filters" role="tablist">
        ${FILTERS.map(f => `<button class="quran-chip ${f.id === _state.filter ? 'is-active' : ''}" data-filter="${f.id}" role="tab" aria-selected="${f.id === _state.filter}">${f.label}</button>`).join('')}
      </div>

      <div class="surah-list" id="surah-list">${_listHtml()}</div>

      <p class="quran-credits">Texte, minutage et récitations : Quran.com (Quran Foundation). ${escapeHtml('Traduction : Muhammad Hamidullah.')}</p>
    </main>
    ${renderBottomNav('home')}
  `;

  document.getElementById('quran-search').addEventListener('input', e => {
    _state.query = e.target.value;
    document.getElementById('surah-list').innerHTML = _listHtml();
  });

  $app().querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      _state.filter = btn.dataset.filter;
      $app().querySelectorAll('[data-filter]').forEach(b => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      document.getElementById('surah-list').innerHTML = _listHtml();
    });
  });

  $app().querySelectorAll('[role="link"][data-navigate]').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(el.dataset.navigate); });
  });

  feather.replace();
}
