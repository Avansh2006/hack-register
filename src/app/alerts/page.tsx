import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { snapshot } from "@/lib/data";
import { Gate } from "@/components/gate";
import { ActionForm } from "@/components/forms";
export default async function Alerts() {
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  const visible = data.notifications.filter((n) => n.in_app);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERYONE IN THE LOOP</p>
          <h1>Alerts</h1>
          <p className="muted">
            Your deadline reminders and team updates. Up to 100 recent
            notifications.
          </p>
        </div>
        <span className="badge purple">
          {visible.filter((n) => !n.read_at).length} unread
        </span>
      </div>
      <section className="panel">
        {visible.length ? (
          visible.map((n) => {
            const d = data.deadlines.find((d) => d.id === n.deadline_id),
              t = data.tasks.find((t) => t.id === n.task_id);
            const resolved = Boolean(
              (d?.completed_at && n.stage !== "completed") ||
              (d && d.revision !== n.revision) ||
              t?.completed_at,
            );
            return (
              <div
                key={n.id}
                className={`deadline-row ${n.read_at ? "read" : ""}`}
              >
                <span className={`icon-tile ${resolved ? "green" : "purple"}`}>
                  {resolved ? <Check size={20} /> : <Bell size={20} />}
                </span>
                <div className="grow">
                  <strong>{n.message}</strong>
                  <p>
                    {new Date(n.created_at).toLocaleString("en-GB", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST {resolved ? "· Resolved" : ""}
                  </p>
                  <Link href={`/hackathons/${n.hackathon_id}`}>
                    Open hackathon →
                  </Link>
                </div>
                {!n.read_at && (
                  <ActionForm
                    operation="read"
                    label="Mark read"
                    className="compact"
                  >
                    <input type="hidden" name="id" value={n.id} />
                  </ActionForm>
                )}
              </div>
            );
          })
        ) : (
          <div className="empty">
            <Bell />
            <h3>All caught up.</h3>
            <p>When something needs your attention, you’ll see it here.</p>
          </div>
        )}
      </section>
    </>
  );
}
