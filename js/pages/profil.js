// js/pages/profil.js — Profil : progression, préférences, données

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { showConfirmModal } from '../components/modal.js';
import { db } from '../db.js';
import { getBoxDistribution } from '../srs.js';
import { icon } from '../icons.js';
import { applyTheme, toast, haptic, progressBar, animateCount } from '../ui.js';
import { liveStreak, last7Days, todayXP, DAILY_GOAL_DEFAULT } from '../activity.js';

const $app = () => document.getElementById('app');
const XP_PER_LEVEL = 100;

const THEMES = [
  { id: 'light', label: 'Clair', icon: 'sun' },
  { id: 'dark', label: 'Sombre', icon: 'moon' },
  { id: 'system', label: 'Auto', icon: 'monitor' },
];
const CORRECTIONS = [
  { id: 'strict', label: 'Stricte' },
  { id: 'moderate', label: 'Modérée' },
  { id: 'flexible', label: 'Souple' },
];

export async function renderProfil() {
  const course = store.get('currentCourse');
  if (!course) { navigate('/'); return; }

  const [srsAll, stats, prefs] = await Promise.all([
    db.getSRS(course.id),
    db.getStats(course.id),
    db.getPreferences(),
  ]);

  const boxDist = getBoxDistribution(srsAll);
  const acquired = (boxDist[4] || 0) + (boxDist[5] || 0);
  const streak = liveStreak(stats);
  const xp = stats.totalXP || 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelPct = ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100;
  const week = last7Days(stats);
  const goal = DAILY_GOAL_DEFAULT;
  const maxWeek = Math.max(...week.map(d => d.xp), goal);
  const theme = prefs.theme || 'system';
  const correction = prefs.correctionLevel === 'loose' ? 'flexible' : (prefs.correctionLevel || 'flexible');

  $app().innerHTML = `
    ${renderHeader({ title: 'Profil', back: '/home' })}
    <main class="page-content page-content--nav pf stagger">

      <section class="pf-hero">
        <span class="pf-hero__pattern" aria-hidden="true" lang="ar">أهلاً</span>
        <div class="pf-hero__top">
          <div class="pf-avatar" aria-hidden="true"><span lang="ar">ع</span></div>
          <div>
            <div class="pf-hero__name">Mon apprentissage</div>
            <div class="pf-hero__sub" lang="ar">رِحْلَتِي فِي العَرَبِيَّة</div>
          </div>
          <div class="pf-level"><small>Niv.</small>${level}</div>
        </div>
        <div class="pf-hero__xp">
          <div class="pf-hero__xp-row"><span><strong id="pf-xp">${xp}</strong> XP</span><span>${XP_PER_LEVEL - (xp % XP_PER_LEVEL)} XP → niveau ${level + 1}</span></div>
          ${progressBar(levelPct, 'progress--gold')}
        </div>
      </section>

      <section class="pf-stats">
        <div class="pf-stat ${streak > 0 ? 'is-hot' : ''}">
          <span class="pf-stat__emoji">🔥</span>
          <div><div class="pf-stat__value">${streak}</div><div class="pf-stat__label">Série en cours</div></div>
        </div>
        <div class="pf-stat">
          <span class="pf-stat__emoji">🏅</span>
          <div><div class="pf-stat__value">${stats.longestStreak || 0}</div><div class="pf-stat__label">Meilleure série</div></div>
        </div>
        <div class="pf-stat">
          <span class="pf-stat__emoji">📚</span>
          <div><div class="pf-stat__value">${acquired}<small>/${srsAll.length}</small></div><div class="pf-stat__label">Mots acquis</div></div>
        </div>
        <div class="pf-stat">
          <span class="pf-stat__emoji">🎓</span>
          <div><div class="pf-stat__value">${stats.totalLessonsCompleted || 0}</div><div class="pf-stat__label">Leçons terminées</div></div>
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">7 derniers jours</h2>
          <span class="rv-muted">${todayXP(stats)} / ${goal} XP aujourd'hui</span>
        </div>
        <div class="card rv-week">
          ${week.map(d => `
            <div class="rv-week__col ${d.isToday ? 'is-today' : ''} ${d.xp >= goal ? 'is-goal' : ''}">
              <span class="rv-week__val">${d.xp || ''}</span>
              <div class="rv-week__track"><div class="rv-week__bar" style="height:${d.xp ? Math.max(6, (d.xp / maxWeek) * 100) : 0}%"></div></div>
              <span class="rv-week__day">${d.label}</span>
            </div>`).join('')}
        </div>
      </section>

      <section class="set-group">
        <h2 class="set-group__title">Apparence</h2>
        <div class="set-card">
          <div class="set-row set-row--stack">
            <span class="set-row__icon" style="--tint:var(--violet-soft);--tint-ink:var(--violet)">${icon('moon')}</span>
            <span class="set-row__label">Thème</span>
            <div class="segmented set-row__control" role="radiogroup" aria-label="Thème">
              ${THEMES.map(t => `<button role="radio" aria-checked="${theme === t.id}" class="${theme === t.id ? 'is-active' : ''}" data-theme-pref="${t.id}">${icon(t.icon)} ${t.label}</button>`).join('')}
            </div>
          </div>
        </div>
      </section>

      <section class="set-group">
        <h2 class="set-group__title">Apprentissage</h2>
        <div class="set-card">
          ${_toggleRow('pref-translit', 'Translittération', 'Afficher la prononciation en lettres latines', 'languages', 'var(--info-soft)', 'var(--info)', prefs.showTranslit !== false)}
          ${_toggleRow('pref-harakats', 'Harakats', 'Voyelles brèves : fatha, damma, kasra', 'pen', 'var(--primary-soft)', 'var(--primary)', prefs.showHarakats !== false)}
          ${_toggleRow('pref-autoplay', 'Lecture automatique', 'Prononcer les mots à leur apparition', 'volume-2', 'var(--gold-soft)', 'var(--gold)', !!prefs.autoPlay)}
          <div class="set-row set-row--stack">
            <span class="set-row__icon" style="--tint:var(--success-soft);--tint-ink:var(--success)">${icon('check-circle')}</span>
            <span class="set-row__text">
              <span class="set-row__label">Correction écrite</span>
              <span class="set-row__hint">Tolérance aux fautes de frappe et d'accents</span>
            </span>
            <div class="segmented set-row__control" role="radiogroup" aria-label="Niveau de correction">
              ${CORRECTIONS.map(c => `<button role="radio" aria-checked="${correction === c.id}" class="${correction === c.id ? 'is-active' : ''}" data-correction="${c.id}">${c.label}</button>`).join('')}
            </div>
          </div>
        </div>
      </section>

      <section class="set-group">
        <h2 class="set-group__title">Mes données</h2>
        <div class="set-card">
          <button class="set-row set-row--btn" id="btn-export">
            <span class="set-row__icon" style="--tint:var(--surface-2);--tint-ink:var(--ink-2)">${icon('download')}</span>
            <span class="set-row__text"><span class="set-row__label">Exporter</span><span class="set-row__hint">Sauvegarde JSON de ta progression</span></span>
            <span class="row__chev">${icon('chevron-right')}</span>
          </button>
          <label class="set-row set-row--btn">
            <span class="set-row__icon" style="--tint:var(--surface-2);--tint-ink:var(--ink-2)">${icon('upload')}</span>
            <span class="set-row__text"><span class="set-row__label">Importer</span><span class="set-row__hint">Restaurer une sauvegarde</span></span>
            <span class="row__chev">${icon('chevron-right')}</span>
            <input type="file" id="btn-import" accept=".json,application/json" class="sr-only">
          </label>
          <button class="set-row set-row--btn set-row--danger" id="btn-reset">
            <span class="set-row__icon" style="--tint:var(--danger-soft);--tint-ink:var(--danger)">${icon('trash-2')}</span>
            <span class="set-row__text"><span class="set-row__label">Réinitialiser la progression</span><span class="set-row__hint">Révision, statistiques et leçons</span></span>
          </button>
        </div>
      </section>

      <footer class="pf-footer">
        <span lang="ar">أَهْلًا</span>
        HelloArabic · fait avec soin pour apprendre l'arabe
      </footer>
    </main>
    ${renderBottomNav('home')}
  `;

  animateCount(document.getElementById('pf-xp'), xp, 700);
  _bindEvents(course);
}

