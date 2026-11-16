// js/pages/words-home.js — Bibliothèque de vocabulaire : thèmes, decks de leçons, recherche

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { db } from '../db.js';
import { icon } from '../icons.js';
import { ring, progressBar, toast } from '../ui.js';
import { $app, ensureDecks, themeDecks, srsStats, deckEmoji, tintStyle, speak } from './words-common.js';

export async function renderWordsHome() {
  const decks = await ensureDecks();
  const course = store.get('currentCourse');
  const themes = store.get('themes') || [];
  const [srsAll, lessonDeckEntries] = await Promise.all([
    course ? db.getSRS(course.id) : [],
    course ? db.getLessonDecks(course.id) : [],
  ]);

  // Comptage par cartes uniques : un mot du Coran partagé entre sourates ne compte qu'une fois
  const srsById = new Map(srsAll.map(e => [e.cardId, e]));
  const countCards = ids => {
    let acquired = 0, learning = 0;
    ids.forEach(id => { const e = srsById.get(id); if (e?.box >= 4) acquired++; else if (e?.box >= 1) learning++; });
    return { total: ids.size, acquired, learning };
  };
  const allIds = new Set();
  const themeItems = themes.map(theme => {
    const tDecks = themeDecks(theme, decks, themes);
    const ids = new Set(tDecks.flatMap(d => d.cards.map(c => c.id)));
    ids.forEach(id => allIds.add(id));
    return { theme, deckCount: tDecks.length, ...countCards(ids) };
  }).filter(t => t.deckCount > 0);

  const { total: totalWords, acquired, learning } = countCards(allIds);
  const pct = totalWords ? Math.round(acquired / totalWords * 100) : 0;

  $app().innerHTML = `
    ${renderHeader({ title: 'Vocabulaire', large: true, eyebrow: `${totalWords} mots · ${themeItems.length} thèmes`, titleAr: 'المفردات' })}
    <main class="page-content page-content--nav words-home">
      <section class="words-summary card">
        ${ring(pct, { size: 64, stroke: 7, label: `${pct}%` })}
        <div class="words-summary__body">
          <div class="words-summary__title">${acquired} mot${acquired > 1 ? 's' : ''} acquis</div>
          <div class="words-summary__meta">
            <span class="dot dot--gold"></span>${learning} en cours
            <span class="dot dot--muted"></span>${Math.max(0, totalWords - acquired - learning)} à découvrir
          </div>
        </div>
      </section>

      <label class="words-search">
        ${icon('search')}
        <input id="words-search" type="search" placeholder="Chercher un mot (français ou arabe)…" autocomplete="off" enterkeyhint="search">
      </label>

      <div id="words-search-results" class="words-search-results" hidden></div>

      <div id="words-browse">
        ${lessonDeckEntries.length ? `
          <section class="section">
            <div class="section__head"><h2 class="section__title">Mots de tes dialogues</h2></div>
            <div class="deck-grid stagger">
              ${lessonDeckEntries.map(entry => `
                <div class="row pressable deck-row" data-lesson-id="${escapeHtml(entry.lessonId)}" role="button" tabindex="0">
                  <span class="row__icon" style="--tint:var(--info-soft);--tint-ink:var(--info)">${icon('messages')}</span>
                  <span class="row__body">
                    <span class="row__title">${escapeHtml(entry.deck.name)}</span>
                    <span class="row__meta">${entry.deck.cards.length} cartes · ajouté le ${escapeHtml(_fmtDate(entry.createdAt))}</span>
                  </span>
                  <button class="icon-btn icon-btn--ghost deck-row__delete" data-delete-lesson-id="${escapeHtml(entry.lessonId)}" aria-label="Supprimer ce deck">${icon('trash-2')}</button>
                </div>`).join('')}
            </div>
          </section>` : ''}

        <section class="section">
          <div class="section__head"><h2 class="section__title">Thèmes</h2></div>
          <div class="themes-grid themes-bento stagger">
            ${themeItems.map((t, i) => _themeCard(t, i)).join('')}
          </div>
        </section>
      </div>
    </main>
    ${renderBottomNav('mots')}
  `;

  _bindHome(course, decks);
}

