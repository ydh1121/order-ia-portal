import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {productFontUrl} from '../src/server/product-fonts.mjs';

const {build} = createRequire(new URL('./build-tools/package.json', import.meta.url))('esbuild');
const bundle = await build({entryPoints: [fileURLToPath(new URL('./helpers/notification-push-browser-entry.mjs', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent'});
const font = await readFile(new URL('../public' + productFontUrl, import.meta.url));
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/fixture.mjs') {response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents);}
  else if (path === productFontUrl) {response.setHeader('Content-Type', 'font/woff2'); response.end(font);}
  else if (path === '/') {response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>알림 공용 컴포넌트</title><script type="module" src="/fixture.mjs"></script></head><body></body></html>');}
  else {response.statusCode = 404; response.end();}
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({origin: 'http://127.0.0.1:' + server.address().port})));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
