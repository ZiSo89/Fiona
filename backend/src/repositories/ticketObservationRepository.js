import { openDatabase } from './database.js';
import { config } from '../config.js';
import { backupBeforeStoreMigration } from './sqliteMigrationBackup.js';

// A ticket counts as called once Fiona moves it to one of these statuses.
const CONTACT_STATUSES = ['CALL LATER', 'APPOINTMENT'];
const CALL_LATER_MONITORING_UNTIL = '2026-11-05T08:43:00.000Z';

export async function createTicketObservationRepository(dbPath = config.closedTicketsDbPath, storeId = 'alexandroupoli', client = config.dbClient) {
  const database = await openDatabase(dbPath, client);
  try {
    if (database.dialect === 'sqlite') {
      await database.pragma('journal_mode = WAL');
      await database.pragma('busy_timeout = 5000');
      await database.exec(`
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
      }
    await database.prepare(`
    INSERT OR IGNORE INTO call_later_monitoring (id, expires_at)
    VALUES (1, ?)
  `).run(CALL_LATER_MONITORING_UNTIL);
    // Extend existing installations once, without restarting the clock on each deploy.
    await database.prepare(`
    UPDATE call_later_monitoring SET expires_at = ?
    WHERE id = 1 AND expires_at < ?
  `).run(CALL_LATER_MONITORING_UNTIL, CALL_LATER_MONITORING_UNTIL);
    const monitoringExpiryStatement = database.prepare(
      'SELECT expires_at FROM call_later_monitoring WHERE id = 1'
    );

    if (database.dialect === 'sqlite') {
      const existingColumns = await database.prepare('PRAGMA table_info(ticket_status_observations)').all();
      const existingColumnNames = new Set(existingColumns.map((column) => column.name));
      const primaryKey = existingColumns.filter((column) => column.pk)
        .sort((a, b) => a.pk - b.pk)
        .map((column) => column.name);
      if (!existingColumnNames.has('store_id') || primaryKey.join(',') !== 'store_id,order_id,status,status_time') {
        await backupBeforeStoreMigration(database, dbPath);
        const migrate = database.transaction(async () => {
          await database.exec('ALTER TABLE ticket_status_observations RENAME TO ticket_status_observations_legacy');
          await database.exec(`CREATE TABLE ticket_status_observations (
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
          await database.exec(`INSERT INTO ticket_status_observations
        (store_id, order_id, status, status_time, service_order_id, call_due_at, no_of_calls, observed_at)
        SELECT ${existingColumnNames.has('store_id') ? 'store_id' : "'alexandroupoli'"}, order_id, status,
          status_time, service_order_id, call_due_at, no_of_calls, observed_at
        FROM ticket_status_observations_legacy`);
          await database.exec('DROP TABLE ticket_status_observations_legacy');
        });
        await migrate();
      }

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

    const insertMany = database.transaction(async (rows) => {
      const { expires_at: callLaterMonitoringExpiresAt } = await monitoringExpiryStatement.get();
      let inserted = 0;
      for (const row of rows) {
        inserted += (await insertStatement.run(row)).changes;

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
        const previous = await latestCallLaterUpdateStatement.get(update.store_id, update.order_id);
        if (!previous || Object.keys(previous).some((key) => previous[key] !== update[key])) {
          await insertCallLaterUpdateStatement.run(update);
        }
      }
      return inserted;
    });

    return {
      async record(tickets, observedAt = new Date()) {
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
        return await insertMany(rows);
      },
      async firstCall(orderId, requestedStoreId = storeId) {
        const contact = await firstContactStatement.get(String(orderId), requestedStoreId, requestedStoreId, ...CONTACT_STATUSES);
        const due = await callDueStatement.get(String(orderId), requestedStoreId, requestedStoreId);
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
      async callLaterHistory(orderId, requestedStoreId = storeId) {
        return await callLaterHistoryStatement.all(String(orderId), requestedStoreId, requestedStoreId);
      },
      async callLaterMonitoringReport({ storeId: scope = storeId, limit = 100, offset = 0 } = {}) {
        const summary = await database.prepare(`
          SELECT COUNT(*) AS tickets, COALESCE(SUM(captures), 0) AS captures,
            COALESCE(SUM(CASE WHEN captures > 1 THEN 1 ELSE 0 END), 0) AS ticketsWithChanges,
            MIN(first_observed) AS firstObservedAt, MAX(last_observed) AS lastObservedAt
          FROM (
            SELECT COUNT(*) AS captures, MIN(observed_at) AS first_observed, MAX(observed_at) AS last_observed
            FROM call_later_update_observations
            WHERE (? IS NULL OR store_id = ?)
            GROUP BY store_id, order_id
          ) AS histories
        `).get(scope, scope);
        const observations = await database.prepare(`
          SELECT store_id AS storeId, order_id AS orderId, service_order_id AS serviceOrderId,
            status_time AS statusTime, call_later_at AS callLaterAt,
            last_interaction_at AS lastInteractionAt, call_due_at AS callDueAt,
            no_of_calls AS noOfCalls, observed_at AS observedAt
          FROM call_later_update_observations
          WHERE (? IS NULL OR store_id = ?)
          ORDER BY observed_at ASC, id ASC LIMIT ? OFFSET ?
        `).all(scope, scope, limit, offset);
        const expiresAt = (await monitoringExpiryStatement.get()).expires_at;
        return {
          expiresAt,
          active: Date.now() <= Date.parse(expiresAt),
          summary: {
            ...summary,
            tickets: Number(summary.tickets),
            captures: Number(summary.captures),
            ticketsWithChanges: Number(summary.ticketsWithChanges),
          },
          observations,
          limit,
          offset,
          hasMore: offset + observations.length < Number(summary.captures),
        };
      },
      async callLaterMonitoringExpiresAt() {
        return (await monitoringExpiryStatement.get()).expires_at;
      },
      async close() {
        await database.close();
      },
    };
    } catch (error) {
    await database.close();
    throw error;
  }
}
