import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { openDatabase } from '../src/repositories/database.js';
import { mysqlTables } from '../src/repositories/mysqlSchema.js';
import { createClosedTicketRepository } from '../src/repositories/closedTicketRepository.js';
import { createTicketObservationRepository } from '../src/repositories/ticketObservationRepository.js';
import { createProjectTrackerRepository } from '../src/repositories/projectTrackerRepository.js';
import { exportSqliteDatabase, importDatabaseExport } from '../src/services/databaseMigration.js';
import { buildMonthlyStats } from '../src/services/closedTicketStats.js';
import { createMigrationFixture } from './helpers/migrationFixture.js';

test('real MySQL/MariaDB storage and SQLite migration', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async (t) => {
  // Use only a dedicated test server: this user must be allowed to create a disposable database.
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  const name = `fiona_test_${randomBytes(8).toString('hex')}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fiona-mysql-'));
  const originalName = process.env.DB_NAME;
  const originalClient = config.dbClient;
  let database;
  const repositories = [];
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    process.env.DB_NAME = name;
    config.dbClient = 'mysql';
    database = await openDatabase();
    await t.test('exports all SQLite data without modifying the source', async () => {
      // The fixture uses explicit SQLite connections even when the app is configured for MySQL.
      const filename = path.join(directory, 'source.sqlite');
      await createMigrationFixture(filename);
      return exportSqliteDatabase(filename);
    });
    const exported = await exportSqliteDatabase(path.join(directory, 'source.sqlite'));

    await t.test('failed import rolls back every table', async () => {
      const invalid = structuredClone(exported);
      invalid.tables.project_tracker_jobs[0].store_id = 'x'.repeat(65);
      invalid.sha256 = createHash('sha256').update(JSON.stringify(invalid.tables)).digest('hex');
      await assert.rejects(() => importDatabaseExport(database, invalid), /Data too long/);
      for (const table of Object.keys(mysqlTables)) {
        assert.equal(Number((await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).count), 0);
      }
    });
    await t.test('import verifies every field and refuses a second import', async () => {
      const counts = await importDatabaseExport(database, exported);
      for (const table of Object.keys(mysqlTables)) assert.equal(counts[table], exported.tables[table].length);
      await assert.rejects(() => importDatabaseExport(database, exported), /not empty/);
    });

    const [closed, observations, tracker] = await Promise.all([
      createClosedTicketRepository(undefined, 'alexandroupoli'),
      createTicketObservationRepository(undefined, 'alexandroupoli'),
      createProjectTrackerRepository(),
    ]);
    repositories.push(closed, observations, tracker);
    await t.test('retains identities, cutover, manual points, locks and audit', async () => {
      assert.equal(await closed.count(), 1);
      assert.equal((await closed.getByOrderId('order-1')).customer_name, '\u0394\u03bf\u03ba\u03b9\u03bc\u03ae \u{1F600}');
      assert.equal(await tracker.ensureCutoverAt(new Date()), '2026-10-28T07:00:00.000Z');
      assert.equal((await tracker.getJob('alexandroupoli', 'order-1')).points, 21);
      assert.equal((await tracker.getMonthLock('alexandroupoli', 'Team One', '2026-10')).locked, true);
      assert.equal((await tracker.getAudit('alexandroupoli', 'order-1')).length, 1);
      assert.equal((await tracker.getEditorDetailsCache('alexandroupoli', 'order-1')).commentText, 'Stored comment');
      assert.equal((await observations.callLaterHistory('order-1')).length, 1);
      await assert.rejects(() => tracker.correctJob({
        storeId: 'alexandroupoli', orderId: 'order-1', teamName: 'Team One',
        categoryId: 'dth_tv_impairment', changedAt: new Date().toISOString(),
      }), { code: 'PROJECT_TRACKER_MONTH_LOCKED' });
    });
    await t.test('duplicates are no-ops, updates match SQLite semantics and pending retries work', async () => {
      const record = exported.tables.closed_tickets[0];
      assert.equal(await closed.insert(record), false);
      assert.equal(await closed.updateExisting(record), true);
      assert.equal(await closed.insert({ ...record, order_id: 'ORDER-1' }), true);
      assert.equal(await closed.count(), 2);
      await closed.trackOpen([{ order_id: 'pending-2', service_order_id: null, team_name: 'Team One' }]);
      await closed.trackOpen([{ order_id: 'pending-2', service_order_id: null, team_name: 'Team One' }]);
      assert.equal((await closed.listPending()).length, 2);
      await closed.schedulePendingRetry('pending-2', new Date('2099-01-01'));
      assert.equal((await closed.listDuePending()).length, 1);
      await closed.removePending('pending-2');
      assert.equal((await closed.listPending()).length, 1);
      await closed.trackUnknownClosed();
      await closed.trackGroupNamedClosed('Team');
    });
    await t.test('tracker upserts, summary types and Athens boundaries retain API shapes', async () => {
      const profiles = await tracker.getProfiles();
      assert.equal(typeof profiles[0].jobCount, 'number');
      assert.equal(typeof profiles[0].unmappedCount, 'number');
      assert.equal((await tracker.getMonthJobs('2026-10')).length, 1);
      assert.equal((await tracker.getDayJobs('2026-10-28')).length, 1);
      await tracker.setMonthLock({
        storeId: 'alexandroupoli', teamName: 'Team One', month: '2026-10',
        locked: false, changedAt: '2026-10-29T00:00:00.000Z',
      });
      assert.equal((await tracker.getMonthLock('alexandroupoli', 'Team One', '2026-10')).locked, false);
      await tracker.saveEditorDetailsCache('alexandroupoli', 'order-1', {
        problemDescription: null, commentText: 'Updated', commentAt: null, fetchedAt: '2026-10-29T00:00:00.000Z',
      });
      assert.equal((await tracker.getEditorDetailsCache('alexandroupoli', 'order-1')).commentText, 'Updated');
      assert.equal(await tracker.updateJobTeamName('alexandroupoli', 'order-1', 'Team One'), false);
      const stats = await buildMonthlyStats('2026-10', closed, observations);
      assert.equal(stats.totals.total, 2);
      assert.equal(stats.firstCall.onTime, 1);
    });
    await t.test('a failed audit insert rolls back the correction', async () => {
      await admin.query(`CREATE TRIGGER \`${name}\`.reject_audit BEFORE INSERT ON \`${name}\`.project_tracker_audit
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected audit failure'`);
      await assert.rejects(() => tracker.correctJob({
        storeId: 'alexandroupoli', orderId: 'order-1', teamName: 'Team One',
        categoryId: 'dth_tv_impairment', changedAt: new Date().toISOString(),
      }), /injected audit failure/);
      await admin.query(`DROP TRIGGER \`${name}\`.reject_audit`);
      assert.equal((await tracker.getJob('alexandroupoli', 'order-1')).points, 21);
      assert.equal((await tracker.getAudit('alexandroupoli', 'order-1')).length, 1);
    });
    await t.test('job imports, category mapping and scoring use the same domain rules', async () => {
      const job = {
        storeId: 'komotini', orderId: 'order-2', teamName: 'Team Two',
        closedAt: '2026-10-28T07:00:00.000Z', importedAt: '2026-10-28T07:00:00.000Z',
        sourceLabel: 'Custom fiber', sourceCategoryId: null, categoryId: null,
      };
      assert.equal(await tracker.insertJob(job), true);
      assert.equal(await tracker.insertJob(job), false);
      assert.equal(await tracker.hasJob('komotini', 'order-2'), true);
      assert.equal(await tracker.applyCategoryMap({ 'Custom fiber': 'ftth_installation' }), 1);
      assert.equal((await tracker.getJobsNeedingScoring(4)).some((row) => row.orderId === 'order-2'), true);
      assert.equal(await tracker.updateJobScoring('komotini', 'order-2', 15, new Date().toISOString(), 'category', 4), true);
      assert.equal((await tracker.getJob('komotini', 'order-2')).points, 15);
      assert.equal(await tracker.updateJobTeamName('komotini', 'order-2', 'Team Three'), true);
      assert.deepEqual(await tracker.getJobsWithObsoleteCategory(), []);
      assert.equal((await tracker.getAudit('komotini', 'order-2')).length, 2);
    });
    await t.test('new call observations append after imported IDs without duplicating statuses', async () => {
      const ticket = {
        id: 'order-1', order: { status: 'CALL LATER' },
        timeline: { statusTime: '2026-10-28T07:00:00.000Z', callLaterTime: '2026-10-28T08:00:00.000Z' },
        sla: { activityDueDate: '2026-10-28T07:00:00.000Z' }, communication: { noOfCalls: 2 },
      };
      assert.equal(await observations.record([ticket]), 0);
      assert.equal((await observations.callLaterHistory('order-1')).length, 2);
      assert.equal(await observations.record([ticket]), 0);
      assert.equal((await observations.callLaterHistory('order-1')).length, 2);
    });
    await t.test('concurrent corrections are serialized and auto-increment continues after import', async () => {
      await Promise.all([31, 32].map((pointsOverride) => tracker.correctJob({
        storeId: 'alexandroupoli', orderId: 'order-1', teamName: 'Team One',
        categoryId: 'ftth_installation', pointsOverride, changedAt: new Date().toISOString(),
      })));
      const audit = await tracker.getAudit('alexandroupoli', 'order-1');
      assert.equal(audit.length, 3);
      assert.equal(audit[1].previousPointsOverride, 21);
      assert.equal(audit[2].previousPointsOverride, audit[1].nextPointsOverride);
    });
    await t.test('data survives closing every connection and opening a fresh pool', async () => {
      await Promise.all(repositories.splice(0).map((repository) => repository.close()));
      await database.close();
      database = await openDatabase();
      assert.equal(Number((await database.prepare("SELECT COUNT(*) AS count FROM project_tracker_audit WHERE order_id = 'order-1'").get()).count), 3);
    });
  } finally {
    await Promise.all(repositories.map((repository) => repository.close()));
    if (database) await database.close();
    config.dbClient = originalClient;
    if (originalName === undefined) delete process.env.DB_NAME;
    else process.env.DB_NAME = originalName;
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.end();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
