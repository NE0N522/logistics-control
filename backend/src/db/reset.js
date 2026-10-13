import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './connection.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
const TABLES = ['shipment_history','deal_history','manager_plans','company_plans','api_keys','sessions','deals','products','app_settings','plans','users','managers'];

export async function resetDatabase({ allowCloudReset = false } = {}) {
  if (db.provider === 'turso' && !allowCloudReset) {
    throw new Error('Сброс облачной базы запрещён без явного подтверждения. Используйте npm run seed:cloud-reset.');
  }
  await db.transaction(async () => {
    for (const table of TABLES) await db.exec(`DROP TABLE IF EXISTS ${table}`);
    await db.exec(schema);
  })();
}
