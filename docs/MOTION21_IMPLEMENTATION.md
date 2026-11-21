# ORDER — 미반영 3개·보완 18개 구현 대조표

작성: 2026-11-21 · 작업 기준: release10 main `e5f97029b58d1f1d90bb910bebfed7237e84e2bb` 이후 작업 트리

이 문서의 대상은 **정확히 21개**다. 기준은 `evidence/ORDER_MOTION_AND_RELEASE10_REVIEW_20261121.md`의 「원문별 전체 모션 판정 — 운영09 기준」이며, 그 표의 기존 판정을 그대로 옮겼다. 감사 당시 소스 기준은 `af5ece3e75bfb3cf723a5cab80a3f486aa9e8c11`이다. 이번 구현, 로컬 검사, 외부 서비스 연결, 새 브라우저 관측을 구분한다.

- **미반영 3개:** M07, M17, M23.
- **기능상 미흡 18개:** M01, M02, M04, M05, M06, M08, M09, M10, M12, M15, M16, M18, M20, M21, M22, M25, M26, M27.
- 기존 반영 6개인 M03·M11·M13·M14·M19·M24와 별도 File drop 보안 1개는 이 21개 집계에 넣지 않는다. 원문의 중복 하단 패널 요구는 기존 감사와 같이 M16 하나로 묶는다.

**실제 RAF 브라우저 CI는 아직 미확인이다.** 아래의 통과 결과는 로컬 단위·통합검사 결과다. JSDOM의 측정 대역, 제어된 RAF, in-memory SQLite, 격리 QA transport의 확인 범위를 운영 화면의 실제 렌더링이나 외부 기관 성공으로 확대하지 않는다. 이 문서 작성으로 배포·사용자 의견·해결·승인 상태가 바뀌지 않으며 `USER_PASS=0`을 유지한다.

