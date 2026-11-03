import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestD1} from './d1-test-adapter.mjs';
import {authFixture} from './auth-fixture.mjs';
import worker from '../worker.mjs';
const fixture=await authFixture('https://command-fixture.cloudflareaccess.com');
const original=globalThis.fetch;
globalThis.fetch=async()=>fixture.keys();
test.after(()=>{globalThis.fetch=original});
function setup(t){const DB=new TestD1();t.after(()=>DB.close());for(const f of ['0001-crm.sql','0002-assistant.sql','0003-social.sql','0004-command-center.sql'])DB.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));return {...fixture.env,DB}}
const request=(path,method='GET',body,extra={})=>new Request('https://crm.test'+path,{method,headers:{'Cf-Access-Jwt-Assertion':fixture.token,Origin:'https://crm.test','Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
test('new workspace endpoints retain Access and same-origin write boundaries',async t=>{
 const env=setup(t);
 for(const path of ['/api/social/status','/api/social/choices','/api/command-center/overview']){
  assert.equal((await worker.fetch(new Request('https://crm.test'+path),env)).status,401);
  assert.equal((await worker.fetch(request(path),env)).status,200);
 }
 assert.equal((await worker.fetch(request('/api/command-center/research','POST',{title:'Research'},{Origin:'https://evil.test'}),env)).status,403);
 assert.equal((await worker.fetch(request('/api/social/connect','POST',{}, {'Sec-Fetch-Site':'cross-site'}),env)).status,403);
 assert.equal((await worker.fetch(request('/api/social/connect','POST',{}),env)).status,503);
});
test('schema2 portable backup restores new nonsecret records and excludes all OAuth credentials',async t=>{
 const env=setup(t),DB=env.DB;
 DB.exec("INSERT INTO social_accounts VALUES('fb:1','facebook','1','Synthetic Page','PRIVATE_ENCRYPTED_CREDENTIAL','a','b'); INSERT INTO social_oauth VALUES('PRIVATE_STATE','owner','PRIVATE_NONCE',9999999999999,'PRIVATE_PENDING'); INSERT INTO social_snapshots VALUES('s1','fb:1','facebook','2026-11-03', '{\"account\":{\"name\":\"Synthetic\"},\"posts\":[]}');");
 await worker.fetch(request('/api/command-center/research','POST',{title:'Synthetic note',notes:'Saved source'}),env);
 await worker.fetch(request('/api/command-center/jobs','POST',{request_id:crypto.randomUUID(),kind:'content_plan',prompt:'Prepare a draft'}),env);
 const snapshot=await (await worker.fetch(request('/api/backup','POST',{}),env)).json();
 assert.equal(snapshot.schema_version,2);
 assert.equal(snapshot.command_research.length,1);assert.equal(snapshot.command_jobs.length,1);assert.equal(snapshot.social_snapshots.length,1);
 assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_'));assert.ok(!('social_accounts' in snapshot));assert.ok(!('social_oauth' in snapshot));
 const restored=setup(t);
 for(const table of ['contacts','tasks','activities','campaigns','command_research','command_jobs','social_snapshots']){
  const rows=snapshot[table];
  await restored.DB.batch(rows.map(r=>restored.DB.prepare(`INSERT INTO ${table}(${Object.keys(r).join(',')}) VALUES(${Object.keys(r).map(()=>'?').join(',')})`).bind(...Object.values(r))));
  assert.deepEqual((await restored.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results,rows);
 }
 assert.equal((await restored.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});
test('portable backups include installed nonsecret tables during either partial migration',async t=>{
 for(const migration of ['0003-social.sql','0004-command-center.sql']){
  const DB=new TestD1();t.after(()=>DB.close());
  for(const f of ['0001-crm.sql',migration])DB.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
  if(migration==='0003-social.sql')DB.exec("INSERT INTO social_snapshots VALUES('s','fb:1','facebook','2026-11-03','{}')");
  else DB.exec("INSERT INTO command_research VALUES('r','Synthetic source',NULL,'Saved','2026-11-03')");
  const data=await (await worker.fetch(request('/api/backup','POST',{}),{...fixture.env,DB})).json();
  assert.equal(data.schema_version,2);
  assert.equal(migration==='0003-social.sql'?data.social_snapshots.length:data.command_research.length,1);
  assert.ok(!('social_accounts' in data));
 }
});
