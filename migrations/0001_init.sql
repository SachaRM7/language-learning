-- HelloArabic — synchronisation des données locales (IndexedDB) vers D1.
-- Un enregistrement = une entrée d'un store IndexedDB, identifiée par (user, store, key).
-- Résolution des conflits : la dernière écriture gagne (updated_at, en ms côté client).

CREATE TABLE IF NOT EXISTS records (
  user_id    TEXT    NOT NULL,
  store      TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  data       TEXT    NOT NULL,            -- JSON de l'enregistrement
  updated_at INTEGER NOT NULL,            -- horodatage client (ms)
  synced_at  INTEGER NOT NULL,            -- horodatage serveur (ms), sert de curseur de synchro
  deleted    INTEGER NOT NULL DEFAULT 0,  -- tombstone
  PRIMARY KEY (user_id, store, key)
);

CREATE INDEX IF NOT EXISTS idx_records_cursor ON records (user_id, synced_at);
