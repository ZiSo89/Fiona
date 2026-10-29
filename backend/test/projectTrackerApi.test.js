import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createProjectTrackerAuth, projectTrackerEditorKey } from '../src/middleware/projectTrackerAuth.js';
import { createProjectTrackerRoutes } from '../src/routes/projectTrackerRoutes.js';
import { createProjectTrackerRepository } from '../src/repositories/projectTrackerRepository.js';

async function withApi(run) {
  const repository = await createProjectTrackerRepository(':memory:');
  await repository.insertJob({
    storeId: 'alexandroupoli',
    orderId: 'order-1',
    teamName: 'Team One',
    closedAt: '2026-10-01T10:00:00.000Z',
    sourceLabel: 'FTTH Installation',
    sourceCategoryId: 'category-1',
    categoryId: 'ftth_installation',
    importedAt: '2026-10-01T11:00:00.000Z',
  });
  const auth = createProjectTrackerAuth({
    sessionSecret: 'test-secret',
    teamPasswords: { [projectTrackerEditorKey('alexandroupoli', 'Team One')]: 'team-secret' },
    adminPassword: 'admin-secret',
  });
  const app = express();
  app.use(express.json());
  app.use('/api/tracker', createProjectTrackerRoutes({
    repository,
    auth,
    stores: [{ storeId: 'alexandroupoli', storeName: 'Alexandroupoli' }],
    getEditorDetails: async () => ({
      customerName: 'Example Customer',
      address: 'Example Street 1, 12345',
      problemDescription: 'Signal check',
      latestComment: { text: 'No answer', at: '2026-10-15T17:40:00.000Z' },
    }),
  }));
  app.use('/api', (req, res, next) => {
    if (!req.headers.cookie?.includes('fiona_session=')) return res.status(401).json({ success: false });
    return next();
  });
  app.get('/api/private', (req, res) => res.json({ success: true }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(url);
  } finally {
    await repository.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('public tracker summaries are available without opening the existing Fiona API', async () => {
  await withApi(async (url) => {
    const anonymousSession = await fetch(`${url}/api/tracker/session`).then((response) => response.json());
    assert.equal(anonymousSession.success, false);

    const profiles = await fetch(`${url}/api/tracker/profiles`).then((response) => response.json());
    assert.equal(profiles.profiles[0].teamName, 'Team One');
    assert.equal(profiles.profiles[0].storeName, 'Alexandroupoli');

    const response = await fetch(`${url}/api/tracker/month?month=2026-10&storeId=alexandroupoli&teamName=Team%20One`);
    const month = await response.json();
    assert.equal(response.status, 200);
    assert.equal(month.totalJobs, 1);
    assert.equal(month.totalPoints, 50);
    assert.equal(JSON.stringify(month).includes('customer'), false);

    assert.equal((await fetch(`${url}/api/private`)).status, 401);
    assert.equal((await fetch(`${url}/api/tracker/month?teamName=Team%20One`)).status, 400);
  });
});

test('corrections require a team session and stay scoped to its store/team', async () => {
  await withApi(async (url) => {
    const denied = await fetch(`${url}/api/tracker/jobs/order-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        storeId: 'alexandroupoli', teamName: 'Team One', categoryId: 'dth_tv_impairment', pointsOverride: null,
      }),
    });
    assert.equal(denied.status, 401);

    const login = await fetch(`${url}/api/tracker/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const rejectedScope = await fetch(`${url}/api/tracker/jobs/order-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        storeId: 'komotini', teamName: 'Team One', categoryId: 'dth_tv_impairment', pointsOverride: null,
      }),
    });
    assert.equal(rejectedScope.status, 403);

    const corrected = await fetch(`${url}/api/tracker/jobs/order-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        storeId: 'alexandroupoli', teamName: 'Team One', categoryId: 'dth_tv_impairment', pointsOverride: null,
      }),
    });
    assert.equal(corrected.status, 200);
    assert.equal((await corrected.json()).job.points, 18);

    const cablingCorrection = await fetch(`${url}/api/tracker/jobs/order-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        storeId: 'alexandroupoli',
        teamName: 'Team One',
        categoryId: 'cabling_repair',
        pointsOverride: 15,
      }),
    });
    const cablingJob = await cablingCorrection.json();
    assert.equal(cablingCorrection.status, 200);
    assert.equal(cablingJob.job.pointsOverride, 15);
    assert.equal(cablingJob.job.points, 15);
  });
});

test('only admins can lock a payment month; team editors cannot correct it afterward', async () => {
  await withApi(async (url) => {
    const editorLogin = await fetch(`${url}/api/tracker/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' }),
    });
    const editorCookie = editorLogin.headers.get('set-cookie').split(';')[0];

    const deniedLock = await fetch(`${url}/api/tracker/month-lock`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: editorCookie },
      body: JSON.stringify({
        storeId: 'alexandroupoli', teamName: 'Team One', month: '2026-10', locked: true,
      }),
    });
    assert.equal(deniedLock.status, 403);

    const adminLogin = await fetch(`${url}/api/tracker/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin', password: 'admin-secret' }),
    });
    const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
    assert.deepEqual((await adminLogin.json()).editor, { role: 'admin' });

    const locked = await fetch(`${url}/api/tracker/month-lock`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        storeId: 'alexandroupoli', teamName: 'Team One', month: '2026-10', locked: true,
      }),
    });
    assert.equal(locked.status, 200);
    assert.equal((await locked.json()).paymentLock.locked, true);

    const month = await fetch(`${url}/api/tracker/month?month=2026-10&storeId=alexandroupoli&teamName=Team%20One`, {
      headers: { cookie: editorCookie },
    }).then((response) => response.json());
    assert.equal(month.paymentLock.locked, true);

    const correction = {
      storeId: 'alexandroupoli', teamName: 'Team One', categoryId: 'dth_tv_impairment', pointsOverride: null,
    };
    const blockedCorrection = await fetch(`${url}/api/tracker/jobs/order-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: editorCookie },
      body: JSON.stringify(correction),
    });
    assert.equal(blockedCorrection.status, 409);

    const adminCorrection = await fetch(`${url}/api/tracker/jobs/order-1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify(correction),
    });
    assert.equal(adminCorrection.status, 200);
  });
});

test('editor-only details endpoint rejects public and cross-team reads', async () => {
  await withApi(async (url) => {
    const path = '/api/tracker/jobs/order-1/details?storeId=alexandroupoli&teamName=Team%20One';
    assert.equal((await fetch(`${url}${path}`)).status, 401);

    const login = await fetch(`${url}/api/tracker/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const details = await fetch(`${url}${path}`, { headers: { cookie } });
    assert.equal(details.status, 200);
    assert.deepEqual((await details.json()).details, {
      customerName: 'Example Customer',
      address: 'Example Street 1, 12345',
      problemDescription: 'Signal check',
      latestComment: { text: 'No answer', at: '2026-10-15T17:40:00.000Z' },
    });

    const wrongTeam = await fetch(`${url}/api/tracker/jobs/order-1/details?storeId=komotini&teamName=Team%20One`, { headers: { cookie } });
    assert.equal(wrongTeam.status, 403);
  });
});
test('the admin overview lists every team with points, pending jobs and lock state', async () => {
  await withApi(async (url) => {
    const anonymous = await fetch(`${url}/api/tracker/admin/overview?month=2026-10`);
    assert.equal(anonymous.status, 401);

    const editorLogin = await fetch(`${url}/api/tracker/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId: 'alexandroupoli', teamName: 'Team One', password: 'team-secret' }),
    });
    const editorCookie = editorLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${url}/api/tracker/admin/overview?month=2026-10`, { headers: { cookie: editorCookie } })).status, 403);

    const adminLogin = await fetch(`${url}/api/tracker/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin', password: 'admin-secret' }),
    });
    const cookie = adminLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${url}/api/tracker/admin/overview?month=bad`, { headers: { cookie } })).status, 400);
    const overview = await (await fetch(`${url}/api/tracker/admin/overview?month=2026-10`, { headers: { cookie } })).json();
    assert.deepEqual(overview.teams, [{
      storeId: 'alexandroupoli',
      storeName: 'Alexandroupoli',
      teamName: 'Team One',
      jobCount: 1,
      points: 50,
      pendingCount: 0,
      paymentLock: { locked: false, changedAt: null },
    }]);
  });
});