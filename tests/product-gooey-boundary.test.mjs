import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {installProductUiRegistry} from '../src/server/product-ui/bootstrap.mjs';
import {installProductAdminMotion} from '../src/server/product-admin-motion.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');

test('one Gooey page menu opens actual consultation, account and notifications; embedded panels do not duplicate it',()=>{
 const dom=new JSDOM('<main id="page"><div class="obm-brand" data-authenticated="true"></div><section class="product-panel-body"></section><section class="product-auth-sheet"></section></main>',{pretendToBeVisual:true});
 const win=dom.window,root=win.document.querySelector('main'),navigation=[],panels=[];
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const adapter={context:{actor:{authenticated:true}},consultation:{request(){}}};
 win.ORDER_APP_ADAPTER=adapter;
 root.querySelector('.obm-brand').__orderAccountMenu={open(id){panels.push(id);}};
 const registry=installProductUiRegistry(win,{admin:installProductAdminMotion}),module={id:'store-purchase',mount(){return()=>{};}},api={mode:'product',adapter,reduced:()=>true,select(...args){navigation.push(args);}};
 const dispose=registry.mount(module,root,'select',api);
 assert.equal(root.querySelectorAll('[data-product-gooey]').length,1);
 for(const label of ['납품 상담','내 계정','알림']){
  root.querySelector('.pm-gooey-trigger').click();root.querySelector('.pm-gooey-action[aria-label="'+label+'"]').click();
 }
 assert.deepEqual(navigation,[['drawer','closed']]);assert.deepEqual(panels,['profile','notifications']);
 const panelDispose=registry.mount(module,root.querySelector('.product-panel-body'),'select',api);
 const authDispose=registry.mount(module,root.querySelector('.product-auth-sheet'),'select',api);
 assert.equal(root.querySelectorAll('[data-product-gooey]').length,1);
 panelDispose();authDispose();assert.equal(root.querySelectorAll('[data-product-gooey]').length,1);
 dispose();assert.equal(root.querySelector('[data-product-gooey]'),null);dom.window.close();
});

test('guest pages have no authenticated floating actions and a page without a brand uses connected profile routes',()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),win=dom.window,root=win.document.querySelector('main'),navigation=[];
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const registry=installProductUiRegistry(win,{admin:installProductAdminMotion}),module={id:'profile',mount(){return()=>{};}},adapter={context:{actor:{authenticated:false}}},api={mode:'product',adapter,reduced:()=>true,select(...args){navigation.push(args);}};
 let dispose=registry.mount(module,root,'default',api);assert.equal(root.querySelector('[data-product-gooey]'),null);dispose();
 adapter.context.actor.authenticated=true;dispose=registry.mount(module,root,'default',api);
 for(const label of ['내 계정','알림']){root.querySelector('.pm-gooey-trigger').click();root.querySelector('.pm-gooey-action[aria-label="'+label+'"]').click();}
 assert.deepEqual(navigation,[['profile','default'],['profile','notification']]);dispose();dom.window.close();
});
