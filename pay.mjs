const DAY = 1440;
const EFFECTIVE_DATE = "2026-07-01";
const RATES = {
  ordinary: ["Weekday ordinary", 377900],
  early: ["Weekday night (early morning)", 443466],
  evening: ["Weekday night (evening)", 443466],
  saturday: ["Saturday", 529060],
  sunday: ["Sunday", 680220],
  firstOT: ["Mon–Sat overtime (first 2 hours per day)", 453480],
  laterOT: ["Mon–Sat overtime (after first 2 hours)", 604640],
  sundayOT: ["Sunday overtime", 604640],
  holidayOT: ["Public holiday overtime", 755800],
  holiday: ["Public holiday ordinary (2024 guide rate)", 766700],
  earlier: ["Before the supplied rate schedule", null],
};

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
export const money = (cents) => aud.format(cents / 100);
export const hours = (minutes) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

function clock(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::00(?:\.0+)?)?$/.exec(value ?? "");
  if (!match) throw new Error("Enter valid start and end times, to the minute.");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function shiftTimes(entry) {
  if (!entry.start_time && !entry.end_time) return null;
  const start = clock(entry.start_time);
  const end = clock(entry.end_time);
  if (start === end) throw new Error("Start and end times must be different (shifts must be under 24 hours).");
  return { start, end: end < start ? end + DAY : end };
}

export function estimate(entry) {
  const times = shiftTimes(entry);
  if (!times) return null;
  const { start, end } = times;
  const date = new Date(`${entry.date}T00:00:00Z`);
  const lines = new Map();
  let dailyOT = 0;
  let weightedRate = 0;
  let unpriced = 0;
  for (let minute = start; minute < end; minute++) {
    const time = minute % DAY;
    if (time === 0 && minute > start) {
      date.setUTCDate(date.getUTCDate() + 1);
      dailyOT = 0;
    }
    const holiday = minute < DAY ? entry.start_holiday : entry.end_holiday;
    const weekday = date.getUTCDay();
    const overtime = minute - start >= 600;
    let key;
    if (date.toISOString().slice(0, 10) < EFFECTIVE_DATE) key = "earlier";
    else if (overtime) key = holiday ? "holidayOT" : weekday === 0 ? "sundayOT" : dailyOT < 120 ? "firstOT" : "laterOT";
    else key = holiday ? "holiday" : weekday === 0 ? "sunday" : weekday === 6 ? "saturday" : time < 360 ? "early" : time >= 1080 ? "evening" : "ordinary";
    if (overtime) dailyOT++;
    const [label, rate] = RATES[key];
    if (rate === null) unpriced++;
    else weightedRate += rate;
    if (!lines.has(key)) lines.set(key, { key, label, rate, minutes: 0 });
    lines.get(key).minutes++;
  }
  // Hourly rates use 1/10,000 dollar units. Round the shift total once to cents.
  return { minutes: end - start, cents: Math.round(weightedRate / 6000), unpriced, lines: [...lines.values()] };
}

export function restWarnings(entries) {
  const shifts = entries.flatMap((entry) => {
    const times = shiftTimes(entry);
    if (!times) return [];
    const midnight = Date.parse(`${entry.date}T00:00:00Z`) / 60000;
    return [{ date: entry.date, start: midnight + times.start, end: midnight + times.end }];
  }).sort((a, b) => a.start - b.start);
  const warnings = new Map();
  let previous;
  for (const shift of shifts) {
    if (previous && shift.start - previous.end < 480) {
      const gap = shift.start - previous.end;
      warnings.set(shift.date, gap < 0 ? "Overlaps a previous shift; verify hours." : `${hours(gap)} between shifts; verify any additional overtime.`);
    }
    if (!previous || shift.end > previous.end) previous = shift;
  }
  return warnings;
}
