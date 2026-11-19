// js/pages/home.js — Accueil : salutation, plan du jour (une seule action évidente), raccourcis, mot du jour

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { db } from '../db.js';
import { icon } from '../icons.js';
import { ring, greeting, animateCount } from '../ui.js';
import { playWord } from '../audio.js';
import { liveStreak, todayXP, last7Days, dayKey, DAILY_GOAL_DEFAULT } from '../activity.js';
import { getParcoursState, getDuePhrases } from '../parcours.js';
import { ensureAllDecks } from '../decks.js';
import { loadQuranIndex, learningOrder, memorizedVerses, dueVerses } from '../quran.js';
import { loadProfile, suggestPassage } from '../pedagogy/engine.js';

const $app = () => document.getElementById('app');

const SHORTCUTS = [
  { id: 'coran',      path: '/coran',         title: 'Coran',      ic: 'book-open', tone: 'gold' },
  { id: 'comprendre', path: '/comprendre',    title: 'Comprendre', ic: 'reader',    tone: 'primary' },
  { id: 'karim',      path: '/tuteur',        title: 'Karim IA',   ic: 'sparkles',  tone: 'violet' },
  { id: 'dialogues',  path: '/conversations', title: 'Dialogues',  ic: 'messages',  tone: 'gold' },
  { id: 'alphabet',   path: '/alphabet',      title: 'Alphabet',   ic: 'languages', tone: 'violet' },
  { id: 'racines',    path: '/racines',       title: 'Racines',    ic: 'sprout',    tone: 'info' },
];

