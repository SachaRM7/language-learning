// js/pages/quran-reader.js — Lecteur du Coran : récitateurs, vitesses, surbrillance mot à mot,
// couleurs de tajwid, répétition, boucle de mémorisation, traduction et écoute en français.

import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { escapeHtml } from '../utils.js';
import {
  RECITERS, FRENCH_NARRATOR, TRANSLATION_LABEL, reciterLabel,
  getSurahList, getSurahText, getSurahAudio, getFrenchAudio, alignTimings,
} from '../quran/api.js';
import { runsToHtml, legendHtml } from '../quran/tajweed.js';
import {
  getQuranPrefs, saveQuranPrefs, SPEEDS, REPEATS, LOOP_CYCLES, FONT_SIZES, AUDIO_LANGS,
} from '../quran/prefs.js';

const $app = () => document.getElementById('app');
const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toArabicDigits = n => String(n).replace(/\d/g, d => AR_DIGITS[d]);
const icon = (name, size = 20) => (window.feather?.icons[name] ? feather.icons[name].toSvg({ width: size, height: size }) : '');
const repeatLabel = r => (r === Infinity ? '∞' : `${r}×`);
const speedLabel = r => `${String(r).replace('.', ',')}×`;

let S = null; // état de la session de lecture

// ─────────────────────────────────────────────────────────────── Cycle de vie

