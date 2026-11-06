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
