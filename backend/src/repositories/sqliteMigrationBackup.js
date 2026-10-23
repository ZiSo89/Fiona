import fs from 'node:fs';

const backedUpPaths = new Set();

export function backupBeforeStoreMigration(database, dbPath) {
  if (dbPath === ':memory:' || backedUpPaths.has(dbPath)) return null;

  const backupPath = `${dbPath}.pre-store-migration.bak`;
  if (!fs.existsSync(backupPath)) database.prepare('VACUUM INTO ?').run(backupPath);
  backedUpPaths.add(dbPath);
  return backupPath;
}