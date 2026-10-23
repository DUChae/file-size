import { db, query } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth";

const TREND_DAYS = 365;
const RECENT_LOG_LIMIT = 25;
const ACTIVITY_LOG_LIMIT = 100;
const USER_SUMMARY_DAYS = 30;

export type AnalyticsEventType =
  | "login"
  | "page_view"
  | "image_job_started"
  | "image_job_success"
  | "image_job_error"
  | "pdf_job_started"
  | "pdf_job_success"
  | "pdf_job_error";

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  visitorId?: string;
  status?: "started" | "success" | "error";
  tool?: "image" | "pdf" | "url_capture" | "remove_bg";
  mode?: string;
  filename?: string;
  fileSize?: number;
  optimizedSize?: number;
  pageCount?: number;
  error?: string;
  timestamp?: string;
}

export interface DashboardLogEntry extends AnalyticsEvent {
  timestamp: string;
  userId?: string;
  userName?: string;
}

export interface UserActivitySummary {
  userId: string;
  userName: string;
  logins: number;
  filesSent: number;
  conversionsSucceeded: number;
  conversionsFailed: number;
  lastSeen: string;
}

export interface DailyTrendPoint {
  date: string;
  pageViews: number;
  filesSent: number;
  conversionsSucceeded: number;
  conversionsFailed: number;
  imageSuccess: number;
  pdfSuccess: number;
}

export interface DashboardStats {
  enabled: boolean;
  totals: {
    pageViews: number;
    uniqueVisitors: number;
    filesSent: number;
    conversionsSucceeded: number;
    conversionsFailed: number;
    imageSuccess: number;
    pdfSuccess: number;
    totalBytesSaved: number;
  };
  trends: DailyTrendPoint[];
  recentLogs: DashboardLogEntry[];
  // 사용자 탭: 최근 작업(페이지 조회 제외)과 최근 30일 사용자별 합계
  activityLogs: DashboardLogEntry[];
  users: UserActivitySummary[];
}

// BIGINT and COUNT(*) come back from pg as strings.
type Counter = string | number | null;

interface CounterRow {
  page_views: Counter;
  files_sent: Counter;
  conversions_succeeded: Counter;
  conversions_failed: Counter;
  image_success: Counter;
  pdf_success: Counter;
}

interface TotalsRow extends CounterRow {
  total_bytes_saved: Counter;
}

interface TrendRow extends CounterRow {
  date: string;
}

interface EventRow {
  type: AnalyticsEventType;
  visitor_id: string | null;
  status: AnalyticsEvent["status"] | null;
  tool: AnalyticsEvent["tool"] | null;
  mode: string | null;
  filename: string | null;
  file_size: string | null;
  optimized_size: string | null;
  page_count: number | null;
  error: string | null;
  user_id: string | null;
  user_name: string | null;
  created_at: Date;
}

interface UserSummaryRow {
  user_id: string;
  user_name: string | null;
  logins: Counter;
  files_sent: Counter;
  conversions_succeeded: Counter;
  conversions_failed: Counter;
  last_seen: Date;
}

// Shared by the totals and daily-trend queries so both count events the same way.
const EVENT_COUNTERS_SQL = `
  COUNT(*) FILTER (WHERE type = 'page_view') AS page_views,
  COUNT(*) FILTER (WHERE type IN ('image_job_started', 'pdf_job_started')) AS files_sent,
  COUNT(*) FILTER (WHERE type IN ('image_job_success', 'pdf_job_success')) AS conversions_succeeded,
  COUNT(*) FILTER (WHERE type IN ('image_job_error', 'pdf_job_error')) AS conversions_failed,
  COUNT(*) FILTER (WHERE type = 'image_job_success') AS image_success,
  COUNT(*) FILTER (WHERE type = 'pdf_job_success') AS pdf_success`;

const COUNTER_COLUMNS = [
  "page_views",
  "files_sent",
  "conversions_succeeded",
  "conversions_failed",
  "image_success",
  "pdf_success",
] as const;

