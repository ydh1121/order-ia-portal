import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname),base=path.join(root,'src/server');
const digest=s=>createHash('sha256').update(s).digest('hex');
const paths=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full);else if(/\.(mjs|js|sql|css|html|woff2)$/.test(entry.name)&&entry.name!=='product-build.gen.mjs')paths.push(full);}}
for(const dir of [base,path.join(root,'functions'),path.join(root,'migrations'),path.join(root,'public'),path.join(root,'workers')])await walk(dir);paths.sort();
const files=await Promise.all(paths.map(async file=>({path:path.relative(root,file),sha256:digest(await readFile(file))})));
const build={format:'order-product-source/v1',digest:digest(JSON.stringify(files)),files};
const source='// Generated from the actual server and browser modules. No fixture outcome proves a feature.\nexport const productBuild = '+JSON.stringify(build)+';\n';
const target=path.join(base,'product-build.gen.mjs');
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==source)throw Error('Product source manifest needs regeneration');}else await writeFile(target,source);
console.log(JSON.stringify({modules:files.length,digest:build.digest}));
