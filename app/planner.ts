export type Mode = 'steady' | 'sprint' | 'recovery';
export type Task = {id:number; title:string; project:string; minutes:number; done:boolean; projectId?:number; projectTodoId?:number; plannedFor?:string; completedAt?:string; step?:string; startedAt?:string};
export type Todo = {id:number; title:string; done:boolean};
export type Project = {id:number; name:string; color:string; mainline:string; note:string; todos:Todo[]; status?:'active'|'waiting'|'paused'|'done'; progress?:string; next?:string; waiting?:string; revisit?:string};
export type Course = {id:number; day:number; period:number; span:number; title:string; kind:'course'|'self'|'habit'; habitId?:number; location?:string; teacher?:string; breakTime?:'lunch'|'dinner'; note?:string};
export type Habit = {id:number; title:string; day:number; period:number; span:number; startDate:string; endDate:string; breakTime?:'lunch'|'dinner'; note?:string};
export type Milestone = {id:number; title:string; date:string; hot:boolean; action?:string; actionDate?:string; done?:boolean};
export type Idea = {id:number; title:string; category:string; note:string};
export type Review = {note:string; next:string; feeling:string; closedAt?:string};
export type Planner = {
  version:6; tasks:Task[]; projects:Project[]; schedules:Record<string,Course[]>; habits:Habit[];
  milestones:Milestone[]; ideas:Idea[]; evidence:Record<string,string[]>; checkins:Record<string,string[]>;
  reviews:Record<string,Review>; modes:Record<string,Mode>; current:Record<string,number|null>;
  courseNotes:Record<string,string>; termStart:string; legacy:Record<string,string>;
  dayNotes:Record<string,string[]>; appliedUpdates:string[];
};
export const STORAGE_KEY='youxu-planner-v6';
export const DAYS=['周一','周二','周三','周四','周五','周六','周日'];
export const LEGACY_KEYS=['daylight-daily-tasks','daylight-tasks','daylight-weekly-schedules','daylight-projects','daylight-milestones','daylight-habits','daylight-ideas','daylight-mode','daylight-flywheel-checkins','daylight-evidence','daylight-breakers'];
export const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const addDays=(d:Date,n:number)=>{const result=new Date(d);result.setDate(result.getDate()+n);return result};
export const monday=(d:Date)=>{const result=new Date(d);result.setHours(0,0,0,0);return addDays(result,1-(result.getDay()||7))};
export const parseDate=(s:string)=>new Date(s+'T00:00:00');
export const validDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(parseDate(s).getTime())&&dateKey(parseDate(s))===s;
export const newId=()=>Date.now()*1000+Math.floor(Math.random()*1000);
export const emptyPlanner=():Planner=>({version:6,tasks:[],projects:[],schedules:{},habits:[],milestones:[],ideas:[],evidence:{},checkins:{},reviews:{},modes:{},current:{},courseNotes:{},termStart:'2026-09-07',legacy:{},dayNotes:{},appliedUpdates:[]});
export function applyRequestedUpdates(data:Planner):Planner{
  const update='group-meeting-20260911-20270115';
  if(data.appliedUpdates.includes(update))return applyWeeklyPlan(data);
  const existing=data.habits.some(h=>h.title==='组会'&&h.day===5&&h.period===1&&h.span===2&&h.startDate==='2026-09-11'&&h.endDate==='2027-01-15');
  const meeting:Habit={id:newId(),title:'组会',day:5,period:1,span:2,startDate:'2026-09-11',endDate:'2027-01-15'};
  const notes=data.dayNotes['2026-12-04']??[];
  return applyWeeklyPlan({...data,habits:existing?data.habits:[...data.habits,meeting],dayNotes:{...data.dayNotes,'2026-12-04':notes.includes('给组里买早饭')?notes:[...notes,'给组里买早饭']},appliedUpdates:[...data.appliedUpdates,update]});
}
export const WEEKLY_PLAN_UPDATE='weekly-rhythm-20260907-v1';
const rhythm=(day:number,period:number,span:number,title:string,note:string,breakTime?:Habit['breakTime'])=>({day,period,span,title,note,...(breakTime?{breakTime}:{})});
export const WEEKLY_PLAN=[
  rhythm(1,1,1,'概统 · 预习复盘','先接上本周内容。'),
  rhythm(1,2,1,'微波 · 预习复盘','先接上本周内容。'),
  rhythm(1,11,2,'概统 · 作业','作业优先，没有作业就整理公式或例题。'),
  rhythm(1,13,2,'微波 · 作业','作业优先，没有作业就整理公式或例题。'),
  rhythm(2,1,1,'数电 · 预习复盘','抓本周重点。'),
  rhythm(2,2,1,'DSP · 预习复盘','抓本周重点。'),
  rhythm(2,6,2,'数电 · 作业','有作业写作业，没有作业就预习和复习。'),
  rhythm(3,1,2,'DSP · 作业实验','作业、实验和 MATLAB 都放在这里。'),
  rhythm(3,11,2,'数电 · 作业','接住周三数电课，留下下一步。'),
  rhythm(3,13,2,'跑步 / 休息','根据身体状态选择，不要求占满时段。'),
  rhythm(4,1,1,'概统 · 预习复盘','本周第二次回到这门课。'),
  rhythm(4,2,1,'微波 · 预习复盘','本周第二次回到这门课。'),
  rhythm(4,8,2,'概统 · 作业','用一个短块往前推进。'),
  rhythm(4,11,2,'微波 · 作业','接住当前作业或实验的一小步。'),
  rhythm(4,13,2,'跑步 / 休息','微波作业后恢复一下，不要求占满时段。'),
  rhythm(5,3,3,'工位科研','沿用周五 1–2 节组会，会后在工位推进科研主线。'),
  rhythm(5,6,2,'电子电路 2 · 预习复习','上课前热身；遇数电调课周，先查看冲突再调整。'),
  rhythm(5,11,2,'电子电路 2 · 作业','当天收口，没做完就留好进度。'),
  rhythm(5,13,2,'周总结 / 查漏','看看遗漏、调整容量，不要求填满两个节次。'),
  rhythm(6,2,3,'计组 · 新课','本学期计算机补课主线。'),
  rhythm(6,5,1,'睡个好觉','周六午间恢复。','lunch'),
  rhythm(6,8,2,'游泳','暂放在 8–9 节，按实际预约时间调整。'),
  rhythm(6,11,2,'计组 · 上机','把上午学到的内容落到手上；暂放在 11–12 节。'),
];
function applyWeeklyPlan(data:Planner):Planner{
  if(data.appliedUpdates.includes(WEEKLY_PLAN_UPDATE))return data;
  const habits=[...data.habits];
  for(const item of WEEKLY_PLAN){
    const dates={startDate:'2026-09-07',endDate:'2027-01-17'};
    if(habits.some(h=>h.title===item.title&&h.day===item.day&&h.period===item.period&&h.span===item.span&&h.breakTime===item.breakTime&&h.startDate===dates.startDate&&h.endDate===dates.endDate))continue;
    let id=newId();while(habits.some(h=>h.id===id))id++;
    habits.push({...item,...dates,id});
  }
  return {...data,habits,appliedUpdates:[...data.appliedUpdates,WEEKLY_PLAN_UPDATE]};
}
export const emptyReview=():Review=>({note:'',next:'',feeling:''});
const range=(end:number)=>Array.from({length:end},(_,i)=>i+1);
const digitalWeeks=[1,2,3,4,5,6,7,10,11,13,14,15];
const alternateWeeks=[8,9,12,17];
const course=(id:number,day:number,period:number,span:number,title:string,location:string,teacher:string,weeks:number[])=>({id,day,period,span,title,location,teacher,kind:'course' as const,weeks});
// Source: the user's autumn 2026 workbook. Unscheduled social practice / liberal arts are excluded.
const RULES=[
  course(101,1,3,2,'概率统计与随机过程','主北209','曾虹程',range(14)),
  course(102,4,3,2,'概率统计与随机过程','主北209','曾虹程',range(14)),
  course(103,1,6,1,'体育（5）','北航游泳馆','陆颖',range(16)),
  course(104,2,3,2,'数字电路与系统','(三)312','高强',digitalWeeks),
  course(111,2,3,2,'数字电路与系统','(三)312','李峭',alternateWeeks),
  course(108,3,3,2,'数字电路与系统','(三)312','高强',digitalWeeks),
  course(112,5,6,2,'数字电路与系统','(三)312','李峭',alternateWeeks),
  course(105,4,6,2,'微波技术','新主楼 F433/420','全绍辉',range(12)),
  course(106,1,8,2,'微波技术','新主楼 F433/420','全绍辉',range(12)),
  course(107,2,8,3,'数字信号处理','主209','孙国良',range(16)),
  course(109,5,8,3,'电子电路（2）','主403','赵琦',range(16)),
  course(110,2,11,4,'电子信息基础实验','新主楼 F532/533','张玉玺',range(8)),
  course(113,3,8,2,'心理健康（5）','主南408','王慧琳',[8]),
  course(114,3,6,2,'国家安全（5）','主南205','赵廷弟',[12]),
];
export function termWeek(date:Date,termStart:string){return Math.round((monday(date).getTime()-monday(parseDate(termStart)).getTime())/604800000)+1}
export function schoolCourses(date:Date,termStart='2026-09-07'):Course[]{
  const week=termWeek(date,termStart);
  return RULES.filter(c=>c.weeks.includes(week)).map(({weeks,...c})=>{void weeks;return c});
}
export function weekCourses(data:Planner,date:Date):Course[]{
  const start=monday(date),key=dateKey(start);
  const own=data.schedules[key]??schoolCourses(start,data.termStart);
  const habits=data.habits.filter(h=>{const occurrence=dateKey(addDays(start,h.day-1));return occurrence>=h.startDate&&occurrence<=h.endDate}).map(h=>({id:h.id,habitId:h.id,day:h.day,period:h.period,span:h.span,title:h.title,kind:'habit' as const,breakTime:h.breakTime,note:h.note}));
  const position=(c:Course)=>c.breakTime==='lunch'?5.5:c.breakTime==='dinner'?10.5:c.period;
  return [...own,...habits].sort((a,b)=>a.day-b.day||position(a)-position(b));
}
export const coursePeriodLabel=(c:Course)=>c.breakTime==='lunch'?'午间休息':c.breakTime==='dinner'?'晚间休息':`第 ${c.period}${c.span>1?'–'+(c.period+c.span-1):''} 节`;
export function coursesOverlap(a:Course,b:Course){
  if(a.day!==b.day)return false;
  if(a.breakTime||b.breakTime)return !!a.breakTime&&a.breakTime===b.breakTime;
  return a.period<b.period+b.span&&b.period<a.period+a.span;
}
export function courseConflicts(courses:Course[]){
  return courses.filter((a,i)=>courses.some((b,j)=>i!==j&&coursesOverlap(a,b)));
}
export function validCourse(c:Course){return Number.isInteger(c.day)&&c.day>=1&&c.day<=7&&Number.isInteger(c.period)&&c.period>=1&&Number.isInteger(c.span)&&c.span>=1&&c.period+c.span<=15&&!!c.title.trim()&&[undefined,'lunch','dinner'].includes(c.breakTime)&&(c.note===undefined||typeof c.note==='string')}
export function termConflicts(data:Planner){
  const results:{date:string;first:Course;second:Course}[]=[];
  for(let week=0;week<19;week++){
    const start=addDays(parseDate(data.termStart),week*7),courses=weekCourses(data,start);
    courses.forEach((a,i)=>courses.slice(i+1).forEach(b=>{if(coursesOverlap(a,b))results.push({date:dateKey(addDays(start,a.day-1)),first:a,second:b})}));
  }
  return results;
}
export function bufferOccupations(data:Planner){
  return Array.from({length:19},(_,week)=>{
    const start=addDays(parseDate(data.termStart),week*7);
    return weekCourses(data,start).filter(c=>c.day===7||(c.day===3&&!c.breakTime&&c.period<11&&c.period+c.span>6)).map(course=>({date:dateKey(addDays(start,course.day-1)),course}));
  }).flat();
}
// Overlapping cards share their day's column rather than hiding one another.
export function courseLanes(courses:Course[]){
  const result=new Map<Course,{lane:number;count:number}>();
  const pending=new Set(courses);
  for(const seed of courses){
    if(!pending.delete(seed))continue;
    const group=[seed];
    for(let i=0;i<group.length;i++)for(const other of pending)if(coursesOverlap(group[i],other)){pending.delete(other);group.push(other)}
    const lanes:Course[][]=[];
    for(const c of group){let lane=lanes.findIndex(items=>items.every(other=>!coursesOverlap(c,other)));if(lane<0){lane=lanes.length;lanes.push([])}lanes[lane].push(c);result.set(c,{lane,count:0})}
    group.forEach(c=>{result.get(c)!.count=lanes.length});
  }
  return result;
}
export function actionableMilestones(data:Planner,today:string){
  return data.milestones.filter(m=>!m.done&&validDate(m.date)&&((validDate(m.actionDate)&&m.actionDate<=today)||m.date<=today)).sort((a,b)=>a.date.localeCompare(b.date));
}
export function noteReminders(data:Planner,day:string){
  const tomorrow=dateKey(addDays(parseDate(day),1));
  return [day,tomorrow].flatMap(eventDate=>(data.dayNotes[eventDate]??[]).map(title=>({
    eventDate,title,when:eventDate===day?'today' as const:'tomorrow' as const,
    preparation:eventDate===tomorrow&&title==='给组里买早饭'?'明早需要早起，今晚记得设好闹钟。':'',
  })));
}
export function currentTask(data:Planner,today:string){const id=data.current[today];return data.tasks.find(t=>t.id===id&&!t.done)}
export function setTaskDone(data:Planner,id:number,done:boolean,today:string):Planner{
  const task=data.tasks.find(t=>t.id===id);if(!task)return data;
  return {...data,tasks:data.tasks.map(t=>t.id===id?{...t,done,completedAt:done?today:undefined}:t),projects:data.projects.map(p=>p.id===task.projectId?{...p,todos:p.todos.map(t=>t.id===task.projectTodoId?{...t,done}:t)}:p)};
}
export function finishStep(data:Planner,id:number,today:string):Planner{
  const task=data.tasks.find(t=>t.id===id);if(!task||task.done)return data;
  if(!task.step?.trim()||task.step.trim()===task.title.trim())return setTaskDone(data,id,true,today);
  // Finishing a deliberately smaller action does not complete the parent task / project todo.
  return {...data,current:{...data.current,[today]:null},tasks:data.tasks.map(t=>t.id===id?{...t,step:undefined}:t),evidence:{...data.evidence,[today]:[...(data.evidence[today]??[]),`${task.step}（${task.project} · ${task.title}）`]}};
}
export function selectTask(data:Planner,id:number,today:string):Planner{return {...data,current:{...data.current,[today]:id},reviews:data.reviews[today]?{...data.reviews,[today]:{...data.reviews[today],closedAt:undefined}}:data.reviews,tasks:data.tasks.map(t=>t.id===id?{...t,plannedFor:today}:t)}}
export function closeDay(data:Planner,today:string):Planner{return {...data,reviews:{...data.reviews,[today]:{...(data.reviews[today]??emptyReview()),closedAt:new Date().toISOString()}},current:{...data.current,[today]:null}}}

