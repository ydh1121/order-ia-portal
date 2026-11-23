export async function digest(bytes) {
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(sum, byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function readVerifiedPart(binding, origin, collection, hash) {
  const url = new URL('/ia/research-releases/' + collection + '/' + hash + '.json.gz', origin);
  const response = await binding.fetch(new Request(url, {redirect: 'manual', headers: {'Accept-Encoding': 'identity'}}));
  if (response.status !== 200 || response.redirected) throw Error('Missing immutable review delivery part');
  const bytes = await response.arrayBuffer();
  if (await digest(bytes) !== hash) throw Error('Review delivery integrity mismatch');
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
}
