import Link from "next/link";
import { Badge, Card, Empty, Flash, MonthPicker, PageHeader, Stat } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentPeriod, fmtDate, fmtPeriod, isPeriod, ordinal } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { invoiceInclude, uninvoicedCount, withBalance } from "@/lib/services/invoices";
import { confirmClaim, generateMonth, rejectClaim, whatsappReminder } from "./actions";

export const metadata = { title: "Rent" };

export default async function RentPage({ searchParams }: { searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const params = await searchParams;
  const month = isPeriod(sp(params, "month")) ? sp(params, "month")! : currentPeriod();
  const filter = sp(params, "show") ?? "all";
  const back = `/rent?month=${month}`;

  const [raw, missing, claims] = await Promise.all([
    db.invoice.findMany({ where: { propertyId: property.id, period: month }, include: invoiceInclude, orderBy: { tenant: { name: "asc" } } }),
    uninvoicedCount(property.id, month),
    db.invoice.findMany({
      where: { propertyId: property.id, claimedAt: { not: null } },
      include: { tenant: true },
      orderBy: { claimedAt: "asc" },
    }),
  ]);
  const invoices = raw.map((i) => withBalance(i));
  const billed = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const collected = invoices.reduce((s, i) => s + i.paid, 0);
  const outstanding = billed - collected;
  const paidCount = invoices.filter((i) => i.status === "PAID").length;
  const shown = invoices.filter((i) => (filter === "unpaid" ? i.balance > 0 : filter === "paid" ? i.balance === 0 : true));

  return (
    <>
      <PageHeader
        title={`Rent · ${fmtPeriod(month)}`}
        subtitle={`Due on the ${ordinal(property.rentDueDay)} of each month.`}
        actions={<MonthPicker period={month} action="/rent" />}
      />
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />

      {!property.upiVpa && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Add your UPI ID in <Link href="/settings" className="font-semibold underline">Settings</Link> so tenants can pay from the payment link.
        </div>
      )}

      {missing > 0 && (
        <form action={generateMonth} className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <input type="hidden" name="month" value={month} />
          <span className="text-sm text-brand-900">
            {missing} tenant{missing > 1 ? "s" : ""} stayed in {fmtPeriod(month)} without an invoice. Rent is prorated for part-month stays and pending electricity is added.
          </span>
          <button className="btn">Generate {fmtPeriod(month)} rent</button>
        </form>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Billed" value={rupees(billed)} hint={`${invoices.length} invoices`} />
        <Stat label="Collected" value={rupees(collected)} tone="good" hint={`${paidCount} fully paid`} />
        <Stat label="Outstanding" value={rupees(outstanding)} tone={outstanding ? "bad" : "default"} hint={`${invoices.length - paidCount} tenants`} />
        <Stat label="Collection" value={billed ? `${Math.round((collected / billed) * 100)}%` : "—"} />
      </div>

      {claims.length > 0 && (
        <Card title="Tenants who say they've paid" className="mb-6">
          <ul className="grid gap-3">
            {claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <span className="font-semibold">{c.tenant.name}</span> paid {rupees(c.claimAmount)} for {fmtPeriod(c.period)}
                  {c.claimRef && <> · UTR <span className="font-mono">{c.claimRef}</span></>}
                  <span className="text-stone-500"> · {fmtDate(c.claimedAt)}</span>
                  <div className="text-xs text-stone-500">Check your bank/UPI app for this payment before confirming.</div>
                </div>
                <div className="flex gap-2">
                  <form action={confirmClaim}>
                    <input type="hidden" name="invoiceId" value={c.id} />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn btn-sm">Confirm & issue receipt</button>
                  </form>
                  <form action={rejectClaim}>
                    <input type="hidden" name="invoiceId" value={c.id} />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn-secondary btn-sm">Not received</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Invoices"
        actions={
          <div className="flex gap-1 text-sm">
            {[["all", "All"], ["unpaid", "Unpaid"], ["paid", "Paid"]].map(([k, l]) => (
              <Link key={k} href={`/rent?month=${month}&show=${k}`} className={`rounded-full px-2.5 py-1 ${filter === k ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-100"}`}>{l}</Link>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          <Empty>{invoices.length === 0 ? `No invoices for ${fmtPeriod(month)} yet.` : "Nothing to show."}</Empty>
        ) : (
          <>
          <ul className="-m-4 divide-y divide-stone-100 sm:hidden">
            {shown.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/rent/${i.id}`} className="link">{i.tenant.name}</Link>
                    <div className="text-xs text-stone-500">
                      Rent {rupees(i.rentAmount)}{i.electricityAmount ? ` + electricity ${rupees(i.electricityAmount)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{rupees(i.balance || i.totalAmount)}</div>
                    <StatusBadge status={i.status} />
                  </div>
                </div>
                {i.claimedAt && <div><Badge tone="blue">Says paid</Badge></div>}
                {i.balance > 0 ? (
                  <div className="flex gap-2">
                    <form action={whatsappReminder} className="flex-1">
                      <input type="hidden" name="invoiceId" value={i.id} />
                      <button className="btn-secondary w-full">Remind</button>
                    </form>
                    <Link href={`/rent/${i.id}#pay`} className="btn flex-1">Record payment</Link>
                  </div>
                ) : (
                  <Link href={`/rent/${i.id}`} className="btn-secondary">Receipt</Link>
                )}
              </li>
            ))}
          </ul>
          <div className="-m-4 hidden overflow-x-auto sm:block">
            <table>
              <thead>
                <tr><th>Tenant</th><th className="text-right">Rent</th><th className="text-right">Electricity</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className="hover:bg-stone-50">
                    <td>
                      <Link href={`/rent/${i.id}`} className="link">{i.tenant.name}</Link>
                      {i.claimedAt && <div><Badge tone="blue">Says paid</Badge></div>}
                    </td>
                    <td className="text-right tabular-nums">{rupees(i.rentAmount)}</td>
                    <td className="text-right tabular-nums">{i.electricityAmount ? rupees(i.electricityAmount) : "—"}</td>
                    <td className="text-right tabular-nums">{rupees(i.totalAmount)}</td>
                    <td className="text-right font-semibold tabular-nums">{i.balance ? rupees(i.balance) : "—"}</td>
                    <td>
                      <StatusBadge status={i.status} />
                      {i.reminders[0] && <div className="mt-1 text-xs text-stone-400">Reminded {fmtDate(i.reminders[0].sentAt)}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {i.balance > 0 ? (
                        <div className="flex justify-end gap-1.5">
                          <form action={whatsappReminder}>
                            <input type="hidden" name="invoiceId" value={i.id} />
                            <button className="btn-secondary btn-sm" title="Opens WhatsApp with the reminder and payment link">Remind</button>
                          </form>
                          <Link href={`/rent/${i.id}#pay`} className="btn btn-sm">Record payment</Link>
                        </div>
                      ) : (
                        <Link href={`/rent/${i.id}`} className="btn-secondary btn-sm">Receipt</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </>
  );
}
