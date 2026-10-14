const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let runtime=null;
const runtimeReady=detectRuntime();
async function detectRuntime(){const response=await fetch('/api/runtime',{credentials:'same-origin'});if(response.status===404){runtime={hosted:false,assistant:true,voice:true};return runtime}if(!response.ok)throw new Error('Unable to verify runtime. Sign in again or reload.');runtime=await response.json();return runtime}
const state = { contacts: [], tasks: [], campaigns: [], importRows: [], todayContacts: [], timeZone: 'America/New_York', todayReady: false, contactRequest: 0, contactTypes: [] };
const savedTheme = localStorage.getItem('matt-realty-theme') || 'command';
document.documentElement.dataset.theme = savedTheme;
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = v => {const day=CrmToday.day(v,state.timeZone);return day?new Date(day+'T12:00:00Z').toLocaleDateString([], {timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}):'No date chosen'};
const deskDay = () => CrmToday.day(new Date().toISOString(),state.timeZone);
const address = c => [c.street_address,c.address_line_2,c.city,[c.state,c.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ');

async function api(path, options={}) {
  await runtimeReady;
  const res = await fetch(path, {credentials:'same-origin',headers:{'Content-Type':'application/json'}, ...options});
  const data = await res.json();
  if (!res.ok) {const error=new Error(data.error || 'Something went wrong');error.status=res.status;throw error}
  return data;
}
function notify(message, bad=false){const n=$('#notice');n.textContent=message;n.className=bad?'error':'';n.style.display='block';setTimeout(()=>n.style.display='none',3500)}
function go(view){$$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'View'));$('#pageTitle').textContent={today:'Today',contacts:'Contacts',followups:'Follow-ups',campaigns:'Campaigns',assistant:'Assistant',help:'Help'}[view];if(view==='today')loadSummary().catch(e=>notify(e.message,true));if(view==='contacts')loadContacts().catch(e=>notify(e.message,true));if(view==='followups')loadTasks().catch(e=>notify(e.message,true));if(view==='campaigns')loadCampaigns().catch(e=>notify(e.message,true))}

