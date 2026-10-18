import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../src/auth.js';

function call(handler, req) {
  const res = { headers: {}, statusCode: 200, body: null };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  handler(req, res);
  return res;
}

const request = (extra = {}) => ({ headers: {}, ip: '1.1.1.1', path: '/tickets', body: {}, ...extra });

test('correct password issues a cookie that unlocks the API', () => {
  const auth = createAuth('secret');
  const res = call(auth.login, request({ body: { password: 'secret' } }));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /HttpOnly/);

  const cookie = res.headers['Set-Cookie'].split(';')[0];
  let passed = false;
  auth.requireAuth(request({ headers: { cookie } }), {}, () => { passed = true; });
  assert.equal(passed, true);
});

test('wrong password and missing cookie are rejected', () => {
  const auth = createAuth('secret');
  assert.equal(call(auth.login, request({ body: { password: 'nope' } })).statusCode, 401);
  assert.equal(call(auth.requireAuth, request()).statusCode, 401);
  assert.equal(call(auth.requireAuth, request({ headers: { cookie: 'fiona_session=1.abc' } })).statusCode, 401);
});

test('health and login stay open, and an unset password locks everything', () => {
  const auth = createAuth('secret');
  let passed = false;
  auth.requireAuth(request({ path: '/health' }), {}, () => { passed = true; });
  assert.equal(passed, true);

  const locked = createAuth('');
  assert.equal(call(locked.requireAuth, request()).statusCode, 503);
  assert.equal(call(locked.login, request({ body: { password: '' } })).statusCode, 503);
});

test('expired sessions and repeated failures are blocked', () => {
  let time = 1_000_000;
  const auth = createAuth('secret', () => time);
  const cookie = call(auth.login, request({ body: { password: 'secret' } })).headers['Set-Cookie'].split(';')[0];
  time += 31 * 24 * 60 * 60 * 1000;
  assert.equal(call(auth.requireAuth, request({ headers: { cookie } })).statusCode, 401);

  for (let attempt = 0; attempt < 10; attempt += 1) call(auth.login, request({ body: { password: 'x' } }));
  assert.equal(call(auth.login, request({ body: { password: 'secret' } })).statusCode, 429);
});
