// js/audio.js — TTS + HTMLAudio unifié

let _audioEl = null;
let _timeUpdateCallback = null;

function getAudio() {
  if (!_audioEl) {
    _audioEl = new Audio();
    _audioEl.addEventListener('timeupdate', () => {
      if (_timeUpdateCallback) _timeUpdateCallback(_audioEl.currentTime);
    });
  }
  return _audioEl;
}

// ── Voix de synthèse (TTS) ─────────────────────────────────────────
// Sur iPhone, Safari a plusieurs pièges : la première lecture doit partir d'un geste,
// speak() juste après cancel() est parfois ignoré, la synthèse peut rester « en pause »,
// et l'événement de fin peut ne jamais arriver. On contourne chacun d'eux ici.

const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let _voices = [];
let _current = null; // garde une référence (sinon Safari/Chrome peuvent « oublier » l'énoncé)
let _unlocked = false;

function loadVoices() { try { _voices = speechSynthesis.getVoices() || []; } catch { _voices = []; } }
if (HAS_TTS) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

/** Meilleure voix pour une langue (ar-SA → ar-SA, sinon n'importe quelle voix arabe). */
export function voiceFor(lang = 'ar-SA') {
  if (!_voices.length) loadVoices();
  const norm = v => (v.lang || '').replace('_', '-').toLowerCase();
  const want = lang.toLowerCase();
  const prefix = want.slice(0, 2);
  return _voices.find(v => norm(v) === want) || _voices.find(v => norm(v).startsWith(prefix)) || null;
}

/** État de la synthèse vocale, pour le diagnostic du profil. */
export function ttsStatus(lang = 'ar-SA') {
  if (!HAS_TTS) return { available: false, voice: null };
  return { available: true, voice: voiceFor(lang) };
}

/**
 * À appeler au premier toucher : « réveille » la synthèse et le lecteur audio pendant un geste
 * de l'utilisateur, pour que les lectures suivantes (même lancées après coup) soient autorisées.
 */
export function unlockAudio() {
  if (_unlocked) return;
  _unlocked = true;
  // Les médias jouent même quand l'iPhone est en mode silencieux (Safari 16.4+)
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
  if (HAS_TTS) {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
  try {
    const a = getAudio();
    a.src = SILENT_WAV;
    a.play().then(() => a.pause()).catch(() => {});
  } catch { /* ignore */ }
}

export function playWord(text, lang = 'ar-SA') {
  return new Promise((resolve) => {
    if (!HAS_TTS || !text) { resolve(); return; }
    const synth = speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || 'ar-SA';
    utter.rate = 0.8;
    const voice = voiceFor(utter.lang);
    if (voice) utter.voice = voice;
    _current = utter;
    let settled = false;
    const done = () => { if (settled) return; settled = true; clearTimeout(watchdog); if (_current === utter) _current = null; resolve(); };
    // Filet de sécurité : certaines plateformes n'envoient jamais « end »
    const watchdog = setTimeout(done, 2500 + text.length * 160);
    utter.onend = done;
    utter.onerror = done;
    const go = () => { try { synth.resume(); synth.speak(utter); } catch { done(); } };
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(go, 80); // speak() juste après cancel() est parfois ignoré par Safari
    } else {
      go();
    }
  });
}

// Silence WAV (0,05 s) pour débloquer le lecteur audio sur iOS
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function playAudioFile(url) {
  return new Promise((resolve, reject) => {
    const audio = getAudio();
    audio.src = url;
    audio.load();
    audio.onended = resolve;
    audio.onerror = reject;
    audio.play().catch(reject);
  });
}

export function pause() {
  getAudio().pause();
  if (HAS_TTS) speechSynthesis.pause();
}

export function resume() {
  getAudio().play();
  if (HAS_TTS) speechSynthesis.resume();
}

export function stop() {
  if (HAS_TTS) speechSynthesis.cancel();
  const audio = getAudio();
  audio.pause();
  audio.currentTime = 0;
  audio.src = '';
}

export function seekTo(seconds) {
  getAudio().currentTime = seconds;
}

export function setSpeed(rate) {
  getAudio().playbackRate = rate;
}

export function onTimeUpdate(callback) {
  _timeUpdateCallback = callback;
}

export function getDuration() {
  return getAudio().duration || 0;
}

export function getCurrentTime() {
  return getAudio().currentTime || 0;
}
