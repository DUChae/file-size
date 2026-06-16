# 독립 서버 마이그레이션 가이드 (Standalone API Server)

본 가이드는 현재 Next.js(Vercel) 기반으로 구현된 URL 캡처 및 압축 기능을 사내 독립 서버(Linux/Node.js 환경)로 이전하기 위한 기술적 로드맵을 제공합니다.

---

## 1. 서버 환경 및 기술 스택
클라우드 종속성(Vercel Blob, Serverless Functions)을 제거하고 범용적인 환경으로 구성합니다.

*   **Runtime:** Node.js (v20 이상 권장)
*   **Framework:** Express.js 또는 Fastify (가볍고 빠른 백엔드 구축)
*   **Process Manager:** PM2 (서버 상시 가동 및 자동 재시작 관리)
*   **Core Libraries:**
    *   `sharp`: 이미지 크롭 및 압축 처리
    *   `axios` / `node-fetch`: 외부 API(ScreenshotOne) 통신
    *   `cors`: 프론트엔드 도메인 허용 설정

---

## 2. 핵심 로직 변경 사항

### 2.1 스토리지 (Storage)
Vercel Blob 대신 서버의 로컬 파일 시스템을 사용합니다.
*   **변경 전:** `@vercel/blob` (put/del)
*   **변경 후:** `fs-extra` 또는 Node.js 기본 `fs` 모듈 사용
*   **경로:** `/var/www/optistream/captures/` 같은 특정 디렉토리를 지정하여 관리합니다.

### 2.2 API 엔드포인트 통합
Next.js의 개별 라우트 파일들을 하나의 Express 앱으로 통합합니다.
*   `POST /capture`: ScreenshotOne 호출 후 서버 로컬 디스크에 저장
*   `POST /compress`: 로컬 파일을 읽어 Sharp로 처리 후 저장 및 URL 반환
*   `GET /download/:id`: 저장된 파일을 정적 리소스로 서빙하거나 스트림으로 전송

---

## 3. 인프라 설정 (Linux/Nginx)

### 3.1 Nginx 리버스 프록시
프론트엔드(Next.js)와 백엔드(독립 서버)를 연결하고 SSL을 처리합니다.
```nginx
server {
    listen 443 ssl;
    server_name api.your-company.com;

    location / {
        proxy_pass http://localhost:4000; # Node.js 앱 포트
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 정적 이미지 파일 서빙 최적화
    location /captures/ {
        alias /var/www/optistream/captures/;
        expires 1h;
    }
}
```

### 3.2 임시 파일 자동 삭제 (Cron Job)
서버 용량 관리를 위해 생성된 지 1시간이 지난 임시 이미지를 자동으로 삭제합니다.
```bash
# 매시간 0분에 실행: 60분보다 오래된 파일 삭제
0 * * * * find /var/www/optistream/captures/ -mmin +60 -type f -delete
```

---

## 4. 보안 및 인증

1.  **CORS 설정:** 회사의 실제 서비스 도메인(`https://your-service.com`)만 API를 호출할 수 있도록 화이트리스트를 관리합니다.
2.  **API Key 인증:** 서비스 간의 직접 통신이므로, 단순하지만 강력한 `X-API-KEY` 헤더 기반 인증 레이어를 추가하여 무단 호출을 방지합니다.
3.  **Rate Limit:** `express-rate-limit` 패키지를 사용하여 IP당 요청 횟수를 서버 단에서 직접 제한합니다.

---

## 5. 단계별 마이그레이션 순서

1.  **Repo 초기화:** 사내 GitLab/GitHub에 새 Node.js 프로젝트 생성
2.  **로직 이관:** `src/app/api/...` 내부 코드를 Express용 컨트롤러로 변환
3.  **환경변수 설정:** `.env` 파일에 API Key 및 로컬 저장 경로 설정
4.  **서버 배포:** `git pull` -> `npm install` -> `pm2 start app.js`
5.  **프론트엔드 수정:** `src/components/UrlCaptureOptimizer.tsx` 내부의 API 호출 주소를 새 서버 주소로 변경

---

## 💡 추가 고려 사항 (자체 캡처 엔진 구축 시)
나중에 ScreenshotOne API 비용을 아끼고 싶다면, 서버에 직접 **Puppeteer**를 설치할 수 있습니다.
*   **필요 작업:** 리눅스 서버에 한글 폰트(`fonts-nanum`) 설치 및 Chrome 헤드리스 패키지 의존성 해결
*   **장점:** 비용 무료, 캡처 속도 제어 가능, 내부망 사이트 캡처 가능
*   **단점:** 서버 리소스(CPU/RAM) 소모가 큼

본 문서가 향후 원활한 기능 이전의 나침반이 되길 바랍니다. 추가적인 구현 코드가 필요하시면 언제든 요청해 주세요!
