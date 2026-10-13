import { Router } from 'express';
import db from '../db/connection.js';
import { ApiError } from '../middleware/error-handler.js';
import { requireAdmin } from '../middleware/auth.js';
import { idOrNull, money, month } from '../utils/validation.js';
import { BUSINESS_TIMEZONE, dateOnlyToday } from '../utils/date-utils.js';

const router = Router();

function currentPeriod() { return dateOnlyToday(BUSINESS_TIMEZONE).slice(0, 7); }

router.get('/', async (req, res) => {
  const period = month(req.query.period || currentPeriod());
  const company = (await (db.prepare('SELECT period, target_amount FROM company_plans WHERE period=?').get(period))) || null;
  const byManager = (await (db.prepare('SELECT period, manager_id, target_amount FROM manager_plans WHERE period=? ORDER BY manager_id').all(period)));
  res.json({ period, company, byManager });
});

router.put('/', requireAdmin, async (req, res) => {
  const period = month(req.body?.period, 'Период');
  const targetAmount = money(req.body?.targetAmount, 'targetAmount');
  const managerId = idOrNull(req.body?.managerId, 'managerId');
  if (managerId === null) {
    (await (db.prepare('INSERT INTO company_plans (period, target_amount) VALUES (?, ?) ON CONFLICT(period) DO UPDATE SET target_amount=excluded.target_amount').run(period, targetAmount)));
    return res.json((await (db.prepare('SELECT period, target_amount FROM company_plans WHERE period=?').get(period))));
  }
  const manager = (await (db.prepare('SELECT id, active FROM managers WHERE id=?').get(managerId)));
  if (!manager) throw new ApiError(400, 'Сотрудник не найден');
  (await (db.prepare('INSERT INTO manager_plans (period, manager_id, target_amount) VALUES (?, ?, ?) ON CONFLICT(period, manager_id) DO UPDATE SET target_amount=excluded.target_amount').run(period, managerId, targetAmount)));
  res.json((await (db.prepare('SELECT period, manager_id, target_amount FROM manager_plans WHERE period=? AND manager_id=?').get(period, managerId))));
});

router.delete('/', requireAdmin, async (req, res) => {
  const period = month(req.query.period || currentPeriod());
  const managerId = idOrNull(req.query.managerId, 'managerId');
  const result = managerId === null
    ? (await (db.prepare('DELETE FROM company_plans WHERE period=?').run(period)))
    : (await (db.prepare('DELETE FROM manager_plans WHERE period=? AND manager_id=?').run(period, managerId)));
  if (!result.changes) throw new ApiError(404, 'План не найден');
  res.status(204).end();
});

export default router;
