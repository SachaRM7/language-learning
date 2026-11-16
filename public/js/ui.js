// js/ui.js — Micro-interactions partagées : thème, haptique, toasts, confettis, anneaux, feedback.

import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

// ── Thème ─────────────────────────────────────────────────────────
const _mq = window.matchMedia('(prefers-color-scheme: dark)');
let _themePref = 'system';

/** pref : 'light' | 'dark' | 'system' */
export function applyTheme(pref = 'system') {
  _themePref = pref;
  try { localStorage.setItem('ha-theme', pref); } catch { /* stockage indisponible */ }
  const resolved = pref === 'system' ? (_mq.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0E1113' : '#F6F1E9';
  return resolved;
}
_mq.addEventListener?.('change', () => { if (_themePref === 'system') applyTheme('system'); });

// ── Haptique ──────────────────────────────────────────────────────
export function haptic(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch { /* non supporté */ }
}

// ── Toasts ────────────────────────────────────────────────────────
export function toast(message, { icon: ic = 'check-circle', duration = 2400 } = {}) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(ic)}<span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, duration);
}

// ── Confettis (canvas léger, ~1.8 s) ──────────────────────────────
export function confetti({ count = 110, colors } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.querySelector('.confetti-canvas')) return;
  const css = getComputedStyle(document.documentElement);
  const palette = colors || [
    css.getPropertyValue('--primary').trim(), css.getPropertyValue('--gold').trim(),
    '#E76F51', '#7A5AE0', '#2F6FDB',
  ];
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.38,
    vx: (Math.random() - 0.5) * 13,
    vy: -Math.random() * 13 - 4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: palette[Math.floor(Math.random() * palette.length)],
  }));
  const start = performance.now();
  const tick = now => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach(p => {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1800);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    });
    if (t < 1800) requestAnimationFrame(tick); else canvas.remove();
  };
  requestAnimationFrame(tick);
}

// ── Anneau de progression SVG ─────────────────────────────────────
export function ring(pct, { size = 56, stroke = 6, label = '', color = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `
    <div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle class="ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
        <circle class="ring__bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
          stroke-dasharray="${c}" stroke-dashoffset="${off}" style="--ring-circumference:${c};${color ? `stroke:${color}` : ''}"/>
      </svg>
      ${label !== '' ? `<span class="ring__label">${label}</span>` : ''}
    </div>`;
}

// ── Barre de progression ──────────────────────────────────────────
export function progressBar(pct, cls = '') {
  return `<div class="progress ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
    <div class="progress__fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
}

// ── Compteur animé ────────────────────────────────────────────────
const countFrames = new WeakMap();
export function animateCount(el, to, duration = 700) {
  if (!el) return;
  cancelAnimationFrame(countFrames.get(el));
  const from = Number(el.textContent) || 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) { el.textContent = to; return; }
  const start = performance.now();
  const step = now => {
    if (!el.isConnected) return;
    const k = reduce.matches ? 1 : Math.min(1, (now - start) / duration);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) countFrames.set(el, requestAnimationFrame(step));
    else countFrames.delete(el);
  };
  countFrames.set(el, requestAnimationFrame(step));
}

// ── Bandeau de feedback (bas d'écran) ─────────────────────────────
/**
 * Affiche un bandeau « Bravo » / « Pas tout à fait » avec un bouton Continuer.
 * @returns {Promise<void>} résolue quand l'utilisateur continue.
 */
export function showFeedback({ correct, title, html = '', cta = 'Continuer' }) {
  hideFeedback();
  haptic(correct ? 12 : [30, 40, 30]);
  const bar = document.createElement('div');
  bar.className = `feedback-bar feedback-bar--${correct ? 'correct' : 'wrong'}`;
  bar.setAttribute('role', 'alert');
  bar.innerHTML = `
    <div class="feedback-bar__head">
      <span class="feedback-bar__icon">${icon(correct ? 'check' : 'x')}</span>
      <span class="feedback-bar__title">${escapeHtml(title || (correct ? pickPraise() : 'Pas tout à fait'))}</span>
    </div>
    ${html ? `<div class="feedback-bar__text">${html}</div>` : '<div style="height:8px"></div>'}
    <button class="btn btn--primary btn--block btn--lg" data-feedback-continue>${escapeHtml(cta)}</button>`;
  document.body.appendChild(bar);
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('is-open')));
  return new Promise(resolve => {
    const btn = bar.querySelector('[data-feedback-continue]');
    const done = () => { document.removeEventListener('keydown', onKey); hideFeedback(); resolve(); };
    const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); done(); } };
    btn.addEventListener('click', done);
    setTimeout(() => { btn.focus({ preventScroll: true }); document.addEventListener('keydown', onKey); }, 250);
  });
}

export function hideFeedback() {
  document.querySelectorAll('.feedback-bar').forEach(b => {
    b.classList.remove('is-open');
    setTimeout(() => b.remove(), 300);
  });
}

const PRAISE = ['Bravo !', 'Excellent !', 'Parfait !', 'Super !', 'Bien joué !', 'Génial !'];
export function pickPraise() { return PRAISE[Math.floor(Math.random() * PRAISE.length)]; }

// ── En-tête : ombre au défilement ─────────────────────────────────
let _scrollBound = false;
export function bindHeaderScroll() {
  if (_scrollBound) return;
  _scrollBound = true;
  const update = () => {
    document.querySelector('.page-header')?.classList.toggle('is-scrolled', window.scrollY > 4);
  };
  window.addEventListener('scroll', update, { passive: true });
}

// ── Salutation selon l'heure ──────────────────────────────────────
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5)  return { fr: 'Bonne nuit', ar: 'تُصْبِحُ عَلَى خَيْر', tr: 'tuṣbiḥ ʿalā khayr' };
  if (h < 12) return { fr: 'Bonjour', ar: 'صَبَاحُ الخَيْر', tr: 'ṣabāḥ al-khayr' };
  if (h < 18) return { fr: 'Bon après-midi', ar: 'مَرْحَبًا', tr: 'marḥaban' };
  return { fr: 'Bonsoir', ar: 'مَسَاءُ الخَيْر', tr: 'masāʾ al-khayr' };
}
