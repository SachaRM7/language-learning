-- Lecture du dictionnaire de Kazimirski (1860) par Claude, pour corriger et enrichir le lexique.
-- Un « job » = un lot de pages envoyé à l'API Message Batches (voir worker/kazimirski.js).
CREATE TABLE IF NOT EXISTS kz_job (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,              -- 'pilot' | 'full'
  status        TEXT NOT NULL DEFAULT 'queued', -- queued | submitted | ingested | error
  pages         TEXT NOT NULL,              -- JSON [[volume, vue], …]
  batch_id      TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Résultat brut par page (les racines repérées sur la page et leurs sens selon Kazimirski)
CREATE TABLE IF NOT EXISTS kz_page (
  volume     INTEGER NOT NULL,
  view       INTEGER NOT NULL,
  job_id     INTEGER NOT NULL,
  result     TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (volume, view)
);

-- Synthèse par racine (fusion des pages où l'article apparaît)
CREATE TABLE IF NOT EXISTS kz_root (
  root       TEXT PRIMARY KEY,
  sense      TEXT,
  data       TEXT NOT NULL,                 -- JSON { lemmas: { lemme: { fr, ok, note } }, extra: [{ ar, fr }], pages: [[v, n]] }
  updated_at INTEGER NOT NULL
);
