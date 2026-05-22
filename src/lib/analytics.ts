import { redis } from "@/lib/redis";

const TOTALS_KEY = "analytics:totals";
const LOGS_KEY = "analytics:logs:recent";
const VISITORS_KEY = "analytics:visitors:all";
const MAX_LOGS = 100;

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
  tool?: "image" | "pdf";
  mode?: string;
  filename?: string;
  fileSize?: number;
  pageCount?: number;
  error?: string;
  timestamp?: string;
}

export interface DashboardLogEntry extends AnalyticsEvent {
  timestamp: string;
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
  };
  recentLogs: DashboardLogEntry[];
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function incrementTotal(field: string, by = 1) {
  if (!redis) return;
  await redis.hincrby(TOTALS_KEY, field, by);
}

async function pushRecentLog(event: DashboardLogEntry) {
  if (!redis) return;
  await redis.lpush(LOGS_KEY, JSON.stringify(event));
  await redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1);
}

export async function trackAnalyticsEvent(event: AnalyticsEvent) {
  if (!redis) return;

  const logEntry: DashboardLogEntry = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  switch (event.type) {
    case "page_view":
      await incrementTotal("pageViews");
      if (event.visitorId) {
        await redis.sadd(VISITORS_KEY, event.visitorId);
      }
      break;
    case "image_job_started":
    case "pdf_job_started":
      await incrementTotal("filesSent");
      break;
    case "image_job_success":
      await incrementTotal("conversionsSucceeded");
      await incrementTotal("imageSuccess");
      break;
    case "pdf_job_success":
      await incrementTotal("conversionsSucceeded");
      await incrementTotal("pdfSuccess");
      break;
    case "image_job_error":
    case "pdf_job_error":
      await incrementTotal("conversionsFailed");
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
      },
      recentLogs: [],
    };
  }

  const [totals, uniqueVisitors, logs] = await Promise.all([
    redis.hgetall<Record<string, string>>(TOTALS_KEY),
    redis.scard(VISITORS_KEY),
    redis.lrange(LOGS_KEY, 0, 24),
  ]);

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
    },
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
