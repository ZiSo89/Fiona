import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, writeClosedTicketExport } from '../src/cli/syncClosedTickets.js';
import { createClosedTicketRepository } from '../src/repositories/closedTicketRepository.js';
import { listDateRange, parseDateRangeValue, syncClosedTickets } from '../src/services/closedTicketSync.js';

function createOrder(orderId) {
  return {
    orderId,
    serviceOrderId: `PS-${orderId}`,
    teamName: 'Team A',
    lastName: 'Customer',
    planServiceDescription: 'FTTH Activation',
  };
}

function createDetails(orderId) {
  return {
    orderData: {
      orderId,
      orderStatus: 'COMPLETED',
      workOrderFinishedOnPremiseTime: '2026-10-14 10:00:00',
      creationTime: '2026-10-13 10:00:00',
      accountAFM: '123456789',
      deadline: '2026-10-14 09:00:00',
    },
  };
}

test('parses and lists inclusive DD.MM.YYYY ranges and rejects invalid dates', () => {
  assert.deepEqual(
    listDateRange(parseDateRangeValue('30.09.2026'), parseDateRangeValue('02.10.2026')),
    ['30.09.2026', '01.10.2026', '02.10.2026'],
  );
  assert.throws(() => parseDateRangeValue('31.09.2026'), /Invalid calendar date/);
  assert.throws(() => listDateRange(parseDateRangeValue('02.10.2026'), parseDateRangeValue('01.10.2026')), /cannot be after/);
});

test('syncs only new completed orders and skips duplicates before detail requests', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const detailIds = [];
  const dailyDates = [];
  const progress = [];
  const client = {
    dailyWorkorders: async (workDate) => {
      dailyDates.push(workDate);
      return workDate === '14.10.2026'
        ? [createOrder('1'), createOrder('2')]
        : [createOrder('1')];
    },
    orderDetails: async (orderId) => {
      detailIds.push(orderId);
      return orderId === '2'
        ? { orderData: { orderId, orderStatus: 'OPEN' } }
        : createDetails(orderId);
    },
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '10/14/2026 12:00:00', slaSurpassed: 'N' }),
    fetchLatestCommentWithSession: async () => ({ text: 'Done', insertTime: '2026-10-14 10:00:00' }),
  };

  try {
    const summary = await syncClosedTickets({
      client,
      repository,
      fromDate: parseDateRangeValue('14.10.2026'),
      toDate: parseDateRangeValue('15.10.2026'),
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-14T12:00:00.000Z'),
      onProgress: (message) => progress.push(message),
    });

    assert.deepEqual(dailyDates, ['14.10.2026', '15.10.2026']);
    assert.deepEqual(detailIds, ['1', '2']);
    assert.equal(summary.inserted, 1);
    assert.equal(summary.notCompleted, 1);
    assert.equal(summary.duplicateInRange, 1);
    assert.equal(repository.count(), 1);
    assert.ok(progress.includes('[1/2] 14.10.2026: fetching workorders...'));
    assert.ok(progress.some((message) => message.includes('saved order 1')));
    assert.equal(progress.some((message) => message.includes('Customer')), false);
  } finally {
    repository.close();
  }
});

test('a repeated sync run skips existing orders without fetching details or updating rows', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const order = createOrder('1');
  const daily = async () => [order];
  const baseClient = {
    dailyWorkorders: daily,
    orderDetails: async () => createDetails('1'),
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '10/14/2026 12:00:00', slaSurpassed: 'N' }),
    fetchLatestCommentWithSession: async () => null,
  };
  const options = {
    repository,
    fromDate: parseDateRangeValue('14.10.2026'),
    toDate: parseDateRangeValue('14.10.2026'),
    minDelayMs: 0,
    maxDelayMs: 0,
    wait: async () => {},
    now: () => new Date('2026-10-14T12:00:00.000Z'),
  };

  try {
    const first = await syncClosedTickets({ ...options, client: baseClient });
    let detailCalls = 0;
    const second = await syncClosedTickets({
      ...options,
      client: { ...baseClient, orderDetails: async () => { detailCalls += 1; return createDetails('1'); } },
    });
    assert.equal(first.inserted, 1);
    assert.equal(second.alreadyPresent, 1);
    assert.equal(detailCalls, 0);
    assert.equal(repository.count(), 1);
  } finally {
    repository.close();
  }
});

