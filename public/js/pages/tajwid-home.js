// js/pages/tajwid-home.js — Le chemin du Tajwid : 6 niveaux, du plus simple au plus complet

import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { ring, progressBar, toast, haptic } from '../ui.js';
import { showModal, hideModal } from '../components/modal.js';
import { getTajwidState, setUnlockAll } from '../tajwid.js';
import { savePlayerPrefs } from '../quran/player-prefs.js';

const $app = () => document.getElementById('app');
const OFFSETS = [0, 52, 78, 52, 0, -52, -78, -52];

export async function renderTajwidHome() {
  const state = await getTajwidState();

  $app().innerHTML = `
    ${renderHeader({ title: 'Tajwid', large: true, eyebrow: 'Règles de récitation', titleAr: 'التَّجْوِيد' })}
    <main class="page-content page-content--nav tajwid-home">
      <div class="stagger">
        ${overview(state)}
        ${state.levels.map(levelBlock).join('')}
        ${!state.unlockAll && state.completed < state.total ? `
          <button class="tj-unlock" id="tj-unlock">${icon('lock')} Je connais déjà les bases : tout débloquer</button>` : ''}
        <footer class="qh-sources">
          <div class="qh-sources__title">${icon('info')} Sources</div>
          <p>Exemples : texte uthmani et minutage mot à mot de Quran.com (Quran Foundation).</p>
          <p>Récitation des exemples : ${escapeHtml(state.reciter)}.</p>
        </footer>
      </div>
    </main>
    ${renderBottomNav('coran')}`;

  bindEvents(state);
  const cur = $app().querySelector('.path-node--current');
  if (cur && cur.getBoundingClientRect().top > window.innerHeight * 0.7) {
    setTimeout(() => cur.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  }
}

function overview(state) {
  const next = state.current;
  return `
    <section class="pc-overview card tj-overview">
      <div class="pc-overview__main">
        ${ring(state.pct, { size: 76, stroke: 8, label: `${state.pct}%` })}
        <div class="pc-overview__text">
          <div class="pc-overview__title">Réciter avec justesse</div>
          <div class="pc-overview__sub">Des voyelles aux cas particuliers de Ḥafṣ</div>
          <div class="pc-overview__chips">
            <span class="badge badge--primary">${icon('check-circle')} ${state.completed}/${state.total} leçons</span>
            <span class="badge badge--gold">${icon('star')} ${state.stars}</span>
          </div>
        </div>
      </div>
      ${next ? `
        <button class="pc-overview__review" data-navigate="/tajwid/lecon/${escapeHtml(next.id)}">
          <span class="pc-overview__review-icon">${icon('play')}</span>
          <span><strong>${escapeHtml(next.title)}</strong> · ${escapeHtml(next.subtitle)}</span>
          ${icon('chevron-right', 'pc-overview__chev')}
        </button>` : ''}
      <button class="pc-overview__review tj-overview__reader" id="tj-practice">
        <span class="pc-overview__review-icon">${icon('headphones')}</span>
        <span><strong>S'exercer dans le lecteur</strong> · Al-Husary Mu‘allim, 0,75×, couleurs de tajwid</span>
        ${icon('chevron-right', 'pc-overview__chev')}
      </button>
    </section>`;
}

function levelBlock(lvl) {
  return `
    <section class="pc-module ${lvl.unlocked ? '' : 'is-locked'}" style="--m-tint:${lvl.tint.tint};--m-soft:${lvl.tint.soft};--m-grad:${lvl.tint.grad}">
      <header class="pc-module__banner">
        <div class="pc-module__emoji">${lvl.emoji}</div>
        <div class="pc-module__info">
          <div class="pc-module__eyebrow">${escapeHtml(lvl.name)}${lvl.unlocked ? '' : ' · verrouillé'}</div>
          <h2 class="pc-module__title">${escapeHtml(lvl.title)}</h2>
          <p class="pc-module__desc">${escapeHtml(lvl.desc)}</p>
          ${progressBar(lvl.pct, 'progress--thin pc-module__progress')}
        </div>
        ${lvl.unlocked ? `<div class="pc-module__count">${lvl.doneCount}/${lvl.lessons.length}</div>` : `<div class="pc-module__lock">${icon('lock')}</div>`}
      </header>
      <ol class="path">${lvl.lessons.map((l, i) => pathNode(l, i, lvl)).join('')}</ol>
    </section>`;
}

function pathNode(l, i, lvl) {
  const first = lvl.lessons.find(x => x.unlocked && !x.done);
  const isCurrent = first && first.id === l.id;
  const state = l.done ? 'done' : isCurrent ? 'current' : l.unlocked ? 'open' : 'locked';
  const ic = l.done ? 'check' : state === 'locked' ? 'lock' : isCurrent ? 'play' : 'star';
  const offset = OFFSETS[(i + lvl.index * 3) % OFFSETS.length];
  return `
    <li class="path-item" style="--x:${offset}px">
      ${isCurrent ? '<div class="path-bubble">Commencer</div>' : ''}
      <button class="path-node path-node--${state}" data-lesson="${escapeHtml(l.id)}" aria-label="${escapeHtml(l.title)}${state === 'locked' ? ' (verrouillée)' : ''}">
        <span class="path-node__face">${icon(ic)}</span>
      </button>
      ${l.done ? `<div class="path-stars" aria-label="${l.stars} étoiles">${[1, 2, 3].map(s => `<span class="${s <= l.stars ? 'on' : ''}">${icon('star')}</span>`).join('')}</div>` : ''}
      <div class="path-label">${escapeHtml(l.title)}</div>
    </li>`;
}

function bindEvents(state) {
  const all = state.levels.flatMap(lvl => lvl.lessons.map(l => ({ l, lvl })));
  $app().querySelectorAll('.path-node').forEach(btn => btn.addEventListener('click', () => {
    const found = all.find(x => x.l.id === btn.dataset.lesson);
    if (!found) return;
    haptic();
    if (!found.l.unlocked) {
      toast(found.lvl.unlocked ? 'Valide d’abord la leçon précédente' : 'Termine le niveau précédent pour débloquer', { icon: 'lock' });
      btn.classList.remove('is-shaking'); void btn.offsetWidth; btn.classList.add('is-shaking');
      return;
    }
    openPreview(found.l, found.lvl);
  }));
  document.getElementById('tj-practice')?.addEventListener('click', () => {
    savePlayerPrefs({ reciter: 12, rate: 0.75, tajweed: true });
    navigate('/coran/1');
  });
  document.getElementById('tj-unlock')?.addEventListener('click', async () => {
    await setUnlockAll(true);
    toast('Toutes les leçons sont ouvertes', { icon: 'check-circle' });
    renderTajwidHome();
  });
}

function openPreview(l, lvl) {
  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal pc-preview" style="--m-tint:${lvl.tint.tint};--m-soft:${lvl.tint.soft};--m-grad:${lvl.tint.grad}">
        <div class="pc-preview__head">
          <div class="pc-preview__badge">${lvl.emoji}</div>
          <div class="pc-preview__eyebrow">${escapeHtml(lvl.name)} · Leçon ${l.index + 1}</div>
          <div class="pc-preview__ar tj-preview__ar" lang="ar">${escapeHtml(l.ar)}</div>
          <div class="pc-preview__title">${escapeHtml(l.title)}</div>
        </div>
        <div class="pc-preview__objective">${icon('target')}<span>${escapeHtml(l.subtitle)}</span></div>
        <div class="pc-preview__meta">
          ${l.exampleCount ? `<span>${icon('headphones')} ${l.exampleCount} exemple${l.exampleCount > 1 ? 's' : ''} récité${l.exampleCount > 1 ? 's' : ''}</span>` : ''}
          <span>${icon('help-circle')} ${l.quiz.length} questions</span>
          ${l.done ? `<span class="pc-preview__stars">${[1, 2, 3].map(s => `<i class="${s <= l.stars ? 'on' : ''}">${icon('star')}</i>`).join('')}</span>` : ''}
        </div>
        <div class="btn-stack">
          <button class="btn btn--primary btn--block btn--lg" id="tj-start">${l.done ? 'Revoir la leçon' : 'Commencer'} ${icon('arrow-right')}</button>
          <button class="btn btn--ghost btn--block" id="tj-cancel">Plus tard</button>
        </div>
      </div>
    </div>`);
  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
  document.getElementById('tj-cancel').addEventListener('click', hideModal);
  document.getElementById('tj-start').addEventListener('click', () => { hideModal(); navigate(`/tajwid/lecon/${l.id}`); });
}
