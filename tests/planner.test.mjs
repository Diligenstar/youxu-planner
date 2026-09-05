import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actionableMilestones,addDays,applyRequestedUpdates,closeDay,courseConflicts,courseSegments,currentTask,dateKey,emptyPlanner,finishStep,migrateLegacy,noteReminders,parseDate,periodRow,schoolCourses,selectTask,setTaskDone,termWeek,validatePlanner,weekCourses} from '../app/planner.ts';

const first=parseDate('2026-09-07');
const atWeek=w=>addDays(first,(w-1)*7);
const task={id:10,title:'整理材料',project:'科研',minutes:10,done:false};
test('new semester schedule follows the supplied workbook at changeover weeks',()=>{
  const expectedCounts={1:10,7:10,8:11,9:9,10:9,11:9,12:10,13:7,14:7,15:5,16:3,17:2,18:0};
  for(const [w,n] of Object.entries(expectedCounts))assert.equal(schoolCourses(atWeek(Number(w))).length,n,`week ${w}`);
  assert.equal(schoolCourses(addDays(first,-7)).length,0);
  const electronics=schoolCourses(first).find(c=>c.title==='电子电路（2）');
  assert.deepEqual([electronics.day,electronics.period,electronics.span],[5,8,3]);
  const gym=schoolCourses(first).find(c=>c.title==='体育（5）');
  assert.deepEqual([gym.period,gym.span,gym.location],[6,1,'北航游泳馆']);
});
test('digital circuits changes teacher and weekday and is absent in week 16',()=>{
  for(let w=1;w<=17;w++){
    const classes=schoolCourses(atWeek(w)).filter(c=>c.title==='数字电路与系统');
    const alt=[8,9,12,17].includes(w);
    assert.deepEqual(classes.map(c=>[c.day,c.period,c.span]),w===16?[]:alt?[[2,3,2],[5,6,2]]:[[2,3,2],[3,3,2]]);
    classes.forEach(c=>assert.equal(c.teacher,alt?'李峭':'高强'));
  }
});
test('one-off classes, course end weeks and excluded unscheduled courses',()=>{
  for(let w=1;w<=20;w++){
    const cs=schoolCourses(atWeek(w));
    assert.equal(cs.some(c=>c.title==='心理健康（5）'),w===8);
    assert.equal(cs.some(c=>c.title==='国家安全（5）'),w===12);
    assert.equal(cs.some(c=>c.title==='电子信息基础实验'),w<=8);
    assert.equal(cs.some(c=>c.title==='微波技术'),w<=12);
    assert.equal(cs.some(c=>c.title.includes('社会实践')||c.title.includes('博雅')),false);
    assert.equal(courseConflicts(cs).length,0);
  }
});
test('every possible time block is split around independent lunch and dinner rows',()=>{
  assert.equal(periodRow(5),6);assert.equal(periodRow(6),8);
  assert.equal(periodRow(10),12);assert.equal(periodRow(11),14);
  for(let p=1;p<=14;p++)for(let span=1;span<=15-p;span++){
    const segments=courseSegments({id:1,day:1,period:p,span,title:'自己的安排',kind:'self'});
    const rows=segments.flatMap(s=>Array.from({length:s.span},(_,i)=>s.row+i));
    assert.equal(rows.length,span);assert.equal(rows.includes(7),false);assert.equal(rows.includes(13),false);
    assert.deepEqual(rows,Array.from({length:span},(_,i)=>periodRow(p+i)));
  }
});
test('habit occurrence date must be inside start/end, not just the containing week',()=>{
  const d=emptyPlanner();d.habits=[{id:900,title:'阅读',day:1,period:1,span:1,startDate:'2026-09-09',endDate:'2026-09-16'}];
  assert.equal(weekCourses(d,first).some(c=>c.kind==='habit'),false);
  assert.equal(weekCourses(d,atWeek(2)).some(c=>c.kind==='habit'),true);
  assert.equal(weekCourses(d,atWeek(3)).some(c=>c.kind==='habit'),false);
});
test('custom weeks and habits both participate in conflict detection',()=>{
  const d=emptyPlanner();d.habits=[{id:999,title:'自学',day:1,period:3,span:1,startDate:'2026-09-07',endDate:'2026-09-10'}];
  const collisions=courseConflicts(weekCourses(d,first));
  assert.equal(collisions.length,2);assert.ok(collisions.some(c=>c.kind==='habit'));
});
test('migration updates all school snapshots while retaining personal blocks and source backup',()=>{
  const own={id:700,day:2,period:1,span:1,title:'自己的安排',kind:'self'};
  const oldSchool={id:104,day:2,period:6,span:2,title:'数电',kind:'course'};
  const legacy={
    'daylight-weekly-schedules':JSON.stringify({'2026-09-07':[oldSchool,own]}),
    'daylight-daily-tasks':JSON.stringify({'2026-09-03':[{...task,done:false}],'2026-09-04':[{...task,done:true}]}),
    'daylight-projects':JSON.stringify([{id:1,name:'科研',color:'#777',next:'下一步',note:'已有笔记'}]),
    'daylight-evidence':JSON.stringify({'2026-09-04':['和朋友吃饭']}),
    'daylight-flywheel-checkins':JSON.stringify({'2026-09-04':['科研']}),
    'daylight-breakers':JSON.stringify({'2026-09-04':{avoid:'旧文本',small:'下一步',rest:'休息'}}),
  };
  const before=JSON.stringify(legacy),d=migrateLegacy(legacy,'2026-09-05');
  assert.equal(JSON.stringify(legacy),before);assert.deepEqual(d.legacy,legacy);
  assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].done,true);assert.equal(d.tasks[0].completedAt,'2026-09-04');
  assert.equal(d.projects[0].mainline,'下一步');assert.deepEqual(d.projects[0].todos,[]);
  assert.deepEqual(d.schedules['2026-09-07'].find(c=>c.kind==='self'),own);
  assert.deepEqual(d.schedules['2026-09-07'].filter(c=>c.kind==='course'),schoolCourses(first));
  assert.equal(d.evidence['2026-09-04'][0],'和朋友吃饭');assert.deepEqual(d.checkins['2026-09-04'],['科研']);
  assert.equal(currentTask(d,'2026-09-05'),undefined);
  assert.deepEqual(validatePlanner(JSON.parse(JSON.stringify(d))),d);
});
test('deadlines stay quiet until actionable, real overdue dates stay visible',()=>{
  const d=emptyPlanner();d.milestones=[
    {id:1,title:'远期',date:'2026-09-26',hot:true},
    {id:2,title:'准备材料',date:'2026-09-11',hot:false,actionDate:'2026-09-05',action:'确认分工'},
    {id:3,title:'今天截止',date:'2026-09-05',hot:false},
    {id:4,title:'待确认',date:'2026-09-04',hot:false},
    {id:5,title:'已完成',date:'2026-09-03',hot:true,done:true},
  ];
  assert.deepEqual(actionableMilestones(d,'2026-09-05').map(m=>m.id),[4,3,2]);
  assert.equal(actionableMilestones(d,'2026-09-02').length,0);
});
test('nightly review keeps unfinished work without carrying it into tomorrow',()=>{
  let d=emptyPlanner();d.tasks=[task];d=selectTask(d,10,'2026-09-05');
  d.reviews['2026-09-05']={note:'今天有进展',next:'核对第二部分',feeling:''};
  const closed=closeDay(d,'2026-09-05');
  assert.equal(closed.tasks[0].done,false);assert.equal(closed.tasks[0].plannedFor,'2026-09-05');
  assert.equal(currentTask(closed,'2026-09-05'),undefined);assert.equal(currentTask(closed,'2026-09-06'),undefined);
  assert.equal(closed.reviews['2026-09-05'].next,'核对第二部分');assert.ok(closed.reviews['2026-09-05'].closedAt);
  const reopened=selectTask(closed,10,'2026-09-05');assert.equal(reopened.reviews['2026-09-05'].closedAt,undefined);
});
test('completed full actions synchronize their linked project task',()=>{
  const d=emptyPlanner();d.tasks=[{...task,projectId:1,projectTodoId:2}];d.projects=[{id:1,name:'科研',color:'#777',note:'',mainline:'',todos:[{id:2,title:task.title,done:false}]}];
  const done=setTaskDone(d,10,true,'2026-09-05');assert.equal(done.projects[0].todos[0].done,true);assert.equal(done.tasks[0].completedAt,'2026-09-05');
  assert.equal(setTaskDone(done,10,false,'2026-09-06').tasks[0].completedAt,undefined);
});
test('a smaller step records progress without falsely completing its parent',()=>{
  let d=emptyPlanner();d.tasks=[{...task,step:'先圈出三处缺失',projectId:1,projectTodoId:2}];d.projects=[{id:1,name:'科研',color:'#777',note:'',mainline:'',todos:[{id:2,title:task.title,done:false}]}];d=selectTask(d,10,'2026-09-05');
  const next=finishStep(d,10,'2026-09-05');assert.equal(next.tasks[0].done,false);assert.equal(next.projects[0].todos[0].done,false);assert.equal(next.evidence['2026-09-05'].length,1);assert.match(next.evidence['2026-09-05'][0],/先圈出三处缺失/);assert.equal(currentTask(next,'2026-09-05'),undefined);
});
test('invalid backups fail before replacement; valid backup roundtrips',()=>{
  const d=emptyPlanner();assert.deepEqual(validatePlanner(JSON.parse(JSON.stringify(d))),d);
  assert.throws(()=>validatePlanner({...d,version:5}));
  assert.throws(()=>validatePlanner({...d,tasks:[{...task,minutes:-1}]}));
  assert.throws(()=>validatePlanner({...d,tasks:[task,task]}));
  assert.throws(()=>validatePlanner({...d,reviews:{'2026-09-05':{next:'missing fields'}}}));
  assert.throws(()=>validatePlanner({...d,schedules:{'2026-09-07':[{id:1,title:'overflow',kind:'self',day:1,period:14,span:4}]}}));
  assert.throws(()=>migrateLegacy({'daylight-daily-tasks':'not JSON'},'2026-09-05'));
});
test('term start dates and year transition use calendar weeks',()=>{
  assert.equal(termWeek(parseDate('2026-09-13'),'2026-09-07'),1);
  assert.equal(termWeek(parseDate('2027-01-03'),'2026-09-07'),17);
  assert.equal(dateKey(atWeek(2)),'2026-09-14');
});
test('Friday group meeting covers exactly Sep 11–Jan 15, with breakfast only Dec 4',()=>{
  const data=applyRequestedUpdates(emptyPlanner());
  let count=0;
  for(let day=parseDate('2026-09-04');day<=parseDate('2027-01-22');day=addDays(day,7)){
    const meetings=weekCourses(data,day).filter(c=>c.title==='组会');
    const key=dateKey(day),expected=key>='2026-09-11'&&key<='2027-01-15';
    assert.equal(meetings.length,expected?1:0,key);
    if(expected){assert.deepEqual([meetings[0].day,meetings[0].period,meetings[0].span],[5,1,2]);count++}
  }
  assert.equal(count,19);assert.deepEqual(data.dayNotes,{'2026-12-04':['给组里买早饭']});
  assert.deepEqual(applyRequestedUpdates(data),data);
  assert.deepEqual(validatePlanner(JSON.parse(JSON.stringify(data))),data);
  const removed={...data,habits:[]};assert.equal(applyRequestedUpdates(removed).habits.length,0,'do not undo later user edits');
});
test('schedule CSS has dedicated rest rows and contains course card overflow',async()=>{
  const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/grid-template-rows:50px repeat\(5,56px\) 34px repeat\(5,56px\) 34px repeat\(4,56px\)/);
  assert.match(css,/\.course-block\{[^}]*overflow:hidden;contain:paint/);
});
test('breakfast reminder appears the previous day and event day, then disappears',()=>{
  const data=applyRequestedUpdates(emptyPlanner());
  assert.deepEqual(noteReminders(data,'2026-12-02'),[]);
  const previous=noteReminders(data,'2026-12-03');
  assert.equal(previous.length,1);assert.equal(previous[0].when,'tomorrow');assert.equal(previous[0].eventDate,'2026-12-04');
  assert.equal(previous[0].title,'给组里买早饭');assert.match(previous[0].preparation,/早起.*闹钟/);
  const sameDay=noteReminders(data,'2026-12-04');assert.equal(sameDay.length,1);assert.equal(sameDay[0].when,'today');assert.equal(sameDay[0].preparation,'');
  assert.deepEqual(noteReminders(data,'2026-12-05'),[]);
  assert.equal(data.dayNotes['2026-12-03'],undefined,'advance reminder is derived, never a duplicate saved event');
  assert.deepEqual(noteReminders({...data,dayNotes:{}},'2026-12-03'),[],'removing event also removes its advance reminder');
});
test('advance reminders work across year and month boundaries and after nightly review',()=>{
  let data=emptyPlanner();data.dayNotes={'2027-01-01':['带好材料'],'2026-10-01':['出行']};
  assert.equal(noteReminders(data,'2026-12-31')[0].eventDate,'2027-01-01');
  assert.equal(noteReminders(data,'2026-09-30')[0].when,'tomorrow');
  data=closeDay(data,'2026-12-31');assert.equal(noteReminders(data,'2026-12-31').length,1,'closing the day must not hide preparation reminders');
});
