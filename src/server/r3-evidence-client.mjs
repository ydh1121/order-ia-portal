// Inlined with a server-generated nonce. Only rendered, user-confirmed page pixels leave this editor.
export function createEvidenceEditor({container,caseId,kind,csrf,onReceipt,onError,evidenceId,readOnly=false}){
  const el=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
  const btn=(value,fn)=>{const b=el('button',value);b.type='button';b.onclick=fn;return b;};
  const hint=el('p'),file=el('input'),pages=el('div'),settings=el('fieldset');settings.style.minWidth='0';settings.append(el('legend',kind==='business'?'사업자 정보 등록':'거래내역 증빙'));
  const endpoint=(window.ORDER_APP_CONTEXT?.endpoints?.role||'/api/ia/r3-role')+'/evidence?caseId='+encodeURIComponent(caseId),packetType='application/vnd.order.masked-rasters';
  let signOff=null;let disposed=false,generation=0,working=[],sealed=null,uploaded=null,busy=false,docTask=null,renderTask=null,key='';
  const alive=gen=>!disposed&&gen===generation&&container.isConnected;
  function clear(){for(const c of working){c.width=c.height=0;}working=[];pages.replaceChildren();}
  function dispose(){disposed=true;generation++;renderTask?.cancel();docTask?.destroy()?.catch(()=>{});clear();signOff?.reset();sealed=null;file.value='';}
  function ensureSize(w,h){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||!w||!h||w*h>16000000)throw Error('이미지 크기를 줄여 주세요.');}
  function imageSize(bytes,mime){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(mime==='image/png'&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&view.getUint32(12)===0x49484452)return [view.getUint32(16),view.getUint32(20)];
    if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){for(let i=2;i+9<bytes.length;){if(bytes[i++]!==255)break;while(bytes[i]===255)i++;const tag=bytes[i++];if([0xc0,0xc1,0xc2].includes(tag))return [view.getUint16(i+5),view.getUint16(i+3)];if(tag===0xda||tag===0xd9||i+2>=bytes.length)break;const len=view.getUint16(i);if(len<2)break;i+=len;}}
    throw Error('PDF, JPG 또는 PNG 파일을 다시 선택해 주세요.');
  }
  function canvas(w,h){const scale=Math.min(1,1440/Math.max(w,h),Math.sqrt(1_200_000/(w*h)));const c=el('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.style.cssText='max-width:100%;height:auto;touch-action:none;border:1px solid #888;display:block';const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);return c;}
  function showCanvas(c,index,edit){const panel=el('section');panel.append(el('h3',`${index}쪽`),c);pages.append(panel);working.push(c);if(!edit)return;
    c.setAttribute('aria-label',`${index}쪽 가림 영역 선택`);const ctx=c.getContext('2d');let start;
    const point=e=>{const r=c.getBoundingClientRect();return [Math.max(0,Math.min(c.width,(e.clientX-r.left)*c.width/r.width)),Math.max(0,Math.min(c.height,(e.clientY-r.top)*c.height/r.height))];};
    const mask=(a,b)=>{ctx.fillStyle='#000';const x=Math.floor(Math.min(a[0],b[0])),y=Math.floor(Math.min(a[1],b[1]));ctx.fillRect(x,y,Math.ceil(Math.max(a[0],b[0]))-x,Math.ceil(Math.max(a[1],b[1]))-y);};
    c.onpointerdown=e=>{if(e.button!==0||sealed)return;start=point(e);c.setPointerCapture(e.pointerId);};c.onpointercancel=()=>{start=null;};c.onpointerup=e=>{if(!start||sealed)return;mask(start,point(e));start=null;};
    const precise=el('details');precise.append(el('summary','숫자로 가림 영역 선택'));const fields=[];for(const n of ['왼쪽','위쪽','너비','높이']){const l=el('label',n+' (%)');const f=el('input');f.type='number';f.min='0';f.max='100';f.step='1';l.append(f);precise.append(l);fields.push(f);}precise.append(btn('영역 가리기',()=>{const [x,y,w,h]=fields.map(f=>f.value===''?NaN:Number(f.value));if(![x,y,w,h].every(v=>Number.isFinite(v)&&v>=0&&v<=100)||w<=0||h<=0||x+w>100||y+h>100)return onError('가릴 영역의 위치와 크기를 확인해 주세요.');mask([x*c.width/100,y*c.height/100],[(x+w)*c.width/100,(y+h)*c.height/100]);}));panel.append(precise);
  }
  async function addFile(f,gen){if(!f.size||f.size>10*1024*1024)throw Error('파일당 10MB 이하로 선택해 주세요.');const bytes=new Uint8Array(await f.arrayBuffer());if(!alive(gen))return;
    if(f.type==='application/pdf'&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-'){
      const pdf=await import(new URL('/vendor/r3-pdf/pdf.min.mjs',document.baseURI).href);if(!alive(gen))return;pdf.GlobalWorkerOptions.workerSrc='/vendor/r3-pdf/pdf.worker.min.mjs';
      docTask=pdf.getDocument({data:bytes,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,disableAutoFetch:true,maxImageSize:16000000,canvasMaxAreaInBytes:16000000,stopAtErrors:true});const doc=await docTask.promise;
      try{if(doc.numPages+working.length>8)throw Error('한 번에 최대 8쪽을 선택해 주세요.');for(let i=1;i<=doc.numPages&&alive(gen);i++){const page=await doc.getPage(i);const unscaled=page.getViewport({scale:1});if(!Number.isFinite(unscaled.width+unscaled.height)||unscaled.width<=0||unscaled.height<=0)throw Error('PDF 페이지를 열 수 없습니다.');const c=canvas(unscaled.width*2,unscaled.height*2),viewport=page.getViewport({scale:c.width/unscaled.width});renderTask=page.render({canvasContext:c.getContext('2d'),viewport,annotationMode:0,background:'white'});await renderTask.promise;renderTask=null;if(alive(gen))showCanvas(c,working.length+1,true);page.cleanup();}}
      finally{await doc.destroy();docTask=null;}
    }else{const [w,h]=imageSize(bytes,f.type);ensureSize(w,h);const bitmap=await createImageBitmap(f);try{if(!alive(gen))return;const c=canvas(bitmap.width,bitmap.height);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);showCanvas(c,working.length+1,true);}finally{bitmap.close();}}
  }
  function encode(){const size=6+working.reduce((n,c)=>n+4+c.width*c.height,0);if(size>8*1024*1024)throw Error('페이지를 나누어 제출해 주세요.');const b=new Uint8Array(size),v=new DataView(b.buffer);b.set([79,82,80,88,1,working.length]);let i=6;for(const c of working){v.setUint16(i,c.width);v.setUint16(i+2,c.height);i+=4;const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let j=0;j<data.length;j+=4)b[i++]=(77*data[j]+150*data[j+1]+29*data[j+2]+128)>>8;}return b;}
  function decode(bytes){const v=new DataView(bytes.buffer),count=bytes[5];if(bytes.byteLength>8*1024*1024||count<1||count>8||![79,82,80,88,1].every((b,i)=>bytes[i]===b))throw Error('증빙을 열 수 없습니다.');let offset=6;for(let i=0;i<count;i++){const w=v.getUint16(offset),h=v.getUint16(offset+2);offset+=4;if(!w||!h||w*h>2*1024*1024||offset+w*h>bytes.length)throw Error('증빙을 열 수 없습니다.');const c=canvas(w,h);c.width=w;c.height=h;const ctx=c.getContext('2d'),pix=ctx.createImageData(w,h);for(let j=0;j<pix.data.length;j+=4){const val=bytes[offset++];pix.data[j]=pix.data[j+1]=pix.data[j+2]=val;pix.data[j+3]=255;}ctx.putImageData(pix,0,0);showCanvas(c,i+1,false);}if(offset!==bytes.length)throw Error('증빙을 열 수 없습니다.');}
  function signaturePad(){
    const pane=el('fieldset'),pad=el('canvas'),ctx=pad.getContext('2d'),typed=el('input');
    pane.append(el('legend','가림 처리한 자료의 제출 서명'));
    pad.width=360;pad.height=100;pad.style.cssText='width:100%;max-width:360px;touch-action:none;border:1px solid #aab7c5';
    pad.setAttribute('aria-label','제출 확인 서명 그리기');let start=null,drawn=false;
    function reset(){ctx.fillStyle='white';ctx.fillRect(0,0,pad.width,pad.height);drawn=false;typed.value='';start=null;}
    reset();
    const point=e=>{const r=pad.getBoundingClientRect();return [(e.clientX-r.left)*pad.width/r.width,(e.clientY-r.top)*pad.height/r.height];};
    pad.onpointerdown=e=>{if(sealed||e.button!==0)return;typed.value='';start=point(e);pad.setPointerCapture(e.pointerId);};
    pad.onpointermove=e=>{if(!start)return;const end=point(e);ctx.beginPath();ctx.moveTo(...start);ctx.lineTo(...end);ctx.strokeStyle='#141414';ctx.lineWidth=2;ctx.stroke();drawn=true;start=end;};
    pad.onpointerup=pad.onpointercancel=()=>{start=null;};
    const label=el('label','또는 이름 입력으로 서명');typed.maxLength=40;typed.autocomplete='off';label.append(typed);
    typed.oninput=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,pad.width,pad.height);drawn=false;};
    pane.append(pad,label,btn('서명 지우기',reset));settings.append(pane);
    return {reset,page(){
      if(!drawn&&!typed.value.trim())throw Error('가림 처리한 자료를 확인한 뒤 제출에 서명해 주세요.');
      if(!drawn){ctx.fillStyle='#141414';ctx.font='20px sans-serif';ctx.fillText(typed.value.trim(),8,56,pad.width-16);}
      return pad;
    }};
  }
  if(evidenceId){settings.append(btn('연결된 증빙 열기',async()=>{try{const r=await fetch(endpoint+'&id='+encodeURIComponent(evidenceId),{cache:'no-store'});if(!r.ok||r.headers.get('Content-Type')!==packetType)throw Error();const arr=new Uint8Array(await r.arrayBuffer());if(disposed)return;clear();decode(arr);}catch{onError('증빙을 열 수 없습니다.');}}));}
  if(!readOnly){file.type='file';file.accept='application/pdf,image/png,image/jpeg';file.multiple=kind!=='business';const label=el('label',file.multiple?'증빙 파일 선택 (여러 개 가능)':'사업자등록증 파일 선택');label.append(file);hint.textContent='제3자의 개인정보는 가려 주세요. 드래그하거나 숫자로 영역을 선택할 수 있습니다.';
    if(kind==='reprice')signOff=signaturePad();
    const confirmed=el('input');confirmed.type='checkbox';const accept=el('label','가림 처리한 모든 페이지를 확인했습니다.');accept.prepend(confirmed);
    const save=btn('가림 처리본 제출',async()=>{if(busy||(!working.length&&!sealed&&!uploaded)||!confirmed.checked)return;busy=true;save.disabled=true;file.disabled=true;try{if(!sealed&&!uploaded){
      if(signOff&&working.length>=8)throw Error('서명과 함께 제출할 자료는 최대 7쪽입니다.');
      const signature=signOff?.page();if(signature)working.push(signature);try{sealed=encode();}finally{if(signature)working.pop();}
      signOff?.reset();key=crypto.randomUUID();clear();file.value='';
    }
    if(!uploaded){
      const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':packetType,'X-IA-CSRF':csrf,'Idempotency-Key':key},body:sealed});
      if(!r.ok)throw Error('제출하지 못했습니다. 가림 처리본으로 다시 시도해 주세요.');
      const reply=await r.json();if(disposed)return;uploaded=reply.evidenceId;sealed=null;
    }
    // Retain the upload receipt for a linking retry, without sending any pixels a second time.
    if(await onReceipt(uploaded,save)){uploaded=null;confirmed.checked=false;}
    }catch(e){onError(e.message);}finally{busy=false;if(!disposed){save.disabled=false;file.disabled=false;}}});
    file.onchange=async()=>{const gen=++generation;const files=[...file.files];sealed=null;uploaded=null;signOff?.reset();clear();confirmed.checked=false;save.disabled=true;if(files.length>8||files.reduce((n,f)=>n+f.size,0)>20*1024*1024){file.value='';return onError('파일 수 또는 전체 크기를 줄여 주세요.');}try{for(const f of files){if(!alive(gen))return;await addFile(f,gen);}if(alive(gen)&&working.length>8)throw Error('최대 8쪽을 선택해 주세요.');}catch(e){if(alive(gen)){clear();onError('파일을 열 수 없습니다. 파일 형식과 크기를 확인해 주세요.');}}finally{if(alive(gen)){save.disabled=false;file.value='';}}};
    settings.append(label,hint,accept,save);
  }
  settings.append(pages);container.append(settings);return dispose;
}
