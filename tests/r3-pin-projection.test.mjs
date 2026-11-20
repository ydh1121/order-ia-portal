import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {browserFunction} from '../src/server/browser-source.mjs';
import {installPinProjection} from '../src/server/r3-ui/pin-projection.mjs';
import {mountApprovedMarkers} from '../src/server/r3-ui/approved-markers.mjs';
import {frameCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const currentHash='a'.repeat(64),oldHash='b'.repeat(64);
const plain=value=>JSON.parse(JSON.stringify(value));
function freeze(value){
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
function harness(t,body,options={}){
  const {documentHTML,frameScript,...identityOptions}=options;
  const html=documentHTML||'<!doctype html><html><body><main id="order-single">'+body+'</main></body></html>';
  const dom=new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),{url:'https://order-ia-portal.pages.dev/qa-frame',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,messages=[],scrolls=[],network=[];
  t.after(()=>w.close());
  const parent={postMessage(message){messages.push(plain(message));}};
  Object.defineProperty(w,'parent',{value:parent,configurable:true});
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement,configurable:true});
  Object.defineProperty(w,'innerWidth',{value:390,configurable:true});
  Object.defineProperty(w,'innerHeight',{value:844,configurable:true});
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.visualViewport={scale:1};
  w.fetch=(...args)=>{network.push(args);throw Error('Pin projection cannot fetch');};
  w.HTMLElement.prototype.scrollTo=function(x,y){this.scrollLeft=x;this.scrollTop=y;scrolls.push({el:this,x,y});};
  w.Element.prototype.getBoundingClientRect=function(){
    const left=Number(this.getAttribute('data-left')||20),top=Number(this.getAttribute('data-top')||40);
    const width=Number(this.getAttribute('data-width')||120),height=Number(this.getAttribute('data-height')||40);
    return {left,top,x:left,y:top,width,height,right:left+width,bottom:top+height};
  };
  w.Element.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[this.getBoundingClientRect()];};
  const session={screen:'qa-example',state:'normal',variant:'email',channel:'11111111-1111-4111-8111-111111111111',artifact:currentHash,version:'current',...identityOptions};
  w.__session=session;
  w.eval('window.__projection='+browserFunction(installPinProjection)+'(window.__session)');
  w.eval('('+(frameScript||frameCode)+')(window.__session)');
  w.eval('('+browserFunction(mountApprovedMarkers)+')(window.__session)');
  const root=w.document.getElementById('order-single');
  function send(type,payload,overrides={},source=parent){
    const data={scope:'ORDER_R3_HOST',channel:session.channel,artifact:session.artifact,type,payload,...overrides};
    const event=new w.MessageEvent('message',{source,data});
    w.dispatchEvent(event);
    return {data,event,projected:event.data};
  }
  return {dom,w,root,html,session,parent,messages,scrolls,network,send};
}
function point(h,selector,x=.37,y=.61){
  const el=typeof selector==='string'?h.root.querySelector(selector):selector;
  assert.ok(el);
  h.w.document.elementFromPoint=()=>el;
  h.send('mode',true);
  const box=el.getBoundingClientRect();
  h.w.dispatchEvent(new h.w.MouseEvent('click',{clientX:box.left+x*box.width,clientY:box.top+y*box.height,button:0,bubbles:true}));
  h.send('mode',false);
  const result=h.messages.filter(message=>message.type==='point').at(-1);
  assert.ok(result,'the frozen frame must identify the real selected element');
  return result.payload;
}
function placeholder(h,id='legacy-missing'){
  return {id,instance:h.session.screen,artifactHash:h.session.artifact,x:0,y:0,viewport:{width:390,height:844},scroll:[],layers:[]};
}
async function until(check,label){
  const deadline=Date.now()+1500;
  while(!check()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(check(),label);
}

test('a verified legacy label reaches both the frozen frame and marker decoration without rewriting the original',async t=>{
  const h=harness(t,'<section class="panel"><button data-action="save">저장   하기</button></section>');
  const expected=point(h,'button'),legacy={path:'section:nth-of-type(1) > button:nth-of-type(1)',tag:'button',label:' 저장\n하기 ',x:.23,y:.71,scrollTop:123,nestedScroll:[],pageX:.99,pageY:.99};
  const pin=freeze({id:'old-comment',ordinal:4,previous:true,resolved:false,anchor:placeholder(h),legacyAnchor:legacy});
  const original=JSON.stringify(pin),result=h.send('pins',[pin]);
  assert.notEqual(result.projected,result.data,'replace the event envelope, not the source record');
  assert.equal(result.projected.payload[0].anchor.id,expected.id);
  assert.equal(result.projected.payload[0].anchor.x,legacy.x);
  assert.equal(result.projected.payload[0].anchor.y,legacy.y);
  assert.equal(JSON.stringify(pin),original);
  await until(()=>h.w.document.querySelector('.r3-pin.is-previous'),'both listeners must use the projected anchor');
  assert.equal(h.w.document.querySelector('.r3-pin').textContent,'4');
  const restored=h.send('restore',freeze({...placeholder(h),legacyAnchor:legacy})).projected.payload;
  assert.equal(restored.id,expected.id);
  assert.ok(h.scrolls.some(item=>item.el===h.w.document.documentElement&&item.y===123));
  assert.equal(h.network.length,0);
});

test('category labels resolve through their original DOM and restore only recorded document and nested scroll positions',t=>{
  const old='<section class="before"><label class="email-field">이메일<input name="email"></label><div class="scroll-pane">목록</div><details class="info"><summary>안내</summary>설명</details></section>';
  const h=harness(t,'<article class="after"><div><label class="email-field">이메일<input name="email"></label></div><div class="scroll-pane">목록</div><details class="info"><summary>안내</summary>설명</details></article>');
  const expected=point(h,'label'),nested=point(h,'.scroll-pane');
  let parses=0;const parse=h.w.DOMParser.prototype.parseFromString;
  h.w.DOMParser.prototype.parseFromString=function(...args){parses++;return parse.apply(this,args);};
  const html='<main id="order-single">'+old+'</main><script>window.PIN_SOURCE_EXECUTED=true;fetch("/unexpected")</script>';
  h.send('pin-sources',[{artifactHash:'legacy',html}]);
  h.send('pin-sources',[{artifactHash:'legacy',html:'<main id="order-single">replacement</main>'}]);
  assert.equal(parses,1,'source identities are immutable within a frame/session');
  assert.equal(h.w.PIN_SOURCE_EXECUTED,undefined);
  const legacy=freeze({path:'section:nth-of-type(1) > label:nth-of-type(1)',tag:'label',label:'로그인 바텀시트 / 입력란',x:.3830409,y:.4538574,scrollTop:249,
    nestedScroll:[{path:'section:nth-of-type(1) > div:nth-of-type(1)',top:91,left:7},{path:'section:nth-of-type(9)',top:999,left:0}],
    layers:['section:nth-of-type(1) > details:nth-of-type(1)'],height:64,contentHeight:844,pageX:.9,pageY:.8});
  const result=h.send('pins',[{id:'record',previous:true,anchor:placeholder(h),legacyAnchor:legacy,sourceArtifactHash:'legacy'}]).projected.payload[0].anchor;
  assert.equal(result.id,expected.id);assert.equal(result.x,legacy.x);assert.equal(result.y,legacy.y);
  assert.deepEqual(plain(result.scroll),[{id:'document',x:0,y:249},{id:nested.id,x:7,y:91}]);
  h.send('restore',{...placeholder(h),legacyAnchor:legacy,sourceArtifactHash:'legacy'});
  assert.ok(h.scrolls.some(item=>item.el===h.root.querySelector('.scroll-pane')&&item.x===7&&item.y===91));
  assert.equal(h.root.querySelector('details').open,true);
  assert.equal(h.network.length,0);
});

test('native old fingerprints map through unique actions, classes and the same icon inside a mapped control',t=>{
  const old=harness(t,'<section class="before"><button data-action="social-kakao">카카오</button><label class="password"><button data-action="password-visibility" aria-label="비밀번호 표시"><svg viewBox="0 0 16 16"><path d="M0 0"/></svg></button></label><div class="sheet-grip"></div></section>',{artifact:oldHash});
  const current=harness(t,'<article class="after"><div><button data-action="social-kakao" aria-label="카카오 로그인"></button></div><label class="password"><button data-action="password-visibility" aria-label="비밀번호 표시"><svg viewBox="0 0 16 16"><path d="M0 0"/></svg></button></label><div class="sheet-grip"></div></article>');
  const selectors=['[data-action=social-kakao]','svg','.sheet-grip'];
  const originals=selectors.map(selector=>point(old,selector)),expected=selectors.map(selector=>point(current,selector));
  current.send('pin-sources',[{artifactHash:oldHash,html:old.html}]);
  const pins=freeze(originals.map((anchor,i)=>({id:'native-'+i,previous:true,anchor:{...anchor,artifactHash:currentHash},sourceArtifactHash:oldHash})));
  const stored=JSON.stringify(pins),result=current.send('pins',pins).projected.payload;
  result.forEach((pin,i)=>{assert.equal(pin.anchor.id,expected[i].id);assert.equal(pin.anchor.x,originals[i].x);assert.equal(pin.anchor.y,originals[i].y);});
  assert.equal(JSON.stringify(pins),stored);
});

test('ambiguous labels, category-only matches, tag/path guesses and removed icons stay missing',async t=>{
  const h=harness(t,'<section><button class="first">확인</button><button class="second">확인</button><h2>다른 제목</h2></section>');
  const variants=[
    {path:'section:nth-of-type(1) > button:nth-of-type(1)',tag:'button',label:'확인',x:.5,y:.5},
    {path:'section:nth-of-type(1) > h2:nth-of-type(1)',tag:'h2',label:'로그인 / 제목',x:.5,y:.5},
    {path:'section:nth-of-type(1) > h2:nth-of-type(1)',tag:'h2',label:'원래 제목',x:.5,y:.5,pageX:.2,pageY:.2},
    {path:'section:nth-of-type(1) > h2:nth-of-type(1)',tag:'h2',label:'다른 제목',x:2,y:.5}
  ];
  const pins=variants.map((legacyAnchor,i)=>({id:'missing-'+i,anchor:placeholder(h,'missing-'+i),legacyAnchor}));
  const result=h.send('pins',pins).projected.payload;
  result.forEach((pin,i)=>assert.equal(pin.anchor.id,pins[i].anchor.id));
  await until(()=>h.messages.some(message=>message.type==='missing'&&message.payload.ids.length===4),'unmapped positions are reported by the frozen frame');
  assert.equal(h.w.document.querySelectorAll('.r3-pin').length,0);
  const removed=harness(t,'<section class="sheet"><button class="sheet-close" data-action="close-sheet"><svg><path d="M0 0"/></svg></button></section>',{artifact:oldHash});
  const oldAnchor=point(removed,'svg');
  h.send('pin-sources',[{artifactHash:oldHash,html:removed.html}]);
  const missing=h.send('pins',[{id:'removed',sourceArtifactHash:oldHash,anchor:{...oldAnchor,artifactHash:currentHash}}]).projected.payload[0].anchor;
  assert.notEqual(missing.id,'screen');
  assert.equal(missing.x,oldAnchor.x);assert.equal(missing.y,oldAnchor.y);
});

test('current native pins and host-proven same-content wrappers retain their native anchors and restore path',async t=>{
  const h=harness(t,'<button data-action="keep">기존 핀</button>'),anchor=freeze(point(h,'button'));
  for(const pin of [
    {id:'current',sourceArtifactHash:currentHash,anchor},
    {id:'wrapper',sourceArtifactHash:oldHash,sameContent:true,anchor},
    {id:'without-source',anchor}
  ]){
    const value=freeze(pin),result=h.send('pins',[value]).projected.payload[0];
    assert.equal(result.anchor,anchor);
    h.send('restore',freeze({...anchor,sourceArtifactHash:pin.sourceArtifactHash,sameContent:pin.sameContent}));
    await until(()=>h.w.document.querySelector('.r3-pin'),'current/native pins must stay visible');
  }
  assert.equal(h.root.querySelector('button'),h.w.document.activeElement);
});

test('only the current parent envelope can populate or project sources, and identity changes invalidate cached DOM',t=>{
  const h=harness(t,'<div class="box"><button data-action="save">저장</button></div>');
  const expected=point(h,'button'),html='<main id="order-single"><section><button data-action="save">저장</button></section></main>';
  let parses=0;const parse=h.w.DOMParser.prototype.parseFromString;
  h.w.DOMParser.prototype.parseFromString=function(...args){parses++;return parse.apply(this,args);};
  for(const [overrides,source] of [[{},{}],[{scope:'wrong'},h.parent],[{channel:'old'},h.parent],[{artifact:oldHash},h.parent]]){
    h.send('pin-sources',[{artifactHash:'legacy',html}],overrides,source);
  }
  assert.equal(parses,0);
  const legacy={path:'section:nth-of-type(1) > button:nth-of-type(1)',tag:'button',label:'원본 / 버튼',x:.4,y:.6};
  h.send('pin-sources',[{artifactHash:'legacy',html}]);
  assert.equal(parses,1);
  const input=()=>({id:'legacy',legacyAnchor:legacy,sourceArtifactHash:'legacy',anchor:placeholder(h)});
  assert.equal(h.send('pins',[input()]).projected.payload[0].anchor.id,expected.id);
  h.root.dispatchEvent(new h.w.CustomEvent('r3-motion-identity-reset'));
  h.session.channel='22222222-2222-4222-8222-222222222222';h.session.artifact='c'.repeat(64);h.session.state='other';
  assert.equal(h.send('pins',[input()]).projected.payload[0].anchor.id,'legacy-missing');
  h.send('pin-sources',[{artifactHash:'legacy',html}]);
  assert.equal(parses,2);
  assert.equal(h.send('pins',[input()]).projected.payload[0].anchor.id,expected.id);
  h.w.__projection.dispose();
  const afterDispose=h.send('pins',[input()]);
  assert.equal(afterDispose.projected,afterDispose.data);
});

test('root anchors require the same source structure and oversized source HTML is not parsed',t=>{
  const h=harness(t,'<div class="root-content">원래</div>');
  const rootAnchor={...placeholder(h,'screen'),x:.12,y:.78};
  h.send('pin-sources',[{artifactHash:oldHash,html:h.html}]);
  assert.equal(h.send('pins',[{id:'root',anchor:rootAnchor,sourceArtifactHash:oldHash}]).projected.payload[0].anchor.id,'screen');
  const differentHash='d'.repeat(64);
  h.send('pin-sources',[{artifactHash:differentHash,html:'<main id="order-single"><div class="root-content">다름</div></main>'}]);
  const rejected=h.send('pins',[{id:'root-old',anchor:rootAnchor,sourceArtifactHash:differentHash}]).projected.payload[0].anchor;
  assert.equal(rejected.id,'pin-unmapped:screen');
  let parses=0;const parse=h.w.DOMParser.prototype.parseFromString;
  h.w.DOMParser.prototype.parseFromString=function(...args){parses++;return parse.apply(this,args);};
  h.send('pin-sources',[{artifactHash:'e'.repeat(64),html:'가'.repeat(3*1024*1024)}]);
  assert.equal(parses,0,'8 MiB applies to UTF-8 bytes, not only UTF-16 length');
});

test('a DOM replacement cannot reuse a prior label projection and scroll paths never fall back to page ratios',t=>{
  const h=harness(t,'<div class="old"><button data-action="old">수정</button></div>');
  const legacy={path:'div:nth-of-type(1) > button:nth-of-type(1)',tag:'button',label:'수정',x:.42,y:.31,pageX:.9,pageY:.9,contentHeight:2000,height:40};
  const first=h.send('pins',[{id:'old',anchor:placeholder(h),legacyAnchor:legacy}]).projected.payload[0].anchor;
  assert.notEqual(first.id,'legacy-missing');
  h.root.innerHTML='<div class="new"><button data-action="new">새 작업</button></div>';
  const second=h.send('pins',[{id:'old',anchor:placeholder(h),legacyAnchor:legacy}]).projected.payload[0].anchor;
  assert.equal(second.id,'legacy-missing');
  assert.deepEqual(plain(second.scroll),[]);
});

test('a renamed label follows its uniquely mapped control rather than a generated id suffix or row order',t=>{
  const old=harness(t,'<section class="old"><label for="qa-business-number-50">예전 사업자 번호</label><input id="qa-business-number-50" name="businessNumber"><label for="qa-owner-name-52">성함</label><input id="qa-owner-name-52" name="ownerName"></section>',{artifact:oldHash});
  const h=harness(t,'<article class="new"><input id="owner-new-305" name="ownerName"><label for="owner-new-305">대표자 성함</label><label for="business-new-304">사업자등록번호</label><input id="business-new-304" name="businessNumber"></article>');
  const expected=point(h,'label[for=business-new-304]');
  const legacy={path:'section:nth-of-type(1) > label:nth-of-type(1)',tag:'label',label:'사업자 정보·검증 / 입력란',x:.2,y:.8,scrollTop:0};
  h.send('pin-sources',[{artifactHash:'legacy',html:old.html}]);
  const projected=h.send('pins',[{id:'label-comment',legacyAnchor:legacy,sourceArtifactHash:'legacy',anchor:placeholder(h)}]).projected.payload[0].anchor;
  assert.equal(projected.id,expected.id);
  assert.equal(projected.x,.2);assert.equal(projected.y,.8);
  assert.notEqual(projected.id,point(h,'label[for=owner-new-305]').id);
});

test('duplicate original targets use QA-only geometry proxies without changing product ids, classes or coordinates',async t=>{
  const body='<section><div class="scroll"><button>하나</button></div><div class="scroll"><button>둘</button></div></section>';
  const h=harness(t,body),target=h.root.querySelector('button'),container=target.parentElement;
  const product=[...h.root.querySelectorAll('*')].map(el=>[el,el.outerHTML]);
  const legacy={path:'section:nth-of-type(1) > div:nth-of-type(1) > button:nth-of-type(1)',tag:'button',label:'동일 원본 / 버튼',x:.25,y:.75,scrollTop:0,nestedScroll:[{path:'section:nth-of-type(1) > div:nth-of-type(1)',top:77,left:9}]};
  const original=freeze({id:'duplicate',previous:true,ordinal:12,anchor:placeholder(h),legacyAnchor:legacy,sourceArtifactHash:'legacy'});
  h.send('pin-sources',[{artifactHash:'legacy',sourceHash:currentHash,html:h.html}]);
  const projected=h.send('pins',[original]).projected.payload[0].anchor;
  assert.notEqual(projected.id,'legacy-missing');
  const proxies=[...h.root.querySelectorAll('[data-order-pin-proxy]')];
  assert.equal(proxies.length,2,'one proxy for the target and one for the scroll container');
  assert.ok(proxies.every(proxy=>proxy.hidden&&proxy.getAttribute('aria-hidden')==='true'&&proxy.style.pointerEvents==='none'));
  for(const [el,html] of product)assert.equal(el.outerHTML,html);
  assert.equal(projected.x,.25);assert.equal(projected.y,.75);
  await until(()=>h.w.document.querySelector('.r3-pin.is-previous'),'frozen controller must index the duplicate target proxy before paint');
  let marker=h.w.document.querySelector('.r3-pin');
  assert.equal(parseFloat(marker.style.left),50);assert.equal(parseFloat(marker.style.top),70);
  target.getBoundingClientRect=()=>({left:60,top:80,x:60,y:80,width:200,height:100,right:260,bottom:180});
  h.w.dispatchEvent(new h.w.Event('resize'));
  await until(()=>parseFloat(h.w.document.querySelector('.r3-pin')?.style.left)===110,'proxy follows actual resized/scrolled geometry');
  marker=h.w.document.querySelector('.r3-pin');assert.equal(parseFloat(marker.style.top),155);
  h.send('restore',{...placeholder(h),legacyAnchor:legacy,sourceArtifactHash:'legacy'});
  assert.equal(h.w.document.activeElement,target);
  assert.ok(h.scrolls.some(item=>item.el===container&&item.x===9&&item.y===77));
  const picked=point(h,target);
  assert.notEqual(picked.id,projected.id,'the real product target remains the picker hit target');
  assert.ok(!projected.scroll.some(entry=>entry.id===picked.id&&entry.id!=='document'));
  h.send('pins',[]);
  assert.equal(h.root.querySelectorAll('[data-order-pin-proxy]').length,0,'unused proxies are removed on the next pin list');
});

test('late DOM insertion requests one host resync and becomes visible without a manual second pins message',async t=>{
  const h=harness(t,'<div class="holder"></div>');
  const rawPins=freeze([{id:'late',previous:true,anchor:placeholder(h),legacyAnchor:{path:'div:nth-of-type(1) > button:nth-of-type(1)',tag:'button',label:'나중에 나타나는 버튼',x:.2,y:.4}}]);
  h.send('pins',rawPins);
  let resyncs=0;const post=h.parent.postMessage;
  h.parent.postMessage=message=>{
    post(message);
    if(message.type==='pinProjectionChanged'){
      assert.equal(message.channel,h.session.channel);assert.equal(message.artifact,h.session.artifact);
      resyncs++;queueMicrotask(()=>h.send('pins',rawPins));
    }
  };
  h.root.querySelector('.holder').innerHTML='<button data-action="late">나중에 나타나는 버튼</button><p>지연 모달 본문</p>';
  await until(()=>h.w.document.querySelector('.r3-pin'),'the host resends raw pins after the projection change request');
  assert.equal(resyncs,1);
  h.root.querySelector('p').append(h.w.document.createElement('span'));
  await Promise.resolve();
  h.w.__projection.dispose();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(resyncs,1,'dispose cancels a pending projection-change animation frame');
});




// Exact legacy position fields for the 20 duplicate-fingerprint records. No comment text or author data.
const duplicateOriginalAnchors=[{"sourceKey":"passes/deck/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(3) > article:nth-of-type(2)","tag":"article","label":"오더 패스 / 선택 영역","x":0.6560509554140127,"y":0.3547348484848485,"pageX":0.6256410256410256,"pageY":0.4466824644549763,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":330}},{"sourceKey":"passes/deck/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(3) > article:nth-of-type(3)","tag":"article","label":"오더 패스 / 선택 영역","x":0.9716497627135846,"y":0.6093823849850137,"pageX":0.8589743589743589,"pageY":0.5770142180094787,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":330}},{"sourceKey":"passes/grid/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(3) > article:nth-of-type(1)","tag":"article","label":"오더 패스 / 선택 영역","x":0.8333333333333334,"y":0.080078125,"pageX":0.41410256410256413,"pageY":0.299348328778642,"contentHeight":892,"scrollTop":0,"nestedScroll":[],"height":288}},{"sourceKey":"q1/edit/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(1) > section:nth-of-type(1) > fieldset:nth-of-type(2) > div:nth-of-type(1) > button:nth-of-type(2)","tag":"button","label":"Q1 계란 규격 / 버튼","x":0.5,"y":0.375,"pageX":0.33589743589743587,"pageY":0.39304683727667794,"contentHeight":1036,"scrollTop":100,"nestedScroll":[],"height":70}},{"sourceKey":"q1/edit/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(1) > section:nth-of-type(1) > fieldset:nth-of-type(2) > div:nth-of-type(1) > button:nth-of-type(1)","tag":"button","label":"Q1 계란 규격 / 버튼","x":0.4827586206896552,"y":0.2916666666666667,"pageX":0.16923076923076924,"pageY":0.3872525350072429,"contentHeight":1036,"scrollTop":100,"nestedScroll":[],"height":70}},{"sourceKey":"q3/closed/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1) > button:nth-of-type(1)","tag":"button","label":"Q3 납품받을 사업장 / 버튼","x":0.45454545454545453,"y":0.5391035548686244,"pageX":0.4641025641025641,"pageY":0.4465496213517883,"contentHeight":1102,"scrollTop":258,"nestedScroll":[],"height":101}},{"sourceKey":"q3/open/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1)","tag":"article","label":"Q3 납품받을 사업장 / 선택 영역","x":0.7597402597402597,"y":0.21331153905092712,"pageX":0.7051282051282052,"pageY":0.352254888660633,"contentHeight":1612,"scrollTop":400,"nestedScroll":[],"height":612}},{"sourceKey":"q3/open/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1)","tag":"article","label":"Q3 납품받을 사업장 / 선택 영역","x":0.37337662337662336,"y":0.3211932369617408,"pageX":0.4,"pageY":0.3931859144557065,"contentHeight":1612,"scrollTop":400,"nestedScroll":[],"height":612}},{"sourceKey":"q3/open/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1)","tag":"article","label":"Q3 납품받을 사업장 / 선택 영역","x":0.8571428571428571,"y":0.31792409460080706,"pageX":0.782051282051282,"pageY":0.39194558034070426,"contentHeight":1612,"scrollTop":400,"nestedScroll":[],"height":612}},{"sourceKey":"q3/open/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1) > button:nth-of-type(1)","tag":"button","label":"Q3 납품받을 사업장 / 버튼","x":0.11363636363636363,"y":0.6083462132921175,"pageX":0.19487179487179487,"pageY":0.30946336169305605,"contentHeight":1612,"scrollTop":300,"nestedScroll":[],"height":101}},{"sourceKey":"q3/open/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1) > div:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(1) > div:nth-of-type(1) > p:nth-of-type(1)","tag":"p","label":"Q3 납품받을 사업장 / 선택 영역","x":0.4347272341328805,"y":0,"pageX":0.18717948717948718,"pageY":0.4837303048508692,"contentHeight":1612,"scrollTop":500,"nestedScroll":[],"height":18}},{"sourceKey":"q3/open/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1)","tag":"article","label":"Q3 납품받을 사업장 / 선택 영역","x":0.37012987012987014,"y":0.20186954078765898,"pageX":0.3974358974358974,"pageY":0.34791371925812514,"contentHeight":1612,"scrollTop":300,"nestedScroll":[],"height":612}},{"sourceKey":"q4/closed/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > article:nth-of-type(1) > button:nth-of-type(1)","tag":"button","label":"Q4 주문 방식 / 버튼","x":0.42857142857142855,"y":0.5489953632148377,"pageX":0.44358974358974357,"pageY":0.5385007649158593,"contentHeight":1042,"scrollTop":198,"nestedScroll":[],"height":101}},{"sourceKey":"search/empty/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1)","tag":"button","label":"견적 검색·태그 / 버튼","x":0.868421052631579,"y":0.472406914893617,"pageX":0.823076923076923,"pageY":0.4146919431279621,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":93}},{"sourceKey":"search/empty/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1)","tag":"button","label":"견적 검색·태그 / 버튼","x":0.16666666666666666,"y":0.6319813829787234,"pageX":0.2076923076923077,"pageY":0.4324644549763033,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":93}},{"sourceKey":"search/suggestions/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > button:nth-of-type(1)","tag":"button","label":"견적 검색·태그 / 버튼","x":0.05379746835443038,"y":0.5078659370725034,"pageX":0.12564102564102564,"pageY":0.3222748815165877,"contentHeight":844,"scrollTop":0,"nestedScroll":[{"path":"div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2)","top":9,"left":0},{"path":"div:nth-of-type(1) > div:nth-of-type(2)","top":0,"left":0}],"height":46}},{"sourceKey":"signup/empty/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > form:nth-of-type(1) > div:nth-of-type(2) > label:nth-of-type(2)","tag":"label","label":"회원가입 / 선택 영역","x":0.419106367456665,"y":0.48184782008067634,"pageX":0.42905974331901797,"pageY":0.8445550048767054,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":41}},{"sourceKey":"signup/filled/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > form:nth-of-type(1) > div:nth-of-type(2) > label:nth-of-type(1)","tag":"label","label":"회원가입 / 선택 영역","x":0.6442434054375472,"y":0.369788335314439,"pageX":0.6264956253055181,"pageY":0.7793885955746402,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":56}},{"sourceKey":"signup/terms/email/390","anchor":{"path":"div:nth-of-type(1) > section:nth-of-type(1) > form:nth-of-type(1) > div:nth-of-type(2) > label:nth-of-type(2)","tag":"label","label":"회원가입 / 선택 영역","x":0.39766081871345027,"y":0.5365853658536586,"pageX":0.41025641025641024,"pageY":0.8471563981042654,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":41}},{"sourceKey":"terms/missing/email/390","anchor":{"path":"div:nth-of-type(1) > div:nth-of-type(2) > button:nth-of-type(1)","tag":"button","label":"약관·동의 / 버튼","x":0.46937014667817084,"y":0.45805921052631576,"pageX":0.20256410256410257,"pageY":0.278436018957346,"contentHeight":844,"scrollTop":0,"nestedScroll":[],"height":38}}];

test('all 20 recorded duplicate-fingerprint legacy anchors appear and restore on their original artifact',async t=>{
  for(const [i,fixture] of duplicateOriginalAnchors.entries()){
    const [screen,state,variant,rawWidth]=fixture.sourceKey.split('/'),width=Number(rawWidth);
    const query=new URLSearchParams({id:[screen,state,variant].join('/'),width:String(width),version:'previous'});
    const response=await serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+query));
    assert.equal(response.status,200,fixture.sourceKey);
    const source=await response.json();
    const h=harness(t,'',{documentHTML:source.html,frameScript:source.replayFrame||frameCode,screen,state,variant,artifact:source.hash,version:source.version});
    const legacy=freeze(fixture.anchor),original=JSON.stringify(legacy);
    h.send('pin-sources',[{artifactHash:'legacy',sourceHash:source.hash,html:source.html}]);
    const projected=h.send('pins',[{id:'legacy-duplicate-'+i,previous:true,anchor:placeholder(h),legacyAnchor:legacy,sourceArtifactHash:'legacy'}]).projected.payload[0].anchor;
    assert.notEqual(projected.id,'legacy-missing',fixture.sourceKey+' '+legacy.path);
    assert.equal(projected.x,legacy.x);assert.equal(projected.y,legacy.y);
    await until(()=>h.w.document.querySelector('.r3-pin'),fixture.sourceKey+' original pin must paint');
    const restored=h.send('restore',{...placeholder(h),legacyAnchor:legacy,sourceArtifactHash:'legacy'}).projected.payload;
    assert.equal(restored.id,projected.id,fixture.sourceKey+' restore must use the same exact target');
    assert.equal(JSON.stringify(legacy),original);
    h.w.close();
  }
});

