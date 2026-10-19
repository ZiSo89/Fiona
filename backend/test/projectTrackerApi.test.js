import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createProjectTrackerAuth, projectTrackerEditorKey } from '../src/projectTrackerAuth.js';
import { createProjectTrackerApi } from '../src/services/projectTrackerApi.js';
import { createProjectTrackerRepository } from '../src/services/projectTrackerRepository.js';

async function withApi(run) {
  const repository = createProjectTrackerRepository(':memory:');
  repository.insertJob({
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
  });
  const app = express();
  app.use(express.json());
  app.use('/api/tracker', createProjectTrackerApi({
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
    repository.close();
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