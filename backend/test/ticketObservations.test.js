import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicketObservationRepository } from '../src/repositories/ticketObservationRepository.js';
import { createPollingService } from '../src/services/pollingService.js';
import { openDatabase } from '../src/repositories/database.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ticket = (status, statusTime, callDue = '2026-10-14T09:00:00.000Z') => ({
  id: '100',
  serviceOrderId: 'PS-100',
  order: { status },
  timeline: { statusTime },
  sla: { activityDueDate: callDue },
  communication: { noOfCalls: 1 },
});

test('records each status once and measures the first move to CALL LATER or APPOINTMENT', async () => {
  const repository = await createTicketObservationRepository(':memory:');
  try {
    assert.equal(await repository.record([ticket('OPEN', '2026-10-14T05:00:00.000Z')]), 1);
    assert.equal(await repository.record([ticket('OPEN', '2026-10-14T05:00:00.000Z')]), 0);
    assert.equal((await repository.firstCall('100')).outcome, 'unknown');

    await repository.record([ticket('CALL LATER', '2026-10-14T08:30:00.000Z')]);
    await repository.record([ticket('APPOINTMENT', '2026-10-14T11:00:00.000Z')]);

    assert.deepEqual(await repository.firstCall('100'), {
      firstContactAt: '2026-10-14T08:30:00.000Z',
      firstContactStatus: 'CALL LATER',
      callDueAt: '2026-10-14T09:00:00.000Z',
      outcome: 'on_time',
    });
  } finally {
    await repository.close();
  }
});

test('reports a first call made after the call deadline as late', async () => {
  const repository = await createTicketObservationRepository(':memory:');
  try {
    await repository.record([ticket('APPOINTMENT', '2026-10-14T10:00:00.000Z')]);
    assert.equal((await repository.firstCall('100')).outcome, 'late');
  } finally {
    await repository.close();
  }
});

test('records CALL LATER timestamp and call deadline changes without duplicating unchanged polls', async () => {
  const repository = await createTicketObservationRepository(':memory:');
  const callLater = (statusTime, callDue, noOfCalls = 1) => ({
    ...ticket('CALL LATER', statusTime, callDue),
    timeline: {
      statusTime,
      callLaterTime: '2026-10-14T08:30:00.000Z',
      lastInteractionTime: '2026-10-14T08:30:00.000Z',
    },
    communication: { noOfCalls },
  });

  try {
    await repository.record([callLater('2026-10-14T08:30:00.000Z', '2026-10-14T12:00:00.000Z')]);
    await repository.record([callLater('2026-10-14T08:30:00.000Z', '2026-10-14T12:00:00.000Z')]);
    await repository.record([callLater('2026-10-14T08:30:00.000Z', '2026-10-14T16:00:00.000Z', 2)]);
    await repository.record([callLater('2026-10-14T12:30:00.000Z', '2026-10-14T16:00:00.000Z', 2)]);
    await repository.record(
      [callLater('2026-10-14T16:30:00.000Z', '2026-10-14T20:00:00.000Z', 3)],
      new Date(Date.parse(await repository.callLaterMonitoringExpiresAt()) + 1),
    );

    assert.deepEqual((await repository.callLaterHistory('100')).map(({ statusTime, callDueAt, noOfCalls }) => ({
      statusTime,
      callDueAt,
      noOfCalls,
    })), [
      {
        statusTime: '2026-10-14T08:30:00.000Z',
        callDueAt: '2026-10-14T12:00:00.000Z',
        noOfCalls: 1,
      },
      {
        statusTime: '2026-10-14T08:30:00.000Z',
        callDueAt: '2026-10-14T16:00:00.000Z',
        noOfCalls: 2,
      },
      {
        statusTime: '2026-10-14T12:30:00.000Z',
        callDueAt: '2026-10-14T16:00:00.000Z',
        noOfCalls: 2,
      },
    ]);
  } finally {
    await repository.close();
  }
});

test('keeps observations for matching order IDs isolated by store', async () => {
  const repository = await createTicketObservationRepository(':memory:', null);
  try {
    await repository.record([{
      ...ticket('CALL LATER', '2026-10-14T10:00:00.000Z', '2026-10-14T09:00:00.000Z'),
      storeId: 'alexandroupoli',
    }]);
    await repository.record([{
      ...ticket('APPOINTMENT', '2026-10-14T08:00:00.000Z', '2026-10-14T09:00:00.000Z'),
      storeId: 'komotini',
    }]);

    assert.equal((await repository.firstCall('100', 'alexandroupoli')).outcome, 'late');
    assert.equal((await repository.firstCall('100', 'komotini')).outcome, 'on_time');
  } finally {
    await repository.close();
  }
});

