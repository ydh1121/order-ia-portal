/** Serialized into the trusted QA host. It reads private DOM only for an
 * explicit download, after the host acknowledgement and live inspector agree.
 * No DOM, input value or CSS is uploaded; callers may audit the output hash. */
export function createResearchExportTools(){
  const hex=/^[a-f0-9]{64}$/,token=/^[a-zA-Z0-9_.-]{1,128}$/;
  const fail=code=>{throw Error(code);};
  const reviewMode=value=>value===undefined?'simple':value==='detailed'?'detailed':fail('RESEARCH_EXPORT_MODE_INVALID');
  const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(value=>value.toString(16).padStart(2,'0')).join('');
  function confirm({frame,expected,acknowledged,origin}){
    if(!expected||!acknowledged||!hex.test(expected.build||'')||!hex.test(expected.artifact||'')||!token.test(expected.channel||'')||!['screen','state','variant'].every(key=>token.test(expected[key]||''))||!Number.isInteger(expected.width)||expected.width<1||expected.width>10000||!['current','recorded'].includes(expected.version))fail('RESEARCH_EXPORT_IDENTITY_REQUIRED');
    for(const [key,other]of [['channel','channel'],['artifact','hash'],['build','application'],['width','width'],['version','version'],['screen','screen'],['state','state'],['variant','variant']])if(expected[key]!==acknowledged[other])fail('RESEARCH_EXPORT_NOT_ACKNOWLEDGED');
    const mode=reviewMode(expected.mode);if(mode!==reviewMode(acknowledged.mode))fail('RESEARCH_EXPORT_NOT_ACKNOWLEDGED');
    if(!frame?.isConnected||frame.inert)fail('RESEARCH_EXPORT_NOT_READY');
    let window,document;try{window=frame.contentWindow;document=frame.contentDocument;if(!window||!document||window.location.origin!==origin||document.defaultView!==window)fail('RESEARCH_EXPORT_ORIGIN');}catch{fail('RESEARCH_EXPORT_ORIGIN');}
    const roots=document.querySelectorAll('#order-single'),root=roots[0],snapshot=window.ORDER_RESEARCH_APP?.snapshot?.(),inspection=root?.__orderResearchInspector?.inspect?.();
    if(roots.length!==1||window.innerWidth!==expected.width||document.documentElement.dataset.productBuild!==expected.build||snapshot?.build!==expected.build||typeof snapshot.instance!=='string'||!inspection?.active||inspection.pendingRoute)fail('RESEARCH_EXPORT_NOT_READY');
    for(const key of ['screen','state','variant'])if(snapshot.route?.[key]!==expected[key]||inspection.session?.[key]!==expected[key])fail('RESEARCH_EXPORT_ROUTE_CHANGED');
    if(snapshot.route?.mode!==mode||reviewMode(inspection.session?.mode)!==mode)fail('RESEARCH_EXPORT_ROUTE_CHANGED');
    if(inspection.session.channel!==expected.channel||inspection.session.artifact!==expected.artifact||inspection.session.viewport!==expected.width||inspection.session.version!==expected.version)fail('RESEARCH_EXPORT_SESSION_CHANGED');
    return {window,document,root,snapshot,instance:snapshot.instance};
  }
  const safeData=value=>/^data:(?:image\/(?:png|gif|jpe?g|webp|avif|svg\+xml)|font\/[\w.+-]+|application\/(?:font-[\w-]+|x-font-[\w-]+|vnd\.ms-fontobject))[;,]/i.test(value);
  const secret=/(?:password|passwd|passphrase|csrf|xsrf|token|secret|api[-_]?key|(?:^|[\s_:.-])(?:auth|session)(?:$|[\s_:.-])|one-time-code)/i;
  // Keep inline resources and SVG fragment references. A captured stylesheet
  // cannot reconnect to a network URL when the file is opened offline.
  function offlineCss(text){
    let output='',index=0,quote='',comment=false;
    while(index<text.length){
      const char=text[index],next=text[index+1];
      if(comment){output+=char;index++;if(char==='*'&&next==='/'){output+='/';index++;comment=false;}continue;}
      if(quote){output+=char;index++;if(char==='\\'&&index<text.length)output+=text[index++];else if(char===quote)quote='';continue;}
      if(char==='/'&&next==='*'){output+='/*';index+=2;comment=true;continue;}
      if(char==='"'||char==="'"){quote=char;output+=char;index++;continue;}
      const found=/^url\s*\(/i.exec(text.slice(index));
      if(found&&(index===0||!/[\w-]/.test(text[index-1]))){
        const start=index;index+=found[0].length;const from=index;let depth=1,inner='';
        while(index<text.length&&depth){const current=text[index++];if(current==='\\'){index++;continue;}if(inner){if(current===inner)inner='';}else if(current==='"'||current==="'")inner=current;else if(current==='(')depth++;else if(current===')')depth--;}
        if(depth)fail('RESEARCH_EXPORT_CSS_INVALID');
        const raw=text.slice(from,index-1).trim(),value=/^["']/.test(raw)?raw.slice(1,-1):raw;
        output+=value.startsWith('#')||safeData(value)?text.slice(start,index):'url("data:,")';continue;
      }
      output+=char;index++;
    }
    return output.replace(/<\/style/gi,'<\\/style');
  }
  function styles(live){
    const {document,window}=live,seen=new Set(),nodes=[...document.querySelectorAll('style,link[rel=stylesheet]')];let count=0;
    const enabled=condition=>!condition||condition==='all'||window.matchMedia(condition).matches;
    const media=(text,condition)=>condition&&condition!=='all'?'@media '+(enabled(condition)?'all':'not all')+'{'+text+'}':text;
    function sheet(value){
      if(seen.has(value))return '';seen.add(value);
      const owner=value.ownerNode||nodes.find(node=>node.sheet===value);
      if(value.disabled||owner?.hasAttribute('data-research-inspector'))return '';
      if(value.href&&new URL(value.href,document.baseURI).origin!==window.location.origin)return '';
      let rules;try{rules=[...value.cssRules];}catch{fail('RESEARCH_EXPORT_CSS_UNAVAILABLE');}
      count++;return media(rules.map(rule).join('\n'),value.media?.mediaText);
    }
    function rule(value){
      if(value.type===3){if(!value.styleSheet)fail('RESEARCH_EXPORT_CSS_UNAVAILABLE');const body=sheet(value.styleSheet);return media(body,value.media?.mediaText);}
      if(value.type===4)return '@media '+(enabled(value.conditionText||value.media?.mediaText)?'all':'not all')+'{'+[...value.cssRules].map(rule).join('\n')+'}';
      if(value.cssRules){const text=value.cssText,at=text.indexOf('{');return offlineCss(text.slice(0,at+1))+[...value.cssRules].map(rule).join('\n')+'}';}
      return offlineCss(value.cssText);
    }
    const css=[...document.styleSheets].map(sheet).filter(Boolean).join('\n');
    if(!count)fail('RESEARCH_EXPORT_CSS_UNAVAILABLE');return {css,count};
  }
  function cloneRoot(live){
    const {root,window,document}=live,clone=root.cloneNode(true),original=[root,...root.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
    const layout=['display','position','inset','top','right','bottom','left','width','height','max-width','max-height','margin','padding','box-sizing','gap','row-gap','column-gap','grid-template-columns','grid-template-rows','flex-direction','flex-wrap','align-items','justify-content','transform','opacity','z-index'];
    const freeze=(from,to)=>{const style=window.getComputedStyle(from);for(const key of layout){const value=style.getPropertyValue(key);if(value)to.style.setProperty(key,offlineCss(value));}};
    for(let index=0;index<original.length;index++){
      const from=original[index],to=copies[index],tag=from.localName;
      const sensitive=secret.test([from.getAttribute('name'),from.id,from.getAttribute('autocomplete')].filter(Boolean).join(' '));
      if(tag==='input'){
        if(from.type==='hidden'){to.remove();continue;}
        if(from.type==='password'||sensitive){to.setAttribute('value','');to.setAttribute('type','text');to.setAttribute('placeholder','비공개 입력');to.dataset.exportMasked='secret';}
        else if(from.type==='file'){to.removeAttribute('value');to.setAttribute('disabled','');}
        else to.setAttribute('value',from.value);
        to.toggleAttribute('checked',from.checked);to.setAttribute('readonly','');
        if(from.indeterminate)to.dataset.exportIndeterminate='true';
      }else if(tag==='textarea'){to.textContent=sensitive?'':from.value;to.setAttribute('readonly','');}
      else if(tag==='select'&&sensitive){to.replaceChildren();to.dataset.exportMasked='secret';}
      else if(tag==='option')to.toggleAttribute('selected',from.selected);
      else if(tag==='details'||tag==='dialog'){to.toggleAttribute('open',from.open);if(tag==='dialog'&&from.open)freeze(from,to);}
      if(tag==='canvas'){
        const image=document.createElement('img');for(const attribute of to.attributes)image.setAttribute(attribute.name,attribute.value);
        try{image.src=from.toDataURL('image/png');}catch{fail('RESEARCH_EXPORT_CANVAS_UNAVAILABLE');}image.width=from.width;image.height=from.height;to.replaceWith(image);continue;
      }
      if(tag==='img'){
        const source=from.currentSrc||from.getAttribute('src')||'';to.removeAttribute('srcset');to.removeAttribute('sizes');
        if(safeData(source))to.setAttribute('src',source);
        else if(source){
          if(new URL(source,document.baseURI).origin!==window.location.origin||!from.complete||!from.naturalWidth)fail('RESEARCH_EXPORT_IMAGE_UNAVAILABLE');
          const canvas=document.createElement('canvas');canvas.width=from.naturalWidth;canvas.height=from.naturalHeight;
          try{canvas.getContext('2d').drawImage(from,0,0);to.setAttribute('src',canvas.toDataURL('image/png'));}catch{fail('RESEARCH_EXPORT_IMAGE_UNAVAILABLE');}
        }
      }
    }
    clone.querySelectorAll('script,iframe,frame,object,embed,link,base,meta,style,source,audio,video,noscript,template,foreignObject,animate,animateTransform,set,#r3-veil,#r3-pins,.r3-pin,.approval-draft-pin,[data-research-inspector]').forEach(node=>node.remove());
    for(const element of [clone,...clone.querySelectorAll('*')]){
      for(const attribute of [...element.attributes]){
        const name=attribute.name.toLowerCase(),value=attribute.value;
        if(/^on/.test(name)||/^data-/.test(name)&&secret.test(name)||['srcdoc','action','formaction','method','form','target','ping','nonce','autofocus','contenteditable','manifest','poster','background','srcset'].includes(name))element.removeAttribute(attribute.name);
        else if(name==='href'||name==='xlink:href'){if(!value.startsWith('#')&&!(element.namespaceURI==='http://www.w3.org/2000/svg'&&safeData(value)))element.removeAttribute(attribute.name);}
        else if(name==='src'&&!safeData(value))element.removeAttribute(attribute.name);
        else if(name==='style')element.setAttribute('style',offlineCss(value));
      }
      if(element.localName==='button')element.setAttribute('type','button');
    }
    for(const form of [...clone.querySelectorAll('form')]){const replacement=document.createElement('div');for(const attribute of form.attributes)replacement.setAttribute(attribute.name,attribute.value);replacement.dataset.exportForm='';replacement.append(...form.childNodes);const source=original[copies.indexOf(form)];if(source)freeze(source,replacement);form.replaceWith(replacement);}
    clone.setAttribute('inert','');clone.dataset.exportSnapshot='';return clone;
  }
  function metadata(live,expected,kind){return {format:kind,build:expected.build,artifactHash:expected.artifact,version:expected.version,
    route:{screen:expected.screen,state:expected.state,variant:expected.variant,mode:['simple','detailed'].includes(live.snapshot.route.mode)?live.snapshot.route.mode:'simple'},viewport:{width:expected.width,height:live.window.innerHeight},capturedAt:new Date().toISOString()};}
  function documentFor(live,title,data){
    const output=live.document.implementation.createHTMLDocument(title);output.documentElement.lang=live.document.documentElement.lang||'ko';
    for(const [from,to]of [[live.document.documentElement,output.documentElement],[live.document.body,output.body]])for(const name of ['class','dir','style']){const value=from.getAttribute(name);if(value!==null)to.setAttribute(name,name==='style'?offlineCss(value):value);}
    const meta=(name,content,http=false)=>{const node=output.createElement('meta');node.setAttribute(http?'http-equiv':'name',name);node.setAttribute('content',content);return node;};
    const charset=output.createElement('meta');charset.setAttribute('charset','utf-8');output.head.prepend(charset);
    output.head.append(meta('Content-Security-Policy',"default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'",true),meta('viewport','width='+data.viewport.width+',initial-scale=1'),meta('referrer','no-referrer'),meta('order-research-build',data.build),meta('order-research-artifact',data.artifactHash));
    const provenance=output.createElement('template');provenance.id='order-export-metadata';provenance.content.append(output.createTextNode(JSON.stringify(data)));output.head.append(provenance);return output;
  }
  async function finish(arguments_,live,output,data,suffix){
    const html='<!doctype html>\n'+output.documentElement.outerHTML,sha256=await sha(html),after=confirm(arguments_);
    if(after.root!==live.root||after.instance!==live.instance)fail('RESEARCH_EXPORT_APPLICATION_CHANGED');
    return {html,sha256,metadata:data,file:'ORDER_research_'+data.route.screen+'_'+data.route.state+'_'+(data.route.mode==='detailed'?'detailed_':'')+data.viewport.width+'_'+suffix+'.html'};
  }
  async function snapshot(arguments_){
    const live=confirm(arguments_),data=metadata(live,arguments_.expected,'order-research-static-snapshot/v1'),loaded=styles(live),root=cloneRoot(live),output=documentFor(live,'Order · 현재 화면',data);
    data.stylesheets=loaded.count;output.getElementById('order-export-metadata').content.textContent=JSON.stringify(data);
    const style=output.createElement('style');style.textContent=loaded.css+'\nhtml{min-width:'+data.viewport.width+'px}body{width:'+data.viewport.width+'px;max-width:none;margin:0 auto}#order-single{width:'+data.viewport.width+'px;max-width:'+data.viewport.width+'px}*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';output.head.append(style);output.body.append(output.importNode(root,true));
    return finish(arguments_,live,output,data,'snapshot');
  }
  async function link(arguments_){
    const live=confirm(arguments_),data=metadata(live,arguments_.expected,'order-research-execution-link/v1'),application=arguments_.application,url=new URL(application?.url||'',arguments_.origin);
    if(application?.build!==data.build||url.origin!==arguments_.origin||url.pathname!=='/ia'||url.searchParams.get('view')!=='research-r3'||url.searchParams.has('build')&&url.searchParams.get('build')!==data.build)fail('RESEARCH_EXPORT_APPLICATION_URL');
    if((url.searchParams.has('mode')?url.searchParams.get('mode'):'simple')!==data.route.mode)fail('RESEARCH_EXPORT_APPLICATION_URL');
    url.search=new URLSearchParams({view:'research-r3',build:data.build,...data.route});url.hash='';data.url=url.href;
    const output=documentFor(live,'Order · 연구본 실행 링크',data),style=output.createElement('style');style.textContent='body{max-width:560px;margin:64px auto;padding:24px;font:16px/1.7 system-ui,sans-serif;color:#182238}h1{font-size:24px}a{display:inline-block;padding:12px 20px;border-radius:12px;background:#315de6;color:white;text-decoration:none}';output.head.append(style);
    const title=output.createElement('h1');title.textContent='연구본 실행 링크';const description=output.createElement('p');description.textContent='검토한 연구 빌드를 엽니다. 인터넷 연결과 접근 권한이 필요합니다.';const action=output.createElement('a');action.textContent='연구본 열기';action.href=url.href;action.rel='noopener noreferrer';output.body.append(title,description,action);
    return finish(arguments_,live,output,data,'link');
  }
  return Object.freeze({snapshot,link});
}
