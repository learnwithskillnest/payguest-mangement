// Pure billing rules — no database access, fully unit-tested.
import { addDays, daysBetween, daysInPeriod, overlapDays } from "./dates";

export type InvoiceStatus = "PAID" | "PARTIAL" | "OVERDUE" | "DUE";

/** Rent for a stay within a month, prorated by nights stayed. */
export function proratedRent(monthlyRent: number, stayStart: Date, stayEnd: Date | null, period: string): number {
  const days = overlapDays(stayStart, stayEnd, period);
  const dim = daysInPeriod(period);
  if (days <= 0) return 0;
  if (days >= dim) return monthlyRent;
  return Math.round((monthlyRent * days) / dim);
}

export function invoiceTotal(parts: {
  rentAmount: number;
  electricityAmount: number;
  otherAmount: number;
  discount: number;
}): number {
  return Math.max(0, parts.rentAmount + parts.electricityAmount + parts.otherAmount - parts.discount);
}

export function invoiceStatus(total: number, paid: number, dueDate: Date, onDate: Date): InvoiceStatus {
  if (paid >= total) return "PAID";
  if (paid > 0) return onDate > dueDate ? "OVERDUE" : "PARTIAL";
  return onDate > dueDate ? "OVERDUE" : "DUE";
}

/**
 * Split a bill across occupants in proportion to days stayed.
 * Uses largest-remainder rounding so shares always add up to the bill exactly.
 */
export function splitByDays<T extends { days: number }>(amount: number, occupants: T[]): (T & { amount: number })[] {
  const totalDays = occupants.reduce((s, o) => s + Math.max(0, o.days), 0);
  if (totalDays === 0 || amount <= 0) return occupants.map((o) => ({ ...o, amount: 0 }));
  const raw = occupants.map((o) => (amount * Math.max(0, o.days)) / totalDays);
  const floors = raw.map(Math.floor);
  let remainder = amount - floors.reduce((s, n) => s + n, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return occupants.map((o, i) => ({ ...o, amount: floors[i] }));
}

export function meterBill(previous: number, current: number, rate: number): { units: number; amount: number } {
  const units = Math.max(0, Math.round((current - previous) * 100) / 100);
  return { units, amount: Math.round(units * rate) };
}

/**
 * Should an automatic reminder go out today for an unpaid invoice?
 *  - one heads-up `daysBefore` days ahead of the due date,
 *  - one on the due date,
 *  - then every `repeatDays` days while it stays unpaid.
 */
export function shouldSendReminder(opts: {
  today: Date;
  dueDate: Date;
  lastSentOn: Date | null;
  daysBefore: number;
  repeatDays: number;
}): boolean {
  const { today, dueDate, lastSentOn, daysBefore, repeatDays } = opts;
  if (today < addDays(dueDate, -Math.max(0, daysBefore))) return false;
  if (!lastSentOn) return true;
  if (daysBetween(lastSentOn, today) <= 0) return false; // already sent today
  if (today >= dueDate && lastSentOn < dueDate) return true; // due-day reminder
  if (today > dueDate && daysBetween(lastSentOn, today) >= Math.max(1, repeatDays)) return true;
  return false;
}

export type BedState =
  | { kind: "occupied"; tenantId: string; tenantName: string; since: Date }
  | { kind: "vacating"; tenantId: string; tenantName: string; freeFrom: Date }
  | { kind: "free"; since: Date | null; bookedFrom?: Date; bookedBy?: string };

type StayLike = { startDate: Date; endDate: Date | null; tenant: { id: string; name: string } };

/** Live state of a bed on a given day, from its stay history. */
export function bedState(stays: StayLike[], onDate: Date, bedCreatedAt: Date | null = null): BedState {
  const current = stays.find((s) => s.startDate <= onDate && (!s.endDate || s.endDate >= onDate));
  if (current) {
    if (current.endDate) {
      return { kind: "vacating", tenantId: current.tenant.id, tenantName: current.tenant.name, freeFrom: addDays(current.endDate, 1) };
    }
    return { kind: "occupied", tenantId: current.tenant.id, tenantName: current.tenant.name, since: current.startDate };
  }
  const past = stays
    .filter((s) => s.endDate && s.endDate < onDate)
    .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime());
  const upcoming = stays
    .filter((s) => s.startDate > onDate)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  const since = past[0]?.endDate ? addDays(past[0].endDate, 1) : bedCreatedAt;
  return upcoming
    ? { kind: "free", since, bookedFrom: upcoming.startDate, bookedBy: upcoming.tenant.name }
    : { kind: "free", since };
}

/** Mask an Aadhaar number to its last four digits: XXXX-XXXX-1234. */
export function maskAadhaar(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return value;
  return `XXXX-XXXX-${digits.slice(-4)}`;
}
