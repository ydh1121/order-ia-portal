# R1 견적 초안·공통 모달·작업공간 연결

## 기준 원문과 범위

- R1 코멘트 `3806e136-5714-43af-bc9e-108608c8da86`: 간편/상세 각 최근 하나의 작성 내용, 모드 전환 시 보존, 가져가기는 기본 해제.
- 최신 사용자 실행 지시: 웹 QA는 정규 소스와 실제 테스트 DB에서 검증한다.
- 저장된 사업장 Q3 선택창과 가격 작업공간 팝업은 봉인된 `web/common-ui.mjs`의 `OrderModalShell`을 직접 사용한다. Q3 선택창은 `OrderCopyDialog.create`의 실제 구조와 공통 거래 버튼을 사용한다.
- 기존 `r3-product-sources.mjs` 원문은 수정하지 않는다. 서버에서 명시한 문자열이 각각 정확히 한 번 존재할 때만 adapter를 붙인다. 원문 marker가 다르면 응답을 실패 처리한다.

## 서버 초안

`r3-quote-draft-client.mjs`는 실제 `ORDER_APP_ADAPTER.request('/drafts/simple|detailed')`에 연결한다. 정규 서비스의 `order_quote_draft` 기본 키는 계정·모드이고, 한 모드의 새 저장은 같은 행을 갱신한다. QA에서는 같은 서비스가 전용 lab DB의 실행별 namespace와 서버 선택 역할을 사용한다.

앱의 기존 직렬 local writer는 검증, 사적 편집 중인 모달, canCommit 취소 경계를 계속 소유한다. 서버에는 앱의 `projectStoredPayload(bodyCheckpoint())`만 전달한다. 일반 입력이 멈추거나 원본 저장이 완료되면 서버 동기화를 요청한다. 빈 첫 화면 열람은 행을 만들지 않는다. 모드 전환은 원본 local 저장과 서버 저장을 모두 확인한 뒤 이동한다.

서버·현재 입력이 다를 때 자동으로 덮지 않는다. 처음 연결한 local 입력이 있거나 늦은 응답 사이에 입력이 바뀌었거나 409가 발생하면 현재 입력을 유지하고 사용자 선택을 기다린다. 서버 초안을 선택하거나 현재 입력을 서버의 새 revision으로 저장할 수 있다. 불확실한 저장 응답은 동일한 requestKey와 원문 payload로 먼저 재시도한다.

간편→상세 선택적 복사는 기존 `copySimpleLine`과 체크 해제 기본값을 유지한다. 복사 대상의 local revision/token과 서버 revision을 모두 확인한다. 상세 모드의 두 내용이 다르면 복사를 중단하고 먼저 확인하도록 한다. 비회원은 서버 초안과 저장 사업장 UI를 장착하지 않는다.

## 테스트 DB 경계

- saved business와 price 작업공간은 `ORDER_APP_CONTEXT.endpoints.role/price`를 사용한다.
- 발급 견적 상세 조회도 같은 context의 price endpoint를 사용한다.
- 발급 견적의 납품·상담·가격 재열람 경로는 `labRun`과 `persona`를 유지한다.
- 비회원 결과는 기존 인증 gate를 유지한다. lab iframe의 존재를 회원 권한으로 취급하지 않는다.
- 실제 회원 권한이나 상업용 승인 상태를 초안 저장으로 부여하지 않는다.

## 공통 디자인 연결

`r3-workspace-theme.mjs`는 기존 ds/ops CSS의 색상, 글꼴, 버튼, 입력 shell, 선택 입력과 제품 공통 모달 geometry를 작업공간의 기존 표 구조에 연결한다. 기준 catalog CSS 해시는 `188e6d699e2f027d96d57a412ef9fc6e0eda883cd035148afbf234629b729c8f`이다. 페이지별 새 파랑/회색 팔레트 및 가격 팝업의 별도 160ms 나타남 모션을 제거했다. 모달 열기/닫기·역사·스크롤 잠금·포커스는 원본 `OrderModalShell`만 실행한다.

입력 표의 열 너비, 규격 필터, 날짜 버전, 포장/운임 연결과 기존 152개 가격은 변경하지 않는다. 신규 CSS는 데이터 모델을 변경하지 않는다. 실제 모바일/PC 표시 품질은 아래 Chrome 시나리오와 배포 검토에서 별도로 판단한다.

## 현재 검증

로컬 자동검사:

- 관련 unit 33개 통과: 원본 152개, 서버 예약 시각, 가격 충돌/멱등성, business 계정 격리, Q3 취소, 서버 초안 각 모드 한 행, 두 탭 409 보존, 응답 유실 재시도, 늦은 초기 읽기 방어, opt-in 복사, 실제 공통 모달 lifecycle, 테스트 DB 가격 조회 및 URL 경계.
- `tests/r3-price-workspace-dom.mjs`: 실제 제품 `OrderModalShell`을 불러온 상태에서 가격 편집·운임 CRUD·트리·선택·저장/예약·재시도 전체 통과.
- `tests/r3-bundled-clients.mjs`: Wrangler keepNames 변환 뒤 네 초기화 경로 통과. DOM harness에서는 정확히 지정한 모듈 import 한 줄을 분리하고, 실제 module/CSP 로드는 Chrome 검사에서 확인한다.

Chrome:

- `tests/r3-quote-draft-browser.py` 추가. 실제 Pages/인증/제품 API와 별도 SQLite lab DB를 사용하는 host에서 간편·상세 새로고침, opt-in 기본 해제 및 복사, 모드 격리, 역할 격리, 409 입력 보존, 명시 해결, Q3 공통 모달, 사업장 320/390/768/1440 폭을 검사한다.
- 이 기록 시점에는 실제 Chrome 실행 결과가 아직 없다. 로컬 Chromium socket 제한 때문에 CI/배포 검수가 필요하다.
- 구현/단위검사/실Chrome/배포/사용자 수락은 별개이다. 이 파일은 USER_PASS 또는 실거래 완료를 주장하지 않는다.
