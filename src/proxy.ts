import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";

// 그룹웨어 링크로 받은 세션 쿠키가 없으면 페이지는 안내 화면을, API는 401을 돌려준다.
// 쿠키가 있으면 대시보드와 피드백까지 모든 화면을 쓸 수 있다.
export function proxy(req: NextRequest) {
  if (readSessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "그룹웨어에서 다시 접속하세요." },
      { status: 401 },
    );
  }

  return NextResponse.rewrite(new URL("/auth/denied?reason=signin", req.url));
}

export const config = {
  // 정적 파일과 로그인 경로(/auth/*)는 검사하지 않는다.
  matcher: [
    "/((?!_next/static|_next/image|auth/|favicon\\.ico|pdfjs/|.*\\.(?:png|gif|jpg|jpeg|webp|svg|ico|woff2?)$).*)",
  ],
};
