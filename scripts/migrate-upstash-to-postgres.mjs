// One-off migration of feedback and analytics from Upstash Redis to Postgres.
//
//   node scripts/migrate-upstash-to-postgres.mjs [--dry-run] [--reset]
//
// Env: KV_REST_API_URL, KV_REST_API_TOKEN, DATABASE_URL (not needed for --dry-run).
// Run it after the app has started once against DATABASE_URL: the app creates the schema.
//
// --dry-run  Read Redis only; print counts and samples per key.
// --reset    Empty every target table first. Use for the final run before cutover,
//            and only while the new server has no real data of its own yet.
//
// Without --reset the run is safe to repeat: rows are upserted or skipped, and legacy
// log rows are replaced rather than appended.
import { Redis } from "@upstash/redis";
import pg from "pg";

const FEEDBACK_KEY = "feedback:submissions";
const TOTALS_KEY = "analytics:totals";
const DAILY_KEY_PATTERN = "analytics:daily:*";
const DAILY_KEY_PREFIX = "analytics:daily:";
const VISITORS_KEY = "analytics:visitors:all";
const LOGS_KEY = "analytics:logs:recent";

const TARGET_TABLES = [
  "feedback",
  "analytics_events",
  "analytics_visitors",
  "analytics_legacy_daily",
  "analytics_legacy_totals",
];

