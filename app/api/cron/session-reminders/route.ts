import { triggerSessionReminders } from "@/data/session-reminders";

export async function GET(request: Request) {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();

  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await triggerSessionReminders());
}
