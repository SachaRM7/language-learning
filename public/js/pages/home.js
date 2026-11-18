// js/pages/home.js — Accueil : salutation, série, objectif du jour, reprise du parcours, exploration, mot du jour

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { db } from '../db.js';
import { icon } from '../icons.js';
import { ring, progressBar, greeting, animateCount } from '../ui.js';
import { playWord } from '../audio.js';
import { liveStreak, todayXP, last7Days, dayKey, DAILY_GOAL_DEFAULT } from '../activity.js';
import { getParcoursState, getDuePhrases } from '../parcours.js';
import { ensureAllDecks } from '../decks.js';
import { loadQuranIndex, learningOrder, memorizedVerses, dueVerses } from '../quran.js';

const $app = () => document.getElementById('app');

const EXPLORE = [
  { path: '/mots',          title: 'Vocabulaire', desc: '767 mots · 94 listes', glyph: 'ك', ic: 'layers',   tone: 'primary' },
  { path: '/conversations', title: 'Dialogues',   desc: 'Situations réelles',    glyph: 'ح', ic: 'messages', tone: 'gold' },
  { path: '/alphabet',      title: 'Alphabet',    desc: '28 lettres & voyelles', glyph: 'أ', ic: 'languages', tone: 'violet' },
  { path: '/racines',       title: 'Racines',     desc: 'Familles de mots',      glyph: 'ج', ic: 'sprout',   tone: 'info' },
];

export async function renderHome() {
  const course = store.get('currentCourse');
  if (!course) { navigate('/'); return; }

  const [dueWords, stats, parcours, duePhrases, quranIndex, memorized, dueV] = await Promise.all([
    db.getDueWords(course.id),
    db.getStats(course.id),
    getParcoursState(),
    getDuePhrases(),
    loadQuranIndex().catch(() => null),
    memorizedVerses().catch(() => new Set()),
    dueVerses().catch(() => []),
  ]);
  const dueTotal = dueWords.length + duePhrases.length + dueV.length;
  store.set('dueCount', dueTotal);

  const g = greeting();
  const streak = liveStreak(stats);
  const xp = todayXP(stats);
  const goal = DAILY_GOAL_DEFAULT;

  $app().innerHTML = `
    <header class="home-top">
      <div class="home-top__greet">
        <div class="home-top__hello">${g.fr} <span class="home-top__wave">👋</span></div>
        <div class="home-top__ar" lang="ar" title="${escapeHtml(g.tr)}">${g.ar}</div>
      </div>
      <div class="home-top__right">
        <span class="streak-pill ${streak > 0 ? 'is-on' : 'is-off'}" title="Série de jours">
          <span class="streak-pill__flame">🔥</span>${streak}
        </span>
        <button class="icon-btn" data-navigate="/profil" aria-label="Profil et réglages">${icon('user')}</button>
      </div>
    </header>

    <main class="page-content page-content--nav home">
      <div class="stagger">
        ${heroCard(parcours)}
        ${goalCard(xp, goal, stats)}
        ${dueTotal > 0 ? reviewCard(dueWords.length, duePhrases.length, dueV.length) : ''}
        ${quranIndex ? quranCard(quranIndex, memorized) : ''}
        ${tutorCard()}
        ${readCard()}
        <section class="section">
          <div class="section__head"><h2 class="section__title">Explorer</h2></div>
          <div class="bento">
            ${EXPLORE.map(exploreTile).join('')}
          </div>
        </section>
        <section class="section" id="wotd-slot">
          <div class="section__head"><h2 class="section__title">Mot du jour</h2></div>
          <div class="wotd card"><div class="skeleton" style="height:120px"></div></div>
        </section>
      </div>
    </main>
    ${renderBottomNav('home')}
  `;

  const xpEl = $app().querySelector('[data-xp]');
  if (xpEl) animateCount(xpEl, xp);
  loadWordOfTheDay(course);
}

