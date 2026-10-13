export const version = 3;

async function columnExists(db, table, column) {
  return (await db.prepare(`PRAGMA table_info(${table})`).all()).some((row) => row.name === column);
}

export async function up(db) {
  await db.transaction(async () => {
    if (!await columnExists(db, 'users', 'manager_id')) {
      await db.exec('ALTER TABLE users ADD COLUMN manager_id INTEGER REFERENCES managers(id) ON DELETE SET NULL');
    }
    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id)');

    const users = await db.prepare('SELECT id,name,email,manager_id,created_at FROM users WHERE manager_id IS NULL ORDER BY id').all();
    const findByEmail = db.prepare('SELECT id FROM managers WHERE email=? ORDER BY id LIMIT 1');
    const createManager = db.prepare('INSERT INTO managers (name,email,region,hired_at,active) VALUES (?,?,?,?,1)');
    const link = db.prepare('UPDATE users SET manager_id=? WHERE id=?');
    for (const user of users) {
      const existing = user.email ? await findByEmail.get(user.email) : null;
      const managerId = existing?.id ?? (await createManager.run(user.name, user.email || null, null, user.created_at || new Date().toISOString())).lastInsertRowid;
      await link.run(managerId, user.id);
    }
  })();
  await db.exec('PRAGMA user_version = 3');
}
