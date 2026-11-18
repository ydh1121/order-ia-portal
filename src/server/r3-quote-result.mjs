// Only the verified buyer response may provide amounts. Pricing drafts, local form
// entries, issuer diagnostics and practice totals never participate in this view.
export function projectBuyerResult(snapshot, now = Date.now()) {
  if (!snapshot || typeof snapshot.id !== 'string') return {state:'unavailable'};
  const end = Date.parse(snapshot.expiresAt);
  if (!Number.isFinite(end)) return {state:'unavailable'};
  if (snapshot.status==='EXPIRED' || end<=now) return {state:'expired',end};
  const response=snapshot.response;
  if (snapshot.status!=='ISSUED' || response?.status!=='OK' || response.completion!=='COMPLETE' ||
      response.quotes?.length!==1) return {state:'unavailable'};
  const quote=response.quotes[0], total=quote?.total, issued=Date.parse(snapshot.issuedAt);
  function exact(value,signed=false) {
    if (!value || !Number.isInteger(value.scale) || value.scale<0 || value.scale>12 ||
        typeof value.minorUnits!=='string' || !/^-?\d{1,100}$/.test(value.minorUnits)) return null;
    const n=BigInt(value.minorUnits);
    if (!signed && n<0n) return null;
    const digits=(n<0n?-n:n).toString().padStart(value.scale+1,'0');
    const decimal=(n<0n?'-':'')+(value.scale?digits.slice(0,-value.scale)+'.'+digits.slice(-value.scale):digits);
    return decimal===value.decimal?n:null;
  }
  const proposed=exact(total);
  if (quote.currency!=='KRW' || proposed===null || !Number.isFinite(issued) || issued>=end) return {state:'unavailable'};
  const base={state:'offer',proposed:total.decimal,issued,end};
  if (quote.comparisonEligibility!=='ELIGIBLE') return base;
  const current=quote.comparison?.current, difference=quote.comparison?.difference;
  const original=exact(current), delta=exact(difference,true);
  if (original===null || delta===null || current.scale!==total.scale ||
      difference.scale!==total.scale || delta!==original-proposed) return base;
  const greatest=original>proposed?original:proposed;
  const ratio=value=>greatest?Number(value*1000n/greatest)/10:0;
  return {...base,state:delta>0n?'saving':delta<0n?'current-lower':'equal',
    current:current.decimal,difference:difference.decimal.replace(/^-/,''),
    currentRatio:ratio(original),proposedRatio:ratio(proposed)};
}

