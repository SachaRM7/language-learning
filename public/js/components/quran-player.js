// js/components/quran-player.js — Lecteur de récitation de la page sourate (inspiré du lecteur de Rihla) :
// 12 récitateurs, vitesses, surbrillance synchronisée mot à mot, arabe / français / arabe puis français,
// répétition de chaque verset, boucle de mémorisation, Media Session (écran verrouillé).
//
// Le lecteur ne dessine pas les versets : la page lui fournit les éléments (.qv[data-i] > .qw).

import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';
import { showModal, hideModal } from './modal.js';
import { stopAudio } from './quran-audio.js';
import { AUDIO_VERSE } from '../quran.js';
import {
  RECITERS, DEFAULT_RECITER, FRENCH_NARRATOR, reciterLabel,
  getRecitation, getFrenchRecitation, alignTimings, legendHtml,
} from '../quran/recitation.js';
import {
  getPlayerPrefs, savePlayerPrefs, SPEEDS, REPEATS, LOOP_CYCLES, AUDIO_LANGS, FONT_SIZES,
} from '../quran/player-prefs.js';

const speedLabel = r => `${String(r).replace('.', ',')}×`;
const repeatLabel = r => (r === Infinity ? '∞' : `${r}×`);

/**
 * @param {object} surah  sourate de l'app ({ id, name, verses:[{n, audio, w:[…]}] })
 * @param {object} hooks
 * @param {(prefs:object, changed:string[]) => void} hooks.onDisplayChange  réglages d'affichage modifiés
 * @param {() => HTMLElement|null} hooks.container  conteneur des versets (.qs-verses)
 */
