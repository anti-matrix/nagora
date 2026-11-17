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

/**
 * Idempotent schema setup. Run via `node scripts/migrate.mjs` — it is NOT
 * called on the request path.
 */
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
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration_ms INTEGER`);
  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_thumb BYTEA`);

  await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_id)`);

  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS showname TEXT`);
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS avatar_bytes BYTEA`);
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS avatar_type TEXT`);
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ`);
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS auth_key TEXT`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_auth_key ON accounts(auth_key)`);

  await query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id          SERIAL PRIMARY KEY,
      user_a      TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      user_b      TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (user_a < user_b)
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair
    ON friendships (LEAST(user_a, user_b), GREATEST(user_a, user_b))
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id           SERIAL PRIMARY KEY,
      sender_id    TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (status IN ('pending', 'accepted', 'declined'))
    )
  `);
  // Staging for chunked video uploads (Vercel caps request bodies at 4.5 MB).
  await query(`
    CREATE TABLE IF NOT EXISTS media_uploads (
      id          SERIAL PRIMARY KEY,
      owner_id    TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      bytes       BYTEA NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // One emoji reaction per user per message (WhatsApp-style); re-reacting replaces it.
  await query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      emoji       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (message_id, user_id)
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_pending_pair
    ON friend_requests (sender_id, recipient_id)
    WHERE status = 'pending'
  `);

  // ── Public rooms ────────────────────────────────────────────────────────
  // bans: room names or "ALL" (see lib/rooms.js). role: 'user' | 'mod' | 'owner',
  // changed only by scripts/set-role.mjs — no endpoint grants a role.
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bans TEXT[] NOT NULL DEFAULT '{}'`);
  await query(`
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'mod', 'owner'))
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS room_messages (
      id          SERIAL PRIMARY KEY,
      room        TEXT NOT NULL,
      sender_id   TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      reply_to_id INTEGER REFERENCES room_messages(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at  TIMESTAMPTZ,
      deleted_by  TEXT
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON room_messages (room, id DESC)`);

  // Same design as message_reactions: one emoji per user per message.
  await query(`
    CREATE TABLE IF NOT EXISTS room_message_reactions (
      message_id  INTEGER NOT NULL REFERENCES room_messages(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      emoji       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (message_id, user_id)
    )
  `);

  // Usernames nobody may register. Lowercase. Rows are managed by hand in the Neon SQL editor.
  await query(`CREATE TABLE IF NOT EXISTS reserved_usernames (username TEXT PRIMARY KEY)`);

  // ── Account email ───────────────────────────────────────────────────────
  // accounts.email only ever holds a VERIFIED address (lowercase); a pending
  // one lives in Redis until its code is confirmed (lib/codes.js).
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email TEXT`);
  await query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_lower
    ON accounts (lower(email))
    WHERE email IS NOT NULL
  `);
}

/**
 * Presence status SQL: 'online' = activity (last_seen_at) in the last 90s,
 * 'away' = idle but the app is still open (last_ping_at keepalive in the last
 * minute), else 'offline'. `alias` is the accounts table alias, if any.
 */
export function presenceStatusSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return `CASE
    WHEN ${p}last_seen_at > now() - interval '90 seconds' THEN 'online'
    WHEN ${p}last_ping_at > now() - interval '1 minute' THEN 'away'
    ELSE 'offline'
  END`;
}

export async function areFriends(a, b) {
  if (!a || !b || a === b) return false;
  const { rows } = await query(
    `SELECT 1 FROM friendships
     WHERE LEAST(user_a, user_b) = LEAST($1, $2)
       AND GREATEST(user_a, user_b) = GREATEST($1, $2)
     LIMIT 1`,
    [a, b]
  );
  return rows.length > 0;
}
