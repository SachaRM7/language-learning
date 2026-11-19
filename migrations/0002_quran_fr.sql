-- Gloses françaises du Coran (mot à mot + sens de base des lemmes), générées une fois par sourate
-- par le Worker (Claude) puis mises en cache. Données partagées, non personnelles.
CREATE TABLE IF NOT EXISTS quran_fr (
  surah      INTEGER PRIMARY KEY,
  data       TEXT    NOT NULL,   -- JSON { words: { "<verset>:<mot>": "glose" }, lemmas: { "<lemme>": "sens" } }
  model      TEXT,
  created_at INTEGER NOT NULL
);
