// js/pages/coran-surah.js — Une sourate : lecture mot à mot (chaque mot ouvre sa fiche), récitation synchronisée
// (récitateurs, vitesses, tajwid, répétition, boucle), vocabulaire, accès à la mémorisation

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { db } from '../db.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { ring, haptic } from '../ui.js';
import { ensureAllDecks } from '../decks.js';
import { openWordSheet } from '../components/quran-sheets.js';
import { createSurahPlayer } from '../components/quran-player.js';
import { getTajweed, runsToHtml } from '../quran/recitation.js';
import { getPlayerPrefs, fontSizeOf } from '../quran/player-prefs.js';
import {
  loadSurah, loadLexicon, knownLemmas, comprehension, memorizedVerses, cachedFr, fetchFr,
  lemmaMeaning, lemmaCardId, translitAr,
} from '../quran.js';

const $app = () => document.getElementById('app');
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
let S = null;

export async function renderCoranSurah({ n, v }) {
  const id = Number(n);
  const course = store.get('currentCourse');
  let surah;
  try { surah = await loadSurah(id); } catch { navigate('/coran'); return; }
  await ensureAllDecks();
  const [known, memorized, lexicon, srs] = await Promise.all([
    knownLemmas(course.id), memorizedVerses(), loadLexicon(), db.getSRS(course.id),
  ]);
  S?.player?.destroy();
  const previous = S?.surah?.id === id ? S : null;
  S = {
    surah, known, memorized, lexicon,
    tajweed: previous?.tajweed || null,
    srsMap: Object.fromEntries(srs.map(e => [e.cardId, e])),
    tab: S?.surah?.id === id ? S.tab : 'read',
    showFr: S?.showFr ?? true,
    showKnown: S?.showKnown ?? true,
    fr: cachedFr(id),
  };
  S.player = createSurahPlayer(surah, {
    container: () => document.querySelector('.qs-verses'),
    onDisplayChange: (prefs, changed) => {
      if (changed.includes('tajweed') && prefs.tajweed) loadTajweed();
      if (S.tab === 'read') { renderTab(); S.player.refresh(); }
    },
  });
  const target = Number(v) - 1;
  if (target >= 0 && target < surah.verses.length) S.player.cue(target);
  render();
  if (getPlayerPrefs().tajweed) loadTajweed();
  if (target >= 0) setTimeout(() => document.getElementById(`v-${target + 1}`)?.scrollIntoView({ block: 'center' }), 120);
  if (!S.fr) {
    fetchFr(id).then(fr => { if (fr && S?.surah.id === id) { S.fr = fr; if (S.tab === 'vocab') renderTab(); } });
  }
}

function render() {
  const { surah, memorized, known } = S;
  const mem = surah.verses.filter(v => memorized.has(`${surah.id}:${v.n}`)).length;
  const lastGroup = surah.verses.findLast(v => v.n % 3 === 0 &&
    [v.n - 2, v.n - 1, v.n].every(n => memorized.has(`${surah.id}:${n}`)));
  const comp = comprehension(surah, known);
  const place = surah.place === 'makkah' ? 'Mecquoise' : 'Médinoise';

  $app().innerHTML = `
    ${renderHeader({ title: surah.name, back: '/coran', actions: [{ id: 'player-settings', icon: 'settings', label: 'Réglages de la récitation' }] })}
    <main class="page-content page-content--nav qs-page">
      <section class="qs-hero">
        <div class="qs-hero__num">${surah.id}</div>
        <div class="qs-hero__ar" lang="ar">${escapeHtml(surah.nameAr)}</div>
        <div class="qs-hero__name">${escapeHtml(surah.name)} · ${escapeHtml(surah.nameFr)}</div>
        <div class="qs-hero__meta">${place} · ${surah.verses.length} versets</div>
        <div class="qs-hero__rings">
          <div class="qs-ring">${ring((mem / surah.verses.length) * 100, { size: 58, stroke: 6, label: `${mem}/${surah.verses.length}` })}<span>mémorisés</span></div>
          <div class="qs-ring qs-ring--gold">${ring(comp, { size: 58, stroke: 6, label: `${comp}%`, color: 'var(--gold)' })}<span>des mots reconnus</span></div>
        </div>
        <div class="qs-hero__actions">
          <button class="btn btn--primary btn--lg" data-navigate="/coran/${surah.id}/hifz">${icon('play')} ${mem === surah.verses.length ? 'Revoir' : mem ? 'Continuer' : 'Mémoriser'}</button>
          ${mem === surah.verses.length ? `<button class="btn btn--secondary btn--lg" data-navigate="/coran/${surah.id}/reciter/1/${mem}">Réciter toute la sourate</button>`
            : lastGroup ? `<button class="btn btn--secondary btn--lg" data-navigate="/coran/${surah.id}/reciter/${lastGroup.n - 2}/${lastGroup.n}">Réciter les versets ${lastGroup.n - 2} à ${lastGroup.n}</button>` : ''}
          <button class="btn btn--secondary btn--lg" id="qs-listen">${icon('headphones')} Écouter</button>
        </div>
        ${S.player.barHtml()}
      </section>

      <div class="segmented qs-tabs" role="tablist">
        <button class="${S.tab === 'read' ? 'is-active' : ''}" data-tab="read" role="tab">Lecture</button>
        <button class="${S.tab === 'vocab' ? 'is-active' : ''}" data-tab="vocab" role="tab">Vocabulaire</button>
      </div>
      <div id="qs-tab"></div>
    </main>
    ${renderBottomNav('coran')}`;

  $app().querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    S.tab = b.dataset.tab;
    $app().querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('is-active', x === b));
    haptic();
    renderTab();
  }));
  document.getElementById('qs-listen').addEventListener('click', () => {
    if (S.tab !== 'read') { S.tab = 'read'; $app().querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('is-active', x.dataset.tab === 'read')); renderTab(); }
    S.player.toggle();
  });
  $app().querySelector('[data-action="player-settings"]')?.addEventListener('click', () => S.player.openSettings());
  S.player.bindBar();
  renderTab();
}

