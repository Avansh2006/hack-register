import { snapshot } from "@/lib/data";
import { Gate } from "@/components/gate";
import { AddHackathon } from "@/components/forms";
import Link from "next/link";
import { ArrowUpRight, Flag } from "lucide-react";
export default async function Hackathons() {
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUILD. SUBMIT. REPEAT.</p>
          <h1>Hackathons</h1>
          <p className="muted">Your team’s shared starting line.</p>
        </div>
        {data.me!.role !== "viewer" && (
          <AddHackathon users={data.users} me={data.me!} />
        )}
      </div>
      <section className="panel">
        {data.hackathons.length ? (
          data.hackathons.map((h) => (
            <Link
              className="deadline-row"
              href={`/hackathons/${h.id}`}
              key={h.id}
            >
              <span className="icon-tile purple">
                <Flag />
              </span>
              <div className="grow">
                <h3>{h.name}</h3>
                <p>
                  {h.organizer} · {h.timezone}
                </p>
              </div>
              <span className="badge green">
                {h.archived ? "Archived" : "Active"}
              </span>
              <ArrowUpRight size={18} />
            </Link>
          ))
        ) : (
          <div className="empty">
            <h3>No hackathons yet.</h3>
            <p>Add your first one to bring your team together.</p>
          </div>
        )}
      </section>
    </>
  );
}
