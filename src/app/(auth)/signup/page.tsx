import Link from "next/link";
import { Field, Flash } from "@/components/ui";
import { sp, type SearchParams } from "@/lib/forms";
import { signup } from "../actions";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Set up your PG</h1>
      <p className="mb-5 text-sm text-stone-500">Takes a minute. You can add more PGs later.</p>
      <Flash msg={sp(params, "msg")} error={sp(params, "error")} />
      <form action={signup} className="flex flex-col gap-4">
        <Field label="Your name">
          <input name="name" autoComplete="name" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Mobile">
            <input name="phone" type="tel" autoComplete="tel" placeholder="98xxxxxxxx" />
          </Field>
        </div>
        <Field label="Password" hint="At least 8 characters">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PG name">
            <input name="pgName" placeholder="Sunrise PG for Boys" required />
          </Field>
          <Field label="City">
            <input name="city" placeholder="Delhi" />
          </Field>
        </div>
        <button className="btn mt-2">Create account</button>
      </form>
      <p className="mt-5 text-center text-sm text-stone-500">
        Already have an account? <Link href="/login" className="link">Log in</Link>
      </p>
    </>
  );
}
