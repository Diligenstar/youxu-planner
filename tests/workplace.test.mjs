import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPlanner,applyRequestedUpdates,parseDate,addDays,dateKey,weekCourses,workplaceSessions,termConflicts,validatePlanner,WORKPLACE_UPDATE,WEDNESDAY_WORKPLACE_DATES} from '../app/planner.ts';
const atWeek=n=>addDays(parseDate('2026-09-07'),(n-1)*7);
test('Tuesday circuits starts in week 9 after the eight experimental evenings',()=>{
  const data=applyRequestedUpdates(emptyPlanner());
  for(let week=1;week<=19;week++){
    const courses=weekCourses(data,atWeek(week));
    const circuits=courses.filter(c=>c.day===2&&c.title==='电子电路 2 · 学习');
    assert.equal(circuits.length,week>=9?1:0);
    assert.equal(courses.some(c=>c.title==='电子信息基础实验'),week<=8);
    if(circuits.length)assert.deepEqual([circuits[0].period,circuits[0].span,circuits[0].location],[11,2,'工位']);
  }
  assert.equal(termConflicts(data).length,4,'no added overlaps; original Friday conflicts remain visible');
});
test('Wednesday workstation applies only to the three mid-course gaps, not resumed or finished classes',()=>{
  const data=applyRequestedUpdates(emptyPlanner());
  for(let week=1;week<=19;week++){
    const morning=workplaceSessions(data,atWeek(week)).filter(p=>p.day===3&&p.period===1);
    assert.equal(morning.length,[8,9,12].includes(week)?1:0,`week ${week}`);
    const dsp=weekCourses(data,atWeek(week)).find(c=>c.day===3&&c.title==='DSP · 作业实验');
    assert.equal(dsp.location,[8,9,12].includes(week)?'工位':undefined);
  }
  assert.deepEqual(WEDNESDAY_WORKPLACE_DATES,[8,9,12].map(w=>dateKey(addDays(atWeek(w),2))));
  data.schedules[dateKey(atWeek(8))]=[{id:900,kind:'course',title:'临时调课',day:3,period:3,span:2}];
  assert.equal(workplaceSessions(data,atWeek(8)).filter(p=>p.day===3&&p.period===1).length,0);
});
test('workplace location reuses study blocks and Saturday lab spans 11–14',()=>{
  const data=applyRequestedUpdates(emptyPlanner()),week=weekCourses(data,atWeek(1));
  for(const c of week.filter(c=>c.kind==='habit'&&[1,3,4,5].includes(c.day)&&c.period>=11&&c.title!=='跑步 / 休息'))assert.equal(c.location,'工位');
  for(const c of week.filter(c=>c.title==='跑步 / 休息'))assert.equal(c.location,undefined);
  const lab=week.find(c=>c.title==='计组 · 上机');
  assert.deepEqual([lab.period,lab.span,lab.location],[11,4,'工位']);
  assert.equal(week.find(c=>c.title==='计组 · 新课').location,'工位');
  assert.equal(data.tasks.length,0,'locations do not create tasks');
  assert.deepEqual(data.schedules,{},'no personal blocks fill newly freed lecture periods');
  assert.ok(weekCourses(data,atWeek(19)).some(c=>c.title==='概统 · 作业'),'existing study blocks continue after classes end');
});
test('workplace upgrade preserves unrelated edits, is idempotent, and validates location dates',()=>{
  const data=applyRequestedUpdates(emptyPlanner());
  const user={id:800,title:'我的安排',day:2,period:5,span:1,startDate:'2026-09-07',endDate:'2027-01-17',location:'图书馆'};
  const old={...data,appliedUpdates:data.appliedUpdates.filter(v=>v!==WORKPLACE_UPDATE),habits:[...data.habits,user]};
  const updated=applyRequestedUpdates(old);
  assert.deepEqual(updated.habits.find(h=>h.id===800),user);
  assert.equal(updated.habits.filter(h=>h.title==='电子电路 2 · 学习').length,1);
  const removed={...updated,habits:updated.habits.filter(h=>h.title!=='电子电路 2 · 学习')};
  assert.deepEqual(applyRequestedUpdates(removed),removed);
  assert.deepEqual(validatePlanner(JSON.parse(JSON.stringify(updated))),updated);
  assert.throws(()=>validatePlanner({...updated,habits:[{...user,locationDates:['bad-date']}]}));
  assert.throws(()=>validatePlanner({...updated,habits:[{...user,location:42}]}));
});
