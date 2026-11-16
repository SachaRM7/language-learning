// js/pages/parcours-home.js — Le chemin du Parcours guidé

import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { ring, progressBar, toast, haptic } from '../ui.js';
import { showModal, hideModal } from '../components/modal.js';
import { getParcoursState, getDuePhrases } from '../parcours.js';

const $app = () => document.getElementById('app');

// Décalage horizontal des nœuds (zigzag doux)
const OFFSETS = [0, 52, 78, 52, 0, -52, -78, -52];

export async function renderParcoursHome() {
  const [state, due] = await Promise.all([getParcoursState(), getDuePhrases()]);

  $app().innerHTML = `
    ${renderHeader({ title: 'Parler arabe', large: true, eyebrow: 'Parcours guidé', titleAr: 'تَعَلَّم' })}
    <main class="page-content page-content--nav">
      <div class="stagger">
        ${overviewCard(state, due.length)}
        ${state.modules.map(moduleBlock).join('')}
        ${comingSoon()}
      </div>
    </main>
    ${renderBottomNav('parcours')}
  `;

  bindEvents(state);
  // Amener la leçon courante dans le champ de vision
  const cur = $app().querySelector('.path-node--current');
  if (cur && cur.getBoundingClientRect().top > window.innerHeight * 0.7) {
    setTimeout(() => cur.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  }
}

function overviewCard(state, dueCount) {
  return `
    <section class="pc-overview card">
      <div class="pc-overview__main">
        ${ring(state.pct, { size: 76, stroke: 8, label: `${state.pct}%` })}
        <div class="pc-overview__text">
          <div class="pc-overview__title">MSA conversationnel</div>
          <div class="pc-overview__sub">Parler avec des amis, pas à pas</div>
          <div class="pc-overview__chips">
            <span class="badge badge--primary">${icon('check-circle')} ${state.completed}/${state.total} leçons</span>
            <span class="badge badge--gold">${icon('star')} ${state.stars}</span>
          </div>
        </div>
      </div>
      ${dueCount > 0 ? `
        <button class="pc-overview__review" data-navigate="/parcours/revision">
          <span class="pc-overview__review-icon">${icon('refresh-cw')}</span>
          <span><strong>${dueCount} phrase${dueCount > 1 ? 's' : ''}</strong> à réviser</span>
          ${icon('chevron-right', 'pc-overview__chev')}
        </button>` : ''}
    </section>`;
}

function moduleBlock(m) {
  return `
    <section class="pc-module ${m.unlocked ? '' : 'is-locked'}" style="--m-tint:${m.tint.tint};--m-soft:${m.tint.soft};--m-grad:${m.tint.grad}">
      <header class="pc-module__banner">
        <div class="pc-module__emoji">${m.emoji}</div>
        <div class="pc-module__info">
          <div class="pc-module__eyebrow">Module ${m.index + 1}${m.unlocked ? '' : ' · verrouillé'}</div>
          <h2 class="pc-module__title">${escapeHtml(m.title)}</h2>
          <p class="pc-module__desc">${escapeHtml(m.description)}</p>
          ${progressBar(m.pct, 'progress--thin pc-module__progress')}
        </div>
        ${m.unlocked ? `<div class="pc-module__count">${m.doneCount}/${m.lessons.length}</div>` : `<div class="pc-module__lock">${icon('lock')}</div>`}
      </header>
      <ol class="path">
        ${m.lessons.map((l, i) => pathNode(l, i, m)).join('')}
      </ol>
    </section>`;
}

function pathNode(l, i, m) {
  const isCurrent = l.unlocked && !l.done && isFirstOpen(m, l);
  const state = l.done ? 'done' : isCurrent ? 'current' : l.unlocked ? 'open' : 'locked';
  const ic = l.isReview ? 'refresh-cw' : l.done ? 'check' : state === 'locked' ? 'lock' : isCurrent ? 'play' : 'star';
  const offset = OFFSETS[(i + m.index * 3) % OFFSETS.length];
  const { fr } = l.titleParts;
  return `
    <li class="path-item" style="--x:${offset}px">
      ${isCurrent ? `<div class="path-bubble">Commencer</div>` : ''}
      <button class="path-node path-node--${state} ${l.isReview ? 'path-node--review' : ''}"
              data-lesson="${escapeHtml(l.id)}" aria-label="${escapeHtml(fr)}${state === 'locked' ? ' (verrouillée)' : ''}">
        <span class="path-node__face">${icon(ic)}</span>
      </button>
      ${l.done ? `<div class="path-stars" aria-label="${l.stars} étoiles">${[1, 2, 3].map(s => `<span class="${s <= l.stars ? 'on' : ''}">${icon('star')}</span>`).join('')}</div>` : ''}
      <div class="path-label">${escapeHtml(fr)}</div>
    </li>`;
}

function isFirstOpen(m, lesson) {
  // la « courante » est la première leçon ouverte non terminée du premier module non terminé
  const first = m.lessons.find(l => l.unlocked && !l.done);
  return first && first.id === lesson.id;
}

function comingSoon() {
  return `
    <section class="pc-soon card card--sunk">
      <div class="pc-soon__emoji">🚧</div>
      <div>
        <div class="pc-soon__title">Bientôt</div>
        <div class="pc-soon__desc">Les verbes, le passé et le futur, des conversations plus longues…</div>
      </div>
    </section>`;
}

function bindEvents(state) {
  const all = state.modules.flatMap(m => m.lessons.map(l => ({ l, m })));
  $app().querySelectorAll('.path-node').forEach(btn => {
    btn.addEventListener('click', () => {
      const found = all.find(x => x.l.id === btn.dataset.lesson);
      if (!found) return;
      haptic();
      if (!found.l.unlocked) {
        toast(found.m.unlocked ? 'Termine d’abord la leçon précédente' : 'Termine le module précédent pour débloquer', { icon: 'lock' });
        btn.classList.remove('is-shaking'); void btn.offsetWidth; btn.classList.add('is-shaking');
        return;
      }
      openPreview(found.l, found.m);
    });
  });
}

function openPreview(l, m) {
  const { ar, fr } = l.titleParts;
  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal pc-preview" style="--m-tint:${m.tint.tint};--m-soft:${m.tint.soft};--m-grad:${m.tint.grad}">
        <div class="pc-preview__head">
          <div class="pc-preview__badge">${l.isReview ? icon('refresh-cw') : m.emoji}</div>
          <div class="pc-preview__eyebrow">Module ${m.index + 1} · ${l.isReview ? 'Révision' : `Leçon ${l.index + 1}`}</div>
          ${ar ? `<div class="pc-preview__ar" lang="ar">${escapeHtml(ar)}</div>` : ''}
          <div class="pc-preview__title">${escapeHtml(fr)}</div>
        </div>
        <div class="pc-preview__objective">
          ${icon('target')}
          <span>${escapeHtml(l.objective || '')}</span>
        </div>
        <div class="pc-preview__meta">
          <span>${icon('message-circle')} ${l.phraseCount} phrases</span>
          <span>${icon('clock')} ~${Math.max(1, Math.round(l.phraseCount * 0.6))} min</span>
          ${l.done ? `<span class="pc-preview__stars">${[1, 2, 3].map(s => `<i class="${s <= l.stars ? 'on' : ''}">${icon('star')}</i>`).join('')}</span>` : ''}
        </div>
        <div class="btn-stack">
          <button class="btn btn--primary btn--block btn--lg" id="pc-start">${l.done ? 'Refaire la leçon' : 'Commencer'} ${icon('arrow-right')}</button>
          <button class="btn btn--ghost btn--block" id="pc-cancel">Plus tard</button>
        </div>
      </div>
    </div>`);
  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
  document.getElementById('pc-cancel')?.addEventListener('click', hideModal);
  document.getElementById('pc-start')?.addEventListener('click', () => {
    hideModal();
    navigate(`/parcours/lecon/${l.id}`);
  });
}
