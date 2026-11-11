# MSG0566 / MSG0570 실행 경계

기존 WO-ORDER-IA-PORTAL-R0-R1-20261015-001, PR1,
fix/ia-decision-parity-20261101에서 계속한다. 원본 등록/코드 검사/실제 표시/
시각 검수/사용자 선택/정규본 통합은 별개다.

## 이번 코드

- 기존 MSG0560 메뉴 후보와 정확한 P29 IN_REVIEW 분류를 보존한다.
- 기획 등록 5건은 원문 메타데이터와 별도 rework overlay로 유지한다.
- UX R3 2건은 PRODUCER_DELIVERED / RECEIVED_PENDING_PLANNING 후보다.
  기존 R1/R2 tuple과 등록 최신 포인터를 덮어쓰지 않는다.
- source_refs의 문자열/객체, URL/역할/상대 근거 경로를 보존한다.
- 버전 이력은 자료 계열별로 표시한다. MASTER 과거 원본 미확보는 UX R2에 적용하지 않는다.
- 모든 원본의 preview_allowed=false, latest_verified_browser=null,
  selected/integrated=null을 유지한다.
- 회사 전환은 불변 UX 상위 wrapper가 소유한다. IA는 외부
  order.ia.viewer/1 / ux-r3-observer-1을 검증하며 내부 child로 우회하지 않는다.

## 비공개 원본 제공 상태

qa-provider.mjs는 승인된 서버 제공자를 연결하기 위한 비활성 어댑터다.
IA_QA_PRIVATE_SOURCE 서비스 binding과 IA_QA_PRIVATE_SOURCE_ENABLED=true가
동시에 있어야 사용한다. 이 이름은 코드 계약이며 현재 운영 binding이 아니다.
이번 작업은 서비스, Worker, binding, OAuth scope, credential, 공유 권한을
생성하거나 변경하지 않는다. 현재 실제 제공 경로는 미연결이다.

요청은 등록된 artifact_id/version/drive_file_id/entrypoint로만 한정한다.
브라우저 쿠키나 인증정보를 제공자에 전달하지 않는다. 제공자 응답에는 고정
identity 헤더가 필요하다. 패키지 32MiB, 개별 진입점 8MiB, ZIP 전체 확장
64MiB/256파일을 넘기지 않으며 패키지와 진입점 SHA256을 각각 검증한다.
제공자 binding이 없으면 verify는 PRIVATE_SOURCE_UNAVAILABLE을 반환한다.

## 실행 연결의 미완료 항목

현재 인증 페이지는 nonce-only script CSP와 default-src 'none'을 유지한다.
외부 패키지를 실행하는 private HTTP document transport는 아직 없다.
qa-host/qa-viewer의 srcdoc 코드는 비활성 준비 단계다. srcdoc은 부모 CSP를
상속하므로 iframe csp를 설정하는 것만으로 부모 제한을 풀 수 없다.
따라서 이 코드가 불변 UX wrapper를 실제 실행할 수 있다고 표시하지 않는다.
부모 CSP를 unsafe-inline으로 완화하거나 allow-same-origin을 추가하지 않는다.
실행 가능한 전송 방식과 CSP 조합은 별도 허용 범위와 실제 브라우저 증거가
필요하며, 현재 API는 어떤 등록 버전에도 activation/원본 HTML을 반환하지 않는다.

R3 observer의 ready/applied/accepted는 수신 규약 상태다. Node 또는 VM에서
합성 사건이나 실제 bridge 소스를 대조한 결과는 제품 부팅이나 브라우저 격리
수락이 아니다. 실제 부팅과 4프리셋이 선행한 뒤 24렌더, 320px, 실제200%,
키보드/폰트/모션 및 쿠키·storage·API 차단을 검사해야 한다.

기존 브라우저 정책 차단을 다른 브라우저·호스팅·터널·정책 완화로 우회하지
않는다. 사용자에게 개발 서버 설치나 개발자도구 조작을 요구하지 않는다.

## 게시 제한

같은 브랜치 push 직전 Cloudflare 기존 order-ia-portal의 자동 preview=none,
실제 HEAD 및 동시 변경 여부를 재조회한다. main/production/Access/기존 배포는
변경하지 않는다. 새 preview 게시도 승인되지 않았다. 이 문서는 새 배포나
사용자 수락을 허가하지 않는다.

