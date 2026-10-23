import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createClosedTicketRepository } from '../src/repositories/closedTicketRepository.js';
import { createTicketObservationRepository } from '../src/repositories/ticketObservationRepository.js';

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

test('store-scoped repositories allow matching order IDs in separate stores', () => {
  const alexandroupoli = createClosedTicketRepository(':memory:', 'alexandroupoli');
  const komotini = createClosedTicketRepository(':memory:', 'komotini');
  try {
    assert.equal(alexandroupoli.insert(record), true);
    assert.equal(komotini.insert(record), true);
    assert.equal(alexandroupoli.hasOrder('123'), true);
    assert.equal(komotini.hasOrder('123'), true);
    assert.equal(alexandroupoli.count(), 1);
    assert.equal(komotini.count(), 1);
    assert.equal(alexandroupoli.getByOrderId('123').store_id, 'alexandroupoli');
    assert.equal(komotini.getByOrderId('123').store_id, 'komotini');
  } finally {
    alexandroupoli.close();
    komotini.close();
  }
});

test('migrates existing database records and pending closures to Alexandroupoli', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fiona-store-migration-'));
  const dbPath = path.join(directory, 'legacy.sqlite');
  const database = new Database(dbPath);
  database.exec(`
    CREATE TABLE closed_tickets (
      order_id TEXT PRIMARY KEY, service_order_id TEXT, customer_id TEXT, account_afm TEXT,
      customer_name TEXT, team_name TEXT, city TEXT, street TEXT, house_number TEXT, phone TEXT,
      service_description TEXT, scheduled_at TEXT, created_at TEXT, closed_at TEXT NOT NULL,
      call_deadline TEXT, order_sla_flag TEXT, work_order_sla_date TEXT,
      work_order_sla_outcome TEXT NOT NULL CHECK (work_order_sla_outcome IN ('on_time', 'late', 'unknown')),
      work_order_status TEXT, comment_text TEXT, comment_at TEXT, comment_author TEXT, imported_at TEXT NOT NULL
    );
    CREATE TABLE pending_closures (
      order_id TEXT PRIMARY KEY, service_order_id TEXT, team_name TEXT, first_seen_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE ticket_status_observations (
      order_id TEXT NOT NULL, status TEXT NOT NULL, status_time TEXT NOT NULL, service_order_id TEXT,
      call_due_at TEXT, no_of_calls INTEGER, observed_at TEXT NOT NULL,
      PRIMARY KEY (order_id, status, status_time)
    );
  `);
  database.prepare(`INSERT INTO closed_tickets (
    order_id, service_order_id, closed_at, work_order_sla_outcome, imported_at
  ) VALUES (?, ?, ?, ?, ?)`).run('legacy-1', 'PS-legacy-1', record.closed_at, 'unknown', record.imported_at);
  database.prepare(`INSERT INTO pending_closures (order_id, service_order_id, team_name, first_seen_at)
    VALUES (?, ?, ?, ?)`).run('pending-1', 'PS-pending-1', 'Team A', record.imported_at);
  database.prepare(`INSERT INTO ticket_status_observations
    (order_id, status, status_time, service_order_id, call_due_at, no_of_calls, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'legacy-1', 'CALL LATER', '2026-10-14T10:00:00.000Z', 'PS-legacy-1',
    '2026-10-14T09:00:00.000Z', 1, record.imported_at,
  );
  database.close();

  const repository = createClosedTicketRepository(dbPath, null);
  const observations = createTicketObservationRepository(dbPath, null);
  try {
    assert.equal(fs.existsSync(`${dbPath}.pre-store-migration.bak`), true);
    assert.equal(repository.getByOrderId('legacy-1').store_id, 'alexandroupoli');
    assert.equal(repository.listPending()[0].store_id, 'alexandroupoli');
    assert.equal(observations.firstCall('legacy-1', 'alexandroupoli').outcome, 'late');
    assert.equal(repository.insert({ ...record, order_id: 'legacy-1', store_id: 'komotini' }), true);
    assert.equal(repository.getByOrderId('legacy-1', 'komotini').store_id, 'komotini');
  } finally {
    repository.close();
    observations.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});