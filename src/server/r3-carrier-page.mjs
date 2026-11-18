import published from './r3-freight-public.gen.mjs';
import regions from './r3-freight-regions.gen.mjs';
export const freightPack={...published,regionChoices:regions.regions,regionVersion:regions.version};
export const carrierMarkup='<div id="carrier-editor"></div>';
export const carrierCss=`
#carrier-editor {margin:16px 0;color:#263449;min-width:0}
#carrier-editor details {background:white;border:1px solid #d8dee7;border-radius:10px;padding:.75rem;margin:.65rem 0}
#carrier-editor summary {cursor:pointer;font-weight:650}
#carrier-editor h3,#carrier-editor h4 {margin:.8rem 0 .45rem}
#carrier-editor .freight-row {display:flex;flex-wrap:wrap;align-items:end;gap:.6rem;margin:.6rem 0}
#carrier-editor .freight-row label {flex:1 1 130px;min-width:0}
#carrier-editor .freight-row input,#carrier-editor .freight-row select {width:100%;box-sizing:border-box;font:inherit;min-height:40px}
#carrier-editor label.freight-check {display:inline-flex;gap:.4rem;align-items:center;font-size:.9rem;width:auto;flex:none}
#carrier-editor .freight-check input {width:auto;min-height:0}
#carrier-editor .freight-scroll {max-width:100%;overflow:auto;max-height:30rem;scrollbar-width:thin}
#carrier-editor table {border-collapse:collapse;width:max-content;min-width:100%;font-variant-numeric:tabular-nums;font-size:.9rem}
#carrier-editor th,#carrier-editor td {padding:.4rem .55rem;text-align:left;border-bottom:1px solid #e6e8eb;white-space:nowrap}
#carrier-editor th {position:sticky;top:0;background:#f4f6f8}
#carrier-editor td input {width:7.5rem;min-height:36px}
#carrier-editor .freight-presets {display:flex;flex-wrap:wrap;gap:.45rem 1rem;margin:.7rem 0;border:0;padding:0}
#carrier-editor .freight-presets legend {font-weight:600;margin-bottom:.35rem}
#carrier-editor .freight-contract-list td:first-child {position:sticky;left:0;background:#fff}
#carrier-editor .freight-contract-list td input[type=checkbox] {width:1.2rem;min-height:1.2rem}
#carrier-editor td.is-changed input {outline:1px solid #627ade}
#carrier-editor small {display:block;color:#4d596a}
#carrier-editor .freight-notice {font-size:.88rem}
#carrier-editor button {min-height:40px}
`;

