import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const ids = Array.from(
  { length: 6 },
  (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`,
);
const [avansh, rahul, priya, aman, riya, admin] = ids;
async function rows<T = Record<string, unknown>>(
  sql: string,
  args: unknown[] = [],
) {
  return (await db.query<T>(sql, args)).rows;
}
async function mutate(actor: string, operation: string, payload: unknown) {
  return (
    await rows<{ mutate: string }>("select public.mutate($1,$2,$3)", [
      actor,
      operation,
      JSON.stringify(payload),
    ])
  )[0].mutate;
}
const date = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
async function create(due = date(3)) {
  return mutate(priya, "create", {
    name: "ABC Hackathon",
    organizer: "Team",
    timezone: "UTC",
    members: [aman],
    deadlines: [{ kind: "PPT", due_date: due }],
  });
}
async function generate(day = date(0)) {
  return rows(
    "select public.generate_reminders(($1||'T12:00:00Z')::timestamptz)",
    [day],
  );
}
async function deadline(h: string) {
  return (
    await rows<{ id: string; revision: number; completed_at: string | null }>(
      "select * from deadlines where hackathon_id=$1",
      [h],
    )
  )[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("reset role;truncate users,auth.users cascade;");
  for (let i = 0; i < ids.length; i++)
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        ids[i],
        `${["avansh", "rahul", "priya", "aman", "riya", "admin"][i]}@example.test`,
        JSON.stringify({
          full_name: ["Avansh", "Rahul", "Priya", "Aman", "Riya", "Admin"][i],
        }),
      ],
    );
  await db.exec(
    `update users set active=true;update users set global_member=true where name in ('Avansh','Rahul');update users set role='viewer' where name='Riya';update users set role='admin' where name='Admin';`,
  );
});
afterAll(async () => {
  await db.close();
});
describe("real PostgreSQL membership and reminder workflows", () => {
  it("includes creator, globals and selected users once; never unselected users", async () => {
    const h = await create();
    expect(
      (
        await rows<{ user_id: string }>(
          "select user_id from hackathon_members where hackathon_id=$1",
          [h],
        )
      )
        .map((x) => x.user_id)
        .sort(),
    ).toEqual([avansh, rahul, priya, aman].sort());
    await generate();
    expect(
      (await rows<{ user_id: string }>("select user_id from notifications"))
        .map((x) => x.user_id)
        .sort(),
    ).toEqual([avansh, rahul, priya, aman].sort());
    expect(
      await rows(
        "select * from notification_preferences where not in_app or not calendar or email",
      ),
    ).toHaveLength(0);
  });
  it("deduplicates simultaneous/repeated jobs with persistent unique history", async () => {
    await create();
    await Promise.all([generate(), generate(), generate()]);
    expect(await rows("select * from notifications")).toHaveLength(4);
  });
  it("sends 3-day, tomorrow, today and overdue once to each active member", async () => {
    await create(date(3));
    for (const day of [date(0), date(2), date(3), date(4), date(5)])
      await generate(day);
    const counts = await rows<{ stage: string; count: number }>(
      "select stage,count(*)::int as count from notifications group by stage order by stage",
    );
    expect(counts).toEqual([
      { stage: "0", count: 4 },
      { stage: "1", count: 4 },
      { stage: "3", count: 4 },
      { stage: "overdue", count: 4 },
    ]);
  });
  it("removal cancels pending delivery; new active members receive the applicable stage", async () => {
    const h = await create();
    await db.exec("update notification_preferences set email=true");
    await generate();
    await mutate(priya, "member", {
      hackathon_id: h,
      user_id: aman,
      active: false,
    });
    expect(
      (
        await rows<{ email_status: string }>(
          "select email_status from notifications where user_id=$1",
          [aman],
        )
      )[0].email_status,
    ).toBe("cancelled");
    await mutate(priya, "member", {
      hackathon_id: h,
      user_id: riya,
      active: true,
    });
    await generate();
    expect(
      await rows("select * from notifications where user_id=$1", [riya]),
    ).toHaveLength(1);
    await generate(date(2));
    expect(
      await rows("select * from notifications where user_id=$1 and stage='1'", [
        aman,
      ]),
    ).toHaveLength(0);
  });
  it("deactivated users are excluded even if membership stays active", async () => {
    await create();
    await db.query("update users set active=false where id=$1", [aman]);
    await generate();
    expect(
      await rows("select * from notifications where user_id=$1", [aman]),
    ).toHaveLength(0);
  });
  it("completes atomically, audits actor, stops reminders, optionally informs all members once", async () => {
    const h = await create(),
      d = await deadline(h);
    await db.exec("update notification_preferences set email=true");
    await generate();
    const input = {
      hackathon_id: h,
      id: d.id,
      url: "https://example.com/slides",
      notes: "Ready",
      notify: true,
    };
    await mutate(priya, "submit", input);
    await mutate(aman, "submit", input);
    expect((await deadline(h)).completed_at).not.toBeNull();
    expect(
      (
        await rows<{ submitted_by: string }>(
          "select submitted_by from submissions",
        )
      )[0].submitted_by,
    ).toBe(priya);
    expect(
      await rows(
        "select * from activity_logs where action='Submission completed'",
      ),
    ).toHaveLength(1);
    expect(
      await rows("select * from notifications where stage='completed'"),
    ).toHaveLength(4);
    expect(
      await rows(
        "select * from notifications where stage='3' and email_status='cancelled'",
      ),
    ).toHaveLength(4);
    await generate(date(2));
    expect(
      await rows("select * from notifications where stage='1'"),
    ).toHaveLength(0);
  });
  it("rejects viewers and outsiders without any partial submission writes", async () => {
    const h = await create(),
      d = await deadline(h);
    await mutate(priya, "member", {
      hackathon_id: h,
      user_id: riya,
      active: true,
    });
    await expect(
      mutate(riya, "submit", { hackathon_id: h, id: d.id }),
    ).rejects.toThrow("read-only");
    await mutate(priya, "member", {
      hackathon_id: h,
      user_id: aman,
      active: false,
    });
    await expect(
      mutate(aman, "submit", { hackathon_id: h, id: d.id }),
    ).rejects.toThrow("membership");
    expect(await rows("select * from submissions")).toHaveLength(0);
    expect((await deadline(h)).completed_at).toBeNull();
  });
  it("date changes alert the whole team once, bump revision, and cancel old pending alerts", async () => {
    const h = await create(),
      d = await deadline(h);
    await db.exec("update notification_preferences set email=true");
    await generate();
    await mutate(priya, "deadline", {
      hackathon_id: h,
      id: d.id,
      due_date: date(5),
    });
    await mutate(priya, "deadline", {
      hackathon_id: h,
      id: d.id,
      due_date: date(5),
    });
    expect((await deadline(h)).revision).toBe(2);
    expect(
      await rows("select * from notifications where stage='changed'"),
    ).toHaveLength(4);
    expect(
      await rows(
        "select * from notifications where revision=1 and email_status='cancelled'",
      ),
    ).toHaveLength(4);
    await generate(date(2));
    expect(
      await rows("select * from notifications where revision=2 and stage='3'"),
    ).toHaveLength(4);
  });
  it("task reminders go only to assignee, never global members or opted-in admin", async () => {
    const h = await create();
    await db.exec("update notification_preferences set admin_critical=true");
    await mutate(priya, "task", {
      hackathon_id: h,
      title: "Finalize demo",
      assigned_to: aman,
      due_date: date(1),
    });
    await generate();
    const notices = await rows<{ user_id: string }>(
      "select user_id from notifications where task_id is not null",
    );
    expect(notices).toHaveLength(2);
    expect(notices.every((n) => n.user_id === aman)).toBe(true);
  });
  it("admin receives only opted-in critical deadline alerts without duplicates", async () => {
    const h = await create();
    await db.query(
      "update notification_preferences set admin_critical=true where user_id=$1",
      [admin],
    );
    await generate();
    expect(
      await rows("select * from notifications where user_id=$1", [admin]),
    ).toHaveLength(0);
    await generate(date(2));
    expect(
      await rows("select * from notifications where user_id=$1", [admin]),
    ).toHaveLength(1);
    await mutate(admin, "member", {
      hackathon_id: h,
      user_id: admin,
      active: true,
    });
    await generate(date(2));
    expect(
      await rows("select * from notifications where user_id=$1", [admin]),
    ).toHaveLength(1);
  });
  it("global membership is snapshotted; owners cannot remove it; changes affect future hackathons", async () => {
    const h = await create();
    await expect(
      mutate(priya, "member", {
        hackathon_id: h,
        user_id: rahul,
        active: false,
      }),
    ).rejects.toThrow("protected global");
    await mutate(admin, "user", {
      id: rahul,
      role: "member",
      active: true,
      global_member: false,
    });
    const h2 = await create();
    expect(
      await rows(
        "select * from hackathon_members where hackathon_id=$1 and user_id=$2",
        [h, rahul],
      ),
    ).toHaveLength(1);
    expect(
      await rows(
        "select * from hackathon_members where hackathon_id=$1 and user_id=$2",
        [h2, rahul],
      ),
    ).toHaveLength(0);
  });
  it("uses hackathon local dates, not server UTC dates", async () => {
    await mutate(priya, "create", {
      name: "Timezone test",
      organizer: "Test",
      timezone: "Asia/Kolkata",
      members: [],
      deadlines: [{ kind: "PPT", due_date: "2030-09-28" }],
    });
    await rows("select generate_reminders('2030-09-27T19:00:00Z')");
    expect(
      await rows("select * from notifications where stage='0'"),
    ).toHaveLength(3);
  });
  it("claim leases prevent two workers sending the same notification", async () => {
    await create();
    await db.exec("update notification_preferences set email=true");
    await generate();
    const first = await rows<{ id: string }>("select * from claim_email()"),
      second = await rows<{ id: string }>("select * from claim_email()");
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].id).not.toBe(second[0].id);
    await db.exec(
      "update notifications set first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 minute' where email_status='sending'",
    );
    await rows("select * from claim_email()");
    expect(
      await rows("select * from notifications where email_status='held'"),
    ).toHaveLength(2);
  });
  it("blocks direct client writes, privileged RPC calls, and unrelated hackathon reads through RLS", async () => {
    await create();
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [riya]);
    await db.exec("set role authenticated");
    expect(await rows("select * from hackathons")).toHaveLength(0);
    await expect(db.exec("update users set role='admin'")).rejects.toThrow(
      "permission denied",
    );
    await expect(rows("select generate_reminders()")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      rows("select mutate($1,$2,$3)", [priya, "create", "{}"]),
    ).rejects.toThrow("permission denied");
    await expect(rows("select * from calendar_connections")).rejects.toThrow(
      "permission denied",
    );
    await db.exec("reset role");
    await rows("select set_config('request.jwt.claim.sub',$1,false)", [priya]);
    await db.exec("set role authenticated");
    expect(await rows("select * from hackathons")).toHaveLength(1);
    await db.exec("reset role");
  });
  it("worker lock allows only one live owner and permits recovery after expiry", async () => {
    expect(
      (
        await rows<{ acquire_worker: boolean }>(
          "select acquire_worker($1,$2)",
          ["test", priya],
        )
      )[0].acquire_worker,
    ).toBe(true);
    expect(
      (
        await rows<{ acquire_worker: boolean }>(
          "select acquire_worker($1,$2)",
          ["test", aman],
        )
      )[0].acquire_worker,
    ).toBe(false);
    await db.exec(
      "update worker_locks set expires_at=now()-interval '1 minute'",
    );
    expect(
      (
        await rows<{ acquire_worker: boolean }>(
          "select acquire_worker($1,$2)",
          ["test", aman],
        )
      )[0].acquire_worker,
    ).toBe(true);
  });
});