export async function renderQuranReader(params) {
  teardown();
  const n = parseInt(params.surah, 10);
  if (!(n >= 1 && n <= 114)) { navigate('/coran'); return; }

  const surahs = await getSurahList();
  const meta = surahs[n - 1];
  const startAyah = Math.min(Math.max(parseInt(params.ayah, 10) || 1, 1), meta.ayahs);

  const audio = new Audio();
  audio.preload = 'auto';

  S = {
    n, meta, audio,
    prefs: getQuranPrefs(),
    verses: null, audioMap: null, frMap: null,
    idx: startAyah - 1,
    segment: 'ar',
    timings: null,
    lastWord: -2,
    repeatIter: 1,
    loop: null, // { start, end, cycles, iter }
    raf: 0,
    pauseTimer: 0,
    userScrollAt: 0,
    sheetOpen: false,
    ended: false,
    error: null,
    pendingSeekMs: 0,
    cleanups: [],
  };

  _bindAudio();
  S.onHash = () => {
    const h = location.hash.replace(/^#/, '');
    if (!h.startsWith(`/coran/${n}`)) teardown();
  };
  window.addEventListener('hashchange', S.onHash);

  _renderShell();
  await _loadData();
}

function teardown() {
  if (!S) return;
  cancelAnimationFrame(S.raf);
  clearTimeout(S.pauseTimer);
  window.removeEventListener('hashchange', S.onHash);
  S.cleanups.forEach(fn => fn());
  S.audio.pause();
  S.audio.removeAttribute('src');
  S.audio.load();
  if ('mediaSession' in navigator) {
    for (const a of ['play', 'pause', 'previoustrack', 'nexttrack']) {
      try { navigator.mediaSession.setActionHandler(a, null); } catch {}
    }
    navigator.mediaSession.metadata = null;
  }
  S = null;
}

async function _loadData() {
  const session = S;
  try {
    const [verses, audioMap] = await Promise.all([
      getSurahText(session.n),
      getSurahAudio(session.n, session.prefs.reciter).catch(() => null),
    ]);
    if (S !== session) return;
    session.verses = verses;
    session.audioMap = audioMap;
    if (!audioMap) session.error = 'Audio indisponible pour ce récitateur. Vérifie ta connexion.';
    _renderVerses();
    _prepare(session.idx, _firstSegment(), false);
    _scrollToActive('center', 'auto');
    getFrenchAudio(session.n).then(map => {
      if (S !== session) return;
      session.frMap = map;
      if (!map.size && session.prefs.audioLang !== 'ar') _setStatus('Lecture française indisponible pour cette sourate.');
    });
  } catch {
    if (S !== session) return;
    document.getElementById('qr-verses').innerHTML = `
      <div class="qr-error">
        <p>Impossible de charger la sourate. Vérifie ta connexion internet.</p>
        <button class="primary-btn" id="qr-retry">Réessayer</button>
      </div>`;
    document.getElementById('qr-retry').addEventListener('click', () => renderQuranReader({ surah: session.n, ayah: session.idx + 1 }));
  }
}

// ─────────────────────────────────────────────────────────────── Rendu

function _rootClasses() {
  const p = S.prefs;
  return [
    'qreader',
    p.showTajweed ? '' : 'qreader--no-tajweed',
    p.showTranslation ? '' : 'qreader--no-fr',
    p.showTranslit ? 'qreader--translit' : '',
    p.memorize ? 'qreader--memorize' : '',
  ].filter(Boolean).join(' ');
}

function _fontScale() {
  return (FONT_SIZES.find(f => f.id === S.prefs.fontSize) || FONT_SIZES[1]).scale;
}

function _renderShell() {
  const { meta } = S;
  $app().innerHTML = `
    <div class="${_rootClasses()}" id="qreader" style="--qr-ar-size:${_fontScale()}rem">
      ${renderHeader({
        title: `${meta.n}. ${meta.tr}`,
        back: '/coran',
        actions: [{ id: 'settings', icon: 'sliders', label: 'Réglages du lecteur' }],
      })}
      <main class="page-content qr-content">
        <section class="qr-banner">
          <div class="qr-banner__ar" lang="ar" dir="rtl">${escapeHtml(meta.ar)}</div>
          <div class="qr-banner__title">${escapeHtml(meta.fr)}</div>
          <div class="qr-banner__meta">${meta.ayahs} versets · ${escapeHtml(meta.place)}</div>
          <button class="qr-reciter-chip" id="qr-reciter-chip"><i data-feather="mic"></i><span id="qr-reciter-name">${escapeHtml(reciterLabel(S.prefs.reciter))}</span></button>
        </section>
        ${meta.bismillah ? `<div class="qr-basmala" lang="ar" dir="rtl">${BASMALA}</div>` : ''}
        <div class="qr-verses" id="qr-verses">
          <div class="qr-loading"><div class="qr-spinner"></div>Chargement de la sourate…</div>
        </div>
        <p class="quran-credits">${escapeHtml(TRANSLATION_LABEL)} · Texte et minutage : Quran.com.</p>
      </main>
      <button class="qr-return" id="qr-return" hidden><i data-feather="navigation"></i> Revenir au verset en cours</button>
      ${_playerHtml()}
      <div id="qsheet-root"></div>
    </div>
  `;
  feather.replace();
  _bindShell();
}

function _playerHtml() {
  const p = S.prefs;
  return `
    <div class="qplayer" id="qplayer">
      <div class="qplayer__track"><div class="qplayer__fill" id="qp-fill"></div></div>
      <div class="qplayer__row">
        <button class="qplayer__chip" id="qp-speed" aria-label="Vitesse de lecture">${speedLabel(p.rate)}</button>
        <button class="qplayer__btn" id="qp-prev" aria-label="Verset précédent">${icon('skip-back', 22)}</button>
        <button class="qplayer__play" id="qp-play" aria-label="Lecture">${icon('play', 26)}</button>
        <button class="qplayer__btn" id="qp-next" aria-label="Verset suivant">${icon('skip-forward', 22)}</button>
        <button class="qplayer__chip" id="qp-repeat" aria-label="Répéter chaque verset">${icon('repeat', 14)} ${repeatLabel(p.repeat)}</button>
      </div>
      <div class="qplayer__info">
        <span id="qp-label">Verset ${S.idx + 1} / ${S.meta.ayahs}</span>
        <span class="qplayer__status" id="qp-status"></span>
      </div>
    </div>
  `;
}

function _verseHtml(v, i) {
  const words = v.words.map((w, wi) => `
    <span class="qw" data-w="${wi}"><span class="qw__ar">${runsToHtml(w.runs)}</span><span class="qw__tr">${escapeHtml(w.tr)}</span></span>`).join('');
  return `
    <article class="qv" data-idx="${i}" id="qv-${v.n}">
      <div class="qv__head">
        <span class="qv__num">${S.n}:${v.n}</span>
        <button class="qv__reveal" data-act="reveal" aria-label="Révéler le verset ${v.n}">${icon('eye', 16)}</button>
        <button class="qv__play" data-act="play" aria-label="Écouter le verset ${v.n}">${icon('play', 16)}</button>
      </div>
      <div class="qv__ar" lang="ar" dir="rtl">${words}<span class="qv__end">${toArabicDigits(v.n)}</span></div>
      <p class="qv__fr">${escapeHtml(v.fr)}</p>
    </article>
  `;
}

function _renderVerses() {
  const el = document.getElementById('qr-verses');
  el.innerHTML = S.verses.map(_verseHtml).join('');
}

// ─────────────────────────────────────────────────────────────── Moteur audio

function _firstSegment() {
  return S.prefs.audioLang === 'fr' && S.frMap?.size ? 'fr' : 'ar';
}

function _srcFor(idx, segment) {
  const v = S.verses?.[idx];
  if (!v) return '';
  if (segment === 'fr') return S.frMap?.get(v.n) || '';
  return S.audioMap?.get(v.n)?.url || '';
}

/** Charge le verset `idx` (segment 'ar' ou 'fr') et lance la lecture si demandé. */
function _prepare(idx, segment, autoplay, startMs = 0) {
  if (!S?.verses) return;
  clearTimeout(S.pauseTimer);
  let seg = segment;
  if (seg === 'fr' && !_srcFor(idx, 'fr')) seg = 'ar';
  const changedVerse = idx !== S.idx || !document.querySelector('.qv.is-active');
  _clearWords(S.idx);
  S.idx = idx;
  S.segment = seg;
  S.ended = false;
  S.lastWord = -2;
  const v = S.verses[idx];
  const timing = S.audioMap?.get(v.n);
  S.timings = seg === 'ar' && timing ? alignTimings(v.words, timing.segs) : null;

  const src = _srcFor(idx, seg);
  _updateActiveVerse(changedVerse);
  _updateMediaSession();
  saveQuranPrefs({ last: { surah: S.n, ayah: v.n } });
  S.prefs = getQuranPrefs();

  if (!src) {
    _setStatus(S.error || 'Audio indisponible.');
    _setPlaying(false);
    return;
  }
  S.pendingSeekMs = startMs;
  if (S.audio.src !== src) {
    S.audio.src = src;
    S.audio.load();
  } else if (startMs || autoplay) {
    S.audio.currentTime = startMs / 1000;
    S.pendingSeekMs = 0;
  }
  S.audio.defaultPlaybackRate = S.prefs.rate;
  S.audio.playbackRate = S.prefs.rate;
  if (autoplay) _play();
  else _setPlaying(false);
}

function _play() {
  clearTimeout(S.pauseTimer);
  if (!S.audio.src) { _prepare(S.idx, _firstSegment(), true); return; }
  if (S.ended) { _prepare(0, _firstSegment(), true); return; }
  S.audio.play().catch(() => _setPlaying(false));
}

function _pause() {
  clearTimeout(S.pauseTimer);
  S.audio.pause();
  _setStatus('');
}

function _toggle() {
  if (!S?.verses) return;
  if (!S.audio.paused || S.pauseTimer) { S.pauseTimer = 0; _pause(); _setPlaying(false); }
  else _play();
}

function _withPause(fn) {
  const secs = S.prefs.loopPause || 0;
  if (!secs) { fn(); return; }
  _setStatus(`Pause ${secs} s…`);
  _setPlaying(true);
  S.pauseTimer = setTimeout(() => { S.pauseTimer = 0; _setStatus(''); fn(); }, secs * 1000);
}

function _onEnded() {
  const s = S;
  const v = s.verses[s.idx];
  if (s.prefs.audioLang === 'ar-fr' && s.segment === 'ar' && s.frMap?.get(v.n)) {
    _markAllWordsDone();
    _prepare(s.idx, 'fr', true);
    return;
  }
  const first = _firstSegment();

  // Répétition de chaque verset
  if (s.repeatIter < s.prefs.repeat) {
    s.repeatIter++;
    _updateInfo();
    _withPause(() => _prepare(s.idx, first, true));
    return;
  }
  s.repeatIter = 1;

  // Boucle sur une plage de versets
  const L = s.loop;
  if (L && s.idx >= L.start && s.idx <= L.end) {
    if (s.idx < L.end) { _prepare(s.idx + 1, first, true); return; }
    if (L.iter < L.cycles) {
      L.iter++;
      _updateInfo();
      _withPause(() => _prepare(L.start, first, true));
      return;
    }
    L.iter = 1;
    _prepare(L.start, first, false);
    _setStatus('Boucle terminée');
    return;
  }

  if (s.idx < s.verses.length - 1) { _prepare(s.idx + 1, first, true); return; }

  // Fin de sourate
  s.ended = true;
  _setPlaying(false);
  _markAllWordsDone();
  _setStatus(s.n < 114 ? 'Sourate terminée' : 'Fin du Coran');
  _showNextSurah();
}

function _bindAudio() {
  const a = S.audio;
  a.addEventListener('loadedmetadata', () => {
    if (!S) return;
    a.playbackRate = S.prefs.rate;
    if (S.pendingSeekMs) {
      a.currentTime = S.pendingSeekMs / 1000;
      S.pendingSeekMs = 0;
    }
  });
  a.addEventListener('play', () => { if (!S) return; _setPlaying(true); _setStatus(''); _startTick(); });
  a.addEventListener('playing', () => S && _setStatus(''));
  a.addEventListener('pause', () => { if (!S) return; if (!S.pauseTimer) _setPlaying(false); _tick(); });
  a.addEventListener('waiting', () => S && !a.paused && _setStatus('Chargement…'));
  a.addEventListener('ended', () => S && _onEnded());
  a.addEventListener('error', () => {
    if (!S || !a.getAttribute('src')) return;
    _setPlaying(false);
    _setStatus('La récitation n’a pas pu être chargée.');
  });
}

// ─────────────────────────────────────────────────────────────── Surbrillance synchronisée

function _startTick() {
  cancelAnimationFrame(S.raf);
  const loop = () => {
    if (!S) return;
    _tick();
    if (!S.audio.paused) S.raf = requestAnimationFrame(loop);
  };
  S.raf = requestAnimationFrame(loop);
}

function _verseEl(idx) {
  return document.querySelector(`.qv[data-idx="${idx}"]`);
}

function _tick() {
  if (!S) return;
  const a = S.audio;
  const fill = document.getElementById('qp-fill');
  if (fill) fill.style.width = a.duration ? `${(a.currentTime / a.duration) * 100}%` : '0%';
  if (S.segment !== 'ar' || !S.timings) return;

  const t = a.currentTime * 1000;
  const T = S.timings;
  let cur = -1;
  for (let i = 0; i < T.length; i++) {
    if (T[i].s <= t) cur = i; else break;
  }
  // Après la fin du dernier mot : tout est lu
  const allDone = cur === T.length - 1 && t > T[cur].e + 120;
  const el = _verseEl(S.idx);
  if (!el) return;
  const words = el.querySelectorAll('.qw');
  const state = allDone ? T.length : cur;
  if (state !== S.lastWord) {
    words.forEach((w, i) => {
      w.classList.toggle('done', i < state);
      w.classList.toggle('cur', i === state);
    });
    S.lastWord = state;
  }
  if (!allDone && cur >= 0) {
    const { s, e } = T[cur];
    const p = Math.min(1, Math.max(0, (t - s) / Math.max(1, e - s)));
    words[cur]?.style.setProperty('--p', p.toFixed(3));
  }
}

function _clearWords(idx) {
  const el = _verseEl(idx);
  if (!el) return;
  el.querySelectorAll('.qw').forEach(w => { w.classList.remove('done', 'cur'); w.style.removeProperty('--p'); });
  el.classList.remove('qv--fr');
}

function _markAllWordsDone() {
  const el = _verseEl(S.idx);
  if (!el) return;
  el.querySelectorAll('.qw').forEach(w => { w.classList.add('done'); w.classList.remove('cur'); });
}

function _updateActiveVerse(scroll) {
  document.querySelectorAll('.qv.is-active').forEach(el => el.classList.remove('is-active', 'qv--fr'));
  const el = _verseEl(S.idx);
  if (el) {
    el.classList.add('is-active');
    el.classList.toggle('qv--fr', S.segment === 'fr');
    if (S.segment === 'fr') el.querySelectorAll('.qw').forEach(w => w.classList.add('done'));
  }
  document.querySelectorAll('.qv.in-loop').forEach(x => x.classList.remove('in-loop'));
  if (S.loop) {
    for (let i = S.loop.start; i <= S.loop.end; i++) _verseEl(i)?.classList.add('in-loop');
  }
  _updateInfo();
  if (scroll) _scrollToActive();
}

function _scrollToActive(block = 'center', behavior = 'smooth') {
  if (!S?.prefs.autoScroll && behavior === 'smooth') return;
  const el = _verseEl(S.idx);
  if (!el) return;
  if (behavior === 'smooth' && Date.now() - S.userScrollAt < 5000) {
    document.getElementById('qr-return')?.removeAttribute('hidden');
    return;
  }
  const r = el.getBoundingClientRect();
  const playerH = document.getElementById('qplayer')?.offsetHeight || 0;
  const visible = r.top >= 70 && r.bottom <= window.innerHeight - playerH;
  if (!visible || behavior === 'auto') el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : block, behavior });
}

