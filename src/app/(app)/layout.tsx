import Link from "next/link";
import { NavLinks } from "@/components/nav";
import { requireOwner } from "@/lib/auth";
import { logout } from "../(auth)/actions";
import { switchProperty } from "./settings/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, property, properties } = await requireOwner();

  const switcher =
    properties.length > 1 ? (
      <form action={switchProperty} className="flex gap-1.5">
        <select name="propertyId" defaultValue={property.id} aria-label="PG" className="py-1.5">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn-secondary btn-sm">Switch</button>
      </form>
    ) : (
      <div className="truncate text-sm font-semibold text-stone-800">{property.name}</div>
    );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white px-3 py-5 lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 font-bold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">PG</span>
          PG Manager
        </Link>
        <div className="mb-4 px-2">{switcher}</div>
        <nav className="flex flex-1 flex-col gap-0.5">
          <NavLinks variant="side" />
        </nav>
        <div className="border-t border-stone-100 px-2 pt-4 text-sm">
          <div className="truncate font-medium">{user.name}</div>
          <div className="truncate text-xs text-stone-500">{user.email}</div>
          <form action={logout} className="mt-2">
            <button className="text-xs font-medium text-stone-500 hover:text-red-700">Log out</button>
          </form>
        </div>
      </aside>

      <header className="no-print sticky top-0 z-10 border-b border-stone-200 bg-white lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-brand-700">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs text-white">PG</span>
          </Link>
          <div className="min-w-0 flex-1">{switcher}</div>
          <form action={logout}>
            <button className="text-xs font-medium text-stone-500">Log out</button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2.5">
          <NavLinks variant="top" />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
