# 연구 앱과 QA랩의 실행 경계

2026-11-22 구현 기록. 연구본은 이후 같은 빌드 전체를 정규본으로 승격하기 위한 단일 웹 앱이다. 현재 정규 `simple-r3`·`detailed-r3` 실행 경로는 유지한다. 이 문서는 구현 경계와 검증 방법을 설명하며, 전체 기능 완료·배포 완료·사용자 승인 기록을 대신하지 않는다.

## 진입점과 소유권

| 진입점·소스 | 소유하는 것 |
| --- | --- |
| `/ia?view=research-r3` → `functions/ia/[[path]].js` → `research-app/page.mjs` | 독립 실행 가능한 연구 앱 문서, 빌드가 고정된 자산 URL, 서버 접근 제어 |
| `research-app/application.mjs`, `routes.mjs` | 한 document·앱 instance·공통 헤더·세션·라우터, 페이지와 부모 패널의 관계 |
| `research-app/quote-workspace.mjs` | 같은 document 안에서 정규 견적 factory 장착, Q1–Q4 이동, 초안 연속성, 수명 정리 |
| `account-panels.mjs`, `business-panel.mjs`, `scene-panels.mjs`, `drawer.mjs` | 유지된 부모 화면 안에서 열리는 계정·사업장·하위 패널·시트 |
| `/ia?view=qa-lab` → `r3-ui/host.mjs` | 기존 검토 셸, 목록·상태 선택·비교 보기·의견·위치 지정·명시적 이력 보기 |
| `research-app/review-bridge.mjs`, `review-inspector.mjs` | 실행 중인 앱의 route·anchor 관찰과 검토 메시지 교환 |

QA랩의 프레임은 `research-r3` 앱 URL을 연다. 앱 내부에서 정규 견적을 다시 iframe으로 띄우거나 새 탭으로 넘기지 않는다. 검토 셸은 견적 계산·폼 모델·페이지별 헤더를 소유하지 않는다. 독립 실행과 QA 프레임 실행은 같은 앱 자산을 사용한다.

공통 브랜드는 앱의 `#order-app-header`에 한 번 장착한다. 기존 문서에서 가져온 브랜드·빈 헤더는 구성 경계에서 제거하고, 기존 내용·동작 모듈을 장착한다. 간편·상세는 같은 workspace에 각 원본 모드를 주입한다. `inspectRoute()`로 명시적으로 선택한 QA 상태만 별도 fixture 모델을 만들며, 앱 안에서 이동할 때는 작성 중인 모델을 유지한다.

검토 목록·핀·미해결 개수는 기본적으로 해결된 의견을 제외한다. 기존 이벤트와 핀을 지우지 않으며 이력 보기와 재열기는 유지한다. 위치 지정은 검토 패널 안에서 시작하고 돌아오며 작성 중인 지시사항을 보존한다. 현재 검토의 화면 목록에는 Q2를 명시한다. 과거 검토 자산은 사용자가 이력을 열 때만 재생한다.

QA의 모아 보기·모바일/PC 비교는 URL의 `preview` 값으로 구분하고, 견적의 `mode=simple|detailed`과 혼용하지 않는다. 기존 `mode=board|dual` 링크는 과거 보기 형식으로만 해석한다. 모아 보기의 보조 frame에서 자동 상태 전환이 발생해도 사용자가 선택한 주 검토 화면을 바꾸지 않는다.

## 정규 소스 재사용과 provenance

견적의 봉인 기준은 `ydh1121/order`의 **`fd2ecddf71bf0548099bcc728219eac0d9d7da46`**이다. `r3-product-sources.mjs`의 `quoteCommit`, `quoteSourceHashes`, `quoteFiles`가 기준이다. 연구 endpoint는 정규 endpoint가 제공하는 기존 확장 소스를 받은 뒤 연구 전용 연결 경계만 적용한다.

구현 중 정규 저장소의 `main` **`a5eec9e3c108b40940a65a617000855a2b00f8fa`**와 다시 비교했다. 봉인 기준 이후 세 commit의 변경은 IANA 참조 manifest와 원문 자산이며, 견적·전화·이메일·주소 실행 소스는 동일하다. 연구본은 해당 정규 commit의 IANA `2026112100` 원문 1,435개 TLD와 manifest를 해시로 검증해 사용한다. 참조 provenance는 `regular-iana-reference.mjs`에 보존한다. 정규 경로의 기존 자산은 변경하지 않는다.

