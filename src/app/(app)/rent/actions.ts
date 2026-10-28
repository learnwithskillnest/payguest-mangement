"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { fmtPeriod, isPeriod, today } from "@/lib/dates";
import { dateField, flash, optStr, rupeesField, str } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { generateInvoices, PaymentError, recordPayment, updateInvoiceAdjustments, withBalance, invoiceInclude } from "@/lib/services/invoices";
import { reminderMessage } from "@/lib/services/reminders";
import { whatsappLink } from "@/lib/upi";

const METHODS = Object.values(PaymentMethod) as string[];

export async function generateMonth(fd: FormData) {
  const { property } = await requireOwner();
  const month = str(fd, "month");
  if (!isPeriod(month)) flash("/rent", "error", "Pick a valid month.");
  const { created } = await generateInvoices(property.id, month);
  revalidatePath("/rent");
  flash(`/rent?month=${month}`, "msg", created ? `Created ${created} invoice${created > 1 ? "s" : ""} for ${fmtPeriod(month)}.` : `Everyone already has an invoice for ${fmtPeriod(month)}.`);
}

async function ownedInvoice(id: string) {
  const { property } = await requireOwner();
  const inv = await db.invoice.findFirst({ where: { id, propertyId: property.id }, include: invoiceInclude });
  if (!inv) flash("/rent", "error", "Invoice not found.");
  return { inv, property };
}

export async function addPayment(fd: FormData) {
  const { inv, property } = await ownedInvoice(str(fd, "invoiceId"));
  const back = str(fd, "back") || `/rent/${inv.id}`;
  const method = str(fd, "method");
  try {
    const payment = await recordPayment(property.id, inv.id, {
      amount: rupeesField(fd, "amount"),
      method: (METHODS.includes(method) ? method : "UPI") as PaymentMethod,
      reference: optStr(fd, "reference"),
      paidOn: dateField(fd, "paidOn") ?? today(),
      note: optStr(fd, "note"),
    });
    revalidatePath("/rent");
    flash(back, "msg", `${rupees(payment.amount)} received from ${inv.tenant.name}. Receipt ${payment.receiptNo} is ready.`);
  } catch (e) {
    if (e instanceof PaymentError) flash(back, "error", e.message);
    throw e;
  }
}

export async function confirmClaim(fd: FormData) {
  const { inv, property } = await ownedInvoice(str(fd, "invoiceId"));
  const back = str(fd, "back") || "/rent";
  if (!inv.claimedAt || !inv.claimAmount) flash(back, "error", "No payment claim on this invoice.");
  const balance = withBalance(inv).balance;
  try {
    const payment = await recordPayment(property.id, inv.id, {
      amount: Math.min(inv.claimAmount, balance),
      method: "UPI",
      reference: inv.claimRef,
      paidOn: today(inv.claimedAt),
      note: "Confirmed from tenant's payment claim",
    });
    revalidatePath("/rent");
    flash(back, "msg", `Confirmed ${rupees(payment.amount)} from ${inv.tenant.name}. Receipt ${payment.receiptNo}.`);
  } catch (e) {
    if (e instanceof PaymentError) flash(back, "error", e.message);
    throw e;
  }
}

export async function rejectClaim(fd: FormData) {
  const { inv } = await ownedInvoice(str(fd, "invoiceId"));
  await db.invoice.update({ where: { id: inv.id }, data: { claimAmount: null, claimRef: null, claimedAt: null } });
  revalidatePath("/rent");
  flash(str(fd, "back") || "/rent", "msg", `Payment claim from ${inv.tenant.name} dismissed.`);
}

/** Log a manual reminder and open WhatsApp with the message ready to send. */
export async function whatsappReminder(fd: FormData) {
  const { inv, property } = await ownedInvoice(str(fd, "invoiceId"));
  const view = withBalance(inv);
  const message = reminderMessage({
    tenantName: inv.tenant.name,
    propertyName: property.name,
    period: inv.period,
    balance: view.balance,
    dueDate: inv.dueDate,
    token: inv.publicToken,
  });
  const link = whatsappLink(inv.tenant.phone, message);
  if (!link) flash(`/rent/${inv.id}`, "error", "The tenant's phone number isn't valid for WhatsApp.");
  await db.reminder.create({ data: { invoiceId: inv.id, channel: "WHATSAPP_MANUAL", message } });
  redirect(link);
}

export async function saveAdjustments(fd: FormData) {
  const { inv, property } = await ownedInvoice(str(fd, "invoiceId"));
  await updateInvoiceAdjustments(property.id, inv.id, {
    rentAmount: rupeesField(fd, "rentAmount", inv.rentAmount),
    otherAmount: rupeesField(fd, "otherAmount"),
    otherNote: optStr(fd, "otherNote"),
    discount: rupeesField(fd, "discount"),
    dueDate: dateField(fd, "dueDate") ?? inv.dueDate,
  });
  revalidatePath("/rent");
  flash(`/rent/${inv.id}`, "msg", "Invoice updated.");
}

export async function deletePayment(fd: FormData) {
  const { property } = await requireOwner();
  const payment = await db.payment.findFirst({ where: { id: str(fd, "paymentId"), propertyId: property.id } });
  if (!payment) flash("/rent", "error", "Payment not found.");
  await db.payment.delete({ where: { id: payment.id } });
  revalidatePath("/rent");
  flash(`/rent/${payment.invoiceId}`, "msg", `Payment ${payment.receiptNo} deleted.`);
}

export async function deleteInvoice(fd: FormData) {
  const { inv } = await ownedInvoice(str(fd, "invoiceId"));
  if (inv.payments.length) flash(`/rent/${inv.id}`, "error", "Delete the payments on this invoice first.");
  await db.$transaction(async (tx) => {
    await tx.electricityShare.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } });
    await tx.invoice.delete({ where: { id: inv.id } });
  });
  revalidatePath("/rent");
  flash(`/rent?month=${inv.period}`, "msg", `Invoice for ${inv.tenant.name} deleted. Generate again to recreate it.`);
}

