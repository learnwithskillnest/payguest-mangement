"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { flash, intField, optStr, rupeesField, str } from "@/lib/forms";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export async function addRoom(fd: FormData) {
  const { property } = await requireOwner();
  const name = str(fd, "name");
  const beds = intField(fd, "beds", 1, 1, 20);
  const rent = rupeesField(fd, "rent");
  if (!name) flash("/rooms", "error", "Enter a room name or number.");
  if (rent <= 0) flash("/rooms", "error", "Enter the monthly rent per bed.");
  if (await db.room.findUnique({ where: { propertyId_name: { propertyId: property.id, name } } })) {
    flash("/rooms", "error", `Room ${name} already exists.`);
  }
  await db.room.create({
    data: {
      propertyId: property.id,
      name,
      floor: optStr(fd, "floor"),
      hasSubMeter: fd.get("hasSubMeter") === "on",
      beds: { create: Array.from({ length: beds }, (_, i) => ({ label: LETTERS[i] ?? String(i + 1), rent })) },
    },
  });
  revalidatePath("/rooms");
  flash("/rooms", "msg", `Room ${name} added with ${beds} bed${beds > 1 ? "s" : ""}.`);
}

async function ownedRoom(roomId: string) {
  const { property } = await requireOwner();
  const room = await db.room.findFirst({ where: { id: roomId, propertyId: property.id }, include: { beds: true } });
  if (!room) flash("/rooms", "error", "Room not found.");
  return room;
}

export async function updateRoom(fd: FormData) {
  const room = await ownedRoom(str(fd, "roomId"));
  const name = str(fd, "name") || room.name;
  const clash = await db.room.findFirst({ where: { propertyId: room.propertyId, name, NOT: { id: room.id } } });
  if (clash) flash("/rooms", "error", `Another room is already called ${name}.`);
  await db.room.update({
    where: { id: room.id },
    data: { name, floor: optStr(fd, "floor"), hasSubMeter: fd.get("hasSubMeter") === "on" },
  });
  revalidatePath("/rooms");
  flash("/rooms", "msg", `Room ${name} updated.`);
}

export async function addBed(fd: FormData) {
  const room = await ownedRoom(str(fd, "roomId"));
  const used = new Set(room.beds.map((b) => b.label));
  const label = str(fd, "label") || [...LETTERS].find((l) => !used.has(l)) || String(room.beds.length + 1);
  if (used.has(label)) flash("/rooms", "error", `Room ${room.name} already has a bed ${label}.`);
  const rent = rupeesField(fd, "rent", room.beds[0]?.rent ?? 0);
  if (rent <= 0) flash("/rooms", "error", "Enter the monthly rent for the bed.");
  await db.bed.create({ data: { roomId: room.id, label, rent } });
  revalidatePath("/rooms");
  flash("/rooms", "msg", `Bed ${label} added to room ${room.name}.`);
}

export async function updateBed(fd: FormData) {
  const { property } = await requireOwner();
  const bed = await db.bed.findFirst({
    where: { id: str(fd, "bedId"), room: { propertyId: property.id } },
    include: { room: true, stays: true },
  });
  if (!bed) flash("/rooms", "error", "Bed not found.");
  const active = fd.get("active") === "on";
  const occupied = bed.stays.some((s) => !s.endDate || s.endDate >= new Date());
  if (!active && occupied) flash("/rooms", "error", "This bed has a current or upcoming tenant, so it can't be switched off.");
  await db.bed.update({
    where: { id: bed.id },
    data: { rent: rupeesField(fd, "rent", bed.rent), active, label: str(fd, "label") || bed.label },
  });
  revalidatePath("/rooms");
  flash("/rooms", "msg", `Room ${bed.room.name} bed ${bed.label} updated. Existing tenants keep their agreed rent.`);
}

export async function deleteRoom(fd: FormData) {
  const room = await ownedRoom(str(fd, "roomId"));
  const stays = await db.stay.count({ where: { bed: { roomId: room.id } } });
  if (stays > 0) flash("/rooms", "error", `Room ${room.name} has tenant history, so it can't be deleted. Switch its beds off instead.`);
  await db.room.delete({ where: { id: room.id } });
  revalidatePath("/rooms");
  flash("/rooms", "msg", `Room ${room.name} deleted.`);
}