// Legacy Redis counters were keyed by UTC date, so all date math stays in UTC.
const TREND_SQL = `
WITH days AS (
  SELECT d::date AS date
  FROM generate_series(
    (now() AT TIME ZONE 'UTC')::date - ($1::int - 1),
    (now() AT TIME ZONE 'UTC')::date,
    interval '1 day'
  ) AS d
),
events AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS date, ${EVENT_COUNTERS_SQL}
  FROM analytics_events
  WHERE NOT is_legacy
    AND created_at >= ((now() AT TIME ZONE 'UTC')::date - ($1::int - 1))::timestamp AT TIME ZONE 'UTC'
  GROUP BY 1
)
SELECT
  to_char(days.date, 'YYYY-MM-DD') AS date,
  ${COUNTER_COLUMNS.map(
    (column) => `COALESCE(l.${column}, 0) + COALESCE(e.${column}, 0) AS ${column}`,
  ).join(",\n  ")}
FROM days
LEFT JOIN analytics_legacy_daily l ON l.date = days.date
LEFT JOIN events e ON e.date = days.date
ORDER BY days.date`;

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Events arrive from the browser, so every field is re-checked before it reaches SQL.
function optionalString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

function optionalInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function resolveTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function emptyStats(): DashboardStats {
  return {
    enabled: false,
    totals: {
      pageViews: 0,
      uniqueVisitors: 0,
      filesSent: 0,
      conversionsSucceeded: 0,
      conversionsFailed: 0,
      imageSuccess: 0,
      pdfSuccess: 0,
      totalBytesSaved: 0,
    },
    trends: [],
    recentLogs: [],
    activityLogs: [],
    users: [],
  };
}

function toLogEntry(row: EventRow): DashboardLogEntry {
  const entry: DashboardLogEntry = {
    type: row.type,
    timestamp: row.created_at.toISOString(),
  };

  if (row.visitor_id !== null) entry.visitorId = row.visitor_id;
  if (row.status !== null) entry.status = row.status;
  if (row.tool !== null) entry.tool = row.tool;
  if (row.mode !== null) entry.mode = row.mode;
  if (row.filename !== null) entry.filename = row.filename;
  if (row.file_size !== null) entry.fileSize = toNumber(row.file_size);
  if (row.optimized_size !== null) entry.optimizedSize = toNumber(row.optimized_size);
  if (row.page_count !== null) entry.pageCount = row.page_count;
  if (row.error !== null) entry.error = row.error;
  if (row.user_id !== null) entry.userId = row.user_id;
  if (row.user_name !== null) entry.userName = row.user_name;

  return entry;
}

const EVENT_COLUMNS_SQL =
  "type, visitor_id, status, tool, mode, filename, file_size, optimized_size, page_count, error, user_id, user_name, created_at";

