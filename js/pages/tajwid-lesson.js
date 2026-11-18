// js/pages/tajwid-lesson.js — Leçon Tajwid : explications, exemples coraniques audio, quiz

import { db } from '../db.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { escapeHtml, shuffle } from '../utils.js';
import { runsToHtml } from '../quran/tajweed.js';
import { playRange, stopRange } from '../quran/range-player.js';
import {
  loadTajwid, loadTajwidProgress, flatLessons, isUnlocked, TAJWID_COURSE, LEVEL_COLORS,
} from './tajwid-home.js';

const $app = () => document.getElementById('app');
const PASS_RATIO = 0.7;
const RATES = [1, 0.75, 0.5];

let _state = null;

/** Texte simple → HTML (échappé) avec **gras**. */
const AR = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
const AR_RUN = new RegExp(`[${AR}](?:[${AR}\\u200C\\s]*[${AR}])?`, 'g');

/** Texte simple → HTML (échappé) avec **gras** ; l'arabe est rendu avec la police coranique. */
function rich(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(AR_RUN, m => `<span class="tj-inline-ar" lang="ar" dir="rtl">${m}</span>`);
}

function surahName(ref) {
  const n = Number(ref.split(':')[0]);
  const list = _state?.surahs;
  return list?.[n - 1]?.tr || `Sourate ${n}`;
}

export async function renderTajwidLesson({ lessonId }) {
  stopRange();
  const [data, progress, surahs] = await Promise.all([
    loadTajwid(),
    loadTajwidProgress(),
    fetch('data/quran/surahs.json').then(r => r.json()).catch(() => null),
  ]);
  const all = flatLessons(data);
  const pos = all.findIndex(x => x.lesson.id === lessonId);
  if (pos < 0) { navigate('/tajwid'); return; }
  if (!isUnlocked(data, progress, lessonId)) { navigate('/tajwid'); return; }

  const item = all[pos];
  _state = {
    data, progress, surahs, item, pos, all,
    mode: 'lesson',
    rate: _state?.rate || 1,
    examples: [],
    quiz: null,
  };
  const onLeave = () => {
    if (!location.hash.includes(`/tajwid/lecon/${lessonId}`)) {
      stopRange();
      window.removeEventListener('hashchange', onLeave);
    }
  };
  window.addEventListener('hashchange', onLeave);
  _renderLesson();
}

// ─────────────────────────────────────────────────────────────── Exemples

function _exampleHtml(ex, id, { compact = false } = {}) {
  _state.examples[id] = ex;
  const focus = ex.plain ? null : ex.rules;
  const words = ex.words.map((w, i) => `<span class="tj-ex__w" data-w="${i}">${runsToHtml(w.runs, { focus, plain: ex.plain })}</span>`).join(' ');
  const tr = ex.words.map(w => w.tr).filter(Boolean).join(' ');
  return `
    <figure class="tj-ex ${compact ? 'tj-ex--compact' : ''}" data-ex="${id}">
      <div class="tj-ex__ar" lang="ar" dir="rtl">${words}</div>
      ${ex.plain ? '' : `<div class="tj-ex__tr">${escapeHtml(tr)}</div>`}
      <div class="tj-ex__foot">
        <button class="tj-ex__play" data-play="${id}" aria-label="Écouter l'exemple">${feather.icons.play.toSvg({ width: 16, height: 16 })}<span>Écouter</span></button>
        <button class="tj-ex__rate" data-rate aria-label="Vitesse">${String(_state.rate).replace('.', ',')}×</button>
        <a class="tj-ex__ref" href="#/coran/${ex.ref.split(':')[0]}/${ex.ref.split(':')[1]}" title="Ouvrir dans le lecteur">${escapeHtml(surahName(ex.ref))} · ${escapeHtml(ex.ref)}</a>
      </div>
      ${ex.note && !compact ? `<figcaption class="tj-ex__note">${rich(ex.note)}</figcaption>` : ''}
    </figure>
  `;
}

function _bindExamples(scope) {
  scope.querySelectorAll('[data-play]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fig = btn.closest('.tj-ex');
      const ex = _state.examples[btn.dataset.play];
      const wasPlaying = fig.classList.contains('is-playing');
      stopRange();
      if (wasPlaying) return;
      fig.classList.add('is-playing');
      btn.querySelector('span').textContent = 'Stop';
      const words = fig.querySelectorAll('.tj-ex__w');
      playRange(ex, {
        rate: _state.rate,
        onWord: i => words.forEach((w, k) => w.classList.toggle('is-cur', k === i)),
        onEnd: error => {
          fig.classList.remove('is-playing');
          btn.querySelector('span').textContent = error ? 'Indisponible' : 'Écouter';
        },
      });
    });
  });
  scope.querySelectorAll('[data-rate]').forEach(btn => {
    btn.addEventListener('click', () => {
      _state.rate = RATES[(RATES.indexOf(_state.rate) + 1) % RATES.length];
      $app().querySelectorAll('[data-rate]').forEach(b => { b.textContent = `${String(_state.rate).replace('.', ',')}×`; });
    });
  });
}

