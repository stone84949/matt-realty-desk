import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({});
vm.runInContext(readFileSync(new URL('../../static/desk-templates.js',import.meta.url),'utf8'),context);
const library=vm.runInContext('DeskTemplates',context);
test('templates fill known names and leave event facts explicitly missing',()=>{
 const draft=library.fill('new-home',{first_name:'Synthetic',agent_name:'Matt',signature:'Matt'});
 assert.match(draft.body,/Synthetic/);assert.match(draft.body,/Matt/);assert.ok(draft.missing.includes('property_address'));
 assert.doesNotMatch(draft.body,/undefined|null/);
});
test('library covers everyday, milestone and seasonal occasions without AI',()=>{
 assert.ok(library.items.length>=12);
 for(const template of library.items){const fields=library.fields(template);const values=Object.fromEntries(fields.map(key=>[key,'Synthetic value']));assert.equal(library.fill(template.id,values).missing.length,0)}
});
test('saved recipient metadata distinguishes shared first names and preserves permission snapshot',()=>{
 const a=library.recipient({id:7,first_name:'Alex',last_name:'One',email_permission:'Unsubscribed'},'Alex');
 const b=library.recipient({id:8,first_name:'Alex',last_name:'Two',email_permission:'Not asked'},'Alex');
 assert.equal(a.name,'Alex One');assert.notEqual(a.audience,b.audience);assert.match(a.audience,/Contact #7/);assert.match(a.audience,/Unsubscribed/);
});
