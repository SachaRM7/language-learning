// js/pages/coran-home.js — Accueil du Coran : progression de mémorisation et de compréhension, liste des sourates

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { progressBar } from '../ui.js';
import { ensureAllDecks } from '../decks.js';
import {
  loadQuranIndex, learningOrder, knownLemmas, comprehension,
  memorizedVerses, dueVerses,
} from '../quran.js';

const $app = () => document.getElementById('app');

export async function renderCoranHome() {
  const course = store.get('currentCourse');
  await ensureAllDecks();
  const index = await loadQuranIndex();
  const surahs = learningOrder(index.surahs);
  const [known, memorized, due] = await Promise.all([
    knownLemmas(course.id),
    memorizedVerses(),
    dueVerses(),
  ]);

  const allLemmas = new Set(surahs.flatMap(s => Object.keys(s.lemmaCounts)));
  const knownInScope = [...allLemmas].filter(l => known.has(l)).length;
  let words = 0, ok = 0;
  for (const s of surahs) {
    words += s.words;
    for (const [lemma, count] of Object.entries(s.lemmaCounts)) if (known.has(lemma)) ok += count;
  }
  const globalComp = words ? Math.round((ok / words) * 100) : 0;

  const next = nextTarget(surahs, memorized);

  $app().innerHTML = `
    ${renderHeader({ title: 'Coran', large: true, eyebrow: 'Mémoriser & comprendre', titleAr: 'القُرْآن' })}
    <main class="page-content page-content--nav coran-home">
      <div class="stagger">
        <section class="qh-hero">
          <div class="qh-hero__pattern" aria-hidden="true"></div>
          <div class="qh-hero__eyebrow">${icon('book-open')} ${memorized.size ? 'Continue ta mémorisation' : 'Commence ta mémorisation'}</div>
          ${next ? `
            <div class="qh-hero__ar" lang="ar">${escapeHtml(next.surah.nameAr)}</div>
            <div class="qh-hero__title">${escapeHtml(next.surah.name)} <span>· verset ${next.verse}</span></div>
            <div class="qh-hero__sub">${escapeHtml(next.surah.nameFr)} · ${next.surah.verses} versets</div>
            <div class="qh-hero__actions">
              <button class="btn btn--gold btn--lg" data-navigate="/coran/${next.surah.id}/hifz">${icon('play')} Mémoriser</button>
              <button class="qh-hero__read" data-navigate="/coran/${next.surah.id}" aria-label="Lire la sourate">${icon('book-open')}</button>
            </div>` : `
            <div class="qh-hero__title">Mā shāʾ Allāh, tout est mémorisé !</div>
            <div class="qh-hero__sub">Entretiens tes versets avec la murājaʿa.</div>`}
          <div class="qh-stats">
            <div><b>${memorized.size}</b><span>verset${memorized.size > 1 ? 's' : ''} mémorisé${memorized.size > 1 ? 's' : ''}</span></div>
            <div><b>${knownInScope}</b><span>mot${knownInScope > 1 ? 's' : ''} connu${knownInScope > 1 ? 's' : ''}</span></div>
            <div><b>${globalComp}%</b><span>mots reconnus</span></div>
          </div>
        </section>

        ${due.length ? `
          <button class="row pressable qh-due" data-navigate="/coran/muraja">
            <span class="row__icon">${icon('refresh-cw')}</span>
            <span class="row__body">
              <span class="row__title">${due.length} verset${due.length > 1 ? 's' : ''} à réciter</span>
              <span class="row__meta">Murājaʿa · garder ce que tu as appris</span>
            </span>
            <span class="row__chev">${icon('chevron-right')}</span>
          </button>` : ''}


        <button class="row pressable tj-entry" data-navigate="/tajwid">
          <span class="row__icon">${icon('mic')}</span>
          <span class="row__body">
            <span class="row__title">Apprendre le tajwid</span>
            <span class="row__meta">6 niveaux, des voyelles aux règles avancées · exemples récités</span>
          </span>
          <span class="row__chev">${icon('chevron-right')}</span>
        </button>

        <button class="row pressable cp-entry" data-navigate="/comprendre">
          <span class="row__icon">${icon('reader')}</span>
          <span class="row__body">
            <span class="row__title">Comprendre un extrait</span>
            <span class="row__meta">Lecture guidée de Quraysh et Al-Ikhlāṣ, mot par mot</span>
          </span>
          <span class="row__chev">${icon('chevron-right')}</span>
        </button>

        <section class="section">
          <div class="section__head">
            <h2 class="section__title">Sourates</h2>
            <span class="qh-legend"><i class="qh-dot qh-dot--mem"></i> mémorisé <i class="qh-dot qh-dot--comp"></i> mots reconnus</span>
          </div>
          <ol class="qh-list">
            ${surahs.map(meta => surahRow(meta, memorized, known)).join('')}
          </ol>
        </section>

        <footer class="qh-sources">
          <div class="qh-sources__title">${icon('info')} Sources</div>
          ${Object.values(index.sources).map(s => `<p>${escapeHtml(s)}</p>`).join('')}
          <p>Sens mot à mot en français : généré par IA à partir de la glose anglaise et de la traduction, à titre d'aide.</p>
        </footer>
      </div>
    </main>
    ${renderBottomNav('coran')}`;
}

function surahRow(meta, memorized, known) {
  const mem = Array.from({ length: meta.verses }, (_, i) => i + 1).filter(n => memorized.has(`${meta.id}:${n}`)).length;
  const memPct = Math.round((mem / meta.verses) * 100);
  const comp = comprehension(meta, known);
  return `
    <li>
      <button class="qh-row pressable" data-navigate="/coran/${meta.id}">
        <span class="qh-row__num">${meta.id}</span>
        <span class="qh-row__body">
          <span class="qh-row__name">${escapeHtml(meta.name)} <span class="qh-row__fr">· ${escapeHtml(meta.nameFr)}</span></span>
          <span class="qh-row__bars">
            ${progressBar(memPct, 'progress--thin qh-bar--mem')}
            ${progressBar(comp, 'progress--thin progress--gold qh-bar--comp')}
          </span>
          <span class="qh-row__meta">${meta.verses} versets · ${mem ? `${mem} mémorisé${mem > 1 ? 's' : ''} · ` : ''}${comp}% des mots reconnus</span>
        </span>
        <span class="qh-row__ar" lang="ar">${escapeHtml(meta.nameAr)}</span>
        ${memPct === 100 ? `<span class="qh-row__done">${icon('check')}</span>` : ''}
      </button>
    </li>`;
}

function nextTarget(surahs, memorized) {
  for (const meta of surahs) {
    for (let n = 1; n <= meta.verses; n++) {
      if (!memorized.has(`${meta.id}:${n}`)) return { surah: meta, verse: n };
    }
  }
  return null;
}

