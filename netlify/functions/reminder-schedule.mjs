// Scheduled functions have a 30-second limit. Dispatch to a background
// function, which waits for the existing authenticated Next.js worker.
export default async function reminderSchedule() {
  if (process.env.CONTEXT !== "production") return;
  const origin = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!origin || !secret)
    throw new Error("Reminder scheduler configuration is missing");
  const response = await fetch(
    new URL("/.netlify/functions/reminder-worker-background", origin),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (response.status !== 202)
    throw new Error(`Reminder dispatch failed (${response.status})`);
}
