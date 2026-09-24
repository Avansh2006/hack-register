import Link from "next/link";
import { ArrowUpRight, FileText, Check } from "lucide-react";
import { Deadline, Snapshot, daysLeft, urgency, formatDate } from "@/lib/data";
export function DeadlineList({
  deadlines,
  data,
}: {
  deadlines: Deadline[];
  data: Snapshot;
}) {
  if (!deadlines.length)
    return (
      <div className="empty">
        <Check />
        <h3>You’re all clear.</h3>
        <p>New deadlines will appear here as your team adds them.</p>
      </div>
    );
  return (
    <div className="deadline-list">
      {deadlines.map((d) => {
        const h = data.hackathons.find((h) => h.id === d.hackathon_id)!;
        const urgent = daysLeft(d.due_date, h.timezone) <= 1;
        return (
          <Link
            className="deadline-row"
            key={d.id}
            href={`/hackathons/${h.id}`}
          >
            <span className={`icon-tile ${urgent ? "red" : "blue"}`}>
              <FileText size={20} />
            </span>
            <div className="grow">
              <strong>
                {d.kind}
                {["PPT", "Prototype"].includes(d.kind) ? " submission" : ""}
              </strong>
              <p>
                {h.name} <span className="dot-separator">·</span>{" "}
                {formatDate(d.due_date)}
              </p>
            </div>
            <span
              className={`badge ${d.completed_at ? "green" : urgent ? "red" : "amber"}`}
            >
              {d.completed_at ? "Completed" : urgency(d.due_date, h.timezone)}
            </span>
            <ArrowUpRight size={16} className="muted" />
          </Link>
        );
      })}
    </div>
  );
}
