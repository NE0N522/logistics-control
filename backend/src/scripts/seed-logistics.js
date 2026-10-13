import db from '../db/connection.js';
import { resetDatabase } from '../db/reset.js';
import { BUSINESS_TIMEZONE, dateOnlyToday, addCalendarDays, addCalendarMonths, zonedLocalToUtcIso } from '../utils/date-utils.js';
import { hashPassword } from '../utils/password.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DISPATCHERS = [
  { name: 'Айдана Садыкова', region: 'Бишкек' },
  { name: 'Бекжан Иманалиев', region: 'Ош' },
  { name: 'Нуриза Токтосунова', region: 'Чуйская область' },
  { name: 'Эрмек Абдраев', region: 'Иссык-Кульская область' }
];
const DRIVERS = [
  { name: 'Руслан Касымов', region: 'Бишкек' },
  { name: 'Самат Жээнбеков', region: 'Ош' },
  { name: 'Азамат Осмонов', region: 'Чуйская область' },
  { name: 'Мирлан Бейшеналиев', region: 'Иссык-Кульская область' },
  { name: 'Таалайбек Нурматов', region: 'Нарын' }
];
const CARGO_TYPES = [
  { name: 'Паллетный груз', category: 'Стандартный', price: 18000 },
  { name: 'Сборный груз', category: 'Стандартный', price: 12000 },
  { name: 'Рефрижераторный груз', category: 'Температурный режим', price: 36000 },
  { name: 'Контейнер', category: 'Контейнерные перевозки', price: 52000 },
  { name: 'Негабаритный груз', category: 'Спецтранспорт', price: 68000 },
  { name: 'Хрупкий груз', category: 'Особые условия', price: 24000 }
];
const CITIES = ['Бишкек', 'Ош', 'Каракол', 'Токмок', 'Нарын', 'Талас', 'Баткен', 'Джалал-Абад', 'Кант'];
const STATUS_TO_STAGE = { new:'lead', assigned:'negotiation', in_transit:'deal', delivered:'paid', issue:'lost', cancelled:'lost' };

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 4294967296; };
}
function pick(random, items) { return items[Math.floor(random() * items.length)]; }
function makeIso(day, time) { return zonedLocalToUtcIso(day, time, BUSINESS_TIMEZONE); }

async function createStaff({ name, email, role, position, region }) {
  const userId = (await (db.prepare('INSERT INTO users (email,name,password_hash,role,active,created_at) VALUES (?,?,?,?,1,?)')
    .run(email, name, hashPassword(process.env.DEMO_PASSWORD || 'DemoPassword123!'), role, new Date().toISOString()))).lastInsertRowid;
  const managerId = (await (db.prepare('INSERT INTO managers (name,email,region,position,hired_at,active) VALUES (?,?,?,?,?,1)')
    .run(name, email, region, position, new Date().toISOString()))).lastInsertRowid;
  (await (db.prepare('UPDATE users SET manager_id=? WHERE id=?').run(managerId, userId)));
  return managerId;
}

