"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { fmtPeriod, isPeriod } from "@/lib/dates";
import { flash, floatField, str } from "@/lib/forms";
import { ReadingError, saveReading } from "@/lib/services/electricity";

export async function saveReadings(fd: FormData) {
  const { property } = await requireOwner();
  const month = str(fd, "month");
  if (!isPeriod(month)) flash("/electricity", "error", "Pick a valid month.");
  const back = `/electricity?month=${month}`;
  const rate = floatField(fd, "rate") ?? property.electricityRate;
  if (rate < 0) flash(back, "error", "Rate can't be negative.");

  const rooms = await db.room.findMany({ where: { propertyId: property.id, hasSubMeter: true } });
  const errors: string[] = [];
  let saved = 0;
  for (const room of rooms) {
    const prev = floatField(fd, `prev_${room.id}`);
    const curr = floatField(fd, `curr_${room.id}`);
    if (curr === null) continue;
    if (prev === null) {
      errors.push(`Room ${room.name}: enter the previous reading.`);
      continue;
    }
    try {
      await saveReading({ propertyId: property.id, roomId: room.id, period: month, previousReading: prev, currentReading: curr, rate });
      saved++;
    } catch (e) {
      if (e instanceof ReadingError) errors.push(e.message);
      else throw e;
    }
  }
  revalidatePath("/electricity");
  revalidatePath("/rent");
  if (errors.length) flash(back, "error", `${saved ? `Saved ${saved} room${saved > 1 ? "s" : ""}. ` : ""}${errors.join(" ")}`);
  flash(back, "msg", saved ? `Saved ${saved} reading${saved > 1 ? "s" : ""} for ${fmtPeriod(month)} and split the bills.` : "Enter at least one current reading.");
}
