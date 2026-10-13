export const version = 2;

async function columnExists(db, table, column) {
  return (await db.prepare(`PRAGMA table_info(${table})`).all()).some((row) => row.name === column);
}

async function addColumn(db, table, column, definition) {
  if (!await columnExists(db, table, column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function tableExists(db, table) {
  return Boolean(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table));
}

export async function up(db) {
  await db.transaction(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `);

    await addColumn(db, 'deals', 'manager_name_snapshot', 'TEXT');
    await addColumn(db, 'deals', 'product_name_snapshot', 'TEXT');
    await addColumn(db, 'deals', 'unit_price_snapshot', 'REAL');
    await addColumn(db, 'deals', 'currency', "TEXT NOT NULL DEFAULT 'RUB'");
    await addColumn(db, 'deals', 'integration_source', 'TEXT');
    await addColumn(db, 'deals', 'external_id', 'TEXT');
    await addColumn(db, 'deals', 'deleted_at', 'TEXT');

    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_deals_deleted_at ON deals(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at);
      CREATE INDEX IF NOT EXISTS idx_deals_paid_at ON deals(paid_at);
    `);
    await db.prepare(`
      UPDATE deals
      SET manager_name_snapshot = COALESCE(manager_name_snapshot, (SELECT name FROM managers WHERE managers.id = deals.manager_id)),
          product_name_snapshot = COALESCE(product_name_snapshot, (SELECT name FROM products WHERE products.id = deals.product_id)),
          unit_price_snapshot = COALESCE(unit_price_snapshot, CASE WHEN quantity > 0 THEN amount / quantity ELSE 0 END),
          currency = COALESCE(currency, 'RUB')
    `).run();

    const legacyApiDeals = await db.prepare(`SELECT id, notes FROM deals WHERE source='api' AND external_id IS NULL AND notes LIKE 'Внешний ID:%' ORDER BY id ASC`).all();
    const findExistingExternal = db.prepare('SELECT id FROM deals WHERE integration_source=? AND external_id=? LIMIT 1');
    const setLegacyExternal = db.prepare('UPDATE deals SET integration_source=?, external_id=? WHERE id=?');
    for (const deal of legacyApiDeals) {
      const raw = String(deal.notes || '').slice('Внешний ID:'.length).trim();
      if (!raw) continue;
      const externalId = raw.split(' · ')[0].trim();
      if (!externalId) continue;
      const existing = await findExistingExternal.get('legacy-api', externalId);
      await setLegacyExternal.run('legacy-api', existing ? `${externalId}#legacy-${deal.id}` : externalId, deal.id);
    }
    await db.prepare(`UPDATE deals SET integration_source='legacy-api' WHERE source='api' AND integration_source IS NULL`).run();

    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_deals_integration_external
        ON deals(integration_source, external_id)
        WHERE external_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS deal_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        changed_at TEXT NOT NULL,
        changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        source TEXT NOT NULL,
        old_stage TEXT,
        new_stage TEXT,
        old_manager_id INTEGER,
        new_manager_id INTEGER,
        old_amount REAL,
        new_amount REAL,
        old_paid_at TEXT,
        new_paid_at TEXT,
        old_manager_name_snapshot TEXT,
        new_manager_name_snapshot TEXT,
        old_product_name_snapshot TEXT,
        new_product_name_snapshot TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_deal_history_deal_id_changed_at ON deal_history(deal_id, changed_at);
    `);
    await db.prepare(`
      INSERT INTO deal_history (
        deal_id, changed_at, source, old_stage, new_stage, old_manager_id, new_manager_id,
        old_amount, new_amount, old_paid_at, new_paid_at,
        old_manager_name_snapshot, new_manager_name_snapshot,
        old_product_name_snapshot, new_product_name_snapshot
      )
      SELECT id, created_at, 'migration', NULL, stage, NULL, manager_id,
             NULL, amount, NULL, paid_at,
             NULL, manager_name_snapshot, NULL, product_name_snapshot
      FROM deals
      WHERE NOT EXISTS (SELECT 1 FROM deal_history h WHERE h.deal_id = deals.id)
    `).run();

    await db.exec(`
      CREATE TABLE IF NOT EXISTS company_plans (
        period TEXT PRIMARY KEY,
        target_amount REAL NOT NULL CHECK (target_amount >= 0)
      );
      CREATE TABLE IF NOT EXISTS manager_plans (
        period TEXT NOT NULL,
        manager_id INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
        target_amount REAL NOT NULL CHECK (target_amount >= 0),
        PRIMARY KEY (period, manager_id)
      );
    `);

    if (await tableExists(db, 'plans')) {
      const planRows = await db.prepare('SELECT period, manager_id, target_amount, id FROM plans ORDER BY id ASC').all();
      const companyByPeriod = new Map();
      const managerByKey = new Map();
      for (const row of planRows) {
        if (row.manager_id === null) {
          const current = companyByPeriod.get(row.period);
          if (!current || row.id > current.id) companyByPeriod.set(row.period, row);
        } else {
          const key = `${row.period}:${row.manager_id}`;
          const current = managerByKey.get(key);
          if (!current || row.id > current.id) managerByKey.set(key, row);
        }
      }
      const insertCompany = db.prepare('INSERT INTO company_plans (period, target_amount) VALUES (?, ?) ON CONFLICT(period) DO UPDATE SET target_amount=excluded.target_amount');
      const insertManager = db.prepare('INSERT INTO manager_plans (period, manager_id, target_amount) VALUES (?, ?, ?) ON CONFLICT(period, manager_id) DO UPDATE SET target_amount=excluded.target_amount');
      for (const row of companyByPeriod.values()) await insertCompany.run(row.period, row.target_amount);
      for (const row of managerByKey.values()) await insertManager.run(row.period, row.manager_id, row.target_amount);
      await db.exec('DROP TABLE plans');
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        last_used_at TEXT
      );
    `);
    await addColumn(db, 'api_keys', 'created_by_user_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  })();
  await db.exec('PRAGMA user_version = 2');
}
