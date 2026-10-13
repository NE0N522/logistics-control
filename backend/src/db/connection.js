import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@libsql/client';
import { resolveDbPath } from '../config/load-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || './data/logistics.db';
const resolvedPath = resolveDbPath(dbPath);
const cloudUrl = process.env.TURSO_DATABASE_URL?.trim();
const cloudToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (Boolean(cloudUrl) !== Boolean(cloudToken)) {
  throw new Error('Для облачной базы нужно задать одновременно TURSO_DATABASE_URL и TURSO_AUTH_TOKEN.');
}

if (!cloudUrl) fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const client = createClient(cloudUrl
  ? { url: cloudUrl, authToken: cloudToken, intMode: 'number' }
  : { url: pathToFileURL(resolvedPath).href, intMode: 'number' });
const transactionContext = new AsyncLocalStorage();

function activeClient() {
  return transactionContext.getStore() || client;
}

function normalizeRow(row) {
  if (!row) return row;
  const normalized = {};
  for (const [key, value] of Object.entries(row)) normalized[key] = typeof value === 'bigint' ? Number(value) : value;
  return normalized;
}

function normalizeArgs(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  if (args.length === 1 && args[0] && typeof args[0] === 'object') return args[0];
  return args;
}

function query(sql, args) {
  return activeClient().execute({ sql, args: normalizeArgs(args) });
}

async function executeSql(sql) {
  const target = activeClient();
  if (!cloudUrl) return target.executeMultiple(sql);

  const versions = [];
  const cloudSql = sql.replace(/\bPRAGMA\s+user_version\s*=\s*(\d+)\s*;?/gi, (_, version) => {
    versions.push(Number(version));
    return '';
  });
  if (cloudSql.trim()) await target.executeMultiple(cloudSql);
  for (const version of versions) {
    await target.execute({
      sql: `INSERT INTO app_schema_meta (key, value) VALUES ('user_version', ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      args: [String(version)]
    });
  }
}

export const db = {
  exec: executeSql,
  batch: (statements, mode = 'write') => {
    const target = activeClient();
    const normalized = statements.map((statement) => typeof statement === 'string'
      ? statement
      : { sql: statement.sql, args: normalizeArgs([statement.args || []]) });
    return target === client ? target.batch(normalized, mode) : target.batch(normalized);
  },
  prepare: (sql) => ({
    get: async (...args) => {
      const result = await query(sql, args);
      return normalizeRow(result.rows[0]);
    },
    all: async (...args) => {
      const result = await query(sql, args);
      return result.rows.map(normalizeRow);
    },
    run: async (...args) => {
      const result = await query(sql, args);
      return {
        changes: Number(result.rowsAffected || 0),
        lastInsertRowid: result.lastInsertRowid === undefined ? undefined : Number(result.lastInsertRowid)
      };
    }
  }),
  transaction: (fn) => async (...args) => {
    const tx = await client.transaction('write');
    try {
      const result = await transactionContext.run(tx, () => fn(...args));
      await tx.commit();
      return result;
    } catch (error) {
      try { await tx.rollback(); } catch { /* preserve original error */ }
      throw error;
    } finally {
      tx.close();
    }
  },
  close: () => client.close(),
  path: cloudUrl ? 'Turso Cloud' : resolvedPath,
  provider: cloudUrl ? 'turso' : 'local'
};

async function tableExists(name) {
  const result = await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return Boolean(result);
}

async function initializeDatabase() {
  if (cloudUrl) {
    await db.exec(`CREATE TABLE IF NOT EXISTS app_schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
  }

  if (!await tableExists('deals')) {
    await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    return;
  }

  let version = cloudUrl
    ? Number((await db.prepare("SELECT value FROM app_schema_meta WHERE key='user_version'").get())?.value || 0)
    : Number((await db.prepare('PRAGMA user_version').get())?.user_version || 0);
  if (version < 2) {
    const { up } = await import('./migrations/001_legacy_to_v2.js');
    await up(db);
    version = 2;
  }
  if (version < 3) {
    const { up } = await import('./migrations/002_user_manager_link.js');
    await up(db);
    version = 3;
  }
  if (version < 4) {
    const { up } = await import('./migrations/003_logistics.js');
    await up(db);
    version = 4;
  }
  if (version < 5) {
    const { up } = await import('./migrations/004_app_settings.js');
    await up(db);
  }
}

await initializeDatabase();

export function getDbPath() { return db.path; }

export default db;
