import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, Badge, Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { DOC_LABELS, PersonalFields, POLICE_LABELS, VerificationFields } from "@/components/tenant-fields";
import { StatusBadge } from "@/components/status-badge";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, fmtPeriod, isoDate, today } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { getBedBoard } from "@/lib/services/occupancy";
import { invoiceInclude, withBalance } from "@/lib/services/invoices";
import { whatsappLink } from "@/lib/upi";
import {
  cancelNotice,
  changeBed,
  deleteDocument,
  giveNotice,
  moveOut,
  updateDeposit,
  updateTenant,
  uploadDocument,
} from "../actions";

export default async function TenantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const { id } = await params;
  const query = await searchParams;
  const tenant = await db.tenant.findFirst({
    where: { id, propertyId: property.id },
    include: {
      stays: { orderBy: { startDate: "desc" }, include: { bed: { include: { room: true } } } },
      documents: { orderBy: { uploadedAt: "desc" }, omit: { data: true } },
      invoices: { orderBy: { period: "desc" }, include: invoiceInclude },
      electricityShares: { where: { invoiceId: null }, include: { meterReading: true } },
    },
  });
  if (!tenant) notFound();

  const t = today();
  const current = tenant.stays.find((s) => !s.endDate || s.endDate >= t) ?? null;
  const invoices = tenant.invoices.map((i) => withBalance(i));
  const dues = invoices.reduce((s, i) => s + i.balance, 0);
  const pendingElectricity = tenant.electricityShares.reduce((s, x) => s + x.amount, 0);
  const depositHeld = tenant.depositReceived - tenant.depositDeduction - tenant.depositRefunded;

  const board = current ? await getBedBoard(property.id) : null;
  const moveOptions =
    board?.rooms.flatMap((r) =>
      r.beds
        .filter((b) => b.active && b.id !== current?.bedId && b.state.kind === "free" && !b.state.bookedFrom)
        .map((b) => ({ id: b.id, label: `Room ${r.name} · Bed ${b.label} · ${rupees(b.rent)}` })),
    ) ?? [];

  const wa = whatsappLink(tenant.phone, `Hi ${tenant.name.split(" ")[0]}, `);

  return (
    <>
      <BackLink href="/tenants">Tenants</BackLink>
      <PageHeader
        title={tenant.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <a href={`tel:${tenant.phone}`} className="link">{tenant.phone}</a>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="link">WhatsApp</a>}
            <Badge tone={tenant.status === "ACTIVE" ? "green" : tenant.status === "NOTICE" ? "amber" : "gray"}>
              {tenant.status === "ACTIVE" ? "Staying" : tenant.status === "NOTICE" ? "On notice" : "Moved out"}
            </Badge>
            <Badge tone={tenant.policeVerification === "VERIFIED" ? "green" : "amber"}>
              Police: {POLICE_LABELS[tenant.policeVerification]}
            </Badge>
          </span>
        }
      />
      <Flash msg={sp(query, "msg")} error={sp(query, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card title="Stay">
            {current ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><div className="text-stone-500">Bed</div><div className="font-semibold">Room {current.bed.room.name} · {current.bed.label}</div></div>
                  <div><div className="text-stone-500">Since</div><div className="font-semibold">{fmtDate(current.startDate)}</div></div>
                  <div><div className="text-stone-500">Rent</div><div className="font-semibold">{rupees(current.rent)}/mo</div></div>
                  <div>
                    <div className="text-stone-500">Last day</div>
                    <div className="font-semibold">{current.endDate ? fmtDate(current.endDate) : "Not decided"}</div>
                  </div>
                </div>

                {tenant.status === "NOTICE" && current.endDate ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    On notice. Bed free from {fmtDate(addDays(current.endDate, 1))}.
                    <form action={cancelNotice}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <button className="btn-secondary btn-sm">Cancel notice</button>
                    </form>
                  </div>
                ) : (
                  <form action={giveNotice} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <Field label="Gave notice — last day of stay" className="w-56">
                      <input name="lastDay" type="date" defaultValue={isoDate(addDays(t, 30))} required />
                    </Field>
                    <button className="btn-secondary">Record notice</button>
                  </form>
                )}

                <details className="text-sm">
                  <summary className="cursor-pointer text-stone-500 hover:text-stone-800">Shift to another bed</summary>
                  {moveOptions.length === 0 ? (
                    <p className="mt-2 text-stone-500">No free beds right now.</p>
                  ) : (
                    <form action={changeBed} className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <Field label="New bed">
                        <select name="bedId" required>
                          {moveOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                      </Field>
                      <Field label="From"><input name="fromDate" type="date" defaultValue={isoDate(t)} /></Field>
                      <Field label="New rent (₹)"><input name="rent" type="number" min={0} placeholder="bed rent" /></Field>
                      <button className="btn-secondary">Shift</button>
                    </form>
                  )}
                </details>

                <details className="text-sm">
                  <summary className="cursor-pointer text-red-700">Mark as moved out</summary>
                  <form action={moveOut} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <Field label="Last day of stay" className="w-48">
                      <input name="lastDay" type="date" defaultValue={isoDate(current.endDate ?? t)} />
                    </Field>
                    <button className="btn-danger">Move out</button>
                  </form>
                </details>
              </div>
            ) : (
              <div className="text-sm text-stone-500">
                {tenant.stays[0]?.endDate ? `Left on ${fmtDate(tenant.stays[0].endDate)} from room ${tenant.stays[0].bed.room.name}-${tenant.stays[0].bed.label}.` : "No bed assigned."}
                {tenant.status !== "MOVED_OUT" && (
                  <form action={moveOut} className="mt-3">
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <button className="btn-secondary btn-sm">Mark as moved out</button>
                  </form>
                )}
              </div>
            )}
            {tenant.stays.length > 1 && (
              <div className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500">
                History:{" "}
                {tenant.stays.map((s) => `${s.bed.room.name}-${s.bed.label} (${fmtDate(s.startDate)} – ${s.endDate ? fmtDate(s.endDate) : "now"})`).join(" · ")}
              </div>
            )}
          </Card>

          <Card title="Rent history" actions={dues > 0 ? <Badge tone="red">{rupees(dues)} due</Badge> : <Badge tone="green">No dues</Badge>}>
            {invoices.length === 0 ? (
              <Empty>No invoices yet. Generate this month&apos;s rent from the Rent page.</Empty>
            ) : (
              <div className="-m-4 overflow-x-auto">
                <table>
                  <thead><tr><th>Month</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
                  <tbody>
                    {invoices.map((i) => (
                      <tr key={i.id}>
                        <td><Link href={`/rent/${i.id}`} className="link">{fmtPeriod(i.period)}</Link></td>
                        <td className="tabular-nums">{rupees(i.totalAmount)}</td>
                        <td className="tabular-nums">{rupees(i.paid)}</td>
                        <td><StatusBadge status={i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pendingElectricity > 0 && (
              <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                {rupees(pendingElectricity)} electricity ({tenant.electricityShares.map((s) => fmtPeriod(s.meterReading.period)).join(", ")}) isn&apos;t on any invoice yet.
                It will be added to the next month&apos;s rent{tenant.status === "MOVED_OUT" ? " — or deduct it from the deposit" : ""}.
              </p>
            )}
          </Card>

          <Card title="Details">
            <form action={updateTenant} className="grid gap-6">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <PersonalFields t={tenant} />
              <div className="border-t border-stone-100 pt-5"><VerificationFields t={tenant} /></div>
              <div><button className="btn">Save details</button></div>
            </form>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card title="Deposit">
            <dl className="mb-4 grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-stone-500">Agreed</dt><dd className="text-right tabular-nums">{rupees(tenant.depositAmount)}</dd>
              <dt className="text-stone-500">Received</dt><dd className="text-right tabular-nums">{rupees(tenant.depositReceived)}</dd>
              <dt className="text-stone-500">Deducted</dt><dd className="text-right tabular-nums">{rupees(tenant.depositDeduction)}</dd>
              <dt className="text-stone-500">Refunded</dt><dd className="text-right tabular-nums">{rupees(tenant.depositRefunded)}</dd>
              <dt className="font-semibold">Holding</dt><dd className="text-right font-semibold tabular-nums">{rupees(depositHeld)}</dd>
            </dl>
            {tenant.status === "MOVED_OUT" && depositHeld > 0 && (
              <p className="mb-3 rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">
                Settlement: {rupees(dues)} rent due + {rupees(pendingElectricity)} electricity → refund {rupees(Math.max(0, depositHeld - dues - pendingElectricity))}.
              </p>
            )}
            <details open={tenant.status === "MOVED_OUT"}>
              <summary className="cursor-pointer text-sm text-stone-500 hover:text-stone-800">Update deposit</summary>
              <form action={updateDeposit} className="mt-3 grid gap-3">
                <input type="hidden" name="tenantId" value={tenant.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Agreed (₹)"><input name="depositAmount" type="number" min={0} defaultValue={tenant.depositAmount} /></Field>
                  <Field label="Received (₹)"><input name="depositReceived" type="number" min={0} defaultValue={tenant.depositReceived} /></Field>
                </div>
                <Field label="Received on"><input name="depositReceivedOn" type="date" defaultValue={isoDate(tenant.depositReceivedOn)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Deduction (₹)"><input name="depositDeduction" type="number" min={0} defaultValue={tenant.depositDeduction} /></Field>
                  <Field label="Refunded (₹)"><input name="depositRefunded" type="number" min={0} defaultValue={tenant.depositRefunded} /></Field>
                </div>
                <Field label="Deduction reason"><input name="depositDeductionNote" defaultValue={tenant.depositDeductionNote ?? ""} placeholder="Pending electricity, damage…" /></Field>
                <Field label="Refunded on"><input name="depositRefundedOn" type="date" defaultValue={isoDate(tenant.depositRefundedOn)} /></Field>
                <button className="btn-secondary">Save deposit</button>
              </form>
            </details>
          </Card>

          <Card title="Documents">
            {tenant.documents.length === 0 ? (
              <p className="mb-3 text-sm text-stone-500">No documents uploaded.</p>
            ) : (
              <ul className="mb-4 grid gap-2 text-sm">
                {tenant.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <a href={`/api/documents/${d.id}`} target="_blank" className="link min-w-0 truncate" rel="noreferrer">
                      {DOC_LABELS[d.type]} · {d.fileName}
                    </a>
                    <form action={deleteDocument}>
                      <input type="hidden" name="documentId" value={d.id} />
                      <button className="text-xs text-stone-400 hover:text-red-700" aria-label={`Delete ${d.fileName}`}>Delete</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={uploadDocument} className="grid gap-3 border-t border-stone-100 pt-3">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <Field label="Type">
                <select name="type">
                  {Object.entries(DOC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <input name="file" type="file" accept="image/*,application/pdf" required aria-label="File" />
              <button className="btn-secondary">Upload</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
