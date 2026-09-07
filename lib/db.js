import pg from "pg";
const { Pool } = pg;

let pool;

function resolveConnectionString() {
  const env = process.env;

  for (const key of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_URL_NO_SSL",
  ]) {
    if (env[key]) return env[key];
  }

  if (env.PGHOST && env.PGUSER && env.PGPASSWORD) {
    const db = env.PGDATABASE || "neondb";
    return `postgresql://${env.PGUSER}:${env.PGPASSWORD}@${env.PGHOST}/${db}?sslmode=require`;
  }

  throw new Error("No Postgres connection info found (DATABASE_URL / POSTGRES_URL / PG* env vars)");
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveConnectionString(),
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    pool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function end() {
  if (pool) {
    const p = pool;
    pool = undefined;
    try {
      await p.end();
    } catch (e) {
      console.error("[db] error closing pool", e.message);
    }
  }
}

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      pass_hash     TEXT NOT NULL,
      user_id       TEXT UNIQUE,
      api_key       TEXT UNIQUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ,
      last_seen_at  TIMESTAMPTZ
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_accounts_user_id  ON accounts(user_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id            SERIAL PRIMARY KEY,
      sender_id     TEXT NOT NULL REFERENCES accounts(user_id),
      recipient_id  TEXT NOT NULL REFERENCES accounts(user_id),
      content       TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at       TIMESTAMPTZ
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, recipient_id, created_at DESC)`);

  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_width INTEGER`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_height INTEGER`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_bytes BYTEA`);
}
