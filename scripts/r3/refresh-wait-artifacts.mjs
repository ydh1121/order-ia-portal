// Rebuild just the eight current wait screens from their retained vector exports.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync, gzipSync} from 'node:zlib';
import * as catalogData from '../../src/server/r3-ui/catalog.gen.mjs';
import * as runtimeData from '../../src/server/r3-ui/runtime.gen.mjs';
import {bloubScript, bloubMontages} from '../../src/server/r3-bloub.mjs';
import {installWaitPlayer} from './authored/quote-wait-player.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const css = await read('./authored/quote-wait.css');
const supplemental = JSON.parse(await read('./authored/quote-wait-montages.json'));
const montages = {...bloubMontages, ...supplemental};
const player = [runtimeData.runtimes.member, bloubScript,
  ';('+installWaitPlayer.toString()+')('+JSON.stringify(montages)+');'].join('\n');
const runtimeHash = digest(runtimeData.frameCode.replace(/^function /, '') + player);
const frames = {...catalogData.frames};
const catalog = catalogData.catalog.map(row => {
  if (row.screen !== 'quote-wait') return row;
  const old = gunzipSync(Buffer.from(frames[row.current], 'base64')).toString();
  const body = old.replace(/<style id="r3-wait-layout">[\s\S]*?<\/style>/, '')
    .replace('</main>', '<style id="r3-wait-layout">'+css+'</style></main>');
  const current = digest(body);
  frames[current] = gzipSync(body).toString('base64');
  const hashes = Object.fromEntries(Object.keys(row.hashes).map(width => [width,
    digest([row.id,'current',current,catalogData.cssHash,width,runtimeHash].join('|'))]));
  return {...row, current, hashes, authoredChange:true, runtimeFamily:'quoteWait'};
});
const used = new Set(catalog.flatMap(row => [row.current, row.previous]));
async function updateModule(path, changes) {
  const source = (await read(path)).split('\n').map(line => {
    const match = /^export const (\w+)=/.exec(line);
    if (!match || !Object.hasOwn(changes, match[1])) return line;
    return 'export const '+match[1]+'='+JSON.stringify(changes[match[1]])+';';
  }).join('\n');
  await writeFile(new URL(path, import.meta.url), source);
}
await updateModule('../../src/server/r3-ui/catalog.gen.mjs', {
  catalog, frames:Object.fromEntries(Object.entries(frames).filter(([key]) => used.has(key)))});
await updateModule('../../src/server/r3-ui/runtime.gen.mjs', {runtimes:{...runtimeData.runtimes, quoteWait:player}});
