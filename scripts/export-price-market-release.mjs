import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {rename, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {priceMarketReleaseFiles} from './price-market-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, {cwd: root, encoding:'utf8'});
const [output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw Error('사용법: node scripts/export-price-market-release.mjs <output.tar.gz>');
const commit = git('rev-parse', 'HEAD').trim();
const manifestPath = 'src/server/product-build.gen.mjs';
const source = git('show', commit + ':' + manifestPath);
const build = JSON.parse(source.match(/^export const productBuild = (.+);$/m)[1]);
const unit = build.releaseUnits?.priceMarket;
if (!unit || unit.surfaces.join(',') !== 'price-workspace,egg-market-chart' ||
    priceMarketReleaseFiles.some(path => !unit.sources[path])) throw Error('단가표와 시세 차트의 통합 빌드 기록이 필요합니다.');
const target = resolve(output), temp = target + '.' + randomUUID() + '.tmp';
try {
  // Shared runtime dependencies travel in the full product source manifest.
  const paths = [manifestPath, ...build.files.map(file => file.path)];
  const receipt = {revision:commit, productBuild:build.digest, ...unit};
  git('archive', '--format=tar.gz', '--output=' + temp,
      '--add-virtual-file=price-market-release.json:' + JSON.stringify(receipt), commit, '--', ...paths);
  await rename(temp, target);
} finally {
  await rm(temp, {force:true});
}
console.log(JSON.stringify({revision:commit, build:build.digest, surfaces:unit.surfaces, archive:target}));
