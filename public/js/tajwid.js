// js/tajwid.js — Parcours Tajwid : données (data/tajwid/levels.json) et progression.
// Même logique que le Parcours guidé : niveaux = modules débloqués un par un, leçons validées
// par un quiz (au moins 60 %), étoiles selon le score. Progression : lessonProgress, courseId « tajwid ».

import { store } from './store.js';
import { db } from './db.js';
import { moduleTint, starsFor } from './parcours.js';

export const TAJWID_ID = 'tajwid';
export const PASS_SCORE = 60;
const EMOJIS = ['🌱', '🗣️', '👃', '👄', '〰️', '🏆'];

export { starsFor };

export async function loadTajwid() {
  let data = store.get('tajwid');
  if (!data) {
    data = await fetch('data/tajwid/levels.json').then(r => r.json());
    store.set('tajwid', data);
  }
  return data;
}

const unlockAll = () => Boolean(store.get('preferences')?.tajwidUnlockAll);

export async function setUnlockAll(on = true) {
  const prefs = { ...(store.get('preferences') || {}), tajwidUnlockAll: on };
  store.set('preferences', prefs);
  await db.savePreferences(prefs);
}

/** État complet : niveaux, leçons (verrous, étoiles), leçon courante, totaux. */
export async function getTajwidState() {
  const data = await loadTajwid();
  const records = await db.getAllLessonProgress(TAJWID_ID);
  const progress = Object.fromEntries(records.map(r => [r.lessonId, r]));
  const isDone = id => Boolean(progress[id]?.completed);
  const all = unlockAll();

  let previousLevelDone = true;
  const levels = data.levels.map((lvl, li) => {
    const unlocked = all || previousLevelDone;
    let previousDone = true;
    const lessons = lvl.lessons.map((l, i) => {
      const lessonUnlocked = unlocked && (all || previousDone);
      const done = isDone(l.id);
      previousDone = done;
      return {
        ...l,
        index: i,
        levelId: lvl.id,
        done,
        unlocked: lessonUnlocked,
        stars: progress[l.id]?.stars || 0,
        bestScore: progress[l.id]?.bestScore || 0,
        exampleCount: l.blocks.filter(b => b.t === 'ex').length,
      };
    });
    const doneCount = lessons.filter(l => l.done).length;
    previousLevelDone = doneCount === lessons.length;
    return {
      ...lvl,
      index: li,
      emoji: EMOJIS[li % EMOJIS.length],
      tint: moduleTint(li),
      unlocked,
      lessons,
      doneCount,
      pct: Math.round((doneCount / lessons.length) * 100),
    };
  });

  const allLessons = levels.flatMap(l => l.lessons);
  const completed = allLessons.filter(l => l.done).length;
  return {
    data,
    levels,
    reciter: data.reciter,
    unlockAll: all,
    current: allLessons.find(l => l.unlocked && !l.done) || null,
    total: allLessons.length,
    completed,
    pct: allLessons.length ? Math.round((completed / allLessons.length) * 100) : 0,
    stars: allLessons.reduce((n, l) => n + l.stars, 0),
  };
}

export function findTajwidLesson(state, lessonId) {
  for (const level of state.levels) {
    const lesson = level.lessons.find(l => l.id === lessonId);
    if (lesson) return { level, lesson };
  }
  return null;
}
