import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClosedTicketRepository } from '../src/repositories/closedTicketRepository.js';
import { createClosedTicketFinalizer } from '../src/services/closedTicketFinalizer.js';
import { buildClosedTicketRecord } from '../src/services/closedTicketSla.js';

const openTicket = { id: '77', serviceOrderId: 'PS1-1', dispatch: { crewName: 'Team A', assignedTeam: 'Team A' } };
const otherTicket = { id: '78', serviceOrderId: 'PS2-1', dispatch: {} };

function fakeClient(details) {
  return {
    orderDetails: async () => details,
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '2026-10-12T10:00:00Z' }),
    fetchLatestCommentWithSession: async () => null,
  };
}

const completed = {
  orderStatus: 'COMPLETED',
  workOrderFinishedOnPremiseTime: '2026-10-11T08:00:00Z',
  creationTime: '2026-10-10T08:00:00Z',
  firstName: 'A',
  lastName: 'B',
};

test('a ticket that leaves the open list is stored as closed', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const finalizer = createClosedTicketFinalizer({ client: fakeClient(completed), repository });

  assert.deepEqual(await finalizer.process([openTicket, otherTicket]), { inserted: 0, retry: 0, dropped: 0 });
  assert.equal(repository.hasOrder('77'), false);

  const summary = await finalizer.process([otherTicket]);
  assert.equal(summary.inserted, 1);
  assert.equal(repository.hasOrder('77'), true);
  assert.equal(repository.getByOrderId('77').customer_name, 'A B');
  assert.equal(repository.getByOrderId('77').team_name, 'Team A');
  assert.deepEqual(repository.listPending().map((row) => row.order_id), ['78']);
});

test('a ticket that closes while the server is stopped is finalized after restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fiona-finalizer-'));
  const databasePath = path.join(directory, 'closed.sqlite');
  const repository = createClosedTicketRepository(databasePath);
  const finalizer = createClosedTicketFinalizer({ client: fakeClient(completed), repository });

  try {
    await finalizer.process([openTicket]);
    repository.close();

    const restartedRepository = createClosedTicketRepository(databasePath);
    try {
      const restartedFinalizer = createClosedTicketFinalizer({
        client: fakeClient(completed),
        repository: restartedRepository,
      });
      const summary = await restartedFinalizer.process([otherTicket]);

      assert.equal(summary.inserted, 1);
      assert.equal(restartedRepository.hasOrder('77'), true);
      assert.equal(restartedRepository.listPending().some((row) => row.order_id === '77'), false);
    } finally {
      restartedRepository.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a completed ticket without a crew waits for the daily list instead of being stored', async () => {
  const repository = createClosedTicketRepository(':memory:');
  let crew = null;
  let now = new Date('2026-10-12T12:00:00.000Z');
  const client = {
    ...fakeClient(completed),
    dailyWorkorders: async () => [{ orderId: '77', teamName: crew }],
  };
  const finalizer = createClosedTicketFinalizer({ client, repository, now: () => now });
  const noCrewTicket = { id: '77', serviceOrderId: 'PS1-1', dispatch: { assignedTeam: 'NEW TECHNOLOGIES LTD' } };

  await finalizer.process([noCrewTicket]);
  const first = await finalizer.process([otherTicket]);
  assert.equal(first.inserted, 0);
  assert.equal(first.retry >= 1, true);
  assert.equal(repository.hasOrder('77'), false);

  crew = 'Team Z';
  now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const second = await finalizer.process([otherTicket]);
  assert.equal(second.inserted, 1);
  assert.equal(repository.getByOrderId('77').team_name, 'Team Z');
});

test('a ticket whose crew never appears is stored without one on the last attempt', async () => {
  const repository = createClosedTicketRepository(':memory:');
  let now = new Date('2026-10-12T12:00:00.000Z');
  const finalizer = createClosedTicketFinalizer({ client: fakeClient(completed), repository, now: () => now });
  const noCrewTicket = { id: '77', serviceOrderId: 'PS1-1', dispatch: {} };

  await finalizer.process([noCrewTicket]);
  for (let attempt = 0; attempt < 8 && !repository.hasOrder('77'); attempt += 1) {
    await finalizer.process([otherTicket]);
    now = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  }
  assert.equal(repository.hasOrder('77'), true);
  assert.equal(repository.getByOrderId('77').team_name, null);
});

