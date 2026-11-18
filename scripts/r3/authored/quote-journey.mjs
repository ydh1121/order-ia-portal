// Render archived QA screens without retrieving, embedding or exporting a buyer's quote.
// Button destinations are approved host actions. Production amounts live in the signed buyer view.
const go=(text,screen,state='',kind='secondary')=>'<button type="button" class="journey-btn '+kind+'" data-mf-go="'+screen+'" data-mf-state="'+state+'">'+text+'</button>';
const resultNames={
 saving:['이번 견적으로','원가를 줄일 수 있어요'], 'new-detail':['이번 견적으로','원가를 줄일 수 있어요'],
 'new-only-detail':['이번 견적의','제안 납품가'], 'current-detail':['현재 납품가','높은 가격이에요'],
 equal:['현재 납품가와','가격이 동일해요'], 'current-lower':['현재 납품가가','더 낮아요'],
 'no-current':['현재 가격 없이','새 납품가를 확인해요'],expired:['견적 유효기간이','지났어요'],
 recompare:['어떤 조건으로','다시 비교할까요?'], 'no-result':['길을','잃으셨나요?'],
 locked:['사업자 확인 후','납품가를 볼 수 있어요']
};
export function designResult(state){
 const [lead,ending]=resultNames[state];
 if(state==='no-result')return '<article class="journey-result" data-view="no-result"><header class="journey-title"><h1>길을 잃으셨나요?</h1></header><div class="journey-visual"><p>표시할 견적을 찾을 수 없어요.</p></div><footer>'+go('이전 페이지로 돌아가기','quote-review','normal','primary')+'</footer></article>';

 const detail=['new-detail','current-detail','new-only-detail'].includes(state);
 const single=['no-current','new-only-detail'].includes(state);
 const action=(text,to,cls='')=>'<button type="button" class="'+cls+'" data-mf-go="quote-result" data-mf-state="'+to+'">'+text+'</button>';
 const series=(key,label,to)=>{
  const selected=key==='current'?state==='current-detail':state!=='current-detail';
  const accent=key===(state==='current-lower'?'current':'offered');
  const css='journey-series '+key+(accent?' accent':'')+(selected&&detail?' front':'');
  return action('<span>'+label+'</span><strong aria-label="금액 비공개">—</strong>'+(detail?'':'<i aria-hidden="true"></i>'),to,css);
 };
 let visual='';
 if(state==='locked')visual='<div class="journey-gate">'+go('사업자 확인','business','empty','primary')+'</div>';
 else if(state==='recompare')visual='<div class="journey-choices">'+go('동일한 조건','quote-review','normal','primary')+go('새로운 견적','q1','before')+'</div>';
 else if(state==='expired')visual='<section class="journey-chart expired-chart" aria-label="만료된 견적"><div>현재 납품가<strong>—</strong></div><div>제안 납품가<strong>—</strong></div></section><p class="journey-meta">견적 만료일 —</p>';
 else{
  const graph='<section class="journey-chart '+(detail?'cards':'bars')+'" aria-label="가격 비교 배치 예시">'+
    (single?'':series('current','현재 납품가','current-detail'))+series('offered',state==='saving'?'최저가':'검색된 가격',single?'new-only-detail':'new-detail')+'</section>';
  visual=(detail?'<p class="journey-meta">동일한 1회 납품 기준<br>견적 기준일 —<br>견적 만료일 —</p>':'')+graph+
    (detail?action('그래프로 보기',single?'no-current':'saving','journey-back'):'<small>그래프를 누르면 상세를 확인할 수 있어요.</small>');
 }
 const caption=state==='equal'?'거래 변경 혜택을 확인해 보세요.':state==='current-lower'?'필요한 납품 조건을 요청해 주세요.':'';
 const large=['saving','new-detail','current-detail','new-only-detail'].includes(state);
 const title='<header class="journey-title">'+(large?'<p>'+lead+'</p><h1><em aria-label="금액 비공개">—</em><br>'+ending+'</h1>':'<h1>'+lead+'<br>'+ending+'</h1>')+'</header>';
 const next=state==='expired'?action('다시 비교하기','recompare','journey-btn primary'):state==='recompare'?'':
    state==='locked'?go('내 입력 내용','quote-review','normal','primary'):detail?go('납품 요청','role-delivery','','primary'):go('다시 비교하기','quote-result','recompare','primary');
 return '<article class="journey-result" data-view="'+state+'">'+title+(caption?'<p>'+caption+'</p>':'')+'<div class="journey-visual">'+visual+'</div><p class="journey-privacy">금액은 인증된 사업장의 내 견적에서 확인할 수 있어요.</p><footer>'+
      go('상담 예약','role-consult')+next+'</footer></article>';
}
export function inputJourney(screen,state){
 if(screen==='q2'){
  const help={empty:'입력 전',filled:'입력한 조건',unknown:'정확한 금액을 모를 때',single:'한 품목',error:'입력 확인',mixed:'여러 품목'}[state];
  return '<article class="journey-input" data-view="'+state+'"><p>간편 견적 · 구매 조건</p><h1>계란을 얼마나 쓰고<br>얼마에 구매하시나요?</h1><form data-purchase-form><fieldset><legend>구매 기준</legend><label><input type="radio" name="basis" value="month" checked>월 구매량</label><label><input type="radio" name="basis" value="delivery">1회 구매량</label></fieldset><label data-number>구매량 <span><input inputmode="numeric" autocomplete="off" name="qty" placeholder="구매량 입력" aria-describedby="q2-issue"><select name="unit" aria-label="수량 단위"><option>판</option><option>개</option></select></span></label><label data-number>현재 한 판 구매가 <span><input name="price" inputmode="numeric" placeholder="구매가 입력" autocomplete="off" aria-describedby="q2-issue">원</span></label><label class="journey-check"><input type="checkbox" name="unknown">현재 구매가를 몰라요</label><small id="q2-issue" role="status" aria-live="polite"></small><p>월 사용량과 이번 납품 수량은 따로 계산해요.</p><footer>'+go('이전','q1','selected')+'<button type="button" data-q2-review class="journey-btn primary">입력 내용 확인</button></footer></form><button class="journey-link" type="button" data-open-quote="q2">작성 중인 견적에서 계속</button><span class="sr-only">'+help+'</span></article>';
 }
 const states={normal:'입력 내역',saved:'저장한 입력',incomplete:'추가 입력 필요',conflict:'다른 탭에 변경사항이 있어요',restore:'저장한 조건 확인',offline:'연결을 확인해 주세요'};
 return '<article class="journey-input" data-view="'+state+'"><p>간편 견적 · '+states[state]+'</p><h1>납품가를 비교하기 전<br>내 조건을 확인해 주세요</h1><dl class="journey-summary"><dt>계란 규격</dt><dd>'+go('규격 확인','q1','selected')+'</dd><dt>구매 기준·수량</dt><dd data-summary-qty>입력 전</dd><dt>현재 구매가</dt><dd data-summary-price>입력 전</dd><dt>납품 지역·주기</dt><dd>'+go('납품 조건 확인','q3','open')+'</dd></dl><footer>'+go('구매 조건 수정','q2','empty')+'<button class="journey-btn primary" type="button" data-open-quote="review">내 견적 이어쓰기</button></footer></article>';
}
export function mountInputJourney(){
 const modules=window.ORDER_DESIGN_MODULES ||= [];
 for(const id of ['q2','quote-review']){
  modules.push({id,mount(root,state,api){
   const form=root.querySelector('[data-purchase-form]');
   const isAmount=v=>/^\d{1,10}$/.test(v);
   const send=(type,data)=>root.dispatchEvent(new CustomEvent('r3-review-journey',{detail:{type,data}}));
   const saved=event=>{
    const d=event.detail;if(!d)return;
    if(form){
     form.elements.basis.value=d.basis;form.elements.qty.value=d.qty;form.elements.unit.value=d.unit;
     form.elements.price.value=d.price;form.elements.unknown.checked=d.unknown;form.elements.price.disabled=d.unknown;
    }else{
     root.querySelector('[data-summary-qty]').textContent=(d.basis==='month'?'월 ':'1회 ')+d.qty+d.unit;
     root.querySelector('[data-summary-price]').textContent=d.unknown?'현재 구매가 모름':new Intl.NumberFormat('ko-KR').format(Number(d.price))+'원 / 판';
    }
   };
   root.addEventListener('r3-review-journey-draft',saved);
   let onClick=e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.mfGo){api.select(button.dataset.mfGo,button.dataset.mfState||'');return;}
    if(button.dataset.openQuote){send('open',button.dataset.openQuote);return;}
    if(button.hasAttribute('data-q2-review')){
     const data=Object.fromEntries(new FormData(form));data.unknown=form.elements.unknown.checked;data.price=data.unknown?'':data.price;
     const invalid=!isAmount(data.qty)||Number(data.qty)<1?'qty':(!data.unknown&&!isAmount(data.price)?'price':'');
     for(const k of ['qty','price'])form.elements[k].setAttribute('aria-invalid',String(k===invalid));
     if(invalid){root.querySelector('#q2-issue').textContent=invalid==='qty'?'구매량을 확인해 주세요.':'구매가를 확인해 주세요.';form.elements[invalid].focus();return;}
     send('commit',data);
    }
   };
   if(form){
    form.elements.unknown.checked=state==='unknown';form.elements.price.disabled=form.elements.unknown.checked;
    form.elements.unknown.onchange=()=>{form.elements.price.disabled=form.elements.unknown.checked;};
    form.onsubmit=e=>{e.preventDefault();root.querySelector('[data-q2-review]').click();};
   }
   root.addEventListener('click',onClick);
   return ()=>{root.removeEventListener('click',onClick);root.removeEventListener('r3-review-journey-draft',saved);};
  }});
 }
}
