import {catalog,frames,cssHash} from './catalog.gen.mjs';
import {brandMotionScript,commonMotionScript,brandAccountScript,brandAccountCss,sharedCoreScript,sharedTemplates,sharedUiProvenance,createSharedUi,productRuntimeCode} from './assets.gen.mjs';
import {supportedWidths} from './viewports.mjs';
import {salesReviewContent} from './sales.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function inflate(value){return new Response(new Blob([Uint8Array.from(atob(value),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}

// Compatibility class names remain stable; definitions and API behavior are product owned.
export const productUiCss=`
[data-qa-mvp] [hidden],.qa-modal-layer[hidden]{display:none!important}
.qa-sales-table output,.ops-metric output{font-variant-numeric:tabular-nums}.qa-sales-table output{white-space:nowrap}
.qa-contributors .field{margin:0;min-width:0}.qa-contributors .input-shell{min-width:0}
.qa-contributors .ops-table th,.qa-contributors .ops-table td{min-width:0}
.qa-contributors .ops-table input{min-width:0;width:100%}
.qa-email-preview{white-space:pre-wrap;overflow-wrap:anywhere}
.qa-modal-layer.auth-scene{position:fixed;inset:0;z-index:50;height:100%;min-height:0}
.qa-modal-layer .sheet-handle{border:0;cursor:grab}
.qa-pass-flip{perspective:1000px;position:relative;min-height:390px;margin-block:24px}
.qa-pass-face{position:absolute;inset:0;backface-visibility:hidden;transition:transform .52s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;min-height:390px;overflow:auto}
.qa-pass-face .btn{margin-top:auto}.qa-pass-back{transform:rotateY(180deg)}
.qa-pass-flip[data-face=back] .qa-pass-front{transform:rotateY(-180deg)}.qa-pass-flip[data-face=back] .qa-pass-back{transform:rotateY(0)}
@media(prefers-reduced-motion:reduce){.qa-pass-face{transition:none}}
`+brandAccountCss;

export function createProductDocumentContext(){
  const shared=createSharedUi({ORDER_QA_ASSETS:{brand:sharedTemplates.brand}});
  const attrs=values=>Object.entries(values||{}).map(([name,value])=>name+'="'+esc(value)+'"').join(' ');
  const button=(label,extra={},kind='secondary')=>shared.button(esc(label),'app-action',kind,attrs(extra));
  const go=(label,screen,state,kind='secondary')=>button(label,{'data-qa-go':screen,'data-qa-state':state},kind);
  const field=(label,name,placeholder='',options={},extra={})=>shared.field(label,name,placeholder,options).replace(/<(input|textarea) /,'<$1 '+attrs(extra)+' ');
  const select=(label,name,options,extra={},value='')=>{const id=shared.uid(name);return '<label class="field ops-select-field" for="'+id+'"><span id="'+id+'-label">'+esc(label)+'</span><select id="'+id+'" name="'+esc(name)+'" aria-labelledby="'+id+'-label" aria-describedby="'+id+'-message" aria-invalid="false" '+attrs(extra)+'>'+options.map(([key,text])=>'<option value="'+esc(key)+'"'+(String(key)===String(value)?' selected':'')+'>'+esc(text)+'</option>').join('')+'</select><span id="'+id+'-message" data-field-message class="field-error sr-only" aria-live="polite"></span></label>';};
  const check=(label,name,extra={},type='checkbox')=>'<label class="check-row"><input type="'+type+'" name="'+esc(name)+'" '+attrs(extra)+'>'+esc(label)+'</label>';
  const status=(name,text='')=>'<p class="muted" data-'+name+' role="status" aria-live="polite">'+esc(text)+'</p>';
  const panel=content=>'<section class="ops-panel">'+content+'</section>';
  const operationsMenu=[['admin-analytics','매출 현황','grid'],['admin-revenue-rules','수익 배분','settings'],['member-email-templates','이메일 양식','mail']].map(([id,label,icon])=>'<button type="button" data-op-route="'+id+'" class="ops-nav">'+shared.icon(icon,20)+'<span>'+label+'</span></button>').join('');
  const page=(title,content,{admin=false,screen=''}={})=>{
    const supplier=screen.startsWith('supplier-');
    const operationsShell=supplier?(sharedTemplates.supplierOpsShell||sharedTemplates.opsShell):sharedTemplates.opsShell;
    const inner=admin?operationsShell.replace('</nav>',(supplier?'':operationsMenu)+'</nav>').replace('__ORDER_SCREEN__',esc(screen)).replace('<!--ORDER_CONTENT-->','<header class="ops-heading"><div><p class="ops-eyebrow">'+(supplier?'공급처':'관리자')+'</p><h1>'+esc(title)+'</h1></div></header>'+content):
      '<section class="page mf-page">'+shared.head(esc(title),'',{brand:sharedTemplates.brand})+content+'</section>';
    return '<main id="order-single" class="qa-screen ds" data-qa-mvp data-app-screen="'+esc(screen)+'">'+inner+'</main>';
  };
  return {shared,attrs,button,go,field,select,check,status,panel,page};
}

