export const matrixMarkup = `<div class="mx-toolbar">
<div data-mx="grade-chips" class="mx-grade-chips" role="group" aria-label="표에 볼 규격"></div>
<select data-mx="grade" aria-label="편집할 규격" hidden></select><button type="button" data-mx="view" hidden>전체표 보기</button>
<div class="mx-toolbar-end"><span class="mx-unit">원 / 판</span><details class="mx-tools" data-mx="tools"><summary>표 편집</summary><div class="mx-tools-panel">
<section class="mx-tool-section"><h3>주문량 구간</h3><div class="matrix-controls"><button type="button" data-mx="bounds" aria-pressed="false">구간 편집</button><button type="button" data-mx="add">구간 추가</button><button type="button" data-mx="copy">구간 복제</button><button type="button" data-mx="remove">구간 삭제</button><button type="button" data-mx="undo" disabled>실행 취소</button></div></section>
<details class="mx-row-editor" data-mx="row-detail"><summary>선택 구간 편집</summary><label>주문량 구간<select data-mx="row-select"></select></label><div class="fields" data-mx="row-fields"></div></details>
<details><summary>가격표 규격 변경</summary><div data-mx="columns" class="matrix-controls"></div></details>
<details><summary>선택 가격 일괄 수정</summary><div class="matrix-controls"><button type="button" data-mx="start">범위 시작 셀</button><button type="button" data-mx="end">범위 끝 셀</button><span data-mx="range"></span><label>변경 방식<select data-mx="method"><option value="adjust">정액 변경 (원)</option><option value="percent">정률 변경 (%)</option><option value="fee">원란에 포장비 가산</option></select></label><label>변경값<input data-mx="delta" inputmode="decimal"></label><button data-mx="preview" type="button">변경 미리보기</button></div><div data-mx="proposal" hidden><ul></ul><button data-mx="apply" type="button">표에 적용</button></div></details>
<details><summary>입력 도움말</summary><p class="matrix-help">엑셀에서 복사한 셀을 바로 붙여넣을 수 있습니다.</p><p class="matrix-help">포장 칸에 +210을 입력하면 원란 가격에 210원을 더합니다. 빈칸은 미입력입니다.</p><p class="matrix-help">판매하지 않는 가격은 미판매, 별도 상담이 필요한 가격은 협의로 입력하세요.</p></details>
</div></details></div></div>
<div class="mx-quick" role="toolbar" aria-label="가격표 바로 편집"><button type="button" data-mx-short="add">구간 추가</button><button type="button" data-mx-short="copy">복제</button><button type="button" data-mx-short="remove">삭제</button><button type="button" data-mx-short="undo">실행 취소</button><button type="button" data-mx-short="bulk">일괄 수정</button></div>
<div class="matrix-scroll" data-mx="scroll" tabindex="0" aria-label="단가표 가로 이동"><table class="price-matrix"><caption class="sr-only">수량·규격별 원란과 포장 단가 (원)</caption><thead></thead><tbody></tbody></table></div>
<datalist id="price-cell-states"><option value="협의"></option><option value="미판매"></option></datalist>
<output class="mx-status" data-mx="status" aria-live="polite"></output>`;
const baseMatrixCss = `
.mx-toolbar>[hidden]{display:none!important}.mx-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;position:relative;margin:0 0 12px;min-height:40px}
.mx-grade-chips{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none}
.mx-grade-chips::-webkit-scrollbar{display:none}.mx-grade-chips button{border:0;border-radius:9px;min-height:36px;padding:7px 13px;background:#f3f4f6;color:#68717e;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;flex-shrink:0;cursor:pointer}
.mx-grade-chips button[aria-pressed=true]{background:#252d38;color:#fff}
.mx-toolbar-end{display:flex;align-items:center;gap:16px;flex-shrink:0}.mx-unit{font-size:12px;color:#8a919c;white-space:nowrap}
.mx-tools{padding:0!important;margin:0!important;border:0!important;position:relative}.mx-tools>summary{display:flex;align-items:center;gap:8px;padding:8px 12px;min-height:36px;box-sizing:border-box;cursor:pointer;list-style:none;border-radius:9px;background:#f3f4f6;font-size:13px;font-weight:600;color:#3f4856;white-space:nowrap}.mx-tools>summary::-webkit-details-marker{display:none}.mx-tools>summary::after{content:'⌄';font-size:14px;line-height:1}.mx-tools[open]>summary{background:#e8ebf0}
#price-workspace details.mx-tools::details-content{overflow:visible;block-size:auto;transition:none}.mx-tools-panel{position:absolute;right:0;top:calc(100% + 10px);width:min(400px,calc(100vw - 32px));max-height:min(70vh,600px);overflow:auto;scrollbar-width:none;z-index:15;padding:18px;box-sizing:border-box;background:#fff;border:1px solid #e5e8ed;border-radius:16px;box-shadow:0 12px 40px #18223518}
.mx-tools-panel::-webkit-scrollbar{display:none}.mx-tools-panel details{margin:0;border:0;border-top:1px solid #edf0f3;padding:12px 0}.mx-tools-panel details:last-child{padding-bottom:0}.mx-tools-panel summary{font-size:13px;font-weight:600;cursor:pointer}.mx-tools-panel .matrix-controls{margin-top:12px}.mx-tool-section{padding:0 0 14px!important;border:0!important;margin:0!important}.mx-tool-section h3{font-size:13px;margin:0 0 10px}.mx-tools-panel button{font-size:12px;min-height:36px;padding:7px 10px;border:0;background:#f3f4f6;color:#354052;border-radius:8px}.mx-tools-panel button[aria-pressed=true]{background:#273449;color:#fff}.mx-tools-panel label{font-size:12px}.mx-tools-panel select,.mx-tools-panel input{min-height:40px;font-size:13px}.mx-tools-panel .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.matrix-controls{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.matrix-controls label{flex:0 1 auto}.matrix-controls label:has(input[type=checkbox]){display:inline-flex;align-items:center;gap:6px;min-height:36px}.matrix-controls input[type=checkbox]{width:16px;min-height:16px}.mx-row-editor small{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}
.matrix-scroll{overflow:auto;margin:0;max-width:100%;scrollbar-width:none;border:1px solid #e7e9ed;border-radius:12px;background:#fff}.matrix-scroll::-webkit-scrollbar{display:none}
.price-matrix{border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;min-width:100%;width:100%;background:#fff}.price-matrix th,.price-matrix td{border:solid #e7e9ed;border-width:0 1px 1px 0;padding:0}.price-matrix tr>*:last-child{border-right:0}.price-matrix tbody tr:last-child>*{border-bottom:0}
.price-matrix th{background:#f6f7f9;white-space:nowrap;text-align:center;padding:10px 12px;font-size:12px;font-weight:600;color:#485364;height:38px;box-sizing:border-box}.price-matrix thead tr:nth-child(2) th{font-weight:500;color:#758090;height:32px;padding-block:7px}
.price-matrix td{position:relative;background:#fff}.price-matrix td input{display:block;box-sizing:border-box;width:100%;min-width:80px;height:42px;min-height:42px;padding:10px 12px;text-align:right;font:inherit;font-size:14px;line-height:22px;font-weight:500;color:#26303d;border:0;border-radius:0;white-space:nowrap;background:transparent;box-shadow:none}.price-matrix td.mx-bound input{min-width:60px}.price-matrix td.mx-interval{background:#fafbfc;min-width:108px;width:108px}.mx-interval button{display:block;width:100%;height:42px;min-height:42px;box-sizing:border-box;padding:10px 12px;border:0;border-radius:0;background:transparent;color:#515b6b;text-align:left;font:inherit;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer}.mx-interval button:focus-visible{outline:2px solid #3159e8;outline-offset:-2px}
.price-matrix td[data-changed=true]{background:#edf3ff}.price-matrix td[data-range=true]{box-shadow:inset 0 0 0 1px #6f8ce3}.price-matrix td:has([aria-invalid=true]),.price-matrix td.mx-interval[data-invalid=true]{box-shadow:inset 0 0 0 2px #d85f5a;background:#fff7f6}.price-matrix input[aria-invalid=true]{color:#a53933}.price-matrix td input:focus-visible{outline:2px solid #3159e8;outline-offset:-2px}.price-matrix td:has([aria-invalid=true])::after{content:'!';position:absolute;top:4px;left:4px;pointer-events:none;color:#a53933;font-size:10px;font-weight:700}
.matrix-help{font-size:12px;color:#6f7885;line-height:1.65;margin:10px 0}.mx-status{display:block;min-height:0;font-size:12px;color:#6d7581;line-height:1.5}.mx-status:not(:empty){padding:8px 2px}.sr-only{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;white-space:nowrap}.matrix-scroll td[hidden],.matrix-scroll th[hidden]{display:none!important}
@media(max-width:680px){.mx-toolbar{gap:6px}.mx-grade-chips{gap:3px}.mx-grade-chips button{padding:7px 9px;font-size:12px}.mx-toolbar-end{gap:8px}.mx-unit{display:none}.mx-tools>summary{padding:8px 9px;font-size:12px}.price-matrix td input{min-width:78px;padding:10px 9px;font-size:14px}.price-matrix td.mx-bound input{min-width:45px}.price-matrix td.mx-interval{min-width:96px;width:96px}.mx-interval button{padding:10px 9px;font-size:12px}.matrix-scroll:not(.all-grades) .price-matrix{table-layout:fixed;min-width:100%;width:100%}.matrix-scroll:not(.all-grades) th{padding:8px 4px}.matrix-scroll:not(.all-grades) td input{width:100%;min-width:0}.matrix-scroll:not(.all-grades) .mx-interval{width:96px}.mx-tools-panel{right:0}}
@media(prefers-reduced-motion:no-preference){.price-matrix input.mx-error{animation:price-shake .2s ease-out}@keyframes price-shake{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}.mx-tools-panel{animation:mx-panel-in var(--dropdown-open-dur,250ms) var(--dropdown-ease,cubic-bezier(.22,1,.36,1));transform-origin:top right}@keyframes mx-panel-in{from{opacity:0;transform:translateY(-2px) scale(var(--dropdown-pre-scale,.97))}to{opacity:1;transform:none}}}
`;
export const matrixLayoutCss = `
.matrix-scroll{max-height:min(72vh,46rem);--bound-width:60px;isolation:isolate}
.price-matrix thead{position:sticky;top:0;z-index:4}
.price-matrix .mx-bound,.price-matrix .mx-interval,.price-matrix th.mx-fixed{position:sticky;z-index:1;left:0}
.price-matrix .mx-bound{background:#fafbfc;min-width:var(--bound-width);width:var(--bound-width)}
.price-matrix .mx-bound-end,.price-matrix th.mx-fixed-end{left:var(--bound-width)}
.price-matrix th.mx-fixed{background:#f6f7f9;z-index:5}
@media(max-width:680px){.matrix-scroll{--bound-width:45px;max-height:calc(100dvh - 210px)}}
`;
export const matrixCss=baseMatrixCss+matrixLayoutCss+`
.mx-quick{display:flex;align-items:center;justify-content:flex-end;gap:5px;margin:0;min-width:0;flex:1;overflow:auto;scrollbar-width:none}.mx-quick button{min-height:32px;padding:6px 10px;border:0;border-radius:7px;background:#f1f3f6;color:#465161;font-size:12px;white-space:nowrap}.mx-quick button:disabled{opacity:.35}.mx-quick button:first-child{color:#2454d8;background:#edf2ff}.price-matrix{table-layout:fixed}.price-matrix td:not(.mx-bound):not(.mx-interval){width:132px;min-width:132px}.price-matrix td.mx-interval{width:108px;min-width:108px}.price-desk .matrix-scroll{width:fit-content;max-width:calc(100% + 36px)}@media(max-width:1000px){.mx-toolbar{flex-wrap:wrap}.mx-quick{order:3;flex:1 0 100%;justify-content:flex-start}.mx-toolbar-end{margin-left:auto}}@media(max-width:680px){.price-desk .matrix-scroll{max-width:calc(100% + 20px)}.matrix-scroll:not(.all-grades) .price-matrix{width:372px;min-width:372px}.matrix-scroll:not(.all-grades) .mx-interval{width:108px}}
`;
export function mountPriceMatrix(root, model) {
  const find = name => root.querySelector('[data-mx="'+name+'"]');
  const head=root.querySelector('thead'), body=root.querySelector('tbody');
  let displayOrder=[];
  let available=[],grades=[], rows=[], base=null, point=[0,2], range=null, endpoint='', pending=[], all=!matchMedia('(max-width:680px)').matches, readOnly=false, editingBounds=false, viewTouched=false;
  const status=text=>{find('status').textContent=text;};
  const orderedRows=()=>{const order=new Map(displayOrder.map((key,i)=>[key,i]));return rows.map((_,i)=>i).sort((a,b)=>(order.get(rows[a][0]+':'+(rows[a][1]||'*'))??(order.size+a))-(order.get(rows[b][0]+':'+(rows[b][1]||'*'))??(order.size+b)));};
  const quick=root.querySelector('.mx-quick');find('grade-chips').after(quick);
  for(const button of root.querySelectorAll('[data-mx-short]'))button.onclick=()=>{const name=button.dataset.mxShort;if(name==='bulk'){find('tools').open=true;find('method').closest('details').open=true;find('delta').focus();}else find(name).click();};
  const names=()=>['시작 판수','끝 판수',...grades.flatMap(g=>[g.name+' 원란',g.name+' 포장'])];
  const cells=row=>[row.min===null?'':String(row.min),row.max===null?'':String(row.max),...row.cells];
  const undo=[];
  function checkpoint(){
    if(undo.length>=40)undo.shift();
    undo.push({rows:rows.map(row=>row.slice()),grades:grades.map(g=>({...g}))});
    find('undo').disabled=false;root.querySelector('[data-mx-short=undo]')?.removeAttribute('disabled');
  }
  function notify(){root.dispatchEvent(new Event('input',{bubbles:true}));}
  find('undo').onclick=()=>{
    if(readOnly||!undo.length)return;
    const prior=undo.pop();rows=prior.rows;grades=prior.grades;range=null;cancelProposal();render();
    find('undo').disabled=!undo.length;root.querySelector('[data-mx-short=undo]')?.toggleAttribute('disabled',!undo.length);notify();status('이전 입력으로 되돌렸습니다.');
  };
  const display=text=>typeof text==='string'?text.replace(/^(\+?)(\d+)(\.\d+)?$/,(_,prefix,whole,fraction='')=>prefix+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+fraction):text;
  const numeric=s=>s===''?null:/^\d+$/.test(s)?Number(s):s;
  const cell=(r,c)=>body.querySelector('input[data-r="'+r+'"][data-c="'+c+'"]');
  const value=()=>({schema:1,grades:grades.map(g=>({...g})),rows:rows.map(row=>({min:numeric(row[0]),max:numeric(row[1]),cells:row.slice(2).map(model.normalize)}))});
  const cancelProposal=()=>{pending=[];find('proposal').hidden=true;};
  function visibleColumns() {
    const grade=find('grade').value, selected=grades.findIndex(g=>g.id===grade);
    for(const item of root.querySelectorAll('[data-grade-col]'))item.hidden=!all&&Number(item.dataset.gradeCol)!==selected;
    for(const item of root.querySelectorAll('[data-bound-col]'))item.hidden=!editingBounds;
    for(const item of root.querySelectorAll('[data-interval-col]'))item.hidden=editingBounds;
    find('scroll').classList.toggle('all-grades',all);
    const width=(editingBounds?120:108)+(all?grades.length:1)*264;root.querySelector('table').style.width=width+'px';root.querySelector('table').style.minWidth=width+'px';
    find('view').setAttribute('aria-pressed',String(all));find('view').textContent=all?'선택 규격 보기':'전체표 보기';
    find('bounds').setAttribute('aria-pressed',String(editingBounds));find('bounds').textContent=editingBounds?'구간 편집 끝내기':'구간 편집';
    for(const chip of find('grade-chips').querySelectorAll('button'))chip.setAttribute('aria-pressed',String(chip.dataset.grade===''?all:!all&&chip.dataset.grade===grade));
  }
  function chooseGrade(id){
    viewTouched=true;all=id==='';if(id!=='')find('grade').value=id;visibleColumns();
  }
  function openBounds(row=point[0]){
    editingBounds=true;visibleColumns();find('tools').open=false;cell(row,0)?.focus();
  }
  find('bounds').onclick=()=>{if(editingBounds){editingBounds=false;visibleColumns();find('tools').open=false;}else openBounds();};
  // Closing the tools never removes the live grid or its selection/undo history.
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&find('tools').open){find('tools').open=false;find('tools').querySelector('summary').focus();}});
  root.ownerDocument.addEventListener('pointerdown',event=>{if(find('tools').open&&!find('tools').contains(event.target))find('tools').open=false;});
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
    for(const interval of body.querySelectorAll('[data-interval-row]')){
      const r=Number(interval.dataset.intervalRow),row=rows[r];
      interval.querySelector('button').textContent=intervalLabel(row);
      interval.dataset.invalid=String(indexed.has(r+'/0')||indexed.has(r+'/1'));
    }
    const detail=find('row-detail');
    if(detail.open){const r=Number(find('row-select').value);for(const input of find('row-fields').querySelectorAll('input')){
      const c=Number(input.dataset.detailCol),message=indexed.get(r+'/'+c);
      if(rows[r]&&input.value!==rows[r][c])input.value=rows[r][c];input.setAttribute('aria-invalid',String(Boolean(message)));input.nextElementSibling.textContent=message||'';
    }}
    if(scroll&&issues.length){
      const first=issues[0],input=cell(first.row,first.col);
      if(input){if(first.col<2)editingBounds=true;else find('grade').value=grades[Math.floor((first.col-2)/2)].id;visibleColumns();input.focus();input.classList.remove('mx-error');void input.offsetWidth;input.classList.add('mx-error');}
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
  const intervalLabel=row=>!row?.[0]?'구간 입력':row[1]?display(row[0])+'~'+display(row[1])+'판':display(row[0])+'판 이상';
  function render(){
    const labels=names(),group=document.createElement('tr'),columns=document.createElement('tr');
    function header(where,title,span=1,index=null){const th=document.createElement('th');th.textContent=title;th.colSpan=span;th.scope=span>1?'colgroup':'col';if(index!==null)th.dataset.gradeCol=index;where.append(th);}
    header(group,'주문 판수');const intervalHead=group.lastChild;intervalHead.rowSpan=2;intervalHead.dataset.intervalCol='';intervalHead.className='mx-fixed';
    header(group,'주문 판수',2);const boundsHead=group.lastChild;boundsHead.dataset.boundCol='';boundsHead.className='mx-fixed';
    header(columns,'시작');columns.lastChild.dataset.boundCol='';columns.lastChild.className='mx-fixed mx-fixed-start';
    header(columns,'끝');columns.lastChild.dataset.boundCol='';columns.lastChild.className='mx-fixed mx-fixed-end';
    grades.forEach((g,i)=>{header(group,g.name,2,i);header(columns,'원란',1,i);header(columns,'포장',1,i);});
    head.replaceChildren(group,columns);body.replaceChildren();
    orderedRows().forEach(r=>{
      const row=rows[r];const tr=document.createElement('tr');
      const interval=document.createElement('td'),edit=document.createElement('button');interval.className='mx-interval';interval.dataset.intervalCol='';interval.dataset.intervalRow=String(r);
      edit.type='button';edit.textContent=intervalLabel(row);edit.setAttribute('aria-label',(r+1)+'행 주문 판수 편집');edit.disabled=readOnly;edit.onclick=()=>{point=[r,0];openBounds(r);};interval.append(edit);tr.append(interval);
      row.forEach((v,c)=>{
        const td=document.createElement('td'),input=document.createElement('input'), error=document.createElement('span');
        if(c<2){td.className='mx-bound '+(c===0?'mx-bound-start':'mx-bound-end');td.dataset.boundCol='';}else td.dataset.gradeCol=Math.floor((c-2)/2);
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
          if(e.key==='Enter'||e.key==='ArrowDown'){const indices=orderedRows();nr=indices[indices.indexOf(r)+(e.shiftKey&&e.key==='Enter'?-1:1)]??-1;}
          else if(e.key==='ArrowUp'){const indices=orderedRows();nr=indices[indices.indexOf(r)-1]??-1;}else if(e.key==='ArrowLeft')nc--;else if(e.key==='ArrowRight')nc++;else return;
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
          const pasteOrder=orderedRows(),pasteOffset=pasteOrder.indexOf(r);
          if(incoming.length+pasteOffset>100||incoming.some(line=>line.length+start>row.length)){status('선택한 위치에서 붙여넣을 수 있는 범위를 벗어났습니다.');return;}
          checkpoint();
          while(rows.length<pasteOffset+incoming.length){pasteOrder.push(rows.length);rows.push(Array(labels.length).fill(''));}
          incoming.forEach((line,i)=>line.forEach((v,j)=>{rows[pasteOrder[pasteOffset+i]][start+j]=start+j<2?v.trim():model.normalize(v);}));
          cancelProposal();render();cell(r,start<2&&!editingBounds?2:start)?.focus();notify();
        };
        td.append(input,error);tr.append(td);
      });body.append(tr);
    });
    const prev=find('grade').value;find('grade').replaceChildren(...grades.map(g=>new Option(g.name,g.id)));if(grades.some(g=>g.id===prev))find('grade').value=prev;
    find('grade-chips').replaceChildren(...[['','전체'],...grades.map(g=>[g.id,g.name])].map(([id,name])=>{
      const button=document.createElement('button');button.type='button';button.textContent=name;button.dataset.grade=id;button.setAttribute('aria-pressed','false');button.onclick=()=>chooseGrade(id);return button;
    }));
    find('columns').replaceChildren(...available.map(g=>{
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=grades.some(v=>v.id===g.id);check.disabled=readOnly;label.append(check,document.createTextNode(g.name));check.onchange=()=>{
        const ix=grades.findIndex(v=>v.id===g.id);if(ix>=0&&grades.length===1){check.checked=true;return;}
        if(ix>=0&&rows.some(row=>row[ix*2+2]||row[ix*2+3])&&!window.confirm(g.name+' 가격 열을 제거할까요?')){check.checked=true;return;}
        checkpoint();if(ix>=0){grades.splice(ix,1);for(const row of rows)row.splice(2+ix*2,2);}else{grades.push({...g});for(const row of rows)row.push('','');}
        range=null;cancelProposal();render();notify();
      };return label;
    }));
    for(const name of ['add','copy','remove','preview','apply','bounds'])find(name).disabled=readOnly;
    for(const button of root.querySelectorAll('[data-mx-short]'))button.disabled=readOnly||(button.dataset.mxShort==='undo'&&!undo.length);
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
  find('view').onclick=()=>{viewTouched=true;all=!all;visibleColumns();};
  find('grade').onchange=()=>chooseGrade(find('grade').value);
  matchMedia('(max-width:680px)').addEventListener?.('change',event=>{if(!viewTouched)all=!event.matches;visibleColumns();});
  if(typeof ResizeObserver==='function')new ResizeObserver(visibleColumns).observe(root);
  find('start').onclick=()=>{endpoint='start';find('tools').open=false;status('시작 가격 셀을 선택해 주세요.');};
  find('end').onclick=()=>{endpoint='end';find('tools').open=false;status('끝 가격 셀을 선택해 주세요.');};
  for(const action of ['add','copy','remove'])find(action).onclick=()=>{
    if(readOnly)return;
    const r=Math.min(point[0],rows.length-1),width=2+grades.length*2;
    if((action==='remove'&&rows.length===1)||(action!=='remove'&&rows.length>=100))return;
    checkpoint();if(action==='remove'&&rows.length>1)rows.splice(r,1);
    if(action!=='remove'&&rows.length<100)rows.splice(r+1,0,action==='copy'?[...rows[r]]:Array(width).fill(''));
    point=[Math.min(r+(action==='remove'?0:1),rows.length-1),0];editingBounds=true;range=null;cancelProposal();render();find('tools').open=false;cell(...point)?.focus();notify();
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
  return {set,read:value,validate:()=>update(true).length===0,selectGrade:chooseGrade,setRowOrder(order=[]){displayOrder=[...order];render();},focusRow(min,max){const r=rows.findIndex(row=>Number(row[0])===min&&(row[1]===''?null:Number(row[1]))===max);if(r>=0){point=[r,2];cell(r,2)?.focus();cell(r,2)?.scrollIntoView({block:'nearest'});}},editBounds:()=>openBounds(),addRange:()=>find('add').click()};
}
