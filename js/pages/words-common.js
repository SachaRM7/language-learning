// js/pages/words-common.js — Briques partagées du mode Mots :
// chargement des decks, résolution thème→decks, moteur de quiz (QCM / écrit), écran de résultat.

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { shuffle, escapeHtml, checkWrittenAnswer } from '../utils.js';
import { db } from '../db.js';
import { createSRSEntry, processAnswer } from '../srs.js';
import { playWord } from '../audio.js';
import { icon } from '../icons.js';
import { progressBar, ring, showFeedback, haptic, confetti } from '../ui.js';
import { recordActivity } from '../activity.js';

export const $app = () => document.getElementById('app');

// ── Données ───────────────────────────────────────────────────────

export async function ensureDecks() {
  if (store.get('decks')) return store.get('decks');
  const course = store.get('currentCourse');
  if (!course) return [];
  const data = await fetch(course.decksFile).then(r => r.json());
  store.set('decks', data.decks);
  return data.decks;
}

// Identifiants de themes.json qui ne correspondent pas aux decks générés
const DECK_ALIASES = { 'jours-semaine': 'jours', 'mois-annee': 'mois' };
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/** Decks d'un thème (gère les alias + rattache les decks orphelins par catégorie). */
export function themeDecks(theme, decks, themes = store.get('themes') || []) {
  const byId = new Map(decks.map(d => [d.id, d]));
  const listed = theme.decks.map(id => byId.get(id) || byId.get(DECK_ALIASES[id])).filter(Boolean);
  const assigned = new Set(themes.flatMap(t => t.decks.map(id => DECK_ALIASES[id] || id)));
  const orphans = decks.filter(d => !assigned.has(d.id) && d.source !== 'lesson' && norm(d.category) === norm(theme.name));
  return [...new Set([...listed, ...orphans])];
}

export function findThemeForDeck(deckId) {
  const themes = store.get('themes') || [];
  const decks = store.get('decks') || [];
  return themes.find(t => themeDecks(t, decks, themes).some(d => d.id === deckId)) || null;
}

/** Résout le deck courant à partir des paramètres de route (thème ou leçon). */
export async function resolveDeck(params) {
  const { themeId, deckId, lessonId } = params;
  const actualDeckId = lessonId ? `lesson-vocab-${lessonId}` : deckId;
  const backPath = lessonId ? `/mots/lecons/${lessonId}` : `/mots/${themeId}/${deckId}`;
  if (!lessonId) await ensureDecks();
  const deck = (store.get('decks') || []).find(d => d.id === actualDeckId);
  if (!deck) { navigate(backPath); return null; }
  return { deck, backPath, actualDeckId, themeId, lessonId, course: store.get('currentCourse') };
}

export function srsStats(deck, srsEntries) {
  const prefix = deck.id + ':';
  const mine = srsEntries.filter(e => e.cardId.startsWith(prefix));
  const acquired = mine.filter(e => e.box >= 4).length;
  const learning = mine.filter(e => e.box >= 1 && e.box <= 3).length;
  const total = deck.cards.length;
  return { total, acquired, learning, fresh: Math.max(0, total - acquired - learning), pct: total ? Math.round(acquired / total * 100) : 0 };
}

export const hasArabic = s => /[؀-ۿ]/.test(s || '');
export function deckEmoji(deck) {
  const e = deck.cards.find(c => c.emoji)?.emoji;
  if (!e) return '📚';
  // Ne garder que le premier graphème (certains decks ont « 👧👦 »)
  try { return [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(e)][0].segment; } catch { return e; }
}

/** Teinte douce à partir d'une couleur de thème (pastel). */
export const tintStyle = color => `--tint:${escapeHtml(color || 'var(--primary)')}`;

// ── Audio ─────────────────────────────────────────────────────────

