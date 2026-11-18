export interface LocalDateParts { readonly year: number; readonly month: number; readonly day: number; }
function partsAt(date: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}
function localMidnightToUtc(parts: LocalDateParts, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let guess = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const fields = formatter.formatToParts(new Date(guess));
    const value = (type: string): number => Number(fields.find((part) => part.type === type)?.value);
    const observedLocalAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    const offset = observedLocalAsUtc - guess;
    const corrected = target - offset;
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess);
}
export function localDateKey(now: Date, timeZone: string): string {
  const { year, month, day } = partsAt(now, timeZone);
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}
export function nextLocalMidnight(now: Date, timeZone: string): Date {
  const current = partsAt(now, timeZone);
  const nextDay = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  return localMidnightToUtc({ year: nextDay.getUTCFullYear(), month: nextDay.getUTCMonth() + 1, day: nextDay.getUTCDate() }, timeZone);
}
