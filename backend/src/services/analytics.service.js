import db from '../db/connection.js';
import { buildFilterClause } from './query-filters.js';
import { BUSINESS_TIMEZONE, monthRange, formatMonthLabel, dateOnlyToday, addCalendarDays, addCalendarMonths, monthStartDateOnly, monthEndDateOnly, startOfDayIso, endOfDayIso } from '../utils/date-utils.js';
import { ApiError } from '../middleware/error-handler.js';

const FUNNEL_ORDER = ['lead', 'negotiation', 'deal', 'paid', 'lost'];
const STAGE_LABELS = { lead: 'Новый', negotiation: 'Назначен диспетчер', deal: 'В пути', paid: 'Доставлен', lost: 'Проблема / отменён' };

function defaultRange(filters) {
  const to = filters.to || dateOnlyToday(BUSINESS_TIMEZONE);
  const from = filters.from || monthStartDateOnly(addCalendarMonths(to.slice(0, 7), -5));
  return { from, to };
}

function paidFilter(filters) {
  return buildFilterClause(filters, { dateColumn: 'deals.paid_at' });
}

export async function getSummary(filters = {}) {
  const created = buildFilterClause(filters, { dateColumn: 'deals.created_at' });
  const paid = paidFilter(filters);
  const cohort = (await (db.prepare(`
    SELECT COUNT(*) AS createdDeals,
           COUNT(CASE WHEN EXISTS (SELECT 1 FROM deal_history h WHERE h.deal_id = deals.id AND h.new_stage = 'paid') THEN 1 END) AS cohortPaidDeals
    FROM deals ${created.clause}
  `).get(created.params)));
  const paidTotals = (await (db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS revenue,
           COUNT(*) AS paidDeals
    FROM deals ${paid.clause} AND deals.paid_at IS NOT NULL
  `).get(paid.params)));
  const lost = (await (db.prepare(`SELECT COUNT(*) AS lostDeals FROM deals ${created.clause} AND deals.stage='lost'`).get(created.params)));

  const avgCheck = paidTotals.paidDeals > 0 ? paidTotals.revenue / paidTotals.paidDeals : 0;
  const conversionRate = cohort.createdDeals > 0 ? (cohort.cohortPaidDeals / cohort.createdDeals) * 100 : 0;

  let revenueChangePct = null;
  if (filters.from && filters.to) {
    const fromDate = new Date(`${filters.from}T00:00:00Z`);
    const toDate = new Date(`${filters.to}T00:00:00Z`);
    const calendarDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    const previousToDate = addCalendarDays(filters.from, -1);
    const previousFromDate = addCalendarDays(previousToDate, -(calendarDays - 1));
    const prevFrom = startOfDayIso(previousFromDate);
    const prevTo = endOfDayIso(previousToDate);
    const { clause: prevClause, params: prevParams } = buildFilterClause({ ...filters, from: undefined, to: undefined }, { dateColumn: 'deals.paid_at' });
    const previous = (await (db.prepare(`SELECT COALESCE(SUM(amount),0) AS revenue FROM deals ${prevClause}
      AND deals.paid_at >= @prevFrom AND deals.paid_at <= @prevTo`).get({ ...prevParams, prevFrom, prevTo }))).revenue;
    revenueChangePct = previous > 0 ? ((paidTotals.revenue - previous) / previous) * 100 : null;
  }

  return {
    revenue: paidTotals.revenue,
    totalDeals: cohort.createdDeals,
    paidDeals: paidTotals.paidDeals,
    wonDeals: cohort.cohortPaidDeals,
    lostDeals: lost.lostDeals,
    avgCheck,
    conversionRate,
    revenueChangePct,
    definitions: {
      revenue: 'Стоимость доставленных грузов по дате доставки',
      totalDeals: 'Новые грузы по дате регистрации',
      paidDeals: 'Доставленные грузы по дате доставки',
      conversionRate: 'Доля грузов, зарегистрированных в периоде и доставленных к текущему моменту',
      timezone: BUSINESS_TIMEZONE
    }
  };
}

export async function getRevenueByMonth(filters = {}) {
  const { from, to } = defaultRange(filters);
  const { clause, params } = paidFilter({ ...filters, from, to });
  const rows = (await (db.prepare(`
    SELECT substr(deals.paid_at, 1, 7) AS month, COALESCE(SUM(deals.amount),0) AS revenue, COUNT(*) AS deals
    FROM deals ${clause} AND deals.paid_at IS NOT NULL
    GROUP BY month ORDER BY month
  `).all(params)));
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return monthRange(from, to).map((month) => ({
    month,
    label: formatMonthLabel(month),
    revenue: byMonth.get(month)?.revenue || 0,
    deals: byMonth.get(month)?.deals || 0
  }));
}

export async function getFunnel(filters = {}) {
  const { clause, params } = buildFilterClause(filters, { dateColumn: 'deals.created_at' });
  const rows = (await (db.prepare(`
    SELECT stage, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount
    FROM deals ${clause} GROUP BY stage
  `).all(params)));
  const byStage = new Map(rows.map((row) => [row.stage, row]));
  const data = FUNNEL_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: byStage.get(stage)?.count || 0,
    amount: byStage.get(stage)?.amount || 0
  }));
  const pipelineAmount = data.filter((row) => ['lead', 'negotiation', 'deal'].includes(row.stage)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { model: 'current-status-of-deals-created-in-period', stages: data, pipelineAmount };
}

export async function getTopProducts(filters = {}, limit = 6) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50000) throw new ApiError(400, 'limit должен быть от 1 до 50000');
  const { clause, params } = paidFilter(filters);
  return (await (db.prepare(`
    SELECT deals.product_id AS id,
           MAX(deals.product_name_snapshot) AS name,
           SUM(deals.amount) AS revenue,
           COUNT(*) AS deals,
           COALESCE(SUM(deals.quantity),0) AS unitsSold
    FROM deals
    ${clause} AND deals.paid_at IS NOT NULL AND deals.product_id IS NOT NULL
    GROUP BY deals.product_id ORDER BY revenue DESC LIMIT @limit
  `).all({ ...params, limit })));
}

export async function getTopManagers(filters = {}, limit = 6) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50000) throw new ApiError(400, 'limit должен быть от 1 до 50000');
  const { clause, params } = paidFilter(filters);
  return (await (db.prepare(`
    SELECT deals.manager_id AS id,
           MAX(deals.manager_name_snapshot) AS name,
           MAX(deals.region) AS region,
           SUM(deals.amount) AS revenue,
           COUNT(*) AS deals
    FROM deals
    ${clause} AND deals.paid_at IS NOT NULL AND deals.manager_id IS NOT NULL
    GROUP BY deals.manager_id ORDER BY revenue DESC LIMIT @limit
  `).all({ ...params, limit })));
}

export async function getRegions() {
  return (await (db.prepare(`SELECT DISTINCT region FROM deals WHERE deleted_at IS NULL AND region IS NOT NULL AND region != '' ORDER BY region`).all())).map((row) => row.region);
}