test('refresh mode updates existing completed orders without inserting duplicates', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const order = createOrder('refresh');
  let refreshMode = false;
  const client = {
    dailyWorkorders: async () => [order],
    orderDetails: async () => createDetails('refresh'),
    fetchWorkOrderSlaDetailsWithSession: async () => ({
      workOrderSlaDate: refreshMode ? '10/14/2026 09:00:00' : '10/14/2026 11:00:00',
    }),
    fetchLatestCommentWithSession: async () => null,
  };
  const options = {
    client,
    repository,
    fromDate: parseDateRangeValue('14.10.2026'),
    toDate: parseDateRangeValue('14.10.2026'),
    minDelayMs: 0,
    maxDelayMs: 0,
    wait: async () => {},
    now: () => new Date('2026-10-14T12:00:00.000Z'),
  };

  try {
    assert.equal((await syncClosedTickets(options)).inserted, 1);
    assert.equal(repository.listClosedBetween('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z')[0].work_order_sla_outcome, 'on_time');

    refreshMode = true;
    const summary = await syncClosedTickets({ ...options, refreshExisting: true });
    const [updated] = repository.listClosedBetween('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z');
    assert.equal(summary.refreshed, 1);
    assert.equal(summary.inserted, 0);
    assert.equal(summary.alreadyPresent, 0);
    assert.equal(repository.count(), 1);
    assert.equal(updated.work_order_sla_date, '2026-10-14T06:00:00.000Z');
    assert.equal(updated.work_order_sla_outcome, 'late');
  } finally {
    repository.close();
  }
});

test('refresh mode preserves existing data when enrichment fails', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const options = {
    repository,
    fromDate: parseDateRangeValue('14.10.2026'),
    toDate: parseDateRangeValue('14.10.2026'),
    minDelayMs: 0,
    maxDelayMs: 0,
    wait: async () => {},
    now: () => new Date('2026-10-14T12:00:00.000Z'),
  };
  const dateRange = ['2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z'];

  try {
    await syncClosedTickets({
      ...options,
      client: {
        dailyWorkorders: async () => [createOrder('preserve')],
        orderDetails: async () => createDetails('preserve'),
        fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '10/14/2026 11:00:00' }),
        fetchLatestCommentWithSession: async () => null,
      },
    });
    const [before] = repository.listClosedBetween(...dateRange);

    const summary = await syncClosedTickets({
      ...options,
      refreshExisting: true,
      client: {
        dailyWorkorders: async () => [createOrder('preserve')],
        orderDetails: async () => createDetails('preserve'),
        fetchWorkOrderSlaDetailsWithSession: async () => { throw new Error('external unavailable'); },
        fetchLatestCommentWithSession: async () => null,
      },
    });
    const [after] = repository.listClosedBetween(...dateRange);

    assert.equal(summary.failed, 1);
    assert.deepEqual(after, before);
  } finally {
    repository.close();
  }
});

test('uses order details as the completed-status source when the daily listing is stale', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const order = { ...createOrder('changed'), orderStatus: 'OPEN' };
  const client = {
    dailyWorkorders: async () => [order],
    orderDetails: async () => createDetails('changed'),
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '10/14/2026 12:00:00', slaSurpassed: 'N' }),
    fetchLatestCommentWithSession: async () => null,
  };

  try {
    const summary = await syncClosedTickets({
      client,
      repository,
      fromDate: parseDateRangeValue('14.10.2026'),
      toDate: parseDateRangeValue('14.10.2026'),
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-14T12:00:00.000Z'),
    });

    assert.equal(summary.inserted, 1);
    assert.equal(repository.hasOrder('changed'), true);
  } finally {
    repository.close();
  }
});

test('stores only orders whose service group name matches the store', async () => {
  const repository = createClosedTicketRepository(':memory:', 'komotini');
  const withGroup = (orderId, serviceGroup) => {
    const details = createDetails(orderId);
    details.orderData.serviceGroup = serviceGroup;
    return details;
  };
  const client = {
    dailyWorkorders: async () => [createOrder('own'), createOrder('other')],
    orderDetails: async (orderId) => withGroup(orderId, orderId === 'own'
      ? 'NEW TECHNOLOGIES LTD KOMOTINI'
      : 'NEW TECHNOLOGIES AT ORESTIADA'),
    fetchWorkOrderSlaDetailsWithSession: async () => ({ workOrderSlaDate: '10/14/2026 12:00:00' }),
    fetchLatestCommentWithSession: async () => null,
  };

  try {
    const summary = await syncClosedTickets({
      client,
      repository,
      serviceGroupMatch: 'KOMOTINI',
      fromDate: parseDateRangeValue('14.10.2026'),
      toDate: parseDateRangeValue('14.10.2026'),
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
      now: () => new Date('2026-10-14T12:00:00.000Z'),
    });

    assert.equal(summary.inserted, 1);
    assert.equal(summary.otherStore, 1);
    assert.equal(repository.hasOrder('own'), true);
    assert.equal(repository.hasOrder('other'), false);
  } finally {
    repository.close();
  }
});

