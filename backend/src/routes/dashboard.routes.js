import { Router } from 'express';
import { getSummary, getRevenueByMonth, getFunnel, getTopProducts, getTopManagers, getRegions } from '../services/analytics.service.js';
import { finiteLimit } from '../utils/validation.js';

const router = Router();
router.get('/summary', async (req, res) => res.json(await getSummary(req.query)));
router.get('/revenue-by-month', async (req, res) => res.json(await getRevenueByMonth(req.query)));
router.get('/funnel', async (req, res) => res.json(await getFunnel(req.query)));
router.get('/top-products', async (req, res) => res.json(await getTopProducts(req.query, finiteLimit(req.query.limit, 'limit', 1, 50, 6))));
router.get('/top-managers', async (req, res) => res.json(await getTopManagers(req.query, finiteLimit(req.query.limit, 'limit', 1, 50, 6))));
router.get('/regions', async (_req, res) => res.json(await getRegions()));
export default router;
