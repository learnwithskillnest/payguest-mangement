import { BedTile } from "@/components/bed-tile";
import { Card, Empty, Field, Flash, PageHeader, Stat } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { sp, type SearchParams } from "@/lib/forms";
import { getBedBoard } from "@/lib/services/occupancy";
import { addBed, addRoom, deleteRoom, updateBed, updateRoom } from "./actions";

export const metadata = { title: "Rooms & beds" };

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const { property } = await requireOwner();
  const params = await searchParams;
  const board = await getBedBoard(property.id);
  const t = board.totals;

  return (
    <>
      <PageHeader title="Rooms & beds" subtitle="Live view of every bed: who is in it, who is leaving, and what's free." />
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Occupancy" value={`${t.occupancyPct}%`} hint={`${t.occupied} of ${t.beds} beds`} tone="good" />
        <Stat label="Free beds" value={t.free} tone={t.free ? "warn" : "default"} />
        <Stat label="Leaving soon" value={t.vacating} hint="Tenants on notice" />
        <Stat label="Rooms" value={board.rooms.length} />
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-brand-100" /> Occupied</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-100" /> On notice</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-white ring-2 ring-sky-200" /> Free</span>
      </div>

      <div className="grid gap-4">
        {board.rooms.length === 0 && <Empty>No rooms yet. Add your first room below.</Empty>}
        {board.rooms.map((room) => (
          <Card
            key={room.id}
            title={
              <span>
                Room {room.name}
                <span className="ml-2 text-sm font-normal text-stone-500">
                  {room.floor ? `${room.floor} · ` : ""}
                  {room.beds.length}-sharing{room.hasSubMeter ? " · sub-meter" : ""}
                </span>
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {room.beds.map((bed) => (
                <BedTile key={bed.id} bed={bed} roomName={room.name} />
              ))}
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-stone-500 hover:text-stone-800">Edit room</summary>
              <div className="mt-3 grid gap-5 border-t border-stone-100 pt-4">
                <form action={updateRoom} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                  <input type="hidden" name="roomId" value={room.id} />
                  <Field label="Room name"><input name="name" defaultValue={room.name} /></Field>
                  <Field label="Floor"><input name="floor" defaultValue={room.floor ?? ""} /></Field>
                  <label className="flex items-center gap-2 pb-2">
                    <input type="checkbox" name="hasSubMeter" defaultChecked={room.hasSubMeter} /> Sub-meter
                  </label>
                  <button className="btn-secondary">Save</button>
                </form>
                <div className="grid gap-2">
                  {room.beds.map((bed) => (
                    <form key={bed.id} action={updateBed} className="grid grid-cols-[4rem_1fr_auto_auto] items-center gap-2">
                      <input type="hidden" name="bedId" value={bed.id} />
                      <input name="label" defaultValue={bed.label} aria-label="Bed label" />
                      <input name="rent" type="number" min={0} defaultValue={bed.rent} aria-label="Rent" />
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" name="active" defaultChecked={bed.active} /> In use
                      </label>
                      <button className="btn-secondary btn-sm">Save</button>
                    </form>
                  ))}
                </div>
                <form action={addBed} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="roomId" value={room.id} />
                  <Field label="New bed label" className="w-28"><input name="label" placeholder="auto" /></Field>
                  <Field label="Rent (₹)" className="w-32"><input name="rent" type="number" min={0} defaultValue={room.beds[0]?.rent} /></Field>
                  <button className="btn-secondary">Add bed</button>
                </form>
                <form action={deleteRoom}>
                  <input type="hidden" name="roomId" value={room.id} />
                  <button className="btn-danger btn-sm">Delete room</button>
                </form>
              </div>
            </details>
          </Card>
        ))}
      </div>

      <Card title="Add a room" className="mt-8">
        <form action={addRoom} className="grid gap-4 sm:grid-cols-6 sm:items-end">
          <Field label="Room name / number" className="sm:col-span-2"><input name="name" placeholder="101" required /></Field>
          <Field label="Floor"><input name="floor" placeholder="1st" /></Field>
          <Field label="Beds (sharing)"><input name="beds" type="number" min={1} max={20} defaultValue={2} /></Field>
          <Field label="Rent per bed (₹)"><input name="rent" type="number" min={0} placeholder="8500" required /></Field>
          <label className="flex items-center gap-2 pb-2"><input type="checkbox" name="hasSubMeter" defaultChecked /> Sub-meter</label>
          <div className="sm:col-span-6"><button className="btn">Add room</button></div>
        </form>
      </Card>
    </>
  );
}
