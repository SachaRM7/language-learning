// js/pages/tajwid-lesson.js — Leçon Tajwid : explications, exemples coraniques récités (la règle est
// colorée, seuls les mots concernés sont joués), puis quiz (dont des questions d'écoute).

import { store } from '../store.js';
import { navigate } from '../router.js';
import { db } from '../db.js';
import { escapeHtml, shuffle } from '../utils.js';
import { icon } from '../icons.js';
import { progressBar, showFeedback, confetti, haptic, toast, animateCount } from '../ui.js';
import { recordActivity } from '../activity.js';
import { showConfirmModal } from '../components/modal.js';
import { stopAudio } from '../components/quran-audio.js';
import { runsToHtml, playClip, stopClip } from '../quran/recitation.js';
import { loadQuranIndex } from '../quran.js';
import { getTajwidState, findTajwidLesson, starsFor, TAJWID_ID, PASS_SCORE } from '../tajwid.js';

const $app = () => document.getElementById('app');
const RATES = [1, 0.75, 0.5];
const AR = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
const AR_RUN = new RegExp(`[${AR}](?:[${AR}\\u200C\\s]*[${AR}])?`, 'g');
let S = null;

/** Texte → HTML échappé, **gras**, et passages arabes dans la police coranique. */
function rich(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(AR_RUN, m => `<span class="tj-inline-ar" lang="ar" dir="rtl">${m}</span>`);
}

export async function renderTajwidLesson({ lessonId }) {
  stopClip();
  const [state, index] = await Promise.all([getTajwidState(), loadQuranIndex().catch(() => null)]);
  const found = findTajwidLesson(state, lessonId);
  if (!found) { navigate('/tajwid'); return; }
  if (!found.lesson.unlocked) {
    toast('Cette leçon est encore verrouillée', { icon: 'lock' });
    navigate('/tajwid');
    return;
  }
  S = {
    state, level: found.level, lesson: found.lesson,
    names: new Map((index?.surahs || []).map(s => [s.id, s.name])),
    rate: S?.rate || 1,
    examples: {},
    alive: true,
  };
  const leave = () => {
    if (!location.hash.startsWith(`#/tajwid/lecon/${lessonId}`)) { stopClip(); if (S) S.alive = false; window.removeEventListener('hashchange', leave); }
  };
  window.addEventListener('hashchange', leave);
  renderLesson();
}

// ═════════ Exemples récités ═════════

function exampleHtml(ex, id, { compact = false } = {}) {
  S.examples[id] = ex;
  const focus = ex.plain ? null : ex.rules;
  const words = ex.words.map((w, i) => `<span class="tj-ex__w" data-w="${i}">${runsToHtml(w.runs, { focus, plain: ex.plain })}</span>`).join(' ');
  const [s, v] = ex.ref.split(':');
  return `
    <figure class="tj-ex ${compact ? 'tj-ex--compact' : ''}" data-ex="${id}">
      <div class="tj-ex__ar" lang="ar">${words}</div>
      ${ex.plain ? '' : `<div class="tj-ex__tr">${escapeHtml(ex.words.map(w => w.tr).filter(Boolean).join(' '))}</div>`}
      <div class="tj-ex__foot">
        <button class="btn btn--primary btn--sm tj-ex__play" data-play="${id}">${icon('play')}<span>Écouter</span></button>
        <button class="chip tj-ex__rate" data-rate aria-label="Vitesse">${String(S.rate).replace('.', ',')}×</button>
        <a class="tj-ex__ref" href="#/coran/${s}/verset/${v}" title="Ouvrir dans le lecteur">${escapeHtml(S.names.get(Number(s)) || `Sourate ${s}`)} · ${escapeHtml(ex.ref)}</a>
      </div>
      ${ex.note && !compact ? `<figcaption class="tj-ex__note">${rich(ex.note)}</figcaption>` : ''}
    </figure>`;
}