function _themeCard({ theme, deckCount, total, acquired }, i) {
  const wide = i % 5 === 0;
  const pct = total ? Math.round(acquired / total * 100) : 0;
  return `
    <article class="theme-card pressable ${wide ? 'theme-card--wide' : ''}" data-theme-id="${escapeHtml(theme.id)}"
             role="button" tabindex="0" aria-label="${escapeHtml(theme.name)}" style="${tintStyle(theme.color)}">
      <span class="theme-card__ar" lang="ar" aria-hidden="true">${escapeHtml(theme.nameAr)}</span>
      <span class="theme-card__icon">${theme.icon}</span>
      <span class="theme-card__body">
        <span class="theme-card__name">${escapeHtml(theme.name)}</span>
        <span class="theme-card__count">${deckCount} decks · ${total} mots</span>
        <span class="theme-card__progress">${progressBar(pct, 'progress--thin')}<b>${pct}%</b></span>
      </span>
    </article>`;
}

function _fmtDate(d) {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
  catch { return d; }
}

function _bindHome(course, decks) {
  const root = $app();
  const activate = (el, fn) => {
    el.addEventListener('click', fn);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } });
  };

  root.querySelectorAll('.theme-card').forEach(el => activate(el, () => navigate(`/mots/${el.dataset.themeId}`)));
  root.querySelectorAll('.deck-row[data-lesson-id]').forEach(el => activate(el, e => {
    if (e.target.closest('.deck-row__delete')) return;
    navigate(`/mots/lecons/${el.dataset.lessonId}`);
  }));
  root.querySelectorAll('.deck-row__delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const lessonId = btn.dataset.deleteLessonId;
      await db.deleteLessonDeck(course.id, lessonId);
      store.set('decks', (store.get('decks') || []).filter(d => d.id !== `lesson-vocab-${lessonId}`));
      toast('Deck supprimé', { icon: 'trash-2' });
      renderWordsHome();
    });
  });

  // Recherche instantanée
  const input = document.getElementById('words-search');
  const results = document.getElementById('words-search-results');
  const browse = document.getElementById('words-browse');
  const themes = store.get('themes') || [];
  const index = decks.filter(d => d.source !== 'lesson').flatMap(d => d.cards.map(c => ({ c, d })));
  const deckTheme = new Map();
  themes.forEach(t => themeDecks(t, decks, themes).forEach(d => deckTheme.set(d.id, t.id)));
  const fold = s => (s || '').normalize('NFD').replace(/[̀-ًͯ-ٰٟ]/g, '').toLowerCase();

  let timer;
  input?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = fold(input.value.trim());
      if (q.length < 2) { results.hidden = true; browse.hidden = false; return; }
      const hits = index.filter(({ c }) => fold(c.back).includes(q) || fold(c.frontPlain || c.front).includes(q) || fold(c.translit).includes(q)).slice(0, 40);
      browse.hidden = true;
      results.hidden = false;
      results.innerHTML = hits.length ? `
        <div class="section__head"><h2 class="section__title">${hits.length}${hits.length === 40 ? '+' : ''} résultat${hits.length > 1 ? 's' : ''}</h2></div>
        <div class="deck-grid">
          ${hits.map(({ c, d }) => `
            <div class="row word-hit" data-goto="/mots/${escapeHtml(deckTheme.get(d.id) || '')}/${escapeHtml(d.id)}" role="button" tabindex="0">
              <span class="row__icon word-hit__emoji">${c.emoji || '•'}</span>
              <span class="row__body">
                <span class="row__title">${escapeHtml(c.back)}</span>
                <span class="row__meta">${escapeHtml(d.name)}${c.translit ? ` · <em>${escapeHtml(c.translit)}</em>` : ''}</span>
              </span>
              <span class="word-hit__ar" lang="ar">${escapeHtml(c.front)}</span>
              <button class="icon-btn icon-btn--ghost word-hit__audio" data-say="${escapeHtml(c.front)}" aria-label="Écouter">${icon('volume-2')}</button>
            </div>`).join('')}
        </div>` : `
        <div class="empty"><div class="empty__emoji">🔍</div><div class="empty__title">Aucun mot trouvé</div><p>Essaie une autre orthographe.</p></div>`;
      results.querySelectorAll('.word-hit').forEach(el => activate(el, e => {
        const say = e.target.closest('[data-say]');
        if (say) { e.stopPropagation(); speak(say, say.dataset.say, course.config.frontLang); return; }
        if (!el.dataset.goto.includes('//')) navigate(el.dataset.goto);
      }));
    }, 120);
  });
}