export async function speak(btn, text, lang, rate) {
  if (!text) return;
  btn?.classList.add('is-playing');
  try {
    if (rate) {
      await new Promise(res => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang; u.rate = rate; u.onend = res; u.onerror = res;
        speechSynthesis.speak(u);
      });
    } else {
      await playWord(text, lang);
    }
  } finally {
    btn?.classList.remove('is-playing');
  }
}

// ── Raccourcis clavier (un seul handler actif à la fois) ─────────

let _keyHandler = null;
export function setKeyHandler(fn) {
  if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
  _keyHandler = fn ? e => {
    if (!document.querySelector('[data-words-session]')) { setKeyHandler(null); return; }
    if (document.querySelector('.modal-overlay')) return;
    fn(e);
  } : null;
  if (_keyHandler) document.addEventListener('keydown', _keyHandler);
}

// ── Barre de session ──────────────────────────────────────────────

export function sessionBar(done, total, { left = '', right = '' } = {}) {
  return `
    <div class="session-bar">
      ${left}
      ${progressBar(total ? (done / total) * 100 : 0)}
      ${right || `<span class="session-bar__count">${Math.min(done, total)}/${total}</span>`}
    </div>`;
}

// ── Écriture SRS différée ─────────────────────────────────────────

export async function flushSRS(courseId, pending) {
  for (const entry of pending.splice(0)) {
    await db.updateSRS(courseId, entry.cardId, entry.srsData);
  }
}

export function scoreSRS(state, card, isCorrect) {
  const entry = state.srsMap[card.id] || createSRSEntry(state.course.id, card.id);
  const updated = processAnswer(entry, isCorrect);
  state.srsMap[card.id] = updated;
  state.pendingSRS.push({ cardId: card.id, srsData: updated });
}

// ── Écran de résultat ─────────────────────────────────────────────

/**
 * @param {object} o
 * @param {string} o.backPath
 * @param {number|null} o.pct           score (affiche un anneau) ou null
 * @param {string} o.emoji
 * @param {string} o.title
 * @param {string} [o.subtitle]
 * @param {Array<{value:any,label:string,color?:string}>} [o.stats]
 * @param {string} [o.extraHtml]
 * @param {string} [o.restartLabel]
 * @param {Function} o.onRestart
 * @param {object} [o.activity]          delta pour recordActivity
 */
export function renderResult(o) {
  const course = store.get('currentCourse');
  setKeyHandler(null);
  const celebrate = o.pct == null ? true : o.pct >= 80;
  $app().innerHTML = `
    ${renderHeader({ title: 'Session terminée', close: o.backPath })}
    <main class="result words-result">
      <div class="words-result__hero">
        ${o.pct != null ? `<div class="words-result__ring">${ring(o.pct, { size: 148, stroke: 12, label: `${o.pct}%` })}<span class="words-result__badge">${o.emoji}</span></div>`
          : `<div class="result__emoji">${o.emoji}</div>`}
      </div>
      <h2 class="result__title">${escapeHtml(o.title)}</h2>
      ${o.subtitle ? `<p class="result__subtitle">${escapeHtml(o.subtitle)}</p>` : ''}
      ${o.stats?.length ? `
        <div class="result__stats">
          ${o.stats.map(s => `
            <div class="stat-tile">
              <div class="stat-tile__value" ${s.color ? `style="color:${s.color}"` : ''}>${s.value}</div>
              <div class="stat-tile__label">${escapeHtml(s.label)}</div>
            </div>`).join('')}
        </div>` : ''}
      ${o.extraHtml || ''}
      <div class="result__actions">
        <button class="btn btn--primary btn--block btn--lg" id="btn-restart">${icon('rotate-ccw')}${escapeHtml(o.restartLabel || 'Recommencer')}</button>
        <button class="btn btn--ghost btn--block" data-navigate="${escapeHtml(o.backPath)}">Retour au deck</button>
      </div>
    </main>
  `;
  document.getElementById('btn-restart')?.addEventListener('click', o.onRestart);
  if (celebrate) setTimeout(() => confetti(), 250);
  haptic(celebrate ? [10, 40, 10] : 10);
  if (o.activity && course) recordActivity(course.id, o.activity).catch(() => {});
}

