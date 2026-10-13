export class ApiError extends Error {
  constructor(status, message, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Маршрут не найден', code: 'NOT_FOUND' });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number(err.status) || 500;
  const publicMessage = status >= 500 ? 'Внутренняя ошибка сервера' : (err.message || 'Некорректный запрос');
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err?.stack || err?.message || err);
  else if (status >= 400 && status !== 401 && status !== 403) console.warn(`[${req.method} ${req.originalUrl}] ${err.message}`);
  res.status(status).json({ error: publicMessage, code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST') });
}
