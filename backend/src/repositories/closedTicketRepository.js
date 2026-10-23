import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { backupBeforeStoreMigration } from './sqliteMigrationBackup.js';

const columns = [
  'store_id',
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

function closedTicketsTableSql(tableName = 'closed_tickets') {
  return `CREATE TABLE ${tableName} (
    store_id TEXT NOT NULL DEFAULT 'alexandroupoli',
    order_id TEXT NOT NULL,
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
    imported_at TEXT NOT NULL,
    PRIMARY KEY (store_id, order_id)
  )`;
}

function pendingClosuresTableSql(tableName = 'pending_closures') {
  return `CREATE TABLE ${tableName} (
    store_id TEXT NOT NULL DEFAULT 'alexandroupoli',
    order_id TEXT NOT NULL,
    service_order_id TEXT,
    team_name TEXT,
    first_seen_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, order_id)
  )`;
}

export function createClosedTicketRepository(dbPath = config.closedTicketsDbPath, storeId = 'alexandroupoli') {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.exec(`
    CREATE TABLE IF NOT EXISTS closed_tickets (
      store_id TEXT NOT NULL DEFAULT 'alexandroupoli',
      order_id TEXT NOT NULL,
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
      imported_at TEXT NOT NULL,
      PRIMARY KEY (store_id, order_id)
    );
    CREATE TABLE IF NOT EXISTS pending_closures (
      store_id TEXT NOT NULL DEFAULT 'alexandroupoli',
      order_id TEXT NOT NULL,
      service_order_id TEXT,
      team_name TEXT,
      first_seen_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (store_id, order_id)
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

  const closedTicketColumns = new Set(
    database.prepare('PRAGMA table_info(closed_tickets)').all().map((column) => column.name),
  );
  const closedTicketPrimaryKey = database.prepare('PRAGMA table_info(closed_tickets)').all()
    .filter((column) => column.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  const pendingTableInfo = database.prepare('PRAGMA table_info(pending_closures)').all();
  const pendingColumnsBeforeMigration = new Set(pendingTableInfo.map((column) => column.name));
  const pendingPrimaryKeyBeforeMigration = pendingTableInfo.filter((column) => column.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  if (!closedTicketColumns.has('store_id') || closedTicketPrimaryKey.join(',') !== 'store_id,order_id'
    || !pendingColumnsBeforeMigration.has('store_id')
    || pendingPrimaryKeyBeforeMigration.join(',') !== 'store_id,order_id') {
    backupBeforeStoreMigration(database, dbPath);
  }
  if (!closedTicketColumns.has('store_id') || closedTicketPrimaryKey.join(',') !== 'store_id,order_id') {
    const availableColumns = closedTicketColumns;
    const selectColumns = columns.map((column) => (
      availableColumns.has(column) ? `"${column}"` : column === 'store_id' ? "'alexandroupoli'" : 'NULL'
    ));
    const migrate = database.transaction(() => {
      database.exec('ALTER TABLE closed_tickets RENAME TO closed_tickets_legacy');
      database.exec(closedTicketsTableSql('closed_tickets'));
      database.exec(`INSERT INTO closed_tickets (${columns.join(', ')})
        SELECT ${selectColumns.join(', ')} FROM closed_tickets_legacy`);
      database.exec('DROP TABLE closed_tickets_legacy');
    });
    migrate();
  }

  const pendingColumns = new Set(
    database.prepare('PRAGMA table_info(pending_closures)').all().map((column) => column.name),
  );
  const pendingPrimaryKey = database.prepare('PRAGMA table_info(pending_closures)').all()
    .filter((column) => column.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  if (!pendingColumns.has('store_id') || pendingPrimaryKey.join(',') !== 'store_id,order_id') {
    const migrate = database.transaction(() => {
      database.exec('ALTER TABLE pending_closures RENAME TO pending_closures_legacy');
      database.exec(pendingClosuresTableSql('pending_closures'));
      database.exec(`INSERT INTO pending_closures (store_id, order_id, service_order_id, team_name, first_seen_at, attempts)
        SELECT ${pendingColumns.has('store_id') ? 'store_id' : "'alexandroupoli'"}, order_id, service_order_id,
          team_name, first_seen_at, attempts FROM pending_closures_legacy`);
      database.exec('DROP TABLE pending_closures_legacy');
    });
    migrate();
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_closed_tickets_closed_at ON closed_tickets(closed_at);
    CREATE INDEX IF NOT EXISTS idx_closed_tickets_service_order_id ON closed_tickets(service_order_id);
    CREATE INDEX IF NOT EXISTS idx_closed_tickets_team_name ON closed_tickets(team_name);
  `);

  const hasOrderStatement = database.prepare(
    'SELECT 1 FROM closed_tickets WHERE order_id = ? AND (? IS NULL OR store_id = ?) LIMIT 1',
  );
  const insertStatement = database.prepare(`
    INSERT OR IGNORE INTO closed_tickets (${columns.join(', ')})
    VALUES (${columns.map((column) => `@${column}`).join(', ')})
  `);
  const updateStatement = database.prepare(`
    UPDATE closed_tickets SET ${columns.slice(2).map((column) => `${column} = @${column}`).join(', ')}
    WHERE store_id = @store_id AND order_id = @order_id
  `);
  const countStatement = database.prepare('SELECT COUNT(*) AS count FROM closed_tickets WHERE (? IS NULL OR store_id = ?)');
  const getStatement = database.prepare(`
    SELECT store_id, order_id, service_order_id, customer_id, account_afm, customer_name, team_name, city, street,
      house_number, phone, service_description, created_at, scheduled_at, closed_at, comment_text
    FROM closed_tickets WHERE order_id = ? AND (? IS NULL OR store_id = ?)
  `);
  const getTrackerEditorDetailsStatement = database.prepare(`
    SELECT store_id, order_id, service_order_id, customer_name, city, street,
      house_number, service_description, comment_text, comment_at
    FROM closed_tickets WHERE order_id = ? AND store_id = ?
  `);
  const trackStatement = database.prepare(`
    INSERT OR IGNORE INTO pending_closures (store_id, order_id, service_order_id, team_name, first_seen_at)
    SELECT @store_id, @order_id, @service_order_id, @team_name, @seen_at
    WHERE NOT EXISTS (SELECT 1 FROM closed_tickets WHERE store_id = @store_id AND order_id = @order_id)
  `);
  const listPendingStatement = database.prepare('SELECT * FROM pending_closures WHERE (? IS NULL OR store_id = ?) ORDER BY first_seen_at');
  const deletePendingStatement = database.prepare('DELETE FROM pending_closures WHERE order_id = ? AND (? IS NULL OR store_id = ?)');
  const bumpPendingStatement = database.prepare('UPDATE pending_closures SET attempts = attempts + 1 WHERE order_id = ? AND (? IS NULL OR store_id = ?)');
  const trackMany = database.transaction((rows) => {
    for (const row of rows) trackStatement.run(row);
  });
  const listBetweenStatement = database.prepare(`
    SELECT store_id, order_id, service_order_id, team_name, service_description, closed_at,
      customer_name, city, street, house_number,
      work_order_sla_date, work_order_sla_outcome
    FROM closed_tickets WHERE closed_at >= ? AND closed_at < ? AND (? IS NULL OR store_id = ?) ORDER BY closed_at
  `);
  const exportBetweenStatement = database.prepare(`
    SELECT ${columns.join(', ')}
    FROM closed_tickets WHERE closed_at >= ? AND closed_at < ? AND (? IS NULL OR store_id = ?) ORDER BY closed_at
  `);

  return {
    hasOrder(orderId) {
      return Boolean(hasOrderStatement.get(String(orderId), storeId, storeId));
    },
    insert(record) {
      const result = insertStatement.run({ ...record, store_id: record.store_id || storeId || 'alexandroupoli' });
      return result.changes === 1;
    },
    updateExisting(record) {
      const result = updateStatement.run({ ...record, store_id: record.store_id || storeId || 'alexandroupoli' });
      return result.changes === 1;
    },
    count() {
      return countStatement.get(storeId, storeId).count;
    },
    trackOpen(rows, seenAt = new Date()) {
      trackMany(rows.map((row) => ({ ...row, store_id: row.store_id || storeId || 'alexandroupoli', seen_at: seenAt.toISOString() })));
    },
    listPending() {
      return listPendingStatement.all(storeId, storeId);
    },
    bumpPending(orderId, pendingStoreId = storeId) {
      bumpPendingStatement.run(String(orderId), pendingStoreId, pendingStoreId);
    },
    removePending(orderId, pendingStoreId = storeId) {
      deletePendingStatement.run(String(orderId), pendingStoreId, pendingStoreId);
    },
    listClosedBetween(fromIso, toIso) {
      return listBetweenStatement.all(fromIso, toIso, storeId, storeId);
    },
    exportClosedBetween(fromIso, toIso) {
      return exportBetweenStatement.all(fromIso, toIso, storeId, storeId);
    },
    getByOrderId(orderId, requestedStoreId = storeId) {
      return getStatement.get(String(orderId), requestedStoreId, requestedStoreId) ?? null;
    },
    getTrackerEditorDetails(orderId, requestedStoreId = storeId) {
      return getTrackerEditorDetailsStatement.get(String(orderId), requestedStoreId) ?? null;
    },
    close() {
      database.close();
    },
  };
}