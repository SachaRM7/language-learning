// js/quran/api.js — Données du Coran (Quran.com API v4 + Al Quran Cloud pour l'audio français)

import { parseTajweed } from './tajweed.js';

const API = 'https://api.quran.com/api/v4';
const AUDIO_ROOT = 'https://verses.quran.foundation/';
const FR_AUDIO_API = 'https://api.alquran.cloud/v1';
const TRANSLATION_ID = 31; // Muhammad Hamidullah (français)

// Récitations Quran.com disposant d'un minutage mot à mot (surbrillance synchronisée)
export const RECITERS = [
  { id: 7,  name: 'Mishary Rashid Alafasy',      style: '' },
  { id: 6,  name: 'Mahmoud Khalil Al-Husary',    style: '' },
  { id: 12, name: 'Mahmoud Khalil Al-Husary',    style: 'Mu‘allim — pédagogique, idéal pour le tajwid' },
  { id: 9,  name: 'Mohamed Siddiq Al-Minshawi',  style: 'Murattal' },
  { id: 8,  name: 'Mohamed Siddiq Al-Minshawi',  style: 'Mujawwad' },
  { id: 2,  name: 'Abdul Basit Abdul Samad',     style: 'Murattal' },
  { id: 1,  name: 'Abdul Basit Abdul Samad',     style: 'Mujawwad' },
  { id: 3,  name: 'Abdur-Rahman As-Sudais',      style: '' },
  { id: 10, name: 'Saud Ash-Shuraym',            style: '' },
  { id: 4,  name: 'Abu Bakr Ash-Shatri',         style: '' },
  { id: 5,  name: 'Hani Ar-Rifai',               style: '' },
  { id: 11, name: 'Mohamed Al-Tablawi',          style: '' },
];

export const DEFAULT_RECITER = 7;
export const FRENCH_NARRATOR = 'Youssouf Leclerc';
export const TRANSLATION_LABEL = 'Traduction de Muhammad Hamidullah';

export function reciterLabel(id) {
  const r = RECITERS.find(x => x.id === id) || RECITERS[0];
  return r.style ? `${r.name} (${r.style.split(' — ')[0]})` : r.name;
}

const _textCache = new Map();
const _audioCache = new Map();
const _frCache = new Map();
let _surahs = null;

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAllVerses(chapter, query) {
  const base = `${API}/verses/by_chapter/${chapter}?${query}&per_page=50`;
  const first = await getJson(`${base}&page=1`);
  const total = Number(first.pagination?.total_pages || 1);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, total - 1) }, (_, i) => getJson(`${base}&page=${i + 2}`))
  );
  return [first, ...rest].flatMap(p => p.verses || []);
}

export async function getSurahList() {
  if (!_surahs) _surahs = await fetch('data/quran/surahs.json').then(r => r.json());
  return _surahs;
}

function cleanTranslation(text = '') {
  return text
    .replace(/<sup[^>]*>.*?<\/sup>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texte : mots (tajwid + translittération) et traduction française. */
export async function getSurahText(chapter) {
  if (_textCache.has(chapter)) return _textCache.get(chapter);
  const promise = fetchAllVerses(
    chapter,
    `words=true&word_fields=text_uthmani,text_uthmani_tajweed,char_type_name&translations=${TRANSLATION_ID}&fields=text_uthmani`
  ).then(verses => verses.map(v => ({
    n: v.verse_number,
    key: v.verse_key,
    text: v.text_uthmani,
    fr: cleanTranslation(v.translations?.[0]?.text),
    words: (v.words || [])
      .filter(w => w.char_type_name === 'word')
      .map(w => ({
        pos: w.position,
        runs: parseTajweed(w.text_uthmani_tajweed || w.text_uthmani || ''),
        tr: w.transliteration?.text || '',
      })),
  })));
  _textCache.set(chapter, promise);
  promise.catch(() => _textCache.delete(chapter));
  return promise;
}

function audioUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:/.test(url)) return url;
  return AUDIO_ROOT + url.replace(/^\/+/, '');
}

/** Audio + minutage mot à mot d'une récitation : Map(numéro de verset → { url, segs }). */
export async function getSurahAudio(chapter, reciterId) {
  const key = `${chapter}:${reciterId}`;
  if (_audioCache.has(key)) return _audioCache.get(key);
  const promise = fetchAllVerses(chapter, `audio=${reciterId}&fields=verse_key`).then(verses => {
    const map = new Map();
    for (const v of verses) {
      const segs = (v.audio?.segments || [])
        .filter(s => Array.isArray(s) && s.length >= 4)
        .map(s => ({ pos: Number(s[1]), s: Number(s[2]), e: Number(s[3]) }))
        .filter(s => Number.isFinite(s.s) && Number.isFinite(s.e) && s.e > s.s);
      map.set(v.verse_number, { url: audioUrl(v.audio?.url), segs });
    }
    return map;
  });
  _audioCache.set(key, promise);
  promise.catch(() => _audioCache.delete(key));
  return promise;
}

/** Lecture de la traduction française (facultative). */
export async function getFrenchAudio(chapter) {
  if (_frCache.has(chapter)) return _frCache.get(chapter);
  const promise = getJson(`${FR_AUDIO_API}/surah/${chapter}/fr.leclerc`)
    .then(p => {
      const map = new Map();
      for (const a of p.data?.ayahs || []) {
        if (typeof a.audio === 'string' && a.audio.startsWith('https://')) map.set(a.numberInSurah, a.audio);
      }
      return map;
    })
    .catch(() => new Map());
  _frCache.set(chapter, promise);
  return promise;
}

/**
 * Minutage par mot pour un verset : [{ s, e }] aligné sur `words`.
 * Les mots sans minutage (segments fusionnés par certains récitateurs) héritent de leurs voisins.
 */
export function alignTimings(words, segs) {
  const byPos = new Map(segs.map(s => [s.pos, s]));
  const out = words.map(w => {
    const seg = byPos.get(w.pos);
    return seg ? { s: seg.s, e: seg.e } : null;
  });
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    const prev = out.slice(0, i).reverse().find(Boolean);
    const next = out.slice(i + 1).find(Boolean);
    const s = prev ? prev.e : 0;
    out[i] = { s, e: next ? Math.max(s + 1, next.s) : s + 400 };
  }
  return out;
}
