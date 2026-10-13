import { Router } from 'express';
import db from '../db/connection.js';
import { buildFilterClause } from '../services/query-filters.js';
import { ApiError } from '../middleware/error-handler.js';
import { finiteLimit } from '../utils/validation.js';

const router = Router();

router.get('/report', async (req, res) => {
  const { clause, params } = buildFilterClause(req.query, { dateColumn: 'deals.created_at' });
  const allowedStatuses = new Set(['new','assigned','in_transit','delivered','issue','cancelled']);
  const status = req.query.shipmentStatus || '';
  if (status && !allowedStatuses.has(status)) throw new ApiError(400, 'Некорректный статус груза');
  const statusClause = status ? ' AND deals.shipment_status=@shipmentStatus' : '';
  const query = { ...params, ...(status ? { shipmentStatus: status } : {}) };
  const summary = (await (db.prepare(`
    SELECT COUNT(*) AS totalLoads,
      COUNT(CASE WHEN deals.shipment_status='delivered' THEN 1 END) AS deliveredLoads,
      COUNT(CASE WHEN deals.shipment_status='in_transit' THEN 1 END) AS inTransitLoads,
      COUNT(CASE WHEN deals.shipment_status IN ('issue','cancelled') THEN 1 END) AS problemLoads,
      COALESCE(SUM(CASE WHEN deals.shipment_status='delivered' THEN deals.amount ELSE 0 END),0) AS deliveredValue
    FROM deals ${clause}${statusClause}
  `).get(query)));
  const totalRows = Number(summary.totalLoads);
  const page = finiteLimit(req.query.page, 'page', 1, 100000, 1);
  const pageSize = finiteLimit(req.query.pageSize, 'pageSize', 1, 200, 25);
  const rows = (await (db.prepare(`
    SELECT deals.id,deals.title,deals.shipment_status,deals.amount,deals.currency,deals.quantity,deals.weight_kg,
      deals.pickup_location,deals.delivery_location,deals.vehicle,deals.created_at,deals.dispatcher_assigned_at,
      deals.driver_assigned_at,deals.expected_delivery_at,deals.delivered_at,
      COALESCE(deals.manager_name_snapshot,dispatchers.name,'—') AS dispatcher_name,
      COALESCE(deals.driver_name_snapshot,drivers.name,'—') AS driver_name,
      COALESCE(deals.product_name_snapshot,products.name,'—') AS cargo_type
    FROM deals
    LEFT JOIN managers dispatchers ON dispatchers.id=deals.manager_id
    LEFT JOIN managers drivers ON drivers.id=deals.driver_id
    LEFT JOIN products ON products.id=deals.product_id
    ${clause}${statusClause}
    ORDER BY deals.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...query, limit: pageSize, offset: (page - 1) * pageSize })));
  const byDispatcher = (await (db.prepare(`
    SELECT COALESCE(deals.manager_name_snapshot,managers.name,'Не назначен') AS name,
      COUNT(*) AS loads,COUNT(CASE WHEN deals.shipment_status='delivered' THEN 1 END) AS delivered,
      COUNT(CASE WHEN deals.shipment_status IN ('issue','cancelled') THEN 1 END) AS problems
    FROM deals LEFT JOIN managers ON managers.id=deals.manager_id
    ${clause}${statusClause} GROUP BY deals.manager_id ORDER BY loads DESC,name LIMIT 50
  `).all(query)));
  const byDriver = (await (db.prepare(`
    SELECT COALESCE(deals.driver_name_snapshot,managers.name,'Не назначен') AS name,
      COUNT(*) AS loads,COUNT(CASE WHEN deals.shipment_status='delivered' THEN 1 END) AS delivered,
      COUNT(CASE WHEN deals.shipment_status IN ('issue','cancelled') THEN 1 END) AS problems
    FROM deals LEFT JOIN managers ON managers.id=deals.driver_id
    ${clause}${statusClause} GROUP BY deals.driver_id ORDER BY delivered DESC,loads DESC,name LIMIT 50
  `).all(query)));
  res.json({ summary, byDispatcher, byDriver, data: rows, page, pageSize, total: totalRows, totalPages: Math.max(1, Math.ceil(totalRows / pageSize)) });
});

export default router;
