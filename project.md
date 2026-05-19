# [이미지 최적화 도구 명세서]
# Next.js 기반 서버리스 이미지 최적화 도구 개발

---

# 0. 프로젝트 목표

본 프로젝트는 Next.js + Vercel 서버리스 함수를 활용한 이미지 최적화 도구를 개발하는 것을 목표로 한다.

## 주요 대상 이미지

- 웹페이지 캡처본
- 스크린샷
- UI 캡처
- 이미지가 혼합된 스크린샷 (텍스트 + 사진 혼재)

## 핵심 목표

- 사람의 육안 기준 체감 품질 유지
- 웹 첨부 기준 **500KB 이하** 달성을 목표로 함
- 이미지 용량 극단적 감소

## 처리 방식

- 압축 연산은 **Vercel 서버리스 함수(Node.js)** 에서 수행
- `sharp` 라이브러리 사용
- 이미지는 서버 **메모리에서만 처리**되며 디스크 저장 없음
- 함수 종료 즉시 메모리에서 삭제됨

---

# 1. 핵심 압축 철학

본 프로젝트는:

- 픽셀 단위 원본 보존

보다,

- 사람 눈 기준 체감 품질 유지

를 우선한다.

따라서 다음 기법을 적극 활용한다:

- sharp 기반 PNG 최적화 (palette reduction, compression level 최대화)
- sharp 기반 JPEG 재인코딩 (mozjpeg 엔진)
- metadata 제거 (EXIF, GPS, ICC Profile 등)
- 필요 시 adaptive resize

확대 비교 시 차이가 존재하더라도,

일반적인 웹 첨부 환경에서 품질 차이를 체감하기 어렵다면

공격적인 용량 절감을 허용한다.

---

# 2. 개발 환경 및 아키텍처

## Framework

- Next.js 14+
- App Router 기반

## Language

- TypeScript Strict Mode 필수
- `any` 타입 사용 금지

## Styling

- Tailwind CSS

## Deployment

- Vercel (Hobby 플랜 기준)
- **Static Export 사용 금지** (`output: 'export'` 사용 안 함)
- 서버리스 함수(Route Handler) 사용

## next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
};

export default nextConfig;
```

---

# 3. Vercel Hobby 플랜 제약 및 대응

## 제약사항

| 항목 | 제한 |
|---|---|
| 서버리스 함수 실행시간 | 최대 10초 |
| 메모리 | 1024MB |
| 요청당 payload | **4.5MB** |

## 4.5MB payload 제한 대응

이미지를 청크(chunk) 단위로 분할하여 전송:

1. 브라우저에서 이미지를 **Base64 청크로 분할**
2. 청크 단위로 서버리스 함수에 전송
3. 서버에서 청크를 메모리에서 조합
4. `sharp`로 압축 후 결과 반환
5. 함수 종료 즉시 메모리 해제

## 청크 크기

```ts
const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB
```

---

# 4. 아키텍처 구조

## 요청 흐름

```
브라우저
  └─ 이미지 청크 분할
  └─ POST /api/compress (청크 전송)
       └─ 서버리스 함수 (메모리에서 조합 + sharp 압축)
       └─ 압축 결과 반환 (Base64 or Blob)
  └─ 브라우저에서 파일로 저장
```

---

# 5. 출력 파일 구조 강제

반드시 아래 구조 유지:

```txt
app/
├── page.tsx
└── api/
    └── compress/
        └── route.ts

components/
└── ImageOptimizer.tsx

types/
└── image.ts

utils/
├── compression.ts   # 클라이언트: 청크 분할 및 전송
└── download.ts      # 클라이언트: 다운로드 처리

next.config.ts
package.json
```

---

# 6. 클라이언트 컴포넌트

브라우저 API 사용 컴포넌트는 반드시:

```ts
"use client";
```

사용.

---

# 7. 지원 포맷

## 지원 입력 포맷

- image/jpeg
- image/jpg
- image/png

## 포맷 변경 금지

포맷은 입력 포맷 그대로 유지:

- JPG → JPG
- JPEG → JPEG
- PNG → PNG

다음 포맷 제외:

- WebP
- AVIF

---

# 8. 업로드 정책

## 지원 방식

- Drag & Drop
- 다중 파일 선택

## 제외 기능

- Clipboard Paste 금지

## 최대 파일 개수

- 10개

초과 시:

- 에러 표시
- 초과 파일 Queue 추가 금지

## 최대 파일 크기

- 단일 파일 **20MB** 이하

초과 시 에러 표시.

---

# 9. 서버리스 압축 전략 (route.ts)

## 핵심

모든 압축은 `sharp` 라이브러리로 수행.

## 9-1. PNG 압축 전략

```ts
sharp(inputBuffer)
  .png({
    quality: 80,
    compressionLevel: 9,
    palette: true,
    colors: 256,
    dither: 1.0,
  })
  .withMetadata(false)
  .toBuffer();
```

### PNG 압축 철학

- palette reduction으로 색상 수 감소
- 캡처본/스크린샷에서 육안상 차이 없음
- 사진 영역 포함 시 dithering으로 보완

## 9-2. JPEG 압축 전략

```ts
sharp(inputBuffer)
  .jpeg({
    quality: 82,
    progressive: true,
    mozjpeg: true,
  })
  .withMetadata(false)
  .toBuffer();
