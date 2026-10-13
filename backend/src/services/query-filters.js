import { startOfDayIso, endOfDayIso, assertDateRange } from '../utils/date-utils.js';
import { ApiError } from '../middleware/error-handler.js';

const DATE_COLUMNS = new Set(['deals.created_at', 'deals.paid_at']);

export function buildFilterClause(filters = {}, { dateColumn = 'deals.created_at', requireDate = false } = {}) {
  if (!DATE_COLUMNS.has(dateColumn)) throw new Error(`Недопустимая дата-фильтрация: ${dateColumn}`);
  try { assertDateRange(filters.from || undefined, filters.to || undefined); } catch (err) { throw new ApiError(400, err.message); }

  if (requireDate && (!filters.from || !filters.to)) {
    throw new ApiError(400, 'Для этого отчёта требуется дата начала и окончания');
  }

  const clauses = ['deals.deleted_at IS NULL'];
  const params = {};
  if (filters.from) { clauses.push(`${dateColumn} >= @from`); params.from = startOfDayIso(filters.from); }
  if (filters.to) { clauses.push(`${dateColumn} <= @to`); params.to = endOfDayIso(filters.to); }
  if (filters.managerId) {
    const managerId = Number(filters.managerId);
    if (!Number.isInteger(managerId) || managerId < 1) throw new ApiError(400, 'Некорректный managerId');
    clauses.push('deals.manager_id = @managerId'); params.managerId = managerId;
  }
  if (filters.driverId) {
    const driverId = Number(filters.driverId);
    if (!Number.isInteger(driverId) || driverId < 1) throw new ApiError(400, 'Некорректный driverId');
    clauses.push('deals.driver_id = @driverId'); params.driverId = driverId;
  }
  if (filters.productId) {
    const productId = Number(filters.productId);
    if (!Number.isInteger(productId) || productId < 1) throw new ApiError(400, 'Некорректный productId');
    clauses.push('deals.product_id = @productId'); params.productId = productId;
  }
  if (filters.region) {
    if (typeof filters.region !== 'string' || filters.region.length > 120) throw new ApiError(400, 'Некорректный регион');
    clauses.push('deals.region = @region'); params.region = filters.region;
  }
  if (filters.stage) {
    const stages = ['lead', 'negotiation', 'deal', 'paid', 'lost'];
    if (!stages.includes(filters.stage)) throw new ApiError(400, 'Некорректный stage');
    clauses.push('deals.stage = @stage'); params.stage = filters.stage;
  }
  if (filters.shipmentStatus) {
    const statuses = ['new','assigned','in_transit','delivered','issue','cancelled'];
    if (!statuses.includes(filters.shipmentStatus)) throw new ApiError(400, 'Некорректный статус груза');
    clauses.push('deals.shipment_status = @shipmentStatus'); params.shipmentStatus = filters.shipmentStatus;
  }
  return { clause: `WHERE ${clauses.join(' AND ')}`, params };
}