test('motion completion coalesces a final geometry resync while preserving the frozen attribute-only identity index',async t=>{
  const h=harness(t,'<section class="modal"><button>첫 선택</button><button>두 번째 선택</button></section>');
  const target=h.root.querySelectorAll('button')[1];
  const legacy={path:'section:nth-of-type(1) > button:nth-of-type(2)',tag:'button',label:'모달 / 버튼',x:.25,y:.75,scrollTop:0,nestedScroll:[]};
  const pins=freeze([{id:'settled-modal',previous:true,legacyAnchor:legacy,sourceArtifactHash:'legacy',anchor:placeholder(h)}]);
  h.send('pin-sources',[{artifactHash:'legacy',sourceHash:currentHash,html:h.html}]);
  const initial=h.send('pins',pins).projected.payload[0].anchor.id;
  await until(()=>h.w.document.querySelector('.r3-pin'),'initial modal pin');
  await new Promise(resolve=>setTimeout(resolve,30));
  let resyncs=0,lastId=null;const post=h.parent.postMessage;
  h.parent.postMessage=message=>{
    post(message);
    if(message.type==='pinProjectionChanged'){
      resyncs++;assert.equal(message.channel,h.session.channel);assert.equal(message.artifact,h.session.artifact);
      queueMicrotask(()=>{lastId=h.send('pins',pins).projected.payload[0].anchor.id;});
    }
  };
  target.classList.add('settled');
  target.getBoundingClientRect=()=>({left:60,top:80,x:60,y:80,width:200,height:100,right:260,bottom:180});
  for(const type of ['animationend','animationcancel','transitionend','transitioncancel'])target.dispatchEvent(new h.w.Event(type,{bubbles:true}));
  await until(()=>parseFloat(h.w.document.querySelector('.r3-pin')?.style.left)===110,'settled animation repaints the final actual target geometry');
  assert.equal(parseFloat(h.w.document.querySelector('.r3-pin').style.top),155);
  assert.equal(lastId,initial,'a class-only motion change must not reindex ahead of the frozen controller');
  assert.equal(resyncs,1,'completion/cancel events in one animation frame share one notification');
});

