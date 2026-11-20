// Navigation labels from the approved QA 1.0 HTML, after its route bindings ran.
// The product release catalog owns screen, state, role and artifact identity.
export const approvedRegistry = {
  "login": {
    "description": "이메일 우선·간편 로그인 우선·통합형 배치와 인증 예외를 비교합니다.",
    "routeIds": [
      "F07"
    ],
    "variants": {
      "email": "이메일 우선",
      "social": "간편 로그인 우선",
      "compact": "통합형"
    }
  },
  "signup": {
    "description": "가입 입력·약관 동의·처리 상태를 비교합니다. 소셜 인증은 연결 위치만 표시합니다.",
    "routeIds": [
      "F07"
    ]
  },
  "otp": {
    "description": "6자리 입력·붙여넣기·오류·만료·재전송을 확인합니다.",
    "routeIds": [
      "F07"
    ]
  },
  "password": {
    "description": "계정 존재 여부를 노출하지 않는 안내와 Liquid Link 강도 표시를 비교합니다.",
    "routeIds": [
      "F07"
    ]
  },
  "terms": {
    "description": "필수·선택 동의와 목차 이동을 검토합니다. 확정 약관 원문은 연결 전이며 본문은 빈 문서선으로 표시합니다.",
    "routeIds": [
      "F16"
    ]
  },
  "business": {
    "description": "번호 입력과 등록증 업로드를 분리하고 업태·업종을 필수로 받습니다. 검증 결과는 QA 예시입니다.",
    "routeIds": [
      "F03",
      "F13"
    ]
  },
  "proof": {
    "description": "파일 선택·드롭·10MB 경계·내용 불일치·안전 검사·재시도를 확인합니다.",
    "routeIds": [
      "F04"
    ]
  },
  "signature": {
    "description": "서명 입력·지우기·동의·제출 전후를 비교합니다. 서명과 문서는 저장·전송하지 않습니다.",
    "routeIds": [
      "F04"
    ]
  },
  "passes": {
    "description": "최근 날짜순 격자와 Swipe deck을 같은 카드로 전환합니다. 카드 자체를 드래그할 수 있습니다.",
    "routeIds": [
      "F06"
    ]
  },
  "search": {
    "description": "태그 추천·삭제·검색 결과·상세 패널을 확인합니다.",
    "routeIds": [
      "F06"
    ]
  },
  "profile": {
    "description": "프로필 메뉴, 새 알림 표시, 설정 토글, 권한별 메뉴를 확인합니다.",
    "routeIds": [
      "F07",
      "F13"
    ]
  },
  "drawer": {
    "description": "정보 패널과 기능 패널의 높이, 드래그 닫기, 날짜·시간 휠을 확인합니다.",
    "routeIds": [
      "F02",
      "F14"
    ]
  },
  "common": {
    "description": "Springy input, 오류 흔들림, 로딩→완료, 스켈레톤·리사이즈·토글·드롭다운을 한 화면에서 검토합니다.",
    "routeIds": []
  },
  "q1": {
    "description": "규격 목록과 미니 편집 팝업을 비교합니다.",
    "routeIds": [
      "F17"
    ]
  },
  "q3": {
    "description": "사업장과 품목을 내부 테두리 없이 행으로 정리합니다.",
    "routeIds": [
      "F17"
    ]
  },
  "q4": {
    "description": "품목별 사업장과 주문 방식을 같은 행 구조로 확인합니다.",
    "routeIds": [
      "F17"
    ]
  },
  "admin-overview": {
    "description": "핵심 수치와 비용·견적 위젯을 확인합니다.",
    "routeIds": [
      "A01"
    ]
  },
  "admin-quotes": {
    "description": "검색·상태 필터와 견적 상세 패널을 조작합니다.",
    "routeIds": [
      "A15"
    ]
  },
  "admin-billing": {
    "description": "계정을 선택하고 가상 금액을 입력합니다.",
    "routeIds": [
      "A21"
    ]
  },
  "receipt": {
    "description": "발급 전부터 발급 완료까지의 표현을 비교합니다.",
    "routeIds": [
      "F12",
      "A19"
    ]
  },
  "onboarding": {
    "description": "4단계 서비스 소개, 로그인 바텀시트와 회원별 견적 모드 선택.",
    "routeIds": [
      "F00"
    ]
  },
  "q2": {
    "description": "구매량·현재 가격의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F17"
    ]
  },
  "quote-review": {
    "description": "입력 검토·임시저장의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F17",
      "F06"
    ]
  },
  "quote-result": {
    "description": "11월 14일 발급·11월 21일 만료 예시로 그래프와 상세 카드를 비교합니다. 내 견적은 인증된 사업장에서 발급받은 건을 선택해 확인하세요.",
    "routeIds": [
      "F01"
    ]
  },
  "quote-wait": {
    "description": "Blank0.6초+Burst2.9초 뒤 배너. 빠른/느린 응답 상태만 합성 완료 타이머, 나머지는 실제응답 이벤트 계약. 원본 R4 JSON 실행은 기존 패키지 연계 대상.",
    "routeIds": [
      "F01",
      "F17"
    ]
  },
  "delivery-request": {
    "description": "납품 신청의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F02"
    ]
  },
  "application-status": {
    "description": "사업자·신청 진행의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F03"
    ]
  },
  "negotiation": {
    "description": "가격 재검토 신청의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F04"
    ]
  },
  "negotiation-result": {
    "description": "가격 재검토 결과의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F05"
    ]
  },
  "saved-quote": {
    "description": "저장 견적·버전의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F06"
    ]
  },
  "store-home": {
    "description": "내 사업장 현황의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F08"
    ]
  },
  "customer-orders": {
    "description": "주문·정기발주의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F09"
    ]
  },
  "order-detail": {
    "description": "주문·입금 상세의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F10"
    ]
  },
  "delivery-schedule": {
    "description": "납품 일정·변경의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F11"
    ]
  },
  "trade-documents": {
    "description": "거래 문서의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F12"
    ]
  },
  "store-settings": {
    "description": "사업자·여러 사업장의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F13"
    ]
  },
  "help-center": {
    "description": "이용 안내·문의의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F14"
    ]
  },
  "price-policy": {
    "description": "가격·유효기간 안내의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F15"
    ]
  },
  "consultation": {
    "description": "상담 예약의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F14",
      "F02"
    ]
  },
  "account-settings": {
    "description": "계정·알림 설정의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F07",
      "F13"
    ]
  },
  "session-access": {
    "description": "로그인·권한 예외의 정상·예외 상태를 비교합니다.",
    "routeIds": [
      "F07"
    ]
  },
  "supplier-intro": {
    "description": "U00 공급 참여 안내",
    "routeIds": [
      "U00"
    ]
  },
  "supplier-apply": {
    "description": "U01 신규 공급 신청",
    "routeIds": [
      "U01"
    ]
  },
  "supplier-status": {
    "description": "U02 공급 심사 상태",
    "routeIds": [
      "U02"
    ]
  },
  "supplier-home": {
    "description": "U03 공급 현황",
    "routeIds": [
      "U03"
    ]
  },
  "supplier-products": {
    "description": "U04 계란 상품·규격",
    "routeIds": [
      "U04"
    ]
  },
  "supplier-prices": {
    "description": "U05 가격·납품조건 제안",
    "routeIds": [
      "U05"
    ]
  },
  "supplier-capacity": {
    "description": "U06 공급 물량·요일",
    "routeIds": [
      "U06"
    ]
  },
  "supplier-feed": {
    "description": "U07 급이 사료·증빙",
    "routeIds": [
      "U07"
    ]
  },
  "supplier-shipments": {
    "description": "U08 출고·납품 이력",
    "routeIds": [
      "U08"
    ]
  },
  "supplier-settlements": {
    "description": "U09 공급·정산 이력",
    "routeIds": [
      "U09"
    ]
  },
  "partner-intro": {
    "description": "P00 파트너 참여 안내",
    "routeIds": [
      "P00"
    ]
  },
  "partner-apply": {
    "description": "P01 파트너 신청",
    "routeIds": [
      "P01"
    ]
  },
  "partner-status": {
    "description": "P02 파트너 자격심사",
    "routeIds": [
      "P02"
    ]
  },
  "partner-campaigns": {
    "description": "P03 공동구매 개설",
    "routeIds": [
      "P03"
    ]
  },
  "partner-performance": {
    "description": "P04 첫 판매·실적 확인",
    "routeIds": [
      "P04"
    ]
  },
  "partner-home": {
    "description": "P05 파트너 운영 현황",
    "routeIds": [
      "P05"
    ]
  },
  "partner-settlements": {
    "description": "P06 파트너 정산",
    "routeIds": [
      "P06"
    ]
  },
  "partner-storefront": {
    "description": "P07 파트너 판매페이지",
    "routeIds": [
      "P07"
    ]
  },
  "partner-group": {
    "description": "P08 회차별 공동구매",
    "routeIds": [
      "P08"
    ]
  },
  "consumer-today": {
    "description": "C00 오늘의 계란",
    "routeIds": [
      "C00"
    ]
  },
  "consumer-product": {
    "description": "C01 소비자 상품",
    "routeIds": [
      "C01"
    ]
  },
  "consumer-checkout": {
    "description": "C02 소비자 주문·결제",
    "routeIds": [
      "C02"
    ]
  },
  "consumer-orders": {
    "description": "C03 소비자 배송·취소",
    "routeIds": [
      "C03"
    ]
  },
  "consumer-subscription": {
    "description": "C04 소비자 정기구매",
    "routeIds": [
      "C04"
    ]
  },
  "admin-access": {
    "description": "A00 관리자 로그인",
    "routeIds": [
      "A00"
    ]
  },
  "admin-business-review": {
    "description": "A02 매장 신청·서류 심사",
    "routeIds": [
      "A02"
    ]
  },
  "admin-buyers": {
    "description": "A03 매장·사업자 관리",
    "routeIds": [
      "A03"
    ]
  },
  "admin-supplier-review": {
    "description": "A04 공급 농가 참여 심사",
    "routeIds": [
      "A04"
    ]
  },
  "admin-suppliers": {
    "description": "A05 농가·선별장 관리",
    "routeIds": [
      "A05"
    ]
  },
  "admin-facilities": {
    "description": "A06 생산·출고지역",
    "routeIds": [
      "A06"
    ]
  },
  "admin-catalog": {
    "description": "A07 계란 상품 규격",
    "routeIds": [
      "A07"
    ]
  },
  "admin-feed-review": {
    "description": "A08 사료·제품 정보 심사",
    "routeIds": [
      "A08"
    ]
  },
  "admin-zones": {
    "description": "A09 배송 가능 지역·요일",
    "routeIds": [
      "A09"
    ]
  },
  "admin-capacity": {
    "description": "A10 공급 물량 관리",
    "routeIds": [
      "A10"
    ]
  },
  "admin-offers": {
    "description": "A11 농가 제안가격 확인",
    "routeIds": [
      "A11"
    ]
  },
  "admin-price-approval": {
    "description": "A12 견적용 가격 승인",
    "routeIds": [
      "A12"
    ]
  },
  "admin-simulation": {
    "description": "A13 최저가 선택 결과 확인",
    "routeIds": [
      "A13"
    ]
  },
  "admin-negotiations": {
    "description": "A14 네고·구매증빙 심사",
    "routeIds": [
      "A14"
    ]
  },
  "admin-orders": {
    "description": "A16 주문·정기 발주",
    "routeIds": [
      "A16"
    ]
  },
  "admin-payments": {
    "description": "A17 입금 확인",
    "routeIds": [
      "A17"
    ]
  },
  "admin-shipments": {
    "description": "A18 출고·반품·파손",
    "routeIds": [
      "A18"
    ]
  },
  "admin-documents": {
    "description": "A19 계산서·구매증빙",
    "routeIds": [
      "A19"
    ]
  },
  "admin-contracts": {
    "description": "A20 농가 계약·수수료",
    "routeIds": [
      "A20"
    ]
  },
  "admin-settlements": {
    "description": "A21 수수료·거래 정산",
    "routeIds": [
      "A21"
    ]
  },
  "admin-partner-review": {
    "description": "A22 파트너 자격심사",
    "routeIds": [
      "A22"
    ]
  },
  "admin-campaigns": {
    "description": "A23 공동구매 실적심사",
    "routeIds": [
      "A23"
    ]
  },
  "admin-partner-markets": {
    "description": "A24 판매페이지·귀속·정산",
    "routeIds": [
      "A24"
    ]
  },
  "admin-ad-review": {
    "description": "A25 광고 승인",
    "routeIds": [
      "A25"
    ]
  },
  "admin-ad-inventory": {
    "description": "A26 광고 노출·정산",
    "routeIds": [
      "A26"
    ]
  },
  "admin-today": {
    "description": "A27 오늘의 계란 관리",
    "routeIds": [
      "A27"
    ]
  },
  "admin-support": {
    "description": "A28 상담·분쟁",
    "routeIds": [
      "A28"
    ]
  },
  "admin-analytics": {
    "description": "A29 방문·견적·실구매 성과",
    "routeIds": [
      "A29"
    ]
  },
  "admin-team": {
    "description": "A30 운영자 계정",
    "routeIds": [
      "A30"
    ]
  },
  "admin-audit": {
    "description": "A31 접속·정보변경·보안 기록",
    "routeIds": [
      "A31"
    ]
  },
  "admin-policy": {
    "description": "A32 약관·판매주체·증빙 정책",
    "routeIds": [
      "A32"
    ]
  },
  "admin-rights": {
    "description": "A33 농장 운영권·지분 계약",
    "routeIds": [
      "A33"
    ]
  }
};
