// js/pages/coran-review.js — Murājaʿa : réciter de mémoire les versets dus, puis s'auto-évaluer.

import { store } from '../store.js';
import { navigate } from '../router.js';
import { db } from '../db.js';
import { escapeHtml, shuffle } from '../utils.js';
import { icon } from '../icons.js';
import { progressBar, haptic, confetti } from '../ui.js';
import { processAnswer } from '../srs.js';
import { recordActivity } from '../activity.js';
import { playUrl, stopAudio } from '../components/quran-audio.js';
import { loadSurah, dueVerses, QURAN_COURSE } from '../quran.js';
import { preferredVerseUrl, getPlayerPrefs } from '../quran/player-prefs.js';

const $app = () => document.getElementById('app');
let R = null;

export async function renderCoranReview() {
  const due = await dueVerses();
  if (!due.length) {
    $app().innerHTML = `
      <div class="pl-chat">
        <div class="pl-top"><button class="back-btn icon-btn--ghost" data-navigate="/coran" aria-label="Fermer">${icon('x')}</button></div>
        <div class="empty" style="flex:1;justify-content:center">
          <div class="empty__emoji">🌙</div>
          <div class="empty__title">Murājaʿa à jour</div>
          <p>Les versets que tu mémorises reviendront ici au bon moment.</p>
          <button class="btn btn--primary" style="margin-top:16px" data-navigate="/coran">Retour au Coran</button>
        </div>
      </div>`;
    return;
  }
  const items = [];
  for (const e of shuffle(due).slice(0, 15)) {
    const [s, n] = e.cardId.slice(2).split(':').map(Number);
    const surah = await loadSurah(s).catch(() => null);
    const verse = surah?.verses.find(v => v.n === n);
    if (verse) items.push({ entry: e, surah, verse });
  }
  R = { items, i: 0, ok: 0, ko: 0, revealed: false };
  renderItem();
}

function renderItem() {
  const it = R.items[R.i];
  if (!it) { finish(); return; }
  const { surah, verse } = it;
  const shown = Math.min(2, verse.w.length);
  $app().innerHTML = `
    <div class="hz">
      <div class="pl-top">
        <button class="back-btn icon-btn--ghost" id="mr-close" aria-label="Fermer">${icon('x')}</button>
        <div class="pl-top__mid">${progressBar((R.i / R.items.length) * 100)}</div>
        <div class="session-bar__count">${R.i}/${R.items.length}</div>
      </div>
      <main class="hz-body mr">
        <div class="mr-ref"><span lang="ar">${escapeHtml(surah.nameAr)}</span> ${escapeHtml(surah.name)} · verset ${verse.n}</div>
        <div class="hz-card ${R.revealed ? '' : 'mr-hidden'}">
          <p class="hz-ar" lang="ar">
            ${verse.w.map((w, j) => (R.revealed || j < shown)
              ? `<span class="mr-w">${escapeHtml(w.t)}</span>`
              : '<span class="mr-mask"></span>').join(' ')}
          </p>
          ${R.revealed ? `<p class="hz-fr">${escapeHtml(verse.fr)}</p>` : ''}
        </div>
        ${R.revealed ? `
          <button class="btn btn--ghost btn--block" id="mr-audio">${icon('volume-2')} Écouter la récitation</button>
          <div class="mr-grade">
            <button class="btn btn--secondary btn--lg" id="mr-ko">${icon('rotate-ccw')} À revoir</button>
            <button class="btn btn--primary btn--lg" id="mr-ok">${icon('check')} Je savais</button>
          </div>` : `
          <p class="hz-help">Récite le verset de mémoire à partir de son début, puis vérifie.</p>
          <div class="hz-cta"><button class="btn btn--primary btn--block btn--lg" id="mr-reveal">${icon('eye')} Vérifier</button></div>`}
      </main>
    </div>`;
  document.getElementById('mr-close').addEventListener('click', () => { stopAudio(); navigate('/coran'); });
  document.getElementById('mr-reveal')?.addEventListener('click', () => { R.revealed = true; haptic(); renderItem(); });
  document.getElementById('mr-audio')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    playUrl(await preferredVerseUrl(surah.id, verse), btn, { rate: getPlayerPrefs().rate });
  });
  document.getElementById('mr-ok')?.addEventListener('click', () => grade(true));
  document.getElementById('mr-ko')?.addEventListener('click', () => grade(false));
}

async function grade(ok) {
  stopAudio();
  const it = R.items[R.i];
  await db.updateSRS(QURAN_COURSE, it.entry.cardId, processAnswer(it.entry, ok));
  if (ok) R.ok++; else R.ko++;
  haptic(ok ? 10 : [20, 30, 20]);
  R.i++;
  R.revealed = false;
  renderItem();
}

async function finish() {
  const course = store.get('currentCourse');
  await recordActivity(course?.id || 'arabic', { correct: R.ok, wrong: R.ko, reviewSession: true });
  const pct = R.items.length ? Math.round((R.ok / R.items.length) * 100) : 0;
  if (pct >= 70) confetti();
  $app().innerHTML = `
    <div class="result">
      <div class="result__emoji">${pct >= 70 ? '🌟' : '🤲'}</div>
      <h1 class="result__title">Murājaʿa terminée</h1>
      <p class="result__subtitle">${pct >= 70 ? 'Tes versets sont bien ancrés.' : 'Les versets à revoir reviendront plus vite.'}</p>
      <div class="result__stats">
        <div class="stat-tile"><div class="stat-tile__value">${R.ok}</div><div class="stat-tile__label">Sus</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${R.ko}</div><div class="stat-tile__label">À revoir</div></div>
        <div class="stat-tile"><div class="stat-tile__value">+${R.ok}</div><div class="stat-tile__label">XP</div></div>
      </div>
      <div class="result__actions">
        <button class="btn btn--primary btn--block btn--lg" data-navigate="/coran">Retour au Coran</button>
      </div>
    </div>`;
}
