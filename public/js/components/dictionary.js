// js/components/dictionary.js — Le Kazimirski (dictionnaire arabe-français, 1860) à la bonne page.
//
// Les scans viennent d'archive.org (domaine public). Un index construit hors ligne
// (scripts/build-kazimirski.py) donne, pour chaque page, la première et la dernière racine
// repérées : on ouvre la page où commence la racine (à une page près : on peut feuilleter).

import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';
import { showModal, hideModal } from './modal.js';

let _index = null;
const HAMZA = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ء': 'ا', 'ؤ': 'ا', 'ئ': 'ا', 'ى': 'ي', 'ٱ': 'ا' };
const HARAKAT = /[ً-ٰٟـۖ-ۭ]/g;

async function loadIndex() {
  if (!_index) {
    const res = await fetch('data/kazimirski.json');
    if (!res.ok) throw new Error(`kazimirski ${res.status}`);
    const data = await res.json();
    const rank = Object.fromEntries([...data.alphabet].map((c, i) => [c, i]));
    _index = { ...data, rank, anchors: data.anchors.map(([v, n, lo, hi]) => ({ v, n, lo, hi })) };
  }
  return _index;
}

const norm = root => [...String(root).replace(HARAKAT, '').replace(/[-\s]/g, '')].map(c => HAMZA[c] || c).join('');

function compare(a, b, rank) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = rank[a[i]] ?? -1, y = rank[b[i]] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Page (volume, vue) où commence la racine, ou null si la racine est illisible. */
export async function kazimirskiPage(root) {
  const idx = await loadIndex();
  const r = norm(root);
  if (r.length < 2 || [...r].some(c => idx.rank[c] === undefined)) return null;
  const at = idx.anchors.find(a => compare(a.hi, r, idx.rank) >= 0) || idx.anchors[idx.anchors.length - 1];
  // Si la page commence déjà après la racine, celle-ci démarre sur la page précédente
  const n = compare(at.lo, r, idx.rank) > 0 && at.n > 0 ? at.n - 1 : at.n;
  return { volume: at.v, view: n, ident: idx.volumes[String(at.v)] };
}

const pageUrl = (ident, n, w = 1100) => `https://archive.org/download/${ident}/page/n${n}_w${w}.jpg`;
const detailsUrl = (ident, n) => `https://archive.org/details/${ident}/page/n${n}/mode/1up`;

/** Ouvre le lecteur du dictionnaire à la page de la racine. */
export async function openKazimirski(root) {
  const page = await kazimirskiPage(root).catch(() => null);
  if (!page) return;
  const start = page.view;
  let n = start;
  let zoom = false;
  const display = [...norm(root)].join('-');

  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal kz-sheet" role="dialog" aria-label="Dictionnaire Kazimirski">
        <div class="kz-head">
          <div class="kz-head__title">
            <span class="kz-head__root" lang="ar">${escapeHtml(display)}</span>
            <span class="kz-head__src">Kazimirski · <i>Dictionnaire arabe-français</i> (1860) · vol. ${page.volume}</span>
          </div>
          <button class="icon-btn icon-btn--ghost" id="kz-close" aria-label="Fermer">${icon('x')}</button>
        </div>
        <div class="kz-view" id="kz-view">
          <img class="kz-img" id="kz-img" alt="Page du dictionnaire Kazimirski" decoding="async">
          <div class="kz-loading" id="kz-loading">${icon('book-open')} Chargement de la page…</div>
        </div>
        <div class="kz-bar">
          <button class="btn btn--secondary btn--sm" id="kz-prev">${icon('chevron-left')} Page préc.</button>
          <button class="icon-btn" id="kz-zoom" aria-label="Agrandir">${icon('search')}</button>
          <button class="btn btn--secondary btn--sm" id="kz-next">Page suiv. ${icon('chevron-right')}</button>
        </div>
        <p class="kz-note" id="kz-note"></p>
      </div>
    </div>`);

  const overlay = document.getElementById('modal-overlay');
  const img = document.getElementById('kz-img');
  const view = document.getElementById('kz-view');
  const note = document.getElementById('kz-note');
  const loading = document.getElementById('kz-loading');
  const show = () => {
    loading.hidden = false;
    img.classList.remove('is-ready');
    img.src = pageUrl(page.ident, n);
    view.scrollTop = 0;
    const off = n - start;
    note.innerHTML = `${off === 0 ? 'Page où commence la racine (à une page près).' : `${off > 0 ? '+' : ''}${off} page${Math.abs(off) > 1 ? 's' : ''} depuis la racine.`}
      <a href="${detailsUrl(page.ident, n)}" target="_blank" rel="noopener">Ouvrir sur archive.org</a>`;
  };
  img.addEventListener('load', () => { loading.hidden = true; img.classList.add('is-ready'); });
  img.addEventListener('error', () => { loading.textContent = 'Page indisponible (connexion à archive.org ?)'; });
  document.getElementById('kz-prev').addEventListener('click', () => { n = Math.max(0, n - 1); haptic(5); show(); });
  document.getElementById('kz-next').addEventListener('click', () => { n += 1; haptic(5); show(); });
  document.getElementById('kz-zoom').addEventListener('click', () => {
    zoom = !zoom;
    view.classList.toggle('is-zoomed', zoom);
  });
  document.getElementById('kz-close').addEventListener('click', hideModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
  show();
}

/** Petit bouton « Kazimirski » à glisser dans une fiche. */
export function kazimirskiButton(root, cls = '') {
  return `<button class="kz-btn ${cls}" data-kz="${escapeHtml(root)}">${icon('book-open')} Dictionnaire Kazimirski (1860)</button>`;
}

export function bindKazimirskiButtons(scope = document) {
  scope.querySelectorAll('[data-kz]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const root = b.dataset.kz;
    hideModal();
    setTimeout(() => openKazimirski(root), 220);
  }));
}
