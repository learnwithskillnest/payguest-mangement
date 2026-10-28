// Date helpers. Calendar dates are handled as UTC-midnight Date objects so they round-trip
// cleanly through Postgres DATE columns. "Today" is computed in India Standard Time.

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** Today's calendar date in IST, as UTC midnight. */
export function today(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** Parse "YYYY-MM-DD" into a UTC-midnight date. Returns null for empty/invalid input. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** Format a date as "YYYY-MM-DD" (for <input type="date">). */
export function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "28 Oct 2026" */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

// ---- Billing periods ("YYYY-MM") ----

export function isPeriod(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentPeriod(now: Date = new Date()): string {
  return periodOf(today(now));
}

export function periodStart(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Last calendar day of the period. */
export function periodEnd(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0));
}

export function daysInPeriod(period: string): number {
  return periodEnd(period).getUTCDate();
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return periodOf(d);
}

/** "Oct 2026" */
export function fmtPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Due date for a period: the given day of that month, clamped to the month length. */
export function dueDateFor(period: string, dueDay: number): Date {
  const day = Math.min(Math.max(1, dueDay), daysInPeriod(period));
  const start = periodStart(period);
  return addDays(start, day - 1);
}

/**
 * Number of nights a stay overlaps a period. Stay end is inclusive; null end = ongoing.
 */
export function overlapDays(
  stayStart: Date,
  stayEnd: Date | null,
  period: string,
): number {
  const from = Math.max(stayStart.getTime(), periodStart(period).getTime());
  const to = Math.min(stayEnd ? stayEnd.getTime() : Infinity, periodEnd(period).getTime());
  if (to < from) return 0;
  return Math.round((to - from) / DAY_MS) + 1;
}

/** 1st, 2nd, 3rd, 4th … 21st */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}
