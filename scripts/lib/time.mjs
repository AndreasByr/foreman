// Local weekday, hour and date in a time zone (IANA name).
const DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(date, tz = "UTC") {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return {
    weekday: DAYS[p.find((x) => x.type === "weekday")?.value],
    hour: Number(p.find((x) => x.type === "hour")?.value),
    date: day,
  };
}
