import { Card, Empty, Field, Flash, MonthPicker, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { db } from "@/lib/db";
import { currentPeriod, fmtDate, fmtPeriod, isoDate, isPeriod, periodEnd, periodStart, today } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { addExpense, deleteExpense } from "./actions";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const params = await searchParams;
  const month = isPeriod(sp(params, "month")) ? sp(params, "month")! : currentPeriod();
  const expenses = await db.expense.findMany({
    where: { propertyId: property.id, date: { gte: periodStart(month), lte: periodEnd(month) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amount }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const defaultDate = month === currentPeriod() ? today() : periodEnd(month);

  return (
    <>
      <PageHeader title={`Expenses · ${fmtPeriod(month)}`} subtitle="Everything you spend to run the PG." actions={<MonthPicker period={month} action="/expenses" />} />
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />

      <Card title="Add expense" className="mb-6">
        <form action={addExpense} className="grid gap-3 sm:grid-cols-6 sm:items-end">
          <Field label="Category" className="sm:col-span-2">
            <select name="category" required>
              {Object.entries(EXPENSE_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Amount (₹)"><input name="amount" type="number" min={1} required /></Field>
          <Field label="Date"><input name="date" type="date" defaultValue={isoDate(defaultDate)} /></Field>
          <Field label="Paid to"><input name="paidTo" placeholder="Cook, BSES…" /></Field>
          <Field label="Note"><input name="note" /></Field>
          <div className="sm:col-span-6"><button className="btn">Add expense</button></div>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Spent: ${rupees(total)}`}>
          {byCat.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing yet.</p>
          ) : (
            <ul className="grid gap-3 text-sm">
              {byCat.map(([cat, amt]) => (
                <li key={cat}>
                  <div className="flex justify-between"><span>{EXPENSE_CATEGORIES[cat]}</span><span className="tabular-nums">{rupees(amt)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-stone-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(amt / total) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="All expenses" className="lg:col-span-2">
          {expenses.length === 0 ? (
            <Empty>No expenses recorded for {fmtPeriod(month)}.</Empty>
          ) : (
            <div className="-m-4 overflow-x-auto">
              <table>
                <thead><tr><th>Date</th><th>Category</th><th>Details</th><th className="text-right">Amount</th><th /></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td>{EXPENSE_CATEGORIES[e.category]}</td>
                      <td className="text-stone-600">{[e.paidTo, e.note].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="text-right tabular-nums">{rupees(e.amount)}</td>
                      <td className="text-right">
                        <form action={deleteExpense}>
                          <input type="hidden" name="expenseId" value={e.id} />
                          <button className="text-xs text-stone-400 hover:text-red-700">Delete</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
