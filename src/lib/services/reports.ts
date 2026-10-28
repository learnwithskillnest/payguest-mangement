import { db } from "../db";
import { addMonths, periodEnd, periodOf, periodStart } from "../dates";

export type MonthSummary = {
  period: string;
  billed: number;
  collected: number;
  expenses: number;
  profit: number;
  expensesByCategory: Record<string, number>;
};

/** Billed, collected, expenses and profit (collected − expenses) for the last `months` months. */
export async function monthlySummaries(propertyId: string, lastPeriod: string, months: number): Promise<MonthSummary[]> {
  const firstPeriod = addMonths(lastPeriod, -(months - 1));
  const from = periodStart(firstPeriod);
  const to = periodEnd(lastPeriod);

  const [invoices, payments, expenses] = await Promise.all([
    db.invoice.findMany({
      where: { propertyId, period: { gte: firstPeriod, lte: lastPeriod } },
      select: { period: true, totalAmount: true },
    }),
    db.payment.findMany({
      where: { propertyId, paidOn: { gte: from, lte: to } },
      select: { paidOn: true, amount: true },
    }),
    db.expense.findMany({
      where: { propertyId, date: { gte: from, lte: to } },
      select: { date: true, amount: true, category: true },
    }),
  ]);

  const rows = new Map<string, MonthSummary>();
  for (let i = 0; i < months; i++) {
    const p = addMonths(firstPeriod, i);
    rows.set(p, { period: p, billed: 0, collected: 0, expenses: 0, profit: 0, expensesByCategory: {} });
  }
  for (const inv of invoices) rows.get(inv.period)!.billed += inv.totalAmount;
  for (const pay of payments) rows.get(periodOf(pay.paidOn))!.collected += pay.amount;
  for (const ex of expenses) {
    const row = rows.get(periodOf(ex.date))!;
    row.expenses += ex.amount;
    row.expensesByCategory[ex.category] = (row.expensesByCategory[ex.category] ?? 0) + ex.amount;
  }
  for (const row of rows.values()) row.profit = row.collected - row.expenses;
  return [...rows.values()];
}
