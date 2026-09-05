import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import {buildPushJobs, DEFAULT_PUSH_TIMES} from '../app/push-plan.ts';
import {validateRegistration, nextAlarm, afterDelivery} from '../push-worker/validation.mjs';

const now = Date.parse('2026-09-05T12:00:00+08:00');
test('早餐按北京时间前晚和当天提醒，内容含早起准备，不依赖网页打开', () => {
  const jobs = buildPushJobs({'2026-12-04': ['给组里买早饭']}, DEFAULT_PUSH_TIMES, now);
  assert.equal(jobs.length, 2);
  assert.equal(new Date(jobs[0].at).toISOString(), '2026-12-03T12:00:00.000Z');
  assert.equal(new Date(jobs[1].at).toISOString(), '2026-12-03T23:00:00.000Z');
  assert.match(jobs[0].body, /设好闹钟/);
  assert.equal(jobs[1].body, '给组里买早饭');
});
test('跨年、修改时间、删除备注、过去的时间与同日合并', () => {
  const notes = {'2027-01-01': ['买早餐', '带材料']};
  const jobs = buildPushJobs(notes, {before: '21:30', today: '06:40'}, now);
  assert.equal(new Date(jobs[0].at).toISOString(), '2026-12-31T13:30:00.000Z');
  assert.match(jobs[0].body, /买早餐；带材料/);
  assert.equal(buildPushJobs(notes, DEFAULT_PUSH_TIMES, Date.parse('2027-01-01T08:00:00+08:00')).length, 0);
  assert.deepEqual(buildPushJobs({}, DEFAULT_PUSH_TIMES, now), []);
  assert.deepEqual(buildPushJobs(notes, {before: '', today: '25:00'}, now), []);
});
const keys = webpush.generateVAPIDKeys();
const subscription = {endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: {p256dh: keys.publicKey, auth: 'a'.repeat(22)}};
test('后台只接受合法的标准推送地址，拒绝内网、重复和过期任务', () => {
  const jobs = buildPushJobs({'2026-12-04': ['给组里买早饭']}, DEFAULT_PUSH_TIMES, now);
  assert.equal(validateRegistration({subscription, jobs}, now).jobs.length, 2);
  for (const endpoint of ['http://127.0.0.1/', 'https://fcm.googleapis.com.attacker.example/', 'https://fcm.googleapis.com:8080/', 'https://user:pass@fcm.googleapis.com/']) {
    assert.throws(() => validateRegistration({subscription: {...subscription, endpoint}, jobs}, now));
  }
  assert.throws(() => validateRegistration({subscription, jobs: [jobs[0], jobs[0]]}, now));
  assert.throws(() => validateRegistration({subscription, jobs}, jobs[1].at));
});
test('后台排下一次闹钟，重试临时失败并清理失效订阅', () => {
  const job = {id: '2026-12-04:today', at: now, title: '今天要记得', body: '买早饭'};
  assert.equal(nextAlarm([], now), null);
  assert.equal(nextAlarm([{...job, at: now + 10000}], now), now + 10000);
  assert.equal(afterDelivery(job, 201, now), 'sent');
  assert.equal(afterDelivery(job, 410, now), 'expired');
  assert.equal(afterDelivery(job, 403, now), 'failed');
  const retry = afterDelivery(job, 503, now);
  assert.equal(retry.attempts, 1);
  assert.equal(nextAlarm([retry], now), now + 60000);
  assert.equal(afterDelivery({...job, attempts: 5}, 503, now), 'failed');
  assert.equal(afterDelivery(job, 503, now + 3 * 3600000), 'failed');
});
