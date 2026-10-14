import test from 'node:test';
import assert from 'node:assert/strict';
import {audienceRows,selectAudience,groupTemplates,parseGroupAudience,individualAudience} from '../../static/campaign-audience.mjs';
const contact=(id,email,permission='Subscribed',extra={})=>({id,first_name:'Person '+id,last_name:'Example',email,email_permission:permission,archived:0,type:'Buyer',stage:'Active',updated_at:'v1',...extra});
test('audiences exclude missing/unconfirmed/archived and suppress unsubscribed shared addresses',()=>{
 const rows=audienceRows([contact(1,'ok@example.test'),contact(2,''),contact(3,'unknown@example.test','Not asked'),contact(4,'archived@example.test','Subscribed',{archived:1}),contact(5,'shared@example.test'),contact(6,'SHARED@example.test','Unsubscribed',{archived:1})]);
 assert.deepEqual(rows.filter(c=>c.eligible).map(c=>c.id),[1]);assert.match(rows.find(c=>c.id===5).reason,/unsubscribed/i);
});
test('deduplication chooses one selected representative without merging contact records',()=>{
 const rows=audienceRows([contact(1,'SAME@example.test'),contact(2,'same@example.test'),contact(3,'other@example.test')]);
 const selection=selectAudience(rows,[1,2,3]);assert.equal(selection.recipients.length,2);assert.equal(selection.duplicates,1);assert.equal(rows.length,3);
 assert.equal(selectAudience(rows,[2]).recipients[0].id,2);
});
test('property/event-specific templates stay individual and group metadata detaches on copy',()=>{
 assert.ok(groupTemplates().some(t=>t.id==='holiday'));assert.ok(!groupTemplates().some(t=>t.id==='new-home'));
 const metadata='Group:11111111-1111-4111-8111-111111111111;'+'a'.repeat(64)+';n=2;contact=7;Subscribed';
 assert.equal(parseGroupAudience(metadata).contactId,7);assert.match(individualAudience(metadata),/Contact #7/);assert.doesNotMatch(individualAudience(metadata),/Group:/);
});
