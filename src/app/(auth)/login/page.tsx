import Link from "next/link";
import { Field, Flash } from "@/components/ui";
import { sp, type SearchParams } from "@/lib/forms";
import { login } from "../actions";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Log in</h1>
      <p className="mb-5 text-sm text-stone-500">Welcome back. Your PG dashboard is waiting.</p>
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />
      <form action={login} className="flex flex-col gap-4">
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <button className="btn mt-2">Log in</button>
      </form>
      <p className="mt-5 text-center text-sm text-stone-500">
        New here? <Link href="/signup" className="link">Create an account</Link>
      </p>
    </>
  );
}
