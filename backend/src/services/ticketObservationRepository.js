import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { backupBeforeStoreMigration } from './sqliteMigrationBackup.js';

// A ticket counts as called once Fiona moves it to one of these statuses.
const CONTACT_STATUSES = ['CALL LATER', 'APPOINTMENT'];

export function createTicketObservationRepository(dbPath = config.closedTicketsDbPath, storeId = 'alexandroupoli') {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS ticket_status_observations (
      store_id TEXT NOT NULL DEFAULT 'alexandroupoli',
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      status_time TEXT NOT NULL,
      service_order_id TEXT,
      call_due_at TEXT,
      no_of_calls INTEGER,
      observed_at TEXT NOT NULL,
      PRIMARY KEY (store_id, order_id, status, status_time)
    );
  `);

  const existingColumns = database.prepare('PRAGMA table_info(ticket_status_observations)').all();
  const existingColumnNames = new Set(existingColumns.map((column) => column.name));
  const primaryKey = existingColumns.filter((column) => column.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  if (!existingColumnNames.has('store_id') || primaryKey.join(',') !== 'store_id,order_id,status,status_time') {
    backupBeforeStoreMigration(database, dbPath);
    const migrate = database.transaction(() => {
      database.exec('ALTER TABLE ticket_status_observations RENAME TO ticket_status_observations_legacy');
      database.exec(`CREATE TABLE ticket_status_observations (
        store_id TEXT NOT NULL DEFAULT 'alexandroupoli',
        order_id TEXT NOT NULL,
        status TEXT NOT NULL,
        status_time TEXT NOT NULL,
        service_order_id TEXT,
        call_due_at TEXT,
        no_of_calls INTEGER,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (store_id, order_id, status, status_time)
      )`);
      database.exec(`INSERT INTO ticket_status_observations
        (store_id, order_id, status, status_time, service_order_id, call_due_at, no_of_calls, observed_at)
        SELECT ${existingColumnNames.has('store_id') ? 'store_id' : "'alexandroupoli'"}, order_id, status,
          status_time, service_order_id, call_due_at, no_of_calls, observed_at
        FROM ticket_status_observations_legacy`);
      database.exec('DROP TABLE ticket_status_observations_legacy');
    });
    migrate();
  }

  const insertStatement = database.prepare(`
    INSERT OR IGNORE INTO ticket_status_observations
      (store_id, order_id, status, status_time, service_order_id, call_due_at, no_of_calls, observed_at)
    VALUES (@store_id, @order_id, @status, @status_time, @service_order_id, @call_due_at, @no_of_calls, @observed_at)
  `);
  const firstContactStatement = database.prepare(`
    SELECT status, status_time FROM ticket_status_observations
    WHERE order_id = ? AND (? IS NULL OR store_id = ?) AND status IN (${CONTACT_STATUSES.map(() => '?').join(', ')})
    ORDER BY status_time ASC LIMIT 1
  `);
  const callDueStatement = database.prepare(`
    SELECT call_due_at FROM ticket_status_observations
    WHERE order_id = ? AND (? IS NULL OR store_id = ?) AND call_due_at IS NOT NULL
    ORDER BY observed_at DESC LIMIT 1
  `);

  const insertMany = database.transaction((rows) => {
    let inserted = 0;
    for (const row of rows) inserted += insertStatement.run(row).changes;
    return inserted;
  });

  return {
    record(tickets, observedAt = new Date()) {
      const observed = observedAt.toISOString();
      const rows = tickets
        .map((ticket) => ({
          store_id: ticket?.storeId || storeId || 'alexandroupoli',
          order_id: String(ticket?.id ?? ''),
          status: String(ticket?.order?.status ?? '').trim().toUpperCase(),
          status_time: ticket?.timeline?.statusTime || observed,
          service_order_id: ticket?.serviceOrderId ? String(ticket.serviceOrderId) : null,
          call_due_at: ticket?.sla?.activityDueDate || null,
          no_of_calls: Number.isFinite(Number(ticket?.communication?.noOfCalls))
            ? Number(ticket.communication.noOfCalls)
            : null,
          observed_at: observed,
        }))
        .filter((row) => row.order_id && row.status);
      return insertMany(rows);
    },
    firstCall(orderId, requestedStoreId = storeId) {
      const contact = firstContactStatement.get(String(orderId), requestedStoreId, requestedStoreId, ...CONTACT_STATUSES);
      const due = callDueStatement.get(String(orderId), requestedStoreId, requestedStoreId);
      const firstContactAt = contact?.status_time ?? null;
      const callDueAt = due?.call_due_at ?? null;
      let outcome = 'unknown';
      if (firstContactAt && callDueAt) {
        outcome = new Date(firstContactAt) <= new Date(callDueAt) ? 'on_time' : 'late';
      }
      return {
        firstContactAt,
        firstContactStatus: contact?.status ?? null,
        callDueAt,
        outcome,
      };
    },
    close() {
      database.close();
    },
  };
}
