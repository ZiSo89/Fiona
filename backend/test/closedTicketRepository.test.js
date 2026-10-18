import test from 'node:test';
import assert from 'node:assert/strict';
import { createClosedTicketRepository } from '../src/services/closedTicketRepository.js';

const record = {
  order_id: '123',
  service_order_id: 'PS-123-1',
  customer_id: 'C-1',
  account_afm: '123456789',
  customer_name: 'Test Customer',
  team_name: 'Team A',
  city: null,
  street: null,
  house_number: null,
  phone: null,
  service_description: 'FTTH Activation',
  scheduled_at: null,
  created_at: null,
  closed_at: '2026-10-14T09:00:00.000Z',
  call_deadline: null,
  order_sla_flag: null,
  work_order_sla_date: null,
  work_order_sla_outcome: 'unknown',
  work_order_status: null,
  comment_text: null,
  comment_at: null,
  comment_author: null,
  imported_at: '2026-10-14T09:05:00.000Z',
};

test('closed-ticket repository inserts once and can skip an existing order', () => {
  const repository = createClosedTicketRepository(':memory:');
  try {
    assert.equal(repository.hasOrder('123'), false);
    assert.equal(repository.insert(record), true);
    assert.equal(repository.hasOrder('123'), true);
    assert.equal(repository.insert(record), false);
    assert.equal(repository.count(), 1);
  } finally {
    repository.close();
  }
});

test('closed-ticket repository updates only an existing order', () => {
  const repository = createClosedTicketRepository(':memory:');
  try {
    assert.equal(repository.updateExisting(record), false);
    assert.equal(repository.insert(record), true);
    assert.equal(repository.insert({ ...record, work_order_sla_outcome: 'late' }), false);

    assert.equal(repository.updateExisting({
      ...record,
      closed_at: '2026-10-14T10:00:00.000Z',
      work_order_sla_date: '2026-10-14T09:30:00.000Z',
      work_order_sla_outcome: 'late',
    }), true);

    const [updated] = repository.listClosedBetween('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z');
    assert.equal(updated.closed_at, '2026-10-14T10:00:00.000Z');
    assert.equal(updated.work_order_sla_date, '2026-10-14T09:30:00.000Z');
    assert.equal(updated.work_order_sla_outcome, 'late');
    assert.equal(repository.count(), 1);
  } finally {
    repository.close();
  }
});