// js/activity.js — Série (streak), XP quotidien et statistiques globales.
// Toutes les activités d'apprentissage (mots, dialogues, parcours, révision) passent par recordActivity().

import { db } from './db.js';

export const DAILY_GOAL_DEFAULT = 20; // XP / jour (1 bonne réponse = 1 XP, leçon terminée = +5)

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(key, n) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/**
 * Enregistre une activité et met à jour la série.
 * @param {string} courseId
 * @param {{correct?:number, wrong?:number, lessons?:number, words?:number, reviewSession?:boolean}} delta
 */
export async function recordActivity(courseId, delta = {}) {
  const { correct = 0, wrong = 0, lessons = 0, words = 0, reviewSession = false } = delta;
  const stats = await db.getStats(courseId);
  const today = dayKey();
  const yesterday = addDays(today, -1);
  const newDay = stats.lastActiveDate !== today;
  const previousLevel = Math.floor((stats.totalXP || 0) / 100) + 1;

  if (stats.lastActiveDate !== today) {
    stats.currentStreak = stats.lastActiveDate === yesterday ? (stats.currentStreak || 0) + 1 : 1;
    stats.lastActiveDate = today;
  }
  stats.longestStreak = Math.max(stats.longestStreak || 0, stats.currentStreak);

  const xp = correct + lessons * 5;
  stats.activityLog = stats.activityLog || {};
  stats.activityLog[today] = (stats.activityLog[today] || 0) + xp;
  // Ne garder que ~90 jours
  const keys = Object.keys(stats.activityLog).sort();
  while (keys.length > 90) delete stats.activityLog[keys.shift()];

  stats.totalXP = (stats.totalXP || 0) + xp;
  stats.totalCorrectAnswers = (stats.totalCorrectAnswers || 0) + correct;
  stats.totalWrongAnswers = (stats.totalWrongAnswers || 0) + wrong;
  stats.totalLessonsCompleted = (stats.totalLessonsCompleted || 0) + lessons;
  stats.totalWordsEncountered = (stats.totalWordsEncountered || 0) + words;
  if (reviewSession) stats.totalReviewSessions = (stats.totalReviewSessions || 0) + 1;

  // weeklyActivity hérité : index 0 = lundi
  const wd = (new Date().getDay() + 6) % 7;
  stats.weeklyActivity = last7Days(stats).map(d => d.xp);
  stats.weeklyActivity[wd] = stats.activityLog[today];

  await db.saveStats(courseId, stats);
  if (typeof window !== 'undefined') {
    const level = Math.floor(stats.totalXP / 100) + 1;
    window.dispatchEvent(new CustomEvent('learning:reward', { detail: {
      xp, todayXP: stats.activityLog[today], newDay, streak: stats.currentStreak,
      level, levelUp: level > previousLevel,
    } }));
  }
  return stats;
}

/** Série affichable : retombe à 0 si le dernier jour actif est avant-hier ou plus ancien. */
export function liveStreak(stats) {
  if (!stats?.lastActiveDate) return 0;
  const today = dayKey();
  if (stats.lastActiveDate === today || stats.lastActiveDate === addDays(today, -1)) {
    return stats.currentStreak || 0;
  }
  return 0;
}

export function todayXP(stats) {
  return stats?.activityLog?.[dayKey()] || 0;
}

/** 7 derniers jours (du plus ancien à aujourd'hui) : [{key, label, xp, isToday}] */
export function last7Days(stats) {
  const today = dayKey();
  const labels = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(today, i - 6);
    const d = new Date(key + 'T12:00:00');
    return { key, label: labels[d.getDay()], xp: stats?.activityLog?.[key] || 0, isToday: key === today };
  });
}
