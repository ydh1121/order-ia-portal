// Only these two sealed sources are adapted. The original CODE1 implementation,
// product mode switch guard, and administrator-controlled publication stay intact.
export const brandAccountExtensionPaths=['web/brand.mjs','web/order-menu.mjs'];
export function extendBrandAccountSource(path,source){
  if(path==='web/brand.mjs'){
    // New verified product builds already use the canonical shared factory.
    // Preserve the exact sealed bytes, including visible/detached lifecycle and
    // the server-context arrival receipt; adapting them would create a second
    // implementation of the same brand.
    const canonical=[
      "import {mountBrandAccountMenu,brandAccountMenuCss} from './brand-account-menu.mjs';",
      'export function createOrderBrand(doc=document){',
      'export function mountOrderBrandElement(brand,overrides={}){',
      'export function mountOrderBrand(root=document){',
      'ORDER_BRAND_ACCOUNT_CONTEXT',
      'authenticated:context.authenticated===true',
      'context.consumeArrival()===true'
    ];
    if(canonical.every(marker=>source.includes(marker)))return source;
    const marker='export function mountOrderBrand(root=document){';
    if(source.split(marker).length!==2||!source.includes("import {mount} from './code1-jelly.mjs';"))throw Error('BRAND_ACCOUNT_EXTENSION_SOURCE_MISMATCH');
    // Replace the old brand mount, rather than running a second click handler or
    // second CODE1 factory over the same paths. The ESM namespace below is the
    // product's unchanged code1-jelly module, not a cloned animation engine.
    return `import * as Code1Jelly from './code1-jelly.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from '../extension/brand-account-menu.mjs';
export function mountOrderBrand(root=document){
 const doc=root.nodeType===9?root:root.ownerDocument,view=doc.defaultView,menus=[];
 if(!doc.querySelector('style[data-order-brand-account-css]')){const style=doc.createElement('style');style.dataset.orderBrandAccountCss='';const nonce=doc.querySelector('script[nonce],style[nonce]')?.nonce;if(nonce)style.nonce=nonce;style.textContent=brandAccountMenuCss;doc.head.append(style);}
 for(const svg of root.querySelectorAll('.brand-mark[data-code1-jelly],.brand-mark')){
  const brand=svg.closest('.brand');if(!brand)continue;
  const context=view.ORDER_BRAND_ACCOUNT_CONTEXT||{};
  const menu=mountBrandAccountMenu(brand,{...context,authenticated:context.authenticated===true,animateInitial:!brand.__orderAccountMenu&&context.authenticated===true&&context.consumeArrival?.()===true,jelly:Code1Jelly,reducedMotion:()=>view.matchMedia('(prefers-reduced-motion: reduce)').matches});
  menus.push(menu);
 }
 return {destroy(){menus.forEach(menu=>menu.destroy());}};
}
`;
  }
  if(path==='web/order-menu.mjs'){
    const marker='container.append(trigger,panel);brand.after(container);';
    if(source.split(marker).length!==2)throw Error('ORDER_MODE_ANCHOR_SOURCE_MISMATCH');
    const features="fetch('/api/order/features',";
    if(source.split(features).length!==2)throw Error('ORDER_FEATURES_EXTENSION_SOURCE_MISMATCH');
    return source.replace(features,"fetch(window.ORDER_APP_CONTEXT?.endpoints?.product?window.ORDER_APP_CONTEXT.endpoints.product+'/features':'/api/order/features',").replace(marker,`container.append(trigger,panel);
  const word=brand.querySelector('.obm-wordmark,.brand-word,[data-brand-word]');
  if(word)word.after(container);else brand.after(container);`);
  }
  return null;
}
