"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PROPERTY_COOKIE, requireOwner } from "@/lib/auth";
import { flash, floatField, intField, optStr, str } from "@/lib/forms";
import { isValidVpa } from "@/lib/upi";

export async function switchProperty(fd: FormData) {
  const { properties } = await requireOwner();
  const id = str(fd, "propertyId");
  if (properties.some((p) => p.id === id)) {
    (await cookies()).set(PROPERTY_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function updateProperty(fd: FormData) {
  const { property } = await requireOwner();
  const name = str(fd, "name");
  if (!name) flash("/settings", "error", "PG name is required.");
  const upiVpa = optStr(fd, "upiVpa");
  if (upiVpa && !isValidVpa(upiVpa)) flash("/settings", "error", "That UPI ID doesn't look right. It should look like name@bank.");
  const rate = floatField(fd, "electricityRate");
  const prefix = str(fd, "receiptPrefix").toUpperCase().replace(/[^A-Z0-9]/g, "") || "RCPT";
  await db.property.update({
    where: { id: property.id },
    data: {
      name,
      address: optStr(fd, "address"),
      city: optStr(fd, "city"),
      phone: optStr(fd, "phone"),
      upiVpa,
      upiPayeeName: optStr(fd, "upiPayeeName"),
      rentDueDay: intField(fd, "rentDueDay", property.rentDueDay, 1, 28),
      electricityRate: rate !== null && rate >= 0 ? rate : property.electricityRate,
      remindersEnabled: fd.get("remindersEnabled") === "on",
      reminderDaysBefore: intField(fd, "reminderDaysBefore", property.reminderDaysBefore, 0, 15),
      reminderRepeatDays: intField(fd, "reminderRepeatDays", property.reminderRepeatDays, 1, 30),
      receiptPrefix: prefix.slice(0, 10),
    },
  });
  revalidatePath("/", "layout");
  flash("/settings", "msg", "Settings saved.");
}

export async function addProperty(fd: FormData) {
  const { user } = await requireOwner();
  const name = str(fd, "name");
  if (!name) flash("/settings", "error", "Enter a name for the new PG.");
  const created = await db.property.create({
    data: { ownerId: user.id, name, city: optStr(fd, "city"), upiPayeeName: user.name },
  });
  (await cookies()).set(PROPERTY_COOKIE, created.id, { path: "/", httpOnly: true, sameSite: "lax" });
  revalidatePath("/", "layout");
  redirect(`/rooms?msg=${encodeURIComponent(`${name} added. Add its rooms and beds.`)}`);
}