let built;
export function getProductDocuments(){return built??=buildProductDocuments();}
export async function getProductApplicationDocument(screen,state='default',variant='email'){
  const {documents}=await getProductDocuments();
  const defaults={'store-purchase':'select','admin-revenue-rules':'settings','member-email-templates':'welcome','admin-analytics':'business-sales','admin-shipments':'packing','supplier-shipments':'packing','delivery-request':'ready'};
  const source=documents.get([screen,state,variant].join('/'))||(state==='default'&&defaults[screen]?documents.get([screen,defaults[screen],variant].join('/')):null);
  return source?{...source,source:{kind:'product',sharedUi:sharedUiProvenance}}:null;
}
async function buildProductDocuments(){
  const {shared,attrs,button,go,field,select,check,status,panel,page}=createProductDocumentContext();
  const rows=[],documents=new Map();
  const dependencies=sharedCoreScript+'\n'+brandMotionScript+'\n'+commonMotionScript+'\n'+brandAccountScript;
  const standardMount=dependencies+'\n('+productRuntimeCode+')();';
  const add=async({screen,state,label,stateLabel,group='공통 자산',role='common',body,mount=standardMount,original,description='',css=productUiCss,provenance,sourceFiles,defaultWidth})=>{
    const id=screen+'/'+state+'/email';
    const hashes=Object.fromEntries(await Promise.all(supportedWidths.map(async width=>[width,await sha([id,width,body,cssHash,css,mount].join('|'))])));
    const row={...(original||{}),id,screen,state,variant:'email',group,label,stateLabel,phase:'current',role,defaultWidth:defaultWidth||(role==='admin'?1280:390),hashes,previousHashes:original?.previousHashes||{},authoredChange:true,supplemental:!original,description,
      ...(provenance?{provenance}:{}),...(sourceFiles?{sourceFiles}:{})};
    rows.push(row);documents.set(id,{body,mount,css,hashes,row,original,provenance});
  };
  const ui={button,field,select,go,esc};
  for(const [state,channel,stateLabel] of [['business-sales','business','사업장 매출'],['campaign-sales','campaign','공동구매 매출']])await add({screen:'admin-analytics',state,label:'매출 현황',stateLabel,group:'관리자 · 가격·매출·수익',role:'admin',body:page('매출 현황',salesReviewContent(channel,ui),{admin:true,screen:'admin-analytics'}),description:'저장된 주문의 결제·취소·환불·미입금을 기간과 대상별로 집계합니다.'});

  await add({screen:'admin-revenue-rules',state:'settings',label:'수익 배분·레퍼럴',stateLabel:'배분율·기여자',group:'관리자 · 수익과 운영',role:'admin',body:page('수익 배분·레퍼럴',
    status('revenue-note','설정을 불러오는 중이에요.')+'<form data-revenue-form novalidate>'+panel('<div class="ops-form-grid">'+field('매출액','gross','',{type:'number',min:0,step:1,value:0,required:true})+field('차감 비용','cost','',{type:'number',min:0,step:1,value:0,required:true})+'</div>'+check('최초 기여자 내부 레퍼럴 코드 자동 적용','initial-referral',{checked:''})+status('referral-status'))+
    '<section class="ops-panel qa-contributors"><header class="ops-panel-heading"><h2>기여자</h2>'+button('기여자 추가',{'data-contributor-add':''})+'</header><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>기여자</th><th>레퍼럴 코드</th><th>배분율(%)</th><th>계산 금액</th><th>관리</th></tr></thead><tbody data-contributors></tbody></table></div><p><output data-rate-sum aria-live="polite"></output></p></section><div class="ops-actions">'+button('설정 저장',{'data-revenue-apply':'',disabled:''},'primary')+'</div></form><nav class="ops-actions">'+go('기존 정산 내역','admin-settlements','summary')+go('매출 현황','admin-analytics','business-sales')+'</nav>',{admin:true,screen:'admin-revenue-rules'}),description:'서버에 저장한 배분율·기여자·레퍼럴 설정을 불러오고 변경합니다. 실제 정산 확정과 구분합니다.'});

  const emails=[['welcome','회원가입 완료'],['verification','인증코드'],['withdrawal','회원탈퇴']];
  for(const [state,name] of emails)await add({screen:'member-email-templates',state,label:'회원 이메일 양식',stateLabel:name,group:'관리자 · 회원과 인증',role:'admin',body:page(name+' 이메일','<nav class="mf-chips">'+emails.map(([id,label])=>go(label,'member-email-templates',id,id===state?'primary':'secondary')).join('')+'</nav>'+status('email-status','양식을 불러오는 중이에요.')+'<form data-email-editor data-email-kind="'+state+'" novalidate>'+panel(field('제목','mail-subject','',{max:160,required:true},{'data-email-subject':''})+field('본문','mail-body','',{max:8000,required:true,multiline:true,rows:8},{'data-email-body':''}))+'<div class="ops-actions">'+button('양식 저장',{'data-email-save':'',disabled:''},'primary')+'</div></form><section class="ops-panel"><header class="ops-panel-heading"><h2>미리보기</h2></header><h3 data-email-preview-subject></h3><div class="qa-email-preview" data-email-preview-body></div></section>',{admin:true,screen:'member-email-templates'}),description:'저장된 회원가입·인증·탈퇴 이메일 양식을 편집합니다. 저장만으로 메일을 발송하지 않습니다.'});

  const purchaseForm=status('purchase-status','판매 상품을 불러오는 중이에요.')+'<form data-purchase-form novalidate>'+select('상품','offer-id',[['','상품을 불러오는 중이에요.']],{'data-purchase-offer':'',required:''})+
    '<div class="ops-form-grid">'+field('판매 단가(원)','unit-price','',{type:'number',min:1,step:1},{readonly:'','data-server-unit-price':''})+field('주문 판수','quantity','',{type:'number',min:1,step:1,value:10,required:true})+'</div><section role="radiogroup" aria-label="결제 방법"><h2>결제 방법</h2>'+check('현금','payment',{value:'cash',checked:''},'radio').replace('</label>','<output data-same-price></output></label>')+check('카드','payment',{value:'card'},'radio').replace('</label>','<output data-same-price></output></label>')+'</section><p class="muted">카드와 현금은 같은 판매 가격을 적용합니다.</p>'+panel('<h2>주문 금액 <output data-purchase-total>—</output></h2><p data-purchase-origin></p>')+'<div class="mf-actions">'+button('주문 확인',{'data-purchase-confirm':'',disabled:''},'primary')+'</div></form>';
  const orderOperations='<section class="ops-panel" data-purchase-operations hidden><header class="ops-panel-heading"><h2>주문 확인</h2></header>'+status('order-status')+'<form data-order-form novalidate>'+select('주문 선택','purchase-order',[['','주문 선택']],{'data-order-select':''})+'<dl><dt>상품</dt><dd data-order-product>—</dd><dt>주문 상태</dt><dd data-order-state>—</dd><dt>주문 금액</dt><dd data-order-amount>—</dd><dt>확인된 결제</dt><dd data-order-paid>—</dd></dl><div data-cash-reference hidden>'+field('입금 확인번호','cash-reference','',{max:120})+'</div><div class="mf-actions">'+button('입금 확인',{'data-order-action':'confirm-cash',hidden:'',disabled:''},'primary')+button('카드 결제',{'data-order-action':'card',hidden:'',disabled:''},'primary')+button('수령 확인',{'data-order-action':'receive',hidden:'',disabled:''},'primary')+button('주문 취소',{'data-order-action':'cancel',hidden:'',disabled:''})+button('견적·영수증 보기',{'data-order-documents-open':'',disabled:''})+'</div></form><section data-order-documents hidden><h2>견적서·영수증</h2><dl><dt>주문번호</dt><dd data-document-id></dd><dt>상품</dt><dd data-document-product></dd><dt>주문 판수</dt><dd data-document-quantity></dd><dt>견적 금액</dt><dd data-document-total></dd><dt>결제 확인</dt><dd data-document-payment></dd></dl></section></section>';
  await add({screen:'store-purchase',state:'select',label:'매장 구매',stateLabel:'카드·현금 선택',group:'고객 · 주문과 납품',role:'customer',body:page('매장 구매',purchaseForm+orderOperations,{screen:'store-purchase'})});
  for(const [state,title] of [['cash','현금 입금 확인'],['card','카드 결제']])await add({screen:'store-purchase',state,label:'매장 구매',stateLabel:title,group:'고객 · 주문과 납품',role:'customer',body:page(title,status('purchase-status','주문을 불러오는 중이에요.')+'<section class="ops-panel" data-purchase-detail><h2 data-purchase-title>주문 정보</h2><dl><dt>주문번호</dt><dd data-purchase-id>—</dd><dt>주문 금액</dt><dd data-purchase-amount>—</dd><dt>처리 상태</dt><dd data-purchase-state>—</dd></dl></section>'+(state==='card'?button('카드 결제 진행',{'data-purchase-card':'',disabled:''},'primary'):'<p class="muted">담당자가 입금 내역을 확인한 뒤 출고를 진행합니다.</p>')+'<nav class="mf-actions">'+go('주문 현황','customer-orders','list')+go('상품 선택','store-purchase','select')+'</nav>',{screen:'store-purchase'})});

  const pass='<section class="qa-pass-flip" data-pass-card data-face="front"><article class="order-pass nav-ticket tone-review qa-pass-face qa-pass-front"><div class="row between"><span class="pass-date" data-pass-date>—</span><span class="pass-state tone-review" data-pass-status>납품 요청</span></div><h2 data-pass-target>사업장 확인</h2><p data-pass-product>계란 · 30구</p><strong class="pass-quantity" data-pass-quantity>주문 정보 확인</strong><div class="pass-perforation"></div><p>오더 패스</p>'+button('뒤집어 상세 보기',{'data-qa-flip':'','aria-expanded':'false'})+'</article><article class="order-pass nav-ticket tone-review qa-pass-face qa-pass-back" aria-hidden="true"><h2>납품 상세 정보</h2><dl><dt>사업장</dt><dd data-pass-target>—</dd><dt>출고처</dt><dd>합천 농장</dd><dt>상품</dt><dd data-pass-product>—</dd><dt>주문 금액</dt><dd data-pass-amount>—</dd><dt>결제 확인</dt><dd data-pass-payment>—</dd></dl>'+button('앞면 보기',{'data-qa-flip':'','aria-expanded':'false',tabindex:'-1'})+'</article></section>';
  for(const original of catalog.filter(r=>r.screen==='delivery-request')){
    const body=page('납품 요청·오더패스',status('delivery-status','주문을 불러오는 중이에요.')+pass+'<nav class="mf-actions">'+go('주문 선택·관리','store-purchase','select')+'</nav>',{screen:'delivery-request'});
    await add({...original,original,body,description:'기존 오더 패스 컴포넌트의 앞면·뒷면에서 저장된 주문과 납품 조건을 확인합니다.'});
  }
  const original=catalog.find(r=>r.id==='account-settings/withdraw/email');
  let body=await inflate(frames[original.current]);
  const withdrawal='<form data-withdraw-form novalidate>'+select('탈퇴 사유','withdraw-reason',[['','사유 선택'],['service','서비스 이용이 불편해요'],['price','가격이 맞지 않아요'],['privacy','개인정보가 염려돼요'],['other','직접 작성']],{required:''})+field('남기실 의견','withdraw-note','',{multiline:true,max:2000})+field('확인을 위해 “회원탈퇴”를 입력해 주세요','withdraw-phrase','',{required:true,autocomplete:'off'})+'<div class="mf-actions">'+go('계정 유지','account-settings','normal')+button('회원탈퇴',{'data-withdraw-start':'',disabled:''},'primary')+'</div>'+status('withdraw-status')+'</form><div class="auth-scene qa-modal-layer" data-withdraw-dialog hidden><div class="sheet-dim" data-withdraw-dismiss></div><section class="auth-sheet t-modal" role="dialog" aria-modal="true" aria-label="회원탈퇴 확인" tabindex="-1"><button type="button" class="sheet-handle" aria-label="확인 창 닫기" data-withdraw-dismiss></button><div class="sheet-title"><h2>정말 탈퇴하시겠어요?</h2></div><p>탈퇴하면 이 계정으로 다시 로그인할 수 없어요.</p><div class="mf-actions">'+button('취소',{'data-withdraw-cancel':''})+button('회원탈퇴',{'data-withdraw-confirm':''},'primary')+'</div>'+status('withdraw-dialog-status')+'</section></div>';
  body=body.replace(/<form data-mf-form[\s\S]*?<\/form>/,withdrawal).replace('class="qa-screen ds"','class="qa-screen ds" data-qa-mvp');
  await add({...original,original,body,description:'탈퇴 사유·직접 입력·공통 확인창을 거쳐 서버 처리 응답 후 완료합니다.'});
  for(const original of catalog.filter(r=>['admin-shipments','supplier-shipments'].includes(r.screen)&&r.state==='packing')){
    const tracking=panel('<header class="ops-panel-heading"><h2>배송 정보</h2></header><p>출고처 · 합천 농장</p>'+status('shipment-summary','주문을 불러오는 중이에요.')+'<form data-shipment-form novalidate><div class="ops-form-grid">'+select('주문','shipment-order',[['','주문 선택']],{'data-shipment-order':'',required:''})+select('배송수단','shipment-method',[['farm','농장 직접 배송'],['parcel','택배'],['freight','화물'],['quick','퀵']])+select('배송 상태','shipment-status',[['packing','포장 중'],['dispatched','배송 중'],['delivered','납품 완료']])+field('송장번호','tracking-number','직접 배송은 비워 둘 수 있어요.',{max:60})+'</div><div class="ops-actions">'+button('배송 정보 저장',{'data-shipment-apply':'',disabled:''},'primary')+'</div></form>');
    const body=page('주문 출고·배송 정보',tracking,{admin:true,screen:original.screen});
    await add({...original,original,body,description:'확인된 주문에 배송수단·송장번호·배송 상태를 저장합니다.'});
  }
  return {rows,documents};
}
