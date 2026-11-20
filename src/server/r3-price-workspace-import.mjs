export function importPriceWorkbook(model,current,workbook,section,{replaceRanges=false}={}) {
  const d=model.clone(current),fail=s=>{throw new Error(s);},text=v=>String(v??'').trim(),numeric=(v,empty=false)=>{const s=text(v).replaceAll(',','');if(empty&&s==='')return '';if(!/^\d+(?:\.\d{1,4})?$/.test(s))fail('금액과 수량은 숫자로 입력해 주세요.');return String(Number(s));};
  const desired={costs:'개별 비용',classification:'상품 분류',carriers:'배송수단',products:'판매 상품'}[section];
  const sheet=workbook.sheets.find(s=>s.name===desired)||workbook.sheets[0];
  let headerAt=sheet.rows.findIndex((r,i)=>i<20&&r.some(v=>['난각번호','배송수단명','상품명'].includes(text(v))));
  if(headerAt<0)fail('입력 양식의 열 제목을 찾을 수 없습니다. 양식을 내려받아 입력해 주세요.');
  const headers=sheet.rows[headerAt].map(text),rows=sheet.rows.slice(headerAt+1).filter(r=>r.some(v=>text(v)!=='')),column=(r,h)=>r[headers.indexOf(h)];
  if(!rows.length)fail('가져올 데이터가 없습니다.');
  const ensure=h=>{if(!headers.includes(h))fail('필수 열이 없습니다: '+h);};
  const blankRows=()=>[{id:'range-1',min:1,max:null,discount:'0',prices:Object.fromEntries(d.grades.map(g=>[g.id,{raw:'',packing:'',packedOverride:null}]))}];
  function shell(v){const n=Number(text(v).replace(/번(?:란)?$/,''));if(!Number.isSafeInteger(n)||n<1||n>99)fail('난각번호는 1~99 사이의 정수로 입력해 주세요.');let s=d.shells.find(x=>x.number===n);if(!s){s={id:'shell-'+n,name:n+'번',number:n};d.shells.push(s);d.costs[s.id]=blankRows();}return s;}
  function grade(v){const name=text(v);if(!name||name.length>100)fail('계란 규격명을 입력해 주세요.');let g=d.grades.find(x=>x.name===name);if(!g){const standard=model.standard.find(x=>x.name===name);g={id:'grade-'+d.grades.length+'-'+Date.now(),name,weight:standard?.weight||0};d.grades.push(g);for(const rs of Object.values(d.costs))for(const r of rs)r.prices[g.id]={raw:'',packing:'',packedOverride:null};}return g;}
  function pack(v,name){const eggs=Number(numeric(v));if(!Number.isSafeInteger(eggs)||eggs<1||eggs>100000)fail('포장 구수를 확인해 주세요.');let p=d.packages.find(x=>x.eggs===eggs);if(!p){p={id:'pack-'+eggs,eggs,name:text(name)||eggs+'구'};d.packages.push(p);}else if(text(name))p.name=text(name);return p;}
  if(section==='costs'){
    if(d.pg.applied)fail('PG 수수료 일괄 반영을 해제한 뒤 원가표를 가져와 주세요.');
    for(const h of ['난각번호','규격','최소판수','최대판수','원란','포장비'])ensure(h);
    const imported=new Map(),seen=new Set();
    for(const r of rows){
      const s=shell(column(r,'난각번호')),g=grade(column(r,'규격')),min=Number(numeric(column(r,'최소판수'))),maxValue=text(column(r,'최대판수')),max=maxValue===''?null:Number(numeric(maxValue));
      if(!Number.isSafeInteger(min)||min<1||max!==null&&(!Number.isSafeInteger(max)||max<min))fail('판수 구간의 최소·최대 값을 확인해 주세요.');
      const key=s.id+'/'+min+'/'+max,cell=key+'/'+g.id;if(seen.has(cell))fail('동일한 난각번호·규격·판수 구간이 중복되었습니다.');seen.add(cell);
      let entry=imported.get(key);if(!entry){const prior=d.costs[s.id].find(x=>x.min===min);entry={shell:s.id,row:prior?{...model.clone(prior),max}:{id:'import-'+min+'-'+max,min,max,discount:'0',prices:{}}};imported.set(key,entry);}
      const discount=headers.includes('할인율')?numeric(text(column(r,'할인율')||0).replace(/%$/,'')):entry.row.discount||'0';
      if(entry.discount!==undefined&&entry.discount!==discount)fail('같은 판수 구간의 할인율은 같아야 합니다.');entry.discount=discount;entry.row.discount=discount;
      entry.row.prices[g.id]={raw:numeric(column(r,'원란'),true),packing:numeric(column(r,'포장비'),true),packedOverride:null};
      const date=text(column(r,'날짜'));if(date){if(!model.day(date))fail('날짜는 YYYY-MM-DD로 입력해 주세요.');if(imported.date&&imported.date!==date)fail('한 번에 하나의 날짜를 가져올 수 있습니다.');imported.date=date;}
    }
    for(const sid of new Set([...imported.values()].map(x=>x.shell))){const changed=[...imported.values()].filter(x=>x.shell===sid).map(x=>{for(const g of d.grades)x.row.prices[g.id]??={raw:'',packing:'',packedOverride:null};return x.row;});d.costs[sid]=(replaceRanges?changed:[...d.costs[sid].filter(r=>!changed.some(c=>c.min===r.min)),...changed]).sort((a,b)=>a.min-b.min);if(replaceRanges)for(const [key,rule] of Object.entries(d.packaging))if(key.startsWith(sid+'/'))for(const rowId of Object.keys(rule.fees||{}))if(!d.costs[sid].some(r=>r.id===rowId))delete rule.fees[rowId];}
    if(imported.date)d.date=imported.date;
  }else if(section==='classification'){
    for(const h of ['난각번호','규격','포장구수','포장비'])ensure(h);
    for(const r of rows){const s=shell(column(r,'난각번호')),g=grade(column(r,'규격')),p=pack(column(r,'포장구수'),column(r,'포장명')),names=text(column(r,'배송수단')).split(/[;,]/).map(x=>x.trim()).filter(Boolean),ids=names.map(name=>{const c=d.carriers.find(x=>x.name===name);if(!c)fail('배송수단을 먼저 등록해 주세요: '+name);return c.id;});const key=[s.id,g.id,p.id].join('/'),prior=d.packaging[key];d.packaging[key]={fee:numeric(column(r,'포장비'),true),fees:prior?.fees||{},carriers:headers.includes('배송수단')?ids:prior?.carriers||[],...(prior?.enabled===false?{enabled:false}:{})};}
  }else if(section==='carriers'){
    for(const h of ['배송수단명','종류','기본비용','배송가능지역'])ensure(h);
    const types={'택배':'parcel','화물':'freight','퀵':'quick','농장직배송':'farm'};
    for(const r of rows){const name=text(column(r,'배송수단명')),type=types[text(column(r,'종류'))]||text(column(r,'종류'));if(!['parcel','freight','quick','farm'].includes(type))fail('배송 종류는 택배·화물·퀵·농장직배송 중에서 선택해 주세요.');let c=d.carriers.find(x=>x.name===name);if(!c){c={id:'carrier-'+d.carriers.length+'-'+Date.now(),name};d.carriers.push(c);}Object.assign(c,{type,base:numeric(column(r,'기본비용'),true),remote:headers.includes('도서산간비용')?numeric(column(r,'도서산간비용'),true):c.remote??'',regions:text(column(r,'배송가능지역'))});}
  }else if(section==='products'){
    for(const h of ['상품명','난각번호','규격','포장구수','판매대상','판매가격'])ensure(h);
    const seen=new Set();
    for(const r of rows){
      const name=text(column(r,'상품명')),s=shell(column(r,'난각번호')),g=grade(column(r,'규격')),p=pack(column(r,'포장구수')),audience=text(column(r,'판매대상'))==='매장'?'store':text(column(r,'판매대상'))==='소비자'?'consumer':null;
      if(!audience)fail('판매대상은 매장 또는 소비자로 입력해 주세요.');
      const key=JSON.stringify([name,audience,s.id,g.id,p.id]);
      if(seen.has(key))fail('같은 상품명·판매대상·규격의 행이 중복되었습니다.');seen.add(key);
      const matches=d.products.filter(x=>x.name===name&&x.audience===audience&&x.shell===s.id&&x.grade===g.id&&x.package===p.id);
      if(matches.length>1)fail('같은 상품명·판매대상·규격의 상품이 여러 개입니다. 상품명을 구분한 뒤 가져와 주세요.');
      let product=matches[0];
      if(!product){product={id:'product-'+d.products.length+'-'+Date.now(),name};d.products.push(product);}
      Object.assign(product,{shell:s.id,grade:g.id,package:p.id,audience,price:numeric(column(r,'판매가격'),true),auto:headers.includes('자동계산')?['예','1','TRUE'].includes(text(column(r,'자동계산'))):false,enabled:headers.includes('판매중')?!['아니오','0','FALSE'].includes(text(column(r,'판매중'))):product.enabled??true});
      delete product.markup;
    }
  }else fail('가져올 메뉴를 선택해 주세요.');
  return {document:model.normalize(model.order(d)),sheet:sheet.name,count:rows.length};
}