function bindExamples(root) {
  root.querySelectorAll('[data-play]').forEach(btn => btn.addEventListener('click', () => playExample(btn)));
  root.querySelectorAll('[data-rate]').forEach(btn => btn.addEventListener('click', () => {
    S.rate = RATES[(RATES.indexOf(S.rate) + 1) % RATES.length];
    $app().querySelectorAll('[data-rate]').forEach(b => { b.textContent = `${String(S.rate).replace('.', ',')}×`; });
    haptic();
  }));
}

function playExample(btn) {
  const fig = btn.closest('.tj-ex');
  const wasPlaying = fig.classList.contains('is-playing');
  stopAudio();
  stopClip();
  if (wasPlaying) return;
  const words = fig.querySelectorAll('.tj-ex__w');
  fig.classList.add('is-playing');
  btn.innerHTML = `${icon('pause')}<span>Stop</span>`;
  playClip(S.examples[btn.dataset.play], {
    rate: S.rate,
    onWord: i => words.forEach((w, k) => w.classList.toggle('is-cur', k === i)),
    onEnd: error => {
      fig.classList.remove('is-playing');
      btn.innerHTML = `${icon('play')}<span>${error ? 'Indisponible' : 'Écouter'}</span>`;
    },
  });
}

// ═════════ Leçon ═════════

