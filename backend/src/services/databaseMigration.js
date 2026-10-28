import { createHash } from 'node:crypto';
import { mysqlTables } from '../repositories/mysqlSchema.js';

const digest = (tables) => createHash('sha256').update(JSON.stringify(tables)).digest('hex');
const canonicalRows = (rows, columns) => rows
  .map((row) => JSON.stringify(columns.map((column) => row[column])))
  .sort();

export async function exportSqliteDatabase(filename) {
  const { default: Database } = await import('better-sqlite3');
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const knownTables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      .filter(({ name }) => Object.hasOwn(mysqlTables, name));
    if (!knownTables.length) throw new Error('Source database does not contain Fiona tables');
    const tables = database.transaction(() => Object.fromEntries(
      Object.entries(mysqlTables).map(([table, definition]) => {
        const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
        if (!exists) return [table, []];
        const available = new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
        const columns = Object.keys(definition.columns);
        if (columns.some((column) => !available.has(column))) {
          throw new Error(`SQLite table ${table} needs upgrading. Run the current SQLite app locally before exporting.`);
        }
        return [table, database.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${definition.primary.join(', ')}`).all()];
      }),
    ))();
    return { format: 'fiona-database', version: 1, exportedAt: new Date().toISOString(), tables, sha256: digest(tables) };
  } finally {
    database.close();
  }
}

export function validateDatabaseExport(snapshot) {
  if (snapshot?.format !== 'fiona-database' || snapshot.version !== 1
    || !snapshot.tables || typeof snapshot.tables !== 'object' || Array.isArray(snapshot.tables)) {
    throw new Error('Unsupported Fiona database export');
  }
  const expected = Object.keys(mysqlTables);
  if (Object.keys(snapshot.tables).length !== expected.length
    || expected.some((table) => !Object.hasOwn(snapshot.tables, table) || !Array.isArray(snapshot.tables[table]))) {
    throw new Error('Export must contain exactly the supported Fiona tables');
  }
  if (snapshot.sha256 !== digest(snapshot.tables)) throw new Error('Export checksum mismatch');
  for (const [table, definition] of Object.entries(mysqlTables)) {
    const columns = Object.keys(definition.columns);
    for (const row of snapshot.tables[table]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).length !== columns.length
        || columns.some((column) => !Object.hasOwn(row, column)
          || !(row[column] === null || typeof row[column] === 'string' || Number.isSafeInteger(row[column])))) {
        throw new Error(`Invalid row in export table ${table}`);
      }
    }
  }
  return snapshot;
}

export async function importDatabaseExport(database, input) {
  if (database.dialect !== 'mysql') throw new Error('Data import requires DB_CLIENT=mysql');
  const snapshot = validateDatabaseExport(input);
  return database.transaction(async () => {
    for (const table of Object.keys(mysqlTables)) {
      const { count } = await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
      if (Number(count) !== 0) throw new Error(`Target table ${table} is not empty. Import refused; no application rows were changed.`);
    }
    const counts = {};
    for (const [table, definition] of Object.entries(mysqlTables)) {
      const columns = Object.keys(definition.columns);
      const insert = database.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
      for (const row of snapshot.tables[table]) {
        await insert.run(...columns.map((column) => row[column]));
      }
      const actual = await database.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();
      const expectedRows = canonicalRows(snapshot.tables[table], columns);
      const actualRows = canonicalRows(actual, columns);
      if (JSON.stringify(expectedRows) !== JSON.stringify(actualRows)) {
        throw new Error(`Imported data verification failed for ${table}; transaction will be rolled back`);
      }
      counts[table] = actual.length;
    }
    return counts;
  })();
}
