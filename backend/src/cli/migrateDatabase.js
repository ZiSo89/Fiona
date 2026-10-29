import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { config } from '../config.js';
import { openDatabase } from '../repositories/database.js';
import { exportSqliteDatabase, importDatabaseExport } from '../services/databaseMigration.js';

export function parseMigrationArgs(args) {
  const [command, ...options] = args;
  if (!['export', 'import'].includes(command)) throw new Error('Expected export or import command');
  const result = { command };
  for (let index = 0; index < options.length; index += 2) {
    const name = options[index];
    if (!['--file', '--sqlite'].includes(name) || !options[index + 1]
      || options[index + 1].startsWith('--') || result[name.slice(2)]) {
      throw new Error('Usage: export --file FILE [--sqlite SQLITE_FILE] | import --file FILE');
    }
    result[name.slice(2)] = path.resolve(options[index + 1]);
  }
  if (!result.file || (command === 'import' && result.sqlite)) throw new Error('A --file is required; --sqlite is export-only');
  return result;
}

export async function runMigration(args = process.argv.slice(2)) {
  const options = parseMigrationArgs(args);
  if (options.command === 'export') {
    const snapshot = await exportSqliteDatabase(options.sqlite || config.closedTicketsDbPath);
    await writeFile(options.file, `${JSON.stringify(snapshot)}\n`, { flag: 'wx', mode: 0o600 });
    console.info('Export created. Contains private customer data; keep it outside public web directories.');
    console.info(Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length])));
    return;
  }
  if (config.dbClient !== 'mysql') throw new Error('Import requires DB_CLIENT=mysql');
  const snapshot = JSON.parse(await readFile(options.file, 'utf8'));
  const database = await openDatabase();
  try {
    console.info('Verified import completed:', await importDatabaseExport(database, snapshot));
  } finally {
    await database.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration().catch((error) => {
    console.error('Database migration failed:', error.message);
    process.exitCode = 1;
  });
}
