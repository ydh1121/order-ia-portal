// Build an authenticated delivery projection from the exact existing release pack.
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {researchReleases} from '../src/server/research-release-runtime-index.gen.mjs';
import {researchBuild} from '../src/server/research-app/assets.gen.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const build=researchBuild.digest;
// PR26 source pins remain active after this release. Keep their existing
// projection available without changing any published bytes or URLs.
const archivedBuild='9f7f83753ad7245b1e6a0f7dc55f905093c2a2dfa8d0aa8f057d9f18e125f092';
const check=process.argv.includes('--check');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function projection(build){
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
return {files,manifest,assets,rows,parts,shell};
}
const current=await projection(build),{files,manifest,assets,rows,parts,shell}=current;
const manifests={};
for(const candidate of [...new Set([build,archivedBuild])].sort()){
  const result=candidate===build?current:await projection(candidate);
  const directory=join(root,'public/ia/research-releases',candidate);
  // Reconstruct and compare the previous projection against its sealed pack;
  // never bless arbitrary existing index bytes or rewrite historical files.
  const verifyOnly=check||candidate!==build;
  if(!verifyOnly)await mkdir(directory,{recursive:true});
  for(const [name,bytes]of result.files)await output(join(directory,name),bytes,verifyOnly);
  const existing=await readdir(directory);
  if(existing.length!==result.files.size||existing.some(name=>!result.files.has(name)))throw Error('Unexpected release delivery files');
  manifests[candidate]=result.manifest;
}
const generated='// Generated from the verified research pack by scripts/build-research-delivery.mjs.\n'+
  'export const deliveryBuild='+JSON.stringify(build)+';\n'+
  'export const deliveryManifest='+JSON.stringify(manifest)+';\n'+
  'export const deliveryManifests='+JSON.stringify(manifests)+';\n';
async function output(path,bytes,verifyOnly=check){
  if(verifyOnly){if(!(await readFile(path)).equals(Buffer.from(bytes)))throw Error('Research delivery output mismatch: '+path);}
  else await writeFile(path,bytes);
}
await output(join(root,'src/server/research-delivery-identity.gen.mjs'),generated);
console.log(JSON.stringify({build,deliveryBuilds:Object.keys(manifests),assets:Object.keys(assets).length,rows:Object.keys(rows).length,privateFiles:files.size,indexGzip:manifest[0],indexRaw:manifest[1],shellRaw:shell[1],largestRaw:Math.max(...parts.map(part=>part[1])),storedBytes:[...files.values()].reduce((total,bytes)=>total+bytes.length,0),checked:check}));