// Redis hash field → Postgres column.
const COUNTER_FIELDS = {
  pageViews: "page_views",
  filesSent: "files_sent",
  conversionsSucceeded: "conversions_succeeded",
  conversionsFailed: "conversions_failed",
  imageSuccess: "image_success",
  pdfSuccess: "pdf_success",
};
const TOTALS_FIELDS = { ...COUNTER_FIELDS, totalBytesSaved: "total_bytes_saved" };

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const reset = args.has("--reset");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function optionalInteger(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function optionalString(value) {
  return typeof value === "string" ? value : null;
}

// Upstash auto-deserializes JSON, so a list item may be a string or an already-parsed object.
function parseEntry(entry) {
  if (entry && typeof entry === "object") return entry;
  if (typeof entry !== "string") return null;
  try {
    const parsed = JSON.parse(entry);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isFeedback(value) {
  return (
    value !== null &&
    typeof value.id === "string" &&
    (value.type === "bug" || value.type === "improvement") &&
    typeof value.title === "string" &&
    typeof value.details === "string" &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(new Date(value.createdAt).getTime())
  );
}

function isLogEntry(value) {
  return (
    value !== null &&
    typeof value.type === "string" &&
    typeof value.timestamp === "string" &&
    !Number.isNaN(new Date(value.timestamp).getTime())
  );
}

async function scanAll(redis, scan) {
  const results = [];
  let cursor = "0";
  do {
    const [nextCursor, items] = await scan(cursor);
    results.push(...items);
    cursor = String(nextCursor);
  } while (cursor !== "0");
  return results;
}

async function readRedis(redis) {
  const [feedbackRaw, totals, logsRaw] = await Promise.all([
    redis.lrange(FEEDBACK_KEY, 0, -1),
    redis.hgetall(TOTALS_KEY),
    redis.lrange(LOGS_KEY, 0, -1),
  ]);

  const dailyKeys = (
    await scanAll(redis, (cursor) => redis.scan(cursor, { match: DAILY_KEY_PATTERN, count: 1000 }))
  ).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key.slice(DAILY_KEY_PREFIX.length)));
  // SCAN may return a key more than once.
  const uniqueDailyKeys = [...new Set(dailyKeys)].sort();

  const daily = [];
  for (let i = 0; i < uniqueDailyKeys.length; i += 100) {
    const chunk = uniqueDailyKeys.slice(i, i + 100);
    const pipeline = redis.pipeline();
    chunk.forEach((key) => pipeline.hgetall(key));
    const rows = await pipeline.exec();
    chunk.forEach((key, index) => {
      daily.push({ date: key.slice(DAILY_KEY_PREFIX.length), values: rows[index] ?? {} });
    });
  }

  const visitors = [
    ...new Set(
      (
        await scanAll(redis, (cursor) => redis.sscan(VISITORS_KEY, cursor, { count: 1000 }))
      ).map(String),
    ),
  ];

  const feedbackParsed = (feedbackRaw ?? []).map(parseEntry);
  const logsParsed = (logsRaw ?? []).map(parseEntry);

  return {
    feedback: feedbackParsed.filter(isFeedback),
    feedbackSkipped: feedbackParsed.filter((entry) => !isFeedback(entry)).length,
    totals: totals ?? {},
    daily,
    visitors,
    logs: logsParsed.filter(isLogEntry),
    logsSkipped: logsParsed.filter((entry) => !isLogEntry(entry)).length,
  };
}

function printSummary(data) {
  console.log("Redis contents");
  console.log(`  ${FEEDBACK_KEY}: ${data.feedback.length} (skipped invalid: ${data.feedbackSkipped})`);
  console.log(`  ${TOTALS_KEY}:`, data.totals);
  console.log(`  ${DAILY_KEY_PREFIX}*: ${data.daily.length} keys`);
  if (data.daily.length > 0) {
    console.log(`    range: ${data.daily[0].date} .. ${data.daily.at(-1).date}`);
  }
  console.log(`  ${VISITORS_KEY}: ${data.visitors.length}`);
  console.log(`  ${LOGS_KEY}: ${data.logs.length} (skipped invalid: ${data.logsSkipped})`);

  if (dryRun) {
    console.log("\nSamples");
    console.log("  feedback:", data.feedback.slice(0, 2));
    console.log("  daily:", data.daily.slice(-2));
    console.log("  visitors:", data.visitors.slice(0, 3));
    console.log("  logs:", data.logs.slice(0, 2));
  }
}

async function assertTablesExist(client) {
  const { rows } = await client.query(
    "SELECT t, to_regclass(t) IS NOT NULL AS exists FROM unnest($1::text[]) AS t",
    [TARGET_TABLES],
  );
  const missing = rows.filter((row) => !row.exists).map((row) => row.t);
  if (missing.length > 0) {
    throw new Error(
      `Missing tables: ${missing.join(", ")}. Start the app once against this database so it creates the schema.`,
    );
  }
}

async function writePostgres(client, data) {
  if (reset) {
    await client.query(`TRUNCATE ${TARGET_TABLES.join(", ")} RESTART IDENTITY`);
    console.log("Reset: emptied", TARGET_TABLES.join(", "));
  }

  if (data.feedback.length > 0) {
    await client.query(
      `INSERT INTO feedback (id, type, title, details, created_at)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
       ON CONFLICT (id) DO NOTHING`,
      [
        data.feedback.map((entry) => entry.id),
        data.feedback.map((entry) => entry.type),
        data.feedback.map((entry) => entry.title),
        data.feedback.map((entry) => entry.details),
        data.feedback.map((entry) => entry.createdAt),
      ],
    );
  }

  const totalsColumns = Object.values(TOTALS_FIELDS);
  await client.query(
    `INSERT INTO analytics_legacy_totals (id, ${totalsColumns.join(", ")})
     VALUES (true, ${totalsColumns.map((_, index) => `$${index + 1}`).join(", ")})
     ON CONFLICT (id) DO UPDATE SET ${totalsColumns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`,
    Object.keys(TOTALS_FIELDS).map((field) => toNumber(data.totals[field])),
  );

  if (data.daily.length > 0) {
    const dailyColumns = Object.values(COUNTER_FIELDS);
    await client.query(
      `INSERT INTO analytics_legacy_daily (date, ${dailyColumns.join(", ")})
       SELECT * FROM unnest($1::date[], ${dailyColumns.map((_, index) => `$${index + 2}::bigint[]`).join(", ")})
       ON CONFLICT (date) DO UPDATE SET ${dailyColumns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`,
      [
        data.daily.map((row) => row.date),
        ...Object.keys(COUNTER_FIELDS).map((field) => data.daily.map((row) => toNumber(row.values[field]))),
      ],
    );
  }

  for (let i = 0; i < data.visitors.length; i += 5000) {
    await client.query(
      `INSERT INTO analytics_visitors (visitor_id)
       SELECT unnest($1::text[])
       ON CONFLICT DO NOTHING`,
      [data.visitors.slice(i, i + 5000)],
    );
  }

  // These events are already counted in the legacy counters, so they are flagged
  // is_legacy and only show up in the recent-log list, never in aggregates.
  await client.query("DELETE FROM analytics_events WHERE is_legacy");
  if (data.logs.length > 0) {
    await client.query(
      `INSERT INTO analytics_events
        (type, visitor_id, status, tool, mode, filename, file_size, optimized_size, page_count, error, is_legacy, created_at)
       SELECT type, visitor_id, status, tool, mode, filename, file_size, optimized_size, page_count, error, true, created_at
       FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
         $7::bigint[], $8::bigint[], $9::int[], $10::text[], $11::timestamptz[]
       ) AS t(type, visitor_id, status, tool, mode, filename, file_size, optimized_size, page_count, error, created_at)`,
      [
        data.logs.map((entry) => entry.type),
        data.logs.map((entry) => optionalString(entry.visitorId)),
        data.logs.map((entry) => optionalString(entry.status)),
        data.logs.map((entry) => optionalString(entry.tool)),
        data.logs.map((entry) => optionalString(entry.mode)),
        data.logs.map((entry) => optionalString(entry.filename)),
        data.logs.map((entry) => optionalInteger(entry.fileSize)),
        data.logs.map((entry) => optionalInteger(entry.optimizedSize)),
        data.logs.map((entry) => optionalInteger(entry.pageCount)),
        data.logs.map((entry) => optionalString(entry.error)),
        data.logs.map((entry) => entry.timestamp),
      ],
    );
  }
}

async function verify(client, data) {
  const { rows: [counts] } = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM feedback) AS feedback,
       (SELECT COUNT(*) FROM analytics_visitors) AS visitors,
       (SELECT COUNT(*) FROM analytics_legacy_daily) AS daily,
       (SELECT COUNT(*) FROM analytics_events WHERE is_legacy) AS logs`,
  );
  const { rows: [totals] } = await client.query("SELECT * FROM analytics_legacy_totals WHERE id");

  const checks = [
    ["feedback rows", data.feedback.length, toNumber(counts.feedback)],
    ["visitors", data.visitors.length, toNumber(counts.visitors)],
    ["daily keys", data.daily.length, toNumber(counts.daily)],
    ["recent logs", data.logs.length, toNumber(counts.logs)],
    ...Object.entries(TOTALS_FIELDS).map(([field, column]) => [
      `totals.${field}`,
      toNumber(data.totals[field]),
      toNumber(totals?.[column]),
    ]),
  ];

  console.log("\nVerification (Redis vs Postgres)");
  let mismatches = 0;
  for (const [label, redisValue, postgresValue] of checks) {
    const ok = redisValue === postgresValue;
    if (!ok) mismatches += 1;
    console.log(`  ${ok ? "OK  " : "DIFF"} ${label.padEnd(36)} ${String(redisValue).padStart(12)} ${String(postgresValue).padStart(12)}`);
  }
  if (mismatches > 0) {
    console.log(
      `\n${mismatches} mismatch(es). Without --reset, rows already in Postgres (new feedback, visitors) are kept, so counts can be higher there.`,
    );
  }
}

async function main() {
  const redis = new Redis({ url: requireEnv("KV_REST_API_URL"), token: requireEnv("KV_REST_API_TOKEN") });
  const data = await readRedis(redis);
  printSummary(data);

  if (dryRun) {
    console.log("\nDry run: nothing written.");
    return;
  }

  const client = new pg.Client({ connectionString: requireEnv("DATABASE_URL") });
  await client.connect();
  try {
    await assertTablesExist(client);
    await client.query("BEGIN");
    try {
      await writePostgres(client, data);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Rolled back: nothing was written.");
      throw error;
    }
    console.log("\nCommitted.");
    await verify(client, data);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