| 기능 | 실제 재사용 소스 | 연구본에서 바뀌는 경계 |
| --- | --- | --- |
| 간편·상세 견적, 규격·수량·주기·검증·계산 | 봉인 `web/app.mjs`, `simple-quote-contract.mjs`, `quantity-contract.mjs`, `cadence-contract.mjs`, `q4-validation.mjs`, `src/engine/*` | document·storage·transport·navigation 주입, 외부 공통 헤더 사용, 장착 해제 |
| 전화 입력·정규화 | 봉인 `phone-browser.mjs`, `validation/phone.mjs`, `phone-rules.mjs`, `contact-ui.mjs` | 공통 services owner와 필드 수명 연결 |
| 이메일 형식·추천·IANA·DNS 판정 | 봉인 `validation/email*.mjs`, `email-browser.mjs`, `dns-browser.mjs`, `iana-browser.mjs`, `contact-ui.mjs` | 고정 IANA 자산 주소, transport·시간·수명 주입 |
| 주소 입력·선택·provenance | 봉인 `address-contract.mjs`, `address-service.mjs`, `address-ui.mjs` | 연구 전용 인증된 검색 endpoint 주입 |
| 주소 검색 서버 | 위 정규 commit의 `functions/api/address/search.js` | 동일 handler를 `regular-address-handler.mjs`로 보존하고 owner 세션·CSRF wrapper 추가 |
| 모드별 저장·복사·복원 | 봉인 `web/storage.mjs`, 기존 `r3-quote-draft-client.mjs`, `quoteDraftBridge.restore` | 연구 namespace와 연구용 sync 저장 공간 주입 |
| 저장 사업장 선택·관리 | 기존 `r3-saved-business-client.mjs`, 포털 `product-ui/business-directory.mjs` | 같은 adapter 사용, 공통 전화·이메일·주소 필드 연결, 비동기 검증 경계 |
| 브랜드·공통 모션·기존 화면 | 포털 `order-engine/browser/*`, `product-ui/catalog.gen.mjs`, `runtime.gen.mjs` 등 | 앱 공통 헤더 소유, scene/runtime 분리와 부모 패널 장착 |

`regular-service-assets.mjs`의 `regularServiceSourceIdentity()`는 원본 SHA256과 봉인 후 제공 소스 SHA256을 함께 기록한다. `contact-ui.mjs`에는 기존 IANA URL 치환이 있으므로 두 해시가 같다고 가정하지 않는다. 사업장 bridge는 `BUSINESS_SOURCE_IDENTITY`에 원본 controller·연구 controller·markup 해시와 변경 경계를 기록한다. 주소 handler의 commit·Git blob·SHA256은 `research-address-api.mjs`의 `researchAddressOrigin`에 있다.

`quote-source-adapter.mjs`와 사업장 source adapter는 예상 marker가 정확히 일치할 때만 변환한다. 기준 소스가 달라지면 조용히 다른 코드에 패치하지 않고 실패한다. 현재 정규 endpoint에 연구 변환을 적용하지 않는다.

## transport와 저장 경계

`environment.mjs`는 연구 fixture adapter를 구성하고 세션 데이터를 연구 sessionStorage에 보존한다. 일반 연구 namespace는 `research:v1`이다. 명시적 검토 시나리오는 견적의 `:fixtures` namespace를 사용한다. 기록판 검사 세션은 build가 포함된 별도 namespace를 사용한다.

견적의 모든 일반 fetch를 그대로 통과시키지 않는다. `createResearchQuoteTransport()`는 다음만 허용한다.

| 요청 | 처리 |
| --- | --- |
| 빌드에 속한 `/ia/research-assets/<build>/…` GET·HEAD | 정적 자산 fetch |
| context에 선언된 role endpoint의 `/businesses` GET | 주입된 `adapter.roleRequest()` |
| context에 선언된 price endpoint의 `/quote?id=…` GET | 주입된 `adapter.priceRequest()` |
| 그 외 정규 API 직접 접근·임의 POST·외부 자산 URL | 거절 |

`ORDER_APP_ADAPTER`, `ORDER_APP_CONTEXT`, `ORDER_QUOTE_DRAFT_SYNC`는 견적 workspace의 가상 scope다. 다른 앱의 전역 adapter나 sync를 가져다 쓰지 않는다. 정규 메뉴의 `/api/order/features` 조회는 외부 헤더 모드에서 장착되지 않으며 견적 transport의 허용 목록에도 없다.

