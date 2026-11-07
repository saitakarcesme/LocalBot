// Routine schedules. Wall-clock times are interpreted in the user's time zone, so
// "every weekday at 09:00" stays at 09:00 across daylight-saving changes.
//
//   {type:'once', at: <ms>}
//   {type:'interval', minutes: <n>}
//   {type:'daily', time:'HH:MM', days?: [0..6]}      (0 = Sunday; all days when absent)
//   {type:'monthly', day: 1..31, time:'HH:MM'}        (clamped to the month's last day)
//   {type:'hook'}                                     (runs only when its local webhook is called)

export function validZone(zone) {
  if (!zone || zone === 'system') return Intl.DateTimeFormat().resolvedOptions().timeZone;
  try { new Intl.DateTimeFormat('en-US', {timeZone: zone}); return zone; } catch { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
}

function partsIn(zone, ms) {
  const f = new Intl.DateTimeFormat('en-US', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short'});
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return {y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)};
}

/** The instant at which the wall clock in `zone` shows the given date and time. */
export function zonedToUtc(zone, y, mo, d, h, mi) {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const p = partsIn(zone, guess);
    const shown = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    const diff = Date.UTC(y, mo - 1, d, h, mi) - shown;
    if (!diff) break;
    guess += diff;
  }
  return guess;
}

export function normalizeSchedule(input) {
  const s = input && typeof input === 'object' ? input : {};
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ? s.time : '09:00';
  if (s.type === 'once') { const at = Number(s.at); if (!Number.isFinite(at)) throw Error('Pick a date and time'); return {type: 'once', at}; }
  if (s.type === 'interval') { const minutes = Math.round(Number(s.minutes)); if (!(minutes >= 1 && minutes <= 525600)) throw Error('Repeat must be between 1 minute and 1 year'); return {type: 'interval', minutes}; }
  if (s.type === 'daily') {
    const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number).filter(d => d >= 0 && d <= 6))].sort() : [];
    return {type: 'daily', time, ...(days.length && days.length < 7 ? {days} : {})};
  }
  if (s.type === 'monthly') { const day = Math.round(Number(s.day)); if (!(day >= 1 && day <= 31)) throw Error('Pick a day of the month'); return {type: 'monthly', day, time}; }
  if (s.type === 'hook') return {type: 'hook'};
  throw Error('Unknown schedule');
}

/** Next run strictly after `after`, or null when the schedule never fires again by itself. */
export function nextRun(schedule, after = Date.now(), zone = 'system') {
  const tz = validZone(zone);
  if (schedule.type === 'once') return schedule.at > after ? schedule.at : null;
  if (schedule.type === 'interval') return after + schedule.minutes * 60000;
  if (schedule.type === 'hook') return null;
  const [h, mi] = schedule.time.split(':').map(Number);
  const start = partsIn(tz, after);
  if (schedule.type === 'daily') {
    for (let i = 0; i < 9; i++) {
      const day = new Date(Date.UTC(start.y, start.mo - 1, start.d + i));
      const at = zonedToUtc(tz, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi);
      if (at > after && (!schedule.days || schedule.days.includes(day.getUTCDay()))) return at;
    }
    return null;
  }
  if (schedule.type === 'monthly') {
    for (let i = 0; i < 14; i++) {
      const first = new Date(Date.UTC(start.y, start.mo - 1 + i, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      const at = zonedToUtc(tz, first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(schedule.day, last), h, mi);
      if (at > after) return at;
    }
  }
  return null;
}

/** Old rows only have next + interval. */
export function scheduleOf(routine) {
  try { if (routine.schedule) return normalizeSchedule(JSON.parse(routine.schedule)); } catch {}
  return routine.interval ? {type: 'interval', minutes: Math.max(1, Math.round(routine.interval / 60000))} : {type: 'once', at: routine.next};
}
