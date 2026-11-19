-- Images des pages déposées via l'API Files (quand le téléchargement direct depuis archive.org échoue).
CREATE TABLE IF NOT EXISTS kz_file (
  volume     INTEGER NOT NULL,
  view       INTEGER NOT NULL,
  region     INTEGER NOT NULL,   -- 0..3 : gauche-haut, gauche-bas, droite-haut, droite-bas
  file_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (volume, view, region)
);
