import { ReminderChannel } from "@prisma/client";
import { db } from "../db";
import { shouldSendReminder } from "../billing";
import { currentPeriod, fmtDate, fmtPeriod, today } from "../dates";
import { rupees } from "../money";
import { whatsappNumber } from "../upi";
import { invoiceInclude, withBalance, type InvoiceView } from "./invoices";

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function payUrl(token: string): string {
  return `${appUrl()}/pay/${token}`;
}

export function reminderMessage(opts: {
  tenantName: string;
  propertyName: string;
  period: string;
  balance: number;
  dueDate: Date;
  token: string;
}): string {
  const first = opts.tenantName.split(" ")[0];
  const overdue = today() > opts.dueDate;
  return [
    `Hi ${first}, ${overdue ? "a gentle reminder that your" : "your"} ${opts.propertyName} rent for ${fmtPeriod(opts.period)} of ${rupees(opts.balance)} ${overdue ? `was due on ${fmtDate(opts.dueDate)}` : `is due on ${fmtDate(opts.dueDate)}`}.`,
    `Pay by UPI here: ${payUrl(opts.token)}`,
    `Thank you!`,
  ].join("\n");
}

type SendResult = { channel: ReminderChannel; success: boolean; error?: string };

/** Deliver a reminder through the configured provider (REMINDER_PROVIDER). */
async function deliver(phone: string, message: string, inv: InvoiceView, propertyName: string): Promise<SendResult> {
  const provider = process.env.REMINDER_PROVIDER ?? "log";
  try {
    if (provider === "whatsapp_cloud") {
      const to = whatsappNumber(phone);
      if (!to) return { channel: "WHATSAPP_API", success: false, error: "Invalid phone number" };
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: process.env.WHATSAPP_TEMPLATE_NAME ?? "rent_reminder",
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: inv.tenant.name.split(" ")[0] },
                    { type: "text", text: rupees(inv.balance) },
                    { type: "text", text: fmtPeriod(inv.period) },
                    { type: "text", text: payUrl(inv.publicToken) },
                  ],
                },
              ],
            },
          }),
        },
      );
      if (!res.ok) return { channel: "WHATSAPP_API", success: false, error: `${res.status} ${await res.text()}`.slice(0, 500) };
      return { channel: "WHATSAPP_API", success: true };
    }
    if (provider === "webhook") {
      const res = await fetch(process.env.REMINDER_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          message,
          tenant: inv.tenant.name,
          property: propertyName,
          period: inv.period,
          amount: inv.balance,
          payUrl: payUrl(inv.publicToken),
        }),
      });
      if (!res.ok) return { channel: "WEBHOOK", success: false, error: `${res.status}` };
      return { channel: "WEBHOOK", success: true };
    }
    console.log(`[reminder] to ${phone}: ${message.replace(/\n/g, " | ")}`);
    return { channel: "LOG", success: true };
  } catch (e) {
    return { channel: provider === "webhook" ? "WEBHOOK" : "WHATSAPP_API", success: false, error: String(e).slice(0, 500) };
  }
}

/** Run once a day: send reminders for every unpaid invoice that is due for one. */
export async function sendDueReminders(now: Date = new Date()) {
  const onDate = today(now);
  const properties = await db.property.findMany({ where: { remindersEnabled: true } });
  let sent = 0;
  let failed = 0;
  for (const property of properties) {
    const invoices = await db.invoice.findMany({
      where: {
        propertyId: property.id,
        period: { lte: currentPeriod(now) },
        tenant: { status: { not: "MOVED_OUT" } },
      },
      include: {
        ...invoiceInclude,
        // Only automatic reminders count toward the schedule
        reminders: { where: { channel: { not: "WHATSAPP_MANUAL" }, success: true }, orderBy: { sentAt: "desc" }, take: 1 },
      },
    });
    for (const raw of invoices) {
      const inv = withBalance(raw, onDate);
      if (inv.balance <= 0) continue;
      const last = inv.reminders[0]?.sentAt;
      const lastSentOn = last ? today(last) : null;
      if (
        !shouldSendReminder({
          today: onDate,
          dueDate: inv.dueDate,
          lastSentOn,
          daysBefore: property.reminderDaysBefore,
          repeatDays: property.reminderRepeatDays,
        })
      ) continue;
      const message = reminderMessage({
        tenantName: inv.tenant.name,
        propertyName: property.name,
        period: inv.period,
        balance: inv.balance,
        dueDate: inv.dueDate,
        token: inv.publicToken,
      });
      const result = await deliver(inv.tenant.phone, message, inv, property.name);
      await db.reminder.create({
        data: { invoiceId: inv.id, channel: result.channel, success: result.success, error: result.error, message },
      });
      if (result.success) sent++;
      else failed++;
    }
  }
  return { sent, failed };
}
