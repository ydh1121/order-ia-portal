import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {issueSession} from '../src/server/owner-session.mjs';
import {requireActor} from '../src/server/auth.mjs';
import {handleResearchAddress, researchAddressOrigin} from '../src/server/research-app/research-address-api.mjs';

const now = 1795392000, origin = 'research-address.order-ia-portal.pages.dev';
const base = 'https://' + origin, endpoint = base + '/api/ia/research-address';
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
async function fixture({configured = false} = {}) {
  // Independent, in-memory test credentials. No deployment secret is read.
  const env = {IA_PREVIEW_OWNER_ORIGIN: base, IA_OWNER_EMAIL: 'fixture-owner@example.test',
    IA_OWNER_SESSION_KEY: Buffer.alloc(32, 7).toString('base64url'), ...(configured ? {KAKAO_REST_API_KEY: 'test-only-not-a-credential'} : {})};
  const session = await issueSession(env, now);
  const request = (body = {query: '오더 사무실', page: 1}, options = {}) => new Request(options.url ?? endpoint,
    {method: options.method ?? 'POST', headers: {origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
      cookie: session.cookie.split(';')[0], 'X-IA-CSRF': session.csrf, ...options.headers},
    ...(options.method === 'GET' || options.method === 'HEAD' ? {} : {body: options.rawBody ?? JSON.stringify(body)}), ...(options.signal ? {signal: options.signal} : {})});
  return {env, session, request, async call(input = request(), dependencies = {}) {
    const actor = await requireActor(input, env, () => {throw Error('Unexpected authentication network');}, now);
    return handleResearchAddress({request: input, env, actor}, {now, ...dependencies});
  }};
}
const road = '서울특별시 중구 세종대로 1', postal = '04524';
const addressResponse = () => ({meta: {total_count: 1, pageable_count: 1, is_end: true}, documents: [{address_type: 'ROAD_ADDR',
  road_address: {address_name: '  서울특별시  중구 세종대로 1 ', zone_no: postal, region_1depth_name: '서울특별시', region_2depth_name: '중구'},
  address: {address_name: '서울특별시 중구 1'}}]});
const placeResponse = () => ({meta: {total_count: 1, pageable_count: 1, is_end: true}, documents: [{id: '1234', place_name: '  오더   사무실 ',
  road_address_name: road, address_name: '서울특별시 중구 1'}]});
const digest = value => 'KAKAO:v1:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('address handler vendor is exactly the audited original bytes and git blob', async () => {
  const bytes = await readFile(new URL('../src/server/research-app/regular-address-handler.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), researchAddressOrigin.sha256);
  assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes])).digest('hex'), researchAddressOrigin.gitBlob);
  assert.equal(researchAddressOrigin.commit, 'fd2ecddf71bf0548099bcc728219eac0d9d7da46');
});

test('authenticated research requests without a configured key remain NOT_CONFIGURED without upstream calls', async () => {
  const f = await fixture(); let calls = 0;
  const response = await f.call(f.request(), {fetcher: async () => {calls++; throw Error('Should not call provider');}});
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), {version: 2, status: 'UNAVAILABLE', reason: 'NOT_CONFIGURED', items: []});
  assert.equal(calls, 0); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
});

test('the original Kakao handler normalizes address and place candidates through fixed upstream endpoints', async () => {
  const f = await fixture({configured: true}), calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(input); calls.push({url, init});
    assert.equal(url.origin, 'https://dapi.kakao.com'); assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.authorization, 'KakaoAK test-only-not-a-credential');
    assert.equal(init.headers.cookie, undefined); assert.equal(init.headers['X-IA-CSRF'], undefined);
    return json(url.pathname.endsWith('/address.json') ? addressResponse() : placeResponse());
  };
  const response = await f.call(f.request({query: '  오더   사무실 ', page: 1}), {fetcher});
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.version, 3); assert.equal(result.status, 'OK'); assert.equal(result.total, 2); assert.equal(result.items.length, 2);
  const address = result.items.find(item => item.kind === 'ADDRESS'), place = result.items.find(item => item.kind === 'PLACE');
  assert.deepEqual(address, {kind: 'ADDRESS', road, postal, jibun: '서울특별시 중구 1', region: '서울특별시 중구', providerId: digest([road, postal]), addressProvider: 'KAKAO'});
  assert.equal(place.name, '오더 사무실'); assert.equal(place.placeId, '1234'); assert.equal(Object.hasOwn(place, 'postal'), false);
  assert.deepEqual(calls.map(call => call.url.pathname), ['/v2/local/search/address.json', '/v2/local/search/keyword.json']);
  assert.ok(calls.every(call => call.url.searchParams.get('query') === '오더 사무실'));
  assert.ok(!JSON.stringify(result).includes(f.env.KAKAO_REST_API_KEY));
});

