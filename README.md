# OptiStream

Next.js 기반 파일 최적화 도구입니다. 현재는 두 가지 작업 모드를 제공합니다.

- `Image Optimizer`: PNG, JPG, JPEG 이미지 최적화
- `PDF to PNG`: PDF 각 페이지를 PNG로 변환 후 ZIP으로 다운로드

## 주요 기능

### 1. Image Optimizer

- 지원 형식: `PNG`, `JPG`, `JPEG`
- 파일당 최대 크기: `20MB`
- 동시 처리: 최대 `2개`
- 출력 형식:
  - `ORIGINAL`
  - `PNG`
  - `JPEG`

#### 이미지 최적화 모드

- `Screenshot`
  - 텍스트 가독성을 우선하는 스크린샷 최적화
- `Photography`
  - 일반 사진 중심 압축
- `Web Engine`
  - 웹 배포용 경량화 중심 처리
  - `가로 px`, `세로 px`를 직접 입력 가능
  - 예: `1200 x 1263`
  - 두 값을 모두 입력하면 해당 크기 캔버스 안으로 `contain` 방식 리사이즈 적용
  - 하나라도 비어 있으면 원본 비율 유지
- `Lossless`
  - 품질 손실을 최소화하는 보수적 최적화

#### 처리 방식

- 업로드는 `Vercel Blob` direct client upload 사용
- 서버에서는 `sharp`로 최적화 수행
- 결과 파일이 원본보다 더 크면 원본을 유지
- 결과 파일은 Blob URL로 다운로드

### 2. PDF to PNG

- 지원 형식: `PDF`
- 입력 PDF 최대 크기: `20MB`
- 브라우저에서 PDF를 렌더링
- 각 페이지를 PNG로 변환
- 결과는 `ZIP` 파일 하나로 다운로드

## 기술 스택

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `sharp`
- `@vercel/blob`
- `pdfjs-dist`
- `JSZip`
- `file-saver`

## 배포 전제

이 프로젝트는 현재 `public Blob store` 기준으로 동작합니다.

필수 환경변수:

- `BLOB_READ_WRITE_TOKEN`
- `BLOB_STORE_ID`

주의사항:

- `Production`과 로컬 환경변수는 같은 public Blob store를 가리켜야 합니다.
- Blob 설정이 없으면 `/api/upload`, `/api/compress`가 정상 동작하지 않습니다.

## 로컬 실행

1. 의존성 설치

```bash
npm install
```

2. Vercel 환경변수 가져오기

```bash
vercel env pull
```

3. 개발 서버 실행

```bash
npm run dev
```

4. 브라우저 접속

```txt
http://localhost:3000
```

## 빌드

```bash
npm run build
```

## 현재 UX 구조

- 상단 `Mode Configuration`에서 작업 모드 전환
  - `Image Optimizer`
  - `PDF to PNG`
- 이미지 최적화 화면 내부에서 세부 최적화 모드 선택
  - `Screenshot`
  - `Photography`
  - `Web Engine`
  - `Lossless`

## 제한 사항

- 이미지 입력은 현재 `PNG/JPG/JPEG`만 지원합니다.
- PDF to PNG 결과는 현재 항상 `ZIP`으로 내려갑니다.
- 대용량 PDF는 입력 크기가 20MB 이하라도 페이지 수와 해상도에 따라 브라우저 메모리 사용량이 커질 수 있습니다.
