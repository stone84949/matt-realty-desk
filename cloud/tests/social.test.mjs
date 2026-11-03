import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestD1} from './d1-test-adapter.mjs';
import {handleSocial} from '../social.mjs';
function setup(t){const DB=new TestD1();DB.exec(readFileSync(new URL('../migrations/0003-social.sql',import.meta.url),'utf8'));t.after(()=>DB.close());return {DB,META_APP_ID:'app',META_APP_SECRET:'secret',SOCIAL_TOKEN_KEY:btoa('a'.repeat(32)),META_REDIRECT_URI:'https://crm.test/api/social/callback'};}
const call=(env,path,method='GET',body, cookie='',email='owner@test')=>handleSocial(new Request('https://crm.test/api/social/'+path,{method,headers:{Origin:'https://crm.test',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)}),env,{email});
test('configuration is honest and malformed keys fail closed',async t=>{const env=setup(t);delete env.META_APP_ID;let status=await (await call(env,'status')).json();assert.equal(status.configured,false);assert.deepEqual(status.missing,['META_APP_ID']);assert.deepEqual(await (await call(env,'choices')).json(),{pages:[]});assert.equal((await call(env,'connect','POST')).status,503);env.META_APP_ID='app';env.SOCIAL_TOKEN_KEY='bad';assert.equal((await (await call(env,'status')).json()).configured,false);});
test('OAuth state is identity/browser bound, one-use; credentials stay encrypted; missing counts remain null',async t=>{
 const env=setup(t);const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;const providerCalls=[];
 globalThis.fetch=async (url,options)=>{calls++;providerCalls.push({url:new URL(url),headers:options.headers});const path=new URL(url).pathname;let data;
 if(path.endsWith('/oauth/access_token'))data={access_token:new URL(url).searchParams.get('grant_type')==='fb_exchange_token'?'long-user-secret':'user-secret'};
 else if(path.endsWith('/me/accounts'))data={data:[{id:'123',name:'Page',access_token:'page-secret',instagram_business_account:{id:'456',username:'handle'}},{id:'789',name:'Other Page',access_token:'other-secret'}]};
 else if(path.endsWith('/123/posts'))data={data:[{id:'post',reactions:{summary:{total_count:0}}}]};
 else if(path.endsWith('/456/media'))data={data:[]};
 else data={id:path.split('/').at(-1)};
 return Response.json(data);
 };
 const connected=await call(env,'connect','POST');const cookie=connected.headers.get('Set-Cookie').split(';')[0];const auth=new URL((await connected.json()).url);assert.deepEqual(auth.searchParams.get('scope').split(',').sort(),['pages_read_engagement','pages_show_list']);
 const callback='callback?state='+auth.searchParams.get('state')+'&code=code';
 await call(env,callback,'GET',undefined,cookie,'attacker@test');assert.equal(calls,0);
 assert.equal((await call(env,callback,'GET',undefined,cookie)).status,303);assert.equal(calls,3);
 await call(env,callback,'GET',undefined,cookie);assert.equal(calls,3);assert.deepEqual(providerCalls.map(c=>c.url.pathname),['/v25.0/oauth/access_token','/v25.0/oauth/access_token','/v25.0/me/accounts']);assert.equal(providerCalls[0].url.searchParams.get('code'),'code');assert.equal(providerCalls[1].url.searchParams.get('grant_type'),'fb_exchange_token');assert.equal(providerCalls[1].url.searchParams.get('fb_exchange_token'),'user-secret');assert.equal(providerCalls[1].url.searchParams.get('client_id'),'app');assert.equal(providerCalls[1].url.searchParams.get('client_secret'),'secret');assert.equal(providerCalls[2].headers.Authorization,'Bearer long-user-secret');assert.equal(providerCalls[2].url.searchParams.get('fields'),'id,name,access_token');
 assert.deepEqual(await (await call(env,'choices','GET',undefined,'','attacker@test')).json(),{pages:[]});
 const choices=await (await call(env,'choices','GET',undefined,cookie)).json();assert.equal(choices.pages[0].instagram,null);assert.ok(!JSON.stringify(choices).includes('secret'));
 assert.equal((await call(env,'select','POST',{page_id:'wrong'},cookie)).status,400);
 const selections=await Promise.all([call(env,'select','POST',{page_id:'123'},cookie),call(env,'select','POST',{page_id:'789'},cookie)]);assert.deepEqual(selections.map(r=>r.status).sort(),[200,409]);assert.equal((await env.DB.prepare('SELECT count(*) n FROM social_accounts').first()).n,1);
 const raw=await env.DB.prepare('SELECT credential FROM social_accounts LIMIT 1').first();assert.ok(!raw.credential.includes('secret'));
 const refreshed=await (await call(env,'refresh','POST')).json();assert.equal(refreshed.snapshots[0].data.posts_available,true);assert.equal(refreshed.snapshots[0].data.account.followers_count,null);assert.equal(refreshed.snapshots[0].data.posts[0].likes,0);assert.equal(refreshed.snapshots[0].data.posts[0].comments,null);
 assert.ok(!JSON.stringify(await (await call(env,'status')).json()).includes('secret'));
 await call(env,'disconnect','POST');assert.equal((await (await call(env,'status')).json()).connected,false);assert.equal((await env.DB.prepare('SELECT count(*) n FROM social_snapshots').first()).n,1);assert.equal((await env.DB.prepare('SELECT count(*) n FROM social_oauth').first()).n,0);
});
test('expired state and hostile origins never contact provider',async t=>{const env=setup(t);const res=await call(env,'connect','POST');const cookie=res.headers.get('Set-Cookie').split(';')[0],state=new URL((await res.json()).url).searchParams.get('state');env.DB.exec('UPDATE social_oauth SET expires_at=0');const response=await call(env,'callback?state='+state+'&code=x','GET',undefined,cookie);assert.match(response.headers.get('Location'),/connection_failed/);assert.equal((await handleSocial(new Request('https://crm.test/api/social/connect',{method:'POST',headers:{Origin:'https://evil.test'}}),env,{email:'owner@test'})).status,403);});
test('provider failures retain a dated partial snapshot without leaking raw errors',async t=>{
 const env=setup(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode('a'.repeat(32)),'AES-GCM',false,['encrypt']);const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({token:'hidden-token'}))));const encrypted=[iv,bytes].map(x=>btoa(String.fromCharCode(...x))).join('.');
 await env.DB.prepare('INSERT INTO social_accounts VALUES(?,?,?,?,?,?,?)').bind('facebook:1','facebook','1','Page',encrypted,'now','now').run();
 globalThis.fetch=async()=>Response.json({error:{message:'private-provider-details hidden-token'}},{status:403});
 const response=await call(env,'refresh','POST'),body=await response.json();assert.equal(body.partial,true);assert.equal(body.snapshots[0].data.posts_available,false);assert.equal(body.snapshots[0].data.errors.length,2);assert.equal(body.snapshots[0].data.account.followers_count,null);assert.ok(!JSON.stringify(body).includes('hidden-token'));assert.ok(!JSON.stringify(body).includes('private-provider-details'));
 globalThis.fetch=async()=>Response.json({data:[null]});const malformed=await (await call(env,'refresh','POST')).json();assert.equal(malformed.snapshots[0].data.posts_available,false);assert.deepEqual(malformed.snapshots[0].data.posts,[]);
});



