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
  type: string;
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

// 그룹웨어(PHP)는 세션 값을 바이트 그대로 서명하고 퍼센트 인코딩한다. 이름이 EUC-KR이면
// URLSearchParams가 UTF-8로 풀면서 글자가 깨져 서명이 어긋나므로, 쿼리를 바이트로 직접 푼다.
function parseRawQuery(search: string) {
  const fields = new Map<string, Buffer>();
  for (const part of search.replace(/^\?/, "").split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? "" : part.slice(eq + 1);
    if (!fields.has(key)) fields.set(key, percentDecodeBytes(value));
  }
  return fields;
}

function percentDecodeBytes(value: string) {
  const bytes: number[] = [];
  const raw = Buffer.from(value.replace(/\+/g, " "), "utf8");
  for (let i = 0; i < raw.length; i++) {
    const hex = raw[i] === 0x25 ? raw.subarray(i + 1, i + 3).toString("latin1") : "";
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(raw[i]);
    }
  }
  return Buffer.from(bytes);
}

// UTF-8이 아니면 그룹웨어의 옛 인코딩(EUC-KR)으로 읽는다.
function decodeText(bytes: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

export function verifyGroupwareLink(search: string): LinkVerifyResult {
  const secret = readSecret("GROUPWARE_SSO_SECRET");
  if (!secret) return { ok: false, reason: "misconfigured" };

  const fields = parseRawQuery(search);
  const bytes = (key: string) => fields.get(key) ?? Buffer.alloc(0);
  const uid = decodeText(bytes("uid"));
  const name = decodeText(bytes("name"));
  const type = decodeText(bytes("type"));
  const ts = bytes("ts").toString("latin1");
  const sig = bytes("sig").toString("latin1");

  if (!isCleanField(uid, false) || !isCleanField(name, true) || !isCleanField(type, true)) {
    console.warn("[auth] groupware link has a malformed field", { uid });
    return { ok: false, reason: "invalid" };
  }
  if (!/^\d{1,12}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(sig)) {
    console.warn("[auth] groupware link has a malformed ts or sig", { uid });
    return { ok: false, reason: "invalid" };
  }

  const newline = Buffer.from("\n");
  const message = Buffer.concat([
    bytes("uid"), newline, bytes("name"), newline, bytes("type"), newline, Buffer.from(ts),
  ]);
  const expected = createHmac("sha256", secret).update(message).digest();
  if (!safeEqual(expected, Buffer.from(sig, "hex"))) {
    // 모든 사람이 이 로그로 막히면 그룹웨어와 서버의 GROUPWARE_SSO_SECRET이 다른 것이다.
    console.warn("[auth] groupware link signature mismatch", {
      uid,
      nameIsUtf8: name === bytes("name").toString("utf8"),
    });
    return { ok: false, reason: "invalid" };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - Number(ts);
  if (Math.abs(ageSeconds) > LINK_MAX_AGE_SECONDS) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, user: { uid, name, type } };
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
    if (
      typeof payload.uid !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.type !== "string"
    ) {
      return null;
    }
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return { uid: payload.uid, name: payload.name, type: payload.type };
  } catch {
    return null;
  }
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
