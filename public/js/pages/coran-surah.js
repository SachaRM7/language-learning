// js/pages/coran-surah.js — Une sourate : lecture mot à mot (chaque mot ouvre sa fiche), vocabulaire, accès à la mémorisation

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { db } from '../db.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { ring, haptic } from '../ui.js';
import { ensureAllDecks } from '../decks.js';
import { openWordSheet } from '../components/quran-sheets.js';
import { playUrl, playSequence, stopAudio } from '../components/quran-audio.js';
import {
  loadSurah, loadLexicon, knownLemmas, comprehension, memorizedVerses, cachedFr, fetchFr,
  lemmaMeaning, lemmaCardId, translitAr, AUDIO_VERSE,
} from '../quran.js';

const $app = () => document.getElementById('app');
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
let S = null;

export async function renderCoranSurah({ n }) {
  const id = Number(n);
  const course = store.get('currentCourse');
  let surah;
  try { surah = await loadSurah(id); } catch { navigate('/coran'); return; }
  await ensureAllDecks();
  const [known, memorized, lexicon, srs] = await Promise.all([
    knownLemmas(course.id), memorizedVerses(), loadLexicon(), db.getSRS(course.id),
  ]);
  S = {
    surah, known, memorized, lexicon,
    srsMap: Object.fromEntries(srs.map(e => [e.cardId, e])),
    tab: S?.surah?.id === id ? S.tab : 'read',
    showFr: S?.showFr ?? true,
    showKnown: S?.showKnown ?? true,
    fr: cachedFr(id),
  };
  render();
  if (!S.fr) {
    fetchFr(id).then(fr => { if (fr && S?.surah.id === id) { S.fr = fr; if (S.tab === 'vocab') renderTab(); } });
  }
}

function render() {
  const { surah, memorized, known } = S;
  const mem = surah.verses.filter(v => memorized.has(`${surah.id}:${v.n}`)).length;
  const comp = comprehension(surah, known);
  const place = surah.place === 'makkah' ? 'Mecquoise' : 'Médinoise';

  $app().innerHTML = `
    ${renderHeader({ title: surah.name, back: '/coran' })}
    <main class="page-content qs-page">
      <section class="qs-hero">
        <div class="qs-hero__num">${surah.id}</div>
        <div class="qs-hero__ar" lang="ar">${escapeHtml(surah.nameAr)}</div>
        <div class="qs-hero__name">${escapeHtml(surah.name)} · ${escapeHtml(surah.nameFr)}</div>
        <div class="qs-hero__meta">${place} · ${surah.verses.length} versets</div>
        <div class="qs-hero__rings">
          <div class="qs-ring">${ring((mem / surah.verses.length) * 100, { size: 58, stroke: 6, label: `${mem}/${surah.verses.length}` })}<span>mémorisés</span></div>
          <div class="qs-ring qs-ring--gold">${ring(comp, { size: 58, stroke: 6, label: `${comp}%`, color: 'var(--gold)' })}<span>des mots compris</span></div>
        </div>
        <div class="qs-hero__actions">
          <button class="btn btn--primary btn--lg" data-navigate="/coran/${surah.id}/hifz">${icon('play')} ${mem === surah.verses.length ? 'Revoir' : mem ? 'Continuer' : 'Mémoriser'}</button>
          <button class="btn btn--secondary btn--lg" id="qs-listen">${icon('headphones')} Écouter</button>
        </div>
      </section>

      <div class="segmented qs-tabs" role="tablist">
        <button class="${S.tab === 'read' ? 'is-active' : ''}" data-tab="read" role="tab">Lecture</button>
        <button class="${S.tab === 'vocab' ? 'is-active' : ''}" data-tab="vocab" role="tab">Vocabulaire</button>
      </div>
      <div id="qs-tab"></div>
    </main>`;

  $app().querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    S.tab = b.dataset.tab;
    $app().querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('is-active', x === b));
    haptic();
    renderTab();
  }));
  document.getElementById('qs-listen').addEventListener('click', toggleListenAll);
  renderTab();
}

function renderTab() {
  const el = document.getElementById('qs-tab');
  if (!el) return;
  el.innerHTML = S.tab === 'read' ? readTab() : vocabTab();
  el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
  S.tab === 'read' ? bindRead(el) : bindVocab(el);
}

// ── Lecture ──────────────────────────────────────────────────────────

function readTab() {
  const { surah, memorized, known } = S;
  return `
    <div class="qs-toggles">
      <button class="chip ${S.showFr ? 'is-active' : ''}" data-toggle="fr">${icon('languages')} Traduction</button>
      <button class="chip ${S.showKnown ? 'is-active' : ''}" data-toggle="known">${icon('check-circle')} Mots connus</button>
      <span class="qs-hint">Touche un mot pour voir son sens et sa racine</span>
    </div>
    ${surah.id !== 1 && surah.id !== 9 ? `<div class="qs-basmala" lang="ar">${BASMALA}</div>` : ''}
    <div class="qs-verses ${S.showFr ? '' : 'hide-fr'} ${S.showKnown ? 'show-known' : ''}">
      ${surah.verses.map(v => `
        <article class="qv ${memorized.has(`${surah.id}:${v.n}`) ? 'is-memorized' : ''}" id="v-${v.n}">
          <div class="qv__top">
            <span class="qv__num">${v.n}</span>
            ${memorized.has(`${surah.id}:${v.n}`) ? `<span class="badge badge--primary">${icon('check')} mémorisé</span>` : ''}
            <button class="msg__audio qv__audio" data-audio="${escapeHtml(v.audio || '')}" aria-label="Écouter le verset ${v.n}">${icon('volume-2')}</button>
          </div>
          <p class="qv__ar" lang="ar">${v.w.map((w, j) => `<button class="qw ${w.l && known.has(w.l) ? 'is-known' : ''}" data-v="${v.n}" data-j="${j}">${escapeHtml(w.t)}</button>`).join(' ')}<span class="qv__end">\u06DD${arabicNum(v.n)}</span></p>
          <p class="qv__fr">${escapeHtml(v.fr)}</p>
        </article>`).join('')}
    </div>`;
}

