# 제품 모션의 출처와 적용 범위

기준일: 2026-11-21. 이 문서는 M01–M27, File drop, 기존 알림 플로팅 버튼의 Gooey 메뉴에 사용한 **참조 원본과 실제 구현 기법**을 기록한다. 기능 검증·실브라우저 관찰·사용자 수용 판정은 [구현 및 검증 매핑](MOTION21_IMPLEMENTATION.md)에서 별도로 관리한다. 출처가 있다는 사실만으로 원본과의 시각적 동등성이나 사용자 승인을 선언하지 않는다.

제품과 QA는 같은 `product-ui` 등록 모듈 및 공통 motion 함수를 사용한다. 실제 데이터·인증·저장은 제품 adapter가 담당하고, QA는 명시적인 메모리 fixture adapter를 사용한다. 레퍼런스의 예시 매출, 상점, 계정, 법률 문구와 자동 성공 타이머를 제품 데이터로 가져오지 않는다.

## 1. 고정한 원본

아래 표의 `K`, `T`, `G`, `D`는 뒤의 경로 표에서 사용하는 출처 약칭이다. Git 저장소의 파일 경로는 해당 **고정 커밋의 저장소 루트**를 기준으로 한다.

| 약칭 | 원본 | 고정 식별자 | 확인한 보관 경로 |
|---|---|---|---|
| K | [Kokonut UI](https://github.com/kokonut-labs/kokonutui/tree/655ec61161aff87721e4c60c3cc4dc3329f3e80e) | `655ec61161aff87721e4c60c3cc4dc3329f3e80e` | `references-20261121/kokonutui/source/` |
| T | [Transitions.dev](https://github.com/Jakubantalik/transitions.dev/tree/add5b467b13be16664d10fd888330ce2f3288b07) | `add5b467b13be16664d10fd888330ce2f3288b07` | `references-20261121/transitions.dev/source/` |
| G | [Libraries.dev](https://github.com/Jakubantalik/Libraries.dev/tree/14ae9d2dad18fcee251f4b06333b492a2a41d2ed) | `14ae9d2dad18fcee251f4b06333b492a2a41d2ed` | `references-20261121/Libraries.dev/source/` |
| D | [DesignBookmark Motion](https://designbookmark.com/motion) | 공개 Git 커밋은 확인하지 않았다. 보존된 원본 HTML과 추출 script의 내용을 확인했다. 파일별 SHA256은 아래 표에 기록한다. | `references-20261121/designbookmark-preserved/` |

보관 경로의 공통 상위 경로는 `/workspace/scratch/90acfe7b5d97/`이다. 장기 재사용 안내와 전체 소스 아카이브 링크는 [재사용 가이드](https://drive.google.com/file/d/1oqK-xt_5NxpYjv48shNPi6JFTlh-8qwv/view)에 있다. 가이드에 포함된 `GITHUB_SNAPSHOT.json`, `VERIFIED_MANIFEST.json`, `ARCHIVE_INDEX.json`으로 고정 커밋·Git blob·파일 모드·보관 ZIP의 SHA256을 확인할 수 있다. 전체 Git 이력이나 패키지 설치본을 보관했다는 뜻은 아니다.

### DesignBookmark 보존 파일

`*.original.html`의 스크립트는 `extracted/<이름>/script-01.original.js`, `script-02.original.js` 등에 원문대로 추출되어 있다. 공통 spring helper와 각 데모 로직을 함께 확인했다. 이 파일들에 Git 커밋을 임의로 부여하거나 사이트 전체를 MIT로 간주하지 않는다.

| 원본 파일 | SHA256 |
|---|---|
| `file-drop.original.html` | `e801840ffdcc6fd522ea92ffaa6480647da14a931a5e5f8ebb2f7f4c6aa83ee4` |
| `loading-success.original.html` | `d48c93af26ebf470f04dfa8ac68bdd2075dc247ebf2a9bc8e330250654c8a24a` |
| `morph-tooltip.original.html` | `58df3a926bda358cd821741683b326ea22408a5faafeb0791c76bf07ac872a1b` |
| `otp-code.original.html` | `b277570938a6016b03c85d2f5383779a2ee5e3fa6d4fddbef3a0db28a80a5147` |
| `password-strength.original.html` | `a95964bd2071c4426ba34c2131333d5a9bf2ffb39d4af5a995e3c0a2187b2319` |
| `sidebar-collapse.original.html` | `bff0f282b65af50d64c932cfbd626a3eac73e59f1ad2ba5201120339b44a1e43` |
| `spring-dropdown.original.html` | `fc28777806bae790215ce961b4592bc038e1355edd20a7d2d5d8ead87d6e4f64` |
| `springy-input.original.html` | `19b0a297773baa9998fc4e3e9290bb03422495a3d36ad5b9895cdc799c11e015` |
| `stat-card.original.html` | `907ae1dc6a1c93dd62a6dde8d6a442fc78136763ff113aaee1607441036fad2f` |
| `swipe-deck.original.html` | `85b857b4e9d01aaaf6626add488e1197eb2edf1e9def985aed9c595afc276453` |
| `tag-input.original.html` | `c6b868113ee9ad83f1f9e84e9af7b625889f80b33b54fd4661dd7105f184c289` |
| `toggle-switch.original.html` | `a9c9353f8e9d5a8b46db3b1d28fbc2fec4842a49e0b7f99ef70a88c55c555a2c` |

## 2. 모션별 출처·구현 대응

`DOM/WAAPI 번안`은 원본의 관찰 가능한 기법을 현재 제품의 DOM, 접근성, 수명주기와 데이터 계약에 맞게 구현했다는 뜻이다. React 컴포넌트 전체를 동일하게 이식했다는 뜻은 아니다. `기존 유지`로 표시한 항목은 이번 21개 보완 작업에서 새로 이식한 것으로 집계하지 않는다.

### 공통·입력·메뉴

| ID / 모션 | 원본의 정확한 경로 | 제품 구현 | 확인한 적용 기법과 범위 |
|---|---|---|---|
| M01 Skeleton loader and reveal | T `skills/transitions-dev/14-skeleton-reveal.md` | `src/server/r3-common-motion.mjs`의 `skeleton`; `src/server/r3-async-motion.mjs`의 요청 region 연결 | 실제 텍스트 `Range.getClientRects()`로 줄 위치를 측정하고 placeholder를 그린다. 응답 결과에 따른 reveal, resize 관찰, 원래 inert 상태 복원이 있다. 원본의 reveal 개념을 번안했으며 기존 고정 비율 막대를 사용하지 않는다. |
| M02 Card resize | T `skills/transitions-dev/01-card-resize.md` | `r3-common-motion.mjs`의 `resize`; `order-engine/browser/brand-account-menu.mjs`의 패널 크기 전환 | 현재 그려진 경계를 측정해 중간 역전환을 이어 간다. 이웃 배치와 내용 변화를 함께 다룬다. 관리자 `.t-resize`에는 원본 CSS·token·reduced-motion guard를 포함한다. |
| M03 Error state shake | T `skills/transitions-dev/12-error-state-shake.md` | 공통 `QAUI.shake`, `scripts/r3/authored/account.js`의 입력·OTP 오류 연결 | 기존 유지. 오류 상태와 흔들림 재생을 분리하고 새 오류에서 재생한다. 가시적 하단 오류문을 추가하지 않고 `aria-invalid`·접근성 설명을 유지한다. 이번 변경에서 새로운 spring 이식으로 주장하지 않는다. |
| M04 Springy input | D `springy-input.original.html`, `extracted/springy-input/script-02.original.js` | `r3-common-motion.mjs`의 `bindInputs` / `animateInput`; 공통 입력 연결 | 네이티브 input 위의 표시용 mirror에서 grapheme별 진입·퇴장과 뒤쪽 글자 이동을 처리한다. 네이티브 값·커서·선택 범위·IME 조합은 그대로 유지한다. input 상자 전체를 움직이는 효과와 구분한다. |
| M05 Swipe deck | D `swipe-deck.original.html`, `extracted/swipe-deck/script-02.original.js` | `src/server/r3-customer-controls.mjs`의 `deckLayout`, `swipeDeck`; 역할 화면·passes 연결 | 동일 카드 노드의 격자→덱 좌표를 FLIP으로 연결하고, 중간에 다시 바뀌면 현재 그려진 위치에서 시작한다. 카드 식별자와 실제 날짜 순서는 제품 데이터가 결정한다. 데모의 자동 순환은 가져오지 않는다. |
| M06 Spring dropdown + Menu dropdown | D `spring-dropdown.original.html`; T `skills/transitions-dev/05-menu-dropdown.md` | `r3-common-motion.mjs`의 `dropdown`, `nativeSelects`; 질문·검색·관리 화면 | 방향에 맞는 transform origin, scale/opacity 진입, DOM을 유지한 닫힘, 바깥 클릭·Escape·초점 복귀를 번안한다. 원래 select의 이름·값·form payload는 유지한다. |
| M08 Loading to success | D `loading-success.original.html`, `extracted/loading-success/script-02.original.js` | `r3-async-motion.mjs`의 `mountAsyncMotion`; workflow의 `run`; 실제 adapter Promise | 폭이 줄어드는 버튼 면, spinner, 결과 표식이라는 단계 표현을 사용한다. 원본의 모든 독립 spring 상수를 그대로 실행하는 구현은 아니다. 제품 Promise만 성공·실패를 결정하며 원본 데모의 성공 타이머를 사용하지 않는다. |
| M11 OTP code | D `otp-code.original.html`; T `skills/transitions-dev/12-error-state-shake.md` | `scripts/r3/authored/account.js`의 OTP 모듈 | 기존 유지. 여섯 자리 입력·붙여넣기·포커스·붉은 오류 및 공통 shake를 연결한다. 원본 UI 참조와 실 이메일 전송·인증 서버 동작은 별개의 증거다. |
| M12 Tag input | D `tag-input.original.html`, `extracted/tag-input/script-02.original.js` | `r3-common-motion.mjs`의 `tagInsert`, `tagRemove`; `r3-role-client.mjs`의 추천·선택 | 태그 spring 진입, 삭제 중 차지하던 폭 축소, 이웃 태그의 현재 위치 연속성을 구현한다. 검색 결과·중복 억제·IME·실제 선택값은 제품 기능이다. |
| M13 Password strength + Liquid Link | D `password-strength.original.html`; 사용자 제공 [영상 6](https://drive.google.com/file/d/19UvOWFPC34yazuZ3qBK037odyWYchx0K/view) | `scripts/r3/authored/account.js`의 비밀번호 meter | 기존 유지. 강도 단계가 바뀔 때만 연결 효과를 재생하고 삭제 방향·붙여넣기 단계를 구분한다. 영상은 Git 소스가 아니므로 존재하지 않는 commit을 기재하지 않는다. 이번 작업에서 영상 코드의 새 이식을 주장하지 않는다. |
| M14 Stack panel + Page side-by-side | K `components/kokonutui/stack-panel.tsx`; T `skills/transitions-dev/08-page-side-by-side.md`, `01-card-resize.md` | `src/server/order-engine/browser/brand-account-menu.mjs` | 기존 유지. 페이지 push/pop, 전진·뒤로 방향, 패널 크기 변화와 초점 수명주기를 적용한다. 해당 파일에는 범위를 제한한 Transitions.dev CSS recipe와 원본 출처 주석이 있다. |
| M15 Toggle switch + Toggle | D `toggle-switch.original.html`; T `skills/transitions-dev/27-toggle.md` | `r3-common-motion.mjs`의 `persistedSwitch` | thumb의 spring 상태 전환과 실제 저장 Promise를 연결한다. pending 재입력 차단, 성공 후 확정, 실패 시 원래 값 복원은 제품 계약이다. |
| M16 Smooth drawer + Panel reveal | K `components/kokonutui/smooth-drawer.tsx`; T `skills/transitions-dev/07-panel-reveal.md` | `r3-common-motion.mjs`의 `bottomPanel`; `scripts/r3/authored/sheet-motion.mjs`; `src/server/product-auth-sheet.mjs` | 같은 패널 DOM의 열기·닫기·드래그·복귀, 초점·배경 inert·스크롤 잠금과 해제를 다룬다. 이번 공통 패널 연결과 운영10의 인증 패널 transform 충돌 제거는 구분한다. 실제 상담 전송·회원 인증은 각각의 서비스 계약이 결정한다. |
| M18 Wheel picker | K `components/kokonutui/wheel-picker.tsx` | `r3-common-motion.mjs`의 `wheel`, `nativeSelects`; 개업일·시간 입력 연결 | 20° 원통, 지수형 경계 저항, 80ms 속도 구간, 0.32초 coast 예측, 140/24 spring 정착을 번안한다. 포인터·wheel·키보드가 같은 선택 상태를 사용한다. 날짜 유효성은 제품 로직이다. |
| M19 Notification badge | T `skills/transitions-dev/03-notification-badge.md` | `order-engine/browser/brand-account-menu.mjs`의 unread 갱신과 badge CSS | 기존 유지. 실제 unread 수·읽음 응답에 따라 배지가 변한다. 명칭 충돌을 피한 keyframe 및 panel 범위 CSS로 원본 slide/pop/blur recipe를 사용한다. |
| M24 Profile / Account menu | K `components/kokonutui/profile-dropdown.tsx`, `stack-panel.tsx`; T `skills/transitions-dev/08-page-side-by-side.md` | `order-engine/browser/brand-account-menu.mjs`; `src/server/product-ui/modules.mjs` | 기존 공유 계정 메뉴 유지. 계정·알림·관리 메뉴와 panel lifecycle/keyboard 동작을 참조한다. 계정 내용·권한·API 처리는 제품 소유이며 레퍼런스 예시 계정을 사용하지 않는다. |

### 관리자·약관·업무 문서

| ID / 모션 | 원본의 정확한 경로 | 제품 구현 | 확인한 적용 기법과 범위 |
|---|---|---|---|
| M07 Stat card | D `stat-card.original.html`, `extracted/stat-card/script-02.original.js` | `src/server/product-admin-motion.mjs`의 `mountChart(..., false)` | 점마다 200/17 spring, 왼쪽부터 `0.03 × index`초 retarget 지연, 곡선·면, 숫자·증감 값, 380/30 기간 pill을 적용한다. 데이터 길이·수치·기간은 adapter에서 받는다. 데모 12점 데이터나 자동 순환을 제품 지표로 쓰지 않는다. |
| M09 Sidebar collapse + Learn more hover | D `sidebar-collapse.original.html`; T `skills/transitions-dev/21-accordion.md`, `24-learn-more-hover.md` | `product-admin-motion.mjs`의 `mountSidebar`, `mountDepth`; `scripts/r3/authored/admin-common.mjs` | 폭 260/24, 화살표 300/22, 라벨 300/26 spring과 펼침 순서를 사용한다. 실제 aria-expanded를 따라간다. 하위 뎁스와 hover는 T의 CSS·token·reduced-motion guard를 포함해 연결한다. |
| M10 Morph tooltip의 메뉴 배경 이동 | D `morph-tooltip.original.html`, `extracted/morph-tooltip/script-02.original.js` | `product-admin-motion.mjs`의 `mountNav`; `#role-menu`, 관리자 nav 연결 | 새 항목 방향의 leading edge 620/36, trailing edge 190/19 spring을 사용해 하나의 배경이 늘어나며 이동한다. 네이티브 링크·텍스트·아이콘을 유지한다. pointer/focus/방향키와 메뉴 재생성을 처리한다. 원본의 툴팁 전체 외관을 가져오지 않는다. |
| M17 Terms / Scroll Index | K `components/kokonutui/scroll-index.tsx` | `product-admin-motion.mjs`의 `mountScrollIndex`; `scripts/r3/authored/account.js`의 terms 모듈 | 실제 heading 좌표·scrollHeight로 목차 rail과 tick을 배치한다. 현재 절·지나간 절 표시, 근처 tick 팽창, 실제 문서 scrubbing, 클릭 이동, 키보드를 연결한다. 문서 원문은 `/policies/:id`에서 받으며 게시되지 않은 약관을 만들어 넣지 않는다. |
| M20 Widget / Bento grid | K `components/kokonutui/bento-grid.tsx` | `product-admin-motion.mjs`의 `mountWidgets`; `admin-common.mjs`; `product-experience-operations.mjs`의 dashboard layout | `k=420, ζ=.76` 이동·크기, `520/.82` lift, `260/.6` tilt spring을 DOM FLIP에 번안한다. 실제 끌기·키보드 들기·재배열·크기 변경·취소와 저장 응답 확인을 연결한다. 레퍼런스 데모 위젯 내용은 사용하지 않는다. |
| M21 Receipt printer | K `components/kokonutui/receipt-printer.tsx` | `product-workflow-motion.mjs`의 `receiptPaper`, `mount` receipt 경로 | 슬롯에서 나오는 종이, 아래 당김의 지수형 저항, 수평 기울기, 놓을 때 복귀를 제품용 DOM/WAAPI로 번안한다. 원본의 줄 단위 feed, 찢기, Verlet/진자·낙하 전체 시뮬레이션은 이식하지 않았다. 실제 발급 응답을 받은 문서만 표시한다. |
| M22 Metric graph | K `components/kokonutui/metric-card.tsx` | `product-admin-motion.mjs`의 `mountChart(..., true)` | 실제 데이터의 포인터 위치를 점 index로 변환하고 cursor·값·note 툴팁을 표시한다. 드래그/Shift+방향키 범위, 합계, band를 같은 데이터로 계산한다. 원본 React 컴포넌트 전체 복제가 아니다. |
| M23 Spending ring | K `components/kokonutui/spending-ring.tsx` | `product-admin-motion.mjs`의 `mountRing` | 금액 비중의 SVG arc, 2.4° 최대 간격, 선택 segment의 굵기·강조, 각도 spring `rate=11, ζ=.78`, 0.2초 flick 예측, 5px tap 경계를 사용한다. 각도·중심 값·범례·키보드가 같은 선택을 공유한다. |
| M25 Signature pad | K `components/kokonutui/signature-pad.tsx` | `product-workflow-motion.mjs`의 `signaturePad`, `mountEvidence`; `r3-evidence-client.mjs`; `evidence-signature.mjs` | 포인터를 따라오는 실제 pen spring과 속도·압력별 선폭 식을 번안한다. 계수와 제외 범위는 아래 상세에 적었다. 출력은 제품의 마스킹 문서·동의·서명 결속 계약으로 전달한다. |
| M26 Amount pad | K `components/kokonutui/amount-pad.tsx` | `product-workflow-motion.mjs`의 `amountDigits`, `mount` billing 경로 | 자리별 node, digit 진입 spring, blur/opacity, comma 위치 이동, 제거되는 자리의 독립 exit를 번안한다. 계수와 원화 정수화 범위는 아래 상세에 적었다. 실제 청구 계정·draft·issue·재열기는 제품 API 계약이다. |
| M27 Business verification / Card field 개량 | K `components/kokonutui/card-field.tsx` — 지정된 입력 UX 참조 | `product-workflow-motion.mjs`의 `mountBusiness`; `product-experience-operations.mjs` | 숫자 입력→검증 중→결과라는 폼 UX를 사업자 정보로 바꿨다. 원본의 카드 브랜드 추정·Luhn·CVC·카드 전체 애니메이션을 실제 차용했다고 주장하지 않는다. 사업자 검증 공급자 호출·권한·revision·응답 판정·등록증 제출은 Order 자체 구현이다. |

## 3. 기존 알림 FAB의 Gooey와 File drop

### 기존 알림 버튼의 두 아이콘 메뉴

요청한 원본은 [Libraries.dev Gooey](https://libraries.dev/gooey)이며 실제 소스는 G의 다음 파일이다.

- `packages/liquid-gooey/src/Gooey.tsx`
- `packages/liquid-gooey/src/GooeyItem.tsx`
- `packages/liquid-gooey/src/LiquidItem.tsx`
- `packages/liquid-gooey/src/filter.tsx`
- `packages/liquid-gooey/src/observer.ts`
- `packages/liquid-gooey/src/spring.ts`
- 사용법: `packages/liquid-gooey/README.md`; 사이트 진입점: `sites/gooey/`

`product-admin-motion.mjs`의 공개 `mountGooey(root, actions, options)`는 선명한 DOM 아이콘 뒤에 SVG 액체 표면을 두는 구조, blur 6·alpha contrast 18·intercept -7 필터, 동일 spring clock의 버튼 transform과 SVG blob 좌표·반지름 미러링을 번안한다. 두 원형 항목은 X·Y 좌표를 함께 바꿔 부채꼴로 펼치며, 버튼에는 아이콘과 접근성 이름만 둔다. 옆 텍스트 박스와 세로 목록은 만들지 않는다. 현재 메뉴의 spring 계수와 펼침 위치는 제품용 조정값이다. 원본 패키지의 React 트리나 모든 geometry observer를 통째로 포함한 구현은 아니다.

제품 연결은 [authored onboarding](../scripts/r3/authored/onboarding.js)이 소유한다. 기존 `.ob-quick > button[data-action=quick]`과 그 컨테이너를 `options.trigger`·`options.container`로 넘기며, `mountGooey`는 새 플로팅 버튼을 생성하지 않는다. `product-ui/bootstrap.mjs`는 공통 설치와 root 수명만 관리하고 일반 계정·상담·알림 메뉴를 추가하지 않는다. 관리자 모듈과 중첩 계정 패널·인증 시트도 별도 플로팅 소유자를 만들지 않는다.

| 원형 항목 | 아이콘 | 기존 제품 동작 |
| --- | --- | --- |
| 오더 패스 | 공통 `deck` SVG | `brandMenu.open('manage.quotes')` → 기존 `delivery-request/ready`의 오더 패스 앞면·뒷면 |
| 시세 알림 | 달걀 윤곽 안의 원화 기호 `₩` SVG | `brandMenu.open('notifications')` → 기존 알림 조회·읽음 처리 |

기존 종 아이콘·미읽음 배지·인증 상태는 onboarding과 공유 계정 메뉴가 계속 관리한다. Gooey는 펼침 상태·키보드·Escape 초점 복귀·축소 모션·정리를 담당하며, 현재 알림 처리나 오더 패스의 업무 계약을 새로 만들지 않는다. 이 정정의 자동검사·실화면·배포·사용자 판정은 별도로 기록한다. 이전 Liquid Taffy 참조와 Libraries.dev Gooey 출처를 같은 라이브러리로 표기하지 않는다.

### File drop 보안 요구

D의 `file-drop.original.html`은 선택·drag 진입·진행·결과라는 UX 참조다. 제품의 파일 형식·용량 제한, 디코딩·래스터화·가림 처리, 취소·실패, 실제 서버 저장, 문서/서명 digest 결속은 `r3-evidence-client.mjs`, `r3-evidence.mjs`, `evidence-signature.mjs` 등 Order 구현이다. 원본 데모에 이러한 서버 보호가 있었다고 귀속하지 않는다. 원본 파일·메타데이터는 실행 코드나 지시로 취급하지 않는다.

## 4. Workflow 세부 대조

### 서명: 실제 pen spring과 제품 제출 계약

K `signature-pad.tsx`에서 확인한 값은 `STEP=1/240`, `TIP_STIFFNESS=2600`, `TIP_DAMPING=78`, 최대 선폭 3.6, 최소 선폭 1.1, 속도 기준 1800, 선폭 완화 0.08이다. pen pressure는 `0.45 + pressure × 0.9`를 사용한다. `signaturePad.step`은 이 가속도·속도·좌표 적분과 선폭 식을 실제 RAF 경로에 적용한다. 한동안 정지했다가 돌아온 frame은 제한된 dt와 substep으로 처리한다.

제품에서는 360×100 제출용 canvas, 현재 pointer ID 소유권, 잠긴 상태 입력 차단, 서명 초기화, 제출 직전 잔여 spring flush, 이름 입력으로 만드는 접근성 대체 경로를 추가했다. 서명 대체 경로는 원본의 pen physics 이식으로 집계하지 않는다. 원본의 SVG stroke export, 전체 undo stack, taper/outline polygon 및 clear 효과 전체를 포팅했다는 주장도 하지 않는다.

가림 처리한 문서와 서명 페이지는 제품의 제출 packet, `documentDigest`, `signatureDigest`, consent version 및 idempotency key에 결속된다. 이 서버 결속과 실제 신청 상태 변경은 Kokonut 데모 기능이 아니다. 일반적인 전자계약 체결이나 모든 계약 종류의 서명 완료를 뜻하지 않는다.

### 영수증: 시각적 번안의 경계

원본 `receipt-printer.tsx`에는 줄 단위 feed, slot hinge, exponential pull resistance, tear threshold, pointer velocity, Verlet/진자·낙하가 있다. 현재 `receiptPaper`는 제품 문서를 보여 주는 배출·당김·복귀 표현을 선택했다. 배출은 1,000ms WAAPI keyframes, 당김은 `90 × (1 - exp(-dy/150))`, 기울기는 제한된 pointer 차이, 복귀는 650ms keyframes다. 따라서 원본의 물리 모델 전체를 재현한다고 기술하지 않는다.

발급번호·발급 주체·받는 곳·결제 내역·시각·digest는 서버가 만든 불변 snapshot에서 온다. 인쇄·재열기는 저장된 문서를 사용한다. 모션이 끝났다는 이유로 발급 성공·결제 완료·문서 승인을 만들지 않는다.

### 금액: glyph별 진입·퇴장과 자리 이동

원본 `amount-pad.tsx`의 digit 진입은 `stiffness=520`, `damping=30`, `mass=.8`, 초기 `y=-22`, opacity 0, blur 2px이다. 위치 이동은 500/40 spring, 제거는 0.14초 exit다. 현재 `amountDigits`는 이 값을 샘플링한 WAAPI keyframes와 실제 이전/다음 glyph 위치 측정으로 사용한다.

제품은 원화의 정수 입력과 최대 9자리 계약을 사용한다. 자리 기반 key, comma 처리, 이미 진행 중인 해당 glyph 애니메이션 취소, 제거 glyph를 잠시 절대 위치에 두는 정리는 DOM 구현에 맞게 작성했다. 원본의 소수 화폐, 데모 잔액·자동 전송 성공·모든 키패드 변형을 재사용하지 않는다.

### 비동기 완료: Promise가 상태를 결정

DesignBookmark Loading to success의 버튼→spinner→결과 표현을 사용하되, `mountAsyncMotion`의 task Promise가 끝나기 전에는 성공으로 전환하지 않는다. 중복 요청, unmount, superseded 응답을 차단하고, form 상태와 오류 후 재시도를 보존한다. 기존 1,450ms 버튼 정리 타이머와 region reveal 정리는 **이미 받은 결과의 표시 정리**이며 성공을 만들어 내는 타이머가 아니다.

`product-workflow-motion.mjs`는 영수증·청구·증빙·사업자 검증을 같은 완료 계약으로 연결한다. pending 동안 관련 입력을 잠그고, immutable payload와 request key를 유지하며, 서버 응답 이후 문서·상태를 갱신한다. 이러한 권한·멱등성·저장 기능은 레퍼런스의 디자인 기법과 구분한다.

## 5. 데이터·약관·배치의 경계

관리자 그래프는 `/dashboard` 응답만 사용한다. 실제 데이터가 없으면 빈 상태를 표시한다. QA의 지표는 `order-qa-fixture/v1`, `kind: dummy`, `commercial: false` 메타데이터를 가진 별도 fixture다. 시각 테스트에서 비례하지 않는 합성 그래프 값을 사용한 이유는 곡선의 실제 변화·stagger를 측정하기 위해서이며 운영 통계로 표시하지 않는다.

약관은 matching id, published 상태, version, 비어 있지 않은 section을 가진 `/policies/:id` 응답만 제품 문서로 받아들인다. 미게시·오류 시 안내와 재시도를 제공하고 확인 동의를 잠근다. QA에서는 fixture adapter와 dummy 문서 메타데이터를 함께 확인해 검수용 본문임을 표시한다. 레퍼런스의 긴 문서 예시를 서비스 법률 문구로 확정하지 않는다.

배치 저장은 stable ID `widget-0`–`widget-2`, revision, request key를 사용한다. 저장 후 반환된 배열의 순서·너비가 요청과 일치할 때만 완료된다. 제품은 `/settings/dashboard-layout`을 사용하고, QA는 기존 검수 host의 index/wide 저장 계약을 유지한다. 서로 다른 저장 범위의 증거를 혼합하지 않는다.

## 6. 라이선스와 재사용 문서

- 관리자 구현의 원본 설명과 Kokonut·Gooey MIT 및 Transitions.dev License 전문: [product-admin-motion.NOTICE.md](../src/server/product-admin-motion.NOTICE.md).
- 공통 모션의 원본 설명과 라이선스 전문: [r3-common-motion.NOTICE.md](../src/server/r3-common-motion.NOTICE.md).
- 기존 고객 모션의 보관 라이선스: [KokonutUI-LICENSE.txt](../src/server/vendor/r3-customer-motion/KokonutUI-LICENSE.txt), [Liquid-Taffy-LICENSE.txt](../src/server/vendor/r3-customer-motion/Liquid-Taffy-LICENSE.txt), [AnimateIcons.LICENSE](../src/server/vendor/r3-customer-motion/AnimateIcons.LICENSE). 이 링크는 새 Gooey를 Liquid Taffy로 귀속한다는 뜻이 아니다.
- K의 원본 라이선스는 MIT다. 재사용하는 원본의 저작권 고지를 보존한다.
- T의 `transitions/`·`skills/`는 Transitions.dev License이며 도구 디렉터리의 MIT와 구분한다. 제품 안에서 사용하는 적용 코드이며 경쟁 transitions 컬렉션을 재배포하지 않는다. 웹사이트 디자인·브랜드·로고를 이 라이선스로 가져왔다는 주장도 하지 않는다.
- G의 `liquid-gooey` 소스는 MIT다. 저장소에 함께 있는 모델 파일은 별도 `LICENSE-MODEL.md` 대상이며 이번 메뉴 구현에서 사용하지 않는다.
- D는 확인한 보존 HTML을 특정 reference로 기록한다. 별도 확인 없이 사이트 전체에 오픈소스 라이선스를 부여하지 않는다.

전체 보관본과 복원 방법은 [재사용 가이드](https://drive.google.com/file/d/1oqK-xt_5NxpYjv48shNPi6JFTlh-8qwv/view)를 따른다. Libraries.dev 전체 ZIP의 분할 보관은 손실 없는 전달 방식이며 모델 파일을 제품 사용 대상으로 승인했다는 의미가 아니다.

## 7. 구현·검증 증거의 읽는 방법

이 문서의 대응은 제품 코드와 고정 원본을 읽어 확인한 범위다. 테스트 파일의 존재나 새 모듈 이름만으로 시각 품질 통과를 주장하지 않는다.

| 검증 대상 | 파일 | 확인 범위 |
|---|---|---|
| 관리자·약관·Gooey DOM/수명주기 | `tests/product-admin-motion.test.mjs` | 데이터·키보드·배치 ack·약관 게이트·cleanup·원형/곡선 상호작용 |
| 실제 서버 workflow 계약 | `tests/product-experience.test.mjs` | scope/권한·layout revision·불변 영수증·billing draft/issue·NTS 응답 및 await 경계 |
| workflow UI와 adapter | `tests/product-workflow-motion.test.mjs` | 실제 응답 전 완료 차단·재시도 payload·서명 픽셀·청구 잠금·사업자 정보 변경 시 무효화 |
| 공통 모션 DOM/실브라우저 | `tests/r3-common-motion.test.mjs`, `tests/r3-common-motion-browser.py` | 실제 geometry·입력·선택·wheel·반전·reduced motion |
| 현재 QA 제품 frame의 관리자·영수증·청구 | `tests/r3-admin-common-browser.py` | 390/1440, 실제 fixture transport, 저장·재열기·실패·원래 QA host 기능 |
| 관리자·workflow의 실제 RAF | `tests/r3-admin-motion-browser.py` | trusted 입력으로 측정한 중간 프레임, source SHA, 일반/reduced, SVG/DOM 동기화와 cleanup |

RAF 자료는 `artifacts/motion21/admin/`에 기록한다. 이 문서 작성 시점의 브라우저 검사는 최종 CI 실행으로 확인해야 하므로, 결과·관찰 시각·commit은 실행 receipt와 [구현 및 검증 매핑](MOTION21_IMPLEMENTATION.md)에 기록한다. 사용자 `PASS`와 모션별 수용 여부는 자동 검사 결과에서 추론하지 않는다.
