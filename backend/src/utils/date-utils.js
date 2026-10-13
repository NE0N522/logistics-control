const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Bishkek';

function assertTimezone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(`Некорректный часовой пояс: ${timeZone}`);
  }
}

export function isValidDateOnly(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function assertDateOnly(value, label = 'Дата') {
  if (!isValidDateOnly(value)) throw new Error(`${label} должна быть реальной датой в формате YYYY-MM-DD`);
  return value;
}

export function isValidMonthKey(value) {
  if (typeof value !== 'string') return false;
  const match = MONTH_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1970 && year <= 9999 && month >= 1 && month <= 12;
}

export function assertMonthKey(value, label = 'Период') {
  if (!isValidMonthKey(value)) throw new Error(`${label} должен быть реальным месяцем в формате YYYY-MM`);
  return value;
}

export function dateOnlyToday(timeZone = BUSINESS_TIMEZONE) {
  assertTimezone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function dateOnlyToParts(value) {
  assertDateOnly(value);
  const [, year, month, day] = DATE_RE.exec(value).map(Number);
  return { year, month, day };
}

export function addCalendarDays(dateStr, days) {
  const { year, month, day } = dateOnlyToParts(dateStr);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function addCalendarMonths(monthKeyValue, count) {
  assertMonthKey(monthKeyValue);
  const [year, month] = monthKeyValue.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getTimeZoneOffsetMs(date, timeZone = BUSINESS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return asUtc - date.getTime();
}

export function zonedLocalToUtcIso(dateStr, time = '00:00:00', timeZone = BUSINESS_TIMEZONE) {
  assertDateOnly(dateStr);
  assertTimezone(timeZone);
  const [hour, minute, second] = time.split(':').map(Number);
  const { year, month, day } = dateOnlyToParts(dateStr);
  let timestamp = Date.UTC(year, month - 1, day, hour, minute, second || 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(timestamp), timeZone);
    const corrected = Date.UTC(year, month - 1, day, hour, minute, second || 0, 0) - offset;
    if (corrected === timestamp) break;
    timestamp = corrected;
  }
  return new Date(timestamp).toISOString();
}

export function startOfDayIso(dateStr, timeZone = BUSINESS_TIMEZONE) {
  return zonedLocalToUtcIso(dateStr, '00:00:00', timeZone);
}

export function endOfDayIso(dateStr, timeZone = BUSINESS_TIMEZONE) {
  return new Date(Date.parse(startOfNextDayIso(dateStr, timeZone)) - 1).toISOString();
}

export function startOfNextDayIso(dateStr, timeZone = BUSINESS_TIMEZONE) {
  return startOfDayIso(addCalendarDays(dateStr, 1), timeZone);
}

export function monthKeyFromDate(date, timeZone = BUSINESS_TIMEZONE) {
  assertTimezone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}`;
}

export function monthStartDateOnly(monthKeyValue) {
  assertMonthKey(monthKeyValue);
  return `${monthKeyValue}-01`;
}

export function monthEndDateOnly(monthKeyValue) {
  assertMonthKey(monthKeyValue);
  const [year, month] = monthKeyValue.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function monthRange(fromDateOnly, toDateOnly) {
  assertDateOnly(fromDateOnly);
  assertDateOnly(toDateOnly);
  const start = fromDateOnly.slice(0, 7);
  const end = toDateOnly.slice(0, 7);
  const result = [];
  let cursor = start;
  for (let i = 0; i < 240; i += 1) {
    result.push(cursor);
    if (cursor === end) return result;
    cursor = addCalendarMonths(cursor, 1);
  }
  throw new Error('Диапазон месяцев превышает допустимый размер');
}

export function formatMonthLabel(monthKeyValue) {
  assertMonthKey(monthKeyValue);
  const [year, month] = monthKeyValue.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function parseIsoTimestamp(value, label = 'Дата и время') {
  if (typeof value !== 'string' || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    throw new Error(`${label} должна содержать часовой пояс (Z или ±HH:MM)`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} содержит некорректную дату и время`);
  return date.toISOString();
}

export function assertDateRange(from, to) {
  if (from !== undefined && from !== '') assertDateOnly(from, 'Дата начала');
  if (to !== undefined && to !== '') assertDateOnly(to, 'Дата окончания');
  if (from && to && from > to) throw new Error('Дата начала не может быть позже даты окончания');
}

export function toDateOnly(value, timeZone = BUSINESS_TIMEZONE) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function monthKey(date) {
  return monthKeyFromDate(date);
}

export const addMonths = (date, count) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
export const parseMonthKey = (key) => {
  assertMonthKey(key);
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
};
export const monthLabel = formatMonthLabel;