test('extends existing monitoring persistently without deleting history or sliding the expiry on restart', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fiona-monitoring-'));
  const dbPath = path.join(directory, 'observations.sqlite');
  let repository;
  let database;
  try {
    repository = await createTicketObservationRepository(dbPath);
    database = await openDatabase(dbPath);
    await repository.record([ticket('CALL LATER', '2026-10-29T08:00:00.000Z')], new Date('2026-10-29T08:00:00.000Z'));
    await database.prepare('UPDATE call_later_monitoring SET expires_at = ? WHERE id = 1')
      .run('2026-10-27T21:55:00.000Z');
    await repository.close();
    repository = await createTicketObservationRepository(dbPath);
    assert.equal(await repository.callLaterMonitoringExpiresAt(), '2026-11-05T08:43:00.000Z');
    assert.equal((await repository.callLaterHistory('100')).length, 1);
    await repository.record([ticket('CALL LATER', '2026-11-05T08:43:00.000Z')], new Date('2026-11-05T08:43:00.000Z'));
    await repository.record([ticket('CALL LATER', '2026-11-05T08:43:00.001Z')], new Date('2026-11-05T08:43:00.001Z'));
    assert.equal((await repository.callLaterHistory('100')).length, 2);

    await database.prepare('UPDATE call_later_monitoring SET expires_at = ? WHERE id = 1')
      .run('2026-11-06T08:43:00.000Z');
    // An already-open repository must see a database-side extension too.
    await repository.record([ticket('CALL LATER', '2026-11-05T09:00:00.000Z')], new Date('2026-11-05T09:00:00.000Z'));
    assert.equal((await repository.callLaterHistory('100')).length, 3);
    await repository.close();
    repository = await createTicketObservationRepository(dbPath);
    assert.equal(await repository.callLaterMonitoringExpiresAt(), '2026-11-06T08:43:00.000Z');
    assert.equal((await repository.callLaterHistory('100')).length, 3);
  } finally {
    await repository?.close();
    await database?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('monitoring reports are store-scoped, paginated and retain history after expiry', async () => {
  const repository = await createTicketObservationRepository(':memory:', null);
  try {
    const observedAt = new Date('2026-10-29T08:00:00.000Z');
    await repository.record([
      { ...ticket('CALL LATER', '2026-10-29T07:00:00.000Z'), storeId: 'alexandroupoli' },
      { ...ticket('CALL LATER', '2026-10-29T07:00:00.000Z'), storeId: 'komotini' },
    ], observedAt);
    await repository.record([
      { ...ticket('CALL LATER', '2026-10-29T08:00:00.000Z'), storeId: 'komotini' },
    ], observedAt);
    const report = await repository.callLaterMonitoringReport({ limit: 2 });
    assert.deepEqual(report.summary, {
      tickets: 2, captures: 3, ticketsWithChanges: 1,
      firstObservedAt: observedAt.toISOString(), lastObservedAt: observedAt.toISOString(),
    });
    assert.equal(report.observations.length, 2);
    assert.equal(report.hasMore, true);
    const page = await repository.callLaterMonitoringReport({ limit: 2, offset: 2 });
    assert.equal(page.observations.length, 1);
    assert.equal(page.hasMore, false);
    assert.equal(page.observations[0].statusTime, '2026-10-29T08:00:00.000Z');
    const scoped = await repository.callLaterMonitoringReport({ storeId: 'komotini' });
    assert.equal(scoped.summary.tickets, 1);
    assert.equal(scoped.summary.captures, 2);
    assert.ok(scoped.observations.every((row) => row.storeId === 'komotini'));
    const empty = await repository.callLaterMonitoringReport({ storeId: 'orestiada' });
    assert.equal(empty.summary.captures, 0);
    assert.equal(empty.summary.ticketsWithChanges, 0);
    assert.deepEqual(empty.observations, []);
    await repository.record([ticket('CALL LATER', '2099-01-01T00:00:00.000Z')], new Date('2099-01-01'));
    assert.equal((await repository.callLaterMonitoringReport()).summary.captures, 3);
  } finally {
    await repository.close();
  }
});

test('polling passes live tickets to the observer and survives observer failures', async () => {
  const seen = [];
  const service = createPollingService({
    fetchOrders: async () => ({ FilteredOrders: [{ id: 'SO-1', orderStatus: 'CALL LATER' }] }),
  }, 60000, (tickets) => {
    seen.push(tickets.length);
    throw new Error('disk full');
  });

  const snapshot = await service.refreshTickets();

  assert.deepEqual(seen, [1]);
  assert.equal(snapshot.status, 'live');
  assert.equal(snapshot.tickets.length, 1);
});