export const periodRow=(period:number)=>period+1+(period>=6?1:0)+(period>=11?1:0);
export function courseSegments(c:Course){
  if(c.breakTime)return [{row:c.breakTime==='lunch'?7:13,span:1,continuation:false}];
  return [[1,5],[6,10],[11,14]].flatMap(([start,end])=>{
    const first=Math.max(start,c.period),last=Math.min(end,c.period+c.span-1);
    return first<=last?[{row:periodRow(first),span:last-first+1,continuation:first>c.period}]:[];
  });
}
export function migrateLegacy(raw:Record<string,string>,today:string):Planner{
  const data=emptyPlanner();data.legacy={...raw};
  const read=(key:string,fallback:unknown)=>raw[key]===undefined?fallback:JSON.parse(raw[key]);
  const daily=read('daylight-daily-tasks',{}) as Record<string,Task[]>;
  const tasks=new Map<number,Task>();
  Object.keys(daily).sort().forEach(day=>daily[day].forEach(t=>tasks.set(t.id,{...t,plannedFor:day,completedAt:t.done?day:undefined})));
  (read('daylight-tasks',[]) as Task[]).forEach(t=>{if(!tasks.has(t.id))tasks.set(t.id,{...t,plannedFor:today})});
  data.tasks=[...tasks.values()];
  data.projects=(read('daylight-projects',[]) as Project[]).map(p=>({...p,mainline:p.mainline??p.next??'',note:p.note??'',todos:p.todos??[]}));
  data.habits=read('daylight-habits',[]) as Habit[];data.ideas=read('daylight-ideas',[]) as Idea[];
  data.milestones=read('daylight-milestones',[]) as Milestone[];
  data.evidence=read('daylight-evidence',{}) as Planner['evidence'];data.checkins=read('daylight-flywheel-checkins',{}) as Planner['checkins'];
  const schedules=read('daylight-weekly-schedules',{}) as Planner['schedules'];
  // User explicitly requested all school arrangements follow the new workbook; preserve personal blocks.
  Object.entries(schedules).forEach(([key,courses])=>{
    data.schedules[key]=[...schoolCourses(parseDate(key)),...courses.filter(c=>c.kind!=='course'&&c.kind!=='habit')];
  });
  const mode=raw['daylight-mode'];if(mode==='steady'||mode==='sprint'||mode==='recovery')data.modes[today]=mode;
  return validatePlanner(data);
}

