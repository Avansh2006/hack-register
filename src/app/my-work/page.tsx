import Link from "next/link";
import { snapshot, formatDate } from "@/lib/data";
import { Gate } from "@/components/gate";
import { DeadlineList } from "@/components/deadline-list";
import { ActionForm } from "@/components/forms";
export default async function Work() {
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  const mine = new Set(
    data.members
      .filter((m) => m.user_id === data.me!.id && m.active)
      .map((m) => m.hackathon_id),
  );
  const tasks = data.tasks.filter(
    (t) =>
      t.assigned_to === data.me!.id &&
      !t.completed_at &&
      mine.has(t.hackathon_id),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR FOCUS, FOR TODAY</p>
          <h1>My work</h1>
          <p className="muted">
            Personal tasks and shared deadlines, automatically brought together.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Assigned to me</h2>
          <span className="count">{tasks.length}</span>
        </div>
        {tasks.length ? (
          tasks.map((t) => (
            <div className="deadline-row" key={t.id}>
              <div className="grow">
                <h3>{t.title}</h3>
                <p>{formatDate(t.due_date)}</p>
                <Link href={`/hackathons/${t.hackathon_id}`}>
                  {data.hackathons.find((h) => h.id === t.hackathon_id)?.name} →
                </Link>
              </div>
              {data.me!.role !== "viewer" && (
                <ActionForm operation="task_done" label="Mark done">
                  <input type="hidden" name="id" value={t.id} />
                  <input
                    type="hidden"
                    name="hackathon_id"
                    value={t.hackathon_id}
                  />
                </ActionForm>
              )}
            </div>
          ))
        ) : (
          <div className="empty">
            <h3>You’re all clear.</h3>
            <p>No open tasks assigned to you.</p>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>My team deadlines</h2>
        </div>
        <DeadlineList
          data={data}
          deadlines={data.deadlines.filter(
            (d) => mine.has(d.hackathon_id) && !d.completed_at,
          )}
        />
      </section>
    </>
  );
}
