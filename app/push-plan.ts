export type PushTimes = {before: string; today: string};
export type PushJob = {id: string; at: number; title: string; body: string};
export const DEFAULT_PUSH_TIMES: PushTimes = {before: '20:00', today: '07:00'};
export function buildPushJobs(notes: Record<string, string[]>, times: PushTimes, now = Date.now()): PushJob[] {
  const jobs: PushJob[] = [];
  for (const [day, values] of Object.entries(notes)) {
    const titles = values.map(v => v.trim()).filter(Boolean);
    if (!titles.length || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    for (const phase of ['before', 'today'] as const) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(times[phase])) continue;
      // Semester events use China time, even when this device travels abroad.
      const at = Date.parse(`${day}T${times[phase]}:00+08:00`) - (phase === 'before' ? 86400000 : 0);
      if (!Number.isFinite(at) || at <= now || at > now + 400 * 86400000) continue;
      const breakfast = titles.some(t => /买.*早[饭餐]/.test(t));
      const body = titles.slice(0, 3).join('；') + (titles.length > 3 ? ` 等 ${titles.length} 项` : '') +
        (breakfast && phase === 'before' ? '。明早需要早起，今晚记得设好闹钟、早点休息。' : '');
      jobs.push({id: `${day}:${phase}`, at, title: phase === 'before' ? '有序 · 明天要记得' : '有序 · 今天要记得', body: body.slice(0, 1000)});
    }
  }
  return jobs.sort((a, b) => a.at - b.at).slice(0, 500);
}
