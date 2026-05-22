# OptiStream

Next.js 기반 파일 최적화 도구입니다. 현재 다음 기능을 제공합니다.

- 이미지 최적화: PNG, JPG, JPEG 업로드 후 압축/포맷 변환
- PDF to PNG: PDF 각 페이지를 PNG로 변환 후 ZIP 다운로드
- 관리자 대시보드: 방문, 업로드, 변환 성공/실패 통계 확인
- 피드백 센터: 버그 제보와 개선 요청 등록, 관리자 화면에서 조회/삭제

## 주요 기능

### 1. Image Optimizer

- 지원 포맷: `PNG`, `JPG`, `JPEG`
- 최대 업로드 크기: 파일당 `20MB`
- 동시 처리 수: 최대 `2개`
- 출력 포맷:
  - `ORIGINAL`
  - `PNG`
  - `JPEG`

#### 최적화 모드

- `Screenshot`
  - 텍스트와 UI 중심 이미지에 맞춘 기본 압축
- `Photography`
  - 일반 사진용 중간 압축
- `Web Engine`
  - 웹 배포용 경량 압축
  - 기본 긴 변 기준 `1200px` 리사이즈
  - 가로/세로 크기를 직접 입력하면 `contain` 기준으로 맞춤 리사이즈
- `Lossless`
  - 원본 품질을 최대한 보존하는 고품질 압축

#### 처리 방식

- 클라이언트에서 `Vercel Blob` direct upload 사용
- 서버에서 `sharp`로 최적화 수행
- EXIF 방향 정보를 반영하도록 `rotate()` 적용
- 결과 파일이 원본보다 크면 원본 유지
- 결과는 Blob URL로 반환

### 2. PDF to PNG

- 지원 포맷: `PDF`
- 최대 업로드 크기: `20MB`
- 브라우저에서 PDF 렌더링 후 각 페이지를 PNG로 변환
- 결과는 ZIP 파일 하나로 다운로드

### 3. Admin Dashboard

- `/admin`
- 기능:
  - 방문 수 / 업로드 수 / 변환 성공/실패 집계
  - 이미지 / PDF 성공 추이 차트
  - 실패 로그 테이블
  - 피드백 목록 조회
  - 피드백 삭제

### 4. Feedback Center

- `/feedback`
- 기능:
  - 버그 제보
  - 개선 요청 등록
  - 관리자 페이지 `Feedback` 탭에서 최신 목록 조회

## 기술 스택

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `sharp`
- `@vercel/blob`
- `@upstash/redis`
- `pdfjs-dist`
- `recharts`
- `JSZip`
- `file-saver`

## 환경 변수

### 1. Blob 업로드/결과 저장

이미지 업로드와 최적화 결과 저장에 필요합니다.

- `BLOB_READ_WRITE_TOKEN`

주의:

- Blob 설정이 없으면 `/api/upload`, `/api/compress`가 정상 동작하지 않습니다.

### 2. 관리자 통계 / 피드백 저장

대시보드 통계와 피드백 저장에 필요합니다.

- `KV_REST_API_URL` 또는 `UPSTASH_REDIS_REST_URL`
- `KV_REST_API_TOKEN` 또는 `UPSTASH_REDIS_REST_TOKEN`

주의:

- Redis 설정이 없으면 관리자 통계는 비활성화됩니다.
- Redis 설정이 없으면 피드백 등록/조회/삭제도 정상 동작하지 않습니다.

## 로컬 실행

1. 의존성 설치

```bash
npm install
```

2. 환경 변수 준비

- Vercel 프로젝트를 연결했다면:

```bash
vercel env pull
```

- 또는 `.env.local`에 직접 필요한 값을 넣어도 됩니다.

3. 개발 서버 실행

```bash
npm run dev
```

4. 브라우저 접속

```txt
http://localhost:3000
```

## 빌드 / 린트

```bash
npm run lint
npm run build
```

## 프로젝트 구조

```txt
src/
  app/
    admin/page.tsx
    feedback/page.tsx
    api/
      compress/route.ts
      events/route.ts
      feedback/route.ts
      upload/route.ts
  components/
    AdminDashboard.tsx
    FeedbackForm.tsx
    ImageOptimizer.tsx
    PdfToPngConverter.tsx
    ToolWorkspace.tsx
  lib/
    analytics.ts
    feedback.ts
    redis.ts
  utils/
    compression.ts
    download.ts
```

## 운영 메모

- 피드백 API
  - `GET /api/feedback`
  - `POST /api/feedback`
  - `DELETE /api/feedback`
- 피드백 관련 서버 로그 prefix:
  - `[feedback-api]`
  - `[feedback]`
- 이미지 최적화는 서버에서 Blob 원본을 가져와 재인코딩한 뒤 결과를 다시 Blob에 저장합니다.

## 현재 제한 사항

- 이미지 입력은 현재 `PNG/JPG/JPEG`만 지원합니다.
- PDF to PNG 결과는 항상 ZIP으로 내려갑니다.
- 대용량 PDF는 브라우저 메모리 사용량이 커질 수 있습니다.
- 관리자 대시보드 차트는 탭 전환 시 레이아웃 계산 타이밍에 따라 Recharts 경고가 일시적으로 보일 수 있습니다.
