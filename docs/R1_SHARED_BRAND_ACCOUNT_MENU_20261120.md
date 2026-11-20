# R1 공통 로고·계정 메뉴 재작업

## 구현 경계

정규 소스는 `src/server/order-engine/browser/brand-account-menu.mjs`이다. 같은 함수와 CSS를 실제 제품 문서와 QA의 정규 소스 소비 화면이 사용한다. 원본 CODE1 SVG의 세 `path`와 인스턴스를 유지하며 별도 검은 케밥 아이콘을 그리지 않는다. 계정·알림·사업장 데이터, 인증 판단, 저장은 호출자가 주입하는 서버 어댑터의 책임이다. 이 모듈에는 샘플 계정, 성공으로 전환하는 네트워크 대역, 운영 데이터가 들어 있지 않다.

```js
const menu = mountBrandAccountMenu(existingBrand, {
  authenticated: actor !== null,
  jelly: Code1Jelly,
  reducedMotion: () => mediaQuery.matches,
  unread: unreadCount,
  renderPanel({ id, container, signal, push, back, close, navigate, setUnread }) {
    // 같은 panel 안에 서버 응답을 렌더링한다. AbortSignal을 준수한다.
    // push('manage.business.members', '구성원과 권한')으로 내부 stack을 연다.
    // 필요한 경우 cleanup 함수를 반환한다.
  },
  navigate(id) { /* 명시적으로 선택한 상세 업무 경로 */ }
});
```

기본 루트는 `profile`, `notifications`, `manage`이며 한국어 표시명은 프로필·알림·관리이다. 프로필 하위는 계정·개인정보·연결된 계정, 관리 하위는 납품일정·결제 및 정산·내 견적·사업장 정보·대시보드이다. 알림과 계정 입력은 같은 패널에서 연다. 사업자 정보 및 구성원·권한처럼 추가 내부 페이지가 필요한 경우 `push(id,title)`이 같은 renderer를 다시 호출한다.

반환 API는 `open`, `close`, `back`, `show`, `setAuthenticated`, `setUnread`, `pause`, `resume`, `arrival`, `update`, `destroy`, `inspect`, `trigger`, `panel`이다. `pause/resume`은 로그인·푸터 바텀시트가 헤더를 비활성화할 때 사용한다. 실제 로그인 상태 변경은 `setAuthenticated`가 처리하고, 서버에서 로그인 후 새 페이지를 열 때의 도착 모션은 `arrival`로 재생할 수 있다.

패널은 공통 `.ds` 범위 안에 있어 기존 `QAUI.field/button/setFieldError/syncField`를 사용한다. `.ds`의 페이지 최소 높이가 popover에 전파되지 않도록 panel의 위치·최소 높이·container 규칙만 재설정했다. 화면 가장자리에서는 패널 폭과 최대 높이를 뷰포트 안에 제한하며 긴 내용만 패널 내부에서 스크롤한다.

## 원문·원본과 적용

| 근거 | 적용한 동작 | 검증 경계 |
| --- | --- | --- |
| Figma 2009173058 | 비회원 클릭은 원본 CODE1 랜덤 물리 모션을 실행하며 메뉴를 열지 않음 | 실제 원본 시뮬레이션의 경로 변화·메뉴 차단 DOM 검증 |
| Figma 2009012434 | 인증 전후 같은 SVG 유지, 우측 이동·탄성 복귀, 기존 10–15초 랜덤 idle | 상태 변경/도착 모션 코드 연결. 실제 로그인 전후 시각 비교는 브라우저 증거 필요 |
| Figma 2009013511 | 마침표 fade와 기존 ORDER 그라디언트 색 유지 | `pro-gradient-text` 원본 효과는 미확보. 이 항목 전체 완료로 판정하지 않음 |
| Figma 2009016192 및 원본 12초 메뉴 영상 | 원본 점 세 개와 세 루트 메뉴 간 왕복, 서브 메뉴를 같은 panel에서 전환 | DOM·상태 전환 검증. 원본 영상과 프레임별 시각 동등성은 별도 실브라우저 검수 |
| QA 140c60ec-278f-43f3-8476-98aa7c57cb03 / fad85e4c-6c98-464d-bab2-90f4993fbe84 | 프로필·알림을 같은 panel 안에서 탐색, unread badge, 서버 renderer 주입 | 역할별 알림 내용·웹푸시 발송은 서버 어댑터/공급자 검증 대상 |
| QA 49d4dafe-1673-4e56-9d91-b5bad3bb9681 | 사업자 정보·구성원과 권한을 내부 stack으로 확장할 수 있는 `push` 계약 | 실제 구성원 저장/권한 승인 완료는 renderer/서버 결과로만 판단 |
| QA c98a7618-389d-4c28-96e7-10c91a7c5a2d 최신 본문 | 왼쪽 Order ▼ 메뉴와 오른쪽 계정 케밥을 분리하여 보존 | 왼쪽 공개 on/off 및 Stack panel은 별도 소비 어댑터 영역 |

