import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/routes.js';
import { markReady, state } from '../src/state.js';

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

test('healthz 는 readiness 와 무관하게 200 을 돌려준다', async () => {
  state.ready = false;
  const response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.status, 'alive');
});

test('readyz 는 준비되기 전에 503 을 돌려준다', async () => {
  state.ready = false;
  const response = await fetch(`${base}/readyz`);
  assert.equal(response.status, 503);
});

test('readyz 는 준비된 뒤에 200 을 돌려준다', async () => {
  markReady();
  const response = await fetch(`${base}/readyz`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.status, 'ready');
});

test('version 은 빌드 정보를 돌려준다', async () => {
  const response = await fetch(`${base}/version`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.ok(Object.hasOwn(body, 'version'));
  assert.ok(Object.hasOwn(body, 'gitSha'));
  assert.ok(Object.hasOwn(body, 'buildDate'));
});

test('config 는 secret 값을 그대로 내보내지 않는다', async () => {
  const response = await fetch(`${base}/config`);
  assert.equal(response.status, 200);

  const body = await response.json();
  const raw = JSON.stringify(body);
  assert.ok(Array.isArray(body.keys));
  assert.ok(!raw.includes('value'));
});

test('metrics 는 요청 수 지표를 담는다', async () => {
  await fetch(`${base}/`);
  const response = await fetch(`${base}/metrics`);
  assert.equal(response.status, 200);

  const body = await response.text();
  assert.ok(body.includes('http_requests_total'));
});

test('없는 경로는 404 를 돌려준다', async () => {
  const response = await fetch(`${base}/no-such-path`);
  assert.equal(response.status, 404);
});
