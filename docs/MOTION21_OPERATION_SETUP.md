# 모션 21개와 연결된 운영 설정

이 문서는 이번 UI 구현에 필요한 운영 입력을 설명한다. UI fixture 성공은 외부
기관 조회, 약관 게시, 결제, 이메일 발송, 전자계약 체결을 증명하지 않는다.

## 사업자번호 확인

`POST /product/business-verifications`는 현재 사용자에게 허용된 사업자 심사 건과
입력 버전을 확인한 뒤 국세청 사업자등록정보 진위확인 API를 호출한다. 실제
서버 환경에 `NTS_SERVICE_KEY`가 필요하다. 키는 브라우저에 제공하지 않는다.

- 공식 API 안내: https://www.data.go.kr/data/15081808/openapi.do
- 호출 규격: https://infuser.odcloud.kr/api/stages/28493/api-docs
- 실제 호출: `https://api.odcloud.kr/api/nts-businessman/v1/validate`
- 키가 없거나 기관 응답을 확인하지 못하면 명시적인 오류를 반환한다. 검증 성공
  응답을 생성하거나 사업장 권한·인증 상태를 자동 부여하지 않는다.
- 사용자에게는 등록증 제출을 통한 수동 검토 경로를 제공한다. 사업자등록번호
  확인과 등록증 파일 제출은 별개다. 업태·업종 입력을 유지한다.
- 제품 시험의 `NTS_FETCH` 주입점은 서버 단위 검사 전용이다. QA의 더미 응답은
  독립 fixture transport 안에 있으며 운영 handler의 기관 조회를 우회하지 않는다.

2026-11-21 설정 이름 조회 시 production·preview 모두 `NTS_SERVICE_KEY`가
없었다. 비밀 값은 읽거나 문서에 저장하지 않았다. 따라서 외부 기관 실조회는
미확인 상태다.

## 약관 원문과 Scroll Index

약관 화면은 `GET /product/policies/{required|privacy|optional}`에서 게시된 원문을
읽는다. 비회원 진입은 이 세 읽기 경로로 제한된다. 서버는 `order_operation`의
`kind='policy'`, `state='PUBLISHED'` 문서를 읽고 버전·제목·조항·본문 구조를
검사한다. 화면은 실제 조항 제목에서 Scroll Index의 눈금·현재 위치·이동을 만든다.

승인된 원문 게시가 먼저 필요하다. 원문이 없거나 형식이 맞지 않으면 재시도
메시지를 표시하고 동의 확인을 잠근다. 기존 네 줄짜리 문서선을 약관으로
간주하거나 임의의 법률 문구를 작성해 게시하지 않는다.

2026-11-21 운영 읽기 조회의 PUBLISHED 정책 문서는 0개였다. QA는 명시적인
검토용 정책으로 Scroll Index를 실행하며 운영 게시 문서와 구분한다.

## 발급 문서와 서명

- 영수증은 결제 확인된 주문의 저장 당시 금액을 사용한다. 오더→공급사/사업장,
  공급사→사업장 두 모델을 각 역할과 대상 관계에 맞춰 제한한다. 발급번호와
  문서 digest를 서버에서 저장하며 발급한 문서는 수정하지 않는다.
- 별도 청구는 실제 허용 계정 선택, 초안 저장, 발급, 재조회까지 처리한다.
  발급 결과는 `deliveryStatus='NOT_SENT'`, `paid=0`이며 발송이나 결제를 실행하지 않는다.
- 증빙 제출 서명은 문서 픽셀·서명 픽셀·전체 패킷의 digest를 행위자·요청 건·동의
  버전에 결속한다. 서명이 없거나 digest가 다르면 새 제출을 거절한다. 재시도는
  같은 패킷과 요청 키를 사용한다. 전자계약의 상대방 동의·계약 상태·체결 절차는
  이 증빙 제출 기능에 포함하지 않는다.

## 검토와 보존

제품 원본, 검토 응답, QA host/frame의 수정 경계는
[QA_PRODUCT_BOUNDARY.md](QA_PRODUCT_BOUNDARY.md)에 있다. 이번 구현·확인 범위는
[MOTION21_IMPLEMENTATION.md](MOTION21_IMPLEMENTATION.md), 출처와 적용한 기법은
[MOTION_SOURCES.md](MOTION_SOURCES.md)에 기록했다. 사용자 검토 상태와 과거
댓글·anchor·소스 해시는 이번 코드 반영으로 승인 또는 해결 처리하지 않는다.
