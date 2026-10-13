import { Router } from 'express';
import { buildExcelReport, buildPdfReport } from '../services/export.service.js';
const router = Router();
router.get('/excel', async (req,res,next)=>{try{const buffer=await buildExcelReport(req.query);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="logistics-report-${Date.now()}.xlsx"`);res.send(Buffer.from(buffer));}catch(err){next(err);}});
router.get('/pdf', async (req,res,next)=>{try{const buffer=await buildPdfReport(req.query);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="logistics-report-${Date.now()}.pdf"`);res.send(buffer);}catch(err){next(err);}});
export default router;
