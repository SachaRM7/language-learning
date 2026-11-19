// js/pages/roots.js — Racines trilittères et familles de mots

import { store } from '../store.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { playWord } from '../audio.js';
import { icon } from '../icons.js';
import { haptic } from '../ui.js';
import { ensureAllDecks } from '../decks.js';
import { openRootSheet } from '../components/quran-sheets.js';
import { kazimirskiButton, bindKazimirskiButtons } from '../components/dictionary.js';
import { loadQuranIndex, loadSurah, loadLexicon, knownLemmas, lemmaMeaning } from '../quran.js';
import { scoreRoot, rootTranslit } from '../root-search.js';

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
        <input class="roots-search__input" id="roots-search" type="search" placeholder="Racine (ك ت ب), mot arabe ou sens…" autocomplete="off" aria-label="Chercher une racine : lettres arabes, mot ou sens">
      </label>

      <div class="roots-list stagger" id="roots-list" ${_state.tab === 'base' ? '' : 'hidden'}>
        ${roots.map(_rootCard).join('')}
      </div>
      <div class="roots-qlist" id="roots-qlist" ${_state.tab === 'coran' ? '' : 'hidden'}>
        <p class="roots-qlist__intro">Les racines des sourates que tu étudies, de la plus fréquente à la plus rare dans le Coran. Touche-en une pour voir toute sa famille.</p>
        ${_state.quranRoots.map(_quranRootRow).join('')}
      </div>
      <button class="roots-other" id="roots-other" hidden></button>
      <div class="empty" id="roots-empty" hidden>
        <div class="empty__emoji">🔎</div>
        <div class="empty__title">Aucune racine trouvée</div>
        <div>Essaie les lettres de la racine (ex. ك ت ب), un mot arabe ou un sens en français.</div>
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
          ${kazimirskiButton(root.letters.join(''))}
        </div>
      </div>
    </article>`;
}

function _quranRootRow(r) {
  const top = r.lemmas.slice(0, 3).map(l => lemmaMeaning(l, _state.lexicon).text).filter(Boolean);
  return `
    <button class="qroot-row pressable" data-qroot="${escapeHtml(r.root)}">
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
  bindKazimirskiButtons($app());
  $app().querySelectorAll('[data-rtab]').forEach(b => b.addEventListener('click', () => {
    _state.tab = b.dataset.rtab;
    $app().querySelectorAll('[data-rtab]').forEach(x => x.classList.toggle('is-active', x === b));
    document.getElementById('roots-list').hidden = _state.tab !== 'base';
    document.getElementById('roots-qlist').hidden = _state.tab !== 'coran';
    _search(document.getElementById('roots-search')?.value || '');
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

  document.getElementById('roots-search')?.addEventListener('input', e => _search(e.target.value));
  document.getElementById('roots-other')?.addEventListener('click', () => {
    $app().querySelector(`[data-rtab="${_state.tab === 'base' ? 'coran' : 'base'}"]`)?.click();
  });
}

// ── Recherche ────────────────────────────────────────────────────────

/** Éléments de recherche (calculés une fois) : lettres de la racine, mots de la famille, sens. */
function _searchItems() {
  if (_state.items) return _state.items;
  const base = _state.roots.map((root, i) => ({
    key: root.id, i,
    root: root.letters.join(''),
    words: root.derivatives.map(d => d.arPlain || d.ar),
    latin: [root.meaning, root.transliteration, ...root.derivatives.map(d => `${d.fr} ${d.translit}`)].join(' '),
  }));
  const coran = _state.quranRoots.map((r, i) => ({
    key: r.root, i,
    root: r.root,
    words: r.lemmas,
    latin: [rootTranslit(r.root), ...r.lemmas.map(l => lemmaMeaning(l, _state.lexicon).text)].join(' '),
  }));
  _state.items = { base, coran };
  return _state.items;
}

function _rank(items, q) {
  return items.map(it => ({ it, score: scoreRoot(it, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.it.i - b.it.i); // à égalité : ordre d'origine (fréquence)
}

function _search(raw) {
  const q = raw.trim();
  const items = _searchItems();
  const tab = _state.tab === 'coran' ? 'coran' : 'base';
  const other = tab === 'base' ? 'coran' : 'base';
  const ranked = _rank(items[tab], q);

  const list = document.getElementById(tab === 'base' ? 'roots-list' : 'roots-qlist');
  const selector = tab === 'base' ? key => `.root-card[data-root-id="${CSS.escape(key)}"]` : key => `.qroot-row[data-qroot="${CSS.escape(key)}"]`;
  const all = list.querySelectorAll(tab === 'base' ? '.root-card' : '.qroot-row');
  const shown = new Set(ranked.map(x => x.it.key));
  all.forEach(el => { el.hidden = Boolean(q) && !shown.has(tab === 'base' ? el.dataset.rootId : el.dataset.qroot); });
  // Les meilleurs résultats en premier ; ordre d'origine quand la recherche est vide
  const order = q ? ranked.map(x => x.it) : items[tab];
  order.forEach(it => { const el = list.querySelector(selector(it.key)); if (el) list.appendChild(el); });
  const intro = list.querySelector('.roots-qlist__intro');
  if (intro) { intro.hidden = Boolean(q); list.prepend(intro); }

  const empty = document.getElementById('roots-empty');
  if (empty) empty.hidden = !q || ranked.length > 0;
  // Résultats dans l'autre onglet
  const otherCount = q ? _rank(items[other], q).length : 0;
  const hint = document.getElementById('roots-other');
  if (hint) {
    hint.hidden = otherCount === 0;
    hint.innerHTML = `${icon('search')} ${otherCount} racine${otherCount > 1 ? 's' : ''} dans l'onglet ${other === 'coran' ? '📖 Coran' : 'Essentielles'} ${icon('arrow-right')}`;
    if (ranked.length === 0) list.after(hint); else list.before(hint);
  }
}

