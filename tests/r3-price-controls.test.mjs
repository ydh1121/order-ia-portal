import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate){
  for(let n=0;n<120;n++){if(predicate())return;await tick();}
  assert.ok(predicate(),'the rendered price operation settles');
}

test('practice roles and initialization cannot change while a desk operation is pending',async()=>{
  const dom=new JSDOM(renderR3PricePage('price-controls-fixture'),{
    url:'https://order-ia-portal.pages.dev/ia?view=pricing-r3&practice=1',
    runScripts:'outside-only',pretendToBeVisual:true
  });
  const w=dom.window,$=id=>w.document.getElementById(id),calls=[];
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  let release;
  w.fetch=async(raw)=>{
    const url=String(raw);calls.push(url);
    if(url.endsWith('/session')||url==='/api/ia/auth/me')return Response.json({csrf:'fixture-only',practiceAllowed:true,expiresAt:Date.now()+1800000});
    if(url.endsWith('/desk')){
      await new Promise(resolve=>{release=resolve;});
      return Response.json({scopes:[],versions:[],freightPack:null});
    }
    if(url.endsWith('/sites'))return Response.json({sites:url.includes('/buyer/')?[{org_id:'fixture-org',site_id:'fixture-site',verification:'VERIFIED'}]:[]});
    throw Error('Unexpected fixture request: '+url);
  };
  try{
    for(const script of w.document.scripts)w.eval(script.textContent);
    await until(()=>release);
    assert.ok($('persona').matches(':disabled'),'role selection waits for the initial supplier desk');
    assert.ok($('startPractice').matches(':disabled'),'practice initialization cannot race with loading');
    assert.ok($('practiceSample').matches(':disabled'),'sample insertion cannot race with loading');
    release();await until(()=>!$('persona').matches(':disabled'));
    assert.equal($('buyerSite').options.length,1);
    release=null;$('persona').value='buyer';$('persona').dispatchEvent(new w.Event('change',{bubbles:true}));
    await until(()=>release);
    assert.ok($('persona').matches(':disabled'),'a role transition locks further transitions until its data is ready');
    release();await until(()=>!$('persona').matches(':disabled'));
    assert.equal($('persona').value,'buyer');
    assert.equal($('buyerSite').options.length,2);
    assert.match($('buyerSite').options[1].textContent,/fixture-site/);
    assert.deepEqual(calls.filter(url=>url.endsWith('/sites')),['/api/ia/r3-price/practice/supplier/sites','/api/ia/r3-price/practice/buyer/sites']);
  }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}
});
