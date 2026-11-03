import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../static/command-center.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('async function refresh()'),source.indexOf('window.openCommandCenter='));
test('failed workspace loading reports failure and social actions start disabled',async()=>{
 const messages=[];const context=vm.createContext({workspace:null,social:null,choices:[],api:async()=>{throw Error('Offline')},status:(...args)=>messages.push(args),render(){}});
 vm.runInContext(functions,context);
 assert.equal(await context.refresh(),false);assert.match(messages[0][0],/Could not refresh/);assert.equal(messages[0][1],true);
 for(const id of ['connectMeta','connectInstagram','refreshMeta','disconnectMeta'])assert.match(source,new RegExp('id="'+id+'" disabled'));
});
test('saved research plus failed list refresh gives honest recovery instead of claiming a refreshed list',async()=>{
 const messages=[],researchForm={},buttons=[{disabled:false}];let saved=0,reset=0;
 const context=vm.createContext({workspace:{},social:{},choices:[],busy:false,$:()=>researchForm,root:()=>({querySelectorAll:()=>buttons}),FormData:class{*[Symbol.iterator](){yield ['title','Synthetic source']}},api:async(path,options)=>{if(options?.method==='POST'){saved++;return {}}throw Error('List unavailable')},status:(...args)=>messages.push(args),render(){}});
 vm.runInContext(functions,context);
 const handler=source.slice(source.indexOf("$('#commandResearchForm').onsubmit="),source.indexOf("$('#commandJobForm').onsubmit="));
 vm.runInContext(handler,context);
 researchForm.onsubmit({preventDefault(){},target:{reset(){reset++}}});
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(saved,1);assert.equal(reset,1);assert.match(messages.at(-1)[0],/saved, but the list could not refresh/);assert.equal(messages.at(-1)[1],true);assert.equal(buttons[0].disabled,false);
});
