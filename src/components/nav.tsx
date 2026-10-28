"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◧" },
  { href: "/rooms", label: "Rooms & beds", icon: "▦" },
  { href: "/tenants", label: "Tenants", icon: "☺" },
  { href: "/rent", label: "Rent", icon: "₹" },
  { href: "/electricity", label: "Electricity", icon: "⚡" },
  { href: "/expenses", label: "Expenses", icon: "⇣" },
  { href: "/reports", label: "Profit", icon: "↗" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function NavLinks({ variant }: { variant: "side" | "top" }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        if (variant === "top") {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                active ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {item.label}
            </Link>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            <span aria-hidden className="w-4 text-center">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