`quote-repository.mjs`는 **원본 `createBrowserStorage`와 schema·commit·revision·idempotency 검증**을 사용한다. 앱 작성 내용과 원본 sync client용 연구 저장 공간을 서로 다른 key prefix로 두되 모두 `order.app.<namespace>:` 안에 저장한다. `/drafts/simple`·`/drafts/detailed`는 이 repository의 요청 계약이며 실제 정규 DB로 전송하지 않는다. 정규 저장 키와 legacy session 초안을 이주하거나 덮지 않는다.

`saved-quote-panel.mjs`는 간편·상세 각각의 현재 작성 내용만 읽는다. 이어 쓰기는 저장 당시 revision/token을 확인한 뒤 workspace의 `restoreDraft()` → 원본 `quoteDraftBridge.restore()`로 처리한다. 새로운 발급 견적이나 여러 버전의 이력을 만들어 표시하지 않는다. 오래된 record를 선택하면 충돌로 돌려주고 현재 입력을 보존한다.

주소 검색은 별도 서비스 경계다. `/api/ia/research-address`는 owner 세션·동일 출처·CSRF를 확인하고 정규 주소 handler를 호출한다. 서버의 고정 Kakao 주소·장소 endpoint만 사용하며 키를 브라우저로 내보내지 않는다. 이메일의 형식·도메인 판정은 계정 소유권 또는 주문 권한을 부여하지 않는다.

## 현재판과 기록판의 같은 빌드 보장

`scripts/build-research-app.mjs`는 앱·재사용 소스의 digest와 브라우저 자산 묶음을 만든다. `scripts/seal-research-release.mjs`는 실제 제공 자산, row 목록, HTML shell을 `public/ia/research-releases/<build>.json.gz`로 한 번 봉인하고 `releases.gen.mjs`에 checksum을 추가한다. 이미 존재하는 build의 다른 bytes는 충돌로 거절한다. index 자체는 앱 source digest에서 제외한다.

실행 환경에서 index에 등록된 **현재 build와 이전 build 모두 봉인된 pack**을 사용한다. Worker 번들러의 `Function.toString()` 변환 때문에 현재 자산만 다시 직렬화하지 않는다. `env` 없는 raw 생성 경로는 봉인 수집·검사에 사용한다. 정규 배포의 검토·실행 경로는 `env`를 전달한다.

`release-store.mjs`는 압축 bytes 길이·SHA256, source digest, row index, 허용 자산 경로를 검증한다. 저장한 빌드나 자산이 없으면 최신 것으로 대체하지 않는다. HTML 재생 시 바꾸는 것은 nonce와 검증된 route/inspection 설정이다. `current` 검사 표시는 서버가 확인한 현재 digest에만 허용한다.

간편 견적과 mode가 없는 과거 검토 target hash는 기존 `['order-research-application/v1', build, row.id, width]`를 유지한다. 상세 검토만 이 배열 끝에 `'detailed'`를 추가하고 target·artifact·inspection에 `mode: 'detailed'`를 기록한다. 기록판 URL·실제 앱 시작 모드·검토 해시는 서로 일치해야 한다. 모드가 없는 과거 기록을 상세라고 추정하거나 수정하지 않는다. 기록판은 저장 당시 build를 연다. 압축 pack의 공개 URL은 404이며 인증된 Pages Function이 내부 `env.ASSETS` binding으로만 읽는다. 이력 조회가 기존 의견의 처리 상태나 사용자 판정을 바꾸지는 않는다.

## 화면 파일과 실행 링크

연구 앱의 `현재 화면 HTML`은 호스트가 승인한 frame session·build·target hash·route·mode·viewport와 현재 앱의 inspector를 대조한 뒤 `#order-single`을 복제한다. 같은 출처의 읽을 수 있는 CSS 규칙과 현재 입력·선택 상태를 담고, 네트워크 연결·스크립트·폼 제출·QA 표시를 제거한다. 비밀번호·인증 토큰·숨김 입력·선택한 파일 정보는 저장하지 않는다. 사용자에게 다운로드한 실제 HTML bytes의 SHA256과 검토 target만 감사 기록에 남긴다. 입력값이나 호스트의 코멘트·별도 구매 견적은 자동 전송하지 않는다.

