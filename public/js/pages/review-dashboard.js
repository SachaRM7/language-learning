// js/pages/review-dashboard.js — Tableau de bord de la révision espacée (Leitner)

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { db } from '../db.js';
import { getBoxDistribution, INTERVALS } from '../srs.js';
import { shuffle } from '../utils.js';
import { icon } from '../icons.js';
import { ring, animateCount, toast, haptic } from '../ui.js';
import { liveStreak, last7Days, todayXP, DAILY_GOAL_DEFAULT } from '../activity.js';
import { loadDueCards } from './review-session.js';
import { dueVerses } from '../quran.js';

const $app = () => document.getElementById('app');

const BOXES = [
  { box: 1, color: 'var(--danger)',  soft: 'var(--danger-soft)' },
  { box: 2, color: 'var(--gold)',    soft: 'var(--gold-soft)' },
  { box: 3, color: 'var(--info)',    soft: 'var(--info-soft)' },
  { box: 4, color: 'var(--primary)', soft: 'var(--primary-soft)' },
  { box: 5, color: 'var(--violet)',  soft: 'var(--violet-soft)' },
];

function intervalLabel(days) {
  return days === 1 ? '1 j' : `${days} j`;
}

export async function renderReviewDashboard() {
  const course = store.get('currentCourse');
  if (!course) { navigate('/'); return; }

  const [srsAll, stats, dueEntries, parcoursDue, versesDue] = await Promise.all([
    db.getSRS(course.id),
    db.getStats(course.id),
    db.getDueWords(course.id),
    db.getDueWords('parcours').catch(() => []),
    dueVerses().catch(() => []),
  ]);

  const dueCount = dueEntries.length;
  store.set('dueCount', dueCount);
  const boxDist = getBoxDistribution(srsAll);
  const total = srsAll.length;
  const acquired = (boxDist[4] || 0) + (boxDist[5] || 0);
  const maxBox = Math.max(...Object.values(boxDist), 1);
  const streak = liveStreak(stats);
  const xpToday = todayXP(stats);
  const goal = DAILY_GOAL_DEFAULT;
  const answers = (stats.totalCorrectAnswers || 0) + (stats.totalWrongAnswers || 0);
  const accuracy = answers ? Math.round(((stats.totalCorrectAnswers || 0) / answers) * 100) : null;
  const week = last7Days(stats);
  const maxWeek = Math.max(...week.map(d => d.xp), goal);
  const minutes = Math.max(1, Math.round((dueCount * 10) / 60));
  const nextReview = _nextReviewLabel(srsAll);

  $app().innerHTML = `
    ${renderHeader({ title: 'Révision', titleAr: 'مراجعة', large: true, eyebrow: 'Répétition espacée' })}
    <main class="page-content page-content--nav rv stagger">

      ${dueCount > 0 ? `
        <section class="rv-hero rv-hero--due">
          <span class="rv-hero__glyph" aria-hidden="true" lang="ar">م</span>
          <div class="rv-hero__eyebrow">${icon('zap')} À réviser aujourd'hui</div>
          <div class="rv-hero__count"><span id="rv-count">${dueCount}</span><small>mot${dueCount > 1 ? 's' : ''}</small></div>
          <p class="rv-hero__text">Environ ${minutes} min · les révisions au bon moment ancrent les mots dans ta mémoire à long terme.</p>
          <button class="btn btn--lg btn--block rv-hero__cta" id="btn-start-review">
            ${icon('play')} Commencer la révision
          </button>
        </section>
      ` : `
        <section class="rv-hero rv-hero--done">
          <div class="rv-hero__check">${icon('check')}</div>
          <div>
            <div class="rv-hero__done-title">Tout est à jour</div>
            <p class="rv-hero__done-text">${total ? `Aucun mot à revoir pour l'instant. ${nextReview}` : 'Étudie un deck de vocabulaire pour alimenter ta révision.'}</p>
          </div>
          ${total ? '' : `<button class="btn btn--tonal btn--sm" data-navigate="/mots">${icon('layers')} Vocabulaire</button>`}
        </section>
      `}

      <button class="row pressable rv-parcours" data-navigate="/parcours/revision">
        <span class="row__icon" style="--tint:var(--gold-soft);--tint-ink:var(--gold)">${icon('messages')}</span>
        <span class="row__body">
          <span class="row__title">Phrases du parcours</span>
          <span class="row__meta">${parcoursDue.length
            ? `${parcoursDue.length} phrase${parcoursDue.length > 1 ? 's' : ''} à revoir`
            : 'À jour — continue ton parcours'}</span>
        </span>
        ${parcoursDue.length ? `<span class="badge badge--gold">${parcoursDue.length}</span>` : ''}
        <span class="row__chev">${icon('chevron-right')}</span>
      </button>

      <button class="row pressable rv-parcours rv-quran" data-navigate="${versesDue.length ? '/coran/muraja' : '/coran'}">
        <span class="row__icon" style="--tint:var(--primary-soft);--tint-ink:var(--primary)">${icon('book-open')}</span>
        <span class="row__body">
          <span class="row__title">Versets mémorisés · murājaʿa</span>
          <span class="row__meta">${versesDue.length
            ? `${versesDue.length} verset${versesDue.length > 1 ? 's' : ''} à réciter`
            : 'À jour — continue ta mémorisation'}</span>
        </span>
        ${versesDue.length ? `<span class="badge badge--primary">${versesDue.length}</span>` : ''}
        <span class="row__chev">${icon('chevron-right')}</span>
      </button>

      <section class="section">
        <div class="section__head"><h2 class="section__title">Aujourd'hui</h2></div>
        <div class="rv-today card">
          ${ring(Math.min(100, (xpToday / goal) * 100), { size: 76, stroke: 8, label: `${Math.min(xpToday, 999)}` })}
          <div class="rv-today__body">
            <div class="rv-today__title">${xpToday >= goal ? 'Objectif atteint !' : `${goal - xpToday} XP avant l'objectif`}</div>
            <div class="rv-today__meta">${xpToday} / ${goal} XP aujourd'hui</div>
          </div>
          <div class="rv-today__streak ${streak > 0 ? 'is-on' : ''}">
            <span class="rv-today__flame">🔥</span>
            <strong>${streak}</strong>
            <span>jour${streak > 1 ? 's' : ''}</span>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Cette semaine</h2>
          <span class="rv-muted">Record : ${stats.longestStreak || 0} j</span>
        </div>
        <div class="card rv-week">
          ${week.map(d => `
            <div class="rv-week__col ${d.isToday ? 'is-today' : ''} ${d.xp >= goal ? 'is-goal' : ''}">
              <span class="rv-week__val">${d.xp || ''}</span>
              <div class="rv-week__track"><div class="rv-week__bar" style="height:${d.xp ? Math.max(6, (d.xp / maxWeek) * 100) : 0}%"></div></div>
              <span class="rv-week__day">${d.label}</span>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Boîtes de Leitner</h2>
          <button class="rv-info" id="btn-leitner-info" aria-label="Comment ça marche ?">${icon('info')}</button>
        </div>
        <div class="card rv-boxes">
          ${BOXES.map(({ box, color, soft }) => {
            const count = boxDist[box] || 0;
            const pct = count ? Math.max(8, (count / maxBox) * 100) : 0;
            return `
              <div class="rv-box" style="--box:${color};--box-soft:${soft}">
                <span class="rv-box__count">${count}</span>
                <div class="rv-box__well"><div class="rv-box__fill" style="height:${pct}%"></div></div>
                <span class="rv-box__num">${box}</span>
                <span class="rv-box__int">${intervalLabel(INTERVALS[box])}</span>
              </div>`;
          }).join('')}
        </div>
      </section>

      <section class="section">
        <div class="rv-tiles">
          <div class="stat-tile"><div class="stat-tile__value">${total}</div><div class="stat-tile__label">Mots suivis</div></div>
          <div class="stat-tile"><div class="stat-tile__value" style="color:var(--primary)">${acquired}</div><div class="stat-tile__label">Acquis</div></div>
          <div class="stat-tile"><div class="stat-tile__value">${accuracy === null ? '—' : accuracy + '%'}</div><div class="stat-tile__label">Réussite</div></div>
        </div>
      </section>

    </main>
    ${renderBottomNav('revision')}
  `;

  if (dueCount > 0) animateCount(document.getElementById('rv-count'), dueCount, 600);

  document.getElementById('btn-leitner-info')?.addEventListener('click', () => {
    toast('Bonne réponse → boîte suivante. Erreur → retour en boîte 1.', { icon: 'info', duration: 3600 });
  });

  document.getElementById('btn-start-review')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    haptic();
    const dueCards = await loadDueCards(course, dueEntries);
    if (!dueCards.length) {
      btn.disabled = false;
      toast('Impossible de retrouver ces cartes.', { icon: 'info' });
      return;
    }
    store.set('reviewCards', shuffle(dueCards));
    navigate('/revision/session');
  });
}

function _nextReviewLabel(srsAll) {
  const today = new Date().toISOString().slice(0, 10);
  const next = srsAll.map(e => e.nextReview).filter(d => d > today).sort()[0];
  if (!next) return '';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (next === tomorrow) return 'Prochaine révision demain.';
  const d = new Date(next + 'T00:00:00');
  return `Prochaine révision le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`;
}
