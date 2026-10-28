const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹12,500 */
export function rupees(amount: number | null | undefined): string {
  return `₹${inr.format(amount ?? 0)}`;
}

/** Parse a rupee amount typed by a user ("12,500", "12500.00"). Returns null if invalid. */
export function parseRupees(value: FormDataEntryValue | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
