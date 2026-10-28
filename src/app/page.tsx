import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const FEATURES = [
  ["Live bed board", "See which bed is free, who is leaving and from which date — no more counting on WhatsApp."],
  ["Rent on autopilot", "Monthly invoices, UPI payment links with QR, automatic reminders and digital receipts."],
  ["Tenant records", "ID proof, police verification status, agreement dates and deposit in one place."],
  ["Expenses & profit", "Log food, staff, electricity and repairs, and see what you actually made each month."],
  ["Fair electricity split", "Enter sub-meter readings; each tenant's share is worked out by days stayed and added to rent."],
];

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-bold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">PG</span>
          PG Manager
        </div>
        <Link href="/login" className="btn-secondary">Log in</Link>
      </header>
      <section className="py-16 text-center sm:py-24">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Run your PG from one screen, not ten WhatsApp chats
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-600">
          Beds, rent, tenants, expenses and electricity bills for paying-guest owners. Collect rent on UPI and stop
          chasing tenants every month.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn px-5 py-2.5 text-base">Start free</Link>
          <Link href="/login" className="btn-secondary px-5 py-2.5 text-base">I have an account</Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="card p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm text-stone-600">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
