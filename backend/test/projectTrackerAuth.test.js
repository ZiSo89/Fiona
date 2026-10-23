import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectTrackerAuth, projectTrackerEditorKey } from '../src/middleware/projectTrackerAuth.js';

function call(handler, req) {
  const res = { headers: {}, statusCode: 200, body: null };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  handler(req, res, () => { res.nextCalled = true; });
  return res;
}

const request = (extra = {}) => ({ headers: {}, ip: '1.1.1.1', body: {}, ...extra });
const passwords = {
  [projectTrackerEditorKey('alexandroupoli', 'Team One')]: 'team-secret',
  [projectTrackerEditorKey('komotini', 'Team One')]: 'other-secret',
};

test('editor session is scoped to its store and team', () => {
  const auth = createProjectTrackerAuth({ teamPasswords: passwords, sessionSecret: 'signing-secret' });
  const login = call(auth.login, request({ body: { storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' } }));
  assert.equal(login.statusCode, 200);
  assert.match(login.headers['Set-Cookie'], /Path=\/api\/tracker; HttpOnly; SameSite=Strict/);

  const cookie = login.headers['Set-Cookie'].split(';')[0];
  const authorizedRequest = request({ headers: { cookie } });
  const authorized = call(auth.requireAuth, authorizedRequest);
  assert.equal(authorized.nextCalled, true);
  assert.deepEqual(authorizedRequest.trackerEditor, { storeId: 'alexandroupoli', teamName: 'Team One' });

  const session = call(auth.session, request({ headers: { cookie } }));
  assert.equal(session.body.editor.storeId, 'alexandroupoli');
  assert.equal(session.body.editor.teamName, 'Team One');
  assert.equal(call(auth.login, request({ body: { storeId: 'komotini', teamName: 'Team One', password: 'team-secret' } })).statusCode, 401);
  assert.equal(call(auth.requireAuth, request()).statusCode, 401);
});

test('wrong passwords are rate limited and missing signing secret disables editors', () => {
  const auth = createProjectTrackerAuth({ teamPasswords: passwords, sessionSecret: 'signing-secret' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    call(auth.login, request({ body: { storeId: 'alexandroupoli', teamName: 'Team One', password: 'wrong' } }));
  }
  assert.equal(call(auth.login, request({ body: { storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' } })).statusCode, 429);

  const unconfigured = createProjectTrackerAuth({ teamPasswords: passwords });
  assert.equal(call(unconfigured.login, request({ body: { storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' } })).statusCode, 503);
});

test('expired editor sessions and logout are rejected', () => {
  let time = 1_000_000;
  const auth = createProjectTrackerAuth({ teamPasswords: passwords, sessionSecret: 'signing-secret', now: () => time });
  const login = call(auth.login, request({ body: { storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' } }));
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  time += 13 * 60 * 60 * 1000;
  assert.equal(call(auth.requireAuth, request({ headers: { cookie } })).statusCode, 401);
  assert.match(call(auth.logout, request()).headers['Set-Cookie'], /Max-Age=0/);
});