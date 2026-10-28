import { sendDueReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";

/** Call once a day (e.g. 9:00 IST) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendDueReminders();
  return Response.json(result);
}
