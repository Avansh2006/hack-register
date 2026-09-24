import Link from "next/link";
import { CalendarDays, Mail, Bell } from "lucide-react";
import { snapshot } from "@/lib/data";
import { adminDb, requireResult } from "@/lib/db";
import { Gate } from "@/components/gate";
import { ActionForm } from "@/components/forms";
export default async function Settings() {
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  const connection = requireResult(
    await adminDb()
      .from("calendar_connections")
      .select("connected_at")
      .eq("user_id", data.me!.id)
      .maybeSingle(),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE IT WORK FOR YOU</p>
          <h1>Notification settings</h1>
          <p className="muted">Useful reminders. No unnecessary noise.</p>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel padded">
          <h2>Your channels</h2>
          <p className="muted">
            These preferences apply to your notifications across all hackathons.
          </p>
          {(!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) && (
            <p className="notice">
              Email delivery is not configured yet. Your administrator needs to
              connect an email provider before email can be sent.
            </p>
          )}
          <ActionForm operation="preferences" label="Save preferences">
            <label className="preference">
              <Bell size={20} />
              <span>
                <strong>In-app notifications</strong>
                <small>
                  All your team deadlines and personal task alerts in one place.
                </small>
              </span>
              <input
                type="checkbox"
                name="in_app"
                defaultChecked={data.preferences.in_app}
              />
            </label>
            <label className="preference">
              <CalendarDays size={20} />
              <span>
                <strong>Google Calendar</strong>
                <small>
                  Keep each team deadline in your connected calendar.
                </small>
              </span>
              <input
                type="checkbox"
                name="calendar"
                defaultChecked={data.preferences.calendar}
              />
            </label>
            <label className="preference">
              <Mail size={20} />
              <span>
                <strong>Email notifications</strong>
                <small>
                  Optional email for reminders and deadline changes.
                </small>
              </span>
              <input
                type="checkbox"
                name="email"
                defaultChecked={data.preferences.email}
              />
            </label>
            {data.me!.role === "admin" && (
              <label className="preference">
                <Bell size={20} />
                <span>
                  <strong>Critical alerts across all hackathons</strong>
                  <small>
                    Tomorrow, today, and overdue. You won’t receive duplicates
                    for your own teams.
                  </small>
                </span>
                <input
                  type="checkbox"
                  name="admin_critical"
                  defaultChecked={data.preferences.admin_critical}
                />
              </label>
            )}
          </ActionForm>
        </section>
        <section className="panel padded">
          <span className="icon-tile blue">
            <CalendarDays />
          </span>
          <h2>Google Calendar</h2>
          <p className="muted">
            {connection
              ? "Your account is connected. Deadlines sync automatically on the next scheduled run."
              : "Connect once to receive team deadline events in your primary calendar."}
          </p>
          <Link className="button secondary" href="/api/calendar/connect">
            {connection ? "Reconnect Calendar" : "Connect Google Calendar"}
          </Link>
          <p className="muted small">
            Turning Calendar off removes managed events on the next successful
            sync. Revoked access must be reconnected before those events can be
            removed.
          </p>
          <ActionForm operation="calendar_retry" label="Retry Calendar sync" />
          <h3>Sync status</h3>
          {!data.calendar.length && (
            <p className="muted">No deadline events yet.</p>
          )}
          {data.calendar.map((e) => (
            <div className="sync-row" key={e.deadline_id}>
              <strong>
                {data.deadlines.find((d) => d.id === e.deadline_id)?.kind ??
                  "Deadline"}
              </strong>
              <small>
                {e.last_error ??
                  (e.google_event_id ? "Synced" : "Removed / waiting to sync")}
              </small>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
