import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isAdmin, readSessionToken } from "@/lib/auth";

// 그룹웨어 링크로 받은 세션 쿠키가 없으면 페이지는 안내 화면을, API는 401을 돌려준다.
// 대시보드와 피드백 목록·삭제는 관리자(ADMIN_USER_IDS)만 쓴다. 각 라우트에서도 한 번 더 확인한다.

function isAdminPath(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  // 피드백 제출(POST)은 누구나, 목록 조회(GET)와 삭제(DELETE)는 관리자만.
  return pathname === "/api/feedback" && req.method !== "POST";
}

function deny(req: NextRequest, status: 401 | 403) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: status === 401 ? "그룹웨어에서 다시 접속하세요." : "권한이 없습니다." },
      { status },
    );
  }

  const reason = status === 401 ? "signin" : "forbidden";
  return NextResponse.rewrite(new URL(`/auth/denied?reason=${reason}`, req.url));
}

export function proxy(req: NextRequest) {
  const user = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!user) return deny(req, 401);
  if (isAdminPath(req) && !isAdmin(user)) return deny(req, 403);

  return NextResponse.next();
}

export const config = {
  // 정적 파일과 로그인 경로(/auth/*)는 검사하지 않는다.
  matcher: [
    "/((?!_next/static|_next/image|auth/|favicon\\.ico|pdfjs/|.*\\.(?:png|gif|jpg|jpeg|webp|svg|ico|woff2?)$).*)",
  ],
};
