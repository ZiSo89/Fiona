import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClosedTicketRepository } from '../src/repositories/closedTicketRepository.js';
import { createClosedTicketFinalizer } from '../src/services/closedTicketFinalizer.js';

const openTicket = { id: '77', serviceOrderId: 'PS1-1', dispatch: { assignedTeam: 'Team A' } };
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

test('a vanished ticket that is not completed is retried then dropped', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const finalizer = createClosedTicketFinalizer({ client: fakeClient({ orderStatus: 'CANCELLED' }), repository });

  await finalizer.process([openTicket, otherTicket]);
  for (let run = 0; run < 6; run += 1) await finalizer.process([otherTicket]);
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
