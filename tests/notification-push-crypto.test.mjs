import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv, createECDH, hkdfSync} from 'node:crypto';
import {encryptWebPush, pushBase64, pushBytes, validPushEndpoint, validatePushSubscription, webPushAuthorization, webPushConfiguration} from '../src/server/notification-push-crypto.mjs';

test('RFC 8291 published encryption vector matches every payload byte', async () => {
  // Public test vector from https://www.rfc-editor.org/rfc/rfc8291#section-5
  const encoded = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  const expected = Buffer.from(encoded, 'base64url'), publicKey = expected.subarray(21, 86);
  const jwk = {kty: 'EC', crv: 'P-256', x: publicKey.subarray(1, 33).toString('base64url'), y: publicKey.subarray(33).toString('base64url'), d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'};
  const keyPair = {privateKey: await crypto.subtle.importKey('jwk', jwk, {name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']), publicKey: await crypto.subtle.importKey('raw', publicKey, {name: 'ECDH', namedCurve: 'P-256'}, true, [])};
  const actual = await encryptWebPush({keys: {auth: 'BTBZMqHH6r4Tts7J_aSIgg', p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'}},
    'When I grow up, I want to be a watermelon', {keyPair, salt: expected.subarray(0, 16)});
  assert.deepEqual(Buffer.from(actual), expected);
});

test('fresh Web Push records decrypt independently with Node crypto and never reuse the ephemeral key', async () => {
  const receiver = createECDH('prime256v1'); receiver.generateKeys(); const auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription = {keys: {p256dh: receiver.getPublicKey().toString('base64url'), auth: pushBase64(auth)}};
  const first = Buffer.from(await encryptWebPush(subscription, '오더 · 새 알림')), second = Buffer.from(await encryptWebPush(subscription, '오더 · 새 알림'));
  assert.notDeepEqual(first.subarray(0, 86), second.subarray(0, 86));
  const serverPublic = first.subarray(21, 86), salt = first.subarray(0, 16), shared = receiver.computeSecret(serverPublic);
  const ikm = hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), serverPublic]), 32);
  const cek = hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const decrypt = createDecipheriv('aes-128-gcm', cek, nonce); decrypt.setAuthTag(first.subarray(-16));
  const plaintext = Buffer.concat([decrypt.update(first.subarray(86, -16)), decrypt.final()]);
  assert.equal(plaintext.at(-1), 2); assert.equal(plaintext.subarray(0, -1).toString(), '오더 · 새 알림');
  await assert.rejects(encryptWebPush(subscription, new Uint8Array(3994)), /PUSH_PAYLOAD_TOO_LARGE/);
});

test('VAPID signature, origin audience and bounded expiry verify with the configured public key', async () => {
  const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const publicKey = pushBase64(await crypto.subtle.exportKey('raw', pair.publicKey));
  const env = {ORDER_WEB_PUSH_ENABLED: 'true', ORDER_WEB_PUSH_PUBLIC_KEY: publicKey, ORDER_WEB_PUSH_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), ORDER_WEB_PUSH_SUBJECT: 'mailto:operator@example.invalid'};
  const config = webPushConfiguration(env), now = Date.parse('2026-11-26T00:00:00Z'); assert(config);
  const auth = await webPushAuthorization(config, 'https://fcm.googleapis.com/fcm/send/test', now), jwt = auth.match(/^vapid t=(.+), k=(.+)$/);
  assert.equal(jwt[2], publicKey); const [header, payload, signature] = jwt[1].split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {typ: 'JWT', alg: 'ES256'});
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {aud: 'https://fcm.googleapis.com', exp: now / 1000 + 3600, sub: env.ORDER_WEB_PUSH_SUBJECT});
  assert.equal(await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, pair.publicKey, Buffer.from(signature, 'base64url'), Buffer.from(header + '.' + payload)), true);
  for (const patch of [{ORDER_WEB_PUSH_ENABLED: 'false'}, {ORDER_WEB_PUSH_PRIVATE_JWK: '{}'}, {ORDER_WEB_PUSH_PUBLIC_KEY: 'invalid'}, {ORDER_WEB_PUSH_SUBJECT: 'javascript:alert(1)'}]) assert.equal(webPushConfiguration({...env, ...patch}), null);
});

test('subscription validation rejects private fetch destinations and malformed capability keys', async () => {
  for (const endpoint of ['http://fcm.googleapis.com/send/x', 'https://localhost/push', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.evil.test/push', 'https://user:secret@fcm.googleapis.com/send/x', 'https://fcm.googleapis.com:444/send/x', 'https://fcm.googleapis.com/send/x#secret']) assert.equal(validPushEndpoint(endpoint), false, endpoint);
  const client = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const value = {endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test', expirationTime: null, keys: {p256dh: pushBase64(await crypto.subtle.exportKey('raw', client.publicKey)), auth: pushBase64(new Uint8Array(16))}};
  assert.deepEqual(await validatePushSubscription(value), value);
  await assert.rejects(validatePushSubscription({...value, expirationTime: Date.now() - 1}), /INVALID_PUSH_SUBSCRIPTION/);
  await assert.rejects(validatePushSubscription({...value, keys: {...value.keys, p256dh: pushBase64(new Uint8Array(65))}}), /INVALID_PUSH_SUBSCRIPTION/);
  assert.throws(() => pushBytes(value.keys.auth + '=', 16), /INVALID_PUSH_KEY/);
});
