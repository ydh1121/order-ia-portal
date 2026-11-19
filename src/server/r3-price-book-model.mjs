/** Dated personal price books. Commercial approval remains in the existing policy workflow. */
export function createPriceBookModel(matrixModel) {
  const copy=v=>JSON.parse(JSON.stringify(v));
  const token=v=>typeof v==='string'&&!['__proto__','constructor','prototype'].includes(v)&&/^[A-Za-z0-9_.:-]{1,80}$/.test(v);
  const text=(v,n=80)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=n;
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const band=r=>r.min+':'+(r.max??'*');
  const shells=['1','2','3','4','unspecified'];
  const standard=[['king','왕란'],['xl','특란'],['large','대란'],['medium','중란'],['small','소란']].map(([id,name])=>({id,name}));
  const cleanMatrix=m=>{
    if(matrixModel.errors(m).length||new Set(m?.grades?.map(g=>g.name)).size!==m?.grades?.length)throw new Error('PRICE_MATRIX_INVALID');
    return {schema:1,grades:m.grades.map(g=>({id:g.id,name:g.name})),rows:m.rows.map(r=>({min:r.min,max:r.max,cells:r.cells.map(matrixModel.normalize)}))};
  };
  function normalize(input) {
    if(!input||input.schema!==1||!Array.isArray(input.versions)||!input.versions.length||input.versions.length>32)throw new Error('PRICE_BOOK_INVALID');
    const versionIds=new Set();
    const versions=input.versions.map(v=>{
      if(!v||!token(v.id)||versionIds.has(v.id)||!date(v.date)||!text(v.name)||!Array.isArray(v.shells)||!v.shells.length||v.shells.length>5)throw new Error('PRICE_BOOK_INVALID');
      versionIds.add(v.id);const shellKeys=new Set();
      const packages=(v.packages||[]).map(p=>{
        if(!p||!token(p.id)||!text(p.name,60)||!(p.parentId==null||token(p.parentId))||!(p.eggs===null||Number.isSafeInteger(p.eggs)&&p.eggs>0&&p.eggs<=72000)||!(p.trays===null||Number.isSafeInteger(p.trays)&&p.trays>0&&p.trays<=2400)||!Array.isArray(p.rules)||p.rules.length>100)throw new Error('PRICE_PACK_INVALID');
        let previous=0;
        const rules=p.rules.map(r=>{
          const fee=matrixModel.normalize(r.fee);
          if(!Number.isSafeInteger(r.min)||r.min<1||r.min>1e9||!(r.max===null||Number.isSafeInteger(r.max)&&r.max>=r.min&&r.max<=1e9)||r.min<=previous||!(fee===''||typeof fee==='string'&&/^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(fee)))throw new Error('PRICE_PACK_INVALID');
          previous=r.max===null?Infinity:r.max;return {min:r.min,max:r.max,fee};
        });
        return {id:p.id,name:p.name,parentId:p.parentId||null,eggs:p.eggs,trays:p.trays,rules};
      });
      if(packages.length>16||new Set(packages.map(p=>p.id)).size!==packages.length)throw new Error('PRICE_PACK_INVALID');
      const packIds=new Set(packages.map(p=>p.id));
      for(const p of packages){const seen=new Set([p.id]);let parent=p.parentId;while(parent){if(!packIds.has(parent)||seen.has(parent)||seen.size>8)throw new Error('PRICE_PACK_CYCLE');seen.add(parent);parent=packages.find(x=>x.id===parent).parentId;}}
      const nodes=v.shells.map(s=>{
        if(!s||!shells.includes(s.key)||shellKeys.has(s.key)||!text(s.label,40))throw new Error('PRICE_BOOK_INVALID');shellKeys.add(s.key);
        const matrix=cleanMatrix(s.matrix), keys=new Set(matrix.rows.map(band));
        const rowOrder=Array.isArray(s.rowOrder)?s.rowOrder.filter(k=>typeof k==='string'&&keys.has(k)):[];
        if(new Set(rowOrder).size!==rowOrder.length)throw new Error('PRICE_BOOK_INVALID');
        const packMatrices={};for(const [id,m] of Object.entries(s.packMatrices||{})){if(!packIds.has(id))throw new Error('PRICE_PACK_INVALID');packMatrices[id]=cleanMatrix(m);}
        const packRowOrders={};for(const [id,order] of Object.entries(s.packRowOrders||{})){if(!packMatrices[id]||!Array.isArray(order))throw new Error('PRICE_PACK_INVALID');const valid=new Set(packMatrices[id].rows.map(band));packRowOrders[id]=order.filter(key=>typeof key==='string'&&valid.has(key));if(new Set(packRowOrders[id]).size!==packRowOrders[id].length)throw new Error('PRICE_PACK_INVALID');}
        const generated={};for(const [id,values] of Object.entries(s.generated||{})){if(id!=='base'&&!packIds.has(id))throw new Error('PRICE_PACK_INVALID');generated[id]={};for(const [key,value] of Object.entries(values||{})){if(key.length>160||typeof value!=='string'||!/^\+(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(value))throw new Error('PRICE_PACK_INVALID');generated[id][key]=value;}}
        if(!(s.basePackSize==null||Number.isSafeInteger(s.basePackSize)&&s.basePackSize>=1&&s.basePackSize<=360))throw new Error('PRICE_PACK_INVALID');
        return {key:s.key,label:s.label,basePackSize:s.basePackSize??null,matrix,rowOrder,packMatrices,packRowOrders,generated};
      });
      return {id:v.id,date:v.date,name:v.name,sourceVersion:v.sourceVersion&&token(v.sourceVersion)?v.sourceVersion:null,shells:nodes,packages};
    });
    const selected=versions.find(v=>v.id===input.activeVersion);if(!selected||!selected.shells.some(s=>s.key===input.activeShell)||!(input.activePackage==='base'||selected.packages.some(p=>p.id===input.activePackage)))throw new Error('PRICE_BOOK_SELECTION');
    return {schema:1,activeVersion:selected.id,activeShell:input.activeShell,activePackage:input.activePackage,versions};
  }
  const selected=book=>{const version=book.versions.find(v=>v.id===book.activeVersion),shell=version?.shells.find(s=>s.key===book.activeShell);return {version,shell,matrix:book.activePackage==='base'?shell?.matrix:shell?.packMatrices[book.activePackage],rowOrder:book.activePackage==='base'?shell?.rowOrder:shell?.packRowOrders?.[book.activePackage]||[]};};
  function canImportSelected(book){
    if(book.activePackage==='base')return true;
    const {version,shell}=selected(book),pack=version?.packages.find(p=>p.id===book.activePackage);
    return Boolean(shell?.basePackSize!=null&&pack?.eggs!=null&&pack?.trays!=null&&pack.eggs===shell.basePackSize*pack.trays);
  }
  function fromDraft(d,today) {
    if(d.priceBook)return normalize(d.priceBook);
    const matrix=cleanMatrix(d.matrix||{schema:1,grades:standard,rows:matrixModel.emptyRows(standard.length)});
    const match=(d.name||'').match(/(\d{4})[.\/-](\d{2})[.\/-](\d{2})/), guessed=match?match.slice(1).join('-'):today;
    const key=shells.includes(d.shell)?d.shell:'unspecified';
    const empty=()=>({schema:1,grades:copy(standard),rows:matrixModel.emptyRows(standard.length)});
    const nodes=shells.filter(k=>k!=='unspecified'||key==='unspecified').map(k=>({key:k,label:k==='unspecified'?'난각 미지정':k+'번란',basePackSize:d.packSize??null,matrix:k===key?matrix:empty(),rowOrder:[],packMatrices:{},packRowOrders:{},generated:{}}));
    return {schema:1,activeVersion:'initial',activeShell:key,activePackage:'base',versions:[{id:'initial',date:date(guessed)?guessed:today,name:d.name||'계란 단가표',sourceVersion:null,shells:nodes,packages:[]}]};
  }
  function capture(book,matrix){
    const {shell}=selected(book);const clean=copy(matrix);
    const generated=shell.generated[book.activePackage]||{};
    for(const [i,g] of clean.grades.entries())for(const row of clean.rows){const k=g.id+'/'+band(row);if(generated[k]&&matrixModel.normalize(row.cells[i*2+1])!==generated[k])delete generated[k];}
    if(book.activePackage==='base')shell.matrix=clean;else shell.packMatrices[book.activePackage]=clean;
    return book;
  }
  function select(book,versionId,shellKey,packageId='base'){
    const v=book.versions.find(v=>v.id===versionId),s=v?.shells.find(s=>s.key===shellKey);if(!s||!(packageId==='base'||v.packages.some(p=>p.id===packageId)))throw new Error('PRICE_BOOK_SELECTION');
    if(packageId!=='base'&&!s.packMatrices[packageId]){const p=v.packages.find(p=>p.id===packageId),sameUnit=s.basePackSize!=null&&p.eggs!=null&&p.trays!=null&&p.eggs===s.basePackSize*p.trays;s.packMatrices[packageId]=copy(s.matrix);for(const r of s.packMatrices[packageId].rows)r.cells=r.cells.map((x,i)=>sameUnit&&i%2===0?x:'');}
    book.activeVersion=versionId;book.activeShell=shellKey;book.activePackage=packageId;return selected(book);
  }
  function cloneVersion(book,id,day,name,empty=false){
    if(!token(id)||book.versions.some(v=>v.id===id)||!date(day)||!text(name)||book.versions.length>=32)throw new Error('PRICE_BOOK_INVALID');
    const old=selected(book).version,v=copy(old);v.id=id;v.date=day;v.name=name;v.sourceVersion=old.id;
    if(empty)for(const s of v.shells){for(const m of [s.matrix,...Object.values(s.packMatrices)])for(const r of m.rows)r.cells=r.cells.map(()=> '');s.generated={};}
    book.versions.unshift(v);book.activeVersion=id;return v;
  }
  function move(book,source,target,placement='before'){
    const {version,shell}=selected(book);
    if(source.kind!==target.kind)throw new Error('PRICE_TREE_LEVEL');
    let list,from,to;
    if(source.kind==='version'){list=book.versions;from=list.findIndex(v=>v.id===source.id);to=list.findIndex(v=>v.id===target.id);}
    else if(source.kind==='shell'){list=version.shells;from=list.findIndex(s=>s.key===source.id);to=list.findIndex(s=>s.key===target.id);}
    else if(source.kind==='grade'){
      const m=selected(book).matrix;from=m.grades.findIndex(g=>g.id===source.id);to=m.grades.findIndex(g=>g.id===target.id);if(from<0||to<0)throw new Error('PRICE_TREE_LEVEL');
      if(from===to)return;const [grade]=m.grades.splice(from,1);to=m.grades.findIndex(g=>g.id===target.id)+(placement==='after'?1:0);m.grades.splice(to,0,grade);
      for(const r of m.rows){const pair=r.cells.splice(from*2,2);r.cells.splice(to*2,0,...pair);}return;
    }else if(source.kind==='range'){
      list=[...new Set([...selected(book).rowOrder,...selected(book).matrix.rows.map(band)])];from=list.indexOf(source.id);to=list.indexOf(target.id);
    }else if(source.kind==='package'){
      list=version.packages;from=list.findIndex(p=>p.id===source.id);to=list.findIndex(p=>p.id===target.id);
      if(placement==='inside'){
        if(from<0||to<0||from===to)throw new Error('PRICE_TREE_LEVEL');const prior=list[from].parentId;list[from].parentId=list[to].id;
        try{normalize(book);}catch(e){list[from].parentId=prior;throw e;}return;
      }
      if(from>=0&&to>=0){const before=copy(list),parent=list[to].parentId;let cursor=parent;const seen=new Set([list[from].id]);while(cursor){if(seen.has(cursor))throw new Error('PRICE_PACK_CYCLE');seen.add(cursor);cursor=list.find(p=>p.id===cursor)?.parentId;}list[from].parentId=parent;try{normalize(book);}catch(e){version.packages=before;throw e;}}
    }else throw new Error('PRICE_TREE_LEVEL');
    if(from<0||to<0)throw new Error('PRICE_TREE_LEVEL');if(from===to)return;
    const [item]=list.splice(from,1);const index=list.findIndex(x=>typeof x==='string'?x===target.id:source.kind==='shell'?x.key===target.id:x.id===target.id)+(placement==='after'?1:0);list.splice(index,0,item);
    if(source.kind==='range'){if(book.activePackage==='base')shell.rowOrder=list;else{shell.packRowOrders||={};shell.packRowOrders[book.activePackage]=list;}}
  }
  function packagingPreview(book,packId,{overwrite=false}={}){
    const {version,shell,matrix}=selected(book),p=version.packages.find(x=>x.id===packId);if(!p)throw new Error('PRICE_PACK_INVALID');
    const changes=[],kept=[],generated=shell.generated[book.activePackage]||{};
    matrix.rows.forEach((row,r)=>matrix.grades.forEach((g,i)=>{
      const key=g.id+'/'+band(row),before=matrixModel.normalize(row.cells[i*2+1]),raw=matrixModel.normalize(row.cells[i*2]);
      const rule=p.rules.find(x=>x.min<=row.min&&(x.max===null||row.max!==null&&x.max>=row.max));
      if(!rule||rule.fee===''||matrixModel.shifted(raw,'0')===null)return;
      const after='+'+matrixModel.normalize(rule.fee);
      if(before!==''&&before!==generated[key]&&!overwrite){kept.push({r,c:i*2+1,key,before});return;}
      if(before!==after)changes.push({r,c:i*2+1,key,before,after,price:matrixModel.shifted(raw,rule.fee),grade:g.name,min:row.min,max:row.max});
    }));return {changes,kept,packId,source:JSON.stringify([book.activeVersion,book.activeShell,book.activePackage,matrix,p])};
  }
  function applyPackaging(book,proposal){
    const {version,shell,matrix}=selected(book);
    if(proposal.source!==JSON.stringify([book.activeVersion,book.activeShell,book.activePackage,matrix,version.packages.find(p=>p.id===proposal.packId)]))throw new Error('PRICE_PREVIEW_STALE');
    for(const p of proposal.changes){if(matrixModel.normalize(matrix.rows[p.r]?.cells[p.c])!==p.before)throw new Error('PRICE_PREVIEW_STALE');}
    shell.generated[book.activePackage]||={};for(const p of proposal.changes){matrix.rows[p.r].cells[p.c]=p.after;shell.generated[book.activePackage][p.key]=p.after;}
  }
  return {copy,normalize,fromDraft,selected,canImportSelected,capture,select,cloneVersion,move,packagingPreview,applyPackaging,band,standard,cleanMatrix};
}
