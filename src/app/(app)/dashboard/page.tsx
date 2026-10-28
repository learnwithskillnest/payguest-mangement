import Link from "next/link";
import { Card, Flash, PageHeader, Stat } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, addMonths, currentPeriod, fmtDate, fmtPeriod, today } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { getBedBoard } from "@/lib/services/occupancy";
import { invoiceInclude, uninvoicedCount, withBalance } from "@/lib/services/invoices";
import { monthlySummaries } from "@/lib/services/reports";
import { whatsappReminder } from "../rent/actions";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const { property, user } = await requireOwner();
  const params = await searchParams;
  const t = today();
  const month = currentPeriod();
  const lastMonth = addMonths(month, -1);

  const [board, unpaidRaw, missing, claims, summary, policePending, agreementsEnding, noticeOver, meteredRooms, readingsDone, depositsShort] =
    await Promise.all([
      getBedBoard(property.id, t),
      db.invoice.findMany({ where: { propertyId: property.id }, include: invoiceInclude, orderBy: { dueDate: "asc" } }),
      uninvoicedCount(property.id, month),
      db.invoice.count({ where: { propertyId: property.id, claimedAt: { not: null } } }),
      monthlySummaries(property.id, month, 1),
      db.tenant.count({ where: { propertyId: property.id, status: { not: "MOVED_OUT" }, policeVerification: { not: "VERIFIED" } } }),
      db.tenant.findMany({
        where: { propertyId: property.id, status: { not: "MOVED_OUT" }, agreementEnd: { lte: addDays(t, 30) } },
        orderBy: { agreementEnd: "asc" },
      }),
      db.tenant.findMany({
        where: { propertyId: property.id, status: "NOTICE", stays: { some: { endDate: { lt: t } }, none: { OR: [{ endDate: null }, { endDate: { gte: t } }] } } },
      }),
      db.room.count({ where: { propertyId: property.id, hasSubMeter: true, beds: { some: { stays: { some: {} } } } } }),
      db.meterReading.count({ where: { period: lastMonth, room: { propertyId: property.id } } }),
      db.tenant.findMany({ where: { propertyId: property.id, status: { not: "MOVED_OUT" }, depositAmount: { gt: 0 } }, select: { id: true, depositAmount: true, depositReceived: true } }),
    ]);

  const invoices = unpaidRaw.map((i) => withBalance(i, t)).filter((i) => i.balance > 0);
  const overdue = invoices.filter((i) => i.status === "OVERDUE" || (i.status === "PARTIAL" && i.dueDate < t));
  const outstanding = invoices.reduce((s, i) => s + i.balance, 0);
  const thisMonth = summary[0];
  const shortDeposits = depositsShort.filter((d) => d.depositReceived < d.depositAmount).length;

  const todo: { text: string; href: string; tone: "red" | "amber" | "blue" }[] = [];
  if (board.totals.beds === 0) todo.push({ text: "Add your rooms and beds to get started", href: "/rooms", tone: "blue" });
  if (!property.upiVpa) todo.push({ text: "Add your UPI ID so tenants can pay by link", href: "/settings", tone: "amber" });
  if (missing > 0) todo.push({ text: `Generate ${fmtPeriod(month)} rent for ${missing} tenant${missing > 1 ? "s" : ""}`, href: `/rent?month=${month}`, tone: "blue" });
  if (claims > 0) todo.push({ text: `${claims} tenant${claims > 1 ? "s say" : " says"} they've paid — confirm`, href: "/rent", tone: "blue" });
  if (meteredRooms > readingsDone) todo.push({ text: `Enter ${fmtPeriod(lastMonth)} meter readings (${meteredRooms - readingsDone} room${meteredRooms - readingsDone > 1 ? "s" : ""} left)`, href: `/electricity?month=${lastMonth}`, tone: "amber" });
  for (const n of noticeOver) todo.push({ text: `${n.name}'s notice period is over — mark moved out & settle deposit`, href: `/tenants/${n.id}`, tone: "amber" });
  if (policePending > 0) todo.push({ text: `${policePending} tenant${policePending > 1 ? "s" : ""} without police verification`, href: "/tenants?tab=pending", tone: "amber" });
  for (const a of agreementsEnding.slice(0, 5)) {
    todo.push({ text: `${a.name}'s agreement ${a.agreementEnd! < t ? "expired" : "ends"} ${fmtDate(a.agreementEnd)}`, href: `/tenants/${a.id}`, tone: a.agreementEnd! < t ? "red" : "amber" });
  }
  if (shortDeposits > 0) todo.push({ text: `${shortDeposits} tenant${shortDeposits > 1 ? "s haven't" : " hasn't"} paid the full deposit`, href: "/tenants", tone: "amber" });

  const dot = { red: "bg-red-500", amber: "bg-amber-500", blue: "bg-sky-500" };

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} subtitle={`${property.name} · ${fmtDate(t)}`} />
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Occupancy" value={`${board.totals.occupancyPct}%`} hint={`${board.totals.occupied}/${board.totals.beds} beds · ${board.totals.free} free`} tone="good" />
        <Stat label={`Collected · ${fmtPeriod(month)}`} value={rupees(thisMonth.collected)} hint={`of ${rupees(thisMonth.billed)} billed`} />
        <Stat label="Outstanding" value={rupees(outstanding)} tone={outstanding ? "bad" : "default"} hint={`${invoices.length} unpaid invoice${invoices.length === 1 ? "" : "s"}`} />
        <Stat label={`Profit · ${fmtPeriod(month)}`} value={rupees(thisMonth.profit)} tone={thisMonth.profit >= 0 ? "good" : "bad"} hint={`${rupees(thisMonth.expenses)} spent`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card title="To do">
            {todo.length === 0 ? (
              <p className="text-sm text-stone-500">All caught up. 🎉</p>
            ) : (
              <ul className="grid gap-1">
                {todo.map((x, i) => (
                  <li key={i}>
                    <Link href={x.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-stone-50">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dot[x.tone]}`} />
                      <span className="flex-1">{x.text}</span>
                      <span className="text-stone-400">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Overdue rent" actions={<Link href="/rent?show=unpaid" className="link text-sm">All unpaid</Link>}>
            {overdue.length === 0 ? (
              <p className="text-sm text-stone-500">Nobody is overdue.</p>
            ) : (
              <ul className="grid gap-2">
                {overdue.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <Link href={`/rent/${i.id}`} className="link">{i.tenant.name}</Link>{" "}
                      <span className="text-stone-500">· {fmtPeriod(i.period)} · due {fmtDate(i.dueDate)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <strong className="tabular-nums text-red-700">{rupees(i.balance)}</strong>
                      <form action={whatsappReminder}>
                        <input type="hidden" name="invoiceId" value={i.id} />
                        <button className="btn-secondary btn-sm">Remind</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card title="Free beds" actions={<Link href="/rooms" className="link text-sm">Bed board</Link>}>
            {board.freeBeds.length === 0 ? (
              <p className="text-sm text-stone-500">Full house.</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {board.freeBeds.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <span>{b.room}-{b.label} <span className="text-stone-500">· {rupees(b.rent)}</span></span>
                    <span className="text-right text-xs text-stone-500">
                      {b.state.kind === "free" && b.state.bookedFrom ? `booked from ${fmtDate(b.state.bookedFrom)}` : b.state.kind === "free" && b.state.since ? `since ${fmtDate(b.state.since)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Leaving soon">
            {board.vacatingBeds.length === 0 ? (
              <p className="text-sm text-stone-500">No one on notice.</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {board.vacatingBeds.map((b) =>
                  b.state.kind === "vacating" ? (
                    <li key={b.id} className="flex justify-between gap-2">
                      <Link href={`/tenants/${b.state.tenantId}`} className="link">{b.state.tenantName}</Link>
                      <span className="text-xs text-stone-500">{b.room}-{b.label} free {fmtDate(b.state.freeFrom)}</span>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
