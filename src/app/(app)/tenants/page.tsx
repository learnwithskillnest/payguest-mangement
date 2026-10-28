import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge, Card, Empty, Flash, PageHeader } from "@/components/ui";
import { POLICE_LABELS } from "@/components/tenant-fields";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, today } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";

export const metadata = { title: "Tenants" };

const TABS = [
  { key: "current", label: "Staying" },
  { key: "notice", label: "On notice" },
  { key: "pending", label: "Verification pending" },
  { key: "past", label: "Moved out" },
];

export default async function TenantsPage({ searchParams }: { searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const params = await searchParams;
  const tab = sp(params, "tab") ?? "current";
  const q = sp(params, "q")?.trim();

  const where: Prisma.TenantWhereInput = { propertyId: property.id };
  if (tab === "current") where.status = { in: ["ACTIVE", "NOTICE"] };
  if (tab === "notice") where.status = "NOTICE";
  if (tab === "past") where.status = "MOVED_OUT";
  if (tab === "pending") {
    where.status = { in: ["ACTIVE", "NOTICE"] };
    where.policeVerification = { not: "VERIFIED" };
  }
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }];

  const tenants = await db.tenant.findMany({
    where,
    orderBy: { name: "asc" },
    include: { stays: { orderBy: { startDate: "desc" }, take: 1, include: { bed: { include: { room: true } } } } },
  });
  const t = today();

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle="Records, verification, agreements and deposits."
        actions={<Link href="/tenants/new" className="btn">+ Add tenant</Link>}
      />
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((x) => (
            <Link
              key={x.key}
              href={`/tenants?tab=${x.key}`}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${tab === x.key ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-200"}`}
            >
              {x.label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="Search name or phone" className="sm:w-60" />
        </form>
      </div>

      <Card>
        {tenants.length === 0 ? (
          <Empty action={tab === "current" ? <Link href="/tenants/new" className="btn">Add a tenant</Link> : undefined}>
            No tenants here.
          </Empty>
        ) : (
          <div className="-m-4 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Bed</th>
                  <th>Rent</th>
                  <th>Police</th>
                  <th>Deposit</th>
                  <th>Agreement</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((x) => {
                  const stay = x.stays[0];
                  const agreementSoon = x.agreementEnd && x.agreementEnd <= addDays(t, 30);
                  return (
                    <tr key={x.id} className="hover:bg-stone-50">
                      <td>
                        <Link href={`/tenants/${x.id}`} className="link">{x.name}</Link>
                        <div className="text-xs text-stone-500">{x.phone}</div>
                      </td>
                      <td>
                        {stay ? `${stay.bed.room.name}-${stay.bed.label}` : "—"}
                        {stay && stay.startDate > t && (
                          <div className="text-xs text-sky-700">Moves in {fmtDate(stay.startDate)}</div>
                        )}
                        {x.status === "NOTICE" && stay?.endDate && (
                          <div className="text-xs text-amber-700">Leaving {fmtDate(stay.endDate)}</div>
                        )}
                        {x.status === "MOVED_OUT" && stay?.endDate && (
                          <div className="text-xs text-stone-500">Left {fmtDate(stay.endDate)}</div>
                        )}
                      </td>
                      <td className="tabular-nums">{stay ? rupees(stay.rent) : "—"}</td>
                      <td>
                        <Badge tone={x.policeVerification === "VERIFIED" ? "green" : x.policeVerification === "REJECTED" ? "red" : x.policeVerification === "SUBMITTED" ? "blue" : "amber"}>
                          {POLICE_LABELS[x.policeVerification]}
                        </Badge>
                      </td>
                      <td className="tabular-nums">
                        {x.depositAmount === 0 ? "—" : x.depositReceived >= x.depositAmount ? (
                          <Badge tone="green">{rupees(x.depositReceived)}</Badge>
                        ) : (
                          <Badge tone="amber">{rupees(x.depositReceived)} / {rupees(x.depositAmount)}</Badge>
                        )}
                      </td>
                      <td className={agreementSoon && x.status !== "MOVED_OUT" ? "text-amber-700" : ""}>
                        {x.agreementEnd ? `till ${fmtDate(x.agreementEnd)}` : <span className="text-stone-400">none</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
