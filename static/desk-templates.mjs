import data from './message-templates.json' with {type:'json'};
export const DeskTemplates={labels:data.labels,items:data.items,
 recipient(contact,enteredName){const name=contact?[contact.first_name,contact.last_name].filter(Boolean).join(' '):enteredName;return {name,audience:contact?`Contact #${contact.id} | Permission at drafting: ${contact.email_permission||'Not asked'} | ${name}`:`Individual draft for ${name}`}},
 fields(template){return [...new Set([...((template.subject+'\n'+template.body).matchAll(/\{\{(\w+)\}\}/g))].map(match=>match[1]))]},
 fill(id,values){const template=this.items.find(item=>item.id===id);if(!template)throw Error('Choose an available template.');const missing=this.fields(template).filter(key=>!String(values[key]||'').trim());const render=text=>text.replace(/\{\{(\w+)\}\}/g,(_,key)=>String(values[key]||'').trim()||'['+this.labels[key]+']');return {subject:render(template.subject),body:render(template.body),missing}}
};
