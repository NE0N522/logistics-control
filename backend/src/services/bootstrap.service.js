import db from '../db/connection.js';
import { hashPassword } from '../utils/password.js';
import { email, text } from '../utils/validation.js';
import { ensureManagerForUser } from './user-manager.service.js';

export async function bootstrapAdminFromEnv() {
  const existing = (await (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").get())).count;
  if (existing > 0) { delete process.env.ADMIN_BOOTSTRAP_PASSWORD; return { created: false }; }
  const rawEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const rawPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!rawEmail && !rawPassword) return { created: false, reason: 'bootstrap-env-missing' };
  if (!rawEmail || !rawPassword) throw new Error('Для bootstrap администратора нужно задать одновременно ADMIN_BOOTSTRAP_EMAIL и ADMIN_BOOTSTRAP_PASSWORD.');
  const adminEmail = email(rawEmail);
  const adminName = text(process.env.ADMIN_BOOTSTRAP_NAME || 'Администратор', 'name', { required: true, max: 160 });
  const passwordHash = hashPassword(rawPassword);
  const info = (await (db.prepare('INSERT INTO users (email, name, password_hash, role, active, created_at) VALUES (?, ?, ?, \'admin\', 1, ?)')
    .run(adminEmail, adminName, passwordHash, new Date().toISOString())));
  await ensureManagerForUser(info.lastInsertRowid, { name: adminName, email: adminEmail });
  delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  return { created: true };
}
