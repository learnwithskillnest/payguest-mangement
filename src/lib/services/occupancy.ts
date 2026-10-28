import { db } from "../db";
import { bedState, type BedState } from "../billing";
import { today } from "../dates";

export type BedView = { id: string; label: string; rent: number; active: boolean; state: BedState };
export type RoomView = { id: string; name: string; floor: string | null; hasSubMeter: boolean; beds: BedView[] };

export async function getBedBoard(propertyId: string, onDate: Date = today()) {
  const rooms = await db.room.findMany({
    where: { propertyId },
    orderBy: [{ floor: "asc" }, { name: "asc" }],
    include: {
      beds: {
        orderBy: { label: "asc" },
        include: {
          stays: {
            include: { tenant: { select: { id: true, name: true } } },
            orderBy: { startDate: "desc" },
          },
        },
      },
    },
  });

  const roomViews: RoomView[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    floor: r.floor,
    hasSubMeter: r.hasSubMeter,
    beds: r.beds.map((b) => ({
      id: b.id,
      label: b.label,
      rent: b.rent,
      active: b.active,
      state: bedState(b.stays, onDate, b.createdAt),
    })),
  }));

  const active = roomViews.flatMap((r) => r.beds.filter((b) => b.active).map((b) => ({ ...b, room: r.name })));
  const occupied = active.filter((b) => b.state.kind !== "free").length;
  return {
    rooms: roomViews,
    totals: {
      beds: active.length,
      occupied,
      free: active.length - occupied,
      vacating: active.filter((b) => b.state.kind === "vacating").length,
      occupancyPct: active.length ? Math.round((occupied / active.length) * 100) : 0,
    },
    freeBeds: active.filter((b) => b.state.kind === "free"),
    vacatingBeds: active.filter((b) => b.state.kind === "vacating"),
  };
}

/** Beds that can take a new tenant from `fromDate` (no stay overlapping that date onwards). */
export async function availableBeds(propertyId: string, fromDate: Date) {
  const beds = await db.bed.findMany({
    where: { active: true, room: { propertyId } },
    include: { room: true, stays: true },
    orderBy: [{ room: { name: "asc" } }, { label: "asc" }],
  });
  return beds.filter((b) => !b.stays.some((s) => !s.endDate || s.endDate >= fromDate));
}
