import Link from "next/link";
import {
  Flag,
  Clock,
  AlertCircle,
  CheckCheck,
  ArrowRight,
  Users,
  Radio,
} from "lucide-react";
import { snapshot, daysLeft } from "@/lib/data";
import { Gate } from "@/components/gate";
import { AddHackathon } from "@/components/forms";
import { DeadlineList } from "@/components/deadline-list";
export default async function Dashboard() {
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  const open = data.deadlines.filter(
    (d) =>
      !d.completed_at &&
      !data.hackathons.find((h) => h.id === d.hackathon_id)?.archived,
  );
  const days = (d: (typeof open)[number]) =>
    daysLeft(
      d.due_date,
      data.hackathons.find((h) => h.id === d.hackathon_id)?.timezone,
    );
  const stats = [
    [
      "Active hackathons",
      data.hackathons.filter((h) => !h.archived).length,
      Flag,
      "purple",
    ],
    [
      "Due this week",
      open.filter((d) => days(d) >= 0 && days(d) <= 7).length,
      Clock,
      "amber",
    ],
    ["Overdue", open.filter((d) => days(d) < 0).length, AlertCircle, "red"],
    [
      "My open tasks",
      data.tasks.filter((t) => !t.completed_at && t.assigned_to === data.me!.id)
        .length,
      CheckCheck,
      "green",
    ],
  ] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LET’S MAKE SOMETHING GREAT</p>
          <h1>Your team’s next move.</h1>
          <p className="muted">
            Good to see you, {data.me!.name.split(" ")[0]}. Here’s what needs
            your attention.
          </p>
        </div>
        {data.me!.role !== "viewer" && (
          <AddHackathon users={data.users} me={data.me!} />
        )}
      </div>
      <div className="stats">
        {stats.map(([label, value, Icon, color]) => (
          <div className="stat" key={label}>
            <span className={`icon-tile ${color}`}>
              <Icon size={20} />
            </span>
            <span className="stat-value">{value}</span>
            <span className="muted">{label}</span>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>
              <span className="live-dot amber-dot" />
              Needs attention
            </h2>
            <span className="muted">The next things that matter</span>
          </div>
          <DeadlineList
            data={data}
            deadlines={open.filter((d) => days(d) <= 3).slice(0, 8)}
          />
        </section>
        <section className="team-reminder-card">
          <span className="icon-tile purple">
            <Radio size={23} />
          </span>
          <span className="tag">TEAM-WIDE BY DEFAULT</span>
          <h2>
            No one misses
            <br />
            the next milestone.
          </h2>
          <p>
            Hackathon deadlines reach every active member. Personal tasks stay
            with their assignee.
          </p>
          <div className="reminder-stages">
            {["7 days", "3 days", "1 day", "Today"].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <Link href="/settings">
            Manage your notifications <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>
            Active hackathons{" "}
            <span className="count">
              {data.hackathons.filter((h) => !h.archived).length}
            </span>
          </h2>
          <Link href="/hackathons">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {data.hackathons.length ? (
          <div className="hackathon-grid">
            {data.hackathons
              .filter((h) => !h.archived)
              .map((h, i) => {
                const ds = data.deadlines.filter(
                  (d) => d.hackathon_id === h.id,
                );
                const complete = ds.filter((d) => d.completed_at).length;
                return (
                  <Link
                    href={`/hackathons/${h.id}`}
                    className="hackathon-card"
                    key={h.id}
                  >
                    <div className="card-top">
                      <span className={`hackathon-symbol color-${i % 4}`}>
                        {h.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="badge green">Active</span>
                    </div>
                    <h3>{h.name}</h3>
                    <p>{h.organizer}</p>
                    <div className="card-meta">
                      <span>
                        <Users size={14} />
                        {
                          data.members.filter(
                            (m) =>
                              m.hackathon_id === h.id &&
                              m.active &&
                              data.users.some(
                                (u) => u.id === m.user_id && u.active,
                              ),
                          ).length
                        }{" "}
                        members
                      </span>
                      <span>
                        {complete}/{ds.length} submitted
                      </span>
                    </div>
                    <div className="progress">
                      <span
                        style={{
                          width: `${ds.length ? (100 * complete) / ds.length : 0}%`,
                        }}
                      />
                    </div>
                  </Link>
                );
              })}
          </div>
        ) : (
          <div className="empty">
            <Flag />
            <h3>Your next hackathon starts here.</h3>
            <p>
              Add a hackathon, choose your team, and enter the dates you know.
            </p>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>On the horizon</h2>
          <Link href="/calendar">
            Open calendar <ArrowRight size={15} />
          </Link>
        </div>
        <DeadlineList
          data={data}
          deadlines={open.filter((d) => days(d) > 3).slice(0, 5)}
        />
      </section>
    </>
  );
}
