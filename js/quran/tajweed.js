// js/quran/tajweed.js — Balisage tajwid → texte coloré (lecteur Coran + leçons Tajwid)

import { escapeHtml } from '../utils.js';

// Classe Quran.com → famille de couleur
const RULE_GROUP = {
  ham_wasl: 'silent',
  slnt: 'silent',
  laam_shamsiyah: 'silent',
  madda_normal: 'madd2',
  madda_permissible: 'madd246',
  madda_obligatory_mottasel: 'madd45',
  madda_obligatory_monfasel: 'madd45',
  madda_necessary: 'madd6',
  ghunnah: 'ghunna',
  ikhafa: 'ikhfa',
  ikhafa_shafawi: 'ikhfa',
  idgham_ghunnah: 'idgham',
  idgham_shafawi: 'idgham',
  idgham_mutajanisayn: 'idgham',
  idgham_mutaqaribayn: 'idgham',
  idgham_wo_ghunnah: 'idghamx',
  iqlab: 'iqlab',
  qalaqah: 'qalqala',
  mark: 'mark',
};

export const TAJWEED_LEGEND = [
  { group: 'ghunna',  label: 'Ghunna (nasalisation 2 temps)' },
  { group: 'ikhfa',   label: 'Ikhfā’ (dissimulation)' },
  { group: 'idgham',  label: 'Idghām avec ghunna' },
  { group: 'idghamx', label: 'Idghām sans ghunna' },
  { group: 'iqlab',   label: 'Iqlāb (nūn → mīm)' },
  { group: 'qalqala', label: 'Qalqala (rebond)' },
  { group: 'madd2',   label: 'Madd naturel (2)' },
  { group: 'madd246', label: 'Madd 2, 4 ou 6' },
  { group: 'madd45',  label: 'Madd 4 ou 5' },
  { group: 'madd6',   label: 'Madd lāzim (6)' },
  { group: 'silent',  label: 'Lettre non prononcée' },
];

const TAG = /<(\/)?(?:rule|tajweed|span)(?:\s+class=(?:"([a-z0-9_-]+)"|'([a-z0-9_-]+)'|([a-z0-9_-]+)))?\s*>/gi;

/** Balisage Quran.com → [[texte, règle|null], …] (gère l'imbrication). */
export function parseTajweed(markup) {
  const runs = [];
  const stack = [];
  let cursor = 0;
  const current = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i] && !stack[i].startsWith('custom') && stack[i] !== 'end') return stack[i];
    }
    return null;
  };
  const push = (text) => {
    if (!text) return;
    const rule = current();
    const last = runs[runs.length - 1];
    if (last && last[1] === rule) last[0] += text;
    else runs.push([text, rule]);
  };
  for (const m of markup.matchAll(TAG)) {
    push(markup.slice(cursor, m.index));
    if (m[1]) stack.pop();
    else stack.push(m[2] || m[3] || m[4] || '');
    cursor = m.index + m[0].length;
  }
  push(markup.slice(cursor).replace(/<[^>]*>/g, ''));
  return runs;
}

/**
 * Runs → HTML. `focus` : null = toutes les couleurs, [] = seulement 'mark',
 * ['ikhafa', …] = ces règles + 'mark'. `plain` = aucune couleur.
 */
export function runsToHtml(runs, { focus = null, plain = false } = {}) {
  return runs.map(([text, rule]) => {
    const safe = escapeHtml(text);
    if (!rule || plain) return safe;
    if (focus && rule !== 'mark' && !focus.includes(rule)) return safe;
    const group = RULE_GROUP[rule];
    return group ? `<span class="tj tj--${group}">${safe}</span>` : safe;
  }).join('');
}

export function legendHtml() {
  return `
    <div class="tj-legend">
      ${TAJWEED_LEGEND.map(l => `<span class="tj-legend__item"><i class="tj-dot tj-dot--${l.group}"></i>${escapeHtml(l.label)}</span>`).join('')}
    </div>
  `;
}
