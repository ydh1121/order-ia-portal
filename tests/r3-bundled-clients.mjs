// Exercise the shipped serialization boundary after the same keepNames transform
// used by Wrangler. Native-source tests cannot reveal a missing __name closure.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const toolsRoot=resolve(process.env.R3_BUILD_TEST_TOOLS||'tests/build-tools');
const require=createRequire(join(toolsRoot,'package.json'));
const {build}=require('esbuild');
const {JSDOM}=require('jsdom');
const out=await mkdtemp(join(tmpdir(),'order-bundled-r3-'));
try {
  const output=join(out,'entry.mjs');
  await build({entryPoints:['tests/r3-bundled-entry.mjs'],outfile:output,bundle:true,
    platform:'browser',format:'esm',target:'es2022',keepNames:true,logLevel:'silent'});
  const built=await readFile(output,'utf8');
  assert.match(built,/__name\(/,'regression fixture must include Wrangler-style preserved names');
  const pages=await import(pathToFileURL(output));
  const failures=[];
  for (const [view,render] of [['qa-lab',pages.renderR3Qa],['pricing-r3',pages.renderR3PricePage],['pricing-workspace',pages.renderPriceWorkspace],['roles-r3',pages.renderR3RolePage]]) {
    const dom=new JSDOM(render('0123456789abcdef0123456789abcdef'),{
      url:'https://qa-test.order-ia-portal.pages.dev/ia?view='+view,
      runScripts:'outside-only',pretendToBeVisual:true
    });
    const {window}=dom,requests=[];
    window.fetch=url=>{requests.push(String(url));return new Promise(()=>{});};
    window.TextEncoder=TextEncoder;window.TextDecoder=TextDecoder;
    window.ResizeObserver=class {observe(){} disconnect(){}};
    window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    const scripts=[...window.document.scripts].filter(s=>s.type!=='application/json');
    try {
      for(const script of scripts)window.eval(script.textContent.replace('import "/ia/r3-product/web/common-ui.mjs";',''));
      if(view==='qa-lab') {
        assert.ok(requests.includes('/api/ia/r3-qa/artifact'),'QA reaches the artifact catalog request');
        assert.ok(requests.includes('/api/ia/auth/me'),'QA reaches authenticated initialization');
      }else if(view==='pricing-r3') {
        assert.ok(window.document.querySelectorAll('[data-field]').length>=10,'price editor mounts editable fields');
      }else if(view==='pricing-workspace') {
        assert.ok(requests.includes('/api/ia/r3-price/session'),'workspace reaches its authenticated session request');
        assert.ok(window.document.querySelector('#pw-main'),'workspace mounts its reusable editing surface');
      }else {
        assert.ok(window.document.querySelector('#r3-practice button'),'role practice controls mount');
      }
      assert.equal('__name' in window,false,'bundle helper stays private to each serialized function');
      console.log('PASS bundled bootstrap '+view);
    }catch(error){failures.push(view+': '+error.message);console.error('FAIL bundled bootstrap '+view+': '+error.message);}
    finally{window.close();}
  }
  assert.deepEqual(failures,[],'every bundled client must finish synchronous initialization');
}finally{await rm(out,{recursive:true,force:true});}