// Reject incompatible/corrupt restores before writing anything. Unknown legacy data is kept as text only.
export function validatePlanner(value:unknown):Planner{
  const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const text=(x:unknown)=>typeof x==='string';const id=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x);
  const array=(x:unknown,test:(x:Record<string,unknown>)=>boolean)=>Array.isArray(x)&&x.every(v=>obj(v)&&test(v));
  const map=(x:unknown,test:(x:unknown)=>boolean)=>obj(x)&&Object.values(x).every(test);
  const stringList=(x:unknown)=>Array.isArray(x)&&x.every(text);
  const courseValid=(x:Record<string,unknown>)=>id(x.id)&&text(x.title)&&['course','self','habit'].includes(String(x.kind))&&validCourse(x as Course)&&['teacher','location'].every(k=>x[k]===undefined||text(x[k]));
  if(!obj(value)||value.version!==6||!validDate(value.termStart))throw new Error('这份备份的格式或版本不适用。');
  const tasksOk=array(value.tasks,t=>id(t.id)&&text(t.title)&&text(t.project)&&typeof t.done==='boolean'&&typeof t.minutes==='number'&&Number.isFinite(t.minutes)&&t.minutes>=0&&t.minutes<=1440&&(t.step===undefined||text(t.step))&&(t.plannedFor===undefined||validDate(t.plannedFor))&&(t.completedAt===undefined||validDate(t.completedAt))&&(t.projectId===undefined||id(t.projectId))&&(t.projectTodoId===undefined||id(t.projectTodoId)));
  const projectsOk=array(value.projects,p=>id(p.id)&&text(p.name)&&text(p.mainline)&&text(p.note)&&text(p.color)&&array(p.todos,t=>id(t.id)&&text(t.title)&&typeof t.done==='boolean')&&['active','waiting','paused','done',undefined].includes(p.status as string|undefined)&&['next','progress','waiting','revisit'].every(k=>p[k]===undefined||text(p[k])));
  const valid=tasksOk&&projectsOk&&map(value.schedules,x=>array(x,courseValid))&&array(value.habits,h=>id(h.id)&&text(h.title)&&validDate(h.startDate)&&validDate(h.endDate)&&h.startDate<=h.endDate&&validCourse({...h,kind:'habit'} as Course))&&array(value.milestones,m=>id(m.id)&&text(m.title)&&text(m.date)&&typeof m.hot==='boolean'&&(m.action===undefined||text(m.action))&&(m.actionDate===undefined||text(m.actionDate))&&(m.done===undefined||typeof m.done==='boolean'))&&array(value.ideas,i=>id(i.id)&&text(i.title)&&text(i.category)&&text(i.note))&&map(value.evidence,stringList)&&map(value.checkins,stringList)&&map(value.reviews,r=>obj(r)&&text(r.note)&&text(r.next)&&text(r.feeling)&&(r.closedAt===undefined||text(r.closedAt)))&&map(value.modes,x=>['steady','sprint','recovery'].includes(String(x)))&&map(value.current,x=>x===null||id(x))&&map(value.courseNotes,text)&&map(value.legacy,text);
  if(!valid||!map(value.dayNotes??{},stringList)||!stringList(value.appliedUpdates??[]))throw new Error('数据有缺失或格式错误，原有记录没有被替换。');
  const data={...value,dayNotes:value.dayNotes??{},appliedUpdates:value.appliedUpdates??[]} as Planner;
  for(const items of [data.tasks,data.projects,data.habits,data.milestones,data.ideas])if(new Set(items.map(x=>x.id)).size!==items.length)throw new Error('备份中存在重复记录，未导入。');
  return data;
}
