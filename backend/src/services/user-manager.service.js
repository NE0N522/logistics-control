import db from '../db/connection.js';

export async function ensureManagerForUser(userId, { name, email: managerEmail, region = null } = {}) {
  const user = (await (db.prepare('SELECT id,name,email,manager_id,created_at,active FROM users WHERE id=?').get(userId)));
  if (!user) return null;
  if (user.manager_id) {
    (await (db.prepare('UPDATE managers SET name=?, email=?, active=? WHERE id=?').run(
      name || user.name,
      managerEmail || user.email || null,
      user.active ? 1 : 0,
      user.manager_id
    )));
    return user.manager_id;
  }

  const existing = managerEmail ? (await (db.prepare('SELECT id FROM managers WHERE email=? ORDER BY id LIMIT 1').get(managerEmail))) : null;
  const managerId = existing?.id ?? (await (db.prepare(
    'INSERT INTO managers (name,email,region,hired_at,active) VALUES (?,?,?,?,?)'
  ).run(name || user.name, managerEmail || user.email || null, region, user.created_at || new Date().toISOString(), user.active ? 1 : 0))).lastInsertRowid;

  (await (db.prepare('UPDATE users SET manager_id=? WHERE id=?').run(managerId, userId)));
  return managerId;
}