async function loadSummary(){
 try{
  const [s,tasks,contacts,campaigns]=await Promise.all([api('/api/summary'),api('/api/tasks'),api('/api/contacts'),api('/api/campaigns')]);
  state.timeZone=s.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone;state.tasks=tasks;state.todayContacts=contacts;state.campaigns=campaigns;state.todayReady=true;populateTypeFilter(contacts);
  $('#statContacts').textContent=s.contacts;$('#statActive').textContent=s.active;
  $('#dateLabel').textContent=new Date().toLocaleDateString([], {timeZone:state.timeZone,weekday:'long',month:'long',day:'numeric'});
  $('#deskTimezone').textContent=`Dates follow ${state.timeZone.replaceAll('_',' ')}.`;
  $('#taskList').innerHTML=taskHtml(visibleTasks());renderToday();
 }catch(error){state.todayReady=false;for(const id of ['todayTasks','overdueTasks','upcomingTasks','recentContacts','todayCampaigns'])$('#'+id).textContent='Could not refresh this list. Reload to try again.';$('#statDue').textContent='—';$('#statFollowups').textContent='—';throw error}
}
function visibleTasks(){const ids=new Set(state.todayContacts.map(c=>Number(c.id)));return state.tasks.filter(t=>!t.completed_at&&(!t.contact_id||ids.has(Number(t.contact_id))))}
function populateTypeFilter(contacts){
 const select=$('#typeFilter'),current=select.value;
 state.contactTypes=[...new Set(['Prospect','Buyer','Seller','Past Client','Referral Partner','Vendor',...state.contactTypes,...contacts.map(c=>c.type).filter(Boolean),...(current?[current]:[])])].sort((a,b)=>a.localeCompare(b));
 select.innerHTML='<option value="">All relationship types</option>'+state.contactTypes.map(type=>`<option value="${esc(type)}">${esc(type)}</option>`).join('');select.value=current;
}
async function loadContacts(){
 const request=++state.contactRequest,q=encodeURIComponent($('#contactSearch').value),stage=encodeURIComponent($('#stageFilter').value),type=encodeURIComponent($('#typeFilter').value);
 let contacts=await api(`/api/contacts?q=${q}&stage=${stage}&type=${type}&archived=${$('#contactStatus').value}`);
 if(request!==state.contactRequest)return;
 populateTypeFilter(contacts);
 const ageDays=Number($('#ageFilter')?.value||'0');if(ageDays){const cutoff=CrmToday.addDays(deskDay(),-ageDays);contacts=contacts.filter(c=>{const last=String(c.last_contact_at||c.created_at||'').slice(0,10);return !last||last<=cutoff})}
 state.contacts=contacts;
 $('#contactRows').innerHTML=contacts.map(c=>`<tr data-id="${c.id}"><td><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong></td><td><span class="pill">${esc(c.stage)}</span></td><td>${esc(c.type)}</td><td>${esc(address(c)||'—')}</td><td>${date(c.next_follow_up_at)}</td><td>${esc(c.phone||c.email||'—')}</td><td><button type="button" class="ghost" data-edit="${c.id}">Edit</button> <button type="button" class="ghost" data-archive="${c.id}">${c.archived?'Restore':'Delete'}</button></td></tr>`).join('');
 $('#contactsEmpty').style.display=contacts.length?'none':'block';$$('#contactRows tr').forEach(tr=>tr.onclick=()=>openContact(state.contacts.find(c=>c.id===+tr.dataset.id)));$$('[data-edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();openContact(state.contacts.find(c=>c.id===+b.dataset.edit))});$$('[data-archive]').forEach(b=>b.onclick=e=>{e.stopPropagation();changeContactArchive(state.contacts.find(c=>c.id===+b.dataset.archive),b)});
 $('#contactsEmpty').textContent=$('#contactStatus').value==='1'?'No deleted contacts match these filters.':ageDays?`No current contacts have been quiet for ${ageDays}+ days with these filters.`:'No contacts match these filters. Add a contact or clear the filters.';
}
async function loadTasks(){await loadSummary()}
function contactLinks(id){const c=state.todayContacts.find(c=>Number(c.id)===Number(id));if(!c)return '';let out='';if(c.email)out+=`<a class="button ghost" href="mailto:${esc(c.email)}">Email</a>`;if(c.phone)out+=`<a class="button ghost" href="sms:${esc(c.phone)}">Text</a>`;return out}
function taskHtml(tasks,empty='No open reminders.'){
 return tasks.length?tasks.map(t=>`<div class="list-item"><div class="list-main"><strong>${esc(t.title)}</strong><span>${t.contact_name?esc(t.contact_name)+' · ':''}${date(t.due_at)}</span><div class="item-actions">${t.contact_id?`<button type="button" class="primary" data-open-contact="${t.contact_id}">Open contact</button>`:''}${t.contact_id?contactLinks(t.contact_id):''}<button type="button" class="${t.contact_id?'ghost':'primary'}" data-complete-task="${t.id}">Mark complete</button>${t.contact_id?`<button type="button" class="ghost" data-draft-contact="${t.contact_id}" data-reason="${esc(t.title)}">Help me draft</button>`:''}</div></div></div>`).join(''):`<p class="empty">${empty}</p>`;
}
function todayHtml(items,empty){return items.map(item=>item.kind==='task'?taskHtml([item]):`<div class="list-item"><div class="list-main"><strong>${esc(item.contact_name)}</strong><span>Contact follow-up · ${date(item.due_at)}</span><div class="item-actions"><button type="button" class="primary" data-open-contact="${item.contact_id}">Open contact</button>${contactLinks(item.contact_id)}<button type="button" class="ghost" data-complete-contact="${item.contact_id}">Mark follow-up complete</button></div></div></div>`).join('')||`<p class="empty">${empty}</p>`}
function renderToday(){
 if(!state.todayReady)return;
 const groups=CrmToday.groups(state.tasks,state.todayContacts,deskDay(),state.timeZone);
 $('#statDue').textContent=groups.today.length;$('#statFollowups').textContent=groups.overdue.length;
 $('#todayTasks').innerHTML=todayHtml(groups.today,'No follow-ups due today.');$('#overdueTasks').innerHTML=todayHtml(groups.overdue,'No overdue follow-ups.');$('#upcomingTasks').innerHTML=todayHtml(groups.upcoming,'No reminders in the next seven days.');
 $('#unscheduledPanel').hidden=!groups.unscheduled.length;$('#unscheduledTasks').innerHTML=todayHtml(groups.unscheduled,'No undated reminders.');
 $('#recentContacts').innerHTML=state.todayContacts.slice(0,5).map(c=>`<div class="list-item"><div class="list-main"><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong><span>Updated ${date(c.updated_at)}</span><button type="button" class="primary" data-open-contact="${c.id}">Open contact</button></div></div>`).join('')||'<p class="empty">No contacts yet. Add your first contact below.</p>';
 const drafts=state.campaigns.filter(c=>c.status==='Draft');$('#todayCampaigns').innerHTML=campaignGroups(drafts).map(item=>{const c=item.rows[0];return `<div class="list-item"><div class="list-main"><strong>${item.group?'Group: '+item.rows.length+' personalized drafts':esc(c.name)}</strong><span>Saved draft · ${date(c.updated_at)}</span><button type="button" class="primary" data-go="campaigns">Review drafts</button></div></div>`}).join('')||'<p class="empty">No campaign drafts awaiting review.</p>';
 renderOccasions();bindDeskActions();
}
function renderOccasions(){const list=$('#occasionList');if(!list)return;const today=deskDay();const rows=[];for(const c of state.todayContacts){if(c.archived)continue;for(const [value,kind] of [[c.birthday,'Birthday'],[c.anniversary,'Anniversary']]){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))continue;const md=value.slice(5);let date=`${today.slice(0,4)}-${md}`;if(date<today)date=`${Number(today.slice(0,4))+1}-${md}`;const days=Math.round((Date.parse(date)-Date.parse(today))/86400000);if(days<=30)rows.push({c,kind,date,days})}}rows.sort((a,b)=>a.days-b.days);list.innerHTML=rows.length?rows.map(r=>`<div class="list-item"><div class="list-main"><strong>${esc(r.c.first_name)} ${esc(r.c.last_name)}</strong><span>${r.kind} · ${new Date(r.date+'T12:00:00Z').toLocaleDateString([],{timeZone:'UTC',month:'short',day:'numeric'})}${r.days===0?' · today':''}</span></div><div class="item-actions"><button type="button" class="ghost" data-open-contact="${r.c.id}">Open contact</button></div></div>`).join(''):'<p class="empty">No birthdays or anniversaries in the next 30 days.</p>'}
function bindDeskActions(){
 $$('[data-open-contact]').forEach(b=>b.onclick=()=>{const c=state.todayContacts.find(c=>Number(c.id)===Number(b.dataset.openContact));if(c)openContact(c)});
 $$('[data-complete-task]').forEach(b=>b.onclick=()=>completeTask({target:b}));
 $$('[data-complete-contact]').forEach(b=>b.onclick=()=>completeContactFollowup(b));
 $$('[data-draft-contact]').forEach(b=>{b.hidden=!(runtime?.hosted&&runtime.assistant);b.onclick=()=>draftFollowup(Number(b.dataset.draftContact),b.dataset.reason||'')});
 $$('#todayView [data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
}
async function completeContactFollowup(button){
 if(button.disabled)return;button.disabled=true;
 try{await api(`/api/contacts/${button.dataset.completeContact}`,{method:'PATCH',body:JSON.stringify({next_follow_up_at:''})})}catch(error){notify(error.message,true);button.disabled=false;return}
 notify('Contact follow-up completed');
 if($('#modal').open&&Number($('#modalForm').dataset.id)===Number(button.dataset.completeContact)){
  const field=$('#modalForm [name="next_follow_up_at"]');if(field)field.value='';
  const saved=JSON.parse($('#modalForm').dataset.savedFields||'{}');saved.next_follow_up_at='';$('#modalForm').dataset.savedFields=JSON.stringify(saved);button.hidden=true;
 }
 try{await loadSummary()}catch{notify('Follow-up completed. Daily lists could not refresh; reload to retry.',true)}
}
async function draftFollowup(id,reason=''){
 if(!runtime?.hosted||!runtime.assistant||typeof startHostedFollowup!=='function'){notify('Draft assistance is unavailable. Your reminder is still saved.',true);return}
 go('assistant');try{await startHostedFollowup(id,reason)}catch(error){notify(error.message,true)}
}
async function completeTask(e){if(e.target.disabled)return;e.target.disabled=true;try{await api(`/api/tasks/${e.target.dataset.completeTask}`,{method:'PATCH',body:JSON.stringify({completed:true})});notify('Reminder completed');await loadSummary();if($('#modal').open&&$('#modalForm').dataset.kind==='contact'){const c=state.todayContacts.find(c=>Number(c.id)===Number($('#modalForm').dataset.id));if(c)await showContactHistory(c)}}catch(err){e.target.disabled=false;notify(err.message,true)}}
function campaignGroups(rows){
 const groups=new Map(),items=[];for(const row of rows){const group=globalThis.CampaignAudience?.parseGroupAudience(row.audience);if(!group)items.push({rows:[row],group:false});else if(groups.has(group.batch))groups.get(group.batch).rows.push(row);else{const item={rows:[row],group:true};groups.set(group.batch,item);items.push(item)}}return items;
}
function campaignCard(c){return `<article><span class="pill">${esc(c.status)}</span><h2>${esc(c.name)}</h2><p class="meta">${esc(c.channel)} · ${esc(displayAudience(c.audience))}</p><p>${esc(c.subject||'No subject yet')}</p><p class="draft-body">${esc(c.body||'No message saved yet.')}</p><div class="item-actions">${c.status==='Draft'?`<button type="button" class="primary" data-edit-draft="${c.id}">Edit draft</button>`:''}<button type="button" class="ghost" data-copy-draft="${c.id}">Create a copy</button></div></article>`}
async function loadCampaigns(){
 state.campaigns=await api('/api/campaigns');$('#campaignList').innerHTML=state.campaigns.length?campaignGroups(state.campaigns).map(item=>item.group?`<details class="campaign-group"><summary><strong>Group drafts · ${item.rows.length} personalized messages</strong><span class="muted">Created ${date(item.rows[0].created_at)} · expand to review or edit each draft</span></summary><div class="cards">${item.rows.map(campaignCard).join('')}</div></details>`:campaignCard(item.rows[0])).join(''):'<div class="panel empty">No campaign drafts yet. Start with one useful monthly update.</div>';
 $$('[data-edit-draft]').forEach(b=>b.onclick=()=>openCampaignEditor(state.campaigns.find(c=>Number(c.id)===Number(b.dataset.editDraft)), 'Edit draft'));
 $$('[data-copy-draft]').forEach(b=>b.onclick=()=>{const draft=state.campaigns.find(c=>Number(c.id)===Number(b.dataset.copyDraft));openCampaignEditor({...draft,id:'',audience:detachGroupAudience(draft.audience),name:copyDraftName(draft.name)},'Create a copy')});
}
function displayAudience(value){return globalThis.CampaignAudience?.audienceLabel(value)||value}
function detachGroupAudience(value){return globalThis.CampaignAudience?.individualAudience(value)||value}
function copyDraftName(name){return String(name||'Draft').slice(0,193)+' (copy)'}
function buildAiDraft(answer,seed={}){
 return {id:seed.id||'',name:seed.name||'Assistant message draft',subject:seed.subject||'',body:answer,channel:seed.channel||'Email',audience:seed.audience||'Individual draft — review recipient and permission',updated_at:seed.updated_at||''};
}
function openCampaignEditor(values,title='Review and save draft'){
 openModal('campaign',title,values);if(globalThis.CampaignAudience?.parseGroupAudience(values.audience)&&values.id){const audience=$('#modalForm [name="audience"]');audience.disabled=true;$('#modalForm [name="channel"]').disabled=true;audience.selectedOptions[0].textContent=displayAudience(values.audience)}$('#modalForm').dataset.aiReview=values.fromAssistant?'1':'';
 const actions=document.createElement('div');actions.className='item-actions';
 if(values.id){const copy=document.createElement('button');copy.type='button';copy.className='ghost';copy.textContent='Make a new copy';copy.onclick=()=>{const current=Object.fromEntries(new FormData($('#modalForm')).entries());openCampaignEditor({...values,...current,id:'',audience:detachGroupAudience(current.audience||values.audience),name:copyDraftName(current.name),fromAssistant:$('#modalForm').dataset.aiReview==='1'},'Review new copy')};actions.append(copy)}
 if(runtime?.hosted&&runtime.assistant){
  const polish=document.createElement('button');polish.type='button';polish.className='ghost';polish.textContent='Polish with Campaign Writer';actions.append(polish);
  polish.onclick=async()=>{
   const form=$('#modalForm'),current=Object.fromEntries(new FormData(form).entries());
   const seed={...values,...current,id:form.dataset.id?Number(form.dataset.id):'',updated_at:form.dataset.updatedAt||''};
   const controls=$$('#modalForm input,#modalForm select,#modalForm textarea,#modalForm button').map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);$('#modal').oncancel=e=>e.preventDefault();
   try{await startHostedCampaign(current,null,seed);$('#modal').close();go('assistant')}catch(error){notify(error.message,true)}finally{$('#modal').oncancel=null;controls.forEach(([control,disabled])=>control.disabled=disabled)}
  };
 }
 if(!globalThis.CampaignAudience?.parseGroupAudience(values.audience)){
  const openEmail=document.createElement('button');openEmail.type='button';openEmail.className='ghost';openEmail.textContent='Open in email app';
  openEmail.onclick=()=>{const cur=Object.fromEntries(new FormData($('#modalForm')).entries());if(cur.channel!=='Email'){notify('Open in email app works for Email drafts');return}const subject=encodeURIComponent(cur.subject||cur.name||'');const body=encodeURIComponent(String(cur.body||'').replace(/\n/g,'\r\n'));window.location.href=`mailto:?subject=${subject}&body=${body}`};
  actions.append(openEmail);
 }
 if(actions.children.length)$('#modalFields').append(actions);
 const hint=document.createElement('p');hint.className='muted';hint.textContent=values.id?'Saving replaces this draft only. Recipient information stays as shown; verify permission before using the message.':'Saving creates a new draft. Nothing is sent.';$('#modalFields').append(hint);
}

