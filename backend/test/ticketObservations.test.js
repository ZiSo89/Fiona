import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicketObservationRepository } from '../src/repositories/ticketObservationRepository.js';
import { createPollingService } from '../src/services/pollingService.js';

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
