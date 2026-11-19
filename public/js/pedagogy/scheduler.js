// js/pedagogy/scheduler.js — Ordonnanceur déterministe et explicable.
//
// À partir d'un passage, du profil de maîtrise et du journal récent, il construit une séance :
//   découvrir → (repérer) → s'entraîner sur 2-3 points bloquants → relire avec moins d'aides → réemployer ailleurs.
// Chaque étape porte une phrase qui explique pourquoi elle est là.
// Module pur : aucune dépendance au navigateur.

import { getEffectiveScore } from './mastery.js';

export const MASTERY_THRESHOLD = 0.72;

/**
 * Exercices disponibles dans l'app et ce qu'ils savent entraîner.
 * - flashcards : phrases d'exemple pédagogiques (jamais le texte coranique) + explication ;
 * - listening  : la même phrase à l'écoute, transcription masquée ;
 * - roots      : retrouver la racine d'un mot, puis sa famille ;
 * - conversation : remettre une phrase dans l'ordre (réemploi), jamais pour un passage coranique.
 */
export const MODULES = [
  {
    id: 'flashcards',
    canPractice: (notion, dim) => ['read_recognition', 'memory_recall', 'form_comprehension'].includes(dim),
  },
  { id: 'listening', canPractice: (_n, dim) => dim === 'audio_recognition' },
  {
    id: 'roots',
    canPractice: (notion, dim) => Boolean(notion.root) && notion.category === 'lexeme' && dim !== 'audio_recognition',
  },
  { id: 'conversation', canPractice: (_n, dim) => dim === 'active_production' },
];

export function tokenNotionIds(token) {
  const ids = token.segments.map(s => s.notionId);
  if (token.syntacticRoleId) ids.push(token.syntacticRoleId);
  if (token.patternId) ids.push(token.patternId);
  return [...new Set(ids)];
}

export function extractPassageNotionIds(passage) {
  const ids = new Set();
  for (const t of passage.tokens) tokenNotionIds(t).forEach(id => ids.add(id));
  for (const p of passage.diagnosticPrompts || []) ids.add(p.targetNotionId);
  return [...ids];
}

