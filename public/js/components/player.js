// js/components/player.js — Lecteur audio flottant (verre dépoli) pour les leçons

import { playAudioFile, pause, resume, seekTo, setSpeed, onTimeUpdate, getDuration, getCurrentTime, stop } from '../audio.js';
import { icon } from '../icons.js';

const SPEEDS = [0.75, 1.0, 1.25, 1.5];
let _speed = 1.0;
let _isPlaying = false;

export function renderPlayer() {
  return `
    <div class="player" id="lesson-player" role="region" aria-label="Lecteur audio">
      <div class="player__controls">
        <button class="player__btn" id="player-rewind" aria-label="Reculer de 15 secondes">${icon('rotate-ccw')}</button>
        <button class="player__btn player__btn--play" id="player-play" aria-label="Lecture">${icon('play')}</button>
        <button class="player__btn" id="player-forward" aria-label="Avancer de 15 secondes">${icon('rotate-cw')}</button>
        <div class="player__timeline">
          <input class="player__progress" id="player-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Position">
          <div class="player__times">
            <span id="player-current">0:00</span>
            <span id="player-duration">0:00</span>
          </div>
        </div>
        <button class="player__btn player__btn--speed" id="player-speed" aria-label="Vitesse de lecture">${_speed}×</button>
      </div>
    </div>
  `;
}

function _formatTime(secs) {
  const s = Math.floor(secs || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function bindPlayerEvents(lesson) {
  const playBtn = document.getElementById('player-play');
  const rewindBtn = document.getElementById('player-rewind');
  const forwardBtn = document.getElementById('player-forward');
  const speedBtn = document.getElementById('player-speed');
  const progressEl = document.getElementById('player-progress');
  const currentEl = document.getElementById('player-current');
  const durationEl = document.getElementById('player-duration');

  if (!playBtn) return;
  _isPlaying = false;
  _updatePlayBtn();

  let _started = false;
  const start = () => {
    if (!lesson.audioUrl) return;
    _started = true;
    playAudioFile(lesson.audioUrl).catch(() => { _isPlaying = false; _updatePlayBtn(); });
    setSpeed(_speed);
  };

  playBtn.addEventListener('click', () => {
    if (!_started) { start(); _isPlaying = true; }
    else if (_isPlaying) { pause(); _isPlaying = false; }
    else { resume(); _isPlaying = true; }
    _updatePlayBtn();
  });

  rewindBtn?.addEventListener('click', () => seekTo(Math.max(0, getCurrentTime() - 15)));
  forwardBtn?.addEventListener('click', () => seekTo(Math.min(getDuration(), getCurrentTime() + 15)));

  speedBtn?.addEventListener('click', () => {
    const idx = SPEEDS.indexOf(_speed);
    _speed = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(_speed);
    speedBtn.textContent = `${_speed}×`;
  });

  progressEl?.addEventListener('input', () => {
    const dur = getDuration();
    if (dur) seekTo((parseFloat(progressEl.value) / 100) * dur);
  });

  onTimeUpdate((current) => {
    if (!document.body.contains(playBtn)) return;
    const duration = getDuration();
    if (currentEl) currentEl.textContent = _formatTime(current);
    if (durationEl && duration) durationEl.textContent = _formatTime(duration);
    if (progressEl && duration) {
      const pct = (current / duration) * 100;
      progressEl.value = pct;
      progressEl.style.setProperty('--pct', `${pct}%`);
    }

    // Karaoké : surligner la réplique en cours
    (lesson.dialogue || []).forEach(line => {
      const el = document.getElementById(`line-${line.id}`);
      if (!el) return;
      const active = current >= line.audioStart && current < line.audioEnd;
      if (active && !el.classList.contains('dialogue-line--active')) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      el.classList.toggle('dialogue-line--active', active);
    });
  });

  // Arrêter l'audio quand on quitte la leçon
  const onLeave = () => { stop(); _isPlaying = false; window.removeEventListener('hashchange', onLeave); };
  window.addEventListener('hashchange', onLeave);

  function _updatePlayBtn() {
    playBtn.innerHTML = icon(_isPlaying ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', _isPlaying ? 'Pause' : 'Lecture');
    playBtn.classList.toggle('is-playing', _isPlaying);
  }
}
