import db from './connection.js';
import { resetDatabase } from './reset.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export { resetDatabase };

export async function seedEmpty() {
  await resetDatabase();
  console.log(`Пустая база логистики создана: ${db.path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await seedEmpty();
