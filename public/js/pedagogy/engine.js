// js/pedagogy/engine.js — Branchement du moteur de compréhension sur l'app (données, journal, liens).
//
// Le journal de preuves vit dans IndexedDB (store « evidence ») et se synchronise avec le reste.
// Lien avec le vocabulaire : un mot déjà su dans « Mots » ou le Coran (carte en boîte ≥ 3) compte
// comme une preuve de lecture — inutile de le retravailler ici.

import { db } from '../db.js';
import { store } from '../store.js';
import { ensureAllDecks } from '../decks.js';
import { knownLemmas } from '../quran.js';
import { computeMasteryProfile } from './mastery.js';

let _library = null;

export async function loadLibrary() {
  if (!_library) {
    const res = await fetch('data/pedagogy/library.json');
    if (!res.ok) throw new Error(`bibliothèque ${res.status}`);
    _library = await res.json();
  }
  return _library;
}

export function newEvidenceId() {
  if (globalThis.crypto?.randomUUID) return `ev_${crypto.randomUUID()}`;
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Fabrique une preuve horodatée. */
export function evidence(fields) {
  return { id: newEvidenceId(), timestamp: new Date().toISOString(), ...fields };
}

/** Notions lexicales déjà sues ailleurs dans l'app → preuves de lecture implicites. */
async function vocabularyEvidence(catalog) {
  try {
    await ensureAllDecks();
    const known = await knownLemmas(store.get('currentCourse')?.id || 'arabic');
    return Object.values(catalog)
      .filter(n => n.category === 'lexeme' && n.quranLemma && known.has(n.quranLemma))
      .map(n => ({
        id: `srs:${n.id}`, timestamp: '1970-01-01T00:00:00.000Z', notionId: n.id,
        dimension: 'read_recognition', vocalization: 'full', scaffolding: 'no_help',
        sourceModule: 'flashcard', isSuccess: true, fromVocabulary: true,
      }));
  } catch {
    return [];
  }
}

/** Profil courant : journal, corrections, maîtrise calculée. */
export async function loadProfile() {
  const lib = await loadLibrary();
  const [stored, overrides, vocab] = await Promise.all([
    db.getEvidence(), db.getNotionOverrides(), vocabularyEvidence(lib.catalog),
  ]);
  const evidences = [...vocab, ...stored];
  return {
    library: lib,
    evidences,
    stored,
    overrides,
    vocabularyKnown: new Set(vocab.map(v => v.notionId)),
    mastery: computeMasteryProfile(evidences, lib.catalog, overrides),
  };
}

export async function recordEvidence(list) {
  if (list.length) await db.addEvidence(list);
}

export async function setOverride(notionId, dimension, status) {
  const overrides = await db.getNotionOverrides();
  const cur = { ...(overrides[notionId] || {}) };
  if (status) cur[dimension] = status; else delete cur[dimension];
  if (Object.keys(cur).length) overrides[notionId] = cur; else delete overrides[notionId];
  await db.saveNotionOverrides(overrides);
  return overrides;
}

/** Niveau lisible d'une compétence, sans faux pourcentage. */
export function levelOf(score, count = 1) {
  if (!count && score === 0) return { id: 'new', label: 'À découvrir' };
  if (score >= 0.85) return { id: 'solid', label: 'Solide' };
  if (score >= 0.72) return { id: 'ok', label: 'Acquis' };
  if (score >= 0.4) return { id: 'mid', label: 'En cours' };
  return { id: 'low', label: 'Fragile' };
}

/** Racine sans tirets (format du lexique coranique) → affichage « ك-ت-ب ». */
export const rootDisplay = r => (r ? [...r].join('-') : '');