/** Texte balisé tajwid (Quran.com), chargé à la demande ; repli silencieux sur le texte de l'app. */
function loadTajweed() {
  if (S.tajweed) return;
  const id = S.surah.id;
  getTajweed(id).then(map => {
    if (S?.surah.id !== id) return;
    S.tajweed = map;
    if (S.tab === 'read' && getPlayerPrefs().tajweed) { renderTab(); S.player.refresh(); }
  }).catch(() => {});
}

function renderTab() {
  const el = document.getElementById('qs-tab');
  if (!el) return;
  el.innerHTML = S.tab === 'read' ? readTab() : vocabTab();
  el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
  S.tab === 'read' ? bindRead(el) : bindVocab(el);
  if (S.tab === 'read') S.player?.refresh();
}

// ── Lecture ──────────────────────────────────────────────────────────

function readTab() {
  const { surah, memorized, known } = S;
  const p = getPlayerPrefs();
  const chip = (key, on, ic, label) => `<button class="chip ${on ? 'is-active' : ''}" data-toggle="${key}">${icon(ic)} ${label}</button>`;
  return `
    <div class="qs-toggles">
      ${chip('fr', S.showFr, 'languages', 'Traduction')}
      ${chip('known', S.showKnown, 'check-circle', 'Mots connus')}
      ${chip('tajweed', p.tajweed, 'sparkles', 'Tajwid')}
      ${chip('translit', p.translit, 'type', 'Phonétique')}
      ${chip('memorize', p.memorize, 'eye-off', 'Masquer')}
      <span class="qs-hint">Touche un mot pour voir son sens et sa racine · ▶ pour écouter à partir d'un verset</span>
    </div>
    ${surah.id !== 1 && surah.id !== 9 ? `<div class="qs-basmala" lang="ar">${BASMALA}</div>` : ''}
    <div class="qs-verses ${S.showFr ? '' : 'hide-fr'} ${S.showKnown ? 'show-known' : ''} ${p.tajweed ? 'show-tajweed' : ''} ${p.translit ? 'show-translit' : ''} ${p.memorize ? 'is-memorize' : ''}" style="--qs-ar-size:${fontSizeOf(p.fontSize)}">
      ${surah.verses.map((v, i) => {
        const tj = p.tajweed && S.tajweed?.get(v.n);
        const runs = tj && tj.length === v.w.length ? tj : null;
        return `
        <article class="qv ${memorized.has(`${surah.id}:${v.n}`) ? 'is-memorized' : ''}" id="v-${v.n}" data-i="${i}">
          <div class="qv__top">
            <span class="qv__num">${v.n}</span>
            ${memorized.has(`${surah.id}:${v.n}`) ? `<span class="badge badge--primary">${icon('check')} mémorisé</span>` : ''}
            <button class="qv__reveal" data-reveal aria-label="Afficher le verset ${v.n}">${icon('eye')}</button>
            <button class="msg__audio qv__audio" data-play="${i}" aria-label="Écouter à partir du verset ${v.n}">${icon('play')}</button>
          </div>
          <p class="qv__ar" lang="ar">${v.w.map((w, j) => `<button class="qw ${w.l && known.has(w.l) ? 'is-known' : ''}" data-v="${v.n}" data-j="${j}"><span class="qw__ar">${runs ? runsToHtml(runs[j]) : escapeHtml(w.t)}</span><span class="qw__tr">${escapeHtml(w.tr || '')}</span></button>`).join(' ')}<span class="qv__end">\u06DD${arabicNum(v.n)}</span></p>
          <p class="qv__fr">${escapeHtml(v.fr)}</p>
        </article>`;
      }).join('')}
    </div>`;
}

function bindRead(el) {
  el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.toggle;
    haptic();
    if (key === 'fr') { S.showFr = !S.showFr; renderTab(); return; }
    if (key === 'known') { S.showKnown = !S.showKnown; renderTab(); return; }
    const prefs = getPlayerPrefs();
    S.player.apply?.({ [key]: !prefs[key] });
  }));
  el.querySelectorAll('.qw').forEach(b => b.addEventListener('click', () => {
    const verse = S.surah.verses.find(v => v.n === Number(b.dataset.v));
    const i = S.surah.verses.indexOf(verse);
    const j = Number(b.dataset.j);
    haptic();
    if (S.player.isPlaying()) S.player.pause();
    openWordSheet({ surahId: S.surah.id, verse, j, onPlayFrom: () => S.player.playFrom(i, j) });
  }));
  el.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.play);
    if (S.player.index === i && S.player.isPlaying()) S.player.pause();
    else S.player.playFrom(i);
  }));
  el.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => {
    b.closest('.qv').classList.toggle('is-revealed');
  }));
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
