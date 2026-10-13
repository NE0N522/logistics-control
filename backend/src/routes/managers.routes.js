import { Router } from 'express';
import db from '../db/connection.js';
import { ApiError } from '../middleware/error-handler.js';
import { buildFilterClause } from '../services/query-filters.js';
import { BUSINESS_TIMEZONE, dateOnlyToday, assertMonthKey } from '../utils/date-utils.js';
import { email, text, month, money, finiteLimit } from '../utils/validation.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const rows = (await (db.prepare(`SELECT * FROM managers ${includeInactive ? '' : 'WHERE active=1'} ORDER BY name`).all()));
  res.json(rows);
});

router.get('/stats', async (req, res) => {
  const { clause, params } = buildFilterClause(req.query, { dateColumn: 'deals.paid_at' });
  const planPeriod = req.query.planPeriod || dateOnlyToday(BUSINESS_TIMEZONE).slice(0, 7);
  try { assertMonthKey(planPeriod); } catch (err) { throw new ApiError(400, err.message); }
  const managers = (await (db.prepare('SELECT * FROM managers ORDER BY name').all()));
  const filtered = (await (db.prepare(`SELECT deals.manager_id AS id, COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS paidDeals FROM deals ${clause} AND deals.paid_at IS NOT NULL GROUP BY deals.manager_id`).all(params)));
  const filteredMap = new Map(filtered.map((row) => [row.id, row]));
  const plans = (await (db.prepare('SELECT manager_id, target_amount FROM manager_plans WHERE period=?').all(planPeriod)));
  const planMap = new Map(plans.map((row) => [row.manager_id, row.target_amount]));
  const planFrom = `${planPeriod}-01`;
  const planTo = `${planPeriod}-${String(new Date(Date.UTC(Number(planPeriod.slice(0,4)), Number(planPeriod.slice(5,7)), 0)).getUTCDate()).padStart(2,'0')}`;
  const planPaidClause = buildFilterClause({ from: planFrom, to: planTo }, { dateColumn: 'deals.paid_at' });
  const planSales = (await (db.prepare(`SELECT deals.manager_id AS id, COALESCE(SUM(deals.amount),0) AS revenue, COUNT(*) AS paidDeals FROM deals ${planPaidClause.clause} AND deals.paid_at IS NOT NULL GROUP BY deals.manager_id`).all(planPaidClause.params)));
  const planSalesMap = new Map(planSales.map((row) => [row.id, row]));
  const result = managers.map((manager) => {
    const fact = filteredMap.get(manager.id) || { revenue: 0, paidDeals: 0 };
    const planFact = planSalesMap.get(manager.id) || { revenue: 0, paidDeals: 0 };
    const hasPlan = planMap.has(manager.id);
    const plan = hasPlan ? planMap.get(manager.id) : null;
    const pct = plan === null ? null : (plan === 0 ? (planFact.revenue > 0 ? null : 0) : Math.round((planFact.revenue / plan) * 100));
    return { ...manager, revenue: fact.revenue, paidDeals: fact.paidDeals, planSales: planFact.revenue, planPaidDeals: planFact.paidDeals, plan, hasPlan, planCompletionPct: pct };
  });
  res.json({ planPeriod, data: result.sort((a,b) => b.revenue - a.revenue) });
});

router.post('/', requireAdmin, async (req, res) => {
  const name = text(req.body?.name, 'name', { required: true, max: 160 });
  const managerEmail = email(req.body?.email);
  const region = text(req.body?.region, 'region', { max: 120 });
  const position = req.body?.position || 'dispatcher';
  if (!['dispatcher','driver','staff'].includes(position)) throw new ApiError(400, 'Некорректная должность сотрудника');
  const info = (await (db.prepare('INSERT INTO managers (name, email, region, position, hired_at, active) VALUES (?, ?, ?, ?, ?, 1)').run(name, managerEmail, region, position, new Date().toISOString())));
  res.status(201).json((await (db.prepare('SELECT * FROM managers WHERE id=?').get(info.lastInsertRowid))));
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const existing = (await (db.prepare('SELECT * FROM managers WHERE id=?').get(id)));
  if (!existing) throw new ApiError(404, 'Менеджер не найден');
  const name = req.body.name !== undefined ? text(req.body.name, 'name', { required: true, max: 160 }) : existing.name;
  const managerEmail = req.body.email !== undefined ? email(req.body.email) : existing.email;
  const region = req.body.region !== undefined ? text(req.body.region, 'region', { max: 120 }) : existing.region;
  const position = req.body.position !== undefined ? req.body.position : existing.position;
  if (!['dispatcher','driver','staff'].includes(position)) throw new ApiError(400, 'Некорректная должность сотрудника');
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
  (await (db.prepare('UPDATE managers SET name=?, email=?, region=?, position=?, active=? WHERE id=?').run(name, managerEmail, region, position, active, id)));
  res.json((await (db.prepare('SELECT * FROM managers WHERE id=?').get(id))));
});

router.post('/:id/archive', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const info = (await (db.prepare('UPDATE managers SET active=0 WHERE id=?').run(id)));
  if (!info.changes) throw new ApiError(404, 'Менеджер не найден');
  res.json((await (db.prepare('SELECT * FROM managers WHERE id=?').get(id))));
});

router.post('/:id/restore', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const info = (await (db.prepare('UPDATE managers SET active=1 WHERE id=?').run(id)));
  if (!info.changes) throw new ApiError(404, 'Менеджер не найден');
  res.json((await (db.prepare('SELECT * FROM managers WHERE id=?').get(id))));
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = finiteLimit(req.params.id, 'id', 1, 1000000000);
  const info = (await (db.prepare('UPDATE managers SET active=0 WHERE id=?').run(id)));
  if (!info.changes) throw new ApiError(404, 'Менеджер не найден');
  res.json({ deactivated: true, manager: (await (db.prepare('SELECT * FROM managers WHERE id=?').get(id))) });
});

export default router;
