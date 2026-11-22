import {createAddressSearchHandler} from './regular-address-handler.mjs';
import {readSession, sameOrigin} from '../owner-session.mjs';

export const researchAddressOrigin = Object.freeze({repository: 'ydh1121/order',
  commit: 'fd2ecddf71bf0548099bcc728219eac0d9d7da46', path: 'functions/api/address/search.js',
  gitBlob: '1a72713278dc87ebcc66d5d834d8bbcc5e6f3858',
  sha256: '88909d4d22418fe4317d283db7ae6b18792082abd5b6ea2338125f1276b83543'});
const privateHeaders = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store, max-age=0',
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'same-origin',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'", vary: 'Cookie, Cf-Access-Jwt-Assertion'};
const denied = (reason, status = 403, extra = {}) => new Response(JSON.stringify({version: 2, status: 'UNAVAILABLE', reason, items: []}),
  {status, headers: {...privateHeaders, ...extra}});

/** Called after the router's authenticated actor gate. A readonly provider POST
 * still requires the existing private-session CSRF contract. The vendored
 * handler owns request validation, fixed upstreams and address normalization. */
export async function handleResearchAddress({request, env, actor}, dependencies = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/ia/research-address') return denied('NOT_FOUND', 404);
  if (actor?.role !== 'OWNER' || typeof actor.id !== 'string' || !actor.id) return denied('IA_PERMISSION_DENIED');
  if (request.method !== 'POST') return denied('METHOD_NOT_ALLOWED', 405, {allow: 'POST'});
  if (!sameOrigin(request, env)) return denied('ORIGIN_REJECTED');
  let session;
  try {session = await readSession(request, env, dependencies.now);}
  catch (error) {return denied(error?.message === 'SESSION_STORE_UNAVAILABLE' ? 'SESSION_STORE_UNAVAILABLE' : 'SESSION_DENIED', error?.message === 'SESSION_STORE_UNAVAILABLE' ? 503 : 403);}
  if (session.id !== actor.id || request.headers.get('X-IA-CSRF') !== session.csrf) return denied('CSRF_DENIED');
  // Keep the original body, headers, signal, origin and query. Only the route
  // name changes; the original handler still rejects queries and bad bodies.
  url.pathname = '/api/address/search';
  const regularRequest = new Request(url, request);
  const handle = createAddressSearchHandler({fetcher: dependencies.fetcher ?? globalThis.fetch,
    ...(dependencies.timeoutMs === undefined ? {} : {timeoutMs: dependencies.timeoutMs})});
  const response = await handle({request: regularRequest, env});
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
