import db from '../db/connection.js';
import { BUSINESS_TIMEZONE, dateOnlyToday } from '../utils/date-utils.js';

const DEFAULTS = Object.freeze({
  exchange_rate_kgs_per_usd: '87.45',
  exchange_rate_source: 'НБКР',
  exchange_rate_date: '2026-10-10',
  dispatcher_commission_pct: '1.5',
  driver_commission_pct: '10'
});

export async function getSystemSettings() {
  const stored = Object.fromEntries((await (db.prepare('SELECT key,value FROM app_settings').all())).map(({ key, value }) => [key, value]));
  const value = (key) => stored[key] ?? DEFAULTS[key];
  const numberValue = (key, fallback) => {
    const parsed = Number(value(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const updatedAt = (await (db.prepare('SELECT MAX(updated_at) AS updatedAt FROM app_settings').get()))?.updatedAt || null;
  return {
    currency: 'USD',
    exchangeRateKgsPerUsd: numberValue('exchange_rate_kgs_per_usd', 87.45),
    exchangeRateSource: value('exchange_rate_source'),
    exchangeRateDate: value('exchange_rate_date'),
    rates: {
      dispatcher: numberValue('dispatcher_commission_pct', 1.5),
      driver: numberValue('driver_commission_pct', 10)
    },
    updatedAt
  };
}

export async function saveSystemSettings(changes, userId) {
  const now = new Date().toISOString();
  const set = db.prepare(`INSERT INTO app_settings (key,value,updated_at,updated_by_user_id) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id`);
  (await (db.transaction(async () => {
    if (changes.exchangeRateKgsPerUsd !== undefined) {
      (await (set.run('exchange_rate_kgs_per_usd', String(changes.exchangeRateKgsPerUsd), now, userId)));
      (await (set.run('exchange_rate_source', 'Задано администратором', now, userId)));
      (await (set.run('exchange_rate_date', dateOnlyToday(BUSINESS_TIMEZONE), now, userId)));
    }
    if (changes.rates?.dispatcher !== undefined) (await (set.run('dispatcher_commission_pct', String(changes.rates.dispatcher), now, userId)));
    if (changes.rates?.driver !== undefined) (await (set.run('driver_commission_pct', String(changes.rates.driver), now, userId)));
  })()));
  return getSystemSettings();
}