export function resultCopy(pct) {
  if (pct >= 90) return { emoji: '🏆', title: 'Magnifique !', subtitle: 'Tu maîtrises ce deck.' };
  if (pct >= 70) return { emoji: '🌟', title: 'Très bien !', subtitle: 'Encore un petit effort et c’est acquis.' };
  if (pct >= 40) return { emoji: '💪', title: 'Bon travail', subtitle: 'La répétition fera le reste.' };
  return { emoji: '🌱', title: 'Chaque essai compte', subtitle: 'Reviens demain, tu verras la différence.' };
}

// ── Moteur de quiz ────────────────────────────────────────────────

/**
 * Lance une session de questions.
 * @param {object} cfg
 * @param {string} cfg.title
 * @param {string} cfg.backPath
 * @param {object} cfg.course
 * @param {object} cfg.deck
 * @param {Array}  cfg.cards
 * @param {boolean} [cfg.retry=true]     re-poser les cartes ratées en fin de file
 * @param {Function} cfg.prompt          (card, ctx) => html de la question
 * @param {Function} cfg.answerOf        card => réponse attendue (string)
 * @param {Function} [cfg.choicePool]    card => liste des réponses possibles (distracteurs)
 * @param {Function} [cfg.feedbackHtml]  (card, isCorrect, answer) => html
 * @param {Function} [cfg.onMount]       (card, root) => void (ex. lecture audio)
 * @param {() => {written:boolean, level:string}} cfg.getMode
 * @param {Array} [cfg.actions]          actions d'en-tête
 * @param {Function} [cfg.onAction]      (id, session) => void
 * @param {Function} cfg.onFinish        (session) => void
 */
export async function createQuiz(cfg) {
  const srsAll = await db.getSRS(cfg.course.id);
  const s = {
    cfg,
    course: cfg.course,
    srsMap: Object.fromEntries(srsAll.map(e => [e.cardId, e])),
    pendingSRS: [],
    queue: [], retrySet: new Set(), mastered: new Set(),
    correct: 0, wrong: 0, results: [], answered: false,
  };
  s.reset = () => {
    s.queue = [...cfg.cards];
    s.retrySet.clear(); s.mastered.clear();
    s.correct = 0; s.wrong = 0; s.results = []; s.pendingSRS = [];
    renderQuestion(s);
  };
  s.rerender = () => renderQuestion(s);
  s.reset();
  return s;
}

function _choices(s, card) {
  const answer = s.cfg.answerOf(card);
  const pool = (s.cfg.choicePool ? s.cfg.choicePool(card) : s.cfg.deck.cards.filter(c => c.id !== card.id).map(s.cfg.answerOf))
    .filter(v => v && v !== answer);
  return shuffle([answer, ...shuffle([...new Set(pool)]).slice(0, 3)]);
}

