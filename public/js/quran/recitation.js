// js/quran/recitation.js — Récitations du Coran : récitateurs, minutage mot à mot, couleurs de tajwid,
// lecture d'un extrait. Source : API publique Quran.com v4 (CORS ouvert), lecture française : Al Quran Cloud.
// Le texte, la traduction et le découpage mot à mot restent ceux de l'app (data/quran, /api/quran/surah).

import { escapeHtml } from '../utils.js';

const API = 'https://api.quran.com/api/v4';
const AUDIO_ROOT = 'https://verses.quran.foundation/';
const FR_AUDIO_API = 'https://api.alquran.cloud/v1';

// Récitations disposant d'un minutage mot à mot (surbrillance synchronisée)
export const RECITERS = [
  { id: 7,  name: 'Mishary Rashid Alafasy',     style: '' },
  { id: 6,  name: 'Mahmoud Khalil Al-Husary',   style: '' },
  { id: 12, name: 'Mahmoud Khalil Al-Husary',   style: 'Mu‘allim · pédagogique, idéal pour le tajwid' },
  { id: 9,  name: 'Mohamed Siddiq Al-Minshawi', style: 'Murattal' },
  { id: 8,  name: 'Mohamed Siddiq Al-Minshawi', style: 'Mujawwad' },
  { id: 2,  name: 'Abdul Basit Abdul Samad',    style: 'Murattal' },
  { id: 1,  name: 'Abdul Basit Abdul Samad',    style: 'Mujawwad' },
  { id: 3,  name: 'Abdur-Rahman As-Sudais',     style: '' },
  { id: 10, name: 'Saud Ash-Shuraym',           style: '' },
  { id: 4,  name: 'Abu Bakr Ash-Shatri',        style: '' },
  { id: 5,  name: 'Hani Ar-Rifai',              style: '' },
  { id: 11, name: 'Mohamed Al-Tablawi',         style: '' },
];
export const DEFAULT_RECITER = 7;
export const FRENCH_NARRATOR = 'Youssouf Leclerc';

export function reciterLabel(id) {
  const r = RECITERS.find(x => x.id === id) || RECITERS[0];
  return r.style ? `${r.name} (${r.style.split(' · ')[0]})` : r.name;
}

const _audio = new Map();
const _tajweed = new Map();
const _fr = new Map();

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function allVerses(chapter, query) {
  const base = `${API}/verses/by_chapter/${chapter}?${query}&per_page=50`;
  const first = await getJson(`${base}&page=1`);
  const total = Number(first.pagination?.total_pages || 1);
  const rest = await Promise.all(Array.from({ length: Math.max(0, total - 1) }, (_, i) => getJson(`${base}&page=${i + 2}`)));
  return [first, ...rest].flatMap(p => p.verses || []);
}

function cached(map, key, load) {
  if (!map.has(key)) {
    const p = load();
    map.set(key, p);
    p.catch(() => map.delete(key));
  }
  return map.get(key);
}

export function absoluteAudioUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:/.test(url)) return url;
  return AUDIO_ROOT + url.replace(/^\/+/, '');
}

/** Audio + minutage d'une récitation : Map(n° de verset → { url, segs:[{pos,s,e}] }). */
export function getRecitation(chapter, reciterId) {
  return cached(_audio, `${chapter}:${reciterId}`, async () => {
    const verses = await allVerses(chapter, `audio=${reciterId}&fields=verse_key`);
    const map = new Map();
    for (const v of verses) {
      const segs = (v.audio?.segments || [])
        .filter(s => Array.isArray(s) && s.length >= 4)
        .map(s => ({ pos: Number(s[1]), s: Number(s[2]), e: Number(s[3]) }))
        .filter(s => Number.isFinite(s.s) && Number.isFinite(s.e) && s.e > s.s);
      map.set(v.verse_number, { url: absoluteAudioUrl(v.audio?.url), segs });
    }
    return map;
  });
}

/** Texte balisé tajwid : Map(n° de verset → [runs du mot 1, runs du mot 2, …]). */
export function getTajweed(chapter) {
  return cached(_tajweed, chapter, async () => {
    const verses = await allVerses(chapter, 'words=true&word_fields=text_uthmani_tajweed,char_type_name&fields=verse_key');
    return new Map(verses.map(v => [
      v.verse_number,
      (v.words || []).filter(w => w.char_type_name === 'word').map(w => parseTajweed(w.text_uthmani_tajweed || '')),
    ]));
  });
}

/** Lecture de la traduction française (facultative) : Map(n° de verset → url). */
export function getFrenchRecitation(chapter) {
  return cached(_fr, chapter, async () => {
    try {
      const p = await getJson(`${FR_AUDIO_API}/surah/${chapter}/fr.leclerc`);
      const map = new Map();
      for (const a of p.data?.ayahs || []) {
        if (typeof a.audio === 'string' && a.audio.startsWith('https://')) map.set(a.numberInSurah, a.audio);
      }
      return map;
    } catch { return new Map(); }
  });
}

