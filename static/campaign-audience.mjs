import {DeskTemplates} from './desk-templates.mjs';
export const MAX_EMAIL_DRAFTS=100;
export const emailKey=value=>typeof value==='string'?value.trim().toLowerCase():'';
export const contactRevision=c=>JSON.stringify([c.id,c.first_name,c.last_name,c.email,c.email_permission,c.archived,c.type,c.stage,c.updated_at]);
export function audienceRows(contacts){
 const suppressed=new Set(contacts.filter(c=>emailKey(c.email_permission)==='unsubscribed').map(c=>emailKey(c.email)).filter(Boolean));
 return contacts.map(c=>{
  const email=emailKey(c.email);
  const reason=c.archived?'Archived contact':!email?'No email address':!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)?'Invalid email address':suppressed.has(email)?'Email address is unsubscribed':emailKey(c.email_permission)!=='subscribed'?'Marketing permission not confirmed':!String(c.first_name||'').trim()?'Missing first name':'';
  return {...c,email_key:email,eligible:!reason,reason,revision:contactRevision(c)};
 });
}
export function selectAudience(rows,ids){
 const selected=new Set(ids.map(Number)),seen=new Set(),recipients=[],excluded=[];let duplicates=0;
 for(const c of [...rows].sort((a,b)=>a.id-b.id))if(selected.has(Number(c.id))){if(!c.eligible)excluded.push(c);else if(seen.has(c.email_key))duplicates++;else{seen.add(c.email_key);recipients.push(c)}}
 for(const id of selected)if(!rows.some(c=>Number(c.id)===id))excluded.push({id,first_name:'Unavailable contact',last_name:'',email:'',email_key:'',eligible:false,reason:'No longer present; remove this selection'});
 return {recipients,excluded,duplicates};
}
export function groupTemplates(){const shared=new Set(['first_name','agent_name','signature','holiday','topic']);return DeskTemplates.items.filter(t=>DeskTemplates.fields(t).every(key=>shared.has(key)))}
export function parseGroupAudience(value){
 const match=/^Group:([a-f0-9-]{36});([a-f0-9]{64});n=(\d+);contact=(\d+);Subscribed$/i.exec(value||'');
 return match?{batch:match[1],fingerprint:match[2],count:Number(match[3]),contactId:Number(match[4])}:null;
}
export function individualAudience(value){const group=parseGroupAudience(value);return group?`Contact #${group.contactId} | Permission at drafting: Subscribed`:value}
export function audienceLabel(value){const group=parseGroupAudience(value);return group?`Group draft · Contact #${group.contactId} · Subscribed at creation`:value}
export async function requestFingerprint(data){
 const values=Object.fromEntries(Object.keys(data.values).sort().map(k=>[k,data.values[k].trim()]));
 const recipients=data.recipients.map(r=>({id:r.id,revision:r.revision})).sort((a,b)=>a.id-b.id);
 const encoded=new TextEncoder().encode(JSON.stringify({template_id:data.template_id,values,recipients}));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
if(typeof window!=='undefined')Object.assign(window,{CampaignAudience:{parseGroupAudience,individualAudience,audienceLabel}});

