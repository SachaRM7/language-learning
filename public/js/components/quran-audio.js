// js/components/quran-audio.js — Lecture audio des récitations (verset / mot) avec un seul lecteur partagé.

let _audio = null;
let _btn = null;
let _token = 0; // toute nouvelle lecture (ou un arrêt) annule la suite en cours
let _finish = null; // termine proprement la lecture en cours

function audio() {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = 'auto';
  }
  return _audio;
}

function setPlaying(btn, on) {
  if (_btn && _btn !== btn) _btn.classList.remove('is-playing');
  _btn = on ? btn : null;
  btn?.classList.toggle('is-playing', on);
}

function _play(url, btn, rate = 1) {
  const a = audio();
  if (_finish) _finish(); // la lecture précédente se termine (sa promesse est résolue)
  return new Promise(resolve => {
    a.pause();
    a.src = url;
    a.defaultPlaybackRate = rate;
    a.playbackRate = rate;
    setPlaying(btn, true);
    const done = (ended = false) => {
      if (_finish !== done) return;
      _finish = null;
      a.onended = a.onerror = a.onpause = null;
      setPlaying(btn, false);
      resolve(ended);
    };
    _finish = done;
    a.onended = () => done(true);
    a.onerror = () => done();
    a.play().then(() => { a.onpause = () => { if (!a.ended) done(); }; }).catch(() => done());
  });
}

/** Joue une URL (annule toute lecture en cours) ; résolue à la fin ou à l'arrêt. */
export function playUrl(url, btn = null, { rate = 1 } = {}) {
  _token++;
  return _play(url, btn, rate);
}

/** Joue une suite d'URL (ex. toute une sourate). onStep(i) avant chaque élément, onStep(-1) à la fin. */
export async function playSequence(urls, onStep = () => {}) {
  const token = ++_token;
  for (let i = 0; i < urls.length; i++) {
    if (token !== _token) return false;
    onStep(i);
    await _play(urls[i], null);
  }
  if (token === _token) onStep(-1);
  return token === _token;
}

export function stopAudio() {
  _token++;
  if (_finish) _finish();
  if (_audio) _audio.pause();
  setPlaying(null, false);
}

/** Débloque le lecteur des récitations pendant un geste (iOS), sans rien jouer d'audible. */
export function unlockRecitations() {
  try {
    const a = audio();
    if (a.src) return;
    a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    a.play().then(() => a.pause()).catch(() => {});
  } catch { /* ignore */ }
}
