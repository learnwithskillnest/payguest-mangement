import Link from "next/link";
import { Card, Empty, Flash, MonthPicker, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { addMonths, currentPeriod, fmtPeriod, isPeriod } from "@/lib/dates";
import { sp, type SearchParams } from "@/lib/forms";
import { rupees } from "@/lib/money";
import { lastReadingBefore, roomOccupancy } from "@/lib/services/electricity";
import { saveReadings } from "./actions";

export const metadata = { title: "Electricity" };

export default async function ElectricityPage({ searchParams }: { searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const params = await searchParams;
  // Readings are usually taken at the start of a month for the month just gone.
  const month = isPeriod(sp(params, "month")) ? sp(params, "month")! : addMonths(currentPeriod(), -1);

  const rooms = await db.room.findMany({
    where: { propertyId: property.id, hasSubMeter: true },
    orderBy: [{ floor: "asc" }, { name: "asc" }],
    include: {
      readings: {
        where: { period: month },
        include: { shares: { include: { tenant: true, invoice: true } } },
      },
    },
  });
  const rows = await Promise.all(
    rooms.map(async (room) => ({
      room,
      reading: room.readings[0] ?? null,
      previous: await lastReadingBefore(room.id, month),
      occupants: await roomOccupancy(room.id, month),
    })),
  );
  const rate = rows.find((r) => r.reading)?.reading?.rate ?? property.electricityRate;
  const totalAmount = rows.reduce((s, r) => s + (r.reading?.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`Electricity · ${fmtPeriod(month)}`}
        subtitle="Enter each room's sub-meter reading. The bill is split between the room's tenants by days stayed and added to their next rent invoice."
        actions={<MonthPicker period={month} action="/electricity" />}
      />
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />

      {rooms.length === 0 ? (
        <Empty action={<Link href="/rooms" className="btn-secondary">Go to rooms</Link>}>
          No rooms have a sub-meter. Turn on &quot;Sub-meter&quot; for a room on the Rooms page.
        </Empty>
      ) : (
        <form action={saveReadings}>
          <input type="hidden" name="month" value={month} />
          <Card
            title="Meter readings"
            actions={
              <label className="flex items-center gap-2 text-sm font-normal">
                ₹ per unit
                <input name="rate" type="number" step="0.01" min={0} defaultValue={rate} className="w-24" />
              </label>
            }
          >
            <div className="-m-4 overflow-x-auto">
              <table>
                <thead>
                  <tr><th>Room</th><th>Previous</th><th>Current</th><th className="text-right">Units</th><th className="text-right">Bill</th><th>Split between</th></tr>
                </thead>
                <tbody>
                  {rows.map(({ room, reading, previous, occupants }) => (
                    <tr key={room.id}>
                      <td className="font-semibold">{room.name}</td>
                      <td>
                        <input
                          name={`prev_${room.id}`}
                          type="number"
                          step="0.01"
                          min={0}
                          defaultValue={reading?.previousReading ?? previous?.currentReading ?? ""}
                          className="w-28"
                          aria-label={`Room ${room.name} previous reading`}
                        />
                      </td>
                      <td>
                        <input
                          name={`curr_${room.id}`}
                          type="number"
                          step="0.01"
                          min={0}
                          defaultValue={reading?.currentReading ?? ""}
                          className="w-28"
                          aria-label={`Room ${room.name} current reading`}
                        />
                      </td>
                      <td className="text-right tabular-nums">{reading ? reading.units : "—"}</td>
                      <td className="text-right font-semibold tabular-nums">{reading ? rupees(reading.amount) : "—"}</td>
                      <td className="text-xs">
                        {reading && reading.shares.length > 0 ? (
                          <ul className="grid gap-0.5">
                            {reading.shares.map((s) => (
                              <li key={s.id}>
                                {s.tenant.name}: <strong>{rupees(s.amount)}</strong> ({s.days}d){" "}
                                {s.invoice ? (
                                  <Link href={`/rent/${s.invoice.id}`} className="text-brand-700">on {fmtPeriod(s.invoice.period)} rent</Link>
                                ) : (
                                  <span className="text-amber-700">next invoice</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : occupants.length ? (
                          <span className="text-stone-500">{occupants.map((o) => `${o.name} (${o.days}d)`).join(", ")}</span>
                        ) : (
                          <span className="text-stone-400">Empty all month</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
              <span className="text-sm text-stone-500">Total recovered from tenants: <strong className="text-ink">{rupees(totalAmount)}</strong></span>
              <button className="btn">Save readings & split</button>
            </div>
          </Card>
          <p className="mt-3 text-xs text-stone-500">
            Tip: record the full electricity bill you pay under Expenses → Electricity. The profit view then shows what common areas cost you.
          </p>
        </form>
      )}
    </>
  );
}
