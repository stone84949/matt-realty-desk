import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {TestD1} from './d1-test-adapter.mjs';
import {handleAssistant,MODEL} from '../assistant.mjs';
import {cases} from './assistant-cases.mjs';
const DB=new TestD1();for(const f of ['0001-crm.sql','0002-assistant.sql'])DB.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
const env={DB,AI:{run:async(model,input)=>{const body=JSON.stringify({model,messages:input.messages});return new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:5060',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{try{if(res.statusCode!==200)reject(Error('Provider error'));else resolve(JSON.parse(Buffer.concat(chunks).toString()))}catch(e){reject(e)}})});req.setTimeout(30000,()=>req.destroy(Error('Timeout')));req.on('error',reject);req.end(body)})}}};
const results=[];for(const [id,prompt] of cases){const start=Date.now();const response=await handleAssistant(new Request('https://test/api/assistant',{method:'POST',body:JSON.stringify({preset:'general',prompt})}),env);const value=await response.json();results.push({id,model:MODEL,ms:Date.now()-start,status:response.status,...value});await writeFile(process.argv[2],JSON.stringify(results,null,2));console.log(id,response.status,Date.now()-start)}DB.close();
