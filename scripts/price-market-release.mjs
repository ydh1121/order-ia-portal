// Both entry points and their canonical data owners are transferred at one revision.
export const priceMarketReleaseFiles = [
  'src/server/r3-price-workspace-page.mjs',
  'src/server/r3-price-workspace-client.mjs',
  'src/server/r3-price-workspace-model.mjs',
  'src/server/r3-price-workspace-store.mjs',
  'src/server/r3-price-workspace-defaults.mjs',
  'src/server/r3-price-workspace-xlsx.mjs',
  'src/server/r3-price-workspace-import.mjs',
  'src/server/r3-price-workspace-tree.mjs',
  'src/server/r3-price.mjs',
  'src/server/r3-egg-market.mjs',
  'src/server/product-ui/egg-market-chart.mjs',
  'src/server/product-ui/egg-market-chart-style.mjs',
  'src/server/product-ui/onboarding-market-chart.mjs',
  'src/server/product-ui/market-price-icon.mjs',
  'src/server/product-app-page.mjs',
  'src/server/router.mjs',
  'migrations/0014_r3_price_workspace.sql',
  'migrations/0020_egg_market_chart.sql',
];

export function priceMarketRelease(files) {
  const indexed = new Map(files.map(file => [file.path, file.sha256]));
  const sources = Object.fromEntries(priceMarketReleaseFiles.map(path => {
    const hash = indexed.get(path);
    if (!hash) throw Error('단가표·시세 차트 이관에 필요한 파일이 없습니다: ' + path);
    return [path, hash];
  }));
  return {surfaces: ['price-workspace', 'egg-market-chart'], sources};
}
