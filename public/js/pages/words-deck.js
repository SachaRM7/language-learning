// js/pages/words-deck.js — Fiche d'un deck : progression, choix du mode, liste des mots

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml, removeHarakats } from '../utils.js';
import { db } from '../db.js';
import { icon } from '../icons.js';
import { ring } from '../ui.js';
import { $app, ensureDecks, srsStats, deckEmoji, tintStyle, speak } from './words-common.js';

const MODES = [
  { id: 'flash',  icon: 'layers',     name: 'Flashcards', desc: 'Retourne et trie',     tint: 'var(--primary-soft)', ink: 'var(--primary)' },
  { id: 'learn',  icon: 'pen',        name: 'Apprendre',  desc: 'QCM ou réponse écrite', tint: 'var(--info-soft)',    ink: 'var(--info)' },
  { id: 'test',   icon: 'award',      name: 'Examen',     desc: 'Évalue ton niveau',     tint: 'var(--violet-soft)',  ink: 'var(--violet)' },
  { id: 'match',  icon: 'link',       name: 'Associer',   desc: 'Relie les paires',      tint: 'var(--gold-soft)',    ink: 'var(--gold)' },
  { id: 'listen', icon: 'headphones', name: 'Écoute',     desc: 'Reconnais à l’oreille', tint: 'var(--success-soft)', ink: 'var(--success)' },
  { id: 'image',  icon: 'image',      name: 'Images',     desc: 'Devine en images',      tint: 'var(--danger-soft)',  ink: 'var(--danger)' },
];

export async function renderWordsDeck(params) {
  const { themeId, deckId } = params;
  const decks = await ensureDecks();
  const deck = decks.find(d => d.id === deckId);
  if (!deck) { navigate(`/mots/${themeId}`); return; }
  store.set('currentDeck', deck);
  const theme = (store.get('themes') || []).find(t => t.id === themeId);
  await _renderDeckPage({ deck, back: `/mots/${themeId}`, base: `/mots/${themeId}/${deckId}`, color: theme?.color, eyebrow: theme?.name });
}

export async function renderWordsDeckLesson(params) {
  const { lessonId } = params;
  const course = store.get('currentCourse');
  await ensureDecks();

  const lessonDecks = await db.getLessonDecks(course.id);
  const entry = lessonDecks.find(e => e.lessonId === lessonId);

  let deck;
  if (entry) {
    deck = entry.deck;
  } else {
    try {
      const lesson = await fetch(`data/lessons/${lessonId}.json`).then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      });
      deck = _buildLessonDeck(lessonId, lesson);
    } catch {
      navigate('/conversations');
      return;
    }
  }

  // Enregistrer dans le store pour que les pages de mode y aient accès
  const decks = store.get('decks') || [];
  const existingIdx = decks.findIndex(d => d.id === deck.id);
  if (existingIdx >= 0) decks[existingIdx] = deck; else decks.push(deck);
  store.set('decks', decks);
  store.set('currentDeck', deck);

  await _renderDeckPage({ deck, back: `/conversations/lecon/${lessonId}`, base: `/mots/lecons/${lessonId}`, color: null, eyebrow: 'Vocabulaire du dialogue' });
}

function _recommend(st) {
  if (st.acquired + st.learning < st.total * 0.3) return 'flash';
  if (st.pct >= 70) return 'test';
  return 'learn';
}

