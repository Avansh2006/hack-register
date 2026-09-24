import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { adminDb, requireResult } from "./db";
import { decrypt } from "./crypto";

export function calendarEventId(
  deadline: string,
  user: string,
  generation: number,
) {
  return createHash("sha256")
    .update(`${deadline}:${user}:${generation}`)
    .digest("hex");
}
async function accessToken(encrypted: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: decrypt(encrypted),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8000),
  });
  const value = await res.json();
  if (!res.ok || !value.access_token)
    throw new Error(
      "Calendar authorization expired. Reconnect Google Calendar.",
    );
  return value.access_token as string;
}
async function google(
  token: string,
  path: string,
  method: string,
  body?: unknown,
) {
  return fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    },
  );
}

async function syncCalendars(stopAt: number) {
  const db = adminDb();
  const deadlines =
    requireResult(
      await db
        .from("deadlines")
        .select("*,hackathons!inner(name,timezone,archived)"),
    ) ?? [];
  const members =
    requireResult(await db.from("hackathon_members").select("*")) ?? [];
  // Membership and global admin alerts are separate: Calendar events belong to members only.
  const preferences =
    requireResult(
      await db.from("notification_preferences").select("user_id,calendar"),
    ) ?? [];
  const users = requireResult(await db.from("users").select("id,active")) ?? [];
  for (const d of deadlines) {
    if (d.completed_at || d.hackathons.archived) continue;
    const recipients = members.filter(
      (m) =>
        m.hackathon_id === d.hackathon_id &&
        m.active &&
        users.some((u) => u.id === m.user_id && u.active) &&
        preferences.some((p) => p.user_id === m.user_id && p.calendar),
    );
    if (recipients.length)
      requireResult(
        await db.from("calendar_events").upsert(
          recipients.map((m) => ({ deadline_id: d.id, user_id: m.user_id })),
          { onConflict: "deadline_id,user_id", ignoreDuplicates: true },
        ),
      );
  }
  const events =
    requireResult(
      await db
        .from("calendar_events")
        .select("*")
        .order("last_synced_at", { ascending: true, nullsFirst: true }),
    ) ?? [];
  let synced = 0;
  for (const event of events) {
    if (Date.now() > stopAt) break;
    // Fresh checks immediately before dispatch, including completion/member removals/preferences.
    const d = requireResult(
      await db
        .from("deadlines")
        .select("*,hackathons!inner(name,timezone,archived)")
        .eq("id", event.deadline_id)
        .single(),
    );
    const u = requireResult(
      await db.from("users").select("active").eq("id", event.user_id).single(),
    );
    const p = requireResult(
      await db
        .from("notification_preferences")
        .select("calendar")
        .eq("user_id", event.user_id)
        .single(),
    );
    const m = requireResult(
      await db
        .from("hackathon_members")
        .select("active")
        .eq("hackathon_id", d.hackathon_id)
        .eq("user_id", event.user_id)
        .maybeSingle(),
    );
    const desired = Boolean(
      u?.active &&
      p?.calendar &&
      m?.active &&
      !d.completed_at &&
      !d.hackathons.archived,
    );
    if (!desired && !event.google_event_id && event.last_synced_at) continue;
    // Recheck unchanged events daily, allowing recovery if the event was deleted externally.
    if (
      desired &&
      event.synced_revision === d.revision &&
      event.last_synced_at &&
      Date.now() - Date.parse(event.last_synced_at) < 86400000
    )
      continue;
    const connection = requireResult(
      await db
        .from("calendar_connections")
        .select("refresh_token_encrypted")
        .eq("user_id", event.user_id)
        .maybeSingle(),
    );
    if (!connection) {
      requireResult(
        await db
          .from("calendar_events")
          .update({
            last_error: "Connect Google Calendar in Settings",
            last_synced_at: new Date().toISOString(),
          })
          .eq("deadline_id", d.id)
          .eq("user_id", event.user_id),
      );
      continue;
    }
    let generation = event.generation;
    let eventId =
      event.google_event_id ?? calendarEventId(d.id, event.user_id, generation);
    try {
      const token = await accessToken(connection.refresh_token_encrypted);
      if (!desired) {
        const res = await google(
          token,
          `/${eventId}?sendUpdates=none`,
          "DELETE",
        );
        if (!res.ok && ![404, 410].includes(res.status))
          throw new Error(`Calendar removal failed (${res.status})`);
        requireResult(
          await db
            .from("calendar_events")
            .update({
              google_event_id: null,
              generation: generation + 1,
              synced_revision: null,
              last_error: null,
              last_synced_at: new Date().toISOString(),
            })
            .eq("deadline_id", d.id)
            .eq("user_id", event.user_id),
        );
      } else {
        // Record the intended ID before external writes, including uncertain responses.
        requireResult(
          await db
            .from("calendar_events")
            .update({ google_event_id: eventId })
            .eq("deadline_id", d.id)
            .eq("user_id", event.user_id),
        );
        const end = new Date(`${d.due_date}T12:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        const body = {
          summary: `${d.hackathons.name} — ${d.kind}${["PPT", "Prototype"].includes(d.kind) ? " submission" : ""}`,
          description: `Team deadline. Submit and manage: ${process.env.APP_URL}/hackathons/${d.hackathon_id}`,
          start: { date: d.due_date },
          end: { date: end.toISOString().slice(0, 10) },
          reminders: {
            useDefault: false,
            overrides: [10080, 4320, 1440, 60, 0].map((minutes) => ({
              method: "popup",
              minutes,
            })),
          },
        };
        // Read also detects externally deleted (cancelled) tombstones.
        const existing = await google(token, `/${eventId}`, "GET");
        const existingBody = existing.ok ? await existing.json() : null;
        if (existing.status === 410 || existingBody?.status === "cancelled") {
          generation++;
          eventId = calendarEventId(d.id, event.user_id, generation);
          requireResult(
            await db
              .from("calendar_events")
              .update({
                generation,
                google_event_id: eventId,
                synced_revision: null,
              })
              .eq("deadline_id", d.id)
              .eq("user_id", event.user_id),
          );
        } else if (!existing.ok && existing.status !== 404)
          throw new Error(`Calendar lookup failed (${existing.status})`);
        let res =
          existing.ok && existingBody?.status !== "cancelled"
            ? await google(token, `/${eventId}?sendUpdates=none`, "PATCH", body)
            : await google(token, "?sendUpdates=none", "POST", {
                id: eventId,
                ...body,
              });
        if (res.status === 409)
          res = await google(
            token,
            `/${eventId}?sendUpdates=none`,
            "PATCH",
            body,
          );
        if (!res.ok) throw new Error(`Calendar sync failed (${res.status})`);
        requireResult(
          await db
            .from("calendar_events")
            .update({
              google_event_id: eventId,
              synced_revision: d.revision,
              last_synced_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("deadline_id", d.id)
            .eq("user_id", event.user_id),
        );
      }
      synced++;
    } catch (error) {
      requireResult(
        await db
          .from("calendar_events")
          .update({
            last_error:
              error instanceof Error ? error.message : "Calendar sync failed",
            last_synced_at: new Date().toISOString(),
          })
          .eq("deadline_id", d.id)
          .eq("user_id", event.user_id),
      );
    }
  }
  return synced;
}

async function sendEmails(stopAt: number) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    return { sent: 0, configured: false };
  const db = adminDb();
  let sent = 0;
  while (Date.now() < stopAt) {
    const rows = requireResult(await db.rpc("claim_email"));
    const n = rows?.[0];
    if (!n) break;
    // Check again after the claim. A completion/removal may have happened meanwhile.
    const valid = requireResult(
      await db.rpc("notification_eligible", { nid: n.id }),
    );
    const prefs = requireResult(
      await db
        .from("notification_preferences")
        .select("email")
        .eq("user_id", n.user_id)
        .single(),
    );
    if (!valid || !prefs?.email) {
      requireResult(
        await db
          .from("notifications")
          .update({ email_status: "cancelled" })
          .eq("id", n.id)
          .eq("claim_token", n.claim_token),
      );
      continue;
    }
    const user = requireResult(
      await db.from("users").select("email").eq("id", n.user_id).single(),
    );
    if (!user) throw new Error("Notification recipient not found");
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": n.idempotency_key,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [user.email],
          subject: n.message,
          text: `${n.message}\n\n${process.env.APP_URL}/hackathons/${n.hackathon_id}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok)
        throw new Error(`Email provider returned ${response.status}`);
      requireResult(
        await db
          .from("notifications")
          .update({
            email_status: "sent",
            sent_at: new Date().toISOString(),
            lease_until: null,
            last_error: null,
          })
          .eq("id", n.id)
          .eq("claim_token", n.claim_token),
      );
      sent++;
    } catch (error) {
      // Keep the first-attempt time and the same key across uncertain network failures.
      requireResult(
        await db
          .from("notifications")
          .update({
            email_status: "pending",
            lease_until: new Date(Date.now() + 15 * 60000).toISOString(),
            last_error:
              error instanceof Error ? error.message : "Email delivery failed",
          })
          .eq("id", n.id)
          .eq("claim_token", n.claim_token),
      );
    }
  }
  return { sent, configured: true };
}
export async function runAutomation() {
  const db = adminDb(),
    token = randomUUID();
  if (
    !requireResult(
      await db.rpc("acquire_worker", {
        lock_name: "automation",
        lock_token: token,
      }),
    )
  )
    return { busy: true };
  const start = Date.now();
  try {
    const generated = requireResult(await db.rpc("generate_reminders"));
    const email = await sendEmails(start + 15000);
    const calendar = await syncCalendars(start + 40000);
    return { generated, email, calendar };
  } finally {
    requireResult(
      await db
        .from("worker_locks")
        .delete()
        .eq("name", "automation")
        .eq("token", token),
    );
  }
}
