/** The offset of `timeZone` from UTC at an instant, in milliseconds (east is positive). */
export function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The instant at which the wall clock of `timeZone` reads `year-month-day hour:minute`.
 * An event is announced in the time of the place it happens, so this is how what a
 * person types becomes the UTC instant the API stores. A time that does not exist
 * (the hour skipped by a spring-forward) resolves to the instant just after the gap.
 */
export function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let result = naive - zoneOffsetMs(naive, timeZone);
  // Across a DST change the offset at the guess differs from the offset at the answer.
  const corrected = naive - zoneOffsetMs(result, timeZone);
  if (corrected !== result) result = corrected;
  return new Date(result);
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseTime(text: string): { hour: number; minute: number } | null {
  const match = TIME.exec(text.trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
