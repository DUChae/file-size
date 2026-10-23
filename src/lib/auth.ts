import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// 그룹웨어가 서명한 링크로만 들어올 수 있다. 서명이 맞으면 이 앱이 세션 쿠키를 따로 발급한다.
// 링크 형식은 scripts/groupware-link.mjs가 기준 구현이다.

export const SESSION_COOKIE = "optistream_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
// 그룹웨어와 이 서버의 시계 차이와 클릭까지 걸리는 시간을 합쳐 이만큼만 링크를 받아준다.
const LINK_MAX_AGE_SECONDS = 120;
const MIN_SECRET_LENGTH = 32;
const MAX_FIELD_LENGTH = 100;

export interface SessionUser {
  uid: string;
  name: string;
}

interface SessionPayload extends SessionUser {
  exp: number;
}

export type LinkVerifyResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "misconfigured" | "invalid" | "expired" };

function readSecret(name: "GROUPWARE_SSO_SECRET" | "SESSION_SECRET") {
  const value = process.env[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    console.error(`[auth] ${name} is missing or shorter than ${MIN_SECRET_LENGTH} characters`);
    return null;
  }
  return value;
}

function hmac(secret: string, message: string) {
  return createHmac("sha256", secret).update(message).digest();
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

// 줄바꿈이 들어가면 서명 원문의 구분이 흐려지므로 제어 문자는 받지 않는다.
function isCleanField(value: string, allowEmpty: boolean) {
  if (!allowEmpty && value.length === 0) return false;
  return value.length <= MAX_FIELD_LENGTH && !/[\u0000-\u001f\u007f]/.test(value);
}

export function verifyGroupwareLink(params: URLSearchParams): LinkVerifyResult {
  const secret = readSecret("GROUPWARE_SSO_SECRET");
  if (!secret) return { ok: false, reason: "misconfigured" };

  const uid = params.get("uid") ?? "";
  const name = params.get("name") ?? "";
  const ts = params.get("ts") ?? "";
  const sig = params.get("sig") ?? "";

  if (!isCleanField(uid, false) || !isCleanField(name, true)) {
    return { ok: false, reason: "invalid" };
  }
  if (!/^\d{1,12}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(sig)) {
    return { ok: false, reason: "invalid" };
  }

  const expected = hmac(secret, `${uid}\n${name}\n${ts}`);
  if (!safeEqual(expected, Buffer.from(sig, "hex"))) {
    return { ok: false, reason: "invalid" };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - Number(ts);
  if (Math.abs(ageSeconds) > LINK_MAX_AGE_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, user: { uid, name } };
}

export function createSessionToken(user: SessionUser) {
  const secret = readSecret("SESSION_SECRET");
  if (!secret) return null;

  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(secret, body).toString("base64url")}`;
}

export function readSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const secret = readSecret("SESSION_SECRET");
  if (!secret) return null;

  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(hmac(secret, body), Buffer.from(sig, "base64url"))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.name !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return { uid: payload.uid, name: payload.name };
  } catch {
    return null;
  }
}

export function isAdmin(user: SessionUser | null) {
  if (!user) return false;
  const admins = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return admins.includes(user.uid);
}

// 라우트 핸들러와 서버 컴포넌트에서 쓴다. 요청 밖에서 불리면 사용자를 모르는 것으로 본다.
export async function getCurrentUser() {
  try {
    const store = await cookies();
    return readSessionToken(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}
