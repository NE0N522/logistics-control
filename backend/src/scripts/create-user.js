import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import db from '../db/connection.js';
import { hashPassword } from '../utils/password.js';
import { email, text } from '../utils/validation.js';
import { ensureManagerForUser } from '../services/user-manager.service.js';

const rl = readline.createInterface({ input, output });
try {
  const rawEmail = await rl.question('Email пользователя: ');
  const rawName = await rl.question('Имя пользователя: ');
  const rawPassword = await rl.question('Пароль (12+ символов): ', { hideEchoBack: true });
  const rawRole = await rl.question('Роль [1=Наблюдатель, 2=Администратор] (по умолчанию 1): ');
  const role = rawRole.trim() === '2' ? 'admin' : 'user';
  const userEmail = email(rawEmail);
  const name = text(rawName, 'name', { required: true, max: 160 });
  if (typeof rawPassword !== 'string' || rawPassword.length < 12 || rawPassword.length > 200) {
    throw new Error('Пароль должен содержать от 12 до 200 символов.');
  }
  const existing = (await (db.prepare('SELECT id FROM users WHERE email=?').get(userEmail)));
  if (existing) throw new Error('Пользователь с таким email уже существует.');
  const info = (await (db.prepare('INSERT INTO users (email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)')
    .run(userEmail, name, hashPassword(rawPassword), role, new Date().toISOString())));
  const managerId = await ensureManagerForUser(info.lastInsertRowid, { name, email: userEmail });
  console.log(`Сотрудник создан. ID: ${info.lastInsertRowid}. Доступ: ${role === 'admin' ? 'Администратор' : 'Наблюдатель'}. Профиль: #${managerId}.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