test('motion resync ignores inactive/outside/stale-session events and cancels queued work on disposal',async t=>{
  const h=harness(t,'<button data-action="motion">동작</button>');
  let notifications=0;const post=h.parent.postMessage;
  h.parent.postMessage=message=>{post(message);if(message.type==='pinProjectionChanged')notifications++;};
  h.root.querySelector('button').dispatchEvent(new h.w.Event('animationend',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(notifications,0,'no active pins');
  const anchor=point(h,'button');
  h.send('pins',[{id:'motion-pin',anchor,sourceArtifactHash:currentHash}]);
  h.w.document.body.dispatchEvent(new h.w.Event('animationend',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(notifications,0,'outside review root');
  h.root.querySelector('button').dispatchEvent(new h.w.Event('transitionend',{bubbles:true}));
  h.session.channel='33333333-3333-4333-8333-333333333333';
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(notifications,0,'queued work belongs to the prior session');
  h.send('pins',[{id:'new-motion-pin',anchor,sourceArtifactHash:currentHash}]);
  h.root.querySelector('button').dispatchEvent(new h.w.Event('transitioncancel',{bubbles:true}));
  h.w.__projection.dispose();
  await new Promise(resolve=>setTimeout(resolve,25));assert.equal(notifications,0,'dispose cancels queued animation-frame work');
});