test('a completed ticket without an SLA date is re-enriched automatically', async () => {
  const repository = createClosedTicketRepository(':memory:');
  let slaDate = null;
  let now = new Date('2026-10-12T12:00:00.000Z');
  const client = {
    orderDetails: async () => completed,
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: slaDate }),
    fetchLatestCommentWithSession: async () => null,
  };
  const finalizer = createClosedTicketFinalizer({ client, repository, now: () => now });
  const getStoredTicket = () => repository.listClosedBetween(
    '2026-10-10T00:00:00.000Z',
    '2026-10-13T00:00:00.000Z',
  ).find((row) => row.order_id === '77');

  await finalizer.process([openTicket]);
  const firstSummary = await finalizer.process([otherTicket]);
  assert.equal(firstSummary.inserted, 1);
  assert.equal(firstSummary.retry, 1);
  assert.equal(getStoredTicket().work_order_sla_outcome, 'unknown');
  assert.deepEqual(repository.listPending().map((row) => row.order_id), ['77', '78']);

  slaDate = '2026-10-11T07:00:00Z';
  now = new Date(now.getTime() + 60 * 1000);
  const nextSummary = await finalizer.process([otherTicket]);
  assert.equal(nextSummary.inserted, 0);
  assert.equal(getStoredTicket().work_order_sla_outcome, 'late');
  assert.equal(repository.listPending().some((row) => row.order_id === '77'), false);
  repository.close();
});

test('retries old unknown tickets and uses the authoritative service order and team details', async () => {
  const repository = createClosedTicketRepository(':memory:', 'orestiada');
  const stored = buildClosedTicketRecord(
    { orderId: 'old-unknown', serviceOrderId: 'stale-service-id', teamName: 'NEW TECHNOLOGIES AT ORESTIADA' },
    {
      orderStatus: 'COMPLETED',
      serviceOrderId: 'correct-service-id',
      workOrderFinishedOnPremiseTime: '2026-10-11T08:00:00Z',
      teamName: 'NEW TECHNOLOGIES AT ORESTIADA',
    },
    {},
    null,
  );
  repository.insert({ ...stored, service_order_id: 'stale-service-id', store_id: 'orestiada' });
  let fetchedServiceOrderId;
  const finalizer = createClosedTicketFinalizer({
    repository,
    client: {
      orderDetails: async () => ({
        ...completed,
        serviceOrderId: 'correct-service-id',
        teamName: 'Nikolaos Katinas',
      }),
      fetchWorkOrderSlaDetailsWithSession: async (serviceOrderId) => {
        fetchedServiceOrderId = serviceOrderId;
        return { workOrderSlaDate: '2026-10-11T10:00:00Z' };
      },
      fetchLatestCommentWithSession: async () => null,
    },
    now: () => new Date('2026-10-12T12:00:00.000Z'),
  });

  const summary = await finalizer.process([otherTicket]);
  const ticket = repository.listClosedBetween(
    '2026-10-10T00:00:00.000Z',
    '2026-10-13T00:00:00.000Z',
  ).find((row) => row.order_id === 'old-unknown');

  assert.equal(summary.retry, 0);
  assert.equal(fetchedServiceOrderId, 'correct-service-id');
  assert.equal(ticket.work_order_sla_outcome, 'on_time');
  assert.equal(ticket.team_name, 'Nikolaos Katinas');
  assert.equal(repository.listPending().some((row) => row.order_id === 'old-unknown'), false);
  repository.close();
});