export async function renderHome() {
  const course = store.get('currentCourse');
  if (!course) { navigate('/'); return; }

  const [dueWords, stats, parcours, duePhrases, quranIndex, memorized, dueV, reading] = await Promise.all([
    db.getDueWords(course.id),
    db.getStats(course.id),
    getParcoursState(),
    getDuePhrases(),
    loadQuranIndex().catch(() => null),
    memorizedVerses().catch(() => new Set()),
    dueVerses().catch(() => []),
    loadProfile().then(suggestPassage).catch(() => null),
  ]);
  const dueTotal = dueWords.length + duePhrases.length + dueV.length;
  store.set('dueCount', dueTotal);

  const g = greeting();
  const streak = liveStreak(stats);
  const xp = todayXP(stats);
  const goal = DAILY_GOAL_DEFAULT;
  const quranNext = quranIndex ? nextVerse(quranIndex, memorized) : null;
  const steps = todaySteps({ dueWords: dueWords.length, duePhrases: duePhrases.length, dueVerses: dueV.length, parcours, reading, quranNext, memorized });

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
        ${todayCard(steps, { xp, goal, stats, streak })}
        <section class="section shortcuts-sec">
          <div class="section__head"><h2 class="section__title">Explorer</h2></div>
          <div class="shortcuts">
            ${SHORTCUTS.map(t => shortcut(t, { memorized, reading })).join('')}
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

// ── Plan du jour : une seule action évidente, dans le bon ordre ───────────
function todaySteps({ dueWords, duePhrases, dueVerses, parcours, reading, quranNext, memorized }) {
  const due = dueWords + duePhrases + dueVerses;
  const parts = [
    dueWords ? `${dueWords} mot${dueWords > 1 ? 's' : ''}` : '',
    duePhrases ? `${duePhrases} phrase${duePhrases > 1 ? 's' : ''}` : '',
    dueVerses ? `${dueVerses} verset${dueVerses > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');
  const steps = [{
    id: 'review', ic: 'refresh-cw',
    title: due ? `Réviser ${due} élément${due > 1 ? 's' : ''}` : 'Révisions à jour',
    meta: due ? `${parts} · ~${Math.max(2, Math.round(due / 6))} min` : 'Rien d’autre à revoir aujourd’hui',
    path: '/revision', cta: 'Réviser', done: due === 0,
  }];
  const cur = parcours.current;
  if (cur) {
    const mod = parcours.modules.find(m => m.id === cur.moduleId);
    steps.push({
      id: 'lesson', ic: 'route',
      title: `Leçon : ${cur.titleParts.fr}`, ar: cur.titleParts.ar,
      meta: `Parcours · module ${mod.index + 1} · ${mod.doneCount}/${mod.lessons.length} leçons`,
      path: `/parcours/lecon/${cur.id}`, cta: parcours.completed > 0 ? 'Continuer la leçon' : 'Commencer le parcours',
    });
  }
  if (reading) {
    steps.push({
      id: 'read', ic: 'reader',
      title: `Lire : ${reading.passage.title}`,
      meta: `Comprendre · ${{ ready_now: 'prêt à lire', syntax_to_discover: 'une construction à découvrir', prepare_first: 'séance guidée' }[reading.readiness.status]}`,
      path: `/comprendre/${encodeURIComponent(reading.passage.id)}`, cta: 'Lire le texte',
    });
  }
  if (quranNext) {
    steps.push({
      id: 'quran', ic: 'book-open',
      title: `Mémoriser ${quranNext.s.name} · verset ${quranNext.v}`,
      meta: memorized.size ? `Coran · ${memorized.size} verset${memorized.size > 1 ? 's' : ''} mémorisé${memorized.size > 1 ? 's' : ''}` : 'Coran · ton premier verset',
      path: `/coran/${quranNext.s.id}/hifz`, cta: 'Mémoriser',
    });
  }
  return steps;
}

function todayCard(steps, { xp, goal, stats, streak }) {
  const current = steps.find(s => !s.done) || steps[0];
  const pct = Math.min(100, (xp / goal) * 100);
  const reached = xp >= goal;
  const week = last7Days(stats);
  const hadActivity = week.some(d => d.xp > 0);
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return `
    <section class="today">
      <div class="today__head">
        <div>
          <div class="today__eyebrow">${icon('calendar')} Aujourd’hui · ${escapeHtml(date)}</div>
          <div class="today__title">${reached ? 'Objectif atteint, bravo !' : 'Ton plan du jour'}</div>
        </div>
        <div class="today__ring" title="Objectif du jour">
          ${ring(pct, { size: 58, stroke: 6, label: reached ? '✓' : `${Math.round(pct)}%`, color: reached ? 'var(--success)' : '' })}
          <span><strong data-xp>0</strong>/${goal} XP</span>
        </div>
      </div>

      <ol class="today__steps">
        ${steps.map(s => `
          <li>
            <button class="today-step pressable ${s.done ? 'is-done' : ''} ${s === current ? 'is-current' : ''}" data-navigate="${s.path}">
              <span class="today-step__icon">${icon(s.done ? 'check' : s.ic)}</span>
              <span class="today-step__body">
                <span class="today-step__title">${escapeHtml(s.title)}</span>
                <span class="today-step__meta">${escapeHtml(s.meta)}</span>
              </span>
              ${s.ar && s === current ? `<span class="today-step__ar" lang="ar">${escapeHtml(s.ar)}</span>` : `<span class="today-step__chev">${icon('chevron-right')}</span>`}
            </button>
          </li>`).join('')}
      </ol>

      <button class="btn btn--primary btn--lg btn--block today__cta" data-navigate="${current.path}">${icon('play')} ${escapeHtml(current.cta)}</button>

      <div class="today__week">
        <div class="week" aria-label="Activité des 7 derniers jours">
          ${week.map(d => `
            <div class="week__day ${d.xp > 0 ? 'is-active' : ''} ${d.isToday ? 'is-today' : ''}" title="${d.key} · ${d.xp} XP">
              <span class="week__dot">${d.xp > 0 ? icon('check') : ''}</span>
              <span class="week__label">${d.label}</span>
            </div>`).join('')}
        </div>
        <p class="today__streak">${streak > 0
          ? `🔥 Série de ${streak} jour${streak > 1 ? 's' : ''}${xp > 0 ? '' : ' · réponds à une question pour la prolonger'}`
          : hadActivity ? 'Série interrompue hier : elle repart dès ta première réponse aujourd’hui.' : 'Une réponse par jour suffit à lancer ta série.'}</p>
      </div>
    </section>`;
}

function nextVerse(index, memorized) {
  for (const s of learningOrder(index.surahs)) {
    for (let v = 1; v <= s.verses; v++) if (!memorized.has(`${s.id}:${v}`)) return { s, v };
  }
  return null;
}

function shortcut(t, { memorized, reading }) {
  const meta = {
    coran: memorized.size ? `${memorized.size} verset${memorized.size > 1 ? 's' : ''}` : 'Mémoriser',
    comprendre: reading ? 'Lecture guidée' : 'Textes',
    karim: 'Tuteur IA',
    dialogues: 'Situations',
    alphabet: '28 lettres',
    racines: 'Familles',
  }[t.id];
  return `
    <button class="shortcut shortcut--${t.tone} pressable" data-navigate="${t.path}">
      <span class="shortcut__icon">${icon(t.ic)}</span>
      <span class="shortcut__title">${t.title}</span>
      <span class="shortcut__meta">${meta}</span>
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
