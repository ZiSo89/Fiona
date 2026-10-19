import test from 'node:test';
import assert from 'node:assert/strict';
import { createPollingService } from '../src/services/pollingService.js';

test('concurrent refreshes share one Fiona request and accept an empty live result', async () => {
  let resolveFetch;
  let calls = 0;
  const service = createPollingService({
    fetchOrders: () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    },
  }, 60000);

  const firstRefresh = service.refreshTickets();
  const secondRefresh = service.refreshTickets();
  assert.equal(calls, 1);

  resolveFetch({ FilteredOrders: [] });
  const [firstSnapshot, secondSnapshot] = await Promise.all([firstRefresh, secondRefresh]);

  assert.equal(firstSnapshot.status, 'live');
  assert.equal(secondSnapshot.status, 'live');
  assert.deepEqual(firstSnapshot.tickets, []);
});

test('failed refresh retains the last successful tickets as stale data', async () => {
  let calls = 0;
  const service = createPollingService({
    fetchOrders: async () => {
      calls += 1;
      if (calls > 1) throw new Error('Fiona unavailable');
      return {
        FilteredOrders: [{ id: 'SO-1', orderStatus: 'CALL LATER', priority: '1' }],
      };
    },
  }, 60000);

  const liveSnapshot = await service.refreshTickets();
  const staleSnapshot = await service.refreshTickets();

  assert.equal(liveSnapshot.status, 'live');
  assert.equal(staleSnapshot.status, 'stale');
  assert.equal(staleSnapshot.tickets[0].id, 'SO-1');
  assert.equal(staleSnapshot.error, 'Fiona unavailable');
});

test('polling snapshots attach store identity to every ticket', async () => {
  const service = createPollingService({
    fetchOrders: async () => ({ FilteredOrders: [{ id: 'SO-1', orderStatus: 'OPEN' }] }),
  }, 60000, () => {}, { storeId: 'komotini', storeName: 'Κομοτηνή' });

  const snapshot = await service.refreshTickets();

  assert.equal(snapshot.storeId, 'komotini');
  assert.equal(snapshot.storeName, 'Κομοτηνή');
  assert.equal(snapshot.tickets[0].storeId, 'komotini');
  assert.equal(snapshot.tickets[0].storeName, 'Κομοτηνή');
});