// Analytics is best-effort: a failed write is logged and swallowed so it never
// fails the compression or capture request that triggered it.
// 사용자는 브라우저가 보낸 값이 아니라 세션 쿠키에서 꺼낸다. 로그인 직후처럼 쿠키가
// 아직 없을 때만 호출하는 쪽이 user를 넘긴다.
export async function trackAnalyticsEvent(event: AnalyticsEvent, user?: SessionUser) {
  if (!db) return;

  try {
    const timestamp = resolveTimestamp(event.timestamp);
    const visitorId = optionalString(event.visitorId, 200);
    const actor = user ?? (await getCurrentUser());

    await query(
      `INSERT INTO analytics_events
        (type, visitor_id, status, tool, mode, filename, file_size, optimized_size, page_count, error, user_id, user_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, now()))`,
      [
        event.type,
        visitorId,
        optionalString(event.status, 20),
        optionalString(event.tool, 20),
        optionalString(event.mode, 100),
        optionalString(event.filename, 500),
        optionalInteger(event.fileSize),
        optionalInteger(event.optimizedSize),
        optionalInteger(event.pageCount),
        optionalString(event.error, 2000),
        actor?.uid ?? null,
        actor?.name || null,
        timestamp,
      ],
    );

    if (event.type === "page_view" && visitorId) {
      await query(
        "INSERT INTO analytics_visitors (visitor_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [visitorId],
      );
    }
  } catch (error) {
    console.error("[analytics] failed to record event", { type: event.type }, error);
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (!db) {
    return emptyStats();
  }

  const [legacyTotals, eventTotals, visitors, trends, logs, activity, users] = await Promise.all([
    query<TotalsRow>("SELECT * FROM analytics_legacy_totals WHERE id"),
    query<TotalsRow>(
      `SELECT ${EVENT_COUNTERS_SQL},
        COALESCE(SUM(GREATEST(file_size - optimized_size, 0)) FILTER (WHERE type = 'image_job_success'), 0) AS total_bytes_saved
       FROM analytics_events
       WHERE NOT is_legacy`,
    ),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM analytics_visitors"),
    query<TrendRow>(TREND_SQL, [TREND_DAYS]),
    query<EventRow>(
      `SELECT ${EVENT_COLUMNS_SQL}
       FROM analytics_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [RECENT_LOG_LIMIT],
    ),
    query<EventRow>(
      `SELECT ${EVENT_COLUMNS_SQL}
       FROM analytics_events
       WHERE user_id IS NOT NULL AND type <> 'page_view'
       ORDER BY created_at DESC
       LIMIT $1`,
      [ACTIVITY_LOG_LIMIT],
    ),
    query<UserSummaryRow>(
      `SELECT
         user_id,
         (array_agg(user_name ORDER BY created_at DESC))[1] AS user_name,
         COUNT(*) FILTER (WHERE type = 'login') AS logins,
         COUNT(*) FILTER (WHERE type IN ('image_job_started', 'pdf_job_started')) AS files_sent,
         COUNT(*) FILTER (WHERE type IN ('image_job_success', 'pdf_job_success')) AS conversions_succeeded,
         COUNT(*) FILTER (WHERE type IN ('image_job_error', 'pdf_job_error')) AS conversions_failed,
         MAX(created_at) AS last_seen
       FROM analytics_events
       WHERE user_id IS NOT NULL AND created_at >= now() - make_interval(days => $1::int)
       GROUP BY user_id
       ORDER BY last_seen DESC`,
      [USER_SUMMARY_DAYS],
    ),
  ]);

  const legacy = legacyTotals.rows[0];
  const current = eventTotals.rows[0];
  const sum = (column: keyof TotalsRow) => toNumber(legacy?.[column]) + toNumber(current?.[column]);

  return {
    enabled: true,
    totals: {
      pageViews: sum("page_views"),
      uniqueVisitors: toNumber(visitors.rows[0]?.count),
      filesSent: sum("files_sent"),
      conversionsSucceeded: sum("conversions_succeeded"),
      conversionsFailed: sum("conversions_failed"),
      imageSuccess: sum("image_success"),
      pdfSuccess: sum("pdf_success"),
      totalBytesSaved: sum("total_bytes_saved"),
    },
    trends: trends.rows.map((row) => ({
      date: row.date,
      pageViews: toNumber(row.page_views),
      filesSent: toNumber(row.files_sent),
      conversionsSucceeded: toNumber(row.conversions_succeeded),
      conversionsFailed: toNumber(row.conversions_failed),
      imageSuccess: toNumber(row.image_success),
      pdfSuccess: toNumber(row.pdf_success),
    })),
    recentLogs: logs.rows.map(toLogEntry),
    activityLogs: activity.rows.map(toLogEntry),
    users: users.rows.map((row) => ({
      userId: row.user_id,
      userName: row.user_name ?? "",
      logins: toNumber(row.logins),
      filesSent: toNumber(row.files_sent),
      conversionsSucceeded: toNumber(row.conversions_succeeded),
      conversionsFailed: toNumber(row.conversions_failed),
      lastSeen: row.last_seen.toISOString(),
    })),
  };
}
