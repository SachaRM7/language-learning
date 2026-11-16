// js/pages/roots.js — Racines trilittères et familles de mots

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml, removeHarakats, removeFrenchAccents } from '../utils.js';
import { playWord } from '../audio.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';
import { ensureAllDecks } from '../decks.js';
import { openRootSheet } from '../components/quran-sheets.js';
import { loadQuranIndex, loadSurah, loadLexicon, knownLemmas, lemmaMeaning } from '../quran.js';

const $app = () => document.getElementById('app');
let _state = { roots: [], open: null, query: '', tab: 'base', quranRoots: [], lexicon: null };

const TYPE_TINT = {
  'verbe': 'primary',
  'nom': 'blue',
  "nom d'action": 'gold',
  'participe actif': 'violet',
  'participe passif': 'red',
  'prénom': 'green',
  'nom de lieu': 'gold',
};

export async function renderRoots(params = {}) {
  let roots = store.get('rootsData');
  if (!roots) {
    const data = await fetch('data/roots/roots.json').then(r => r.json());
    roots = data.roots;
    store.set('rootsData', roots);
  }
  const quran = await _loadQuranRoots().catch(() => ({ list: [], lexicon: null }));
  const target = params.root ? decodeURIComponent(params.root) : null;
  _state = { roots, open: null, query: '', tab: target ? 'coran' : (_state.tab || 'base'), quranRoots: quran.list, lexicon: quran.lexicon };
  _render();
  if (target) openRootSheet(target);
}

/** Racines rencontrées dans les sourates étudiées, triées par fréquence dans tout le Coran. */
async function _loadQuranRoots() {
  await ensureAllDecks();
  const [index, lexicon] = await Promise.all([loadQuranIndex(), loadLexicon()]);
  const surahs = await Promise.all(index.surahs.map(s => loadSurah(s.id)));
  const known = await knownLemmas(store.get('currentCourse')?.id || 'arabic');
  const inScope = new Set(surahs.flatMap(s => s.verses.flatMap(v => v.w.map(w => w.r))).filter(Boolean));
  const list = [...inScope].map(root => {
    const lemmas = lexicon.roots[root] || [];
    const occ = lemmas.reduce((n, l) => n + (lexicon.lemmas[l]?.[1] || 0), 0);
    return { root, lemmas, occ, known: lemmas.filter(l => known.has(l)).length };
  }).sort((a, b) => b.occ - a.occ);
  return { list, lexicon };
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

      <div class="segmented roots-tabs" role="tablist">
        <button class="${_state.tab === 'base' ? 'is-active' : ''}" data-rtab="base" role="tab">Essentielles · ${roots.length}</button>
        <button class="${_state.tab === 'coran' ? 'is-active' : ''}" data-rtab="coran" role="tab">📖 Coran · ${_state.quranRoots.length}</button>
      </div>

      <label class="roots-search">
        ${icon('search')}
        <input class="roots-search__input" id="roots-search" type="search" placeholder="Chercher un sens ou une racine…" autocomplete="off" aria-label="Chercher une racine">
      </label>

      <div class="roots-list stagger" id="roots-list" ${_state.tab === 'base' ? '' : 'hidden'}>
        ${roots.map(_rootCard).join('')}
      </div>
      <div class="roots-qlist" id="roots-qlist" ${_state.tab === 'coran' ? '' : 'hidden'}>
        <p class="roots-qlist__intro">Les racines des sourates que tu étudies, de la plus fréquente à la plus rare dans le Coran. Touche-en une pour voir toute sa famille.</p>
        ${_state.quranRoots.map(_quranRootRow).join('')}
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
          <span class="root-card__meta">${escapeHtml(root.transliteration)} · ${root.derivatives.length} mots${_quranCount(root.letters) ? ` · 📖 ${_quranCount(root.letters)}× dans le Coran` : ''}</span>
        </span>
        <span class="root-card__chev">${icon('chevron-down')}</span>
      </button>
      <div class="root-card__collapse" id="root-${escapeHtml(root.id)}">
        <div class="root-card__inner">
          <ul class="root-card__derivs">
            ${root.derivatives.map(d => _derivative(d, root.letters)).join('')}
          </ul>
          ${_quranCount(root.letters) ? `<button class="btn btn--tonal btn--block root-card__quran" data-qroot="${escapeHtml(root.letters.join(''))}">📖 Cette racine dans le Coran</button>` : ''}
        </div>
      </div>
    </article>`;
}

function _quranRootRow(r) {
  const top = r.lemmas.slice(0, 3).map(l => lemmaMeaning(l, _state.lexicon).text).filter(Boolean);
  const hay = [r.root, ...r.lemmas.slice(0, 8), ...top].join(' ');
  return `
    <button class="qroot-row pressable" data-qroot="${escapeHtml(r.root)}" data-hay="${escapeHtml(hay)}">
      <span class="q-root" lang="ar" dir="rtl">${[...r.root].map(c => `<b>${escapeHtml(c)}</b>`).join('')}</span>
      <span class="qroot-row__body">
        <span class="qroot-row__mean">${escapeHtml(top.join(' · ') || '—')}</span>
        <span class="qroot-row__meta">${r.lemmas.length} mot${r.lemmas.length > 1 ? 's' : ''} · ${r.occ}× dans le Coran${r.known ? ` · <b>${r.known} connu${r.known > 1 ? 's' : ''}</b>` : ''}</span>
      </span>
      <span class="row__chev">${icon('chevron-right')}</span>
    </button>`;
}

function _quranCount(letters) {
  const lx = _state.lexicon;
  const lemmas = lx?.roots?.[letters.join('')];
  if (!lemmas) return 0;
  return lemmas.reduce((n, l) => n + (lx.lemmas[l]?.[1] || 0), 0);
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
  $app().querySelectorAll('[data-rtab]').forEach(b => b.addEventListener('click', () => {
    _state.tab = b.dataset.rtab;
    $app().querySelectorAll('[data-rtab]').forEach(x => x.classList.toggle('is-active', x === b));
    document.getElementById('roots-list').hidden = _state.tab !== 'base';
    document.getElementById('roots-qlist').hidden = _state.tab !== 'coran';
    document.getElementById('roots-empty').hidden = true;
    const input = document.getElementById('roots-search');
    if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }
    haptic(6);
  }));
  $app().querySelectorAll('[data-qroot]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    openRootSheet(b.dataset.qroot);
  }));

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
    if (_state.tab === 'coran') {
      $app().querySelectorAll('.qroot-row').forEach(el => {
        const show = !q || norm(el.dataset.hay).includes(q);
        el.hidden = !show;
        if (show) visible++;
      });
      document.getElementById('roots-empty').hidden = visible > 0;
      return;
    }
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