const fields = {
  contact: `<div class="form-grid"><div class="field"><label>First name *</label><input name="first_name" required></div><div class="field"><label>Last name</label><input name="last_name"></div><div class="field"><label>Phone</label><input name="phone"></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field full"><label>Street address</label><input name="street_address" autocomplete="street-address"></div><div class="field full"><label>Apartment, suite, or unit</label><input name="address_line_2"></div><div class="field"><label>City</label><input name="city" autocomplete="address-level2"></div><div class="field"><label>State</label><input name="state" autocomplete="address-level1"></div><div class="field"><label>ZIP code</label><input name="postal_code" inputmode="numeric" autocomplete="postal-code"></div><div class="field"><label>Relationship</label><select name="type"><option>Prospect</option><option>Buyer</option><option>Seller</option><option>Past Client</option><option>Referral Partner</option><option>Vendor</option></select></div><div class="field"><label>Stage</label><select name="stage"><option>New</option><option>Nurturing</option><option>Active</option><option>Under Contract</option><option>Closed</option><option>Inactive</option></select></div><div class="field"><label>How they found Matt</label><input name="source"></div><div class="field"><label>Birthday</label><input name="birthday" type="date"></div><div class="field"><label>Anniversary</label><input name="anniversary" type="date"></div><div class="field"><label>Next follow-up</label><input name="next_follow_up_at" type="date"></div><div class="field full"><label>Email permission</label><select name="email_permission"><option>Not asked</option><option>Subscribed</option><option>Unsubscribed</option></select></div><div class="field full"><label>Notes</label><textarea name="notes" rows="4"></textarea></div></div>`,
  lead: `<div class="form-grid"><div class="field"><label>First name *</label><input name="first_name" required></div><div class="field"><label>Last name</label><input name="last_name"></div><div class="field"><label>Phone</label><input name="phone"></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field"><label>Where from? *</label><select name="source"><option>Sign call</option><option>Open house</option><option>Zillow</option><option>Realtor.com</option><option>Referral</option><option>Website</option><option>Facebook</option><option>Other</option></select></div><div class="field"><label>Relationship</label><select name="type"><option>Prospect</option><option>Buyer</option><option>Seller</option></select></div><div class="field full"><label>Quick note (optional)</label><textarea name="lead_note" rows="2"></textarea></div><div class="field full"><label>First follow-up *</label><input name="due_at" type="date"></div></div>`,
  task: `<div class="form-grid"><div class="field full"><label>What needs doing? *</label><input name="title" required></div><div class="field"><label>Due date</label><input name="due_at" type="date"></div><div class="field"><label>Priority</label><select name="priority"><option>Normal</option><option>High</option><option>Low</option></select></div><div class="field full"><label>Contact (optional)</label><select name="contact_id"><option value="">No contact</option></select></div></div>`,
  campaign: `<div class="form-grid"><div class="field full"><label>Draft name *</label><input name="name" required maxlength="200" placeholder="October homeowner update"></div><div class="field"><label>Channel</label><select name="channel"><option>Email</option><option>Postal mail</option><option>Phone list</option><option>Social draft</option></select></div><div class="field"><label>Audience</label><select name="audience"><option>All opted-in contacts</option><option>Active buyers</option><option>Active sellers</option><option>Past clients</option><option>Referral partners</option></select></div><div class="field full"><label>Subject or title</label><input name="subject" maxlength="300"></div><div class="field full"><label>Draft message</label><textarea name="body" rows="7" maxlength="20000"></textarea></div></div>`,
  import: `<div class="import-help"><strong>Use the file you already have.</strong><br>Choose an iPhone vCard (.vcf) or a CSV from Excel, Outlook, Google, or another contact app.</div><div class="field"><label>Contact file</label><input id="contactFile" name="contact_file" type="file" accept=".csv,.vcf,text/csv,text/vcard" required></div><div id="importPreview" class="import-preview">No file selected.</div><p class="muted">Only identical active records are skipped. People sharing an email or phone are kept. Reimporting changed records may add another entry. Imported contacts start as “New,” with email permission set to “Not asked.”</p>`
};
function openModal(kind,title,values={}){$('#deleteContact').hidden=true;$('#modalTitle').textContent=title;$('#modalFields').innerHTML=fields[kind];$('#modalForm').dataset.kind=kind;$('#modalForm').dataset.id=values.id||'';$('#modalForm').dataset.aiReview='';$('#modalForm').dataset.updatedAt=kind==='campaign'&&values.id?values.updated_at||'':'';for(const [k,v] of Object.entries(values)){const el=$(`#modalForm [name="${k}"]`);if(el){if(el.tagName==='SELECT'&&v&&!Array.from(el.options).some(o=>o.value===v))el.add(new Option(v,v));el.value=k==='next_follow_up_at'&&v?String(v).slice(0,10):(v??'')}}if(kind==='task'){setupQuickDates();const select=$('#modalForm [name="contact_id"]');api('/api/contacts').then(cs=>{if(!select.isConnected)return;select.innerHTML='<option value="">No contact</option>'+cs.map(c=>`<option value="${c.id}">${esc(c.first_name)} ${esc(c.last_name)}</option>`).join('');select.value=values.contact_id||''}).catch(err=>notify(err.message,true))}if(kind==='lead'){setupQuickDates();$('#modalForm [name="due_at"]').value=CrmToday.addDays(deskDay(),1)}if(kind==='import'){$('#saveModal').textContent='Import contacts';state.importRows=[];$('#contactFile').onchange=readContactFile}else{$('#saveModal').textContent='Save'}$('#modal').showModal()}
function setupQuickDates(){
 const input=$('#modalForm [name="due_at"]');input.value=deskDay();input.required=true;
 const buttons=document.createElement('div');buttons.className='item-actions';buttons.innerHTML='<button type="button" class="ghost" data-date-offset="0">Today</button><button type="button" class="ghost" data-date-offset="1">Tomorrow</button><button type="button" class="ghost" data-date-offset="7">In one week</button><button type="button" class="ghost" id="chooseReminderDate">Choose a date</button>';input.parentElement.append(buttons);
 $$('[data-date-offset]').forEach(b=>b.onclick=()=>input.value=CrmToday.addDays(deskDay(),Number(b.dataset.dateOffset)));$('#chooseReminderDate').onclick=()=>{input.focus();input.showPicker?.()};
}
function openContact(c){
 openModal('contact',`${c.first_name} ${c.last_name||''}`,c);
 const button=$('#deleteContact');button.hidden=false;button.textContent=c.archived?'Restore contact':'Delete contact';button.onclick=()=>changeContactArchive(c,button);
 const actions=document.createElement('section');actions.className='contact-actions';actions.innerHTML=`<h3>Contact actions</h3><div class="item-actions"><button type="button" class="primary" id="contactAddNote">Add a note</button><button type="button" class="ghost" id="contactFollowup">Schedule a follow-up</button><button type="button" class="ghost" id="contactHistory">View contact history</button>${runtime?.hosted&&runtime.assistant?'<button type="button" class="ghost" id="contactDraft">Help me draft a follow-up</button>':''}</div><div class="item-actions" id="contactShortcuts"></div><div id="contactActionBody" aria-live="polite"></div>`;
 $('#modalFields').prepend(actions);
 const shortcuts=$('#contactShortcuts');for(const [value,prefix,label] of [[c.phone,'tel:','Call'],[c.phone,'sms:','Text'],[c.email,'mailto:','Email']])if(value){const link=document.createElement('a');link.className='button ghost';link.href=prefix+encodeURIComponent(value);link.textContent=label;shortcuts.append(link)}
 $('#modalForm').dataset.savedFields=JSON.stringify(Object.fromEntries(new FormData($('#modalForm')).entries()));
 if(c.next_follow_up_at&&!c.archived){const complete=document.createElement('button');complete.type='button';complete.className='ghost';complete.textContent='Mark follow-up complete';complete.dataset.completeContact=c.id;actions.querySelector('.item-actions').append(complete);bindDeskActions()}
 $('#contactAddNote').onclick=()=>showContactNote(c);
 $('#contactFollowup').disabled=!!c.archived;$('#contactFollowup').onclick=()=>leaveContactFor(()=>openModal('task',`Follow up with ${c.first_name}`,{contact_id:c.id}));
 $('#contactHistory').onclick=()=>showContactHistory(c);
 if($('#contactDraft')){$('#contactDraft').disabled=!!c.archived;$('#contactDraft').onclick=()=>leaveContactFor(()=>{$('#modal').close();draftFollowup(c.id)})}
}
async function showContactHistory(c){
 const body=$('#contactActionBody');body.textContent='Loading history…';try{const history=await api(`/api/contacts/${c.id}/activity`);if(!body.isConnected)return;body.innerHTML=`<h3>Saved contact history</h3>${c.notes?`<p><strong>Contact notes</strong><br>${esc(c.notes).replace(/\n/g,'<br>')}</p>`:''}`+history.map(a=>`<article><strong>${esc(a.kind)} · ${date(a.occurred_at)}</strong><p>${esc(a.summary).replace(/\n/g,'<br>')}</p></article>`).join('')+(history.length||c.notes?'':'<p>No notes or activity saved yet.</p>');const tasks=visibleTasks().filter(t=>Number(t.contact_id)===Number(c.id));body.innerHTML+='<h3>Open reminders</h3>'+taskHtml(tasks);bindDeskActions()}catch(error){if(body.isConnected)body.textContent='History could not load. Try View contact history again.'}
}
function showContactNote(c){
 const body=$('#contactActionBody');body.innerHTML='<label for="newContactNote">What would you like to remember?</label><textarea id="newContactNote" rows="3" maxlength="5000"></textarea><button type="button" class="primary" id="saveContactNote">Save note</button>';
 $('#newContactNote').focus();$('#saveContactNote').onclick=e=>saveContactNote(c,e.target,$('#newContactNote'));
}
async function saveContactNote(c,button,input){
 const summary=input.value.trim();if(!summary){input.focus();return}if(button.disabled)return;button.disabled=true;
 try{await api(`/api/contacts/${c.id}/activity`,{method:'POST',body:JSON.stringify({kind:'Note',summary})})}catch(error){notify(error.message,true);button.disabled=false;return}
 input.value='';notify('Note saved');await showContactHistory(c);
 try{await loadSummary()}catch{notify('Note saved. The daily lists could not refresh; reload to retry.',true)}
}
async function leaveContactFor(action){
 const form=$('#modalForm'),current=JSON.stringify(Object.fromEntries(new FormData(form).entries()));
 if(current!==form.dataset.savedFields||$('#newContactNote')?.value?.trim()){
  const dialog=$('#unsavedConfirm');const leave=await new Promise(resolve=>{const finish=value=>{dialog.oncancel=null;dialog.close();resolve(value)};$('#keepEditingContact').onclick=()=>finish(false);$('#leaveContact').onclick=()=>finish(true);dialog.oncancel=e=>{e.preventDefault();finish(false)};dialog.showModal();$('#keepEditingContact').focus()});
  if(!leave)return;
 }
 action();
}
function confirmContactDeletion(contact){
  const dialog=$('#deleteConfirm');
  $('#deleteConfirmText').textContent=`Remove ${contact.first_name} ${contact.last_name||''} from current contacts? You can restore them from Deleted contacts. Notes and reminders are kept.`;
  return new Promise(resolve=>{
    const finish=value=>{dialog.oncancel=null;dialog.close();resolve(value)};
    $('#keepContact').onclick=()=>finish(false);
    $('#confirmDeleteContact').onclick=()=>finish(true);
    dialog.oncancel=e=>{e.preventDefault();finish(false)};
    dialog.showModal();$('#keepContact').focus();
  });
}
async function changeContactArchive(contact,button){
  const archived=contact.archived?0:1;
  if(button.disabled)return;
  button.disabled=true;
  if(archived&&!await confirmContactDeletion(contact)){button.disabled=false;return;}
  button.disabled=true;
  try{
    await api(`/api/contacts/${contact.id}`,{method:'PATCH',body:JSON.stringify({archived})});
    if($('#modal').open)$('#modal').close();
    notify(archived?'Contact moved to Deleted contacts':'Contact restored');
    await Promise.all([loadSummary(),loadContacts()]);
  }catch(error){notify(error.message,true)}finally{button.disabled=false}
}
async function saveModal(e){
 e.preventDefault();const button=$('#saveModal');if(button.disabled)return;
 const data=Object.fromEntries(new FormData(e.target).entries()),kind=e.target.dataset.kind,id=e.target.dataset.id;
 if(kind==='campaign'&&id&&e.target.dataset.updatedAt)data.expected_updated_at=e.target.dataset.updatedAt;
 const aiReview=e.target.dataset.aiReview==='1';
 const controls=$$('#modalForm input,#modalForm select,#modalForm textarea,#modalForm button').map(control=>[control,control.disabled]);button.disabled=true;controls.forEach(([control])=>control.disabled=true);
 const modal=$('#modal');modal.oncancel=event=>event.preventDefault();
 let result,savedCampaign;
 try{
  if(kind==='contact')await api(id?`/api/contacts/${id}`:'/api/contacts',{method:id?'PATCH':'POST',body:JSON.stringify(data)});
  if(kind==='task')await api('/api/tasks',{method:'POST',body:JSON.stringify(data)});
  if(kind==='lead'){const created=await api('/api/contacts',{method:'POST',body:JSON.stringify({first_name:data.first_name,last_name:data.last_name,phone:data.phone,email:data.email,source:data.source,type:data.type})});await api('/api/tasks',{method:'POST',body:JSON.stringify({contact_id:created.id,title:`Reach out to ${[data.first_name,data.last_name].filter(Boolean).join(' ')}`,due_at:data.due_at})});if(data.lead_note)await api(`/api/contacts/${created.id}/activity`,{method:'POST',body:JSON.stringify({kind:'Note',summary:data.lead_note})});result=created}
  if(kind==='campaign')savedCampaign=await api(id?`/api/campaigns/${id}`:'/api/campaigns',{method:id?'PATCH':'POST',body:JSON.stringify(data)});
  if(kind==='import'){if(!state.importRows.length)throw new Error('Choose a contact file first');result=await api('/api/import/contacts',{method:'POST',body:JSON.stringify({contacts:state.importRows})})}
 }catch(error){notify(error.message,true);return}
 finally{modal.oncancel=null;controls.forEach(([control,disabled])=>control.disabled=disabled);button.disabled=false}
 notify(kind==='lead'?'Lead saved with a first follow-up':result&&kind==='import'?`${result.imported} imported · ${result.duplicates_skipped} duplicates skipped`:'Saved');modal.close();
 try{if(aiReview&&savedCampaign&&typeof onCampaignSaved==='function')onCampaignSaved(savedCampaign);await Promise.all([loadSummary(),loadContacts(),loadCampaigns()])}catch{notify('Saved. Some lists could not refresh; reload to retry.',true)}
}
function parseCSV(text){
  const lines=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))lines.push(row);row=[];field=''}else field+=c}row.push(field);if(row.some(x=>x.trim()))lines.push(row);if(lines.length<2)return[];
  const headers=lines[0].map(h=>h.trim().toLowerCase().replace(/^\ufeff/,''));
  const pick=(obj,names)=>{for(const n of names){const i=headers.indexOf(n);if(i>=0&&obj[i]?.trim())return obj[i].trim()}return''};
  return lines.slice(1).map(r=>{let first=pick(r,['first name','given name','firstname','first']);let last=pick(r,['last name','family name','surname','lastname','last']);const full=pick(r,['name','full name','display name']);if(!first&&full){const parts=full.trim().split(/\s+/);first=parts.shift()||'';last=parts.join(' ')}return{first_name:first,last_name:last,email:pick(r,['email','e-mail address','email address','e-mail 1 - value','email 1 - value']),phone:pick(r,['phone','mobile phone','phone number','phone 1 - value','primary phone','business phone']),street_address:pick(r,['street address','address','address 1','address line 1','street','home address']),address_line_2:pick(r,['address 2','address line 2','apartment','apt','suite','unit']),city:pick(r,['city','home city']),state:pick(r,['state','province','region','home state']),postal_code:pick(r,['zip','zip code','zipcode','postal code','postcode']),type:pick(r,['type','relationship','contact type']),source:pick(r,['source','lead source']),notes:pick(r,['notes','note','comments'])}}).filter(c=>c.first_name);
}
function vcardValue(block,key){const line=block.split('\n').find(l=>l.split(':')[0].toUpperCase().split(';')[0]===key);return line?line.slice(line.indexOf(':')+1).replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1').trim():''}
function parseVCard(text){const unfolded=text.replace(/\r\n[ \t]/g,'').replace(/\r/g,'\n');return unfolded.split(/BEGIN:VCARD/i).slice(1).map(block=>{const n=vcardValue(block,'N').split(';');const full=vcardValue(block,'FN');let first=n[1]||'',last=n[0]||'';if(!first&&full){const p=full.split(/\s+/);first=p.shift()||'';last=p.join(' ')}const org=vcardValue(block,'ORG');const adr=vcardValue(block,'ADR').split(';');return{first_name:first,last_name:last,email:vcardValue(block,'EMAIL'),phone:vcardValue(block,'TEL'),street_address:adr[2]||'',address_line_2:adr[1]||'',city:adr[3]||'',state:adr[4]||'',postal_code:adr[5]||'',notes:[vcardValue(block,'NOTE'),org?`Organization: ${org}`:''].filter(Boolean).join('\n'),source:'iPhone / vCard'}}).filter(c=>c.first_name)}
async function readContactFile(e){const file=e.target.files[0];if(!file)return;const text=await file.text();state.importRows=file.name.toLowerCase().endsWith('.vcf')||/BEGIN:VCARD/i.test(text)?parseVCard(text):parseCSV(text);$('#importPreview').innerHTML=state.importRows.length?`<strong>${state.importRows.length} contacts ready</strong><br>${esc(state.importRows.slice(0,3).map(c=>`${c.first_name} ${c.last_name}`.trim()).join(', '))}${state.importRows.length>3?'…':''}`:'No usable contacts found. Make sure the first CSV row contains column names.'}

$('#dateLabel').textContent=new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'});
$$('.nav').forEach(b=>b.onclick=()=>go(b.dataset.view));$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
$('#addContactTop').onclick=$('#quickContact').onclick=()=>openModal('contact','Add contact');$('#quickTask').onclick=$('#addTask').onclick=()=>openModal('task','Add reminder');$('#addCampaign').onclick=()=>openModal('campaign','New campaign draft');$('#quickLeadTop').onclick=()=>openModal('lead','Quick lead');
$('#importContacts').onclick=()=>openModal('import','Import contacts');
$('#closeModal').onclick=$('#cancelModal').onclick=()=>$('#modal').close();$('#modalForm').onsubmit=saveModal;$('#contactSearch').oninput=()=>loadContacts().catch(e=>notify(e.message,true));$('#stageFilter').onchange=$('#typeFilter').onchange=$('#ageFilter').onchange=()=>loadContacts().catch(e=>notify(e.message,true));
$('#backupNow').onclick=async()=>{try{const snapshot=await api('/api/backup',{method:'POST',body:'{}'});if(runtime.hosted){const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='realty-desk-snapshot-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Full snapshot downloaded. Keep a private copy.')}else notify('Backup created')}catch(e){notify(e.message,true)}};
async function revealFeedLink(rotate=false){try{if(rotate&&!window.confirm('Create a new private feed link? The old link stops working.'))return;const r=await api('/api/calendar/token',{method:'POST',body:JSON.stringify({rotate})});const url=`${location.origin}/api/calendar.ics?token=${r.token}`;$('#feedUrl').textContent=url;$('#feedUrlWrap').hidden=false;try{await navigator.clipboard.writeText(url);notify('Feed link copied')}catch{notify('Feed link shown below')}}catch(e){notify(e.message,true)}}
$('#showFeedUrl').onclick=()=>revealFeedLink(false);$('#rotateFeedToken').onclick=()=>revealFeedLink(true);
$('#downloadIcs').onclick=async()=>{try{const response=await fetch('/api/calendar.ics');if(!response.ok)throw new Error('Calendar file could not load');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='realty-desk-'+new Date().toISOString().slice(0,10)+'.ics';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Calendar file downloaded')}catch(e){notify(e.message,true)}};
function confidenceText(value){return typeof value==='number'?`Needle confidence: ${Math.round(value*100)}%`:''}
const assistantModes={general:{name:'General Assistant',note:'Talk through ideas and plans with the stronger local discussion model.',placeholder:'Ask a question or talk through an idea.'},coach:{name:'Follow-up Coach',note:'Prepare a call, work through an objection, or choose a respectful next step.',placeholder:'Example: How should I follow up with a buyer who has gone quiet?'},marketing:{name:'Marketing Writer',note:'Create warm, credible copy that stays as a draft until you review it.',placeholder:'Example: Draft a friendly open-house follow-up text.'},crm:{name:'CRM Actions',note:'Find contacts or prepare contacts and reminders. Changes always require confirmation.',placeholder:'Example: Remind me Friday to call Susan Miller.'}};
let assistantMode=localStorage.getItem('matt-realty-assistant-mode')||'general';if(!assistantModes[assistantMode])assistantMode='general';
const assistantHistory={general:[],coach:[],marketing:[]};
let replyAudio=null,replyAudioUrl='';
const speakReplies=$('#speakReplies');speakReplies.checked=localStorage.getItem('matt-realty-speak-replies')!=='false';speakReplies.onchange=()=>{localStorage.setItem('matt-realty-speak-replies',String(speakReplies.checked));if(!speakReplies.checked&&replyAudio)replyAudio.pause()};
async function speakAnswer(text){await runtimeReady;if(!runtime.voice)return;if(!speakReplies.checked||!text)return;try{if(replyAudio)replyAudio.pause();if(replyAudioUrl)URL.revokeObjectURL(replyAudioUrl);const response=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Spoken replies are unavailable')}replyAudioUrl=URL.createObjectURL(await response.blob());replyAudio=new Audio(replyAudioUrl);await replyAudio.play()}catch(err){speakReplies.checked=false;localStorage.setItem('matt-realty-speak-replies','false');notify(err.message,true)}}
function renderDiscussion(mode){const history=assistantHistory[mode]||[];$('#assistantAnswer').innerHTML=history.length?history.map(item=>`<div class="chat-turn ${item.role}"><strong>${item.role==='user'?'You':esc(assistantModes[mode].name)}</strong>${esc(item.content).replace(/\n/g,'<br>')}</div>`).join(''):'Start a new local conversation by speaking or typing.'}
function selectAssistantMode(mode){if(!assistantModes[mode])return;assistantMode=mode;localStorage.setItem('matt-realty-assistant-mode',mode);const config=assistantModes[mode];$$('[data-assistant-mode]').forEach(button=>{const selected=button.dataset.assistantMode===mode;button.classList.toggle('selected',selected);button.setAttribute('aria-checked',String(selected))});$('#assistantModeNote').textContent=config.note;$('#assistantPrompt').placeholder=config.placeholder;$('#assistantSubmit').textContent=mode==='crm'?'Understand CRM request':`Ask ${config.name}`;if(mode==='crm')$('#assistantAnswer').textContent='CRM changes appear here for confirmation before anything is saved.';else renderDiscussion(mode);voiceUi('idle',`Ready for ${config.name}. Hold to talk, or tap once to start.`)}
async function confirmCommand(token,button){button.disabled=true;button.textContent='Working…';try{const result=await api('/api/command/execute',{method:'POST',body:JSON.stringify({token})});$('#assistantAnswer').innerHTML=`<div class="command-card"><strong>${esc(result.message)}</strong><span class="muted">Completed after your confirmation.</span></div>`;notify(result.message);await Promise.all([loadSummary(),loadTasks(),loadContacts()])}catch(err){button.disabled=false;button.textContent='Confirm and do it';notify(err.message,true)}}
function renderCommand(result){const confidence=confidenceText(result.confidence);if(result.kind==='confirmation'){const box=$('#assistantAnswer');box.innerHTML=`<div class="command-card"><strong>${esc(result.preview)}</strong><span class="muted">Review this carefully. Nothing has changed yet.</span><br><button class="primary" id="confirmCommand" type="button">Confirm and do it</button>${confidence?`<div class="confidence">${esc(confidence)}</div>`:''}</div>`;$('#confirmCommand').onclick=e=>confirmCommand(result.token,e.currentTarget);return}if(result.kind==='search'){const items=result.results.map(c=>`<div class="command-contact"><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong><span class="muted">${esc(c.type)} · ${esc(c.stage)}${c.phone?' · '+esc(c.phone):''}${c.email?' · '+esc(c.email):''}${address(c)?' · '+esc(address(c)):''}</span></div>`).join('');$('#assistantAnswer').innerHTML=`<div class="command-card"><strong>${result.results.length} contact${result.results.length===1?'':'s'} found</strong>${items||'<span class="muted">No matching contacts.</span>'}${confidence?`<div class="confidence">${esc(confidence)}</div>`:''}</div>`;return}if(result.kind==='answer'){$('#assistantAnswer').textContent=result.answer;return}$('#assistantAnswer').textContent=result.message||'I could not match that request to a safe action.'}
async function runAssistant(prompt){await runtimeReady;if(!runtime.assistant)return;prompt=String(prompt||'').trim();if(!prompt)return;$('#assistantPrompt').value=prompt;const mode=assistantMode,config=assistantModes[mode],history=mode==='crm'?[]:[...(assistantHistory[mode]||[])];$('#assistantAnswer').textContent=mode==='crm'?'Needle is understanding the CRM request…':`${config.name} is thinking locally…`;try{const result=await api('/api/command/interpret',{method:'POST',body:JSON.stringify({prompt,mode,history})});if(mode!=='crm'&&result.kind==='answer'){assistantHistory[mode].push({role:'user',content:prompt},{role:'assistant',content:result.answer});assistantHistory[mode]=assistantHistory[mode].slice(-12);renderDiscussion(mode)}else renderCommand(result);const spoken=result.kind==='answer'?result.answer:result.kind==='confirmation'?`${result.preview}. Please review and confirm.`:result.kind==='search'?`I found ${result.results.length} matching contacts.`:result.message;await speakAnswer(spoken)}catch(err){$('#assistantAnswer').textContent=err.message;throw err}}
$('#assistantForm').onsubmit=async e=>{e.preventDefault();try{await runAssistant($('#assistantPrompt').value)}catch{}};
let voiceRecorder=null,voiceStream=null,voiceChunks=[],voiceTimer=null,voiceBusy=false;
function voiceUi(mode,message){const button=$('#voiceCommand');button.classList.toggle('recording',mode==='recording');button.disabled=mode==='processing';button.setAttribute('aria-pressed',String(mode==='recording'));button.textContent=mode==='recording'?'■ Stop and send':mode==='processing'?'⏳ Transcribing…':`🎙 Speak to ${assistantModes[assistantMode].name}`;$('#voiceStatus').textContent=message}
function stopVoiceTracks(){clearTimeout(voiceTimer);voiceTimer=null;if(voiceStream){voiceStream.getTracks().forEach(track=>track.stop());voiceStream=null}}
async function finishVoice(){if(!voiceChunks.length){voiceBusy=false;stopVoiceTracks();voiceUi('idle','No recording was captured. Please try again.');return}voiceUi('processing','Step 1 of 2: transcribing your recording locally…');const blob=new Blob(voiceChunks,{type:voiceRecorder?.mimeType||'audio/webm'});voiceChunks=[];stopVoiceTracks();try{const res=await fetch('/api/voice/transcribe',{method:'POST',headers:{'Content-Type':blob.type||'audio/webm'},body:blob});const data=await res.json();if(!res.ok)throw new Error(data.error||'Voice transcription failed');$('#assistantPrompt').value=data.transcript;voiceUi('processing',`Step 2 of 2: understood “${data.transcript}” in ${data.transcription_seconds}s. Preparing the result…`);await runAssistant(data.transcript);voiceUi('idle',`Completed. Voice recognition took ${data.transcription_seconds}s.`)}catch(err){voiceUi('idle',err.message);notify(err.message,true)}finally{voiceBusy=false}}
async function toggleVoice(){await runtimeReady;if(!runtime.voice)return;if(voiceBusy)return;if(voiceRecorder?.state==='recording'){voiceRecorder.stop();return}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){voiceUi('idle','This browser cannot record audio. Use typed requests or Super+H dictation.');return}try{voiceStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));voiceChunks=[];voiceRecorder=new MediaRecorder(voiceStream,preferred?{mimeType:preferred}:undefined);voiceRecorder.ondataavailable=e=>{if(e.data.size)voiceChunks.push(e.data)};voiceRecorder.onstop=()=>{voiceBusy=true;finishVoice()};voiceRecorder.onerror=()=>{voiceBusy=false;stopVoiceTracks();voiceUi('idle','The microphone recording failed. Please try again.')};voiceRecorder.start();voiceUi('recording','Listening… speak your request, then press Stop and send.');voiceTimer=setTimeout(()=>{if(voiceRecorder?.state==='recording')voiceRecorder.stop()},45000)}catch(err){stopVoiceTracks();voiceUi('idle',err.name==='NotAllowedError'?'Microphone permission was denied. Allow it for Realty Desk and try again.':'Could not open the microphone.');notify('Could not open the microphone',true)}}
let voicePressStarted=0;
const voiceButton=$('#voiceCommand');
$$('[data-assistant-mode]').forEach(button=>button.onclick=()=>selectAssistantMode(button.dataset.assistantMode));selectAssistantMode(assistantMode);
$('#newAssistantConversation').onclick=()=>{if(assistantMode!=='crm')assistantHistory[assistantMode]=[];$('#assistantPrompt').value='';selectAssistantMode(assistantMode)};
voiceButton.onpointerdown=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;voicePressStarted=performance.now();voiceButton.setPointerCapture?.(e.pointerId);toggleVoice()};
voiceButton.onpointerup=()=>{const held=performance.now()-voicePressStarted;voicePressStarted=0;if(held>=450&&voiceRecorder?.state==='recording')voiceRecorder.stop()};
voiceButton.onpointercancel=()=>{voicePressStarted=0;if(voiceRecorder?.state==='recording')voiceRecorder.stop()};
voiceButton.onclick=e=>{if(e.detail===0)toggleVoice()};
$$('[data-command-example]').forEach(button=>button.onclick=()=>{$('#assistantPrompt').value=button.dataset.commandExample;$('#assistantPrompt').focus()});
$$('[data-theme-choice]').forEach(button=>{button.classList.toggle('selected',button.dataset.themeChoice===savedTheme);button.onclick=()=>{const theme=button.dataset.themeChoice;document.documentElement.dataset.theme=theme;localStorage.setItem('matt-realty-theme',theme);$$('[data-theme-choice]').forEach(b=>b.classList.toggle('selected',b===button));notify('Color scheme updated')}});