### 직접 확인한 모션 원본

KokonutUI `profile-dropdown.tsx`의 계정 패널 수명주기와 키보드/초점 동작, `stack-panel.tsx`의 내부 페이지·뒤로 이력 구조를 참조했다. React 원본을 그대로 두 번째 앱으로 넣지 않고 정규 브라우저 모듈의 DOM·수명주기·서버 어댑터로 옮겼다. 원본의 데모 계정이나 테마 메뉴는 제품에 추가하지 않았다.

회수된 Transitions.dev 스킬을 읽고 `08-page-side-by-side`, `01-card-resize`, `03-notification-badge` CSS 규칙 및 reduced-motion 블록을 적용했다. 이미 설치된 의미 토큰을 우선 사용하고 없는 토큰만 패널 범위에 기본값을 둔다. 전역 `:root` 토큰 블록은 복제하지 않았다.

지정된 exact `dropdown-menu-morph`는 최신 공개 GitHub의 `transitions/dropdown-menu-morph/index.html` 및 `assets/community/library.json`의 동일 slug에서 읽었다. 공개 snippet은 plus→surface 형태이며 width/height/radius, 메뉴 slide/scale/blur를 사용한다. 이 구조의 CSS를 유지하고, plus 그림은 사용자가 지정한 원본 CODE1 점과 영상의 점 이동으로 교체했다. ORDER 패널의 실제 너비·높이·색·서체·여백은 기존 디자인 체계를 사용한다. 일반 `menu-dropdown`을 대체 원본으로 사용하지 않았다.

`pro-gradient-text` 공개 페이지는 Pro 소개만 제공하며 회수된 R1 원본에도 해당 효과의 전체 CSS/JS가 없다. 정적 그라디언트나 임의의 shimmer를 이 효과와 같다고 집계하지 않는다.

## 소비 화면과 보존

현재 authored 소스가 직접 공통 메뉴를 호출하는 화면은 onboarding, profile, login, signup, otp, password이다. 실제 제품 런타임은 동일 모듈을 공통 헤더에 추가로 mount할 수 있다. 코드가 runtime family에 포함돼 있다는 이유만으로 다른 모든 화면을 사용처로 집계하지 않는다.

`refresh-brand-account-menu.mjs`는 검증된 main 9c502a1 checkout에서 실행한다. 기존 catalog의 498개 현재 상태(496개 기존 상태와 이미 추가된 매출 2개)의 본문·실행 코드·hash를 `brand-history.gen.mjs`에 봉인했다. 기존 state ID, 이전 본문, 사용자 원문 댓글·판정은 변경하지 않는다. `r3-qa-page.mjs`는 과거 artifact hash로 요청된 화면을 원래 본문과 원래 runtime으로 다시 제공한다. 64개 현재 소비 상태의 헤더·공통 스타일과 7개 관련 runtime family를 갱신했다.

## 실제 서비스가 없는 완료 처리 차단

실제품 모드(`api.mode === 'product'`)에서 로그인/가입/OTP 검증·재전송/비밀번호 전송·변경은 `api.performAction(action,{root,button,signal})`의 Promise가 `{confirmed:true}`를 반환한 뒤에만 완료 상태로 이동한다. 실행기가 없거나 미확정이면 입력을 유지하고 완료 표시를 하지 않는다. 화면을 떠난 뒤 도착한 응답도 무시한다. 샘플 오더패스 수령확인 및 샘플 상담예약의 로컬 완료는 실제품 모드에서 차단했다.

역사적 catalog의 `success`, `verified`, `done` 본문은 검토용 상태 기록이다. 그 상태를 직접 열었다는 사실을 실제 인증·메일 발송·거래 완료로 판정하면 안 된다.

## 현재 검증

`tests/r3-brand-account-menu.test.mjs`, `tests/r3-product-auth-boundary.test.mjs`, 기존 `tests/r3-auth-motion.test.mjs`를 함께 실행해 18개 검사를 통과했다. 원본 CODE1 실행과 SVG 정체성, 비회원 메뉴 차단, 세 루트/지정 하위 메뉴, 같은 panel의 renderer와 중첩 사업장 페이지, 늦은 응답 취소, unread·키보드·외부 초점, 빠른 닫기/재열기, authored 소비 연결, 498개 역사 보존, 실제 서비스 미연결 시 완료 차단을 확인했다.

이는 실제 운영 계정·메일/웹푸시·결제 처리 완료나 사용자 수락을 뜻하지 않는다. 실제 테스트 DB 어댑터와 Chrome에서의 시각/동작 검증 결과는 상위 실행 기록에 별도 추가한다.
