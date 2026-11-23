// Build an authenticated delivery projection from the exact existing release pack.
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {researchReleases} from '../src/server/research-release-runtime-index.gen.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const build='2ac2efb1ca970fe1ecb868251fda0bc2cd96d5c8324e38af699f470f1f8e74a4';
const directory=join(root,'public/ia/research-releases',build);
const check=process.argv.includes('--check');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=await readFile(join(root,'public/ia/research-releases',build+'.json.gz'));
const expected=researchReleases[build];
if(original.length!==expected.bytes||sha(original)!==expected.packSha256)throw Error('Sealed research pack has changed');
const pack=JSON.parse(gunzipSync(original));
if(pack.build.digest!==build||sha(JSON.stringify(pack.build.sources))!==build)throw Error('Research source identity mismatch');
const files=new Map(),parts=[],types=[],assets={},rows={};
let pending=[],length=0;
function compressed(name,raw){
  const zipped=gzipSync(raw,{level:9});
  files.set(name,zipped);
  return [zipped.length,raw.length,sha(zipped)];
}
function flush(){
  if(!pending.length)return;
  parts.push(compressed(parts.length+'.bin',Buffer.concat(pending)));
  pending=[];length=0;
}
function append(body,groupLimit){
  if(length&&length+body.length>groupLimit)flush();
  const entry=[parts.length,length,body.length,sha(body)];
  pending.push(body);length+=body.length;
  return entry;
}
for(const [name,{type,body}]of Object.entries(pack.assets).sort(([a],[b])=>a<b?-1:a>b?1:0)){
  if(!types.includes(type))types.push(type);
  assets[name]=[...append(Buffer.from(body),128*1024),types.indexOf(type)];
}
flush();
for(const row of pack.rows)rows[row.id]=append(Buffer.from(JSON.stringify(row)),48*1024);
flush();
const match=/^export const REGULAR_SOURCE_PROVENANCE=(.+);$/m.exec(pack.assets['bridge/contact-ui.mjs'].body);
if(!match)throw Error('Sealed contact provenance is missing');
const regular=JSON.parse(match[1]);
const shell=compressed('shell.bin',Buffer.from(JSON.stringify({build:pack.build,shell:pack.shell,regular})));
const manifest=compressed('index.bin',Buffer.from(JSON.stringify({build,source:expected.packSha256,shell,parts,types,assets,rows})));
const generated='// Generated from the verified research pack by scripts/build-research-delivery.mjs.\n'+
  'export const deliveryBuild='+JSON.stringify(build)+';\n'+
  'export const deliveryManifest='+JSON.stringify(manifest)+';\n';
async function output(path,bytes){
  if(check){if(!(await readFile(path)).equals(Buffer.from(bytes)))throw Error('Research delivery output mismatch: '+path);}
  else await writeFile(path,bytes);
}
if(!check)await mkdir(directory,{recursive:true});
for(const [name,bytes]of files)await output(join(directory,name),bytes);
const existing=await readdir(directory);
if(existing.length!==files.size||existing.some(name=>!files.has(name)))throw Error('Unexpected release delivery files');
await output(join(root,'src/server/research-delivery-identity.gen.mjs'),generated);
console.log(JSON.stringify({build,assets:Object.keys(assets).length,rows:Object.keys(rows).length,privateFiles:files.size,indexGzip:manifest[0],indexRaw:manifest[1],shellRaw:shell[1],largestRaw:Math.max(...parts.map(part=>part[1])),storedBytes:[...files.values()].reduce((total,bytes)=>total+bytes.length,0),checked:check}));
