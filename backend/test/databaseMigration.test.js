import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportSqliteDatabase, validateDatabaseExport } from '../src/services/databaseMigration.js';
import { openDatabase, mysqlSettings, mysqlSql } from '../src/repositories/database.js';
import { parseMigrationArgs } from '../src/cli/migrateDatabase.js';
import { createMigrationFixture } from './helpers/migrationFixture.js';
import { mysqlTables } from '../src/repositories/mysqlSchema.js';


test('SQLite export preserves every application table and detects tampering', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fiona-export-'));
  try {
    const filename = path.join(directory, 'source.sqlite');
    await createMigrationFixture(filename);
    const snapshot = await exportSqliteDatabase(filename);
    assert.equal(validateDatabaseExport(snapshot), snapshot);
    for (const table of Object.keys(mysqlTables)) assert.ok(snapshot.tables[table].length > 0, table);
    assert.equal(snapshot.tables.closed_tickets.length, 2);
    assert.equal(snapshot.tables.project_tracker_jobs[0].points_override_manual, 1);
    assert.equal(snapshot.tables.project_tracker_month_locks[0].locked, 1);
    const second = await exportSqliteDatabase(filename);
    assert.equal(snapshot.sha256, second.sha256);
    snapshot.tables.project_tracker_jobs[0].points_override = 999;
    assert.throws(() => validateDatabaseExport(snapshot), /checksum/);
    await assert.rejects(() => exportSqliteDatabase(path.join(directory, 'missing.sqlite')));
    assert.equal((await fs.readdir(directory)).includes('missing.sqlite'), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('migration CLI rejects unknown options and never guesses import files', () => {
  assert.throws(() => parseMigrationArgs(['import']), /--file/);
  assert.throws(() => parseMigrationArgs(['import', '--file', 'data.json', '--sqlite', 'source.sqlite']), /export-only/);
  assert.throws(() => parseMigrationArgs(['export', '--password', 'secret']), /Usage/);
  assert.equal(parseMigrationArgs(['export', '--file', 'data.json']).command, 'export');
});

test('database selection and MySQL configuration fail explicitly', async () => {
  await assert.rejects(() => openDatabase(':memory:', 'other'), /DB_CLIENT/);
  assert.throws(() => mysqlSettings({}), /DB_HOST/);
  assert.throws(() => mysqlSettings({ DB_HOST: 'localhost', DB_NAME: 'fiona', DB_USER: 'user', DB_PASSWORD: 'pass', DB_PORT: 'bad' }), /DB_PORT/);
  assert.match(mysqlSql('INSERT OR IGNORE INTO pending_closures (order_id) VALUES (@id)'), /ON DUPLICATE KEY UPDATE/);
  assert.match(mysqlSql('INSERT INTO project_tracker_settings VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value'), /setting_value = VALUES\(setting_value\)/);
});

test('shared SQLite connections serialize transactions and roll back all writes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fiona-transaction-'));
  const filename = path.join(directory, 'db.sqlite');
  const first = await openDatabase(filename, 'sqlite');
  const second = await openDatabase(filename, 'sqlite');
  try {
    await first.exec('CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT)');
    await assert.rejects(() => first.transaction(async () => {
      await first.prepare('INSERT INTO example VALUES (?, ?)').run(1, 'rollback');
      throw new Error('injected failure');
    })(), /injected failure/);
    assert.equal((await second.prepare('SELECT COUNT(*) AS count FROM example').get()).count, 0);
    await Promise.all([first, second].map((database, index) => database.transaction(async () => {
      await database.prepare('INSERT INTO example VALUES (?, ?)').run(index, 'saved');
      await new Promise((resolve) => setTimeout(resolve, 5));
    })()));
    assert.equal((await first.prepare('SELECT COUNT(*) AS count FROM example').get()).count, 2);
  } finally {
    await first.close();
    await second.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