/** Nombre d'autres passages de la bibliothèque où apparaît chaque notion. */
export function computeLibraryOverlap(library, excludePassageId) {
  const counts = {};
  for (const p of library) {
    if (p.id === excludePassageId) continue;
    for (const id of extractPassageNotionIds(p)) counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

const stepDown = level => (level === 'full_help' ? 'light_help' : 'no_help');

function practiceScaffolding(score) {
  if (score < 0.35) return 'full_help';
  if (score < 0.68) return 'light_help';
  return 'no_help';
}

function isReviewDue(mastery, dim, nowIso) {
  const next = mastery?.dimensions?.[dim]?.nextReviewAt;
  return Boolean(next && next <= nowIso);
}

function detectPrimaryGap(notion, passage, mastery, failedInDiagnostic, hasAudio) {
  const voc = passage.defaultVocalization;
  const canProduce = !passage.isImmutableSource && passage.corpus === 'conversation';

  if (failedInDiagnostic) {
    const dim = notion.category === 'lexeme' ? 'read_recognition' : 'form_comprehension';
    return { notion, dimension: dim, currentScore: getEffectiveScore(mastery, dim, voc), reasonType: 'diagnostic_fail' };
  }

  if (notion.category !== 'lexeme') {
    const form = getEffectiveScore(mastery, 'form_comprehension', voc);
    if (form < MASTERY_THRESHOLD) {
      return { notion, dimension: 'form_comprehension', currentScore: form, reasonType: form >= 0.45 ? 'scaffolding_stepdown' : 'new_notion' };
    }
    if (canProduce && notion.category === 'syntax') {
      const prod = getEffectiveScore(mastery, 'active_production', voc);
      if (prod < 0.65) return { notion, dimension: 'active_production', currentScore: prod, reasonType: 'production_reuse' };
    }
    return null;
  }

  const readVocalized = getEffectiveScore(mastery, 'read_recognition', 'full');
  const readTarget = getEffectiveScore(mastery, 'read_recognition', voc);
  if (voc === 'unvocalized' && readVocalized >= MASTERY_THRESHOLD && readTarget < 0.65) {
    return { notion, dimension: 'read_recognition', currentScore: readTarget, reasonType: 'unvocalized_gap' };
  }
  if (readTarget < MASTERY_THRESHOLD) {
    return {
      notion,
      dimension: readTarget >= 0.5 ? 'memory_recall' : 'read_recognition',
      currentScore: readTarget,
      reasonType: readTarget >= 0.45 ? 'scaffolding_stepdown' : 'new_notion',
    };
  }
  if (hasAudio) {
    const audio = getEffectiveScore(mastery, 'audio_recognition', voc);
    if (audio < 0.6) return { notion, dimension: 'audio_recognition', currentScore: audio, reasonType: 'audio_gap' };
  }
  if (canProduce) {
    const prod = getEffectiveScore(mastery, 'active_production', voc);
    if (prod < 0.6) return { notion, dimension: 'active_production', currentScore: prod, reasonType: 'production_reuse' };
  }
  return null;
}

function selectModule(gap, isImmutableSource, modules) {
  const order = gap.dimension === 'audio_recognition'
    ? ['listening', 'flashcards']
    : gap.dimension === 'active_production' && !isImmutableSource
      ? ['conversation', 'flashcards']
      : gap.notion.category === 'root_pattern'
        ? ['roots', 'flashcards']
        : ['flashcards', 'roots', 'listening'];
  // Un passage coranique ne part jamais vers un exercice de réemploi du texte lui-même
  const allowed = modules.filter(m => !(isImmutableSource && m.id === 'conversation'));
  for (const id of order) {
    const m = allowed.find(x => x.id === id && x.canPractice(gap.notion, gap.dimension));
    if (m) return m.id;
  }
  return allowed.find(m => m.canPractice(gap.notion, gap.dimension))?.id || null;
}

function practiceRationale(gaps, isImmutableSource) {
  const labels = gaps.map(g => g.notion.labelFr).join(', ');
  const q = isImmutableSource ? ' sur des exemples pédagogiques distincts du texte cité.' : '.';
  switch (gaps[0].reasonType) {
    case 'diagnostic_fail': return `Ces points t’ont bloqué à la première lecture (${labels}) : on les isole rapidement${q}`;
    case 'audio_gap': return `Tu reconnais bien ces éléments à l’écrit (${labels}). Aujourd’hui, on les travaille à l’écoute${q}`;
    case 'unvocalized_gap': return `Tu identifies ces mots lorsqu’ils sont vocalisés (${labels}). On s’entraîne à les lire sans les voyelles courtes${q}`;
    case 'scaffolding_stepdown': return `Tu comprends ces notions lorsque l’aide est visible (${labels}). On essaie avec un guidage plus léger${q}`;
    case 'production_reuse': return `Tu comprends cette tournure (${labels}) : réemploie-la en reconstruisant une phrase.`;
    default: return `Préparation ciblée sur les éléments clés du passage (${labels})${q}`;
  }
}

/**
 * @param {{ planId?: string, passage, library, catalog, mastery, recentEvidences, modules?, nowIso?, hasAudio? }} input
 * @returns {{ id, goalPassageId, summaryReasonFr, steps: Array<{ stepType, targetModule, passageId?, targetNotionIds, recommendedScaffolding, rationaleFr }> }}
 */
export function buildSessionPlan(input) {
  const {
    planId = `session:${input.passage.id}`,
    passage, library, catalog, mastery,
    recentEvidences = [],
    modules = MODULES,
    nowIso = new Date().toISOString(),
    hasAudio = true,
  } = input;

  const notionIds = extractPassageNotionIds(passage);
  const overlap = computeLibraryOverlap(library, passage.id);
  const onPassage = recentEvidences.filter(e => e.passageId === passage.id && e.sourceModule === 'diagnostic');
  const failedInDiagnostic = new Set(onPassage.filter(e => !e.isSuccess).map(e => e.notionId));
  const diagnosed = new Set(onPassage.map(e => e.notionId));

  const lexScores = notionIds
    .filter(id => catalog[id]?.category === 'lexeme')
    .map(id => getEffectiveScore(mastery[id], 'read_recognition', passage.defaultVocalization));
  const avgLex = lexScores.length ? lexScores.reduce((a, v) => a + v, 0) / lexScores.length : 0.5;
  const initial = avgLex >= 0.78 ? 'no_help' : avgLex >= 0.45 ? 'light_help' : 'full_help';

  const steps = [{
    stepType: 'discover',
    targetModule: 'reader',
    passageId: passage.id,
    targetNotionIds: [],
    recommendedScaffolding: initial,
    rationaleFr: 'Lis ou écoute le passage une première fois et touche uniquement les mots qui te résistent.',
  }];

  const prompts = (passage.diagnosticPrompts || [])
    .filter(p => !diagnosed.has(p.targetNotionId)
      && getEffectiveScore(mastery[p.targetNotionId], 'form_comprehension', passage.defaultVocalization) < 0.8)
    .slice(0, 2);
  if (prompts.length) {
    steps.push({
      stepType: 'diagnose',
      targetModule: 'reader',
      passageId: passage.id,
      targetNotionIds: prompts.map(p => p.targetNotionId),
      recommendedScaffolding: 'light_help',
      rationaleFr: prompts.length > 1
        ? 'Deux questions rapides pour voir si le blocage vient du vocabulaire ou de la construction.'
        : 'Une question rapide pour voir si le blocage vient du vocabulaire ou de la construction.',
    });
  }

  const ranked = [];
  for (const id of notionIds) {
    const notion = catalog[id];
    if (!notion) continue;
    const gap = detectPrimaryGap(notion, passage, mastery[id], failedInDiagnostic.has(id), hasAudio);
    if (!gap) continue;
    const priority =
      (gap.reasonType === 'diagnostic_fail' ? 100 : 0) +
      (mastery[id]?.dimensions?.[gap.dimension]?.userOverride === 'needs_work' ? 80 : 0) +
      (1 - gap.currentScore) * 40 +
      (overlap[id] || 0) * 8 +
      (isReviewDue(mastery[id], gap.dimension, nowIso) ? 12 : 0);
    ranked.push({ ...gap, priority });
  }
  // Tri stable : à priorité égale, l'ordre d'apparition dans le texte départage
  ranked.sort((a, b) => b.priority - a.priority);
  const focal = ranked.slice(0, 3);

  const byModule = new Map();
  for (const gap of focal) {
    const mod = selectModule(gap, passage.isImmutableSource, modules);
    if (!mod) continue;
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(gap);
  }
  for (const [targetModule, gaps] of [...byModule.entries()].slice(0, 2)) {
    steps.push({
      stepType: 'practice',
      targetModule,
      targetNotionIds: gaps.map(g => g.notion.id),
      targetDimensions: Object.fromEntries(gaps.map(g => [g.notion.id, g.dimension])),
      recommendedScaffolding: practiceScaffolding(Math.min(...gaps.map(g => g.currentScore))),
      rationaleFr: practiceRationale(gaps, passage.isImmutableSource),
    });
  }

  const focalIds = focal.map(g => g.notion.id);
  steps.push({
    stepType: 'reread',
    targetModule: 'reader',
    passageId: passage.id,
    targetNotionIds: focalIds,
    recommendedScaffolding: stepDown(initial),
    rationaleFr: 'Retrouve le passage d’origine avec moins d’aides pour vérifier que les points travaillés s’éclairent.',
  });

  const pool = library.filter(p => (passage.transferPassageIds?.length
    ? passage.transferPassageIds.includes(p.id)
    : p.id !== passage.id));
  let best = null;
  for (const cand of pool) {
    const ids = new Set(extractPassageNotionIds(cand));
    const shared = focalIds.filter(id => ids.has(id)).length;
    if (shared > 0 && (!best || shared > best.shared)) best = { passage: cand, shared };
  }
  if (best) {
    steps.push({
      stepType: 'transfer',
      targetModule: 'reader',
      passageId: best.passage.id,
      targetNotionIds: focalIds.filter(id => extractPassageNotionIds(best.passage).includes(id)),
      recommendedScaffolding: initial === 'full_help' ? 'light_help' : 'no_help',
      rationaleFr: `Vérifie le réemploi sur « ${best.passage.title} », un autre texte qui mobilise les mêmes notions.`,
    });
  }

  const reach = Math.max(1, ...focalIds.map(id => overlap[id] || 0));
  const summaryReasonFr = focal.length === 0
    ? 'Tes acquis couvrent déjà les notions principales : lecture fluide, puis vérification sur un autre texte.'
    : `Séance centrée sur ${focal.map(g => g.notion.labelFr).join(' et ')}, choisies pour débloquer ce texte et ${reach} autre${reach > 1 ? 's' : ''} contenu${reach > 1 ? 's' : ''} de ta bibliothèque.`;

  return { id: planId, goalPassageId: passage.id, summaryReasonFr, steps };
}

/**
 * Accessibilité d'un texte : jamais un faux pourcentage global de « compréhension »,
 * seulement les mots clés reconnus et les constructions encore à découvrir.
 */
export function evaluatePassageReadiness(passage, mastery, catalog) {
  const ids = extractPassageNotionIds(passage);
  const voc = passage.defaultVocalization;
  const lexemes = ids.map(id => catalog[id]).filter(n => n?.category === 'lexeme');
  const knownLexemes = lexemes.filter(n => getEffectiveScore(mastery[n.id], 'read_recognition', voc) >= MASTERY_THRESHOLD).length;
  const unseen = ids.map(id => catalog[id])
    .filter(n => n && n.category !== 'lexeme' && getEffectiveScore(mastery[n.id], 'form_comprehension', voc) < 0.55)
    .map(n => n.labelFr);
  const ratio = lexemes.length ? knownLexemes / lexemes.length : 1;
  const base = { passageId: passage.id, knownLexemes, totalLexemes: lexemes.length, unseenConstructions: unseen };

  if (ratio >= 0.75 && unseen.length === 0) {
    return { ...base, status: 'ready_now', guidanceFr: 'Tu peux essayer ce passage maintenant.' };
  }
  if (ratio >= 0.65 && unseen.length <= 2) {
    return {
      ...base, status: 'syntax_to_discover',
      guidanceFr: `Tu reconnais ${knownLexemes} mots clés sur ${lexemes.length}, mais ${unseen.length > 1 ? 'ces constructions restent' : 'cette construction reste'} à découvrir : ${unseen.join(', ')}.`,
    };
  }
  const top = unseen.slice(0, 2);
  return {
    ...base, status: 'prepare_first',
    guidanceFr: top.length
      ? `Cette lecture sera plus confortable après avoir travaillé : ${top.join(' et ')}.`
      : `Prépare d’abord quelques mots clés (${knownLexemes}/${lexemes.length} reconnus à l’écrit).`,
  };
}
