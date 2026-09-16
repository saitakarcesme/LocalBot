/** Read the runtime host clock once, and format that same instant in the requested zone. */
export function currentTime(timeZone = 'UTC', instant = new Date()) {
  if (!timeZone || timeZone.length > 100) throw new Error('Invalid time zone');
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      timeZoneName: 'longOffset',
    });
  } catch { throw new Error('Unknown time zone; use UTC or an IANA zone such as Europe/Luxembourg'); }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
  return {
    utc: instant.toISOString(), unixMilliseconds: instant.getTime(),
    timeZone: formatter.resolvedOptions().timeZone,
    local: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
    utcOffset: parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', ''),
    source: 'runtime-system-clock',
  };
}
