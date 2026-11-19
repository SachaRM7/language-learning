// js/quran/player-prefs.js — Préférences de récitation (récitateur, vitesse, affichage), partagées par
// le lecteur de sourate, la mémorisation et la murājaʿa. Stockées dans preferences.quranPlayer.

import { db } from '../db.js';
import { store } from '../store.js';
import { AUDIO_VERSE } from '../quran.js';
import { DEFAULT_RECITER, RECITERS, getRecitation } from './recitation.js';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const REPEATS = [1, 2, 3, 5, 10, Infinity];
export const LOOP_CYCLES = [1, 3, 5, 10, Infinity];
export const FONT_SIZES = [
  { id: 's', size: '1.55rem' },
  { id: 'm', size: '1.95rem' },
  { id: 'l', size: '2.35rem' },
  { id: 'xl', size: '2.8rem' },
];
export const AUDIO_LANGS = [
  { id: 'ar', label: 'Arabe' },
  { id: 'fr', label: 'Français' },
  { id: 'ar-fr', label: 'Arabe puis français' },
];

const DEFAULTS = {
  reciter: DEFAULT_RECITER,
  rate: 1,
  audioLang: 'ar',
  repeat: 1,
  loopPause: 0,
  tajweed: true,
  translit: false,
  memorize: false,
  autoScroll: true,
  fontSize: 'm',
};

export function getPlayerPrefs() {
  const q = { ...DEFAULTS, ...(store.get('preferences')?.quranPlayer || {}) };
  if (!RECITERS.some(r => r.id === q.reciter)) q.reciter = DEFAULT_RECITER;
  if (!SPEEDS.includes(q.rate)) q.rate = 1;
  if (q.repeat === 0) q.repeat = Infinity; // Infinity n'existe pas en JSON
  if (!REPEATS.includes(q.repeat)) q.repeat = 1;
  if (!FONT_SIZES.some(f => f.id === q.fontSize)) q.fontSize = 'm';
  return q;
}

let _timer = null;

export function savePlayerPrefs(patch) {
  const next = { ...getPlayerPrefs(), ...patch };
  const prefs = { ...(store.get('preferences') || {}), quranPlayer: { ...next, repeat: next.repeat === Infinity ? 0 : next.repeat } };
  store.set('preferences', prefs);
  clearTimeout(_timer);
  _timer = setTimeout(() => db.savePreferences(prefs).catch(() => {}), 300);
  return next;
}

export const fontSizeOf = id => (FONT_SIZES.find(f => f.id === id) || FONT_SIZES[1]).size;

/**
 * URL de la récitation d'un verset avec le récitateur choisi (mémorisation, murājaʿa).
 * Repli sur la récitation d'Alafasy embarquée dans les données si l'API est injoignable.
 */
export async function preferredVerseUrl(surahId, verse) {
  const fallback = AUDIO_VERSE + verse.audio;
  const { reciter } = getPlayerPrefs();
  if (reciter === DEFAULT_RECITER) return fallback;
  try {
    const map = await Promise.race([getRecitation(surahId, reciter), new Promise((_, rej) => setTimeout(rej, 4000))]);
    return map.get(verse.n)?.url || fallback;
  } catch { return fallback; }
}
