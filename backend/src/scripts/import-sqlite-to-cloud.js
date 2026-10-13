import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import db from '../db/connection.js';
import { resolveDbPath } from '../config/load-env.js';

const dbPath = process.env.DB_PATH || './data/logistics.db';
const sourcePath = resolveDbPath(dbPath);
const TABLES = [
  'managers', 'users', 'products', 'sessions', 'deals', 'company_plans', 'manager_plans',
  'api_keys', 'deal_history', 'shipment_history', 'app_settings'
];
const EMPTY_TABLES = [
  'managers', 'users', 'products', 'sessions', 'deals', 'company_plans', 'manager_plans',
  'api_keys', 'deal_history', 'shipment_history'
];
const BATCH_SIZE = 100;

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

if (db.provider !== 'turso') {
  throw new Error('Для импорта задайте TURSO_DATABASE_URL и TURSO_AUTH_TOKEN в корневом .env.');
}
if (!fs.existsSync(sourcePath)) {
  throw new Error(`Локальная база не найдена: ${sourcePath}. Укажите её расположение через DB_PATH.`);
}

const source = new DatabaseSync(sourcePath);
try {
  source.exec('PRAGMA query_only = ON');
  const version = Number(source.prepare('PRAGMA user_version').get()?.user_version || 0);
  if (version < 5) throw new Error(`Локальная база имеет схему версии ${version}; ожидается версия 5.`);

  const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  const counts = {};
  for (const table of EMPTY_TABLES) {
    counts[table] = Number((await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).count);
  }
  const occupied = Object.entries(counts).filter(([, count]) => count > 0).map(([table]) => table);
  if (occupied.length) {
    throw new Error(`В облачной базе уже есть данные (${occupied.join(', ')}). Импорт остановлен, чтобы не объединять записи автоматически.`);
  }

  const tables = TABLES.filter((table) => sourceTables.has(table));
  const rowsByTable = new Map(tables.map((table) => [table, source.prepare(`SELECT * FROM ${table}`).all()]));
  const statementGroups = [];
  for (const table of tables) {
    for (const row of rowsByTable.get(table)) {
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(',');
      const values = columns.map((column) => row[column]);
      const updateClause = table === 'app_settings'
        ? ' ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id'
        : '';
      statementGroups.push({
        sql: `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})${updateClause}`,
        args: values
      });
    }
  }

  await db.transaction(async () => {
    for (const group of chunks(statementGroups, BATCH_SIZE)) await db.batch(group);
  })();

  const imported = Object.fromEntries(tables.map((table) => [table, rowsByTable.get(table).length]));
  console.log('Импорт завершён. Локальная база не изменялась.');
  console.log(JSON.stringify(imported, null, 2));
} finally {
  source.close();
}
