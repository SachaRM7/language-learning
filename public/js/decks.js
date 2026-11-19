// js/decks.js — Chargement unique de tous les decks : vocabulaire du cours + vocabulaire du Coran.
// Toutes les pages passent par ici, pour que les mots du Coran soient des cartes comme les autres
// (modes Mots, révision, quiz).

import { store } from './store.js';
import { buildQuranDecks, QURAN_THEME } from './quran.js';

let _loading = null;

export function ensureAllDecks() {
  if (store.get('decks') && store.get('quranDecksLoaded')) return Promise.resolve(store.get('decks'));
  if (!_loading) _loading = _load().finally(() => { _loading = null; });
  return _loading;
}

async function _load() {
  const course = store.get('currentCourse');
  let decks = store.get('decks');
  if (!decks) {
    decks = course ? (await fetch(course.decksFile).then(r => r.json()).catch(() => ({ decks: [] }))).decks : [];
  }
  let quran = [];
  try { quran = await buildQuranDecks(); } catch { /* données indisponibles : on continue sans */ }
  const merged = [...decks.filter(d => d.source !== 'quran'), ...quran];
  store.set('decks', merged);
  store.set('quranDecksLoaded', true);

  const themes = store.get('themes') || [];
  if (quran.length && !themes.some(t => t.id === QURAN_THEME.id)) {
    store.set('themes', [{ ...QURAN_THEME, decks: quran.map(d => d.id) }, ...themes]);
  }
  return merged;
}
