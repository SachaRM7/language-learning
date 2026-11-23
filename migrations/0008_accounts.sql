-- Comptes HelloArabic : inscription sur invitation, e-mail + mot de passe, sessions par cookie.
-- user id = e-mail en minuscules : c'est déjà l'identifiant des données synchronisées (records.user_id),
-- donc un compte créé avec la même adresse retrouve toute sa progression.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,          -- e-mail en minuscules
  email         TEXT    NOT NULL,             -- e-mail tel que saisi
  pass_hash     TEXT    NOT NULL,             -- PBKDF2-SHA256, base64
  pass_salt     TEXT    NOT NULL,             -- base64
  pass_iter     INTEGER NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  invited_by    TEXT,
  must_change   INTEGER NOT NULL DEFAULT 0,   -- mot de passe provisoire donné par l'admin
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Le jeton n'est jamais stocké en clair : seulement son empreinte SHA-256.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  agent      TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT    PRIMARY KEY,
  created_by TEXT    NOT NULL,
  note       TEXT,
  max_uses   INTEGER NOT NULL DEFAULT 1,
  uses       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked    INTEGER NOT NULL DEFAULT 0
);

-- Limitation des tentatives (connexion, inscription) par e-mail et par adresse IP.
CREATE TABLE IF NOT EXISTS auth_attempts (
  key      TEXT    PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
