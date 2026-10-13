import db from '../db/connection.js';
import { getSystemSettings } from './settings.service.js';
import { BUSINESS_TIMEZONE, dateOnlyToday, monthStartDateOnly, monthEndDateOnly, addCalendarMonths, startOfDayIso, endOfDayIso } from '../utils/date-utils.js';

const PACE_THRESHOLD = 0.85;
const DROP_THRESHOLD = 15;

function currentPeriod() { return dateOnlyToday(BUSINESS_TIMEZONE).slice(0, 7); }
async function planFor(period, managerId = null) {
  if (managerId === null) return (await (db.prepare('SELECT target_amount FROM company_plans WHERE period=?').get(period)))?.target_amount ?? null;
  return (await (db.prepare('SELECT target_amount FROM manager_plans WHERE period=? AND manager_id=?').get(period, managerId)))?.target_amount ?? null;
}
async function revenueBetween(from, to, managerId = null) {
  const managerClause = managerId === null ? '' : ' AND manager_id=@managerId';
  return (await (db.prepare(`SELECT COALESCE(SUM(amount),0) AS revenue FROM deals WHERE deleted_at IS NULL AND paid_at IS NOT NULL AND paid_at >= @from AND paid_at <= @to ${managerClause}`)
    .get({ from, to, ...(managerId === null ? {} : { managerId }) }))).revenue;
}

export async function getNotifications(now = new Date(), { paceThreshold = PACE_THRESHOLD, dropThreshold = DROP_THRESHOLD } = {}) {
  const notifications = [];
  const exchangeRate = (await getSystemSettings()).exchangeRateKgsPerUsd;
  const money = (value) => `$${(Number(value || 0) / exchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const period = currentPeriod();
  const today = dateOnlyToday(BUSINESS_TIMEZONE);
  const monthStart = startOfDayIso(monthStartDateOnly(period));
  const nextMonthStart = startOfDayIso(monthStartDateOnly(addCalendarMonths(period, 1)));
  const nowIso = now.toISOString();
  const totalMs = Date.parse(nextMonthStart) - Date.parse(monthStart);
  const elapsedMs = Math.max(0, Math.min(totalMs, Date.parse(nowIso) - Date.parse(monthStart)));
  const elapsedFraction = totalMs > 0 ? elapsedMs / totalMs : 0;

  const addPlanAlert = (label, plan, actual, id, managerId = null) => {
    if (plan === null || plan === undefined || Number(plan) === 0 || elapsedFraction <= 0) return;
    const expected = Number(plan) * elapsedFraction;
    if (actual >= expected * paceThreshold) return;
    const pct = Math.round((actual / Number(plan)) * 100);
    notifications.push({
      id,
      type: 'plan',
      severity: actual < expected * 0.6 ? 'critical' : 'warning',
      title: `${label}: отставание от плана`,
      message: `Выполнено ${pct}% от месячного плана (${money(actual)} из ${money(plan)}). Расчёт темпа учитывает прошедшую часть календарного месяца.`,
      createdAt: nowIso,
      period,
      managerId
    });
  };

  const companyPlan = await planFor(period);
  const companyRevenue = await revenueBetween(monthStart, nowIso);
  addPlanAlert('Перевозки', companyPlan, companyRevenue, `plan-company-${period}`);

  const managers = (await (db.prepare("SELECT id,name FROM managers WHERE active=1 AND position='dispatcher' ORDER BY id").all()));
  for (const manager of managers) {
    const plan = await planFor(period, manager.id);
    const revenue = await revenueBetween(monthStart, nowIso, manager.id);
    addPlanAlert(manager.name, plan, revenue, `plan-manager-${manager.id}-${period}`, manager.id);
  }

  const lastComplete = addCalendarMonths(period, -1);
  const previous = addCalendarMonths(period, -2);
  const lastRevenue = await revenueBetween(startOfDayIso(monthStartDateOnly(lastComplete)), endOfDayIso(monthEndDateOnly(lastComplete)));
  const previousRevenue = await revenueBetween(startOfDayIso(monthStartDateOnly(previous)), endOfDayIso(monthEndDateOnly(previous)));
  if (previousRevenue > 0) {
    const changePct = ((lastRevenue - previousRevenue) / previousRevenue) * 100;
    if (changePct <= -dropThreshold) {
      notifications.push({
        id: `drop-${lastComplete}`,
        type: 'drop',
        severity: changePct <= -30 ? 'critical' : 'warning',
        title: 'Снижение стоимости доставок месяц к месяцу',
        message: `Стоимость доставленных грузов за ${lastComplete} снизилась на ${Math.abs(changePct).toFixed(1)}% по сравнению с ${previous}.`,
        createdAt: nowIso,
        period: lastComplete
      });
    }
  }
  return notifications.sort((a,b) => (a.severity === b.severity ? a.id.localeCompare(b.id) : a.severity === 'critical' ? -1 : 1));
}