// ─────────────────────────────────────────────────────────────── UI du lecteur

function _setPlaying(on) {
  const btn = document.getElementById('qp-play');
  if (!btn) return;
  btn.innerHTML = icon(on ? 'pause' : 'play', 26);
  btn.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
  btn.classList.toggle('is-playing', on);
  document.getElementById('qreader')?.classList.toggle('is-playing', on);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
}

function _setStatus(text) {
  const el = document.getElementById('qp-status');
  if (el) el.textContent = text ? `· ${text}` : '';
}

function _updateInfo() {
  const el = document.getElementById('qp-label');
  if (!el || !S.verses) return;
  const v = S.verses[S.idx];
  const parts = [`Verset ${v.n} / ${S.meta.ayahs}`];
  if (S.segment === 'fr') parts.push('traduction');
  if (S.prefs.repeat > 1) parts.push(`répétition ${S.repeatIter}/${repeatLabel(S.prefs.repeat).replace('×', '')}`);
  if (S.loop) parts.push(`boucle ${S.loop.start + 1}–${S.loop.end + 1} (${S.loop.iter}/${S.loop.cycles === Infinity ? '∞' : S.loop.cycles})`);
  el.textContent = parts.join(' · ');
}

function _showNextSurah() {
  if (S.n >= 114 || document.getElementById('qr-next-surah')) return;
  const list = document.getElementById('qr-verses');
  list.insertAdjacentHTML('beforeend', `
    <button class="qr-next-surah" id="qr-next-surah" data-navigate="/coran/${S.n + 1}">
      Sourate suivante <i data-feather="arrow-right"></i>
    </button>`);
  feather.replace();
}