function renderQuestion(s) {
  const { cfg } = s;
  const card = s.queue[0];
  if (!card) { finish(s); return; }

  const total = cfg.cards.length;
  const done = cfg.retry === false ? s.results.length : s.mastered.size;
  const isRetry = s.retrySet.has(card.id);
  const { written, level } = cfg.getMode();
  const answer = cfg.answerOf(card);
  const arAnswer = hasArabic(answer);

  const answerHTML = written
    ? `<form class="written-form" id="written-form" autocomplete="off">
        <input class="written-input ${arAnswer ? 'written-input--ar' : ''}" id="written-input" type="text"
          placeholder="${arAnswer ? 'اكتب الجواب…' : 'Ta réponse…'}" ${arAnswer ? 'dir="rtl" lang="ar"' : ''}
          autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
        <button class="btn btn--primary btn--block btn--lg" type="submit">Valider</button>
      </form>`
    : `<div class="choice-grid">
        ${_choices(s, card).map((c, i) => `
          <button class="choice-btn ${hasArabic(c) ? 'choice-btn--ar' : ''}" data-value="${escapeHtml(c)}">
            <span class="choice-btn__key">${i + 1}</span><span class="choice-btn__label">${escapeHtml(c)}</span>
          </button>`).join('')}
      </div>`;

  $app().innerHTML = `
    ${renderHeader({ title: cfg.title, close: cfg.backPath, actions: cfg.actions || [] })}
    <main class="page-content quiz" data-words-session>
      ${sessionBar(done, total)}
      <section class="learn-question quiz__prompt">
        ${isRetry ? `<span class="badge badge--gold quiz__retry">${icon('rotate-ccw')}Encore une fois</span>` : ''}
        ${cfg.prompt(card, { isRetry })}
      </section>
      <div class="quiz__answers">${answerHTML}</div>
    </main>
  `;

  s.answered = false;
  const root = $app();
  root.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => cfg.onAction?.(btn.dataset.action, s)));

  if (written) {
    const input = document.getElementById('written-input');
    document.getElementById('written-form')?.addEventListener('submit', e => {
      e.preventDefault();
      if (s.answered || !input.value.trim()) return;
      const ok = checkWrittenAnswer(input.value, answer, level);
      input.classList.add(ok ? 'is-correct' : 'is-wrong');
      input.readOnly = true;
      answerCard(s, card, ok, answer);
    });
    setTimeout(() => input?.focus({ preventScroll: true }), 80);
    setKeyHandler(() => {});
  } else {
    const btns = [...root.querySelectorAll('.choice-btn')];
    const pick = btn => {
      if (s.answered) return;
      const ok = btn.dataset.value === answer;
      btn.classList.add(ok ? 'is-correct' : 'is-wrong');
      if (!ok) btns.find(b => b.dataset.value === answer)?.classList.add('is-correct');
      btns.forEach(b => { b.disabled = true; });
      answerCard(s, card, ok, answer);
    };
    btns.forEach(b => b.addEventListener('click', () => pick(b)));
    setKeyHandler(e => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length) { e.preventDefault(); pick(btns[n - 1]); }
    });
  }
  cfg.onMount?.(card, root);
}

async function answerCard(s, card, ok, answer) {
  s.answered = true;
  if (ok) { s.correct++; s.retrySet.delete(card.id); s.mastered.add(card.id); }
  else { s.wrong++; if (s.cfg.retry !== false) s.retrySet.add(card.id); }
  s.results.push({ card, isCorrect: ok, answer });
  scoreSRS(s, card, ok);

  const html = s.cfg.feedbackHtml
    ? s.cfg.feedbackHtml(card, ok, answer)
    : (ok ? '' : `Bonne réponse : <strong class="${hasArabic(answer) ? 'text-ar' : ''}">${escapeHtml(answer)}</strong>`);
  await showFeedback({ correct: ok, html });

  if (!document.querySelector('[data-words-session]')) return; // l'utilisateur a quitté
  const done = s.queue.shift();
  if (done && s.retrySet.has(done.id)) s.queue.push(done);
  renderQuestion(s);
}

async function finish(s) {
  await flushSRS(s.course.id, s.pendingSRS);
  s.cfg.onFinish(s);
}

/** Feedback standard : rappelle le mot arabe, sa translittération et sa traduction. */
export function wordRecap(card, { showTranslit = true } = {}) {
  return `
    <span class="word-recap">
      <span class="text-ar word-recap__ar">${escapeHtml(card.front)}</span>
      <span class="word-recap__meta">${showTranslit && card.translit ? `<em>${escapeHtml(card.translit)}</em> · ` : ''}${escapeHtml(card.back)}</span>
    </span>`;
}
