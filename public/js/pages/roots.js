// js/pages/roots.js — Racines trilittères et familles de mots

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml, removeHarakats, removeFrenchAccents } from '../utils.js';
import { playWord } from '../audio.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';

const $app = () => document.getElementById('app');
let _state = { roots: [], open: null, query: '' };

const TYPE_TINT = {
  'verbe': 'primary',
  'nom': 'blue',
  "nom d'action": 'gold',
  'participe actif': 'violet',
  'participe passif': 'red',
  'prénom': 'green',
  'nom de lieu': 'gold',
};

export async function renderRoots() {
  let roots = store.get('rootsData');
  if (!roots) {
    const data = await fetch('data/roots/roots.json').then(r => r.json());
    roots = data.roots;
    store.set('rootsData', roots);
  }
  _state = { roots, open: null, query: '' };
  _render();
}

function _render() {
  const { roots } = _state;
  $app().innerHTML = `
    ${renderHeader({ title: 'Racines', titleAr: 'الجُذُور', back: '/home' })}
    <main class="page-content page-content--nav">
      <section class="roots-hero">
        <div class="roots-hero__demo" lang="ar" dir="rtl" aria-hidden="true">
          <span class="roots-hero__root"><b>ك</b><b>ت</b><b>ب</b></span>
          <span class="roots-hero__arrow">${icon('arrow-left')}</span>
          <span class="roots-hero__words"><span>كِتَاب</span><span>كَاتِب</span><span>مَكْتَب</span></span>
        </div>
        <p>En arabe, la plupart des mots naissent d'une <strong>racine de 3 consonnes</strong>. Apprends la racine, et tu devines toute la famille.</p>
      </section>

      <label class="roots-search">
        ${icon('search')}
        <input class="roots-search__input" id="roots-search" type="search" placeholder="Chercher un sens ou une racine…" autocomplete="off" aria-label="Chercher une racine">
      </label>

      <div class="roots-list stagger" id="roots-list">
        ${roots.map(_rootCard).join('')}
      </div>
      <div class="empty" id="roots-empty" hidden>
        <div class="empty__emoji">🔎</div>
        <div class="empty__title">Aucune racine trouvée</div>
        <div>Essaie un autre mot-clé.</div>
      </div>
    </main>
    ${renderBottomNav('home')}
  `;
  _bindEvents();
}

function _rootCard(root) {
  return `
    <article class="root-card" data-root-id="${escapeHtml(root.id)}">
      <button class="root-card__head" aria-expanded="false" aria-controls="root-${escapeHtml(root.id)}">
        <span class="root-card__letters" lang="ar" dir="rtl">
          ${root.letters.map(l => `<span class="root-card__radical">${escapeHtml(l)}</span>`).join('')}
        </span>
        <span class="root-card__body">
          <span class="root-card__meaning">${escapeHtml(root.meaning)}</span>
          <span class="root-card__meta">${escapeHtml(root.transliteration)} · ${root.derivatives.length} mots</span>
        </span>
        <span class="root-card__chev">${icon('chevron-down')}</span>
      </button>
      <div class="root-card__collapse" id="root-${escapeHtml(root.id)}">
        <div class="root-card__inner">
          <ul class="root-card__derivs">
            ${root.derivatives.map(d => _derivative(d, root.letters)).join('')}
          </ul>
        </div>
      </div>
    </article>`;
}

function _derivative(d, letters) {
  const tint = TYPE_TINT[d.type] || 'primary';
  return `
    <li class="root-deriv">
      <button class="audio-btn audio-btn--sm" data-ar="${escapeHtml(d.ar)}" aria-label="Écouter ${escapeHtml(d.translit)}">${icon('volume-2')}</button>
      <div class="root-deriv__info">
        <div class="root-deriv__fr">${escapeHtml(d.fr)}</div>
        <div class="root-deriv__meta">
          <span class="root-deriv__tr">${escapeHtml(d.translit)}</span>
          <span class="badge badge--${tint}">${escapeHtml(d.type)}</span>
          ${d.pattern && d.pattern !== '-' ? `<span class="root-deriv__pattern" lang="ar" title="Schème">${escapeHtml(d.pattern)}</span>` : ''}
        </div>
      </div>
      <div class="root-deriv__ar" lang="ar" dir="rtl">${_highlightRoot(d.ar, letters)}</div>
    </li>`;
}

/** Met en évidence, dans l'ordre, les consonnes de la racine à l'intérieur du mot. */
function _highlightRoot(word, letters) {
  const chars = [...word];
  const isMark = c => /[ً-ٰٟ]/.test(c);
  const norm = c => c.replace(/[أإآ]/g, 'ا');
  let ptr = 0;
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!isMark(c) && ptr < letters.length && norm(c) === norm(letters[ptr])) {
      let seg = c;
      while (i + 1 < chars.length && isMark(chars[i + 1])) seg += chars[++i];
      out += `<span class="root-hl">${escapeHtml(seg)}</span>`;
      ptr++;
    } else {
      out += escapeHtml(c);
    }
  }
  return out;
}

function _toggle(card) {
  const isOpen = card.classList.toggle('is-open');
  card.querySelector('.root-card__head')?.setAttribute('aria-expanded', isOpen);
  haptic(6);
  if (isOpen) {
    $app().querySelectorAll('.root-card.is-open').forEach(c => {
      if (c !== card) { c.classList.remove('is-open'); c.querySelector('.root-card__head')?.setAttribute('aria-expanded', 'false'); }
    });
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 260);
  }
}

function _bindEvents() {
  $app().querySelectorAll('.root-card__head').forEach(btn => {
    btn.addEventListener('click', () => _toggle(btn.closest('.root-card')));
  });

  $app().querySelectorAll('[data-ar]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.classList.add('is-playing');
      await playWord(btn.dataset.ar, 'ar-SA');
      btn.classList.remove('is-playing');
    });
  });

  const norm = s => removeFrenchAccents(removeHarakats(String(s || '')).toLowerCase());
  document.getElementById('roots-search')?.addEventListener('input', e => {
    const q = norm(e.target.value.trim());
    let visible = 0;
    _state.roots.forEach(root => {
      const hay = norm([root.meaning, root.transliteration, root.letters.join(''),
        ...root.derivatives.map(d => `${d.fr} ${d.translit} ${d.arPlain || d.ar}`)].join(' '));
      const show = !q || hay.includes(q);
      const el = $app().querySelector(`.root-card[data-root-id="${CSS.escape(root.id)}"]`);
      if (el) el.hidden = !show;
      if (show) visible++;
    });
    const empty = document.getElementById('roots-empty');
    if (empty) empty.hidden = visible > 0;
  });
}