function _updateMediaSession() {
  if (!('mediaSession' in navigator) || !S.verses) return;
  const v = S.verses[S.idx];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${S.meta.tr} · verset ${v.n}${S.segment === 'fr' ? ' (traduction)' : ''}`,
      artist: S.segment === 'fr' ? FRENCH_NARRATOR : reciterLabel(S.prefs.reciter),
      album: 'HelloArabic · Le Coran',
      artwork: [{ src: 'images/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => _play());
    navigator.mediaSession.setActionHandler('pause', () => _pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => _goto(S.idx - 1));
    navigator.mediaSession.setActionHandler('nexttrack', () => _goto(S.idx + 1));
  } catch {}
}

function _goto(idx, autoplay = true) {
  if (!S?.verses || idx < 0 || idx >= S.verses.length) return;
  S.repeatIter = 1;
  S.userScrollAt = 0;
  _prepare(idx, _firstSegment(), autoplay);
}

function _bindShell() {
  const root = document.getElementById('qreader');

  document.getElementById('qp-play').addEventListener('click', _toggle);
  document.getElementById('qp-prev').addEventListener('click', () => _goto(S.idx - 1, !S.audio.paused));
  document.getElementById('qp-next').addEventListener('click', () => _goto(S.idx + 1, !S.audio.paused));
  document.getElementById('qp-speed').addEventListener('click', () => {
    const i = SPEEDS.indexOf(S.prefs.rate);
    _applyPrefs({ rate: SPEEDS[(i + 1) % SPEEDS.length] });
  });
  document.getElementById('qp-repeat').addEventListener('click', () => {
    const i = REPEATS.indexOf(S.prefs.repeat);
    _applyPrefs({ repeat: REPEATS[(i + 1) % REPEATS.length] });
  });
  root.querySelector('[data-action="settings"]').addEventListener('click', _openSheet);
  document.getElementById('qr-reciter-chip').addEventListener('click', _openSheet);

  document.getElementById('qr-return').addEventListener('click', e => {
    e.currentTarget.setAttribute('hidden', '');
    S.userScrollAt = 0;
    _scrollToActive('center', 'smooth');
  });

  const markScroll = () => { if (S && !S.audio.paused) S.userScrollAt = Date.now(); };
  window.addEventListener('wheel', markScroll, { passive: true });
  window.addEventListener('touchmove', markScroll, { passive: true });
  document.addEventListener('keydown', _onKey);
  S.cleanups.push(() => {
    window.removeEventListener('wheel', markScroll);
    window.removeEventListener('touchmove', markScroll);
    document.removeEventListener('keydown', _onKey);
  });

  document.getElementById('qr-verses').addEventListener('click', e => {
    if (!S?.verses) return;
    const verse = e.target.closest('.qv');
    if (!verse) return;
    const idx = Number(verse.dataset.idx);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'reveal') { verse.classList.toggle('revealed'); return; }
    const word = e.target.closest('.qw');
    S.repeatIter = 1;
    S.userScrollAt = 0;
    if (act === 'play') {
      if (idx === S.idx && !S.audio.paused) { _pause(); return; }
      _prepare(idx, _firstSegment(), true);
      return;
    }
    if (word && S.audioMap) {
      // Toucher un mot : la lecture reprend exactement à ce mot
      const v = S.verses[idx];
      const T = alignTimings(v.words, S.audioMap.get(v.n)?.segs || []);
      const w = T[Number(word.dataset.w)];
      _prepare(idx, 'ar', true, w ? Math.max(0, w.s - 40) : 0);
      return;
    }
    _prepare(idx, _firstSegment(), true);
  });

}

function _onKey(e) {
  if (!S || S.sheetOpen || e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); _toggle(); }
  else if (e.key === 'ArrowLeft') _goto(S.idx + 1, !S.audio.paused); // lecture de droite à gauche
  else if (e.key === 'ArrowRight') _goto(S.idx - 1, !S.audio.paused);
}

// ─────────────────────────────────────────────────────────────── Réglages

async function _applyPrefs(patch) {
  const before = S.prefs;
  S.prefs = saveQuranPrefs(patch);
  const p = S.prefs;

  if ('rate' in patch) {
    S.audio.playbackRate = p.rate;
    S.audio.defaultPlaybackRate = p.rate;
    document.getElementById('qp-speed').textContent = speedLabel(p.rate);
  }
  if ('repeat' in patch) {
    S.repeatIter = 1;
    document.getElementById('qp-repeat').innerHTML = `${icon('repeat', 14)} ${repeatLabel(p.repeat)}`;
    _updateInfo();
  }
  if ('fontSize' in patch) document.getElementById('qreader').style.setProperty('--qr-ar-size', `${_fontScale()}rem`);
  if (['showTajweed', 'showTranslation', 'showTranslit', 'memorize'].some(k => k in patch)) {
    document.getElementById('qreader').className = _rootClasses() + (S.audio.paused ? '' : ' is-playing');
  }
  if ('reciter' in patch && patch.reciter !== before.reciter) {
    document.getElementById('qr-reciter-name').textContent = reciterLabel(p.reciter);
    const wasPlaying = !S.audio.paused;
    const session = S;
    _setStatus('Chargement du récitateur…');
    try {
      const map = await getSurahAudio(S.n, p.reciter);
      if (S !== session) return;
      S.audioMap = map;
      S.error = null;
      _setStatus('');
      _prepare(S.idx, _firstSegment(), wasPlaying);
    } catch {
      if (S === session) _setStatus('Récitateur indisponible.');
    }
  }
  if ('audioLang' in patch && patch.audioLang !== before.audioLang) {
    const wasPlaying = !S.audio.paused;
    if (S.verses) _prepare(S.idx, _firstSegment(), wasPlaying);
  }
  if (S.sheetOpen) _renderSheet();
}

function _openSheet() {
  S.sheetOpen = true;
  _renderSheet();
}

function _closeSheet() {
  S.sheetOpen = false;
  document.getElementById('qsheet-root').innerHTML = '';
}

function _chips(name, items, current) {
  return `<div class="qsheet__chips">${items.map(it => `
    <button class="quran-chip ${String(it.value) === String(current) ? 'is-active' : ''}" data-pref="${name}" data-value="${it.value}">${escapeHtml(it.label)}</button>`).join('')}</div>`;
}

function _toggleRow(name, label, checked, hint = '') {
  return `
    <label class="qsheet__toggle">
      <span><span class="qsheet__toggle-label">${escapeHtml(label)}</span>${hint ? `<span class="qsheet__hint">${escapeHtml(hint)}</span>` : ''}</span>
      <span class="toggle"><input type="checkbox" data-pref-bool="${name}" ${checked ? 'checked' : ''}><span class="toggle__slider"></span></span>
    </label>`;
}

function _renderSheet() {
  const p = S.prefs;
  const n = S.meta.ayahs;
  const L = S.loop;
  const loopStart = L ? L.start + 1 : S.idx + 1;
  const loopEnd = L ? L.end + 1 : Math.min(n, S.idx + 3);
  const loopCycles = L ? L.cycles : 3;
  const options = (sel) => Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${i + 1}</option>`).join('');

  document.getElementById('qsheet-root').innerHTML = `
    <div class="modal-overlay qsheet-overlay" id="qsheet-overlay">
      <div class="modal qsheet" role="dialog" aria-modal="true" aria-labelledby="qsheet-title">
        <div class="modal__header">
          <span class="modal__title" id="qsheet-title">Réglages du lecteur</span>
          <button class="modal__close" id="qsheet-close" aria-label="Fermer">✕</button>
        </div>

        <div class="modal-section">
          <div class="modal-section__title">Vitesse</div>
          ${_chips('rate', SPEEDS.map(s => ({ value: s, label: speedLabel(s) })), p.rate)}
        </div>

        <div class="modal-section">
          <div class="modal-section__title">Récitateur</div>
          <div class="qsheet__reciters">
            ${RECITERS.map(r => `
              <button class="qsheet__reciter ${r.id === p.reciter ? 'is-active' : ''}" data-pref="reciter" data-value="${r.id}">
                <span class="qsheet__reciter-name">${escapeHtml(r.name)}</span>
                ${r.style ? `<span class="qsheet__reciter-style">${escapeHtml(r.style)}</span>` : ''}
              </button>`).join('')}
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section__title">Écoute</div>
          ${_chips('audioLang', AUDIO_LANGS.map(a => ({ value: a.id, label: a.label })), p.audioLang)}
          ${p.audioLang !== 'ar' ? `<p class="qsheet__hint">Lecture française : ${escapeHtml(FRENCH_NARRATOR)} (Al Quran Cloud).</p>` : ''}
        </div>

        <div class="modal-section">
          <div class="modal-section__title">Répéter chaque verset</div>
          ${_chips('repeat', REPEATS.map(r => ({ value: r === Infinity ? 'inf' : r, label: r === 1 ? 'Non' : repeatLabel(r) })), p.repeat === Infinity ? 'inf' : p.repeat)}
        </div>

        <div class="modal-section">
          <div class="modal-section__title">Boucle de mémorisation</div>
          <div class="qsheet__loop">
            <label>Du verset <select id="loop-start">${options(loopStart)}</select></label>
            <label>au verset <select id="loop-end">${options(loopEnd)}</select></label>
          </div>
          <div class="qsheet__sub">Nombre de passages</div>
          ${_chips('loopCycles', LOOP_CYCLES.map(c => ({ value: c === Infinity ? 'inf' : c, label: c === Infinity ? '∞' : `${c}×` })), loopCycles === Infinity ? 'inf' : loopCycles)}
          <div class="qsheet__sub">Pause entre deux répétitions</div>
          ${_chips('loopPause', [0, 2, 5, 10].map(s => ({ value: s, label: s ? `${s} s` : 'Aucune' })), p.loopPause)}
          <div class="qsheet__loop-actions">
            <button class="primary-btn" id="loop-apply">${L ? 'Mettre à jour la boucle' : 'Lancer la boucle'}</button>
            ${L ? '<button class="secondary-btn" id="loop-stop">Arrêter la boucle</button>' : ''}
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section__title">Affichage</div>
          ${_toggleRow('showTajweed', 'Couleurs de tajwid', p.showTajweed)}
          ${p.showTajweed ? legendHtml() : ''}
          ${_toggleRow('showTranslit', 'Translittération mot à mot', p.showTranslit)}
          ${_toggleRow('showTranslation', 'Traduction française', p.showTranslation)}
          ${_toggleRow('memorize', 'Mode mémorisation', p.memorize, 'Le texte reste masqué et se dévoile au fil de la récitation.')}
          ${_toggleRow('autoScroll', 'Suivre le verset en cours', p.autoScroll)}
          <div class="qsheet__sub">Taille du texte arabe</div>
          <div class="qsheet__chips">
            ${FONT_SIZES.map((f, i) => `<button class="quran-chip qsheet__font ${f.id === p.fontSize ? 'is-active' : ''}" style="font-size:${0.8 + i * 0.15}rem" data-pref="fontSize" data-value="${f.id}">${f.label}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  const root = document.getElementById('qsheet-root');
  document.getElementById('qsheet-close').addEventListener('click', _closeSheet);
  document.getElementById('qsheet-overlay').addEventListener('click', e => { if (e.target.id === 'qsheet-overlay') _closeSheet(); });
  root.querySelector('.qsheet').addEventListener('keydown', e => { if (e.key === 'Escape') _closeSheet(); });

  root.querySelectorAll('[data-pref]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.pref;
      const raw = btn.dataset.value;
      if (name === 'loopCycles') {
        S.sheetLoopCycles = raw === 'inf' ? Infinity : Number(raw);
        root.querySelectorAll('[data-pref="loopCycles"]').forEach(b => b.classList.toggle('is-active', b === btn));
        return;
      }
      let value = raw;
      if (name === 'rate' || name === 'reciter' || name === 'loopPause') value = Number(raw);
      if (name === 'repeat') value = raw === 'inf' ? Infinity : Number(raw);
      _applyPrefs({ [name]: value });
    });
  });
  root.querySelectorAll('[data-pref-bool]').forEach(input => {
    input.addEventListener('change', () => _applyPrefs({ [input.dataset.prefBool]: input.checked }));
  });

  S.sheetLoopCycles = loopCycles;
  document.getElementById('loop-apply').addEventListener('click', () => {
    let a = Number(document.getElementById('loop-start').value) - 1;
    let b = Number(document.getElementById('loop-end').value) - 1;
    if (b < a) [a, b] = [b, a];
    S.loop = { start: a, end: b, cycles: S.sheetLoopCycles, iter: 1 };
    S.repeatIter = 1;
    _closeSheet();
    _prepare(a, _firstSegment(), true);
  });
  document.getElementById('loop-stop')?.addEventListener('click', () => {
    S.loop = null;
    _updateActiveVerse(false);
    _renderSheet();
  });

  root.querySelector('.qsheet .modal__close').focus();
}
