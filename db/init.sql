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

CREATE TABLE IF NOT EXISTS pg2_leaderboard_entries (
  id              SERIAL PRIMARY KEY,
  name            TEXT        NOT NULL,
  seed            BIGINT      NOT NULL,
  time_ms         INTEGER     NOT NULL,
  daily           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pg2_leaderboard_seed_time
  ON pg2_leaderboard_entries (seed, time_ms ASC);

CREATE TABLE IF NOT EXISTS leads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  note        TEXT        NOT NULL DEFAULT '',
  source      TEXT        NOT NULL DEFAULT 'chatbot',
  page        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arcade leaderboard v2 (src/lib/arcade). The app ALSO creates these at first use
-- (src/lib/arcade/schema.ts), because this file only runs on a fresh volume and prod's
-- volume already exists. schema.test.ts fails if the two copies drift.
CREATE TABLE IF NOT EXISTS arcade_players (
  id           UUID        PRIMARY KEY,
  token_hash   TEXT        NOT NULL,
  handle       TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcade_scores (
  game        TEXT        NOT NULL,
  board       TEXT        NOT NULL,
  player_id   UUID        NOT NULL REFERENCES arcade_players (id) ON DELETE CASCADE,
  score       BIGINT      NOT NULL,
  detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  achieved_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (game, board, player_id)
);

CREATE INDEX IF NOT EXISTS idx_arcade_scores_rank
  ON arcade_scores (game, board, score DESC, achieved_at ASC);

CREATE TABLE IF NOT EXISTS arcade_migrations (
  key        TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
