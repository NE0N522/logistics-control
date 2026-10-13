import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/connection.js';
import { ApiError } from '../middleware/error-handler.js';
import { apiKeyAuth, hashKey } from '../middleware/api-key-auth.js';
import { integrationRateLimit } from '../middleware/rate-limit.js';
import { requireAuth, requireAdmin, csrfProtection } from '../middleware/auth.js';
import { dateOnly, idOrNull, money, positiveInt, text, timestamp } from '../utils/validation.js';
import { BUSINESS_TIMEZONE, zonedLocalToUtcIso } from '../utils/date-utils.js';
import { STAGES } from './deals.routes.js';

const router = Router();

router.get('/keys', requireAuth, requireAdmin, async (req, res) => {
  const rows = (await (db.prepare('SELECT id, label, created_at, last_used_at FROM api_keys ORDER BY created_at DESC').all()));
  res.json(rows.map((row) => ({ ...row, key: null, keyStoredAsHash: true })));
});

router.post('/keys', requireAuth, requireAdmin, csrfProtection, async (req, res) => {
  const label = text(req.body?.label, 'label', { max: 120 }) || 'Новый ключ';
  const key = `sk_${crypto.randomBytes(24).toString('base64url')}`;
  const info = (await (db.prepare('INSERT INTO api_keys (label, key, created_at, created_by_user_id) VALUES (?, ?, ?, ?)')
    .run(label, hashKey(key), new Date().toISOString(), req.user.id)));
  const record = (await (db.prepare('SELECT id, label, created_at, last_used_at FROM api_keys WHERE id=?').get(info.lastInsertRowid)));
  res.status(201).json({ ...record, apiKey: key, warning: 'Секрет показывается только один раз' });
});

router.delete('/keys/:id', requireAuth, requireAdmin, csrfProtection, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'Некорректный ID ключа');
  const info = (await (db.prepare('DELETE FROM api_keys WHERE id=?').run(id)));
  if (!info.changes) throw new ApiError(404, 'Ключ не найден');
  res.status(204).end();
});

function parseExternalDate(value, field, dateOnlyAllowed = true) {
  if (!value) return null;
  if (dateOnlyAllowed && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    dateOnly(value, field);
    return zonedLocalToUtcIso(value, '12:00:00', BUSINESS_TIMEZONE);
  }
  return timestamp(value, field);
}

router.post('/deals', integrationRateLimit, apiKeyAuth, async (req, res) => {
  const body = req.body || {};
  const title = text(body.title, 'title', { required: true, max: 200 });
  const amount = money(body.amount, 'amount');
  const quantity = positiveInt(body.quantity, 'quantity', { defaultValue: 1 });
  const managerId = idOrNull(body.managerId, 'managerId');
  const productId = idOrNull(body.productId, 'productId');
  const region = text(body.region, 'region', { max: 120 });
  const notes = text(body.notes, 'notes', { max: 4000, trim: false });
  const integrationSource = text(body.integrationSource || req.header('X-Integration-Source') || 'default', 'integrationSource', { max: 100 });
  const externalId = text(body.externalId, 'externalId', { required: true, max: 200 });
  const stage = body.stage || 'lead';
  if (!STAGES.includes(stage)) throw new ApiError(400, 'Некорректный stage');

  const now = new Date().toISOString();
  const createdAt = parseExternalDate(body.createdAt, 'Дата создания') || now;
  const paidAt = stage === 'paid' ? (parseExternalDate(body.paidAt, 'Дата оплаты') || now) : null;
  const currency = text(body.currency || 'RUB', 'currency', { max: 3 });

  try {
    const result = (await (db.transaction(async () => {
      const duplicate = (await (db.prepare('SELECT * FROM deals WHERE integration_source=? AND external_id=?').get(integrationSource, externalId)));
      if (duplicate) return { deal: duplicate, duplicate: true };

      const manager = managerId ? (await (db.prepare('SELECT id,name,active,region FROM managers WHERE id=?').get(managerId))) : null;
      const product = productId ? (await (db.prepare('SELECT id,name,price,active FROM products WHERE id=?').get(productId))) : null;
      if (managerId && !manager) throw new ApiError(400, 'Диспетчер не найден');
      if (productId && !product) throw new ApiError(400, 'Тип груза не найден');
      if (manager && !manager.active) throw new ApiError(400, 'Нельзя назначить архивного диспетчера из внешней интеграции');
      if (product && !product.active) throw new ApiError(400, 'Нельзя назначить архивный тип груза из внешней интеграции');

      const info = (await (db.prepare(`
        INSERT INTO deals (
          title, manager_id, product_id, manager_name_snapshot, product_name_snapshot, unit_price_snapshot, currency,
          region, stage, amount, quantity, source, integration_source, external_id, notes, created_at, updated_at, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?, ?, ?, ?, ?, ?)
      `).run(title, managerId, productId, manager?.name || null, product?.name || null, product?.price ?? null, currency,
        region, stage, amount, quantity, integrationSource, externalId, notes, createdAt, now, paidAt)));
      const deal = (await (db.prepare('SELECT * FROM deals WHERE id=?').get(info.lastInsertRowid)));
      (await (db.prepare(`INSERT INTO deal_history (deal_id,changed_at,source,new_stage,new_manager_id,new_amount,new_paid_at,new_manager_name_snapshot,new_product_name_snapshot)
                  VALUES (?, ?, 'api', ?, ?, ?, ?, ?, ?)`).run(
        deal.id, now, deal.stage, deal.manager_id, deal.amount, deal.paid_at, deal.manager_name_snapshot, deal.product_name_snapshot
      )));
      return { deal, duplicate: false };
    })()));
    res.status(result.duplicate ? 200 : 201).json({ ...result.deal, duplicate: result.duplicate });
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE constraint failed: deals.integration_source, deals.external_id')) {
      const duplicate = (await (db.prepare('SELECT * FROM deals WHERE integration_source=? AND external_id=?').get(integrationSource, externalId)));
      if (duplicate) return res.status(200).json({ ...duplicate, duplicate: true });
    }
    throw err;
  }
});

export default router;
