// Calendar dates stay as YYYY-MM-DD; timestamps use the desk's configured zone.
const CrmToday = {
 day(value,zone){
  if(!value)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const instant=new Date(value);
  if(Number.isNaN(instant.getTime()))return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);
 },
 addDays(day,offset){const value=new Date(day+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10)},
 groups(tasks,contacts,today,zone){
  const active=new Map(contacts.filter(c=>!c.archived).map(c=>[Number(c.id),c]));
  const items=tasks.filter(t=>!t.completed_at&&(!t.contact_id||active.has(Number(t.contact_id)))).map(t=>({...t,kind:'task'}));
  for(const c of active.values())if(c.next_follow_up_at)items.push({id:c.id,contact_id:c.id,contact_name:[c.first_name,c.last_name].filter(Boolean).join(' '),title:'Contact follow-up',due_at:c.next_follow_up_at,kind:'contact'});
  const groups={overdue:[],today:[],upcoming:[],unscheduled:[]},end=this.addDays(today,7);
  for(const item of items){const due=this.day(item.due_at,zone);if(!due)groups.unscheduled.push(item);else if(due<today)groups.overdue.push(item);else if(due===today)groups.today.push(item);else if(due<=end)groups.upcoming.push(item)}
  for(const list of Object.values(groups))list.sort((a,b)=>String(a.due_at||'').localeCompare(String(b.due_at||'')));
  return groups;
 }
};