// ─────────────────────────────────────────────────────────────── Leçon

function _blockHtml(b, i) {
  switch (b.t) {
    case 'p': return `<p class="tj-p">${rich(b.text)}</p>`;
    case 'tip': return `<div class="tj-tip"><i data-feather="zap"></i><p>${rich(b.text)}</p></div>`;
    case 'key': return `<dl class="tj-key">${b.items.map(([k, v]) => `<div><dt>${rich(k)}</dt><dd>${rich(v)}</dd></div>`).join('')}</dl>`;
    case 'letters': return `
      <div class="tj-letters">
        <div class="tj-letters__label">${escapeHtml(b.label)}</div>
        <div class="tj-letters__row" lang="ar" dir="rtl">${b.letters.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>
      </div>`;
    case 'table': return `
      <div class="tj-table-wrap"><table class="tj-table">
        <thead><tr>${b.head.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    case 'ex': return _exampleHtml(b, `b${i}`);
    default: return '';
  }
}

function _renderLesson() {
  const { item, all, pos, progress } = _state;
  const { level, lesson, levelIndex } = item;
  const color = LEVEL_COLORS[levelIndex % LEVEL_COLORS.length];
  const prog = progress[lesson.id];
  _state.examples = [];

  $app().innerHTML = `
    ${renderHeader({ title: lesson.title, back: `/tajwid/niveau/${level.id}` })}
    <main class="page-content tj-lesson" style="--lvl:${color}">
      <section class="tj-hero">
        <div class="tj-hero__eyebrow">${escapeHtml(level.name)} · Leçon ${item.index + 1} / ${level.lessons.length}</div>
        <div class="tj-hero__ar" lang="ar" dir="rtl">${escapeHtml(lesson.ar)}</div>
        <h2 class="tj-hero__title">${escapeHtml(lesson.title)}</h2>
        <p class="tj-hero__sub">${escapeHtml(lesson.subtitle)}</p>
        ${prog?.completed ? `<span class="badge badge--green">Validée · ${prog.bestScore}/${prog.total}</span>` : ''}
      </section>

      <div class="tj-blocks">
        ${lesson.blocks.map(_blockHtml).join('')}
      </div>

      <div class="tj-cta">
        <button class="primary-btn tj-cta__main" id="tj-start-quiz">
          <i data-feather="check-square"></i> ${prog?.completed ? 'Refaire le quiz' : 'Valider avec le quiz'} (${lesson.quiz.length} questions)
        </button>
        ${prog?.completed && all[pos + 1] ? `<button class="secondary-btn" data-navigate="/tajwid/lecon/${all[pos + 1].lesson.id}">Leçon suivante <i data-feather="arrow-right"></i></button>` : ''}
      </div>
    </main>
  `;

  feather.replace();
  _bindExamples($app());
  document.getElementById('tj-start-quiz').addEventListener('click', _startQuiz);
  window.scrollTo(0, 0);
}

// ─────────────────────────────────────────────────────────────── Quiz

function _startQuiz() {
  stopRange();
  const questions = _state.item.lesson.quiz.map(q => {
    // Mélange des choix (sauf pour les paires du type Épais / Léger)
    const order = q.opts.length > 2 ? shuffle(q.opts.map((_, i) => i)) : q.opts.map((_, i) => i);
    return { ...q, order };
  });
  _state.quiz = { questions, i: 0, score: 0, answered: null };
  _renderQuestion();
}

function _renderQuestion() {
  const { quiz, item } = _state;
  const q = quiz.questions[quiz.i];
  const color = LEVEL_COLORS[item.levelIndex % LEVEL_COLORS.length];
  _state.examples = [];
  const answered = quiz.answered;

  $app().innerHTML = `
    ${renderHeader({ title: `Quiz · ${item.lesson.title}`, back: `/tajwid/lecon/${item.lesson.id}` })}
    <main class="page-content tj-quiz" style="--lvl:${color}">
      <div class="tj-quiz__progress">
        <div class="tj-quiz__track"><div class="tj-quiz__bar" style="width:${(quiz.i / quiz.questions.length) * 100}%"></div></div>
        <span>${quiz.i + 1} / ${quiz.questions.length}</span>
      </div>
      <h2 class="tj-quiz__q">${rich(q.q)}</h2>
      ${q.ex ? _exampleHtml(q.ex, 'q', { compact: true }) : ''}
      <div class="tj-quiz__opts" role="group" aria-label="Choix de réponse">
        ${q.order.map(oi => {
          let cls = '';
          if (answered !== null) {
            if (oi === q.a) cls = 'is-correct';
            else if (oi === answered) cls = 'is-wrong';
          }
          return `<button class="tj-opt ${cls}" data-opt="${oi}" ${answered !== null ? 'disabled' : ''}>${rich(q.opts[oi])}</button>`;
        }).join('')}
      </div>
      ${answered !== null ? `
        <div class="tj-feedback ${answered === q.a ? 'tj-feedback--ok' : 'tj-feedback--ko'}" role="status">
          <strong>${answered === q.a ? 'Bonne réponse !' : 'Pas tout à fait.'}</strong>
          <p>${rich(q.why)}</p>
        </div>
        <button class="primary-btn tj-quiz__next" id="tj-next">${quiz.i + 1 < quiz.questions.length ? 'Question suivante' : 'Voir le résultat'}</button>
      ` : ''}
    </main>
  `;

  feather.replace();
  _bindExamples($app());
  _backToLesson($app().querySelector('.back-btn'));
  $app().querySelectorAll('[data-opt]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (quiz.answered !== null) return;
      quiz.answered = Number(btn.dataset.opt);
      if (quiz.answered === q.a) quiz.score++;
      _renderQuestion();
    });
  });
  document.getElementById('tj-next')?.addEventListener('click', () => {
    stopRange();
    quiz.answered = null;
    quiz.i++;
    if (quiz.i < quiz.questions.length) _renderQuestion();
    else _finishQuiz();
  });
  // Les questions d'écoute se lancent automatiquement
  if (q.ex && answered === null) $app().querySelector('[data-play="q"]')?.click();
}

async function _finishQuiz() {
  const { quiz, item, all, pos } = _state;
  const total = quiz.questions.length;
  const passed = quiz.score / total >= PASS_RATIO;
  const lessonId = item.lesson.id;
  const prev = _state.progress[lessonId];
  const record = {
    completed: Boolean(prev?.completed || passed),
    bestScore: Math.max(prev?.bestScore || 0, quiz.score),
    total,
    lastScore: quiz.score,
    updatedAt: new Date().toISOString(),
  };
  await db.saveLessonProgress(TAJWID_COURSE, lessonId, record);
  _state.progress[lessonId] = { ...record, lessonId };

  // Première validation : compte dans les statistiques globales
  if (passed && !prev?.completed) {
    try {
      const stats = await db.getStats('arabic');
      await db.saveStats('arabic', { ...stats, totalLessonsCompleted: (stats.totalLessonsCompleted || 0) + 1 });
    } catch {}
  }

  const next = all[pos + 1];
  const levelDone = item.level.lessons.every(l => _state.progress[l.id]?.completed);
  const isLastOfLevel = item.index === item.level.lessons.length - 1;
  const color = LEVEL_COLORS[item.levelIndex % LEVEL_COLORS.length];

  $app().innerHTML = `
    ${renderHeader({ title: 'Résultat', back: `/tajwid/niveau/${item.level.id}` })}
    <main class="page-content tj-result" style="--lvl:${color}">
      <div class="tj-result__emoji">${passed ? (levelDone && isLastOfLevel ? '🏆' : '🎉') : '💪'}</div>
      <div class="tj-result__score">${quiz.score} / ${total}</div>
      <p class="tj-result__msg">${passed
        ? (levelDone && isLastOfLevel
          ? `${escapeHtml(item.level.name)} terminé ! ${next ? 'Le niveau suivant est débloqué.' : 'Tu as terminé tout le parcours, mā shā’ Allāh !'}`
          : 'Leçon validée ! La suite est débloquée.')
        : `Il faut ${Math.ceil(total * PASS_RATIO)} bonnes réponses pour valider. Relis la leçon et réessaie.`}</p>
      <div class="tj-result__actions">
        ${passed && next ? `<button class="primary-btn" data-navigate="/tajwid/lecon/${next.lesson.id}">Leçon suivante : ${escapeHtml(next.lesson.title)}</button>` : ''}
        ${!passed ? `<button class="primary-btn" id="tj-retry">Recommencer le quiz</button>` : ''}
        <button class="secondary-btn" id="tj-reread">Relire la leçon</button>
        <button class="secondary-btn" data-navigate="/tajwid/niveau/${(next && passed ? next.level : item.level).id}">Retour au parcours</button>
      </div>
    </main>
  `;
  document.getElementById('tj-retry')?.addEventListener('click', _startQuiz);
  _backToLesson(document.getElementById('tj-reread'));
  feather.replace();
}

/** Le quiz partage l'URL de la leçon : le retour réaffiche la leçon sans navigation. */
function _backToLesson(btn) {
  if (!btn) return;
  btn.removeAttribute('data-navigate');
  btn.addEventListener('click', e => {
    e.preventDefault();
    stopRange();
    _state.quiz = null;
    _renderLesson();
  });
}
