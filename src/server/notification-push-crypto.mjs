// Web Push uses the platform's Web Crypto implementations, with no new package.
// Protocols: RFC 8291 (aes128gcm), RFC 8292 (VAPID), RFC 8030 (delivery).
const utf8 = new TextEncoder();
export const pushBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export function pushBytes(value, length) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('INVALID_PUSH_KEY');
  const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (bytes.length !== length || pushBase64(bytes) !== value) throw Error('INVALID_PUSH_KEY');
  return bytes;
}
const concat = (...parts) => {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let at = 0;
  for (const part of parts) {result.set(part, at); at += part.length;} return result;
};
export const pushDigest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(value))), v => v.toString(16).padStart(2, '0')).join('');

/** A subscription endpoint is a delivery capability. Do not accept arbitrary
 * fetch destinations, redirects, credentials, local hosts or operator URLs. */
export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length < 20 || value.length > 2048) return false;
  try {
    const url = new URL(value), host = url.hostname;
    return url.href === value && url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port && url.pathname !== '/' &&
      (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(host) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(host));
  } catch {return false;}
}

/** Values are deployment configuration, never returned in errors or logs. */
export function webPushConfiguration(env) {
  if (env?.ORDER_WEB_PUSH_ENABLED !== 'true') return null;
  try {
    const publicKey = pushBytes(env.ORDER_WEB_PUSH_PUBLIC_KEY, 65);
    const jwk = JSON.parse(env.ORDER_WEB_PUSH_PRIVATE_JWK), subject = new URL(env.ORDER_WEB_PUSH_SUBJECT);
    if (publicKey[0] !== 4 || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.x !== pushBase64(publicKey.slice(1, 33)) || jwk.y !== pushBase64(publicKey.slice(33)) ||
      !['mailto:', 'https:'].includes(subject.protocol) || subject.protocol === 'mailto:' && !/^[^@\s]+@[^@\s]+$/.test(subject.pathname) ||
      subject.username || subject.password || subject.hash || env.ORDER_WEB_PUSH_SUBJECT.length > 200) return null;
    pushBytes(jwk.d, 32);
    return {publicKey: env.ORDER_WEB_PUSH_PUBLIC_KEY, privateJwk: {kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d}, subject: env.ORDER_WEB_PUSH_SUBJECT};
  } catch {return null;}
}

export async function validatePushSubscription(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['endpoint', 'expirationTime', 'keys'].includes(key)) ||
    !validPushEndpoint(value.endpoint) || !value.keys || Object.keys(value.keys).length !== 2 ||
    value.expirationTime != null && (!Number.isSafeInteger(value.expirationTime) || value.expirationTime <= now)) throw Error('INVALID_PUSH_SUBSCRIPTION');
  try {
    const publicKey = pushBytes(value.keys.p256dh, 65); pushBytes(value.keys.auth, 16);
    if (publicKey[0] !== 4) throw Error('INVALID_PUSH_KEY');
    await crypto.subtle.importKey('raw', publicKey, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  } catch {throw Error('INVALID_PUSH_SUBSCRIPTION');}
  return {endpoint: value.endpoint, expirationTime: value.expirationTime ?? null, keys: {p256dh: value.keys.p256dh, auth: value.keys.auth}};
}

async function hkdf(secret, salt, info, length) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, key, length * 8));
}

/** A deterministic salt/key pair is accepted only by the module's unit tests.
 * Production calls omit options and use fresh cryptographic randomness. */
export async function encryptWebPush(subscription, message, options = {}) {
  const plaintext = typeof message === 'string' ? utf8.encode(message) : new Uint8Array(message);
  if (plaintext.length > 3993) throw Error('PUSH_PAYLOAD_TOO_LARGE');
  const clientPublic = pushBytes(subscription.keys.p256dh, 65), auth = pushBytes(subscription.keys.auth, 16);
  const client = await crypto.subtle.importKey('raw', clientPublic, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const pair = options.keyPair || await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: client}, pair.privateKey, 256));
  const ikm = await hkdf(shared, auth, concat(utf8.encode('WebPush: info\0'), clientPublic, serverPublic), 32);
  const salt = options.salt || crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw Error('INVALID_PUSH_SALT');
  const [cek, nonce] = await Promise.all([
    hkdf(ikm, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 16),
    hkdf(ikm, salt, utf8.encode('Content-Encoding: nonce\0'), 12)
  ]);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce, tagLength: 128}, key, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21); header.set(salt); new DataView(header.buffer).setUint32(16, 4096); header[20] = 65;
  return concat(header, serverPublic, ciphertext);
}

export async function webPushAuthorization(configuration, endpoint, now = Date.now()) {
  if (!validPushEndpoint(endpoint)) throw Error('INVALID_PUSH_ENDPOINT');
  const header = pushBase64(utf8.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const claims = pushBase64(utf8.encode(JSON.stringify({aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 3600, sub: configuration.subject})));
  const key = await crypto.subtle.importKey('jwk', configuration.privateJwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, utf8.encode(header + '.' + claims));
  return `vapid t=${header}.${claims}.${pushBase64(signature)}, k=${configuration.publicKey}`;
}
