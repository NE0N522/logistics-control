export const version = 5;

export async function up(db) {
  await db.transaction(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    const insert = db.prepare('INSERT OR IGNORE INTO app_settings (key,value,updated_at) VALUES (?,?,?)');
    const now = new Date().toISOString();
    for (const [key, value] of [
      ['exchange_rate_kgs_per_usd', '87.45'],
      ['exchange_rate_source', 'НБКР'],
      ['exchange_rate_date', '2026-10-10'],
      ['dispatcher_commission_pct', '1.5'],
      ['driver_commission_pct', '10']
    ]) await insert.run(key, value, now);
  })();
  await db.exec('PRAGMA user_version = 5');
}
