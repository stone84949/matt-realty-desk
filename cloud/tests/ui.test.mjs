import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../static/app.js',import.meta.url),'utf8');
test('hosted startup supports a Today screen without the old generic draft shortcut',()=>{
 const body=source.slice(source.indexOf('function applyRuntime'),source.indexOf('async function start'));
 const context=vm.createContext({runtime:{hosted:true,assistant:true},$:selector=>selector==='[data-go="assistant"]'?null:{},$$:()=>[],go(){}});
 vm.runInContext(body,context);assert.doesNotThrow(()=>context.applyRuntime());
});
test('saved note stays saved when dashboard refresh fails; failed POST retains input',async()=>{
 const body=source.slice(source.indexOf('async function saveContactNote'),source.indexOf('async function leaveContactFor'));
 for(const failPost of [false,true]){
  const button={disabled:false},input={value:'Synthetic note'},messages=[];
  const context=vm.createContext({api:async()=>{if(failPost)throw Error('Write failed')},notify:(...args)=>messages.push(args),showContactHistory:async()=>{},loadSummary:async()=>{throw Error('Refresh failed')}});
  vm.runInContext(body,context);await context.saveContactNote({id:7},button,input);
  assert.equal(input.value,failPost?'Synthetic note':'');assert.equal(button.disabled,!failPost);
  assert.match(messages.at(-1)[0],failPost?/Write failed/:/Note saved/);
 }
});
test('contact completion persists through refresh failure and updates only saved date',async()=>{
 const body=source.slice(source.indexOf('async function completeContactFollowup'),source.indexOf('async function draftFollowup'));
 const button={disabled:false,dataset:{completeContact:'7'}},field={value:'2026-10-14'},form={dataset:{id:'7',savedFields:'{"phone":"original","next_follow_up_at":"2026-10-14"}'}},messages=[];
 const elements={'#modal':{open:true},'#modalForm':form,'#modalForm [name="next_follow_up_at"]':field};
 const context=vm.createContext({$:key=>elements[key],api:async(path,options)=>{assert.equal(path,'/api/contacts/7');assert.deepEqual(JSON.parse(options.body),{next_follow_up_at:''})},notify:x=>messages.push(x),loadSummary:async()=>{throw Error('Refresh failed')}});
 vm.runInContext(body,context);await context.completeContactFollowup(button);
 assert.equal(field.value,'');assert.equal(button.hidden,true);assert.equal(button.disabled,true);
 assert.deepEqual(JSON.parse(form.dataset.savedFields),{phone:'original',next_follow_up_at:''});assert.match(messages.at(-1),/Follow-up completed/);
});
test('contact actions keep dirty edits until the user chooses to leave',async()=>{
 const body=source.slice(source.indexOf('async function leaveContactFor'),source.indexOf('function confirmContactDeletion'));
 for(const leave of [false,true]){
  let actions=0;const form={dataset:{savedFields:'{"phone":"old"}'}},dialog={showModal(){},close(){}},keep={focus(){}},discard={};
  const elements={'#modalForm':form,'#unsavedConfirm':dialog,'#keepEditingContact':keep,'#leaveContact':discard};
  const context=vm.createContext({$:key=>elements[key],FormData:class{entries(){return [['phone','edited']][Symbol.iterator]()}}});
  vm.runInContext(body,context);const pending=context.leaveContactFor(()=>actions++);
  assert.equal(actions,0);(leave?discard:keep).onclick();await pending;assert.equal(actions,leave?1:0);
 }
});
const detection=source.slice(source.indexOf('async function detectRuntime'),source.indexOf('const state ='));
async function detect(status,body={}){let calls=0;const context=vm.createContext({runtime:null,fetch:async(path,options)=>{calls++;assert.equal(path,'/api/runtime');assert.equal(options.credentials,'same-origin');return {status,ok:status===200,json:async()=>body}}});vm.runInContext(detection,context);return {context,calls:()=>calls,result:context.detectRuntime()}}
test('local Python only falls back on missing runtime endpoint',async()=>{const run=await detect(404);assert.equal((await run.result).hosted,false);assert.equal(run.calls(),1)});
test('hosted runtime retains disabled capabilities',async()=>{const run=await detect(200,{hosted:true,assistant:false,voice:false,backup:'download'});assert.equal((await run.result).assistant,false);assert.equal(run.context.runtime.hosted,true)});
for(const status of [401,403,500])test(`runtime ${status} fails closed`,async()=>{const run=await detect(status);await assert.rejects(run.result,/Unable to verify runtime/);assert.equal(run.context.runtime,null)});
test('hosted automatic browser mutation tools remain unregistered',()=>{let accessed=false;const body=source.slice(source.indexOf('function registerWebMCP'),source.indexOf('function applyRuntime'));const context=vm.createContext({runtime:{hosted:true},document:{get modelContext(){accessed=true;return {registerTool(){throw Error('must not register')}}}}});vm.runInContext(body,context);context.registerWebMCP();assert.equal(accessed,false)});
test('core requests await runtime and include same-origin credentials',()=>{assert.match(source,/async function api[^]*?await runtimeReady;[^]*?credentials:'same-origin'/);assert.match(source,/async function start\(\)\{await runtimeReady;applyRuntime\(\);registerWebMCP\(\)/)});

test('all static HTML scripts and event handlers comply with self-only CSP',async()=>{
  const directory=new URL('../../static/',import.meta.url);
  for(const file of (await readdir(directory)).filter(name=>name.endsWith('.html'))){
    const html=await readFile(new URL(file,directory),'utf8');
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
      assert.match(match[1],/\bsrc="\/[^" ]+"/,`${file} scripts must be same-origin external files`);
      assert.equal(match[2].trim(),'',`${file} cannot contain inline script`);
    }
    assert.doesNotMatch(html,/\son[a-z]+\s*=/i,`${file} cannot contain inline event handlers`);
  }
  const guide=await readFile(new URL('quick-start.html',directory),'utf8');
  assert.match(guide,/<script src="\/quick-start.js"><\/script>/);
  const code=await readFile(new URL('quick-start.js',directory),'utf8');
  assert.doesNotThrow(()=>new vm.Script(code));
  assert.match(code,/matt-realty-guide-plan/);
  assert.match(code,/Hosted demo/);
});