for(const disconnectFirst of [true,false])test(`select/disconnect atomic ordering: disconnect first=${disconnectFirst}`,async t=>{
 const env=setup(t),browser='browser',state='pending',email='owner@test';
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode('a'.repeat(32)),'AES-GCM',false,['encrypt']);
 const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify([{id:'1',name:'Page',token:'private-token',instagram:null}]))));
 const encrypted=[iv,bytes].map(x=>btoa(String.fromCharCode(...x))).join('.');
 await env.DB.prepare('INSERT INTO social_oauth VALUES(?,?,?,?,?)').bind(state,email,browser,Date.now()+600000,encrypted).run();
 const originalBatch=env.DB.batch.bind(env.DB);let release,entered;
 const gate=new Promise(resolve=>{release=resolve}),ready=new Promise(resolve=>{entered=resolve});
 env.DB.batch=async statements=>{if(statements.length===3){entered();await gate;}return originalBatch(statements);};
 const selection=call(env,'select','POST',{page_id:'1'},'__Host-meta_nonce='+browser);
 await ready;
 if(disconnectFirst){assert.equal((await call(env,'disconnect','POST')).status,200);release();assert.equal((await selection).status,409);}
 else{release();assert.equal((await selection).status,200);assert.equal((await call(env,'disconnect','POST')).status,200);}
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM social_accounts').first()).n,0);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM social_oauth').first()).n,0);
});