export async function renderWordsTheme(params) {
  const decks = await ensureDecks();
  const { themeId } = params;
  const themes = store.get('themes') || [];
  const theme = themes.find(t => t.id === themeId);
  if (!theme) { navigate('/mots'); return; }
  const course = store.get('currentCourse');
  const srsAll = course ? await db.getSRS(course.id) : [];

  const items = themeDecks(theme, decks, themes).map(deck => ({ deck, st: srsStats(deck, srsAll) }));
  // Cartes uniques (les mots du Coran sont partagés entre sourates)
  const uniqueIds = new Set(items.flatMap(i => i.deck.cards.map(c => c.id)));
  const acquiredIds = new Set(srsAll.filter(e => e.box >= 4 && uniqueIds.has(e.cardId)).map(e => e.cardId));
  const total = uniqueIds.size;
  const acquired = acquiredIds.size;
  const pct = total ? Math.round(acquired / total * 100) : 0;

  $app().innerHTML = `
    ${renderHeader({ title: theme.name, back: '/mots' })}
    <main class="page-content page-content--nav">
      <section class="theme-hero" style="${tintStyle(theme.color)}">
        <span class="theme-hero__ar" lang="ar" aria-hidden="true">${escapeHtml(theme.nameAr)}</span>
        <span class="theme-hero__icon">${theme.icon}</span>
        <div class="theme-hero__name">${escapeHtml(theme.name)}</div>
        <div class="theme-hero__name-ar" lang="ar">${escapeHtml(theme.nameAr)}</div>
        <div class="theme-hero__meta">${items.length} decks · ${total} mots · ${acquired} acquis</div>
        <div class="theme-hero__progress">${progressBar(pct)}</div>
      </section>

      <section class="section">
        <div class="section__head"><h2 class="section__title">Decks</h2></div>
        <div class="deck-grid stagger">
          ${items.map(({ deck, st }) => `
            <div class="row pressable deck-row" data-deck-id="${escapeHtml(deck.id)}" role="button" tabindex="0" aria-label="${escapeHtml(deck.name)}">
              <span class="row__icon deck-row__emoji" style="${tintStyle(theme.color)}">${deckEmoji(deck)}</span>
              <span class="row__body">
                <span class="deck-row__top">
                  <span class="row__title">${escapeHtml(deck.name)}</span>
                  ${st.pct === 100 ? `<span class="badge badge--success">${icon('check')}Acquis</span>` : ''}
                </span>
                <span class="row__meta">${st.total} mots${st.acquired ? ` · ${st.acquired} acquis` : ''}${deck.nameAr ? ` · <span lang="ar" class="deck-row__ar">${escapeHtml(deck.nameAr)}</span>` : ''}</span>
                ${st.acquired + st.learning > 0 ? `<span class="deck-row__bar">${progressBar(st.pct, 'progress--thin')}</span>` : ''}
              </span>
              <span class="row__chev">${icon('chevron-right')}</span>
            </div>`).join('')}
        </div>
      </section>
    </main>
    ${renderBottomNav('mots')}
  `;

  $app().querySelectorAll('.deck-row').forEach(el => {
    const go = () => navigate(`/mots/${themeId}/${el.dataset.deckId}`);
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}
