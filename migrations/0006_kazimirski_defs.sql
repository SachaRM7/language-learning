-- Deuxième lecture du Kazimirski : définition, nuance et citation de chaque mot (voir worker/kazimirski.js).
CREATE TABLE IF NOT EXISTS kz_def_page (
  volume     INTEGER NOT NULL,
  view       INTEGER NOT NULL,
  job_id     INTEGER NOT NULL,
  result     TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (volume, view)
);