`연구본 실행 링크`는 검토한 불변 build URL을 여는 HTML이다. 인터넷 연결과 접근 권한이 필요하다고 표시하며, 오프라인 실행 파일로 설명하지 않는다. 기존 개별 source의 내보내기는 기존 경로를 유지한다. `research-export-snapshot.test.mjs`는 저장 파일을 다시 파싱하고 실제 host 분기·비밀값 제거·해시·Worker 직렬화·기존 export 회귀를 검사한다.

## 같은 commit으로 정규 승격하는 절차

1. 화면별 복사본을 만드는 대신 단일 앱의 기능·부모 패널·운영 환경 주입까지 후보 commit에서 완성한다. 인증·견적 provider 등 아래 미연결 부분을 연결하려면 그 코드도 후보에 포함한다.
2. 최종 소스에서 연구 assets를 생성하고 release pack을 봉인한다. source·생성 자산·pack·index·필요한 배포 설정을 같은 후보 commit으로 고정한다.
3. 같은 commit에서 `build-research-app.mjs --check`, `seal-research-release.mjs --check`, 기존 manifest 검사, 자동검사, 실제 Pages 번들·크기 검사, 브라우저 QA를 수행한다. 봉인 후 소스가 바뀌면 새 build로 다시 검증한다.
4. 검증한 **같은 commit과 pack 전체**를 정규 release로 배포한다. 환경의 secret·binding은 명시한 운영 값으로 연결하고, 페이지별 HTML·계산 로직을 따로 재작성하지 않는다. 운영 환경 선택 코드를 검증 후 임의로 바꾸지 않는다.
5. 배포된 build digest·자산 bytes·업무 흐름을 재확인한다. 롤백도 이전 전체 build를 선택한다. 기존 pack·의견·사용자 판정은 보존한다.

현재 정규 경로를 자동 교체하는 승격 명령은 구현 완료로 간주하지 않는다. 연구 앱의 기본 composition은 fixture 환경이며, 운영 transport 선택과 실제 고객 인증 연결을 완료한 후보를 먼저 검증해야 한다.

## 남아 있는 외부 연결과 검증

| 항목 | 현재 코드가 보장하는 것과 남은 것 |
| --- | --- |
| 고객 로그인·가입·OTP | 입력·형식·도메인 UI를 재사용한다. `environment.auth.perform`이 없으면 `AUTH_PROVIDER_UNAVAILABLE`로 남는다. 메일 발송·OTP 확인·고객 계정 생성 성공을 만들지 않는다. 포털 owner 로그인은 고객 인증과 별개다. |
| 주소 provider | `KAKAO_REST_API_KEY`가 없거나 공급자 응답을 확인할 수 없으면 unavailable이다. 환경에 키가 실제 설정됐는지와 배포 후 공급자 연결은 별도 확인 대상이다. |
| 승인 가격·발급 견적 | 정규 quote request 계약을 유지한다. provider 미주입은 `APPROVED_SOURCE_NOT_CONNECTED`로 남는다. fixture 결과를 실제 발급이나 상업적 승인으로 해석하지 않는다. |
| 기존 설계 화면 | 기존 markup·runtime을 재사용한다. 동작 descriptor나 업무 서비스가 없는 scene은 미연결로 표시한다. 모든 catalog 상태의 실업무 연결 완료를 주장하지 않는다. |
| 실브라우저·배포·사용자 확인 | 각각 별도 결과가 필요하다. DOM 검사만으로 픽셀·모션·실제 서버·사용자 수락을 완료 처리하지 않는다. |

관련 자동검사는 `tests/research-application.test.mjs`, `research-quote-workspace.test.mjs`, `research-quote-repository.test.mjs`, `research-regular-services.test.mjs`, `research-scene-panels.test.mjs`, `research-address-api.test.mjs`, `research-release-store.test.mjs`, `research-host-integration.test.mjs`, `research-review-inspector.test.mjs`에 있다. 원본 factory·저장 계약·수명·동일 build 재생·transport 경계를 검사한다.

`.github/workflows/ia-r3-checks.yml`에는 Wrangler Pages Functions 빌드와 실제 multipart 업로드 크기 검사, `tests/research-application-browser.py` 실행이 포함돼 있다. 브라우저 검사는 독립 앱과 같은 앱의 QA 프레임, 공통 헤더 보존, 실제 견적 입력·모드 복사·새로고침, 위치 지정 등을 다룬다. **이 문서 작성 시 최종 후보 commit의 브라우저 CI·실배포 결과는 아직 확정하지 않았다.** 최종 결과와 증거는 동일 commit의 CI 기록으로 갱신한다.
