import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({Intl,Date});
vm.runInContext(readFileSync(new URL('../../static/today.js',import.meta.url),'utf8'),context);
const desk=vm.runInContext('CrmToday',context);
test('desk calendar stays on New York day at UTC midnight',()=>{
 assert.equal(desk.day('2026-10-14T02:00:00Z','America/New_York'),'2026-10-13');
 assert.equal(desk.day('2026-10-14','America/New_York'),'2026-10-14');
});
test('quick dates cross DST, month, year and leap day without UTC drift',()=>{
 for(const [input,offset,expected] of [['2026-03-07',1,'2026-03-08'],['2026-10-31',7,'2026-11-07'],['2026-12-31',1,'2027-01-01'],['2028-02-28',1,'2028-02-29']])assert.equal(desk.addDays(input,offset),expected);
});
test('Today includes saved reminders and contact dates and excludes archived/completed',()=>{
 const contacts=[{id:1,first_name:'Active',next_follow_up_at:'2026-10-13'},{id:2,first_name:'Archived',archived:1,next_follow_up_at:'2026-10-12'}];
 const tasks=[{id:1,contact_id:1,title:'Overdue',due_at:'2026-10-12'},{id:2,title:'Today',due_at:'2026-10-13'},{id:3,title:'Upcoming',due_at:'2026-10-20'},{id:4,title:'Later',due_at:'2026-10-21'},{id:5,title:'Unscheduled'},{id:6,contact_id:2,title:'Archived'},{id:7,title:'Completed',completed_at:'2026-10-12',due_at:'2026-10-13'}];
 const groups=desk.groups(tasks,contacts,'2026-10-13','America/New_York');
 assert.equal(groups.overdue.length,1);assert.equal(groups.today.length,2);assert.equal(groups.upcoming.length,1);assert.equal(groups.unscheduled.length,1);
 assert.equal(groups.today[1].kind,'contact');
});
