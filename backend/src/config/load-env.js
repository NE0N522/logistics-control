import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const backendRoot = path.resolve(here, '../..');
export const projectRoot = path.resolve(backendRoot, '..');

export function resolveDbPath(dbPath) {
  if (path.isAbsolute(dbPath)) return dbPath;
  const backendPath = path.resolve(backendRoot, dbPath);
  if (fs.existsSync(backendPath)) return backendPath;
  const projectPath = path.resolve(projectRoot, dbPath);
  if (fs.existsSync(projectPath)) return projectPath;
  return backendPath;
}

dotenv.config({ path: path.join(projectRoot, '.env'), override: false });
dotenv.config({ path: path.join(backendRoot, '.env'), override: false });
