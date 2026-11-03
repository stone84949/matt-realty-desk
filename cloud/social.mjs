const cookieName = '__Host-meta_nonce';
const igCookieName = '__Host-instagram_nonce';
const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const nonce = () => crypto.randomUUID();
const all = async (env,sql,...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
const base64=bytes=>{let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);};
const safeAccount = ({credential,...account}) => account;
function configuration(env,origin,ig=false) {
 const redirect=ig?'IG_REDIRECT_URI':'META_REDIRECT_URI';
 const required=ig?['IG_APP_ID','IG_APP_SECRET','SOCIAL_TOKEN_KEY',redirect]:['META_APP_ID','META_APP_SECRET','SOCIAL_TOKEN_KEY',redirect];
 const missing=required.filter(key=>!env[key]);
 try { if(Uint8Array.from(atob(env.SOCIAL_TOKEN_KEY||''),c=>c.charCodeAt(0)).length!==32)throw Error(); } catch { if(!missing.includes('SOCIAL_TOKEN_KEY'))missing.push('SOCIAL_TOKEN_KEY'); }
 try { const uri=new URL(env[redirect]); if(uri.origin!==origin||uri.protocol!=='https:'||uri.pathname!==(ig?'/api/social/instagram/callback':'/api/social/callback')||uri.search||uri.hash)throw Error(); } catch { if(!missing.includes(redirect))missing.push(redirect); }
 if(!/^v\d+\.\d+$/.test(env.META_GRAPH_VERSION||'v25.0'))missing.push('META_GRAPH_VERSION');
 return missing;
}
async function crypt(env,value,decrypt=false) {
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(env.SOCIAL_TOKEN_KEY),c=>c.charCodeAt(0)),'AES-GCM',false,['encrypt','decrypt']);
 if(decrypt){const [iv,data]=value.split('.').map(x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0)));return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,data)));}
 const iv=crypto.getRandomValues(new Uint8Array(12));const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value))));return [iv,data].map(base64).join('.');
}
async function provider(url,options={}) {
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!response.ok)throw Error('Provider request failed');
 if(Number(response.headers.get('content-length'))>1048576)throw Error('Provider response too large');
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw Error('Provider response too large');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes));if(data.error)throw Error('Provider request failed');return data;
}
async function graph(env,path,token,params={},ig=false,versioned=true) {
 const url=new URL(`https://${ig?'graph.instagram.com':'graph.facebook.com'}/${versioned?(env.META_GRAPH_VERSION||'v25.0')+'/':''}${path}`);
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 return provider(url,{headers:token?{Authorization:`Bearer ${token}`}:{}});
}
function cookie(request,ig=false){const name=ig?igCookieName:cookieName;return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
const cookieHeader=(value,age=600,ig=false)=>`${ig?igCookieName:cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
async function session(request,env,email){return env.DB.prepare("SELECT * FROM social_oauth WHERE identity=? AND nonce=? AND expires_at>? AND pending IS NOT NULL AND pending<>'' AND state NOT LIKE 'instagram:%'").bind(email,cookie(request),Date.now()).first();}
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const validToken=value=>typeof value==='string'&&value.trim().length>0;
const audience=(url,error=false)=>new Response(null,{status:303,headers:{Location:url.origin+'/?view=command&tab=audience'+(error?'&social_error=connection_failed':''),'Cache-Control':'no-store'}});
async function snapshot(env,account,origin){
 const errors=[];let info={},posts=[],posts_available=false;
 const ig=account.platform==='instagram';
 if(configuration(env,origin,ig).length){errors.push('Administrator configuration unavailable.');}
 else{
 const {token}=await crypt(env,account.credential,true);
 try{info=await graph(env,encodeURIComponent(account.account_id),token,{fields:ig?'user_id,username,followers_count,media_count':'id,name,followers_count'},ig);}catch{errors.push('Account summary unavailable; reconnect or check permissions.');}
 try{const result=await graph(env,`${encodeURIComponent(account.account_id)}/${ig?'media':'posts'}`,token,{fields:ig?'id,caption,permalink,timestamp,like_count,comments_count':'id,message,permalink_url,created_time,reactions.type(LIKE).limit(0).summary(true),comments.limit(0).summary(true),shares',limit:'25'},ig);if(!Array.isArray(result.data))throw Error('Invalid posts response');posts=result.data.slice(0,25).map(p=>({id:p.id,message:p.message??p.caption??'',permalink_url:p.permalink_url??p.permalink??null,created_time:p.created_time??p.timestamp??null,likes:number(ig?p.like_count:p.reactions?.summary?.total_count),comments:number(ig?p.comments_count:p.comments?.summary?.total_count),shares:number(p.shares?.count)}));posts_available=true;}catch{posts=[];errors.push('Recent posts unavailable; reconnect or check permissions.');}
 }
 const data={account:{id:account.account_id,name:info.name??info.username??account.name,followers_count:number(info.followers_count),media_count:number(info.media_count)},posts,posts_available,errors};
 const row={id:nonce(),account_id:account.id,platform:account.platform,captured_at:new Date().toISOString(),data};
 await env.DB.prepare('INSERT INTO social_snapshots VALUES(?,?,?,?,?)').bind(row.id,row.account_id,row.platform,row.captured_at,JSON.stringify(data)).run();
 await env.DB.prepare('DELETE FROM social_snapshots WHERE account_id=? AND id NOT IN (SELECT id FROM social_snapshots WHERE account_id=? ORDER BY captured_at DESC LIMIT 30)').bind(account.id,account.id).run();return row;
}
// Every account write and final session consumption share one atomic, live-session-guarded batch.
async function saveAccounts(env,row,email,browser,accounts,credential){
 const valid='EXISTS (SELECT 1 FROM social_oauth WHERE state=? AND identity=? AND nonce=? AND expires_at>?)';
 const guard=[row.state,email,browser,Date.now()],now=new Date().toISOString();
 const result=await env.DB.batch([env.DB.prepare('DELETE FROM social_accounts WHERE platform=? AND '+valid).bind(accounts[0].platform,...guard),...accounts.map(a=>env.DB.prepare('INSERT INTO social_accounts SELECT ?,?,?,?,?,?,? WHERE '+valid).bind(a.id,a.platform,a.account_id,a.name,credential,now,now,...guard)),env.DB.prepare('DELETE FROM social_oauth WHERE state=? AND identity=? AND nonce=? AND expires_at>?').bind(...guard)]);
 return result.at(-1)?.meta?.changes?accounts.map(a=>({...a,created_at:now,updated_at:now})):null;
}
export async function handleSocial(request,env,identity){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/social/'))return null;
 const route=url.pathname.slice('/api/social/'.length),email=identity?.email;if(!email)return json({error:'Authentication required'},401);
 const methods={status:'GET',connect:'POST',callback:'GET','instagram/connect':'POST','instagram/callback':'GET',choices:'GET',select:'POST',refresh:'POST',disconnect:'POST'};
 if(!methods[route])return json({error:'Not found'},404);if(request.method!==methods[route])return json({error:'Method not allowed'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required'},403);
 const ig=route.startsWith('instagram/'),missing=configuration(env,url.origin,ig);
 try{
 if(route==='status'){
 const accounts=(await all(env,'SELECT * FROM social_accounts')).map(safeAccount);
 const snapshots=(await all(env,'SELECT s.* FROM social_snapshots s WHERE s.id=(SELECT id FROM social_snapshots WHERE account_id=s.account_id ORDER BY captured_at DESC LIMIT 1)')).map(({data_json,...row})=>({...row,data:JSON.parse(data_json)}));
 const instagram_missing=configuration(env,url.origin,true);return json({configured:!missing.length,instagram_configured:!instagram_missing.length,instagram_missing,connected:accounts.length>0,missing,accounts,snapshots});}
 if(route==='disconnect'){await env.DB.batch(['DELETE FROM social_accounts','DELETE FROM social_oauth'].map(sql=>env.DB.prepare(sql)));const headers=new Headers({'Cache-Control':'no-store','Content-Type':'application/json'});headers.append('Set-Cookie',cookieHeader('',0));headers.append('Set-Cookie',cookieHeader('',0,true));return new Response(JSON.stringify({connected:false}),{headers});}
 if(route==='refresh'){const accounts=await all(env,'SELECT * FROM social_accounts');if(!accounts.length)return json({error:'Connect an account first'},409);const snapshots=[];for(const account of accounts)snapshots.push(await snapshot(env,account,url.origin));return json({snapshots,partial:snapshots.some(s=>s.data.errors.length)});}
 if(route==='choices'&&(missing.length||!await session(request,env,email)))return json({pages:[]});
 if(missing.length)return json({error:'Administrator setup required',missing},503);
 if(route==='connect'||route==='instagram/connect'){
 const state=(ig?'instagram:':'facebook:')+nonce(),browser=nonce();await env.DB.prepare('DELETE FROM social_oauth WHERE expires_at<=? OR (identity=? AND state LIKE ?)').bind(Date.now(),email,ig?'instagram:%':'facebook:%').run();
 await env.DB.prepare('INSERT INTO social_oauth VALUES(?,?,?,?,NULL)').bind(state,email,browser,Date.now()+600000).run();
 const auth=new URL(ig?'https://www.instagram.com/oauth/authorize':`https://www.facebook.com/${env.META_GRAPH_VERSION||'v25.0'}/dialog/oauth`);
 for(const [k,v] of Object.entries({client_id:ig?env.IG_APP_ID:env.META_APP_ID,redirect_uri:ig?env.IG_REDIRECT_URI:env.META_REDIRECT_URI,state,response_type:'code',scope:ig?'instagram_business_basic':'pages_show_list,pages_read_engagement'}))auth.searchParams.set(k,v);
 return json({url:auth.href},200,{'Set-Cookie':cookieHeader(browser,600,ig)});}
 if(route==='callback'||route==='instagram/callback'){
 const state=url.searchParams.get('state')||'',code=url.searchParams.get('code');if(!state.startsWith(ig?'instagram:':'facebook:')||!code||code.length>4096||url.searchParams.get('error'))throw Error();
 // Claim once before provider calls; keep the row as a cancellation fence for disconnect.
 const row=await env.DB.prepare("UPDATE social_oauth SET pending='' WHERE state=? AND identity=? AND nonce=? AND expires_at>? AND pending IS NULL RETURNING *").bind(state,email,cookie(request,ig),Date.now()).first();if(!row)throw Error();
 if(ig){
 const form=new FormData();for(const [key,value] of Object.entries({client_id:env.IG_APP_ID,client_secret:env.IG_APP_SECRET,grant_type:'authorization_code',redirect_uri:env.IG_REDIRECT_URI,code}))form.set(key,value);
 const initial=await provider(new URL('https://api.instagram.com/oauth/access_token'),{method:'POST',body:form});const short=Array.isArray(initial.data)?initial.data[0]:initial;if(!validToken(short?.access_token))throw Error();
 const long=await graph(env,'access_token',null,{grant_type:'ig_exchange_token',client_secret:env.IG_APP_SECRET,access_token:short.access_token},true,false);if(!validToken(long.access_token))throw Error();
 const profile=await graph(env,'me',long.access_token,{fields:'user_id,username'},true);const id=String(profile.user_id??'');if(!/^\d+$/.test(id)||typeof profile.username!=='string'||!profile.username.trim())throw Error();
 const accounts=[{id:'instagram:'+id,platform:'instagram',account_id:id,name:profile.username}];const credential=await crypt(env,{token:long.access_token});
 if(!await saveAccounts(env,row,email,cookie(request,true),accounts,credential))throw Error();return audience(url);
 }
 const token=await graph(env,'oauth/access_token',null,{client_id:env.META_APP_ID,client_secret:env.META_APP_SECRET,redirect_uri:env.META_REDIRECT_URI,code});if(!validToken(token.access_token))throw Error();
 const long=await graph(env,'oauth/access_token',null,{grant_type:'fb_exchange_token',fb_exchange_token:token.access_token,client_id:env.META_APP_ID,client_secret:env.META_APP_SECRET});if(!validToken(long.access_token))throw Error();
 const result=await graph(env,'me/accounts',long.access_token,{fields:'id,name,access_token',limit:'100'});
 const pages=(result.data||[]).slice(0,100).filter(p=>typeof p.id==='string'&&validToken(p.access_token)).map(p=>({id:p.id,name:p.name||p.id,token:p.access_token,instagram:null}));
 const pending=await crypt(env,pages);const updated=await env.DB.prepare("UPDATE social_oauth SET pending=? WHERE state=? AND identity=? AND nonce=? AND expires_at>? AND pending=''").bind(pending,row.state,email,cookie(request),Date.now()).run();if(!updated.meta.changes)throw Error();return audience(url);}
 if(route==='choices'||route==='select'){
 const row=await session(request,env,email);if(!row)return json({error:'Authorize Facebook again'},409);const pages=await crypt(env,row.pending,true);
 if(route==='choices')return json({pages:pages.map(({token,...page})=>page)});
 if(Number(request.headers.get('content-length'))>2048)return json({error:'Selection too large'},400);
 const text=await request.text();if(text.length>2048)return json({error:'Selection too large'},400);const {page_id}=JSON.parse(text);const page=pages.find(p=>p.id===page_id);if(!page)return json({error:'Select an authorized Page'},400);
 const credential=await crypt(env,{token:page.token});const accounts=await saveAccounts(env,row,email,cookie(request),[{id:'facebook:'+page.id,platform:'facebook',account_id:page.id,name:page.name}],credential);
 if(!accounts)return json({error:'Authorize Facebook again'},409);return json({connected:true,accounts},200,{'Set-Cookie':cookieHeader('',0)});}
 }catch{if(route==='callback'||route==='instagram/callback'){const response=audience(url,true);response.headers.set('Set-Cookie',cookieHeader('',0,ig));return response;}return json({error:'Social request failed. Retry or reconnect.'},502);}
}
