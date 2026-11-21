# 제품 UI와 QA의 소유권

제품 화면의 정의와 동작은 `src/server/product-ui/`가 소유한다. 제품 페이지·계정
패널·인증 시트는 이 경로를 직접 가져온다. QA는 같은 제품 모듈에 검토용 전송과
전시 기능을 더한다. 제품에서 QA 호스트·주석 프레임·fixture를 가져오지 않는다.

| 구분 | 정본과 수정 위치 |
| --- | --- |
| 제품 화면·공통 스타일·브라우저 런타임 | `product-ui/catalog.gen.mjs`, `runtime.gen.mjs`, `assets.gen.mjs` |
| 제품 문서와 실제 기능 | `product-ui/documents.mjs`, `modules.mjs`, `business-directory.mjs`, `sales.mjs` |
| authored 화면 원본 | `scripts/r3/authored/account.js`, `business.js`, `navigation.js`, `onboarding.js`, `admin-common.mjs` |
| 공통 기능 설치와 수명 | `product-ui/bootstrap.mjs` → `bootstrap.gen.mjs` |
| 제품 진입·패널·인증 시트 | `product-app-page.mjs`, `product-account-panels.mjs`, `product-auth-sheet.mjs` |
| 검토용 응답 | `r3-ui/qa-fixture-adapter.mjs` |
| 검토용 문서·컴포넌트 전시 | `r3-qa-assets.mjs`, `r3-ui/qa-showcase-runtime.mjs` |
| 실제 API로 보는 컴포넌트 검토 페이지 | `r3-qa-product-page.mjs`가 제품의 중립 문서 렌더러를 소비 |
| 고정 R1 호스트와 주석 프레임 | `r3-ui/host.mjs`, `frame.mjs`, 생성된 `review-engine.gen.mjs` |

기존 `r3-ui/catalog.gen.mjs`, `runtime.gen.mjs`, `qa-assets.gen.mjs`는 과거 소비자와
테스트용 재수출 경로다. 새 제품 코드는 이 호환 경로를 사용하지 않는다.

## 제품 화면을 바꾸거나 추가할 때

1. authored 원본 또는 `product-ui/documents.mjs`를 수정한다. 화면은
   `api.adapter`, `api.consultation` 등 주입된 실제 기능을 사용한다. 성공 상태는
   해당 요청의 확인된 응답 뒤에 표시한다.
2. 새 화면에는 `product-app-page.mjs`의 이동 허용 목록과 안전한 진입 상태를
   등록한다. URL로 과거 완료 예시를 실제 완료 상태로 승격하지 않는다. 예를
   들어 상담 drawer의 제품 진입은 `closed`(실제 견적 선택), `info`, `booking`만 허용한다.
3. 공통 기능은 `bootstrap.mjs`에서 설치한다. 제품과 QA artifact 내부가 같은
   설치 코드를 쓰며 R1 부모 호스트에는 설치하지 않는다.
4. `ORDER_PRODUCT_UI.mount(module, root, state, api)`로 마운트한다. 이 경로가
   root별 `signal`, `motion`, 실제 adapter와 상담 API를 제공한다. root 제거 시
   해당 작업만 정리하며 문서 공통 리스너는 페이지 종료 때 정리한다.

## 기존 알림 플로팅 버튼의 소유권

`scripts/r3/authored/onboarding.js`가 기존 `.ob-quick`의 종 버튼·미읽음 배지·인증
상태와 두 메뉴 동작을 소유한다. `product-admin-motion.mjs`의 `mountGooey`는
이 버튼과 컨테이너를 `options.trigger`·`options.container`로 받아 원형 아이콘
두 개의 부채꼴 움직임만 연결한다. 오더 패스는 기존 `manage.quotes` 패널,
시세 알림은 기존 `notifications` 패널을 연다. 아이콘 옆 텍스트 박스는 없다.

bootstrap과 관리자 모듈은 일반 계정·상담·알림용 플로팅 버튼을 추가하지 않는다.
중첩 계정 패널과 인증 시트도 별도 소유자를 생성하지 않는다. QA는 같은 authored
버튼·모션·기존 동작에 fixture를 주입하며, QA host/frame에서 대체 메뉴를 만들지
않는다. 소스 변경과 자동검사·실화면·배포·사용자 판정은 별도로 기록한다.

## QA fixture를 추가할 때

1. `qa-fixture-adapter.mjs`에 제품 API와 같은 요청·응답·실패 계약을 추가한다.
   검토용 상태와 값은 이 어댑터 안에 둔다. 전시를 위해 제품 코드에 성공 우회나
   예시 값을 넣지 않는다.
2. `r3-qa-assets.mjs`에서 제품의 `getProductDocuments()` 결과를 가져와
   `qaOnly: true`와 필요한 `fixture` 설정을 가진 검토 상태를 추가한다.
   제품의 body·CSS·mount를 그대로 재사용한다.
3. 컴포넌트 전시용 재생·선택 동작은 `qa-showcase-runtime.mjs`에 둔다.
   variant는 수집된 자산 ID·원본 selector·index로 확인하고 알 수 없는 값은
   거절한다. 현재 검토와 과거 기록의 ID를 재사용하거나 덮어쓰지 않는다.

## 생성과 확인

원본 검토 epoch를 보존한 뒤 최초 한 번 `migrate-product-ui.mjs`를 실행한다.
2026-11-21 변경의 반복 생성은 다음 순서를 사용한다. `jsdom`이 있는 Node
의존성 경로를 실행 환경에 설정해야 한다.

```sh
node scripts/r3/refresh-product-motion21.mjs /absolute/path/to/release10-baseline
node scripts/r3/collect-qa-assets.mjs
node scripts/r3/build-product-ui-bootstrap.mjs
node scripts/r3/build-qa-review-runtime.mjs
node scripts/r3/compile-approved-widths.mjs
node scripts/build-product-manifest.mjs
```

전용 refresh는 release10 기준과 정확한 원본 조각을 검증하고, 선언된 현재 제품
가족만 최신 원본으로 다시 조립한다. 중간 생성 뒤 원본을 더 수정해도 반복할 수
있다. 호스트·프레임·과거 모듈은 쓰지 않는다. 이전 `refresh-*` 스크립트를 임의로
연달아 실행하면 기준 엔진이나 별도 과거 아카이브를 다시 적용할 수 있으므로
이번 생성에는 사용하지 않는다.

```sh
node --experimental-vm-modules scripts/check-product-ui-boundaries.mjs
node --test tests/product-ui-ownership.test.mjs tests/r3-qa-mvp-bundle.test.mjs
node scripts/r3/build-product-ui-bootstrap.mjs --check
node scripts/r3/build-qa-review-runtime.mjs --check
```

의존성 검사는 실제 ESM import와 re-export를 읽는다. 회귀 검사는 제품/QA 문서의
동일성, root별 정리, 중복 마운트 방지, 로컬과 배포 번들의 source hash 일치를
확인한다. 생성 파일의 해시나 과거 원본을 수동으로 수정하지 않는다.
