// js/quran/range-player.js — Lecture d'un extrait de verset (exemples des leçons Tajwid)
// Joue l'audio d'un verset entre deux instants (ms) et signale le mot en cours.

let _audio = null;
let _raf = 0;
let _current = null; // { s, e, onWord, onEnd, words }

function audio() {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = 'auto';
    _audio.addEventListener('loadedmetadata', () => {
      if (_current) _audio.currentTime = _current.s / 1000;
    });
    _audio.addEventListener('error', () => finish(true));
    _audio.addEventListener('ended', () => finish());
  }
  return _audio;
}

function finish(error = false) {
  cancelAnimationFrame(_raf);
  const cur = _current;
  _current = null;
  if (_audio) _audio.pause();
  if (cur) {
    cur.onWord?.(-1);
    cur.onEnd?.(error);
  }
}

function loop() {
  if (!_current) return;
  const t = _audio.currentTime * 1000;
  if (t >= _current.e + 80) { finish(); return; }
  if (_current.words) {
    let idx = -1;
    _current.words.forEach((w, i) => { if (w.s != null && w.s <= t) idx = i; });
    if (idx !== _current.lastWord) {
      _current.lastWord = idx;
      _current.onWord?.(idx);
    }
  }
  _raf = requestAnimationFrame(loop);
}

/**
 * @param {{audio:string, s:number, e:number, words?:Array<{s?:number,e?:number}>}} ex
 * @param {{rate?:number, onWord?:(i:number)=>void, onEnd?:(error:boolean)=>void}} opts
 */
export function playRange(ex, { rate = 1, onWord, onEnd } = {}) {
  stopRange();
  const a = audio();
  _current = { s: ex.s, e: ex.e, onWord, onEnd, words: ex.words, lastWord: -2 };
  a.defaultPlaybackRate = rate;
  a.playbackRate = rate;
  const absolute = new URL(ex.audio, location.href).href;
  if (a.src !== absolute) {
    a.src = ex.audio;
    a.load();
  } else if (a.readyState >= 1) {
    a.currentTime = ex.s / 1000;
  }
  a.play().then(() => {
    cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(loop);
  }).catch(() => finish(true));
}

export function stopRange() {
  if (_current) finish();
}

export function isRangePlaying() {
  return Boolean(_current);
}
