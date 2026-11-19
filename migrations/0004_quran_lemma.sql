-- Sens de base en français de TOUS les lemmes du Coran (4 763), traduits par lots par une tâche
-- planifiée du Worker (voir worker/lexicon.js). Données partagées, non personnelles.
CREATE TABLE IF NOT EXISTS quran_lemma (
  lemma      TEXT PRIMARY KEY,
  root       TEXT,
  pos        TEXT,
  count      INTEGER NOT NULL DEFAULT 0,
  en         TEXT,
  fr         TEXT,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_quran_lemma_todo ON quran_lemma (count DESC) WHERE fr IS NULL;
