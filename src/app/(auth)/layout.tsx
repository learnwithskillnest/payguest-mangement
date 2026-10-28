import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-lg font-bold text-brand-700">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">PG</span>
        PG Manager
      </Link>
      <div className="card w-full max-w-md p-6">{children}</div>
    </main>
  );
}
