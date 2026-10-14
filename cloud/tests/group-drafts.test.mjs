import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestD1} from './d1-test-adapter.mjs';
import {handleApi} from '../api.mjs';
const call=(env,path,method='GET',data)=>handleApi(new Request('https://crm.test'+path,{method,...(data?{body:JSON.stringify(data)}:{})}),env);
async function setup(t){const DB=new TestD1();DB.exec(readFileSync(new URL('../migrations/0001-crm.sql',import.meta.url),'utf8'));DB.exec(readFileSync(new URL('../migrations/0003-occasions-and-settings.sql',import.meta.url),'utf8'));t.after(()=>DB.close());const env={DB};for(const [name,email] of [['Alex','shared@example.test'],['Jamie','SHARED@example.test'],['Robin','other@example.test']])await call(env,'/api/contacts','POST',{first_name:name,last_name:'Synthetic',email,email_permission:'Subscribed'});return env}
async function payload(env,key='11111111-1111-4111-8111-111111111111'){const rows=await (await call(env,'/api/campaigns/audience')).json();return {batch_key:key,template_id:'holiday',values:{holiday:'New Year',signature:'Matt'},recipients:rows.map(c=>({id:c.id,revision:c.revision})),confirmed:true}}
test('group saves personalize unique emails and identical concurrent retries create only once',async t=>{
 const env=await setup(t),data=await payload(env);const before=await (await call(env,'/api/contacts')).json();
 const results=await Promise.all([call(env,'/api/campaigns/group-drafts','POST',data),call(env,'/api/campaigns/group-drafts','POST',data)]);assert.ok(results.every(r=>r.status===201||r.status===200));
 const drafts=await (await call(env,'/api/campaigns')).json();assert.equal(drafts.length,2);assert.ok(drafts.every(c=>c.status==='Draft'));assert.ok(drafts.some(c=>c.body.startsWith('Hi Alex,')));assert.ok(drafts.some(c=>c.body.startsWith('Hi Robin,')));assert.deepEqual(await (await call(env,'/api/contacts')).json(),before);
 assert.equal((await call(env,'/api/campaigns/group-drafts','POST',{...data,values:{...data.values,holiday:'Different occasion'}})).status,409);
});
test('unconfirmed, stale, unsubscribed-address and property-specific requests cannot create group drafts',async t=>{
 const env=await setup(t),data=await payload(env);
 assert.equal((await call(env,'/api/campaigns/group-drafts','POST',{...data,confirmed:false})).status,400);
 assert.equal((await call(env,'/api/campaigns/group-drafts','POST',{...data,template_id:'new-home'})).status,400);
 await call(env,'/api/contacts/1','PATCH',{email_permission:'Unsubscribed'});
 const fresh=await payload(env);assert.equal((await call(env,'/api/campaigns/group-drafts','POST',data)).status,409);assert.equal((await call(env,'/api/campaigns/group-drafts','POST',fresh)).status,400);assert.equal((await (await call(env,'/api/campaigns')).json()).length,0);
});
test('a failed group insert rolls back every draft',async t=>{
 const env=await setup(t),data=await payload(env);env.DB.exec("CREATE TRIGGER reject_robin BEFORE INSERT ON campaigns WHEN NEW.name LIKE '%Robin%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.equal((await call(env,'/api/campaigns/group-drafts','POST',data)).status,500);assert.equal((await (await call(env,'/api/campaigns')).json()).length,0);
});

test('mixed-case unsubscribe suppresses shared address and PATCH cannot forge a receipt',async t=>{
 const env=await setup(t);
 await call(env,'/api/contacts/2','PATCH',{email_permission:' unsubscribed '});
 const data=await payload(env);data.recipients=data.recipients.filter(r=>r.id===1);
 assert.equal((await call(env,'/api/campaigns/group-drafts','POST',data)).status,400);
 const row=await (await call(env,'/api/campaigns','POST',{name:'Individual',body:'Draft'})).json();
 const audience=`Group:${data.batch_key};${'a'.repeat(64)};n=1;contact=1;Subscribed`;
 assert.equal((await call(env,`/api/campaigns/${row.id}`,'PATCH',{audience,expected_updated_at:row.updated_at})).status,400);
 assert.equal((await call(env,'/api/campaigns/batches/'+data.batch_key)).status,404);
});