```

### JPEG 압축 철학

- mozjpeg 엔진으로 동일 quality 대비 더 작은 용량
- 캡처본 텍스트 artifact 방지를 위해 quality 82 유지

## 9-3. 목표 압축 결과 (캡처본 기준)

| 원본 | 목표 결과 |
|---|---|
| 1MB 캡처본 PNG | 100KB ~ 300KB |
| 500KB 캡처본 PNG | 50KB ~ 150KB |
| 이미지 혼합 캡처본 1MB | 200KB ~ 500KB |
| 캡처본 JPG 800KB | 150KB ~ 350KB |

---

# 10. Resize 정책

## 기본 원칙

캡처본 및 스크린샷은 텍스트 가독성이 중요하므로 **기본적으로 리사이즈 하지 않음**.

## 예외적 Resize 적용

다음 경우에만 리사이즈:

| 원본 크기 | 자동 리사이즈 |
|---|---|
| 긴 변 4000px 이상 | 2560px |
| 긴 변 3000px 이상 | 2000px |

```ts
sharp(inputBuffer)
  .resize(maxWidth, maxHeight, {
    fit: "inside",
    withoutEnlargement: true,
  })
```

---

# 11. 용량 역전 방지 로직

압축 결과가 원본보다 더 큰 경우:

```ts
if (compressed.size >= original.size) {
  return originalFile;
}
```

반드시 원본을 최종 결과로 채택할 것.

---

# 12. Queue 시스템

각 파일은 다음 상태를 가진다:

```ts
type QueueStatus =
  | "queued"
  | "uploading"
  | "compressing"
  | "done"
  | "error";
```

---

# 13. Queue 타입 정의

```ts
interface QueueItem {
  id: string;
  originalFile: File;
  optimizedFile?: File;
  originalSize: number;
  optimizedSize?: number;
  reductionRate?: number;
  status: QueueStatus;
  error?: string;
}
```

---

# 14. 동시성 제한

서버 부하 및 브라우저 메모리 보호를 위해:

- 최대 **2개** 동시 처리

## 절대 금지

```ts
Promise.all(files.map(...))
```

무제한 병렬 처리 금지.

반드시 다음 중 하나 구현:

- Promise Pool
- Queue Worker
- Concurrency Limiter

---

# 15. 실패 복구 전략

특정 파일 압축 실패 시:

- 전체 Queue 중단 금지
- 실패 파일만 error 처리
- 나머지 Queue 계속 처리

---

# 16. UI / UX 디자인

## 스타일 방향

- Vercel 스타일
- 사내 툴 느낌
- 미니멀
- 전문적
- 밝은 무채색 기반

## 강조 색상

```txt
#0070f3
```

---

# 17. Drop Zone UI

상단 대형 Drop Zone 배치.

## 표시 문구

```txt
여기에 최적화할 PNG / JPG 파일들을 드래그하거나 클릭하여 선택하세요.

캡처본 및 스크린샷 최적화에 특화된 고압축이 실행됩니다.
```

---

# 18. 보안 강조 문구

반드시 표시:

```txt
🔒 이미지는 압축 처리 중에만 서버 메모리에 임시 존재하며,
처리 즉시 삭제됩니다. 서버에 저장되거나 기록되지 않습니다.
```

---

# 19. 실시간 Queue 테이블

## 컬럼

- 파일명
- 확장자
- 원본 용량
- 최적화 용량
- 절감률
- 상태
- 다운로드

---

# 20. 절감률 스타일

절감률은:

- 녹색
- Bold
- 강조 표시

예시:

```txt
-72%
-80%
```

---

# 21. 다운로드 시스템

## 지원 기능

- 개별 다운로드
- ZIP 일괄 다운로드 (jszip + file-saver)

## ZIP 다운로드 활성화 조건

전체 완료 시 ZIP 다운로드 버튼 활성화.

## ZIP 파일명 규칙

```txt
optimized_images_[timestamp].zip
```

---

# 22. 결과 파일명 규칙

```txt
원본명.optimized.ext
```

예시:

```txt
screenshot.png → screenshot.optimized.png
```

---

# 23. 성능 요구사항

다음 환경에서도 안정적으로 동작:

- 10개 파일 업로드
- 단일 파일 최대 20MB
- 저사양 노트북 브라우저

## 목표

- UI 끊김 최소화
- 메인 스레드 freeze 방지
- 안정적 메모리 사용

---

# 24. 코드 품질 요구사항

반드시 준수:

- TypeScript Strict
- any 금지
- TODO 금지
- pseudo code 금지
- import 생략 금지
- 실제 실행 가능한 코드만 출력
- 중복 함수 금지

---

# 25. AI 출력 형식 요구사항

반드시 포함:

- 전체 파일 코드 출력 (생략 없음)
- app/api/compress/route.ts (sharp 압축 로직 + 청크 조합)
- components/ImageOptimizer.tsx (청크 분할 전송 + Queue UI)
- utils/compression.ts (청크 분할 및 API 전송)
- utils/download.ts (ZIP + 개별 다운로드)
- types/image.ts (타입 정의)
- app/page.tsx
- next.config.ts
- package.json (dependencies 포함)

## 설명 최소화

반드시:

- production-level 실행 가능한 코드

만 출력할 것.
