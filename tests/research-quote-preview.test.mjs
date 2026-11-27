import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {quoteLockMarkup} from '../src/server/research-app/quote-preview.mjs';
import {researchScene,serveResearchAsset,researchAssetBase} from '../src/server/research-app/page.mjs';

const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
function graph(markup){
  const fragment=JSDOM.fragment(markup),svg=fragment.querySelector('.oq-lock-graph');
  assert.equal(svg.getAttribute('aria-hidden'),'true');
  assert.deepEqual([...svg.children].map(child=>child.localName),['rect','rect','path','path']);
  assert.equal(svg.textContent.trim(),'');
  return svg.outerHTML;
}

test('all guest/member and comparison outcomes paint exactly the same fixed shapes',()=>{
  const illustration=graph(quoteLockMarkup('guest'));
  for(const audience of ['guest','unverified'])for(const confirmedSaving of [true,false]){
    const markup=quoteLockMarkup(audience,confirmedSaving);
    assert.equal(graph(markup),illustration);
    assert.match(markup,audience==='guest'?/사업장 회원가입/:/사업장 인증하기/);
    assert.match(markup,/상담 예약/);
    if(confirmedSaving)assert.match(markup,/최저가를 찾았어요!/);
    else assert.doesNotMatch(markup,/최저가|절감/);
  }
});

test('locked route HTML and its entire dedicated runtime take no quote values or fixture payload',async()=>{
  for(const [state,audience,action] of [['locked','unverified','verify'],['locked-guest','guest','signup']]){
    const result=await researchScene('quote-result',state);
    assert.equal(result.row.state,state);
    assert.equal(result.family,'researchQuoteLock');
    const entry=await (await serveResearchAsset(researchAssetBase+'scene/quote-result/'+state+'/email.mjs')).text();
    const runtime=await (await serveResearchAsset(researchAssetBase+'runtime/'+result.family+'.mjs')).text();
    assert.match(entry,/runtime\/researchQuoteLock\.mjs/);
    const publicResponse=[entry,runtime,result.html,result.mount].join('\n');
    assert.doesNotMatch(publicResponse,/reviewQuoteFixture|projectBuyerResult|currentRatio|proposedRatio|annualCount|annualSaving|quoteProvider|12540000|11,940,000|\bfetch\s*\(/);
    assert.equal(graph(result.html),graph(quoteLockMarkup('guest')));
    const dom=new JSDOM('<main>'+result.html+'</main>',{runScripts:'outside-only'});
    try{
      const {window}=dom,host=window.document.querySelector('main'),calls=[];
      window.eval(result.mount);
      const dispose=window.ORDER_DESIGN_MODULES[0].mount(host,state,{reviewScenario:true,select(...args){calls.push(args);}});
      assert.equal(host.querySelector('.oq-lock').dataset.state,audience);
      assert.match(host.textContent,/최저가를 찾았어요!/);
      host.querySelector('[data-action='+action+']').click();host.querySelector('[data-action=consult]').click();
      assert.deepEqual(calls,[[action==='signup'?'signup':'business','empty'],['role-consult','']]);
      dispose();
    }finally{dom.window.close();}
  }
});
