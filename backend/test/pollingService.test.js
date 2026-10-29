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
test('a refresh keeps the previous outcome visible instead of reporting polling', async () => {
  let resolveFetch;
  const service = createPollingService({
    fetchOrders: () => new Promise((resolve) => { resolveFetch = resolve; }),
  }, 60000);

  const first = service.refreshTickets();
  assert.equal(service.getLatestSnapshot().status, 'polling');
  resolveFetch({ FilteredOrders: [] });
  await first;

  const second = service.refreshTickets();
  const during = service.getLatestSnapshot();
  assert.equal(during.status, 'live');
  assert.equal(during.refreshing, true);
  resolveFetch({ FilteredOrders: [] });
  await second;
  assert.equal(service.getLatestSnapshot().refreshing, false);
});

test('a live snapshot turns stale after two missed poll intervals', async () => {
  let currentTime = Date.parse('2026-10-18T10:00:00.000Z');
  const service = createPollingService({
    fetchOrders: async () => ({ FilteredOrders: [] }),
  }, 60000, () => {}, {}, () => currentTime);

  await service.refreshTickets();
  currentTime += 2 * 60000 + 59000;
  assert.equal(service.getLatestSnapshot().status, 'live');
  currentTime += 2000;
  assert.equal(service.getLatestSnapshot().status, 'stale');
});

test('flags snapshots that reached the Fiona filter limit', async () => {
  const orders = [{ id: 'SO-1', orderStatus: 'OPEN' }, { id: 'SO-2', orderStatus: 'OPEN' }];
  const client = {
    config: { filterLimit: '2' },
    fetchOrders: async () => ({ FilteredOrders: orders }),
    getWorkOrders: (payload) => payload.FilteredOrders,
  };
  const service = createPollingService(client, 60000, () => {}, {});
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal((await service.refreshTickets()).possiblyTruncated, true);
    client.config.filterLimit = '3';
    assert.equal((await service.refreshTickets()).possiblyTruncated, false);
  } finally {
    console.warn = originalWarn;
  }
});