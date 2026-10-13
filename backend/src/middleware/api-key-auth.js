import crypto from 'node:crypto';
import db from '../db/connection.js';
import { ApiError } from './error-handler.js';

export function hashKey(value){return crypto.createHash('sha256').update(value,'utf8').digest('hex');}
export async function apiKeyAuth(req,res,next){
  try{
    const key=req.header('X-API-Key');
    if(!key || key.length<20 || key.length>200) return next(new ApiError(401,'Неверный API-ключ','API_KEY_INVALID'));
    const record=(await (db.prepare('SELECT id FROM api_keys WHERE key=?').get(hashKey(key))));
    if(!record) return next(new ApiError(401,'Неверный API-ключ','API_KEY_INVALID'));
    (await (db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(new Date().toISOString(),record.id)));
    req.integrationKeyId=record.id;
    next();
  }catch(err){next(err);}
}
