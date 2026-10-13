import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-dashboard-api-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(tmpDir, 'sales.db');
process.env.BUSINESS_TIMEZONE = 'Asia/Bishkek';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.ADMIN_BOOTSTRAP_EMAIL = 'admin@test.local';
process.env.ADMIN_BOOTSTRAP_PASSWORD = 'very-secure-test-password-123';
process.env.ADMIN_BOOTSTRAP_NAME = 'Test Admin';
process.env.APP_VERSION = '1.2.2';

let app;
let db;
let server;
let baseUrl;
let webhookSecret;

class CookieJar {
  constructor(){ this.cookies = new Map(); }
  absorb(response){
    const values = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for(const header of values){
      const first = header.split(';',1)[0];
      const index = first.indexOf('=');
      if(index > 0) this.cookies.set(first.slice(0,index), first.slice(index+1));
    }
  }
  header(){ return [...this.cookies.entries()].map(([k,v])=>`${k}=${v}`).join('; '); }
  get(name){ return this.cookies.get(name); }
}

async function request(jar, pathName, options = {}){
  const headers = new Headers(options.headers || {});
  if(options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const cookie = jar.header();
  if(cookie) headers.set('Cookie',cookie);
  const csrf = jar.get('sd_csrf');
  if(csrf && !['GET','HEAD','OPTIONS'].includes((options.method||'GET').toUpperCase()) && !pathName.endsWith('/auth/login') && !pathName.startsWith('/integrations/deals')){
    headers.set('X-CSRF-Token', decodeURIComponent(csrf));
  }
  const response = await fetch(`${baseUrl}${pathName}`, {...options, headers, body: options.body === undefined ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))});
  jar.absorb(response);
  const contentType = response.headers.get('content-type') || '';
  const body = response.status === 204 ? null : contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