function blockHtml(b, i) {
  switch (b.t) {
    case 'p': return `<p class="tj-p">${rich(b.text)}</p>`;
    case 'tip': return `<div class="tj-tip">${icon('lightbulb')}<p>${rich(b.text)}</p></div>`;
    case 'key': return `<dl class="tj-key">${b.items.map(([k, v]) => `<div class="card card--flat"><dt>${rich(k)}</dt><dd>${rich(v)}</dd></div>`).join('')}</dl>`;
    case 'letters': return `
      <div class="tj-letters card card--flat">
        <div class="tj-letters__label">${escapeHtml(b.label)}</div>
        <div class="tj-letters__row" lang="ar" dir="rtl">${b.letters.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>
      </div>`;
    case 'table': return `
      <div class="tj-table-wrap"><table class="tj-table">
        <thead><tr>${b.head.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    case 'ex': return exampleHtml(b, `b${i}`);
    default: return '';
  }
}

function renderLesson() {
  const { level, lesson } = S;
  S.examples = {};
  const tint = `--m-tint:${level.tint.tint};--m-soft:${level.tint.soft};--m-grad:${level.tint.grad}`;
  $app().innerHTML = `
    ${renderHeader(lesson.title)}
    <main class="page-content tj-lesson" style="${tint}">
      <section class="tj-hero">
        <div class="tj-hero__eyebrow">${level.emoji} ${escapeHtml(level.name)} · Leçon ${lesson.index + 1}/${level.lessons.length}</div>
        <div class="tj-hero__ar" lang="ar">${escapeHtml(lesson.ar)}</div>
        <h1 class="tj-hero__title">${escapeHtml(lesson.title)}</h1>
        <p class="tj-hero__sub">${escapeHtml(lesson.subtitle)}</p>
        ${lesson.done ? `<div class="tj-hero__stars" aria-label="${lesson.stars} étoiles">${[1, 2, 3].map(s => `<span class="${s <= lesson.stars ? 'on' : ''}">${icon('star')}</span>`).join('')}</div>` : ''}
      </section>
      <div class="tj-blocks stagger">${lesson.blocks.map(blockHtml).join('')}</div>
      <div class="tj-cta btn-stack">
        <button class="btn btn--primary btn--block btn--lg" id="tj-quiz">${icon('check-circle')} ${lesson.done ? 'Refaire le quiz' : 'Valider avec le quiz'} · ${lesson.quiz.length} questions</button>
        ${lesson.done ? nextLessonButton('btn--secondary') : ''}
      </div>
    </main>`;
  bindExamples($app());
  document.getElementById('tj-quiz').addEventListener('click', () => { haptic(); startQuiz(); });
}

function renderHeader(title) {
  return `
    <header class="page-header">
      <button class="back-btn" data-navigate="/tajwid" aria-label="Fermer">${icon('x')}</button>
      <h1 class="page-header__title">${escapeHtml(title)}</h1>
      <div class="page-header__actions"></div>
    </header>`;
}

function nextLesson() {
  const all = S.state.levels.flatMap(l => l.lessons);
  return all[all.findIndex(l => l.id === S.lesson.id) + 1] || null;
}

function nextLessonButton(cls) {
  const next = nextLesson();
  return next ? `<button class="btn ${cls} btn--block" data-navigate="/tajwid/lecon/${escapeHtml(next.id)}">Leçon suivante : ${escapeHtml(next.title)} ${icon('arrow-right')}</button>` : '';
}

// ═════════ Quiz ═════════

function startQuiz() {
  stopClip();
  S.quiz = {
    questions: S.lesson.quiz.map(q => ({ ...q, order: q.opts.length > 2 ? shuffle(q.opts.map((_, i) => i)) : q.opts.map((_, i) => i) })),
    i: 0,
    correct: 0,
  };
  renderQuestion();
}

function renderQuestion() {
  const { quiz } = S;
  const q = quiz.questions[quiz.i];
  S.examples = {};
  $app().innerHTML = `
    <div class="tj-quiz" style="--m-tint:${S.level.tint.tint}">
      <div class="pl-top">
        <button class="back-btn icon-btn--ghost" id="tj-quit" aria-label="Quitter">${icon('x')}</button>
        <div class="pl-top__mid">${progressBar((quiz.i / quiz.questions.length) * 100)}</div>
        <div class="session-bar__count">${quiz.i + 1}/${quiz.questions.length}</div>
      </div>
      <main class="tj-quiz__body">
        <h2 class="tj-quiz__q">${rich(q.q)}</h2>
        ${q.ex ? exampleHtml(q.ex, 'q', { compact: true }) : ''}
        <div class="tj-quiz__opts">
          ${q.order.map(oi => `<button class="choice-btn" data-opt="${oi}">${rich(q.opts[oi])}</button>`).join('')}
        </div>
      </main>
    </div>`;
  bindExamples($app());
  document.getElementById('tj-quit').addEventListener('click', () => {
    if (quiz.i === 0) { stopClip(); renderLesson(); return; }
    showConfirmModal('Quitter le quiz ?', 'Tes réponses à ce quiz ne seront pas enregistrées.', () => { stopClip(); renderLesson(); }, null, { confirmLabel: 'Quitter', danger: true });
  });
  $app().querySelectorAll('[data-opt]').forEach(btn => btn.addEventListener('click', () => answer(q, Number(btn.dataset.opt))));
  // Questions d'écoute : l'extrait part tout seul
  if (q.ex) setTimeout(() => { if (S.alive) $app().querySelector('[data-play="q"]')?.click(); }, 250);
}

async function answer(q, chosen) {
  const buttons = $app().querySelectorAll('[data-opt]');
  if ([...buttons].some(b => b.disabled)) return;
  const correct = chosen === q.a;
  buttons.forEach(b => {
    b.disabled = true;
    const oi = Number(b.dataset.opt);
    if (oi === q.a) b.classList.add('is-correct');
    else if (oi === chosen) b.classList.add('is-wrong');
  });
  if (correct) S.quiz.correct++;
  await showFeedback({ correct, html: rich(q.why) });
  stopClip();
  if (!S.alive) return;
  S.quiz.i++;
  if (S.quiz.i < S.quiz.questions.length) renderQuestion();
  else finish();
}

async function finish() {
  const { quiz, lesson, level } = S;
  const total = quiz.questions.length;
  const score = Math.round((quiz.correct / total) * 100);
  const passed = score >= PASS_SCORE;
  const prev = await db.getLessonProgress(TAJWID_ID, lesson.id);
  const firstTime = passed && !prev?.completed;
  const stars = passed ? Math.max(prev?.stars || 0, starsFor(score)) : (prev?.stars || 0);
  await db.saveLessonProgress(TAJWID_ID, lesson.id, {
    completed: Boolean(prev?.completed || passed),
    stars,
    bestScore: Math.max(prev?.bestScore || 0, score),
    attempts: (prev?.attempts || 0) + 1,
    completedAt: passed ? Date.now() : (prev?.completedAt || null),
  });
  const course = store.get('currentCourse');
  const xp = quiz.correct + (passed ? 5 : 0);
  await recordActivity(course?.id || 'arabic', { correct: quiz.correct, wrong: total - quiz.correct, lessons: firstTime ? 1 : 0 });

  S.state = await getTajwidState();
  const after = S.state.levels[level.index];
  const levelJustDone = firstTime && after.doneCount === after.lessons.length;
  const nextLevel = S.state.levels[level.index + 1];
  renderResult({ score, passed, stars: passed ? starsFor(score) : 0, xp, levelJustDone, nextLevel });
}

function renderResult({ score, passed, stars, xp, levelJustDone, nextLevel }) {
  const { quiz, lesson, level } = S;
  const title = !passed ? 'Encore un effort !' : score >= 90 ? 'Excellent !' : 'Leçon validée !';
  const sub = passed
    ? (levelJustDone ? `${level.name} terminé, mā shā’ Allāh !` : 'La leçon suivante est débloquée.')
    : `Il faut ${PASS_SCORE} % de bonnes réponses pour valider. Relis la leçon et réécoute les exemples.`;
  const next = nextLesson();
  $app().innerHTML = `
    <div class="result pl-result tj-result">
      ${passed ? `
        <div class="pl-stars" aria-label="${stars} étoiles sur 3">
          ${[1, 2, 3].map(s => `<span class="pl-star ${s <= stars ? 'on' : ''}" style="--d:${s * 160}ms">${icon('star')}</span>`).join('')}
        </div>` : '<div class="result__emoji">💪</div>'}
      <h1 class="result__title">${title}</h1>
      <p class="result__subtitle">${escapeHtml(sub)}</p>
      <div class="result__stats">
        <div class="stat-tile"><div class="stat-tile__value"><span data-count="${score}">0</span>%</div><div class="stat-tile__label">Bonnes réponses</div></div>
        <div class="stat-tile"><div class="stat-tile__value pl-xp">+<span data-count="${xp}">0</span></div><div class="stat-tile__label">XP gagnés</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${quiz.correct}/${quiz.questions.length}</div><div class="stat-tile__label">Questions</div></div>
      </div>
      ${levelJustDone && nextLevel ? `
        <div class="pl-unlock">
          <span class="pl-unlock__emoji">${nextLevel.emoji}</span>
          <div><strong>Niveau débloqué</strong><br><span>${escapeHtml(nextLevel.name)} · ${escapeHtml(nextLevel.title)}</span></div>
        </div>` : ''}
      <div class="result__actions">
        ${passed && next ? `<button class="btn btn--primary btn--block btn--lg" data-navigate="/tajwid/lecon/${escapeHtml(next.id)}">Leçon suivante ${icon('arrow-right')}</button>` : ''}
        ${!passed || score < 90 ? `<button class="btn ${passed ? 'btn--secondary' : 'btn--primary btn--lg'} btn--block" id="tj-retry">${icon('rotate-ccw')} Refaire le quiz</button>` : ''}
        <button class="btn btn--secondary btn--block" id="tj-reread">${icon('book-open')} Relire la leçon</button>
        <button class="btn btn--ghost btn--block" data-navigate="/tajwid">Retour au parcours</button>
      </div>
    </div>`;
  $app().querySelectorAll('[data-count]').forEach(el => animateCount(el, Number(el.dataset.count)));
  document.getElementById('tj-retry')?.addEventListener('click', startQuiz);
  document.getElementById('tj-reread').addEventListener('click', () => {
    S.lesson = S.state.levels[level.index].lessons[lesson.index];
    renderLesson();
  });
  if (passed) setTimeout(() => confetti(), 250);
  haptic([10, 60, 10]);
}
