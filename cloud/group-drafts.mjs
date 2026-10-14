import {DeskTemplates} from '../static/desk-templates.mjs';
import {audienceRows,selectAudience,groupTemplates,parseGroupAudience,requestFingerprint,MAX_EMAIL_DRAFTS} from '../static/campaign-audience.mjs';
export class AudienceError extends Error{constructor(message,status=400){super(message);this.status=status}}
const fail=(message,status)=>{throw new AudienceError(message,status)};
export const AUDIENCE_COLUMNS='id,first_name,last_name,email,email_permission,archived,type,stage,updated_at';
export function batchKey(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))fail('Invalid group save reference.');return value.toLowerCase()}
function normalize(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['batch_key','template_id','values','recipients','confirmed'].includes(k)))fail('Unsupported group draft fields.');
 if(data.confirmed!==true)fail('Review the occasion and recipients before saving.');
 const key=batchKey(data.batch_key),template=groupTemplates().find(t=>t.id===data.template_id);
 if(!template)fail('Use this property or appointment template individually.');
 const allowed=DeskTemplates.fields(template).filter(k=>k!=='first_name').sort(),input=data.values;
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))fail('Unsupported shared template fields.');
 const values={};for(const k of allowed){const value=input[k];if(typeof value!=='string'||!value.trim()||value.includes('\0')||value.length>(['signature','topic'].includes(k)?500:180))fail('Fill the shared template blanks with short text.');values[k]=value.trim()}
 if(!Array.isArray(data.recipients)||!data.recipients.length||data.recipients.length>500)fail('Choose between 1 and 500 contact records.');
 const ids=new Set(),recipients=data.recipients.map(r=>{if(!r||typeof r!=='object'||Object.keys(r).some(k=>!['id','revision'].includes(k))||!Number.isSafeInteger(r.id)||r.id<=0||ids.has(r.id)||typeof r.revision!=='string'||!r.revision||r.revision.length>1200)fail('Invalid recipient selection.');ids.add(r.id);return {id:r.id,revision:r.revision}}).sort((a,b)=>a.id-b.id);
 return {key,template,values,recipients};
}
const all=async(DB,sql,args=[])=>{const result=await DB.prepare(sql).bind(...args).all();return result.results};
export async function batchReceipt(DB,key){
 const rows=await all(DB,'SELECT id,audience FROM campaigns WHERE instr(audience,?)=1 ORDER BY id',[`Group:${batchKey(key)};`]);
 if(!rows.length)return null;
 const metadata=rows.map(r=>parseGroupAudience(r.audience));if(metadata.some(m=>!m)||metadata.some(m=>m.fingerprint!==metadata[0].fingerprint||m.count!==metadata[0].count)||rows.length!==metadata[0].count)fail('This saved group is incomplete. Review Campaigns before retrying.',409);
 return {batch_key:key,fingerprint:metadata[0].fingerprint,saved:rows.length,ids:rows.map(r=>r.id)};
}
export async function saveGroupDrafts(DB,data){
 const request=normalize(data),{key,template,values,recipients}=request;
 const fingerprint=await requestFingerprint({template_id:template.id,values,recipients});
 const previous=await batchReceipt(DB,key);if(previous){if(previous.fingerprint!==fingerprint)fail('This save reference already belongs to another message.',409);return {...previous,created:0,already_saved:true}}
 const rows=audienceRows(await all(DB,`SELECT ${AUDIENCE_COLUMNS} FROM contacts ORDER BY id`));
 for(const target of recipients){const row=rows.find(c=>c.id===target.id);if(!row||row.revision!==target.revision)fail('Contacts changed. Refresh and review the audience again.',409)}
 const selection=selectAudience(rows,recipients.map(r=>r.id));if(selection.excluded.length)fail('Some selected contacts are not eligible for an email campaign.');
 if(selection.recipients.length>MAX_EMAIL_DRAFTS)fail(`Choose no more than ${MAX_EMAIL_DRAFTS} different email addresses per group.`);
 const time=new Date().toISOString(),prefix=`Group:${key};`,fingerprintPrefix=prefix+fingerprint+';';
 const drafts=selection.recipients.map(c=>{const draft=DeskTemplates.fill(template.id,{...values,first_name:c.first_name});return {name:(template.name+' — '+[c.first_name,c.last_name].filter(Boolean).join(' ')).slice(0,200),channel:'Email',audience:`${fingerprintPrefix}n=${selection.recipients.length};contact=${c.id};Subscribed`,subject:draft.subject,body:draft.body,status:'Draft',created_at:time,updated_at:time,email_key:c.email_key}});
 const encoded=JSON.stringify(drafts);
 // One atomic INSERT: all contact revisions/permission are checked again inside the write.
 // Existing markers make identical retries no-ops; different payloads sharing a key cannot mix.
 const sql=`INSERT INTO campaigns(name,channel,audience,subject,body,status,created_at,updated_at)
 SELECT json_extract(d.value,'$.name'),json_extract(d.value,'$.channel'),json_extract(d.value,'$.audience'),json_extract(d.value,'$.subject'),json_extract(d.value,'$.body'),'Draft',json_extract(d.value,'$.created_at'),json_extract(d.value,'$.updated_at') FROM json_each(?) d
 WHERE NOT EXISTS(SELECT 1 FROM campaigns c WHERE c.audience=json_extract(d.value,'$.audience'))
 AND NOT EXISTS(SELECT 1 FROM campaigns c WHERE instr(c.audience,?)=1 AND instr(c.audience,?)<>1)
 AND NOT EXISTS(SELECT 1 FROM json_each(?) r LEFT JOIN contacts c ON c.id=json_extract(r.value,'$.id') WHERE c.id IS NULL OR json_array(c.id,c.first_name,c.last_name,c.email,c.email_permission,c.archived,c.type,c.stage,c.updated_at)<>json_extract(r.value,'$.revision'))
 AND NOT EXISTS(SELECT 1 FROM contacts c JOIN json_each(?) x ON lower(trim(c.email))=json_extract(x.value,'$.email_key') WHERE lower(trim(c.email_permission))='unsubscribed')
 AND NOT EXISTS(SELECT 1 FROM contacts c WHERE lower(trim(c.email_permission))='unsubscribed' AND NOT EXISTS(SELECT 1 FROM json_each(?) u WHERE json_extract(u.value,'$.id')=c.id AND json_extract(u.value,'$.email')=c.email AND json_extract(u.value,'$.updated_at')=c.updated_at))`;
 const suppressions=rows.filter(c=>String(c.email_permission).trim().toLowerCase()==='unsubscribed').map(c=>({id:c.id,email:c.email,updated_at:c.updated_at}));
 const result=await DB.prepare(sql).bind(encoded,prefix,fingerprintPrefix,JSON.stringify(recipients),encoded,JSON.stringify(suppressions)).run();
 const receipt=await batchReceipt(DB,key);if(!receipt)fail('The audience changed while saving. Refresh and review it again.',409);if(receipt.fingerprint!==fingerprint)fail('This save reference already belongs to another message.',409);
 return {...receipt,created:result.meta.changes,already_saved:!result.meta.changes,duplicates:selection.duplicates};
}
