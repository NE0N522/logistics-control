import { Router } from 'express';
import { getNotifications } from '../services/notifications.service.js';
import { ApiError } from '../middleware/error-handler.js';
const router = Router();
function percentParam(raw, fallback, min, max, label) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new ApiError(400, `${label} должен быть от ${min} до ${max}`);
  return value;
}
router.get('/', async (req, res) => {
  const planPacePct = percentParam(req.query.planPacePct, 85, 50, 100, 'Порог темпа плана');
  const salesDropPct = percentParam(req.query.salesDropPct, 15, 5, 50, 'Порог снижения стоимости доставок');
  res.json({
    data: await getNotifications(new Date(), { paceThreshold: planPacePct / 100, dropThreshold: salesDropPct }),
    generatedAt: new Date().toISOString(),
    delivery: 'in-app-computed',
    settings: { planPacePct, salesDropPct }
  });
});
export default router;
