const DeskProfile={
 key:'matt-realty-profile-v1',
 defaults:{display_name:'Matt',tone:'Warm and friendly',brokerage:'',service_area:'',signature:'Matt'},
 read(){try{const saved=JSON.parse(localStorage.getItem(this.key)||'{}'),profile={...this.defaults};for(const key of Object.keys(profile))if(typeof saved[key]==='string')profile[key]=saved[key].slice(0,key==='signature'?500:180);if(!['Warm and friendly','Clear and concise','Professional and polished'].includes(profile.tone))profile.tone=this.defaults.tone;return profile}catch{return {...this.defaults}}},
 save(profile){localStorage.setItem(this.key,JSON.stringify(profile))}
};
Promise.all([runtimeReady,templatesReady]).then(installPersonalDesk).catch(()=>{});
function installPersonalDesk(){
 const templateButton=document.createElement('button');templateButton.type='button';templateButton.className='primary';templateButton.textContent='Choose a message template';templateButton.onclick=openTemplateLibrary;$('#campaignsView .section-actions').append(templateButton);
 if(!runtime.hosted)return;

 const welcome=document.createElement('section');welcome.className='desk-welcome';welcome.innerHTML='<div><strong id="deskGreeting"></strong><p>Three helpers and ready-to-use drafts, with you in control.</p></div><button type="button" class="ghost" id="deskSetup">Make this desk yours</button>';
 if(!runtime.assistant)welcome.querySelector('p').textContent='Ready-to-use drafts, with you in control. AI helpers are currently unavailable.';
 $('#todayView').prepend(welcome);
 const help=document.createElement('section');help.className='panel';help.innerHTML='<h2>Your desk preferences</h2><p class="muted">Set your preferred name, writing tone and sign-off. Optional, and saved on this browser.</p><button type="button" class="ghost" id="editDeskSetup">Edit preferences</button>';$('#helpView .grid').prepend(help);
 $('#deskSetup').onclick=$('#editDeskSetup').onclick=openDeskSetup;updateDeskGreeting();
}
function updateDeskGreeting(){if($('#deskGreeting'))$('#deskGreeting').textContent=`${DeskProfile.read().display_name || 'Matt'}’s relationship desk`;if($('#deskSetup'))$('#deskSetup').textContent=localStorage.getItem(DeskProfile.key)?'Edit your preferences':'Make this desk yours'}
function personalDialog(id,title){let dialog=$('#'+id);if(!dialog){dialog=document.createElement('dialog');dialog.id=id;dialog.className='personal-dialog';document.body.append(dialog)}dialog.oncancel=null;dialog.innerHTML=`<div class="modal-head"><h2>${title}</h2><button type="button" class="icon" aria-label="Close">×</button></div><div class="personal-body"></div>`;dialog.querySelector('.icon').onclick=()=>dialog.close();return dialog}
function openDeskSetup(){
 const dialog=personalDialog('deskSetupDialog','Make this desk yours'),profile=DeskProfile.read();
 dialog.querySelector('.personal-body').innerHTML='<p>This takes about a minute. Skip any details you do not want to add.</p><form id="deskSetupForm"><div class="form-grid"><div class="field"><label for="deskName">What should your helpers call you?</label><input id="deskName" name="display_name" maxlength="180" required></div><div class="field"><label for="deskTone">How should your drafts sound?</label><select id="deskTone" name="tone"><option>Warm and friendly</option><option>Clear and concise</option><option>Professional and polished</option></select></div><div class="field"><label for="deskBrokerage">Brokerage (optional)</label><input id="deskBrokerage" name="brokerage" maxlength="180"></div><div class="field"><label for="deskArea">Service area (optional)</label><input id="deskArea" name="service_area" maxlength="180"></div><div class="field full"><label for="deskSignature">Your sign-off</label><textarea id="deskSignature" name="signature" rows="3" maxlength="500"></textarea></div></div><p class="muted">Saved on this browser. These preferences accompany AI requests; they do not grant sending permission or change contacts.</p><div class="modal-actions"><button type="button" class="ghost" id="skipDeskSetup">Not now</button><button type="submit" class="primary">Save preferences</button></div></form>';
 for(const [key,value] of Object.entries(profile))dialog.querySelector(`[name="${key}"]`).value=value;
 $('#skipDeskSetup').onclick=()=>dialog.close();$('#deskSetupForm').onsubmit=e=>{e.preventDefault();const saved=Object.fromEntries(new FormData(e.target).entries());saved.display_name=saved.display_name.trim()||'Matt';saved.signature=saved.signature.trim()||saved.display_name;try{DeskProfile.save(saved);updateDeskGreeting();dialog.close();notify('Preferences saved on this browser')}catch{notify('This browser could not save preferences. Your entries are still here.',true)}};
 dialog.showModal();$('#deskName').focus();
}
async function openTemplateLibrary(preselectedContactId){
 const dialog=personalDialog('templateDialog','Choose a message for the occasion');
 dialog.querySelector('.personal-body').innerHTML=`<p>Start with a finished message, fill the few blanks, then review. No AI request is needed.</p><button type="button" class="ghost" id="chooseTemplateGroup">Choose multiple recipients instead</button><div class="template-workspace"><section class="template-editor"><div class="field"><label for="messageTemplate">Occasion</label><select id="messageTemplate">${DeskTemplates.items.map(t=>`<option value="${t.id}">${esc(t.category)} — ${esc(t.name)}</option>`).join('')}</select></div><div class="field"><label for="templateContact">Use a saved contact (optional)</label><select id="templateContact" disabled><option value="">Loading contacts…</option></select></div><p class="muted" id="templatePermission"></p><div id="templateFields"></div><label class="template-confirm"><input type="checkbox" id="templateConfirmed"> I have checked that this occasion and these details are accurate.</label></section><section class="letter-preview" aria-label="Message preview"><p class="letter-label">Draft for your review</p><h3 id="templateSubject"></h3><div id="templateBody"></div><p id="templateMissing" role="status"></p></section></div><p class="muted">Nothing sends automatically. Save keeps this as an individual campaign draft, not a mailing list.</p><div class="modal-actions"><button type="button" class="ghost" id="polishTemplate" hidden>Polish with Campaign Writer</button><button type="button" class="primary" id="saveTemplate" disabled>Save draft</button></div>`;
 $('#chooseTemplateGroup').onclick=async()=>{if(saving)return;if(JSON.stringify(values())!==fieldBaseline&&!await confirmTemplateChange())return;try{await groupTemplatesReady;const id=$('#messageTemplate').value;dialog.close();await openGroupTemplateLibrary(id)}catch(error){notify(error.message,true)}};
 let contacts=[],saving=false,fieldBaseline='',selection={template:'new-lead',contact:''};
 const select=$('#templateContact');
 function values(){return Object.fromEntries($$('#templateFields [name]').map(input=>[input.name,input.value]))}
 function draft(){return DeskTemplates.fill($('#messageTemplate').value,values())}
 function render(){const current=draft();$('#templateSubject').textContent=current.subject;$('#templateBody').textContent=current.body;$('#templateMissing').textContent=current.missing.length?'Fill in: '+current.missing.map(key=>DeskTemplates.labels[key]).join(', '):'All blanks filled. Review the occasion and wording.';const ready=!current.missing.length&&$('#templateConfirmed').checked;$('#saveTemplate').disabled=saving||!ready;$('#polishTemplate').disabled=saving||!ready}
 function fields(){
  const template=DeskTemplates.items.find(t=>t.id===$('#messageTemplate').value),profile=DeskProfile.read(),contact=contacts.find(c=>String(c.id)===select.value);
  const known={first_name:contact?.first_name||'',agent_name:profile.display_name,signature:profile.signature};
  $('#templateFields').innerHTML=DeskTemplates.fields(template).map(key=>`<div class="field"><label for="template-${key}">${DeskTemplates.labels[key]}</label>${key==='signature'||key==='topic'?`<textarea id="template-${key}" name="${key}" rows="3" maxlength="500"></textarea>`:`<input id="template-${key}" name="${key}" maxlength="180">`}</div>`).join('');
  $$('#templateFields [name]').forEach(input=>{input.value=known[input.name]||'';input.oninput=()=>{$('#templateConfirmed').checked=false;render()}});
  $('#templatePermission').textContent=contact?`Saved email permission: ${contact.email_permission || 'Not asked'}. Confirm permission before any marketing.`:'Choose a person or enter the name yourself. Property and occasion facts stay blank until supplied.';
  $('#templateConfirmed').checked=false;fieldBaseline=JSON.stringify(values());selection={template:$('#messageTemplate').value,contact:select.value};render();
 }
 async function changeContext(){
  if(JSON.stringify(values())!==fieldBaseline&&!await confirmTemplateChange()){$('#messageTemplate').value=selection.template;select.value=selection.contact;return}
  fields();
 }
 dialog.oncancel=e=>{if(saving)e.preventDefault()};
 function lockEditor(locked){dialog.querySelector('.icon').disabled=locked;$$('#templateDialog .template-editor input, #templateDialog .template-editor select, #templateDialog .template-editor textarea').forEach(input=>input.disabled=locked)}
 $('#messageTemplate').onchange=changeContext;select.onchange=changeContext;$('#templateConfirmed').onchange=render;
 $('#saveTemplate').onclick=async()=>{
  if(saving||$('#saveTemplate').disabled)return;const current=draft(),recipient=DeskTemplates.recipient(contacts.find(c=>String(c.id)===select.value),values().first_name);saving=true;render();lockEditor(true);
  try{await api('/api/campaigns',{method:'POST',body:JSON.stringify({name:(DeskTemplates.items.find(t=>t.id===$('#messageTemplate').value).name+' — '+recipient.name).slice(0,200),subject:current.subject,body:current.body,channel:'Email',audience:recipient.audience.slice(0,200)})})}catch(error){saving=false;lockEditor(false);render();notify(error.message,true);return}
  dialog.close();notify('Draft saved. Nothing sent.');go('campaigns');
 };
 $('#polishTemplate').hidden=!(runtime.hosted&&runtime.assistant);$('#polishTemplate').onclick=async()=>{if(saving||$('#polishTemplate').disabled)return;const current=draft();saving=true;render();lockEditor(true);try{await startHostedCampaign(current,select.value?Number(select.value):null);dialog.close();go('assistant')}catch(error){saving=false;lockEditor(false);render();notify(error.message,true)}};
 fields();dialog.showModal();
 try{contacts=await api('/api/contacts');if(!select.isConnected)return;select.innerHTML='<option value="">Enter the name myself</option>'+contacts.map(c=>`<option value="${c.id}">${esc(c.first_name)} ${esc(c.last_name)}</option>`).join('');select.disabled=saving;if(!saving&&JSON.stringify(values())===fieldBaseline&&preselectedContactId&&contacts.some(c=>Number(c.id)===Number(preselectedContactId))){select.value=String(preselectedContactId);fields()}}catch{if(select.isConnected){select.innerHTML='<option value="">Enter the name myself</option>';$('#templatePermission').textContent='Contacts could not load. Enter the name yourself, or close and reopen to retry.'}}
}
function confirmTemplateChange(discardGroup=false){
 const dialog=personalDialog('templateChangeDialog',discardGroup?'Discard this group draft?':'Replace the edited blanks?');
 dialog.querySelector('.personal-body').innerHTML='<p>Choosing another contact or occasion will clear your edited blanks. Your current message has not been saved.</p><div class="modal-actions"><button type="button" class="primary" id="keepTemplateEdits">Keep this message</button><button type="button" class="ghost" id="replaceTemplateEdits">Clear and continue</button></div>';
 if(discardGroup){dialog.querySelector('.personal-body p').textContent='Your selected recipients and common message have not been saved.';$('#keepTemplateEdits').textContent='Keep editing';$('#replaceTemplateEdits').textContent='Discard group draft'}
 return new Promise(resolve=>{const finish=value=>{dialog.onclose=null;dialog.oncancel=null;dialog.close();resolve(value)};$('#keepTemplateEdits').onclick=()=>finish(false);$('#replaceTemplateEdits').onclick=()=>finish(true);dialog.querySelector('.icon').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false)};dialog.showModal();$('#keepTemplateEdits').focus()});
}