function _toggleRow(id, label, hint, ic, tint, ink, checked) {
  return `
    <label class="set-row" for="${id}">
      <span class="set-row__icon" style="--tint:${tint};--tint-ink:${ink}">${icon(ic)}</span>
      <span class="set-row__text">
        <span class="set-row__label">${label}</span>
        <span class="set-row__hint">${hint}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
        <span class="toggle__slider"></span>
      </span>
    </label>`;
}

async function _savePrefs(updates) {
  const current = await db.getPreferences();
  const next = { ...current, ...updates };
  await db.savePreferences(next);
  store.set('preferences', next);
  return next;
}

function _bindEvents(course) {
  $app().querySelectorAll('[data-theme-pref]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const value = btn.dataset.themePref;
      haptic();
      _selectSegment(btn);
      applyTheme(value);
      await _savePrefs({ theme: value });
    });
  });

  $app().querySelectorAll('[data-correction]').forEach(btn => {
    btn.addEventListener('click', async () => {
      haptic();
      _selectSegment(btn);
      await _savePrefs({ correctionLevel: btn.dataset.correction });
    });
  });

  const bindToggle = (id, key) => {
    document.getElementById(id)?.addEventListener('change', async e => {
      haptic(6);
      await _savePrefs({ [key]: e.target.checked });
    });
  };
  bindToggle('pref-translit', 'showTranslit');
  bindToggle('pref-harakats', 'showHarakats');
  bindToggle('pref-autoplay', 'autoPlay');

  document.getElementById('btn-export')?.addEventListener('click', () => _export(course));
  document.getElementById('btn-import')?.addEventListener('change', e => _import(e, course));
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    showConfirmModal(
      'Tout réinitialiser ?',
      'Ta révision, tes statistiques, ta série et ta progression dans les leçons seront effacées. Tes préférences sont conservées. Pense à exporter avant !',
      () => _reset(),
      null,
      { confirmLabel: 'Tout effacer', danger: true },
    );
  });
}

