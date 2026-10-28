import { db } from "../db";
import { meterBill, splitByDays } from "../billing";
import { overlapDays, periodEnd, periodStart } from "../dates";
import { attachUnbilledShares, recalcInvoice } from "./invoices";

/** Occupant-days per tenant for a room in a usage month. */
export async function roomOccupancy(roomId: string, period: string) {
  const stays = await db.stay.findMany({
    where: {
      bed: { roomId },
      startDate: { lte: periodEnd(period) },
      OR: [{ endDate: null }, { endDate: { gte: periodStart(period) } }],
    },
    include: { tenant: true },
  });
  const byTenant = new Map<string, { tenantId: string; name: string; days: number }>();
  for (const s of stays) {
    const days = overlapDays(s.startDate, s.endDate, period);
    const cur = byTenant.get(s.tenantId) ?? { tenantId: s.tenantId, name: s.tenant.name, days: 0 };
    cur.days += days;
    byTenant.set(s.tenantId, cur);
  }
  return [...byTenant.values()].filter((o) => o.days > 0);
}

/** Previous reading for a room: last month's closing reading, if recorded. */
export async function lastReadingBefore(roomId: string, period: string) {
  return db.meterReading.findFirst({
    where: { roomId, period: { lt: period } },
    orderBy: { period: "desc" },
  });
}

export class ReadingError extends Error {}

/**
 * Save a sub-meter reading and split the bill across the room's occupants by days stayed.
 * Re-saving replaces earlier shares and corrects any invoices they were billed on.
 */
export async function saveReading(input: {
  propertyId: string;
  roomId: string;
  period: string;
  previousReading: number;
  currentReading: number;
  rate: number;
}) {
  const room = await db.room.findFirst({ where: { id: input.roomId, propertyId: input.propertyId } });
  if (!room) throw new ReadingError("Room not found.");
  if (input.currentReading < input.previousReading) {
    throw new ReadingError(`Room ${room.name}: current reading is lower than the previous reading.`);
  }
  const { units, amount } = meterBill(input.previousReading, input.currentReading, input.rate);
  const occupants = await roomOccupancy(room.id, input.period);
  const shares = splitByDays(amount, occupants);

  return db.$transaction(async (tx) => {
    const reading = await tx.meterReading.upsert({
      where: { roomId_period: { roomId: room.id, period: input.period } },
      create: {
        roomId: room.id,
        period: input.period,
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        rate: input.rate,
        units,
        amount,
      },
      update: {
        previousReading: input.previousReading,
        currentReading: input.currentReading,
        rate: input.rate,
        units,
        amount,
      },
    });
    const old = await tx.electricityShare.findMany({ where: { meterReadingId: reading.id } });
    await tx.electricityShare.deleteMany({ where: { meterReadingId: reading.id } });
    for (const invoiceId of new Set(old.map((s) => s.invoiceId).filter(Boolean) as string[])) {
      await recalcInvoice(tx, invoiceId);
    }
    for (const s of shares) {
      if (s.amount <= 0) continue;
      await tx.electricityShare.create({
        data: { meterReadingId: reading.id, tenantId: s.tenantId, days: s.days, amount: s.amount },
      });
    }
    await attachUnbilledShares(tx, shares.map((s) => s.tenantId));
    return { reading, shares };
  });
}
