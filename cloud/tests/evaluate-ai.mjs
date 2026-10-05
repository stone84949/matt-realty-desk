import {SYSTEM} from '../assistant.mjs';
import http from 'node:http';
import {writeFile} from 'node:fs/promises';
import {cases} from './assistant-cases.mjs';
const results=[];
await Promise.all(['@cf/meta/llama-3.3-70b-instruct-fp8-fast'].map(async model=>{
 for(const [id,prompt] of cases){const start=Date.now();try{const r=await localRequest('http://127.0.0.1:5060',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:SYSTEM},{role:'user',content:prompt}]}),signal:AbortSignal.timeout(45000)});const value=await r.json();results.push({model,id,prompt,ms:Date.now()-start,status:r.status,answer:value.choices?.[0]?.message?.content??value.response??null,finish:value.choices?.[0]?.finish_reason,usage:value.usage});}catch(e){results.push({model,id,ms:Date.now()-start,error:e.name})}await writeFile(process.argv[2],JSON.stringify(results,null,2));console.log(model.split('/').at(-1),id,results.at(-1).ms,Boolean(results.at(-1).answer));}
}));

function localRequest(url,options){return new Promise((resolve,reject)=>{const req=http.request(url,{method:options.method,headers:options.headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks).toString())}))});req.setTimeout(45000,()=>req.destroy(Error('Request timeout')));req.on('error',reject);req.end(options.body)})}
