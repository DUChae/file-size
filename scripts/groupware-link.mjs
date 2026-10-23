#!/usr/bin/env node
// 그룹웨어 → OptiStream 접속 링크를 만든다. 그룹웨어 쪽 구현의 기준이자 로컬 테스트용이다.
//
//   GROUPWARE_SSO_SECRET=... node scripts/groupware-link.mjs <uid> [name] [type] [base] [next]
//   예) node scripts/groupware-link.mjs hong123 홍길동 M http://localhost:3000 /compress
//
// 링크 형식 (src/lib/auth.ts의 verifyGroupwareLink와 같아야 한다)
//   {base}/auth/groupware?uid=..&name=..&type=..&ts=..&sig=..[&next=..]
//   type 그룹웨어 계정 종류(wo_member.mtype). A면 이 앱의 관리자가 된다.
//   ts   발급 시각, 유닉스 초. 서버는 ±120초 안의 링크만 받는다.
//   sig  HMAC-SHA256(공유 비밀키, `${uid}\n${name}\n${type}\n${ts}`)의 소문자 hex. 없는 값은 빈 문자열로 서명한다.
//   uid·name·type은 100자 이하, 줄바꿈 등 제어 문자 금지. next는 서명하지 않으며 사이트 안 경로(/로 시작)만 쓰인다.
//
// 링크는 사용자가 메뉴를 누르는 그 순간 서버에서 만들어야 한다. 미리 만들어 화면에 박아 두면 2분 뒤 만료된다.

import { createHmac } from "node:crypto";

const [uid, name = "", type = "", base = "http://localhost:3000", next] = process.argv.slice(2);
const secret = process.env.GROUPWARE_SSO_SECRET;

if (!uid) {
  console.error("사용법: GROUPWARE_SSO_SECRET=... node scripts/groupware-link.mjs <uid> [name] [type] [base] [next]");
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error("GROUPWARE_SSO_SECRET을 32자 이상으로 설정하세요.");
  process.exit(1);
}

const ts = String(Math.floor(Date.now() / 1000));
const sig = createHmac("sha256", secret).update(`${uid}\n${name}\n${type}\n${ts}`).digest("hex");

const url = new URL("/auth/groupware", base);
url.searchParams.set("uid", uid);
if (name) url.searchParams.set("name", name);
if (type) url.searchParams.set("type", type);
url.searchParams.set("ts", ts);
url.searchParams.set("sig", sig);
if (next) url.searchParams.set("next", next);

console.log(url.toString());
