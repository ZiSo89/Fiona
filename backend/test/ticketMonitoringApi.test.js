import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { config } from '../src/config.js';
import { createAuth } from '../src/middleware/auth.js';
import { createSystemRoutes } from '../src/routes/systemRoutes.js';
import { createTicketsRoutes } from '../src/routes/ticketsRoutes.js';
import { closeStatsRepositories, getStatsRepositories } from '../src/repositories/storeRepositories.js';

test('online monitoring history requires app login and validates pagination and store scope', async () => {
  const originalPath = config.closedTicketsDbPath;
  const originalClient = config.dbClient;
  config.closedTicketsDbPath = ':memory:';
  config.dbClient = 'sqlite';
  const auth = createAuth('test-password');
  const app = express();
  app.use(express.json());
  app.use('/api', auth.requireAuth);
  app.use('/api', createSystemRoutes(auth));
  app.use('/api/tickets', createTicketsRoutes());
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const { observations } = await getStatsRepositories(null);
    await observations.record([{
      id: 'test-1', storeId: 'alexandroupoli',
      order: { status: 'CALL LATER' },
      timeline: { statusTime: '2026-10-29T08:00:00.000Z' },
      sla: { activityDueDate: '2026-10-29T12:00:00.000Z' },
      communication: { noOfCalls: 2 },
      customer: { name: 'Not included in history' },
    }], new Date('2026-10-29T08:00:00.000Z'));
    assert.equal((await fetch(`${url}/tickets/call-later-history`)).status, 401);
    const login = await fetch(`${url}/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test-password' }),
    });
    const headers = { cookie: login.headers.get('set-cookie').split(';')[0] };
    const response = await fetch(`${url}/tickets/call-later-history?store=all&limit=1`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const report = await response.json();
    assert.equal(report.expiresAt, '2026-11-05T08:43:00.000Z');
    assert.equal(report.summary.captures, 1);
    assert.equal(report.observations[0].noOfCalls, 2);
    assert.equal(JSON.stringify(report).includes('Not included'), false);
    for (const query of ['limit=0', 'limit=501', 'limit=1.5', 'offset=-1', 'offset=oops']) {
      assert.equal((await fetch(`${url}/tickets/call-later-history?${query}`, { headers })).status, 400);
    }
    assert.equal((await fetch(`${url}/tickets/call-later-history?store=unknown`, { headers })).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeStatsRepositories();
    config.closedTicketsDbPath = originalPath;
    config.dbClient = originalClient;
  }
});
