import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BackLink, Card, Field, Flash, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { methodLabel } from "@/components/receipt";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtPeriod, isoDate, today } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { withBalance } from "@/lib/services/invoices";
import { payUrl } from "@/lib/services/reminders";
import { upiLink } from "@/lib/upi";
import { addPayment, confirmClaim, deleteInvoice, deletePayment, rejectClaim, saveAdjustments, whatsappReminder } from "../actions";

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP_MANUAL: "WhatsApp (you)",
  WHATSAPP_API: "WhatsApp (automatic)",
  WEBHOOK: "Automatic",
  LOG: "Automatic (test mode)",
};

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const { id } = await params;
  const query = await searchParams;
  const raw = await db.invoice.findFirst({
    where: { id, propertyId: property.id },
    include: {
      tenant: true,
      payments: { orderBy: { paidOn: "asc" } },
      reminders: { orderBy: { sentAt: "desc" } },
      electricityShares: { include: { meterReading: { include: { room: true } } } },
    },
  });
  if (!raw) notFound();
  const inv = withBalance(raw);

  const upi =
    property.upiVpa && inv.balance > 0
      ? upiLink({
          vpa: property.upiVpa,
          payeeName: property.upiPayeeName || property.name,
          amount: inv.balance,
          note: `Rent ${fmtPeriod(inv.period)} ${inv.tenant.name}`,
        })
      : null;
  const qr = upi ? await QRCode.toDataURL(upi, { margin: 1, width: 220 }) : null;

  return (
    <>
      <BackLink href={`/rent?month=${inv.period}`}>Rent · {fmtPeriod(inv.period)}</BackLink>
      <PageHeader
        title={`${inv.tenant.name} · ${fmtPeriod(inv.period)}`}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={inv.status} /> Due {fmtDate(inv.dueDate)} ·{" "}
            <Link href={`/tenants/${inv.tenantId}`} className="link">Tenant profile</Link>
          </span>
        }
        actions={
          inv.balance > 0 && (
            <form action={whatsappReminder}>
              <input type="hidden" name="invoiceId" value={inv.id} />
              <button className="btn-secondary">Send WhatsApp reminder</button>
            </form>
          )
        }
      />
      <Flash msg={sp(query, "msg")} error={sp(query, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          {inv.claimedAt && (
            <div className="flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong>{inv.tenant.name}</strong> says they paid {rupees(inv.claimAmount)} on {fmtDate(inv.claimedAt)}
                {inv.claimRef && <> (UTR <span className="font-mono">{inv.claimRef}</span>)</>}. Check your UPI app, then confirm.
              </div>
              <div className="flex gap-2">
                <form action={confirmClaim}>
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <input type="hidden" name="back" value={`/rent/${inv.id}`} />
                  <button className="btn btn-sm">Confirm</button>
                </form>
                <form action={rejectClaim}>
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <input type="hidden" name="back" value={`/rent/${inv.id}`} />
                  <button className="btn-secondary btn-sm">Not received</button>
                </form>
              </div>
            </div>
          )}

          <Card title="Bill">
            <table>
              <tbody>
                <tr><td>Rent</td><td className="text-right tabular-nums">{rupees(inv.rentAmount)}</td></tr>
                <tr>
                  <td>
                    Electricity
                    {raw.electricityShares.map((s) => (
                      <div key={s.id} className="text-xs text-stone-500">
                        Room {s.meterReading.room.name}, {fmtPeriod(s.meterReading.period)}: {s.meterReading.units} units × ₹{s.meterReading.rate}, your share for {s.days} days
                      </div>
                    ))}
                  </td>
                  <td className="text-right tabular-nums">{rupees(inv.electricityAmount)}</td>
                </tr>
                {inv.otherAmount > 0 && <tr><td>{inv.otherNote || "Other charges"}</td><td className="text-right tabular-nums">{rupees(inv.otherAmount)}</td></tr>}
                {inv.discount > 0 && <tr><td>Discount</td><td className="text-right tabular-nums">−{rupees(inv.discount)}</td></tr>}
                <tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{rupees(inv.totalAmount)}</td></tr>
                <tr><td>Paid</td><td className="text-right tabular-nums">{rupees(inv.paid)}</td></tr>
                <tr className="text-base font-bold"><td>Balance</td><td className="text-right tabular-nums">{rupees(inv.balance)}</td></tr>
              </tbody>
            </table>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-stone-500 hover:text-stone-800">Adjust this bill</summary>
              <form action={saveAdjustments} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <Field label="Rent (₹)"><input name="rentAmount" type="number" min={0} defaultValue={inv.rentAmount} /></Field>
                <Field label="Due date"><input name="dueDate" type="date" defaultValue={isoDate(inv.dueDate)} /></Field>
                <Field label="Other charges (₹)"><input name="otherAmount" type="number" min={0} defaultValue={inv.otherAmount} /></Field>
                <Field label="Other charges note"><input name="otherNote" defaultValue={inv.otherNote ?? ""} placeholder="Late fee, laundry…" /></Field>
                <Field label="Discount (₹)"><input name="discount" type="number" min={0} defaultValue={inv.discount} /></Field>
                <div className="flex items-end"><button className="btn-secondary">Save changes</button></div>
              </form>
            </details>
          </Card>

          <Card title="Payments">
            {inv.payments.length === 0 ? (
              <p className="text-sm text-stone-500">No payments yet.</p>
            ) : (
              <div className="-m-4 overflow-x-auto">
                <table>
                  <thead><tr><th>Date</th><th>Receipt</th><th>Mode</th><th className="text-right">Amount</th><th /></tr></thead>
                  <tbody>
                    {inv.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.paidOn)}</td>
                        <td><Link href={`/receipts/${p.id}`} className="link font-mono">{p.receiptNo}</Link></td>
                        <td>{methodLabel(p.method)}{p.reference && <div className="font-mono text-xs text-stone-500">{p.reference}</div>}</td>
                        <td className="text-right tabular-nums">{rupees(p.amount)}</td>
                        <td className="text-right">
                          <form action={deletePayment}>
                            <input type="hidden" name="paymentId" value={p.id} />
                            <button className="text-xs text-stone-400 hover:text-red-700">Delete</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {inv.balance > 0 && (
              <form id="pay" action={addPayment} className="mt-6 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <Field label="Amount (₹)"><input name="amount" type="number" min={1} max={inv.balance} defaultValue={inv.balance} required /></Field>
                <Field label="Mode">
                  <select name="method" defaultValue="UPI">
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                <Field label="Date"><input name="paidOn" type="date" defaultValue={isoDate(today())} /></Field>
                <Field label="UTR / reference"><input name="reference" placeholder="optional" /></Field>
                <div className="sm:col-span-4"><button className="btn">Record payment & create receipt</button></div>
              </form>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          {inv.balance > 0 && (
            <Card title="Collect by UPI">
              {qr && upi ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="UPI QR code" width={220} height={220} />
                  <p className="text-xs text-stone-500">Tenant scans with any UPI app to pay {rupees(inv.balance)} to {property.upiVpa}.</p>
                </div>
              ) : (
                <p className="text-sm text-stone-500">
                  <Link href="/settings" className="link">Add your UPI ID</Link> to show a QR code here.
                </p>
              )}
              <div className="mt-4 border-t border-stone-100 pt-3">
                <div className="text-xs font-semibold text-stone-500 uppercase">Tenant payment link</div>
                <a href={`/pay/${inv.publicToken}`} target="_blank" rel="noreferrer" className="link mt-1 block text-sm break-all">
                  {payUrl(inv.publicToken)}
                </a>
              </div>
            </Card>
          )}

          <Card title="Reminders">
            {raw.reminders.length === 0 ? (
              <p className="text-sm text-stone-500">None sent yet.</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {raw.reminders.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span>{CHANNEL_LABEL[r.channel]}{!r.success && <span className="text-red-700"> · failed</span>}</span>
                    <span className="text-stone-500">{fmtDate(today(r.sentAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {inv.payments.length === 0 && (
            <form action={deleteInvoice}>
              <input type="hidden" name="invoiceId" value={inv.id} />
              <button className="btn-danger btn-sm">Delete invoice</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
