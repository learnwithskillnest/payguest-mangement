import { redirect } from "next/navigation";
import { Field, Flash } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { sp, type SearchParams } from "@/lib/forms";
import { createFirstProperty } from "../actions";

export const metadata = { title: "Add your PG" };

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Add your PG</h1>
      <p className="mb-5 text-sm text-stone-500">Hi {user.name.split(" ")[0]}, tell us which PG you run.</p>
      <Flash error={sp(params, "error")} />
      <form action={createFirstProperty} className="flex flex-col gap-4">
        <Field label="PG name">
          <input name="pgName" required />
        </Field>
        <Field label="City">
          <input name="city" />
        </Field>
        <button className="btn">Continue</button>
      </form>
    </>
  );
}
