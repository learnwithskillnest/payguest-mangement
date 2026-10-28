import { BackLink, Card, Field, Flash, PageHeader } from "@/components/ui";
import { PersonalFields, VerificationFields } from "@/components/tenant-fields";
import { requireOwner } from "@/lib/auth";
import { fmtDate, isoDate, today } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { getBedBoard } from "@/lib/services/occupancy";
import { createTenant } from "../actions";

export const metadata = { title: "Add tenant" };

export default async function NewTenantPage({ searchParams }: { searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const params = await searchParams;
  const board = await getBedBoard(property.id);
  const options = board.rooms.flatMap((r) =>
    r.beds
      .filter((b) => b.active && b.state.kind !== "occupied" && !(b.state.kind === "free" && b.state.bookedFrom))
      .map((b) => ({
        id: b.id,
        rent: b.rent,
        label: `Room ${r.name} · Bed ${b.label} · ${rupees(b.rent)}${b.state.kind === "vacating" ? ` (free from ${fmtDate(b.state.freeFrom)})` : ""}`,
      })),
  );
  const selected = sp(params, "bedId");

  return (
    <>
      <BackLink href="/tenants">Tenants</BackLink>
      <PageHeader title="Add tenant" subtitle="Move-in details, ID and deposit. You can fill the rest later." />
      <Flash error={sp(params, "error")} />
      <form action={createTenant} className="grid gap-6">
        <Card title="Bed and rent">
          {options.length === 0 ? (
            <p className="text-sm text-stone-500">No free beds. Add a room or bed first on the Rooms page.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bed" className="sm:col-span-3">
                <select name="bedId" defaultValue={selected} required>
                  <option value="">Choose a bed…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Move-in date"><input name="startDate" type="date" defaultValue={isoDate(today())} required /></Field>
              <Field label="Monthly rent (₹)" hint="Leave blank to use the bed's rent"><input name="rent" type="number" min={0} /></Field>
            </div>
          )}
        </Card>
        <Card title="Personal details"><PersonalFields /></Card>
        <Card title="ID, police verification & agreement">
          <VerificationFields />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Upload ID proof" hint="JPG, PNG or PDF, up to 5 MB"><input name="idFile" type="file" accept="image/*,application/pdf" /></Field>
            <Field label="Upload signed agreement"><input name="agreementFile" type="file" accept="image/*,application/pdf" /></Field>
          </div>
        </Card>
        <Card title="Security deposit">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Deposit amount (₹)"><input name="depositAmount" type="number" min={0} /></Field>
            <Field label="Received so far (₹)"><input name="depositReceived" type="number" min={0} /></Field>
            <Field label="Received on"><input name="depositReceivedOn" type="date" defaultValue={isoDate(today())} /></Field>
          </div>
        </Card>
        <div><button className="btn" disabled={options.length === 0}>Save tenant</button></div>
      </form>
    </>
  );
}
