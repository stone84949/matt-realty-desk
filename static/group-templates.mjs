import {DeskTemplates} from './desk-templates.mjs';
import {selectAudience,groupTemplates,requestFingerprint,MAX_EMAIL_DRAFTS} from './campaign-audience.mjs';
const PENDING_KEY='matt-group-draft-save-v1';
export async function openGroupTemplateLibrary(initial='holiday'){
 await runtimeReady;
 const dialog=personalDialog('groupTemplateDialog','Choose recipients for a group draft');
 const templates=groupTemplates();if(!templates.some(t=>t.id===initial)){notify('This template needs individual property or appointment details. Choose a common-message occasion, such as a holiday or check-in, for a group.',true);return false}let rows=[],selected=new Set(),saving=false,pending=null,loading=true,brokenReceipt=false,fieldCache={},baseline="";
 try{const saved=sessionStorage.getItem(PENDING_KEY);if(saved){pending=JSON.parse(saved);if(!pending.request?.batch_key||!pending.fingerprint||!Array.isArray(pending.preview))throw Error('Invalid receipt')}}catch{brokenReceipt=true}
 dialog.querySelector('.personal-body').innerHTML=`<p>Choose people, fill the common message once, and review personalized drafts. Nothing will be sent.</p><div class="group-controls"><div class="field"><label for="groupTemplate">Occasion</label><select id="groupTemplate">${templates.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div><div class="field"><label for="groupType">Relationship type</label><select id="groupType"><option value="">All types</option></select></div><div class="field"><label for="groupStage">Stage</label><select id="groupStage"><option value="">All stages</option></select></div><div class="field"><label for="groupSearch">Find a person</label><input id="groupSearch" type="search" placeholder="Name or email"></div></div><p class="muted">Property and appointment templates stay individual so different details are not copied across people.</p><div class="item-actions"><button type="button" class="ghost" id="selectGroupMatches">Add matching eligible contacts</button><button type="button" class="ghost" id="clearGroupSelection">Clear selection</button></div><label class="template-confirm"><input type="checkbox" id="showGroupExcluded"> Show excluded contacts and reasons</label><p id="groupCounts" role="status"></p><div id="groupContactList" class="group-contact-list">Loading audience…</div><div class="template-workspace"><section><h3>Common message details</h3><p class="muted">Each recipient's first name fills separately. Shared email addresses count once; the preview shows whose name is used.</p><div id="groupFields"></div><h3>Review selected recipients</h3><div id="groupSelected" class="group-selected"></div><label class="template-confirm"><input type="checkbox" id="groupConfirmed"> I have reviewed the recipients and confirmed this occasion applies to all of them.</label></section><section><div class="field"><label for="groupPreviewRecipient">Preview a recipient</label><select id="groupPreviewRecipient"></select></div><div class="letter-preview"><p class="letter-label">Personalized draft preview</p><h3 id="groupSubject"></h3><div id="groupBody"></div><p id="groupMissing" role="status"></p></div></section></div><p id="groupSaveStatus" role="status"></p><div class="modal-actions"><button type="button" class="primary" id="saveGroupDrafts" disabled>Save personalized drafts</button></div>`;
 const templateSelect=$('#groupTemplate');templateSelect.value=templates.some(t=>t.id===initial)?initial:'holiday';
 function sharedValues(){return Object.fromEntries($$('#groupFields [name]').map(input=>[input.name,input.value]))}
 function selection(){return selectAudience(pending?pending.preview:rows,[...selected])}
 function locked(){return saving||!!pending||brokenReceipt}
 function matched(){const q=$('#groupSearch').value.toLowerCase().trim(),type=$('#groupType').value,stage=$('#groupStage').value;return rows.filter(c=>(!type||c.type===type)&&(!stage||c.stage===stage)&&(!q||`${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q)))}
 function lockControls(){
  $$('#groupTemplateDialog input,#groupTemplateDialog select,#groupTemplateDialog textarea,#groupTemplateDialog .item-actions button').forEach(control=>control.disabled=locked()||loading);
  $$('#groupContactList input').forEach(control=>{const row=rows.find(c=>c.id===Number(control.dataset.recipient));control.disabled=locked()||!row?.eligible});
  $('#groupPreviewRecipient').disabled=!selection().recipients.length||saving;
  dialog.querySelector('.icon').disabled=saving;
 }
 function preview(){
  const list=selection().recipients,previewId=$('#groupPreviewRecipient').value,c=list.find(c=>String(c.id)===previewId)||list[0];
  if(!c){$('#groupSubject').textContent='Choose at least one eligible contact';$('#groupBody').textContent='Your personalized preview will appear here.';$('#groupMissing').textContent='';return}
  const message=DeskTemplates.fill(templateSelect.value,{...sharedValues(),first_name:c.first_name});$('#groupSubject').textContent=message.subject;$('#groupBody').textContent=message.body;$('#groupMissing').textContent=message.missing.length?'Fill: '+message.missing.map(k=>DeskTemplates.labels[k]).join(', '):'Names and sign-off are filled. Review before saving.';
 }
 function render(){
  const current=selection(),matches=matched(),eligible=matches.filter(c=>c.eligible),excluded=matches.length-eligible.length;
  $('#groupCounts').textContent=`${selected.size} selected contacts · ${current.recipients.length} email drafts · ${current.duplicates} shared-address duplicates. ${eligible.length} eligible matches; ${excluded} excluded matches.`;
  const visible=$('#showGroupExcluded').checked?matches:eligible;
  $('#groupContactList').innerHTML=visible.length?visible.map(c=>`<label class="group-contact"><input type="checkbox" data-recipient="${c.id}" ${selected.has(c.id)?'checked':''} ${!c.eligible?'disabled':''}><span><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong><small>${esc(c.email||'No email')} · ${esc(c.type)} · ${esc(c.stage)}</small>${c.reason?`<small class="excluded-reason">${esc(c.reason)}</small>`:''}</span></label>`).join(''):'<p>No eligible matches. Use Show excluded to see why. Confirm marketing permission only when you actually have it.</p>';
  $$('[data-recipient]').forEach(input=>input.onchange=()=>{const id=Number(input.dataset.recipient);input.checked?selected.add(id):selected.delete(id);$('#groupConfirmed').checked=false;render()});
  $('#groupSelected').innerHTML=[...current.recipients,...current.excluded].map(c=>`<div><span>${esc(c.first_name)} ${esc(c.last_name)} · ${esc(c.email)}${c.reason?' · '+esc(c.reason):''}</span><button type="button" class="ghost" data-remove-recipient="${c.id}" ${locked()?'disabled':''}>${c.eligible?'Remove email':'Remove'}</button></div>`).join('')||'<p>No recipients selected.</p>';
  $$('[data-remove-recipient]').forEach(button=>button.onclick=()=>{const id=Number(button.dataset.removeRecipient),c=rows.find(c=>c.id===id);if(c?.eligible){for(const row of rows)if(row.email_key===c.email_key)selected.delete(row.id)}else selected.delete(id);$('#groupConfirmed').checked=false;render()});
  const previous=$('#groupPreviewRecipient').value;$('#groupPreviewRecipient').innerHTML=current.recipients.map(c=>`<option value="${c.id}">${esc(c.first_name)} ${esc(c.last_name)} — ${esc(c.email)}</option>`).join('');if(current.recipients.some(c=>String(c.id)===previous))$('#groupPreviewRecipient').value=previous;
  preview();const missing=current.recipients.length?DeskTemplates.fill(templateSelect.value,{...sharedValues(),first_name:current.recipients[0].first_name}).missing:[];
  const ready=selected.size<=500&&current.recipients.length>0&&current.recipients.length<=MAX_EMAIL_DRAFTS&&!current.excluded.length&&!missing.length&&$('#groupConfirmed').checked;
  $('#saveGroupDrafts').disabled=saving||loading||brokenReceipt||(!pending&&!ready);$('#saveGroupDrafts').textContent=pending?'Retry the same save':`Save ${current.recipients.length||''} personalized drafts`;
  if(current.recipients.length>MAX_EMAIL_DRAFTS)$('#groupMissing').textContent=`Choose up to ${MAX_EMAIL_DRAFTS} different email addresses per group. No recipients will be silently dropped.`;
  if(selected.size>500)$('#groupMissing').textContent='Choose up to 500 contact records per group.';
  lockControls();
 }
 function fields(values){const profile=DeskProfile.read(),template=templates.find(t=>t.id===templateSelect.value);$('#groupFields').innerHTML=DeskTemplates.fields(template).filter(k=>k!=='first_name').map(k=>`<div class="field"><label for="group-${k}">${DeskTemplates.labels[k]}</label><textarea id="group-${k}" name="${k}" rows="${k==='signature'||k==='topic'?3:1}" maxlength="${k==='signature'||k==='topic'?500:180}"></textarea></div>`).join('');$$('#groupFields [name]').forEach(input=>{input.value=values?.[input.name]??(input.name==='agent_name'?profile.display_name:input.name==='signature'?profile.signature:'');input.oninput=()=>{$('#groupConfirmed').checked=false;render()}})}
 async function load(){rows=await api('/api/campaigns/audience');for(const [id,key,label] of [['groupType','type','All types'],['groupStage','stage','All stages']]){const select=$('#'+id),old=select.value;select.innerHTML=`<option value="">${label}</option>`+[...new Set(rows.map(c=>c[key]).filter(Boolean))].sort().map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');select.value=old}loading=false;render()}
 async function success(receipt){try{sessionStorage.removeItem(PENDING_KEY)}catch{};pending=null;dialog.close();notify(`${receipt.saved} personalized drafts saved. Nothing sent.`);go('campaigns')}
 $('#saveGroupDrafts').onclick=async()=>{
  if(saving||$('#saveGroupDrafts').disabled)return;
  saving=true;render();
  if(!pending){const request={batch_key:crypto.randomUUID(),template_id:templateSelect.value,values:sharedValues(),recipients:rows.filter(c=>selected.has(c.id)).map(c=>({id:c.id,revision:c.revision})),confirmed:true};try{pending={request,fingerprint:await requestFingerprint(request),preview:rows.filter(c=>selected.has(c.id))};sessionStorage.setItem(PENDING_KEY,JSON.stringify(pending))}catch{pending=null;saving=false;render();$('#groupSaveStatus').textContent='This browser could not keep the save safely. Your selections remain; try another browser or individual drafts.';return}}
  $('#groupSaveStatus').textContent='Saving the reviewed selection…';render();
  try{const saved=await api('/api/campaigns/group-drafts',{method:'POST',body:JSON.stringify(pending.request)});await success(saved)}catch(error){
   let saved=null,lookupError=null;try{saved=await api('/api/campaigns/batches/'+pending.request.batch_key)}catch(e){lookupError=e}
   if(saved&&saved.fingerprint===pending.fingerprint){await success(saved);return}
   if(lookupError?.status===404&&error.status>=400&&error.status<500){sessionStorage.removeItem(PENDING_KEY);pending=null;$('#groupConfirmed').checked=false;try{await load()}catch{};$('#groupSaveStatus').textContent=error.message+' Your message and selection remain; review them again.'}
   else $('#groupSaveStatus').textContent='Save status is not confirmed. The original reviewed message is kept in this tab. Retry the same save; do not start another group. '+(error.status?error.message:'');
  }finally{saving=false;if(dialog.open)render()}
 };
 function snapshot(){return JSON.stringify([templateSelect.value,[...selected].sort((a,b)=>a-b),sharedValues()])}
 async function closeComposer(){if(saving)return;if(!pending&&snapshot()!==baseline&&!await confirmTemplateChange(true))return;dialog.close()}
 dialog.querySelector(".icon").onclick=closeComposer;
 dialog.oncancel=e=>{e.preventDefault();closeComposer()};
 $('#groupPreviewRecipient').onchange=preview;$('#groupConfirmed').onchange=render;$('#showGroupExcluded').onchange=render;
 for(const id of ['groupType','groupStage','groupSearch'])$('#'+id).oninput=render;
 $('#selectGroupMatches').onclick=()=>{matched().filter(c=>c.eligible).forEach(c=>selected.add(c.id));$('#groupConfirmed').checked=false;render()};$('#clearGroupSelection').onclick=()=>{selected.clear();$('#groupConfirmed').checked=false;render()};
 templateSelect.onchange=()=>{fieldCache={...fieldCache,...sharedValues()};fields(fieldCache);$('#groupConfirmed').checked=false;render()};
 if(pending){templateSelect.value=pending.request.template_id;selected=new Set(pending.request.recipients.map(r=>r.id));fields(pending.request.values);$('#groupConfirmed').checked=true;$('#groupSaveStatus').textContent='A previous save needs confirmation. The original reviewed message is shown; retrying cannot create the same group twice.'}else fields();
 if(brokenReceipt)$('#groupSaveStatus').textContent='A previous save reference could not be read. Review Campaigns before starting another group; this tab has kept the original information.';
 baseline=snapshot();dialog.showModal();render();try{await load()}catch{$('#groupContactList').textContent='Could not load the audience. Reload or sign in again. Your pending save information is kept.'}return true
}
window.openGroupTemplateLibrary=openGroupTemplateLibrary;
await runtimeReady;
const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent='Draft for a group';button.onclick=()=>openGroupTemplateLibrary().catch(error=>notify(error.message,true));$('#campaignsView .section-actions').append(button);
if(state.todayReady)renderToday();if($('#campaignsView').classList.contains('active'))loadCampaigns().catch(error=>notify(error.message,true));
