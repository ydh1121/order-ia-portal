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

export function salesReviewContent(channel,ui){
  const {button,field,select,go,esc}=ui;
  const campaign=channel==='campaign',title=campaign?'공동구매 회차별':'사업장별';
  const metrics=[['orders','주문 수'],['trays','주문 판수'],['paid','결제 금액'],['refunded','환불 금액'],['net','순매출'],['unpaid','미입금']];
  const fields=[['orders','주문'],['trays','판수'],['ordered','주문 금액'],['paid','결제 금액'],['cancelled','취소 금액'],['refunded','환불 금액'],['net','순매출'],['unpaid','미입금']];
  return '<section data-qa-sales data-sales-channel="'+channel+'">'+
    '<p class="muted" data-sales-provenance role="status">매출 자료를 불러오는 중이에요.</p>'+
    '<nav class="mf-chips" aria-label="매출 유형">'+
      go('사업장 매출','admin-analytics','business-sales',!campaign? 'primary':'secondary')+
      go('공동구매 매출','admin-analytics','campaign-sales',campaign?'primary':'secondary')+go('기존 이용·거래 성과','admin-analytics','normal')+'</nav>'+
    '<section class="ops-panel"><div class="ops-form-grid four">'+
      select('기간','sales-period',[['month','이번 달'],['previous','지난달'],['all','전체 기간'],['custom','직접 지정']],{'data-sales-period':''})+
      field('시작일','sales-from','',{type:'date'},{'data-sales-from':''})+field('종료일','sales-to','',{type:'date'},{'data-sales-to':''})+
      field(title+' 검색','sales-search',(campaign?'회차명·회차번호':'사업장명·사업장번호')+'·주문번호',{type:'search',max:80},{'data-sales-search':''})+
      '</div><p class="field-error" role="alert" data-sales-error hidden>시작일을 종료일보다 늦게 지정할 수 없습니다.</p><p data-sales-count aria-live="polite"></p></section>'+
    '<div class="ops-metrics qa-sales-summary">'+metrics.map(([key,label])=>'<article class="ops-metric"><span>'+label+'</span><strong><output data-sales-metric="'+key+'">—</output></strong></article>').join('')+'</div>'+
    '<section class="ops-panel"><header class="ops-panel-heading"><h2>'+title+' 매출</h2></header><div class="ops-table-wrap"><table class="ops-table qa-sales-table" aria-label="'+title+' 매출"><thead><tr><th scope="col">'+(campaign?'공동구매 회차':'사업장')+'</th>'+fields.map(([,label])=>'<th scope="col">'+label+'</th>').join('')+'</tr></thead><tbody data-sales-rows></tbody><tfoot><tr><th scope="row">합계</th>'+fields.map(([key,label])=>'<td data-label="'+label+'"><output data-sales-total="'+key+'">—</output></td>').join('')+'</tr></tfoot></table></div><p class="ops-filter-empty" data-sales-empty hidden>조건에 맞는 주문이 없습니다.</p></section>'+
    '<details class="ops-panel"><summary>집계 기준과 계산식</summary><p>선택 기간은 주문일 기준이며, 해당 주문의 결제·환불 내역을 집계합니다. 판수는 취소 전 주문 판수, 주문 금액은 판수 × 단가입니다.</p><p>순매출 = 결제 금액 − 환불 금액. 미입금 = 주문별 max(0, 주문 금액 − 취소 금액 − 순매출)의 합입니다. 이미 환불한 금액을 취소 금액과 함께 다시 차감하지 않습니다. 순매출은 결제 확인 기준입니다.</p></details>'+
    '<details class="ops-panel"><summary>집계에 사용한 주문</summary><div class="ops-table-wrap"><table class="ops-table" aria-label="집계 주문 자료"><thead><tr><th>주문</th><th>주문일</th><th>대상</th><th>판수</th><th>판당 단가</th><th>결제</th><th>취소 판수</th><th>환불</th></tr></thead><tbody data-sales-source-rows></tbody></table></div></details>'+
    '<nav class="ops-actions" aria-label="매출 관련 화면">'+
      go('주문 관리','admin-orders','list')+go('입금 확인','admin-payments','list')+(campaign?go('공동구매 실적 심사','admin-campaigns','normal')+go('파트너 정산','partner-settlements','summary'):go('사업장 회원','admin-buyers','list')+go('구매증빙 심사','admin-negotiations','list'))+go('거래 정산','admin-settlements','summary')+'</nav></section>';
}
