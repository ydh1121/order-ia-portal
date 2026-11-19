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
    for(const [key,max] of [['shells',32],['grades',32],['packages',80],['carriers',64],['products',500]]){
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
    for(const p of d.products)if(!shells.has(p.shell)||!grades.has(p.grade)||!packs.has(p.package)||!['store','consumer'].includes(p.audience)||!money(p.price)||typeof p.enabled!=='boolean'||!(p.auto==null||typeof p.auto==='boolean'))fail('WORKSPACE_PRODUCT_INVALID');
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
  }
  const order=d=>{d.shells.sort((a,b)=>a.number===0?1:b.number===0?-1:b.number-a.number);d.grades.sort((a,b)=>b.weight-a.weight);return d;};
  function productPrice(d,p,rowId){
    if(d.packaging[[p.shell,p.grade,p.package].join('/')]?.enabled===false)return '미판매';
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
  return {clone,initial,normalize,calculated,bulk,pg,bound,remove,order,rectangle,productPrice,movePackaging,standard,day,money};
}
