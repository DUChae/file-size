import { Pool, type QueryResultRow } from "pg";

// Every statement is idempotent, so this runs safely on every process start.
// To change a table later, append `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` here.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('bug', 'improvement')),
  title       TEXT NOT NULL,
  details     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id              BIGSERIAL PRIMARY KEY,
  type            TEXT NOT NULL,
  visitor_id      TEXT,
  status          TEXT,
  tool            TEXT,
  mode            TEXT,
  filename        TEXT,
  file_size       BIGINT,
  optimized_size  BIGINT,
  page_count      INT,
  error           TEXT,
  is_legacy       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_type_created_at_idx ON analytics_events (type, created_at);
-- 그룹웨어 사용자. 그룹웨어 연동 전에 쌓인 행은 NULL이다.
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS user_name TEXT;
CREATE INDEX IF NOT EXISTS analytics_events_user_created_at_idx ON analytics_events (user_id, created_at DESC);

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_name TEXT;

CREATE TABLE IF NOT EXISTS analytics_visitors (
  visitor_id  TEXT PRIMARY KEY,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_legacy_daily (
  date                   DATE PRIMARY KEY,
  page_views             BIGINT NOT NULL DEFAULT 0,
  files_sent             BIGINT NOT NULL DEFAULT 0,
  conversions_succeeded  BIGINT NOT NULL DEFAULT 0,
  conversions_failed     BIGINT NOT NULL DEFAULT 0,
  image_success          BIGINT NOT NULL DEFAULT 0,
  pdf_success            BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_legacy_totals (
  id                     BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  page_views             BIGINT NOT NULL DEFAULT 0,
  files_sent             BIGINT NOT NULL DEFAULT 0,
  conversions_succeeded  BIGINT NOT NULL DEFAULT 0,
  conversions_failed     BIGINT NOT NULL DEFAULT 0,
  image_success          BIGINT NOT NULL DEFAULT 0,
  pdf_success            BIGINT NOT NULL DEFAULT 0,
  total_bytes_saved      BIGINT NOT NULL DEFAULT 0
);
`;

// Cache on globalThis so dev-mode HMR reuses one pool instead of leaking a new one per reload.
const globalForDb = globalThis as unknown as {
  fileSizePool?: Pool;
  fileSizeSchemaReady?: Promise<void>;
};

function createPool(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10 });
  // An idle client losing its connection emits here; without a listener it would crash the process.
  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });
  return pool;
}

const connectionString = process.env.DATABASE_URL;

export const db = connectionString
  ? (globalForDb.fileSizePool ??= createPool(connectionString))
  : null;

export function ensureSchema() {
  if (!db) {
    return Promise.reject(new Error("Database is not configured."));
  }

  globalForDb.fileSizeSchemaReady ??= db
    .query(SCHEMA_SQL)
    .then(() => {
      console.log("[db] schema ensured");
    })
    .catch((error: unknown) => {
      // Drop the cached failure so the next query retries instead of failing forever.
      globalForDb.fileSizeSchemaReady = undefined;
      throw error;
    });

  return globalForDb.fileSizeSchemaReady;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  await ensureSchema();
  return db.query<T>(text, params);
}
