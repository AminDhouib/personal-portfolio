-- Portfolio database schema.
-- Runs once on first container start (mounted into /docker-entrypoint-initdb.d/).
-- Matches the zod schemas in src/lib/persistence-schemas.ts.

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id            SERIAL PRIMARY KEY,
  game          TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  score         INTEGER     NOT NULL,
  level         INTEGER     NOT NULL,
  seconds       INTEGER,
  kills         INTEGER,
  distance      INTEGER,
  region        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_game_score
  ON leaderboard_entries (game, score DESC);

CREATE TABLE IF NOT EXISTS pg_leaderboard_entries (
  id              SERIAL PRIMARY KEY,
  name            TEXT        NOT NULL,
  seed            INTEGER     NOT NULL,
  elapsed_seconds INTEGER     NOT NULL,
  rule_count      INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pg_leaderboard_elapsed
  ON pg_leaderboard_entries (elapsed_seconds ASC);

CREATE TABLE IF NOT EXISTS leads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  note        TEXT        NOT NULL DEFAULT '',
  source      TEXT        NOT NULL DEFAULT 'chatbot',
  page        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
