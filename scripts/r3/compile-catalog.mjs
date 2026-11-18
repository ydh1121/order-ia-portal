// Compile the supplied private R2 design sources in an offline fixture context.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const [source, out, selectedFamily, authoredFile, baselineNavigation] = process.argv.slice(2);
const read = name => fs.readFileSync(path.join(source,name),'utf8');
const brandSvg = read('assets/CODE1_jelly_base.svg').replace(/<title>[\s\S]*?<\/desc>/,'').replace('role="img" aria-label="CODE1 세 원 로고"','class="brand-mark" aria-hidden="true" focusable="false"');
const assets = {brand:'<span class="brand" aria-label="Order"><span>Order</span><span class="brand-dot">.</span>'+brandSvg+'</span>',avatar:read('assets/temporary-avatar.svg')};
const names=['core','account','business','navigation','quotes-admin','member-flows','operations-flows','route-bindings'];
const window={ORDER_QA_ASSETS:assets};
const ctx=vm.createContext({window,console,setTimeout,clearTimeout,Uint8Array,Blob});
if (selectedFamily && !['business','navigation','account'].includes(selectedFamily)) throw Error('Unknown review family');
for (const name of selectedFamily ? ['core', selectedFamily] : names) {
  const override = name === selectedFamily && authoredFile
    ? authoredFile : path.join(import.meta.dirname, 'authored', name + '.js');
  const compiledFile = name === 'navigation' && !selectedFamily && baselineNavigation ? baselineNavigation : override;
  const text = fs.existsSync(compiledFile) ? fs.readFileSync(compiledFile, 'utf8') : read('src/' + name + '.js');
  vm.runInContext(text, ctx, {filename: name + '.js'});
}
const frames=[];
for(const m of window.ORDER_DESIGN_MODULES) for(const s of m.states){
  const variants=s===m.states[0]&&m.variants?m.variants.map(v=>v.id):['email'];
  for(const variant of new Set(['email',...variants])){
    const body=m.render(s.id,{brand:assets.brand,variant,interactive:true,fixtureOnly:true});
    frames.push({id:[m.id,s.id,variant].join('/'),screen:m.id,state:s.id,variant,group:m.group,label:m.label,stateLabel:s.label,defaultWidth:m.width==='desktop'?1440:390,role:m.role||'common',phase:m.phase||'current',body});
  }
}
fs.writeFileSync(out,JSON.stringify(frames));
