import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-dashboard-domain-'));
const dbPath = path.join(tmpDir, 'sales.db');
process.env.DB_PATH = dbPath;
process.env.BUSINESS_TIMEZONE = 'Asia/Bishkek';
process.env.APP_VERSION = '1.2.2';

const { db } = await import('../src/db/connection.js');
const dateUtils = await import('../src/utils/date-utils.js');
const { hashPassword, verifyPassword } = await import('../src/utils/password.js');
const { up: migrateV2 } = await import('../src/db/migrations/001_legacy_to_v2.js');
const { getSummary, getRevenueByMonth, getFunnel } = await import('../src/services/analytics.service.js');
const { getForecast, linearRegression } = await import('../src/services/forecast.service.js');

before(() => {
  db.prepare('INSERT INTO users (email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)')
    .run('domain@example.com', 'Domain Test', hashPassword('correct horse battery staple'), 'admin', new Date().toISOString());
  db.prepare('INSERT INTO managers (name,email,region,hired_at,active) VALUES (?,?,?,?,1)')
    .run('Тестовый менеджер', 'manager@example.com', 'Бишкек', new Date().toISOString());
  db.prepare('INSERT INTO products (name,category,price,active) VALUES (?,?,?,1)')
    .run('Тестовый товар', 'Test', 100,);
  const managerId = db.prepare('SELECT id FROM managers LIMIT 1').get().id;
  const productId = db.prepare('SELECT id FROM products LIMIT 1').get().id;
  const deal = db.prepare(`INSERT INTO deals (
    title, manager_id, product_id, manager_name_snapshot, product_name_snapshot, unit_price_snapshot,
    currency, region, stage, amount, quantity, source, created_at, updated_at, paid_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'Оплата в следующем месяце', managerId, productId, 'Тестовый менеджер', 'Тестовый товар', 100,
    'RUB', 'Бишкек', 'paid', 500, 5, 'manual',
    '2026-09-30T04:00:00.000Z', '2026-10-01T06:00:00.000Z', '2026-10-01T06:00:00.000Z'
  );
  db.prepare(`INSERT INTO deal_history (deal_id,changed_at,source,new_stage,new_manager_id,new_amount,new_paid_at,new_manager_name_snapshot,new_product_name_snapshot)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(
    deal.lastInsertRowid, '2026-10-01T06:00:00.000Z', 'manual', 'paid', managerId, 500,
    '2026-10-01T06:00:00.000Z', 'Тестовый менеджер', 'Тестовый товар'
  );
});

after(() => {
  try { db.close(); } catch {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('calendar dates validate real dates and business timezone boundaries', () => {
  assert.equal(dateUtils.isValidDateOnly('2024-02-29'), true);
  assert.equal(dateUtils.isValidDateOnly('2026-02-29'), false);
  assert.throws(() => dateUtils.assertDateRange('2026-03-02', '2026-03-01'), /не может быть позже/);
  assert.equal(dateUtils.startOfDayIso('2026-01-15', 'Asia/Bishkek'), '2026-01-14T18:00:00.000Z');
  assert.equal(dateUtils.startOfDayIso('2026-01-15', 'UTC'), '2026-01-15T00:00:00.000Z');
  assert.equal(dateUtils.startOfDayIso('2026-01-15', 'America/Los_Angeles'), '2026-01-15T08:00:00.000Z');
  assert.equal(dateUtils.endOfDayIso('2026-01-15', 'Asia/Bishkek'), '2026-01-15T17:59:59.999Z');
  assert.equal(dateUtils.monthEndDateOnly('2024-02'), '2024-02-29');
  assert.throws(() => dateUtils.assertMonthKey('2026-13'), /реальным месяцем/);
});

test('passwords use a random salt and verify correctly', () => {
  const a = hashPassword('correct horse battery staple');
  const b = hashPassword('correct horse battery staple');
  assert.notEqual(a, b);
  assert.ok(verifyPassword('correct horse battery staple', a));
  assert.equal(verifyPassword('wrong password', a), false);
});

test('financial metrics use created_at and paid_at consistently', () => {
  const september = getSummary({ from: '2026-09-30', to: '2026-09-30' });
  const october = getSummary({ from: '2026-10-01', to: '2026-10-01' });
  assert.equal(september.totalDeals, 1);
  assert.equal(september.revenue, 0);
  assert.equal(september.paidDeals, 0);
  assert.equal(october.totalDeals, 0);
  assert.equal(october.revenue, 500);
  assert.equal(october.paidDeals, 1);
  assert.equal(october.avgCheck, 500);

  const revenue = getRevenueByMonth({ from: '2026-10-01', to: '2026-10-01' });
  assert.equal(revenue.length, 1);
  assert.equal(revenue[0].revenue, 500);
  assert.equal(revenue[0].deals, 1);
});

test('updating stage away from paid does not erase paid_at fact', () => {
  const id = db.prepare('SELECT id FROM deals LIMIT 1').get().id;
  db.prepare("UPDATE deals SET stage='lost', updated_at=? WHERE id=?").run(new Date().toISOString(), id);
  const row = db.prepare('SELECT stage,paid_at FROM deals WHERE id=?').get(id);
  assert.equal(row.stage, 'lost');
  assert.equal(row.paid_at, '2026-10-01T06:00:00.000Z');
  const summary = getSummary({ from: '2026-10-01', to: '2026-10-01' });
  assert.equal(summary.revenue, 500);
});


test('funnel pipeline contains only open stages', () => {
  const managerId = db.prepare('SELECT id FROM managers LIMIT 1').get().id;
  const productId = db.prepare('SELECT id FROM products LIMIT 1').get().id;
  const rows = [
    ['Open lead','lead',100],
    ['Open negotiation','negotiation',200],
    ['Open deal','deal',300],
    ['Already paid','paid',400],
    ['Lost','lost',500]
  ];
  for (const [title, stage, amount] of rows) {
    db.prepare(`INSERT INTO deals (title,manager_id,product_id,manager_name_snapshot,product_name_snapshot,unit_price_snapshot,currency,region,stage,amount,quantity,source,created_at,updated_at,paid_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(title,managerId,productId,'Тестовый менеджер','Тестовый товар',100,'RUB','Бишкек',stage,amount,1,'manual','2026-10-01T04:00:00.000Z','2026-10-01T04:00:00.000Z',stage==='paid'?'2026-10-01T06:00:00.000Z':null);
  }
  const funnel = getFunnel({ from: '2026-10-01', to: '2026-10-01' });
  assert.equal(funnel.pipelineAmount, 600);
  assert.equal(funnel.stages.find((x)=>x.stage==='paid').amount,400);
  assert.equal(funnel.stages.find((x)=>x.stage==='lost').amount,500);
});
test('forecast clamps a negative trend and handles zero history', () => {
  const negative = linearRegression([{ x: 0, y: 100 }, { x: 1, y: 40 }, { x: 2, y: 0 }]);
  assert.ok(negative.b < 0);
  const onePoint = linearRegression([{ x: 0, y: 250 }]);
  assert.equal(onePoint.b, 0);
  assert.equal(onePoint.a, 250);
  const forecast = getForecast({ historyMonths: 1, forecastMonths: 2, filters: { managerId: '999999' } });
  assert.equal(forecast.history.length, 1);
  assert.equal(forecast.history[0].revenue, 0);
  assert.equal(forecast.forecast[0].revenue, 0);
  assert.equal(forecast.forecast[1].revenue, 0);
});

test('legacy migration preserves data and de-duplicates plans deterministically', () => {
  const legacyPath = path.join(tmpDir, 'legacy.db');
  const raw = new DatabaseSync(legacyPath);
  raw.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE managers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, region TEXT, hired_at TEXT, active INTEGER DEFAULT 1);
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT, price REAL NOT NULL DEFAULT 0, active INTEGER DEFAULT 1);
    CREATE TABLE deals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, manager_id INTEGER, product_id INTEGER, region TEXT, stage TEXT NOT NULL, amount REAL NOT NULL, quantity INTEGER NOT NULL, source TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT);
    CREATE TABLE plans (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT, manager_id INTEGER, target_amount REAL NOT NULL);
    INSERT INTO managers(name,email,region,active) VALUES('Legacy Manager','legacy@example.com','Бишкек',1);
    INSERT INTO products(name,category,price,active) VALUES('Legacy Product','Cat',100,1);
    INSERT INTO deals(title,manager_id,product_id,region,stage,amount,quantity,source,created_at,updated_at,paid_at) VALUES('Legacy Deal',1,1,'Бишкек','paid',100,1,'manual','2026-09-01T00:00:00.000Z','2026-09-02T00:00:00.000Z','2026-09-02T00:00:00.000Z');
    INSERT INTO plans(period,manager_id,target_amount) VALUES('2026-09',NULL,100);
    INSERT INTO plans(period,manager_id,target_amount) VALUES('2026-09',NULL,200);
    INSERT INTO plans(period,manager_id,target_amount) VALUES('2026-09',1,50);
    INSERT INTO plans(period,manager_id,target_amount) VALUES('2026-09',1,70);
    PRAGMA user_version=1;
  `);
  const wrapper = {
    exec(sql){ raw.exec(sql); },
    prepare(sql){
      const stmt=raw.prepare(sql);
      stmt.setAllowBareNamedParameters(true);
      if (typeof stmt.setAllowUnknownNamedParameters==='function') stmt.setAllowUnknownNamedParameters(true);
      const norm=(row)=>{if(!row)return row;for(const k of Object.keys(row))if(typeof row[k]==='bigint')row[k]=Number(row[k]);return row;};
      return {get:(...args)=>norm(stmt.get(...args)),all:(...args)=>stmt.all(...args).map(norm),run:(...args)=>{const r=stmt.run(...args);return {changes:Number(r.changes),lastInsertRowid:Number(r.lastInsertRowid)}}};
    },
    transaction(fn){return (...args)=>{raw.exec('BEGIN');try{const result=fn(...args);raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}}
  };
  migrateV2(wrapper);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM deals').get().c, 1);
  assert.equal(raw.prepare('SELECT manager_name_snapshot FROM deals LIMIT 1').get().manager_name_snapshot, 'Legacy Manager');
  assert.equal(raw.prepare('SELECT target_amount FROM company_plans WHERE period=?').get('2026-09').target_amount, 200);
  assert.equal(raw.prepare('SELECT target_amount FROM manager_plans WHERE period=? AND manager_id=1').get('2026-09').target_amount, 70);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM deal_history').get().c, 1);
  assert.equal(raw.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'plans\'').get(), undefined);
  raw.close();
  fs.rmSync(legacyPath, { force: true });
});
