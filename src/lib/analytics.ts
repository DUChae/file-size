import { redis } from "@/lib/redis";

const TOTALS_KEY = "analytics:totals";
const LOGS_KEY = "analytics:logs:recent";
const VISITORS_KEY = "analytics:visitors:all";
const DAILY_KEY_PREFIX = "analytics:daily:";
const MAX_LOGS = 100;
const TREND_DAYS = 365;

export type AnalyticsEventType =
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
  tool?: "image" | "pdf" | "url_capture";
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
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDateKey(timestamp: string) {
  return timestamp.slice(0, 10);
}

function getTrendDateKeys(days: number) {
  const dates: string[] = [];
  const today = new Date();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

async function incrementTotal(field: string, by = 1) {
  if (!redis) return;
  await redis.hincrby(TOTALS_KEY, field, by);
}

async function incrementDaily(field: string, dateKey: string, by = 1) {
  if (!redis) return;
  await redis.hincrby(`${DAILY_KEY_PREFIX}${dateKey}`, field, by);
}

async function pushRecentLog(event: DashboardLogEntry) {
  if (!redis) return;
  await redis.lpush(LOGS_KEY, JSON.stringify(event));
  await redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1);
}

export async function trackAnalyticsEvent(event: AnalyticsEvent) {
  if (!redis) return;

  const timestamp = event.timestamp ?? new Date().toISOString();
  const dateKey = getDateKey(timestamp);
  const logEntry: DashboardLogEntry = {
    ...event,
    timestamp,
  };

  switch (event.type) {
    case "page_view":
      await incrementTotal("pageViews");
      await incrementDaily("pageViews", dateKey);
      if (event.visitorId) {
        await redis.sadd(VISITORS_KEY, event.visitorId);
      }
      break;
    case "image_job_started":
    case "pdf_job_started":
      await incrementTotal("filesSent");
      await incrementDaily("filesSent", dateKey);
      break;
    case "image_job_success":
      await incrementTotal("conversionsSucceeded");
      await incrementTotal("imageSuccess");
      await incrementDaily("conversionsSucceeded", dateKey);
      await incrementDaily("imageSuccess", dateKey);
      if (typeof event.fileSize === "number" && typeof event.optimizedSize === "number") {
        const savedBytes = Math.max(0, event.fileSize - event.optimizedSize);
        if (savedBytes > 0) {
          await incrementTotal("totalBytesSaved", savedBytes);
        }
      }
      break;
    case "pdf_job_success":
      await incrementTotal("conversionsSucceeded");
      await incrementTotal("pdfSuccess");
      await incrementDaily("conversionsSucceeded", dateKey);
      await incrementDaily("pdfSuccess", dateKey);
      break;
    case "image_job_error":
    case "pdf_job_error":
      await incrementTotal("conversionsFailed");
      await incrementDaily("conversionsFailed", dateKey);
      break;
  }

  await pushRecentLog(logEntry);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (!redis) {
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
    };
  }

  const client = redis;
  const trendDateKeys = getTrendDateKeys(TREND_DAYS);

  const [totals, uniqueVisitors, logs, trendRows] = await Promise.all([
    client.hgetall<Record<string, string>>(TOTALS_KEY),
    client.scard(VISITORS_KEY),
    client.lrange(LOGS_KEY, 0, 24),
    Promise.all(
      trendDateKeys.map((date) =>
        client.hgetall<Record<string, string>>(`${DAILY_KEY_PREFIX}${date}`),
      ),
    ),
  ]);

  const trends = trendDateKeys.map((date, index) => {
    const row = trendRows[index];
    return {
      date,
      pageViews: toNumber(row?.pageViews),
      filesSent: toNumber(row?.filesSent),
      conversionsSucceeded: toNumber(row?.conversionsSucceeded),
      conversionsFailed: toNumber(row?.conversionsFailed),
      imageSuccess: toNumber(row?.imageSuccess),
      pdfSuccess: toNumber(row?.pdfSuccess),
    };
  });

  return {
    enabled: true,
    totals: {
      pageViews: toNumber(totals?.pageViews),
      uniqueVisitors: toNumber(uniqueVisitors),
      filesSent: toNumber(totals?.filesSent),
      conversionsSucceeded: toNumber(totals?.conversionsSucceeded),
      conversionsFailed: toNumber(totals?.conversionsFailed),
      imageSuccess: toNumber(totals?.imageSuccess),
      pdfSuccess: toNumber(totals?.pdfSuccess),
      totalBytesSaved: toNumber(totals?.totalBytesSaved),
    },
    trends,
    recentLogs: (logs ?? [])
      .map((entry) => {
        try {
          return JSON.parse(entry) as DashboardLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is DashboardLogEntry => entry !== null),
  };
}
