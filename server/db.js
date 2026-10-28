// =====================================================================
//  Acceso a datos.
//  - Con DATABASE_URL usa PostgreSQL real (producción, p. ej. Render).
//  - Sin DATABASE_URL usa PGlite: PostgreSQL embebido que guarda los datos
//    en la carpeta DATA_DIR (por defecto ./data). Mismo SQL en ambos casos.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  pass_hash     TEXT NOT NULL,
  crest         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  coins         INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  streak        INTEGER NOT NULL DEFAULT 0,
  best_streak   INTEGER NOT NULL DEFAULT 0,
  shooter_card  TEXT,
  keeper_card   TEXT,
  banned        BOOLEAN NOT NULL DEFAULT FALSE,
  tutorial_seen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_cards (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id    TEXT NOT NULL,
  source     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_cards_user ON user_cards(user_id, card_id);
ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS tradable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS market_listings (
  id          SERIAL PRIMARY KEY,
  seller_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  card_id     TEXT NOT NULL,
  start_price INTEGER NOT NULL,
  buy_now     INTEGER NOT NULL,
  bid         INTEGER,
  bidder_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  bids        INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  buyer_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  final_price INTEGER,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS market_active ON market_listings(status, expires_at);

CREATE TABLE IF NOT EXISTS pack_openings (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id    TEXT NOT NULL,
  price      INTEGER NOT NULL,
  cards      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_picks (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  options     TEXT NOT NULL,
  streak_at   INTEGER NOT NULL,
  claimed_card TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS matches (
  id          TEXT PRIMARY KEY,
  room_code   TEXT NOT NULL,
  home_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  away_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  home_name   TEXT NOT NULL,
  away_name   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'playing',
  winner_id   INTEGER,
  home_goals  INTEGER NOT NULL DEFAULT 0,
  away_goals  INTEGER NOT NULL DEFAULT 0,
  end_reason  TEXT,
  kicks       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id         SERIAL PRIMARY KEY,
  admin_id   INTEGER,
  admin_name TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  details    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,
  ip         TEXT NOT NULL,
  username   TEXT,
  success    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_lookup ON auth_attempts(kind, created_at);
`;

export async function openDb({ databaseUrl, dataDir } = {}) {
  let db;
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const ssl = /localhost|127\.0\.0\.1/.test(databaseUrl) || process.env.PGSSL === 'disable'
      ? false : { rejectUnauthorized: false };
    let pool = new pg.Pool({ connectionString: databaseUrl, ssl, max: 10 });
    try {
      await pool.query('SELECT 1');
    } catch (e) {
      // Algunas URLs internas no admiten SSL: se reintenta sin él.
      if (!ssl || !/ssl/i.test(e.message)) throw e;
      await pool.end().catch(() => {});
      pool = new pg.Pool({ connectionString: databaseUrl, ssl: false, max: 10 });
      await pool.query('SELECT 1');
    }
    db = {
      kind: 'postgres',
      async query(sql, params = []) { return (await pool.query(sql, params)).rows; },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const res = await fn({ query: async (s, p = []) => (await client.query(s, p)).rows });
          await client.query('COMMIT');
          return res;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally { client.release(); }
      },
      async close() { await pool.end(); },
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    let target;
    if (dataDir === 'memory') target = undefined;
    else {
      target = path.resolve(dataDir || './data/pglite');
      fs.mkdirSync(target, { recursive: true });
    }
    const pgl = target ? new PGlite(target) : new PGlite();
    await pgl.waitReady;
    // PGlite usa una sola conexión: serializamos las transacciones con una cola.
    let chain = Promise.resolve();
    const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
    db = {
      kind: 'pglite',
      query: (sql, params = []) => serial(async () => (await pgl.query(sql, params)).rows),
      tx: (fn) => serial(() => pgl.transaction(async (t) => fn({ query: async (s, p = []) => (await t.query(s, p)).rows }))),
      async close() { await chain; await pgl.close(); },
    };
  }
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
  // Partidas que quedaron a medias si el servidor se reinició: se anulan sin premios.
  await db.query(`UPDATE matches SET status='cancelled', end_reason='reinicio del servidor', finished_at=now()
                  WHERE status='playing'`);
  return db;
}