export function createBuyerResult(host,project,readDetail,recompare) {
  const make=(tag,copy)=>{const el=document.createElement(tag);if(copy!==undefined)el.textContent=copy;return el;};
  const action=(label,fn)=>{const b=make('button',label);b.type='button';b.onclick=fn;return b;};
  const currency=decimal=>{
    const [integer,fraction]=decimal.split('.');
    return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:'')+'원';
  };
  const date=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Seoul'});
  let timer=null,generation=0;
  function clear(){generation++;clearTimeout(timer);timer=null;host.replaceChildren();delete host.dataset.state;}
  function message(state,title,detail){
    clear();host.dataset.state=state;host.append(make('h3',title));if(detail)host.append(make('p',detail));
  }
  function show(snapshot,selected=null) {
    clear();const m=project(snapshot),token=generation;
    host.dataset.state=m.state;
    if(m.state==='expired'){
      message('expired','견적 유효기간이 지났어요',date.format(m.end)+' 만료');
      host.append(action('납품 조건 다시 확인하기',recompare));return;
    }
    if(m.state==='unavailable'){message('unavailable','견적을 불러올 수 없어요');return;}
    const comparable=m.current!==undefined;
    const title=m.state==='equal'?'현재 납품가와 가격이 같아요':m.state==='current-lower'?'현재 납품가가 더 낮아요':m.state==='saving'?currency(m.difference)+' 줄일 수 있어요':'이번 조건의 제안 납품가';
    host.append(make('h3',title));
    if(!comparable)host.append(make('p','현재 납품가와 비교할 자료가 없어요.'));
    const chart=make('div');chart.className='buyer-chart';host.append(chart);
    const detail=(label)=>{const mine=++generation;clearTimeout(timer);timer=null;host.replaceChildren(make('p','견적을 확인하고 있어요.'));
      Promise.resolve().then(()=>readDetail(snapshot.id)).then(next=>{if(generation===mine)show(next,label);})
        .catch(error=>{
          if(generation!==mine)return;
          if(error.message==='ACCESS_REQUIRED')message('unverified','사업자 확인 후 납품가를 볼 수 있어요');
          else message('unavailable','이 견적을 열 수 없어요','사업장을 다시 선택해 주세요.');
        });};
    const emphasis=m.state==='current-lower'?'current':'proposed';
    for(const [key,label,amount,ratio] of [['current','현재 납품가',m.current,m.currentRatio],['proposed','제안 납품가',m.proposed,m.proposedRatio]]){
      if(amount===undefined)continue;
      const card=action('',()=>detail(key));card.className='buyer-price';card.dataset.kind=key;card.dataset.emphasis=String(key===emphasis);
      card.setAttribute('aria-label',label+' '+currency(amount)+' 상세 보기');
      card.append(make('span',label),make('strong',currency(amount)));
      if(comparable&&!selected){
        const track=make('span'),bar=make('span');track.className='buyer-track';bar.className='buyer-bar';
        track.setAttribute('aria-hidden','true');bar.style.height=ratio+'%';track.append(bar);card.append(track);
      }
      if(selected===key){card.classList.add('buyer-selected');card.setAttribute('aria-pressed','true');}
      chart.append(card);
    }
    if(selected){
      const meta=make('dl');
      for(const [label,value] of [['견적 기준일',m.issued],['견적 만료일',m.end]])meta.append(make('dt',label),make('dd',date.format(value)));
      host.append(meta,action('견적 요약으로 돌아가기',()=>detail(null)));
    }
    const countdown=make('small');countdown.setAttribute('aria-live','off');host.append(countdown);
    function tick(){
      if(generation!==token)return;
      const ms=m.end-Date.now();
      if(ms<=0){show({id:snapshot.id,status:'EXPIRED',expiresAt:new Date(m.end).toISOString()});return;}
      const seconds=Math.ceil(ms/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds/3600)%24,minutes=Math.floor(seconds/60)%60;
      countdown.textContent='유효시간 '+days+'일 '+hours+'시간 '+minutes+'분 '+seconds%60+'초';
      timer=setTimeout(tick,Math.min(ms,1000));
    }
    tick();
  }
  return {clear,show,gate:()=>message('unverified','사업자 확인 후 납품가를 볼 수 있어요'),
    empty:()=>message('no-offer','이 사업장에 제안할 수 있는 상품이 없어요')};
}

export const buyerResultCss=`
#buyerResult:not(:empty){display:grid;gap:1rem;justify-items:center;max-width:36rem;margin:1.5rem auto;padding:clamp(1rem,5vw,2.5rem);background:#fff;text-align:center;border-radius:1rem}
#buyerResult h3,#buyerResult p{margin:0}#buyerResult h3{font-size:clamp(1.25rem,4vw,1.8rem);line-height:1.35;color:#202830}
#buyerResult .buyer-chart{display:flex;width:100%;align-items:end;justify-content:center;gap:.65rem}
#buyerResult .buyer-price{min-width:0;flex:1;max-width:15rem;display:grid;gap:.45rem;align-items:end;justify-items:center;border:1px solid #cbd0d9;background:white;color:#525e70;overflow-wrap:anywhere;padding:.75rem .4rem}
#buyerResult .buyer-price[data-emphasis=true]{color:#294acb;border-color:#4568db}#buyerResult .buyer-price strong{font-size:clamp(1.1rem,4vw,1.7rem)}
#buyerResult .buyer-selected{outline:2px solid currentColor;outline-offset:-2px}
#buyerResult .buyer-track{display:flex;align-items:end;justify-content:center;height:clamp(5rem,14vw,9rem);width:100%}
#buyerResult .buyer-bar{width:clamp(1.2rem,5vw,3.25rem);min-height:0;background:#9da4af;border-radius:5px 5px 0 0}
#buyerResult [data-emphasis=true] .buyer-bar{background:#3659dc}
#buyerResult .buyer-price[data-kind=proposed] .buyer-bar{transform-origin:bottom;animation:r3-buyer-bar .35s ease-out both}@keyframes r3-buyer-bar{from{transform:scaleY(0)}to{transform:scaleY(1)}}@media(prefers-reduced-motion:reduce){#buyerResult .buyer-price[data-kind=proposed] .buyer-bar{animation:none}}
#buyerResult dl{display:grid;grid-template-columns:auto 1fr;text-align:left;font-size:.9rem;gap:.35rem 1rem;margin:0}
#buyerResult dd{margin:0}#buyerResult small{color:#506070}
`;
