import {readFile,writeFile} from 'node:fs/promises';

// Current generated product data has one owner. Historical modules retain
// their existing locations and are deliberately outside this routing table.
export function generatedTarget(file,key){
 const target=new URL(file);
 if(target.pathname.endsWith('/r3-ui/catalog.gen.mjs'))return new URL('../product-ui/catalog.gen.mjs',target);
 if(target.pathname.endsWith('/r3-ui/runtime.gen.mjs'))return key==='runtimes'?new URL('../product-ui/runtime.gen.mjs',target):new URL('./review-engine.gen.mjs',target);
 return target;
}

export async function updateGeneratedModule(file,changes){
 const groups=new Map();
 for(const [key,value] of Object.entries(changes)){
  const target=generatedTarget(file,key).href;
  if(!groups.has(target))groups.set(target,{});
  groups.get(target)[key]=value;
 }
 for(const [target,values] of groups){
  let source;
  try{source=await readFile(new URL(target),'utf8');}
  catch(error){if(error.code==='ENOENT')throw Error('Run scripts/r3/migrate-product-ui.mjs before regenerating current UI modules.');throw error;}
  const seen=new Set();
  const result=source.split('\n').map(line=>{
   const key=/^export const (\w+)=/.exec(line)?.[1];
   if(!Object.hasOwn(values,key))return line;
   seen.add(key);return 'export const '+key+'='+JSON.stringify(values[key])+';';
  }).join('\n');
  for(const key of Object.keys(values))if(!seen.has(key))throw Error('Generated field missing: '+new URL(target).pathname+'#'+key);
  await writeFile(new URL(target),result);
 }
}
