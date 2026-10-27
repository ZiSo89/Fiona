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
    CREATE TABLE IF NOT EXISTS call_later_update_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      service_order_id TEXT,
      status_time TEXT,
      call_later_at TEXT,
      last_interaction_at TEXT,
      call_due_at TEXT,
      no_of_calls INTEGER,
      observed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS call_later_monitoring (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_call_later_update_observations_order
      ON call_later_update_observations (store_id, order_id, observed_at);
  `);
  database.prepare(`
    INSERT OR IGNORE INTO call_later_monitoring (id, expires_at)
    VALUES (1, ?)
  `).run(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  const callLaterMonitoringExpiresAt = database.prepare(
    'SELECT expires_at FROM call_later_monitoring WHERE id = 1'
  ).get().expires_at;

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
  const latestCallLaterUpdateStatement = database.prepare(`
    SELECT status_time, call_later_at, last_interaction_at, call_due_at, no_of_calls
    FROM call_later_update_observations
    WHERE store_id = ? AND order_id = ?
    ORDER BY observed_at DESC, id DESC
    LIMIT 1
  `);
  const insertCallLaterUpdateStatement = database.prepare(`
    INSERT INTO call_later_update_observations
      (store_id, order_id, service_order_id, status_time, call_later_at, last_interaction_at,
       call_due_at, no_of_calls, observed_at)
    VALUES (@store_id, @order_id, @service_order_id, @status_time, @call_later_at,
       @last_interaction_at, @call_due_at, @no_of_calls, @observed_at)
  `);
  const callLaterHistoryStatement = database.prepare(`
    SELECT service_order_id AS serviceOrderId, status_time AS statusTime,
      call_later_at AS callLaterAt, last_interaction_at AS lastInteractionAt,
      call_due_at AS callDueAt, no_of_calls AS noOfCalls, observed_at AS observedAt
    FROM call_later_update_observations
    WHERE order_id = ? AND (? IS NULL OR store_id = ?)
    ORDER BY observed_at ASC, id ASC
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
    for (const row of rows) {
      inserted += insertStatement.run(row).changes;

      if (row.status !== 'CALL LATER' || Date.parse(row.observed_at) > Date.parse(callLaterMonitoringExpiresAt)) continue;
      const update = {
        store_id: row.store_id,
        order_id: row.order_id,
        service_order_id: row.service_order_id,
        status_time: row.call_later_status_time,
        call_later_at: row.call_later_at,
        last_interaction_at: row.last_interaction_at,
        call_due_at: row.call_due_at,
        no_of_calls: row.no_of_calls,
        observed_at: row.observed_at,
      };
      const previous = latestCallLaterUpdateStatement.get(update.store_id, update.order_id);
      if (!previous || Object.keys(previous).some((key) => previous[key] !== update[key])) {
        insertCallLaterUpdateStatement.run(update);
      }
    }
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
          call_later_status_time: ticket?.timeline?.statusTime || null,
          service_order_id: ticket?.serviceOrderId ? String(ticket.serviceOrderId) : null,
          call_due_at: ticket?.sla?.activityDueDate || null,
          call_later_at: ticket?.timeline?.callLaterTime || null,
          last_interaction_at: ticket?.timeline?.lastInteractionTime || null,
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
    callLaterHistory(orderId, requestedStoreId = storeId) {
      return callLaterHistoryStatement.all(String(orderId), requestedStoreId, requestedStoreId);
    },
    callLaterMonitoringExpiresAt() {
      return callLaterMonitoringExpiresAt;
    },
    close() {
      database.close();
    },
  };
}
