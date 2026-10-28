import { Card, PageHeader, Stat } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { currentPeriod, fmtPeriod } from "@/lib/dates";
import { rupees } from "@/lib/money";
import { monthlySummaries } from "@/lib/services/reports";

export const metadata = { title: "Profit" };

export default async function ReportsPage() {
  const { property } = await requireOwner();
  const all = await monthlySummaries(property.id, currentPeriod(), 12);
  // Hide empty months before the PG started using the app (keep at least the last two).
  const firstActive = all.findIndex((r) => r.billed || r.collected || r.expenses);
  const rows = all.slice(Math.min(firstActive === -1 ? all.length : firstActive, all.length - 2));
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const yearCollected = all.reduce((s, r) => s + r.collected, 0);
  const yearExpenses = all.reduce((s, r) => s + r.expenses, 0);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.collected, r.expenses)));
  const prevCats = Object.entries(prev.expensesByCategory).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Profit" subtitle="Money collected minus money spent, month by month. Collections are counted on the date they were received." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Profit · ${fmtPeriod(last.period)}`} value={rupees(last.profit)} tone={last.profit >= 0 ? "good" : "bad"} hint="So far this month" />
        <Stat label={`Profit · ${fmtPeriod(prev.period)}`} value={rupees(prev.profit)} tone={prev.profit >= 0 ? "good" : "bad"} hint={`${rupees(prev.collected)} in − ${rupees(prev.expenses)} out`} />
        <Stat label="12-month profit" value={rupees(yearCollected - yearExpenses)} tone={yearCollected >= yearExpenses ? "good" : "bad"} />
        <Stat label="12-month margin" value={yearCollected ? `${Math.round(((yearCollected - yearExpenses) / yearCollected) * 100)}%` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Month by month" className="lg:col-span-2">
          <div className="mb-3 flex gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Collected</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-stone-400" /> Expenses</span>
          </div>
          <div className="-m-4 overflow-x-auto">
            <table>
              <thead><tr><th>Month</th><th className="w-1/3" /><th className="text-right">Billed</th><th className="text-right">Collected</th><th className="text-right">Expenses</th><th className="text-right">Profit</th></tr></thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.period}>
                    <td className="whitespace-nowrap">{fmtPeriod(r.period)}</td>
                    <td>
                      <div className="grid gap-1 pt-1">
                        <div className="h-2 rounded-sm bg-brand-500" style={{ width: `${(r.collected / max) * 100}%` }} />
                        <div className="h-2 rounded-sm bg-stone-400" style={{ width: `${(r.expenses / max) * 100}%` }} />
                      </div>
                    </td>
                    <td className="text-right text-stone-500 tabular-nums">{rupees(r.billed)}</td>
                    <td className="text-right tabular-nums">{rupees(r.collected)}</td>
                    <td className="text-right tabular-nums">{rupees(r.expenses)}</td>
                    <td className={`text-right font-semibold tabular-nums ${r.profit < 0 ? "text-red-700" : ""}`}>{rupees(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={`Where money went · ${fmtPeriod(prev.period)}`}>
          {prevCats.length === 0 ? (
            <p className="text-sm text-stone-500">No expenses recorded.</p>
          ) : (
            <ul className="grid gap-3 text-sm">
              {prevCats.map(([cat, amt]) => (
                <li key={cat}>
                  <div className="flex justify-between"><span>{EXPENSE_CATEGORIES[cat]}</span><span className="tabular-nums">{rupees(amt)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-stone-100"><div className="h-1.5 rounded-full bg-stone-500" style={{ width: `${(amt / prev.expenses) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
