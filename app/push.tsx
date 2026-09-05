'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {buildPushJobs, DEFAULT_PUSH_TIMES} from './push-plan';
import type {PushTimes} from './push-plan';
import config from './push-config.json';

const KEY = 'youxu-push-device-v1';
type Device = {id: string; token: string; enabled: boolean; times: PushTimes};
const randomHex = (size: number) => Array.from(crypto.getRandomValues(new Uint8Array(size)), n => n.toString(16).padStart(2, '0')).join('');
function save(device: Device) {localStorage.setItem(KEY, JSON.stringify(device));}
let pending: Promise<unknown> = Promise.resolve();
function api(device: Device, method: string, value?: unknown, suffix = '') {
  const operation = pending.then(() => request(device, method, value, suffix));
  pending = operation.catch(() => {});
  return operation;
}
async function request(device: Device, method: string, value?: unknown, suffix = '') {
  const response = await fetch(`${config.serviceUrl}/devices/${device.id}${suffix}`, {
    method, headers: {'Authorization': `Bearer ${device.token}`, 'Content-Type': 'application/json'},
    ...(value ? {body: JSON.stringify(value)} : {}), signal: AbortSignal.timeout(20000)
  });
  const result = await response.json() as {error?: string};
  if (!response.ok) throw new Error(result.error || '暂时无法连接推送服务。');
  return result;
}
async function registration() {
  await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).pathname);
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('通知组件还未准备好，请刷新网页后重试。')), 15000))
  ]);
}
const message = (error: unknown) => error instanceof Error ? error.message : '暂时未能连接推送服务。';