before(async () => {
  ({ app } = await import('../src/app.js'));
  ({ db } = await import('../src/db/connection.js'));
  await new Promise((resolve)=>{server=app.listen(0,resolve);});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
  const admin = new CookieJar();
  const login = await request(admin,'/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'very-secure-test-password-123'}});
  assert.equal(login.response.status,200);
  const user = await request(admin,'/api/users',{method:'POST',body:{email:'user@test.local',name:'Regular User',password:'regular-user-password-123',role:'user'}});
  assert.ok([201,409].includes(user.response.status));
  const key = await request(admin,'/api/integrations/keys',{method:'POST',body:{label:'Webhook smoke'}});
  assert.equal(key.response.status,201);
  webhookSecret=key.body.apiKey;
});

after(async () => {
  if (server) await new Promise((resolve)=>server.close(resolve));
  try{db?.close();}catch{}
  fs.rmSync(tmpDir,{recursive:true,force:true});
});

test('protected API and export reject unauthenticated requests', async () => {
  const jar = new CookieJar();
  const deals = await request(jar,'/api/deals');
  assert.equal(deals.response.status,401);
  const exportResult = await request(jar,'/api/export/excel');
  assert.equal(exportResult.response.status,401);
  const health = await request(jar,'/api/health');
  assert.equal(health.response.status,200);
});

test('admin authentication and one-time key display', async () => {
  const admin = new CookieJar();
  const login = await request(admin,'/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'very-secure-test-password-123'}});
  assert.equal(login.response.status,200);
  assert.equal(login.body.user.role,'admin');
  const keys = await request(admin,'/api/integrations/keys');
  assert.equal(keys.response.status,200);
  assert.equal(keys.body[0].key,null);
  assert.equal(keys.body[0].keyStoredAsHash,true);
});

test('regular user cannot change plans or integration keys', async () => {
  const user = new CookieJar();
  const login = await request(user,'/api/auth/login',{method:'POST',body:{email:'user@test.local',password:'regular-user-password-123'}});
  assert.equal(login.response.status,200);
  assert.equal(login.body.user.role,'user');
  const plan = await request(user,'/api/plans',{method:'PUT',body:{period:'2026-10',managerId:null,targetAmount:1000}});
  assert.equal(plan.response.status,403);
  const key = await request(user,'/api/integrations/keys',{method:'POST',body:{label:'nope'}});
  assert.equal(key.response.status,403);
});

test('integration is idempotent and validates stage and API key', async () => {
  const admin = new CookieJar();
  const login = await request(admin,'/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'very-secure-test-password-123'}});
  assert.equal(login.response.status,200);
  const secret = webhookSecret;

  const invalid = await request(new CookieJar(),'/api/integrations/deals',{method:'POST',headers:{'X-API-Key':secret},body:{externalId:'bad-stage-1',integrationSource:'smoke',title:'Bad',amount:10,stage:'unknown'}});
  assert.equal(invalid.response.status,400);

  const payload = {externalId:'external-100',integrationSource:'smoke',title:'September sale paid in October',amount:500,quantity:1,stage:'paid',createdAt:'2026-09-30',paidAt:'2026-10-01'};
  const first = await request(new CookieJar(),'/api/integrations/deals',{method:'POST',headers:{'X-API-Key':secret},body:payload});
  assert.equal(first.response.status,201);
  const second = await request(new CookieJar(),'/api/integrations/deals',{method:'POST',headers:{'X-API-Key':secret},body:payload});
  assert.equal(second.response.status,200);
  assert.equal(second.body.duplicate,true);
  assert.equal(second.body.id,first.body.id);

  const missingKey = await request(new CookieJar(),'/api/integrations/deals',{method:'POST',body:payload});
  assert.equal(missingKey.response.status,401);

  const september = await request(admin,'/api/dashboard/summary?from=2026-09-30&to=2026-09-30');
  const october = await request(admin,'/api/dashboard/summary?from=2026-10-01&to=2026-10-01');
  assert.equal(september.body.totalDeals,1);
  assert.equal(september.body.revenue,0);
  assert.equal(october.body.revenue,500);
  assert.equal(october.body.paidDeals,1);
});

test('invalid dates and repeated plan PUT are rejected/updated predictably', async () => {
  const admin = new CookieJar();
  await request(admin,'/api/auth/login',{method:'POST',body:{email:'admin@test.local',password:'very-secure-test-password-123'}});
  const invalidDate = await request(admin,'/api/dashboard/summary?from=2026-02-30&to=2026-03-01');
  assert.equal(invalidDate.response.status,400);
  const reversed = await request(admin,'/api/dashboard/summary?from=2026-03-02&to=2026-03-01');
  assert.equal(reversed.response.status,400);
  const invalidMonth = await request(admin,'/api/plans',{method:'PUT',body:{period:'2026-13',managerId:null,targetAmount:100}});
  assert.equal(invalidMonth.response.status,400);

  const first = await request(admin,'/api/plans',{method:'PUT',body:{period:'2026-10',managerId:null,targetAmount:100}});
  assert.equal(first.response.status,200);
  const second = await request(admin,'/api/plans',{method:'PUT',body:{period:'2026-10',managerId:null,targetAmount:200}});
  assert.equal(second.response.status,200);
  const read = await request(admin,'/api/plans?period=2026-10');
  assert.equal(read.body.company.target_amount,200);
  assert.equal(read.body.byManager.length,0);
});


test('regular user cannot access or change user roles', async () => {
  const user = new CookieJar();
  const login = await request(user,'/api/auth/login',{method:'POST',body:{email:'user@test.local',password:'regular-user-password-123'}});
  assert.equal(login.response.status,200);
  const users = await request(user,'/api/users');
  assert.equal(users.response.status,403);
  const role = await request(user,'/api/users/1/role',{method:'PATCH',body:{role:'admin'}});
  assert.equal(role.response.status,403);
  const settings = await request(user,'/api/users/1/status',{method:'PATCH',body:{active:false}});
  assert.equal(settings.response.status,403);
});
