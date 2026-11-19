// js/pedagogy/mastery.js — Du journal de preuves au profil de maîtrise, notion par notion.
//
// Chaque réponse est une « preuve » (evidence) : notion, compétence, état de vocalisation,
// niveau d'aide utilisé, réussite. Le score d'une compétence est une moyenne mobile plafonnée
// par l'aide : réussir avec toutes les aides ne prouve jamais l'autonomie.
// Module pur (aucune dépendance au navigateur) : testé avec node --test.

/** @typedef {'read_recognition'|'audio_recognition'|'form_comprehension'|'memory_recall'|'active_production'} SkillDimension */
/** @typedef {'full_help'|'light_help'|'no_help'} ScaffoldingLevel */
/** @typedef {'full'|'partial'|'unvocalized'} VocalizationState */

/** Plafond de maîtrise atteignable selon l'aide utilisée. */
export const SCAFFOLDING_CAP = { full_help: 0.55, light_help: 0.8, no_help: 1.0 };

export const SCAFFOLDING_RANK = { no_help: 0, light_help: 1, full_help: 2 };

export const maxScaffolding = (a, b) => (SCAFFOLDING_RANK[a] >= SCAFFOLDING_RANK[b] ? a : b);

/** Compétences suivies par type de notion (limite la dispersion des données). */
const TRACKED_DIMENSIONS = {
  lexeme: ['read_recognition', 'audio_recognition', 'form_comprehension', 'memory_recall', 'active_production'],
  root_pattern: ['read_recognition', 'form_comprehension', 'memory_recall'],
  bound_morpheme: ['read_recognition', 'audio_recognition', 'form_comprehension'],
  syntax: ['form_comprehension', 'active_production'],
};

export const DIMENSION_LABELS = {
  read_recognition: 'Lecture',
  audio_recognition: 'Écoute',
  form_comprehension: 'Fonctionnement',
  memory_recall: 'Rappel',
  active_production: 'Réemploi',
};

export function getTrackedDimensions(category) {
  return TRACKED_DIMENSIONS[category] || TRACKED_DIMENSIONS.lexeme;
}

/** Compétence « naturelle » d'une notion : lire un mot, comprendre le rôle d'un affixe ou d'une construction. */
export function defaultDimensionForNotion(notion) {
  if (!notion || notion.category === 'lexeme') return 'read_recognition';
  return 'form_comprehension';
}

function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function normalizeDimension(category, dimension) {
  if (!category) return dimension;
  return getTrackedDimensions(category).includes(dimension) ? dimension : 'form_comprehension';
}

function updateScore(prevScore, prevCount, ev) {
  const alpha = ev.sourceModule === 'transfer' || ev.sourceModule === 'diagnostic' ? 0.45 : 0.35;
  const cap = SCAFFOLDING_CAP[ev.scaffolding] ?? SCAFFOLDING_CAP.full_help;
  if (ev.isSuccess) {
    const next = prevCount === 0 ? cap * 0.75 : prevScore * (1 - alpha) + cap * alpha;
    // Une réussite aidée ne fait jamais baisser un score déjà plus haut que son plafond
    return prevScore > cap ? prevScore : Math.min(cap, next);
  }
  const floor = ev.scaffolding === 'full_help' ? 0.05 : 0.15;
  return prevCount === 0 ? floor : prevScore * (1 - alpha) + floor * alpha;
}

function nextReviewDays(score, ev) {
  if (!ev.isSuccess) return 0;
  if (ev.scaffolding !== 'no_help') return 1;
  if (score >= 0.85) return 14;
  if (score >= 0.7) return 5;
  return 2;
}

/**
 * @param {Array} evidences   journal de preuves
 * @param {Object} catalog    notions par id
 * @param {Object} overrides  { notionId: { dimension: 'known'|'needs_work' } }
 * @returns {Object} profil { notionId: { notionId, dimensions: { dim: { score, evidenceCount, lastPracticedAt, nextReviewAt, userOverride } }, unvocalizedReadScore } }
 */
export function computeMasteryProfile(evidences, catalog, overrides = {}) {
  const profile = {};
  const unvocCounts = {};
  const sorted = [...evidences].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  for (const ev of sorted) {
    const notion = catalog[ev.notionId];
    const dim = normalizeDimension(notion?.category, ev.dimension);
    const m = profile[ev.notionId] || (profile[ev.notionId] = { notionId: ev.notionId, dimensions: {} });
    const prev = m.dimensions[dim] || { score: 0, evidenceCount: 0 };
    const score = Number(updateScore(prev.score, prev.evidenceCount, ev).toFixed(4));
    m.dimensions[dim] = {
      score,
      evidenceCount: prev.evidenceCount + 1,
      lastPracticedAt: ev.timestamp,
      nextReviewAt: addDaysIso(ev.timestamp, nextReviewDays(score, ev)),
    };
    // La lecture sans voyelles est suivie à part : lire un texte vocalisé ne prouve pas qu'on lit un texte nu
    if (dim === 'read_recognition' && ev.vocalization === 'unvocalized') {
      const n = unvocCounts[ev.notionId] || 0;
      m.unvocalizedReadScore = Number(updateScore(m.unvocalizedReadScore ?? 0, n, ev).toFixed(4));
      unvocCounts[ev.notionId] = n + 1;
    }
  }

  for (const [notionId, dims] of Object.entries(overrides || {})) {
    const m = profile[notionId] || (profile[notionId] = { notionId, dimensions: {} });
    for (const [dim, val] of Object.entries(dims || {})) {
      if (!val) continue;
      const cur = m.dimensions[dim] || { score: 0, evidenceCount: 0 };
      m.dimensions[dim] = {
        ...cur,
        userOverride: val,
        score: val === 'known' ? Math.max(cur.score, 0.92) : Math.min(cur.score, 0.25),
      };
    }
  }
  return profile;
}

/** Score utilisé par l'ordonnanceur, en tenant compte des corrections de l'utilisateur et de la vocalisation. */
export function getEffectiveScore(mastery, dimension, vocalization) {
  const d = mastery?.dimensions?.[dimension];
  if (d?.userOverride === 'known') return 0.95;
  if (d?.userOverride === 'needs_work') return 0.2;
  if (dimension === 'read_recognition' && vocalization === 'unvocalized') {
    if (mastery?.unvocalizedReadScore !== undefined) return mastery.unvocalizedReadScore;
    return (d?.score ?? 0) * 0.55;
  }
  return d?.score ?? 0;
}