test('a group name from the open list or order details never replaces the assigned crew', async () => {
  const repository = createClosedTicketRepository(':memory:', 'komotini');
  const client = {
    config: { closedServiceGroupMatch: 'KOMOTINI' },
    orderDetails: async () => ({ ...completed, teamName: 'NEW TECHNOLOGIES LTD KOMOTINI', serviceGroup: 'NEW TECHNOLOGIES LTD KOMOTINI' }),
    dailyWorkorders: async () => [{ orderId: '77', teamName: 'Nikolaos Katinas', teamGroupName: 'NEW TECHNOLOGIES LTD KOMOTINI' }],
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '2026-10-12T10:00:00Z' }),
    fetchLatestCommentWithSession: async () => null,
  };
  const finalizer = createClosedTicketFinalizer({ client, repository });
  const groupTicket = { id: '77', serviceOrderId: 'PS1-1', dispatch: { crewName: 'NEW TECHNOLOGIES LTD KOMOTINI' } };

  await finalizer.process([groupTicket]);
  await finalizer.process([otherTicket]);

  assert.equal(repository.getByOrderId('77').team_name, 'Nikolaos Katinas');
  repository.close();
});

test('a group name is never stored when the crew cannot be found', async () => {
  const repository = createClosedTicketRepository(':memory:', 'komotini');
  let now = new Date('2026-10-12T12:00:00.000Z');
  const client = {
    config: { closedServiceGroupMatch: 'KOMOTINI' },
    orderDetails: async () => ({ ...completed, teamName: 'NEW TECHNOLOGIES LTD KOMOTINI' }),
    dailyWorkorders: async () => [],
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '2026-10-12T10:00:00Z' }),
    fetchLatestCommentWithSession: async () => null,
  };
  const finalizer = createClosedTicketFinalizer({ client, repository, now: () => now });
  const groupTicket = { id: '77', serviceOrderId: 'PS1-1', dispatch: { crewName: 'NEW TECHNOLOGIES LTD KOMOTINI' } };

  await finalizer.process([groupTicket]);
  for (let attempt = 0; attempt < 8 && !repository.hasOrder('77'); attempt += 1) {
    await finalizer.process([otherTicket]);
    now = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  }
  assert.equal(repository.getByOrderId('77').team_name, null);
  repository.close();
});

test('tickets already stored with a group name are repaired with the assigned crew', async () => {
  const repository = createClosedTicketRepository(':memory:', 'komotini');
  const stored = buildClosedTicketRecord(
    { orderId: '90', serviceOrderId: 'PS9-1', teamName: 'NEW TECHNOLOGIES LTD KOMOTINI' },
    { ...completed, serviceOrderId: 'PS9-1' },
    { workOrderSlaDate: '2026-10-12T10:00:00Z' },
    null,
  );
  repository.insert({ ...stored, store_id: 'komotini' });
  const client = {
    config: { closedServiceGroupMatch: 'KOMOTINI' },
    orderDetails: async () => ({ ...completed, teamName: 'NEW TECHNOLOGIES LTD KOMOTINI' }),
    dailyWorkorders: async () => [{ orderId: '90', teamName: 'Nikolaos Katinas' }],
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '2026-10-12T10:00:00Z' }),
    fetchLatestCommentWithSession: async () => null,
  };
  const finalizer = createClosedTicketFinalizer({ client, repository });

  await finalizer.process([otherTicket]);

  assert.equal(repository.getByOrderId('90').team_name, 'Nikolaos Katinas');
  repository.close();
});

test('a vanished ticket that is not completed is retried then dropped', async () => {
  const repository = createClosedTicketRepository(':memory:');
  let now = new Date('2026-10-12T12:00:00.000Z');
  const finalizer = createClosedTicketFinalizer({
    client: fakeClient({ orderStatus: 'CANCELLED' }),
    repository,
    now: () => now,
  });

  await finalizer.process([openTicket, otherTicket]);
  for (let run = 0; run < 6; run += 1) {
    now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await finalizer.process([otherTicket]);
  }
  assert.equal(repository.hasOrder('77'), false);
  assert.deepEqual(repository.listPending().map((row) => row.order_id), ['78']);
});

test('finalizes pending tickets after two consecutive empty open snapshots', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const finalizer = createClosedTicketFinalizer({ client: fakeClient(completed), repository });
  await finalizer.process([openTicket]);
  assert.equal(await finalizer.process([]), null);
  assert.equal(repository.hasOrder('77'), false);

  await finalizer.process([openTicket]);
  assert.equal(await finalizer.process([]), null);
  assert.equal(repository.hasOrder('77'), false);

  const summary = await finalizer.process([]);
  assert.equal(summary.inserted, 1);
  assert.equal(repository.hasOrder('77'), true);
});
