import { Router } from 'express';
import { getForecast } from '../services/forecast.service.js';
import { finiteLimit } from '../utils/validation.js';

const router = Router();
router.get('/', async (req, res) => {
  const historyMonths = finiteLimit(req.query.historyMonths, 'historyMonths', 1, 24, 9);
  const forecastMonths = finiteLimit(req.query.forecastMonths, 'forecastMonths', 1, 12, 3);
  const { historyMonths: ignoredH, forecastMonths: ignoredF, ...filters } = req.query;
  void ignoredH; void ignoredF;
  res.json(await getForecast({ historyMonths, forecastMonths, filters }));
});
export default router;