async function _renderDeckPage({ deck, back, base, color, eyebrow }) {
  const course = store.get('currentCourse');
  const srsEntries = await db.getSRS(course.id);
  const st = srsStats(deck, srsEntries);
  const boxOf = Object.fromEntries(srsEntries.map(e => [e.cardId, e.box]));
  const rec = _recommend(st);
  const prefs = store.get('preferences') || {};
  const showHarakats = prefs.showHarakats !== false;
  const tint = color ? tintStyle(color) : '--tint:var(--primary)';

  $app().innerHTML = `
    ${renderHeader({ title: deck.name, back })}
    <main class="page-content page-content--nav deck-page">
      <section class="deck-hero" style="${tint}">
        <div class="deck-hero__top">
          <span class="deck-hero__emoji">${deckEmoji(deck)}</span>
          ${ring(st.pct, { size: 78, stroke: 8, label: `${st.pct}%` })}
        </div>
        ${eyebrow ? `<div class="deck-hero__eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
        <h2 class="deck-hero__name">${escapeHtml(deck.name)}</h2>
        ${deck.nameAr ? `<div class="deck-hero__ar" lang="ar">${escapeHtml(deck.nameAr)}</div>` : ''}
        <div class="deck-hero__stats">
          <span><b>${st.total}</b> mots</span>
          <span class="tone-ok"><b>${st.acquired}</b> acquis</span>
          <span class="tone-gold"><b>${st.learning}</b> en cours</span>
        </div>
      </section>

      <section class="section">
        <div class="section__head"><h2 class="section__title">Choisis un mode</h2></div>
        <div class="mode-grid stagger">
          ${MODES.map(m => `
            <button class="mode-card pressable" data-mode="${m.id}" style="--tint:${m.tint};--tint-ink:${m.ink}">
              ${m.id === rec ? '<span class="mode-card__rec">Conseillé</span>' : ''}
              <span class="mode-card__icon">${icon(m.icon)}</span>
              <span class="mode-card__name">${escapeHtml(m.name)}</span>
              <span class="mode-card__desc">${escapeHtml(m.desc)}</span>
            </button>`).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section__head">
          <h2 class="section__title">Les mots</h2>
          <span class="section__link">${deck.cards.length}</span>
        </div>
        <ul class="word-list">
          ${deck.cards.map(c => {
            const box = boxOf[c.id] || 0;
            const status = box >= 4 ? 'ok' : box >= 1 ? 'gold' : 'new';
            const ar = showHarakats ? c.front : (c.frontPlain || removeHarakats(c.front));
            return `
            <li class="word-item">
              <span class="word-item__status word-item__status--${status}" title="${status === 'ok' ? 'Acquis' : status === 'gold' ? 'En cours' : 'Nouveau'}"></span>
              <span class="word-item__emoji">${c.emoji || ''}</span>
              <span class="word-item__fr">
                <span>${escapeHtml(c.back)}</span>
                ${c.translit ? `<em>${escapeHtml(c.translit)}</em>` : ''}
              </span>
              <span class="word-item__ar" lang="ar">${escapeHtml(ar)}</span>
              <button class="icon-btn icon-btn--ghost word-item__audio" data-say="${escapeHtml(c.front)}" aria-label="Écouter ${escapeHtml(c.back)}">${icon('volume-2')}</button>
            </li>`;
          }).join('')}
        </ul>
      </section>
    </main>
    ${renderBottomNav('mots')}
  `;

  $app().querySelectorAll('.mode-card').forEach(btn => {
    btn.addEventListener('click', () => navigate(`${base}/${btn.dataset.mode}`));
  });
  $app().querySelectorAll('[data-say]').forEach(btn => {
    btn.addEventListener('click', () => speak(btn, btn.dataset.say, course.config.frontLang));
  });
}

function _buildLessonDeck(lessonId, lesson) {
  return {
    id: `lesson-vocab-${lessonId}`,
    name: `Vocab — ${lesson.seriesName} ${lesson.number}`,
    nameAr: '',
    category: 'Leçons',
    source: 'lesson',
    lessonId,
    tags: lesson.tags || [],
    cards: (lesson.vocabulary || []).map((word, index) => ({
      id: `lesson-vocab-${lessonId}:${index}`,
      front: word.ar,
      frontPlain: word.arPlain,
      back: word.fr,
      en: word.en,
      translit: word.translit,
      emoji: '',
      image: null,
      audio: null,
      tags: word.tags || [],
    })),
  };
}
