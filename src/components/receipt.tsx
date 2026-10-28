import type { Invoice, Payment, Property, Tenant } from "@prisma/client";
import { fmtDate, fmtPeriod } from "@/lib/dates";
import { rupees } from "@/lib/money";

const METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export function methodLabel(m: string) {
  return METHOD_LABELS[m] ?? m;
}

export function Receipt({
  payment,
  invoice,
  tenant,
  property,
  bed,
  balanceAfter,
}: {
  payment: Payment;
  invoice: Invoice;
  tenant: Tenant;
  property: Property;
  bed?: string;
  balanceAfter: number;
}) {
  return (
    <article className="mx-auto max-w-xl rounded-xl border border-stone-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-xl font-bold">{property.name}</h1>
          {property.address && <p className="mt-1 text-sm whitespace-pre-line text-stone-600">{property.address}</p>}
          {(property.city || property.phone) && (
            <p className="text-sm text-stone-600">{[property.city, property.phone].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Rent receipt</div>
          <div className="mt-1 font-mono text-sm font-semibold">{payment.receiptNo}</div>
          <div className="text-sm text-stone-600">{fmtDate(payment.paidOn)}</div>
        </div>
      </header>

      <p className="mt-6 text-sm leading-relaxed">
        Received with thanks from <strong>{tenant.name}</strong>
        {bed ? ` (${bed})` : ""} the sum of <strong>{rupees(payment.amount)}</strong> towards rent and charges for{" "}
        <strong>{fmtPeriod(invoice.period)}</strong>.
      </p>

      <table className="mt-6">
        <tbody>
          <tr><td className="text-stone-600">Rent</td><td className="text-right tabular-nums">{rupees(invoice.rentAmount)}</td></tr>
          {invoice.electricityAmount > 0 && (
            <tr><td className="text-stone-600">Electricity</td><td className="text-right tabular-nums">{rupees(invoice.electricityAmount)}</td></tr>
          )}
          {invoice.otherAmount > 0 && (
            <tr><td className="text-stone-600">{invoice.otherNote || "Other charges"}</td><td className="text-right tabular-nums">{rupees(invoice.otherAmount)}</td></tr>
          )}
          {invoice.discount > 0 && (
            <tr><td className="text-stone-600">Discount</td><td className="text-right tabular-nums">−{rupees(invoice.discount)}</td></tr>
          )}
          <tr><td className="font-semibold">Invoice total</td><td className="text-right font-semibold tabular-nums">{rupees(invoice.totalAmount)}</td></tr>
          <tr><td className="font-semibold">This payment</td><td className="text-right font-semibold tabular-nums">{rupees(payment.amount)}</td></tr>
          <tr><td className="text-stone-600">Balance after this payment</td><td className="text-right tabular-nums">{rupees(balanceAfter)}</td></tr>
        </tbody>
      </table>

      <dl className="mt-6 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-stone-500">Payment mode</dt><dd className="text-right">{methodLabel(payment.method)}</dd>
        {payment.reference && (<><dt className="text-stone-500">Reference / UTR</dt><dd className="text-right font-mono">{payment.reference}</dd></>)}
      </dl>

      <footer className="mt-10 flex items-end justify-between text-xs text-stone-500">
        <span>Computer-generated receipt. No signature required.</span>
        <span>For {property.name}</span>
      </footer>
    </article>
  );
}