export async function seedLogistics({ allowCloudReset = false } = {}) {
  await resetDatabase({ allowCloudReset });
  const today = dateOnlyToday(BUSINESS_TIMEZONE);
  const random = seededRandom(20261012);
  const dispatcherIds = await Promise.all(DISPATCHERS.map(async (person) => (await db.prepare('INSERT INTO managers (name,email,region,position,hired_at,active) VALUES (?,?,?,\'dispatcher\',?,1)')
    .run(person.name, null, person.region, new Date().toISOString())).lastInsertRowid));
  const driverIds = await Promise.all(DRIVERS.map(async (person) => (await db.prepare('INSERT INTO managers (name,email,region,position,hired_at,active) VALUES (?,?,?,\'driver\',?,1)')
    .run(person.name, null, person.region, new Date().toISOString())).lastInsertRowid));
  const cargoIds = await Promise.all(CARGO_TYPES.map(async (item) => (await db.prepare('INSERT INTO products (name,category,price,active) VALUES (?,?,?,1)')
    .run(item.name, item.category, item.price)).lastInsertRowid));
  const adminEmail = process.env.DEMO_ADMIN_EMAIL || 'admin@demo.local';
  await Promise.all([
    createStaff({ name: 'Администратор', email: adminEmail, role: 'admin', position: 'dispatcher', region: 'Бишкек' }),
    createStaff({ name: 'Демо наблюдатель', email: process.env.DEMO_VIEWER_EMAIL || 'observer@demo.local', role: 'user', position: 'staff', region: 'Бишкек' })
  ]);

  const insertLoad = db.prepare(`INSERT INTO deals (
    title,manager_id,driver_id,product_id,manager_name_snapshot,driver_name_snapshot,product_name_snapshot,unit_price_snapshot,
    currency,region,stage,amount,quantity,source,integration_source,external_id,notes,created_at,updated_at,paid_at,
    pickup_location,delivery_location,weight_kg,vehicle,shipment_status,dispatcher_assigned_at,driver_assigned_at,expected_delivery_at,delivered_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,1,'demo','logistics-seed',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertDealHistory = db.prepare(`INSERT INTO deal_history (deal_id,changed_at,source,new_stage,new_manager_id,new_amount,new_paid_at,new_manager_name_snapshot,new_product_name_snapshot)
    VALUES (?,?,'seed',?,?,?,?,?,?)`);
  const insertShipmentHistory = db.prepare(`INSERT INTO shipment_history (deal_id,changed_at,event_type,new_value) VALUES (?,?,'status',?)`);
  const insertAssignment = db.prepare(`INSERT INTO shipment_history (deal_id,changed_at,event_type,new_value) VALUES (?,?,'dispatcher',?)`);
  const insertDriver = db.prepare(`INSERT INTO shipment_history (deal_id,changed_at,event_type,new_value) VALUES (?,?,'driver',?)`);

  const insertAll = db.transaction(async () => {
    for (let index = 0; index < 240; index += 1) {
      const randomOffset = Math.floor(random() * 730);
      const createdDay = addCalendarDays(today, index === 0 ? -730 : -randomOffset);
      const dispatcherIndex = Math.floor(random() * dispatcherIds.length);
      const driverIndex = Math.floor(random() * driverIds.length);
      const cargoIndex = Math.floor(random() * cargoIds.length);
      const dispatcherId = dispatcherIds[dispatcherIndex];
      const driverId = driverIds[driverIndex];
      const dispatcher = DISPATCHERS[dispatcherIndex];
      const driver = DRIVERS[driverIndex];
      const cargo = CARGO_TYPES[cargoIndex];
      const origin = pick(random, CITIES);
      const destination = pick(random, CITIES.filter((city) => city !== origin));
      const roll = random();
      let status = roll < .08 ? 'new' : roll < .19 ? 'assigned' : roll < .38 ? 'in_transit' : roll < .84 ? 'delivered' : roll < .92 ? 'issue' : 'cancelled';
      if (createdDay < addCalendarDays(today, -30) && ['new','assigned','in_transit'].includes(status)) status = 'delivered';
      const createdAt = makeIso(createdDay, '09:00:00');
      const candidateDeliveredDay = addCalendarDays(createdDay, 1 + Math.floor(random() * 6));
      const deliveredDay = status === 'delivered' ? (candidateDeliveredDay > today ? today : candidateDeliveredDay) : null;
      const deliveredAt = deliveredDay ? makeIso(deliveredDay, '17:30:00') : null;
      const expectedAt = makeIso(addCalendarDays(createdDay, 2 + Math.floor(random() * 5)), '18:00:00');
      const amount = Math.round((cargo.price + random() * cargo.price * 1.8) / 100) * 100;
      const weight = Math.round((100 + random() * 24900) * 10) / 10;
      const vehicle = pick(random, ['Тентованный грузовик', 'Рефрижератор', 'Фура 20 т', 'Контейнеровоз', 'Газель']);
      const now = deliveredAt || makeIso(addCalendarDays(createdDay, Math.min(1 + Math.floor(random() * 4), 14)), '12:00:00');
      const title = `Груз №${String(6000 + index).padStart(4, '0')} · ${origin} — ${destination}`;
      const info = (await (insertLoad.run(title, dispatcherId, driverId, cargoIds[cargoIndex], dispatcher.name, driver.name, cargo.name, cargo.price,
        'KGS', destination, STATUS_TO_STAGE[status], amount, `load-${index + 1}`, `Учебная запись для демонстрации`, createdAt, now,
        deliveredAt, origin, destination, weight, vehicle, status, createdAt, createdAt, expectedAt, deliveredAt)));
      const dealId = info.lastInsertRowid;
      (await (insertDealHistory.run(dealId, createdAt, STATUS_TO_STAGE[status], dispatcherId, amount, deliveredAt, dispatcher.name, cargo.name)));
      (await (insertShipmentHistory.run(dealId, createdAt, status)));
      (await (insertAssignment.run(dealId, createdAt, dispatcher.name)));
      (await (insertDriver.run(dealId, createdAt, driver.name)));
    }
    for (let monthOffset = 0; monthOffset <= 3; monthOffset += 1) {
      const period = addCalendarMonths(today.slice(0, 7), -monthOffset);
      (await (db.prepare('INSERT INTO company_plans (period,target_amount) VALUES (?,?)').run(period, 2_250_000)));
      for (const id of dispatcherIds) await db.prepare('INSERT INTO manager_plans (period,manager_id,target_amount) VALUES (?,?,?)').run(period, id, 560_000);
    }
  });
  (await (insertAll()));
  console.log(`Старая база удалена; создана демонстрационная база логистики: ${db.path}`);
  console.log(`Вход администратора: ${adminEmail} / ${process.env.DEMO_PASSWORD || 'DemoPassword123!'}`);
  console.log(`Вход наблюдателя: ${process.env.DEMO_VIEWER_EMAIL || 'observer@demo.local'} / ${process.env.DEMO_PASSWORD || 'DemoPassword123!'}`);
  console.log('Добавлено: 240 грузов за два года, диспетчеры, водители, типы груза и месячные планы.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const allowCloudReset = process.argv.includes('--confirm-cloud-reset');
  await seedLogistics({ allowCloudReset });
}