function bindRead(el) {
  el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.toggle === 'fr') S.showFr = !S.showFr; else S.showKnown = !S.showKnown;
    renderTab();
  }));
  el.querySelectorAll('.qw').forEach(b => b.addEventListener('click', () => {
    const verse = S.surah.verses.find(v => v.n === Number(b.dataset.v));
    haptic();
    openWordSheet({ surahId: S.surah.id, verse, j: Number(b.dataset.j) });
  }));
  el.querySelectorAll('[data-audio]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.audio) playUrl(AUDIO_VERSE + b.dataset.audio, b);
  }));
}

let _listening = false;
async function toggleListenAll() {
  const btn = document.getElementById('qs-listen');
  if (_listening) { stopAudio(); return; }
  if (S.tab !== 'read') { S.tab = 'read'; render(); }
  _listening = true;
  const b = document.getElementById('qs-listen');
  b.innerHTML = `${icon('pause')} Arrêter`;
  await playSequence(S.surah.verses.map(v => AUDIO_VERSE + v.audio), i => {
    document.querySelectorAll('.qv.is-playing').forEach(x => x.classList.remove('is-playing'));
    if (i >= 0) {
      const el = document.getElementById(`v-${S.surah.verses[i].n}`);
      el?.classList.add('is-playing');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  _listening = false;
  document.querySelectorAll('.qv.is-playing').forEach(x => x.classList.remove('is-playing'));
  const b2 = document.getElementById('qs-listen');
  if (b2) b2.innerHTML = `${icon('headphones')} Écouter`;
  void btn;
}

// ── Vocabulaire ──────────────────────────────────────────────────────

function vocabTab() {
  const { surah, lexicon, known, srsMap } = S;
  const occ = new Map();
  const firstForm = new Map();
  surah.verses.forEach(v => v.w.forEach(w => {
    if (!w.l) return;
    occ.set(w.l, (occ.get(w.l) || 0) + 1);
    if (!firstForm.has(w.l)) firstForm.set(w.l, w);
  }));
  const lemmas = [...occ.keys()].sort((a, b) => (lexicon.lemmas[b]?.[1] || 0) - (lexicon.lemmas[a]?.[1] || 0));
  const knownN = lemmas.filter(l => known.has(l)).length;
  return `
    <div class="qs-vocab-head card">
      <div>
        <div class="qs-vocab-head__title">${lemmas.length} mots dans cette sourate</div>
        <div class="qs-vocab-head__sub">${knownN} déjà connus · classés du plus fréquent au plus rare dans le Coran</div>
      </div>
      <button class="btn btn--primary btn--sm" data-navigate="/mots/coran/coran-${surah.id}">${icon('layers')} Réviser</button>
    </div>
    <ul class="qs-vocab">
      ${lemmas.map(l => {
        const w = firstForm.get(l);
        const [root, count] = lexicon.lemmas[l] || [w.r, null];
        const m = S.fr?.lemmas?.[l] ? { text: S.fr.lemmas[l], lang: 'fr' } : lemmaMeaning(l, lexicon);
        const e = srsMap[lemmaCardId(l)];
        const state = known.has(l) ? 'known' : e ? 'learning' : 'new';
        return `
          <li>
            <button class="qs-word qs-word--${state}" data-lemma="${escapeHtml(l)}">
              <span class="qs-word__dot" title="${state === 'known' ? 'Connu' : state === 'learning' ? 'En révision' : 'Nouveau'}"></span>
              <span class="qs-word__body">
                <span class="qs-word__mean">${escapeHtml(m.text || w.en)}${m.lang === 'en' ? ' <i class="q-en">EN</i>' : ''}</span>
                <span class="qs-word__meta">${escapeHtml(translitAr(l))}${count ? ` · ${count}× dans le Coran` : ''}${occ.get(l) > 1 ? ` · ${occ.get(l)}× ici` : ''}</span>
              </span>
              ${root ? `<span class="q-root q-root--sm" lang="ar" dir="rtl">${[...root].map(c => `<b>${escapeHtml(c)}</b>`).join('')}</span>` : ''}
              <span class="qs-word__ar" lang="ar">${escapeHtml(l)}</span>
            </button>
          </li>`;
      }).join('')}
    </ul>`;
}

function bindVocab(el) {
  el.querySelectorAll('[data-lemma]').forEach(b => b.addEventListener('click', () => {
    // Ouvre la fiche sur la première occurrence du mot dans la sourate
    for (const v of S.surah.verses) {
      const j = v.w.findIndex(w => w.l === b.dataset.lemma);
      if (j >= 0) { openWordSheet({ surahId: S.surah.id, verse: v, j }); return; }
    }
  }));
}

function arabicNum(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}
