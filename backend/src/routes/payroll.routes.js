import { Router } from 'express';
import db from '../db/connection.js';
import { ApiError } from '../middleware/error-handler.js';
import { BUSINESS_TIMEZONE, dateOnlyToday, monthStartDateOnly, monthEndDateOnly, startOfDayIso, endOfDayIso, assertMonthKey, assertDateRange, monthRange } from '../utils/date-utils.js';
import { getSystemSettings } from '../services/settings.service.js';

const router = Router();

router.get('/', async (req, res) => {
  let fromDate;
  let toDate;
  try {
    if (req.query.from || req.query.to) {
      if (!req.query.from || !req.query.to) throw new Error('Укажите начало и конец периода');
      fromDate = String(req.query.from);
      toDate = String(req.query.to);
      assertDateRange(fromDate, toDate);
      if (monthRange(fromDate, toDate).length > 60) throw new Error('Период зарплаты не может превышать 5 лет');
    } else {
      const period = String(req.query.period || dateOnlyToday(BUSINESS_TIMEZONE).slice(0, 7));
      assertMonthKey(period, 'Месяц расчёта');
      fromDate = monthStartDateOnly(period);
      toDate = period === dateOnlyToday(BUSINESS_TIMEZONE).slice(0, 7) ? dateOnlyToday(BUSINESS_TIMEZONE) : monthEndDateOnly(period);
    }
  } catch (error) { throw new ApiError(400, error.message); }

  const isAdmin = req.user.role === 'admin';
  const settings = await getSystemSettings();
  const RATES = settings.rates;
  const profile = (await (db.prepare(`SELECT users.manager_id,managers.name,managers.position
    FROM users LEFT JOIN managers ON managers.id=users.manager_id WHERE users.id=?`).get(req.user.id)));
  const ownManagerId = profile?.manager_id ?? null;
  const from = startOfDayIso(fromDate, BUSINESS_TIMEZONE);
  const to = endOfDayIso(toDate, BUSINESS_TIMEZONE);
  const ownClause = !isAdmin && ownManagerId ? 'AND (deals.manager_id=@managerId OR deals.driver_id=@managerId)' : '';
  const rows = !isAdmin && !ownManagerId ? [] : (await (db.prepare(`
    SELECT deals.id AS load_id,deals.title,deals.amount,deals.currency,
      COALESCE(deals.delivered_at,deals.paid_at) AS delivered_at,
      deals.pickup_location,deals.delivery_location,
      deals.manager_id AS dispatcher_id,
      COALESCE(deals.manager_name_snapshot,dispatchers.name,'Не назначен') AS dispatcher_name,
      deals.driver_id,
      COALESCE(deals.driver_name_snapshot,drivers.name,'Не назначен') AS driver_name
    FROM deals
    LEFT JOIN managers dispatchers ON dispatchers.id=deals.manager_id
    LEFT JOIN managers drivers ON drivers.id=deals.driver_id
    WHERE deals.deleted_at IS NULL AND deals.shipment_status='delivered'
      AND COALESCE(deals.delivered_at,deals.paid_at) IS NOT NULL
      AND COALESCE(deals.delivered_at,deals.paid_at)>=@from
      AND COALESCE(deals.delivered_at,deals.paid_at)<=@to ${ownClause}
    ORDER BY delivered_at DESC,deals.id DESC
  `).all({ from, to, ...(!isAdmin && ownManagerId ? { managerId: ownManagerId } : {}) })));

  const payments = [];
  const totals = new Map();
  const accessibleLoadIds = new Set(rows.map((row) => row.load_id));
  const baseByLoad = new Map(rows.map((row) => [row.load_id, Number(row.amount) || 0]));
  const addPayment = (row, employeeId, employeeName, position) => {
    if (!isAdmin && employeeId !== ownManagerId) return;
    const rate = RATES[position];
    const payout = Math.round((Number(row.amount) || 0) * rate) / 100;
    const key = `${position}:${employeeId ?? employeeName}`;
    const payment = {
      employeeId: employeeId ?? null,
      employeeName,
      position,
      loadId: row.load_id,
      title: row.title,
      amount: Number(row.amount) || 0,
      currency: row.currency || 'KGS',
      deliveredAt: row.delivered_at,
      route: [row.pickup_location, row.delivery_location].filter(Boolean).join(' → '),
      rate,
      payout
    };
    payments.push(payment);
    const aggregate = totals.get(key) || { employeeId: employeeId ?? null, name: employeeName, position, loads: new Set(), base: 0, payout: 0 };
    if (!aggregate.loads.has(row.load_id)) {
      aggregate.loads.add(row.load_id);
      aggregate.base += Number(row.amount) || 0;
    }
    aggregate.payout += payout;
    totals.set(key, aggregate);
  };

  for (const row of rows) {
    if (row.dispatcher_id || row.dispatcher_name !== 'Не назначен') addPayment(row, row.dispatcher_id, row.dispatcher_name, 'dispatcher');
    if (row.driver_id || row.driver_name !== 'Не назначен') addPayment(row, row.driver_id, row.driver_name, 'driver');
  }

  const aggregateRows = [...totals.values()].map((row) => ({
    employeeId: row.employeeId,
    name: row.name,
    position: row.position,
    deliveredLoads: row.loads.size,
    deliveredValue: Math.round(row.base * 100) / 100,
    payout: Math.round(row.payout * 100) / 100
  })).sort((a, b) => b.payout - a.payout || a.name.localeCompare(b.name, 'ru'));

  const staff = isAdmin
    ? (await (db.prepare('SELECT id AS employeeId,name,position,active FROM managers ORDER BY name').all())).flatMap((employee) => {
      const employeePayments = payments.filter((payment) => payment.employeeId === employee.employeeId);
      if (!['dispatcher', 'driver'].includes(employee.position) && employeePayments.length === 0) return [];
      const employeeLoads = new Map(employeePayments.map((payment) => [payment.loadId, payment.amount]));
      return [{
        ...employee,
        deliveredLoads: employeeLoads.size,
        deliveredValue: Math.round([...employeeLoads.values()].reduce((sum, amount) => sum + amount, 0) * 100) / 100,
        payout: Math.round(employeePayments.reduce((sum, payment) => sum + payment.payout, 0) * 100) / 100
      }];
    })
    : aggregateRows.filter((employee) => employee.employeeId === ownManagerId);

  const dispatcherPayout = payments.filter((item) => item.position === 'dispatcher').reduce((sum, item) => sum + item.payout, 0);
  const driverPayout = payments.filter((item) => item.position === 'driver').reduce((sum, item) => sum + item.payout, 0);
  const deliveredValue = Math.round([...accessibleLoadIds].reduce((sum, id) => sum + (baseByLoad.get(id) || 0), 0));
  const summary = {
    deliveredLoads: accessibleLoadIds.size,
    deliveredValue,
    dispatcherPayout: Math.round(dispatcherPayout * 100) / 100,
    driverPayout: Math.round(driverPayout * 100) / 100,
    totalPayout: Math.round((dispatcherPayout + driverPayout) * 100) / 100
  };

  res.json({ from: fromDate, to: toDate, rates: RATES, exchangeRateKgsPerUsd: settings.exchangeRateKgsPerUsd, summary, staff, payments, employeeLinked: isAdmin || Boolean(ownManagerId), viewerPosition: profile?.position || null });
});

export default router;
