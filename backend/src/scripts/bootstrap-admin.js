import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import db from '../db/connection.js';
import { hashPassword } from '../utils/password.js';
import { email, text } from '../utils/validation.js';
import { ensureManagerForUser } from '../services/user-manager.service.js';

const rl = readline.createInterface({ input, output });
try {
  const current = (await (db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'").get())).c;
  if (current > 0) {
    console.log('Администратор уже существует. Используйте npm run create-user для добавления пользователя.');
    process.exit(0);
  }
  const rawEmail = process.env.ADMIN_EMAIL || await rl.question('Email администратора: ');
  const rawName = process.env.ADMIN_NAME || await rl.question('Имя администратора: ');
  const rawPassword = process.env.ADMIN_PASSWORD || await rl.question('Пароль (12+ символов): ', { hideEchoBack: true });
  const adminEmail = email(rawEmail);
  const name = text(rawName, 'name', { required: true, max: 160 });
  if (!rawPassword || rawPassword.length < 12 || rawPassword.length > 200) throw new Error('Пароль должен содержать от 12 до 200 символов.');
  const info = (await (db.prepare('INSERT INTO users (email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)')
    .run(adminEmail, name, hashPassword(rawPassword), 'admin', new Date().toISOString())));
  await ensureManagerForUser(info.lastInsertRowid, { name, email: adminEmail });
  console.log(`Администратор создан. ID: ${info.lastInsertRowid}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
