// js/components/dialogue-line.js — Bulle de dialogue (arabe, translittération, traduction, audio)

import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';

/** Palette d'interlocuteurs basée sur les tokens (fonctionne en clair et en sombre). */
export const SPEAKER_TINTS = [
  { c: 'var(--primary)', s: 'var(--primary-soft)' },
  { c: 'var(--gold)',    s: 'var(--gold-soft)' },
  { c: 'var(--info)',    s: 'var(--info-soft)' },
  { c: 'var(--violet)',  s: 'var(--violet-soft)' },
];

/** Construit la table speakerId → { name, initial, tint, side } */
export function buildSpeakers(lesson) {
  const ids = Object.keys(lesson.speakers || {});
  (lesson.dialogue || []).forEach(l => { if (!ids.includes(l.speaker)) ids.push(l.speaker); });
  const map = {};
  ids.forEach((id, i) => {
    const sp = lesson.speakers?.[id] || { name: id };
    const name = sp.name || id;
    map[id] = {
      name,
      initial: name.replace(/^L['’]/i, '').trim().charAt(0).toUpperCase(),
      tint: SPEAKER_TINTS[i % SPEAKER_TINTS.length],
      // Le premier interlocuteur (le protagoniste) parle « à droite », comme dans une messagerie
      side: i === 0 ? 'end' : 'start',
    };
  });
  return map;
}

/**
 * @param {object} line   ligne du dialogue ({id, speaker, ar, arPlain, translit, fr})
 * @param {object} sp     entrée de buildSpeakers()
 * @param {boolean} showName afficher le nom (premier message d'une série)
 */
export function renderDialogueLine(line, sp, showName = true) {
  return `
    <div class="bubble-row bubble-row--${sp.side} ${showName ? '' : 'bubble-row--cont'}"
         id="line-${escapeHtml(line.id)}" style="--sp:${sp.tint.c};--sp-soft:${sp.tint.s}">
      <div class="bubble-row__avatar" aria-hidden="true">${showName ? escapeHtml(sp.initial) : ''}</div>
      <div class="bubble dialogue-line">
        ${showName ? `<div class="bubble__name">${escapeHtml(sp.name)}</div>` : ''}
        <div class="bubble__ar text-ar arabic-text" dir="rtl" lang="ar">${escapeHtml(line.ar)}</div>
        <div class="bubble__ar text-ar arabic-text--plain" dir="rtl" lang="ar">${escapeHtml(line.arPlain || line.ar)}</div>
        ${line.translit ? `<div class="bubble__translit translit-text">${escapeHtml(line.translit)}</div>` : ''}
        <div class="bubble__fr translation-text">${escapeHtml(line.fr)}</div>
        <button class="bubble__reveal translation-placeholder" data-line-id="${escapeHtml(line.id)}">
          ${icon('eye')}<span>Voir la traduction</span>
        </button>
      </div>
      <button class="bubble__play" data-ar="${escapeHtml(line.ar)}" aria-label="Écouter la réplique">
        ${icon('volume-2')}
      </button>
    </div>`;
}