// This factory is serialized with the existing Cloudflare browserFunction wrapper.
export function mountCarrierEditor(root,initialCatalog){
  let catalog=initialCatalog,model=null,previous=null,active='',source='',shownTable='';
  const selectedPresets=new Set();
  const statuses={UNSET:'미설정',FEE:'유료',FREE:'무료',CONSULT:'별도 협의',UNAVAILABLE:'배송 불가'};
  const modes={PARCEL:'택배',TRUCK:'용달',FREIGHT:'정기화물',DIRECT:'직배송'};
  const units={TRAYS:'회당 판수',BOXES:'상자 수',KG:'총중량 (kg)',M3:'부피 (㎥)',PALLETS:'팔레트 수',KM:'거리 (km)'};
  const vat={UNKNOWN:'미확인',INCLUDED:'포함',EXTRA:'별도'};
  const selection={CHEAPEST:'총운송비가 낮은 순',PRIORITY:'계약 우선순위',MANUAL:'허용 계약 직접 지정'};
  const extraTypes={FLAT:'배송건당 원',PERCENT:'기본료의 %',PER_BOX:'상자당 원',PER_HOUR:'대기 시간당 원',QUOTE:'별도 견적'};
  const timing={ALWAYS:'선택한 계약·권역의 모든 배송',TIME:'계약 배송 시각',WEEKEND_HOLIDAY:'주말·공휴일',WAIT:'계약 대기시간 초과'};
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
  const id=()=>crypto.randomUUID();
  const copy=v=>v==null?null:JSON.parse(JSON.stringify(v));
  const choice=(v,t)=>new Option(t,v);
  const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
  function changed(){root.dispatchEvent(new Event('input',{bubbles:true}));}
  const group=(par)=>{const row=node('div',null,'freight-row');par.append(row);return row;};
  const details=(par,label,open=false)=>{const d=node('details');d.open=open;d.append(node('summary',label));par.append(d);return d;};
  const link=(par,title,url)=>{const a=node('a',title);a.href=url;a.rel='noopener noreferrer';a.target='_blank';par.append(a);};
  function input(parent,label,obj,key,type='text',opts={}){
    const l=node('label',label),e=node('input');e.type=type;e.value=obj[key]??'';if(type==='number'){e.min='0';e.step=opts.step||'any';}
    if(opts.hint)e.placeholder=opts.hint;
    e.setAttribute('aria-label',label);
    e.oninput=()=>{obj[key]=e.value==='' ? null:type==='number'?Number(e.value):e.value;};
    l.append(e);parent.append(l);return e;
  }
  function select(parent,title,obj,key,options,refresh=false){
    const l=node('label',title),el=node('select');el.setAttribute('aria-label',title);
    for(const [v,t] of options)el.add(choice(v,t));el.value=obj[key]??'';
    el.onchange=()=>{obj[key]=el.value||null;if(refresh)render();};
    l.append(el);parent.append(l);return el;
  }
  function toggle(par,title,obj,key,refresh=false){
    const l=node('label',null,'freight-check'),e=node('input');e.type='checkbox';e.checked=obj[key]===true;
    e.onchange=()=>{obj[key]=e.checked;if(refresh)render();};l.append(e,document.createTextNode(title));par.append(l);
  }
  function table(par,headers,rows){
    const wrap=node('div',null,'freight-scroll');wrap.tabIndex=0;
    const t=node('table'),h=t.createTHead().insertRow();
    for(const s of headers){const th=node('th',s);th.scope='col';h.append(th);}
    const b=t.createTBody();for(const cells of rows){const tr=b.insertRow();for(const content of cells){const td=tr.insertCell();if(content?.nodeType)td.append(content);else td.textContent=content??'—';}}
    wrap.append(t);par.append(wrap);return t;
  }
  function newPolicy(){return {schema:1,selection:'CHEAPEST',splitAllowed:false,manualId:null,manualReason:null,packing:{confirmed:false},contracts:[]};}
  function baseContract(name,mode){
    return {id:id(),name,mode,enabled:false,status:'UNSET',priority:(model.contracts.length+1)*10,measure:'TRAYS',min:null,max:null,
      prefixes:[],postcode:null,days:[0,1,2,3,4,5,6],start:null,end:null,cutoff:null,eggsConfirmed:false,termsConfirmed:false,
      vat:'UNKNOWN',vatPercent:null,capacityM3:null,capacityKg:null,trip:null,zone:'BASE',vehicle:null,rates:[],extras:[]};
  }
  const fmtRate=r=>r.amountKrw==null?'별도 견적':r.amountKrw.toLocaleString('ko-KR')+'원';
  const fmtSize=r=>r.vehicle?r.vehicle+' · '+r.publishedDistanceKm+'km':[r.weightUpperKg!=null?r.weightUpperKg+'kg 이하':'',r.sumDimensionsUpperCm!=null?r.sumDimensionsUpperCm+'cm 이하':''].filter(Boolean).join(' / ');
  function copyPublished(preset,variant){
    const known=model.contracts.find(c=>c.source?.presetId===preset.id&&c.source.packId===catalog.packId);
    if(known && !variant)return known;
    const truck=preset.id==='SEMA_DISTANCE_VEHICLE_PUBLIC';
    const c=baseContract(preset.provider+' '+preset.service,truck?'TRUCK':'PARCEL');
    const s=catalog.sources.find(s=>s.id===preset.sourceId);
    c.source={packId:catalog.packId,presetId:preset.id,sourceId:s.id,url:s.url,checked:s.accessedAt,effective:s.effectiveFrom??null};
    c.vat=preset.vatIncluded===true?'INCLUDED':preset.vatIncluded===false?'EXTRA':'UNKNOWN';
    c.maxBoxKg=preset.maxWeightKg??null;c.maxSumCm=preset.maxSumDimensionsCm??null;c.maxLongestCm=preset.maxLongestSideCm??null;c.minSumCm=preset.minSumDimensionsCm??null;
    c.rates=catalog.rates.filter(r=>r.presetId===preset.id).map(r=>({id:r.id,zone:r.zone,zoneName:r.zoneLabel+(r.deliveryLabel?' · '+r.deliveryLabel:''),maxKg:r.weightUpperKg,maxCm:r.sumDimensionsUpperCm,
      vehicle:r.vehicle,pointKm:r.publishedDistanceKm,fromKm:null,toKm:null,amount:r.amountKrw==null?null:String(r.amountKrw)}));
    c.zone=c.rates[0]?.zone??'BASE';
    c.vehicle=truck?c.rates[0]?.vehicle??null:null;
    c.extras=catalog.surcharges.filter(e=>e.presetId===preset.id).map(e=>({id:e.id,label:e.label,group:e.mutuallyExclusiveGroup,conditions:e.conditions,
      type:e.percentage!=null?'PERCENT':e.calculationBasis==='상자당'?'PER_BOX':e.id==='SEMA_WAITING'?'PER_HOUR':e.amountKrw!=null?'FLAT':'QUOTE',when:e.startTime?'TIME':e.id==='SEMA_WEEKEND_HOLIDAY'?'WEEKEND_HOLIDAY':e.freeMinutes!=null?'WAIT':'ALWAYS',fromTime:e.startTime??null,toTime:e.endTime??null,freeMinutes:e.freeMinutes??null,amount:e.percentage!=null?String(e.percentage*100):e.amountKrw!=null?String(e.amountKrw):null,enabled:false}));
    model.contracts.push(c);return c;
  }
  function copyAndOpen(presets,variant=false){
    if(!presets.length)return;
    if(!model)model=newPolicy();
    const additions=presets.filter(preset=>variant||!model.contracts.some(c=>c.source?.presetId===preset.id&&c.source.packId===catalog.packId));
    if(model.contracts.length+additions.length>24){
      root.querySelector('[data-freight-status]').textContent='한 가격표에 운송사 계약을 최대 24개까지 등록할 수 있습니다.';
      return;
    }
    active=presets.map(preset=>copyPublished(preset,variant))[0].id;
    selectedPresets.clear();
    changed();render();
  }
  function renderPresetSelection(panel){
    const fieldset=node('fieldset',null,'freight-presets');
    fieldset.append(node('legend','계약 초안에 추가할 운송사'));
    const copyButton=button('선택한 운송사 추가',()=>copyAndOpen(catalog.presets.filter(p=>selectedPresets.has(p.id))));
    copyButton.disabled=!selectedPresets.size;
    for(const preset of catalog.presets){
      const label=node('label',null,'freight-check'),check=node('input');
      check.type='checkbox';check.checked=selectedPresets.has(preset.id);
      check.onchange=()=>{
        if(check.checked)selectedPresets.add(preset.id);else selectedPresets.delete(preset.id);
        copyButton.disabled=!selectedPresets.size;
      };
      label.append(check,' '+preset.provider);fieldset.append(label);
    }
    panel.append(fieldset,copyButton);
  }
  function renderReference(){
    const panel=details(root,'운송사 공개 요금표 · '+catalog.asOf,shownTable==='reference'||!model);
    panel.ontoggle=()=>{if(panel.open)shownTable='reference';};
    const options=catalog.presets.map(p=>[p.id,p.provider+' '+p.service]);
    source=source||options[0][0];const sel=select(group(panel),'공개표 선택',{source},'source',options);
    sel.onchange=()=>{source=sel.value;shownTable='reference';render();};
    const preset=catalog.presets.find(p=>p.id===source),s=catalog.sources.find(s=>s.id===preset.sourceId);
    const rates=catalog.rates.filter(r=>r.presetId===source),extras=catalog.surcharges.filter(e=>e.presetId===source);
    const summary=node('p',rates.length+'개 요금 · '+(preset.vatIncluded===null?'VAT 미확인':preset.vatIncluded?'VAT 포함':'VAT 별도')
      +' · 적용일 '+(s.effectiveFrom??'미확인')+' · 확인 '+s.accessedAt.slice(0,10),'freight-notice');
    summary.append(' · ');link(summary,'공식 출처',s.url);panel.append(summary);
    const t=details(panel,'공개 요금·할증 보기');
    table(t,['규격 / 차종·거리','권역 / 서비스','단위','공개 요금'],rates.map(r=>[fmtSize(r),[r.zoneLabel,r.deliveryLabel].filter(Boolean).join(' · '),r.rateUnit,fmtRate(r)]));
    if(extras.length)table(t,['할증 항목','금액 / 비율','적용 조건'],extras.map(e=>[e.label,e.percentage!=null?(e.percentage*100)+'%':e.amountKrw!=null?fmtRate(e):'별도 견적',e.conditions]));
    for(const note of preset.knownLimitNotes??[])t.append(node('small',note));
    panel.append(button('계약표로 복사',()=>copyAndOpen([preset])));
    if(model?.contracts.some(c=>c.source?.presetId===source))panel.append(button('같은 운송사에 별도 계약 추가',()=>copyAndOpen([preset],true)));
    renderPresetSelection(panel);
  }
  function renderPacking(){
    const p=model.packing,box=details(root,'상품 포장·적재 프로필',!p.confirmed);let row=group(box);
    input(row,'상자당 판수',p,'unitsPerBox','number',{step:'1'});input(row,'한 상자 최대 총중량 (kg)',p,'kgPerBox','number');
    input(row,'한 상자 부피 (㎥)',p,'m3PerBox','number');row=group(box);
    input(row,'상자 세 변 합 (cm)',p,'sumCm','number');input(row,'상자 최장변 (cm)',p,'longestCm','number');
    input(row,'팔레트당 상자 수',p,'boxesPerPallet','number',{step:'1'});
    toggle(group(box),'이 상품의 포장·적재값을 확인함',p,'confirmed');
  }
  function regionsEditor(par,c){
    const selected=node('div',null,'freight-row');par.append(selected);
    for(const prefix of c.prefixes){
      const title=catalog.regionChoices.find(r=>r.value===prefix)?.label??prefix;
      selected.append(button(title+' ×',()=>{c.prefixes=c.prefixes.filter(v=>v!==prefix);changed();render();}));
    }
    const row=group(par),e=select(row,'적용 시도·시군구',{},'region',[['','지역 선택'],...catalog.regionChoices.map(r=>[r.value,r.label])]);
    row.append(button('지역 추가',()=>{if(e.value&&!c.prefixes.includes(e.value)){c.prefixes.push(e.value);changed();}render();}));
    input(row,'특정 우편번호 (선택)',c,'postcode');
  }
  function cell(r,k,label,kind='string',priorRow){
    const e=node('input');e.type='number';e.min='0';e.step='any';e.setAttribute('aria-label',label);e.value=r[k]??'';
    const mark=()=>{if(e.parentElement)e.parentElement.classList.toggle('is-changed',!!priorRow&&String(priorRow[k]??'')!==e.value);};
    e.oninput=()=>{r[k]=e.value===''?null:kind==='number'?Number(e.value):e.value;mark();};queueMicrotask(mark);return e;
  }
  function renderRates(par,c){
    const orig=catalog.rates.filter(x=>x.presetId===c.source?.presetId);
    const prev=previous?.contracts?.find(x=>x.id===c.id);
    const tr=c.mode==='TRUCK',parcel=c.mode==='PARCEL',freight=c.mode==='FREIGHT';
    const ratePanel=details(par,'계약 단가 편집 · '+c.rates.length+'행',true);
    ratePanel.append(node('small',tr?'공개 거리 지점에 없는 값은 별도 견적입니다. 서면 계약 구간이 있으면 양 끝 거리를 입력하세요.':'빈칸은 금액 미확인입니다.'));
    const zoneNames=new Map(c.rates.map(r=>[r.zone,r.zoneName||'기본 권역']));
    select(group(ratePanel),'적용 서비스 권역',c,'zone',[...zoneNames],true);
    if(tr){select(group(ratePanel),'적용 차종',c,'vehicle',[...new Set(c.rates.map(r=>r.vehicle).filter(Boolean))].map(x=>[x,x]),true);}
    const rows=c.rates.filter(r=>r.zone===c.zone&&(!tr||r.vehicle===c.vehicle));
    const headers=tr?['차종·표기 거리','계약 시작 km','계약 끝 km']:parcel?['최대 kg','세 변 합 cm']:freight?['합계 kg 이하','합계 ㎥ 이하']:['운임 기준'];
    const cells=rows.map(r=>{
      const prior=prev?.rates?.find(x=>x.id===r.id),published=orig.find(x=>x.id===r.id);
      let row=tr?[r.vehicle+' · '+(r.pointKm??'—')+'km',cell(r,'fromKm','계약 시작 거리','number',prior),cell(r,'toKm','계약 끝 거리','number',prior)]:parcel?[cell(r,'maxKg','최대 중량','number',prior),cell(r,'maxCm','세 변 합 상한','number',prior)]:freight?[cell(r,'maxKg','총중량 상한','number',prior),cell(r,'maxM3','총부피 상한','number',prior)]:[c.name];
      return [...row,published?fmtRate(published):'—',prior?.amount!=null?prior.amount+'원':'—',cell(r,'amount','계약 요금','string',prior),
        button('행 삭제',()=>{c.rates=c.rates.filter(x=>x!==r);changed();render();})];
    });
    table(ratePanel,[...headers,'공개표','이전 버전','계약 요금 (원)',''],cells);
    ratePanel.append(button('운임 행 추가',()=>{c.rates.push({id:id(),zone:c.zone||'BASE',zoneName:zoneNames.get(c.zone)||'기본 권역',vehicle:c.vehicle,pointKm:null,fromKm:null,toKm:null,maxKg:null,maxCm:null,amount:null});changed();render();}));
    if(tr){const r=group(ratePanel),e=input(r,'계약 차종 이름',{},'newVehicle');r.append(button('차종 추가',()=>{if(!e.value.trim())return;c.vehicle=e.value.trim();
      c.rates.push({id:id(),zone:c.zone||'BASE',zoneName:'계약 거리',vehicle:c.vehicle,amount:null});changed();render();}));}
    const accordion=details(par,'할증·작업비 · '+c.extras.length+'개',shownTable==='extras');
    accordion.ontoggle=()=>{if(accordion.open)shownTable='extras';};
    const options=group(accordion);select(options,'퍼센트 할증이 겹칠 때',c,'percentStack',[['','협의 필요'],['BASE_ADDITIVE','각각 기본 운임에 적용'],['COMPOUND','표 순서대로 누적 운임에 적용']]);
    if(c.extras.some(e=>e.when==='TIME'))input(options,'이 계약의 배송 예정 시각 (한국시간)',c,'serviceTime','time');
    if(c.extras.some(e=>e.when==='WAIT'||e.type==='PER_HOUR'))input(options,'이 계약의 확정 대기시간 (분)',c,'waitMinutes','number',{step:'1'});
    if(c.extras.some(e=>e.when==='WEEKEND_HOLIDAY')){
      const calendar=details(accordion,'계약에 적용할 공휴일 달력',true),r=group(calendar);
      input(r,'달력 확인 시작일',c,'calendarStart','date');input(r,'달력 확인 종료일',c,'calendarEnd','date');
      const d=input(r,'공휴일 추가 날짜',{},'value','date');r.append(button('공휴일 추가',()=>{if(d.value){c.holidays=[...new Set([...(c.holidays||[]),d.value])].sort();changed();render();}}));
      const list=group(calendar);
      for(const day of c.holidays||[])list.append(button(day+' ×',()=>{c.holidays=c.holidays.filter(x=>x!==day);changed();render();}));
      const verify=group(calendar);if(c.holidays==null)verify.append(button('확인 기간에 등록할 공휴일 없음',()=>{c.holidays=[];changed();render();}));
      else verify.append(node('small','확인 기간에 등록한 공휴일 '+c.holidays.length+'일'));
    }
    for(const e of c.extras){
      const row=group(accordion);toggle(row,'적용',e,'enabled');input(row,'할증 이름',e,'label');select(row,'계산 기준',e,'type',Object.entries(extraTypes),true);input(row,'계약 금액 또는 비율',e,'amount');
      e.when=e.when||'ALWAYS';select(row,'적용 조건',e,'when',Object.entries(timing),true);
      if(e.when==='TIME'){input(row,'할증 시작 시각',e,'fromTime','time');input(row,'할증 종료 시각',e,'toTime','time');}
      if(e.when==='WAIT'||e.type==='PER_HOUR'){
        input(row,'무료 대기시간 (분)',e,'freeMinutes','number',{step:'1'});
        if(e.type==='PER_HOUR'){
          select(row,'시간 요금 시작',e,'waitBasis',[['','미확정'],['AFTER_FREE','무료 시간 차감'],['ALL','초과 시 전체 시간']]);
          const inc=select(row,'대기 요금 단위',e,'increment',[['','미확정'],['15','15분'],['30','30분'],['60','60분']]);
          inc.onchange=()=>{e.increment=inc.value?Number(inc.value):null;};
          select(row,'부분 단위 처리',e,'rounding',[['','미확정'],['UP','올림'],['DOWN','내림']]);
        }
      }
      if(e.conditions)accordion.append(node('small',e.conditions));
      row.append(button('제거',()=>{c.extras=c.extras.filter(x=>x!==e);changed();render();}));
    }
    accordion.append(button('할증 추가',()=>{c.extras.push({id:id(),label:'추가 운임',type:'QUOTE',enabled:false,amount:null});changed();render();}));
  }
  function renderContract(c){
    const box=details(root,'계약 편집 · '+c.name,true),r=group(box);
    box.dataset.contractEditor='';box.tabIndex=-1;
    input(r,'운송사·서비스 계약명',c,'name');select(r,'운송 방식',c,'mode',Object.entries(modes),true);toggle(r,'계약 사용',c,'enabled');
    const r2=group(box);select(r2,'요금 상태',c,'status',Object.entries(statuses));input(r2,'계약 시작일',c,'start','date');input(r2,'계약 만료일',c,'end','date');input(r2,'우선순위',c,'priority','number',{step:'1'});
    const cond=details(box,'지역·회당 물량·서비스 조건',true);regionsEditor(cond,c);
    let row=group(cond);select(row,'회당 배송량 기준',c,'measure',Object.entries(units));input(row,'최소 (포함)',c,'min','number');input(row,'최대 (포함)',c,'max','number');input(row,'계약 경로 거리 (km)',c,'distanceKm','number');
    row=group(cond);input(row,'운송 수용 총중량 (kg)',c,'capacityKg','number');input(row,'운송 수용 부피 (㎥)',c,'capacityM3','number');input(row,'1상자 최대 kg',c,'maxBoxKg','number');
    input(row,'1상자 최소 세 변 합 cm',c,'minSumCm','number');input(row,'1상자 최대 세 변 합 cm',c,'maxSumCm','number');input(row,'1상자 최대 긴 변 cm',c,'maxLongestCm','number');
    row=group(cond);for(const [i,w] of ['일','월','화','수','목','금','토'].entries()){
      const l=node('label',null,'freight-check'),e=node('input');e.type='checkbox';e.checked=c.days.includes(i);e.onchange=()=>{c.days=e.checked?[...new Set([...c.days,i])]:c.days.filter(d=>d!==i);};l.append(e,w);row.append(l);}
    input(row,'당일 접수 마감',c,'cutoff','time');
    row=group(cond);select(row,'운임 부가세',c,'vat',Object.entries(vat));input(row,'별도 세율 (%)',c,'vatPercent');
    if(c.mode==='TRUCK'){select(row,'계약 운행 구분',c,'trip',[['','미확정'],['ONE_WAY','편도'],['ROUND_TRIP','왕복']]);}
    toggle(group(cond),'해당 포장의 계란 수탁·온도 조건을 계약에서 확인함',c,'eggsConfirmed');
    toggle(group(cond),'권역·운임·중첩 할증·작업비·반올림 등 적용 조건을 확인함',c,'termsConfirmed');
    const reference=catalog.sources.find(s=>s.id===c.source?.sourceId);
    if(reference){const p=node('small','공개표 복사본 · '+reference.accessedAt.slice(0,10)+' · ');link(p,'원본 출처',reference.url);box.append(p);}
    renderRates(box,c);
  }
  function renderContractList(){
    if(!model.contracts.length)return;
    const list=details(root,'운송사별 계약표 · '+model.contracts.length+'개',true);
    const old=root.querySelector('[data-contract-list]');
    if(old){list.open=old.open;old.replaceWith(list);}
    list.dataset.contractList='';
    const rows=model.contracts.map(c=>{
      const edit=button(c.name,()=>{active=c.id;render();root.querySelector('[data-contract-editor]')?.focus();});
      const enabled=node('input');enabled.type='checkbox';enabled.checked=c.enabled;
      enabled.setAttribute('aria-label',c.name+' 계약 적용');
      enabled.onchange=()=>{c.enabled=enabled.checked;changed();render();};
      const area=c.prefixes.map(prefix=>catalog.regionChoices.find(r=>r.value===prefix)?.label??prefix);
      const range=(c.min??'—')+' ~ '+(c.max??'—');
      return [edit,enabled,modes[c.mode],area.join(', ')||'지역 미지정',units[c.measure]+' '+range,c.start||'시작일 미정',statuses[c.status]];
    });
    table(list,['운송사·계약 편집','적용','운송 방식','적용 지역','1회 배송량','적용 시작일','운임 상태'],rows).className='freight-contract-list';
  }
  function render(){
    root.replaceChildren();
    if(!catalog)return;
    root.append(node('h3','배송 요금표'));
    const status=node('div');status.dataset.freightStatus='';status.setAttribute('role','status');root.append(status);
    renderReference();
    if(!model){root.append(button('새 계약 배송 정책',()=>{model=newPolicy();changed();render();}));return;}
    renderPacking();
    const rule=details(root,'회당 배송 선택 규칙',true),r=group(rule);select(r,'운송사 선택',model,'selection',Object.entries(selection),true);
    toggle(r,'명시적으로 나눈 출고건 허용',model,'splitAllowed');
    if(model.selection==='MANUAL'){
      select(r,'직접 지정할 계약',model,'manualId',[['','선택'],...model.contracts.map(c=>[c.id,c.name])]);input(r,'선택 사유',model,'manualReason');}
    rule.append(node('small','같은 총운임은 우선순위·고정 계약 순서로 선택합니다. 둘 이상의 후보가 있어도 물량을 자동 분할하지 않습니다.'));
    renderContractList();
    const contracts=group(root),switcher=select(contracts,'작업할 계약',{active},'active',[['','계약 선택'],...model.contracts.map(c=>[c.id,c.name])]);
    switcher.onchange=()=>{active=switcher.value;render();};
    const addContract=button('빈 계약 추가',()=>{const c=baseContract('새 운송사 계약','DIRECT');model.contracts.push(c);active=c.id;changed();render();});
    addContract.disabled=model.contracts.length>=24;contracts.append(addContract);
    const c=model.contracts.find(x=>x.id===active);
    if(c){
      contracts.append(button('선택한 계약 삭제',()=>{if(!window.confirm(c.name+' 계약을 이 초안에서 삭제할까요?'))return;model.contracts=model.contracts.filter(x=>x.id!==c.id);if(model.manualId===c.id)model.manualId=null;active=model.contracts[0]?.id??'';changed();render();}));
      renderContract(c);
    }
    if(!model.contracts.length)root.append(button('기존 권역 배송표로 돌아가기',()=>{model=null;active='';changed();render();}));
  }
  root.addEventListener('change',event=>{
    if(event.target.closest('[data-contract-editor]'))renderContractList();
  });
  render();
  return {
    read:()=>copy(model),
    set:(value,prior=null)=>{selectedPresets.clear();model=copy(value);previous=copy(prior);active=model?.contracts.some(c=>c.id===active)?active:model?.contracts[0]?.id??'';render();},
    setCatalog:next=>{selectedPresets.clear();catalog=next;render();}
  };
}
