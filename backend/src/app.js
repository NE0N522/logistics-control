import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db/connection.js';
import { db } from './db/connection.js';
import authRoutes from './routes/auth.routes.js';
import dealsRoutes from './routes/deals.routes.js';
import managersRoutes from './routes/managers.routes.js';
import productsRoutes from './routes/products.routes.js';
import plansRoutes from './routes/plans.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import forecastRoutes from './routes/forecast.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import exportRoutes from './routes/export.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import usersRoutes from './routes/users.routes.js';
import logisticsRoutes from './routes/logistics.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import { csrfProtection, requireAuth, requireAdminForWrites } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { bootstrapAdminFromEnv } from './services/bootstrap.service.js';
import { cleanupExpiredSessions } from './middleware/auth.js';

await bootstrapAdminFromEnv();
await cleanupExpiredSessions();

const app = express();
const configuredOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(cors({ origin: configuredOrigin, credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','X-CSRF-Token','X-API-Key','X-Integration-Source'] }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '256kb' }));

app.get('/api/health', (req,res)=>res.json({status:'ok',time:new Date().toISOString(),version:process.env.APP_VERSION || '2.0.0'}));
app.use('/api/auth', authRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api', requireAuth, csrfProtection, requireAdminForWrites);
app.use('/api/deals', dealsRoutes);
app.use('/api/managers', managersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/settings', settingsRoutes);

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const frontendDist=path.resolve(__dirname,'../../frontend/dist');
if(process.env.NODE_ENV==='production'){
  app.use(express.static(frontendDist,{index:'index.html',fallthrough:true}));
  app.get('/{*splat}',(req,res,next)=>{if(req.path.startsWith('/api/')) return next();res.sendFile(path.join(frontendDist,'index.html'));});
}
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
export default app;