// ── Carte « Continue ton parcours » ───────────────────────────────
function heroCard(p) {
  const cur = p.current;
  if (!cur) {
    return `
      <section class="hero hero--done pressable" data-navigate="/parcours">
        <div class="hero__eyebrow">${icon('trophy')} Parcours terminé</div>
        <div class="hero__title">Bravo, tu as fini tous les modules !</div>
        <div class="hero__sub">Révise tes phrases pour les garder en mémoire.</div>
      </section>`;
  }
  const mod = p.modules.find(m => m.id === cur.moduleId);
  const { ar, fr } = cur.titleParts;
  const started = p.completed > 0;
  return `
    <section class="hero" style="--m-tint:${mod.tint.tint}">
      <div class="hero__glyph" aria-hidden="true">${escapeHtml((ar || 'ع').replace(/[ً-ٰٟ]/g, '').trim().charAt(0) || 'ع')}</div>
      <div class="hero__eyebrow">${icon('route')} ${started ? 'Continue ton parcours' : 'Commence ton parcours'} · Module ${mod.index + 1}</div>
      ${ar ? `<div class="hero__ar" lang="ar">${escapeHtml(ar)}</div>` : ''}
      <div class="hero__title">${escapeHtml(fr)}</div>
      <div class="hero__sub">${escapeHtml(cur.objective || mod.description)}</div>
      <div class="hero__progress">
        ${progressBar(mod.pct, 'progress--thin')}
        <span>${mod.doneCount}/${mod.lessons.length}</span>
      </div>
      <div class="hero__actions">
        <button class="btn btn--gold btn--lg hero__cta" data-navigate="/parcours/lecon/${escapeHtml(cur.id)}">
          ${icon('play')} ${started ? 'Continuer' : 'Commencer'}
        </button>
        <button class="hero__map" data-navigate="/parcours" aria-label="Voir tout le parcours">${icon('route')}</button>
      </div>
    </section>`;
}

// ── Objectif du jour + semaine ────────────────────────────────────
function goalCard(xp, goal, stats) {
  const pct = Math.min(100, (xp / goal) * 100);
  const reached = xp >= goal;
  const week = last7Days(stats);
  return `
    <section class="goal card">
      <div class="goal__ring">${ring(pct, { size: 64, stroke: 7, label: reached ? '✓' : `${Math.round(pct)}%`, color: reached ? 'var(--success)' : '' })}</div>
      <div class="goal__body">
        <div class="goal__title">${reached ? 'Objectif atteint !' : 'Objectif du jour'}</div>
        <div class="goal__meta"><strong data-xp>0</strong> / ${goal} XP</div>
        <div class="week" aria-label="Activité des 7 derniers jours">
          ${week.map(d => `
            <div class="week__day ${d.xp > 0 ? 'is-active' : ''} ${d.isToday ? 'is-today' : ''}" title="${d.key} · ${d.xp} XP">
              <span class="week__dot">${d.xp > 0 ? icon('check') : ''}</span>
              <span class="week__label">${d.label}</span>
            </div>`).join('')}
        </div>
      </div>
    </section>`;
}

function quranCard(index, memorized) {
  const surahs = learningOrder(index.surahs);
  const total = surahs.reduce((n, s) => n + s.verses, 0);
  let next = null;
  for (const s of surahs) {
    for (let v = 1; v <= s.verses; v++) {
      if (!memorized.has(`${s.id}:${v}`)) { next = { s, v }; break; }
    }
    if (next) break;
  }
  return `
    <button class="quran-card pressable" data-navigate="${next ? `/coran/${next.s.id}/hifz` : '/coran'}">
      <span class="quran-card__ar" lang="ar">${next ? next.s.nameAr : 'القُرْآن'}</span>
      <span class="quran-card__body">
        <span class="quran-card__eyebrow">${icon('book-open')} Coran · ${memorized.size}/${total} versets</span>
        <span class="quran-card__title">${next ? `${next.s.name} · verset ${next.v}` : 'Tout est mémorisé'}</span>
        <span class="quran-card__meta">Chaque verset mémorisé ajoute ses mots à tes révisions</span>
      </span>
      <span class="ai-card__go">${icon('arrow-right')}</span>
    </button>`;
}