function registerWebMCP(){if(!runtime||runtime.hosted)return;const mc=document.modelContext;if(!mc?.registerTool)return;const tools=[{name:'list_open_followups',title:'List open follow-ups',description:'Read Matt Realty Desk open reminders.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>({followups:await api('/api/tasks')})},{name:'create_followup',title:'Create follow-up',description:'Create a follow-up reminder in Matt Realty Desk.',inputSchema:{type:'object',properties:{title:{type:'string'},due_at:{type:'string',description:'Date in YYYY-MM-DD format'}},required:['title'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input)=>{if(!input||typeof input.title!=='string'||!input.title.trim())throw new Error('title is required');const task=await api('/api/tasks',{method:'POST',body:JSON.stringify(input)});await loadSummary();return {id:task.id,status:'created'}}}];for(const tool of tools){try{Promise.resolve(mc.registerTool(tool)).catch(()=>{})}catch{}}}
function applyRuntime(){
if(!runtime.hosted)return;
$('.system-label').textContent='HOSTED DEMO';$('.sidebar-foot .privacy').textContent='Private contact data';$('.status-chip').textContent='Hosted demo';
$('#contactsEmpty').textContent='No contacts yet. Add your first contact.';
$('#helpStorage').innerHTML='<li>Demo records are stored in Cloudflare D1 behind private sign-in.</li><li>Download a full JSON snapshot of contacts, reminders, activity and campaign drafts. D1 Time Travel provides database recovery.</li><li>Keep snapshots privately off Cloudflare. There is no automatic off-machine sync.</li><li>Email sending is off. Campaigns remain drafts.</li><li>Export CSV includes contacts only, not a full backup.</li>';
$('#backupNow').textContent='Download full snapshot';$$('.local-only').forEach(el=>el.hidden=true);
$('#assistantView .eyebrow').textContent='Optional assistant';$('#assistantView h2').textContent='Assistant unavailable in this hosted demo';$('#assistantModeNote').textContent='Local AI and voice need the local computer. Contacts, reminders and campaign drafts work here without them.';$('#assistantAnswer').textContent='Use Contacts to edit people, Follow-ups to set reminders, and Campaigns to write drafts. Nothing sends email.';$$('#assistantView button, #assistantView textarea, #assistantView input').forEach(el=>el.disabled=true);$('#voiceStatus').textContent='Local AI and voice are unavailable in the hosted demo.';

}
async function start(){await runtimeReady;applyRuntime();registerWebMCP();const requestedView=new URLSearchParams(location.search).get('view');if(['today','contacts','followups','campaigns','assistant','help'].includes(requestedView))go(requestedView);await loadSummary();}
start().catch(e=>{$('.status-chip').textContent='Unavailable';notify(e.message,true)});

$('#contactStatus').onchange=async()=>{try{if($('#contactStatus').value==='1')populateTypeFilter(await api('/api/contacts?archived=1'));await loadContacts()}catch(e){notify(e.message,true)}};
