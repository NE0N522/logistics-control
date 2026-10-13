export const version = 4;

async function columnExists(db, table, column) {
  return (await db.prepare(`PRAGMA table_info(${table})`).all()).some((row) => row.name === column);
}

async function addColumn(db, table, column, definition) {
  if (!await columnExists(db, table, column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function up(db) {
  await db.transaction(async () => {
    await addColumn(db, 'managers', 'position', "TEXT NOT NULL DEFAULT 'dispatcher'");
    await addColumn(db, 'deals', 'driver_id', 'INTEGER REFERENCES managers(id) ON DELETE SET NULL');
    await addColumn(db, 'deals', 'driver_name_snapshot', 'TEXT');
    await addColumn(db, 'deals', 'pickup_location', 'TEXT');
    await addColumn(db, 'deals', 'delivery_location', 'TEXT');
    await addColumn(db, 'deals', 'weight_kg', 'REAL');
    await addColumn(db, 'deals', 'vehicle', 'TEXT');
    await addColumn(db, 'deals', 'shipment_status', "TEXT NOT NULL DEFAULT 'new'");
    await addColumn(db, 'deals', 'dispatcher_assigned_at', 'TEXT');
    await addColumn(db, 'deals', 'driver_assigned_at', 'TEXT');
    await addColumn(db, 'deals', 'expected_delivery_at', 'TEXT');
    await addColumn(db, 'deals', 'delivered_at', 'TEXT');

    await db.exec(`
      UPDATE deals SET shipment_status = CASE stage
        WHEN 'negotiation' THEN 'assigned'
        WHEN 'deal' THEN 'in_transit'
        WHEN 'paid' THEN 'delivered'
        WHEN 'lost' THEN 'cancelled'
        ELSE 'new'
      END;
      UPDATE deals SET delivered_at = paid_at WHERE stage='paid' AND delivered_at IS NULL;
      UPDATE deals SET dispatcher_assigned_at = created_at WHERE manager_id IS NOT NULL AND dispatcher_assigned_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_deals_driver ON deals(driver_id);
      CREATE INDEX IF NOT EXISTS idx_deals_shipment_status ON deals(shipment_status);
      CREATE TABLE IF NOT EXISTS shipment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        changed_at TEXT NOT NULL,
        changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_shipment_history_deal_id_changed_at ON shipment_history(deal_id, changed_at);
      INSERT INTO shipment_history (deal_id,changed_at,event_type,new_value)
        SELECT id,created_at,'status',shipment_status FROM deals
        WHERE NOT EXISTS (SELECT 1 FROM shipment_history h WHERE h.deal_id=deals.id);
    `);
  })();
  await db.exec('PRAGMA user_version = 4');
}
