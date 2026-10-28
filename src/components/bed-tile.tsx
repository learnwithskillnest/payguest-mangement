import Link from "next/link";
import type { BedView } from "@/lib/services/occupancy";
import { fmtDate } from "@/lib/dates";
import { rupees } from "@/lib/money";

export function BedTile({ bed, roomName }: { bed: BedView; roomName: string }) {
  const s = bed.state;
  const tone = !bed.active
    ? "border-stone-200 bg-stone-100 text-stone-400"
    : s.kind === "occupied"
      ? "border-brand-200 bg-brand-50"
      : s.kind === "vacating"
        ? "border-amber-200 bg-amber-50"
        : "border-sky-200 bg-white ring-2 ring-sky-100";

  return (
    <div className={`flex min-h-24 flex-col rounded-lg border p-2.5 text-sm ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Bed {bed.label}</span>
        <span className="text-xs text-stone-500 tabular-nums">{rupees(bed.rent)}</span>
      </div>
      <div className="mt-1.5 text-xs leading-relaxed">
        {!bed.active ? (
          <span>Switched off</span>
        ) : s.kind === "occupied" ? (
          <>
            <Link href={`/tenants/${s.tenantId}`} className="font-semibold text-brand-700 hover:underline">{s.tenantName}</Link>
            <div className="text-stone-500">since {fmtDate(s.since)}</div>
          </>
        ) : s.kind === "vacating" ? (
          <>
            <Link href={`/tenants/${s.tenantId}`} className="font-semibold text-amber-800 hover:underline">{s.tenantName}</Link>
            <div className="text-amber-800">Free from {fmtDate(s.freeFrom)}</div>
          </>
        ) : (
          <>
            <div className="font-semibold text-sky-700">Free{s.since ? ` since ${fmtDate(s.since)}` : ""}</div>
            {s.bookedFrom ? (
              <div className="text-stone-500">Booked by {s.bookedBy} from {fmtDate(s.bookedFrom)}</div>
            ) : (
              <Link href={`/tenants/new?bedId=${bed.id}`} className="text-stone-500 hover:text-brand-700 hover:underline">
                + Add tenant to {roomName}-{bed.label}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
