"use server";

import { db } from "@/lib/db";
import { flash, optStr, rupeesField, str } from "@/lib/forms";

/** Tenant-side "I've paid" — recorded as a claim the owner confirms against their UPI app. */
export async function submitClaim(fd: FormData) {
  const token = str(fd, "token");
  const back = `/pay/${token}`;
  const inv = await db.invoice.findUnique({ where: { publicToken: token }, include: { payments: true } });
  if (!inv) flash("/", "error", "Payment link not found.");
  const balance = inv.totalAmount - inv.payments.reduce((s, p) => s + p.amount, 0);
  const amount = rupeesField(fd, "amount");
  const ref = optStr(fd, "ref");
  if (amount <= 0 || amount > balance) flash(back, "error", `Enter the amount you paid (up to ₹${balance}).`);
  if (!ref || ref.length < 6) flash(back, "error", "Enter the UPI transaction ID / UTR from your payment app.");
  await db.invoice.update({
    where: { id: inv.id },
    data: { claimAmount: amount, claimRef: ref.slice(0, 40), claimedAt: new Date() },
  });
  flash(back, "msg", "Thanks! Your PG owner will confirm the payment and your receipt will appear here.");
}
