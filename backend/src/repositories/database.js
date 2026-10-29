import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { initializeMysql, mysqlTables } from './mysqlSchema.js';

const transactions = new AsyncLocalStorage();
const sqliteConnections = new Map();
let mysqlState;
const configuredConnections = new WeakSet();

async function acquireMysql(pool) {
  let connection;
  try {
    connection = await pool.getConnection();
    if (!configuredConnections.has(connection.connection)) {
      await connection.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
      configuredConnections.add(connection.connection);
    }
    return connection;
  } catch (error) {
    if (connection) connection.release();
    error.isDatabaseError = true;
    throw error;
  }
}

export function mysqlSettings(environment = process.env) {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!environment[name]) throw new Error(`${name} is required with DB_CLIENT=mysql`);
  }
  const port = Number(environment.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be a valid TCP port');
  return {
    host: environment.DB_HOST, port, database: environment.DB_NAME,
    user: environment.DB_USER, password: environment.DB_PASSWORD,
    charset: 'utf8mb4_bin', connectionLimit: 5, flags: '-FOUND_ROWS',
    supportBigNumbers: true, bigNumberStrings: true,
    ssl: environment.DB_SSL_CA ? { ca: fs.readFileSync(environment.DB_SSL_CA, 'utf8'), rejectUnauthorized: true } : undefined,
  };
}

export function mysqlSql(sql) {
  let result = sql.replace(/@([a-zA-Z_]\w*)/g, ':$1');
  if (/INSERT OR IGNORE/i.test(result)) {
    const table = result.match(/INSERT OR IGNORE INTO\s+(\w+)/i)?.[1];
    if (!mysqlTables[table]) throw new Error(`Unknown insert target: ${table}`);
    const key = mysqlTables[table].primary[0];
    result = result.replace(/INSERT OR IGNORE/i, 'INSERT')
      + ` ON DUPLICATE KEY UPDATE \`${key}\` = \`${table}\`.\`${key}\``;
  }
  return result.replace(/ON CONFLICT\([^)]+\) DO UPDATE SET/gi, 'ON DUPLICATE KEY UPDATE')
    .replace(/excluded\.(\w+)/g, 'VALUES($1)');
}

function serialized(state, work) {
  const pending = state.tail.then(work);
  state.tail = pending.then(() => undefined, () => undefined);
  return pending;
}

async function openMysql() {
  if (!mysqlState) {
    const settings = mysqlSettings();
    const state = { references: 0 };
    mysqlState = state;
    state.ready = (async () => {
      const { default: mysql } = await import('mysql2/promise');
      state.pool = mysql.createPool({ ...settings, namedPlaceholders: true });
      const connection = await acquireMysql(state.pool);
      try {
        await initializeMysql(connection);
      } finally {
        connection.release();
      }
    })();
  }
  const state = mysqlState;
  state.references += 1;
  try {
    await state.ready;
    return state;
  } catch (error) {
    state.references -= 1;
    if (!state.references) {
      if (mysqlState === state) mysqlState = undefined;
      if (state.pool) await state.pool.end();
    }
    throw error;
  }
}

export async function openDatabase(dbPath = config.closedTicketsDbPath, client = config.dbClient) {
  if (!['sqlite', 'mysql'].includes(client)) throw new Error('DB_CLIENT must be sqlite or mysql');
  let state;
  if (client === 'mysql') {
    state = await openMysql();
  } else {
    const key = dbPath === ':memory:' ? Symbol('memory') : path.resolve(dbPath);
    state = sqliteConnections.get(key);
    if (!state) {
      let Database;
      try {
        ({ default: Database } = await import('better-sqlite3'));
      } catch (cause) {
        throw new Error('SQLite requires the optional better-sqlite3 dependency. Install it locally, or select DB_CLIENT=mysql.', { cause });
      }
      // Another opener may have finished while the dynamic import was pending.
      state = sqliteConnections.get(key);
      if (!state) {
        if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(key), { recursive: true });
        state = { database: new Database(dbPath === ':memory:' ? dbPath : key), references: 0, tail: Promise.resolve(), key };
        state.database.pragma('journal_mode = WAL');
        state.database.pragma('busy_timeout = 5000');
        sqliteConnections.set(key, state);
      }
    }
    state.references += 1;
  }
  let closed = false;
  const execute = async (sql, args, mode) => {
    if (closed) throw new Error('Database connection is closed');
    const context = transactions.getStore();
    const work = async () => {
      if (client === 'sqlite') {
        if (mode === 'exec') return state.database.exec(sql);
        const statement = state.database.prepare(sql);
        return statement[mode](...args);
      }
      const inTransaction = context?.state === state;
      const connection = inTransaction ? context.connection : await acquireMysql(state.pool);
      const parameters = args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])
        ? args[0] : args;
      let result;
      try {
        [result] = await connection.query(mysqlSql(sql), parameters);
      } finally {
        if (!inTransaction) connection.release();
      }
      if (mode === 'get') return result[0];
      if (mode === 'all') return result;
      const matched = /^\s*UPDATE\b/i.test(sql) && result.info?.match(/Rows matched:\s*(\d+)/);
      return { changes: matched ? Number(matched[1]) : result.affectedRows, lastInsertRowid: result.insertId };
    };
    try {
      return await (client === 'sqlite' && context?.state !== state ? serialized(state, work) : work());
    } catch (error) {
      if (error.sqlState || error.errno) error.isDatabaseError = true;
      error.isDatabaseError = true;
      throw error;
    }
  };
  const database = {
    dialect: client,
    exec: (sql) => execute(sql, [], 'exec'),
    pragma: (sql) => execute(`PRAGMA ${sql}`, [], 'all'),
    prepare(sql) {
      return Object.fromEntries(['get', 'all', 'run'].map((mode) => [mode, (...args) => execute(sql, args, mode)]));
    },
    transaction(work) {
      return async (...args) => {
        if (transactions.getStore()?.state === state) throw new Error('Nested database transactions are not supported');
        const run = async () => {
          const connection = client === 'mysql' ? await acquireMysql(state.pool) : state.database;
          try {
            if (client === 'mysql') {
              await connection.beginTransaction();
              // Serialize multi-step corrections, month locks and imports across app processes.
              await connection.query('SELECT id FROM fiona_transaction_lock WHERE id = 1 FOR UPDATE');
            } else connection.exec('BEGIN IMMEDIATE');
            const result = await transactions.run({ state, connection }, () => work(...args));
            if (client === 'mysql') await connection.commit();
            else connection.exec('COMMIT');
            return result;
          } catch (error) {
            try {
              if (client === 'mysql') await connection.rollback();
              else if (connection.inTransaction) connection.exec('ROLLBACK');
            } catch (rollbackError) {
              throw new AggregateError([error, rollbackError], 'Database transaction and rollback failed');
            }
            throw error;
          } finally {
            if (client === 'mysql') connection.release();
          }
        };
        return client === 'sqlite' ? serialized(state, run) : run();
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      state.references -= 1;
      if (state.references) return;
      if (client === 'mysql') {
        if (mysqlState === state) mysqlState = undefined;
        await state.pool.end();
      } else {
        await state.tail;
        state.database.close();
        sqliteConnections.delete(state.key);
      }
    },
  };
  return database;
}
