export const matrixMarkup = `<div class="matrix-controls"><label>편집할 규격<select data-mx="grade"></select></label><button type="button" data-mx="view" aria-pressed="false">전체표 보기</button><button type="button" data-mx="add">구간 추가</button><button type="button" data-mx="copy">구간 복제</button><button type="button" data-mx="remove">구간 삭제</button><button type="button" data-mx="undo" disabled>실행 취소</button></div>
<details class="mx-row-editor" data-mx="row-detail"><summary>구간별 상세 편집</summary><label>주문량 구간<select data-mx="row-select"></select></label><div class="fields" data-mx="row-fields"></div></details>
<details><summary>표에 표시할 규격</summary><div data-mx="columns" class="matrix-controls"></div></details>
<div class="matrix-scroll" data-mx="scroll" tabindex="0" aria-label="단가표 가로 이동"><table class="price-matrix"><caption class="sr-only">수량·규격별 원란과 포장 단가 (원)</caption><thead></thead><tbody></tbody></table></div>
<datalist id="price-cell-states"><option value="협의"></option><option value="미판매"></option></datalist>
<p class="matrix-help">단위는 원입니다. 포장 단가에 +금액을 입력하면 원란 단가에 더합니다. 빈 셀은 미입력입니다.</p>
<details><summary>선택 범위 일괄 수정</summary><div class="matrix-controls"><button type="button" data-mx="start">범위 시작 셀</button><button type="button" data-mx="end">범위 끝 셀</button><span data-mx="range"></span><label>변경 방식<select data-mx="method"><option value="adjust">정액 변경 (원)</option><option value="percent">정률 변경 (%)</option><option value="fee">원란에 포장비 가산</option></select></label><label>변경값<input data-mx="delta" inputmode="decimal"></label><button data-mx="preview" type="button">변경 미리보기</button></div><div data-mx="proposal" hidden><ul></ul><button data-mx="apply" type="button">표에 적용</button></div></details>
<output data-mx="status" aria-live="polite"></output>`;
const baseMatrixCss = `.mx-row-editor{display:none}.price-matrix td{position:relative}.price-matrix td:has([aria-invalid=true])::after{content:"!";position:absolute;top:.05rem;left:.12rem;pointer-events:none;color:#992225;font-weight:bold;font-size:.75rem}@media(max-width:680px){.mx-row-editor{display:block}.mx-row-editor .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))}.mx-row-editor input[aria-invalid=true]{border-color:#b52f30}}.matrix-controls{display:flex;align-items:end;gap:.5rem;flex-wrap:wrap}.matrix-controls label{flex:0 1 auto}.matrix-controls label:has(input[type=checkbox]){display:inline-flex;align-items:center;gap:.4rem;min-height:44px}.matrix-controls input[type=checkbox]{width:1rem;min-height:1rem}.matrix-scroll{overflow:auto;margin-block:.75rem;max-width:100%;scrollbar-width:none}.matrix-scroll::-webkit-scrollbar{display:none}.price-matrix{border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;min-width:100%}.price-matrix th,.price-matrix td{border:solid #d8dee8;border-width:0 1px 1px 0;padding:0}.price-matrix th{background:#f1f4f8;white-space:nowrap;text-align:center;padding:.45rem .65rem;font-size:.875rem}.price-matrix td input{display:block;width:100%;min-width:7.3rem;text-align:right;font-size:1rem;border:0;border-radius:0;white-space:nowrap;background:transparent}.price-matrix td.mx-bound input{min-width:4.6rem}.price-matrix td[data-changed=true]{background:#eef3ff}.price-matrix td[data-range=true]{box-shadow:inset 0 0 0 1px #446ac2}.price-matrix td:has([aria-invalid=true]){box-shadow:inset 0 0 0 2px #b52f30;background:#fff0ee}.price-matrix input[aria-invalid=true]{color:#8c2122}.price-matrix td input:focus-visible{outline:-webkit-focus-ring-color auto 2px;outline-offset:-3px}.matrix-help{font-size:.85rem;color:#445268}.sr-only{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;white-space:nowrap}.matrix-scroll td[hidden],.matrix-scroll th[hidden]{display:none!important}@media(max-width:680px){.price-matrix td input{min-width:5.5rem}.price-matrix td.mx-bound input{min-width:3rem}.matrix-scroll:not(.all-grades) .price-matrix{width:100%;table-layout:fixed}.matrix-scroll:not(.all-grades) th{padding:.4rem .1rem;font-size:.8rem}.matrix-scroll:not(.all-grades) td input{width:100%;min-width:0;padding-inline:.2rem}.matrix-scroll:not(.all-grades) td:not(.mx-bound) input{min-width:5rem}.matrix-scroll:not(.all-grades) .price-matrix{min-width:17rem}}@media(prefers-reduced-motion:no-preference){.price-matrix input.mx-error{animation:price-shake .2s ease-out}@keyframes price-shake{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}}`;
export const matrixLayoutCss = `
.matrix-scroll{max-height:min(63vh,43rem);--bound-width:5.2rem;isolation:isolate}
.price-matrix thead{position:sticky;top:0;z-index:4}
.price-matrix .mx-bound,.price-matrix th.mx-fixed{position:sticky;background:#f1f4f8;z-index:1;left:0}
.price-matrix .mx-bound,.price-matrix .mx-fixed:not([colspan="2"]){min-width:var(--bound-width);width:var(--bound-width)}
.price-matrix .mx-bound:nth-child(2),.price-matrix .mx-fixed:nth-child(2){left:var(--bound-width)}
.mx-row-editor small{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}
@media(max-width:680px){.matrix-scroll{--bound-width:3.4rem}}
`;
export const matrixCss=baseMatrixCss+matrixLayoutCss;
export function mountPriceMatrix(root, model) {
  const find = name => root.querySelector('[data-mx="'+name+'"]');
  const head=root.querySelector('thead'), body=root.querySelector('tbody');
  let available=[],grades=[], rows=[], base=null, point=[0,2], range=null, endpoint='', pending=[], all=false, readOnly=false;
  const status=text=>{find('status').textContent=text;};
  const names=()=>['시작 판수','끝 판수',...grades.flatMap(g=>[g.name+' 원란',g.name+' 포장'])];
  const cells=row=>[row.min===null?'':String(row.min),row.max===null?'':String(row.max),...row.cells];
  const undo=[];
  function checkpoint(){
    if(undo.length>=40)undo.shift();
    undo.push({rows:rows.map(row=>row.slice()),grades:grades.map(g=>({...g}))});
    find('undo').disabled=false;
  }
  function notify(){root.dispatchEvent(new Event('input',{bubbles:true}));}
  find('undo').onclick=()=>{
    if(readOnly||!undo.length)return;
    const prior=undo.pop();rows=prior.rows;grades=prior.grades;range=null;cancelProposal();render();
    find('undo').disabled=!undo.length;notify();status('이전 입력으로 되돌렸습니다.');
  };
  const display=text=>typeof text==='string'?text.replace(/^(\+?)(\d+)(\.\d+)?$/,(_,prefix,whole,fraction='')=>prefix+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+fraction):text;
  const numeric=s=>s===''?null:/^\d+$/.test(s)?Number(s):s;
  const cell=(r,c)=>body.querySelector('input[data-r="'+r+'"][data-c="'+c+'"]');
  const value=()=>({schema:1,grades:grades.map(g=>({...g})),rows:rows.map(row=>({min:numeric(row[0]),max:numeric(row[1]),cells:row.slice(2).map(model.normalize)}))});
  const cancelProposal=()=>{pending=[];find('proposal').hidden=true;};
  function visibleColumns() {
    const grade=find('grade').value, selected=grades.findIndex(g=>g.id===grade);
    const narrow=(root.clientWidth?root.clientWidth<=648:matchMedia('(max-width:680px)').matches)&&!all;
    for(const item of root.querySelectorAll('[data-grade-col]'))item.hidden=narrow&&Number(item.dataset.gradeCol)!==selected;
    find('scroll').classList.toggle('all-grades',all);
    find('view').setAttribute('aria-pressed',String(all));find('view').textContent=all?'선택 규격 보기':'전체표 보기';
  }
  function update(scroll=false) {
    const data=value(),issues=model.errors(data), indexed=new Map(issues.map(e=>[e.row+'/'+e.col,e.message]));
    for (const input of body.querySelectorAll('input')) {
      const r=Number(input.dataset.r),c=Number(input.dataset.c), message=indexed.get(r+'/'+c);
      const prior=c<2 ? base?.rows[r]?.[c===0?'min':'max'] : base?.rows[r]?.cells[base.grades.findIndex(g=>g.id===grades[Math.floor((c-2)/2)]?.id)*2+(c-2)%2];
      input.parentElement.dataset.changed=String(base!==null&&String(model.normalize(prior??''))!==String(model.normalize(input.value)));
      input.setAttribute('aria-invalid',String(Boolean(message)));
      const error=input.nextElementSibling;error.textContent=message||'';input.title=message||(input.parentElement.dataset.changed==='true'?'이전 '+(prior??'미입력')+' · 현재 '+(input.value||'미입력'):'');
      if(input.title)input.setAttribute('aria-description',input.title);else input.removeAttribute('aria-description');
      input.parentElement.dataset.range=String(Boolean(range && r>=range[0]&&r<=range[2]&&c>=range[1]&&c<=range[3]));
    }
    const detail=find('row-detail');
    if(detail.open){const r=Number(find('row-select').value);for(const input of find('row-fields').querySelectorAll('input')){
      const c=Number(input.dataset.detailCol),message=indexed.get(r+'/'+c);
      if(rows[r]&&input.value!==rows[r][c])input.value=rows[r][c];input.setAttribute('aria-invalid',String(Boolean(message)));input.nextElementSibling.textContent=message||'';
    }}
    if(scroll&&issues.length){
      const first=issues[0],input=cell(first.row,first.col);
      if(input){if(first.col>=2)find('grade').value=grades[Math.floor((first.col-2)/2)].id;visibleColumns();input.focus();input.classList.remove('mx-error');void input.offsetWidth;input.classList.add('mx-error');}
      status('');
    }
    return issues;
  }
  function rowDetail(){
    const r=Number(find('row-select').value),editable=rows[r]||[],labels=names(),fieldList=find('row-fields');
    fieldList.replaceChildren(...editable.map((v,c)=>{
      const wrapper=document.createElement('label'),input=document.createElement('input'),error=document.createElement('small');
      wrapper.append(document.createTextNode(labels[c]+(c<2?' (판)':' (원)')),input,error);input.value=v;input.readOnly=readOnly;
      if(c<2)input.inputMode='numeric';else input.setAttribute('list','price-cell-states');
      input.dataset.detailCol=String(c);error.id='mx-row-issue-'+c;input.setAttribute('aria-describedby',error.id);
      input.oninput=()=>{
        checkpoint();editable[c]=input.value;cell(r,c).value=input.value;point=[r,c];cancelProposal();update();
      };return wrapper;
    }));update();
  }
  find('row-select').onchange=rowDetail;
  find('row-detail').ontoggle=()=>{if(find('row-detail').open)rowDetail();};
  function rangeFrom(a,b){return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];}
  function showRange(){find('range').textContent=range?(range[0]+1)+'행 '+names()[range[1]]+' ~ '+(range[2]+1)+'행 '+names()[range[3]]:'';}
  function select(r,c,extend=false){
    if(endpoint==='start'){range=[r,c,r,c];endpoint='';}
    else if(endpoint==='end'||extend){range=rangeFrom(range?range.slice(0,2):point,[r,c]);endpoint='';}
    point=[r,c];showRange();update();
  }
  function render(){
    const labels=names(),group=document.createElement('tr'),columns=document.createElement('tr');
    function header(where,title,span=1,index=null){const th=document.createElement('th');th.textContent=title;th.colSpan=span;th.scope=span>1?'colgroup':'col';if(index!==null)th.dataset.gradeCol=index;where.append(th);}
    header(group,'주문 판수',2);header(columns,'시작');header(columns,'끝');
    for(const th of [...group.children,...columns.children])th.className='mx-fixed';
    grades.forEach((g,i)=>{header(group,g.name,2,i);header(columns,'원란',1,i);header(columns,'포장',1,i);});
    head.replaceChildren(group,columns);body.replaceChildren();
    rows.forEach((row,r)=>{
      const tr=document.createElement('tr');
      row.forEach((v,c)=>{
        const td=document.createElement('td'),input=document.createElement('input'), error=document.createElement('span');
        if(c<2)td.className='mx-bound';else td.dataset.gradeCol=Math.floor((c-2)/2);
        input.value=c<2?v:display(model.normalize(v));input.dataset.r=r;input.dataset.c=c;input.readOnly=readOnly;input.autocomplete='off';if(c<2)input.inputMode='numeric';else input.setAttribute('list','price-cell-states');
        input.setAttribute('aria-label',(r+1)+'행 '+labels[c]);error.id='mx-error-'+r+'-'+c;error.className='sr-only';input.setAttribute('aria-describedby',error.id);
        input.oninput=()=>{checkpoint();row[c]=input.value;cancelProposal();update();};
        input.onfocus=()=>{point=[r,c];};
        input.onblur=()=>{
          if(c<2||readOnly)return;
          // Removing a focused input while repainting a pasted range also fires blur in Chrome.
          // oninput already owns manual edits; reflect the latest model rather than the old input.
          const v=model.normalize(row[c]);row[c]=v;input.value=display(v);update();
        };
        input.onclick=e=>select(r,c,e.shiftKey);
        input.onkeydown=e=>{
          if(e.isComposing||e.altKey||e.ctrlKey||e.metaKey)return;
          let nr=r,nc=c;
          if(e.key==='Enter'||e.key==='ArrowDown')nr+=e.shiftKey&&e.key==='Enter'?-1:1;
          else if(e.key==='ArrowUp')nr--;else if(e.key==='ArrowLeft')nc--;else if(e.key==='ArrowRight')nc++;else return;
          e.preventDefault();while(cell(nr,nc)?.parentElement.hidden&&nc!==c)nc+=nc<c?-1:1;
          const dest=cell(nr,nc);if(dest){select(nr,nc,e.shiftKey&&e.key!=='Enter');dest.focus();dest.select();}
        };
        input.onpaste=e=>{
          if(readOnly)return;
          const text=e.clipboardData?.getData('text/plain');if(!text||!/[\t\n\r]/.test(text))return;
          e.preventDefault();
          const data=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(s=>s.split('\t'));
          // Recognize only the displayed column order when a spreadsheet includes its header.
          if(['시작 판수','시작','물량','주문 판수','물량 구간'].includes(data[0][0].trim())){
            const header=data.shift(), listed=header.slice(header.length-(labels.length-2)).map(v=>v.trim());
            if(!data.length||listed.some((v,i)=>v!==labels[i+2])){status('규격과 포장 순서가 현재 표와 일치하지 않습니다.');return;}
          }
          let start=c, incoming=data;
          const width=grades.length*2, bounded=data.every(line=>line.length===width+2), labelled=data.every(line=>line.length===width+1);
          if(bounded||labelled){
            start=0;
            if(labelled){
              incoming=[];
              for(const [label,...prices] of data){
                const band=label.trim().match(/^(\d+)\s*(?:[~–—-]\s*(\d+)\s*판?|판?\s*(이상|\+))$/);
                if(!band){status('물량 열을 확인해 주세요. 예: 1~10판, 501판 이상');return;}
                incoming.push([band[1],band[2]||'',...prices]);
              }
            }
            if(!window.confirm('물량 구간, '+grades.map(g=>g.name+' 원란·포장').join(', ')+' 순서로 '+data.length+'개 행을 적용할까요?'))return;
          }else if(data.length===rows.length&&data.every(line=>line.length===width)){start=2;}
          if(incoming.length+r>100||incoming.some(line=>line.length+start>row.length)){status('선택한 위치에서 붙여넣을 수 있는 범위를 벗어났습니다.');return;}
          checkpoint();
          while(rows.length<r+incoming.length)rows.push(Array(labels.length).fill(''));
          incoming.forEach((line,i)=>line.forEach((v,j)=>{rows[r+i][start+j]=start+j<2?v.trim():model.normalize(v);}));
          cancelProposal();render();cell(r,start)?.focus();notify();
        };
        td.append(input,error);tr.append(td);
      });body.append(tr);
    });
    const prev=find('grade').value;find('grade').replaceChildren(...grades.map(g=>new Option(g.name,g.id)));if(grades.some(g=>g.id===prev))find('grade').value=prev;
    find('columns').replaceChildren(...available.map(g=>{
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=grades.some(v=>v.id===g.id);check.disabled=readOnly;label.append(check,document.createTextNode(g.name));check.onchange=()=>{
        const ix=grades.findIndex(v=>v.id===g.id);if(ix>=0&&grades.length===1){check.checked=true;return;}
        if(ix>=0&&rows.some(row=>row[ix*2+2]||row[ix*2+3])&&!window.confirm(g.name+' 가격 열을 제거할까요?')){check.checked=true;return;}
        checkpoint();if(ix>=0){grades.splice(ix,1);for(const row of rows)row.splice(2+ix*2,2);}else{grades.push({...g});for(const row of rows)row.push('','');}
        range=null;cancelProposal();render();notify();
      };return label;
    }));
    for(const name of ['add','copy','remove','preview','apply'])find(name).disabled=readOnly;
    const activeRow=Math.max(0,Math.min(rows.length-1,Number(find('row-select').value)));
    find('row-select').replaceChildren(...rows.map((row,r)=>new Option((r+1)+'행 · '+(row[0]||'미입력')+'~'+(row[1]||'이상')+'판',String(r))));
    find('row-select').value=String(activeRow);if(find('row-detail').open)rowDetail();
    showRange();visibleColumns();update();
  }
  function set(matrix,options,compare=null,locked=false,retain=false){
    if(retain&&matrix&&readOnly===locked){
      const sameGrades=(a,b)=>a.length===b.length&&a.every((grade,i)=>grade.id===b[i].id&&grade.name===b[i].name);
      const current=value();
      if(sameGrades(current.grades,matrix.grades)&&sameGrades(available,options||[])&&current.rows.length===matrix.rows.length&&
        current.rows.every((row,i)=>row.min===matrix.rows[i].min&&row.max===matrix.rows[i].max&&row.cells.every((v,c)=>v===matrix.rows[i].cells[c]))){
        base=compare||matrix;update();return;
      }
    }
    available=(options||[]).map(g=>({...g}));
    grades=(matrix?.grades||available).map(g=>({...g}));rows=(matrix?.rows||model.emptyRows(grades.length)).map(cells);
    undo.length=0;find('undo').disabled=true;
    base=compare||{grades:grades.map(g=>({...g})),rows:value().rows};range=null;point=[0,2];readOnly=locked;cancelProposal();render();
  }
  find('view').onclick=()=>{all=!all;visibleColumns();};
  find('grade').onchange=visibleColumns;
  matchMedia('(max-width:680px)').addEventListener?.('change',visibleColumns);
  if(typeof ResizeObserver==='function')new ResizeObserver(visibleColumns).observe(root);
  find('start').onclick=()=>{endpoint='start';status('시작 가격 셀을 선택해 주세요.');};
  find('end').onclick=()=>{endpoint='end';status('끝 가격 셀을 선택해 주세요.');};
  for(const action of ['add','copy','remove'])find(action).onclick=()=>{
    if(readOnly)return;
    const r=Math.min(point[0],rows.length-1),width=2+grades.length*2;
    if((action==='remove'&&rows.length===1)||(action!=='remove'&&rows.length>=100))return;
    checkpoint();if(action==='remove'&&rows.length>1)rows.splice(r,1);
    if(action!=='remove'&&rows.length<100)rows.splice(r+1,0,action==='copy'?[...rows[r]]:Array(width).fill(''));
    point=[Math.min(r+(action==='remove'?0:1),rows.length-1),0];range=null;cancelProposal();render();cell(...point)?.focus();notify();
  };
  find('preview').onclick=()=>{
    cancelProposal();if(readOnly||!grades.length)return;
    const delta=find('delta').value.trim(),fee=find('method').value==='fee',box=range||rangeFrom(point,point);
    if(box[1]<2||!(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(delta))||(fee&&delta.startsWith('-'))){status('가격 셀 영역과 변경 금액을 확인해 주세요.');return;}
    const proposal=[];
    for(let r=box[0];r<=box[2];r++)for(let c=box[1];c<=box[3];c++){
      if(fee&&(c-2)%2!==1)continue;
      const before=rows[r][c],after=fee?((model.shifted(rows[r][c-1],'0')!==null)?'+'+delta:null):find('method').value==='percent'?model.scaled(before,delta):model.shifted(before,delta);
      if(after===null){status('미입력·협의·판매 안 함 또는 금액 범위를 벗어나는 셀이 있습니다. 선택 범위를 확인해 주세요.');return;}
      proposal.push({r,c,before,after});
    }
    if(!proposal.length){status('포장 단가 셀을 선택해 주세요.');return;}
    pending=proposal;find('proposal').hidden=false;find('proposal').querySelector('ul').replaceChildren(...pending.map(x=>{const li=document.createElement('li');li.textContent=(x.r+1)+'행 '+names()[x.c]+' · '+(x.before||'미입력')+' → '+x.after+'원';return li;}));
  };
  find('delta').oninput=cancelProposal;find('method').onchange=cancelProposal;
  find('apply').onclick=()=>{if(readOnly||!pending.length)return;checkpoint();for(const x of pending)rows[x.r][x.c]=x.after;cancelProposal();render();notify();status('변경 내용을 표에 적용했습니다.');};
  return {set,read:value,validate:()=>update(true).length===0};
}
