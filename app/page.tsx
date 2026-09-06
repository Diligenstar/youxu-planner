'use client';
import {useEffect,useRef,useState} from 'react';
import {LEGACY_KEYS,STORAGE_KEY,actionableMilestones,addDays,applyRequestedUpdates,closeDay,currentTask,dateKey,emptyPlanner,emptyReview,finishStep,migrateLegacy,newId,noteReminders,parseDate,selectTask,setTaskDone,termWeek,validDate,validatePlanner,weekCourses} from './planner';
import type {Mode,Planner,Project,Review,Task} from './planner';
import {Modal,Schedule,Editors,ProjectList,Records} from './surfaces';
import type {Editor} from './surfaces';
import {PushSettings,usePushReminders} from './push';

type View='today'|'schedule'|'projects'|'records';
const NAV=[{id:'today',label:'今天',symbol:'○'},{id:'schedule',label:'课表',symbol:'▦'},{id:'projects',label:'项目',symbol:'◇'},{id:'records',label:'记录',symbol:'≋'}] as const;
const MODES:Record<Mode,string>={steady:'平常',sprint:'忙碌',recovery:'恢复'};
export default function Home(){
  const [data,setData]=useState<Planner>(emptyPlanner),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [view,setView]=useState<View>('today'),[now,setNow]=useState(()=>new Date()),[notice,setNotice]=useState('');
  const [input,setInput]=useState(''),[picker,setPicker]=useState(false),[help,setHelp]=useState(false),[step,setStep]=useState('');
  const [editor,setEditor]=useState<Editor|null>(null),[reviewOpen,setReviewOpen]=useState(false),[settings,setSettings]=useState(false);
  const [restore,setRestore]=useState<Planner|null>(null),[showDone,setShowDone]=useState(false);
  const [timer,setTimer]=useState<{taskId:number;end:number|null;remaining:number}|null>(null);
  const [undo,setUndo]=useState<Planner|null>(null);
  const push=usePushReminders(data.dayNotes,ready);
  const fileInput=useRef<HTMLInputElement>(null),toastRef=useRef<HTMLDivElement>(null);
  const today=dateKey(now),mode=data.modes[today]??'steady',active=currentTask(data,today);
  const review=data.reviews[today]??emptyReview(),due=actionableMilestones(data,today);
  const reminders=noteReminders(data,today);
  const todayCourses=weekCourses(data,now).filter(c=>c.day===(now.getDay()||7)&&c.kind==='course');
  const pastReview=Object.entries(data.reviews).filter(([day,r])=>day<today&&r.next.trim()).sort(([a],[b])=>b.localeCompare(a))[0];
  const timeLeft=timer?Math.max(0,timer.end?Math.ceil((timer.end-now.getTime())/1000):timer.remaining):0;
  useEffect(()=>{let alive=true;queueMicrotask(()=>{if(!alive)return;try{
    const saved=localStorage.getItem(STORAGE_KEY),raw:Record<string,string>={};LEGACY_KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)raw[k]=v});
    setData(applyRequestedUpdates(saved?validatePlanner(JSON.parse(saved)):migrateLegacy(raw,dateKey(new Date()))));setReady(true);
  }catch{setError('暂时无法读取本机记录。原数据已保留，请先导出原始备份，再重试或恢复备份。')}});
    if('serviceWorker' in navigator&&!['localhost','127.0.0.1'].includes(location.hostname))navigator.serviceWorker.register(new URL('sw.js',document.baseURI).pathname).catch(()=>{});
    return()=>{alive=false};
  },[]);
  useEffect(()=>{if(!ready)return;let message='';try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}catch{message='本次更改尚未保存，请立即导出备份。可能是存储空间不足或浏览器限制。'}queueMicrotask(()=>setError(message))},[data,ready]);
  useEffect(()=>{if(notice&&toastRef.current?.showPopover)toastRef.current.showPopover()},[notice]);
  useEffect(()=>{const tick=()=>setNow(new Date()),id=window.setInterval(tick,timer?.end?1000:30000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(id);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)}},[timer?.end]);
  const update=(fn:(d:Planner)=>Planner)=>{setUndo(null);setData(fn)};
  const checkpoint=(fn:(d:Planner)=>Planner,message:string)=>{setUndo(data);setData(fn);setNotice(message)};
  const download=(value:unknown,name:string)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  const backup=()=>download({app:'youxu',version:6,exportedAt:new Date().toISOString(),data},`有序备份-${today}.json`);
  const rawBackup=()=>{const values:Record<string,string>={};[STORAGE_KEY,...LEGACY_KEYS].forEach(k=>{const v=localStorage.getItem(k);if(v!==null)values[k]=v});download(values,`有序原始记录-${today}.json`)};
  const addTask=(title:string,options:Partial<Task>={},choose=false)=>{if(!title.trim())return;const task:Task={id:newId(),title:title.trim(),project:'收件箱',minutes:10,done:false,...options};update(d=>{const next={...d,tasks:[...d.tasks,task]};return choose?selectTask(next,task.id,today):next});if(choose){setView('today');setPicker(false)}return task};
  const capture=()=>{if(!input.trim())return;addTask(input);setInput('');setNotice('已记下，需要时再安排。')};
  const pick=(task:Task)=>{update(d=>selectTask(d,task.id,today));setPicker(false);setView('today');setTimer(null)};
  const complete=(task:Task,done=true)=>{checkpoint(d=>done?finishStep(d,task.id,today):setTaskDone(d,task.id,false,today),done?'已留下这一步。':'已改为待继续。');if(timer?.taskId===task.id)setTimer(null)};
  const start=()=>{if(!active)return;update(d=>({...d,tasks:d.tasks.map(t=>t.id===active.id?{...t,startedAt:t.startedAt??new Date().toISOString()}:t)}));setTimer({taskId:active.id,end:Date.now()+600000,remaining:600})};
  const saveReview=(patch:Partial<Review>)=>update(d=>({...d,reviews:{...d.reviews,[today]:{...(d.reviews[today]??emptyReview()),...patch}}}));
  const openReview=()=>{if(!data.reviews[today])saveReview({next:active?.step||active?.title||''});setReviewOpen(true)};
  const beginProject=(p:Project)=>{const title=p.next?.trim()||p.mainline.trim();if(!title){setEditor({kind:'project',value:{...p}});return}const t=data.tasks.find(t=>!t.done&&t.projectId===p.id&&t.title===title);if(t)pick(t);else addTask(title,{project:p.name,projectId:p.id},true)};
  const importFile=async(file:File)=>{try{if(file.size>15*1024*1024)throw new Error('备份文件过大。');const parsed=JSON.parse(await file.text());setRestore(validatePlanner(parsed.app==='youxu'?parsed.data:parsed))}catch(e){setNotice(e instanceof Error?e.message:'无法读取这份备份。')}};
  const onRestore=()=>{if(!restore)return;try{localStorage.setItem(STORAGE_KEY+'-before-restore',ready?JSON.stringify(data):localStorage.getItem(STORAGE_KEY)??'');checkpoint(()=>restore,'备份已恢复，可撤销。');setReady(true);setRestore(null);setSettings(false);setTimer(null)}catch{setNotice('无法保留恢复前的记录，尚未替换。')}};
  const restoreDialog=restore&&<Modal title="恢复这份备份？" onClose={()=>setRestore(null)}><p>恢复会替换本机记录。替换前会保留一份本机副本；你也可以先导出当前备份。</p><div className="actions"><button onClick={ready?backup:rawBackup}>导出当前备份</button><button className="primary" onClick={onRestore}>替换本机记录</button></div></Modal>;
  const filePicker=<input ref={fileInput} className="sr-only" type="file" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value=''}}/>;
  if(!ready)return <main className="startup"><span className="brand-mark">☀</span><h1>有序</h1><p>{error||'正在打开本机记录…'}</p>{error&&<div className="actions"><button onClick={rawBackup}>导出原始备份</button><button onClick={()=>location.reload()}>重试</button><button onClick={()=>fileInput.current?.click()}>恢复备份</button></div>}{filePicker}{restoreDialog}{notice&&<p role="status">{notice}</p>}</main>;
  return <main>
    <header className="topbar"><button className="brand" onClick={()=>setView('today')} aria-label="有序首页"><span className="brand-mark">☀</span>有序</button><span className="top-date">{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(now)}</span><button className="icon-button" aria-label="设置与备份" onClick={()=>setSettings(true)}>⋯</button></header>
    {error&&<div className="save-error" role="alert">{error}<button onClick={backup}>导出备份</button></div>}
    {push.syncError&&<div className="save-error" role="status">重要日期的通知更改尚未同步。<button onClick={()=>setSettings(true)}>查看通知设置</button></div>}
    <div className="app-shell"><aside className="side-nav"><nav aria-label="主导航">{NAV.map(n=><button key={n.id} aria-current={view===n.id?'page':undefined} onClick={()=>setView(n.id)}><span aria-hidden="true">{n.symbol}</span>{n.label}</button>)}</nav><p>不绝如缕，水滴石穿。</p><button className="text-button" onClick={()=>setSettings(true)}>设置与备份</button></aside><div className="workspace">
    {view==='today'&&<>
      <div className="page-heading"><div><p className="eyebrow">{termWeek(now,data.termStart)>0?`秋季学期 · 第 ${termWeek(now,data.termStart)} 周`:'开学前'}</p><h1>{review.closedAt?'今天已经收好':mode==='recovery'?'今天慢一点':mode==='sprint'?'先顾好眼前这一件':'先做眼前这一小步'}</h1></div><div className="mode-switch" aria-label="今天的节奏">{(Object.keys(MODES) as Mode[]).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>update(d=>({...d,modes:{...d.modes,[today]:m}}))}>{MODES[m]}</button>)}</div></div>
      <button className="class-summary" onClick={()=>setView('schedule')}><span className="summary-icon" aria-hidden="true">▦</span><span><small>今天的课</small><strong>{todayCourses.length?`${todayCourses[0].title} · 第 ${todayCourses[0].period} 节起`:'今天没有排课'}</strong>{todayCourses[0]?.location&&<span>{todayCourses[0].location}</span>}</span><span className="summary-link">查看当天 ›</span></button>
      {reminders.map((note,i)=><div className="date-note" key={note.eventDate+i}><span>{note.when==='today'?'今天':'明天'} · {note.eventDate.slice(5).replace('-','/')}</span><strong>{note.title}</strong>{note.preparation&&<p>{note.preparation}</p>}</div>)}
      {due[0]&&<div className="quiet-deadline"><span className="small-dot"/><span>{due[0].action||'有一项安排需要今天确认'}</span><button className="text-button" onClick={()=>setEditor({kind:'milestone',value:{...due[0]}})}>查看安排</button></div>}
      <section className="focus-card" aria-label="当前动作"><div className="section-heading"><p className="eyebrow">现在先做</p>{active&&<button className="text-button" onClick={()=>{setStep(active.step??'');setHelp(true)}}>调整</button>}</div>
      {active?<><h2>{active.step||active.title}</h2><p className="muted">{active.project}{active.minutes>0?` · 约 ${active.minutes} 分钟`:''}</p>{active.step&&active.step!==active.title&&<p className="parent-task">属于：{active.title}</p>}{active.projectId&&data.projects.find(p=>p.id===active.projectId)?.progress&&<p className="resume-context">上次停在：{data.projects.find(p=>p.id===active.projectId)?.progress}</p>}
        {timer?.taskId===active.id?<div className="timer-area"><div><span className="timer-time" role="timer">{String(Math.floor(timeLeft/60)).padStart(2,'0')}:{String(timeLeft%60).padStart(2,'0')}</span><span className="muted">{timeLeft===0?'这一小段到这里了':timer.end?'先做这一小段':'已暂停'}</span></div><div className="actions">{timeLeft>0?<button onClick={()=>setTimer(t=>t?{...t,remaining:timeLeft,end:t.end?null:Date.now()+timeLeft*1000}:t)}>{timer.end?'暂停':'继续'}</button>:<button onClick={start}>再做一段</button>}<button className="primary" onClick={()=>complete(active)}>完成这一步</button><button className="text-button" onClick={()=>{setTimer(null);setStep(active.step??'');setHelp(true)}}>留到下次</button></div></div>:<div className="focus-actions"><button className="primary" onClick={start}>开始 · 10 分钟</button><button onClick={()=>complete(active)}>完成这一步</button></div>}
        <details className="inline-details"><summary>任务详情</summary><p>可以直接行动，计时是可选的。</p><button onClick={()=>setEditor({kind:'task',value:{...active}})}>编辑任务</button></details>
      </>:<div className="focus-empty"><h2>{review.closedAt?'下次可以从这里继续':mode==='recovery'?'可以先留一点空白':'挑一件现在想做的事'}</h2><p>{review.closedAt?(review.next||'安排和记录都在这里。'):mode==='recovery'?'必要安排在上方，需要时再选一个轻动作。':'其他安排已经收在项目和收件箱里。'}</p><button className="primary" onClick={()=>setPicker(true)}>{review.closedAt?'选择接下来做什么':'选一个动作'}</button>{!review.closedAt&&pastReview&&<div className="last-step"><small>上次留给自己的下一步</small><p>{pastReview[1].next}</p><button className="text-button" onClick={()=>addTask(pastReview[1].next,{},true)}>接着做</button></div>}</div>}
      </section>
      <form className="capture" onSubmit={e=>{e.preventDefault();capture()}}><input aria-label="先记下一件事" value={input} onChange={e=>setInput(e.target.value)} placeholder="先记下来，不必现在安排"/><button type="submit">记下</button></form>
      <div className="home-secondary"><button className="text-button" onClick={()=>setPicker(true)}>收件箱与其他安排 ›</button><button className="text-button" onClick={openReview}>{review.closedAt?'查看今晚复盘':now.getHours()>=18?'收好今天 · 一分钟复盘':'晚间复盘'}</button></div>
      {now.getHours()>=18&&!review.closedAt&&<button className="evening-card" onClick={openReview}><span aria-hidden="true">☾</span><span><strong>今天先到这里</strong><small>看看留下了什么，给下次留一句话。</small></span><span>›</span></button>}
    </>}
    {view==='schedule'&&<Schedule data={data} now={now} update={update} setNotice={setNotice} setEditor={setEditor}/>}
    {view==='projects'&&<ProjectList data={data} today={today} setEditor={setEditor} beginProject={beginProject}/>}
    {view==='records'&&<Records data={data} today={today} update={update} checkpoint={checkpoint} setEditor={setEditor} complete={complete} openReview={openReview}/>}
    </div></div>
    <nav className="mobile-nav" aria-label="手机导航">{NAV.map(n=><button key={n.id} aria-current={view===n.id?'page':undefined} onClick={()=>setView(n.id)}><span aria-hidden="true">{n.symbol}</span>{n.label}</button>)}</nav>
    {notice&&<div ref={toastRef} popover="manual" className="toast" role="status"><span>{notice}</span>{undo&&<button onClick={()=>{setData(undo);setUndo(null);setNotice('已撤销。')}}>撤销</button>}<button aria-label="关闭提示" onClick={()=>{setNotice('');setUndo(null)}}>×</button></div>}
    {picker&&<Modal title="选一个现在的动作" onClose={()=>setPicker(false)}><p className="muted">未选中的安排会留在这里。</p><div className="segmented"><button aria-pressed={!showDone} onClick={()=>setShowDone(false)}>待继续</button><button aria-pressed={showDone} onClick={()=>setShowDone(true)}>已完成</button></div><div className="task-picker">{data.tasks.filter(t=>t.done===showDone).sort((a,b)=>(b.plannedFor===today?1:0)-(a.plannedFor===today?1:0)).map(t=><div className="pick-row" key={t.id}><button className="pick-title" disabled={t.done} onClick={()=>pick(t)}><strong>{t.step||t.title}</strong><small>{t.project}{t.plannedFor&&t.plannedFor<today?' · 上次的安排':''}</small></button><button className="text-button" onClick={()=>setEditor({kind:'task',value:{...t}})}>编辑</button></div>)}{!data.tasks.some(t=>t.done===showDone)&&<p className="empty-note">这里暂时没有事项。</p>}</div><form className="capture" onSubmit={e=>{e.preventDefault();capture()}}><input aria-label="记一个新动作" value={input} onChange={e=>setInput(e.target.value)} placeholder="先记下一句话"/><button>记下</button></form></Modal>}
    {help&&<Modal title="需要什么帮助？" onClose={()=>setHelp(false)}><div className="help-options"><details open><summary>缩小一点</summary><label>这次先做哪一步<input value={step} onChange={e=>setStep(e.target.value)} placeholder="例如：只打开文件，标出一个问题"/></label><button onClick={()=>{if(active&&step.trim())update(d=>({...d,tasks:d.tasks.map(t=>t.id===active.id?{...t,step:step.trim()}:t)}));setHelp(false)}}>留好这一步</button></details><button className="help-choice" onClick={()=>{setHelp(false);setPicker(true)}}><strong>重新选一件</strong><small>换一个适合现在的动作。</small></button><button className="help-choice" onClick={()=>{setTimer(null);setHelp(false);setNotice('已停在这里，回来可以继续。')}}><strong>先休息</strong><small>当前位置会保留。</small></button></div></Modal>}
    {reviewOpen&&<Modal title="今天先到这里" onClose={()=>setReviewOpen(false)}>
      <p className="muted">已自动保存，可以只看一眼，也可以直接收好。</p>
      <div className="review-evidence"><h3>今天留下了什么</h3>
        {data.tasks.filter(t=>t.done&&t.completedAt===today).map(t=><p key={t.id}>✓ {t.step||t.title}</p>)}
        {(data.evidence[today]??[]).map((v,i)=><p key={i}>· {v}</p>)}
        {!data.tasks.some(t=>t.done&&t.completedAt===today)&&!data.evidence[today]?.length&&<p className="muted">今天没有记录也没关系。</p>}
      </div>
      <label>想补一句吗（可留空）<textarea value={review.note} onChange={e=>saveReview({note:e.target.value})} placeholder="今天发生过的一件事"/></label>
      <label>下次从哪里继续（可留空）<textarea value={review.next} onChange={e=>saveReview({next:e.target.value})} placeholder="给下次的自己留一句话"/></label>
      <details className="inline-details"><summary>记一句今天的感受</summary><textarea aria-label="今天的感受" value={review.feeling} onChange={e=>saveReview({feeling:e.target.value})}/></details>
      {reminders.filter(n=>n.when==='tomorrow').map((note,i)=><div className="date-note" key={i}><span>明天要记得</span><strong>{note.title}</strong>{note.preparation&&<p>{note.preparation}</p>}</div>)}
      {(()=>{const tomorrow=addDays(now,1),m=actionableMilestones(data,dateKey(tomorrow))[0],c=weekCourses(data,tomorrow).find(c=>c.day===(tomorrow.getDay()||7)&&c.kind==='course');return (m||c)?<p className="review-reminder">明天的必要安排：{m?`${m.title}（${m.date} 截止）`:`${c!.title} · 第 ${c!.period} 节`}</p>:null})()}
      <button className="primary full-width" onClick={()=>{update(d=>closeDay(d,today));setTimer(null);setReviewOpen(false);setNotice('今天已经收好，其他安排仍在原处。')}}>收好今天</button>
    </Modal>}
    {editor&&<Editors editor={editor} setEditor={setEditor} data={data} today={today} update={update} checkpoint={checkpoint} setNotice={setNotice} addTask={addTask} pick={pick}/>}
    {settings&&<Modal title="设置与备份" onClose={()=>setSettings(false)}><p>记录自动保存在当前浏览器。换设备或清理浏览器前，请导出备份。</p><div className="actions"><button onClick={backup}>导出完整备份</button><button onClick={()=>fileInput.current?.click()}>恢复备份</button></div><PushSettings push={push}/><label>学期第一周的周一<input type="date" value={data.termStart} onChange={e=>{if(validDate(e.target.value)&&parseDate(e.target.value).getDay()===1)update(d=>({...d,termStart:e.target.value}));else setNotice('请选择第一周的周一。')}}/></label><p className="muted">课程已按新课表设置。手动调整过的周可在课表中“更新学校课程”。</p><details className="inline-details"><summary>升级前的原始记录</summary><p>旧版记录保留在完整备份里。</p><button onClick={()=>download(data.legacy,`有序旧版记录-${today}.json`)}>导出旧版原始记录</button></details></Modal>}
    {filePicker}{restoreDialog}
  </main>;
}