/** Minutage par mot d'un verset ([{s,e}] aligné sur les mots). Les trous héritent des voisins. */
export function alignTimings(wordCount, segs) {
  const byPos = new Map(segs.map(s => [s.pos, s]));
  const out = Array.from({ length: wordCount }, (_, i) => {
    const seg = byPos.get(i + 1);
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

// ── Couleurs de tajwid ───────────────────────────────────────────────

const RULE_GROUP = {
  ham_wasl: 'silent', slnt: 'silent', laam_shamsiyah: 'silent',
  madda_normal: 'madd2', madda_permissible: 'madd246',
  madda_obligatory_mottasel: 'madd45', madda_obligatory_monfasel: 'madd45', madda_necessary: 'madd6',
  ghunnah: 'ghunna', ikhafa: 'ikhfa', ikhafa_shafawi: 'ikhfa',
  idgham_ghunnah: 'idgham', idgham_shafawi: 'idgham', idgham_mutajanisayn: 'idgham', idgham_mutaqaribayn: 'idgham',
  idgham_wo_ghunnah: 'idghamx', iqlab: 'iqlab', qalaqah: 'qalqala', mark: 'mark',
};

export const TAJWEED_LEGEND = [
  { group: 'ghunna',  label: 'Ghunna (2 temps)' },
  { group: 'ikhfa',   label: 'Ikhfā’' },
  { group: 'idgham',  label: 'Idghām avec ghunna' },
  { group: 'idghamx', label: 'Idghām sans ghunna' },
  { group: 'iqlab',   label: 'Iqlāb' },
  { group: 'qalqala', label: 'Qalqala' },
  { group: 'madd2',   label: 'Madd naturel (2)' },
  { group: 'madd246', label: 'Madd 2, 4 ou 6' },
  { group: 'madd45',  label: 'Madd 4 ou 5' },
  { group: 'madd6',   label: 'Madd lāzim (6)' },
  { group: 'silent',  label: 'Non prononcé' },
];

const TAG = /<(\/)?(?:rule|tajweed|span)(?:\s+class=(?:"([a-z0-9_-]+)"|'([a-z0-9_-]+)'|([a-z0-9_-]+)))?\s*>/gi;

/** Balisage Quran.com → [[texte, règle|null], …] (gère l'imbrication). */
export function parseTajweed(markup) {
  const runs = [];
  const stack = [];
  let cursor = 0;
  const current = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i] && !stack[i].startsWith('custom') && stack[i] !== 'end') return stack[i];
    return null;
  };
  const push = text => {
    if (!text) return;
    const rule = current();
    const last = runs[runs.length - 1];
    if (last && last[1] === rule) last[0] += text; else runs.push([text, rule]);
  };
  for (const m of markup.matchAll(TAG)) {
    push(markup.slice(cursor, m.index));
    if (m[1]) stack.pop(); else stack.push(m[2] || m[3] || m[4] || '');
    cursor = m.index + m[0].length;
  }
  push(markup.slice(cursor).replace(/<[^>]*>/g, ''));
  return runs;
}

/** Runs → HTML. focus : null = toutes les règles, [] = seulement 'mark', [...] = ces règles + 'mark'. */
export function runsToHtml(runs, { focus = null, plain = false } = {}) {
  return runs.map(([text, rule]) => {
    const safe = escapeHtml(text);
    if (!rule || plain) return safe;
    if (focus && rule !== 'mark' && !focus.includes(rule)) return safe;
    const group = RULE_GROUP[rule];
    return group ? `<span class="tj tj--${group}">${safe}</span>` : safe;
  }).join('');
}

export function legendHtml() {
  return `<div class="tj-legend">${TAJWEED_LEGEND.map(l => `<span class="tj-legend__item"><i class="tj-dot tj-dot--${l.group}"></i>${escapeHtml(l.label)}</span>`).join('')}</div>`;
}

// ── Extrait (exemples des leçons Tajwid) ─────────────────────────────

let _clip = null;
let _clipRaf = 0;
let _clipCur = null;

function clipAudio() {
  if (!_clip) {
    _clip = new Audio();
    _clip.preload = 'auto';
    _clip.addEventListener('loadedmetadata', () => { if (_clipCur) _clip.currentTime = _clipCur.s / 1000; });
    _clip.addEventListener('error', () => endClip(true));
    _clip.addEventListener('ended', () => endClip());
  }
  return _clip;
}

function endClip(error = false) {
  cancelAnimationFrame(_clipRaf);
  const cur = _clipCur;
  _clipCur = null;
  _clip?.pause();
  if (cur) { cur.onWord?.(-1); cur.onEnd?.(error); }
}

/** Joue un extrait de verset entre ex.s et ex.e (ms) ; onWord(i) signale le mot en cours. */
export function playClip(ex, { rate = 1, onWord, onEnd } = {}) {
  stopClip();
  const a = clipAudio();
  _clipCur = { ...ex, onWord, onEnd, last: -2 };
  a.defaultPlaybackRate = rate;
  a.playbackRate = rate;
  if (a.src !== ex.audio) { a.src = ex.audio; a.load(); } else if (a.readyState >= 1) a.currentTime = ex.s / 1000;
  const loop = () => {
    if (!_clipCur) return;
    const t = a.currentTime * 1000;
    if (t >= _clipCur.e + 80) { endClip(); return; }
    let idx = -1;
    (_clipCur.words || []).forEach((w, i) => { if (w.s != null && w.s <= t) idx = i; });
    if (idx !== _clipCur.last) { _clipCur.last = idx; _clipCur.onWord?.(idx); }
    _clipRaf = requestAnimationFrame(loop);
  };
  a.play().then(() => { cancelAnimationFrame(_clipRaf); _clipRaf = requestAnimationFrame(loop); }).catch(() => endClip(true));
}

export function stopClip() {
  if (_clipCur) endClip();
}