function _selectSegment(btn) {
  btn.parentElement.querySelectorAll('button').forEach(b => {
    const on = b === btn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', on);
  });
}

async function _export(course) {
  try {
    const [srsCourse, srsParcours, stats, favs, prefs, lessonProgress] = await Promise.all([
      db.getSRS(course.id),
      db.getSRS('parcours'),
      db.getStats(course.id),
      db.getFavorites(course.id),
      db.getPreferences(),
      Promise.all([db.getAllLessonProgress(course.id), db.getAllLessonProgress('parcours')]).then(([a, b]) => [...a, ...b]),
    ]);
    const payload = JSON.stringify({
      version: '2.0',
      courseId: course.id,
      exportedAt: new Date().toISOString(),
      srs: [...srsCourse, ...srsParcours],
      stats,
      favorites: favs,
      preferences: prefs,
      lessonProgress,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `helloarabic-${course.id}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Sauvegarde téléchargée', { icon: 'download' });
  } catch (err) {
    toast(`Export impossible : ${err.message}`, { icon: 'info' });
  }
}

async function _import(e, course) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || (!data.srs && !data.stats)) throw new Error('fichier non reconnu');
    for (const entry of data.srs || []) {
      if (entry?.cardId) await db.updateSRS(entry.courseId || course.id, entry.cardId, entry);
    }
    for (const lp of data.lessonProgress || []) {
      if (lp?.lessonId) await db.saveLessonProgress(lp.courseId || course.id, lp.lessonId, lp);
    }
    if (data.stats) await db.saveStats(course.id, data.stats);
    if (data.favorites) await db.saveFavorites(course.id, data.favorites);
    if (data.preferences) {
      await db.savePreferences(data.preferences);
      store.set('preferences', data.preferences);
      applyTheme(data.preferences.theme || 'system');
    }
    toast('Données importées avec succès');
    renderProfil();
  } catch (err) {
    toast(`Import impossible : ${err.message}`, { icon: 'info', duration: 3200 });
  } finally {
    e.target.value = '';
  }
}

async function _reset() {
  try {
    await db.resetProgress();
    store.set('dueCount', 0);
    toast('Progression réinitialisée', { icon: 'refresh-cw' });
    renderProfil();
  } catch (err) {
    toast(`Réinitialisation impossible : ${err.message}`, { icon: 'info' });
  }
}