test('contact deletion requires confirmation and only patches archive state',async()=>{
 const fragment=source.slice(source.indexOf('async function changeContactArchive'),source.indexOf('async function saveModal'));
 for(const [archived,confirmed,shouldCall] of [[0,false,false],[0,true,true],[1,false,true]]){
  const calls=[],button={disabled:false},modal={open:true,close(){this.open=false}};
  const context=vm.createContext({confirmContactDeletion:async()=>confirmed,$:()=>modal,api:async(...args)=>calls.push(args),notify(){},loadSummary:async()=>{},loadContacts:async()=>{}});
  vm.runInContext(fragment,context);
  await context.changeContactArchive({id:7,first_name:'Synthetic',archived},button);
  assert.equal(calls.length,shouldCall?1:0);
  if(shouldCall){assert.equal(calls[0][0],'/api/contacts/7');assert.deepEqual(JSON.parse(calls[0][1].body),{archived:archived?0:1});assert.equal(modal.open,false)}
  assert.equal(button.disabled,false);
 }
});
test('failed contact deletion keeps editor open and re-enables button',async()=>{
 const fragment=source.slice(source.indexOf('async function changeContactArchive'),source.indexOf('async function saveModal'));
 const button={disabled:false},modal={open:true},messages=[];
 const context=vm.createContext({confirmContactDeletion:async()=>true,$:()=>modal,api:async()=>{throw Error('Save failed')},notify:(...args)=>messages.push(args),loadSummary:async()=>{},loadContacts:async()=>{}});
 vm.runInContext(fragment,context);await context.changeContactArchive({id:7,first_name:'Synthetic',archived:0},button);
 assert.equal(button.disabled,false);assert.equal(modal.open,true);assert.equal(messages[0][0],'Save failed');
});

test('hosted guide reflects enabled assistant capability',async()=>{
 const guide=await readFile(new URL('../../static/quick-start.js',import.meta.url),'utf8');
 const line=guide.split('\n').find(line=>line.includes("document.querySelector('#assistant').innerHTML="));
 for(const enabled of [true,false]){const element={innerHTML:''};const context=vm.createContext({runtime:{assistant:enabled},document:{querySelector:()=>element}});vm.runInContext(line,context);assert.match(element.innerHTML,enabled?/100|presets/:/unavailable/)}
});
