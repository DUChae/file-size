import { NextRequest, NextResponse } from "next/server";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifyGroupwareLink,
} from "@/lib/auth";

// 그룹웨어 링크의 진입점. 서명을 확인하고 세션 쿠키를 발급한 뒤 서명 값이 없는 주소로 보낸다.
// 리디렉트는 상대 경로로 보낸다. 프록시(Caddy) 뒤라 request.url의 호스트·프로토콜을 믿을 수 없다.

function redirectTo(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location, "Referrer-Policy": "no-referrer" },
  });
}

// 외부 주소로 튕겨 보내는 데 쓰이지 않도록 이 사이트 안의 경로만 받는다.
function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const result = verifyGroupwareLink(req.nextUrl.search);

  if (!result.ok) {
    console.warn("[auth] groupware link rejected", { reason: result.reason });
    return redirectTo(`/auth/denied?reason=${result.reason}`);
  }

  const token = createSessionToken(result.user);
  if (!token) {
    return redirectTo("/auth/denied?reason=misconfigured");
  }

  await trackAnalyticsEvent({ type: "login" }, result.user);

  const response = redirectTo(safeNextPath(params.get("next")));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
