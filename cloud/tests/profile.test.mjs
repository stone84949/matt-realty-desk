import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../static/desk-personalization.js',import.meta.url),'utf8').split('runtimeReady.then')[0];
function profile(storage){const context=vm.createContext({localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});vm.runInContext(source,context);return vm.runInContext('DeskProfile',context)}
test('owner preferences survive a new browser page and retain signature text',()=>{
 const storage=new Map();profile(storage).save({display_name:'Matt',tone:'Clear and concise',signature:'Matt\nSynthetic signature'});
 const reloaded=profile(storage).read();assert.equal(reloaded.display_name,'Matt');assert.equal(reloaded.tone,'Clear and concise');assert.equal(reloaded.signature,'Matt\nSynthetic signature');
});
test('broken or unexpected stored preferences fall back safely',()=>{
 const storage=new Map([['matt-realty-profile-v1','not JSON']]);assert.equal(profile(storage).read().display_name,'Matt');
 storage.set('matt-realty-profile-v1',JSON.stringify({tone:'unsupported',secret:'should not send'}));assert.equal(profile(storage).read().tone,'Warm and friendly');assert.equal('secret' in profile(storage).read(),false);
});
