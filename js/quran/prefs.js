// js/quran/prefs.js — Préférences du lecteur Coran (persistées dans IndexedDB)

import { db } from '../db.js';
import { store } from '../store.js';
import { DEFAULT_RECITER, RECITERS } from './api.js';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const REPEATS = [1, 2, 3, 5, 10, Infinity];
export const LOOP_CYCLES = [1, 3, 5, 10, Infinity];
export const FONT_SIZES = [
  { id: 's', label: 'A', scale: 1.5 },
  { id: 'm', label: 'A', scale: 1.85 },
  { id: 'l', label: 'A', scale: 2.25 },
  { id: 'xl', label: 'A', scale: 2.7 },
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
  showTajweed: true,
  showTranslation: true,
  showTranslit: false,
  memorize: false,
  autoScroll: true,
  fontSize: 'm',
  last: null,
};

export function getQuranPrefs() {
  const prefs = store.get('preferences') || {};
  const q = { ...DEFAULTS, ...(prefs.quran || {}) };
  if (!RECITERS.some(r => r.id === q.reciter)) q.reciter = DEFAULT_RECITER;
  if (!SPEEDS.includes(q.rate)) q.rate = 1;
  // Infinity n'est pas sérialisable en JSON : stocké comme 0
  if (q.repeat === 0) q.repeat = Infinity;
  if (!REPEATS.includes(q.repeat)) q.repeat = 1;
  return q;
}

let _saveTimer = null;

export function saveQuranPrefs(patch) {
  const prefs = store.get('preferences') || {};
  const current = getQuranPrefs();
  const next = { ...current, ...patch };
  const stored = { ...next, repeat: next.repeat === Infinity ? 0 : next.repeat };
  const merged = { ...prefs, quran: stored };
  store.set('preferences', merged);
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => db.savePreferences(merged).catch(() => {}), 300);
  return next;
}
