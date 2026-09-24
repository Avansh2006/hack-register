import { snapshot } from "@/lib/data";
import { Gate } from "@/components/gate";
import { DeadlineList } from "@/components/deadline-list";
import Link from "next/link";
export default async function Calendar() {
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEE WHAT’S COMING</p>
          <h1>Deadline calendar</h1>
          <p className="muted">Your team’s schedule, in date order.</p>
        </div>
        <Link href="/settings" className="button secondary">
          Google Calendar settings
        </Link>
      </div>
      <section className="panel">
        <DeadlineList data={data} deadlines={data.deadlines} />
      </section>
    </>
  );
}
