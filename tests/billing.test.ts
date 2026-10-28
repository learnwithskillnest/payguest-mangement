import { describe, expect, it } from "vitest";
import { bedState, invoiceStatus, maskAadhaar, meterBill, proratedRent, shouldSendReminder, splitByDays } from "@/lib/billing";
import { addMonths, dueDateFor, overlapDays, parseDate, today } from "@/lib/dates";
import { upiLink, whatsappNumber } from "@/lib/upi";

const d = (s: string) => parseDate(s)!;

describe("dates", () => {
  it("computes overlap nights inclusively", () => {
    expect(overlapDays(d("2026-10-01"), null, "2026-10")).toBe(31);
    expect(overlapDays(d("2026-10-16"), null, "2026-10")).toBe(16);
    expect(overlapDays(d("2026-09-10"), d("2026-10-10"), "2026-10")).toBe(10);
    expect(overlapDays(d("2026-11-01"), null, "2026-10")).toBe(0);
    expect(overlapDays(d("2026-09-01"), d("2026-09-30"), "2026-10")).toBe(0);
  });
  it("handles month arithmetic and due dates", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(dueDateFor("2026-02", 31).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(dueDateFor("2026-10", 5).toISOString().slice(0, 10)).toBe("2026-10-05");
  });
  it("uses IST for today", () => {
    // 20:00 UTC on 31 Oct is 01:30 IST on 1 Nov
    expect(today(new Date("2026-10-31T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-01");
  });
  it("rejects invalid dates", () => {
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("rent", () => {
  it("charges full rent for a full month", () => {
    expect(proratedRent(9000, d("2026-01-15"), null, "2026-10")).toBe(9000);
  });
  it("prorates a mid-month move-in and move-out", () => {
    expect(proratedRent(9300, d("2026-10-17"), null, "2026-10")).toBe(4500); // 15 of 31 nights
    expect(proratedRent(9000, d("2026-01-01"), d("2026-11-10"), "2026-11")).toBe(3000); // 10 of 30
  });
  it("derives invoice status", () => {
    const due = d("2026-10-05");
    expect(invoiceStatus(9000, 9000, due, d("2026-10-20"))).toBe("PAID");
    expect(invoiceStatus(9000, 0, due, d("2026-10-03"))).toBe("DUE");
    expect(invoiceStatus(9000, 0, due, d("2026-10-06"))).toBe("OVERDUE");
    expect(invoiceStatus(9000, 4000, due, d("2026-10-04"))).toBe("PARTIAL");
  });
});

describe("electricity split", () => {
  it("splits by days and always adds up to the bill", () => {
    const shares = splitByDays(1000, [
      { id: "a", days: 31 },
      { id: "b", days: 31 },
      { id: "c", days: 10 },
    ]);
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(1000);
    expect(shares.map((s) => s.amount)).toEqual([431, 430, 139]);
  });
  it("splits equally when everyone stayed the full month", () => {
    expect(splitByDays(900, [{ days: 30 }, { days: 30 }, { days: 30 }]).map((s) => s.amount)).toEqual([300, 300, 300]);
  });
  it("charges nobody for an empty room", () => {
    expect(splitByDays(500, [])).toEqual([]);
  });
  it("computes the meter bill", () => {
    expect(meterBill(1200, 1350.5, 8)).toEqual({ units: 150.5, amount: 1204 });
    expect(meterBill(1350, 1350, 8)).toEqual({ units: 0, amount: 0 });
  });
});

describe("reminders", () => {
  const base = { dueDate: d("2026-10-05"), daysBefore: 2, repeatDays: 3 };
  it("waits until the heads-up day", () => {
    expect(shouldSendReminder({ ...base, today: d("2026-10-02"), lastSentOn: null })).toBe(false);
    expect(shouldSendReminder({ ...base, today: d("2026-10-03"), lastSentOn: null })).toBe(true);
  });
  it("sends once on the due date, then every N days", () => {
    expect(shouldSendReminder({ ...base, today: d("2026-10-04"), lastSentOn: d("2026-10-03") })).toBe(false);
    expect(shouldSendReminder({ ...base, today: d("2026-10-05"), lastSentOn: d("2026-10-03") })).toBe(true);
    expect(shouldSendReminder({ ...base, today: d("2026-10-07"), lastSentOn: d("2026-10-05") })).toBe(false);
    expect(shouldSendReminder({ ...base, today: d("2026-10-08"), lastSentOn: d("2026-10-05") })).toBe(true);
  });
  it("never sends twice in a day", () => {
    expect(shouldSendReminder({ ...base, today: d("2026-10-08"), lastSentOn: d("2026-10-08") })).toBe(false);
  });
});

describe("bed state", () => {
  const t = { id: "t1", name: "Rahul" };
  it("shows occupied, vacating and free-since", () => {
    expect(bedState([{ startDate: d("2026-01-01"), endDate: null, tenant: t }], d("2026-10-28")).kind).toBe("occupied");
    const vac = bedState([{ startDate: d("2026-01-01"), endDate: d("2026-11-15"), tenant: t }], d("2026-10-28"));
    expect(vac).toMatchObject({ kind: "vacating", freeFrom: d("2026-11-16") });
    const free = bedState([{ startDate: d("2026-01-01"), endDate: d("2026-10-10"), tenant: t }], d("2026-10-28"));
    expect(free).toMatchObject({ kind: "free", since: d("2026-10-11") });
  });
  it("shows an upcoming booking on a free bed", () => {
    const s = bedState([{ startDate: d("2026-11-05"), endDate: null, tenant: t }], d("2026-10-28"));
    expect(s).toMatchObject({ kind: "free", bookedFrom: d("2026-11-05"), bookedBy: "Rahul" });
  });
});

describe("upi + misc", () => {
  it("builds a UPI deep link", () => {
    const link = upiLink({ vpa: "owner@okhdfcbank", payeeName: "Sunrise PG", amount: 9500, note: "Rent Oct 2026" });
    expect(link).toBe("upi://pay?pa=owner%40okhdfcbank&pn=Sunrise%20PG&am=9500.00&cu=INR&tn=Rent%20Oct%202026");
  });
  it("normalises Indian mobile numbers for WhatsApp", () => {
    expect(whatsappNumber("98765 43210")).toBe("919876543210");
    expect(whatsappNumber("+91-98765-43210")).toBe("919876543210");
    expect(whatsappNumber("09876543210")).toBe("919876543210");
    expect(whatsappNumber("123")).toBeNull();
  });
  it("masks Aadhaar", () => {
    expect(maskAadhaar("1234 5678 9012")).toBe("XXXX-XXXX-9012");
  });
});
