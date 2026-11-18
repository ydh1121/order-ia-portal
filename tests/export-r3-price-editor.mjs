// Export the sessionless, editable view for design review with synthetic unit prices.
import {mkdirSync,writeFileSync} from 'node:fs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {matrixMarkup,mountPriceMatrix} from '../src/server/r3-matrix-editor.mjs';
import {createPriceMatrixModel} from '../src/server/order-engine/calculation/price-matrix.mjs';
import {carrierMarkup,mountCarrierEditor,freightPack} from '../src/server/r3-carrier-page.mjs';

const out=new URL('../artifacts/price-matrix/',import.meta.url);
mkdirSync(out,{recursive:true});
const style=renderR3PricePage('offline').match(/<style>([\s\S]+?)<\/style>/)[1];
const grades=['왕란','특란','대란','중란'].map((name,i)=>({id:'review-grade-'+i,name}));
const rows=Array.from({length:19},(_,i)=>({min:i*10+1,max:i<18?(i+1)*10:null,
  cells:grades.flatMap((_,grade)=>[String(25+grade),grade%2===0?'+5':String(30+grade)])}));
const safeJson=data=>JSON.stringify(data).replace(/</g,'\\u003c');
for(const [file,label,width] of [['desktop','PC',1440],['mobile','모바일',390]]){
  const pageStyle=file==='mobile'?style.replaceAll('@media(max-width:680px)','@media all'):style;
  const markup='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>단가·배송 편집 검수 '+label+'</title><style>'+pageStyle+'body{max-width:'+width+'px}</style></head><body><main><h1>상품 단가와 배송</h1><p>검수용 합성 가격표 · '+label+'</p>'+
    '<section><h2>구간별 단가</h2><div id="matrix">'+matrixMarkup+'</div></section><section><h2>배송 조건</h2>'+carrierMarkup+'</section></main><script>'+
    'const matrix='+browserFunction(mountPriceMatrix)+'(document.getElementById("matrix"),'+browserFunction(createPriceMatrixModel)+'());matrix.set('+safeJson({schema:1,grades,rows})+','+safeJson(grades)+');'+
    'const freight='+browserFunction(mountCarrierEditor)+'(document.getElementById("carrier-editor"),'+safeJson(freightPack)+');freight.set(null);</script></body></html>';
  writeFileSync(new URL('editable-'+file+'.html',out),markup);
}
