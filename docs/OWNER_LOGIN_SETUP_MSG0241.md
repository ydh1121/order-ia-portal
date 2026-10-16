# IA 포털 본인 계정 로그인 · MSG-20261016-0241

기존 **order-ia-portal** Cloudflare Pages와 PRIVATE `ydh1121/order-ia-portal`만 사용한다. 신규 Pages/Worker/DB/도메인/Google Cloud 프로젝트는 만들지 않는다.

## 운영자 1회 설정
1. 본인 Windows PC에서 Node.js 22 이상을 설치하고 PRIVATE 저장소의 `scripts/GENERATE_OWNER_SECRETS.cmd`를 직접 실행한다. 또는 `node scripts/generate-owner-secrets.mjs`를 실행한다. 출력되는 무작위 비밀번호는 **본인 비밀번호 관리자에만 저장**하고, 출력된 두 인증 비밀값은 채팅·GitHub·Google 공유 문서에 올리지 않는다.
2. 기존 Cloudflare 대시보드 → Workers & Pages → **order-ia-portal** → Settings → **Variables and Secrets** → **Production** → Add에서 다음을 설정한다.
   - `IA_OWNER_EMAIL` — Text — 로그인에 사용할 본인 이메일 1개
   - `IA_OWNER_PASSWORD_VERIFIER` — **Encrypt** — 로컬 생성기의 PBKDF2 verifier
   - `IA_OWNER_SESSION_KEY` — **Encrypt** — 로컬 생성기의 32-byte 세션키
   - `IA_OWNER_LOGIN_ENABLED` — Text — 위 설정 후 `true`
   - `IA_GOOGLE_READ_ENABLED` — `false` 유지
3. Save 후 **기존 Git 연결 프로젝트의 main 배포**를 재배포하거나 비밀값이 적용된 새 배포에서 테스트한다. 새 프로젝트 생성 금지.
4. 로그인: `https://order-ia-portal.pages.dev/login.html`에서 이메일과 로컬 비밀번호 입력 → `/ia/`. 본인 계정으로 접속 후 로그아웃 확인.

비로그인 시: `/api/ia/screens` 403, `/api/ia/auth/me` 401, `/ia/` 및 심층 URL 로그인으로 리다이렉트; 내부 데이터 반환 금지. 키가 없을 때 로그인 POST는 503 (기본 계정 없음). 본인 인증 시에도 Google 권한이 없으면 IA 데이터 조회는 503. 메모 작성은 405 유지.

## 보안 범위/남은 검증
- PBKDF2-SHA256 salted verifier, WebCrypto HMAC 검증, OWNER ONLY, 600초 HttpOnly Secure SameSite=Strict 쿠키, Origin/CSRF 확인, no-store/CSP 적용.
- 로그인 실패 제한은 **인스턴스 메모리 기준 보조 제어**이며 모든 Cloudflare 엣지 사이에서 일관되지 않는다. 전역 속도제한은 기존 호스트에서 실제 지원되는 보안 기능이 확인될 때 따로 적용해야 한다.
- 공유 세션 DB를 새로 만들지 않았으므로 로그아웃 후 복제된 과거 쿠키는 남은 10분 동안 재사용될 수 있다. 모든 세션 즉시 폐기 시 `IA_OWNER_SESSION_KEY`를 교체한다.
- 공개 `public/`에는 범용 로그인 HTML/CSS/JS와 안전 랜딩만 있다. 기밀 76개 ScreenID, 25개 정책, 사용자 메모, 비공개 Drive 링크, 공급가격은 정적 배포에 포함하지 않는다.
- 기존 Sheets 읽기 전용 어댑터와 원본 자료는 그대로 유지한다. Google 실제 인증/화면 조회, 전체 내부 포털 시각 승인, 향후 메모 쓰기는 각각 **별도 수락**이다.

실제 운영자는 비밀값을 채팅에 제공하지 않는다. 이번 개발 테스트는 무작위 합성 계정으로 수행되었으며 Google 실서비스 로그인을 검증한 것이 아니다.
