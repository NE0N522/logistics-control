import { Router } from 'express';
import db from '../db/connection.js';
import { buildFilterClause } from '../services/query-filters.js';
import { ApiError } from '../middleware/error-handler.js';
import { dateOnly, idOrNull, money, positiveInt, text, timestamp, finiteLimit } from '../utils/validation.js';
import { dateOnlyToParts, BUSINESS_TIMEZONE, zonedLocalToUtcIso } from '../utils/date-utils.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
export const STAGES = ['lead', 'negotiation', 'deal', 'paid', 'lost'];
const SHIPMENT_STATUSES = ['new', 'assigned', 'in_transit', 'delivered', 'issue', 'cancelled'];
const STATUS_TO_STAGE = { new:'lead', assigned:'negotiation', in_transit:'deal', delivered:'paid', issue:'lost', cancelled:'lost' };
const STAGE_TO_STATUS = { lead:'new', negotiation:'assigned', deal:'in_transit', paid:'delivered', lost:'cancelled' };

async function managerSnapshot(managerId) {
  if (managerId === null) return { record: null, name: null };
  const record = (await (db.prepare('SELECT id, name, active, region, position FROM managers WHERE id = ?').get(managerId)));
  if (!record) throw new ApiError(400, 'Диспетчер не найден');
  return { record, name: record.name };
}

async function productSnapshot(productId) {
  if (productId === null) return { record: null, name: null, unitPrice: null };
  const record = (await (db.prepare('SELECT id, name, price, active FROM products WHERE id = ?').get(productId)));
  if (!record) throw new ApiError(400, 'Тип груза не найден');
  return { record, name: record.name, unitPrice: Number(record.price) };
}

async function driverSnapshot(driverId) {
  if (driverId === null) return { record: null, name: null };
  const record = (await (db.prepare("SELECT id,name,active,position FROM managers WHERE id=?").get(driverId)));
  if (!record) throw new ApiError(400, 'Водитель не найден');
  if (record.position !== 'driver') throw new ApiError(400, 'Выбранный сотрудник не является водителем');
  return { record, name: record.name };
}

function ensureAssignable(record, label, user) {
  if (record && !record.active && user.role !== 'admin') throw new ApiError(400, `${label} архивирован и недоступен для новой перевозки`);
}

function normalizePaidAt(value) {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    try { dateOnly(value, 'Дата оплаты'); } catch (err) { throw err; }
    return zonedLocalToUtcIso(value, '12:00:00', BUSINESS_TIMEZONE);
  }
  return timestamp(value, 'Дата оплаты');
}

function normalizeCreatedAt(value) {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return zonedLocalToUtcIso(value, '12:00:00', BUSINESS_TIMEZONE);
  return timestamp(value, 'Дата создания');
}

function normalizeExpectedDeliveryAt(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return zonedLocalToUtcIso(dateOnly(value, 'Плановая дата доставки'), '12:00:00', BUSINESS_TIMEZONE);
  return timestamp(value, 'Плановая дата доставки');
}

function validateStage(stage) {
  if (!STAGES.includes(stage)) throw new ApiError(400, `Этап должен быть одним из: ${STAGES.join(', ')}`);
}

function validateShipmentStatus(status) {
  if (!SHIPMENT_STATUSES.includes(status)) throw new ApiError(400, `Статус груза должен быть одним из: ${SHIPMENT_STATUSES.join(', ')}`);
}

