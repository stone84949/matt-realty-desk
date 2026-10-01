import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../static/app.js',import.meta.url),'utf8');
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
