import { notFound } from "next/navigation";
import { snapshot } from "@/lib/data";
import { Gate } from "@/components/gate";
import { ActionForm } from "@/components/forms";
export default async function Members() {
  const data = await snapshot();
  if (data.mode !== "live") return <Gate data={data} />;
  if (data.me!.role !== "admin") notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE PEOPLE BEHIND THE IDEAS</p>
          <h1>Members</h1>
          <p className="muted">
            Approve signed-in users, manage roles, and select Global Members.
          </p>
        </div>
      </div>
      <div className="notice">
        Global Members join every new hackathon automatically. Changes here
        preserve existing hackathon membership.
      </div>
      <section className="panel">
        {data.users.map((u) => (
          <div className="detail-deadline" key={u.id}>
            <div className="section-line">
              <div>
                <h3>{u.name}</h3>
                <p>{u.email}</p>
              </div>
              <span className={`badge ${u.active ? "green" : "amber"}`}>
                {u.active ? "Active" : "Awaiting approval"}
              </span>
            </div>
            <ActionForm
              operation="user"
              label="Save member"
              className="member-form"
            >
              <input type="hidden" name="id" value={u.id} />
              <label>
                Role
                <select name="role" defaultValue={u.role}>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={u.active}
                />
                Active
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="global_member"
                  defaultChecked={u.global_member}
                />
                Global Member
              </label>
            </ActionForm>
          </div>
        ))}
      </section>
    </>
  );
}