async function insertHistory(deal, { userId = null, source = 'manual', changedAt = new Date().toISOString() } = {}) {
  (await (db.prepare(`
    INSERT INTO deal_history (
      deal_id, changed_at, changed_by_user_id, source, old_stage, new_stage, old_manager_id, new_manager_id,
      old_amount, new_amount, old_paid_at, new_paid_at, old_manager_name_snapshot, new_manager_name_snapshot,
      old_product_name_snapshot, new_product_name_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deal.id, changedAt, userId, source, deal.__old_stage ?? null, deal.stage, deal.__old_manager_id ?? null, deal.manager_id ?? null,
    deal.__old_amount ?? null, deal.amount, deal.__old_paid_at ?? null, deal.paid_at ?? null,
    deal.__old_manager_name_snapshot ?? null, deal.manager_name_snapshot ?? null,
    deal.__old_product_name_snapshot ?? null, deal.product_name_snapshot ?? null
  )));
}

async function insertShipmentEvent(dealId, eventType, oldValue, newValue, userId, changedAt) {
  (await (db.prepare(`INSERT INTO shipment_history (deal_id,changed_at,changed_by_user_id,event_type,old_value,new_value) VALUES (?,?,?,?,?,?)`)
    .run(dealId, changedAt, userId, eventType, oldValue === null || oldValue === undefined ? null : String(oldValue), newValue === null || newValue === undefined ? null : String(newValue))));
}

function validateIdPath(id) {
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) throw new ApiError(400, 'Некорректный ID груза');
  return num;
}

function validatePayload(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.title !== undefined) out.title = text(body.title, 'title', { required: true, max: 200 });
  if (!partial || body.amount !== undefined) out.amount = money(body.amount, 'amount');
  if (body.quantity !== undefined) out.quantity = positiveInt(body.quantity, 'quantity');
  if (body.stage !== undefined) validateStage(body.stage);
  if (body.managerId !== undefined) out.managerId = idOrNull(body.managerId, 'managerId');
  if (body.dispatcherId !== undefined) out.managerId = idOrNull(body.dispatcherId, 'dispatcherId');
  if (body.driverId !== undefined) out.driverId = idOrNull(body.driverId, 'driverId');
  if (body.productId !== undefined) out.productId = idOrNull(body.productId, 'productId');
  if (body.region !== undefined) out.region = text(body.region, 'region', { max: 120 });
  if (body.pickupLocation !== undefined) out.pickupLocation = text(body.pickupLocation, 'pickupLocation', { max: 240 });
  if (body.deliveryLocation !== undefined) out.deliveryLocation = text(body.deliveryLocation, 'deliveryLocation', { max: 240 });
  if (body.vehicle !== undefined) out.vehicle = text(body.vehicle, 'vehicle', { max: 120 });
  if (body.weightKg !== undefined) {
    const weight = Number(body.weightKg);
    if (body.weightKg === null || body.weightKg === '') out.weightKg = null;
    else if (!Number.isFinite(weight) || weight <= 0 || weight > 100_000_000) throw new ApiError(400, 'Вес груза должен быть положительным числом');
    else out.weightKg = weight;
  }
  if (body.shipmentStatus !== undefined) { validateShipmentStatus(body.shipmentStatus); out.shipmentStatus = body.shipmentStatus; }
  if (body.expectedDeliveryAt !== undefined) out.expectedDeliveryAt = normalizeExpectedDeliveryAt(body.expectedDeliveryAt);
  if (body.notes !== undefined) out.notes = text(body.notes, 'notes', { max: 4000, trim: false });
  if (body.currency !== undefined) out.currency = text(body.currency, 'currency', { max: 3 });
  if (body.createdAt !== undefined) out.createdAt = normalizeCreatedAt(body.createdAt);
  if (body.paidAt !== undefined && body.paidAt !== null && body.paidAt !== '') out.paidAt = normalizePaidAt(body.paidAt);
  return out;
}

router.get('/', async (req, res) => {
  const { clause, params } = buildFilterClause(req.query, { dateColumn: 'deals.created_at' });
  if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length > 120)) throw new ApiError(400, 'Поисковый запрос должен быть строкой до 120 символов');
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.shipmentStatus === 'string' && req.query.shipmentStatus ? req.query.shipmentStatus : '';
  if (status) validateShipmentStatus(status);
  const statusClause = status ? ' AND deals.shipment_status=@shipmentStatus' : '';
  const searchClause = search ? ` AND (
    instr(lower(COALESCE(deals.title,'')), lower(@search)) > 0 OR
    instr(lower(COALESCE(deals.manager_name_snapshot,'')), lower(@search)) > 0 OR
    instr(lower(COALESCE(deals.product_name_snapshot,'')), lower(@search)) > 0 OR
    instr(lower(COALESCE(deals.region,'')), lower(@search)) > 0 OR
    instr(lower(COALESCE(deals.pickup_location,'')), lower(@search)) > 0 OR
    instr(lower(COALESCE(deals.delivery_location,'')), lower(@search)) > 0 OR
    instr(lower(COALESCE(deals.driver_name_snapshot,'')), lower(@search)) > 0 OR
    instr(lower(COALESCE(deals.notes,'')), lower(@search)) > 0
  )` : '';
  const searchParams = search ? { search } : {};
  const page = finiteLimit(req.query.page, 'page', 1, 100000, 1);
  const pageSize = finiteLimit(req.query.pageSize, 'pageSize', 1, 200, 25);
  const offset = (page - 1) * pageSize;
  const queryParams = { ...params, ...searchParams, ...(status ? { shipmentStatus: status } : {}) };
  const total = (await (db.prepare(`SELECT COUNT(*) AS c FROM deals ${clause}${statusClause}${searchClause}`).get(queryParams))).c;
  const rows = (await (db.prepare(`
    SELECT deals.*, managers.name AS manager_name, managers.active AS manager_active,
           drivers.name AS driver_name, drivers.active AS driver_active, managers.position AS dispatcher_position,
           products.name AS product_name, products.active AS product_active
    FROM deals
    LEFT JOIN managers ON managers.id = deals.manager_id
    LEFT JOIN managers drivers ON drivers.id = deals.driver_id
    LEFT JOIN products ON products.id = deals.product_id
    ${clause}${statusClause}${searchClause}
    ORDER BY deals.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...queryParams, limit: pageSize, offset })));
  res.json({ data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.get('/:id', async (req, res) => {
  const id = validateIdPath(req.params.id);
  const deal = (await (db.prepare(`
    SELECT deals.*, managers.name AS manager_name, managers.active AS manager_active,
           drivers.name AS driver_name, drivers.active AS driver_active,
           products.name AS product_name, products.active AS product_active
    FROM deals LEFT JOIN managers ON managers.id=deals.manager_id LEFT JOIN managers drivers ON drivers.id=deals.driver_id LEFT JOIN products ON products.id=deals.product_id
    WHERE deals.id = ? AND deals.deleted_at IS NULL
  `).get(id)));
  if (!deal) throw new ApiError(404, 'Груз не найден');
  res.json(deal);
});

router.get('/:id/history', async (req, res) => {
  const id = validateIdPath(req.params.id);
  const deal = (await (db.prepare('SELECT id FROM deals WHERE id=?').get(id)));
  if (!deal) throw new ApiError(404, 'Груз не найден');
  res.json((await (db.prepare(`
    SELECT history.*, users.email AS changed_by_email, users.name AS changed_by_name
    FROM deal_history history LEFT JOIN users ON users.id=history.changed_by_user_id
    WHERE history.deal_id=? ORDER BY history.changed_at ASC, history.id ASC
  `).all(id))));
});

router.get('/:id/shipment-history', async (req, res) => {
  const id = validateIdPath(req.params.id);
  if (!(await (db.prepare('SELECT id FROM deals WHERE id=?').get(id)))) throw new ApiError(404, 'Груз не найден');
  res.json((await (db.prepare(`SELECT h.*,u.name AS changed_by_name FROM shipment_history h LEFT JOIN users u ON u.id=h.changed_by_user_id WHERE h.deal_id=? ORDER BY h.changed_at,h.id`).all(id))));
});

router.post('/', async (req, res) => {
  const payload = validatePayload(req.body);
  if (payload.stage) validateStage(payload.stage);
  const manager = await managerSnapshot(payload.managerId ?? null);
  const driver = await driverSnapshot(payload.driverId ?? null);
  const product = await productSnapshot(payload.productId ?? null);
  ensureAssignable(manager.record, 'Диспетчер', req.user);
  ensureAssignable(driver.record, 'Водитель', req.user);
  if (manager.record && manager.record.position !== 'dispatcher') throw new ApiError(400, 'Выбранный сотрудник не является диспетчером');
  ensureAssignable(product.record, 'Тип груза', req.user);
  const now = new Date().toISOString();
  const shipmentStatus = payload.shipmentStatus || (payload.stage ? STAGE_TO_STATUS[payload.stage] : 'new');
  const stage = STATUS_TO_STAGE[shipmentStatus];
  const paidAt = shipmentStatus === 'delivered' ? normalizePaidAt(req.body.paidAt || undefined) : null;
  const createdAt = payload.createdAt || now;
  const currency = payload.currency || 'KGS';

  const tx = db.transaction(async () => {
    const info = (await (db.prepare(`
      INSERT INTO deals (
        title, manager_id, product_id, manager_name_snapshot, product_name_snapshot, unit_price_snapshot, currency,
        region, stage, amount, quantity, source, notes, created_at, updated_at, paid_at,
        driver_id,driver_name_snapshot,pickup_location,delivery_location,weight_kg,vehicle,shipment_status,
        dispatcher_assigned_at,driver_assigned_at,expected_delivery_at,delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.title, payload.managerId ?? null, payload.productId ?? null, manager.name, product.name, product.unitPrice,
      currency, payload.region ?? null, stage, payload.amount, payload.quantity ?? 1, payload.notes ?? null, createdAt, now, paidAt,
      payload.driverId ?? null, driver.name, payload.pickupLocation ?? null, payload.deliveryLocation ?? null, payload.weightKg ?? null,
      payload.vehicle ?? null, shipmentStatus, manager.record ? now : null, driver.record ? now : null,
      payload.expectedDeliveryAt ?? null, shipmentStatus === 'delivered' ? paidAt : null)));
    const deal = (await (db.prepare('SELECT * FROM deals WHERE id=?').get(info.lastInsertRowid)));
    await insertHistory(deal, { userId: req.user.id, source: 'manual', changedAt: now });
    await insertShipmentEvent(deal.id, 'status', null, shipmentStatus, req.user.id, now);
    if (manager.record) await insertShipmentEvent(deal.id, 'dispatcher', null, manager.name, req.user.id, now);
    if (driver.record) await insertShipmentEvent(deal.id, 'driver', null, driver.name, req.user.id, now);
    return deal;
  });
  res.status(201).json((await (tx())));
});

router.put('/:id', async (req, res) => {
  const id = validateIdPath(req.params.id);
  const existing = (await (db.prepare('SELECT * FROM deals WHERE id = ? AND deleted_at IS NULL').get(id)));
  if (!existing) throw new ApiError(404, 'Груз не найден');
  const payload = validatePayload(req.body, { partial: true });
  const managerId = payload.managerId !== undefined ? payload.managerId : existing.manager_id;
  const driverId = payload.driverId !== undefined ? payload.driverId : existing.driver_id;
  const productId = payload.productId !== undefined ? payload.productId : existing.product_id;
  const manager = await managerSnapshot(managerId);
  const driver = await driverSnapshot(driverId);
  const product = await productSnapshot(productId);
  ensureAssignable(manager.record, 'Диспетчер', req.user);
  ensureAssignable(driver.record, 'Водитель', req.user);
  if (manager.record && manager.record.position !== 'dispatcher') throw new ApiError(400, 'Выбранный сотрудник не является диспетчером');
  ensureAssignable(product.record, 'Тип груза', req.user);
  const mergedStatus = payload.shipmentStatus || (payload.stage ? STAGE_TO_STATUS[payload.stage] : existing.shipment_status);
  validateShipmentStatus(mergedStatus);
  const mergedStage = STATUS_TO_STAGE[mergedStatus];
  validateStage(mergedStage);
  let paidAt = existing.paid_at;
  if (mergedStatus === 'delivered') paidAt = req.body.paidAt !== undefined ? (req.body.paidAt ? normalizePaidAt(req.body.paidAt) : null) : (existing.paid_at || normalizePaidAt());
  const deliveredAt = mergedStatus === 'delivered' ? (existing.delivered_at || paidAt) : existing.delivered_at;
  if (mergedStatus === 'delivered' && !paidAt) throw new ApiError(400, 'Укажите дату доставки');
  const now = new Date().toISOString();
  const merged = {
    title: payload.title ?? existing.title,
    managerId,
    driverId,
    productId,
    region: payload.region !== undefined ? payload.region : existing.region,
    stage: mergedStage,
    shipmentStatus: mergedStatus,
    amount: payload.amount !== undefined ? payload.amount : existing.amount,
    quantity: payload.quantity !== undefined ? payload.quantity : existing.quantity,
    notes: payload.notes !== undefined ? payload.notes : existing.notes,
    pickupLocation: payload.pickupLocation !== undefined ? payload.pickupLocation : existing.pickup_location,
    deliveryLocation: payload.deliveryLocation !== undefined ? payload.deliveryLocation : existing.delivery_location,
    weightKg: payload.weightKg !== undefined ? payload.weightKg : existing.weight_kg,
    vehicle: payload.vehicle !== undefined ? payload.vehicle : existing.vehicle,
    expectedDeliveryAt: payload.expectedDeliveryAt !== undefined ? payload.expectedDeliveryAt : existing.expected_delivery_at,
    dispatcherAssignedAt: managerId !== existing.manager_id ? (managerId ? now : null) : existing.dispatcher_assigned_at,
    driverAssignedAt: driverId !== existing.driver_id ? (driverId ? now : null) : existing.driver_assigned_at,
    deliveredAt,
    currency: payload.currency || existing.currency || 'KGS',
    managerSnapshot: managerId !== existing.manager_id ? manager.name : existing.manager_name_snapshot,
    driverSnapshot: driverId !== existing.driver_id ? driver.name : existing.driver_name_snapshot,
    productSnapshot: productId !== existing.product_id ? product.name : existing.product_name_snapshot,
    unitPriceSnapshot: productId !== existing.product_id ? product.unitPrice : existing.unit_price_snapshot
  };
  const tx = db.transaction(async () => {
    (await (db.prepare(`UPDATE deals SET title=?, manager_id=?, driver_id=?, product_id=?, manager_name_snapshot=?, driver_name_snapshot=?, product_name_snapshot=?, unit_price_snapshot=?, currency=?, region=?, pickup_location=?, delivery_location=?, weight_kg=?, vehicle=?, shipment_status=?, expected_delivery_at=?, dispatcher_assigned_at=?, driver_assigned_at=?, delivered_at=?, stage=?, amount=?, quantity=?, notes=?, updated_at=?, paid_at=? WHERE id=?`)
      .run(merged.title, merged.managerId, merged.driverId, merged.productId, merged.managerSnapshot, merged.driverSnapshot,
        merged.productSnapshot, merged.unitPriceSnapshot, merged.currency, merged.region, merged.pickupLocation, merged.deliveryLocation,
        merged.weightKg, merged.vehicle, merged.shipmentStatus, merged.expectedDeliveryAt, merged.dispatcherAssignedAt,
        merged.driverAssignedAt, merged.deliveredAt, merged.stage, merged.amount, merged.quantity, merged.notes, now, paidAt, id)));
    const deal = (await (db.prepare('SELECT * FROM deals WHERE id=?').get(id)));
    const changed = existing.stage !== deal.stage || existing.manager_id !== deal.manager_id || existing.amount !== deal.amount || existing.paid_at !== deal.paid_at || existing.product_id !== deal.product_id || existing.region !== deal.region;
    if (changed) {
      await insertHistory({
        ...deal,
        __old_stage: existing.stage,
        __old_manager_id: existing.manager_id,
        __old_amount: existing.amount,
        __old_paid_at: existing.paid_at,
        __old_manager_name_snapshot: existing.manager_name_snapshot,
        __old_product_name_snapshot: existing.product_name_snapshot
      }, { userId: req.user.id, source: 'manual', changedAt: now });
    }
    if (existing.shipment_status !== deal.shipment_status) await insertShipmentEvent(id, 'status', existing.shipment_status, deal.shipment_status, req.user.id, now);
    if (existing.manager_id !== deal.manager_id) await insertShipmentEvent(id, 'dispatcher', existing.manager_name_snapshot, deal.manager_name_snapshot, req.user.id, now);
    if (existing.driver_id !== deal.driver_id) await insertShipmentEvent(id, 'driver', existing.driver_name_snapshot, deal.driver_name_snapshot, req.user.id, now);
    return deal;
  });
  res.json((await (tx())));
});

router.patch('/:id/stage', async (req, res) => {
  const id = validateIdPath(req.params.id);
  const existing = (await (db.prepare('SELECT * FROM deals WHERE id=? AND deleted_at IS NULL').get(id)));
  if (!existing) throw new ApiError(404, 'Груз не найден');
  const status = req.body?.shipmentStatus || (req.body?.stage ? STAGE_TO_STATUS[req.body.stage] : null);
  validateShipmentStatus(status);
  const newStage = STATUS_TO_STAGE[status];
  const paidAt = status === 'delivered' ? (req.body.paidAt ? normalizePaidAt(req.body.paidAt) : (existing.paid_at || normalizePaidAt())) : existing.paid_at;
  if (status === 'delivered' && !paidAt) throw new ApiError(400, 'Укажите дату доставки');
  const now = new Date().toISOString();
  (await (db.transaction(async () => {
    const deliveredAt = status === 'delivered' ? (existing.delivered_at || paidAt) : existing.delivered_at;
    (await (db.prepare('UPDATE deals SET stage=?, shipment_status=?, delivered_at=?, paid_at=?, updated_at=? WHERE id=?').run(newStage, status, deliveredAt, paidAt, now, id)));
    const deal = (await (db.prepare('SELECT * FROM deals WHERE id=?').get(id)));
    await insertHistory({ ...deal, __old_stage: existing.stage, __old_manager_id: existing.manager_id, __old_amount: existing.amount, __old_paid_at: existing.paid_at, __old_manager_name_snapshot: existing.manager_name_snapshot, __old_product_name_snapshot: existing.product_name_snapshot }, { userId: req.user.id, source: 'manual', changedAt: now });
    if (existing.shipment_status !== status) await insertShipmentEvent(id, 'status', existing.shipment_status, status, req.user.id, now);
  })()));
  res.json((await (db.prepare('SELECT * FROM deals WHERE id=?').get(id))));
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = validateIdPath(req.params.id);
  const existing = (await (db.prepare('SELECT * FROM deals WHERE id=? AND deleted_at IS NULL').get(id)));
  if (!existing) throw new ApiError(404, 'Груз не найден');
  const now = new Date().toISOString();
  (await (db.transaction(async () => {
    (await (db.prepare('UPDATE deals SET deleted_at=?, updated_at=? WHERE id=?').run(now, now, id)));
    const deal = (await (db.prepare('SELECT * FROM deals WHERE id=?').get(id)));
    await insertHistory({ ...deal, __old_stage: existing.stage, __old_manager_id: existing.manager_id, __old_amount: existing.amount, __old_paid_at: existing.paid_at, __old_manager_name_snapshot: existing.manager_name_snapshot, __old_product_name_snapshot: existing.product_name_snapshot }, { userId: req.user.id, source: 'manual-delete', changedAt: now });
  })()));
  res.status(204).end();
});

export default router;