## 2026-11-07 SAME0566 고정 R3 연결 준비 보충

위 미연결 기록을 완료로 바꾸지 않는다. 기존5등록·두 접수후보·배지·R1/R2
재작업·preview=false를 보존한다. MSG0571은 IA 기획 수신이다.

qa-r3-document-profile.mjs는 등록 원장을 수정하는 파일이 아니라 고정 원본
둘의 SHA/진입점에 바인딩한 전달 준비 sidecar다. 디자인 상위 wrapper와
내장 child의 실행 스크립트·importmap 8개, 표시 자료 4개의 정확한 해시를
기록했다. 원본 HTML/CSS/44모듈/폰트는 이 저장소에 복사하거나 hotfix하지 않았다.

qa-r3-runtime.mjs의 prepareR3Document는 패키지/진입점/ZIP/baseline을 검증하고
별도 바이트 복사본과 HTTP 문서용 헤더 후보를 만든다. 새 HTTP endpoint나
사용 가능한 URL을 만들지 않는다. srcdoc에 스크립트를 주입하지 않는다.
스크립트 unsafe-inline/eval 없이 고정 script hash(디자인만 data module 허용),
HTTP sandbox allow-scripts, connect/worker/object/form 차단을 준비했다.
기존 포털의 nonce CSP·production 설정은 그대로다. 이 헤더 후보가 실제
부모·중첩 프레임에서 집행되는지는 NOT_RUN이며, 기술적 검증 전에 수락하지 않는다.

/api/ia/qa/readiness는 기존 OWNER 인증 뒤 고정 tuple의 미충족 조건만 반환하는
읽기전용 코드 경로다. 원본 읽기·OAuth 발급·권한 부여·runtime URL 생성·등록
승격을 하지 않는다. 서버 binding 존재도 주체/권한/바이트/격리 검증과 구별한다.
진단 요청 성공(200)은 뷰어 준비 성공이 아니다. document endpoint는 없다.

DESIGN은 order.ia.viewer/1 / ux-r3-observer-1 / canonical parent만 허용하며
회사 버튼은 package 소유다. COPY는 DISPLAY_ONLY이고 외부 ready API나
엔진/서버 취소를 구현했다는 뜻이 아니다. 상세 카피·프리셋 의견 선택과
실행 버튼도 이 차이를 따르도록 수정했다. 다른 브리지는 만들지 않았다.

### 정확한 남은 조건과 담당

- 계정 소유자 + IA 기획/총괄: 기존 Pages 실행 주체와 원본2ZIP/2HTML에 대한
  최소 읽기 권한을 명시한다. 연결된 ChatGPT Drive 사용 권한은 Pages 권한이
  아니다. 기존 Sheets OAuth의 spreadsheets.readonly를 Drive 권한으로 사용하거나
  scope/공유/secret을 임의 변경하지 않는다. 새 Worker·서비스 생성이 해법이 아니다.
- IA 실행: 위 주체가 승인된 다음 기존 Pages 내부 원본 어댑터를 연결하고,
  OWNER 원본 조회와 credentialless/opaque 문서 전달의 실제 인증 경계를 완성한다.
  현재 service binding의 존재, HTTP 문서 라우트, 제한된 검수 grant는 미확보다.
- 총괄: 필요한 기존 canonical 한정 비공개 검수 게시 범위를 별도 결정한다.
  지금은 새 preview/main/production/Access 변경과 게이트 해제를 허용하지 않았다.
- IA 실행 → UX: 동일 원본/host/격리의 실제 URL 확보 후 native boot와 회사
  원본→IBM→Linear→Vercel→원본, 이후24렌더를 수행한다. Node 결과로 대체하지 않는다.

표시 source contract와 기술 참고를 구분한다. CSP의 srcdoc 정책 상속은
https://www.w3.org/TR/CSP/ 의 policy-container 규칙을 참고했다. Drive blob
다운로드는 https://developers.google.com/workspace/drive/api/guides/manage-downloads
의 files.get alt=media 및 실제 content-read 권한 조건을 참고했다. 문서 검토는
현재 서비스 계정의 Drive 권한 또는 실제 브라우저 동작을 증명하지 않는다.
