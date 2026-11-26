// Lossless storage for generated runtime strings. No browser source is minified.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const format='order-generated-runtime-prefix/v1';
const declaration='const runtimeParts=';
const exported='export const runtimes=Object.fromEntries(runtimeParts.entries.map(([name,index])=>[name,runtimeValues[index]]));';

export function encodeRuntimeStrings(runtimes){
 if(!runtimes||Array.isArray(runtimes)||typeof runtimes!=='object'||Object.values(runtimes).some(value=>typeof value!=='string'))throw Error('RUNTIME_STRINGS_REQUIRED');
 const unique=[...new Set(Object.values(runtimes))].sort((a,b)=>a.length-b.length),slots=new Map(unique.map((value,index)=>[value,index]));
 const strings=unique.map((value,index)=>{
  let base=-1;
  for(let candidate=index-1;candidate>=0;candidate--)if(value.startsWith(unique[candidate])){base=candidate;break;}
  return [base,base<0?value:value.slice(unique[base].length)];
 });
 return {format,strings,entries:Object.entries(runtimes).map(([name,value])=>[name,slots.get(value)])};
}

export function decodeRuntimeStrings(parts){
 if(parts?.format!==format||!Array.isArray(parts.strings)||!Array.isArray(parts.entries))throw Error('RUNTIME_PREFIX_FORMAT');
 const strings=[];
 for(const pair of parts.strings){
  if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]<-1||pair[0]>=strings.length||typeof pair[1]!=='string')throw Error('RUNTIME_PREFIX_REFERENCE');
  strings.push((pair[0]<0?'':strings[pair[0]])+pair[1]);
 }
 const names=new Set();
 return Object.fromEntries(parts.entries.map(pair=>{
  if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||names.has(pair[0])||!Number.isInteger(pair[1])||pair[1]<0||pair[1]>=strings.length)throw Error('RUNTIME_PREFIX_ENTRY');
  names.add(pair[0]);return [pair[0],strings[pair[1]]];
 }));
}

export function serializeRuntimeStrings(runtimes){
 const parts=encodeRuntimeStrings(runtimes);
 return declaration+JSON.stringify(parts)+';\n'+
  'const runtimeValues=[];\n'+
  "for(const [base,suffix] of runtimeParts.strings)runtimeValues.push((base<0?'':runtimeValues[base])+suffix);\n"+
  exported+'\n';
}

export function parseRuntimeStrings(source){
 const old=/^export const runtimes=(\{[^\n]*\});\r?$/m.exec(source);
 if(old){const values=JSON.parse(old[1]);encodeRuntimeStrings(values);return values;}
 const parts=source.split(/\r?\n/).find(line=>line.startsWith(declaration));
 if(!parts?.endsWith(';')||!source.split(/\r?\n/).includes(exported))throw Error('RUNTIME_SOURCE_FORMAT');
 return decodeRuntimeStrings(JSON.parse(parts.slice(declaration.length,-1)));
}

export function replaceRuntimeStrings(source,runtimes){
 parseRuntimeStrings(source);
 if([...source.matchAll(/^export const (\w+)=/gm)].some(match=>match[1]!=='runtimes'))throw Error('RUNTIME_MODULE_EXPORTS');
 const comments=source.split(/\r?\n/).filter(line=>line.startsWith('//'));
 return comments.join('\n')+'\n'+serializeRuntimeStrings(runtimes);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,path]=process.argv.slice(2);
 if(command==='decode'&&path&&process.argv.length===4){
  process.stdout.write(JSON.stringify(parseRuntimeStrings(await readFile(path,'utf8'))));
 }else if(command==='encode'&&!path){
  const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
  process.stdout.write(serializeRuntimeStrings(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
 }else throw Error('Usage: runtime-serialization.mjs decode <module> | encode < JSON on stdin');
}
