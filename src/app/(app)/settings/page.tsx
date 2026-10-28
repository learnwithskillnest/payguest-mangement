import { Card, Field, Flash, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { sp, type SearchParams } from "@/lib/forms";
import { addProperty, updateProperty } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { property: p } = await requireOwner();
  const params = await searchParams;
  return (
    <>
      <PageHeader title="Settings" subtitle={`Details for ${p.name}`} />
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />
      <form action={updateProperty} className="grid gap-6 lg:grid-cols-2">
        <Card title="PG details">
          <div className="grid gap-4">
            <Field label="PG name">
              <input name="name" defaultValue={p.name} required />
            </Field>
            <Field label="Address">
              <textarea name="address" rows={2} defaultValue={p.address ?? ""} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City">
                <input name="city" defaultValue={p.city ?? ""} />
              </Field>
              <Field label="Contact number" hint="Printed on receipts">
                <input name="phone" type="tel" defaultValue={p.phone ?? ""} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Rent collection">
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="UPI ID" hint="Tenants pay to this ID">
                <input name="upiVpa" defaultValue={p.upiVpa ?? ""} placeholder="yourname@okhdfcbank" />
              </Field>
              <Field label="Name on UPI">
                <input name="upiPayeeName" defaultValue={p.upiPayeeName ?? ""} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rent due on day" hint="Day of the month, 1–28">
                <input name="rentDueDay" type="number" min={1} max={28} defaultValue={p.rentDueDay} />
              </Field>
              <Field label="Receipt prefix" hint="e.g. RCPT-00012">
                <input name="receiptPrefix" defaultValue={p.receiptPrefix} maxLength={10} />
              </Field>
            </div>
            <Field label="Electricity rate (₹ per unit)" hint="Default rate for room sub-meters">
              <input name="electricityRate" type="number" step="0.01" min={0} defaultValue={p.electricityRate} />
            </Field>
          </div>
        </Card>

        <Card title="Automatic reminders" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 sm:col-span-3">
              <input type="checkbox" name="remindersEnabled" defaultChecked={p.remindersEnabled} />
              Send rent reminders to tenants automatically
            </label>
            <Field label="First reminder (days before due)">
              <input name="reminderDaysBefore" type="number" min={0} max={15} defaultValue={p.reminderDaysBefore} />
            </Field>
            <Field label="Repeat every (days) while overdue">
              <input name="reminderRepeatDays" type="number" min={1} max={30} defaultValue={p.reminderRepeatDays} />
            </Field>
            <p className="self-end text-xs text-stone-500">
              Reminders include a payment link with your UPI ID. Delivery channel (WhatsApp Business API or webhook)
              is configured on the server.
            </p>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <button className="btn">Save settings</button>
        </div>
      </form>

      <Card title="Add another PG" className="mt-8">
        <form action={addProperty} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="PG name">
            <input name="name" required />
          </Field>
          <Field label="City">
            <input name="city" />
          </Field>
          <button className="btn-secondary">Add PG</button>
        </form>
      </Card>
    </>
  );
}