export function createSurahPlayer(surah, { onDisplayChange = () => {}, container = () => null } = {}) {
  const P = {
    prefs: getPlayerPrefs(),
    audio: new Audio(),
    idx: 0,
    segment: 'ar',
    timings: null,
    lastWord: -2,
    repeatIter: 1,
    loop: null,
    raf: 0,
    pauseTimer: 0,
    pendingSeek: 0,
    recitation: null,   // Map n → {url, segs}
    fr: null,           // Map n → url
    status: '',
    ended: false,
    userScrollAt: 0,
    alive: true,
    started: false,
  };
  P.audio.preload = 'auto';
  const id = surah.id;
  const verses = surah.verses;

  // ── Données ────────────────────────────────────────────────────────
  const loadRecitation = () => {
    const reciter = P.prefs.reciter;
    return getRecitation(id, reciter).then(map => {
      if (P.alive && P.prefs.reciter === reciter) P.recitation = map;
      return map;
    }).catch(() => {
      if (P.alive && P.prefs.reciter === reciter) P.recitation = null;
      return null;
    });
  };
  let ready = loadRecitation();
  getFrenchRecitation(id).then(map => { if (P.alive) P.fr = map; });

  // ── Utilitaires DOM ────────────────────────────────────────────────
  const verseEl = i => container()?.querySelector(`.qv[data-i="${i}"]`) || null;
  const bar = () => document.getElementById('qp-bar');
  const firstSegment = () => (P.prefs.audioLang === 'fr' && P.fr?.size ? 'fr' : 'ar');

  function srcFor(i, seg) {
    const v = verses[i];
    if (seg === 'fr') return P.fr?.get(v.n) || '';
    if (P.recitation?.get(v.n)?.url) return P.recitation.get(v.n).url;
    // Sans l'API : récitation d'Alafasy des données de l'app (sans minutage)
    return P.prefs.reciter === DEFAULT_RECITER || !P.recitation ? AUDIO_VERSE + v.audio : '';
  }

  // ── Moteur ─────────────────────────────────────────────────────────
  async function prepare(i, seg, autoplay, startMs = 0) {
    if (!P.alive || i < 0 || i >= verses.length) return;
    clearTimeout(P.pauseTimer); P.pauseTimer = 0;
    if (autoplay) { stopAudio(); P.started = true; }
    await Promise.race([ready, new Promise(r => setTimeout(r, 3500))]);
    if (!P.alive) return;
    if (seg === 'fr' && !srcFor(i, 'fr')) seg = 'ar';
    clearWords(P.idx);
    P.idx = i; P.segment = seg; P.ended = false; P.lastWord = -2;
    const v = verses[i];
    const rec = P.recitation?.get(v.n);
    P.timings = seg === 'ar' && rec?.segs?.length ? alignTimings(v.w.length, rec.segs) : null;
    markActive(true);
    updateMediaSession();
    const src = srcFor(i, seg);
    if (!src) { setStatus('Récitation indisponible'); setPlaying(false); return; }
    P.pendingSeek = startMs;
    if (P.audio.src !== src) { P.audio.src = src; P.audio.load(); }
    else if (autoplay || startMs) { P.audio.currentTime = startMs / 1000; P.pendingSeek = 0; }
    P.audio.defaultPlaybackRate = P.prefs.rate;
    P.audio.playbackRate = P.prefs.rate;
    if (autoplay) P.audio.play().catch(() => setPlaying(false));
    else setPlaying(false);
  }

  function withPause(fn) {
    const secs = P.prefs.loopPause || 0;
    if (!secs) { fn(); return; }
    setStatus(`pause ${secs} s`);
    setPlaying(true);
    P.pauseTimer = setTimeout(() => { P.pauseTimer = 0; setStatus(''); fn(); }, secs * 1000);
  }

  function onEnded() {
    const v = verses[P.idx];
    if (P.prefs.audioLang === 'ar-fr' && P.segment === 'ar' && P.fr?.get(v.n)) {
      markAllDone();
      prepare(P.idx, 'fr', true);
      return;
    }
    const first = firstSegment();
    if (P.repeatIter < P.prefs.repeat) {
      P.repeatIter++;
      updateInfo();
      withPause(() => prepare(P.idx, first, true));
      return;
    }
    P.repeatIter = 1;
    const L = P.loop;
    if (L && P.idx >= L.start && P.idx <= L.end) {
      if (P.idx < L.end) { prepare(P.idx + 1, first, true); return; }
      if (L.iter < L.cycles) { L.iter++; updateInfo(); withPause(() => prepare(L.start, first, true)); return; }
      L.iter = 1;
      prepare(L.start, first, false);
      setStatus('boucle terminée');
      return;
    }
    if (P.idx < verses.length - 1) { prepare(P.idx + 1, first, true); return; }
    P.ended = true;
    markAllDone();
    setPlaying(false);
    setStatus('sourate terminée');
  }

  const a = P.audio;
  a.addEventListener('loadedmetadata', () => {
    a.playbackRate = P.prefs.rate;
    if (P.pendingSeek) { a.currentTime = P.pendingSeek / 1000; P.pendingSeek = 0; }
  });
  a.addEventListener('play', () => { setPlaying(true); setStatus(''); startTick(); });
  a.addEventListener('pause', () => { if (!P.pauseTimer) setPlaying(false); tick(); });
  a.addEventListener('waiting', () => { if (!a.paused) setStatus('chargement…'); });
  a.addEventListener('playing', () => setStatus(''));
  a.addEventListener('ended', onEnded);
  a.addEventListener('error', () => {
    if (!a.getAttribute('src')) return;
    setPlaying(false);
    setStatus('récitation indisponible');
  });

  // ── Surbrillance synchronisée ──────────────────────────────────────
  function startTick() {
    cancelAnimationFrame(P.raf);
    const loop = () => { if (!P.alive) return; tick(); if (!a.paused) P.raf = requestAnimationFrame(loop); };
    P.raf = requestAnimationFrame(loop);
  }

  function tick() {
    const fill = document.getElementById('qp-fill');
    if (fill) fill.style.width = a.duration ? `${(a.currentTime / a.duration) * 100}%` : '0%';
    if (P.segment !== 'ar' || !P.timings) return;
    const t = a.currentTime * 1000;
    const T = P.timings;
    let cur = -1;
    for (let i = 0; i < T.length; i++) { if (T[i].s <= t) cur = i; else break; }
    const allDone = cur === T.length - 1 && t > T[cur].e + 120;
    const el = verseEl(P.idx);
    if (!el) return;
    const words = el.querySelectorAll('.qw');
    const state = allDone ? T.length : cur;
    if (state !== P.lastWord) {
      words.forEach((w, i) => { w.classList.toggle('is-done', i < state); w.classList.toggle('is-cur', i === state); });
      P.lastWord = state;
    }
    if (!allDone && cur >= 0) {
      const { s, e } = T[cur];
      words[cur]?.style.setProperty('--p', Math.min(1, Math.max(0, (t - s) / Math.max(1, e - s))).toFixed(3));
    }
  }

  function clearWords(i) {
    const el = verseEl(i);
    el?.querySelectorAll('.qw').forEach(w => { w.classList.remove('is-done', 'is-cur'); w.style.removeProperty('--p'); });
    el?.classList.remove('is-fr');
  }

  function markAllDone() {
    verseEl(P.idx)?.querySelectorAll('.qw').forEach(w => { w.classList.add('is-done'); w.classList.remove('is-cur'); });
  }

  function markActive(scroll) {
    const root = container();
    if (!root) return;
    root.querySelectorAll('.qv.is-playing').forEach(el => el.classList.remove('is-playing', 'is-fr'));
    root.querySelectorAll('.qv.in-loop').forEach(el => el.classList.remove('in-loop'));
    if (P.loop) for (let i = P.loop.start; i <= P.loop.end; i++) verseEl(i)?.classList.add('in-loop');
    const el = verseEl(P.idx);
    if (P.started && el) {
      el.classList.add('is-playing');
      el.classList.toggle('is-fr', P.segment === 'fr');
      if (P.segment === 'fr') markAllDone();
    }
    updateInfo();
    if (scroll && P.started) scrollToActive();
  }

  function scrollToActive(force = false) {
    const el = verseEl(P.idx);
    if (!el || (!P.prefs.autoScroll && !force)) return;
    if (!force && Date.now() - P.userScrollAt < 5000) { document.getElementById('qp-return')?.removeAttribute('hidden'); return; }
    const r = el.getBoundingClientRect();
    const bottom = window.innerHeight - (bar()?.getBoundingClientRect().height || 0) - 90;
    if (force || r.top < 120 || r.bottom > bottom) {
      el.scrollIntoView({ behavior: 'smooth', block: r.height > window.innerHeight * 0.55 ? 'start' : 'center' });
    }
  }

  // ── Barre de lecture ───────────────────────────────────────────────
  function setPlaying(on) {
    const btn = document.getElementById('qp-play');
    if (btn) {
      btn.innerHTML = icon(on ? 'pause' : 'play');
      btn.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
      btn.classList.toggle('is-playing', on);
    }
    if (on) document.getElementById('qp-bar')?.classList.add('has-played');
    container()?.classList.toggle('is-reciting', on);
    const listen = document.getElementById('qs-listen');
    if (listen) listen.innerHTML = on ? `${icon('pause')} Pause` : `${icon('headphones')} Écouter`;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }

  function setStatus(text) {
    P.status = text;
    updateInfo();
  }

  function updateInfo() {
    const el = document.getElementById('qp-info');
    if (!el) return;
    const v = verses[P.idx];
    const parts = [`Verset ${v.n}/${verses.length}`];
    if (P.segment === 'fr') parts.push('traduction');
    if (P.prefs.repeat > 1) parts.push(`répétition ${P.repeatIter}/${repeatLabel(P.prefs.repeat).replace('×', '')}`);
    if (P.loop) parts.push(`boucle ${P.loop.start + 1}–${P.loop.end + 1} (${P.loop.iter}/${P.loop.cycles === Infinity ? '∞' : P.loop.cycles})`);
    if (P.status) parts.push(P.status);
    el.textContent = parts.join(' · ');
  }

  function barHtml() {
    return `
      <div class="qp-bar" id="qp-bar" role="region" aria-label="Lecteur de récitation">
        <div class="qp-bar__track"><div class="qp-bar__fill" id="qp-fill"></div></div>
        <div class="qp-bar__row">
          <button class="qp-chip" id="qp-speed" aria-label="Vitesse de lecture">${speedLabel(P.prefs.rate)}</button>
          <button class="qp-btn" id="qp-prev" aria-label="Verset précédent">${icon('skip-forward', 'qp-flip')}</button>
          <button class="qp-play" id="qp-play" aria-label="Lecture">${icon('play')}</button>
          <button class="qp-btn" id="qp-next" aria-label="Verset suivant">${icon('skip-forward')}</button>
          <button class="qp-chip" id="qp-repeat" aria-label="Répéter chaque verset">${icon('repeat')}${repeatLabel(P.prefs.repeat)}</button>
        </div>
        <button class="qp-bar__info" id="qp-settings" aria-label="Réglages du lecteur">
          <span class="qp-bar__reciter">${icon('mic')}<span id="qp-reciter">${escapeHtml(reciterLabel(P.prefs.reciter))}</span></span>
          <span class="qp-bar__meta" id="qp-info"></span>
        </button>
      </div>
      <button class="qp-return" id="qp-return" hidden>${icon('arrow-right', 'qp-up')} Revenir au verset en cours</button>`;
  }

  function bindBar() {
    document.getElementById('qp-play').addEventListener('click', () => { haptic(); toggle(); });
    document.getElementById('qp-prev').addEventListener('click', () => goto(P.idx - 1));
    document.getElementById('qp-next').addEventListener('click', () => goto(P.idx + 1));
    document.getElementById('qp-speed').addEventListener('click', () => {
      apply({ rate: SPEEDS[(SPEEDS.indexOf(P.prefs.rate) + 1) % SPEEDS.length] });
    });
    document.getElementById('qp-repeat').addEventListener('click', () => {
      apply({ repeat: REPEATS[(REPEATS.indexOf(P.prefs.repeat) + 1) % REPEATS.length] });
    });
    document.getElementById('qp-settings').addEventListener('click', openSettings);
    document.getElementById('qp-return').addEventListener('click', e => {
      e.currentTarget.setAttribute('hidden', '');
      P.userScrollAt = 0;
      scrollToActive(true);
    });
    updateInfo();
    setPlaying(!a.paused);
  }

  // ── Commandes ──────────────────────────────────────────────────────
  function goto(i) {
    if (i < 0 || i >= verses.length) return;
    P.repeatIter = 1; P.userScrollAt = 0;
    prepare(i, firstSegment(), !a.paused || Boolean(P.pauseTimer));
  }

  function play() {
    clearTimeout(P.pauseTimer); P.pauseTimer = 0;
    if (!P.started || !a.getAttribute('src') || P.ended) { prepare(P.ended ? 0 : P.idx, firstSegment(), true); return; }
    stopAudio();
    a.play().catch(() => setPlaying(false));
  }

  function pause() {
    clearTimeout(P.pauseTimer); P.pauseTimer = 0;
    a.pause();
    setPlaying(false);
  }

  function toggle() {
    if (!a.paused || P.pauseTimer) pause(); else play();
  }

  /** Lit à partir d'un verset (index) et, éventuellement, d'un mot précis. */
  function playFrom(i, wordIndex = null) {
    P.repeatIter = 1; P.userScrollAt = 0;
    if (wordIndex == null) { prepare(i, firstSegment(), true); return; }
    ready.then(() => {
      const v = verses[i];
      const T = alignTimings(v.w.length, P.recitation?.get(v.n)?.segs || []);
      prepare(i, 'ar', true, P.recitation ? Math.max(0, (T[wordIndex]?.s || 0) - 40) : 0);
    });
  }

  function isPlaying() { return !a.paused || Boolean(P.pauseTimer); }

  // ── Réglages ───────────────────────────────────────────────────────
  async function apply(patch) {
    const before = P.prefs;
    P.prefs = savePlayerPrefs(patch);
    const p = P.prefs;
    if ('rate' in patch) {
      a.playbackRate = p.rate; a.defaultPlaybackRate = p.rate;
      const b = document.getElementById('qp-speed'); if (b) b.textContent = speedLabel(p.rate);
    }
    if ('repeat' in patch) {
      P.repeatIter = 1;
      const b = document.getElementById('qp-repeat'); if (b) b.innerHTML = `${icon('repeat')}${repeatLabel(p.repeat)}`;
    }
    if ('reciter' in patch && patch.reciter !== before.reciter) {
      const el = document.getElementById('qp-reciter'); if (el) el.textContent = reciterLabel(p.reciter);
      const wasPlaying = isPlaying();
      setStatus('chargement du récitateur…');
      ready = loadRecitation();
      await ready;
      setStatus(P.recitation ? '' : 'récitateur indisponible');
      if (P.started) prepare(P.idx, firstSegment(), wasPlaying);
    }
    if ('audioLang' in patch && patch.audioLang !== before.audioLang && P.started) {
      prepare(P.idx, firstSegment(), isPlaying());
    }
    const display = ['tajweed', 'translit', 'memorize', 'fontSize', 'autoScroll'].filter(k => k in patch);
    if (display.length) onDisplayChange(p, display);
    updateInfo();
    if (document.getElementById('qp-sheet')) renderSettings();
  }

  function chips(name, items, current) {
    return `<div class="qp-sheet__chips">${items.map(it => `
      <button class="chip ${String(it.value) === String(current) ? 'is-active' : ''}" data-pref="${name}" data-value="${it.value}">${escapeHtml(it.label)}</button>`).join('')}</div>`;
  }

  function toggleRow(name, label, checked, hint = '') {
    return `
      <label class="modal-option qp-sheet__toggle">
        <span><span>${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>
        <span class="toggle"><input type="checkbox" data-pref-bool="${name}" ${checked ? 'checked' : ''}><span class="toggle__slider"></span></span>
      </label>`;
  }

  function openSettings() {
    showModal(`<div class="modal-overlay" id="modal-overlay"><div class="modal qp-sheet" id="qp-sheet" role="dialog" aria-label="Réglages du lecteur"></div></div>`);
    const overlay = document.getElementById('modal-overlay');
    overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
    renderSettings();
  }

  function renderSettings() {
    const sheet = document.getElementById('qp-sheet');
    if (!sheet) return;
    const p = P.prefs;
    const n = verses.length;
    const L = P.loop;
    const opts = sel => Array.from({ length: n }, (_, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${i + 1}</option>`).join('');
    const cycles = P.sheetCycles ?? (L ? L.cycles : 3);
    sheet.innerHTML = `
      <div class="modal__header">
        <span class="modal__title">Récitation</span>
        <button class="modal__close" id="qp-close" aria-label="Fermer">${icon('x')}</button>
      </div>

      <div class="modal-section">
        <div class="modal-section__title">Vitesse</div>
        ${chips('rate', SPEEDS.map(s => ({ value: s, label: speedLabel(s) })), p.rate)}
      </div>

      <div class="modal-section">
        <div class="modal-section__title">Récitateur</div>
        <div class="qp-reciters">
          ${RECITERS.map(r => `
            <button class="qp-reciter ${r.id === p.reciter ? 'is-active' : ''}" data-pref="reciter" data-value="${r.id}">
              <span class="qp-reciter__name">${escapeHtml(r.name)}</span>
              ${r.style ? `<span class="qp-reciter__style">${escapeHtml(r.style)}</span>` : ''}
              ${r.id === p.reciter ? icon('check', 'qp-reciter__check') : ''}
            </button>`).join('')}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section__title">Écoute</div>
        ${chips('audioLang', AUDIO_LANGS.map(x => ({ value: x.id, label: x.label })), p.audioLang)}
        ${p.audioLang !== 'ar' ? `<p class="qp-sheet__hint">Lecture française de ${escapeHtml(FRENCH_NARRATOR)} (Al Quran Cloud).</p>` : ''}
      </div>

      <div class="modal-section">
        <div class="modal-section__title">Répéter chaque verset</div>
        ${chips('repeat', REPEATS.map(r => ({ value: r === Infinity ? 'inf' : r, label: r === 1 ? 'Non' : repeatLabel(r) })), p.repeat === Infinity ? 'inf' : p.repeat)}
      </div>

      <div class="modal-section">
        <div class="modal-section__title">Boucle de mémorisation</div>
        <div class="qp-loop">
          <label>Du verset <select id="qp-loop-start">${opts(L ? L.start + 1 : P.idx + 1)}</select></label>
          <label>au <select id="qp-loop-end">${opts(L ? L.end + 1 : Math.min(n, P.idx + 3))}</select></label>
        </div>
        <div class="qp-sheet__sub">Passages</div>
        ${chips('loopCycles', LOOP_CYCLES.map(c => ({ value: c === Infinity ? 'inf' : c, label: c === Infinity ? '∞' : `${c}×` })), cycles === Infinity ? 'inf' : cycles)}
        <div class="qp-sheet__sub">Pause entre deux répétitions</div>
        ${chips('loopPause', [0, 2, 5, 10].map(s => ({ value: s, label: s ? `${s} s` : 'Aucune' })), p.loopPause)}
        <div class="btn-stack qp-loop__actions">
          <button class="btn btn--primary btn--block" id="qp-loop-go">${icon('repeat')} ${L ? 'Mettre à jour la boucle' : 'Lancer la boucle'}</button>
          ${L ? `<button class="btn btn--ghost btn--block" id="qp-loop-stop">Arrêter la boucle</button>` : ''}
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section__title">Affichage</div>
        ${toggleRow('tajweed', 'Couleurs de tajwid', p.tajweed)}
        ${p.tajweed ? legendHtml() : ''}
        ${toggleRow('translit', 'Translittération sous chaque mot', p.translit)}
        ${toggleRow('memorize', 'Masquer le texte', p.memorize, 'Le verset se dévoile au fil de la récitation.')}
        ${toggleRow('autoScroll', 'Suivre le verset récité', p.autoScroll)}
        <div class="qp-sheet__sub">Taille du texte arabe</div>
        <div class="qp-sheet__chips">
          ${FONT_SIZES.map((f, i) => `<button class="chip qp-font ${f.id === p.fontSize ? 'is-active' : ''}" style="font-size:${0.85 + i * 0.18}rem" data-pref="fontSize" data-value="${f.id}" aria-label="Taille ${i + 1}">ع</button>`).join('')}
        </div>
      </div>
      <p class="qp-sheet__credits">Récitations et minutage mot à mot : Quran.com (Quran Foundation).</p>`;

    sheet.querySelector('#qp-close').addEventListener('click', hideModal);
    sheet.querySelectorAll('[data-pref]').forEach(btn => btn.addEventListener('click', () => {
      haptic();
      const name = btn.dataset.pref;
      const raw = btn.dataset.value;
      if (name === 'loopCycles') {
        P.sheetCycles = raw === 'inf' ? Infinity : Number(raw);
        sheet.querySelectorAll('[data-pref="loopCycles"]').forEach(b => b.classList.toggle('is-active', b === btn));
        return;
      }
      let value = raw;
      if (['rate', 'reciter', 'loopPause'].includes(name)) value = Number(raw);
      if (name === 'repeat') value = raw === 'inf' ? Infinity : Number(raw);
      apply({ [name]: value });
    }));
    sheet.querySelectorAll('[data-pref-bool]').forEach(input => input.addEventListener('change', () => apply({ [input.dataset.prefBool]: input.checked })));
    sheet.querySelector('#qp-loop-go').addEventListener('click', () => {
      let s = Number(sheet.querySelector('#qp-loop-start').value) - 1;
      let e = Number(sheet.querySelector('#qp-loop-end').value) - 1;
      if (e < s) [s, e] = [e, s];
      P.loop = { start: s, end: e, cycles: P.sheetCycles ?? cycles, iter: 1 };
      P.sheetCycles = undefined;
      P.repeatIter = 1;
      hideModal();
      prepare(s, firstSegment(), true);
    });
    sheet.querySelector('#qp-loop-stop')?.addEventListener('click', () => {
      P.loop = null;
      markActive(false);
      renderSettings();
    });
  }

  // ── Media Session (écran verrouillé, casque) ───────────────────────
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const v = verses[P.idx];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${surah.name} · verset ${v.n}${P.segment === 'fr' ? ' (traduction)' : ''}`,
        artist: P.segment === 'fr' ? FRENCH_NARRATOR : reciterLabel(P.prefs.reciter),
        album: 'HelloArabic · Coran',
        artwork: [{ src: 'images/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', () => goto(P.idx - 1));
      navigator.mediaSession.setActionHandler('nexttrack', () => goto(P.idx + 1));
    } catch { /* navigateur sans Media Session complète */ }
  }

  // ── Cycle de vie ───────────────────────────────────────────────────
  const markScroll = () => { if (!a.paused) P.userScrollAt = Date.now(); };
  const onKey = e => {
    if (document.getElementById('modal-overlay') || e.target.closest?.('input, select, textarea')) return;
    if (e.code === 'Space' && !e.target.closest?.('button')) { e.preventDefault(); toggle(); }
  };
  const onHash = () => {
    const path = location.hash.replace(/^#/, '');
    if (!new RegExp(`^/coran/${id}(/verset/\\d+)?$`).test(path)) destroy();
  };
  window.addEventListener('wheel', markScroll, { passive: true });
  window.addEventListener('touchmove', markScroll, { passive: true });
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHash);

  function destroy() {
    if (!P.alive) return;
    P.alive = false;
    cancelAnimationFrame(P.raf);
    clearTimeout(P.pauseTimer);
    a.pause();
    a.removeAttribute('src');
    a.load();
    window.removeEventListener('wheel', markScroll);
    window.removeEventListener('touchmove', markScroll);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onHash);
    if ('mediaSession' in navigator) {
      for (const action of ['play', 'pause', 'previoustrack', 'nexttrack']) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* ignore */ }
      }
    }
  }

  return {
    get prefs() { return P.prefs; },
    get index() { return P.idx; },
    barHtml, bindBar, play, pause, toggle, playFrom, isPlaying, destroy, openSettings, apply,
    /** À appeler après un nouveau rendu des versets : réapplique l'état courant. */
    refresh() { P.lastWord = -2; markActive(false); tick(); },
    /** Place le lecteur sur un verset sans lancer la lecture (lien direct). */
    cue(i) { if (i >= 0 && i < verses.length) { P.idx = i; updateInfo(); } },
  };
}
