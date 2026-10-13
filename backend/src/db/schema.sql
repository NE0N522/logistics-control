CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  region TEXT,
  position TEXT NOT NULL DEFAULT 'dispatcher' CHECK (position IN ('dispatcher','driver','staff')),
  hired_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  manager_id INTEGER REFERENCES managers(id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  manager_id INTEGER REFERENCES managers(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  manager_name_snapshot TEXT,
  product_name_snapshot TEXT,
  unit_price_snapshot REAL,
  currency TEXT NOT NULL DEFAULT 'KGS',
  region TEXT,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','negotiation','deal','paid','lost')),
  amount REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','api','demo')),
  integration_source TEXT,
  external_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  deleted_at TEXT,
  driver_id INTEGER REFERENCES managers(id) ON DELETE SET NULL,
  driver_name_snapshot TEXT,
  pickup_location TEXT,
  delivery_location TEXT,
  weight_kg REAL,
  vehicle TEXT,
  shipment_status TEXT NOT NULL DEFAULT 'new' CHECK (shipment_status IN ('new','assigned','in_transit','delivered','issue','cancelled')),
  dispatcher_assigned_at TEXT,
  driver_assigned_at TEXT,
  expected_delivery_at TEXT,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_manager ON deals(manager_id);
CREATE INDEX IF NOT EXISTS idx_deals_product ON deals(product_id);
CREATE INDEX IF NOT EXISTS idx_deals_paid_at ON deals(paid_at);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at);
CREATE INDEX IF NOT EXISTS idx_deals_deleted_at ON deals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deals_driver ON deals(driver_id);
CREATE INDEX IF NOT EXISTS idx_deals_shipment_status ON deals(shipment_status);
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

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO app_settings (key,value,updated_at) VALUES
  ('exchange_rate_kgs_per_usd','87.45',datetime('now')),
  ('exchange_rate_source','НБКР',datetime('now')),
  ('exchange_rate_date','2026-10-10',datetime('now')),
  ('dispatcher_commission_pct','1.5',datetime('now')),
  ('driver_commission_pct','10',datetime('now'));

PRAGMA user_version = 5;
