import { Router } from 'express';
import { getSystemSettings, saveSystemSettings } from '../services/settings.service.js';
import { requireAdmin } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';

const router = Router();

router.get('/', async (_req, res) => res.json(await getSystemSettings()));

router.patch('/', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const changes = {};
  if (body.exchangeRateKgsPerUsd !== undefined) {
    const value = Number(body.exchangeRateKgsPerUsd);
    if (!Number.isFinite(value) || value < 1 || value > 100000) throw new ApiError(400, 'Курс должен быть числом от 1 до 100 000 сом за доллар');
    changes.exchangeRateKgsPerUsd = Math.round(value * 10000) / 10000;
  }
  if (body.rates !== undefined) {
    if (!body.rates || typeof body.rates !== 'object' || Array.isArray(body.rates)) throw new ApiError(400, 'Некорректные ставки комиссий');
    changes.rates = {};
    for (const position of ['dispatcher', 'driver']) {
      if (body.rates[position] === undefined) continue;
      const value = Number(body.rates[position]);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new ApiError(400, 'Ставка комиссии должна быть от 0 до 100%');
      changes.rates[position] = Math.round(value * 100) / 100;
    }
  }
  if (!Object.keys(changes).length) throw new ApiError(400, 'Укажите настройки для сохранения');
  res.json(await saveSystemSettings(changes, req.user.id));
});

export default router;
