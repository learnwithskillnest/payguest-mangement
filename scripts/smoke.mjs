// Smoke test against a running server with seeded data: every page must render.
// Usage: npm run db:seed && npm start & npm run smoke
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const db = new PrismaClient();
let failures = 0;

async function check(path, { cookie, expect = 200, contains, headers = {} } = {}) {
  const res = await fetch(BASE + path, { headers: { ...(cookie ? { cookie } : {}), ...headers }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const ok = res.status === expect && (!contains || body.includes(contains));
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${res.status} ${path}${!ok && contains ? ` (expected text: ${contains})` : ""}`);
  return body;
}

const user = await db.user.findUniqueOrThrow({ where: { email: "demo@pgmanager.in" }, include: { properties: true } });
const token = randomBytes(24).toString("base64url");
await db.session.create({
  data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) },
});
const cookie = `pgm_session=${token}`;
const propertyId = user.properties[0].id;

const tenant = await db.tenant.findFirstOrThrow({ where: { propertyId, status: "ACTIVE" } });
const movedOut = await db.tenant.findFirstOrThrow({ where: { propertyId, status: "MOVED_OUT" } });
const invoice = await db.invoice.findFirstOrThrow({ where: { propertyId, payments: { none: {} } } });
const payment = await db.payment.findFirstOrThrow({ where: { propertyId }, include: { invoice: true } });

await check("/", { contains: "PG Manager" });
await check("/login", { contains: "Log in" });
await check("/signup", { contains: "Set up your PG" });
await check("/dashboard", { expect: 307 });
await check("/dashboard", { cookie, contains: "To do" });
await check("/rooms", { cookie, contains: "Room 101" });
await check("/tenants", { cookie, contains: tenant.name });
await check("/tenants?tab=past", { cookie, contains: movedOut.name });
await check("/tenants?tab=pending", { cookie });
await check("/tenants/new", { cookie, contains: "Add tenant" });
await check(`/tenants/${tenant.id}`, { cookie, contains: "Deposit" });
await check(`/tenants/${movedOut.id}`, { cookie, contains: "Moved out" });
await check("/rent", { cookie, contains: "Invoices" });
await check(`/rent/${invoice.id}`, { cookie, contains: "Record payment" });
await check(`/receipts/${payment.id}`, { cookie, contains: payment.receiptNo });
await check("/electricity", { cookie, contains: "Meter readings" });
await check("/expenses", { cookie, contains: "Add expense" });
await check("/reports", { cookie, contains: "Last 12 months" });
await check("/settings", { cookie, contains: "Rent collection" });
await check(`/pay/${invoice.publicToken}`, { contains: "Pay" });
await check(`/pay/${payment.invoice.publicToken}/receipt/${payment.id}`, { contains: payment.receiptNo });
await check("/pay/not-a-real-token", { expect: 404 });
await check("/api/cron/reminders", { expect: 401 });
await check("/api/cron/reminders", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, contains: "sent" });
await check("/api/health", { contains: "ok" });

await db.$disconnect();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("All smoke checks passed");
