// Deliberately artificial review data. No operating orders or revenue are read here.
export const qaSalesFixture=[
  ['QA-B-1101','2026-11-02','business','B-01','첫 번째 매장',20,6000,120000,0,0],
  ['QA-B-1102','2026-11-10','business','B-01','첫 번째 매장',10,6000,30000,0,0],
  ['QA-B-1103','2026-11-15','business','B-01','첫 번째 매장',5,6000,30000,5,30000],
  ['QA-B-1104','2026-11-05','business','B-02','두 번째 매장',30,6200,186000,2,12400],
  ['QA-B-1105','2026-11-18','business','B-02','두 번째 매장',15,6200,0,0,0],
  ['QA-B-1001','2026-10-28','business','B-02','두 번째 매장',8,6200,49600,0,0],
  ['QA-C-1101','2026-11-03','campaign','G-2611-01','11월 동네장터',100,5800,580000,4,23200],
  ['QA-C-1102','2026-11-07','campaign','G-2611-01','11월 동네장터',50,5800,200000,0,0],
  ['QA-C-1103','2026-11-14','campaign','G-2611-02','11월 우리마을',80,5900,472000,10,59000],
  ['QA-C-1104','2026-11-19','campaign','G-2611-02','11월 우리마을',20,5900,0,20,0],
  ['QA-C-1001','2026-10-23','campaign','G-2610-01','10월 동네장터',60,5800,348000,0,0],
].map(([id,date,channel,targetId,target,trays,unitPrice,paid,cancelledTrays,refunded])=>({id,date,channel,targetId,target,trays,unitPrice,paid,cancelledTrays,refunded}));

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function salesReviewContent(channel){
  const campaign=channel==='campaign',title=campaign?'공동구매 회차별':'사업장별';
  const go=(label,screen,state)=>'<button type="button" data-qa-go="'+screen+'" data-qa-state="'+state+'">'+label+'</button>';
  const metrics=[['orders','주문 수'],['trays','주문 판수'],['paid','결제 금액'],['refunded','환불 금액'],['net','순매출'],['unpaid','미입금']];
  const fields=[['orders','주문'],['trays','판수'],['ordered','주문 금액'],['paid','결제 금액'],['cancelled','취소 금액'],['refunded','환불 금액'],['net','순매출'],['unpaid','미입금']];
  return '<section data-qa-sales data-sales-channel="'+channel+'" data-sales-fixture="'+esc(JSON.stringify(qaSalesFixture))+'">'+
    '<p class="qa-sales-provenance" data-sales-provenance>검토용 예시 자료입니다. 실제 주문·결제·운영 매출에 연결되지 않았습니다.</p>'+
    '<nav class="qa-mvp-toolbar qa-sales-tabs" aria-label="매출 유형">'+
      '<button type="button" data-qa-go="admin-analytics" data-qa-state="business-sales" aria-pressed="'+!campaign+'">사업장 매출</button>'+
      '<button type="button" data-qa-go="admin-analytics" data-qa-state="campaign-sales" aria-pressed="'+campaign+'">공동구매 매출</button>'+go('기존 이용·거래 성과','admin-analytics','normal')+'</nav>'+
    '<div class="qa-sales-filters"><label>기간<select data-sales-period><option value="2026-11">2026년 11월</option><option value="2026-10">2026년 10월</option><option value="all">전체 기간</option><option value="custom">직접 지정</option></select></label><label>시작일<input type="date" data-sales-from value="2026-11-01"></label><label>종료일<input type="date" data-sales-to value="2026-11-30"></label><label>'+title+' 검색<input type="search" data-sales-search maxlength="80" placeholder="'+(campaign?'회차명·회차번호':'사업장명·사업장번호')+'·주문번호"></label></div>'+
    '<p role="alert" data-sales-error hidden>시작일을 종료일보다 늦게 지정할 수 없습니다.</p><p data-sales-count aria-live="polite"></p>'+
    '<dl class="qa-sales-summary">'+metrics.map(([key,label])=>'<div><dt>'+label+'</dt><dd><output data-sales-metric="'+key+'">0</output></dd></div>').join('')+'</dl>'+
    '<h2>'+title+' 매출</h2><div class="qa-mvp-table-wrap"><table class="qa-sales-table" aria-label="'+title+' 매출"><thead><tr><th scope="col">'+(campaign?'공동구매 회차':'사업장')+'</th>'+fields.map(([,label])=>'<th scope="col">'+label+'</th>').join('')+'</tr></thead><tbody data-sales-rows></tbody><tfoot><tr><th scope="row">합계</th>'+fields.map(([key])=>'<td><output data-sales-total="'+key+'">0</output></td>').join('')+'</tr></tfoot></table></div><p data-sales-empty hidden>조건에 맞는 검토 자료가 없습니다.</p>'+
    '<details class="qa-sales-formulas"><summary>집계 기준과 계산식</summary><p>선택 기간은 주문일 기준이며, 해당 주문의 예시 결제·환불 내역을 집계합니다. 판수는 취소 전 주문 판수, 주문 금액은 판수 × 단가입니다.</p><p>순매출 = 결제 금액 − 환불 금액. 미입금 = 주문별 max(0, 주문 금액 − 취소 금액 − 순매출)의 합입니다. 이미 환불한 금액을 취소 금액과 함께 다시 차감하지 않습니다. 이 화면의 순매출은 결제 확인 기준이며 회계상 매출 확정 자료가 아닙니다.</p></details>'+
    '<details class="qa-sales-source"><summary>집계에 사용한 검토 주문</summary><div class="qa-mvp-table-wrap"><table class="qa-sales-source-table" aria-label="검토 주문 자료"><thead><tr><th>주문</th><th>주문일</th><th>대상</th><th>판수</th><th>판당 단가</th><th>결제</th><th>취소 판수</th><th>환불</th></tr></thead><tbody data-sales-source-rows></tbody></table></div></details>'+
    '<h2>관련 화면</h2><p class="qa-mvp-note">기존 화면의 검토 상태로 이동합니다. 위 예시 주문이 운영 자료로 저장되지는 않습니다.</p><nav class="qa-mvp-toolbar" aria-label="매출 관련 화면">'+
      go('주문 관리','admin-orders','list')+go('입금 확인','admin-payments','list')+(campaign?go('공동구매 실적 심사','admin-campaigns','normal')+go('파트너 정산','partner-settlements','summary'):go('사업장 회원','admin-buyers','list')+go('구매증빙 심사','admin-negotiations','list'))+go('거래 정산','admin-settlements','summary')+'</nav></section>';
}
