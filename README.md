# OptiStream - High-Performance Media Optimization Suite

## 1. 프로젝트 개요

**OptiStream**은 웹 서비스의 성능 최적화를 위한 지능형 이미지 압축 엔진과 사용자 프라이버시를 최우선으로 하는 클라이언트 사이드 PDF 변환 도구를 제공하는 올인원 미디어 유틸리티 플랫폼입니다. 서버리스 아키텍처의 제약을 기술적 설계로 극복하여 대용량 파일 처리와 실시간 분석 기능을 동시에 제공합니다.

## 2. 주요 타겟 및 기대 효과

- **웹 개발자:** 이미지 리소스 최적화를 통한 웹사이트 로딩 속도 개선 및 대역폭 비용 절감.
- **일반 사용자:** 보안이 중요한 PDF 문서를 서버 전송 없이 브라우저 내에서 안전하게 이미지로 변환.
- **서비스 운영자:** 실시간 대시보드를 통해 미디어 처리 현황 및 성능 지표를 한눈에 파악.

## 3. 기술 스택

- **Core:** Next.js 16 (App Router), TypeScript, React 19
- **Processing:** Sharp (Image), PDF.js (PDF), JSZip
- **Storage/DB:** Vercel Blob (Media), Upstash Redis (Analytics/Feedback)
- **Styling/UI:** Tailwind CSS 4, Recharts, Lucide React

## 4. 핵심 기능

- **Intelligent Image Compression:** 4가지 맞춤형 모드(Screenshot, Photo, Web, Lossless) 제공.
- **Client-Side PDF to PNG:** 브라우저 엔진 기반 변환으로 데이터 보안성 확보 및 서버 부하 제거.
- **Real-Time Admin Dashboard:** 방문자 통계, 작업 성공률, 누적 절감 용량 실시간 시각화.
- **Integrated Feedback System:** 사용자 의견 수집 및 관리자를 위한 피드백 관리 인터페이스.

## 5. 주요 기술 및 문제 해결

- **Serverless Payload Limit 해결:** Vercel API Route의 페이로드 제한을 해결하기 위해 클라이언트에서 Vercel Blob으로 직접 업로드하는 "Direct-to-Blob" 패턴을 구현하여 20MB 이상의 대용량 파일 처리를 안정화했습니다.
- **Efficiency in Re-encoding:** `sharp` 라이브러리의 스트림 및 버퍼 최적화를 통해 연산 시간을 단축하고, 결과물이 원본보다 클 경우 자동으로 원본을 유지하는 스마트 로직을 적용했습니다.

## 6. 설치 및 실행 방법

```bash
# 저장소 복제
git clone <https://github.com/your-username/optistream.git>

# 의존성 설치
npm install

# 환경 변수 설정 (.env.local)
# BLOB_READ_WRITE_TOKEN=
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=

# 개발 서버 실행
npm run dev
```

## 7. 성능 개선 및 운영 경험

- **데이터 최적화:** 이미지 최적화 알고리즘을 통해 평균 60~80%의 파일 용량 감소율을 기록했습니다.
- **인프라 비용 관리:** PDF 변환 로직을 클라이언트로 이전함으로써 서버 연산 비용을 100% 절감하고 응답 속도를 향상시켰습니다.

## 8. 테스트 및 품질 관리

- **Type Safety:** TypeScript를 전면 도입하여 데이터 인터페이스의 일관성을 유지하고 런타임 에러를 최소화했습니다.
- **Error Logging:** Redis를 활용한 커스텀 에러 로깅 시스템을 구축하여 작업 실패 원인을 실시간으로 추적하고 수정할 수 있는 환경을 마련했습니다.

## 9. 협업 경험 (또는 개발 회고)

- **독립적 문제 해결:** 기획부터 배포까지 1인 개발로 진행하며, 서버리스 인프라의 제약 조건을 아키텍처 설계로 해결하는 능력을 배양했습니다.
- **사용자 중심 설계:** 피드백 시스템을 통해 실제 사용자의 불편 사항을 데이터로 수집하고 이를 기능 개선에 즉각 반영하는 사이클을 경험했습니다.

## 10. 향후 계획 및 비고

- **포맷 확장:** AVIF, WebP 등 최신 고효율 이미지 포맷 지원 확대.
- **배치 처리:** 여러 파일을 한 번에 업로드하고 병렬로 처리하는 Batch 모드 추가 예정.
- **PWA 지원:** 오프라인 상태에서도 PDF 변환 기능을 사용할 수 있도록 PWA 전환 검토 중.