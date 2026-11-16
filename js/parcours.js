// js/parcours.js — Données et progression du Parcours guidé
// (intégration du projet « Apprends l'arabe » : modules → leçons → phrases de conversation MSA)

import { store } from './store.js';
import { db } from './db.js';
import { shuffle } from './utils.js';

export const PARCOURS_ID = 'parcours';
const MIGRATION_FLAG = 'ha-parcours-migrated';

// Couleurs de module (cycle)
const MODULE_TINTS = [
  { tint: 'var(--primary)', soft: 'var(--primary-soft)', grad: 'linear-gradient(135deg,#0E8C6D,#0A5E4A)' },
  { tint: 'var(--gold)',    soft: 'var(--gold-soft)',    grad: 'linear-gradient(135deg,#F0B544,#C97A12)' },
  { tint: 'var(--violet)',  soft: 'var(--violet-soft)',  grad: 'linear-gradient(135deg,#8F73F0,#5B3FC4)' },
  { tint: 'var(--info)',    soft: 'var(--info-soft)',    grad: 'linear-gradient(135deg,#4D86EA,#2350B8)' },
  { tint: 'var(--danger)',  soft: 'var(--danger-soft)',  grad: 'linear-gradient(135deg,#F07A5A,#C9452F)' },
];
export const moduleTint = i => MODULE_TINTS[i % MODULE_TINTS.length];

export async function loadParcours() {
  let data = store.get('parcours');
  if (!data) {
    data = await fetch('data/parcours.json').then(r => r.json());
    store.set('parcours', data);
  }
  return data;
}

/** Sépare « السَّلَام - La salutation » en { ar, fr } */
export function splitTitle(title = '') {
  const clean = title.replace(/^🔄\s*/, '');
  const idx = clean.indexOf(' - ');
  if (idx === -1) return { ar: '', fr: clean };
  const left = clean.slice(0, idx).trim();
  const right = clean.slice(idx + 3).trim();
  return /[؀-ۿ]/.test(left) ? { ar: left, fr: right } : { ar: right, fr: left };
}

/** Migration unique depuis l'ancienne app (localStorage 'arabicLearning', même origine GitHub Pages). */
async function migrateLegacy() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    const raw = localStorage.getItem('arabicLearning');
    if (raw) {
      const legacy = JSON.parse(raw);
      for (const lessonId of legacy.completedLessons || []) {
        const existing = await db.getLessonProgress(PARCOURS_ID, lessonId);
        if (!existing?.completed) {
          await db.saveLessonProgress(PARCOURS_ID, lessonId, {
            completed: true, stars: 1, bestScore: 60, attempts: 1, completedAt: Date.now(), migrated: true,
          });
        }
      }
    }
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch { /* stockage indisponible : on ignore */ }
}

/** État complet : progression par leçon, verrous, leçon courante, stats. */
export async function getParcoursState() {
  const data = await loadParcours();
  await migrateLegacy();
  const records = await db.getAllLessonProgress(PARCOURS_ID);
  const progress = Object.fromEntries(records.map(r => [r.lessonId, r]));
  const isDone = id => !!progress[id]?.completed;

  const moduleDone = m => m.lessons.every(l => isDone(l.id));
  const modules = data.modules.map((m, mi) => {
    const unlocked = !m.requires || m.requires.every(reqId => {
      const req = data.modules.find(x => x.id === reqId);
      return req ? moduleDone(req) : true;
    });
    const lessons = m.lessons.map((l, li) => {
      const lessonUnlocked = unlocked && (!l.requires || l.requires.every(isDone));
      return {
        ...l,
        index: li,
        moduleId: m.id,
        titleParts: splitTitle(l.title),
        done: isDone(l.id),
        stars: progress[l.id]?.stars || 0,
        bestScore: progress[l.id]?.bestScore || 0,
        unlocked: lessonUnlocked,
        phraseCount: l.isReview ? reviewPhrasesFor(m).length : (l.phrases || []).length,
      };
    });
    const doneCount = lessons.filter(l => l.done).length;
    return { ...m, index: mi, tint: moduleTint(mi), unlocked, lessons, doneCount, pct: Math.round((doneCount / lessons.length) * 100) };
  });

  const allLessons = modules.flatMap(m => m.lessons);
  const current = allLessons.find(l => l.unlocked && !l.done) || null;
  const total = allLessons.length;
  const completed = allLessons.filter(l => l.done).length;
  const phrasesLearned = allLessons.filter(l => l.done && !l.isReview).reduce((n, l) => n + l.phraseCount, 0);
  const stars = allLessons.reduce((n, l) => n + l.stars, 0);

  return { data, modules, current, total, completed, pct: total ? Math.round((completed / total) * 100) : 0, phrasesLearned, stars };
}

/** Phrases d'une leçon de révision : celles des autres leçons du module. */
export function reviewPhrasesFor(module, max = 8) {
  const pool = module.lessons.filter(l => !l.isReview).flatMap(l => l.phrases || []);
  return shuffle(pool).slice(0, max);
}

export function findLesson(data, lessonId) {
  for (const m of data.modules) {
    const lesson = m.lessons.find(l => l.id === lessonId);
    if (lesson) return { module: m, lesson };
  }
  return null;
}

/** Toutes les phrases du parcours indexées par id. */
export function phraseIndex(data) {
  const map = {};
  data.modules.forEach(m => m.lessons.forEach(l => (l.phrases || []).forEach(p => { map[p.id] = { ...p, lessonId: l.id, moduleId: m.id }; })));
  return map;
}

export async function getDuePhrases() {
  const data = await loadParcours();
  const idx = phraseIndex(data);
  const due = await db.getDueWords(PARCOURS_ID);
  return due.map(e => idx[e.cardId]).filter(Boolean);
}

export function starsFor(score) {
  if (score >= 90) return 3;
  if (score >= 60) return 2;
  return 1;
}
