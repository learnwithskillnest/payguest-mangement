// Integration tests against a real Postgres (DATABASE_URL). Skipped when no database is configured.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseDate } from "@/lib/dates";
import { generateInvoices, recordPayment, PaymentError, uninvoicedCount } from "@/lib/services/invoices";
import { saveReading } from "@/lib/services/electricity";
import { sendDueReminders } from "@/lib/services/reminders";
import { getBedBoard } from "@/lib/services/occupancy";
import { monthlySummaries } from "@/lib/services/reports";

const d = (s: string) => parseDate(s)!;
const run = process.env.DATABASE_URL ? describe : describe.skip;

run("services (database)", () => {
  let propertyId = "";
  let roomId = "";
  const bedIds: string[] = [];
  const tenantIds: Record<string, string> = {};
  const email = `test-${Date.now()}@example.com`;

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: "Test Owner",
        email,
        passwordHash: "x",
        properties: { create: { name: "Test PG", rentDueDay: 5, electricityRate: 10, receiptPrefix: "T" } },
      },
      include: { properties: true },
    });
    propertyId = user.properties[0].id;
    const room = await db.room.create({
      data: { propertyId, name: "1", beds: { create: [{ label: "A", rent: 9000 }, { label: "B", rent: 9000 }, { label: "C", rent: 6000 }] } },
      include: { beds: { orderBy: { label: "asc" } } },
    });
    roomId = room.id;
    bedIds.push(...room.beds.map((b) => b.id));
    const mk = async (name: string, bed: number, start: string, end: string | null, rent: number) => {
      const t = await db.tenant.create({
        data: {
          propertyId,
          name,
          phone: "9999999999",
          stays: { create: { bedId: bedIds[bed], startDate: d(start), endDate: end ? d(end) : null, rent } },
        },
      });
      tenantIds[name] = t.id;
    };
    await mk("Full", 0, "2026-01-01", null, 9000);
    await mk("Joiner", 1, "2026-09-21", null, 9000); // 10 nights in Sept
    await mk("Leaver", 2, "2026-01-01", "2026-09-10", 6000); // 10 nights in Sept
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  });

  it("generates prorated invoices once per tenant", async () => {
    expect(await uninvoicedCount(propertyId, "2026-09")).toBe(3);
    const first = await generateInvoices(propertyId, "2026-09");
    expect(first.created).toBe(3);
    const again = await generateInvoices(propertyId, "2026-09");
    expect(again.created).toBe(0);
    const invs = await db.invoice.findMany({ where: { propertyId, period: "2026-09" } });
    const byTenant = Object.fromEntries(invs.map((i) => [i.tenantId, i]));
    expect(byTenant[tenantIds.Full].rentAmount).toBe(9000);
    expect(byTenant[tenantIds.Joiner].rentAmount).toBe(3000);
    expect(byTenant[tenantIds.Leaver].rentAmount).toBe(2000);
    expect(byTenant[tenantIds.Full].dueDate.toISOString().slice(0, 10)).toBe("2026-09-05");
  });

  it("splits a room's electricity by days and bills it on the next invoice", async () => {
    const { shares } = await saveReading({ propertyId, roomId, period: "2026-09", previousReading: 100, currentReading: 200, rate: 10 });
    // 1000 rupees across 30 + 10 + 10 days
    const amounts = Object.fromEntries(shares.map((s) => [s.tenantId, s.amount]));
    expect(amounts[tenantIds.Full]).toBe(600);
    expect(amounts[tenantIds.Joiner]).toBe(200);
    expect(amounts[tenantIds.Leaver]).toBe(200);

    // No October invoice yet: shares are pending
    expect(await db.electricityShare.count({ where: { invoiceId: null, meterReading: { roomId } } })).toBe(3);

    await generateInvoices(propertyId, "2026-10");
    const oct = await db.invoice.findUniqueOrThrow({ where: { tenantId_period: { tenantId: tenantIds.Full, period: "2026-10" } } });
    expect(oct.electricityAmount).toBe(600);
    expect(oct.totalAmount).toBe(9600);
    // Leaver has no October invoice, so their share stays pending
    expect(await db.electricityShare.count({ where: { invoiceId: null, tenantId: tenantIds.Leaver } })).toBe(1);

    // Correcting the reading updates the already-billed invoice
    await saveReading({ propertyId, roomId, period: "2026-09", previousReading: 100, currentReading: 150, rate: 10 });
    const oct2 = await db.invoice.findUniqueOrThrow({ where: { id: oct.id } });
    expect(oct2.electricityAmount).toBe(300);
    expect(oct2.totalAmount).toBe(9300);
  });

  it("records payments with sequential receipts and blocks overpayment", async () => {
    const inv = await db.invoice.findUniqueOrThrow({ where: { tenantId_period: { tenantId: tenantIds.Full, period: "2026-09" } } });
    const p1 = await recordPayment(propertyId, inv.id, { amount: 5000, method: "UPI", reference: "123456", paidOn: d("2026-09-04"), note: null });
    const p2 = await recordPayment(propertyId, inv.id, { amount: 4000, method: "CASH", reference: null, paidOn: d("2026-09-06"), note: null });
    expect(p1.receiptNo).toBe("T-00001");
    expect(p2.receiptNo).toBe("T-00002");
    await expect(recordPayment(propertyId, inv.id, { amount: 1, method: "CASH", reference: null, paidOn: d("2026-09-06"), note: null })).rejects.toBeInstanceOf(PaymentError);
  });

  it("sends each due reminder once per day", async () => {
    const now = new Date("2026-10-05T04:00:00Z"); // 09:30 IST on the October due date
    const first = await sendDueReminders(now);
    expect(first.sent).toBeGreaterThan(0);
    const second = await sendDueReminders(now);
    expect(second.sent).toBe(0);
    // The fully paid September invoice never gets a reminder
    const paid = await db.invoice.findUniqueOrThrow({ where: { tenantId_period: { tenantId: tenantIds.Full, period: "2026-09" } }, include: { reminders: true } });
    expect(paid.reminders).toHaveLength(0);
  });

  it("shows live bed states and monthly profit", async () => {
    const board = await getBedBoard(propertyId, d("2026-10-01"));
    expect(board.totals).toMatchObject({ beds: 3, occupied: 2, free: 1 });
    expect(board.freeBeds[0].state).toMatchObject({ kind: "free", since: d("2026-09-11") });

    await db.expense.create({ data: { propertyId, category: "FOOD", amount: 2500, date: d("2026-09-15") } });
    const [sep] = await monthlySummaries(propertyId, "2026-09", 1);
    expect(sep).toMatchObject({ collected: 9000, expenses: 2500, profit: 6500, billed: 14000 });
  });
});
