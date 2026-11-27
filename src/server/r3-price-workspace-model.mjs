export function createPriceWorkspaceModel() {
  const clone=x=>JSON.parse(JSON.stringify(x));
  const fail=code=>{throw new Error(code);};
  const token=x=>typeof x==='string'&&/^[\w.:-]{1,100}$/.test(x)&&!['__proto__','prototype','constructor'].includes(x);
  const label=x=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=100;
  const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
  const num=(x,max=999999999999.9999)=>typeof x==='string'&&/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(x)&&Number(x)<=max;
  const money=x=>x===''||num(x);
  const price=x=>money(x)||x==='협의'||x==='미판매';
  const standard=[{id:'king',name:'왕란',weight:68},{id:'xl',name:'특란',weight:60},{id:'large',name:'대란',weight:52},{id:'medium',name:'중란',weight:44},{id:'small',name:'소란',weight:0}];
  function initial(today,reference,legacy=null) {
    const priorVersion=legacy?.priceBook?.versions.find(v=>v.id===legacy.priceBook.activeVersion);
    const source=priorVersion?.shells.find(s=>s.key===legacy.priceBook.activeShell)?.matrix||legacy?.matrix;
    const grades=clone(source?.grades||standard.slice(0,4)).map((g,i)=>({...g,weight:standard.find(s=>s.name===g.name)?.weight??Math.max(0,68-i*8)}));
    if(!grades.some(g=>g.name==='소란'))grades.push({...clone(standard[4]),id:grades.some(g=>g.id==='small')?'standard-small':'small'});
    const makeRows=matrix=>(matrix?.rows||reference).map((r,i)=>({id:'range-'+i,min:r.min,max:r.max,discount:'0',prices:Object.fromEntries(grades.map((g,position)=>{
      const c=matrix?matrix.grades.findIndex(x=>x.id===g.id||x.name===g.name):standard.findIndex(x=>x.name===g.name);
      const raw=c<0?'':String(r.cells[c*2]??''),packed=c<0?'':String(r.cells[c*2+1]??'');
      return [g.id,{raw,packing:packed.startsWith('+')?packed.slice(1):num(packed)&&num(raw)&&Number(packed)>=Number(raw)?String(Number((Number(packed)-Number(raw)).toFixed(4))):'',packedOverride:packed!==''&&!packed.startsWith('+')?packed:null}];
    }))}));
    const shells=[1,2,3,4].map(n=>({id:String(n),name:n+'번',number:n}));
    if(legacy&&!['1','2','3','4'].includes(legacy.shell))shells.push({id:'unspecified',name:'난각 미지정',number:0});
    return {schema:1,date:today,grades,shells,packages:[6,10,15,20,30,60,150,300].map(n=>({id:'pack-'+n,eggs:n,name:n+'구'})),
      costs:Object.fromEntries(shells.map(s=>{const prior=priorVersion?.shells.find(x=>x.key===s.id)?.matrix;const isLegacy=s.id===(legacy?.shell||'unspecified');return [s.id,makeRows(prior||(isLegacy?source:null))];})),packaging:{},carriers:[],products:[],pg:{rate:'0',applied:false,original:{}},
      basePackSize:legacy?.packSize||30,minimumOrder:legacy?.minimumOrder||10,legacyArchive:!!legacy};
  }
  function normalize(input) {
    if(!input||input.schema!==1||!day(input.date))fail('WORKSPACE_DATE_INVALID');
    const d=clone(input);
    for(const [key,max] of [['shells',32],['grades',32],['packages',80],['carriers',64],['products',2000]]){
      if(!Array.isArray(d[key])||d[key].length>max||(['shells','grades','packages'].includes(key)&&!d[key].length))fail('WORKSPACE_ITEMS_INVALID');
      if(new Set(d[key].map(x=>x.id)).size!==d[key].length||d[key].some(x=>!token(x.id)||!label(x.name)))fail('WORKSPACE_ITEMS_INVALID');
    }
    if(d.shells.some(s=>!Number.isSafeInteger(s.number)||s.number<0||s.number>99)||new Set(d.shells.map(s=>s.number)).size!==d.shells.length)fail('WORKSPACE_SHELL_INVALID');
    if(d.grades.some(g=>!Number.isFinite(g.weight)||g.weight<0||g.weight>1000))fail('WORKSPACE_GRADE_INVALID');
    if(d.packages.some(p=>!Number.isSafeInteger(p.eggs)||p.eggs<1||p.eggs>100000)||new Set(d.packages.map(p=>p.eggs)).size!==d.packages.length)fail('WORKSPACE_PACKAGE_INVALID');
    if(!Number.isSafeInteger(d.basePackSize)||d.basePackSize<1||d.basePackSize>100000||!Number.isSafeInteger(d.minimumOrder)||d.minimumOrder<1)fail('WORKSPACE_PACKAGE_INVALID');
    const cost={};
    for(const shell of d.shells){
      const rows=d.costs?.[shell.id];if(!Array.isArray(rows)||!rows.length||rows.length>200)fail('WORKSPACE_RANGE_INVALID');
      const seen=new Set();
      cost[shell.id]=rows.map(r=>{
        if(!token(r.id)||seen.has(r.id)||!Number.isSafeInteger(r.min)||r.min<1||r.min>1e9||!(r.max===null||Number.isSafeInteger(r.max)&&r.max>=r.min&&r.max<=1e9)||!num(r.discount,100))fail('WORKSPACE_RANGE_INVALID');seen.add(r.id);
        const prices={};for(const grade of d.grades){const p=r.prices?.[grade.id];if(!p||!price(p.raw)||!money(p.packing)||!(p.packedOverride==null||price(p.packedOverride)))fail('WORKSPACE_PRICE_INVALID');prices[grade.id]={raw:p.raw,packing:p.packing,packedOverride:p.packedOverride??null};}
        return {id:r.id,min:r.min,max:r.max,discount:r.discount,prices};
      });
      const ordered=[...cost[shell.id]].sort((a,b)=>a.min-b.min);for(let i=1;i<ordered.length;i++)if(ordered[i-1].max===null||ordered[i].min<=ordered[i-1].max)fail('WORKSPACE_RANGE_OVERLAP');
    }
    d.costs=cost;
    if(!d.pg||!num(d.pg.rate,100)||typeof d.pg.applied!=='boolean'||!d.pg.original||typeof d.pg.original!=='object'||Array.isArray(d.pg.original))fail('WORKSPACE_PG_INVALID');
    for(const [k,v] of Object.entries(d.pg.original))if(k.length>400||!v||!money(v.before)||!money(v.after))fail('WORKSPACE_PG_INVALID');
    const carriers=new Set(d.carriers.map(c=>c.id)),shells=new Set(d.shells.map(s=>s.id)),grades=new Set(d.grades.map(g=>g.id)),packs=new Set(d.packages.map(p=>p.id));
    for(const c of d.carriers){
      if(!['parcel','freight','quick','farm'].includes(c.type)||!money(c.base)||!money(c.remote)||typeof c.regions!=='string'||c.regions.length>500)fail('WORKSPACE_CARRIER_INVALID');
      if(c.official!=null){if(!label(c.official.name)||!Array.isArray(c.official.sheets)||c.official.sheets.length>20)fail('WORKSPACE_FILE_INVALID');for(const s of c.official.sheets)if(!label(s.name)||!Array.isArray(s.rows)||s.rows.length>3000||s.rows.some(r=>!Array.isArray(r)||r.length>80||r.some(v=>typeof v!=='string'&&typeof v!=='number'&&v!==null||String(v??'').length>1000)))fail('WORKSPACE_FILE_INVALID');}
    }
    if(!d.packaging||typeof d.packaging!=='object'||Array.isArray(d.packaging))fail('WORKSPACE_PACKAGE_INVALID');
    const packaging={};for(const [k,v] of Object.entries(d.packaging)){
      const parts=k.split('/');if(parts.length!==3||!shells.has(parts[0])||!grades.has(parts[1])||!packs.has(parts[2])||!money(v.fee)||!Array.isArray(v.carriers)||v.carriers.some(id=>!carriers.has(id)))fail('WORKSPACE_PACKAGE_INVALID');
      const fees={};for(const [rowId,fee] of Object.entries(v.fees||{})){if(!d.costs[parts[0]].some(r=>r.id===rowId)||!money(fee))fail('WORKSPACE_PACKAGE_INVALID');fees[rowId]=fee;}
      if(!(v.enabled==null||typeof v.enabled==='boolean'))fail('WORKSPACE_PACKAGE_INVALID');
      packaging[k]={fee:v.fee,fees,carriers:[...new Set(v.carriers)],...(v.enabled===false?{enabled:false}:{})};
    }d.packaging=packaging;
    for(const p of d.products){
      if(!shells.has(p.shell)||!grades.has(p.grade)||!packs.has(p.package)||!['store','consumer'].includes(p.audience)||!money(p.price)||typeof p.enabled!=='boolean'||!(p.auto==null||typeof p.auto==='boolean'))fail('WORKSPACE_PRODUCT_INVALID');
      if(p.storeProduct!=null){const base=d.products.find(x=>x.id===p.storeProduct);if(p.audience!=='consumer'||!base||base.audience!=='store'||!sameSpec(base,p))fail('WORKSPACE_PRODUCT_INVALID');}
      if(p.markup!=null&&(!['percent','amount'].includes(p.markup.kind)||!num(p.markup.value,p.markup.kind==='percent'?10000:999999999999)||p.audience!=='consumer'||!storeProduct(d,p)))fail('WORKSPACE_MARKUP_INVALID');
    }
    if(d.deliveryRules!=null){
      if(!Array.isArray(d.deliveryRules)||d.deliveryRules.length>2000||new Set(d.deliveryRules.map(r=>r.id)).size!==d.deliveryRules.length)fail('WORKSPACE_DELIVERY_INVALID');
      for(const r of d.deliveryRules){
        if(!token(r.id)||!(r.shell===null||shells.has(r.shell))||!(r.grade===null||grades.has(r.grade))||!packs.has(r.package)||!carriers.has(r.carrier)||!['pack','egg'].includes(r.unit)||!Number.isSafeInteger(r.min)||r.min<1||r.min>1e9||!(r.max===null||Number.isSafeInteger(r.max)&&r.max>=r.min&&r.max<=1e9)||!money(r.fee))fail('WORKSPACE_DELIVERY_INVALID');
        const b=deliveryBounds(d,r);if(b.max!==null&&b.max<b.min)fail('WORKSPACE_DELIVERY_EMPTY_RANGE');
      }
      for(let i=0;i<d.deliveryRules.length;i++)for(let j=i+1;j<d.deliveryRules.length;j++){
        const a=d.deliveryRules[i],b=d.deliveryRules[j];if(a.package!==b.package||a.shell!==null&&b.shell!==null&&a.shell!==b.shell||a.grade!==null&&b.grade!==null&&a.grade!==b.grade)continue;
        const x=deliveryBounds(d,a),y=deliveryBounds(d,b);if(x.min<=(y.max??Infinity)&&y.min<=(x.max??Infinity))fail('WORKSPACE_DELIVERY_OVERLAP');
      }
    }
    return d;
  }
  function calculated(d,shell,row,grade){
    const p=d.costs[shell]?.find(r=>r.id===row)?.prices[grade],r=d.costs[shell]?.find(r=>r.id===row);if(!p)return {raw:null,packed:null};
    const raw=num(p.raw)?Number(r.discount)===0?Number(p.raw):Math.round(Number(p.raw)*(1-Number(r.discount)/100)):p.raw||null;
    let packed=p.packedOverride==null?typeof raw==='number'&&num(p.packing)?raw+Number(p.packing):null:num(p.packedOverride)?Number(p.packedOverride):p.packedOverride||null;
    if(p.packedOverride!=null&&typeof packed==='number'&&typeof raw==='number'&&Number(r.discount)!==0){packed=Math.round(packed-(Number(p.raw)-raw));if(packed<0)packed=null;}
    return {raw,packed};
  }
  function bulk(d,shell,field,amount){
    if(!['raw','packing'].includes(field)||!Number.isFinite(amount)||!Number.isInteger(amount))fail('WORKSPACE_PRICE_INVALID');
    for(const r of d.costs[shell])for(const p of Object.values(r.prices))if(num(p[field])&&(Number(p[field])+amount<0||num(p.packedOverride)&&num(p.packing)&&Number(p.packedOverride)+amount<0))fail('WORKSPACE_NEGATIVE_PRICE');
    for(const r of d.costs[shell])for(const p of Object.values(r.prices))if(num(p[field])){p[field]=String(Number(p[field])+amount);if(num(p.packedOverride)&&num(p.packing))p.packedOverride=String(Number(p.packedOverride)+amount);}
  }
  function pg(d,apply){
    if(d.pg.applied===apply)return;
    const factor=1+Number(d.pg.rate)/100;if(!Number.isFinite(factor)||factor<1||factor>2)fail('WORKSPACE_PG_INVALID');
    for(const [shell,rows] of Object.entries(d.costs))for(const r of rows)for(const [grade,p] of Object.entries(r.prices))for(const field of ['raw','packing','packedOverride']){
      if(!num(p[field]))continue;const key=[shell,r.id,grade,field].join('/'),prior=d.pg.original[key];
      if(apply){const after=String(Math.round(Number(p[field])*factor));d.pg.original[key]={before:p[field],after};p[field]=after;}
      else p[field]=prior&&prior.after===p[field]?prior.before:String(Math.round(Number(p[field])/factor));
    }
    d.pg.applied=apply;if(!apply)d.pg.original={};
  }
  function bound(rows,index,field,value){
    if(!['min','max'].includes(field)||!Number.isSafeInteger(value)||value<1)fail('WORKSPACE_RANGE_INVALID');
    const r=rows[index],prev=rows[index-1],next=rows[index+1];r[field]=value;
    if(field==='min'&&(r.max==null&&next||r.max!==null&&r.max<value||r.max===''))r.max=next?.min>value?next.min-1:value+1;
    if(field==='max'&&(!r.min||r.min>value))r.min=prev?.max!=null&&prev.max<value?prev.max+1:Math.max(1,value-1);
  }
  function remove(d,kind,id){
    const list=d[kind];if(!list||!list.some(x=>x.id===id))return;if(['shells','grades','packages'].includes(kind)&&list.length===1)fail('WORKSPACE_LAST_ITEM');
    d[kind]=list.filter(x=>x.id!==id);
    if(kind==='shells')delete d.costs[id];
    if(kind==='grades')for(const rows of Object.values(d.costs))for(const r of rows)delete r.prices[id];
    if(['shells','grades','packages'].includes(kind)){
      const n={shells:0,grades:1,packages:2}[kind];for(const key of Object.keys(d.packaging))if(key.split('/')[n]===id)delete d.packaging[key];
      const field={shells:'shell',grades:'grade',packages:'package'}[kind];d.products=d.products.filter(p=>p[field]!==id);
    }
    if(kind==='carriers')for(const v of Object.values(d.packaging))v.carriers=v.carriers.filter(x=>x!==id);
    const deliveryField={shells:'shell',grades:'grade',packages:'package',carriers:'carrier'}[kind];if(deliveryField&&d.deliveryRules)d.deliveryRules=d.deliveryRules.filter(r=>r[deliveryField]!==id);
    if(kind==='products')for(const p of d.products)if(p.storeProduct===id){delete p.storeProduct;delete p.markup;}

  }
  const order=d=>{d.shells.sort((a,b)=>a.number===0?1:b.number===0?-1:b.number-a.number);d.grades.sort((a,b)=>b.weight-a.weight);return d;};
  const sameSpec=(a,b)=>a.shell===b.shell&&a.grade===b.grade&&a.package===b.package;
  function storeProduct(d,p){
    if(p.audience==='store')return p;
    if(p.storeProduct)return d.products.find(x=>x.id===p.storeProduct&&x.audience==='store'&&sameSpec(x,p))||null;
    const matches=d.products.filter(x=>x.audience==='store'&&sameSpec(x,p));return matches.length===1?matches[0]:null;
  }
  function syncCatalogProducts(d){
    const next=[...d.products],ids=new Set(next.map(p=>p.id));let serial=1,added=0;
    const newId=()=>{while(ids.has('catalog-product-'+serial))serial++;const value='catalog-product-'+serial++;ids.add(value);return value;};
    for(const s of d.shells)for(const g of d.grades)for(const pack of d.packages){
      const spec={shell:s.id,grade:g.id,package:pack.id};if(d.packaging[[s.id,g.id,pack.id].join('/')]?.enabled===false)continue;
      let store=next.find(p=>p.audience==='store'&&sameSpec(p,spec));
      if(!store){store={...spec,id:newId(),name:[s.name,g.name,pack.name].join(' '),audience:'store',price:'',auto:true,enabled:true,catalog:true};next.push(store);added++;}
      if(!next.some(p=>p.audience==='consumer'&&sameSpec(p,spec))){next.push({...spec,id:newId(),name:store.name,audience:'consumer',price:'',auto:false,enabled:false,catalog:true,storeProduct:store.id});added++;}
    }
    if(next.length>2000)fail('WORKSPACE_CATALOG_LIMIT');d.products=next;return added;
  }
  function previewConsumerMarkup(d,ids,kind,value){
    if(!['percent','amount'].includes(kind)||!num(value,kind==='percent'?10000:999999999999))fail('WORKSPACE_MARKUP_INVALID');
    const changes=[],skipped=[];
    for(const id of new Set(ids)){
      const p=d.products.find(x=>x.id===id);if(!p||p.audience!=='consumer')fail('WORKSPACE_PRODUCT_INVALID');
      const base=storeProduct(d,p),price=base?productPrice(d,base):null;
      if(!base||typeof price!=='number'){skipped.push({id,name:p.name,reason:!base?'사업장 상품을 선택해 주세요':price==='미판매'?'사업장 미판매':price==='협의'?'사업장 가격 협의':'사업장 판매가 미입력'});continue;}
      const after=Math.round(kind==='percent'?price*(1+Number(value)/100):price+Number(value));if(!Number.isSafeInteger(after)||after>999999999999)fail('WORKSPACE_MARKUP_INVALID');
      changes.push({id,name:p.name,base:price,before:productPrice(d,p),after,storeProduct:base.id});
    }
    return {changes,skipped,kind,value};
  }
  function applyConsumerMarkup(d,ids,kind,value){
    const preview=previewConsumerMarkup(d,ids,kind,value);
    for(const c of preview.changes){const p=d.products.find(p=>p.id===c.id);p.storeProduct=c.storeProduct;p.markup={kind,value};p.auto=false;p.price=String(c.after);}
    return preview;
  }
  function deliveryBounds(d,rule){
    const eggs=d.packages.find(p=>p.id===rule.package)?.eggs;if(!eggs)fail('WORKSPACE_DELIVERY_INVALID');
    return {min:rule.unit==='egg'?Math.ceil(rule.min/eggs):rule.min,max:rule.max===null?null:rule.unit==='egg'?Math.floor(rule.max/eggs):rule.max,eggs};
  }
  function deliveryFor(d,{shell,grade,package:pack,quantity,unit='pack'}){
    if(!d.shells.some(s=>s.id===shell)||!d.grades.some(g=>g.id===grade)||!Number.isSafeInteger(quantity)||quantity<1||!['pack','egg'].includes(unit))fail('WORKSPACE_DELIVERY_INVALID');
    const eggs=d.packages.find(p=>p.id===pack)?.eggs;if(!eggs)fail('WORKSPACE_DELIVERY_INVALID');const packs=unit==='egg'?quantity/eggs:quantity;
    if(!Number.isSafeInteger(packs)||packs<1)fail('WORKSPACE_DELIVERY_WHOLE_PACK');
    if(d.packaging[[shell,grade,pack].join('/')]?.enabled===false)return {status:'unavailable',packs,eggs:packs*eggs};
    const rule=(d.deliveryRules||[]).find(r=>{const b=deliveryBounds(d,r);return r.package===pack&&(r.shell===null||r.shell===shell)&&(r.grade===null||r.grade===grade)&&packs>=b.min&&(b.max===null||packs<=b.max);});
    if(!rule)return {status:'unconfigured',packs,eggs:packs*eggs};
    const carrier=d.carriers.find(c=>c.id===rule.carrier);return {status:'matched',ruleId:rule.id,carrier,packs,eggs:packs*eggs,fee:rule.fee!==''?Number(rule.fee):carrier.base!==''?Number(carrier.base):null,feeSource:rule.fee!==''?'rule':'carrier'};
  }
  function productPrice(d,p,rowId){
    if(d.packaging[[p.shell,p.grade,p.package].join('/')]?.enabled===false)return '미판매';
    if(p.audience==='consumer'&&p.markup){const base=storeProduct(d,p),amount=base?productPrice(d,base,rowId):null;return typeof amount==='number'?Math.round(p.markup.kind==='percent'?amount*(1+Number(p.markup.value)/100):amount+Number(p.markup.value)):amount;}
    if(!p.auto)return p.price===''?null:Number(p.price);
    const row=d.costs[p.shell]?.find(r=>r.id===rowId)||d.costs[p.shell]?.[0],pack=d.packages.find(x=>x.id===p.package);
    if(!row||!pack)return null;const costs=calculated(d,p.shell,row.id,p.grade);
    const rule=d.packaging[[p.shell,p.grade,p.package].join('/')],explicit=rule?.fees?.[row.id]??rule?.fee;
    if(pack.eggs===d.basePackSize&&(explicit===undefined||explicit===''))return costs.packed;
    if(typeof costs.raw!=='number')return costs.raw;
    const fee=explicit!==undefined&&explicit!==''?Number(explicit):pack.eggs===d.basePackSize?row.prices[p.grade].packing===''?null:Number(row.prices[p.grade].packing):null;
    return fee==null?null:Math.round(costs.raw*pack.eggs/d.basePackSize)+fee;
  }
  function movePackaging(d,from,to,mode='move'){
    if(!['move','copy','swap'].includes(mode))fail('WORKSPACE_PACKAGE_INVALID');
    for(const target of [from,to])if(!d.shells.some(s=>s.id===target.shell)||!d.grades.some(g=>g.id===target.grade))fail('WORKSPACE_PACKAGE_INVALID');
    if(!d.packages.some(p=>p.id===from.pack))fail('WORKSPACE_PACKAGE_INVALID');
    const sourceKey=[from.shell,from.grade,from.pack].join('/'),targetKey=[to.shell,to.grade,from.pack].join('/');if(sourceKey===targetKey)return;
    const source=d.packaging[sourceKey]||{fee:'',fees:{},carriers:[]},target=d.packaging[targetKey]||{fee:'',fees:{},carriers:[]};
    const hasData=r=>r.fee!==''||Object.values(r.fees||{}).some(v=>v!=='')||r.carriers.length>0;
    if(mode!=='swap'&&hasData(target))fail('WORKSPACE_TRANSFER_CONFLICT');
    const remap=(rule,fromShell,toShell)=>{const next=clone(rule);next.fees={};for(const [rowId,fee] of Object.entries(rule.fees||{})){const origin=d.costs[fromShell].find(r=>r.id===rowId),destination=d.costs[toShell].find(r=>r.min===origin?.min&&r.max===origin?.max);if(!destination)fail('WORKSPACE_TRANSFER_RANGE');next.fees[destination.id]=fee;}delete next.enabled;return next;};
    const nextTarget=remap(source,from.shell,to.shell),nextSource=mode==='swap'?remap(target,to.shell,from.shell):{...clone(source),enabled:false};
    d.packaging[targetKey]=nextTarget;if(mode!=='copy')d.packaging[sourceKey]=nextSource;
  }
  function rectangle(grades,packages,a,b){
    const ar=grades.indexOf(a.grade),br=grades.indexOf(b.grade),ac=packages.indexOf(a.pack),bc=packages.indexOf(b.pack);if([ar,br,ac,bc].some(n=>n<0))return [];
    const keys=[];for(let r=Math.min(ar,br);r<=Math.max(ar,br);r++)for(let c=Math.min(ac,bc);c<=Math.max(ac,bc);c++)keys.push(grades[r]+'/'+packages[c]);return keys;
  }
  // The market publication is a complete, customer-readable slice of the
  // applied table. Drafts, raw costs, addresses and custom product names
  // never enter it. Competing products for the same spec have no single rate.
  function marketSnapshot(d){
    const shells=d.shells.filter(s=>s.number>=1&&s.number<=4).map(s=>({id:String(s.number),name:s.number+'번'}));
    const grades=d.grades.map(g=>({id:g.id,name:g.name}));
    const pack=d.packages.find(p=>p.eggs===30),values={};
    if(pack)for(const shell of shells){
      const id=d.shells.find(s=>String(s.number)===shell.id).id;
      for(const grade of grades){
        const products=d.products.filter(p=>p.audience==='store'&&p.shell===id&&p.grade===grade.id&&p.package===pack.id);
        // Old tables without materialized catalog products use the same
        // automatic business price that syncCatalogProducts shows on opening.
        const available=products.filter(p=>p.enabled);
        if(products.length===0)available.push({shell:id,grade:grade.id,package:pack.id,audience:'store',auto:true});
        if(available.length!==1)continue;
        const price=productPrice(d,available[0]);
        if(Number.isFinite(price)&&price>=0)values[shell.id+'/'+grade.id]=price;
      }
    }
    return {shells,grades,values};
  }
  const marketDay=instant=>new Date(Date.parse(instant)+9*3600000).toISOString().slice(0,10);
  const shiftDay=(date,offset)=>new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
  function marketRange(query,now){
    const today=marketDay(now),to=query.get('to')||today;
    if(!day(to))fail('MARKET_FILTER_INVALID');
    const from=query.get('from')||shiftDay(to,-29);
    for(const key of query.keys())if(!['from','to','shell','grade'].includes(key)||query.getAll(key).length!==1)fail('MARKET_FILTER_INVALID');
    if(!day(from)||from>to||from>today||(Date.parse(to)-Date.parse(from))/86400000>365)fail('MARKET_FILTER_INVALID');
    const shell=query.get('shell')||'',grade=query.get('grade')||'';
    if(shell&&!/^[1-4]$/.test(shell)||grade&&!token(grade))fail('MARKET_FILTER_INVALID');
    return {today,from,to:to>today?today:to,shell,grade};
  }
  function marketSelection(range,entries){
    const shells=new Map(),grades=new Map();
    // The list of selectable specifications follows this period's tables, including
    // the one in force on its first day. Older retired labels stay in history.
    const carried=entries.filter(entry=>marketDay(entry.effectiveAt)<range.from).slice(-1);
    const visible=entries.filter(entry=>marketDay(entry.effectiveAt)>=range.from);
    for(const {market} of [...carried,...visible]){
      for(const s of market.shells)shells.set(s.id,s);
      for(const g of market.grades)grades.set(g.id,g);
    }
    const shell=range.shell||(shells.has('3')?'3':shells.keys().next().value)||'3';
    const grade=range.grade||(grades.has('xl')?'xl':grades.keys().next().value)||'xl';
    return {shells:[...shells.values()].sort((a,b)=>Number(a.id)-Number(b.id)),grades:[...grades.values()],shell,grade};
  }
  function marketSeries(range,entries,asOf,firstDate){
    const {today,from,to}=range,selection=marketSelection(range,entries),points=[];
    const daily=new Map();
    for(const entry of entries)daily.set(marketDay(entry.effectiveAt),entry);
    const closes=[...daily.entries()];
    let cursor=0,value=null,activeSince=null;
    for(let date=from;date<=to;date=shiftDay(date,1)){
      while(cursor<closes.length&&closes[cursor][0]<=date){
        const [closed,entry]=closes[cursor++],next=entry.market.values[selection.shell+'/'+selection.grade]??null;
        if(next!==value){activeSince=entry.runStart||closed;value=next;}
      }
      points.push({date,price:value});
    }
    const priced=points.filter(p=>p.price!==null).map(p=>p.price);
    function extreme(price){
      const periods=[];let run=null;
      for(const p of points){
        if(p.price!==price){run=null;continue;}
        if(!run){run={start:p.date,end:p.date};periods.push(run);}
        run.end=p.date===today?null:p.date;
        if(p.date===today)run.start=activeSince;
      }
      return {price,periods};
    }
    return {asOf,today,firstDate,from,to,...selection,unit:'원/30구',points,
      low:priced.length?extreme(Math.min(...priced)):null,high:priced.length?extreme(Math.max(...priced)):null};
  }
  return {marketSnapshot,marketDay,marketRange,marketSelection,marketSeries,clone,initial,normalize,calculated,bulk,pg,bound,remove,order,rectangle,productPrice,movePackaging,standard,day,money,syncCatalogProducts,storeProduct,previewConsumerMarkup,applyConsumerMarkup,deliveryBounds,deliveryFor};
}
