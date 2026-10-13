import db from '../db/connection.js';
import { BUSINESS_TIMEZONE, dateOnlyToday, addCalendarMonths, monthEndDateOnly, monthStartDateOnly, monthRange, formatMonthLabel, startOfDayIso, endOfDayIso } from '../utils/date-utils.js';
import { buildFilterClause } from './query-filters.js';
import { ApiError } from '../middleware/error-handler.js';

export function linearRegression(points) {
  const n = points.length;
  if (n === 0) return { a: 0, b: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { a: sumY / n, b: 0 };
  const b = (n * sumXY - sumX * sumY) / denominator;
  return { a: (sumY - b * sumX) / n, b };
}

export async function getForecast({ historyMonths = 9, forecastMonths = 3, filters = {} } = {}) {
  if (!Number.isInteger(historyMonths) || historyMonths < 1 || historyMonths > 24) throw new ApiError(400, 'historyMonths должен быть от 1 до 24');
  if (!Number.isInteger(forecastMonths) || forecastMonths < 1 || forecastMonths > 12) throw new ApiError(400, 'forecastMonths должен быть от 1 до 12');
  const currentMonth = dateOnlyToday(BUSINESS_TIMEZONE).slice(0, 7);
  const lastCompleteMonth = addCalendarMonths(currentMonth, -1);
  const startMonth = addCalendarMonths(lastCompleteMonth, -(historyMonths - 1));
  const start = startOfDayIso(monthStartDateOnly(startMonth));
  const end = endOfDayIso(monthEndDateOnly(lastCompleteMonth));
  const base = buildFilterClause({ ...filters }, { dateColumn: 'deals.paid_at' });
  const rows = (await (db.prepare(`
    SELECT substr(paid_at,1,7) AS month, COALESCE(SUM(amount),0) AS revenue
    FROM deals ${base.clause} AND deals.paid_at IS NOT NULL AND paid_at >= @historyFrom AND paid_at <= @historyTo
    GROUP BY month ORDER BY month
  `).all({ ...base.params, historyFrom: start, historyTo: end })));
  const byMonth = new Map(rows.map((row) => [row.month, row.revenue]));
  const historyMonthsList = monthRange(monthStartDateOnly(startMonth), monthEndDateOnly(lastCompleteMonth)).map((month) => ({
    month,
    label: formatMonthLabel(month),
    revenue: byMonth.get(month) || 0
  }));
  const points = historyMonthsList.map((item, index) => ({ x: index, y: Number(item.revenue) }));
  const { a, b } = linearRegression(points);
  const forecast = Array.from({ length: forecastMonths }, (_, index) => {
    const month = addCalendarMonths(lastCompleteMonth, index + 1);
    return { month, label: formatMonthLabel(month), revenue: Math.max(0, Math.round(a + b * (points.length + index))) };
  });
  const avg = historyMonthsList.length ? historyMonthsList.reduce((sum, item) => sum + Number(item.revenue), 0) / historyMonthsList.length : 0;
  return {
    history: historyMonthsList,
    forecast,
    trendPctPerMonth: avg > 0 ? (b / avg) * 100 : null,
    model: { intercept: a, slope: b, method: 'linear-regression-least-squares', historyMonths, forecastMonths, excludesCurrentAndFuturePayments: true },
    scope: filters && Object.keys(filters).length ? 'Текущий срез фильтров' : 'Все перевозки',
    timezone: BUSINESS_TIMEZONE
  };
}
