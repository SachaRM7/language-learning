// js/pages/coran-home.js — Accueil du Coran : progression de mémorisation et de compréhension, liste des sourates

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { progressBar } from '../ui.js';
import { accountReady } from '../sync.js';
import { ensureAllDecks } from '../decks.js';
import {
  loadQuranIndex, loadSurah, learningOrder, knownLemmas, comprehension,
  memorizedVerses, dueVerses, cachedFr, fetchFr,
} from '../quran.js';

const $app = () => document.getElementById('app');
let _bgRunning = false;

export async function renderCoranHome() {
  const course = store.get('currentCourse');
  await ensureAllDecks();
  const index = await loadQuranIndex();
  const surahs = learningOrder(index.surahs);
  const [known, memorized, due, loaded] = await Promise.all([
    knownLemmas(course.id),
    memorizedVerses(),
    dueVerses(),
    Promise.all(surahs.map(s => loadSurah(s.id))),
  ]);
  const byId = new Map(loaded.map(s => [s.id, s]));

  const totalVerses = surahs.reduce((n, s) => n + s.verses, 0);
  const allLemmas = new Set(loaded.flatMap(s => s.verses.flatMap(v => v.w.map(w => w.l)).filter(Boolean)));
  const knownInScope = [...allLemmas].filter(l => known.has(l)).length;
  let words = 0, ok = 0;
  loaded.forEach(s => s.verses.forEach(v => v.w.forEach(w => { words++; if (w.l && known.has(w.l)) ok++; })));
  const globalComp = words ? Math.round((ok / words) * 100) : 0;

  const next = nextTarget(surahs, byId, memorized);

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
            <div class="qh-hero__sub">${escapeHtml(next.surah.nameFr)} · ${next.surah.verses.length} versets</div>
            <div class="qh-hero__actions">
              <button class="btn btn--gold btn--lg" data-navigate="/coran/${next.surah.id}/hifz">${icon('play')} Mémoriser</button>
              <button class="qh-hero__read" data-navigate="/coran/${next.surah.id}" aria-label="Lire la sourate">${icon('book-open')}</button>
            </div>` : `
            <div class="qh-hero__title">Mā shāʾ Allāh, tout est mémorisé !</div>
            <div class="qh-hero__sub">Entretiens tes versets avec la murājaʿa.</div>`}
          <div class="qh-stats">
            <div><b>${memorized.size}</b><span>/ ${totalVerses} versets</span></div>
            <div><b>${knownInScope}</b><span>/ ${allLemmas.size} mots</span></div>
            <div><b>${globalComp}%</b><span>compris</span></div>
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

        <div class="qh-gloss" id="qh-gloss" hidden></div>

        <section class="section">
          <div class="section__head">
            <h2 class="section__title">Sourates</h2>
            <span class="qh-legend"><i class="qh-dot qh-dot--mem"></i> mémorisé <i class="qh-dot qh-dot--comp"></i> compris</span>
          </div>
          <ol class="qh-list">
            ${surahs.map(meta => surahRow(meta, byId.get(meta.id), memorized, known)).join('')}
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

  generateMissingGlosses(surahs);
}

function surahRow(meta, surah, memorized, known) {
  const mem = surah.verses.filter(v => memorized.has(`${meta.id}:${v.n}`)).length;
  const memPct = Math.round((mem / meta.verses) * 100);
  const comp = comprehension(surah, known);
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
          <span class="qh-row__meta">${meta.verses} versets · ${mem ? `${mem} mémorisé${mem > 1 ? 's' : ''} · ` : ''}${comp}% compris</span>
        </span>
        <span class="qh-row__ar" lang="ar">${escapeHtml(meta.nameAr)}</span>
        ${memPct === 100 ? `<span class="qh-row__done">${icon('check')}</span>` : ''}
      </button>
    </li>`;
}

function nextTarget(surahs, byId, memorized) {
  for (const meta of surahs) {
    const s = byId.get(meta.id);
    const v = s.verses.find(x => !memorized.has(`${meta.id}:${x.n}`));
    if (v) return { surah: s, verse: v.n };
  }
  return null;
}

/** Génère en arrière-plan les sens mot à mot en français qui manquent (une fois pour toutes). */
async function generateMissingGlosses(surahs) {
  const account = store.get('account') ?? await accountReady;
  if (_bgRunning || !account?.ai) return;
  const missing = surahs.filter(s => !cachedFr(s.id));
  if (!missing.length) return;
  _bgRunning = true;
  const el = () => document.getElementById('qh-gloss');
  let done = surahs.length - missing.length;
  const show = () => {
    const box = el();
    if (!box) return;
    box.hidden = false;
    box.innerHTML = `${icon('sparkles')}<span>Préparation du sens des mots en français… <b>${done}/${surahs.length}</b></span>${progressBar((done / surahs.length) * 100, 'progress--thin')}`;
  };
  show();
  for (const s of missing) {
    const ok = await fetchFr(s.id);
    if (!ok) break; // IA indisponible : on réessaiera à la prochaine visite
    done++;
    show();
  }
  const box = el();
  if (box) box.hidden = true;
  _bgRunning = false;
}

