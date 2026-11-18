// Export the sessionless, editable view for design review using the supplied, historical design reference.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {matrixMarkup,mountPriceMatrix} from '../src/server/r3-matrix-editor.mjs';
import {createPriceMatrixModel} from '../src/server/order-engine/calculation/price-matrix.mjs';
import {carrierMarkup,mountCarrierEditor,freightPack} from '../src/server/r3-carrier-page.mjs';

const out=new URL('../artifacts/price-matrix/',import.meta.url);
mkdirSync(out,{recursive:true});
const style=renderR3PricePage('offline').match(/<style>([\s\S]+?)<\/style>/)[1];
const grades=['왕란','특란','대란','중란'].map((name,i)=>({id:'review-grade-'+i,name}));
const source=readFileSync(new URL('./fixtures/egg-price-reference-20261109.tsv',import.meta.url),'utf8');
const reference=readFileSync(new URL('./fixtures/egg-price-reference-20261109.tsv',import.meta.url),'utf8').trimEnd();
const rows=reference.split('\n').slice(1).map(line=>{
  const [min,max,...cells]=line.split('\t');
  return {min:Number(min),max:max?Number(max):null,cells};
});
const safeJson=data=>JSON.stringify(data).replace(/</g,'\\u003c');
for(const [file,label,width] of [['desktop','PC',1440],['mobile','모바일',390]]){
  const pageStyle=file==='mobile'?style.replaceAll('@media(max-width:680px)','@media all'):style;
  const markup='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>단가·배송 편집 검수 '+label+'</title><style>'+pageStyle+'body{max-width:'+width+'px}</style></head><body><main><h1>상품 단가와 배송</h1><p>2026.11.09 참고 가격표 · 입력 검수용 · '+label+'</p>'+
    '<section><h2>구간별 단가</h2><div id="matrix">'+matrixMarkup+'</div></section><section><h2>배송 조건</h2>'+carrierMarkup+'</section></main><script>'+
    'const matrix='+browserFunction(mountPriceMatrix)+'(document.getElementById("matrix"),'+browserFunction(createPriceMatrixModel)+'());matrix.set('+safeJson({schema:1,grades,rows})+','+safeJson(grades)+');'+
    'const freight='+browserFunction(mountCarrierEditor)+'(document.getElementById("carrier-editor"),'+safeJson(freightPack)+');freight.set(null);</script></body></html>';
  writeFileSync(new URL('editable-'+file+'.html',out),markup);
}
