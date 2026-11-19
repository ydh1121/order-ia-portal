# ORDER 작업 재개 및 사용자 지시 검증

사용자 지시 원문을 보관하고 반영 여부를 검증하라는 2026-11-20 이동환 님의 요청을 이 저장소의 후속 작업에도 적용합니다.

## 지시 기록

- 새 지시와 정정은 줄바꿈·탭·오탈자를 포함한 UTF-8 원문 TXT로 Drive에 먼저 보관합니다. 원문을 다듬거나 요약문으로 대체하지 않습니다.
- SHA256, 바이트 수, 줄 수, Drive 파일 ID를 기록하고 업로드한 전문을 다시 읽어 일치를 검증합니다. 정정은 새 원문으로 추가하며 이전 원문은 덮어쓰지 않습니다.
- 요구별 해석과 검증표는 원문과 별도 파일로 관리합니다. 원문 줄 → 요구 ID → 코드 → 자동검사/실화면 → 실제 배포 → 사용자 판정을 연결합니다.
- 구현, 자동검사, 실화면 검수, 배포, 사용자 확인은 서로 다른 상태입니다. 코드 검사나 시험 계정 결과를 사용자 승인 또는 실제 상거래 성공으로 표시하지 않습니다.

## 새 채팅에서 재개하는 순서

1. Drive의 CURRENT와 MASTER BATON에서 최신 지시와 중단 지점을 읽습니다.
2. 관련 원문과 요구 검증표를 읽고, 실제 GitHub main/PR/CI 및 Cloudflare 배포와 대조합니다.
3. 같은 WO와 MSG0585 기록에 이어 쓰되 기존 원문·ACK·사용자 의견·가격을 보존합니다.
4. 새 완료 근거와 남은 작업을 CURRENT, BATON, 메시지 원장에 기록하고 재조회합니다.

## 현재 원문과 정본 위치

- 원문: https://drive.google.com/file/d/1etQ6_kPaLh42-prydapNsMmxnKZ5Hmzi/view
- 원문 SHA256: `e5fe46a4e0eacc18376b2166deab217d84ccd0ddfcd006cd947b01ead635c1ed`
- 요구 검증표: https://drive.google.com/file/d/1a5Se7Kd7pwqzaVUqA46-yLjzYu1Peb9O/view
- CURRENT: Drive 파일 `1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7`
- MASTER BATON: https://docs.google.com/document/d/1oA6OAGdo2mv3bLRlFPHt0Z0ozEocyrIUOvMiy7Ja7Ug/edit
- 메시지 원장: https://docs.google.com/spreadsheets/d/1J5-pZ4poeSmyKpO7vUOIS-tWa1t0LmBQb-wGd6SVFjU/edit
- 작업: `WO-ORDER-20261101-ASTRA-ENGINE-001` / `MSG0585`

## 구현과 검증 경계

- 메인 주소는 `https://order-ia-portal.pages.dev`입니다. 후보 주소와 메인 반영 상태를 혼동하지 않습니다.
- 개인 가격 작업공간의 저장/예약은 상업용 단가 승인이나 고객 견적 발행을 대신하지 않습니다.
- 사업장 주소록 저장은 회원의 개인 입력 저장이며, 사업장 인증·조직 권한·결제 권한을 부여하지 않습니다.
- QA 화면의 예시 상호작용은 실결제·실배송·이메일 발송으로 취급하지 않습니다.
- 기존 152개 원본 단가, 과거 QA 아티팩트 해시, 댓글과 사용자의 상태 변경을 보존합니다.
