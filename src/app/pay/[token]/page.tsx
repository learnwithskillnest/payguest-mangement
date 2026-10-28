import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Field, Flash } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { fmtDate, fmtPeriod } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { invoiceInclude, withBalance } from "@/lib/services/invoices";
import { upiLink } from "@/lib/upi";
import { submitClaim } from "../actions";

export const metadata = { title: "Pay rent", robots: { index: false } };

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SearchParams }) {
  const { token } = await params;
  const query = await searchParams;
  const raw = await db.invoice.findUnique({ where: { publicToken: token }, include: { ...invoiceInclude, property: true } });
  if (!raw) notFound();
  const inv = withBalance(raw);
  const property = raw.property;
  const first = inv.tenant.name.split(" ")[0];

  const upi =
    property.upiVpa && inv.balance > 0
      ? upiLink({
          vpa: property.upiVpa,
          payeeName: property.upiPayeeName || property.name,
          amount: inv.balance,
          note: `Rent ${fmtPeriod(inv.period)} ${inv.tenant.name}`,
        })
      : null;
  const qr = upi ? await QRCode.toDataURL(upi, { margin: 1, width: 240 }) : null;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-5 text-center">
        <div className="text-sm font-semibold text-brand-700">{property.name}</div>
        <h1 className="mt-1 text-2xl font-bold">Hi {first}, rent for {fmtPeriod(inv.period)}</h1>
      </div>
      <Flash msg={sp(query, "msg")} error={sp(query, "error")} />

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-stone-500">Due {fmtDate(inv.dueDate)}</span>
          <StatusBadge status={inv.status} />
        </div>
        <table className="mt-3">
          <tbody>
            <tr><td>Rent</td><td className="text-right tabular-nums">{rupees(inv.rentAmount)}</td></tr>
            {inv.electricityAmount > 0 && <tr><td>Electricity</td><td className="text-right tabular-nums">{rupees(inv.electricityAmount)}</td></tr>}
            {inv.otherAmount > 0 && <tr><td>{inv.otherNote || "Other charges"}</td><td className="text-right tabular-nums">{rupees(inv.otherAmount)}</td></tr>}
            {inv.discount > 0 && <tr><td>Discount</td><td className="text-right tabular-nums">−{rupees(inv.discount)}</td></tr>}
            {inv.paid > 0 && <tr><td>Already paid</td><td className="text-right tabular-nums">−{rupees(inv.paid)}</td></tr>}
            <tr className="text-lg font-bold"><td>To pay</td><td className="text-right tabular-nums">{rupees(inv.balance)}</td></tr>
          </tbody>
        </table>

        {inv.balance > 0 && upi && qr && (
          <div className="mt-5 flex flex-col items-center gap-3 border-t border-stone-100 pt-5 text-center">
            <a href={upi} className="btn w-full py-3 text-base">Pay {rupees(inv.balance)} with UPI app</a>
            <p className="text-xs text-stone-500">On a computer? Scan this with your phone.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="UPI QR code" width={240} height={240} />
            <p className="text-xs text-stone-500">Paying to {property.upiVpa}</p>
          </div>
        )}
        {inv.balance > 0 && !upi && (
          <p className="mt-5 border-t border-stone-100 pt-4 text-sm text-stone-600">Please pay your PG owner directly.</p>
        )}
        {inv.balance === 0 && <p className="mt-5 border-t border-stone-100 pt-4 text-center font-semibold text-brand-700">All paid. Thank you!</p>}
      </section>

      {inv.balance > 0 && (
        <section className="card mt-5 p-5">
          {inv.claimedAt ? (
            <p className="text-sm text-stone-600">
              You told us you paid {rupees(inv.claimAmount)} (UTR {inv.claimRef}). Your owner will confirm it shortly.
            </p>
          ) : (
            <form action={submitClaim} className="grid gap-3">
              <h2 className="font-semibold">Already paid?</h2>
              <p className="text-xs text-stone-500">Share the transaction ID so your owner can match it and send the receipt.</p>
              <input type="hidden" name="token" value={token} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (₹)"><input name="amount" type="number" min={1} max={inv.balance} defaultValue={inv.balance} /></Field>
                <Field label="UPI ref / UTR"><input name="ref" required minLength={6} inputMode="numeric" /></Field>
              </div>
              <button className="btn-secondary">I have paid</button>
            </form>
          )}
        </section>
      )}

      {inv.payments.length > 0 && (
        <section className="card mt-5 p-5">
          <h2 className="mb-2 font-semibold">Receipts</h2>
          <ul className="grid gap-1.5 text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex justify-between">
                <Link href={`/pay/${token}/receipt/${p.id}`} className="link font-mono">{p.receiptNo}</Link>
                <span className="tabular-nums">{rupees(p.amount)} · {fmtDate(p.paidOn)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-8 text-center text-xs text-stone-400">Powered by PG Manager</p>
    </main>
  );
}
