# URL Page Capture Feature Plan

## Goal

사용자가 URL을 입력하면 해당 웹페이지 전체를 캡처하고, 캡처 이미지를 미리 확인한 뒤 원하는 크기와 포맷으로 조절/압축해서 다운로드할 수 있게 한다.

## Confirmed User Flow

`URL 입력` -> `전체 페이지 캡처` -> `미리보기에서 드래그로 사이즈 조절` -> `포맷 설정` -> `이미지 압축` -> `다운로드`

## Implementation Status

- Phase 1: Done. 별도 `웹페이지 캡처` 탭으로 확정.
- Phase 2: Done. ScreenshotOne 기반 `/api/capture-url` 추가.
- Phase 3: Done. URL 입력, 캡처 상태, 미리보기 UI 추가.
- Phase 4: Done. 드래그 자유 비율 리사이즈, 포맷 선택, screenshot 프리셋 압축, 원본/결과 다운로드 추가.
- Phase 5: Done. 최대 높이 30000px, IP 기준 1분 5회/1일 50회 제한 추가.
- Phase 6: Done. `npm run build` 및 `npm run lint` 통과. `AdminDashboard`의 lint 오류 해결 완료.

## Assumptions

- 현재 프로젝트는 Next.js App Router 기반이다.
- 기존 이미지 압축 파이프라인은 `sharp`와 `/api/compress`를 중심으로 동작한다.
- URL 캡처는 브라우저 보안 정책 때문에 클라이언트 단독 구현이 아니라 서버 API가 필요하다.
- 배포 환경은 Vercel 그대로 유지한다.
- 캡처 엔진은 ScreenshotOne API를 사용한다.
- ScreenshotOne은 월 100회 무료 캡처를 제공하는 무료 플랜으로 시작한다.
- 로그인, 결제, 내부망, 봇 차단이 있는 페이지는 지원 범위에서 제외한다.

## Success Criteria

- 사용자가 URL을 입력하면 전체 페이지 스크린샷이 생성된다.
- 생성된 스크린샷을 화면에서 미리 볼 수 있다.
- 사용자가 미리보기에서 드래그로 출력 영역 또는 출력 크기를 조절할 수 있다.
- 사용자가 출력 포맷과 압축 옵션을 조절할 수 있다.
- 원본 캡처 이미지도 다운로드할 수 있다.
- 조절/압축된 결과물을 다운로드할 수 있다.
- 위험한 URL 입력을 차단한다.
- 로컬 빌드와 린트가 통과한다.

## Phase 1: UX Scope And Product Decisions

### Work

- `웹페이지 캡처` 도구를 기존 `이미지 압축` 영역과 분리된 별도 탭으로 추가한다.
- URL 입력, 캡처 버튼, 미리보기, 크기 입력, 압축/다운로드 버튼의 흐름을 확정한다.
- 출력 포맷은 `PNG/JPEG/WebP/AVIF` 전체를 지원한다.
- 캡처 실패 시 사용자에게 보여줄 메시지 범위를 정한다.

### Verify

- 확정된 UX 흐름이 기존 `ImageOptimizer`와 `ToolWorkspace` 구조에 자연스럽게 들어간다.
- 사용자가 캡처 전/후 상태를 구분할 수 있다.

### Decisions

- 별도 탭으로 만든다.
- 출력 포맷은 `PNG/JPEG/WebP/AVIF` 전체를 지원한다.
- 원본 캡처 이미지 다운로드 버튼도 제공한다.

## Phase 2: Capture Backend

### Work

- `/api/capture-url` API를 추가한다.
- URL 유효성 검사를 추가한다.
- `http`/`https`만 허용한다.
- `localhost`, `127.0.0.1`, `0.0.0.0`, 사설 IP, 링크 로컬 주소, 메타데이터 IP를 차단한다.
- 외부 Screenshot API로 페이지 전체 스크린샷을 생성한다.
- 캡처 결과는 기존 구조와 맞추기 위해 `@vercel/blob`에 저장하고 URL을 반환한다.
- ScreenshotOne API key는 서버 환경변수로만 관리한다.

### Verify

- 정상 URL에서 전체 페이지 이미지가 생성된다.
- 차단 대상 URL은 요청 전에 거부된다.
- 캡처 타임아웃과 실패 응답이 JSON 형태로 반환된다.

