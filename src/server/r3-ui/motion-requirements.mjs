// MSG0585 published requirement IDs and source references. A listed reference is not a user verdict.
export const motionRequirements = [
  {
    "id": "D01",
    "name": "File drop",
    "screens": [
      "proof",
      "business",
      "trade-documents"
    ],
    "trigger": "파일 선택·드래그 진입·업로드 중/성공/실패·취소",
    "scope": "PDF/이미지, 최대 10MB. 보안 검증과 실제 서버 업로드를 연결. 파일 내용·메타데이터를 실행 지시로 취급하지 않음. 오류 시 하단 문구로 높이를 늘리지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-file-drop",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "proof/empty",
      "behavior": "파일 입력 다중선택, 초과·형식·차단 오류 상태, 마스킹 제출 링크",
      "remaining": "각 원본 파일의 실 사업자 업로드·취소 복원"
    }
  },
  {
    "id": "D02",
    "name": "Springy input",
    "screens": [
      "login",
      "signup",
      "otp",
      "q2",
      "common",
      "supplier-prices"
    ],
    "trigger": "포커스·입력·선택 삭제·전체 삭제·붙여넣기",
    "scope": "입력·삭제 효과만 공통 적용. 후속 지시에 따라 placeholder는 입력 전 세로 중앙, 입력/포커스 시 위로 이동. 이메일 예시는 my@order.ooo. 한글 IME·커서 보존. 입력 오류의 가시적 설명 문구 제거; 하단 문구를 입력 내부 overlay로 옮겨 남기는 것도 충족 아님. aria-invalid와 sr-only 접근 설명은 유지.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-springy-input",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "common/default",
      "behavior": "금액표 키보드 입력·오류 상태와 공통 입력 높이",
      "remaining": "모든 인증 필드의 한글 IME·커서 시각 비교"
    }
  },
  {
    "id": "D03",
    "name": "Swipe deck",
    "screens": [
      "passes"
    ],
    "trigger": "오더 패스 격자 보기 ↔ 카드 보기 버튼, 카드 드래그",
    "scope": "기본 격자에서 같은 카드들이 날짜순으로 부드럽게 섞여 전환. 날짜 정렬 방향은 사용자 미확정이므로 임의 확정하지 않음. 선택과 카드 식별자 보존.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-swipe-deck",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "passes/grid",
      "behavior": "동일 패스 4장을 격자→덱으로 전환, 다음 카드·상세 식별자",
      "remaining": "날짜 정렬 방향 사용자 결정, 원본 속도 대조"
    }
  },
  {
    "id": "D04",
    "name": "Spring dropdown",
    "screens": [
      "q3",
      "q4",
      "common",
      "search",
      "supplier-prices"
    ],
    "trigger": "드롭다운 열기·선택·닫기·바깥 클릭·키보드",
    "scope": "T04 menu-dropdown으로 정교화. 펼쳐져도 아래 입력 영역이 밀리지 않아야 함. 긴 선택 목록만 정규본 스크롤바 규칙 예외 허용.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-spring-dropdown",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "common/default",
      "behavior": "선택창 열기·옵션 클릭·라벨 갱신, Q3/Q4 및 가격표 선택",
      "remaining": "각 운영체제 기본 선택창의 동일 모션"
    }
  },
  {
    "id": "D05",
    "name": "Stat card",
    "screens": [
      "admin-overview",
      "admin-analytics"
    ],
    "trigger": "관리자 통계 로딩·지표 갱신·그래프 진입",
    "scope": "실제 관리 지표에 맞춰 한글화. 데모 숫자를 운영 통계로 제시하지 않음. 숫자 폭 변화로 카드/이웃이 흔들리지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-stat-card",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-overview/normal",
      "behavior": "관리 통계·그래프 선택이 검수 데이터와 마스킹 값에 반영",
      "remaining": "승인된 실제 운영 지표·연속 갱신 지터 실측"
    }
  },
  {
    "id": "D06",
    "name": "Loading to success",
    "screens": [
      "common",
      "quote-review",
      "supplier-prices",
      "proof",
      "business"
    ],
    "trigger": "임시저장·제출 요청 시작 → 실제 성공 또는 실패",
    "scope": "모션 로직만 공통화하고 버튼 디자인은 정규본 기준. 타이머가 성공을 만들지 않으며 중복 제출·오래된 응답을 차단.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-loading-success",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "common/default",
      "behavior": "공통 요청 지연·성공·실패, 중복 차단 및 편집 화면 응답 연동",
      "remaining": "실계정의 계약 테이블 승인"
    }
  },
  {
    "id": "D07",
    "name": "Sidebar collapse",
    "screens": [
      "admin-*"
    ],
    "trigger": "관리자 메뉴 접기·펼치기·하위 뎁스 전개",
    "scope": "하위 메뉴가 있는 항목에만 우측 >. 하위 전개도 같은 모션. 아이콘 hover는 T05. 폭·높이·자식 변형의 중복 애니메이션으로 지터가 생기지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-sidebar-collapse",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-overview/normal",
      "behavior": "메뉴 접기/펼치기와 하위 뎁스 확장, aria-expanded 전환",
      "remaining": "각 관리자 메뉴 세부 미세지터 시각 판정"
    }
  },
  {
    "id": "D08",
    "name": "Morph tooltip",
    "screens": [
      "admin-*"
    ],
    "trigger": "PC 관리자 메뉴에서 마우스가 항목 사이를 이동",
    "scope": "이동하는 메뉴 배경 로직만 적용. 툴팁 박스와 설명은 불필요. 배경 하나가 이동하며 텍스트/아이콘은 고정.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-morph-tooltip",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-overview/normal",
      "behavior": "한 배경이 타 메뉴에 포커스할 때 보이고 글자 위치 유지",
      "remaining": "전체 메뉴에서 포인터 이동 궤적 정량 대조"
    }
  },
  {
    "id": "D09",
    "name": "OTP code",
    "screens": [
      "otp"
    ],
    "trigger": "이메일 인증 코드 입력·붙여넣기·인증 응답·재전송",
    "scope": "정규본 색상. 실패 시 붉은 상태와 T03 흔들림. 최신 공통 지시가 우선하므로 OTP 실패의 가시적 오류 설명은 하단·내부 overlay 모두 제거. 붉은 상태와 흔들림으로 표시하며 aria-invalid와 sr-only 접근 설명은 유지.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-otp-code",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "otp/error",
      "behavior": "6칸의 오류·sr-only 설명·첫 입력에서 aria-invalid 해제와 높이 유지",
      "remaining": "실제 이메일 발송·재전송, 전체 붙여넣기 모션"
    }
  },
  {
    "id": "D10",
    "name": "Tag input",
    "screens": [
      "search"
    ],
    "trigger": "견적 검색어 입력 → 자동 추천 → 선택/제거",
    "scope": "자동 추천 드롭다운 연결. 중복 태그·긴 한글·IME 조합·키보드 포커스를 보존.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-tag-input",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "search/suggestions",
      "behavior": "검색결과·상세 진입·태그 제거와 원래 결과 복원",
      "remaining": "중복 긴 한글 IME·전체 추천 분기"
    }
  },
  {
    "id": "D11",
    "name": "Password strength",
    "screens": [
      "password",
      "signup"
    ],
    "trigger": "비밀번호 입력/삭제·강도 변화·표시/숨기기",
    "scope": "지정 영상 6 Liquid Link와 결합. 다른 번호 효과는 가져오지 않음. 강도 표현과 인증 성공은 구분. 오류 메시지 영역 추가 금지.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-password-strength",
      "https://drive.google.com/file/d/19UvOWFPC34yazuZ3qBK037odyWYchx0K/view",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "signup/empty",
      "behavior": "지정 영상 6번을 관찰해 구현한 300ms 강도 경계 연결. 단계 1→2, 133ms·202ms 프레임과 삭제/붙여넣기 방향 검증",
      "remaining": "원저작자 JS/CSS 미확보, 실제 가입자·모든 IME 엔진별 비교"
    }
  },
  {
    "id": "D12",
    "name": "stack-panel",
    "screens": [
      "profile"
    ],
    "trigger": "패널 내부 루트 → 상세 → 뒤로, 스와이프 취소",
    "scope": "Kokonut Stack panel이 실제 원문. T06 page-side-by-side의 구체 적용 대상. 모든 페이지의 좌측 이동 효과를 되살리는 지시가 아님.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_GITHUB_REGISTRY_AND_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/navigation/stack-panel",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "profile/menu",
      "behavior": "같은 URL에서 프로필 상세·내부 계정 패널 열고 닫기",
      "remaining": "패널 간 스와이프 취소의 모든 경계"
    }
  },
  {
    "id": "D13",
    "name": "Toggle switch",
    "screens": [
      "profile",
      "store-settings",
      "common"
    ],
    "trigger": "토글 켜기/끄기·저장 중·실패 복원",
    "scope": "T07 toggle로 정교화. 첫 마운트의 불필요한 꺼짐 모션을 막고 실제 값·최종 thumb 위치를 맞춤.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-toggle-switch",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "profile/notification",
      "behavior": "알림 스위치 켜기·끄기, 계정 설정 재진입",
      "remaining": "각 저장 실패의 thumb 위치 복원"
    }
  },
  {
    "id": "K01",
    "name": "smooth-drawer",
    "screens": [
      "login",
      "signup",
      "drawer",
      "onboarding"
    ],
    "trigger": "로그인·가입·기능 하단 패널 열기/드래그/스냅/닫기",
    "scope": "T08 panel-reveal과 지정 영상 Snap Points/Drag to Close/Rubber Band를 하나의 제어기로 결합. 같은 transform을 여러 엔진이 덮어쓰지 않음. 푸터 역시트도 별도 조건으로 연결.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/navigation/smooth-drawer",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "login/empty",
      "behavior": "가입·로그인 시트 열기·원래 온보딩 단계로 닫기",
      "remaining": "기기별 drag 시작 축·스냅/저항 전체 대조"
    }
  },
  {
    "id": "K02",
    "name": "scroll-index",
    "screens": [
      "terms"
    ],
    "trigger": "약관 스크롤·절 인덱스 선택",
    "scope": "한글 약관과 인덱스. 끝까지 읽은 상태를 동의한 상태로 자동 처리하지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/navigation/scroll-index",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "terms/required",
      "behavior": "가입 약관·동의 값을 보존하는 화면 훅",
      "remaining": "절 인덱스 클릭과 끝까지 읽기·동의 분리 실측"
    }
  },
  {
    "id": "K03",
    "name": "wheel-picker",
    "screens": [
      "drawer",
      "q4"
    ],
    "trigger": "휠 항목 드래그·플릭·키보드·확정/취소",
    "scope": "휠 선택이 필요한 실제 입력에 적용. 관성과 스냅이 최종 한 값에 정착하며 단위·라벨을 한글화.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/inputs/wheel-picker",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "drawer/wheel",
      "behavior": "상담 일정에서 날짜·시각·분 선택과 취소",
      "remaining": "관성 플릭과 모든 휠 키보드 값의 정착 시간"
    }
  },
  {
    "id": "K04",
    "name": "bento-grid",
    "screens": [
      "admin-overview",
      "admin-analytics",
      "admin-billing"
    ],
    "trigger": "관리자 위젯 이동·크기 변경·배치 저장",
    "scope": "공식 현재 이름 Widget Grid, 사용자 URL bento-grid 식별 유지. 허용된 지표와 배치 상태를 실제 기능에 연결. 빈 장식 카드로 완료 처리하지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/cards/bento-grid",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-overview/normal",
      "behavior": "위젯 위치 변경·너비 변경·적용",
      "remaining": "사업장별 서버 영속 배치 및 타 기기 재조회"
    }
  },
  {
    "id": "K05",
    "name": "receipt-printer",
    "screens": [
      "receipt",
      "admin-billing"
    ],
    "trigger": "영수증 발급 요청 → 발급 중 → 실제 완료",
    "scope": "한글 영수증 내용과 실제 문서/다운로드에 연결. 인쇄 애니메이션만으로 발급 완료라고 하지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/cards/receipt-printer",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "receipt/before",
      "behavior": "영수증 요청→상태 전환의 제어된 관리자 검수 훅",
      "remaining": "실제 문서 발급·다운로드 권한 및 파일 검증"
    }
  },
  {
    "id": "K06",
    "name": "metric-card",
    "screens": [
      "admin-overview",
      "admin-analytics",
      "admin-billing"
    ],
    "trigger": "그래프 pointer/키보드 이동에 따른 값·툴팁·선 이동",
    "scope": "사용자가 지정한 그래프 hover 중심. 금액·툴팁·선이 같은 데이터 인덱스를 가리킴. 터치 대안 유지.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/cards/metric-card",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-analytics/normal",
      "behavior": "그래프 인덱스를 선택해 대응하는 값과 툴팁 확인",
      "remaining": "승인 운영지표의 실제 금액·포인터 곡선"
    }
  },
  {
    "id": "K07",
    "name": "spending-ring",
    "screens": [
      "admin-overview",
      "admin-analytics",
      "admin-billing"
    ],
    "trigger": "원형 그래프 진입·값/선택 변화",
    "scope": "사용자가 지정한 원형 그래프 효과. 한글 범주·합계를 실제 데이터와 연결. 데모의 모든 추가 조작을 제품 필수로 확장하지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/cards/spending-ring",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-overview/normal",
      "behavior": "원형 차트 범례 포커스와 중앙 값의 대응",
      "remaining": "실 운영 합계와 원형 진입 시각 비교"
    }
  },
  {
    "id": "K08",
    "name": "profile-dropdown",
    "screens": [
      "profile"
    ],
    "trigger": "프로필 열기·항목 선택·닫기",
    "scope": "공식 현재 이름 Account Menu, 사용자 URL profile-dropdown 유지. 후속 QA 원문의 계정 패널 내 사업자 정보·구성원·권한 요구를 따름. 별도 역할 허브 이동으로 대체하지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/navigation/profile-dropdown",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "profile/menu",
      "behavior": "계정 패널에서 구성원·권한 값을 보고 같은 화면에서 돌아오기",
      "remaining": "실사업자 권한 부여 상태에서 사용성 검수"
    }
  },
  {
    "id": "K09",
    "name": "signature-pad",
    "screens": [
      "signature"
    ],
    "trigger": "증빙 제출·전자계약 서명 작성/지우기/제출",
    "scope": "sign here 왼쪽 X는 제거 가능. 크기 변경에도 서명 획 보존. 모션 QA가 실제 전자계약 성립을 의미하지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/inputs/signature-pad",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "signature/empty",
      "behavior": "서명 이미지 미리보기·초점·빈 서명 거부·제출중/검토 상태",
      "remaining": "실제 전자계약 체결·서명 리사이즈 전 획 보존"
    }
  },
  {
    "id": "K10",
    "name": "amount-pad",
    "screens": [
      "admin-billing",
      "consumer-checkout"
    ],
    "trigger": "청구 계정 선택·금액 입력/삭제·제출",
    "scope": "상단 계정 선택 가능. 원화·한글·자리수 처리. 실제 별도 청구가 필요한 흐름에서만 사용.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/inputs/amount-pad",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-billing/draft",
      "behavior": "청구 입력 패드 숫자 누적·삭제·빈 금액 처리 훅",
      "remaining": "실 청구 계정 선택과 실제 청구서 발행"
    }
  },
  {
    "id": "K11",
    "name": "card-field",
    "screens": [
      "business"
    ],
    "trigger": "사업자등록번호 입력 → 인증하기 → 실제 검증 결과",
    "scope": "카드 결제 UI를 사업자 검증으로 개량. 등록증 업로드와 번호 입력 모두 필요. 업태·업종 필수. 형식 검사를 국세청 등 실제 인증 성공으로 표시하지 않음.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_REGISTRY_AND_PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/inputs/card-field",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "business/empty",
      "behavior": "업태·업종 입력과 검증중/확인·오류·증빙 제출 경로",
      "remaining": "외부 기관의 실제 사업자 인증 성공"
    }
  },
  {
    "id": "T01",
    "name": "skeleton-loader-and-reveal",
    "screens": [
      "common",
      "quote-wait",
      "search",
      "supplier-prices"
    ],
    "trigger": "비동기 목록/카드 로딩 → 응답/실패",
    "scope": "스켈레톤 정교화 필수. 실제 내용의 자리를 보존하고 reveal로 전환. 오류/오프라인에서 무한 스켈레톤을 남기지 않음.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=skeleton-loader-and-reveal",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "common/loading",
      "behavior": "세션/목록 비동기 요청과 스켈레톤 전환 및 실패 해제",
      "remaining": "모든 역할의 오프라인 그래프 원본 비교"
    }
  },
  {
    "id": "T02",
    "name": "card-resize",
    "screens": [
      "q3",
      "q4",
      "common",
      "profile",
      "supplier-prices"
    ],
    "trigger": "아코디언·카드·팝업·드로어의 콘텐츠/크기 변화",
    "scope": "리사이즈 정교화 필수. 높이 측정 루프·중간 콘텐츠 잘림·지터를 없앰. Q3 내부 사업장 구조는 Q4 기준과 맞춤.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=card-resize",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "common/default",
      "behavior": "카드 접기·확장, 통합 상세 견적의 Q3/Q4 구조 전환",
      "remaining": "모든 카드 높이에서 중간 프레임 지터"
    }
  },
  {
    "id": "T03",
    "name": "error-state-shake",
    "screens": [
      "common",
      "login",
      "signup",
      "otp",
      "password",
      "q2",
      "supplier-prices"
    ],
    "trigger": "입력/검증/OTP 실패가 확정될 때",
    "scope": "한 오류에 한 번 짧게 흔들고 시각 상태로 표시. 최신 사용자 지시에 따라 가시적 입력 오류 설명 없이 높이 유지. 하단 문구를 내부 overlay로 옮기는 것도 충족 아님. aria-invalid·sr-only 접근 설명·포커스 연결은 보존. 사용자가 별도 지정한 대기 오류 상태 카피는 유지.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=error-state-shake",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "common/error",
      "behavior": "입력 오류 때 접근성 상태, 시각 설명 숨김과 셀 위치 유지",
      "remaining": "모든 OTP·가입 폼의 한 오류당 진동 횟수"
    }
  },
  {
    "id": "T04",
    "name": "menu-dropdown",
    "screens": [
      "q3",
      "q4",
      "search",
      "common",
      "supplier-prices"
    ],
    "trigger": "D04 드롭다운 및 메뉴 진입/퇴장",
    "scope": "trigger에 맞는 transform origin. 닫기 중 포커스 누수·연속 클릭 경합·아래 레이아웃 밀림 없이 동작.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=menu-dropdown",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "common/default",
      "behavior": "선택창 열기·닫기·선택 후 원래 레이아웃",
      "remaining": "연속 클릭 중 포커스 누수 및 구형 브라우저"
    }
  },
  {
    "id": "T05",
    "name": "learn-more-hover",
    "screens": [
      "admin-*"
    ],
    "trigger": "PC 관리자 하위 메뉴 > hover",
    "scope": "뎁스 아이콘만 정교화. 라벨 폭·행 높이는 고정. 터치에 hover를 강제하지 않음.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=learn-more-hover",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "admin-overview/normal",
      "behavior": "하위 메뉴 확장 시 뎁스 아이콘 회전과 메뉴 배경",
      "remaining": "아이콘 hover만의 원본 정량 대조"
    }
  },
  {
    "id": "T06",
    "name": "page-side-by-side",
    "screens": [
      "profile"
    ],
    "trigger": "D12 내부 패널 전진/뒤로",
    "scope": "내부 Stack panel 전환만. Figma가 제거한 전체 장면 좌측 이동의 복구로 해석하지 않음.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=page-side-by-side",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "profile/menu",
      "behavior": "계정 패널 내 상세 이동과 닫기",
      "remaining": "내부 panel별 원본 동선·시간 곡선"
    }
  },
  {
    "id": "T07",
    "name": "toggle",
    "screens": [
      "profile",
      "store-settings",
      "common"
    ],
    "trigger": "D13 토글 상태 변경",
    "scope": "track 색과 thumb 이동 동기화. 초기 렌더·연속 입력·실패 복원을 검수.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=toggle",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "profile/notification",
      "behavior": "스위치 클릭 후 값·aria-checked 상호 일치",
      "remaining": "연타·저장 실패 시 thumb 타이밍"
    }
  },
  {
    "id": "T08",
    "name": "panel-reveal",
    "screens": [
      "login",
      "signup",
      "drawer",
      "onboarding"
    ],
    "trigger": "K01 하단 패널 진입/퇴장",
    "scope": "드래그 중 직접 제어, 놓은 뒤 스냅. 패널과 본문 이중 스크롤·다중 transform 제어를 방지.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=panel-reveal",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "login/empty",
      "behavior": "하단 시트 열기, 닫기 후 원래 소개 화면 복원",
      "remaining": "기기별 동작 곡선 원본 대조"
    }
  },
  {
    "id": "T09",
    "name": "notification-badge",
    "screens": [
      "profile",
      "onboarding",
      "admin-overview"
    ],
    "trigger": "알림 수 증가·감소·읽음 처리",
    "scope": "배지 숫자만 변하고 부모 버튼 정렬 유지. Figma Goo menu 알림에도 연결. 정지 상태를 반복 재생하지 않음.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=notification-badge",
      "https://drive.google.com/file/d/1-5PJriM6xr_xTk4iZp-tiOdCPBZaS-Bk/view"
    ],
    "feedback": [],
    "application": {
      "example": "onboarding/member-1",
      "behavior": "검수 알림을 읽으면 1→0, 역할 화면은 접근 가능한 활동 ID·이력 버전과 세션 내 암호화 읽음 처리",
      "remaining": "외부 푸시 발송·여러 기기 간 읽음 동기화"
    }
  },
  {
    "id": "G01",
    "name": "transitions-dev skill",
    "screens": [
      "*"
    ],
    "trigger": "페이지/상태/패널 변화",
    "scope": "지정 recipe를 대상·트리거에 맞게 적용하고 동일 빌드의 IA QA에서 실제 전환 검증. 스킬을 보관·인용한 것만으로 적용 완료로 집계하지 않음.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_SKILL_ARCHIVED",
    "links": [
      "https://transitions.dev/skill.html",
      "https://github.com/Jakubantalik/transitions.dev",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008961392",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2008961392"
    ],
    "application": {
      "example": "common/default",
      "behavior": "화면별 지정 레시피 원문과 적용 경로·조건 연결",
      "remaining": "일괄 적용 판정 없이 개별 행과 원본 비교"
    }
  },
  {
    "id": "H01",
    "name": "fadeOutLeft → fadeIn",
    "screens": [
      "onboarding"
    ],
    "trigger": "기존 타이틀 퇴장/새 타이틀 진입",
    "scope": "기존 좌측 이동을 제거하라는 Figma 2008961392가 우선한다. 빠졌다는 이유로 fadeOutLeft를 복구하지 않는다. 새 장면별 전환은 G01을 따른다.",
    "status": "SUPERSEDED",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008961392",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2008961392"
    ],
    "application": {
      "example": "onboarding/guest-1",
      "behavior": "후속 Figma 요청이 전체 장면 좌측 퇴장을 대체",
      "remaining": "과거 전체 좌측 퇴장 요구는 후속 지시로 종료"
    }
  },
  {
    "id": "H02",
    "name": "fadeOutUp → fadeIn",
    "screens": [
      "quote-wait",
      "quote-result"
    ],
    "trigger": "결과 응답 시 타이틀 교체",
    "scope": "이전 명시 지시는 이력으로 보존. 현재 모든 장면은 Figma와 G01 기준으로 정의하며, 새 그래프→카드 흐름을 과거 타이틀 전환만으로 대체하지 않는다. 남아 있는 대기→결과 진입에는 최신 실제 장면과 대조해 수직 퇴장/페이드가 적합한지 확인.",
    "status": "RECONCILE_WITH_LATEST_SCENE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008961392",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2008961392"
    ],
    "application": {
      "example": "quote-wait/comparing",
      "behavior": "서버 대기 장면의 카피 교체와 결과 화면 진입 경계",
      "remaining": "대기/결과 원본 영상 프레임별 완전 일치"
    }
  },
  {
    "id": "W01",
    "name": "Banner stacking",
    "screens": [
      "quote-wait"
    ],
    "trigger": "등장-비교 Blank 0.6초 종료 + Burst 진행 2.9초 = 전체 3.5초",
    "scope": "500ms 간격, 겹친 배너 최대 3장. 배너 안 항목은 폭이 허용하면 3~4개까지 보이며 최대 길이 기준으로 말줄임. 배너 개수와 한 배너 안 값 개수를 혼동하지 않음. 아바타 앞에 희미하게 비치지 않게 뒤 영역에서 진입. 클릭·펼치기 없음. 실제 빠른 완료/오류는 남은 배너를 기다리지 않음.",
    "status": "ACTIVE",
    "sourceState": "PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=banner-stacking"
    ],
    "feedback": [],
    "application": {
      "example": "quote-wait/entry",
      "behavior": "등장 장면·비교 시작 경계 및 빠른 응답 게이트",
      "remaining": "보관 영상과 네트워크별 시간 편차 실측"
    }
  },
  {
    "id": "W02",
    "name": "BLOUB R4 상태 JSON / avatar timeline",
    "screens": [
      "quote-wait"
    ],
    "trigger": "실제 요청 상태와 JSON 장면 경계",
    "scope": "기존 JSON의 Blank/Burst 시간을 임의 변경하지 않음. 비교중/지연은 항목과 실제 pending에 따라 연결. 서버 오류·offline 시 스택 비활성화 후 오류 애니메이션, 완료 시 자동 결과. 오류 전용 자산이 없으면 임시 상태를 명시하며 제공 완료로 가장하지 않음. 몽타주 끝까지 기다리지 않음.",
    "status": "ACTIVE",
    "sourceState": "USER_ASSET_ARCHIVE_PRESENT",
    "links": [],
    "feedback": [],
    "application": {
      "example": "quote-wait/comparing",
      "behavior": "JSON 장면과 응답/실패 상태에 따른 타임라인",
      "remaining": "원본 전용 오류 몽타주 미확보, 오류 장면은 기존 정적 자산 사용"
    }
  },
  {
    "id": "W03",
    "name": "Text states swap",
    "screens": [
      "quote-wait",
      "quote-result"
    ],
    "trigger": "상태 변경·현재가 카드 선택",
    "scope": "지정 여섯 대기 카피와 최신 결과 카피에 적용. 두 줄도 한 줄과 같은 수직 중심; 완료는 텍스트 없음. 대기 메시지 교체와 thinking을 같은 transform에 중복 적용하지 않음.",
    "status": "ACTIVE",
    "sourceState": "PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=text-states-swap",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008655044",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008654907",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2008655044",
      "2008654907"
    ],
    "application": {
      "example": "quote-wait/delayed",
      "behavior": "대기·완료·오류 메시지 교체와 완료 텍스트 처리",
      "remaining": "모든 2줄 카피 중심과 원본 속도"
    }
  },
  {
    "id": "W04",
    "name": "Thinking states",
    "screens": [
      "quote-wait"
    ],
    "trigger": "해당 장면이 실제 pending인 동안",
    "scope": "오래 걸리는 상태에만 적용. 완료·오류·화면 제거에서 중단. 상태 메시지 크기는 작게 조정하고 높이·중심 유지.",
    "status": "ACTIVE",
    "sourceState": "PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=thinking-states"
    ],
    "feedback": [],
    "application": {
      "example": "quote-wait/delayed",
      "behavior": "비동기 지연·오류·완료의 반복상태 중단",
      "remaining": "모바일 장시간 pending/오프라인 재진입 프레임"
    }
  },
  {
    "id": "R01",
    "name": "Spinning counter",
    "screens": [
      "quote-result"
    ],
    "trigger": "유효 결과의 최초 진입",
    "scope": "한 자리 0부터 필요한 자리수로 증가하고 신규 막대와 진행값을 동기화. Figma 후속 지시로 현재가 그래프/금액은 처음부터 정적 표시. 만료 화면은 증가 모션 없음.",
    "status": "ACTIVE_SCOPE_NARROWED",
    "sourceState": "PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=spinning-counter",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008712781",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008695990",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008639459"
    ],
    "feedback": [
      "2008712781",
      "2008695990",
      "2008639459",
      "2008639267",
      "2008941148"
    ],
    "application": {
      "example": "quote-result/saving",
      "behavior": "신규 가격만 영→최종 자리로 회전하며 막대와 동기화, 현재가는 정적",
      "remaining": "모든 기기에서 원본과 시각 타이밍 검수"
    }
  },
  {
    "id": "R02",
    "name": "Avatar group hover",
    "screens": [
      "quote-result"
    ],
    "trigger": "hover 가능한 포인터의 단일 카드 hover",
    "scope": "초기 지시: 한 카드만 반응, 이웃/이미 확대된 카드에 전파 금지. 후속 지시에서 hover 확대는 없애고 클릭 확대를 요청했으므로 원문 scale을 무조건 적용하지 않는다. 최신 Figma 그래프→카드 구조와 충돌하면 대체 이력으로 기록.",
    "status": "PARTIALLY_SUPERSEDED",
    "sourceState": "PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=avatar-group-hover"
    ],
    "feedback": [],
    "application": {
      "example": "quote-result/saving",
      "behavior": "클릭한 그래프만 상세로 확대하고 후면 카드 선택",
      "remaining": "후속 지시에 따른 클릭 확대·잔여 요소 오프셋"
    }
  },
  {
    "id": "B01",
    "name": "CODE1 jelly interactive / motion v2",
    "screens": [
      "onboarding",
      "login",
      "quote-result"
    ],
    "trigger": "10~15초 무작위 idle 간격 및 비로그인 click/touch",
    "scope": "정지 이미지로 대체하지 않음. 10~15초는 잔잔한 동작 사이 간격. 비로그인 클릭은 랜덤 모션, 드롭다운 금지. 실제 O와의 시각 비율·하단 정렬·간격 유지.",
    "status": "ACTIVE",
    "sourceState": "USER_ASSET_ARCHIVE_PRESENT",
    "links": [
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009173058",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009012434",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009173058",
      "2009012434"
    ],
    "application": {
      "example": "onboarding/guest-1",
      "behavior": "원본 CODE1을 누르거나 키보드로 작동, 10–15초 휴지",
      "remaining": "전체 화면의 로고 간격·세로 위치 원본 대조"
    }
  },
  {
    "id": "O01",
    "name": "3 Onboarding / pagination structure",
    "screens": [
      "onboarding"
    ],
    "trigger": "버튼·화면 드래그·닷 드래그",
    "scope": "지정 영상 3 Onboarding의 복합 하단 구조만 참고. 이후 Figma의 인증 상태별 4단계가 옛 5장을 대체한다. 지정하지 않은 Cube Turn/Stack Slide 등은 혼합하지 않는다.",
    "status": "ACTIVE_STRUCTURE_REVISED_CONTENT",
    "sourceState": "SELECTED_MEDIA_OBSERVATIONS_ARCHIVED",
    "links": [],
    "feedback": [],
    "application": {
      "example": "onboarding/guest-2",
      "behavior": "비회원 4단계와 회원 분기, 닷·다음·상세 견적 열기",
      "remaining": "보관 영상과 모든 드래그 정량 비교"
    }
  },
  {
    "id": "F01",
    "name": "Pagination dots",
    "screens": [
      "onboarding"
    ],
    "trigger": "선택 변경·화면 또는 닷 drag",
    "scope": "활성 pill의 탄성 움직임만 사용. 데모의 자동 넘김·가로 슬라이드 이동은 가져오지 않음. 화면·닷 드래그는 별도 제어기로 유지. 인증된 3→4와 비회원 4단계의 닷 노출 조건 구분.",
    "status": "ACTIVE",
    "sourceState": "OFFICIAL_COPY_CODE_ARCHIVED",
    "links": [
      "https://designbookmark.com/motion#db-pagination-dots",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008946365",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009049901",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2008946365",
      "2009049901"
    ],
    "application": {
      "example": "onboarding/guest-2",
      "behavior": "4단계 선택·드래그에 앞/뒤 spring 520/34·140/18, 회원4 닷 숨김·비회원4 닷 유지",
      "remaining": "원본 영상과 각 손가락 드래그 속도별 오차"
    }
  },
  {
    "id": "F02",
    "name": "2 Magnetic Pull",
    "screens": [
      "onboarding",
      "quote-result",
      "common"
    ],
    "trigger": "pointer 접근·hover·클릭, 터치에 맞는 반응",
    "scope": "버튼 - 2 마그네틱 풀.mp4의 2번 효과만. 고정 클릭 영역·중복 요청 방지. 영상 관찰은 원저작자 JS/CSS 소스 확보가 아님. 이동량·spring 수치는 검수 조정값이지 사용자 확정값이 아님.",
    "status": "ACTIVE",
    "sourceState": "SELECTED_MEDIA_OBSERVATIONS_ARCHIVED",
    "links": [
      "https://drive.google.com/file/d/1byd_YY00YWmpnuQQNzKKTTfPqhfuwwCu/view",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009019251",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009019251"
    ],
    "application": {
      "example": "onboarding/member-4",
      "behavior": "견적 모드의 주 버튼과 결과 화면의 행동 버튼에서 클릭 영역은 고정하고 포인터를 따라 안쪽 면과 라벨을 이동",
      "remaining": "영상과 실제 손가락·마우스에서 이동량과 복귀 속도 비교"
    }
  },
  {
    "id": "F03",
    "name": "1 Snap Points",
    "screens": [
      "login",
      "signup",
      "drawer",
      "onboarding"
    ],
    "trigger": "시트 drag 후 release",
    "scope": "바텀 시트 - 1 스냅 포인트, 2 드래그 투 클로즈, 3 러버 밴드.mp4의 지정 번호만. 콘텐츠/화면에 맞는 단계 높이에 스냅. 영상 수치를 모든 화면의 고정 px로 복제하지 않음.",
    "status": "ACTIVE",
    "sourceState": "SELECTED_MEDIA_OBSERVATIONS_ARCHIVED",
    "links": [
      "https://drive.google.com/file/d/1zOvDV267oZiwwk-VJE9KAftvmvyxgIgE/view",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009170365",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009065105",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009170365",
      "2009065105"
    ],
    "application": {
      "example": "onboarding/company",
      "behavior": "역시트 짧은 위쪽 드래그 뒤 원위치, 78px 아래 드래그 뒤 중간 위치에 정착",
      "remaining": "다른 화면·iOS에서 콘텐츠별 멈춤 높이와 속도"
    }
  },
  {
    "id": "F04",
    "name": "2 Drag to Close",
    "screens": [
      "login",
      "signup",
      "drawer",
      "onboarding"
    ],
    "trigger": "시트 아래쪽 drag 후 release",
    "scope": "바텀 시트 - 1 스냅 포인트, 2 드래그 투 클로즈, 3 러버 밴드.mp4의 지정 번호만. 내부 스크롤과 닫기 제스처 구분. 짧은 drag 취소, 닫은 뒤 포커스 복원.",
    "status": "ACTIVE",
    "sourceState": "SELECTED_MEDIA_OBSERVATIONS_ARCHIVED",
    "links": [
      "https://drive.google.com/file/d/1zOvDV267oZiwwk-VJE9KAftvmvyxgIgE/view",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009170365",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009065105",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009170365",
      "2009065105"
    ],
    "application": {
      "example": "onboarding/company",
      "behavior": "중간 위치에서 약 98px 아래로 당겨 닫힌 뒤 원 CTA 포커스 복원",
      "remaining": "내부 긴 콘텐츠의 손가락 스크롤·취소"
    }
  },
  {
    "id": "F05",
    "name": "3 Rubber Band",
    "screens": [
      "login",
      "signup",
      "drawer",
      "onboarding"
    ],
    "trigger": "범위 밖 drag 후 release",
    "scope": "바텀 시트 - 1 스냅 포인트, 2 드래그 투 클로즈, 3 러버 밴드.mp4의 지정 번호만. 범위 밖 저항과 복원. 같은 축의 스크롤·spring·transition 충돌 방지.",
    "status": "ACTIVE",
    "sourceState": "SELECTED_MEDIA_OBSERVATIONS_ARCHIVED",
    "links": [
      "https://drive.google.com/file/d/1zOvDV267oZiwwk-VJE9KAftvmvyxgIgE/view",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009170365",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009065105",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009170365",
      "2009065105"
    ],
    "application": {
      "example": "onboarding/company",
      "behavior": "30px 위쪽 드래그에서 실제 저항 변위가 0~-30px 사이, 놓으면 복구",
      "remaining": "물리터치 원본 저항 곡선 대조"
    }
  },
  {
    "id": "F06",
    "name": "견적 버튼 → 작성 화면 정·역모핑",
    "screens": [
      "onboarding"
    ],
    "trigger": "견적 버튼 클릭, 브라우저 뒤로, iPhone 우측 swipe",
    "scope": "헤더를 제외한 메인 영역으로 버튼이 모핑. 뒤로가기는 버튼으로 역모핑. 입력 상태·포커스·히스토리를 연결하며 새 독립 데모로 대체하지 않음.",
    "status": "ACTIVE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://transitions.dev/skill.html",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009150880",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009026810",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009150880",
      "2009026810"
    ],
    "application": {
      "example": "onboarding/member-4",
      "behavior": "견적 버튼의 메인 영역 확대와 같은 세션 작성 화면 이동, 복귀 역모핑·초점 훅",
      "remaining": "iPhone 실제 기기 우측 스와이프 역모핑"
    }
  },
  {
    "id": "F07",
    "name": "회원 온보딩 3→4 닷 소멸·하단 버튼 상승 모핑",
    "screens": [
      "onboarding"
    ],
    "trigger": "회원의 다음 단계 진입",
    "scope": "회원 전환에서 닷이 사라지고 하단 견적 버튼이 상승·모핑. 비회원 4단계는 4번 선택닷 유지. 도중 인증 시 원래 호출 단계 복귀, 이미 로그인한 최초 진입은 모드 선택.",
    "status": "ACTIVE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://transitions.dev/skill.html",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009049901",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009050282",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009072394"
    ],
    "feedback": [
      "2009049901",
      "2009050282",
      "2009072394",
      "2009073698"
    ],
    "application": {
      "example": "onboarding/member-3",
      "behavior": "회원 3→4 닷 fade와 하단 버튼을 실제 모드 카드 위치·크기로 변형, 비회원4 닷 유지",
      "remaining": "3→4 도중 로그인·중간 프레임 궤적"
    }
  },
  {
    "id": "F08",
    "name": "로그인 브랜드 우측 탄성 이동 / dot fade-out",
    "screens": [
      "onboarding",
      "login",
      "quote-result"
    ],
    "trigger": "로그인 성공 상태 전환",
    "scope": "아이콘 우측 이동에 가속·탄성·젤리 복원, 우측/상단 여백. 점은 fade-out. 기존 idle 모션은 유지. 헤더 DOM을 매번 새로 만들어 재생을 초기화하지 않음.",
    "status": "ACTIVE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009012434",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009013511",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009012434",
      "2009013511"
    ],
    "application": {
      "example": "onboarding/guest-2",
      "behavior": "게스트 2→3 단계 이동에서 동일 헤더 SVG 노드 유지, 원본 CODE1 이벤트 관찰",
      "remaining": "인증 직후의 우측 이동·점 fade 동작 원본 대조"
    }
  },
  {
    "id": "F09",
    "name": "Pro gradient text",
    "screens": [
      "onboarding",
      "login",
      "quote-result"
    ],
    "trigger": "로그인 성공 전환",
    "scope": "공개 미리보기 참고와 유료 원문 확보를 구분. 원문 접근 제한 기록 보존, 제한을 우회하지 않음. 접근 불가 시 독자 구현임을 명시하고 원본 적용 완료로 기록하지 않음.",
    "status": "ACTIVE",
    "sourceState": "PUBLIC_PREVIEW_ONLY_SOURCE_ACCESS_LIMITED",
    "links": [
      "https://transitions.dev/detail.html?t=pro-gradient-text",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009013511",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009013511"
    ],
    "application": {
      "example": "login/success",
      "behavior": "공개 미리보기·원문 접근 제한을 기록",
      "remaining": "Pro 원문 미확보, 패리티 판정 대기"
    }
  },
  {
    "id": "F10",
    "name": "AnimateIcons Search / File Search",
    "screens": [
      "onboarding"
    ],
    "trigger": "최초 등장·hover·click 및 버튼별 독립 2~3초 idle",
    "scope": "공통 아이콘 라이브러리로 관리. 원본 SVG/모션을 보존한 어댑터 또는 공식 vanilla 경로. 브랜드의 10~15초와 혼동하지 않음. hover는 PC 조건이며 모바일은 등장·터치·idle 지원.",
    "status": "ACTIVE",
    "sourceState": "PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://animateicons.in/icons/lucide",
      "https://github.com/Avijit07x/animateicons",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009134053",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009134053"
    ],
    "application": {
      "example": "onboarding/member-4",
      "behavior": "지정 SVG와 키프레임을 두 버튼에 적용, 각 버튼의 독립 idle 2–3초·reduced·터치·중단 연결",
      "remaining": "실기기에서 지정 원본과 클릭 전후 움직임 대조"
    }
  },
  {
    "id": "F11",
    "name": "Goo menu",
    "screens": [
      "passes",
      "onboarding",
      "profile"
    ],
    "trigger": "플로팅 버튼 열기·닫기",
    "scope": "Goo menu의 확장 구조. 메뉴 항목에는 F12의 뻗어나가는 모션만 결합하며 버튼끼리 끈적거리면 안 됨. 알림 숫자는 T09. 계란 시세와 역할별 배송 요청/오더패스 두 항목만; 세 번째 미정 항목 추가 금지.",
    "status": "ACTIVE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://designbookmark.com/motion#db-goo-menu",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009041300",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009041300"
    ],
    "application": {
      "example": "onboarding/member-1",
      "behavior": "빠른 메뉴 두 항목 표시·Escape로 닫기",
      "remaining": "공개 카드와 Copy 버튼 확인, 실제 복사 코드 미확보"
    }
  },
  {
    "id": "F12",
    "name": "Liquid Taffy speed dial",
    "screens": [
      "passes",
      "onboarding",
      "profile"
    ],
    "trigger": "메뉴 열림/닫힘",
    "scope": "speed dial의 뻗어나가는 모션만 적용. 버튼의 끈적이는 결합 형태는 제외. 다른 Liquid Taffy 데모를 전체 UI에 확장하지 않음.",
    "status": "ACTIVE",
    "sourceState": "PINNED_PUBLIC_SOURCE_ARCHIVED",
    "links": [
      "https://github.com/arknow91/liquid-taffy",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009041300"
    ],
    "feedback": [
      "2009041300"
    ],
    "application": {
      "example": "onboarding/member-1",
      "behavior": "빠른 메뉴 항목의 펼침/복귀와 터치·키보드 접근",
      "remaining": "원본 speed dial의 궤적·속도 검수"
    }
  },
  {
    "id": "F13",
    "name": "Boarding Pass",
    "screens": [
      "passes"
    ],
    "trigger": "오더패스 표시·정보/상태 변경·열기",
    "scope": "브랜드·식자재 아이콘·견적 상태/만료에 맞춰 개량. 상태·최종 디자인은 QA 대상. 원문 바코드는 장식 SVG이며 실제 조회 식별코드는 별도 연결. 원문의 QA 코드 표현을 임의 QR 확정으로 바꾸지 않음.",
    "status": "ACTIVE",
    "sourceState": "PINNED_SOURCE_ARCHIVED",
    "links": [
      "https://kokonutui.com/docs/cards/boarding-pass",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009041300",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009041300"
    ],
    "application": {
      "example": "passes/grid",
      "behavior": "패스 상태·티켓 상세/만료·진행 및 보기 유지 확인",
      "remaining": "실운영 바코드 조회·Figma 시안 최종 판정"
    }
  },
  {
    "id": "F14",
    "name": "사업자 정보 역방향 시트",
    "screens": [
      "onboarding"
    ],
    "trigger": "사업자 정보 열기, 본문을 아래로 drag하여 복귀",
    "scope": "고정 헤더 아래 본문을 위로 약 1/3 올리고 하단 모서리 라운드, 배경 focus-out/blur, 시각 애니메이션 일시 정지. 서버 요청·절대 만료는 멈추지 않음. 영상 자체의 장면이 아니라 Figma 요구다.",
    "status": "ACTIVE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://kokonutui.com/docs/navigation/smooth-drawer",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2009065105",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2013415701",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2009065105",
      "2013415701"
    ],
    "application": {
      "example": "onboarding/company",
      "behavior": "사업자 정보 열기·배경 비활성·핸들 드래그 복귀·기존 포커스 복원",
      "remaining": "본문 전체 드래그와 1/3 높이 실기기 비율"
    }
  },
  {
    "id": "F15",
    "name": "결과 그래프 → 상세 카드 모핑",
    "screens": [
      "quote-result"
    ],
    "trigger": "그래프 터치·클릭·후면 카드 선택",
    "scope": "같은 요소가 연속적으로 전환. 신규/현재 선택에 따라 카드 겹침·색상·상단 카피를 Figma와 일치. 상세 내용은 모핑 후 표시. 최초 사용자 조작 안내는 첫 사용 조건으로 검수.",
    "status": "ACTIVE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://transitions.dev/skill.html",
      "https://transitions.dev/detail.html?t=card-resize",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008653879",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008653916"
    ],
    "feedback": [
      "2008653879",
      "2008653916",
      "2008654010",
      "2008654431"
    ],
    "application": {
      "example": "quote-result/new-detail",
      "behavior": "같은 카드 요소 클릭→상세/후면 선택, 현재/신규 카피·단가 비교",
      "remaining": "원본과 배경 노출/카운트에 미세 잔차"
    }
  },
  {
    "id": "F16",
    "name": "실시간 만료 / 만료 정적 전환",
    "screens": [
      "quote-result"
    ],
    "trigger": "발급+7일의 절대 시각 감소·경계 도달",
    "scope": "이후 Figma의 초 포함 카운트. 카드/화면 전환으로 만료 연장 금지. 만료 페이지 애니메이션 없음. 재비교 팝업 새로운 견적/동일한 조건 분리.",
    "status": "ACTIVE",
    "sourceState": "REFERENCE_IDENTIFIED",
    "links": [
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008654034",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008941148",
      "https://www.figma.com/file/OGc2SUKEvckzYhhowzX7tD#2008944126",
      "https://drive.google.com/drive/folders/1Tk7ETgwhFfhjMLPUnQwldx3-naFrHexq"
    ],
    "feedback": [
      "2008654034",
      "2008941148",
      "2008944126"
    ],
    "application": {
      "example": "quote-result/expired",
      "behavior": "초 카운트가 실제로 바뀌며 만료 고정·재비교 분기 확인",
      "remaining": "실 사업자 발행 7일 경계의 장기 실사용 기록"
    }
  },
  {
    "id": "S01",
    "name": "modal-open-close",
    "screens": [
      "login",
      "signup"
    ],
    "trigger": "기존 공통 팝업/아코디언의 상태 변경",
    "scope": "이 33개 원문 수집에서는 지원 recipe로 별도 보관한 항목이다. 기존 팝업·아코디언 요구를 적용할 때 함께 참조하고 33개 신규 지정 항목에 중복 산입하지 않음.",
    "status": "SUPPORT_REFERENCE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=modal-open-close"
    ],
    "feedback": [],
    "application": {
      "example": "login/empty",
      "behavior": "로그인 모달 열고 닫기·초점 복귀 동작의 지원 출처",
      "remaining": "독립 신규 구현 수에서 제외"
    }
  },
  {
    "id": "S02",
    "name": "accordion",
    "screens": [
      "q3",
      "q4"
    ],
    "trigger": "기존 공통 팝업/아코디언의 상태 변경",
    "scope": "이 33개 원문 수집에서는 지원 recipe로 별도 보관한 항목이다. 기존 팝업·아코디언 요구를 적용할 때 함께 참조하고 33개 신규 지정 항목에 중복 산입하지 않음.",
    "status": "SUPPORT_REFERENCE",
    "sourceState": "PINNED_PUBLIC_RECIPE_ARCHIVED",
    "links": [
      "https://transitions.dev/detail.html?t=accordion"
    ],
    "feedback": [],
    "application": {
      "example": "q3/open",
      "behavior": "Q3·Q4 열기·선택·삭제·확인/취소의 기존 지원 출처",
      "remaining": "독립 신규 구현 수에서 제외"
    }
  }
];