export function usePushReminders(notes: Record<string, string[]>, ready: boolean) {
  const [device, setDevice] = useState<Device | null>(null), [loaded, setLoaded] = useState(false);
  const [times, setTimes] = useState<PushTimes>(DEFAULT_PUSH_TIMES), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const revision = useRef(0), synced = useRef('');
  const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  useEffect(() => {queueMicrotask(() => {
    try {const raw = localStorage.getItem(KEY); if (raw) {const d = JSON.parse(raw); if (/^[a-f0-9]{32}$/.test(d.id) && /^[a-f0-9]{64}$/.test(d.token)) {setDevice(d); setTimes(d.times ?? DEFAULT_PUSH_TIMES);}}}
    catch {setStatus('无法读取本机通知设置，请重新开启。');}
    setLoaded(true);
  });}, []);
  const sync = useCallback(async (d: Device) => {
    const version = revision.current;
    const reg = await registration(), sub = await reg.pushManager.getSubscription();
    if (version !== revision.current) return 0;
    if (!sub || Notification.permission !== 'granted') throw new Error('通知权限或订阅已失效，请重新开启。');
    const jobs = buildPushJobs(notes, d.times);
    await api(d, 'PUT', {subscription: sub.toJSON(), jobs});
    return jobs.length;
  }, [notes]);
  useEffect(() => {
    if (!ready || !loaded || !device?.enabled || !config.serviceUrl || busy) return;
    let alive = true;
    const version = revision.current;
    const key = JSON.stringify([notes, device.times]);
    const run = async () => {
      if (!alive || synced.current === key) return;
      try {await sync(device); if (alive && version === revision.current) {synced.current = key; setSyncError('');}}
      catch (error) {if (alive) setSyncError('提醒更改尚未同步：' + message(error));}
    };
    const timeout = setTimeout(() => void run(), 1000);
    const retry = setInterval(() => void run(), 60000);
    window.addEventListener('online', run);
    return () => {alive = false; clearTimeout(timeout); clearInterval(retry); window.removeEventListener('online', run);};
  }, [notes, device, ready, loaded, busy, sync]);

  const enable = async () => {
    if (busy) return;
    setBusy(true); setStatus('正在连接…'); revision.current++;
    try {
      if (!Object.values(times).every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('请填写完整的两次提醒时间。');
      if (!supported) throw new Error('当前浏览器不支持推送。iPhone 请先将网站添加到主屏幕，再从主屏幕打开。');
      if (!config.serviceUrl) throw new Error('后台服务尚未连接，暂时不能开启主动推送。');
      // Ask directly from the button gesture (required by Safari).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('未获得通知权限。你可以在浏览器的网站设置里允许通知后重试。');
      const response = await fetch(`${config.serviceUrl}/config`, {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('推送服务暂时不可用。');
      const {publicKey} = await response.json() as {publicKey: string};
      const binary = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'));
      const reg = await registration();
      let existing = await reg.pushManager.getSubscription();
      if (device?.enabled && existing) {await existing.unsubscribe(); existing = null;}
      const sub = existing ?? await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: Uint8Array.from(binary, c => c.charCodeAt(0))});
      const next = {...(device ?? {id: randomHex(16), token: randomHex(32)}), enabled: false, times};
      save(next); setDevice(next);
      const jobs = buildPushJobs(notes, times);
      await api(next, 'PUT', {subscription: sub.toJSON(), jobs});
      next.enabled = true; save(next); setDevice({...next}); synced.current = JSON.stringify([notes, times]); setSyncError('');
      setStatus(jobs.length ? '主动推送已开启。可以发一条测试通知确认。' : '主动推送已开启。新增日期备注后会自动安排提醒。');
    } catch (error) {setStatus(message(error));} finally {setBusy(false);}
  };
  const disable = async () => {
    if (!device || busy) return;
    setBusy(true); revision.current++;
    try {
      // Remove scheduled jobs before reporting success, including when offline.
      await api(device, 'DELETE');
      const next = {...device, enabled: false}; save(next); setDevice(next); synced.current = ''; setSyncError('');
      const sub = await (await registration()).pushManager.getSubscription();
      await sub?.unsubscribe();
      setStatus('主动推送已关闭。');
    } catch (error) {setStatus('关闭尚未完成，请联网重试。' + message(error));} finally {setBusy(false);}
  };
  const saveTimes = async () => {
    if (!device?.enabled) return;
    setBusy(true); revision.current++;
    try {if (!Object.values(times).every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error('请填写完整的两次提醒时间。'); const next = {...device, times}; await sync(next); save(next); setDevice(next); synced.current = JSON.stringify([notes, times]); setSyncError(''); setStatus('提醒时间已更新。');}
    catch (error) {setStatus('提醒时间尚未更新。' + message(error));} finally {setBusy(false);}
  };
  const test = async () => {
    if (!device?.enabled) return;
    setBusy(true);
    try {await api(device, 'POST', undefined, '/test'); setStatus('测试通知已交给设备推送服务，请查看系统通知。');}
    catch (error) {setStatus(message(error));} finally {setBusy(false);}
  };
  return {enabled: !!device?.enabled, times, setTimes, status, syncError, busy, supported, configured: !!config.serviceUrl, enable, disable, saveTimes, test};
}

export function PushSettings({push}: {push: ReturnType<typeof usePushReminders>}) {
  return <section className="push-settings"><h3>重要日期提醒</h3><p>仅提醒课表里的日期备注。关闭网页后也可收到，不会推送整份 DDL 清单。</p>
    <div className="push-times"><label>前一天晚上<input type="time" value={push.times.before} onChange={e => push.setTimes(t => ({...t, before: e.target.value}))}/></label><label>当天早上<input type="time" value={push.times.today} onChange={e => push.setTimes(t => ({...t, today: e.target.value}))}/></label></div>
    <p className="muted">按北京时间发送。买早饭的前晚会提醒早睡、设好闹钟。系统省电、免打扰或网络状况可能影响送达，早起请同时设闹钟。</p>
    {!push.configured && <p>推送后台尚未连接，目前只有网页内提醒。</p>}
    {!push.supported && <p>iPhone 请先用 Safari 将网站添加到主屏幕，再从主屏幕开启通知。</p>}
    <div className="actions">{push.enabled ? <><button disabled={push.busy} onClick={push.saveTimes}>保存提醒时间</button><button disabled={push.busy} onClick={push.test}>发送测试通知</button><button disabled={push.busy} onClick={push.disable}>关闭推送</button><button className="text-button" disabled={push.busy} onClick={push.enable}>重新连接</button></> : <button className="primary" disabled={push.busy || !push.configured} onClick={push.enable}>开启本机主动推送</button>}</div>
    <p className="muted">开启后，会将日期备注、提醒时间和本机推送订阅发送到提醒服务。其他任务、项目和复盘仍只保存在本机。每台设备需单独开启。</p>
    {(push.status || push.syncError) && <p role="status">{push.syncError || push.status}</p>}
  </section>;
}
