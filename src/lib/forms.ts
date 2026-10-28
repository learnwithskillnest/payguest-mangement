import { redirect } from "next/navigation";
import { parseDate } from "./dates";
import { parseRupees } from "./money";

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function rupeesField(fd: FormData, key: string, fallback = 0): number {
  return parseRupees(fd.get(key)) ?? fallback;
}

export function dateField(fd: FormData, key: string): Date | null {
  return parseDate(str(fd, key));
}

export function intField(fd: FormData, key: string, fallback: number, min = 0, max = 10_000): number {
  const n = Number(str(fd, key));
  if (!Number.isFinite(n) || str(fd, key) === "") return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function floatField(fd: FormData, key: string): number | null {
  const raw = str(fd, key);
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Redirect back to a page with a flash message (?msg=) or error (?error=). */
export function flash(path: string, kind: "msg" | "error", text: string): never {
  const url = new URL(path, "http://x");
  url.searchParams.delete("msg");
  url.searchParams.delete("error");
  url.searchParams.set(kind, text);
  redirect(`${url.pathname}${url.search}`);
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function sp(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}
