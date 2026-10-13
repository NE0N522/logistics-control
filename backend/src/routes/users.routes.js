import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/connection.js';
import { requireAdmin } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';
import { email, idOrNull, text } from '../utils/validation.js';
import { hashPassword } from '../utils/password.js';

const router = Router();
router.use(requireAdmin);

const USER_SELECT = `SELECT u.id,u.email,u.name,u.role,u.active,u.created_at,u.manager_id,
  m.name AS manager_name,m.region AS manager_region,m.position AS manager_position,m.active AS manager_active
  FROM users u LEFT JOIN managers m ON m.id=u.manager_id`;

async function userById(id) {
  return (await (db.prepare(`${USER_SELECT} WHERE u.id=?`).get(id)));
}

function validId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'Некорректный ID пользователя');
  return id;
}

async function assertLastAdminCanChange(user, nextRole = user.role, nextActive = Boolean(user.active)) {
  const staysAdmin = nextRole === 'admin' && nextActive;
  if (user.role === 'admin' && user.active && !staysAdmin) {
    const activeAdmins = (await (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND active=1").get())).count;
    if (activeAdmins <= 1) throw new ApiError(400, 'Нельзя отключить или понизить последнего активного администратора');
  }
}

async function listEmployees() {
  const profiles = (await (db.prepare(`
    SELECT u.id,u.email,COALESCE(m.name,u.name) AS name,u.role,u.active,u.created_at,
      m.id AS manager_id,m.region AS manager_region,m.position AS manager_position,
      m.active AS manager_active,m.id AS employee_id,
      CASE WHEN u.id IS NULL THEN 0 ELSE 1 END AS has_account,
      1 AS has_manager
    FROM managers m
    LEFT JOIN users u ON u.manager_id=m.id OR (
      u.manager_id IS NULL AND m.email IS NOT NULL AND lower(u.email)=lower(m.email)
      AND u.id=(SELECT MIN(u2.id) FROM users u2 WHERE u2.manager_id IS NULL AND lower(u2.email)=lower(m.email))
      AND m.id=(SELECT MIN(m2.id) FROM managers m2 WHERE lower(m2.email)=lower(m.email))
    )
    ORDER BY name COLLATE NOCASE
  `).all()));
  const unlinkedAccounts = (await (db.prepare(`
    SELECT u.id,u.email,u.name,u.role,u.active,u.created_at,u.manager_id,
      NULL AS manager_region,NULL AS manager_position,NULL AS manager_active,
      NULL AS employee_id,1 AS has_account,0 AS has_manager
    FROM users u
    WHERE NOT EXISTS (
      SELECT 1 FROM managers m WHERE m.id=u.manager_id OR (
        u.manager_id IS NULL AND m.email IS NOT NULL AND lower(m.email)=lower(u.email)
        AND m.id=(SELECT MIN(m2.id) FROM managers m2 WHERE lower(m2.email)=lower(m.email))
      )
    )
    ORDER BY u.name COLLATE NOCASE
  `).all()));
  return [...profiles, ...unlinkedAccounts]
    .map((row) => ({ ...row, has_account: Boolean(row.has_account), has_manager: Boolean(row.has_manager) }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
}

async function ensureManagerForAccount(user, fields) {
  let managerId = user.manager_id;
  if (!managerId) {
    const matched = fields.accountEmail
      ? (await (db.prepare(`SELECT m.id FROM managers m WHERE lower(m.email)=lower(?)
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.manager_id=m.id) ORDER BY m.id LIMIT 1`).get(fields.accountEmail)))
      : null;
    managerId = matched?.id ?? (await (db.prepare(
      'INSERT INTO managers (name,email,region,position,hired_at,active) VALUES (?,?,?,?,?,1)'
    ).run(fields.name, fields.accountEmail, fields.region, fields.position, new Date().toISOString()))).lastInsertRowid;
    (await (db.prepare('UPDATE users SET manager_id=? WHERE id=?').run(managerId, user.id)));
  }
  (await (db.prepare('UPDATE managers SET name=?,email=?,region=?,position=? WHERE id=?')
    .run(fields.name, fields.accountEmail, fields.region, fields.position, managerId)));
  return managerId;
}

router.get('/', async (_req, res) => res.json(await listEmployees()));

router.post('/', async (req, res) => {
  const userEmail = email(req.body?.email);
  if (!userEmail) throw new ApiError(400, 'Укажите email для входа');
  const name = text(req.body?.name, 'name', { required: true, max: 160 });
  const suppliedPassword = req.body?.password;
  if (suppliedPassword !== undefined && (typeof suppliedPassword !== 'string' || suppliedPassword.length < 12 || suppliedPassword.length > 200)) {
    throw new ApiError(400, 'Пароль должен содержать от 12 до 200 символов');
  }
  const temporaryPassword = suppliedPassword || crypto.randomBytes(18).toString('base64url');
  const role = req.body?.role || 'user';
  if (!['user', 'admin'].includes(role)) throw new ApiError(400, 'Некорректная роль');
  const region = text(req.body?.region, 'region', { max: 120 });
  const position = req.body?.position || 'staff';
  if (!['dispatcher', 'driver', 'staff'].includes(position)) throw new ApiError(400, 'Выберите должность: диспетчер, водитель или сотрудник');
  const requestedManagerId = idOrNull(req.body?.managerId, 'managerId');

  try {
    const userId = (await (db.transaction(async () => {
      let manager = requestedManagerId ? (await (db.prepare('SELECT * FROM managers WHERE id=?').get(requestedManagerId))) : null;
      if (requestedManagerId && !manager) throw new ApiError(404, 'Профиль сотрудника не найден');
      if (!manager) manager = (await (db.prepare('SELECT * FROM managers WHERE lower(email)=lower(?) ORDER BY id LIMIT 1').get(userEmail)));

      const info = (await (db.prepare('INSERT INTO users (email,name,password_hash,role,active,created_at,manager_id) VALUES (?,?,?,?,1,?,?)')
        .run(userEmail, name, hashPassword(temporaryPassword), role, new Date().toISOString(), manager?.id || null)));
      if (manager) {
        (await (db.prepare('UPDATE managers SET name=?,email=?,region=?,position=? WHERE id=?')
          .run(name, userEmail, region ?? manager.region, position, manager.id)));
      } else {
        const created = (await (db.prepare('INSERT INTO managers (name,email,region,position,hired_at,active) VALUES (?,?,?,?,?,1)')
          .run(name, userEmail, region, position, new Date().toISOString())));
        (await (db.prepare('UPDATE users SET manager_id=? WHERE id=?').run(created.lastInsertRowid, info.lastInsertRowid)));
      }
      return info.lastInsertRowid;
    })()));
    res.status(201).json({ ...(await userById(userId)), temporaryPassword });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new ApiError(409, 'Пользователь с таким email уже существует');
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const id = validId(req.params.id);
  const current = (await (db.prepare('SELECT * FROM users WHERE id=?').get(id)));
  if (!current) throw new ApiError(404, 'Пользователь не найден');
  const manager = current.manager_id ? (await (db.prepare('SELECT * FROM managers WHERE id=?').get(current.manager_id))) : null;
  const name = req.body?.name !== undefined ? text(req.body.name, 'name', { required: true, max: 160 }) : current.name;
  const accountEmail = req.body?.email !== undefined ? email(req.body.email) : current.email;
  if (!accountEmail) throw new ApiError(400, 'Укажите email для входа');
  const role = req.body?.role ?? current.role;
  if (!['user', 'admin'].includes(role)) throw new ApiError(400, 'Некорректная роль');
  if (req.body?.active !== undefined && typeof req.body.active !== 'boolean') throw new ApiError(400, 'Некорректное состояние учётной записи');
  const active = req.body?.active === undefined ? Boolean(current.active) : req.body.active;
  if (id === req.user.id && !active) throw new ApiError(400, 'Нельзя отключить текущую учётную запись');
  await assertLastAdminCanChange(current, role, active);
  const region = req.body?.region !== undefined ? text(req.body.region, 'region', { max: 120 }) : manager?.region || null;
  const position = req.body?.position ?? manager?.position ?? 'staff';
  if (!['dispatcher', 'driver', 'staff'].includes(position)) throw new ApiError(400, 'Некорректная должность сотрудника');

  try {
    (await (db.transaction(async () => {
      (await (db.prepare('UPDATE users SET name=?,email=?,role=?,active=? WHERE id=?').run(name, accountEmail, role, active ? 1 : 0, id)));
      await ensureManagerForAccount(current, { name, accountEmail, region, position });
      if (!active) (await (db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)));
      if (id === req.user.id && role !== 'admin') (await (db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)));
    })()));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new ApiError(409, 'Пользователь с таким email уже существует');
    throw err;
  }
  if (id === req.user.id && role !== 'admin') return res.json({ id, role, signedOut: true });
  res.json(await userById(id));
});

router.patch('/:id/role', async (req, res) => {
  const id = validId(req.params.id);
  const current = (await (db.prepare('SELECT * FROM users WHERE id=?').get(id)));
  if (!current) throw new ApiError(404, 'Пользователь не найден');
  const role = req.body?.role;
  if (!['user', 'admin'].includes(role)) throw new ApiError(400, 'Некорректная роль');
  await assertLastAdminCanChange(current, role, Boolean(current.active));
  (await (db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id)));
  if (id === req.user.id && role !== 'admin') {
    (await (db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)));
    return res.json({ id, role, signedOut: true });
  }
  res.json(await userById(id));
});

router.patch('/:id/status', async (req, res) => {
  const id = validId(req.params.id);
  const current = (await (db.prepare('SELECT * FROM users WHERE id=?').get(id)));
  if (!current) throw new ApiError(404, 'Пользователь не найден');
  if (typeof req.body?.active !== 'boolean') throw new ApiError(400, 'Укажите состояние учётной записи');
  if (id === req.user.id && !req.body.active) throw new ApiError(400, 'Нельзя отключить текущую учётную запись');
  await assertLastAdminCanChange(current, current.role, req.body.active);
  (await (db.prepare('UPDATE users SET active=? WHERE id=?').run(req.body.active ? 1 : 0, id)));
  if (!req.body.active) (await (db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)));
  res.json(await userById(id));
});

router.post('/:id/reset-password', async (req, res) => {
  const id = validId(req.params.id);
  if (id === req.user.id) throw new ApiError(400, 'Для собственной учётной записи используйте выход и восстановление доступа администратором');
  const current = (await (db.prepare('SELECT id FROM users WHERE id=?').get(id)));
  if (!current) throw new ApiError(404, 'Пользователь не найден');
  const temporaryPassword = crypto.randomBytes(18).toString('base64url');
  (await (db.transaction(async () => {
    (await (db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(temporaryPassword), id)));
    (await (db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)));
  })()));
  res.json({ temporaryPassword });
});

router.delete('/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (id === req.user.id) throw new ApiError(400, 'Нельзя удалить собственную учётную запись');
  const current = (await (db.prepare('SELECT * FROM users WHERE id=?').get(id)));
  if (!current) throw new ApiError(404, 'Пользователь не найден');
  await assertLastAdminCanChange(current, 'user', false);
  (await (db.prepare('DELETE FROM users WHERE id=?').run(id)));
  res.status(204).end();
});

export default router;
