import { Router } from 'express';
import db from '../db/connection.js';
import { ApiError } from '../middleware/error-handler.js';
import { buildFilterClause } from '../services/query-filters.js';
import { money, text, finiteLimit } from '../utils/validation.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  res.json((await (db.prepare(`SELECT * FROM products ${includeInactive ? '' : 'WHERE active=1'} ORDER BY name`).all())));
});

router.get('/stats', async (req, res) => {
  const { clause, params } = buildFilterClause(req.query, { dateColumn: 'deals.paid_at' });
  const filtered = (await (db.prepare(`
    SELECT deals.product_id AS id, COALESCE(SUM(deals.amount),0) AS revenue, COUNT(*) AS paidDeals, COALESCE(SUM(deals.quantity),0) AS unitsSold
    FROM deals ${clause} AND deals.paid_at IS NOT NULL GROUP BY deals.product_id
  `).all(params)));
  const filteredMap = new Map(filtered.map((row) => [row.id, row]));
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const products = (await (db.prepare(`SELECT * FROM products ${includeInactive ? '' : 'WHERE active=1'} ORDER BY name`).all()));
  res.json(products.map((product) => ({ ...product, ...(filteredMap.get(product.id) || { revenue: 0, paidDeals: 0, unitsSold: 0 }) })).sort((a,b) => b.revenue - a.revenue));
});

router.post('/', requireAdmin, async (req, res) => {
  const name = text(req.body?.name, 'name', { required: true, max: 160 });
  const category = text(req.body?.category, 'category', { max: 120 });
  const price = money(req.body?.price, 'price');
  const info = (await (db.prepare('INSERT INTO products (name, category, price, active) VALUES (?, ?, ?, 1)').run(name, category, price)));
  res.status(201).json((await (db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid))));
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const existing = (await (db.prepare('SELECT * FROM products WHERE id=?').get(id)));
  if (!existing) throw new ApiError(404, 'Тип груза не найден');
  const name = req.body.name !== undefined ? text(req.body.name, 'name', { required: true, max: 160 }) : existing.name;
  const category = req.body.category !== undefined ? text(req.body.category, 'category', { max: 120 }) : existing.category;
  const price = req.body.price !== undefined ? money(req.body.price, 'price') : existing.price;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
  (await (db.prepare('UPDATE products SET name=?, category=?, price=?, active=? WHERE id=?').run(name, category, price, active, id)));
  res.json((await (db.prepare('SELECT * FROM products WHERE id=?').get(id))));
});

router.post('/:id/archive', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const info = (await (db.prepare('UPDATE products SET active=0 WHERE id=?').run(id)));
  if (!info.changes) throw new ApiError(404, 'Тип груза не найден');
  res.json((await (db.prepare('SELECT * FROM products WHERE id=?').get(id))));
});

router.post('/:id/restore', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const info = (await (db.prepare('UPDATE products SET active=1 WHERE id=?').run(id)));
  if (!info.changes) throw new ApiError(404, 'Тип груза не найден');
  res.json((await (db.prepare('SELECT * FROM products WHERE id=?').get(id))));
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const info = (await (db.prepare('UPDATE products SET active=0 WHERE id=?').run(id)));
  if (!info.changes) throw new ApiError(404, 'Тип груза не найден');
  res.json({ deactivated: true, product: (await (db.prepare('SELECT * FROM products WHERE id=?').get(id))) });
});

export default router;