### Decisions Needed

없음.

### Decisions

- 외부 캡처 API는 ScreenshotOne을 사용한다.
- 무료 플랜의 월 100회 캡처 한도 안에서 시작한다.
- API 응답으로 직접 이미지 바이너리를 브라우저에 넘기지 않고, 기존 압축 파이프라인과 맞게 `@vercel/blob`에 원본 캡처 이미지를 저장한다.
- `response_type=by_format`, `format=png`, `full_page=true`를 기본 캡처 옵션으로 사용한다.
- API key 환경변수 이름은 `SCREENSHOTONE_ACCESS_KEY`로 둔다.

## Phase 3: Frontend Capture UI

### Work

- `UrlCaptureOptimizer` 컴포넌트를 추가한다.
- URL 입력 폼과 캡처 실행 상태를 구현한다.
- 캡처 완료 후 이미지 미리보기를 표시한다.
- 원본 크기, 예상 파일 크기, 캡처 상태를 보여준다.
- 캡처된 이미지를 기존 압축 API로 넘길 수 있는 구조를 만든다.
- 별도 탭 진입 시 첫 화면은 파일 업로드가 아니라 URL 입력을 중심으로 구성한다.

### Verify

- URL 입력 전, 캡처 중, 캡처 성공, 캡처 실패 상태가 모두 화면에서 정상 표시된다.
- 캡처 성공 후 미리보기 이미지가 깨지지 않는다.
- 기존 이미지 업로드 도구와 상태가 섞이지 않는다.

## Phase 4: Resize And Compression Flow

### Work

- 캡처 결과 이미지에 대해 출력 포맷 `PNG/JPEG/WebP/AVIF`를 선택할 수 있게 한다.
- 사용자가 미리보기에서 드래그로 출력 크기를 조절할 수 있게 한다.
- 드래그 리사이즈는 원본 비율 유지와 자유 비율 조절을 모두 허용한다.
- 드래그 결과를 서버 압축 단계의 리사이즈 값으로 전달한다.
- 압축 품질은 기존 `screenshot` 모드 프리셋을 재사용한다.
- 원본 캡처 이미지 다운로드 버튼을 제공한다.
- 압축 완료 후 파일명, 용량 감소율, 다운로드 버튼을 표시한다.

### Verify

- 지정한 크기대로 결과물이 생성된다.
- PNG/JPEG/WebP 등 선택 포맷이 실제 결과 파일에 반영된다.
- 다운로드 파일명이 URL 기반으로 안전하게 생성된다.

### Decisions Needed

없음.

### Decisions

- 자유 비율 조절도 허용한다.
- 압축 품질은 기존 `screenshot` 모드 프리셋을 재사용한다.

## Phase 5: Limits, Security, And Reliability

### Work

- 전체 페이지 캡처를 기본으로 하되, 무한 스크롤/비정상적으로 긴 페이지 방어를 위한 최대 높이 제한을 둔다.
- API 타임아웃을 둔다.
- 외부 API 크레딧과 서버 비용 방어를 위한 간단한 요청 제한을 둔다.
- robots, paywall, 로그인 페이지, 성인/불법 콘텐츠 등 비지원 케이스에 대한 안내 문구를 정리한다.

### Verify

- 너무 긴 페이지가 서버 메모리를 과도하게 쓰지 않는다.
- 악의적인 내부망 URL 접근이 차단된다.
- 실패 케이스가 서버 에러 로그만 남기고 사용자 화면이 멈추지 않는다.

### Decisions Needed

없음.

### Decisions

- 최대 캡처 높이는 30000px로 제한한다.
- 요청 제한은 IP 기준 1분 5회, 1일 50회로 제한한다.

## Phase 6: Verification And Release

### Work

- 대표 사이트 몇 개로 수동 테스트한다.
- `npm run lint`를 실행한다.
- `npm run build`를 실행한다.
- README 또는 간단한 사용 설명을 업데이트한다.

### Verify

- 로컬에서 캡처/미리보기/압축/다운로드가 end-to-end로 동작한다.
- 배포 환경에서 브라우저 엔진이 정상 실행된다.
- 기존 이미지 압축 및 PDF 변환 기능이 깨지지 않는다.

## Open Questions

없음.
