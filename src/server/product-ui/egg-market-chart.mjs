// This function is shared by the signed product page and the retained research app.
// Its dependencies are explicit so it can run under the existing nonce policy.
export function openEggMarketChart({root, trigger, readChart, onNotifications, signal}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  if (signal?.aborted) return;
  const existing = root.querySelector('#egg-market-chart[open]');
  if (existing) { existing.querySelector('[data-close]').focus(); return; }
  const dialog = doc.createElement('dialog');
  dialog.id = 'egg-market-chart';
  dialog.setAttribute('aria-labelledby', 'egg-market-title');
  dialog.innerHTML = `<div class="mk-shell"><header class="mk-head"><h2 id="egg-market-title">계란 시세</h2><button type="button" data-close aria-label="닫기" autofocus><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div class="mk-content"><div class="mk-filters">
    <div class="mk-filter"><span aria-hidden="true">조회 기간</span><div data-filters="date"></div></div>
    <div class="mk-filter"><span aria-hidden="true">계란 규격</span><div data-filters="product"></div></div></div>
    <p data-status role="status"></p><button type="button" data-retry hidden>다시 시도</button>
    <section data-result hidden aria-label="선택한 계란 시세"><div class="mk-stat-head"><div><p data-caption></p><p class="mk-value"><strong data-price></strong><span data-unit></span></p><p data-observed></p></div><button data-reset type="button" hidden>선택 해제</button></div>
    <div class="mk-plot" data-plot role="slider" aria-label="일자별 시세" aria-orientation="horizontal" tabindex="0"><svg data-chart viewBox="0 0 400 132" preserveAspectRatio="none" aria-hidden="true"></svg></div>
    <div class="mk-axis"><span data-first></span><span data-last></span></div>
    <div data-extremes></div></section></div>
    <footer><button type="button" data-inbox>시세 알림 보기 <span aria-hidden="true">›</span></button></footer></div>`;
  root.append(dialog);
  const get = name => dialog.querySelector('[data-' + name + ']');
  const plot = get('plot'), chart = get('chart'), close = get('close');
  const lifetime = new win.AbortController();
  const listen = (target, name, fn) => target.addEventListener(name, fn, {signal:lifetime.signal});
  const filters = {year:'', month:'', day:'', shell:'', grade:''};
  const controls = {};
  const won = new Intl.NumberFormat('ko-KR');
  const monthDay = date => date.slice(5).replace('-', '.');
  const fullDate = date => date.replaceAll('-', '.');
  const pad = number => String(number).padStart(2,'0');
  const dateOf = (year,month,day) => String(year) + '-' + pad(month) + '-' + pad(day);
  const daysIn = (year,month) => new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
  const sequence = (start,end) => Array.from({length:Math.max(0,end-start+1)},(_,i)=>start+i);
  const show = (element, visible) => { element.hidden = !visible; };
  function element(tag, text, className) {
    const el = doc.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className=className;
    return el;
  }
  let data = null, request = null, generation = 0, disposed = false, index = -1, span = null, drag = null, tracked = false;
  let sourceToday = '', firstDate = '', specs = null, graph = null;
  function clearDrag() {
    if (drag && plot.hasPointerCapture?.(drag.id)) plot.releasePointerCapture(drag.id);
    drag = null;
  }
  function dismiss(restore = true) {
    if (disposed) return;
    disposed = true; clearDrag(); request?.abort(); lifetime.abort();
    signal?.removeEventListener('abort', onAbort);
    if (dialog.open) dialog.close(); dialog.remove();
    if (restore && trigger?.isConnected) win.queueMicrotask(()=>{if(!doc.querySelector('dialog[open]'))trigger.focus({preventScroll:true});});
  }
  const onAbort = () => dismiss(false);
  signal?.addEventListener('abort',onAbort,{once:true});
  listen(close,'click',()=>dismiss());
  listen(dialog,'close',()=>dismiss());
  listen(dialog,'cancel',event=>{event.preventDefault();dismiss();});
  listen(dialog,'click',event=>{
    if (event.target !== dialog) return;
    const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dismiss();
  });
  listen(root,'order:research-leave',()=>dismiss(false));
  listen(root,'r3-onboarding-state',()=>dismiss(false));
  listen(get('inbox'),'click',()=>{dismiss(false);onNotifications?.();});
  show(dialog.querySelector('footer'),typeof onNotifications === 'function');
  function addFilter(group, field, label) {
    const wrap=element('label',undefined,'mk-chip'), select=element('select');
    select.dataset.filter=field; select.setAttribute('aria-label',label);
    wrap.append(select);dialog.querySelector('[data-filters="'+group+'"]').append(wrap);controls[field]=select;
    listen(select,'change',()=>{
      filters[field]=select.value;
      if(field==='year'){filters.month='';filters.day='';}
      if(field==='month'){if(!filters.year&&filters.month)filters.year=sourceToday.slice(0,4);filters.day='';}
      if(field==='day'&&filters.day){
        if(!filters.year)filters.year=sourceToday.slice(0,4);
        if(!filters.month)filters.month=String(Number(sourceToday.slice(5,7)));
      }
      updateFilters(); load();
    });
  }
  [['date','year','조회 연도'],['date','month','조회 월'],['date','day','조회 일'],['product','shell','난각번호'],['product','grade','계란 크기']].forEach(args=>addFilter(...args));
  function options(field, choices, empty) {
    const control=controls[field], opts=[];
    if(empty) opts.push(['',empty]);
    for(const [value,label] of choices) opts.push([String(value),label]);
    control.replaceChildren(...opts.map(([value,label])=>{const opt=element('option',label);opt.value=value;return opt;}));
    control.value=filters[field];control.disabled=choices.length===0;
    control.parentElement.dataset.selected=String(Boolean(filters[field]));
  }
  function updateFilters() {
    const today=sourceToday, year=Number(filters.year||today.slice(0,4)), month=Number(filters.month||today.slice(5,7));
    const currentYear=Number(today.slice(0,4)),currentMonth=Number(today.slice(5,7));
    const hasDate=Boolean(today), maxMonth=year===currentYear?currentMonth:12;
    const maxDay=year===currentYear&&month===currentMonth?Number(today.slice(8)):daysIn(year,month);
    options('year',hasDate?sequence(Number((firstDate||today).slice(0,4)),currentYear).reverse().map(v=>[v,v+'년']):[],'최근 30일');
    options('month',hasDate?sequence(1,maxMonth).map(v=>[v,v+'월']):[],'월 전체');
    options('day',hasDate?sequence(1,maxDay).map(v=>[v,v+'일']):[],'일 전체');
    options('shell',(specs?.shells||[]).map(v=>[v.id,/번/.test(v.name)?v.name:'난각 '+v.id+'번']),'난각번호');
    options('grade',(specs?.grades||[]).map(v=>[v.id,v.name]),'크기');
    // A series always has one shell and one size. Placeholders are only shown while loading.
    for(const key of ['shell','grade'])if(controls[key].value)controls[key].querySelector('option[value=""]').remove();
  }
  function query() {
    const result={};
    if(filters.shell)result.shell=filters.shell;
    if(filters.grade)result.grade=filters.grade;
    if(filters.year){
      const month=Number(filters.month||1),lastMonth=Number(filters.month||12);
      result.from=dateOf(filters.year,month,Number(filters.day||1));
      result.to=dateOf(filters.year,lastMonth,Number(filters.day||daysIn(filters.year,lastMonth)));
      if(result.to>sourceToday)result.to=sourceToday;
    }
    return result;
  }
  async function load() {
    const ticket=++generation;request?.abort();request=new win.AbortController();
    clearDrag();data=null;graph=null;index=-1;span=null;tracked=false;
    show(get('result'),false);show(get('retry'),false);get('status').textContent='시세를 불러오는 중이에요.';show(get('status'),true);
    try{
      const next=await readChart(query(),{signal:request.signal});
      if(disposed||ticket!==generation)return;
      data=next;sourceToday=next.today;firstDate=next.firstDate;specs={shells:next.shells,grades:next.grades};
      filters.shell=next.shell||'';filters.grade=next.grade||'';updateFilters();
      if(!next.points?.some(point=>Number.isFinite(point.price))){
        get('status').textContent='이 기간에 등록된 단가가 없어요.';return;
      }
      show(get('status'),false);show(get('result'),true);index=next.points.length-1;
      buildGraph();summary();paintSelection();
    }catch(error){
      if(disposed||ticket!==generation||error?.name==='AbortError')return;
      const denied=error?.status===401||error?.status===403;
      get('status').textContent=denied?'시세를 열람할 수 있는 권한이 필요해요.':'시세를 불러오지 못했어요.';
      show(get('retry'),!denied);
    }
  }
  function svg(name,attrs,parent=chart) {
    const node=doc.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
    parent.append(node);return node;
  }
  function buildGraph() {
    chart.replaceChildren();const points=data.points, values=points.filter(p=>Number.isFinite(p.price)).map(p=>p.price);
    const lo=Math.min(...values),hi=Math.max(...values),left=4,right=396,top=13,bottom=122;
    const x=i=>points.length===1?200:left+i*(right-left)/(points.length-1);
    const y=value=>lo===hi?(top+bottom)/2:bottom-(value-lo)/(hi-lo)*(bottom-top);
    graph={x,y};
    const defs=svg('defs',{}),gradient=svg('linearGradient',{id:'egg-market-fill',x1:0,x2:0,y1:0,y2:1,gradientUnits:'objectBoundingBox'},defs);
    svg('stop',{offset:'0%','stop-color':'#4775EB','stop-opacity':.17},gradient);
    svg('stop',{offset:'100%','stop-color':'#4775EB','stop-opacity':.025},gradient);
    for(const height of [top,(top+bottom)/2,bottom])svg('line',{x1:0,x2:400,y1:height,y2:height,stroke:'#DDE3EC','stroke-dasharray':'2 4'});
    let start=-1,line='';
    function draw(end){
      if(start<0)return;
      if(start===end)svg('circle',{cx:x(end),cy:y(points[end].price),r:3.1,fill:'#315DDE'});
      else{
        svg('path',{d:line+'V'+bottom+'H'+x(start)+'Z',fill:'url(#egg-market-fill)'});
        svg('path',{d:line,fill:'none',stroke:'#315DDE','stroke-width':2.3,'vector-effect':'non-scaling-stroke','stroke-linejoin':'round'});
      }
      start=-1;line='';
    }
    points.forEach((point,i)=>{
      if(!Number.isFinite(point.price)){draw(i-1);return;}
      if(start<0){start=i;line='M'+x(i)+' '+y(point.price);}
      else line+='H'+x(i)+'V'+y(point.price);
    });
    draw(points.length-1);
    const last=points[points.length-1];
    if(last.date===sourceToday&&Number.isFinite(last.price))svg('circle',{cx:x(points.length-1),cy:y(last.price),r:4,fill:'#F28A1A',stroke:'white','stroke-width':1.5,'data-current':''});
    graph.range=svg('rect',{y:0,height:132,fill:'#315DDE',opacity:.095});
    graph.cursor=svg('line',{y1:2,y2:128,stroke:'#7A8698','stroke-dasharray':'3 3','vector-effect':'non-scaling-stroke'});
    graph.dot=svg('circle',{r:4.3,fill:'#315DDE',stroke:'white','stroke-width':1.7});
    get('first').textContent=fullDate(points[0].date);get('last').textContent=points.length>1?fullDate(last.date):'';
    plot.setAttribute('aria-valuemin','1');plot.setAttribute('aria-valuemax',String(points.length));
  }
  function paintSelection() {
    if(!graph||!data||index<0)return;
    const point=data.points[index],range=span&&span[0]!==span[1]?span:null;
    get('caption').textContent='사업장 판매가 · 첫 수량 구간';
    get('price').textContent=Number.isFinite(point.price)?won.format(point.price):'기록 없음';
    get('unit').textContent=Number.isFinite(point.price)?'원 / 30구':'';
    let observation=fullDate(point.date)+(point.date===sourceToday?' · 현재':'');
    if(range){
      const group=data.points.slice(range[0],range[1]+1);
      const prices=group.filter(p=>Number.isFinite(p.price)).map(p=>p.price);
      observation=fullDate(group[0].date)+' – '+fullDate(group[group.length-1].date);
      if(prices.length)observation+=' · '+won.format(Math.min(...prices))+'~'+won.format(Math.max(...prices))+'원';
    }
    get('observed').textContent=observation;show(get('reset'),Boolean(tracked||range));
    plot.setAttribute('aria-valuenow',String(index+1));
    plot.setAttribute('aria-valuetext',fullDate(point.date)+' '+(Number.isFinite(point.price)?won.format(point.price)+'원':'기록 없음')+(range?' · '+observation:''));
    graph.range.setAttribute('width',range?graph.x(range[1])-graph.x(range[0]):0);
    if(range)graph.range.setAttribute('x',graph.x(range[0]));
    graph.cursor.style.display=tracked||range?'':'none';graph.dot.style.display=(tracked||range)&&Number.isFinite(point.price)?'':'none';
    graph.cursor.setAttribute('x1',graph.x(index));graph.cursor.setAttribute('x2',graph.x(index));
    graph.dot.setAttribute('cx',graph.x(index));graph.dot.setAttribute('cy',Number.isFinite(point.price)?graph.y(point.price):0);
  }
  function summary() {
    const region=get('extremes');region.replaceChildren();
    for(const [key,label] of [['low','기간 최저가'],['high','기간 최고가']]){
      const metric=data[key];if(!metric)continue;
      const row=element('div',undefined,'mk-summary-row');
      const amount=element('div',undefined,'mk-extreme-price');amount.append(element('span',label),element('strong',won.format(metric.price)+'원'));
      const periods=metric.periods;
      const periodText=period=>{
        const fmt=date=>period.start.slice(0,4)===sourceToday.slice(0,4)&&(!period.end||period.end.slice(0,4)===sourceToday.slice(0,4))?monthDay(date):fullDate(date);
        if(!period.end)return fmt(period.start)+'부터';
        return period.start===period.end?fmt(period.start):fmt(period.start)+' – '+fmt(period.end);
      };
      function periodNode(period){
        const line=element('span',periodText(period),'mk-period');
        if(!period.end)line.append(element('span','현재','mk-live'));
        return line;
      }
      const ranges=element('div',undefined,'mk-ranges');
      if(periods.length===1)ranges.append(periodNode(periods[0]));
      else if(periods.length>1){
        const details=element('details'),head=element('summary');
        head.append(periodNode(periods[periods.length-1]),element('span','외 '+(periods.length-1)+'회','mk-more'));
        details.append(head,...periods.slice(0,-1).reverse().map(periodNode));ranges.append(details);
      }
      row.append(amount,ranges);region.append(row);
    }
  }
  const atPointer=event=>{
    const box=plot.getBoundingClientRect(),fraction=(400*(event.clientX-box.left)/box.width-4)/392;
    return Math.max(0,Math.min(data.points.length-1,Math.round(fraction*(data.points.length-1))));
  };
  function setIndex(next,anchor=null){
    index=next;tracked=true;span=anchor===null||anchor===next?null:[Math.min(anchor,next),Math.max(anchor,next)];paintSelection();
  }
  listen(plot,'pointerdown',event=>{
    if(!data||!graph||!event.isPrimary||event.button!==0)return;
    const point=atPointer(event);drag={id:event.pointerId,anchor:point};
    plot.focus({preventScroll:true});plot.setPointerCapture?.(event.pointerId);setIndex(point);
  });
  listen(plot,'pointermove',event=>{
    if(!data||!graph||!event.isPrimary)return;
    if(drag&&event.pointerId===drag.id)setIndex(atPointer(event),drag.anchor);
    else if(!drag&&event.pointerType==='mouse'&&!span)setIndex(atPointer(event));
  });
  listen(plot,'pointerup',event=>{if(drag?.id===event.pointerId){setIndex(atPointer(event),drag.anchor);clearDrag();}});
  listen(plot,'pointercancel',event=>{if(drag?.id===event.pointerId)clearDrag();});
  listen(plot,'lostpointercapture',event=>{if(drag?.id===event.pointerId)drag=null;});
  function reset(){if(!data)return;index=data.points.length-1;tracked=false;span=null;paintSelection();}
  listen(get('reset'),'click',()=>{reset();plot.focus();});
  listen(get('retry'),'click',load);
  let keyAnchor=null;
  listen(plot,'keydown',event=>{
    if(!data||!graph)return;
    if(event.key==='Escape'&&(tracked||span)){event.preventDefault();event.stopPropagation();keyAnchor=null;reset();return;}
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowDown:-1,ArrowUp:1,Home:-Infinity,End:Infinity}[event.key];
    if(delta===undefined)return;
    event.preventDefault();const next=Math.max(0,Math.min(data.points.length-1,index+delta));
    if(!event.shiftKey)keyAnchor=null;else if(keyAnchor===null)keyAnchor=index;
    setIndex(next,keyAnchor);
  });
  listen(plot,'keyup',event=>{if(event.key==='Shift')keyAnchor=null;});
  updateFilters();
  dialog.showModal();close.focus({preventScroll:true});load();
  return {close:dismiss};
}
