import { ApiError } from '../middleware/error-handler.js';
import { assertDateRange, assertDateOnly, assertMonthKey, parseIsoTimestamp } from './date-utils.js';

export const LIMITS = {
  title: 200,
  name: 160,
  label: 120,
  email: 254,
  notes: 4000,
  region: 120,
  category: 120,
  amount: 1_000_000_000_000,
  quantity: 100000,
  pageSize: 200,
  historyMonths: 24,
  forecastMonths: 12,
  jsonBytes: 256 * 1024
};

export function text(value, field, { required = false, max = LIMITS.name, trim = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, `Поле ${field} обязательно`);
    return null;
  }
  if (typeof value !== 'string') throw new ApiError(400, `Поле ${field} должно быть строкой`);
  const result = trim ? value.trim() : value;
  if (required && !result) throw new ApiError(400, `Поле ${field} обязательно`);
  if (result.length > max) throw new ApiError(400, `Поле ${field} слишком длинное`);
  return result || null;
}

export function money(value, field = 'amount', { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, `Поле ${field} обязательно`);
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > LIMITS.amount) throw new ApiError(400, `${field} должно быть неотрицательным конечным числом`);
  return num;
}

export function positiveInt(value, field = 'quantity', { required = false, defaultValue = 1 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, `Поле ${field} обязательно`);
    return defaultValue;
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > LIMITS.quantity) throw new ApiError(400, `${field} должно быть целым числом от 1 до ${LIMITS.quantity}`);
  return num;
}

export function idOrNull(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) throw new ApiError(400, `${field} содержит некорректный ID`);
  return num;
}

export function email(value) {
  const result = text(value, 'email', { max: LIMITS.email });
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError(400, 'Некорректный email');
  return result;
}

export function dateRange(query) {
  try {
    assertDateRange(query.from || undefined, query.to || undefined);
  } catch (err) {
    throw new ApiError(400, err.message);
  }
  return { from: query.from || null, to: query.to || null };
}

export function month(value, field = 'period') {
  try { return assertMonthKey(value, field); } catch (err) { throw new ApiError(400, err.message); }
}

export function dateOnly(value, field) {
  try { return assertDateOnly(value, field); } catch (err) { throw new ApiError(400, err.message); }
}

export function timestamp(value, field) {
  try { return parseIsoTimestamp(value, field); } catch (err) { throw new ApiError(400, err.message); }
}

export function finiteLimit(value, field, min, max, fallback) {
  if (value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) throw new ApiError(400, `${field} должно быть целым числом от ${min} до ${max}`);
  return num;
}
