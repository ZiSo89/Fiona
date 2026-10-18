import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const columns = [
  'order_id',
  'service_order_id',
  'customer_id',
  'account_afm',
  'customer_name',
  'team_name',
  'city',
  'street',
  'house_number',
  'phone',
  'service_description',
  'scheduled_at',
  'created_at',
  'closed_at',
  'call_deadline',
  'order_sla_flag',
  'work_order_sla_date',
  'work_order_sla_outcome',
  'work_order_status',
  'comment_text',
  'comment_at',
  'comment_author',
  'imported_at',
];

export function createClosedTicketRepository(dbPath = config.closedTicketsDbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS closed_tickets (
      order_id TEXT PRIMARY KEY,
      service_order_id TEXT,
      customer_id TEXT,
      account_afm TEXT,
      customer_name TEXT,
      team_name TEXT,
      city TEXT,
      street TEXT,
      house_number TEXT,
      phone TEXT,
      service_description TEXT,
      scheduled_at TEXT,
      created_at TEXT,
      closed_at TEXT NOT NULL,
      call_deadline TEXT,
      order_sla_flag TEXT,
      work_order_sla_date TEXT,
      work_order_sla_outcome TEXT NOT NULL CHECK (work_order_sla_outcome IN ('on_time', 'late', 'unknown')),
      work_order_status TEXT,
      comment_text TEXT,
      comment_at TEXT,
      comment_author TEXT,
      imported_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_closed_tickets_closed_at ON closed_tickets(closed_at);
    CREATE INDEX IF NOT EXISTS idx_closed_tickets_service_order_id ON closed_tickets(service_order_id);
    CREATE INDEX IF NOT EXISTS idx_closed_tickets_team_name ON closed_tickets(team_name);
    CREATE TABLE IF NOT EXISTS pending_closures (
      order_id TEXT PRIMARY KEY,
      service_order_id TEXT,
      team_name TEXT,
      first_seen_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
  `);

  // The order deadline is the first-call deadline, so earlier databases drop its completion outcome.
  const existingColumns = new Set(
    database.prepare('PRAGMA table_info(closed_tickets)').all().map((column) => column.name),
  );
  if (existingColumns.has('order_deadline')) {
    database.exec('ALTER TABLE closed_tickets RENAME COLUMN order_deadline TO call_deadline');
  }
  for (const column of ['order_sla_outcome', 'sla_reconciliation', 'sla_surpassed']) {
    if (existingColumns.has(column)) database.exec(`ALTER TABLE closed_tickets DROP COLUMN ${column}`);
  }

  const hasOrderStatement = database.prepare(
    'SELECT 1 FROM closed_tickets WHERE order_id = ? LIMIT 1',
  );
  const insertStatement = database.prepare(`
    INSERT OR IGNORE INTO closed_tickets (${columns.join(', ')})
    VALUES (${columns.map((column) => `@${column}`).join(', ')})
  `);
  const updateStatement = database.prepare(`
    UPDATE closed_tickets SET ${columns.slice(1).map((column) => `${column} = @${column}`).join(', ')}
    WHERE order_id = @order_id
  `);
  const countStatement = database.prepare('SELECT COUNT(*) AS count FROM closed_tickets');
  const getStatement = database.prepare(`
    SELECT order_id, service_order_id, customer_id, account_afm, customer_name, team_name, city, street,
      house_number, phone, service_description, created_at, scheduled_at, closed_at
    FROM closed_tickets WHERE order_id = ?
  `);
  const trackStatement = database.prepare(`
    INSERT OR IGNORE INTO pending_closures (order_id, service_order_id, team_name, first_seen_at)
    SELECT @order_id, @service_order_id, @team_name, @seen_at
    WHERE NOT EXISTS (SELECT 1 FROM closed_tickets WHERE order_id = @order_id)
  `);
  const listPendingStatement = database.prepare('SELECT * FROM pending_closures ORDER BY first_seen_at');
  const deletePendingStatement = database.prepare('DELETE FROM pending_closures WHERE order_id = ?');
  const bumpPendingStatement = database.prepare('UPDATE pending_closures SET attempts = attempts + 1 WHERE order_id = ?');
  const trackMany = database.transaction((rows) => {
    for (const row of rows) trackStatement.run(row);
  });
  const listBetweenStatement = database.prepare(`
    SELECT order_id, service_order_id, team_name, service_description, closed_at,
      customer_name, city, street, house_number,
      work_order_sla_date, work_order_sla_outcome
    FROM closed_tickets WHERE closed_at >= ? AND closed_at < ? ORDER BY closed_at
  `);

  return {
    hasOrder(orderId) {
      return Boolean(hasOrderStatement.get(String(orderId)));
    },
    insert(record) {
      const result = insertStatement.run(record);
      return result.changes === 1;
    },
    updateExisting(record) {
      const result = updateStatement.run(record);
      return result.changes === 1;
    },
    count() {
      return countStatement.get().count;
    },
    trackOpen(rows, seenAt = new Date()) {
      trackMany(rows.map((row) => ({ ...row, seen_at: seenAt.toISOString() })));
    },
    listPending() {
      return listPendingStatement.all();
    },
    bumpPending(orderId) {
      bumpPendingStatement.run(String(orderId));
    },
    removePending(orderId) {
      deletePendingStatement.run(String(orderId));
    },
    listClosedBetween(fromIso, toIso) {
      return listBetweenStatement.all(fromIso, toIso);
    },
    getByOrderId(orderId) {
      return getStatement.get(String(orderId)) ?? null;
    },
    close() {
      database.close();
    },
  };
}