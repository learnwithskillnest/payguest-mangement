import { db } from "../db";

/** Everything needed to render a receipt, plus the balance left after that payment. */
export async function receiptData(where: { paymentId: string; ownerId?: string; invoiceToken?: string }) {
  const payment = await db.payment.findFirst({
    where: {
      id: where.paymentId,
      ...(where.ownerId ? { property: { ownerId: where.ownerId } } : {}),
      ...(where.invoiceToken ? { invoice: { publicToken: where.invoiceToken } } : {}),
    },
    include: {
      property: true,
      invoice: {
        include: {
          payments: { orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }] },
          tenant: { include: { stays: { orderBy: { startDate: "desc" }, take: 1, include: { bed: { include: { room: true } } } } } },
        },
      },
    },
  });
  if (!payment) return null;
  const { invoice } = payment;
  let paidUpTo = 0;
  for (const p of invoice.payments) {
    paidUpTo += p.amount;
    if (p.id === payment.id) break;
  }
  const stay = invoice.tenant.stays[0];
  return {
    payment,
    invoice,
    tenant: invoice.tenant,
    property: payment.property,
    bed: stay ? `Room ${stay.bed.room.name}, Bed ${stay.bed.label}` : undefined,
    balanceAfter: Math.max(0, invoice.totalAmount - paidUpTo),
  };
}