기존 감사 원본: [운영09 상세 감사](https://drive.google.com/file/d/1EwS9-F3mpW32Ap1ySWpZf_id72ePovUj/view), [요구 대조표 JSON](https://drive.google.com/file/d/1zFb8AJxXgImwG9-cI6qhMxv5iOsWK7Bc/view).

## 1. 연결 구조와 검사 표기

[공유 제품 bootstrap][boot]이 공통·관리자·업무 모션을 설치한다. 제품과 QA 문서가 같은 canonical module을 소비하며, QA의 데이터·성공·실패·지연 상태는 [별도 메모리 transport][fixture]가 제공한다. 문서별 공통 listener와 각 mount의 AbortSignal 수명을 구분한다. QA host/frame의 상태·의견 제어 코드를 제품 모션의 소유자로 바꾸지 않는다.

다음 검사 파일은 이 문서 작성 중 로컬에서 통과를 확인했다. 총 67개는 서로 다른 집중 검사 묶음의 합이며, 배포 후보 전체 CI 결과를 뜻하지 않는다.

| 표기 | 파일 | 확인 결과와 범위 |
|---|---|---|
| U1 | [r3-common-motion.test.mjs][u1] | 12/12. 측정 기반 스켈레톤, 리사이즈·FLIP 중단, IME·삭제, 드롭다운 닫힘·키보드, 태그 폭, 토글 실패 복원, 휠·패널·기존 select payload. 실제 브라우저 픽셀 측정은 아님. |
| U2 | [r3-common-role.test.mjs][u2] | 2/2. 인증 역할 페이지의 상담 생성→실제 handler 조회, 공개 switch의 503 복원→SQLite 저장→새로고침. |
| U3 | [r3-consultation-motion.test.mjs][u3] | 1/1. canonical 상담의 load/create/submit, 입력 유지·잠금·재시도, fixture GET의 targets/date/memo 재조회와 복사본 변경 격리. |
| U4 | [r3-evidence-signature.test.mjs][u4] | 6/6. 실제 handler의 서명 결속·권한·원자성·변조 거절·legacy 읽기, 실제 편집기의 동일 픽셀 재시도. |
| U5 | [r3-role.test.mjs][u5] | 10/10. 역할·사업장 범위, revision, 증빙 보관·조회·서명된 재검토 첨부, 실패·재시도 회귀. |
| U6 | [product-admin-motion.test.mjs][u6] | 13/13. 주입 데이터 기반 지표·메뉴·위젯·링·문서 목차·축소 모션·공유 authored 연결. |
| U7 | [product-experience.test.mjs][u7] | 13/13. 권한이 있는 실제 SQLite handler의 대시보드·배치·영수증·청구·게시 문서·사업자 인증 계약. 국세청 응답은 제어된 test fetcher. |
| U8 | [product-workflow-motion.test.mjs][u8] | 10/10. 실제 업무 UI와 fixture/SQLite adapter의 저장·재조회·오류·중단, 숫자·서명 입력, 사업자 확인 후 파일 전달. |

브라우저 검사는 **작성·갱신되어 있으나 실제 RAF CI 결과 미확인** 상태다.

| 표기 | 검사와 관측 대상 |
|---|---|
| B1 | [r3-common-motion-browser.py][b1]: 390px 일반/축소 모션. 실제 Range, 크기 역전환, 덱 FLIP, 입력, 닫힘, 태그, 휠, 하단 패널 RAF. |
| B2 | [r3-workflow-motion-browser.py][b2]: 390px 일반/축소 모션. compiled review 문서의 사업자 확인→등록증 전달, 두 영수증 모델·인쇄 모션·드래그 복원, 청구, 서명 제출. |
| B3 | [r3-admin-motion-browser.py][b3]: 390/1440px 일반 모션 및 390px 축소 모션. 지표·메뉴·사이드바·뎁스·위젯·링·목차의 실제 프레임. |
| B4 | [r3-business-feedback-browser.py][b4]: 개업일 경계·실제 휠, 추천, 추가 요청 공백 제외 grapheme 500자, 잘못된 파일 거절, 실제 서명·업로드 재시도. |
| B5 | [r3-navigation-browser.py][b5]: 덱·태그·측정 스켈레톤, canonical 상담 대상·달력·18시 제한·같은 폼 복원·fixture 접수. |
| B6 | [r3-business-menu-browser.py][b6]: 실제 역할 화면 검색·메뉴·공개 switch API 연결. |

로컬 Chromium은 환경의 `socket() failed: Operation not permitted`로 실행을 완료하지 못했다. 새 RAF 수치·스크린샷·후보 CI 성공을 이 문서에서 만들어 기록하지 않는다. 기존 release10 인증 시트의 과거 RAF 결과는 이번 21개 변경의 검증 결과로 재사용하지 않는다.

## 2. 공통 입력·카드·패널 — 9개

| ID·요구 | 기존 판정 | 이번 실제 연결과 코드 | 확인한 검사 | 외부 조건·관찰 미완료 |
|---|---|---|---|---|
| M01 Skeleton loader and reveal | 기능상 미흡 | [common][common] `skeleton()`이 실제 텍스트 노드의 `Range.getClientRects()`를 측정하고 응답 교체·크기 변경을 다시 측정한다. [async][async]의 실제 Promise pending/reveal에 연결. authored passes의 loading도 실제 카드 글자 위치를 사용한다. | U1의 실제 크기 입력 대역·응답 교체·실패 정리. B1·B5 준비. | 새 브라우저의 폰트·줄바꿈별 측정 일치와 reveal 중간 프레임 미확인. 빈 영역에 가상의 문장 막대를 만들지 않는다. |
| M02 Card resize | 기능상 미흡 | [common][common] `resize()`가 취소 전에 현재 painted rect를 읽고 새 목표로 이어 간다. [브랜드 계정 메뉴][brand] `resizeMotion`/`pageTransition`이 긴 콘텐츠·뒤로 가기에서 이 제어를 소비한다. | U1 중간 높이에서 역전환·오래된 완료 무효화. B1 준비. | 실제 계정 패널 Q3/Q4·긴 한글·폭별 중간 프레임과 빠른 연속 입력 관찰 미완료. |
| M04 Springy input | 기능상 미흡 | [common][common] `bindInputs()`의 grapheme mirror가 삽입·삭제·뒤 글자 이동만 움직인다. native 값·selection·IME를 보존하고 비밀번호는 bullet로 표시한다. [async][async]의 기존 input 전체 이동을 제거했다. | U1 조합 중 무애니메이션·확정 입력·삭제·커서·비밀번호 마스킹. B1 준비. | 실기기 한글 조합기·모바일 커서·긴 다중행의 시각적 정합은 새 브라우저/기기 확인 필요. |
| M05 Swipe deck | 기능상 미흡 | [customer controls][customer] `deckLayout()`이 같은 카드의 전후 rect를 FLIP하며 중간에 역전환할 수 있다. [role client][role]와 [navigation][navigation]의 격자↔날짜순 덱 전환에 연결했다. | U1 카드 identity·진행 중 rect 역전환. B1·B5·B6 준비. | 실제 CSS 회전·스케일이 함께 있는 여러 폭의 이동 연속성, 손가락 스와이프 중 전환 관찰 미완료. |
| M06 Spring dropdown + Menu dropdown | 기능상 미흡 | [common][common] `dropdown()`이 opening/closing과 mounted exit를 소유한다. `nativeSelects()`는 지원 브라우저의 base-select picker 또는 native 값과 연결된 combobox를 사용한다. [business][business] 추천, [navigation][navigation] 태그, [role client][role]의 이전 datalist 사용처를 연결했다. | U1 close→빠른 reopen, 살아 있는 옵션의 키보드 focus, native FormData 값. B1·B4 준비. | 실제 Chromium의 picker, 위·아래 배치, OS/브라우저별 기본 select의 최종 렌더링 확인 필요. |
| M12 Tag input | 기능상 미흡 | [common][common] `tagInsert()`가 spring 진입·이웃 위치를 처리하고 `tagRemove()`가 occupied width/padding을 줄인 뒤 제거한다. 실제 견적 검색과 authored 추천 태그에 연결했다. | U1 제거 완료 전 폭·주변 DOM identity. B5·B6의 추천·IME·Backspace 회귀 준비. | 긴 한글·중복·다수 태그의 줄바꿈 이동과 실제 삭제 중간 폭 RAF 미확인. |
| M15 Toggle switch + Toggle | 기능상 미흡 | [common][common] `persistedSwitch()`가 저장 Promise·pending 중복 방지·실패 rollback을 처리한다. [role client][role]의 **Order 메뉴 공개**가 실제 `/publication` 저장과 서버 revision을 사용한다. | U1 실패/성공, U2 인증 API 503→재시도→DB→새로고침, B6 준비. | 확인 범위는 실제 공개 설정과 공통 primitive다. 제품의 모든 종류의 설정 토글을 개별 실운영에서 관측한 상태는 아니다. |
| M16 하단 패널 / Smooth drawer + Panel reveal | 기능상 미흡 | [common][common] `bottomPanel()`의 동일 DOM·focus trap·scroll lock·드래그/역전환을 실제 role 상담 및 [navigation][navigation]에 연결했다. [adapter][adapter]가 workspace의 최신 견적·단일 BUYER 사업장 범위를 다시 확인한 뒤 create→submit한다. QA도 같은 계약을 사용하며 create context를 clone 보존한다. | U1 패널 수명, U2 실제 상담 생성/조회, U3 target/date/memo fixture readback·재시도·복사 격리. B1·B5 준비. | 저장하는 것은 희망 상담 요청이다. 실제 담당자의 일정 확정·외부 캘린더 예약은 포함하지 않는다. 이번 상담 입장/닫힘 RAF 미확인. 운영10 인증 transform 수정은 별도 선행 변경. |
| M18 휠 피커 / Wheel picker | 기능상 미흡 | [common][common] `wheel()`의 20° 원통, 관성, 제한된 경계 저항, settle을 [business][business] 개업일·[navigation][navigation] 상담 시간에 연결했다. 가격 예약의 기존 `.pw-wheel[size]` select도 같은 제어를 사용하고 원래 값·payload를 유지한다. | U1 관성·저항·disabled option·cleanup·native FormData, B1·B4·B5 준비. | 실제 touch/wheel 프레임, 모바일 브라우저 성능, 모든 예약 사용처의 시각 검수 미완료. 날짜·가격 모델을 새 값으로 대체하지 않는다. |

## 3. 관리자·문서 탐색 — 7개

| ID·요구 | 기존 판정 | 이번 실제 연결과 코드 | 확인한 검사 | 외부 조건·관찰 미완료 |
|---|---|---|---|---|
| M07 Stat card | **미반영** | [admin motion][admin] `mountChart(...,false)`가 독립 point spring을 왼쪽부터 갱신한다. [authored admin][authored-admin]이 실제 `/dashboard` 데이터를 주입하며 [experience][experience]는 권한 범위의 구매·환불 데이터를 집계한다. | U6 point 지연·정착 후 RAF 종료, U7 다중 OPERATOR 범위와 타사 제외. B3 준비. | 실제 운영 매출 집계값 대조와 기간 전환 RAF 미확인. 참조 데모의 숫자·자동 순환을 실제 데이터로 표시하지 않는다. |
| M09 Sidebar collapse + Learn more hover | 기능상 미흡 | [admin motion][admin] `mountSidebar()`가 너비·아이콘·라벨 지연을, `mountDepth()`가 중첩 메뉴 높이·inert·펼침을 처리한다. 지정 Learn more의 두 화살표 팔을 메뉴에 적용한다. [authored admin][authored-admin]과 signed 메뉴가 소비한다. | U6 메뉴 native 링크·focus·화살표 구조와 authored 통합 회귀. B3에 sidebar/depth 중간 프레임 검사 작성. | 너비·라벨 stagger·뎁스 반복 접힘의 실제 RAF 결과는 아직 없음. |
| M10 Morph tooltip의 메뉴 배경 이동 | 기능상 미흡 | [admin motion][admin] `mountNav()`가 선행/후행 변의 비대칭 spring indicator를 signed `#role-menu`와 관리자 메뉴에 적용한다. hover·focus·키보드·메뉴 DOM 재구성을 반영한다. | U6 signed 링크·indicator 중간값·focus·재설치·destroy. B3 준비. | 실제 PC 포인터의 빠른 왕복·스크롤·폭 변화에서 배경 연속성 관찰 미완료. |
| M17 약관 / Scroll Index | **미반영** | [account][account] terms가 `/policies/:id`의 게시된 제목·version·sections를 textContent로 표시한다. [admin motion][admin] `mountScrollIndex()`가 실제 heading 위치로 눈금·현재 위치·scrub을 구성한다. [experience][experience]는 `policy/PUBLISHED` 문서만 공개한다. | U6 실제 문서 측정·scroll·scrub·QA 본문 표시·미게시 동의 잠금, U7 비회원 게시 원문 조회·미게시/잘못된 문서 거절. B3 준비. | **2026-11-21 운영 조회: ORDER_QA_DB의 `kind=policy`, `state=PUBLISHED` 문서 0개.** 정식 원문 게시 전에는 오류·재시도·동의 잠금을 유지한다. QA는 명시한 dummy 본문이다. 실브라우저 목차 관찰 미완료. |
| M20 관리자 Widget/Bento grid | 기능상 미흡 | [admin motion][admin] `mountWidgets()`가 pointer lift/tilt·FLIP·키보드 재배치와 너비 변경을 처리한다. [authored admin][authored-admin]이 `/settings/dashboard-layout`의 revision·request key·재조회 계약으로 저장한다. | U6 일치하는 응답만 commit·불일치 rollback·pointer cancel, U7 실제 저장·actor 격리·revision·idempotency. B3 준비. | 실제 drag 도중 역방향·여러 viewport·운영 저장/재접속 관찰 미완료. |
| M22 그래프 hover / Metric card | 기능상 미흡 | [admin motion][admin] `mountChart(...,true)`가 서버 날짜·값에 맞춰 포인터/툴팁·범위 선택을 움직인다. 키보드와 Shift 범위 선택도 같은 데이터 좌표를 사용한다. | U6 정확한 날짜·값·범위 합계·키보드, U7 실제 dashboard 집계. B3 준비. | 실제 포인터 추적·터치·툴팁 가장자리 clipping·운영 값 대조 미완료. |
| M23 원형 그래프 / Spending ring | **미반영** | [admin motion][admin] `mountRing()`이 금액별 SVG arc를 만들고 각도·속도·spring 회전, 포인터·키보드 선택을 연결한다. `/dashboard`의 실제 segments를 사용한다. | U6 서로 다른 arc·각도 drag·키보드 선택·축소 모션, U7 권한 내 segments 집계. B3 준비. | 실제 각도 관성·중간 회전 프레임과 운영 분류별 금액 대조 미확인. |

## 4. 실제 업무 저장·발급·인증 — 5개

| ID·요구 | 기존 판정 | 이번 실제 연결과 코드 | 확인한 검사 | 외부 조건·관찰 미완료 |
|---|---|---|---|---|
| M08 Loading to success | 기능상 미흡 | [async][async] `motion.run()`의 실제 Promise 결과를 [workflow][workflow] 사업자 확인·영수증·청구, [evidence client][evidence-client] upload→attach 전체 작업, 상담 요청에 연결했다. pending 중복·실패·같은 request key 재시도를 공유한다. 영수증·청구의 화면 중단은 transport signal로 연결한다. | U1 요청 실패, U2/U3 실제/fixture 요청, U4 업로드·attach 재시도, U8 문서 발급·저장 실패·중단. B1·B2 준비. | 실제 버튼 수축·스피너·success 중간 RAF 미확인. 외부 서비스가 실패하면 성공 모션으로 완료하지 않는다. |
| M21 영수증 발급 / Receipt printer | 기능상 미흡 | [workflow][workflow] `receiptPaper()`와 receipt UI가 [experience][experience] `/receipt-options`·`/receipts`를 사용한다. **오더→공급사/사업장**, **공급사→사업장** 모델별 권한·발급번호·원본 구매 revision·문서 digest를 저장하고 같은 문서를 다시 연다. | U7 두 모델·권한·미결제 거절·immutable snapshot·request 재사용, U8 UI 발급/재열기와 실제 SQLite handler, B2의 두 모델·paper drag 준비. | 배출·당김 저항·복귀는 DOM/WAAPI 번안이며 원본 linefeed·tear·Verlet pendulum 전체는 이식하지 않았다. 실제 운영 발급·print/프린터 출력 미확인. 이메일·세금계산서는 별도 업무다. |
| M25 서명 / Signature pad | 기능상 미흡 | [workflow][workflow] `signaturePad()`가 spring pen·입력 대체·clear를 제공한다. [evidence client][evidence-client]는 마지막 360×100 서명 페이지를 봉인한다. [signature parser][signature]·[evidence handler][evidence]가 문서/서명/packet digest·서명 ink·동의 version을 검증하고 서버 actor/case와 `evidence-signature` 기록을 원자 결속한다. | U4 정상 서명·서명/동의 누락·바꿔치기·권한·rollback·legacy·동일 봉인 재시도, U5 reprice 첨부, U8 pointer/typed 서명. B2·B4 준비. | 이번 연결은 **가림 처리한 거래 증빙의 제출 서명**이다. 계약 원문·계약 상대방·계약 버전·별도 본인확인·체결 상태를 가진 전자계약 절차는 아직 연결하지 않았다. 실제 pen RAF·운영 업로드 미확인. |
| M26 별도 청구 / Amount pad | 기능상 미흡 | [workflow][workflow] `amountDigits()`의 자리별 spring·콤마/삭제 이동과 keypad를 `/billing/accounts`의 실제 거래 계정 선택에 연결했다. [experience][experience]가 draft 저장·재열기·revision·발급번호·발급 후 불변 문서를 처리한다. | U7 위조 계정·잘못된 날짜·분수 금액 거절·draft/issue·범위 변경, U8 실패 유지·계정 선택·동일 문서 재열기. B2·B3 준비. | **발급 기록은 `deliveryStatus=NOT_SENT`, `paid=0`.** 발송·결제·수납은 후속 업무로 남아 있다. 실제 digit/콤마 RAF와 운영 청구 관찰 미확인. |
| M27 사업자 검증 / Card field 개량 | 기능상 미흡 | [workflow][workflow] `mountBusiness()`가 번호·상호·대표자·개업일·업태·업종을 받아 실제 case와 `/business-verifications`를 호출한다. [experience][experience]는 NTS validate 입력/응답을 결속하고 계속사업자 여부를 판단한다. 등록증은 별도 편집·업로드를 계속 요구하며 먼저 선택한 파일을 재사용한다. | U7 키 부재·client 성공 위조 거절·NTS 응답/요청/재시도·권한 철회/사업장 변화, U8 입력 보존·실패 후 등록증 경로·파일 전달. B2·B4 준비. | **2026-11-21 설정 이름 조회: production·preview 모두 `NTS_SERVICE_KEY` 미설정. 실제 국세청 호출은 미확인.** 키/기관 오류 시 503/오류를 유지하며 QA 결과는 `QA_FIXTURE`로 표시한다. 기관 조회 성공과 등록증 검토 완료를 합치지 않는다. |

## 5. 보존·운영 관찰의 남은 경계

이번 기록은 기존 09 감사의 6/18/3 분류를 다시 작성하거나, 운영10 핀 해결 기록을 새 판 승인으로 복사하지 않는다. 모션 구현에 따른 새 소스·hash·배포·보호 데이터 비교는 root의 최종 후보 검증에서 별도로 확정해야 한다. 실제 고객/공급사/사업장의 데이터 쓰기를 새 검사의 전제조건으로 삼지 않는다.

서명은 누락·blank·잘못된 크기·digest 불일치·권한·DB 실패를 거절하는 실제 handler 검사를 통과했다. 기존 서명 결속이 없는 legacy 파일의 읽기는 유지하되, 새 header만으로 과거 파일에 서명 완료를 만들어 붙이지 않는다. File drop의 전체 요구, 누적 quota, 미연결 객체 정리 정책 등은 별도 보안 감사 범위를 계속 따른다.

기존 소개 화면 글꼴 cursor396의 실제 한글 렌더링 비교는 이 21개 작업으로 해결 판정하지 않는다. 새 browser artifacts의 실제 프레임·동일 노드·focus·닫기·오류 결과를 확인한 뒤 각 관찰 미완료 칸을 갱신해야 한다.

## 6. 참조 스킬과 출처

Transitions.dev `skills/transitions-dev/SKILL.md`와 실제 recipe를 읽고 적용했다. 공통 구현은 01-card-resize, 05-menu-dropdown, 07-panel-reveal, 14-skeleton-reveal, 27-toggle을 대조했다. 목적별 token, 다른 요소의 모션 소유, closing 정리, reduced motion, paint 중 역전환을 검사했다. 관리자·업무 참조의 별도 적용 범위는 통합 출처 문서에 기록한다.

고정 참조는 Transitions.dev `add5b467b13be16664d10fd888330ce2f3288b07`, Kokonut UI `655ec61161aff87721e4c60c3cc4dc3329f3e80e`다. DesignBookmark는 보존한 원문 HTML/embedded script를 대조했다. 원본과 번안의 차이·사용한 기법은 [통합 출처 문서](MOTION_SOURCES.md), 라이선스·상세 출처는 [공통 모션 NOTICE][common-notice], [관리자 모션 NOTICE][admin-notice]를 따른다. Transitions.dev snippets/skills의 라이선스와 MIT tooling을 구분하며, 원본 전체 라이브러리를 제품 기능으로 재배포하지 않는다.

[boot]: ../src/server/product-ui/bootstrap.mjs
[fixture]: ../src/server/r3-ui/qa-fixture-adapter.mjs
[common]: ../src/server/r3-common-motion.mjs
[async]: ../src/server/r3-async-motion.mjs
[brand]: ../src/server/order-engine/browser/brand-account-menu.mjs
[customer]: ../src/server/r3-customer-controls.mjs
[role]: ../src/server/r3-role-client.mjs
[navigation]: ../scripts/r3/authored/navigation.js
[business]: ../scripts/r3/authored/business.js
[adapter]: ../src/server/product-app-adapter.mjs
[admin]: ../src/server/product-admin-motion.mjs
[authored-admin]: ../scripts/r3/authored/admin-common.mjs
[account]: ../scripts/r3/authored/account.js
[experience]: ../src/server/product-experience-operations.mjs
[workflow]: ../src/server/product-workflow-motion.mjs
[evidence-client]: ../src/server/r3-evidence-client.mjs
[signature]: ../src/server/evidence-signature.mjs
[evidence]: ../src/server/r3-evidence.mjs
[common-notice]: ../src/server/r3-common-motion.NOTICE.md
[admin-notice]: ../src/server/product-admin-motion.NOTICE.md
[u1]: ../tests/r3-common-motion.test.mjs
[u2]: ../tests/r3-common-role.test.mjs
[u3]: ../tests/r3-consultation-motion.test.mjs
[u4]: ../tests/r3-evidence-signature.test.mjs
[u5]: ../tests/r3-role.test.mjs
[u6]: ../tests/product-admin-motion.test.mjs
[u7]: ../tests/product-experience.test.mjs
[u8]: ../tests/product-workflow-motion.test.mjs
[b1]: ../tests/r3-common-motion-browser.py
[b2]: ../tests/r3-workflow-motion-browser.py
[b3]: ../tests/r3-admin-motion-browser.py
[b4]: ../tests/r3-business-feedback-browser.py
[b5]: ../tests/r3-navigation-browser.py
[b6]: ../tests/r3-business-menu-browser.py
