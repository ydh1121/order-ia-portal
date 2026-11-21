// Native ESM parsing finds actual imports, including re-exports. It never
// mistakes source text embedded in a browser-template string for server imports.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SourceTextModule} from 'node:vm';

const root=fileURLToPath(new URL('../',import.meta.url));
const entries=['product-app-page.mjs','product-account-panels.mjs','product-auth-sheet.mjs'];
const visited=new Set(),violations=[];
function walk(file,chain=[]){
 if(visited.has(file))return;
 visited.add(file);
 if(!existsSync(file))throw Error('Missing product import: '+relative(root,file));
 const module=new SourceTextModule(readFileSync(file,'utf8'),{identifier:file});
 for(const specifier of module.dependencySpecifiers){
  if(!specifier.startsWith('.'))continue;
  const next=resolve(dirname(file),specifier);
  if(/[/]r3-ui[/]|[/]r3-qa-|[/]qa-session-client[.]mjs$|qa-fixture/.test(next))violations.push([...chain,file,next].map(value=>relative(root,value)));
  walk(next,[...chain,file]);
 }
}
for(const entry of entries)walk(resolve(root,'src/server',entry));
const files=[...visited].map(file=>relative(root,file)).sort();
const result={entries,files,violations};
console.log(JSON.stringify(result));
if(violations.length)process.exitCode=1;
