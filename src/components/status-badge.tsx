import type { InvoiceStatus } from "@/lib/billing";
import { Badge } from "./ui";

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const map = {
    PAID: { tone: "green", label: "Paid" },
    PARTIAL: { tone: "blue", label: "Part paid" },
    DUE: { tone: "gray", label: "Due" },
    OVERDUE: { tone: "red", label: "Overdue" },
  } as const;
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
}
