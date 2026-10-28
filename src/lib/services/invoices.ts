import { PaymentMethod, Prisma } from "@prisma/client";
import { db } from "../db";
import { invoiceStatus, invoiceTotal, proratedRent, type InvoiceStatus } from "../billing";
import { dueDateFor, periodEnd, periodStart, today } from "../dates";
import { randomToken } from "../password";

type Tx = Prisma.TransactionClient;

export const invoiceInclude = {
  tenant: true,
  payments: { orderBy: { paidOn: "asc" } },
  reminders: { orderBy: { sentAt: "desc" }, take: 1 },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export type InvoiceView = InvoiceWithRelations & { paid: number; balance: number; status: InvoiceStatus };

export function withBalance(inv: InvoiceWithRelations, onDate: Date = today()): InvoiceView {
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  return {
    ...inv,
    paid,
    balance: Math.max(0, inv.totalAmount - paid),
    status: invoiceStatus(inv.totalAmount, paid, inv.dueDate, onDate),
  };
}

/** Stays of a property that overlap a billing period. */
async function staysInPeriod(client: Tx | typeof db, propertyId: string, period: string) {
  return client.stay.findMany({
    where: {
      bed: { room: { propertyId } },
      startDate: { lte: periodEnd(period) },
      OR: [{ endDate: null }, { endDate: { gte: periodStart(period) } }],
    },
    include: { tenant: true },
  });
}

/**
 * Create one invoice per tenant who stayed in the property during `period`.
 * Rent is prorated by nights; unbilled electricity from earlier months is added.
 * Tenants who already have an invoice for the period are skipped.
 */
export async function generateInvoices(propertyId: string, period: string) {
  return db.$transaction(async (tx) => {
    const property = await tx.property.findUniqueOrThrow({ where: { id: propertyId } });
    const stays = await staysInPeriod(tx, propertyId, period);

    const rentByTenant = new Map<string, number>();
    for (const s of stays) {
      const rent = proratedRent(s.rent, s.startDate, s.endDate, period);
      rentByTenant.set(s.tenantId, (rentByTenant.get(s.tenantId) ?? 0) + rent);
    }

    const existing = await tx.invoice.findMany({
      where: { propertyId, period, tenantId: { in: [...rentByTenant.keys()] } },
      select: { tenantId: true },
    });
    const already = new Set(existing.map((e) => e.tenantId));

    let created = 0;
    for (const [tenantId, rentAmount] of rentByTenant) {
      if (already.has(tenantId) || rentAmount <= 0) continue;
      const shares = await tx.electricityShare.findMany({
        where: { tenantId, invoiceId: null, meterReading: { period: { lt: period } } },
      });
      const electricityAmount = shares.reduce((s, x) => s + x.amount, 0);
      const invoice = await tx.invoice.create({
        data: {
          propertyId,
          tenantId,
          period,
          rentAmount,
          electricityAmount,
          totalAmount: invoiceTotal({ rentAmount, electricityAmount, otherAmount: 0, discount: 0 }),
          dueDate: dueDateFor(period, property.rentDueDay),
          publicToken: randomToken(18),
        },
      });
      if (shares.length) {
        await tx.electricityShare.updateMany({
          where: { id: { in: shares.map((s) => s.id) } },
          data: { invoiceId: invoice.id },
        });
      }
      created++;
    }
    return { created, skipped: already.size };
  });
}

/** Recompute electricity and total after shares or adjustments change. */
export async function recalcInvoice(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const agg = await tx.electricityShare.aggregate({ where: { invoiceId }, _sum: { amount: true } });
  const electricityAmount = agg._sum.amount ?? 0;
  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      electricityAmount,
      totalAmount: invoiceTotal({
        rentAmount: inv.rentAmount,
        electricityAmount,
        otherAmount: inv.otherAmount,
        discount: inv.discount,
      }),
    },
  });
}

export async function updateInvoiceAdjustments(
  propertyId: string,
  invoiceId: string,
  data: { rentAmount: number; otherAmount: number; otherNote: string | null; discount: number; dueDate: Date },
) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, propertyId } });
    await tx.invoice.update({ where: { id: inv.id }, data });
    return recalcInvoice(tx, inv.id);
  });
}

/**
 * Attach electricity shares that are not yet billed to the tenant's earliest invoice
 * for a later month, if one exists. Shares with no later invoice stay pending.
 */
export async function attachUnbilledShares(tx: Tx, tenantIds: string[]) {
  const touched = new Set<string>();
  const shares = await tx.electricityShare.findMany({
    where: { tenantId: { in: tenantIds }, invoiceId: null },
    include: { meterReading: true },
  });
  for (const share of shares) {
    const target = await tx.invoice.findFirst({
      where: { tenantId: share.tenantId, period: { gt: share.meterReading.period } },
      orderBy: { period: "asc" },
    });
    if (!target) continue;
    await tx.electricityShare.update({ where: { id: share.id }, data: { invoiceId: target.id } });
    touched.add(target.id);
  }
  for (const id of touched) await recalcInvoice(tx, id);
}

export class PaymentError extends Error {}

export async function recordPayment(
  propertyId: string,
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; reference: string | null; paidOn: Date; note: string | null },
) {
  if (input.amount <= 0) throw new PaymentError("Amount must be more than zero.");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, propertyId },
      include: { payments: true },
    });
    if (!inv) throw new PaymentError("Invoice not found.");
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const balance = inv.totalAmount - paid;
    if (input.amount > balance) throw new PaymentError(`Only ₹${balance} is outstanding on this invoice.`);
    const property = await tx.property.update({
      where: { id: propertyId },
      data: { receiptCounter: { increment: 1 } },
    });
    const receiptNo = `${property.receiptPrefix}-${String(property.receiptCounter).padStart(5, "0")}`;
    const payment = await tx.payment.create({
      data: { propertyId, invoiceId, receiptNo, ...input },
    });
    if (inv.claimedAt) {
      await tx.invoice.update({
        where: { id: inv.id },
        data: { claimAmount: null, claimRef: null, claimedAt: null },
      });
    }
    return payment;
  });
}