test('place resolution re-reads provider results and does not trust a client-provided address or made-up place', async () => {
  const f = await fixture({configured: true}), calls = [];
  const fetcher = async input => {const url = new URL(input); calls.push(url); return json(url.pathname.endsWith('/keyword.json') ? placeResponse() : addressResponse());};
  const response = await f.call(f.request({action: 'resolve', query: '오더 사무실', page: 1, placeId: '1234'}), {fetcher});
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.reason, 'RESOLVED'); assert.equal(result.placeId, '1234'); assert.equal(result.item.postal, postal);
  assert.equal(result.item.providerId, digest(['PLACE', '1234', road, postal])); assert.notEqual(result.item.providerId, digest([road, postal]));
  assert.deepEqual(calls.map(url => url.pathname), ['/v2/local/search/keyword.json', '/v2/local/search/address.json']); assert.equal(calls[1].searchParams.get('query'), road);
  const fake = await f.call(f.request({action: 'resolve', query: '오더 사무실', page: 1, placeId: '9999'}), {fetcher});
  assert.equal(fake.status, 502); assert.equal((await fake.json()).reason, 'PLACE_CHANGED');
  const before = calls.length;
  const forged = await f.call(f.request({action: 'resolve', query: '오더 사무실', page: 1, placeId: '1234', road: 'client-selected-address'}), {fetcher});
  assert.equal(forged.status, 400); assert.equal((await forged.json()).reason, 'INVALID_REQUEST'); assert.equal(calls.length, before);
});

test('OWNER role, same origin, real owner session and CSRF are required before any provider call', async () => {
  const f = await fixture({configured: true}); let calls = 0;
  const dependencies = {now, fetcher: async () => {calls++; throw Error('Unexpected provider call');}};
  for (const actor of [null, {id: 'owner', role: 'ENGINEER'}, {id: 'owner', role: 'BUSINESS'}]) {
    const response = await handleResearchAddress({request: f.request(), env: f.env, actor}, dependencies);
    assert.equal(response.status, 403); assert.equal((await response.json()).reason, 'IA_PERMISSION_DENIED');
  }
  for (const [headers, reason] of [[{origin: 'https://other.example'}, 'ORIGIN_REJECTED'], [{origin: ''}, 'ORIGIN_REJECTED'],
    [{'sec-fetch-site': 'cross-site'}, 'ORIGIN_REJECTED'], [{cookie: ''}, 'SESSION_DENIED'], [{'X-IA-CSRF': 'wrong'}, 'CSRF_DENIED']]) {
    const response = await handleResearchAddress({request: f.request(undefined, {headers}), env: f.env, actor: {id: 'owner', role: 'OWNER'}}, dependencies);
    assert.equal(response.status, 403); assert.equal((await response.json()).reason, reason);
  }
  const other = await handleResearchAddress({request: f.request(), env: f.env, actor: {id: 'another-owner', role: 'OWNER'}}, dependencies);
  assert.equal(other.status, 403); assert.equal((await other.json()).reason, 'CSRF_DENIED');
  const get = await f.call(f.request(undefined, {method: 'GET'}), dependencies); assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST');
  assert.equal(calls, 0);
});

test('URL-only adaptation retains original input bounds, upstream redirects and cancellation behavior', async () => {
  const f = await fixture({configured: true}); let calls = 0;
  const fetcher = async () => {calls++; return new Response(null, {status: 302, headers: {location: 'https://untrusted.example/'}});};
  const withQuery = await f.call(f.request(undefined, {url: endpoint + '?provider=other'}), {fetcher}); assert.equal(withQuery.status, 400);
  const tooLarge = await f.call(f.request(undefined, {rawBody: JSON.stringify({query: 'a'.repeat(1025)})}), {fetcher}); assert.equal(tooLarge.status, 400); assert.equal(calls, 0);
  const redirect = await f.call(f.request(), {fetcher}); assert.equal(redirect.status, 502); assert.equal((await redirect.json()).reason, 'PROVIDER_HTTP'); assert.equal(calls, 1);
  let upstreamSignal, entered;
  const started = new Promise(resolve => {entered = resolve;}), abort = new AbortController();
  const response = f.call(f.request(undefined, {signal: abort.signal}), {fetcher: async (_url, init) => {upstreamSignal = init.signal; entered(); return new Promise(() => {});}});
  await started; abort.abort(); const canceled = await response;
  assert.equal(canceled.status, 499); assert.equal((await canceled.json()).reason, 'CANCELLED'); assert.equal(upstreamSignal.aborted, true);
});
