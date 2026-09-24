import { timingSafeEqual } from "node:crypto";

export default async function reminderWorker(request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return;
  if (process.env.CONTEXT !== "production") return;
  if (!process.env.URL) throw new Error("Netlify site URL is missing");
  const response = await fetch(new URL("/api/cron", process.env.URL), {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(65000),
  });
  if (!response.ok)
    throw new Error(`Reminder worker failed (${response.status})`);
}
