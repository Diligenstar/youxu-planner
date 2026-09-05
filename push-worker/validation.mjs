export function validateRegistration(value, now = Date.now()) {
  const sub = value?.subscription;
  let url;
  try { url = new URL(sub?.endpoint); } catch { throw new Error('无效的推送订阅。'); }
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns.windows.com', 'notify.windows.com'];
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      !allowed.some(host => url.hostname === host || (host !== 'fcm.googleapis.com' && url.hostname.endsWith('.' + host)))) throw new Error('不支持这个推送服务。');
  if (!/^[\w-]{87}=?$/.test(sub.keys?.p256dh ?? '') || !/^[\w-]{22}={0,2}$/.test(sub.keys?.auth ?? '')) throw new Error('无效的订阅密钥。');
  if (!Array.isArray(value.jobs) || value.jobs.length > 500) throw new Error('提醒数量过多。');
  const ids = new Set();
  const jobs = value.jobs.map(job => {
    if (!/^\d{4}-\d{2}-\d{2}:(before|today)$/.test(job.id) || ids.has(job.id) ||
        !Number.isFinite(job.at) || job.at <= now || job.at > now + 400 * 86400000 ||
        typeof job.title !== 'string' || !job.title.trim() || job.title.length > 80 ||
        typeof job.body !== 'string' || job.body.length > 1000) throw new Error('提醒内容或时间无效，请重新保存。');
    ids.add(job.id);
    return {id: job.id, at: job.at, title: job.title, body: job.body};
  });
  return {subscription: {endpoint: url.href, keys: {p256dh: sub.keys.p256dh, auth: sub.keys.auth}}, jobs};
}

export function nextAlarm(jobs, now = Date.now()) {
  return jobs.length ? Math.max(now + 1000, Math.min(...jobs.map(j => j.retryAt ?? j.at))) : null;
}

export function afterDelivery(job, status, now = Date.now()) {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'expired';
  const attempts = (job.attempts ?? 0) + 1;
  if ((status === 0 || status === 429 || status >= 500) && attempts < 6 && now < job.at + 2 * 3600000) {
    return {...job, attempts, retryAt: now + Math.min(30 * 60000, 60000 * 2 ** (attempts - 1))};
  }
  return 'failed';
}
