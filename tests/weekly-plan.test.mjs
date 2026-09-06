import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPlanner,applyRequestedUpdates,WEEKLY_PLAN,WEEKLY_PLAN_UPDATE,weekCourses,parseDate,termConflicts,bufferOccupations,courseSegments,courseConflicts,courseLanes,validatePlanner} from '../app/planner.ts';

test('weekly rhythm migrates existing devices once and retains personal records',()=>{
  const source=emptyPlanner();
  source.appliedUpdates=['group-meeting-20260911-20270115'];
  const own={id:7,kind:'self',day:1,period:5,span:1,title:'已有安排'};
  source.schedules['2026-09-07']=[own];
  source.tasks=[{id:4,title:'原任务',project:'科研',minutes:10,done:false}];
  source.habits=[{...WEEKLY_PLAN[0],id:9,startDate:'2026-09-07',endDate:'2027-01-17'}];
  const result=applyRequestedUpdates(source);
  assert.equal(result.habits.length,WEEKLY_PLAN.length+1);
  assert.equal(result.habits.find(h=>h.id===9).title,WEEKLY_PLAN[0].title);
  assert.deepEqual(result.schedules,source.schedules);
  assert.deepEqual(result.tasks,source.tasks);
  assert.ok(result.appliedUpdates.includes(WEEKLY_PLAN_UPDATE));
  assert.deepEqual(applyRequestedUpdates(result),result);
  const edited={...result,habits:result.habits.slice(1)};
  assert.deepEqual(applyRequestedUpdates(edited),edited,'removed blocks stay removed');
  assert.deepEqual(validatePlanner(JSON.parse(JSON.stringify(result))),result);
});
test('full semester audit finds the four Friday exceptions and two Wednesday classes',()=>{
  const data=applyRequestedUpdates(emptyPlanner());
  const conflicts=termConflicts(data);
  assert.deepEqual(conflicts.map(c=>c.date),['2026-10-30','2026-11-06','2026-11-27','2027-01-01']);
  for(const c of conflicts){assert.equal(c.first.title,'数字电路与系统');assert.equal(c.second.title,'电子电路 2 · 预习复习');}
  assert.deepEqual(bufferOccupations(data).map(c=>[c.date,c.course.title]),[['2026-10-28','心理健康（5）'],['2026-11-25','国家安全（5）']]);
  const week=weekCourses(data,parseDate('2026-09-07'));
  assert.equal(week.filter(c=>c.title==='组会').length,1);
  assert.equal(week.filter(c=>c.day===7).length,0);
  assert.equal(week.filter(c=>c.day===3&&c.period>=6&&c.period<=10).length,0);
  assert.equal(week.filter(c=>c.kind==='habit').length,24);
  assert.equal(weekCourses(data,parseDate('2026-08-31')).filter(c=>c.kind==='habit').length,0);
  assert.equal(weekCourses(data,parseDate('2027-01-18')).filter(c=>c.kind==='habit').length,0);
});
test('audit includes user overrides and other recurring arrangements',()=>{
  const data=applyRequestedUpdates(emptyPlanner());
  data.schedules['2026-09-07']=[{id:600,kind:'self',day:1,period:1,span:1,title:'个人预约'}];
  assert.ok(termConflicts(data).some(c=>c.date==='2026-09-07'&&c.first.title==='个人预约'));
  data.habits.push({id:601,title:'周日已有活动',day:7,period:1,span:1,startDate:'2026-09-07',endDate:'2026-09-13'});
  assert.ok(bufferOccupations(data).some(c=>c.date==='2026-09-13'));
});
test('lunch recovery uses only the break row and overlapping cards remain separately visible',()=>{
  const lunch={id:1,kind:'habit',day:6,period:5,span:1,title:'午睡',breakTime:'lunch'};
  const classBefore={id:2,kind:'course',day:6,period:5,span:1,title:'第五节课'};
  assert.deepEqual(courseSegments(lunch),[{row:7,span:1,continuation:false}]);
  assert.equal(courseConflicts([lunch,classBefore]).length,0);
  const a={...classBefore,period:6,span:2},b={...classBefore,id:3,period:7,span:2},c={...classBefore,id:4,period:8,span:2};
  const lanes=courseLanes([a,b,c]);
  assert.equal(lanes.get(a).count,2);
  assert.notEqual(lanes.get(a).lane,lanes.get(b).lane);
  assert.notEqual(lanes.get(b).lane,lanes.get(c).lane);
  assert.equal(lanes.get(a).lane,lanes.get(c).lane);
});
