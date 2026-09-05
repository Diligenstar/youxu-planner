import {DurableObject} from 'cloudflare:workers';
import webpush from 'web-push';
import {validateRegistration, nextAlarm, afterDelivery} from './validation.mjs';

const json = (body, status = 200) => Response.json(body, {status});
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');
}

const worker = {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = origin === env.SITE_ORIGIN || (env.SITE_ORIGIN === 'http://127.0.0.1:5173' && origin === env.SITE_ORIGIN);
    if (origin && !allowed) return json({error: '来源不匹配。'}, 403);
    const headers = {'Access-Control-Allow-Origin': env.SITE_ORIGIN, 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Vary': 'Origin', 'Cache-Control': 'no-store'};
    let response;
    try {
      const path = new URL(request.url).pathname;
      if (request.method === 'OPTIONS') response = new Response(null, {status: 204});
      else if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) response = json({error: '推送服务尚未配置。'}, 503);
      else if (path === '/config' && request.method === 'GET') response = json({publicKey: env.VAPID_PUBLIC_KEY});
      else {
        const match = path.match(/^\/devices\/([a-f0-9]{32})(\/test)?$/);
        if (!match) response = json({error: '不存在的地址。'}, 404);
        else {
          if (Number(request.headers.get('Content-Length')) > 250000) return json({error: '内容过大。'}, 413);
          const id = env.REMINDERS.idFromName(match[1]);
          response = await env.REMINDERS.get(id).fetch(request);
        }
      }
    } catch { response = json({error: '推送服务暂时不可用，请稍后重试。'}, 503); }
    const result = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
    return result;
  }
};
export default worker;

export class ReminderDevice extends DurableObject {
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
      if (!/^[a-f0-9]{64}$/.test(token)) return json({error: '缺少设备凭证。'}, 401);
      const tokenHash = await hash(token);
      const saved = await this.ctx.storage.get('device');
      if (saved && saved.tokenHash !== tokenHash) return json({error: '设备凭证不匹配。'}, 403);
      const isTest = new URL(request.url).pathname.endsWith('/test');
      if (isTest && request.method !== 'POST') return json({error: '不支持的操作。'}, 405);
      if (request.method === 'PUT' && !isTest) {
        let value;
        try {
          const text = await request.text();
          if (text.length > 250000) return json({error: '内容过大。'}, 413);
          value = validateRegistration(JSON.parse(text));
        } catch (error) { return json({error: error.message}, 400); }
        const sent = Object.fromEntries(Object.entries(saved?.sent ?? {}).filter(([, at]) => at > Date.now() - 400 * 86400000));
        const device = {...value, tokenHash, sent, jobs: value.jobs.filter(j => !sent[j.id]), enabled: true, lastTest: saved?.lastTest ?? 0};
        await this.ctx.storage.put('device', device);
        await this.schedule(device.jobs);
        return json({enabled: true, count: device.jobs.length});
      }
      if (!saved) return json({error: '这台设备尚未开启推送。'}, 404);
      if (request.method === 'GET') return json({enabled: saved.enabled, count: saved.jobs.length});
      if (request.method === 'DELETE') {
        // Keep the credential hash so a stale request cannot claim this device again.
        await this.ctx.storage.put('device', {tokenHash, sent: saved.sent, jobs: [], enabled: false});
        await this.ctx.storage.deleteAlarm();
        return json({enabled: false});
      }
      if (isTest) {
        if (!saved.enabled) return json({error: '请先开启推送。'}, 409);
        if (Date.now() - saved.lastTest < 30000) return json({error: '请稍等半分钟再测试。'}, 429);
        saved.lastTest = Date.now();
        await this.ctx.storage.put('device', saved);
        const status = await this.send(saved.subscription, {id: 'test', title: '有序 · 测试提醒', body: '通知已连通。重要日期会在前一天晚上和当天早上提醒你。'});
        if (status === 404 || status === 410) {saved.enabled = false; saved.jobs = []; await this.ctx.storage.put('device', saved); await this.ctx.storage.deleteAlarm();}
        return status >= 200 && status < 300 ? json({accepted: true}) : json({error: '推送服务未接受测试，请重新开启通知。'}, 502);
      }
      return json({error: '不支持的操作。'}, 405);
    });
  }
  async schedule(jobs) {
    const at = nextAlarm(jobs);
    if (at) await this.ctx.storage.setAlarm(at); else await this.ctx.storage.deleteAlarm();
  }
  async send(subscription, job) {
    try {
      const details = webpush.generateRequestDetails(subscription, JSON.stringify({title: job.title, body: job.body, tag: 'youxu-' + job.id}), {
        TTL: 7200, urgency: 'normal', vapidDetails: {subject: 'https://diligenstar.github.io/youxu-planner/', publicKey: this.env.VAPID_PUBLIC_KEY, privateKey: this.env.VAPID_PRIVATE_KEY}
      });
      const response = await fetch(details.endpoint, {method: 'POST', headers: details.headers, body: details.body, redirect: 'error', signal: AbortSignal.timeout(10000)});
      return response.status;
    } catch { return 0; }
  }
  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const device = await this.ctx.storage.get('device');
      if (!device?.enabled) return;
      // A watchdog covers interruption after a push request but before state is persisted.
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      const jobs = [];
      let processed = 0;
      for (const job of device.jobs) {
        if ((job.retryAt ?? job.at) > Date.now()) {jobs.push(job); continue;}
        if (Date.now() > job.at + 2 * 3600000) continue;
        if (processed >= 2) {jobs.push(job); continue;}
        processed++;
        const result = afterDelivery(job, await this.send(device.subscription, job));
        if (result === 'expired') {device.enabled = false; jobs.length = 0; break;}
        if (result === 'sent') device.sent[job.id] = Date.now();
        else if (typeof result === 'object') jobs.push(result);
      }
      device.jobs = jobs;
      await this.ctx.storage.put('device', device);
      await this.schedule(jobs);
    });
  }
}