function instagramEnv(env){return {...env,IG_APP_ID:'ig-app',IG_APP_SECRET:'ig-secret',IG_REDIRECT_URI:'https://crm.test/api/social/instagram/callback'};}
for(const nested of [true,false])test(`Instagram narrow basic login uses separate provider and retains Facebook: nested=${nested}`,async t=>{
 const env=instagramEnv(setup(t)),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});const requests=[];
 await env.DB.prepare('INSERT INTO social_accounts VALUES(?,?,?,?,?,?,?)').bind('facebook:123','facebook','123','Existing FB','encrypted','now','now').run();
 globalThis.fetch=async(url,options)=>{url=new URL(url);requests.push({url,options});
 if(url.host==='api.instagram.com'){assert.equal(options.method,'POST');assert.equal(options.body.get('grant_type'),'authorization_code');assert.equal(options.body.get('client_id'),'ig-app');assert.equal(options.body.get('client_secret'),'ig-secret');assert.equal(options.body.get('redirect_uri'),env.IG_REDIRECT_URI);assert.equal(options.body.get('code'),'ig-code');return Response.json(nested?{data:[{access_token:'ig-short',user_id:'456'}]}:{access_token:'ig-short',user_id:'456'});}
 if(url.pathname==='/access_token')return Response.json({access_token:'ig-long',expires_in:5184000});
 if(url.pathname.endsWith('/me'))return Response.json({user_id:'456',username:'handle'});
 if(url.pathname.endsWith('/media'))return Response.json({data:[]});
 return Response.json({user_id:'456',username:'handle',followers_count:10});};
 const connect=await call(env,'instagram/connect','POST'),cookie=connect.headers.get('Set-Cookie').split(';')[0],auth=new URL((await connect.json()).url);
 assert.equal(auth.origin+auth.pathname,'https://www.instagram.com/oauth/authorize');assert.equal(auth.searchParams.get('scope'),'instagram_business_basic');assert.equal(auth.searchParams.get('redirect_uri'),env.IG_REDIRECT_URI);
 const callback='instagram/callback?state='+encodeURIComponent(auth.searchParams.get('state'))+'&code=ig-code';
 await call(env,callback,'GET',undefined,cookie,'attacker@test');assert.equal(requests.length,0);
 await call(env,callback,'GET',undefined,'');assert.equal(requests.length,0);
 assert.ok(!(await call(env,callback,'GET',undefined,cookie)).headers.get('Location').includes('social_error'));
 assert.deepEqual(requests.map(r=>r.url.host+r.url.pathname),['api.instagram.com/oauth/access_token','graph.instagram.com/access_token','graph.instagram.com/v25.0/me']);assert.equal(requests[1].url.searchParams.get('grant_type'),'ig_exchange_token');assert.equal(requests[1].url.searchParams.get('client_secret'),'ig-secret');assert.equal(requests[1].url.searchParams.get('access_token'),'ig-short');assert.equal(requests[2].options.headers.Authorization,'Bearer ig-long');assert.equal(requests[2].url.searchParams.get('fields'),'user_id,username');
 await call(env,callback,'GET',undefined,cookie);assert.equal(requests.length,3);
 let status=await (await call(env,'status')).json();assert.equal(status.instagram_configured,true);assert.equal(status.accounts.length,2);assert.ok(!JSON.stringify(status).includes('ig-long'));
 const credential=await env.DB.prepare("SELECT credential FROM social_accounts WHERE platform='instagram'").first();assert.ok(!credential.credential.includes('ig-long'));
 // Facebook reselection must not delete the independently authorized Instagram account.
 const pendingIV=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',new TextEncoder().encode('a'.repeat(32)),'AES-GCM',false,['encrypt']);const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:pendingIV},key,new TextEncoder().encode(JSON.stringify([{id:'789',name:'New FB',token:'fb-token',instagram:null}]))));
 await env.DB.prepare('INSERT INTO social_oauth VALUES(?,?,?,?,?)').bind('facebook:select','owner@test','fb-browser',Date.now()+600000,[pendingIV,bytes].map(x=>btoa(String.fromCharCode(...x))).join('.')).run();
 assert.equal((await call(env,'select','POST',{page_id:'789'},'__Host-meta_nonce=fb-browser')).status,200);status=await (await call(env,'status')).json();assert.deepEqual(status.accounts.map(a=>a.platform).sort(),['facebook','instagram']);
 // Instagram can refresh while Facebook setup is absent; successful empty media is available.
 await env.DB.prepare("DELETE FROM social_accounts WHERE platform='facebook'").run();delete env.META_APP_ID;
 const refreshed=await (await call(env,'refresh','POST')).json();assert.equal(refreshed.partial,false);assert.equal(refreshed.snapshots[0].data.posts_available,true);assert.deepEqual(refreshed.snapshots[0].data.posts,[]);assert.equal(requests.at(-1).url.host,'graph.instagram.com');
});
test('Instagram callback cannot re-create credentials after disconnect during provider exchange',async t=>{
 const env=instagramEnv(setup(t)),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let release,entered;const gate=new Promise(r=>{release=r}),ready=new Promise(r=>{entered=r});
 globalThis.fetch=async url=>{url=new URL(url);if(url.host==='api.instagram.com'){entered();await gate;return Response.json({access_token:'short',user_id:'456'});}if(url.pathname==='/access_token')return Response.json({access_token:'long'});return Response.json({user_id:'456',username:'handle'});};
 const connect=await call(env,'instagram/connect','POST'),cookie=connect.headers.get('Set-Cookie').split(';')[0],state=new URL((await connect.json()).url).searchParams.get('state');
 const callback=call(env,'instagram/callback?state='+encodeURIComponent(state)+'&code=code','GET',undefined,cookie);await ready;await call(env,'disconnect','POST');release();assert.match((await callback).headers.get('Location'),/connection_failed/);assert.equal((await env.DB.prepare('SELECT count(*) n FROM social_accounts').first()).n,0);
});

