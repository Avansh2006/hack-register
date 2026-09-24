import { kinds } from "@/lib/validation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, Users, ArrowLeft } from "lucide-react";
import { snapshot, urgency, formatDate } from "@/lib/data";
import { Gate } from "@/components/gate";
import { ActionForm } from "@/components/forms";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  const h = data.hackathons.find((h) => h.id === id);
  if (!h) notFound();
  const writable = data.me!.role !== "viewer";
  const manage = data.me!.role === "admin" || data.me!.id === h.created_by;
  const members = data.members.filter((m) => m.hackathon_id === id && m.active);
  const deadlines = data.deadlines.filter((d) => d.hackathon_id === id);
  return (
    <>
      <Link className="back" href="/hackathons">
        <ArrowLeft size={15} /> All hackathons
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{h.organizer}</p>
          <h1>{h.name}</h1>
          <p className="muted">
            Owned by {data.users.find((u) => u.id === h.created_by)?.name} ·{" "}
            {h.timezone}
          </p>
        </div>
        <span className="badge green">
          {h.archived ? "Archived" : "Active"}
        </span>
      </div>
      <div className="notice">
        <Users size={18} /> Every active team member receives deadline
        reminders. Submission completion stops future alerts for everyone.
      </div>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <div className="panel-title">
              <h2>Deadlines & submissions</h2>
              <span className="muted">
                {deadlines.filter((d) => d.completed_at).length}/
                {deadlines.length} complete
              </span>
            </div>
            {deadlines.map((d) => (
              <div className="detail-deadline" key={d.id}>
                <div className="section-line">
                  <div>
                    <h3>{d.kind}</h3>
                    <p>{formatDate(d.due_date)}</p>
                  </div>
                  <span
                    className={`badge ${d.completed_at ? "green" : "amber"}`}
                  >
                    {d.completed_at ? (
                      <>
                        <Check size={13} />
                        Submitted
                      </>
                    ) : (
                      urgency(d.due_date, h.timezone)
                    )}
                  </span>
                </div>
                {!d.completed_at && writable && !h.archived && (
                  <details>
                    <summary>Mark submitted</summary>
                    <ActionForm operation="submit" label="Complete submission">
                      <input type="hidden" name="hackathon_id" value={id} />
                      <input type="hidden" name="id" value={d.id} />
                      <label>
                        Submission URL (optional)
                        <input name="url" type="url" placeholder="https://…" />
                      </label>
                      <label>
                        Notes (optional)
                        <textarea name="notes" maxLength={2000} />
                      </label>
                      <label className="check">
                        <input type="checkbox" name="notify" defaultChecked />
                        Let the team know it’s submitted
                      </label>
                    </ActionForm>
                  </details>
                )}
                {!d.completed_at && manage && !h.archived && (
                  <details>
                    <summary>Change deadline</summary>
                    <ActionForm
                      operation="deadline"
                      label="Update & notify team"
                    >
                      <input type="hidden" name="hackathon_id" value={id} />
                      <input type="hidden" name="id" value={d.id} />
                      <label>
                        New date
                        <input
                          name="due_date"
                          type="date"
                          defaultValue={d.due_date}
                          required
                        />
                      </label>
                    </ActionForm>
                  </details>
                )}
              </div>
            ))}
            {!deadlines.length && (
              <div className="empty">No deadlines entered.</div>
            )}
            {manage && !h.archived && deadlines.length < kinds.length && (
              <details className="padded">
                <summary>Add deadline</summary>
                <ActionForm operation="add_deadline" label="Add deadline">
                  <input type="hidden" name="hackathon_id" value={id} />
                  <label>
                    Stage
                    <select name="kind" required>
                      {kinds
                        .filter((k) => !deadlines.some((d) => d.kind === k))
                        .map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Due date
                    <input type="date" name="due_date" required />
                  </label>
                </ActionForm>
              </details>
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Team tasks</h2>
              <span className="muted">Reminders go to the assignee</span>
            </div>
            {data.tasks
              .filter((t) => t.hackathon_id === id)
              .map((t) => (
                <div key={t.id} className="detail-deadline">
                  <div className="section-line">
                    <div>
                      <h3>{t.title}</h3>
                      <p>
                        {data.users.find((u) => u.id === t.assigned_to)?.name} ·{" "}
                        {formatDate(t.due_date)}
                      </p>
                    </div>
                    <span className="badge">
                      {t.completed_at
                        ? "Done"
                        : urgency(t.due_date, h.timezone)}
                    </span>
                  </div>
                  {!t.completed_at &&
                    writable &&
                    (manage || t.assigned_to === data.me!.id) && (
                      <ActionForm operation="task_done" label="Mark done">
                        <input type="hidden" name="hackathon_id" value={id} />
                        <input type="hidden" name="id" value={t.id} />
                      </ActionForm>
                    )}
                </div>
              ))}
            {manage && !h.archived && (
              <details className="padded">
                <summary>Add task</summary>
                <ActionForm operation="task" label="Assign task">
                  <input type="hidden" name="hackathon_id" value={id} />
                  <label>
                    Task
                    <input name="title" required maxLength={200} />
                  </label>
                  <label>
                    Assign to
                    <select name="assigned_to" required>
                      {members
                        .map((m) => data.users.find((u) => u.id === m.user_id))
                        .filter((u) => u && u.active && u.role !== "viewer")
                        .map((u) => (
                          <option key={u!.id} value={u!.id}>
                            {u!.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Due date
                    <input type="date" name="due_date" required />
                  </label>
                </ActionForm>
              </details>
            )}
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Activity</h2>
            </div>
            {data.activities
              .filter((a) => a.hackathon_id === id)
              .map((a) => (
                <div className="activity-row" key={a.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{a.action}</strong>
                    <p>
                      {data.users.find((u) => u.id === a.actor_id)?.name ??
                        "Team member"}{" "}
                      ·{" "}
                      {new Date(a.created_at).toLocaleString("en-GB", {
                        timeZone: h.timezone,
                      })}
                    </p>
                    {a.details.old && (
                      <small>
                        {a.details.old} → {a.details.new}
                      </small>
                    )}
                  </div>
                </div>
              ))}
          </section>
        </div>
        <aside>
          <section className="panel">
            <div className="panel-title">
              <h2>Team</h2>
              <span className="count">
                {
                  members.filter((m) =>
                    data.users.some((u) => u.id === m.user_id && u.active),
                  ).length
                }
              </span>
            </div>
            {members.map((m) => {
              const u = data.users.find((u) => u.id === m.user_id);
              return (
                <div className="member-row" key={m.user_id}>
                  <span className="avatar">
                    {u?.name.slice(0, 2).toUpperCase() ?? "?"}
                  </span>
                  <div className="grow">
                    <strong>{u?.name ?? "Inactive member"}</strong>
                    <small>
                      {!u?.active
                        ? "Inactive"
                        : m.global_inclusion
                          ? "Global member"
                          : u.id === h.created_by
                            ? "Owner"
                            : u.role}
                    </small>
                  </div>
                  {manage &&
                    m.user_id !== h.created_by &&
                    (!m.global_inclusion || data.me!.role === "admin") && (
                      <ActionForm
                        operation="member"
                        label="Remove"
                        className="compact"
                      >
                        <input type="hidden" name="hackathon_id" value={id} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                      </ActionForm>
                    )}
                </div>
              );
            })}
            {manage && (
              <details className="padded">
                <summary>Add member</summary>
                <ActionForm operation="member" label="Add to team">
                  <input type="hidden" name="hackathon_id" value={id} />
                  <input type="hidden" name="active" value="on" />
                  <label>
                    Existing active user
                    <select name="user_id" required>
                      <option value="">Choose a member</option>
                      {data.users
                        .filter(
                          (u) =>
                            u.active &&
                            !members.some((m) => m.user_id === u.id),
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </ActionForm>
              </details>
            )}
          </section>
          <section className="panel padded">
            <p className="eyebrow">HOW REMINDERS WORK</p>
            <h3>The team stays in the loop.</h3>
            <p className="muted">
              7 days, 3 days, tomorrow, and on the day. One overdue alert if a
              deadline passes.
            </p>
            <p className="muted">
              New members get upcoming reminders. Removed members stop receiving
              them.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
