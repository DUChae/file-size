# OptiStream: High-Performance Serverless Image Optimization Engine

OptiStream은 Next.js 14+와 고성능 이미지 처리 엔진인 **Sharp**를 결합하여 웹 환경에 최적화된 고압축 이미지 처리 도구입니다. 서버리스 환경의 물리적 제약을 극복하고, 시각적 품질은 유지하면서 웹 서비스의 성능(LCP)을 혁신적으로 개선하기 위해 개발되었습니다.

## 🌟 핵심 기술 하이라이트

### 1. 지능형 청크 업로드 시스템 (Advanced Chunked Upload)
Vercel Serverless Function의 4.5MB Payload 제한을 우회하기 위해 독자적인 아키텍처를 도입했습니다.
*   **Recursive Chunking**: 클라이언트에서 대용량 파일을 1MB 단위의 Base64 스트링으로 분할 전송.
*   **Stateless Reassembly**: 서버의 `Map` 객체를 활용한 메모리 내 조각 수집 및 최종 바이너리 합성.
*   **Overhead Control**: Base64 인코딩 시 발생하는 약 33%의 용량 증가분을 고려한 안정적인 통신 설계.

### 2. 정밀 압축 전략 (Intelligent Compression)
이미지의 시각적 품질은 유지하면서 바이너리 수준에서의 데이터 중복을 제거합니다.
*   **PNG 최적화**: `Palette Reduction` 기술을 통해 색상 수를 256개로 최적화하여 투명도는 유지하되 용량은 최대 90% 이상 절감.
*   **JPEG 최적화**: 동일 품질 대비 더 높은 압축률을 제공하는 `mozjpeg` 엔진을 사용하여 추가적인 용량 절감 수행.
*   **Adaptive Resizing**: 4K 이상의 고해상도 이미지를 장치 환경에 맞춰 스마트하게 리사이징 (2560px / 2000px / 1200px).

### 3. 고성능 큐 관리 (Concurrency Queue Management)
브라우저의 메인 스레드 점유를 방지하고 서버 부하를 안정적으로 관리합니다.
*   **Concurrency Control**: 최대 2개의 병렬 작업만 허용하는 Promise 기반 풀(Pool) 구현.
*   **State Machine**: `queued` → `uploading` → `compressing` → `done` 상태를 실시간으로 추적하여 유연한 UI 피드백 제공.

## 📈 성능 지표 (Performance Result)
*   **고해상도 스크린샷 (10.7MB)** → **최적화 결과 (243KB)**: 약 **97.8% 용량 절감**
*   **평균 처리 시간**: 2~4초 (청크 분할 및 서버리스 콜드 스타트 포함)

## 🚦 압축 프리셋 (Optimization Presets)
*   **Screenshot**: 텍스트 엣지 보존 및 가독성 최우선 (품질 82).
*   **Photography**: 자연스러운 그라데이션과 질감 보존 (품질 75).
*   **Web Engine**: 로딩 속도 극대화를 위한 공격적 압축 (품질 65 + 리사이징).
*   **High Quality**: 메타데이터 제거 및 무손실에 가까운 압축 (품질 92).

## 🛠 기술 스택
*   **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
*   **Engine**: Sharp (C++ 기반 고성능 이미지 프로세싱)
*   **Utilities**: JSZip, FileSaver.js
*   **Infrastructure**: Vercel (Serverless Functions)

## ⚠️ 제약 사항 및 정책
*   **파일 제한**: 최대 10개 파일, 단일 파일 최대 20MB.
*   **지원 포맷**: JPG, JPEG, PNG 전용.
*   **용량 역전 방지**: 압축 결과가 원본보다 클 경우 자동으로 원본 파일 유지.
*   **보안**: 이미지는 서버 메모리에서만 임시 처리되며, 처리 즉시 삭제됩니다. (Zero-Disk Persistence)

## 💻 로컬 개발 환경 설정
1. 저장소 클론 및 패키지 설치
   ```bash
   npm install
   ```
2. 개발 서버 실행
   ```bash
   npm run dev
   ```
3. 브라우저에서 `http://localhost:3000` 접속

## 📄 라이선스
이 프로젝트는 개인 포트폴리오 및 내부 도구용으로 제작되었습니다.