function reviewCard(words, phrases, verses = 0) {
  const total = words + phrases + verses;
  const parts = [words ? `${words} mot${words > 1 ? 's' : ''}` : '', phrases ? `${phrases} phrase${phrases > 1 ? 's' : ''}` : '', verses ? `${verses} verset${verses > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  return `
    <button class="row review-row pressable" data-navigate="/revision">
      <span class="row__icon">${icon('refresh-cw')}</span>
      <span class="row__body">
        <span class="row__title">${total} élément${total > 1 ? 's' : ''} à réviser</span>
        <span class="row__meta">${parts} · quelques minutes suffisent</span>
      </span>
      <span class="row__chev">${icon('chevron-right')}</span>
    </button>`;
}

function readCard() {
  return `
    <button class="ai-card read-card pressable" data-navigate="/comprendre">
      <span class="ai-card__avatar" lang="ar">فـ<span class="ai-card__spark">${icon('lightbulb')}</span></span>
      <span class="ai-card__body">
        <span class="ai-card__title">Comprendre un texte</span>
        <span class="ai-card__meta">Lecture guidée · l’app repère ce qui te bloque</span>
      </span>
      <span class="ai-card__go">${icon('arrow-right')}</span>
    </button>`;
}

function tutorCard() {
  return `
    <button class="ai-card pressable" data-navigate="/tuteur">
      <span class="ai-card__avatar">ك<span class="ai-card__spark">${icon('sparkles')}</span></span>
      <span class="ai-card__body">
        <span class="ai-card__title">Discute avec Karim</span>
        <span class="ai-card__meta">Tuteur IA · conversation libre, corrections</span>
      </span>
      <span class="ai-card__go">${icon('arrow-right')}</span>
    </button>`;
}

function exploreTile(t) {
  return `
    <button class="bento__tile bento__tile--${t.tone} pressable" data-navigate="${t.path}">
      <span class="bento__glyph" aria-hidden="true">${t.glyph}</span>
      <span class="bento__icon">${icon(t.ic)}</span>
      <span class="bento__title">${t.title}</span>
      <span class="bento__desc">${t.desc}</span>
    </button>`;
}

// ── Mot du jour ───────────────────────────────────────────────────
async function loadWordOfTheDay(course) {
  try {
    const decks = await ensureAllDecks();
    const pool = decks.filter(d => !d.source).flatMap(d => d.cards.map(c => ({ ...c, deck: d })));
    if (!pool.length) return;
    const seed = [...dayKey()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const card = pool[seed % pool.length];
    const themes = store.get('themes') || [];
    const theme = themes.find(t => t.decks.includes(card.deck.id));
    const slot = document.querySelector('#wotd-slot .wotd');
    if (!slot) return;
    slot.innerHTML = `
      <div class="wotd__top">
        <span class="badge badge--primary">${escapeHtml(card.deck.name)}</span>
        <button class="audio-btn" id="wotd-audio" aria-label="Écouter">${icon('volume-2')}</button>
      </div>
      <div class="wotd__main">
        ${card.emoji ? `<div class="wotd__emoji">${card.emoji}</div>` : ''}
        <div class="wotd__words">
          <div class="wotd__ar" lang="ar">${escapeHtml(card.front)}</div>
          ${card.translit ? `<div class="wotd__tr">${escapeHtml(card.translit)}</div>` : ''}
          <div class="wotd__fr">${escapeHtml(card.back)}</div>
        </div>
      </div>
      ${theme ? `<button class="wotd__link" data-navigate="/mots/${escapeHtml(theme.id)}/${escapeHtml(card.deck.id)}">Réviser ce thème ${icon('arrow-right')}</button>` : ''}`;
    const btn = document.getElementById('wotd-audio');
    btn?.addEventListener('click', async () => {
      btn.classList.add('is-playing');
      await playWord(card.front, course.config.frontLang);
      btn.classList.remove('is-playing');
    });
  } catch {
    document.getElementById('wotd-slot')?.remove();
  }
}

// Conservé pour compatibilité (sélection de cours, non routée actuellement)
export function renderCourseSelect() { navigate('/home'); }
