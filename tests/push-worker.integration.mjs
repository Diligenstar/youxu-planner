import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import webpush from 'web-push';
const base = process.env.PUSH_TEST_URL ?? 'http://127.0.0.1:8787';
const config = await fetch(base + '/config').then(r => r.json());
assert.ok(config.publicKey);
const id = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex');
const key = webpush.generateVAPIDKeys();
const value = {subscription: {endpoint: 'https://fcm.googleapis.com/fcm/send/integration-no-delivery', keys: {p256dh: key.publicKey, auth: randomBytes(16).toString('base64url')}}, jobs: [{id: '2026-12-04:today', at: Date.now() + 86400000, title: 'test', body: 'scheduled, then deleted without sending'}]};
async function request(method, body, auth = token) {
  return fetch(`${base}/devices/${id}`, {method, headers: {'Authorization': `Bearer ${auth}`, 'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
}
assert.equal((await request('GET')).status, 404);
assert.equal((await request('PUT', value)).status, 200);
assert.deepEqual(await (await request('GET')).json(), {enabled: true, count: 1});
assert.equal((await request('DELETE', undefined, randomBytes(32).toString('hex'))).status, 403);
assert.equal((await request('PUT', {...value, jobs: [...value.jobs, ...value.jobs]})).status, 400);
assert.equal((await request('DELETE')).status, 200);
assert.deepEqual(await (await request('GET')).json(), {enabled: false, count: 0});
assert.equal((await request('PUT', value, randomBytes(32).toString('hex'))).status, 403);
assert.equal((await request('PUT', {...value, jobs: []})).status, 200);
assert.equal((await request('DELETE')).status, 200);
console.log('Worker integration passed: configuration, device ownership, scheduling, cancellation and re-enable. No push sent.');