test('parses CLI dates and repeated service-group options', () => {
  const options = parseArgs([
    '--from-date', '01.08.2026',
    '--to-date', '30.09.2026',
    '--service-group', '395',
    '--service-group', '410',
  ]);
  assert.deepEqual(options.serviceGroups, ['395', '410']);
  assert.equal(options.storeId, 'alexandroupoli');
  assert.equal(options.refreshExisting, false);
  assert.equal(parseArgs([
    '--from-date', '01.08.2026',
    '--to-date', '30.09.2026',
    '--refresh-existing',
  ]).refreshExisting, true);
  assert.equal(parseArgs([
    '--from-date', '01.08.2026', '--to-date', '30.09.2026', '--store', 'komotini',
  ]).storeId, 'komotini');
  assert.equal(parseArgs([
    '--from-date', '01.08.2026', '--to-date', '30.09.2026',
    '--export-json', 'exports/tickets.json',
  ]).exportJson, 'exports/tickets.json');
  assert.throws(() => parseArgs([
    '--from-date', '01.08.2026', '--to-date', '30.09.2026', '--export-json',
  ]), /Missing value for --export-json/);
  assert.throws(() => parseArgs(['--from-date', '01.08.2026']), /Usage:/);
  assert.throws(() => parseArgs(['--from-date', '02.08.2026', '--to-date', '01.08.2026']), /cannot be after/);
});

test('exports matching closed tickets and date/store metadata as JSON', async () => {
  const repository = createClosedTicketRepository(':memory:', 'komotini');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fiona-closed-ticket-export-'));
  const outputPath = path.join(directory, 'exports', 'tickets.json');
  try {
    repository.insert({
      store_id: 'komotini',
      order_id: 'exported',
      service_order_id: null,
      customer_id: null,
      account_afm: null,
      customer_name: null,
      team_name: null,
      city: null,
      street: null,
      house_number: null,
      phone: null,
      service_description: null,
      scheduled_at: null,
      created_at: null,
      closed_at: '2026-10-14T10:00:00.000Z',
      call_deadline: null,
      order_sla_flag: null,
      work_order_sla_date: null,
      work_order_sla_outcome: 'unknown',
      work_order_status: null,
      comment_text: null,
      comment_at: null,
      comment_author: null,
      imported_at: '2026-10-14T10:01:00.000Z',
    });
    const count = await writeClosedTicketExport({
      repository,
      fromDate: parseDateRangeValue('14.10.2026'),
      toDate: parseDateRangeValue('14.10.2026'),
      storeId: 'komotini',
      outputPath,
    });
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(count, 1);
    assert.equal(data.storeId, 'komotini');
    assert.equal(data.fromDate, '14.10.2026');
    assert.equal(data.toDate, '14.10.2026');
    assert.equal(data.count, 1);
    assert.equal(data.records[0].order_id, 'exported');
  } finally {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('does not persist a partial ticket when enrichment fails', async () => {
  const repository = createClosedTicketRepository(':memory:');
  const client = {
    dailyWorkorders: async () => [createOrder('partial')],
    orderDetails: async () => createDetails('partial'),
    fetchWorkOrderSlaDetailsWithSession: async () => { throw new Error('external unavailable'); },
    fetchLatestCommentWithSession: async () => null,
  };

  try {
    const summary = await syncClosedTickets({
      client,
      repository,
      fromDate: parseDateRangeValue('14.10.2026'),
      toDate: parseDateRangeValue('14.10.2026'),
      minDelayMs: 0,
      maxDelayMs: 0,
      wait: async () => {},
    });
    assert.equal(summary.failed, 1);
    assert.equal(repository.count(), 0);
  } finally {
    repository.close();
  }
});